import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotationDefinition } from '@/notation-definition.ts';
import {
    count_notation_items, create_init_variant, get_category, get_category_children,
    get_generator_state, get_notation, get_root_items, get_variant_state_snapshot,
    list_init_variant_ids, register_category, register_notation, remove_init_variant,
    set_generator_state, set_variant_state, unregister_category, unregister_notation,
} from '@/core/registry.ts';
import { LocalNotationRuntime } from '@/core/local_notation_runtime.ts';
import { reload_all } from '@/core/user_defined_notation.ts';
import { apply_local_notation_lifecycle } from '@/core/local_notation_lifecycle.ts';
import { DEFAULT_SETTINGS } from '@/core/settings.ts';
import { analysis_storage_key, note_storage_key } from '@/core/storage_keys.ts';

const base: NotationDefinition<number> = {
    id: 'variant-test-base', name: 'Variant test base',
    display: { plain: String, from_display: (value) => {
        const number = Number(value);
        if (Number.isNaN(number)) throw new Error('Invalid number');
        return number;
    } },
    is_limit: () => false, compare: (a, b) => a - b, FS: (a) => a, init: () => [10, 0],
};

const source = (compare = '(a, b) => a - b') => `
register_notation({
    id: 'variant-test-local', name: 'Local', display: { plain: String, from_display: Number },
    is_limit: () => false, compare: ${compare}, FS: (a) => a, init: () => [10, 0]
});`;

class MemoryStorage {
    data = new Map<string, string>();
    fail = false;
    getItem(key: string) { return this.data.get(key) ?? null; }
    setItem(key: string, value: string) {
        if (this.fail) throw new Error('Storage write failed');
        this.data.set(key, value);
    }
    removeItem(key: string) { this.data.delete(key); }
}

beforeEach(() => {
    set_variant_state({});
    set_generator_state({});
});
afterEach(() => {
    reload_all([]);
    set_variant_state({});
    unregister_notation(base.id);
    unregister_notation('variant-test-base$1');
    unregister_category('variant-test-cat');
    unregister_category('variant-test-gen');
    vi.restoreAllMocks();
});

