<script setup lang="ts" generic="T">
import { computed, inject, shallowRef, watch } from 'vue';
import type { NotationDefinition } from '@/notation-definition.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { get_init_variant_meta, get_notation } from '@/core/registry.ts';
import { request_operation_sequence, type OperationSequenceResult } from '@/core/operation_sequence.ts';
import type { Variant } from '@/core/settings.ts';

const props = defineProps<{ notation: NotationDefinition<T>; expr: T; variant?: Variant }>();
const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const result = shallowRef<OperationSequenceResult | null>(null);
const label = computed(() => {
    const value = result.value;
    if (!value) return '...';
    if (value.status !== 'found') return '?';
    return value.sequence.length ? value.sequence.join(',') : '[]';
});
const title = computed(() => t(result.value?.status === 'limit' ? 'operation-sequence.limit'
    : result.value?.status === 'unavailable' ? 'operation-sequence.unavailable' : 'operation-sequence.label'));

watch([() => props.notation, () => props.expr, () => props.variant ?? settings.variant, () => settings.max_find_fs], async (_, __, cleanup) => {
    const controller = new AbortController();
    cleanup(() => controller.abort());
    result.value = null;
    const meta = get_init_variant_meta(props.notation.id);
    const base = meta ? get_notation(meta.base_id) : undefined;
    const variant = props.variant ?? settings.variant;
    const value = !meta
        ? await request_operation_sequence(props.notation, props.expr, variant, settings.max_find_fs, controller.signal)
        : base
          ? await request_operation_sequence(base, props.expr, variant, settings.max_find_fs, controller.signal)
          : { status: 'unavailable' as const };
    if (!controller.signal.aborted) result.value = value;
}, { immediate: true });
</script>

<template>
    <span class="operation-sequence" :title="title" :aria-label="`${t('operation-sequence.label')}: ${label}`">; {{ label }}</span>
</template>

<style scoped>
.operation-sequence {
    color: var(--color-text-secondary);
    font: inherit;
    white-space: normal;
    overflow-wrap: anywhere;
    min-width: 0;
}
</style>
