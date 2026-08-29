<template>
	<div class="page">
		<!-- 全局 AI 加载中（渔夫/郎中调用说书人时） -->
		<n-spin
			v-if="aiLoading"
			size="large"
			description="AI正在思考…"
			class="ai-loading-overlay" />
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
				<div style="display: flex; gap: 30px">
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
			</div>

			<!-- 右上角 -->
			<div class="ring-corner ring-corner--tr">
				<p>{{ dataStore.currentTimeString() }}</p>
				<p v-for="item in factionCounts" :key="item.key">
					<AbilityMd :markdown="`::${item.key}:: × ${item.count}`" />
				</p>
			</div>
			<!-- 左下角：玩家技能菜单 -->
			<div class="ring-corner ring-corner--bl">
				<n-dropdown
					v-if="isDay && !selecting"
					trigger="click"
					placement="top"
					:options="skillMenuOptions"
					@select="onSkillMenuSelect">
					<n-button class="skill-menu-btn" size="small"
						>玩家技能</n-button
					>
				</n-dropdown>
			</div>
			<!-- 右下角：身份菜单 + 新手引导 -->
			<div class="ring-corner ring-corner--br">
				<n-button
					class="sheet-btn"
					size="small"
					circle
					@click="showRoleSheet = !showRoleSheet">
					<IconClipboardList />
				</n-button>
				<n-button
					class="tutorial-btn"
					size="small"
					circle
					@click="showTutorial = true">
					?
				</n-button>
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
					@action-done="() => finishAction('action-done')" />
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
			<n-spin :show="questionLoading">
				<n-input
					v-model:value="questionInput"
					type="textarea"
					rows="3"
					:disabled="questionLoading"
					placeholder="请输入一个是非问题..."
					@keydown.enter.ctrl="confirmQuestion" />
			</n-spin>
			<template #footer>
				<n-button
					:disabled="questionLoading"
					@click="cancelQuestion"
					style="margin-right: 10px">
					取消
				</n-button>
				<n-button
					type="primary"
					:disabled="!questionInput.trim() || questionLoading"
					@click="confirmQuestion">
					询问
				</n-button>
			</template>
		</n-modal>

		<!-- 天气弹窗（重掷确认 / 重铸后介绍 共用） -->
		<n-modal
			v-model:show="showWeatherModal"
			preset="card"
			:title="
				weatherModalInfo
					? `天气：${weatherModalInfo.icon} ${weatherModalInfo.display}`
					: '天气'
			"
			style="max-width: 420px; width: 80vw"
			:mask-closable="false">
			<p v-if="weatherModalInfo" style="margin-bottom: 8px">
				{{
					weatherModalMode === "intro"
						? "重铸后的本局天气为"
						: "本局天气为"
				}}「{{ weatherModalInfo.display }}」：
			</p>
			<AbilityMd
				v-if="weatherModalInfo"
				:markdown="weatherModalInfo.desc" />
			<template #footer>
				<template v-if="weatherModalMode === 'reroll'">
					<n-button
						@click="cancelWeatherReroll"
						style="margin-right: 10px">
						保持
					</n-button>
					<n-button type="primary" @click="confirmWeatherReroll">
						重掷（消耗 {{ REROLL_WEATHER_COST }} 声望）
					</n-button>
				</template>
				<n-button v-else type="primary" @click="confirmWeatherIntro">
					确定
				</n-button>
			</template>
		</n-modal>
		<TutorialGuide
			v-if="showTutorial"
			:steps="gameSteps"
			@close="onTutorialClose" />
	</div>
</template>

<script setup lang="ts">
import { IconClipboardList } from "@iconify-prerendered/vue-mdi";
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
	NDropdown,
	NSpin,
	useMessage,
	type DropdownOption,
} from "naive-ui";
import { ACTION_COST, useDataStore } from "@/store/value.ts";
import {
	WeatherMap,
	REROLL_WEATHER_COST,
	type WeatherType,
} from "@/data/weather";
import { useEmitter } from "@/store/emit.ts";
import { Faction, type Character } from "@/data/model";
import { Time } from "@/utils/time";
import { UniqueQueue, runFn } from "@/utils/utils";
import AbilityMd from "./AbilityMd.vue";
import GameOverModal from "./GameOverModal.vue";
import RoleMenu from "./RoleMenu.vue";
import { start } from "@/game.ts";
import { playerRoles, type PlayerRoleType } from "@/data/role/player";
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
const RADIUS_X = computed(() => containerWidth.value * 0.38);
const RADIUS_Y = computed(() => containerHeight.value * 0.4);

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

// ── 天气弹窗（重掷确认 / 重铸后介绍 共用） ──
const showWeatherModal = ref(false);
const weatherModalMode = ref<"reroll" | "intro">("reroll");
const weatherModalKey = ref<WeatherType | null>(null);
let weatherRerollResolve: ((val: boolean) => void) | null = null;
let weatherIntroResolve: (() => void) | null = null;
const weatherModalInfo = computed(() => {
	const key = weatherModalKey.value;
	return key ? WeatherMap[key] : null;
});

emitter.off("confirm-weather-reroll");
emitter.on("confirm-weather-reroll", (weather) => {
	weatherModalMode.value = "reroll";
	weatherModalKey.value = weather;
	return new Promise<boolean>((resolve) => {
		weatherRerollResolve = resolve;
		showWeatherModal.value = true;
	});
});

emitter.off("show-weather");
emitter.on("show-weather", (weather) => {
	weatherModalMode.value = "intro";
	weatherModalKey.value = weather;
	return new Promise<void>((resolve) => {
		weatherIntroResolve = resolve;
		showWeatherModal.value = true;
	});
});

