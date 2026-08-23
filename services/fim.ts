import type { BNGLModel, SimulationOptions } from '../types';
import { bnglService } from './bnglService';
import { EigenvalueDecomposition, Matrix } from 'ml-matrix';
import { jacobiEigenDecomposition, chi2Quantile } from './math/fimUtils';

type FIMResult = {
  eigenvalues: number[];
  eigenvectors: number[][]; // columns are eigenvectors aligned with eigenvalues
  paramNames: string[];
  // raw condition (may be Infinity if smallest eigenvalue <= 0) and a regularized finite condition
  conditionNumber: number;
  regularizedConditionNumber?: number;
  maxEigenvalue?: number;
  minEigenvalue?: number;
  covarianceMatrix: number[][];
  correlations: number[][];
  // raw FIM and Jacobian for visualizations
  fimMatrix?: number[][];
  jacobian?: number[][];
  sensitivityProfiles?: Array<{ name: string; timeProfile: number[] }>;
  // practical identifiability lists
  identifiableParams?: string[];
  unidentifiableParams?: string[];
  // VIF diagnostics
  vif?: number[];
  highVIFParams?: string[];
  // removed standard-error based fields per user request
  // Eigenvectors corresponding to small eigenvalues (near-null space). Each entry lists the
  // eigenvalue and an ordered list of parameter loadings (name + signed loading).
  nullspaceCombinations?: Array<{
    eigenvalue: number;
    components: Array<{ name: string; loading: number }>;
  }>;
  // Top correlated parameter pairs sorted by absolute correlation
  topCorrelatedPairs?: Array<{ i: number; j: number; names: [string, string]; corr: number }>;
  // Optional approximate 1D profile results: map param name -> grid and SSR values
  profileApprox?: Record<string, { grid: number[]; ssr: number[]; min: number; flat: boolean }>;
  // extended profile info: confidence intervals and alpha used
  // profileApproxExtended if present will include confidence intervals and alpha
  profileApproxExtended?:
  | Record<
    string,
    { grid: number[]; ssr: number[]; min: number; flat: boolean; alpha: number; ci?: { lower: number; upper: number } }
  >
  | undefined;
  benchmark?: {
    prepareModelMs: number;
    totalSimMs: number;
    simCount: number;
    totalMs: number;
    perSimMs?: number;
    modelId?: string | number;
  };
};



/**
 * Compute a Fisher Information Matrix for the given model and parameter list using finite differences.
 * - Uses the worker cache (bnglService.prepareModel + simulateCached)
 * - Observables used: all observables returned by the model at the final timepoint
 * - Central finite difference with a small relative eps
 */
