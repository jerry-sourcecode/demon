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
				@click="showEncyclopedia = true"
				style="width: 100%"
				>百科</n-button
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
						<!-- 人数配置预设模板 -->
						<div class="preset-row">
							<n-button
								v-for="p in CONFIG_PRESETS"
								:key="p.label"
								size="small"
								class="preset-btn"
								@click="applyPreset(p)">
								{{ p.label }}
							</n-button>
						</div>
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
						<div style="margin-top: 8px">
							<n-button
								size="small"
								:disabled="!hasAiConfig || aiTesting"
								@click="onTestAi">
								{{ aiTesting ? "测试中…" : "测试 AI" }}
							</n-button>
						</div>
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

		<!-- AI 测试结果弹窗 -->
		<n-modal
			v-model:show="showAiTestModal"
			preset="card"
			title="AI 测试结果"
			style="max-width: 520px; width: 80vw"
			:mask-closable="false">
			<n-spin :show="aiTesting" style="min-height: 120px">
				<div v-if="aiTestError" class="ai-test-error">
					{{ aiTestError }}
				</div>
				<template v-else>
					<p class="ai-test-score">
						得分：{{ aiTestScore }} / 100
						<span
							v-if="aiTestDuration !== null"
							class="ai-test-duration">
							（耗时 {{ aiTestDuration }} ms）
						</span>
					</p>
					<div
						v-for="item in aiTestItems"
						:key="item.label"
						class="ai-test-item">
						<span class="ai-test-label">{{ item.label }}</span>
						<span :class="item.ok ? 'ok' : 'bad'">
							{{ item.ok ? item.points : 0 }} / {{ item.points }}
						</span>
					</div>
				</template>
			</n-spin>
			<template #footer>
				<n-button type="primary" @click="showAiTestModal = false">
					关闭
				</n-button>
			</template>
		</n-modal>

		<!-- 对决记录弹窗 -->
		<MatchHistoryModal v-model:show="showMatchHistory" />

		<!-- 角色百科弹窗 -->
		<RoleEncyclopedia v-model:show="showEncyclopedia" />

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
	NSpin,
	useMessage,
	type UploadOnChange,
} from "naive-ui";
import { start, resume } from "@/game.ts";
import { callAiForTest } from "@/utils/ai";
import { useDataStore } from "@/store/value";
import { useMatchStore } from "@/store/matchStore";
import type { MatchConfig, MatchRecord } from "@/data/match";
import { DEFAULT_MATCH_CONFIG } from "@/data/match";
import MatchHistoryModal from "./MatchHistoryModal.vue";
import GameOverModal from "./GameOverModal.vue";
import TutorialGuide from "./TutorialGuide.vue";
import RoleEncyclopedia from "./RoleEncyclopedia.vue";
import { MENU_STEPS } from "@/data/tutorial";

const emit = defineEmits<{ start: [] }>();
const showImport = ref(false);
const showConfig = ref(false);
const configTab = ref("game");
const showEncyclopedia = ref(false);
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

// ── 人数配置预设模板（a镇民 b外来 c爪牙 d恶魔，+a/b 为行动力/声望） ──
interface ConfigPreset {
	label: string;
	config: MatchConfig;
}
const CONFIG_PRESETS: ConfigPreset[] = [
	{
		label: "新手 6人",
		config: {
			villager: 5,
			outsider: 0,
			minion: 0,
			demon: 1,
			actionPoints: 6,
			reputation: 9,
		},
	},
	{
		label: "简单 7人",
		config: {
			villager: 5,
			outsider: 0,
			minion: 1,
			demon: 1,
			actionPoints: 7,
			reputation: 11,
		},
	},
	{
		label: "标准 8人",
		config: {
			villager: 5,
			outsider: 1,
			minion: 1,
			demon: 1,
			actionPoints: 8,
			reputation: 13,
		},
	},
	{
		label: "推荐 10人",
		config: {
			villager: 6,
			outsider: 1,
			minion: 2,
			demon: 1,
			actionPoints: 10,
			reputation: 15,
		},
	},
	{
		label: "专家 12人",
		config: {
			villager: 7,
			outsider: 2,
			minion: 2,
			demon: 1,
			actionPoints: 12,
			reputation: 17,
		},
	},
	{
		label: "终局 14人",
		config: {
			villager: 8,
			outsider: 3,
			minion: 2,
			demon: 1,
			actionPoints: 13,
			reputation: 19,
		},
	},
];

