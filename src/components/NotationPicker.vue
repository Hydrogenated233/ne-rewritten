<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { resolve_name, type NotationDefinition, type NotationCategoryDefinition } from '@/notation-definition.ts';
import {
    generator_can_decrement,
    generator_can_increment,
    generator_current,
    generator_decrement,
    generator_increment,
    get_category,
    get_category_ancestors,
    get_category_children,
    get_notation,
    get_root_items,
    list_notations,
} from '@/core/registry.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';

type Item = { kind: 'category' | 'notation'; id: string };
type FolderNode = {
    kind: 'folder';
    key: string;
    label: string;
    children: TreeNode[];
    categoryId?: string;
    fileId?: string;
};
type NotationNode = { kind: 'notation'; key: string; id: string };
type TreeNode = FolderNode | NotationNode;
type Row = TreeNode & { depth: number; parentKey?: string; expanded?: boolean; count?: number };

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const ui = use_ui_states();
const local_runtime = inject(LOCAL_NOTATION_RUNTIME_KEY, null);

const open = ref(false);
const search = ref('');
const expanded = ref<Record<string, boolean>>({});
const focus_index = ref(-1);
const trigger = ref<HTMLButtonElement>();
const search_input = ref<HTMLInputElement>();
const row_refs = ref<HTMLButtonElement[]>([]);
const registry_revision = ref(0);

function display_name(n: NotationDefinition<unknown> | NotationCategoryDefinition | undefined): string {
    if (!n) return '';
    const simple = 'simple_name' in n ? n.simple_name : undefined;
    if (settings.notation_name_mode === 'simple' && simple) return resolve_name(simple, t) ?? '';
    return resolve_name(n.name, t) ?? '';
}

function item_label(id: string): string {
    return display_name(get_notation(id) ?? get_category(id));
}

function notation_matches(id: string): boolean {
    const n = get_notation(id);
    if (!n) return false;
    if (ui.config_mode.value) return true;
    if (settings.hidden_notations.includes(id)) return false;
    return true;
}

function notation_search_text(id: string): string {
    const n = get_notation(id);
    return [item_label(id), n?.id ?? id].join(' ').toLocaleLowerCase();
}

function category_label(id: string): string {
    return item_label(id) || id;
}

function count_notations(node: TreeNode): number {
    if (node.kind === 'notation') return 1;
    return node.children.reduce((sum, child) => sum + count_notations(child), 0);
}

function make_category(id: string, key = `category:${id}`, excluded_ids = new Set<string>()): FolderNode {
    const children = get_category_children(id)
        .map((item) => make_item(item, excluded_ids))
        .filter((item): item is TreeNode => item !== null);
    return { kind: 'folder', key, label: category_label(id), categoryId: id, children };
}

function make_item(item: Item, excluded_ids = new Set<string>()): TreeNode | null {
    if (item.kind === 'notation') {
        if (excluded_ids.has(item.id)) return null;
        return notation_matches(item.id) ? { kind: 'notation', key: `notation:${item.id}`, id: item.id } : null;
    }
    const folder = make_category(item.id, `category:${item.id}`, excluded_ids);
    return folder.children.length > 0 ? folder : null;
}

function local_file_ids(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const files = local_runtime?.listFiles() ?? [];
    files.forEach((file) => {
        if (!file.enabled || !file.trusted) return;
        result.set(
            file.id,
            (local_runtime?.getNotationIds(file.id) ?? []).filter((id) => notation_matches(id)),
        );
    });
    return result;
}

