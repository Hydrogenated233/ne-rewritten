import type { NotationDefinition } from '@/notation-definition.ts';

export type PPSExpr = number[];
export type SecondPPSExpr = PPSExpr | number;

function is_limit_sentinel(expr: unknown): boolean {
    return expr === Infinity || (Array.isArray(expr) && expr.length === 1 && expr[0] === Infinity);
}

function limit(index: number): PPSExpr {
    const result: number[] = [];
    for (let i = 0; i <= index; i++) result.push(i);
    return result;
}

function compare_sequence(left: PPSExpr, right: PPSExpr): number {
    const common_length = Math.min(left.length, right.length);
    for (let i = 0; i < common_length; i++) {
        if (left[i] < right[i]) return -1;
        if (left[i] > right[i]) return 1;
    }
    return left.length - right.length;
}

function escape_html(value: unknown): string {
    return String(value).replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            default:
                return '&#39;';
        }
    });
}

function display_plain(expr: unknown): string {
    if (is_limit_sentinel(expr)) return 'Limit';
    return Array.isArray(expr) ? expr.join(',') : String(expr);
}

function display_html(expr: unknown): string {
    if (is_limit_sentinel(expr)) return 'Limit';
    if (!Array.isArray(expr)) return escape_html(expr);
    return expr
        .map((value, index) => `${escape_html(value)}<sub class="pps-column-index">${index + 1}</sub>`)
        .join('');
}

function display_latex(expr: unknown): string {
    if (is_limit_sentinel(expr)) return 'Limit';
    if (!Array.isArray(expr)) return String(expr);
    return expr.map((value, index) => `${value}_{\\color{gray}${index + 1}}`).join('');
}

function from_display_pps(value: string): PPSExpr {
    const source = value.trim();
    if (source === 'Limit' || source === 'Infinity' || source === '∞') return [Infinity];
    return source.split(',').map((part) => Number.parseInt(part.trim(), 10));
}

function make_pps4_parser(error_label: string): (value: string) => PPSExpr {
    return (value) => {
        const source = value.trim();
        if (source === 'Limit') return [Infinity];
        const result = source.split(',').map((part) => Number.parseInt(part.trim(), 10));
        if (result.some(Number.isNaN)) throw new Error(`Illegal ${error_label} sequence`);
        return result;
    };
}

function is_pps_limit(expr: PPSExpr): boolean {
    return expr.length > 0 && expr[expr.length - 1] > 0;
}

function expand_pps(seq: PPSExpr, fs_index: number): PPSExpr {
    const length = seq.length;
    const last = seq[length - 1];
    let bad_part: number[] = [];
    let width: number;
    let root_value: number | undefined;
    let has_bad_root = false;

    if (last >= 1 && last <= length) {
        root_value = seq[last - 1];
        bad_part = seq.slice(last, length - 1);
        width = length - last;
        has_bad_root = bad_part.some((value) => value === root_value);
    } else {
        width = length - last;
    }

    const result = seq.slice(0, -1);
    for (let i = 1; i <= fs_index; i++) {
        result.push(has_bad_root ? (root_value as number) : last - 1);
        result.push(...bad_part.map((value) => (value < last ? value : value + width * i)));
    }
    return result;
}

function pps_fs(expr: PPSExpr, fs_index: number): PPSExpr {
    if (is_limit_sentinel(expr)) return limit(fs_index);
    if (!Array.isArray(expr) || expr.length === 0) return [];
    return expand_pps(expr, fs_index);
}

type PPS4Kind = 'pps4' | 'weak' | 'third' | 'extremely-weak';

