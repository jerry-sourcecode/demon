<template>
	<n-input
		v-model:value="text"
		type="textarea"
		placeholder="你可以在这里记录笔记..."
		class="no-border-textarea"
		:resizable="false"
		:autosize="false" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { NInput } from "naive-ui";

const text = ref("");
</script>

<style scoped>
.no-border-textarea {
	height: 100%;
	width: 100%;
	resize: none;
	padding: 10px;
}

/* 2. 核心样式：覆盖 n-input 的内部文本域 */
.no-border-textarea :deep(.n-input__border) {
	border: none !important;
}
.no-border-textarea :deep(.n-input__state-border) {
	border: none !important;
}
</style>
