import { describe, expect, it } from 'vitest';
import { resolve_diagram, resolve_display, type NotationDefinition } from '@/notation-definition.ts';
import { UP1MN } from '@/notations/MN/UPMN/UP1MN.ts';
import { UP2MN_v1a } from '@/notations/MN/UPMN/UP2MN-v1a.ts';
import { UP2MN_v1b } from '@/notations/MN/UPMN/UP2MN-v1b.ts';
import { UP2MN_v1b_plus } from '@/notations/MN/UPMN/UP2MN-v1b-plus.ts';
import { UP2DBMS_v1 } from '@/notations/MN/UPMN/UP2DBMS-v1.ts';
import { UP2DBMS_v1b_plus } from '@/notations/MN/UPMN/UP2DBMS-v1b-plus.ts';
import { category_upmn_test } from '@/notations/MN/UPMN/categories.ts';
import { select_builtin_notation_sources } from '@/core/builtin_notation_sources.ts';
import main_source from '@/main.ts?raw';
import toolbar_source from '@/components/ExploreToolbar.vue?raw';
import settings_source from '@/components/SettingsBar.vue?raw';

const additions: NotationDefinition<any>[] = [UP2MN_v1b, UP2MN_v1b_plus, UP2DBMS_v1, UP2DBMS_v1b_plus];

describe('upstream round-five integration', () => {
    it('registers the new notations and trial category without renaming persisted IDs', () => {
        for (const name of ['UP2MN_v1b', 'UP2MN_v1b_plus', 'UP2DBMS_v1', 'UP2DBMS_v1b_plus']) {
            expect(main_source).toContain(`register_notation(${name})`);
        }
        expect(main_source).toContain('register_category(category_upmn_test)');
        expect(category_upmn_test.parent_id).toBe('category-upmn');
        expect(UP1MN.id).toBe('up1mn');
        expect(UP2MN_v1a.id).toBe('UP2MN-v1a');
        for (const n of [UP1MN, UP2MN_v1b_plus, UP2DBMS_v1]) expect(n.category_id).toBe('category-upmn');
        for (const n of [UP2MN_v1a, UP2MN_v1b, UP2DBMS_v1b_plus]) expect(n.category_id).toBe(category_upmn_test.id);
    });

    for (const notation of additions) {
        it(`${notation.id}: expands, compares and reverse-parses all FS variants`, () => {
            const display = resolve_display(notation.display);
            const [top, zero] = notation.init();
            expect(notation.compare(top, top)).toBe(0);
            expect(notation.compare(top, zero)).toBeGreaterThan(0);
            expect(notation.compare(zero, top)).toBeLessThan(0);
            for (const mode of ['FS', 'FS_alter', 'FS_short'] as const) {
                const fs = notation[mode]!;
                for (let seed = 0; seed < 4; seed++) {
                    const expr = fs(top, seed);
                    expect(notation.compare(expr, top)).toBeLessThan(0);
                    expect(display.from_display!(display.plain(expr))).toEqual(expr);
                    for (let index = 0; index < 4; index++) {
                        const child = fs(expr, index);
                        expect(display.from_display!(display.plain(child))).toEqual(child);
                        expect(notation.compare(child, expr)).toBeLessThan(0);
                    }
                }
            }
        });

        it(`${notation.id}: binds only explicitly supported equivalent renderers`, () => {
            const base = notation.draw_diagram!;
            const expr = notation.FS(notation.init()[0], 2);
            for (const name of ['layer', 'layer simple']) {
                const control = resolve_diagram(notation, name)!;
                const diagram = control.draw_diagram(expr, control.default_data);
                expect(diagram).toBeDefined();
                expect(diagram).toEqual(base.draw_diagram(expr, { ...base.default_data, current_equiv: 'layer' }));
            }
            for (const name of ['marked', 'simple', 'missing']) expect(resolve_diagram(notation, name)).toBeUndefined();
            if (notation.display_equiv?.UP1Y) {
                const control = resolve_diagram(notation, 'UP1Y')!;
                const diagram = control.draw_diagram(expr, control.default_data);
                expect(diagram).toBeDefined();
                expect(diagram).toEqual(base.draw_diagram(expr, { ...base.default_data, current_equiv: 'UP1Y' }));
            }
        });
    }

    it('includes each new notation in the built-in source selection', () => {
        const files = select_builtin_notation_sources(additions.map((n) => n.id));
        expect(files.map((file) => file.name).sort()).toEqual([
            'MN/UPMN/UP2DBMS-v1.ts', 'MN/UPMN/UP2DBMS-v1b-plus.ts',
            'MN/UPMN/UP2MN-v1b-plus.ts', 'MN/UPMN/UP2MN-v1b.ts',
        ].sort());
    });

    it('keeps lookup logs in the relocated toolbar without restoring the old settings UI', () => {
        expect(toolbar_source).toContain('lookup aborted.');
        expect(toolbar_source).toContain("console.error('import: failed to parse");
        expect(settings_source).not.toContain('function handle_find');
        expect(settings_source).toContain('validate_latex_commands');
    });
});
