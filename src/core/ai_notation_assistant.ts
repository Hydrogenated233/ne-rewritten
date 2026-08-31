import { inspect_notation, list_notation_summaries, expand_notation, detect_inf_chain_by_id } from '@/core/notation_tools.ts';
import { validate_notation_source, type SourceValidationResult } from '@/core/source_validator.ts';
import { get_notation } from '@/core/registry.ts';
import { resolve_display } from '@/notation-definition.ts';
import { AI_BUILTIN_CONTEXT } from '@/core/ai_context.ts';
import { app_storage } from '@/core/storage.ts';
import { AI_SESSION_STORAGE_KEYS, APP_STORAGE_KEYS } from '@/core/storage_keys.ts';

export type AIProtocol = 'chat_completions';

export interface AIChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: AIToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface AIToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface AIProgressEvent {
    type:
        | 'model_request_started'
        | 'model_reasoning_stream'
        | 'model_output_stream'
        | 'tool_call_preparing'
        | 'model_response_received'
        | 'tool_call_started'
        | 'tool_call_finished'
        | 'fallback_started';
    round: number;
    protocol: AIProtocol;
    name?: string;
    chars?: number;
    toolCallIndex?: number;
    toolCallCount?: number;
    ok?: boolean;
    detail?: string;
    elapsedMs?: number;
}

export interface AIGenerateOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
    history?: AIChatMessage[];
    fileName?: string;
    existingFileName?: string;
    signal?: AbortSignal;
    maxRounds?: number;
    fetchImpl?: typeof fetch;
    onProgress?: (event: AIProgressEvent) => void;
}

export interface AIGenerateResult {
    source: string;
    raw: string;
    fileName: string;
    validation: SourceValidationResult;
    rounds: number;
    usedTools: boolean;
    toolMode: 'auto' | 'plain';
}

interface ChatRoundResult {
    message: AIChatMessage;
    responseText: string;
    responseChars: number;
}

export class AIRequestNetworkError extends Error {
    readonly code = 'NETWORK_OR_CORS';

    constructor(readonly endpoint: string, readonly origin: string, options?: { cause?: unknown }) {
        super(
            `AI request could not reach ${endpoint}. The browser blocked the request or the network failed. ` +
                `The Base URL must allow CORS requests from ${origin}; also check TLS and mixed-content restrictions.`,
            options,
        );
        this.name = 'AIRequestNetworkError';
    }
}

const DEFAULT_BASE_URL = 'https://api.openai.com';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_ROUNDS = 64;
const MAX_OUTPUT_LENGTH = 120_000;
const MAX_TOOL_OUTPUT_LENGTH = 30_000;
const MAX_REASONING_BUFFER_LENGTH = 120_000;
const MAX_STREAM_DETAIL_LENGTH = 8_000;
const SESSION_KEYS = AI_SESSION_STORAGE_KEYS;

function session_storage(): Storage | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

export interface AIStoredSettings {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxRounds: number;
}

function normalize_max_rounds(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(128, Math.trunc(parsed))) : DEFAULT_MAX_ROUNDS;
}

export function read_ai_session_settings(): AIStoredSettings {
    const session = session_storage();
    let baseUrl = '';
    let model = '';
    let maxRounds = DEFAULT_MAX_ROUNDS;

    try {
        const raw = app_storage()?.getItem(APP_STORAGE_KEYS.aiProviderSettings);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            baseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '';
            model = typeof parsed.model === 'string' ? parsed.model : '';
            maxRounds = normalize_max_rounds(parsed.maxRounds);
        }
    } catch {
        // Invalid or unavailable persistent storage falls back to defaults.
    }

    try {
        baseUrl ||= session?.getItem(SESSION_KEYS.baseUrl) ?? '';
        model ||= session?.getItem(SESSION_KEYS.model) ?? '';
    } catch {
        // Legacy session preferences are optional migration input.
    }

    let apiKey = '';
    try {
        apiKey = session?.getItem(SESSION_KEYS.apiKey) ?? '';
    } catch {
        // A blocked sessionStorage leaves the key in memory only.
    }
    return { baseUrl, apiKey, model, maxRounds };
}

