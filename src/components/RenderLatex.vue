<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { get_katex, load_katex } from '@/composables/use_katex.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { escape_latex_fallback, render_latex } from '@/core/latex_renderer.ts';

const props = defineProps<{ latex: string }>();
const settings = inject(SETTINGS_KEY)!;

const ready = ref(false);

onMounted(() => {
    void load_katex().then(() => {
        ready.value = true;
    });
});

const html = computed(() => {
    const engine = get_katex();
    if (!ready.value || !engine) return escape_latex_fallback(props.latex);
    return render_latex(props.latex, settings.latex_commands, engine);
});
</script>

<template>
    <span class="render-latex" v-html="html"></span>
</template>

<style scoped>
.render-latex :deep(.katex) {
    font-size: 1.1em;
}
</style>
