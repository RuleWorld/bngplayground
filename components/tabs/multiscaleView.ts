// ---------------------------------------------------------------------------
// multiscaleView.ts – Pure view-transform math for the MultiscaleTab canvas.
//
// The simulation domain is mapped with ONE uniform scale and centred
// (letterboxed) inside the canvas viewport, so a square domain never renders
// stretched or skewed regardless of the canvas aspect ratio, and cell radii
// scale identically in x and y at every timeline position.
// ---------------------------------------------------------------------------

export interface ViewTransform {
  /** CSS pixels per domain unit; identical for x and y (uniform scale). */
  scale: number;
  /** Left padding of the letterboxed domain area, in CSS pixels. */
  offX: number;
  /** Top padding of the letterboxed domain area, in CSS pixels. */
  offY: number;
}

/**
 * Map a domain of `domainWidth` × `domainHeight` units into a
 * `viewportWidth` × `viewportHeight` CSS-pixel viewport.
 *
 * Uses the smaller of the per-axis scales so the whole domain fits, then
 * centres the result. Non-finite or non-positive inputs yield a
 * zero transform (nothing to draw) instead of NaN coordinates.
 */
export function computeViewTransform(
  domainWidth: number,
  domainHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ViewTransform {
  const valid =
    Number.isFinite(domainWidth) && domainWidth > 0 &&
    Number.isFinite(domainHeight) && domainHeight > 0 &&
    Number.isFinite(viewportWidth) && viewportWidth > 0 &&
    Number.isFinite(viewportHeight) && viewportHeight > 0;
  if (!valid) {
    return { scale: 0, offX: 0, offY: 0 };
  }
  const scale = Math.min(viewportWidth / domainWidth, viewportHeight / domainHeight);
  return {
    scale,
    offX: (viewportWidth - domainWidth * scale) / 2,
    offY: (viewportHeight - domainHeight * scale) / 2,
  };
}