function expand_pps4(seq: PPSExpr, fs_index: number, kind: PPS4Kind): PPSExpr {
    if (seq.length === 0) return [];

    const y = seq.length;
    const x = seq[y - 1];
    if (x === 0 || x > y) return seq.slice(0, -1);

    const b = seq[x - 1];
    const width = y - x;
    let weak_expand = false;
    for (let column = x + 1; column < y; column++) {
        if (seq[column - 1] === b) {
            weak_expand = true;
            break;
        }
    }

    let value = b;
    let strong_expand = false;
    if (!weak_expand) {
        for (let index = x - 2; index >= b; index--) {
            const candidate = seq[index];
            const matches = kind === 'pps4' ? candidate <= b : candidate === b;
            if (matches) {
                value = index + 1;
                strong_expand = true;
                break;
            }
            if (kind === 'extremely-weak' && candidate < b) break;
        }
    }

    const total_length = y + fs_index * width;
    const result = seq.slice(0, y - 1);
    result.push(value);

    if (kind === 'third' && strong_expand) {
        for (let position = y + 1; position <= total_length; position++) {
            const is_last_copy = position > y && (position - y) % width === 0;
            if (is_last_copy) {
                const copy = (position - y) / width;
                result.push(value + copy * width);
                continue;
            }
            const source_position = position - width;
            const source_value = result[source_position - 1];
            result.push(source_value >= x ? source_value + width : source_value);
        }
        return result;
    }

    const start_column = y - width + 1;
    for (let column = start_column; result.length < total_length; column++) {
        const source_index = column - 1;
        if (source_index >= result.length) break;
        const source_value = result[source_index];
        result.push(source_value >= x ? source_value + width : source_value);
    }
    return result;
}

function make_pps4_fs(kind: PPS4Kind): (expr: PPSExpr, fs_index: number) => PPSExpr {
    return (expr, fs_index) => {
        if (is_limit_sentinel(expr)) return limit(fs_index);
        if (!Array.isArray(expr) || expr.length === 0) return [];
        return expand_pps4(expr, fs_index, kind);
    };
}

function spps_ensure_array(expr: unknown): PPSExpr | null {
    if (expr === Infinity) return [Infinity];
    if (Array.isArray(expr)) return expr;
    if (!expr || typeof expr !== 'object') return null;

    const result: number[] = [];
    for (const key in expr) {
        if (Object.prototype.hasOwnProperty.call(expr, key) && !Number.isNaN(Number.parseInt(key, 10))) {
            result.push((expr as Record<string, number>)[key]);
        }
    }
    return result;
}

function spps_is_infinity(expr: unknown): boolean {
    const sequence = spps_ensure_array(expr);
    return sequence !== null && sequence.length === 1 && sequence[0] === Infinity;
}

function spps_display_plain(expr: unknown): string {
    if (spps_is_infinity(expr)) return 'Limit';
    if (typeof expr === 'number') return String(expr);
    const sequence = spps_ensure_array(expr);
    if (sequence === null) return String(expr);
    if (sequence.length === 0) return '(empty)';
    return sequence.join(',');
}

function spps_display_html(expr: unknown): string {
    if (spps_is_infinity(expr)) return 'Limit';
    if (typeof expr === 'number') return display_html([expr]);
    const sequence = spps_ensure_array(expr);
    if (sequence === null) return String(expr);
    if (sequence.length === 0) return '(empty)';
    return display_html(sequence);
}

function spps_display_latex(expr: unknown): string {
    if (spps_is_infinity(expr)) return 'Limit';
    if (typeof expr === 'number') return display_latex([expr]);
    const sequence = spps_ensure_array(expr);
    if (sequence === null) return String(expr);
    if (sequence.length === 0) return '\\emptyset';
    return display_latex(sequence);
}

function spps_from_display(value: string): PPSExpr {
    const source = value === undefined || value === null ? '' : String(value).trim();
    if (!source || source === '(empty)') return [];
    if (/^(?:limit|infinity|∞)$/i.test(source)) return [Infinity];

    return source.split(',').map((part) => {
        const token = part.trim();
        if (/^w$/i.test(token)) return Infinity;
        const result = Number.parseInt(token, 10);
        if (Number.isNaN(result)) throw new Error('Illegal Second PPS4 sequence');
        return result;
    });
}

function spps_is_limit(expr: SecondPPSExpr): boolean {
    if (spps_is_infinity(expr)) return true;
    if (typeof expr === 'number') return expr > 0;
    return expr.length > 0 && expr[expr.length - 1] > 0;
}

function spps_compare(left: SecondPPSExpr, right: SecondPPSExpr): number {
    const left_sequence = typeof left === 'number' ? [left] : spps_ensure_array(left);
    const right_sequence = typeof right === 'number' ? [right] : spps_ensure_array(right);
    if (left_sequence === null || right_sequence === null) {
        if (left_sequence === right_sequence) return 0;
        return left_sequence === null ? -1 : 1;
    }
    return compare_sequence(left_sequence, right_sequence);
}

