<template>
	<div class="page">
		<div ref="ringContainer" class="ring-container">
			<!-- 环形中央 -->
			<div class="ring-center" v-if="midDisplay">
				<n-card size="small" style="width: 300px">
					<template v-if="selecting">
						<AbilityMd :markdown="selectInfo" />已选择
						<span
							:style="{
								color:
									selected.size >= selectCount
										? 'green'
										: 'red',
							}">
							{{ selected.size }} / {{ selectCount }}
						</span>
						人。
					</template>
					<template v-else>{{ midText }}</template>
					<template #action>
						<!-- 结束时间段 -->
						<NButton
							class="midActionBtn"
							type="success"
							v-if="midDoneBtn"
							size="small"
							@click="midDoneBtnClick">
							结束
						</NButton>
						<!-- 选择：取消选择 -->
						<NButton
							class="midActionBtn"
							size="small"
							@click="cancelSelection"
							v-if="selecting && !selectRequired">
							取消
						</NButton>
						<!-- 选择：确定选择 -->
						<NButton
							class="midActionBtn"
							type="success"
							size="small"
							:disabled="selected.size !== selectCount"
							v-if="selecting"
							@click="confirmSelection">
							确认
						</NButton>
					</template>
				</n-card>
			</div>

			<!-- 左上角 -->
			<div class="ring-corner ring-corner--tl">
				<NStatistic label="声望">
					<NNumberAnimation
						:from="prevReputation"
						:to="dataStore.reputation" />
				</NStatistic>
				<NStatistic label="行动力">
					<NNumberAnimation
						:from="prevAP"
						:to="dataStore.actionPoints" />
				</NStatistic>
			</div>

			<!-- 右上角 -->
			<div class="ring-corner ring-corner--tr">
				<p>{{ dataStore.currentTimeString() }}</p>
				<p v-for="item in factionCounts" :key="item.key">
					<AbilityMd :markdown="`::${item.key}:: × ${item.count}`" />
				</p>
			</div>

			<!-- 环形卡片 -->
			<div
				v-for="(item, index) in dataStore.chars"
				:key="item[1].id"
				:style="getCardStyle(index)"
				:class="{
					selectable: selecting && selectFilter(item[1]),
					'card-slot': true,
				}"
				@click="onCardClick(item[1])">
				<Player
					:data="item[1]"
					:selecting="selecting"
					:glow="
						isSelected(item[1].id)
							? 'selected'
							: selecting && selectFilter(item[1])
								? 'selectable'
								: null
					"
					@action-done="finishAction" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {
	ref,
	watch,
	onMounted,
	onUnmounted,
	computed,
	type Ref,
	type CSSProperties,
} from "vue";
import Player from "./Player.vue";
import { NCard, NButton, NStatistic, NNumberAnimation } from "naive-ui";
import { useDataStore } from "@/store/value.ts";
import { useEmitter } from "@/store/emit.ts";
import { Faction, RoleMap, type Character } from "@/data/model";
import { UniqueQueue } from "@/utils/utils";
import AbilityMd from "./AbilityMd.vue";

const dataStore = useDataStore();
const prevReputation = ref(dataStore.reputation);
const prevAP = ref(dataStore.actionPoints);
watch(
	() => dataStore.reputation,
	(_, old) => {
		prevReputation.value = old ?? 0;
	},
);
watch(
	() => dataStore.actionPoints,
	(_, old) => {
		prevAP.value = old ?? 0;
	},
);

const factionCounts = computed(() => {
	const keys = [
		Faction.villager,
		Faction.outsider,
		Faction.minion,
		Faction.demon,
	] as const;
	const counts: Record<string, number> = {};
	keys.forEach((k) => (counts[k] = 0));
	dataStore.chars.forEach((c) => {
		const fac = RoleMap[c.role]?.faction;
		if (fac && fac in counts) counts[fac]!++;
	});
	return keys.map((k) => ({ key: k, count: counts[k] }));
});

// 容器实际尺寸（由 ResizeObserver 驱动）
const containerWidth = ref(0);
const containerHeight = ref(0);

const midDisplay = ref(false);
const midText = ref("");
const midDoneBtn = ref(false);

// 由容器尺寸推导的布局参数
const RADIUS_X = computed(() => containerWidth.value * 0.35);
const RADIUS_Y = computed(() => containerHeight.value * 0.35);

const STAGGER_DELAY = 80;

const isDealt = ref(false);

const getCardStyle = (index: number): CSSProperties => {
	const total = dataStore.chars.size;
	const rx = RADIUS_X.value;
	const ry = RADIUS_Y.value;
	const angle = (360 / total) * index - 90;
	const rad = (angle * Math.PI) / 180;

	const currentRx = isDealt.value ? rx : 0;
	const currentRy = isDealt.value ? ry : 0;

	const x =
		50 + (currentRx / (containerWidth.value || 1)) * 100 * Math.cos(rad);
	const y =
		50 + (currentRy / (containerHeight.value || 1)) * 100 * Math.sin(rad);

	const delay = index * STAGGER_DELAY;

	return {
		position: "absolute",
		left: `${x}%`,
		top: `${y}%`,
		transform: `translate(-50%, -50%) scale(${isDealt.value ? 1 : 0.6})`,
		transition: `left 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
			top 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
			transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)`,
		transitionDelay: `${delay}ms`,
	};
};

