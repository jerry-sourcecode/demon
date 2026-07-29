<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		:mask-closable="false"
		:closable="false"
		style="max-width: 900px; width: 90vw"
		:title="
			showActions
				? '游戏结束'
				: `对决记录 - ${formatDate(props.record.date)}`
		">
		<n-tabs type="line" animated>
			<!-- Tab 1: 概览 -->
			<n-tab-pane
				name="overview"
				style="max-height: 70vh; overflow-y: auto">
				<template #tab>
					<span class="icon">
						<IconChartBar />
					</span>
					概览
				</template>
				<div class="overview-container">
					<!-- 胜负结果 -->
					<div class="result-section">
						<div
							class="result-icon"
							:style="{
								color: record.win ? '#4fc3f7' : '#f74f4f',
							}">
							{{ record.win ? "🏆" : "💀" }}
						</div>
						<h2
							:style="{
								color: record.win ? '#4fc3f7' : '#f74f4f',
							}">
							{{ record.win ? "胜利！" : "失败..." }}
						</h2>
						<p v-if="!showActions" class="result-subtitle">
							{{ record.win ? "所有邪恶已被清除" : "小镇沦陷" }}
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
									record.stats.finalReputation
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">总天数</span>
								<span class="stat-value">{{
									record.stats.totalDays
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">处决次数</span>
								<span class="stat-value">{{
									record.stats.executeCount
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">回忆次数</span>
								<span class="stat-value">{{
									record.stats.recallCount
								}}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">善良存活</span>
								<span class="stat-value"
									>{{ record.stats.goodAlive }} /
									{{ record.stats.goodTotal }}</span
								>
							</div>
							<div class="stat-item">
								<span class="stat-label">处决邪恶</span>
								<span class="stat-value"
									>{{ record.stats.evilExecuted }} /
									{{ record.stats.evilTotal }}</span
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

					<!-- 配置信息 -->
					<div class="match-config-line">
						配置：{{ record.config.villager }} 镇民
						{{ record.config.outsider }} 外来者
						{{ record.config.minion }} 爪牙
						{{ record.config.demon }} 恶魔
						<NDivider vertical />
						行动力
						{{ record.config.actionPoints }}
						<NDivider vertical />
						初始声望
						{{ record.config.reputation }}
					</div>

					<!-- 操作按钮 -->
					<div class="actions">
						<template v-if="showActions">
							<n-button
								type="primary"
								@click="restartGame"
								style="margin-right: 12px"
								>再来一局</n-button
							>
							<n-button @click="goHome" style="margin-right: 12px"
								>回到首页</n-button
							>
						</template>
						<template v-else>
							<n-button
								@click="showModal = false"
								style="margin-right: 12px"
								>关闭</n-button
							>
						</template>
						<n-button
							@click="exportReplay"
							style="margin-right: 12px"
							>导出复盘</n-button
						>
						<n-button @click="copyReplayJSON">复制 JSON</n-button>
					</div>
				</div>
			</n-tab-pane>

			<!-- Tab 2: 角色揭秘 -->
			<n-tab-pane name="reveal">
				<template #tab>
					<span class="icon">
						<IconMagnify />
					</span>
					角色揭秘
				</template>
				<div class="reveal-grid">
					<n-card
						v-for="c in charList"
						:key="c.id"
						size="small"
						class="reveal-card"
						:style="{ borderColor: factionColor(c) }">
						<template #header>
							<AbilityMd :markdown="`#${c.id} ::${c.role}::`" />
						</template>
						<template #header-extra>
							<n-tag
								v-if="c.isEvilByFaction"
								type="error"
								size="tiny"
								>{{ factionLabel(c) }}</n-tag
							>
							<n-tag v-else type="info" size="tiny">{{
								factionLabel(c)
							}}</n-tag>
						</template>
						<div :class="{ 'dead-card': c.dead }">
							<p v-if="c.dead" class="dead-tag">
								<span class="icon" style="font-size: 14px">
									<IconSkull />
								</span>
								{{ c.deathCause }}
							</p>
							<div v-if="c.disguiseRole" class="disguise-tag">
								<AbilityMd
									:markdown="`伪装为：::${c.disguiseRole}::`" />
							</div>
						</div>
					</n-card>
				</div>
			</n-tab-pane>

			<!-- Tab 3: 复盘时间线 -->
			<n-tab-pane name="replay">
				<template #tab>
					<span class="icon">
						<IconScrollText />
					</span>
					复盘
				</template>
				<n-tabs
					type="segment"
					animated
					v-model:value="replayDayTab"
					v-if="dayGroups.length > 0">
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
									:time="formatTimeStr(event.time)">
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
import { computed, ref, h } from "vue";
import {
	IconChartBar,
	IconMagnify,
	IconScrollText,
	IconSkull,
} from "@iconify-prerendered/vue-mdi";
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
	useMessage,
	NDivider,
} from "naive-ui";
import { RoleMap, Faction, type RoleType } from "@/data/model";
import { FACTION_COLORS } from "@/data/keywords";
import type { GameEvent } from "@/data/gameLog";
import type { MatchRecord } from "@/data/match";
import { Time } from "@/utils/time";
import AbilityMd from "./AbilityMd.vue";

const props = withDefaults(
	defineProps<{
		show: boolean;
		record: MatchRecord;
		showActions?: boolean;
	}>(),
	{
		showActions: false,
	},
);

const emit = defineEmits<{
	"update:show": [value: boolean];
	restart: [];
	goHome: [];
}>();

const showModal = computed({
	get: () => props.show,
	set: (val) => emit("update:show", val),
});

function formatDate(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── 角色揭秘 ──

interface CharInfo {
	id: number;
	role: RoleType;
	isEvilByFaction: boolean;
	dead: boolean;
	deathCause: string;
	disguiseRole: string | null;
}

const charList = computed<CharInfo[]>(() => {
	const r = props.record;
	const deathCauseMap: Record<string, string> = {
		demon: "杀戮",
		assassin: "刺杀",
		execute: "处决",
		moonchild: "诅咒",
		slayer: "枪击",
		night: "夜间死亡",
		other: "死于非命",
	};
	return Object.entries(r.initRoles)
		.map(([idStr, role]) => {
			const id = Number(idStr);
			const fc = r.finalChars[id];
			const dead = !!fc?.dead;
			const deathType = fc?.deathType;
			const disguiseRole = fc?.disguiseRole ?? null;
			const fac = RoleMap[role]?.faction;
			return {
				id,
				role,
				isEvilByFaction:
					fac === Faction.demon || fac === Faction.minion,
				dead,
				deathCause: dead
					? (deathCauseMap[deathType ?? "other"] ?? "已死亡")
					: "",
				disguiseRole,
			};
		})
		.sort((a, b) => a.id - b.id);
});

function factionColor(c: CharInfo): string {
	const fac = RoleMap[c.role]?.faction;
	return FACTION_COLORS[fac ?? "unknown"] || "#888";
}

function factionLabel(c: CharInfo): string {
	const fac = RoleMap[c.role]?.faction;
	if (fac === Faction.villager) return "镇民";
	if (fac === Faction.outsider) return "外来者";
	if (fac === Faction.minion) return "爪牙";
	if (fac === Faction.demon) return "恶魔";
	return "未知";
}

const executeAccuracy = computed(() => {
	const total = props.record.stats.executeCount;
	if (total === 0) return 100;
	return Math.round((props.record.stats.evilExecuted / total) * 100);
});

// ── 评级 ──

interface RatingResult {
	rating: string;
	tagType: "success" | "info" | "warning" | "error" | "default";
	totalScore: number;
	achievements: string[];
}

const ratingResult = computed<RatingResult>(() => {
	const win = props.record.win;
	const rep = props.record.stats.finalReputation;
	const days = props.record.stats.totalDays;
	const goodAlive = props.record.stats.goodAlive;
	const accuracy = executeAccuracy.value;
	const achievements: string[] = [];

	let baseScore = win ? 30 : 0;

	let repScore = 0;
	if (rep >= 20) repScore = 25;
	else if (rep >= 15) repScore = 20 + ((rep - 15) / 5) * 5;
	else if (rep >= 10) repScore = 15 + ((rep - 10) / 5) * 5;
	else if (rep > 0) repScore = (rep / 10) * 15;

	let effScore = 0;
	if (days <= 3) effScore = 15;
	else if (days <= 5) effScore = 10 + ((5 - days) / 2) * 5;
	else if (days <= 7) effScore = ((7 - days) / 2) * 10;

	let goodScore = 0;
	if (goodAlive >= 7) goodScore = 10;
	else if (goodAlive >= 5) goodScore = 7 + ((goodAlive - 5) / 2) * 3;
	else if (goodAlive >= 3) goodScore = ((goodAlive - 3) / 2) * 7;

	let accScore = (accuracy / 100) * 10;

	if (accuracy === 100 && props.record.stats.executeCount > 0)
		achievements.push("零误杀");
	if (win && days <= 3) achievements.push("速通");
	const repNeverDrop = !props.record.events.some(
		(e) => e.type === "reputationChange" && (e.meta as any)?.delta < 0,
	);
	if (repNeverDrop && win) achievements.push("完美守护");

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
	} else if (props.record.stats.evilExecuted > 0) {
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

// ── 复盘时间线 ──

interface DayGroup {
	day: number;
	events: GameEvent[];
}

const dayGroups = computed<DayGroup[]>(() => {
	const groups = new Map<number, GameEvent[]>();
	for (const event of props.record.events) {
		if (event.type === "skillActivate") continue; // 信息面板专用，复盘隐藏
		const day = Time.getDay(event.time);
		if (!groups.has(day)) groups.set(day, []);
		groups.get(day)!.push(event);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([day, events]) => ({ day, events }));
});

const replayDayTab = ref<string>();

const EVENT_LABELS: Record<string, string> = {
	gameStart: "游戏开始",
	phaseChange: "阶段切换",
	recall: "回忆",
	execute: "处决",
	death: "死亡",
	disguiseChange: "伪装变更",
	reputationChange: "声望变化",
	skillResolution: "技能结算",
	gameEnd: "游戏结束",
	confusedChange: "混乱状态",
};

function formatEventTitle(event: GameEvent): string {
	return EVENT_LABELS[event.type] ?? event.type;
}

function formatTimeStr(t: Time.TimeNumber): string {
	return Time.getTimeString(t);
}

function formatEventDetail(event: GameEvent): string {
	const meta = event.meta as any;
	const initRole = props.record.initRoles[event.subject];
	const roleName = initRole ? `::${initRole}::` : "系统";
	const subjectName = initRole ? `#${event.subject}（${roleName}）` : "系统";
	const prefix = initRole ? `#${event.subject} ${roleName}` : "系统";

	switch (event.type) {
		case "gameStart":
			return "初始发牌完成，游戏开始";
		case "phaseChange":
			return `进入${meta.phase}`;
		case "recall":
			return `${prefix} 进行了回忆`;
		case "execute":
			return `玩家处决了 #${meta.target}`;
		case "death":
			return `${prefix} 死亡${meta.cause === "execute" ? "【被处决】" : meta.cause === "night" ? "【夜间死亡】" : ""}`;
		case "disguiseChange":
			return meta.newRole
				? `${subjectName} 获得了伪装身份：::${meta.newRole}::`
				: `${subjectName} 的伪装身份被移除`;
		case "reputationChange":
			return `声望 ${meta.delta > 0 ? "+" : ""}${meta.delta}：${meta.reason}，当前 ${meta.newValue}`;
		case "skillResolution": {
			const displayRole = meta.role ?? initRole ?? "unknown";
			let sp = `#${event.subject} ::${displayRole}::`;
			if (meta.disguised && meta.disguiseRole)
				sp += `（伪装：::${meta.disguiseRole}::）`;
			if (meta.confused && meta.confusedBy)
				sp += `【::confused:: 来自#${meta.confusedBy}】`;
			else if (meta.confused) sp += `（::confused::）`;
			return `${sp}：${meta.detail ?? ""}`;
		}
		case "gameEnd":
			return meta.win
				? "胜利！所有邪恶已被消灭"
				: (meta.reason ?? `失败（最终声望：${meta.reputation}）`);
		case "confusedChange": {
			const cr = meta.role ?? "unknown";
			if (meta.action === "add") {
				let tillStr =
					meta.till && meta.till !== Infinity
						? `，持续到 ${Time.getTimeString(meta.till)}`
						: "";
				const sourceStr = meta.source
					? `，施加者：#${meta.source}（::${meta.sourceRole ?? "unknown"}::）`
					: "";
				return `#${event.subject}（::${cr}::）开始::confused::${tillStr}${sourceStr}`;
			} else {
				const sourceStr = meta.source
					? `来自 #${meta.source}（::${meta.sourceRole ?? "unknown"}::）的`
					: "";
				return `#${event.subject}（::${cr}::）${sourceStr}::confused::被清除`;
			}
		}
		default:
			return "";
	}
}

function restartGame() {
	showModal.value = false;
	emit("restart");
}

function goHome() {
	showModal.value = false;
	emit("goHome");
}

function exportReplay() {
	const blob = new Blob([JSON.stringify(props.record, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `replay-${new Date().toISOString().slice(0, 10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

const message = useMessage();

async function copyReplayJSON() {
	try {
		await navigator.clipboard.writeText(
			JSON.stringify(props.record, null, 2),
		);
		message.success("复盘 JSON 已复制到剪贴板");
	} catch {
		message.error("复制失败，请手动导出");
	}
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

.match-config-line {
	font-size: 13px;
	color: #888;
	text-align: center;
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
