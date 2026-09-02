import { describe, expect, it } from 'vitest';
import expand_dialog_source from '../components/ExpandDialog.vue?raw';
import floating_panel_source from '../components/FloatingPanel.vue?raw';

describe('compact direct expansion windows', () => {
    it('uses the compact floating-panel header and a smaller default geometry', () => {
        expect(expand_dialog_source).toContain(':initial-width="520"');
        expect(expand_dialog_source).toContain(':min-width="320"');
        expect(expand_dialog_source).toContain(':compact="true"');
        expect(expand_dialog_source).toContain('<template #header-actions>');
        expect(floating_panel_source).toContain("'floating-panel--compact': compact");
        expect(floating_panel_source).toContain('<slot name="header-actions" />');
    });

    it('packs the controls into three desktop columns and two mobile columns', () => {
        expect(expand_dialog_source).toContain('grid-template-columns: minmax(0, 1.4fr)');
        expect(expand_dialog_source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(expand_dialog_source).toContain('height: 28px;');
        expect(expand_dialog_source).not.toContain('expand-window-toolbar');
    });
});
