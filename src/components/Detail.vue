<template>
	<n-modal v-model:show="showModal">
		<div>
			<n-card class="responsive-dialog-small" :title="roleInfo.display">
				<RoleInfo :role-info="roleInfo" />
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
import { RoleMap, type RoleType } from "@/data/model";
import { NModal, NCard, NDivider } from "naive-ui";
import { computed } from "vue";
import RoleInfo from "./RoleInfo.vue";

const showModal = defineModel({ type: Boolean });
const props = defineProps<{ role: RoleType; disguiseRole?: RoleType }>();

const roleInfo = computed(() => RoleMap[props.role]);
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
