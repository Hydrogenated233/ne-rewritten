import { afterEach, describe, expect, it } from 'vitest';
import { select_builtin_notation_sources } from '@/core/builtin_notation_sources.ts';
import { BM4 } from '@/notations/BM-like/BM.ts';
import { category_BM_BHM } from '@/notations/BM-like/BHM.ts';
import { category_bm_like } from '@/notations/BM-like/categories.ts';
import { init_generator, register_category, register_notation, unregister_category } from '@/core/registry.ts';

afterEach(() => unregister_category(category_bm_like.id));

describe('built-in notation source selection', () => {
    it('selects direct notation and generated-family source files once', () => {
        register_category(category_bm_like);
        register_notation(BM4);
        register_category(category_BM_BHM);
        init_generator(category_BM_BHM);

        const direct = select_builtin_notation_sources([BM4.id]);
        expect(direct.map((file) => file.name)).toEqual(['BM-like/BM.ts']);
        expect(direct[0].source).toContain('export const BM4');

        const generated = select_builtin_notation_sources(['1-bm-bhm', '2-bm-bhm']);
        expect(generated.map((file) => file.name)).toEqual(['BM-like/BHM.ts']);
        expect(generated[0].source).toContain('export const category_BM_BHM');
    });
});
