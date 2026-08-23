/**
 * 角色模块：model.ts
 *
 * 存放角色基础类型、阵营常量、共享状态、常用查询函数与共享辅助函数，
 * 供各阵营角色文件（villager/outsider/minion/demon）使用。
 */
import { Time } from "../../utils/time";
import { type ITag, TagType } from "../tag";
import { type Character, type BaseCharacter, pickKindPreferVillager } from "../model";
import { useDataStore } from "../../store/value";
import { allRoleKeys, randint, randpick } from "@/utils/utils";
import { logSkillResolution } from "../gameLog";
import { RoleMap, type RoleType } from "./index";

/** 角色钩子（按角色类型泛型化，供 IRole 与 IPlayerRole 复用，避免重复声明） */
export interface RoleHooks<C extends BaseCharacter = BaseCharacter> {
    /** 判断当前是否可以发动主动技能 */
    canActivateSkill?: (c: C, t: Time.TimeNumber) => boolean,
    /** 夜间行动优先级，越大越先行动 */
    nightActionPriority?: (c: C) => number,
    /** 夜间技能（优先级排序执行） */
    onNightSkill?: (c: C, t: Time.TimeNumber) => void,
    /** 释放主动技能时，返回 false 表示取消/失败 */
    onActiveSkill?: (c: C) => boolean | void | Promise<boolean | void>,
    /** 时间改变时（无优先级，阶段切换触发） */
    onTimeChange?: (c: C, t: Time.TimeNumber) => void,
    /** 游戏开始时 */
    onStart?: (c: C) => void;
}

/** 角色定义接口 */
export interface IRole extends RoleHooks<Character> {
    display: string,
    faction: Faction,
    summery?: string,
    // 异常情况
    abnormal?: {
        // 针对所有异常
        overall?: string,
        // 针对 伪装
        disguise?: string,
        // 针对 神志不清（中毒/醉酒）
        confused?: string
    },
    /** 能力详情的 markdown 描述（支持 ::key:: 关键词语法） */
    ability: string,
    /** 标记角色是否需要 AI（未配置 AI 时该角色不会出现在角色池） */
    requiresAI?: boolean,
    /** 回忆时 */
    onRecall?: (c: Character) => void,
    /** 被施加 Tag 前触发，返回 false 阻止添加 */
    beforeTagAdd?: (c: Character, tg: ITag) => boolean;
    /** 被施加 Tag 后触发（副作用） */
    afterTagAdd?: (c: Character, tg: ITag) => void;
    /** 被移除 Tag 时触发，返回 false 阻止移除 */
    onTagRemove?: (c: Character, tg: ITag) => boolean;
    /** 被处决时触发，返回 false 阻止处决 */
    onExecuted?: (c: Character) => boolean;
    /** 调整初始阵营数量显示（如男爵 +2 外来者 -2 镇民） */
    onAdjustCounts?: (counts: { villager: number; outsider: number }) => void;
}

export const Faction = {
    /** 镇民 */
    villager: "villager",
    /** 外来者 */
    outsider: "outsider",
    /** 爪牙 */
    minion: "minion",
    /** 恶魔 */
    demon: "demon",
    unknown: "unknown"
} as const;

export type Faction = typeof Faction[keyof typeof Faction];

/** 阵营（善良/邪恶），与角色类型独立 */
export const Alignment = {
    good: "good",
    evil: "evil",
} as const;

export type Alignment = typeof Alignment[keyof typeof Alignment];

/** 共享角色状态（key = 角色 id）。各角色按自己的 id 存取互不冲突 */
export const playerData = new Map<number, number>();

/** 清空共享角色状态（新游戏开始 / 读档恢复时调用，避免跨局状态残留） */
export function resetRoleStore(): void {
    playerData.clear();
}

// ── 常用查询函数 ──

/** 获取所有存活玩家 */
export function getAliveChars(): Character[] {
    return useDataStore().charList().filter(x => !x.hasTag(TagType.dead));
}

