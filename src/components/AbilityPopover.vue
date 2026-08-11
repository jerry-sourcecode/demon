<template>
	<n-card
		:segmented="{ content: 'soft' }"
		size="small"
		:title="titlePrefix + roleDisplay + titleSuffix">
		<ability-md :markdown="`::${faction}::。`" />
		<ability-md :markdown="props.markdown" />
	</n-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NCard } from "naive-ui";
import AbilityMd from "./AbilityMd.vue";
import { RoleMap, type RoleType } from "@/data/model.ts";

const props = defineProps<{
	markdown: string;
	roleKey: RoleType;
	titlePrefix?: string;
	titleSuffix?: string;
	/** 覆盖标题显示（如死亡的邪恶玩家显示「邪恶玩家」） */
	roleDisplayOverride?: string;
	/** 覆盖阵营关键词（如 ::evil::） */
	factionKeyword?: string;
}>();

const titlePrefix = computed(() => props.titlePrefix ?? "");
const titleSuffix = computed(() => props.titleSuffix ?? "");

const roleDisplay = computed(
	() => props.roleDisplayOverride ?? RoleMap[props.roleKey].display,
);
const faction = computed(
	() => props.factionKeyword ?? RoleMap[props.roleKey].faction,
);
</script>
