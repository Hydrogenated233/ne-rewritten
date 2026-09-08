import { describe, expect, it } from 'vitest';
import { FsTrialExpansionError } from '@/core/errors.ts';
import { expand_item } from '@/core/expander.ts';
import { init_dataset } from '@/core/tree.ts';
import { resolve_display, resolve_display_name, type NotationDefinition } from '@/notation-definition.ts';
import { BM4 } from '@/notations/BM-like/BM.ts';
import { BBM } from '@/notations/BM-like/BBM.ts';
import { draw_diagram_control } from '@/notations/DEN/DEN2.ts';
import app_source from '@/App.vue?raw';
import equivalent_bar_source from '@/components/EquivalentNotationBar.vue?raw';
import diagram_settings_source from '@/components/DiagramSettingsPanel.vue?raw';
import main_source from '@/main.ts?raw';

describe('upstream round-one integration', () => {
    it('resolves migrated display names and retains legacy aliases', () => {
        const translate = (id: string) => `translated:${id}`;
        expect(resolve_display_name({ plain: String, name: 'Literal' }, translate)).toBe('Literal');
        expect(resolve_display_name({ plain: String, name: { id: 'label' } }, translate)).toBe('translated:label');
        expect(resolve_display_name({ plain: String, name_id: 'legacy' }, translate)).toBe('translated:legacy');
        expect(resolve_display_name(String, translate)).toBeUndefined();
        expect(resolve_display_name(BM4.display_equiv!.simple, translate)).toBe('translated:display.simple');
        expect(resolve_display_name(BM4.display_equiv!['0Y'], translate)).toBeUndefined();
        expect(equivalent_bar_source).toContain('resolve_display_name(spec, t)');
        expect(equivalent_bar_source).toContain('resolve_display_name(current.display, t)');
    });

    it('preserves tabs and local runtime while registering BBM and loading polyfills first', () => {
        expect(main_source.trimStart().startsWith("import '@/polyfills.ts'")).toBe(true);
        expect(main_source).toContain('register_notation(BBM)');
        expect(main_source).toContain('local_notation_runtime.boot()');
        const explore_start = app_source.indexOf('<section v-if="active_page === \'explore\'"');
        const explore_end = app_source.indexOf('</section>', explore_start);
        expect(explore_start).toBeGreaterThan(-1);
        expect(app_source).toContain('class="page-tabs"');
        expect(app_source.slice(explore_start, explore_end)).toContain('v-if="no_from_display_warning"');
        expect(app_source.slice(explore_start, explore_end)).toContain('<NotationPicker />');
    });

    it('supports fractional DEN diagram scaling', () => {
        const control = draw_diagram_control;
        const setting = control.settings!.find((item) => item.type === 'number' && item.field_name === 'scaling');
        expect(setting).toMatchObject({ min: 0.1, max: 1, step: 0.1 });
        expect(diagram_settings_source).toContain(':step="s.step ?? 1"');
        const expr: Parameters<typeof control.draw_diagram>[0] = [[1, [[1], [0]]], [1, [[2], [1], [0]]]];
        const full = control.draw_diagram(expr, { ...control.default_data, scaling: 1 })!;
        const half = control.draw_diagram(expr, { ...control.default_data, scaling: 0.5 })!;
        expect(half.width).toBeCloseTo(full.width / 2);
        expect(half.height).toBeCloseTo(full.height / 2);
    });

    it('can display and reverse-parse the new BBM initial expansion', () => {
        const display = resolve_display(BBM.display);
        const expr = BBM.FS(BBM.init()[0], 1);
        expect(display.from_display!(display.plain(expr))).toEqual(expr);
    });

    it('distinguishes trial exhaustion from a notation implementation failure', () => {
        const stalled: NotationDefinition<number> = {
            id: 'stalled',
            name: 'Stalled',
            display: String,
            init: () => [10, 0],
            is_limit: () => true,
            compare: (a, b) => a - b,
            FS: () => 0,
        };
        const root = init_dataset(stalled);
        expect(() => expand_item(root.children[0], stalled, 'FS', 0, 2)).toThrow(FsTrialExpansionError);
        expect(root.children[0].children).toHaveLength(0);
        const failure = new TypeError('notation failed');
        const broken = { ...stalled, FS: () => { throw failure; } };
        expect(() => expand_item(root.children[0], broken, 'FS', 0, 2)).toThrow(failure);
    });
});
