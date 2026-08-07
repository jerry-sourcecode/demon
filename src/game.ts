/**
 * 游戏引擎入口
 *
 * 职责：
 * 1. 新游戏初始化（发牌、伪装、阵营调整）
 * 2. 胜负判定（邪恶全灭 / 好人≤1 / 声望归零）
 * 3. 主循环（时间推进 → 阶段处理 → 等待玩家操作）
 * 4. 读档恢复
 */

import { useEmitter } from "./store/emit";
import { Character, Faction, Alignment, pickRoles, RoleMap, shuffle, type RoleType } from "./data/model";
import { useDataStore } from "./store/value";
import { Time } from "./utils/time";
import { allRoleKeys, randpick, runFn, sleep } from "./utils/utils";
import { TagType } from "./data/tag";
import { logGameStart, logGameEnd } from "./data/gameLog";
import type { MatchConfig } from "./data/match";

/**
 * 检查游戏是否结束（三种胜负条件）
 *
 * @returns true=游戏已结束
 *
 * 胜负判定顺序（优先级从高到低）：
 * 1. gameOver 标记 — 某些角色（如圣徒）可能通过 onExecuted 直接触发
 * 2. 邪恶全灭 — 所有邪恶角色（含已伪装）均死亡，好人胜利
 * 3. 好人≤1 — 存活的好人角色不超过 1 个，邪恶控制小镇
 * 4. 声望归零 — 玩家被放逐，邪恶胜利
 */
function checkGameEnd(dataStore: ReturnType<typeof useDataStore>, emitter: ReturnType<typeof useEmitter>): boolean {
    // 圣徒等角色可能已通过 onExecuted 直接触发 game-end，同步给循环
    if (dataStore.gameOver) return true;

    // 条件：所有邪恶角色已被消灭
    const evilAlive = dataStore.evilAlive;
    if (evilAlive.length === 0) {
        dataStore.gameOver = true;
        logGameEnd(true, '所有邪恶已被消灭');
        emitter.emit('game-end', true);
        return true;
    }

    // 条件：玩家声望归零
    if (dataStore.reputation <= 0) {
        dataStore.reputation = 0;
        dataStore.gameOver = true;
        logGameEnd(false, '声望归零，你被放逐');
        emitter.emit('game-end', false);
        return true;
    }

    // 条件：存活的非邪恶（好人）角色 ≤ 1
    if (dataStore.charList().filter(c => !c.isEvil() && !c.hasTag(TagType.dead)).length <= 1) {
        dataStore.gameOver = true;
        logGameEnd(false, '仅剩1名::kind::，::evil::控制了小镇');
        emitter.emit('game-end', false);
        return true;
    }

    return false;
}
/**
 * 触发所有存活角色的 onTimeChange 钩子（含伪装角色）
 *
 * 在每次阶段切换时调用，让角色响应时间变化（如技能冷却、状态刷新）。
 * 已死亡且没有「保留」标记的角色跳过。
 */
function triggerTimeChange(dataStore: ReturnType<typeof useDataStore>) {
    dataStore.chars.forEach(x => {
        // 跳过已死亡且无「保留」标记的角色（保留标记为亡骨魔所加，用于保留爪牙能力）
        if (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained)) return;
        // 触发本体角色的 onTimeChange
        runFn(RoleMap[x.role].onTimeChange, x, dataStore.time);
        // 如果有伪装，同时触发伪装角色的 onTimeChange
        const tg = x.getTag(TagType.disguise)[0];
        if (tg) runFn(RoleMap[tg.meta].onTimeChange, x, dataStore.time);
    });
}

/**
 * 检查是否有存活角色可发动技能（含伪装角色）
 *
 * 在黎明/黄昏阶段使用，判断是否需要暂停等待玩家操作。
 * 找到第一个可用技能后立即短路返回。
 */