function applyPreset(preset: ConfigPreset) {
	localConfig.value = { ...preset.config };
}

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

// ── AI 测试 ──

const message = useMessage();

const showAiTestModal = ref(false);
const aiTesting = ref(false);
const aiTestScore = ref<number | null>(null);
const aiTestError = ref("");
const aiTestDuration = ref<number | null>(null);
const aiTestItems = ref<
	{
		label: string;
		points: number;
		ok: boolean;
	}[]
>([]);

const AI_TEST_QUESTION = `请只输出一个 JSON 对象，不要包含任何额外文字、注释、代码块标记或解释。JSON 必须包含以下四个键值：

1. "math": 计算 (17 * 23) + (56 / 7) - 13 的整数结果。
2. "palindrome": 忽略大小写和非字母字符后，判断字符串 "A man, a plan, a canal: Panama" 是否为回文。如果是返回 true，否则返回 false。
3. "truth_teller": 甲乙丙三人中，甲说："乙在说谎。"乙说："丙在说谎。"丙说："甲和乙都在说谎。"已知只有一个人说真话，请返回说真话的人的名字，填 "甲"、"乙" 或 "丙"。
4. "letter": 英文单词 "intelligence" 按从 1 开始计数的第 4 个字母，返回该字母的小写形式。

输出格式：
{
  "math": <number>,
  "palindrome": <boolean>,
  "truth_teller": <string>,
  "letter": <string>
}`;

/** 从 AI 返回文本中提取 JSON 对象（容忍 markdown 代码块与多余前后文字） */
function parseJsonAnswer(text: string): Record<string, unknown> | null {
	let s = text.trim();
	s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) return null;
	try {
		return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function onTestAi() {
	aiTesting.value = true;
	showAiTestModal.value = true;
	aiTestError.value = "";
	aiTestScore.value = null;
	aiTestDuration.value = null;
	aiTestItems.value = [];
	const startTime = performance.now();
	try {
		const { content, error } = await callAiForTest(
			aiService.value,
			aiApiKey.value.trim(),
			aiModel.value.trim() || "deepseek-chat",
			AI_TEST_QUESTION,
		);
		if (error !== null || content === null) {
			aiTestError.value = `无法连通 API（${error ?? "无返回内容"}）。请检查 API Key 和模型名称是否正确。`;
			message.error("无法连通 API，请检查密钥和模型名称。");
			return;
		}
		const parsed = parseJsonAnswer(content);
		if (!parsed) {
			aiTestError.value = "AI 返回的内容无法解析为 JSON，建议更换模型。";
			message.error("AI 返回的内容无法解析，建议更换模型。");
			return;
		}
		const items = [
			{
				label: "数学计算",
				points: 30,
				ok: parsed.math === 386,
			},
			{
				label: "回文判断",
				points: 20,
				ok: parsed.palindrome === true,
			},
			{
				label: "逻辑推理",
				points: 30,
				ok: parsed.truth_teller === "乙",
			},
			{
				label: "字符索引",
				points: 20,
				ok: parsed.letter === "e",
			},
		];
		const score = items.reduce((s, it) => s + (it.ok ? it.points : 0), 0);
		aiTestItems.value = items;
		aiTestScore.value = score;

		if (score >= 80) {
			message.success(`AI 测试通过，得分 ${score} 分，可以使用该模型。`);
		} else if (score >= 60) {
			message.warning(`AI 得分 ${score} 分，请谨慎使用该模型。`);
		} else {
			message.error(`AI 得分 ${score} 分，建议更换模型。`);
		}
	} finally {
		aiTestDuration.value = Math.round(performance.now() - startTime);
		aiTesting.value = false;
	}
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

/* AI 测试结果 */
.ai-test-error {
	color: #e88080;
	font-size: 13px;
}
.ai-test-score {
	font-size: 16px;
	font-weight: 600;
	margin: 0 0 12px;
}
.ai-test-duration {
	font-size: 12px;
	font-weight: 400;
	color: #aaa;
}
.ai-test-item {
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding: 6px 0;
	border-bottom: 1px solid rgba(128, 128, 128, 0.15);
	font-size: 13px;
}
.ai-test-label {
	flex: 0 0 auto;
	color: #aaa;
}
.ai-test-item .ok {
	color: #6fca8e;
}
.ai-test-item .bad {
	color: #e88080;
}

/* 游戏配置 */
.config-body {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.preset-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.preset-btn {
	flex: 1 1 auto;
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
