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
});
