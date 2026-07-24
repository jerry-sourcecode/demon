import { defineStore } from 'pinia'
import { RoleMap, type Character } from '../data/model'
import { ref, type Ref } from 'vue';
import { Time } from '../utils/time';

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

    return { chars, time, nextTime, currentTimeString, playerNumber, reputation, charList, actionPoints, maxActionPoints, canAfford, spendActionPoints, resetActionPoints }
})
