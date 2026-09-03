<script setup lang="ts">
import { defineAsyncComponent, inject, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { get_notation } from '@/core/registry.ts';
import { resolve_name } from '@/notation-definition.ts';
import type { TreeNode } from '@/core/tree.ts';
import { focus_node, get_last_focus } from '@/composables/use_focus_tracker.ts';
import NotationTree from '@/components/NotationTree.vue';

import { use_diagram } from '@/composables/use_diagram.ts';
import DiagramViewer from '@/components/DiagramViewer.vue';
import HotkeyDialog from '@/components/HotkeyDialog.vue';
import TipPopup from '@/components/TipPopup.vue';
import TipsDialog from '@/components/TipsDialog.vue';
import ColorThemePanel from '@/components/ColorThemePanel.vue';
import ResetPanel from '@/components/ResetPanel.vue';
import UserDefinedApiPanel from '@/components/UserDefinedApiPanel.vue';
import UserDefinedNavPanel from '@/components/UserDefinedNavPanel.vue';
import { create_t, I18N_KEY } from '@/composables/use_i18n.ts';
import ExpandDialog from '@/components/ExpandDialog.vue';
import { use_latex } from '@/composables/use_latex.ts';
import LaTeXViewer from '@/components/LaTeXViewer.vue';
import MultiSelectBar from '@/components/MultiSelectBar.vue';
import ConfigBar from '@/components/ConfigBar.vue';
import NotationPicker from '@/components/NotationPicker.vue';
import EquivalentNotationBar from '@/components/EquivalentNotationBar.vue';
import ExploreToolbar from '@/components/ExploreToolbar.vue';
import NotesPanel from '@/components/NotesPanel.vue';
import SettingsBar from '@/components/SettingsBar.vue';
import { use_multi_select } from '@/composables/use_multi_select.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { SAVE_LOAD_KEY, use_save_load } from '@/composables/use_save_load.ts';
import { apply_color_theme } from '@/composables/use_color_theme.ts';
import { use_tip } from '@/composables/use_tip.ts';
import { IS_STANDALONE } from '@/core/deployment.ts';
import { FLOATING_LAYOUT_EVENT, place_floating_rect, type FloatingRect } from '@/core/floating_layout.ts';

// Keep the AI workspace out of the initial route chunk. It is not needed for
// exploration and can remain a separately loaded tab on GitHub Pages. The
// standalone build must not bundle the AI workspace at all.
const AINotationPanel = IS_STANDALONE ? null : defineAsyncComponent(() => import('@/components/AINotationPanel.vue'));
const UserDefinedNotationPanel = IS_STANDALONE
    ? null
    : defineAsyncComponent(() => import('@/components/UserDefinedNotationPanel.vue'));
const ToolsPanel = defineAsyncComponent(() => import('@/components/ToolsPanel.vue'));
const is_standalone = IS_STANDALONE;

const settings = inject(SETTINGS_KEY)!;
const t = (key: string, params?: Record<string, string>) => create_t(settings.language)(key, params);
provide(I18N_KEY, t);

const { diagram, visible, pos_x, pos_y, move: move_diagram } = use_diagram();
const diagram_floating_ref = ref<HTMLElement | null>(null);
const latex_floating_ref = ref<HTMLElement | null>(null);
let floating_layout_frame = 0;

// 说明显示/隐藏切换: 与记号条目相同的逻辑, 选中文本时不触发
function on_description_mousedown(e: MouseEvent) {
    if (e.detail > 1) e.preventDefault();
}
function on_description_click() {
    if (window.getSelection()?.toString()) return;
    ui.description_visible.value = !ui.description_visible.value;
}
const latex_state = use_latex();
const multi_select = use_multi_select();
const ui = use_ui_states();

const save_load = use_save_load(reactive(new Map()), t);
provide(SAVE_LOAD_KEY, save_load);
const { trees, notation, root, save_indicator } = save_load;

const tip = use_tip(settings);
const active_page = ref<'explore' | 'tools' | 'settings' | 'ai'>('explore');

function floating_rect(element: Element): FloatingRect {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function layout_floating_overlays(): void {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const avoid = Array.from(document.querySelectorAll('.tooltip')).map(floating_rect);

    const diagram_element = diagram_floating_ref.value;
    if (diagram_element && visible.value) {
        const rect = diagram_element.getBoundingClientRect();
        const position = place_floating_rect(pos_x.value, pos_y.value, rect.width, rect.height, viewport, avoid);
        move_diagram(position.left, position.top);
        avoid.push({
            left: position.left,
            top: position.top,
            right: position.left + rect.width,
            bottom: position.top + rect.height,
        });
    }

    const latex_element = latex_floating_ref.value;
    if (latex_element && latex_state.visible.value) {
        const rect = latex_element.getBoundingClientRect();
        const position = place_floating_rect(
            latex_state.pos_x.value,
            latex_state.pos_y.value,
            rect.width,
            rect.height,
            viewport,
            avoid,
        );
        latex_state.move(position.left, position.top);
    }
}

function schedule_floating_layout(): void {
    cancelAnimationFrame(floating_layout_frame);
    floating_layout_frame = requestAnimationFrame(layout_floating_overlays);
}

watch(
    () => settings.font_family,
    (v) => {
        document.body.style.fontFamily = v === 'DEFAULT' ? '' : v + ', sans-serif';
    },
    { immediate: true },
);

watch(
    () => settings.color_scheme,
    (v) => {
        apply_color_theme(v);
    },
    { immediate: true },
);

watch(
    () => settings.current_notation_id,
    () => {
        multi_select.clear();
        // 切换记号时, 说明显示状态恢复为持久化的默认值
        ui.description_visible.value = settings.show_description;
    },
);

function on_global_keydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !['c', 'v', 'a', 'x', 'z', 'r'].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
    // Ctrl+A: 若已有选区落在某个变体表达式上, 只选中该变体的完整表达式 (便于复制), 而非整页
    if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (select_expression_in_item(e)) return;
    }
    if (e.key.toLowerCase() === 'r' && e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const path = get_last_focus();
        if (path) focus_node(path, settings.scroll_on_focus);
    }
    if (e.key.toLowerCase() === 's' && e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        save_load.handle_export();
    }
    if (e.key.toLowerCase() === 'l' && e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        save_load.handle_import();
    }
}

