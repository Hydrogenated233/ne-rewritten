import { describe, expect, it } from 'vitest';
import {
    escape_html,
    find_bracket_match,
    get_line_count,
    get_line_numbers,
    highlight,
    tokenize,
} from '@/core/notation_editor';

describe('notation editor engine', () => {
    it('escapes and highlights JavaScript without changing the source coverage', () => {
        const source = 'const answer = 42; // <unsafe>\nif (answer) return "yes";\nlet x = true ?? null;';
        const html = highlight(source);
        expect(escape_html('<script data-x="a&b">\'x\'</script>')).toBe(
            '&lt;script data-x=&quot;a&amp;b&quot;&gt;&#39;x&#39;&lt;/script&gt;',
        );
        expect(html).toMatch(/ne-editor-token--keyword">const<\/span>/);
        expect(html).toMatch(/ne-editor-token--number">42<\/span>/);
        expect(html).toMatch(/ne-editor-token--comment">\/\/ &lt;unsafe&gt;<\/span>/);
        expect(html).not.toContain('<unsafe>');
        expect(tokenize(source).map((token) => token.value).join('')).toBe(source);
    });

    it('supports multiline tokens and common number forms', () => {
        const tokens = tokenize('/* a\nb */ `x ${ignored}` 0xff 0b10 1_000 2.5e-3');
        expect(tokens.filter((token) => token.type !== 'plain').map((token) => [token.type, token.value])).toEqual([
            ['comment', '/* a\nb */'],
            ['template', '`x ${ignored}`'],
            ['number', '0xff'],
            ['number', '0b10'],
            ['number', '1_000'],
            ['number', '2.5e-3'],
        ]);
    });

    it('keeps line numbers and bracket matching aligned with the source editor', () => {
        expect(get_line_count('')).toBe(1);
        expect(get_line_numbers('a\nb\n')).toEqual([1, 2, 3]);
        const source = 'call({ value: [1, 2] })';
        expect(find_bracket_match(source, 4)).toEqual({
            status: 'matched',
            index: 4,
            matchIndex: 22,
            bracket: '(',
            match: ')',
            pair: [4, 22],
        });
        expect(find_bracket_match('const x = [1, 2;', 10).status).toBe('unmatched');
        expect(find_bracket_match('const a = "("; // ]', 10).status).toBe('none');
    });
});
