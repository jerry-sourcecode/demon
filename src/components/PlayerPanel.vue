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
		<!-- 游戏结束弹窗 -->
		<GameOverModal
			v-if="gameOverRecord"
			v-model:show="showGameOverModal"
			:record="gameOverRecord"
			:show-actions="true"
			@restart="onRestart"
			@go-home="onGoHome" />
		<!-- 身份菜单 -->
		<RoleMenu v-model:show="showRoleSheet" @go-home="onGoHome" />

		<!-- 艺术家问题对话框 -->
		<n-modal
			v-model:show="showQuestionDialog"
			preset="card"
			title="向说书人提问"
			style="max-width: 500px; width: 80vw"
			:mask-closable="false">
			<p v-if="questionInfo" style="margin-bottom: 12px; color: #aaa">
				{{ questionInfo }}
			</p>
			<n-input
				v-model:value="questionInput"
				type="textarea"
				rows="3"
				placeholder="请输入一个是非问题..."
				@keydown.enter.ctrl="confirmQuestion" />
			<template #footer>
				<n-button @click="cancelQuestion" style="margin-right: 10px">
					取消
				</n-button>
				<n-button
					type="primary"
					:disabled="!questionInput.trim()"
					@click="confirmQuestion">
					询问
				</n-button>
			</template>
		</n-modal>
		<!-- 新手引导 -->
		<n-button
			class="tutorial-btn"
			size="small"
			circle
			@click="showTutorial = true">
			?
		</n-button>
		<TutorialGuide
			v-if="showTutorial"
			:steps="gameSteps"
			@close="onTutorialClose" />
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
import {
	NCard,
	NButton,
	NStatistic,
	NNumberAnimation,
	NInput,
	NModal,
	useMessage,
} from "naive-ui";
import { ACTION_COST, useDataStore } from "@/store/value.ts";
import { useEmitter } from "@/store/emit.ts";
import { Faction, type Character } from "@/data/model";
import { Time } from "@/utils/time";
import { UniqueQueue } from "@/utils/utils";
import AbilityMd from "./AbilityMd.vue";
import GameOverModal from "./GameOverModal.vue";
import RoleMenu from "./RoleMenu.vue";
import { start } from "@/game.ts";
import { useMatchStore } from "@/store/matchStore";
import { DEFAULT_MATCH_CONFIG, type MatchRecord } from "@/data/match";
import TutorialGuide from "./TutorialGuide.vue";
import { GAME_STEPS } from "@/data/tutorial";

const panelEmit = defineEmits<{
	goHome: [];
}>();

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
	const { minion, demon } = dataStore.initCounts;
	const vr = dataStore.displayVillagerRange;
	const vCount = vr.min === vr.max ? `${vr.min}` : `${vr.min}~${vr.max}`;
	const or = dataStore.displayOutsiderRange;
	const oCount = or.min === or.max ? `${or.min}` : `${or.min}~${or.max}`;
	return [
		{ key: Faction.villager, count: vCount },
		{ key: Faction.outsider, count: oCount },
		{ key: Faction.minion, count: minion },
		{ key: Faction.demon, count: demon },
	];
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

// ── 身份菜单 ──

const showRoleSheet = ref(false);
const showTutorial = ref(false);
const gameSteps = GAME_STEPS;

const TUTORIAL_GAME_KEY = "demon-tutorial-game";
// 首次进入游戏时自动弹出游戏内引导
try {
	if (!localStorage.getItem(TUTORIAL_GAME_KEY)) {
		showTutorial.value = true;
	}
} catch {
	/* ignore */
}

function onTutorialClose() {
	showTutorial.value = false;
	try {
		localStorage.setItem(TUTORIAL_GAME_KEY, "1");
	} catch {
		/* ignore */
	}
}

function onKeyDown(e: KeyboardEvent) {
	if (e.key === "Tab" && !e.repeat) {
		e.preventDefault();
		showRoleSheet.value = !showRoleSheet.value;
	}
}

document.addEventListener("keydown", onKeyDown);

onUnmounted(() => {
	document.removeEventListener("keydown", onKeyDown);
});

