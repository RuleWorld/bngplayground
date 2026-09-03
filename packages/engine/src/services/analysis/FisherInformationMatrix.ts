/**
 * FisherInformationMatrix.ts — Fisher Information Matrix computation.
 *
 * Ported from services/fim.ts to the engine package using the
 * callback-based simulate pattern (no browser dependencies).
 */

import { chi2Quantile, jacobiEigenDecomposition, invertSymmetricMatrix, matMul, matTranspose } from '../../utils/mathUtils';
import { nelderMead } from '../optimization/nelderMead';
import { AnalysisDataError } from './AnalysisErrors';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Configuration options for Fisher Information Matrix computation.
 * Specifies the target parameters, simulation function, and finite difference parameters.
 */
export interface FIMConfig {
  /** Async simulation function: takes parameter overrides, returns simulation data */
  simulate: (overrides: Record<string, number>) => Promise<{ data: Array<Record<string, number>> }>;
  /** Baseline parameter values */
  parameters: Record<string, number>;
  /** Which parameters to include in FIM */
  parameterNames: string[];
  /** Include all timepoints (default: true) or final only */
  allTimepoints?: boolean;
  /** Use log-parameter sensitivities (default: false) */
  logParameters?: boolean;
  /** Run approximate 1D profile scans (default: false) */
  approxProfile?: boolean;
  /** Re-optimize other params at each profile point (default: false) */
  approxProfileReopt?: boolean;
  /** AbortSignal */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
  /** Default step size for near-zero parameters (default: 1e-4) */
  defaultStep?: number;
}

/**
 * Structured output of a Fisher Information Matrix analysis.
 * Contains identical/unidentifiable parameter sets, collinearity indices (VIF), and covariance matrices.
 */
export interface FIMResult {
  fimMatrix: number[][];
  jacobian: number[][];
  eigenvalues: number[];
  eigenvectors: number[][];
  paramNames: string[];
  conditionNumber: number;
  regularizedConditionNumber: number;
  covarianceMatrix: number[][];
  correlations: number[][];
  sensitivityProfiles: Array<{ name: string; timeProfile: number[] }>;
  identifiableParams: string[];
  unidentifiableParams: string[];
  vif: number[];
  highVIFParams: string[];
  nullspaceCombinations: Array<{
    eigenvalue: number;
    components: Array<{ name: string; loading: number }>;
  }>;
  topCorrelatedPairs: Array<{ i: number; j: number; names: [string, string]; corr: number }>;
  profileApprox?: Record<string, {
    grid: number[];
    ssr: number[];
    min: number;
    flat: boolean;
    alpha: number;
    ci?: { lower: number; upper: number };
  }>;
}

/**
 * Structured output for analyzing multicollinearity amongst subsets of parameters.
 */
export interface CollinearityResult {
  subsets: Array<{
    params: string[];
    collinearityIndex: number;
    isCollinear: boolean;
  }>;
  maxCollinearity: number;
}

// ── Main FIM computation ─────────────────────────────────────────────

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function validateSimulationData(
  data: unknown,
  label: string,
  expectedObservableNames?: string[],
  expectedLength?: number,
): Array<Record<string, number>> {
  if (!Array.isArray(data) || data.length === 0) {
    throw new AnalysisDataError(`FIM ${label} simulation returned no trajectory data.`);
  }
  if (expectedLength !== undefined && data.length !== expectedLength) {
    throw new AnalysisDataError(
      `FIM ${label} simulation returned ${data.length} time points; expected ${expectedLength}.`,
    );
  }

  const firstRow = data[0];
  if (!firstRow || typeof firstRow !== 'object') {
    throw new AnalysisDataError(`FIM ${label} simulation returned an invalid first row.`);
  }
  const firstRecord = firstRow as Record<string, unknown>;
  const observableNames = expectedObservableNames ?? Object.keys(firstRecord).filter((name) => name !== 'time');
  if (observableNames.length === 0) {
    throw new AnalysisDataError(`FIM ${label} simulation returned no observable columns.`);
  }

  let previousTime = -Infinity;
  for (const [index, rawRow] of data.entries()) {
    if (!rawRow || typeof rawRow !== 'object') {
      throw new AnalysisDataError(`FIM ${label} simulation returned an invalid row at index ${index}.`);
    }
    const row = rawRow as Record<string, unknown>;
    const time = row.time;
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new AnalysisDataError(`FIM ${label} simulation returned a non-finite time at row ${index}.`);
    }
    if (time < previousTime) {
      throw new AnalysisDataError(`FIM ${label} simulation returned unsorted time points.`);
    }
    previousTime = time;
    for (const observable of observableNames) {
      if (!Object.prototype.hasOwnProperty.call(row, observable)) {
        throw new AnalysisDataError(`FIM ${label} simulation is missing observable "${observable}".`);
      }
      const value = row[observable];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AnalysisDataError(`FIM ${label} simulation returned a non-finite value for "${observable}".`);
      }
    }
  }
  return data as Array<Record<string, number>>;
}

