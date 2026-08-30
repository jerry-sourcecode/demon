import { ref, type Ref } from "vue";
import { useDataStore } from "@/store/value";
import { Time } from "@/utils/time";
import type { DeadReasonType, RoleType } from "./model";
import type { WeatherType } from "./weather";

// ── 事件类型 ──

export type GameEventType =
    | 'gameStart'
    | 'phaseChange'
    | 'recall'
    | 'execute'
    | 'death'
    | 'disguiseChange'
    | 'reputationChange'
    | 'skillResolution'
    | 'skillActivate'
    | 'gameEnd'
    | 'confusedChange'
    | 'weatherChange'
    | 'weatherInfo'
    | 'announcement';

// ── 各事件类型的 meta ──

interface GameStartMeta {
    roles: Record<number, RoleType>;
}

interface PhaseChangeMeta {
    phase: string;
}

interface RecallMeta {
    target: number;
}

interface ExecuteMeta {
    target: number;
    /** 执行处决时目标是否已死亡（用于区分“再次处决”） */
    alreadyDead?: boolean;
}

interface DeathMeta {
    cause: DeadReasonType;
}

interface DisguiseChangeMeta {
    oldRole?: RoleType;
    newRole?: RoleType;
}

interface ReputationChangeMeta {
    delta: number;
    reason: string;
    newValue: number;
}

interface SkillResolutionMeta {
    detail: string;
    /** 技能结算时主体是否伪装 */
    disguised: boolean;
    /** 技能结算时主体是否混乱 */
    confused: boolean;
    /** 混乱来源（施加者 ID） */
    confusedBy?: number;
    /** 伪装身份（如有） */
    disguiseRole?: RoleType;
    /** 技能结算时主体的角色（避免后续角色变更影响回放） */
    role: RoleType;
}

interface SkillActivateMeta {
    /** 无额外信息，仅记录谁发动了技能 */
}

interface GameEndMeta {
    win: boolean;
    reputation: number;
    reason?: string;
}

interface ConfusedChangeMeta {
    action: 'add' | 'remove';
    /** 施加者 ID 或名称 */
    source?: number | string;
    /** 施加者的角色（冻结快照） */
    sourceRole?: RoleType;
    /** 过期时间（仅 add 时有意义） */
    till?: Time.TimeNumber;
    /** 主体的角色（冻结快照） */
    role: RoleType;
}

interface WeatherChangeMeta {
    weather: WeatherType;
    action: 'roll' | 'reroll';
}

interface WeatherInfoMeta {
    detail: string;
    /** 为 true 时不在信息面板显示（仅用于复盘/诊断） */
    hidden?: boolean;
}

/** 公开公告（显示在信息面板，用于明确告知玩家某件事，如勒索者的目标） */
interface AnnouncementMeta {
    detail: string;
}

export type GameEventMeta =
    | GameStartMeta
    | PhaseChangeMeta
    | RecallMeta
    | ExecuteMeta
    | DeathMeta
    | DisguiseChangeMeta
    | ReputationChangeMeta
    | SkillResolutionMeta
    | SkillActivateMeta
    | GameEndMeta
    | ConfusedChangeMeta
    | WeatherChangeMeta
    | WeatherInfoMeta
    | AnnouncementMeta;

// ── 完整事件 ──

export interface GameEvent {
    id: number;
    type: GameEventType;
    time: Time.TimeNumber;
    subject: number;
    meta: GameEventMeta;
}

// ── 全局日志数组 ──

const _log: Ref<GameEvent[]> = ref([]);
let _idCounter = 0;

/** 获取当前日志 */
export function gameLog(): Ref<GameEvent[]> {
    return _log;
}

/** 清空日志（新游戏开始时调用） */
export function clearLog(): void {
    _log.value = [];
    _idCounter = 0;
}

/** 直接设置日志（导入复盘时使用） */
export function setLog(events: GameEvent[]): void {
    _log.value = events;
    _idCounter = events.length > 0 ? Math.max(...events.map(e => e.id)) : 0;
}

// ── 添加日志 ──

export function addLog(
    type: GameEventType,
    subject: number,
    meta: GameEventMeta,
): void {
    const dataStore = useDataStore();
    const event: GameEvent = {
        id: ++_idCounter,
        type,
        time: dataStore.time,
        subject,
        meta,
    };
    _log.value.push(event);
}

