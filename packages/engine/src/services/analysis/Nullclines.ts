/**
 * Nullclines.ts -- 2D phase portrait computation.
 *
 * Computes nullclines (curves where dx/dt = 0 or dy/dt = 0), the vector
 * field, and fixed points for a two-dimensional ODE system.
 *
 * Algorithm:
 *   1. Evaluate RHS on a fine grid
 *   2. Apply marching squares to extract zero-contours for each component
 *   3. Find fixed points at nullcline intersections and classify by Jacobian
 */

import { qrEigenvalues, type ComplexNumber } from './EigenSolver';

// ── Types ───────────────────────────────────────────────────────────

export interface NullclineConfig {
  /** RHS function for the 2D system: f([x,y]) => [dx/dt, dy/dt] */
  rhsFn: (state: Float64Array) => Float64Array;
  /** Optional Jacobian: (state) => row-major 2x2 Float64Array */
  jacobianFn?: (state: Float64Array) => Float64Array;
  /** x-axis range [min, max] */
  xRange: [number, number];
  /** y-axis range [min, max] */
  yRange: [number, number];
  /** Number of grid points along x (default 200) */
  nGridX?: number;
  /** Number of grid points along y (default 200) */
  nGridY?: number;
  /** Index of species for the x-axis in a larger system (default 0) */
  xIndex?: number;
  /** Index of species for the y-axis in a larger system (default 1) */
  yIndex?: number;
}

export type FixedPointType =
  | 'stable-node'
  | 'unstable-node'
  | 'saddle'
  | 'stable-spiral'
  | 'unstable-spiral'
  | 'center'
  | 'degenerate';

export interface FixedPoint {
  x: number;
  y: number;
  type: FixedPointType;
  eigenvalues: Array<ComplexNumber>;
}

export interface NullclineCurve {
  /** Sequence of (x,y) points defining the zero-contour */
  points: Array<{ x: number; y: number }>;
}