export function write_ai_session_settings(settings: { baseUrl?: string; apiKey?: string; model?: string; maxRounds?: number }): void {
    const current = read_ai_session_settings();
    const preferences = {
        baseUrl: settings.baseUrl === undefined ? current.baseUrl : String(settings.baseUrl).trim(),
        model: settings.model === undefined ? current.model : String(settings.model).trim(),
        maxRounds: settings.maxRounds === undefined ? current.maxRounds : normalize_max_rounds(settings.maxRounds),
    };

    try {
        app_storage()?.setItem(APP_STORAGE_KEYS.aiProviderSettings, JSON.stringify(preferences));
    } catch {
        // Private browsing and quota failures must not block in-memory use.
    }

    if (settings.apiKey !== undefined) {
        try {
            const session = session_storage();
            if (settings.apiKey) session?.setItem(SESSION_KEYS.apiKey, settings.apiKey);
            else session?.removeItem(SESSION_KEYS.apiKey);
            session?.removeItem(SESSION_KEYS.baseUrl);
            session?.removeItem(SESSION_KEYS.model);
        } catch {
            // A blocked sessionStorage leaves the key in memory only.
        }
    }
}

export function clear_ai_session_api_key(): void {
    try {
        session_storage()?.removeItem(SESSION_KEYS.apiKey);
    } catch {
        // Best effort; callers also clear their in-memory copy.
    }
}

export function normalize_chat_endpoint(baseUrl: string): string {
    let value = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!value) value = DEFAULT_BASE_URL;
    if (/\/chat\/completions$/i.test(value)) return value;
    if (/\/v1$/i.test(value)) return `${value}/chat/completions`;
    return `${value}/v1/chat/completions`;
}

function stringify(value: unknown, limit = MAX_TOOL_OUTPUT_LENGTH): string {
    let result: string;
    try {
        result = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        result = String(value);
    }
    return result.length > limit ? `${result.slice(0, limit)}\n...[truncated]` : result;
}

function error_message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function abort_if_needed(signal?: AbortSignal): void {
    if (signal?.aborted) {
        const error = new Error('AI generation was stopped.');
        error.name = 'AbortError';
        throw error;
    }
}

