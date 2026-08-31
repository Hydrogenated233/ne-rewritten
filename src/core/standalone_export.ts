import { get_category, get_category_children, get_notation, list_notations } from '@/core/registry.ts';
import { app_storage } from '@/core/storage.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import type { BuiltinNotationSourceFile } from '@/core/builtin_notation_sources.ts';
import { analysis_storage_key, APP_STORAGE_KEYS, APP_STORAGE_PREFIXES, note_storage_key } from '@/core/storage_keys.ts';

export interface StandaloneExportOptions {
    localFiles: LocalNotationFile[];
    /** Built-in notation ids to keep in the exported runtime. Omit to keep all. */
    builtinNotationIds?: string[];
    /** Source files corresponding to the selected built-in notations. */
    builtinSourceFiles?: BuiltinNotationSourceFile[];
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

interface StandaloneCdnAsset {
    name: string;
    url: string;
    kind: 'script' | 'style';
}

const SETTINGS_KEY = APP_STORAGE_KEYS.settings;
const LOCAL_FILES_KEY = APP_STORAGE_KEYS.localNotationFiles;
const DEFAULT_TITLE = 'Notation Explorer';
const DEFAULT_FILE_NAME = 'notation-explorer-standalone.html';
const KATEX_VERSION = '0.17.0';
const STANDALONE_CDN_ASSETS: StandaloneCdnAsset[] = [
    {
        name: 'Vue',
        url: 'https://cdn.jsdelivr.net/npm/vue@3.5.38/dist/vue.runtime.global.prod.js',
        kind: 'script',
    },
    {
        name: 'KaTeX',
        url: `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`,
        kind: 'script',
    },
    {
        name: 'KaTeX styles',
        url: `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`,
        kind: 'style',
    },
    {
        name: 'Marked',
        url: 'https://cdn.jsdelivr.net/npm/marked@18.0.6/lib/marked.umd.js',
        kind: 'script',
    },
    {
        name: 'Excel reader',
        url: 'https://cdn.jsdelivr.net/npm/read-excel-file@9.3.10/bundle/read-excel-file.min.js',
        kind: 'script',
    },
    {
        name: 'Excel writer',
        url: 'https://cdn.jsdelivr.net/npm/write-excel-file@4.1.1/bundle/write-excel-file.min.js',
        kind: 'script',
    },
];

function text_bytes(value: string): number {
    return typeof TextEncoder === 'function'
        ? new TextEncoder().encode(value).length
        : unescape(encodeURIComponent(value)).length;
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
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
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
    for (const match of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi))
        styles.push(match[1]);
    return { scripts, styles };
}