// 4. ResizeObserver：监听容器尺寸变化
const ringContainer: Ref<HTMLDivElement | null> = ref(null);
let resizeObserver: ResizeObserver | null = null;

const updateContainerSize = () => {
	const el = ringContainer.value;
	if (el) {
		containerWidth.value = el.clientWidth;
		containerHeight.value = el.clientHeight;
	}
};

const emitter = useEmitter();

onMounted(() => {
	updateContainerSize();

	if (ringContainer.value) {
		resizeObserver = new ResizeObserver(() => {
			updateContainerSize();
		});
		resizeObserver.observe(ringContainer.value);
	}
});

emitter.on("game-start", () => {
	setTimeout(() => {
		isDealt.value = true;
	}, 100);
});

const waitRes: Ref<((value: void | PromiseLike<void>) => void) | null> =
	ref(null);

function startUserAction() {
	midDoneBtn.value = true;
	midDisplay.value = true;
	midText.value = `现在是${dataStore.currentTimeString()}，剩余行动力 ${dataStore.actionPoints}，玩家可以进行行动。`;
}

emitter.on("wait-for-action", () => {
	startUserAction();
	return new Promise((res) => {
		waitRes.value = res;
	});
});

function finishAction() {
	waitRes.value!();
	midDoneBtn.value = false;
	midDisplay.value = false;
}

function midDoneBtnClick() {
	dataStore.actionPoints = 0;
	finishAction();
}

// ── 玩家选取 ──

const selecting = ref(false);
const selectFilter = ref<(c: Character) => boolean>(() => true);
const selectCount = ref(1);
const selectInfo = ref("");
const selectRequired = ref(false);
const selected = ref(new UniqueQueue<number>());
let selectResolve: ((cs: Character[] | null) => void) | null = null;

emitter.on("select-player", (options) => {
	const {
		filter = () => true,
		count = 1,
		info = "",
		required = false,
	} = options ?? {};
	return new Promise<Character[] | null>((resolve) => {
		selecting.value = true;
		selectFilter.value = filter;
		selectCount.value = count;
		selectInfo.value = info;
		selectRequired.value = required;
		selected.value = new UniqueQueue<number>();
		midDisplay.value = true;
		midDoneBtn.value = false;
		selectResolve = resolve;
	});
});

function onCardClick(c: Character) {
	if (!selecting.value || !selectFilter.value(c)) return;
	const q = selected.value;
	if (q.has(c.id)) {
		q.delete(c.id);
	} else {
		q.push(c.id);
		// 超出数量时自动移除最早选的
		while (q.size > selectCount.value) q.shift();
	}
	selected.value = q;
}

function confirmSelection() {
	selecting.value = false;
	const chars = selected.value
		.toArray()
		.map((id) => dataStore.chars.get(id)!)
		.filter(Boolean);
	selectResolve?.(chars);
	selectEnd();
}

function cancelSelection() {
	selecting.value = false;
	selectResolve?.(null);
	selectEnd();
}

function selectEnd() {
	selectResolve = null;
	selecting.value = false;
	selected.value = new UniqueQueue<number>();
	startUserAction();
}

function isSelected(id: number): boolean {
	return selected.value.has(id);
}

onUnmounted(() => {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
});
</script>

<style scoped>
.page {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100vh;
}

.ring-container {
	position: relative;
	width: 100%;
	height: 100%;
	/* 画一个淡淡的圆心参考点（可选） */
	background: radial-gradient(
		circle at center,
		rgba(255, 255, 255, 0.05) 2px,
		transparent 2px
	);
	background-size: 100% 100%;
}

/* ===== 环形中央 ===== */
.ring-center {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 10;
	/* 中央区域不拦截下方卡片的 hover 事件 */
	pointer-events: none;
}
.ring-center > :deep(*) {
	pointer-events: auto;
}

/* ===== 角落区域（左上 / 右上） ===== */
.ring-corner {
	position: absolute;
	z-index: 5;
	padding: 12px 16px;
}
.ring-corner--tl {
	top: 0;
	left: 0;
}
.ring-corner--tr {
	top: 0;
	right: 0;
}

/* ===== 选取态 ===== */
.selectable {
	cursor: pointer;
}
.midActionBtn {
	margin-right: 10px;
}
/* hover 时提升层级，防止 popover 被其他卡片遮挡 */
.card-slot {
	z-index: 1;
	transition: z-index 0s;
}
.card-slot:hover {
	z-index: 100;
}
</style>