/** 玩家查询选项（阵营 / 善良 / 邪恶通用） */
export interface CharsQueryOpts {
    /** 随机抽取 count 名 */
    count?: number;
    /** 仅存活玩家 */
    alive?: boolean;
    /** 仅死亡玩家 */
    deadOnly?: boolean;
    /** 排除某玩家 */
    exclude?: Character;
}

/** 获取指定阵营（可多个）的玩家，可限制数量 / 存活 / 排除某玩家 */
export function getFactionChars(
    factions: Faction | Faction[],
    opts: CharsQueryOpts = {},
): Character[] {
    const set = new Set(Array.isArray(factions) ? factions : [factions]);
    let list = useDataStore().charList().filter(
        x => set.has(x.getRoleDetail().faction) && x.id !== opts.exclude?.id,
    );
    if (opts.alive) list = list.filter(x => !x.hasTag(TagType.dead));
    if (opts.deadOnly) list = list.filter(x => x.hasTag(TagType.dead));
    if (opts.count !== undefined) list = randpick(list, opts.count).items;
    return list;
}

/** 善良 / 邪恶玩家查询选项：在 CharsQueryOpts 基础上增加 truly 开关 */
export interface GoodEvilQueryOpts extends CharsQueryOpts {
    /** true 用 isTrulyEvil（仅按 alignment，不含清醒陌客）；false（默认）用 isEvil（含清醒陌客） */
    truly?: boolean;
}

/** 获取善良玩家，可选数量 / 存活 / 排除；truly 开关决定用 isEvil 还是 isTrulyEvil */
export function getGoodChars(
    opts: GoodEvilQueryOpts = {},
): Character[] {
    const matchGood = (x: Character) => (opts.truly ? !x.isTrulyEvil() : !x.isEvil());
    let list = useDataStore().charList().filter(
        x => matchGood(x) && x.id !== opts.exclude?.id,
    );
    if (opts.alive) list = list.filter(x => !x.hasTag(TagType.dead));
    if (opts.deadOnly) list = list.filter(x => x.hasTag(TagType.dead));
    if (opts.count !== undefined) list = randpick(list, opts.count).items;
    return list;
}

/** 获取邪恶玩家，可选数量 / 存活 / 排除；truly 开关决定用 isEvil 还是 isTrulyEvil */
export function getEvilChars(
    opts: GoodEvilQueryOpts = {},
): Character[] {
    const matchEvil = (x: Character) => (opts.truly ? x.isTrulyEvil() : x.isEvil());
    let list = useDataStore().charList().filter(
        x => matchEvil(x) && x.id !== opts.exclude?.id,
    );
    if (opts.alive) list = list.filter(x => !x.hasTag(TagType.dead));
    if (opts.deadOnly) list = list.filter(x => x.hasTag(TagType.dead));
    if (opts.count !== undefined) list = randpick(list, opts.count).items;
    return list;
}

/** 获取某阵营（可多个）的身份：默认全部，可选 inPlay（在场）/ absent（不在场） */
export function getRoleKeys(
    factions: Faction | Faction[],
    opts: { inPlay?: boolean; absent?: boolean } = {},
): RoleType[] {
    const set = new Set(Array.isArray(factions) ? factions : [factions]);
    let keys = allRoleKeys().filter(k => set.has(RoleMap[k].faction));
    if (opts.inPlay || opts.absent) {
        const inPlay = new Set(useDataStore().charList().map(x => x.role));
        if (opts.inPlay) keys = keys.filter(k => inPlay.has(k));
        else keys = keys.filter(k => !inPlay.has(k));
    }
    return keys;
}

/** 获取与玩家 x 距离为 y 的玩家（左右两侧各一名，同一玩家不重复） */
export function getCharsAtDistance(c: Character, distance: number): Character[] {
    const dataStore = useDataStore();
    const sz = dataStore.playerNumber();
    const res: Character[] = [];
    const seen = new Set<number>();
    for (const dir of [distance, -distance]) {
        const id = (c.id + dir).wrap(sz);
        const ch = dataStore.chars.get(id);
        if (ch && !seen.has(id)) {
            res.push(ch);
            seen.add(id);
        }
    }
    return res;
}

