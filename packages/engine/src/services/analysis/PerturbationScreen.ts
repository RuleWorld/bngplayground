/**
 * Systematic Perturbation Screen
 *
 * Automated in-silico knockout/knockdown screen.  For each rule, species,
 * or molecule type the module perturbs the BNGL code string, re-runs the
 * full simulation pipeline, and measures deviation from the wild-type
 * trajectory.
 */

import type { SimulationResults } from '../../types';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PerturbationScreenConfig {
  code: string;
  t_end: number;
  n_steps: number;
  observables: string[];
  perturbations: Array<
    'rule_knockout' | 'species_knockdown' | 'molecule_knockout' | 'pairwise_rules'
  >;
  knockdownFraction?: number; // default 0
  metric?: 'max_absolute' | 'integral_absolute' | 'endpoint' | 'rmsd'; // default 'rmsd'
  maxPairwise?: number; // default 500
  signal?: { cancelled: boolean };
  /** Simulation pipeline - caller provides to avoid circular imports */
  runSimulation: (
    code: string,
    t_end: number,
    n_steps: number,
  ) => Promise<SimulationResults>;
}

export interface PerturbationResult {
  target: string;
  type:
    | 'rule_knockout'
    | 'species_knockdown'
    | 'molecule_knockout'
    | 'pairwise_rules';
  deviations: Record<string, number>;
  aggregateScore: number;
  success: boolean;
  error?: string;
}

export interface SyntheticLethalPair {
  target1: string;
  target2: string;
  combinedScore: number;
  individual1Score: number;
  individual2Score: number;
  synergy: number;
}

