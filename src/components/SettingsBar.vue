<script setup lang="ts">
import { computed, defineAsyncComponent, inject, ref, watch } from 'vue';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { SAVE_LOAD_KEY } from '@/composables/use_save_load.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { expand_all_pending } from '@/core/analysis.ts';
import { COMPAT_URL, IS_COMPAT, IS_STANDALONE } from '@/core/deployment.ts';
import { LOCAL_NOTATION_RUNTIME_KEY } from '@/composables/use_local_notation_runtime.ts';
import DiagramSettingsPanel from './DiagramSettingsPanel.vue';
import StandaloneFilesPanel from './StandaloneFilesPanel.vue';
import ColorThemePanel from './ColorThemePanel.vue';
import { get_katex, load_katex } from '@/composables/use_katex.ts';
import { validate_latex_commands } from '@/core/latex_renderer.ts';

const StandaloneExportPanel = defineAsyncComponent(() => import('./StandaloneExportPanel.vue'));
const UserDefinedNotationPanel = IS_STANDALONE
    ? null
    : defineAsyncComponent(() => import('./UserDefinedNotationPanel.vue'));

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const save_load = inject(SAVE_LOAD_KEY)!;
const ui = use_ui_states();
const { notation, root } = save_load;
const local_runtime = inject(LOCAL_NOTATION_RUNTIME_KEY)!;

type SettingsSection = 'general' | 'appearance' | 'analysis' | 'local' | 'export';

const active_section = ref<SettingsSection>('general');
const sections = computed(() => {
    const items: { id: SettingsSection; label: string; description: string }[] = [
        {
            id: 'general',
            label: t('settings.section-general'),
            description: t('settings.section-general-description'),
        },
        {
            id: 'appearance',
            label: t('settings.section-appearance'),
            description: t('settings.section-appearance-description'),
        },
        {
            id: 'analysis',
            label: t('settings.section-analysis'),
            description: t('settings.section-analysis-description'),
        },
    ];
    if (IS_STANDALONE) {
        items.push({
            id: 'local',
            label: t('standalone-export.bundled-files'),
            description: t('standalone-export.readonly-note'),
        });
    } else {
        items.push(
            {
                id: 'local',
                label: t('user-defined.label'),
                description: t('settings.section-local-description'),
            },
            {
                id: 'export',
                label: t('standalone-export.open'),
                description: t('standalone-export.description'),
            },
        );
    }
    return items;
});
const current_section = computed(() => sections.value.find((section) => section.id === active_section.value)!);
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
        if (!file.enabled) continue;
        try {
            local_runtime.disable(file.id);
        } catch (error) {
            console.warn(`Could not disable ${file.name}.`, error);
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
    const key = `tier.${settings.tier}`;
    const label = t(key);
    return label !== key ? label : `${settings.tier}-fold expansion`;
});

function toggle_diagram(): void {
    settings.show_diagram = !settings.show_diagram;
}

function toggle_latex(): void {
    settings.analysis_latex_preview = !settings.analysis_latex_preview;
}

function on_show_description_change(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    settings.show_description = checked;
    ui.description_visible.value = checked;
}

function handle_expand_all(): void {
    if (!notation.value || !root.value) return;
    expand_all_pending(root.value, notation.value, settings.variant, settings.max_find_fs);
}

function on_expand_all_import_change(event: Event): void {
    settings.expand_all_on_import = (event.target as HTMLInputElement).checked;
}

function go_compat(): void {
    location.href = COMPAT_URL;
}

const latex_commands_error = ref('');
watch(
    () => settings.latex_commands,
    async (value) => {
        if (!value.trim()) {
            latex_commands_error.value = '';
            return;
        }
        const engine = get_katex() ?? (await load_katex());
        latex_commands_error.value = validate_latex_commands(value, engine);
    },
    { immediate: true },
);
</script>

