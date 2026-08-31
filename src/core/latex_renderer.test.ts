import katex from 'katex';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    compile_latex_commands,
    render_latex,
    reset_latex_command_cache,
    validate_latex_commands,
} from '@/core/latex_renderer.ts';

describe('custom LaTeX rendering', () => {
    beforeEach(() => reset_latex_command_cache());

    it('compiles user commands and applies them while rendering', () => {
        const commands = String.raw`\newcommand{\double}[1]{#1#1}`;
        expect(validate_latex_commands(commands, katex)).toBe('');
        expect(render_latex(String.raw`\double{x}`, commands, katex)).toContain('xx');
    });

    it('keeps the last valid macro set when an edit is invalid', () => {
        const valid = String.raw`\newcommand{\saved}[1]{#1^2}`;
        expect(compile_latex_commands(valid, katex).error).toBe('');

        const invalid = String.raw`\newcommand{\saved}[x]{#1}`;
        expect(validate_latex_commands(invalid, katex)).not.toBe('');
        expect(render_latex(String.raw`\saved{y}`, invalid, katex)).toContain('y');
    });
});
