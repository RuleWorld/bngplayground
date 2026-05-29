/**
 * Multi-Model Comparison Service
 *
 * Compares multiple BNGL model variants by simulating them and computing
 * divergence metrics across shared observables. Supports knockout-based
 * variant generation and rule-level divergence attribution.
 */

import type {
  BNGLModel,
  SimulationResults,
  SimulationOptions,
} from '../../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ModelVariant {
  name: string;
  code: string;
  model?: BNGLModel;
  color?: string;
}

export interface DivergencePoint {
  time: number;
  observable: string;
  variants: Array<{ name: string; value: number }>;
  maxDifference: number;
  relativeDeviation: number;
}

export interface RuleAttribution {
  rule: string;
  presentIn: string[];
  absentFrom: string[];
  effectOnObservable: string;
  divergenceContribution: number;
}

export interface MultiModelResult {
  variants: Array<{ name: string; results: SimulationResults }>;
  divergences: DivergencePoint[];
  firstDivergenceTime: number | null;
  attributions: RuleAttribution[];
  sharedRules: string[];
  uniqueRules: Record<string, string[]>;
}

export interface MultiModelConfig {
  variants: ModelVariant[];
  simulationOptions?: Partial<SimulationOptions>;
  divergenceThreshold?: number; // Default: 0.1
  attributionMethod?: 'knockout' | 'addition' | 'both';
}

export type SimulatorFn = (
  code: string,
  options: Partial<SimulationOptions>,
) => Promise<SimulationResults>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalize a rule string for comparison: trim, collapse internal spaces. */
function normalizeRuleString(rule: string): string {
  return rule.trim().replace(/\s+/g, ' ');
}

/**
 * Extract the content between `begin reaction rules` and
 * `end reaction rules` from raw BNGL code. Returns an array of non-empty,
 * non-comment rule lines together with their original line indices.
 */
function extractRuleLines(
  code: string,
): Array<{ line: string; index: number }> {
  const lines = code.split(/\r?\n/);
  let inside = false;
  const result: Array<{ line: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^begin\s+reaction\s+rules/i.test(trimmed)) {
      inside = true;
      continue;
    }
    if (/^end\s+reaction\s+rules/i.test(trimmed)) {
      break;
    }
    if (inside && trimmed.length > 0 && !trimmed.startsWith('#')) {
      result.push({ line: trimmed, index: i });
    }
  }
  return result;
}

/**
 * Identify shared and unique rules across a set of model variants.
 * Rules are compared after normalization.
 */
function classifyRules(
  variants: ModelVariant[],
): { shared: string[]; unique: Record<string, string[]> } {
  // Map: normalized rule -> set of variant names that contain it
  const rulePresence = new Map<string, Set<string>>();
  const variantRulesMap = new Map<string, string[]>();

  for (const v of variants) {
    const ruleLines = extractRuleLines(v.code);
    const normalized = ruleLines.map((r) => normalizeRuleString(r.line));
    variantRulesMap.set(v.name, normalized);

    for (const nr of normalized) {
      if (!rulePresence.has(nr)) {
        rulePresence.set(nr, new Set());
      }
      rulePresence.get(nr)!.add(v.name);
    }
  }

  const variantNames = variants.map((v) => v.name);
  const shared: string[] = [];
  const unique: Record<string, string[]> = {};

  for (const name of variantNames) {
    unique[name] = [];
  }

  for (const [rule, presenceSet] of rulePresence.entries()) {
    if (presenceSet.size === variantNames.length) {
      shared.push(rule);
    } else {
      for (const vName of presenceSet) {
        unique[vName].push(rule);
      }
    }
  }

  return { shared, unique };
}

/**
 * Extract the time column from simulation results.
 * Tries "time" first, then "Time", then falls back to the first header.
 */
function getTimeColumn(results: SimulationResults): string {
  if (results.headers.includes('time')) return 'time';
  if (results.headers.includes('Time')) return 'Time';
  return results.headers[0];
}

/**
 * Get the set of observable names shared across all result sets
 * (excluding the time column).
 */
