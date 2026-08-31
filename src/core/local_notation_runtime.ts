import { get_notation } from '@/core/registry.ts';
import { get_script_notation_ids, get_script_warnings, reload_all } from '@/core/user_defined_notation.ts';
import type { UserScript } from '@/core/settings.ts';
import {
    LocalNotationFileStore,
    type LocalNotationError,
    type LocalNotationFile,
    type LocalNotationFileStoreOptions,
} from '@/core/local_notation_store.ts';

export interface LocalNotationMutationResult {
    file: LocalNotationFile;
    enabled: boolean;
    sourceChanged?: boolean;
    previous?: LocalNotationFile;
}

export interface LocalNotationBootResult {
    warnings: Map<string, string[]>;
    files: LocalNotationFile[];
}

export interface LegacyNotationMigrationResult {
    migrated: LocalNotationFile[];
    skipped: string[];
}

export class LocalNotationRuntimeError extends Error {
    readonly code = 'SOURCE_INVALID';

    constructor(
        message: string,
        readonly warnings: Map<string, string[]> = new Map(),
    ) {
        super(message);
        this.name = 'LocalNotationRuntimeError';
    }
}

function error_from_warnings(warnings: Map<string, string[]>): LocalNotationError {
    const first = [...warnings.entries()][0];
    const message = first ? `${first[0]}: ${first[1].join(' ')}` : 'The notation source is invalid.';
    return { code: 'SOURCE_INVALID', message, line: null, column: null, at: Date.now() };
}

export class LocalNotationRuntime {
    readonly store: LocalNotationFileStore;

    constructor(options: LocalNotationFileStoreOptions = {}) {
        this.store = new LocalNotationFileStore(options);
    }

    listFiles(): LocalNotationFile[] {
        return this.store.listFiles();
    }

    getFile(id: string): LocalNotationFile | undefined {
        return this.store.getFile(id);
    }

    getDraft(id: string) {
        return this.store.getDraft(id);
    }

    setDraft(id: string, draft: Parameters<LocalNotationFileStore['setDraft']>[1]) {
        return this.store.setDraft(id, draft);
    }

    clearDraft(id: string) {
        return this.store.clearDraft(id);
    }

    findByName(name: string): LocalNotationFile | undefined {
        const normalized = name.trim().toLowerCase();
        return this.listFiles().find((file) => file.name.toLowerCase() === normalized);
    }

    /**
     * Convert the pre-ne-rewritten settings shape once. Existing scripts were
     * already user-authored, so they are trusted, but their enabled state is
     * preserved as pending state and is still only executed after `boot()`.
     */
    migrateLegacyScripts(scripts: UserScript[]): LegacyNotationMigrationResult {
        const migrated: LocalNotationFile[] = [];
        const skipped: string[] = [];
        const usedNames = new Set(this.listFiles().map((file) => file.name.toLowerCase()));
        for (const script of scripts) {
            const rawName = script.file_name.trim();
            const baseName = rawName || 'untitled';
            const normalizedName = /\.js$/i.test(baseName) ? baseName : `${baseName}.js`;
            if (usedNames.has(normalizedName.toLowerCase())) {
                skipped.push(normalizedName);
                continue;
            }
            let name = normalizedName;
            let suffix = 1;
            while (usedNames.has(name.toLowerCase())) {
                const stem = normalizedName.replace(/\.js$/i, '');
                name = `${stem}_${suffix++}.js`;
            }
            try {
                migrated.push(
                    this.store.createFile({
                        name,
                        source: script.code,
                        trusted: true,
                        enabled: script.enabled,
                    }),
                );
                usedNames.add(name.toLowerCase());
            } catch {
                skipped.push(name);
            }
        }
        return { migrated, skipped };
    }

    createUpload(name: string, source: string, trusted = false): LocalNotationMutationResult {
        const file = this.store.createFile({ name, source, trusted, enabled: false });
        if (!trusted) return { file, enabled: false };
        return this.enable(file.id);
    }

    createTemplate(name: string, source: string): LocalNotationFile {
        return this.store.createFile({ name, source, trusted: true, enabled: false, template: true });
    }

    trustFile(id: string): LocalNotationFile {
        return this.store.updateFile(id, { trusted: true, lastError: null });
    }

    enable(id: string): LocalNotationMutationResult {
        const file = this.require_file(id);
        if (!file.trusted) throw new LocalNotationRuntimeError('Local notation file is not trusted yet.');
        if (file.enabled) return { file, enabled: true, sourceChanged: false };

        const previous = this.listFiles();
        const candidateFile = this.with_file_patch(file, { enabled: true });
        const candidate = previous.map((item) => (item.id === id ? candidateFile : item));
        try {
            this.apply_or_throw(candidate);
        } catch (error) {
            try {
                this.store.updateFile(id, { enabled: false, lastError: this.error_from_exception(error) });
            } catch {
                // Keep the original validation failure as the user-facing error.
            }
            throw error;
        }
        let persisted: LocalNotationFile;
        try {
            persisted = this.store.updateFile(id, {
                enabled: true,
                loadedRevision: file.sourceRevision,
                manifest: this.manifest_for(id, candidate),
                lastError: null,
            });
        } catch (error) {
            this.apply_or_throw(previous);
            throw error;
        }
        return { file: persisted, previous: file, enabled: true, sourceChanged: file.loadedRevision !== file.sourceRevision };
    }

