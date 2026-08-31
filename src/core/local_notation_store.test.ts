import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LOCAL_NOTATION_STORE_KEY,
    LOCAL_NOTATION_STORE_VERSION,
    LocalNotationFileStore,
    LocalNotationStorageError,
    type StorageLike,
} from '@/core/local_notation_store';

class MemoryStorage implements StorageLike {
    readonly data = new Map<string, string>();
    writeError: Error | null = null;

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (this.writeError) throw this.writeError;
        this.data.set(key, value);
    }
}

describe('LocalNotationFileStore', () => {
    it('persists files and drafts in stable creation order', () => {
        const storage = new MemoryStorage();
        let now = 100;
        let next_id = 0;
        const options = {
            storage,
            now: () => now++,
            createId: () => `file-${++next_id}`,
        };
        const store = new LocalNotationFileStore(options);
        const first = store.createFile({ name: 'First.js', source: 'one' });
        const second = store.createFile({ name: 'Second.js', source: 'two' });
        store.setDraft(first.id, { name: 'First.js', source: 'draft' });
        const updated = store.updateFile(first.id, { source: 'changed' });

        expect(updated.sourceRevision).toBe(first.sourceRevision + 1);
        expect(store.listFiles().map((file) => file.id)).toEqual([first.id, second.id]);
        expect(store.getDraft(first.id)?.source).toBe('draft');
        expect(new LocalNotationFileStore(options).snapshot().version).toBe(LOCAL_NOTATION_STORE_VERSION);
    });

    it('enforces JavaScript names and case-insensitive uniqueness', () => {
        const store = new LocalNotationFileStore({ storage: new MemoryStorage(), createId: () => 'one' });
        store.createFile({ name: 'Example.js' });

        expect(() => store.createFile({ id: 'two', name: 'example.JS' })).toThrowError(
            expect.objectContaining({ code: 'DUPLICATE_FILE_NAME' }),
        );
        expect(() => store.createFile({ id: 'three', name: 'Example.txt' })).toThrowError(
            expect.objectContaining({ code: 'INVALID_FILE_NAME' }),
        );
    });

    it('removes a file draft together with the file', () => {
        const store = new LocalNotationFileStore({ storage: new MemoryStorage(), createId: () => 'one' });
        const file = store.createFile({ name: 'Example.js' });
        store.setDraft(file.id, 'draft');
        store.deleteFile(file.id);

        expect(store.getFile(file.id)).toBeUndefined();
        expect(store.getDraft(file.id)).toBeUndefined();
    });

    it('reports corrupt, unsupported, and quota failures with stable codes', () => {
        const storage = new MemoryStorage();
        storage.data.set(DEFAULT_LOCAL_NOTATION_STORE_KEY, '{broken');
        const store = new LocalNotationFileStore({ storage });
        expect(() => store.listFiles()).toThrowError(expect.objectContaining({ code: 'STORAGE_CORRUPT' }));

        storage.data.set(
            DEFAULT_LOCAL_NOTATION_STORE_KEY,
            JSON.stringify({ version: LOCAL_NOTATION_STORE_VERSION + 1, nextOrder: 1, files: [], drafts: {} }),
        );
        expect(() => store.listFiles()).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }));

        const quota = new Error('full');
        quota.name = 'QuotaExceededError';
        storage.writeError = quota;
        const clean = new LocalNotationFileStore({ storage: new MemoryStorage(), createId: () => 'clean' });
        const file = clean.createFile({ name: 'Clean.js' });
        (clean as any).storage.writeError = quota;
        expect(() => clean.setDraft(file.id, 'draft')).toThrowError(
            expect.objectContaining({ code: 'QUOTA_EXCEEDED' }),
        );
        expect(quota).toBeInstanceOf(Error);
        expect(LocalNotationStorageError).toBeDefined();
    });
});
