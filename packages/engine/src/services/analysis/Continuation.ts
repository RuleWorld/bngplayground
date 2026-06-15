/**
 * Continuation.ts -- Pseudo-arclength parameter continuation for tracking
 * steady-state branches and detecting bifurcations.
 *
 * Algorithm:
 *   Predictor:  tangent along the solution curve
 *   Corrector:  Newton on the augmented system [f(y,p); arclength constraint]
 *
 * Detects saddle-node (fold) bifurcations (real eigenvalue crosses zero) and
 * Hopf bifurcations (complex conjugate pair crosses the imaginary axis).
 */

import { qrEigenvalues, solveLU, type ComplexNumber } from './EigenSolver';

// ── Types ───────────────────────────────────────────────────────────

export interface ContinuationConfig {
  /** Number of species */
  nSpecies: number;
  /** RHS as f(y, p) => dydt.  p is the scalar continuation parameter */
  rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
  /** Optional analytic Jacobian J(y,p) filling row-major nSpecies×nSpecies */
  jacobianFn?: (y: Float64Array, p: number, J: Float64Array) => void;
  /** Starting steady state y0 */
  initialState: Float64Array;
  /** Starting parameter value */
  parameterStart: number;
  /** End of parameter range */
  parameterEnd: number;
  /** Initial step size along the branch (in arclength units) */
  stepSize?: number;
  /** Maximum number of continuation steps */
  maxSteps?: number;
  /** Newton tolerance for corrector */
  tolerance?: number;
  /** Maximum Newton corrector iterations */
  maxCorrectorIterations?: number;
  /** Minimum step size before giving up */
  minStepSize?: number;
  /** Maximum step size */
  maxStepSize?: number;
}

export interface ContinuationPoint {
  /** Steady-state vector */
  y: Float64Array;
  /** Parameter value */
  parameterValue: number;
  /** Stability flag */
  stable: boolean;
  /** Eigenvalues at this point */
  eigenvalues: Array<ComplexNumber>;
}

export type BifurcationType = 'saddle-node' | 'hopf-supercritical' | 'hopf-subcritical' | 'transcritical' | 'pitchfork';

export interface BifurcationPoint {
  /** Type of bifurcation */
  type: BifurcationType;
  /** Parameter value at bifurcation */
  parameterValue: number;
  /** State at bifurcation */
  y: Float64Array;
  /** Critical eigenvalue(s) */
  criticalEigenvalues: Array<ComplexNumber>;
  /** Index in the continuation path */
  pathIndex: number;
}

export interface ContinuationResult {
  /** All continuation points */
  path: ContinuationPoint[];
  /** Detected bifurcation points */
  bifurcations: BifurcationPoint[];
  /** Whether continuation reached parameterEnd */
  completed: boolean;
}

// ── Main continuation driver ────────────────────────────────────────

