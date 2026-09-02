import { describe, expect, it } from 'vitest';
import type { Diagram } from '../core/diagram_types.ts';
import type { DiagramControl } from '../notation-definition.ts';
import { use_diagram } from '../composables/use_diagram.ts';

const diagram_a: Diagram = { width: 10, height: 10, elements: [], extra_text: [] };
const diagram_b: Diagram = { width: 20, height: 20, elements: [], extra_text: [] };

function control(diagram: Diagram): DiagramControl<number, Record<string, never>> {
    return {
        default_data: {},
        draw_diagram: () => diagram,
    };
}

describe('floating diagram ownership', () => {
    it('ignores a stale hide from the previously hovered node', () => {
        const state = use_diagram();
        const source_a = {};
        const source_b = {};

        state.hide();
        state.show(control(diagram_a), 1, 10, 10, undefined, source_a);
        state.show(control(diagram_b), 2, 20, 20, undefined, source_b);
        state.hide(source_a);

        expect(state.visible.value).toBe(true);
        expect(state.diagram.value).toStrictEqual(diagram_b);

        state.hide(source_b);
        expect(state.visible.value).toBe(false);
    });

    it('does not mark an empty diagram as visible', () => {
        const state = use_diagram();
        const empty_control: DiagramControl<number, Record<string, never>> = {
            default_data: {},
            draw_diagram: () => undefined,
        };

        state.show(empty_control, 1, 0, 0, undefined, {});
        expect(state.visible.value).toBe(false);
        expect(state.diagram.value).toBeNull();
    });
});
