<template>
	<n-popover
		:show="showActions"
		trigger="manual"
		placement="right"
		:width="200"
		@clickoutside="showActions = false">
		<template #trigger>
			<n-popover
				:width="360"
				:delay="300"
				:duration="200"
				trigger="hover"
				@mouseenter="hovered = true"
				@mouseleave="hovered = false">
				<template #trigger>
					<div
						@mouseenter="hovered = true"
						@mouseleave="hovered = false">
						<n-card
							:segmented="{ content: 'soft' }"
							:style="cardStyle"
							@contextmenu.prevent="showDetail"
							@click="onCardClick"
							@touchstart="onTouchStart"
							@touchend="onTouchEnd"
							@touchmove="onTouchMove"
							class="outer"
							hoverable
							size="small">
							<template #header>
								<span class="header-with-badge">
									<span
										v-if="isDead"
										class="death-badge"
										style="font-size: 18px"
										title="已死亡">
										<span class="icon">
											<IconSkull />
										</span>
									</span>
									<span :style="`color: ${calColor}`">{{
										calRoleName
									}}</span>
									<span
										v-for="tag in props.data.customTags"
										:key="tag"
										class="tag-dot"
										:style="{
											background:
												dotColors[tag] ?? '#888',
										}" />
									<span
										v-if="canShowSkill"
										class="skill-badge icon"
										style="font-size: 16px"
										title="可发动技能"
										><IconLightningBolt /></span>
								</span>
							</template>
							<template #header-extra>
								<strong>#{{ props.data.id }}</strong>
							</template>
							<div
								class="info-box"
								v-if="props.data.info.length !== 0">
								<div
									v-for="value in props.data.info"
									:key="value">
									<AbilityMd :markdown="value" />
								</div>
							</div>
							<!-- 文字标签 -->
							<div class="tag-section">
								<n-dynamic-tags
									v-model:value="props.data.dynamicTags"
									size="small"
									:max="10"
									:input-style="{ width: '80px' }"
									placeholder="+标签" />
							</div>
						</n-card>
					</div>
				</template>
				<div>
					<template v-if="isDead && hasDisguiseTag">
						<AbilityPopover
							:markdown="realRoleInfo!.ability"
							v-if="realRoleInfo"
							:role-key="props.data.role" />
						<n-divider />
						<AbilityPopover
							:markdown="calRole!.ability"
							v-if="calRole"
							:role-key="props.data.displayRole!"
							title-prefix="（伪装）" />
					</template>
					<AbilityPopover
						v-else-if="calRole"
						:markdown="calRole!.ability"
						:role-key="props.data.displayRole!" />
				</div>
			</n-popover>
		</template>
		<div class="tag-manager">
			<div class="tag-mgr-title">圆点标记</div>
			<div class="preset-dots">
				<span
					v-for="key in dotKeysOrder"
					:key="key"
					class="dot-btn"
					:class="{ active: props.data.customTags.includes(key) }"
					:style="{ background: dotColors[key] }"
					@click="toggleDot(key)"
					>{{ dotLabels[key] }}</span
				>
			</div>
		</div>
		<n-divider />
		<div class="action-buttons">
			<NButton
				v-if="canShowRecall"
				:disabled="!canAffordRecall"
				size="small"
				type="warning"
				block
				@click="onRecall">
				回忆{{ canAffordRecall ? "" : `（${ACTION_COST.recall} AP）` }}
			</NButton>
			<NButton
				v-if="canShowSkill"
				:disabled="!canAffordSkill"
				size="small"
				type="primary"
				block
				@click="onSkill">
				发动技能{{
					canAffordSkill
						? ""
						: `（${needAPForSkill ? ACTION_COST.skill : 0} AP）`
				}}
			</NButton>
			<NButton
				v-if="canShowExecute"
				:disabled="!canAffordExecute"
				size="small"
				type="error"
				block
				@click="onExecute">
				处决{{
					canAffordExecute ? "" : `（${ACTION_COST.execute} AP）`
				}}
			</NButton>
			<p
				v-if="!canShowRecall && !canShowSkill && !canShowExecute"
				class="no-action-hint">
				当前无可用操作
			</p>
		</div>
	</n-popover>

	<Detail
		:role="
			isDead && hasDisguiseTag ? props.data.role : props.data.displayRole!
		"
		:disguise-role="
			isDead && hasDisguiseTag ? props.data.displayRole! : undefined
		"
		v-model="showDetailModal" />
</template>

