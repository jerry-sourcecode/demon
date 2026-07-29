<template>
	<NMessageProvider>
		<NDialogProvider>
			<GameStart v-if="!started" @start="started = true" />
			<template v-else>
				<div class="main">
					<n-split :default-size="0.1">
						<template #1><Paper /></template>
						<template #2>
							<n-split
								direction="horizontal"
								:default-size="0.85">
								<template #1
									><PlayerPanel @go-home="started = false"
								/></template>
								<template #2><InfoPanel /></template>
							</n-split>
						</template>
					</n-split>
					<DrawingOverlay />
				</div>
			</template>
		</NDialogProvider>
	</NMessageProvider>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { NSplit, NDialogProvider, NMessageProvider } from "naive-ui";
import Paper from "./components/Paper.vue";
import PlayerPanel from "./components/PlayerPanel.vue";
import GameStart from "./components/GameStart.vue";
import DrawingOverlay from "./components/DrawingOverlay.vue";
import InfoPanel from "./components/InfoPanel.vue";

const started = ref(false);
</script>

<style scoped>
.main {
	height: 100vh;
	width: 100vw;
	position: relative;
}
</style>
