import type { NotationCategoryDefinition, NotationDefinition } from '@/notation-definition.ts';

export interface SourceValidationResult {
    valid: boolean;
    notation_ids: string[];
    category_ids: string[];
    errors: string[];
}

type Collected =
    | { kind: 'notation'; value: NotationDefinition<unknown> }
    | { kind: 'category'; value: NotationCategoryDefinition };

function validate_notation(def: NotationDefinition<unknown>): string[] {
    const errors: string[] = [];
    if (typeof def.id !== 'string' || def.id.trim() === '') errors.push('Notation id must be a non-empty string.');
    if (typeof def.name !== 'string' || def.name.trim() === '') errors.push(`Notation '${def.id}' needs a name.`);
    if (typeof def.display !== 'function' && (!def.display || typeof def.display.plain !== 'function')) {
        errors.push(`Notation '${def.id}' needs display or display.plain.`);
    }
    for (const field of ['is_limit', 'compare', 'FS', 'init'] as const) {
        if (typeof def[field] !== 'function') errors.push(`Notation '${def.id}' needs ${field}().`);
    }
    if (typeof def.init === 'function') {
        try {
            if (!Array.isArray(def.init())) errors.push(`Notation '${def.id}' init() must return an array.`);
        } catch (error) {
            errors.push(`Notation '${def.id}' init() failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return errors;
}

/**
 * Execute source with only the ne-rewritten registration API exposed.
 * No application registry is touched, so this is safe for preview and AI output.
 */
export function validate_notation_source(source: string): SourceValidationResult {
    const collected: Collected[] = [];
    const errors: string[] = [];
    if (typeof source !== 'string' || source.trim() === '') {
        return { valid: false, notation_ids: [], category_ids: [], errors: ['Source must be non-empty text.'] };
    }

    try {
        const fn = new Function(
            'register_notation',
            'register_category',
            `'use strict';\n${source}`,
        );
        fn(
            (value: NotationDefinition<unknown>) => collected.push({ kind: 'notation', value }),
            (value: NotationCategoryDefinition) => collected.push({ kind: 'category', value }),
        );
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }

    const notation_ids: string[] = [];
    const category_ids: string[] = [];
    const seen_notations = new Set<string>();
    const seen_categories = new Set<string>();
    for (const item of collected) {
        if (item.kind === 'category' && typeof item.value?.id === 'string') seen_categories.add(item.value.id);
    }
    for (const item of collected) {
        const id = item.value && typeof item.value.id === 'string' ? item.value.id : '';
        if (!id) {
            errors.push(`${item.kind} must provide a non-empty id.`);
            continue;
        }
        if (item.kind === 'notation') {
            if (seen_notations.has(id)) errors.push(`Duplicate notation id '${id}'.`);
            seen_notations.add(id);
            notation_ids.push(id);
            errors.push(...validate_notation(item.value));
        } else {
            if (category_ids.includes(id)) errors.push(`Duplicate category id '${id}'.`);
            category_ids.push(id);
            if (item.value.parent_id && !seen_categories.has(item.value.parent_id)) {
                errors.push(`Category '${id}' references parent '${item.value.parent_id}' before it is declared.`);
            }
            if (item.value.generator) {
                const generator = item.value.generator;
                if (!Number.isSafeInteger(generator.start) || !Number.isSafeInteger(generator.initial)) {
                    errors.push(`Generator category '${id}' needs safe integer start and initial values.`);
                }
                if (generator.initial < generator.start) {
                    errors.push(`Generator category '${id}' has initial below start.`);
                }
                if (typeof generator.create !== 'function') errors.push(`Generator category '${id}' needs create().`);
            }
        }
    }
    if (collected.length === 0 && errors.length === 0) errors.push('Source did not register a notation or category.');
    return { valid: errors.length === 0, notation_ids, category_ids, errors };
}
