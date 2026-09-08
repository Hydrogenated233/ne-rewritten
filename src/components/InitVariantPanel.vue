<script setup lang="ts" generic="T">
import { computed, inject, nextTick, onMounted, ref } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { resolve_display, resolve_display_name, resolve_name } from '@/notation-definition.ts';
import { create_init_variant, get_notation, list_init_variants } from '@/core/registry.ts';
import FloatingPanel from '@/components/FloatingPanel.vue';
import ModalDialog from '@/components/ModalDialog.vue';

const props = defineProps<{
    /** 目标 base 记号 id(变体页点击时传其 base)。 */
    base_id: string;
    /** 默认等价表示 id(null = 原记号), 须有 from_display, 由调用方传入当前页面等价。 */
    equiv_id?: string | null;
}>();

const emit = defineEmits<{
    created: [id: string];
    close: [];
}>();

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;

const base = computed(() => get_notation(props.base_id));

const base_label = computed(() => {
    const n = base.value;
    if (!n) return props.base_id;
    const spec = settings.notation_name_mode === 'simple' ? (n.simple_name ?? n.name) : n.name;
    return resolve_name(spec, t) ?? props.base_id;
});

/** 等价表示选项: 仅含有 from_display 者。'' 哨兵 = 原记号。 */
const equiv_options = computed(() => {
    const n = base.value;
    if (!n) return [] as { id: string; label: string }[];
    const options: { id: string; label: string }[] = [];
    const orig = resolve_display(n.display);
    if (orig.from_display) {
        options.push({ id: '', label: resolve_display_name(n.display, t) ?? t('equiv.default') });
    }
    if (n.display_equiv) {
        for (const id of Object.keys(n.display_equiv)) {
            const spec = n.display_equiv[id];
            if (resolve_display(spec).from_display) {
                options.push({ id, label: resolve_display_name(spec, t) ?? id });
            }
        }
    }
    return options;
});

const chosen_equiv = ref<string>('');
if (props.equiv_id !== undefined && equiv_options.value.some((o) => o.id === (props.equiv_id ?? ''))) {
    chosen_equiv.value = props.equiv_id ?? '';
}

function chosen_from_display(): ((s: string) => T) | undefined {
    const n = base.value;
    if (!n) return undefined;
    if (chosen_equiv.value !== '' && n.display_equiv?.[chosen_equiv.value]) {
        return resolve_display(n.display_equiv[chosen_equiv.value]).from_display as (s: string) => T;
    }
    return resolve_display(n.display).from_display as ((s: string) => T) | undefined;
}

interface RowItem {
    id: number;
    text: string;
}

let row_seq = 1;
const rows = ref<RowItem[]>([{ id: row_seq++, text: '' }]);
const selected = ref(0);
const note = ref('');
const show_dup = ref(false);

const input_refs = ref<HTMLInputElement[]>([]);
onMounted(() => focus_row(0));

function set_input_ref(el: unknown, i: number) {
    input_refs.value[i] = el as HTMLInputElement;
}

/** 聚焦某一行输入框(下一帧 DOM 更新后), 并同步选中行。 */
function focus_row(i: number) {
    selected.value = i;
    nextTick(() => input_refs.value[i]?.focus());
}

function row_texts(): string[] {
    return rows.value.map((r) => r.text);
}

function rebuild_rows(texts: string[]) {
    rows.value = texts.map((text) => ({ id: row_seq++, text }));
}

interface ParsedRow {
    text: string;
    expr: T | null; // null = 解析失败
    error: boolean; // from_display 抛错(空串也照常解析; 空串是否为合法表达式取决于所选 from_display)
}

function parse_rows(): ParsedRow[] {
    const from = chosen_from_display();
    return row_texts().map((text) => {
        if (!from) return { text, expr: null, error: true };
        try {
            return { text, expr: from(text), error: false };
        } catch {
            return { text, expr: null, error: true };
        }
    });
}

const parsed = computed(() => parse_rows());
const confirm_enabled = computed(() => rows.value.length > 0 && parsed.value.every((p) => !p.error));

function compare_exprs(a: T, b: T): number {
    const n = base.value;
    if (!n) return 0;
    return n.compare(a, b);
}

function distinct_exprs(list: ParsedRow[]): ParsedRow[] {
    const result: ParsedRow[] = [];
    for (const row of list) {
        if (row.expr === null) continue;
        const dup = result.some((r) => r.expr !== null && compare_exprs(r.expr!, row.expr!) === 0);
        if (!dup) result.push(row);
    }
    return result;
}

function add_row() {
    rows.value.push({ id: row_seq++, text: '' });
    selected.value = rows.value.length - 1;
    note.value = '';
    nextTick(() => input_refs.value[selected.value]?.focus());
}

/** 回车: 在当前行下方新增一行并把光标移入新行。 */
function add_row_after(i: number) {
    rows.value.splice(i + 1, 0, { id: row_seq++, text: '' });
    focus_row(i + 1);
    note.value = '';
}

