<script setup lang="ts">
defineProps<{
    show: boolean;
    title?: string;
    inline?: boolean;
    inlineClose?: boolean;
}>();

const emit = defineEmits<{
    close: [];
}>();

function on_overlay(e: MouseEvent) {
    if (e.target === e.currentTarget) emit('close');
}

function on_keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') emit('close');
}
</script>

<template>
    <div v-if="inline && show" class="modal-inline">
        <div v-if="title" class="modal-inline-header">
            <span class="modal-inline-title">{{ title }}</span>
            <button v-if="inlineClose" class="modal-inline-close" @mousedown="emit('close')">✕</button>
        </div>
        <div class="modal-inline-body">
            <slot />
        </div>
    </div>
    <Teleport v-else to="body">
        <div v-if="show" class="modal-overlay" @mousedown="on_overlay" @keydown="on_keydown" tabindex="-1">
            <div class="modal-dialog" @mousedown.stop>
                <div v-if="title" class="modal-header">
                    <span class="modal-title">{{ title }}</span>
                    <button class="modal-close" @mousedown="emit('close')">✕</button>
                </div>
                <div class="modal-body">
                    <slot />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(17, 24, 39, 0.55);
    z-index: 100000;
}
.modal-inline {
    width: 100%;
    box-sizing: border-box;
    margin: 12px 0 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--color-border-light);
}
.modal-inline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}
.modal-inline-title {
    color: var(--color-text);
    font-size: 15px;
    font-weight: 600;
    line-height: 22px;
}
.modal-inline-close {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 18px;
    line-height: 28px;
}
.modal-inline-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}
.modal-inline-body {
    width: 100%;
}
.modal-dialog {
    width: min(720px, 100%);
    min-width: min(300px, 100%);
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    box-sizing: border-box;
    border: 1px solid var(--color-border-light);
    border-radius: 7px;
    outline: none;
    background: var(--color-bg);
    color: var(--color-text);
    box-shadow: 0 16px 40px var(--color-shadow);
}
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px 0;
}
.modal-title {
    font-weight: 600;
    font-size: 15px;
    line-height: 22px;
}
.modal-close {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 20px;
    line-height: 28px;
}
.modal-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}
.modal-body {
    margin: 14px 0;
    padding: 0 18px 18px;
}
</style>
