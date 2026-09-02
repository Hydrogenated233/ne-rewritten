import { describe, expect, it } from 'vitest';
import { place_floating_rect, rects_overlap } from '../core/floating_layout.ts';

describe('floating overlay layout', () => {
    it('moves a diagram below a wide FS tooltip instead of overlapping it', () => {
        const tooltip = { left: 0, top: 8, right: 900, bottom: 420 };
        const placed = place_floating_rect(180, 410, 120, 80, { width: 900, height: 700 }, [tooltip]);
        expect(rects_overlap({ ...placed, right: placed.left + 120, bottom: placed.top + 80 }, tooltip, 12)).toBe(
            false,
        );
        expect(placed.top).toBeGreaterThanOrEqual(432);
    });

    it('keeps a floating overlay inside the viewport', () => {
        const placed = place_floating_rect(890, 690, 120, 80, { width: 900, height: 700 }, []);
        expect(placed).toEqual({ left: 780, top: 620 });
    });
});
