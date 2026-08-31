<script setup lang="ts">
import { inject } from 'vue';
import FloatingPanel from './FloatingPanel.vue';
import { use_expand_dialog, type ExpandNote } from '@/composables/use_expand_dialog.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { resolve_name } from '@/notation-definition.ts';
import type { Settings } from '@/core/settings.ts';
import { direct_expand_panel_storage_key } from '@/core/storage_keys.ts';

const settings = inject(SETTINGS_KEY)! as Settings;
const t = inject(I18N_KEY)!;
const ed = use_expand_dialog();

function on_keydown(note: ExpandNote, e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (note.preview_status === 'ok' || e.ctrlKey) on_fill(note);
    else on_run(note);
}

function on_run(note: ExpandNote): void {
    ed.run(note.id);
}

function on_fill(note: ExpandNote): void {
    const saved = ed.save_settings(note.id);
    if (saved) settings.expand = saved;
    ed.confirm_and_fill(note.id);
}

function open_new(): void {
    ed.open('', settings.expand);
}
</script>

<template>
    <FloatingPanel
        v-for="(note, index) in ed.notes.value"
        :key="note.id"
        :show="true"
        :title="`${t('expand.title')} #${index + 1}`"
        :storage-key="direct_expand_panel_storage_key(note.id)"
        :initial-width="620"
        :initial-top="96 + (index % 6) * 28"
        :initial-right="64 + (index % 6) * 18"
        :min-width="360"
        :min-height="180"
        :resizable="true"
        @close="ed.close(note.id)"
    >
        <div class="expand-form" @keydown="on_keydown(note, $event)">
            <div class="expand-window-toolbar">
                <span class="expand-window-label">{{ t('expand.title') }}</span>
                <button
                    type="button"
                    class="expand-new-button"
                    :aria-label="t('expand.new-window')"
                    :title="t('expand.new-window')"
                    @click="open_new"
                >
                    +
                </button>
            </div>
            <div class="expand-controls">
                <label class="expand-field expand-field--wide">
                    <span>{{ t('expand.text') }}</span>
                    <input
                        :data-expand-note-id="note.id"
                        type="text"
                        class="expand-text-input"
                        spellcheck="false"
                        autocomplete="off"
                        :placeholder="t('expand.text-placeholder')"
                        v-model="note.input_text"
                        @input="ed.invalidate(note.id)"
                    />
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.fs-start') }}</span>
                    <input
                        type="number"
                        v-model.number="note.FS_index"
                        min="0"
                        step="1"
                        @input="ed.invalidate(note.id)"
                    />
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.count') }}</span>
                    <input
                        type="number"
                        v-model.number="note.count"
                        min="1"
                        max="1000"
                        step="1"
                        @input="ed.invalidate(note.id)"
                    />
                </label>
                <label class="expand-field expand-field--wide">
                    <span>{{ t('expand.notation') }}</span>
                    <select v-model="note.notation_id" @change="ed.invalidate(note.id)">
                        <option v-for="n in ed.notation_options.value" :key="n.id" :value="n.id">
                            {{ resolve_name(n.simple_name ?? n.name, t) ?? n.id }}
                        </option>
                    </select>
                </label>
                <label v-if="ed.equiv_options_for(note).length > 0" class="expand-field">
                    <span>{{ t('expand.equiv') }}</span>
                    <select v-model="note.notation_equiv" @change="ed.invalidate(note.id)">
                        <option value="">{{ t('equiv.none') }}</option>
                        <option v-for="k in ed.equiv_options_for(note)" :key="k" :value="k">{{ k }}</option>
                    </select>
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.fs-variant') }}</span>
                    <select v-model="note.variant" @change="ed.invalidate(note.id)">
                        <option value="FS_short">{{ t('fs-variant.short') }}</option>
                        <option value="FS">{{ t('fs-variant.normal') }}</option>
                        <option value="FS_alter">{{ t('fs-variant.alternative') }}</option>
                    </select>
                </label>
                <div class="expand-field expand-field--action">
                    <span aria-hidden="true">&nbsp;</span>
                    <button type="button" class="expand-btn expand-btn--primary" @click="on_run(note)">
                        {{ t('expand.run') }}
                    </button>
                </div>
            </div>
            <div class="expand-preview" aria-live="polite">
                <div v-if="note.preview_status === 'none'" class="expand-preview-hint">
                    {{ t('expand.manual-hint') }}
                </div>
                <div v-else-if="note.preview_status === 'ok'">
                    <pre class="expand-preview-result">{{ note.preview }}</pre>
                    <div v-if="note.count === 1" class="expand-preview-hint">{{ t('expand.fill-hint') }}</div>
                </div>
                <div v-else-if="note.preview_status === 'error-parse'" class="expand-preview-error">
                    {{ t('expand.error-parse') }}
                </div>
                <div v-else-if="note.preview_status === 'error-no-from-display'" class="expand-preview-error">
                    {{ t('expand.error-no-from-display', { name: note.preview ?? '' }) }}
                </div>
                <div v-else-if="note.preview_status === 'error-fs'" class="expand-preview-error">
                    {{ t('expand.error-fs') }}
                </div>
                <div v-else-if="note.preview_status === 'error-index'" class="expand-preview-error">
                    {{ t('expand.error-index') }}
                </div>
            </div>
            <div class="expand-row expand-buttons">
                <button
                    type="button"
                    @mousedown="on_fill(note)"
                    :disabled="note.preview_status !== 'ok' || note.count !== 1"
                    class="expand-btn"
                >
                    {{ t('expand.fill') }}
                </button>
                <button type="button" @mousedown="ed.close(note.id)" class="expand-btn">
                    {{ t('expand.cancel') }}
                </button>
            </div>
        </div>
    </FloatingPanel>
