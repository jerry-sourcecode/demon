import { runFn } from "@/utils/utils";
import { Time } from "../utils/time";
import { RoleMap, type Character, type DeadReasonType } from "./model";
import { useDataStore } from "@/store/value";
import { logDeath, logDisguiseChange, logReputationChange, logSkillResolution, logConfusedChange } from "./gameLog";

export const TagType = {
    /** 死亡 */
    dead: "dead",
    /** 濒死（到期后转为死亡） */
    dying: "dying",
    /** 神志不清（中毒/醉酒） */
    confused: "confused",
    /** 伪装 */
    disguise: "disguise",
    /** 处决免疫（魔鬼代言人） */
    executionImmune: "executionImmune",
    farmer: "farmer",
    recall: "recall",
    grandson: "grandson",
    executed: "executed",
    nemesis: "nemesis",
    /** 旅店老板保护（当夜免疫死亡） */
    protect: "protect",
    /** 亡骨魔保留（死亡爪牙仍参与夜间行动） */
    retained: "retained"
} as const;

export type TagType = typeof TagType[keyof typeof TagType];

export interface ITag {
    type: TagType;
    /** 过期时间（Time.TIME_FAR_FUTURE 表示永久） */
    till: Time.TimeNumber;
    /** 施加者 ID（可选） */
    source?: number;
    /** 额外信息（可选） */
    meta?: unknown;
}

// ── Tag 交互规则 ──

export interface TagRule {
    /** 施加前检查，返回 false 阻止该层 */
    beforeAdd?: (c: Character, tag: ITag) => boolean;
    /** 施加后副作用 */
    afterAdd?: (c: Character, tag: ITag) => void;
    /** 移除前检查，返回 false 阻止移除 */
    beforeRemove?: (c: Character, tag: ITag) => boolean;
    /** 移除后副作用 */
    afterRemove?: (c: Character, tag: ITag) => void;
}

/** Tag 间通用交互规则 */
export const TAG_RULES: Partial<Record<TagType, TagRule>> = {
    [TagType.dying]: {
        beforeAdd(c) {
            if (c.hasTag(TagType.dead)) return false;
            if (c.hasTag(TagType.dying)) return false;
            if (c.hasTag(TagType.protect)) {
                logSkillResolution(c.id, `因为技能没有死亡。`)
                return false
            };
            return true;
        },
        afterRemove(c, tag) {
            // 濒死到期时转为死亡（避免重复触发：clearTags 也可能调用此回调）
            const now = useDataStore().time;
            if (tag.till <= now && !c.hasTag(TagType.dead)) {
                c.addTag(TagType.dead,
                    {
                        source: tag.source,
                        force: (tag.meta as { force?: boolean })?.force ?? false,
                        meta: {
                            type: (tag.meta as { type?: any })?.type ?? 'other',
                        }
                    }
                );
            }
        }
    },
    [TagType.dead]: {
        beforeAdd(c) {
            if (c.hasTag(TagType.dead)) return false;
            return true;
        },
        afterAdd(c, tg) {
            const data = useDataStore();
            const repBefore = data.reputation;
            const type = (tg.meta as { type?: DeadReasonType })?.type ?? 'other';
            let repDelta = 0;
            logDeath(c.id, type);
            if (!c.isEvil()) {
                data.reputation -= 2;
                repDelta = data.reputation - repBefore;
                if (type === 'execute') {
                    repDelta -= 3;
                    logReputationChange(repDelta, `#${c.id} 被处决`);
                } else {
                    logReputationChange(repDelta, `#${c.id} 死于非命`);
                }
            }

            c.getTag(TagType.grandson).forEach(tg => {
                const grandma = data.chars.get(tg.source!);
                if (grandma?.isAwake('Grandma')) {
                    logSkillResolution(grandma.id, `因为过度思念而殉情。`)
                    grandma.addTag(TagType.dead);
                }
            })

            c.clearTags(TagType.dying);
            c.clearTags(TagType.farmer);
            c.clearTags(TagType.grandson);
            c.clearTags(TagType.executed);
        },
        afterRemove(c) {
            c.resetAllSkills();
        },
    },
    [TagType.executed]: {
        beforeAdd(c) {
            if (c.hasTag(TagType.dead)) return false;
            const now = useDataStore().time;
            const currentDay = Time.getDay(now);
            if (c.getTag(TagType.executionImmune).some(t => t.meta?.day === currentDay)) {
                logSkillResolution(c.id, `被处决成功但没有死亡。`)
                return false;
            }
            // 调用角色的 onExecuted 钩子（如骑士免疫、圣徒结束游戏）
            if (runFn(RoleMap[c.role]?.onExecuted, c) === false) return false;
            return true;
        },
        afterAdd(c) {
            const data = useDataStore();
            if (!c.isEvil()) {
                data.reputation -= 3;
            }
            c.addTag('dead', { meta: { type: 'execute' } });
        }
    },
    [TagType.recall]: {
        afterAdd(c) {
            c.displayRole = c.getTag(TagType.disguise)[0]?.meta ?? c.role;
            runFn(RoleMap[c.role]!.onRecall, c);
            if (c.hasTag(TagType.disguise)) {
                const dis_role = c.getTag(TagType.disguise)[0]!.meta;
                runFn(RoleMap[dis_role].onRecall, c);
            }
        },
    },
    [TagType.disguise]: {
        afterAdd(c, tag) {
            logDisguiseChange(c.id, undefined, tag.meta as any);
        },
        afterRemove(c) {
            logDisguiseChange(c.id, c.role, undefined);
            c.displayRole = c.role;
        },
    },
    [TagType.confused]: {
        afterAdd(c, tag) {
            // 仅在首次获得 confused 时记录（从清醒→混乱）
            if (c.getTagCount(TagType.confused) === 1) {
                const dataStore = useDataStore();
                const source = tag.source;
                const sourceC = source ? dataStore.chars.get(source) : undefined;
                logConfusedChange(
                    c.id,
                    'add',
                    c.role,
                    source,
                    sourceC?.role,
                    tag.till,
                );
            }
        },
        afterRemove(c, tag) {
            // 仅在最后一层 confused 被移除时记录（从混乱→清醒）
            // 注意：不能用 getTagCount，因为 pruneExpiredTags 中已过期的标签不再满足 till > now
            const totalConfused = c.tags.filter(t => t.type === TagType.confused).length;
            if (totalConfused === 1) {
                const dataStore = useDataStore();
                const source = tag.source;
                const sourceC = source ? dataStore.chars.get(source) : undefined;
                logConfusedChange(
                    c.id,
                    'remove',
                    c.role,
                    source,
                    sourceC?.role,
                );
            }
        },
    },
};