export function continuation(
  config: ContinuationConfig,
  onProgress?: (point: ContinuationPoint, index: number) => void,
): ContinuationResult {
  const {
    nSpecies,
    rhsFn,
    parameterStart,
    parameterEnd,
    stepSize: initStep = 0.01,
    maxSteps = 2000,
    tolerance = 1e-9,
    maxCorrectorIterations = 20,
    minStepSize = 1e-8,
    maxStepSize = 0.5,
  } = config;

  const path: ContinuationPoint[] = [];
  const bifurcations: BifurcationPoint[] = [];

  // Current state and parameter
  const y = new Float64Array(config.initialState);
  let p = parameterStart;
  let ds = initStep * Math.sign(parameterEnd - parameterStart);

  // Compute initial eigenvalues
  const J0 = computeJacobian(config, y, p);
  const ev0 = qrEigenvalues(J0, nSpecies);
  const stable0 = ev0.every(e => e.real < -1e-12);

  const startPoint: ContinuationPoint = {
    y: new Float64Array(y),
    parameterValue: p,
    stable: stable0,
    eigenvalues: ev0,
  };
  path.push(startPoint);
  if (onProgress) onProgress(startPoint, 0);

  // Previous tangent for predictor
  const prevTangentY = new Float64Array(nSpecies);
  let prevTangentP: number;

  // Compute initial tangent: solve J * dy/dp = -df/dp
  {
    const fp = numericalDfDp(rhsFn, y, p, nSpecies);
    for (let i = 0; i < nSpecies; i++) fp[i] = -fp[i];
    const dydp = solveLU(J0, nSpecies, fp);
    const tangentNorm = Math.sqrt(vecDot(dydp, dydp) + 1);
    for (let i = 0; i < nSpecies; i++) prevTangentY[i] = dydp[i] / tangentNorm;
    prevTangentP = 1.0 / tangentNorm;
  }

  for (let step = 0; step < maxSteps; step++) {
    // Check if we've passed parameterEnd
    if ((parameterEnd > parameterStart && p >= parameterEnd) ||
        (parameterEnd < parameterStart && p <= parameterEnd)) {
      break;
    }

    // ── Predictor ──
    const yPred = new Float64Array(nSpecies);
    for (let i = 0; i < nSpecies; i++) yPred[i] = y[i] + ds * prevTangentY[i];
    const pPred = p + ds * prevTangentP;

    // ── Corrector (Newton on augmented system) ──
    const yCor = new Float64Array(yPred);
    let pCor = pPred;

    let corrected = false;
    for (let newtonIter = 0; newtonIter < maxCorrectorIterations; newtonIter++) {
      // Evaluate f(yCor, pCor)
      const f = new Float64Array(nSpecies);
      rhsFn(yCor, pCor, f);

      // Arclength constraint: N(y,p) = tangentY.(y-yPred) + tangentP*(p-pPred) = 0
      // (where we use the predicted tangent direction)
      let arcConstraint = prevTangentP * (pCor - p) - ds;
      for (let i = 0; i < nSpecies; i++) {
        arcConstraint += prevTangentY[i] * (yCor[i] - y[i]);
      }

      // Check convergence
      let rNorm = 0;
      for (let i = 0; i < nSpecies; i++) rNorm += f[i] * f[i];
      rNorm = Math.sqrt(rNorm + arcConstraint * arcConstraint);

      if (rNorm < tolerance) {
        corrected = true;
        break;
      }

      // Jacobian of augmented system: (nSpecies+1) x (nSpecies+1)
      const Jy = computeJacobian(config, yCor, pCor);
      const fp = numericalDfDp(rhsFn, yCor, pCor, nSpecies);

      // Build augmented system
      const dim = nSpecies + 1;
      const A = new Float64Array(dim * dim);
      const rhs = new Float64Array(dim);

      // Top-left: Jy
      for (let i = 0; i < nSpecies; i++) {
        for (let j = 0; j < nSpecies; j++) {
          A[i * dim + j] = Jy[i * nSpecies + j];
        }
        // Top-right: df/dp
        A[i * dim + nSpecies] = fp[i];
        // RHS: -f
        rhs[i] = -f[i];
      }

      // Bottom row: tangent direction
      for (let j = 0; j < nSpecies; j++) {
        A[nSpecies * dim + j] = prevTangentY[j];
      }
      A[nSpecies * dim + nSpecies] = prevTangentP;
      rhs[nSpecies] = -arcConstraint;

      // Solve
      const delta = solveLU(A, dim, rhs);

      // Update
      for (let i = 0; i < nSpecies; i++) yCor[i] += delta[i];
      pCor += delta[nSpecies];
    }

    if (!corrected) {
      // Reduce step size and retry
      ds *= 0.5;
      if (Math.abs(ds) < minStepSize) break;
      continue;
    }

    // Compute eigenvalues at corrected point
    const Jnew = computeJacobian(config, yCor, pCor);
    const evNew = qrEigenvalues(Jnew, nSpecies);
    const stableNew = evNew.every(e => e.real < -1e-12);

    const newPoint: ContinuationPoint = {
      y: new Float64Array(yCor),
      parameterValue: pCor,
      stable: stableNew,
      eigenvalues: evNew,
    };

    // ── Bifurcation detection ──
    const prevPoint = path[path.length - 1];
    const bif = detectBifurcation(prevPoint, newPoint, config);
    if (bif) {
      // Deduplicate: skip if too close to the last bifurcation of same type
      const minSpacing = 1e-4;
      const isDuplicate = bifurcations.some(
        b => b.type === bif.type && Math.abs(b.parameterValue - bif.parameterValue) < minSpacing,
      );
      if (!isDuplicate) {
        bif.pathIndex = path.length;
        bifurcations.push(bif);
      }
    }

    path.push(newPoint);
    if (onProgress) onProgress(newPoint, path.length - 1);

    // Update state
    for (let i = 0; i < nSpecies; i++) y[i] = yCor[i];
    p = pCor;

    // Update tangent for next predictor
    {
      const fp = numericalDfDp(rhsFn, y, p, nSpecies);
      for (let i = 0; i < nSpecies; i++) fp[i] = -fp[i];
      const dydp = solveLU(Jnew, nSpecies, fp);
      const tangentNorm = Math.sqrt(vecDot(dydp, dydp) + 1);
      const newTangentY = new Float64Array(nSpecies);
      for (let i = 0; i < nSpecies; i++) newTangentY[i] = dydp[i] / tangentNorm;
      const newTangentP = 1.0 / tangentNorm;

      // Ensure consistent orientation with previous tangent
      let dot = newTangentP * prevTangentP;
      for (let i = 0; i < nSpecies; i++) dot += newTangentY[i] * prevTangentY[i];
      const sign = dot >= 0 ? 1 : -1;
      for (let i = 0; i < nSpecies; i++) prevTangentY[i] = sign * newTangentY[i];
      prevTangentP = sign * newTangentP;
    }

    // Adaptive step size
    ds = Math.sign(ds) * Math.min(Math.abs(ds) * 1.1, maxStepSize);
  }

  const completed =
    (parameterEnd > parameterStart && p >= parameterEnd) ||
    (parameterEnd < parameterStart && p <= parameterEnd);

  return { path, bifurcations, completed };
}

