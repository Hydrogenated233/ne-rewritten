<script setup lang="ts">
import { inject } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { use_diagram } from '@/composables/use_diagram.ts';
import { DiagramControl, DiagramControlSetting, resolve_name } from '@/notation-definition.ts';
import ModalDialog from './ModalDialog.vue';

const props = defineProps<{ control: DiagramControl<any, any> | null }>();

const t = inject(I18N_KEY)!;
const ui = use_ui_states();
const { diagram_data, active_control, update_setting } = use_diagram();

function label(s: DiagramControlSetting): string {
    return resolve_name(s.name, (id: string) => t(id)) ?? '';
}

/** 当前值: 仅当镜像属于本面板 control 时读取, 否则回退 default_data (防跨记号污染)。 */
function display_value(s: DiagramControlSetting): boolean | number {
    if (s.type === 'info') return false; // info 条目无 field_name, 不会进入此函数
    if (active_control.value === props.control) {
        const v = (diagram_data.value as any)?.[s.field_name];
        if (v !== undefined) return v as boolean | number;
    }
    return (props.control?.default_data as any)?.[s.field_name] as boolean | number;
}

function on_boolean_change(s: DiagramControlSetting, e: Event) {
    if (!props.control || s.type !== 'boolean') return;
    update_setting(props.control, s.field_name, (e.target as HTMLInputElement).checked);
}

function on_number_change(s: DiagramControlSetting, e: Event) {
    if (!props.control || s.type !== 'number') return;
    const raw = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    let v = raw;
    if (s.min !== undefined && v < s.min) v = s.min;
    if (s.max !== undefined && v > s.max) v = s.max;
    update_setting(props.control, s.field_name, v);
}
</script>

<template>
    <ModalDialog
        :show="ui.show_diagram_settings.value"
        :title="t('diagram.settings')"
        @close="ui.show_diagram_settings.value = false"
    >
        <div v-if="control" class="dgs-list">
            <template v-for="(s, i) in control.settings ?? []" :key="i">
                <label v-if="s.type === 'boolean'" class="dgs-item">
                    <input
                        type="checkbox"
                        :checked="display_value(s) === true"
                        @change="on_boolean_change(s, $event)"
                    />
                    <span>{{ label(s) }}</span>
                </label>
                <label v-else-if="s.type === 'number'" class="dgs-item">
                    <input
                        type="number"
                        class="dgs-number"
                        :value="display_value(s)"
                        :min="s.min"
                        :max="s.max"
                        @change="on_number_change(s, $event)"
                        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                    />
                    <span>{{ label(s) }}</span>
                </label>
                <div v-else class="dgs-info">{{ label(s) }}</div>
            </template>
        </div>
    </ModalDialog>
</template>

<style scoped>
.dgs-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 300px;
    padding: 8px 0;
}

.dgs-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--color-text);
    font-size: 14px;
}

.dgs-item input[type='checkbox'] {
    margin: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
}

.dgs-number {
    width: 90px;
}

.dgs-info {
    color: var(--color-text-secondary);
    font-size: 13px;
    padding: 2px 0;
}
</style>
