import { ref } from 'vue';

const latex = ref('');
const visible = ref(false);
const pos_x = ref(0);
const pos_y = ref(0);

export function use_latex() {
    function show(input: string, x: number, y: number) {
        if (input === '') {
            visible.value = false;
            return;
        }
        latex.value = input;
        pos_x.value = x;
        pos_y.value = y;
        visible.value = true;
    }

    function hide() {
        visible.value = false;
    }

    return { latex, visible, pos_x, pos_y, show, hide };
}
