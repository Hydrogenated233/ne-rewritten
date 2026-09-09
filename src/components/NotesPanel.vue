<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, shallowRef, triggerRef, watch } from 'vue';
import { Undo2, Redo2, Rows2, Columns2, Rows3, Columns3, Eraser, RefreshCw } from '@lucide/vue';
import FloatingPanel from './FloatingPanel.vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { note_tables } from '@/composables/use_note_tables.ts';
import { APP_STORAGE_KEYS } from '@/core/storage_keys.ts';
import {
    clear_cells,
    column_label,
    delete_note_axis,
    insert_note_axis,
    put_cells,
    range_rows,
    selected_range,
    type CellPosition,
    type NoteRows,
    type NoteSession,
} from '@/core/note_table.ts';
import { note_clipboard_html, note_clipboard_text, parse_note_html, parse_note_text } from '@/core/note_clipboard.ts';

const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();
const session = shallowRef<NoteSession>();
const grid = ref<HTMLElement>();
const editor = ref<HTMLTextAreaElement>();
const anchor = ref<CellPosition>({ row: 0, col: 0 });
const active = ref<CellPosition>({ row: 0, col: 0 });
const editing = ref<CellPosition | null>(null);
const error = ref('');
const rows = computed(() => session.value?.rows ?? []);
const range = computed(() => selected_range(anchor.value, active.value));
const address = (cell: CellPosition) => column_label(cell.col) + (cell.row + 1);
const selection_label = computed(() => {
    const { top, bottom, left, right } = range.value;
    const start = address({ row: top, col: left }),
        end = address({ row: bottom, col: right });
    return start === end ? start : `${start}:${end}`;
});
let dragging = false;

