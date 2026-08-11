import type { AnalysisEntry } from '@/core/analysis.ts';

export async function export_to_xlsx<T>(
    entries: AnalysisEntry<T>[],
    display: (expr: T) => string,
): Promise<ArrayBuffer> {
    // excel 库按需加载: 仅在导出时动态 import
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const rows = entries.map((entry) => [display(entry.expr), ...entry.analysis]);
    const result = await writeXlsxFile(rows);
    const blob = await result.toBlob();
    return await blob.arrayBuffer();
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

        const analysis: string[] = [];
        for (let i = 1; i < values.length; i++) {
            const v = values[i];
            analysis.push(v === null || v === undefined ? '' : String(v));
        }
        // 读回时行被补齐到最大列宽, 修剪尾部空分析列以保持原始宽度
        while (analysis.length > 0 && analysis[analysis.length - 1] === '') analysis.pop();

        entries.push({ expr, analysis });
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
    a.click();
    URL.revokeObjectURL(url);
}
