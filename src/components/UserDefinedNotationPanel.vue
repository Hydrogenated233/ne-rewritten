<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { get_script_warnings } from '@/core/user_defined_notation.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import { find_bracket_match, get_line_numbers, render_highlighted_source } from '@/core/notation_editor.ts';
import ModalDialog from './ModalDialog.vue';
import TEMPLATE_JS from '@/assets/template.js?raw';
import GUIDE_MD from '@/assets/making-a-notation.md?raw';

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const ui = use_ui_states();
defineProps<{ inline?: boolean }>();

const files = ref<LocalNotationFile[]>([]);
const active_tab = ui.user_defined_active_tab;
const source_input = ref<HTMLTextAreaElement | null>(null);
const highlight_layer = ref<HTMLPreElement | null>(null);
const line_gutter = ref<HTMLDivElement | null>(null);
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
let editor_file_id: string | null = null;
let draft_timer: ReturnType<typeof window.setTimeout> | null = null;
const editor_name = ref('');
const editor_source = ref('');
const caret_position = ref(0);
const editor_focused = ref(false);

const current_file = computed(() => files.value[active_tab.value]);
const is_dirty = computed(() => {
    const file = current_file.value;
    return !!file && (editor_name.value !== file.name || editor_source.value !== file.source);
});
const bracket_match = computed(() => find_bracket_match(editor_source.value, caret_position.value));
const highlighted_source = computed(() => render_highlighted_source(editor_source.value, bracket_match.value));
const line_numbers = computed(() => get_line_numbers(editor_source.value));
const active_line = computed(
    () => (editor_source.value.slice(0, Math.max(0, caret_position.value)).match(/\r\n|\r|\n/g)?.length ?? 0) + 1,
);
const current_error = computed(() => current_file.value?.lastError ?? null);

function refresh_files(preferred_id?: string): void {
    try {
        files.value = runtime.listFiles();
        if (active_tab.value >= files.value.length) active_tab.value = Math.max(0, files.value.length - 1);
        if (preferred_id) {
            const index = files.value.findIndex((file) => file.id === preferred_id);
            if (index >= 0) active_tab.value = index;
        }
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

function load_editor(file_id = current_file.value?.id): void {
    cancel_draft_timer();
    if (!file_id) {
        editor_file_id = null;
        editor_name.value = '';
        editor_source.value = '';
        caret_position.value = 0;
        return;
    }
    try {
        const file = runtime.getFile(file_id);
        if (!file) return;
        const draft = runtime.getDraft(file.id);
        editor_file_id = file.id;
        editor_name.value = draft?.name ?? file.name;
        editor_source.value = draft?.source ?? file.source;
        caret_position.value = 0;
        nextTick(() => {
            if (source_input.value) {
                source_input.value.scrollTop = 0;
                source_input.value.scrollLeft = 0;
            }
            sync_editor_scroll();
        });
    } catch (error) {
        set_status(error);
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
        load_editor(id);
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
        refresh_files(created.file.id);
        load_editor(created.file.id);
        show_new_dialog.value = false;
        status_message.value = '';
    } catch (error) {
        set_status(error);
    }
}

function sync_editor(): boolean {
    cancel_draft_timer();
    if (!editor_file_id) return true;
    try {
        const file = runtime.getFile(editor_file_id);
        if (!file) return true;
        const draft = runtime.getDraft(file.id);
        if (editor_source.value === file.source && editor_name.value === file.name) {
            if (draft) runtime.clearDraft(file.id);
            return true;
        }
        runtime.setDraft(file.id, { name: editor_name.value, source: editor_source.value });
        status_message.value = '';
        return true;
    } catch (error) {
        set_status(error);
        return false;
    }
}

function cancel_draft_timer(): void {
    if (draft_timer !== null) window.clearTimeout(draft_timer);
    draft_timer = null;
}

function schedule_draft(): void {
    cancel_draft_timer();
    draft_timer = window.setTimeout(() => {
        draft_timer = null;
        sync_editor();
    }, 400);
}

function save_selected(): boolean {
    if (!sync_editor()) return false;
    const file = current_file.value;
    if (!file || !is_dirty.value) return true;
    try {
        runtime.saveFile(file.id, editor_name.value, editor_source.value);
        refresh_files(file.id);
        load_editor(file.id);
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
        load_editor(file.id);
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
    download_source(editor_name.value || file.name, editor_source.value);
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
        load_editor();
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
            refresh_files(created.id);
            load_editor(created.id);
            status_message.value = '';
        } catch (error) {
            set_status(error);
        }
    });
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
                    refresh_files(result.file.id);
                    load_editor(result.file.id);
                    status_message.value = t('user-defined.replaced');
                    return;
                }
                if (!window.confirm(t('user-defined.trust-confirm'))) return;
                const created = runtime.createUpload(file.name, code, false);
                runtime.trustFile(created.file.id);
                try {
                    const result = runtime.enable(created.file.id);
                    refresh_files(result.file.id);
                    load_editor(result.file.id);
                    status_message.value = t('user-defined.uploaded');
                } catch (error) {
                    record_error_safely(created.file.id, error);
                    refresh_files(created.file.id);
                    load_editor(created.file.id);
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
    const input = source_input.value;
    if (!error?.line || !input) return;
    const lines = editor_source.value.split('\n');
    const line_index = Math.max(0, Math.min(error.line - 1, lines.length - 1));
    let offset = 0;
    for (let index = 0; index < line_index; index++) offset += lines[index].length + 1;
    offset += Math.max(0, Math.min((error.column ?? 1) - 1, lines[line_index]?.length ?? 0));
    input.focus();
    input.setSelectionRange(offset, offset);
    caret_position.value = offset;
    input.scrollTop = Math.max(0, line_index * 20 - input.clientHeight / 3);
    sync_editor_scroll();
}

