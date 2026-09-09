import Papa from 'papaparse';
import { check_note_size, rectangular_rows, type NoteRows } from '@/core/note_table.ts';

export function parse_note_text(text: string): NoteRows {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (!normalized.includes('\t')) {
        const lines = normalized.split('\n');
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
        return rectangular_rows(lines.map((line) => [line]));
    }
    const parsed = Papa.parse<string[]>(normalized, { delimiter: '\t', newline: '\n', dynamicTyping: false });
    if (parsed.errors.length) throw new Error('notes.invalid-paste');
    if (normalized.endsWith('\n') && parsed.data[parsed.data.length - 1]?.every((cell) => cell === '')) {
        parsed.data.pop();
    }
    return rectangular_rows(parsed.data);
}

export function note_clipboard_text(rows: NoteRows): string {
    return Papa.unparse(rows, { delimiter: '\t', newline: '\r\n' });
}

/** Read only cell text from a detached document; never insert clipboard HTML into the app. */
export function parse_note_html(html: string): NoteRows | null {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const table = document.querySelector('table');
    if (!table) return null;
    const rows: NoteRows = [];
    const occupied = new Set<string>();
    for (const [r, source] of Array.from(table.rows).entries()) {
        check_note_size(r + 1, 1);
        rows[r] ??= [];
        let c = 0;
        for (const cell of Array.from(source.cells)) {
            while (occupied.has(`${r},${c}`)) c++;
            const height = Math.max(1, cell.rowSpan),
                width = Math.max(1, cell.colSpan);
            check_note_size(r + height, c + width);
            cell.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));
            for (let dr = 0; dr < height; dr++) {
                rows[r + dr] ??= [];
                for (let dc = 0; dc < width; dc++) {
                    rows[r + dr][c + dc] = dr === 0 && dc === 0 ? (cell.textContent ?? '') : '';
                    occupied.add(`${r + dr},${c + dc}`);
                }
            }
            c += width;
        }
    }
    return rows.length ? rectangular_rows(rows.map((row) => Array.from(row, (value) => value ?? ''))) : null;
}

export function note_clipboard_html(rows: NoteRows): string {
    const escape = (text: string) =>
        text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '<br>');
    return (
        '<table>' +
        rows
            .map(
                (row) =>
                    '<tr>' +
                    row
                        .map((cell) => `<td style="white-space:pre-wrap;mso-number-format:'\\@'">${escape(cell)}</td>`)
                        .join('') +
                    '</tr>',
            )
            .join('') +
        '</table>'
    );
}