function build_tree(): TreeNode[] {
    void registry_revision.value;
    const local_ids = new Set([...local_file_ids().values()].flat());
    const roots: TreeNode[] = [];

    const builtin_children =
        settings.nav_mode === 'flat'
            ? list_notations()
                  .filter((notation) => !local_ids.has(notation.id) && notation_matches(notation.id))
                  .map(
                      (notation) =>
                          ({
                              kind: 'notation',
                              key: `notation:${notation.id}`,
                              id: notation.id,
                          }) satisfies NotationNode,
                  )
            : get_root_items()
                  .map((item) => {
                      if (item.kind === 'notation' && local_ids.has(item.id)) return null;
                      if (item.kind === 'category') return make_category(item.id, `category:${item.id}`, local_ids);
                      return notation_matches(item.id)
                          ? ({ kind: 'notation', key: `notation:${item.id}`, id: item.id } satisfies NotationNode)
                          : null;
                  })
                  .filter(
                      (item): item is TreeNode =>
                          item !== null && (item.kind === 'notation' || item.children.length > 0),
                  );
    if (builtin_children.length > 0) {
        roots.push({
            kind: 'folder',
            key: 'folder:builtin',
            label: t('notation-picker.builtin'),
            children: builtin_children,
        });
    }

    const files = local_runtime?.listFiles() ?? [];
    const file_ids = local_file_ids();
    const local_children: TreeNode[] = [];
    files.forEach((file) => {
        if (!file.enabled || !file.trusted) return;
        const ids = file_ids.get(file.id) ?? [];
        if (ids.length === 0) return;
        const by_category = new Map<string, FolderNode>();
        const file_root: FolderNode = {
            kind: 'folder',
            key: `folder:file:${file.id}`,
            label: file.name,
            fileId: file.id,
            children: [],
        };
        for (const id of ids) {
            const notation = get_notation(id);
            if (!notation) continue;
            const ancestors = notation.category_id ? get_category_ancestors(notation.category_id) : [];
            let children = file_root.children;
            let path = `folder:file:${file.id}`;
            for (const category_id of ancestors) {
                path += `/${category_id}`;
                let folder = by_category.get(path);
                if (!folder) {
                    folder = {
                        kind: 'folder',
                        key: path,
                        label: category_label(category_id),
                        categoryId: category_id,
                        children: [],
                    };
                    children.push(folder);
                    by_category.set(path, folder);
                }
                children = folder.children;
            }
            children.push({ kind: 'notation', key: `notation:${id}`, id });
        }
        if (file_root.children.length > 0) local_children.push(file_root);
    });
    if (local_children.length > 0) {
        roots.push({
            kind: 'folder',
            key: 'folder:local',
            label: t('notation-picker.local'),
            children: local_children,
        });
    }
    return roots;
}

function filter_tree(nodes: TreeNode[], query: string): TreeNode[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return nodes;
    return nodes
        .map((node) => {
            if (node.kind === 'notation') return notation_search_text(node.id).includes(normalized) ? node : null;
            const self_matches = node.label.toLocaleLowerCase().includes(normalized);
            const children = self_matches ? node.children : filter_tree(node.children, normalized);
            return children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is TreeNode => node !== null);
}

const tree = computed(() => filter_tree(build_tree(), search.value));

function flatten(nodes: TreeNode[]): Row[] {
    const rows: Row[] = [];
    const searching = search.value.trim().length > 0;
    function walk(items: TreeNode[], depth: number, parentKey?: string) {
        for (const node of items) {
            if (node.kind === 'notation') {
                rows.push({ ...node, depth, parentKey });
                continue;
            }
            const is_expanded = searching || expanded.value[node.key] === true;
            rows.push({ ...node, depth, parentKey, expanded: is_expanded, count: count_notations(node) });
            if (is_expanded) walk(node.children, depth + 1, node.key);
        }
    }
    walk(nodes, 0);
    return rows;
}

const rows = computed(() => flatten(tree.value));
const current_notation = computed(() => get_notation(settings.current_notation_id));
const current_path = computed(() => {
    const n = current_notation.value;
    return n?.category_id ? get_category_ancestors(n.category_id).map(category_label) : [];
});

function open_dropdown() {
    if (open.value) return;
    open.value = true;
    search.value = '';
    focus_index.value = -1;
    for (const key of ancestor_keys_for_current()) expanded.value[key] = true;
    nextTick(() => search_input.value?.focus());
}

function close_dropdown(restore_focus = false) {
    open.value = false;
    focus_index.value = -1;
    if (restore_focus) nextTick(() => trigger.value?.focus());
}

function toggle_dropdown() {
    if (open.value) close_dropdown(false);
    else open_dropdown();
}

function ancestor_keys_for_current(): string[] {
    const n = current_notation.value;
    if (!n) return [];
    const keys = ['folder:builtin'];
    if (n.category_id) {
        let key = 'category:';
        for (const id of get_category_ancestors(n.category_id)) {
            key += id;
            keys.push(key);
            key += '/';
        }
    }
    return keys;
}

function activate(row: Row) {
    if (row.kind === 'folder') {
        expanded.value[row.key] = !row.expanded;
        return;
    }
    settings.current_notation_id = row.id;
    search.value = '';
    close_dropdown(true);
}

function focus_row(index: number) {
    if (rows.value.length === 0) return;
    focus_index.value = Math.max(0, Math.min(index, rows.value.length - 1));
    nextTick(() => row_refs.value[focus_index.value]?.focus());
}

function on_search_keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        focus_row(0);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        close_dropdown(true);
    }
}