async function simulateValidated(
  simulate: FIMConfig['simulate'],
  overrides: Record<string, number>,
  label: string,
  expectedObservableNames?: string[],
  expectedLength?: number,
): Promise<Array<Record<string, number>>> {
  let result: { data: Array<Record<string, number>> };
  try {
    result = await simulate(overrides);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new AnalysisDataError(`FIM ${label} simulation failed: ${errorMessage(error)}`);
  }
  return validateSimulationData(result?.data, label, expectedObservableNames, expectedLength);
}

function validateConfiguration(
  parameters: Record<string, number>,
  parameterNames: string[],
  defaultStep: number,
): void {
  if (!Array.isArray(parameterNames) || parameterNames.length === 0) {
    throw new AnalysisDataError('FIM requires at least one parameter.');
  }
  if (new Set(parameterNames).size !== parameterNames.length) {
    throw new AnalysisDataError('FIM parameter names must be unique.');
  }
  if (!Number.isFinite(defaultStep) || defaultStep <= 0) {
    throw new AnalysisDataError('FIM defaultStep must be finite and positive.');
  }
  for (const name of parameterNames) {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
      throw new AnalysisDataError(`FIM parameter "${name}" is not present in the baseline parameter set.`);
    }
    if (!Number.isFinite(parameters[name])) {
      throw new AnalysisDataError(`FIM parameter "${name}" is non-finite.`);
    }
  }
}

/**
 * Computes the Fisher Information Matrix (FIM) and related local sensitivity metrics.
 *
 * Uses a finite difference approximation (central difference) to construct the sensitivity
 * Jacobian for the selected parameters. From this, it computes the FIM (J^T J), performs
 * eigendecomposition to find sloppy/unidentifiable directions in parameter space, and
 * calculates Variance Inflation Factors (VIF) to detect collinearity.
 *
 * @param config - The FIM configuration including baseline parameters and async simulate runner.
 * @returns A comprehensive suite of local sensitivity and identifiability metrics.
 */
