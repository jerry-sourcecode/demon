/**
 * 角色模块：minion.ts（爪牙阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType, isProtected, makeProtect } from "../tag";
import { type Character } from "../model";
import { useDataStore } from "../../store/value";
import { randint, randpick } from "@/utils/utils";
import { logSkillResolution, logAnnouncement } from "../gameLog";
import { Faction, Alignment, type IRole, playerData, nearestAlive, pickGood } from "./model";

export const minionRoles = {
    Poisoner: {
        display: '下毒者',
        faction: Faction.minion,
        ability: '每个夜晚，你周围的::kind::会::poisoned::直到下一个黄昏。',
        abnormal: {
            overall: "你的技能不会生效。"
        },
        nightActionPriority() {
            return 10;
        },
        onNightSkill(c, t) {
            function fn(obj: Character) {
                if (!obj.isTrulyEvil()) {
                    logSkillResolution(c.id, `使得 #${obj?.id}（::${obj?.role}::）::poisoned::。`)
                    obj.addTag(TagType.confused, {
                        till: Time.makeTime(Time.getDay(t), Time.Phase.Dusk),
                        source: c.id,
                    });
                }
            }
            const dataStore = useDataStore();
            const sz = dataStore.chars.size;
            if (c.isAwake('Poisoner')) {
                fn(nearestAlive(c, 'cw')!);
                fn(nearestAlive(c, 'ccw')!);
            } else {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
            }
        },
    },
    Assassin: {
        display: '刺客',
        faction: Faction.minion,
        summery: '“……”',
        ability: '在第二晚和第三晚中的随机一个晚上，会有随机一名::kind::（优先选择::villager::），他死亡，即使任何原因导致他不会死亡。',
        abnormal: {
            overall: "不会有人死亡。"
        },
        onStart(c) {
            c.registerLimitSkill('assassinKill', 1);
        },
        nightActionPriority(c) {
            return 5;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (t !== Time.makeTime(2, Time.Phase.Night) && t !== Time.makeTime(3, Time.Phase.Night)) return;
            if (!c.allowUseSkill('assassinKill')) return;
            if (t === Time.makeTime(2, Time.Phase.Night)) {
                if (randint(0, 1) === 0) {
                    return;
                }
            }
            if (c.isAwake('Assassin')) {
                const obj = pickGood(dataStore.charList())[0];
                logSkillResolution(c.id, `刺杀了 #${obj?.id}（::${obj?.role}::）。`);
                c.useSkill('assassinKill');
                obj?.addTag(TagType.dead, {
                    at: Time.makeTime(2, Time.Phase.Dawn),
                    source: c.id,
                    meta: { force: true, type: 'assassin' },
                })
            } else {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
            }
        },
    },
    DemonAdvocate: {
        display: '魔鬼代言人',
        faction: Faction.minion,
        summery: '“如果异议被驳回，我的委托人将进行无罪申辩，理由是控方不遵守法规第27章B条——针对动词进行非正确或误导性的词形变化。昨晚有九名陪审团成员死亡，这个事实只不过是表面证据，正如威尔斯诉图勒案所开创的先例，这是无罪释放的进一步理由。”',
        ability: '每个夜晚，随机一名存活::evil::（与上个夜晚不同）：如果明天白天他被处决，他不会死亡。',
        abnormal: {
            overall: "该玩家被处决时仍会死亡。"
        },
        onStart(c) {
            // 记录上个夜晚保护的目标，用于保证与上个夜晚不同
            playerData.set(c.id, 0);
        },
        nightActionPriority() {
            return 9;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (!c.isAwake('DemonAdvocate')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            const prevId = playerData.get(c.id) ?? 0;
            const evilList = dataStore.charList().filter(
                x => x.isTrulyEvil() && !x.isDead()
            );

            // 与上个夜晚选择的目标不同；若排除后没有候选，则本晚不保护任何人
            const candidates = prevId ? evilList.filter(x => x.id !== prevId) : evilList;
            if (candidates.length === 0) {
                logSkillResolution(c.id, '没有可保护的::evil::。');
                return;
            }
            const target = randpick(candidates).items[0]!;
            playerData.set(c.id, target.id);
            target.addTag(TagType.protect, {
                till: Time.makeTime(Time.getDay(t) + 1, Time.Phase.Dawn),
                source: c.id,
                meta: makeProtect({ kind: 'dayExecute', day: Time.getDay(t) }),
            });
            logSkillResolution(c.id, `保护了 #${target.id}（::${target.role}::）免于处决。`);
        },
        afterTagAdd(c, tg) {
            // 魔鬼代言人死后，其给予的所有保护立即失效
            if (tg.type === TagType.dead) {
                const dataStore = useDataStore();
                dataStore.chars.forEach(x => {
                    if (x.getTag(TagType.protect).some(t => t.source === c.id)) {
                        x.tags = x.tags.filter(
                            t => !(t.type === TagType.protect && t.source === c.id),
                        );
                    }
                });
                logSkillResolution(c.id, '魔鬼代言人死亡，所有保护立即失效。');
            }
        },
    },
    Baron: {
        display: '男爵',
        faction: Faction.minion,
        summery: '这个小镇没救了，不是么？廉价的外来劳动力……这就是问题所在。要我说，我会把他们全部调配到矿井里。不过是稍有些困难的工作，这不会伤害到任何人，要是有人提出反对意见就赏他一记耳光。这就是所谓的底线，不是么？',
        ability: '会有额外的::outsider::在场。[+2::outsider::]',
        abnormal: {
            overall: "+2::outsider::始终会生效。",
        },
        onStart(c) {
            logSkillResolution(c.id, '增加了两个::outsider::。');
        },
        onAdjustCounts(counts) {
            counts.outsider += 2;
            counts.villager -= 2;
        },
    },
    GodFather: {
        display: '教父',
        faction: Faction.minion,
        summery: '“通常来说，这只是件小事。但在你侮辱我女儿时，你就侮辱了我。你侮辱我，就侮辱了我的家族。你真的应该更小心些——要是你不幸发生意外事故，那就太遗憾了。”',
        ability: '游戏开始时+1::outsider::，若有::outsider::死亡，当天晚上，随机一名::kind::（优先选择::villager::）死亡。',
        abnormal: {
            overall: "不会有玩家死亡。但是+1::outsider::始终会生效。"
        },
        onStart(c) {
            playerData.set(c.id, 0);
        },
        onAdjustCounts(counts) {
            counts.outsider += 1;
            counts.villager -= 1;
        },
        nightActionPriority() {
            return 7;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (!c.isAwake('GodFather')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            const deadOutsiders = dataStore.charList().filter(
                x => x.getRoleDetail().faction === Faction.outsider && x.isDead()
            ).length;
            const lastCount = playerData.get(c.id) ?? 0;
            if (deadOutsiders > lastCount) {
                playerData.set(c.id, deadOutsiders);
                const target = pickGood(dataStore.charList())[0];
                logSkillResolution(c.id, `由于白天有::outsider::死亡，教父杀死了 #${target?.id}（::${target?.role}::）`)
                target?.addTag(TagType.dead, {
                    at: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'night' },
                });
            }
        },
    },
    Vixen: {
        display: '狐媚娘',
        faction: Faction.minion,
        summery: '“王上，妾身有两个妹妹，一个名为喜媚，一个名为琵琶。”',
        ability: `首夜，会有一名与你邻近的::kind::：如果你死于处决且场上没有剩余的::evil::，他立即转变为邪恶阵营。`,
        abnormal: {
            overall: "不会有玩家转变为邪恶阵营。",
        },
        nightActionPriority() {
            return 6;
        },
        onNightSkill(c, t) {
            if (Time.getDay(t) !== 1) return;
            const dataStore = useDataStore();
            // 首个夜晚：选择一名与你邻近的善良玩家作为目标（顺时针/逆时针最近存活的 kind 中随机一个）
            const neighbors = [nearestAlive(c, 'cw'), nearestAlive(c, 'ccw')].filter(
                (x): x is Character => !!x && !x.isEvil() && x.id !== c.id
            );
            if (neighbors.length > 0) {
                const target = randpick(neighbors).items[0]!;
                playerData.set(c.id, target.id);
                // 打上魅惑标记：击杀选择时按外来者同级处理（不优先击杀）
                target.addTag(TagType.unfavored, { source: c.id });
                logSkillResolution(c.id, `选择了邻近的 #${target.id}（::${target.role}::）作为目标。`);
            }
        },
        afterTagAdd(c, tg) {
            // 死于处决时，若场上没有剩余的邪恶玩家，邻近目标转变为邪恶阵营
            if (tg.type === TagType.dead && (tg.meta as any)?.type === 'execute') {
                if (!c.isAwake('Vixen')) {
                    logSkillResolution(c.id, '由于::confused::，目标未转变为邪恶阵营。');
                    return;
                }
                const dataStore = useDataStore();
                // 仅当狐媚娘是最后一名存活邪恶玩家时，目标才转变为邪恶阵营
                const otherEvilAlive = dataStore.charList().some(
                    x => x.isTrulyEvil() && x.id !== c.id && !x.isDead()
                );
                if (otherEvilAlive) {
                    logSkillResolution(c.id, '场上仍有其他邪恶玩家，没有玩家转变为邪恶阵营。');
                    return;
                }
                const targetId = playerData.get(c.id);
                const target = targetId ? dataStore.chars.get(targetId) : undefined;
                if (target && !target.isDead()) {
                    target.alignment = Alignment.evil;
                    logSkillResolution(c.id, `由于狐媚娘被处决且场上没有剩余的::evil::，#${target.id}（::${target.role}::）转变为邪恶阵营。`);
                }
            }
        },
    },
    Seducer: {
        display: '蛊惑者',
        faction: Faction.minion,
        summery: '“凝视我的眼眸，你会忘记白天所见的每一张脸。”',
        ability: '每个夜晚，随机一名存活::kind::被视为::evil::，直到下一个::dawn::。',
        abnormal: {
            overall: "不会有玩家被视为邪恶。",
        },
        nightActionPriority() {
            return 8;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (!c.isAwake('Seducer')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            // 随机一名存活善良玩家，使其被视为邪恶直到下一个黎明（误导信息，甚至引导处决自己人）
            const target = pickGood(dataStore.charList())[0];
            if (target) {
                target.addTag(TagType.tempted, {
                    till: Time.makeTime(Time.getDay(t) + 1, Time.Phase.Dawn),
                    source: c.id,
                });
                logSkillResolution(c.id, `蛊惑了 #${target.id}（::${target.role}::），使其被视为::evil::直到下一个黎明。`);
            }
        },
    },
    Extortionist: {
        display: '勒索者',
        faction: Faction.minion,
        summery: '“想要真相？先付代价。”',
        ability: '每个夜晚，随机一名存活玩家（可以是自己）：他第二天无法发动主动技能，也无法被处决。',
        abnormal: {
            overall: "不会有玩家被封锁。",
        },
        nightActionPriority() {
            return 8;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (!c.isAwake('Extortionist')) {
                logSkillResolution(c.id, '由于::confused::，技能未能生效。');
                return;
            }
            // 随机一名存活玩家，次日无法发动主动技能、也无法被处决
            const alive = dataStore.charList().filter(x => !x.isDead());
            if (alive.length > 0) {
                const target = randpick(alive).items[0]!;
                target.addTag(TagType.blocked, {
                    till: Time.makeTime(Time.getDay(t) + 1, Time.Phase.Dawn),
                    source: c.id,
                });
                logSkillResolution(c.id, `勒索了 #${target.id}（::${target.role}::），他次日无法行动也无法被处决。`);
                logAnnouncement(`#${target.id}（::${target.role}::）被勒索者封锁：次日无法发动主动技能，也无法被处决。`);
            }
        },
    }
} satisfies Record<string, IRole>;
