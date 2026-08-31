<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { get_codemirror, load_codemirror } from '@/composables/use_codemirror.ts';
import { get_script_warnings } from '@/core/user_defined_notation.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import ModalDialog from './ModalDialog.vue';
import TEMPLATE_JS from '@/assets/template.js?raw';

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const ui = use_ui_states();

const files = ref<LocalNotationFile[]>([]);
const active_tab = ui.user_defined_active_tab;
const is_renaming = ref(false);
const rename_input = ref('');
const editor_ref = ref<HTMLDivElement | null>(null);
const show_delete_confirm = ref(false);
const delete_target_id = ref('');
const show_new_dialog = ref(false);
const new_script_name = ref('');
const status_message = ref('');
let editor_view: import('@codemirror/view').EditorView | null = null;
let editor_file_id: string | null = null;

const current_file = computed(() => files.value[active_tab.value]);

// CodeMirror 按需加载: 未加载时用只读 pre 展示代码
const cm_ready = ref(false);
const cm_loading = ref(false);

const code_lines = computed(() => (current_file.value?.source ?? '').split('\n'));

function refresh_files(): void {
    try {
        files.value = runtime.listFiles();
        if (active_tab.value >= files.value.length) active_tab.value = Math.max(0, files.value.length - 1);
    } catch (error) {
        status_message.value = error instanceof Error ? error.message : String(error);
        files.value = [];
    }
}

function set_status(error: unknown): void {
    status_message.value = error instanceof Error ? error.message : String(error);
}

function normalize_name(value: string): string {
    const name = value.trim();
    return /\.js$/i.test(name) ? name : `${name}.js`;
}

async function load_cm_editor(): Promise<void> {
    if (cm_ready.value) return;
    cm_loading.value = true;
    try {
        await load_codemirror();
        cm_ready.value = true;
        await nextTick();
        init_editor();
    } finally {
        cm_loading.value = false;
    }
}

const warnings = computed(() => {
    ui.registry_notifier.listen();
    return get_script_warnings();
});

function has_warning(file_name: string): boolean {
    return warnings.value.has(file_name);
}

function select_file(id: string): void {
    const index = files.value.findIndex((file) => file.id === id);
    if (index >= 0) active_tab.value = index;
}

function new_script(): void {
    sync_editor();
    const base = 'untitled';
    let n = 1;
    while (files.value.some((file) => file.name.toLowerCase() === `${base}_${n}.js`)) n++;
    new_script_name.value = `${base}_${n}.js`;
    show_new_dialog.value = true;
    nextTick(() => {
        const input = document.querySelector('.new-name-input') as HTMLInputElement;
        input?.focus();
        input?.select();
    });
}