<template>
    <div class="settings-page">
        <nav class="settings-nav" role="tablist" :aria-label="t('page.settings')">
            <button
                v-for="section in sections"
                :id="`settings-tab-${section.id}`"
                :key="section.id"
                type="button"
                role="tab"
                class="settings-nav__item"
                :class="{ 'is-active': active_section === section.id }"
                :aria-selected="active_section === section.id"
                :aria-controls="`settings-panel-${section.id}`"
                @click="active_section = section.id"
            >
                {{ section.label }}
            </button>
        </nav>
        <label class="settings-mobile-nav">
            <span>{{ t('page.settings') }}</span>
            <select v-model="active_section">
                <option v-for="section in sections" :key="section.id" :value="section.id">
                    {{ section.label }}
                </option>
            </select>
        </label>

        <section
            :id="`settings-panel-${active_section}`"
            class="settings-content"
            role="tabpanel"
            :aria-labelledby="`settings-tab-${active_section}`"
        >
            <header class="settings-content__header">
                <h2>{{ current_section.label }}</h2>
                <p>{{ current_section.description }}</p>
            </header>

            <div v-if="active_section === 'general'" class="settings-list">
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
                    <span class="setting-label">{{ t('font.label') }}</span>
                    <select v-model="settings.font_family" class="setting-control">
                        <option v-for="font in font_options" :key="font" :value="font">
                            {{ font === 'DEFAULT' ? t('font.system-default') : font }}
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
                <div v-if="!IS_COMPAT" class="setting-row">
                    <span class="setting-label">{{ t('toolbar.compat') }}</span>
                    <button class="setting-button" @mousedown="go_compat">{{ t('toolbar.compat') }}</button>
                </div>
            </div>

            <div v-else-if="active_section === 'appearance'" class="settings-list">
                <div class="setting-row">
                    <span class="setting-label">{{ t('display.label') }}</span>
                    <div class="setting-segment" role="group" :aria-label="t('display.label')">
                        <button
                            v-for="mode in DISPLAY_MODES"
                            :key="mode"
                            type="button"
                            :class="{ 'is-active': settings.display_mode === mode }"
                            :aria-pressed="settings.display_mode === mode"
                            @click="settings.display_mode = mode"
                        >
                            {{ t('display.' + mode) }}
                        </button>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">{{ t('description.show-default') }}</span>
                    <label class="setting-check">
                        <input
                            type="checkbox"
                            :checked="settings.show_description"
                            @change="on_show_description_change"
                        />
                        <span>{{ settings.show_description ? t('description.show') : t('analysis-input.hide') }}</span>
                    </label>
                </div>
                <div v-if="notation?.draw_diagram" class="setting-row">
                    <span class="setting-label">{{ t('diagram.show') }}</span>
                    <label class="setting-check">
                        <input type="checkbox" :checked="settings.show_diagram" @change="toggle_diagram" />
                    </label>
                </div>
                <ColorThemePanel inline />
                <DiagramSettingsPanel v-if="has_diagram_settings" :control="notation?.draw_diagram ?? null" inline />

                <section v-if="equiv_options.length > 0" class="settings-subsection">
                    <h3>{{ t('equiv.extra-title') }}</h3>
                    <div class="equiv-config-list">
                        <label v-for="option in equiv_options" :key="option.id" class="equiv-config-row">
                            <input
                                type="checkbox"
                                :checked="settings.shown_equiv[settings.current_notation_id]?.[option.id] ?? false"
                                @change="
                                    (event: any) => {
                                        const checked = (event.target as HTMLInputElement).checked;
                                        const current = {
                                            ...(settings.shown_equiv[settings.current_notation_id] ?? {}),
                                        };
                                        current[option.id] = checked;
                                        settings.shown_equiv = {
                                            ...settings.shown_equiv,
                                            [settings.current_notation_id]: current,
                                        };
                                    }
                                "
                            />
                            {{ option.label }}
                        </label>
                    </div>
                </section>
            </div>

            <div v-else-if="active_section === 'analysis'" class="settings-list">
                <div class="setting-row">
                    <span class="setting-label">{{ t('fs-variant.label') }}</span>
                    <select v-model="settings.variant" class="setting-control">
                        <option value="FS">{{ t('fs-variant.normal') }}</option>
                        <option value="FS_alter">{{ t('fs-variant.alternative') }}</option>
                        <option value="FS_short">{{ t('fs-variant.short') }}</option>
                    </select>
                </div>
                <div class="setting-row setting-row--block">
                    <span class="setting-label">{{ t('expand-all.label') }}</span>
                    <div class="setting-controls">
                        <button class="setting-button" @mousedown="handle_expand_all">
                            {{ t('expand-all.expand') }}
                        </button>
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
                            <input v-model.number="settings.max_find_fs" type="number" min="1" max="9999" />
                        </label>
                    </div>
                </div>
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
                        <label v-if="settings.show_input" class="setting-inline-number setting-inline-number--range">
                            {{ t('analysis-input.width') }}
                            <input v-model.number="settings.input_width" type="range" min="60" max="600" />
                            <output>{{ settings.input_width }}px</output>
                        </label>
                        <label class="setting-check">
                            <input v-model="settings.use_delete_to_clear" type="checkbox" />
                            {{ t('analysis-input.use-delete') }}
                        </label>
                        <label class="setting-check">
                            <input v-model="settings.scroll_on_focus" type="checkbox" />
                            {{ t('analysis-input.scroll-on-focus') }}
                        </label>
                    </div>
                </div>

                <section class="settings-subsection latex-render-settings">
                    <h3>{{ t('latex.analysis-section') }}</h3>
                    <p class="settings-subsection__description">{{ t('latex.analysis-section-hint') }}</p>
                    <label class="latex-command-field">
                        <span class="setting-label">
                            {{ t('latex.custom-commands') }}
                            <small>{{ t('latex.custom-commands-hint') }}</small>
                        </span>
                        <textarea
                            v-model="settings.latex_commands"
                            class="latex-command-input"
                            :placeholder="t('latex.custom-commands-placeholder')"
                            maxlength="20000"
                            rows="5"
                            spellcheck="false"
                        ></textarea>
                        <span v-if="latex_commands_error" class="setting-error" role="alert">
                            {{ t('latex.custom-commands-error') }}: {{ latex_commands_error }}
                        </span>
                    </label>
                    <div class="setting-row">
                        <span class="setting-label">{{ t('latex.analysis-preview') }}</span>
                        <label class="setting-check">
                            <input type="checkbox" :checked="settings.analysis_latex_preview" @change="toggle_latex" />
                        </label>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">{{ t('latex.analysis-inline') }}</span>
                        <label class="setting-check" :class="{ 'is-disabled': !settings.analysis_latex_preview }">
                            <input
                                v-model="settings.analysis_latex_inline"
                                type="checkbox"
                                :disabled="!settings.analysis_latex_preview"
                            />
                        </label>
                    </div>
                </section>
            </div>

            <div v-else-if="active_section === 'local'" class="settings-list settings-list--workspace">
                <div v-if="!IS_STANDALONE && has_pending_scripts" class="setting-row">
                    <span class="setting-label">{{ t('user-defined.label') }}</span>
                    <div class="setting-controls">
                        <button class="setting-button" @mousedown="resume_scripts">
                            {{ t('user-defined.resume') }}
                        </button>
                        <button class="setting-button" @mousedown="disable_all">
                            {{ t('user-defined.disable-all') }}
                        </button>
                    </div>
                </div>
                <StandaloneFilesPanel v-if="IS_STANDALONE" />
                <UserDefinedNotationPanel v-else-if="UserDefinedNotationPanel" inline />
            </div>

            <div v-else-if="active_section === 'export'" class="settings-list settings-list--workspace">
                <StandaloneExportPanel v-if="!IS_STANDALONE" inline />
            </div>
        </section>
    </div>
