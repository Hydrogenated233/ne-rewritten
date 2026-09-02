export interface FloatingRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface FloatingViewport {
    width: number;
    height: number;
}

export const FLOATING_LAYOUT_EVENT = 'notation-explorer:floating-layout';

export function request_floating_layout(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLOATING_LAYOUT_EVENT));
}

export function rects_overlap(a: FloatingRect, b: FloatingRect, gap = 0): boolean {
    return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

function rect_at(left: number, top: number, width: number, height: number): FloatingRect {
    return { left, top, right: left + width, bottom: top + height };
}

function clamp(value: number, max: number): number {
    return Math.min(Math.max(0, value), Math.max(0, max));
}

/** Place a fixed overlay near its anchor while avoiding already rendered overlays. */
export function place_floating_rect(
    anchor_x: number,
    anchor_y: number,
    width: number,
    height: number,
    viewport: FloatingViewport,
    avoid: FloatingRect[],
    gap = 12,
): { left: number; top: number } {
    const candidates: Array<[number, number]> = [
        [anchor_x, anchor_y],
        [anchor_x + gap, anchor_y],
        [anchor_x - width - gap, anchor_y],
        [anchor_x, anchor_y + gap],
        [anchor_x, anchor_y - height - gap],
        [anchor_x + gap, anchor_y + gap],
        [anchor_x - width - gap, anchor_y + gap],
        [anchor_x + gap, anchor_y - height - gap],
        [anchor_x - width - gap, anchor_y - height - gap],
    ];

    for (const rect of avoid) {
        candidates.push(
            [rect.right + gap, anchor_y],
            [rect.left - width - gap, anchor_y],
            [anchor_x, rect.bottom + gap],
            [anchor_x, rect.top - height - gap],
        );
    }

    const bounded = candidates.map(([left, top]) => ({
        left: clamp(left, viewport.width - width),
        top: clamp(top, viewport.height - height),
    }));
    const clear = bounded.find((position) => {
        const rect = rect_at(position.left, position.top, width, height);
        return avoid.every((other) => !rects_overlap(rect, other, gap));
    });
    if (clear) return clear;

    // If the viewport is too crowded to find a clear position, minimize overlap.
    const best = bounded.reduce<{ left: number; top: number; score: number }>(
        (best, position) => {
            const rect = rect_at(position.left, position.top, width, height);
            const score = avoid.reduce((sum, other) => {
                const x = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
                const y = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
                return sum + x * y;
            }, 0);
            return score < best.score ? { ...position, score } : best;
        },
        { ...bounded[0], score: Number.POSITIVE_INFINITY },
    );
    return { left: best.left, top: best.top };
}
