import { NotationDefinition } from '@/notation-definition.ts';
import {
    dimension_difference,
    expand_weak_magma,
    Expr,
    INFINITY,
    is_infinity,
    is_limit,
    seq_compare,
    sequence_display,
    sequence_from_display,
    to_dbms_display,
    Vertical,
    vertical_increase,
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

function compute_skew_omega_y(index: number): Expr {
    const result: Expr = [1];

    let verticals: Vertical[] = [[]];
    let values: number[] = [1];

    for (let i = 0; i < index; i++) {
        let current: Vertical = [...Array<number>(i).fill(0), 1];

        const new_verticals: Vertical[] = [current];
        const new_values: number[] = [1];

        for (let j = 0; j < verticals.length; j++) {
            const v = verticals[j];
            const value = values[j];
            const d = dimension_difference(current, v);
            for (let k = d; k >= 0; k--) {
                new_verticals.push(k === 0 ? v : vertical_increase(v, k - 1));
                new_values.push(new_values[new_values.length - 1] + value);
            }
            current = v;
        }

        verticals = new_verticals;
        values = new_values;

        result.push(values[values.length - 1]);
    }

    return result;
}

export const omega_Y_skew: NotationDefinition<Expr> = create_variant_omega_y(
    'omega-y-skew',
    'Skew ω-Y',
    'Skew ωY',
    compute_skew_omega_y,
    [INFINITY(), [1], []],
);
