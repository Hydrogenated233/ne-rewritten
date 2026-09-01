<script setup lang="ts" generic="T">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import type { TreeNode } from '@/core/tree.ts';
import { find_next, find_prev } from '@/core/tree.ts';
import type { TreeNodeExtra } from '@/core/extra.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { I18N_KEY } from '@/composables/use_i18n.ts';
import { expand_item } from '@/core/expander.ts';
import { expand_pending_node } from '@/core/analysis.ts';
import {
    focus_node,
    focus_node_input,
    prepare_pointer_focus,
    set_last_focus,
} from '@/composables/use_focus_tracker.ts';
import { use_diagram } from '@/composables/use_diagram.ts';
import { use_expand_dialog } from '@/composables/use_expand_dialog.ts';
import { use_latex } from '@/composables/use_latex.ts';
import { use_multi_select } from '@/composables/use_multi_select.ts';
import RenderLatex from '@/components/RenderLatex.vue';
import { NotationDefinition, resolve_display, ResolvedDisplaySpec } from '@/notation-definition.ts';
import { cached_display, ORIGINAL_ID } from '@/core/display_cache.ts';
import { observe_on_screen, unobserve_on_screen } from '@/composables/use_on_screen.ts';

const props = defineProps<{
    node: TreeNode<T>;
    notation: NotationDefinition<T>;
    tier?: number;
}>();

const input_ref = ref<HTMLInputElement | null>(null);
const resize_span = ref<HTMLSpanElement | null>(null);
const tooltip = ref(false);
const tooltip_FS = ref<string[]>([]);
const focused = ref(false);
const on_screen = ref(false);
const shown_ref = ref<HTMLDivElement | null>(null);
const { show: show_diagram, hide: hide_diagram, dispatch_action: dispatch_diagram_action } = use_diagram();
const { show: show_latex_viewer, hide: hide_latex_viewer } = use_latex();

const ed = computed((): TreeNodeExtra => {
    if (!props.node.extraData) props.node.extraData = {};
    const d = props.node.extraData as TreeNodeExtra;
    if (!Array.isArray(d.analysis)) d.analysis = [];
    return d;
});

const saved_analysis = ref<string | undefined>(undefined);

const analysis0 = computed({
    get: () => ed.value.analysis?.[0] ?? '',
    set: (v: string) => {
        ed.value.analysis![0] = v;
    },
});

const settings = inject(SETTINGS_KEY)!;
const t = inject(I18N_KEY)!;
const multi = use_multi_select();
const node_path = props.node.path ?? '' + props.node.index;
const equiv_name = computed(() => settings.equiv_active[props.notation.id] ?? '');
const resolved_equiv = computed(() => {
    if (!equiv_name.value) return null;
    const spec = props.notation.display_equiv?.[equiv_name.value];
    if (!spec) return null;
    return resolve_display(spec);
});
const resolved_original = computed(() => resolve_display(props.notation.display));

/** 缓存 key 用的稳定标识: 原始 display 的 plain 字符串 (廉价, 且同一表达式值恒定)。 */
const expr_key = computed(() => resolved_original.value.plain(props.node.expr));

const equiv_option_ids = computed(() => {
    if (!props.notation.display_equiv) return [];
    return Object.keys(props.notation.display_equiv);
});

/** 是否有"昂贵"等价行在显示。仅此情形才启用可见性门控; 无等价时保持现状零回归。 */
const equiv_mode = computed(() => {
    const current = equiv_name.value;
    if (current && props.notation.display_equiv?.[current]) return true;
    const shown = settings.shown_equiv[props.notation.id] ?? {};
    return equiv_option_ids.value.some((id) => shown[id] && id !== current);
});

/** 挂载条目数 (输入框左侧红色徽标显示)。 */
const pending_count = computed(() => props.node.pending_items?.length ?? 0);

interface DisplayRow {
    id: string;
    label: string;
    spec: ResolvedDisplaySpec<T>;
    render: (mode: 'plain' | 'html' | 'latex') => string;
}

function make_display_row(id: string, label: string, spec: ResolvedDisplaySpec<T>): DisplayRow {
    return {
        id,
        label,
        spec,
        render: (mode) =>
            cached_display(props.notation.id, id, mode, expr_key.value, () => spec[mode](props.node.expr)),
    };
}