/** 获取 x 名存活善良玩家（优先镇民） */
export function pickGood(
    chars: Character[],
    count: number = 1,
    filter: (x: Character) => boolean = () => true,
): Character[] {
    return pickKindPreferVillager(chars, count, filter);
}

// ── 通用辅助函数 ──

/** 查找指定角色某个方向最近存活的角色（顺时针 cw / 逆时针 ccw） */
export function nearestAlive(c: Character, dir: 'cw' | 'ccw'): Character | undefined {
    const dataStore = useDataStore();
    const sz = dataStore.playerNumber();
    const maxDist = Math.floor(sz / 2);
    for (let i = 1; i <= maxDist; i++) {
        const id = dir === 'cw' ? (c.id + i).wrap(sz) : (c.id - i).wrap(sz);
        const ch = dataStore.chars.get(id);
        if (ch && !ch.hasTag(TagType.dead)) return ch;
    }
    return undefined;
}

/** 查找角色两侧最近存活的角色 */
export function nearestAlivePair(c: Character): { cw: Character | undefined; ccw: Character | undefined } {
    return { cw: nearestAlive(c, 'cw'), ccw: nearestAlive(c, 'ccw') };
}

// ── F4 首夜信息角色共享辅助函数 ──

/** 从 faction 阵营中随机选一名玩家和另一名玩家组成对子 */
export function f4PickPair(c: Character, faction: Faction): { pair: Character[]; role: RoleType } | undefined {
    const dataStore = useDataStore();
    const inPlay = dataStore.charList().filter(x => x.id !== c.id && x.getRoleDetail().faction === faction);
    if (inPlay.length === 0) return;
    const target = randpick(inPlay).items[0]!;
    const others = dataStore.charList().filter(x => x.id !== target.id && x.id !== c.id);
    if (others.length === 0) return;
    const pair = [target, randpick(others).items[0]!].sort((a, b) => a.id - b.id);
    return { pair, role: target.role };
}

/** 找一名有 disguiseFaction 伪装的玩家和另一名玩家组成对子 */
export function f4DisguisePair(c: Character, disguiseFaction: Faction): { pair: Character[]; role: RoleType } | undefined {
    const dataStore = useDataStore();
    const candidates = dataStore.charList().filter(x =>
        x.id !== c.id && x.hasTag(TagType.disguise) &&
        RoleMap[x.getTag(TagType.disguise)[0]!.meta as RoleType]?.faction === disguiseFaction
    );
    if (candidates.length === 0) return;
    const target = randpick(candidates).items[0]!;
    const disRole = target.getTag(TagType.disguise)[0]!.meta as RoleType;
    const others = dataStore.charList().filter(x => x.id !== target.id && x.id !== c.id);
    if (others.length === 0) return;
    const pair = [target, randpick(others).items[0]!].sort((a, b) => a.id - b.id);
    return { pair, role: disRole };
}

/** 随机两名玩家 + 一个两者都不是的 faction 身份 */
export function f4RandomWrongPair(c: Character, faction: Faction): { pair: Character[]; role: RoleType } | undefined {
    const dataStore = useDataStore();
    const allPs = dataStore.charList().filter(x => x.id !== c.id);
    if (allPs.length < 2) return;
    const two = randpick(allPs, 2).items;
    const taken = new Set<RoleType>();
    two.forEach(x => taken.add(x.role));
    two.forEach(x => {
        const dis = x.getTag(TagType.disguise)[0];
        if (dis && RoleMap[dis.meta as RoleType]?.faction === faction) taken.add(dis.meta as RoleType);
    });
    const valid = allRoleKeys().filter(k => RoleMap[k].faction === faction && !taken.has(k));
    const role = valid.length > 0 ? randpick(valid).items[0]! : randpick(allRoleKeys(), 1, k => RoleMap[k].faction === faction).items[0]!;
    const pair = two.sort((a, b) => a.id - b.id);
    return { pair, role };
}

