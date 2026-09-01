import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focus_node, focus_node_input, prepare_pointer_focus } from '@/composables/use_focus_tracker.ts';
import type { TreeNode } from '@/core/tree.ts';

interface FakeInput {
    focus: ReturnType<typeof vi.fn>;
    getBoundingClientRect: ReturnType<typeof vi.fn>;
}

describe('focus tracker scroll policy', () => {
    let input: FakeInput;
    let querySelector: ReturnType<typeof vi.fn>;
    let scrollTo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        input = {
            focus: vi.fn(),
            getBoundingClientRect: vi.fn(() => ({ top: 120 })),
        };
        querySelector = vi.fn(() => input);
        scrollTo = vi.fn();
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: { querySelector },
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { scrollY: 100, scrollTo },
        });
    });

    afterEach(() => {
        delete (globalThis as any).document;
        delete (globalThis as any).window;
    });

    it('does not scroll when focusing a node while the setting is disabled', () => {
        focus_node('0,1', false);

        expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('keeps smooth scrolling when focusing a node while the setting is enabled', () => {
        focus_node('0,1', true);

        expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(scrollTo).toHaveBeenCalledWith({ top: 160, behavior: 'smooth' });
    });

    it('applies the same policy to a node input and pointer focus preparation', () => {
        const node = { path: '2', index: 2, expr: 'x', children: [], parent: null } as unknown as TreeNode<string>;

        focus_node_input(node, false);
        expect(scrollTo).not.toHaveBeenCalled();

        input.focus.mockClear();
        prepare_pointer_focus(input as unknown as HTMLElement, false);
        expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });

        input.focus.mockClear();
        prepare_pointer_focus(input as unknown as HTMLElement, true);
        expect(input.focus).not.toHaveBeenCalled();
    });
});
