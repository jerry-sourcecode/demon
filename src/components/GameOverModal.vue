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
							综合得分：{{ totalScore }} / 120
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
							<span class="icon"><IconTrophy /></span>
							{{ ach }}
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

			<!-- Tab 2: 得分明细 -->
			<n-tab-pane
				name="score-detail"
				style="max-height: 70vh; overflow-y: auto">
				<template #tab>
					<span class="icon">
						<IconTrophy />
					</span>
					得分明细
				</template>
				<div style="padding: 8px 0">
					<n-card
						v-for="item in scoreBreakdown"
						:key="item.label"
						embedded
						style="margin-bottom: 8px">
						<div
							style="
								display: flex;
								align-items: center;
								gap: 12px;
							">
							<span
								style="
									width: 90px;
									flex-shrink: 0;
									font-size: 13px;
								">
								{{ item.label }}
							</span>
							<div style="flex: 1; min-width: 0">
								<n-progress
									:percentage="Math.round(item.pct)"
									:status="tierToStatus(item.tier)"
									:height="15"
									:indicator-placement="'inside'" />
								<div
									style="
										margin-top: 4px;
										font-size: 12px;
										color: #999;
									">
									{{ item.detail }}
								</div>
							</div>
							<n-statistic
								:value="Math.round(item.score)"
								style="width: 70px; flex-shrink: 0"
								tabular-nums>
								<template #suffix>
									<span style="font-size: 12px"
										>/ {{ item.max }}</span
									>
								</template>
							</n-statistic>
						</div>
					</n-card>

					<NDivider
						style="margin: 4px 0"
						v-if="parseAchievements.length !== 0" />

					<n-card
						v-for="ach in parseAchievements"
						:key="ach.label"
						size="small"
						:embedded="true"
						style="margin-bottom: 4px">
						<div
							style="
								display: flex;
								align-items: center;
								gap: 12px;
							">
							<span
								style="
									width: 90px;
									flex-shrink: 0;
									font-size: 13px;
								">
								{{ ach.label }}
							</span>
							<n-tag
								:type="ach.negative ? 'error' : 'success'"
								size="small"
								style="flex-shrink: 0">
								{{ ach.negative ? "" : "+" }}{{ ach.score }}
							</n-tag>
							<span style="font-size: 12px; color: #999">
								{{ ach.detail }}
							</span>
						</div>
					</n-card>

					<NDivider style="margin: 4px 0" />

					<n-card
						size="small"
						style="
							margin-top: 8px;
							background: #fafafa;
							text-align: center;
						">
						<n-statistic :value="totalScoreDisplay">
							<template #label>
								<span style="font-weight: bold"> 总分 </span>
							</template>
						</n-statistic>
						<p
							style="
								margin-top: 4px;
								font-size: 13px;
								color: #888;
							">
							{{ ratingDisplay }}
						</p>
					</n-card>
				</div>
			</n-tab-pane>

			<!-- Tab 3: 角色揭秘 -->
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
	IconTrophy,
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
	NProgress,
	NStatistic,
} from "naive-ui";
import { RoleMap, Faction, type RoleType, type Alignment } from "@/data/model";
import type { GameEvent } from "@/data/gameLog";
import type { MatchRecord } from "@/data/match";
import { WeatherMap } from "@/data/weather";
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
	alignment: Alignment;
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
			const isEvilByFaction =
				fac === Faction.demon || fac === Faction.minion;
			return {
				id,
				role,
				// 优先使用记录中的阵营；缺失时回退到初始角色阵营，避免全蓝
				alignment: fc?.alignment ?? (isEvilByFaction ? "evil" : "good"),
				isEvilByFaction,
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
	// 按游戏结束时的阵营（善良/邪恶）着色
	return c.alignment === "evil" ? "#f74f4f" : "#4fc3f7";
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

interface ScoreBreakdownItem {
	label: string;
	score: number;
	max: number;
	pct: number;
	detail: string;
	tier: "good" | "ok" | "bad";
}

interface AchievementItem {
	label: string;
	score: number;
	detail: string;
	negative?: boolean;
}

interface RatingResult {
	rating: string;
	tagType: "success" | "info" | "warning" | "error" | "default";
	totalScore: number;
	achievements: string[];
	breakdown: ScoreBreakdownItem[];
	achievementItems: AchievementItem[];
}

const ratingResult = computed<RatingResult>(() => {
	const {
		win,
		stats: {
			totalDays: days,
			evilTotal,
			goodTotal,
			evilExecuted,
			executeCount,
			recallCount,
			skillActivateCount,
			skillDayCount,
			goodAlive,
			finalReputation,
		},
		config: { actionPoints: maxAP, reputation: initRep },
	} = props.record;
	const accuracy = executeAccuracy.value;
	const achievements: string[] = [];

	// ── 各项分值计算 ──
	const evilClearRate = evilTotal > 0 ? evilExecuted / evilTotal : 1;
	const accScore = executeCount > 0 ? (accuracy / 100) * 15 : 0;
	const effScore = Math.max(0, 10 - (days - 1) * 2);
	const totalAP = maxAP * days;
	// 仅白天发动的技能消耗行动力（旧记录无 skillDayCount 时回退为全部技能）
	const skillApCount = skillDayCount ?? skillActivateCount;
	const usedAP = recallCount * 2 + executeCount * 3 + skillApCount * 2;
	const apUtilRate = totalAP > 0 ? Math.min(1, usedAP / totalAP) : 1;
	const goodSurvivalRate = goodTotal > 0 ? goodAlive / goodTotal : 1;
	const repRemainRate =
		initRep > 0 ? Math.min(1, finalReputation / initRep) : 1;

	const baseScore = win ? 20 + evilClearRate * 15 : evilClearRate * 15;
	const apScore = apUtilRate * 5;
	const goodScore = goodSurvivalRate * 20;
	const repScore = repRemainRate * 15;

	const breakdown: ScoreBreakdownItem[] = [
		{
			label: "胜利",
			score: win ? 20 : 0,
			max: 20,
			pct: win ? 100 : 0,
			detail: win ? "游戏胜利" : "游戏失败",
			tier: win ? "good" : "bad",
		},
		{
			label: "邪恶清除率",
			score: evilClearRate * 15,
			max: 15,
			pct: evilClearRate * 100,
			detail: `清除 ${evilExecuted}/${evilTotal}`,
			tier:
				evilClearRate >= 1 ? "good" : evilClearRate > 0 ? "ok" : "bad",
		},
		{
			label: "处决精准度",
			score: accScore,
			max: 15,
			pct: executeCount > 0 ? accuracy : 0,
			detail:
				executeCount > 0
					? `处决 ${executeCount} 次，精准度 ${accuracy}%`
					: "未进行处决",
			tier: accuracy >= 100 ? "good" : accuracy >= 50 ? "ok" : "bad",
		},
		{
			label: "效率",
			score: effScore,
			max: 10,
			pct: (effScore / 10) * 100,
			detail: `游戏花费 ${days} 天`,
			tier: effScore >= 8 ? "good" : effScore >= 4 ? "ok" : "bad",
		},
		{
			label: "行动力利用",
			score: apScore,
			max: 5,
			pct: apUtilRate * 100,
			detail: `总AP ${totalAP}，使用 ${usedAP}，利用率 ${Math.round(apUtilRate * 100)}%`,
			tier: apUtilRate >= 0.8 ? "good" : apUtilRate >= 0.5 ? "ok" : "bad",
		},
		{
			label: "善良存活率",
			score: goodScore,
			max: 20,
			pct: goodSurvivalRate * 100,
			detail: `${goodAlive}/${goodTotal} 存活，存活率 ${Math.round(goodSurvivalRate * 100)}%`,
			tier:
				goodSurvivalRate >= 1
					? "good"
					: goodSurvivalRate >= 0.5
						? "ok"
						: "bad",
		},
		{
			label: "声望剩余率",
			score: repScore,
			max: 15,
			pct: repRemainRate * 100,
			detail: `最终 ${finalReputation}/${initRep}，剩余率 ${Math.round(repRemainRate * 100)}%`,
			tier:
				repRemainRate >= 1
					? "good"
					: repRemainRate >= 0.5
						? "ok"
						: "bad",
		},
	];

	// ── 成就 ──
	// 一次遍历统计处决相关数据
	let goodExecuted = 0;
	let firstExecuteEvil = false;
	let foundFirstExecute = false;
	for (const e of props.record.events) {
		if (e.type !== "execute") continue;
		const tid = (e.meta as any)?.target;
		if (tid == null || typeof tid !== "number") continue;
		const role: RoleType | undefined = props.record.initRoles[tid];
		if (!role) continue;
		const isEvil =
			RoleMap[role]?.faction === Faction.demon ||
			RoleMap[role]?.faction === Faction.minion;
		if (!isEvil) goodExecuted++;
		if (!foundFirstExecute) {
			firstExecuteEvil = isEvil;
			foundFirstExecute = true;
		}
	}
	// 未回忆玩家数
	const unrecalled = evilTotal + goodTotal - recallCount;

	let bonusScore = 0;
	const achievementItems: AchievementItem[] = [];

	// 正向
	if (win && apUtilRate > 0.8) {
		achievements.push("物尽其用");
		bonusScore += 3;
		achievementItems.push({
			label: "物尽其用",
			score: 3,
			detail: `AP利用率 ${Math.round(apUtilRate * 100)}%，大于 80%`,
		});
	}
	if (win && accuracy === 100 && executeCount > 0) {
		achievements.push("铁血执法");
		bonusScore += 5;
		achievementItems.push({
			label: "铁血执法",
			score: 5,
			detail: "所有处决均命中邪恶",
		});
	}
	if (win && skillActivateCount < 3) {
		achievements.push("技艺精湛");
		bonusScore += 5;
		achievementItems.push({
			label: "技艺精湛",
			score: 5,
			detail: `使用技能 ${skillActivateCount} 次，小于 3 次`,
		});
	}
	if (win && goodSurvivalRate >= 1) {
		achievements.push("人民卫士");
		bonusScore += 10;
		achievementItems.push({
			label: "人民卫士",
			score: 10,
			detail: "所有善良玩家存活",
		});
	}
	if (win && days <= 3) {
		achievements.push("速战速决");
		bonusScore += 5;
		achievementItems.push({
			label: "速战速决",
			score: 5,
			detail: `经过 ${days} 天，少于等于 3 天。`,
		});
	}
	if (win && days <= 1) {
		achievements.push("雷厉风行");
		bonusScore += 10;
		achievementItems.push({
			label: "雷厉风行",
			score: 10,
			detail: "1 天结束战斗",
		});
	}
	if (win && firstExecuteEvil) {
		achievements.push("一己之力");
		bonusScore += 5;
		achievementItems.push({
			label: "一己之力",
			score: 5,
			detail: "首次处决即命中邪恶",
		});
	}
	if (win && goodExecuted >= 2) {
		achievements.push("亡羊补牢");
		bonusScore += 2;
		achievementItems.push({
			label: "亡羊补牢",
			score: 2,
			detail: `误杀 ${goodExecuted} 名善良（大于等于 2 名）后仍获胜`,
		});
	}
	if (win && unrecalled >= 3) {
		achievements.push("料事如神");
		bonusScore += 5;
		achievementItems.push({
			label: "料事如神",
			score: 5,
			detail: `${unrecalled} 人未回忆（大于等于 3 人）即获胜`,
		});
	}
	if (win && unrecalled >= 5) {
		achievements.push("游刃有余");
		bonusScore += 10;
		achievementItems.push({
			label: "游刃有余",
			score: 10,
			detail: `${unrecalled} 人未回忆（大于等于 5 人）且获胜`,
		});
	}
	if (win && finalReputation < 3) {
		achievements.push("绝处逢生");
		bonusScore += 3;
		achievementItems.push({
			label: "绝处逢生",
			score: 3,
			detail: `最终声望 ${finalReputation} （少于 3 点）险胜`,
		});
	}

	// 反向
	if (!win && evilExecuted === 0) {
		achievements.push("尸位素餐");
		bonusScore -= 5;
		achievementItems.push({
			label: "尸位素餐",
			score: -5,
			detail: "未处决任何邪恶",
			negative: true,
		});
	}
	if (days > 7) {
		achievements.push("夜长梦多");
		bonusScore -= 3;
		achievementItems.push({
			label: "夜长梦多",
			score: -3,
			detail: `经过 ${days} 天（大于 7 天）`,
			negative: true,
		});
	}
	if (goodExecuted > 0) {
		achievements.push("滥杀无辜");
		bonusScore -= 2;
		achievementItems.push({
			label: "滥杀无辜",
			score: -2,
			detail: `误杀 ${goodExecuted} 名善良`,
			negative: true,
		});
	}
	if (goodSurvivalRate <= 0.25) {
		achievements.push("生灵涂炭");
		bonusScore -= 5;
		achievementItems.push({
			label: "生灵涂炭",
			score: -5,
			detail: `善良存活率 ${Math.round(goodSurvivalRate * 100)}%（小于等于 25%）`,
			negative: true,
		});
	}

	const totalScore = Math.round(
		baseScore +
			accScore +
			effScore +
			apScore +
			goodScore +
			repScore +
			bonusScore,
	);

	// ── 评级 ──
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
	} else if (evilExecuted > 0) {
		rating = "C";
		tagType = "default";
	} else {
		rating = "D";
		tagType = "default";
	}

	return {
		rating,
		tagType,
		totalScore,
		achievements,
		breakdown,
		achievementItems,
	};
});