describe('initial variant registration', () => {
    it('keeps independent definitions and counts the complete family as one', () => {
        register_notation(base);
        const first = create_init_variant(base.id, ['8', '3']);
        const second = create_init_variant(base.id, ['6', '2']);
        expect(first).toEqual({ ok: true, id: `${base.id}$1` });
        expect(get_notation(first.id!)?.init()).toEqual([8, 3]);
        expect(base.init()).toEqual([10, 0]);
        expect(count_notation_items([base.id, first.id!, second.id!])).toBe(1);
        expect(count_notation_items([first.id!, second.id!])).toBe(1);
        expect(create_init_variant(first.id!, ['1']).error).toBe('variant-base');
    });

    it('rejects empty, invalid, equal, ascending and throwing comparison lists', () => {
        register_notation(base);
        for (const init of [[], ['bad'], ['2', '2'], ['1', '2']]) {
            expect(create_init_variant(base.id, init)).toEqual({ ok: false, error: 'parse' });
        }
        unregister_notation(base.id);
        register_notation({ ...base, compare: () => { throw new Error('comparison failed'); } });
        expect(create_init_variant(base.id, ['2', '1'])).toEqual({ ok: false, error: 'parse' });
        expect(get_variant_state_snapshot()).toEqual({});
    });

    it('restores dormant variants, reserves their ids, and returns all removed ids', () => {
        register_notation(base);
        const id = create_init_variant(base.id, ['5', '0']).id!;
        expect(unregister_notation(base.id)).toEqual([base.id, id]);
        expect(get_notation(id)).toBeUndefined();
        expect(() => register_notation({ ...base, id })).toThrow(/reserved/);
        register_notation(base);
        expect(get_notation(id)?.init()).toEqual([5, 0]);
    });

    it('backfills a removed sequence in order without retaining its previous definition', () => {
        register_notation(base);
        const first = create_init_variant(base.id, ['8']).id!;
        const second = create_init_variant(base.id, ['7']).id!;
        remove_init_variant(first);
        expect(create_init_variant(base.id, ['6']).id).toBe(first);
        expect(get_root_items().filter((item) => item.id.startsWith(base.id)).map((item) => item.id))
            .toEqual([base.id, first, second]);
        expect(get_notation(first)?.init()).toEqual([6]);
    });

    it('hydrates valid boot definitions once and skips corrupt persisted entries', () => {
        set_variant_state({ [base.id]: [
            { seq: 1, init: ['5'] }, { seq: 1, init: ['4'] }, { seq: 1.5, init: ['3'] },
            { seq: 2, init: [] },
        ] });
        register_notation(base);
        expect(list_init_variant_ids(base.id)).toEqual([`${base.id}$1`]);
        expect(get_notation(`${base.id}$1`)?.init()).toEqual([5]);
        set_variant_state({ [base.id]: [{ seq: 1, init: ['2'] }] });
        expect(get_notation(`${base.id}$1`)?.init()).toEqual([2]);
    });

    it('unregisters every sibling including variants when removing a category', () => {
        register_category({ id: 'variant-test-cat', name: 'Category' });
        register_notation({ ...base, category_id: 'variant-test-cat' });
        create_init_variant(base.id, ['8']);
        create_init_variant(base.id, ['7']);
        unregister_category('variant-test-cat');
        expect(get_notation(base.id)).toBeUndefined();
        expect(get_notation(`${base.id}$1`)).toBeUndefined();
        expect(get_notation(`${base.id}$2`)).toBeUndefined();
    });

    it('automatically hydrates generator progress exactly once and rolls back partial registration', () => {
        const create = vi.fn((n: number) => ({ ...base, id: `variant-test-gen-${n}`, category_id: 'variant-test-gen' }));
        set_generator_state({ 'variant-test-gen': 3 });
        register_category({ id: 'variant-test-gen', name: 'Generator', generator: { start: 1, initial: 1, create } });
        expect(create).toHaveBeenCalledTimes(3);
        expect(get_category_children('variant-test-gen')).toHaveLength(3);
        expect(create_init_variant('variant-test-gen-1', ['3']).error).toBe('generator-base');
        unregister_category('variant-test-gen');
        expect(() => register_category({
            id: 'variant-test-gen', name: 'Generator',
            generator: { start: 1, initial: 1, create: (n) => {
                if (n === 2) throw new Error('planned generator failure');
                return create(n);
            } },
        })).toThrow('planned generator failure');
        expect(get_category('variant-test-gen')).toBeUndefined();
        expect(get_notation('variant-test-gen-1')).toBeUndefined();
        expect(get_generator_state()['variant-test-gen']).toBe(3);
    });
});

