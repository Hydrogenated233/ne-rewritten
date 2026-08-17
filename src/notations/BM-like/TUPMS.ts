import { Comparator, lex_compare, number_compare, tuple_lex_compare } from '@/utils.ts';
import { NotationDefinition } from '@/notation-definition.ts';
import {
    Column,
    column_add,
    column_compare,
    column_sub,
    column_truncate,
    column_verticals,
    compare,
    const_column,
    copy_column,
    display,
    Entry,
    Expr,
    from_display,
    index_after,
    INFINITY,
    infinity_FS,
    is_one,
    parents,
    to_vertical,
    Vertical,
    vertical_compare,
    ascension_threshold as TBM_ascension_threshold,
    ONE,
} from '@/notations/BM-like/TBM.ts';

export function expand_limit(m: Expr, index: number): Expr {
    const right = m.length - 1;
    const col = m[right];
    const last_idx = col.length - 1;
    const [v, h] = col[last_idx];
    const new_h = TUPMS.FS(h, index);
    const segs = to_vertical(new_h);
    const result = m.slice();
    const new_entries: Entry[] = col.slice(0, last_idx);
    for (const seg of segs) new_entries.push([v, seg]);
    result[right] = new_entries;
    return result;
}

function expand_successor(m: Expr, index: number): Expr {
    const V = m.map(column_verticals);
    const P = parents(m, V);
    const N = m.length - 1;
    const r = P[N][m[N].length - 1][0];
    const result = m.slice(0, N);

    const b: Vertical = m[N].length > 1 ? V[N][m[N].length - 2] : [];

    const offset: Column = column_sub(m[N], m[r]);

    const A = ascension_threshold(m, V, P, r, b);

    for (let w = 1; w <= index; w++) {
        for (let i = r; i < N; i++) {
            result.push(copy_column(m[i], offset, A[i], w));
        }
    }
    return result;
}