async function fetch_text(fetcher: typeof fetch, url: string): Promise<string> {
    const response = await fetcher(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not read standalone asset (${response.status}): ${url}`);
    return response.text();
}

async function fetch_data_url(fetcher: typeof fetch, url: string): Promise<string> {
    const response = await fetcher(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not read standalone asset (${response.status}): ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunk_size = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk_size) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk_size));
    }
    const mime = response.headers.get('content-type')?.split(';', 1)[0] || 'application/octet-stream';
    return `data:${mime};base64,${btoa(binary)}`;
}

function katex_font_cdn_url(baseUrl: string, source: string): string | null {
    let file_name: string;
    try {
        file_name = decodeURIComponent(new URL(source, baseUrl).pathname.split('/').pop() || '');
    } catch {
        return null;
    }
    const hashed = file_name.match(/^(KaTeX_.+?)-[0-9A-Za-z_-]{8}\.(woff2?|ttf)$/);
    const plain = file_name.match(/^(KaTeX_.+?\.(?:woff2?|ttf))$/);
    const original = hashed ? `${hashed[1]}.${hashed[2]}` : plain?.[1];
    return original
        ? `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/fonts/${encodeURIComponent(original)}`
        : null;
}

function rewrite_katex_font_references(source: string): string {
    return source.replace(/KaTeX_[0-9A-Za-z_-]+?-[0-9A-Za-z_-]{8}\.(?:woff2?|ttf)/g, (file_name) => {
        const cdn_url = katex_font_cdn_url('https://standalone.invalid/', file_name);
        return cdn_url ?? file_name;
    });
}

async function inline_css_assets(fetcher: typeof fetch, css: string[], baseUrl: string): Promise<string[]> {
    const urls = new Set<string>();
    for (const text of css) {
        for (const match of text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
            const source = match[2].trim();
            if (!source || /^data:/i.test(source) || /^https?:/i.test(source) || /^blob:/i.test(source)) continue;
            if (katex_font_cdn_url(baseUrl, source)) continue;
            urls.add(resolve_asset(baseUrl, source));
        }
    }
    const replacements = new Map<string, string>();
    if (urls.size > 0) {
        await Promise.all(
            [...urls].map(async (url) => {
                replacements.set(url, await fetch_data_url(fetcher, url));
            }),
        );
    }
    return css.map((text) =>
        text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, quote: string, source: string) => {
            const katex_cdn = katex_font_cdn_url(baseUrl, source.trim());
            if (katex_cdn) return `url(${quote}${katex_cdn}${quote})`;
            const resolved = resolve_asset(baseUrl, source.trim());
            const replacement = replacements.get(resolved);
            return replacement ? `url(${quote}${replacement}${quote})` : full;
        }),
    );
}

async function load_compat_assets(fetcher: typeof fetch): Promise<{ css: string[]; scripts: string[] }> {
    const pageBase = new URL(import.meta.env.BASE_URL || './', window.location.href);
    const currentPage = new URL(window.location.href);
    const siteBase = pageBase.pathname.replace(/\/+$/, '').endsWith('/compat')
        ? new URL('../', pageBase)
        : currentPage.pathname.replace(/\/+$/, '').endsWith('/compat')
          ? new URL('../', currentPage)
          : pageBase;
    const candidates = [new URL('standalone/', siteBase).href, new URL('compat/', siteBase).href, pageBase.href];
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
    if (!document_data)
        throw last_error instanceof Error ? last_error : new Error('Could not read the application build.');

    let urls = source_urls(document_data.html);
    if (urls.scripts.length === 0 && typeof document !== 'undefined') {
        urls = {
            scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((item) => item.src),
            styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')].map(
                (item) => item.href,
            ),
        };
    }
    // A Vite development index is not a distributable runtime: its module
    // entry imports .vue/.ts sources and the Vite client. Embedding those URLs
    // would produce an HTML file that downloads successfully but cannot start
    // when opened directly. Fail before downloading and tell the user to use a
    // built/deployed page instead.
    if (urls.scripts.some((url) => /(?:^|\/)@vite\/client|\/src\/|\.tsx?(?:[?#]|$)|\.vue(?:[?#]|$)/i.test(url))) {
        throw new Error(
            'Standalone export requires a deployed production build; the development server cannot create a self-contained HTML file.',
        );
    }
    const scripts = (
        await Promise.all(urls.scripts.map((url) => fetch_text(fetcher, resolve_asset(document_data!.baseUrl, url))))
    ).map(rewrite_katex_font_references);
    const css = await Promise.all(
        urls.styles.map((url) => fetch_text(fetcher, resolve_asset(document_data!.baseUrl, url))),
    );
    if (scripts.length === 0) throw new Error('The application build did not contain a JavaScript entry point.');
    return { css: await inline_css_assets(fetcher, css, document_data!.baseUrl), scripts };
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
            if (!key || !is_snapshot_storage_key(key)) continue;
            const value = store.getItem(key);
            if (value !== null) result[key] = value;
        }
        return result;
    }
    const known = [SETTINGS_KEY, APP_STORAGE_KEYS.summaryPosition, APP_STORAGE_KEYS.notesPanelGeometry];
    for (const key of known) {
        const value = store.getItem(key);
        if (value !== null) result[key] = value;
    }
    for (const notation of list_notations()) {
        for (const key of [analysis_storage_key(notation.id), note_storage_key(notation.id)]) {
            const value = store.getItem(key);
            if (value !== null) result[key] = value;
        }
    }
    return result;
}

function is_snapshot_storage_key(key: string): boolean {
    return (
        key === APP_STORAGE_KEYS.settings ||
        key === APP_STORAGE_KEYS.summaryPosition ||
        key === APP_STORAGE_KEYS.notesPanelGeometry ||
        key.startsWith(APP_STORAGE_PREFIXES.analysis) ||
        key.startsWith(APP_STORAGE_PREFIXES.note) ||
        key.startsWith(APP_STORAGE_PREFIXES.directExpandPanelGeometry)
    );
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

function bootstrap_script(
    bundleId: string,
    snapshot: Record<string, string>,
    files: Record<string, unknown>,
    builtinNotationIds: string[] | undefined,
    builtinGeneratorCategoryIds: string[] | undefined,
    builtinSourceFiles: BuiltinNotationSourceFile[],
): string {
    return (
        `(function(){\n` +
        `window.__NE_STANDALONE__=true;\n` +
        (builtinNotationIds ? `window.__NE_STANDALONE_BUILTIN_IDS__=${json_for_script(builtinNotationIds)};\n` : '') +
        (builtinGeneratorCategoryIds
            ? `window.__NE_STANDALONE_GENERATOR_CATEGORY_IDS__=${json_for_script(builtinGeneratorCategoryIds)};\n`
            : '') +
        `window.__NE_STANDALONE_BUILTIN_FILES__=${json_for_script(builtinSourceFiles)};\n` +
        `var prefix=${json_for_script(`${APP_STORAGE_PREFIXES.standalone}${bundleId}:`)};\n` +
        `var seed=${json_for_script(snapshot)};\n` +
        `var localFiles=${json_for_script(files)};\n` +
        `var memory={};\n` +
        `var nativeStorage=null;try{nativeStorage=window.localStorage;var probe=prefix+'@probe';nativeStorage.setItem(probe,'1');nativeStorage.removeItem(probe)}catch(_){nativeStorage=null}\n` +
        `function read(key){if(key==='${LOCAL_FILES_KEY}')return JSON.stringify(localFiles);if(!nativeStorage)return Object.prototype.hasOwnProperty.call(memory,key)?memory[key]:null;return nativeStorage.getItem(prefix+key)}\n` +
        `function write(key,value){value=String(value);if(!nativeStorage)memory[key]=value;else nativeStorage.setItem(prefix+key,value)}\n` +
        `function remove(key){if(!nativeStorage)delete memory[key];else nativeStorage.removeItem(prefix+key)}\n` +
        `Object.keys(seed).forEach(function(key){if(read(key)===null)write(key,seed[key])});\n` +
        `window.NotationStorage={getItem:read,setItem:write,removeItem:remove};\n` +
        `})();`
    );
}

function selected_generator_categories(builtinNotationIds: string[] | undefined): string[] | undefined {
    if (!builtinNotationIds) return undefined;
    const selected = new Set(builtinNotationIds);
    const category_ids = new Set<string>();
    for (const notation_id of selected) {
        const category_id = get_notation(notation_id)?.category_id;
        if (!category_id || category_ids.has(category_id)) continue;
        const category = get_category(category_id);
        if (!category?.generator) continue;
        const notation_ids = get_category_children(category_id)
            .filter((item) => item.kind === 'notation')
            .map((item) => item.id);
        if (notation_ids.length > 0 && notation_ids.every((id) => selected.has(id))) category_ids.add(category_id);
    }
    return [...category_ids];
}

function standalone_html(title: string, css: string[], scripts: string[], bootstrap: string): string {
    const css_text = css.join('\n').replace(/<\/style/gi, '<\\/style');
    const loader_style = `
#ne-standalone-loader{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f7f7f7;color:#222;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#ne-standalone-loader[hidden]{display:none}
.ne-standalone-loader__panel{width:min(420px,100%);padding:20px;border:1px solid #cfcfcf;border-radius:6px;background:#fff;box-sizing:border-box}
.ne-standalone-loader__title{margin:0 0 14px;font-size:18px;font-weight:600;letter-spacing:0}
.ne-standalone-loader__track{height:8px;overflow:hidden;border:1px solid #b8b8b8;border-radius:4px;background:#eee}
.ne-standalone-loader__bar{width:4%;height:100%;background:#6f36b5;transition:width .18s ease}
.ne-standalone-loader__status{min-height:21px;margin:10px 0 0;color:#555}
.ne-standalone-loader__error{margin:10px 0 0;color:#a01818;white-space:pre-wrap}
.ne-standalone-loader__retry{display:none;margin-top:14px;padding:6px 12px;border:1px solid #888;border-radius:4px;background:#fff;color:#222;cursor:pointer;font:inherit}
@media(prefers-color-scheme:dark){#ne-standalone-loader{background:#1c1c1c;color:#eee}.ne-standalone-loader__panel{border-color:#555;background:#282828}.ne-standalone-loader__track{border-color:#666;background:#3b3b3b}.ne-standalone-loader__status{color:#bbb}.ne-standalone-loader__error{color:#ff8a8a}.ne-standalone-loader__retry{border-color:#777;background:#333;color:#eee}}
@media(prefers-reduced-motion:reduce){.ne-standalone-loader__bar{transition:none}}
`;
    const loader_script = `(function(){
var root=document.getElementById('ne-standalone-loader');
var bar=document.getElementById('ne-standalone-loader-bar');
var status=document.getElementById('ne-standalone-loader-status');
var error=document.getElementById('ne-standalone-loader-error');
var retry=document.getElementById('ne-standalone-loader-retry');
var zh=(navigator.language||'').toLowerCase().indexOf('zh')===0;
function setProgress(value,message){bar.style.width=Math.max(4,Math.min(100,value))+'%';status.textContent=message;}
function load(item){return new Promise(function(resolve,reject){var tag=item.kind==='style'?document.createElement('link'):document.createElement('script');if(item.kind==='style'){tag.rel='stylesheet';tag.href=item.url}else{tag.src=item.url;tag.crossOrigin='anonymous'}tag.onload=function(){resolve(item)};tag.onerror=function(){reject(new Error((zh?'无法加载 ':'Could not load ')+item.name+' ('+item.url+')'))};document.head.appendChild(tag)})}
retry.onclick=function(){location.reload()};
setProgress(6,zh?'正在准备独立应用…':'Preparing the standalone app…');
var libraries=${json_for_script(STANDALONE_CDN_ASSETS)};
var appSources=${json_for_script(scripts)};
var completed=0;
Promise.all(libraries.map(function(item){return load(item).then(function(){completed++;setProgress(8+Math.round(completed/libraries.length*64),(zh?'已加载 ':'Loaded ')+item.name+' ('+completed+'/'+libraries.length+')')})})).then(function(){
setProgress(78,zh?'正在启动应用…':'Starting the application…');
appSources.forEach(function(source,index){(new Function(source+'\\n//# sourceURL=ne-standalone-app-'+(index+1)+'.js'))()});
setProgress(100,zh?'加载完成':'Ready');
requestAnimationFrame(function(){requestAnimationFrame(function(){root.hidden=true;root.remove()})});
}).catch(function(reason){var message=reason&&reason.message?reason.message:String(reason);status.textContent=zh?'加载失败':'Loading failed';error.textContent=message+'\\n'+(zh?'独立应用需要联网访问上面的 CDN。':'This standalone app requires network access to the CDN above.');retry.textContent=zh?'重试':'Retry';retry.style.display='inline-block';bar.style.background='#a01818'});
})();`;
    return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="NE-rewritten standalone export"><title>${escape_html(title)}</title><style>${loader_style}\n${css_text}</style></head><body><div id="ne-standalone-loader" role="status" aria-live="polite"><div class="ne-standalone-loader__panel"><h1 class="ne-standalone-loader__title">${escape_html(title)}</h1><div class="ne-standalone-loader__track" aria-hidden="true"><div id="ne-standalone-loader-bar" class="ne-standalone-loader__bar"></div></div><p id="ne-standalone-loader-status" class="ne-standalone-loader__status">Loading…</p><p id="ne-standalone-loader-error" class="ne-standalone-loader__error"></p><button id="ne-standalone-loader-retry" class="ne-standalone-loader__retry" type="button">Retry</button></div></div><div id="app"></div><noscript>This application requires JavaScript.</noscript><script>${bootstrap.replace(/<\/script/gi, '<\\/script')}</script><script>${loader_script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

export async function build_standalone(options: StandaloneExportOptions): Promise<StandaloneExportResult> {
    const fetcher = options.fetchImpl ?? fetch;
    const title = String(options.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
    const bundleId = String(options.bundleId || unique_id()).replace(/[^0-9A-Za-z._-]/g, '-');
    const selected = options.localFiles.filter(
        (file) => file.enabled && file.trusted && file.sourceRevision === file.loadedRevision,
    );
    const local_notation_ids = new Set(selected.flatMap((file) => file.manifest.notations));
    const available_builtin_ids = new Set(
        list_notations()
            .filter((notation) => !local_notation_ids.has(notation.id))
            .map((notation) => notation.id),
    );
    const builtin_ids = options.builtinNotationIds
        ? [...new Set(options.builtinNotationIds)].filter((id) => available_builtin_ids.has(id))
        : undefined;
    const generator_category_ids = selected_generator_categories(builtin_ids);
    const builtin_source_files = (options.builtinSourceFiles ?? []).filter(
        (file) => typeof file?.name === 'string' && typeof file?.source === 'string',
    );
    const assets = await load_compat_assets(fetcher);
    const snapshot = snapshot_storage(options.includeData);
    const html = standalone_html(
        title,
        assets.css,
        assets.scripts,
        bootstrap_script(
            bundleId,
            snapshot,
            local_file_state(selected),
            builtin_ids,
            generator_category_ids,
            builtin_source_files,
        ),
    );
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
