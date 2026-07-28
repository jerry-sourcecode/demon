<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		:mask-closable="false"
		style="max-width: 60vw; width: auto"
		title="可能存在的身份">
		<div class="sheet-body">
			<n-divider title-placement="left">{{ villagerLabel }}</n-divider>
			<div class="role-row">
				<AbilityMd
					v-for="i in villagerSlotCount"
					:key="'v' + i"
					:markdown="villagerSlotMd(i)" />
			</div>

			<n-divider title-placement="left">{{ outsiderLabel }}</n-divider>
			<div class="role-row">
				<AbilityMd
					v-for="i in outsiderSlotCount"
					:key="'o' + i"
					:markdown="outsiderSlotMd(i)" />
			</div>

			<n-divider title-placement="left">邪恶</n-divider>
			<div class="role-row">
				<AbilityMd
					v-for="r in dataStore.possibleEvil"
					:key="r"
					:markdown="`::${r}::`" />
			</div>
		</div>
		<template #footer>
			<div class="menu-footer">
				<n-button type="error" block @click="confirmGoHome"
					>回到主页</n-button
				>
				<n-button type="primary" ghost block @click="closeMenu"
					>确定</n-button
				>
			</div>
		</template>
	</n-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NModal, NDivider, NButton, useDialog } from "naive-ui";
import { useDataStore } from "@/store/value";
import { RoleMap, Faction } from "@/data/model";
import AbilityMd from "./AbilityMd.vue";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
	"update:show": [boolean];
	goHome: [];
}>();

const showModal = computed({
	get: () => props.show,
	set: (v) => emit("update:show", v),
});

const dataStore = useDataStore();
const dialog = useDialog();

const knownVillagers = computed(() =>
	[...dataStore.knownGoodRoles].filter(
		(r) => RoleMap[r]?.faction === Faction.villager,
	),
);

const knownOutsiders = computed(() =>
	[...dataStore.knownGoodRoles].filter(
		(r) => RoleMap[r]?.faction === Faction.outsider,
	),
);

const villagerSlotCount = computed(() =>
	Math.max(dataStore.villagerMax, knownVillagers.value.length),
);

const outsiderSlotCount = computed(() =>
	Math.max(dataStore.outsiderMax, knownOutsiders.value.length),
);

const villagerLabel = computed(() => {
	const range =
		dataStore.villagerMin === dataStore.villagerMax
			? `${dataStore.villagerMin}`
			: `${dataStore.villagerMin}~${dataStore.villagerMax}`;
	const known = knownVillagers.value.length;
	if (known > dataStore.villagerMax) return `镇民（${range}，已知 ${known}）`;
	return `镇民（${range}）`;
});

const outsiderLabel = computed(() => {
	const range =
		dataStore.outsiderMin === dataStore.outsiderMax
			? `${dataStore.outsiderMin}`
			: `${dataStore.outsiderMin}~${dataStore.outsiderMax}`;
	const known = knownOutsiders.value.length;
	if (known > dataStore.outsiderMax)
		return `外来者（${range}，已知 ${known}）`;
	return `外来者（${range}）`;
});

function villagerSlotMd(i: number): string {
	if (i <= knownVillagers.value.length)
		return `::${knownVillagers.value[i - 1]!}::`;
	return "";
}

function outsiderSlotMd(i: number): string {
	if (i <= knownOutsiders.value.length)
		return `::${knownOutsiders.value[i - 1]!}::`;
	return "";
}

function closeMenu() {
	showModal.value = false;
}

function confirmGoHome() {
	// 先存档
	dataStore.saveGame();
	dialog.warning({
		title: "确认",
		content: "进度已保存，确定回到主页吗？",
		positiveText: "确定",
		negativeText: "取消",
		onPositiveClick: () => {
			showModal.value = false;
			emit("goHome");
		},
	});
}
</script>

<style scoped>
.sheet-body {
	min-width: 40vw;
}

.role-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.menu-footer {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