/**
 * F4 神志不清/伪装分支：70%伪装 + 20%随机错误 + 10%（数量为0→告知没有，否则伪装）
 * @param zeroMsg 数量为0时显示的提示文本（含 :: 标记）
 */
export function f4HandleNotAwake(c: Character, faction: Faction, countMin: number, zeroMsg: string): void {
    const roll = randint(1, 100);
    const doDisguise = () => {
        const r = f4DisguisePair(c, faction);
        if (!r) return false;
        c.info.push(`#${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::。`);
        logSkillResolution(c.id, `得知 #${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::（伪装）`);
        return true;
    };
    const doRandomWrong = () => {
        const r = f4RandomWrongPair(c, faction);
        if (!r) return;
        c.info.push(`#${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::。`);
        logSkillResolution(c.id, `得知 #${r.pair[0]!.id} 和 #${r.pair[1]!.id} 中有一名::${r.role}::（均不是该身份）`);
    };

    if (roll <= 70) { if (!doDisguise()) doRandomWrong(); }
    else if (roll <= 90) { doRandomWrong(); }
    else if (countMin === 0) {
        c.info.push(zeroMsg);
        logSkillResolution(c.id, `得知${zeroMsg}（神志不清）`);
    } else if (!doDisguise()) doRandomWrong();
}

/** 解密大师：猜对时，得知一名真实邪恶玩家及其身份 */
export function cryptoRevealEvil(c: Character): boolean {
    const dataStore = useDataStore();
    const evil = randpick(
        dataStore.charList(),
        1,
        e => e.isEvil() && !e.hasTag(TagType.dead) && e.id !== c.id,
    ).items[0] ?? randpick(
        dataStore.charList(),
        1,
        e => e.isEvil() && !e.hasTag(TagType.dead),
    ).items[0];
    if (!evil) return false;
    c.info.push(`#${evil.id} 是${RoleMap[evil.role].display}。`);
    logSkillResolution(c.id, `猜对了！得知 #${evil.id} 是::${evil.role}::。`);
    return true;
}

/** 解密大师：错误信息（随机一名玩家 + 可能出现的邪恶身份，且保证该玩家不是该身份） */
export function cryptoWrongInfo(c: Character, reason: string): void {
    const dataStore = useDataStore();
    const player = randpick(dataStore.charList(), 1, p => p.id !== c.id && !p.isTrulyEvil()).items[0];
    if (!player) {
        c.info.push('未能获取到有效信息。');
        return;
    }
    const allEvil = allRoleKeys().filter(r =>
        RoleMap[r].faction === Faction.minion || RoleMap[r].faction === Faction.demon
    );
    const pool = (dataStore.possibleEvil.length > 0 ? dataStore.possibleEvil : allEvil)
        .filter(r => r !== player.role);
    const role = pool.length > 0
        ? randpick(pool).items[0]!
        : (allEvil.find(r => r !== player.role) ?? allEvil[0]!);
    c.info.push(`#${player.id} 是${RoleMap[role].display}。`);
    logSkillResolution(c.id, `得知 #${player.id} 是::${role}::（错误信息，${reason}）`);
}

// ── AI 前提构建辅助函数（艺术家/渔夫/郎中）──

