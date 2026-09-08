<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { resolve_display, resolve_name } from '@/notation-definition.ts';
import { get_category, get_init_variant_meta, get_notation, remove_init_variant } from '@/core/registry.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import InitVariantPanel from '@/components/InitVariantPanel.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import { use_ui_states } from '@/composables/use_ui_states.ts';

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();

const show_panel = ref(false);
const show_delete_confirm = ref(false);

/** 当前页面所属 base: variant 页取其 base_id, 普通页即自身。 */
const page_meta = computed(() => {
    ui.registry_notifier.listen();
    return get_init_variant_meta(settings.current_notation_id);
});
const base_id = computed(() => page_meta.value?.base_id ?? settings.current_notation_id);
const base = computed(() => {
    ui.registry_notifier.listen();
    return get_notation(base_id.value);
});
const current = computed(() => {
    ui.registry_notifier.listen();
    return get_notation(settings.current_notation_id);
});

watch([() => settings.current_notation_id, () => ui.registry_notifier.listen()], () => {
    show_panel.value = false;
    show_delete_confirm.value = false;
});

/** 当前页等价表示 id(null = 原记号), 若其有 from_display。 */
const current_equiv = computed<{ id: string | null; from_display: boolean }>(() => {
    const n = current.value;
    if (!n) return { id: null, from_display: false };
    const equiv_id = settings.equiv_active[n.id];
    if (equiv_id && n.display_equiv?.[equiv_id]) {
        return { id: equiv_id, from_display: !!resolve_display(n.display_equiv[equiv_id]).from_display };
    }
    return { id: null, from_display: !!resolve_display(n.display).from_display };
});

/** 显示条件: base 主显示与当前等价均有 from_display; 且 base 不在 generator 分类。 */
const show_create = computed(() => {
    const n = base.value;
    if (!n) return false;
    if (n.category_id && get_category(n.category_id)?.generator) return false;
    if (!resolve_display(n.display).from_display) return false;
    return current_equiv.value.from_display;
});

const current_is_variant = computed(() => page_meta.value !== undefined);

const current_label = computed(() => {
    const meta = page_meta.value;
    if (meta) {
        const b = get_notation(meta.base_id);
        const spec = settings.notation_name_mode === 'simple' ? (b?.simple_name ?? b?.name) : b?.name;
        const label = resolve_name(spec, t);
        return (label ?? settings.current_notation_id) + ' (' + t('variant.label', { n: String(meta.seq) }) + ')';
    }
    const n = current.value;
    if (!n) return settings.current_notation_id;
    const spec = settings.notation_name_mode === 'simple' ? (n.simple_name ?? n.name) : n.name;
    return resolve_name(spec, t) ?? n.id;
});

function open_panel() {
    show_panel.value = true;
}

function on_created(id: string) {
    settings.current_notation_id = id;
    show_panel.value = false;
}

function do_delete() {
    const meta = page_meta.value;
    if (!meta) return;
    const vid = settings.current_notation_id; // 变体页 id
    show_delete_confirm.value = false;
    // 先切回 base(自动保存会写 base 的数据), 再删除变体并清理其树数据(内存树 + 自动保存的分析)
    settings.current_notation_id = meta.base_id;
    save_load.remove_notation_data(vid);
    remove_init_variant(vid);
}
</script>

<template>
    <div v-if="current && (show_create || current_is_variant)" class="iv-bar">
        <button v-if="show_create" class="iv-bar-btn" @click="open_panel">
            {{ t('variant.modify-initial') }}
        </button>
        <button
            v-if="current_is_variant"
            class="iv-bar-btn iv-bar-btn--danger"
            @click="show_delete_confirm = true"
        >
            {{ t('variant.delete-variant') }}
        </button>
    </div>

    <InitVariantPanel
        v-if="show_panel && show_create"
        :base_id="base_id"
        :equiv_id="current_equiv.id"
        @created="on_created"
        @close="show_panel = false"
    />

    <ModalDialog :show="show_delete_confirm" :title="t('variant.delete-title', { label: current_label })" @close="show_delete_confirm = false">
            <p class="iv-confirm-message">{{ t('variant.delete-message') }}</p>
            <div class="iv-confirm-buttons">
                <button class="iv-confirm-btn iv-confirm-cancel" @click="show_delete_confirm = false">
                    {{ t('variant.cancel') }}
                </button>
                <button class="iv-confirm-btn iv-confirm-danger" @click="do_delete">
                    {{ t('variant.delete-confirm') }}
                </button>
            </div>
    </ModalDialog>
</template>

<style scoped>
.iv-bar {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
}
.iv-bar-btn {
    font: inherit;
    cursor: pointer;
    padding: 3px 12px;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    background: var(--color-bg, #fff);
}
.iv-bar-btn--danger {
    color: var(--color-danger, #c00);
}
.iv-confirm-message {
    margin: 0 0 12px;
    color: var(--color-text-secondary, #888);
}
.iv-confirm-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
.iv-confirm-btn {
    font: inherit;
    padding: 3px 10px;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    background: var(--color-bg, #fff);
    cursor: pointer;
}
.iv-confirm-danger {
    background: var(--color-danger, #c00);
    color: #fff;
}
</style>
