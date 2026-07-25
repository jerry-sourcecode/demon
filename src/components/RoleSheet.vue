<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		:mask-closable="false"
		style="max-width: 620px; width: auto"
		title="可能在场的身份">
		<div class="sheet-grid">
			<!-- 镇民 -->
			<div class="col">
				<h4>{{ villagerTitle }}</h4>
				<div class="role-list">
					<AbilityMd
						v-for="i in dataStore.villagerMax"
						:key="'v' + i"
						:markdown="villagerSlotMd(i)" />
				</div>
			</div>
			<!-- 外来者 -->
			<div class="col">
				<h4>{{ outsiderTitle }}</h4>
				<div class="role-list">
					<AbilityMd
						v-for="i in dataStore.outsiderMax"
						:key="'o' + i"
						:markdown="outsiderSlotMd(i)" />
				</div>
			</div>
			<!-- 邪恶 -->
			<div class="col">
				<h4>邪恶</h4>
				<div class="role-list">
					<AbilityMd
						v-for="r in dataStore.possibleEvil"
						:key="r"
						:markdown="`::${r}::`" />
				</div>
			</div>
		</div>
	</n-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NModal } from "naive-ui";
import { useDataStore } from "@/store/value";
import { RoleMap, Faction } from "@/data/model";
import AbilityMd from "./AbilityMd.vue";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [boolean] }>();

const showModal = computed({
	get: () => props.show,
	set: (v) => emit("update:show", v),
});

const dataStore = useDataStore();

const villagerTitle = computed(() =>
	dataStore.villagerMin === dataStore.villagerMax
		? `镇民（${dataStore.villagerMin}）`
		: `镇民（${dataStore.villagerMin}~${dataStore.villagerMax}）`,
);
const outsiderTitle = computed(() =>
	dataStore.outsiderMin === dataStore.outsiderMax
		? `外来者（${dataStore.outsiderMin}）`
		: `外来者（${dataStore.outsiderMin}~${dataStore.outsiderMax}）`,
);

function villagerSlotMd(i: number): string {
	const known = [...dataStore.knownGoodRoles].filter(
		(r) => RoleMap[r]?.faction === Faction.villager,
	);
	if (i <= known.length) return `::${known[i - 1]!}::`;
	return "?";
}

function outsiderSlotMd(i: number): string {
	const known = [...dataStore.knownGoodRoles].filter(
		(r) => RoleMap[r]?.faction === Faction.outsider,
	);
	if (i <= known.length) return `::${known[i - 1]!}::`;
	return "?";
}
</script>

<style scoped>
.sheet-grid {
	display: flex;
	gap: 24px;
}

.col {
	min-width: 140px;
}

.col h4 {
	margin: 0 0 8px 0;
	font-size: 14px;
	color: #aaa;
}

.role-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.role-tag {
	font-size: 14px;
	padding: 2px 6px;
	border-radius: 4px;
	background: rgba(255, 255, 255, 0.05);
}
</style>
