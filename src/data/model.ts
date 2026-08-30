import { Time } from "../utils/time";
import { TagType, type ITag, type TagMetaMap } from "./tag";
import { TAG_RULES, beforeExecuted, afterExecuted, settleDeath } from "./tag";
import type { IRole } from "./roles";
import { RoleMap } from "./roles";
import type { RoleType } from "./roles";
import { Faction, Alignment } from "./roles";
import { useDataStore } from "../store/value";
import { allRoleKeys, randpick, runFn } from "@/utils/utils";
import type { PlayerRoleType } from "./role/player";

export type { IRole, RoleType } from "./roles";
export { RoleMap, Faction, Alignment, resetRoleStore } from "./roles";

// ── Tag meta 类型系统 ──

export type DeadReasonType = 'other' | 'night' | 'execute' | 'demon' | 'assassin' | 'moonchild' | 'slayer';

/** Tag 精确类型（discriminated union，meta 随 type 自动收窄） */
type TypedTag<T extends TagType = TagType> = {
    [K in T]: {
        type: K;
        till: Time.TimeNumber;
        source?: number | string;
        /** 生效时间：标签延迟到该时间才生效。缺省=立即生效；到点前视为未生效 */
        at?: Time.TimeNumber;
    } & ([TagMetaMap[K]] extends [undefined]
        ? { meta?: undefined }
        : { meta: TagMetaMap[K] })
}[T];

/** 角色基类：限次技能使用记录（Character 与 PlayerCharacter 共用） */
export class BaseCharacter {
    /** 限次技能使用记录（_ 前缀表示内部字段） */
    _skillUses: Map<string, { used: number; max: number }> = new Map();

    /** 注册一个限制次数的技能 */
    registerLimitSkill(key: string, max: number): void {
        this._skillUses.set(key, { used: 0, max });
    }

    /** 是否允许使用技能，未达上限返回 true，已达上限返回 false */
    allowUseSkill(key: string): boolean {
        const s = this._skillUses.get(key);
        if (!s || s.used >= s.max) return false;
        return true;
    }

    /** 尝试使用技能，成功返回 true 并计数+1，已达上限返回 false */
    useSkill(key: string): boolean {
        const s = this._skillUses.get(key);
        if (!s || s.used >= s.max) return false;
        s.used++;
        return true;
    }

    /** 查询剩余可用次数（未注册返回 0） */
    skillRemaining(key: string): number {
        const s = this._skillUses.get(key);
        return s ? s.max - s.used : 0;
    }

    /** 重置指定技能计数 */
    resetSkill(key: string): void {
        const s = this._skillUses.get(key);
        if (s) s.used = 0;
    }

    /** 重置所有技能计数 */
    resetAllSkills(): void {
        this._skillUses.forEach(s => s.used = 0);
    }
}

export class Character extends BaseCharacter {
    id: number;
    role: RoleType;
    /** 阵营，独立于角色类型 */
    alignment: Alignment;
    info: string[];
    displayRole: RoleType;
    tags: ITag[];
    /** 玩家自定义标签（预设，对应圆点） */
    customTags: string[];
    /** 玩家自定义文本标签（自由输入） */
    dynamicTags: string[];

    constructor(id: number, role: RoleType) {
        super();
        this.id = id;
        this.role = role;
        this.alignment = Alignment.good;
        this.info = [];
        this.displayRole = 'unknown';
        this.tags = [];
        this.customTags = [];
        this.dynamicTags = [];
    }

    /**
     * 判断技能是否有效。confused 始终无效；若 disguise.meta===role 也无效。
     */
    /** 是否通过 gained 获得某角色能力 */
    hasGainedRole(role: RoleType): boolean {
        return this.getTag(TagType.gained).some(t => (t.meta as RoleType[]).includes(role));
    }

    isAwake(role: RoleType): boolean {
        if (this.hasTag(TagType.confused)) return false;
        if (this.hasTag(TagType.disguise)) {
            const dis = this.getTag(TagType.disguise)[0];
            // 获得的能力不受伪装阻碍（如双面人伪装成镇民仍可使用其能力）
            if (dis && dis.meta === role && !this.hasGainedRole(role)) return false;
        }
        return true;
    }

    /** 是否已回忆（拥有 recall Tag） */
    hasRecalled(): boolean {
        return this.hasTag(TagType.recall);
    }

    /** 是否已死亡（dead 标签的死亡生效时间 at 已到）。延期死亡（at 在未来）视为存活 */
    isDead(): boolean {
        const now = useDataStore().time;
        return this.getTag(TagType.dead).some(t => (t.at ?? 0) <= now);
    }

    /** 是否真正死亡：isDead() 且非活死人（僵怖活死人被判为存活） */
    isTrulyDead(): boolean {
        return this.isDead() && !this.hasTag(TagType.alive);
    }

    /** 结算「at 恰好等于当前时间」的延期死亡（相位推进时结算一次，天然保证只死一次） */
    settlePendingDeaths(): void {
        const now = useDataStore().time;
        for (const t of this.getTag(TagType.dead)) {
            if ((t.at ?? 0) === now) settleDeath(this, t);
        }
    }

    /**
     * 处决这名玩家：
     * 1. 全局 beforeExecuted（保护判定）
     * 2. 角色 beforeExecuted（原 onExecuted）
     * 3. 附上 dead 标签（处决死因）
     * 4. 角色 afterExecuted
     * 5. 全局 afterExecuted
     */
    execute(): void {
        if (beforeExecuted(this) === false) return;
        if (runFn(RoleMap[this.role]?.beforeExecuted, this) === false) return;
        this.addTag(TagType.dead, { meta: { type: 'execute' } });
        runFn(RoleMap[this.role]?.afterExecuted, this);
        afterExecuted(this);
    }

