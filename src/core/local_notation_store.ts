import { app_storage } from '@/core/storage.ts';
import { APP_STORAGE_KEYS } from '@/core/storage_keys.ts';

export const LOCAL_NOTATION_STORE_VERSION = 1;
export const DEFAULT_LOCAL_NOTATION_STORE_KEY = APP_STORAGE_KEYS.localNotationFiles;

export interface LocalNotationError {
    code: string;
    message: string;
    line?: number | null;
    column?: number | null;
    stack?: string;
    at: number;
}

export interface LocalNotationManifest {
    notations: string[];
    categories: string[];
}

export interface LocalNotationFile {
    id: string;
    name: string;
    source: string;
    enabled: boolean;
    trusted: boolean;
    template: boolean;
    order: number;
    createdAt: number;
    updatedAt: number;
    sourceRevision: number;
    loadedRevision: number;
    manifest: LocalNotationManifest;
    knownNotationIds: string[];
    knownCategoryIds: string[];
    lastError: LocalNotationError | null;
}

export interface LocalNotationDraft {
    name?: string;
    source: string;
    updatedAt: number;
}

interface StoreState {
    version: number;
    nextOrder: number;
    files: LocalNotationFile[];
    drafts: Record<string, LocalNotationDraft>;
}

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export class LocalNotationStorageError extends Error {
    constructor(
        readonly code:
            | 'STORAGE_UNAVAILABLE'
            | 'STORAGE_READ_FAILED'
            | 'STORAGE_CORRUPT'
            | 'UNSUPPORTED_VERSION'
            | 'STORAGE_WRITE_FAILED'
            | 'QUOTA_EXCEEDED'
            | 'SERIALIZATION_FAILED'
            | 'INVALID_FILE'
            | 'INVALID_FILE_NAME'
            | 'DUPLICATE_FILE_ID'
            | 'DUPLICATE_FILE_NAME'
            | 'FILE_NOT_FOUND'
            | 'INVALID_DRAFT',
        message: string,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = 'LocalNotationStorageError';
    }
}

function clone<T>(value: T): T {
    if (value === undefined) return value;
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch (error) {
        throw new LocalNotationStorageError('SERIALIZATION_FAILED', 'Local notation data could not be serialized.', {
            cause: error,
        });
    }
}

function default_state(): StoreState {
    return { version: LOCAL_NOTATION_STORE_VERSION, nextOrder: 1, files: [], drafts: {} };
}

function string_array(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalize_file(value: unknown, index: number): LocalNotationFile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation file data has an invalid shape.');
    }
    const file = value as Partial<LocalNotationFile>;
    if (typeof file.id !== 'string' || typeof file.name !== 'string' || typeof file.source !== 'string') {
        throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation file data is missing its ID, name, or source.');
    }
    const manifest = file.manifest && typeof file.manifest === 'object' ? file.manifest : undefined;
    return {
        ...file,
        id: file.id,
        name: file.name,
        source: file.source,
        enabled: file.enabled === true,
        trusted: file.trusted === true,
        template: file.template === true,
        order: Number.isFinite(file.order) ? Number(file.order) : index + 1,
        createdAt: Number.isFinite(file.createdAt) ? Number(file.createdAt) : 0,
        updatedAt: Number.isFinite(file.updatedAt) ? Number(file.updatedAt) : 0,
        sourceRevision: Number.isInteger(file.sourceRevision) && Number(file.sourceRevision) > 0 ? Number(file.sourceRevision) : 1,
        loadedRevision: Number.isInteger(file.loadedRevision) && Number(file.loadedRevision) >= 0 ? Number(file.loadedRevision) : 0,
        manifest: {
            notations: string_array(manifest?.notations),
            categories: string_array(manifest?.categories),
        },
        knownNotationIds: string_array(file.knownNotationIds),
        knownCategoryIds: string_array(file.knownCategoryIds),
        lastError: file.lastError && typeof file.lastError === 'object' ? file.lastError : null,
    };
}

