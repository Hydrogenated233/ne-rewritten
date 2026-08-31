<script setup lang="ts">
import { inject, ref } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { use_diagram } from '@/composables/use_diagram.ts';
import { use_expand_dialog } from '@/composables/use_expand_dialog.ts';
import { import_analysis_eager } from '@/core/analysis.ts';
import { resolve_display } from '@/notation-definition.ts';
import { focus_node_input, get_last_focus } from '@/composables/use_focus_tracker.ts';

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();
const expand_dialog_state = use_expand_dialog();
const { notation, root } = save_load;
const { hide, show: show_diagram, dispatch_action } = use_diagram();

const find_input = ref<HTMLInputElement>();

function handle_find(): void {
    const n = notation.value;
    const r = root.value;
    const val = find_input.value?.value;
    if (!n || !r || !val) return;
    const equiv_name = settings.equiv_active[n.id];
    const display_spec =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);
    if (!display_spec.from_display) return;
    try {
        const expr = display_spec.from_display(val);
        const matched = import_analysis_eager(r, [{ expr, analysis: [] }], n, settings.variant, settings.max_find_fs);
        if (matched.length > 0) {
            focus_node_input(matched[0]);
        } else {
            alert(t('import.error'));
        }
    } catch {
        alert(t('import.error'));
    }
}

function on_find_input(): void {
    const n = notation.value;
    const val = find_input.value?.value;
    if (!n || !val) {
        hide();
        return;
    }
    const dc = n.draw_diagram;
    if (!dc || !settings.show_diagram) return;
    const equiv_name = settings.equiv_active[n.id];
    const display_spec =
        equiv_name && n.display_equiv?.[equiv_name]
            ? resolve_display(n.display_equiv[equiv_name])
            : resolve_display(n.display);
    if (!display_spec.from_display) return;
    try {
        const expr = display_spec.from_display(val);
        const el = find_input.value;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        show_diagram(dc, expr, rect.left, 60 + rect.height, equiv_name ?? undefined);
    } catch {
        hide();
    }
}

function on_find_focus(e: FocusEvent): void {
    const el = e.target as HTMLInputElement;
    const rect = el.getBoundingClientRect();
    window.scrollTo({ top: rect.top + window.scrollY - 60, behavior: 'smooth' });
    on_find_input();
}

function on_find_keydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
        e.preventDefault();
        handle_find();
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        dispatch_action({ type: 'scroll', direction: 'up', step: 1 });
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        dispatch_action({ type: 'scroll', direction: 'down', step: 1 });
    } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        dispatch_action({ type: 'scroll', direction: 'left', step: 1 });
    } else if (e.key === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        dispatch_action({ type: 'scroll', direction: 'right', step: 1 });
    }
}

function open_direct_expand(): void {
    const path = get_last_focus();
    const current = path ? document.querySelector<HTMLInputElement>(`[data-tree-path="${path}"]`)?.value ?? '' : '';
    expand_dialog_state.open(current, settings.expand);
}
</script>

<template>
    <div class="explore-toolbar settings-box toolbar">
        <div class="toolbar-row explore-export-row">
            <label class="export-hide-toggle">
                <input type="checkbox" v-model="settings.export_hide" />
                {{ t('toolbar.export-hide') }}
            </label>
        </div>
        <div class="toolbar-row explore-actions">
            <button @mousedown.prevent="ui.show_hotkeys.value = true">{{ t('toolbar.hotkeys') }}</button>
            <button class="reset-btn" @mousedown.prevent="ui.show_reset.value = true">
                {{ t('toolbar.reset') }}
            </button>
            <button @mousedown.prevent="save_load.handle_export()">{{ t('toolbar.export') }}</button>
            <button @mousedown.prevent="save_load.handle_import()">{{ t('toolbar.import') }}</button>
            <button @mousedown.prevent="ui.show_notes.value = true">{{ t('toolbar.notes') }}</button>
            <button @mousedown.prevent="open_direct_expand">{{ t('toolbar.direct-expand') }}</button>
            <button class="toolbar-btn-tips" @mousedown.prevent="ui.show_tips.value = true">
                {{ t('toolbar.tips') }}
            </button>
        </div>
        <div class="toolbar-row explore-find-row">
            <label class="find-label">
                {{ t('find-notation.label') }}
                <input
                    ref="find_input"
                    type="text"
                    spellcheck="false"
                    @focus="on_find_focus"
                    @input="on_find_input"
                    @keydown="on_find_keydown"
                />
                <button @mousedown.prevent="handle_find">{{ t('find-notation.find') }}</button>
            </label>
        </div>
    </div>
</template>

<style scoped>
.explore-toolbar {
    margin: 8px 0 12px;
}

.explore-actions {
    margin-top: 2px;
}

.explore-export-row {
    margin-top: 0;
    margin-bottom: 0;
}

.export-hide-toggle {
    margin-right: 4px;
}

.explore-find-row {
    margin-bottom: 0;
}
</style>
