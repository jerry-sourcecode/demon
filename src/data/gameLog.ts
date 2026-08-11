import { ref, type Ref } from "vue";
import { useDataStore } from "@/store/value";
import { Time } from "@/utils/time";
import type { DeadReasonType, RoleType } from "./model";

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
    | 'confusedChange';

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
    /** 施加者 ID */
    source?: number;
    /** 施加者的角色（冻结快照） */
    sourceRole?: RoleType;
    /** 过期时间（仅 add 时有意义） */
    till?: Time.TimeNumber;
    /** 主体的角色（冻结快照） */
    role: RoleType;
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
    | ConfusedChangeMeta;

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

export function logGameStart(roles: Record<number, RoleType>): void {
    addLog('gameStart', 0, { roles });
}

export function logPhaseChange(): void {
    const dataStore = useDataStore();
    addLog('phaseChange', 0, {
        phase: Time.PHASE_NAMES[Time.getPhase(dataStore.time)],
    });
}

export function logRecall(target: number): void {
    addLog('recall', target, { target });
}

export function logExecute(target: number, alreadyDead: boolean = false): void {
    addLog('execute', 0, { target, alreadyDead });
}

export function logDeath(subject: number, cause: DeadReasonType): void {
    addLog('death', subject, { cause });
}

export function logDisguiseChange(subject: number, oldRole?: RoleType, newRole?: RoleType): void {
    addLog('disguiseChange', subject, { oldRole, newRole });
}

export function logReputationChange(delta: number, reason: string): void {
    const dataStore = useDataStore();
    addLog('reputationChange', 0, { delta, reason, newValue: dataStore.reputation });
}

/** 记录主动技能发动（信息面板显示，复盘隐藏） */
export function logSkillActivate(subject: number): void {
    addLog('skillActivate', subject, {});
}

export function logSkillResolution(subject: number, detail: string): void {
    const dataStore = useDataStore();
    const c = dataStore.chars.get(subject);
    const confused = c ? c.hasTag('confused' as any) : false;
    const confusedBy = c ? (c.getTag('confused' as any)[0] as any)?.source as number | undefined : undefined;
    const disguiseTg = c?.getTag('disguise' as any)[0];
    const disguised = !!disguiseTg;
    const disguiseRole = disguiseTg?.meta as RoleType | undefined;
    addLog('skillResolution', subject, { detail, disguised, confused, confusedBy, disguiseRole, role: c?.role ?? 'unknown' as RoleType });
}

export function logGameEnd(win: boolean, reason?: string): void {
    const dataStore = useDataStore();
    addLog('gameEnd', 0, { win, reputation: dataStore.reputation, reason });
}

export function logConfusedChange(
    subject: number,
    action: 'add' | 'remove',
    role: RoleType,
    source?: number,
    sourceRole?: RoleType,
    till?: Time.TimeNumber,
): void {
    addLog('confusedChange', subject, { action, role, source, sourceRole, till });
}
