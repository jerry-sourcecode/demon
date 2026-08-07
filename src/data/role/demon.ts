/**
 * 角色模块：demon.ts（恶魔阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType } from "../tag";
import { useDataStore } from "../../store/value";
import { randpick } from "@/utils/utils";
import { logSkillResolution } from "../gameLog";
import { Faction, type IRole, _store, pickGood } from "./model";

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
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }
            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
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
                        x => x.getRoleDetail().faction === Faction.minion && !x.hasTag(TagType.dead)
                    );
                    if (minions.length > 0) {
                        const successor = randpick(minions).items[0]!;
                        const oldRole = successor.role;
                        successor.role = 'Imp';
                        logSkillResolution(c.id, `死亡后，#${successor.id}（::${oldRole}::）变成了新的小恶魔。`);
                    }
                } else {
                    logSkillResolution(c.id, '由于神志不清，死亡后没有爪牙继承。');
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
            _store.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();

            const day = Time.getDay(t);
            const prevId = _store.get(c.id);

            // 上个被下毒的目标死亡并恢复
            if (prevId && prevId !== 0) {
                const prev = dataStore.chars.get(prevId);
                if (prev && !prev.hasTag(TagType.dead)) {
                    prev.clearTags(TagType.confused);
                    logSkillResolution(c.id, `#${prevId} 因毒素发作而死亡并恢复健康。`);
                    prev.addTag('dying', {
                        till: Time.makeTime(day, Time.Phase.Dawn),
                        source: c.id,
                        meta: { type: 'demon' },
                    });
                }
                _store.set(c.id, 0);
            }

            if (!c.isAwake('Pukka')) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }

            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `使 #${target.id} ::poisoned::。`);
                target.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                _store.set(c.id, target.id);
            }
        },
        afterTagAdd(c, tg) {
            if (tg.type === TagType.dead) {
                const targetId = _store.get(c.id);
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
            _store.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (Time.getDay(t) < 2) return;

            if (!c.isAwake('Po')) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }

            const charge = _store.get(c.id) ?? 0;

            if (charge < 1) {
                _store.set(c.id, 1);
                logSkillResolution(c.id, '充能（0→1）。');
            } else {
                _store.set(c.id, 0);
                const targets = pickGood(dataStore.charList(), 3);
                const killed = targets.map(t => t.id).sort();
                if (killed.length > 0) {
                    logSkillResolution(c.id, `释放充能，杀死了 ${killed.map(id => `#${id}`).join('、')}。`);
                }
                for (const target of targets) {
                    target.addTag('dying', {
                        till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
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
            _store.set(c.id, 0);
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

            let justRetained = false;
            const storedId = _store.get(c.id) ?? 0;

            // 检测首个爪牙死亡（仅触发一次）
            if (storedId === 0) {
                if (!c.isAwake('Vigormortis')) {
                    _store.set(c.id, -1);  // 永久标记：混乱导致能力流失
                    logSkillResolution(c.id, '由于神志不清，爪牙能力永久流失。');
                    return;
                }
                const deadMinion = dataStore.charList().find(
                    x => x.getRoleDetail().faction === Faction.minion && x.hasTag(TagType.dead)
                );
                if (deadMinion) {
                    _store.set(c.id, deadMinion.id);
                    deadMinion.addTag(TagType.retained, { till: Time.FAR_FUTURE });
                    justRetained = true;
                    const sz = dataStore.playerNumber();
                    const cw = dataStore.chars.get((deadMinion.id + 1).wrap(sz));
                    const ccw = dataStore.chars.get((deadMinion.id - 1).wrap(sz));
                    const adjacent = [cw, ccw].filter(
                        x => x && x.getRoleDetail().faction === Faction.villager && !x.hasTag(TagType.dead)
                    );
                    if (adjacent.length > 0) {
                        const victim = randpick(adjacent).items[0]!;
                        logSkillResolution(c.id, `#${deadMinion.id} 死亡后，#${victim.id} 中毒。`);
                        victim.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                    }
                    logSkillResolution(c.id, `#${deadMinion.id} 保留了能力，今晚暂停杀戮。`);
                }
            }

            // 后续夜的混乱检查
            if (!c.isAwake('Vigormortis')) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }

            // 杀戮（保留之夜跳过）
            if (justRetained) return;

            const target = pickGood(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'demon' },
                });
            }
        },
    }
} satisfies Record<string, IRole>;
