import { describe, expect, it } from 'vitest';
import { inspect_local_notation_file, stage_ai_generated_notation } from '@/core/ai_local_notation';
import { LocalNotationRuntime } from '@/core/local_notation_runtime';
import type { StorageLike } from '@/core/local_notation_store';

class MemoryStorage implements StorageLike {
    readonly data = new Map<string, string>();

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
}

function runtime(): LocalNotationRuntime {
    let nextId = 0;
    return new LocalNotationRuntime({
        storage: new MemoryStorage(),
        executionDisabled: true,
        createId: () => `local-${++nextId}`,
    });
}

describe('AI local notation integration', () => {
    it('inspects committed and draft source case-insensitively', () => {
        const local = runtime();
        const file = local.createUpload('LPrSS.js', 'committed source', false).file;
        local.setDraft(file.id, { name: 'LPrSS.js', source: 'draft source' });

        expect(inspect_local_notation_file(local, 'lprss.JS')).toEqual({
            fileName: 'LPrSS.js',
            enabled: false,
            trusted: false,
            committedSource: 'committed source',
            draftFileName: 'LPrSS.js',
            draftSource: 'draft source',
        });
    });

    it('stages same-name AI output as a draft without replacing an enabled file', () => {
        const local = runtime();
        const file = local.createUpload('LPrSS.js', 'live committed source', true).file;
        local.enable(file.id);

        const result = stage_ai_generated_notation(local, '', 'lprss.JS', 'AI replacement source');

        expect(result).toMatchObject({
            created: false,
            stagedFileName: 'LPrSS.js',
            file: { id: file.id, name: 'LPrSS.js' },
        });
        expect(local.getFile(file.id)).toMatchObject({
            source: 'live committed source',
            enabled: true,
            trusted: true,
        });
        expect(local.getDraft(file.id)).toMatchObject({
            name: 'LPrSS.js',
            source: 'AI replacement source',
        });
        expect(local.listFiles()).toHaveLength(1);
    });

    it('keeps a conversation-bound file as the update target and creates genuinely new files disabled', () => {
        const local = runtime();
        const existing = local.createUpload('Existing.js', 'old source', false).file;

        const updated = stage_ai_generated_notation(local, existing.id, 'Renamed.js', 'new draft');
        const created = stage_ai_generated_notation(local, '', 'Brand-New.js', 'new source');

        expect(updated).toMatchObject({ created: false, stagedFileName: 'Renamed.js', file: { id: existing.id } });
        expect(local.getFile(existing.id)?.name).toBe('Existing.js');
        expect(local.getDraft(existing.id)).toMatchObject({ name: 'Renamed.js', source: 'new draft' });
        expect(created).toMatchObject({
            created: true,
            stagedFileName: 'Brand-New.js',
            file: { name: 'Brand-New.js', enabled: false, trusted: false },
        });
    });

    it('reports an unknown local filename to the model', () => {
        const local = runtime();
        expect(() => inspect_local_notation_file(local, 'Missing.js')).toThrow(
            'No local notation file named "Missing.js" exists.',
        );
    });
});
