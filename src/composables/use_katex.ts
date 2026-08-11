// katex 按需加载: 多个组件共享同一个 promise, 避免重复请求。
// 仅在真正需要渲染 LaTeX 时(如 RenderLatex 挂载 / API 文档面板打开)才动态 import。

let katex_promise: Promise<typeof import('katex').default> | null = null;
let katex_module: typeof import('katex').default | null = null;

export function load_katex(): Promise<typeof import('katex').default> {
    if (!katex_promise) {
        // CSS(含全部 @font-face)与 JS 一起懒加载, 避免静态打进主 CSS
        katex_promise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
            katex_module = m.default;
            return m.default;
        });
    }
    return katex_promise;
}

export function get_katex(): typeof import('katex').default | null {
    return katex_module;
}
