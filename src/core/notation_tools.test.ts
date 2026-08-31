import { beforeAll, describe, expect, it } from 'vitest';
import { create_notation_tools, expand_notation, inspect_notation, list_notation_summaries } from '@/core/notation_tools';
import { validate_notation_source } from '@/core/source_validator';
import { get_notation, register_notation } from '@/core/registry';

const fixture = {
    id: 'notation-tools-fixture',
    name: 'Notation tools fixture',
    display: { plain: (value: number) => (value === Infinity ? 'Limit' : String(value)), from_display: (value: string) => (value === 'Limit' ? Infinity : Number(value)) },
    is_limit: (value: number) => value === Infinity,
    compare: (left: number, right: number) => left - right,
    FS: (value: number, index: number) => (value === Infinity ? index : Math.max(0, value - 1)),
    init: () => [Infinity, 0],
};

beforeAll(() => {
    register_notation(fixture);
});

describe('notation tools migration surface', () => {
    it('lists and inspects native ne-rewritten definitions', () => {
        const summaries = list_notation_summaries();
        expect(summaries.some((item) => item.id === fixture.id)).toBe(true);
        const inspection = inspect_notation(fixture.id);
        expect(inspection.id).toBe(fixture.id);
        expect(inspection.initial.length).toBeGreaterThan(0);
        expect(inspection.variants).toContain('FS');
    });

    it('expands a notation through the same core expander contract', () => {
        const result = expand_notation(fixture.id, 'Limit', 2, 'FS');
        expect(result.terms).toHaveLength(2);
        expect(result.terms[0].index).toBe(0);
    });

    it('exposes a tool-call shaped API', () => {
        const tools = create_notation_tools();
        expect(tools.list_notations().length).toBeGreaterThan(0);
        expect(tools.inspect_notation(fixture.id).id).toBe(fixture.id);
    });

    it('validates only the native register_notation/register_category format', () => {
        const valid = validate_notation_source(`
            register_notation({
                id: 'validator-test', name: 'Validator test',
                display: { plain: (x) => String(x) },
                is_limit: (x) => x === Infinity,
                compare: (a, b) => a - b,
                FS: (x) => x,
                init: () => [Infinity, 0],
            });
        `);
        expect(valid.valid).toBe(true);
        expect(valid.notation_ids).toEqual(['validator-test']);

        const legacy = validate_notation_source(`register.push({ id: 'legacy' });`);
        expect(legacy.valid).toBe(false);
        expect(legacy.errors.join('\n')).toMatch(/register|not defined/i);
    });

    it('accepts category declarations in source order independent of parent order', () => {
        const result = validate_notation_source(`
            register_category({ id: 'child-category', name: 'Child', parent_id: 'parent-category' });
            register_category({ id: 'parent-category', name: 'Parent' });
        `);
        expect(result.valid).toBe(true);
        expect(result.category_ids).toEqual(['child-category', 'parent-category']);
    });

    it('does not mutate the live registry while validating source', () => {
        expect(get_notation('validator-test')).toBeUndefined();
    });
});
