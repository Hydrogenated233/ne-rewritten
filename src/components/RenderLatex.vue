<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { get_katex, load_katex } from '@/composables/use_katex.ts';

const props = defineProps<{ latex: string }>();

const ready = ref(false);

onMounted(() => {
    void load_katex().then(() => {
        ready.value = true;
    });
});

const html = computed(() => {
    if (!ready.value) return props.latex;
    try {
        return get_katex()!.renderToString(props.latex, { throwOnError: false, displayMode: false });
    } catch {
        return props.latex;
    }
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
