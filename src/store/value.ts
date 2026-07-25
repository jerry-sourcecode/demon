import { defineStore } from 'pinia'
import { RoleMap, Faction, type Character, type RoleType } from '../data/model'
import { ref, type Ref, computed } from 'vue';
import { Time } from '../utils/time';
import { TagType } from '../data/tag';
import { gameLog as getLog, clearLog, type GameEvent } from '../data/gameLog';

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
    const maxActionPoints = 10;

    const gameOver = ref(false);

    /** 尚存活的真正邪恶角色（仅恶魔和爪牙，陌客不算） */
    const evilAlive = computed(() =>
        [...chars.value.values()].filter(c => {
            const fac = RoleMap[c.role]?.faction;
            return (fac === Faction.demon || fac === Faction.minion) && !c.hasTag(TagType.dead);
        })
    );

    /** 游戏日志（复盘数据） */
    const gameLog: Ref<GameEvent[]> = getLog();

    /** 初始配置人数（用于界面显示） */

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

    function spendActionPoints(cost: number): boolean {
        if (actionPoints.value < cost) return false;
        actionPoints.value -= cost;
        return true;
    }

    function resetActionPoints() {
        actionPoints.value = maxActionPoints;
    }

    function resetGame() {
        chars.value = new Map();
        time.value = Time.NOT_STARTED;
        reputation.value = 0;
        actionPoints.value = maxActionPoints;
        gameOver.value = false;
        knownGoodRoles.value = new Set();
        possibleEvil.value = [];
        villagerMin.value = 6;
        villagerMax.value = 6;
        outsiderMin.value = 1;
        outsiderMax.value = 1;
        clearLog();
    }

    return { chars, time, nextTime, currentTimeString, playerNumber, reputation, charList, actionPoints, maxActionPoints, canAfford, spendActionPoints, resetActionPoints, evilAlive, gameOver, gameLog, knownGoodRoles, possibleEvil, villagerMin, villagerMax, outsiderMin, outsiderMax, addKnownGoodRole, initKnownGoodRoles, initPossibleEvil, resetGame }
})
