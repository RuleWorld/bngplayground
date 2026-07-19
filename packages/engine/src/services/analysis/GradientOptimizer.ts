import { vecNorm, vecDot, vecScale, vecAdd, vecSub } from '../../utils/vectorMath';
/**
 * GradientOptimizer.ts -- Gradient-based optimization algorithms.
 *
 * Provides L-BFGS, Adam, and Trust-Region Newton-CG optimizers
 * for use with the DifferentiableSolver gradient computations.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface GradientOptimizerConfig {
  objectiveFn: (params: Float64Array) => Promise<{ value: number; gradient: Float64Array }>;
  initialParams: Float64Array;
  bounds?: Array<[number, number]>;
  maxIterations?: number;
  tolerance?: number;
  learningRate?: number;
}

export interface OptimizationResult {
  parameters: Float64Array;
  objectiveValue: number;
  iterations: number;
  converged: boolean;
  trajectory: Array<{ iteration: number; objective: number; gradientNorm: number }>;
}

// ── Utility helpers ─────────────────────────────────────────────────

function projectOnBounds(x: Float64Array, bounds?: Array<[number, number]>): Float64Array {
  if (!bounds) return x;
  const r = new Float64Array(x);
  for (let i = 0; i < x.length; i++) {
    if (bounds[i]) {
      r[i] = Math.max(bounds[i][0], Math.min(bounds[i][1], r[i]));
    }
  }
  return r;
}

// ── L-BFGS ──────────────────────────────────────────────────────────

/**
 * L-BFGS (Limited-memory BFGS) optimizer with strong Wolfe line search
 * and box-constraint projection.
 *
 * Memory parameter m = 10.
 */
