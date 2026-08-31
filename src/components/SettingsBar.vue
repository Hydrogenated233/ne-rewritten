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
    <div class="settings-page">
        <div class="settings-list">
            <div class="setting-row">
                <span class="setting-label">{{ t('notation-name.mode-label') }}</span>
                <button
                    class="setting-button"
                    @mousedown="
                        settings.notation_name_mode = settings.notation_name_mode === 'full' ? 'simple' : 'full'
                    "
                    @mouseenter="settings.notation_name_mode === 'full' && ui.start_flash()"
                    @mouseleave="ui.stop_flash"
                >
                    {{ t('notation-name.' + settings.notation_name_mode) }}
                </button>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('config-display.label') }}</span>
                <button class="setting-button" @mousedown="ui.toggle_config_mode()">
                    {{ t('config-display.configure') }}
                </button>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('nav-mode.label') }}</span>
                <button
                    class="setting-button"
                    @mousedown="settings.nav_mode = settings.nav_mode === 'grouped' ? 'flat' : 'grouped'"
                >
                    {{ t('nav-mode.' + settings.nav_mode) }}
                </button>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('display.label') }}</span>
                <button class="setting-button" @mousedown="toggle_display_mode">
                    {{ t('display.' + settings.display_mode) }}
                </button>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('fs-variant.label') }}</span>
                <select v-model="settings.variant" class="setting-control">
                    <option value="FS">{{ t('fs-variant.normal') }}</option>
                    <option value="FS_alter">{{ t('fs-variant.alternative') }}</option>
                    <option value="FS_short">{{ t('fs-variant.short') }}</option>
                </select>
            </div>
            <div v-if="equiv_options.length > 0" class="setting-row setting-row--equiv">
                <span class="setting-label">{{ t('equiv.label') }}</span>
                <div class="setting-controls">
                    <select
                        :value="settings.equiv_active[settings.current_notation_id] ?? ''"
                        class="setting-control"
                        @change="
                            (e: any) => {
                                settings.equiv_active = {
                                    ...settings.equiv_active,
                                    [settings.current_notation_id]: (e.target as HTMLSelectElement).value || undefined,
                                };
                            }
                        "
                    >
                        <option value="">{{ t('equiv.none') }}</option>
                        <option v-for="k in equiv_options" :key="k.id" :value="k.id">{{ k.label }}</option>
                    </select>
                    <label v-if="settings.equiv_active[settings.current_notation_id]" class="setting-check">
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
                    <button class="setting-button" @mousedown="show_equiv_config = true">
                        {{ t('equiv.extra-configure') }}
                    </button>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('description.show-default') }}</span>
                <label class="setting-check">
                    <input type="checkbox" :checked="settings.show_description" @change="on_show_description_change" />
                    <span>{{ settings.show_description ? t('description.show') : t('analysis-input.hide') }}</span>
                </label>
            </div>
            <div v-if="notation?.draw_diagram" class="setting-row">
                <span class="setting-label">{{ t('diagram.show') }}</span>
                <div class="setting-controls">
                    <label class="setting-check"
                        ><input type="checkbox" :checked="settings.show_diagram" @change="toggle_diagram"
                    /></label>
                    <button
                        v-if="settings.show_diagram && has_diagram_settings"
                        class="setting-button"
                        @mousedown="ui.show_diagram_settings.value = true"
                    >
                        {{ t('diagram.settings') }}
                    </button>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('latex.show') }}</span>
                <div class="setting-controls">
                    <label class="setting-check"
                        ><input type="checkbox" :checked="settings.show_latex" @change="toggle_latex"
                    /></label>
                    <button class="setting-button" @mousedown="ui.show_latex_analysis.value = true">
                        {{ t('latex-analysis.title') }}
                    </button>
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('toolbar.theme') }}</span>
                <button class="setting-button" @mousedown="ui.show_color_theme.value = true">
                    {{ t('toolbar.theme') }}
                </button>
            </div>
            <div v-if="!IS_COMPAT" class="setting-row">
                <span class="setting-label">{{ t('toolbar.compat') }}</span>
                <button class="setting-button" @mousedown="go_compat">{{ t('toolbar.compat') }}</button>
            </div>
            <div v-if="!IS_STANDALONE" class="setting-row">
                <span class="setting-label">{{ t('standalone-export.open') }}</span>
                <span class="setting-note">{{ t('standalone-export.description') }}</span>
            </div>
            <StandaloneExportPanel v-if="!IS_STANDALONE" inline />
            <StandaloneFilesPanel v-if="IS_STANDALONE" />
            <div class="setting-row setting-row--block">
                <span class="setting-label">{{ t('expand-all.label') }}</span>
                <div class="setting-controls">
                    <button class="setting-button" @mousedown="handle_expand_all">{{ t('expand-all.expand') }}</button>
                    <label class="setting-check">
                        <input
                            type="checkbox"
                            :checked="settings.expand_all_on_import"
                            @change="on_expand_all_import_change"
                        />
                        {{ t('expand-all.on-import') }}
                    </label>
                    <label class="setting-inline-number">
                        {{ t('find-notation.max-fs') }}
                        <input type="number" min="1" max="9999" v-model.number="settings.max_find_fs" />
                    </label>
                </div>
            </div>
            <div v-if="IS_STANDALONE || has_pending_scripts" class="setting-row">
                <span class="setting-label">{{ t('user-defined.label') }}</span>
                <div class="setting-controls">
                    <span v-if="IS_STANDALONE" class="standalone-label">{{ t('standalone-export.fixed') }}</span>
                    <template v-else>
                        <button class="setting-button" @mousedown="resume_scripts">
                            {{ t('user-defined.resume') }}
                        </button>
                        <button class="setting-button" @mousedown="disable_all">
                            {{ t('user-defined.disable-all') }}
                        </button>
                    </template>
                </div>
            </div>
        </div>

        <button class="settings-more" @mousedown="settings_collapsed = !settings_collapsed">
            {{ settings_collapsed ? t('settings.more') : t('settings.less') }}
        </button>

        <div v-if="!settings_collapsed" class="settings-list settings-list--more">
            <div class="setting-row">
                <span class="setting-label">{{ t('tier.label') }}</span>
                <div class="setting-controls tier-controls">
                    <button class="tier-btn" @mousedown="settings.tier = Math.max(settings.tier - 1, 0)">−</button>
                    <span>{{ tier_name }}</span>
                    <button class="tier-btn" @mousedown="settings.tier = settings.tier + 1">+</button>
                </div>
            </div>
            <div class="setting-row setting-row--block">
                <span class="setting-label">{{ t('analysis-input.label') }}</span>
                <div class="setting-controls">
                    <button class="setting-button" @mousedown="settings.show_input = !settings.show_input">
                        {{ settings.show_input ? t('analysis-input.show') : t('analysis-input.hide') }}
                    </button>
                    <label v-if="settings.show_input" class="setting-inline-number">
                        {{ t('analysis-input.width') }}
                        <input type="range" min="60" max="600" v-model.number="settings.input_width" />
                        <output>{{ settings.input_width }}px</output>
                    </label>
                    <label class="setting-check"
                        ><input type="checkbox" v-model="settings.use_delete_to_clear" />{{
                            t('analysis-input.use-delete')
                        }}</label
                    >
                    <label class="setting-check"
                        ><input type="checkbox" v-model="settings.scroll_on_focus" />{{
                            t('analysis-input.scroll-on-focus')
                        }}</label
                    >
                </div>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('font.label') }}</span>
                <select v-model="settings.font_family" class="setting-control">
                    <option v-for="f in font_options" :key="f" :value="f">
                        {{ f === 'DEFAULT' ? t('font.system-default') : f }}
                    </option>
                </select>
            </div>
            <div class="setting-row">
                <span class="setting-label">{{ t('language.label') }}</span>
                <select v-model="settings.language" class="setting-control">
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                </select>
            </div>
        </div>
    </div>

    <div v-if="show_equiv_config" class="settings-inline-dialog">
        <div class="settings-inline-dialog__header">
            <span>{{ t('equiv.extra-title') }}</span>
            <button type="button" class="settings-inline-dialog__close" @mousedown="show_equiv_config = false">
                ✕
            </button>
        </div>
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
                            settings.shown_equiv = { ...settings.shown_equiv, [settings.current_notation_id]: current };
                        }
                    "
                />
                {{ opt.label }}
            </label>
        </div>
    </div>
    <DiagramSettingsPanel :control="notation?.draw_diagram ?? null" :inline="true" />