export async function computeFIM(config: FIMConfig): Promise<FIMResult> {
  const {
    simulate,
    parameters,
    parameterNames,
    allTimepoints = true,
    logParameters = false,
    approxProfile = false,
    signal,
    onProgress,
    defaultStep = 1e-4,
  } = config;

  const d = parameterNames.length;
  validateConfiguration(parameters, parameterNames, defaultStep);
  const paramValues = parameterNames.map((n) => parameters[n]);

  // 1. Baseline simulation
  const baseData = await simulateValidated(simulate, parameters, 'baseline');
  const obsNames = Object.keys(baseData[0]).filter((k) => k !== 'time');
  const nT = allTimepoints ? baseData.length : 1;
  const nObs = obsNames.length;
  const totalObs = nT * nObs;

  // Extract baseline values as flat array [obs1_t0, obs1_t1, ..., obs2_t0, ...]
  const yBase = extractValues(baseData, obsNames, allTimepoints);

  // 2. Compute sensitivities via finite differences
  const h = 1e-5; // Relative step
  const jacobian: number[][] = []; // totalObs × d
  const sensitivityProfiles: FIMResult['sensitivityProfiles'] = [];

  let completed = 0;
  const total = 2 * d + (approxProfile ? d * 20 : 0);

  for (let j = 0; j < d; j++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const pj = paramValues[j];
    const delta = Math.abs(pj) > 1e-10
        ? Math.abs(pj) * h
        : defaultStep;

    // Forward
    const overridesPlus = { ...parameters };
    overridesPlus[parameterNames[j]] = pj + delta;
    const dataPlus = await simulateValidated(
      simulate,
      overridesPlus,
      `forward sensitivity for "${parameterNames[j]}"`,
      obsNames,
      allTimepoints ? baseData.length : undefined,
    );
    completed++;
    onProgress?.(completed, total);

    // Backward
    const overridesMinus = { ...parameters };
    overridesMinus[parameterNames[j]] = pj - delta;
    const dataMinus = await simulateValidated(
      simulate,
      overridesMinus,
      `backward sensitivity for "${parameterNames[j]}"`,
      obsNames,
      allTimepoints ? baseData.length : undefined,
    );
    completed++;
    onProgress?.(completed, total);

    const yPlus = extractValues(dataPlus, obsNames, allTimepoints);
    const yMinus = extractValues(dataMinus, obsNames, allTimepoints);

    // Central difference
    const sensitivity: number[] = [];
    for (let i = 0; i < totalObs; i++) {
      let s = (yPlus[i] - yMinus[i]) / (2 * delta);
      // Log-parameter scaling: dY/d(logθ) = θ × dY/dθ
      if (logParameters) {
        s *= pj;
      }
      sensitivity.push(s);
    }

    // Time profile for this parameter (across all observables)
    const timeProfile: number[] = [];
    if (allTimepoints) {
      for (let t = 0; t < baseData.length; t++) {
        let totalSens = 0;
        for (let o = 0; o < nObs; o++) {
          totalSens += sensitivity[o * nT + t] ** 2;
        }
        timeProfile.push(Math.sqrt(totalSens));
      }
    }
    sensitivityProfiles.push({ name: parameterNames[j], timeProfile });

    // Store as column j for each observation i
    for (let i = 0; i < totalObs; i++) {
      if (!jacobian[i]) jacobian[i] = new Array(d);
      jacobian[i][j] = sensitivity[i];
    }
  }

  // 3. Compute FIM = J^T J
  const JT = matTranspose(jacobian);
  const fimMatrix = matMul(JT, jacobian);

  // 4. Eigendecomposition
  const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(fimMatrix);

  // Sort eigenvalues (and eigenvectors) in descending order
  const sortedIndices = eigenvalues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.i);
  const sortedEigenvalues = sortedIndices.map((i) => eigenvalues[i]);
  const sortedEigenvectors = eigenvectors.map((row) =>
    sortedIndices.map((i) => row[i]),
  );
  if (!sortedEigenvalues.every(Number.isFinite)) {
    throw new AnalysisDataError('FIM eigendecomposition returned non-finite eigenvalues.');
  }

  // 5. Condition number
  const maxEig = Math.max(...sortedEigenvalues.map(Math.abs));
  const minEig = Math.min(...sortedEigenvalues.map(Math.abs));
  const conditionNumber = minEig > 1e-30 ? maxEig / minEig : Infinity;

  // Regularized condition number (Tikhonov)
  const lambda = maxEig > 0 && Number.isFinite(maxEig) ? maxEig * 1e-6 : 0;
  const regEigenvalues = sortedEigenvalues.map((e) => e + lambda);
  const regMaxEig = Math.max(...regEigenvalues.map(Math.abs));
  const regMinEig = Math.min(...regEigenvalues.map(Math.abs));
  const regCondNumber = regMinEig > 1e-30 ? regMaxEig / regMinEig : Infinity;

  // 6. Covariance matrix (pseudo-inverse of FIM)
  let covarianceMatrix: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const fimReg = fimMatrix.map((row, i) =>
    row.map((v, j) => v + (i === j ? lambda : 0)),
  );
  const inv = invertSymmetricMatrix(fimReg);
  if (inv) {
    covarianceMatrix = inv;
  }

  // 7. Correlations
  const correlations: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const denom = Math.sqrt(Math.abs(covarianceMatrix[i][i]) * Math.abs(covarianceMatrix[j][j]));
      const correlation = denom > 0 ? covarianceMatrix[i][j] / denom : (i === j ? 1 : 0);
      correlations[i][j] = Number.isFinite(correlation) ? correlation : (i === j ? 1 : 0);
    }
  }

  // 8. Identifiability classification
  const identifiabilityThreshold = maxEig * 1e-6;
  const identifiableParams: string[] = [];
  const unidentifiableParams: string[] = [];
  for (let j = 0; j < d; j++) {
    // Check if any small eigenvalue has significant loading on parameter j
    let isUnidentifiable = false;
    for (let k = 0; k < d; k++) {
      if (Math.abs(sortedEigenvalues[k]) < identifiabilityThreshold) {
        if (Math.abs(sortedEigenvectors[j]?.[k] ?? 0) > 0.3) {
          isUnidentifiable = true;
          break;
        }
      }
    }
    if (isUnidentifiable) {
      unidentifiableParams.push(parameterNames[j]);
    } else {
      identifiableParams.push(parameterNames[j]);
    }
  }

  // 9. VIF (Variance Inflation Factor)
  let vif: number[] = new Array(d).fill(1);
  try {
    // VIFs are the diagonal elements of the inverse correlation matrix
    const invCorr = invertSymmetricMatrix(correlations);
    if (invCorr) {
      vif = invCorr.map((row, i) => row[i]);
    } else {
      // Fallback: use pseudo-inverse logic if singular
      const { eigenvalues: cEig, eigenvectors: cVec } = jacobiEigenDecomposition(correlations);
      const cMaxEig = Math.max(...cEig.map(Math.abs));
      const cThreshold = cMaxEig * 1e-12;
      for (let i = 0; i < d; i++) {
        let sum = 0;
        for (let k = 0; k < d; k++) {
          if (cEig[k] > cThreshold) {
            sum += (cVec[i][k] * cVec[i][k]) / cEig[k];
          }
        }
        vif[i] = sum;
      }
    }
  } catch {
    // Keep defaults
  }
  const highVIFParams = parameterNames.filter((_, j) => vif[j] > 10);

  // 10. Nullspace combinations (small eigenvalues)
  const nullspaceCombinations: FIMResult['nullspaceCombinations'] = [];
  for (let k = 0; k < d; k++) {
    if (Math.abs(sortedEigenvalues[k]) < identifiabilityThreshold * 100) {
      const components = parameterNames.map((name, j) => ({
        name,
        loading: sortedEigenvectors[j]?.[k] ?? 0,
      })).filter((c) => Math.abs(c.loading) > 0.1);
      if (components.length > 0) {
        nullspaceCombinations.push({
          eigenvalue: sortedEigenvalues[k],
          components,
        });
      }
    }
  }

  // 11. Top correlated pairs
  const topCorrelatedPairs: FIMResult['topCorrelatedPairs'] = [];
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      topCorrelatedPairs.push({
        i,
        j,
        names: [parameterNames[i], parameterNames[j]],
        corr: correlations[i][j],
      });
    }
  }
  topCorrelatedPairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  // 12. Approximate profile (optional)
  let profileApprox: FIMResult['profileApprox'];
  if (approxProfile) {
    profileApprox = {};
    for (let j = 0; j < d; j++) {
      if (signal?.aborted) break;
      const pj = paramValues[j];
      const otherNames = parameterNames.filter((_, idx) => idx !== j);
      const nGrid = 20;
      const factor = 5;
      const grid: number[] = [];
      const minVal = pj / factor;
      const maxVal = pj * factor;
      const logMin = Math.log(Math.max(minVal, 1e-30));
      const logMax = Math.log(Math.max(maxVal, 1e-30));
      for (let g = 0; g < nGrid; g++) {
        grid.push(Math.exp(logMin + (g / (nGrid - 1)) * (logMax - logMin)));
      }

      const ssr: number[] = [];
      for (const gridVal of grid) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        
        try {
          let currentSSR: number;
          if (config.approxProfileReopt && otherNames.length > 0) {
            // Re-optimize other parameters at this grid point
            const x0 = otherNames.map(name => Math.log(Math.max(parameters[name], 1e-30)));
            const objective = async (x: number[]) => {
              const overrides = { ...parameters };
              overrides[parameterNames[j]] = gridVal;
              otherNames.forEach((name, idx) => {
                overrides[name] = Math.exp(x[idx]);
              });
              const res = await simulateValidated(
                simulate,
                overrides,
                `approximate profile for "${parameterNames[j]}"`,
                obsNames,
                allTimepoints ? baseData.length : undefined,
              );
              const y = extractValues(res, obsNames, allTimepoints);
              let s = 0;
              for (let i = 0; i < totalObs; i++) {
                const diff = y[i] - yBase[i];
                s += diff * diff;
              }
              return s;
            };
            const opt = await nelderMead(objective, x0, { maxEval: 50, signal });
            currentSSR = opt.value;
          } else {
            const overrides = { ...parameters };
            overrides[parameterNames[j]] = gridVal;
            const result = await simulateValidated(
              simulate,
              overrides,
              `approximate profile for "${parameterNames[j]}"`,
              obsNames,
              allTimepoints ? baseData.length : undefined,
            );
            const yGrid = extractValues(result, obsNames, allTimepoints);
            let s = 0;
            for (let i = 0; i < totalObs; i++) {
              const diff = yGrid[i] - yBase[i];
              s += diff * diff;
            }
            currentSSR = s;
          }
          ssr.push(currentSSR);
        } catch {
          ssr.push(Infinity);
        }
        completed++;
        onProgress?.(completed, total);
      }

      const finiteProfile = ssr.filter(Number.isFinite);
      if (finiteProfile.length === 0) {
        throw new AnalysisDataError(`FIM approximate profile for "${parameterNames[j]}" produced no finite SSR values.`);
      }
      const minSSR = Math.min(...finiteProfile);
      const maxSSR = Math.max(...finiteProfile);
      const flatTolerance = Math.max(chi2Quantile(0.95, 1) * 0.01, 1e-12);
      const flat = maxSSR - minSSR <= flatTolerance;

      profileApprox[parameterNames[j]] = {
        grid,
        ssr,
        min: minSSR,
        flat,
        alpha: 0.95,
      };
    }
  }

  return {
    fimMatrix,
    jacobian,
    eigenvalues: sortedEigenvalues,
    eigenvectors: sortedEigenvectors,
    paramNames: parameterNames,
    conditionNumber,
    regularizedConditionNumber: regCondNumber,
    covarianceMatrix,
    correlations,
    sensitivityProfiles,
    identifiableParams,
    unidentifiableParams,
    vif,
    highVIFParams,
    nullspaceCombinations,
    topCorrelatedPairs,
    profileApprox,
  };
}

