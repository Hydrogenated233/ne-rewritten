type MarkedApi = typeof import('marked');

const marked_api = (window as typeof window & { marked?: MarkedApi }).marked;
if (!marked_api) throw new Error('Marked was not loaded from the standalone CDN.');

export const marked = marked_api.marked;