const primary_row = computed(() => {
    const current = equiv_name.value;
    const spec = current ? resolved_equiv.value : resolved_original.value;
    return make_display_row(current || ORIGINAL_ID, '', spec ?? resolved_original.value);
});

const comparison_original_row = computed(() => {
    const current = equiv_name.value;
    if (!current || (settings.equiv_hide_original[props.notation.id] ?? true)) return null;
    return make_display_row(ORIGINAL_ID, '', resolved_original.value);
});

const extra_equiv_rows = computed(() => {
    const nid = props.notation.id;
    const current = equiv_name.value;
    const shownMap: Record<string, boolean> = settings.shown_equiv[nid] ?? {};
    return equiv_option_ids.value
        .filter((id) => shownMap[id] && id !== current)
        .map((id) => make_display_row(id, id, resolve_display(props.notation.display_equiv![id])));
});

const primary_display = computed(() => {
    const d = primary_row.value.spec;
    return settings.display_mode === 'html' ? d.html : settings.display_mode === 'latex' ? d.latex : d.plain;
});

const show_inline_analysis_latex = computed(
    () =>
        settings.analysis_latex_preview &&
        settings.analysis_latex_inline &&
        settings.show_input &&
        analysis0.value.trim().length > 0,
);

watch(analysis0, () => {
    if (focused.value && settings.analysis_latex_preview) {
        const el = input_ref.value;
        if (el) {
            const r = el.getBoundingClientRect();
            show_latex_viewer(analysis0.value, r.left, 60 + r.height);
        }
    } else {
        hide_latex_viewer();
    }
});

onMounted(() => {
    if (shown_ref.value) {
        observe_on_screen(shown_ref.value, () => {
            on_screen.value = true;
        });
    }
    input_ref.value?.setAttribute('data-tree-path', node_path);
    const span = resize_span.value;
    let ro: ResizeObserver | undefined;
    if (span) {
        ro = new ResizeObserver(() => {
            if (document.body.contains(span)) {
                settings.input_width = span.offsetWidth;
            }
        });
        ro.observe(span);
    }
    onUnmounted(() => {
        if (shown_ref.value) unobserve_on_screen(shown_ref.value);
        ro?.disconnect();
    });
    if (ed.value.focus_on_mounted) {
        const el = input_ref.value;
        if (el) {
            el.focus({ preventScroll: true });
            if (settings.scroll_on_focus) {
                const rect = el.getBoundingClientRect();
                const top = window.scrollY + rect.top - 60;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        }
        ed.value.focus_on_mounted = false;
    }
});

function on_enter() {
    if (!props.notation.is_limit(props.node.expr)) return;
    const n_max = 3;
    tooltip_FS.value = [];
    const primary_display_fn = primary_display.value;
    for (let n = 0; n <= n_max; n++) {
        tooltip_FS.value.push(`${n}: ${primary_display_fn(props.notation.FS(props.node.expr, n))}`);
    }
    tooltip.value = true;
}

function on_leave() {
    tooltip.value = false;
}

function do_expand(tier?: number, focus?: boolean) {
    const v = settings.variant;
    try {
        const child = expand_item(props.node, props.notation, v, tier ?? props.tier ?? 0, settings.max_find_fs);
        if (focus && child) focus_node_input(child, settings.scroll_on_focus);
    } catch (e) {
        alert('当前节点试展开次数过多, 可能基本列实现有误');
    }
}

function on_expr_mousedown(e: MouseEvent) {
    if (e.detail > 1) e.preventDefault(); // 阻止双击全选
}

function on_pending_badge_click() {
    expand_pending_node(props.node, props.notation, settings.variant, settings.max_find_fs);
}

function on_expr_click(e: MouseEvent) {
    if (e.ctrlKey) {
        e.preventDefault();
        multi.toggle(node_path, (resolved_equiv.value ?? resolved_original.value).plain(props.node.expr));
        return;
    }
    if (window.getSelection()?.toString()) return;
    do_expand(undefined, false);
}

function on_keydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey) {
        if (!(e.ctrlKey && ['c', 'v', 'a', 'x', 'z'].includes(e.key.toLowerCase()))) {
            e.preventDefault();
        }
    }

    if (e.key === 'ArrowUp' && !e.ctrlKey) {
        e.preventDefault();
        const skip = e.shiftKey ? 1 : 0;
        const target = e.altKey ? find_prev_analysis(props.node, skip) : find_prev(props.node, skip);
        if (target) focus_node(target.path ?? '' + target.index, settings.scroll_on_focus);
    } else if (e.key === 'ArrowDown' && !e.ctrlKey) {
        e.preventDefault();
        const skip = e.shiftKey ? 1 : 0;
        const target = e.altKey ? find_next_analysis(props.node, skip) : find_next(props.node, skip);
        if (target) focus_node(target.path ?? '' + target.index, settings.scroll_on_focus);
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        dispatch_diagram_action({
            type: 'scroll',
            direction: 'up',
            step: 1,
        });
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        dispatch_diagram_action({
            type: 'scroll',
            direction: 'down',
            step: 1,
        });
    } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        dispatch_diagram_action({
            type: 'scroll',
            direction: 'left',
            step: 1,
        });
    } else if (e.key === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        dispatch_diagram_action({
            type: 'scroll',
            direction: 'right',
            step: 1,
        });
    } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        do_expand(0, true);
    } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        do_expand(1, true);
    } else if (e.key.toLowerCase() === 'e' && e.ctrlKey) {
        e.preventDefault();
        const ed_expand = use_expand_dialog();
        ed_expand.open(ed.value.analysis![0] ?? '', settings.expand);
    } else if (e.key.toLowerCase() === 'd' && e.ctrlKey) {
        e.preventDefault();
        console.log('DEBUG expr:', props.node.expr);
        (window as any).expr = props.node.expr;
        (window as any).notation = props.notation;
    } else if (e.key.toLowerCase() === 'h' && e.ctrlKey) {
        e.preventDefault();
        ed.value.hide_child = !ed.value.hide_child;
    } else if (e.key.toLowerCase() === 'z' && e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (saved_analysis.value !== undefined) {
            e.preventDefault();
            ed.value.analysis![0] = saved_analysis.value;
            saved_analysis.value = undefined;
        }
    } else if (e.key === 'Delete' && settings.use_delete_to_clear) {
        e.preventDefault();
        if (ed.value.analysis?.[0] !== undefined) saved_analysis.value = ed.value.analysis[0];
        ed.value.analysis![0] = undefined as unknown as string;
    }
}

