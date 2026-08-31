<script setup lang="ts">
import { computed, defineAsyncComponent, inject, ref } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { expand_all_pending } from '@/core/analysis.ts';
import { resolve_display } from '@/notation-definition.ts';
import { COMPAT_URL, IS_COMPAT, IS_STANDALONE } from '@/core/deployment.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import ModalDialog from './ModalDialog.vue';
import DiagramSettingsPanel from './DiagramSettingsPanel.vue';
import StandaloneFilesPanel from './StandaloneFilesPanel.vue';

const StandaloneExportPanel = defineAsyncComponent(() => import('./StandaloneExportPanel.vue'));

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();
const { notation, root } = save_load;
const local_runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;

const settings_collapsed = ref(true);
const show_equiv_config = ref(false);
const has_diagram_settings = computed(() => (notation.value?.draw_diagram?.settings?.length ?? 0) > 0);
const font_options = ['DEFAULT', 'Comic Sans MS', 'Consolas', 'Microsoft YaHei UI'];
const DISPLAY_MODES = ['plain', 'html', 'latex'] as const;

// 用户记号恢复：页面加载时不自动加载，等用户确认后再执行
const user_scripts_recovered = ref(false);
const local_files = computed(() => {
    ui.registry_notifier.listen();
    try {
        return local_runtime.listFiles();
    } catch {
        return [];
    }
});
const has_pending_scripts = computed(
    () => !user_scripts_recovered.value && local_files.value.some((file) => file.enabled && file.trusted),
);

function resume_scripts(): void {
    local_runtime.boot();
    user_scripts_recovered.value = true;
    ui.registry_notifier.notify();
}

function disable_all(): void {
    for (const file of local_files.value) {
        if (file.enabled) {
            try {
                local_runtime.disable(file.id);
            } catch (error) {
                console.warn(`Could not disable ${file.name}.`, error);
            }
        }
    }
    user_scripts_recovered.value = true;
    ui.registry_notifier.notify();
}

interface EquivOption {
    id: string;
    label: string;
}

const equiv_options = computed<EquivOption[]>(() => {
    const n = notation.value;
    if (!n?.display_equiv) return [];
    return Object.keys(n.display_equiv).map((id) => {
        const spec = n.display_equiv![id];
        const name_id = typeof spec !== 'function' && spec.name_id ? spec.name_id : undefined;
        return { id, label: name_id ? t(name_id) : id };
    });
});

const tier_name = computed(() => {
    const ti = settings.tier;
    const key = 'tier.' + ti;
    const label = t(key);
    if (label !== key) return label;
    return ti + '-fold expansion';
});

function toggle_diagram() {
    settings.show_diagram = !settings.show_diagram;
    if (settings.show_diagram) settings.show_latex = false;
}

function on_show_description_change(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    settings.show_description = checked;
    ui.description_visible.value = checked;
}

function handle_expand_all() {
    const n = notation.value;
    const r = root.value;
    if (!n || !r) return;
    expand_all_pending(r, n, settings.variant, settings.max_find_fs);
}

function on_expand_all_import_change(e: Event) {
    settings.expand_all_on_import = (e.target as HTMLInputElement).checked;
}

function toggle_latex() {
    settings.show_latex = !settings.show_latex;
    if (settings.show_latex) settings.show_diagram = false;
}

function go_compat() {
    location.href = COMPAT_URL;
}

function toggle_display_mode() {
    const idx = DISPLAY_MODES.indexOf(settings.display_mode);
    settings.display_mode = DISPLAY_MODES[(idx + 1) % DISPLAY_MODES.length];
}

</script>

