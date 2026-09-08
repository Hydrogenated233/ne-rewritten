import { resolve_display, type NotationDefinition } from '@/notation-definition.ts';
import type { Variant } from '@/core/settings.ts';

export type OperationSequenceResult =
    | { status: 'found'; sequence: readonly number[] }
    | { status: 'limit' | 'unavailable' | 'cancelled' };

const MAX_STEPS = 2048;
const MAX_TRIALS = 20000;
const MAX_CACHE = 2000;
const cache = new WeakMap<NotationDefinition<any>, Map<string, OperationSequenceResult>>();

/** Find the canonical descent: at each limit choose the first FS term >= target. */
function* search<T>(
    notation: NotationDefinition<T>, target: T, variant: Variant, max_index: number,
): Generator<void, OperationSequenceResult> {
    try {
        const display = resolve_display(notation.display).plain;
        const initial = notation.init();
        if (!initial.length) return { status: 'unavailable' };
        // The notation's initial top represents Limit. Callers pass the base
        // definition for custom-initial variants, not the variant's edited init.
        let upper = initial[0];
        const key = display(target);
        const fs = notation[variant] ?? notation.FS;
        const sequence: number[] = [];
        const max = Number.isSafeInteger(max_index) && max_index >= 0 ? max_index : 10;
        let trials = 0;
        for (let step = 0; step <= MAX_STEPS; step++) {
            const upper_key = display(upper);
            if (upper_key === key) return { status: 'found', sequence };
            if (step === MAX_STEPS) return { status: 'limit' };
            const limit = notation.is_limit(upper);
            let descended = false;
            for (let index = 0; index <= (limit ? max : 0); index++) {
                if (++trials > MAX_TRIALS) return { status: 'limit' };
                const next = fs(upper, index);
                yield;
                const comparison = notation.compare(next, target);
                if (!Number.isFinite(comparison)) return { status: 'unavailable' };
                if (comparison < 0) continue;
                if (display(next) === upper_key || (step > 0 && !(notation.compare(next, upper) < 0))) {
                    return { status: 'unavailable' };
                }
                sequence.push(limit ? index : -1);
                if (comparison === 0) return { status: 'found', sequence };
                upper = next;
                descended = true;
                break;
            }
            if (!descended) return { status: limit ? 'limit' : 'unavailable' };
        }
    } catch {
        return { status: 'unavailable' };
    }
    return { status: 'limit' };
}

export function find_operation_sequence<T>(
    notation: NotationDefinition<T>, target: T, variant: Variant, max_index = 10,
): OperationSequenceResult {
    const task = search(notation, target, variant, max_index);
    let step = task.next();
    while (!step.done) step = task.next();
    return step.value;
}

/** Bound render-time work and yield between batches; cancelled requests never populate the cache. */
export async function request_operation_sequence<T>(
    notation: NotationDefinition<T>, target: T, variant: Variant, max_index = 10, signal?: AbortSignal,
): Promise<OperationSequenceResult> {
    if (signal?.aborted) return { status: 'cancelled' };
    let key: string;
    try {
        key = JSON.stringify([variant, max_index, resolve_display(notation.display).plain(target)]);
    } catch {
        return { status: 'unavailable' };
    }
    let entries = cache.get(notation);
    if (!entries) cache.set(notation, entries = new Map());
    const hit = entries.get(key);
    if (hit) return hit;
    const task = search(notation, target, variant, max_index);
    while (true) {
        if (signal?.aborted) return { status: 'cancelled' };
        const started = Date.now();
        for (let work = 0; work < 64; work++) {
            const step = task.next();
            if (step.done) {
                if (signal?.aborted) return { status: 'cancelled' };
                if (entries.size >= MAX_CACHE) entries.delete(entries.keys().next().value!);
                entries.set(key, step.value);
                return step.value;
            }
            if (Date.now() - started >= 4) break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}
