<template>
	<p v-if="roleInfo.summery" class="txt" style="margin-bottom: 10px">
		<em>{{ roleInfo.summery }}</em>
	</p>
	<ability-md
		class="txt"
		:markdown="`::${factionKeyword ?? roleInfo.faction}::。`" />
	<n-divider title-placement="left">我的能力</n-divider>
	<ability-md
		class="txt"
		:markdown="roleInfo.ability"
		:role-name="roleInfo.display" />
	<template v-if="roleInfo.abnormal">
		<n-divider title-placement="left">如果异常</n-divider>
		<ability-md
			class="txt"
			v-if="roleInfo.abnormal.overall"
			:markdown="roleInfo.abnormal.overall" />
		<div v-if="roleInfo.abnormal.disguise">
			<h2 style="margin-top: 20px">如果是伪装：</h2>
			<ability-md class="txt" :markdown="roleInfo.abnormal.disguise" />
		</div>
		<div v-if="roleInfo.abnormal.confused">
			<h2 style="margin-top: 20px">如果是中毒/醉酒：</h2>
			<ability-md class="txt" :markdown="roleInfo.abnormal.confused" />
		</div>
	</template>
</template>

<script setup lang="ts">
import { NDivider } from "naive-ui";
import AbilityMd from "./AbilityMd.vue";
import type { IRole } from "@/data/model";

defineProps<{
	roleInfo: IRole;
	/** 阵营关键词覆盖（默认 roleInfo.faction），如死亡后只显示 ::evil:: */
	factionKeyword?: string;
}>();
</script>

<style scoped>
.txt {
	font-size: large;
	color: black;
}
</style>
