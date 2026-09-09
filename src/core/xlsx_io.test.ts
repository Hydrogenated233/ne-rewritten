import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/browser';
import { export_analysis_with_notes_to_xlsx, note_text_to_rows } from '@/core/xlsx_io';
import { encode_note } from '@/core/note_table';

describe('note xlsx rows', () => {
    it('migrates legacy notes without interpreting commas or quotes', () => {
        expect(note_text_to_rows('first,second\n"quoted, value",plain\n"escaped ""quote"""')).toEqual([
            ['first,second'],
            ['"quoted, value",plain'],
            ['"escaped ""quote"""'],
        ]);
    });

    it('normalizes line endings but keeps whitespace and interior blank lines', () => {
        expect(note_text_to_rows('  first  \r\n\r\n second\n')).toEqual([['  first  '], [''], [' second']]);
        expect(note_text_to_rows('')).toEqual([]);
    });

    it('writes notes to a separate XLSX sheet', async () => {
        const buffer = await export_analysis_with_notes_to_xlsx([{ expr: 'root', analysis: ['ok'] }], String, false, [
            {
                name: 'Notes',
                rows: [
                    ['a,b', '001'],
                    ['"quoted, value"', 'plain'],
                    ['=1+2', 'two\nlines'],
                ],
            },
        ]);
        const sheets = await readXlsxFile(buffer);

        expect(sheets).toHaveLength(2);
        expect(sheets[0]).toMatchObject({ sheet: 'sheet1', data: [['root', 'ok']] });
        expect(sheets[1]).toMatchObject({
            sheet: 'Notes',
            data: [
                ['a,b', '001'],
                ['"quoted, value"', 'plain'],
                ['=1+2', 'two\nlines'],
            ],
        });
    });

    it('exports saved table documents and unconverted legacy notes', async () => {
        const buffer = await export_analysis_with_notes_to_xlsx([], String, false, [
            {
                name: 'Table',
                text: encode_note([
                    ['1,2', '', 'x'],
                    ['', '', ''],
                    ['', 'y', ''],
                ]),
            },
            { name: 'Legacy', text: '1,2,3\n"quoted"' },
        ]);
        const sheets = await readXlsxFile(buffer);
        expect(sheets[1].data).toEqual([
            ['1,2', null, 'x'],
            [null, null, null],
            [null, 'y', null],
        ]);
        expect(sheets[2].data).toEqual([['1,2,3'], ['"quoted"']]);
    });
});
