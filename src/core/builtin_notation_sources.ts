import { get_notation } from '@/core/registry.ts';
import pps_family_source from '../../public/notations/PPS-family.js?raw';

export interface BuiltinNotationSourceFile {
    name: string;
    source: string;
}

interface SourceMembership {
    notationIds: Set<string>;
    generatorCategoryIds: Set<string>;
}

const notation_modules = import.meta.glob('/src/notations/**/*.ts', { eager: true }) as Record<
    string,
    Record<string, unknown>
>;
const notation_sources = import.meta.glob('/src/notations/**/*.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>;

const PPS_FAMILY_IDS = new Set(['pps', 'pps4', 'wpps4', 'tpps4', 'ewpps4', 'spps4']);

function inspect_export(value: unknown, membership: SourceMembership, seen: Set<unknown>): void {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item) => inspect_export(item, membership, seen));
        return;
    }

    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string') return;
    if (typeof item.FS === 'function' && typeof item.init === 'function') membership.notationIds.add(item.id);
    const generator = item.generator as Record<string, unknown> | undefined;
    if (generator && typeof generator.create === 'function') membership.generatorCategoryIds.add(item.id);
}

function source_membership(module: Record<string, unknown>): SourceMembership {
    const membership: SourceMembership = { notationIds: new Set(), generatorCategoryIds: new Set() };
    const seen = new Set<unknown>();
    Object.values(module).forEach((value) => inspect_export(value, membership, seen));
    return membership;
}

function display_path(modulePath: string): string {
    return modulePath.replace(/^\/src\/notations\//, '');
}

export function select_builtin_notation_sources(notationIds: string[]): BuiltinNotationSourceFile[] {
    const selectedIds = new Set(notationIds);
    const selectedCategoryIds = new Set(
        notationIds.map((id) => get_notation(id)?.category_id).filter((id): id is string => typeof id === 'string'),
    );
    const files: BuiltinNotationSourceFile[] = [];
    const includes_pps = notationIds.some((id) => PPS_FAMILY_IDS.has(id));

    // The regular source modules are TypeScript and may import helpers. PPS has
    // a separately maintained local-file artifact, so use that source once for
    // any selected member of the family.
    if (includes_pps) files.push({ name: 'PPS-family.js', source: pps_family_source });

    for (const [modulePath, module] of Object.entries(notation_modules)) {
        const membership = source_membership(module);
        if ([...membership.notationIds].some((id) => PPS_FAMILY_IDS.has(id))) continue;
        const containsSelectedNotation = [...membership.notationIds].some((id) => selectedIds.has(id));
        const containsSelectedGenerator = [...membership.generatorCategoryIds].some((id) =>
            selectedCategoryIds.has(id),
        );
        if (!containsSelectedNotation && !containsSelectedGenerator) continue;
        const source = notation_sources[modulePath];
        if (typeof source !== 'string') continue;
        files.push({ name: display_path(modulePath), source });
    }

    return files.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}