function expand_second_pps4(seq: PPSExpr, count: number): PPSExpr {
    const y = seq.length;
    const x = seq[y - 1];
    if (x === 0) return seq.slice(0, -1);
    if (x > y) throw new Error(`Last value ${x} is outside sequence length ${y}`);

    const b = seq[x - 1];
    const width = y - x;
    let value = b;
    let strong_expand = false;
    let found_less_or_equal = false;

    for (let column = y - 1; column >= x + 1; column--) {
        if (seq[column - 1] <= b) {
            found_less_or_equal = true;
            break;
        }
    }

    if (!found_less_or_equal) {
        for (let column = x - 1; column >= b + 1; column--) {
            if (seq[column - 1] === b) {
                value = column;
                strong_expand = true;
                break;
            }
        }
    }

    const total_length = y + count * width - 1;
    const result = new Array<number>(total_length);
    for (let index = 0; index < x; index++) result[index] = seq[index];
    for (let index = x; index < y - 1; index++) result[index] = seq[index];
    result[y - 1] = value;

    for (let index = x; index < y; index++) {
        const base_value = index === y - 1 ? value : seq[index];
        const copies = index === y - 1 ? count - 1 : count;
        for (let copy = 1; copy <= copies; copy++) {
            const position = index + copy * width;
            if (position >= total_length) continue;
            result[position] =
                (index === y - 1 && strong_expand) || base_value >= x ? base_value + copy * width : base_value;
        }
    }
    return result;
}

function second_pps_fs(expr: SecondPPSExpr, fs_index: number): SecondPPSExpr {
    if (!Number.isSafeInteger(fs_index) || fs_index < 0) {
        throw new Error('FS index must be a non-negative safe integer');
    }
    if (spps_is_infinity(expr)) return limit(fs_index);
    const sequence = typeof expr === 'number' ? [expr] : spps_ensure_array(expr);
    if (sequence === null || sequence.length === 0) return [];
    if (fs_index === 0) return sequence.slice(0, -1);
    return expand_second_pps4(sequence, fs_index);
}

const ordinary_display = {
    plain: display_plain,
    html: display_html,
    latex: display_latex,
};

const pps4_fs = make_pps4_fs('pps4');
const weak_pps4_fs = make_pps4_fs('weak');
const third_pps4_fs = make_pps4_fs('third');
const extremely_weak_pps4_fs = make_pps4_fs('extremely-weak');

export const pps: NotationDefinition<PPSExpr> = {
    id: 'pps',
    name: 'Parented predecessor sequence',
    category_id: 'category-pps',
    display: { ...ordinary_display, from_display: from_display_pps },
    is_limit: is_pps_limit,
    compare: compare_sequence,
    FS: pps_fs,
    init: () => [[Infinity], []],
};

function make_pps4_notation(
    id: string,
    name: string,
    error_label: string,
    fs: (expr: PPSExpr, fs_index: number) => PPSExpr,
): NotationDefinition<PPSExpr> {
    return {
        id,
        name,
        category_id: 'category-pps',
        display: { ...ordinary_display, from_display: make_pps4_parser(error_label) },
        is_limit: is_pps_limit,
        compare: compare_sequence,
        FS: fs,
        FS_alter: fs,
        init: () => [[Infinity], []],
    };
}

export const pps4 = make_pps4_notation('pps4', 'PPS4', 'PPS4', pps4_fs);
export const wpps4 = make_pps4_notation('wpps4', 'Weak PPS4', 'wPPS4', weak_pps4_fs);
export const tpps4 = make_pps4_notation('tpps4', 'Third PPS4', 'tPPS4', third_pps4_fs);
export const ewpps4 = make_pps4_notation('ewpps4', 'Extremely Weak PPS4', 'ewPPS4', extremely_weak_pps4_fs);

export const spps4: NotationDefinition<SecondPPSExpr> = {
    id: 'spps4',
    name: 'Second PPS4',
    category_id: 'category-pps',
    display: {
        plain: spps_display_plain,
        html: spps_display_html,
        latex: spps_display_latex,
        from_display: spps_from_display,
    },
    is_limit: spps_is_limit,
    compare: spps_compare,
    FS: second_pps_fs,
    FS_alter: second_pps_fs,
    FS_short: second_pps_fs,
    init: () => [[Infinity], []],
};