function hasActivatableSkill(dataStore: ReturnType<typeof useDataStore>): boolean {
    let found = false;
    dataStore.chars.forEach(x => {
        if (found || (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained))) return;
        // 检查本体角色
        if (runFn(RoleMap[x.role].canActivateSkill, x, dataStore.time)) { found = true; return; }
        // 检查伪装角色
        if (x.hasTag(TagType.disguise)) {
            const dis_role = x.getTag(TagType.disguise)[0]!.meta;
            if (runFn(RoleMap[dis_role].canActivateSkill, x, dataStore.time)) found = true;
        }
    });
    return found;
}

/**
 * 将 count 个随机 from 阵营角色替换为不在场的 to 阵营角色
 *
 * 用于 onAdjustCounts 调整后的阵营修正。
 * 例如：某个角色的能力使外来者 +1，则需要将一个镇民转为外来者。
 *
 * @param from 源阵营（被替换的角色所属阵营）
 * @param to 目标阵营（替换后角色所属阵营）
 * @param count 需要替换的数量
 */
function swapRoles(from: Faction, to: Faction, count: number) {
    const dataStore = useDataStore();
    const allTo = allRoleKeys().filter(k => {
        if (RoleMap[k].faction !== to) return false;
        if (RoleMap[k].requiresAI && !dataStore.aiConfigured) return false;
        return true;
    });
    const presentTo = new Set(
        dataStore.charList().filter(c => c.getRoleDetail().faction === to).map(c => c.role)
    );
    let absent = allTo.filter(r => !presentTo.has(r));
    const fromChars = dataStore.charList().filter(c => c.getRoleDetail().faction === from);
    // 不能超过可用角色数
    const actualCount = Math.min(count, fromChars.length);
    if (actualCount < count) {
        console.warn(`swapRoles: 请求交换 ${count} 个 ${from}，但仅有 ${fromChars.length} 个可用，实际交换 ${actualCount} 个。`);
    }
    const targets = randpick(fromChars, actualCount).items;
    for (const t of targets) {
        if (absent.length === 0) break;
        t.role = randpick(absent).items[0]!;
        absent = absent.filter(r => r !== t.role);
    }
}

/**
 * 新游戏启动入口
 *
 * 执行流程：
 * 1. 初始化 store（配置、声望、行动力）
 * 2. 检查各阵营可用角色数量，不足则自动调整
 * 3. 发牌（按阵营比例随机抽取）
 * 4. 分配伪装（邪恶角色获得一个伪装身份）
 * 5. 执行 onAdjustCounts（角色能力影响阵营人数）
 * 6. 初始化 Tab 面板（邪恶身份列表 + 混淆项）
 * 7. 计算镇民/外来者数量浮动范围
 * 8. 记录初始发牌日志
 * 9. 触发所有角色的 onStart 钩子
 * 10. 进入主循环
 *
 * @param matchConfig 游戏配置（各阵营人数、声望、行动力等）
 */
