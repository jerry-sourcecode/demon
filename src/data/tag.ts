import { randint, runFn } from "@/utils/utils";
import { Time } from "../utils/time";
import { RoleMap, type Character, type DeadReasonType, type RoleType } from "./model";
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
    /** 获得的能力（亡骨魔保留爪牙 / 双面人获得镇民能力），meta 为能力角色数组 */
    gained: "gained",
    farmer: "farmer",
    recall: "recall",
    grandson: "grandson",
    executed: "executed",
    /** 击杀时不优先的目标（痢蛭宿主 / 狐媚娘魅惑目标，按外来者同级处理） */
    unfavored: "unfavored",
    /** 保护（处决免疫 / 和平主义者 / 夜间守护），meta 为死因判定回调 */
    protect: "protect",
    /** 僵怖处于活死人状态 */
    alive: "alive",
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

// ── 保护判定（处决免疫 / 和平主义者 / 夜间守护 合并为 protect） ──

/** 保护回调：传入死因与被保护目标，返回是否保护 */
export type ProtectFn = (cause: DeadReasonType, target?: Character) => boolean;

/** 保护规则的可序列化描述（用于存档重建回调） */
export interface ProtectDesc {
    kind: 'dayExecute' | 'pacifist' | 'nightGuard';
    day?: number;
    source?: number;
}

/** 保护规则工厂：根据可序列化描述生成回调 */
const PROTECT_FACTORIES: Record<ProtectDesc['kind'], (d: ProtectDesc) => ProtectFn> = {
    // 处决免疫（魔鬼代言人）：当天处决不死亡
    dayExecute: (d) => (cause) =>
        cause === 'execute' && Time.getDay(useDataStore().time) === d.day,
    // 和平主义者：处决有 60% 概率不死亡（施法者存活且清醒，且目标阵营不为邪恶）
    pacifist: (d) => (cause, target) => {
        if (cause !== 'execute') return false;
        // 不保护阵营为邪恶的玩家（如被狐媚娘转变阵营）
        if (target?.isEvil()) return false;
        const p = useDataStore().chars.get(d.source!);
        if (!p || p.hasTag(TagType.dead) || !p.isAwake('Pacifist')) return false;
        return randint(1, 10) <= 6;
    },
    // 夜间守护（士兵/武僧/旅店老板）：非处决死因不死亡
    nightGuard: () => (cause) => cause !== 'execute',
};

/** 创建保护回调（附带可序列化信息，便于存档重建） */
export function makeProtect(desc: ProtectDesc): ProtectFn {
    const fn = PROTECT_FACTORIES[desc.kind](desc);
    (fn as { __desc?: ProtectDesc }).__desc = desc;
    return fn;
}

/** 序列化保护回调 → 可序列化描述 */
export function serializeProtectMeta(fn: ProtectFn): ProtectDesc | null {
    return (fn as { __desc?: ProtectDesc }).__desc ?? null;
}

/** 反序列化保护描述 → 回调（附带可序列化信息，支持再次存档） */
export function restoreProtectMeta(desc: ProtectDesc): ProtectFn {
    const fn = PROTECT_FACTORIES[desc.kind]?.(desc) ?? (() => false);
    (fn as { __desc?: ProtectDesc }).__desc = desc;
    return fn;
}

/** 是否被保护：遍历 protect tag，调用其回调判定指定死因 */
export function isProtected(c: Character, cause: DeadReasonType): boolean {
    return c.getTag(TagType.protect).some(t => {
        const fn = t.meta as unknown as ProtectFn;
        return typeof fn === 'function' && fn(cause, c);
    });
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
        beforeAdd(c, tag) {
            if (c.hasTag(TagType.dead)) return false;
            if (c.hasTag(TagType.dying)) return false;
            const cause = (tag.meta as { type?: DeadReasonType } | undefined)?.type ?? 'night';
            if (isProtected(c, cause)) {
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
            if (c.hasTag(TagType.dead) && !c.hasTag(TagType.alive)) return false;
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
            if (c.hasTag(TagType.dead) && !c.hasTag(TagType.alive)) return false;
            // 统一保护判定：处决死因（处决免疫 / 和平主义者）
            if (isProtected(c, 'execute')) {
                logSkillResolution(c.id, `被处决成功但没有死亡（受到保护）。`)
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
            // 去重：双面人同时拥有 disguise 与 gained（同一角色）时，onRecall 只应触发一次
            const invoked = new Set<RoleType>([c.role]);
            runFn(RoleMap[c.role]!.onRecall, c);
            if (c.hasTag(TagType.disguise)) {
                const dis_role = c.getTag(TagType.disguise)[0]!.meta;
                if (!invoked.has(dis_role)) {
                    invoked.add(dis_role);
                    runFn(RoleMap[dis_role].onRecall, c);
                }
            }
            // 获得的能力也触发 onRecall（如双面人获得的镇民技能）
            for (const tg of c.getTag(TagType.gained)) {
                for (const r of tg.meta as RoleType[]) {
                    if (!invoked.has(r)) {
                        invoked.add(r);
                        runFn(RoleMap[r]?.onRecall, c);
                    }
                }
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