export async function lbfgsOptimize(config: GradientOptimizerConfig): Promise<OptimizationResult> {
  const { objectiveFn, bounds } = config;
  const maxIter = config.maxIterations ?? 200;
  const tol = config.tolerance ?? 1e-8;
  const m = 10; // memory size
  const n = config.initialParams.length;

  let x = projectOnBounds(new Float64Array(config.initialParams), bounds);
  const evalResult = await objectiveFn(x);
  let f = evalResult.value;
  let g = new Float64Array(evalResult.gradient);

  const trajectory: OptimizationResult['trajectory'] = [];

  // L-BFGS storage: arrays of s_k and y_k vectors
  const sHistory: Float64Array[] = [];
  const yHistory: Float64Array[] = [];
  const rhoHistory: number[] = [];

  let converged = false;
  let iter = 0;

  for (; iter < maxIter; iter++) {
    const gNorm = vecNorm(g);
    trajectory.push({ iteration: iter, objective: f, gradientNorm: gNorm });

    if (gNorm < tol) {
      converged = true;
      break;
    }

    // ── Two-loop recursion to compute search direction ──
    const q = new Float64Array(g);
    const k = sHistory.length;
    const alpha = new Float64Array(k);

    // First loop (backward)
    for (let i = k - 1; i >= 0; i--) {
      alpha[i] = rhoHistory[i] * vecDot(sHistory[i], q);
      // q = q - alpha[i] * y[i]
      for (let j = 0; j < n; j++) q[j] -= alpha[i] * yHistory[i][j];
    }

    // Scaling: H0 = (s_{k-1}^T y_{k-1}) / (y_{k-1}^T y_{k-1}) * I
    let gamma = 1.0;
    if (k > 0) {
      const yk = yHistory[k - 1];
      const sk = sHistory[k - 1];
      const yTy = vecDot(yk, yk);
      if (yTy > 0) gamma = vecDot(sk, yk) / yTy;
    }
    // r = gamma * q
    const r = vecScale(q, gamma);

    // Second loop (forward)
    for (let i = 0; i < k; i++) {
      const beta = rhoHistory[i] * vecDot(yHistory[i], r);
      // r = r + (alpha[i] - beta) * s[i]
      const diff = alpha[i] - beta;
      for (let j = 0; j < n; j++) r[j] += diff * sHistory[i][j];
    }

    // d = -r (search direction)
    const d = vecScale(r, -1);

    // ── Strong Wolfe line search ──
    const c1 = 1e-4;
    const c2 = 0.9;
    const dg0 = vecDot(g, d);

    if (dg0 >= 0) {
      // Not a descent direction; reset to steepest descent
      for (let j = 0; j < n; j++) d[j] = -g[j];
    }

    const dgDir = vecDot(g, d);
    let stepSize = 1.0;
    let aLo = 0;
    let aHi = Infinity;
    let fPrev = f;
    let lineSearchSuccess = false;

    for (let ls = 0; ls < 25; ls++) {
      const xTrial = projectOnBounds(vecAdd(x, vecScale(d, stepSize)), bounds);
      const trialResult = await objectiveFn(xTrial);
      const fTrial = trialResult.value;
      const gTrial = new Float64Array(trialResult.gradient);

      // Armijo condition
      if (fTrial > f + c1 * stepSize * dgDir || (ls > 0 && fTrial >= fPrev)) {
        aHi = stepSize;
        stepSize = (aLo + aHi) / 2;
        fPrev = fTrial;
        continue;
      }

      const dgTrial = vecDot(gTrial, d);

      // Strong Wolfe curvature condition
      if (Math.abs(dgTrial) <= -c2 * dgDir) {
        // Accept step
        const xNew = xTrial;
        const sVec = vecSub(xNew, x);
        const yVec = vecSub(gTrial, g);
        const sy = vecDot(sVec, yVec);

        if (sy > 1e-16) {
          if (sHistory.length >= m) {
            sHistory.shift();
            yHistory.shift();
            rhoHistory.shift();
          }
          sHistory.push(sVec);
          yHistory.push(yVec);
          rhoHistory.push(1.0 / sy);
        }

        x = xNew;
        f = fTrial;
        g = gTrial;
        lineSearchSuccess = true;
        break;
      }

      if (dgTrial >= 0) {
        aHi = stepSize;
        stepSize = (aLo + aHi) / 2;
      } else {
        aLo = stepSize;
        if (aHi === Infinity) {
          stepSize *= 2;
        } else {
          stepSize = (aLo + aHi) / 2;
        }
      }
      fPrev = fTrial;
    }

    if (!lineSearchSuccess) {
      // Line search failed -- try a small gradient step
      const xNew = projectOnBounds(vecAdd(x, vecScale(g, -1e-4)), bounds);
      const res = await objectiveFn(xNew);
      if (res.value < f) {
        x = xNew;
        f = res.value;
        g = new Float64Array(res.gradient);
      } else {
        // Cannot make progress
        break;
      }
    }
  }

  trajectory.push({ iteration: iter, objective: f, gradientNorm: vecNorm(g) });

  return {
    parameters: x,
    objectiveValue: f,
    iterations: iter,
    converged,
    trajectory,
  };
}

// ── Adam ────────────────────────────────────────────────────────────

/**
 * Adam optimizer with bias correction, cosine annealing learning rate
 * schedule, and gradient clipping (max norm 1.0).
 */
