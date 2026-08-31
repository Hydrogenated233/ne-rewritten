import { computed, ref } from 'vue';
import { get_notation, list_notations } from '@/core/registry.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import type { ExpandSettings, Variant } from '@/core/settings.ts';
import { focus_node, get_last_focus } from '@/composables/use_focus_tracker.ts';
import { resolve_display, resolve_name } from '@/notation-definition.ts';

export type ExpandPreviewStatus = 'none' | 'ok' | 'error-parse' | 'error-no-from-display' | 'error-fs' | 'error-index';

export interface ExpandNote {
    id: number;
    input_text: string;
    FS_index: number;
    count: number;
    notation_id: string;
    notation_equiv: string | undefined;
    variant: Variant;
    preview: string | null;
    preview_status: ExpandPreviewStatus;
    focus_path?: string;
}

const notes = ref<ExpandNote[]>([]);
let next_note_id = 1;
const _ui = use_ui_states();

const visible = computed(() => notes.value.length > 0);
const notation_options = computed(() => {
    _ui.registry_notifier.listen();
    return list_notations();
});

function get_equiv_options(note: ExpandNote): string[] {
    const n = get_notation(note.notation_id);
    return n?.display_equiv ? Object.keys(n.display_equiv) : [];
}

function make_note(text: string, expand_settings?: ExpandSettings): ExpandNote {
    return {
        id: next_note_id++,
        input_text: text,
        FS_index: expand_settings?.FS_index ?? 0,
        count: expand_settings?.count ?? 1,
        notation_id: expand_settings?.notation_id || 'omega',
        notation_equiv: expand_settings?.notation_equiv,
        variant: expand_settings?.variant ?? 'FS_short',
        preview: null,
        preview_status: 'none',
        focus_path: get_last_focus(),
    };
}

function run_core(note: ExpandNote): void {
    if (!Number.isSafeInteger(note.FS_index) || note.FS_index < 0) {
        note.preview_status = 'error-index';
        note.preview = null;
        return;
    }
    if (!Number.isSafeInteger(note.count) || note.count < 1 || note.count > 1000) {
        note.preview_status = 'error-index';
        note.preview = null;
        return;
    }
    const n = get_notation(note.notation_id);
    if (!n) {
        note.preview_status = 'error-no-from-display';
        note.preview = note.notation_id || 'unknown';
        return;
    }

    const equiv_name = note.notation_equiv;
    const display_spec =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);

    if (!display_spec.from_display) {
        note.preview_status = 'error-no-from-display';
        note.preview = resolve_name(n.name) ?? n.id;
        return;
    }

    let expr: any;
    try {
        expr = display_spec.from_display(note.input_text);
    } catch {
        note.preview_status = 'error-parse';
        note.preview = null;
        return;
    }

    const result_display_data =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);
    const fs_fn =
        note.variant === 'FS_short' ? (n.FS_short ?? n.FS) : note.variant === 'FS_alter' ? (n.FS_alter ?? n.FS) : n.FS;
    if (!fs_fn) {
        note.preview_status = 'error-fs';
        note.preview = null;
        return;
    }

    const lines: string[] = [];
    try {
        for (let offset = 0; offset < note.count; offset++) {
            const index = note.FS_index + offset;
            if (!Number.isSafeInteger(index))
                throw new Error('Fundamental-sequence index exceeds the safe integer range.');
            try {
                const result = fs_fn(expr, index);
                lines.push(`FS(${index}) = ${result_display_data.plain(result)}`);
            } catch (error) {
                lines.push(`FS(${index}) = Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        note.preview = lines.join('\n');
        note.preview_status = 'ok';
    } catch {
        note.preview_status = 'error-fs';
        note.preview = null;
    }
}

function open(text: string, expand_settings?: ExpandSettings): number {
    const note = make_note(text, expand_settings);
    notes.value.push(note);
    if (typeof window !== 'undefined') {
        window.setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>(`[data-expand-note-id="${note.id}"]`);
            el?.focus();
            el?.select();
        });
    }
    return note.id;
}

function find_note(note_id?: number): ExpandNote | undefined {
    if (note_id !== undefined) return notes.value.find((note) => note.id === note_id);
    return notes.value[notes.value.length - 1];
}

function close(note_id?: number): void {
    const note = find_note(note_id);
    if (!note) return;
    notes.value = notes.value.filter((item) => item.id !== note.id);
    if (note.focus_path) focus_node(note.focus_path);
}

function save_settings(note_id?: number): ExpandSettings | null {
    const note = find_note(note_id);
    if (!note || !note.notation_id) return null;
    return {
        FS_index: note.FS_index,
        count: note.count,
        notation_id: note.notation_id,
        notation_equiv: note.notation_equiv,
        variant: note.variant,
    };
}

function run(note_id?: number): void {
    const note = find_note(note_id);
    if (note) run_core(note);
}

function invalidate(note_id?: number): void {
    const note = find_note(note_id);
    if (!note) return;
    note.preview = null;
    note.preview_status = 'none';
}

function confirm_and_fill(note_id?: number): void {
    const note = find_note(note_id);
    if (!note || note.preview_status !== 'ok' || note.preview === null || note.count !== 1) return;
    const path = note.focus_path ?? get_last_focus();
    if (!path) return;
    const el = document.querySelector<HTMLInputElement>(`[data-tree-path="${path}"]`);
    if (!el) return;
    el.value = note.preview;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    close(note.id);
}

export function use_expand_dialog() {
    // Keep aliases for callers that still address the most recently opened window.
    const latest = computed(() => notes.value[notes.value.length - 1]);
    const input_text = computed({
        get: () => latest.value?.input_text ?? '',
        set: (value: string) => {
            if (latest.value) latest.value.input_text = value;
        },
    });
    const FS_index = computed({
        get: () => latest.value?.FS_index ?? 0,
        set: (value: number) => {
            if (latest.value) latest.value.FS_index = value;
        },
    });
    const count = computed({
        get: () => latest.value?.count ?? 1,
        set: (value: number) => {
            if (latest.value) latest.value.count = value;
        },
    });
    const notation_id = computed({
        get: () => latest.value?.notation_id ?? '',
        set: (value: string) => {
            if (latest.value) latest.value.notation_id = value;
        },
    });
    const notation_equiv = computed<string | undefined>({
        get: () => latest.value?.notation_equiv,
        set: (value: string | undefined) => {
            if (latest.value) latest.value.notation_equiv = value || undefined;
        },
    });
    const variant = computed<Variant>({
        get: () => latest.value?.variant ?? 'FS_short',
        set: (value: Variant) => {
            if (latest.value) latest.value.variant = value;
        },
    });
    const preview = computed(() => latest.value?.preview ?? null);
    const preview_status = computed<ExpandPreviewStatus>(() => latest.value?.preview_status ?? 'none');
    const equiv_options = computed(() => (latest.value ? get_equiv_options(latest.value) : []));

    return {
        notes,
        visible,
        input_text,
        FS_index,
        count,
        notation_id,
        notation_equiv,
        variant,
        preview,
        preview_status,
        notation_options,
        equiv_options,
        equiv_options_for: get_equiv_options,
        open,
        close,
        run,
        invalidate,
        save_settings,
        confirm_and_fill,
    };
}