// ── 快捷添加函数 ──
// 展示说明：①信息面板（右侧实时事件流）②复盘（GameOverModal 时间线）
// 记号：✓显示 ✗隐藏

/** 游戏开始（初始发牌）（信息面板✗ 复盘✓） */
export function logGameStart(roles: Record<number, RoleType>): void {
    addLog('gameStart', 0, { roles });
}

/** 阶段切换（进入夜晚/黎明/白天/黄昏）（信息面板✓ 复盘✓） */
export function logPhaseChange(): void {
    const dataStore = useDataStore();
    addLog('phaseChange', 0, {
        phase: Time.PHASE_NAMES[Time.getPhase(dataStore.time)],
    });
}

/** 回忆（信息面板✓ 复盘✓） */
export function logRecall(target: number): void {
    addLog('recall', target, { target });
}

/** 处决（信息面板✓ 复盘✓） */
export function logExecute(target: number, alreadyDead: boolean = false): void {
    addLog('execute', 0, { target, alreadyDead });
}

/** 死亡（信息面板✓[仅非处决死亡] 复盘✓） */
export function logDeath(subject: number, cause: DeadReasonType): void {
    addLog('death', subject, { cause });
}

/** 伪装变更（信息面板✗ 复盘✓） */
export function logDisguiseChange(subject: number, oldRole?: RoleType, newRole?: RoleType): void {
    addLog('disguiseChange', subject, { oldRole, newRole });
}

/** 声望变化（信息面板✓ 复盘✓） */
export function logReputationChange(delta: number, reason: string): void {
    const dataStore = useDataStore();
    addLog('reputationChange', 0, { delta, reason, newValue: dataStore.reputation });
}

/** 主动技能发动（信息面板✓ 复盘✗） */
export function logSkillActivate(subject: number): void {
    addLog('skillActivate', subject, {});
}

/** 技能结算（信息面板✗ 复盘✓） */
export function logSkillResolution(subject: number, detail: string): void {
    const dataStore = useDataStore();
    const c = dataStore.chars.get(subject);
    const confused = c ? c.hasTag('confused' as any) : false;
    const confusedBy = c ? (c.getTag('confused' as any)[0] as any)?.source as number | string | undefined : undefined;
    const disguiseTg = c?.getTag('disguise' as any)[0];
    const disguised = !!disguiseTg;
    const disguiseRole = disguiseTg?.meta as RoleType | undefined;
    addLog('skillResolution', subject, { detail, disguised, confused, confusedBy, disguiseRole, role: c?.role ?? 'unknown' as RoleType });
}

/** 游戏结束（信息面板✓ 复盘✓） */
export function logGameEnd(win: boolean, reason?: string): void {
    const dataStore = useDataStore();
    addLog('gameEnd', 0, { win, reputation: dataStore.reputation, reason });
}

/** 混乱状态变化（信息面板✗ 复盘✓） */
export function logConfusedChange(
    subject: number,
    action: 'add' | 'remove',
    role: RoleType,
    source?: number | string,
    sourceRole?: RoleType,
    till?: Time.TimeNumber,
): void {
    addLog('confusedChange', subject, { action, role, source, sourceRole, till });
}

/** 天气改变（掷出/重掷）（信息面板✗ 复盘✓） */
export function logWeatherChange(weather: WeatherType, action: 'roll' | 'reroll'): void {
    addLog('weatherChange', 0, { weather, action });
}

/** 天气告知信息（如雷暴揭示、双子月线索、血月选择等）（信息面板✓ 复盘✓） */
export function logWeatherInfo(detail: string): void {
    addLog('weatherInfo', 0, { detail });
}

/** 天气日志（隐藏，仅用于复盘/诊断，如暴雨未命中）（信息面板✗ 复盘✓） */
export function logWeatherInfoHidden(detail: string): void {
    addLog('weatherInfo', 0, { detail, hidden: true });
}

/** 公开公告（明确告知玩家，如勒索者目标、痢蛭宿主死亡）（信息面板✓ 复盘✓） */
export function logAnnouncement(detail: string): void {
    addLog('announcement', 0, { detail });
}
