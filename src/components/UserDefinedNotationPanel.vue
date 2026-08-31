<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { get_codemirror, load_codemirror } from '@/composables/use_codemirror.ts';
import { get_script_warnings } from '@/core/user_defined_notation.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import ModalDialog from './ModalDialog.vue';
import TEMPLATE_JS from '@/assets/template.js?raw';
import GUIDE_MD from '@/assets/making-a-notation.md?raw';

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
const show_dirty_confirm = ref(false);
const show_download_confirm = ref(false);
const pending_action = ref<(() => void) | null>(null);
const guide_open = ref(false);
const guide_loading = ref(false);
const guide_error = ref('');
const guide_html = ref('');
const guide_ready = ref(false);
let editor_view: import('@codemirror/view').EditorView | null = null;
let editor_file_id: string | null = null;

const current_file = computed(() => files.value[active_tab.value]);

// CodeMirror 按需加载: 未加载时用只读 pre 展示代码
const cm_ready = ref(false);
const cm_loading = ref(false);
const draft_revision = ref(0);

const current_draft = computed(() => {
    draft_revision.value;
    const file = current_file.value;
    if (!file) return undefined;
    try {
        return runtime.getDraft(file.id);
    } catch {
        return undefined;
    }
});
const current_source = computed(() => current_draft.value?.source ?? current_file.value?.source ?? '');
const current_name = computed(() => current_draft.value?.name ?? current_file.value?.name ?? '');
const is_dirty = computed(() => !!current_draft.value);
const code_lines = computed(() => current_source.value.split('\n'));
const current_error = computed(() => current_file.value?.lastError ?? null);

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

function record_error_safely(id: string, error: unknown): void {
    try {
        runtime.recordError(id, error);
    } catch (storage_error) {
        set_status(storage_error);
    }
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
    if (index < 0 || index === active_tab.value) return;
    guard_pending_changes(() => {
        active_tab.value = index;
    });
}