function on_row_keydown(event: KeyboardEvent, row: Row, index: number) {
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        focus_row(index + 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (index === 0) search_input.value?.focus();
        else focus_row(index - 1);
    } else if (event.key === 'Home') {
        event.preventDefault();
        focus_row(0);
    } else if (event.key === 'End') {
        event.preventDefault();
        focus_row(rows.value.length - 1);
    } else if (event.key === 'ArrowRight' && row.kind === 'folder') {
        event.preventDefault();
        if (!row.expanded) expanded.value[row.key] = true;
        else focus_row(index + 1);
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (row.kind === 'folder' && row.expanded && !search.value) expanded.value[row.key] = false;
        else if (row.parentKey) {
            const parent = rows.value.findIndex((candidate) => candidate.key === row.parentKey);
            if (parent >= 0) focus_row(parent);
        }
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(row);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        close_dropdown(true);
    }
}

function on_document_mousedown(event: MouseEvent) {
    const target = event.target as Node | null;
    if (open.value && target && !(target as Element).closest?.('.notation-picker')) close_dropdown(false);
}

function on_registry_change() {
    registry_revision.value++;
}

watch(() => ui.registry_notifier.listen(), on_registry_change);
onMounted(() => document.addEventListener('mousedown', on_document_mousedown));
onBeforeUnmount(() => document.removeEventListener('mousedown', on_document_mousedown));

function handle_generator(id: string, direction: 'increment' | 'decrement', event: MouseEvent) {
    event.stopPropagation();
    if (direction === 'increment') generator_increment(id);
    else generator_decrement(id);
    registry_revision.value++;
}
</script>

<template>
    <div class="notation-picker">
        <button
            ref="trigger"
            type="button"
            class="notation-picker__trigger"
            :aria-expanded="open"
            aria-haspopup="dialog"
            @click="toggle_dropdown"
            @keydown.down.prevent="open_dropdown"
            @keydown.enter.prevent="toggle_dropdown"
            @keydown.space.prevent="toggle_dropdown"
        >
            <span class="notation-picker__folder" aria-hidden="true">▰</span>
            <span class="notation-picker__trigger-main">
                <span class="notation-picker__trigger-name">{{
                    display_name(current_notation) || t('notation-tree.empty')
                }}</span>
                <span v-if="current_path.length" class="notation-picker__trigger-path">{{
                    current_path.join(' / ')
                }}</span>
            </span>
            <span class="notation-picker__chevron" aria-hidden="true">⌄</span>
        </button>

        <div v-if="open" class="notation-picker__backdrop" aria-hidden="true"></div>
        <div
            v-if="open"
            class="notation-picker__dropdown"
            role="dialog"
            :aria-label="t('notation-picker.label')"
            @mousedown.stop
            @keydown.esc.stop.prevent="close_dropdown(true)"
        >
            <div class="notation-picker__search-wrap">
                <input
                    ref="search_input"
                    v-model="search"
                    class="notation-picker__search"
                    type="search"
                    role="searchbox"
                    :placeholder="t('notation-picker.search')"
                    @keydown="on_search_keydown"
                />
            </div>
            <div class="notation-picker__options" role="tree">
                <div v-for="(row, index) in rows" :key="row.key" class="notation-picker__line">
                    <button
                        :ref="
                            (el) => {
                                if (el) row_refs[index] = el as HTMLButtonElement;
                            }
                        "
                        type="button"
                        role="treeitem"
                        class="notation-picker__row"
                        :class="{
                            'is-folder': row.kind === 'folder',
                            'is-notation': row.kind === 'notation',
                            'is-expanded': row.kind === 'folder' && row.expanded,
                            selected: row.kind === 'notation' && row.id === settings.current_notation_id,
                        }"
                        :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
                        :aria-level="row.depth + 1"
                        :aria-expanded="row.kind === 'folder' ? row.expanded : undefined"
                        :aria-selected="row.kind === 'notation' ? row.id === settings.current_notation_id : undefined"
                        :tabindex="focus_index === index ? 0 : -1"
                        @mousedown.prevent.stop="activate(row)"
                        @keydown="on_row_keydown($event, row, index)"
                    >
                        <span
                            v-if="row.kind === 'folder'"
                            class="notation-picker__row-chevron"
                            aria-hidden="true"
                        ></span>
                        <span v-else class="notation-picker__row-spacer" aria-hidden="true"></span>
                        <span class="notation-picker__row-label">{{
                            row.kind === 'folder' ? row.label : item_label(row.id)
                        }}</span>
                        <span v-if="row.kind === 'folder'" class="notation-picker__count">{{ row.count }}</span>
                        <span v-else class="notation-picker__id">{{ row.id }}</span>
                    </button>
                    <span
                        v-if="row.kind === 'folder' && row.categoryId && generator_can_increment(row.categoryId)"
                        class="notation-picker__generator"
                    >
                        <button
                            type="button"
                            :disabled="!generator_can_decrement(row.categoryId)"
                            :title="t('notation-picker.generator-remove')"
                            @click="handle_generator(row.categoryId, 'decrement', $event)"
                        >
                            −
                        </button>
                        <output>{{ generator_current(row.categoryId) }}</output>
                        <button
                            type="button"
                            :title="t('notation-picker.generator-add')"
                            @click="handle_generator(row.categoryId, 'increment', $event)"
                        >
                            +
                        </button>
                    </span>
                </div>
                <p v-if="rows.length === 0" class="notation-picker__empty">{{ t('notation-picker.empty') }}</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.notation-picker {
    position: relative;
    z-index: 20;
    margin-bottom: 12px;
}