function on_before_unload(event: BeforeUnloadEvent): void {
    sync_editor();
    if (is_dirty.value) {
        event.preventDefault();
        event.returnValue = '';
    }
}

function on_editor_input(event: Event): void {
    update_caret(event);
    schedule_draft();
    nextTick(sync_editor_scroll);
}

function update_caret(event?: Event): void {
    const target = event?.target instanceof HTMLTextAreaElement ? event.target : source_input.value;
    if (target) caret_position.value = target.selectionStart;
}

function sync_editor_scroll(): void {
    const input = source_input.value;
    if (!input) return;
    if (highlight_layer.value) {
        highlight_layer.value.scrollTop = input.scrollTop;
        highlight_layer.value.scrollLeft = input.scrollLeft;
    }
    if (line_gutter.value) line_gutter.value.scrollTop = input.scrollTop;
}

function on_editor_keydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        save_selected();
        return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    apply_indent(event.shiftKey);
}

function apply_indent(remove_indent: boolean): void {
    const input = source_input.value;
    if (!input) return;
    const source = editor_source.value;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const indent = '   ';
    const selected = source.slice(start, end);
    const has_multiple_lines = /\r|\n/.test(selected);
    let new_start = start;
    let new_end = end;

    if (!remove_indent && !has_multiple_lines) {
        editor_source.value = source.slice(0, start) + indent + source.slice(end);
        new_start = new_end = start + indent.length;
    } else {
        const line_start = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const next_break = source.indexOf('\n', end);
        const line_end = next_break === -1 ? source.length : next_break;
        const block = source.slice(line_start, line_end);
        let lines = block.split('\n');
        let changed = 0;
        let first_changed = 0;

        if (remove_indent) {
            lines = lines.map((line, index) => {
                const match = line.match(/^(?: {1,3}|\t)/);
                const count = match?.[0].length ?? 0;
                if (index === 0) first_changed = count;
                changed += count;
                return count ? line.slice(count) : line;
            });
            new_start = Math.max(line_start, start - first_changed);
            new_end = Math.max(new_start, end - changed);
        } else {
            lines = lines.map((line) => indent + line);
            new_start = start + indent.length;
            new_end = end + indent.length * lines.length;
        }
        editor_source.value = source.slice(0, line_start) + lines.join('\n') + source.slice(line_end);
    }

    schedule_draft();
    nextTick(() => {
        const textarea = source_input.value;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(new_start, new_end);
        caret_position.value = new_end;
        sync_editor_scroll();
    });
}

watch(
    () => current_file.value?.id,
    (new_id, old_id) => {
        if (new_id !== old_id) {
            sync_editor();
            load_editor(new_id);
        }
    },
);

