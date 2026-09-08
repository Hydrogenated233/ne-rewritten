import { describe, expect, it } from 'vitest';
import { BM4 } from '@/notations/BM-like/BM.ts';
import { find_operation_sequence } from '@/core/operation_sequence.ts';
import { register_notation, get_notation, notify_change } from '@/core/registry.ts';
import { use_expand_dialog } from '@/composables/use_expand_dialog.ts';
import expand_dialog_source from '@/components/ExpandDialog.vue?raw';

describe('operation sequences in direct expansion', () => {
    it('uses the real result expressions when rendering direct expansion sequences', () => {
        if (!get_notation(BM4.id)) register_notation({ ...BM4, category_id: undefined });
        notify_change();
        const dialog = use_expand_dialog();
        const id = dialog.open('(0)(1)(2)(3)', {
            notation_id: BM4.id, notation_equiv: undefined, variant: 'FS_short', FS_index: 1, count: 2,
        });
        dialog.run(id);
        const note = dialog.notes.value.find((item) => item.id === id)!;
        expect(note.preview_status).toBe('ok');
        expect(note.preview_terms).toHaveLength(2);
        expect(note.preview).toBe(note.preview_terms!.map((term) => term.text).join('\n'));
        expect(find_operation_sequence(BM4, note.preview_terms![0].expr as number[][], note.variant))
            .toEqual({ status: 'found', sequence: [1, 3, 1] });
        expect(expand_dialog_source).toContain('term.expr');
        expect(expand_dialog_source).toContain(':variant="note.variant"');
        dialog.invalidate(id);
        expect(note.preview_terms).toEqual([]);
        dialog.close(id);
    });
});
