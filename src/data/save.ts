import type { GameEvent } from "./gameLog";
import { setLog } from "./gameLog";
import type { MatchConfig } from "./match";
import { Character, type RoleType } from "./model";
import type { TagType } from "./tag";
import type { Time } from "@/utils/time";

// Infinity 无法被 JSON 正确序列化，用特殊标记代替
const INF_MARKER = "__INF__";
function saveTill(t: number): number | string {
    return t === Infinity ? INF_MARKER : t;
}
function restoreTill(t: number | string): number {
    return t === INF_MARKER ? Infinity : (t as number);
}

// ── 存档数据接口 ──

export interface CharSaveData {
    id: number;
    role: RoleType;
    info: string[];
    displayRole: RoleType;
    tags: { type: TagType; till: Time.TimeNumber; source?: number; meta?: any }[];
    customTags: string[];
    dynamicTags: string[];
    skillUses: [string, { used: number; max: number }][];
}

export interface GameSaveData {
    chars: CharSaveData[];
    time: Time.TimeNumber;
    reputation: number;
    actionPoints: number;
    maxActionPoints: number;
    gameOver: boolean;
    gameLog: GameEvent[];
    knownGoodRoles: RoleType[];
    possibleEvil: RoleType[];
    villagerMin: number;
    villagerMax: number;
    outsiderMin: number;
    outsiderMax: number;
    currentMatchConfig: MatchConfig | null;
    initCounts: { villager: number; outsider: number; minion: number; demon: number };
    date: string;
}

const SAVE_KEY = "demon-save";

// ── 序列化 ──

export function serializeChars(
    chars: Map<number, Character>,
): CharSaveData[] {
    const result: CharSaveData[] = [];
    for (const [id, c] of chars) {
        // 提取 _skillUses（Map → array）
        const skillUses: [string, { used: number; max: number }][] = [];
        (c as any)._skillUses?.forEach?.(
            (val: { used: number; max: number }, key: string) => {
                skillUses.push([key, { ...val }]);
            },
        );
        result.push({
            id,
            role: c.role,
            info: [...c.info],
            displayRole: c.displayRole,
            tags: c.tags.map((t) => ({
                type: t.type,
                till: saveTill(t.till) as any,
                source: t.source,
                meta: t.meta !== undefined ? JSON.parse(JSON.stringify(t.meta)) : undefined,
            })),
            customTags: [...c.customTags],
            dynamicTags: [...c.dynamicTags],
            skillUses,
        });
    }
    return result.sort((a, b) => a.id - b.id);
}

// ── 反序列化 ──

export function deserializeChars(
    data: CharSaveData[],
): Map<number, Character> {
    const map = new Map<number, Character>();
    for (const d of data) {
        const c = new Character(d.id, d.role);
        c.info = [...d.info];
        c.displayRole = d.displayRole;
        c.tags = d.tags.map((t) => ({
            type: t.type,
            till: restoreTill(t.till as any),
            source: t.source,
            meta: t.meta !== undefined ? JSON.parse(JSON.stringify(t.meta)) : undefined,
        })) as any;
        c.customTags = [...d.customTags];
        c.dynamicTags = [...d.dynamicTags];
        // 恢复 _skillUses
        const m = new Map<string, { used: number; max: number }>();
        for (const [key, val] of d.skillUses ?? []) {
            m.set(key, { ...val });
        }
        (c as any)._skillUses = m;
        map.set(d.id, c);
    }
    return map;
}

// ── SaveService ──

export function saveGame(
    chars: Map<number, Character>,
    time: Time.TimeNumber,
    reputation: number,
    actionPoints: number,
    maxActionPoints: number,
    gameOver: boolean,
    gameLog: GameEvent[],
    knownGoodRoles: Set<RoleType>,
    possibleEvil: RoleType[],
    villagerMin: number,
    villagerMax: number,
    outsiderMin: number,
    outsiderMax: number,
    currentMatchConfig: MatchConfig | null,
    initCounts: { villager: number; outsider: number; minion: number; demon: number },
): void {
    const data: GameSaveData = {
        chars: serializeChars(chars),
        time,
        reputation,
        actionPoints,
        maxActionPoints,
        gameOver,
        gameLog: [...gameLog],
        knownGoodRoles: [...knownGoodRoles],
        possibleEvil: [...possibleEvil],
        villagerMin,
        villagerMax,
        outsiderMin,
        outsiderMax,
        currentMatchConfig: currentMatchConfig ? { ...currentMatchConfig } : null,
        initCounts: { ...initCounts },
        date: new Date().toISOString(),
    };
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("存档失败:", e);
    }
}

export function loadGame(): GameSaveData | null {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as GameSaveData;
    } catch {
        return null;
    }
}

export function hasSaveGame(): boolean {
    try {
        return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
        return false;
    }
}

export function deleteSave(): void {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch { /* ignore */ }
}
