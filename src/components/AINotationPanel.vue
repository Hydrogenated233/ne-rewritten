<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { app_storage } from '@/core/storage.ts';
import { APP_STORAGE_KEYS } from '@/core/storage_keys.ts';
import {
    AIRequestNetworkError,
    clear_ai_session_api_key,
    generate_notation,
    read_ai_session_settings,
    write_ai_session_settings,
    type AIChatMessage,
    type AIProgressEvent,
} from '@/core/ai_notation_assistant.ts';
import { compact_ai_activity, record_ai_activity, type AIActivityEntry as ActivityEntry } from '@/core/ai_activity_log.ts';

interface Conversation {
    id: string;
    title: string;
    prompt: string;
    messages: AIChatMessage[];
    activity: ActivityEntry[];
    fileId: string;
    fileName: string;
    error: string;
    notice: string;
    busy: boolean;
    cancelled: boolean;
    archived: boolean;
    createdAt: number;
    updatedAt: number;
    startedAt: number;
    finishedAt: number;
}

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;
const ui = use_ui_states();

const STORAGE_KEY = APP_STORAGE_KEYS.aiConversations;
const apiSettings = read_ai_session_settings();
const base_url = ref(apiSettings.baseUrl || '');
const api_key = ref(apiSettings.apiKey || '');
const model = ref(apiSettings.model || 'gpt-4o-mini');
const show_api_key = ref(false);
const max_rounds = ref(apiSettings.maxRounds ?? 64);
const conversations = ref<Conversation[]>(load_conversations());
const active_id = ref(conversations.value.find((item) => !item.archived)?.id ?? '');
const next_activity_id = ref(Math.max(0, ...conversations.value.flatMap((item) => item.activity.map((entry) => entry.id))) + 1);
let controller: AbortController | null = null;
const clock_now = ref(Date.now());
let clock_timer: ReturnType<typeof setInterval> | null = null;

const copy = computed(() =>
    settings.language === 'zh'
        ? {
              title: 'AI 记号生成',
              hint: '输入需求后生成 ne-rewritten 记号源代码。结果只会写入未信任、未启用的本地文件。',
              baseUrl: 'Base URL',
              apiKey: 'API Key',
              model: '模型',
              prompt: '需求描述',
              promptPlaceholder: '例如：生成 ε₀ 以下的 Cantor 范式基本列记号。',
              keyWarning: '该 Base URL 服务会收到此 Key，并且服务必须允许 CORS。Key 只保存在内存或 sessionStorage。',
              newSession: '新会话',
              archive: '归档',
              restore: '恢复',
              delete: '删除',
              archived: '归档会话',
              active: '进行中',
              generate: '生成记号',
              stop: '中断',
              restart: '重新运行',
              clearKey: '清除 Key',
              rounds: '最大轮数',
              activity: 'Agent 活动',
              details: '详细信息',
              noActivity: '尚未开始',
              generated: '已写入本地编辑器：',
              openEditor: '打开本地编辑器',
              empty: '暂无会话',
              confirmArchive: '归档当前会话？之后可以在归档列表恢复。',
              confirmDelete: '永久删除该归档会话？',
              failed: '生成失败',
          }
        : {
              title: 'AI notation generation',
              hint: 'Describe the notation and generate native ne-rewritten source. The result is staged as an untrusted, disabled local file.',
              baseUrl: 'Base URL',
              apiKey: 'API Key',
              model: 'Model',
              prompt: 'Request',
              promptPlaceholder: 'For example: generate Cantor normal form fundamental sequences below epsilon_0.',
              keyWarning: 'The Base URL service receives this key and must allow CORS. The key is kept only in memory or sessionStorage.',
              newSession: 'New session',
              archive: 'Archive',
              restore: 'Restore',
              delete: 'Delete',
              archived: 'Archived',
              active: 'Active',
              generate: 'Generate notation',
              stop: 'Stop',
              restart: 'Restart',
              clearKey: 'Clear key',
              rounds: 'Max rounds',
              activity: 'Agent activity',
              details: 'Details',
              noActivity: 'Not started',
              generated: 'Written to local editor: ',
              openEditor: 'Open local editor',
              empty: 'No sessions',
              confirmArchive: 'Archive this session? It can be restored from the archive list.',
              confirmDelete: 'Permanently delete this archived session?',
              failed: 'Generation failed',
          },
);