function refresh(): void {
    triggerRef(session);
}
function focus_cell(): void {
    void nextTick(() => {
        const cell = grid.value?.querySelector<HTMLElement>(
            `[data-note-cell="${active.value.row}:${active.value.col}"]`,
        );
        cell?.focus({ preventScroll: true });
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
}
function clamp_selection(): void {
    const clamp = ({ row, col }: CellPosition) => ({
        row: Math.max(0, Math.min(row, rows.value.length - 1)),
        col: Math.max(0, Math.min(col, rows.value[0].length - 1)),
    });
    active.value = clamp(active.value);
    anchor.value = clamp(anchor.value);
}
function finish_edit(cancel = false): void {
    if (!editing.value) return;
    session.value?.finish_edit(cancel);
    editing.value = null;
    refresh();
}
function select(cell: CellPosition, extend = false, focus = true): void {
    finish_edit();
    if (!extend) anchor.value = { ...cell };
    active.value = { ...cell };
    if (focus) focus_cell();
}
function run_change(action: (values: NoteRows) => NoteRows): void {
    if (!session.value) return;
    finish_edit();
    try {
        session.value.change(action(rows.value));
        error.value = '';
        refresh();
        clamp_selection();
    } catch (cause) {
        error.value = cause instanceof RangeError ? 'notes.too-large' : 'notes.invalid-paste';
    }
    focus_cell();
}
function add_axis(axis: 'row' | 'col'): void {
    run_change((values) => insert_note_axis(values, axis, axis === 'row' ? range.value.bottom : range.value.right));
}
function remove_axis(axis: 'row' | 'col'): void {
    run_change((values) => delete_note_axis(values, axis, range.value));
}
function clear(): void {
    run_change((values) => clear_cells(values, range.value));
}
function undo(redo = false): void {
    finish_edit();
    if (redo) session.value?.redo();
    else session.value?.undo();
    error.value = '';
    refresh();
    clamp_selection();
    focus_cell();
}
function select_all(): void {
    finish_edit();
    anchor.value = { row: 0, col: 0 };
    active.value = { row: rows.value.length - 1, col: rows.value[0].length - 1 };
    focus_cell();
}
function select_axis(axis: 'row' | 'col', index: number): void {
    finish_edit();
    anchor.value = axis === 'row' ? { row: index, col: 0 } : { row: 0, col: index };
    active.value =
        axis === 'row' ? { row: index, col: rows.value[0].length - 1 } : { row: rows.value.length - 1, col: index };
    focus_cell();
}
function is_selected(row: number, col: number): boolean {
    return row >= range.value.top && row <= range.value.bottom && col >= range.value.left && col <= range.value.right;
}
function is_active(row: number, col: number): boolean {
    return row === active.value.row && col === active.value.col;
}
function is_editing(row: number, col: number): boolean {
    return row === editing.value?.row && col === editing.value?.col;
}
function pointer_down(event: PointerEvent, row: number, col: number): void {
    if (event.button !== 0 || (editing.value && event.target === editor.value)) return;
    select({ row, col }, event.shiftKey);
    dragging = event.pointerType !== 'touch';
    if (event.pointerType !== 'touch') event.preventDefault();
}
function pointer_enter(event: PointerEvent, row: number, col: number): void {
    if (dragging && event.buttons & 1) select({ row, col }, true, false);
}
function pointer_up(): void {
    if (!dragging) return;
    dragging = false;
    focus_cell();
}
function begin_edit(initial?: string): void {
    const current = session.value;
    if (!current || !current.valid) return;
    anchor.value = { ...active.value };
    current.begin_edit();
    editing.value = { ...active.value };
    if (initial !== undefined) current.edit_cell(editing.value, initial);
    refresh();
    void nextTick(() => {
        editor.value?.focus();
        const length = editor.value?.value.length ?? 0;
        editor.value?.setSelectionRange(length, length);
    });
}
function edit_input(event: Event): void {
    if (!editing.value) return;
    session.value?.edit_cell(editing.value, (event.target as HTMLTextAreaElement).value);
    refresh();
}
function move(key: string, shift: boolean): void {
    finish_edit();
    let { row, col } = active.value;
    if (key === 'Tab') {
        col += shift ? -1 : 1;
        if (col < 0 && row > 0) {
            col = rows.value[0].length - 1;
            row--;
        }
        if (col >= rows.value[0].length) {
            col = 0;
            row++;
        }
    } else if (key === 'Enter') row += shift ? -1 : 1;
    else if (key === 'ArrowUp') row--;
    else if (key === 'ArrowDown') row++;
    else if (key === 'ArrowLeft') col--;
    else if (key === 'ArrowRight') col++;
    else if (key === 'Home') col = 0;
    else if (key === 'End') col = rows.value[0].length - 1;
    if (row === rows.value.length && (key === 'Tab' || key === 'Enter')) {
        try {
            session.value?.change(insert_note_axis(rows.value, 'row', row - 1));
            refresh();
        } catch {
            error.value = 'notes.too-large';
            row--;
        }
    }
    row = Math.max(0, Math.min(row, rows.value.length - 1));
    col = Math.max(0, Math.min(col, rows.value[0].length - 1));
    select({ row, col }, shift && key !== 'Tab' && key !== 'Enter');
}
function history_key(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
        event.preventDefault();
        undo(key === 'y' || event.shiftKey);
        return true;
    }
    return false;
}
function on_keydown(event: KeyboardEvent): void {
    if (!session.value || event.isComposing) return;
    if (history_key(event)) return;
    if (event.key === 'Escape') {
        ui.show_notes.value = false;
        return;
    }
    if ((event.target as HTMLElement).closest('button')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        select_all();
    } else if (['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        move(event.key, event.shiftKey);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        clear();
    } else if (event.key === 'F2') {
        event.preventDefault();
        begin_edit();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        begin_edit(event.key);
    }
}
function editor_keydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (history_key(event)) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        finish_edit(true);
        focus_cell();
    } else if (event.key === 'Enter' && event.altKey) {
        event.preventDefault();
        const input = editor.value!;
        input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
        session.value?.edit_cell(editing.value!, input.value);
        refresh();
    } else if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        move(event.key, event.shiftKey);
    }
}
function on_copy(event: ClipboardEvent, cut = false): void {
    if (editing.value || !event.clipboardData || !session.value) return;
    const selected = range_rows(rows.value, range.value);
    event.clipboardData.setData('text/plain', note_clipboard_text(selected));
    event.clipboardData.setData('text/html', note_clipboard_html(selected));
    event.preventDefault();
    if (cut) clear();
}
function on_paste(event: ClipboardEvent): void {
    if (editing.value || !event.clipboardData || !session.value) return;
    const clipboard = event.clipboardData;
    if (!clipboard.types.includes('text/plain') && !clipboard.types.includes('text/html')) return;
    event.preventDefault();
    try {
        const html = clipboard.getData('text/html');
        const block = (html && parse_note_html(html)) || parse_note_text(clipboard.getData('text/plain'));
        const start = { row: range.value.top, col: range.value.left };
        run_change((values) => put_cells(values, start, block));
        if (!error.value) {
            anchor.value = start;
            active.value = { row: start.row + block.length - 1, col: start.col + block[0].length - 1 };
            focus_cell();
        }
    } catch (cause) {
        error.value = cause instanceof RangeError ? 'notes.too-large' : 'notes.invalid-paste';
    }
}
function retry_save(): void {
    session.value?.save();
    refresh();
}
function load_note(): void {
    finish_edit();
    error.value = '';
    const id = save_load.notation.value?.id;
    if (!id) {
        session.value = undefined;
        return;
    }
    try {
        const next = note_tables.open(id);
        if (next !== session.value) {
            session.value = next;
            anchor.value = { row: 0, col: 0 };
            active.value = { row: 0, col: 0 };
        }
    } catch (cause) {
        session.value = undefined;
        error.value = cause instanceof Error ? cause.message : 'notes.load-error';
    }
}
watch(
    [() => ui.show_notes.value, save_load.notation],
    ([visible]) => {
        if (visible) load_note();
        else finish_edit();
    },
    { immediate: true, flush: 'sync' },
);
onMounted(() => window.addEventListener('pointerup', pointer_up));
onUnmounted(() => {
    finish_edit();
    window.removeEventListener('pointerup', pointer_up);
});
</script>

