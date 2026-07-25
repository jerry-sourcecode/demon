import { useEmitter } from "./store/emit";
import { Character, Faction, pickRoles, RoleMap, shuffle, type RoleType } from "./data/model";
import { useDataStore } from "./store/value";
import { Time } from "./utils/time";
import { allRoleKeys, randpick, runFn, sleep } from "./utils/utils";
import { TagType } from "./data/tag";
import { logGameStart, logPhaseChange, logGameEnd } from "./data/gameLog";

/** 检查游戏是否结束 */
function checkGameEnd(dataStore: ReturnType<typeof useDataStore>, emitter: ReturnType<typeof useEmitter>): boolean {
    // 圣徒等角色可能已通过 onExecuted 直接触发 game-end，同步给循环
    if (dataStore.gameOver) return true;
    const evilAlive = dataStore.evilAlive;
    if (evilAlive.length === 0) {
        dataStore.gameOver = true;
        logGameEnd(true);
        emitter.emit('game-end', true);
        return true;
    }
    if (dataStore.reputation <= 0) {
        dataStore.reputation = 0;
        dataStore.gameOver = true;
        logGameEnd(false);
        emitter.emit('game-end', false);
        return true;
    }
    return false;
}
export async function start(opts?: {
    villager?: number; outsider?: number; minion?: number; demon?: number;
}) {
    const vc = opts?.villager ?? 6;
    const oc = opts?.outsider ?? 1;
    const mc = opts?.minion ?? 1;
    const dc = opts?.demon ?? 1;
    const dataStore = useDataStore();

    dataStore.initCounts = { villager: vc, outsider: oc, minion: mc, demon: dc };
    dataStore.reputation = 15;

    let player: RoleType[] = [];
    player.push(...pickRoles(Faction.villager, vc), 'soldier', 'innkeeper');
    player.push(...pickRoles(Faction.outsider, oc));
    player.push(...pickRoles(Faction.minion, mc));
    player.push(...pickRoles(Faction.demon, dc));
    player = shuffle(player);

    let idx = 0;
    let disguiseRoleList = [...pickRoles(Faction.villager, 4), ...pickRoles(Faction.outsider, 1)];
    player.forEach(x => {
        idx++;
        const c = new Character(idx, x);
        dataStore.chars.set(idx, c);
        if (c.isEvil() && c.role !== 'recluse') {
            const { items, indices } = randpick(disguiseRoleList)
            c.addTag(TagType.disguise, { meta: items[0]! });
            disguiseRoleList.splice(indices[0]!, 1);
        }
    })

    const emitter = useEmitter();

    // 教父/男爵：将 n 位随机镇民替换为不在场外来者
    const godFatherCount = dataStore.charList().filter(c => c.role === 'godFather').length;
    const baronCount = dataStore.charList().filter(c => c.role === 'baron').length;
    const replacerCount = godFatherCount + baronCount * 2;
    if (replacerCount > 0) {
        const allOutsiders = allRoleKeys().filter(k => RoleMap[k].faction === Faction.outsider);
        const presentOutsiders = new Set(
            dataStore.charList()
                .filter(c => c.getRoleDetail().faction === Faction.outsider)
                .map(c => c.role)
        );
        let absent = allOutsiders.filter(r => !presentOutsiders.has(r));

        const villagerTargets = randpick(
            dataStore.charList().filter(c => c.getRoleDetail().faction === Faction.villager),
            replacerCount
        ).items;

        for (const target of villagerTargets) {
            if (absent.length === 0) break;
            const newRole = randpick(absent).items[0]!;
            target.role = newRole;
            absent = absent.filter(r => r !== newRole);
        }
    }

    // 记录初始发牌
    const initRoles: Record<number, RoleType> = {};
    dataStore.chars.forEach((c, id) => { initRoles[id] = c.role; });
    logGameStart(initRoles);

    emitter.emit('game-start');

    dataStore.chars.forEach(x => {
        runFn(RoleMap[x.role].onStart, x)
        const tg = x.getTag(TagType.disguise)[0];
        if (tg) runFn(RoleMap[tg.meta].onStart, x)
    });

    let gameEnded = false;
    while (!gameEnded) {
        dataStore.nextTime();
        logPhaseChange();

        if (checkGameEnd(dataStore, emitter)) {
            gameEnded = true;
            break;
        }

        if (Time.getPhase(dataStore.time) === Time.Phase.Night) {
            const order: { prio: number, c: Character, role: RoleType }[] = [];
            dataStore.chars.forEach(x => {
                if (x.hasTag(TagType.dead)) return;
                let prio = runFn(x.getRoleDetail().nightActionPriority, x);
                if (prio) order.push({ prio, c: x, role: x.role });
                if (x.hasTag(TagType.disguise)) {
                    const dis_role = x.getTag(TagType.disguise)[0]!.meta;
                    prio = runFn(RoleMap[dis_role].nightActionPriority, x);
                    if (prio) order.push({ prio, c: x, role: dis_role });
                }
            })
            order.sort((a, b) => b.prio - a.prio);
            for (const x of order) {
                await runFn(RoleMap[x.role].onTimeChange, x.c, dataStore.time);
            }
        } else {
            dataStore.chars.forEach(x => {
                if (x.hasTag(TagType.dead)) return;
                runFn(RoleMap[x.displayRole].onTimeChange, x, dataStore.time);
                const tg = x.getTag(TagType.disguise)[0];
                if (tg) runFn(RoleMap[tg.meta].onTimeChange, x, dataStore.time);
            })
            if (Time.getPhase(dataStore.time) === Time.Phase.Day) {
                dataStore.resetActionPoints();
                while (dataStore.actionPoints > 0 && !dataStore.gameOver) {
                    await emitter.emit('wait-for-action')
                    // 每次操作后立即检查胜负
                    if (checkGameEnd(dataStore, emitter)) {
                        gameEnded = true;
                        break;
                    }
                }
            } else {
                let needMove = false;
                dataStore.chars.forEach(x => {
                    if (x.hasTag(TagType.dead)) return;
                    if (runFn(RoleMap[x.displayRole].canActivateSkill, x, dataStore.time)) {
                        needMove = true;
                    }
                })
                if (needMove && !dataStore.gameOver) {
                    await emitter.emit('wait-for-action')
                    // 操作后立即检查胜负
                    if (checkGameEnd(dataStore, emitter)) {
                        gameEnded = true;
                    }
                }
            }
        }

        // 每轮结束再次检查（处决可能导致立即结束）
        if (!gameEnded) {
            if (checkGameEnd(dataStore, emitter)) {
                gameEnded = true;
            }
        }
        await sleep(0.3);
    }
}