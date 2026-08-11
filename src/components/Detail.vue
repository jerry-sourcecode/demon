<template>
	<n-modal v-model:show="showModal">
		<div>
			<n-card class="responsive-dialog-small" :title="roleInfo.display">
				<RoleInfo
					:role-info="roleInfo"
					:faction-keyword="
						placeholderRoleInfo ? 'evil' : undefined
					" />
				<template v-if="disguiseRoleInfo">
					<n-divider title-placement="left">伪装</n-divider>
					<n-card
						:bordered="true"
						:title="`（伪装）${disguiseRoleInfo.display}`">
						<RoleInfo :role-info="disguiseRoleInfo" />
					</n-card>
				</template>
			</n-card>
		</div>
	</n-modal>
</template>

<script setup lang="ts">
import { RoleMap, Faction, type IRole, type RoleType } from "@/data/model";
import { NModal, NCard, NDivider } from "naive-ui";
import { computed } from "vue";
import RoleInfo from "./RoleInfo.vue";

const showModal = defineModel({ type: Boolean });
const props = defineProps<{
	role: RoleType;
	disguiseRole?: RoleType;
	/** 死亡后按阵营判断只显示「邪恶玩家」时的占位标记 */
	placeholderEvil?: boolean;
}>();

/** 死亡后的阵营占位卡片（不展示具体品种，统一显示「邪恶玩家」） */
const placeholderRoleInfo = computed<IRole | null>(() => {
	if (props.placeholderEvil) {
		return {
			display: "邪恶玩家",
			// 阵营行会通过 factionKeyword 覆盖为 ::evil::
			faction: Faction.minion,
			ability: "该玩家是邪恶玩家。其具体身份不会在死亡后展示。",
		};
	}
	return null;
});

const roleInfo = computed(
	() => placeholderRoleInfo.value ?? RoleMap[props.role],
);
const disguiseRoleInfo = computed(() =>
	props.disguiseRole ? RoleMap[props.disguiseRole] : null,
);
</script>

<style scoped>
.txt {
	font-size: large;
	color: black;
}

:deep(.n-card-content) {
	overflow-y: auto;
	min-height: 0;
}
</style>