function new_script(): void {
    guard_pending_changes(() => {
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
    const draft = runtime.getDraft(file.id);
    if (source === file.source && !draft) return;
    try {
        runtime.setDraft(file.id, { name: draft?.name ?? file.name, source });
        draft_revision.value++;
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function save_selected(): boolean {
    sync_editor();
    const file = current_file.value;
    const draft = current_draft.value;
    if (!file || !draft) return true;
    try {
        runtime.saveFile(file.id, draft.name ?? file.name, draft.source);
        draft_revision.value++;
        refresh_files();
        nextTick(() => init_editor_inner(!(current_file.value?.enabled ?? false)));
        status_message.value = '';
        return true;
    } catch (error) {
        set_status(error);
        return false;
    }
}

function discard_selected(): void {
    const file = current_file.value;
    if (!file) return;
    try {
        runtime.clearDraft(file.id);
        draft_revision.value++;
        nextTick(() => init_editor_inner(!file.enabled));
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function download_selected(): void {
    sync_editor();
    const file = current_file.value;
    if (!file) return;
    if (is_dirty.value) {
        show_download_confirm.value = true;
        return;
    }
    download_source(file.name, file.source);
}

function download_source(name: string, source: string): void {
    const safe_name = normalize_name(name);
    const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safe_name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function download_draft(): void {
    const file = current_file.value;
    if (!file) return;
    const draft = current_draft.value;
    download_source(draft?.name ?? file.name, draft?.source ?? file.source);
    show_download_confirm.value = false;
}

function save_then_download(): void {
    if (save_selected()) {
        const file = current_file.value;
        if (file) download_source(file.name, file.source);
    }
    show_download_confirm.value = false;
}

function confirm_delete(id: string): void {
    guard_pending_changes(() => {
        delete_target_id.value = id;
        show_delete_confirm.value = true;
    });
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
    guard_pending_changes(() => {
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
            active_tab.value = files.value.findIndex((file) => file.id === created.id);
            status_message.value = '';
        } catch (error) {
            set_status(error);
        }
    });
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
            const draft = current_draft.value;
            runtime.setDraft(current_file.value.id, {
                name: new_name,
                source: draft?.source ?? current_file.value.source,
            });
            draft_revision.value++;
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
    guard_pending_changes(() => {
        const latest = runtime.getFile(file.id) ?? file;
        if (!latest.enabled && !latest.trusted && !window.confirm(t('user-defined.trust-confirm'))) return;
        try {
            if (!latest.trusted) runtime.trustFile(latest.id);
            if (latest.enabled) runtime.disable(latest.id);
            else runtime.enable(latest.id);
            refresh_files();
            status_message.value = '';
        } catch (error) {
            record_error_safely(latest.id, error);
            refresh_files();
            set_status(error);
        }
    });
}

function trust_file(): void {
    if (!current_file.value) return;
    if (!window.confirm(t('user-defined.trust-confirm'))) return;
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

function guard_pending_changes(action: () => void): void {
    sync_editor();
    if (!is_dirty.value) {
        action();
        return;
    }
    pending_action.value = action;
    show_dirty_confirm.value = true;
}

function resolve_dirty(choice: 'save' | 'discard' | 'cancel'): void {
    const action = pending_action.value;
    pending_action.value = null;
    show_dirty_confirm.value = false;
    if (choice === 'cancel' || !action) return;
    if (choice === 'save') {
        if (save_selected()) action();
    } else {
        discard_selected();
        action();
    }
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

// File upload: follow the source application's trust/replace flow.
function upload_file(): void {
    guard_pending_changes(open_upload_picker);
}

function open_upload_picker(): void {
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
                const existing = runtime.findByName(file.name);
                if (existing) {
                    if (!window.confirm(t('user-defined.replace-confirm'))) return;
                    const result = runtime.replaceUpload(existing.id, file.name, code);
                    refresh_files();
                    active_tab.value = files.value.findIndex((item) => item.id === result.file.id);
                    status_message.value = t('user-defined.replaced');
                    return;
                }
                if (!window.confirm(t('user-defined.trust-confirm'))) return;
                const created = runtime.createUpload(file.name, code, false);
                runtime.trustFile(created.file.id);
                try {
                    const result = runtime.enable(created.file.id);
                    refresh_files();
                    active_tab.value = files.value.findIndex((item) => item.id === result.file.id);
                    status_message.value = t('user-defined.uploaded');
                } catch (error) {
                    record_error_safely(created.file.id, error);
                    refresh_files();
                    active_tab.value = files.value.findIndex((item) => item.id === created.file.id);
                    set_status(t('user-defined.upload-failed'));
                }
            } catch (error) {
                set_status(error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function open_guide(): Promise<void> {
    guide_open.value = true;
    if (guide_ready.value || guide_loading.value) return;
    guide_loading.value = true;
    guide_error.value = '';
    try {
        const mod = await import('marked');
        guide_html.value = String(await mod.marked(GUIDE_MD));
        guide_ready.value = true;
    } catch (error) {
        guide_error.value = error instanceof Error ? error.message : String(error);
    } finally {
        guide_loading.value = false;
    }
}

function close_guide(): void {
    guide_open.value = false;
}

function error_location(): string {
    const error = current_error.value;
    if (!error?.line) return '';
    return t('user-defined.error-at', { line: String(error.line), column: String(error.column ?? '?') });
}

function jump_to_error(): void {
    const error = current_error.value;
    if (!error?.line || !editor_view) return;
    const line = editor_view.state.doc.line(Math.max(1, Math.min(error.line, editor_view.state.doc.lines)));
    const pos = Math.min(line.from + Math.max(0, (error.column ?? 1) - 1), line.to);
    editor_view.dispatch({ selection: { anchor: pos } });
    editor_view.focus();
}

function on_before_unload(event: BeforeUnloadEvent): void {
    sync_editor();
    if (is_dirty.value) {
        event.preventDefault();
        event.returnValue = '';
    }
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

    const doc_code = current_source.value;
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
    window.removeEventListener('beforeunload', on_before_unload);
});

onMounted(() => window.addEventListener('beforeunload', on_before_unload));
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
                    @click="select_file(file.id)"
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
                    <span v-if="file.manifest.notations.length" class="ud-tab-ids" :title="file.manifest.notations.join(', ')">
                        {{ file.manifest.notations.length }} ID
                    </span>
                    <span
                        v-if="file.knownNotationIds.some((id) => !file.manifest.notations.includes(id))"
                        class="ud-tab-retained"
                    >
                        {{ t('user-defined.retained') }}
                    </span>
                    <span v-if="current_file?.id === file.id && is_dirty" class="ud-tab-status ud-tab-dirty">{{ t('user-defined.dirty') }}</span>
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
                <button class="ud-btn" @mousedown.prevent="open_guide">{{ t('user-defined.guide') }}</button>
                <button class="ud-btn ud-btn-success" :disabled="!current_file || !is_dirty" @mousedown.prevent="save_selected">
                    {{ t('user-defined.save') }}
                </button>
                <button class="ud-btn" :disabled="!current_file || !is_dirty" @mousedown.prevent="discard_selected">
                    {{ t('user-defined.discard') }}
                </button>
                <button class="ud-btn" :disabled="!current_file" @mousedown.prevent="download_selected">
                    {{ t('user-defined.download') }}
                </button>
                <button
                    v-if="current_file && !current_file.trusted"
                    class="ud-btn ud-btn-success"
                    @mousedown.prevent="trust_file"
                >
                    {{ t('user-defined.trust') }}
                </button>
                <button class="ud-btn" :disabled="!current_file" @mousedown.prevent="toggle_enable">
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
            <div v-if="current_error" class="ud-runtime-error" role="alert">
                <strong>{{ current_error.code }}</strong>
                <span>{{ current_error.message }}</span>
                <button v-if="current_error.line" class="ud-error-location" @mousedown.prevent="jump_to_error">
                    {{ error_location() }}
                </button>
            </div>
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

    <ModalDialog :show="show_dirty_confirm" :title="t('user-defined.dirty-title')" @close="resolve_dirty('cancel')">
        <p class="confirm-message">{{ t('user-defined.dirty-body') }}</p>
        <div class="confirm-buttons">
            <button class="ud-btn ud-btn-success" @mousedown.prevent="resolve_dirty('save')">
                {{ t('user-defined.save') }}
            </button>
            <button class="ud-btn" @mousedown.prevent="resolve_dirty('discard')">
                {{ t('user-defined.discard') }}
            </button>
            <button class="ud-btn" @mousedown.prevent="resolve_dirty('cancel')">
                {{ t('user-defined.cancel') }}
            </button>
        </div>
    </ModalDialog>

    <ModalDialog
        :show="show_download_confirm"
        :title="t('user-defined.download-title')"
        @close="show_download_confirm = false"
    >
        <p class="confirm-message">{{ t('user-defined.download-body') }}</p>
        <div class="confirm-buttons">
            <button class="ud-btn ud-btn-success" @mousedown.prevent="save_then_download">
                {{ t('user-defined.save') }}
            </button>
            <button class="ud-btn" @mousedown.prevent="download_draft">
                {{ t('user-defined.download-draft') }}
            </button>
            <button class="ud-btn" @mousedown.prevent="show_download_confirm = false">
                {{ t('user-defined.cancel') }}
            </button>
        </div>
    </ModalDialog>

    <ModalDialog :show="guide_open" :title="t('user-defined.guide-title')" @close="close_guide">
        <div class="ud-guide-content">
            <div v-if="guide_loading" class="ud-guide-state">{{ t('user-defined.guide-loading') }}</div>
            <div v-else-if="guide_error" class="ud-guide-state ud-guide-error">
                {{ t('user-defined.guide-load-failed') }}: {{ guide_error }}
                <button class="ud-btn" @mousedown.prevent="open_guide">{{ t('user-defined.retry') }}</button>
            </div>
            <article v-else class="ud-guide-article" v-html="guide_html" />
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

.ud-tab-ids,
.ud-tab-retained {
    flex: 0 0 auto;
    color: var(--color-text-secondary);
    font-size: 10px;
}

.ud-tab-retained {
    color: var(--color-category);
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

.ud-status-message {
    flex: 0 0 100%;
    color: var(--color-success);
    font-size: 12px;
}

.ud-runtime-error {
    display: flex;
    align-items: baseline;
    flex: 0 0 100%;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
    padding: 7px 9px;
    border: 1px solid var(--color-danger);
    border-radius: 4px;
    color: var(--color-danger);
    font-size: 12px;
}

.ud-error-location {
    padding: 2px 6px;
    border: 1px solid currentColor;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
}

.confirm-message {
    margin: 0 0 14px;
    line-height: 1.5;
}

.confirm-buttons {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}

.ud-guide-content {
    width: min(820px, 78vw);
    max-height: 72vh;
    overflow: auto;
}

.ud-guide-state {
    padding: 24px 8px;
    color: var(--color-text-secondary);
}

.ud-guide-error {
    color: var(--color-danger);
}

.ud-guide-article {
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.6;
}

.ud-guide-article :deep(h1),
.ud-guide-article :deep(h2),
.ud-guide-article :deep(h3) {
    margin: 0.8em 0 0.4em;
}

.ud-guide-article :deep(pre) {
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--color-border-light);
    border-radius: 4px;
    background: var(--color-bg-secondary);
}

.ud-guide-article :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (max-width: 760px) {
    .ud-layout {
        min-width: 0;
        height: 72vh;
    }

    .ud-editor-area {
        width: min(500px, 100%);
    }

    .ud-buttons {
        flex-direction: row;
        flex-wrap: wrap;
    }

    .ud-btn {
        flex: 1 1 auto;
    }

    .ud-guide-content {
        width: min(92vw, 820px);
    }
}
</style>
