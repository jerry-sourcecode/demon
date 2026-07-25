<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		:mask-closable="false"
		style="max-width: 900px; width: 90vw; max-height: 85vh"
		title="游戏结束">
		<n-tabs type="line" animated>
			<!-- Tab 1: 概览 -->
			<n-tab-pane name="overview" tab="📊 概览">
				<div class="overview-container">
					<!-- 胜负结果 -->
					<div class="result-section">
						<div
							class="result-icon"
							:style="{ color: win ? '#4fc3f7' : '#f74f4f' }">
							{{ win ? "🏆" : "💀" }}
						</div>
						<h2 :style="{ color: win ? '#4fc3f7' : '#f74f4f' }">
							{{ win ? "胜利！" : "失败..." }}
						</h2>
						<p class="result-subtitle">
							{{
								win ? "所有邪恶已被清除" : "声望归零，小镇沦陷"
							}}
						</p>
					</div>

					<!-- 评级 -->
					<div class="rating-section">
						<n-tag :type="ratingTagType" size="large" round>
							评级：{{ rating }}
						</n-tag>
						<p class="rating-score">
							综合得分：{{ totalScore }} / 100
						</p>
					</div>

					<!-- 关键数据 -->
					<n-card size="small" title="关键数据" class="stats-card">
						<div class="stats-grid">
							<div class="stat-item">
								<span class="stat-label">最终声望</span>
								<span class="stat-value">{{
									finalReputation
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">总天数</span>
								<span class="stat-value">{{ totalDays }}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">处决次数</span>
								<span class="stat-value">{{
									executeCount
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">回忆次数</span>
								<span class="stat-value">{{
									recallCount
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">善良存活</span>
								<span class="stat-value"
									>{{ goodAliveCount }} /
									{{ goodTotalCount }}</span
								>
							</div>
							<div class="stat-item">
								<span class="stat-label">处决邪恶</span>
								<span class="stat-value"
									>{{ evilExecutedCount }} /
									{{ evilTotalCount }}</span
								>
							</div>
							<div class="stat-item">
								<span class="stat-label">处决准确度</span>
								<span class="stat-value"
									>{{ executeAccuracy }}%</span
								>
							</div>
						</div>
					</n-card>

					<!-- 成就 -->
					<div class="achievements" v-if="achievements.length > 0">
						<n-tag
							v-for="ach in achievements"
							:key="ach"
							type="warning"
							round
							size="small">
							🏅 {{ ach }}
						</n-tag>
					</div>

					<!-- 操作按钮 -->
					<div class="actions">
						<n-button type="primary" @click="restartGame"
							>再来一局</n-button
						>
					</div>
				</div>
			</n-tab-pane>

			<!-- Tab 2: 角色揭秘 -->
			<n-tab-pane name="reveal" tab="🔍 角色揭秘">
				<div class="reveal-grid">
					<n-card
						v-for="c in charList"
						:key="c.id"
						size="small"
						class="reveal-card"
						:style="{ borderColor: factionColor(c) }">
						<template #header>
							<span :style="{ color: factionColor(c) }">
								#{{ c.id }} {{ roleDisplayName(c) }}
							</span>
						</template>
						<template #header-extra>
							<n-tag v-if="c.isEvil()" type="error" size="tiny">{{
								factionLabel(c)
							}}</n-tag>
							<n-tag v-else type="info" size="tiny">{{
								factionLabel(c)
							}}</n-tag>
						</template>
						<div :class="{ 'dead-card': c.hasTag('dead' as any) }">
							<p v-if="c.hasTag('dead' as any)" class="dead-tag">
								☠ 已死亡
							</p>
							<p
								v-if="c.hasTag('disguise' as any)"
								class="disguise-tag">
								伪装为：{{ disguiseRoleName(c) }}
							</p>
						</div>
					</n-card>
				</div>
			</n-tab-pane>

			<!-- Tab 3: 复盘时间线 -->
			<n-tab-pane name="replay" tab="📜 复盘">
				<n-tabs type="segment" animated v-if="dayGroups.length > 0">
					<n-tab-pane
						v-for="group in dayGroups"
						:key="group.day"
						:name="`day${group.day}`"
						:tab="`第${group.day}天`">
						<div class="timeline-scroll">
							<n-timeline>
								<n-timeline-item
									v-for="event in group.events"
									:key="event.id"
									type="info"
									:title="formatEventTitle(event)"
									:time="
										event.timeStr.replace(/第\d+天/, '')
									">
									<AbilityMd
										:markdown="formatEventDetail(event)" />
								</n-timeline-item>
							</n-timeline>
						</div>
					</n-tab-pane>
				</n-tabs>
				<n-empty v-else description="暂无复盘数据" />
			</n-tab-pane>
		</n-tabs>
	</n-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	NModal,
	NTabs,
	NTabPane,
	NTag,
	NButton,
	NCard,
	NTimeline,
	NTimelineItem,
	NEmpty,
} from "naive-ui";
import { useDataStore } from "@/store/value";
import { RoleMap, Faction, type Character } from "@/data/model";
import { FACTION_COLORS } from "@/data/keywords";
import type { GameEvent } from "@/data/gameLog";
import { Time } from "@/utils/time";
import { TagType } from "@/data/tag";
import AbilityMd from "./AbilityMd.vue";

const props = defineProps<{
	win: boolean;
	show: boolean;
}>();

const emit = defineEmits<{
	"update:show": [value: boolean];
	restart: [];
}>();

const showModal = computed({
	get: () => props.show,
	set: (val) => emit("update:show", val),
});

const dataStore = useDataStore();

// ── 统计数据 ──

const log = computed(() => dataStore.gameLog);

const totalDays = computed(() => {
	const days = new Set(log.value.map((e) => Time.getDay(e.time)));
	return days.size;
});

const executeCount = computed(
	() => log.value.filter((e) => e.type === "execute").length,
);

const recallCount = computed(
	() => log.value.filter((e) => e.type === "recall").length,
);

const finalReputation = computed(() => {
	const endEvent = log.value.find((e) => e.type === "gameEnd");
	return (endEvent?.meta as any)?.reputation ?? dataStore.reputation;
});

const charList = computed(() => dataStore.charList());

/** 真实邪恶（不含隐士）：faction 为 demon 或 minion */
function isTrulyEvil(c: Character): boolean {
	const fac = RoleMap[c.role]?.faction;
	return fac === Faction.demon || fac === Faction.minion;
}

const goodTotalCount = computed(
	() => charList.value.filter((c) => !isTrulyEvil(c)).length,
);
const goodAliveCount = computed(
	() =>
		charList.value.filter((c) => !isTrulyEvil(c) && !c.hasTag(TagType.dead))
			.length,
);
const evilTotalCount = computed(
	() => charList.value.filter((c) => isTrulyEvil(c)).length,
);

const evilExecutedCount = computed(() => {
	const executed = log.value
		.filter((e) => e.type === "execute")
		.map((e) => (e.meta as any)?.target as number)
		.filter(Boolean);
	let count = 0;
	for (const id of executed) {
		const c = dataStore.chars.get(id);
		if (c && isTrulyEvil(c)) count++;
	}
	return count;
});

const executeAccuracy = computed(() => {
	const total = executeCount.value;
	if (total === 0) return 100;
	return Math.round((evilExecutedCount.value / total) * 100);
});

// ── 评级 ──

interface RatingResult {
	rating: string;
	tagType: "success" | "info" | "warning" | "error" | "default";
	totalScore: number;
	achievements: string[];
}

const ratingResult = computed<RatingResult>(() => {
	const win = props.win;
	const rep = finalReputation.value;
	const days = totalDays.value;
	const goodAlive = goodAliveCount.value;
	const goodTotal = goodTotalCount.value;
	const accuracy = executeAccuracy.value;
	const achievements: string[] = [];

	// 基础分
	let baseScore = win ? 60 : 0;

	// 声望 (25%)
	let repScore = 0;
	if (rep >= 20) repScore = 25;
	else if (rep >= 15) repScore = 20 + ((rep - 15) / 5) * 5;
	else if (rep >= 10) repScore = 15 + ((rep - 10) / 5) * 5;
	else if (rep > 0) repScore = (rep / 10) * 15;

	// 效率 (15%): ≤3天满分
	let effScore = 0;
	if (days <= 3) effScore = 15;
	else if (days <= 5) effScore = 10 + ((5 - days) / 2) * 5;
	else if (days <= 7) effScore = ((7 - days) / 2) * 10;

	// 善良存活 (10%): ≥7人满分
	let goodScore = 0;
	const goodRatio = goodTotal > 0 ? goodAlive / goodTotal : 0;
	if (goodAlive >= 7) goodScore = 10;
	else if (goodAlive >= 5) goodScore = 7 + ((goodAlive - 5) / 2) * 3;
	else if (goodAlive >= 3) goodScore = ((goodAlive - 3) / 2) * 7;

	// 处决准确度 (10%)
	let accScore = (accuracy / 100) * 10;

	// 成就加分
	if (accuracy === 100 && executeCount.value > 0) {
		achievements.push("零误杀");
	}
	if (win && days <= 3) {
		achievements.push("速通");
	}
	const repNeverDrop = !log.value.some(
		(e) => e.type === "reputationChange" && (e.meta as any)?.delta < 0,
	);
	if (repNeverDrop && win) {
		achievements.push("完美守护");
	}

	let bonusScore = 0;
	if (achievements.includes("零误杀")) bonusScore += 3;
	if (achievements.includes("速通")) bonusScore += 2;
	if (achievements.includes("完美守护") && !achievements.includes("零误杀"))
		bonusScore += 3;

	const totalScore = Math.min(
		100,
		Math.round(
			baseScore + repScore + effScore + goodScore + accScore + bonusScore,
		),
	);

	let rating: string;
	let tagType: RatingResult["tagType"];
	if (totalScore >= 90) {
		rating = "S";
		tagType = "error";
	} else if (totalScore >= 75) {
		rating = "A";
		tagType = "warning";
	} else if (totalScore >= 60) {
		rating = "B";
		tagType = "info";
	} else if (evilExecutedCount.value > 0) {
		rating = "C";
		tagType = "default";
	} else {
		rating = "D";
		tagType = "default";
	}

	return { rating, tagType, totalScore, achievements };
});

const rating = computed(() => ratingResult.value.rating);
const ratingTagType = computed(() => ratingResult.value.tagType);
const totalScore = computed(() => ratingResult.value.totalScore);
const achievements = computed(() => ratingResult.value.achievements);

// ── 角色揭秘辅助 ──

function factionColor(c: Character): string {
	const fac = RoleMap[c.role]?.faction;
	return FACTION_COLORS[fac] || "#888";
}

function factionLabel(c: Character): string {
	const fac = RoleMap[c.role]?.faction;
	if (fac === Faction.villager) return "镇民";
	if (fac === Faction.outsider) return "外来者";
	if (fac === Faction.minion) return "爪牙";
	if (fac === Faction.demon) return "恶魔";
	return "未知";
}

function roleDisplayName(c: Character): string {
	return RoleMap[c.role]?.display ?? c.role;
}

function disguiseRoleName(c: Character): string {
	const tg = c.getTag(TagType.disguise)[0];
	return tg ? (RoleMap[tg.meta]?.display ?? tg.meta) : "无";
}

// ── 复盘时间线 ──

interface DayGroup {
	day: number;
	events: GameEvent[];
}

const dayGroups = computed<DayGroup[]>(() => {
	const groups = new Map<number, GameEvent[]>();
	for (const event of log.value) {
		const day = Time.getDay(event.time);
		if (!groups.has(day)) groups.set(day, []);
		groups.get(day)!.push(event);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([day, events]) => ({ day, events }));
});

const EVENT_LABELS: Record<string, string> = {
	gameStart: "🎬 游戏开始",
	phaseChange: "⏰ 阶段切换",
	recall: "🔍 回忆",
	execute: "⚔️ 处决",
	death: "☠ 死亡",
	disguiseChange: "🎭 伪装变更",
	reputationChange: "📊 声望变化",
	skillResolution: "🔄 技能结算",
	gameEnd: "🏁 游戏结束",
};

function formatEventTitle(event: GameEvent): string {
	return EVENT_LABELS[event.type] ?? event.type;
}

function formatEventDetail(event: GameEvent): string {
	const meta = event.meta as any;
	const c = event.subject > 0 ? dataStore.chars.get(event.subject) : null;
	const subjectName = c ? `#${c.id}（::${c.role}::）` : "系统";

	const subjC = dataStore.chars.get(event.subject);
	const disguiseTg = subjC?.getTag(TagType.disguise)[0];
	let prefix = subjC ? `#${subjC.id} ::${subjC.role}::` : "系统";
	if (disguiseTg) prefix += `（伪装：::${disguiseTg.meta}::）`;

	switch (event.type) {
		case "gameStart":
			return "初始发牌完成，游戏开始";
		case "phaseChange":
			return `进入${meta.phase}`;
		case "recall":
			return `${prefix} 进行了回忆${meta.revealedInfo ? `：${meta.revealedInfo}` : ""}`;
		case "execute":
			return `玩家处决了 #${meta.target}`;
		case "death": {
			return `${prefix} 死亡${meta.cause === "execute" ? "【被处决】" : meta.cause === "night" ? "【夜间死亡】" : ""}`;
		}
		case "disguiseChange":
			if (meta.newRole) {
				return `${subjectName} 获得了伪装身份：::${meta.newRole}::`;
			} else {
				return `${subjectName} 的伪装身份被移除，真实身份暴露`;
			}
		case "reputationChange":
			return `声望 ${meta.delta > 0 ? "+" : ""}${meta.delta}：${meta.reason}，当前 ${meta.newValue}`;
		case "skillResolution": {
			const subjC = dataStore.chars.get(event.subject);
			let sp = subjC ? `#${subjC.id} ::${subjC.role}::` : "系统";
			if (meta.disguised && meta.disguiseRole)
				sp += `（伪装：::${meta.disguiseRole}::）`;
			if (meta.confused) sp += `（::confused::）`;
			return `${sp}：${meta.detail ?? ""}`;
		}
		case "gameEnd":
			return meta.win
				? "胜利！所有邪恶已被消灭"
				: `失败！声望归零（最终声望：${meta.reputation}）`;
		default:
			return "";
	}
}

function restartGame() {
	showModal.value = false;
	emit("restart");
}
</script>

<style scoped>
.overview-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 20px;
	padding: 10px 0;
}

.result-section {
	text-align: center;
}

.result-icon {
	font-size: 64px;
	margin-bottom: 8px;
}

.result-subtitle {
	color: #888;
	margin-top: 4px;
}

.rating-section {
	text-align: center;
}

.rating-score {
	color: #888;
	margin-top: 6px;
	font-size: 14px;
}

.stats-card {
	width: 100%;
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;
}

.stat-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.stat-label {
	font-size: 12px;
	color: #888;
}

.stat-value {
	font-size: 18px;
	font-weight: bold;
}

.achievements {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: center;
}

.actions {
	margin-top: 8px;
}

/* 角色揭秘 */
.reveal-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 10px;
	max-height: 500px;
	overflow-y: auto;
}

.reveal-card {
	transition: opacity 0.3s;
}

.dead-card {
	opacity: 0.7;
}

.dead-tag {
	color: #f74f4f;
	font-size: 13px;
	margin: 0;
}

.disguise-tag {
	color: #f7c94f;
	font-size: 13px;
	margin: 0;
}

/* 复盘时间线：滚动仅作用于时间线内容，天标题在外部 */
.timeline-scroll {
	max-height: 50vh;
	overflow-y: auto;
	overflow-x: hidden;
}
</style>
