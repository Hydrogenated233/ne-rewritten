export type EditorTokenType = 'keyword' | 'literal' | 'number' | 'string' | 'template' | 'comment' | 'plain';

export interface EditorToken {
    type: EditorTokenType;
    start: number;
    end: number;
    value: string;
}

export interface BracketMatch {
    status: 'none' | 'matched' | 'unmatched';
    index: number;
    matchIndex: number;
    bracket: string | null;
    match: string | null;
    pair: [number, number] | null;
}

const KEYWORDS = new Set([
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'get',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'set',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
]);
const LITERALS = new Set(['true', 'false', 'null']);
const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const BRACKETS = new Set(['(', ')', '[', ']', '{', '}']);
const TOKEN_CLASS: Partial<Record<EditorTokenType, string>> = {
    keyword: 'ne-editor-token ne-editor-token--keyword',
    literal: 'ne-editor-token ne-editor-token--literal',
    number: 'ne-editor-token ne-editor-token--number',
    string: 'ne-editor-token ne-editor-token--string',
    template: 'ne-editor-token ne-editor-token--template',
    comment: 'ne-editor-token ne-editor-token--comment',
};
const NUMBER_PATTERN =
    /^(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*n?|0[bB][01](?:_?[01])*n?|0[oO][0-7](?:_?[0-7])*n?|\d(?:_?\d)*n|(?:(?:\d(?:_?\d)*)?\.(?:\d(?:_?\d)*)|\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?)(?:[eE][+-]?\d(?:_?\d)*)?)/;

export function escape_html(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function is_identifier_start(character: string | undefined): boolean {
    return character !== undefined && /[A-Za-z_$]/.test(character);
}

function is_identifier_part(character: string | undefined): boolean {
    return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

function push_token(tokens: EditorToken[], type: EditorTokenType, source: string, start: number, end: number): void {
    if (end <= start) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type && previous.end === start) {
        previous.end = end;
        previous.value += source.slice(start, end);
        return;
    }
    tokens.push({ type, start, end, value: source.slice(start, end) });
}

/** Tokenize enough JavaScript for the source editor overlay. */
export function tokenize(value: unknown): EditorToken[] {
    const source = String(value ?? '');
    const tokens: EditorToken[] = [];
    let index = 0;

    while (index < source.length) {
        const start = index;
        const character = source[index];
        const next = source[index + 1];

        if (character === '/' && next === '/') {
            index += 2;
            while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index++;
            push_token(tokens, 'comment', source, start, index);
            continue;
        }
        if (character === '/' && next === '*') {
            index += 2;
            while (index < source.length) {
                if (source[index] === '*' && source[index + 1] === '/') {
                    index += 2;
                    break;
                }
                index++;
            }
            push_token(tokens, 'comment', source, start, index);
            continue;
        }
        if (character === '"' || character === "'") {
            const quote = character;
            index++;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index = Math.min(index + 2, source.length);
                    continue;
                }
                if (source[index] === quote) {
                    index++;
                    break;
                }
                if (source[index] === '\n' || source[index] === '\r') break;
                index++;
            }
            push_token(tokens, 'string', source, start, index);
            continue;
        }
        if (character === '`') {
            index++;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index = Math.min(index + 2, source.length);
                    continue;
                }
                if (source[index] === '`') {
                    index++;
                    break;
                }
                index++;
            }
            push_token(tokens, 'template', source, start, index);
            continue;
        }
        if (is_identifier_start(character)) {
            index++;
            while (is_identifier_part(source[index])) index++;
            const identifier = source.slice(start, index);
            const type: EditorTokenType = KEYWORDS.has(identifier)
                ? 'keyword'
                : LITERALS.has(identifier)
                  ? 'literal'
                  : 'plain';
            push_token(tokens, type, source, start, index);
            continue;
        }
        if (/[0-9]/.test(character) || (character === '.' && /[0-9]/.test(next))) {
            const match = source.slice(index).match(NUMBER_PATTERN);
            if (match) {
                index += match[0].length;
                push_token(tokens, 'number', source, start, index);
                continue;
            }
        }
        index++;
        push_token(tokens, 'plain', source, start, index);
    }
    return tokens;
}

export function highlight(value: unknown): string {
    return tokenize(value)
        .map((token) => {
            const escaped = escape_html(token.value);
            const class_name = TOKEN_CLASS[token.type];
            return class_name ? `<span class="${class_name}">${escaped}</span>` : escaped;
        })
        .join('');
}

