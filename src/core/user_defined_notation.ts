import type { NotationCategoryDefinition, NotationDefinition } from '@/notation-definition.ts';
import {
    get_category,
    get_category_children,
    get_notation,
    init_generator,
    notify_change,
    register_category,
    register_notation,
    unregister_item,
} from '@/core/registry.ts';
import type { UserScript } from '@/core/settings.ts';

// ============ Types ============

type CollectedItem =
    { kind: 'category'; def: NotationCategoryDefinition } | { kind: 'notation'; def: NotationDefinition<any> };

// ============ Module-level state ============

const user_registered_ids: Set<string> = new Set();
const script_warnings: Map<string, string[]> = new Map(); // file_name → failed_ids
const script_notation_ids: Map<number, string[]> = new Map(); // user_scripts 下标 → 该脚本注册的记号 id
const active_script_items: Map<number, CollectedItem[]> = new Map();

// ============ Collect (dry-run register) ============

function collect_from(code: string): CollectedItem[] {
    const collected: CollectedItem[] = [];

    function fake_register_notation(def: NotationDefinition<any>) {
        collected.push({ kind: 'notation', def });
    }

    function fake_register_category(def: NotationCategoryDefinition) {
        collected.push({ kind: 'category', def });
    }

    // eslint-disable-next-line no-new-func
    const fn = new Function('register_notation', 'register_category', code);
    fn(fake_register_notation, fake_register_category);

    return collected;
}

// ============ Topological sort ============
// 稳定拓扑排序：仅在有依赖（parent_id / category_id）时调整顺序，其余保持原相对顺序。
// 依赖满足后，立即将暂存项按原序插入，确保先依赖的项不晚于后依赖的同类项。

function get_parent_id(item: CollectedItem): string | undefined {
    return item.kind === 'category' ? item.def.parent_id : item.def.category_id;
}

function topological_sort(items: CollectedItem[]): CollectedItem[] {
    const result: CollectedItem[] = [];
    const cat_ids = new Set<string>();
    const placed = new Set<string>();

    for (const item of items) {
        if (item.kind === 'category') cat_ids.add(item.def.id);
    }

    function dep_ready(id: string | undefined): boolean {
        return !id || !cat_ids.has(id) || placed.has(id);
    }

    const deferred: CollectedItem[] = [];

    function flush_deferred(): void {
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < deferred.length; i++) {
                if (dep_ready(get_parent_id(deferred[i]))) {
                    const item = deferred.splice(i, 1)[0];
                    result.push(item);
                    if (item.kind === 'category') placed.add(item.def.id);
                    changed = true;
                    i--;
                }
            }
        }
    }

    for (const item of items) {
        if (dep_ready(get_parent_id(item))) {
            result.push(item);
            if (item.kind === 'category') placed.add(item.def.id);
            flush_deferred(); // 刚放入的 category 可能解锁暂存项
        } else {
            deferred.push(item);
        }
    }

    // 剩余无法满足依赖的项追加到末尾
    result.push(...deferred);
    return result;
}

