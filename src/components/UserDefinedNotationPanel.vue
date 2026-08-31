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
const line_gutter_content = ref<HTMLDivElement | null>(null);
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

function file_status(file: LocalNotationFile): string {
    if (file.lastError) return t('user-defined.status-error');
    return file.enabled ? t('user-defined.status-enabled') : t('user-defined.status-disabled');
}

function file_status_class(file: LocalNotationFile): string {
    if (file.lastError) return 'is-error';
    return file.enabled ? 'is-enabled' : 'is-disabled';
}

function file_has_draft(file: LocalNotationFile): boolean {
    if (file.id === current_file.value?.id) return is_dirty.value;
    try {
        return !!runtime.getDraft(file.id);
    } catch {
        return false;
    }
}

function retained_ids(file: LocalNotationFile): string[] {
    const notation_ids = new Set(file.manifest?.notations ?? []);
    const category_ids = new Set(file.manifest?.categories ?? []);
    return [
        ...(file.knownNotationIds ?? []).filter((id) => !notation_ids.has(id)),
        ...(file.knownCategoryIds ?? []).filter((id) => !category_ids.has(id)),
    ];
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

function toggle_file(file: LocalNotationFile, event: Event): void {
    const checkbox = event.target instanceof HTMLInputElement ? event.target : null;
    if (checkbox) checkbox.checked = file.enabled;
    guard_pending_changes(() => {
        const latest = runtime.getFile(file.id) ?? file;
        if (!latest.enabled && !latest.trusted && !window.confirm(t('user-defined.trust-confirm'))) return;
        try {
            if (!latest.trusted) runtime.trustFile(latest.id);
            if (latest.enabled) runtime.disable(latest.id);
            else runtime.enable(latest.id);
            refresh_files(latest.id);
            load_editor(latest.id);
            status_message.value = '';
        } catch (error) {
            record_error_safely(latest.id, error);
            refresh_files(latest.id);
            set_status(error);
        }
    });
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
    // Mirror by translation because native textarea scrollbars can give the
    // overlay layers a smaller maximum scroll offset on Windows.
    if (highlight_layer.value) {
        highlight_layer.value.style.transform = `translate3d(${-input.scrollLeft}px, ${-input.scrollTop}px, 0)`;
    }
    if (line_gutter_content.value) {
        line_gutter_content.value.style.transform = `translate3d(0, ${-input.scrollTop}px, 0)`;
    }
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
        <section class="ne-local-manager" :aria-label="t('user-defined.title')">
            <header class="ne-local-manager__header">
                <div class="ne-local-toolbar">
                    <button type="button" class="ne-local-button ne-local-button--secondary" @click="open_guide">
                        <span aria-hidden="true">&#128214;</span>
                        <span>{{ t('user-defined.guide') }}</span>
                    </button>
                    <button
                        type="button"
                        class="ne-local-button ne-local-button--secondary"
                        @click="ui.show_api_doc.value = true"
                    >
                        {{ t('user-defined.api-doc') }}
                    </button>
                    <button type="button" class="ne-local-button ne-local-button--secondary" @click="upload_file">
                        <span aria-hidden="true">&#8679;</span>
                        <span>{{ t('user-defined.upload') }}</span>
                    </button>
                    <button type="button" class="ne-local-button ne-local-button--secondary" @click="new_script">
                        <span aria-hidden="true">+</span>
                        <span>{{ t('user-defined.new') }}</span>
                    </button>
                    <button type="button" class="ne-local-button ne-local-button--primary" @click="add_template">
                        <span aria-hidden="true">+</span>
                        <span>{{ t('user-defined.new-prss') }}</span>
                    </button>
                </div>
            </header>

            <div v-if="status_message" class="ne-local-manager__notice" role="status">{{ status_message }}</div>

            <div class="ne-local-workspace">
                <aside class="ne-local-workspace__sidebar">
                    <p v-if="files.length === 0" class="ne-local-file-list__empty">{{ t('user-defined.no-script') }}</p>
                    <ul v-else class="ne-local-file-list">
                        <li
                            v-for="file in files"
                            :key="file.id"
                            class="ne-local-file"
                            :class="{
                                'is-selected': file.id === current_file?.id,
                                'has-error': !!file.lastError,
                            }"
                            :title="file.lastError?.message ?? ''"
                        >
                            <label
                                class="ne-local-file__toggle"
                                :title="file.enabled ? t('user-defined.disable') : t('user-defined.enable')"
                            >
                                <input
                                    type="checkbox"
                                    :checked="file.enabled"
                                    :aria-label="file.enabled ? t('user-defined.disable') : t('user-defined.enable')"
                                    @change="toggle_file(file, $event)"
                                />
                            </label>
                            <button type="button" class="ne-local-file__select" @click="select_file(file.id)">
                                <span class="ne-local-file__name">
                                    <span
                                        v-if="has_warning(file.name)"
                                        class="ne-local-file__warning"
                                        :title="warnings.get(file.name)?.join('\n')"
                                        aria-label="Warning"
                                        >!</span
                                    >
                                    {{ file.name }}
                                </span>
                                <span class="ne-local-file__status" :class="file_status_class(file)">
                                    {{ file_status(file) }}
                                </span>
                                <span v-if="file_has_draft(file)" class="ne-local-file__badge is-draft">
                                    {{ t('user-defined.dirty') }}
                                </span>
                                <span v-if="!file.trusted" class="ne-local-file__badge is-untrusted">
                                    {{ t('user-defined.untrusted') }}
                                </span>
                                <span
                                    v-if="retained_ids(file).length"
                                    class="ne-local-file__badge is-retained"
                                    :title="retained_ids(file).join(', ')"
                                >
                                    {{ t('user-defined.retained') }}
                                </span>
                                <span v-if="file.template" class="ne-local-file__badge is-template">
                                    {{ t('user-defined.template-badge') }}
                                </span>
                                <span v-if="(file.manifest?.notations ?? []).length" class="ne-local-file__manifest">
                                    {{ t('user-defined.notation-ids') }}:
                                    {{ (file.manifest?.notations ?? []).join(', ') }}
                                </span>
                                <span v-if="(file.manifest?.categories ?? []).length" class="ne-local-file__manifest">
                                    {{ t('user-defined.category-ids') }}:
                                    {{ (file.manifest?.categories ?? []).join(', ') }}
                                </span>
                                <span
                                    v-if="
                                        !(file.manifest?.notations ?? []).length &&
                                        !(file.manifest?.categories ?? []).length
                                    "
                                    class="ne-local-file__manifest is-empty"
                                >
                                    {{ t('user-defined.no-ids') }}
                                </span>
                            </button>
                            <button
                                type="button"
                                class="ne-local-file__delete"
                                :title="t('user-defined.delete')"
                                :aria-label="`${t('user-defined.delete')}: ${file.name}`"
                                @click.stop="confirm_delete(file.id)"
                            >
                                &times;
                            </button>
                        </li>
                    </ul>
                </aside>

                <main class="ne-local-workspace__editor">
                    <div v-if="!current_file" class="ne-local-editor__empty">{{ t('user-defined.no-script') }}</div>
                    <template v-else>
                        <div class="ne-local-editor__header">
                            <label class="ne-local-editor__filename-label">
                                <span>{{ t('user-defined.file-name') }}</span>
                                <input
                                    v-model="editor_name"
                                    class="ne-local-editor__filename"
                                    type="text"
                                    spellcheck="false"
                                    @input="schedule_draft"
                                    @keydown.ctrl.s.prevent.stop="save_selected"
                                    @keydown.meta.s.prevent.stop="save_selected"
                                />
                            </label>
                            <span v-if="is_dirty" class="ne-local-editor__dirty">{{ t('user-defined.dirty') }}</span>
                            <div class="ne-local-editor__actions">
                                <button
                                    type="button"
                                    class="ne-local-button ne-local-button--primary"
                                    :disabled="!is_dirty"
                                    @click="save_selected"
                                >
                                    {{ t('user-defined.save') }}
                                </button>
                                <button
                                    type="button"
                                    class="ne-local-button ne-local-button--secondary"
                                    :disabled="!is_dirty"
                                    @click="discard_selected"
                                >
                                    {{ t('user-defined.discard') }}
                                </button>
                                <button
                                    type="button"
                                    class="ne-local-button ne-local-button--secondary"
                                    @click="download_selected"
                                >
                                    <span aria-hidden="true">&#8595;</span>
                                    <span>{{ t('user-defined.download') }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="ne-local-button ne-local-button--secondary"
                                    :disabled="!current_file.enabled"
                                    @click="open_nav_panel"
                                >
                                    {{ t('user-defined.nav-to-notation') }}
                                </button>
                            </div>
                        </div>

                        <div class="ne-local-editor" :class="{ 'has-focus': editor_focused }">
                            <div class="ne-local-editor__gutter" aria-hidden="true">
                                <div ref="line_gutter_content" class="ne-local-editor__gutter-content">
                                    <span
                                        v-for="line in line_numbers"
                                        :key="line"
                                        :class="{ 'is-active': line === active_line }"
                                        >{{ line }}</span
                                    >
                                </div>
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
                                    @focus="
                                        editor_focused = true;
                                        update_caret($event);
                                    "
                                    @blur="editor_focused = false"
                                ></textarea>
                            </div>
                        </div>

                        <div v-if="current_error" class="ne-local-editor__error" role="alert">
                            <div class="ne-local-editor__error-message">
                                <strong>{{ current_error.code }}</strong>
                                <span>{{ current_error.message }}</span>
                            </div>
                            <button
                                v-if="current_error.line"
                                type="button"
                                class="ne-local-editor__error-location"
                                @click="jump_to_error"
                            >
                                {{ error_location() }}
                            </button>
                        </div>
                    </template>
                </main>
            </div>
        </section>
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
            <button class="ne-local-button ne-local-button--primary" @mousedown.prevent="resolve_dirty('save')">
                {{ t('user-defined.save') }}
            </button>
            <button class="ne-local-button ne-local-button--secondary" @mousedown.prevent="resolve_dirty('discard')">
                {{ t('user-defined.discard') }}
            </button>
            <button class="ne-local-button ne-local-button--secondary" @mousedown.prevent="resolve_dirty('cancel')">
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
            <button class="ne-local-button ne-local-button--primary" @mousedown.prevent="save_then_download">
                {{ t('user-defined.save') }}
            </button>
            <button class="ne-local-button ne-local-button--secondary" @mousedown.prevent="download_draft">
                {{ t('user-defined.download-draft') }}
            </button>
            <button
                class="ne-local-button ne-local-button--secondary"
                @mousedown.prevent="show_download_confirm = false"
            >
                {{ t('user-defined.cancel') }}
            </button>
        </div>
    </ModalDialog>

    <ModalDialog :show="guide_open" :title="t('user-defined.guide-title')" @close="close_guide">
        <div class="ud-guide-content">
            <div v-if="guide_loading" class="ud-guide-state">{{ t('user-defined.guide-loading') }}</div>
            <div v-else-if="guide_error" class="ud-guide-state ud-guide-error">
                {{ t('user-defined.guide-load-failed') }}: {{ guide_error }}
                <button class="ne-local-button ne-local-button--secondary" @mousedown.prevent="open_guide">
                    {{ t('user-defined.retry') }}
                </button>
            </div>
            <article v-else class="ud-guide-article" v-html="guide_html" />
        </div>
    </ModalDialog>
</template>

<style scoped>
.ne-local-manager {
    width: 100%;
    min-width: 0;
    margin-top: 16px;
    color: var(--color-text);
}

.ne-local-manager,
.ne-local-manager * {
    box-sizing: border-box;
}

.ne-local-manager__header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
    margin-bottom: 10px;
}

.ne-local-toolbar,
.ne-local-editor__actions,
.confirm-buttons,
.delete-buttons,
.new-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
}