/** 构建完整的游戏状态前提文本（规则 + 历史 + 当前状态），供 AI 回答问题使用 */
export function buildGameStatePremise(): string {
    const dataStore = useDataStore();
    const parts: string[] = [];

    // ── 一、游戏规则 ──
    parts.push('【游戏规则】');
    parts.push('你是"说书人"，主持一场类"血染钟楼"的推理游戏。');
    parts.push('游戏中有以下阵营：');
    parts.push('- villager（镇民）：善良阵营，拥有各种获取信息或保护的能力。');
    parts.push('- outsider（外来者）：善良阵营，但能力对善良方不利。');
    parts.push('- minion（爪牙）：邪恶阵营，辅助恶魔。');
    parts.push('- demon（恶魔）：邪恶阵营，每晚杀死一名善良玩家。');
    parts.push('');
    parts.push('游戏按天进行，每天分为：夜晚→黎明→白天→黄昏。');
    parts.push('白天玩家可以回忆（recall）得知信息、发动技能、或处决（execute）可疑玩家。');
    parts.push('处决发生在白天，被处决的玩家会死亡。');
    parts.push('当恶魔/爪牙全部死亡，善良方获胜；当存活玩家≤2人或声望归零，邪恶方获胜。');
    parts.push('');

    // ── 四、角色图鉴 ──
    parts.push('【角色图鉴（所有可能出现的角色及能力）】');
    parts.push('注意：以下为游戏中所有可能出现的角色，玩家仅扮演其中部分角色。说书人应参考以下所有角色的能力来回答问题。');
    parts.push('');
    const sortedRoles = allRoleKeys().filter(k => k !== 'unknown').sort((a, b) => {
        const order = [Faction.villager, Faction.outsider, Faction.minion, Faction.demon];
        const fa = RoleMap[a].faction, fb = RoleMap[b].faction;
        return order.indexOf(fa as any) - order.indexOf(fb as any) || a.localeCompare(b);
    });
    for (const key of sortedRoles) {
        const role = RoleMap[key];
        const abil = role.ability.replace(/::/g, '').replace(/\n\s*/g, ' ').trim();
        parts.push(`- ${key}（${role.display}，${role.faction}）：${abil.substring(0, 120)}`);
    }
    parts.push('');

    // ── 二、历史事件 ──
    parts.push('【历史事件】');
    const events = dataStore.gameLog;
    if (events.length === 0) {
        parts.push('（暂无历史事件）');
    } else {
        for (const evt of events) {
            const day = Time.getDay(evt.time);
            const phase = Time.PHASE_NAMES[Time.getPhase(evt.time)];
            const subjectRole = evt.subject > 0 && evt.subject <= dataStore.playerNumber()
                ? RoleMap[dataStore.chars.get(evt.subject)?.role ?? 'unknown']?.display
                : '?';
            switch (evt.type) {
                case 'phaseChange':
                    parts.push(`- 第${day}天${phase}开始`);
                    break;
                case 'recall':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）进行了回忆`);
                    break;
                case 'execute':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）被处决`);
                    break;
                case 'death':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）死亡（死因：${(evt.meta as any).cause ?? '未知'}）`);
                    break;
                case 'skillResolution':
                    parts.push(`- 第${day}天${phase}：#${evt.subject}（${subjectRole}）发动技能：${(evt.meta as any).detail ?? ''}`);
                    break;
                case 'reputationChange':
                    parts.push(`- 第${day}天${phase}：声望变化 ${(evt.meta as any).delta ?? 0}（${(evt.meta as any).reason ?? ''}），当前 ${(evt.meta as any).newValue ?? '?'}`);
                    break;
                case 'gameStart':
                    parts.push(`- 游戏开始，初始角色已分配`);
                    break;
                // gameEnd, disguiseChange, confusedChange 可忽略或简要记录
            }
        }
    }
    parts.push('');

    // ── 三、当前状态 ──
    parts.push('【当前状态】');
    parts.push(`当前是第 ${Time.getDay(dataStore.time)} 天，${Time.getTimeString(dataStore.time)}。`);
    parts.push(`共有 ${dataStore.playerNumber()} 名玩家。`);
    parts.push('');

    const chars = [...dataStore.chars.entries()].sort((a, b) => a[0] - b[0]);
    for (const [id, c] of chars) {
        const role = RoleMap[c.role];
        const tags: string[] = [];
        if (c.hasTag(TagType.dead)) tags.push('已死亡');
        if (c.hasTag(TagType.confused)) tags.push('神志不清（中毒/醉酒）');
        if (c.hasTag(TagType.disguise)) {
            const dis = c.getTag(TagType.disguise)[0];
            tags.push(`伪装身份：${RoleMap[dis?.meta as RoleType]?.display ?? '未知'}`);
        }
        const tagStr = tags.length > 0 ? ` [${tags.join('，')}]` : '';
        parts.push(`玩家 #${id}：${role.display}（${role.faction}）${tagStr}`);
    }

    return parts.join('\n');
}

