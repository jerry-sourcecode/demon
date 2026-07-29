import { Time } from "../utils/time";
import { type ITag, TagType } from "./tag";
import { shuffle, type Character, pickKindPreferVillager } from "./model";
import { useDataStore } from "../store/value";
import { useEmitter } from "../store/emit";
import { allRoleKeys, randint, randpick, swap } from "@/utils/utils";
import { ref } from "vue";
import { logReputationChange, logSkillResolution, logGameEnd, logSkillActivate } from "./gameLog";
import { callAi } from "@/utils/ai";

export interface IRole {
    display: string,
    faction: Faction,
    summery?: string,
    // 异常情况
    abnormal?: {
        // 针对所有异常
        overall?: string,
        // 针对 伪装
        disguise?: string,
        // 针对 神志不清（中毒/醉酒）
        confused?: string
    },
    /** 能力详情的 markdown 描述（支持 ::key:: 关键词语法） */
    ability: string,
    /** 标记角色是否需要 AI（未配置 AI 时该角色不会出现在角色池） */
    requiresAI?: boolean,
    /** 判断当前是否可以发动主动技能（无参，内部通过 useDataStore() 获取全局状态） */
    canActivateSkill?: (c: Character, t: Time.TimeNumber) => boolean,
    /** 夜间行动优先级，越大越先行动 */
    nightActionPriority?: (c: Character) => number,
    /** 夜间技能（优先级排序执行） */
    onNightSkill?: (c: Character, t: Time.TimeNumber) => void,
    /** 释放主动技能时，返回 false 表示取消/失败 */
    onActiveSkill?: (c: Character) => boolean | void | Promise<boolean | void>,
    /** 回忆时 */
    onRecall?: (c: Character) => void,
    /** 时间改变时（无优先级，阶段切换触发） */
    onTimeChange?: (c: Character, t: Time.TimeNumber) => void,
    /** 游戏开始时 */
    onStart?: (c: Character) => void;
    /** 被施加 Tag 前触发，返回 false 阻止添加 */
    beforeTagAdd?: (c: Character, tg: ITag) => boolean;
    /** 被施加 Tag 后触发（副作用） */
    afterTagAdd?: (c: Character, tg: ITag) => void;
    /** 被移除 Tag 时触发，返回 false 阻止移除 */
    onTagRemove?: (c: Character, tg: ITag) => boolean;
    /** 被处决时触发，返回 false 阻止处决 */
    onExecuted?: (c: Character) => boolean;
    /** 调整初始阵营数量显示（如男爵 +2 外来者 -2 镇民） */
    onAdjustCounts?: (counts: { villager: number; outsider: number }) => void;
}

export const Faction = {
    /** 镇民 */
    villager: "villager",
    /** 外来者 */
    outsider: "outsider",
    /** 爪牙 */
    minion: "minion",
    /** 恶魔 */
    demon: "demon",
    unknown: "unknown"
} as const;

export type Faction = typeof Faction[keyof typeof Faction];

/** 阵营（善良/邪恶），与角色类型独立 */
export const Alignment = {
    good: "good",
    evil: "evil",
} as const;

export type Alignment = typeof Alignment[keyof typeof Alignment];

const _store = new Map<number, number>();

