import { describe, expect, it, vi } from 'vitest';
import { build_standalone } from '@/core/standalone_export.ts';
import { register_notation } from '@/core/registry.ts';

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
                get length() {
                    return local.size;
                },
                key: (index: number) => [...local.keys()][index] ?? null,
            },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/compat/index.html'))
                return response(
                    '<link rel="stylesheet" href="/compat/assets/app.css"><script type="module" src="/compat/assets/app.js"></script>',
                );
            if (url.endsWith('/compat/assets/app.css')) return response('.app{color:red}');
            if (url.endsWith('/compat/assets/app.js')) return response('window.__app_started__=true;');
            return response('', 404);
        });
        const selected = {
            id: 'local-ok',
            name: 'ok.js',
            source: 'register_notation({id:"ok"})',
            enabled: true,
            trusted: true,
            template: false,
            order: 1,
            createdAt: 1,
            updatedAt: 1,
            sourceRevision: 1,
            loadedRevision: 1,
            manifest: { notations: ['ok'], categories: [] },
            knownNotationIds: ['ok'],
            knownCategoryIds: [],
            lastError: null,
        };
        const excluded = { ...selected, id: 'local-disabled', name: 'disabled.js', enabled: false };
        const result = await build_standalone({
            localFiles: [selected, excluded],
            includeData: true,
            fetchImpl: fetchImpl as any,
        });
        expect(fetchImpl).toHaveBeenCalledWith('https://example.test/compat/index.html', {
            credentials: 'same-origin',
        });
        expect(result.html).toContain('window.__NE_STANDALONE__=true');
        expect(result.html).toContain('ne-standalone:');
        expect(result.html).toContain('ok.js');
        expect(result.html).not.toContain('disabled.js');
        expect(result.html).toContain('.app{color:red}');
        expect(result.html).toContain('window.__app_started__=true;');
        expect(result.html).toContain('ne-standalone-loader-bar');
        expect(result.html).toContain('vue@3.5.38/dist/vue.runtime.global.prod.js');
        expect(result.html).toContain('katex@0.17.0/dist/katex.min.css');
        expect(result.html).toContain('read-excel-file@9.3.10/bundle/read-excel-file.min.js');
        expect(result.fileName).toBe('notation-explorer-standalone.html');
        delete (globalThis as any).window;
        delete (globalThis as any).localStorage;
    });

    it('passes an explicit built-in notation allow-list to the standalone bootstrap', async () => {
        register_notation({
            id: 'standalone-selection-fixture',
            name: 'Selection fixture',
            display: { plain: String },
            is_limit: () => false,
            compare: () => 0,
            FS: (value) => value,
            init: () => [0],
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'https://example.test/ne-rewritten/' } },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/compat/index.html')) return response('<script src="/compat/assets/app.js"></script>');
            if (url.endsWith('/compat/assets/app.js')) return response('window.__app_started__=true;');
            return response('', 404);
        });
        const result = await build_standalone({
            localFiles: [],
            builtinNotationIds: ['standalone-selection-fixture'],
            includeData: false,
            fetchImpl: fetchImpl as any,
        });
        expect(result.html).toContain('window.__NE_STANDALONE_BUILTIN_IDS__=["standalone-selection-fixture"]');
        delete (globalThis as any).window;
    });

    it('rejects a Vite development index instead of downloading a non-standalone file', async () => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'http://127.0.0.1:5174/ne-rewritten/' } },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/compat/index.html'))
                return response(
                    '<script type="module" src="/ne-rewritten/@vite/client"></script><script type="module" src="/ne-rewritten/src/main.js"></script>',
                );
            return response('', 404);
        });
        await expect(
            build_standalone({ localFiles: [], includeData: false, fetchImpl: fetchImpl as any }),
        ).rejects.toThrow('development server');
        delete (globalThis as any).window;
    });

    it('resolves the standalone runtime from the site root when exporting from the compat page', async () => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'https://example.test/ne-rewritten/compat/' } },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url === 'https://example.test/ne-rewritten/standalone/index.html')
                return response('<script src="./assets/app.js"></script>');
            if (url === 'https://example.test/ne-rewritten/standalone/assets/app.js')
                return response('window.__app_started__=true;');
            return response('', 404);
        });
        await build_standalone({ localFiles: [], includeData: false, fetchImpl: fetchImpl as any });
        expect(fetchImpl).toHaveBeenCalledWith('https://example.test/ne-rewritten/standalone/index.html', {
            credentials: 'same-origin',
        });
        expect(fetchImpl).not.toHaveBeenCalledWith(
            'https://example.test/ne-rewritten/compat/standalone/index.html',
            expect.anything(),
        );
        delete (globalThis as any).window;
    });

    it('inlines non-CDN CSS assets and starts the embedded app after the progress loader', async () => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'https://example.test/ne-rewritten/' } },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/compat/index.html'))
                return response(
                    '<link rel="stylesheet" href="/compat/assets/app.css"><script type="module" src="/compat/assets/app.js"></script>',
                );
            if (url.endsWith('/compat/assets/app.css'))
                return response('@font-face{font-family:test;src:url("/compat/assets/test.woff2")}');
            if (url.endsWith('/compat/assets/test.woff2'))
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => new Uint8Array([0, 1, 2, 255]).buffer,
                    headers: { get: () => 'font/woff2' },
                } as any;
            if (url.endsWith('/compat/assets/app.js')) return response('window.__app_started__=true;');
            return response('', 404);
        });
        const result = await build_standalone({ localFiles: [], includeData: false, fetchImpl: fetchImpl as any });
        expect(result.html).toContain('data:font/woff2;base64,AAEC/w==');
        expect(result.html).not.toContain('<script type="module">');
        expect(fetchImpl).toHaveBeenCalledWith('https://example.test/compat/assets/test.woff2', {
            credentials: 'same-origin',
        });
        delete (globalThis as any).window;
    });

    it('rewrites generated KaTeX font assets to pinned CDN URLs without fetching them', async () => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { href: 'https://example.test/ne-rewritten/' } },
        });
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith('/standalone/index.html'))
                return response(
                    '<link rel="stylesheet" href="./assets/app.css"><script src="./assets/app.js"></script>',
                );
            if (url.endsWith('/standalone/assets/app.css'))
                return response('@font-face{font-family:KaTeX_Main;src:url("./KaTeX_Main-Regular-B22Nviop.woff2")}');
            if (url.endsWith('/standalone/assets/app.js'))
                return response(
                    'const css=`@font-face{font-family:KaTeX_Main;font-style:normal;src:url(`+new URL(`KaTeX_Main-Regular-B22Nviop.woff2`,document.baseURI).href+`)}`;',
                );
            return response('', 404);
        });
        const result = await build_standalone({ localFiles: [], includeData: false, fetchImpl: fetchImpl as any });
        expect(result.html).toContain('https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/fonts/KaTeX_Main-Regular.woff2');
        expect(result.html).not.toContain('KaTeX_Main-Regular-B22Nviop.woff2');
        expect(result.html).toContain('font-family:KaTeX_Main;font-style:normal');
        expect(fetchImpl).not.toHaveBeenCalledWith(
            'https://example.test/ne-rewritten/standalone/assets/KaTeX_Main-Regular-B22Nviop.woff2',
            expect.anything(),
        );
        delete (globalThis as any).window;
    });
});