.notation-picker__trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: min(100%, 520px);
    min-height: 42px;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.notation-picker__trigger:hover {
    border-color: var(--color-accent);
}

.notation-picker__trigger:focus-visible,
.notation-picker__row:focus-visible,
.notation-picker__search:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
}

.notation-picker__folder {
    color: var(--color-category);
    font-size: 16px;
}

.notation-picker__trigger-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
}

.notation-picker__trigger-name {
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.notation-picker__trigger-path {
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.notation-picker__chevron {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: 18px;
    line-height: 1;
}

.notation-picker__backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
}

.notation-picker__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 30;
    width: min(520px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    box-shadow: 0 8px 24px var(--color-shadow);
}

.notation-picker__search-wrap {
    padding: 8px;
    border-bottom: 1px solid var(--color-border-subtle);
}

.notation-picker__search {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
}

.notation-picker__options {
    max-height: min(520px, calc(100vh - 160px));
    overflow-y: auto;
    overscroll-behavior: contain;
}

.notation-picker__line {
    display: flex;
    align-items: stretch;
    min-width: 0;
}

.notation-picker__row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 36px;
    align-items: center;
    gap: 7px;
    padding-top: 6px;
    padding-right: 12px;
    padding-bottom: 6px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.notation-picker__row:hover {
    background: var(--color-accent-bg);
}

.notation-picker__row.is-folder {
    background: var(--color-bg-secondary);
    color: var(--color-text);
    font-weight: 600;
}

.notation-picker__row.selected {
    background: var(--color-accent-bg);
    color: var(--color-accent-active);
    font-weight: 600;
}

.notation-picker__row-chevron {
    width: 0;
    height: 0;
    margin-left: 3px;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 5px solid currentColor;
    transform-origin: 2px 4px;
    transition: transform 0.12s ease;
}

.notation-picker__row.is-expanded .notation-picker__row-chevron {
    transform: rotate(90deg);
}

.notation-picker__row-spacer {
    width: 16px;
}

.notation-picker__row-label {
    min-width: 0;
    overflow-wrap: anywhere;
}

.notation-picker__id,
.notation-picker__count {
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: 400;
    text-align: right;
}

.notation-picker__generator {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px 4px 2px;
    background: var(--color-bg-secondary);
}

.notation-picker__generator button {
    display: inline-grid;
    width: 26px;
    height: 26px;
    place-items: center;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
}

.notation-picker__generator button:hover:not(:disabled) {
    background: var(--color-bg-hover);
}

.notation-picker__generator button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
}

.notation-picker__generator output {
    min-width: 24px;
    color: var(--color-text-secondary);
    font-size: 11px;
    text-align: center;
}

.notation-picker__empty {
    margin: 0;
    padding: 20px 12px;
    color: var(--color-text-secondary);
    text-align: center;
}

@media (max-width: 640px) {
    .notation-picker__trigger {
        width: 100%;
    }

    .notation-picker__dropdown {
        width: calc(100vw - 24px);
    }

    .notation-picker__options {
        max-height: 65vh;
    }
}
</style>
