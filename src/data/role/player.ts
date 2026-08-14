/**
 * 角色模块：player.ts（玩家/说书人技能）
 *
 * 记录玩家（说书人）可主动发动的技能，如痢蛭的「选择宿主」。
 * 每个技能通过 PlayerRoleType 标识，挂在 PlayerCharacter.roles 上，
 * 由游戏面板的「玩家技能」下拉菜单展示与触发。
 */
import { Time } from "../../utils/time";
import { TagType } from "../tag";
import { useDataStore } from "../../store/value";
import { useEmitter } from "../../store/emit";
import { playerData, type RoleHooks } from "./model";
import { logSkillResolution, logReputationChange } from "../gameLog";
import type { PlayerCharacter } from "../model";

/** 玩家技能键 */
export const PlayerRoleType = {
    /** 痢蛭：选择宿主（每天一次） */
    lleechHost: "lleechHost",
} as const;
export type PlayerRoleType = typeof PlayerRoleType[keyof typeof PlayerRoleType];

/** 玩家技能定义：钩子与 IRole 重叠的部分由 RoleHooks 提供 */
export interface IPlayerRole extends RoleHooks<PlayerCharacter> {
    /** 下拉菜单显示名 */
    display: string;
}

/** 玩家技能注册表 */
export const playerRoles: Record<PlayerRoleType, IPlayerRole> = {
    [PlayerRoleType.lleechHost]: {
        display: "痢蛭：选择一名玩家，若为宿主则其死亡，否则声望 -4",
        onStart(c) {
            c.registerLimitSkill('lleechHost', 1);
        },
        canActivateSkill(c, t) {
            return Time.getPhase(t) === Time.Phase.Day && c.allowUseSkill('lleechHost');
        },
        onTimeChange(c, t) {
            // 每个白天重置一次使用次数
            if (Time.getPhase(t) === Time.Phase.Day) c.resetSkill('lleechHost');
        },
        async onActiveSkill(c) {
            const dataStore = useDataStore();
            const emitter = useEmitter();
            const lleech = [...dataStore.chars.values()].find(x => x.role === 'Lleech');

            const chosen = await emitter.emit('select-player', {
                count: 1,
                info: '::Lleech::：选择一名玩家，若为宿主则其死亡，否则声望 -4。',
            });
            if (!chosen || chosen.length < 1) return false;
            const obj = chosen[0]!;
            c.useSkill('lleechHost');

            // 痢蛭真实存在且清醒时，命中宿主 → 宿主死亡
            const canKill = !!lleech && !lleech.hasTag(TagType.dead) && lleech.isAwake('Lleech');
            const hostId = lleech ? playerData.get(lleech.id) : undefined;
            if (canKill && hostId && obj.id === hostId) {
                logSkillResolution(lleech.id, `宿主 #${hostId}（::${obj.role}::）被玩家杀死。`);
                obj.addTag('dead', { meta: { type: 'demon' } });
                return true;
            }

            // 否则：非宿主结算，声望 -4
            dataStore.reputation -= 4;
            logReputationChange(-4, `玩家选择了 #${obj.id}（非宿主），声望 -4。`);
            return true;
        },
    },
};
