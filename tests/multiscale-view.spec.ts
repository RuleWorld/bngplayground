// ---------------------------------------------------------------------------
// multiscale-view.spec.ts – View-transform invariants for the MultiscaleTab
// canvas. Regression guard for the "visual does not scale correctly" bug:
// the domain must map with a single uniform scale (no x/y skew) and be
// centred in the canvas viewport at every canvas aspect ratio, so scrubbing
// the timeline slider never distorts cells or trajectories.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { computeViewTransform } from '../components/tabs/multiscaleView';

describe('computeViewTransform', () => {
  it('uses one uniform scale for both axes (square domain stays square)', () => {
    // Wide viewport (matches the letterboxed canvas): height-limited.
    const wide = computeViewTransform(50, 50, 800, 400);
    expect(wide.scale).toBe(400 / 50);       // height-limited
    expect(wide.offY).toBeCloseTo(0);
    expect(wide.offX).toBeCloseTo(200);      // letterboxed horizontally

    // Tall/narrow viewport: width-limited.
    const narrow = computeViewTransform(50, 50, 200, 400);
    expect(narrow.scale).toBe(200 / 50);
    expect(narrow.offX).toBeCloseTo(0);
    expect(narrow.offY).toBeCloseTo(100);    // letterboxed vertically
  });

  it('fits the whole domain inside the viewport with equal centring padding', () => {
    const cases = [
      { dw: 50, dh: 50, vw: 184, vh: 147 },
      { dw: 100, dh: 40, vw: 640, vh: 350 },
      { dw: 30, dh: 90, vw: 512, vh: 512 },
      { dw: 50, dh: 50, vw: 312, vh: 250 },
    ];
    for (const c of cases) {
      const t = computeViewTransform(c.dw, c.dh, c.vw, c.vh);
      expect(t.scale).toBe(Math.min(c.vw / c.dw, c.vh / c.dh));
      expect(t.offX).toBeGreaterThanOrEqual(0);
      expect(t.offY).toBeGreaterThanOrEqual(0);
      expect(t.offX + c.dw * t.scale).toBeLessThanOrEqual(c.vw + 1e-9);
      expect(t.offY + c.dh * t.scale).toBeLessThanOrEqual(c.vh + 1e-9);
      // Equal padding on both sides of the fitted axis.
      const padX = t.offX + c.dw * t.scale;
      const padY = t.offY + c.dh * t.scale;
      expect(t.offX).toBeCloseTo(c.vw - padX);
      expect(t.offY).toBeCloseTo(c.vh - padY);
    }
  });

  it('returns a zero transform for invalid inputs instead of NaN coordinates', () => {
    expect(computeViewTransform(0, 50, 100, 100)).toEqual({ scale: 0, offX: 0, offY: 0 });
    expect(computeViewTransform(NaN, 50, 100, 100)).toEqual({ scale: 0, offX: 0, offY: 0 });
    expect(computeViewTransform(50, -1, 100, 100)).toEqual({ scale: 0, offX: 0, offY: 0 });
    expect(computeViewTransform(50, 50, -10, 100)).toEqual({ scale: 0, offX: 0, offY: 0 });
    expect(computeViewTransform(50, 50, 100, Infinity)).toEqual({ scale: 0, offX: 0, offY: 0 });
  });
});