// ── Bifurcation detection ───────────────────────────────────────────

/**
 * Match eigenvalues between consecutive continuation steps using
 * nearest-neighbor proximity in the complex plane. This is robust
 * to eigenvalue crossing (where sorting by real part fails).
 *
 * Returns an array where result[i] is the matched eigenvalue from `prev`
 * corresponding to `curr[i]`, or null if no good match exists.
 */
function matchEigenvalues(
  curr: Array<ComplexNumber>,
  prev: Array<ComplexNumber>,
): Array<ComplexNumber | null> {
  const used = new Set<number>();
  const result: Array<ComplexNumber | null> = [];

  for (const ce of curr) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let j = 0; j < prev.length; j++) {
      if (used.has(j)) continue;
      const pe = prev[j];
      const dist = (ce.real - pe.real) ** 2 + (ce.imag - pe.imag) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      result.push(prev[bestIdx]);
    } else {
      result.push(null);
    }
  }

  return result;
}

/**
 * Detect if a bifurcation occurred between two consecutive continuation
 * points by monitoring eigenvalue sign changes. Uses nearest-neighbor
 * eigenvalue matching to avoid false positives from eigenvalue crossing.
 *
 * @param minSpacing  Minimum parameter distance from the last detected
 *                    bifurcation of the same type (prevents duplicates).
 *
 * Returns the first (interpolated) bifurcation point or null.
 */