const roles = {
    unknown: {
        display: '失忆者',
        faction: Faction.unknown,
        ability: `你可以通过::recall::来得知该玩家是什么角色。`
    },
    // 镇民
    Alchemist: {
        display: '炼金术士',
        faction: Faction.villager,
        ability: `
        在::dawn::或::dusk::，你可以::clean::与你::distance::3的玩家中::confused::的玩家。每局仅一次。

        你会得知有多少玩家受到了你的影响。

        你始终保持::awake::。
        `,
        abnormal: {
            overall: "你的技能不会生效，且会获得错误的信息。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.hasRecalled() && c.allowUseSkill('skill') && (Time.getPhase(t) === Time.Phase.Dawn || Time.getPhase(t) === Time.Phase.Dusk);
        },
        onActiveSkill(c) {
            const dataStore = useDataStore();
            const sz = dataStore.playerNumber();
            const bg = ((c.id) - 3).wrap(sz), ed = (c.id + 3).wrap(sz);
            let cnt = 0;
            const cleansed: number[] = [];
            for (let i = bg; i != (ed + 1).wrap(sz); i = (i + 1).wrap(sz)) {
                const x = dataStore.chars.get(i);
                if (x?.hasTag(TagType.confused)) { cnt++; cleansed.push(x.id); }
                x?.clearTags(TagType.confused);
            }
            c.useSkill('skill');
            c.info.push(`有 ${cnt} 位玩家受到了我的影响。`)
            logSkillResolution(c.id, cleansed.length > 0
                ? `净化了 ${cleansed.map(id => `#${id}`).join('、')}`
                : '未找到可净化的目标');
            return true;
        },
        beforeTagAdd(_, tg) {
            if (tg.type === TagType.confused) return false;
            return true;
        },
    },
    Soldier: {
        display: "士兵",
        faction: Faction.villager,
        summery: "帝国最忠贞的护卫。",
        ability: "不会在夜里死亡。",
        abnormal: {
            overall: "仍会正常死亡。",
        },
        onTimeChange(c, t) {
            if (Time.getPhase(t) === Time.Phase.Night) {
                c.addTag(TagType.protect, {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn)
                });
            }
        }
    },
    Nun: {
        display: "修女",
        faction: Faction.villager,
        ability: "::recall::时，她总是会回答：愿圣光见证，我的灵魂洁白如雪。",
        abnormal: {
            overall: "她会回答：我……我有点晕。"
        },
        onRecall(c) {
            if (!c.hasTag(TagType.confused, TagType.disguise)) {
                c.info.push('愿圣光见证，我的灵魂洁白如雪。');
            } else {
                c.info.push("我……我有点晕。");
            }
        },
    },
    Architect: {
        display: "建筑师",
        faction: Faction.villager,
        ability: `
        ::recall::时，你会得知哪半边的::evil::更多。
        
        计算时会将中间的玩家计入。
        `,
        abnormal: {
            overall: "会得知错误的信息。"
        },
        onRecall(c) {
            const dataStore = useDataStore();
            const half = Math.ceil((dataStore.playerNumber() + 1) / 2)
            let cnt_l = ref(0), cnt_r = ref(0);
            for (let i = 1; i <= half; i++) {
                if (dataStore.chars.get(i)?.isEvil()) {
                    cnt_r.value++;
                }
            }
            for (let i = half + 1; i <= dataStore.playerNumber(); i++) {
                if (dataStore.chars.get(i)?.isEvil()) {
                    cnt_l.value++;
                }
            }
            if (dataStore.chars.get(1)?.isEvil()) cnt_r.value++;

            if (!c.isAwake('Architect')) {
                if (cnt_l.value !== cnt_r.value) {
                    if (randint(0, 3)) {
                        swap(cnt_l, cnt_r);
                    }
                    else {
                        cnt_l.value = cnt_r.value
                    }
                } else {
                    cnt_l.value += 1 - 2 * randint(0, 1);
                }
            }

            if (cnt_l.value > cnt_r.value) {
                c.info.push("左半圈::evil::更多。");
            } else if (cnt_r.value > cnt_l.value) {
                c.info.push("右半圈::evil::更多。");
            } else {
                c.info.push("左右半圈::evil::数量相同。");
            }
        },
    },
    Farmer: {
        display: "农夫",
        faction: Faction.villager,
        ability: `::recall::时，如果可能，1名失忆的::villager::会变成新的农夫，并得知原来的身份。`,
        abnormal: {
            overall: "得知正确的原来的身份，不会有人变成农夫。"
        },
        onRecall(c) {
            if (c.hasTag(TagType.farmer)) {
                c.info.push(`我原来是${RoleMap[c.getTag(TagType.farmer)[0]!.meta].display}`)
            }
            if (!c.isAwake('Farmer')) {
                logSkillResolution(c.id, '由于神志不清，未能传承。');
                return;
            }
            const dataStore = useDataStore();
            let x;
            try {
                x = randpick(dataStore.charList(), 1, (c) => c.getRoleDetail().faction === Faction.villager && !c.hasRecalled() && !c.hasTag(TagType.farmer)).items[0]!;
            }
            catch {
                return;
            }
            x.addTag(TagType.farmer, { meta: x.role })
            const oldRole = x.role;
            x.role = 'Farmer';
            logSkillResolution(c.id, `#${x.id}（::${oldRole}::）变成了新的农夫`);
        },
    },
    Nurse: {
        display: "护士",
        faction: Faction.villager,
        ability: `白天时，你可以选择得知与你最近的::confused::的玩家与你的距离。每局游戏限两次。`,
        abnormal: {
            overall: "得知随机一位::awake::的玩家与你的距离。"
        },
        onStart(c) {
            c.limitSkill('skill', 2);
        },
        canActivateSkill(c, t) {
            if (Time.getPhase(t) === Time.Phase.Day) {
                return c.allowUseSkill('skill');
            }
            return false;
        },
        onActiveSkill(c) {
            const data = useDataStore();
            const sz = data.playerNumber();
            const max = Math.floor(sz / 2);
            let dist = -1;

            const awake = [-1];

            for (let i = 1; i <= max; i++) {
                const cw = (c.id + i).wrap(sz);
                const ccw = (c.id - i).wrap(sz);
                if (data.chars.get(cw)?.hasTag(TagType.confused) ||
                    data.chars.get(ccw)?.hasTag(TagType.confused)) {
                    dist = i;
                    break;
                }
                if (!data.chars.get(cw)?.hasTag(TagType.confused) ||
                    !data.chars.get(ccw)?.hasTag(TagType.confused)) {
                    awake.push(i);
                }
            }

            if (c.hasTag(TagType.confused, TagType.disguise)) {
                if (dist === -1) dist = randint(1, max);
                else {
                    dist = awake[randint(0, awake.length - 1)]!;
                }
            }

            if (dist === -1) {
                c.info.push("没有找到::confused::的玩家。");
                logSkillResolution(c.id, '未找到混乱的玩家');
            } else {
                c.info.push(`与你最近的::confused::的玩家与你的距离为 ${dist}。`);
                logSkillResolution(c.id, `最近的混乱玩家距离为 ${dist}`);
            }

            c.useSkill('skill');
            return true;
        }
    },
    Professor: {
        display: "教授",
        faction: Faction.villager,
        ability: `白天，你可以选择一名死亡玩家，若该玩家为::villager::，使其复活、::awake::并重新宣称身份。每局游戏限一次。`,
        abnormal: {
            overall: "无事发生。"
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            if (Time.getPhase(t) === Time.Phase.Day) {
                return c.allowUseSkill('skill');
            }
            return false;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', { filter: (ch) => ch.hasTag(TagType.dead), count: 1 });
            if (!x) return false;
            c.useSkill('skill');
            const obj = x[0]!;
            if (obj.getRoleDetail().faction !== Faction.villager) {
                c.info.push(`对 #${obj.id} 发动复活失败。`);
                logSkillResolution(c.id, `对 #${obj.id} 发动复活失败（非镇民）`);
            }
            else if (!c.hasTag(TagType.confused, TagType.disguise)) {
                obj.clearTags(TagType.confused)
                obj.clearTags(TagType.dead);
                obj.addTag(TagType.recall);
                c.info.push(`复活了 #${obj.id}（::${obj.role}::）。`);
                logSkillResolution(c.id, `复活了 #${obj.id}（::${obj.role}::）`);
            } else {
                c.info.push(`对 #${obj.id} 发动复活失败。`);
                logSkillResolution(c.id, `对 #${obj.id} 发动复活失败（技能异常）`);
                return true;
            }
            return true;
        },
    },
    Bishop: {
        display: "主教",
        faction: Faction.villager,
        ability: `::recall::时，你获知三名玩家，其中一名是::villager::，一名是::outsider::，一名是::minion::。`,
        abnormal: {
            overall: "这三名玩家是随机选择的。"
        },
        onRecall(c) {
            const villager: number[] = [], outsider: number[] = [], minion: number[] = [];
            const dataStore = useDataStore();
            const player = [];
            dataStore.chars.forEach(c => {
                player.push(c.id);
                switch (RoleMap[c.role].faction) {
                    case Faction.villager:
                        villager.push(c.id);
                        break;
                    case Faction.outsider:
                        outsider.push(c.id);
                        break;
                    case Faction.minion:
                        minion.push(c.id);
                        break;
                }
            })
            let ls: number[] = [];
            const has = [];
            if (villager.length !== 0) {
                ls.push(randpick(villager).items[0]!);
                has.push('::villager::');
            }
            if (outsider.length !== 0) {
                ls.push(randpick(outsider).items[0]!);
                has.push('::outsider::');
            }
            if (minion.length !== 0) {
                ls.push(randpick(minion).items[0]!);
                has.push('::minion::');
            }
            ls = ls.sort();
            if (!c.isAwake('Bishop')) {
                const allIds = [...dataStore.chars.keys()];
                ls = (randpick(allIds, has.length).items).sort();
            }
            const sls: string[] = []
            ls.forEach((v) => sls.push(`#${v}`));
            c.info.push(`在${sls.join('、')}中，存在${has.join('、')}各一个。`)
        },
    },
    DreamBuilder: {
        display: "筑梦师",
        faction: Faction.villager,
        ability: `每个白天，你可以选择一名玩家，然后得知两个角色，该玩家是其中一个角色。`,
        abnormal: {
            overall: "两个角色均不属于该玩家。"
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        onTimeChange(c, t) {
            if (Time.getPhase(t) === Time.Phase.Dawn) {
                c.resetSkill('skill');
            }
        },
        canActivateSkill(c, t) {
            if (Time.getPhase(t) === Time.Phase.Day) {
                if (c.allowUseSkill('skill')) return true;
            }
            return false;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', { count: 1 });
            if (!x) return false;
            c.useSkill('skill');
            const obj = x[0]!;
            let ret = [];
            if (c.isAwake('DreamBuilder')) {
                ret.push(obj.role);
                if (randint(1, 3) === 1) {
                    ret.push(randpick(allRoleKeys()).items[0]);
                } else {
                    if (obj.hasTag('disguise')) ret.push(obj.getTag(TagType.disguise)[0]?.meta);
                    else ret.push(randpick(allRoleKeys(), 1, (it) => (RoleMap[it].faction === Faction.demon || RoleMap[it].faction === Faction.minion)).items[0]);
                }
            } else {
                ret.push(...randpick(allRoleKeys(), 2, (it) => it !== obj.role).items)
                if (obj.hasTag('disguise')) ret[0] = obj.getTag(TagType.disguise)[0]?.meta;
            }
            ret = shuffle(ret);
            ret = ret.map((it) => `::${it}::`);
            c.info.push(`玩家 #${obj.id} 是${ret.join('、')}其中之一。`)
            c.useSkill('skill');
            logSkillResolution(c.id, `得知 #${obj.id} 的身份线索，是${ret.join('、')}其中之一。`);
            return true;
        },
    },
    Druid: {
        display: '德鲁伊',
        faction: Faction.villager,
        ability: `
        白天，选择三名玩家，得知其中::outsider::的身份，或得知没有::outsider::。每局游戏限两次。

        ::Recluse::不会被视作::outsider::。`,
        abnormal: {
            overall: "你可能会获得错误线索。"
        },
        onStart(c) {
            c.limitSkill('skill', 2);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', { count: 3 });
            if (!x) return false;
            c.useSkill('skill');
            shuffle(x);
            let ans: undefined | RoleType = undefined;
            for (let i = 0; i <= 2; i++) {
                if (x[i]?.getRoleDetail().faction === Faction.outsider && !(x[i]?.role === 'Recluse')) {
                    ans = x[i]?.role;
                }
            }
            if (!c.isAwake('Druid')) {
                for (let i = 0; i <= 2; i++) {
                    if (x[i]?.hasTag('disguise')) {
                        const dis_role = x[i]?.getTag('disguise')[0]?.meta as RoleType;
                        if (RoleMap[dis_role].faction === Faction.outsider && dis_role !== ans) {
                            ans = dis_role;
                            break;
                        }
                    }
                }
                if (randint(1, 3) === 1) ans = randpick(allRoleKeys(), 1, (it) => RoleMap[it].faction === Faction.outsider && it !== ans).items[0];
                else ans = undefined;
            }
            x.sort((a, b) => a.id - b.id);
            if (ans !== undefined) {
                c.info.push(`在 ${x.map(a => `#${a.id}`).join('、')} 中存在::${ans}::。`)
                logSkillResolution(c.id, `在 ${x.map(a => `#${a.id}`).join('、')} 中发现了::${ans}::`);
            } else {
                c.info.push(`在 ${x.map(a => `#${a.id}`).join('、')} 中不存在::outsider::。`)
                logSkillResolution(c.id, `在 ${x.map(a => `#${a.id}`).join('、')} 中未发现外来者`);
            }
            return true;
        },
    },
    Empress: {
        display: '女皇',
        faction: Faction.villager,
        ability: '::recall::时，你会得知三名玩家，其中有且仅有一人是::evil::。',
        abnormal: {
            overall: "你会得知三名::kind::。"
        },
        onRecall(c) {
            const ans = [];
            const dataStore = useDataStore();
            if (c.isAwake('Empress')) {
                ans.push(...randpick(dataStore.charList(), 2, (it) => !it.isEvil()).items);
                ans.push(...randpick(dataStore.charList(), 1, (it) => it.isEvil()).items);
            } else {
                ans.push(...randpick(dataStore.charList(), 3, (it) => !it.isEvil()).items);
            }
            ans.sort((a, b) => a.id - b.id);
            c.info.push(`在 ${ans.map(x => `#${x.id}`).join('、')} 中，有且仅有一人是::evil::。`);
        },
    },
    Ascetic: {
        display: '修行者',
        faction: Faction.villager,
        ability: '::recall::时，你会得知离你最近的::evil::在你的哪个方向。你会得知顺时针、逆时针或距离相等。',
        abnormal: {
            overall: "你会得知随机一名::kind::在你的哪个方向。"
        },
        onRecall(c) {
            let ans = '';
            const dataStore = useDataStore();
            const sz = dataStore.playerNumber();
            if (c.isAwake('Ascetic')) {
                for (let i = 1; i <= Math.floor(sz / 2); i++) {
                    const lf = dataStore.chars.get((c.id + i).wrap(sz))?.isEvil();
                    const rt = dataStore.chars.get((c.id - i).wrap(sz))?.isEvil();
                    if (lf && rt) {
                        ans = '与你距离相等。';
                        break;
                    }
                    if (lf && !rt) {
                        ans = '在你的顺时针方向。';
                        break;
                    }
                    if (!lf && rt) {
                        ans = '在你的逆时针方向。';
                        break;
                    }
                }
                if (!ans) ans = '没有找到::evil::。';
            } else {
                // 异常：随机一名 kind 的方向
                if (dataStore.charList().some(ch => !ch.isEvil())) {
                    const target = randpick(dataStore.charList(), 1, ch => !ch.isEvil()).items[0]!;
                    const cw = (target.id - c.id).wrap(sz);
                    const ccw = (c.id - target.id).wrap(sz);
                    if (cw < ccw) ans = '在你的顺时针方向。';
                    else if (ccw < cw) ans = '在你的逆时针方向。';
                    else ans = '与你距离相等。';
                } else {
                    ans = '没有找到::kind::。';
                }
            }
            c.info.push(`离你最近的::evil::${ans}`);
        },
    },
    FortuneTeller: {
        display: '占卜师',
        faction: Faction.villager,
        ability: '每个白天，你可以选择两名玩家，得知其中是否有::evil::。会有一名::kind::作为宿敌，被你视作::evil::。',
        abnormal: {
            overall: "你会得知相反的信息。"
        },
        onStart(c) {
            const dataStore = useDataStore();
            const x = randpick(dataStore.charList(), 1, (x) => !x.isEvil()).items[0];
            x?.addTag(TagType.nemesis, { source: c.id });
            logSkillResolution(c.id, `#${x?.id} ::${x?.role}:: 是占卜师的宿敌。`)

            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        onTimeChange(c, t) {
            if (Time.getPhase(t) === Time.Phase.Dawn) {
                c.resetSkill('skill');
            }
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', { count: 2 });
            if (!x) return false;
            c.useSkill('skill');
            let ans = false;
            function isNemesis(ch: Character) {
                let ans = false;
                ch.getTag('nemesis').forEach(x => {
                    if (x.source === c.id) {
                        ans = true;
                    }
                })
                return ans;
            }
            x.forEach((c) => {
                if (c.isEvil() || (c.hasTag('nemesis') && isNemesis(c))) {
                    ans = true;
                }
            })
            if (!c.isAwake('FortuneTeller')) ans = !ans;
            x.sort((a, b) => a.id - b.id)
            c.info.push(`在 ${x.map(c => `#${c.id}`).join('、')} 中**${!ans ? '不' : ''}存在**::evil::。`)
            logSkillResolution(c.id, `在 ${x.map(c => `#${c.id}`).join('、')} 中${ans ? '发现' : '未发现'}邪恶`);
            return true;
        },
    },
    Empath: {
        display: '共情者',
        faction: Faction.villager,
        summery: '“我的皮肤有些刺痛。这有些不太对劲。我能感觉得到。”',
        ability: '每个夜晚，你会得知与你邻近的两名存活的玩家中::evil::的数量。',
        abnormal: {
            overall: "你会得知错误的数量。",
        },
        nightActionPriority() {
            return 0;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            const sz = dataStore.playerNumber();

            if (!c.hasRecalled()) return;

            let count = 0;
            let cw;
            for (let i = 1; i <= Math.floor(sz / 2); i++) {
                cw = dataStore.chars.get((c.id + i).wrap(sz));
                if (cw && !cw.hasTag(TagType.dead)) { count += cw.isEvil() ? 1 : 0; break; }
            }
            let ccw;
            for (let i = 1; i <= Math.floor(sz / 2); i++) {
                ccw = dataStore.chars.get((c.id - i).wrap(sz));
                if (ccw && !ccw.hasTag(TagType.dead)) { count += ccw.isEvil() ? 1 : 0; break; }
            }

            if (!c.isAwake('Empath')) {
                if (count === 0) count = 1 + randint(0, 1);
                else if (count === 2) count = randint(0, 1);
                else count = count === 1 ? (randint(0, 1) === 0 ? 0 : 2) : randint(0, 2);
            }

            c.info.push(`邻近两名存活玩家（#${cw?.id} 和 #${ccw?.id}）中有 ${count} 名::evil::。`);
            logSkillResolution(c.id, `感知到（#${cw?.id} 和 #${ccw?.id}）有 ${count} 名邪恶。`);
        },
    },
    Slayer: {
        display: '猎手',
        faction: Faction.villager,
        summery: '“受死吧。”',
        ability: '每局游戏限一次，你可以在白天时公开选择一名玩家：如果他是::evil::，他死亡。',
        abnormal: {
            overall: "你的技能不会生效。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', { count: 1, info: '::Slayer::：选择一名玩家，如果他是::evil::，他死亡。' });
            if (!x) return false;
            c.useSkill('skill');
            const obj = x[0]!;
            if (obj.isEvil() && c.isAwake('Slayer')) {
                logSkillResolution(c.id, `猎杀了 #${obj.id}（::${obj.role}::），其死亡。`);
                c.info.push(`猎杀 #${obj.id}，其死亡。`);
                obj.addTag('dead', { meta: { type: 'slayer' } });
            } else {
                c.info.push(`猎杀 #${obj.id}，无事发生。`);
                logSkillResolution(c.id, `对 #${obj.id} 发动，无事发生。`);
            }
            return true;
        },
    },
    Artist: {
        display: '艺术家',
        faction: Faction.villager,
        summery: '“天啊！多么美妙的作品！我的作品……用你们的话怎么说来着……对，璀璨夺目！栩栩如生！没错！”',
        ability: '每局游戏限一次，在白天时，你可以私下询问说书人一个是非问题，你会得知该问题的答案。',
        abnormal: {
            overall: '说书人可能给出错误的答案。',
        },
        requiresAI: true,
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const dataStore = useDataStore();

            // 循环直到得到有效答案或用户取消
            while (true) {
                const question = await emitter.emit('ask-question', {
                    info: '艺术家：请输入一个是非问题向说书人询问。',
                });
                if (question === null || question.trim() === '') {
                    return false; // 用户取消，不消耗行动点
                }

                // 构建游戏状态前提
                const premise = buildArtistPremise();

                // 调用 AI
                const aiConfig = dataStore.getAiConfig();
                if (!aiConfig) {
                    await emitter.emit('show-message', {
                        type: 'warning',
                        content: 'AI 未配置，无法回答问题。',
                    });
                    return false;
                }

                const answer = await callAi(
                    aiConfig.service,
                    aiConfig.apiKey,
                    aiConfig.model,
                    premise,
                    question,
                );

                const parsed = parseArtistAnswer(answer ?? '');

                if (parsed.answer === 'cannot_answer') {
                    // AI 无法回答，提示用户重新提问，不消耗技能
                    await emitter.emit('show-message', {
                        type: 'warning',
                        content: '说书人无法用"是"或"否"回答此问题，请换一个问题。',
                    });
                    continue;
                }

                // 消耗技能
                c.useSkill('skill');

                // 神志不清时反转（是↔否，不知道不变）
                let finalAnswer = parsed.answer;
                if (!c.isAwake('Artist')) {
                    if (parsed.answer === '是') finalAnswer = '否';
                    else if (parsed.answer === '否') finalAnswer = '是';
                }

                c.info.push(`我问说书人：「${question}」\n回答：${finalAnswer}`);
                logSkillResolution(
                    c.id,
                    `询问：「${question}」→ ${finalAnswer}${parsed.reason ? `（原因：${parsed.reason}）` : ''}${!c.isAwake('Artist') ? '（神志不清，已反转）' : ''}`,
                );
                return true;
            }
        },
    },
    Fisherman: {
        display: '渔夫',
        faction: Faction.villager,
        summery: '“这是这条河流里我最喜欢的一截儿……看看阳光是如何让一道彩虹横跨修道院和集市的？这是能让鱼儿长得肥美的最好的地方。我一天天变老，它们也一天天长大。”',
        ability: '每局游戏限一次，在白天时，你可以让说书人给你一些能帮助你的阵营获胜的建议。',
        abnormal: {
            overall: '说书人可能会给出误导性的建议。',
        },
        requiresAI: true,
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const dataStore = useDataStore();

            const premise = buildFishermanPremise();

            const aiConfig = dataStore.getAiConfig();
            if (!aiConfig) {
                await emitter.emit('show-message', {
                    type: 'warning',
                    content: 'AI 未配置，无法获取建议。',
                });
                return false;
            }

            const adviceGoal = c.isAwake('Fisherman')
                ? '请给我一些能帮助善良阵营获胜的策略建议。不需要完全基于事实，这是说书人认为对渔夫最有利的行动指引。'
                : '请给我一些误导性的、对善良阵营**有害的糟糕**建议。';

            const answer = await callAi(
                aiConfig.service,
                aiConfig.apiKey,
                aiConfig.model,
                premise,
                `作为说书人，给渔夫一些建议。\n${adviceGoal}`,
            );

            c.useSkill('skill');

            // 解析 JSON 回答 {"advice": "建议内容", "reason": "原因"}
            let advice = '（说书人沉默不语）';
            let reason = '';
            try {
                const jsonMatch = answer?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.advice) advice = parsed.advice;
                    if (parsed.reason) reason = parsed.reason;
                }
            } catch {
                advice = answer?.trim() ?? '（说书人沉默不语）';
            }

            const statusTag = !c.isAwake('Fisherman') ? '（神志不清，获得误导性建议）' : '';
            c.info.push(`说书人的建议：${advice}`);
            logSkillResolution(
                c.id,
                `获取建议${statusTag}。回答：${advice.substring(0, 60)}。原因：${reason.substring(0, 60)}`,
            );
            return true;
        },
    },
    Grandma: {
        display: '祖母',
        faction: Faction.villager,
        ability: '::recall::时，得知一名善良玩家及其角色，若该玩家死亡，祖母一同死亡。',
        abnormal: {
            overall: "你会得知一名邪恶玩家，若该玩家死亡，祖母不会死亡。"
        },
        onRecall(c) {
            let ans: Character, role: RoleType;
            const data = useDataStore();
            ans = randpick(data.charList(), 1, (ch) => !ch.isEvil() && ch.id !== c.id).items[0]!;
            role = ans.role;
            if (!c.isAwake('Grandma')) {
                ans = randpick(data.charList(), 1, (ch) => ch.isTrulyEvil() && ch.id !== c.id).items[0]!;
                role = ans.getTag(TagType.disguise)[0]?.meta!;
            }
            ans.addTag(TagType.grandson, { source: c.id });
            c.info.push(`#${ans.id} 是${RoleMap[role].display}。`)
        },
    },
    Monk: {
        display: '僧侣',
        faction: Faction.villager,
        ability: '::nfNight::，你要选择除你以外的一名玩家：当晚他不会死亡。',
        abnormal: {
            overall: "你仍需要选择玩家，但技能不会生效。",
        },
        nightActionPriority() {
            return 7;
        },
        async onNightSkill(c, t) {
            if (Time.getDay(t) === 1 || !c.hasRecalled()) return;

            const emitter = useEmitter();
            const chosen = await emitter.emit('select-player', {
                count: 1,
                info: '::Monk::：选择一名玩家，他今晚不会死亡。',
                required: true,
                filter: (x) => x.id !== c.id,
            });
            if (!chosen || chosen.length < 1) return;

            logSkillActivate(c.id);

            if (!c.isAwake('Monk')) {
                logSkillResolution(c.id, `选择了 #${chosen[0]!.id}，但是由于神志不清，技能未能生效。`);
                return;
            }

            const till = Time.makeTime(Time.getDay(t), Time.Phase.Dawn);
            chosen[0]!.addTag(TagType.protect, { till });
            logSkillResolution(c.id, `保护了 #${chosen[0]!.id}（::${chosen[0]!.role}::）。`);
        },
    },
    Innkeeper: {
        display: '旅店老板',
        faction: Faction.villager,
        ability: '::nfNight::，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个::dusk::。',
        abnormal: {
            overall: "你仍需要选择玩家，但技能不会生效。"
        }, nightActionPriority() {
            return 7;
        },
        async onNightSkill(c, t) {
            if (Time.getDay(t) === 1 || !c.hasRecalled()) return;

            const emitter = useEmitter();
            const chosen = await emitter.emit('select-player', {
                count: 2,
                info: '::Innkeeper::：选择两名玩家，他们今晚不会死亡，但其中一人会醉酒。',
                required: true,
            });
            if (!chosen || chosen.length < 2) return;

            logSkillActivate(c.id);

            if (!c.isAwake('Innkeeper')) {
                logSkillResolution(c.id, `选择了 #${chosen[0]!.id} 和 #${chosen[1]!.id}，但是由于神志不清，技能未能生效。`);
                return;
            }

            // 保护两名玩家当夜免疫死亡
            const till = Time.makeTime(Time.getDay(t), Time.Phase.Dawn);

            // 随机一人醉酒到下个黄昏
            const drunk = randpick(chosen).items[0]!;

            logSkillResolution(c.id,
                `保护了 #${chosen[0]!.id} 和 #${chosen[1]!.id}，#${drunk.id} 醉酒`);
            drunk.addTag(TagType.confused, {
                till: Time.makeTime(Time.getDay(t), Time.Phase.Dusk),
                source: c.id,
            });
            chosen[0]!.addTag(TagType.protect, { till });
            chosen[1]!.addTag(TagType.protect, { till });
        },
    },

    // ── 首夜 F4（第一夜信息角色）──
    Washerwoman: {
        display: '洗衣妇',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::villager::。`,
        abnormal: {
            overall: "你会得知错误的玩家或角色。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        nightActionPriority() {
            return 6;
        },
        onNightSkill(c, t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const dataStore = useDataStore();
            const inPlay = dataStore.charList().filter(
                x => x.id !== c.id && x.getRoleDetail().faction === Faction.villager
            );
            if (inPlay.length === 0) return;

            // 随机选取一个在场的镇民角色
            const target = randpick(inPlay).items[0]!;
            const targetRole = target.role;

            // 选取该玩家和另一名玩家组成对子
            const others = dataStore.charList().filter(x => x.id !== target.id && x.id !== c.id);
            if (others.length === 0) return;
            const other = randpick(others).items[0]!;
            const pair = shuffle([target, other]);

            if (!c.isAwake('Washerwoman')) {
                const wrongRole = randpick(allRoleKeys(), 1,
                    k => RoleMap[k].faction === Faction.villager && k !== targetRole
                ).items[0] ?? targetRole;
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::（实际::${targetRole}::）`);
            } else {
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::`);
            }
            c.useSkill('skill');
        },
    },
    Librarian: {
        display: '图书管理员',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::outsider::。（如果场上没有::outsider::，你会得知没有::outsider::。）`,
        abnormal: {
            overall: "你会得知错误的玩家或角色。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        nightActionPriority() {
            return 5;
        },
        onNightSkill(c, t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const dataStore = useDataStore();
            const outsiderChars = dataStore.charList().filter(
                x => x.id !== c.id && x.getRoleDetail().faction === Faction.outsider
            );

            if (outsiderChars.length === 0) {
                if (!c.isAwake('Librarian')) {
                    c.info.push('场上没有::outsider::。');
                    logSkillResolution(c.id, '得知场上没有外来者（异常：信息正确）');
                } else {
                    c.info.push('场上没有::outsider::。');
                    logSkillResolution(c.id, '得知场上没有::outsider::');
                }
                return;
            }

            const target = randpick(outsiderChars).items[0]!;
            const targetRole = target.role;
            const others = dataStore.charList().filter(x => x.id !== target.id && x.id !== c.id);
            if (others.length === 0) return;
            const other = randpick(others).items[0]!;
            const pair = shuffle([target, other]);

            if (!c.isAwake('Librarian')) {
                const wrongRole = randpick(allRoleKeys(), 1,
                    k => RoleMap[k].faction === Faction.outsider && k !== targetRole
                ).items[0] ?? targetRole;
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::（实际::${targetRole}::）`);
            } else {
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::`);
            }
            c.useSkill('skill');
        },
    },
    Investigator: {
        display: '调查员',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::minion::。若场上没有::minion::，你会得知没有::minion::。`,
        abnormal: {
            overall: "你会得知错误的玩家或角色。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        nightActionPriority() {
            return 4;
        },
        onNightSkill(c, t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const dataStore = useDataStore();
            const minionChars = dataStore.charList().filter(
                x => x.id !== c.id && x.getRoleDetail().faction === Faction.minion
            );

            if (minionChars.length === 0) {
                c.info.push('场上没有::minion::。');
                logSkillResolution(c.id, '得知场上没有::minion::。');
                return;
            }

            const target = randpick(minionChars).items[0]!;
            const targetRole = target.role;
            const others = dataStore.charList().filter(x => x.id !== target.id && x.id !== c.id);
            if (others.length === 0) return;
            const other = randpick(others).items[0]!;
            const pair = shuffle([target, other]);

            if (!c.isAwake('Investigator')) {
                const wrongRole = randpick(allRoleKeys(), 1,
                    k => RoleMap[k].faction === Faction.minion && k !== targetRole
                ).items[0] ?? targetRole;
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${wrongRole}::（实际::${targetRole}::）`);
            } else {
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::。`);
                logSkillResolution(c.id,
                    `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::`);
            }
            c.useSkill('skill');
        },
    },
    Chef: {
        display: '厨师',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知有多少对::evil::邻座。`,
        abnormal: {
            overall: "你会得知错误的数目。",
        },
        onStart(c) {
            c.limitSkill('skill', 1);
        },
        nightActionPriority() {
            return 3;
        },
        onNightSkill(c, t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const dataStore = useDataStore();
            const sz = dataStore.playerNumber();

            // 计算邪恶邻座对数（相邻的存活邪恶玩家）
            let pairs = 0;
            const chars: (Character | undefined)[] = [];
            for (let i = 1; i <= sz; i++) {
                chars.push(dataStore.chars.get(i));
            }
            for (let i = 0; i < sz; i++) {
                const cur = chars[i]!;
                const next = chars[(i + 1) % sz]!;
                if (cur.isTrulyEvil() && next.isTrulyEvil()) {
                    pairs++;
                }
            }

            if (!c.isAwake('Chef')) {
                const wrong = pairs === 0 ? 1 + randint(0, 2) : Math.max(0, pairs + randint(-1, 1));
                c.info.push(`有 ${wrong} 对::evil::邻座。`);
                logSkillResolution(c.id, `得知有 ${wrong} 对::evil::邻座（实际 ${pairs} 对）`);
            } else {
                c.info.push(`有 ${pairs} 对::evil::邻座。`);
                logSkillResolution(c.id, `得知有 ${pairs} 对::evil::邻座`);
            }
            c.useSkill('skill');
        },
    },
    HerbDoctor: {
        display: '郎中',
        faction: Faction.villager,
        summery: '"脉浮而阳气不足，气不收敛，发散在外。"',
        ability: `每个夜晚，你要选择除你以外的一名玩家：你会得知一个与他能力相关的词语。`,
        abnormal: {
            overall: "你会得知一个与该玩家能力无关的随机词语。",
        },
        requiresAI: true,
        nightActionPriority() {
            return 2;
        },
        async onNightSkill(c, t) {
            if (!c.hasRecalled()) return;

            const emitter = useEmitter();
            const dataStore = useDataStore();
            const chosen = await emitter.emit('select-player', {
                count: 1,
                info: '::HerbDoctor::：选择一名玩家，你会得知一个与他能力相关的词语。',
                required: true,
                filter: (x) => x.id !== c.id,
            });
            if (!chosen || chosen.length < 1) return;

            const target = chosen[0]!;
            const targetRole = target.role;

            const aiConfig = dataStore.getAiConfig();
            if (!aiConfig) {
                await emitter.emit('show-message', {
                    type: 'warning',
                    content: 'AI 未配置，无法为郎中生成词语。',
                });
                return;
            }

            const premise = buildHerbDoctorPremise(target, c.isAwake('HerbDoctor'));

            const answer = await callAi(
                aiConfig.service,
                aiConfig.apiKey,
                aiConfig.model,
                premise,
                `请为 #${target.id}（${RoleMap[targetRole].display}）生成一个与其能力相关的词语。`,
            );

            // 解析 AI 回答中的词语和原因
            let word = '（说书人沉默不语）';
            let reason = '';
            try {
                const jsonMatch = answer?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.word) word = parsed.word;
                    if (parsed.reason) reason = parsed.reason;
                }
            } catch {
                word = answer?.trim() ?? '（说书人沉默不语）';
            }

            const statusTag = !c.isAwake('HerbDoctor') ? '（神志不清）' : '';
            c.info.push(`对 #${target.id} 诊脉：${word}`);
            logSkillResolution(
                c.id,
                `对 #${target.id}（::${targetRole}::）诊脉得知「${word}」${reason ? `（原因：${reason}）` : ''}${statusTag}`,
            );
        },
    },

    // 外来者
    Recluse: {
        display: '陌客',
        faction: Faction.outsider,
        ability: '你会被其他::kind::当作任一::evil::。',
        abnormal: {
            overall: "你会被当作陌客。"
        }
    },
    Saint: {
        display: '圣徒',
        faction: Faction.outsider,
        ability: '当你被处决，::kind::阵营落败。',
        abnormal: {
            overall: "即使你被处决，::kind::阵营也不会落败。"
        },
        onExecuted(c) {
            if (c.isAwake('Saint')) {
                logGameEnd(false, '圣徒被处决，::kind::阵营落败');
                const emitter = useEmitter();
                emitter.emit('game-end', false);
            }
            return true;
        },
    },
    Moonchild: {
        display: '月之子',
        faction: Faction.outsider,
        ability: '当你死亡时，选择一位存活玩家，若他是::kind::，他死亡，且额外损失1点声望。',
        abnormal: {
            overall: "该玩家不会死亡，并且不会损失声望，即使该玩家是::kind::。"
        },
        afterTagAdd(c, tg) {
            if (tg.type === TagType.dead) {
                const emitter = useEmitter();
                const dataStore = useDataStore();
                emitter.emit('select-player', {
                    required: true,
                    filter(c) {
                        return !c.hasTag(TagType.dead);
                    },
                    info: '::Moonchild::：选择一名玩家，若他是::kind::，他死亡。'
                })
                    .then((res) => {
                        const obj = res![0];
                        logSkillActivate(c.id);
                        if (obj?.isEvil() || !c.isAwake('Moonchild')) {
                            c.info.push(`对 #${obj?.id} 发动技能，无事发生。`)
                            logSkillResolution(c.id, `对 #${obj?.id} 发动，无事发生`);
                            return;
                        };
                        c.info.push(`对 #${obj?.id} 发动技能，#${obj?.id} 死亡。`)
                        logSkillResolution(c.id, `死亡时选择了 #${obj?.id}（::${obj?.role}::）导致其死亡`);
                        obj?.addTag('dead', { meta: { type: 'moonchild' } });
                        dataStore.reputation--;
                        logReputationChange(-1, `#${c.id} ::${c.role}:: 选择了一名::kind::`)
                    })

            }
        },
    },
    Drunk: {
        display: '酒鬼',
        faction: Faction.outsider,
        ability: '你始终认为你是一个**不在场**的::villager::。你始终::drunk::。',
        abnormal: {
            overall: "你始终::confused::。",
        },
        onStart(c) {
            const allVillagers = allRoleKeys().filter(k => RoleMap[k].faction === Faction.villager);
            const inPlay = new Set(useDataStore().charList().map(x => x.role));
            const absent = allVillagers.filter(k => !inPlay.has(k));
            const believed = absent.length > 0 ? randpick(absent).items[0]! : allVillagers[0]!;
            c.addTag(TagType.disguise, { meta: believed });
            logSkillResolution(c.id, `自认为是一个::${believed}::，并始终::drunk::。`);
            c.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
        },
    },
    TwoFaced: {
        display: '双面人',
        faction: Faction.outsider,
        summery: '“我当然是个好人……至少今天是的。”',
        ability: `你始终认为你是一个**在场**的::villager::，你获得该能力。每个夜晚，若你和该玩家都清醒且健康，你::drunk::直到下一个::dusk::。`,
        abnormal: {
            overall: "当晚不会有人因为你本身的能力::drunk::，你获得的能力异常。",
        },
        onStart(c) {
            const dataStore = useDataStore();
            const inPlayVillagers = dataStore.charList().filter(
                x => x.getRoleDetail().faction === Faction.villager && x.id !== c.id
            );
            if (inPlayVillagers.length > 0) {
                const target = randpick(inPlayVillagers).items[0]!;
                _store.set(c.id, target.id);
                c.addTag(TagType.disguise, { meta: target.role });
                logSkillResolution(c.id, `认为自己是::${target.role}::（#${target.id}），并获得该能力。`);
            } else {
                // 没有镇民在场，随机选一个不在场的镇民
                const allVillagers = allRoleKeys().filter(k => RoleMap[k].faction === Faction.villager);
                const inPlay = new Set(dataStore.charList().map(x => x.role));
                const absent = allVillagers.filter(k => !inPlay.has(k));
                const believed = absent.length > 0 ? randpick(absent).items[0]! : allVillagers[0]!;
                c.addTag(TagType.disguise, { meta: believed });
                logSkillResolution(c.id, `没有镇民在场，认为自己是一个::${believed}::。`);
            }
        },
        nightActionPriority() {
            return 10;
        },
        onNightSkill(c, t) {
            const targetId = _store.get(c.id);
            if (targetId === undefined || targetId === 0) return;

            const dataStore = useDataStore();
            const target = dataStore.chars.get(targetId);
            if (!target) return;

            // 若自己和目标都清醒且健康（均无 confused），则自己醉酒
            if (!c.hasTag(TagType.confused) && !target.hasTag(TagType.confused)) {
                logSkillResolution(c.id, `与 #${targetId} 都清醒健康，双面人::drunk::。`);
                c.addTag(TagType.confused, {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dusk),
                    source: c.id,
                });
            }
        },
    },
    Sage: {
        display: '贤者',
        faction: Faction.villager,
        summery: '“这书山卷海中一定隐藏着秘密，我非常确信！这些秘密就隐藏在这一字一句之间等待着我们发掘。小子！再帮我多拿点蜡烛！还有墨水！虽然这些笔记有些晦涩，但有关恶魔的谜语很快就会被揭晓。”',
        ability: '如果::evil::杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个::evil::。',
        abnormal: {
            overall: "你不会得知任何信息。",
        },
        afterTagAdd(c, tg) {
            if (tg.type !== TagType.dead) return;
            const deadTag = c.getTag(TagType.dead)[0];
            const dtype = (deadTag?.meta as { type?: string } | undefined)?.type;
            if (dtype !== 'demon' && dtype !== 'assassin') return;

            if (!c.isAwake('Sage')) {
                logSkillResolution(c.id, '由于神志不清，未能得知凶手。');
                return;
            }

            const dataStore = useDataStore();
            const killerId = deadTag?.source;
            const killer = killerId ? dataStore.chars.get(killerId) : null;
            if (!killer) {
                logSkillResolution(c.id, '未能找到凶手。');
                return;
            }

            const other = randpick(
                dataStore.charList(),
                1,
                x => x.id !== killer.id && !x.hasTag(TagType.dead)
            ).items[0];
            if (!other) return;

            const pair = [killer, other].sort((a, b) => a.id - b.id);
            c.info.push(`在 #${pair[0]!.id} 和 #${pair[1]!.id} 中，有一人杀死了我。`);
            logSkillResolution(c.id, `得知凶手在 #${pair[0]!.id} 和 #${pair[1]!.id} 之中。`);
        },
    },

    // 爪牙
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
                let obj = dataStore.chars.get((c.id + 1).wrap(sz))!;
                fn(obj);
                obj = dataStore.chars.get((c.id - 1).wrap(sz))!
                fn(obj);
            } else {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
            }
        },
    },
    Assassin: {
        display: '刺客',
        faction: Faction.minion,
        summery: '“……”',
        ability: '第二个夜晚，会有随机一名::kind::（优先选择::villager::），他死亡，即使任何原因导致他不会死亡。',
        abnormal: {
            overall: "不会有人死亡。"
        },
        nightActionPriority(c) {
            return 5;
        },
        onNightSkill(c, t) {
            const dataStore = useDataStore();
            if (t !== Time.makeTime(2, Time.Phase.Night)) return;
            if (c.isAwake('Assassin')) {
                const obj = pickKindPreferVillager(dataStore.charList())[0];
                logSkillResolution(c.id, `刺杀了 #${obj?.id}（::${obj?.role}::）。`);
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
                const target = pickKindPreferVillager(dataStore.charList())[0];
                logSkillResolution(c.id, `由于白天有::outsider::死亡，教父杀死了 #${target?.id}（::${target?.role}::）`)
                target?.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    source: c.id,
                    meta: { type: 'night' },
                });
            }
        },
    },
    // Demon
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
            const target = pickKindPreferVillager(dataStore.charList())[0];
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

            const target = pickKindPreferVillager(dataStore.charList())[0];
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
                const targets = pickKindPreferVillager(dataStore.charList(), 3);
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

            const target = pickKindPreferVillager(dataStore.charList())[0];
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

