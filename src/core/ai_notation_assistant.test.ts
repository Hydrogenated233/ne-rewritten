import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIRequestNetworkError, clear_ai_session_api_key, generate_notation, normalize_chat_endpoint, read_ai_session_settings, run_ai_tool, tool_definitions, write_ai_session_settings } from '@/core/ai_notation_assistant';
import { AI_SESSION_STORAGE_KEYS, APP_STORAGE_KEYS } from '@/core/storage_keys.ts';
import panel_source from '@/components/AINotationPanel.vue?raw';

function jsonResponse(payload: unknown, status = 200): any {
    return { ok: status >= 200 && status < 300, status, statusText: '', body: null, json: async () => payload };
}

afterEach(() => vi.restoreAllMocks());

describe('AI notation assistant', () => {
    it('normalizes OpenAI-compatible base URLs and exposes all native tools', () => {
        expect(normalize_chat_endpoint('http://127.0.0.1:57321/v1')).toBe('http://127.0.0.1:57321/v1/chat/completions');
        const names = (tool_definitions() as any[]).map((item) => item.function.name);
        expect(names).toEqual(['list_notations', 'inspect_notation', 'expand', 'detect_inf_chain', 'validate_source']);
        expect((run_ai_tool('validate_source', { source: 'register_notation({id:"x",name:"X",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]})' }) as any).valid).toBe(true);
    });

    it('runs tool calls, emits activity, and validates the generated source', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(jsonResponse({
                choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_notations', arguments: '{}' } }] } }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{ message: { role: 'assistant', content: 'filename: generated.js\n```js\nregister_notation({id:"generated",name:"Generated",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]});\n```' } }],
            }));
        const events: string[] = [];
        const result = await generate_notation({
            baseUrl: 'http://localhost:1234',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: fetchImpl as any,
            onProgress: (event) => events.push(event.type),
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.fileName).toBe('generated.js');
        expect(result.validation.valid).toBe(true);
        expect(result.usedTools).toBe(true);
        expect(events).toContain('tool_call_started');
        expect(events).toContain('tool_call_finished');
    });

    it('falls back to ordinary generation when the endpoint rejects tools', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: { message: 'tools unsupported' } }, 400))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{ message: { role: 'assistant', content: '```js\nregister_notation({id:"plain",name:"Plain",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]});\n```' } }],
            }));
        const events: string[] = [];
        const result = await generate_notation({
            baseUrl: 'https://example.test/v1/chat/completions',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: fetchImpl as any,
            onProgress: (event) => events.push(event.type),
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.toolMode).toBe('plain');
        expect(events).toContain('fallback_started');
    });

    it('reports browser network and CORS failures without retrying', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

        const request = generate_notation({
            baseUrl: 'https://www.sevnx.lol',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: fetchImpl as any,
        });
        await expect(request).rejects.toEqual(
            expect.objectContaining({
                code: 'NETWORK_OR_CORS',
                endpoint: 'https://www.sevnx.lol/v1/chat/completions',
            }),
        );
        await expect(request).rejects.toBeInstanceOf(AIRequestNetworkError);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('persists non-secret provider settings while keeping the API key session-only', () => {
        const session = new Map<string, string>();
        const local = new Map<string, string>();
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => session.get(key) ?? null,
                setItem: (key: string, value: string) => session.set(key, value),
                removeItem: (key: string) => session.delete(key),
            },
        });
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => local.get(key) ?? null,
                setItem: (key: string, value: string) => local.set(key, value),
                removeItem: (key: string) => local.delete(key),
            },
        });
        write_ai_session_settings({ baseUrl: 'http://localhost:1', apiKey: 'secret', model: 'test', maxRounds: 88 });
        expect(session.get(AI_SESSION_STORAGE_KEYS.apiKey)).toBe('secret');
        expect(JSON.parse(local.get(APP_STORAGE_KEYS.aiProviderSettings)!)).toEqual({
            baseUrl: 'http://localhost:1',
            model: 'test',
            maxRounds: 88,
        });
        expect(JSON.stringify([...local.entries()])).not.toContain('secret');
        expect(read_ai_session_settings()).toEqual({
            baseUrl: 'http://localhost:1',
            apiKey: 'secret',
            model: 'test',
            maxRounds: 88,
        });
        clear_ai_session_api_key();
        expect(session.has(AI_SESSION_STORAGE_KEYS.apiKey)).toBe(false);
        delete (globalThis as any).sessionStorage;
        delete (globalThis as any).localStorage;
    });

    it('saves provider field changes without requiring a generation request', () => {
        expect(panel_source).toContain('watch([base_url, api_key, model, max_rounds], save_api_settings');
        expect(panel_source).toContain('ref(apiSettings.maxRounds ?? 64)');
    });

    it('reports streamed model output while waiting for a final source', async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: '```js\n' } }] }) + '\n\n'));
                controller.enqueue(encoder.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'register_notation({id:"stream",name:"Stream",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]});\n```' }, finish_reason: 'stop' }] }) + '\n\n'));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            },
        });
        const events: string[] = [];
        const result = await generate_notation({
            baseUrl: 'https://example.test',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, body }),
            onProgress: (event) => events.push(event.type),
        });
        expect(result.validation.valid).toBe(true);
        expect(events).toContain('model_output_stream');
    });

    it('accepts an ordinary JSON document from an endpoint that ignored stream mode', async () => {
        const encoder = new TextEncoder();
        const payload = JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '```js\nregister_notation({id:"json-stream",name:"JSON stream",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]});\n```' } }],
        });
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode(payload.slice(0, 80)));
                controller.enqueue(encoder.encode(payload.slice(80)));
                controller.close();
            },
        });
        const result = await generate_notation({
            baseUrl: 'https://example.test',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, body }),
        });
        expect(result.validation.valid).toBe(true);
    });

    it('bounds retained reasoning text while reporting the full streamed character count', async () => {
        const encoder = new TextEncoder();
        const source = '```js\nregister_notation({id:"reasoning-stream",name:"Reasoning stream",display:{plain:String},is_limit:()=>false,compare:()=>0,FS:x=>x,init:()=>[0]});\n```';
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let index = 0; index < 130; index++) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'x'.repeat(1_000) } }] })}\n\n`));
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: source }, finish_reason: 'stop' }] })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            },
        });
        const events: Array<{ type: string; chars?: number; detail?: string }> = [];
        const result = await generate_notation({
            baseUrl: 'https://example.test',
            apiKey: 'secret',
            model: 'test',
            prompt: 'make one',
            fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, body }),
            onProgress: (event) => events.push(event),
        });
        const reasoning = events.filter((event) => event.type === 'model_reasoning_stream');
        const received = events.findLast((event) => event.type === 'model_response_received');
        expect(result.validation.valid).toBe(true);
        expect(result.raw.length).toBeLessThanOrEqual(120_001);
        expect(reasoning.at(-1)?.chars).toBe(130_000 + source.length);
        expect(reasoning.at(-1)?.detail?.length).toBeLessThanOrEqual(8_000);
        expect(received?.chars).toBe(130_000 + source.length);
    });
});
