<script setup lang="ts">
import { computed, inject } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { resolve_name } from '@/notation-definition.ts';
import { get_notation } from '@/core/registry.ts';
import { get_script_notation_ids } from '@/core/user_defined_notation.ts';
import ModalDialog from './ModalDialog.vue';

const t = inject(I18N_KEY)!;
const settings = inject(SETTINGS_KEY)!;
const ui = use_ui_states();

const items = computed(() => {
    ui.registry_notifier.listen();
    return get_script_notation_ids(ui.user_defined_active_tab.value)
        .map((id) => get_notation(id))
        .filter((n): n is NonNullable<typeof n> => n !== undefined);
});

function navigate(id: string): void {
    settings.current_notation_id = id;
}
</script>

<template>
    <ModalDialog
        :show="ui.show_user_defined_nav.value"
        :title="t('user-defined.nav-to-notation')"
        @close="ui.show_user_defined_nav.value = false"
    >
        <div v-if="items.length === 0" class="nav-empty">{{ t('user-defined.nav-empty') }}</div>
        <div v-else class="nav-list">
            <button
                v-for="n in items"
                :key="n.id"
                class="nav-btn"
                :class="{ 'nav-btn--current': n.id === settings.current_notation_id }"
                @mousedown.prevent="navigate(n.id)"
            >
                {{ resolve_name(n.simple_name ?? n.name, t) }}
            </button>
        </div>
    </ModalDialog>
</template>

<style scoped>
.nav-empty {
    color: var(--color-text-muted);
    font-size: 14px;
    padding: 8px 0;
}

.nav-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 0;
    max-width: 480px;
}

.nav-btn {
    padding: 2px 10px;
    border: 2px solid var(--color-primary);
    border-radius: 10px;
    font-size: 16px;
    font-family: inherit;
    cursor: pointer;
    background: var(--color-primary-bg);
    color: var(--color-text);
}

.nav-btn:hover {
    background: var(--color-primary-hover);
}

button.nav-btn--current {
    background: var(--color-primary-active);
    color: var(--color-bg);
}
</style>
