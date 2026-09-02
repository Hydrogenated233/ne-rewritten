import { describe, expect, it } from 'vitest';
import settings_source from '../core/settings.ts?raw';
import tree_item_source from '../components/NotationTreeItem.vue?raw';
import tree_source from '../core/tree.ts?raw';
import diagram_source from '../components/DiagramViewer.vue?raw';
import save_load_source from '../composables/use_save_load.ts?raw';
import theme_source from '../composables/use_color_theme.ts?raw';
import explore_toolbar_source from '../components/ExploreToolbar.vue?raw';
import settings_bar_source from '../components/SettingsBar.vue?raw';
import main_source from '../main.ts?raw';
import app_source from '../App.vue?raw';

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
        expect(tree_item_source).toContain('tooltip-cmnt--empty');
    });

    it('keeps long FS rows inside a bounded pointer-following tooltip', () => {
        expect(app_source).toContain('position: fixed;');
        expect(app_source).toContain('max-width: min(720px, calc(100vw - 24px));');
        expect(app_source).toContain('overflow: auto;');
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

    it('puts the one-shot expansion action on Explore and keeps import expansion two-way bound', () => {
        expect(explore_toolbar_source).toContain('handle_expand_all');
        expect(explore_toolbar_source).toContain("t('expand-all.expand')");
        expect(settings_bar_source).not.toContain('@mousedown="handle_expand_all"');
        expect(settings_bar_source).toContain('v-model="settings.expand_all_on_import"');
        expect(save_load_source).toContain('Persist imported analyses and any eager expansion immediately');
    });

    it('clamps the auto-save interval when loading persisted settings', () => {
        expect(settings_bar_source).toContain('on_auto_save_interval_input');
        expect(settings_bar_source).toContain('Math.max(10, Math.trunc(raw))');
        expect(main_source).toContain('Math.max(10, Math.trunc(Number(settings.auto_save_interval)');
    });
});
