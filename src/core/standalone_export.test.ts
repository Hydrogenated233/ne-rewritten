import { describe, expect, it, vi } from 'vitest';
import { build_standalone } from '@/core/standalone_export.ts';

function response(text: string, status = 200): any {
    return { ok: status >= 200 && status < 300, status, text: async () => text };
}

describe('standalone export boundary', () => {
    it('embeds the compat kernel, isolates storage, and seeds only loaded trusted files', async () => {
        const local = new Map<string, string>([['ne-settings', JSON.stringify({ current_notation_id: 'bm4' })]]);
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'https://example.test/ne-rewritten/' } },
        });
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => local.get(key) ?? null,
                setItem: (key: string, value: string) => local.set(key, value),
                removeItem: (key: string) => local.delete(key),
                get length() { return local.size; },
                key: (index: number) => [...local.keys()][index] ?? null,
            },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/compat/index.html')) return response('<link rel="stylesheet" href="/compat/assets/app.css"><script type="module" src="/compat/assets/app.js"></script>');
            if (url.endsWith('/compat/assets/app.css')) return response('.app{color:red}');
            if (url.endsWith('/compat/assets/app.js')) return response('window.__app_started__=true;');
            return response('', 404);
        });
        const selected = {
            id: 'local-ok', name: 'ok.js', source: 'register_notation({id:"ok"})', enabled: true, trusted: true,
            template: false, order: 1, createdAt: 1, updatedAt: 1, sourceRevision: 1, loadedRevision: 1,
            manifest: { notations: ['ok'], categories: [] }, knownNotationIds: ['ok'], knownCategoryIds: [], lastError: null,
        };
        const excluded = { ...selected, id: 'local-disabled', name: 'disabled.js', enabled: false };
        const result = await build_standalone({ localFiles: [selected, excluded], includeData: true, fetchImpl: fetchImpl as any });
        expect(fetchImpl).toHaveBeenCalledWith('https://example.test/compat/index.html', { credentials: 'same-origin' });
        expect(result.html).toContain('window.__NE_STANDALONE__=true');
        expect(result.html).toContain('ne-standalone:');
        expect(result.html).toContain('ok.js');
        expect(result.html).not.toContain('disabled.js');
        expect(result.html).toContain('.app{color:red}');
        expect(result.html).toContain('window.__app_started__=true;');
        expect(result.fileName).toBe('notation-explorer-standalone.html');
        delete (globalThis as any).window;
        delete (globalThis as any).localStorage;
    });
});
