<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { build_standalone, download_standalone, estimate_standalone_bytes } from '@/core/standalone_export.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import ModalDialog from './ModalDialog.vue';

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const show = ref(false);
const include_data = ref(true);
const title = ref('Notation Explorer');
const file_name = ref('notation-explorer-standalone.html');
const selected_ids = ref<string[]>([]);
const busy = ref(false);
const error = ref('');
const status = ref('');
const files = ref<LocalNotationFile[]>([]);

const selectable_files = computed(() => files.value.filter((file) => file.enabled && file.trusted && file.sourceRevision === file.loadedRevision));
const selected_count = computed(() => selected_ids.value.length);

function refresh(): void {
    files.value = runtime.listFiles();
    const available = new Set(selectable_files.value.map((file) => file.id));
    selected_ids.value = selected_ids.value.filter((id) => available.has(id));
    if (selected_ids.value.length === 0) selected_ids.value = [...available];
}

function open(): void {
    refresh();
    error.value = '';
    status.value = '';
    show.value = true;
}

function close(): void {
    if (!busy.value) show.value = false;
}

function toggle(id: string): void {
    selected_ids.value = selected_ids.value.includes(id)
        ? selected_ids.value.filter((value) => value !== id)
        : [...selected_ids.value, id];
}

function select_all(): void {
    selected_ids.value = selectable_files.value.map((file) => file.id);
}

function clear_selection(): void {
    selected_ids.value = [];
}

async function export_html(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    status.value = t('standalone-export.reading');
    try {
        const selected = selectable_files.value.filter((file) => selected_ids.value.includes(file.id));
        const result = await build_standalone({
            localFiles: selected,
            includeData: include_data.value,
            title: title.value,
            fileName: file_name.value,
        });
        download_standalone(result);
        status.value = `${t('standalone-export.ready')} (${Math.ceil(estimate_standalone_bytes(result) / 1024)} KiB)`;
    } catch (value) {
        error.value = value instanceof Error ? value.message : String(value);
        status.value = '';
    } finally {
        busy.value = false;
    }
}

watch(show, (visible) => {
    if (visible) refresh();
});

defineExpose({ open });
</script>

<template>
    <button type="button" @mousedown="open">{{ t('standalone-export.open') }}</button>
    <ModalDialog :show="show" :title="t('standalone-export.title')" @close="close">
        <div class="standalone-export">
            <p class="standalone-export__hint">{{ t('standalone-export.description') }}</p>
            <div class="standalone-export__fields">
                <label>
                    {{ t('standalone-export.title-field') }}
                    <input v-model="title" type="text" />
                </label>
                <label>
                    {{ t('standalone-export.file-name') }}
                    <input v-model="file_name" type="text" spellcheck="false" />
                </label>
            </div>
            <div class="standalone-export__selection">
                <div class="standalone-export__selection-header">
                    <strong>{{ t('standalone-export.local-files') }}</strong>
                    <span>{{ selected_count }}/{{ selectable_files.length }}</span>
                    <span class="standalone-export__selection-actions">
                        <button type="button" @click="select_all">{{ t('standalone-export.select-all') }}</button>
                        <button type="button" @click="clear_selection">{{ t('standalone-export.clear') }}</button>
                    </span>
                </div>
                <label v-for="file in selectable_files" :key="file.id" class="standalone-export__file">
                    <input :checked="selected_ids.includes(file.id)" type="checkbox" @change="toggle(file.id)" />
                    <span>{{ file.name }}</span>
                </label>
                <p v-if="selectable_files.length === 0" class="standalone-export__empty">
                    {{ t('standalone-export.no-local-files') }}
                </p>
            </div>
            <label class="standalone-export__snapshot">
                <input v-model="include_data" type="checkbox" />
                {{ t('standalone-export.include-data') }}
            </label>
            <p class="standalone-export__note">{{ t('standalone-export.builtin-note') }}</p>
            <p v-if="status" class="standalone-export__status" role="status">{{ status }}</p>
            <p v-if="error" class="standalone-export__error" role="alert">{{ error }}</p>
            <div class="standalone-export__actions">
                <button type="button" :disabled="busy" @click="export_html">
                    {{ busy ? t('standalone-export.busy') : t('standalone-export.export') }}
                </button>
                <button type="button" :disabled="busy" @click="close">{{ t('standalone-export.cancel') }}</button>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.standalone-export { min-width: min(560px, 80vw); max-width: 720px; }
.standalone-export__hint, .standalone-export__note { margin: 0 0 12px; color: var(--color-text-secondary); font-size: 13px; }
.standalone-export__fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.standalone-export__fields label { display: flex; flex-direction: column; gap: 4px; color: var(--color-text-secondary); font-size: 12px; }
.standalone-export__fields input { min-width: 0; height: 30px; box-sizing: border-box; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); font: inherit; }
.standalone-export__selection { margin-top: 14px; border: 1px solid var(--color-border-light); border-radius: 5px; }
.standalone-export__selection-header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--color-border-light); background: var(--color-bg-secondary); }
.standalone-export__selection-header > span { color: var(--color-text-secondary); font-size: 12px; }
.standalone-export__selection-actions { margin-left: auto; display: inline-flex; gap: 4px; }
.standalone-export__selection-actions button { padding: 2px 6px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); cursor: pointer; font: inherit; font-size: 12px; }
.standalone-export__file { display: flex; align-items: center; gap: 7px; padding: 6px 10px; font-size: 13px; }
.standalone-export__file:hover { background: var(--color-bg-hover); }
.standalone-export__empty { margin: 0; padding: 12px; color: var(--color-text-muted); font-size: 13px; }
.standalone-export__snapshot { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 13px; }
.standalone-export__status { margin: 10px 0 0; color: var(--color-success); font-size: 13px; }
.standalone-export__error { margin: 10px 0 0; color: var(--color-danger); white-space: pre-wrap; font-size: 13px; }
.standalone-export__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.standalone-export__actions button { min-height: 30px; padding: 4px 12px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-secondary); color: var(--color-text); cursor: pointer; font: inherit; }
.standalone-export__actions button:first-child { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-bg); font-weight: 600; }
.standalone-export__actions button:disabled { cursor: wait; opacity: .6; }
@media (max-width: 560px) { .standalone-export { min-width: 0; } .standalone-export__fields { grid-template-columns: 1fr; } }
</style>
