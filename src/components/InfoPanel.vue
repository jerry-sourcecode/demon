<template>
	<div class="info-panel">
		<div class="info-header">信息面板</div>
		<div class="info-scroll" ref="scrollRef">
			<div v-if="entries.length === 0" class="info-empty">
				暂无信息，开始游戏后自动记录
			</div>
			<div
				v-for="entry in entries"
				:key="entry.id"
				class="info-entry"
				:class="`info-entry--${entry.type}`">
				<div class="entry-header">
					<span class="entry-time">{{ entry.timeStr }}</span>
					<span class="entry-tag">{{ entry.tag }}</span>
				</div>
				<div class="entry-body">
					<AbilityMd :markdown="entry.text" />
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDataStore } from "@/store/value";
import { Time } from "@/utils/time";
import AbilityMd from "./AbilityMd.vue";
import type { GameEvent } from "@/data/gameLog";

interface InfoEntry {
	id: number;
	type: string;
	timeStr: string;
	tag: string;
	text: string;
}

const dataStore = useDataStore();
const scrollRef = ref<HTMLElement | null>(null);

function getCharLabel(id: number): string {
	return `#${id}`;
}

function formatTime(t: Time.TimeNumber): string {
	return Time.getTimeString(t);
}

const entries = computed<InfoEntry[]>(() => {
	const result: InfoEntry[] = [];
	const log: GameEvent[] = dataStore.gameLog;

	for (let i = 0; i < log.length; i++) {
		const event = log[i]!;
		const meta = event.meta as any;
		const t = formatTime(event.time);
		const subjectLabel =
			event.subject > 0 ? getCharLabel(event.subject) : "系统";

		// ① 夜晚死亡整合：在"进入 黎明"后收集本次时段的所有死亡
		// （死亡之间可能穿插 reputationChange/skillResolution 等伴随事件）
		if (event.type === "phaseChange" && meta.phase === "黎明") {
			const deathIds: number[] = [];
			const repChanges: GameEvent[] = [];
			let j = i + 1;
			while (j < log.length) {
				const next = log[j]!;
				if (next.type === "death") {
					deathIds.push(next.subject);
					j++;
					continue;
				}
				if (next.type === "reputationChange") {
					repChanges.push(next);
					j++;
					continue;
				}
				if (next.type === "skillResolution") {
					j++;
					continue;
				}
				break; // 遇到其他事件终止收集
			}
			// 夜间死亡编号按玩家 id 升序排列
			deathIds.sort((a, b) => a - b);
			const deaths = deathIds.map((id) =>
				id > 0 ? getCharLabel(id) : `#${id}`,
			);
			// 先输出黎明时段切换
			result.push({
				id: event.id,
				type: "phase",
				timeStr: t,
				tag: "时段",
				text: `进入 ${meta.phase}`,
			});
			// 再输出死亡汇总
			if (deaths.length > 0) {
				result.push({
					id: event.id,
					type: "death",
					timeStr: t,
					tag: "死亡",
					text: `昨天晚上，${deaths.join("、")} 被发现死在了家中`,
				});
			} else {
				result.push({
					id: event.id,
					type: "death",
					timeStr: t,
					tag: "死亡",
					text: `昨天晚上是平安夜`,
				});
			}
			// 然后输出被跳过的声望变动
			for (const rep of repChanges) {
				const rm = rep.meta as any;
				const sign = rm.delta > 0 ? "+" : "";
				result.push({
					id: rep.id,
					type: "reputation",
					timeStr: formatTime(rep.time),
					tag: "声望",
					text: `${sign}${rm.delta}（${rm.reason ?? ""}）→ ${rm.newValue}`,
				});
			}
			i = j - 1;
			continue;
		}

		switch (event.type) {
			case "recall":
				result.push({
					id: event.id,
					type: "recall",
					timeStr: t,
					tag: "回忆",
					text: `${subjectLabel} 回忆`,
				});
				break;

			case "skillActivate":
				result.push({
					id: event.id,
					type: "skill",
					timeStr: t,
					tag: "技能",
					text: `${subjectLabel} 释放了技能`,
				});
				break;

			case "execute": {
				const targetLabel =
					meta.target > 0
						? getCharLabel(meta.target)
						: `#${meta.target}`;
				// 再次处决已死亡的玩家
				if (meta.alreadyDead) {
					result.push({
						id: event.id,
						type: "execute",
						timeStr: t,
						tag: "处决",
						text: `${targetLabel} 被再次处决`,
					});
					break;
				}
				// 查看后续是否有该目标的处决死亡
				let diedByExecute = false;
				let j = i + 1;
				while (j < log.length) {
					const next = log[j]!;
					if (next.type === "death" && next.subject === meta.target) {
						const deathMeta = next.meta as any;
						if (deathMeta.cause === "execute") {
							diedByExecute = true;
						}
						break; // 不管是不是处决死，都是该目标的死亡事件
					}
					if (next.type !== "skillResolution") break; // 只跳过紧跟的技能日志
					j++;
				}
				result.push({
					id: event.id,
					type: "execute",
					timeStr: t,
					tag: "处决",
					text: diedByExecute
						? `${targetLabel} 被处决`
						: `${targetLabel} 被处决，但未死亡`,
				});
				break;
			}

			case "death": {
				// 非处决死亡（处决死亡已由 execute 逻辑覆盖）
				if (meta.cause === "execute") break;
				result.push({
					id: event.id,
					type: "death",
					timeStr: t,
					tag: "死亡",
					text: `${subjectLabel} 死亡`,
				});
				break;
			}

			case "reputationChange": {
				const sign = meta.delta > 0 ? "+" : "";
				result.push({
					id: event.id,
					type: "reputation",
					timeStr: t,
					tag: "声望",
					text: `${sign}${meta.delta}（${meta.reason ?? ""}）→ ${meta.newValue}`,
				});
				break;
			}

			case "phaseChange":
				result.push({
					id: event.id,
					type: "phase",
					timeStr: t,
					tag: "时段",
					text: `进入 ${meta.phase}`,
				});
				break;

			case "gameEnd":
				result.push({
					id: event.id,
					type: "end",
					timeStr: t,
					tag: "结局",
					text: meta.win
						? "胜利！"
						: `失败${meta.reason ? `（${meta.reason}）` : ""}`,
				});
				break;

			case "weatherInfo":
				if (meta.hidden) break;
				result.push({
					id: event.id,
					type: "weather",
					timeStr: t,
					tag: "天气",
					text: meta.detail,
				});
				break;

			case "announcement":
				result.push({
					id: event.id,
					type: "announcement",
					timeStr: t,
					tag: "公告",
					text: meta.detail,
				});
				break;
		}
	}
	return result;
});

