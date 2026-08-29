import type { PendingItem, TreeNode } from '@/core/tree.ts';
import { find_prev, last_descendant } from '@/core/tree.ts';
import type { TreeNodeExtra } from '@/core/extra.ts';
import { expand_item } from '@/core/expander.ts';
import { NotationDefinition, resolve_display } from '@/notation-definition.ts';

/** 单个导出条目。expr 保留原始类型，不做字符串化。 */
export interface AnalysisEntry<T> {
    expr: T;
    analysis: string[];
}

/** Infinity 的 JSON 序列化哨兵。JSON 不支持 Infinity, 会静默转成 null。 */
const INFINITY_MARKER = { $infinity: true as const };

/** 将 AnalysisEntry[] 序列化为 JSON, 其中 Infinity 转为哨兵对象。 */
export function stringify_analysis_entries<T>(entries: AnalysisEntry<T>[]): string {
    return JSON.stringify(entries, (_key, value) => {
        if (value === Infinity) return INFINITY_MARKER;
        return value;
    });
}

/** 将 JSON 文本反序列化为 AnalysisEntry[], 恢复哨兵对象为 Infinity。 */
export function parse_analysis_entries<T>(text: string): AnalysisEntry<T>[] {
    return JSON.parse(text, (_key, value) => {
        if (value !== null && typeof value === 'object' && (value as { $infinity?: unknown }).$infinity === true) {
            return Infinity;
        }
        return value;
    });
}

/** 将挂载条目提取为 AnalysisEntry（无 analysis 内容的条目返回 undefined）。 */
function pending_to_entry<T>(p: PendingItem<T>): AnalysisEntry<T> | undefined {
    const ed = p.extraData as TreeNodeExtra | undefined;
    const analysis = ed?.analysis;
    if (!analysis?.some((a) => a !== undefined)) return undefined;
    return { expr: p.expr, analysis: [...analysis] };
}

/**
 * 先根遍历树（递增序），收集所有有 analysis 内容的节点。
 *
 * 每个节点的挂载条目 (pending_items) 位于其区间（最大子, 自身）内，
 * 因此在递增序中排在节点自身之前，先于节点导出。
 */
export function export_analysis<T>(root: TreeNode<T>): AnalysisEntry<T>[] {
    const result: AnalysisEntry<T>[] = [];

    function walk(nodes: TreeNode<T>[]) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            walk(node.children);
            if (node.pending_items) {
                for (const p of node.pending_items) {
                    const entry = pending_to_entry(p);
                    if (entry) result.push(entry);
                }
            }
            const ed = node.extraData as TreeNodeExtra | undefined;
            if (ed?.analysis?.some((a) => a !== undefined)) {
                result.push({ expr: node.expr, analysis: [...ed.analysis] });
            }
        }
    }

    walk(root.children);
    return result;
}

/**
 * 惰性导入分析。不改变树的结构：对每个条目，若等于已有节点则直接写入 analysis，
 * 否则定位到包含它的最深已展开节点，作为 pending_items 挂载。
 *
 * 条目假定按序数递增。不在树区间（底, 顶）内的条目返回为 not_found。
 */
export interface ImportResult<T> {
    /** 直接写入 analysis 的节点（条目等于已存在节点）。 */
    matched: TreeNode<T>[];
    /** 无法定位（超出树区间）的条目。 */
    not_found: AnalysisEntry<T>[];
}

export function import_analysis<T>(
    root: TreeNode<T>,
    entries: AnalysisEntry<T>[],
    notation: NotationDefinition<T>,
): ImportResult<T> {
    const matched: TreeNode<T>[] = [];
    const not_found: AnalysisEntry<T>[] = [];
    const additions = new Map<TreeNode<T>, PendingItem<T>[]>();

    for (const entry of entries) {
        const node = locate_host(root, entry.expr, notation);
        if (!node) {
            not_found.push(entry);
            continue;
        }
        if (notation.compare(node.expr, entry.expr) === 0) {
            const ed = (node.extraData ??= {}) as TreeNodeExtra;
            if (!Array.isArray(ed.analysis)) ed.analysis = [];
            ed.analysis.length = 0;
            ed.analysis.push(...entry.analysis);
            matched.push(node);
        } else {
            let arr = additions.get(node);
            if (!arr) {
                arr = [];
                additions.set(node, arr);
            }
            arr.push({ expr: entry.expr, extraData: { analysis: entry.analysis } });
        }
    }

    // 归并到各节点既有 pending, 保持递增有序 (同值条目: 后 import 覆盖先 import)
    for (const [node, add] of additions) {
        node.pending_items = merge_pending(node.pending_items, add, notation);
    }

    return { matched, not_found };
}

/**
 * 归并两个递增有序的挂载条目数组。同 expr 时新条目 (add) 覆盖旧条目
 * （输入假定有序, 同值必相邻, 故后者覆盖前者）。
 */
function merge_pending<T>(
    existing: PendingItem<T>[] | undefined,
    add: PendingItem<T>[],
    notation: NotationDefinition<T>,
): PendingItem<T>[] {
    const result: PendingItem<T>[] = [];
    const e = existing ?? [];
    let i = 0;
    let j = 0;
    const emit = (item: PendingItem<T>) => {
        const last = result[result.length - 1];
        if (last && notation.compare(last.expr, item.expr) === 0) result[result.length - 1] = item;
        else result.push(item);
    };
    while (i < e.length && j < add.length) {
        const c = notation.compare(e[i].expr, add[j].expr);
        if (c < 0) {
            emit(e[i]);
            i++;
        } else if (c > 0) {
            emit(add[j]);
            j++;
        } else {
            emit(add[j]); // add 覆盖 existing
            i++;
            j++;
        }
    }
    while (i < e.length) {
        emit(e[i]);
        i++;
    }
    while (j < add.length) {
        emit(add[j]);
        j++;
    }
    return result;
}