<template>
    <FloatingPanel
        :show="ui.show_notes.value"
        :title="t('toolbar.notes')"
        :storage-key="APP_STORAGE_KEYS.notesPanelGeometry"
        :initial-width="640"
        :initial-height="380"
        :min-width="300"
        :min-height="220"
        resizable
        @close="ui.show_notes.value = false"
    >
        <div class="note-editor" @keydown.stop="on_keydown">
            <div v-if="session" class="note-toolbar" role="toolbar" :aria-label="t('notes.tools')">
                <button
                    type="button"
                    :title="t('notes.undo')"
                    :aria-label="t('notes.undo')"
                    :disabled="!session.can_undo"
                    @click="undo()"
                >
                    <Undo2 :size="17" />
                </button>
                <button
                    type="button"
                    :title="t('notes.redo')"
                    :aria-label="t('notes.redo')"
                    :disabled="!session.can_redo"
                    @click="undo(true)"
                >
                    <Redo2 :size="17" />
                </button>
                <span class="note-divider" />
                <button
                    type="button"
                    :title="t('notes.add-row')"
                    :aria-label="t('notes.add-row')"
                    @click="add_axis('row')"
                >
                    <Rows2 :size="17" /><span class="note-icon-mark">+</span>
                </button>
                <button
                    type="button"
                    :title="t('notes.add-col')"
                    :aria-label="t('notes.add-col')"
                    @click="add_axis('col')"
                >
                    <Columns2 :size="17" /><span class="note-icon-mark">+</span>
                </button>
                <button
                    type="button"
                    :title="t('notes.delete-row')"
                    :aria-label="t('notes.delete-row')"
                    @click="remove_axis('row')"
                >
                    <Rows3 :size="17" /><span class="note-icon-mark">-</span>
                </button>
                <button
                    type="button"
                    :title="t('notes.delete-col')"
                    :aria-label="t('notes.delete-col')"
                    @click="remove_axis('col')"
                >
                    <Columns3 :size="17" /><span class="note-icon-mark">-</span>
                </button>
                <span class="note-divider" />
                <button type="button" :title="t('notes.clear')" :aria-label="t('notes.clear')" @click="clear">
                    <Eraser :size="17" />
                </button>
            </div>
            <div v-if="error" class="note-error" role="alert">{{ t(error) }}</div>
            <div v-if="session?.save_failed" class="note-error" role="alert">
                <span>{{ t('notes.save-error') }}</span>
                <button type="button" :title="t('notes.retry')" :aria-label="t('notes.retry')" @click="retry_save">
                    <RefreshCw :size="16" />
                </button>
            </div>
            <div v-if="session" class="note-grid-scroll">
                <table
                    ref="grid"
                    class="note-grid"
                    role="grid"
                    :aria-label="t('notes.sheet')"
                    :aria-rowcount="rows.length + 1"
                    :aria-colcount="rows[0].length + 1"
                    aria-multiselectable="true"
                    :style="{ width: `${40 + rows[0].length * 144}px` }"
                    @copy.stop="on_copy($event)"
                    @cut.stop="on_copy($event, true)"
                    @paste.stop="on_paste"
                >
                    <colgroup>
                        <col class="note-index-col" />
                        <col v-for="(_, c) in rows[0]" :key="c" class="note-value-col" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th class="note-corner">
                                <button
                                    type="button"
                                    :title="t('notes.select-all')"
                                    :aria-label="t('notes.select-all')"
                                    @click="select_all"
                                >
                                    #
                                </button>
                            </th>
                            <th v-for="(_, c) in rows[0]" :key="c" scope="col" role="columnheader">
                                <button
                                    type="button"
                                    :aria-label="t('notes.select-col', { col: column_label(c) })"
                                    @click="select_axis('col', c)"
                                >
                                    {{ column_label(c) }}
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(row, r) in rows" :key="r">
                            <th scope="row" role="rowheader">
                                <button
                                    type="button"
                                    :aria-label="t('notes.select-row', { row: String(r + 1) })"
                                    @click="select_axis('row', r)"
                                >
                                    {{ r + 1 }}
                                </button>
                            </th>
                            <td
                                v-for="(value, c) in row"
                                :key="c"
                                role="gridcell"
                                :data-note-cell="`${r}:${c}`"
                                :aria-label="address({ row: r, col: c })"
                                :aria-selected="is_selected(r, c)"
                                :tabindex="is_active(r, c) ? 0 : -1"
                                :class="{ 'is-selected': is_selected(r, c), 'is-active': is_active(r, c) }"
                                :title="value"
                                @pointerdown="pointer_down($event, r, c)"
                                @pointerenter="pointer_enter($event, r, c)"
                                @dblclick="begin_edit()"
                            >
                                <textarea
                                    v-if="is_editing(r, c)"
                                    :ref="
                                        (el) => {
                                            editor = el as HTMLTextAreaElement;
                                        }
                                    "
                                    :aria-label="t('notes.edit-cell', { cell: address({ row: r, col: c }) })"
                                    :value="value"
                                    class="note-cell-input"
                                    spellcheck="false"
                                    @input="edit_input"
                                    @keydown.stop="editor_keydown"
                                    @blur="finish_edit()"
                                />
                                <div v-else class="note-cell-text">{{ value }}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="session" class="note-status">
                <span>{{ selection_label }}</span
                ><span>{{ rows.length }} × {{ rows[0].length }}</span>
            </div>
        </div>
    </FloatingPanel>