export type RoleType = keyof typeof roles;

export const RoleMap: Record<RoleType, IRole> = roles;

// ── 艺术家辅助函数 ──

/** 构建完整的游戏状态前提文本（规则 + 历史 + 当前状态），供 AI 回答问题使用 */
function buildGameStatePremise(): string {
    const dataStore = useDataStore();
    const parts: string[] = [];

    // ── 一、游戏规则 ──
    parts.push('【游戏规则】');
    parts.push('你是"说书人"，主持一场类"血染钟楼"的推理游戏。');
    parts.push('游戏中有以下阵营：');
    parts.push('- villager（镇民）：善良阵营，拥有各种获取信息或保护的能力。');
    parts.push('- outsider（外来者）：善良阵营，但能力对善良方不利。');
    parts.push('- minion（爪牙）：邪恶阵营，辅助恶魔。');
    parts.push('- demon（恶魔）：邪恶阵营，每晚杀死一名善良玩家。');
    parts.push('');
    parts.push('游戏按天进行，每天分为：夜晚→黎明→白天→黄昏。');
    parts.push('白天玩家可以回忆（recall）得知信息、发动技能、或处决（execute）可疑玩家。');
    parts.push('处决发生在白天，被处决的玩家会死亡。');
    parts.push('当恶魔/爪牙全部死亡，善良方获胜；当存活玩家≤2人或声望归零，邪恶方获胜。');
    parts.push('');

    // ── 四、角色图鉴 ──
    parts.push('【角色图鉴（所有可能出现的角色及能力）】');
    parts.push('注意：以下为游戏中所有可能出现的角色，玩家仅扮演其中部分角色。说书人应参考以下所有角色的能力来回答问题。');
    parts.push('');
    const sortedRoles = allRoleKeys().filter(k => k !== 'unknown').sort((a, b) => {
        const order = [Faction.villager, Faction.outsider, Faction.minion, Faction.demon];
        const fa = RoleMap[a].faction, fb = RoleMap[b].faction;
        return order.indexOf(fa as any) - order.indexOf(fb as any) || a.localeCompare(b);
    });
    for (const key of sortedRoles) {
        const role = RoleMap[key];
        const abil = role.ability.replace(/::/g, '').replace(/\n\s*/g, ' ').trim();
        parts.push(`- ${key}（${role.display}，${role.faction}）：${abil.substring(0, 120)}`);
    }
    parts.push('');

    // ── 二、历史事件 ──
    parts.push('【历史事件】');
    const events = dataStore.gameLog;
    if (events.length === 0) {
        parts.push('（暂无历史事件）');
    } else {
        for (const evt of events) {
            const day = Time.getDay(evt.time);
            const phase = Time.PHASE_NAMES[Time.getPhase(evt.time)];
            const subjectRole = evt.subject > 0 && evt.subject <= dataStore.playerNumber()
                ? RoleMap[dataStore.chars.get(evt.subject)?.role ?? 'unknown']?.display
                : '?';
            switch (evt.type) {
                case 'phaseChange':
                    parts.push(`- 第${day}天${phase}开始`);
                    break;
                case 'recall':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）进行了回忆`);
                    break;
                case 'execute':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）被处决`);
                    break;
                case 'death':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）死亡（死因：${(evt.meta as any).cause ?? '未知'}）`);
                    break;
                case 'skillResolution':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）发动技能：${(evt.meta as any).detail ?? ''}`);
                    break;
                case 'reputationChange':
                    parts.push(`- 第${day}天${phase}：声望变化 ${(evt.meta as any).delta ?? 0}（${(evt.meta as any).reason ?? ''}），当前 ${(evt.meta as any).newValue ?? '?'}`);
                    break;
                case 'gameStart':
                    parts.push(`- 游戏开始，初始角色已分配`);
                    break;
                // gameEnd, disguiseChange, confusedChange 可忽略或简要记录
            }
        }
    }
    parts.push('');

    // ── 三、当前状态 ──
    parts.push('【当前状态】');
    parts.push(`当前是第 ${Time.getDay(dataStore.time)} 天，${Time.getTimeString(dataStore.time)}。`);
    parts.push(`共有 ${dataStore.playerNumber()} 名玩家。`);
    parts.push('');

    const chars = [...dataStore.chars.entries()].sort((a, b) => a[0] - b[0]);
    for (const [id, c] of chars) {
        const role = RoleMap[c.role];
        const tags: string[] = [];
        if (c.hasTag(TagType.dead)) tags.push('已死亡');
        if (c.hasTag(TagType.confused)) tags.push('神志不清（中毒/醉酒）');
        if (c.hasTag(TagType.disguise)) {
            const dis = c.getTag(TagType.disguise)[0];
            tags.push(`伪装身份：${RoleMap[dis?.meta as RoleType]?.display ?? '未知'}`);
        }
        const tagStr = tags.length > 0 ? ` [${tags.join('，')}]` : '';
        parts.push(`玩家 #${id}：${role.display}（${role.faction}）${tagStr}`);
    }

    return parts.join('\n');
}