export async function start(matchConfig: MatchConfig) {
    const dataStore = useDataStore();

    // ── 1. 初始化 store ──
    dataStore.currentMatchConfig = { ...matchConfig };
    dataStore.initCounts = { villager: matchConfig.villager, outsider: matchConfig.outsider, minion: matchConfig.minion, demon: matchConfig.demon };
    dataStore.reputation = matchConfig.reputation;
    dataStore.maxActionPoints = matchConfig.actionPoints;
    dataStore.actionPoints = matchConfig.actionPoints;

    // ── 2. 检查各阵营可用角色数量是否足够 ──
    // 筛选时排除 requiresAI=true 但未配置 AI 的角色
    function countAvailableRoles(faction: Faction): number {
        return allRoleKeys().filter(k =>
            RoleMap[k].faction === faction &&
            (!RoleMap[k].requiresAI || dataStore.aiConfigured)
        ).length;
    }
    const availVillager = countAvailableRoles(Faction.villager);
    const availOutsider = countAvailableRoles(Faction.outsider);
    const availMinion = countAvailableRoles(Faction.minion);
    const availDemon = countAvailableRoles(Faction.demon);
    if (matchConfig.villager > availVillager) {
        console.warn(`[Game] 镇民角色不足：要求 ${matchConfig.villager}，可用 ${availVillager}，已自动调整`);
        matchConfig.villager = availVillager;
    }
    if (matchConfig.outsider > availOutsider) {
        console.warn(`[Game] 外来者角色不足：要求 ${matchConfig.outsider}，可用 ${availOutsider}，已自动调整`);
        matchConfig.outsider = availOutsider;
    }
    if (matchConfig.minion > availMinion) {
        console.warn(`[Game] 爪牙角色不足：要求 ${matchConfig.minion}，可用 ${availMinion}，已自动调整`);
        matchConfig.minion = availMinion;
    }
    if (matchConfig.demon > availDemon) {
        console.warn(`[Game] 恶魔角色不足：要求 ${matchConfig.demon}，可用 ${availDemon}，已自动调整`);
        matchConfig.demon = availDemon;
    }

    // ── 3. 发牌（按阵营随机抽取 + 打乱顺序） ──
    const player: RoleType[] = [
        ...pickRoles(Faction.villager, matchConfig.villager), 'Knight',
        ...pickRoles(Faction.outsider, matchConfig.outsider), "SweetHeart",
        ...pickRoles(Faction.minion, matchConfig.minion),
        ...pickRoles(Faction.demon, matchConfig.demon),
    ];
    const shuffled = shuffle(player);

    // ── 4. 分配伪装身份 ──
    // 邪恶角色（隐士除外）获得一个伪装身份，用于 Tab 面板的信息误导
    const disguiseVillagerCount = Math.min(5, availVillager);
    // 伪装池 = 随机镇民 + 2 个随机外来者（排除 Drunk 和 TwoFaced）
    let disguiseRoleList = [
        ...pickRoles(Faction.villager, disguiseVillagerCount),
        ...randpick(allRoleKeys(), 2, (x) => RoleMap[x].faction === Faction.outsider && x !== 'Drunk' && x !== 'TwoFaced').items,
    ];
    shuffled.forEach((x, idx) => {
        const id = idx + 1;
        const c = new Character(id, x);
        // 根据角色类型设置默认阵营
        const defaultFac = RoleMap[x]?.faction;
        c.alignment = (defaultFac === Faction.demon || defaultFac === Faction.minion)
            ? Alignment.evil : Alignment.good;
        dataStore.chars.set(id, c);
        // 邪恶角色（隐士除外）获得伪装
        if (c.isTrulyEvil()) {
            const { items, indices } = randpick(disguiseRoleList)
            c.addTag(TagType.disguise, { meta: items[0]! });
            disguiseRoleList.splice(indices[0]!, 1); // 从伪装池移除已分配的伪装
        }
    })

    const emitter = useEmitter();

    // ── 5. onAdjustCounts：根据角色的能力调整阵营人数 ──
    // 某些角色会让外来者+1，需要从镇民中扣减
    const adjVc = matchConfig.villager;
    const adjOc = matchConfig.outsider;
    const netCounts = { villager: adjVc, outsider: adjOc };
    // 遍历所有角色，让每个角色通过 onAdjustCounts 钩子修改 netCounts
    dataStore.chars.forEach(c => {
        runFn(RoleMap[c.role]?.onAdjustCounts, netCounts);
    });
    // 确保调整后的数量不为负
    netCounts.villager = Math.max(0, netCounts.villager);
    netCounts.outsider = Math.max(0, netCounts.outsider);
    // 计算外来者净变化量，限制不能超过镇民的变化量
    let deltaO = netCounts.outsider - adjOc;
    let deltaV = netCounts.villager - adjVc;
    let delta;
    if (Math.abs(deltaO) > Math.abs(deltaV)) {
        delta = Math.sign(deltaO) * Math.abs(deltaV);
    } else {
        delta = deltaO;
    }
    // 根据 delta 正负交换角色阵营
    if (delta > 0) {
        // 外来者增加 → 将镇民转为外来者
        swapRoles(Faction.villager, Faction.outsider, delta);
    } else if (delta < 0) {
        // 外来者减少 → 将外来者转为镇民
        swapRoles(Faction.outsider, Faction.villager, -delta);
    }

    // ── 6. Tab 面板初始化：构建「可能的邪恶身份」列表 ──
    // 列表中包含：真实恶魔/爪牙 + 各一个不在场的混淆项
    const allMinionKeys = allRoleKeys().filter(k => RoleMap[k].faction === Faction.minion);
    const allDemonKeys = allRoleKeys().filter(k => RoleMap[k].faction === Faction.demon);
    let actualEvil = dataStore.charList()
        .filter(c => c.isTrulyEvil())
        .map(c => c.role);

    // 混淆恶魔：添加一个不在场的恶魔（使玩家无法直接排除）
    if (matchConfig.demon > 0) {
        const absentDemon = allDemonKeys.filter(k => !actualEvil.includes(k));
        if (absentDemon.length > 0) {
            actualEvil.push(randpick(absentDemon, 1).items[0]!);
        }
    }

    // 混淆爪牙：添加一个不在场的爪牙
    if (matchConfig.minion > 0) {
        const absentMinion = allMinionKeys.filter(k => !actualEvil.includes(k));
        if (absentMinion.length > 0) {
            actualEvil.push(randpick(absentMinion, 1).items[0]!);
        }
    }

    // 排序：爪牙在前，恶魔在后，同类按名称降序
    actualEvil.sort((a, b) => {
        if (RoleMap[a].faction === RoleMap[b].faction) {
            return a < b ? 1 : -1;
        } else {
            if (RoleMap[a].faction === Faction.minion) return -1;
            return 1;
        }
    })
    dataStore.initPossibleEvil(actualEvil);

    // ── 7. 计算镇民/外来者数量浮动范围 ──
    // 用于信息角色（如调查员、厨师）推理时参考
    const adjMc = matchConfig.minion;
    const adjDc = matchConfig.demon;
    const minionAdj: number[] = [];
    const demonAdj: number[] = [];
    actualEvil.forEach(role => {
        const adj = { villager: adjVc, outsider: adjOc };
        runFn(RoleMap[role]?.onAdjustCounts, adj);
        // 调整量不能超过实际可用数量（外来者不能为负）
        const rawDelta = adj.outsider - adjOc;
        const clampedDelta = rawDelta > 0
            ? Math.min(rawDelta, adjVc)  // 增加外来者不能超过现有镇民数
            : Math.max(rawDelta, -adjOc); // 减少外来者不能低于 0
        const fac = RoleMap[role]?.faction;
        if (fac === Faction.minion) {
            minionAdj.push(clampedDelta);
        } else if (fac === Faction.demon) {
            demonAdj.push(clampedDelta);
        }
    });
    // 排序后取极端值（最大增加/最小减少）来计算上下界
    minionAdj.sort((a, b) => b - a);
    demonAdj.sort((a, b) => b - a);

    const maxExtra = minionAdj.slice(0, adjMc).reduce((s, x) => s + x, 0) + (demonAdj[0] ?? 0);
    const minExtra = minionAdj.slice(-adjMc).reduce((s, x) => s + x, 0) + (demonAdj.at(-1) ?? 0);
    dataStore.villagerMin = Math.max(0, adjVc - maxExtra);
    dataStore.villagerMax = Math.max(0, adjVc - minExtra);
    dataStore.outsiderMin = Math.max(0, adjOc + minExtra);
    dataStore.outsiderMax = Math.max(0, adjOc + maxExtra);

    // ── 8. 记录初始发牌日志 ──
    const initRoles: Record<number, RoleType> = {};
    dataStore.chars.forEach((c, id) => { initRoles[id] = c.role; });
    logGameStart(initRoles);

    // ── 9. 触发游戏开始事件 + 所有角色的 onStart 钩子 ──
    emitter.emit('game-start');
    dataStore.chars.forEach(x => {
        runFn(RoleMap[x.role].onStart, x)
        const tg = x.getTag(TagType.disguise)[0];
        if (tg) runFn(RoleMap[tg.meta].onStart, x)
    });

    // ── 10. 进入主循环 ──
    await runGameLoop(dataStore, emitter);
}