export async function adamOptimize(config: GradientOptimizerConfig): Promise<OptimizationResult> {
  const { objectiveFn, bounds } = config;
  const maxIter = config.maxIterations ?? 200;
  const tol = config.tolerance ?? 1e-8;
  const lr0 = config.learningRate ?? 0.01;
  const n = config.initialParams.length;

  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;
  const maxGradNorm = 1.0;

  let x = projectOnBounds(new Float64Array(config.initialParams), bounds);
  const mVec = new Float64Array(n); // first moment
  const vVec = new Float64Array(n); // second moment

  const trajectory: OptimizationResult['trajectory'] = [];
  let converged = false;
  let bestF = Infinity;
  let bestX = new Float64Array(x);
  let iter = 0;

  for (; iter < maxIter; iter++) {
    const evalResult = await objectiveFn(x);
    const f = evalResult.value;
    const g = new Float64Array(evalResult.gradient);
    const gNorm = vecNorm(g);

    trajectory.push({ iteration: iter, objective: f, gradientNorm: gNorm });

    if (f < bestF) {
      bestF = f;
      bestX = new Float64Array(x);
    }

    if (gNorm < tol) {
      converged = true;
      break;
    }

    // Gradient clipping
    let clippedG: Float64Array = g;
    if (gNorm > maxGradNorm) {
      clippedG = vecScale(g, maxGradNorm / gNorm);
    }

    // Update biased first and second moment estimates
    for (let i = 0; i < n; i++) {
      mVec[i] = beta1 * mVec[i] + (1 - beta1) * clippedG[i];
      vVec[i] = beta2 * vVec[i] + (1 - beta2) * clippedG[i] * clippedG[i];
    }

    // Bias correction
    const t = iter + 1;
    const mHat = new Float64Array(n);
    const vHat = new Float64Array(n);
    const bc1 = 1 - Math.pow(beta1, t);
    const bc2 = 1 - Math.pow(beta2, t);
    for (let i = 0; i < n; i++) {
      mHat[i] = mVec[i] / bc1;
      vHat[i] = vVec[i] / bc2;
    }

    // Cosine annealing learning rate with floor at 1% of initial
    const lr = Math.max(lr0 * 0.01, lr0 * 0.5 * (1 + Math.cos(Math.PI * iter / maxIter)));

    // Parameter update
    const xNew = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xNew[i] = x[i] - lr * mHat[i] / (Math.sqrt(vHat[i]) + epsilon);
    }

    x = projectOnBounds(xNew, bounds);
  }

  // Final evaluation
  const finalEval = await objectiveFn(bestX);
  trajectory.push({ iteration: iter, objective: finalEval.value, gradientNorm: vecNorm(finalEval.gradient) });

  return {
    parameters: bestX,
    objectiveValue: bestF,
    iterations: iter,
    converged,
    trajectory,
  };
}

// ── Trust-Region Newton-CG ──────────────────────────────────────────

/**
 * Trust-region Newton-CG optimizer.
 *
 * Uses CG to approximately solve the trust-region subproblem.
 * Falls back to the Cauchy point when CG encounters negative curvature
 * or fails. Adjusts the trust radius based on the ratio of actual to
 * predicted reduction.
 */
export async function trustRegionOptimize(config: GradientOptimizerConfig): Promise<OptimizationResult> {
  const { objectiveFn, bounds } = config;
  const maxIter = config.maxIterations ?? 200;
  const tol = config.tolerance ?? 1e-8;
  const n = config.initialParams.length;

  let x = projectOnBounds(new Float64Array(config.initialParams), bounds);
  const evalResult = await objectiveFn(x);
  let f = evalResult.value;
  let g = new Float64Array(evalResult.gradient);

  let delta = 1.0; // trust region radius
  const deltaMax = 100.0;
  const eta = 0.1; // acceptance threshold

  const trajectory: OptimizationResult['trajectory'] = [];
  let converged = false;
  let iter = 0;

  for (; iter < maxIter; iter++) {
    const gNorm = vecNorm(g);
    trajectory.push({ iteration: iter, objective: f, gradientNorm: gNorm });

    if (gNorm < tol) {
      converged = true;
      break;
    }

    // Approximate Hessian-vector product via finite differences of gradient
    const hvp = async (v: Float64Array): Promise<Float64Array> => {
      const eps = 1e-6;
      const vn = vecNorm(v);
      if (vn < 1e-16) return new Float64Array(n);
      const h = eps / vn;
      const xp = vecAdd(x, vecScale(v, h));
      const res = await objectiveFn(xp);
      const hv = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        hv[i] = (res.gradient[i] - g[i]) / h;
      }
      return hv;
    };

    // ── Solve trust-region subproblem with CG (Steihaug-Toint) ──
    let step = await steihaugCG(g, hvp, delta, n);

    // If CG step is zero, use Cauchy point
    const stepNorm = vecNorm(step);
    if (stepNorm < 1e-16) {
      step = cauchyPoint(g, delta);
    }

    // Evaluate candidate
    const xCandidate = projectOnBounds(vecAdd(x, step), bounds);
    const candResult = await objectiveFn(xCandidate);
    const fCandidate = candResult.value;

    // Predicted reduction: -g^T step - 0.5 * step^T H step
    // We approximate step^T H step via the Hessian-vector product
    const Hs = await hvp(step);
    const predictedReduction = -(vecDot(g, step) + 0.5 * vecDot(step, Hs));
    const actualReduction = f - fCandidate;

    // Ratio of actual to predicted reduction
    const rho = predictedReduction > 1e-16 ? actualReduction / predictedReduction : 0;

    // Adjust trust radius
    if (rho < 0.25) {
      delta = Math.max(0.25 * delta, 1e-12);
    } else if (rho > 0.75 && stepNorm >= 0.9 * delta) {
      delta = Math.min(2 * delta, deltaMax);
    }
    // else delta stays the same

    // Accept or reject step
    if (rho > eta) {
      x = xCandidate;
      f = fCandidate;
      g = new Float64Array(candResult.gradient);
    }
  }

  trajectory.push({ iteration: iter, objective: f, gradientNorm: vecNorm(g) });

  return {
    parameters: x,
    objectiveValue: f,
    iterations: iter,
    converged,
    trajectory,
  };
}

