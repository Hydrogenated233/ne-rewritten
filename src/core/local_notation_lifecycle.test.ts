import { describe, expect, it } from 'vitest';
import { apply_local_notation_lifecycle, type LocalNotationLifecycleSnapshot } from '@/core/local_notation_lifecycle';
import type { LocalNotationFile } from '@/core/local_notation_store';
import { analysis_storage_key, note_storage_key } from '@/core/storage_keys';
import { DEFAULT_SETTINGS, type Settings } from '@/core/settings';

class MemoryStorage {
    readonly data = new Map<string, string>();
    getItem(key: string): string | null { return this.data.get(key) ?? null; }
    setItem(key: string, value: string): void { this.data.set(key, value); }
    removeItem(key: string): void { this.data.delete(key); }
}

function file(overrides: Partial<LocalNotationFile> = {}): LocalNotationFile {
    return {
        id: 'local-file',
        name: 'Local.js',
        source: 'source',
        enabled: true,
        trusted: true,
        template: false,
        order: 1,
        createdAt: 1,
        updatedAt: 1,
        sourceRevision: 2,
        loadedRevision: 2,
        manifest: { notations: ['local-old'], categories: [] },
        knownNotationIds: ['local-old'],
        knownCategoryIds: [],
        lastError: null,
        ...overrides,
    };
}

function settings(current = 'local-old'): Settings {
    return {
        ...structuredClone(DEFAULT_SETTINGS),
        current_notation_id: current,
        equiv_active: { 'local-old': 'pretty', unaffected: 'same' },
        equiv_hide_original: { 'local-old': true, unaffected: false },
        shown_equiv: { 'local-old': { pretty: true }, unaffected: { same: true } },
        expand: { ...DEFAULT_SETTINGS.expand, notation_id: current },
    };
}

function snapshot(overrides: Partial<LocalNotationLifecycleSnapshot> = {}): LocalNotationLifecycleSnapshot {
    return {
        notationOrder: ['before', 'local-old', 'after', 'unaffected'],
        currentNotationId: 'local-old',
        oldNotationIds: ['local-old'],
        knownNotationIds: ['local-old'],
        ...overrides,
    };
}

