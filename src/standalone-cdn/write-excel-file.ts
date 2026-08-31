type WriteXlsxFile = typeof import('write-excel-file/browser').default;

const write_xlsx_file = (window as typeof window & { writeXlsxFile?: WriteXlsxFile }).writeXlsxFile;
if (!write_xlsx_file) throw new Error('write-excel-file was not loaded from the standalone CDN.');

export default write_xlsx_file;
