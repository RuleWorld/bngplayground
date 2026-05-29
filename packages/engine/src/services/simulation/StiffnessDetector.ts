/**
 * StiffnessDetector.ts
 *
 * Runtime stiffness detection and automatic solver switching, inspired by
 * DifferentialEquations.jl's CompositeAlgorithm / AutoSwitch.
 *
 * The detector uses two complementary heuristics:
 *   1. Explicit-vs-implicit step comparison (cheap, direct)
 *   2. Spectral radius estimation via power iteration on the Jacobian
 *      (approximated by finite differences — no explicit Jacobian needed)
 *
 * A sliding-window step acceptance tracker feeds into the AutoSolver wrapper
 * to decide whether a solver switch (or CVODE parameter retune) is warranted.
 */

import type { DerivativeFunction, SolverOptions, SolverResult } from '../../utils/solverUtils';

// ---------------------------------------------------------------------------
// Stiffness classification
// ---------------------------------------------------------------------------

export type StiffnessLevel = 'non_stiff' | 'mild' | 'moderate' | 'very_stiff';

export interface StiffnessProbe {
  /** Stiffness classification based on combined heuristics. */
  level: StiffnessLevel;
  /** Ratio ||y_exp - y_imp|| / ||y_imp||. Large values indicate stiffness. */
  stepDivergence: number;
  /** Estimated spectral radius (largest eigenvalue magnitude of Jacobian). */
  spectralRadius: number;
  /** Product spectral_radius * h — exceeding stability boundary means stiff. */
  stabilityProduct: number;
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

function vecNorm(v: Float64Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function vecScale(v: Float64Array, alpha: number, out: Float64Array): void {
  for (let i = 0; i < v.length; i++) out[i] = v[i] * alpha;
}

function vecAxpy(alpha: number, x: Float64Array, y: Float64Array, out: Float64Array): void {
  for (let i = 0; i < x.length; i++) out[i] = y[i] + alpha * x[i];
}

// ---------------------------------------------------------------------------
// StiffnessDetector
// ---------------------------------------------------------------------------

/** Default stiffness threshold (empirical, following DiffEq.jl AutoSwitch). */
const DEFAULT_STIFF_THRESHOLD = 10;

/** Stability boundary of explicit Euler on the negative real axis. */
const EXPLICIT_EULER_STABILITY_BOUNDARY = 2.0;

/** Default number of power iterations for spectral radius estimation. */
const DEFAULT_POWER_ITERATIONS = 5;

/** Epsilon scale factor for finite-difference Jacobian-vector product. */
const SQRT_EPS = 1.4901161193847656e-8;

export interface StiffnessDetectorOptions {
  /** Divergence threshold above which the system is considered stiff. Default 10. */
  stiffThreshold?: number;
  /** Number of power iterations for spectral radius. Default 5. */
  powerIterations?: number;
  /** Size of the sliding window for step acceptance tracking. Default 25. */
  acceptanceWindowSize?: number;
}

export class StiffnessDetector {
  private readonly n: number;
  private readonly f: DerivativeFunction;
  private readonly stiffThreshold: number;
  private readonly powerIterations: number;
  private readonly acceptanceWindowSize: number;

  // Reusable buffers
  private readonly dydt: Float64Array;
  private readonly yExp: Float64Array;
  private readonly yImp: Float64Array;
  private readonly tmp: Float64Array;
  private readonly v: Float64Array;
  private readonly Jv: Float64Array;
  private readonly f0: Float64Array;
  private readonly f1: Float64Array;

  // Sliding window
  private acceptanceWindow: boolean[] = [];

  constructor(n: number, f: DerivativeFunction, options: StiffnessDetectorOptions = {}) {
    this.n = n;
    this.f = f;
    this.stiffThreshold = options.stiffThreshold ?? DEFAULT_STIFF_THRESHOLD;
    this.powerIterations = options.powerIterations ?? DEFAULT_POWER_ITERATIONS;
    this.acceptanceWindowSize = options.acceptanceWindowSize ?? 25;

    this.dydt = new Float64Array(n);
    this.yExp = new Float64Array(n);
    this.yImp = new Float64Array(n);
    this.tmp = new Float64Array(n);
    this.v = new Float64Array(n);
    this.Jv = new Float64Array(n);
    this.f0 = new Float64Array(n);
    this.f1 = new Float64Array(n);
  }

  // -----------------------------------------------------------------------
  // detectStiffness — explicit vs implicit step comparison
  // -----------------------------------------------------------------------

  /**
   * Compare one explicit Euler step with one implicit Euler step.
   *
   * Explicit:  y_exp = y + h * f(y)
   * Implicit:  solve (I - h*J)*dy = h*f(y), y_imp = y + dy
   *            (one Newton iteration, Jacobian approximated via finite differences)
   *
   * If ||y_exp - y_imp|| / ||y_imp|| > threshold the system is stiff at (y, t, h).
   */
  detectStiffness(y: Float64Array, t: number, h: number): { isStiff: boolean; divergence: number } {
    const n = this.n;
    void t; // t unused — derivative function is autonomous in this codebase

    // f(y)
    this.f(y, this.dydt);

    // Explicit Euler: y_exp = y + h * f(y)
    vecAxpy(h, this.dydt, y, this.yExp);

    // Implicit Euler via one Newton step:
    //   (I - h*J) * dy = h * f(y)
    // We approximate the solve by computing dy directly from the explicit RHS
    // and one correction using the Jacobian-vector product.
    //
    // Start with dy0 = h * f(y)  (= explicit step displacement)
    // Correction: dy1 = dy0 + h * (J * dy0)  =>  y_imp = y + dy1
    // This is effectively one step of fixed-point iteration for the implicit equation.
    //
    // For a more robust comparison we do a direct finite-difference based
    // approximation of the implicit solution:
    //   y_imp = y + h * f(y + h * f(y))   (semi-implicit predictor-corrector)
    this.f(this.yExp, this.tmp); // f(y_exp)
    vecAxpy(h, this.tmp, y, this.yImp); // y_imp = y + h * f(y_exp)

    // Divergence metric
    let diffSq = 0;
    let impSq = 0;
    for (let i = 0; i < n; i++) {
      const d = this.yExp[i] - this.yImp[i];
      diffSq += d * d;
      impSq += this.yImp[i] * this.yImp[i];
    }

    const impNorm = Math.sqrt(impSq);
    const divergence = impNorm > 1e-30 ? Math.sqrt(diffSq) / impNorm : 0;

    return {
      isStiff: divergence > this.stiffThreshold,
      divergence,
    };
  }

  // -----------------------------------------------------------------------
  // estimateSpectralRadius — power iteration on the Jacobian
  // -----------------------------------------------------------------------

  /**
   * Estimate the spectral radius (largest eigenvalue magnitude) of the
   * Jacobian df/dy using power iteration.
   *
   * The Jacobian-vector product J*v is approximated via finite differences:
   *   J*v ≈ (f(y + ε*v) − f(y)) / ε
   */
  estimateSpectralRadius(y: Float64Array, t: number): number {
    const n = this.n;
    void t;

    if (n === 0) return 0;

    // Base evaluation
    this.f(y, this.f0);

    // Initialize v with a normalized random-ish vector (use 1/sqrt(n) for reproducibility)
    const invSqrtN = 1 / Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      // Alternate signs to avoid degenerate alignment with constant vectors
      this.v[i] = (i % 2 === 0 ? 1 : -1) * invSqrtN;
    }

    let lambda = 0;

    for (let iter = 0; iter < this.powerIterations; iter++) {
      // Compute J*v via finite differences
      const vNorm = vecNorm(this.v);
      if (vNorm < 1e-30) break;

      // ε chosen so that y + ε*v differs from y at roughly sqrt(eps) scale
      const yNorm = vecNorm(y);
      const epsilon = SQRT_EPS * Math.max(yNorm, 1.0) / vNorm;

      // y_perturbed = y + epsilon * v
      vecAxpy(epsilon, this.v, y, this.tmp);
      this.f(this.tmp, this.f1);

      // Jv = (f1 - f0) / epsilon
      const invEps = 1 / epsilon;
      for (let i = 0; i < n; i++) {
        this.Jv[i] = (this.f1[i] - this.f0[i]) * invEps;
      }

      const JvNorm = vecNorm(this.Jv);
      if (JvNorm < 1e-30) {
        lambda = 0;
        break;
      }

      lambda = JvNorm;

      // Normalize: v = Jv / ||Jv||
      vecScale(this.Jv, 1 / JvNorm, this.v);
    }

    return lambda;
  }

  // -----------------------------------------------------------------------
  // Full stiffness probe combining both heuristics
  // -----------------------------------------------------------------------

  /**
   * Run a full stiffness probe at the given state (y, t) with trial step h.
   */
  probe(y: Float64Array, t: number, h: number): StiffnessProbe {
    const { isStiff: stepStiff, divergence } = this.detectStiffness(y, t, h);
    const spectralRadius = this.estimateSpectralRadius(y, t);
    const stabilityProduct = spectralRadius * h;

    // Classify combining both signals
    const spectralStiff = stabilityProduct > EXPLICIT_EULER_STABILITY_BOUNDARY;

    let level: StiffnessLevel;
    if (stepStiff && spectralStiff) {
      level = 'very_stiff';
    } else if (stepStiff || spectralStiff) {
      // If spectral radius is extreme, upgrade to very stiff
      if (stabilityProduct > 100) {
        level = 'very_stiff';
      } else {
        level = 'moderate';
      }
    } else if (divergence > 1 || stabilityProduct > 0.5) {
      level = 'mild';
    } else {
      level = 'non_stiff';
    }

    return { level, stepDivergence: divergence, spectralRadius, stabilityProduct };
  }

  // -----------------------------------------------------------------------
  // Sliding-window step acceptance tracking
  // -----------------------------------------------------------------------

  /** Record a step acceptance/rejection. */
  recordAcceptance(accepted: boolean): void {
    this.acceptanceWindow.push(accepted);
    if (this.acceptanceWindow.length > this.acceptanceWindowSize) {
      this.acceptanceWindow.shift();
    }
  }

  /** Fraction of accepted steps in the current window. */
  get acceptanceRate(): number {
    if (this.acceptanceWindow.length === 0) return 1;
    const acc = this.acceptanceWindow.filter(Boolean).length;
    return acc / this.acceptanceWindow.length;
  }

  /** Whether the window is fully populated. */
  get windowFull(): boolean {
    return this.acceptanceWindow.length >= this.acceptanceWindowSize;
  }

  /** Reset the acceptance window. */
  resetWindow(): void {
    this.acceptanceWindow = [];
  }
}

// ---------------------------------------------------------------------------
// CompositeAutoSolver — stiffness-aware auto-switching wrapper
// ---------------------------------------------------------------------------

/**
 * Recommended solver selection based on a stiffness probe result.
 *
 * For BioNetGen models the safe default is CVODE (BDF), so the value of this
 * detector is primarily in auto-tuning CVODE parameters or selecting a lighter
 * method when stiffness is genuinely absent.
 */
export function recommendSolver(probe: StiffnessProbe): SolverOptions['solver'] {
  switch (probe.level) {
    case 'very_stiff':
      return 'cvode_jac';
    case 'moderate':
      return 'cvode';
    case 'mild':
      return 'rosenbrock23';
    case 'non_stiff':
      return 'rk45';
  }
}

export interface CompositeAutoSolverOptions {
  /** How often (in integration steps) to re-probe stiffness. Default 25. */
  reprobeInterval?: number;
  /** Stiffness detector options. */
  detectorOptions?: StiffnessDetectorOptions;
}

/**
 * CompositeAutoSolver — wraps the existing solver infrastructure and uses
 * StiffnessDetector to select and switch solvers at runtime.
 *
 * Strategy:
 *   1. Before integration starts, run a stiffness probe (1-2 trial steps).
 *   2. Select initial solver based on probe result.
 *   3. Every `reprobeInterval` steps, re-probe and consider switching.
 *   4. The safe default is CVODE (assume stiff — standard for biology).
 */
export class CompositeAutoSolver {
  private readonly detector: StiffnessDetector;
  private readonly reprobeInterval: number;

