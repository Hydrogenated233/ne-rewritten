import { NotationCategoryDefinition, NotationDefinition, resolve_display } from '@/notation-definition.ts';
import type { InitVariantDef } from '@/core/settings.ts';
import { index_of_first } from '@/utils.ts';

// ========== RegisterError ==========

export class RegisterError extends Error {
    readonly id: string;

    constructor(id: string, message?: string) {
        super(message ?? `Item '${id}' is already registered.`);
        this.name = 'RegisterError';
        this.id = id;
    }
}

// ========== Category registry ==========

const category_defs = new Map<string, NotationCategoryDefinition>();
const root_items: { kind: 'category' | 'notation'; id: string }[] = [];
const category_items = new Map<string, { kind: 'category' | 'notation'; id: string }[]>();

/**
 * 向容器列表(category/root)插入条目; after_id 给定时插入到该锚点之后(须在同一列表)。
 * 锚点不存在或不在同一列表 → 追加到末尾。
 */
function add_item(cat_id: string | undefined, kind: 'category' | 'notation', id: string, after_id?: string): void {
    const list = cat_id ? (category_items.get(cat_id) ?? []) : root_items;
    const item = { kind, id };
    if (after_id !== undefined) {
        const idx = list.findIndex((x) => x.id === after_id);
        if (idx !== -1) {
            list.splice(idx + 1, 0, item);
            if (cat_id && !category_items.has(cat_id)) {
                category_items.set(cat_id, list);
            }
            return;
        }
    }
    list.push(item);
    if (cat_id && !category_items.has(cat_id)) {
        category_items.set(cat_id, list);
    }
}

export function register_category(cat: NotationCategoryDefinition): void {
    if (category_defs.has(cat.id) || map.has(cat.id)) {
        throw new RegisterError(cat.id, `Category '${cat.id}' conflicts with an existing item.`);
    }
    if (cat.parent_id !== undefined && !category_defs.has(cat.parent_id)) {
        throw new RegisterError(cat.id, `Parent category '${cat.parent_id}' not found for '${cat.id}'.`);
    }
    category_defs.set(cat.id, cat);
    add_item(cat.parent_id, 'category', cat.id);
    // generator 分类: 注册定义后立即水合其下属成员(init_generator 并入 register_category)。
    // 前提: 所有注册发生在 set_generator_state 之后(main.ts 时序保证), 否则持久化计数会丢。
    if (cat.generator) {
        if (!gen_state_ready) {
            console.warn(
                `register_category: category '${cat.id}' has a generator but set_generator_state() was not called ` +
                    'before registration; persisted generator progress may be lost.',
            );
        }
        register_generated_members(cat);
    }
}

export function get_category(id: string): NotationCategoryDefinition | undefined {
    return category_defs.get(id);
}

export function get_root_items(): { kind: 'category' | 'notation'; id: string }[] {
    return root_items;
}

export function get_category_children(id: string): { kind: 'category' | 'notation'; id: string }[] {
    return category_items.get(id) ?? [];
}

export function get_category_ancestors(category_id: string): string[] {
    const ancestors: string[] = [];
    let current: string | undefined = category_id;
    while (current) {
        ancestors.unshift(current);
        const cat = category_defs.get(current);
        current = cat?.parent_id;
    }
    return ancestors;
}

// ========== Notation registry ==========

const map = new Map<string, NotationDefinition<any>>();

/**
 * 内部注册：不校验 generator 限制(供 generator 水合、变体注册等内部路径使用)。
 * after_id 给定时, 插入到容器列表中该锚点记号之后(须同一容器)。
 */
function _register_notation<T>(notation: NotationDefinition<T>, after_id?: string): void {
    if (notation.category_id !== undefined && !category_defs.has(notation.category_id)) {
        throw new RegisterError(
            notation.id,
            `Category '${notation.category_id}' not found for notation '${notation.id}'.`,
        );
    }
    if (category_defs.has(notation.id)) {
        throw new RegisterError(
            notation.id,
            `A category with id '${notation.id}' already exists; cannot register as notation.`,
        );
    }
    if (map.has(notation.id)) {
        throw new RegisterError(notation.id, `Notation '${notation.id}' is already registered.`);
    }
    map.set(notation.id, notation);
    add_item(notation.category_id, 'notation', notation.id, after_id);
    // 注册后立即水合该记号可能存在的初始变体(幂等; 变体注册递归到此会对非 base 的 id no-op)。
    ensure_variants(notation.id);
}

/**
 * 注册记号。original_id 给定时, 插入到同一容器列表中该记号之后(用于让派生记号与源记号紧邻)。
 * generator 分类的下属成员不允许直接注册(应由 register_category 自动水合), 变体等内部派生走 _register_notation。
 */