.ne-local-toolbar {
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.ne-local-button.ne-local-button {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 5px 12px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: 0;
    white-space: nowrap;
}

.ne-local-button.ne-local-button--primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
}

.ne-local-button.ne-local-button--primary:hover:not(:disabled) {
    filter: brightness(0.94);
}

.ne-local-button.ne-local-button--secondary:hover:not(:disabled) {
    border-color: var(--color-text-muted);
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.ne-local-button.ne-local-button--danger {
    border-color: var(--color-danger);
    background: var(--color-danger);
    color: var(--color-bg);
}

.ne-local-button.ne-local-button:focus-visible,
.ne-local-file__select:focus-visible,
.ne-local-file__delete:focus-visible,
.ne-local-editor__error-location:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
}

.ne-local-button.ne-local-button:disabled,
.ne-local-file__select:disabled,
.ne-local-file__delete:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.ne-local-manager__notice {
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--color-success) 52%, var(--color-border));
    border-radius: 5px;
    background: color-mix(in srgb, var(--color-success) 8%, var(--color-bg));
    color: var(--color-success);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.ne-local-workspace {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: var(--color-bg);
}

.ne-local-workspace__sidebar {
    min-width: 0;
    height: 608px;
    overflow: auto;
    border-right: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
}

.ne-local-file-list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.ne-local-file-list__empty,
.ne-local-editor__empty {
    margin: 0;
    padding: 24px 16px;
    color: var(--color-text-muted);
    font-size: 13px;
    text-align: center;
}