/** 构建艺术家专用的前提（游戏状态 + JSON 回答格式约束） */
export function buildArtistPremise(): string {
    const base = buildGameStatePremise();
    return `${base}
【回答格式】
你必须仅回复一个 JSON 对象，格式如下：
{"answer": "是", "reason": "简要原因"}
{"answer": "否", "reason": "简要原因"}
{"answer": "无法回答", "reason": "简短原因"}
不要输出任何其他内容，只输出 JSON。

【强制要求】
- 禁止回答"我不知道"。即使信息不足或不确定，也必须基于已有信息给出最可能的"是"或"否"判断。
- 只有当问题本身不是是非题（无法用"是/否"回答）时，才可以使用"无法回答"。

例子：
1. 
问：#3 是恶魔吗？
答：{"answer": "是", "reason": "#3 是小恶魔，他的能力会在夜晚杀死善良阵营的玩家。"}
2. 
问：#5 是镇民吗？
答：{"answer": "否", "reason": "#5 是下毒者，他是镇民，他的能力会使周围的善良阵营玩家中毒。"}
3. 
问：1+1=2吗？
答：{"answer": "是", "reason": "1+1=2是一个基本的数学事实。"}
`;
}

/** 解析 AI 的 JSON 回答，返回 { answer: '是'|'否'|'cannot_answer', reason: string } */
export function parseArtistAnswer(raw: string): { answer: '是' | '否' | 'cannot_answer'; reason: string } {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no json');

        const parsed = JSON.parse(jsonMatch[0]);
        const answer = (parsed.answer ?? '').trim();
        const reason = (parsed.reason ?? '').trim();

        if (answer === '是') return { answer: '是', reason };
        if (answer === '否') return { answer: '否', reason };
        // "我不知道" / "无法回答" 一律视为无法回答，阻止其被当作有效答案交给玩家
        return { answer: 'cannot_answer', reason };
    } catch {
        // JSON 解析失败，尝试正则匹配作为降级方案
        const text = raw.trim();
        if (/不知道|不清楚|无法确定|未知|don['']?t\s*know|unknown|not\s+sure/i.test(text)) {
            return { answer: 'cannot_answer', reason: '' };
        }
        if (/^是|[\s,，。.!！?？]是|yes|correct|true|right/i.test(text)) {
            return { answer: '是', reason: '' };
        }
        if (/^否|^不是|[\s,，。.!！?？]否|[\s,，。.!！?？]不是|no\b|false|wrong|incorrect/i.test(text)) {
            return { answer: '否', reason: '' };
        }
        return { answer: 'cannot_answer', reason: '' };
    }
}

