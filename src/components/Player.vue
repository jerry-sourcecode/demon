<template>
	<n-popover
		placement="right"
		:width="360"
		:delay="300"
		:duration="200"
		trigger="hover">
		<template #trigger>
			<n-card
				:segmented="{ content: 'soft' }"
				:style="cardStyle"
				@contextmenu.prevent="showDetail"
				class="outer"
				hoverable
				size="small">
				<template #header>
					<span :style="`color: ${calColor}`">{{ calRoleName }}</span>
				</template>
				<template #header-extra>
					<strong>#{{ props.data.id }}</strong>
				</template>
				<div class="info-box" v-if="props.data.info.length !== 0">
					<div v-for="value in props.data.info" :key="value">
						<AbilityMd :markdown="value" />
					</div>
				</div>
				<template
					#action
					v-if="
						!props.selecting &&
						(showExecuteBtn || showRecallBtn || showSkillBtn)
					">
					<NButton
						v-show="showRecallBtn"
						size="tiny"
						type="warning"
						class="actBtn"
						@click="onRecall">
						回忆
					</NButton>
					<NButton
						v-show="showSkillBtn"
						size="tiny"
						type="primary"
						class="actBtn"
						@click="onSkill">
						发动技能
					</NButton>
					<NButton
						v-show="showExecuteBtn"
						size="tiny"
						type="error"
						class="actBtn"
						@click="onExecute">
						处决
					</NButton>
				</template>
			</n-card>
		</template>
		<div>
			<template v-if="isDead && hasDisguiseTag">
				<AbilityPopover
					:markdown="realRoleInfo!.ability"
					v-if="realRoleInfo"
					:role-key="props.data.role" />
				<n-divider />
				<AbilityPopover
					:markdown="calRole!.ability"
					v-if="calRole"
					:role-key="props.data.displayRole!"
					title-prefix="（伪装）" />
			</template>
			<AbilityPopover
				v-else-if="calRole"
				:markdown="calRole!.ability"
				:role-key="props.data.displayRole!" />
		</div>
	</n-popover>
	<Detail
		:role="
			isDead && hasDisguiseTag ? props.data.role : props.data.displayRole!
		"
		:disguise-role="
			isDead && hasDisguiseTag ? props.data.displayRole! : undefined
		"
		v-model="showDetailModal" />
</template>

<script setup lang="ts">
import { Character, RoleMap } from "@/data/model";
import { computed, ref } from "vue";
import { NCard, NPopover, NButton, NDivider, useDialog } from "naive-ui";
import AbilityPopover from "./AbilityPopover.vue";
import Detail from "./Detail.vue";
import { FACTION_COLORS } from "@/data/keywords.ts";
import { useDataStore, ACTION_COST } from "@/store/value";
import { Time } from "@/utils/time";
import { runFn } from "@/utils/utils.ts";
import AbilityMd from "./AbilityMd.vue";
import { TagType } from "@/data/tag.ts";
import { logRecall, logExecute } from "@/data/gameLog";

const dataStore = useDataStore();
const dialog = useDialog();
const showDetailModal = ref(false);

const props = defineProps<{
	data: Character;
	selecting?: boolean;
	glow?: "selectable" | "selected" | null;
}>();

const emit = defineEmits<{
	"action-done": [];
}>();

const calRole = computed(() => {
	if (props.data.displayRole === null) return null;
	return RoleMap[props.data.displayRole];
});

const calRoleName = computed(() => {
	if (props.data.displayRole === null) return "未知";
	const displayName = RoleMap[props.data.displayRole].display;
	// 死亡 + 伪装 → 显示「真实身份（伪装身份）」
	if (isDead.value && props.data.hasTag(TagType.disguise)) {
		return `${RoleMap[props.data.role].display}（${displayName}）`;
	}
	return displayName;
});

const calColor = computed(() => {
	const role = calRole.value;
	if (role === null) return "gray";
	return FACTION_COLORS[role.faction];
});

const isDead = computed(() => props.data.hasTag(TagType.dead));

const hasDisguiseTag = computed(() => props.data.hasTag(TagType.disguise));

const realRoleInfo = computed(() => RoleMap[props.data.role]);

const cardStyle = computed(() => {
	const parts: string[] = [];
	if (isDead.value) parts.push("grayscale(100%)", "opacity(0.6)");
	if (props.glow === "selectable")
		parts.push("brightness(1.15)", "drop-shadow(0 0 10px #4fc3f7)");
	else if (props.glow === "selected")
		parts.push("brightness(1.3)", "drop-shadow(0 0 14px #f7c94f)");
	return parts.length ? { filter: parts.join(" ") } : {};
});

const showRecallBtn = computed(
	() =>
		!props.data.hasTag(TagType.recall) &&
		!props.data.hasTag(TagType.dead) &&
		Time.getPhase(dataStore.time) === Time.Phase.Day &&
		dataStore.canAfford(ACTION_COST.recall),
);

const showSkillBtn = computed(() => {
	const role = RoleMap[props.data.displayRole];
	if (dataStore.gameOver) return false;
	if (props.data.hasTag(TagType.dead)) return false;
	// 只在白天检查行动点，黎明/黄昏不消耗行动点
	const isDay = Time.getPhase(dataStore.time) === Time.Phase.Day;
	if (isDay && !dataStore.canAfford(ACTION_COST.skill)) return false;
	return runFn(role?.canActivateSkill, props.data, dataStore.time) ?? false;
});

const showExecuteBtn = computed(
	() =>
		Time.getPhase(dataStore.time) === Time.Phase.Day &&
		dataStore.canAfford(ACTION_COST.execute),
);

function onRecall() {
	if (!dataStore.spendActionPoints(ACTION_COST.recall)) return;
	const c = props.data;
	const infoBefore = [...c.info];
	c.addTag(TagType.recall, { till: Time.FAR_FUTURE });
	const newInfo = c.info.filter((v) => !infoBefore.includes(v));
	logRecall(c.id, c.id, newInfo.join("；"));
	emit("action-done");
}

async function onSkill() {
	// 白天消耗行动点，黎明/黄昏不消耗
	const isDay = Time.getPhase(dataStore.time) === Time.Phase.Day;
	if (isDay && !dataStore.spendActionPoints(ACTION_COST.skill)) return;
	await RoleMap[props.data.displayRole]?.onActiveSkill?.(props.data);
	emit("action-done");
}

function onExecute() {
	dialog.warning({
		title: "确认处决",
		content: `确定要处决 #${props.data.id}（${calRoleName.value}）吗？`,
		positiveText: "确定",
		negativeText: "取消",
		onPositiveClick: () => {
			if (!dataStore.spendActionPoints(ACTION_COST.execute)) return;
			logExecute(0, props.data.id);
			props.data.addTag(TagType.executed);
			emit("action-done");
		},
	});
}

function showDetail() {
	showDetailModal.value = true;
}
</script>

<style scoped>
.outer {
	width: 220px;
}
.actBtn {
	margin-right: 5px;
}
.info-box {
	max-height: 120px;
	overflow-y: auto;
}
</style>