// Panel 打开时重建编辑器
watch(
    () => ui.show_user_defined.value,
    (show) => {
        if (show) {
            const current_id = current_file.value?.id;
            refresh_files(current_id);
            load_editor(current_id);
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
load_editor();

onUnmounted(() => {
    sync_editor();
    cancel_draft_timer();
    window.removeEventListener('beforeunload', on_before_unload);
});

onMounted(() => {
    window.addEventListener('beforeunload', on_before_unload);
});
</script>

<template>
    <ModalDialog
        :show="inline || ui.show_user_defined.value"
        :inline="inline"
        :title="inline ? undefined : t('user-defined.title')"
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
                    <span v-if="has_warning(file.name)" class="ud-warn" :title="warnings.get(file.name)?.join('\n')"
                        >⚠</span
                    >
                    <span class="ud-tab-name">{{ file.name }}</span>
                    <span v-if="file.enabled" class="ud-tab-status">{{ t('user-defined.enable') }}</span>
                    <span v-else-if="!file.trusted" class="ud-tab-status">{{ t('user-defined.untrusted') }}</span>
                    <span
                        v-if="(file.manifest?.notations ?? []).length"
                        class="ud-tab-ids"
                        :title="(file.manifest?.notations ?? []).join(', ')"
                    >
                        {{ (file.manifest?.notations ?? []).length }} ID
                    </span>
                    <span
                        v-if="(file.knownNotationIds ?? []).some((id) => !(file.manifest?.notations ?? []).includes(id))"
                        class="ud-tab-retained"
                    >
                        {{ t('user-defined.retained') }}
                    </span>
                    <span v-if="current_file?.id === file.id && is_dirty" class="ud-tab-status ud-tab-dirty">{{
                        t('user-defined.dirty')
                    }}</span>
                </div>
                <button class="ud-btn ud-btn-new" @mousedown.prevent="new_script">{{ t('user-defined.new') }}</button>
            </div>

            <!-- Center: source project's overlay editor -->
            <div class="ud-editor-area">
                <div v-if="current_file" class="ud-editor-header">
                    <label class="ud-editor-filename-label">
                        <span>{{ t('user-defined.file-name') }}</span>
                        <input
                            v-model="editor_name"
                            class="ud-editor-filename"
                            type="text"
                            spellcheck="false"
                            @input="schedule_draft"
                            @keydown.ctrl.s.prevent.stop="save_selected"
                            @keydown.meta.s.prevent.stop="save_selected"
                        />
                    </label>
                    <span v-if="is_dirty" class="ud-editor-dirty">{{ t('user-defined.dirty') }}</span>
                </div>
                <div
                    v-if="current_file"
                    class="ne-local-editor"
                    :class="{ 'has-focus': editor_focused }"
                >
                    <div ref="line_gutter" class="ne-local-editor__gutter" aria-hidden="true">
                        <span
                            v-for="line in line_numbers"
                            :key="line"
                            :class="{ 'is-active': line === active_line }"
                        >{{ line }}</span>
                    </div>
                    <div class="ne-local-editor__code">
                        <pre
                            ref="highlight_layer"
                            class="ne-local-editor__highlight"
                            aria-hidden="true"
                            v-html="highlighted_source"
                        ></pre>
                        <textarea
                            ref="source_input"
                            v-model="editor_source"
                            class="ne-local-editor__textarea"
                            :aria-label="t('user-defined.source')"
                            wrap="off"
                            spellcheck="false"
                            autocomplete="off"
                            autocapitalize="off"
                            @input="on_editor_input"
                            @keydown="on_editor_keydown"
                            @keyup="update_caret"
                            @click="update_caret"
                            @select="update_caret"
                            @mouseup="update_caret"
                            @scroll="sync_editor_scroll"
                            @focus="editor_focused = true; update_caret($event)"
                            @blur="editor_focused = false"
                        ></textarea>
                    </div>
                </div>
                <div v-else class="ud-editor-empty">{{ t('user-defined.no-script') }}</div>
            </div>

            <!-- Right: buttons -->
            <div class="ud-buttons">
                <button class="ud-btn" @mousedown.prevent="open_guide">{{ t('user-defined.guide') }}</button>
                <button
                    class="ud-btn ud-btn-success"
                    :disabled="!current_file || !is_dirty"
                    @mousedown.prevent="save_selected"
                >
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
    display: grid;
    grid-template-columns: minmax(120px, 180px) minmax(0, 1fr) minmax(96px, max-content);
    gap: 12px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 400px;
    height: 60vh;
    box-sizing: border-box;
}

/* ---- Left tabs ---- */
.ud-tabs {
    display: flex;
    grid-column: 1;
    grid-row: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
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
    display: flex;
    grid-column: 2;
    grid-row: 1;
    width: auto;
    min-width: 0;
    overflow: hidden;
    flex-direction: column;
}

.ud-editor-header {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    min-width: 0;
    padding-bottom: 8px;
}

.ud-editor-filename-label {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 3px;
    color: var(--color-text-secondary);
    font-size: 11px;
}

.ud-editor-filename {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    outline: none;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
}

.ud-editor-filename:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.ud-editor-dirty {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--color-primary-bg);
    color: var(--color-accent);
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
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

.ne-local-editor {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    overflow: hidden;
    background: var(--color-bg);
    box-sizing: border-box;
}

.ne-local-editor.has-focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.ne-local-editor__gutter {
    width: 54px;
    height: 100%;
    box-sizing: border-box;
    padding: 12px 9px 12px 4px;
    overflow: hidden;
    border-right: 1px solid var(--color-border-light);
    background: var(--color-bg-secondary);
    color: var(--color-text-muted);
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    line-height: 20px;
    text-align: right;
    user-select: none;
}

.ne-local-editor__gutter span {
    display: block;
    height: 20px;
    line-height: 20px;
}

.ne-local-editor__gutter span.is-active {
    color: var(--color-accent);
    font-weight: 700;
}

.ne-local-editor__code {
    position: relative;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--color-bg);
}

.ne-local-editor__highlight,
.ne-local-editor__textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 14px;
    border: 0;
    border-radius: 0;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    font-variant-ligatures: none;
    font-weight: 400;
    line-height: 20px;
    letter-spacing: 0;
    tab-size: 3;
    text-align: left;
    white-space: pre;
    word-spacing: 0;
}

