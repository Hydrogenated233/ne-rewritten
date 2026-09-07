/**
 * 运行时 API 入口 polyfill。
 *
 * 项目构建只降语法、不补运行时方法(compat 构建同理), 下列方法在旧版
 * Safari/iOS 上缺失时, 会在显示/展开时报 "xxx is not a function"。
 * 统一在此按需修补; 本模块须作为 main.ts 的**第一个** import(副作用)加载,
 * 保证先于其他模块运行。
 *
 * 支持门槛参考(逐个以 `typeof … !== 'function'` 守卫, 存在原生实现时不覆盖):
 * - Array.prototype.toReversed / toSorted / toSpliced / with: Safari/iOS 16.4+
 * - Array.prototype.findLast / findLastIndex: Safari/iOS 15.4+
 * - Array.prototype.at / String.prototype.at: Safari/iOS 15.4+
 * - String.prototype.replaceAll: Safari/iOS 13.1+
 * - Object.hasOwn: Safari/iOS 15.4+
 * - Promise.withResolvers: Safari/iOS 17.4+(不在 ES2023 lib, 用 `in` 判存在)
 *
 * 内部数组均为稠密数组, polyfill 与原生在稀疏/代理等边角语义上的差异可忽略。
 * 新增代码若用到此处未覆盖的新运行时 API, 应先补进本文件或直接写降级写法。
 */
export {};

// ---- Array.prototype.toReversed (Safari/iOS 16.4+) ----
if (typeof Array.prototype.toReversed !== 'function') {
    Object.defineProperty(Array.prototype, 'toReversed', {
        configurable: true,
        writable: true,
        value: function <T>(this: T[]): T[] {
            return this.slice().reverse();
        },
    });
}

// ---- Array.prototype.findLastIndex (Safari/iOS 15.4+) ----
if (typeof Array.prototype.findLastIndex !== 'function') {
    Object.defineProperty(Array.prototype, 'findLastIndex', {
        configurable: true,
        writable: true,
        value: function <T>(
            this: T[],
            predicate: (value: T, index: number, array: T[]) => unknown,
            thisArg?: unknown,
        ): number {
            for (let i = this.length - 1; i >= 0; i--) {
                if (predicate.call(thisArg, this[i], i, this)) return i;
            }
            return -1;
        },
    });
}

// ---- Array.prototype.at (Safari/iOS 15.4+) ----
if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
        configurable: true,
        writable: true,
        value: function <T>(this: T[], index: number): T | undefined {
            const n = Math.trunc(index) || 0;
            const length = this.length;
            const k = n >= 0 ? n : length + n;
            return k >= 0 && k < length ? this[k] : undefined;
        },
    });
}

// ---- String.prototype.at (Safari/iOS 15.4+) ----
if (typeof String.prototype.at !== 'function') {
    Object.defineProperty(String.prototype, 'at', {
        configurable: true,
        writable: true,
        value: function (index: number): string | undefined {
            const s = String(this);
            const n = Math.trunc(index) || 0;
            const length = s.length;
            const k = n >= 0 ? n : length + n;
            return k >= 0 && k < length ? s.charAt(k) : undefined;
        },
    });
}

// ---- String.prototype.replaceAll (Safari/iOS 13.1+) ----
// 字符串 search 会转义正则元字符; RegExp search 须带 /g (与原生一致, 否则抛错)。
// 空串 search 用 /(?:)/g 近似(对码元级别插入, 内部文本均为 ASCII/常规 BMP, 与原生一致)。
if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
        configurable: true,
        writable: true,
        value: function (
            search: string | RegExp,
            replacement: string | ((substring: string, ...args: unknown[]) => string),
        ): string {
            const s = String(this);
            if (search instanceof RegExp) {
                if (!search.global) throw new TypeError('String.prototype.replaceAll: 需要一个带 /g 的正则');
                return s.replace(search, replacement as string);
            }
            const needle = String(search);
            const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return s.replace(new RegExp(escaped, 'g'), replacement as string);
        },
    });
}

// ---- Array.prototype.toSorted (Safari/iOS 16.4+) ----
// 原生 toSorted 是稳定排序; slice().sort() 依赖 ES2019 起强制稳定的 Array.sort, 语义一致。
if (typeof Array.prototype.toSorted !== 'function') {
    Object.defineProperty(Array.prototype, 'toSorted', {
        configurable: true,
        writable: true,
        value: function <T>(this: T[], compare_fn?: (a: T, b: T) => number): T[] {
            return this.slice().sort(compare_fn);
        },
    });
}

// ---- Array.prototype.toSpliced (Safari/iOS 16.4+) ----
if (typeof Array.prototype.toSpliced !== 'function') {
    Object.defineProperty(Array.prototype, 'toSpliced', {
        configurable: true,
        writable: true,
        value: function <T>(this: T[], start: number, delete_count?: number, ...items: T[]): T[] {
            const len = this.length;
            const rel_start = Math.trunc(start) || 0;
            const actual_start = rel_start < 0 ? Math.max(len + rel_start, 0) : Math.min(rel_start, len);
            const dc =
                delete_count === undefined
                    ? len - actual_start
                    : Math.min(Math.max(Math.trunc(delete_count) || 0, 0), len - actual_start);
            const copy = this.slice();
            copy.splice(actual_start, dc, ...items);
            return copy;
        },
    });
}

// ---- Array.prototype.with (Safari/iOS 16.4+) ----
if (typeof Array.prototype.with !== 'function') {
    Object.defineProperty(Array.prototype, 'with', {
        configurable: true,
        writable: true,
        value: function <T>(this: T[], index: number, value: T): T[] {
            const len = this.length;
            const rel_index = Math.trunc(index) || 0;
            const actual_index = rel_index < 0 ? len + rel_index : rel_index;
            if (actual_index < 0 || actual_index >= len) throw new RangeError('Invalid index: ' + index);
            const copy = this.slice();
            copy[actual_index] = value;
            return copy;
        },
    });
}

// ---- Array.prototype.findLast (Safari/iOS 15.4+) ----
if (typeof Array.prototype.findLast !== 'function') {
    Object.defineProperty(Array.prototype, 'findLast', {
        configurable: true,
        writable: true,
        value: function <T>(
            this: T[],
            predicate: (value: T, index: number, array: T[]) => unknown,
            this_arg?: unknown,
        ): T | undefined {
            for (let i = this.length - 1; i >= 0; i--) {
                const value = this[i];
                if (predicate.call(this_arg, value, i, this)) return value;
            }
            return undefined;
        },
    });
}

// ---- Object.hasOwn (Safari/iOS 15.4+) ----
if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
        configurable: true,
        writable: true,
        value: function has_own(o: object, key: PropertyKey): boolean {
            return Object.prototype.hasOwnProperty.call(o, key);
        },
    });
}

// ---- Promise.withResolvers (Safari/iOS 17.4+; 不在 tsconfig 的 ES2023 lib 里, 用 in 判存在) ----
if (!('withResolvers' in Promise)) {
    Object.defineProperty(Promise, 'withResolvers', {
        configurable: true,
        writable: true,
        value: function with_resolvers<T>(): {
            promise: Promise<T>;
            resolve: (value: T | PromiseLike<T>) => void;
            reject: (reason?: unknown) => void;
        } {
            let resolve!: (value: T | PromiseLike<T>) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        },
    });
}
