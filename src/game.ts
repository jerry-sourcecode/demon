import { useEmitter } from "./store/emit";
import { Character, Faction, pickRoles, RoleMap, shuffle, type RoleType } from "./data/model";
import { useDataStore } from "./store/value";
import { Time } from "./utils/time";
import { allRoleKeys, randpick, runFn, sleep } from "./utils/utils";
import { TagType } from "./data/tag";
export async function start() {
    const dataStore = useDataStore();

    dataStore.reputation = 15;

    let player: RoleType[] = [];
    player.push(...pickRoles(Faction.villager, 6));
    player.push(...pickRoles(Faction.outsider, 1));
    player.push(...pickRoles(Faction.minion, 1));
    player.push(...pickRoles(Faction.demon, 1));
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

    emitter.emit('game-start');

    dataStore.chars.forEach(x => {
        runFn(RoleMap[x.role].onStart, x)
        const tg = x.getTag(TagType.disguise)[0];
        if (tg) runFn(RoleMap[tg.meta].onStart, x)
    });

    while (dataStore.time <= 51) {
        dataStore.nextTime();
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
            order.forEach(x => {
                runFn(RoleMap[x.role].onTimeChange, x.c, dataStore.time);
            })
        } else {
            dataStore.chars.forEach(x => {
                if (x.hasTag(TagType.dead)) return;
                runFn(RoleMap[x.displayRole].onTimeChange, x, dataStore.time);
                const tg = x.getTag(TagType.disguise)[0];
                if (tg) runFn(RoleMap[tg.meta].onTimeChange, x, dataStore.time);
            })
            if (Time.getPhase(dataStore.time) === Time.Phase.Day) {
                dataStore.resetActionPoints();
                while (dataStore.actionPoints > 0) {
                    await emitter.emit('wait-for-action')
                }
            } else {
                let needMove = false;
                dataStore.chars.forEach(x => {
                    if (x.hasTag(TagType.dead)) return;
                    if (runFn(RoleMap[x.displayRole].canActivateSkill, x, dataStore.time)) {
                        needMove = true;
                    }
                })
                if (needMove) {
                    await emitter.emit('wait-for-action')
                }
            }
        }
        await sleep(1);
    }
}