import { defineStore } from 'pinia'
import { RoleMap, Faction, type Character, type RoleType, PlayerCharacter } from '../data/model'
import { ref, type Ref, computed } from 'vue';
import { Time } from '../utils/time';
import { randint } from '../utils/utils';
import { TagType } from '../data/tag';
import { gameLog as getLog, clearLog, setLog, type GameEvent, logPhaseChange, logWeatherChange, logReputationChange } from '../data/gameLog';
import { WeatherType, randWeather, REROLL_WEATHER_COST } from '../data/weather';
import type { MatchConfig } from '../data/match';
import { saveGame as saveToStorage, loadGame as loadFromStorage, hasSaveGame as hasSaveInStorage, deleteSave as removeSave, deserializeChars } from '../data/save';
export { ACTION_COST } from '../data/constants';

export const useDataStore = defineStore('data', () => {
    const chars: Ref<Map<number, Character>> = ref(new Map);

    /** 玩家角色：可主动发动的技能 */
    const playerCharacter: Ref<PlayerCharacter> = ref(new PlayerCharacter());

    const time = ref<Time.TimeNumber>(Time.NOT_STARTED);

    const reputation = ref(0);

    const actionPoints = ref(10);
    const maxActionPoints = ref(10);

    /** 当前天气（每局固定一个，开局随机，可重掷一次） */
    const weather = ref<WeatherType | null>(null);
    /** 是否已使用重掷机会 */
    const weatherRerolled = ref(false);
    /** 浓雾降临的黄昏天数（开局随机 1~4，0=未定） */
    const fogDuskDay = ref(0);
    /** 雷暴每局限一次的错误揭示是否已用 */
    const thunderWrongUsed = ref(false);
    /** 雷暴当晚被震慑的玩家 id */
    const thunderTargetId = ref<number | null>(null);
    /** 酷暑：今天是否已使用免费处决 */
    const heatwaveFreeUsed = ref(false);
    /** 今天白天是否已发动过主动技能 */
    const daySkillUsed = ref(false);
    /** 血月：今天是否已使用 */
    const bloodmoonUsedToday = ref(false);
    /** 流星雨：今天是否已使用 */
    const meteorUsedToday = ref(false);
    /** 流星雨：今天是否被禁用（昨日误伤） */
    const meteorDisabledToday = ref(false);
    /** 流星雨：下个白天是否被禁用（今日误伤） */
    const meteorDisabledNextDay = ref(false);
    /** 多云：天选者玩家 id（始终保持清醒，可挡一次死亡） */
    const cloudyChosenId = ref<number | null>(null);
    /** 多云：天选者是否已挡过一次死亡（之后永久中毒） */
    const cloudyChosenDied = ref(false);

    const gameOver = ref(false);

    /** 尚存活的真正邪恶角色（仅恶魔和爪牙，陌客不算） */
    const evilAlive = computed(() =>
        [...chars.value.values()].filter(c =>
            c.isTrulyEvil() && !c.isTrulyDead()
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
        // 极寒：白天行动力上限 -2
        const cap = weather.value === 'blizzard' ? maxActionPoints.value - 2 : maxActionPoints.value;
        actionPoints.value = Math.max(0, cap);
        // 酷暑：新的一天重置当日状态
        heatwaveFreeUsed.value = false;
        daySkillUsed.value = false;
        // 每日重置天气主动技能状态
        bloodmoonUsedToday.value = false;
        meteorUsedToday.value = false;
        meteorDisabledToday.value = meteorDisabledNextDay.value;
        meteorDisabledNextDay.value = false;
        // 注意：多云天选者（cloudyChosenId/Died）整局有效，不在此处重置，仅在 resetGame 中清空
    }

    /** 初始化天气运行时状态（抽到具体天气后调用） */
    function initWeatherState(w: WeatherType) {
        fogDuskDay.value = 0;
        thunderWrongUsed.value = false;
        thunderTargetId.value = null;
        cloudyChosenId.value = null;
        cloudyChosenDied.value = false;
        if (w === 'fog') {
            fogDuskDay.value = randint(1, 4);
        }
    }

    /** 开局随机抽取天气并记录日志 */
    function rollWeather() {
        weather.value = randWeather();
        weatherRerolled.value = false;
        initWeatherState(weather.value);
        logWeatherChange(weather.value, 'roll');
    }

    /** 重掷天气：消耗声望，每局限一次，返回是否成功 */
    function rerollWeather(): boolean {
        if (weatherRerolled.value) return false;
        if (reputation.value < REROLL_WEATHER_COST) return false;
        reputation.value -= REROLL_WEATHER_COST;
        logReputationChange(-REROLL_WEATHER_COST, '重掷天气');
        weatherRerolled.value = true;
        weather.value = randWeather();
        initWeatherState(weather.value);
        logWeatherChange(weather.value, 'reroll');
        return true;
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
        playerCharacter.value = new PlayerCharacter();
        currentMatchConfig.value = null;
        weather.value = null;
        weatherRerolled.value = false;
        fogDuskDay.value = 0;
        thunderWrongUsed.value = false;
        thunderTargetId.value = null;
        heatwaveFreeUsed.value = false;
        daySkillUsed.value = false;
        bloodmoonUsedToday.value = false;
        meteorUsedToday.value = false;
        meteorDisabledToday.value = false;
        meteorDisabledNextDay.value = false;
        cloudyChosenId.value = null;
        cloudyChosenDied.value = false;
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
            weather.value,
            weatherRerolled.value,
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
        weather.value = data.weather ?? null;
        weatherRerolled.value = data.weatherRerolled ?? false;
        return true;
    }

    function hasSaveGame(): boolean {
        return hasSaveInStorage();
    }

    function deleteSaveGame(): void {
        removeSave();
    }

    return { chars, playerCharacter, time, nextTime, currentTimeString, playerNumber, reputation, charList, actionPoints, maxActionPoints, canAfford, canSpendActionPoints, resetActionPoints, evilAlive, gameOver, gameLog, knownGoodRoles, possibleEvil, villagerMin, villagerMax, outsiderMin, outsiderMax, displayVillagerRange, displayOutsiderRange, addKnownGoodRole, initKnownGoodRoles, initPossibleEvil, resetGame, initCounts, weather, weatherRerolled, fogDuskDay, thunderWrongUsed, thunderTargetId, heatwaveFreeUsed, daySkillUsed, bloodmoonUsedToday, meteorUsedToday, meteorDisabledToday, meteorDisabledNextDay, cloudyChosenId, cloudyChosenDied, rollWeather, rerollWeather, aiConfigured, aiConfig, setAiConfig, getAiConfig, currentMatchConfig, saveGame, loadGame, hasSaveGame, deleteSaveGame }
})
