/**
 * 角色模块：outsider.ts（外来者阵营角色）
 */
import { Time } from "../../utils/time";
import { TagType } from "../tag";
import { useDataStore } from "../../store/value";
import { useEmitter } from "../../store/emit";
import { randpick } from "@/utils/utils";
import { logSkillResolution, logGameEnd, logSkillActivate, logReputationChange } from "../gameLog";
import {
    Faction,
    type IRole,
    playerData,
    cryptoRevealEvil,
    cryptoWrongInfo,
    getRoleKeys,
    getFactionChars,
} from "./model";

export const outsiderRoles = {
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
        beforeExecuted(c) {
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
                        return !c.isDead();
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
                        logReputationChange(-1, `#${c.id} 作为::Moonchild::选择了一名::kind::`)
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
            const absent = getRoleKeys(Faction.villager, { absent: true });
            const allVillagers = getRoleKeys(Faction.villager);
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
            const inPlayVillagers = getFactionChars(Faction.villager);
            if (inPlayVillagers.length > 0) {
                const target = randpick(inPlayVillagers).items[0]!;
                playerData.set(c.id, target.id);
                // 伪装成该镇民（游戏面板上显示），并获得其能力
                c.addTag(TagType.gained, { meta: [target.role] });
                c.addTag(TagType.disguise, { meta: target.role });
                logSkillResolution(c.id, `认为自己是::${target.role}::（#${target.id}），伪装成该镇民并获得其能力。`);
            } else {
                // 没有镇民在场：伪装成一个不在场的镇民，但无法获得能力
                const absent = getRoleKeys(Faction.villager, { absent: true });
                const allVillagers = getRoleKeys(Faction.villager);
                const believed = absent.length > 0 ? randpick(absent).items[0]! : allVillagers[0]!;
                c.addTag(TagType.gained, { meta: [] });
                c.addTag(TagType.disguise, { meta: believed });
                logSkillResolution(c.id, `没有镇民在场，伪装成一个不在场的::${believed}::。`);
            }
        },
        nightActionPriority() {
            return 10;
        },
        onNightSkill(c, t) {
            const targetId = playerData.get(c.id);
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
        afterTagAdd(c, tg) {
            // 双面人死亡后不再拥有获得的能力（避免死后仍行动）
            if (tg.type === TagType.dead) {
                c.clearTags(TagType.gained);
            }
        },
    },
    Puzzlemaster: {
        display: '解密大师',
        faction: Faction.outsider,
        summery: '“当一个人开始认为某件事只不过是另一件事时，那么他通常都处在错误的边缘。耐心，耐心。不要把“只不过”和“应该”，“是”和“不是”混为一谈。”',
        ability: `一名::kind::::drunk::，即使你已死亡。每局游戏限一次，你可以猜测谁是那个因你而::drunk::的玩家，如果猜对了，你会得知一名::evil::及其身份，但如果猜错了，你会得知一名::kind::，和一个随机的邪恶角色。`,
        abnormal: {
            overall: "若你首夜::abnormal::，不会有人::drunk::，若猜测时你::abnormal::，无论是否猜对，都会获得错误的信息。",
        },
        onStart(c) {
            c.registerLimitSkill('skill', 1);
            const dataStore = useDataStore();
            const drunk = randpick(
                dataStore.charList(),
                1,
                x => !x.isTrulyEvil() && x.id !== c.id,
            ).items[0];
            if (drunk && c.isAwake('Puzzlemaster')) {
                playerData.set(c.id, drunk.id);
                drunk.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                logSkillResolution(c.id, `#${drunk.id}（::${drunk.role}::）醉酒。`);
            }
        },
        canActivateSkill(c, t) {
            return c.allowUseSkill('skill') && Time.getPhase(t) === Time.Phase.Day;
        },
        async onActiveSkill(c) {
            const emitter = useEmitter();
            const x = await emitter.emit('select-player', {
                count: 1,
                info: '::Puzzlemaster::：猜测谁是那名醉酒的玩家。',
            });
            if (!x || x.length < 1) return false;
            c.useSkill('skill');
            const obj = x[0]!;
            const drunkId = playerData.get(c.id);
            const guessedRight = drunkId !== undefined && obj.id === drunkId;
            const abnormal = !c.isAwake('Puzzlemaster');
            if (!abnormal && guessedRight) {
                if (cryptoRevealEvil(c)) return true;
                cryptoWrongInfo(c, '没有可揭示的邪恶玩家');
                return true;
            }
            cryptoWrongInfo(c, guessedRight ? '猜测正确但神志不清' : '猜错了');
            return true;
        },
    },
    SweetHeart: {
        display: '心上人',
        faction: Faction.outsider,
        summery: '“我永远也忘不掉她……永远……”',
        ability: `当你死亡时，一名::villager::开始::drunk::。`,
        abnormal: {
            overall: "当你死亡时，不会有人::drunk::。",
        },
        afterTagAdd(c, tg) {
            if (c.isAwake('SweetHeart') && tg.type === TagType.dead) {
                const villager = getFactionChars(Faction.villager, { alive: true, count: 1 })[0];
                if (villager) {
                    logSkillResolution(c.id, `由于::SweetHeart::死亡，#${villager.id}（::${villager.role}::）醉酒。`);
                    villager.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: c.id });
                }
            }
        }
    },
} satisfies Record<string, IRole>;