/** 构建艺术家专用的前提（游戏状态 + JSON 回答格式约束） */
function buildArtistPremise(): string {
    const base = buildGameStatePremise();
    return `${base}
【回答格式】
你必须仅回复一个 JSON 对象，格式如下：
{"answer": "是", "reason": "简要原因"}
{"answer": "否", "reason": "简要原因"}
{"answer": "我不知道", "reason": "简要原因"}
{"answer": "无法回答", "reason": "简短原因"}
不要输出任何其他内容，只输出 JSON。

例子：
1. 
问：#3 是恶魔吗？
答：{"answer": "是", "reason": "#3 是小恶魔，他的能力会在夜晚杀死善良阵营的玩家。"}
2. 
问：#5 是镇民吗？
答：{"answer": "否", "reason": "#5 是下毒者，他是镇民，他的能力会使周围的善良阵营玩家中毒。"}
3. 
问：1+1=2吗？
答：{"answer": "是", "reason": "1+1=2是一个基本的数学事实。"}
`;
}

/** 解析 AI 的 JSON 回答，返回 { answer: '是'|'否'|'我不知道'|'cannot_answer', reason: string } */
function parseArtistAnswer(raw: string): { answer: '是' | '否' | '我不知道' | 'cannot_answer'; reason: string } {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no json');

        const parsed = JSON.parse(jsonMatch[0]);
        const answer = (parsed.answer ?? '').trim();
        const reason = (parsed.reason ?? '').trim();

        if (answer === '是') return { answer: '是', reason };
        if (answer === '否') return { answer: '否', reason };
        if (answer === '我不知道') return { answer: '我不知道', reason };
        return { answer: 'cannot_answer', reason };
    } catch {
        // JSON 解析失败，尝试正则匹配作为降级方案
        const text = raw.trim();
        if (/不知道|不清楚|无法确定|未知|don['']?t\s*know|unknown|not\s+sure/i.test(text)) {
            return { answer: '我不知道', reason: '' };
        }
        if (/^是|[\s,，。.!！?？]是|yes|correct|true|right/i.test(text)) {
            return { answer: '是', reason: '' };
        }
        if (/^否|^不是|[\s,，。.!！?？]否|[\s,，。.!！?？]不是|no\b|false|wrong|incorrect/i.test(text)) {
            return { answer: '否', reason: '' };
        }
        return { answer: 'cannot_answer', reason: '' };
    }
}

