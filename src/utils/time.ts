/**
 * 时间定义逻辑
 *
 * 时间数字编码规则：
 * - 个位（1~4）表示时段，1=夜晚，2=黎明，3=白天，4=黄昏
 * - 除去个位后的数字表示第几天
 *
 * 例：123 表示第 12 天的白天（3）
 */

export namespace Time {

    // ── 时段 ──

    /** 时段：1=夜晚，2=黎明，3=白天，4=黄昏 */
    export type Phase = 1 | 2 | 3 | 4;

    export const Phase = {
        /** 夜晚 */
        Night: 1,
        /** 黎明 */
        Dawn: 2,
        /** 白天 */
        Day: 3,
        /** 黄昏 */
        Dusk: 4,
    } as const;

    export const PHASE_NAMES: Record<Phase, string> = {
        [Phase.Night]: "夜晚",
        [Phase.Dawn]: "黎明",
        [Phase.Day]: "白天",
        [Phase.Dusk]: "黄昏",
    };

    // ── 时间数字 ──

    /**
     * 时间数字：由「第几天」和「时段」组合而成的编码值。
     * 值 = day × 10 + phase，其中 phase ∈ {1,2,3,4}。
     */
    export type TimeNumber = number & { readonly __brand: 'TimeNumber' };

    /** 未开始的哨兵值 */
    export const NOT_STARTED = 0 as TimeNumber;

    /** 无限远的未来（如永久持续的效果） */
    export const FAR_FUTURE = Infinity as TimeNumber;


    // ── 构造与解构 ──

    /** 根据第 day 天和时段 phase 生成时间数字 */
    export function makeTime(day: number, phase: Phase): TimeNumber {
        return (day * 10 + phase) as TimeNumber;
    }

    /** 从时间数字中提取第几天 */
    export function getDay(t: TimeNumber): number {
        return Math.floor(t / 10);
    }

    /** 从时间数字中提取时段 */
    export function getPhase(t: TimeNumber): Phase {
        return (t % 10) as Phase;
    }

    // ── 遍历 ──

    /** 获取当前时间的下一个时间数字 */
    export function nextTime(t: TimeNumber): TimeNumber {
        if (t === NOT_STARTED) {
            return makeTime(1, Phase.Night); // 第 1 天夜晚
        }
        const day = getDay(t);
        const phase = getPhase(t);
        if (phase < Phase.Dusk) {
            return makeTime(day, (phase + 1) as Phase);
        }
        return makeTime(day + 1, Phase.Night);
    }

    // ── 格式化 ──

    /** 将时间数字格式化为可读字符串 */
    export function getTimeString(t: TimeNumber): string {
        if (t === NOT_STARTED) return "游戏未开始";
        if (!isFinite(t)) return "永久";
        const day = getDay(t);
        const phase = getPhase(t);
        return `第${day}天${PHASE_NAMES[phase]}`;
    }

}