function extract_source(text: string): string {
    const value = String(text || '').trim();
    const fenced = value.match(/```(?:javascript|js|typescript|ts)?\s*([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    const marker = value.match(/(?:^|\n)\s*(?:source|code)\s*:\s*([\s\S]+)$/i);
    return marker ? marker[1].trim() : value;
}

function sanitize_file_name(value: string | undefined, fallback: string): string {
    let name = String(value || '').trim().replace(/^[`'"]+|[`'"]+$/g, '');
    name = name.split(/[\\/]/).pop()!.replace(/[<>:"|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-');
    name = name.replace(/-+/g, '-').replace(/^[.\-]+|[.\-]+$/g, '');
    if (!name) name = fallback;
    if (!/\.js$/i.test(name)) name += '.js';
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\.js$/i.test(name)) name = `AI-${name}`;
    return name.length > 96 ? `${name.slice(0, 93).replace(/[.\-]+$/g, '')}.js` : name;
}

function extract_file_name(text: string, fallback: string): string {
    const prefix = String(text || '').split('```')[0];
    const match = prefix.match(/(?:^|\n)\s*filename\s*:\s*`?([^\r\n`]+)`?\s*(?:\n|$)/i);
    return sanitize_file_name(match?.[1], fallback);
}

export function tool_definitions(): unknown[] {
    return [
        {
            type: 'function',
            function: {
                name: 'list_notations',
                description: 'List registered notation IDs and names.',
                parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
        },
        {
            type: 'function',
            function: {
                name: 'inspect_notation',
                description: 'Inspect one notation, including its parser, FS variants, and initial expressions.',
                parameters: {
                    type: 'object',
                    properties: { notation_id: { type: 'string' } },
                    required: ['notation_id'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'expand',
                description: 'Expand one notation expression at selected fundamental-sequence indexes.',
                parameters: {
                    type: 'object',
                    properties: {
                        notation_id: { type: 'string' },
                        expression: { type: 'string' },
                        indexes: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1, maxItems: 32 },
                        variant: { type: 'string', enum: ['FS', 'FS_alter', 'FS_short'] },
                    },
                    required: ['notation_id', 'expression', 'indexes'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'detect_inf_chain',
                description: 'Run the existing infinite descending-chain detector.',
                parameters: {
                    type: 'object',
                    properties: {
                        notation_id: { type: 'string' },
                        options: { type: 'object', additionalProperties: true },
                    },
                    required: ['notation_id'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'validate_source',
                description: 'Validate native ne-rewritten notation source without executing it in the live registry.',
                parameters: {
                    type: 'object',
                    properties: { source: { type: 'string' }, file_name: { type: 'string' } },
                    required: ['source'],
                    additionalProperties: false,
                },
            },
        },
    ];
}

export function run_ai_tool(name: string, args: any): unknown {
    switch (name) {
        case 'list_notations':
            return list_notation_summaries();
        case 'inspect_notation':
            return inspect_notation(String(args?.notation_id || ''));
        case 'expand': {
            const indexes = Array.isArray(args?.indexes) ? args.indexes : [];
            if (!indexes.length || indexes.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) < 0 || Number(n) > 1000)) {
                throw new RangeError('indexes must contain safe non-negative integers.');
            }
            const max = Math.max(...indexes.map(Number));
            const full = expand_notation(String(args.notation_id), args.expression, max + 1, args.variant);
            return { ...full, terms: full.terms.filter((term) => indexes.includes(term.index)) };
        }
        case 'detect_inf_chain':
            return detect_inf_chain_by_id(String(args?.notation_id || ''), args?.options);
        case 'validate_source':
            return validate_notation_source(String(args?.source || ''));
        default:
            throw new Error(`Unknown AI tool: ${name}`);
    }
}

function build_system_prompt(fileName: string, existingFileName: string, includeTools: boolean): string {
    const target = existingFileName ? `Update the existing disabled file named ${existingFileName}.` : `Choose a descriptive filename; suggested fallback is ${fileName}.`;
    return [
        'You are the local notation authoring assistant for NE-rewritten.',
        'Return a complete JavaScript source file in the native ne-rewritten format.',
        'Do not execute, enable, trust, or modify files yourself. The application will validate and stage your source as a disabled local file.',
        target,
        includeTools ? 'You may call the supplied notation tools to inspect and test existing definitions before answering.' : 'Tool calling is unavailable; reason from the embedded context and user request.',
        'Put a line such as `filename: descriptive-name.js` before the code when you choose a filename.',
        'Keep the final answer concise and include the source in one fenced JavaScript block.',
        '',
        AI_BUILTIN_CONTEXT,
    ].join('\n');
}

function response_error(response: Response): Error {
    const error = new Error(`AI request failed (${response.status} ${response.statusText || 'HTTP error'}).`);
    (error as Error & { status?: number }).status = response.status;
    return error;
}

function request_network_error(error: unknown, endpoint: string): Error {
    if ((error as Error | undefined)?.name === 'AbortError') return error as Error;
    const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'this page';
    return new AIRequestNetworkError(endpoint, origin, { cause: error });
}

function is_tools_unsupported(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 400 || status === 404 || status === 405 || status === 415 || status === 422 || status === 501 || /tool|function|unsupported/i.test(error_message(error));
}

async function parse_stream(response: Response, round: number, onProgress?: AIGenerateOptions['onProgress'], signal?: AbortSignal): Promise<ChatRoundResult> {
    if (!response.body || typeof response.body.getReader !== 'function') {
        const payload = await response.json();
        const message = payload?.choices?.[0]?.message;
        if (!message) throw new Error('The Chat Completions response did not contain a message.');
        const responseText = JSON.stringify(payload);
        return { message, responseText, responseChars: responseText.length };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fallbackText = '';
    let sawSseData = false;
    let content = '';
    let reasoning = '';
    let reasoningChars = 0;
    let finishReason: string | null = null;
    const calls = new Map<number, AIToolCall>();
    const consume = (block: string) => {
        for (const line of block.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            sawSseData = true;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            let chunk: any;
            try { chunk = JSON.parse(raw); } catch { continue; }
            const choice = chunk?.choices?.[0];
            if (!choice) continue;
            finishReason = choice.finish_reason ?? finishReason;
            const delta = choice.delta ?? {};
            if (typeof delta.content === 'string') {
                content += delta.content;
                onProgress?.({ type: 'model_output_stream', round, protocol: 'chat_completions', chars: content.length, detail: content.slice(-MAX_STREAM_DETAIL_LENGTH) });
            }
            const reasoningDelta = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : typeof delta.reasoning === 'string' ? delta.reasoning : '';
            if (reasoningDelta) {
                reasoningChars += reasoningDelta.length;
                reasoning = `${reasoning}${reasoningDelta}`.slice(-MAX_REASONING_BUFFER_LENGTH);
                onProgress?.({ type: 'model_reasoning_stream', round, protocol: 'chat_completions', chars: reasoningChars, detail: reasoning.slice(-MAX_STREAM_DETAIL_LENGTH) });
            }
            for (const part of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
                const index = Number(part.index) || 0;
                const current = calls.get(index) ?? { id: part.id || `call-${round}-${index}`, type: 'function' as const, function: { name: '', arguments: '' } };
                if (part.id) current.id = part.id;
                if (part.function?.name) current.function.name += part.function.name;
                if (part.function?.arguments) current.function.arguments += part.function.arguments;
                calls.set(index, current);
                onProgress?.({ type: 'tool_call_preparing', round, protocol: 'chat_completions', toolCallIndex: index, name: current.function.name || 'tool', chars: current.function.arguments.length, detail: current.function.arguments.slice(-MAX_STREAM_DETAIL_LENGTH) });
            }
        }
    };
    while (true) {
        abort_if_needed(signal);
        const { value, done } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(value, { stream: true });
        buffer += decoded;
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
            consume(block);
            if (sawSseData) fallbackText = '';
            else fallbackText += `${block}\n\n`;
        }
    }
    if (buffer) {
        if (!sawSseData) fallbackText += buffer;
        consume(buffer);
        if (sawSseData) fallbackText = '';
    }
    // A few OpenAI-compatible gateways ignore `stream: true` and return one
    // ordinary JSON document. Accept that response instead of treating it as
    // an empty stream.
    if (!sawSseData && !content && calls.size === 0) {
        try {
            const payload = JSON.parse(fallbackText.trim());
            const message = payload?.choices?.[0]?.message;
            if (message) {
                const responseText = JSON.stringify(payload);
                return { message, responseText, responseChars: responseText.length };
            }
        } catch {
            // Keep the normal empty-response error below.
        }
    }
    const tool_calls = [...calls.values()];
    return {
        message: { role: 'assistant', content: content || null, ...(tool_calls.length ? { tool_calls } : {}) },
        responseText: reasoning ? `${reasoning}\n${content}` : content,
        responseChars: reasoningChars + content.length,
    };
}

async function request_chat_round(options: AIGenerateOptions, messages: AIChatMessage[], tools: unknown[], round: number, onProgress?: AIGenerateOptions['onProgress']): Promise<ChatRoundResult> {
    const fetcher = options.fetchImpl ?? fetch;
    const endpoint = normalize_chat_endpoint(options.baseUrl);
    const started = Date.now();
    onProgress?.({ type: 'model_request_started', round, protocol: 'chat_completions' });
    abort_if_needed(options.signal);
    let response: Response;
    try {
        response = await fetcher(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
            body: JSON.stringify({
                model: options.model || DEFAULT_MODEL,
                messages,
                temperature: 0.2,
                stream: true,
                ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
            }),
            signal: options.signal,
        });
    } catch (error) {
        throw request_network_error(error, endpoint);
    }
    if (!response.ok) throw response_error(response);
    const result = await parse_stream(response, round, onProgress, options.signal);
    onProgress?.({ type: 'model_response_received', round, protocol: 'chat_completions', toolCallCount: result.message.tool_calls?.length ?? 0, chars: result.responseChars, elapsedMs: Date.now() - started });
    return result;
}

export async function generate_notation(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const apiKey = String(options.apiKey || '').trim();
    const prompt = String(options.prompt || '').trim();
    if (!apiKey) throw new Error('An API key is required.');
    if (!prompt) throw new Error('A notation request is required.');
    const maxRounds = Math.max(1, Math.min(128, options.maxRounds ?? 64));
    let toolMode: 'auto' | 'plain' = 'auto';
    let tools = tool_definitions();
    let usedTools = false;
    let rounds = 0;
    const history = (options.history ?? []).slice(-24);
    const messages: AIChatMessage[] = [
        { role: 'system', content: build_system_prompt(options.fileName || 'AI-Notation.js', options.existingFileName || '', true) },
        ...history,
        { role: 'user', content: prompt },
    ];
    let finalText = '';
    while (rounds < maxRounds) {
        rounds++;
        let result: ChatRoundResult;
        try {
            result = await request_chat_round(options, messages, tools, rounds, options.onProgress);
        } catch (error) {
            if (toolMode === 'auto' && !usedTools && is_tools_unsupported(error)) {
                toolMode = 'plain';
                tools = [];
                options.onProgress?.({ type: 'fallback_started', round: rounds, protocol: 'chat_completions', detail: error_message(error) });
                result = await request_chat_round(options, [{ role: 'system', content: build_system_prompt(options.fileName || 'AI-Notation.js', options.existingFileName || '', false) }, ...history, { role: 'user', content: prompt }], tools, rounds, options.onProgress);
            } else {
                throw error;
            }
        }
        const message = result.message;
        const calls = message.tool_calls ?? [];
        if (!calls.length) {
            finalText = String(message.content || result.responseText || '');
            break;
        }
        usedTools = true;
        messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
        for (const [toolCallIndex, call] of calls.entries()) {
            abort_if_needed(options.signal);
            let args: any;
            try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
            const started = Date.now();
            options.onProgress?.({ type: 'tool_call_started', round: rounds, protocol: 'chat_completions', toolCallIndex, name: call.function.name, detail: stringify(args) });
            let toolResult: unknown;
            let ok = true;
            try { toolResult = run_ai_tool(call.function.name, args); } catch (error) { ok = false; toolResult = { error: error_message(error) }; }
            options.onProgress?.({ type: 'tool_call_finished', round: rounds, protocol: 'chat_completions', toolCallIndex, name: call.function.name, ok, elapsedMs: Date.now() - started, detail: stringify(toolResult) });
            messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: stringify(ok ? { ok: true, result: toolResult } : toolResult) });
        }
    }
    if (!finalText) throw new Error(`The AI tool loop exceeded its safety limit (${maxRounds} rounds).`);
    const source = extract_source(finalText);
    if (!source || source.length > MAX_OUTPUT_LENGTH) throw new Error('Generated source is empty or too large.');
    const fileName = extract_file_name(finalText, sanitize_file_name(options.fileName, 'AI-Notation.js'));
    const validation = validate_notation_source(source);
    return { source, raw: finalText, fileName, validation, rounds, usedTools, toolMode };
}

export { DEFAULT_MODEL };