export interface VectorFieldPoint {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface NullclineResult {
  /** Nullclines for dx/dt = 0 */
  xNullclines: NullclineCurve[];
  /** Nullclines for dy/dt = 0 */
  yNullclines: NullclineCurve[];
  /** Sampled vector field */
  vectorField: VectorFieldPoint[];
  /** Fixed points (nullcline intersections) */
  fixedPoints: FixedPoint[];
}

// ── Main entry point ────────────────────────────────────────────────

export function computeNullclines(config: NullclineConfig): NullclineResult {
  const {
    rhsFn,
    xRange,
    yRange,
    nGridX = 200,
    nGridY = 200,
  } = config;

  const dx = (xRange[1] - xRange[0]) / nGridX;
  const dy = (yRange[1] - yRange[0]) / nGridY;

  // Evaluate RHS on grid
  const fxGrid = new Float64Array((nGridX + 1) * (nGridY + 1));
  const fyGrid = new Float64Array((nGridX + 1) * (nGridY + 1));

  for (let ix = 0; ix <= nGridX; ix++) {
    const x = xRange[0] + ix * dx;
    for (let iy = 0; iy <= nGridY; iy++) {
      const y = yRange[0] + iy * dy;
      const state = new Float64Array([x, y]);
      const f = rhsFn(state);
      const idx = ix * (nGridY + 1) + iy;
      fxGrid[idx] = f[0];
      fyGrid[idx] = f[1];
    }
  }

  // Extract nullclines via marching squares
  const xNullclines = marchingSquares(fxGrid, nGridX, nGridY, xRange, yRange);
  const yNullclines = marchingSquares(fyGrid, nGridX, nGridY, xRange, yRange);

  // Vector field (subsample for display)
  const vectorField: VectorFieldPoint[] = [];
  const vfStepX = Math.max(1, Math.floor(nGridX / 25));
  const vfStepY = Math.max(1, Math.floor(nGridY / 25));
  for (let ix = 0; ix <= nGridX; ix += vfStepX) {
    for (let iy = 0; iy <= nGridY; iy += vfStepY) {
      const idx = ix * (nGridY + 1) + iy;
      vectorField.push({
        x: xRange[0] + ix * dx,
        y: yRange[0] + iy * dy,
        dx: fxGrid[idx],
        dy: fyGrid[idx],
      });
    }
  }

  // Find fixed points at nullcline intersections
  const fixedPoints = findFixedPoints(
    xNullclines,
    yNullclines,
    rhsFn,
    config.jacobianFn,
    xRange,
    yRange,
  );

  return { xNullclines, yNullclines, vectorField, fixedPoints };
}

// ── Marching squares ────────────────────────────────────────────────

/**
 * Standard marching-squares algorithm for extracting zero-contours from
 * a scalar field evaluated on a regular grid.
 *
 * Returns a set of polyline segments grouped into connected curves.
 */
function marchingSquares(
  field: Float64Array,
  nx: number,
  ny: number,
  xRange: [number, number],
  yRange: [number, number],
): NullclineCurve[] {
  const dx = (xRange[1] - xRange[0]) / nx;
  const dy = (yRange[1] - yRange[0]) / ny;

  // Collect line segments
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const x0 = xRange[0] + ix * dx;
      const y0 = yRange[0] + iy * dy;

      // Four corners: bottom-left, bottom-right, top-right, top-left
      const v00 = field[ix * (ny + 1) + iy];           // bottom-left
      const v10 = field[(ix + 1) * (ny + 1) + iy];     // bottom-right
      const v11 = field[(ix + 1) * (ny + 1) + (iy + 1)]; // top-right
      const v01 = field[ix * (ny + 1) + (iy + 1)];     // top-left

      // Encode corners as binary: 1 if positive, 0 if negative
      const code =
        (v00 > 0 ? 1 : 0) |
        (v10 > 0 ? 2 : 0) |
        (v11 > 0 ? 4 : 0) |
        (v01 > 0 ? 8 : 0);

      if (code === 0 || code === 15) continue;

      // Interpolate edge crossings
      // Edge 0: bottom (v00 -> v10)
      // Edge 1: right  (v10 -> v11)
      // Edge 2: top    (v01 -> v11) -- note direction for consistent winding
      // Edge 3: left   (v00 -> v01)

      const lerp = (a: number, b: number): number => {
        const denom = a - b;
        return Math.abs(denom) > 1e-30 ? a / denom : 0.5;
      };

      const e0x = x0 + lerp(v00, v10) * dx;
      const e0y = y0;
      const e1x = x0 + dx;
      const e1y = y0 + lerp(v10, v11) * dy;
      const e2x = x0 + lerp(v01, v11) * dx;
      const e2y = y0 + dy;
      const e3x = x0;
      const e3y = y0 + lerp(v00, v01) * dy;

      // Lookup table for which edges to connect
      const edgeTable: Record<number, number[][]> = {
        1:  [[3, 0]],
        2:  [[0, 1]],
        3:  [[3, 1]],
        4:  [[1, 2]],
        5:  [[3, 0], [1, 2]], // ambiguous: use average to resolve
        6:  [[0, 2]],
        7:  [[3, 2]],
        8:  [[2, 3]],
        9:  [[2, 0]],
        10: [[0, 3], [2, 1]], // ambiguous
        11: [[2, 1]],
        12: [[1, 3]],
        13: [[1, 0]],
        14: [[0, 3]],
      };

      const edges: Array<[number, number]> = [
        [e0x, e0y],
        [e1x, e1y],
        [e2x, e2y],
        [e3x, e3y],
      ];

      const connections = edgeTable[code];
      if (!connections) continue;

      // Resolve ambiguous cases (5 and 10) using center value
      if (code === 5 || code === 10) {
        const center = (v00 + v10 + v11 + v01) / 4;
        if ((code === 5 && center > 0) || (code === 10 && center <= 0)) {
          // Reverse connections
          segments.push({
            x1: edges[connections[0][1]][0], y1: edges[connections[0][1]][1],
            x2: edges[connections[0][0]][0], y2: edges[connections[0][0]][1],
          });
          segments.push({
            x1: edges[connections[1][1]][0], y1: edges[connections[1][1]][1],
            x2: edges[connections[1][0]][0], y2: edges[connections[1][0]][1],
          });
          continue;
        }
      }

      for (const [from, to] of connections) {
        segments.push({
          x1: edges[from][0], y1: edges[from][1],
          x2: edges[to][0], y2: edges[to][1],
        });
      }
    }
  }

  // Chain segments into connected curves
  return chainSegments(segments);
}

