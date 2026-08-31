import type { AIProgressEvent } from '@/core/ai_notation_assistant.ts';

export interface AIActivityEntry extends AIProgressEvent {
    id: number;
    timestamp: number;
}

const MERGED_STREAM_TYPES = new Set<AIProgressEvent['type']>(['model_reasoning_stream', 'model_output_stream']);
const PROGRESS_TYPES = new Set<AIProgressEvent['type']>([
    'model_request_started',
    'model_reasoning_stream',
    'model_output_stream',
    'tool_call_preparing',
    'model_response_received',
    'tool_call_started',
    'tool_call_finished',
    'fallback_started',
]);

function can_merge(previous: AIActivityEntry | undefined, event: AIProgressEvent): previous is AIActivityEntry {
    return (
        previous !== undefined &&
        MERGED_STREAM_TYPES.has(event.type) &&
        previous.type === event.type &&
        previous.round === event.round &&
        previous.protocol === event.protocol
    );
}

export function record_ai_activity(
    entries: AIActivityEntry[],
    event: AIProgressEvent,
    metadata: { id: number; timestamp: number },
): AIActivityEntry {
    const {
        id: _id,
        timestamp: _timestamp,
        ...progress
    } = event as AIProgressEvent & Partial<Pick<AIActivityEntry, 'id' | 'timestamp'>>;
    const previous = entries.at(-1);
    if (can_merge(previous, progress)) {
        Object.assign(previous, progress, { timestamp: metadata.timestamp });
        return previous;
    }

    const entry = { ...progress, ...metadata };
    entries.push(entry);
    return entry;
}

export function compact_ai_activity(entries: readonly unknown[]): AIActivityEntry[] {
    const compacted: AIActivityEntry[] = [];
    for (const [index, value] of entries.entries()) {
        if (!value || typeof value !== 'object') continue;
        const candidate = value as Partial<AIActivityEntry>;
        if (
            typeof candidate.type !== 'string' ||
            !PROGRESS_TYPES.has(candidate.type as AIProgressEvent['type']) ||
            candidate.protocol !== 'chat_completions'
        ) {
            continue;
        }
        const entry = {
            ...candidate,
            type: candidate.type as AIProgressEvent['type'],
            round: Number.isSafeInteger(candidate.round) && Number(candidate.round) > 0 ? Number(candidate.round) : 1,
            protocol: 'chat_completions' as const,
            id: Number.isSafeInteger(candidate.id) ? Number(candidate.id) : index + 1,
            timestamp: Number.isFinite(candidate.timestamp) ? Number(candidate.timestamp) : 0,
        } as AIActivityEntry;
        record_ai_activity(compacted, entry, { id: entry.id, timestamp: entry.timestamp });
    }
    return compacted;
}
