<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import type { ColorSpec, Diagram, Rgba } from '@/core/diagram_types.ts';
import { css, resolve_color } from '@/core/diagram_utils.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { theme_palette } from '@/composables/use_color_theme.ts';

const props = defineProps<{ diagram: Diagram }>();
const canvas = ref<HTMLCanvasElement>();
const settings = inject(SETTINGS_KEY)!;
const palette = computed(() => theme_palette(settings.color_scheme));

/** ColorSpec → CSS 字符串; 缺省回退到主题文本色。 */
function color_css(spec: ColorSpec | undefined, fallback: Rgba): string {
    return css(resolve_color(spec, palette.value) ?? fallback);
}

function draw() {
    const cvs = canvas.value;
    if (!cvs) return;
    const d = props.diagram;
    if (d.width === 0 && d.height === 0) return;
    cvs.width = d.width;
    cvs.height = d.height;
    const ctx = cvs.getContext('2d')!;
    ctx.clearRect(0, 0, d.width, d.height);
    const text_color = palette.value.text;

    for (const el of d.elements) {
        if (el.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(el.x1, el.y1);
            ctx.lineTo(el.x2, el.y2);
            if (el.stroke) ctx.strokeStyle = color_css(el.stroke_color, text_color);
            if (el.width) ctx.lineWidth = el.width;
            ctx.stroke();
        } else if (el.type === 'circle') {
            ctx.beginPath();
            ctx.arc(el.x, el.y, el.r, 0, Math.PI * 2);
            if (el.fill) {
                ctx.fillStyle = color_css(el.fill_color, text_color);
                ctx.fill();
            }
            if (el.stroke) {
                ctx.strokeStyle = color_css(el.stroke_color, text_color);
                ctx.lineWidth = el.width ?? 1;
                ctx.stroke();
            }
        } else if (el.type === 'text') {
            ctx.fillStyle = color_css(el.fill_color, text_color);
            ctx.font = (el.size ?? 14) + 'px monospace';
            ctx.textAlign = el.align ?? 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.text, el.x, el.y);
        }
    }
}

watch(() => props.diagram, draw, { deep: true });
watch(() => settings.color_scheme, draw);
onMounted(draw);

function extra_style(t: Diagram['extra_text'][number]) {
    const style: Record<string, string> = {
        position: 'absolute' as const,
        left: t.x + 'px',
        top: t.y + 'px',
        fontSize: (t.size ?? 12) + 'px',
        color: color_css(t.color, palette.value.text),
        fontFamily: 'inherit',
        lineHeight: '1',
        whiteSpace: 'pre' as const,
        pointerEvents: 'none' as const,
    };
    if (t.align === 'left') {
        style.transform = 'translate(0,-0.3em)';
    } else if (t.align === 'center') {
        style.transform = 'translate(-50%,-0.3em)';
        style.textAlign = 'center';
    } else if (t.align === 'right') {
        style.transform = 'translate(-100%,-0.3em)';
        style.textAlign = 'right';
    }
    return style;
}
</script>

<template>
    <div class="diagram-wrapper" :style="{ position: 'relative', display: 'inline-block' }">
        <canvas ref="canvas" class="diagram-canvas" />
        <template v-for="(t, i) in diagram.extra_text" :key="i">
            <span v-if="t.display_html" :style="extra_style(t)" v-html="t.text"></span>
            <span v-else :style="extra_style(t)">{{ t.text }}</span>
        </template>
    </div>
</template>

<style scoped>
.diagram-canvas {
    display: block;
    margin: 4px 0;
}
</style>
