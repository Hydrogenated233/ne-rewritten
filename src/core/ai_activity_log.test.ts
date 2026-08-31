import { describe, expect, it } from 'vitest';
import { compact_ai_activity, record_ai_activity, type AIActivityEntry } from '@/core/ai_activity_log.ts';

function event(overrides: Partial<AIActivityEntry> = {}): AIActivityEntry {
    return {
        id: 1,
        timestamp: 1,
        type: 'model_reasoning_stream',
        round: 1,
        protocol: 'chat_completions',
        chars: 1,
        detail: 'a',
        ...overrides,
    };
}

describe('AI activity log', () => {
    it('updates one reasoning row instead of retaining every stream delta', () => {
        const entries: AIActivityEntry[] = [];
        for (let index = 1; index <= 2_000; index++) {
            record_ai_activity(
                entries,
                {
                    type: 'model_reasoning_stream',
                    round: 1,
                    protocol: 'chat_completions',
                    chars: index,
                    detail: `tail-${index}`,
                },
                { id: index, timestamp: index },
            );
        }

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ id: 1, timestamp: 2_000, chars: 2_000, detail: 'tail-2000' });
    });

    it('updates interleaved model streams by round and type', () => {
        const entries: AIActivityEntry[] = [];
        record_ai_activity(entries, { type: 'model_reasoning_stream', round: 1, protocol: 'chat_completions', chars: 1 }, { id: 1, timestamp: 1 });
        record_ai_activity(entries, { type: 'model_output_stream', round: 1, protocol: 'chat_completions', chars: 2 }, { id: 2, timestamp: 2 });
        record_ai_activity(entries, { type: 'model_reasoning_stream', round: 1, protocol: 'chat_completions', chars: 3 }, { id: 3, timestamp: 3 });
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ id: 1, chars: 3, timestamp: 3 });
    });

    it('keeps one preparing row per parallel tool call while thousands of deltas arrive', () => {
        const entries: AIActivityEntry[] = [];
        let nextId = 1;
        for (let chars = 1; chars <= 2_000; chars++) {
            for (const toolCallIndex of [0, 1]) {
                record_ai_activity(entries, { type: 'tool_call_preparing', round: 3, protocol: 'chat_completions', toolCallIndex, name: 'validate_source', chars, detail: `${toolCallIndex}:${chars}` }, { id: nextId, timestamp: nextId++ });
            }
        }
        expect(entries.map((entry) => [entry.id, entry.toolCallIndex, entry.chars])).toEqual([[1, 0, 2_000], [2, 1, 2_000]]);
    });

    it('replaces a preparing row with the running row and preserves a separate result row', () => {
        const entries: AIActivityEntry[] = [];
        record_ai_activity(entries, { type: 'tool_call_preparing', round: 2, protocol: 'chat_completions', toolCallIndex: 0, name: 'expand', chars: 12 }, { id: 1, timestamp: 1 });
        record_ai_activity(entries, { type: 'model_response_received', round: 2, protocol: 'chat_completions', toolCallCount: 1 }, { id: 2, timestamp: 2 });
        record_ai_activity(entries, { type: 'tool_call_started', round: 2, protocol: 'chat_completions', toolCallIndex: 0, name: 'expand', detail: '{"index":1}' }, { id: 3, timestamp: 3 });
        record_ai_activity(entries, { type: 'tool_call_finished', round: 2, protocol: 'chat_completions', toolCallIndex: 0, name: 'expand', ok: true, detail: '{"terms":[]}' }, { id: 4, timestamp: 4 });
        expect(entries.map((entry) => entry.type)).toEqual(['model_response_received', 'tool_call_started', 'tool_call_finished']);
        expect(entries[1]).toMatchObject({ id: 1, toolCallIndex: 0, detail: '{"index":1}' });
    });

    it('keeps separate rounds and non-stream lifecycle entries', () => {
        const entries = [event()];
        record_ai_activity(
            entries,
            { type: 'model_response_received', round: 1, protocol: 'chat_completions' },
            { id: 2, timestamp: 2 },
        );
        record_ai_activity(
            entries,
            { type: 'model_reasoning_stream', round: 2, protocol: 'chat_completions', chars: 3 },
            { id: 3, timestamp: 3 },
        );

        expect(entries.map((entry) => [entry.type, entry.round])).toEqual([
            ['model_reasoning_stream', 1],
            ['model_response_received', 1],
            ['model_reasoning_stream', 2],
        ]);
    });

    it('compacts legacy consecutive stream rows while preserving their first id', () => {
        const entries = compact_ai_activity([
            event({ id: 10, chars: 3, detail: 'abc' }),
            null,
            event({ id: 11, timestamp: 2, chars: 6, detail: 'abcdef' }),
            event({ id: 12, timestamp: 3, type: 'model_response_received' }),
        ]);

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ id: 10, timestamp: 2, chars: 6, detail: 'abcdef' });
        expect(entries[1].type).toBe('model_response_received');
    });

    it('compacts persisted legacy tool argument deltas without merging distinct calls', () => {
        const legacy: AIActivityEntry[] = [];
        let id = 1;
        for (const chars of [0, 1, 2, 10, 13, 0, 1, 2, 10, 13]) legacy.push(event({ id, timestamp: id++, type: 'tool_call_preparing', round: 2, name: 'inspect_notation', chars }));
        legacy.push(event({ id, timestamp: id++, type: 'model_response_received', round: 2, toolCallCount: 2 }));
        for (let index = 0; index < 2; index++) {
            legacy.push(event({ id, timestamp: id++, type: 'tool_call_started', round: 2, name: 'inspect_notation' }));
            legacy.push(event({ id, timestamp: id++, type: 'tool_call_finished', round: 2, name: 'inspect_notation', ok: true }));
        }
        const entries = compact_ai_activity(legacy);
        expect(entries.map((entry) => [entry.type, entry.toolCallIndex])).toEqual([
            ['model_response_received', undefined], ['tool_call_started', 0], ['tool_call_finished', 0],
            ['tool_call_started', 1], ['tool_call_finished', 1],
        ]);
    });

    it('bounds persisted activity details', () => {
        const entries: AIActivityEntry[] = [];
        record_ai_activity(entries, { type: 'tool_call_finished', round: 1, protocol: 'chat_completions', toolCallIndex: 0, name: 'validate_source', detail: 'x'.repeat(20_000) }, { id: 1, timestamp: 1 });
        expect(entries[0].detail?.length).toBeLessThanOrEqual(8_000);
    });
});
