/**
 * 天气系统：weather.ts
 *
 * 每局固定一个天气，开局随机抽取，玩家可消耗声望重掷一次。
 * 每个天气一体两面（利弊相生）。文案为定稿 v4，效果逻辑见各天气的接入点注释。
 */
import { randpick } from "@/utils/utils";

/** 天气键 */
export const WeatherType = {
    /** 多云 */
    cloudy: "cloudy",
    /** 浓雾 */
    fog: "fog",
    /** 血月 */
    bloodmoon: "bloodmoon",
    /** 酷暑 */
    heatwave: "heatwave",
    /** 暴雨 */
    rainstorm: "rainstorm",
    /** 极寒 */
    blizzard: "blizzard",
    /** 雷暴 */
    thunderstorm: "thunderstorm",
    /** 流星雨 */
    meteor: "meteor",
    /** 月食 */
    eclipse: "eclipse",
} as const;
export type WeatherType = typeof WeatherType[keyof typeof WeatherType];

/** 天气定义 */
export interface Weather {
    /** 显示名 */
    display: string;
    /** 图标 */
    icon: string;
    /** 完整效果文案（markdown，支持 ::key::） */
    desc: string;
}

export { REROLL_WEATHER_COST } from './constants';

/** 全部天气键（用于随机） */
export const WEATHER_LIST: WeatherType[] = Object.keys(WeatherType) as WeatherType[];

export const WeatherMap: Record<WeatherType, Weather> = {
    cloudy: {
        display: "多云",
        icon: "☁️",
        desc: "一位::villager::始终保持::awake::，免疫::confused::。当他首次濒临死亡时，他不会死亡，并失去此效果，然后永久::poisoned::。你开局得知两名玩家，其中一名是这位玩家。",
        // 接入点（后补）：开局赋予天选者标记 + 写入二选一信息；死亡判定时挡一次死亡并转为永久 confused
    },
    fog: {
        display: "浓雾",
        icon: "🌫️",
        desc: "发动技能额外消耗 1 行动力。开局时你会得知浓雾将在第 1~4 个::dusk::中的某一个降临。该::dusk::，所有::evil::::drunk::直到下一个::dawn::。",
        // 接入点（后补）：开局决定降临黄昏；该黄昏让所有 evil 中毒；行动成本 +1
    },
    bloodmoon: {
        display: "血月",
        icon: "🌕",
        desc: "每个白天，你可以选择一名玩家：他::drunk::直到下一个::dawn::。",
        // 接入点（后补）：白天主动技能，选择一名玩家施加 confused（drunk 语义）到下一个黎明
    },
    heatwave: {
        display: "酷暑",
        icon: "🔥",
        desc: "每个白天，若你当前白天尚未发动主动技能，你的处决不消耗行动力；若你这么做，你无法在当天白天发动任何主动技能。",
        // 接入点（后补）：处决成本判断 + 主动技能禁用标记
    },
    rainstorm: {
        display: "暴雨",
        icon: "🌧️",
        desc: "大雨倾盆，痕迹被冲刷无痕。每个夜晚，::demon::的击杀有 40% 概率失败；每个::dusk::，有 30% 概率一名存活的::kind::::drunk::直到下一个::dusk::。",
        // 接入点：恶魔击杀 40% 失败（tag.ts dying 判定）+ 每个 dusk 30% 善良醉酒（game.ts applyDuskWeather）
    },
    blizzard: {
        display: "极寒",
        icon: "❄️",
        desc: "你的白天行动力上限 -2。被::demon::击杀的目标不会立即死亡，而是进入「冻僵」状态，死亡结算延迟到::dusk::；::dusk::前，该目标可被::clean::或守护移除冻僵。",
        // 接入点（后补）：行动力上限 -2；新增 frozen tag 延迟死亡结算
    },
    thunderstorm: {
        display: "雷暴",
        icon: "⛈️",
        desc: "雷光划破夜空，照出原形。每个夜晚，随机一名玩家被雷电震慑，他当晚无法行动；::dawn::时你会得知该玩家是否是::evil::。当你首次将要得知该玩家是::evil::时，改为得知该玩家是::kind::。",
        // 接入点：夜晚震慑随机一人（game.ts Night 分支）+ 黎明揭示是否 evil（首次 evil 改善良）
    },
    meteor: {
        display: "流星雨",
        icon: "☄️",
        desc: "天罚与天怒，皆由流星裁决。每个白天限一次，你可以召唤流星砸向一名玩家：若他是::evil::，他死亡且无视保护，你获得 2 点声望；若他是::kind::，他死亡，你除了善良死亡损失 2 点声望外损失 4 点声望，且下一个白天无法发动此技能。",
        // 接入点（后补）：白天主动技能，选择一名玩家，判定 evil/kind 结算死亡与声望
    },
    eclipse: {
        display: "月食",
        icon: "🌑",
        desc: "夜晚死亡的玩家，信息面板不会揭示他的阵营；若该玩家存在伪装，该玩家不会显示真实身份。夜间死亡不会产生声望降低。",
        // 接入点（后补）：黎明死亡揭示信息隐藏 + 夜间死亡声望豁免
    },
};

/** 随机抽取一个天气 */
export function randWeather(): WeatherType {
    return randpick(WEATHER_LIST).items[0]!;
}
