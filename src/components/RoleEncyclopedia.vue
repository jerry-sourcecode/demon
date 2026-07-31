<template>
	<n-modal
		v-model:show="showModal"
		preset="card"
		title="百科"
		style="max-width: 720px; width: 90vw; max-height: 82vh"
		:mask-closable="false">
		<n-tabs type="segment" animated v-model:value="activeTab">
			<!-- Tab 1: 角色 -->
			<n-tab-pane name="roles" tab="角色">
				<div class="encyclopedia-body">
					<div
						v-for="group in rolesByFaction"
						:key="group.faction"
						class="faction-group">
						<div
							class="faction-header"
							:style="{ color: FACTION_COLORS[group.faction] }">
							{{ factionLabel(group.faction) }}
							<span class="faction-count"
								>（{{ group.roles.length }}）</span
							>
						</div>
						<div class="role-grid">
							<n-popover
								v-for="r in group.roles"
								:key="r"
								trigger="hover"
								placement="right"
								:width="360"
								:delay="300"
								:duration="200">
								<template #trigger>
									<div
										class="role-item"
										@click="onSelectRole(r)">
										<span
											class="role-name"
											:style="{
												color: FACTION_COLORS[
													RoleMap[r].faction
												],
											}">
											{{ RoleMap[r].display }}
										</span>
										<n-tag
											v-if="RoleMap[r].requiresAI"
											size="tiny"
											type="warning"
											:bordered="false"
											class="ai-tag">
											AI
										</n-tag>
									</div>
								</template>
								<AbilityPopover
									:markdown="RoleMap[r].ability"
									:role-key="r" />
							</n-popover>
						</div>
					</div>
				</div>
			</n-tab-pane>

			<!-- Tab 2: 游戏规则 -->
			<n-tab-pane name="rules" tab="游戏规则">
				<div class="rules-body">
					<AbilityMd :markdown="RULES_MARKDOWN" />
				</div>
			</n-tab-pane>
		</n-tabs>

		<!-- 角色详情弹窗（复用 Detail） -->
		<Detail v-if="selectedRole" v-model="showDetail" :role="selectedRole" />
	</n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NModal, NTabs, NTabPane, NPopover, NTag } from "naive-ui";
import { RoleMap, Faction, type RoleType } from "@/data/model";
import { allRoleKeys } from "@/utils/utils";
import { FACTION_COLORS, KEYWORD_DICT } from "@/data/keywords";
import { RULES_MARKDOWN } from "@/data/rules";
import AbilityMd from "./AbilityMd.vue";
import AbilityPopover from "./AbilityPopover.vue";
import Detail from "./Detail.vue";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [value: boolean] }>();

const showModal = computed({
	get: () => props.show,
	set: (val) => emit("update:show", val),
});

const activeTab = ref("roles");

const FACTION_ORDER: Faction[] = [
	Faction.villager,
	Faction.outsider,
	Faction.minion,
	Faction.demon,
];

const rolesByFaction = computed(() =>
	FACTION_ORDER.map((f) => ({
		faction: f,
		roles: allRoleKeys().filter((k) => RoleMap[k].faction === f),
	})),
);

function factionLabel(f: Faction): string {
	return KEYWORD_DICT[f]?.display ?? f;
}

const showDetail = ref(false);
const selectedRole = ref<RoleType | null>(null);

function onSelectRole(r: RoleType) {
	selectedRole.value = r;
	showDetail.value = true;
}
</script>

<style scoped>
.encyclopedia-body,
.rules-body {
	max-height: 56vh;
	overflow-y: auto;
	padding-right: 8px;
}
.faction-group {
	margin-bottom: 12px;
}
.faction-header {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 6px;
}
.faction-count {
	color: #999;
	font-weight: 400;
	font-size: 13px;
}
.role-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 6px;
}
.role-item {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 8px 4px;
	border-radius: 6px;
	border: 1px solid #e5e5e5;
	background: #fafafa;
	cursor: pointer;
	transition:
		border-color 0.2s,
		background-color 0.2s;
	user-select: none;
}
.role-item:hover {
	border-color: #4fc3f7;
	background: #f0f9ff;
}
.role-name {
	font-weight: 600;
	font-size: 14px;
}
.ai-tag {
	flex-shrink: 0;
}
</style>
