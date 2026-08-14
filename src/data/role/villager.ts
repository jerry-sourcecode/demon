/**
 * 角色模块：villager.ts（镇民阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType, makeProtect } from "../tag";
import { shuffle, type Character } from "../model";
import { useDataStore } from "../../store/value";
import { useEmitter } from "../../store/emit";
import { allRoleKeys, randint, randpick, swap } from "@/utils/utils";
import { ref } from "vue";
import { logSkillResolution, logSkillActivate } from "../gameLog";
import { callAi } from "@/utils/ai";
import { RoleMap, type RoleType } from "./index";
import {
    Faction,
    Alignment,
    type IRole,
    playerData,
    nearestAlivePair,
    f4PickPair,
    f4HandleNotAwake,
    buildArtistPremise,
    parseArtistAnswer,
    buildFishermanPremise,
    buildHerbDoctorPremise,
    getAliveChars,
    getGoodChars,
    getEvilChars,
} from "./model";

export const villagerRoles = {
    Alchemist: {
        display: '炼金术士',
        faction: Faction.villager,
        summery: '“探寻地球本质。加以矫正，你将寻得秘石。黄金之上皆是红色。那是真理之冠。”',
        ability: `
        在::dawn::或::dusk::，你可以::clean::与你::distance::3的玩家中::confused::的玩家。每局仅一次。

        你会得知有多少玩家受到了你的影响。

        你始终保持::awake::。
        `,
        abnormal: {
            overall: "你的技能不会生效，且会获得错误的信息。",
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
        summery: `“就像大卫对歌利亚所说，像忒修斯对米诺陶所说，也像阿周那对福授所说的那样……绝不。”`,
        ability: "不会在夜里死亡。",
        abnormal: {
            overall: "仍会正常死亡。",
        },
        onTimeChange(c, t) {
            if (Time.getPhase(t) === Time.Phase.Night) {
                c.addTag(TagType.protect, {
                    till: Time.makeTime(Time.getDay(t), Time.Phase.Dawn),
                    meta: makeProtect({ kind: 'nightGuard' }),
                });
            }
        }
    },
    Nun: {
        display: "修女",
        faction: Faction.villager,
        summery: "“我是纯洁的。就让那些无罪之人匍匐在地，替我受苦吧。我的名誉不应被你恶毒的指控所玷污。”",
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
        summery: "“我会建造一座宏伟的城市。它将是人类文明的巅峰。”",
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
            let rightNeedAdd = 0;
            if (dataStore.playerNumber() % 2 === 1) {
                rightNeedAdd = 1;
            }
            c.info.push(`**右半圈**是指 #1 ~ #${half}，**左半圈**是指 #${half + rightNeedAdd} ~ #${dataStore.playerNumber()} 以及 #1。`);
            for (let i = 1; i <= half; i++) {
                if (dataStore.chars.get(i)?.isEvil()) {
                    cnt_r.value++;
                }
            }
            for (let i = half + rightNeedAdd; i <= dataStore.playerNumber(); i++) {
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
                c.info.push("**左半圈**::evil::更多。");
            } else if (cnt_r.value > cnt_l.value) {
                c.info.push("**右半圈**::evil::更多。");
            } else {
                c.info.push("左右半圈::evil::数量**相同**。");
            }
        },
    },
    Farmer: {
        display: "农夫",
        faction: Faction.villager,
        summery: "“即使那些高高在上的人也需要吃东西。没有了我们，城市就会挨饿。”",
        ability: `::recall::时，如果可能，75% 可能会有1名失忆的::villager::会变成新的农夫，并得知原来的身份。`,
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
            if (randint(1, 4) === 1) {
                logSkillResolution(c.id, '技能发动正常，但概率未命中，因此未能传承。');
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
        summery: "“我会照顾好每一个人。即使是那些不值得的人。”",
        ability: `白天时，你可以选择得知与你最近的::confused::的玩家与你的距离。每局游戏限两次。`,
        abnormal: {
            overall: "得知随机一位::awake::的玩家与你的距离。"
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 2);
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
        summery: "“过程很简单。将液压植入器连接到改良型气矩阵放大器上，加入20CC的伪多拉芬，让他的参数Z保持在20%以上，你丈夫就会重新活蹦乱跳。现在，我们需要的仅仅是一次雷击。”",
        ability: `白天，你可以选择一名死亡玩家，若该玩家为::villager::，使其复活、::awake::并重新::recall::身份。每局游戏限一次。`,
        abnormal: {
            overall: "无事发生。"
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            }
            return true;
        },
    },
    Bishop: {
        display: "主教",
        faction: Faction.villager,
        summery: "“我会为你们祈祷。即使你们不信仰上帝。”",
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
            if (!c.isAwake('Bishop')) {
                const allIds = [...dataStore.chars.keys()];
                ls = randpick(allIds, has.length).items;
            }
            ls = ls.sort((a, b) => a - b);
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
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            overall: "你有可能会获得错误线索。"
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 2);
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
            playerData.set(c.id, x?.id ?? 0);
            logSkillResolution(c.id, `#${x?.id} ::${x?.role}:: 是占卜师的宿敌。`)
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            const nemesisId = playerData.get(c.id);
            x.forEach((sel) => {
                if (sel.isEvil() || (nemesisId && nemesisId !== 0 && sel.id === nemesisId)) {
                    ans = true;
                }
            })
            if (!c.isAwake('FortuneTeller')) ans = !ans;
            x.sort((a, b) => a.id - b.id)
            c.info.push(`在 ${x.map(sel => `#${sel.id}`).join('、')} 中**${!ans ? '不' : ''}存在**::evil::。`)
            logSkillResolution(c.id, `在 ${x.map(sel => `#${sel.id}`).join('、')} 中${ans ? '发现' : '未发现'}邪恶`);
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
            if (!c.hasRecalled()) return;
            const { cw, ccw } = nearestAlivePair(c);
            let count = (cw?.isEvil() ? 1 : 0) + (ccw?.isEvil() ? 1 : 0);

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
            overall: "该玩家不会死亡，即使他是::evil::。",
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            overall: '说书人必定会给出错误的答案。',
        },
        requiresAI: true,
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            overall: '说书人必定会给出误导性的建议。',
        },
        requiresAI: true,
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const dataStore = useDataStore();

            const premise = buildFishermanPremise(c.isAwake('Fisherman'));

            const aiConfig = dataStore.getAiConfig();
            if (!aiConfig) {
                await emitter.emit('show-message', {
                    type: 'warning',
                    content: 'AI 未配置，无法获取建议。',
                });
                return false;
            }

            const adviceGoal = c.isAwake('Fisherman')
                ? '请给我一些能帮助善良阵营获胜（善良阵营获胜条件为：消灭所有邪恶玩家）的策略建议。不需要完全基于事实，这是说书人认为对渔夫最有利的行动指引。'
                : '请给我一些误导性的、对善良阵营**有害的糟糕**建议。（善良阵营获胜条件为：消灭所有邪恶玩家）';

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
        ability: '::recall::时，得知一名::kind::及其角色，若该玩家死亡，祖母一同死亡。',
        abnormal: {
            overall: "你会得知一名::evil::（若不存在则会选择随机一名玩家），若该玩家死亡，祖母不会死亡。"
        },
        onRecall(c) {
            let ans: Character | undefined, role: RoleType | undefined;
            const data = useDataStore();

            if (c.isAwake('Grandma')) {
                // 正常：得知一名善良玩家及其角色
                ans = randpick(data.charList(), 1, (ch) => !ch.isEvil() && ch.id !== c.id).items[0];
                role = ans?.role;
            } else {
                // 异常：得知一名邪恶玩家（伪装角色/神志不清）
                ans = randpick(data.charList(), 1, (ch) => ch.isTrulyEvil() && ch.id !== c.id).items[0];
                if (ans) {
                    role = ans.getTag(TagType.disguise)[0]?.meta as RoleType | undefined ?? ans.role;
                } else {
                    // 没有其他邪恶角色时降级为随机善良玩家
                    ans = randpick(data.charList(), 1, (ch) => ch.id !== c.id).items[0];
                    role = ans?.role;
                }
            }

            if (ans && role) {
                ans.addTag(TagType.grandson, { source: c.id });
                c.info.push(`#${ans.id} 是${RoleMap[role].display}。`);
            } else {
                c.info.push('未能获取到有效信息。');
            }
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
            return 8;
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

            c.info.push(`在${Time.getTimeString(t)}，保护了 #${chosen[0]!.id}。`);

            if (!c.isAwake('Monk')) {
                logSkillResolution(c.id, `选择了 #${chosen[0]!.id}，但是由于神志不清，技能未能生效。`);
                return;
            }

            const till = Time.makeTime(Time.getDay(t), Time.Phase.Dawn);
            chosen[0]!.addTag(TagType.protect, {
                till,
                meta: makeProtect({ kind: 'nightGuard' }),
            });
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
            return 8;
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

            chosen.sort((a, b) => a.id - b.id);

            logSkillActivate(c.id);

            c.info.push(`在${Time.getTimeString(t)}，保护了 #${chosen[0]!.id} 和 #${chosen[1]!.id}，其中一人会::drunk::。`);

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
            chosen[0]!.addTag(TagType.protect, {
                till,
                meta: makeProtect({ kind: 'nightGuard' }),
            });
            chosen[1]!.addTag(TagType.protect, {
                till,
                meta: makeProtect({ kind: 'nightGuard' }),
            });
        },
    },
    Pacifist: {
        display: '和平主义者',
        faction: Faction.villager,
        ability: '被处决的::kind::有 60% 的可能不会死亡。',
        abnormal: {
            overall: "::kind::不会获得保护。"
        },
        onRecall(c) {
            const dataStore = useDataStore();
            dataStore.chars.forEach(ch => {
                if (ch.alignment === Alignment.good) {
                    ch.addTag(TagType.protect, {
                        source: c.id,
                        meta: makeProtect({ kind: 'pacifist', source: c.id }),
                    });
                }
            })
        }
    },

    // ── 首夜 F4（第一夜信息角色）──
    Washerwoman: {
        display: '洗衣妇',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::villager::。`,
        abnormal: {
            overall: "你会必定得知错误的玩家或角色。",
        },
        onRecall(c) { c.registerLimitSkill('skill', 1); },
        nightActionPriority() { return 6; },
        onNightSkill(c, _t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const ds = useDataStore();
            if (ds.villagerMin === 0 && ds.villagerMax === 0) {
                c.info.push('场上没有::villager::。');
                logSkillResolution(c.id, '得知场上没有镇民（数量范围为0）');
                c.useSkill('skill'); return;
            }
            if (c.isAwake('Washerwoman')) {
                const r = f4PickPair(c, Faction.villager);
                if (!r) return;
                c.info.push(`#${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::。`);
                logSkillResolution(c.id, `得知 #${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::`);
            } else {
                f4HandleNotAwake(c, Faction.villager, ds.villagerMin, '场上没有::villager::。');
            }
            c.useSkill('skill');
        },
    },
    Librarian: {
        display: '图书管理员',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::outsider::。（如果场上没有::outsider::，你会得知没有::outsider::。）`,
        abnormal: {
            overall: "你必定会得知错误的玩家或角色。若场上**不可能**有::outsider::，你会得知没有::outsider::，即使你的技能异常。",
        },
        onRecall(c) { c.registerLimitSkill('skill', 1); },
        nightActionPriority() { return 5; },
        onNightSkill(c, _t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const ds = useDataStore();
            if (ds.outsiderMin === 0 && ds.outsiderMax === 0) {
                c.info.push('场上没有::outsider::。');
                logSkillResolution(c.id, '得知场上没有外来者（数量范围为0）');
                c.useSkill('skill'); return;
            }
            if (c.isAwake('Librarian')) {
                const outsiders = ds.charList().filter(
                    x => x.id !== c.id && x.getRoleDetail().faction === Faction.outsider
                );
                if (outsiders.length === 0) {
                    c.info.push('场上没有::outsider::。');
                    logSkillResolution(c.id, '得知场上没有::outsider::');
                } else {
                    const r = f4PickPair(c, Faction.outsider);
                    if (!r) return;
                    c.info.push(`#${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::。`);
                    logSkillResolution(c.id, `得知 #${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::`);
                }
            } else {
                f4HandleNotAwake(c, Faction.outsider, ds.outsiderMin, '场上没有::outsider::。');
            }
            c.useSkill('skill');
        },
    },
    Investigator: {
        display: '调查员',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知两名玩家，其中一名是某个特定的::minion::。（如果场上没有::minion::，你会得知没有::minion::。）`,
        abnormal: {
            overall: "你必定会得知错误的玩家或角色。若场上**不可能**有::minion::，你会得知没有::minion::，即使你的技能异常。",
        },
        onRecall(c) { c.registerLimitSkill('skill', 1); },
        nightActionPriority() { return 4; },
        onNightSkill(c, _t) {
            if (!c.hasRecalled() || !c.allowUseSkill('skill')) return;
            const ds = useDataStore();
            const possibleMinions = ds.possibleEvil.filter(r => RoleMap[r]?.faction === Faction.minion);

            if (c.isAwake('Investigator')) {
                const minionChars = ds.charList().filter(
                    x => x.id !== c.id && x.getRoleDetail().faction === Faction.minion
                );
                if (minionChars.length === 0 || possibleMinions.length === 0) {
                    c.info.push('场上没有::minion::。');
                    logSkillResolution(c.id, '得知场上没有::minion::');
                    c.useSkill('skill'); return;
                }
                const r = f4PickPair(c, Faction.minion);
                if (!r) return;
                c.info.push(`#${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::。`);
                logSkillResolution(c.id, `得知 #${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::`);
            } else {
                const allPs = ds.charList().filter(x => x.id !== c.id);
                if (allPs.length < 2) return;
                const two = randpick(allPs, 2).items;
                const taken = new Set<RoleType>();
                two.forEach(x => taken.add(x.role));
                two.forEach(x => {
                    const dis = x.getTag(TagType.disguise)[0];
                    if (dis) taken.add(dis.meta as RoleType);
                });
                const validMinions = possibleMinions.filter(r => !taken.has(r));
                if (possibleMinions.length === 0) {
                    c.info.push('场上没有::minion::。');
                    logSkillResolution(c.id, '得知场上没有::minion::');
                    c.useSkill('skill'); return;
                }
                const targetRole = validMinions.length > 0
                    ? randpick(validMinions).items[0]!
                    : randpick(possibleMinions).items[0]!;
                const pair = two.sort((a, b) => a.id - b.id);
                c.info.push(`#${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::。`);
                logSkillResolution(c.id, `得知 #${pair[0]!.id} 和 #${pair[1]!.id} 中有一名::${targetRole}::（均不是该身份）`);
            }
            c.useSkill('skill');
        },
    },
    Chef: {
        display: '厨师',
        faction: Faction.villager,
        ability: `::recall::后的首夜，你会得知有多少对::evil::邻座。`,
        abnormal: {
            overall: "你必定会得知错误的数目。",
        },
        onRecall(c) {
            c.registerLimitSkill('skill', 1);
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
            overall: "你必定会得知一个与该玩家能力无关的随机词语。",
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
    Knight: {
        display: '骑士',
        faction: Faction.villager,
        ability: '在你::recall::时，你会得知两名存活的::kind::，若此时存活玩家不足 5 人，改为得知一名存活::kind::。',
        abnormal: {
            overall: "你得知信息中至少包含一位::evil::。",
        },
        onRecall(c) {
            const awake = c.isAwake('Knight');
            const count = getAliveChars().length < 5 ? 1 : 2;

            if (awake) {
                // 正常：得知 count 名存活的善良玩家（按 id 排序输出）
                const goods = getGoodChars({ count, alive: true });
                goods.sort((a, b) => a.id - b.id);
                const shown = goods.map(x => `#${x.id}`).join('、');
                c.info.push(`${shown} 是善良玩家。`);
            } else {
                // 异常：信息中至少包含一位邪恶玩家（随机 1 ~ count 名），其余为善良玩家
                const evilCount = randint(1, count);
                const evils = getEvilChars({ count: evilCount, alive: true });
                const goods = getGoodChars({
                    count: count - evils.length,
                    alive: true,
                });
                const shown = [...goods, ...evils];
                shown.sort((a, b) => a.id - b.id);
                const names = shown.map(x => `#${x.id}`).join('、');
                c.info.push(`${names} 是善良玩家。`);
            }
        }
    }
} satisfies Record<string, IRole>;
