/**
 * 角色模块：minion.ts（爪牙阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType } from "../tag";
import { type Character } from "../model";
import { useDataStore } from "../../store/value";
import { randint, randpick } from "@/utils/utils";
import { logSkillResolution } from "../gameLog";
import { Faction, type IRole, _store, nearestAlive, pickGood } from "./model";

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
                    logSkillResolution(c.id, `使得#${obj?.id}（::${obj?.role}::）::poisoned::。`)
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
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
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
            c.limitSkill('skill', 1);
        },
        nightActionPriority(c) {
            return 5;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (t !== Time.makeTime(2, Time.Phase.Night) && t !== Time.makeTime(3, Time.Phase.Night)) return;
            if (!c.allowUseSkill('skill')) return;
            if (t === Time.makeTime(2, Time.Phase.Night)) {
                if (randint(0, 1) === 0) {
                    return;
                }
            }
            if (c.isAwake('Assassin')) {
                const obj = pickGood(dataStore.charList())[0];
                logSkillResolution(c.id, `刺杀了 #${obj?.id}（::${obj?.role}::）。`);
                c.useSkill('skill');
                obj?.addTag('dying', {
                    till: Time.makeTime(2, Time.Phase.Dawn),
                    source: c.id,
                    meta: { force: true, type: 'assassin' },
                })
            } else {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
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
        nightActionPriority() {
            return 9;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (!c.isAwake('DemonAdvocate')) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }
            const evilList = dataStore.charList().filter(
                x => x.isTrulyEvil() && !x.hasTag(TagType.executionImmune) && !x.hasTag(TagType.dead)
            );
            if (evilList.length === 0) {
                c.info.push('没有可保护的::evil::。');
                return
            }
            const target = randpick(evilList).items[0]!;
            target.addTag(TagType.executionImmune, {
                till: Time.makeTime(Time.getDay(t) + 1, Time.Phase.Dawn),
                meta: { day: Time.getDay(t) },
            });
            logSkillResolution(c.id, `保护了 #${target.id}（::${target.role}::）免于处决。`);
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
            _store.set(c.id, 0);
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
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }
            const deadOutsiders = dataStore.charList().filter(
                x => x.getRoleDetail().faction === Faction.outsider && x.hasTag(TagType.dead)
            ).length;
            const lastCount = _store.get(c.id) ?? 0;
            if (deadOutsiders > lastCount) {
                _store.set(c.id, deadOutsiders);
                const target = pickGood(dataStore.charList())[0];
                logSkillResolution(c.id, `由于白天有::outsider::死亡，教父杀死了 #${target?.id}（::${target?.role}::）`)
                target?.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'night' },
                });
            }
        },
    },
} satisfies Record<string, IRole>;
