/**
 * 角色模块：index.ts（对外公开接口）
 *
 * 汇总各阵营角色，导出 RoleMap / RoleType 及共享基础类型与辅助函数。
 */
import { Faction, type IRole } from "./model";
import { villagerRoles } from "./villager";
import { outsiderRoles } from "./outsider";
import { minionRoles } from "./minion";
import { demonRoles } from "./demon";

export * from "./model";

const roles = {
    unknown: {
        display: '失忆者',
        summery: '“等下，你说了啥？谁？哦，没事了。等下，你说了啥？”',
        faction: Faction.unknown,
        ability: `你可以通过::recall::来得知该玩家是什么角色。`
    },
    ...villagerRoles,
    ...outsiderRoles,
    ...minionRoles,
    ...demonRoles,
} satisfies Record<string, IRole>;

export type RoleType = keyof typeof roles;

export const RoleMap: Record<RoleType, IRole> = roles;
