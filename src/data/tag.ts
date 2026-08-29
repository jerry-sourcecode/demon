import { randint, runFn } from "@/utils/utils";
import { Time } from "../utils/time";
import { RoleMap, type Character, type DeadReasonType, type RoleType } from "./model";
import { NIGHT_CAUSES } from "./constants";
import { useDataStore } from "@/store/value";
import { logDeath, logDisguiseChange, logReputationChange, logSkillResolution, logConfusedChange, logWeatherInfo, logWeatherChange, logWeatherInfoHidden } from "./gameLog";

export const TagType = {
    /** 死亡 */
    dead: "dead",
    /** 神志不清（中毒/醉酒） */
    confused: "confused",
    /** 伪装 */
    disguise: "disguise",
    /** 获得的能力（亡骨魔保留爪牙 / 双面人获得镇民能力），meta 为能力角色数组 */
    gained: "gained",
    farmer: "farmer",
    recall: "recall",
    grandson: "grandson",
    /** 击杀时不优先的目标（痢蛭宿主 / 狐媚娘魅惑目标，按外来者同级处理） */
    unfavored: "unfavored",
    /** 保护（处决免疫 / 和平主义者 / 夜间守护），meta 为死因判定回调 */
    protect: "protect",
    /** 僵怖处于活死人状态 */
    alive: "alive",
    /** 极寒：冻僵（恶魔击杀的死亡结算延迟到黄昏） */
    frozen: "frozen",
    /** 蛊惑者：被视为邪恶（直到次日黎明），用于误导信息 */
    tempted: "tempted",
    /** 勒索者：次日无法发动主动技能，也无法被处决 */
    blocked: "blocked",
} as const;

export type TagType = typeof TagType[keyof typeof TagType];

/**
 * 各 Tag 的 meta 类型映射（自动推导）。
 * - 只需在此为「带 meta 的标签」声明类型；其余标签自动视为 meta: undefined。
 * - 新增标签：若不带 meta，仅需在 TagType 添加一行即可，无需改动这里。
 */
export type TagMetaMap = {
    dead: { type?: DeadReasonType; force?: boolean };
    disguise: RoleType;
    gained: RoleType[];
    farmer: RoleType;
    protect: ProtectFn;
} & Record<Exclude<TagType, 'dead' | 'disguise' | 'gained' | 'farmer' | 'protect'>, undefined>;