</template>

<style scoped>
.expand-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    min-width: 0;
}
.expand-window-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 26px;
}
.expand-window-label {
    color: var(--color-text-secondary);
    font-size: 12px;
}
.expand-new-button {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 18px;
    line-height: 1;
}
.expand-new-button:hover {
    background: var(--color-bg-hover);
}
.expand-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(110px, 0.45fr);
    gap: 10px;
    align-items: end;
}
.expand-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    color: var(--color-text-secondary);
    font-size: 12px;
}
.expand-field--wide {
    grid-column: 1 / -1;
}
.expand-field--action {
    align-items: stretch;
}
.expand-field input,
.expand-field select {
    width: 100%;
    min-width: 0;
    height: 32px;
    box-sizing: border-box;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: inherit;
    font-size: 14px;
}
.expand-field input:focus,
.expand-field select:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-bg);
}
.expand-text-input {
    font-size: 16px !important;
}
.expand-preview {
    width: 100%;
    min-height: 64px;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid var(--color-border-light);
    border-radius: 6px;
    background: var(--color-bg-secondary);
    font-family: inherit;
    font-size: 14px;
    word-break: break-all;
}
.expand-preview-hint {
    margin-top: 6px;
    color: var(--color-text-secondary);
    font-family: inherit;
}
.expand-preview-result {
    margin: 0;
    color: var(--color-text);
    overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    white-space: pre-wrap;
}
.expand-preview-error {
    color: var(--color-danger);
    font-family: inherit;
}
.expand-buttons {
    justify-content: flex-end;
    gap: 8px;
}
.expand-btn {
    min-width: 96px;
    min-height: 32px;
    padding: 5px 14px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}
.expand-btn:hover {
    background: var(--color-bg-hover);
}
.expand-btn--primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
    font-weight: 600;
}
.expand-btn--primary:hover {
    background: var(--color-accent-hover);
}
.expand-btn:disabled {
    border-color: var(--color-border-light);
    background: var(--color-bg-secondary);
    color: var(--color-text-muted);
    cursor: default;
}
@media (max-width: 560px) {
    .expand-controls {
        grid-template-columns: minmax(0, 1fr);
    }
    .expand-field--wide {
        grid-column: auto;
    }
    .expand-buttons {
        flex-direction: column-reverse;
    }
    .expand-btn {
        width: 100%;
    }
}
</style>
