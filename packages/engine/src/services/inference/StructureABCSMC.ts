/**
 * StructureABCSMC.ts — ABC-SMC algorithm for model structure learning.
 *
 * Searches over a discrete space of rule inclusion vectors (which rules
 * to include) jointly with continuous rate-parameter space. Returns
 * posterior rule-inclusion probabilities and the best-scoring structures.
 */

import type { CandidateRule } from '../verification/RuleEnumerator';
import type { BNGLMoleculeType } from '../../types';
import { SeededRandom } from '../../utils/random';

// ── Types ────────────────────────────────────────────────────────────

export interface StructureSearchConfig {
  candidates: CandidateRule[];
  moleculeTypes: BNGLMoleculeType[];
  seedSpecies: Array<{ name: string; initialConcentration: number }>;
  observables: Array<{ type: string; name: string; pattern: string }>;
  experimentalData: Array<{ time: number; observable: string; value: number; error?: number }>;
  inclusionPrior?: number;       // Default: 0.1
  categoryPriors?: Record<string, number>;
  parameterBounds: Record<string, [number, number]>;
  nParticles?: number;           // Default: 100
  nGenerations?: number;         // Default: 10
  targetAcceptanceRate?: number;  // Default: 0.1
  seed?: number;
}

export interface StructureParticle {
  activeRules: boolean[];
  parameters: Record<string, number>;
  score: number;
  weight: number;
}

export interface StructureSearchResult {
  particles: StructureParticle[];
  bestStructure: {
    rules: CandidateRule[];
    parameters: Record<string, number>;
    score: number;
    bnglCode: string;
  };
  topK: Array<{ rules: CandidateRule[]; posteriorProbability: number; bic: number }>;
  ruleInclusionProbabilities: Record<string, number>;
  convergenceDiagnostics: {
    effectiveSampleSize: number;
    acceptanceRateByGeneration: number[];
  };
}

export type SimulatorFn = (
  code: string,
  options: any,
) => Promise<{ headers: string[]; data: Record<string, number>[] }>;

export interface StructureSearchProgress {
  generation: number;
  totalGenerations: number;
  acceptanceRate: number;
  bestScore: number;
  epsilon: number;
}

// ── Model assembly ───────────────────────────────────────────────────

/**
 * Build a complete BNGL model from selected rules, parameters, and declarations.
 */
export function assembleModel(
  activeRules: CandidateRule[],
  parameters: Record<string, number>,
  moleculeTypes: BNGLMoleculeType[],
  seedSpecies: Array<{ name: string; initialConcentration: number }>,
  observables: Array<{ type: string; name: string; pattern: string }>,
): string {
  const lines: string[] = [];
  lines.push('begin model');
  lines.push('');

  // Parameters section
  lines.push('begin parameters');
  for (const [name, value] of Object.entries(parameters)) {
    lines.push(`  ${name} ${value}`);
  }
  lines.push('end parameters');
  lines.push('');

  // Molecule types
  lines.push('begin molecule types');
  for (const mol of moleculeTypes) {
    const compStr = mol.components.length > 0 ? mol.components.join(',') : '';
    lines.push(`  ${mol.name}(${compStr})`);
  }
  lines.push('end molecule types');
  lines.push('');

  // Seed species
  lines.push('begin seed species');
  for (const sp of seedSpecies) {
    lines.push(`  ${sp.name} ${sp.initialConcentration}`);
  }
  lines.push('end seed species');
  lines.push('');

  // Observables
  lines.push('begin observables');
  for (const obs of observables) {
    lines.push(`  ${obs.type} ${obs.name} ${obs.pattern}`);
  }
  lines.push('end observables');
  lines.push('');

  // Reaction rules
  lines.push('begin reaction rules');
  for (const rule of activeRules) {
    lines.push(`  ${rule.rule}`);
  }
  lines.push('end reaction rules');
  lines.push('');

  lines.push('end model');
  return lines.join('\n');
}

// ── ABC-SMC structure search ─────────────────────────────────────────