<template>
    <div class="settings-box">
        <div class="toolbar">
            <div class="toolbar-row">
                <span
                    style="margin-right: 8px"
                    @mouseenter="settings.notation_name_mode === 'full' && ui.start_flash()"
                    @mouseleave="ui.stop_flash"
                >
                    {{ t('notation-name.mode-label') }}
                    <button
                        class="toggle-btn"
                        @mousedown="
                            settings.notation_name_mode = settings.notation_name_mode === 'full' ? 'simple' : 'full'
                        "
                    >
                        {{ t('notation-name.' + settings.notation_name_mode) }}
                    </button>
                </span>
                <span style="margin-left: 12px">
                    {{ t('config-display.label') }}
                    <button class="toggle-btn" @mousedown="ui.toggle_config_mode()">
                        {{ t('config-display.configure') }}
                    </button>
                </span>
                <span style="margin-left: 12px">
                    {{ t('nav-mode.label') }}
                    <button
                        class="toggle-btn"
                        @mousedown="settings.nav_mode = settings.nav_mode === 'grouped' ? 'flat' : 'grouped'"
                    >
                        {{ t('nav-mode.' + settings.nav_mode) }}
                    </button>
                </span>
            </div>
            <div class="toolbar-row">
                <span style="margin-right: 8px">
                    {{ t('display.label') }}
                    <button class="toggle-btn" @mousedown="toggle_display_mode">
                        {{ t('display.' + settings.display_mode) }}
                    </button>
                </span>
                <label>
                    {{ t('fs-variant.label') }}
                    <select v-model="settings.variant" @mousedown.stop>
                        <option value="FS">{{ t('fs-variant.normal') }}</option>
                        <option value="FS_alter">{{ t('fs-variant.alternative') }}</option>
                        <option value="FS_short">{{ t('fs-variant.short') }}</option>
                    </select>
                </label>
                <span v-if="equiv_options.length > 0" style="margin-left: 8px">
                    <label>
                        {{ t('equiv.label') }}
                        <select
                            :value="settings.equiv_active[settings.current_notation_id] ?? ''"
                            @mousedown.stop
                            @change="
                                (e: any) => {
                                    settings.equiv_active = {
                                        ...settings.equiv_active,
                                        [settings.current_notation_id]:
                                            (e.target as HTMLSelectElement).value || undefined,
                                    };
                                }
                            "
                        >
                            <option value="">(None)</option>
                            <option v-for="k in equiv_options" :key="k.id" :value="k.id">
                                {{ k.id }}
                            </option>
                        </select>
                    </label>
                    <label style="margin-left: 8px" v-if="settings.equiv_active[settings.current_notation_id]">
                        <input
                            type="checkbox"
                            :checked="settings.equiv_hide_original[settings.current_notation_id] ?? true"
                            @change="
                                (e: any) => {
                                    settings.equiv_hide_original = {
                                        ...settings.equiv_hide_original,
                                        [settings.current_notation_id]: (e.target as HTMLInputElement).checked,
                                    };
                                }
                            "
                        />
                        {{ t('equiv.hide-original') }}
                    </label>
                    <span style="margin-left: 8px" v-if="equiv_options.length > 0">
                        {{ t('equiv.extra') }}
                        <button class="toggle-btn" @mousedown="show_equiv_config = true">
                            {{ t('equiv.extra-configure') }}
                        </button>
                    </span>
                </span>
                <label>
                    <input type="checkbox" :checked="settings.show_description" @change="on_show_description_change" />
                    {{ t('description.show-default') }}
                </label>
            </div>
            <div class="toolbar-row">
                <label v-if="notation?.draw_diagram">
                    <input type="checkbox" :checked="settings.show_diagram" @change="toggle_diagram" />
                    {{ t('diagram.show') }}
                </label>
                <button
                    v-if="settings.show_diagram && has_diagram_settings"
                    class="diagram-settings-btn"
                    @mousedown="ui.show_diagram_settings.value = true"
                >
                    {{ t('diagram.settings') }}
                </button>
                <label>
                    <input type="checkbox" :checked="settings.show_latex" @change="toggle_latex" />
                    {{ t('latex.show') }}
                </label>
                <button @mousedown="ui.show_latex_analysis.value = true">{{ t('latex-analysis.title') }}</button>
            </div>
            <div class="toolbar-row">
                <button @mousedown="ui.show_color_theme.value = true">{{ t('toolbar.theme') }}</button>
                <button v-if="!IS_COMPAT" @mousedown="go_compat">{{ t('toolbar.compat') }}</button>
                <StandaloneExportPanel v-if="!IS_STANDALONE" />
            </div>
            <StandaloneFilesPanel v-if="IS_STANDALONE" />
            <div class="toolbar-row">
                <span>{{ t('expand-all.label') }}</span>
                <button @mousedown="handle_expand_all">{{ t('expand-all.expand') }}</button>
                <label>
                    <input
                        type="checkbox"
                        :checked="settings.expand_all_on_import"
                        @change="on_expand_all_import_change"
                    />
                    {{ t('expand-all.on-import') }}
                </label>
                <label>
                    {{ t('find-notation.max-fs') }}
                    <input
                        type="number"
                        min="1"
                        max="9999"
                        v-model.number="settings.max_find_fs"
                        style="width: 60px; vertical-align: middle"
                    />
                </label>
            </div>
            <div class="toolbar-row">
                <span>{{ t('user-defined.label') }}</span>
                <template v-if="IS_STANDALONE">
                    <span class="standalone-label">{{ t('standalone-export.fixed') }}</span>
                </template>
                <template v-else-if="has_pending_scripts">
                    <button @mousedown="resume_scripts">{{ t('user-defined.resume') }}</button>
                    <button @mousedown="disable_all">{{ t('user-defined.disable-all') }}</button>
                </template>
                <template v-else>
                    <button @mousedown="ui.show_user_defined.value = true">{{ t('user-defined.configure') }}</button>
                </template>
            </div>
            <hr v-if="!settings_collapsed" class="toolbar-separator" />
            <div v-if="!settings_collapsed" class="toolbar-row">
                <span>
                    {{ t('tier.label') }}
                    <button class="tier-btn" @mousedown="settings.tier = Math.max(settings.tier - 1, 0)">
                        <span class="tier-icon">−</span>
                    </button>
                    {{ tier_name }}
                    <button class="tier-btn" @mousedown="settings.tier = settings.tier + 1">
                        <span class="tier-icon">+</span>
                    </button>
                </span>
            </div>
            <div v-if="!settings_collapsed" class="toolbar-row">
                <span style="margin-right: 8px">
                    {{ t('analysis-input.label') }}
                    <button class="toggle-btn" @mousedown="settings.show_input = !settings.show_input">
                        {{ settings.show_input ? t('analysis-input.show') : t('analysis-input.hide') }}
                    </button>
                </span>
                <label v-if="settings.show_input">
                    {{ t('analysis-input.width') }}
                    <input
                        type="range"
                        min="60"
                        max="600"
                        v-model.number="settings.input_width"
                        style="vertical-align: middle"
                    />
                    {{ settings.input_width }}px
                </label>
                <label>
                    <input type="checkbox" v-model="settings.use_delete_to_clear" />
                    {{ t('analysis-input.use-delete') }}
                </label>
                <label>
                    <input type="checkbox" v-model="settings.scroll_on_focus" />
                    {{ t('analysis-input.scroll-on-focus') }}
                </label>
            </div>
            <div v-if="!settings_collapsed" class="toolbar-row">
                <label>
                    {{ t('font.label') }}
                    <select v-model="settings.font_family" @mousedown.stop>
                        <option v-for="f in font_options" :key="f" :value="f">
                            {{ f === 'DEFAULT' ? t('font.system-default') : f }}
                        </option>
                    </select>
                </label>
                <label style="margin-left: 8px">
                    {{ t('language.label') }}
                    <select v-model="settings.language" @mousedown.stop>
                        <option value="zh">中文</option>
                        <option value="en">English</option>
                    </select>
                </label>
            </div>
        </div>
        <button class="collapse-btn" @mousedown="settings_collapsed = !settings_collapsed">
            {{ settings_collapsed ? t('settings.more') : t('settings.less') }}
        </button>
    </div>
    <ModalDialog :show="show_equiv_config" :title="t('equiv.extra-title')" @close="show_equiv_config = false">
        <div class="equiv-config-list">
            <label v-for="opt in equiv_options" :key="opt.id" class="equiv-config-row">
                <input
                    type="checkbox"
                    :checked="settings.shown_equiv[settings.current_notation_id]?.[opt.id] ?? false"
                    @change="
                        (e: any) => {
                            const checked = (e.target as HTMLInputElement).checked;
                            const current = { ...(settings.shown_equiv[settings.current_notation_id] ?? {}) };
                            current[opt.id] = checked;
                            settings.shown_equiv = {
                                ...settings.shown_equiv,
                                [settings.current_notation_id]: current,
                            };
                        }
                    "
                />
                {{ opt.label }}
            </label>
        </div>
    </ModalDialog>
    <DiagramSettingsPanel :control="notation?.draw_diagram ?? null" />
</template>

<style scoped>
.equiv-config-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
}
.equiv-config-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 14px;
}

.toolbar-separator {
    border: none;
    border-top: 2px solid var(--color-border);
    margin: 12px 0 8px;
}

.diagram-settings-btn {
    padding: 2px 8px;
    border: 1px solid var(--color-success);
    border-radius: 4px;
    background: transparent;
    color: var(--color-success);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    white-space: nowrap;
}

.diagram-settings-btn:hover {
    background: var(--color-success);
    color: var(--color-bg);
}

.standalone-label {
    color: var(--color-text-secondary);
    font-size: 13px;
}
</style>
