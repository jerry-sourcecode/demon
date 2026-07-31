import type { GameEvent } from "./gameLog";
import type { RoleType } from "./model";

/** 自定义对决配置 */
export interface MatchConfig {
    villager: number;
    outsider: number;
    minion: number;
    demon: number;
    /** 每轮行动力 */
    actionPoints: number;
    /** 初始声望 */
    reputation: number;
}

/** 对决记录统计 */
export interface MatchStats {
    totalDays: number;
    executeCount: number;
    recallCount: number;
    /** 主动技能发动次数 */
    skillActivateCount: number;
    /** 白天发动的技能次数（仅白天消耗行动力，黎明/黄昏/夜晚免费） */
    skillDayCount?: number;
    finalReputation: number;
    evilExecuted: number;
    goodAlive: number;
    evilTotal: number;
    goodTotal: number;
}

/** 最终角色状态（用于导入复盘时还原死亡/伪装） */
export interface FinalCharState {
    role: RoleType;
    dead: boolean;
    deathType?: string;
    disguiseRole?: RoleType;
}

/** 对决记录 */
export interface MatchRecord {
    id: string;
    date: string;
    config: MatchConfig;
    win: boolean;
    stats: MatchStats;
    /** 完整游戏日志事件 */
    events: GameEvent[];
    /** 初始角色分配 */
    initRoles: Record<number, RoleType>;
    /** 最终各角色状态（死亡、伪装等） */
    finalChars: Record<number, FinalCharState>;
}

/** 默认配置 */
export const DEFAULT_MATCH_CONFIG: MatchConfig = {
    villager: 6,
    outsider: 1,
    minion: 2,
    demon: 1,
    actionPoints: 10,
    reputation: 15,
};
