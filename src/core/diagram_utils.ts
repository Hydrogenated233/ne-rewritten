import type { ColorSpec, Rgba } from './diagram_types.ts';

/** 解析 ColorSpec 为 Rgba: { color } 直接返回, { type } 从主题 palette 查表, 未知 type 回退为黑色。 */
export function resolve_color(spec: ColorSpec | undefined, palette: Record<string, Rgba>): Rgba | undefined {
    if (spec === undefined) return undefined;
    if ('color' in spec) return spec.color;
    // 兼容旧脚本直接写裸 Rgba 的情况
    if (!('type' in spec)) return spec as Rgba;
    return palette[spec.type] ?? { r: 0, g: 0, b: 0 };
}

/** Rgba → CSS rgba() 字符串 */
export function css(c: Rgba): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a ?? 1})`;
}

/** 调透明度 */
export function alpha(c: Rgba, a: number): Rgba {
    return { r: c.r, g: c.g, b: c.b, a };
}

/** 线性插值：t=0 → c1, t=1 → c2 */
export function blend(c1: Rgba, c2: Rgba, t: number): Rgba {
    return {
        r: Math.round((1 - t) * c1.r + t * c2.r),
        g: Math.round((1 - t) * c1.g + t * c2.g),
        b: Math.round((1 - t) * c1.b + t * c2.b),
        a: (c1.a ?? 1) * (1 - t) + (c2.a ?? 1) * t,
    };
}

/** 变暗 */
export function darken(c: Rgba, factor: number): Rgba {
    return {
        r: Math.round(c.r * factor),
        g: Math.round(c.g * factor),
        b: Math.round(c.b * factor),
        a: c.a,
    };
}

/** 变亮（各分量加 amount） */
export function lighten(c: Rgba, amount: number): Rgba {
    return {
        r: Math.min(255, c.r + amount),
        g: Math.min(255, c.g + amount),
        b: Math.min(255, c.b + amount),
        a: c.a,
    };
}
