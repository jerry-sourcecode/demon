<template>
	<div class="weather-badge" v-if="w">
		<n-popover trigger="hover" placement="bottom-end" :width="340">
			<template #trigger>
				<n-button size="small" class="weather-trigger">
					<span class="weather-icon">{{ w.icon }}</span>
					<span class="weather-name">{{ w.display }}</span>
				</n-button>
			</template>
			<div class="weather-card">
				<div class="weather-title">{{ w.icon }} {{ w.display }}</div>

				<AbilityMd class="weather-desc" :markdown="w.desc" />
				<div
					v-if="showBloodmoon || showMeteor"
					class="weather-actions weather-actions--active">
					<NButton
						v-if="showBloodmoon"
						size="tiny"
						type="primary"
						@click="onBloodmoon">
						血月：选择玩家::drunk::
					</NButton>
					<NButton
						v-if="showMeteor"
						size="tiny"
						type="error"
						@click="onMeteor">
						流星雨：召唤流星
					</NButton>
					<span v-if="isMeteorDisabled" class="weather-hint">
						昨日天怒，今日流星雨禁用
					</span>
				</div>
			</div>
		</n-popover>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NButton, NDivider, NPopover, useMessage } from "naive-ui";
import { useDataStore } from "@/store/value";
import { useEmitter } from "@/store/emit";
import { WeatherMap } from "@/data/weather";
import { TagType } from "@/data/tag";
import { Time } from "@/utils/time";
import { logWeatherInfo, logReputationChange } from "@/data/gameLog";
import AbilityMd from "./AbilityMd.vue";

const dataStore = useDataStore();
const emitter = useEmitter();
const message = useMessage();

const weather = computed(() => dataStore.weather);
const w = computed(() => (weather.value ? WeatherMap[weather.value] : null));

// ── 主动型天气操作（血月 / 流星雨） ──
const isDay = computed(() => Time.getPhase(dataStore.time) === Time.Phase.Day);
const showBloodmoon = computed(
	() =>
		weather.value === "bloodmoon" &&
		isDay.value &&
		!dataStore.bloodmoonUsedToday,
);
const showMeteor = computed(
	() =>
		weather.value === "meteor" &&
		isDay.value &&
		!dataStore.meteorUsedToday &&
		!dataStore.meteorDisabledToday,
);
const isMeteorDisabled = computed(
	() => weather.value === "meteor" && dataStore.meteorDisabledToday,
);

/** 血月：选择一名玩家醉酒直到下一个黎明 */
async function onBloodmoon() {
	const chosen = await emitter.emit("select-player", {
		count: 1,
		info: "血月：选择一名玩家，他::drunk::直到下一个黎明。",
		required: true,
	});
	if (!chosen || chosen.length < 1) return;
	const target = chosen[0]!;
	const till = Time.makeTime(
		Time.getDay(dataStore.time) + 1,
		Time.Phase.Dawn,
	);
	target.addTag(TagType.confused, { till, source: 0 });
	dataStore.bloodmoonUsedToday = true;
	logWeatherInfo(`血月选择了 #${target.id}，他::drunk::直到下一个::dawn::。`);
	message.success(`血月：#${target.id} ::drunk::直到下一个黎明`);
}

/** 流星雨：召唤流星砸向一名玩家，天罚或天怒 */
async function onMeteor() {
	const chosen = await emitter.emit("select-player", {
		count: 1,
		info: "流星雨：召唤流星砸向一名玩家，天罚或天怒。",
		required: true,
	});
	if (!chosen || chosen.length < 1) return;
	const target = chosen[0]!;
	const repBefore = dataStore.reputation;
	if (target.isTrulyEvil()) {
		target.addTag(TagType.dead, { meta: { type: "other", force: true } });
		dataStore.reputation += 2;
		logReputationChange(
			dataStore.reputation - repBefore,
			`流星雨天罚：#${target.id} 是::evil::，声望 +2`,
		);
		message.success(`流星雨：天罚降临，#${target.id} 死亡，声望 +2`);
	} else {
		target.addTag(TagType.dead, { meta: { type: "other", force: true } });
		dataStore.reputation -= 2;
		dataStore.meteorDisabledNextDay = true;
		logReputationChange(
			dataStore.reputation - repBefore,
			`流星雨天怒：#${target.id} 是::kind::，声望 -4`,
		);
		message.warning(
			`流星雨：天怒反噬，#${target.id} 死亡，声望 -4，明日禁用`,
		);
	}
	dataStore.meteorUsedToday = true;
}
</script>

<style scoped>
.weather-badge {
	position: fixed;
	top: 10px;
	right: 10px;
	z-index: 500;
}
.weather-trigger {
	opacity: 0.9;
}
.weather-icon {
	font-size: 15px;
	margin-right: 2px;
}
.weather-name {
	font-weight: 600;
}
.weather-title {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 4px;
}
.weather-desc {
	line-height: 1.6;
}
.weather-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 10px;
}
.weather-actions--active {
	margin-top: 10px;
}
.weather-hint {
	font-size: 12px;
	color: #999;
}
</style>