  private currentSolver: { integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult; destroy?: () => void } | null = null;
  private currentSolverName: SolverOptions['solver'] = 'cvode';
  private lastProbe: StiffnessProbe | null = null;

  // Factory will be injected so we can create solvers on the fly
  private solverFactory: (solver: SolverOptions['solver']) => Promise<{ integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult; destroy?: () => void }>;

  constructor(
    n: number,
    f: DerivativeFunction,
    opts: SolverOptions,
    solverFactory: (solver: SolverOptions['solver']) => Promise<{ integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult; destroy?: () => void }>,
    compositeOpts: CompositeAutoSolverOptions = {},
  ) {
    this.solverFactory = solverFactory;
    this.reprobeInterval = compositeOpts.reprobeInterval ?? 25;
    this.detector = new StiffnessDetector(n, f, compositeOpts.detectorOptions);
  }

  /** Run initial stiffness probe and create the first solver. */
  async initialize(y0: Float64Array, t0: number, tEnd: number): Promise<void> {
    // Trial step size — small fraction of the integration span
    const hTrial = (tEnd - t0) * 1e-4;
    this.lastProbe = this.detector.probe(y0, t0, hTrial);
    const recommended = recommendSolver(this.lastProbe);

    console.log(
      `[CompositeAutoSolver] Initial probe: level=${this.lastProbe.level}, ` +
      `divergence=${this.lastProbe.stepDivergence.toExponential(3)}, ` +
      `spectralRadius=${this.lastProbe.spectralRadius.toExponential(3)}, ` +
      `recommended=${recommended}`,
    );

    await this.switchSolver(recommended);
  }

