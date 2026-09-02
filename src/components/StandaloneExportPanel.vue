<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { build_standalone, download_standalone, estimate_standalone_bytes } from '@/core/standalone_export.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import {
    count_notation_items,
    get_category,
    get_category_children,
    get_notation,
    get_root_items,
    list_notations,
} from '@/core/registry.ts';
import { resolve_name } from '@/notation-definition.ts';
import ModalDialog from './ModalDialog.vue';

type BuiltinTreeNode =
    | { kind: 'folder'; key: string; label: string; children: BuiltinTreeNode[]; atomic?: boolean }
    | { kind: 'notation'; key: string; id: string; label: string };

type BuiltinTreeRow = BuiltinTreeNode & {
    depth: number;
    expanded?: boolean;
    notationIds?: string[];
    selectedCount?: number;
    logicalCount?: number;
    logicalSelectedCount?: number;
};

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const props = defineProps<{ inline?: boolean }>();
const show = ref(false);
const include_data = ref(true);
const title = ref('Notation Explorer');
const file_name = ref('notation-explorer-standalone.html');
const selected_ids = ref<string[]>([]);
const selected_builtin_ids = ref<string[]>([]);
const expanded_builtin_folders = ref<Record<string, boolean>>({});
const busy = ref(false);
const error = ref('');
const status = ref('');
const files = ref<LocalNotationFile[]>([]);

const selectable_files = computed(() =>
    files.value.filter((file) => file.enabled && file.trusted && file.sourceRevision === file.loadedRevision),
);
const local_notation_ids = computed(() => new Set(files.value.flatMap((file) => file.manifest.notations)));
const selectable_builtins = computed(() =>
    list_notations().filter((notation) => !local_notation_ids.value.has(notation.id)),
);
const selected_count = computed(() => selected_ids.value.length);
const selected_builtin_count = computed(() => count_notation_items(selected_builtin_ids.value));
const selectable_builtin_count = computed(() =>
    count_notation_items(selectable_builtins.value.map((notation) => notation.id)),
);

function builtin_label(id: string): string {
    const item = get_notation(id) ?? get_category(id);
    return item ? (resolve_name(item.simple_name ?? item.name, t) ?? id) : id;
}

function make_builtin_category(id: string, available: Set<string>, key = `category:${id}`): BuiltinTreeNode | null {
    const category = get_category(id);
    const children = get_category_children(id)
        .map((item) => {
            if (item.kind === 'notation') {
                return available.has(item.id)
                    ? ({
                          kind: 'notation',
                          key: `notation:${item.id}`,
                          id: item.id,
                          label: builtin_label(item.id),
                      } as const)
                    : null;
            }
            return make_builtin_category(item.id, available, `${key}/${item.id}`);
        })
        .filter((item): item is BuiltinTreeNode => item !== null);
    return children.length > 0
        ? { kind: 'folder', key, label: builtin_label(id), children, atomic: category?.generator !== undefined }
        : null;
}

const builtin_tree = computed<BuiltinTreeNode[]>(() => {
    const available = new Set(selectable_builtins.value.map((notation) => notation.id));
    const roots: BuiltinTreeNode[] = [];
    const uncategorized: BuiltinTreeNode[] = [];
    for (const item of get_root_items()) {
        if (item.kind === 'notation') {
            if (available.has(item.id)) {
                uncategorized.push({
                    kind: 'notation',
                    key: `notation:${item.id}`,
                    id: item.id,
                    label: builtin_label(item.id),
                });
            }
            continue;
        }
        const category = make_builtin_category(item.id, available);
        if (category) roots.push(category);
    }
    if (uncategorized.length > 0) {
        roots.unshift({
            kind: 'folder',
            key: 'folder:uncategorized',
            label: t('standalone-export.other-notations'),
            children: uncategorized,
        });
    }
    return roots;
});

function collect_builtin_ids(node: BuiltinTreeNode): string[] {
    if (node.kind === 'notation') return [node.id];
    return node.children.flatMap(collect_builtin_ids);
}

