import { ref, type Ref } from "vue";
import { useDataStore } from "@/store/value";
import { Time } from "@/utils/time";
import type { RoleType } from "./model";

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
    | 'gameEnd';

// ── 各事件类型的 meta ──

interface GameStartMeta {
    roles: Record<number, RoleType>;
}

interface PhaseChangeMeta {
    phase: string;
}

interface RecallMeta {
    target: number;
    revealedInfo: string;
}

interface ExecuteMeta {
    target: number;
}

interface DeathMeta {
    cause: 'execute' | 'night' | 'other';
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
    /** 伪装身份（如有） */
    disguiseRole?: RoleType;
}

interface GameEndMeta {
    win: boolean;
    reputation: number;
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
    | GameEndMeta;

// ── 完整事件 ──

export interface GameEvent {
    id: number;
    type: GameEventType;
    time: Time.TimeNumber;
    timeStr: string;
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
        timeStr: dataStore.currentTimeString(),
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

export function logRecall(subject: number, target: number, info: string): void {
    addLog('recall', subject, { target, revealedInfo: info });
}

export function logExecute(subject: number, target: number): void {
    addLog('execute', subject, { target });
}

export function logDeath(subject: number, cause: 'execute' | 'night' | 'other'): void {
    addLog('death', subject, { cause });
}

export function logDisguiseChange(subject: number, oldRole?: RoleType, newRole?: RoleType): void {
    addLog('disguiseChange', subject, { oldRole, newRole });
}

export function logReputationChange(delta: number, reason: string): void {
    const dataStore = useDataStore();
    addLog('reputationChange', 0, { delta, reason, newValue: dataStore.reputation });
}

export function logSkillResolution(subject: number, detail: string): void {
    const dataStore = useDataStore();
    const c = dataStore.chars.get(subject);
    const confused = c ? c.hasTag('confused' as any) : false;
    const disguiseTg = c?.getTag('disguise' as any)[0];
    const disguised = !!disguiseTg;
    const disguiseRole = disguiseTg?.meta as RoleType | undefined;
    addLog('skillResolution', subject, { detail, disguised, confused, disguiseRole });
}

export function logGameEnd(win: boolean): void {
    const dataStore = useDataStore();
    addLog('gameEnd', 0, { win, reputation: dataStore.reputation });
}
