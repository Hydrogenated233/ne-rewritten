import { describe, expect, it } from 'vitest';
import { export_analysis, import_analysis } from '@/core/analysis.ts';
import type { TreeNode } from '@/core/tree.ts';
import type { NotationDefinition } from '@/notation-definition.ts';

function notation(): NotationDefinition<number> {
    return {
        id: 'test',
        name: 'test',
        display: (value) => String(value),
        is_limit: () => false,
        compare: (a, b) => a - b,
        FS: (value) => value - 1,
        init: () => [2, 1],
    };
}

function root_with_analysis(): TreeNode<number> {
    const root: TreeNode<number> = { expr: 0, children: [], parent: null, index: -1 };
    const node: TreeNode<number> = {
        expr: 1,
        children: [],
        parent: root,
        index: 0,
        path: '0',
        extraData: { analysis: ['note'], hide_child: true },
    };
    root.children.push(node);
    return root;
}

describe('analysis hide state export', () => {
    it('omits hide state unless explicitly requested', () => {
        const root = root_with_analysis();
        expect(export_analysis(root)).toEqual([{ expr: 1, analysis: ['note'] }]);
        expect(export_analysis(root, true)).toEqual([{ expr: 1, analysis: ['note'], hide_child: true }]);
    });

    it('restores hide state when importing an exported entry', () => {
        const root = root_with_analysis();
        root.children[0].extraData = undefined;
        const result = import_analysis(root, [{ expr: 1, analysis: ['restored'], hide_child: true }], notation());
        expect(result.matched).toHaveLength(1);
        expect(root.children[0].extraData).toMatchObject({ analysis: ['restored'], hide_child: true });
    });
});