    disable(id: string): LocalNotationMutationResult {
        const file = this.require_file(id);
        if (!file.enabled) return { file, enabled: false };
        const previous = this.listFiles();
        const candidate = previous.map((item) => (item.id === id ? this.with_file_patch(file, { enabled: false }) : item));
        this.apply_or_throw(candidate);
        let persisted: LocalNotationFile;
        try {
            persisted = this.store.updateFile(id, { enabled: false, lastError: null });
        } catch (error) {
            this.apply_or_throw(previous);
            throw error;
        }
        return { file: persisted, previous: file, enabled: false };
    }

    saveFile(id: string, name: string, source: string): LocalNotationMutationResult {
        const file = this.require_file(id);
        const sourceChanged = source !== file.source;
        const nameChanged = name !== file.name;
        if (!sourceChanged && !nameChanged) {
            return { file, enabled: file.enabled, sourceChanged: false };
        }

        const candidateFile = this.with_file_patch(file, { name, source });
        if (file.enabled) {
            const candidate = this.listFiles().map((item) => (item.id === id ? candidateFile : item));
            try {
                this.apply_or_throw(candidate);
            } catch (error) {
                try {
                    this.store.updateFile(id, { lastError: this.error_from_exception(error) });
                } catch {
                    // Preserve the active source even if error metadata cannot be saved.
                }
                throw error;
            }
        }

        try {
            const persisted = this.store.updateFileAndClearDraft(id, {
                name,
                source,
                lastError: null,
                ...(file.enabled ? { enabled: true, loadedRevision: candidateFile.sourceRevision } : {}),
            });
            return { file: persisted, previous: file, enabled: persisted.enabled, sourceChanged };
        } catch (error) {
            if (file.enabled) this.apply_or_throw(this.listFiles());
            throw error;
        }
    }

    replaceUpload(id: string, name: string, source: string): LocalNotationMutationResult {
        return this.saveFile(id, name, source);
    }

    deleteFile(id: string): { file: LocalNotationFile; previous: LocalNotationFile; deleted: true } {
        const file = this.require_file(id);
        const previous = this.listFiles();
        if (file.enabled) this.apply_or_throw(previous.filter((item) => item.id !== id));
        try {
            const removed = this.store.deleteFile(id);
            return { file: removed, previous: file, deleted: true };
        } catch (error) {
            if (file.enabled) this.apply_or_throw(previous);
            throw error;
        }
    }

    reorderFiles(ids: string[]): LocalNotationFile[] {
        return this.store.reorderFiles(ids);
    }

    boot(): LocalNotationBootResult {
        let files = this.listFiles();
        let warnings = this.apply(files);
        // A bad file must not prevent unrelated trusted files from loading.
        // Disable each file reported by the transactional candidate and retry.
        while (warnings.size > 0) {
            const failed_names = new Set(warnings.keys());
            const failed_files = files.filter((file) => file.enabled && failed_names.has(file.name));
            if (failed_files.length === 0) break;
            for (const file of failed_files) {
                try {
                    this.store.updateFile(file.id, {
                        enabled: false,
                        lastError: error_from_warnings(new Map([[file.name, warnings.get(file.name)!]])),
                    });
                } catch {
                    // Keep the in-memory registry usable even when storage is unavailable.
                }
            }
            files = this.listFiles();
            warnings = this.apply(files);
        }
        return { warnings, files: this.listFiles() };
    }

    reload(): LocalNotationBootResult {
        const files = this.listFiles();
        const warnings = this.apply(files);
        return { warnings, files };
    }

    private apply(files: LocalNotationFile[]): Map<string, string[]> {
        reload_all(
            files.map((file) => ({
                file_name: file.name,
                code: file.source,
                enabled: file.enabled && file.trusted,
            })),
        );
        return get_script_warnings();
    }

    private apply_or_throw(files: LocalNotationFile[]): void {
        const warnings = this.apply(files);
        if (warnings.size > 0) throw new LocalNotationRuntimeError('The notation source could not be loaded.', warnings);
    }

    private error_from_exception(error: unknown): LocalNotationError {
        if (error instanceof LocalNotationRuntimeError) return error_from_warnings(error.warnings);
        return {
            code: 'SOURCE_INVALID',
            message: error instanceof Error ? error.message : String(error),
            line: null,
            column: null,
            at: Date.now(),
        };
    }

    private with_file_patch(file: LocalNotationFile, patch: Partial<LocalNotationFile>): LocalNotationFile {
        return {
            ...file,
            ...patch,
            sourceRevision:
                patch.source !== undefined && patch.source !== file.source ? file.sourceRevision + 1 : file.sourceRevision,
        };
    }

    private manifest_for(id: string, files: LocalNotationFile[]) {
        const index = files.findIndex((file) => file.id === id);
        const notation_ids = index < 0 ? [] : get_script_notation_ids(index).filter((notation_id) => get_notation(notation_id));
        return { notations: notation_ids, categories: [] };
    }

    private require_file(id: string): LocalNotationFile {
        const file = this.getFile(id);
        if (!file) throw new Error(`Local notation file '${id}' was not found.`);
        return file;
    }
}
