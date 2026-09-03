import { describe, expect, it } from 'vitest';
import PPS_FAMILY_SOURCE from '../../public/notations/PPS-family.js?raw';
import { select_builtin_notation_sources } from '@/core/builtin_notation_sources.ts';
import { validate_notation_source } from '@/core/source_validator.ts';
import { resolve_display, type NotationDefinition } from '@/notation-definition.ts';
import { category_pps } from '@/notations/PPS/categories.ts';
import { ewpps4, pps, pps4, spps4, tpps4, wpps4 } from '@/notations/PPS/PPS.ts';

type Sequence = number[];

const ordinary_pps_family = [pps, pps4, wpps4, tpps4, ewpps4];

function display_of<T>(notation: NotationDefinition<T>) {
    return resolve_display(notation.display);
}

function expect_limit_fundamental_sequence<T>(notation: NotationDefinition<T>, limit_expression: T) {
    expect(notation.init()).toEqual([[Infinity], []]);
    for (let index = 0; index <= 3; index++) {
        expect(notation.FS(limit_expression, index), notation.id + ' Limit FS(' + index + ')').toEqual(
            Array.from({ length: index + 1 }, (_, value) => value),
        );
    }
}

function expect_indexed_display<T>(notation: NotationDefinition<T>, expression: T, limit_expression: T) {
    const expected_html =
        '0<sub class="pps-column-index">1</sub>' +
        '10<sub class="pps-column-index">2</sub>' +
        '2<sub class="pps-column-index">3</sub>';
    const expected_latex = '0_{\\color{gray}1}10_{\\color{gray}2}2_{\\color{gray}3}';
    const display = display_of(notation);

    expect(display.plain(expression), notation.id + ' plain').toBe('0,10,2');
    expect(display.html(expression), notation.id + ' HTML').toBe(expected_html);
    expect(display.latex(expression), notation.id + ' LaTeX').toBe(expected_latex);
    expect(display.html(limit_expression), notation.id + ' Limit HTML').toBe('Limit');
    expect(display.latex(limit_expression), notation.id + ' Limit LaTeX').toBe('Limit');
}

function expect_canonical_parser<T>(notation: NotationDefinition<T>, expression: T, limit_expression: T) {
    const parse = display_of(notation).from_display;
    expect(parse, notation.id + ' parser').toBeDefined();
    expect(parse!('0, 10, 2'), notation.id + ' sequence parser').toEqual(expression);
    expect(parse!('Limit'), notation.id + ' Limit parser').toEqual(limit_expression);
}

describe('PPS notation family', () => {
    it('keeps the PPS category and all original notation identities', () => {
        expect(category_pps).toMatchObject({
            id: 'category-pps',
            name: 'Parented Predecessor Sequence (PPS)',
            simple_name: 'PPS',
        });
        expect([...ordinary_pps_family.map((notation) => notation.id), spps4.id]).toEqual([
            'pps',
            'pps4',
            'wpps4',
            'tpps4',
            'ewpps4',
            'spps4',
        ]);
        expect([...ordinary_pps_family.map((notation) => notation.category_id), spps4.category_id]).toEqual(
            Array(6).fill('category-pps'),
        );
        expect(spps4.name).toBe('Second PPS4');
    });

    it('uses the canonical Limit fundamental sequence in every PPS notation', () => {
        for (const notation of ordinary_pps_family) expect_limit_fundamental_sequence(notation, [Infinity]);
        expect_limit_fundamental_sequence(spps4, [Infinity]);
    });

    it('renders one-based PPS columns in HTML and LaTeX without altering plain text', () => {
        for (const notation of ordinary_pps_family) expect_indexed_display(notation, [0, 10, 2], [Infinity]);
        expect_indexed_display(spps4, [0, 10, 2], [Infinity]);
    });

    it('parses canonical PPS expressions and preserves supported Limit aliases', () => {
        for (const notation of ordinary_pps_family) expect_canonical_parser(notation, [0, 10, 2], [Infinity]);
        expect_canonical_parser(spps4, [0, 10, 2], [Infinity]);

        const pps_parse = display_of(pps).from_display!;
        expect(pps_parse('Infinity')).toEqual([Infinity]);
        expect(pps_parse('∞')).toEqual([Infinity]);

        const second_pps4_parse = display_of(spps4).from_display!;
        expect(second_pps4_parse('Infinity')).toEqual([Infinity]);
        expect(second_pps4_parse('∞')).toEqual([Infinity]);
        expect(second_pps4_parse('w')).toEqual([Infinity]);
    });

    it('keeps legacy display coercions and parser error labels at the API boundary', () => {
        const pps_display = display_of(pps) as any;
        const second_pps4_display = display_of(spps4) as any;

        expect(pps_display.plain(Infinity)).toBe('Limit');
        expect(pps_display.html(7)).toBe('7');
        expect(pps_display.latex(null)).toBe('null');
        expect(second_pps4_display.plain(null)).toBe('null');
        expect(second_pps4_display.html({ 0: 4, 1: 5 })).toBe(
            '4<sub class="pps-column-index">1</sub>5<sub class="pps-column-index">2</sub>',
        );
        expect(() => display_of(wpps4).from_display!('')).toThrow('Illegal wPPS4 sequence');
        expect(() => display_of(tpps4).from_display!('')).toThrow('Illegal tPPS4 sequence');
        expect(() => display_of(ewpps4).from_display!('')).toThrow('Illegal ewPPS4 sequence');
    });

    it('retains the original PPS predecessor expansion', () => {
        expect(pps.FS([0, 2], 0)).toEqual([0]);
        expect(pps.FS([0, 2], 3)).toEqual([0, 1, 1, 1]);
    });

    it('keeps the PPS4 strong, weak, third, and extremely weak branches distinct', () => {
        const strong_vs_weak = [0, 0, 1, 3];
        expect(pps4.FS(strong_vs_weak, 2)).toEqual([0, 0, 1, 2, 2, 2]);
        expect(wpps4.FS(strong_vs_weak, 2)).toEqual([0, 0, 1, 1, 1, 1]);
        expect(ewpps4.FS(strong_vs_weak, 2)).toEqual([0, 0, 1, 1, 1, 1]);
        expect(tpps4.FS(strong_vs_weak, 2)).toEqual([0, 0, 1, 1, 1, 1]);

        const extreme_weak_branch = [0, 1, 0, 1, 4];
        expect(pps4.FS(extreme_weak_branch, 2)).toEqual([0, 1, 0, 1, 3, 3, 3]);
        expect(wpps4.FS(extreme_weak_branch, 2)).toEqual([0, 1, 0, 1, 2, 2, 2]);
        expect(ewpps4.FS(extreme_weak_branch, 2)).toEqual([0, 1, 0, 1, 1, 1, 1]);
        expect(tpps4.FS(extreme_weak_branch, 2)).toEqual([0, 1, 0, 1, 2, 3, 4]);
    });
});

