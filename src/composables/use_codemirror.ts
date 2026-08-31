// CodeMirror 按需加载: 多个组件共享同一个 promise, 避免重复请求。
// 仅在用户点击"加载并启用编辑器"时才动态 import。

export interface CodeMirrorModule {
    EditorView: typeof import('@codemirror/view').EditorView;
    keymap: typeof import('@codemirror/view').keymap;
    lineNumbers: typeof import('@codemirror/view').lineNumbers;
    drawSelection: typeof import('@codemirror/view').drawSelection;
    highlightActiveLine: typeof import('@codemirror/view').highlightActiveLine;
    highlightActiveLineGutter: typeof import('@codemirror/view').highlightActiveLineGutter;
    EditorState: typeof import('@codemirror/state').EditorState;
    Compartment: typeof import('@codemirror/state').Compartment;
    notationHighlightStyle: import('@codemirror/language').HighlightStyle;
    syntaxHighlighting: typeof import('@codemirror/language').syntaxHighlighting;
    bracketMatching: typeof import('@codemirror/language').bracketMatching;
    indentOnInput: typeof import('@codemirror/language').indentOnInput;
    defaultKeymap: typeof import('@codemirror/commands').defaultKeymap;
    history: typeof import('@codemirror/commands').history;
    closeBrackets: typeof import('@codemirror/autocomplete').closeBrackets;
    javascript: typeof import('@codemirror/lang-javascript').javascript;
}

let cm_promise: Promise<CodeMirrorModule> | null = null;
let cm_module: CodeMirrorModule | null = null;

export function load_codemirror(): Promise<CodeMirrorModule> {
    if (!cm_promise) {
        cm_promise = Promise.all([
            import('@codemirror/view'),
            import('@codemirror/state'),
            import('@codemirror/language'),
            import('@codemirror/commands'),
            import('@codemirror/autocomplete'),
            import('@codemirror/lang-javascript'),
            import('@lezer/highlight'),
        ]).then(([view, state, language, commands, autocomplete, js, highlight]) => {
            const notationHighlightStyle = language.HighlightStyle.define([
                {
                    tag: highlight.tags.keyword,
                    color: 'var(--color-editor-keyword)',
                    fontWeight: '600',
                },
                {
                    tag: [highlight.tags.bool, highlight.tags.null, highlight.tags.atom],
                    color: 'var(--color-editor-literal)',
                },
                {
                    tag: highlight.tags.number,
                    color: 'var(--color-editor-number)',
                },
                {
                    tag: [highlight.tags.string, highlight.tags.regexp],
                    color: 'var(--color-editor-string)',
                },
                {
                    tag: highlight.tags.comment,
                    color: 'var(--color-editor-comment)',
                    fontStyle: 'italic',
                },
                {
                    tag: highlight.tags.invalid,
                    color: 'var(--color-danger)',
                    textDecoration: 'underline',
                },
            ]);
            cm_module = {
                EditorView: view.EditorView,
                keymap: view.keymap,
                lineNumbers: view.lineNumbers,
                drawSelection: view.drawSelection,
                highlightActiveLine: view.highlightActiveLine,
                highlightActiveLineGutter: view.highlightActiveLineGutter,
                EditorState: state.EditorState,
                Compartment: state.Compartment,
                notationHighlightStyle,
                syntaxHighlighting: language.syntaxHighlighting,
                bracketMatching: language.bracketMatching,
                indentOnInput: language.indentOnInput,
                defaultKeymap: commands.defaultKeymap,
                history: commands.history,
                closeBrackets: autocomplete.closeBrackets,
                javascript: js.javascript,
            };
            return cm_module;
        });
    }
    return cm_promise;
}

export function get_codemirror(): CodeMirrorModule | null {
    return cm_module;
}
