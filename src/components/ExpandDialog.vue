<script setup lang="ts">
import { inject } from 'vue';
import FloatingPanel from './FloatingPanel.vue';
import { use_expand_dialog } from '@/composables/use_expand_dialog.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { resolve_name } from '@/notation-definition.ts';
import type { Settings } from '@/core/settings.ts';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();
const settings = inject(SETTINGS_KEY)! as Settings;
const t = inject(I18N_KEY)!;
const ed = use_expand_dialog();

function on_keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (ed.preview_status.value === 'ok' || e.ctrlKey) on_fill();
        else on_run();
    }
}

function on_run() {
    ed.run();
}

function on_fill() {
    const saved = ed.save_settings();
    if (saved) settings.expand = saved;
    ed.confirm_and_fill();
}
</script>

<template>
    <FloatingPanel
        :show="show"
        :title="t('expand.title')"
        storage-key="ne-direct-expand-panel-geometry"
        :initial-width="620"
        :initial-top="96"
        :initial-right="64"
        :min-width="360"
        :min-height="0"
        @close="emit('close')"
    >
        <div class="expand-form" @keydown="on_keydown">
            <div class="expand-controls">
                <label class="expand-field expand-field--wide">
                    <span>{{ t('expand.text') }}</span>
                    <input
                        type="text"
                        class="expand-text-input"
                        spellcheck="false"
                        autocomplete="off"
                        :placeholder="t('expand.text-placeholder')"
                        v-model="ed.input_text.value"
                    />
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.fs-start') }}</span>
                    <input type="number" v-model.number="ed.FS_index.value" min="0" step="1" />
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.count') }}</span>
                    <input type="number" v-model.number="ed.count.value" min="1" max="1000" step="1" />
                </label>
                <label class="expand-field expand-field--wide">
                    <span>{{ t('expand.notation') }}</span>
                    <select v-model="ed.notation_id.value">
                        <option v-for="n in ed.notation_options.value" :key="n.id" :value="n.id">
                            {{ resolve_name(n.simple_name ?? n.name, t) }}
                        </option>
                    </select>
                </label>
                <label v-if="ed.equiv_options.value.length > 0" class="expand-field">
                    <span>{{ t('expand.equiv') }}</span>
                    <select v-model="ed.notation_equiv.value">
                        <option value="">{{ t('equiv.none') }}</option>
                        <option v-for="k in ed.equiv_options.value" :key="k" :value="k">{{ k }}</option>
                    </select>
                </label>
                <label class="expand-field">
                    <span>{{ t('expand.fs-variant') }}</span>
                    <select v-model="ed.variant.value">
                        <option value="FS_short">{{ t('fs-variant.short') }}</option>
                        <option value="FS">{{ t('fs-variant.normal') }}</option>
                        <option value="FS_alter">{{ t('fs-variant.alternative') }}</option>
                    </select>
                </label>
                <div class="expand-field expand-field--action">
                    <span aria-hidden="true">&nbsp;</span>
                    <button type="button" class="expand-btn expand-btn--primary" @click="on_run">
                        {{ t('expand.run') }}
                    </button>
                </div>
            </div>
            <div class="expand-preview" aria-live="polite">
                <div v-if="ed.preview_status.value === 'none'" class="expand-preview-hint">
                    {{ t('expand.manual-hint') }}
                </div>
                <div v-else-if="ed.preview_status.value === 'ok'">
                    <pre class="expand-preview-result">{{ ed.preview.value }}</pre>
                    <div v-if="ed.count.value === 1" class="expand-preview-hint">{{ t('expand.fill-hint') }}</div>
                </div>
                <div v-else-if="ed.preview_status.value === 'error-parse'" class="expand-preview-error">
                    {{ t('expand.error-parse') }}
                </div>
                <div v-else-if="ed.preview_status.value === 'error-no-from-display'" class="expand-preview-error">
                    {{ t('expand.error-no-from-display', { name: ed.preview.value! }) }}
                </div>
                <div v-else-if="ed.preview_status.value === 'error-fs'" class="expand-preview-error">
                    {{ t('expand.error-fs') }}
                </div>
                <div v-else-if="ed.preview_status.value === 'error-index'" class="expand-preview-error">
                    {{ t('expand.error-index') }}
                </div>
            </div>
            <div class="expand-row expand-buttons">
                <button
                    type="button"
                    @mousedown="on_fill"
                    :disabled="ed.preview_status.value !== 'ok' || ed.count.value !== 1"
                    class="expand-btn"
                >
                    {{ t('expand.fill') }}
                </button>
                <button type="button" @mousedown="emit('close')" class="expand-btn">
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
    font-family: inherit;
    font-size: 14px;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg);
    color: var(--color-text);
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
    border: 1px solid var(--color-border-light);
    border-radius: 6px;
    padding: 12px;
    min-height: 64px;
    font-family: inherit;
    font-size: 14px;
    background: var(--color-bg-secondary);
    width: 100%;
    box-sizing: border-box;
    word-break: break-all;
}
.expand-preview-hint {
    color: var(--color-text-secondary);
    font-family: inherit;
    margin-top: 6px;
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
    font-family: inherit;
    font-size: 14px;
    padding: 5px 14px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
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
    color: var(--color-text-muted);
    border-color: var(--color-border-light);
    background: var(--color-bg-secondary);
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