emitter.off("game-start");
emitter.on("game-start", () => {
	setTimeout(() => {
		isDealt.value = true;
	}, 100);
});

// 读档恢复时也触发发牌动画
if (dataStore.time !== Time.NOT_STARTED) {
	setTimeout(() => {
		isDealt.value = true;
	}, 100);
}

onUnmounted(() => {
	emitter.off("game-start");
});

// ── 游戏结束 ──

const showGameOverModal = ref(false);
const isWin = ref(false);
const gameOverRecord = ref<MatchRecord | null>(null);

emitter.on("game-end", (win) => {
	dataStore.gameOver = true;
	isWin.value = win;
	const startEvent = dataStore.gameLog.find((e) => e.type === "gameStart");
	const initRoles = ((startEvent?.meta as any)?.roles ?? {}) as Record<
		number,
		import("@/data/model").RoleType
	>;
	const matchStore = useMatchStore();
	const record = matchStore.buildMatchRecord(
		dataStore.currentMatchConfig ?? DEFAULT_MATCH_CONFIG,
		win,
		dataStore.gameLog,
		initRoles,
		dataStore.chars,
	);
	gameOverRecord.value = record;
	// 保存到对局记录
	matchStore.addMatchRecord(record);
	setTimeout(() => {
		showGameOverModal.value = true;
	}, 500);
});

function onRestart() {
	dataStore.deleteSaveGame();
	dataStore.resetGame();
	start(useMatchStore().matchConfig);
}

function onGoHome() {
	dataStore.resetGame();
	panelEmit("goHome");
}

const waitRes: Ref<((value: void | PromiseLike<void>) => void) | null> =
	ref(null);

function startUserAction() {
	midDoneBtn.value = true;
	midDisplay.value = true;
	midText.value = `现在是${dataStore.currentTimeString()}，玩家可以进行行动。`;
}

emitter.on("wait-for-action", () => {
	startUserAction();
	return new Promise((res) => {
		waitRes.value = res;
	});
});

function finishAction() {
	if (!waitRes.value) {
		return;
	}
	const resolve = waitRes.value;
	waitRes.value = null;
	midDoneBtn.value = false;
	midDisplay.value = false;
	resolve();
}

function midDoneBtnClick() {
	dataStore.actionPoints = 0;
	finishAction();
}

/** 兜底：行动点归 0 时自动推进（防止因 Promise 异常丢失导致卡死） */
watch(
	() => dataStore.actionPoints,
	(val) => {
		if (val <= 0 && !dataStore.gameOver && waitRes.value) {
			finishAction();
		}
	},
);

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
	dataStore.canSpendActionPoints(-ACTION_COST.skill);
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

// ── 消息提示 ──

const message = useMessage();

emitter.on("show-message", (options) => {
	if (options.type === "warning") {
		message.warning(options.content);
	} else {
		message.info(options.content);
	}
	return Promise.resolve();
});

// ── 艺术家问题对话框 ──

const showQuestionDialog = ref(false);
const questionInput = ref("");
const questionInfo = ref("");
let questionResolve: ((text: string | null) => void) | null = null;

// 监听对话框关闭（点击 X 按钮），视为取消
watch(showQuestionDialog, (val) => {
	if (!val && questionResolve) {
		questionResolve(null);
		questionResolve = null;
	}
});

emitter.on("ask-question", (options) => {
	questionInfo.value = options?.info ?? "";
	return new Promise<string | null>((resolve) => {
		showQuestionDialog.value = true;
		questionInput.value = "";
		questionResolve = resolve;
		midDoneBtn.value = false;
	});
});

function confirmQuestion() {
	const text = questionInput.value.trim();
	showQuestionDialog.value = false;
	questionResolve?.(text || null);
	questionResolve = null;
}

function cancelQuestion() {
	showQuestionDialog.value = false;
	questionResolve?.(null);
	questionResolve = null;
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
	width: 100vw;
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
.tutorial-btn {
	position: fixed;
	bottom: 20px;
	right: 20px;
	z-index: 1000;
	font-weight: bold;
	font-size: 16px;
}
</style>
