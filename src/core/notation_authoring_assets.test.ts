import { afterEach, describe, expect, it } from 'vitest';
import API_DOC from '@/assets/api.md?raw';
import MAKING_GUIDE from '@/assets/making-a-notation.md?raw';
import DEV_GUIDE from '@/assets/notation-dev-guide.md?raw';
import TEMPLATE_SOURCE from '@/assets/template.js?raw';
import { AI_BUILTIN_CONTEXT } from '@/core/ai_context.ts';
import { get_category, get_notation } from '@/core/registry.ts';
import { LocalNotationRuntime } from '@/core/local_notation_runtime.ts';
import type { StorageLike } from '@/core/local_notation_store.ts';
import { validate_notation_source } from '@/core/source_validator.ts';
import { reload_all } from '@/core/user_defined_notation.ts';

class MemoryStorage implements StorageLike {
    readonly data = new Map<string, string>();

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
}

function collect_template(): { notations: any[]; categories: any[] } {
    const notations: any[] = [];
    const categories: any[] = [];
    const run = new Function('register_notation', 'register_category', `'use strict';\n${TEMPLATE_SOURCE}`);
    run((definition: any) => notations.push(definition), (definition: any) => categories.push(definition));
    return { notations, categories };
}

afterEach(() => reload_all([]));

describe('notation authoring assets', () => {
    it('ships documentation for only the native ne-rewritten registration contract', () => {
        for (const document of [MAKING_GUIDE, DEV_GUIDE, API_DOC]) {
            expect(document).toContain('register_notation');
            expect(document).toContain('register_category');
            expect(document).toContain('display.from_display');
            expect(document).toContain('init()');
            expect(document).not.toContain('register.push({');
            expect(document).not.toContain('analysis_register.push({');
        }
        expect(DEV_GUIDE).toContain('src/notations/');
        expect(DEV_GUIDE).toContain('?no-local-files');
        expect(AI_BUILTIN_CONTEXT).toContain(MAKING_GUIDE);
        expect(AI_BUILTIN_CONTEXT).toContain('template-prss-family');
    });

    it('validates the bundled PrSS and generated-family template', () => {
        const result = validate_notation_source(TEMPLATE_SOURCE);
        expect(result).toEqual({
            valid: true,
            notation_ids: ['template-prss'],
            category_ids: ['template-prss-examples', 'template-prss-family'],
            errors: [],
        });
    });

    it('keeps the PrSS parser, FS, and generated family executable', () => {
        const { notations, categories } = collect_template();
        const prss = notations.find((item) => item.id === 'template-prss');
        expect(prss.display.from_display('[1,2,3]')).toEqual([1, 2, 3]);
        expect(prss.display.from_display('∞')).toBe(Infinity);
        expect(prss.display.latex(Infinity)).toBe('\\mathrm{Limit}');
        expect(prss.display.latex([1, 2])).toBe('\\langle 1, 2 \\rangle');
        expect(prss.FS(Infinity, 3)).toEqual([1, 2, 3]);
        expect(prss.FS([1, 2], 2)).toEqual([1, 1]);
        expect(prss.init()).toEqual([Infinity, []]);

        const family = categories.find((item) => item.id === 'template-prss-family');
        expect(family.generator.start).toBe(1);
        expect(family.generator.initial).toBe(2);
        const generated = family.generator.create(3);
        expect(generated.category_id).toBe('template-prss-family');
        expect(generated.FS(Infinity, 2)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(generated.FS([1, 2], 2)).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it('loads the template through the real local notation lifecycle', () => {
        const runtime = new LocalNotationRuntime({ storage: new MemoryStorage(), createId: () => 'template-file' });
        const file = runtime.createTemplate('template.js', TEMPLATE_SOURCE);

        expect(get_notation('template-prss')).toBeUndefined();
        runtime.enable(file.id);

        expect(get_category('template-prss-examples')).toBeDefined();
        expect(get_category('template-prss-family')).toBeDefined();
        expect(get_notation('template-prss')).toBeDefined();
        expect(get_notation('template-prss-step-1')).toBeDefined();
        expect(get_notation('template-prss-step-2')).toBeDefined();
        expect(runtime.getNotationIds(file.id)).toEqual([
            'template-prss',
            'template-prss-step-1',
            'template-prss-step-2',
        ]);
    });
});
