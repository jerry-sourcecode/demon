<template>
	<div class="draw-container">
		<!-- 全屏画布 -->
		<div
			v-if="drawMode"
			class="draw-overlay"
			@mousedown="onDrawStart"
			@mousemove="onDrawMove"
			@mouseup="onDrawEnd"
			@mouseleave="onDrawEnd"
			@touchstart.prevent="onTouchStart"
			@touchmove.prevent="onTouchMove"
			@touchend="onDrawEnd"
			@touchcancel="onDrawEnd">
			<canvas ref="canvasRef" class="draw-canvas" />
		</div>

		<!-- 浮动工具栏 -->
		<div class="draw-float-bar">
			<n-button
				size="tiny"
				circle
				:type="drawMode ? 'primary' : 'default'"
				@click="toggleDraw"
				title="绘图标注"
				>✏️</n-button
			>
			<template v-if="drawMode">
				<n-button size="tiny" @click="undoDraw">↩</n-button>
				<n-button size="tiny" @click="clearDraw">🗑</n-button>
				<div class="draw-color-wrap">
					<n-color-picker
						v-model:value="drawColor"
						size="small"
						:swatches="[
							'#ffffff',
							'#f74f4f',
							'#4fc3f7',
							'#f7c94f',
							'#4fe67a',
							'#f7814f',
						]" />
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";
import { NButton, NColorPicker } from "naive-ui";

const drawMode = ref(false);
const drawColor = ref("#f7c94f");
const canvasRef = ref<HTMLCanvasElement | null>(null);

let ctx: CanvasRenderingContext2D | null = null;
let drawing = false;
let drawHistory: ImageData[] = [];

function toggleDraw() {
	drawMode.value = !drawMode.value;
	if (drawMode.value) nextTick(initCanvas);
}

function initCanvas() {
	const c = canvasRef.value;
	if (!c) return;
	c.width = window.innerWidth;
	c.height = window.innerHeight;
	ctx = c.getContext("2d");
	if (ctx) {
		ctx.strokeStyle = drawColor.value;
		ctx.lineWidth = 3;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
	}
	saveDrawState();
}

function saveDrawState() {
	if (!ctx) return;
	drawHistory.push(
		ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height),
	);
	if (drawHistory.length > 30) drawHistory.shift();
}

function onDrawStart(e: MouseEvent) {
	if (!ctx) return;
	drawing = true;
	ctx.beginPath();
	ctx.moveTo(e.clientX, e.clientY);
}

function onDrawMove(e: MouseEvent) {
	if (!drawing || !ctx) return;
	ctx.strokeStyle = drawColor.value;
	ctx.lineTo(e.clientX, e.clientY);
	ctx.stroke();
}

function onDrawEnd() {
	if (!drawing || !ctx) return;
	drawing = false;
	ctx.closePath();
	saveDrawState();
}

function onTouchStart(e: TouchEvent) {
	if (!ctx || !e.touches[0]) return;
	drawing = true;
	ctx.beginPath();
	ctx.moveTo(e.touches[0].clientX, e.touches[0].clientY);
}

function onTouchMove(e: TouchEvent) {
	if (!drawing || !ctx || !e.touches[0]) return;
	ctx.strokeStyle = drawColor.value;
	ctx.lineTo(e.touches[0].clientX, e.touches[0].clientY);
	ctx.stroke();
}

function undoDraw() {
	drawHistory.pop();
	const last = drawHistory[drawHistory.length - 1];
	if (last && ctx) ctx.putImageData(last, 0, 0);
	else clearDraw();
}

function clearDraw() {
	if (!ctx) return;
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	drawHistory = [];
	saveDrawState();
}

function onKeyDown(e: KeyboardEvent) {
	if (drawMode.value && (e.ctrlKey || e.metaKey) && e.key === "z") {
		e.preventDefault();
		undoDraw();
	}
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<style scoped>
.draw-container {
	position: fixed;
	top: 0;
	left: 0;
	width: 0;
	height: 0;
	z-index: 999;
}
.draw-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	z-index: 1000;
	cursor: crosshair;
}
.draw-canvas {
	width: 100%;
	height: 100%;
}
.draw-float-bar {
	position: fixed;
	bottom: 16px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 1001;
	display: flex;
	align-items: center;
	gap: 6px;
	background: rgba(30, 30, 30, 0.85);
	padding: 6px 12px;
	border-radius: 8px;
}
.draw-color-wrap {
	width: 90px;
	height: 22px;
}
.draw-color-wrap :deep(.n-color-picker) {
	width: 100%;
	height: 22px;
}
.draw-color-wrap :deep(.n-color-picker-trigger) {
	height: 22px;
	width: 28px;
}
.draw-color-wrap :deep(.n-color-picker-input) {
	height: 22px;
}
.draw-color-wrap :deep(.n-input) {
	height: 22px;
}
.draw-color-wrap :deep(.n-input__input) {
	height: 22px;
	padding: 0 4px;
	font-size: 11px;
}
</style>
