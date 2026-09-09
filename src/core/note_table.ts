import type { AppStorageLike } from '@/core/storage.ts';
import { note_storage_key } from '@/core/storage_keys.ts';

export type NoteRows = string[][];
export interface CellPosition {
    row: number;
    col: number;
}
export interface CellRange {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

export const MAX_NOTE_CELLS = 20000;
const FORMAT = 'nerw-note-table';
const MAX_HISTORY = 100;

export function check_note_size(height: number, width: number): void {
    if (
        !Number.isSafeInteger(height) ||
        !Number.isSafeInteger(width) ||
        height < 1 ||
        width < 1 ||
        height * width > MAX_NOTE_CELLS
    ) {
        throw new RangeError('notes.too-large');
    }
}

export function blank_note(height = 8, width = 4): NoteRows {
    check_note_size(height, width);
    return Array.from({ length: height }, () => Array<string>(width).fill(''));
}

export function rectangular_rows(rows: NoteRows): NoteRows {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 1);
    check_note_size(Math.max(1, rows.length), width);
    return rows.length ? rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]) : [['']];
}

/** Legacy notes are literal lines, never CSV. Reading alone does not rewrite storage. */
export function decode_note(raw: string | null): NoteRows {
    if (!raw) return blank_note();
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        /* Legacy plain text. */
    }
    if (value && typeof value === 'object' && 'format' in value && value.format === FORMAT) {
        const document = value as { version?: unknown; rows?: unknown };
        if (
            document.version !== 1 ||
            !Array.isArray(document.rows) ||
            !document.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
        ) {
            throw new Error('notes.invalid-data');
        }
        return rectangular_rows(document.rows);
    }
    return rectangular_rows(
        raw
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map((line) => [line]),
    );
}

export function encode_note(rows: NoteRows): string {
    return JSON.stringify({ format: FORMAT, version: 1, rows });
}

export function selected_range(anchor: CellPosition, active: CellPosition): CellRange {
    return {
        top: Math.min(anchor.row, active.row),
        bottom: Math.max(anchor.row, active.row),
        left: Math.min(anchor.col, active.col),
        right: Math.max(anchor.col, active.col),
    };
}

export function column_label(index: number): string {
    let label = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    }
    return label;
}

export function range_rows(rows: NoteRows, range: CellRange): NoteRows {
    return rows.slice(range.top, range.bottom + 1).map((row) => row.slice(range.left, range.right + 1));
}

export function put_cells(rows: NoteRows, start: CellPosition, values: NoteRows): NoteRows {
    const block = rectangular_rows(values);
    const height = Math.max(rows.length, start.row + block.length);
    const width = Math.max(rows[0].length, start.col + block[0].length);
    check_note_size(height, width);
    return Array.from({ length: height }, (_, r) => {
        const row = [...(rows[r] ?? []), ...Array<string>(width - (rows[r]?.length ?? 0)).fill('')];
        if (r >= start.row && r < start.row + block.length) {
            row.splice(start.col, block[0].length, ...block[r - start.row]);
        }
        return row;
    });
}

export function clear_cells(rows: NoteRows, range: CellRange): NoteRows {
    return rows.map((row, r) =>
        row.map((value, c) =>
            r >= range.top && r <= range.bottom && c >= range.left && c <= range.right ? '' : value,
        ),
    );
}

export function insert_note_axis(rows: NoteRows, axis: 'row' | 'col', after: number): NoteRows {
    check_note_size(rows.length + (axis === 'row' ? 1 : 0), rows[0].length + (axis === 'col' ? 1 : 0));
    if (axis === 'row') {
        const result = rows.slice();
        result.splice(after + 1, 0, Array<string>(rows[0].length).fill(''));
        return result;
    }
    return rows.map((row) => [...row.slice(0, after + 1), '', ...row.slice(after + 1)]);
}

export function delete_note_axis(rows: NoteRows, axis: 'row' | 'col', range: CellRange): NoteRows {
    if (axis === 'row') {
        const result = rows.filter((_, index) => index < range.top || index > range.bottom);
        return result.length ? result : blank_note(1, rows[0].length);
    }
    return rows.map((row) => {
        const result = row.filter((_, index) => index < range.left || index > range.right);
        return result.length ? result : [''];
    });
}

