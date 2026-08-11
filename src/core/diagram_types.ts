export interface Rgba {
    r: number;
    g: number;
    b: number;
    a?: number;
}

/** 图的颜色规格: 直接给 Rgba, 或用 type 引用当前主题 palette 中的颜色 (如 'text' | 'background' | 'red' | 'gray')。 */
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