export interface PerturbationScreenResult {
  wildTypeTrajectory: Record<string, number[]>;
  results: PerturbationResult[];
  syntheticPairs?: SyntheticLethalPair[];
  totalSimulations: number;
  failedSimulations: number;
  wallTimeMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a named BNGL block and return its non-empty, non-comment lines.
 */
function parseBlock(code: string, blockName: string): string[] {
  const regex = new RegExp(
    `begin\\s+${blockName}\\s*\\n([\\s\\S]*?)\\nend\\s+${blockName}`,
    'i',
  );
  const match = code.match(regex);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/**
 * Extract a single observable time-series from SimulationResults.
 */
function extractObservable(
  results: SimulationResults,
  obsName: string,
): number[] {
  return results.data.map((row) => row[obsName] ?? 0);
}

/**
 * Compute the deviation between a wild-type and a perturbed trajectory.
 */
function computeDeviation(
  wt: number[],
  perturbed: number[],
  metric: string,
): number {
  const n = Math.min(wt.length, perturbed.length);
  if (n === 0) return 0;

  switch (metric) {
    case 'max_absolute':
      return Math.max(
        ...Array.from({ length: n }, (_, i) => Math.abs(wt[i] - perturbed[i])),
      );
    case 'integral_absolute':
      return (
        Array.from({ length: n }, (_, i) => Math.abs(wt[i] - perturbed[i])).reduce(
          (a, b) => a + b,
          0,
        ) / n
      );
    case 'endpoint':
      return Math.abs(wt[n - 1] - perturbed[n - 1]);
    case 'rmsd':
    default:
      return Math.sqrt(
        Array.from({ length: n }, (_, i) => (wt[i] - perturbed[i]) ** 2).reduce(
          (a, b) => a + b,
          0,
        ) / n,
      );
  }
}

/**
 * Comment out a specific line inside a named block of BNGL code.
 * `lineContent` must match (trimmed) exactly one non-comment line in the block.
 */
function commentOutLineInBlock(
  code: string,
  blockName: string,
  lineContent: string,
): string {
  const blockRegex = new RegExp(
    `(begin\\s+${blockName}\\s*\\n)([\\s\\S]*?)(\\nend\\s+${blockName})`,
    'i',
  );
  const blockMatch = code.match(blockRegex);
  if (!blockMatch) return code;

  const blockBody = blockMatch[2];
  const lines = blockBody.split('\n');
  let replaced = false;
  const newLines = lines.map((l) => {
    if (!replaced && l.trim() === lineContent) {
      replaced = true;
      return '#' + l;
    }
    return l;
  });

  return code.replace(blockRegex, blockMatch[1] + newLines.join('\n') + blockMatch[3]);
}

/**
 * Comment out ALL lines in a block that contain a given token (e.g. molecule
 * type name).
 */
function commentOutLinesContaining(
  code: string,
  blockName: string,
  token: string,
): string {
  const blockRegex = new RegExp(
    `(begin\\s+${blockName}\\s*\\n)([\\s\\S]*?)(\\nend\\s+${blockName})`,
    'i',
  );
  const blockMatch = code.match(blockRegex);
  if (!blockMatch) return code;

  const blockBody = blockMatch[2];
  const lines = blockBody.split('\n');
  const newLines = lines.map((l) => {
    const trimmed = l.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes(token)) {
      return '#' + l;
    }
    return l;
  });

  return code.replace(blockRegex, blockMatch[1] + newLines.join('\n') + blockMatch[3]);
}

/**
 * Replace the concentration of a seed species line with a new value.
 * The concentration is assumed to be the last numeric token on the line.
 */
function replaceSpeciesConcentration(
  code: string,
  speciesLine: string,
  fraction: number,
): string {
  // Find the block (try "seed species" first, fall back to "species")
  let blockName = 'seed species';
  let blockRegex = new RegExp(
    `(begin\\s+${blockName}\\s*\\n)([\\s\\S]*?)(\\nend\\s+${blockName})`,
    'i',
  );
  let blockMatch = code.match(blockRegex);

  if (!blockMatch) {
    blockName = 'species';
    blockRegex = new RegExp(
      `(begin\\s+${blockName}\\s*\\n)([\\s\\S]*?)(\\nend\\s+${blockName})`,
      'i',
    );
    blockMatch = code.match(blockRegex);
  }
  if (!blockMatch) return code;

  const blockBody = blockMatch[2];
  const lines = blockBody.split('\n');
  let replaced = false;
  const newLines = lines.map((l) => {
    if (!replaced && l.trim() === speciesLine) {
      replaced = true;
      // Replace the last number on the line with the scaled value
      const concMatch = l.match(/^(.*\s)([\d.eE+-]+)\s*$/);
      if (concMatch) {
        const originalConc = parseFloat(concMatch[2]);
        const newConc = originalConc * fraction;
        return concMatch[1] + newConc.toString();
      }
      // Fallback: just set it to 0
      return l.replace(/([\d.eE+-]+)\s*$/, (fraction === 0 ? '0' : String(fraction)));
    }
    return l;
  });

  return code.replace(blockRegex, blockMatch[1] + newLines.join('\n') + blockMatch[3]);
}

/**
 * Set concentration to 0 for ALL species lines containing a given token.
 */
function zeroSpeciesContaining(code: string, token: string): string {
  // Try "seed species" then "species"
  for (const blockName of ['seed species', 'species']) {
    const blockRegex = new RegExp(
      `(begin\\s+${blockName}\\s*\\n)([\\s\\S]*?)(\\nend\\s+${blockName})`,
      'i',
    );
    const blockMatch = code.match(blockRegex);
    if (!blockMatch) continue;

    const blockBody = blockMatch[2];
    const lines = blockBody.split('\n');
    const newLines = lines.map((l) => {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes(token)) {
        return l.replace(/([\d.eE+-]+)\s*$/, '0');
      }
      return l;
    });
    code = code.replace(blockRegex, blockMatch[1] + newLines.join('\n') + blockMatch[3]);
  }
  return code;
}

/**
 * Extract the molecule type name (text before any parenthesis) from a
 * molecule types block line.
 */
function moleculeTypeName(line: string): string {
  const m = line.match(/^(\w+)/);
  return m ? m[1] : line;
}