/**
 * 读档后恢复游戏循环
 *
 * 与 start() 不同，不会重新初始化数据，而是从存档状态继续。
 * 先处理当前阶段（不推进时间），再进入主循环。
 */
export async function resume() {
    const dataStore = useDataStore();
    const emitter = useEmitter();

    // 处理当前阶段（不 advance time，因为存档时的时间点已经处理过半）
    await processCurrentPhase(dataStore, emitter);

    // 继续主循环
    await runGameLoop(dataStore, emitter);
}

/**
 * 处理当前时段（不 advance time）
 *
 * 仅用于读档恢复时，处理存档时的时段剩余逻辑。
 * - 白天：进入操作循环等待玩家行动
 * - 黎明/黄昏：检查是否有可发动的技能
 * - 夜间：跳过（夜间处理在上一次循环中已完成）
 *
 * @returns true=游戏在此过程中结束
 */
async function processCurrentPhase(
    dataStore: ReturnType<typeof useDataStore>,
    emitter: ReturnType<typeof useEmitter>,
): Promise<boolean> {
    if (dataStore.gameOver) return true;
    if (checkGameEnd(dataStore, emitter)) return true;

    const phase = Time.getPhase(dataStore.time);
    if (phase === Time.Phase.Night) {
        // 夜间已由之前的循环处理过，直接跳过
        return false;
    }

    // onTimeChange
    triggerTimeChange(dataStore);

    if (phase === Time.Phase.Day) {
        // 白天：如果有行动力就进入操作循环
        while (dataStore.actionPoints > 0 && !dataStore.gameOver) {
            await emitter.emit('wait-for-action');
            if (checkGameEnd(dataStore, emitter)) return true;
        }
    } else {
        // 黎明/黄昏：检查是否有可发动的技能
        const needMove = hasActivatableSkill(dataStore);
        if (needMove && !dataStore.gameOver) {
            await emitter.emit('wait-for-action');
            if (checkGameEnd(dataStore, emitter)) return true;
        }
    }
    return false;
}

