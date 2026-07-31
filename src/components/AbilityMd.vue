<template>
	<div ref="contentRef" class="ability-content" v-html="html" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, h, createApp } from "vue";
import { NCard, NPopover } from "naive-ui";
import { renderAbilityHTML } from "@/data/keywords";

const props = defineProps<{
	markdown: string;
}>();

const contentRef = ref<HTMLElement>();
const html = computed(() => renderAbilityHTML(props.markdown));

/** 通过 createApp 挂载的微型 Vue 应用，卸载时清理 */
const kwApps: ReturnType<typeof createApp>[] = [];

function attachKeywordPopovers(root?: HTMLElement) {
	const el = root || contentRef.value;
	if (!el) return;

	el.querySelectorAll<HTMLElement>(".kw-ref").forEach((span) => {
		const key = span.dataset.kw!;
		const desc = span.dataset.kwDesc!;
		const color = span.dataset.kwColor!;
		const display = span.textContent || key;

		// 在原位置插入 wrapper，移除占位 span
		const wrapper = document.createElement("span");
		span.parentNode!.insertBefore(wrapper, span);
		span.remove();

		// 在 wrapper 上挂载 n-popover
		const app = createApp({
			setup() {
				const descRef = ref<HTMLElement>();
				// 描述中的 ::key:: 同样渲染为 .kw-ref 占位 span
				const descHTML = renderAbilityHTML(desc);

				return () =>
					h(
						NPopover,
						{
							trigger: "hover",
							delay: 200,
							width: 260,
							class: "popover",
							"onUpdate:show": (show: boolean) => {
								if (show) {
									// setTimeout：等待 Naive UI 的 Teleport 将内容挂载到 DOM
									setTimeout(() => {
										if (descRef.value) {
											attachKeywordPopovers(
												descRef.value,
											);
										}
									}, 0);
								}
							},
						},
						{
							trigger: () =>
								h(
									"span",
									{
										style: {
											color,
											cursor: "help",
											fontWeight: "600",
										},
									},
									display,
								),
							default: () =>
								h(
									NCard,
									{
										size: "small",
										segmented: { content: "soft" },
									},
									{
										header: () =>
											h(
												"h3",
												{
													style: { color },
												},
												display,
											),
										default: () =>
											h("div", {
												ref: descRef,
												innerHTML: descHTML,
											}),
									},
								),
						},
					);
			},
		});

		app.mount(wrapper);
		kwApps.push(app);
	});
}

onMounted(() => attachKeywordPopovers());
onUnmounted(() => kwApps.forEach((app) => app.unmount()));
</script>

<style lang="css" scoped>
.popover {
	z-index: 100;
}

/* markdown-it 渲染的列表在全局 `* { padding: 0 }` 重置下会丢失圆点，这里恢复 */
.ability-content :deep(ul) {
	list-style: disc;
	padding-left: 1.4em;
}

.ability-content :deep(ol) {
	list-style: decimal;
	padding-left: 1.4em;
}

.ability-content :deep(li) {
	margin: 2px 0;
}
</style>