/**
 * Steihaug-Toint truncated CG for the trust-region subproblem.
 *
 * Approximately minimizes  m(p) = g^T p + 0.5 p^T H p  subject to ||p|| <= delta.
 */
async function steihaugCG(
  g: Float64Array,
  hvp: (v: Float64Array) => Promise<Float64Array>,
  delta: number,
  n: number,
): Promise<Float64Array> {
  const z = new Float64Array(n); // current CG iterate (z_0 = 0)
  const r = new Float64Array(g); // residual (r_0 = g)
  const d = vecScale(r, -1); // search direction (d_0 = -r_0 = -g)

  const maxCGIter = Math.min(n, 50);

  for (let j = 0; j < maxCGIter; j++) {
    const Hd = await hvp(d);
    const dHd = vecDot(d, Hd);

    // Negative curvature: find tau such that ||z + tau*d|| = delta
    if (dHd <= 1e-16) {
      return trustRegionBoundary(z, d, delta);
    }

    const rr = vecDot(r, r);
    const alpha = rr / dHd;

    const zNext = vecAdd(z, vecScale(d, alpha));

    // If z_next leaves the trust region, find boundary intersection
    if (vecNorm(zNext) >= delta) {
      return trustRegionBoundary(z, d, delta);
    }

    const rNext = vecAdd(r, vecScale(Hd, alpha));

    if (vecNorm(rNext) < 1e-10 * vecNorm(g)) {
      return zNext; // converged
    }

    const rrNext = vecDot(rNext, rNext);
    const beta = rrNext / rr;
    const dNext = vecAdd(vecScale(rNext, -1), vecScale(d, beta));

    // Update for next iteration
    z.set(zNext);
    r.set(rNext);
    d.set(dNext);
  }

  return z;
}

/**
 * Find tau >= 0 such that ||z + tau * d|| = delta.
 */
function trustRegionBoundary(z: Float64Array, d: Float64Array, delta: number): Float64Array {
  const zz = vecDot(z, z);
  const zd = vecDot(z, d);
  const dd = vecDot(d, d);

  if (dd < 1e-30) return z;

  const discriminant = zd * zd - dd * (zz - delta * delta);
  const tau = (-zd + Math.sqrt(Math.max(0, discriminant))) / dd;

  return vecAdd(z, vecScale(d, tau));
}

/**
 * Cauchy point: the minimizer of the quadratic model along -g, clipped to trust region.
 */
function cauchyPoint(g: Float64Array, delta: number): Float64Array {
  const gNorm = vecNorm(g);
  if (gNorm < 1e-30) return new Float64Array(g.length);

  // Step = -(delta / ||g||) * g
  return vecScale(g, -delta / gNorm);
}