/** Ctrl+A: 选中选区起点所在变体的完整表达式 (便于复制), 而非整页或全部变体。 */
function select_expression_in_item(e: KeyboardEvent): boolean {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false; // 无已有选区 → 保持默认全选整页
    const anchor = sel.anchorNode;
    if (!anchor) return false;
    const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
    if (!el || el instanceof HTMLInputElement || el.tagName === 'TEXTAREA') return false;
    const row = el.closest('.equiv-row'); // 选区起点所在的变体行 (折叠图标不在行内, 自然排除)
    if (!row) return false;

    const range = document.createRange();
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) {
        const t = walker.currentNode as Text;
        // 排除变体标签 (如 "DBMS:"), 只保留表达式文本
        if (t.parentElement?.closest('.equiv-label')) continue;
        texts.push(t);
    }
    if (texts.length === 0) return false;
    range.setStart(texts[0], 0);
    range.setEnd(texts[texts.length - 1], texts[texts.length - 1].data.length);
    sel.removeAllRanges();
    sel.addRange(range);
    e.preventDefault();
    return true;
}

onMounted(() => {
    document.addEventListener('keydown', on_global_keydown);
    window.addEventListener(FLOATING_LAYOUT_EVENT, schedule_floating_layout);
    save_load.init();
    // 打开页面时随机显示一条未被忽略的提示
    tip.show_random();
    (window as any).debug_compare_order = debug_compare_order;
    // 说明显示状态: 以持久化的"默认显示说明"为初值 (会话内点击可临时切换)
    ui.description_visible.value = settings.show_description;
});
onUnmounted(() => {
    document.removeEventListener('keydown', on_global_keydown);
    window.removeEventListener(FLOATING_LAYOUT_EVENT, schedule_floating_layout);
    cancelAnimationFrame(floating_layout_frame);
    save_load.dispose();
});

function collect_nodes<T>(node: TreeNode<T>): T[] {
    const result: T[] = [];
    const children = node.children;
    for (const child of children) {
        result.push(child.expr);
        result.push(...collect_nodes(child));
    }
    return result;
}