describe('Second PPS4 compatibility surface', () => {
    it('preserves its special empty displays, aliases, and finite 0,2 handling', () => {
        const display = display_of(spps4);
        const parse = display.from_display!;

        expect(display.plain([])).toBe('(empty)');
        expect(display.html([])).toBe('(empty)');
        expect(display.latex([])).toBe('\\emptyset');
        expect(parse('(empty)')).toEqual([]);
        expect(parse('0,2')).toEqual([0, 2]);
        expect(parse(' 0, 1x, +2, 3.9 ')).toEqual([0, 1, 2, 3]);
        expect(() => parse('1,,2')).toThrow(/Illegal Second PPS4 sequence/);

        expect(spps4.compare([], [0])).toBe(-1);
        expect(spps4.compare([0, 2], [Infinity])).toBe(-1);
        expect(spps4.FS([0, 2], 0)).toEqual([0]);
        expect(spps4.FS([0, 2], 3)).toEqual([0, 2]);
        expect(spps4.FS_alter).toBeDefined();
        expect(spps4.FS_short).toBeDefined();
        expect(spps4.FS_alter!([0, 1, 0, 2, 3], 2)).toEqual(spps4.FS([0, 1, 0, 2, 3], 2));
        expect(spps4.FS_short!([0, 1, 0, 2, 3], 2)).toEqual(spps4.FS([0, 1, 0, 2, 3], 2));
    });

    it('keeps the established Second PPS4 fundamental-sequence vectors', () => {
        expect(spps4.FS([], 7)).toEqual([]);
        expect(spps4.FS([0, 1, 0], 99)).toEqual([0, 1]);
        expect(spps4.FS([0, 1, 1, 1, 3], 2)).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
        expect(spps4.FS([0, 1, 0, 2, 3], 2)).toEqual([0, 1, 0, 2, 1, 2, 3, 2]);
        expect(spps4.FS([0, 1, 0, 4, 3], 2)).toEqual([0, 1, 0, 4, 1, 6, 3, 8]);
        expect(spps4.FS([0, 2, 1, 0, 1, 2, 5], 2)).toEqual([0, 2, 1, 0, 1, 2, 3, 2, 5, 2]);
        expect(spps4.FS([0, 1, 1, 1, 3, 4], 1)).toEqual([0, 1, 1, 1, 3, 3, 3]);
    });

    it('rejects invalid Second PPS4 expansion arguments', () => {
        expect(() => spps4.FS([0, 1, 0, 2, 3], -1)).toThrow(/non-negative safe integer/);
        expect(() => spps4.FS([0, 1, 0, 2, 3], 1.5)).toThrow(/non-negative safe integer/);
        expect(() => spps4.FS([0, 1, 0, 2, 3], Number.NaN)).toThrow(/non-negative safe integer/);
        expect(() => spps4.FS([0, 1, 4], 1)).toThrow(/outside sequence length/);
    });
});

describe('PPS-family standalone source', () => {
    it('is a self-contained native local-notation script', () => {
        const result = validate_notation_source(PPS_FAMILY_SOURCE);

        expect(PPS_FAMILY_SOURCE).not.toMatch(/^\s*(?:import|export)\s/m);
        expect(result).toEqual({
            valid: true,
            notation_ids: ['pps', 'pps4', 'wpps4', 'tpps4', 'ewpps4', 'spps4'],
            category_ids: ['category-pps'],
            errors: [],
        });
    });

    it('exports one executable family artifact for any selected PPS member', () => {
        const files = select_builtin_notation_sources(['pps4', 'spps4']);

        expect(files).toEqual([{ name: 'PPS-family.js', source: PPS_FAMILY_SOURCE }]);
    });
});
