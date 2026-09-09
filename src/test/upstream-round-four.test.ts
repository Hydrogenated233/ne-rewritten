import { afterEach, describe, expect, it, vi } from 'vitest';
import { expand_item, set_max_find_fs } from '@/core/expander.ts';
import { FsTrialExpansionError } from '@/core/errors.ts';
import { init_dataset } from '@/core/tree.ts';
import {
    expand_all_pending, export_analysis, import_analysis,
    parse_analysis_entries, stringify_analysis_entries,
} from '@/core/analysis.ts';
import type { NotationDefinition } from '@/notation-definition.ts';
import { UP1MN, convert_to_layer } from '@/notations/MN/UPMN/UP1MN.ts';
import { UPMS } from '@/notations/BM-like/UPMS.ts';

const successors: NotationDefinition<number> = {
    id: 'sync-successors', name: 'Successors', display: String,
    init: () => [10, 5], compare: (a, b) => a - b,
    is_limit: () => false, FS: (expr) => Math.max(0, expr - 1),
};

afterEach(() => {
    set_max_find_fs(10);
    vi.restoreAllMocks();
});

describe('upstream round-four integration', () => {
    it('retains below-bottom imports lazily through save, restore and expansion', () => {
        const root = init_dataset(successors);
        const entry = { expr: 2, analysis: ['below bottom'], hide_child: true };
        const result = import_analysis(root, [entry], successors);
        expect(result.not_found).toEqual([]);
        expect(root.children.map((node) => node.expr)).toEqual([10, 5]);
        expect(root.children[1].children).toEqual([]);
        expect(root.children[1].pending_items?.[0].expr).toBe(2);
        const saved = stringify_analysis_entries(export_analysis(root, true));
        const restored = init_dataset(successors);
        import_analysis(restored, parse_analysis_entries(saved), successors);
        expect(export_analysis(restored, true)).toEqual([entry]);
        expand_all_pending(restored, successors, 'FS');
        expect(restored.children[1].children.map((node) => node.expr)).toEqual([4, 3, 2]);
        expect(restored.children[1].children[2].extraData).toMatchObject({
            analysis: ['below bottom'], hide_child: true,
        });
        expect(export_analysis(restored, true)).toEqual([entry]);
    });

    it('continues to reject above-top imports without changing the tree', () => {
        const root = init_dataset(successors);
        const entry = { expr: 11, analysis: ['outside'] };
        expect(import_analysis(root, [entry], successors).not_found).toEqual([entry]);
        expect(export_analysis(root)).toEqual([]);
    });

    it('allows a successful high FS index instead of treating it as failed trials', () => {
        set_max_find_fs(2);
        const notation = {
            ...successors, init: () => [100, 5],
            is_limit: () => true, FS: (_expr: number, index: number) => index,
        };
        const root = init_dataset(notation);
        const node = root.children[0];
        node.fs_state = { variant: 'FS', index: 50 };
        expect(expand_item(node, notation, 'FS')?.expr).toBe(51);
    });

    it('applies changed trial limits to the next expansion and preserves failed nodes', () => {
        const notation = { ...successors, is_limit: () => true, FS: vi.fn((_expr: number, index: number) => index) };
        const node = init_dataset(notation).children[0];
        set_max_find_fs(2);
        expect(() => expand_item(node, notation, 'FS')).toThrow(FsTrialExpansionError);
        expect(notation.FS).toHaveBeenCalledTimes(3);
        expect(node.children).toEqual([]);
        expect(node.fs_state).toBeUndefined();
        set_max_find_fs(10);
        expect(expand_item(node, notation, 'FS')?.expr).toBe(6);
    });

    it.each(['false', 'throws'] as const)('keeps initial and expanded nodes when debug verification %s', (mode) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const debug_verification = vi.fn(() => {
            if (mode === 'throws') throw new Error('debug only');
            return false;
        });
        const notation = { ...successors, debug_verification };
        const root = init_dataset(notation);
        expect(root.children).toHaveLength(2);
        expect(expand_item(root.children[0], notation, 'FS')?.expr).toBe(9);
        expect(debug_verification).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledTimes(3);
    });

    it('keeps UP1MN and its indexed UPMS equivalent aligned across FS modes', () => {
        const to_upms = (expr: Parameters<typeof convert_to_layer>[0]) =>
            convert_to_layer(expr).map((column) => column.map((value) => value + 1));
        for (const mode of ['FS', 'FS_short', 'FS_alter'] as const) {
            const fs = UP1MN[mode]!;
            let level = [0, 1, 2, 3].map((index) => fs(UP1MN.init()[0], index));
            for (let depth = 0; depth < 3; depth++) {
                const next: typeof level = [];
                for (const expr of level) {
                    for (let index = 0; index < 4; index++) {
                        const result = fs(expr, index);
                        expect(UPMS.compare(to_upms(result), UPMS[mode]!(to_upms(expr), index))).toBe(0);
                        next.push(result);
                    }
                }
                level = next;
            }
        }
    });
});