function debug_compare_order(notation_id?: string) {
    const n = notation_id ?? notation.value?.id;
    const r = n ? trees.get(n) : root.value;
    if (!r) return console.warn('No tree found');
    const notation_def = get_notation(n!);
    if (!notation_def?.compare) return console.warn('No compare function for', n);
    const compare = notation_def.compare;

    const nodes = collect_nodes(r);

    const errors: string[] = [];
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const cmp = compare(nodes[i], nodes[j]);
            count++;
            if (count % 100 === 0)
                console.log(`  progress: ${count} pairs checked, ${errors.length} error(s) found...`);
            if (cmp <= 0) {
                errors.push(
                    `node[${i}] < node[${j}] should be positive (later in pre-order = smaller), but compare returned ${cmp}`,
                );
            }
        }
    }
    if (errors.length === 0) {
        console.log(
            `✓ ${nodes.length} nodes, ${(nodes.length * (nodes.length - 1)) / 2} pairs — all strictly decreasing in pre-order.`,
        );
    } else {
        console.error(`✗ ${errors.length} ordering violation(s):`, errors.slice(0, 10));
        if (errors.length > 10) console.error(`  ... and ${errors.length - 10} more`);
    }
}
</script>

<template>
    <div>
        <nav class="page-tabs" role="tablist" :aria-label="t('page.navigation')">
            <button
                type="button"
                class="page-tab"
                :class="{ 'page-tab--active': active_page === 'explore' }"
                role="tab"
                :aria-selected="active_page === 'explore'"
                @mousedown.prevent="active_page = 'explore'"
            >
                {{ t('page.explore') }}
            </button>
            <button
                type="button"
                class="page-tab"
                :class="{ 'page-tab--active': active_page === 'tools' }"
                role="tab"
                :aria-selected="active_page === 'tools'"
                @mousedown.prevent="active_page = 'tools'"
            >
                {{ t('page.tools') }}
            </button>
            <button
                type="button"
                class="page-tab"
                :class="{ 'page-tab--active': active_page === 'settings' }"
                role="tab"
                :aria-selected="active_page === 'settings'"
                @mousedown.prevent="active_page = 'settings'"
            >
                {{ t('page.settings') }}
            </button>
            <button
                v-if="!is_standalone"
                type="button"
                class="page-tab"
                :class="{ 'page-tab--active': active_page === 'ai' }"
                role="tab"
                :aria-selected="active_page === 'ai'"
                @mousedown.prevent="active_page = 'ai'"
            >
                {{ t('page.ai') }}
            </button>
        </nav>

        <section v-if="active_page === 'explore'" class="page-panel" role="tabpanel">
            <NotationPicker />
            <EquivalentNotationBar />
            <ExploreToolbar />

            <template v-if="notation?.description">
                <div
                    v-if="ui.description_visible.value"
                    class="description-line"
                    @mousedown="on_description_mousedown"
                    @click="on_description_click"
                    @dblclick.prevent
                >
                    <template v-if="Array.isArray(notation.description)">
                        <div v-for="(d, i) in notation.description" :key="i">{{ resolve_name(d, t) }}</div>
                    </template>
                    <template v-else>{{ resolve_name(notation.description, t) }}</template>
                </div>
                <div
                    v-else
                    class="description-line"
                    @mousedown="on_description_mousedown"
                    @click="on_description_click"
                    @dblclick.prevent
                >
                    {{ t('description.show') }}
                </div>
            </template>

            <div v-if="root && notation" class="preview-container">
                <NotationTree :root="root" :notation="notation" :tier="settings.tier" />
                <div v-if="notation.credit_text_id" class="credit-line">
                    <template v-if="Array.isArray(notation.credit_text_id)">
                        <div v-for="key in notation.credit_text_id" :key="key">{{ t(key) }}</div>
                    </template>
                    <template v-else>{{ t(notation.credit_text_id) }}</template>
                </div>
            </div>
            <div v-else>{{ t('notation-tree.empty') }}</div>
        </section>

        <section v-else-if="active_page === 'tools'" class="page-panel page-panel--tools" role="tabpanel">
            <ToolsPanel />
        </section>

        <section v-else-if="active_page === 'settings'" class="page-panel page-panel--settings" role="tabpanel">
            <SettingsBar />
        </section>

        <section v-if="active_page === 'ai' && !is_standalone" class="page-panel page-panel--ai" role="tabpanel">
            <AINotationPanel />
        </section>

        <div
            v-if="visible && diagram"
            ref="diagram_floating_ref"
            class="floating-canvas"
            :style="{ left: pos_x + 'px', top: pos_y + 'px' }"
        >
            <DiagramViewer :diagram="diagram" />
        </div>
        <div
            v-if="latex_state.visible.value && latex_state.latex.value"
            ref="latex_floating_ref"
            class="floating-canvas floating-canvas--latex"
            :style="{ left: latex_state.pos_x.value + 'px', top: latex_state.pos_y.value + 'px' }"
        >
            <LaTeXViewer :latex="latex_state.latex.value" />
        </div>
        <div v-if="save_indicator" class="save-indicator">
            {{ t('autosave.last-save', { time: save_indicator }) }}
        </div>
        <HotkeyDialog :show="ui.show_hotkeys.value" @close="ui.show_hotkeys.value = false" />
        <ExpandDialog />
        <TipPopup :show="tip.shown.value !== null" :tip="tip.shown.value" @close="tip.close()" @ignore="tip.ignore" />
        <TipsDialog :show="ui.show_tips.value" @close="ui.show_tips.value = false" />
        <NotesPanel />
        <ColorThemePanel />
        <ResetPanel />
        <UserDefinedNotationPanel v-if="!is_standalone" />
        <UserDefinedApiPanel />
        <UserDefinedNavPanel />
        <MultiSelectBar />
        <ConfigBar />
    </div>