function validate_collected_item(item: CollectedItem): string[] {
    const def = item.def as any;
    const errors: string[] = [];
    if (!def || typeof def !== 'object') return [`${item.kind} must be an object.`];
    if (typeof def.id !== 'string' || def.id.trim() === '') errors.push(`${item.kind} must provide a non-empty id.`);
    if (typeof def.name !== 'string' && (!def.name || typeof def.name.id !== 'string')) {
        errors.push(`${item.kind} '${def.id}' needs a name.`);
    }
    if (item.kind === 'notation') {
        if (typeof def.display !== 'function' && (!def.display || typeof def.display.plain !== 'function')) {
            errors.push(`Notation '${def.id}' needs display or display.plain.`);
        }
        for (const field of ['is_limit', 'compare', 'FS', 'init']) {
            if (typeof def[field] !== 'function') errors.push(`Notation '${def.id}' needs ${field}().`);
        }
        if (typeof def.init === 'function') {
            try {
                if (!Array.isArray(def.init())) errors.push(`Notation '${def.id}' init() must return an array.`);
            } catch (error) {
                errors.push(`Notation '${def.id}' init() failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    } else if (def.generator) {
        if (!Number.isSafeInteger(def.generator.start) || !Number.isSafeInteger(def.generator.initial)) {
            errors.push(`Generator category '${def.id}' needs safe integer start and initial values.`);
        }
        if (def.generator.initial < def.generator.start) {
            errors.push(`Generator category '${def.id}' has initial below start.`);
        }
        if (typeof def.generator.create !== 'function') errors.push(`Generator category '${def.id}' needs create().`);
    }
    return errors;
}

function remove_active_items(): void {
    const ids = [...user_registered_ids].reverse();
    for (const id of ids) unregister_item(id);
    user_registered_ids.clear();
    active_script_items.clear();
    script_notation_ids.clear();
}

function register_items(items: CollectedItem[], source_index: Map<CollectedItem, number>): void {
    for (const item of items) {
        if (item.kind === 'category') {
            register_category(item.def);
            user_registered_ids.add(item.def.id);
            const index = source_index.get(item);
            if (item.def.generator) {
                init_generator(item.def);
                for (const child of get_category_children(item.def.id)) {
                    user_registered_ids.add(child.id);
                    add_script_notation(index, child.id);
                }
            }
            if (index !== undefined) {
                const list = active_script_items.get(index) ?? [];
                list.push(item);
                active_script_items.set(index, list);
            }
        } else {
            register_notation(item.def);
            user_registered_ids.add(item.def.id);
            const index = source_index.get(item);
            add_script_notation(index, item.def.id);
            if (index !== undefined) {
                const list = active_script_items.get(index) ?? [];
                list.push(item);
                active_script_items.set(index, list);
            }
        }
    }
}

function candidate_errors(items: CollectedItem[]): Map<CollectedItem, string[]> {
    const errors = new Map<CollectedItem, string[]>();
    const seen = new Map<string, CollectedItem>();
    const candidate_categories = new Set<string>();
    for (const item of items) {
        const id = item.def.id;
        const previous = seen.get(id);
        if (previous) {
            const list = errors.get(item) ?? [];
            list.push(`Duplicate registration id '${id}'.`);
            errors.set(item, list);
        } else {
            seen.set(id, item);
        }
        if (item.kind === 'category') candidate_categories.add(id);
    }
    for (const item of items) {
        const list = errors.get(item) ?? [];
        list.push(...validate_collected_item(item));
        const parent = item.kind === 'category' ? item.def.parent_id : item.def.category_id;
        if (parent && !candidate_categories.has(parent) && !get_category(parent)) {
            list.push(`Category '${parent}' is not registered.`);
        }
        if (item.kind === 'notation' && item.def.category_id && get_category(item.def.category_id)?.generator) {
            list.push(`Notation '${item.def.id}' cannot be registered directly under generator category '${item.def.category_id}'.`);
        }
        const occupied_by_builtin =
            !user_registered_ids.has(item.def.id) && (get_notation(item.def.id) !== undefined || get_category(item.def.id) !== undefined);
        if (occupied_by_builtin) list.push(`Registration id '${item.def.id}' is already used by the application.`);
        if (list.length > 0) errors.set(item, list);
    }
    return errors;
}

// ============ Reload ============

export interface ReloadResult {
    script_warnings: Map<string, string[]>;
}

export function reload_all(scripts: UserScript[]): ReloadResult {
    const previous_items = new Map(active_script_items);
    const previous_warnings = new Map(script_warnings);
    const previous_notation_ids = new Map(script_notation_ids);

    // 1. Collect from all enabled scripts in order
    const all_collected: CollectedItem[] = [];
    const source_index = new Map<CollectedItem, number>(); // item → user_scripts 下标
    const per_script_failures = new Map<string, string[]>();

    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        if (!script.enabled) continue;
        try {
            const items = collect_from(script.code);
            if (items.length === 0) throw new Error('Source did not register a notation or category.');
            for (const item of items) {
                all_collected.push(item);
                source_index.set(item, i);
            }
        } catch (e: any) {
            const failures = per_script_failures.get(script.file_name) ?? [];
            failures.push(e.message ?? String(e));
            per_script_failures.set(script.file_name, failures);
        }
    }

    // 2. Validate the complete candidate before touching live registrations.
    const sorted = topological_sort(all_collected);
    const validation = candidate_errors(sorted);
    for (const [item, failures] of validation) {
        const index = source_index.get(item);
        const file_name = index === undefined ? 'unknown' : scripts[index].file_name;
        const list = per_script_failures.get(file_name) ?? [];
        list.push(...failures);
        per_script_failures.set(file_name, list);
    }

    if (per_script_failures.size > 0) {
        script_warnings.clear();
        for (const [file_name, failures] of per_script_failures) script_warnings.set(file_name, failures);
        return { script_warnings: new Map(script_warnings) };
    }

    // 3. Replace all local registrations as one registry operation.
    remove_active_items();
    try {
        register_items(sorted, source_index);
    } catch (error) {
        remove_active_items();
        try {
            const old_items = [...previous_items.values()].flat();
            const old_index = new Map<CollectedItem, number>();
            for (const [index, items] of previous_items) for (const item of items) old_index.set(item, index);
            register_items(topological_sort(old_items), old_index);
        } catch (rollback_error) {
            console.error('Failed to roll back local notation registrations.', rollback_error);
        }
        script_warnings.clear();
        for (const [file_name, failures] of previous_warnings) script_warnings.set(file_name, failures);
        script_notation_ids.clear();
        for (const [index, ids] of previous_notation_ids) script_notation_ids.set(index, ids);
        const file_name = scripts.find((script) => script.enabled)?.file_name ?? 'unknown';
        const failures = script_warnings.get(file_name) ?? [];
        failures.push(error instanceof Error ? error.message : String(error));
        script_warnings.set(file_name, failures);
        return { script_warnings: new Map(script_warnings) };
    }

    script_warnings.clear();
    notify_change();
    return { script_warnings: new Map() };
}

export function get_script_warnings(): Map<string, string[]> {
    return new Map(script_warnings);
}

function add_script_notation(index: number | undefined, id: string): void {
    if (index === undefined) return;
    const list = script_notation_ids.get(index) ?? [];
    list.push(id);
    script_notation_ids.set(index, list);
}

export function get_script_notation_ids(index: number): string[] {
    return script_notation_ids.get(index) ?? [];
}
