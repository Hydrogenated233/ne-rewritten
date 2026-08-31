import { describe, expect, it } from 'vitest';
import { local_notation_execution_disabled } from '@/core/deployment';

describe('local notation startup query', () => {
    it('only disables local execution when no-local-files is present', () => {
        expect(local_notation_execution_disabled('')).toBe(false);
        expect(local_notation_execution_disabled('?foo=1')).toBe(false);
        expect(local_notation_execution_disabled('?no-local-files')).toBe(true);
        expect(local_notation_execution_disabled('?foo=1&no-local-files=1')).toBe(true);
    });
});
