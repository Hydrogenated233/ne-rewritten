import { list_notations } from '@/core/registry.ts';
import { app_storage } from '@/core/storage.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';

export interface StandaloneExportOptions {
    localFiles: LocalNotationFile[];
    includeData: boolean;
    title?: string;
    fileName?: string;
    bundleId?: string;
    fetchImpl?: typeof fetch;
}

export interface StandaloneExportResult {
    html: string;
    fileName: string;
    bundleId: string;
    selectedLocalFiles: LocalNotationFile[];
}

interface AssetDocument {
    html: string;
    baseUrl: string;
}

const SETTINGS_KEY = 'ne-settings';
const LOCAL_FILES_KEY = 'ne-local-notation-files';
const DEFAULT_TITLE = 'Notation Explorer';
const DEFAULT_FILE_NAME = 'notation-explorer-standalone.html';

function text_bytes(value: string): number {
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : unescape(encodeURIComponent(value)).length;
}

function escape_html(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function json_for_script(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function encode_file_name(value: string | undefined): string {
    let name = String(value || DEFAULT_FILE_NAME)
        .trim()
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-');
    if (!name) name = DEFAULT_FILE_NAME;
    if (!/\.html?$/i.test(name)) name += '.html';
    return name.slice(0, 120);
}

function unique_id(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `ne-${crypto.randomUUID()}`;
    return `ne-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function resolve_asset(baseUrl: string, src: string): string {
    return new URL(src, baseUrl).href;
}

function source_urls(html: string): { scripts: string[]; styles: string[] } {
    const scripts: string[] = [];
    const styles: string[] = [];
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) scripts.push(match[1]);
    for (const match of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) styles.push(match[1]);
    return { scripts, styles };
}

async function fetch_text(fetcher: typeof fetch, url: string): Promise<string> {
    const response = await fetcher(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not read standalone asset (${response.status}): ${url}`);
    return response.text();
}

async function load_compat_assets(fetcher: typeof fetch): Promise<{ css: string[]; scripts: string[] }> {
    const pageBase = new URL(import.meta.env.BASE_URL || './', window.location.href);
    const candidates = [new URL('compat/', pageBase).href, pageBase.href];
    let document_data: AssetDocument | null = null;
    let last_error: unknown;
    for (const candidate of candidates) {
        try {
            const indexUrl = candidate.endsWith('/') ? `${candidate}index.html` : candidate;
            const html = await fetch_text(fetcher, indexUrl);
            document_data = { html, baseUrl: indexUrl };
            break;
        } catch (error) {
            last_error = error;
        }
    }
    if (!document_data) throw (last_error instanceof Error ? last_error : new Error('Could not read the application build.'));

    let urls = source_urls(document_data.html);
    if (urls.scripts.length === 0 && typeof document !== 'undefined') {
        urls = {
            scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((item) => item.src),
            styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')].map((item) => item.href),
        };
    }
    const scripts = await Promise.all(urls.scripts.map((url) => fetch_text(fetcher, resolve_asset(document_data!.baseUrl, url))));
    const css = await Promise.all(urls.styles.map((url) => fetch_text(fetcher, resolve_asset(document_data!.baseUrl, url))));
    if (scripts.length === 0) throw new Error('The application build did not contain a JavaScript entry point.');
    return { css, scripts };
}

function snapshot_storage(includeData: boolean): Record<string, string> {
    if (!includeData) return {};
    const store = app_storage();
    if (!store) return {};
    const result: Record<string, string> = {};
    const candidate = store as AppStorageWithKeys;
    if (typeof candidate.length === 'number' && typeof candidate.key === 'function') {
        for (let index = 0; index < candidate.length; index++) {
            const key = candidate.key(index);
            if (!key || !/^ne-(?:settings|analysis-|note-|summary-pos|direct-expand-panel-geometry|notes-panel-geometry)/.test(key)) continue;
            const value = store.getItem(key);
            if (value !== null) result[key] = value;
        }
        return result;
    }
    const known = [SETTINGS_KEY, 'ne-summary-pos', 'ne-direct-expand-panel-geometry', 'ne-notes-panel-geometry'];
    for (const key of known) {
        const value = store.getItem(key);
        if (value !== null) result[key] = value;
    }
    for (const notation of list_notations()) {
        for (const prefix of ['ne-analysis-', 'ne-note-']) {
            const key = prefix + notation.id;
            const value = store.getItem(key);
            if (value !== null) result[key] = value;
        }
    }
    return result;
}

interface AppStorageWithKeys {
    length?: number;
    key?: (index: number) => string | null;
}

function local_file_state(files: LocalNotationFile[]): Record<string, unknown> {
    const selected = files.map((file) => ({ ...file, enabled: true, trusted: true }));
    return {
        version: 1,
        nextOrder: selected.reduce((max, file) => Math.max(max, file.order), 0) + 1,
        files: selected,
        drafts: {},
    };
}

function bootstrap_script(bundleId: string, snapshot: Record<string, string>, files: Record<string, unknown>): string {
    return `(function(){\n` +
        `window.__NE_STANDALONE__=true;\n` +
        `var prefix=${json_for_script(`ne-standalone:${bundleId}:`)};\n` +
        `var seed=${json_for_script(snapshot)};\n` +
        `var localFiles=${json_for_script(files)};\n` +
        `var memory={};\n` +
        `var nativeStorage=null;try{nativeStorage=window.localStorage;var probe=prefix+'@probe';nativeStorage.setItem(probe,'1');nativeStorage.removeItem(probe)}catch(_){nativeStorage=null}\n` +
        `function read(key){if(key==='${LOCAL_FILES_KEY}')return JSON.stringify(localFiles);if(!nativeStorage)return Object.prototype.hasOwnProperty.call(memory,key)?memory[key]:null;return nativeStorage.getItem(prefix+key)}\n` +
        `function write(key,value){value=String(value);if(!nativeStorage)memory[key]=value;else nativeStorage.setItem(prefix+key,value)}\n` +
        `function remove(key){if(!nativeStorage)delete memory[key];else nativeStorage.removeItem(prefix+key)}\n` +
        `Object.keys(seed).forEach(function(key){if(read(key)===null)write(key,seed[key])});\n` +
        `window.NotationStorage={getItem:read,setItem:write,removeItem:remove};\n` +
        `})();`;
}

function standalone_html(title: string, css: string[], scripts: string[], bootstrap: string): string {
    const safe_scripts = scripts.map((script) => script.replace(/<\/script/gi, '<\\/script'));
    const css_text = css.join('\n').replace(/<\/style/gi, '<\\/style');
    return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="NE-rewritten standalone export"><title>${escape_html(title)}</title><style>${css_text}</style></head><body><div id="app"></div><script>${bootstrap.replace(/<\/script/gi, '<\\/script')}</script>${safe_scripts.map((script) => `<script type="module">${script}</script>`).join('')}</body></html>`;
}

export async function build_standalone(options: StandaloneExportOptions): Promise<StandaloneExportResult> {
    const fetcher = options.fetchImpl ?? fetch;
    const title = String(options.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
    const bundleId = String(options.bundleId || unique_id()).replace(/[^0-9A-Za-z._-]/g, '-');
    const selected = options.localFiles.filter((file) => file.enabled && file.trusted && file.sourceRevision === file.loadedRevision);
    const assets = await load_compat_assets(fetcher);
    const snapshot = snapshot_storage(options.includeData);
    const html = standalone_html(title, assets.css, assets.scripts, bootstrap_script(bundleId, snapshot, local_file_state(selected)));
    return { html, fileName: encode_file_name(options.fileName), bundleId, selectedLocalFiles: selected };
}

export function download_standalone(result: StandaloneExportResult): void {
    const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function estimate_standalone_bytes(result: StandaloneExportResult): number {
    return text_bytes(result.html);
}
