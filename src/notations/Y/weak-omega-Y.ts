import {
    expand_weak_magma,
    Expr,
    INFINITY,
    is_infinity,
    seq_compare,
    sequence_display,
    sequence_from_display,
    to_dbms_display,
    y_diagram_control,
} from '@/notations/Y/Omega_Y.ts';
import { Y_FS_variants } from '@/notations/notation_utils.ts';
import { deepcopy } from '@/utils.ts';
import { NotationDefinition } from '@/notation-definition.ts';

function weak_is_limit(a: Expr): boolean {
    if (is_infinity(a)) return true;
    if (a.length < 2) return false;
    return a[a.length - 1] - a[a.length - 2] > 1;
}

function weak_expand(a: Expr, index: number): Expr {
    if (is_infinity(a)) return [1, index + 1];
    if (!weak_is_limit(a)) return a.slice(0, -1);
    return expand_weak_magma(a, index);
}

export const weak_omega_Y: NotationDefinition<Expr> = {
    id: 'weak-omega-y',
    name: 'Weak ω-Y (weak magma)',
    simple_name: 'weak ωY',
    category_id: 'category-y',
    display: {
        plain: sequence_display,
        from_display: sequence_from_display,
    },
    display_equiv: {
        DBMS: (s) => to_dbms_display(s, 'DBMS'),
        DBMS_MN: (s) => to_dbms_display(s, "DBMS'"),
        ADBMS: (s) => to_dbms_display(s, 'ADBMS'),
    },
    is_limit: weak_is_limit,
    compare: seq_compare,
    draw_diagram: y_diagram_control,
    ...Y_FS_variants(weak_expand, is_infinity, (index) => [1, index + 1], weak_is_limit, sequence_display),
    credit_text_id: 'credit.yukito',

    init: () => [INFINITY(), [1], []],
};