/** 构建渔夫专用的状态前提（游戏状态 + 建议回答要求） */
function buildFishermanPremise(): string {
    const base = buildGameStatePremise();
    return `${base}
【回答要求】
作为说书人，给渔夫一些能帮助善良阵营获胜的策略建议。
这些建议不需要严格基于事实，你是说书人，你在指引渔夫做出最有利于他阵营的选择。
请用中文回复，只输出以下 JSON 格式（不要输出其他内容）：
{"advice": "具体建议内容", "reason": "给出此建议的原因"}
请注意，建议（\`advice\`）**不要**包含理由，也不要包含上述【历史事件】和【当前状态】的内容。（玩家并不知道【历史事件】和【当前状态】的内容，这些只有说书人知道。）
你只需要给出一条建议，类似“相信 #3 和 #5”是两条建议（相信#3和相信#5），“处决 #3 和 #5”也是两条建议（处决#3和处决#5）。你不需要给出多条建议。
给渔夫建议的最好方式是让他做什么，而不是“是什么”信息。这让渔夫这个角色更有趣也更与众不同。
例如，建议“你应该处决那个玩家”，或者“保护那名玩家”，或者“找到醉酒的玩家”，或者“颠覆你之前的想法”，或者“忽略爪牙们的存在”，或者“相信哪名玩家”。这些建议会比“这名玩家是邪恶的”或者“恶魔是小恶魔”更有趣。
以下是建议的示例：
1. {"advice": "你不应该相信 #8", "reason": "#8 是中毒的共情者，他的信息出现了错误。"}
2. {"advice": "你应该保护 #3", "reason": "#3 是教授，他的技能很有用。"}
3. {"advice": "你应该处决 #5", "reason": "#5 是恶魔，他的能力会在夜晚杀死善良阵营的玩家。"}
4. {"advice": "你应该处决 #2", "reason": "#2 是镇民，但由于渔夫神志不清，我给了他糟糕的建议。"}
5. {"advice": "你不应该处决 #7", "reason": "#7 是酒鬼，虽然他的信息可能会误导你，但他是善良玩家。"}
`;
}