</template>

<style scoped>
.settings-page {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    align-items: start;
    width: min(100%, 1180px);
    min-height: 520px;
    margin: 8px 0 28px;
    border: 1px solid var(--color-border-light);
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-bg);
}

.settings-nav {
    display: flex;
    min-height: 100%;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-right: 1px solid var(--color-border-light);
    background: var(--color-bg-secondary);
    box-sizing: border-box;
}

.settings-mobile-nav {
    display: none;
}

.settings-nav__item {
    width: 100%;
    min-height: 38px;
    padding: 7px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
}

.settings-nav__item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.settings-nav__item.is-active {
    background: var(--color-accent-bg);
    color: var(--color-accent);
    font-weight: 600;
}

.settings-nav__item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
}

.settings-content {
    min-width: 0;
    padding: 18px 22px 24px;
    box-sizing: border-box;
}

.settings-content__header {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border-light);
}

.settings-content__header h2 {
    margin: 0;
    color: var(--color-text);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 0;
}

.settings-content__header p {
    max-width: 72ch;
    margin: 5px 0 0;
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.5;
}

.settings-list {
    width: 100%;
}

.settings-list--workspace {
    min-width: 0;
}

.setting-row {
    display: flex;
    min-height: 50px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 10px 2px;
    border-bottom: 1px solid var(--color-border-light);
    box-sizing: border-box;
}