function on_row_keydown(e: KeyboardEvent, i: number) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        add_row_after(i);
    } else if (e.key === 'ArrowDown' && !e.shiftKey) {
        e.preventDefault();
        if (i < rows.value.length - 1) focus_row(i + 1);
    } else if (e.key === 'ArrowUp' && !e.shiftKey) {
        e.preventDefault();
        if (i > 0) focus_row(i - 1);
    } else if (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        // 当前行为空时按 Delete 删除该行(有内容时保留默认的删字符行为)
        if (rows.value[i].text === '') {
            e.preventDefault();
            delete_row_at(i);
        }
    }
}

/** 删除指定行并把焦点移到邻近行。 */
function delete_row_at(i: number) {
    if (rows.value.length === 0) return;
    rows.value.splice(i, 1);
    selected.value = Math.min(i, Math.max(0, rows.value.length - 1));
    note.value = '';
    nextTick(() => input_refs.value[selected.value]?.focus());
}

function delete_selected() {
    if (rows.value.length === 0) return;
    rows.value.splice(selected.value, 1);
    if (selected.value >= rows.value.length) selected.value = Math.max(0, rows.value.length - 1);
    note.value = '';
}

function edit_selected() {
    const el = input_refs.value[selected.value];
    if (el) el.focus();
}

function move_selected(offset: number) {
    const target = selected.value + offset;
    if (target < 0 || target >= rows.value.length) return;
    const [row] = rows.value.splice(selected.value, 1);
    rows.value.splice(target, 0, row);
    focus_row(target);
    note.value = '';
}

function sort_rows() {
    const list = parse_rows();
    if (list.some((p) => p.error)) {
        note.value = t('variant.parse-fail');
        return;
    }
    if (list.length < 2) return;
    // 降序: 更大者在先(compare(a, b) > 0 表示 a > b); 空串也作为合法表达式参与排序
    try {
        list.sort((a, b) => compare_exprs(b.expr!, a.expr!));
    } catch {
        note.value = t('variant.parse-fail');
        return;
    }
    rebuild_rows(list.map((p) => p.text));
    note.value = '';
}

// ---- 拖拽排序(HTML5) ----
let drag_index = -1;
function on_drag_start(i: number) {
    drag_index = i;
}
function on_drop(i: number) {
    if (drag_index < 0 || drag_index === i) return;
    const arr = [...rows.value];
    const [moved] = arr.splice(drag_index, 1);
    arr.splice(i, 0, moved);
    rows.value = arr;
    selected.value = i;
    drag_index = -1;
    note.value = '';
}

/** 下一个将被回填的 seq(预览用)。 */
const next_seq = computed(() => {
    const existing = list_init_variants(props.base_id);
    let seq = 1;
    while (existing.some((e) => e.seq === seq)) seq++;
    return seq;
});

const will_create_label = computed(() => base_label.value + ' (' + t('variant.label', { n: String(next_seq.value) }) + ')');

function do_dedupe(): void {
    const list = parse_rows();
    const kept = distinct_exprs(list);
    rebuild_rows(kept.map((p) => p.text));
    selected.value = Math.min(selected.value, Math.max(0, rows.value.length - 1));
    note.value = '';
}

function confirm_duplicate(accepted: boolean) {
    show_dup.value = false;
    if (!accepted) return;
    do_dedupe();
    attempt_create();
}

function attempt_create() {
    try {
        create_from_rows();
    } catch {
        note.value = t('variant.parse-fail');
    }
}

function create_from_rows() {
    const list = parse_rows();
    if (list.some((p) => p.error)) {
        note.value = t('variant.parse-fail');
        return;
    }
    if (list.length === 0) return;
    // 重复检查
    if (distinct_exprs(list).length !== list.length) {
        show_dup.value = true;
        return;
    }
    // 严格递减(空串表达也参与)
    for (let i = 1; i < list.length; i++) {
        if (compare_exprs(list[i - 1].expr!, list[i].expr!) <= 0) {
            note.value = t('variant.need-descending');
            return;
        }
    }
    const n = base.value;
    if (!n) return;
    const plain_orig = resolve_display(n.display).plain;
    const canonical = list.map((p) => plain_orig(p.expr!));
    const result = create_init_variant(props.base_id, canonical);
    if (result.ok && result.id) {
        emit('created', result.id);
        emit('close');
        return;
    }
    note.value = t('variant.parse-fail');
}
</script>