.ne-local-file {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 34px;
    min-width: 0;
    border-bottom: 1px solid var(--color-border-light);
    background: transparent;
}

.ne-local-file:last-child {
    border-bottom: 0;
}

.ne-local-file.is-selected {
    background: var(--color-accent-bg);
    box-shadow: inset 3px 0 0 var(--color-accent);
}

.ne-local-file.has-error {
    box-shadow: inset 3px 0 0 var(--color-danger);
}

.ne-local-file.is-selected.has-error {
    background: color-mix(in srgb, var(--color-danger) 9%, var(--color-bg));
}

.ne-local-file__toggle {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 14px;
    cursor: pointer;
}

.ne-local-file__toggle input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--color-accent);
}

.ne-local-file__select.ne-local-file__select {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    width: 100%;
    min-width: 0;
    padding: 10px 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
    appearance: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
    text-align: left;
}

.ne-local-file__select.ne-local-file__select:hover:not(:disabled) {
    background: transparent;
}

.ne-local-file__name {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text);
    font-size: 13px;
    font-weight: 600;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ne-local-file__warning {
    display: inline-flex;
    width: 15px;
    height: 15px;
    align-items: center;
    justify-content: center;
    margin-right: 3px;
    border: 1px solid var(--color-danger);
    border-radius: 50%;
    color: var(--color-danger);
    font-size: 10px;
    font-weight: 700;
    line-height: 13px;
    vertical-align: 1px;
}

