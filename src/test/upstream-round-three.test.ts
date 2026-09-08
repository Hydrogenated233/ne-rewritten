import { describe, expect, it } from 'vitest';
import { MinHeap } from '@/utils.ts';
import { resolve_display, type NotationDefinition } from '@/notation-definition.ts';
import { UP1MN } from '@/notations/MN/UPMN/UP1MN.ts';
import { UP2MN_v1a } from '@/notations/MN/UPMN/UP2MN-v1a.ts';
import { UPMS } from '@/notations/BM-like/UPMS.ts';
import { TUPMS } from '@/notations/BM-like/TUPMS.ts';
import main_source from '@/main.ts?raw';

describe('upstream round-three integration', () => {
    it('orders interleaved heap operations including duplicates and empty heaps', () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        expect(heap.pop_min()).toBeUndefined();
        for (const value of [7, 1, 4, 1, -3, 9]) heap.push(value);
        expect(heap.peek_min()).toBe(-3);
        expect(heap.pop_min()).toBe(-3);
        heap.push(0);
        const sorted: number[] = [];
        while (!heap.is_empty()) sorted.push(heap.pop_min()!);
        expect(sorted).toEqual([0, 1, 1, 4, 7, 9]);
        expect(heap.size).toBe(0);
    });

    it('registers UP1MN without changing existing UP2MN identity', () => {
        expect(main_source).toContain('register_notation(UP1MN)');
        expect(UP1MN.id).toBe('up1mn');
        expect(UP2MN_v1a.id).toBe('UP2MN-v1a');
    });

    function check_expansion<T>(notation: NotationDefinition<T>) {
        const display = resolve_display(notation.display);
        const top = notation.init()[0];
        for (const fs of [notation.FS, notation.FS_alter, notation.FS_short]) {
            if (!fs) continue;
            for (let index = 0; index < 4; index++) {
                const expr = fs(top, index);
                expect(display.from_display!(display.plain(expr))).toEqual(expr);
                for (let child = 0; child < 4; child++) {
                    const result = fs(expr, child);
                    expect(display.from_display!(display.plain(result))).toEqual(result);
                }
            }
        }
    }
    it('expands and reverse-parses UP1MN across FS variants', () => check_expansion(UP1MN));
    it('expands and reverse-parses UPMS across FS variants', () => check_expansion(UPMS));
    it('expands and reverse-parses TUPMS across FS variants', () => check_expansion(TUPMS));
});
