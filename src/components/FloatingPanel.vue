<script lang="ts">
let next_floating_panel_z_index = 20000;
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { app_storage } from '@/core/storage.ts';

const props = withDefaults(
    defineProps<{
        show: boolean;
        title: string;
        storageKey?: string;
        initialWidth?: number;
        initialHeight?: number;
        initialTop?: number;
        initialRight?: number;
        minWidth?: number;
        minHeight?: number;
        resizable?: boolean;
    }>(),
    {
        storageKey: '',
        initialWidth: 560,
        initialHeight: 0,
        initialTop: 72,
        initialRight: 24,
        minWidth: 300,
        minHeight: 180,
        resizable: false,
    },
);

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const x = ref(8);
const y = ref(props.initialTop);
const width = ref(props.initialWidth);
const height = ref(props.initialHeight);
const z_index = ref(++next_floating_panel_z_index);
const initialized = ref(false);

let drag_offset_x = 0;
let drag_offset_y = 0;
let dragging = false;
let resizing = false;
let resize_start_x = 0;
let resize_start_y = 0;
let resize_start_width = 0;
let resize_start_height = 0;
let resize_observer: ResizeObserver | null = null;

const panel_style = computed(() => ({
    left: `${x.value}px`,
    top: `${y.value}px`,
    width: `${width.value}px`,
    ...(height.value > 0 ? { height: `${height.value}px` } : {}),
    zIndex: z_index.value,
}));

function raise(): void {
    z_index.value = ++next_floating_panel_z_index;
}

function clamp_position(): void {
    const el = panel.value;
    const panel_width = el?.offsetWidth ?? width.value;
    const panel_height = el?.offsetHeight ?? Math.max(height.value, props.minHeight);
    x.value = Math.max(8, Math.min(x.value, Math.max(8, window.innerWidth - panel_width - 8)));
    y.value = Math.max(8, Math.min(y.value, Math.max(8, window.innerHeight - Math.min(panel_height, 80) - 8)));
}

function load_geometry(): void {
    width.value = Math.max(props.minWidth, Math.min(props.initialWidth, window.innerWidth - 16));
    height.value = props.initialHeight > 0 ? Math.max(props.minHeight, props.initialHeight) : 0;
    x.value = Math.max(8, window.innerWidth - width.value - props.initialRight);
    y.value = props.initialTop;

    if (props.storageKey) {
        try {
            const saved = JSON.parse(app_storage()?.getItem(props.storageKey) ?? 'null');
            if (saved && typeof saved === 'object') {
                if (Number.isFinite(saved.x)) x.value = saved.x;
                if (Number.isFinite(saved.y)) y.value = saved.y;
                if (Number.isFinite(saved.width)) width.value = Math.max(props.minWidth, saved.width);
                if (props.resizable && Number.isFinite(saved.height)) {
                    height.value = Math.max(props.minHeight, saved.height);
                }
            }
        } catch {
            // Ignore invalid or unavailable local storage.
        }
    }
    initialized.value = true;
}

function save_geometry(): void {
    if (!props.storageKey || !initialized.value) return;
    try {
        app_storage()?.setItem(
            props.storageKey,
            JSON.stringify({ x: x.value, y: y.value, width: width.value, height: height.value }),
        );
    } catch {
        // Position persistence is optional.
    }
}

function on_pointer_move(e: PointerEvent): void {
    if (!dragging) return;
    x.value = e.clientX - drag_offset_x;
    y.value = e.clientY - drag_offset_y;
    clamp_position();
}

function stop_drag(): void {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('pointermove', on_pointer_move);
    document.removeEventListener('pointerup', stop_drag);
    document.removeEventListener('pointercancel', stop_drag);
    save_geometry();
}

function start_drag(e: PointerEvent): void {
    if (e.button !== 0) return;
    raise();
    dragging = true;
    drag_offset_x = e.clientX - x.value;
    drag_offset_y = e.clientY - y.value;
    document.addEventListener('pointermove', on_pointer_move);
    document.addEventListener('pointerup', stop_drag);
    document.addEventListener('pointercancel', stop_drag);
}

