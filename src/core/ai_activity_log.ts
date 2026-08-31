import type { AIProgressEvent } from '@/core/ai_notation_assistant.ts';

export interface AIActivityEntry extends AIProgressEvent {
    id: number;
    timestamp: number;
}

const MAX_ACTIVITY_DETAIL_LENGTH = 8_000;
const MERGED_STREAM_TYPES = new Set<AIProgressEvent['type']>(['model_reasoning_stream', 'model_output_stream']);
const TOOL_PROGRESS_TYPES = new Set<AIProgressEvent['type']>(['tool_call_preparing', 'tool_call_started', 'tool_call_finished']);
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

function find_last_index(entries: readonly AIActivityEntry[], predicate: (entry: AIActivityEntry) => boolean): number {
    for (let index = entries.length - 1; index >= 0; index--) {
        if (predicate(entries[index])) return index;
    }
    return -1;
}

function same_round(left: AIActivityEntry, right: AIProgressEvent): boolean {
    return left.round === right.round && left.protocol === right.protocol;
}

function normalize_progress(event: AIProgressEvent): AIProgressEvent {
    const { id: _id, timestamp: _timestamp, ...progress } = event as AIProgressEvent & Partial<Pick<AIActivityEntry, 'id' | 'timestamp'>>;
    if (typeof progress.detail === 'string' && progress.detail.length > MAX_ACTIVITY_DETAIL_LENGTH) {
        const suffix = '\n...[truncated]';
        progress.detail = `${progress.detail.slice(0, MAX_ACTIVITY_DETAIL_LENGTH - suffix.length)}${suffix}`;
    }
    return progress;
}

function stream_index(entries: readonly AIActivityEntry[], event: AIProgressEvent): number {
    if (!MERGED_STREAM_TYPES.has(event.type)) return -1;
    return find_last_index(entries, (entry) => entry.type === event.type && same_round(entry, event));
}

function preparing_index(entries: readonly AIActivityEntry[], event: AIProgressEvent): number {
    if (event.type !== 'tool_call_preparing' || !Number.isSafeInteger(event.toolCallIndex)) return -1;
    return find_last_index(entries, (entry) => entry.type === 'tool_call_preparing' && same_round(entry, event) && entry.toolCallIndex === event.toolCallIndex);
}

function matching_preparing_index(entries: readonly AIActivityEntry[], event: AIProgressEvent): number {
    if (event.type !== 'tool_call_started' || !Number.isSafeInteger(event.toolCallIndex)) return -1;
    return find_last_index(entries, (entry) => entry.type === 'tool_call_preparing' && same_round(entry, event) && entry.toolCallIndex === event.toolCallIndex);
}

export function record_ai_activity(
    entries: AIActivityEntry[],
    event: AIProgressEvent,
    metadata: { id: number; timestamp: number },
): AIActivityEntry {
    const progress = normalize_progress(event);
    const streamIndex = stream_index(entries, progress);
    const mergedIndex = streamIndex >= 0 ? streamIndex : preparing_index(entries, progress);
    if (mergedIndex >= 0) {
        Object.assign(entries[mergedIndex], progress, { timestamp: metadata.timestamp });
        return entries[mergedIndex];
    }

    const preparingIndex = matching_preparing_index(entries, progress);
    if (preparingIndex >= 0) {
        const [preparing] = entries.splice(preparingIndex, 1);
        const entry = { ...progress, id: preparing.id, timestamp: metadata.timestamp };
        entries.push(entry);
        return entry;
    }

    const entry = { ...progress, ...metadata };
    entries.push(entry);
    return entry;
}

interface LegacyToolNameState {
    currentIndex: number;
    lastChars: number;
    preparedIndices: number[];
    startedIndices: number[];
    startedCount: number;
    finishedCount: number;
}

interface LegacyToolRoundState {
    nextIndex: number;
    names: Map<string, LegacyToolNameState>;
}

function legacy_tool_call_index(rounds: Map<string, LegacyToolRoundState>, entry: AIActivityEntry): number | undefined {
    if (!TOOL_PROGRESS_TYPES.has(entry.type)) return undefined;
    if (Number.isSafeInteger(entry.toolCallIndex) && Number(entry.toolCallIndex) >= 0) return Number(entry.toolCallIndex);

    const roundKey = `${entry.protocol}:${entry.round}`;
    let round = rounds.get(roundKey);
    if (!round) {
        round = { nextIndex: 0, names: new Map() };
        rounds.set(roundKey, round);
    }
    const name = entry.name || 'tool';
    let state = round.names.get(name);
    if (!state) {
        state = { currentIndex: -1, lastChars: -1, preparedIndices: [], startedIndices: [], startedCount: 0, finishedCount: 0 };
        round.names.set(name, state);
    }

    if (entry.type === 'tool_call_preparing') {
        const chars = Number.isFinite(entry.chars) ? Number(entry.chars) : 0;
        if (state.currentIndex < 0 || chars <= state.lastChars) {
            state.currentIndex = round.nextIndex++;
            state.preparedIndices.push(state.currentIndex);
        }
        state.lastChars = chars;
        return state.currentIndex;
    }

    if (entry.type === 'tool_call_started') {
        const index = state.preparedIndices[state.startedCount] ?? round.nextIndex++;
        state.startedCount++;
        state.startedIndices.push(index);
        return index;
    }

    const index = state.startedIndices[state.finishedCount] ?? state.preparedIndices[state.finishedCount] ?? round.nextIndex++;
    state.finishedCount++;
    return index;
}

export function compact_ai_activity(entries: readonly unknown[]): AIActivityEntry[] {
    const compacted: AIActivityEntry[] = [];
    const legacyToolRounds = new Map<string, LegacyToolRoundState>();
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
        const toolCallIndex = legacy_tool_call_index(legacyToolRounds, entry);
        if (toolCallIndex !== undefined) entry.toolCallIndex = toolCallIndex;
        record_ai_activity(compacted, entry, { id: entry.id, timestamp: entry.timestamp });
    }
    return compacted;
}
