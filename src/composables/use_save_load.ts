import type { Ref } from 'vue';
import { computed, inject, type InjectionKey, reactive, ref, watch } from 'vue';
import { get_notation, list_notations } from '@/core/registry.ts';
import { init_dataset, type TreeNode } from '@/core/tree.ts';
import {
    expand_all_pending,
    export_analysis,
    import_analysis,
    parse_analysis_entries,
    stringify_analysis_entries,
} from '@/core/analysis.ts';
import type { NotationDefinition } from '@/notation-definition.ts';
import { resolve_display } from '@/notation-definition.ts';
import { download_buffer, export_analysis_with_notes_to_xlsx, import_from_xlsx } from '@/core/xlsx_io.ts';
import { SETTINGS_KEY } from '@/composables/use_settings.ts';
import { use_ui_states } from '@/composables/use_ui_states.ts';
import { app_storage } from '@/core/storage.ts';
import { analysis_storage_key, note_storage_key } from '@/core/storage_keys.ts';
import {
    apply_local_notation_lifecycle,
    type LocalNotationLifecycleAction,
    type LocalNotationLifecycleResult,
    type LocalNotationLifecycleSnapshot,
} from '@/core/local_notation_lifecycle.ts';
import type { LocalNotationFile } from '@/core/local_notation_store.ts';

export interface SaveLoadInstance {
    trees: Map<string, TreeNode<unknown>>;
    notation: Ref<NotationDefinition<unknown> | undefined>;
    root: Ref<TreeNode<unknown> | null>;
    last_save_time: Ref<number>;
    save_indicator: Ref<string>;
    save_analysis: () => void;
    load_analysis: (id: string, r: TreeNode<unknown>) => void;
    handle_reset: () => void;
    handle_export: () => Promise<void>;
    handle_import: () => Promise<void>;
    init: () => void;
    dispose: () => void;
    capture_local_file_state: (file: LocalNotationFile, action: LocalNotationLifecycleAction) => LocalNotationLifecycleSnapshot;
    apply_local_file_change: (
        result: LocalNotationLifecycleResult,
        action: LocalNotationLifecycleAction,
        snapshot: LocalNotationLifecycleSnapshot,
    ) => void;
}

export const SAVE_LOAD_KEY: InjectionKey<SaveLoadInstance> = Symbol('save_load');