</template>

<style>
:root {
    --color-text: #000;
    --color-text-secondary: #888;
    --color-text-muted: #999;
    --color-primary: #90f;
    --color-primary-hover: #c8f;
    --color-primary-active: #60a;
    --color-primary-bg: #daf;
    --color-category: #f90;
    --color-category-hover: #fd9;
    --color-category-bg: #feb;
    --color-accent: #06c;
    --color-accent-hover: #08e;
    --color-accent-active: #048;
    --color-accent-bg: #cdf;
    --color-danger: #c00;
    --color-success: #080;
    --color-border: #ccc;
    --color-border-light: #ddd;
    --color-border-subtle: #eee;
    --color-bg: #fff;
    --color-bg-secondary: #f8f8f8;
    --color-bg-hover: #e8e8e8;
    --color-bg-active: #d0d0d0;
    --color-tree-hover: #cff;
    --color-tree-analyzed: #eee;
    --color-tree-analyzed-hover: #bee;
    --color-selected: #cfc;
    --color-selected-hover: #afa;
    --color-shadow: rgba(0, 0, 0, 0.15);
    --color-overlay: rgba(0, 0, 0, 0.35);
    --color-modal-overlay: rgba(0, 0, 0, 0.4);
    --color-editor-keyword: #7c3aed;
    --color-editor-literal: #b42318;
    --color-editor-number: #0550ae;
    --color-editor-string: #116329;
    --color-editor-comment: #6e7781;
}

.pps-column-index {
    color: #888;
}

html.dark .pps-column-index {
    color: #999;
}

.settings-box {
    border: 2px solid var(--color-border-light);
    border-radius: 8px;
    padding: 8px 12px 4px;
    margin: 8px 0;
}

.page-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: -2px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--color-border);
}

.page-tab {
    min-height: 32px;
    padding: 5px 14px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
}

.page-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
}

.page-tab--active {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-bg);
    font-weight: 600;
}

.page-tab--active:hover {
    background: var(--color-accent);
    color: var(--color-bg);
}

.page-panel {
    min-width: 0;
}

.page-panel--settings {
    max-width: 1200px;
}

.collapse-btn {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 2px 0;
    border: none;
    border-top: 1px solid var(--color-border-subtle);
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    color: var(--color-text-secondary);
    font-family: inherit;
}

.collapse-btn:hover {
    color: var(--color-text);
}

.toolbar {
    margin: 6px 0;
}

.toolbar-row {
    margin: 4px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.toolbar-row > span,
.toolbar-row > label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    line-height: 24px;
}

.toolbar-row input[type='checkbox'] {
    margin: 0;
}

.toolbar-sep {
    width: 1px;
    height: 1.2em;
    background: var(--color-border);
}

.toolbar button {
    padding: 2px 10px;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-size: 14px;
    vertical-align: middle;

    min-width: 4ch;
}

