import { afterAll, describe, expect, it } from 'vitest';
import { get_notation } from '@/core/registry';
import { get_script_warnings, reload_all } from '@/core/user_defined_notation';

const VALID_SOURCE = `
register_notation({
    id: 'local-transaction-valid',
    name: 'Local transaction valid',
    display: { plain: (value) => String(value), from_display: (value) => Number(value) },
    is_limit: (value) => value === Infinity,
    compare: (left, right) => left - right,
    FS: (value) => value,
    init: () => [Infinity, 0],
});
`;

afterAll(() => {
    reload_all([]);
});

describe('native local notation reload', () => {
    it('keeps the live registry untouched when any enabled source fails validation', () => {
        const result = reload_all([
            { file_name: 'valid.js', code: VALID_SOURCE, enabled: true },
            { file_name: 'broken.js', code: 'throw new Error("broken source");', enabled: true },
        ]);

        expect(result.script_warnings.get('broken.js')?.[0]).toContain('broken source');
        expect(get_notation('local-transaction-valid')).toBeUndefined();
    });

    it('loads native files and preserves the previous version on a failed replacement', () => {
        expect(reload_all([{ file_name: 'valid.js', code: VALID_SOURCE, enabled: true }]).script_warnings.size).toBe(0);
        expect(get_notation('local-transaction-valid')).toBeDefined();

        const failed = reload_all([
            { file_name: 'valid.js', code: VALID_SOURCE + '\nthrow new Error("replacement failed");', enabled: true },
        ]);
        expect(failed.script_warnings.get('valid.js')?.[0]).toContain('replacement failed');
        expect(get_notation('local-transaction-valid')).toBeDefined();
    });

    it('accepts category declarations before their parent while registering atomically', () => {
        const source = `
            register_category({ id: 'local-child-category', name: 'Child', parent_id: 'local-parent-category' });
            register_category({ id: 'local-parent-category', name: 'Parent' });
        `;
        const result = reload_all([{ file_name: 'categories.js', code: source, enabled: true }]);
        expect(result.script_warnings.size).toBe(0);
        expect(get_script_warnings().size).toBe(0);
    });
});
