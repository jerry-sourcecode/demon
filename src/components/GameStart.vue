<template>
	<div class="start-page">
		<h1 class="title">夜幕审判</h1>
		<p class="subtitle">单人推理游戏</p>

		<div class="actions">
			<n-button
				v-if="hasSave"
				type="success"
				size="large"
				@click="onContinue"
				style="width: 100%; margin-bottom: 8px">
				继续游戏
			</n-button>
			<n-button
				type="primary"
				size="large"
				@click="onStart"
				style="width: 100%"
				>开始游戏</n-button
			>
		</div>

		<div class="secondary-actions">
			<n-button
				size="large"
				@click="showConfig = true"
				style="width: 100%"
				>配置</n-button
			>
			<n-button
				size="large"
				@click="showMatchHistory = true"
				style="width: 100%"
				>对决记录</n-button
			>
			<n-button
				size="large"
				@click="showImport = true"
				style="width: 100%"
				>导入复盘</n-button
			>
		</div>

		<!-- 统一配置弹窗（游戏配置 + AI 配置） -->
		<n-modal
			v-model:show="showConfig"
			preset="card"
			title="配置"
			style="max-width: 520px; width: 80vw"
			:mask-closable="false">
			<n-tabs type="segment" animated v-model:value="configTab">
				<!-- Tab 1: 游戏配置 -->
				<n-tab-pane name="game">
					<template #tab>
						<span class="icon">
							<IconSwordCross />
						</span>
						游戏
					</template>
					<div class="config-body">
						<div class="count-grid">
							<div class="count-item">
								<span class="count-label">镇民</span>
								<n-input-number
									v-model:value="localConfig.villager"
									:min="0"
									:max="15"
									size="small" />
							</div>
							<div class="count-item">
								<span class="count-label">外来者</span>
								<n-input-number
									v-model:value="localConfig.outsider"
									:min="0"
									:max="10"
									size="small" />
							</div>
							<div class="count-item">
								<span class="count-label">爪牙</span>
								<n-input-number
									v-model:value="localConfig.minion"
									:min="0"
									:max="7"
									size="small" />
							</div>
							<div class="count-item">
								<span class="count-label">恶魔</span>
								<n-input-number
									v-model:value="localConfig.demon"
									:min="0"
									:max="3"
									size="small" />
							</div>
						</div>
						<p class="total-hint">
							总计：{{ totalPlayers }} 名玩家
						</p>
						<n-divider />
						<div class="extra-grid">
							<div class="count-item">
								<span class="count-label">每轮行动力</span>
								<n-input-number
									v-model:value="localConfig.actionPoints"
									:min="3"
									:max="20"
									size="small" />
							</div>
							<div class="count-item">
								<span class="count-label">初始声望</span>
								<n-input-number
									v-model:value="localConfig.reputation"
									:min="1"
									:max="50"
									size="small" />
							</div>
						</div>
					</div>
				</n-tab-pane>

				<!-- Tab 2: AI 配置 -->
				<n-tab-pane name="ai">
					<template #tab>
						<span class="icon">
							<IconRobot />
						</span>
						AI
					</template>
					<div class="ai-form">
						<n-form-item label="启用 AI">
							<n-switch v-model:value="aiEnabled" />
						</n-form-item>
						<template v-if="aiEnabled">
							<n-form-item label="服务商">
								<n-select
									v-model:value="aiService"
									:options="aiServiceOptions"
									placeholder="选择 AI 服务商" />
							</n-form-item>
							<n-form-item label="API Key">
								<n-input
									v-model:value="aiApiKey"
									type="password"
									show-password-on="click"
									placeholder="输入 API Key" />
							</n-form-item>
							<n-form-item label="模型">
								<n-input
									v-model:value="aiModel"
									placeholder="deepseek-chat" />
							</n-form-item>
						</template>
						<n-alert
							v-if="aiEnabled && !hasAiConfig"
							type="warning"
							:show-icon="true">
							AI
							未配置，相关角色（艺术家、渔夫等）不会出现在游戏中
						</n-alert>
					</div>
				</n-tab-pane>
			</n-tabs>
			<template #footer>
				<div class="config-footer">
					<n-button @click="showConfig = false">取消</n-button>
					<n-button
						v-if="configTab === 'game'"
						type="primary"
						@click="onConfigApply">
						应用
					</n-button>
					<n-button
						v-if="configTab === 'ai'"
						type="primary"
						@click="onSaveAiConfig"
						:disabled="!aiApiKey.trim()">
						保存
					</n-button>
				</div>
			</template>
		</n-modal>

		<!-- 对决记录弹窗 -->
		<MatchHistoryModal v-model:show="showMatchHistory" />

		<!-- 导入复盘结果弹窗 -->
		<GameOverModal
			v-if="importedRecord"
			v-model:show="showImportResult"
			:record="importedRecord"
			:show-actions="false" />

		<!-- 导入复盘弹窗 -->
		<n-modal
			v-model:show="showImport"
			preset="card"
			title="导入复盘"
			style="max-width: 600px; width: 80vw">
			<n-tabs type="segment">
				<n-tab-pane name="file" tab="文件上传">
					<n-upload :show-file-list="false" @change="onFileUpload">
						<n-button>选择 JSON 文件</n-button>
					</n-upload>
					<p v-if="importError" class="error">{{ importError }}</p>
				</n-tab-pane>
				<n-tab-pane name="paste" tab="粘贴文本">
					<n-input
						v-model:value="pasteText"
						type="textarea"
						rows="8"
						placeholder="粘贴 JSON 文本..." />
					<n-button
						style="margin-top: 8px"
						type="primary"
						@click="onPasteImport"
						>导入</n-button
					>
					<p v-if="importError" class="error">{{ importError }}</p>
				</n-tab-pane>
			</n-tabs>
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
			:steps="menuSteps"
			@close="onTutorialClose" />
	</div>