.ne-local-editor__highlight {
    z-index: 1;
    overflow: hidden;
    background: transparent;
    color: var(--color-text);
    pointer-events: none;
}

.ne-local-editor__textarea.ne-local-editor__textarea {
    z-index: 2;
    overflow: auto;
    resize: none;
    outline: none;
    background: transparent;
    color: transparent;
    caret-color: var(--color-text);
    -webkit-text-fill-color: transparent;
}

.ne-local-editor__textarea::selection {
    background: color-mix(in srgb, var(--color-accent) 24%, transparent);
}

.ne-local-editor__highlight :deep(.ne-editor-token--keyword) {
    color: var(--color-editor-keyword);
    font-weight: 600;
}

.ne-local-editor__highlight :deep(.ne-editor-token--literal),
.ne-local-editor__highlight :deep(.ne-editor-token--number) {
    color: var(--color-editor-number);
}

.ne-local-editor__highlight :deep(.ne-editor-token--string),
.ne-local-editor__highlight :deep(.ne-editor-token--template) {
    color: var(--color-editor-string);
}

.ne-local-editor__highlight :deep(.ne-editor-token--comment) {
    color: var(--color-editor-comment);
    font-style: italic;
}

.ne-local-editor__highlight :deep(.ne-editor-bracket) {
    border-radius: 2px;
    color: inherit;
}

.ne-local-editor__highlight :deep(.ne-editor-bracket.is-origin),
.ne-local-editor__highlight :deep(.ne-editor-bracket.is-match) {
    outline: 1px solid var(--color-accent);
    background: var(--color-primary-bg);
}

.ne-local-editor__highlight :deep(.ne-editor-bracket.is-unmatched) {
    outline: 1px solid var(--color-danger);
    background: color-mix(in srgb, var(--color-danger) 20%, var(--color-bg));
    color: var(--color-danger);
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

/* ---- Right buttons ---- */
.ud-buttons {
    display: flex;
    grid-column: 3;
    grid-row: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    overflow-y: auto;
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

.ud-status-message,
.ud-runtime-error {
    grid-column: 1 / -1;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: anywhere;
}

.ud-status-message {
    color: var(--color-success);
    font-size: 12px;
}

.ud-runtime-error {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
    padding: 7px 9px;
    border: 1px solid var(--color-danger);
    border-radius: 4px;
    color: var(--color-danger);
    font-size: 12px;
}

.ud-runtime-error > span {
    min-width: 0;
    flex: 1 1 20rem;
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

@media (max-width: 960px) {
    .ud-layout {
        grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
        height: min(680px, 72vh);
    }

    .ud-editor-area {
        width: auto;
        min-width: 0;
    }

    .ud-buttons {
        grid-column: 1 / -1;
        grid-row: 2;
        flex-direction: row;
        flex-wrap: wrap;
        overflow-y: visible;
    }

    .ud-btn {
        flex: 1 1 auto;
    }

    .ud-guide-content {
        width: min(92vw, 820px);
    }
}

@media (max-width: 600px) {
    .ud-layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(280px, 44vh) auto;
        height: auto;
        min-height: 0;
        gap: 10px;
    }

    .ud-tabs {
        grid-column: 1;
        grid-row: 1;
        min-width: 0;
        flex-direction: row;
        overflow-x: auto;
        padding: 0 0 7px;
        border-right: 0;
        border-bottom: 1px solid var(--color-border-light);
        scrollbar-width: thin;
    }

    .ud-tab,
    .ud-btn-new {
        min-width: max-content;
        flex: 0 0 auto;
    }

    .ud-tab-name {
        max-width: 150px;
    }

    .ud-editor-area {
        grid-column: 1;
        grid-row: 2;
        min-height: 280px;
    }

    .ud-buttons {
        grid-column: 1;
        grid-row: 3;
    }

    .ud-btn {
        min-width: min(120px, 100%);
    }
}
</style>
