<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import FloatingPanel from './FloatingPanel.vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';

const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();
const note = ref('');

function storage_key(): string {
    return `ne-note-${save_load.notation.value?.id ?? ''}`;
}

function load_note(): void {
    const id = save_load.notation.value?.id;
    if (!id) {
        note.value = '';
        return;
    }
    try {
        note.value = localStorage.getItem(storage_key()) ?? '';
    } catch {
        note.value = '';
    }
}

watch(
    [() => ui.show_notes.value, () => save_load.notation.value?.id],
    ([visible]) => {
        if (visible) load_note();
    },
    { immediate: true },
);

watch(note, (value) => {
    if (!ui.show_notes.value || !save_load.notation.value?.id) return;
    try {
        localStorage.setItem(storage_key(), value);
    } catch {
        // Private browsing or storage quota failures should not block editing.
    }
});
</script>

<template>
    <FloatingPanel
        :show="ui.show_notes.value"
        :title="t('toolbar.notes')"
        storage-key="ne-notes-panel-geometry"
        :initial-width="480"
        :initial-height="360"
        :min-width="300"
        :min-height="220"
        resizable
        @close="ui.show_notes.value = false"
    >
        <textarea v-model="note" class="notes-textarea" :placeholder="t('notes.placeholder')" spellcheck="false" />
    </FloatingPanel>
</template>

<style scoped>
.notes-textarea {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    resize: none;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    line-height: 1.5;
}
</style>