function confirmWeatherReroll() {
	showWeatherModal.value = false;
	weatherRerollResolve?.(true);
	weatherRerollResolve = null;
}

function cancelWeatherReroll() {
	showWeatherModal.value = false;
	weatherRerollResolve?.(false);
	weatherRerollResolve = null;
}

function confirmWeatherIntro() {
	showWeatherModal.value = false;
	weatherIntroResolve?.();
	weatherIntroResolve = null;
}

// 监听弹窗关闭（点击 X / 遮罩），重掷模式视为保持，介绍模式直接结束
watch(showWeatherModal, (val) => {
	if (!val) {
		if (weatherModalMode.value === "reroll" && weatherRerollResolve) {
			weatherRerollResolve(false);
			weatherRerollResolve = null;
		} else if (weatherModalMode.value === "intro" && weatherIntroResolve) {
			weatherIntroResolve();
			weatherIntroResolve = null;
		}
	}
});

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

// ── 玩家技能菜单（玩家/说书人技能，如痢蛭白天选择宿主） ──

const isDay = computed(
	() =>
		Time.getPhase(dataStore.time) === Time.Phase.Day && !dataStore.gameOver,
);

const skillMenuOptions = computed<DropdownOption[]>(() => {
	const opts: DropdownOption[] = [];
	for (const key of dataStore.playerCharacter.roles) {
		const role = playerRoles[key];
		if (!role) continue;
		const enabled =
			runFn(
				role.canActivateSkill,
				dataStore.playerCharacter,
				dataStore.time,
			) ?? false;
		opts.push({ key, label: role.display, disabled: !enabled });
	}
	if (opts.length === 0) {
		opts.push({
			key: "empty",
			label: "当前没有可发动的技能",
			disabled: true,
		});
	}
	return opts;
});

function onSkillMenuSelect(key: string) {
	const role = playerRoles[key as PlayerRoleType];
	if (role) runFn(role.onActiveSkill, dataStore.playerCharacter);
}

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
	emitter.off("game-end");
	emitter.off("wait-for-action");
	emitter.off("select-player");
	emitter.off("show-message");
	emitter.off("ask-question");
	emitter.off("confirm-weather-reroll");
	emitter.off("show-weather");
});

// ── 游戏结束 ──

const showGameOverModal = ref(false);
const isWin = ref(false);
const gameOverRecord = ref<MatchRecord | null>(null);

emitter.off("game-end");
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
	console.log(
		`[Game] wait-for-action: 时段=${dataStore.currentTimeString()}, AP=${dataStore.actionPoints}, gameOver=${dataStore.gameOver}`,
	);
}

emitter.off("wait-for-action");
emitter.on("wait-for-action", () => {
	startUserAction();
	return new Promise((res) => {
		waitRes.value = res;
	});
});

function finishAction(source: string = "unknown") {
	console.log(
		`[Game] finishAction(来源=${source}): waitRes=${!!waitRes.value}, AP=${dataStore.actionPoints}, midDisplay=${midDisplay.value}`,
	);
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
	console.log(`[Game] 点击「结束」按钮: AP=${dataStore.actionPoints}`);
	dataStore.actionPoints = 0;
	finishAction("midDoneBtn");
}

/** 兜底：行动点归 0 时自动推进（防止因 Promise 异常丢失导致卡死） */
watch(
	() => dataStore.actionPoints,
	(val, old) => {
		console.log(
			`[Game] AP变化: ${old} → ${val}, waitRes=${!!waitRes.value}, gameOver=${dataStore.gameOver}, midDisplay=${midDisplay.value}`,
		);
		if (val <= 0 && !dataStore.gameOver && waitRes.value) {
			console.log(`[Game] 兜底触发 finishAction`);
			finishAction("watch-AP");
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

emitter.off("select-player");
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

emitter.off("show-message");
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
const questionLoading = ref(false);
let questionResolve: ((text: string | null) => void) | null = null;

// 监听对话框关闭（点击 X 按钮），视为取消
watch(showQuestionDialog, (val) => {
	if (!val && questionResolve) {
		questionResolve(null);
		questionResolve = null;
	}
	questionLoading.value = false;
});

emitter.off("ask-question");
emitter.on("ask-question", (options) => {
	questionInfo.value = options?.info ?? "";
	questionLoading.value = false;
	return new Promise<string | null>((resolve) => {
		showQuestionDialog.value = true;
		questionInput.value = "";
		questionResolve = resolve;
		midDoneBtn.value = false;
	});
});

// AI 回复结束：ok=true 关闭弹窗；ok=false（无法回答）恢复输入继续提问
emitter.off("question-done");
emitter.on("question-done", (ok) => {
	questionLoading.value = false;
	if (ok) {
		showQuestionDialog.value = false;
		questionResolve = null;
	}
});

// ── 全局 AI 加载覆盖层（渔夫/郎中调用说书人时） ──

const aiLoading = ref(false);

emitter.off("ai-loading");
emitter.on("ai-loading", (loading) => {
	aiLoading.value = loading;
});

function confirmQuestion() {
	const text = questionInput.value.trim();
	if (!text) return;
	// 提交后不立即关闭，显示加载圆环等待 AI 回复
	questionLoading.value = true;
	const r = questionResolve;
	questionResolve = null;
	r?.(text || null);
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
	emitter.off("ai-loading");
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
.ring-corner--bl {
	bottom: 0;
	left: 0;
}
.ring-corner--br {
	bottom: 0;
	right: 0;
	display: flex;
	gap: 10px;
	align-items: center;
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
	font-weight: bold;
	font-size: 16px;
}
.sheet-btn {
	font-size: 16px;
}
/* 全局 AI 加载覆盖层（渔夫/郎中调用说书人时） */
.ai-loading-overlay {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.45);
}
</style>
