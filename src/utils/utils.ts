import { RoleMap } from "@/data/roles";
import type { Ref } from "vue";

export function randint(lower: number, upper: number) {
    return Math.round(Math.random() * (upper - lower) + lower);
}
export function swap<T>(a: Ref<T>, b: Ref<T>) {
    const x = a.value;
    a.value = b.value;
    b.value = x;
}

declare global {
    interface Number {
        wrap(bound: number): number;
    }
}

Number.prototype.wrap = function (this: number, bound: number): number {
    const n = this.valueOf();
    return ((n - 1) % bound + bound) % bound + 1;
};

/** 安全调用可能为 null/undefined 的函数，支持传参 */
export function runFn<T extends (...args: any[]) => any>(
    fn: T | null | undefined,
    ...args: Parameters<T>
): ReturnType<T> | undefined {
    return fn?.(...args);
}

export function randpick<T>(
    ls: T[],
    count: number = 1,
    filter?: (item: T, index: number) => boolean,
): { items: T[]; indices: number[] } {
    const pool = filter
        ? ls.map((v, i) => ({ v, i })).filter(({ v, i }) => filter(v, i))
        : ls.map((v, i) => ({ v, i }));
    if (count > pool.length) {
        console.warn(`randpick: 请求 ${count} 个元素，但池中仅有 ${pool.length} 个，已返回全部。`, new Error().stack);
        count = pool.length;
    }
    const indices: number[] = [];
    const items: T[] = [];
    for (let k = 0; k < count; k++) {
        const idx = randint(0, pool.length - 1);
        indices.push(pool[idx]!.i);
        items.push(pool[idx]!.v);
        pool.splice(idx, 1);
    }
    return { items, indices };
}

/** 不重复队列：插入时若已存在则忽略，可删除最早插入的元素 */
export class UniqueQueue<T> {
    private _list: T[] = [];
    private _set = new Set<T>();

    /** 插入元素（已存在则跳过） */
    push(item: T): void {
        if (this._set.has(item)) return;
        this._list.push(item);
        this._set.add(item);
    }

    /** 删除指定值的元素 */
    delete(item: T): void {
        if (!this._set.has(item)) return;
        this._set.delete(item);
        this._list = this._list.filter(x => x !== item);
    }

    /** 移除并返回最早插入的元素 */
    shift(): T | undefined {
        const item = this._list.shift();
        if (item !== undefined) this._set.delete(item);
        return item;
    }

    /** 转换为数组（按插入顺序） */
    toArray(): T[] {
        return [...this._list];
    }

    /** 元素数量 */
    get size(): number {
        return this._list.length;
    }

    /** 是否包含 */
    has(item: T): boolean {
        return this._set.has(item);
    }
}

export function allRoleKeys(): (keyof typeof RoleMap)[] {
    return (Object.keys(RoleMap) as (keyof typeof RoleMap)[]).filter(k => k !== 'unknown');
}

export async function sleep(sec: number) {
    return new Promise<void>(async (res) => {
        await setTimeout(() => {
            res()
        }, sec * 1000);
    })
}