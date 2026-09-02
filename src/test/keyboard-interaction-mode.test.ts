import { describe, expect, it } from 'vitest';
import app_source from '../App.vue?raw';
import diagram_source from '../components/DiagramViewer.vue?raw';
import hotkey_source from '../components/HotkeyDialog.vue?raw';
import settings_bar_source from '../components/SettingsBar.vue?raw';
import tree_item_source from '../components/NotationTreeItem.vue?raw';
import settings_source from '../core/settings.ts?raw';
import mountain_source from '../notations/draw_mountain_util.ts?raw';

describe('keyboard interaction mode', () => {
    it('is persisted as an explicit pointer/keyboard mode', () => {
        expect(settings_source).toContain("interaction_mode: 'pointer' | 'keyboard'");
        expect(settings_source).toContain("interaction_mode: 'pointer'");
        expect(settings_bar_source).toContain("settings.interaction_mode === mode");
    });

    it('moves pointer-only tree behavior behind the mode and exposes FS and subtree shortcuts', () => {
        expect(tree_item_source).toContain("settings.interaction_mode === 'keyboard'");
        expect(tree_item_source).toContain("e.key.toLowerCase() === 'f' && e.ctrlKey");
        expect(tree_item_source).toContain("e.key.toLowerCase() === 'h' && e.ctrlKey");
        expect(hotkey_source).toContain("{ keys: 'Ctrl+F', desc_key: 'hotkey.toggle-fs' }");
    });
});

describe('source-style floating diagram and FS tooltip', () => {
    it('uses an unframed floating canvas with a theme-aware canvas background', () => {
        expect(app_source).toContain('class="floating-canvas"');
        expect(app_source).not.toContain('class="diagram-floating"');
        expect(diagram_source).toContain('ctx.fillRect(0, 0, d.width, d.height)');
        expect(diagram_source).toContain('ctx.strokeRect(1, 1');
        expect(mountain_source).toContain('stroke_color: black');
        expect(mountain_source).toContain('width: 2');
    });

    it('positions and moves the FS tooltip from viewport pointer coordinates', () => {
        expect(tree_item_source).toContain(':style="tooltip_style"');
        expect(tree_item_source).toContain('position_tooltip(event.clientX, event.clientY)');
        expect(tree_item_source).not.toContain(
            'settings.diagram_follow && props.notation.draw_diagram && !settings.analysis_latex_preview',
        );
    });
});