<script setup lang="ts">
import { Character, RoleMap, Faction } from "@/data/model";
import { computed, ref, onMounted, onUnmounted } from "vue";
import { IconSkull, IconLightningBolt } from "@iconify-prerendered/vue-mdi";
import {
	NCard,
	NPopover,
	NButton,
	NDivider,
	NDynamicTags,
	useDialog,
} from "naive-ui";
import AbilityPopover from "./AbilityPopover.vue";
import Detail from "./Detail.vue";
import { FACTION_COLORS } from "@/data/keywords.ts";
import { useDataStore, ACTION_COST } from "@/store/value";
import { Time } from "@/utils/time";
import { runFn } from "@/utils/utils.ts";
import AbilityMd from "./AbilityMd.vue";
import { TagType } from "@/data/tag.ts";
import {
	logRecall,
	logExecute,
	logSkillResolution,
	logSkillActivate,
	logReputationChange,
} from "@/data/gameLog";

const dataStore = useDataStore();
const dialog = useDialog();
const showDetailModal = ref(false);
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const props = defineProps<{
	data: Character;
	selecting?: boolean;
	glow?: "selectable" | "selected" | null;
}>();

const emit = defineEmits<{
	"action-done": [];
}>();

const calRole = computed(() => {
	if (props.data.displayRole === null) return null;
	return RoleMap[props.data.displayRole];
});

const calRoleName = computed(() => {
	if (props.data.displayRole === null) return "未知";
	const displayName = RoleMap[props.data.displayRole].display;
	// 死亡 + 伪装 → 显示「真实身份（伪装身份）」
	if (isDead.value && props.data.hasTag(TagType.disguise)) {
		return `${RoleMap[props.data.role].display}（${displayName}）`;
	}
	return displayName;
});

const calColor = computed(() => {
	const role = calRole.value;
	if (role === null) return "gray";
	return FACTION_COLORS[role.faction];
});

const isDead = computed(() => props.data.hasTag(TagType.dead));

const hasDisguiseTag = computed(() => props.data.hasTag(TagType.disguise));

const realRoleInfo = computed(() => RoleMap[props.data.role]);

const cardStyle = computed(() => {
	const parts: string[] = [];
	if (isDead.value) parts.push("grayscale(100%)", "opacity(0.6)");
	if (props.glow === "selectable")
		parts.push("brightness(1.15)", "drop-shadow(0 0 10px #4fc3f7)");
	else if (props.glow === "selected")
		parts.push("brightness(1.3)", "drop-shadow(0 0 14px #f7c94f)");
	return parts.length ? { filter: parts.join(" ") } : {};
});

const showActions = ref(false);
const hovered = ref(false);

const dotKeysOrder = [
	"villager",
	"outsider",
	"minion",
	"demon",
	"suspect",
	"trust",
	"pending",
];
const dotLabels: Record<string, string> = {
	villager: "镇民",
	outsider: "外来者",
	minion: "爪牙",
	demon: "恶魔",
	suspect: "怀疑",
	trust: "可信",
	pending: "待定",
};
const dotColors: Record<string, string> = {
	villager: FACTION_COLORS[Faction.villager],
	outsider: FACTION_COLORS[Faction.outsider],
	minion: FACTION_COLORS[Faction.minion],
	demon: FACTION_COLORS[Faction.demon],
	suspect: "#F56C6C",
	trust: "#4fe67a",
	pending: "#888",
};

function toggleDot(key: string) {
	const c = props.data;
	const idx = c.customTags.indexOf(key);
	if (idx >= 0) {
		// 已存在 → 移除
		c.customTags.splice(idx, 1);
		return;
	}
	// 互斥分组：1~4 一组，5~7 一组
	const group1 = ["villager", "outsider", "minion", "demon"];
	const group2 = ["suspect", "trust", "pending"];
	if (group1.includes(key)) {
		c.customTags = c.customTags.filter((k) => !group1.includes(k));
	} else if (group2.includes(key)) {
		c.customTags = c.customTags.filter((k) => !group2.includes(k));
	}
	c.customTags.push(key);
}

