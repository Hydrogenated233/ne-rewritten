import type { AnalysisEntry } from '@/core/analysis.ts';

export interface XlsxNoteSheet {
    name: string;
    text: string;
}

type XlsxCell = string | number | boolean | null;
type XlsxRow = XlsxCell[];

/** Parse the CSV-like lines used by the original notes exporter. */
export function note_text_to_rows(text: string): string[][] {
    const rows: string[][] = [];
    for (const raw_line of text.replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw_line.trim();
        if (!line) continue;

        const fields: string[] = [];
        let current = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const character = line[i];
            if (quoted) {
                if (character === '"') {
                    if (line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    current += character;
                }
            } else if (character === '"') {
                quoted = true;
            } else if (character === ',') {
                fields.push(current);
                current = '';
            } else {
                current += character;
            }
        }
        fields.push(current);
        rows.push(fields);
    }
    return rows;
}

async function write_xlsx_sheets(sheets: Array<{ data: XlsxRow[]; sheet: string }>): Promise<ArrayBuffer> {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const result = await writeXlsxFile(sheets);
    const blob = await result.toBlob();
    return await blob.arrayBuffer();
}

export async function export_to_xlsx<T>(
    entries: AnalysisEntry<T>[],
    display: (expr: T) => string,
    include_hide_child = false,
): Promise<ArrayBuffer> {
    // excel 库按需加载: 仅在导出时动态 import
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const rows = entries.map((entry) => [
        display(entry.expr),
        ...entry.analysis,
        ...(include_hide_child && entry.hide_child ? [true] : []),
    ]);
    const result = await writeXlsxFile(rows);
    const blob = await result.toBlob();
    return await blob.arrayBuffer();
}

export async function export_analysis_with_notes_to_xlsx<T>(
    entries: AnalysisEntry<T>[],
    display: (expr: T) => string,
    include_hide_child = false,
    notes: XlsxNoteSheet[] = [],
): Promise<ArrayBuffer> {
    const rows: XlsxRow[] = entries.map((entry) => [
        display(entry.expr),
        ...entry.analysis,
        ...(include_hide_child && entry.hide_child ? [true] : []),
    ]);
    const sheets: Array<{ data: XlsxRow[]; sheet: string }> = [{ data: rows, sheet: 'sheet1' }];
    for (const note of notes) {
        const note_rows = note_text_to_rows(note.text);
        if (note_rows.length > 0) sheets.push({ data: note_rows, sheet: note.name || 'Notes' });
    }
    return write_xlsx_sheets(sheets);
}

export async function import_from_xlsx<T>(
    buffer: ArrayBuffer,
    from_display: (str: string) => T,
): Promise<AnalysisEntry<T>[]> {
    // excel 库按需加载: 仅在导入时动态 import
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(buffer);
    const rows = sheets[0]?.data ?? [];

    const entries: AnalysisEntry<T>[] = [];

    for (const values of rows) {
        const expr_str = values[0];
        if (expr_str === undefined || expr_str === null || expr_str === '') continue;

        let expr: T | undefined;
        try {
            expr = from_display(String(expr_str));
        } catch (e) {
            console.log('xlsx import: skipped row, from_display failed for "' + expr_str + '"', e);
            if (!(entries as any).skipped) (entries as any).skipped = [];
            (entries as any).skipped.push(String(expr_str));
        }

        if (expr === undefined) continue;

        let end = values.length;
        let hide_child = false;
        const last = values[values.length - 1];
        const is_legacy_hide_marker =
            values.length === 3 &&
            String(last ?? '')
                .trim()
                .toLowerCase() === 'true';
        if (last === true || is_legacy_hide_marker) {
            hide_child = true;
            end--;
        }
        const analysis: string[] = [];
        for (let i = 1; i < end; i++) {
            const v = values[i];
            analysis.push(v === null || v === undefined ? '' : String(v));
        }
        // 读回时行被补齐到最大列宽, 修剪尾部空分析列以保持原始宽度
        while (analysis.length > 0 && analysis[analysis.length - 1] === '') analysis.pop();

        entries.push({ expr, analysis, ...(hide_child ? { hide_child: true } : {}) });
    }

    return entries;
}

export function download_buffer(buffer: ArrayBuffer, filename: string): void {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
    }, 0);
}
