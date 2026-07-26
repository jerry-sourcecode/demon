<template>
	<NMessageProvider>
		<NDialogProvider>
			<GameStart v-if="!started" @start="started = true" />
			<n-split v-else class="main" :default-size="0.25">
				<template #1><Paper /></template>
				<template #2><PlayerPanel /></template>
			</n-split>
		</NDialogProvider>
	</NMessageProvider>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { NSplit, NDialogProvider, NMessageProvider } from "naive-ui";
import Paper from "./components/Paper.vue";
import PlayerPanel from "./components/PlayerPanel.vue";
import GameStart from "./components/GameStart.vue";

const started = ref(false);
</script>

<style scoped>
.main {
	height: 100vh;
	width: 100vw;
}
</style>