function default_id(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function is_quota_error(error: unknown): boolean {
    const value = error as { name?: string; code?: number } | null;
    return (
        value?.name === 'QuotaExceededError' ||
        value?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        value?.code === 22 ||
        value?.code === 1014
    );
}

function browser_storage(): StorageLike | null {
    return app_storage();
}

export interface LocalNotationFileStoreOptions {
    storage?: StorageLike | null;
    key?: string;
    now?: () => number;
    createId?: () => string;
}

export class LocalNotationFileStore {
    private readonly storage: StorageLike | null;
    private readonly key: string;
    private readonly now: () => number;
    private readonly createId: () => string;

    constructor(options: LocalNotationFileStoreOptions = {}) {
        this.storage = options.storage === undefined ? browser_storage() : options.storage;
        this.key = options.key ?? DEFAULT_LOCAL_NOTATION_STORE_KEY;
        this.now = options.now ?? (() => Date.now());
        this.createId = options.createId ?? default_id;
    }

    snapshot(): StoreState {
        return clone(this.read());
    }

    listFiles(): LocalNotationFile[] {
        return this.read()
            .files.slice()
            .sort((a, b) => a.order - b.order)
            .map((file) => clone(file));
    }

    getFile(id: string): LocalNotationFile | undefined {
        const file = this.read().files.find((candidate) => candidate.id === id);
        return file ? clone(file) : undefined;
    }

    createFile(record: Partial<LocalNotationFile> & Pick<LocalNotationFile, 'name'>): LocalNotationFile {
        return this.mutate((state) => {
            const id = record.id ?? this.createId();
            if (!id.trim()) throw new LocalNotationStorageError('INVALID_FILE', 'A local notation file ID is required.');
            if (state.files.some((file) => file.id === id)) {
                throw new LocalNotationStorageError('DUPLICATE_FILE_ID', `A local notation file already uses ID "${id}".`);
            }
            this.validate_name(state, record.name);
            if (record.source !== undefined && typeof record.source !== 'string') {
                throw new LocalNotationStorageError('INVALID_FILE', 'Local notation source must be a string.');
            }
            const timestamp = this.now();
            const file: LocalNotationFile = {
                id,
                name: record.name.trim(),
                source: record.source ?? '',
                enabled: record.enabled ?? false,
                trusted: record.trusted ?? false,
                template: record.template ?? false,
                order: state.nextOrder++,
                createdAt: record.createdAt ?? timestamp,
                updatedAt: timestamp,
                sourceRevision: record.sourceRevision ?? 1,
                loadedRevision: record.loadedRevision ?? 0,
                manifest: clone(record.manifest ?? { notations: [], categories: [] }),
                knownNotationIds: clone(record.knownNotationIds ?? []),
                knownCategoryIds: clone(record.knownCategoryIds ?? []),
                lastError: record.lastError ?? null,
            };
            state.files.push(file);
            return file;
        });
    }

    updateFile(id: string, patch: Partial<LocalNotationFile>): LocalNotationFile {
        return this.mutate((state) => this.update_state(state, id, patch));
    }

    updateFileAndClearDraft(id: string, patch: Partial<LocalNotationFile>): LocalNotationFile {
        return this.mutate((state) => {
            const next = this.update_state(state, id, patch);
            delete state.drafts[id];
            return next;
        });
    }

    deleteFile(id: string): LocalNotationFile {
        return this.mutate((state) => {
            const index = state.files.findIndex((file) => file.id === id);
            if (index < 0) this.not_found(id);
            const removed = state.files.splice(index, 1)[0];
            delete state.drafts[id];
            return removed;
        });
    }

    reorderFiles(ids: string[]): LocalNotationFile[] {
        return this.mutate((state) => {
            const currentIds = state.files.map((file) => file.id);
            if (ids.length !== currentIds.length || new Set(ids).size !== ids.length || ids.some((id) => !currentIds.includes(id))) {
                throw new LocalNotationStorageError('INVALID_FILE', 'Local notation file order is invalid.');
            }
            const byId = new Map(state.files.map((file) => [file.id, file]));
            ids.forEach((id, index) => {
                byId.get(id)!.order = index + 1;
            });
            state.nextOrder = state.files.length + 1;
            state.files.sort((a, b) => a.order - b.order);
            return state.files;
        });
    }

    getDraft(id: string): LocalNotationDraft | undefined {
        const draft = this.read().drafts[id];
        return draft ? clone(draft) : undefined;
    }

    setDraft(id: string, draft: Omit<LocalNotationDraft, 'updatedAt'> | string): LocalNotationDraft {
        return this.mutate((state) => {
            this.find_file(state, id);
            const value: LocalNotationDraft =
                typeof draft === 'string' ? { source: draft, updatedAt: this.now() } : { ...clone(draft), updatedAt: this.now() };
            if (typeof value.source !== 'string') {
                throw new LocalNotationStorageError('INVALID_DRAFT', 'A draft must contain string source text.');
            }
            state.drafts[id] = value;
            return value;
        });
    }

    clearDraft(id: string): LocalNotationDraft | undefined {
        return this.mutate((state) => {
            const previous = state.drafts[id];
            delete state.drafts[id];
            return previous;
        });
    }

    private update_state(state: StoreState, id: string, patch: Partial<LocalNotationFile>): LocalNotationFile {
        const index = state.files.findIndex((file) => file.id === id);
        if (index < 0) this.not_found(id);
        const current = state.files[index];
        const nextName = Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : current.name;
        this.validate_name(state, nextName, id);
        if (Object.prototype.hasOwnProperty.call(patch, 'source') && typeof patch.source !== 'string') {
            throw new LocalNotationStorageError('INVALID_FILE', 'Local notation source must be a string.');
        }
        const next = { ...current, ...clone(patch) } as LocalNotationFile;
        next.id = current.id;
        next.name = String(nextName).trim();
        next.order = current.order;
        next.createdAt = current.createdAt;
        next.updatedAt = this.now();
        next.sourceRevision =
            Object.prototype.hasOwnProperty.call(patch, 'source') && patch.source !== current.source
                ? (Number(current.sourceRevision) || 0) + 1
                : current.sourceRevision;
        state.files[index] = next;
        return next;
    }

    private find_file(state: StoreState, id: string): LocalNotationFile {
        const file = state.files.find((candidate) => candidate.id === id);
        if (!file) this.not_found(id);
        return file;
    }

    private not_found(id: string): never {
        throw new LocalNotationStorageError('FILE_NOT_FOUND', `No local notation file exists with ID "${id}".`);
    }

    private validate_name(state: StoreState, name: unknown, ignoredId?: string): void {
        if (typeof name !== 'string' || !/\.js$/i.test(name.trim())) {
            throw new LocalNotationStorageError('INVALID_FILE_NAME', 'A local notation file name must end in .js.');
        }
        const normalized = name.trim().toLowerCase();
        if (state.files.some((file) => file.id !== ignoredId && file.name.trim().toLowerCase() === normalized)) {
            throw new LocalNotationStorageError('DUPLICATE_FILE_NAME', `A local notation file named "${name.trim()}" already exists.`);
        }
    }

    private read(): StoreState {
        if (!this.storage || typeof this.storage.getItem !== 'function') {
            throw new LocalNotationStorageError('STORAGE_UNAVAILABLE', 'Local notation storage is unavailable in this browser.');
        }
        let raw: string | null;
        try {
            raw = this.storage.getItem(this.key);
        } catch (error) {
            throw new LocalNotationStorageError('STORAGE_READ_FAILED', 'Local notation files could not be read from browser storage.', {
                cause: error,
            });
        }
        if (!raw) return default_state();
        let state: unknown;
        try {
            state = JSON.parse(raw);
        } catch (error) {
            throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation data is not valid JSON.', { cause: error });
        }
        if (!state || typeof state !== 'object' || Array.isArray(state)) {
            throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation data has an invalid shape.');
        }
        const value = state as Partial<StoreState>;
        if (value.version !== LOCAL_NOTATION_STORE_VERSION) {
            throw new LocalNotationStorageError(
                'UNSUPPORTED_VERSION',
                `Stored local notation data uses unsupported version ${String(value.version)}.`,
            );
        }
        if (!Array.isArray(value.files) || !value.drafts || typeof value.drafts !== 'object') {
            throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation data has an invalid shape.');
        }
        if (!Number.isInteger(value.nextOrder) || (value.nextOrder as number) < 1) {
            throw new LocalNotationStorageError('STORAGE_CORRUPT', 'Stored local notation ordering data is invalid.');
        }
        const files = value.files.map(normalize_file);
        return {
            version: LOCAL_NOTATION_STORE_VERSION,
            nextOrder: Math.max(value.nextOrder as number, ...files.map((file) => file.order + 1)),
            files,
            drafts: value.drafts as Record<string, LocalNotationDraft>,
        };
    }

    private mutate<T>(mutator: (state: StoreState) => T): T {
        const state = clone(this.read());
        const result = mutator(state);
        let serialized: string;
        try {
            serialized = JSON.stringify(state);
        } catch (error) {
            throw new LocalNotationStorageError('SERIALIZATION_FAILED', 'Local notation data could not be serialized.', {
                cause: error,
            });
        }
        try {
            this.storage!.setItem(this.key, serialized);
        } catch (error) {
            throw new LocalNotationStorageError(
                is_quota_error(error) ? 'QUOTA_EXCEEDED' : 'STORAGE_WRITE_FAILED',
                is_quota_error(error)
                    ? 'Browser storage is full. The local notation change was not saved.'
                    : 'The local notation change could not be saved to browser storage.',
                { cause: error },
            );
        }
        return clone(result);
    }
}