export function register_notation<T>(notation: NotationDefinition<T>, original_id?: string): void {
    if (notation.category_id !== undefined) {
        const cat = category_defs.get(notation.category_id);
        if (cat?.generator) {
            throw new RegisterError(
                notation.id,
                `Cannot directly register '${notation.id}' under generator category '${cat.id}'. ` +
                    `Generator members are hydrated by register_category; other derived notations use the internal path.`,
            );
        }
    }
    _register_notation(notation, original_id);
}

export function get_notation(id: string): NotationDefinition<unknown> | undefined {
    return map.get(id);
}

export function list_notations(): NotationDefinition<unknown>[] {
    return Array.from(map.values());
}

/** 原始注销: 仅从注册表移除单个记号(变体注销与 base 级联的底层)。 */
function unregister_notation_raw(id: string): void {
    const notation = map.get(id);
    if (!notation) return;
    map.delete(id);
    const list = notation.category_id ? (category_items.get(notation.category_id) ?? root_items) : root_items;
    const idx = list.findIndex((item) => item.id === id);
    if (idx !== -1) list.splice(idx, 1);
}

export function unregister_notation(id: string): string[] {
    // 变体本身: 仅注销(def 是否删除由 remove_init_variant 决定), 不触发级联。
    if (variant_base_of.has(id)) {
        unregister_notation_raw(id);
        return [id];
    }
    const notation = map.get(id);
    if (!notation) return [];
    // base: 先卸载其已注册变体(defs 保留, base 重新注册时自动重生)
    const entries = variant_state.get(id);
    if (entries) {
        for (const entry of entries) {
            const vid = variant_id_of(id, entry.seq);
            if (map.has(vid)) unregister_notation_raw(vid);
        }
    }
    unregister_notation_raw(id);
    return [id];
}

export function unregister_category(id: string): string[] {
    const cat = category_defs.get(id);
    if (!cat) return [];
    const removed: string[] = [];

    // recursively unregister children
    const children = category_items.get(id) ?? [];
    for (const child of children) {
        if (child.kind === 'category') {
            removed.push(...unregister_category(child.id));
        } else {
            removed.push(...unregister_notation(child.id));
        }
    }

    category_defs.delete(id);
    category_items.delete(id);

    // remove from parent's child list
    const parent_list = cat.parent_id ? (category_items.get(cat.parent_id) ?? root_items) : root_items;
    const idx = parent_list.findIndex((item) => item.id === id);
    if (idx !== -1) parent_list.splice(idx, 1);

    removed.unshift(id);
    return removed;
}

export function unregister_item(id: string): string[] {
    if (category_defs.has(id)) return unregister_category(id);
    if (map.has(id)) return unregister_notation(id);
    return [];
}

// ========== Generator ==========

let gen_state: Record<string, number> = {};

/** 是否已注入持久化的 generator state(boot 时 set_generator_state 置 true)。 */
let gen_state_ready = false;

/** 由外部(main.ts)在 settings 就绪后、一切注册之前调用, 注入持久化的 state。 */
export function set_generator_state(state: Record<string, number>): void {
    gen_state = state;
    gen_state_ready = true;
}

export function get_generator_state(): Record<string, number> {
    return gen_state;
}

// Generator 变更监听器（供 UI 层订阅）
type Listener = () => void;
const change_listeners = new Set<Listener>();

export function on_registry_change(listener: Listener): void {
    change_listeners.add(listener);
}

export function remove_registry_change_listener(listener: Listener): void {
    change_listeners.delete(listener);
}

export function notify_change(): void {
    for (const listener of change_listeners) {
        listener();
    }
}

export function is_extra_generated(id: string): boolean {
    const notation = get_notation(id);
    if (!notation?.category_id) return false;
    const cat = get_category(notation.category_id);
    if (!cat?.generator) return false;
    const items = get_category_children(notation.category_id);
    const idx = index_of_first(items, (item) => item.id === id);
    if (idx === -1) return false;
    return idx >= cat.generator.initial - cat.generator.start + 1;
}

/** 内部: 注册 generator 分类当前计数下的全部成员。init_generator 已并入 register_category, 不再对外暴露。 */
function register_generated_members(cat: NotationCategoryDefinition): void {
    const gen = cat.generator;
    if (!gen) return;
    const cur = gen_state[cat.id] ?? gen.initial;
    for (let n = gen.start; n <= cur; n++) {
        _register_notation(gen.create(n));
    }
    gen_state[cat.id] = cur;
}

export function generator_current(cat_id: string): number {
    const cat = category_defs.get(cat_id);
    if (!cat?.generator) return 0;
    return gen_state[cat_id] ?? cat.generator.initial;
}

export function generator_can_increment(cat_id: string): boolean {
    const cat = category_defs.get(cat_id);
    return cat?.generator !== undefined;
}