/** 构建渔夫专用的状态前提（游戏状态 + 建议回答要求） */
export function buildFishermanPremise(isAwake: boolean): string {
    const base = buildGameStatePremise();
    return `${base}
【回答要求】
作为说书人，给渔夫一些${isAwake ? '能帮助善良阵营获胜' : '误导性的'}策略建议。
这些建议不需要严格基于事实，你是说书人，${isAwake ? "由于渔夫清醒，你需要指引渔夫做出最有利于他阵营的选择。" : "但由于渔夫神志不清，你需要误导渔夫做出错误的选择。"}
请用中文回复，只输出以下 JSON 格式（不要输出其他内容）：
{"advice": "具体建议内容", "reason": "给出此建议的原因"}
请注意，建议（\`advice\`）**不要**包含理由，也不要包含上述【历史事件】和【当前状态】的内容。（玩家并不知道【历史事件】和【当前状态】的内容，这些只有说书人知道。）
你只需要给出一条建议，类似“相信 #3 和 #5”是两条建议（相信#3和相信#5），“处决 #3 和 #5”也是两条建议（处决 #3和处决 #5）。你不需要给出多条建议。
给渔夫建议的最好方式是让他做什么，而不是“是什么”信息。这让渔夫这个角色更有趣也更与众不同。
例如，建议“你应该处决那个玩家”，或者“保护那名玩家”，或者“找到醉酒的玩家”，或者“颠覆你之前的想法”，或者“忽略爪牙们的存在”，或者“相信哪名玩家”。这些建议会比“这名玩家是邪恶的”或者“恶魔类型是亡骨魔”更有趣。
以下是建议的示例：

- 渔夫清醒时：
1. {"advice": "你不应该相信 #8", "reason": "#8 是中毒的共情者，他的信息出现了错误。"}
2. {"advice": "你应该保护 #3", "reason": "#3 是教授，他的技能很有用。"}
3. {"advice": "你应该处决 #5", "reason": "#5 是恶魔，他的能力会在夜晚杀死善良阵营的玩家。"}
4. {"advice": "你不应该处决 #7", "reason": "#7 是酒鬼，虽然他的信息可能会误导你，但他是善良玩家。"}

- 渔夫神志不清时：
5. {"advice": "你应该处决 #2", "reason": "#2 是镇民，但由于渔夫神志不清，我给了他糟糕的建议。"}
6. {"advice": "你应该保护 #7", "reason": "#7 是珀（恶魔），但由于渔夫神志不清，我给了他糟糕的建议。"}
`;
}

/** 构建郎中专用的前提（游戏状态 + 目标玩家 + 词语生成约束） */
export function buildHerbDoctorPremise(target: Character, awake: boolean): string {
    const base = buildGameStatePremise();
    const targetDetail = RoleMap[target.role];
    const abil = targetDetail.ability.replace(/::/g, '').replace(/\n\s*/g, ' ').trim();
    return `${base}

【当前目标】
玩家 #${target.id} 的角色是 ${targetDetail.display}（${targetDetail.faction}）。
该角色的能力描述：${abil.substring(0, 200)}

【任务】
你是一个说书人。郎中在夜晚对一名玩家"诊脉"，${awake ? '你需要给出一个与该玩家能力相关的词语' : '**由于郎中的状态异常，你需要给出一个与该玩家能力无关的随机词语。**若该玩家有伪装，你可以给出与该玩家伪装能力有关的词语。'}。

要求：
- 词语应为 2\~4 个汉字，必须有明确含义。
- 该词可以来自能力描述中的某个关键词，如"夜晚"、"死亡"、"公开"等；也可以是对能力的概括性描述，如"勇敢"、"牺牲"、"伪装"等。
- 不能是无法组成词语的字拼接在一起。
- 建议在游戏早期尽量提供模糊的词语，避免郎中迅速确定对方的具体角色。尤其对于邪恶身份，不要提供过于明显的信息。如：普卡，可以提供“神志不清”，而不是“毒素”。${!awake ? '\n- 由于郎中神志不清，请给出一个与该玩家能力无关的随机词语。若该玩家有伪装，你可以给出与该玩家伪装能力有关的词语。' : ''}

示例：
1. 第一晚，郎中选择了教授，得知的词语是"死亡"。因为教授的技能对象为死亡玩家。第二晚，郎中仍选择教授，得知“逆转”，因为教授的技能可以逆转死亡玩家的状态。
2. 郎中选择了酒鬼，得知的词语是"神志不清"。因为酒鬼的技能会让自己和目标玩家醉酒。
3. 郎中选择了刺客，得知的词语是"死亡"。因为刺客的技能会在第二个夜晚杀死一名玩家。
4. 郎中选择了建筑师，得知的词语是“邪恶”。因为建筑师的技能描述中有“邪恶”一词。
5. 神志不清的郎中选择了普卡，得知的词语是“保护”。因为普卡伪装成的僧侣的技能能够保护玩家。

【回答格式】
请仅回复以下 JSON 格式：
{"word": "你选择的词语", "reason": "简短说明为什么选择这个词"}
不要输出任何其他内容。`;
}
