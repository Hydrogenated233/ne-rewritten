import { describe, expect, it } from 'vitest';
import {
    blank_note,
    clear_cells,
    column_label,
    decode_note,
    delete_note_axis,
    encode_note,
    insert_note_axis,
    MAX_NOTE_CELLS,
    NoteTableStore,
    note_export_rows,
    put_cells,
    range_rows,
    selected_range,
} from '@/core/note_table.ts';
import { note_clipboard_html, note_clipboard_text, parse_note_text } from '@/core/note_clipboard.ts';
import { note_storage_key } from '@/core/storage_keys.ts';

class MemoryStorage {
    data = new Map<string, string>();
    fail = false;
    getItem(key: string) {
        return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string) {
        if (this.fail) throw new Error('quota');
        this.data.set(key, value);
    }
    removeItem(key: string) {
        this.data.delete(key);
    }
}

describe('note table data and clipboard', () => {
    it('preserves legacy whitespace, blank lines, commas, quotes and trailing empty lines', () => {
        const raw = ' 1,2,4,8 \r\n\r\n"literal"\r\n';
        expect(decode_note(raw)).toEqual([[' 1,2,4,8 '], [''], ['"literal"'], ['']]);
        expect(decode_note('{"example":"literal"}')).toEqual([['{"example":"literal"}']]);
    });
    it('round trips literal cells without confusing a formula with a number', () => {
        const rows = [
            ['1,2,4,8', '001', '=SUM(A1)', ''],
            ['a\nb', '"quoted"', '', ''],
        ];
        expect(decode_note(encode_note(rows))).toEqual(rows);
        expect(decode_note(null)).toEqual(blank_note());
    });
    it('fails closed on unknown table versions or invalid data', () => {
        expect(() => decode_note('{"format":"nerw-note-table","version":2,"rows":[["x"]]}')).toThrow();
        expect(() => decode_note('{"format":"nerw-note-table","version":1,"rows":[[23]]}')).toThrow();
    });
    it('pastes a rectangle from a selected corner and expands without changing other cells', () => {
        const rows = [
            ['keep', 'old'],
            ['stay', 'replace'],
        ];
        const result = put_cells(rows, { row: 1, col: 1 }, [
            ['1,2', 'new'],
            ['next', ''],
        ]);
        expect(result).toEqual([
            ['keep', 'old', ''],
            ['stay', '1,2', 'new'],
            ['', 'next', ''],
        ]);
        expect(rows).toEqual([
            ['keep', 'old'],
            ['stay', 'replace'],
        ]);
        expect(() => put_cells(rows, { row: MAX_NOTE_CELLS, col: 1 }, [['x']])).toThrow(RangeError);
    });
    it('supports rectangular clearing, insertion, deletion and an empty remaining table', () => {
        const rows = [
            ['a', 'b'],
            ['c', 'd'],
        ];
        const range = selected_range({ row: 1, col: 1 }, { row: 0, col: 0 });
        expect(range_rows(rows, range)).toEqual(rows);
        expect(clear_cells(rows, range)).toEqual([
            ['', ''],
            ['', ''],
        ]);
        expect(insert_note_axis(rows, 'row', 0)).toEqual([
            ['a', 'b'],
            ['', ''],
            ['c', 'd'],
        ]);
        expect(insert_note_axis(rows, 'col', 0)).toEqual([
            ['a', '', 'b'],
            ['c', '', 'd'],
        ]);
        expect(delete_note_axis(rows, 'row', range)).toEqual([['', '']]);
        expect(delete_note_axis(rows, 'col', range)).toEqual([[''], ['']]);
        expect(column_label(26)).toBe('AA');
    });
    it('preserves plain text literals and uses only tabs for spreadsheet columns', () => {
        expect(parse_note_text('1,2,4,8\n"literal"')).toEqual([['1,2,4,8'], ['"literal"']]);
        expect(parse_note_text('1,2\t001\r\n"two\nlines"\t"quoted ""value"""\r\n')).toEqual([
            ['1,2', '001'],
            ['two\nlines', 'quoted "value"'],
        ]);
        expect(parse_note_text('\t\nx\t')).toEqual([
            ['', ''],
            ['x', ''],
        ]);
        expect(() => parse_note_text('"bad\tquote')).toThrow();
    });
    it('round trips a spreadsheet rectangle and escapes clipboard HTML', () => {
        const rows = [
            ['1,2', 'two\nlines'],
            ['"quoted"', '<img src=x onerror=evil()>'],
        ];
        expect(parse_note_text(note_clipboard_text(rows))).toEqual(rows);
        expect(note_clipboard_html(rows)).toContain('&lt;img');
        expect(note_clipboard_html(rows)).not.toContain('<img');
    });
    it('omits unused trailing space, never interior blank rows', () => {
        expect(
            note_export_rows([
                ['x', '', ''],
                ['', '', ''],
                ['', 'y', ''],
                ['', '', ''],
            ]),
        ).toEqual([
            ['x', ''],
            ['', ''],
            ['', 'y'],
        ]);
    });
});

