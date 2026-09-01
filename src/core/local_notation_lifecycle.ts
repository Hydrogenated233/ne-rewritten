import type { Settings } from '@/core/settings.ts';
import type { LocalNotationFile, StorageLike } from '@/core/local_notation_store.ts';
import { analysis_storage_key, note_storage_key } from '@/core/storage_keys.ts';

export type LocalNotationLifecycleAction = 'save' | 'replace-upload' | 'upload' | 'enable' | 'disable' | 'delete';

export interface LocalNotationLifecycleSnapshot {
    notationOrder: string[];
    currentNotationId: string;
    oldNotationIds: string[];
    knownNotationIds: string[];
}

export interface LocalNotationLifecycleResult {
    file: LocalNotationFile;
    previous?: LocalNotationFile;
    enabled?: boolean;
    sourceChanged?: boolean;
    deleted?: boolean;
}

export interface LocalNotationLifecycleContext {
    action: LocalNotationLifecycleAction;
    result: LocalNotationLifecycleResult;
    snapshot: LocalNotationLifecycleSnapshot;
    availableNotationIds: string[];
    trees: Map<string, unknown>;
    settings: Pick<
        Settings,
        'current_notation_id' | 'equiv_active' | 'equiv_hide_original' | 'shown_equiv' | 'expand'
    >;
    storage: Pick<StorageLike, 'getItem' | 'setItem'> & { removeItem?: (key: string) => void };
}

function unique(ids: Iterable<string>): string[] {
    return [...new Set([...ids].filter((id) => typeof id === 'string' && id.length > 0))];
}

function remove_storage(storage: LocalNotationLifecycleContext['storage'], key: string): void {
    storage.removeItem?.(key);
}

function remove_analysis(storage: LocalNotationLifecycleContext['storage'], ids: Iterable<string>): void {
    for (const id of unique(ids)) remove_storage(storage, analysis_storage_key(id));
}

function remove_notes(storage: LocalNotationLifecycleContext['storage'], ids: Iterable<string>): void {
    for (const id of unique(ids)) remove_storage(storage, note_storage_key(id));
}

function clear_equivalent_state(
    settings: LocalNotationLifecycleContext['settings'],
    ids: Iterable<string>,
): void {
    for (const id of unique(ids)) {
        delete settings.equiv_active[id];
        delete settings.equiv_hide_original[id];
        delete settings.shown_equiv[id];
    }
}

function clear_trees(trees: Map<string, unknown>, ids: Iterable<string>): void {
    for (const id of unique(ids)) trees.delete(id);
}

function next_surviving_notation(snapshot: LocalNotationLifecycleSnapshot, available: string[]): string {
    if (available.includes(snapshot.currentNotationId)) return snapshot.currentNotationId;
    const oldIndex = snapshot.notationOrder.indexOf(snapshot.currentNotationId);
    if (oldIndex >= 0) {
        for (let index = oldIndex + 1; index < snapshot.notationOrder.length; index++) {
            if (available.includes(snapshot.notationOrder[index])) return snapshot.notationOrder[index];
        }
        for (let index = oldIndex - 1; index >= 0; index--) {
            if (available.includes(snapshot.notationOrder[index])) return snapshot.notationOrder[index];
        }
    }
    return available[0] ?? '';
}

function reconcile_selection(context: LocalNotationLifecycleContext, preferred?: string): void {
    const available = context.availableNotationIds;
    const selected = preferred && available.includes(preferred)
        ? preferred
        : next_surviving_notation(context.snapshot, available);
    context.settings.current_notation_id = selected;
    if (!available.includes(context.settings.expand.notation_id)) {
        context.settings.expand = {
            ...context.settings.expand,
            notation_id: available[0] ?? '',
            notation_equiv: undefined,
        };
    }
}

/**
 * Apply the state changes that surround a local-file mutation. Registry
 * replacement is owned by LocalNotationRuntime; this function only resets
 * user-facing trees and persisted analysis/equivalent state.
 */
export function apply_local_notation_lifecycle(context: LocalNotationLifecycleContext): void {
    const { action, result, snapshot } = context;
    const oldIds = unique([
        ...snapshot.oldNotationIds,
        ...snapshot.knownNotationIds,
        ...(result.previous?.manifest.notations ?? []),
    ]);
    const newIds = unique(result.file.manifest.notations);

    if (action === 'delete') {
        const removedIds = unique([...oldIds, ...result.file.knownNotationIds, ...newIds]);
        clear_trees(context.trees, removedIds);
        remove_analysis(context.storage, removedIds);
        remove_notes(context.storage, removedIds);
        clear_equivalent_state(context.settings, removedIds);
        reconcile_selection(context);
        return;
    }

    if (action === 'disable') {
        clear_trees(context.trees, newIds.length ? newIds : oldIds);
        reconcile_selection(context);
        return;
    }

    if (action === 'save' || action === 'replace-upload') {
        // A disabled file is source-only state. Its previous analysis remains
        // valid for the last loaded revision and must survive editing; it is
        // invalidated only when the changed source is loaded again.
        const remainsEnabled = result.enabled ?? result.file.enabled;
        if (result.sourceChanged && remainsEnabled) {
            const affectedIds = unique([...oldIds, ...newIds]);
            clear_trees(context.trees, affectedIds);
            remove_analysis(context.storage, affectedIds);
            clear_equivalent_state(context.settings, oldIds.filter((id) => !newIds.includes(id)));
        }
        reconcile_selection(context);
        return;
    }

    if (action === 'enable') {
        clear_trees(context.trees, newIds.length ? newIds : oldIds);
        if (result.sourceChanged) {
            remove_analysis(context.storage, oldIds);
            clear_equivalent_state(context.settings, oldIds.filter((id) => !newIds.includes(id)));
        }
        reconcile_selection(context);
        return;
    }

    if (action === 'upload') {
        clear_trees(context.trees, newIds);
        reconcile_selection(context, newIds[0]);
    }
}
