export const APP_STORAGE_NAMESPACE = 'nerw';

function app_key(suffix: string): string {
    return `${APP_STORAGE_NAMESPACE}-${suffix}`;
}

export const APP_STORAGE_KEYS = {
    settings: app_key('settings'),
    localNotationFiles: app_key('local-notation-files'),
    aiConversations: app_key('ai-conversations'),
    summaryPosition: app_key('summary-pos'),
    notesPanelGeometry: app_key('notes-panel-geometry'),
} as const;

export const APP_STORAGE_PREFIXES = {
    analysis: app_key('analysis-'),
    note: app_key('note-'),
    directExpandPanelGeometry: app_key('direct-expand-panel-geometry-'),
    standalone: `${APP_STORAGE_NAMESPACE}-standalone:`,
} as const;

export const AI_SESSION_STORAGE_KEYS = {
    baseUrl: app_key('ai-base-url'),
    apiKey: app_key('ai-api-key'),
    model: app_key('ai-model'),
} as const;

export function analysis_storage_key(notationId: string): string {
    return APP_STORAGE_PREFIXES.analysis + notationId;
}

export function note_storage_key(notationId: string): string {
    return APP_STORAGE_PREFIXES.note + notationId;
}

export function direct_expand_panel_storage_key(panelId: string | number): string {
    return APP_STORAGE_PREFIXES.directExpandPanelGeometry + panelId;
}

export function is_app_storage_key(key: string): boolean {
    return key.startsWith(`${APP_STORAGE_NAMESPACE}-`);
}
