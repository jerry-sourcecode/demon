<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		title="对决记录"
		style="max-width: 700px; width: 90vw; max-height: 80vh"
		:mask-closable="false">
		<div v-if="matchStore.matchRecords.length === 0" class="empty">
			<n-empty description="暂无对决记录" />
		</div>
		<div v-else class="record-list">
			<div class="list-header">
				<span class="record-count"
					>共 {{ matchStore.matchRecords.length }} 条记录</span
				>
				<n-button
					size="tiny"
					type="error"
					quaternary
					@click="onClearAll">
					清空全部
				</n-button>
			</div>
			<n-list>
				<n-list-item
					v-for="rec in matchStore.matchRecords"
					:key="rec.id"
					class="record-item"
					clickable
					@click="onViewDetail(rec)">
					<template #prefix>
						<span class="result-icon-sm">{{
							rec.win ? "🏆" : "💀"
						}}</span>
					</template>
					<div class="record-content">
						<div class="record-top">
							<span class="record-date">{{
								formatDate(rec.date)
							}}</span>
							<span
								class="record-result"
								:style="{
									color: rec.win ? '#4fc3f7' : '#f74f4f',
								}">
								{{ rec.win ? "胜利" : "失败" }}
							</span>
						</div>
						<div class="record-meta">
							<span class="meta-item"
								>{{ rec.config.villager }}×镇民
								{{ rec.config.outsider }}×外来者
								{{ rec.config.minion }}×爪牙
								{{ rec.config.demon }}×恶魔</span
							>
							<span class="meta-item"
								>行动力 {{ rec.config.actionPoints }}</span
							>
							<span class="meta-item"
								>初始声望 {{ rec.config.reputation }}</span
							>
						</div>
					</div>
					<template #suffix>
						<n-button
							size="tiny"
							quaternary
							type="error"
							@click.stop="onDelete(rec.id)"
							>✕</n-button
						>
					</template>
				</n-list-item>
			</n-list>
		</div>

		<!-- 记录详情弹窗（复用 GameOverModal） -->
		<GameOverModal
			v-if="selectedRecord"
			v-model:show="showDetail"
			:record="selectedRecord"
			:show-actions="false" />
	</n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NModal, NButton, NList, NListItem, NEmpty, useDialog } from "naive-ui";
import { useMatchStore } from "@/store/matchStore";
import type { MatchRecord } from "@/data/match";
import GameOverModal from "./GameOverModal.vue";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
	"update:show": [value: boolean];
}>();

const showModal = computed({
	get: () => props.show,
	set: (val) => emit("update:show", val),
});

const matchStore = useMatchStore();
const dialog = useDialog();

const showDetail = ref(false);
const selectedRecord = ref<MatchRecord | null>(null);

function formatDate(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function onViewDetail(rec: MatchRecord) {
	selectedRecord.value = rec;
	showDetail.value = true;
}

function onDelete(id: string) {
	dialog.warning({
		title: "删除记录",
		content: "确定要删除这条对决记录吗？",
		positiveText: "删除",
		negativeText: "取消",
		onPositiveClick: () => {
			matchStore.deleteMatchRecord(id);
		},
	});
}

function onClearAll() {
	dialog.warning({
		title: "清空全部记录",
		content: "确定要清空所有对决记录吗？此操作不可撤销。",
		positiveText: "清空",
		negativeText: "取消",
		onPositiveClick: () => {
			matchStore.clearMatchRecords();
		},
	});
}
</script>

<style scoped>
.empty {
	padding: 40px 0;
}
.record-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.list-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.record-count {
	font-size: 13px;
	color: #888;
}
.record-item {
	cursor: pointer;
}
.record-content {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.record-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.record-date {
	font-size: 13px;
	color: #888;
}
.record-result {
	font-size: 14px;
	font-weight: bold;
}
.record-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.meta-item {
	font-size: 12px;
	color: #888;
	background: transparent;
	padding: 2px 0px;
	border-radius: 4px;
}
.result-icon-sm {
	font-size: 20px;
}
</style>