export function get_line_count(value: unknown): number {
    const matches = String(value ?? '').match(/\r\n|\r|\n/g);
    return (matches?.length ?? 0) + 1;
}

export function get_line_numbers(value: unknown): number[] {
    return Array.from({ length: get_line_count(value) }, (_, index) => index + 1);
}

function ignored_character_map(source: string): Uint8Array {
    const ignored = new Uint8Array(source.length);
    for (const token of tokenize(source)) {
        if (token.type !== 'comment' && token.type !== 'string' && token.type !== 'template') continue;
        for (let index = token.start; index < token.end; index++) ignored[index] = 1;
    }
    return ignored;
}

function no_bracket_result(): BracketMatch {
    return { status: 'none', index: -1, matchIndex: -1, bracket: null, match: null, pair: null };
}

function unmatched_result(source: string, index: number): BracketMatch {
    return { status: 'unmatched', index, matchIndex: -1, bracket: source[index], match: null, pair: null };
}

function matched_result(source: string, index: number, match_index: number): BracketMatch {
    return {
        status: 'matched',
        index,
        matchIndex: match_index,
        bracket: source[index],
        match: source[match_index],
        pair: [Math.min(index, match_index), Math.max(index, match_index)],
    };
}

function find_forward_match(source: string, candidate: number, ignored: Uint8Array): number {
    const stack: string[] = [];
    for (let index = candidate; index < source.length; index++) {
        if (ignored[index]) continue;
        const character = source[index];
        if (OPEN_TO_CLOSE[character]) stack.push(character);
        else if (CLOSE_TO_OPEN[character]) {
            if (!stack.length || OPEN_TO_CLOSE[stack[stack.length - 1]] !== character) return -1;
            stack.pop();
            if (!stack.length) return index;
        }
    }
    return -1;
}

function find_backward_match(source: string, candidate: number, ignored: Uint8Array): number {
    const stack: string[] = [];
    for (let index = candidate; index >= 0; index--) {
        if (ignored[index]) continue;
        const character = source[index];
        if (CLOSE_TO_OPEN[character]) stack.push(character);
        else if (OPEN_TO_CLOSE[character]) {
            if (!stack.length || OPEN_TO_CLOSE[character] !== stack[stack.length - 1]) return -1;
            stack.pop();
            if (!stack.length) return index;
        }
    }
    return -1;
}

export function find_bracket_match(value: unknown, caret: number): BracketMatch {
    const source = String(value ?? '');
    let numeric_caret = Number(caret);
    if (!Number.isFinite(numeric_caret)) return no_bracket_result();
    numeric_caret = Math.max(0, Math.min(source.length, Math.trunc(numeric_caret)));

    const ignored = ignored_character_map(source);
    const candidates = numeric_caret < source.length ? [numeric_caret, numeric_caret - 1] : [numeric_caret - 1];
    const candidate = candidates.find(
        (possible) => possible >= 0 && BRACKETS.has(source[possible]) && !ignored[possible],
    );
    if (candidate === undefined) return no_bracket_result();

    const match_index = OPEN_TO_CLOSE[source[candidate]]
        ? find_forward_match(source, candidate, ignored)
        : find_backward_match(source, candidate, ignored);
    return match_index === -1 ? unmatched_result(source, candidate) : matched_result(source, candidate, match_index);
}

export function render_highlighted_source(value: unknown, bracket: BracketMatch): string {
    const source = String(value ?? '');
    const marked: Record<number, string> = {};
    if (bracket.index >= 0) {
        marked[bracket.index] =
            bracket.status === 'unmatched' ? 'ne-editor-bracket is-unmatched' : 'ne-editor-bracket is-origin';
    }
    if (bracket.matchIndex >= 0) marked[bracket.matchIndex] = 'ne-editor-bracket is-match';

    let html = tokenize(source)
        .map((token) => {
            let inner = '';
            let plain_start = token.start;
            for (let index = token.start; index < token.end; index++) {
                if (!marked[index]) continue;
                inner += escape_html(source.slice(plain_start, index));
                inner += `<span class="${marked[index]}">${escape_html(source[index])}</span>`;
                plain_start = index + 1;
            }
            inner += escape_html(source.slice(plain_start, token.end));
            const class_name = TOKEN_CLASS[token.type];
            return class_name ? `<span class="${class_name}">${inner}</span>` : inner;
        })
        .join('');
    if (!source || /(?:\r\n|\r|\n)$/.test(source)) html += ' ';
    return html;
}
