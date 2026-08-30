/**
 * 角色模块：demon.ts（恶魔阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType } from "../tag";
import { useDataStore } from "../../store/value";
import { randpick } from "@/utils/utils";
import { logSkillResolution } from "../gameLog";
import { Faction, type IRole, playerData, pickGood } from "./model";
import { type Character } from "../model";

/** 查找角色 c 指定方向（cw 顺时针 / ccw 逆时针）最近的一名存活镇民 */
function nearestVillagerDir(c: Character, dir: 'cw' | 'ccw'): Character | undefined {
    const dataStore = useDataStore();
    const sz = dataStore.playerNumber();
    const maxDist = sz - 1;
    for (let i = 1; i <= maxDist; i++) {
        const id = dir === 'cw' ? (c.id + i).wrap(sz) : (c.id - i).wrap(sz);
        const ch = dataStore.chars.get(id);
        if (ch && ch.getRoleDetail().faction === Faction.villager && !ch.isDead()) return ch;
    }
    return undefined;
}

export const demonRoles = {
    Imp: {
        display: '小恶魔',
        faction: Faction.demon,
        ability: '第二个晚上起，会有随机一名::kind::（优先选择::villager::）死亡。当你死亡时，一名爪牙会变成小恶魔。',
        abnormal: {
            overall: "不会有玩家死亡，也不会有爪牙变成小恶魔。",
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (Time.getDay(t) < 2) return;
            if (!c.isAwake('Imp')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag(TagType.dead, {
                    at: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'demon' },
                });
            }
        },
        afterTagAdd(c, tg) {
            if (tg.type === TagType.dead) {
                if (c.isAwake('Imp')) {
                    const dataStore = useDataStore();
                    const minions = dataStore.charList().filter(
                        x => x.getRoleDetail().faction === Faction.minion && !x.isDead()
                    );
                    if (minions.length > 0) {
                        const successor = randpick(minions).items[0]!;
                        const oldRole = successor.role;
                        successor.role = 'Imp';
                        logSkillResolution(c.id, `死亡后，#${successor.id}（::${oldRole}::）变成了新的小恶魔。`);
                    }
                } else {
                    logSkillResolution(c.id, '由于::confused::，死亡后没有爪牙继承。');
                }
            }
        },
    },
    Pukka: {
        display: '普卡',
        faction: Faction.demon,
        summery: `“您人真好，发生了这样的事情，您还愿意让我来您金碧辉煌的家里做客。我很抱歉，刚才不小心划伤了您。这是一点点赔礼，没事的，请收下吧，把这根金牙签当做我那卑微的歉意吧。”`,
        ability: '每个夜晚，随机一名::kind::（优先::villager::）：他::poisoned::。上个因你的能力::poisoned::的玩家会死亡并恢复健康。',
        abnormal: {
            overall: "你的技能不会生效，但此前被::poisoned::的玩家仍会死亡并恢复健康。",
        },
        onStart(c) {
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();

            const day = Time.getDay(t);
            const prevId = playerData.get(c.id);

            // 上个被下毒的目标死亡并恢复
            if (prevId && prevId !== 0) {
                const prev = dataStore.chars.get(prevId);
                if (prev && !prev.isDead()) {
                    prev.clearTags(TagType.confused);
                    logSkillResolution(c.id, `#${prevId} 因毒素发作而死亡并恢复健康。`);
                    prev.addTag(TagType.dead, {
                        at: Time.makeTime(day, Time.Phase.Dawn),
                        source: c.id,
                        meta: { type: 'demon' },
                    });
                }
                playerData.set(c.id, 0);
            }

            if (!c.isAwake('Pukka')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }

            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `使 #${target.id} ::poisoned::。`);
                target.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                playerData.set(c.id, target.id);
            }
        },
        afterTagAdd(c, tg) {
            if (tg.type === TagType.dead) {
                const targetId = playerData.get(c.id);
                if (targetId && targetId !== 0) {
                    const target = useDataStore().chars.get(targetId);
                    if (target) {
                        target.clearTags(TagType.confused);
                        logSkillResolution(c.id, `死亡后，#${targetId} 的毒素解除。`);
                    }
                }
            }
        },
    },
    Po: {
        display: '珀',
        faction: Faction.demon,
        ability: '::nfNight::，若没有充能，进行一次充能，否则，消耗充能，随机三名::kind::（优先::villager::）死亡。',
        abnormal: {
            overall: "充能或释放不会生效。",
        },
        onStart(c) {
            // 使用独立的充能计数键，避免与伪装角色的 skill 键冲突
            c.registerLimitSkill('poCharge', 1);
            c.useSkill('poCharge'); // 初始充能为 0
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (Time.getDay(t) < 2) return;

            if (!c.isAwake('Po')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }

            if (!c.allowUseSkill('poCharge')) {
                // 仅重置自己的充能计数，避免重置伪装角色的限次技能
                c.resetSkill('poCharge');
                logSkillResolution(c.id, '完成一次充能。');
            } else {
                c.useSkill('poCharge');
                const targets = pickGood(dataStore.charList(), 3);
                const killed = targets.map(t => t.id).sort((a, b) => a - b);
                if (killed.length > 0) {
                    logSkillResolution(c.id, `释放充能，杀死了 ${killed.map(id => `#${id}`).join('、')}。`);
                }
                for (const target of targets) {
                    target.addTag(TagType.dead, {
                        at: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                        source: c.id,
                        meta: { type: 'demon' },
                    });
                }
            }
        },
    },
    Vigormortis: {
        display: '亡骨魔',
        faction: Faction.demon,
        ability: '::nfNight::，随机一名::kind::（优先::villager::）：他死亡。第一个死亡的爪牙保留他的能力，且与他邻近的两名镇民之一::poisoned::，当晚你无法行动。[-1::outsider::]',
        abnormal: {
            overall: "不会有玩家死亡，爪牙能力也不会保留。",
        },
        onStart(c) {
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onAdjustCounts(counts) {
            counts.outsider -= 1;
            counts.villager += 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (Time.getDay(t) < 2) return;

            let justGained = false;
            const storedId = playerData.get(c.id) ?? 0;

            // 检测首个爪牙死亡（仅触发一次）
            if (storedId === 0) {
                if (!c.isAwake('Vigormortis')) {
                    playerData.set(c.id, -1);  // 永久标记：混乱导致能力流失
                    logSkillResolution(c.id, '由于::confused::，爪牙能力永久流失。');
                    return;
                }
                const deadMinion = dataStore.charList().find(
                    x => x.getRoleDetail().faction === Faction.minion && x.isDead()
                );
                if (deadMinion) {
                    playerData.set(c.id, deadMinion.id);
                    deadMinion.addTag(TagType.gained, {
                        till: Time.FAR_FUTURE,
                        meta: [deadMinion.role],
                    });
                    justGained = true;
                    const sz = dataStore.playerNumber();
                    const cw = dataStore.chars.get((deadMinion.id + 1).wrap(sz));
                    const ccw = dataStore.chars.get((deadMinion.id - 1).wrap(sz));
                    const adjacent = [cw, ccw].filter(
                        x => x && x.getRoleDetail().faction === Faction.villager && !x.isDead()
                    );
                    if (adjacent.length > 0) {
                        const victim = randpick(adjacent).items[0]!;
                        logSkillResolution(c.id, `#${deadMinion.id} 死亡后，#${victim.id} ::poisoned::。`);
                        victim.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                    }
                    logSkillResolution(c.id, `#${deadMinion.id} 保留了能力，今晚暂停杀戮。`);
                }
            }

            // 后续夜的混乱检查
            if (!c.isAwake('Vigormortis')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }

            // 杀戮（保留之夜跳过）
            if (justGained) return;

            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag(TagType.dead, {
                    at: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'demon' },
                });
            }
        },
    },
    Lleech: {
        display: '痢蛭',
        faction: Faction.demon,
        summery: '“美味，美味，美味，美味，美味，美味，美味，美味的脑——馅儿饼！是的。美味的老馅儿饼。我想说的就是这个。”',
        ability: `::nfNight::，随机一名存活::kind::（::villager::优先）：他死亡。在首个夜晚，会有随机一名存活的::kind::作为宿主：他::poisoned::，只有当他处于死亡状态时痢蛭才能够死亡。每个白天，你可以选择一名玩家，若他是宿主，他死亡；否则你声望 -4。`,
        abnormal: {
            overall: "不会有玩家死亡；痢蛭失去保护，即使宿主存活，痢蛭也可能死亡。",
        },
        onStart(c) {
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            const day = Time.getDay(t);

            if (day === 1) {
                // 首个夜晚：选择一名存活善良玩家作为宿主并使其中毒（即使异常也生效）
                const host = pickGood(dataStore.charList())[0];
                if (host) {
                    playerData.set(c.id, host.id);// 打上宿主标记：击杀选择时按外来者同级处理（不优先击杀，保护痢蛭免疫）
                    host.addTag(TagType.unfavored, { source: c.id }); host.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                    logSkillResolution(c.id, `选择了 #${host.id}（::${host.role}::）作为宿主并使其::poisoned::。`);
                }
                return;
            }

            // 非首夜：随机一名存活善良玩家（镇民优先）死亡
            if (!c.isAwake('Lleech')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag(TagType.dead, {
                    at: Time.makeTime(day, Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'demon' },
                });
            }
        },
        beforeTagAdd(c, tg) {
            // 宿主存活时，清醒（非神志不清/伪装）的痢蛭不会死亡；异常的痢蛭不享受免疫
            if (tg.type === TagType.dead && c.isAwake('Lleech')) {
                const hostId = playerData.get(c.id);
                const host = hostId ? useDataStore().chars.get(hostId) : undefined;
                if (host && !host.isDead()) {
                    logSkillResolution(c.id, `宿主 #${hostId} 仍存活，::Lleech::不会死亡。`);
                    return false;
                }
            }
            return true;
        },
    },
    Zombuul: {
        display: '僵怖',
        faction: Faction.demon,
        summery: '“我不。明白。你的。方式。人类。同类。向我。指引。泥土。那是。圣地。静卧。安睡。我也。必须。长眠。立刻。”',
        ability: `::nfNight::，随机一名存活::kind::（::villager::优先）：他死亡。当你首次死亡时，你仍被当作存活，仍会有玩家因为僵怖在晚上死亡，且由于你仍然存活，善良玩家无法获胜，直到你再次死亡。`,
        abnormal: {
            overall: "当晚不会由玩家因为僵怖死亡。若僵怖死亡时僵怖::abnormal::，则僵怖会立即完全死亡。",
        },
        onStart(c) {
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            const day = Time.getDay(t);

            if (day === 1) return; // 首夜不触发

            // 非首夜：随机一名存活善良玩家（镇民优先）死亡
            if (!c.isAwake('Zombuul')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag(TagType.dead, {
                    at: Time.makeTime(day, Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'demon' },
                });
            }
        },
        beforeTagAdd(c, tg) {
            if (tg.type === TagType.dead && c.isAwake('Zombuul')) {
                if (c.hasTag(TagType.alive)) {
                    logSkillResolution(c.id, `::Zombuul::再次死亡。`);
                    c.clearTags(TagType.alive);
                    return true;
                }
                else {
                    c.addTag(TagType.alive, { till: Time.FAR_FUTURE });
                    logSkillResolution(c.id, `::Zombuul::进入活死人状态。`);
                }
            }
            return true;
        },
    },
    NoDashi: {
        display: '诺-达鲺',
        faction: Faction.demon,
        summery: '“彼因汝之罪孽，吾已嗅汝之恶臭满溢全身。时日曷丧？予及汝皆亡。竖子命如草芥，以吾之力，使汝终末于深海，终于此良夜。”',
        ability: '::nfNight::，会有一名玩家（::villager::优先）：他死亡。与你邻近的两名::villager::::poisoned::。',
        abnormal: {
            overall: "不会有玩家死亡，也不会有人::poisoned::。",
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            const day = Time.getDay(t);

            if (!c.isAwake('NoDashi')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }

            if (day == 1) {
                const victims = [nearestVillagerDir(c, 'cw'), nearestVillagerDir(c, 'ccw')].filter(
                    (x): x is Character => !!x
                );
                for (const v of victims) {
                    v.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                }
                if (victims.length > 0) {
                    logSkillResolution(c.id, `使邻近的::villager:: #${victims.map(v => v.id).join('、#')} ::poisoned::。`);
                }
            }

            // 杀戮：第二天起随机一名玩家（镇民优先）死亡
            else {
                const target = pickGood(dataStore.charList())[0];
                if (target) {
                    logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                    target.addTag(TagType.dead, {
                        at: Time.makeTime(day, Time.Phase.Dawn),
                        source: c.id,
                        meta: { type: 'demon' },
                    });
                }
            }
        },
    },
    Obliterator: {
        display: '湮灭者',
        faction: Faction.demon,
        summery: '“纵使万劫不复，亦教汝等一同归墟。”',
        ability: '::nfNight::，会有两名::kind::（优先::villager::）：若这两名玩家直到下一个夜晚都没有死亡，他们死亡。',
        abnormal: {
            overall: "不会有玩家被标记，也不会有玩家因此死亡。",
        },
        onStart(c) {
            // 0 表示上一晚没有标记；两个标记 id 编码为 id1*100 + id2
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            const day = Time.getDay(t);

            if (day === 1) return; // 首夜不行动

            if (!c.isAwake('Obliterator')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }

            // 结算上一晚标记的两名玩家：若两人直到这个夜晚都未死亡，则两人都死亡；
            // 只要其中一人死亡，技能便不生效，另一人也存活
            const prev = playerData.get(c.id) ?? 0;
            if (prev !== 0) {
                const id1 = Math.floor(prev / 100);
                const id2 = prev % 100;
                const p1 = id1 ? dataStore.chars.get(id1) : undefined;
                const p2 = id2 ? dataStore.chars.get(id2) : undefined;
                const bothAlive = !!p1 && !!p2 && !p1.isDead() && !p2.isDead();
                if (bothAlive) {
                    logSkillResolution(c.id, `被标记的 #${id1} 与 #${id2} 都存活，两人死亡。`);
                    for (const p of [p1, p2]) {
                        p!.addTag(TagType.dead, {
                            at: Time.makeTime(day, Time.Phase.Dawn),
                            source: c.id,
                            meta: { type: 'demon' },
                        });
                    }
                } else {
                    logSkillResolution(c.id, `被标记的 #${id1} 与 #${id2} 中有人已死亡，技能未生效。`);
                }
            }

            // 标记两名新的存活善良玩家（镇民优先，pickGood 已排除真正邪恶/死亡）
            const targets = pickGood(dataStore.charList(), 2);
            if (targets.length === 2) {
                const a = targets[0]!;
                const b = targets[1]!;
                playerData.set(c.id, a.id * 100 + b.id);
                logSkillResolution(c.id, `标记了 #${a.id}（::${a.role}::）和 #${b.id}（::${b.role}::）。`);
            }
        },
    }
} satisfies Record<string, IRole>;
