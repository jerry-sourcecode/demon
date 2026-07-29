<template>
	<div class="tutorial-overlay">
		<!-- 目标高亮框 -->
		<div
			v-if="currentStep.target && targetRect"
			class="tutorial-spotlight"
			:style="spotlightStyle" />

		<!-- 引导卡片 -->
		<div class="tutorial-card" :class="cardPosition">
			<div class="tutorial-progress">
				<span
					v-for="(s, i) in steps"
					:key="s.id"
					class="tutorial-dot"
					:class="{ active: i === stepIndex }" />
			</div>

			<h3 class="tutorial-title">{{ currentStep.title }}</h3>
			<div class="tutorial-text" v-html="renderedText" />

			<div v-if="currentStep.action" class="tutorial-action-hint">
				<span class="icon"><IconLightbulbOn /></span>
				{{ currentStep.action }}
			</div>

			<div class="tutorial-actions">
				<n-button
					size="small"
					@click="prev"
					:disabled="stepIndex === 0">
					上一步
				</n-button>
				<n-button size="small" quaternary @click="skip">
					跳过
				</n-button>
				<n-button size="small" type="primary" @click="next">
					{{ isLast ? "完成" : "下一步" }}
				</n-button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Ref } from "vue";
import { NButton } from "naive-ui";
import { IconLightbulbOn } from "@iconify-prerendered/vue-mdi";
import type { TutorialStep } from "@/data/tutorial";

const props = defineProps<{
	steps: TutorialStep[];
}>();

const emit = defineEmits<{
	close: [];
}>();

const stepIndex = ref(0);
const targetRect = ref<DOMRect | null>(null);

const currentStep = computed(() => props.steps[stepIndex.value]!);
const isLast = computed(() => stepIndex.value >= props.steps.length - 1);

/** 简单的 Markdown 转 HTML（加粗、换行） */
const renderedText = computed(() => {
	return currentStep.value.text
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\n/g, "<br>");
});

/** 卡片位置：目标元素旁边 / 底部居中 */
const cardPosition = computed(() => {
	const p = currentStep.value.placement;
	if (p === "center") return "card--center";
	if (p === "top") return "card--bottom";
	if (p === "bottom") return "card--top";
	if (p === "left") return "card--right";
	if (p === "right") return "card--left";
	return "card--center";
});

const spotlightStyle = computed(() => {
	const r = targetRect.value;
	if (!r) return { display: "none" };
	return {
		left: `${r.left}px`,
		top: `${r.top}px`,
		width: `${r.width}px`,
		height: `${r.height}px`,
	};
});

function updateTarget() {
	const sel = currentStep.value.target;
	if (!sel) {
		targetRect.value = null;
		return;
	}
	const el = document.querySelector(sel);
	targetRect.value = el ? el.getBoundingClientRect() : null;
}

watch(stepIndex, () => {
	// 等待 DOM 更新后获取目标位置
	setTimeout(updateTarget, 50);
});

// 初始定位
setTimeout(updateTarget, 100);

// 窗口缩放时更新
window.addEventListener("resize", updateTarget);

function next() {
	if (isLast.value) {
		emit("close");
	} else {
		stepIndex.value++;
	}
}

function prev() {
	if (stepIndex.value > 0) stepIndex.value--;
}

function skip() {
	emit("close");
}
</script>

<style scoped>
.tutorial-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	z-index: 9999;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	align-items: center;
	padding-bottom: 40px;
}

/* 高亮框 */
.tutorial-spotlight {
	position: fixed;
	z-index: 10000;
	border-radius: 8px;
	box-shadow:
		0 0 0 9999px rgba(0, 0, 0, 0.55),
		0 0 0 2px #4fc3f7,
		0 0 16px rgba(79, 195, 247, 0.5);
	pointer-events: none;
	transition: all 0.3s ease;
}

/* 引导卡片 */
.tutorial-card {
	position: relative;
	z-index: 10001;
	background: #fff;
	border-radius: 12px;
	padding: 20px 24px;
	max-width: 480px;
	width: 90vw;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.card--center {
	margin-bottom: 10vh;
}

.tutorial-progress {
	display: flex;
	gap: 6px;
	margin-bottom: 12px;
}
.tutorial-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #ddd;
}
.tutorial-dot.active {
	background: #4fc3f7;
	width: 24px;
	border-radius: 4px;
}

.tutorial-title {
	margin: 0 0 8px;
	font-size: 18px;
	color: #222;
}
.tutorial-text {
	font-size: 14px;
	color: #555;
	line-height: 1.7;
}
.tutorial-text :deep(strong) {
	color: #222;
}

.tutorial-action-hint {
	margin-top: 10px;
	padding: 8px 12px;
	background: #e3f2fd;
	border-radius: 8px;
	font-size: 13px;
	color: #1565c0;
}

.tutorial-actions {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 16px;
	gap: 8px;
}
</style>
