import { computed, ref, watch } from 'vue';
import { get_notation, list_notations } from '@/core/registry.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import type { ExpandSettings, Variant } from '@/core/settings.ts';
import { focus_node, get_last_focus } from '@/composables/use_focus_tracker.ts';
import { resolve_display, resolve_name } from '@/notation-definition.ts';

const visible = ref(false);
const input_text = ref('');
const FS_index = ref(0);
const count = ref(1);
const notation_id = ref('');
const notation_equiv = ref<string | undefined>(undefined);
const variant = ref<Variant>('FS_short');
const preview = ref<string | null>(null);
const preview_status = ref<'none' | 'ok' | 'error-parse' | 'error-no-from-display' | 'error-fs' | 'error-index'>(
    'none',
);

const _ui = use_ui_states();

const notation_options = computed(() => {
    _ui.registry_notifier.listen();
    return list_notations();
});
const equiv_options = computed(() => {
    const n = get_notation(notation_id.value);
    return n?.display_equiv ? Object.keys(n.display_equiv) : [];
});

function run_core() {
    if (!Number.isSafeInteger(FS_index.value) || FS_index.value < 0) {
        preview_status.value = 'error-index';
        preview.value = null;
        return;
    }
    if (!Number.isSafeInteger(count.value) || count.value < 1 || count.value > 1000) {
        preview_status.value = 'error-index';
        preview.value = null;
        return;
    }
    const n = get_notation(notation_id.value);
    if (!n) {
        preview_status.value = 'error-no-from-display';
        preview.value = notation_id.value || 'unknown';
        return;
    }

    const equiv_name = notation_equiv.value;
    const display_spec =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);

    if (!display_spec.from_display) {
        preview_status.value = 'error-no-from-display';
        preview.value = resolve_name(n.name) ?? n.id;
        return;
    }

    let expr: any;
    try {
        expr = display_spec.from_display(input_text.value);
    } catch {
        preview_status.value = 'error-parse';
        preview.value = null;
        return;
    }

    const result_display_data =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);
    const fs_fn =
        variant.value === 'FS_short' ? (n.FS_short ?? n.FS) : variant.value === 'FS_alter' ? (n.FS_alter ?? n.FS) : n.FS;
    if (!fs_fn) {
        preview_status.value = 'error-fs';
        preview.value = null;
        return;
    }
    const lines: string[] = [];
    try {
        for (let offset = 0; offset < count.value; offset++) {
            const index = FS_index.value + offset;
            if (!Number.isSafeInteger(index)) throw new Error('Fundamental-sequence index exceeds the safe integer range.');
            try {
                const result = fs_fn(expr, index);
                lines.push(`FS(${index}) = ${result_display_data.plain(result)}`);
            } catch (error) {
                lines.push(`FS(${index}) = Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        preview.value = lines.join('\n');
        preview_status.value = 'ok';
    } catch {
        preview_status.value = 'error-fs';
        preview.value = null;
    }
}

watch([input_text, FS_index, count, notation_id, notation_equiv, variant], () => {
    if (!visible.value) return;
    preview.value = null;
    preview_status.value = 'none';
});

export function use_expand_dialog() {
    function open(text: string, expand_settings?: ExpandSettings) {
        input_text.value = text;
        if (expand_settings) {
            FS_index.value = expand_settings.FS_index;
            count.value = expand_settings.count ?? 1;
            notation_id.value = expand_settings.notation_id || 'omega';
            notation_equiv.value = expand_settings.notation_equiv;
            variant.value = expand_settings.variant;
        } else if (!notation_id.value) {
            notation_id.value = 'omega';
            count.value = 1;
        }
        preview.value = null;
        preview_status.value = 'none';
        visible.value = true;
        window.setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('.expand-text-input');
            el?.focus();
        });
    }

    function close() {
        visible.value = false;
        const path = get_last_focus();
        if (path) focus_node(path);
    }

    function save_settings(): ExpandSettings | null {
        if (!notation_id.value) return null;
        return {
            FS_index: FS_index.value,
            count: count.value,
            notation_id: notation_id.value,
            notation_equiv: notation_equiv.value,
            variant: variant.value,
        };
    }

    function run(): void {
        run_core();
    }

    function confirm_and_fill() {
        if (preview_status.value !== 'ok' || preview.value === null || count.value !== 1) return;
        const path = get_last_focus();
        if (!path) return;
        const el = document.querySelector<HTMLInputElement>(`[data-tree-path="${path}"]`);
        if (!el) return;
        el.value = preview.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        close();
    }

    return {
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
        open,
        close,
        run,
        save_settings,
        confirm_and_fill,
    };
}
