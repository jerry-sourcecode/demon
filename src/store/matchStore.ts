import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MatchConfig, MatchRecord, MatchStats, FinalCharState } from '../data/match';
import { DEFAULT_MATCH_CONFIG } from '../data/match';
import { RoleMap, Faction, type Character, type RoleType } from '../data/model';
import { TagType } from '../data/tag';
import { Time } from '../utils/time';

const CONFIG_KEY = 'demon-match-config';
const RECORDS_KEY = 'demon-match-records';
const MAX_RECORDS = 500;

function loadJSON<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveJSON(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
}

export const useMatchStore = defineStore('match', () => {
    // ── 当前对决配置 ──

    const matchConfig = ref<MatchConfig>(
        loadJSON<MatchConfig>(CONFIG_KEY, DEFAULT_MATCH_CONFIG),
    );

    function setMatchConfig(config: MatchConfig) {
        matchConfig.value = { ...config };
        saveJSON(CONFIG_KEY, matchConfig.value);
    }

    // ── 对决记录 ──

    const matchRecords = ref<MatchRecord[]>(
        loadJSON<MatchRecord[]>(RECORDS_KEY, []),
    );

    function addMatchRecord(record: MatchRecord) {
        matchRecords.value.unshift(record);
        // 上限 500 条
        if (matchRecords.value.length > MAX_RECORDS) {
            matchRecords.value = matchRecords.value.slice(0, MAX_RECORDS);
        }
        saveJSON(RECORDS_KEY, matchRecords.value);
    }

    function deleteMatchRecord(id: string) {
        matchRecords.value = matchRecords.value.filter(r => r.id !== id);
        saveJSON(RECORDS_KEY, matchRecords.value);
    }

    function clearMatchRecords() {
        matchRecords.value = [];
        saveJSON(RECORDS_KEY, []);
    }

    function getMatchRecord(id: string): MatchRecord | undefined {
        return matchRecords.value.find(r => r.id === id);
    }

    // ── 工具：从游戏数据构建 MatchRecord ──

    function buildMatchRecord(
        config: MatchConfig,
        win: boolean,
        events: import('../data/gameLog').GameEvent[],
        initRoles: Record<number, RoleType>,
        chars: Map<number, Character>,
    ): MatchRecord {
        // 计算统计（以 gameEnd 事件的实际天数为准）
        const gameEndEvent = events.find(e => e.type === 'gameEnd');
        const totalDays = gameEndEvent ? Time.getDay(gameEndEvent.time) : 0;
        const executeCount = events.filter(e => e.type === 'execute').length;
        const recallCount = events.filter(e => e.type === 'recall').length;
        const skillActivateCount = events.filter(e => e.type === 'skillActivate').length;
        // 仅白天发动的技能消耗行动力（黎明/黄昏/夜晚免费），用于精确统计 AP 使用量
        const skillDayCount = events.filter(
            e => e.type === 'skillActivate' && Time.getPhase(e.time) === Time.Phase.Day,
        ).length;
        const endEvent = events.find(e => e.type === 'gameEnd');
        const finalReputation = (endEvent?.meta as any)?.reputation ?? 0;

        // 统计邪恶/善良
        function isTrulyEvil(c: Character): boolean {
            const fac = RoleMap[c.role]?.faction;
            return fac === Faction.demon || fac === Faction.minion;
        }

        const allChars = [...chars.values()];
        const evilTotal = allChars.filter(c => isTrulyEvil(c)).length;
        const goodTotal = allChars.filter(c => !isTrulyEvil(c)).length;
        const goodAlive = allChars.filter(c => !isTrulyEvil(c) && !c.hasTag(TagType.dead)).length;

        const executedIds = new Set(
            events
                .filter(e => e.type === 'execute')
                .map(e => (e.meta as any)?.target as number)
                .filter(Boolean),
        );
        let evilExecuted = 0;
        for (const id of executedIds) {
            const c = chars.get(id);
            if (c && isTrulyEvil(c)) evilExecuted++;
        }

        const stats: MatchStats = {
            totalDays,
            executeCount,
            recallCount,
            skillActivateCount,
            skillDayCount,
            finalReputation,
            evilExecuted,
            goodAlive,
            evilTotal,
            goodTotal,
        };

        // 构建最终角色状态
        const finalChars: Record<number, FinalCharState> = {};
        chars.forEach((c, id) => {
            const deadTag = c.getTag(TagType.dead)[0];
            const disguiseTag = c.getTag(TagType.disguise)[0];
            finalChars[id] = {
                role: c.role,
                alignment: c.alignment,
                dead: c.hasTag(TagType.dead),
                deathType: (deadTag?.meta as any)?.type,
                disguiseRole: disguiseTag?.meta as RoleType | undefined,
            };
        });

        return {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            date: new Date().toISOString(),
            config: { ...config },
            win,
            stats,
            events: [...events],
            initRoles: { ...initRoles },
            finalChars,
        };
    }

    return {
        matchConfig,
        setMatchConfig,
        matchRecords,
        addMatchRecord,
        deleteMatchRecord,
        clearMatchRecords,
        getMatchRecord,
        buildMatchRecord,
    };
});
