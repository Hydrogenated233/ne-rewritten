import { describe, expect, it } from 'vitest';
import { translate_pps } from '@/core/pps_translation.ts';

describe('PPS translation', () => {
    it('keeps the epsilon-zero special case from the source tools page', () => {
        expect(translate_pps('0, 1, 0, 2, 0, 3')).toContain('Cantor Normal Form: ε₀');
    });

    it('reports malformed input instead of producing partial output', () => {
        expect(() => translate_pps('0, nope')).toThrow('Invalid number');
        expect(() => translate_pps('')).toThrow('Please enter a PPS sequence');
    });

    it.each([
        ['0,1', '[0, 1]', 'ω'],
        ['0,1,0,1', '[0, 1, 2, 1]', 'ω^{ω+1}'],
        ['0,1,2,0,3', '[0, 1, 2, 3, 2]', 'ω^{ω^{ω+1}}'],
    ])('matches the source translator for %s', (input, standard, cantor) => {
        const output = translate_pps(input);
        expect(output).toContain(`PrSS Standard: ${standard}`);
        expect(output).toContain(`Cantor Normal Form: ${cantor}`);
    });
});
