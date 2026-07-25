<template>
	<div class="start-page">
		<h1 class="title">血染钟楼</h1>
		<p class="subtitle">单人推理游戏</p>
		<div class="actions">
			<n-button type="primary" size="large" @click="onStart"
				>开始游戏</n-button
			>
			<n-button size="large" @click="showImport = true"
				>导入复盘</n-button
			>
		</div>
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
	</div>
</template>
<script setup lang="ts">
import { ref, nextTick } from "vue";
import {
	NButton,
	NModal,
	NTabs,
	NTabPane,
	NUpload,
	NInput,
	type UploadOnChange,
} from "naive-ui";
import { start } from "@/game.ts";
import { useDataStore } from "@/store/value";
import type { GameEvent } from "@/data/gameLog";
import { clearLog, setLog } from "@/data/gameLog";
import { Character, type RoleType, type DeadReasonType } from "@/data/model";
import { TagType } from "@/data/tag";
const emit = defineEmits<{ start: [] }>();
const showImport = ref(false);
const pasteText = ref("");
const importError = ref("");
interface ImportData {
	version: number;
	initRoles: Record<number, RoleType>;
	events: GameEvent[];
	finalState: {
		reputation: number;
		win: boolean;
		chars: Record<
			number,
			{
				role: RoleType;
				dead: boolean;
				deathType?: string;
				disguiseRole?: string;
			}
		>;
	};
}
function processImport(data: ImportData) {
	const ds = useDataStore();
	clearLog();

	// 重建角色
	ds.chars = new Map();
	for (const [idStr, role] of Object.entries(data.initRoles)) {
		const id = Number(idStr);
		const c = new Character(id, role);
		ds.chars.set(id, c);
	}

	// 应用死亡状态
	if (data.finalState.chars) {
		for (const [idStr, fc] of Object.entries(data.finalState.chars)) {
			const id = Number(idStr);
			const c = ds.chars.get(id);
			if (c && fc.dead)
				c.addTag(TagType.dead, {
					meta: { type: (fc.deathType as DeadReasonType) ?? "other" },
				});
			if (c && fc.disguiseRole)
				c.addTag(TagType.disguise, {
					meta: fc.disguiseRole as RoleType,
				});
		}
	}

	// 直接设置日志（保留原始时间戳）
	setLog(data.events);

	ds.reputation = data.finalState.reputation;
	ds.gameOver = true;
	emit("start");
	setTimeout(() => {
		import("@/store/emit").then((m) =>
			m.useEmitter().emit("game-end", data.finalState.win),
		);
	}, 100);
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
async function onStart() {
	emit("start");
	await nextTick();
	start();
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
	display: flex;
	gap: 16px;
}
.error {
	color: #f74f4f;
	margin-top: 8px;
}
</style>
