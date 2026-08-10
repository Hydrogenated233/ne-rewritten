import { NotationDefinition } from '@/notation-definition.ts';
import {
    expand_weak_magma,
    Expr,
    INFINITY,
    is_infinity,
    is_limit,
    seq_compare,
    sequence_display,
    sequence_from_display,
    to_dbms_display,
    y_diagram_control,
} from '@/notations/Y/Omega_Y.ts';
import { Y_FS_variants } from '@/notations/notation_utils.ts';
import { deepcopy } from '@/utils.ts';

function create_variant_omega_y(
    id: string,
    name: string,
    simple_name: string,
    infinity_FS: (index: number) => Expr,
    init: Expr[],
): NotationDefinition<Expr> {
    return {
        id,
        name,
        simple_name,
        category_id: 'category-y-variants',
        display: {
            plain: sequence_display,
            from_display: sequence_from_display,
        },
        display_equiv: {
            DBMS: (s) => to_dbms_display(s, 'DBMS'),
            DBMS_MN: (s) => to_dbms_display(s, "DBMS'"),
            ADBMS: (s) => to_dbms_display(s, 'ADBMS'),
        },
        is_limit,
        compare: seq_compare,
        draw_diagram: y_diagram_control,
        ...Y_FS_variants(expand_weak_magma, is_infinity, infinity_FS, is_limit, sequence_display),
        credit_text_id: 'credit.yukito',

        init: () => deepcopy(init),
    };
}

export const omega_Y_12omega: NotationDefinition<Expr> = create_variant_omega_y(
    'omega-y-12omega',
    'ω-Y (1,2,ω)',
    '12ωY',
    (index) => [1, 2, index + 4],
    [INFINITY(), [1, 2], [1], []],
);

export const omega_Y_1257omega: NotationDefinition<Expr> = create_variant_omega_y(
    'omega-y-1257omega',
    'ω-Y (1,2,5,7,ω)',
    '1257ωY',
    (index) => [1, 2, 5, 7, index + 12],
    [INFINITY(), [1, 2, 5, 7], [1], []],
);