/**
 * Chain unordered line segments into connected polylines.
 */
function chainSegments(
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
): NullclineCurve[] {
  if (segments.length === 0) return [];

  const eps = 1e-10;
  const used = new Uint8Array(segments.length);
  const curves: NullclineCurve[] = [];

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;

    const points: Array<{ x: number; y: number }> = [
      { x: segments[s].x1, y: segments[s].y1 },
      { x: segments[s].x2, y: segments[s].y2 },
    ];

    // Extend forward from the last point
    let changed = true;
    while (changed) {
      changed = false;
      const last = points[points.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const seg = segments[i];
        if (Math.abs(seg.x1 - last.x) < eps && Math.abs(seg.y1 - last.y) < eps) {
          points.push({ x: seg.x2, y: seg.y2 });
          used[i] = 1;
          changed = true;
          break;
        }
        if (Math.abs(seg.x2 - last.x) < eps && Math.abs(seg.y2 - last.y) < eps) {
          points.push({ x: seg.x1, y: seg.y1 });
          used[i] = 1;
          changed = true;
          break;
        }
      }
    }

    // Extend backward from the first point
    changed = true;
    while (changed) {
      changed = false;
      const first = points[0];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const seg = segments[i];
        if (Math.abs(seg.x2 - first.x) < eps && Math.abs(seg.y2 - first.y) < eps) {
          points.unshift({ x: seg.x1, y: seg.y1 });
          used[i] = 1;
          changed = true;
          break;
        }
        if (Math.abs(seg.x1 - first.x) < eps && Math.abs(seg.y1 - first.y) < eps) {
          points.unshift({ x: seg.x2, y: seg.y2 });
          used[i] = 1;
          changed = true;
          break;
        }
      }
    }

    curves.push({ points });
  }

  return curves;
}

// ── Fixed point finding and classification ──────────────────────────

function findFixedPoints(
  xNullclines: NullclineCurve[],
  yNullclines: NullclineCurve[],
  rhsFn: (state: Float64Array) => Float64Array,
  jacobianFn: ((state: Float64Array) => Float64Array) | undefined,
  xRange: [number, number],
  yRange: [number, number],
): FixedPoint[] {
  const candidates: Array<{ x: number; y: number }> = [];

  // Find approximate intersections between x-nullclines and y-nullclines
  for (const xnc of xNullclines) {
    for (const ync of yNullclines) {
      for (let i = 0; i < xnc.points.length - 1; i++) {
        const a1 = xnc.points[i];
        const a2 = xnc.points[i + 1];

        for (let j = 0; j < ync.points.length - 1; j++) {
          const b1 = ync.points[j];
          const b2 = ync.points[j + 1];

          const inter = segmentIntersection(a1, a2, b1, b2);
          if (inter) {
            candidates.push(inter);
          }
        }
      }
    }
  }

  // Refine each candidate with Newton's method
  const fixedPoints: FixedPoint[] = [];
  const seenSet = new Set<string>();

  for (const cand of candidates) {
    const refined = newtonRefine2D(rhsFn, cand.x, cand.y, xRange, yRange);
    if (!refined) continue;

    // Deduplicate
    const key = `${refined.x.toFixed(8)},${refined.y.toFixed(8)}`;
    if (seenSet.has(key)) continue;
    seenSet.add(key);

    // Classify
    const J = jacobianFn
      ? jacobianFn(new Float64Array([refined.x, refined.y]))
      : numericalJacobian2D(rhsFn, refined.x, refined.y);

    const eigenvalues = qrEigenvalues(J, 2);
    const fpType = classifyFixedPoint(eigenvalues);

    fixedPoints.push({
      x: refined.x,
      y: refined.y,
      type: fpType,
      eigenvalues,
    });
  }

  return fixedPoints;
}

