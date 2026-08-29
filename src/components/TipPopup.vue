<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import type { Tip } from '@/core/tips.ts';

const props = defineProps<{ show: boolean; tip: Tip | null }>();
const emit = defineEmits<{ close: []; ignore: [id: string] }>();
const t = inject(I18N_KEY)!;

// 勾选"不再显示": 关闭时若为 true, 将该 tip id 通知父层写入 ignored_tip
const dont_show_again = ref(false);
// 换一条 tip 时重置勾选状态
watch(
    () => props.tip,
    () => {
        dont_show_again.value = false;
    },
);

function close() {
    if (props.tip && dont_show_again.value) emit('ignore', props.tip.id);
    emit('close');
}
</script>

<template>
    <ModalDialog :show="show" :title="t('tip.title')" @close="close">
        <div v-if="tip" class="tip-content">
            <div class="tip-body" v-html="t(tip.content)" />
            <div class="tip-footer">
                <label class="tip-ignore">
                    <input v-model="dont_show_again" type="checkbox" />
                    {{ t('tip.dont-show-again') }}
                </label>
                <button class="tip-close-btn" @click="close">{{ t('tip.close') }}</button>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.tip-content {
    max-width: 480px;
    line-height: 1.7;
    font-size: 14px;
    color: var(--color-text);
}
.tip-body {
    margin-bottom: 16px;
}
.tip-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.tip-ignore {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
}
.tip-close-btn {
    padding: 4px 16px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
}
.tip-close-btn:hover {
    background: var(--color-bg-hover);
}
.tip-content :deep(kbd) {
    display: inline-block;
    padding: 2px 6px;
    font-size: 12px;
    font-family: Consolas, monospace;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 1px 0 var(--color-border);
}
</style>