function onKeyDown(e: KeyboardEvent) {
	const map: Record<string, string> = {
		"1": "villager",
		"2": "outsider",
		"3": "minion",
		"4": "demon",
		"5": "suspect",
		"6": "trust",
		"7": "pending",
	};
	const key = map[e.key];
	if (!hovered.value || !key) return;
	toggleDot(key);
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

function onCardClick(e: MouseEvent) {
	if (props.selecting) return; // 选择模式下不拦截，让父级处理
	e.stopPropagation();
	showActions.value = true;
}

const isDay = computed(() => Time.getPhase(dataStore.time) === Time.Phase.Day);

// 回忆
const canShowRecall = computed(
	() =>
		!props.data.hasTag(TagType.recall) &&
		!props.data.hasTag(TagType.dead) &&
		isDay.value,
);
const canAffordRecall = computed(() => dataStore.canAfford(ACTION_COST.recall));

// 技能
const canShowSkill = computed(() => {
	if (dataStore.gameOver) return false;
	if (props.data.hasTag(TagType.dead)) return false;
	const role = RoleMap[props.data.displayRole];
	return runFn(role?.canActivateSkill, props.data, dataStore.time) ?? false;
});
const needAPForSkill = computed(() => isDay.value);
const canAffordSkill = computed(
	() => !isDay.value || dataStore.canAfford(ACTION_COST.skill),
);

// 处决
const canShowExecute = computed(() => isDay.value);
const canAffordExecute = computed(() =>
	dataStore.canAfford(ACTION_COST.execute),
);

function onRecall() {
	if (!dataStore.canSpendActionPoints(ACTION_COST.recall)) return;
	showActions.value = false;
	const c = props.data;
	const infoBefore = [...c.info];
	logRecall(c.id);
	c.addTag(TagType.recall, { till: Time.FAR_FUTURE });
	const newInfo = c.info.filter((v) => !infoBefore.includes(v));
	if (newInfo.length !== 0)
		logSkillResolution(c.id, `在回忆时得知：${newInfo.join("；")}`);
	// 回忆后揭示身份到 Tab 面板
	dataStore.addKnownGoodRole(c.displayRole);
	emit("action-done");
}

/** 技能调动成功后的善后处理 */
function afterSkillActivate(c: Character) {
	logSkillActivate(c.id);
	// 每次成功调动技能消耗 1 点声望
	dataStore.reputation--;
	logReputationChange(-1, `#${c.id} 发动技能`);
}

async function onSkill() {
	showActions.value = false;
	// 先执行技能逻辑，返回 false 表示取消/失败
	const result = await RoleMap[props.data.displayRole]?.onActiveSkill?.(
		props.data,
	);
	if (result === false) {
		// 取消也要 emit action-done 让游戏循环继续
		emit("action-done");
		return;
	}
	// 白天消耗行动点，黎明/黄昏不消耗
	const isDay = Time.getPhase(dataStore.time) === Time.Phase.Day;
	if (isDay && !dataStore.canSpendActionPoints(ACTION_COST.skill)) return;
	afterSkillActivate(props.data);
	emit("action-done");
}

function onExecute() {
	showActions.value = false;
	dialog.warning({
		title: "确认处决",
		content: `确定要处决 #${props.data.id}（${calRoleName.value}）吗？`,
		positiveText: "确定",
		negativeText: "取消",
		onPositiveClick: () => {
			if (!dataStore.canSpendActionPoints(ACTION_COST.execute)) return;
			logExecute(props.data.id);
			props.data.addTag(TagType.executed);
			emit("action-done");
		},
	});
}

// ── 长按（移动端显示详情，等同于右键）──
function onTouchStart() {
	if (props.selecting) return;
	longPressTimer.value = setTimeout(() => {
		longPressTimer.value = null;
		showDetailModal.value = true;
	}, 500);
}
function onTouchEnd() {
	if (longPressTimer.value) {
		clearTimeout(longPressTimer.value);
		longPressTimer.value = null;
	}
}
function onTouchMove() {
	onTouchEnd();
}

function showDetail() {
	showDetailModal.value = true;
}
</script>

<style scoped>
.outer {
	width: 230px;
}
/* 标签 */
.tag-section {
	display: flex;
	flex-direction: column;
	gap: 3px;
	margin-top: 4px;
}
.tag-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	border: 1px solid rgba(255, 255, 255, 0.3);
	display: inline-block;
}
.tag-manager {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.tag-mgr-title {
	font-size: 14px;
	color: #888;
}
.preset-dots {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
}
.dot-btn {
	font-size: 10px;
	padding: 1px 6px;
	border-radius: 3px;
	color: #fff;
	cursor: pointer;
	opacity: 0.35;
}
.dot-btn.active {
	opacity: 1;
}

.action-buttons {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.no-action-hint {
	color: #888;
	font-size: 13px;
	text-align: center;
	margin: 0;
}
.header-with-badge {
	display: flex;
	align-items: center;
	gap: 6px;
}
.skill-badge {
	font-size: 14px;
	line-height: 1;
}
.death-badge {
	font-size: 14px;
	line-height: 1;
}
.info-box {
	max-height: 120px;
	overflow-y: auto;
}
</style>
