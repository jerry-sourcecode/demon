/**
 * 游戏全局常量（集中管理，方便统一调整）
 */

/** 夜间死亡死因（月食仅豁免这些；月食仅隐藏这些死因的玩家身份） */
export const NIGHT_CAUSES: string[] = [
    'demon',
    'assassin',
    'night',
    'moonchild',
    'slayer',
];

/** 各操作消耗的行动点 */
export const ACTION_COST = {
    /** 发动技能 */
    skill: 2,
    /** 处决 */
    execute: 3,
    /** 回忆 */
    recall: 2,
} as const;

/** 重掷天气消耗的声望 */
export const REROLL_WEATHER_COST = 2;