const rating = computed(() => ratingResult.value.rating);
const ratingTagType = computed(() => ratingResult.value.tagType);
const totalScore = computed(() => ratingResult.value.totalScore);
const achievements = computed(() => ratingResult.value.achievements);
const scoreBreakdown = computed(() => ratingResult.value.breakdown);
const parseAchievements = computed(() => ratingResult.value.achievementItems);

function tierToStatus(
	tier: "good" | "ok" | "bad",
): "success" | "warning" | "error" {
	if (tier === "good") return "success";
	if (tier === "ok") return "warning";
	return "error";
}

const totalScoreDisplay = computed(() => totalScore.value);
const ratingDisplay = computed(() => `评级：${rating.value}`);

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
	weatherChange: "天气改变",
	weatherInfo: "天气信息",
	announcement: "公告",
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
				sp += `【::confused:: 来自${typeof meta.confusedBy === "string" ? meta.confusedBy : `#${meta.confusedBy}`}】`;
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
					? typeof meta.source === "string"
						? `，施加者：${meta.source}`
						: `，施加者：#${meta.source}（::${meta.sourceRole ?? "unknown"}::）`
					: "";
				return `#${event.subject}（::${cr}::）开始::confused::${tillStr}${sourceStr}`;
			} else {
				const sourceStr = meta.source
					? typeof meta.source === "string"
						? `来自 ${meta.source}的`
						: `来自 #${meta.source}（::${meta.sourceRole ?? "unknown"}::）的`
					: "";
				return `#${event.subject}（::${cr}::）${sourceStr}::confused::被清除`;
			}
		}
		case "weatherChange": {
			const w = WeatherMap[meta.weather as keyof typeof WeatherMap];
			const weatherName = w
				? `${w.icon}${w.display}`
				: String(meta.weather ?? "");
			return meta.action === "reroll"
				? `重掷天气，改变为：${weatherName}`
				: `本局天气：${weatherName}`;
		}
		case "weatherInfo":
			return meta.detail ?? "";
		case "announcement":
			return meta.detail ?? "";
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