</template>
<script setup lang="ts">
import { ref, nextTick, computed, watch } from "vue";
import { IconSwordCross, IconRobot } from "@iconify-prerendered/vue-mdi";
import {
	NButton,
	NModal,
	NTabs,
	NTabPane,
	NUpload,
	NInput,
	NInputNumber,
	NSelect,
	NFormItem,
	NSwitch,
	NAlert,
	NDivider,
	type UploadOnChange,
} from "naive-ui";
import { start, resume } from "@/game.ts";
import { useDataStore } from "@/store/value";
import { useMatchStore } from "@/store/matchStore";
import type { MatchConfig, MatchRecord } from "@/data/match";
import { DEFAULT_MATCH_CONFIG } from "@/data/match";
import MatchHistoryModal from "./MatchHistoryModal.vue";
import GameOverModal from "./GameOverModal.vue";
import TutorialGuide from "./TutorialGuide.vue";
import { MENU_STEPS } from "@/data/tutorial";

const emit = defineEmits<{ start: [] }>();
const showImport = ref(false);
const showConfig = ref(false);
const configTab = ref("game");
const showMatchHistory = ref(false);
const showImportResult = ref(false);
const importedRecord = ref<MatchRecord | null>(null);
const pasteText = ref("");
const importError = ref("");

const showTutorial = ref(false);
const menuSteps = MENU_STEPS;

const TUTORIAL_DONE_KEY = "demon-tutorial-done";

function onTutorialClose() {
	showTutorial.value = false;
	localStorage.setItem(TUTORIAL_DONE_KEY, "1");
}

if (!localStorage.getItem(TUTORIAL_DONE_KEY)) {
	showTutorial.value = true;
}

const dataStore = useDataStore();
const matchStore = useMatchStore();

const hasSave = ref(false);

// 检查是否有存档
function checkSave() {
	hasSave.value = dataStore.hasSaveGame();
}

checkSave();

// ── 游戏配置 ──

const localConfig = ref<MatchConfig>({ ...DEFAULT_MATCH_CONFIG });

// 从 matchStore 恢复上次配置
watch(
	() => showConfig.value,
	(val) => {
		if (val) {
			localConfig.value = { ...matchStore.matchConfig };
		}
	},
);

const totalPlayers = computed(
	() =>
		localConfig.value.villager +
		localConfig.value.outsider +
		localConfig.value.minion +
		localConfig.value.demon,
);

function onConfigApply() {
	const config: MatchConfig = { ...localConfig.value };
	matchStore.setMatchConfig(config);
	showConfig.value = false;
}

// ── AI 配置 ──

const aiEnabled = ref(dataStore.aiConfigured);
const aiService = ref<"deepseek" | "siliconflow">(dataStore.aiConfig.service);
const aiApiKey = ref(dataStore.aiConfig.apiKey);
const aiModel = ref(dataStore.aiConfig.model);
const aiServiceOptions: { label: string; value: "deepseek" | "siliconflow" }[] =
	[
		{ label: "DeepSeek", value: "deepseek" },
		{ label: "SiliconFlow", value: "siliconflow" },
	];

const hasAiConfig = computed(
	() => !!aiApiKey.value.trim() && !!aiModel.value.trim(),
);

function onSaveAiConfig() {
	if (aiEnabled.value && !hasAiConfig.value) return;
	if (!aiEnabled.value) {
		dataStore.aiConfigured = false;
	} else {
		dataStore.setAiConfig(
			aiService.value,
			aiApiKey.value.trim(),
			aiModel.value.trim() || "deepseek-chat",
		);
	}
	showConfig.value = false;
}

// ── 继续游戏 ──

async function onContinue() {
	const ok = dataStore.loadGame();
	if (!ok) {
		hasSave.value = false;
		return;
	}
	emit("start");
	await nextTick();
	resume();
}

// ── 开始游戏 ──

async function onStart() {
	dataStore.deleteSaveGame();
	hasSave.value = false;
	emit("start");
	await nextTick();
	start(matchStore.matchConfig);
}
// ── 导入复盘（文件/粘贴） ──

function processImport(record: MatchRecord) {
	importedRecord.value = record;
	showImport.value = false;
	showImportResult.value = true;
}
async function onFileUpload(data: Parameters<UploadOnChange>[0]) {
	importError.value = "";
	try {
		const file = data.file.file;
		if (!file) throw new Error("no file");
		processImport(JSON.parse(await file.text()));
	} catch {
		importError.value = "解析失败，请检查文件格式。";
	}
}
function onPasteImport() {
	importError.value = "";
	try {
		processImport(JSON.parse(pasteText.value));
	} catch {
		importError.value = "解析失败，请检查 JSON 格式。";
	}
}
</script>
<style scoped>
.start-page {
	height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	color: #eee;
}
.title {
	font-size: 48px;
	margin: 0;
	background: linear-gradient(135deg, #4fc3f7, #f74f4f);
	background-clip: text;
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
}
.subtitle {
	color: #888;
	margin: 0 0 24px 0;
}
.actions {
	width: 260px;
}
.secondary-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 260px;
}
.error {
	color: #f74f4f;
	margin-top: 8px;
}
.ai-form {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* 游戏配置 */
.config-body {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.count-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
}
.count-item {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.count-label {
	font-size: 13px;
	color: #aaa;
}
.total-hint {
	font-size: 13px;
	color: #888;
	margin: 0;
	text-align: center;
}
.extra-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
}
.config-footer {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
}
.tutorial-btn {
	position: fixed;
	bottom: 20px;
	right: 20px;
	z-index: 100;
	font-weight: bold;
	font-size: 16px;
}
</style>
