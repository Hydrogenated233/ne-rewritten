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

    it('prevents native mouse-focus scrolling when the setting is disabled', () => {
        expect(tree_item_source).toContain('@mousedown="on_input_mousedown"');
        expect(tree_item_source).toMatch(
            /function on_input_mousedown\(e: MouseEvent\)[\s\S]*?prepare_pointer_focus\(e\.currentTarget as HTMLInputElement, settings\.scroll_on_focus\)/,
        );
        expect(tree_item_source).toMatch(
            /el\.focus\(\{ preventScroll: true \}\);\s*if \(settings\.scroll_on_focus\) \{[\s\S]*?window\.scrollTo\(/,
        );
    });

    it('applies the same scroll policy to the find input', async () => {
        const toolbar_source = await import('../components/ExploreToolbar.vue?raw');
        expect(toolbar_source.default).toContain('@mousedown="on_find_mousedown"');
        expect(toolbar_source.default).toMatch(
            /if \(settings\.scroll_on_focus\) \{\s*window\.scrollTo\(/,
        );
    });
});
