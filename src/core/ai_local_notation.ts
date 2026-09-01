import type { LocalNotationFile } from '@/core/local_notation_store.ts';
import type { LocalNotationRuntime } from '@/core/local_notation_runtime.ts';

type AILocalNotationRuntime = Pick<
    LocalNotationRuntime,
    'createUpload' | 'findByName' | 'getDraft' | 'getFile' | 'setDraft'
>;

export interface AILocalNotationInspection {
    fileName: string;
    enabled: boolean;
    trusted: boolean;
    committedSource: string;
    draftFileName: string | null;
    draftSource: string | null;
}

export interface AIStagedNotation {
    file: LocalNotationFile;
    created: boolean;
    stagedFileName: string;
}

export function inspect_local_notation_file(
    runtime: AILocalNotationRuntime,
    fileName: string,
): AILocalNotationInspection {
    const requestedName = String(fileName || '').trim();
    const file = requestedName ? runtime.findByName(requestedName) : undefined;
    if (!file) throw new Error(`No local notation file named "${requestedName}" exists.`);
    const draft = runtime.getDraft(file.id);
    return {
        fileName: file.name,
        enabled: file.enabled,
        trusted: file.trusted,
        committedSource: file.source,
        draftFileName: draft?.name ?? null,
        draftSource: draft?.source ?? null,
    };
}

export function stage_ai_generated_notation(
    runtime: AILocalNotationRuntime,
    currentFileId: string,
    fileName: string,
    source: string,
): AIStagedNotation {
    const boundFile = currentFileId ? runtime.getFile(currentFileId) : undefined;
    const sameNameFile = boundFile ? undefined : runtime.findByName(fileName);
    const existing = boundFile ?? sameNameFile;
    if (existing) {
        const stagedFileName = boundFile ? fileName : existing.name;
        runtime.setDraft(existing.id, {
            name: stagedFileName,
            source,
        });
        return { file: existing, created: false, stagedFileName };
    }
    const file = runtime.createUpload(fileName, source, false).file;
    return { file, created: true, stagedFileName: file.name };
}
