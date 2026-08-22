export type Variant = 'FS' | 'FS_alter' | 'FS_short';
export type DisplayMode = 'plain' | 'html' | 'latex';

export interface ExpandSettings {
    FS_index: number;
    notation_id: string;
    notation_equiv: string | undefined;
    variant: Variant;
}

export interface LatexAnalysisSettings {
    subscript_bracket: boolean;
    map_p: boolean;
    map_w: boolean;
    map_e: boolean;
    map_f: boolean;
    map_l: boolean;
    map_W: boolean;
    psi_subscript: boolean;
}

export interface UserScript {
    file_name: string;
    code: string;
    enabled: boolean;
}

export interface Settings {
    current_notation_id: string;
    tier: number;
    variant: Variant;
    input_width: number;
    show_input: boolean;
    font_family: string;
    display_mode: DisplayMode;
    notation_name_mode: 'full' | 'simple';
    nav_mode: 'grouped' | 'flat';
    use_delete_to_clear: boolean;
    show_diagram: boolean;
    show_latex: boolean;
    show_description: boolean;
    max_find_fs: number;
    equiv_active: Record<string, string | undefined>;
    equiv_hide_original: Record<string, boolean>;
    shown_equiv: Record<string, Record<string, boolean>>;
    language: 'zh' | 'en';
    color_scheme: string;
    hidden_notations: string[];
    generator_state: Record<string, number>;
    user_scripts: UserScript[];
    expand: ExpandSettings;
    latex_analysis: LatexAnalysisSettings;
}

export const DEFAULT_SETTINGS: Settings = {
    current_notation_id: 'bm4',
    tier: 0,
    variant: 'FS_short',
    input_width: 180,
    show_input: true,
    font_family: 'Comic Sans MS',
    display_mode: 'html',
    notation_name_mode: 'simple',
    nav_mode: 'grouped',
    use_delete_to_clear: true,
    show_diagram: true,
    show_latex: false,
    show_description: true,
    max_find_fs: 10,
    equiv_active: {},
    equiv_hide_original: {},
    shown_equiv: {},
    language: 'zh',
    color_scheme: 'default',
    hidden_notations: [],
    generator_state: {},
    user_scripts: [],
    expand: { FS_index: 1, notation_id: 'omega', notation_equiv: undefined, variant: 'FS_short' },
    latex_analysis: {
        subscript_bracket: true,
        map_p: false,
        map_w: true,
        map_e: false,
        map_f: false,
        map_l: false,
        map_W: false,
        psi_subscript: false,
    },
};
