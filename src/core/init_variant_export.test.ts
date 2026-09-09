import { afterEach, describe, expect, it, vi } from 'vitest';
import { build_standalone } from '@/core/standalone_export.ts';
import {
    create_init_variant, generator_increment, register_notation, set_generator_state, set_variant_state, unregister_notation,
} from '@/core/registry.ts';
import { APP_STORAGE_KEYS, analysis_storage_key, note_storage_key } from '@/core/storage_keys.ts';
import { decode_note, encode_note } from '@/core/note_table.ts';
import { LocalNotationRuntime } from '@/core/local_notation_runtime.ts';
import { is_local_notation, reload_all } from '@/core/user_defined_notation.ts';

class MemoryStorage {
    data = new Map<string, string>();
    getItem(key: string) { return this.data.get(key) ?? null; }
    setItem(key: string, value: string) { this.data.set(key, value); }
    removeItem(key: string) { this.data.delete(key); }
    get length() { return this.data.size; }
    key(index: number) { return [...this.data.keys()][index] ?? null; }
}
const base = {
    id: 'variant-export-base', name: 'Export base', display: { plain: String, from_display: Number },
    is_limit: () => false, compare: (a: number, b: number) => a - b, FS: (a: number) => a, init: () => [10, 0],
};
const fetchImpl = vi.fn(async (url: string | URL | Request) => ({
    ok: true, status: 200,
    text: async () => String(url).endsWith('index.html') ? '<script src="app.js"></script>' : 'window.started=true;',
})) as unknown as typeof fetch;

function bootstrap(html: string) {
    const target: any = { localStorage: new MemoryStorage() };
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('Bootstrap missing');
    new Function('window', script)(target);
    return target;
}
function setup() {
    set_generator_state({});
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { location: { href: 'https://example.test/' } });
    vi.stubGlobal('localStorage', storage);
    register_notation(base);
    const first = create_init_variant(base.id, ['5', '0']).id!;
    const second = create_init_variant(base.id, ['4', '0']).id!;
    return { storage, first, second };
}
afterEach(() => {
    reload_all([]);
    set_variant_state({});
    unregister_notation(base.id);
    vi.unstubAllGlobals();
});

