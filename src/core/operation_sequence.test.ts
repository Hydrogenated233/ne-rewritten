import { describe, expect, it, vi } from 'vitest';
import { BM4 } from '@/notations/BM-like/BM.ts';
import { resolve_display, type NotationDefinition } from '@/notation-definition.ts';
import { find_operation_sequence, request_operation_sequence } from '@/core/operation_sequence.ts';

const parse = resolve_display(BM4.display).from_display!;
const successors: NotationDefinition<number> = {
    id: 'successors', name: 'Successors', display: String, init: () => [Infinity, 0],
    is_limit: (n) => n === Infinity, compare: (a, b) => a === b ? 0 : a < b ? -1 : 1,
    FS: (n, index) => n === Infinity ? 2 * index + 1 : Math.max(0, n - 1),
};

describe('operation sequences', () => {
    it.each([
        ['(0)(1)(2)(2)', [1, 3, 1]],
        ['(0)(1,1)(2,2)(2,1)', [2, 3, 1, 1, 1, 1, 1]],
    ] as const)('matches the BMS example %s', (text, sequence) => {
        expect(find_operation_sequence(BM4, parse(text), 'FS_short')).toEqual({ status: 'found', sequence });
    });

    it('uses -1 for a non-limit predecessor and an empty sequence for Limit', () => {
        expect(find_operation_sequence(successors, 4, 'FS')).toEqual({ status: 'found', sequence: [2, -1] });
        expect(find_operation_sequence(BM4, BM4.init()[0], 'FS_short')).toEqual({ status: 'found', sequence: [] });
        expect(find_operation_sequence(successors, 0, 'FS')).toEqual({ status: 'found', sequence: [0, -1] });
    });

    it('replays every returned sequence using the selected FS mode', () => {
        for (const mode of ['FS', 'FS_short', 'FS_alter'] as const) {
            const target = parse('(0)(1)(2)(2)');
            const result = find_operation_sequence(BM4, target, mode);
            expect(result.status).toBe('found');
            if (result.status !== 'found') continue;
            const reached = result.sequence.reduce((expr, n) => BM4[mode]!(expr, Math.max(0, n)), BM4.init()[0]);
            expect(reached).toEqual(target);
        }
    });

    it('bounds unsuccessful searches and rejects non-decreasing FS results', () => {
        expect(find_operation_sequence(successors, 100, 'FS', 2).status).toBe('limit');
        const broken = { ...successors, FS: () => Infinity };
        expect(find_operation_sequence(broken, 4, 'FS').status).toBe('unavailable');
        expect(find_operation_sequence({ ...successors, FS: () => { throw new Error('bad FS'); } }, 4, 'FS').status)
            .toBe('unavailable');
    });

    it('caches completed results per definition, not just notation ID, and respects cancellation', async () => {
        const first = { ...successors, FS: vi.fn(successors.FS) };
        expect((await request_operation_sequence(first, 4, 'FS')).status).toBe('found');
        first.FS.mockClear();
        expect((await request_operation_sequence(first, 4, 'FS')).status).toBe('found');
        expect(first.FS).not.toHaveBeenCalled();
        expect((await request_operation_sequence({ ...first, FS: () => Infinity }, 4, 'FS')).status).toBe('unavailable');
        const controller = new AbortController();
        controller.abort();
        expect((await request_operation_sequence(first, 4, 'FS', 10, controller.signal)).status).toBe('cancelled');
    });
});