.toolbar button:hover {
    background: var(--color-bg-hover);
}

.toolbar button:active {
    background: var(--color-bg-active);
}

.toolbar button.reset-btn {
    color: var(--color-danger);
}

.reset-btn:hover {
    background: #fdd !important;
}

.toolbar button.toolbar-btn-tips {
    color: var(--color-accent);
    font-weight: 600;
}

.toolbar button.toolbar-btn-tips:hover {
    background: #e0ecff;
}

.tier-icon {
    display: inline-block;
}

.toolbar .tier-btn {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: sans-serif;
    font-size: 16px;
    min-width: 0;
    line-height: 1;
    box-sizing: border-box;
}

.nowrap {
    white-space: nowrap;
}

.preview-container {
    margin: 20px 0;
}

.credit-line {
    text-align: center;
    margin-top: 1.5em;
    color: var(--color-text-secondary);
    font-size: 13px;
}

.description-line {
    text-align: center;
    margin: 0.5em auto 0;
    max-width: 60em;
    padding: 0 1em;
    color: var(--color-text-secondary);
    font-size: 13px;
}

.shown-item {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
    min-height: 1.25em;
    transition: background 0.1s;
}

.shown-item:hover {
    background-color: var(--color-tree-hover);
}

.shown-item.keyboard-mode {
    cursor: default;
}

.shown-item.keyboard-mode:hover {
    background-color: transparent;
}

.shown-item.analyzed {
    background-color: var(--color-tree-analyzed);
}

.shown-item.analyzed:hover {
    background-color: var(--color-tree-analyzed-hover);
}

.shown-item.keyboard-mode.analyzed:hover {
    background-color: var(--color-tree-analyzed);
}

.shown-item.selected {
    background-color: var(--color-selected) !important;
}

.shown-item.selected:hover {
    background-color: var(--color-selected-hover) !important;
}

.equiv-row .expr-display:empty::before {
    content: '(empty)';
    color: var(--color-text-muted);
}

.equiv-rows {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    vertical-align: middle;
}
.equiv-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    white-space: nowrap;
}
.equiv-row--secondary {
    font-size: 0.85em;
}
.equiv-label {
    color: var(--color-text-secondary);
    font-size: 0.85em;
    flex-shrink: 0;
}

.notation-expression {
    min-width: 0;
    color: var(--color-text);
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
}

.notation-expression__active,
.notation-expression__original,
.notation-expression__original-value {
    display: inline;
}

.notation-expression.is-latex .render-latex,
.notation-expression.is-latex .katex {
    font-size: 1.08em;
}

.notation-expression__original {
    color: var(--color-text-secondary);
}

.notation-expression__separator {
    color: var(--color-text-muted);
    user-select: none;
}

.tooltip {
    display: inline-block;
    position: fixed;
    z-index: 1073741824;
    padding: 8px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px var(--color-shadow);
    text-align: left;
    line-height: 1.4;
    font-size: 12px;
    box-sizing: border-box;
    min-width: 120px;
    max-width: min(720px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    overflow: auto;
    pointer-events: auto;
}

.tooltip-fs {
    display: grid;
    grid-template-columns: max-content max-content max-content;
    align-items: baseline;
    justify-content: start;
    column-gap: 4px;
}

.tooltip-row {
    display: contents;
}

.tooltip-row > * {
    padding-top: 2px;
    padding-bottom: 2px;
}

.tooltip-index {
    color: var(--color-text-secondary);
    font-family: Consolas, 'Courier New', monospace;
    text-align: left;
}

.tooltip-expr {
    justify-self: start;
    text-align: left;
    white-space: pre;
    flex-shrink: 0;
    overflow: visible;
}

.tooltip-cmnt {
    justify-self: start;
    text-align: left;
    white-space: nowrap;
    color: var(--color-text-secondary);
    flex-shrink: 0;
}

.tooltip-cmnt--empty {
    visibility: hidden;
}

ul {
    list-style: none;
    padding-left: 0;
    margin: 0;
}

.tree-children {
    padding-left: 24px;
    position: relative;
}

.tree-item {
    position: relative;
}

.tree-item::before {
    content: '';
    position: absolute;
    left: -16px;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--color-border-light);
}

