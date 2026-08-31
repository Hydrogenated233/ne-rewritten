import { describe, expect, it } from 'vitest';
import app_source from '../App.vue?raw';
import panel_source from '../components/UserDefinedNotationPanel.vue?raw';
import editor_source from '../core/notation_editor.ts?raw';
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

    it('ports the source overlay editor, tokenizer, line gutter, and bracket matching', () => {
        expect(editor_source).toContain('export function tokenize');
        expect(editor_source).toContain('export function find_bracket_match');
        expect(editor_source).toContain('export function render_highlighted_source');
        expect(panel_source).toContain('class="ne-local-editor__gutter"');
        expect(panel_source).toContain('class="ne-local-editor__highlight"');
        expect(panel_source).toContain('class="ne-local-editor__textarea"');
        expect(panel_source).toContain('v-html="highlighted_source"');
        expect(panel_source).toContain("event.key !== 'Tab'");
        expect(panel_source).toContain("event.key.toLowerCase() === 's'");

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

    it('keeps enabled local files editable and persists drafts from input', () => {
        expect(panel_source).toContain('v-model="editor_source"');
        expect(panel_source).toContain('@input="on_editor_input"');
        expect(panel_source).toContain('runtime.setDraft(file.id');
        expect(panel_source).not.toContain(':disabled="current_file?.enabled"');
        expect(panel_source).not.toContain('CodeMirror');
    });

    it('does not ship the replaced CodeMirror runtime', () => {
        const dependencies = JSON.parse(package_source).dependencies as Record<string, string>;
        for (const name of [
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/lang-javascript',
            '@codemirror/language',
            '@codemirror/state',
            '@codemirror/view',
            '@lezer/highlight',
        ]) {
            expect(dependencies).not.toHaveProperty(name);
        }
    });
});