/** 构建郎中专用的前提（游戏状态 + 目标玩家 + 词语生成约束） */
function buildHerbDoctorPremise(target: Character, awake: boolean): string {
    const base = buildGameStatePremise();
    const targetDetail = RoleMap[target.role];
    const abil = targetDetail.ability.replace(/::/g, '').replace(/\n\s*/g, ' ').trim();
    return `${base}

【当前目标】
玩家 #${target.id} 的角色是 ${targetDetail.display}（${targetDetail.faction}）。
该角色的能力描述：${abil.substring(0, 200)}

【任务】
你是一个说书人。郎中在夜晚对一名玩家"诊脉"，你需要生成一个与该玩家能力相关的词语。

要求：
- 词语应为 2\~4 个汉字（或一个英文单词），必须有明确含义。
- 该词可以来自能力描述中的某个关键词，如"夜晚"、"死亡"、"公开"等；也可以是对能力的概括性描述，如"勇敢"、"牺牲"、"伪装"等。
- 不能是无法组成词语的字拼接在一起。
- 建议在游戏早期尽量提供模糊的词语，避免郎中迅速确定对方的具体角色。尤其对于邪恶身份，不要提供过于明显的信息。如：普卡，可以提供“神志不清”，而不是“毒素”。${!awake ? '\n- 由于郎中神志不清，请给出一个与该玩家能力无关的随机词语。' : ''}

示例：
1. 第一晚，郎中选择了教授，得知的词语是"死亡"。因为教授的技能对象为死亡玩家。第二晚，郎中仍选择教授，得知“逆转”，因为教授的技能可以逆转死亡玩家的状态。
2. 郎中选择了酒鬼，得知的词语是"神志不清"。因为酒鬼的技能会让自己和目标玩家醉酒。
3. 郎中选择了刺客，得知的词语是"死亡"。因为刺客的技能会在第二个夜晚杀死一名玩家。
4. 郎中选择了建筑师，得知的词语是“邪恶”。因为建筑师的技能描述中有“邪恶”一词。

【回答格式】
请仅回复以下 JSON 格式：
{"word": "你选择的词语", "reason": "简短说明为什么选择这个词"}
不要输出任何其他内容。`;
}