export async function computeFIM(
  model: BNGLModel,
  parameterNames: string[],
  simulationOptions: SimulationOptions,
  signal?: AbortSignal,
  progress?: (completed: number, total: number) => void,
  includeAllTimepoints = true,
  useLogParameters = false,
  // optional: perform cheap approximate 1D profile scans for parameters marked unidentifiable
  approxProfile = false,
  // when true, perform a short re-optimization of remaining parameters at each grid point
  approxProfileReopt = false
): Promise<FIMResult> {
  if (!model) throw new Error('No model provided');
  if (!parameterNames || parameterNames.length === 0) throw new Error('No parameters specified');

  const startTotal = performance.now();
  const leanSimulationOptions: SimulationOptions = {
    ...simulationOptions,
    includeSpeciesData: false,
    includeExpandedNetwork: false,
  };

  // Ensure we always release any cached model created for this computation
  let modelId: number | undefined;
  try {
    // Cache model in worker
    const t0 = performance.now();
    modelId = await bnglService.prepareModel(model, { signal });
    const t1 = performance.now();
    if (typeof modelId !== 'number') {
      throw new Error('Failed to prepare model for FIM computation');
    }
    const preparedModelId = modelId;

    // baseline simulation (no overrides)
    const baseline = await bnglService.simulateCached(preparedModelId, undefined, leanSimulationOptions, { signal });

    // Determine observables and timepoints
    const T = baseline.data.length;
    const lastRow = baseline.data.at(-1) ?? {};
    const observableKeys = Object.keys(lastRow).filter((k) => k !== 'time');
    const numObs = observableKeys.length;
    const p = parameterNames.length;

    if (numObs === 0) {
      throw new Error('No observables found in simulation results to compute sensitivities.');
    }

    // If including all timepoints, each row is an (observable,time) pair; otherwise use last time only
    const timeCount = includeAllTimepoints ? Math.max(1, T) : 1;
    const m = numObs * timeCount;

    // Jacobian: m x p (observables*time x parameters)
    const J: number[][] = Array.from({ length: m }, () => new Array(p).fill(0));

    // central finite-difference for each parameter
    const totalRuns = 1 + p * 2; // baseline + 2 per parameter
    let totalSimMs = 0;

    const recordSim = async (call: () => Promise<any>) => {
      const tStart = performance.now();
      const res = await call();
      const tEnd = performance.now();
      totalSimMs += tEnd - tStart;
      return res;
    };

    // progress: baseline already run once
    progress?.(0, totalRuns);


    // Build all perturbation jobs upfront for parallel execution
    interface PerturbJob {
      paramIdx: number;
      param: string;
      sign: 'plus' | 'minus';
      val: number;
      isLog: boolean;
    }
    const perturbJobs: PerturbJob[] = [];
    const perturbMeta: { eps: number; rel: number }[] = []; // per-parameter metadata

    for (let j = 0; j < p; j++) {
      const param = parameterNames[j];
      const baseVal = model.parameters[param];

      if (useLogParameters && baseVal > 0) {
        const rel = Math.max(1e-8, 1e-4);
        const plus = baseVal * (1 + rel);
        const minus = baseVal * Math.max(0, 1 - rel);
        perturbJobs.push({ paramIdx: j, param, sign: 'plus', val: plus, isLog: true });
        perturbJobs.push({ paramIdx: j, param, sign: 'minus', val: minus, isLog: true });
        perturbMeta[j] = { eps: 0, rel };
      } else {
        const eps = Math.max(1e-8, Math.abs(baseVal) * 1e-4, 1e-8);
        const plus = baseVal + eps;
        const minus = Math.max(0, baseVal - eps);
        perturbJobs.push({ paramIdx: j, param, sign: 'plus', val: plus, isLog: false });
        perturbJobs.push({ paramIdx: j, param, sign: 'minus', val: minus, isLog: false });
        perturbMeta[j] = { eps, rel: 0 };
      }
    }

    // Execute all perturbation simulations in parallel (limited by worker pool)
    const simStartTime = performance.now();
    const perturbResults = await Promise.all(
      perturbJobs.map(job =>
        bnglService.simulateCached(preparedModelId, { [job.param]: job.val as number } as Record<string, number>, leanSimulationOptions, { signal })
      )
    );
    totalSimMs = performance.now() - simStartTime;

    // Build results map: paramIdx -> { plus, minus }
    const resultsMap = new Map<number, { plus: any; minus: any }>();
    for (let i = 0; i < perturbJobs.length; i++) {
      const job = perturbJobs[i];
      if (!resultsMap.has(job.paramIdx)) {
        resultsMap.set(job.paramIdx, { plus: null, minus: null });
      }
      resultsMap.get(job.paramIdx)![job.sign] = perturbResults[i];
    }

    // Compute Jacobian from results
    for (let j = 0; j < p; j++) {
      const results = resultsMap.get(j)!;
      const plusData = results.plus.data;
      const minusData = results.minus.data;
      const meta = perturbMeta[j];
      const baseVal = model.parameters[parameterNames[j]];

      for (let ti = 0; ti < timeCount; ti++) {
        const timeIndex = includeAllTimepoints ? ti : plusData.length - 1;
        const plusRow = plusData[timeIndex] ?? {};
        const minusRow = minusData[timeIndex] ?? {};

        for (let oi = 0; oi < numObs; oi++) {
          const key = observableKeys[oi];
          const vplus = typeof plusRow[key] === 'number' ? (plusRow[key] as number) : Number(plusRow[key] ?? 0);
          const vminus = typeof minusRow[key] === 'number' ? (minusRow[key] as number) : Number(minusRow[key] ?? 0);

          let deriv: number;
          if (meta.rel > 0) {
            // Log-parameter mode
            deriv = (vplus - vminus) / (2 * meta.rel);
          } else {
            // Additive mode
            const plus = baseVal + meta.eps;
            const minus = Math.max(0, baseVal - meta.eps);
            deriv = (vplus - vminus) / (plus - minus || meta.eps);
          }

          const rowIndex = ti * numObs + oi;
          J[rowIndex][j] = Number.isFinite(deriv) ? deriv : 0;
        }
      }
    }

    progress?.(p * 2, totalRuns);

    // Compute FIM = J^T * J (p x p)
    const F: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < m; k++) {
          sum += J[k][i] * J[k][j];
        }
        F[i][j] = sum;
        F[j][i] = sum;
      }
    }

    // Compute eigen-decomposition using ml-matrix when available; fall back to Jacobi implementation.
    let sortedVals: number[] = [];
    let sortedVecs: number[][] = [];
    try {
      // Use ml-matrix EigenvalueDecomposition for symmetric FIMs. This is pure JS and
      // works reliably in the browser and Web Workers. If EVD fails, fall back to Jacobi.
      try {
        const mat = new Matrix(F);
        const evd = new EigenvalueDecomposition(mat);
        const vals: number[] = evd.realEigenvalues ? evd.realEigenvalues.slice() : [];
        const Vmat: Matrix | undefined = evd.eigenvectorMatrix;
        if (vals && Vmat) {
          const pairs = vals.map((v, i) => ({ val: v, vec: Vmat.getColumn(i) as number[] }));
          pairs.sort((a, b) => b.val - a.val);
          sortedVals = pairs.map((p) => p.val);
          sortedVecs = pairs.map((p) => Array.from(p.vec));
        } else {
          throw new Error('EVD failed');
        }
      } catch (e) {
        // fallback to jacobi
        const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(F, Math.max(100, p * 20));
        const eigPairs = eigenvalues.map((val, idx) => ({ val, vec: eigenvectors.map((row) => row[idx]) }));
        eigPairs.sort((a, b) => b.val - a.val);
        sortedVals = eigPairs.map((p) => p.val as number);
        sortedVecs = eigPairs.map((p) => p.vec);
      }
    } catch (err) {
      // last-resort jacobi
      const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(F, Math.max(100, p * 20));
      const eigPairs = eigenvalues.map((val, idx) => ({ val, vec: eigenvectors.map((row) => row[idx]) }));
      eigPairs.sort((a, b) => b.val - a.val);
      sortedVals = eigPairs.map((p) => p.val as number);
      sortedVecs = eigPairs.map((p) => p.vec);
    }

    const maxEig = sortedVals[0] ?? 0;
    const minEig = sortedVals[sortedVals.length - 1] ?? 0;
    const rawCondition = maxEig > 0 && minEig > 0 ? maxEig / minEig : Infinity;
    // regularize smallest eigenvalue relative to the largest to avoid Infinity;
    const relEps = Math.max(Math.abs(maxEig) * 1e-12, 1e-16);
    const regularizedCondition = maxEig / Math.max(minEig, relEps);

    // Compute covariance matrix as FIM inverse using eigendecomposition
    const n = p;
    const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const eigThreshold = Math.max(1e-12, Math.abs(maxEig) * 1e-12); // threshold for small eigenvalues
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          const lambda = sortedVals[k];
          if (lambda > eigThreshold) {
            sum += sortedVecs[k][i] * sortedVecs[k][j] / lambda;
          }
        }
        cov[i][j] = sum;
      }
    }

    // Compute correlations
    const correlations: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const varI = cov[i][i];
        const varJ = cov[j][j];
        if (varI > 0 && varJ > 0) {
          correlations[i][j] = cov[i][j] / Math.sqrt(varI * varJ);
        } else {
          correlations[i][j] = 0;
        }
      }
    }

    // Attach raw fim matrix and jacobian for visualization/sensitivity diagnostics
    const fimMatrix = F.map((row) => row.slice());
    const jacobian = J.map((row) => row.slice());

    // Sensitivity profiles: for each parameter, return the column of J (sensitivity over observables/time)
    const sensitivityProfiles = parameterNames.map((name, i) => ({ name, timeProfile: J.map((row) => row[i]) }));

    // Parameter-level identifiability: infer from near-null eigenvectors.
    // If a parameter has a large loading in ANY near-null eigenvector, it cannot be uniquely
    // estimated (locally) from the provided outputs (it participates in an unidentifiable combination).
    const identifiableParams: string[] = [];
    const unidentifiableParams: string[] = [];

    // Compute VIF (Variance Inflation Factor) by inverting the correlation matrix (pseudo-inverse)
    let vif: number[] = new Array(n).fill(0);
    let highVIFParams: string[] = [];
    try {
      // eigen-decompose correlation matrix
      let corrVals: number[] = [];
      let corrVecs: number[][] = [];
      try {
        const corrMat = new Matrix(correlations);
        const evdCorr = new EigenvalueDecomposition(corrMat);
        corrVals = evdCorr.realEigenvalues ? evdCorr.realEigenvalues.slice() : [];
        const Vc: Matrix | undefined = evdCorr.eigenvectorMatrix;
        if (corrVals && Vc) {
          const pairs = corrVals.map((v, i) => ({ val: v, vec: Vc.getColumn(i) as number[] }));
          pairs.sort((a, b) => b.val - a.val);
          corrVals = pairs.map((p) => p.val);
          corrVecs = pairs.map((p) => Array.from(p.vec));
        } else {
          throw new Error('corr EVD failed');
        }
      } catch (e) {
        // fallback to jacobi
        const { eigenvalues: corrEigenValues, eigenvectors: corrEigenVecs } = jacobiEigenDecomposition(correlations, Math.max(100, n * 20));
        const eigPairs = corrEigenValues.map((val, idx) => ({ val, vec: corrEigenVecs.map((row) => row[idx]) }));
        eigPairs.sort((a, b) => b.val - a.val);
        corrVals = eigPairs.map((p) => p.val as number);
        corrVecs = eigPairs.map((p) => p.vec);
      }

      const maxCorrEig = corrVals[0] ?? 0;
      const corrEigThreshold = Math.max(1e-12, Math.abs(maxCorrEig) * 1e-12);
      const invCorr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          let sum = 0;
          for (let k = 0; k < n; k++) {
            const lambda = corrVals[k];
            if (lambda > corrEigThreshold) sum += corrVecs[k][i] * corrVecs[k][j] / lambda;
          }
          invCorr[i][j] = sum;
        }
      }

      vif = new Array(n).fill(0).map((_, i) => (Number.isFinite(invCorr[i][i]) ? invCorr[i][i] : Infinity));
      highVIFParams = vif.map((v, i) => (v > 10 ? parameterNames[i] : null)).filter((x) => x) as string[];
    } catch (e) {
      // leave vif zeros on error
    }

    // (removed standard-error based analyses per request)

    // Analyze small-eigenvalue eigenvectors (near-null space) to detect non-identifiable parameter combinations.
    const nullspaceCombinations: Array<{ eigenvalue: number; components: Array<{ name: string; loading: number }> }> = [];
    const unidentifiableMask: boolean[] = new Array(n).fill(false);
    // Follow common heuristic: eigenvalues << maxEig are considered near-zero. Use a relative threshold similar to the Julia code (1e-4 * maxEig).
    const nullTol = Math.max(1e-12, Math.abs(maxEig) * 1e-4);
    // iterate from smallest eigenvalue upwards to collect near-zero modes
    for (let k = sortedVals.length - 1; k >= 0; k--) {
      const lambda = sortedVals[k];
      if (lambda > nullTol) break; // once we hit a sufficiently large eigenvalue stop
      // this eigenvalue is near-zero -> extract its eigenvector
      const vec = sortedVecs[k] ?? [];
      const absVec = vec.map((v) => Math.abs(v));
      const maxAbs = Math.max(...absVec, 0);
      const threshold = maxAbs * 0.1; // report components >= 10% of top contributor
      const comps: Array<{ name: string; loading: number }> = [];
      for (let i = 0; i < vec.length; i++) {
        if (Math.abs(vec[i]) >= threshold && Number.isFinite(vec[i]) && !Number.isNaN(vec[i])) {
          comps.push({ name: parameterNames[i], loading: vec[i] });
          unidentifiableMask[i] = true;
        }
      }
      comps.sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading));
      nullspaceCombinations.push({ eigenvalue: lambda, components: comps });
    }

    // Derive per-parameter labeling from nullspace participation.
    // If there is no detected nullspace, all parameters are locally identifiable.
    if (nullspaceCombinations.length === 0) {
      identifiableParams.push(...parameterNames);
    } else {
      for (let i = 0; i < n; i++) {
        if (unidentifiableMask[i]) unidentifiableParams.push(parameterNames[i]);
        else identifiableParams.push(parameterNames[i]);
      }
    }

    /**
     * Optional: approximate 1D profile-likelihood-like scans. This is a cheap heuristic: we
     * vary each target parameter along a grid and compute a simple SSR to the baseline 'data'.
     * This does NOT perform re-optimization of other parameters and is therefore only
     * an approximate diagnostic for global identifiability.
     */
    const profileApprox: Record<string, { grid: number[]; ssr: number[]; min: number; flat: boolean }> = {};
    const profileApproxExtended: Record<
      string,
      { grid: number[]; ssr: number[]; min: number; flat: boolean; alpha: number; ci?: { lower: number; upper: number } }
    > = {};
    if (approxProfile) {
      // baseline flattened into vector for SSR computation
      const baselineRows = baseline.data;
      const baselineVec: number[] = [];
      for (let ti = 0; ti < (includeAllTimepoints ? baselineRows.length : 1); ti++) {
        const rIdx = includeAllTimepoints ? ti : baselineRows.length - 1;
        const row = baselineRows[rIdx] ?? {};
        for (const key of observableKeys) {
          baselineVec.push(Number(row[key] ?? 0));
        }
      }

      // choose parameters to profile: those that appear in near-null-space combinations
      const unidentIdxs: number[] = [];
      for (const comb of nullspaceCombinations) {
        for (const comp of comb.components) {
          const idx = parameterNames.indexOf(comp.name);
          if (idx >= 0 && !unidentIdxs.includes(idx)) unidentIdxs.push(idx);
        }
      }
      // limit how many to profile to keep runtime reasonable
      const maxProfile = 8;
      const toProfile = unidentIdxs.slice(0, maxProfile);

      // helper: compute SSR for a flattened observable vector against baselineVec
      const computeSSR = (vec: number[], base: number[]) => {
        let ssr = 0;
        for (let k = 0; k < Math.min(vec.length, base.length); k++) {
          const d = vec[k] - base[k];
          ssr += d * d;
        }
        return ssr;
      };

      // helper: perform a stronger local re-optimization using Nelder-Mead over free params
      const nelderMead = async (
        func: (x: number[]) => Promise<number>,
        x0: number[],
        options?: { maxIter?: number; maxEvals?: number; initialStep?: number }
      ) => {
        const maxIter = options?.maxIter ?? 50;
        const maxEvals = options?.maxEvals ?? 200;
        const n = x0.length;
        const initialStep = options?.initialStep ?? 0.1;

        // build initial simplex
        const simplex: number[][] = [x0.slice()];
        for (let i = 0; i < n; i++) {
          const v = x0.slice();
          v[i] = v[i] + (Math.abs(v[i]) > 0 ? Math.abs(v[i]) * initialStep : initialStep);
          simplex.push(v);
        }

        const fvals: number[] = [];
        const evalPoint = async (pt: number[]) => {
          const v = await func(pt);
          return v;
        };

        // evaluate initial simplex
        for (let i = 0; i < simplex.length; i++) {
          fvals[i] = await evalPoint(simplex[i]);
        }
        let evalCount = simplex.length;

        const alpha = 1;
        const gamma = 2;
        const rho = 0.5;
        const sigma = 0.5;

        const centroid = (pts: number[][], exclude: number) => {
          const c = new Array(n).fill(0);
          for (let i = 0; i < pts.length; i++) {
            if (i === exclude) continue;
            for (let j = 0; j < n; j++) c[j] += pts[i][j];
          }
          for (let j = 0; j < n; j++) c[j] /= (pts.length - 1);
          return c;
        };

        for (let iter = 0; iter < maxIter; iter++) {
          // sort simplex by fvals ascending
          const idx = fvals.map((_, i) => i).sort((a, b) => fvals[a] - fvals[b]);
          const worst = simplex[idx[simplex.length - 1]];

          // centroid of all but worst
          const xbar = centroid(simplex, idx[simplex.length - 1]);

          // reflection
          const xr = xbar.map((xi, i) => xi + alpha * (xi - worst[i]));
          const fr = await evalPoint(xr);
          evalCount++;
          if (fr < fvals[idx[0]]) {
            // expansion
            const xe = xbar.map((xi, i) => xi + gamma * (xi - worst[i]));
            const fe = await evalPoint(xe);
            evalCount++;
            if (fe < fr) {
              simplex[idx[simplex.length - 1]] = xe;
              fvals[idx[simplex.length - 1]] = fe;
            } else {
              simplex[idx[simplex.length - 1]] = xr;
              fvals[idx[simplex.length - 1]] = fr;
            }
          } else if (fr < fvals[idx[simplex.length - 2]]) {
            // accept reflection
            simplex[idx[simplex.length - 1]] = xr;
            fvals[idx[simplex.length - 1]] = fr;
          } else {
            // contraction
            const xc = xbar.map((xi, i) => xi + rho * (worst[i] - xi));
            const fc = await evalPoint(xc);
            evalCount++;
            if (fc < fvals[idx[simplex.length - 1]]) {
              simplex[idx[simplex.length - 1]] = xc;
              fvals[idx[simplex.length - 1]] = fc;
            } else {
              // shrink
              for (let i = 1; i < simplex.length; i++) {
                simplex[i] = simplex[0].map((b, k) => b + sigma * (simplex[i][k] - b));
                fvals[i] = await evalPoint(simplex[i]);
                evalCount++;
              }
            }
          }

          if (evalCount >= maxEvals) break;

          // convergence check: simple standard deviation of fvals
          const mean = fvals.reduce((s, x) => s + x, 0) / fvals.length;
          const sd = Math.sqrt(fvals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / fvals.length);
          if (sd < 1e-9) break;
        }

        const bestIdx = fvals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[0].i;
        return { x: simplex[bestIdx], fx: fvals[bestIdx] };
      };

      const reoptimizeAtFixed = async (
        modelIdLocal: number,
        fixedIdx: number,
        fixedVal: number,
        baseParams: Record<string, number>,
        options?: { maxIter?: number; maxEvals?: number; initialStep?: number }
      ) => {
        // free parameter indices
        const freeIdxs = parameterNames.map((_, i) => i).filter((i) => i !== fixedIdx);
        const x0 = freeIdxs.map((i) => baseParams[parameterNames[i]]);

        const simulateForX = async (x: number[]) => {
          const paramMap: Record<string, number> = { ...baseParams };
          paramMap[parameterNames[fixedIdx]] = fixedVal;
          for (let k = 0; k < freeIdxs.length; k++) paramMap[parameterNames[freeIdxs[k]]] = x[k];
          const res = await recordSim(() => bnglService.simulateCached(modelIdLocal, paramMap, leanSimulationOptions, { signal }));
          const vec: number[] = [];
          for (let ti = 0; ti < (includeAllTimepoints ? res.data.length : 1); ti++) {
            const rIdx = includeAllTimepoints ? ti : res.data.length - 1;
            const row = res.data[rIdx] ?? {};
            for (const key of observableKeys) vec.push(Number(row[key] ?? 0));
          }
          return computeSSR(vec, baselineVec);
        };

        // run Nelder-Mead
        const nm = await nelderMead(simulateForX, x0, { maxIter: options?.maxIter ?? 50, maxEvals: options?.maxEvals ?? 200, initialStep: options?.initialStep ?? 0.25 });

        // build param map from result
        const params: Record<string, number> = { ...baseParams };
        params[parameterNames[fixedIdx]] = fixedVal;
        for (let k = 0; k < freeIdxs.length; k++) params[parameterNames[freeIdxs[k]]] = nm.x[k];

        return { params, ssr: nm.fx };
      };

      for (const idx of toProfile) {
        const name = parameterNames[idx];
        const baseVal = model.parameters[name];
        // create grid: log-spaced if positive, else additive
        const grid: number[] = [];
        if (baseVal > 0) {
          const factors = [0.2, 0.5, 0.8, 0.9, 1, 1.1, 1.5, 2, 5];
          for (const f of factors) grid.push(baseVal * f);
        } else {
          const deltas = [-1e-2, -1e-3, -1e-4, 0, 1e-4, 1e-3, 1e-2];
          for (const d of deltas) grid.push(baseVal + d);
        }

        const ssrArr: number[] = [];
        for (const val of grid) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          if (approxProfileReopt) {
            // perform a short re-optimization of other parameters at this fixed value
            const baseParams: Record<string, number> = {};
            for (const pn of parameterNames) baseParams[pn] = model.parameters[pn];
            const out = await reoptimizeAtFixed(preparedModelId, idx, val, baseParams, { maxIter: 30, maxEvals: 120, initialStep: 0.25 });
            ssrArr.push(out.ssr);
          } else {
            const res = await recordSim(() => bnglService.simulateCached(preparedModelId, { [name]: val as number } as Record<string, number>, leanSimulationOptions, { signal }));
            const vec: number[] = [];
            for (let ti = 0; ti < (includeAllTimepoints ? res.data.length : 1); ti++) {
              const rIdx = includeAllTimepoints ? ti : res.data.length - 1;
              const row = res.data[rIdx] ?? {};
              for (const key of observableKeys) vec.push(Number(row[key] ?? 0));
            }
            ssrArr.push(computeSSR(vec, baselineVec));
          }
        }
        const min = Math.min(...ssrArr);
        // heuristic: flat if min is not much larger than max or variance small
        const max = Math.max(...ssrArr);
        const flat = (max - min) / (Math.abs(min) + 1e-12) < 1e-2;
        profileApprox[name] = { grid, ssr: ssrArr, min, flat };

        // compute chi-square based confidence interval for df=1 (default alpha=0.05)
        const alpha = 0.05;
        // find baseline SSR at nearest grid point to baseVal
        let baselineIdx = 0;
        let bestDiff = Math.abs(grid[0] - baseVal);
        for (let gi = 1; gi < grid.length; gi++) {
          const d = Math.abs(grid[gi] - baseVal);
          if (d < bestDiff) {
            bestDiff = d;
            baselineIdx = gi;
          }
        }
        const baselineSSR = Number.isFinite(ssrArr[baselineIdx]) ? ssrArr[baselineIdx] : min;
        const chiThreshold = baselineSSR + chi2Quantile(1 - alpha, 1);
        const validIdxs: number[] = [];
        for (let gi = 0; gi < ssrArr.length; gi++) if (ssrArr[gi] <= chiThreshold) validIdxs.push(gi);
        let ci: { lower: number; upper: number } | undefined = undefined;
        if (validIdxs.length > 0) {
          const vals = validIdxs.map((gi) => grid[gi]);
          ci = { lower: Math.min(...vals), upper: Math.max(...vals) };
        }
        profileApproxExtended[name] = { grid, ssr: ssrArr, min, flat, alpha, ci };
      }
    }

    // Top correlated pairs (by absolute correlation). Useful quick diagnostic for parameter pairs that co-vary.
    const corrPairs: Array<{ i: number; j: number; names: [string, string]; corr: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const corr = correlations[i][j] ?? 0;
        corrPairs.push({ i, j, names: [parameterNames[i], parameterNames[j]], corr });
      }
    }
    corrPairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    const topCorrelatedPairs = corrPairs.slice(0, Math.min(20, corrPairs.length));

    const tEndTotal = performance.now();

    return {
      eigenvalues: sortedVals,
      eigenvectors: sortedVecs,
      paramNames: parameterNames.slice(),
      conditionNumber: rawCondition,
      regularizedConditionNumber: regularizedCondition,
      maxEigenvalue: maxEig,
      minEigenvalue: minEig,
      covarianceMatrix: cov,
      correlations,
      nullspaceCombinations: nullspaceCombinations.length > 0 ? nullspaceCombinations : undefined,
      topCorrelatedPairs,
      profileApprox: Object.keys(profileApprox).length > 0 ? profileApprox : undefined,
      profileApproxExtended: Object.keys(profileApproxExtended).length > 0 ? profileApproxExtended : undefined,
      fimMatrix,
      jacobian,
      sensitivityProfiles,
      identifiableParams: identifiableParams.length > 0 ? identifiableParams : undefined,
      unidentifiableParams: unidentifiableParams.length > 0 ? unidentifiableParams : undefined,
      vif: vif.length > 0 ? vif : undefined,
      highVIFParams: highVIFParams.length > 0 ? highVIFParams : undefined,
      benchmark: {
        prepareModelMs: t1 - t0,
        totalSimMs,
        simCount: totalRuns,
        totalMs: tEndTotal - startTotal,
        perSimMs: totalSimMs / Math.max(1, totalRuns),
        // modelId removed: worker-cached model is released in finally; do not expose
      },
    } as FIMResult;
  } finally {
    if (typeof modelId === 'number') {
      try {
        // Best-effort release of the cached model in the worker to avoid leaks.
        await bnglService.releaseModel(modelId);
      } catch (err) {
        console.error('Failed to release model after FIM analysis:', err);
      }
    }
  }
}

export function exportFIM(result: FIMResult) {
  return {
    format: 'FIM-v1',
    conditionNumber: result.conditionNumber,
    regularizedConditionNumber: result.regularizedConditionNumber,
    eigenvalues: result.eigenvalues,
    eigenvectors: result.eigenvectors,
    covariance: result.covarianceMatrix,
    correlations: result.correlations,
    fimMatrix: result.fimMatrix,
    jacobian: result.jacobian,
  };
}

export type { FIMResult };
