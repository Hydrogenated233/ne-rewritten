import { ref } from 'vue';

const latex = ref('');
const visible = ref(false);
const pos_x = ref(0);
const pos_y = ref(0);
let active_source: unknown = null;

export function use_latex() {
    function show(input: string, x: number, y: number, source?: unknown) {
        if (input === '') {
            visible.value = false;
            active_source = null;
            return;
        }
        latex.value = input;
        pos_x.value = x;
        pos_y.value = y;
        active_source = source ?? null;
        visible.value = true;
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

    return { latex, visible, pos_x, pos_y, show, hide, move };
}
