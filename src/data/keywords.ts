import MarkdownIt from "markdown-it";
import { RoleMap, Faction } from "./model";

/** 单个关键词定义 */
export interface KeywordEntry {
    /** 在页面上显示的名称 */
    display: string;
    /** 悬浮时显示的详细描述 */
    desc: string;
    /** 关键词标签颜色（可选，默认 #4fc3f7） */
    color?: string;
}

/** 阵营 → 关键词颜色映射 */
export const FACTION_COLORS = {
    [Faction.villager]: "#4f76f7",
    [Faction.outsider]: "#4fe6f7",
    [Faction.minion]: "#f7814f",
    [Faction.demon]: "#f74f4f",
    [Faction.unknown]: "rgb(177, 179, 184)"
} as const;

/** 从 RoleMap 自动生成角色关键词 */
function buildRoleKeywords(): Record<string, KeywordEntry> {
    const entries: Record<string, KeywordEntry> = {};
    for (const [key, role] of Object.entries(RoleMap)) {
        entries[key] = {
            display: role.display,
            desc: dedent(role.ability),
            color: FACTION_COLORS[role.faction] || "#4fc3f7",
        };
    }
    return entries;
}

/**
 * 关键词典
 *
 * 在 markdown 中使用 `::key::` 语法引用关键词，例如：
 *   ::shield::  → 渲染为带 n-popover 的"护盾"标签
 *   ::poison::  → 渲染为带 n-popover 的"中毒"标签
 */
export const KEYWORD_DICT: Record<string, KeywordEntry> = {
    // ===== 角色关键词（自动从 RoleMap 生成）=====
    ...buildRoleKeywords(),

    // ===== 系统关键词 =====
    distance: {
        display: "距离",
        desc: "距离x，指你左边的x个玩家和右边的x个玩家。",
        color: "#db4ff7",
    },
    confused: {
        display: '神志不清',
        desc: "即::poisoned::或::drunk::，与::awake::相对，神智不清的玩家技能会出现错误。",
        color: "#f74f98"
    },
    awake: {
        display: '清醒',
        desc: "与::confused::相对，清醒的玩家技能会正常发动。",
        color: "#4fbcf7"
    },
    clean: {
        display: '净化',
        desc: "消除玩家::confused::效果。",
        color: "#4fd5f7"
    },
    poisoned: {
        display: '中毒',
        desc: "通常由::evil::施加，可以使得玩家获得::confused::效果。",
        color: "#a94ff7"
    },
    drunk: {
        display: '醉酒',
        desc: "通常由::kind::施加，可以使得玩家获得::confused::效果。",
        color: "#4fd3f7"
    },
    kind: {
        display: '善良玩家',
        desc: "玩家类型，包括::villager::和::outsider::。善良玩家被处决时，你减少5点声望，善良玩家死于非命时，你减少2点声望。",
        color: "#4f8ff7"
    },
    evil: {
        display: '邪恶玩家',
        desc: "玩家类型，包括::minion::和::demon::。",
        color: "#f74f4f"
    },
    villager: {
        display: '镇民',
        desc: "::kind::类型，镇民拥有能协助善良阵营的能力。通常来说，绝大多数在场角色都会是镇民。",
        color: FACTION_COLORS.villager
    },
    outsider: {
        display: '外来者',
        desc: "::kind::类型，外来者拥有的能力通常都对善良阵营无用或有消极作用。",
        color: FACTION_COLORS.outsider
    },
    minion: {
        display: "爪牙",
        desc: "::evil::类型，爪牙拥有能协助邪恶阵营的能力。一局游戏中通常会有一至三名爪牙。",
        color: FACTION_COLORS.minion
    },
    demon: {
        display: "恶魔",
        desc: "::evil::类型，恶魔通常会在夜晚攻击玩家，且会有一些其他的危害善良阵营的能力。",
        color: FACTION_COLORS.demon
    },
    dawn: {
        display: "黎明",
        desc: "时间段，处于夜晚之后，白天之前。",
        color: "#f79b4f"
    },
    dusk: {
        display: "黄昏",
        desc: "时间段，处于白天之后，夜晚之前。",
        color: "#f79b4f"
    },
    recall: {
        display: "回忆",
        desc: "失忆者模糊地想起自己曾是怎样的一个人。::kind::通常会记起真实身份，::evil::则会记起虚假的身份。",
        color: "#f7c94f",
    }
};

/** markdown-it 实例（复用，避免重复创建） */
const md = new MarkdownIt({ html: true });

/** 转义 HTML 属性值，同时去除换行防止属性断裂 */
function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, " ");
}

/**
 * 去除字符串的公共前导空白。
 * 防止模板字符串的缩进被 markdown-it 误解析为代码块。
 *
 * 例如：
 *   dedent("    line1\n    line2") → "line1\nline2"
 */
function dedent(s: string): string {
    const lines = s.split("\n");
    // 去掉首尾空行（模板字符串 `` 常见的第一行和最后一行只有缩进）
    while (lines.length && lines[0]!.trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
    if (lines.length === 0) return "";

    // 计算所有非空行的最小缩进
    const minIndent = Math.min(
        ...lines
            .filter((l) => l.trim() !== "")
            .map((l) => l.match(/^ */)![0].length),
    );

    // 去掉公共缩进
    return lines.map((l) => l.slice(minIndent)).join("\n");
}

/**
 * 将包含 ::key:: 的 markdown 渲染为完整 HTML。
 * 关键词替换为带 data 属性的占位 span，后续由 Vue 挂载时替换为 n-popover。
 *
 * 流程：
 *   ::shield:: → <span class="kw-ref" data-kw="shield" ...>护盾</span>
 *   然后全文 md.render()，段落结构由 markdown-it 一次正确处理。
 */
export function renderAbilityHTML(raw: string): string {
    const dedented = dedent(raw);
    const marked = dedented.replace(/::(\w+)::/g, (_m: string, key: string) => {
        const e = KEYWORD_DICT[key];
        if (!e) return _m;
        const c = e.color || "#4fc3f7";
        return `<span class="kw-ref" data-kw="${key}" data-kw-desc="${escapeAttr(e.desc)}" data-kw-color="${c}" style="color:${c}">${e.display}</span>`;
    });
    return md.render(marked);
}