// 新增条目时自动滚动到底部
watch(
	() => entries.value.length,
	() => {
		const el = scrollRef.value;
		if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
	},
);
</script>

<style scoped>
.info-panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: #fff;
	border-left: 1px solid #e0e0e0;
	font-size: 13px;
}
.info-header {
	padding: 10px 12px;
	font-weight: bold;
	font-size: 14px;
	color: #333;
	border-bottom: 1px solid #e0e0e0;
	flex-shrink: 0;
}
.info-scroll {
	flex: 1;
	overflow-y: auto;
	padding: 8px;
}
.info-empty {
	color: #aaa;
	text-align: center;
	padding: 40px 12px;
	font-size: 13px;
}
.info-entry {
	padding: 8px 10px;
	margin-bottom: 6px;
	border-radius: 6px;
	background: #f5f5f5;
	border-left: 3px solid #bbb;
}
.info-entry--recall {
	border-left-color: #4fc3f7;
}
.info-entry--skill {
	border-left-color: #ce93d8;
}
.info-entry--execute {
	border-left-color: #f74f4f;
}
.info-entry--death {
	border-left-color: #999;
}
.info-entry--reputation {
	border-left-color: #f7c94f;
}
.info-entry--phase {
	border-left-color: #4fc3f7;
	border-left-style: dashed;
	background: #fafafa;
}
.info-entry--end {
	border-left-color: #ff9800;
}
.entry-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 4px;
}
.entry-time {
	font-size: 11px;
	color: #999;
}
.entry-tag {
	font-size: 10px;
	padding: 1px 6px;
	border-radius: 3px;
	background: #e0e0e0;
	color: #666;
}
.entry-body {
	font-size: 13px;
	color: #333;
	line-height: 1.4;
}
</style>