describe('standalone initial variants', () => {
    it.each([true, false])('includes only the selected variant definition with includeData=%s', async (includeData) => {
        const { storage, first, second } = setup();
        storage.setItem(APP_STORAGE_KEYS.settings, JSON.stringify({ current_notation_id: second }));
        storage.setItem(analysis_storage_key(first), 'selected analysis');
        const note = [['1,2,4,8', '001'], ['two\nlines', '"literal"']];
        storage.setItem(note_storage_key(first), encode_note(note));
        storage.setItem(analysis_storage_key(second), 'excluded analysis');
        storage.setItem(note_storage_key(second), 'excluded note');
        storage.setItem(analysis_storage_key(base.id), 'unselected base analysis');
        storage.setItem(note_storage_key(base.id), 'unselected base note');
        const result = await build_standalone({
            localFiles: [], builtinNotationIds: [first], includeData, fetchImpl,
        });
        const target = bootstrap(result.html);
        expect(target.__NE_STANDALONE_BUILTIN_IDS__).toEqual([first, base.id]);
        expect(target.__NE_STANDALONE_VARIANT_IDS__).toEqual([first]);
        const settings = JSON.parse(target.NotationStorage.getItem(APP_STORAGE_KEYS.settings));
        expect(settings.variant_state).toEqual({ [base.id]: [{ seq: 1, init: ['5', '0'] }] });
        expect(target.NotationStorage.getItem(analysis_storage_key(first))).toBe(includeData ? 'selected analysis' : null);
        if (includeData) expect(decode_note(target.NotationStorage.getItem(note_storage_key(first)))).toEqual(note);
        else expect(target.NotationStorage.getItem(note_storage_key(first))).toBeNull();
        expect(target.NotationStorage.getItem(analysis_storage_key(second))).toBeNull();
        expect(target.NotationStorage.getItem(note_storage_key(second))).toBeNull();
        expect(target.NotationStorage.getItem(analysis_storage_key(base.id))).toBeNull();
        expect(target.NotationStorage.getItem(note_storage_key(base.id))).toBeNull();
    });

    it('removes excluded notation settings and reconciles direct expansion', async () => {
        const { storage, first, second } = setup();
        storage.setItem(APP_STORAGE_KEYS.settings, JSON.stringify({
            current_notation_id: first, hidden_notations: [second],
            equiv_active: { [first]: 'keep', [second]: 'omit' },
            equiv_hide_original: { [second]: true }, shown_equiv: { [second]: ['omit'] },
            expand: { notation_id: second, notation_equiv: 'omit', count: 7 },
        }));
        const target = bootstrap((await build_standalone({
            localFiles: [], builtinNotationIds: [first], includeData: true, fetchImpl,
        })).html);
        const settings = JSON.parse(target.NotationStorage.getItem(APP_STORAGE_KEYS.settings));
        expect(settings.hidden_notations).toEqual([]);
        expect(settings.equiv_active).toEqual({ [first]: 'keep' });
        expect(settings.equiv_hide_original).toEqual({});
        expect(settings.shown_equiv).toEqual({});
        expect(settings.expand).toEqual({ notation_id: first, count: 7 });
    });

    it('keeps incremented local generator members out of the built-in export selection', async () => {
        setup();
        const runtime = new LocalNotationRuntime({ storage: new MemoryStorage(), createId: () => 'generator' });
        const file = runtime.createUpload('Generator.js', `register_category({
            id: 'export-local-gen', name: 'Local generator', generator: { start: 1, initial: 1, create: n => ({
                id: 'export-local-gen-' + n, category_id: 'export-local-gen', name: 'Member',
                display: String, is_limit: () => false, compare: (a,b) => a-b, FS: a => a, init: () => [10,0]
            }) }
        });`, true).file;
        const id = generator_increment('export-local-gen')!;
        expect(is_local_notation(id)).toBe(true);
        expect(runtime.getNotationIds(file.id)).toContain(id);
        const omitted = bootstrap((await build_standalone({
            localFiles: [], builtinNotationIds: [id], includeData: false, fetchImpl,
        })).html);
        expect(omitted.__NE_STANDALONE_BUILTIN_IDS__).toEqual([]);
    });

    it('does not export sibling definitions just because the base was selected', async () => {
        setup();
        const result = await build_standalone({
            localFiles: [], builtinNotationIds: [base.id], includeData: true, fetchImpl,
        });
        const target = bootstrap(result.html);
        expect(target.__NE_STANDALONE_VARIANT_IDS__).toEqual([]);
        expect(JSON.parse(target.NotationStorage.getItem(APP_STORAGE_KEYS.settings)).variant_state).toEqual({});
    });

    it('exports explicitly selected local variants only with their selected source file', async () => {
        setup();
        const runtime = new LocalNotationRuntime({ storage: new MemoryStorage(), createId: () => 'local' });
        const file = runtime.createUpload('Local.js', `register_notation({
            id: 'variant-export-local', name: 'Local', display: { plain: String, from_display: Number },
            is_limit: () => false, compare: (a,b) => a-b, FS: a => a, init: () => [10,0]
        });`, true).file;
        const id = create_init_variant('variant-export-local', ['7', '2']).id!;
        const result = await build_standalone({
            localFiles: [file], builtinNotationIds: [], localVariantIds: [id], includeData: false, fetchImpl,
        });
        const target = bootstrap(result.html);
        expect(target.__NE_STANDALONE_BUILTIN_IDS__).toEqual([]);
        expect(target.__NE_STANDALONE_VARIANT_IDS__).toEqual([id]);
        expect(JSON.parse(target.NotationStorage.getItem(APP_STORAGE_KEYS.settings)).variant_state)
            .toEqual({ 'variant-export-local': [{ seq: 1, init: ['7', '2'] }] });
        expect(JSON.parse(target.NotationStorage.getItem(APP_STORAGE_KEYS.localNotationFiles)).files[0].source)
            .toBe(file.source);
        const omitted = bootstrap((await build_standalone({
            localFiles: [], builtinNotationIds: [id, 'variant-export-local'], localVariantIds: [id],
            includeData: false, fetchImpl,
        })).html);
        expect(omitted.__NE_STANDALONE_BUILTIN_IDS__).toEqual([]);
        expect(omitted.__NE_STANDALONE_VARIANT_IDS__).toEqual([]);
    });
});