/** Omit only unused trailing space in exported sheets, not interior blank cells or rows. */
export function note_export_rows(rows: NoteRows): NoteRows {
    let bottom = -1,
        right = -1;
    rows.forEach((row, r) =>
        row.forEach((cell, c) => {
            if (cell !== '') {
                bottom = Math.max(bottom, r);
                right = Math.max(right, c);
            }
        }),
    );
    return rows.slice(0, bottom + 1).map((row) => row.slice(0, right + 1));
}

function equal_rows(left: NoteRows, right: NoteRows): boolean {
    return (
        left.length === right.length &&
        left.every((row, r) => row.length === right[r].length && row.every((value, c) => value === right[r][c]))
    );
}

/** One notation's saved table and in-memory transaction history. */
export class NoteSession {
    rows: NoteRows;
    save_failed = false;
    valid = true;
    private past: NoteRows[] = [];
    private future: NoteRows[] = [];
    private edit_start: NoteRows | null = null;

    constructor(
        readonly id: string,
        public saved_raw: string | null,
        private storage: () => AppStorageLike | null,
    ) {
        this.rows = decode_note(saved_raw);
    }

    get can_undo(): boolean {
        return this.past.length > 0 || (this.edit_start !== null && !equal_rows(this.edit_start, this.rows));
    }
    get can_redo(): boolean {
        return this.future.length > 0;
    }

    private remember(rows: NoteRows): void {
        this.past.push(rows);
        if (this.past.length > MAX_HISTORY) this.past.shift();
        this.future = [];
    }

    save(): void {
        if (!this.valid) return;
        try {
            const storage = this.storage();
            if (!storage) throw new Error('Storage unavailable');
            const raw = encode_note(this.rows);
            storage.setItem(note_storage_key(this.id), raw);
            this.saved_raw = raw;
            this.save_failed = false;
        } catch {
            this.save_failed = true;
        }
    }

    begin_edit(): void {
        this.edit_start ??= this.rows;
    }

    edit_cell(cell: CellPosition, value: string): void {
        if (!this.valid || this.rows[cell.row][cell.col] === value) return;
        this.begin_edit();
        this.rows = put_cells(this.rows, cell, [[value]]);
        this.save();
    }

    finish_edit(cancel = false): void {
        const before = this.edit_start;
        this.edit_start = null;
        if (!this.valid || !before || equal_rows(before, this.rows)) return;
        if (cancel) {
            this.rows = before;
            this.save();
        } else this.remember(before);
    }

    change(rows: NoteRows): void {
        if (!this.valid) return;
        this.finish_edit();
        if (equal_rows(this.rows, rows)) return;
        this.remember(this.rows);
        this.rows = rows;
        this.save();
    }

    undo(): void {
        if (!this.valid) return;
        this.finish_edit();
        const before = this.past.pop();
        if (!before) return;
        this.future.push(this.rows);
        this.rows = before;
        this.save();
    }

    redo(): void {
        if (!this.valid) return;
        this.finish_edit();
        const after = this.future.pop();
        if (!after) return;
        this.past.push(this.rows);
        this.rows = after;
        this.save();
    }

    discard(): void {
        this.valid = false;
        this.edit_start = null;
        this.past = [];
        this.future = [];
    }
}

export class NoteTableStore {
    private sessions = new Map<string, NoteSession>();
    constructor(private storage: () => AppStorageLike | null) {}

    open(id: string): NoteSession {
        let session = this.sessions.get(id);
        let raw: string | null;
        try {
            raw = this.storage()?.getItem(note_storage_key(id)) ?? null;
        } catch {
            if (session) return session;
            throw new Error('notes.load-error');
        }
        // Deletion or an external replacement invalidates old undo history too.
        if (session && raw !== session.saved_raw) {
            session.discard();
            this.sessions.delete(id);
            session = undefined;
        }
        if (!session) {
            session = new NoteSession(id, raw, this.storage);
            this.sessions.set(id, session);
        }
        return session;
    }

    forget(id: string): void {
        this.sessions.get(id)?.discard();
        this.sessions.delete(id);
    }
}
