type ReadXlsxFile = typeof import('read-excel-file/browser').default;

const read_xlsx_file = (window as typeof window & { readXlsxFile?: ReadXlsxFile }).readXlsxFile;
if (!read_xlsx_file) throw new Error('read-excel-file was not loaded from the standalone CDN.');

export default read_xlsx_file;