const builtin_rows = computed<BuiltinTreeRow[]>(() => {
    const rows: BuiltinTreeRow[] = [];
    const selected = new Set(selected_builtin_ids.value);
    function walk(nodes: BuiltinTreeNode[], depth: number): void {
        for (const node of nodes) {
            if (node.kind === 'notation') {
                rows.push({ ...node, depth });
                continue;
            }
            const notation_ids = collect_builtin_ids(node);
            const expanded = !node.atomic && expanded_builtin_folders.value[node.key] === true;
            rows.push({
                ...node,
                depth,
                expanded,
                notationIds: notation_ids,
                selectedCount: notation_ids.filter((id) => selected.has(id)).length,
                logicalCount: count_notation_items(notation_ids),
                logicalSelectedCount: count_notation_items(notation_ids.filter((id) => selected.has(id))),
            });
            if (expanded) walk(node.children, depth + 1);
        }
    }
    walk(builtin_tree.value, 0);
    return rows;
});

function refresh(): void {
    files.value = runtime.listFiles();
    const available = new Set(selectable_files.value.map((file) => file.id));
    selected_ids.value = selected_ids.value.filter((id) => available.has(id));
    if (selected_ids.value.length === 0) selected_ids.value = [...available];
    const available_builtin = new Set(selectable_builtins.value.map((notation) => notation.id));
    selected_builtin_ids.value = selected_builtin_ids.value.filter((id) => available_builtin.has(id));
    if (selected_builtin_ids.value.length === 0) selected_builtin_ids.value = [...available_builtin];
}

function open(): void {
    refresh();
    error.value = '';
    status.value = '';
    show.value = true;
}

function close(): void {
    if (!busy.value) show.value = false;
}

function toggle(id: string): void {
    selected_ids.value = selected_ids.value.includes(id)
        ? selected_ids.value.filter((value) => value !== id)
        : [...selected_ids.value, id];
}

function select_all(): void {
    selected_ids.value = selectable_files.value.map((file) => file.id);
}

function clear_selection(): void {
    selected_ids.value = [];
}

function select_all_builtins(): void {
    selected_builtin_ids.value = selectable_builtins.value.map((notation) => notation.id);
}

function clear_builtin_selection(): void {
    selected_builtin_ids.value = [];
}

function toggle_builtin(id: string): void {
    selected_builtin_ids.value = selected_builtin_ids.value.includes(id)
        ? selected_builtin_ids.value.filter((value) => value !== id)
        : [...selected_builtin_ids.value, id];
}

function toggle_builtin_folder(key: string): void {
    expanded_builtin_folders.value[key] = !expanded_builtin_folders.value[key];
}

function toggle_builtin_group(ids: string[]): void {
    const selected = new Set(selected_builtin_ids.value);
    if (ids.every((id) => selected.has(id))) ids.forEach((id) => selected.delete(id));
    else ids.forEach((id) => selected.add(id));
    selected_builtin_ids.value = [...selected];
}

async function export_html(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    status.value = t('standalone-export.reading');
    try {
        const selected = selectable_files.value.filter((file) => selected_ids.value.includes(file.id));
        const { select_builtin_notation_sources } = await import('@/core/builtin_notation_sources.ts');
        const builtin_source_files = select_builtin_notation_sources(selected_builtin_ids.value);
        const result = await build_standalone({
            localFiles: selected,
            builtinNotationIds: selected_builtin_ids.value,
            builtinSourceFiles: builtin_source_files,
            includeData: include_data.value,
            title: title.value,
            fileName: file_name.value,
        });
        download_standalone(result);
        status.value = `${t('standalone-export.ready')} (${Math.ceil(estimate_standalone_bytes(result) / 1024)} KiB)`;
    } catch (value) {
        error.value = value instanceof Error ? value.message : String(value);
        status.value = '';
    } finally {
        busy.value = false;
    }
}

watch(show, (visible) => {
    if (visible) refresh();
});

onMounted(() => {
    if (props.inline) refresh();
});

defineExpose({ open });
</script>

