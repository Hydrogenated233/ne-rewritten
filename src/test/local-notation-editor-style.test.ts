import { describe, expect, it } from 'vitest';
import app_source from '../App.vue?raw';
import panel_source from '../components/UserDefinedNotationPanel.vue?raw';
import codemirror_source from '../composables/use_codemirror.ts?raw';
import theme_source from '../composables/use_color_theme.ts?raw';
import package_source from '../../package.json?raw';

describe('local notation editor presentation', () => {
    it('keeps the editor workspace and runtime errors inside the settings panel', () => {
        expect(panel_source).toMatch(
            /\.ud-layout\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(120px,\s*180px\)\s+minmax\(0,\s*1fr\)\s+minmax\(96px,\s*max-content\);[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/s,
        );
        expect(panel_source).toMatch(/\.ud-editor-area\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
        expect(panel_source).toMatch(
            /\.ud-status-message,\s*\.ud-runtime-error\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;[^}]*overflow-wrap:\s*anywhere;/s,
        );
        expect(panel_source).not.toMatch(/\.ud-runtime-error\s*\{[^}]*flex:\s*0\s+0\s+100%/s);
    });

    it('ports the source editor token palette into CodeMirror', () => {
        expect(codemirror_source).toContain('HighlightStyle');
        expect(codemirror_source).toContain("import('@lezer/highlight')");
        expect(codemirror_source).toContain('notationHighlightStyle');
        expect(panel_source).toContain('syntaxHighlighting(notationHighlightStyle, { fallback: true })');

        expect(app_source).toContain('--color-editor-keyword:');
        expect(app_source).toContain('--color-editor-number:');
        expect(app_source).toContain('--color-editor-string:');
        expect(app_source).toContain('--color-editor-comment:');
        expect(theme_source).toContain("'--color-editor-keyword'");
        expect(theme_source).toContain("'--color-editor-number'");
        expect(theme_source).toContain("'--color-editor-string'");
        expect(theme_source).toContain("'--color-editor-comment'");
        expect(theme_source).toContain("'--color-editor-keyword': '#c586c0'");
        expect(theme_source).toContain("'--color-editor-number': '#b5cea8'");
        expect(theme_source).toContain("'--color-editor-string': '#ce9178'");
        expect(theme_source).toContain("'--color-editor-comment': '#6a9955'");
    });

    it('keeps every CodeMirror extension on the compatible 6.x package line', () => {
        const dependencies = JSON.parse(package_source).dependencies as Record<string, string>;
        expect(dependencies).not.toHaveProperty('@codemirror/basic-setup');
        expect(dependencies).not.toHaveProperty('codemirror');
        for (const name of [
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/lang-javascript',
            '@codemirror/language',
            '@codemirror/state',
            '@codemirror/view',
        ]) {
            expect(dependencies[name]).toMatch(/^\^6\./);
        }
    });
});