function do_create_script(): void {
    const name = normalize_name(new_script_name.value);
    if (!name) return;
    try {
        const created = runtime.createUpload(name, '', false);
        refresh_files();
        select_file(created.file.id);
        show_new_dialog.value = false;
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function sync_editor(): void {
    if (!editor_file_id || !editor_view) return;
    const file = runtime.getFile(editor_file_id);
    if (!file || file.enabled) return;
    const source = editor_view.state.doc.toString();
    if (source === file.source) return;
    try {
        runtime.saveFile(file.id, file.name, source);
        refresh_files();
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function confirm_delete(id: string): void {
    sync_editor();
    delete_target_id.value = id;
    show_delete_confirm.value = true;
}

function do_delete(): void {
    const id = delete_target_id.value;
    show_delete_confirm.value = false;
    try {
        runtime.deleteFile(id);
        refresh_files();
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function add_template(): void {
    sync_editor();
    const base = 'template';
    let name = `${base}.js`;
    let final_name = name;
    let n = 1;
    while (files.value.some((file) => file.name.toLowerCase() === final_name.toLowerCase())) {
        final_name = `${base}_${n}.js`;
        n++;
    }
    try {
        const created = runtime.createTemplate(final_name, TEMPLATE_JS);
        refresh_files();
        select_file(created.id);
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function start_rename(): void {
    if (!current_file.value) return;
    is_renaming.value = true;
    rename_input.value = current_file.value.name;
    nextTick(() => {
        const input = document.querySelector('.rename-input') as HTMLInputElement;
        input?.focus();
        input?.select();
    });
}

function finish_rename(): void {
    if (!is_renaming.value || !current_file.value) return;
    const new_name = normalize_name(rename_input.value);
    if (new_name && new_name !== current_file.value.name) {
        try {
            sync_editor();
            runtime.saveFile(current_file.value.id, new_name, runtime.getFile(current_file.value.id)?.source ?? '');
            refresh_files();
            status_message.value = '';
        } catch (error) {
            set_status(error);
        }
    }
    is_renaming.value = false;
}

function toggle_enable(): void {
    const file = current_file.value;
    if (!file) return;
    sync_editor();
    try {
        if (file.enabled) runtime.disable(file.id);
        else runtime.enable(file.id);
        refresh_files();
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function trust_file(): void {
    if (!current_file.value) return;
    try {
        runtime.trustFile(current_file.value.id);
        refresh_files();
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function open_nav_panel(): void {
    sync_editor();
    ui.show_user_defined_nav.value = true;
}

function move_tab(from: number, to: number): void {
    if (to < 0 || to >= files.value.length) return;
    const arr = files.value.map((file) => file.id);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    try {
        runtime.reorderFiles(arr);
        refresh_files();
        active_tab.value = to;
    } catch (error) {
        set_status(error);
    }
}

// Drag and drop
let drag_idx: number | null = null;

function on_dragstart(idx: number): void {
    drag_idx = idx;
}

function on_dragover(e: DragEvent, idx: number): void {
    e.preventDefault();
    if (drag_idx === null || drag_idx === idx) return;
}

function on_drop(idx: number): void {
    if (drag_idx === null || drag_idx === idx) return;
    move_tab(drag_idx, idx);
    drag_idx = null;
}

// File upload
function upload_file(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js';
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const code = reader.result as string;
            try {
                const created = runtime.createUpload(file.name, code, false);
                refresh_files();
                select_file(created.file.id);
                status_message.value = '';
            } catch (error) {
                set_status(error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// CodeMirror editor
// NOTE: CM6 的 Compartment 不能跨 EditorView 实例复用，所以每次创建独立的 Compartment。
// 所有保存逻辑集中到 init_editor_inner/init_editor：在销毁旧编辑器前自动保存内容到对应脚本。
// 这样 @click 里不再需要 sync_editor()，避免时序问题。

function init_editor(): void {
    if (!editor_ref.value) return;
    init_editor_inner(!(current_file.value?.enabled ?? false));
}

function init_editor_inner(editable: boolean): void {
    const cm = get_codemirror();
    if (!cm || !editor_ref.value) return;
    if (editor_view) {
        editor_view.destroy();
        editor_view = null;
    }
    const {
        EditorView,
        EditorState,
        Compartment,
        keymap,
        lineNumbers,
        drawSelection,
        highlightActiveLine,
        highlightActiveLineGutter,
        defaultHighlightStyle,
        syntaxHighlighting,
        bracketMatching,
        indentOnInput,
        defaultKeymap,
        history,
        closeBrackets,
        javascript,
    } = cm;

    const doc_code = current_file.value?.source ?? '';
    editor_file_id = current_file.value?.id ?? null;

    // 每个 EditorView 实例使用独立的 Compartment
    const ec = new Compartment();

    editor_view = new EditorView({
        state: EditorState.create({
            doc: doc_code,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                drawSelection(),
                highlightActiveLine(),
                indentOnInput(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                bracketMatching(),
                closeBrackets(),
                ec.of(EditorView.editable.of(editable)),
                keymap.of(defaultKeymap),
                javascript(),
                EditorView.theme({
                    '&': {
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: '100%',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-text)',
                    },
                    '.cm-scroller': { overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: '100%' },
                    '.cm-content': { minWidth: '0' },
                    '.cm-gutters': {
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)',
                    },
                    '.cm-activeLineGutter': {
                        backgroundColor: 'var(--color-bg-hover)',
                    },
                    '.cm-activeLine': {
                        backgroundColor: 'var(--color-bg-active)',
                    },
                    '.cm-cursor': {
                        borderLeftColor: 'var(--color-text)',
                    },
                    '.cm-selectionBackground': {
                        backgroundColor: 'var(--color-primary-bg)',
                    },
                    '.cm-matchingBracket': {
                        backgroundColor: 'var(--color-selected)',
                        outline: 'none',
                    },
                    '.cm-nonmatchingBracket': {
                        border: '1px solid var(--color-danger)',
                    },
                }),
            ],
        }),
        parent: editor_ref.value,
    });
}

// Tab 切换 —— 保存旧内容并重建编辑器
watch(
    () => current_file.value?.id,
    (new_id, old_id) => {
        if (new_id !== old_id) {
            sync_editor();
            nextTick(() => init_editor_inner(!(current_file.value?.enabled ?? false)));
        }
    },
);

// 启用/停用 —— 切换编辑器的可编辑状态
watch(
    () => current_file.value?.enabled,
    (enabled) => {
        if (enabled === undefined) return;
        nextTick(() => {
            if (current_file.value) init_editor_inner(!enabled);
        });
    },
);

// Panel 打开时重建编辑器
watch(
    () => ui.show_user_defined.value,
    (show) => {
        if (show) {
            refresh_files();
            nextTick(init_editor);
        }
    },
);

// 打印脚本 warning
watch(warnings, (w) => {
    for (const [file, msgs] of w) {
        console.log(`[WARN] ${file}:`, msgs);
    }
});

refresh_files();

onUnmounted(() => {
    sync_editor();
    editor_view?.destroy();
    editor_view = null;
});
</script>

<template>
    <ModalDialog
        :show="ui.show_user_defined.value"
        :title="t('user-defined.title')"
        @close="
            sync_editor();
            ui.show_user_defined.value = false;
        "
    >
        <div class="ud-layout">
            <!-- Left: tab list -->
            <div class="ud-tabs">
                <div
                    v-for="(file, idx) in files"
                    :key="file.id"
                    class="ud-tab"
                    :class="{ active: idx === active_tab, enabled: file.enabled }"
                    :title="file.lastError?.message ?? ''"
                    draggable="true"
                    @dragstart="on_dragstart(idx)"
                    @dragover="on_dragover($event, idx)"
                    @drop="on_drop(idx)"
                    @click="active_tab = idx"
                >
                    <span
                        v-if="has_warning(file.name)"
                        class="ud-warn"
                        :title="warnings.get(file.name)?.join('\n')"
                        >⚠</span
                    >
                    <span class="ud-tab-name">{{ file.name }}</span>
                    <span v-if="file.enabled" class="ud-tab-status">{{ t('user-defined.enable') }}</span>
                    <span v-else-if="!file.trusted" class="ud-tab-status">{{ t('user-defined.untrusted') }}</span>
                </div>
                <button class="ud-btn ud-btn-new" @mousedown.prevent="new_script">{{ t('user-defined.new') }}</button>
            </div>

            <!-- Center: CodeMirror editor -->
            <div class="ud-editor-area">
                <div v-if="is_renaming" class="ud-rename-bar">
                    <input
                        class="rename-input"
                        v-model="rename_input"
                        @keydown.enter="finish_rename"
                        @keydown.escape="is_renaming = false"
                        @blur="finish_rename"
                    />
                </div>
                <div v-if="files.length > 0">
                    <div v-if="cm_ready" ref="editor_ref" class="ud-cm-editor"></div>
                    <pre v-else class="ud-code-fallback"><code><span
                        v-for="(line, i) in code_lines"
                        :key="i"
                        class="ud-code-line"
                    >{{ line }}</span></code></pre>
                </div>
                <div v-else class="ud-editor-empty">{{ t('user-defined.no-script') }}</div>
            </div>

            <!-- Right: buttons -->
            <div class="ud-buttons">
                <button
                    v-if="current_file && !current_file.trusted"
                    class="ud-btn ud-btn-success"
                    @mousedown.prevent="trust_file"
                >
                    {{ t('user-defined.trust') }}
                </button>
                <button class="ud-btn" :disabled="!current_file || !current_file.trusted" @mousedown.prevent="toggle_enable">
                    {{ current_file?.enabled ? t('user-defined.disable') : t('user-defined.enable') }}
                </button>
                <button class="ud-btn" :disabled="!current_file" @mousedown.prevent="start_rename">
                    {{ t('user-defined.rename') }}
                </button>
                <button
                    class="ud-btn ud-btn-danger"
                    :disabled="!current_file"
                    @mousedown.prevent="confirm_delete(current_file!.id)"
                >
                    {{ t('user-defined.delete') }}
                </button>
                <button class="ud-btn" @mousedown.prevent="upload_file">
                    {{ t('user-defined.upload') }}
                </button>
                <button class="ud-btn" @mousedown.prevent="add_template">
                    {{ t('user-defined.template') }}
                </button>
                <button class="ud-btn" @mousedown.prevent="ui.show_api_doc.value = true">
                    {{ t('user-defined.view-api-doc') }}
                </button>
                <button class="ud-btn" :disabled="!current_file?.enabled" @mousedown.prevent="open_nav_panel">
                    {{ t('user-defined.nav-to-notation') }}
                </button>
                <button
                    v-if="!cm_ready"
                    class="ud-btn ud-btn-success"
                    :disabled="cm_loading"
                    @mousedown.prevent="load_cm_editor"
                >
                    {{ cm_loading ? t('user-defined.editor-loading') : t('user-defined.editor-load') }}
                </button>
            </div>
            <div v-if="status_message" class="ud-status-message">{{ status_message }}</div>
        </div>
    </ModalDialog>

    <ModalDialog :show="show_delete_confirm" :title="t('user-defined.delete')" @close="show_delete_confirm = false">
        <p class="delete-message">{{ t('user-defined.delete-confirm') }}</p>
        <div class="delete-buttons">
            <button class="delete-btn-cancel" @mousedown="show_delete_confirm = false">
                {{ t('user-defined.cancel') }}
            </button>
            <button class="delete-btn-confirm" @mousedown="do_delete">{{ t('user-defined.confirm-delete') }}</button>
        </div>
    </ModalDialog>

    <ModalDialog :show="show_new_dialog" :title="t('user-defined.new')" @close="show_new_dialog = false">
        <input
            class="new-name-input"
            v-model="new_script_name"
            @keydown.enter="do_create_script"
            @keydown.escape="show_new_dialog = false"
        />
        <div class="new-buttons">
            <button class="new-btn-cancel" @mousedown="show_new_dialog = false">{{ t('user-defined.cancel') }}</button>
            <button class="new-btn-confirm" @mousedown="do_create_script">{{ t('user-defined.create') }}</button>
        </div>
    </ModalDialog>
</template>

<style scoped>
.ud-layout {
    display: flex;
    gap: 12px;
    min-height: 400px;
    height: 60vh;
    min-width: 500px;
}

/* ---- Left tabs ---- */
.ud-tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 120px;
    border-right: 1px solid var(--color-border-light);
    padding-right: 8px;
    overflow-y: auto;
}

.ud-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--color-text);
    user-select: none;
}

.ud-tab:hover {
    background: var(--color-bg-hover);
}

.ud-tab.active {
    background: var(--color-primary-bg);
    color: var(--color-text);
}

.ud-tab.enabled {
    opacity: 0.6;
}

.ud-tab-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ud-tab-status {
    font-size: 11px;
    color: var(--color-text-secondary);
}

.ud-warn {
    color: var(--color-danger);
    font-size: 14px;
}

/* ---- Editor ---- */
.ud-editor-area {
    flex: none;
    width: 500px;
    display: flex;
    flex-direction: column;
}

.ud-rename-bar {
    padding: 4px 0;
}

.rename-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    background: var(--color-bg);
    color: var(--color-text);
    outline: none;
    box-sizing: border-box;
}

.rename-input:focus {
    border-color: var(--color-accent);
}

.delete-message {
    color: var(--color-text);
    font-size: 14px;
    margin: 0 0 16px;
    line-height: 1.5;
}

.delete-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.delete-btn-confirm {
    padding: 6px 16px;
    border: 1px solid var(--color-danger);
    border-radius: 5px;
    background: var(--color-danger);
    color: var(--color-bg);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
}

.delete-btn-confirm:hover {
    opacity: 0.85;
}

.delete-btn-cancel {
    padding: 6px 16px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}

.delete-btn-cancel:hover {
    background: var(--color-bg-hover);
}

.new-name-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    background: var(--color-bg);
    color: var(--color-text);
    outline: none;
    box-sizing: border-box;
    margin-bottom: 16px;
}

.new-name-input:focus {
    border-color: var(--color-accent);
}

.new-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.new-btn-confirm {
    padding: 6px 16px;
    border: 1px solid var(--color-accent);
    border-radius: 5px;
    background: var(--color-accent);
    color: var(--color-bg);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
}

.new-btn-confirm:hover {
    opacity: 0.85;
}

.new-btn-cancel {
    padding: 6px 16px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}

.new-btn-cancel:hover {
    background: var(--color-bg-hover);
}

.ud-cm-editor {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
}

.ud-editor-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    font-size: 14px;
}

/* CodeMirror 未加载时的只读代码展示 (仿 CodeMirror 观感) */
.ud-code-fallback {
    flex: 1;
    margin: 0;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    overflow: auto;
    padding: 6px 0;
    counter-reset: line;
}

.ud-code-fallback .ud-code-line {
    display: block;
    padding-right: 12px;
    white-space: pre;
    counter-increment: line;
}

.ud-code-fallback .ud-code-line::before {
    content: counter(line);
    display: inline-block;
    width: 3em;
    margin-right: 1em;
    padding-right: 0.5em;
    text-align: right;
    color: var(--color-text-secondary);
    border-right: 1px solid var(--color-border);
    user-select: none;
    -webkit-user-select: none;
}

.ud-cm-editor :deep(.cm-editor) {
    height: 100%;
}

/* ---- Right buttons ---- */
.ud-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 80px;
}

.ud-btn {
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    text-align: center;
    white-space: nowrap;
}

.ud-btn:hover:not(:disabled) {
    background: var(--color-bg-hover);
}

.ud-btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.ud-btn-danger {
    color: var(--color-danger);
    border-color: var(--color-danger);
}

.ud-btn-danger:hover:not(:disabled) {
    background: var(--color-danger);
    color: var(--color-bg);
}

.ud-btn-success {
    color: var(--color-success);
    border-color: var(--color-success);
}

.ud-btn-success:hover:not(:disabled) {
    background: var(--color-success);
    color: var(--color-bg);
}

.ud-btn-new {
    margin-top: 4px;
    border-style: dashed;
    border-color: var(--color-accent);
    color: var(--color-accent);
}

.ud-btn-new:hover {
    background: var(--color-accent);
    color: var(--color-bg);
}
</style>