export function use_save_load(
    trees: Map<string, TreeNode<any>>,
    t: (key: string, params?: Record<string, string>) => string,
) {
    const settings = inject(SETTINGS_KEY)!;
    const ui = use_ui_states();

    const current_id = computed(() => settings.current_notation_id);
    const notation = computed<NotationDefinition<any> | undefined>(() => {
        ui.registry_notifier.listen(); // registry 变化(如 reload_all)时重新解析当前记号
        return get_notation(current_id.value);
    });
    const root = computed<TreeNode<any> | null>(() => {
        let r = trees.get(current_id.value);
        if (!r) {
            const n = notation.value;
            if (!n) return null;
            r = reactive(init_dataset(n));
            trees.set(current_id.value, r);
        }
        return r;
    });

    const last_save_time = ref(Date.now());
    const save_indicator = ref('');

    let auto_save_timer: ReturnType<typeof setInterval> | null = null;
    let save_indicator_raf: number | null = null;

    function update_save_indicator() {
        const elapsed = Math.floor((Date.now() - last_save_time.value) / 1000);
        if (elapsed < 60) save_indicator.value = elapsed + 's';
        else save_indicator.value = Math.floor(elapsed / 60) + 'm' + (elapsed % 60) + 's';
        save_indicator_raf = requestAnimationFrame(update_save_indicator);
    }

    function save_analysis_for(id: string, r: TreeNode<any>): boolean {
        const n = get_notation(id);
        if (!n) return false;
        try {
            const entries = export_analysis(r, settings.auto_save_hidden);
            app_storage()?.setItem(analysis_storage_key(n.id), stringify_analysis_entries(entries));
            return true;
        } catch {
            // Analysis is auxiliary state. A private-mode/quota failure must
            // not prevent the source transaction from completing.
            return false;
        }
    }

    function save_analysis() {
        // Materialize the current tree before iterating the cache.
        void root.value;
        let saved = false;
        // A local file can register several notations. Persist every tree that
        // is already materialized before changing the registry, not just the
        // notation currently selected in the toolbar.
        for (const [id, tree] of trees.entries()) {
            if (save_analysis_for(id, tree)) saved = true;
        }
        if (saved) {
            last_save_time.value = Date.now();
            update_save_indicator();
        }
    }

    function load_analysis(id: string, r: TreeNode<any>) {
        const n = get_notation(id);
        if (!n) return;
        const raw = app_storage()?.getItem(analysis_storage_key(id));
        if (!raw) return;
        try {
            const entries: any[] = parse_analysis_entries(raw);
            import_analysis(r, entries, n);
        } catch {
            /* ignore corrupt data */
        }
    }

    function handle_reset() {
        const n = notation.value;
        if (!n) return;
        app_storage()?.removeItem?.(analysis_storage_key(n.id));
        const new_root: TreeNode<any> = reactive(init_dataset(n));
        trees.set(n.id, new_root);
    }

    function capture_local_file_state(file: LocalNotationFile, _action: LocalNotationLifecycleAction): LocalNotationLifecycleSnapshot {
        save_analysis();
        return {
            notationOrder: list_notations().map((item) => item.id),
            currentNotationId: settings.current_notation_id,
            oldNotationIds: [...(file.manifest?.notations ?? [])],
            knownNotationIds: [...(file.knownNotationIds ?? [])],
        };
    }

    function apply_local_file_change(
        result: LocalNotationLifecycleResult,
        action: LocalNotationLifecycleAction,
        snapshot: LocalNotationLifecycleSnapshot,
    ): void {
        apply_local_notation_lifecycle({
            action,
            result,
            snapshot,
            availableNotationIds: list_notations().map((item) => item.id),
            trees,
            settings,
            storage: app_storage() as any,
        });
    }

    async function handle_export() {
        const n = notation.value;
        const r = root.value;
        if (!n || !r) return;
        const entries = export_analysis(r, settings.export_hide);
        const equiv_name = settings.equiv_active[n.id];
        const display_fn =
            equiv_name && n.display_equiv?.[equiv_name]
                ? resolve_display(n.display_equiv[equiv_name]).plain
                : resolve_display(n.display).plain;
        let note = '';
        try {
            note = app_storage()?.getItem(note_storage_key(n.id)) ?? '';
        } catch {
            // Notes are optional; a storage failure must not block analysis export.
        }
        const buf = await export_analysis_with_notes_to_xlsx(
            entries,
            display_fn,
            settings.export_hide,
            note ? [{ name: t('notes.sheet'), text: note }] : [],
        );
        download_buffer(buf, `${n.id}_analysis.xlsx`);
    }

    async function handle_import() {
        const el = document.createElement('input');
        el.type = 'file';
        el.accept = '.xlsx';
        el.style.display = 'none';
        el.addEventListener('change', async (e: Event) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) return;
            const n = notation.value;
            const r = root.value;
            if (!n || !r) return;
            const equiv_name = settings.equiv_active[n.id];
            const display_spec =
                equiv_name && n.display_equiv?.[equiv_name]
                    ? resolve_display(n.display_equiv[equiv_name])
                    : resolve_display(n.display);
            if (!display_spec.from_display) return;
            const buf = await file.arrayBuffer();
            const entries = await import_from_xlsx(buf, display_spec.from_display);
            const { matched, not_found } = import_analysis(r, entries, n);
            if ((entries as any).skipped?.length || not_found.length > 0) {
                alert(t('import.error'));
            }
            if (settings.expand_all_on_import) {
                expand_all_pending(r, n, settings.variant, settings.max_find_fs);
            }
            if (matched.length > 0) {
                const last = matched[matched.length - 1];
                const ed = (last.extraData ??= {}) as any;
                ed.focus_on_mounted = true;
            }
            document.body.removeChild(el);
        });
        document.body.appendChild(el);
        el.click();
    }

    // 初始化加载当前记号的分析
    function init_load() {
        const r = root.value;
        if (r) load_analysis(current_id.value, r);
    }

    // onMounted: 启动自动保存与指示器
    function restart_auto_save() {
        if (auto_save_timer !== null) clearInterval(auto_save_timer);
        auto_save_timer = setInterval(save_analysis, Math.max(10, Number(settings.auto_save_interval) || 30) * 1000);
    }

    function init() {
        restart_auto_save();
        window.addEventListener('beforeunload', save_analysis);
        save_indicator_raf = requestAnimationFrame(update_save_indicator);
        init_load();
    }

    // onUnmounted: 清理
    function dispose() {
        if (auto_save_timer !== null) clearInterval(auto_save_timer);
        if (save_indicator_raf !== null) cancelAnimationFrame(save_indicator_raf);
        window.removeEventListener('beforeunload', save_analysis);
    }

    // 树创建或切换时自动加载分析
    watch(root, (r, old) => {
        if (r && r !== old) load_analysis(current_id.value, r);
    });

    watch(
        () => [settings.auto_save_interval, settings.auto_save_hidden],
        () => restart_auto_save(),
    );

    return {
        trees,
        notation,
        root,
        last_save_time,
        save_indicator,
        save_analysis,
        load_analysis,
        handle_reset,
        handle_export,
        handle_import,
        init,
        dispose,
        capture_local_file_state,
        apply_local_file_change,
    } satisfies SaveLoadInstance;
}