.setting-row--block {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
}

.setting-label {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.4;
}

.setting-controls {
    display: flex;
    min-width: 0;
    flex: 0 1 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
}

.setting-row--block .setting-controls {
    justify-content: flex-start;
}

.setting-button,
.setting-control,
.tier-btn {
    min-height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-sizing: border-box;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
}

.setting-segment {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-secondary);
}

.setting-segment button {
    min-height: 30px;
    padding: 4px 11px;
    border: 0;
    border-right: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
}

.setting-segment button:last-child {
    border-right: 0;
}

.setting-segment button:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.setting-segment button.is-active {
    background: var(--color-accent);
    color: var(--color-bg);
}

.setting-button {
    padding: 4px 11px;
}

.setting-button:hover,
.tier-btn:hover {
    background: var(--color-bg-hover);
}

.setting-control {
    width: min(260px, 100%);
    min-width: 150px;
    padding: 4px 8px;
}

.setting-check,
.setting-inline-number {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    color: var(--color-text);
    font-size: 13px;
    line-height: 1.35;
}

.setting-check.is-disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
}

.setting-label small {
    display: block;
    margin-top: 3px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
}

.latex-command-input {
    width: 100%;
    min-height: 108px;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-sizing: border-box;
    resize: vertical;
    background: var(--color-bg);
    color: var(--color-text);
    font:
        13px/1.5 ui-monospace,
        SFMono-Regular,
        Menlo,
        Consolas,
        monospace;
    tab-size: 4;
}

.latex-command-input:focus {
    outline: 2px solid var(--color-accent-bg);
    border-color: var(--color-accent);
}

.setting-error {
    color: var(--color-danger);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.setting-inline-number {
    color: var(--color-text-secondary);
}

.setting-inline-number input[type='number'] {
    width: 76px;
    height: 30px;
    padding: 4px 6px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-sizing: border-box;
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

.settings-subsection,
:deep(.modal-inline) {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--color-border-light);
}

.settings-subsection h3 {
    margin: 0 0 10px;
    color: var(--color-text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0;
}

.settings-subsection__description {
    max-width: 72ch;
    margin: -4px 0 12px;
    color: var(--color-text-secondary);
    font-size: 12px;
    line-height: 1.5;
}

.latex-command-field {
    display: grid;
    gap: 8px;
    padding: 4px 2px 12px;
    border-bottom: 1px solid var(--color-border-light);
}

.latex-render-settings .setting-row:last-child {
    border-bottom: 0;
}

.equiv-config-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 4px 16px;
}

.equiv-config-row {
    display: flex;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    color: var(--color-text);
    cursor: pointer;
    font-size: 14px;
}

@media (max-width: 760px) {
    .settings-page {
        grid-template-columns: minmax(0, 1fr);
        min-height: 0;
    }

    .settings-nav {
        display: none;
    }

    .settings-mobile-nav {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--color-border-light);
        background: var(--color-bg-secondary);
        color: var(--color-text-secondary);
        font-size: 13px;
    }

    .settings-mobile-nav select {
        min-width: 0;
        flex: 1;
        height: 34px;
        padding: 4px 8px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        background: var(--color-bg);
        color: var(--color-text);
        font: inherit;
    }

    .settings-content {
        padding: 15px 14px 20px;
    }
}

@media (max-width: 560px) {
    .settings-page {
        margin-top: 4px;
    }

    .settings-content {
        padding-right: 10px;
        padding-left: 10px;
    }

    .setting-row {
        align-items: stretch;
        flex-direction: column;
        gap: 8px;
    }

    .setting-controls {
        width: 100%;
        justify-content: flex-start;
    }

    .setting-control {
        width: 100%;
        min-width: 0;
    }

    .setting-segment {
        width: 100%;
    }

    .setting-segment button {
        min-width: 0;
        flex: 1;
    }

    .setting-inline-number--range {
        display: grid;
        grid-template-columns: auto minmax(80px, 1fr) auto;
        width: 100%;
    }

    .setting-inline-number input[type='range'] {
        width: 100%;
        min-width: 0;
    }
}
</style>
