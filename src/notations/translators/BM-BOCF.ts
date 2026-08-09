import { NotationDefinition } from '@/notation-definition.ts';
import { BM4, Expr, standardize } from '@/notations/BM-like/BM.ts';
import { make_OCN_display, merge_sum, type OCNDisplayIR } from '@/notations/OCN/OCN_utils.ts';
import { deepcopy, lex_compare, number_compare } from '@/utils.ts';

type OCF = [] | [OCF, OCF, OCF];

const ZERO: OCF = [];
const ONE: OCF = [[], [], []];

function iz(a: OCF): a is [] {
    return a.length == 0;
}

function compare(a: OCF, b: OCF): number {
    return lex_compare(a, b, compare);
}

function col_eq(a: number[], b: number[]): boolean {
    return lex_compare(a, b, number_compare) === 0;
}

function eq(a: OCF, b: OCF): boolean {
    return compare(a, b) === 0;
}

function lt(a: OCF, b: OCF): boolean {
    return compare(a, b) < 0;
}

function gt(a: any, b: any) {
    return compare(a, b) > 0;
}

function add(a: OCF, b: OCF): OCF {
    if (iz(a)) {
        return b;
    }
    if (iz(b)) {
        return a;
    }
    if (lt([a[0], a[1], []], [b[0], b[1], []])) {
        return b;
    }
    return [a[0], a[1], add(a[2], b)];
}

function suc(a: OCF): OCF {
    return add(a, ONE);
}

function sub(a: OCF, b: OCF): OCF {
    if (iz(a)) {
        return [];
    }
    if (iz(b)) {
        return a;
    }
    if (gt([a[0], a[1], []], [b[0], b[1], []])) {
        return a;
    }
    return sub(a[2], b[2]);
}

function s(a: OCF, b: OCF): [OCF, OCF] {
    if (iz(a)) {
        return [[], []];
    }
    if (lt([a[0], a[1], []], b)) {
        return [[], a];
    }
    return [[a[0], a[1], s(a[2], b)[0]], s(a[2], b)[1]];
}

function l(a: OCF): OCF {
    if (iz(a)) {
        return [];
    }
    if (iz(a[2])) {
        return a;
    }
    return l(a[2]);
}

function ttc(a: OCF, b: OCF): OCF {
    if (iz(a)) {
        return [];
    }
    if (iz(ttc(a[2], b)) && lt([a[0], a[1], []], [b, [], []])) {
        return [];
    }
    return [a[0], a[1], ttc(a[2], b)];
}

function exp(a: OCF): OCF {
    if (lt(a, [[], [ONE, [], []], []])) {
        return [[], a, []];
    }
    if (iz(a)) throw new Error('Illegal state');
    let p = s(a[1], [suc(a[0]), [], []])[0];
    return [a[0], add(p, sub(a, [a[0], p, []])), []];
}

function log(a: OCF): OCF {
    if (iz(a)) {
        return [];
    }
    let [p, q] = s(a[1], [suc(a[0]), [], []]);
    if (iz(a[0]) && iz(p)) {
        if (!lt(a[1], [[], [ONE, [], []], []])) {
            if (iz(q)) throw new Error('Illegal state');
            if (eq(log(q), q) && iz(q[2]) && lt(a[1], [ONE, [], []])) {
                return [a[0], a[1], []];
            }
        }
        return q;
    }
    let m = add([a[0], p, []], q);
    if (!lt(a[1], [a[0], [suc(a[0]), [], []], []])) {
        if (eq(log(a[1]), a[1]) && iz(a[2]) && lt(a[1], [suc(a[0]), [], []])) {
            return [a[0], a[1], []];
        }
    }
    return m;
}

function P(M: Expr, r: number, n: number): number {
    if (r == -1) {
        return n - 1;
    }
    let q = P(M, r - 1, n);
    while (q > -1 && M[q][r] >= M[n][r]) {
        q = P(M, r - 1, q);
    }
    return q;
}

function C(M: Expr, n: number): number[] {
    let X = [];
    for (let i = 0; i < M.length; i++) {
        if (P(M, 0, i) == n) {
            X.push(i);
        }
    }
    return X;
}

function D(M: Expr, n: number): number {
    let X = 0;
    for (let i = 0; i < M.length; i++) {
        if (P(M, 0, i) == n && M[i][1] > 0) {
            X++;
        }
    }
    return X;
}

function U(M: Expr, n: number): number {
    if (M[n][1] == 0 || M[n][2] == 1 || n + 1 == M.length) {
        return -1;
    }
    let m: number = P(M, 1, n);
    let L: number[] = [M[m][0] + 1, M[n][1], M[m][2] + 1];
    if (P(M, 1, n) == P(M, 1, n + 1) && col_eq(M[n + 1], L)) {
        return n + 1;
    }
    let q = n;
    while (q != -1) {
        q = P(M, 0, q);
        if (P(M, 1, n) == P(M, 1, q) && col_eq(M[q], L) && M[n + 1][0] > M[q][0]) {
            return q;
        }
    }
    return -1;
}

