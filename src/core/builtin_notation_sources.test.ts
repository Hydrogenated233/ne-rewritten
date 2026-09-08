import { afterEach, describe, expect, it } from 'vitest';
import { select_builtin_notation_sources } from '@/core/builtin_notation_sources.ts';
import { BM4 } from '@/notations/BM-like/BM.ts';
import { category_BM_BHM } from '@/notations/BM-like/BHM.ts';
import { category_bm_like } from '@/notations/BM-like/categories.ts';
import { create_init_variant, register_category, register_notation, set_variant_state, unregister_category, unregister_notation } from '@/core/registry.ts';
import { omega } from '@/notations/Misc/Omega.ts';

afterEach(() => {
    unregister_category(category_bm_like.id);
    unregister_notation(omega.id);
    set_variant_state({});
});

describe('built-in notation source selection', () => {
    it('resolves a selected variant to its base source file', () => {
        register_notation(omega);
        const id = create_init_variant(omega.id, ['5', '0']).id!;
        expect(select_builtin_notation_sources([id]).map((file) => file.name)).toEqual(['Misc/Omega.ts']);
    });
    it('selects direct notation and generated-family source files once', () => {
        register_category(category_bm_like);
        register_notation(BM4);
        register_category(category_BM_BHM);

        const direct = select_builtin_notation_sources([BM4.id]);
        expect(direct.map((file) => file.name)).toEqual(['BM-like/BM.ts']);
        expect(direct[0].source).toContain('export const BM4');

        const generated = select_builtin_notation_sources(['1-bm-bhm', '2-bm-bhm']);
        expect(generated.map((file) => file.name)).toEqual(['BM-like/BHM.ts']);
        expect(generated[0].source).toContain('export const category_BM_BHM');
    });
});