</template>

<style scoped>
.settings-page {
    width: min(100%, 820px);
    margin: 8px 0 24px;
}
.settings-list {
    width: 100%;
}
.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 48px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--color-border-light);
    box-sizing: border-box;
}
.setting-row--block {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
}
.setting-label {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.4;
}
.setting-note {
    max-width: 52ch;
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.45;
    text-align: right;
}
.setting-controls {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
}
.setting-row--block .setting-controls {
    justify-content: flex-start;
}
.setting-button,
.setting-control,
.tier-btn {
    min-height: 30px;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
}
.setting-button {
    padding: 4px 11px;
}
.setting-button:hover,
.tier-btn:hover {
    background: var(--color-bg-hover);
}
.setting-control {
    min-width: 150px;
    padding: 4px 8px;
}
.setting-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    color: var(--color-text);
    font-size: 13px;
    line-height: 1.35;
}
.setting-inline-number {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-secondary);
    font-size: 13px;
}
.setting-inline-number input[type='number'] {
    width: 72px;
    height: 30px;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
}
.setting-inline-number input[type='range'] {
    width: min(220px, 35vw);
}
.setting-inline-number output {
    min-width: 52px;
    color: var(--color-text);
}
.tier-controls {
    gap: 10px;
}
.tier-btn {
    width: 30px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
}
.standalone-label {
    color: var(--color-text-secondary);
    font-size: 13px;
}
.settings-more {
    width: 100%;
    margin-top: 8px;
    padding: 8px 0;
    border: none;
    border-top: 1px solid var(--color-border-light);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
}
.settings-more:hover {
    color: var(--color-text);
}
.settings-list--more {
    margin-top: 2px;
}
.equiv-config-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(360px, 70vw);
    padding: 4px 0;
}
.settings-inline-dialog {
    margin: 12px 0 0;
    padding: 12px 0;
    border-top: 1px solid var(--color-border-light);
    border-bottom: 1px solid var(--color-border-light);
}
.settings-inline-dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    color: var(--color-text);
    font-size: 15px;
    font-weight: 600;
}
.settings-inline-dialog__close {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font: inherit;
    line-height: 28px;
}
.settings-inline-dialog__close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}
.equiv-config-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    cursor: pointer;
    font-size: 14px;
}
@media (max-width: 680px) {
    .setting-row {
        align-items: flex-start;
        flex-direction: column;
        gap: 8px;
    }
    .setting-controls {
        width: 100%;
        justify-content: flex-start;
    }
    .setting-note {
        max-width: none;
        text-align: left;
    }
    .setting-control {
        max-width: 100%;
        min-width: min(220px, 100%);
    }
    .setting-inline-number input[type='range'] {
        width: min(260px, 70vw);
    }
}
</style>
