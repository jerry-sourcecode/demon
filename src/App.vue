<template>
	<NDialogProvider>
		<n-split class="main" :default-size="0.25">
			<template #1><Paper /></template>
			<template #2><PlayerPanel /></template>
		</n-split>
	</NDialogProvider>
</template>

<script setup lang="ts">
import { NSplit, NDialogProvider } from "naive-ui";
import Paper from "./components/Paper.vue";
import PlayerPanel from "./components/PlayerPanel.vue";
import { onMounted } from "vue";
import { start } from "@/game.ts";

onMounted(() => start());
</script>

<style scoped>
.main {
	height: 100vh;
	width: 100vw;
}
</style>