export interface ITag {
    type: TagType;
    /** 过期时间（Time.TIME_FAR_FUTURE 表示永久） */
    till: Time.TimeNumber;
    /** 施加者 ID（可选） */
    source?: number;
    /** 生效时间：标签延迟到该时间才生效。缺省=立即生效；到点前视为未生效 */
    at?: Time.TimeNumber;
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
        if (!p || p.isDead() || !p.isAwake('Pacifist')) return false;
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

/** 是否被保护：返回保护者的 source id；无保护返回 -1 */
export function isProtected(c: Character, cause: DeadReasonType): number {
    for (const t of c.getTag(TagType.protect)) {
        const fn = t.meta as unknown as ProtectFn;
        if (typeof fn === 'function' && fn(cause, c)) {
            return t.source ?? -1;
        }
    }
    return -1;
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


/** 多云天选者：首次濒死挡一次死亡，失去免疫并永久中毒；返回 true 表示已挡死 */
function cloudyShieldDeath(c: Character): boolean {
    const data = useDataStore();
    if (data.weather === 'cloudy' && c.id === data.cloudyChosenId && !data.cloudyChosenDied) {
        data.cloudyChosenDied = true;
        c.addTag(TagType.confused, { till: Time.FAR_FUTURE, source: 0 });
        logWeatherInfo(`多云守护：#${c.id} 免于死亡，但永久::poisoned::。`);
        return true;
    }
    return false;
}

/** 结算一次死亡：声望、死亡日志、殉情触发、清理相关标签。由 at===now 保证每次死亡只结算一次 */
export function settleDeath(c: Character, tg: ITag): void {
    const meta = (tg.meta ?? {}) as { type?: DeadReasonType };

    const data = useDataStore();
    const repBefore = data.reputation;
    const type = meta.type ?? 'other';
    let repDelta = 0;
    logDeath(c.id, type);
    // 月食：仅夜间死亡（恶魔/爪牙等夜间死因）不产生声望降低
    const eclipseNight = data.weather === 'eclipse' && NIGHT_CAUSES.includes(type);
    // 以真实阵营判定（tempted/隐士仅影响信息，不应影响声望结算）
    if (!c.isTrulyEvil() && !eclipseNight) {
        // 处决 -5，死于非命 -2（修复：此前 -3 只加在日志 delta，未真正扣除）
        const penalty = type === 'execute' ? 5 : 2;
        data.reputation -= penalty;
        repDelta = data.reputation - repBefore;
        logReputationChange(repDelta, type === 'execute' ? `#${c.id} 被处决` : `#${c.id} 死于非命`);
    } else if (!c.isTrulyEvil()) {
        logWeatherInfo(`#${c.id} 死于夜晚，但月食豁免了声望降低。`);
    }

    c.getTag(TagType.grandson).forEach(gt => {
        const grandma = data.chars.get(gt.source!);
        if (grandma?.isAwake('Grandma')) {
            logSkillResolution(grandma.id, `因为过度思念而殉情。`);
            grandma.addTag(TagType.dead);
        }
    });

    c.clearTags(TagType.farmer);
    c.clearTags(TagType.grandson);
}

/**
 * 全局处决前置钩子：统一保护判定。返回 false 阻止处决。
 * 角色级钩子为 RoleMap[role].beforeExecuted（原 onExecuted）。
 */
export function beforeExecuted(c: Character): boolean {
    const pid = isProtected(c, 'execute');
    if (pid !== -1) {
        logSkillResolution(c.id, `被处决成功但没有死亡（受到来自 #${pid} 的保护）。`);
        return false;
    }
    return true;
}

/** 全局处决后置钩子（可扩展，如全局声望/记录） */
export function afterExecuted(_c: Character): void {
    // 预留：全局处决副作用
}

/** Tag 间通用交互规则 */
export const TAG_RULES: Partial<Record<TagType, TagRule>> = {
    [TagType.frozen]: {
        beforeAdd(c, tag) {
            if (c.isDead()) return false;
            if (c.hasTag(TagType.frozen)) return false;
            return true;
        },
        afterRemove(c, tag) {
            // 冻僵到期（黄昏）时转为死亡，除非被守护救回
            const data = useDataStore();
            if (tag.till <= data.time && !c.isDead()) {
                const pid = isProtected(c, 'demon');
                if (pid !== -1) {
                    logWeatherInfo(`守护救回了冻僵的 #${c.id}（来自 #${pid}）。`);
                    return;
                }
                c.addTag(TagType.dead, { source: tag.source, meta: { type: 'demon' } });
            }
        },
    },
    [TagType.dead]: {
        beforeAdd(c, tag) {
            // 已真正死亡（非活死人）时阻止再次死亡
            if (c.isTrulyDead()) return false;
            // force：无视保护/天气/多云直接致死
            const force = (tag.meta as { force?: boolean } | undefined)?.force ?? false;
            if (force) return true;
            const cause = (tag.meta as { type?: DeadReasonType } | undefined)?.type ?? 'night';
            // 统一保护判定（处决免疫 / 和平主义者 / 夜间守护）
            const pid = isProtected(c, cause);
            if (pid !== -1) {
                logSkillResolution(c.id, `因为受到来自 #${pid} 的保护，没有死亡。`)
                return false
            };
            // 多云：天选者免疫一切死亡（首次濒死挡一次，失去免疫并永久中毒）
            if (cloudyShieldDeath(c)) return false;
            // 天气判定
            const data = useDataStore();
            // 极寒：恶魔击杀的目标进入「冻僵」，死亡结算延迟到当天黄昏（可被净化/守护移除）
            if (cause === 'demon' && data.weather === 'blizzard') {
                c.addTag(TagType.frozen, { till: Time.makeTime(Time.getDay(data.time), Time.Phase.Dusk), source: 0 });
                logWeatherInfo(`极寒：#${c.id} 被恶魔击杀，进入「冻僵」，死亡结算延迟到黄昏。`);
                return false;
            }
            // 暴雨：恶魔击杀有 40% 概率失败（痕迹被冲刷）
            if (cause === 'demon' && data.weather === 'rainstorm' && randint(1, 100) <= 40) {
                logWeatherInfoHidden(`暴雨冲刷了痕迹，恶魔的对 #${c.id} 的击杀失败了。`);
                return false;
            }
            return true;
        },
        afterAdd(c, tg) {
            // 立即死亡（at 已到）时立刻结算；延期死亡（at 在未来）由 settlePendingDeaths 到点结算
            const at = tg.at ?? 0;
            if (at <= useDataStore().time) settleDeath(c, tg);
        },
        afterRemove(c) {
            c.resetAllSkills();
        },
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
        beforeAdd(c) {
            // 多云：天选者尚未挡死前免疫 confused（始终保持清醒）
            const data = useDataStore();
            if (data.weather === 'cloudy' && c.id === data.cloudyChosenId && !data.cloudyChosenDied) {
                return false;
            }
            return true;
        },
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
