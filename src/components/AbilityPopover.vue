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
}>();

const titlePrefix = computed(() => props.titlePrefix ?? "");
const titleSuffix = computed(() => props.titleSuffix ?? "");

const roleDisplay = computed(() => RoleMap[props.roleKey].display);
const faction = computed(() => RoleMap[props.roleKey].faction);
</script>
