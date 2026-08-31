import { describe, expect, it } from 'vitest';
import {
    AI_SESSION_STORAGE_KEYS,
    analysis_storage_key,
    APP_STORAGE_KEYS,
    APP_STORAGE_NAMESPACE,
    APP_STORAGE_PREFIXES,
    direct_expand_panel_storage_key,
    is_app_storage_key,
    note_storage_key,
} from '@/core/storage_keys.ts';

describe('target repository storage namespace', () => {
    it('keeps every persistent key under the nerw namespace', () => {
        const keys = [
            ...Object.values(APP_STORAGE_KEYS),
            ...Object.values(APP_STORAGE_PREFIXES),
            ...Object.values(AI_SESSION_STORAGE_KEYS),
            analysis_storage_key('fixture'),
            note_storage_key('fixture'),
            direct_expand_panel_storage_key('fixture'),
        ];

        expect(APP_STORAGE_NAMESPACE).toBe('nerw');
        expect(keys.every((key) => key.startsWith('nerw-'))).toBe(true);
    });

    it('does not collide with storage keys used by the source repository', () => {
        const sourceRepositoryKeys = new Set([
            'ne-local-notation-files',
            'ne-settings',
            'ne-config',
            'ne-analysis',
            'ne-analysis-fixture',
            'ne-note-fixture',
            'ne-summary-pos',
            'ne-direct-expand-panel-geometry-fixture',
            'ne-notes-panel-geometry',
            'ne-ai-conversations',
            'ne-ai-conversations-v1',
            'ne-ai-conversations-v2',
            'ne-ai-base-url',
            'ne-ai-api-key',
            'ne-ai-model',
        ]);
        const targetKeys = [
            ...Object.values(APP_STORAGE_KEYS),
            ...Object.values(AI_SESSION_STORAGE_KEYS),
            analysis_storage_key('fixture'),
            note_storage_key('fixture'),
            direct_expand_panel_storage_key('fixture'),
        ];

        expect(targetKeys.some((key) => sourceRepositoryKeys.has(key))).toBe(false);
        expect(is_app_storage_key('nerw-settings')).toBe(true);
        expect(is_app_storage_key('ne-config')).toBe(false);
    });
});