function v(M: Expr, n: number): OCF {
    if (M[n][1] == 0) {
        return [];
    }
    if (M[n][2] == 0) {
        let u = U(M, n) >= 0 ? l(v(M, U(M, n))) : ONE;
        return add(v(M, P(M, 1, n)), u);
    }
    let p = ONE;
    for (let i of C(M, n)) {
        if (!col_eq(M[i], [M[n][0] + 1, M[n][1], 1])) {
            continue;
        }
        let q: OCF = [];
        for (let j of C(M, i)) {
            q = add(q, o(M, j));
        }
        p = add(p, exp(q));
    }
    return add(v(M, P(M, 1, n)), exp(p));
}

function o(M: Expr, n: number): OCF {
    let S: OCF = [];
    let u = [...Array(M.length).keys()].map((x) => U(M, x));
    for (let i of C(M, n)) {
        if (col_eq(M[i], [M[n][0] + 1, M[n][1], 1])) {
            continue;
        }
        if (u.includes(i)) {
            let c = C(M, i);
            if (c.length) {
                if (col_eq(M[c.at(-1)!], [M[i][0] + 1, M[i][1], 1])) {
                    continue;
                }
            } else {
                continue;
            }
        }
        S = add(S, o(M, i));
    }
    return [v(M, n), S, []];
}

function _o(M: Expr): OCF {
    let S: OCF = [];
    for (let i = 0; i < M.length; i++) {
        if (col_eq(M[i], [0, 0, 0])) {
            S = add(S, o(M, i));
        }
    }
    return sf(S);
}

function NS(M: Expr): OCF {
    let S: OCF = [];
    for (let i = 0; i < M.length; i++) {
        if (col_eq(M[i], [0, 0, 0])) {
            S = add(S, o(M, i));
        }
    }
    return S;
}

function sp(a: OCF, b: OCF, c: OCF): OCF {
    if (iz(c)) {
        return [a, b, []];
    }
    if (lt(b, c[1]) && gt(c, [a, [], []])) {
        let t = ttc(c[1], suc(c[0]));
        // console.log(t);
        return sp(a, add(t, sub([c[0], c[1], []], [c[0], t, []])), c[2]);
    }
    return sp(a, add(b, [c[0], c[1], []]), c[2]);
}

function sf(a: OCF): OCF {
    if (iz(a)) {
        return [];
    }
    return add(sp(sf(a[0]), [], sf(a[1])), sf(a[2]));
}

// function createTable(X) {
//     return X.map(x => '<tr>' + x.map(y => '<td>' + y + '</td>').join('') + '</tr>').join('');
// }

function to_nat(q: OCF): number {
    if (iz(q)) {
        return 0;
    }
    if (iz(q[0]) && iz(q[1])) {
        return to_nat(q[2]) + 1;
    }
    throw new Error('not a natural number');
}