function sharedObservables(allResults: SimulationResults[]): string[] {
  if (allResults.length === 0) return [];

  const headerSets = allResults.map((r) => {
    const timeCol = getTimeColumn(r);
    return new Set(r.headers.filter((h) => h !== timeCol));
  });

  const first = headerSets[0];
  return [...first].filter((h) => headerSets.every((s) => s.has(h)));
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Linearly interpolate simulation results onto a common set of target times.
 *
 * For each target time, finds the bracketing source rows and performs linear
 * interpolation on every data column. Times outside the source range are
 * clamped to the nearest boundary value.
 */
export function interpolateResults(
  results: SimulationResults,
  targetTimes: number[],
): SimulationResults {
  const timeCol = getTimeColumn(results);
  const srcTimes = results.data.map((row) => row[timeCol]);
  const otherHeaders = results.headers.filter((h) => h !== timeCol);

  const interpolatedData: Record<string, number>[] = [];

  for (const t of targetTimes) {
    const row: Record<string, number> = { [timeCol]: t };

    // Clamp below
    if (t <= srcTimes[0]) {
      for (const h of otherHeaders) {
        row[h] = results.data[0][h];
      }
      interpolatedData.push(row);
      continue;
    }
    // Clamp above
    if (t >= srcTimes[srcTimes.length - 1]) {
      for (const h of otherHeaders) {
        row[h] = results.data[results.data.length - 1][h];
      }
      interpolatedData.push(row);
      continue;
    }

    // Find bracketing interval via binary search
    let lo = 0;
    let hi = srcTimes.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (srcTimes[mid] <= t) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const t0 = srcTimes[lo];
    const t1 = srcTimes[hi];
    const frac = t1 !== t0 ? (t - t0) / (t1 - t0) : 0;

    for (const h of otherHeaders) {
      const v0 = results.data[lo][h];
      const v1 = results.data[hi][h];
      row[h] = v0 + frac * (v1 - v0);
    }

    interpolatedData.push(row);
  }

  return {
    ...results,
    data: interpolatedData,
  };
}

// ---------------------------------------------------------------------------
// Divergence computation
// ---------------------------------------------------------------------------

/**
 * For each time point and each observable, compute the coefficient of
 * variation (CV = std / |mean|) across all variants. A CV exceeding
 * `threshold` is flagged as a divergence point.
 *
 * Returns an array of DivergencePoint sorted by time.
 */
export function computeDivergenceMetrics(
  allResults: Array<{ name: string; results: SimulationResults }>,
  observableNames: string[],
  threshold: number,
): DivergencePoint[] {
  if (allResults.length < 2) return [];

  const timeCol = getTimeColumn(allResults[0].results);
  const nRows = allResults[0].results.data.length;
  const divergences: DivergencePoint[] = [];

  for (let i = 0; i < nRows; i++) {
    const time = allResults[0].results.data[i][timeCol];

    for (const obs of observableNames) {
      const values: Array<{ name: string; value: number }> = [];
      for (const vr of allResults) {
        const val = vr.results.data[i]?.[obs] ?? 0;
        values.push({ name: vr.name, value: val });
      }

      const nums = values.map((v) => v.value);
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance =
        nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
      const std = Math.sqrt(variance);
      const absMean = Math.abs(mean);
      // Use modified CV with floor to avoid false positives when mean is near zero
      const cv = absMean > 1e-8 ? std / absMean : std > 1e-8 ? std : 0;

      if (cv > threshold) {
        const maxVal = Math.max(...nums);
        const minVal = Math.min(...nums);
        divergences.push({
          time,
          observable: obs,
          variants: values,
          maxDifference: maxVal - minVal,
          relativeDeviation: cv,
        });
      }
    }
  }

  divergences.sort((a, b) => a.time - b.time);
  return divergences;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * Attribute divergence to specific rules by comparing base simulation
 * results against knockout-variant results.
 *
 * For each unique rule in a variant, this computes the fraction of total
 * divergence that is explained when comparing the base model's trajectory
 * to the variant that lacks that rule.
 */
export function attributeDivergence(
  baseResults: SimulationResults,
  variantResults: Array<{ name: string; results: SimulationResults }>,
  sharedObservableNames: string[],
  uniqueRules: Record<string, string[]>,
  divergences: DivergencePoint[],
): RuleAttribution[] {
  if (divergences.length === 0) return [];

  const attributions: RuleAttribution[] = [];

  // Total divergence magnitude across all divergence points
  const totalDivergence = divergences.reduce(
    (acc, d) => acc + d.maxDifference,
    0,
  );

  if (totalDivergence === 0) return [];

  // For each variant that has unique rules, compute how much divergence
  // each of its unique rules is responsible for.
  for (const vr of variantResults) {
    const rules = uniqueRules[vr.name] ?? [];
    if (rules.length === 0) continue;

    // Compute total absolute divergence between base and this variant
    let variantTotalDiv = 0;
    const perObsDiv = new Map<string, number>();

    for (const obs of sharedObservableNames) {
      let obsDivergence = 0;
      const nRows = Math.min(
        baseResults.data.length,
        vr.results.data.length,
      );
      for (let i = 0; i < nRows; i++) {
        const baseVal = baseResults.data[i][obs] ?? 0;
        const varVal = vr.results.data[i]?.[obs] ?? 0;
        obsDivergence += Math.abs(baseVal - varVal);
      }
      perObsDiv.set(obs, obsDivergence);
      variantTotalDiv += obsDivergence;
    }

    // Distribute the variant's divergence evenly across its unique rules.
    // This is a simple proportional attribution when we cannot run
    // individual knockout simulations for every single rule.
    const perRuleContribution =
      rules.length > 0 ? variantTotalDiv / rules.length : 0;

    // Find the observable most affected by this variant
    let maxObsDivergence = 0;
    let dominantObservable = sharedObservableNames[0] ?? '';
    for (const [obs, div] of perObsDiv.entries()) {
      if (div > maxObsDivergence) {
        maxObsDivergence = div;
        dominantObservable = obs;
      }
    }

    // Determine which other variants contain vs lack each rule
    const allVariantNames = variantResults.map((v) => v.name);

    for (const rule of rules) {
      const presentIn: string[] = [vr.name];
      const absentFrom: string[] = [];

      for (const otherName of allVariantNames) {
        if (otherName === vr.name) continue;
        const otherRules = uniqueRules[otherName] ?? [];
        if (otherRules.includes(rule)) {
          presentIn.push(otherName);
        } else {
          absentFrom.push(otherName);
        }
      }

      const contribution =
        totalDivergence > 0 ? perRuleContribution / totalDivergence : 0;

      // Generate human-readable effect description
      const direction = variantTotalDiv > 0 ? 'alters' : 'has no effect on';
      const effectDescription =
        `Rule "${rule}" ${direction} ${dominantObservable}` +
        ` (contribution: ${(contribution * 100).toFixed(1)}% of total divergence)`;

      attributions.push({
        rule,
        presentIn,
        absentFrom,
        effectOnObservable: effectDescription,
        divergenceContribution: contribution,
      });
    }
  }

  // Sort by divergence contribution descending so the most impactful rules
  // appear first.
  attributions.sort((a, b) => b.divergenceContribution - a.divergenceContribution);
  return attributions;
}

// ---------------------------------------------------------------------------
// Variant generation
// ---------------------------------------------------------------------------

export interface GenerateVariantOptions {
  /** If true, also include the original (unmodified) model as a variant. */
  includeBase?: boolean;
}

/**
 * Given a base BNGL model code string, generate knockout variants by
 * commenting out one reaction rule at a time. Each variant has exactly one
 * rule commented out.
 */
export function generateVariants(
  baseCode: string,
  options?: GenerateVariantOptions,
): ModelVariant[] {
  const ruleLines = extractRuleLines(baseCode);
  const codeLines = baseCode.split(/\r?\n/);
  const variants: ModelVariant[] = [];

  if (options?.includeBase) {
    variants.push({ name: 'Base Model', code: baseCode });
  }

  for (const { line, index } of ruleLines) {
    const modifiedLines = [...codeLines];
    // Comment out the rule line by prefixing with '#'
    modifiedLines[index] = '# ' + modifiedLines[index];
    const variantCode = modifiedLines.join('\n');

    // Derive a short descriptive name from the rule
    // Attempt to extract rule name (e.g. "RuleName:" prefix) or use the
    // first ~60 chars of the rule text.
    const nameMatch = line.match(/^(\w+)\s*:/);
    const ruleName = nameMatch
      ? nameMatch[1]
      : line.length > 60
        ? line.substring(0, 57) + '...'
        : line;

    variants.push({
      name: `KO: ${ruleName}`,
      code: variantCode,
    });
  }

  return variants;
}

// ---------------------------------------------------------------------------
// Main comparison pipeline
// ---------------------------------------------------------------------------

/**
 * Compare multiple BNGL model variants by simulating each and computing
 * divergence metrics, then attributing divergences to specific rules.
 *
 * @param config      - Configuration specifying variants and options.
 * @param simulator   - Callback that simulates a BNGL code string.
 * @param onProgress  - Optional progress callback.
 * @returns           - A MultiModelResult with full comparison data.
 */
export async function compareModels(
  config: MultiModelConfig,
  simulator: SimulatorFn,
  onProgress?: (
    variantName: string,
    phase: 'parsing' | 'simulating' | 'analyzing',
  ) => void,
): Promise<MultiModelResult> {
  const threshold = config.divergenceThreshold ?? 0.1;
  const simOptions = config.simulationOptions ?? {};
  const variants = config.variants;

  if (variants.length === 0) {
    return {
      variants: [],
      divergences: [],
      firstDivergenceTime: null,
      attributions: [],
      sharedRules: [],
      uniqueRules: {},
    };
  }

  // --- Phase 1: Parse / classify rules ----------------------------------
  for (const v of variants) {
    onProgress?.(v.name, 'parsing');
  }

  const { shared, unique } = classifyRules(variants);

  // --- Phase 2: Simulate all variants sequentially -----------------------
  const simulatedVariants: Array<{ name: string; results: SimulationResults }> =
    [];

  for (const v of variants) {
    onProgress?.(v.name, 'simulating');
    const results = await simulator(v.code, simOptions);
    simulatedVariants.push({ name: v.name, results });
  }

  // --- Phase 3: Align time grids ----------------------------------------
  // Build a union of all time points, then interpolate every result set
  // onto that common grid.
  const timeColumns = simulatedVariants.map((sv) =>
    getTimeColumn(sv.results),
  );

  const allTimeSets = simulatedVariants.map((sv, idx) =>
    sv.results.data.map((row) => row[timeColumns[idx]]),
  );

  // Merge and sort all unique time values
  const timeSet = new Set<number>();
  for (const times of allTimeSets) {
    for (const t of times) {
      timeSet.add(t);
    }
  }
  const targetTimes = [...timeSet].sort((a, b) => a - b);

  // Interpolate each variant's results onto the common time grid
  const alignedVariants = simulatedVariants.map((sv) => ({
    name: sv.name,
    results: interpolateResults(sv.results, targetTimes),
  }));

  // --- Phase 4: Compute divergence --------------------------------------
  for (const v of variants) {
    onProgress?.(v.name, 'analyzing');
  }

  const obsNames = sharedObservables(
    alignedVariants.map((av) => av.results),
  );

  const divergences = computeDivergenceMetrics(
    alignedVariants,
    obsNames,
    threshold,
  );

  const firstDivergenceTime =
    divergences.length > 0 ? divergences[0].time : null;

  // --- Phase 5: Attribution ---------------------------------------------
  // Use the first variant as the "base" for attribution comparison.
  const baseResults = alignedVariants[0]?.results;
  const attributions =
    baseResults && divergences.length > 0
      ? attributeDivergence(
          baseResults,
          alignedVariants.slice(1),
          obsNames,
          unique,
          divergences,
        )
      : [];

  return {
    variants: alignedVariants,
    divergences,
    firstDivergenceTime,
    attributions,
    sharedRules: shared,
    uniqueRules: unique,
  };
}