/**
 * 在已展开的树中定位表达式 x 的宿主节点：
 * - 若存在值等于 x 的节点，返回该节点（调用方直接写入 analysis）。
 * - 否则返回包含 x 的区间 (左邻, expr) 的最深已展开节点（调用方挂载 pending）。
 * 超出树区间（低于最小根或高于最大根）返回 null。
 */
function locate_host<T>(root: TreeNode<T>, x: T, notation: NotationDefinition<T>): TreeNode<T> | null {
    if (root.children.length === 0) return null;
    const top = root.children[0]; // 降序：首个子为最大
    const bottom = root.children[root.children.length - 1]; // 末个子为最小
    if (notation.compare(x, bottom.expr) < 0) return null; // 低于树底
    if (notation.compare(x, top.expr) > 0) return null; // 高于树顶

    let node: TreeNode<T> = root;
    while (true) {
        let target: TreeNode<T> | null = null;
        for (const child of node.children) {
            // children 降序：找"最小且 > x"的子（即最后一个 > x 的）
            const c = notation.compare(child.expr, x);
            if (c > 0) {
                target = child;
            } else if (c === 0) {
                return child; // 等于某子 → attach
            } else {
                break; // 之后的子更小
            }
        }
        if (target) {
            node = target;
            continue;
        }
        return node; // x 大于所有子 → 挂在 node 上
    }
}

/**
 * 展开某节点区间中的全部挂载条目：排干该节点的桶（反复 expand_item, tier 0,
 * 一次一个 FS 项，经 expand_single 分派），直到桶清空；非标准数据触发
 * generate_fs 抛异常时以 max_find_fs 兜底停止。随后递归子节点，完全物化区间。
 */
export function expand_pending_node<T>(
    node: TreeNode<T>,
    notation: NotationDefinition<T>,
    variant: string,
    max_find_fs: number = 10,
): void {
    // 记录本次排干产出的所有节点：节点为最小子时首次展开经 append_sibling
    // 产出的是兄弟节点（不在 node.children 中），必须一并收集再递归。
    const created_list: TreeNode<T>[] = [];
    while (node.pending_items && node.pending_items.length > 0) {
        let created: TreeNode<T> | undefined;
        try {
            created = expand_item(node, notation, variant, 0, max_find_fs);
        } catch {
            break; // 非标准数据, max_fs 兜底
        }
        if (!created) break;
        created_list.push(created);
    }
    for (const created of created_list) {
        expand_pending_node(created, notation, variant, max_find_fs);
    }
}

/** 展开全部挂载条目（对整个树，等价于把惰性导入完全物化）。 */
export function expand_all_pending<T>(
    root: TreeNode<T>,
    notation: NotationDefinition<T>,
    variant: string,
    max_find_fs: number = 10,
): void {
    for (const child of root.children) {
        expand_pending_node(child, notation, variant, max_find_fs);
    }
}

/**
 * 展开式导入（用于查找单个表达式）：沿游标走查并展开树以定位条目，写入 analysis。
 * 展开过程仍会经 expand_single 分派沿途节点的 pending_items。
 * @returns 按 entries 顺序匹配到的节点列表。
 */
export function import_analysis_eager<T>(
    root: TreeNode<T>,
    entries: AnalysisEntry<T>[],
    notation: NotationDefinition<T>,
    variant: string,
    max_find_fs: number = 10,
): TreeNode<T>[] {
    const matched: TreeNode<T>[] = [];
    let node = last_descendant(root);
    let index = 0;

    while (index < entries.length) {
        const cmp = notation.compare(node.expr, entries[index].expr);

        if (cmp === 0) {
            const ed = (node.extraData ??= {}) as TreeNodeExtra;
            if (!Array.isArray(ed.analysis)) ed.analysis = [];
            ed.analysis.length = 0;
            ed.analysis.push(...entries[index].analysis);
            matched.push(node);
            index++;
        } else if (cmp > 0) {
            if (node.fs_state && node.fs_state.index >= max_find_fs) {
                console.log(
                    'import: skipped (max_find_fs reached — possible non-standard expression):',
                    resolve_display(notation.display).plain(entries[index].expr),
                );
                index++;
                continue;
            }
            try {
                const created = expand_item(node, notation, variant, 0, max_find_fs);
                if (!created) {
                    console.log(
                        'import: skipped (expand failed — expression order may be wrong):',
                        resolve_display(notation.display).plain(entries[index].expr),
                    );
                    index++;
                    continue;
                }
                node = created;
            } catch {
                console.log(
                    'import: skipped (max_find_fs reached — possible non-standard expression):',
                    resolve_display(notation.display).plain(entries[index].expr),
                );
                index++;
                continue;
            }
        } else {
            const prev = find_prev(node, 0);
            if (!prev) {
                console.log(
                    'import: skipped (no matching node — contact author if notation implementation is correct):',
                    resolve_display(notation.display).plain(entries[index].expr),
                );
                index++;
                continue;
            }
            node = prev;
        }
    }

    return matched;
}