</template>

<style scoped>
.note-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    min-height: 0;
    min-width: 0;
}
.note-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex: 0 0 auto;
    align-items: center;
}
.note-toolbar button,
.note-error button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 28px;
    height: 28px;
    padding: 0;
    flex: 0 0 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
}
.note-toolbar button:hover:enabled,
.note-error button:hover {
    background: var(--color-bg-hover);
}
.note-toolbar button:disabled {
    opacity: 0.35;
    cursor: default;
}
.note-toolbar button:focus-visible,
.note-grid button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
}
.note-divider {
    width: 1px;
    height: 20px;
    background: var(--color-border);
    margin: 0 3px;
}
.note-icon-mark {
    position: absolute;
    right: 0;
    bottom: 0;
    font: bold 11px/10px monospace;
    background: var(--color-bg-secondary);
}
.note-error {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-danger);
    overflow-wrap: anywhere;
}
.note-error span {
    flex: 1;
    min-width: 0;
}
.note-grid-scroll {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    border: 1px solid var(--color-border);
}
.note-grid {
    table-layout: fixed;
    border-spacing: 0;
    border-collapse: separate;
    font-size: 13px;
}
.note-index-col {
    width: 40px;
}
.note-value-col {
    width: 144px;
}
.note-grid th,
.note-grid td {
    padding: 0;
    height: 32px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    position: relative;
}
.note-grid th {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    font-weight: normal;
    user-select: none;
}
.note-grid th button {
    display: block;
    width: 100%;
    height: 31px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.note-grid thead th {
    position: sticky;
    top: 0;
    z-index: 3;
}
.note-grid tbody th {
    position: sticky;
    left: 0;
    z-index: 2;
}
.note-grid .note-corner {
    left: 0;
    z-index: 4;
}
.note-grid td {
    background: var(--color-bg);
    cursor: cell;
    outline: none;
}
.note-grid td.is-selected {
    background: var(--color-accent-bg);
}
.note-grid td.is-active {
    box-shadow: inset 0 0 0 2px var(--color-accent);
}
.note-cell-text {
    height: 31px;
    padding: 0 6px;
    line-height: 31px;
    overflow: hidden;
    white-space: pre;
    text-overflow: ellipsis;
    user-select: none;
}
.note-cell-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 4px 6px;
    box-sizing: border-box;
    border: 2px solid var(--color-accent);
    border-radius: 0;
    resize: none;
    font: inherit;
    line-height: 20px;
    background: var(--color-bg);
    color: var(--color-text);
    outline: none;
}
.note-status {
    display: flex;
    justify-content: space-between;
    flex: 0 0 auto;
    min-height: 16px;
    font-size: 11px;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
}
</style>