function has_analysis(node: TreeNode<T>): boolean {
    const ed = node.extraData as TreeNodeExtra | undefined;
    return ed?.analysis?.[0] !== undefined;
}

function find_prev_analysis(node: TreeNode<T>, skip: number): TreeNode<T> | undefined {
    let cur = find_prev(node, skip);
    while (cur && !has_analysis(cur)) {
        cur = find_prev(cur, skip);
    }
    return cur;
}

function find_next_analysis(node: TreeNode<T>, skip: number): TreeNode<T> | undefined {
    let cur = find_next(node, skip);
    while (cur && !has_analysis(cur)) {
        cur = find_next(cur, skip);
    }
    return cur;
}

function caret_pixel_pos(input: HTMLInputElement, pos: number): number {
    const div = document.createElement('div');
    const s = getComputedStyle(input);
    div.style.font = s.font;
    div.style.padding = s.padding;
    div.style.border = s.border;
    div.style.letterSpacing = s.letterSpacing;
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre';
    div.textContent = input.value.slice(0, pos);
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    document.body.appendChild(div);
    const left = span.offsetLeft;
    document.body.removeChild(div);
    return left;
}

function on_focus(e: FocusEvent) {
    focused.value = true;
    set_last_focus(node_path);

    const el = e.target as HTMLInputElement;
    const r = el.getBoundingClientRect();
    if (settings.scroll_on_focus) {
        const target_scroll = r.top + window.scrollY - 60;
        window.scrollTo({ top: target_scroll, behavior: 'smooth' });
    }

    el.selectionStart = el.selectionEnd;
    const pixel_pos = caret_pixel_pos(el, el.selectionStart ?? 0);
    el.scrollLeft = pixel_pos - el.clientWidth / 2;

    const dc = props.notation.draw_diagram;
    if (settings.analysis_latex_preview) {
        hide_diagram();
        show_latex_viewer(analysis0.value, r.left, 60 + r.height);
    } else if (dc && settings.show_diagram) {
        show_diagram(dc, props.node.expr, r.left, 60 + r.height, settings.equiv_active[props.notation.id] ?? undefined);
        hide_latex_viewer();
    } else {
        hide_diagram();
        hide_latex_viewer();
    }
}