function on_resize_move(e: PointerEvent): void {
    if (!resizing) return;
    const max_width = Math.max(props.minWidth, window.innerWidth - x.value - 8);
    const max_height = Math.max(props.minHeight, window.innerHeight - y.value - 8);
    width.value = Math.max(props.minWidth, Math.min(max_width, resize_start_width + e.clientX - resize_start_x));
    height.value = Math.max(props.minHeight, Math.min(max_height, resize_start_height + e.clientY - resize_start_y));
}

function stop_resize(): void {
    if (!resizing) return;
    resizing = false;
    document.removeEventListener('pointermove', on_resize_move);
    document.removeEventListener('pointerup', stop_resize);
    document.removeEventListener('pointercancel', stop_resize);
    save_geometry();
}

function start_resize(e: PointerEvent): void {
    if (e.button !== 0 || !panel.value) return;
    raise();
    resizing = true;
    resize_start_x = e.clientX;
    resize_start_y = e.clientY;
    resize_start_width = panel.value.offsetWidth;
    resize_start_height = panel.value.offsetHeight;
    document.addEventListener('pointermove', on_resize_move);
    document.addEventListener('pointerup', stop_resize);
    document.addEventListener('pointercancel', stop_resize);
}

function observe_panel(): void {
    resize_observer?.disconnect();
    const el = panel.value;
    if (!el || !props.resizable) return;
    resize_observer = new ResizeObserver(() => {
        if (!initialized.value || !panel.value) return;
        width.value = Math.max(props.minWidth, panel.value.offsetWidth);
        height.value = Math.max(props.minHeight, panel.value.offsetHeight);
        clamp_position();
        save_geometry();
    });
    resize_observer.observe(el);
}

watch(
    () => props.show,
    async (show) => {
        if (!show) return;
        if (!initialized.value) load_geometry();
        raise();
        await nextTick();
        clamp_position();
        observe_panel();
    },
    { immediate: true },
);

onMounted(() => window.addEventListener('resize', clamp_position));
onUnmounted(() => {
    stop_drag();
    stop_resize();
    resize_observer?.disconnect();
    window.removeEventListener('resize', clamp_position);
});
</script>

<template>
    <Teleport to="body">
        <section
            v-if="show"
            ref="panel"
            class="floating-panel"
            :class="{ 'floating-panel--resizable': resizable }"
            :style="panel_style"
            role="dialog"
            aria-modal="false"
            :aria-label="title"
            @pointerdown.capture="raise"
            @keydown.esc.stop="emit('close')"
        >
            <header class="floating-panel__header" @pointerdown.prevent="start_drag">
                <span class="floating-panel__title">{{ title }}</span>
                <button
                    type="button"
                    class="floating-panel__close"
                    :aria-label="title"
                    @pointerdown.stop
                    @click="emit('close')"
                >
                    ✕
                </button>
            </header>
            <div class="floating-panel__body">
                <slot />
            </div>
            <div
                v-if="resizable"
                class="floating-panel__resize-handle"
                aria-hidden="true"
                @pointerdown.stop.prevent="start_resize"
            />
        </section>
    </Teleport>
</template>

<style scoped>
.floating-panel {
    position: fixed;
    display: flex;
    flex-direction: column;
    min-width: v-bind('minWidth + "px"');
    min-height: v-bind('minHeight + "px"');
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    box-shadow: 0 8px 30px var(--color-shadow);
}

.floating-panel__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    min-height: 34px;
    padding: 6px 8px 6px 12px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-bg-secondary);
    cursor: grab;
    user-select: none;
    touch-action: none;
}

.floating-panel__header:active {
    cursor: grabbing;
}

.floating-panel__title {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.floating-panel__close {
    display: inline-flex;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font: inherit;
}

.floating-panel__close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.floating-panel__body {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    box-sizing: border-box;
}

.floating-panel__resize-handle {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border-right: 2px solid var(--color-text-muted);
    border-bottom: 2px solid var(--color-text-muted);
    cursor: nwse-resize;
    touch-action: none;
}

.floating-panel__resize-handle:hover {
    border-color: var(--color-text);
}
</style>
