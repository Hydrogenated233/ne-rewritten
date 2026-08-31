import { describe, expect, it } from 'vitest';
import app_source from '../App.vue?raw';
import tree_item_source from '../components/NotationTreeItem.vue?raw';

describe('analysis input presentation', () => {
    it('keeps plain analysis inputs transparent until focused', () => {
        expect(app_source).toMatch(
            /\.tree-item \.input-resize > input\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s,
        );
        expect(app_source).toMatch(
            /\.tree-item \.input-resize > input:focus\s*\{[^}]*border-color:\s*var\(--color-accent\);[^}]*background:\s*var\(--color-bg-secondary\);/s,
        );
    });

    it('overlays inline LaTeX while unfocused and reveals the raw input on focus', () => {
        expect(tree_item_source).toMatch(/class="analysis-inline-latex"\s+aria-hidden="true"/s);
        expect(app_source).toMatch(
            /\.input-resize\.has-inline-latex:not\(:focus-within\) > input\s*\{[^}]*opacity:\s*0;/s,
        );
        expect(app_source).toMatch(
            /\.input-resize\.has-inline-latex:focus-within > \.analysis-inline-latex\s*\{[^}]*opacity:\s*0;/s,
        );
    });
});