function on_input_mousedown(e: MouseEvent) {
    e.stopPropagation();
    prepare_pointer_focus(e.currentTarget as HTMLInputElement, settings.scroll_on_focus);
}

function on_blur() {
    focused.value = false;
    hide_diagram();
    hide_latex_viewer();
}
</script>

<template>
    <li class="tree-item">
        <div
            ref="shown_ref"
            class="shown-item"
            :class="{
                analyzed: has_analysis(node),
                selected: multi.is_selected(node_path),
            }"
            @mousedown="on_expr_mousedown"
            @click="on_expr_click"
            @dblclick.prevent
            @mouseenter="on_enter"
            @mouseleave="on_leave"
        >
            <input
                v-model="ed.hide_child"
                class="subtree-toggle"
                type="checkbox"
                :aria-label="t('hotkey.toggle-children')"
                @mousedown.stop
                @click.stop
            />
            <span v-if="pending_count > 0" class="pending-badge" @mousedown.stop @click.stop="on_pending_badge_click"
                >({{ pending_count }})</span
            >
            <span
                ref="resize_span"
                class="input-resize"
                :style="{ width: settings.input_width + 'px' }"
                :class="{
                    'input-hidden': !settings.show_input,
                    'has-inline-latex': show_inline_analysis_latex,
                }"
                @mousedown.stop
            >
                <input
                    ref="input_ref"
                    type="text"
                    spellcheck="false"
                    v-model="analysis0"
                    @keydown="on_keydown"
                    @mousedown="on_input_mousedown"
                    @click.stop
                    @focus="on_focus"
                    @blur="on_blur"
                />
                <span v-if="show_inline_analysis_latex" class="analysis-inline-latex" aria-hidden="true">
                    <RenderLatex :latex="analysis0" />
                </span>
            </span>
            <div v-if="equiv_mode ? on_screen : true" class="equiv-rows">
                <div class="equiv-row equiv-row--primary">
                    <span class="notation-expression" :class="{ 'is-latex': settings.display_mode === 'latex' }">
                        <span class="notation-expression__active">
                            <RenderLatex
                                v-if="settings.display_mode === 'latex'"
                                :latex="primary_row.render('latex')"
                            />
                            <span v-else class="expr-display" v-html="primary_row.render(settings.display_mode)" />
                        </span>
                        <span v-if="comparison_original_row" class="notation-expression__original">
                            <span class="notation-expression__separator" aria-hidden="true"> = </span>
                            <span class="notation-expression__original-value">
                                <RenderLatex
                                    v-if="settings.display_mode === 'latex'"
                                    :latex="comparison_original_row.render('latex')"
                                />
                                <span
                                    v-else
                                    class="expr-display"
                                    v-html="comparison_original_row.render(settings.display_mode)"
                                />
                            </span>
                        </span>
                    </span>
                </div>
                <div v-for="row in extra_equiv_rows" :key="row.id" class="equiv-row equiv-row--secondary">
                    <span v-if="row.label" class="equiv-label">{{ row.label }}:</span>
                    <RenderLatex v-if="settings.display_mode === 'latex'" :latex="row.render('latex')" />
                    <span v-else class="expr-display" v-html="row.render(settings.display_mode)" />
                </div>
            </div>
            <div v-if="tooltip" class="tooltip" @mousedown.stop>
                <RenderLatex v-if="settings.display_mode === 'latex'" :latex="primary_display(node.expr)" />
                <span v-else v-html="primary_display(node.expr)" />{{ t('notation-tree.fundamental-sequence') }}
                <div v-for="term in tooltip_FS" :key="term">
                    <RenderLatex v-if="settings.display_mode === 'latex'" :latex="term" />
                    <span v-else v-html="term" />
                </div>
            </div>
        </div>
        <ul v-if="node.children.length > 0 && !ed.hide_child" class="nowrap tree-children">
            <NotationTreeItem
                v-for="child in node.children"
                :key="child.path ?? child.index"
                :node="child"
                :notation="notation"
                :tier="tier"
            />
        </ul>
    </li>
</template>
