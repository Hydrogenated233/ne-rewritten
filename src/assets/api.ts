// Public type reference for the native ne-rewritten notation format.

export type TextSpec = string | { id: string };

export type NotationDisplay<T> = (expression: T) => string;

export type NotationDisplaySpec<T> =
    | NotationDisplay<T>
    | {
          plain: NotationDisplay<T>;
          html?: NotationDisplay<T>;
          latex?: NotationDisplay<T>;
          from_display?: (text: string) => T;
          name?: TextSpec;
          name_id?: string;
      };

export interface NotationDefinition<T> {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    description?: TextSpec | TextSpec[];
    category_id?: string;
    display: NotationDisplaySpec<T>;
    display_equiv?: Record<string, NotationDisplaySpec<T>>;
    is_limit: (expression: T) => boolean;
    compare: (left: T, right: T) => number;
    FS: (expression: T, index: number) => T;
    FS_alter?: (expression: T, index: number) => T;
    FS_short?: (expression: T, index: number) => T;
    draw_diagram?: DiagramControl<T, any>;
    init: () => T[];
    credit_text_id?: string | string[];
    debug?: Record<string, any>;
}

export interface NotationCategoryGenerator {
    start: number;
    initial: number;
    create: (index: number) => NotationDefinition<any>;
}

export interface NotationCategoryDefinition {
    id: string;
    name: TextSpec;
    simple_name?: TextSpec;
    parent_id?: string;
    generator?: NotationCategoryGenerator;
}

export type DiagramAction = {
    type: 'scroll';
    direction: 'up' | 'down' | 'left' | 'right';
    step: number;
};

export type DiagramControlSetting =
    | {
          type: 'boolean';
          name: TextSpec;
          field_name: string;
      }
    | {
          type: 'number';
          name: TextSpec;
          min?: number;
          max?: number;
          field_name: string;
      }
    | {
          type: 'info';
          name: TextSpec;
      };

export interface DiagramControl<T, DataType> {
    default_data: DataType;
    draw_diagram: (expression: T, data: DataType) => Diagram | undefined;
    settings?: DiagramControlSetting[];
    handle_action?: (data: DataType, action: DiagramAction) => DataType | null;
}

export interface Rgba {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export type ColorSpec = { type: string } | { color: Rgba };

export type Element =
    | {
          type: 'circle';
          x: number;
          y: number;
          r: number;
          stroke: boolean;
          stroke_color?: ColorSpec;
          fill: boolean;
          fill_color?: ColorSpec;
          width?: number;
      }
    | {
          type: 'line';
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          stroke: boolean;
          stroke_color?: ColorSpec;
          width?: number;
      }
    | {
          type: 'text';
          x: number;
          y: number;
          text: string;
          fill: boolean;
          fill_color?: ColorSpec;
          size?: number;
          align?: 'left' | 'center' | 'right';
      };

export interface ExtraText {
    text: string;
    x: number;
    y: number;
    size?: number;
    color?: ColorSpec;
    align?: 'left' | 'center' | 'right';
    display_html?: boolean;
}

export interface Diagram {
    width: number;
    height: number;
    elements: Element[];
    extra_text: ExtraText[];
}

declare function register_notation<T>(definition: NotationDefinition<T>): void;
declare function register_category(definition: NotationCategoryDefinition): void;
