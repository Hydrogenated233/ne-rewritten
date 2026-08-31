import { get_category, get_notation, list_notations } from '@/core/registry.ts';
import { init_dataset, type TreeNode } from '@/core/tree.ts';
import { resolve_display, type NotationDefinition, type TextSpec } from '@/notation-definition.ts';
import { validate_notation_source, type SourceValidationResult } from '@/core/source_validator.ts';

export interface NotationSummary {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    category_id?: string;
    has_diagram: boolean;
    has_equivalents: boolean;
}

export interface NotationInspection extends NotationSummary {
    category?: { id: string; name: TextSpec; parent_id?: string };
    initial: Array<{ expression: unknown; display: string }>;
    variants: string[];
    equivalent_ids: string[];
}

export interface ExpandToolResult {
    notation_id: string;
    variant: 'FS' | 'FS_alter' | 'FS_short';
    input: unknown;
    terms: Array<{ index: number; expression: unknown; display: string }>;
}

export interface InfChainOptions {
    limit_term?: number;
    max_steps?: number;
    max_n?: number;
    preview?: number;
    max_visited?: number;
}

export interface InfChainResult {
    start: unknown;
    found: boolean;
    chain: unknown[];
    visited: number;
    reason: 'INF' | 'LIMIT' | 'TERM';
}

export interface DiffOptions {
    max_n?: number;
    max_visited?: number;
    max_steps?: number;
    time_limit_ms?: number;
}

export interface DiffMismatch {
    expression: unknown;
    fs_index: number;
    left: unknown;
    right: unknown;
}

function display_plain<T>(notation: NotationDefinition<T>, expression: T): string {
    try {
        return String(resolve_display(notation.display).plain(expression));
    } catch {
        return String(expression);
    }
}

function parse_expression<T>(notation: NotationDefinition<T>, input: unknown): T {
    if (typeof input !== 'string') return input as T;
    const spec = resolve_display(notation.display);
    if (!spec.from_display) throw new Error(`Notation '${notation.id}' does not support parsing expressions.`);
    return spec.from_display(input);
}

function resolve_variant<T>(notation: NotationDefinition<T>, variant: string): (expression: T, index: number) => T {
    if (variant === 'FS_alter') return notation.FS_alter ?? notation.FS;
    if (variant === 'FS_short') return notation.FS_short ?? notation.FS;
    return notation.FS;
}

export function list_notation_summaries(): NotationSummary[] {
    return list_notations().map((notation) => ({
        id: notation.id,
        name: notation.name,
        simple_name: notation.simple_name,
        category_id: notation.category_id,
        has_diagram: notation.draw_diagram !== undefined,
        has_equivalents: notation.display_equiv !== undefined,
    }));
}

export function inspect_notation(id: string): NotationInspection {
    const notation = get_notation(id);
    if (!notation) throw new Error(`Unknown notation '${id}'.`);
    const category = notation.category_id ? get_category(notation.category_id) : undefined;
    const initial = notation.init().map((expression) => ({
        expression,
        display: display_plain(notation, expression),
    }));
    return {
        id: notation.id,
        name: notation.name,
        simple_name: notation.simple_name,
        category_id: notation.category_id,
        has_diagram: notation.draw_diagram !== undefined,
        has_equivalents: notation.display_equiv !== undefined,
        category: category
            ? { id: category.id, name: category.name, parent_id: category.parent_id }
            : undefined,
        initial,
        variants: ['FS', ...(notation.FS_alter ? ['FS_alter' as const] : []), ...(notation.FS_short ? ['FS_short' as const] : [])],
        equivalent_ids: notation.display_equiv ? Object.keys(notation.display_equiv) : [],
    };
}

export function expand_notation(
    id: string,
    input: unknown,
    count = 1,
    variant: 'FS' | 'FS_alter' | 'FS_short' = 'FS',
): ExpandToolResult {
    const notation = get_notation(id);
    if (!notation) throw new Error(`Unknown notation '${id}'.`);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
        throw new RangeError('Expansion count must be a safe integer in the range 1..1000.');
    }
    const expression = parse_expression(notation, input);
    const fs = resolve_variant(notation, variant);
    const terms: ExpandToolResult['terms'] = [];
    for (let index = 0; index < count; index++) {
        const result = fs(expression, index);
        terms.push({ index, expression: result, display: display_plain(notation, result) });
    }
    return { notation_id: id, variant, input: expression, terms };
}

