<script setup lang="ts">
import { computed, inject } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const { notation } = inject(SAVE_LOAD_KEY)!;

const options = computed(() => {
    const current = notation.value;
    if (!current?.display_equiv) return [];
    return Object.keys(current.display_equiv).map((id) => {
        const spec = current.display_equiv![id];
        const name_id = typeof spec !== 'function' && spec.name_id ? spec.name_id : undefined;
        return { id, label: name_id ? t(name_id) : id };
    });
});

const original_label = computed(() => {
    const current = notation.value;
    if (!current) return t('equiv.default');
    const name_id =
        typeof current.display !== 'function' && current.display.name_id ? current.display.name_id : undefined;
    return name_id ? t(name_id) : t('equiv.default');
});

const active_id = computed(() => settings.equiv_active[settings.current_notation_id] ?? '');

function set_active(id: string): void {
    settings.equiv_active = {
        ...settings.equiv_active,
        [settings.current_notation_id]: id || undefined,
    };
}

function set_hide_original(event: Event): void {
    settings.equiv_hide_original = {
        ...settings.equiv_hide_original,
        [settings.current_notation_id]: (event.target as HTMLInputElement).checked,
    };
}
</script>

<template>
    <div v-if="options.length > 0" class="equiv-bar" role="group" :aria-label="t('equiv.label')">
        <span class="equiv-bar__label">{{ t('equiv.label') }}</span>
        <button type="button" :class="{ active: !active_id }" :aria-pressed="!active_id" @click="set_active('')">
            {{ original_label }}
        </button>
        <button
            v-for="option in options"
            :key="option.id"
            type="button"
            :class="{ active: active_id === option.id }"
            :aria-pressed="active_id === option.id"
            @click="set_active(option.id)"
        >
            {{ option.label }}
        </button>
        <label v-if="active_id" class="equiv-bar__toggle">
            <input
                type="checkbox"
                :checked="settings.equiv_hide_original[settings.current_notation_id] ?? true"
                @change="set_hide_original"
            />
            <span>{{ t('equiv.hide-original') }}</span>
        </label>
    </div>
</template>

<style scoped>
.equiv-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin: -4px 0 12px;
    color: var(--color-text-secondary);
    font-size: 12px;
}

.equiv-bar__label {
    margin-right: 2px;
    font-weight: 600;
}

.equiv-bar > button {
    min-height: 28px;
    padding: 3px 9px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
}

.equiv-bar > button:hover {
    border-color: var(--color-text-muted);
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.equiv-bar > button.active,
.equiv-bar > button.active:hover {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
}

.equiv-bar__toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    cursor: pointer;
}

.equiv-bar__toggle input {
    margin: 0;
}
</style>