.ne-local-file__status,
.ne-local-file__badge {
    align-self: start;
    justify-self: end;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    white-space: nowrap;
}

.ne-local-file__status.is-enabled {
    background: color-mix(in srgb, var(--color-success) 17%, var(--color-bg));
    color: var(--color-success);
}

.ne-local-file__status.is-disabled {
    background: var(--color-bg-hover);
    color: var(--color-text-secondary);
}

.ne-local-file__status.is-error {
    background: color-mix(in srgb, var(--color-danger) 15%, var(--color-bg));
    color: var(--color-danger);
}

.ne-local-file__badge.is-draft {
    justify-self: start;
    background: color-mix(in srgb, #f59e0b 17%, var(--color-bg));
    color: #b45309;
}

.ne-local-file__badge.is-untrusted {
    background: color-mix(in srgb, var(--color-danger) 12%, var(--color-bg));
    color: var(--color-danger);
}

.ne-local-file__badge.is-retained {
    justify-self: start;
    background: color-mix(in srgb, #0284c7 14%, var(--color-bg));
    color: #0284c7;
}

.ne-local-file__badge.is-template {
    background: color-mix(in srgb, var(--color-category) 14%, var(--color-bg));
    color: var(--color-category);
}

.ne-local-file__manifest {
    grid-column: 1 / -1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-muted);
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10px;
    line-height: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ne-local-file__manifest.is-empty {
    color: color-mix(in srgb, var(--color-text-muted) 72%, transparent);
    font-family: inherit;
}

.ne-local-file__delete.ne-local-file__delete {
    align-self: start;
    width: 28px;
    height: 28px;
    margin: 7px 3px 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    appearance: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 19px;
    line-height: 28px;
}

.ne-local-file__delete.ne-local-file__delete:hover:not(:disabled) {
    background: transparent;
    color: var(--color-danger);
}

.ne-local-workspace__editor {
    min-width: 0;
    padding: 14px;
    background: var(--color-bg);
}

.ne-local-editor__header {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto;
    gap: 8px 12px;
    align-items: end;
    min-height: 64px;
    margin-bottom: 10px;
}

.ne-local-editor__filename-label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
}

.ne-local-editor__filename.ne-local-editor__filename {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 5px 9px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    outline: none;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    line-height: 20px;
    letter-spacing: 0;
}

.ne-local-editor__filename.ne-local-editor__filename:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.ne-local-editor__dirty {
    grid-column: 1;
    align-self: start;
    justify-self: start;
    padding: 1px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, #f59e0b 17%, var(--color-bg));
    color: #b45309;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
}

.ne-local-editor__actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: end;
    justify-content: flex-end;
    flex-wrap: wrap;
}

