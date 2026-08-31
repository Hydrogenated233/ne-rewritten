type KatexApi = typeof import('katex').default;

const katex = (window as typeof window & { katex?: KatexApi }).katex;
if (!katex) throw new Error('KaTeX was not loaded from the standalone CDN.');

export default katex;
