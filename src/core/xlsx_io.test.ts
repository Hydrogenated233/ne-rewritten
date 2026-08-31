import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/browser';
import { export_analysis_with_notes_to_xlsx, note_text_to_rows } from '@/core/xlsx_io';

describe('note xlsx rows', () => {
    it('keeps the original CSV-like note sheet format', () => {
        expect(note_text_to_rows('first,second\n"quoted, value",plain\n"escaped ""quote"""')).toEqual([
            ['first', 'second'],
            ['quoted, value', 'plain'],
            ['escaped "quote"'],
        ]);
    });

    it('normalizes line endings and skips blank note lines', () => {
        expect(note_text_to_rows('  first  \r\n\r\n second\n')).toEqual([['first'], ['second']]);
        expect(note_text_to_rows('')).toEqual([]);
    });

    it('writes notes to a separate XLSX sheet', async () => {
        const buffer = await export_analysis_with_notes_to_xlsx([{ expr: 'root', analysis: ['ok'] }], String, false, [
            { name: 'Notes', text: 'a,b\n"quoted, value",plain' },
        ]);
        const sheets = await readXlsxFile(buffer);

        expect(sheets).toHaveLength(2);
        expect(sheets[0]).toMatchObject({ sheet: 'sheet1', data: [['root', 'ok']] });
        expect(sheets[1]).toMatchObject({
            sheet: 'Notes',
            data: [
                ['a', 'b'],
                ['quoted, value', 'plain'],
            ],
        });
    });
});