.tree-item:last-child::before {
    border-left: none;
}

.tree-item::after {
    content: '';
    position: absolute;
    left: -16px;
    top: 0.6em;
    width: 14px;
    border-bottom: 1px solid var(--color-border-light);
}

.tree-item:last-child::after {
    width: 14px;
}

.tree-children > .tree-item:last-child::before {
    border-left: 1px solid var(--color-border-light);
}

.tree-children > .tree-item:only-child::before {
    border-left: 1px solid var(--color-border-light);
}

.subtree-toggle {
    width: 13px;
    height: 13px;
    margin: 0 4px 0 0;
    padding: 0;
    cursor: pointer;
    vertical-align: middle;
    accent-color: var(--color-accent);
}

.pending-badge {
    color: var(--color-danger);
    font-weight: bold;
    user-select: none;
    margin-right: 4px;
    vertical-align: middle;
    cursor: pointer;
}

.pending-badge:hover {
    text-decoration: underline;
}

.toolbar input[type='text'],
.toolbar input[type='number'],
.tree-item input[type='text'] {
    font-family: inherit;
    padding: 2px 8px;
    height: 24px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    font-size: 14px;
    line-height: 1.4;
    box-sizing: border-box;
    background: var(--color-bg);
    color: var(--color-text);
    vertical-align: middle;
}

.toolbar input[type='text']:focus,
.tree-item input[type='text']:focus {
    outline: none;
    border-color: #7af;
    box-shadow: 0 0 0 2px rgba(100, 160, 255, 0.25);
}

.input-resize {
    display: inline-block;
    position: relative;
    overflow: hidden;
    resize: horizontal;
    min-width: 60px;
    max-width: min(600px, calc(100vw - 80px));
    vertical-align: middle;
    flex: 0 0 auto;
}

.tree-item .input-resize > input {
    width: 100%;
    min-width: 60px;
    box-sizing: border-box;
    padding: 1px 4px;
    border-color: transparent;
    border-radius: 3px;
    background: transparent;
    box-shadow: none;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 13px;
    transition:
        border-color 0.15s,
        background 0.15s,
        opacity 0.1s;
}

.input-resize.has-inline-latex {
    display: inline-grid;
    align-items: center;
}

.input-resize.has-inline-latex > input,
.input-resize.has-inline-latex > .analysis-inline-latex {
    grid-area: 1 / 1;
}

.input-resize.has-inline-latex:not(:focus-within) > input {
    opacity: 0;
}

.analysis-inline-latex {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
    padding: 1px 4px;
    overflow: hidden;
    color: var(--color-text);
    cursor: text;
    pointer-events: none;
    text-align: left;
    white-space: nowrap;
    transition: opacity 0.1s;
}

.analysis-inline-latex .katex {
    font-size: 1em;
}

.input-resize.has-inline-latex:focus-within > .analysis-inline-latex {
    opacity: 0;
}

.tree-item .input-resize > input:focus {
    border-color: var(--color-accent);
    background: var(--color-bg-secondary);
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.input-resize.input-hidden {
    display: none;
}

.tree-item input[type='text'] {
    width: 100%;
    margin: 0;
}

@media (max-width: 560px) {
    .input-resize {
        max-width: min(600px, calc(100vw - 120px));
    }
}

.toolbar select {
    padding: 2px 6px;
    height: 24px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
    font-size: 14px;
    font-family: inherit;
    box-sizing: border-box;
    text-align: center;
    text-align-last: center;
    -webkit-appearance: none;
    appearance: none;
}

.toolbar select:hover {
    background: var(--color-bg-hover);
}

body {
    background: var(--color-page-bg, var(--color-bg));
    color: var(--color-text);
    margin: 8px;
}

body::after {
    content: '';
    display: block;
    height: 100vh;
}

.floating-canvas {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
}

.floating-canvas--latex {
    background: var(--color-bg);
    border: 2px solid var(--color-text);
    color: var(--color-text);
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    overflow: auto;
    box-sizing: border-box;
}

.save-indicator {
    position: fixed;
    left: 8px;
    bottom: 8px;
    font-size: 12px;
    color: var(--color-text-secondary);
    background: var(--color-bg-secondary);
    padding: 2px 8px;
    border-radius: 4px;
    z-index: 9999;
    pointer-events: none;
}
</style>