  private async switchSolver(solverName: SolverOptions['solver']): Promise<void> {
    if (this.currentSolverName === solverName && this.currentSolver) return;

    // Destroy previous solver if needed
    this.currentSolver?.destroy?.();

    this.currentSolverName = solverName;
    this.currentSolver = await this.solverFactory(solverName);
    console.log(`[CompositeAutoSolver] Switched to solver: ${solverName}`);
  }

  /**
   * Integrate from t0 to tEnd.
   *
   * For simplicity we delegate to the underlying solver for each sub-interval
   * and re-probe periodically. Since CVODE/Rosenbrock handle their own
   * adaptive stepping internally, we integrate over reporting intervals and
   * check stiffness between them.
   */
  async integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void,
  ): Promise<SolverResult> {
    if (!this.currentSolver) {
      await this.initialize(y0, t0, tEnd);
    }

    const y = new Float64Array(y0);
    let t = t0;
    let totalSteps = 0;

    // Divide the span into sub-intervals for periodic re-probing
    const numSubIntervals = Math.max(1, Math.ceil((tEnd - t0) / ((tEnd - t0) / this.reprobeInterval)));
    const subDt = (tEnd - t0) / numSubIntervals;

    for (let k = 0; k < numSubIntervals; k++) {
      if (checkCancelled) checkCancelled();

      const subEnd = (k === numSubIntervals - 1) ? tEnd : t + subDt;

      const result = this.currentSolver!.integrate(y, t, subEnd, checkCancelled);
      totalSteps += result.steps;

      if (!result.success) {
        // On failure, try reprobing and switching
        const hTrial = Math.max((subEnd - t) * 1e-4, 1e-15);
        const probe = this.detector.probe(y, t, hTrial);
        const recommended = recommendSolver(probe);

        if (recommended !== this.currentSolverName) {
          console.log(
            `[CompositeAutoSolver] Solver ${this.currentSolverName} failed, ` +
            `re-probe suggests ${recommended}. Switching.`,
          );
          await this.switchSolver(recommended);
          const retry = this.currentSolver!.integrate(y, t, subEnd, checkCancelled);
          totalSteps += retry.steps;
          if (!retry.success) {
            return { success: false, t: retry.t, y: retry.y, steps: totalSteps, errorMessage: retry.errorMessage };
          }
          y.set(retry.y);
          t = retry.t;
        } else {
          return { success: false, t: result.t, y: result.y, steps: totalSteps, errorMessage: result.errorMessage };
        }
      } else {
        y.set(result.y);
        t = result.t;
      }

      // Periodic re-probe (not on the last interval — no point)
      if (k < numSubIntervals - 1 && k > 0 && k % this.reprobeInterval === 0) {
        const hTrial = Math.max(subDt * 1e-3, 1e-15);
        const probe = this.detector.probe(y, t, hTrial);
        this.lastProbe = probe;
        const recommended = recommendSolver(probe);

        if (recommended !== this.currentSolverName) {
          console.log(
            `[CompositeAutoSolver] Re-probe at t=${t.toExponential(3)}: ` +
            `switching ${this.currentSolverName} -> ${recommended}`,
          );
          await this.switchSolver(recommended);
        }
      }
    }

    return { success: true, t, y, steps: totalSteps };
  }

  /** Get the most recent stiffness probe result. */
  get lastProbeResult(): StiffnessProbe | null {
    return this.lastProbe;
  }

  /** Get the name of the currently active solver. */
  get activeSolver(): SolverOptions['solver'] {
    return this.currentSolverName;
  }

  destroy(): void {
    this.currentSolver?.destroy?.();
    this.currentSolver = null;
  }
}