describe('local notation lifecycle', () => {
    it('rebuilds a successfully replaced file while preserving its notes and unaffected trees', () => {
        const storage = new MemoryStorage();
        storage.setItem(analysis_storage_key('local-old'), 'old analysis');
        storage.setItem(note_storage_key('local-old'), 'keep this note');
        const trees = new Map<string, unknown>([['local-old', {}], ['unaffected', {}]]);
        const appSettings = settings();

        apply_local_notation_lifecycle({
            action: 'save',
            result: { file: file(), previous: file({ sourceRevision: 1, loadedRevision: 1 }), enabled: true, sourceChanged: true },
            snapshot: snapshot(),
            availableNotationIds: ['before', 'local-old', 'after', 'unaffected'],
            trees,
            settings: appSettings,
            storage,
        });

        expect(trees.has('local-old')).toBe(false);
        expect(trees.has('unaffected')).toBe(true);
        expect(storage.getItem(analysis_storage_key('local-old'))).toBeNull();
        expect(storage.getItem(note_storage_key('local-old'))).toBe('keep this note');
        expect(appSettings.current_notation_id).toBe('local-old');
        expect(appSettings.equiv_active['local-old']).toBe('pretty');
    });

    it('selects the next surviving notation and clears removed-ID display state', () => {
        const storage = new MemoryStorage();
        storage.setItem(analysis_storage_key('local-old'), 'old analysis');
        storage.setItem(note_storage_key('local-old'), 'retained note');
        const trees = new Map<string, unknown>([['local-old', {}]]);
        const appSettings = settings();
        const replacement = file({
            manifest: { notations: ['local-new'], categories: [] },
            knownNotationIds: ['local-old', 'local-new'],
        });

        apply_local_notation_lifecycle({
            action: 'save',
            result: { file: replacement, previous: file(), enabled: true, sourceChanged: true },
            snapshot: snapshot(),
            availableNotationIds: ['before', 'after', 'unaffected', 'local-new'],
            trees,
            settings: appSettings,
            storage,
        });

        expect(appSettings.current_notation_id).toBe('after');
        expect(appSettings.expand.notation_id).toBe('before');
        expect(appSettings.equiv_active['local-old']).toBeUndefined();
        expect(appSettings.equiv_hide_original['local-old']).toBeUndefined();
        expect(appSettings.shown_equiv['local-old']).toBeUndefined();
        expect(storage.getItem(note_storage_key('local-old'))).toBe('retained note');
    });

    it('drops live trees on disable without deleting retained analysis or notes', () => {
        const storage = new MemoryStorage();
        storage.setItem(analysis_storage_key('local-old'), 'retained analysis');
        storage.setItem(note_storage_key('local-old'), 'retained note');
        const trees = new Map<string, unknown>([['local-old', {}]]);
        const appSettings = settings();

        apply_local_notation_lifecycle({
            action: 'disable',
            result: { file: file({ enabled: false }), previous: file(), enabled: false },
            snapshot: snapshot(),
            availableNotationIds: ['before', 'after'],
            trees,
            settings: appSettings,
            storage,
        });

        expect(trees.has('local-old')).toBe(false);
        expect(storage.getItem(analysis_storage_key('local-old'))).toBe('retained analysis');
        expect(storage.getItem(note_storage_key('local-old'))).toBe('retained note');
        expect(appSettings.current_notation_id).toBe('after');
    });

    it('keeps analysis and trees when saving a disabled file source', () => {
        const storage = new MemoryStorage();
        storage.setItem(analysis_storage_key('local-old'), 'retained analysis');
        storage.setItem(note_storage_key('local-old'), 'retained note');
        const trees = new Map<string, unknown>([['local-old', {}]]);
        const appSettings = settings('before');
        const disabled = file({ enabled: false, sourceRevision: 3, loadedRevision: 2 });

        apply_local_notation_lifecycle({
            action: 'save',
            result: { file: disabled, previous: file({ enabled: false }), enabled: false, sourceChanged: true },
            snapshot: snapshot({ currentNotationId: 'before' }),
            availableNotationIds: ['before', 'after'],
            trees,
            settings: appSettings,
            storage,
        });

        expect(trees.has('local-old')).toBe(true);
        expect(storage.getItem(analysis_storage_key('local-old'))).toBe('retained analysis');
        expect(storage.getItem(note_storage_key('local-old'))).toBe('retained note');
    });

    it('permanently removes retained analysis and notes on delete', () => {
        const storage = new MemoryStorage();
        storage.setItem(analysis_storage_key('local-old'), 'analysis');
        storage.setItem(note_storage_key('local-old'), 'note');
        const appSettings = settings();

        apply_local_notation_lifecycle({
            action: 'delete',
            result: { file: file(), previous: file(), deleted: true },
            snapshot: snapshot(),
            availableNotationIds: ['before', 'after'],
            trees: new Map([['local-old', {}]]),
            settings: appSettings,
            storage,
        });

        expect(storage.getItem(analysis_storage_key('local-old'))).toBeNull();
        expect(storage.getItem(note_storage_key('local-old'))).toBeNull();
        expect(appSettings.equiv_active['local-old']).toBeUndefined();
    });

    it('selects the first contributed notation after a successful upload', () => {
        const appSettings = settings('before');
        apply_local_notation_lifecycle({
            action: 'upload',
            result: { file: file({ manifest: { notations: ['uploaded-a', 'uploaded-b'], categories: [] } }), enabled: true },
            snapshot: snapshot({ currentNotationId: 'before' }),
            availableNotationIds: ['before', 'uploaded-a', 'uploaded-b'],
            trees: new Map(),
            settings: appSettings,
            storage: new MemoryStorage(),
        });
        expect(appSettings.current_notation_id).toBe('uploaded-a');
    });
});