export function generator_can_decrement(cat_id: string): boolean {
    const cat = category_defs.get(cat_id);
    if (!cat?.generator) return false;
    return generator_current(cat_id) > cat.generator.initial;
}

export function generator_increment(cat_id: string): string | null {
    const cat = category_defs.get(cat_id);
    if (!cat?.generator) return null;
    const cur = gen_state[cat_id] ?? cat.generator.initial;
    const next_n = cur + 1;
    const notation = cat.generator.create(next_n);
    _register_notation(notation);
    gen_state[cat_id] = next_n;
    notify_change();
    return notation.id;
}

export function generator_decrement(cat_id: string): void {
    const cat = category_defs.get(cat_id);
    if (!cat?.generator) return;
    const cur = gen_state[cat_id] ?? cat.generator.initial;
    if (cur <= cat.generator.initial) return;
    // 从注册表中移除最后一个记号（不删除内存中的树和 localStorage 分析数据）
    const items = get_category_children(cat_id);
    const last_id = items.length > 0 ? items[items.length - 1].id : undefined;
    if (last_id) unregister_notation(last_id);
    gen_state[cat_id] = cur - 1;
    notify_change();
}

// ========== Init variants(初始变体) ==========
// 变体 = "base 记号 + 用户自定义初始列表"派生的独立记号(方案 A: 合成 NotationDefinition 并注册)。
// 注册域并入本文件: 表 + 水合/注销都收敛在 _register_notation / unregister_notation 两个咽喉。
// 持久化: Settings.variant_state 只是镜像, 经 set_variant_state / get_variant_state_snapshot 同步(流同 generator_state)。
// 变体 id = `${base_id}$${seq}`(不透明, 不反解; `$` 避开现有 id 字符集)。
// 删除: 仅注销 + 删 def, 不清理 localStorage/trees/设置条目(纯 core 语义, 编号复用由 seq 回填 + 用户处置残留)。

interface VariantEntry {
    base_id: string;
    seq: number;
    init: string[];
}

const variant_state = new Map<string, VariantEntry[]>(); // base_id -> entries(seq 升序)
const variant_base_of = new Map<string, { base_id: string; seq: number }>(); // variant_id -> meta

function variant_id_of(base_id: string, seq: number): string {
    return base_id + '$' + seq;
}

function rebuild_variant_index(): void {
    variant_base_of.clear();
    for (const [base_id, entries] of variant_state) {
        for (const entry of entries) {
            variant_base_of.set(variant_id_of(base_id, entry.seq), { base_id, seq: entry.seq });
        }
    }
}

export function is_init_variant(id: string): boolean {
    return variant_base_of.has(id);
}

export function get_init_variant_meta(id: string): { base_id: string; seq: number } | undefined {
    return variant_base_of.get(id);
}

export function list_init_variant_ids(base_id: string): string[] {
    const entries = variant_state.get(base_id);
    if (!entries) return [];
    return entries.map((entry) => variant_id_of(base_id, entry.seq));
}

export function list_init_variants(base_id: string): InitVariantDef[] {
    const entries = variant_state.get(base_id);
    if (!entries) return [];
    return entries.map((entry) => ({ seq: entry.seq, init: entry.init.slice() }));
}

/** boot: 从 settings 采纳持久化定义(镜像 generator_state 的 set_generator_state)。 */
export function set_variant_state(state: Record<string, InitVariantDef[]>): void {
    variant_state.clear();
    for (const base_id of Object.keys(state)) {
        const list = state[base_id];
        if (!Array.isArray(list)) continue;
        const entries: VariantEntry[] = [];
        for (const e of list) {
            if (e && typeof e.seq === 'number' && Number.isFinite(e.seq) && e.seq >= 1 && Array.isArray(e.init)) {
                entries.push({ base_id, seq: e.seq, init: e.init.map(String) });
            }
        }
        entries.sort((a, b) => a.seq - b.seq);
        if (entries.length > 0) variant_state.set(base_id, entries);
    }
    rebuild_variant_index();
    // 为已注册的 base 立即水合(正常 boot 时序下 base 尚未注册, 水合随其后的注册自动触发)
    for (const base_id of variant_state.keys()) ensure_variants(base_id);
}

/** 供 main.ts 的 on_registry_change 回写 settings(持久化镜像)。 */
export function get_variant_state_snapshot(): Record<string, InitVariantDef[]> {
    const result: Record<string, InitVariantDef[]> = {};
    for (const [base_id, entries] of variant_state) {
        result[base_id] = entries.map((entry) => ({ seq: entry.seq, init: entry.init.slice() }));
    }
    return result;
}