<template>
    <FloatingPanel :show="true" :title="t('variant.panel-title', { base: base_label })" :initial-width="720" :min-width="280" @close="emit('close')">
        <div class="iv-panel">
            <div class="iv-layout">
                <!-- 左: 表达式行(可拖拽/增删改; 回车新增行, 上下键切换行) -->
                <div class="iv-list" @dragover.prevent>
                    <div
                        v-for="(row, i) in rows"
                        :key="row.id"
                        class="iv-row"
                        :class="{ 'iv-row--selected': i === selected, 'iv-row--error': parsed[i]?.error }"
                        draggable="true"
                        @dragstart="on_drag_start(i)"
                        @drop.prevent="on_drop(i)"
                        @click="selected = i"
                    >
                        <span class="iv-row-index">{{ i + 1 }}</span>
                        <input
                            :ref="(el) => set_input_ref(el, i)"
                            v-model="row.text"
                            :aria-label="t('variant.expression-row', { n: String(i + 1) })"
                            class="iv-input"
                            spellcheck="false"
                            @click.stop
                            @focus="selected = i"
                            @keydown="on_row_keydown($event, i)"
                        />
                        <span v-if="parsed[i]?.error" class="iv-row-err" :title="t('variant.parse-fail')">!</span>
                    </div>
                    <div v-if="rows.length === 0" class="iv-empty">{{ t('variant.add-row') }}</div>
                </div>

                <!-- 右: 功能按钮 + 等价切换 -->
                <div class="iv-side">
                    <label class="iv-equiv-label">{{ t('variant.input-equiv') }}</label>
                    <select v-model="chosen_equiv" class="iv-equiv-select">
                        <option v-for="opt in equiv_options" :key="opt.id" :value="opt.id">
                            {{ opt.label }}
                        </option>
                    </select>
                    <button class="iv-btn" @click="add_row">{{ t('variant.add-row') }}</button>
                    <button class="iv-btn" :disabled="rows.length === 0" @click="delete_selected">
                        {{ t('variant.delete-row') }}
                    </button>
                    <button class="iv-btn" :disabled="rows.length === 0" @click="edit_selected">
                        {{ t('variant.edit-row') }}
                    </button>
                    <button class="iv-btn" @click="sort_rows">{{ t('variant.sort') }}</button>
                    <div class="iv-move">
                        <button class="iv-btn" :disabled="selected <= 0" :title="t('variant.move-up')" :aria-label="t('variant.move-up')" @click="move_selected(-1)">↑</button>
                        <button class="iv-btn" :disabled="selected >= rows.length - 1" :title="t('variant.move-down')" :aria-label="t('variant.move-down')" @click="move_selected(1)">↓</button>
                    </div>
                </div>
            </div>

            <div v-if="note" class="iv-note">{{ note }}</div>
            <div class="iv-will-create">{{ t('variant.will-create', { label: will_create_label }) }}</div>

            <div class="iv-foot">
                <button class="iv-btn iv-btn-cancel" @click="emit('close')">
                    {{ t('variant.cancel') }}
                </button>
                <button class="iv-btn iv-btn-success" :disabled="!confirm_enabled" @click="attempt_create">
                    {{ t('variant.confirm-create') }}
                </button>
            </div>
        </div>
    </FloatingPanel>
        <ModalDialog :show="show_dup" :title="t('variant.dup-title')" @close="show_dup = false">
                <p class="iv-dup-message">{{ t('variant.dup-message') }}</p>
                <div class="iv-foot">
                    <button class="iv-btn iv-btn-cancel" @click="confirm_duplicate(false)">
                        {{ t('variant.cancel') }}
                    </button>
                    <button class="iv-btn iv-btn-success" @click="confirm_duplicate(true)">
                        {{ t('variant.confirm-create') }}
                    </button>
                </div>
        </ModalDialog>
</template>

<style scoped>
.iv-panel {
    max-height: calc(85vh - 60px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 10px;
}
.iv-layout {
    display: flex;
    gap: 12px;
    min-height: 240px;
}
.iv-list {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.iv-row {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 2px 4px;
    cursor: grab;
}
.iv-row--selected {
    background: var(--color-primary-bg, #daf);
}
.iv-row--error .iv-input {
    color: var(--color-danger, #c00);
    border-color: var(--color-danger, #c00);
}
.iv-row-index {
    width: 22px;
    text-align: right;
    color: var(--color-text-muted, #999);
    font-size: 12px;
}
.iv-input {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: 1px solid var(--color-border-light, #ddd);
    border-radius: 3px;
    padding: 2px 4px;
    font: inherit;
}
.iv-row-err {
    color: var(--color-danger, #c00);
    font-weight: bold;
    cursor: help;
}
.iv-empty {
    color: var(--color-text-muted, #999);
    padding: 8px;
}
.iv-side {
    width: 150px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.iv-equiv-label {
    font-size: 12px;
    color: var(--color-text-secondary, #888);
}
.iv-equiv-select {
    font: inherit;
    margin-bottom: 4px;
}
.iv-btn {
    font: inherit;
    padding: 3px 8px;
    cursor: pointer;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    background: var(--color-bg, #fff);
}
.iv-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.iv-btn-success {
    background: var(--color-success, #080);
    color: #fff;
}
.iv-btn-cancel {
}
.iv-note {
    color: var(--color-danger, #c00);
    font-size: 13px;
}
.iv-will-create {
    overflow-wrap: anywhere;
    color: var(--color-text-secondary, #888);
    font-size: 12px;
}
.iv-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
.iv-dup-message {
    margin: 0;
}
.iv-move { display: flex; gap: 6px; }
@media (max-width: 540px) {
    .iv-layout { flex-direction: column; min-height: 0; }
    .iv-list { min-height: 120px; max-height: 35vh; flex: auto; }
    .iv-side { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .iv-equiv-select { min-width: 0; }
}
</style>