/**
 * ABC-SMC algorithm with discrete structure dimension.
 *
 * 1. Initialize particles: sample binary inclusion vector from Bernoulli(prior),
 *    sample parameters from uniform bounds.
 * 2. For each particle: assemble BNGL, simulate, compute distance to data.
 * 3. Accept/reject based on epsilon threshold.
 * 4. Importance resampling with weights.
 * 5. Perturb: flip rules on/off, perturb parameters with Gaussian kernel.
 * 6. Repeat for nGenerations.
 * 7. Return rule inclusion probabilities and top structures.
 */
export async function structureSearch(
  config: StructureSearchConfig,
  simulator: SimulatorFn,
  onProgress?: (progress: StructureSearchProgress) => void,
): Promise<StructureSearchResult> {
  const {
    candidates,
    moleculeTypes,
    seedSpecies,
    observables,
    experimentalData,
    parameterBounds,
    inclusionPrior = 0.1,
    categoryPriors,
    nParticles = 100,
    nGenerations = 10,
    targetAcceptanceRate = 0.1,
    seed = 12345,
  } = config;

  const rng = new SeededRandom(seed);
  const nRules = candidates.length;

  // Compute per-rule inclusion priors
  const rulePriors = candidates.map((c) => {
    if (categoryPriors && categoryPriors[c.category] !== undefined) {
      return categoryPriors[c.category];
    }
    return inclusionPrior;
  });

  // Collect all unique rate parameter names across candidates
  const rateNames = candidates.map((c) => extractRateName(c.rule));

  // Helper: sample a parameter value uniformly from bounds
  function sampleParam(rateName: string): number {
    const bounds = parameterBounds[rateName] ?? [1e-4, 1e2];
    const lo = bounds[0];
    const hi = bounds[1];
    // Sample in log-space for rate constants
    const logLo = Math.log(lo);
    const logHi = Math.log(hi);
    return Math.exp(logLo + rng.next() * (logHi - logLo));
  }

  // Helper: compute distance between simulation output and experimental data
  function computeDistance(
    simData: Record<string, number>[],
    headers: string[],
  ): number {
    let sse = 0;
    for (const dp of experimentalData) {
      // Find closest time point in simulation
      let bestIdx = 0;
      let bestDt = Infinity;
      for (let i = 0; i < simData.length; i++) {
        const t = simData[i]['time'] ?? simData[i]['Time'] ?? simData[i]['t'] ?? 0;
        const dt = Math.abs(t - dp.time);
        if (dt < bestDt) {
          bestDt = dt;
          bestIdx = i;
        }
      }
      const simVal = simData[bestIdx]?.[dp.observable] ?? 0;
      const err = dp.error ?? 1;
      sse += ((simVal - dp.value) / err) ** 2;
    }
    return sse;
  }

  // Helper: create parameter map for a particle
  function buildParams(active: boolean[]): Record<string, number> {
    const params: Record<string, number> = {};
    for (let i = 0; i < nRules; i++) {
      if (active[i]) {
        const name = rateNames[i];
        params[name] = sampleParam(name);
      }
    }
    return params;
  }

  // Helper: simulate a particle and return distance
  async function evaluateParticle(
    active: boolean[],
    params: Record<string, number>,
  ): Promise<number> {
    const activeRules = candidates.filter((_, i) => active[i]);
    if (activeRules.length === 0) return Infinity;

    const code = assembleModel(activeRules, params, moleculeTypes, seedSpecies, observables);
    try {
      const result = await simulator(code, { t_end: getMaxTime(), n_steps: 50 });
      return computeDistance(result.data, result.headers);
    } catch {
      return Infinity;
    }
  }

  function getMaxTime(): number {
    let maxT = 0;
    for (const dp of experimentalData) {
      if (dp.time > maxT) maxT = dp.time;
    }
    return maxT > 0 ? maxT : 100;
  }

  // ── Generation 0: Initialize ──────────────────────────────────────

  let particles: StructureParticle[] = [];
  const scores: number[] = [];

  for (let p = 0; p < nParticles; p++) {
    const active = new Array(nRules);
    for (let i = 0; i < nRules; i++) {
      active[i] = rng.next() < rulePriors[i];
    }
    const params = buildParams(active);
    const score = await evaluateParticle(active, params);
    particles.push({ activeRules: active, parameters: params, score, weight: 1 / nParticles });
    scores.push(score);
  }

  // Initial epsilon: median of finite scores
  const finiteScores = scores.filter((s) => isFinite(s)).sort((a, b) => a - b);
  let epsilon = finiteScores.length > 0
    ? finiteScores[Math.floor(finiteScores.length * 0.75)]
    : 1e10;

  const acceptanceRates: number[] = [];

  // ── Generations 1..N ──────────────────────────────────────────────

  for (let gen = 1; gen < nGenerations; gen++) {
    // Decrease epsilon
    const prevEpsilon = epsilon;
    const finiteParticleScores = particles
      .filter((p) => isFinite(p.score))
      .map((p) => p.score)
      .sort((a, b) => a - b);
    if (finiteParticleScores.length > 0) {
      epsilon = finiteParticleScores[Math.floor(finiteParticleScores.length * 0.5)];
      // Ensure epsilon decreases
      if (epsilon >= prevEpsilon) {
        epsilon = prevEpsilon * 0.8;
      }
    }

    // Normalize weights
    const totalWeight = particles.reduce((s, p) => s + p.weight, 0);
    if (totalWeight > 0) {
      for (const p of particles) p.weight /= totalWeight;
    }

    // Resample indices according to weights
    const resampledIndices = systematicResample(
      particles.map((p) => p.weight),
      nParticles,
      rng,
    );

    // Perturb and accept/reject
    const newParticles: StructureParticle[] = [];
    let accepted = 0;
    let attempted = 0;
    const maxAttempts = nParticles * 20;

    while (newParticles.length < nParticles && attempted < maxAttempts) {
      // Pick a parent
      const parentIdx = resampledIndices[newParticles.length % resampledIndices.length];
      const parent = particles[parentIdx];
      attempted++;

      // Perturb structure: flip each rule with probability p_flip
      const pFlip = 0.05;
      const newActive = [...parent.activeRules];
      for (let i = 0; i < nRules; i++) {
        if (rng.next() < pFlip) {
          newActive[i] = !newActive[i];
        }
      }

      // Perturb parameters with Gaussian kernel in log-space
      const newParams: Record<string, number> = {};
      for (let i = 0; i < nRules; i++) {
        if (!newActive[i]) continue;
        const name = rateNames[i];
        const bounds = parameterBounds[name] ?? [1e-4, 1e2];
        let logVal: number;
        if (parent.parameters[name] !== undefined && parent.parameters[name] > 0) {
          logVal = Math.log(parent.parameters[name]);
        } else {
          logVal = Math.log(bounds[0]) + rng.next() * (Math.log(bounds[1]) - Math.log(bounds[0]));
        }
        // Gaussian perturbation in log-space
        const sigma = 0.5;
        const u1 = rng.next();
        const u2 = rng.next();
        const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
        logVal += sigma * z;
        // Clamp to bounds
        logVal = Math.max(Math.log(bounds[0]), Math.min(Math.log(bounds[1]), logVal));
        newParams[name] = Math.exp(logVal);
      }

      const score = await evaluateParticle(newActive, newParams);
      if (score < epsilon) {
        // Compute prior ratio for weight
        let priorRatio = 1;
        for (let i = 0; i < nRules; i++) {
          const p = rulePriors[i];
          priorRatio *= newActive[i] ? p : (1 - p);
        }
        newParticles.push({
          activeRules: newActive,
          parameters: newParams,
          score,
          weight: priorRatio,
        });
        accepted++;
      }
    }

    // If we didn't get enough particles, pad with best from previous gen
    if (newParticles.length < nParticles) {
      const sorted = [...particles].sort((a, b) => a.score - b.score);
      while (newParticles.length < nParticles) {
        newParticles.push({ ...sorted[newParticles.length % sorted.length] });
      }
    }

    const accRate = attempted > 0 ? accepted / attempted : 0;
    acceptanceRates.push(accRate);
    particles = newParticles;

    onProgress?.({
      generation: gen,
      totalGenerations: nGenerations,
      acceptanceRate: accRate,
      bestScore: Math.min(...particles.map((p) => p.score)),
      epsilon,
    });

    // Stop early if acceptance rate is too low
    if (accRate < targetAcceptanceRate && gen > 2) break;
  }

  // ── Compute results ───────────────────────────────────────────────

  // Normalize final weights
  const totalW = particles.reduce((s, p) => s + p.weight, 0);
  if (totalW > 0) {
    for (const p of particles) p.weight /= totalW;
  }

  // Rule inclusion probabilities
  const ruleInclusionProbs: Record<string, number> = {};
  for (let i = 0; i < nRules; i++) {
    let prob = 0;
    for (const p of particles) {
      if (p.activeRules[i]) prob += p.weight;
    }
    ruleInclusionProbs[candidates[i].rule] = prob;
  }

  // Best particle
  let bestParticle = particles[0];
  for (const p of particles) {
    if (p.score < bestParticle.score) bestParticle = p;
  }
  const bestActiveRules = candidates.filter((_, i) => bestParticle.activeRules[i]);
  const bestCode = assembleModel(
    bestActiveRules,
    bestParticle.parameters,
    moleculeTypes,
    seedSpecies,
    observables,
  );

  // TopK structures by unique structure signature
  const structureMap = new Map<string, { rules: CandidateRule[]; totalWeight: number; bestScore: number }>();
  for (const p of particles) {
    const sig = p.activeRules.map((b) => (b ? '1' : '0')).join('');
    const existing = structureMap.get(sig);
    if (existing) {
      existing.totalWeight += p.weight;
      if (p.score < existing.bestScore) existing.bestScore = p.score;
    } else {
      structureMap.set(sig, {
        rules: candidates.filter((_, i) => p.activeRules[i]),
        totalWeight: p.weight,
        bestScore: p.score,
      });
    }
  }
  const topK = [...structureMap.values()]
    .sort((a, b) => b.totalWeight - a.totalWeight)
    .slice(0, 10)
    .map((s) => ({
      rules: s.rules,
      posteriorProbability: s.totalWeight,
      bic: computeBIC(s.bestScore, s.rules.length, experimentalData.length),
    }));

  // Effective sample size
  const ess = 1 / particles.reduce((s, p) => s + p.weight ** 2, 0);

  return {
    particles,
    bestStructure: {
      rules: bestActiveRules,
      parameters: bestParticle.parameters,
      score: bestParticle.score,
      bnglCode: bestCode,
    },
    topK,
    ruleInclusionProbabilities: ruleInclusionProbs,
    convergenceDiagnostics: {
      effectiveSampleSize: ess,
      acceptanceRateByGeneration: acceptanceRates,
    },
  };
}

