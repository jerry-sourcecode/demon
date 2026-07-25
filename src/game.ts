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
/** 将 count 个随机 factionA 角色替换为不在场的 factionB 角色 */
function swapRoles(from: Faction, to: Faction, count: number) {
    const dataStore = useDataStore();
    const allTo = allRoleKeys().filter(k => RoleMap[k].faction === to);
    const presentTo = new Set(
        dataStore.charList().filter(c => c.getRoleDetail().faction === to).map(c => c.role)
    );
    let absent = allTo.filter(r => !presentTo.has(r));
    const targets = randpick(
        dataStore.charList().filter(c => c.getRoleDetail().faction === from), count
    ).items;
    for (const t of targets) {
        if (absent.length === 0) break;
        t.role = randpick(absent).items[0]!;
        absent = absent.filter(r => r !== t.role);
    }
}

export async function start(opts?: {
    villager?: number; outsider?: number; minion?: number; demon?: number;
}) {
    const vc = opts?.villager ?? 5;
    const oc = opts?.outsider ?? 2;
    const mc = opts?.minion ?? 1;
    const dc = opts?.demon ?? 1;
    const dataStore = useDataStore();

    dataStore.initCounts = { villager: vc, outsider: oc, minion: mc, demon: dc };
    dataStore.reputation = 15;

    let player: RoleType[] = [];
    player.push(...pickRoles(Faction.villager, vc));
    player.push(...pickRoles(Faction.outsider, oc));
    player.push(...pickRoles(Faction.minion, mc));
    player.push(...pickRoles(Faction.demon, dc));
    player = shuffle(player);

    let idx = 0;
    let disguiseRoleList = [...pickRoles(Faction.villager, 5), ...randpick(allRoleKeys(), 2, (x) => RoleMap[x].faction === Faction.outsider && x !== 'Drunk').items]
    player.forEach(x => {
        idx++;
        const c = new Character(idx, x);
        dataStore.chars.set(idx, c);
        if (c.isEvil() && c.role !== 'Recluse') {
            const { items, indices } = randpick(disguiseRoleList)
            c.addTag(TagType.disguise, { meta: items[0]! });
            disguiseRoleList.splice(indices[0]!, 1);
        }
    })

    const emitter = useEmitter();

    // ── 定版：根据角色的 onAdjustCounts 调整外来者/镇民数量 ──
    const netCounts = { villager: vc, outsider: oc };
    dataStore.chars.forEach(c => {
        runFn(RoleMap[c.role]?.onAdjustCounts, netCounts);
    });
    const delta = netCounts.outsider - oc;
    if (delta > 0) {
        swapRoles(Faction.villager, Faction.outsider, delta);
    } else if (delta < 0) {
        swapRoles(Faction.outsider, Faction.villager, -delta);
    }

    // ── Tab 面板初始化 ──

    // 可能的邪恶身份：恶魔 + 1个不在场恶魔 + 真实爪牙 + 1个不在场爪牙
    const allMinionKeys = allRoleKeys().filter(k => RoleMap[k].faction === Faction.minion);
    const allDemonKeys = allRoleKeys().filter(k => RoleMap[k].faction === Faction.demon);
    let actualEvil = dataStore.charList()
        .filter(c => c.isEvilByEvil())
        .map(c => c.role);

    // 混淆恶魔
    const absentDemon = allDemonKeys.filter(k => !actualEvil.includes(k));
    if (absentDemon.length > 0) {
        actualEvil.push(randpick(absentDemon, 1).items[0]!);
    }

    // 混淆爪牙
    const absentMinion = allMinionKeys.filter(k => !actualEvil.includes(k));
    if (absentMinion.length > 0) {
        actualEvil.push(randpick(absentMinion, 1).items[0]!);
    }

    actualEvil = shuffle(actualEvil);
    actualEvil.sort((a, b) => {
        if (RoleMap[a].faction === RoleMap[b].faction) {
            return a < b ? 1 : -1;
        } else {
            if (RoleMap[a].faction === Faction.minion) return -1;
            return 1;
        }
    })
    dataStore.initPossibleEvil(actualEvil);

    // 计算范围
    // 爪牙：mc 个中取最大/最小 mc 个调整量之和
    const minionAdj: number[] = [];
    const demonAdj: number[] = [];
    actualEvil.forEach(role => {
        const adj = { villager: vc, outsider: oc };
        runFn(RoleMap[role]?.onAdjustCounts, adj);
        const delta = adj.outsider - oc;
        const fac = RoleMap[role]?.faction;
        if (fac === Faction.minion) {
            minionAdj.push(delta);
        } else if (fac === Faction.demon) {
            demonAdj.push(delta);
        }
    });
    minionAdj.sort((a, b) => b - a);
    demonAdj.sort((a, b) => b - a);

    const maxExtra = minionAdj.slice(0, mc).reduce((s, x) => s + x, 0) + (demonAdj[0] ?? 0);
    const minExtra = minionAdj.slice(-mc).reduce((s, x) => s + x, 0) + (demonAdj.at(-1) ?? 0);
    dataStore.villagerMin = Math.max(0, vc - maxExtra);
    dataStore.villagerMax = Math.max(0, vc - minExtra);
    dataStore.outsiderMin = Math.max(0, oc + minExtra);
    dataStore.outsiderMax = Math.max(0, oc + maxExtra);

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
                if (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained)) return;
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
                if (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained)) return;
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
                    if (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained)) return;
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