export function ascension_threshold(
    m: Expr,
    V: Vertical[][],
    P: [number, number][][],
    r: number,
    b: Vertical,
): Vertical[] {
    const right = m.length - 1;

    const A: Vertical[] = Array<Vertical>(r).fill([]);
    A[r] = b;

    // use min-heap to test columns in vertical order
    const A_delayed: [Vertical, boolean][] = [];
    const heap: number[] = [undefined!];

    for (let i = r + 1; i < m.length; i++) {
        heap.push(i);
        A_delayed[i] = [[], false];
    }

    function is_empty(): boolean {
        return heap.length === 1;
    }

    function top(): number {
        return heap[1];
    }

    function delayed_cmp(i: number, j: number) {
        return tuple_lex_compare<[Vertical, number]>(
            [A_delayed[i][0], i],
            [A_delayed[j][0], j],
            [vertical_compare, number_compare],
        );
    }

    function handle(i: number) {
        if (i <= 1) return;
        const j = Math.floor(i / 2);
        const cmp = delayed_cmp(heap[i], heap[j]);
        if (cmp < 0) {
            const tmp = heap[i];
            heap[i] = heap[j];
            heap[j] = tmp;

            handle(j);
        }
    }

    function pop(i: number = 1) {
        if (i === heap.length - 1) {
            heap.pop();
            return;
        }
        if (i * 2 >= heap.length) {
            const value = heap.pop()!;
            heap[i] = value;
            handle(i);
            return;
        }
        if (i * 2 + 1 === heap.length) {
            heap[i] = heap[i * 2];
            pop(i * 2);
            return;
        }
        const cmp = delayed_cmp(heap[i * 2], heap[i * 2 + 1]);
        const j = cmp < 0 ? i * 2 : i * 2 + 1;
        heap[i] = heap[j];
        pop(j);
    }

    function insert(key: number) {
        heap.push(key);
        handle(heap.length - 1);
    }

    const root_cache: Vertical[][] = [];

    while (!is_empty()) {
        const i = top();
        pop();
        const [prev_pos, vr] = A_delayed[i];
        delete A_delayed[i];
        if (!vr) {
            const j0 = index_after(V[i], prev_pos);

            for (let j = j0; j < V[i].length; j++) {
                const pos: Vertical = j === 0 ? [] : V[i][j - 1];
                const [col_p] = P[i][j];
                if (col_p < r) {
                    A[i] = pos;
                    break;
                }
                if (col_p === r) {
                    // delay for UPMS upgrading check

                    A_delayed[i] = [pos, true];
                    break;
                }

                const p_delayed: boolean = A[col_p] === undefined;
                const Ap = A[col_p] ?? A_delayed[col_p][0];

                if (vertical_compare(pos, Ap) >= 0) {
                    if (p_delayed) {
                        A_delayed[i] = [pos, false];
                    } else {
                        A[i] = pos;
                    }
                    break;
                }
                let new_pos = V[i][j];
                if (vertical_compare(new_pos, Ap) >= 0) {
                    if (p_delayed) {
                        A_delayed[i] = [Ap, false];
                    } else {
                        A[i] = Ap;
                    }
                    break;
                }
            }
            if (A[i] === undefined && A_delayed[i] === undefined) {
                A[i] = V[i][V[i].length - 1];
            }
        } else {
            let upgrading = false;

            do {
                // prev_pos is critical vertical: maximal vertical where parent is not root
                // ascension threshold is either crit vert or lnz-1.

                // if crit vert == 0, always upgrading
                if (prev_pos.length === 0) {
                    upgrading = true;
                    break;
                }

                // now compute upms test.
                // find X part
                const ji0 = index_after(V[i], prev_pos);
                const threshold_column: Column = column_add(column_truncate(m[i], prev_pos), const_column(1, prev_pos));
                threshold_column.push([m[i][ji0][0] + 1, ONE()]);
                threshold_column.push([m[i][ji0 + (m[i][ji0][1].length === 0 ? 1 : 0)][0], ONE()]);

                let X_end = i + 1;
                while (X_end < m.length) {
                    if (column_compare(m[X_end], threshold_column) >= 0) {
                        X_end++;
                    } else {
                        break;
                    }
                }
                if (X_end === m.length) {
                    upgrading = true;
                    break;
                }

                // find Y part
                const jr0 = index_after(V[r], prev_pos);
                const value_r = m[r][jr0]?.[0] ?? 0;
                const jt0 = index_after(V[right], prev_pos);
                const value_t = m[right][jt0][0];
                let Y_start = right;
                for (let k = 0; k < value_t - value_r - 1; k++) {
                    Y_start = P[Y_start][index_after(V[Y_start], prev_pos)][0];
                }

                const X_init = column_sub(column_truncate(m[i], prev_pos), m[r]);
                const Y_init = column_sub(column_truncate(m[Y_start], prev_pos), m[r]);
                const M = Math.max(m[i][0][0], m[Y_start][0][0]);
                for (const Xe of X_init) Xe[0] += M;
                for (const Ye of Y_init) Ye[0] += M;

                if (root_cache[Y_start] === undefined) {
                    root_cache[Y_start] = TBM_ascension_threshold(V, P, Y_start, b);
                }

                // upgrade if transformed Y > transformed X
                for (let k = 0; ; k++) {
                    if (Y_start + k > right) {
                        upgrading = true;
                        break;
                    }
                    if (i + k > X_end) {
                        upgrading = false;
                        break;
                    }

                    let X_threshold = A[i + k];
                    if (X_threshold === undefined || vertical_compare(X_threshold, prev_pos) > 0) {
                        X_threshold = prev_pos;
                    }
                    const X_transformed = column_add(m[i + k], column_truncate(Y_init, X_threshold));

                    let Y_threshold = root_cache[Y_start][Y_start + k];
                    if (vertical_compare(Y_threshold, prev_pos) > 0) Y_threshold = prev_pos;
                    const Y_transformed = column_add(m[Y_start + k], column_truncate(X_init, Y_threshold));

                    const cmp = column_compare(X_transformed, Y_transformed);
                    if (cmp !== 0) {
                        upgrading = cmp > 0;
                        break;
                    }
                }
            } while (false);

            A[i] = upgrading ? b : prev_pos;
        }

        if (A_delayed[i] !== undefined) insert(i);
    }

    return A;
}

export function expand(m: Expr, index: number): Expr {
    if (m.length === 0) return m;
    const N = m.length - 1;
    const last_col = m[N];
    if (last_col.length === 0) return m.slice(0, N);
    const [, last_height] = last_col[last_col.length - 1];
    if (is_one(last_height)) {
        return expand_successor(m, index);
    } else {
        return expand_limit(m, index);
    }
}

export function is_infinity(a: Expr): boolean {
    return a.length > 0 && a[0].length > 0 && a[0][0][0] === Infinity;
}

export const TUPMS: NotationDefinition<Expr> = {
    id: 'tupms',
    name: 'Transfinite UPMS',
    simple_name: 'TUPMS',
    category_id: 'category-bm-like',
    display: {
        plain: (m) => display(m, false),
        html: (m) => display(m, true),
        from_display,
    },
    is_limit: (m) => {
        if (is_infinity(m)) return true;
        if (m.length === 0) return false;
        return m[m.length - 1].length > 0;
    },
    compare,

    FS: (m, index) => {
        if (is_infinity(m)) {
            return infinity_FS(index);
        }
        if (m.length === 0) return m;
        return expand(m, index);
    },

    credit_text_id: 'credit.tupms',

    init: (): Expr[] => {
        return [INFINITY(), []];
    },
};