    getRoleDetail() {
        return RoleMap[this.role];
    }

    /** 判断是否为邪恶阵营（含清醒的陌客、蛊惑者的迷惑标记） */
    isEvil(): boolean {
        return this.alignment === Alignment.evil
            || this.hasTag(TagType.tempted)
            || (this.role === 'Recluse' && this.isAwake('Recluse'));
    }

    /** 真正的邪恶（仅按 alignment 判断） */
    isTrulyEvil(): boolean {
        return this.alignment === Alignment.evil;
    }

    /** 获取指定类型的所有未过期 Tag（meta 类型自动收窄） */
    getTag<T extends TagType>(type: T): TypedTag<T>[] {
        const now = useDataStore().time;
        return this.tags.filter(t => t.type === type && t.till > now) as TypedTag<T>[];
    }

    /** 添加 Tag，默认永久。meta 类型根据 type 自动推导 */
    addTag<T extends TagType>(
        type: T,
        opts?: { till?: Time.TimeNumber; at?: Time.TimeNumber; count?: number; source?: number | string; force?: boolean }
            & ([TagMetaMap[T]] extends [undefined] ? { meta?: undefined } : { meta?: TagMetaMap[T] }),
    ): void {
        const till = opts?.till ?? Time.FAR_FUTURE;
        const count = opts?.count ?? 1;
        const force = opts?.force ?? false;
        const roleDef: IRole = RoleMap[this.role]!;
        const rule = TAG_RULES[type];
        for (let i = 0; i < count; i++) {
            const tg = { type, till, source: opts?.source, at: opts?.at, meta: opts?.meta } as TypedTag<T>;
            if (!force && roleDef.beforeTagAdd?.(this, tg) === false) continue;
            if (!force && rule?.beforeAdd?.(this, tg) === false) continue;
            this.tags.push(tg);
            rule?.afterAdd?.(this, tg);
            roleDef.afterTagAdd?.(this, tg);
        }
    }

    /** 是否存在某类型 Tag（至少一层未过期）。传入多个类型时检查是否命中任一 */
    hasTag(...types: TagType[]): boolean {
        const now = useDataStore().time;
        return this.tags.some(t => types.includes(t.type) && t.till > now);
    }

    /** 某类型 Tag 的层数（未过期） */
    getTagCount(type: TagType): number {
        const now = useDataStore().time;
        return this.tags.filter(t => t.type === type && t.till > now).length;
    }

    /** 手动清除指定类型的所有 Tag（无视过期时间） */
    clearTags(type: TagType): void {
        const roleDef: IRole = RoleMap[this.role]!;
        const rule = TAG_RULES[type];
        this.tags = this.tags.filter(t => {
            if (t.type !== type) return true;
            if (roleDef.onTagRemove?.(this, t) === false) return true;
            if (rule?.beforeRemove?.(this, t) === false) return true;
            rule?.afterRemove?.(this, t);
            return false;
        });
    }

    /** 移除已过期的 Tag */
    pruneExpiredTags(): void {
        const now = useDataStore().time;
        // 先拍快照，避免 afterRemove 副作用（如 dying→dead）触发
        // clearTags/ addTag 导致 this.tags 被反复重赋值而丢失数据
        const snapshot = [...this.tags];
        for (const t of snapshot) {
            if (t.till > now) continue;
            const roleDef: IRole = RoleMap[this.role]!;
            const rule = TAG_RULES[t.type];
            if (roleDef.onTagRemove?.(this, t) === false) continue;
            if (rule?.beforeRemove?.(this, t) === false) continue;
            rule?.afterRemove?.(this, t);
        }
        this.tags = this.tags.filter(t => t.till > now);
    }
}

/** 玩家（说书人）角色：可主动发动的技能 */
export class PlayerCharacter extends BaseCharacter {
    /** 玩家可发动的技能键列表 */
    roles: PlayerRoleType[] = [];

    constructor() {
        super();
    }
}

/** Fisher-Yates 洗牌 */
export function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]!;
        a[i] = a[j]!;
        a[j] = tmp;
    }
    return a;
}

/** 从 RoleMap 中随机抽取 n 个指定阵营的不同角色。支持单个阵营或阵营数组 */
export function pickRoles(factions: Faction | Faction[], n: number): RoleType[] {
    const set = new Set(Array.isArray(factions) ? factions : [factions]);
    const dataStore = useDataStore();
    return randpick(
        allRoleKeys().filter(x => {
            if (!set.has(RoleMap[x].faction)) return false;
            // 未配置 AI 时，过滤掉需要 AI 的角色
            if (RoleMap[x].requiresAI && !dataStore.aiConfigured) return false;
            return true;
        }),
        n,
    ).items;
}

/** 随机选善良玩家，优先镇民，排除已死亡。count 默认 1，返回数组 */
export function pickKindPreferVillager(chars: Character[], count: number = 1, filter: (x: Character) => boolean = () => true): Character[] {
    const result: Character[] = [];
    const used = new Set<number>();

    // 优先村民（带 unfavored 标记的玩家——痢蛭宿主/狐媚娘魅惑目标——按外来者同级处理，不进入优先梯队）
    const villagers = shuffle(chars.filter(x => !x.hasTag(TagType.unfavored) && x.getRoleDetail().faction === Faction.villager && !x.isDead() && filter(x)));
    for (const v of villagers) {
        if (result.length >= count) break;
        result.push(v);
        used.add(v.id);
    }

    // 不足则取其他善良
    if (result.length < count) {
        const others = shuffle(chars.filter(x => !used.has(x.id) && !x.isTrulyEvil() && !x.isDead() && filter(x)));
        for (const o of others) {
            if (result.length >= count) break;
            result.push(o);
        }
    }

    return result;
}