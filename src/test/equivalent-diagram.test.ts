import { describe, expect, it } from 'vitest';
import { resolve_diagram, resolve_display } from '@/notation-definition.ts';
import { BM4, TriangularBM4, seq_0Y } from '@/notations/BM-like/BM.ts';
import { y_diagram_control, y_display_equiv } from '@/notations/Y/Omega_Y.ts';
import { omega_MN } from '@/notations/MN/Omega_MN.ts';

describe('explicit equivalent diagrams', () => {
    it('does not substitute a 0Y or matrix renderer for 1Y', () => {
        for (const notation of [BM4, TriangularBM4, seq_0Y]) {
            expect(resolve_diagram(notation, '1Y')).toBeUndefined();
        }
    });

    it('does not invent renderers for unsupported or unknown equivalents', () => {
        expect(resolve_diagram(BM4)).toBe(BM4.draw_diagram);
        expect(resolve_diagram(BM4, 'simple')).toBeUndefined();
        expect(resolve_diagram(BM4, 'missing')).toBeUndefined();
        expect(resolve_diagram({ ...BM4, display_equiv: { raw: String } }, 'raw')).toBeUndefined();
    });

    it('converts triangular and non-triangular equivalent diagrams symmetrically', () => {
        const expr = resolve_display(BM4.display).from_display!('(0)(1)(2)(2)');
        const tri_expr = resolve_display(TriangularBM4.display).from_display!(
            resolve_display(BM4.display_equiv!['tri BMS']).plain(expr),
        );
        const tri_control = resolve_diagram(BM4, 'tri BMS')!;
        expect(tri_control).toBeDefined();
        expect(tri_control.draw_diagram(expr, tri_control.default_data))
            .toEqual(TriangularBM4.draw_diagram!.draw_diagram(tri_expr, TriangularBM4.draw_diagram!.default_data));
        const nt_control = resolve_diagram(TriangularBM4, 'nt BMS')!;
        expect(nt_control).toBeDefined();
        expect(nt_control.draw_diagram(tri_expr, nt_control.default_data))
            .toEqual(BM4.draw_diagram!.draw_diagram(expr, BM4.draw_diagram!.default_data));
    });

    it('binds each Y equivalent to its existing renderer mode, including DBMS_MN', () => {
        for (const [name, mode] of [['DBMS', 'DBMS'], ['DBMS_MN', "DBMS'"], ['ADBMS', 'ADBMS']]) {
            const control = resolve_diagram({ ...BM4, display_equiv: y_display_equiv } as any, name)!;
            const expr = [1, 2, 4, 8];
            expect(control.draw_diagram(expr, { ...control.default_data, current_equiv: name }))
                .toEqual(y_diagram_control.draw_diagram(expr, { current_equiv: mode }));
        }
    });

    it('keeps supported MN layer renderers but does not substitute diagrams for marked forms', () => {
        const expr = omega_MN.FS(omega_MN.init()[0], 2);
        for (const name of ['layer', 'layer simple']) {
            const control = resolve_diagram(omega_MN, name)!;
            expect(control.draw_diagram(expr, control.default_data))
                .toEqual(omega_MN.draw_diagram!.draw_diagram(expr, { current_equiv: 'layer' }));
        }
        expect(resolve_diagram(omega_MN, 'marked')).toBeUndefined();
    });
});