describe('note table sessions', () => {
    it('loads default sizes for old notes and persists resized dimensions per notation', () => {
        const storage = new MemoryStorage();
        storage.setItem(note_storage_key('a'), '1,2\nold');
        const store = new NoteTableStore(() => storage);
        const a = store.open('a');
        expect(a.layout).toEqual({ row_heights: [32, 32], col_widths: [144] });
        a.resize_axis('col', 0, 240);
        a.resize_axis('row', 1, 80);
        const reloaded = new NoteTableStore(() => storage).open('a');
        expect(reloaded.layout).toEqual({ row_heights: [32, 80], col_widths: [240] });
        expect(reloaded.rows).toEqual([['1,2'], ['old']]);
        expect(reloaded.can_undo).toBe(false);
        expect(store.open('b').layout.col_widths[0]).toBe(144);
        expect(store.open('a')).toBe(a);
    });
    it('undoes dimensions and cell edits in the same transaction history', () => {
        const storage = new MemoryStorage();
        const a = new NoteTableStore(() => storage).open('a');
        a.edit_cell({ row: 0, col: 0 }, 'text');
        a.resize_axis('col', 0, 220);
        a.undo();
        expect(a.layout.col_widths[0]).toBe(144);
        expect(a.rows[0][0]).toBe('text');
        a.undo();
        expect(a.rows[0][0]).toBe('');
        a.redo();
        a.redo();
        expect(a.layout.col_widths[0]).toBe(220);
        a.resize_axis('col', 0, 220);
        a.undo();
        expect(a.layout.col_widths[0]).toBe(144);
    });
    it('moves sizes with inserted or removed rows and columns and restores them on undo', () => {
        const a = new NoteTableStore(() => new MemoryStorage()).open('a');
        a.resize_axis('col', 1, 300);
        a.resize_axis('row', 1, 120);
        a.insert_axis('col', 0);
        a.insert_axis('row', 0);
        expect(a.layout.col_widths.slice(0, 3)).toEqual([144, 144, 300]);
        expect(a.layout.row_heights.slice(0, 3)).toEqual([32, 32, 120]);
        const first = { top: 0, bottom: 1, left: 0, right: 1 };
        a.delete_axis('col', first);
        a.delete_axis('row', first);
        expect(a.layout.col_widths[0]).toBe(300);
        expect(a.layout.row_heights[0]).toBe(120);
        a.undo();
        a.undo();
        expect(a.layout.col_widths[2]).toBe(300);
        expect(a.layout.row_heights[2]).toBe(120);
        a.delete_axis('row', { top: 0, bottom: 99, left: 0, right: 99 });
        a.delete_axis('col', { top: 0, bottom: 99, left: 0, right: 99 });
        expect(a.layout).toEqual({ row_heights: [32], col_widths: [144] });
    });
    it('preserves dimensions on paste and clearing while giving new axes default sizes', () => {
        const a = new NoteTableStore(() => new MemoryStorage()).open('a');
        a.resize_axis('col', 0, 200);
        a.resize_axis('row', 0, 100);
        a.change(put_cells(a.rows, { row: 8, col: 4 }, [['new']]));
        expect(a.layout.col_widths).toEqual([200, 144, 144, 144, 144]);
        expect(a.layout.row_heights).toEqual([100, 32, 32, 32, 32, 32, 32, 32, 32]);
        a.change(clear_cells(a.rows, { top: 0, bottom: 8, left: 0, right: 4 }));
        expect(a.layout.col_widths[0]).toBe(200);
        a.undo();
        a.undo();
        expect(a.layout.col_widths).toEqual([200, 144, 144, 144]);
    });
    it('bounds dimensions and ignores malformed optional layout without losing cells', () => {
        const storage = new MemoryStorage();
        storage.setItem(
            note_storage_key('a'),
            JSON.stringify({
                format: 'nerw-note-table',
                version: 1,
                rows: [
                    ['x', 'y'],
                    ['z', ''],
                ],
                layout: { row_heights: [null, 99999], col_widths: [-1, '200'] },
            }),
        );
        const a = new NoteTableStore(() => storage).open('a');
        expect(a.layout).toEqual({ row_heights: [32, 600], col_widths: [56, 144] });
        a.resize_axis('row', 0, -200);
        a.resize_axis('col', 1, 2000);
        expect(a.layout).toEqual({ row_heights: [24, 600], col_widths: [56, 800] });
        a.resize_axis('row', -1, 50);
        a.resize_axis('col', 2, 50);
        expect(a.rows[0]).toEqual(['x', 'y']);
        expect(a.layout.col_widths).toHaveLength(2);
    });
    it('retains unsaved dimensions for retry and discards them on deletion', () => {
        const storage = new MemoryStorage();
        const store = new NoteTableStore(() => storage);
        const a = store.open('a');
        storage.fail = true;
        a.resize_axis('col', 0, 240);
        expect(a.save_failed).toBe(true);
        expect(store.open('a').layout.col_widths[0]).toBe(240);
        storage.fail = false;
        a.save();
        expect(new NoteTableStore(() => storage).open('a').layout.col_widths[0]).toBe(240);
        store.forget('a');
        storage.removeItem(note_storage_key('a'));
        a.resize_axis('row', 0, 100);
        a.undo();
        expect(storage.getItem(note_storage_key('a'))).toBeNull();
        expect(store.open('a').layout.col_widths[0]).toBe(144);
    });
    it('saves each input and groups one cell edit as one undoable operation', () => {
        const storage = new MemoryStorage();
        storage.setItem(note_storage_key('a'), '1,2\n"literal"');
        const store = new NoteTableStore(() => storage);
        const session = store.open('a');
        expect(storage.getItem(note_storage_key('a'))).toBe('1,2\n"literal"');
        session.edit_cell({ row: 0, col: 0 }, 'x');
        session.edit_cell({ row: 0, col: 0 }, 'xy');
        expect(decode_note(storage.getItem(note_storage_key('a')))[0][0]).toBe('xy');
        session.finish_edit();
        session.undo();
        expect(session.rows[0][0]).toBe('1,2');
        expect(session.can_undo).toBe(false);
        session.redo();
        expect(session.rows[0][0]).toBe('xy');
    });
    it('isolates history by notation, retains it on reopen and drops it on reload', () => {
        const storage = new MemoryStorage();
        const store = new NoteTableStore(() => storage);
        const a = store.open('a');
        a.change([['a']]);
        store.open('b').change([['b']]);
        expect(store.open('a')).toBe(a);
        a.undo();
        expect(store.open('b').rows).toEqual([['b']]);
        a.redo();
        const reloaded = new NoteTableStore(() => storage).open('a');
        expect(reloaded.rows).toEqual([['a']]);
        expect(reloaded.can_undo).toBe(false);
    });
    it('cancels an edit, clears redo on a new edit and treats paste as one undo', () => {
        const session = new NoteTableStore(() => new MemoryStorage()).open('a');
        session.change([['initial']]);
        session.edit_cell({ row: 0, col: 0 }, 'cancel');
        session.finish_edit(true);
        expect(session.rows).toEqual([['initial']]);
        session.change([
            ['a', 'b'],
            ['c', 'd'],
        ]);
        session.undo();
        expect(session.rows).toEqual([['initial']]);
        session.change([['other']]);
        expect(session.can_redo).toBe(false);
    });
    it('retains unsaved cells on reopen after quota failures and supports retry', () => {
        const storage = new MemoryStorage();
        const store = new NoteTableStore(() => storage);
        const session = store.open('a');
        storage.fail = true;
        session.change([['unsaved']]);
        expect(session.save_failed).toBe(true);
        expect(store.open('a').rows).toEqual([['unsaved']]);
        storage.fail = false;
        session.save();
        expect(session.save_failed).toBe(false);
        expect(decode_note(storage.getItem(note_storage_key('a')))).toEqual([['unsaved']]);
    });
    it('invalidates history on permanent deletion and cannot resurrect an old edit', () => {
        const storage = new MemoryStorage();
        const store = new NoteTableStore(() => storage);
        const old = store.open('reused');
        old.change([['private']]);
        old.edit_cell({ row: 0, col: 0 }, 'draft');
        store.forget('reused');
        storage.removeItem(note_storage_key('reused'));
        old.finish_edit(true);
        old.undo();
        expect(storage.getItem(note_storage_key('reused'))).toBeNull();
        expect(store.open('reused').can_undo).toBe(false);
        expect(store.open('reused').rows).toEqual(blank_note());
    });
    it('invalidates old sessions on external storage replacement', () => {
        const storage = new MemoryStorage();
        const store = new NoteTableStore(() => storage);
        const old = store.open('a');
        old.change([['old']]);
        storage.setItem(note_storage_key('a'), 'external, literal');
        expect(store.open('a').rows).toEqual([['external, literal']]);
        expect(old.valid).toBe(false);
        old.undo();
        expect(storage.getItem(note_storage_key('a'))).toBe('external, literal');
    });
});
