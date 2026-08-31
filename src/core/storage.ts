export interface AppStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
}

/**
 * Standalone exports install a namespaced storage adapter before loading the
 * application bundle. The normal app uses the browser's local storage with
 * the target repository's own `nerw-*` keys.
 */
export function app_storage(): AppStorageLike | null {
    if (typeof window !== 'undefined') {
        const isolated = (window as typeof window & { NotationStorage?: AppStorageLike }).NotationStorage;
        if (isolated) return isolated;
    }
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}
