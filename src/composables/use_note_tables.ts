import { app_storage } from '@/core/storage.ts';
import { NoteTableStore } from '@/core/note_table.ts';

// Shared with lifecycle deletion so a deleted ID cannot recover old cells via Undo.
export const note_tables = new NoteTableStore(app_storage);