function to_IR(q: OCF): OCNDisplayIR {
    if (iz(q)) {
        return { type: 'number', value: 0 };
    }
    if (iz(q[0]) && iz(q[1])) {
        return { type: 'number', value: to_nat(q) };
    }
    let [a, b] = s(q, [q[0], q[1], []]);
    if (iz(a)) throw new Error('Illegal state');
    let m: OCNDisplayIR = { type: 'psi', sub: to_IR(a[0]), arg: to_IR(a[1]) };
    if (iz(a[1])) {
        m = { type: 'Omega', sub: to_IR(a[0]) };
    }
    if (iz(a[1]) && eq(a[0], ONE)) {
        m = { type: 'Omega' };
    }
    if (iz(a[0])) {
        m = { type: 'psi', arg: to_IR(a[1]) };
    }
    if (eq(a[0], []) && eq(a[1], ONE)) {
        m = { type: 'omega' };
    } else if (!eq(log([a[0], a[1], []]), [a[0], a[1], []])) {
        m = { type: 'omega', sup: to_IR(log(a)) };
    }
    //  else if(!le(l(a[1]),[suc(a[0]),[],[]])&&le(l(a[1]),[suc(a[0]),[suc(a[0]),[],[]],[]])){
    //    let [f,g]=s(a[1],[suc(a[0]),[suc(a[0]),[],[]],[]]);
    //  }
    function getCoef(x: [OCF, OCF, OCF]): number {
        if (iz(x[2])) {
            return 1;
        }
        return getCoef(x[2]) + 1;
    }

    if (getCoef(a) > 1) {
        m = { type: 'mul_nat', value: m, coe: getCoef(a) };
    }
    if (!iz(b)) {
        const b_ir = to_IR(b);
        m = b_ir.type === 'sum' ? merge_sum([m, ...b_ir.terms]) : merge_sum([m, b_ir]);
    }
    return m;
}
//
// function calculate() {
//     let M = document.getElementById('input').value;
//     try {
//         M = eval('[' + M.replaceAll(')(', '],[').replaceAll('(', '[').replaceAll(')', ']') + ']');
//     } catch (e) {
//         return;
//     }
//     M = M.map(x => {
//         let y = x.slice();
//         while (y.length < 3) {
//             y.push(0)
//         }
//         return y;
//     });
//     let A = [...Array(M.length).keys()].map(x => D(M, x));
//     if (Math.max(...A) > 15) {
//         document.getElementById('output').innerHTML = 'Too complex';
//         document.getElementById('output3').innerHTML = '';
//         let Q = '<tr><th class="border">i</th><th class="border" colspan=3>M<sub>i</sub></th><th class="border">o(M,i)</th><th class="border">v(M,i)</th><th class="border">U(M,i)</th><th class="border">Children</th>';
//         for (let i = 0; i < M.length; i++) {
//             Q += '<tr>';
//             let m = [i.toString(), '(' + M[i][0] + ',', M[i][1] + ',', M[i][2] + ')', '?', '?', '?', '?'];
//             for (let j = 0; j < m.length; j++) {
//                 if (j == 1 || j == 2 || j == 3) {
//                     Q += '<td class="nborder">';
//                 } else {
//                     Q += '<td class="border">';
//                 }
//                 Q += `${m[j]}</td>`;
//             }
//             Q += '</tr>';
//         }
//         Q += `<tr><td>Σ</td><td colspan=7>?</td></tr>`;
//         document.getElementById('output2').innerHTML = Q;
//         return;
//     }
//     document.getElementById('output').innerHTML = toString(_o(M));
//     document.getElementById('output3').innerHTML = (eq(NS(M), _o(M)) ? '' : '<i>n.s.</i> ' + toString(NS(M)));
//     let Q = '<tr><th class="border">i</th><th class="border" colspan=3>M<sub>i</sub></th><th class="border">o(M,i)</th><th class="border">v(M,i)</th><th class="border">U(M,i)</th><th class="border">Children</th>';
//     let u = [...Array(M.length).keys()].map(x => U(M, x));
//     for (let i = 0; i < M.length; i++) {
//         Q += '\n';
//         if (eq(M[i], [0, 0, 0])) {
//             Q += '<tr style="background-color:cyan">';
//         } else if (u.includes(i)) {
//             let c = C(M, i);
//             if (c.length) {
//                 if (eq(M[c.at(-1)], [M[i][0] + 1, M[i][1], 1])) {
//                     Q += '<tr style="color:#bbb;background-color:yellow">'
//                 } else {
//                     Q += '<tr style="background-color:lime">'
//                 }
//             } else {
//                 Q += '<tr style="color:#bbb;background-color:yellow">';
//             }
//         } else if (M[i][2] == 1 && eq(M[P(M, 0, i)], [M[i][0] - 1, M[i][1], 1])) {
//             Q += '<tr style="color:#bbb;">';
//         } else {
//             Q += '<tr>'
//         }
//         let m = [i.toString(), '(' + M[i][0] + ',', M[i][1] + ',', M[i][2] + ')', toString(o(M, i)), toString(v(M, i)), (U(M, i) != -1 ? U(M, i).toString() : '-'), C(M, i)];
//         for (let j = 0; j < m.length; j++) {
//             if (j == 1 || j == 2 || j == 3) {
//                 Q += '<td class="nborder">';
//             } else {
//                 Q += '<td class="border">';
//             }
//             Q += `${m[j]}</td>`;
//         }
//         Q += '</tr>';
//     }
//     Q += `<tr><td>Σ</td><td colspan=7>${toString(NS(M))}</td></tr>`;
//     document.getElementById('output2').innerHTML = Q;
// }

const EBO_IR: OCNDisplayIR = { type: 'constant', display: 'EBO', display_latex: '\\text{EBO}' };

export const LIMIT: Expr = [[], [1, 1, 1], [2, 1, 1], [3, 1], [2]];

export const Translator_BM_BOCF: NotationDefinition<Expr> = {
    id: 'translator-bm-bocf',
    name: 'BMS-BOCF (EBO)',
    category_id: 'category-translators',
    credit_text_id: 'credit.solarzone',

    display: BM4.display,
    FS: BM4.FS,
    FS_short: BM4.FS_short,
    FS_alter: BM4.FS_alter,
    is_limit: BM4.is_limit,
    compare: BM4.compare,
    init: () => [deepcopy(LIMIT), []],

    display_equiv: {
        OCF: make_OCN_display((e: Expr) => (BM4.compare(e, LIMIT) === 0 ? EBO_IR : to_IR(_o(standardize(e, 3))))),
        'n.s. OCF': make_OCN_display((e: Expr) =>
            BM4.compare(e, LIMIT) === 0 ? EBO_IR : to_IR(NS(standardize(e, 3))),
        ),
    },
};