// ── Internal helpers ─────────────────────────────────────────────────

function extractRateName(rule: string): string {
  const tokens = rule.trim().split(/\s+/);
  return tokens[tokens.length - 1];
}

/**
 * Systematic resampling: deterministic low-variance resampling.
 */
function systematicResample(
  weights: number[],
  n: number,
  rng: SeededRandom,
): number[] {
  const indices: number[] = [];
  const cumWeights: number[] = [];
  let cum = 0;
  for (const w of weights) {
    cum += w;
    cumWeights.push(cum);
  }
  // Normalize
  if (cum > 0) {
    for (let i = 0; i < cumWeights.length; i++) cumWeights[i] /= cum;
  }

  const u0 = rng.next() / n;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = u0 + i / n;
    while (j < weights.length - 1 && cumWeights[j] < u) j++;
    indices.push(j);
  }
  return indices;
}

/**
 * Compute BIC from chi-squared distance (SSE already normalized by per-point errors).
 * Since distance = sum((sim-obs)/err)^2, this is a chi-squared statistic.
 * Log-likelihood for chi-squared: logL = -chiSq/2 (up to constant).
 */
function computeBIC(chiSq: number, k: number, n: number): number {
  if (n === 0) return 0;
  // logL = -chiSq/2 (constant terms cancel in BIC comparisons)
  const logL = -chiSq / 2;
  return -2 * logL + k * Math.log(n);
}