.ne-local-editor {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    width: 100%;
    height: 500px;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
}

.ne-local-editor.has-focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.ne-local-editor__gutter {
    width: 54px;
    height: 100%;
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

.ne-local-editor__gutter-content {
    will-change: transform;
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
    overflow: visible;
    background: transparent;
    color: var(--color-text);
    pointer-events: none;
    will-change: transform;
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

.ne-local-editor__error {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--color-danger) 55%, var(--color-border));
    border-radius: 5px;
    background: color-mix(in srgb, var(--color-danger) 8%, var(--color-bg));
    color: var(--color-danger);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.ne-local-editor__error-message {
    display: grid;
    min-width: 0;
    gap: 2px;
}

.ne-local-editor__error-location.ne-local-editor__error-location {
    flex: 0 0 auto;
    padding: 3px 7px;
    border: 1px solid currentColor;
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-danger);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
}

.delete-message,
.confirm-message {
    margin: 0 0 14px;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.5;
}

.delete-buttons,
.new-buttons,
.confirm-buttons {
    justify-content: flex-end;
    flex-wrap: wrap;
}

.delete-btn-confirm,
.delete-btn-cancel,
.new-btn-confirm,
.new-btn-cancel {
    min-height: 32px;
    padding: 5px 14px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
}

.delete-btn-confirm {
    border-color: var(--color-danger);
    background: var(--color-danger);
    color: var(--color-bg);
    font-weight: 600;
}

.new-btn-confirm {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
    font-weight: 600;
}

.delete-btn-cancel:hover,
.new-btn-cancel:hover {
    background: var(--color-bg-hover);
}

.new-name-input {
    width: 100%;
    margin-bottom: 16px;
    padding: 6px 9px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    outline: none;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
}

.new-name-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
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
    letter-spacing: 0;
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

@media (max-width: 820px) {
    .ne-local-workspace {
        grid-template-columns: minmax(0, 1fr);
    }

    .ne-local-workspace__sidebar {
        height: 220px;
        border-right: 0;
        border-bottom: 1px solid var(--color-border);
    }

    .ne-local-editor {
        height: 420px;
    }
}

@media (max-width: 560px) {
    .ne-local-manager__header,
    .ne-local-editor__header {
        display: flex;
        align-items: stretch;
        flex-direction: column;
    }

    .ne-local-toolbar,
    .ne-local-editor__actions {
        flex-wrap: wrap;
    }

    .ne-local-toolbar .ne-local-button,
    .ne-local-editor__actions .ne-local-button {
        flex: 1 1 auto;
    }

    .ne-local-editor__actions {
        justify-content: stretch;
    }

    .ne-local-workspace__editor {
        padding: 10px;
    }

    .ne-local-editor {
        grid-template-columns: 46px minmax(0, 1fr);
    }

    .ne-local-editor__gutter {
        width: 46px;
        padding-right: 7px;
    }

    .ud-guide-content {
        width: min(92vw, 820px);
    }
}

@media (max-width: 390px) {
    .ne-local-toolbar .ne-local-button,
    .ne-local-editor__actions .ne-local-button {
        flex-basis: calc(50% - 4px);
        min-width: 0;
        white-space: normal;
    }

    .ne-local-file {
        grid-template-columns: 32px minmax(0, 1fr) 32px;
    }
}
</style>