const active = computed(() => conversations.value.find((item) => item.id === active_id.value) ?? null);
const active_conversations = computed(() => conversations.value.filter((item) => !item.archived));
const archived_conversations = computed(() => conversations.value.filter((item) => item.archived));
const elapsed = computed(() => {
    const item = active.value;
    if (!item?.startedAt) return '';
    const end = item.busy ? clock_now.value : item.finishedAt || clock_now.value;
    return `${Math.max(0, Math.floor((end - item.startedAt) / 1000))}s`;
});

function id(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ai-${Date.now()}-${Math.random()}`;
}

function fresh_conversation(): Conversation {
    const now = Date.now();
    return {
        id: id(),
        title: settings.language === 'zh' ? '新记号会话' : 'New notation session',
        prompt: '',
        messages: [],
        activity: [],
        fileId: '',
        fileName: '',
        error: '',
        notice: '',
        busy: false,
        cancelled: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        startedAt: 0,
        finishedAt: 0,
    };
}

function load_conversations(): Conversation[] {
    try {
        const raw = app_storage()?.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [fresh_conversation()];
        const restored = parsed.filter((item) => item && typeof item.id === 'string').map((item) => {
            const restored_item = { ...fresh_conversation(), ...item, busy: false };
            restored_item.activity = compact_ai_activity(Array.isArray(restored_item.activity) ? restored_item.activity : []);
            return restored_item;
        });
        return restored.length ? restored : [fresh_conversation()];
    } catch {
        return [fresh_conversation()];
    }
}

function persist(): void {
    try {
        app_storage()?.setItem(STORAGE_KEY, JSON.stringify(conversations.value));
    } catch {
        // A full/private localStorage must not prevent the current run.
    }
}

function set_active(item: Conversation): void {
    active_id.value = item.id;
}

function new_session(): void {
    const item = fresh_conversation();
    conversations.value.unshift(item);
    active_id.value = item.id;
    persist();
}

function archive_active(): void {
    const item = active.value;
    if (!item || item.busy || !window.confirm(copy.value.confirmArchive)) return;
    item.archived = true;
    item.updatedAt = Date.now();
    const next = active_conversations.value[0] ?? archived_conversations.value[0];
    if (next) active_id.value = next.id;
    persist();
}

function restore(item: Conversation): void {
    item.archived = false;
    item.updatedAt = Date.now();
    active_id.value = item.id;
    persist();
}

function delete_archived(item: Conversation): void {
    if (!item.archived || !window.confirm(copy.value.confirmDelete)) return;
    conversations.value = conversations.value.filter((candidate) => candidate.id !== item.id);
    if (!conversations.value.length) {
        const fresh = fresh_conversation();
        conversations.value.push(fresh);
        active_id.value = fresh.id;
    } else if (!conversations.value.some((candidate) => candidate.id === active_id.value)) {
        active_id.value = conversations.value.find((candidate) => !candidate.archived)?.id ?? conversations.value[0].id;
    }
    persist();
}

function save_api_settings(): void {
    write_ai_session_settings({
        baseUrl: base_url.value,
        apiKey: api_key.value,
        model: model.value,
        maxRounds: max_rounds.value,
    });
}

watch([base_url, api_key, model, max_rounds], save_api_settings, { flush: 'sync' });

function clear_key(): void {
    api_key.value = '';
    clear_ai_session_api_key();
}

function progress(item: Conversation, event: AIProgressEvent): void {
    record_ai_activity(item.activity, event, { id: next_activity_id.value++, timestamp: Date.now() });
    item.updatedAt = Date.now();
}

function error_text(error: unknown): string {
    if (error instanceof AIRequestNetworkError && settings.language === 'zh') {
        return `浏览器无法连接 ${error.endpoint}。这通常是网络或 CORS 拦截；Base URL 服务必须允许来自 ${error.origin} 的请求，并检查 HTTPS/TLS。静态 GitHub Pages 无法绕过服务端 CORS。`;
    }
    return error instanceof Error ? error.message : String(error);
}

async function generate(): Promise<void> {
    const item = active.value;
    if (!item || item.busy) return;
    const prompt = item.prompt.trim();
    if (!prompt || !api_key.value.trim() || !model.value.trim()) return;
    save_api_settings();
    item.busy = true;
    item.cancelled = false;
    item.error = '';
    item.notice = '';
    item.activity = [];
    item.startedAt = Date.now();
    item.finishedAt = 0;
    controller = new AbortController();
    persist();
    try {
        const result = await generate_notation({
            baseUrl: base_url.value,
            apiKey: api_key.value,
            model: model.value,
            prompt,
            history: item.messages,
            fileName: item.fileName || undefined,
            existingFileName: item.fileName || undefined,
            maxRounds: max_rounds.value,
            signal: controller.signal,
            onProgress: (event) => progress(item, event),
        });
        let file;
        if (item.fileId) {
            const existing = runtime.getFile(item.fileId);
            if (existing && !existing.enabled) {
                file = runtime.saveFile(existing.id, result.fileName, result.source).file;
            }
        }
        if (!file) file = runtime.createUpload(result.fileName, result.source, false).file;
        item.fileId = file.id;
        item.fileName = file.name;
        item.title = file.name.replace(/\.js$/i, '');
        item.messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: result.raw });
        item.prompt = '';
        item.notice = `${copy.value.generated}${file.name}`;
        if (!result.validation.valid) item.notice += ` (${result.validation.errors.join(' ')})`;
        persist();
        open_editor(file.id);
    } catch (error) {
        if (controller.signal.aborted || (error as Error)?.name === 'AbortError') {
            item.cancelled = true;
        } else {
            item.error = `${copy.value.failed}: ${error_text(error)}`;
        }
        persist();
    } finally {
        item.busy = false;
        item.finishedAt = Date.now();
        controller = null;
        persist();
    }
}

function stop(): void {
    controller?.abort();
}

function restart(): void {
    const item = active.value;
    if (!item || item.busy || !item.prompt.trim()) return;
    void generate();
}

function open_editor(fileId: string): void {
    const files = runtime.listFiles();
    const index = files.findIndex((file) => file.id === fileId);
    if (index < 0) return;
    ui.user_defined_active_tab.value = index;
    ui.show_user_defined.value = true;
}

function activity_label(entry: ActivityEntry): string {
    const round = entry.round || 1;
    if (entry.type === 'model_request_started') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${settings.language === 'zh' ? '轮：等待模型' : 'model request'}`;
    if (entry.type === 'model_reasoning_stream') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${settings.language === 'zh' ? '模型正在推理' : 'reasoning'} (${entry.chars ?? 0})`;
    if (entry.type === 'model_output_stream') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${settings.language === 'zh' ? '正在生成响应' : 'generating response'} (${entry.chars ?? 0})`;
    if (entry.type === 'tool_call_preparing') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${settings.language === 'zh' ? '正在准备' : 'preparing'} ${entry.name || 'tool'} (${entry.chars ?? 0})`;
    if (entry.type === 'model_response_received') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${entry.toolCallCount ? `${settings.language === 'zh' ? '模型请求' : 'model requested'} ${entry.toolCallCount} ${settings.language === 'zh' ? '个工具调用' : 'tool calls'}` : settings.language === 'zh' ? '模型已响应' : 'model response'}`;
    if (entry.type === 'tool_call_started') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${settings.language === 'zh' ? '正在运行' : 'running'} ${entry.name || 'tool'}`;
    if (entry.type === 'tool_call_finished') return `${settings.language === 'zh' ? '第' : 'Round'} ${round} ${entry.name || 'tool'} ${entry.ok === false ? settings.language === 'zh' ? '失败' : 'failed' : settings.language === 'zh' ? '已完成' : 'completed'}`;
    if (entry.type === 'fallback_started') return settings.language === 'zh' ? '工具调用不可用，降级为普通生成' : 'Tool calling unsupported; falling back to plain generation';
    return entry.type;
}

onMounted(() => {
    clock_timer = setInterval(() => {
        clock_now.value = Date.now();
    }, 1000);
});

onBeforeUnmount(() => {
    controller?.abort();
    if (clock_timer !== null) clearInterval(clock_timer);
});
</script>

<template>
    <section class="ai-page" :aria-label="copy.title">
        <header class="ai-header">
            <div>
                <h2>{{ copy.title }}</h2>
                <p>{{ copy.hint }}</p>
            </div>
            <button type="button" class="ai-secondary" @click="new_session">＋ {{ copy.newSession }}</button>
        </header>

        <div class="ai-layout">
            <aside class="ai-sessions">
                <div class="ai-session-heading">{{ copy.active }}</div>
                <button
                    v-for="item in active_conversations"
                    :key="item.id"
                    type="button"
                    class="ai-session"
                    :class="{ active: item.id === active_id }"
                    @click="set_active(item)"
                >
                    <span>{{ item.title }}</span>
                    <small v-if="item.busy">…</small>
                </button>
                <div class="ai-session-heading ai-session-heading--archived">{{ copy.archived }}</div>
                <div v-for="item in archived_conversations" :key="item.id" class="ai-archived-row">
                    <button type="button" class="ai-session" :class="{ active: item.id === active_id }" @click="set_active(item)">
                        <span>{{ item.title }}</span>
                    </button>
                    <button type="button" class="ai-icon-button" :title="copy.restore" @click="restore(item)">↶</button>
                    <button type="button" class="ai-icon-button ai-danger" :title="copy.delete" @click="delete_archived(item)">×</button>
                </div>
                <p v-if="!conversations.length" class="ai-empty">{{ copy.empty }}</p>
            </aside>

            <form v-if="active" class="ai-main" autocomplete="off" @submit.prevent="generate">
                <div class="ai-settings-grid">
                    <label>{{ copy.baseUrl }} <input v-model="base_url" type="url" autocomplete="url" placeholder="https://api.openai.com" /></label>
                    <label>{{ copy.apiKey }} <span class="ai-key-input"><input v-model="api_key" :type="show_api_key ? 'text' : 'password'" autocomplete="off" /><button type="button" class="ai-icon-button" @click="show_api_key = !show_api_key">{{ show_api_key ? '◉' : '○' }}</button></span></label>
                    <label>{{ copy.model }} <input v-model="model" type="text" autocomplete="off" /></label>
                    <label>{{ copy.rounds }} <input v-model.number="max_rounds" type="number" min="1" max="128" /></label>
                </div>
                <p class="ai-warning">{{ copy.keyWarning }}</p>
                <div class="ai-actions">
                    <button type="button" class="ai-secondary" @click="clear_key">{{ copy.clearKey }}</button>
                    <button type="button" class="ai-secondary" :disabled="active.busy" @click="archive_active">{{ copy.archive }}</button>
                </div>
                <label class="ai-prompt-label">{{ copy.prompt }}
                    <textarea v-model="active.prompt" :disabled="active.busy" :placeholder="copy.promptPlaceholder" rows="6" @keydown.ctrl.enter.prevent="generate"></textarea>
                </label>
                <div class="ai-actions ai-actions--primary">
                    <button v-if="!active.busy" type="submit" class="ai-primary">{{ copy.generate }}</button>
                    <button v-else type="button" class="ai-danger-button" @click="stop">{{ copy.stop }}</button>
                    <button v-if="active.cancelled && !active.busy" type="button" class="ai-secondary" @click="restart">{{ copy.restart }}</button>
                </div>
                <p v-if="active.notice" class="ai-notice">{{ active.notice }} <button v-if="active.fileId" type="button" class="ai-link" @click="open_editor(active.fileId)">{{ copy.openEditor }}</button></p>
                <p v-if="active.error" class="ai-error">{{ active.error }}</p>

                <section v-if="active.messages.length" class="ai-messages" aria-label="Conversation">
                    <article v-for="(message, index) in active.messages" :key="index" class="ai-message" :class="message.role">
                        <header>{{ message.role === 'user' ? copy.prompt : copy.title }}</header>
                        <pre>{{ message.content }}</pre>
                    </article>
                </section>

                <section class="ai-activity" aria-live="polite">
                    <header><strong>{{ copy.activity }}</strong><span v-if="elapsed">{{ elapsed }}</span></header>
                    <p v-if="!active.activity.length" class="ai-empty">{{ copy.noActivity }}</p>
                    <ol v-else ref="activity_log" class="ai-activity-list">
                        <li v-for="entry in active.activity" :key="entry.id" :class="{ failed: entry.ok === false }">
                            <span>{{ activity_label(entry) }}<span v-if="entry.elapsedMs"> ({{ (entry.elapsedMs / 1000).toFixed(1) }}s)</span></span>
                            <details v-if="entry.detail"><summary>{{ copy.details }}</summary><pre>{{ entry.detail }}</pre></details>
                        </li>
                    </ol>
                </section>
            </form>
        </div>
    </section>
</template>

<style scoped>
.ai-page { min-width: 0; }
.ai-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 4px 0 14px; }
.ai-header h2 { margin: 0; font-size: 20px; }
.ai-header p { margin: 5px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.ai-layout { display: grid; grid-template-columns: minmax(150px, 220px) minmax(0, 1fr); gap: 14px; min-height: 560px; }
.ai-sessions { border-right: 1px solid var(--color-border-light); padding-right: 10px; min-width: 0; }
.ai-session-heading { margin: 3px 4px 5px; color: var(--color-text-secondary); font-size: 12px; font-weight: 600; text-transform: uppercase; }
.ai-session-heading--archived { margin-top: 16px; }
.ai-session { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }
.ai-session:hover, .ai-session.active { background: var(--color-accent-bg); }
.ai-session span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-archived-row { display: flex; align-items: center; }
.ai-archived-row .ai-session { min-width: 0; }
.ai-main { min-width: 0; }
.ai-settings-grid { display: grid; grid-template-columns: 1.35fr 1.15fr 1fr 120px; gap: 8px; }
.ai-settings-grid label, .ai-prompt-label { display: flex; flex-direction: column; gap: 4px; color: var(--color-text-secondary); font-size: 12px; }
.ai-settings-grid input, .ai-prompt-label textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 4px; padding: 7px 8px; background: var(--color-bg); color: var(--color-text); font: inherit; }
.ai-prompt-label textarea { resize: vertical; min-height: 120px; font-size: 14px; }
.ai-key-input { display: flex; gap: 3px; }
.ai-key-input input { min-width: 0; }
.ai-warning { margin: 7px 0 10px; color: var(--color-text-secondary); font-size: 12px; }
.ai-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin: 8px 0; }
.ai-actions--primary { margin-top: 10px; }
.ai-primary, .ai-secondary, .ai-danger-button, .ai-icon-button { min-height: 30px; padding: 5px 11px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-secondary); color: var(--color-text); font: inherit; cursor: pointer; }
.ai-primary { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-bg); }
.ai-danger-button, .ai-danger { color: var(--color-danger); }
.ai-primary:disabled, .ai-secondary:disabled { cursor: not-allowed; opacity: .5; }
.ai-icon-button { width: 30px; padding: 0; }
.ai-notice, .ai-error { margin: 8px 0; padding: 7px 9px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 13px; overflow-wrap: anywhere; }
.ai-notice { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 8%, var(--color-bg)); }
.ai-error { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, var(--color-bg)); }
.ai-link { padding: 0; border: 0; background: transparent; color: var(--color-accent); cursor: pointer; font: inherit; text-decoration: underline; }
.ai-messages { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.ai-message { max-width: 92%; border: 1px solid var(--color-border-light); border-radius: 5px; padding: 7px 9px; background: var(--color-bg-secondary); }
.ai-message.user { align-self: flex-end; background: var(--color-accent-bg); }
.ai-message header { margin-bottom: 4px; color: var(--color-text-secondary); font-size: 11px; font-weight: 600; }
.ai-message pre { max-height: 260px; overflow: auto; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 12px; }
.ai-activity { margin-top: 14px; border-top: 1px solid var(--color-border-light); padding-top: 10px; }
.ai-activity > header { display: flex; justify-content: space-between; color: var(--color-text-secondary); font-size: 13px; }
.ai-activity-list { max-height: 360px; overflow: auto; margin: 7px 0 0; padding-left: 22px; }
.ai-activity-list li { margin: 5px 0; color: var(--color-text); font-size: 13px; }
.ai-activity-list li.failed { color: var(--color-danger); }
.ai-activity-list details { margin: 3px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.ai-activity-list pre { max-height: 180px; overflow: auto; margin: 4px 0 0; padding: 6px; background: var(--color-bg-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.ai-empty { margin: 8px 0; color: var(--color-text-muted); font-size: 12px; }
@media (max-width: 760px) { .ai-layout { grid-template-columns: 1fr; } .ai-sessions { border-right: 0; border-bottom: 1px solid var(--color-border-light); padding: 0 0 8px; max-height: 180px; overflow: auto; } .ai-settings-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 460px) { .ai-settings-grid { grid-template-columns: 1fr; } .ai-header { flex-direction: column; } }
</style>
