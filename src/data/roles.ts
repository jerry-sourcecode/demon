import { Time } from "../utils/time";
import { type ITag, TagType } from "./tag";
import { pickRoles, shuffle, type Character, pickKindPreferVillager } from "./model";
import { useDataStore } from "../store/value";
import { useEmitter } from "../store/emit";
import { allRoleKeys, randint, randpick, swap } from "@/utils/utils";
import { ref } from "vue";
import { logReputationChange, logSkillResolution } from "./gameLog";

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
    /** 判断当前是否可以发动主动技能（无参，内部通过 useDataStore() 获取全局状态） */
    canActivateSkill?: (c: Character, t: Time.TimeNumber) => boolean,
    /** 夜间行动优先级，越大越先行动 */
    nightActionPriority?: (c: Character) => number,
    /** 释放主动技能时 */
    onActiveSkill?: (c: Character) => void,
    /** 回忆时 */
    onRecall?: (c: Character) => void,
    /** 时间改变时 */
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
            return c.allowUseSkill('skill') && (Time.getPhase(t) === Time.Phase.Dawn || Time.getPhase(t) === Time.Phase.Dusk);
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
        nightActionPriority() {
            return 20;
        },
        onTimeChange(c, t) {
            if (Time.getPhase(t) === Time.Phase.Night) {
                c.addTag(TagType.protect, {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn)
                })
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
                    cnt_l.value++;
                }
            }
            for (let i = half + 1; i <= dataStore.playerNumber(); i++) {
                if (dataStore.chars.get(i)?.isEvil()) {
                    cnt_r.value++;
                }
            }
            if (dataStore.chars.get(1)?.isEvil()) cnt_r.value++;

            if (c.hasTag(TagType.confused, TagType.disguise)) {
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
            if (!c.isAwake()) {
                logSkillResolution(c.id, '由于神志不清，未能传承。');
                return;
            }
            const dataStore = useDataStore();
            let x;
            try {
                x = randpick(dataStore.charList(), 1, (c) => c.getRoleDetail().faction === Faction.villager && c.displayRole === 'unknown' && !c.hasTag(TagType.farmer)).items[0]!;
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
            if (!x) return;
            c.useSkill('skill');
            const obj = x[0]!;
            if (obj.getRoleDetail().faction !== Faction.villager) {
                logSkillResolution(c.id, `对 #${obj.id} 发动复活失败（非镇民）`);
                return;
            }
            if (!c.hasTag(TagType.confused, TagType.disguise)) {
                obj.clearTags(TagType.confused)
                obj.clearTags(TagType.dead);
                obj.addTag(TagType.recall);
                logSkillResolution(c.id, `复活了 #${obj.id}（::${obj.role}::）`);
            } else {
                logSkillResolution(c.id, `对 #${obj.id} 发动复活失败（技能异常）`);
                return;
            }
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
            if (!c.isAwake()) {
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
            if (!x) return;
            c.useSkill('skill');
            const obj = x[0]!;
            let ret = [];
            if (c.isAwake()) {
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
            if (!x) return;
            c.useSkill('skill');
            shuffle(x);
            let ans: undefined | RoleType = undefined;
            for (let i = 0; i <= 2; i++) {
                if (x[i]?.getRoleDetail().faction === Faction.outsider && !(x[i]?.role === 'Recluse')) {
                    ans = x[i]?.role;
                }
            }
            if (!c.isAwake()) {
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
            if (c.isAwake()) {
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
            if (c.isAwake()) {
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
            if (!x) return;
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
            if (!c.isAwake()) ans = !ans;
            x.sort((a, b) => a.id - b.id)
            c.info.push(`在 ${x.map(c => `#${c.id}`).join('、')} 中**${!ans ? '不' : ''}存在**::evil::。`)
            logSkillResolution(c.id, `在 ${x.map(c => `#${c.id}`).join('、')} 中${ans ? '发现' : '未发现'}邪恶`);
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
            if (!c.isAwake()) {
                ans = randpick(data.charList(), 1, (ch) => ch.isEvilByEvil() && ch.id !== c.id).items[0]!;
                role = ans.getTag(TagType.disguise)[0]?.meta!;
            }
            ans.addTag(TagType.grandson, { source: c.id });
            c.info.push(`#${ans.id} 是${RoleMap[role].display}。`)
        },
    },
    Monk: {
        display: '僧侣',
        faction: Faction.villager,
        ability: '每个夜晚*，你要选择除你以外的一名玩家：当晚他不会死亡。',
        abnormal: {
            overall: "你仍需要选择玩家，但技能不会生效。",
        },
        nightActionPriority() {
            return 20;
        },
        async onTimeChange(c, t) {
            if (Time.getPhase(t) !== Time.Phase.Night || Time.getDay(t) === 1 || c.displayRole === 'unknown') return;

            const emitter = useEmitter();
            const chosen = await emitter.emit('select-player', {
                count: 1,
                info: '::Monk::：选择一名玩家，他今晚不会死亡。',
                required: true,
                filter: (x) => x.id !== c.id,
            });
            if (!chosen || chosen.length < 1) return;

            if (!c.isAwake()) {
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
        ability: '每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个::dusk::。',
        abnormal: {
            overall: "你仍需要选择玩家，但技能不会生效。"
        }, nightActionPriority() {
            return 20;
        },
        async onTimeChange(c, t) {
            if (Time.getPhase(t) !== Time.Phase.Night || Time.getDay(t) === 1 || c.displayRole === 'unknown') return;

            const emitter = useEmitter();
            const chosen = await emitter.emit('select-player', {
                count: 2,
                info: '::Innkeeper::：选择两名玩家，他们今晚不会死亡，但其中一人会醉酒。',
                required: true,
            });
            if (!chosen || chosen.length < 2) return;

            if (!c.isAwake()) {
                logSkillResolution(c.id, `选择了 #${chosen[0]!.id} 和 #${chosen[1]!.id}，但是由于神志不清，技能未能生效。`);
                return;
            }

            // 保护两名玩家当夜免疫死亡
            const till = Time.makeTime(Time.getDay(t), Time.Phase.Dawn);

            // 随机一人醉酒到下个黄昏
            const drunk = randpick(chosen).items[0]!;

            logSkillResolution(c.id,
                `保护了 #${chosen[0]!.id} 和 #${chosen[1]!.id}，#${drunk.id} 醉酒`);
            chosen[0]!.addTag(TagType.protect, { till });
            chosen[1]!.addTag(TagType.protect, { till });
            drunk.addTag(TagType.confused, {
                till: Time.makeTime(Time.getDay(t), Time.Phase.Dusk),
            });
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
            if (c.isAwake()) {
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
                    info: '选择一名玩家，若他是::kind::，他死亡。'
                })
                    .then((res) => {
                        const obj = res![0];
                        if (obj?.isEvil() || !c.isAwake()) {
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
        ability: '你始终认为你是一个不在场的::villager::。你始终::drunk::。',
        abnormal: {
            overall: "你始终::confused::。",
        },
        onStart(c) {
            const allVillagers = allRoleKeys().filter(k => RoleMap[k].faction === Faction.villager);
            const inPlay = new Set(useDataStore().charList().map(x => x.role));
            const absent = allVillagers.filter(k => !inPlay.has(k));
            const believed = absent.length > 0 ? randpick(absent).items[0]! : allVillagers[0]!;
            c.addTag(TagType.disguise, { meta: believed });
            c.addTag(TagType.confused, { till: Time.FAR_FUTURE });
            logSkillResolution(c.id, `自认为是一个::${believed}::，并始终::drunk::。`);
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
        onTimeChange(c, t) {
            function fn(obj: Character) {
                if (!obj.isEvilByEvil()) {
                    obj.addTag(TagType.confused, {
                        till: Time.makeTime(Time.getDay(t), Time.Phase.Dusk)
                    });
                    logSkillResolution(c.id, `使得#${obj?.id}（::${obj?.role}::）::poisoned::。`)
                }
            }
            const dataStore = useDataStore();
            const sz = dataStore.chars.size;
            if (Time.getPhase(t) === Time.Phase.Night) {
                if (c.isEvilAwake()) {
                    let obj = dataStore.chars.get((c.id + 1).wrap(sz))!;
                    fn(obj);
                    obj = dataStore.chars.get((c.id - 1).wrap(sz))!
                    fn(obj);
                } else {
                    logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                }
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
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (t === Time.makeTime(2, Time.Phase.Night)) {
                if (c.isEvilAwake()) {
                    const obj = pickKindPreferVillager(dataStore.charList())[0];
                    obj?.addTag('dying', {
                        till: Time.makeTime(2, Time.Phase.Dawn),
                        meta: { force: true, type: 'assassin' },
                    })
                    logSkillResolution(c.id, `刺杀了 #${obj?.id}（::${obj?.role}::）。`);
                } else {
                    logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                }
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
            return 7;
        },
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) === Time.Phase.Night) {
                if (!c.isEvilAwake()) {
                    logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                    return;
                }
                const evilList = dataStore.charList().filter(
                    x => x.isEvilByEvil() && !x.hasTag(TagType.executionImmune) && !x.hasTag(TagType.dead)
                );
                if (evilList.length === 0) return;
                const target = randpick(evilList).items[0]!;
                target.addTag(TagType.executionImmune, {
                    till: Time.makeTime(Time.getDay(t) + 1, Time.Phase.Dawn),
                    meta: { day: Time.getDay(t) },
                });
                logSkillResolution(c.id, `保护了 #${target.id}（::${target.role}::）免于处决。`);
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
            _store.set(c.id, 0);
        },
        onAdjustCounts(counts) {
            counts.outsider += 1;
            counts.villager -= 1;
        },
        nightActionPriority() {
            return 6;
        },
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) !== Time.Phase.Night) return;
            if (!c.isEvilAwake()) {
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
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) !== Time.Phase.Night) return;
            if (Time.getDay(t) < 2) return;
            if (!c.isEvilAwake()) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }
            const target = pickKindPreferVillager(dataStore.charList())[0];
            if (target) {
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
                target.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    meta: { type: 'demon' },
                });
            }
        },
        afterTagAdd(c, tg) {
            if (tg.type === TagType.dead) {
                if (c.isEvilAwake()) {
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
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) !== Time.Phase.Night) return;

            const day = Time.getDay(t);
            const prevId = _store.get(c.id);

            // 上个被下毒的目标死亡并恢复
            if (prevId && prevId !== 0) {
                const prev = dataStore.chars.get(prevId);
                if (prev && !prev.hasTag(TagType.dead)) {
                    prev.clearTags(TagType.confused);
                    prev.addTag('dying', {
                        till: Time.makeTime(day, Time.Phase.Dawn),
                        meta: { type: 'demon' },
                    });
                    logSkillResolution(c.id, `#${prevId} 因毒素发作而死亡并恢复健康。`);
                }
                _store.set(c.id, 0);
            }

            if (!c.isEvilAwake()) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }

            const target = pickKindPreferVillager(dataStore.charList())[0];
            if (target) {
                target.addTag(TagType.confused, { till: Time.FAR_FUTURE });
                _store.set(c.id, target.id);
                logSkillResolution(c.id, `使 #${target.id} ::poisoned::。`);
            }
        },
    },
    Po: {
        display: '珀',
        faction: Faction.demon,
        ability: '每个夜晚*，以下行动二选一：充能（上限1）；消耗充能，随机三名::kind::（优先::villager::）死亡。',
        abnormal: {
            overall: "充能或释放不会生效。",
        },
        onStart(c) {
            _store.set(c.id, 0);
        },
        nightActionPriority() {
            return 1;
        },
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) !== Time.Phase.Night) return;
            if (Time.getDay(t) < 2) return;

            if (!c.isEvilAwake()) {
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
                for (const target of targets) {
                    target.addTag('dying', {
                        till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                        meta: { type: 'demon' },
                    });
                }
                const killed = targets.map(t => t.id).sort();
                if (killed.length > 0) {
                    logSkillResolution(c.id, `释放充能，杀死了 ${killed.map(id => `#${id}`).join('、')}。`);
                }
            }
        },
    },
    Vigormortis: {
        display: '亡骨魔',
        faction: Faction.demon,
        ability: '每个夜晚*，随机一名::kind::（优先::villager::）：他死亡。第一个死亡的爪牙保留他的能力，且与他邻近的两名镇民之一::poisoned::，当晚你无法行动。[-1::outsider::]',
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
        onTimeChange(c, t) {
            const dataStore = useDataStore();
            if (Time.getPhase(t) !== Time.Phase.Night) return;
            if (Time.getDay(t) < 2) return;

            let justRetained = false;
            const storedId = _store.get(c.id) ?? 0;

            // 检测首个爪牙死亡（仅触发一次）
            if (storedId === 0) {
                if (!c.isEvilAwake()) {
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
                        victim.addTag(TagType.confused, { till: Time.FAR_FUTURE });
                        logSkillResolution(c.id, `#${deadMinion.id} 死亡后，#${victim.id} 中毒。`);
                    }
                    logSkillResolution(c.id, `#${deadMinion.id} 保留了能力，今晚暂停杀戮。`);
                }
            }

            // 后续夜的混乱检查
            if (!c.isEvilAwake()) {
                logSkillResolution(c.id, '由于神志不清，技能未能生效。');
                return;
            }

            // 杀戮（保留之夜跳过）
            if (justRetained) return;

            const target = pickKindPreferVillager(dataStore.charList())[0];
            if (target) {
                target.addTag('dying', {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    meta: { type: 'demon' },
                });
                logSkillResolution(c.id, `杀死了 #${target.id}（::${target.role}::）。`);
            }
        },
    }
} satisfies Record<string, IRole>;

export type RoleType = keyof typeof roles;

export const RoleMap: Record<RoleType, IRole> = roles;
