import { afterEach, describe, expect, it } from 'vitest';
import { get_notation } from '@/core/registry';
import { reload_all } from '@/core/user_defined_notation';
import { LocalNotationFileStore, type StorageLike } from '@/core/local_notation_store';
import { LocalNotationRuntime, LocalNotationRuntimeError } from '@/core/local_notation_runtime';

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

const source_for = (id: string, label = id) => `
register_notation({
    id: ${JSON.stringify(id)},
    name: ${JSON.stringify(label)},
    display: { plain: (value) => String(value), from_display: (value) => Number(value) },
    is_limit: (value) => value === Infinity,
    compare: (left, right) => left - right,
    FS: (value) => value,
    init: () => [Infinity, 0],
});
`;

afterEach(() => {
    reload_all([]);
});

describe('LocalNotationRuntime', () => {
    it('migrates legacy scripts to native .js files without executing them', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'legacy' });
        const result = runtime.migrateLegacyScripts([
            { file_name: 'legacy', code: source_for('runtime-legacy'), enabled: true },
        ]);

        expect(result.migrated).toHaveLength(1);
        expect(result.migrated[0].name).toBe('legacy.js');
        expect(result.migrated[0].trusted).toBe(true);
        expect(result.migrated[0].enabled).toBe(true);
        expect(get_notation('runtime-legacy')).toBeUndefined();
    });

    it('reorders files while preserving stable file ids', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({
            storage,
            createId: (() => {
                let n = 0;
                return () => `order-${++n}`;
            })(),
        });
        const first = runtime.createUpload('First.js', '', false).file;
        const second = runtime.createUpload('Second.js', '', false).file;
        runtime.reorderFiles([second.id, first.id]);

        expect(runtime.listFiles().map((file) => file.id)).toEqual([second.id, first.id]);
    });

    it('keeps uploads untrusted and only registers them after trust plus enable', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'upload' });
        const created = runtime.createUpload('Upload.js', source_for('runtime-upload'), false);

        expect(created.file.trusted).toBe(false);
        expect(get_notation('runtime-upload')).toBeUndefined();
        runtime.trustFile(created.file.id);
        runtime.enable(created.file.id);
        expect(get_notation('runtime-upload')).toBeDefined();
        expect(runtime.getNotationIds(created.file.id)).toEqual(['runtime-upload']);
    });

    it('retains the active source when an enabled replacement is invalid', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'replace' });
        const created = runtime.createUpload('Replace.js', source_for('runtime-old'), true);
        runtime.enable(created.file.id);

        expect(() => runtime.saveFile(created.file.id, 'Replace.js', 'throw new Error("bad replacement");')).toThrow(
            LocalNotationRuntimeError,
        );
        expect(runtime.getFile(created.file.id)?.lastError?.code).toBe('SOURCE_INVALID');
        expect(runtime.getFile(created.file.id)?.source).toBe(source_for('runtime-old'));
        expect(get_notation('runtime-old')).toBeDefined();
        expect(get_notation('runtime-new')).toBeUndefined();
    });

    it('rolls back registry changes when enabling cannot persist metadata', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'metadata' });
        const created = runtime.createUpload('Metadata.js', source_for('runtime-metadata'), false);
        runtime.trustFile(created.file.id);
        storage.writeError = new Error('planned write failure');

        try {
            runtime.enable(created.file.id);
            throw new Error('expected enable to fail');
        } catch (error) {
            expect(error).toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
        }
        expect(get_notation('runtime-metadata')).toBeUndefined();
        expect(runtime.getFile(created.file.id)?.enabled).toBe(false);
    });

    it('boot isolates a bad enabled file and still loads valid files', () => {
        const storage = new MemoryStorage();
        const store = new LocalNotationFileStore({
            storage,
            createId: (() => {
                let n = 0;
                return () => `boot-${++n}`;
            })(),
        });
        store.createFile({ name: 'Bad.js', source: 'throw new Error("bad boot");', trusted: true, enabled: true });
        store.createFile({ name: 'Good.js', source: source_for('runtime-good'), trusted: true, enabled: true });
        const runtime = new LocalNotationRuntime({ storage });

        const result = runtime.boot();

        expect(result.warnings.size).toBe(0);
        expect(get_notation('runtime-good')).toBeDefined();
        expect(runtime.findByName('Bad.js')?.enabled).toBe(false);
        expect(runtime.findByName('Bad.js')?.lastError?.code).toBe('SOURCE_INVALID');
    });

    it('disabling and deleting removes the live notation while retaining file metadata until deletion', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'delete' });
        const created = runtime.createUpload('Delete.js', source_for('runtime-delete'), true);
        runtime.enable(created.file.id);
        runtime.disable(created.file.id);
        expect(get_notation('runtime-delete')).toBeUndefined();
        expect(runtime.getFile(created.file.id)?.source).toContain('runtime-delete');
        runtime.deleteFile(created.file.id);
        expect(runtime.getFile(created.file.id)).toBeUndefined();
    });

    it('records and clears an error without changing source or enabled state', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'error' });
        const created = runtime.createUpload('Error.js', source_for('runtime-error'), true);
        runtime.enable(created.file.id);
        const before = runtime.getFile(created.file.id)!;

        runtime.recordError(created.file.id, Object.assign(new Error('line failure'), { code: 'TEST_ERROR' }));
        expect(runtime.getFile(created.file.id)).toMatchObject({
            source: before.source,
            enabled: true,
            lastError: { code: 'SOURCE_INVALID', message: 'line failure' },
        });

        runtime.clearError(created.file.id);
        expect(runtime.getFile(created.file.id)?.lastError).toBeNull();
    });
});