/**
 * Derive a short label for a rule line.
 */
function ruleLabel(line: string): string {
  // If the rule has a label like "RuleName: ...", use it
  const labelMatch = line.match(/^(\w+)\s*:/);
  if (labelMatch) return labelMatch[1];
  // Otherwise use the full (trimmed) line, truncated
  return line.length > 60 ? line.slice(0, 57) + '...' : line;
}

/**
 * Derive a short label for a species line.
 */
function speciesLabel(line: string): string {
  // Species lines look like "A(b) 100" - take the species pattern part
  const m = line.match(/^(\S+)/);
  return m ? m[1] : line;
}

// ---------------------------------------------------------------------------
// Core perturbation logic
// ---------------------------------------------------------------------------

async function runPerturbation(
  config: PerturbationScreenConfig,
  mutantCode: string,
  target: string,
  type: PerturbationResult['type'],
  wtTrajectory: Record<string, number[]>,
  metric: string,
): Promise<PerturbationResult> {
  try {
    const simResult = await config.runSimulation(
      mutantCode,
      config.t_end,
      config.n_steps,
    );

    const deviations: Record<string, number> = {};
    for (const obs of config.observables) {
      const wtObs = wtTrajectory[obs] ?? [];
      const perturbedObs = extractObservable(simResult, obs);
      deviations[obs] = computeDeviation(wtObs, perturbedObs, metric);
    }

    const scores = Object.values(deviations);
    const aggregateScore =
      scores.length > 0
        ? Math.sqrt(scores.reduce((a, b) => a + b * b, 0) / scores.length)
        : 0;

    return { target, type, deviations, aggregateScore, success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      target,
      type,
      deviations: {},
      aggregateScore: 0,
      success: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function perturbationScreen(
  config: PerturbationScreenConfig,
): Promise<PerturbationScreenResult> {
  const startTime = Date.now();
  const metric = config.metric ?? 'rmsd';
  const knockdownFraction = config.knockdownFraction ?? 0;
  const maxPairwise = config.maxPairwise ?? 500;

  const results: PerturbationResult[] = [];
  let totalSimulations = 0;
  let failedSimulations = 0;

  const isCancelled = () => config.signal?.cancelled === true;

  // ---- 1. Wild-type run ---------------------------------------------------
  const wtSimResult = await config.runSimulation(
    config.code,
    config.t_end,
    config.n_steps,
  );
  totalSimulations++;

  const wildTypeTrajectory: Record<string, number[]> = {};
  for (const obs of config.observables) {
    wildTypeTrajectory[obs] = extractObservable(wtSimResult, obs);
  }

  if (isCancelled()) {
    return {
      wildTypeTrajectory,
      results,
      totalSimulations,
      failedSimulations,
      wallTimeMs: Date.now() - startTime,
    };
  }

  // ---- 2. Parse BNGL blocks -----------------------------------------------
  const ruleLines = parseBlock(config.code, 'reaction rules');
  const speciesLines = [
    ...parseBlock(config.code, 'seed species'),
    ...parseBlock(config.code, 'species'),
  ];
  const moleculeTypeLines = parseBlock(config.code, 'molecule types');

  // ---- 3. Rule knockouts --------------------------------------------------
  if (config.perturbations.includes('rule_knockout') || config.perturbations.includes('pairwise_rules')) {
    for (const ruleLine of ruleLines) {
      if (isCancelled()) break;
      const mutantCode = commentOutLineInBlock(config.code, 'reaction rules', ruleLine);
      const result = await runPerturbation(
        config,
        mutantCode,
        ruleLabel(ruleLine),
        'rule_knockout',
        wildTypeTrajectory,
        metric,
      );
      totalSimulations++;
      if (!result.success) failedSimulations++;
      results.push(result);
    }
  }

  // ---- 4. Species knockdowns ----------------------------------------------
  if (config.perturbations.includes('species_knockdown')) {
    for (const speciesLine of speciesLines) {
      if (isCancelled()) break;
      const mutantCode = replaceSpeciesConcentration(
        config.code,
        speciesLine,
        knockdownFraction,
      );
      const result = await runPerturbation(
        config,
        mutantCode,
        speciesLabel(speciesLine),
        'species_knockdown',
        wildTypeTrajectory,
        metric,
      );
      totalSimulations++;
      if (!result.success) failedSimulations++;
      results.push(result);
    }
  }

  // ---- 5. Molecule-type knockouts -----------------------------------------
  if (config.perturbations.includes('molecule_knockout')) {
    for (const mtLine of moleculeTypeLines) {
      if (isCancelled()) break;
      const mtName = moleculeTypeName(mtLine);
      let mutantCode = commentOutLinesContaining(config.code, 'reaction rules', mtName);
      mutantCode = zeroSpeciesContaining(mutantCode, mtName);
      const result = await runPerturbation(
        config,
        mutantCode,
        mtName,
        'molecule_knockout',
        wildTypeTrajectory,
        metric,
      );
      totalSimulations++;
      if (!result.success) failedSimulations++;
      results.push(result);
    }
  }

  // ---- 6. Pairwise rule knockouts -----------------------------------------
  let syntheticPairs: SyntheticLethalPair[] | undefined;

  if (config.perturbations.includes('pairwise_rules')) {
    syntheticPairs = [];

    // Collect individual rule knockout results (already computed in step 3)
    const ruleResults = results.filter((r) => r.type === 'rule_knockout' && r.success);
    // Sort by score descending and take top-N for pairwise
    const topRules = [...ruleResults]
      .sort((a, b) => b.aggregateScore - a.aggregateScore);

    // Build the score lookup
    const individualScores = new Map<string, number>();
    for (const r of topRules) {
      individualScores.set(r.target, r.aggregateScore);
    }

    // Generate pairs from the top rules, capped at maxPairwise simulations
    let pairCount = 0;
    const pairRuleLines = topRules.map((r) => {
      // Find the original rule line matching this label
      return ruleLines.find(
        (rl) => ruleLabel(rl) === r.target,
      )!;
    }).filter(Boolean);

    for (let i = 0; i < pairRuleLines.length && pairCount < maxPairwise; i++) {
      for (let j = i + 1; j < pairRuleLines.length && pairCount < maxPairwise; j++) {
        if (isCancelled()) break;

        let mutantCode = commentOutLineInBlock(
          config.code,
          'reaction rules',
          pairRuleLines[i],
        );
        mutantCode = commentOutLineInBlock(
          mutantCode,
          'reaction rules',
          pairRuleLines[j],
        );

        const label1 = ruleLabel(pairRuleLines[i]);
        const label2 = ruleLabel(pairRuleLines[j]);
        const pairTarget = `${label1} + ${label2}`;

        const result = await runPerturbation(
          config,
          mutantCode,
          pairTarget,
          'pairwise_rules',
          wildTypeTrajectory,
          metric,
        );
        totalSimulations++;
        pairCount++;
        if (!result.success) {
          failedSimulations++;
          continue;
        }
        results.push(result);

        const individual1Score = individualScores.get(label1) ?? 0;
        const individual2Score = individualScores.get(label2) ?? 0;
        const synergy =
          result.aggregateScore - Math.max(individual1Score, individual2Score);

        syntheticPairs.push({
          target1: label1,
          target2: label2,
          combinedScore: result.aggregateScore,
          individual1Score,
          individual2Score,
          synergy,
        });
      }
      if (isCancelled()) break;
    }

    // Sort by synergy descending
    syntheticPairs.sort((a, b) => b.synergy - a.synergy);
  }

  return {
    wildTypeTrajectory,
    results,
    syntheticPairs,
    totalSimulations,
    failedSimulations,
    wallTimeMs: Date.now() - startTime,
  };
}