export function detectBifurcation(
  prev: ContinuationPoint,
  curr: ContinuationPoint,
  _config: ContinuationConfig,
): BifurcationPoint | null {
  // Match eigenvalues from curr to prev by nearest-neighbor in complex plane
  const matchedPrev = matchEigenvalues(curr.eigenvalues, prev.eigenvalues);

  // Compute spectral radius at both points to dynamically scale the noise threshold
  const maxEvMagPrev = prev.eigenvalues.length > 0
    ? Math.max(...prev.eigenvalues.map(e => Math.sqrt(e.real * e.real + e.imag * e.imag)))
    : 0;
  const maxEvMagCurr = curr.eigenvalues.length > 0
    ? Math.max(...curr.eigenvalues.map(e => Math.sqrt(e.real * e.real + e.imag * e.imag)))
    : 0;
  const maxEvMag = Math.max(maxEvMagPrev, maxEvMagCurr);
  const threshold = Math.max(1e-11, maxEvMag * 1e-11);

  // Saddle-node: a real eigenvalue crosses zero
  for (let i = 0; i < curr.eigenvalues.length; i++) {
    const eCurr = curr.eigenvalues[i];
    const ePrev = matchedPrev[i];
    if (!ePrev) continue;

    // Only consider real eigenvalues (small imaginary part)
    if (Math.abs(ePrev.imag) < 1e-8 && Math.abs(eCurr.imag) < 1e-8) {
      if (ePrev.real * eCurr.real < 0 && Math.max(Math.abs(ePrev.real), Math.abs(eCurr.real)) > threshold) {
        // Real eigenvalue crossed zero -> saddle-node (fold)
        // Linear interpolation for bifurcation parameter
        const t = Math.abs(ePrev.real) / (Math.abs(ePrev.real) + Math.abs(eCurr.real));
        const pBif = prev.parameterValue + t * (curr.parameterValue - prev.parameterValue);
        const yBif = new Float64Array(curr.y.length);
        for (let j = 0; j < yBif.length; j++) {
          yBif[j] = prev.y[j] + t * (curr.y[j] - prev.y[j]);
        }

        return {
          type: 'saddle-node',
          parameterValue: pBif,
          y: yBif,
          criticalEigenvalues: [eCurr],
          pathIndex: 0,
        };
      }
    }
  }

  // Hopf: a complex conjugate pair crosses the imaginary axis
  // Find complex pairs in curr and check if real part changed sign
  const prevPairs = findComplexPairs(prev.eigenvalues);
  const currPairs = findComplexPairs(curr.eigenvalues);

  for (const cp of currPairs) {
    // Find matching pair in prev (closest by distance in complex plane)
    let bestMatch: { e1: ComplexNumber; e2: ComplexNumber } | null = null;
    let bestDist = Infinity;

    for (const pp of prevPairs) {
      const dist = (pp.e1.real - cp.e1.real) ** 2 + (pp.e1.imag - cp.e1.imag) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = pp;
      }
    }

    if (bestMatch && bestMatch.e1.real * cp.e1.real < 0 && Math.max(Math.abs(bestMatch.e1.real), Math.abs(cp.e1.real)) > threshold) {
      // Hopf bifurcation!
      const t = Math.abs(bestMatch.e1.real) / (Math.abs(bestMatch.e1.real) + Math.abs(cp.e1.real));
      const pBif = prev.parameterValue + t * (curr.parameterValue - prev.parameterValue);
      const yBif = new Float64Array(curr.y.length);
      for (let j = 0; j < yBif.length; j++) {
        yBif[j] = prev.y[j] + t * (curr.y[j] - prev.y[j]);
      }

      // Classify: supercritical if pair moves from negative to positive real part
      // with increasing parameter (stable limit cycle emerges)
      const isSupercritical = cp.e1.real > 0;
      const hopfType: BifurcationType = isSupercritical ? 'hopf-supercritical' : 'hopf-subcritical';

      return {
        type: hopfType,
        parameterValue: pBif,
        y: yBif,
        criticalEigenvalues: [cp.e1, cp.e2],
        pathIndex: 0,
      };
    }
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function findComplexPairs(
  eigenvalues: Array<ComplexNumber>,
): Array<{ e1: ComplexNumber; e2: ComplexNumber }> {
  const pairs: Array<{ e1: ComplexNumber; e2: ComplexNumber }> = [];
  const used = new Set<number>();

  for (let i = 0; i < eigenvalues.length; i++) {
    if (used.has(i)) continue;
    const e = eigenvalues[i];
    if (Math.abs(e.imag) < 1e-10) continue;

    // Look for conjugate
    for (let j = i + 1; j < eigenvalues.length; j++) {
      if (used.has(j)) continue;
      const f = eigenvalues[j];
      if (Math.abs(e.real - f.real) < 1e-8 && Math.abs(e.imag + f.imag) < 1e-8) {
        // e.imag > 0 convention for e1
        if (e.imag > 0) {
          pairs.push({ e1: e, e2: f });
        } else {
          pairs.push({ e1: f, e2: e });
        }
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  return pairs;
}

function computeJacobian(
  config: ContinuationConfig,
  y: Float64Array,
  p: number,
): Float64Array {
  const n = config.nSpecies;
  const J = new Float64Array(n * n);

  if (config.jacobianFn) {
    config.jacobianFn(y, p, J);
    return J;
  }

  // Central finite differences
  const fPlus = new Float64Array(n);
  const fMinus = new Float64Array(n);
  const yP = new Float64Array(y);

  for (let j = 0; j < n; j++) {
    const h = Math.max(1e-8 * Math.abs(y[j]), 1e-10);
    yP[j] = y[j] + h;
    config.rhsFn(yP, p, fPlus);
    yP[j] = y[j] - h;
    config.rhsFn(yP, p, fMinus);
    yP[j] = y[j];
    const inv2h = 1 / (2 * h);
    for (let i = 0; i < n; i++) {
      J[i * n + j] = (fPlus[i] - fMinus[i]) * inv2h;
    }
  }
  return J;
}

function numericalDfDp(
  rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void,
  y: Float64Array,
  p: number,
  n: number,
): Float64Array {
  const h = Math.max(1e-8 * Math.abs(p), 1e-10);
  const fPlus = new Float64Array(n);
  const fMinus = new Float64Array(n);
  rhsFn(y, p + h, fPlus);
  rhsFn(y, p - h, fMinus);
  const result = new Float64Array(n);
  const inv2h = 1 / (2 * h);
  for (let i = 0; i < n; i++) result[i] = (fPlus[i] - fMinus[i]) * inv2h;
  return result;
}

function vecDot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
