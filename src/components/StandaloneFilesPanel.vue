<script setup lang="ts">
import { computed, inject } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';

const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;

interface DownloadableSourceFile {
    id: string;
    name: string;
    source: string;
}

const builtin_files = computed<DownloadableSourceFile[]>(() => {
    const value = (
        window as typeof window & {
            __NE_STANDALONE_BUILTIN_FILES__?: unknown;
        }
    ).__NE_STANDALONE_BUILTIN_FILES__;
    if (!Array.isArray(value)) return [];
    return value
        .filter(
            (file): file is { name: string; source: string } =>
                file !== null &&
                typeof file === 'object' &&
                typeof (file as { name?: unknown }).name === 'string' &&
                typeof (file as { source?: unknown }).source === 'string',
        )
        .map((file) => ({ id: `builtin:${file.name}`, name: file.name, source: file.source }));
});

const files = computed<DownloadableSourceFile[]>(() => [
    ...builtin_files.value,
    ...runtime
        .listFiles()
        .filter((file) => file.enabled && file.trusted)
        .map((file) => ({ id: `local:${file.id}`, name: `Local/${file.name}`, source: file.source })),
]);

function download(file: DownloadableSourceFile): void {
    const blob = new Blob([file.source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name.replace(/[\\/]+/g, '__').replace(/[:*?"<>|]/g, '-');
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
        <p v-else>{{ t('standalone-export.no-bundled-files') }}</p>
    </section>
</template>

<style scoped>
.standalone-files {
    width: 100%;
    min-width: 0;
}
.standalone-files > strong {
    display: block;
    margin-bottom: 4px;
}
.standalone-files p {
    margin: 4px 0 12px;
    color: var(--color-text-secondary);
    font-size: 13px;
}
.standalone-files ul {
    margin: 0;
    padding: 0;
    list-style: none;
}
.standalone-files li {
    display: flex;
    min-height: 48px;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border-subtle);
}
.standalone-files li:first-child {
    border-top: 1px solid var(--color-border-subtle);
}
.standalone-files li span {
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-family-monospace, Consolas, monospace);
    font-size: 14px;
}
.standalone-files button {
    flex: 0 0 auto;
    margin-left: auto;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
}
.standalone-files button:hover {
    background: var(--color-bg-hover);
}

@media (max-width: 520px) {
    .standalone-files li {
        align-items: flex-start;
        flex-direction: column;
    }
    .standalone-files button {
        width: 100%;
        margin-left: 0;
    }
}
</style>
