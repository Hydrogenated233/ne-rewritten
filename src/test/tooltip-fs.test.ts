import { describe, expect, it } from 'vitest';
import settings_source from '../core/settings.ts?raw';
import tree_item_source from '../components/NotationTreeItem.vue?raw';
import tree_source from '../core/tree.ts?raw';
import diagram_source from '../components/DiagramViewer.vue?raw';
import save_load_source from '../composables/use_save_load.ts?raw';
import theme_source from '../composables/use_color_theme.ts?raw';

describe('FS hover tooltip migration', () => {
    it('exposes a persisted tooltip item-count setting', () => {
        expect(settings_source).toContain('tooltip_fs: number');
        expect(settings_source).toContain('tooltip_fs: 3');
    });

    it('matches analysis comments and renders structured FS rows', () => {
        expect(tree_item_source).toContain('const comments = new Map<string, string>()');
        expect(tree_item_source).toContain('comment: comments.get(resolved_original.value.plain(fs_expr)) ??');
        expect(tree_item_source).toContain('class="tooltip-fs"');
        expect(tree_item_source).toContain('class="tooltip-cmnt"');
    });
});

describe('Ctrl+Backspace tree deletion', () => {
    it('keeps deletion in the core tree helper', () => {
        expect(tree_source).toContain('export function remove_node');
        expect(tree_item_source).toContain("e.key === 'Backspace' && e.ctrlKey");
        expect(tree_item_source).toContain('remove_node(props.node)');
    });

    it('ports the source diagram-follow and auto-save controls', () => {
        expect(settings_source).toContain('diagram_follow: boolean');
        expect(settings_source).toContain('diagram_scale: number');
        expect(settings_source).toContain('auto_save_interval: number');
        expect(settings_source).toContain('auto_save_hidden: boolean');
        expect(diagram_source).toContain('Math.pow(1.25, Number(settings.diagram_scale) || 0)');
        expect(save_load_source).toContain('Math.max(10, Number(settings.auto_save_interval) || 30)');
        expect(save_load_source).toContain('export_analysis(r, settings.auto_save_hidden)');
    });

    it('includes both source-repository palettes', () => {
        expect(theme_source).toContain("id: 'source-light'");
        expect(theme_source).toContain("'--color-primary': '#2563eb'");
        expect(theme_source).toContain("id: 'source-dark'");
        expect(theme_source).toContain("'--color-bg': '#1a1a1a'");
    });
});