describe('local variant lifecycle', () => {
    it.each([true, false])('preserves reassigned variants when deleting their former file (new owner enabled=%s)', (enabled) => {
        let sequence = 0;
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => `file-${++sequence}` });
        const old = runtime.createUpload('Old.js', source(), true).file;
        runtime.saveFile(old.id, old.name, source().replace('variant-test-local', 'variant-test-renamed'));
        const owner = runtime.createUpload('Owner.js', source(), true).file;
        const id = create_init_variant('variant-test-local', ['5']).id!;
        if (!enabled) runtime.disable(owner.id);
        const settings = structuredClone(DEFAULT_SETTINGS);
        const trees = new Map<string, unknown>([[id, {}]]);
        storage.setItem(analysis_storage_key(id), 'keep');
        storage.setItem(note_storage_key(id), 'keep');
        const snapshot = {
            notationOrder: ['variant-test-local', id], currentNotationId: id,
            oldNotationIds: runtime.getNotationIds(old.id), knownNotationIds: ['variant-test-local', id],
        };
        const deleted = runtime.deleteFile(old.id);
        apply_local_notation_lifecycle({
            action: 'delete', result: deleted, snapshot, trees, settings, storage,
            availableNotationIds: enabled ? ['variant-test-local', id] : [],
        });
        expect(list_init_variant_ids('variant-test-local')).toEqual([id]);
        expect(storage.getItem(analysis_storage_key(id))).toBe('keep');
        expect(storage.getItem(note_storage_key(id))).toBe('keep');
        expect(trees.has(id)).toBe(true);
    });

    it('retains disabled variants, revalidates changed bases, and restores them after a fix', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const runtime = new LocalNotationRuntime({ storage: new MemoryStorage(), createId: () => 'file' });
        const file = runtime.createUpload('Variant.js', source(), true).file;
        const id = create_init_variant('variant-test-local', ['5', '1']).id!;
        runtime.disable(file.id);
        expect(get_notation(id)).toBeUndefined();
        expect(list_init_variant_ids('variant-test-local')).toEqual([id]);
        runtime.enable(file.id);
        expect(get_notation(id)?.init()).toEqual([5, 1]);
        runtime.saveFile(file.id, file.name, source('(a, b) => b - a'));
        expect(get_notation(id)).toBeUndefined();
        expect(runtime.getNotationIds(file.id)).toContain(id);
        runtime.saveFile(file.id, file.name, source());
        expect(get_notation(id)?.init()).toEqual([5, 1]);
    });

    it('restores variants and base source when persistence fails', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'file' });
        const file = runtime.createUpload('Variant.js', source(), true).file;
        const id = create_init_variant('variant-test-local', ['5', '1']).id!;
        storage.fail = true;
        expect(() => runtime.saveFile(file.id, file.name, source('(a, b) => b - a'))).toThrow();
        expect(get_notation(id)?.init()).toEqual([5, 1]);
        expect(runtime.getFile(file.id)?.source).toBe(source());
        expect(() => runtime.deleteFile(file.id)).toThrow();
        expect(get_notation(id)?.init()).toEqual([5, 1]);
        expect(list_init_variant_ids('variant-test-local')).toEqual([id]);
    });

    it('cleans dormant definitions and all associated state on permanent file deletion only', () => {
        const storage = new MemoryStorage();
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'file' });
        const file = runtime.createUpload('Variant.js', source(), true).file;
        const id = create_init_variant('variant-test-local', ['5']).id!;
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.current_notation_id = id;
        settings.hidden_notations = [id];
        settings.equiv_active[id] = 'custom';
        const trees = new Map<string, unknown>([[id, {}]]);
        storage.setItem(analysis_storage_key(id), 'analysis');
        storage.setItem(note_storage_key(id), 'notes');
        const snapshot = {
            notationOrder: ['variant-test-local', id], currentNotationId: id,
            oldNotationIds: runtime.getNotationIds(file.id), knownNotationIds: runtime.getNotationIds(file.id),
        };
        const disabled = runtime.disable(file.id);
        apply_local_notation_lifecycle({ action: 'disable', result: disabled, snapshot, availableNotationIds: [], trees, settings, storage });
        expect(trees.has(id)).toBe(false);
        expect(storage.getItem(analysis_storage_key(id))).toBe('analysis');
        expect(storage.getItem(note_storage_key(id))).toBe('notes');
        const deleted = runtime.deleteFile(file.id);
        apply_local_notation_lifecycle({ action: 'delete', result: deleted, snapshot, availableNotationIds: [], trees, settings, storage });
        expect(list_init_variant_ids('variant-test-local')).toEqual([]);
        expect(storage.getItem(analysis_storage_key(id))).toBeNull();
        expect(storage.getItem(note_storage_key(id))).toBeNull();
        expect(settings.equiv_active[id]).toBeUndefined();
        expect(settings.hidden_notations).toEqual([]);
    });

    it('resets affected variant trees and analysis but preserves unrelated trees on source replacement', () => {
        const storage = new MemoryStorage();
        register_notation(base);
        const id = create_init_variant(base.id, ['5']).id!;
        const runtime = new LocalNotationRuntime({ storage, createId: () => 'file' });
        const file = runtime.createUpload('Variant.js', source(), true).file;
        const local_id = create_init_variant('variant-test-local', ['4']).id!;
        const snapshot = { notationOrder: [base.id, id, 'variant-test-local', local_id],
            currentNotationId: local_id, oldNotationIds: runtime.getNotationIds(file.id), knownNotationIds: [] };
        const trees = new Map<string, unknown>([[id, {}], [local_id, {}]]);
        storage.setItem(analysis_storage_key(local_id), 'analysis');
        const changed = runtime.saveFile(file.id, file.name, source() + '\n// changed');
        apply_local_notation_lifecycle({
            action: 'save', result: changed, snapshot, availableNotationIds: snapshot.notationOrder,
            trees, settings: structuredClone(DEFAULT_SETTINGS), storage,
        });
        expect(trees.has(local_id)).toBe(false);
        expect(trees.has(id)).toBe(true);
        expect(storage.getItem(analysis_storage_key(local_id))).toBeNull();
    });
});
