# Note Table Editor

Status: both recommendation rounds accepted; implemented and verified.

## Accepted Scope

- Replace the notation note textarea with a basic two-dimensional cell editor.
- Commas are ordinary cell content; `1,2,4,8` stays in one cell.
- Support adding and deleting rows and columns, editing cells, Tab navigation,
  and rectangular copy/paste with Excel.
- No formulas, sorting or cell formatting.
- Migrate legacy notes line by line into the first column without interpreting
  commas or quotes. See ADR 0004.
- Export cell values directly into the existing XLSX note sheet. Do not add
  independent CSV file import/export.
- Retain a separate automatically saved note for each notation. Closing the
  window retains its data; changing notation changes the displayed note.
- Keep notes distinct from expression analyses and retain existing local-file
  lifecycle behavior.

## Accepted Editing Behavior

- Single click selects; double click edits. Tab moves to the next cell, Enter
  moves to the next row, and Alt+Enter adds a newline while editing.
- Values are always text, never formulas or automatic numbers.
- Grid paste overwrites from the selected top-left cell and grows the table as
  necessary. Plain multiline text goes into one column; commas remain literal.
- Paste into a cell being edited stays in that cell.
- Delete clears the selected rectangle. Toolbar commands remove rows/columns.
- Undo/redo is isolated by notation and survives closing the panel or switching
  notation, but not a page reload. No repeated deletion confirmation dialogs.

## Implementation Boundaries

- Keep existing note storage keys and standalone storage isolation. Store versioned
  `nerw-note-table` documents with string-cell arrays; read old plain text literally.
  Reading legacy notes alone does not overwrite them; the next edit writes the new format.
- New empty notes show 8 rows and 4 columns. Tables grow on paste or advancing past
  the last row. Keep at least one row and column after deletion.
- Bound tables to 20,000 cells and undo history to the last 100 transactions.
  Oversized edits/pastes are rejected before changing cells.
- Save on each input, grouping a completed cell edit into one undo transaction.
  Storage failures keep edits in memory and show a retry action; XLSX export reads
  the live table rather than silently exporting stale persisted text.
- Spreadsheet clipboard data uses text-only HTML cells or tab-delimited text.
  Papa Parse handles quoted TSV fields; pasted HTML is never inserted into the UI.
  Plain multiline text without tabs remains literal, one line per row.
- Permanent notation deletion discards its in-memory history. Disabled/re-enabled
  files retain notes. External saved-note replacement invalidates stale history.
- XLSX exports use cell arrays, omit only unused trailing space, and preserve
  interior empty cells and rows. Independent CSV and note-sheet import remain out of scope.

## Verification

- Full suite: 50 files / 326 tests; type checking passes.
- Standard, compatibility and standalone builds pass, with the existing build warnings.
- Regression coverage includes legacy migration, quoted TSV, atomic paste and
  limits, session isolation, save retry, deletion/history invalidation, XLSX readback
  and selected-note preservation in standalone export.
- Live browser checks cover double-click editing, Tab/Enter, Alt+Enter, both paste
  modes, rectangular copy/paste, growing past the last row/column, row deletion,
  Delete clearing, undo/redo, close/reopen, notation switching and page reload.
- Desktop and 390x844 layouts were inspected. A fresh final tab had no warnings
  or errors; live editing/HMR during development required a reload.
- Clipboard compatibility was exercised using tabular text and HTML, not by
  automating a running Microsoft Excel instance.
- Existing npm audit findings concern the pre-existing Vitest development dependency;
  the unrelated test-runner upgrade is not included in this change.
