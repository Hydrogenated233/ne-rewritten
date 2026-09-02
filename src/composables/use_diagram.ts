import { ref, shallowRef } from 'vue';
import type { Diagram } from '@/core/diagram_types.ts';
import { DiagramAction, DiagramControl } from '@/notation-definition.ts';

const diagram = ref<Diagram | null>(null);
const visible = ref(false);
const pos_x = ref(0);
const pos_y = ref(0);

// current_data 的响应式镜像, 供图表设置面板读写
const diagram_data = ref<any>(null);
// 仅用于引用比较, 不深包装 (ref 会把对象 reactive 化导致 proxy !== raw)
const active_control = shallowRef<DiagramControl<any, any> | null>(null);

let current_control: DiagramControl<any, any> | null = null;
let current_expr: any = null;
let current_data: any = null;
let active_source: unknown = null;

function refresh() {
    if (current_control && current_expr !== null) {
        diagram.value = current_control.draw_diagram(current_expr, current_data) ?? null;
    }
}

export function use_diagram() {
    function show<T>(control: DiagramControl<T, any>, expr: T, x: number, y: number, equiv?: string, source?: unknown) {
        if (current_control !== control) {
            current_data = { ...control.default_data };
            current_control = control;
        }
        // 若 data 有 current_equiv 字段，则同步传入的等价变体
        if (typeof current_data === 'object' && current_data && 'current_equiv' in current_data) {
            const new_equiv = equiv || undefined;
            if (current_data.current_equiv !== new_equiv) {
                current_data = { ...current_data, current_equiv: new_equiv };
            }
        }
        diagram_data.value = current_data;
        active_control.value = current_control;
        current_expr = expr;
        diagram.value = control.draw_diagram(expr, current_data) ?? null;
        active_source = source ?? null;
        pos_x.value = x;
        pos_y.value = y;
        visible.value = diagram.value !== null;
    }

    function hide(source?: unknown) {
        if (source !== undefined && active_source !== source) return;
        visible.value = false;
        active_source = null;
    }

    function move(x: number, y: number, source?: unknown) {
        if (source !== undefined && active_source !== source) return;
        pos_x.value = x;
        pos_y.value = y;
    }

    function is_active(source: unknown): boolean {
        return visible.value && active_source === source;
    }

    function dispatch_action(action: DiagramAction) {
        if (!current_control?.handle_action) return;
        const new_data = current_control.handle_action(current_data, action);
        if (new_data !== null) {
            current_data = new_data;
            diagram_data.value = current_data;
            refresh();
        }
    }

    /** 图表设置面板: 按 field_name 把用户输入写回 diagram data 并重绘。
     *  与 handle_action 一致, data 视为只读: 生成新对象而非原地修改。 */
    function update_setting(control: DiagramControl<any, any>, field_name: string, value: boolean | number) {
        if (current_control !== control) {
            current_control = control;
            current_data = { ...control.default_data };
            active_control.value = current_control;
        }
        current_data = { ...current_data, [field_name]: value };
        diagram_data.value = current_data;
        refresh();
    }

    return {
        diagram,
        visible,
        pos_x,
        pos_y,
        diagram_data,
        active_control,
        show,
        hide,
        move,
        is_active,
        dispatch_action,
        update_setting,
    };
}
