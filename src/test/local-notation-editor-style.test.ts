import { describe, expect, it } from 'vitest';
import app_source from '../App.vue?raw';
import panel_source from '../components/UserDefinedNotationPanel.vue?raw';
import editor_source from '../core/notation_editor.ts?raw';
import theme_source from '../composables/use_color_theme.ts?raw';
import package_source from '../../package.json?raw';

describe('local notation editor presentation', () => {
    it('uses the source project local-file workspace instead of the temporary three-column layout', () => {
        expect(panel_source).toContain('class="ne-local-manager__header"');
        expect(panel_source).toContain('class="ne-local-toolbar"');
        expect(panel_source).toContain('class="ne-local-workspace"');
        expect(panel_source).toContain('class="ne-local-workspace__sidebar"');
        expect(panel_source).toContain('class="ne-local-file-list"');
        expect(panel_source).toContain('class="ne-local-workspace__editor"');
        expect(panel_source).toContain('class="ne-local-editor__header"');
        expect(panel_source).toContain('class="ne-local-editor__actions"');
        expect(panel_source).toContain('class="ne-local-file__toggle"');
        expect(panel_source).toContain('class="ne-local-file__status"');
        expect(panel_source).toContain('class="ne-local-file__manifest"');
        expect(panel_source).toContain('class="ne-local-file__delete"');
        expect(panel_source).toMatch(
            /\.ne-local-workspace\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*280px\s+minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s,
        );
        expect(panel_source).toMatch(
            /@media\s*\(max-width:\s*820px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
        );
        expect(panel_source).not.toContain('class="ud-tabs"');
        expect(panel_source).not.toContain('class="ud-buttons"');
        expect(panel_source).not.toContain('grid-template-columns: minmax(120px, 180px)');
    });

    it('ports the source overlay editor, tokenizer, line gutter, and bracket matching', () => {
        expect(editor_source).toContain('export function tokenize');
        expect(editor_source).toContain('export function find_bracket_match');
        expect(editor_source).toContain('export function render_highlighted_source');
        expect(panel_source).toContain('class="ne-local-editor__gutter"');
        expect(panel_source).toContain('class="ne-local-editor__gutter-content"');
        expect(panel_source).toContain('class="ne-local-editor__highlight"');
        expect(panel_source).toContain('class="ne-local-editor__textarea"');
        expect(panel_source).toContain('v-html="highlighted_source"');
        expect(panel_source).toContain('highlight_layer.value.style.transform = `translate3d(');
        expect(panel_source).toContain('line_gutter_content.value.style.transform = `translate3d(');
        expect(panel_source).not.toContain('highlight_layer.value.scrollTop = input.scrollTop');
        expect(panel_source).not.toContain('line_gutter.value.scrollTop = input.scrollTop');
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
