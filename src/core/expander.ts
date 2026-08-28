import { append_sibling, get_bound, prepend_child, TreeNode } from '@/core/tree.ts';
import { NotationDefinition } from '@/notation-definition.ts';

function resolve_fs<T>(notation: NotationDefinition<T>, variant: string): (expr: T, index: number) => T {
    switch (variant) {
        case 'FS':
            return notation.FS;
        case 'FS_alter':
            return notation.FS_alter ?? notation.FS;
        case 'FS_short':
            return notation.FS_short ?? notation.FS;
        default:
            return notation.FS;
    }
}

function is_last_child<T>(node: TreeNode<T>): boolean {
    const p = node.parent;
    return p !== null && p.children[p.children.length - 1].index === node.index;
}

function generate_fs<T>(
    node: TreeNode<T>,
    fs: (expr: T, i: number) => T,
    bound: T | undefined,
    compare: (a: T, b: T) => number,
    variant: string,
    max_fs?: number,
): T {
    let i: number;
    if (node.fs_state && node.fs_state.variant === variant) {
        i = node.fs_state.index + 1;
    } else {
        i = 0;
    }

    while (true) {
        if (max_fs !== undefined && i > max_fs && node.children.length === 0) {
            throw new Error('当前节点试展开次数过多, 可能基本列实现有误');
        }
        const res = fs(node.expr, i);
        if (bound === undefined || compare(res, bound) > 0) {
            node.fs_state = { variant, index: i };
            return res;
        }
        i++;
    }
}

/**
 * 只展开一层: 计算 node 越过 bound 的下一个 FS 项并插入 (作为子节点或兄弟)。
 * 返回新创建的节点, 无法展开 (非 limit 且后继不在区间内) 时返回 undefined。
 */
function expand_single<T>(
    node: TreeNode<T>,
    notation: NotationDefinition<T>,
    fs: (expr: T, i: number) => T,
    variant: string,
    to_parent: boolean,
    max_fs?: number,
): TreeNode<T> | undefined {
    const bound = get_bound(node);

    let result_expr: T;
    if (notation.is_limit(node.expr)) {
        result_expr = generate_fs(node, fs, bound, notation.compare, variant, max_fs);
    } else {
        result_expr = fs(node.expr, 0);
        if (notation.compare(result_expr, node.expr) >= 0) return;
        if (bound !== undefined && notation.compare(result_expr, bound) <= 0) return;
    }

    const new_node = to_parent ? append_sibling(node, result_expr) : prepend_child(node, result_expr);
    dispatch_pending(node, new_node, result_expr, notation);
    return new_node;
}

/**
 * 把 node 的挂载条目 (pending_items) 按新节点值 v 分派：
 * - x < v  → 移给 new_node（其区间下段）
 * - x == v → 写入 new_node 的 analysis（重复值沿用覆盖语义）
 * - x > v  → 留在 node（区间上段）
 * pending_items 按 expr 递增有序。
 */
function dispatch_pending<T>(node: TreeNode<T>, new_node: TreeNode<T>, v: T, notation: NotationDefinition<T>): void {
    const pend = node.pending_items;
    if (!pend || pend.length === 0) return;

    // pending 递增有序: 二分查找第一个 expr >= v 的位置
    let lo = 0;
    let hi = pend.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (notation.compare(pend[mid].expr, v) < 0) lo = mid + 1;
        else hi = mid;
    }
    const start = lo;

    if (start > 0) {
        const np = (new_node.pending_items ??= []);
        np.push(...pend.slice(0, start));
    }

    // start 起连续 == v 的段, 取末者 (重复时后写覆盖)
    let end = start;
    while (end < pend.length && notation.compare(pend[end].expr, v) === 0) end++;
    if (end > start) {
        const attach = pend[end - 1];
        const nd_ed = (new_node.extraData ??= {});
        Object.assign(nd_ed, attach.extraData);
    }

    if (end < pend.length) {
        node.pending_items = pend.slice(end);
    } else {
        delete node.pending_items;
    }
}

function expand_tier_impl<T>(
    node: TreeNode<T>,
    notation: NotationDefinition<T>,
    fs: (expr: T, i: number) => T,
    variant: string,
    tier: number,
    to_parent: boolean,
    max_fs?: number,
): TreeNode<T> | undefined {
    const new_node = expand_single(node, notation, fs, variant, to_parent, max_fs);
    if (!new_node) return;

    if (tier > 0) {
        const new_to_parent = to_parent || node.children.length === 1;
        expand_tier_impl(new_node, notation, fs, variant, tier, new_to_parent, max_fs);
        if (tier > 1) {
            if (new_node.children.length > 0) {
                expand_tier_impl(
                    new_node.children[new_node.children.length - 1],
                    notation,
                    fs,
                    variant,
                    tier - 1,
                    true,
                    max_fs,
                );
            } else {
                expand_tier_impl(new_node, notation, fs, variant, tier - 1, false, max_fs);
            }
        }
    }
    return new_node;
}

/**
 * 展开当前节点。
 *
 * @returns 首个创建的节点（可用于聚焦），undefined 表示未展开。
 */
export function expand_item<T>(
    node: TreeNode<T>,
    notation: NotationDefinition<T>,
    variant: string,
    tier = 0,
    max_fs?: number,
): TreeNode<T> | undefined {
    const fs = resolve_fs(notation, variant);
    const parent = node.parent;
    const to_parent = parent?.parent !== null && is_last_child(node);
    return expand_tier_impl(node, notation, fs, variant, tier, to_parent, max_fs);
}

export function check_is_standard<T>(
    expr: T,
    notation: NotationDefinition<T>,
    variant: string,
    max_find_fs: number = 10,
): boolean {
    let upper: T | undefined = undefined;
    let upper_fs_index = 0;

    const initial = notation.init();
    for (let e_init of initial) {
        const cmp = notation.compare(e_init, expr);
        if (cmp === 0) return true;
        if (cmp > 0) {
            upper = e_init;
        } else {
            break;
        }
    }
    if (upper === undefined) return false;

    while (true) {
        if (upper_fs_index > max_find_fs) return false;
        if (upper_fs_index > 0 && !notation.is_limit(upper)) return false;

        const current = resolve_fs(notation, variant)(upper, upper_fs_index);
        const cmp = notation.compare(current, expr);
        upper_fs_index++;

        if (cmp === 0) {
            return true;
        } else if (cmp > 0) {
            upper = current;
            upper_fs_index = 0;
        }
    }
}
