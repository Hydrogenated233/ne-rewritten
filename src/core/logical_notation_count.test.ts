import { afterEach, describe, expect, it } from 'vitest';
import type { NotationCategoryDefinition } from '@/notation-definition.ts';
import { count_notation_items, init_generator, register_category, unregister_category } from '@/core/registry.ts';

const category: NotationCategoryDefinition = {
    id: 'logical-count-generator-fixture',
    name: 'Logical count fixture',
    generator: {
        start: 1,
        initial: 4,
        create: (n) => ({
            id: `logical-count-generated-${n}`,
            name: `Generated ${n}`,
            category_id: 'logical-count-generator-fixture',
            display: { plain: String },
            is_limit: () => false,
            compare: (a: number, b: number) => a - b,
            FS: (value: number) => value,
            init: () => [0],
        }),
    },
};

afterEach(() => unregister_category(category.id));

describe('logical notation count', () => {
    it('counts every instantiated member of one generated family as one item', () => {
        register_category(category);
        init_generator(category);

        expect(
            count_notation_items([
                'logical-count-generated-1',
                'logical-count-generated-2',
                'logical-count-generated-3',
                'logical-count-generated-4',
            ]),
        ).toBe(1);
    });

    it('still counts ordinary and unknown notation ids independently', () => {
        expect(count_notation_items(['ordinary-a', 'ordinary-b', 'ordinary-a'])).toBe(2);
    });
});