/**
 * Newton's method to refine a 2D fixed point.
 */
function newtonRefine2D(
  rhsFn: (state: Float64Array) => Float64Array,
  x0: number,
  y0: number,
  xRange: [number, number],
  yRange: [number, number],
): { x: number; y: number } | null {
  let x = x0;
  let y = y0;

  for (let iter = 0; iter < 50; iter++) {
    const state = new Float64Array([x, y]);
    const f = rhsFn(state);

    if (Math.abs(f[0]) + Math.abs(f[1]) < 1e-12) {
      return { x, y };
    }

    // Numerical Jacobian
    const J = numericalJacobian2D(rhsFn, x, y);

    // Solve 2x2 system J * [dx, dy]^T = -f
    const det = J[0] * J[3] - J[1] * J[2];
    if (Math.abs(det) < 1e-30) return null;

    const invDet = 1 / det;
    const deltaX = invDet * (-J[3] * f[0] + J[1] * f[1]);
    const deltaY = invDet * (J[2] * f[0] - J[0] * f[1]);

    x += deltaX;
    y += deltaY;

    // Bail if out of range
    if (x < xRange[0] - 0.1 * (xRange[1] - xRange[0]) ||
        x > xRange[1] + 0.1 * (xRange[1] - xRange[0]) ||
        y < yRange[0] - 0.1 * (yRange[1] - yRange[0]) ||
        y > yRange[1] + 0.1 * (yRange[1] - yRange[0])) {
      return null;
    }
  }

  // Check if it converged
  const f = rhsFn(new Float64Array([x, y]));
  if (Math.abs(f[0]) + Math.abs(f[1]) < 1e-8) {
    return { x, y };
  }
  return null;
}

function numericalJacobian2D(
  rhsFn: (state: Float64Array) => Float64Array,
  x: number,
  y: number,
): Float64Array {
  const J = new Float64Array(4);
  const hx = Math.max(1e-8 * Math.abs(x), 1e-10);
  const hy = Math.max(1e-8 * Math.abs(y), 1e-10);

  const fxp = rhsFn(new Float64Array([x + hx, y]));
  const fxm = rhsFn(new Float64Array([x - hx, y]));
  const fyp = rhsFn(new Float64Array([x, y + hy]));
  const fym = rhsFn(new Float64Array([x, y - hy]));

  J[0] = (fxp[0] - fxm[0]) / (2 * hx); // df0/dx
  J[1] = (fyp[0] - fym[0]) / (2 * hy); // df0/dy
  J[2] = (fxp[1] - fxm[1]) / (2 * hx); // df1/dx
  J[3] = (fyp[1] - fym[1]) / (2 * hy); // df1/dy

  return J;
}

/**
 * Classify a 2D fixed point by eigenvalue structure.
 */
function classifyFixedPoint(eigenvalues: Array<ComplexNumber>): FixedPointType {
  if (eigenvalues.length < 2) return 'degenerate';

  const e1 = eigenvalues[0];
  const e2 = eigenvalues[1];

  const hasImag = Math.abs(e1.imag) > 1e-10 || Math.abs(e2.imag) > 1e-10;

  if (hasImag) {
    // Complex eigenvalues -> spiral or center
    const realPart = e1.real; // Both have the same real part for a 2x2
    if (Math.abs(realPart) < 1e-10) return 'center';
    return realPart < 0 ? 'stable-spiral' : 'unstable-spiral';
  }

  // Real eigenvalues
  if (e1.real < -1e-10 && e2.real < -1e-10) return 'stable-node';
  if (e1.real > 1e-10 && e2.real > 1e-10) return 'unstable-node';
  if (e1.real * e2.real < -1e-20) return 'saddle';

  return 'degenerate';
}

/**
 * Find the intersection point of two line segments, or null if they don't intersect.
 */
function segmentIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-20) return null;

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a1.x + t * dx1,
      y: a1.y + t * dy1,
    };
  }
  return null;
}