<template>
    <button v-if="!inline" type="button" @mousedown="open">{{ t('standalone-export.open') }}</button>
    <ModalDialog
        :show="inline || show"
        :inline="inline"
        :title="inline ? undefined : t('standalone-export.title')"
        @close="close"
    >
        <div class="standalone-export" :class="{ 'standalone-export--inline': inline }">
            <p v-if="!inline" class="standalone-export__hint">{{ t('standalone-export.description') }}</p>
            <div class="standalone-export__fields">
                <label>
                    {{ t('standalone-export.title-field') }}
                    <input v-model="title" type="text" />
                </label>
                <label>
                    {{ t('standalone-export.file-name') }}
                    <input v-model="file_name" type="text" spellcheck="false" />
                </label>
            </div>
            <div class="standalone-export__selection">
                <div class="standalone-export__selection-header">
                    <strong>{{ t('standalone-export.local-files') }}</strong>
                    <span>{{ selected_count }}/{{ selectable_files.length }}</span>
                    <span class="standalone-export__selection-actions">
                        <button type="button" @click="select_all">{{ t('standalone-export.select-all') }}</button>
                        <button type="button" @click="clear_selection">{{ t('standalone-export.clear') }}</button>
                    </span>
                </div>
                <label v-for="file in selectable_files" :key="file.id" class="standalone-export__file">
                    <input :checked="selected_ids.includes(file.id)" type="checkbox" @change="toggle(file.id)" />
                    <span>{{ file.name }}</span>
                </label>
                <p v-if="selectable_files.length === 0" class="standalone-export__empty">
                    {{ t('standalone-export.no-local-files') }}
                </p>
            </div>
            <div class="standalone-export__selection standalone-export__builtin-selection">
                <div class="standalone-export__selection-header">
                    <strong>{{ t('standalone-export.builtin-notations') }}</strong>
                    <span>{{ selected_builtin_count }}/{{ selectable_builtin_count }}</span>
                    <span class="standalone-export__selection-actions">
                        <button type="button" @click="select_all_builtins">
                            {{ t('standalone-export.select-all') }}
                        </button>
                        <button type="button" @click="clear_builtin_selection">
                            {{ t('standalone-export.clear') }}
                        </button>
                    </span>
                </div>
                <div class="standalone-export__tree" role="tree">
                    <div
                        v-for="row in builtin_rows"
                        :key="row.key"
                        class="standalone-export__tree-row"
                        :style="{ paddingLeft: `${10 + row.depth * 18}px` }"
                    >
                        <template v-if="row.kind === 'folder'">
                            <input
                                :checked="row.selectedCount === row.notationIds?.length"
                                :indeterminate="
                                    row.selectedCount !== 0 && row.selectedCount !== row.notationIds?.length
                                "
                                type="checkbox"
                                :aria-label="row.label"
                                @change="toggle_builtin_group(row.notationIds ?? [])"
                            />
                            <div v-if="row.atomic" class="standalone-export__cluster">
                                <span class="standalone-export__cluster-icon" aria-hidden="true">▦</span>
                                <span class="standalone-export__folder-label">{{ row.label }}</span>
                                <span class="standalone-export__cluster-tag">
                                    {{ t('standalone-export.generated-cluster') }}
                                </span>
                                <span class="standalone-export__folder-count">
                                    {{ row.logicalSelectedCount }}/{{ row.logicalCount }}
                                </span>
                            </div>
                            <button
                                v-else
                                type="button"
                                class="standalone-export__folder"
                                :aria-expanded="row.expanded"
                                @click="toggle_builtin_folder(row.key)"
                            >
                                <span
                                    class="standalone-export__folder-chevron"
                                    :class="{ 'is-expanded': row.expanded }"
                                    aria-hidden="true"
                                ></span>
                                <span class="standalone-export__folder-icon" aria-hidden="true">▰</span>
                                <span class="standalone-export__folder-label">{{ row.label }}</span>
                                <span class="standalone-export__folder-count">
                                    {{ row.logicalSelectedCount }}/{{ row.logicalCount }}
                                </span>
                            </button>
                        </template>
                        <label v-else class="standalone-export__file standalone-export__tree-file">
                            <input
                                :checked="selected_builtin_ids.includes(row.id)"
                                type="checkbox"
                                @change="toggle_builtin(row.id)"
                            />
                            <span>{{ row.label }}</span>
                        </label>
                    </div>
                </div>
            </div>
            <label class="standalone-export__snapshot">
                <input v-model="include_data" type="checkbox" />
                {{ t('standalone-export.include-data') }}
            </label>
            <p class="standalone-export__note">{{ t('standalone-export.builtin-note') }}</p>
            <p v-if="status" class="standalone-export__status" role="status">{{ status }}</p>
            <p v-if="error" class="standalone-export__error" role="alert">{{ error }}</p>
            <div class="standalone-export__actions">
                <button type="button" :disabled="busy" @click="export_html">
                    {{ busy ? t('standalone-export.busy') : t('standalone-export.export') }}
                </button>
                <button v-if="!inline" type="button" :disabled="busy" @click="close">
                    {{ t('standalone-export.cancel') }}
                </button>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.standalone-export {
    min-width: min(560px, 80vw);
    max-width: 720px;
}
.standalone-export--inline {
    min-width: 0;
    max-width: none;
}
.standalone-export__hint,
.standalone-export__note {
    margin: 0 0 12px;
    color: var(--color-text-secondary);
    font-size: 13px;
}
.standalone-export__fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.standalone-export__fields label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--color-text-secondary);
    font-size: 12px;
}
.standalone-export__fields input {
    min-width: 0;
    height: 30px;
    box-sizing: border-box;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
}
.standalone-export__selection {
    margin-top: 14px;
    border: 1px solid var(--color-border-light);
    border-radius: 5px;
}
.standalone-export__selection-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border-light);
    background: var(--color-bg-secondary);
}
.standalone-export__selection-header > span {
    color: var(--color-text-secondary);
    font-size: 12px;
}
.standalone-export__selection-actions {
    margin-left: auto;
    display: inline-flex;
    gap: 4px;
}
.standalone-export__selection-actions button {
    padding: 2px 6px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
}
.standalone-export__file {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    font-size: 13px;
}
.standalone-export__file:hover {
    background: var(--color-bg-hover);
}
.standalone-export__tree {
    padding: 4px 0;
}
.standalone-export__tree-row {
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 5px;
    padding-right: 8px;
    box-sizing: border-box;
}
.standalone-export__tree-row:hover {
    background: var(--color-bg-hover);
}
.standalone-export__folder {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.standalone-export__cluster {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    color: var(--color-text);
}
.standalone-export__cluster-icon {
    flex: 0 0 auto;
    color: var(--color-category);
    font-size: 14px;
}
.standalone-export__cluster-tag {
    flex: 0 0 auto;
    padding: 1px 5px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 10px;
}
.standalone-export__folder-chevron {
    width: 0;
    height: 0;
    flex: 0 0 auto;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 6px solid currentColor;
    color: var(--color-text-secondary);
    transition: transform 0.12s ease;
}
.standalone-export__folder-chevron.is-expanded {
    transform: rotate(90deg);
}
.standalone-export__folder-icon {
    flex: 0 0 auto;
    color: var(--color-category);
}
.standalone-export__folder-label {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 600;
}
.standalone-export__folder-count {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: 400;
}
.standalone-export__tree-file {
    min-width: 0;
    flex: 1;
    padding: 4px 2px;
}
.standalone-export__folder:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
}
.standalone-export__empty {
    margin: 0;
    padding: 12px;
    color: var(--color-text-muted);
    font-size: 13px;
}
.standalone-export__snapshot {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    font-size: 13px;
}
.standalone-export__status {
    margin: 10px 0 0;
    color: var(--color-success);
    font-size: 13px;
}
.standalone-export__error {
    margin: 10px 0 0;
    color: var(--color-danger);
    white-space: pre-wrap;
    font-size: 13px;
}
.standalone-export__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
.standalone-export__actions button {
    min-height: 30px;
    padding: 4px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
}
.standalone-export__actions button:first-child {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
    font-weight: 600;
}
.standalone-export__actions button:disabled {
    cursor: wait;
    opacity: 0.6;
}
@media (max-width: 560px) {
    .standalone-export {
        min-width: 0;
    }
    .standalone-export__fields {
        grid-template-columns: 1fr;
    }
}
</style>
