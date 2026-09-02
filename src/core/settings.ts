export type Variant = 'FS' | 'FS_alter' | 'FS_short';
export type DisplayMode = 'plain' | 'html' | 'latex';

export interface ExpandSettings {
    FS_index: number;
    /** Number of consecutive fundamental-sequence terms shown by direct expansion. */
    count?: number;
    notation_id: string;
    notation_equiv: string | undefined;
    variant: Variant;
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
    /** Pointer mode keeps click/hover exploration; keyboard mode makes those actions shortcut-driven. */
    interaction_mode: 'pointer' | 'keyboard';
    use_delete_to_clear: boolean;
    /** 输入框获得焦点时平滑滚动页面到其位置。 */
    scroll_on_focus: boolean;
    show_diagram: boolean;
    /** 鼠标悬停条目时显示并跟随指针移动图表。 */
    diagram_follow: boolean;
    /** 图表显示缩放的指数（每步 1.25 倍）。 */
    diagram_scale: number;
    latex_commands: string;
    analysis_latex_preview: boolean;
    analysis_latex_inline: boolean;
    show_description: boolean;
    /** 导出分析时附带节点的折叠/隐藏子项状态。 */
    export_hide: boolean;
    /** 导入时自动展开全部挂载条目。 */
    expand_all_on_import: boolean;
    /** 自动保存周期（秒），最小 10 秒。 */
    auto_save_interval: number;
    /** 自动保存时是否包含隐藏子树状态。 */
    auto_save_hidden: boolean;
    /** 已勾选"不再显示"的提示 id。 */
    ignored_tip: Record<string, boolean>;
    max_find_fs: number;
    /** 悬停基本列提示中显示的 FS 项数（包含 0 项）。 */
    tooltip_fs: number;
    equiv_active: Record<string, string | undefined>;
    equiv_hide_original: Record<string, boolean>;
    shown_equiv: Record<string, Record<string, boolean>>;
    language: 'zh' | 'en';
    color_scheme: string;
    hidden_notations: string[];
    generator_state: Record<string, number>;
    user_scripts: UserScript[];
    expand: ExpandSettings;
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
    interaction_mode: 'pointer',
    use_delete_to_clear: true,
    scroll_on_focus: true,
    show_diagram: true,
    diagram_follow: false,
    diagram_scale: 0,
    latex_commands: '',
    analysis_latex_preview: false,
    analysis_latex_inline: false,
    show_description: true,
    export_hide: true,
    expand_all_on_import: false,
    auto_save_interval: 30,
    auto_save_hidden: false,
    ignored_tip: {},
    max_find_fs: 10,
    tooltip_fs: 3,
    equiv_active: {},
    equiv_hide_original: {},
    shown_equiv: {},
    language: 'zh',
    color_scheme: 'source-light',
    hidden_notations: [],
    generator_state: {},
    user_scripts: [],
    expand: { FS_index: 0, notation_id: 'omega', notation_equiv: undefined, variant: 'FS_short' },
};
