<script setup lang="ts">
import { computed, inject } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const files = computed(() => runtime.listFiles().filter((file) => file.enabled && file.trusted));

function download(file: { name: string; source: string }): void {
    const blob = new Blob([file.source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name.replace(/[\\/:*?"<>|]/g, '-');
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
</script>

<template>
<section class="standalone-files">
    <strong>{{ t('standalone-export.bundled-files') }}</strong>
    <p>{{ t('standalone-export.readonly-note') }}</p>
    <ul v-if="files.length">
        <li v-for="file in files" :key="file.id">
            <span>{{ file.name }}</span>
            <button type="button" @click="download(file)">{{ t('standalone-export.download-source') }}</button>
        </li>
    </ul>
    <p v-else>{{ t('standalone-export.no-local-files') }}</p>
</section>
</template>

<style scoped>
.standalone-files { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-border-subtle); }
.standalone-files p { margin: 4px 0 8px; color: var(--color-text-secondary); font-size: 12px; }
.standalone-files ul { margin: 0; padding: 0; list-style: none; }
.standalone-files li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.standalone-files li span { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.standalone-files button { margin-left: auto; padding: 2px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-secondary); color: var(--color-text); cursor: pointer; font: inherit; font-size: 12px; }
</style>