export function detect_inf_chain<T>(notation: NotationDefinition<T>, options: InfChainOptions = {}): InfChainResult[] {
    const limit_term = options.limit_term ?? 6;
    const max_steps = options.max_steps ?? 50;
    const max_n = options.max_n ?? 1;
    const preview = options.preview ?? 8;
    const max_visited = options.max_visited ?? 2000;
    const fs = notation.FS;
    const results: InfChainResult[] = [];

    for (let fs_index = 0; fs_index < limit_term; fs_index++) {
        let sequence: T;
        try {
            sequence = fs(Infinity as T, fs_index);
        } catch {
            sequence = [1] as T;
        }
        const start_key = JSON.stringify(sequence);
        const parent_map = new Map<string, { parent: string | null; expression: T }>();
        const stack: Array<{ expression: T; steps: number }> = [{ expression: sequence, steps: 0 }];
        parent_map.set(start_key, { parent: null, expression: sequence });
        let visited = 0;
        let found = false;
        let limit_reached = false;
        let last_key = start_key;

        while (stack.length > 0) {
            const current = stack.pop()!;
            const key = JSON.stringify(current.expression);
            last_key = key;
            visited++;
            if (current.steps >= max_steps) {
                found = true;
                break;
            }
            if (visited >= max_visited) {
                limit_reached = true;
                break;
            }
            if (!Array.isArray(current.expression) || current.expression.length <= 1) continue;
            if (current.expression[current.expression.length - 1] === 1) {
                const next = current.expression.slice(0, -1) as T;
                const next_key = JSON.stringify(next);
                if (!parent_map.has(next_key)) {
                    parent_map.set(next_key, { parent: key, expression: next });
                    stack.push({ expression: next, steps: current.steps + 1 });
                }
                continue;
            }
            for (let n = 0; n <= max_n; n++) {
                try {
                    const next = fs(current.expression, n);
                    const next_key = JSON.stringify(next);
                    if (!parent_map.has(next_key)) {
                        parent_map.set(next_key, { parent: key, expression: next });
                        stack.push({ expression: next, steps: current.steps + 1 });
                    }
                } catch {
                    // One invalid branch must not hide the other branches.
                }
            }
        }

        const chain: unknown[] = [];
        let current_key: string | null = last_key;
        while (current_key && chain.length < preview) {
            const node = parent_map.get(current_key);
            if (!node) break;
            chain.unshift(node.expression);
            current_key = node.parent;
        }
        results.push({
            start: sequence,
            found,
            chain,
            visited,
            reason: found ? 'INF' : limit_reached ? 'LIMIT' : 'TERM',
        });
    }
    return results;
}

export function detect_inf_chain_by_id(id: string, options?: InfChainOptions): InfChainResult[] {
    const notation = get_notation(id);
    if (!notation) throw new Error(`Unknown notation '${id}'.`);
    return detect_inf_chain(notation, options);
}

export function diff_notations(left_id: string, right_id: string, options: DiffOptions = {}) {
    const left = get_notation(left_id);
    const right = get_notation(right_id);
    if (!left || !right) throw new Error('Both notation IDs must be registered.');
    const max_n = options.max_n ?? 3;
    const max_visited = options.max_visited ?? 200;
    const max_steps = options.max_steps ?? 10;
    const time_limit_ms = options.time_limit_ms ?? 3000;
    const queue: Array<{ expression: unknown; depth: number }> = [];
    const visited = new Set<string>();
    for (let index = 0; index <= max_n; index++) {
        try {
            const expression = left.FS(Infinity as never, index);
            const key = JSON.stringify(expression);
            if (!visited.has(key)) {
                visited.add(key);
                queue.push({ expression, depth: 0 });
            }
        } catch {
            // Ignore unsupported limit forms.
        }
    }
    const mismatches: DiffMismatch[] = [];
    const start = Date.now();
    let head = 0;
    while (head < queue.length && head < max_visited && mismatches.length < 50) {
        if (Date.now() - start > time_limit_ms) break;
        const current = queue[head++];
        if (current.depth >= max_steps) continue;
        for (let index = 0; index <= max_n; index++) {
            let left_result: unknown;
            let right_result: unknown;
            try {
                left_result = left.FS(current.expression as never, index);
            } catch {
                continue;
            }
            try {
                right_result = right.FS(current.expression as never, index);
            } catch {
                right_result = null;
            }
            if (JSON.stringify(left_result) !== JSON.stringify(right_result)) {
                mismatches.push({ expression: current.expression, fs_index: index, left: left_result, right: right_result });
            }
            for (const result of [left_result, right_result]) {
                if (result === null || result === undefined) continue;
                const key = JSON.stringify(result);
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ expression: result, depth: current.depth + 1 });
                }
            }
        }
    }
    return {
        left_id,
        right_id,
        total_visited: head,
        mismatches,
        timed_out: Date.now() - start > time_limit_ms,
    };
}

export function create_notation_tools() {
    return {
        list_notations: () => list_notation_summaries(),
        inspect_notation,
        expand: (args: { notation_id: string; expression: unknown; count?: number; variant?: 'FS' | 'FS_alter' | 'FS_short' }) =>
            expand_notation(args.notation_id, args.expression, args.count, args.variant),
        detect_inf_chain: (args: { notation_id: string; options?: InfChainOptions }) =>
            detect_inf_chain_by_id(args.notation_id, args.options),
        validate_source: (args: { source: string; file_name?: string }): SourceValidationResult =>
            validate_notation_source(args.source),
        diff_notations: (args: { left_id: string; right_id: string; options?: DiffOptions }) =>
            diff_notations(args.left_id, args.right_id, args.options),
    };
}

export function create_empty_tree<T>(notation: NotationDefinition<T>): TreeNode<T> {
    return init_dataset(notation);
}
