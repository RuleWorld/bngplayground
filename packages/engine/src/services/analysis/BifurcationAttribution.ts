/**
 * BifurcationAttribution.ts -- Map bifurcations back to reaction rules.
 *
 * Uses eigenvalue sensitivity analysis to identify which Jacobian entries
 * (and hence which reactions) are most responsible for a bifurcation.
 *
 * LIMITATION: Currently only handles real eigenvectors. For Hopf bifurcations
 * (complex eigenvalue pairs), the formula requires complex conjugate eigenvectors:
 *   d(lambda) / d(J_ij) = conj(w_i) * v_j / (w^H v)
 * The current real-only implementation is correct for saddle-node and transcritical
 * bifurcations but may give inaccurate attribution for Hopf bifurcations.
 *
 * Key formula (for simple real eigenvalue lambda with right eigenvector v and
 * left eigenvector w):
 *
 *   d(lambda) / d(J_ij) = w_i * v_j / (w^T v)
 */

import { computeEigenvectors, type ComplexNumber } from './EigenSolver';

// ── Types ───────────────────────────────────────────────────────────

export interface SourceMapEntry {
  /** Row index in the Jacobian */
  speciesIndex: number;
  /** Column index in the Jacobian */
  dependsOnSpeciesIndex: number;
  /** Rule index or name responsible for this Jacobian entry */
  ruleIndex: number;
  /** Optional rule label */
  ruleName?: string;
  /** Contribution coefficient (stoichiometry * rate-derivative factor) */
  coefficient: number;
}

export interface AttributionResult {
  /** Ranked list of rules by their influence on the critical eigenvalue */
  ruleContributions: Array<{
    ruleIndex: number;
    ruleName: string;
    /** Absolute sensitivity magnitude */
    sensitivity: number;
    /** Fractional contribution (0-1) */
    fraction: number;
    /** Which Jacobian entries this rule contributes to */
    jacobianEntries: Array<{ i: number; j: number; sensitivity: number }>;
  }>;
  /** Full sensitivity matrix d(lambda)/d(J_ij) */
  sensitivityMatrix: Float64Array;
}

export interface EigenvalueSensitivityResult {
  /** Sensitivity d(lambda)/d(J_ij) as a flat n×n array (row-major) */
  sensitivities: Float64Array;
}

// ── Attribution ─────────────────────────────────────────────────────

/**
 * Attribute a bifurcation to specific reaction rules by computing eigenvalue
 * sensitivity and mapping through the source map.
 *
 * @param _bifurcation  Unused placeholder for bifurcation metadata
 * @param jacobian      Row-major Jacobian at the bifurcation point
 * @param nSpecies      Dimension
 * @param eigenvalues   All eigenvalues at the bifurcation point
 * @param sourceMap     Map from Jacobian entries to reaction rules
 * @param criticalIndex Index of the critical eigenvalue (default: the one with
 *                      real part closest to zero)
 */
export function attributeBifurcation(
  _bifurcation: unknown,
  jacobian: Float64Array,
  nSpecies: number,
  eigenvalues: Array<ComplexNumber>,
  sourceMap: SourceMapEntry[],
  criticalIndex?: number,
): AttributionResult {
  // If no critical index given, pick the eigenvalue closest to zero real part
  if (criticalIndex === undefined) {
    let minAbs = Infinity;
    criticalIndex = 0;
    for (let i = 0; i < eigenvalues.length; i++) {
      const absReal = Math.abs(eigenvalues[i].real);
      if (absReal < minAbs) {
        minAbs = absReal;
        criticalIndex = i;
      }
    }
  }

  // Compute eigenvalue sensitivity matrix
  const { sensitivities } = eigenvalueSensitivity(
    jacobian,
    nSpecies,
    criticalIndex,
    eigenvalues,
  );

  // Accumulate sensitivities per rule
  const ruleMap = new Map<
    number,
    {
      ruleName: string;
      totalSensitivity: number;
      entries: Array<{ i: number; j: number; sensitivity: number }>;
    }
  >();

  for (const entry of sourceMap) {
    const { speciesIndex: i, dependsOnSpeciesIndex: j, ruleIndex, ruleName, coefficient } = entry;
    const rawSens = sensitivities[i * nSpecies + j];
    const weightedSens = Math.abs(rawSens * coefficient);

    let record = ruleMap.get(ruleIndex);
    if (!record) {
      record = {
        ruleName: ruleName ?? `Rule_${ruleIndex}`,
        totalSensitivity: 0,
        entries: [],
      };
      ruleMap.set(ruleIndex, record);
    }
    record.totalSensitivity += weightedSens;
    record.entries.push({ i, j, sensitivity: rawSens * coefficient });
  }

  // Normalise and sort
  let totalAll = 0;
  for (const r of ruleMap.values()) totalAll += r.totalSensitivity;
  if (totalAll < 1e-300) totalAll = 1;

  const ruleContributions = Array.from(ruleMap.entries())
    .map(([ruleIndex, rec]) => ({
      ruleIndex,
      ruleName: rec.ruleName,
      sensitivity: rec.totalSensitivity,
      fraction: rec.totalSensitivity / totalAll,
      jacobianEntries: rec.entries,
    }))
    .sort((a, b) => b.sensitivity - a.sensitivity);

  return { ruleContributions, sensitivityMatrix: sensitivities };
}

// ── Eigenvalue sensitivity ──────────────────────────────────────────

/**
 * Compute the sensitivity of eigenvalue lambda_k with respect to every
 * entry J_ij of the Jacobian matrix.
 *
 * For a simple eigenvalue:
 *   d(lambda_k) / d(J_ij) = w_i * v_j / (w^T v)
 *
 * where v is the right eigenvector and w is the left eigenvector.
 */
export function eigenvalueSensitivity(
  jacobian: Float64Array,
  nSpecies: number,
  eigenvalueIndex: number,
  eigenvalues: Array<ComplexNumber>,
): EigenvalueSensitivityResult {
  const { right: v, left: w } = computeEigenvectors(
    jacobian,
    nSpecies,
    eigenvalueIndex,
    eigenvalues,
  );

  // Normalise so that w^T v = 1
  let wTv = 0;
  for (let i = 0; i < nSpecies; i++) wTv += w[i] * v[i];
  // Guard against near-degenerate eigenvalues where w^T v ≈ 0
  if (Math.abs(wTv) < 1e-12) wTv = wTv >= 0 ? 1e-12 : -1e-12;

  const sensitivities = new Float64Array(nSpecies * nSpecies);
  for (let i = 0; i < nSpecies; i++) {
    for (let j = 0; j < nSpecies; j++) {
      sensitivities[i * nSpecies + j] = (w[i] * v[j]) / wTv;
    }
  }

  return { sensitivities };
}