/** 解析 base 主显示 from_display; 失败返回 null。 */
function parse_init_list(base: NotationDefinition<any>, strings: string[]): any[] | null {
    const from_display = resolve_display(base.display).from_display;
    if (!from_display) return null;
    const exprs: any[] = [];
    for (const s of strings) {
        try {
            exprs.push(from_display(s));
        } catch {
            return null;
        }
    }
    // 初始列表须严格递减
    for (let i = 1; i < exprs.length; i++) {
        if (!(base.compare(exprs[i - 1], exprs[i]) > 0)) return null;
    }
    return exprs;
}

function build_init_variant_definition<T>(base: NotationDefinition<T>, id: string, parsed: T[]): NotationDefinition<T> {
    const def: NotationDefinition<T> = {
        ...base,
        id,
        // 标签(含 "(variant N)" 后缀)由导航在渲染期拼接, 此处沿用 base 的名称字段
        name: base.name,
        simple_name: base.simple_name,
        init: () => parsed.slice(),
    };
    return def;
}

/** 为已注册的 base 注册其全部(尚未注册的)变体; 幂等。 */
function ensure_variants(base_id: string): void {
    const entries = variant_state.get(base_id);
    if (!entries || entries.length === 0) return;
    const base = map.get(base_id);
    if (!base) return; // base 未注册 → defs 保留, 待 base 注册时水合
    // generator 分类的成员暂不支持变体(导航/计数语义复杂), 有历史 defs 则跳过并告警
    if (base.category_id && category_defs.get(base.category_id)?.generator) {
        console.warn(`init_variant: base '${base_id}' is a generator member; its variants are skipped.`);
        return;
    }
    let anchor = base_id;
    for (const entry of entries) {
        const id = variant_id_of(base_id, entry.seq);
        if (map.has(id)) {
            anchor = id; // 已注册(幂等)
            continue;
        }
        const parsed = parse_init_list(base, entry.init);
        if (!parsed) {
            console.warn(`init_variant: skip '${id}' (parse or strict-decreasing check failed).`);
            continue;
        }
        try {
            _register_notation(build_init_variant_definition(base, id, parsed), anchor);
        } catch (err) {
            console.warn(`init_variant: register '${id}' failed.`, err);
            continue;
        }
        anchor = id;
    }
}

export interface InitVariantCreateResult {
    ok: boolean;
    id?: string;
    error?: 'unknown-base' | 'no-from-display' | 'generator-base' | 'parse' | 'id-conflict';
}

/** 新建变体: 编号回填该 base 的最小空缺 seq。base 须已注册且不在 generator 分类。 */
export function create_init_variant(base_id: string, init_strings: string[]): InitVariantCreateResult {
    const base = map.get(base_id);
    if (!base) return { ok: false, error: 'unknown-base' };
    if (base.category_id && category_defs.get(base.category_id)?.generator) {
        return { ok: false, error: 'generator-base' };
    }
    if (!resolve_display(base.display).from_display) return { ok: false, error: 'no-from-display' };
    const parsed = parse_init_list(base, init_strings);
    if (!parsed) return { ok: false, error: 'parse' };

    const entries = variant_state.get(base_id) ?? [];
    let seq = 1;
    while (entries.some((e) => e.seq === seq)) seq++;
    const id = variant_id_of(base_id, seq);
    if (map.has(id) || variant_base_of.has(id)) return { ok: false, error: 'id-conflict' };

    const entry: VariantEntry = { base_id, seq, init: init_strings.slice() };
    entries.push(entry);
    entries.sort((a, b) => a.seq - b.seq);
    variant_state.set(base_id, entries);
    rebuild_variant_index();

    // 锚点 = base(或其最后一个已注册变体), 保证导航紧邻且 seq 递增
    let anchor = base_id;
    for (const e of entries) {
        const vid = variant_id_of(base_id, e.seq);
        if (map.has(vid)) anchor = vid;
    }
    try {
        _register_notation(build_init_variant_definition(base, id, parsed), anchor);
    } catch (err) {
        console.warn(`init_variant: register '${id}' failed; removing def.`, err);
        variant_state.set(
            base_id,
            entries.filter((e) => e.seq !== seq),
        );
        rebuild_variant_index();
        return { ok: false, error: 'id-conflict' };
    }
    notify_change();
    return { ok: true, id };
}

/** 删除变体(仅注销 + 删 def; 不做存储/设置清理)。 */
export function remove_init_variant(id: string): void {
    const meta = variant_base_of.get(id);
    if (!meta) return;
    const entries = variant_state.get(meta.base_id);
    if (!entries) return;
    variant_state.set(
        meta.base_id,
        entries.filter((entry) => entry.seq !== meta.seq),
    );
    rebuild_variant_index();
    unregister_notation_raw(id); // 已注册才实际注销; 未注册(dormant)则仅为 no-op
    notify_change();
}
