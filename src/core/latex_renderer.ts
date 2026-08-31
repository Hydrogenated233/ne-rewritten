type KatexEngine = typeof import('katex').default;
type MacroMap = Record<string, unknown>;

interface CommandCache {
    engine: KatexEngine | null;
    source: string | null;
    macros: MacroMap;
    lastValidMacros: MacroMap;
    error: string;
}

const command_cache: CommandCache = {
    engine: null,
    source: null,
    macros: {},
    lastValidMacros: {},
    error: '',
};

function clone_macros(macros: MacroMap): MacroMap {
    return { ...macros };
}

function render_options(throw_on_error: boolean, macros: MacroMap, global_group = false): any {
    return {
        throwOnError: throw_on_error,
        displayMode: false,
        strict: 'ignore',
        trust: false,
        maxExpand: 1000,
        macros,
        globalGroup: global_group,
    };
}

export function escape_latex_fallback(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function reset_latex_command_cache(): void {
    command_cache.engine = null;
    command_cache.source = null;
    command_cache.macros = {};
    command_cache.lastValidMacros = {};
    command_cache.error = '';
}

export function compile_latex_commands(commands: string, engine: KatexEngine): { macros: MacroMap; error: string } {
    const source = String(commands ?? '');
    if (command_cache.engine === engine && command_cache.source === source) {
        return { macros: clone_macros(command_cache.macros), error: command_cache.error };
    }
    if (command_cache.engine !== engine) command_cache.lastValidMacros = {};

    let macros: MacroMap = {};
    let error = '';
    if (source.trim()) {
        try {
            engine.renderToString(`${source}\n\\relax`, render_options(true, macros, true));
            command_cache.lastValidMacros = clone_macros(macros);
        } catch (value) {
            error = value instanceof Error ? value.message : String(value);
            macros = clone_macros(command_cache.lastValidMacros);
        }
    } else {
        command_cache.lastValidMacros = {};
    }

    command_cache.engine = engine;
    command_cache.source = source;
    command_cache.macros = clone_macros(macros);
    command_cache.error = error;
    return { macros: clone_macros(macros), error };
}

export function validate_latex_commands(commands: string, engine: KatexEngine): string {
    if (!String(commands ?? '').trim()) return '';
    return compile_latex_commands(commands, engine).error;
}

export function render_latex(source: string, commands: string, engine: KatexEngine): string {
    try {
        const compiled = compile_latex_commands(commands, engine);
        return engine.renderToString(String(source ?? ''), render_options(false, clone_macros(compiled.macros)));
    } catch (value) {
        const message = value instanceof Error ? value.message : String(value);
        return `<span class="latex-render-error" title="${escape_latex_fallback(message)}">${escape_latex_fallback(source)}</span>`;
    }
}
