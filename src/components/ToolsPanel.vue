<script setup lang="ts">
import { inject, ref } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { translate_pps } from '@/core/pps_translation.ts';

const t = inject(I18N_KEY)!;
const pps_input = ref('0, 1, 0, 2, 0, 3');
const output = ref('');
const error = ref('');

function run_pps(): void {
    error.value = '';
    try { output.value = translate_pps(pps_input.value); }
    catch (value) { error.value = value instanceof Error ? value.message : String(value); }
}

</script>

<template>
    <section class="tools-page" :aria-label="t('tools.title')">
        <h2>{{ t('tools.title') }}</h2>
        <section class="tools-section">
            <h3>{{ t('tools.pps') }}</h3>
            <div class="tools-pps-row"><label>{{ t('tools.pps-input') }}<input v-model="pps_input" type="text" spellcheck="false" /></label><button type="button" class="tools-primary" @click="run_pps">{{ t('tools.translate') }}</button></div>
        </section>
        <p v-if="error" class="tools-error" role="alert">{{ error }}</p>
        <pre class="tools-output" aria-live="polite">{{ output }}</pre>
    </section>
</template>

<style scoped>
.tools-page { max-width: 1100px; }
.tools-page h2 { margin: 8px 0 14px; font-size: 20px; }
.tools-section { margin: 12px 0; padding: 12px; border: 1px solid var(--color-border-light); border-radius: 6px; background: var(--color-bg-secondary); }
.tools-section h3 { margin: 0 0 10px; font-size: 15px; }
.tools-pps-row label { display: flex; flex-direction: column; gap: 4px; color: var(--color-text-secondary); font-size: 12px; }
.tools-pps-row input { width: 100%; min-width: 0; height: 30px; box-sizing: border-box; padding: 3px 6px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); font: inherit; }
.tools-primary { margin-top: 10px; min-height: 30px; padding: 4px 12px; border: 1px solid var(--color-accent); border-radius: 4px; background: var(--color-accent); color: var(--color-bg); cursor: pointer; font: inherit; font-weight: 600; }
.tools-pps-row { display: flex; align-items: end; gap: 8px; }
.tools-pps-row label { flex: 1 1 280px; }
.tools-pps-row .tools-primary { flex: 0 0 auto; margin: 0; }
.tools-error { color: var(--color-danger); white-space: pre-wrap; }
.tools-output { min-height: 120px; margin: 14px 0; padding: 10px; overflow: auto; border: 1px solid var(--color-border-light); border-radius: 5px; background: var(--color-bg); color: var(--color-text); white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
@media (max-width: 560px) { .tools-pps-row { flex-direction: column; align-items: stretch; } .tools-pps-row .tools-primary { width: 100%; } }
</style>