/**
 * 主游戏循环
 *
 * 每次迭代推进一个时间单位（nextTime），根据阶段类型分别处理：
 *
 * 🌙 Night（夜间）：
 *   - 触发 onTimeChange
 *   - 收集所有角色的 onNightSkill，按优先级降序执行
 *
 * ☀️ Day（白天）：
 *   - 触发 onTimeChange
 *   - 重置行动力 → 进入操作循环，等待玩家执行动作
 *
 * 🌇 Dawn / Dusk（黎明/黄昏）：
 *   - 触发 onTimeChange
 *   - 检查是否有角色可发动技能，如有则等待玩家操作
 *
 * 每个阶段处理完毕后都检查游戏是否结束。
 */
async function runGameLoop(
    dataStore: ReturnType<typeof useDataStore>,
    emitter: ReturnType<typeof useEmitter>,
) {
    let gameEnded = false;
    let loopIter = 0;
    while (!gameEnded) {
        loopIter++;
        // ── 推进时间 ──
        dataStore.nextTime();
        const timeStr = Time.getTimeString(dataStore.time);
        console.log(`[GameLoop] #${loopIter} 进入 ${timeStr}, AP=${dataStore.actionPoints}, gameOver=${dataStore.gameOver}`);

        // 每次推进时间后立即检查胜负
        if (checkGameEnd(dataStore, emitter)) {
            console.log(`[GameLoop] #${loopIter} 游戏结束检查通过`);
            gameEnded = true;
            break;
        }

        // ── 根据阶段类型处理 ──
        if (Time.getPhase(dataStore.time) === Time.Phase.Night) {
            // ═══════ 夜间处理 ═══════
            console.log(`[GameLoop] #${loopIter} 开始处理夜间技能`);
            triggerTimeChange(dataStore);

            // 收集所有角色的夜间技能，按优先级降序执行
            const order: { prio: number; c: Character; role: RoleType }[] = [];
            dataStore.chars.forEach(x => {
                if (x.hasTag(TagType.dead) && !x.hasTag(TagType.retained)) return;
                // 本体技能的优先级
                let prio = runFn(x.getRoleDetail().nightActionPriority, x);
                if (prio !== undefined) order.push({ prio, c: x, role: x.role });
                // 伪装技能的优先级
                if (x.hasTag(TagType.disguise)) {
                    const dis_role = x.getTag(TagType.disguise)[0]!.meta;
                    prio = runFn(RoleMap[dis_role].nightActionPriority, x);
                    if (prio !== undefined) order.push({ prio, c: x, role: dis_role });
                }
            });
            // 按优先级从高到低执行
            order.sort((a, b) => b.prio - a.prio);
            for (const x of order) {
                console.log(`[GameLoop] #${loopIter} 执行夜间技能: #${x.c.id}(${RoleMap[x.role].display})`);
                await runFn(RoleMap[x.role].onNightSkill, x.c, dataStore.time);
            }
            console.log(`[GameLoop] #${loopIter} 夜间技能处理完毕`);
        } else {
            // ═══════ 非夜间（白天/黎明/黄昏）处理 ═══════
            const phaseName = Time.PHASE_NAMES[Time.getPhase(dataStore.time)];
            console.log(`[GameLoop] #${loopIter} 非夜间阶段: ${phaseName}`);
            triggerTimeChange(dataStore);

            if (Time.getPhase(dataStore.time) === Time.Phase.Day) {
                // ── 白天：行动力系统 ──
                dataStore.resetActionPoints();
                console.log(`[GameLoop] #${loopIter} 进入白天, AP已重置为${dataStore.actionPoints}`);
                let dayIter = 0;
                // 循环：有行动力且游戏未结束时等待玩家操作
                while (dataStore.actionPoints > 0 && !dataStore.gameOver) {
                    dayIter++;
                    console.log(`[GameLoop] #${loopIter} 白天等待操作 #${dayIter}, AP=${dataStore.actionPoints}`);
                    await emitter.emit('wait-for-action')
                    console.log(`[GameLoop] #${loopIter} 白天操作完成 #${dayIter}, AP=${dataStore.actionPoints}, gameOver=${dataStore.gameOver}`);
                    if (checkGameEnd(dataStore, emitter)) {
                        console.log(`[GameLoop] #${loopIter} 白天操作后游戏结束`);
                        gameEnded = true;
                        break;
                    }
                }
                console.log(`[GameLoop] #${loopIter} 白天结束, 离开时 AP=${dataStore.actionPoints}, gameOver=${dataStore.gameOver}, gameEnded=${gameEnded}`);
            } else {
                // ── 黎明/黄昏：技能发动阶段 ──
                const needMove = hasActivatableSkill(dataStore);
                if (needMove && !dataStore.gameOver) {
                    console.log(`[GameLoop] #${loopIter} ${phaseName} 有可发动技能, 等待操作`);
                    await emitter.emit('wait-for-action')
                    if (checkGameEnd(dataStore, emitter)) {
                        console.log(`[GameLoop] #${loopIter} ${phaseName} 操作后游戏结束`);
                        gameEnded = true;
                    }
                }
            }
        }

        // ── 轮末安全检查（处决可能导致立即结束） ──
        if (!gameEnded) {
            if (checkGameEnd(dataStore, emitter)) {
                console.log(`[GameLoop] #${loopIter} 轮末检查游戏结束`);
                gameEnded = true;
            }
        }
        await sleep(0.5);
    }
    console.log(`[GameLoop] 游戏循环结束, 共 ${loopIter} 轮`);
}