// ── Collinearity Index ───────────────────────────────────────────────

/**
 * Computes the collinearity index for all subsets of parameters of a given size.
 *
 * The collinearity index (1 / sqrt(min eigenvalue of subset Gram matrix)) measures how
 * near-linearly dependent a specific subset of parameter sensitivities is. High values (>20)
 * strongly indicate structural unidentifiability within that specific combination.
 *
 * @param jacobian - The full pre-computed sensitivity Jacobian matrix.
 * @param paramNames - Ordered list of parameter names corresponding to Jacobian columns.
 * @param subsetSize - The dimension of the subsets to test (default: 2 for pairwise).
 * @returns An array of subsets and their respective collinearity indices.
 */
export function computeCollinearity(
  jacobian: number[][],
  paramNames: string[],
  subsetSize = 2,
): CollinearityResult {
  if (!Array.isArray(paramNames) || paramNames.length === 0) {
    throw new AnalysisDataError('Collinearity analysis requires at least one parameter name.');
  }
  const d = paramNames.length;
  if (!Array.isArray(jacobian) || jacobian.length === 0) {
    throw new AnalysisDataError('Collinearity analysis requires a non-empty sensitivity Jacobian.');
  }
  if (!Number.isInteger(subsetSize) || subsetSize < 1 || subsetSize > d) {
    throw new AnalysisDataError(`Collinearity subsetSize must be an integer between 1 and ${d}.`);
  }
  if (new Set(paramNames).size !== d) {
    throw new AnalysisDataError('Collinearity parameter names must be unique.');
  }
  for (const [rowIndex, row] of jacobian.entries()) {
    if (!Array.isArray(row) || row.length < d || row.some((value) => !Number.isFinite(value))) {
      throw new AnalysisDataError(`Collinearity Jacobian row ${rowIndex} is invalid.`);
    }
  }
  const subsets: CollinearityResult['subsets'] = [];
  let maxCollinearity = 0;

  // Generate all subsets of given size
  const indices = Array.from({ length: d }, (_, i) => i);
  const combinations = getCombinations(indices, subsetSize);

  for (const combo of combinations) {
    // Extract sub-Jacobian (columns in combo)
    const subJ = jacobian.map((row) => combo.map((c) => row[c]));

    // S_K^T S_K
    const subJT = matTranspose(subJ);
    const gram = matMul(subJT, subJ);

    // Eigenvalues of gram matrix
    const { eigenvalues } = jacobiEigenDecomposition(gram);
    const minEig = Math.min(...eigenvalues.map(Math.abs));
    const collinearityIndex = minEig > 1e-30 ? 1 / Math.sqrt(minEig) : Infinity;

    const params = combo.map((i) => paramNames[i]);
    subsets.push({
      params,
      collinearityIndex,
      isCollinear: collinearityIndex > 20,
    });

    maxCollinearity = Math.max(maxCollinearity, collinearityIndex);
  }

  return { subsets, maxCollinearity };
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractValues(
  data: Array<Record<string, number>>,
  obsNames: string[],
  allTimepoints: boolean,
): number[] {
  const values: number[] = [];
  if (allTimepoints) {
    for (const obs of obsNames) {
      for (const row of data) {
        values.push(row[obs]);
      }
    }
  } else {
    const lastRow = data[data.length - 1];
    for (const obs of obsNames) {
      values.push(lastRow[obs]);
    }
  }
  return values;
}

function getCombinations(arr: number[], size: number): number[][] {
  if (size === 1) return arr.map((x) => [x]);
  const result: number[][] = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const head = arr[i];
    const tails = getCombinations(arr.slice(i + 1), size - 1);
    for (const tail of tails) {
      result.push([head, ...tail]);
    }
  }
  return result;
}
