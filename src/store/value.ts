import { defineStore } from 'pinia'
import { RoleMap, Faction, type Character, type RoleType } from '../data/model'
import { ref, type Ref, computed } from 'vue';
import { Time } from '../utils/time';
import { TagType } from '../data/tag';
import { gameLog as getLog, clearLog, setLog, type GameEvent, logPhaseChange } from '../data/gameLog';
import type { MatchConfig } from '../data/match';
import { saveGame as saveToStorage, loadGame as loadFromStorage, hasSaveGame as hasSaveInStorage, deleteSave as removeSave, deserializeChars } from '../data/save';
export const ACTION_COST = {
    skill: 2,
    execute: 3,
    recall: 2,
} as const;

export const useDataStore = defineStore('data', () => {
    const chars: Ref<Map<number, Character>> = ref(new Map);

    const time = ref<Time.TimeNumber>(Time.NOT_STARTED);

    const reputation = ref(0);

    const actionPoints = ref(10);
    const maxActionPoints = ref(10);

    const gameOver = ref(false);

    /** 尚存活的真正邪恶角色（仅恶魔和爪牙，陌客不算） */
    const evilAlive = computed(() =>
        [...chars.value.values()].filter(c =>
            c.isTrulyEvil() && !c.hasTag(TagType.dead)
        )
    );

    /** 游戏日志（复盘数据） */
    const gameLog: Ref<GameEvent[]> = getLog();

    /** 初始配置人数（用于界面显示） */
    const initCounts = ref({ villager: 6, outsider: 1, minion: 1, demon: 1 });

    /** Tab 面板：已揭示的善良身份（含邪恶伪装身份） */
    const knownGoodRoles = ref(new Set<RoleType>());

    /** Tab 面板：可能的邪恶身份 */
    const possibleEvil = ref<RoleType[]>([]);

    /** Tab 面板：镇民数量范围 */
    const villagerMin = ref(6);
    const villagerMax = ref(6);

    /** Tab 面板：外来者数量范围 */
    const outsiderMin = ref(1);
    const outsiderMax = ref(1);

    /** 确保范围总是小~大 */
    const displayVillagerRange = computed(() =>
        villagerMin.value <= villagerMax.value
            ? { min: villagerMin.value, max: villagerMax.value }
            : { min: villagerMax.value, max: villagerMin.value }
    );
    const displayOutsiderRange = computed(() =>
        outsiderMin.value <= outsiderMax.value
            ? { min: outsiderMin.value, max: outsiderMax.value }
            : { min: outsiderMax.value, max: outsiderMin.value }
    );

    /** AI 配置 */
    const AI_STORAGE_KEY = 'demon-ai-config';
    const aiConfigured = ref(false);
    const aiConfig = ref<{ service: "deepseek" | "siliconflow"; apiKey: string; model: string }>(
        loadAiConfig() ?? { service: 'deepseek', apiKey: '', model: 'deepseek-chat' }
    );

    /** 当前对局的配置（用于游戏结束时保存记录） */
    const currentMatchConfig = ref<MatchConfig | null>(null);

    // 初始化时检查 localStorage
    function loadAiConfig(): { service: "deepseek" | "siliconflow"; apiKey: string; model: string } | null {
        try {
            const raw = localStorage.getItem(AI_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed.service && parsed.apiKey && parsed.model) {
                aiConfigured.value = true;
                return parsed;
            }
        } catch { /* ignore */ }
        return null;
    }

    function setAiConfig(service: "deepseek" | "siliconflow", apiKey: string, model: string) {
        aiConfig.value = { service, apiKey, model };
        aiConfigured.value = true;
        try {
            localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(aiConfig.value));
        } catch { /* ignore */ }
    }

    function getAiConfig(): { service: "deepseek" | "siliconflow"; apiKey: string; model: string } | null {
        if (!aiConfigured.value) return null;
        return { ...aiConfig.value };
    }

    function addKnownGoodRole(role: RoleType) {
        const fac = RoleMap[role]?.faction;
        if (fac === Faction.villager || fac === Faction.outsider) {
            knownGoodRoles.value = new Set([...knownGoodRoles.value, role]);
        }
    }

    function initKnownGoodRoles(roles: RoleType[]) {
        knownGoodRoles.value = new Set(roles);
    }

    function initPossibleEvil(roles: RoleType[]) {
        possibleEvil.value = roles;
    }

    function nextTime() {
        time.value = Time.nextTime(time.value);
        logPhaseChange();
        chars.value.forEach(c => c.pruneExpiredTags());
    }

    function currentTimeString(): string {
        return Time.getTimeString(time.value);
    }

    function playerNumber() {
        return chars.value.size;
    }

    function charList() {
        return [...chars.value.values()]
    }

    function canAfford(cost: number): boolean {
        return actionPoints.value >= cost;
    }

    function canSpendActionPoints(cost: number): boolean {
        if (actionPoints.value < cost) return false;
        actionPoints.value -= cost;
        return true;
    }

    function resetActionPoints() {
        actionPoints.value = maxActionPoints.value;
    }

    function resetGame() {
        // 清空角色自定义标签
        chars.value.forEach(c => { c.customTags = []; c.dynamicTags = []; });
        chars.value = new Map();
        time.value = Time.NOT_STARTED;
        reputation.value = 0;
        actionPoints.value = maxActionPoints.value;
        gameOver.value = false;
        knownGoodRoles.value = new Set();
        possibleEvil.value = [];
        currentMatchConfig.value = null;
        // 清空角色自定义标签
        chars.value.forEach(c => { c.customTags = []; c.dynamicTags = []; });
        clearLog();
    }

    // ── 存档 ──

    function saveGame() {
        saveToStorage(
            chars.value,
            time.value,
            reputation.value,
            actionPoints.value,
            maxActionPoints.value,
            gameOver.value,
            gameLog.value,
            knownGoodRoles.value,
            possibleEvil.value,
            villagerMin.value,
            villagerMax.value,
            outsiderMin.value,
            outsiderMax.value,
            currentMatchConfig.value,
            initCounts.value,
        );
    }

    function loadGame(): boolean {
        const data = loadFromStorage();
        if (!data) return false;
        chars.value = deserializeChars(data.chars);
        time.value = data.time;
        reputation.value = data.reputation;
        actionPoints.value = data.actionPoints;
        maxActionPoints.value = data.maxActionPoints;
        gameOver.value = data.gameOver;
        setLog(data.gameLog);
        knownGoodRoles.value = new Set(data.knownGoodRoles);
        possibleEvil.value = data.possibleEvil;
        villagerMin.value = data.villagerMin;
        villagerMax.value = data.villagerMax;
        outsiderMin.value = data.outsiderMin;
        outsiderMax.value = data.outsiderMax;
        currentMatchConfig.value = data.currentMatchConfig;
        initCounts.value = data.initCounts;
        return true;
    }

    function hasSaveGame(): boolean {
        return hasSaveInStorage();
    }

    function deleteSaveGame(): void {
        removeSave();
    }

    return { chars, time, nextTime, currentTimeString, playerNumber, reputation, charList, actionPoints, maxActionPoints, canAfford, canSpendActionPoints, resetActionPoints, evilAlive, gameOver, gameLog, knownGoodRoles, possibleEvil, villagerMin, villagerMax, outsiderMin, outsiderMax, displayVillagerRange, displayOutsiderRange, addKnownGoodRole, initKnownGoodRoles, initPossibleEvil, resetGame, initCounts, aiConfigured, aiConfig, setAiConfig, getAiConfig, currentMatchConfig, saveGame, loadGame, hasSaveGame, deleteSaveGame }
})
