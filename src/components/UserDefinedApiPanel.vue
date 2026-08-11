<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { get_katex, load_katex } from '@/composables/use_katex.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import ModalDialog from './ModalDialog.vue';
import API_MD from '@/assets/api.md?raw';
import API_TS from '@/assets/api.ts?raw';

const t = inject(I18N_KEY)!;
const ui = use_ui_states();

type Tab = 'md' | 'ts';
const active_tab = ref<Tab>('md');

// marked / katex 按需加载: 面板打开时才动态 import
const marked_ready = ref(false);
let marked_module: typeof import('marked') | null = null;

async function load_doc_libs(): Promise<void> {
    if (marked_ready.value) return;
    const [mod] = await Promise.all([import('marked'), load_katex()]);
    marked_module = mod;
    marked_ready.value = true;
}

watch(
    () => ui.show_api_doc.value,
    (show) => {
        if (show) void load_doc_libs();
    },
);

const html = computed(() => {
    if (!marked_ready.value || !marked_module) return '';
    const katex = get_katex();
    if (!katex) return '';
    // render LaTeX math before markdown, so that math delimiters don't get mangled
    const with_math = API_MD.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    }).replace(/\$([^$\n]+?)\$/g, (_, math: string) => {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    });
    return marked_module.marked(with_math);
});

function download() {
    const content = active_tab.value === 'md' ? API_MD : API_TS;
    const filename = active_tab.value === 'md' ? 'api.md' : 'api.ts';
    const type = active_tab.value === 'md' ? 'text/markdown' : 'text/typescript';
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
</script>

<template>
    <ModalDialog
        :show="ui.show_api_doc.value"
        :title="t('user-defined.api-doc')"
        @close="ui.show_api_doc.value = false"
    >
        <div class="api-tabs">
            <button
                class="api-tab"
                :class="{ 'api-tab--active': active_tab === 'md' }"
                @mousedown.prevent="active_tab = 'md'"
            >
                api.md
            </button>
            <button
                class="api-tab"
                :class="{ 'api-tab--active': active_tab === 'ts' }"
                @mousedown.prevent="active_tab = 'ts'"
            >
                api.ts
            </button>
        </div>
        <div v-if="active_tab === 'md'" class="api-content" v-html="html" />
        <pre v-else class="api-pre"><code>{{ API_TS }}</code></pre>
        <button class="api-download" @mousedown="download">
            {{ t('user-defined.download') }} {{ active_tab === 'md' ? 'api.md' : 'api.ts' }}
        </button>
    </ModalDialog>
</template>

<style scoped>
:deep(.modal-dialog) {
    width: 640px !important;
    min-width: 640px !important;
    max-width: 640px !important;
}

:deep(.modal-body) {
    padding: 0;
    overflow: hidden;
}

.api-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border-subtle);
}

.api-tab {
    flex: 1;
    padding: 8px;
    border: none;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}

.api-tab--active {
    background: var(--color-bg);
    color: var(--color-text);
    font-weight: 600;
}

.api-tab:not(:last-child) {
    border-right: 1px solid var(--color-border-subtle);
}

.api-content {
    width: 640px;
    height: 480px;
    overflow-y: auto;
    overflow-x: hidden;
    word-break: break-word;
    padding: 8px;
    box-sizing: border-box;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.6;
}

.api-content :deep(h1),
.api-content :deep(h2),
.api-content :deep(h3) {
    margin: 0.8em 0 0.4em;
}

.api-content :deep(p) {
    margin: 0.4em 0;
}

.api-content :deep(code) {
    background: var(--color-bg-secondary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
}

.api-content :deep(pre) {
    background: var(--color-bg-secondary);
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
}

/* api.ts 只读展示: 与 api.md 渲染的 markdown 代码块同款格式 */
.api-pre {
    width: 640px;
    height: 480px;
    margin: 0;
    box-sizing: border-box;
    overflow: auto;
    background: var(--color-bg-secondary);
    padding: 12px;
    border-radius: 6px;
    color: var(--color-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    line-height: 1.6;
    white-space: pre;
}

.api-download {
    display: block;
    margin: 12px auto 0;
    padding: 4px 16px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}

.api-download:hover {
    background: var(--color-bg-hover);
}
</style>
