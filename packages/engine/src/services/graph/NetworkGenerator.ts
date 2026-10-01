interface ExtendedPerformance extends Performance {
  memory?: { usedJSHeapSize: number };
}

// graph/NetworkGenerator.ts
import { SpeciesGraph } from './core/SpeciesGraph';
import { Species } from './core/Species';
import { RxnRule } from './core/RxnRule';
import { Rxn } from './core/Rxn';
import { GraphCanonicalizer } from './core/Canonical';
import { GraphMatcher, clearMatchCache } from './core/Matcher';
import type { MatchMap } from './core/Matcher';
import { countEmbeddingDegeneracy, countRxnCenterImages } from './core/degeneracy';
import { Component } from './core/Component';
import { EnergyService } from './core/EnergyService';
import type { BNGLEnergyPattern, GeneratorProgress } from '../../types';
export type { GeneratorProgress } from '../../types';
import { Molecule } from './core/Molecule';
import { BNGLParser } from './core/BNGLParser';
import { filterIdenticalByRxnCenter } from './core/RxnRuleOps';
import { computeRuleDivisor } from './core/RuleStatFactor';

/**
 * Cap on the component assignments `countRxnCenterImages` will enumerate for one
 * (pattern, species, match) triple. It returns `null` when exceeded, and the
 * caller then falls back to the raw embedding count.
 */
const RXN_CENTER_IMAGE_BUDGET = 20000;

export class NetworkGenerationLimitError extends Error {
  constructor(
    message: string,
    public speciesCount?: number,
    public reactionCount?: number,
    public lastRule?: string
  ) {
    super(message);
    this.name = 'NetworkGenerationLimitError';
  }
}


function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

const patternSymmetryKeyCache = new WeakMap<SpeciesGraph, string>();

function getPatternSymmetryKey(pattern: SpeciesGraph): string {
  const cached = patternSymmetryKeyCache.get(pattern);
  if (cached !== undefined) return cached;

  let key: string;
  try {
    // Canonicalization removes incidental bond-label numbering differences
    // between otherwise identical reactant patterns (e.g. A(b!1)+A(b!2)).
    key = GraphCanonicalizer.canonicalize(pattern);
  } catch {
    key = pattern.toString();
  }

  patternSymmetryKeyCache.set(pattern, key);
  return key;
}

// Performance profiling - can be enabled dynamically
let profilingEnabled = false;

export function enableProfiling() {
  profilingEnabled = true;
  GraphMatcher.setProfilingEnabled(true);
}

export function disableProfiling() {
  profilingEnabled = false;
  GraphMatcher.setProfilingEnabled(false);
}

// Profiling counters
export const PROFILE_DATA = {
  canonicalize: 0,
  canonicalizeCount: 0,
  findAllMaps: 0,
  findAllMapsCount: 0,
  applyTransformation: 0,
  applyTransformationCount: 0,
  isDuplicateReaction: 0,
  isDuplicateReactionCount: 0,
  degeneracy: 0,
  degeneracyCount: 0,
  speciesDedup: 0,
  speciesDedupCount: 0,
  matchComponents: 0,
  matchComponentsCount: 0,
};

export function resetProfileData() {
  for (const key of Object.keys(PROFILE_DATA) as Array<keyof typeof PROFILE_DATA>) {
    (PROFILE_DATA[key] as number) = 0;
  }
  GraphMatcher.matchComponentsTime = 0;
  GraphMatcher.matchComponentsCount = 0;
}

const shouldLogNetworkGenerator =
  typeof process !== 'undefined' &&
  typeof process.env !== 'undefined' &&
  process.env.DEBUG_NETWORK_GENERATOR === 'true';

// Progress logging (like BNG2.pl's output)
const shouldLogProgress =
  typeof process !== 'undefined' &&
  typeof process.env !== 'undefined' &&
  (process.env.DEBUG_NETWORK_PROGRESS === 'true' || process.env.DEBUG_NETWORK_GENERATOR === 'true');

const debugNetworkLog = (...args: unknown[]) => {
  if (shouldLogNetworkGenerator) {
    console.log(...args);
  }
};

const progressLog = (...args: unknown[]) => {
  if (shouldLogProgress) {
    console.log(...args);
  }
};

// Profiled wrapper for canonicalize
function profiledCanonicalize(graph: SpeciesGraph): string {
  if (profilingEnabled) {
    const start = performance.now();
    const result = GraphCanonicalizer.canonicalize(graph);
    PROFILE_DATA.canonicalize += performance.now() - start;
    PROFILE_DATA.canonicalizeCount++;
    return result;
  }
  return GraphCanonicalizer.canonicalize(graph);
}

// Profiled wrapper for findAllMaps
function profiledFindAllMaps(pattern: SpeciesGraph, target: SpeciesGraph, options: { symmetryBreaking?: boolean } = {}): MatchMap[] {
  if (profilingEnabled) {
    const start = performance.now();
    const result = GraphMatcher.findAllMaps(pattern, target, options);
    PROFILE_DATA.findAllMaps += performance.now() - start;
    PROFILE_DATA.findAllMapsCount++;
    return result;
  }
  const result = GraphMatcher.findAllMaps(pattern, target, options);
  return result;
}

function profiledFindFirstMap(pattern: SpeciesGraph, target: SpeciesGraph, options: { symmetryBreaking?: boolean } = {}): MatchMap | null {
  if (profilingEnabled) {
    const start = performance.now();
    const result = GraphMatcher.findFirstMap(pattern, target, options);
    PROFILE_DATA.findAllMaps += performance.now() - start;
    PROFILE_DATA.findAllMapsCount++;
    return result;
  }
  return GraphMatcher.findFirstMap(pattern, target, options);
}

// Profiled wrapper for degeneracy
function profiledDegeneracy(pattern: SpeciesGraph, target: SpeciesGraph, match: MatchMap): number {
  if (profilingEnabled) {
    const start = performance.now();
    const result = countEmbeddingDegeneracy(pattern, target, match);
    PROFILE_DATA.degeneracy += performance.now() - start;
    PROFILE_DATA.degeneracyCount++;
    return result;
  }
  return countEmbeddingDegeneracy(pattern, target, match);
}

/**
 * Determine if degeneracy should be used as a statistical factor for the reaction rate.
 * 
 * This applies in BAB-like scenarios where:
 * - The pattern specifies fewer constrained components than the target molecule has
 * - Example (bound): pattern A(b!1) matching target A(b!1,b!2)
 * - Example (unbound): pattern A(b,b!?) matching target A(b,b)
 * 
 * This should NOT apply for cases like LRR dimer where the pattern fully covers the target.
 */
function shouldApplyDegeneracyStatFactor(pattern: SpeciesGraph, target: SpeciesGraph, match: MatchMap): boolean {

  for (const [pMolIdx, tMolIdx] of match.moleculeMap.entries()) {
    const pMol = pattern.molecules[pMolIdx];
    const tMol = target.molecules[tMolIdx];
    if (!pMol || !tMol) continue;

    // Count constrained bound components with same name in pattern and target.
    // Group by component name since symmetry is within same-named components.
    const pBoundByName = new Map<string, number>();
    const tBoundByName = new Map<string, number>();
    // Count constrained unbound components (exclude wildcard '?', which is unconstrained).
    const pUnboundByName = new Map<string, number>();
    const tUnboundByName = new Map<string, number>();

    for (const comp of pMol.components) {
      if (comp.edges.size > 0 || comp.wildcard === '+') {
        pBoundByName.set(comp.name, (pBoundByName.get(comp.name) ?? 0) + 1);
      } else if (comp.wildcard !== '?') {
        pUnboundByName.set(comp.name, (pUnboundByName.get(comp.name) ?? 0) + 1);
      }
    }

    for (const comp of tMol.components) {
      if (comp.edges.size > 0) {
        tBoundByName.set(comp.name, (tBoundByName.get(comp.name) ?? 0) + 1);
      } else {
        tUnboundByName.set(comp.name, (tUnboundByName.get(comp.name) ?? 0) + 1);
      }
    }

    // If target has more bound components of any type than pattern specifies,
    // then degeneracy represents valid multiplicity (BAB-like case)
    for (const [compName, pCount] of pBoundByName.entries()) {
      const tCount = tBoundByName.get(compName) ?? 0;
      if (tCount > pCount) {
        return true;
      }
    }

    // Likewise for constrained unbound components (free-site multiplicity).
    for (const [compName, pCount] of pUnboundByName.entries()) {
      const tCount = tUnboundByName.get(compName) ?? 0;
      if (tCount > pCount) {
        return true;
      }
    }

  }

  return false;
}

function computeWildcardBoundStatFactor(pattern: SpeciesGraph, target: SpeciesGraph, match: MatchMap): number {
  let factor = 1;

  for (const [pMolIdx, tMolIdx] of match.moleculeMap.entries()) {
    const pMol = pattern.molecules[pMolIdx];
    const tMol = target.molecules[tMolIdx];
    if (!pMol || !tMol) continue;

    const wildcardByName = new Map<string, number>();
    for (const comp of pMol.components) {
      if (comp.wildcard === '+') {
        wildcardByName.set(comp.name, (wildcardByName.get(comp.name) ?? 0) + 1);
      }
    }

    for (const [compName, wildcardCount] of wildcardByName.entries()) {
      if (wildcardCount <= 0) continue;

      let targetBoundCount = 0;
      for (const comp of tMol.components) {
        if (comp.name === compName && comp.edges.size > 0) {
          targetBoundCount++;
        }
      }

      if (targetBoundCount > 1) {
        factor = Math.max(factor, targetBoundCount);
      }
    }
  }

  return factor;
}



/**
 * Identity of a reaction for duplicate detection.
 *
 * BNG2 does not key on the originating rule: `RxnList.pm` keys on
 * `Rxn->stringID()` — the sorted species indices alone — and merges only when
 * `RateLaw::equivalent` says the two rate laws agree, summing the stat factor.
 * Two different rules that transform the same species pair with the same rate
 * are therefore ONE reaction in BNG2.
 *
 * We keyed on the rule name, so those cross-rule duplicates were emitted
 * separately and the reaction count came out high even though the unique
 * reaction set matched. Use the normalised rate law instead, falling back to the
 * rule name only when a rule has no usable rate.
 *
 * A rate that is a bare number is the exception. `RateLaw::equivalent` compares
 * the rate law's *constants* by parameter name, and BNG2 mints one auto-named
 * parameter per rule for a constant rate — `complexdegradation` writes
 * `_rateLaw1` … `_rateLaw5`, five distinct names for five rules whose rate is
 * all `1`. Those never compare equal, so `A(b) -> 0 1` and `A() -> 0 1` are two
 * reactions in BNG2. A numeric rate is therefore scoped to its rule; a rate that
 * names a parameter or function is shared, because there the parameter name is
 * what `equivalent` compares and it is the same name for every rule.
 */
function rateIdentity(ruleName: string, rateExpression?: string, rate?: number): string {
  const expr = rateExpression?.trim();
  // No identifier in the expression: a literal rate, parameterised per rule.
  const isLiteralRate = (e: string): boolean => !/[A-Za-z_]/.test(e);
  if (expr) {
    const normalised = expr.replace(/\s+/g, '');
    return isLiteralRate(normalised) ? `${ruleName}:${normalised}` : normalised;
  }
  if (typeof rate === 'number' && Number.isFinite(rate)) return `${ruleName}:${rate}`;
  return ruleName;
}

/**
 * Generate a reaction key for fast duplicate detection.
 * Uses sorted reactant and product indices for canonical comparison.
 */
function getReactionKey(reactants: number[], products: number[], ruleName: string): string {
  return `${reactants.slice().sort().join(',')}:${products.slice().sort().join(',')}:${ruleName}`;
}

function getReactionKeyWithOrderMode(
  reactants: number[],
  products: number[],
  ruleName: string,
  preserveOrder: boolean
): string {
  if (preserveOrder) {
    return `${reactants.join(',')}:${products.join(',')}:${ruleName}`;
  }
  return getReactionKey(reactants, products, ruleName);
}

/**
 * Reaction identity key that does not depend on species indices.
 *
 * BNG2 canonicalises species graphs before deciding whether two reactions are
 * the same: bond labels (`!1`, `!2`) are arbitrary names, so a reaction that
 * differs from another only in bond numbering is a duplicate. The index-based
 * key cannot see that, because each relabelling yields a different species and
 * therefore a different index, so those duplicates were kept.
 *
 * Normalising the label numbers into a hash is equivalent to BNG2's pairwise
 * reaction-centre comparison, but O(1) per reaction rather than O(N^2).
 */
function canonicalSpeciesKey(graph: SpeciesGraph | undefined): string {
  if (!graph) return '?';
  return graph.toString().replace(/!(\d+)/g, '!');
}

function canonicalReactionKey(
  reactants: number[],
  products: number[],
  identity: string,
  speciesList: Species[]
): string {
  const key = (idx: number): string => canonicalSpeciesKey(speciesList[idx]?.graph);
  const r = reactants.map(key).sort().join('+');
  const p = products.map(key).sort().join('+');
  return `${r}->${p}:${identity}`;
}

function mergeRateExpressions(existingExpr?: string, incomingExpr?: string): string | undefined {
  if (!existingExpr) return incomingExpr;
  if (!incomingExpr) return existingExpr;
  return `(${existingExpr}) + (${incomingExpr})`;
}

function normalizeRateExpressionForMerge(expr: string): string {
  return expr.replace(/\s+/g, '');
}

function getSafeStatFactor(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return v;
}

function isIdentityReactionBySpeciesIndices(reactants: number[], products: number[]): boolean {
  if (reactants.length !== products.length) return false;
  const left = reactants.slice().sort((a, b) => a - b);
  const right = products.slice().sort((a, b) => a - b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/**
 * True when the reaction maps each reactant species onto an identical product
 * species, compared by species graph rather than by index.
 *
 * Rule application frequently renumbers bonds and re-orders molecules, so the
 * same species can appear under a different index on each side. Comparing
 * indices alone misses those, and the no-op reaction is then emitted as a real
 * reaction — inflating the network (Barua_2007 produced 296 of them) with
 * reactions that change nothing and that BNG2 does not generate.
 */
function isIdentityReactionByGraph(
  reactants: number[],
  products: number[],
  speciesList: Species[]
): boolean {
  if (reactants.length !== products.length) return false;
  const graphKey = (idx: number): string | undefined => speciesList[idx]?.graph?.toString();
  const left = reactants.map(graphKey).sort();
  const right = products.map(graphKey).sort();
  if (left.some((k) => k === undefined) || right.some((k) => k === undefined)) {
    // Species unavailable: fall back to index comparison.
    return isIdentityReactionBySpeciesIndices(reactants, products);
  }
  return left.every((k, i) => k === right[i]);
}

function foldRateExpressionWithStatFactor(expr: string | undefined, statFactor: number | undefined): string | undefined {
  if (!expr) return undefined;
  const sf = typeof statFactor === 'number' && Number.isFinite(statFactor) ? statFactor : 1;
  if (Math.abs(sf - 1) < 1e-15) return expr;
  return `(${sf})*(${expr})`;
}

function mergeReactionExpressionWithStatFactors(existingRxn: Rxn, incomingRxn: Rxn): void {
  if (!shouldMergeExpressionMultiplicity(existingRxn, incomingRxn)) return;

  const existingExprRaw = existingRxn.rateExpression?.trim();
  const incomingExprRaw = incomingRxn.rateExpression?.trim();
  const bothHaveExpr = !!existingExprRaw && !!incomingExprRaw;
  if (
    bothHaveExpr &&
    normalizeRateExpressionForMerge(existingExprRaw || "") === normalizeRateExpressionForMerge(incomingExprRaw || "")
  ) {
    existingRxn.rateExpression = existingExprRaw;
    existingRxn.statFactor = getSafeStatFactor(existingRxn.statFactor) + getSafeStatFactor(incomingRxn.statFactor);
    return;
  }

  const existingExpr = foldRateExpressionWithStatFactor(existingRxn.rateExpression, existingRxn.statFactor);
  const incomingExpr = foldRateExpressionWithStatFactor(incomingRxn.rateExpression, incomingRxn.statFactor);
  existingRxn.rateExpression = mergeRateExpressions(existingExpr, incomingExpr);
  existingRxn.statFactor = 1;
}

function shouldMergeExpressionMultiplicity(existingRxn: Rxn, incomingRxn: Rxn): boolean {
  if (!existingRxn.rateExpression || !incomingRxn.rateExpression) return false;
  if (existingRxn.rate !== 0 || incomingRxn.rate !== 0) return true;

  // In symmetric unimolecular collapse/degradation outcomes, duplicate embeddings can
  // correspond to the same physical event and should not be summed symbolically.
  if (incomingRxn.reactants.length === 1) {
    if (incomingRxn.products.length === 0) return false;
    if (incomingRxn.products.length > 1) {
      const first = incomingRxn.products[0];
      const allSame = incomingRxn.products.every((p) => p === first);
      if (allSame) return false;
    }
  }

  return true;
}

export interface CompartmentInfo {
  name: string;
  dimension: number;  // 2 for surface, 3 for volume
  size: number;       // evaluated volume/area
  parent?: string;    // enclosing compartment (for adjacency checks)
}

export interface GeneratorOptions {
  maxSpecies: number;
  maxReactions: number;
  maxIterations: number;
  maxAgg: number;
  maxStoich: number | Record<string, number> | Map<string, number>;  // Can be a single number or per-molecule-type limits
  checkInterval: number;
  memoryLimit: number;
  compartments?: CompartmentInfo[];  // Compartment definitions for volume scaling
  energyPatterns?: BNGLEnergyPattern[]; // NEW: Energy patterns for Arrhenius rate laws
  parameters?: Map<string, number>; // For evaluating Arrhenius expressions
}

interface PureStateChangeDelta {
  reactantComponentIndex: number;
  componentName: string;
  fromState: string;
  toState: string;
}

interface PureStateChangePlan {
  deltas: PureStateChangeDelta[];
  // Plain product components are interpreted as explicitly unbound by the
  // general builder when their matched target site is bound. The shortcut can
  // only preserve topology when those sites are actually unbound at runtime.
  requiresUnboundTarget: Array<{
    reactantComponentIndex: number;
    componentName: string;
  }>;
}


/**
 * How a rule's reactant molecules line up with its product molecules, in both
 * directions, plus the global-index offset of each pattern.
 *
 * `reactantOffsets[r]` is the global reactant molecule index at which reactant
 * pattern `r` starts, so a (patternIdx, molIdx) pair converts to the global index
 * the maps are keyed on via `reactantOffsets[patternIdx] + molIdx`. The same holds
 * for `productOffsets`. A molecule with no counterpart — deleted by
 * DeleteMolecules, or a name with fewer copies on the other side — is absent from
 * both maps.
 */
interface RuleMoleculeCorrespondence {
  reactantOffsets: number[];
  productOffsets: number[];
  /** global reactant molecule index -> global product molecule index */
  reactantToProduct: Map<number, number>;
  /** global product molecule index -> global reactant molecule index */
  productToReactant: Map<number, number>;
}


export class NetworkGenerator {
  private options: GeneratorOptions;
  // NEW: map Molecule name -> set of species indices that contain that molecule
  private speciesByMoleculeIndex: Map<string, Set<number>> = new Map();
  // Bond-free graphs have no lost topology in the structural description, so
  // their structural hash is safe to reuse as canonical identity.
  private structuralHashMap: Map<string, string> = new Map();
  // NEW: map Compartment name -> Size (for volume scaling)
  private compartmentVolumes: Map<string, number> = new Map();
  private compartmentMap: Map<string, CompartmentInfo> = new Map();
  // Parsed observable-pattern graphs for local-function (%x::) rate evaluation.
  // Keyed by pattern string: parseSpeciesGraph is pure, so a cached graph is
  // identical to a fresh parse, and reusing the same graph object lets the
  // GraphMatcher's identity-keyed result cache hit across reactant species.
  private localFnPatternGraphCache: Map<string, SpeciesGraph> = new Map();
  // NEW: map Canonical Name -> Initial Concentration (from seed parameter evaluation)
  private seedConcentrationMap?: Map<string, number>;

  // OPT #5: cache the rule-invariant metadata computed in applyNaryRule so it is
  // built once per rule instead of once per (species, rule) application. Keyed on
  // the rule object (stable for the lifetime of a generation), so it auto-evicts
  // when rules are recreated.
  private naryRuleMetaCache: WeakMap<RxnRule, {
    matchSymmetryBreaking: boolean;
    carryThroughPatternIndices: Set<number>;
    applyCarryThroughAnchorSkip: boolean;
    identicalPatternGroups: Map<string, number[]>;
  }> = new WeakMap();
  // A rule object is immutable during generation. Cache both successful plans
  // and conservative rejections so the structural proof is paid once per rule.
  private pureStateChangePlanCache: WeakMap<RxnRule, PureStateChangePlan | null> = new WeakMap();
  // Which product molecule each reactant-pattern molecule corresponds to, keyed on
  // `globalReactantMolIdx`. BNG2 reaction rules keep the two molecule lists in
  // correspondence: the n-th reactant molecule of a given name is the image of the
  // n-th product molecule of that name. Cached because a rule is immutable during
  // generation. See matchRespectsProductImpliedFreeConstraints.
  private productCorrespondenceCache: WeakMap<RxnRule, RuleMoleculeCorrespondence> = new WeakMap();

  private startTime: number = 0;
  private lastMemoryCheck: number = 0;
  private aggLimitWarnings = 0;
  private speciesLimitWarnings = 0;
  private currentRuleName: string | null = null;
  private currentSpeciesList: Species[] = [];
  private currentReactionsList: Rxn[] = [];
  /** Reaction identity keyed by canonical species graphs (BNG2-equivalent dedup). */
  private canonicalReactionIndex = new Map<string, number>();
  private energyService?: EnergyService;

  constructor(options: Partial<GeneratorOptions> & { seedConcentrationMap?: Map<string, number> } = {}) {
    this.options = {
      maxSpecies: 10000,
      maxReactions: 100000,
      maxIterations: 100,
      maxAgg: 500,
      maxStoich: 500,
      checkInterval: 500,
      memoryLimit: 1e9,
      ...options
    };
    this.seedConcentrationMap = options.seedConcentrationMap;

    if (this.options.compartments) {
      for (const c of this.options.compartments) {
        this.compartmentVolumes.set(c.name, c.size);
        this.compartmentMap.set(c.name, c);
      }
    }
    if (this.options.energyPatterns) {
      this.energyService = new EnergyService(this.options.energyPatterns);
    }
    this.currentRuleName = null;
  }

  /**
   * Helper: Evaluate a parameter expression safely.
   */
  private evaluateArrheniusParam(expr: string | undefined, defaultValue: number = 0): number {
    if (!expr) return defaultValue;
    // Use Number() for strict check (parseFloat parses "1 - phi" as 1)
    const val = Number(expr);
    if (!isNaN(val)) return val;

    if (this.options.parameters) {
      try {
        return BNGLParser.evaluateExpression(expr, this.options.parameters);
      } catch (e) {
        console.warn('[NetworkGenerator] Failed to evaluate Arrhenius param expression: %s', expr, e);
        return this.options.parameters.get(expr) ?? defaultValue;
      }
    }
    return defaultValue;
  }

  /**
   * BNG2 local function evaluation for %x:: rules.
   *
   * For rules like: %x::A() -> %x::A() + C()  f_synth(x)
   * where f_synth(x) = k_synthC*(AB_motif(x))^2
   * BNG2 evaluates AB_motif(x) as the count of the AB_motif pattern WITHIN the
   * specific reactant species x (not the global observable value).  This gives
   * a per-species constant rate (e.g., __R1_local1 = k_synthC*(0^2) for unbound A,
   * __R1_local2 = k_synthC*(1^2) for A bound to one B, etc.).
   *
   * @returns The numeric rate for this specific reactant, or null if evaluation fails.
   */
  private evaluateLocalFunctionForSpecies(
    reactantGraph: SpeciesGraph,
    localFnCtx: { observablePatterns: Array<{ name: string; pattern: string }>; bodyTemplate: string }
  ): number | null {
    try {
      const obsValues = new Map<string, number>();
      for (const obsEntry of localFnCtx.observablePatterns) {
        const obsName = obsEntry.name;
        const obsPat = obsEntry.pattern;
        // Parse the observable pattern and count how many times it embeds in the reactant species.
        // Cache the parsed graph per pattern string (parse is pure); this also lets the
        // GraphMatcher's pattern-identity result cache hit across reactant species.
        let patGraph = this.localFnPatternGraphCache.get(obsPat);
        if (patGraph === undefined) {
          patGraph = BNGLParser.parseSpeciesGraph(obsPat);
          this.localFnPatternGraphCache.set(obsPat, patGraph);
        }
        const maps = GraphMatcher.findAllMaps(patGraph, reactantGraph, {
          allowExtraTargetBonds: false,
          symmetryBreaking: false,
        });
        let total = 0;
        for (const map of maps) {
          const d = countEmbeddingDegeneracy(patGraph, reactantGraph, map);
          total += Number.isFinite(d) && d > 0 ? d : 1;
        }
        obsValues.set(obsName, total);
      }

      // Substitute observable counts into the function body template.
      let localExpr = localFnCtx.bodyTemplate;
      for (const [obsName, obsVal] of obsValues.entries()) {
        const escapedName = obsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        localExpr = localExpr.replace(new RegExp(`\\b${escapedName}\\b`, 'g'), String(obsVal));
      }

      // Evaluate the resulting expression using the model's parameter values.
      if (!this.options.parameters) return null;
      const result = BNGLParser.evaluateExpression(localExpr, this.options.parameters);
      return Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }


  /**
   * Helper: Get the effective compartment name for a species or graph.
   */
  private getSpeciesCompartment(s: Species | SpeciesGraph): string | null {
    const graph = (s instanceof Species) ? s.graph : s;
    if (graph.compartment) return graph.compartment;

    // Fallback: check molecules. In cBNGL, a species spanning multiple compartments
    // is assigned to the compartment with the LOWEST dimension (e.g., surface).
    const molCompartments = graph.molecules
      .map(m => m.compartment)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);

    if (molCompartments.length === 0) return null;

    if (this.options.compartments) {
      let bestComp: string = molCompartments[0];
      let minDim = 99;

      for (const cName of molCompartments) {
        const comp = this.compartmentMap.get(cName);
        const dim = comp ? comp.dimension : 3;
        if (dim < minDim) {
          minDim = dim;
          bestComp = cName;
        }
      }
      return bestComp;
    }

    return molCompartments[0] ?? null;
  }

  /**
   * Helper: Get the evaluated size (volume/area) of a species' compartment.
   */
  private _getSpeciesVolume(s: Species | SpeciesGraph): number {
    const cName = this.getSpeciesCompartment(s);
    if (!cName || !this.options.compartments) return 1;
    const comp = this.compartmentMap.get(cName);
    return (comp && comp.size > 0) ? comp.size : 1;
  }

  /**
   * Calculate volume scaling info for reactions.
   * Mirrors BNG2 Rxn.pm anchor logic:
   * - Prefer anchoring to a 3D compartment when available.
   * - Fall back to a 2D surface compartment when no 3D reactant compartment exists.
   * - For zero-order synthesis (no reactants), anchor to the product compartment.
   */
  private getVolumeScalingInfo(reactants: Species[], products: Species[] = []): { scale: number; scalingVolume: number } {
    if (!this.options.compartments || this.options.compartments.length === 0) {
      return { scale: 1, scalingVolume: 1 };
    }

    const pickAnchorVolume = (candidates: Species[]): number => {
      // Prefer 3D anchor volumes; only use 2D surface anchors when no 3D candidate exists.
      const surfaceVolumes: number[] = [];
      const volumeVolumes: number[] = [];

      for (const species of candidates) {
        const compName = this.getSpeciesCompartment(species);
        if (!compName) continue;
        const comp = this.compartmentMap.get(compName);
        if (!comp) continue;
        const size = comp.size > 0 ? comp.size : 1;
        if (comp.dimension === 2) surfaceVolumes.push(size);
        else volumeVolumes.push(size); // dimension 3 or undefined
      }

      if (volumeVolumes.length > 0) return volumeVolumes[0];
      if (surfaceVolumes.length > 0) return surfaceVolumes[0];
      return 1;
    };

    const anchorVolume = reactants.length > 0
      ? pickAnchorVolume(reactants)
      : pickAnchorVolume(products);

    const dimOf = (s: Species): number => {
      const compName = this.getSpeciesCompartment(s);
      if (!compName) return 3;
      const comp = this.compartmentMap.get(compName);
      return comp?.dimension ?? 3;
    };

    // Mixed 3D/2D bimolecular reactions: keep k in native units and let the
    // simulation RHS handle anchor-volume normalization.
    let has2D = false;
    let has3D = false;
    for (const r of reactants) {
      const d = dimOf(r);
      if (d === 2) has2D = true;
      else has3D = true;
    }
    if (reactants.length > 1 && has2D && has3D) {
      return { scale: 1, scalingVolume: anchorVolume };
    }

    return { scale: 1 / anchorVolume, scalingVolume: anchorVolume };
  }

  /**
   * Helper: Check if two compartments are adjacent (share a boundary) or identical.
   * In BNGL, a 2D compartment is adjacent to its 3D parent and possible 3D children.
   */
  private _areAdjacent(comp1Name: string | null, comp2Name: string | null): boolean {
    if (comp1Name === comp2Name) return true;
    if (!comp1Name || !comp2Name) return true; // Default/null compartments can interact? 

    if (!this.options.compartments) return true;

    const c1 = this.compartmentMap.get(comp1Name);
    const c2 = this.compartmentMap.get(comp2Name);

    if (!c1 || !c2) return true;

    // Check parent-child relationship
    if (c1.parent === c2.name || c2.parent === c1.name) return true;

    // Siblings might be adjacent if they share a surface, but BNGL usually requires 
    // one to be the parent (Volume) of the other (Surface).

    return false;
  }





  private areCompartmentsAdjacent(comp1Name: string | null, comp2Name: string | null): boolean {
    // If either is null/undefined, can't check adjacency - allow (for backward compatibility)
    if (!comp1Name || !comp2Name) return true;

    // Same compartment is always OK
    if (comp1Name === comp2Name) return true;

    // No compartments defined in model - allow
    if (!this.options.compartments || this.options.compartments.length === 0) return true;

    const comp1 = this.compartmentMap.get(comp1Name);
    const comp2 = this.compartmentMap.get(comp2Name);

    // If compartments not found, allow (backward compatibility)
    if (!comp1 || !comp2) return true;

    // Check if comp1 is parent of comp2, or comp2 is parent of comp1
    return comp1.parent === comp2Name || comp2.parent === comp1Name;
  }

  /**
   * Check if a set of species form an "interacting set" for bimolecular reactions.
   * BNG2: SpeciesGraph::interactingSet
   * 
   * Rules:
   * 1. All surface (2D) compartments must be the same
   * 2. All volume (3D) compartments must be the same  
   * 3. If there's both surface and volume, they must be adjacent
   */
  private isInteractingSet(reactant1: Species, reactant2: Species): boolean {
    if (!this.options.compartments || this.options.compartments.length === 0) {
      return true;  // No compartments defined, allow all
    }

    const comp1Name = this.getSpeciesCompartment(reactant1);
    const comp2Name = this.getSpeciesCompartment(reactant2);

    // If either has no compartment, allow (sloppy mode)
    if (!comp1Name || !comp2Name) return true;

    const comp1 = this.compartmentMap.get(comp1Name);
    const comp2 = this.compartmentMap.get(comp2Name);

    // If compartments not found in definitions, allow
    if (!comp1 || !comp2) return true;

    // Same compartment - always OK
    if (comp1Name === comp2Name) return true;

    // Both surfaces (2D) - must be the same (already checked above, so return false)
    if (comp1.dimension === 2 && comp2.dimension === 2) {
      return false;  // Different surfaces can't interact
    }

    // Both volumes (3D) - must be the same (already checked above, so return false)
    if (comp1.dimension === 3 && comp2.dimension === 3) {
      return false;  // Different volumes can't interact
    }

    // One surface, one volume - must be adjacent
    return this.areCompartmentsAdjacent(comp1Name, comp2Name);
  }

  /**
   * Generates a complete or bounded reaction network from seed species and reaction rules.
   *
   * Replicating the core network expansion algorithm of BioNetGen (equivalent to BNG2's generate_network action),
   * this method executes the following steps:
   * 1. **Initialization & Cache Reset**: Resets generation start times, clears inverted species lookup maps,
   *    structural hash maps, and global match caches.
   * 2. **Seed Injection**: Canonicalizes and registers seed species, adding them to the reactive processing queue.
   * 3. **Zero-Order Synthesis**: Processes rules with zero reactants to immediately produce initial species and
   *    synthesis reactions.
   * 4. **Iterative Expansion Queue**: Iterates until the queue is empty or limits are hit. In each iteration:
   *    - Pulls a batch of species from the queue and computes their canonical keys.
   *    - Applies unimolecular and N-ary reaction rules to discover new reactions and species.
   *    - Emits periodic progress callbacks with current network statistics.
   * 5. **Unimolecular Rule Application**: Matches unimolecular rule patterns against targets, checks exclude/include
   *    constraints, resolves product-implied free site constraints, and handles symmetry-equivalent embeddings via
   *    stable event-signature deduplication. Translates collapsed symmetries into exact statistical rate factors.
   * 6. **N-ary (Bimolecular/Multimer) Application**: Recursively searches for reactant partners. Employs a canonical
   *    anchor-species check to prevent double counting, applies spectator-corrected combinatorial multipliers for
   *    selective equivalent site bonding, and maps products.
   * 7. **Rule Transformation**: Clones molecules, resolves bonds, and executes state or compartment changes. Supports
   *    `DeleteMolecules` and whole-species deletion, selective orphan/bystander harvesting to preserve unmapped fragments,
   *    and propagates `MoveConnected` transitions across connected complexes.
   * 8. **Compartment Adjacency Validation**: Verifies that newly formed bonds only span identical or adjacent compartments,
   *    rejecting invalid trans-compartmental product topologies.
   * 9. **Resource Constraint Monitoring**: Safeguards the execution context by throwing error limits or gracefully
   *    returning partial networks if max species, max reactions, max iterations, max complex size, or JS heap memory limits are exceeded.
   *
   * Invariants:
   * - **Browser-API-Free**: This function relies on zero browser or DOM APIs and is fully compatible with server-side Node.js, Web Worker, and headless MCP contexts.
   *
   * @param seedSpecies - The initial species graphs to populate the network.
   * @param rules - The reaction rules (with defined rate constants, reactants, products, and constraints) to expand.
   * @param onProgress - Optional callback invoked periodically with current generation metrics.
   * @param signal - Optional AbortSignal to cancel the network generation.
   * @returns A promise resolving to an object containing arrays of generated Species and Rxn reactions.
   * @throws {NetworkGenerationLimitError} If species, reaction, iteration, or memory thresholds are breached.
   */
  async generate(
    seedSpecies: SpeciesGraph[],
    rules: RxnRule[],
    onProgress?: (progress: GeneratorProgress) => void,
    signal?: AbortSignal
  ): Promise<{ species: Species[]; reactions: Rxn[] }> {

    this.startTime = Date.now();
    this.lastMemoryCheck = this.startTime;
    this.aggLimitWarnings = 0;

    this.speciesLimitWarnings = 0;
    this.currentRuleName = null;

    // Reset inverted index and caches
    this.speciesByMoleculeIndex.clear();
    this.structuralHashMap.clear();
    this.pureStateChangePlanCache = new WeakMap();
    clearMatchCache();

    const speciesMap = new Map<string, Species>();
    const speciesList: Species[] = [];
    const reactionsList: Rxn[] = [];
    this.currentSpeciesList = speciesList;
    this.currentReactionsList = reactionsList;
    const reactionIndexByKey = new Map<string, number>();
    // Canonical (bond-label independent) reaction identity, mirroring BNG2.
    this.canonicalReactionIndex = new Map<string, number>();
    const queue: Species[] = [];
    const reactiveRules = rules.filter(r => r.reactants.length > 0);
    const synthesisRules = rules.filter(r => r.reactants.length === 0);

    // Initialize with seed species
    for (const sg of seedSpecies) {
      this.addOrGetSpecies(sg, speciesMap, speciesList, queue, signal);
    }

    // Handle synthesis rules (0 -> X) - add products directly
    // These are zero-order reactions that produce species regardless of existing species
    for (const rule of synthesisRules) {
      debugNetworkLog(`[NetworkGenerator] Processing synthesis rule: ${rule.name}`);

      // Add each product species and retrieve its index directly
      const productIndices = rule.products.map(productGraph => {
        const sp = this.addOrGetSpecies(productGraph, speciesMap, speciesList, queue, signal);
        return sp.index;
      });

      const productSpeciesList = productIndices.map(idx => speciesList[idx]);
      const { scalingVolume } = this.getVolumeScalingInfo([], productSpeciesList);

      const rxn = new Rxn([], productIndices, rule.rateConstant, rule.name, {
        statFactor: 1,
        rateExpression: rule.rateExpression,
        scalingVolume
      });

      const rxnKey = getReactionKey(rxn.reactants, rxn.products, rateIdentity(rule.name, rxn.rateExpression, rxn.rate));
      const existingIdx = reactionIndexByKey.get(rxnKey);
      if (existingIdx === undefined) {
        reactionIndexByKey.set(rxnKey, reactionsList.length);
        reactionsList.push(rxn);
      } else {
        reactionsList[existingIdx].rate += rxn.rate;
        if (shouldMergeExpressionMultiplicity(reactionsList[existingIdx], rxn)) {
          reactionsList[existingIdx].rateExpression = mergeRateExpressions(
            reactionsList[existingIdx].rateExpression,
            rxn.rateExpression
          );
        }
      }

      debugNetworkLog(`[NetworkGenerator] Added synthesis reaction: 0 -> [${productIndices.join(', ')}]`);
    }

    let iteration = 0;
    let lastLoggedSpeciesCount = speciesList.length;
    const logInterval = 50; // Log every 50 new species
    let lastProgressCallback = onProgress ? Date.now() : 0;

    progressLog(`[NetworkGenerator] Starting with ${speciesList.length} seed species, ${rules.length} rules`);

    try {
      // BNG2-style iteration: process all current species in the queue per iteration
      while (queue.length > 0 && iteration < this.options.maxIterations) {
        if (signal?.aborted) {
          throw new DOMException('Network generation cancelled', 'AbortError');
        }
        this.checkResourceLimits(signal);
        iteration++;

        // Take a snapshot of the current queue - this is one "iteration" in BNG2 terms
        const batchSize = queue.length;

        // Progress logging like BNG2.pl
        if (speciesList.length >= lastLoggedSpeciesCount + logInterval) {
          const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
          progressLog(`[NetworkGenerator] Iter ${iteration}: ${speciesList.length} species, ${reactionsList.length} reactions, batch=${batchSize} (${elapsed}s)`);
          lastLoggedSpeciesCount = speciesList.length;
        }

        // Process all species in the current batch
        for (let batchIdx = 0; batchIdx < batchSize; batchIdx++) {
          const currentSpeciesObj = queue[batchIdx];



          if (shouldLogNetworkGenerator) {
            debugNetworkLog(
              `[NetworkGenerator] Iter ${iteration}, Species ${currentSpeciesObj.index}: ${currentSpeciesObj.graph
                .toString()
                .slice(0, 100)}`
            );
          }

          // Apply each reactive rule to current species
          for (let ruleIdx = 0; ruleIdx < reactiveRules.length; ruleIdx++) {
            const rule = reactiveRules[ruleIdx];
            if (signal?.aborted) {
              throw new DOMException('Network generation cancelled', 'AbortError');
            }

            this.currentRuleName = rule.name;
            // Debug: Print rule dispatch info (reactant count and types)
            if (shouldLogNetworkGenerator) {
              const reactantInfo = (rule.reactants || [])
                .map((reactant: unknown, index: number) => {
                  const reactantType =
                    reactant && typeof reactant === 'object' && 'constructor' in reactant && (reactant as { constructor?: { name: string } }).constructor
                      ? reactant.constructor.name
                      : typeof reactant;
                  const reactantText = reactant?.toString?.() ?? String(reactant);
                  return `${index}:${reactantText}[${reactantType}]`;
                })
                .join(' | ');
              debugNetworkLog(
                `[NetworkGenerator] Rule dispatch idx=${ruleIdx} name=${rule.name ?? '<unnamed>'} reactants=${rule.reactants.length} :: ${reactantInfo}`
              );
            }

            if (rule.reactants.length === 1) {
              // Unimolecular rule
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(
                  `[applyUnimolecularRule] Applying unimolecular rule with reactant pattern: ${rule.reactants[0].toString()}`
                );
              }
              await this.applyUnimolecularRule(
                rule,
                currentSpeciesObj,
                speciesMap,
                speciesList,
                queue,
                reactionsList,
                reactionIndexByKey,
                signal
              );
            } else if (rule.reactants.length > 1) {
              // N-ary rule (Bimolecular, Ternary, etc.)
              // NEW: We must try matching currentSpecies against EVERY reactant pattern
              // to ensure we find all combinations (e.g. catalyst already exists, substrate is new).
              await this.applyNaryRule(
                rule,
                ruleIdx,
                currentSpeciesObj,
                speciesList, // allSpecies
                speciesMap,
                speciesList,
                queue,
                reactionsList,
                reactionIndexByKey,
                signal
              );
            }

            if (reactionsList.length >= this.options.maxReactions) {
              throw this.buildLimitError(
                `Reached max reactions limit (${this.options.maxReactions}) while applying rule "${this.currentRuleName ?? 'unknown'}"`
              );
            }
          }

          this.currentRuleName = null;

          // Progress update check inside batch loop for smoother UI
          if (onProgress) {
            const now = Date.now();
            if (now - lastProgressCallback >= 100) { // Update every 100ms
              lastProgressCallback = now;
              onProgress({
                species: speciesList.length,
                reactions: reactionsList.length,
                iteration,
                memoryUsed: (performance as ExtendedPerformance).memory?.usedJSHeapSize || 0,
                timeElapsed: now - this.startTime
              });
            }
          }
        } // End of batch for-loop

        // Remove processed items in one O(n) pass instead of O(n) per shift()
        queue.splice(0, batchSize);

        // Ensure final update at end of iteration if not just updated
        if (onProgress) {
          const now = Date.now();
          if (now - lastProgressCallback > 50) {
            lastProgressCallback = now;
            onProgress({
              species: speciesList.length,
              reactions: reactionsList.length,
              iteration,
              memoryUsed: (performance as ExtendedPerformance).memory?.usedJSHeapSize || 0,
              timeElapsed: now - this.startTime
            });
          }
        }
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Catch limit errors and return partial results
      if (err.name === 'NetworkGenerationLimitError') {
        console.warn(`Network generation limit reached: ${err.message}`);
        // Continue and return partial results
      } else {
        throw err;
      }
    }

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);

    const isIterationLimitReached = iteration >= this.options.maxIterations;
    const hasRemainingQueue = queue.length > 0;

    // NOTE: Warn when maxIterations limit was reached
    if (isIterationLimitReached && hasRemainingQueue) {
      console.warn(`[NetworkGenerator] WARNING: maxIterations limit (${this.options.maxIterations}) reached with ${queue.length} species still in queue. Network may be incomplete.`);
    }

    progressLog(`[NetworkGenerator] Complete: ${speciesList.length} species, ${reactionsList.length} reactions in ${totalTime}s (${iteration} iterations)`);

    this.currentSpeciesList = [];
    this.currentReactionsList = [];
    return { species: speciesList, reactions: reactionsList };
  }

  // Flag to enable constraint debugging
  private static DEBUG_CONSTRAINTS = false;  // TEMP: Disable for cleaner output
  private static CONSTRAINT_DEBUG_LIMIT = 20; // Limit debug output
  private static constraintDebugCount = 0;

  /**
   * CHECK: Verify if species satisfy rule constraints
   */
  private checkConstraints(rule: RxnRule, reactant1: Species, reactant2?: Species): boolean {
    const hasConstraints = (rule.excludeReactants && rule.excludeReactants.length > 0) ||
      (rule.includeReactants && rule.includeReactants.length > 0);

    if (!hasConstraints) {
      return true;
    }

    // Helper to check if a species matches a pattern
    const matchesPattern = (species: Species, pattern: SpeciesGraph): boolean => {
      if (!species.graph.adjacencyBitset) {
        species.graph.buildAdjacencyBitset();
      }
      const maps = profiledFindAllMaps(pattern, species.graph);
      return maps.length > 0;
    };

    // Reactant mapping based on index (0-based)
    const getTarget = (idx: number): Species | undefined => {
      if (idx === 0) return reactant1;
      if (idx === 1) return reactant2;
      return undefined;
    };

    // Check exclude constraints
    if (rule.excludeReactants) {
      for (const constraint of rule.excludeReactants) {
        const target = getTarget(constraint.reactantIndex);

        if (target) {
          const isMatch = matchesPattern(target, constraint.pattern);

          // Debug: Log interesting cases where pattern doesn't match but target contains the molecule type
          if (NetworkGenerator.DEBUG_CONSTRAINTS &&
            NetworkGenerator.constraintDebugCount < NetworkGenerator.CONSTRAINT_DEBUG_LIMIT) {
            const patternMolNames = constraint.pattern.molecules.map(m => m.name);
            const targetMolNames = target.graph.molecules.map(m => m.name);
            const targetContainsPatternMol = patternMolNames.some(pn => targetMolNames.includes(pn));

            // Only log if pattern molecule IS in target but matching failed (potential bug)
            // Or log first few for context
            if ((targetContainsPatternMol && !isMatch) || NetworkGenerator.constraintDebugCount < 5) {
              NetworkGenerator.constraintDebugCount++;
              console.log(`\n[CONSTRAINT #${NetworkGenerator.constraintDebugCount}] Rule "${rule.name}"`);
              console.log(`  exclude_reactants(${constraint.reactantIndex + 1}, ${constraint.pattern.toString()})`);
              console.log(`  Target species: ${target.graph.toString().slice(0, 100)}...`);
              console.log(`  Pattern molecules: [${patternMolNames.join(', ')}]`);
              console.log(`  Target molecules: [${targetMolNames.join(', ')}]`);
              console.log(`  Target contains pattern molecule: ${targetContainsPatternMol}`);
              console.log(`  Pattern MATCH result: ${isMatch} ${isMatch ? '-> EXCLUDE' : '-> allow (UNEXPECTED if target contains molecule!)'}`);
            }
          }

          if (isMatch) return false;
        }
      }
    }


    // Check include constraints (ALL must match)
    if (rule.includeReactants) {
      for (const constraint of rule.includeReactants) {
        const target = getTarget(constraint.reactantIndex);
        if (target && !matchesPattern(target, constraint.pattern)) {
          return false; // Not included!
        }
      }
    }

    return true;
  }

  private checkProductConstraints(rule: RxnRule, products: Species[]): boolean {
    const hasConstraints =
      (rule.excludeProducts && rule.excludeProducts.length > 0) ||
      (rule.includeProducts && rule.includeProducts.length > 0);

    if (!hasConstraints) {
      return true;
    }

    const matchesPattern = (species: Species, pattern: SpeciesGraph): boolean => {
      if (!species.graph.adjacencyBitset) {
        species.graph.buildAdjacencyBitset();
      }
      const maps = profiledFindAllMaps(pattern, species.graph);
      return maps.length > 0;
    };

    if (rule.excludeProducts) {
      for (const constraint of rule.excludeProducts) {
        const target = products[constraint.productIndex];
        if (target && matchesPattern(target, constraint.pattern)) {
          return false;
        }
      }
    }

    if (rule.includeProducts) {
      for (const constraint of rule.includeProducts) {
        const target = products[constraint.productIndex];
        if (!target) {
          return false;
        }
        if (!matchesPattern(target, constraint.pattern)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * FIX: Apply unimolecular rule (A -> B + C)
   */
  private async applyUnimolecularRule(
    rule: RxnRule,
    reactantSpecies: Species,
    speciesMap: Map<string, Species>,
    speciesList: Species[],
    queue: Species[],
    reactionsList: Rxn[],
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {
    const pattern = rule.reactants[0];

    if (!GraphMatcher.canPossiblyMatch(pattern, reactantSpecies.graph)) {
      return;
    }

    const debugUnimolecularSignature =
      typeof process !== 'undefined' &&
      process.env?.DEBUG_UNIMOLEC_SIGNATURE === '1';

    const getTargetCompKey = (match: MatchMap, molIdx: number, compIdx: number): string | undefined => {
      return match.componentMap.get(`${molIdx}.${compIdx}`);
    };

    const getTargetMolIdx = (match: MatchMap, molIdx: number): number | undefined => {
      return match.moleculeMap.get(molIdx);
    };

    // When the reactant species has internal symmetries, `findAllMaps` can return multiple
    // match maps that are related by automorphisms but represent the *same physical event*
    // (e.g., breaking the same bond endpoints). BNG2 counts such events once.
    // Build a stable signature of the *mapped transformation* and deduplicate matches by it.
    const buildUnimolecularEventSignatureFromRuleOps = (match: MatchMap): string | null => {
      const ops: string[] = [];

      // Prefer using componentMap (patternCompKey -> targetCompKey), but fall back to
      // the mapped molecule index + component index when componentMap doesn't contain
      // an entry (this can happen with certain wildcard bond patterns).
      // The descriptor includes molecule occurrence index and molecule/component names
      // so it's stable and avoids accidental merging across distinct targets.
      const getTargetComponentDescriptor = (m: number, c: number): string | null => {
        const targetMolIdx = getTargetMolIdx(match, m);
        if (targetMolIdx === undefined) return null;
        const targetMol = reactantSpecies.graph.molecules[targetMolIdx];
        if (!targetMol) return null;

        const targetCompKey = getTargetCompKey(match, m, c);
        if (!targetCompKey) {
          // Be conservative: if we can't reliably map the pattern component to a concrete
          // target component, do not attempt signature-based dedup for this match.
          return null;
        }

        let targetCompIdx: number | null = null;
        const dotIdx = targetCompKey.indexOf('.');
        if (dotIdx !== -1) {
          const parsed = Number(targetCompKey.slice(dotIdx + 1));
          if (Number.isFinite(parsed)) targetCompIdx = parsed;
        }
        if (targetCompIdx === null) return null;

        const targetComp = targetMol.components[targetCompIdx];
        if (!targetComp) return null;

        return `${targetMolIdx}.${targetCompIdx}:${targetMol.name}:${targetComp.name}`;
      };

      for (const [m1, c1, m2, c2] of rule.deleteBonds) {
        const a = getTargetComponentDescriptor(m1, c1);
        const b = getTargetComponentDescriptor(m2, c2);
        if (!a || !b) return null;
        const pair = [a, b].sort().join('|');
        ops.push(`delBond:${pair}`);
      }

      for (const [m1, c1, m2, c2] of rule.addBonds) {
        const a = getTargetComponentDescriptor(m1, c1);
        const b = getTargetComponentDescriptor(m2, c2);
        if (!a || !b) return null;
        const pair = [a, b].sort().join('|');
        ops.push(`addBond:${pair}`);
      }

      for (const [m, c, newState] of rule.changeStates) {
        const a = getTargetComponentDescriptor(m, c);
        if (!a) return null;
        ops.push(`state:${a}:${newState}`);
      }

      for (const m of rule.deleteMolecules) {
        const tm = getTargetMolIdx(match, m);
        if (tm === undefined) return null;
        ops.push(`delMol:${tm}`);
      }

      // Compartment changes: map pattern mol idx → target mol idx, record new compartment.
      // This enables correct dedup of symmetric molecule permutations for rules like @PM:R.R -> @EM:R.R
      // where both permutation matches should collapse to one physical event.
      if (rule.changeCompartments) {
        for (const [m, newComp] of rule.changeCompartments) {
          const tm = getTargetMolIdx(match, m);
          if (tm === undefined) return null;
          const targetMol = reactantSpecies.graph.molecules[tm];
          const molName = targetMol?.name ?? `mol${tm}`;
          ops.push(`changeComp:${tm}:${molName}:${newComp}`);
        }
      }

      // If there are no mapped operations, don't attempt to dedup.
      if (ops.length === 0) return null;

      ops.sort();
      return ops.join(';');
    };

    // Some rules (notably certain dissociations) are applied via product-pattern reconstruction
    // and may have empty RxnRule op arrays. In that case, derive a stable signature from the
    // *actual transformation outcome* by identifying which reactant bonds now span different
    // product connected components (i.e., bonds that were cut by the event).
    const buildUnimolecularEventSignatureFromProducts = (products: SpeciesGraph[]): string | null => {
      // Map reactant molecule index -> product component index.
      const molToProduct = new Map<number, number>();
      for (let pi = 0; pi < products.length; pi++) {
        const product = products[pi];
        for (const mol of product.molecules) {
          const sourceKey = (mol as Molecule & { _sourceKey?: string })._sourceKey as string | undefined;
          if (!sourceKey) continue;
          const _cIdx = sourceKey.indexOf(':');
          const rStr = sourceKey.slice(0, _cIdx);
          const molIdxStr = sourceKey.slice(_cIdx + 1);
          if (rStr !== '0') continue; // unimolecular: only reactantIdx=0
          const molIdx = Number(molIdxStr);
          if (!Number.isFinite(molIdx)) continue;
          molToProduct.set(molIdx, pi);
        }
      }

      const ops: string[] = [];

      // Deletions: reactant molecules that disappear from all products.
      // (Usually empty for dissociation rules, but helps keep signatures stable.)
      for (let molIdx = 0; molIdx < reactantSpecies.graph.molecules.length; molIdx++) {
        if (!molToProduct.has(molIdx)) {
          ops.push(`delMol:${molIdx}`);
        }
      }

      // Bond cuts: bonds in the reactant whose endpoints end up in different products.
      const seenPairs = new Set<string>();
      for (let molIdx = 0; molIdx < reactantSpecies.graph.molecules.length; molIdx++) {
        const mol = reactantSpecies.graph.molecules[molIdx];
        const groupA = molToProduct.get(molIdx);
        if (groupA === undefined) continue;

        for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
          const comp = mol.components[compIdx];
          // IMPORTANT: Component.edges only stores partner *component* index (no molecule index).
          // Use graph adjacency map to discover full partner mol.comp keys.
          const partners = reactantSpecies.graph.adjacency.get(`${molIdx}.${compIdx}`);
          if (!partners) continue;

          for (const partnerKey of partners) {
            const _dIdx = partnerKey.indexOf('.');
            const mol2Str = partnerKey.slice(0, _dIdx);
            const comp2Str = partnerKey.slice(_dIdx + 1);
            const mol2Idx = Number(mol2Str);
            const comp2Idx = Number(comp2Str);
            if (!Number.isFinite(mol2Idx) || !Number.isFinite(comp2Idx)) continue;

            const groupB = molToProduct.get(mol2Idx);
            if (groupB === undefined) continue;
            if (groupA === groupB) continue;

            const aKey = `${molIdx}.${compIdx}`;
            const bKey = `${mol2Idx}.${comp2Idx}`;
            const pairKey = [aKey, bKey].sort().join('|');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const mol2 = reactantSpecies.graph.molecules[mol2Idx];
            const comp2 = mol2?.components?.[comp2Idx];
            if (!mol2 || !comp2) continue;

            const aDesc = `${molIdx}.${compIdx}:${mol.name}:${comp.name}`;
            const bDesc = `${mol2Idx}.${comp2Idx}:${mol2.name}:${comp2.name}`;
            const desc = [aDesc, bDesc].sort().join('|');
            ops.push(`delBond:${desc}`);
          }
        }
      }

      if (ops.length === 0) {
        const addedCounts = new Map<string, number>();
        for (const product of products) {
          for (const mol of product.molecules) {
            const sourceKey = (mol as Molecule & { _sourceKey?: string })._sourceKey as string | undefined;
            if (sourceKey) continue;
            addedCounts.set(mol.name, (addedCounts.get(mol.name) ?? 0) + 1);
          }
        }
        if (addedCounts.size === 0) return null;
        const addedSig = Array.from(addedCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, count]) => `${name}${count > 1 ? `(${count})` : ''}`)
          .join('+');
        return `addMol:${addedSig}`;
      }
      ops.sort();
      return ops.join(';');
    };

    if (!reactantSpecies.graph.adjacencyBitset) {
      reactantSpecies.graph.buildAdjacencyBitset();
    }

    // Check constraints
    if (!this.checkConstraints(rule, reactantSpecies)) {
      return;
    }

    // Note: maxReactantMoleculeCount constraint was considered but found to be incorrect.
    // BNG2.pl semantics allow unbinding patterns to match within larger complexes.
    // For example, "bCat.AXIN -> bCat + AXIN" pattern can match "APC.bCat.AXIN" ternary complex
    // and produce "APC.bCat + AXIN". This is confirmed by reference .net file having such reactions.
    // The 32 extra reactions issue needs a different solution.

    const matches: MatchMap[] = [];
    if (rule.isMatchOnce) {
      const firstMap = profiledFindFirstMap(pattern, reactantSpecies.graph, { symmetryBreaking: true });
      if (firstMap && this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, firstMap) &&
        this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, firstMap)) {
        matches.push(firstMap);
      }
    }
    if (matches.length === 0) {
      const candidateMaps = profiledFindAllMaps(pattern, reactantSpecies.graph, { symmetryBreaking: true });
      for (const match of candidateMaps) {
        if (
          this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, match) &&
          this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, match)
        ) {
          matches.push(match);
          if (rule.isMatchOnce) break;
        }
      }
    }

    // Debug: log match count for any unimolecular rule
    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[applyUnimolecularRule] Rule ${rule.name}: found ${matches.length} matches in species ${reactantSpecies.graph.toString()}`);
      if (matches.length > 0) {
        debugNetworkLog(`[applyUnimolecularRule] First match: moleculeMap=${JSON.stringify(Array.from(matches[0].moleculeMap.entries()))}`);
      }
    }

    // NOTE: We intentionally do not use orbit-based symmetry reduction here.
    // The current orbit computation is based on a coarse molecule-level adjacency and can
    // incorrectly merge non-equivalent matches (dropping reactions). Instead, we enumerate
    // all matches and aggregate duplicate reactions by key to recover multiplicity safely.

    // Changed from Set to Map to track multiplicity: how many matches share each signature
    // We deduplicate symmetry-equivalent embeddings (same physical event) by signature.
    // Signatures should be stable for bond deletions/additions/state changes mapped to concrete
    // target components, and for product-split signatures derived from actual cut bonds.
    const seenSignatures = new Set<string>();

    // Blinov_2006 parity debug: km2 dissociation offenders are small set of species indices.
    const normalizedRateExpression = rule.rateExpression
      ?.replace(/\(/g, '')
      .replace(/\)/g, '')
      .trim();
    const debugSignatureForThisRule =
      debugUnimolecularSignature &&
      normalizedRateExpression === 'km2' &&
      (reactantSpecies.index === 8 ||
        reactantSpecies.index === 9 ||
        reactantSpecies.index === 12 ||
        reactantSpecies.index === 13 ||
        reactantSpecies.index === 14);



    let debugPrinted = 0;

    const matchCount = matches.length;

    const hasWildcardBoundPattern = pattern.molecules.some((mol) =>
      mol.components.some((comp) => comp.wildcard === '+')
    );

    const signatureMultiplicityByOutcome = new Map<string, number>();
    const matchOutcomes: Array<{
      match: MatchMap;
      products: SpeciesGraph[] | null;
      signature: string | null;
    }> = [];

    for (const candidateMatch of matches) {
      const candidateProducts = this.applyRuleTransformation(
        rule,
        [rule.reactants[0]],
        [reactantSpecies.graph],
        [candidateMatch]
      );
      if (candidateProducts === null || !this.validateProducts(candidateProducts)) {
        matchOutcomes.push({ match: candidateMatch, products: null, signature: null });
        continue;
      }
      const expectedProductCount = rule.products.length;
      if (candidateProducts.length < expectedProductCount) {
        matchOutcomes.push({ match: candidateMatch, products: null, signature: null });
        continue;
      }
      const sig =
        buildUnimolecularEventSignatureFromRuleOps(candidateMatch) ??
        buildUnimolecularEventSignatureFromProducts(candidateProducts);

      matchOutcomes.push({ match: candidateMatch, products: candidateProducts, signature: sig });

      if (!sig) continue;
      signatureMultiplicityByOutcome.set(sig, (signatureMultiplicityByOutcome.get(sig) ?? 0) + 1);
    }


    for (const outcome of matchOutcomes) {
      const { match, products, signature } = outcome;
      if (products === null) {
        continue;
      }

      if (signal?.aborted) {
        throw new DOMException('Network generation cancelled', 'AbortError');
      }

      const degeneracy = countEmbeddingDegeneracy(pattern, reactantSpecies.graph, match);

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[applyUnimolecularRule] Transformation result: ${products ? products.map(p => p.toString()).join(', ') : 'null'}`);
      }

      // Candidate products were validated before being stored in matchOutcomes.
      const signatureMultiplicity = signature ? (signatureMultiplicityByOutcome.get(signature) ?? 1) : 1;
      const hasTopologyChangingSignature = !!signature && !signature.startsWith('addMol:');

      if (debugSignatureForThisRule && debugPrinted < 10) {
        debugPrinted += 1;
        console.log(
          `[DEBUG_UNIMOLEC_SIGNATURE] rule=${rule.name ?? '<unnamed>'} reactantIdx=${reactantSpecies.index} degeneracy=${degeneracy} signature=${signature ?? '<null>'} rateExpr=${rule.rateExpression}`
        );
        if (!signature) {
          console.log(
            `  ops: deleteBonds=${JSON.stringify(rule.deleteBonds)} addBonds=${JSON.stringify(rule.addBonds)} changeStates=${JSON.stringify(rule.changeStates)} deleteMolecules=${JSON.stringify(rule.deleteMolecules)}`
          );
        }
        console.log(
          `  moleculeMap=${JSON.stringify(Array.from(match.moleculeMap.entries()))} componentMap=${JSON.stringify(Array.from(match.componentMap.entries()))}`
        );
      }

      // Note: no signature-dedup exemption for deleteBonds rules. A signature is
      // built purely from the mapped target bond endpoints, so two matches that
      // share one describe the same physical bond-breaking event however the
      // pattern labelled the bond. The builder already returns null (opting out
      // of dedup) whenever an endpoint cannot be resolved to a concrete target
      // component, which is what the old wildcard+deleteBonds exemption
      // approximated. Exempting the whole class double-counted symmetric
      // homodimer splits: in motivating_example, Rule1_5_rev/Rule1_6_rev
      // (L(d!1,..).L(d!1,..) -> L(d,..) + L(d,..)) has two embeddings that both
      // resolve to the same `delBond` signature, turning BNG2's single `km_LL`
      // into 2*km_LL.

      // Deduplicate symmetry-equivalent embeddings (same physical event).
      // This avoids 2x overcounting for cases like symmetric dimer unbinding where
      // multiple automorphism-related embeddings map to the same bond endpoints.
      if (signature) {
        if (seenSignatures.has(signature)) {
          if (debugSignatureForThisRule && debugPrinted < 10) {
            console.log('  -> DUPLICATE signature, skipping (symmetry-equivalent)');
          }
          continue;
        }
        seenSignatures.add(signature);
      }

      // For pure state-change/compartment-change rules (no bond/molecule topology changes, signature=null),
      // deduplicate matches by the SET OF ACTUALLY CHANGED COMPONENTS + MOLECULE COMPARTMENTS.
      //
      // This correctly handles multi-molecule collective rules like:
      // - Rule3 in Motivating_example: 4 permutations all change same component states → 1 event
      // - cBNGL Rule3 @PM:R.R -> @EM:R.R: 2 permutations both move same Rs → 1 event
      //
      // Contrast with phosphorylation A(s~U) → A(s~P) on A(s~U,s~U):
      //   match 1 changes component s[0], match 2 changes s[1] → 2 events → rate = 2k
      if (!signature && matchCount > 1) {
        const changedComps: string[] = [];
        for (const productGraph of products) {
          for (const productMol of productGraph.molecules) {
            const sourceKey = (productMol as Molecule & { _sourceKey?: string })._sourceKey as string | undefined;
            if (!sourceKey) continue;
            const _cIdx = sourceKey.indexOf(':');
            const rStr = sourceKey.slice(0, _cIdx);
            const molIdxStr = sourceKey.slice(_cIdx + 1);
            if (rStr !== '0') continue;
            const molIdx = Number(molIdxStr);
            if (!Number.isFinite(molIdx)) continue;
            const reactantMol = reactantSpecies.graph.molecules[molIdx];
            if (!reactantMol) continue;
            // Detect compartment changes on the molecule
            if ((productMol.compartment ?? '') !== (reactantMol.compartment ?? '')) {
              changedComps.push(`m${molIdx}@${reactantMol.compartment ?? 'none'}->${productMol.compartment ?? 'none'}`);
            }
            // Detect component state changes
            for (let ci = 0; ci < productMol.components.length && ci < reactantMol.components.length; ci++) {
              const prodComp = productMol.components[ci];
              const rctComp = reactantMol.components[ci];
              if (prodComp && rctComp && prodComp.state !== rctComp.state) {
                changedComps.push(`m${molIdx}c${ci}:${rctComp.state}->${prodComp.state}`);
              }
            }
          }
        }
        if (changedComps.length > 0) {
          changedComps.sort();
          const ccKey = `CC:${changedComps.join(';')}`;
          if (seenSignatures.has(ccKey)) {
            continue;
          }
          seenSignatures.add(ccKey);
        }
      }

      // Add all products to network
      const productSpeciesIndices: number[] = [];
      const productSpeciesList: Species[] = [];
      for (const product of products) {
        const productSpecies = this.addOrGetSpecies(product, speciesMap, speciesList, queue, signal);
        productSpeciesList.push(productSpecies);
        productSpeciesIndices.push(productSpecies.index);
      }

      if (!this.checkProductConstraints(rule, productSpeciesList)) {
        continue;
      }

      // Unimolecular reactions do not get the identical-reactant 1/2 factor.
      // Symmetry-equivalent embeddings are handled via event-signature dedup.
      const propensityFactor = 1;

      // Create reaction (each match contributes additively; duplicates are aggregated by key)
      // Semantics: effective rate = (numeric scaling) * (evaluated symbolic expression, if present).
      // Therefore, degeneracy/volume scaling must live ONLY in the numeric factor.
      const baseRateConstant = (rule as RxnRule & { isFunctionalRate?: boolean }).isFunctionalRate && rule.rateConstant === 0 ? 1 : rule.rateConstant;
      // BioNetGen-style statistical factors:
      // - When multiple embeddings are returned, multiplicity is recovered by summing reactions.
      // - When only a single embedding is returned but the matched subgraph has automorphisms
      //   (common with repeated identical sites/components), BNG2 still applies a stat_factor.
      //   Use `degeneracy` as that stat_factor only in the single-embedding case.
      // When the matcher collapses symmetric embeddings to a single match, apply appropriate
      // stat_factor based on the matching scenario:
      // - For BAB-like cases (pattern has fewer bound components than target), use degeneracy
      //   since it correctly counts the equivalent component assignments.
      // - For other cases (like LRR dimer), use collapsedRuleStatFactor from pattern analysis
      //   to avoid overcounting symmetric molecule permutations.
      const countGraphBonds = (graph: SpeciesGraph): number => {
        let edgeEndpoints = 0;
        for (const mol of graph.molecules) {
          for (const comp of mol.components) {
            edgeEndpoints += comp.edges.size;
          }
        }
        return Math.floor(edgeEndpoints / 2);
      };

      const reactantBondCount = countGraphBonds(reactantSpecies.graph);
      const productBondCount = products.reduce((sum, productGraph) => sum + countGraphBonds(productGraph), 0);
      const hasConcreteBondChange = reactantBondCount !== productBondCount;

      const hasTopologyChangingOps =
        rule.addBonds.length > 0 ||
        rule.deleteBonds.length > 0 ||
        rule.changeStates.length > 0 ||
        rule.deleteMolecules.length > 0 ||
        (rule.changeCompartments?.length ?? 0) > 0 ||
        hasTopologyChangingSignature ||
        hasConcreteBondChange;

      const isSplitToIdenticalProductSpecies =
        rule.reactants.length === 1 &&
        rule.products.length === 2 &&
        productSpeciesIndices.length === 2 &&
        productSpeciesIndices[0] === productSpeciesIndices[1] &&
        rule.addBonds.length === 0 &&
        rule.changeStates.length === 0 &&
        rule.deleteMolecules.length === 0;

      const isSymmetricHomodimerUnbind =
        (
          rule.deleteBonds.length > 0 &&
          rule.addBonds.length === 0 &&
          rule.changeStates.length === 0 &&
          rule.deleteMolecules.length === 0 &&
          pattern.molecules.length === 2 &&
          pattern.molecules.every((mol) => mol.name === pattern.molecules[0].name)
        ) || (
          rule.reactants.length === 1 &&
          rule.products.length === 2 &&
          pattern.molecules.length === 2 &&
          pattern.molecules.every((mol) => mol.name === pattern.molecules[0].name) &&
          rule.products.every((pg) =>
            pg.molecules.length === 1 &&
            pg.molecules[0].name === pattern.molecules[0].name
          )
        ) ||
        isSplitToIdenticalProductSpecies;

      const wildcardDegeneracyAllowed =
        hasWildcardBoundPattern &&
        degeneracy > 1 &&
        !isSymmetricHomodimerUnbind;

      const useDegeneracy =
        matchCount === 1 &&
        hasTopologyChangingOps &&
        !isSymmetricHomodimerUnbind &&
        (
          shouldApplyDegeneracyStatFactor(pattern, reactantSpecies.graph, match) ||
          wildcardDegeneracyAllowed
        );

      // BioNetGen's per-instance value here is `MultScale`, and the number of
      // instances is the distinct-reaction-centre-image count -- both handled
      // further down. The free-site histogram that used to supply the initial
      // value (`computeCollapsedRuleStatFactor`) is deleted.
      let statFactor = useDegeneracy ? degeneracy : 1;

      if (isSymmetricHomodimerUnbind) {
        statFactor = 1;
      }

      // A rule that changes only component states: no bond added, removed or moved,
      // no molecule added or deleted. BioNetGen has no special case for these —
      // it enumerates every embedding, keeps one per distinct reaction-centre image,
      // and emits one reaction per survivor.
      const isPureStateChangeRule =
        rule.changeStates.length > 0 &&
        rule.addBonds.length === 0 &&
        rule.deleteBonds.length === 0 &&
        rule.deleteMolecules.length === 0;

      if (!isSymmetricHomodimerUnbind && matchCount === 1 && hasTopologyChangingOps && hasWildcardBoundPattern) {
        const wildcardStatFactor = computeWildcardBoundStatFactor(pattern, reactantSpecies.graph, match);
        if (wildcardStatFactor > 1) {
          statFactor = Math.max(statFactor, wildcardStatFactor);
        }
      }

      if (
        !isSymmetricHomodimerUnbind &&
        hasTopologyChangingOps &&
        signatureMultiplicity > 1 &&
        rule.products.length > 0 &&
        (rule.addBonds.length > 0 || hasWildcardBoundPattern)
      ) {
        statFactor = Math.max(statFactor, signatureMultiplicity);
      }


      if (rule.isMatchOnce) {
        statFactor = 1;
      }

      // Do not apply a match-degeneracy stat_factor to pure side-effect rules that
      // do not change the matched graph (e.g., transcription from gX(site!+)).
      // BNG2 counts the event once for these rules.
      if (!hasTopologyChangingOps) {
        statFactor = 1;
      }
      // BioNetGen `RxnRule::filter_identical_by_rxn_center` keeps exactly one match
      // per distinct image of the reaction centre, so a rule that changes only
      // component states carries a multiplicity equal to its number of distinct
      // reaction-centre images — never to its raw embedding count. Embeddings that
      // differ only in how spectator wildcard sites (`!+`) are permuted map the
      // reaction centre onto the same target nodes, so the filter collapses them
      // to a single event. E.g. `Ang1_4(tie2bs!1,tie2bs!+,tie2bs!+,tie2bs!+).Tie2(...pY~dp)`
      // has 6 embeddings (3! spectator permutations) but one reaction-centre image.
      // This is authoritative: none of the embedding-count heuristics above apply.
      if (isPureStateChangeRule && matchCount === 1 && !isSymmetricHomodimerUnbind && !rule.isMatchOnce) {
        const images = countRxnCenterImages(
          pattern,
          reactantSpecies.graph,
          match,
          rule.reactionCenter?.[0] ?? [],
          0,
          RXN_CENTER_IMAGE_BUDGET
        );
        if (images !== null) statFactor = Math.max(1, images);
      }

      // For unimolecular bond-topology rules on symmetric multi-monomer complexes,
      // symmetry-broken matching collapses equivalent embeddings to a single match.
      // When full (non-SB) map count exceeds the SB match count, the missing factor
      // must be restored (e.g., dsRNA unbinding from TLR3 homodimer has 2 equivalent sites).
      // Only apply when statFactor is not already accounting for the symmetry (statFactor <= 1)
      // and the rule genuinely has topology-changing ops.
      //
      // IMPORTANT GUARD: Do NOT apply this scaling when all non-SB matches produce
      // exactly the same product(s) as the SB match. In that case, SB correctly identifies
      // the extra matches as automorphism-equivalent representations of the same physical event,
      // and the rate should NOT be multiplied.
      //
      // Example of correct non-application: Rule3 in Motivating_example
      //   R(loc~PM).L(loc~EC).L(loc~EC).R(loc~PM) -> R(loc~EM).L(loc~EN).L(loc~EN).R(loc~EM)
      //   4 molecule permutations (2R × 2L automorphisms) all produce the identical product.
      //   BNG2 divides by the 4-fold rule pattern automorphism → rate = k_R_endo (not 4*k).
      //
      // Example of correct application: dsRNA unbinding from TLR3 homodimer
      //   Two distinct bond-breaking events produce different product SPECIES.
      if (
        hasTopologyChangingOps &&
        !isPureStateChangeRule &&
        !isSymmetricHomodimerUnbind &&
        !rule.isMatchOnce &&
        statFactor <= 1
      ) {
        // BioNetGen's survivor count for this (pattern, species) pair, via the same
        // `countRxnCenterImages` mechanism the n-ary path and the pure-state block
        // use: the number of distinct images of the reaction centre over the
        // component-assignment embeddings of this match.
        const images = countRxnCenterImages(
          pattern,
          reactantSpecies.graph,
          match,
          rule.reactionCenter?.[0] ?? [],
          0,
          RXN_CENTER_IMAGE_BUDGET
        );
        // matchCount = SB match count (from filteredMatches above)
        // Only apply if SB collapsed some equivalent embeddings
        if (images !== null && images > matchCount && matchCount > 0) {
          statFactor = Math.max(statFactor, images / matchCount);
        }
      }
      // BNG2 parity: TotalRate disables statFactor (sf=1), matching BNG2's toCvodeString logic.
      const effectiveStatFactor = rule.totalRate ? 1 : statFactor;
      let effectiveRate = baseRateConstant * effectiveStatFactor;

      // Arrhenius rate law calculation
      if (rule.isArrhenius && this.energyService) {
        const deltaG = this.energyService.calculateDeltaG(reactantSpecies.graph, products);

        const phi = this.evaluateArrheniusParam(rule.arrheniusPhi, 0.5);
        const Eact = this.evaluateArrheniusParam(rule.arrheniusEact);
        const A = this.evaluateArrheniusParam(rule.arrheniusA, rule.rateConstant === 0 ? 1 : rule.rateConstant);

        // BNG2 parity: k = A * exp(-(Eact + phi * deltaG))
        // deltaG is already dimensionless (in units of RT) from EnergyService.
        // Eact is used as a raw numeric value (per BNG2 NET reference: exp(-(Ea0 + phi*(Gf/RT)))).
        // Do NOT divide by RT — that would double-divide deltaG which is already Gf/RT.
        // Reference: Sekar, Hogg & Faeder, "Energy-based Modeling in BioNetGen", IEEE BIBM 2016
        // Verified against BNG2-generated catalysis.net: __R1_local1 = exp(-(Ea0_S_kinase+(phi*(Gf_S_kinase/RT))))
        effectiveRate = A * Math.exp(-(Eact + phi * deltaG)) * effectiveStatFactor;
      }

      // For Arrhenius rules: use null rateExpression so the NET file writes the numeric rate.
      // The string "Arrhenius(phi,Ea0)" cannot be evaluated by downstream tools.
      const rateExpression = (rule as RxnRule & { isArrhenius?: boolean }).isArrhenius ? undefined : rule.rateExpression;

      // Local function evaluation (BNG2 %x:: syntax):
      // When a rule's rate uses a local function f(x), the function body is evaluated
      // with observables counted WITHIN the specific reactant species x (not globally).
      // BNG2 generates per-reaction constant parameters __R1_local1, __R1_local2, etc.
      // We replicate this by computing the per-species rate now, at network-generation time.
      const localFnCtx = (rule as RxnRule & { localFunctionContext?: { observablePatterns: Array<{ name: string; pattern: string }>; bodyTemplate: string } }).localFunctionContext as {
        observablePatterns: Array<{ name: string; pattern: string }>;
        bodyTemplate: string;
      } | undefined;
      if (localFnCtx) {
        const localRate = this.evaluateLocalFunctionForSpecies(reactantSpecies.graph, localFnCtx);
        if (localRate !== null && Number.isFinite(localRate)) {
          // Replace effectiveRate with the per-species computed constant.
          // Clear rateExpression so NET file shows the numeric constant (like BNG2's __R1_local*).
          effectiveRate = localRate;
          // rateExpression already undefined for local function rules (set in NetworkExpansion)
        }
      }



      // Calculate volume scaling for each product:
      // Note: SimulationLoop.ts expects 'velocity' in Amount units (Particles/s or Moles/s).
      // For unimolecular A@V1 -> B@V2, velocity = rate * V1 * [A].
      // d[B]/dt = (velocity * stoich) / V2 = (rate * V1 * [A] * 1) / V2 = rate * [A] * (V1/V2).
      // This correctly preserves mass balance in concentration units.
      const productStoichiometries = products.map(_ => 1);

      const { scalingVolume } = this.getVolumeScalingInfo([reactantSpecies]);

      const rxn = new Rxn(
        [reactantSpecies.index],
        productSpeciesIndices,
        effectiveRate,
        rule.name,
        {
          degeneracy: 1,
          statFactor,
          rateExpression,
          propensityFactor,
          productStoichiometries,
          scalingVolume,
          totalRate: rule.totalRate
        }
      );

      if (isIdentityReactionByGraph(rxn.reactants, rxn.products, speciesList)) {
        continue;
      }

      // Fast O(1) duplicate detection using Set
      const rxnKey = getReactionKey(rxn.reactants, rxn.products, rateIdentity(rule.name, rxn.rateExpression, rxn.rate));
      const existingIdx = reactionIndexByKey.get(rxnKey);
      if (existingIdx === undefined) {
        reactionIndexByKey.set(rxnKey, reactionsList.length);
        reactionsList.push(rxn);
      } else {
        reactionsList[existingIdx].rate += rxn.rate;
        mergeReactionExpressionWithStatFactors(reactionsList[existingIdx], rxn);
      }
    }
  }

  private matchRespectsExplicitComponentBondCounts(
    pattern: SpeciesGraph,
    target: SpeciesGraph,
    match: MatchMap
  ): boolean {
    for (const [patternMolIdx, targetMolIdx] of match.moleculeMap.entries()) {
      const patternMol = pattern.molecules[patternMolIdx];
      const targetMol = target.molecules[targetMolIdx];
      if (!patternMol || !targetMol) return false;

      for (let patternCompIdx = 0; patternCompIdx < patternMol.components.length; patternCompIdx++) {
        const patternComp = patternMol.components[patternCompIdx];

        if (patternComp.wildcard) continue;

        const targetCompKey = match.componentMap.get(`${patternMolIdx}.${patternCompIdx}`);
        if (!targetCompKey) return false;

        // ⚡ Bolt: Use slice directly to avoid split() array allocation
        const targetCompIdx = Number(targetCompKey.slice(targetCompKey.indexOf('.') + 1));
        const targetComp = targetMol.components[targetCompIdx];
        if (!targetComp) return false;

        // Plain components without explicit bond constraints are unconstrained in BNGL
        // rule matching and may bind to either bound or unbound target sites.
        if (patternComp.edges.size === 0) {
          continue;
        }

        // Reaction-rule parity: an explicit bonded site like b!1 should not match a site
        // with additional bonds (e.g., b!1!2) unless wildcard semantics are used.
        if (targetComp.edges.size !== patternComp.edges.size) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * The rule's molecule-level correspondence between reactants and products.
   *
   * A reaction rule's reactant and product molecule lists are positionally
   * corresponding per molecule name: the n-th reactant molecule named `A` is the
   * image of the n-th product molecule named `A`. BNG2 guarantees this, and both
   * the product-implied-free filter and the product-graph builder rely on it.
   *
   * Inferring it heuristically is what produced two separate parity bugs. Guessing
   * "do these molecules share a bonded component name" is ambiguous as soon as two
   * reactant molecules of the same name share a component name — every molecule of
   * a disulfide-linked dimer lists `C` — so a product's free-site constraint was
   * applied to *both* copies and the whole two-ligand-per-receptor family in the
   * IGF1R fitting models was lost. Guessing by state/bond similarity in
   * buildProductGraph is ambiguous the moment the rule does not spell out the
   * components distinguishing two copies, so kesseler_2013's MPF autophosphorylation
   * built the phosphorylated product from the wrong monomer and dropped the other
   * one's DP~P state.
   *
   * `reactantOffsets` / `productOffsets` give the global molecule index at which
   * each pattern starts, so a (patternIdx, molIdx) pair converts to the global index
   * the maps are keyed on. Names with no counterpart (a molecule deleted by
   * DeleteMolecules, or a name with fewer product copies) are absent from both maps.
   */
  private getRuleMoleculeCorrespondence(rule: RxnRule): RuleMoleculeCorrespondence {
    const cached = this.productCorrespondenceCache.get(rule);
    if (cached) return cached;

    const reactantByName = new Map<string, number[]>();
    const productByName = new Map<string, number[]>();
    const reactantOffsets: number[] = [];
    const productOffsets: number[] = [];
    let gIdx = 0;
    for (const pat of rule.reactants) {
      reactantOffsets.push(gIdx);
      for (const mol of pat.molecules) {
        const list = reactantByName.get(mol.name);
        if (list) list.push(gIdx); else reactantByName.set(mol.name, [gIdx]);
        gIdx++;
      }
    }
    gIdx = 0;
    for (const pat of rule.products) {
      productOffsets.push(gIdx);
      for (const mol of pat.molecules) {
        const list = productByName.get(mol.name);
        if (list) list.push(gIdx); else productByName.set(mol.name, [gIdx]);
        gIdx++;
      }
    }

    const reactantToProduct = new Map<number, number>();
    const productToReactant = new Map<number, number>();
    for (const [name, reactantIdxs] of reactantByName) {
      const productIdxs = productByName.get(name);
      if (!productIdxs) continue;
      const n = Math.min(reactantIdxs.length, productIdxs.length);
      for (let k = 0; k < n; k++) {
        reactantToProduct.set(reactantIdxs[k], productIdxs[k]);
        productToReactant.set(productIdxs[k], reactantIdxs[k]);
      }
    }

    const result = { reactantOffsets, productOffsets, reactantToProduct, productToReactant };
    this.productCorrespondenceCache.set(rule, result);
    return result;
  }

  /**
   * BNG2 parity: if a product explicitly lists a component as unbound (free site),
   * but the reactant pattern for the same molecule type doesn't mention that component,
   * BNG2 interprets this as an implicit requirement that the component is already free
   * in the matched target species.
   *
   * Example rule that requires this:
   *   GPCR(b!1,loc~mem).Arrestin(b!1) -> GPCR(l,b!1,loc~cyt,s~P).Arrestin(b!1) k MoveConnected
   * The reactant pattern for GPCR does not include `l`, but the product specifies `l`
   * as unbound. BNG2 infers that the rule may only fire when GPCR.l is already free.
   * Without this check the web generator fires the rule on GPCR with an occupied `l`
   * site, producing 2 extra spurious reactions not present in the BNG2 .net file.
   */
  private matchRespectsProductImpliedFreeConstraints(
    rule: RxnRule,
    reactantPattern: SpeciesGraph,
    target: SpeciesGraph,
    match: MatchMap
  ): boolean {
    if (rule.products.length === 0) return true;

    // MoveConnected rules can still have explicit product-implied-free constraints.
    // For example: GPCR(b!1,loc~mem).Arrestin(b!1) -> GPCR(l,b!1,loc~cyt,s~P).Arrestin(b!1)
    // has 'l' explicitly free in the product. When the target GPCR has l bonded to Ligand,
    // this constraint must REJECT the match (BNG2 does not fire on ligand-bound GPCR).
    //
    // Synthetic wildcard components (added by completeMissingComponents for components not
    // mentioned in the rule) are already skipped by the `if (prodComp.wildcard) continue`
    // guard below, so transported cargo (e.g. Im(cargo!1) in Rule29) is handled correctly
    // without needing a blanket bypass here.

    // The rule's reactant and product molecule lists correspond positionally per
    // molecule name (see getRuleMoleculeCorrespondence), so a product constraint is
    // applied to exactly the reactant molecule that becomes it. A name with more
    // reactant copies than product copies is DeleteMolecules: the surplus reactant
    // molecules have no counterpart and are skipped, which is what the
    // DeCe2 case (CCNE(CDKN1A) + CCNE() -> CCNE(CDKN1A) DeleteMolecules) needs —
    // the product CCNE(CDKN1A) belongs to reactant slot 0, not slot 1.
    const { reactantOffsets, productOffsets, reactantToProduct } = this.getRuleMoleculeCorrespondence(rule);
    const patternIdx = rule.reactants.indexOf(reactantPattern);
    const patternOffset = patternIdx < 0 ? 0 : reactantOffsets[patternIdx];

    for (let pMolIdx = 0; pMolIdx < reactantPattern.molecules.length; pMolIdx++) {
      const reactantMol = reactantPattern.molecules[pMolIdx];
      const targetMolIdx = match.moleculeMap.get(pMolIdx);
      if (targetMolIdx === undefined) continue;
      const targetMol = target.molecules[targetMolIdx];
      if (!targetMol) continue;

      // The product molecule this reactant pattern molecule becomes. Absent when
      // the molecule is deleted or its name has no surviving product copy.
      const prodGlobalIdx = reactantToProduct.get(patternOffset + pMolIdx);
      if (prodGlobalIdx === undefined) continue;
      // Translate the global product index back to (pattern, molecule) via the offsets.
      let prodPatIdx = productOffsets.length - 1;
      while (prodPatIdx > 0 && productOffsets[prodPatIdx] > prodGlobalIdx) prodPatIdx--;
      const prodMol = rule.products[prodPatIdx]?.molecules[prodGlobalIdx - productOffsets[prodPatIdx]];
      if (!prodMol) continue;

      // Build set of component names present in the reactant pattern molecule.
      // Components in the pattern are explicitly constrained; missing ones are free.
      const reactantCompNames = new Set(reactantMol.components.map(c => c.name));

      for (const prodComp of prodMol.components) {
        if (prodComp.wildcard) continue;
        if (prodComp.edges.size !== 0) continue;            // not unbound in product
        // If the product explicitly assigns a new state (e.g. s~U, Y1068~P), the rule is
        // actively modifying this component and is allowed to break any existing bond as a
        // side-effect (BNG2 semantics). Do NOT apply the "must be free in target" filter here.
        // Examples: BetaR(l,g,loc~cyt)->BetaR(l,g,loc~mem,s~U) may act on BetaR(s~P!1).Arr;
        //           EGFR(d!1).EGFR(d!1,Y1068~U)->EGFR(d!1).EGFR(d!1,Y1068~P) k_phos acts on
        //           EGFR complexes where the first EGFR's Y1068 may be bonded to Grb2.
        if (prodComp.state && prodComp.state !== '?') continue;
        if (reactantCompNames.has(prodComp.name)) {
          // Component is present in the reactant pattern. If it was explicitly written by the user
          // (e.g. CD40(l!?)), the pattern matcher already handles it — skip.
          // But a synthetically-added wildcard (completeMissingComponents added it as !?__SYN__)
          // means the user DID NOT write it; treat it as absent and apply the product-implied-free
          // check, just like GPCR where l is absent from the reactant but free in the product.
          // ⚡ Bolt: replace array .find in inner loop
          let reactantComp: typeof reactantMol.components[0] | undefined;
          for (let i = 0; i < reactantMol.components.length; i++) {
            if (reactantMol.components[i].name === prodComp.name) {
              reactantComp = reactantMol.components[i];
              break;
            }
          }
          if (!reactantComp?.syntheticWildcard) continue; // explicit pattern component — already constrained
          // synthetic wildcard — fall through to check target bond state
        }

        // Component is explicitly free in product but absent from reactant pattern.
        // BNG2 requires the target to also have it free.
        // ⚡ Bolt: replace array .find in inner loop
        let targetComp: typeof targetMol.components[0] | undefined;
        for (let i = 0; i < targetMol.components.length; i++) {
          if (targetMol.components[i].name === prodComp.name) {
            targetComp = targetMol.components[i];
            break;
          }
        }
        if (!targetComp) continue; // molecule type doesn't have this component on this instance
        if (targetComp.edges.size !== 0) {
          // Target has this component bonded — reject this match.
          return false;
        }
      }
    }

    return true;
  }

  /**
   * OPT #5: Compute (and cache per rule) the N-ary rule metadata that does not
   * depend on the species being matched: symmetry-breaking flag, carry-through
   * (catalyst) pattern indices, the anchor-skip eligibility flag, and the groups
   * of identical reactant patterns. Logic is unchanged from the former inline
   * computation in applyNaryRule; it is just hoisted out of the per-species path.
   */
  private getNaryRuleMeta(rule: RxnRule): {
    matchSymmetryBreaking: boolean;
    carryThroughPatternIndices: Set<number>;
    applyCarryThroughAnchorSkip: boolean;
    identicalPatternGroups: Map<string, number[]>;
  } {
    const cached = this.naryRuleMetaCache.get(rule);
    if (cached !== undefined) return cached;

    const patterns = rule.reactants;
    const n = patterns.length;

    const isPureStateChangeRule =
      rule.changeStates.length > 0 &&
      rule.addBonds.length === 0 &&
      rule.deleteBonds.length === 0 &&
      rule.deleteMolecules.length === 0;
    const matchSymmetryBreaking = !isPureStateChangeRule;

    // Detect carry-through (catalyst) reactant patterns by comparing reactant
    // pattern keys against product pattern keys.
    const productPatternCounts = new Map<string, number>();
    for (const p of rule.products) {
      const pk = getPatternSymmetryKey(p);
      productPatternCounts.set(pk, (productPatternCounts.get(pk) ?? 0) + 1);
    }
    const carryThroughPatternIndices = new Set<number>();
    const usedFromProducts = new Map<string, number>();
    for (let ki = 0; ki < n; ki++) {
      const rk = getPatternSymmetryKey(rule.reactants[ki]);
      const avail = (productPatternCounts.get(rk) ?? 0) - (usedFromProducts.get(rk) ?? 0);
      if (avail > 0) {
        carryThroughPatternIndices.add(ki);
        usedFromProducts.set(rk, (usedFromProducts.get(rk) ?? 0) + 1);
      }
    }
    // Also include carry-through detected via explicit changeStates ops.
    //
    // Which pattern a state change belongs to cannot be recovered from
    // `changeStates`: its molecule index is *pattern-local*, not merged
    // (RxnRule's `mergedMoleculeIndex` drops the "iPatt" prefix), so the
    // first molecule of every pattern reports the same index and an
    // offset-walk attributes the change to pattern 0 no matter which
    // pattern actually changed. `reactionCenter` keeps the full
    // "iPatt.iMol.iComp" pointer that BNG2's `find_reaction_center` records,
    // and a pattern with no reaction-centre node is by definition untouched
    // — which is exactly BNG2's notion of a carry-through reactant.
    if (isPureStateChangeRule && rule.changeStates.length > 0) {
      for (let k = 0; k < n; k++) {
        if ((rule.reactionCenter?.[k] ?? []).length === 0) {
          carryThroughPatternIndices.add(k);
        }
      }
    }

    const rulePatternCountsLocal = new Map<string, number>();
    for (const p of patterns) {
      const pk = getPatternSymmetryKey(p);
      rulePatternCountsLocal.set(pk, (rulePatternCountsLocal.get(pk) || 0) + 1);
    }
    const hasRepeatedReactantPatternsLocal = Array.from(rulePatternCountsLocal.values()).some(c => c > 1);
    const applyCarryThroughAnchorSkip = (
      carryThroughPatternIndices.size > 0 &&
      carryThroughPatternIndices.size < n &&
      !hasRepeatedReactantPatternsLocal &&
      rule.products.length === rule.reactants.length
    );

    const identicalPatternGroups = new Map<string, number[]>();
    for (let idx = 0; idx < n; idx++) {
      const key = getPatternSymmetryKey(patterns[idx]);
      const group = identicalPatternGroups.get(key);
      if (group) group.push(idx);
      else identicalPatternGroups.set(key, [idx]);
    }

    const meta = { matchSymmetryBreaking, carryThroughPatternIndices, applyCarryThroughAnchorSkip, identicalPatternGroups };
    this.naryRuleMetaCache.set(rule, meta);
    return meta;
  }

  /**
   * Supports arbitrary number of reactants (unimolecular, bimolecular, ternary, etc.)
   */
  private async applyNaryRule(
    rule: RxnRule,
    _ruleIdx: number,
    currentSpecies: Species,
    allSpecies: Species[],
    speciesMap: Map<string, Species>,
    speciesList: Species[],
    queue: Species[],
    reactionsList: Rxn[],
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {

    const patterns = rule.reactants;
    const n = patterns.length;
    if (n < 2) return; // Unimolecular handled separately

    // OPT #5: this metadata depends only on the rule, not on currentSpecies, so
    // compute it once per rule and reuse across every species the rule matches.
    const { matchSymmetryBreaking, carryThroughPatternIndices, applyCarryThroughAnchorSkip, identicalPatternGroups } =
      this.getNaryRuleMeta(rule);


    // Try matching currentSpecies against EVERY pattern position i
    for (let i = 0; i < n; i++) {
      if (!GraphMatcher.canPossiblyMatch(patterns[i], currentSpecies.graph)) {
        continue;
      }
      // For carry-through rules (catalyst + substrate pattern), substrate anchors need
      // SB=false to enumerate ALL substrate embeddings. This enables sigMult to capture
      // the correct rate multiplier (e.g., STAT3(U).STAT3(U) has 2 s~U sites → sigMult=2 → rate=2k).
      // Carry-through (catalyst) anchors use the standard matchSymmetryBreaking flag.
      // The canonical anchor check (maxIdx guard below) prevents double-counting:
      // only the species with the highest index in the reaction set acts as anchor.
      const isSubstrateAnchor = applyCarryThroughAnchorSkip && !carryThroughPatternIndices.has(i);
      const anchorSB = isSubstrateAnchor ? false : matchSymmetryBreaking;

      const limitToSingleMatch = rule.isMatchOnce || (!isSubstrateAnchor && carryThroughPatternIndices.has(i));
      const matches: MatchMap[] = [];

      if (rule.isMatchOnce) {
        const firstMap = profiledFindFirstMap(patterns[i], currentSpecies.graph, { symmetryBreaking: anchorSB });
        if (firstMap && this.matchRespectsExplicitComponentBondCounts(patterns[i], currentSpecies.graph, firstMap) &&
          this.matchRespectsProductImpliedFreeConstraints(rule, patterns[i], currentSpecies.graph, firstMap)) {
          matches.push(firstMap);
        }
      }

      if (matches.length === 0) {
        const candidateMaps = profiledFindAllMaps(patterns[i], currentSpecies.graph, { symmetryBreaking: anchorSB });
        for (const match of candidateMaps) {
          if (
            this.matchRespectsExplicitComponentBondCounts(patterns[i], currentSpecies.graph, match) &&
            this.matchRespectsProductImpliedFreeConstraints(rule, patterns[i], currentSpecies.graph, match)
          ) {
            matches.push(match);
            if (limitToSingleMatch) break;
          }
        }
      }
      // BioNetGen RxnRule::find_embeddings keeps one match per distinct image of
      // the reaction centre (RxnRule::filter_identical_by_rxn_center).
      filterIdenticalByRxnCenter(matches, rule.reactionCenter?.[i] ?? [], i);
      if (matches.length === 0) continue;

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[applyNaryRule] Rule ${rule.name}: currentSpecies ${currentSpecies.index} matches pattern ${i}`);
      }

      // Recursive helper to match REMAINING patterns j != i
      const matchPartnersRecursively = async (
        patternIndicesToMatch: number[],
        currentIndices: number[], // indices[k] is the species index for pattern k
        currentMatches: MatchMap[] // matches[k] is the MatchMap for pattern k
      ) => {
        if (patternIndicesToMatch.length === 0) {
          // All patterns matched!
          // -------------------------------------------------------------------
          // CANONICAL ANCHOR CHECK (Prevent Double Counting)
          // A combination (S0, S1, ..., Sn-1) is only processed when:
          // 1. currentSpecies.index is the MAXIMUM index in the set.
          // 2. If there are multiple reactants with the same max index,
          //    currentSpecies must match the FIRST occurrence (earliest patternIdx)
          //    of that max index.
          // -------------------------------------------------------------------

          let maxIdx = -1;
          for (const idx of currentIndices) if (idx > maxIdx) maxIdx = idx;

          if (currentSpecies.index !== maxIdx) return; // Not the anchor

          // Find the first pattern index k that matched this max index
          let kFirst = -1;
          for (let k = 0; k < n; k++) {
            if (currentIndices[k] === maxIdx) {
              kFirst = k;
              break;
            }
          }

          if (i !== kFirst) return; // We are matching against pattern i, but kFirst is the anchor.

          // Identical reactant patterns (e.g. EGFR(I_III!+,II~u,Kin~0) twice) can
          // match distinct species, and then the two assignments are DIFFERENT
          // reactions whenever the rule's products are asymmetric: pairing
          // pattern 0 with either species decides which monomer becomes Kin~act,
          // and BNG2 emits both. The previous pruning by species-index order
          // silently dropped the second one.
          //
          // Genuine duplicates — the same species matched twice, or a symmetric
          // rule whose products do not depend on the assignment — are collapsed
          // downstream by the reaction key, which is the correct place for it.

          // Proceed with reaction generation
          const reactantSpeciesList = currentIndices.map(idx => allSpecies[idx]);

          // 1. Check Constraints
          for (let p1 = 0; p1 < n; p1++) {
            for (let p2 = p1 + 1; p2 < n; p2++) {
              if (!this.checkConstraints(rule, reactantSpeciesList[p1], reactantSpeciesList[p2])) return;
              if (!this.isInteractingSet(reactantSpeciesList[p1], reactantSpeciesList[p2])) return;
            }
          }

          // Every distinct combination of match maps is a candidate event, exactly
          // as in BNG2: `RxnRule::find_embeddings` keeps the embeddings of a pattern
          // whose reaction-centre image differs, `expand_rule` then takes the plain
          // Cartesian product of those per-pattern match sets, and
          // `RxnList::add` folds the resulting reactions that share species
          // indices into one entry with the rates summed.
          //
          // Collapsing match combinations here — by the local signature of the
          // molecules they map onto — merged events that BNG2 keeps apart. Two
          // mappings that are indistinguishable 1-hop apart (egfr_net R9: which of
          // two identical-looking egfr monomers receives the new Grb2 bond) carry
          // different reaction-centre images and are different reactions, so the
          // signature collided and one of them was dropped.
          //
          // Symmetry-equivalent embeddings are handled elsewhere: the matcher runs
          // symmetry-broken, and generateNaryReaction recovers the true embedding
          // count for the rate factor from the target graphs. Genuine duplicates —
          // the same species matched twice, or a symmetric rule whose products do
          // not depend on the assignment — collapse downstream on the reaction key,
          // which is where BNG2 does it too.
          await this.generateNaryReaction(
            rule,
            reactantSpeciesList,
            currentIndices,
            currentMatches,
            allSpecies,
            speciesMap,
            speciesList,
            queue,
            reactionsList,
            reactionIndexByKey,
            signal
          );
          return;
        }

        const nextPatternIdx = patternIndicesToMatch[0];
        const nextPattern = patterns[nextPatternIdx];
        const remainingPatterns = patternIndicesToMatch.slice(1);

        // Optimization: Inverted index lookup for molecule types required by nextPattern.
        // Sort required mols by ascending set size (most-constrained-first) to minimize
        // the initial Set copy and candidate count fed to canPossiblyMatch/findAllMaps.
        const rawRequired = nextPattern.molecules.map(m => m.name);
        const uniqueMols = rawRequired.length <= 1 ? rawRequired : Array.from(new Set(rawRequired));
        const setsWithSizes = uniqueMols.map(name => ({
          name,
          size: this.speciesByMoleculeIndex.get(name)?.size ?? 0,
        }));
        setsWithSizes.sort((a, b) => a.size - b.size);
        let candidateSet: Set<number> | null = null;
        for (const { name } of setsWithSizes) {
          const set = this.speciesByMoleculeIndex.get(name);
          if (!set) { candidateSet = new Set(); break; }
          if (!candidateSet) candidateSet = new Set(set);
          else {
            for (const c of candidateSet) if (!set.has(c)) candidateSet.delete(c);
          }
          if (candidateSet.size === 0) break;
        }

        const candidates = candidateSet ? Array.from(candidateSet) : [];
        // Carry-through patterns (unchanged by rule ops) should only contribute ONE match
        // per candidate species. Their monomer-level multiplicity does NOT add to the rate
        // (only changed-reactant embeddings count toward BNG2 stat factors).
        const isCarryThroughPattern = carryThroughPatternIndices.has(nextPatternIdx);
        for (const candidateIdx of candidates) {
          // BNG2 Rule: For N-ary, partners can be ANY species in the network so far.
          const candidateSpecies = allSpecies[candidateIdx];
          // O(1) early structural pruning before calling any matches/isomorphisms
          if (!GraphMatcher.canPossiblyMatch(nextPattern, candidateSpecies.graph)) {
            continue;
          }
          const limitToSingleMatch = rule.isMatchOnce || isCarryThroughPattern;
          const candMaps: MatchMap[] = [];

          if (limitToSingleMatch) {
            const firstCandMap = profiledFindFirstMap(nextPattern, candidateSpecies.graph, { symmetryBreaking: matchSymmetryBreaking });
            if (firstCandMap && this.matchRespectsExplicitComponentBondCounts(nextPattern, candidateSpecies.graph, firstCandMap) &&
              this.matchRespectsProductImpliedFreeConstraints(rule, nextPattern, candidateSpecies.graph, firstCandMap)) {
              candMaps.push(firstCandMap);
            }
          }

          if (candMaps.length === 0) {
            const candidateMaps = profiledFindAllMaps(nextPattern, candidateSpecies.graph, { symmetryBreaking: matchSymmetryBreaking });
            for (const candMatch of candidateMaps) {
              if (
                this.matchRespectsExplicitComponentBondCounts(nextPattern, candidateSpecies.graph, candMatch) &&
                this.matchRespectsProductImpliedFreeConstraints(rule, nextPattern, candidateSpecies.graph, candMatch)
              ) {
                candMaps.push(candMatch);
                if (limitToSingleMatch) break;
              }
            }
          }
          // BioNetGen RxnRule::find_embeddings filters partner matches the same way.
          filterIdenticalByRxnCenter(candMaps, rule.reactionCenter?.[nextPatternIdx] ?? [], nextPatternIdx);

          for (const candMatch of candMaps) {
            const nextIndices = [...currentIndices];
            nextIndices[nextPatternIdx] = candidateIdx;
            const nextMatches = [...currentMatches];
            nextMatches[nextPatternIdx] = candMatch;

            await matchPartnersRecursively(remainingPatterns, nextIndices, nextMatches);
          }
        }
      };

      // Start recursion for current pattern match i
      const initialIndices = new Array(n).fill(-1);
      initialIndices[i] = currentSpecies.index;
      const initialMatches = new Array(n).fill(null);

      for (const m of matches) {
        initialMatches[i] = m;
        const patternIndicesToMatch = [];
        for (let j = 0; j < n; j++) if (j !== i) patternIndicesToMatch.push(j);

        await matchPartnersRecursively(patternIndicesToMatch, initialIndices, initialMatches);
      }
    }
  }

  /**
   * Helper: Generate reaction from matched N-ary reactants
   */
  private async generateNaryReaction(
    rule: RxnRule,
    reactantSpeciesList: Species[],
    currentSpeciesIndices: number[],
    currentMatches: MatchMap[],
    allSpecies: Species[],
    speciesMap: Map<string, Species>,
    speciesList: Species[],
    queue: Species[],
    reactionsList: Rxn[],
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {

    const patterns = rule.reactants;
    const n = patterns.length;

    // 2. Aggregate Matches / Multiplicity
    // Multiplicity = (Sum over all embeddings P1..Pn) / ruleSymmetryFactor
    // However, our outer loop visits each embedding combo.
    // We aggregate them by (reactantIndices, productIndices).

    // Distinct reactant patterns, used below only as a structural guard.
    const rulePatternCounts = new Map<string, number>();
    for (const p of patterns) {
      const s = getPatternSymmetryKey(p);
      rulePatternCounts.set(s, (rulePatternCounts.get(s) || 0) + 1);
    }
    const hasRepeatedReactantPatterns = Array.from(rulePatternCounts.values()).some((count) => count > 1);

    // BIO-NETGEN PARITY: the statistical divisor.
    //
    // `RxnRule::find_reaction_center` (RxnRule.pm:2659-2849) derives
    //   multScale = 1 / ( (|RG| / |Stab|) * crg_permutations )
    // from the rule's own patterns, and `build_reaction` gives every rule instance
    // `StatFactor = multScale` (RxnRule.pm:3397); `RxnList::add` SUMS the stat
    // factors of the instances that fold into one `.net` entry. So the divisor
    // belongs here -- once, per instance -- and nowhere else:
    //
    //   multiplicity = (number of surviving rule instances) / divisor
    //
    // where the surviving count is what `countRxnCenterImages` computes (one per
    // distinct reaction-centre image, per `filter_identical_by_rxn_center`).
    //
    // `computeRuleDivisor` is that derivation transcribed: RG is the set of merged
    // reactant-graph automorphisms, restricted to those that induce a permutation
    // of the reactant patterns, whose induced permutation on the product graph is
    // itself a product-graph automorphism; Stab is the subgroup of RG fixing every
    // reaction-centre element; crg_permutations is the product of classSize! over
    // isomorphism classes of pure-context reactant patterns.
    //
    // It returns null only if the automorphism enumeration exceeds its budget, in
    // which case we apply no division -- BioNetGen's own value for the large
    // majority of rule instances.
    const ruleSymmetryFactor = computeRuleDivisor(rule)?.divisor ?? 1;

    // BioNetGen's per-pattern multiplicity is the number of embeddings that
    // survive `filter_identical_by_rxn_center`, not the raw embedding count
    // (RxnRule.pm:3092, 3501-3592). `countRxnCenterImages` is that survivor
    // count computed over the bounded component-assignment enumeration; the raw
    // count is only a fallback for when the enumeration budget is exhausted.

    let totalDegeneracy = 1;
    for (let k = 0; k < n; k++) {
      const center = rule.reactionCenter?.[k] ?? [];
      const images = center.length > 0
        ? countRxnCenterImages(patterns[k], reactantSpeciesList[k].graph, currentMatches[k], center, k, RXN_CENTER_IMAGE_BUDGET)
        : null;
      const kDeg = images ?? countEmbeddingDegeneracy(patterns[k], reactantSpeciesList[k].graph, currentMatches[k]);
      totalDegeneracy *= kDeg;
    }

    const countGraphBonds = (graph: SpeciesGraph): number => {
      let edgeEndpoints = 0;
      for (const mol of graph.molecules) {
        for (const comp of mol.components) {
          edgeEndpoints += comp.edges.size;
        }
      }
      return Math.floor(edgeEndpoints / 2);
    };

    const reactantPatternBondCount = patterns.reduce((sum, p) => sum + countGraphBonds(p), 0);
    const productPatternBondCount = rule.products.reduce((sum, p) => sum + countGraphBonds(p), 0);
    const hasPatternBondChange = reactantPatternBondCount !== productPatternBondCount;

    const hasSelectiveEquivalentSiteBonding = (() => {
      if (!hasPatternBondChange) return false;

      const countByName = (mol: Molecule): Map<string, { total: number; bound: number }> => {
        const map = new Map<string, { total: number; bound: number }>();
        for (const comp of mol.components) {
          // Skip synthetic wildcard components added by completeMissingComponents.
          // These are background expansions (e.g. b!? on A when only b was written in the rule)
          // and should NOT be counted as explicitly-constrained equivalent sites.
          if ((comp as Component & { syntheticWildcard?: boolean }).syntheticWildcard) continue;
          const entry = map.get(comp.name) ?? { total: 0, bound: 0 };
          entry.total += 1;
          if (comp.edges.size > 0) entry.bound += 1;
          map.set(comp.name, entry);
        }
        return map;
      };

      const moleculeSignature = (mol: Molecule): string => {
        const names = mol.components.map((comp) => comp.name).sort();
        return `${mol.name}|${names.join(',')}`;
      };

      const reactantMolecules = patterns.flatMap((pat) => pat.molecules);
      const productMolecules = rule.products.flatMap((pat) => pat.molecules);

      for (const rMol of reactantMolecules) {
        const sig = moleculeSignature(rMol);
        const matches = productMolecules.filter((pMol) => moleculeSignature(pMol) === sig);
        if (matches.length !== 1) continue;

        const pMol = matches[0];
        const rCounts = countByName(rMol);
        const pCounts = countByName(pMol);

        for (const [name, rEntry] of rCounts.entries()) {
          if (rEntry.total < 2) continue;
          const pEntry = pCounts.get(name);
          if (!pEntry) continue;
          const deltaBound = pEntry.bound - rEntry.bound;
          if (deltaBound > 0 && deltaBound < rEntry.total) {
            return true;
          }
        }
      }

      return false;
    })();

    const hasWildcardBoundPattern = patterns.some((pat) =>
      pat.molecules.some((mol) => mol.components.some((comp) => comp.wildcard === '+'))
    );
    const hasBondTopologyOps =
      rule.addBonds.length > 0 ||
      rule.deleteBonds.length > 0 ||
      rule.changeStates.length > 0 ||
      rule.deleteMolecules.length > 0 ||
      hasPatternBondChange;
    const hasPureStateChangeOps =
      rule.changeStates.length > 0 &&
      rule.addBonds.length === 0 &&
      rule.deleteBonds.length === 0 &&
      rule.deleteMolecules.length === 0;

    // For pure state-change rules, symmetry-broken matching is disabled
    // (matchSymmetryBreaking=false) so every distinct assignment is enumerated as
    // its own event and each contributes multiplicity 1. Using the full map count
    // across all of them would over-count: N events x N full maps each = N².
    const stateChangeEmbeddingDegeneracy = hasPureStateChangeOps ? 1 : totalDegeneracy;
    const useEmbeddingDegeneracy =
      hasBondTopologyOps &&
      (
        hasRepeatedReactantPatterns ||
        hasWildcardBoundPattern ||
        hasSelectiveEquivalentSiteBonding ||
        (hasPureStateChangeOps && totalDegeneracy > 1) ||
        currentMatches.some((match, k) =>
          shouldApplyDegeneracyStatFactor(patterns[k], reactantSpeciesList[k].graph, match)
        )
      );

    // Default n-ary multiplicity should not include full embedding automorphisms,
    // since event-signature deduplication already collapses symmetry-equivalent mappings.
    // Only re-introduce embedding degeneracy when the reaction center genuinely has
    // multiple equivalent choices (BAB-like or wildcard-bound cases).
    let multiplicity = (useEmbeddingDegeneracy ? totalDegeneracy : 1) / ruleSymmetryFactor;

    if (hasPureStateChangeOps && stateChangeEmbeddingDegeneracy > 1) {
      multiplicity = Math.max(multiplicity, stateChangeEmbeddingDegeneracy / ruleSymmetryFactor);
    }

    // For bond-topology rules, symmetry-broken matching can collapse equivalent
    // molecule-level embeddings when a reactant is a symmetric multi-molecule complex
    // (e.g., TRIF or SARM binding to either monomer of a TLR3 homodimer).
    // Only applies when the full (non-SB) map count exceeds the SB map count — i.e. when
    // symmetry breaking actually eliminated some equivalent matches. For asymmetric complexes,
    // noSB == SB so no correction is needed (the two distinct matches already create two
    // separate reaction paths with distinct products).
    // Only applies for heterodimeric rules (no repeated reactant patterns) to avoid
    // double-counting in symmetric cases already handled by ruleSymmetryFactor.
    if (hasBondTopologyOps && !hasPureStateChangeOps && !hasRepeatedReactantPatterns && multiplicity <= 1) {
      let bondTopoFullMapCount = 1;
      let bondTopoSBMapCount = 1;
      for (let k = 0; k < n; k++) {
        const fullMaps = profiledFindAllMaps(patterns[k], reactantSpeciesList[k].graph, { symmetryBreaking: false });
        const sbMaps = profiledFindAllMaps(patterns[k], reactantSpeciesList[k].graph, { symmetryBreaking: true });
        bondTopoFullMapCount *= fullMaps.length || 1;
        bondTopoSBMapCount *= sbMaps.length || 1;
      }
      if (bondTopoFullMapCount > bondTopoSBMapCount * totalDegeneracy) {
        multiplicity = Math.max(multiplicity, bondTopoFullMapCount / (bondTopoSBMapCount * ruleSymmetryFactor));
      }
    }

    // Tuple-aware correction for identical reactant patterns.
    // `ruleSymmetryFactor` divides by factorial(groupSize) for each identical-pattern group,
    // but for a concrete species tuple we should divide only by repeats of the SAME species
    // within that group (e.g., A+A distinct pair: no 1/2; A+A same species: 1/2 applies).
    const identicalPatternGroups = new Map<string, number[]>();
    // Track whether a tuple-aware combinatorial correction was applied; this will
    // prevent the SB-enumeration fallback from *lowering* that corrected value.
    let tupleAwareCorrectionApplied = false;
    for (let idx = 0; idx < n; idx++) {
      const key = getPatternSymmetryKey(patterns[idx]);
      const group = identicalPatternGroups.get(key);
      if (group) group.push(idx);
      else identicalPatternGroups.set(key, [idx]);
    }

    for (const group of identicalPatternGroups.values()) {
      if (group.length < 2) continue;

      const speciesCountInGroup = new Map<number, number>();
      for (const patternIdx of group) {
        const speciesIdx = currentSpeciesIndices[patternIdx];
        speciesCountInGroup.set(speciesIdx, (speciesCountInGroup.get(speciesIdx) || 0) + 1);
      }

      // BNG2 STATISTICAL FACTOR (RxnRule::find_reaction_center):
      //
      //   multScale = 1 / (|RG| / |Stab|) / crg_permutations
      //
      // RG is the set of reactant-graph automorphisms whose induced permutation
      // on the product is *itself* a product automorphism; Stab is the subgroup
      // of RG that fixes the reaction centre. For a group of `k` identical
      // reactant patterns, the divisor is therefore NOT simply k! — it is k!
      // only when exchanging the group maps the product onto itself up to
      // product-graph isomorphism. Verified against BNG2's own multScale
      // instrumentation:
      //
      //   ERK(s~P,b) + ERK(s~P,b) -> ERK(s~P,b!1).ERK(s~P,b!1) k
      //     symmetric product      -> multScale 0.5  (|RG|=2, |Stab|=1, p_auto=2)
      //   A(x,y,z) + A(x,y,z) -> A(x!1,y~P,z).A(x!1,y~U,z) k
      //     asymmetric product     -> multScale 1    (|RG|=1, |Stab|=1, p_auto=1)
      //
      // In the second rule the product records which pattern index became
      // y~P, so the exchange is not a product automorphism, the swap never
      // enters RG, and BNG2 applies no division at all.
      //
      // That factor is per *instance* and never depends on which species the
      // patterns landed on. BNG2 still enumerates every ordering of identical
      // patterns (`expand_rule` takes the Cartesian product of the per-pattern
      // match sets) and `RxnList::add` sums the stat factors of the orderings
      // that fold into one entry. So for a symmetric-product dimerisation of
      // two distinct species, the orderings [cyt, nuc] and [nuc, cyt] each
      // carry 0.5 and sum to 1 (`k_dimer`), while the homodimerisation has a
      // single ordering and keeps 0.5 (`0.5*k_dimer`).
      //
      // The old "tuple-aware" correction keyed on the species tuple instead of
      // product symmetry, dividing out the 1/2 exactly when the two identical
      // patterns mapped onto *distinct* species. That is the case where BNG2
      // emits the second ordering and sums, so the correction double-counted:
      // each ordering got factor 1 and the pair summed to 2, halving `k_dimer`
      // in the ODE RHS and shifting the erk_nuclear_translocation trajectory by
      // up to 6.3%.
      //
      // No adjustment is applied here: multiplicity keeps its initialised value
      // totalDegeneracy / ruleSymmetryFactor, which is the per-instance
      // 1 / (|RG| / |Stab|) that BNG2 assigns. The orderings BNG2 also
      // enumerates are summed downstream by the reaction-key merge.

      // Maintain the historical special-case behavior for pure self-association
      // / directional-pair situations handled below (these may restore a
      // factorial(group.length) factor when multiplicity would otherwise be < 1).

      const isDirectionalSingleMoleculePairAssociation =
        group.length === 2 &&
        speciesCountInGroup.size === 1 &&
        rule.deleteBonds.length === 0 &&
        rule.changeStates.length === 0 &&
        rule.deleteMolecules.length === 0 &&
        rule.products.length === 1 &&
        productPatternBondCount > reactantPatternBondCount &&
        patterns[group[0]].molecules.length === 1 &&
        patterns[group[1]].molecules.length === 1 &&
        rule.products[0].molecules.length === 2 &&
        (() => {
          const productMolA = rule.products[0].molecules[0];
          const productMolB = rule.products[0].molecules[1];
          const boundSig = (mol: Molecule): string =>
            mol.components
              .filter((comp) => comp.edges.size > 0)
              .map((comp) => comp.name)
              .sort()
              .join(',');
          return boundSig(productMolA) !== boundSig(productMolB);
        })();

      const isPureSelfAssociation =
        group.length === 2 &&
        speciesCountInGroup.size === 1 &&
        rule.addBonds.length > 0 &&
        rule.deleteBonds.length === 0 &&
        rule.changeStates.length === 0 &&
        rule.deleteMolecules.length === 0 &&
        rule.products.length === 1 &&
        totalDegeneracy === 1;

      // Restore factorial(group.length) for pure self-association / directional-pair
      // cases when multiplicity would otherwise be < 1.
      if ((isPureSelfAssociation || isDirectionalSingleMoleculePairAssociation) && multiplicity < 1) {
        multiplicity *= factorial(group.length);
        // For directional (asymmetric-bond) cases, the two identical reactant patterns play
        // different roles (e.g. Actin.p bonds to Actin.m), so each ordered pair is a DISTINCT
        // physical event. The ruleSymmetryFactor divide-by-2 is incorrect for this case and
        // the correction above (×2) must be protected from the exact-enumeration fallback,
        // which would otherwise reduce multiplicity back to 0.5.
        // Note: isPureSelfAssociation (symmetric bond, e.g. FGFR.d + FGFR.d) must still allow
        // the enum fallback to correct multiplicity to 0.5, so we only protect directional cases.
        if (isDirectionalSingleMoleculePairAssociation) {
          tupleAwareCorrectionApplied = true;
        }
      }
    }

    // Exact-enumeration fallback for identical-pattern groups (bounded cost).
    // Enumerate full (non-SB) match maps for each pattern and count how many
    // ordered match-tuples produce the same product outcome; convert to the
    // multiplicity used by the rate calculation by dividing out the rule symmetry.
    if (hasRepeatedReactantPatterns && n <= 4) {
      try {
        // Use symmetry-broken (SB) maps + degeneracy weights so we count unique
        // event-signatures and weight them by how many full (non-SB) embeddings
        // each SB map represents. This avoids overcounting automorphism-equivalent
        // full-maps while still reconstructing the true ordered embedding total.
        const sbMapsForPattern: MatchMap[][] = new Array(n);
        const sbDegeneracyForPattern: number[][] = new Array(n);
        let totalSBCombos = 1;
        for (let k = 0; k < n; k++) {
          const sbMaps = profiledFindAllMaps(patterns[k], reactantSpeciesList[k].graph, { symmetryBreaking: true })
            .filter((m) =>
              this.matchRespectsExplicitComponentBondCounts(patterns[k], reactantSpeciesList[k].graph, m) &&
              this.matchRespectsProductImpliedFreeConstraints(rule, patterns[k], reactantSpeciesList[k].graph, m)
            );
          // Fall back to the provided match (if any) to ensure at least one representative
          sbMapsForPattern[k] = sbMaps.length > 0 ? sbMaps : (currentMatches[k] ? [currentMatches[k]] : []);
          // Precompute degeneracy (how many full embeddings each SB map represents)
          sbDegeneracyForPattern[k] = sbMapsForPattern[k].map((m) => profiledDegeneracy(patterns[k], reactantSpeciesList[k].graph, m) || 1);
          totalSBCombos *= Math.max(1, sbMapsForPattern[k].length);
          if (totalSBCombos > 2000) { totalSBCombos = Infinity; break; }
        }

        if (isFinite(totalSBCombos) && totalSBCombos > 0) {
          const targetProducts = this.applyRuleTransformation(rule, patterns, reactantSpeciesList.map(s => s.graph), currentMatches);
          if (targetProducts) {
            const targetCanon = targetProducts.map((p) => profiledCanonicalize(p)).join('||');

            // Cartesian over SB representatives; weight each tuple by the product of
            // per-pattern degeneracies so orderedFullEmbeddingCount is reconstructed.
            const lens = sbMapsForPattern.map((a) => a.length || 1);
            const idx = new Array(n).fill(0);
            const inc = () => {
              for (let i = 0; i < n; i++) {
                idx[i]++;
                if (idx[i] < lens[i]) return true;
                idx[i] = 0;
              }
              return false;
            };

            let first = true;
            let orderedFullEmbeddingCount = 0;
            while (first || inc()) {
              first = false;
              const candidateMatches: MatchMap[] = new Array(n).fill(null);
              // Compute weight correctly for repeated-species cases. When multiple
              // pattern positions map to the same concrete species, sbDegeneracy
              // values represent the pool of distinct full embeddings for that
              // species. The number of *ordered* ways to assign c_j distinct
              // embeddings to c_j pattern positions is P(e_j, c_j).
              const degBySpecies = new Map<number, number[]>();
              for (let k = 0; k < n; k++) {
                const sel = sbMapsForPattern[k][idx[k]] ?? currentMatches[k];
                candidateMatches[k] = sel;
                const speciesIdx = currentSpeciesIndices[k];
                const deg = sbDegeneracyForPattern[k][idx[k]] || 1;
                const arr = degBySpecies.get(speciesIdx) ?? [];
                arr.push(deg);
                degBySpecies.set(speciesIdx, arr);
              }

              let weight = 1;
              for (const [_, degArray] of degBySpecies.entries()) {
                // Prefer the common degeneracy if all entries agree (typical case).
                const common = degArray[0];
                if (degArray.every((d) => d === common)) {
                  const e = common;
                  const c = degArray.length;
                  // permutations P(e, c) = e * (e-1) * ... * (e-c+1)
                  let perm = 1;
                  for (let t = 0; t < c; t++) {
                    perm *= Math.max(1, e - t);
                  }
                  weight *= perm;
                } else {
                  // Fallback: multiply degeneracies (conservative).
                  weight *= degArray.reduce((s, v) => s * (v || 1), 1);
                }
              }

              const prod = this.applyRuleTransformation(rule, patterns, reactantSpeciesList.map(s => s.graph), candidateMatches);
              if (!prod) continue;
              const prodCanon = prod.map((p) => profiledCanonicalize(p)).join('||');
              if (prodCanon === targetCanon) {
                orderedFullEmbeddingCount += weight;
              }
            }

            const exactMultiplicity = orderedFullEmbeddingCount / ruleSymmetryFactor;
            if (Number.isFinite(exactMultiplicity) && exactMultiplicity > 0) {
              // Only accept enumeration when it *reduces* a previously-overcounted value.
              // Do not allow enumeration to *lower* multiplicity if a
              // tuple-aware combinatorial correction was previously applied
              // for identical-pattern groups (BNG2 semantics).
              if (!(tupleAwareCorrectionApplied && exactMultiplicity < multiplicity - 1e-12)) {
                if (exactMultiplicity < multiplicity - 1e-12) multiplicity = exactMultiplicity;
              }
            }
          }
        }
      } catch {
        // If enumeration fails or is too large, keep previously computed `multiplicity`.
      }
    }

    // 3. Apply Transformation
    const products = this.applyRuleTransformation(
      rule,
      patterns,
      reactantSpeciesList.map(s => s.graph),
      currentMatches
    );

    if (!products) return;
    if (!this.validateProducts(products)) return;

    const reactantBondCount = reactantSpeciesList.reduce((sum, s) => sum + countGraphBonds(s.graph), 0);
    const productBondCount = products.reduce((sum, g) => sum + countGraphBonds(g), 0);
    const hasConcreteBondChange = reactantBondCount !== productBondCount;

    // BioNetGen's per-rule instance count for a wildcard-bound rule is the number
    // of distinct reaction-centre images, which `totalDegeneracy` already is; the
    // free-site-count heuristic that used to raise `multiplicity` here counted
    // endpoints rather than centre images, and was a second source of the
    // `zhang_2021` `_R19`/`_R20` 4 -> 0.667 over-count. Nothing to restore.

    if (rule.isMatchOnce) {
      multiplicity = 1;
    }

    // 4. Resolve Product Species
    const productSpeciesList = products.map(p => this.addOrGetSpecies(p, speciesMap, speciesList, queue, signal));
    if (!this.checkProductConstraints(rule, productSpeciesList)) {
      return;
    }
    const productIndices = productSpeciesList.map((species) => species.index);
    const hasCarryThroughReactant = currentSpeciesIndices.some((reactantIdx) => productIndices.includes(reactantIdx));

    // 5. Volume Scaling
    const { scalingVolume } = this.getVolumeScalingInfo(reactantSpeciesList, productIndices.map(idx => allSpecies[idx]));

    const hasRateExpression = !!rule.rateExpression;
    const baseRateConstant = (rule as RxnRule & { isFunctionalRate?: boolean }).isFunctionalRate && rule.rateConstant === 0 ? 1 : rule.rateConstant;

    // BNG2 parity: TotalRate disables multiplicity (sf=1).
    const effectiveMultiplicity = rule.totalRate ? 1 : multiplicity;
    let effectiveRate = baseRateConstant * effectiveMultiplicity;

    // Compartment volume normalization is applied in the simulation RHS path.
    // Keep reaction constants in native model units here to avoid double scaling.

    // Arrhenius rate law calculation for N-ary rule
    if (rule.isArrhenius && this.energyService) {
      const deltaG = this.energyService.calculateDeltaG(reactantSpeciesList.map(s => s.graph), products);

      const phi = this.evaluateArrheniusParam(rule.arrheniusPhi, 0.5);
      const Eact = this.evaluateArrheniusParam(rule.arrheniusEact);
      const A = this.evaluateArrheniusParam(rule.arrheniusA, rule.rateConstant === 0 ? 1 : rule.rateConstant);

      // BNG2 parity: k = A * exp(-(Eact + phi * deltaG))
      // deltaG is already dimensionless (in units of RT) from EnergyService.
      // Do NOT divide by RT — verified against BNG2-generated catalysis.net.
      effectiveRate = A * Math.exp(-(Eact + phi * deltaG)) * effectiveMultiplicity;

      // Count-based compartment correction:
      // Models using setOption("NumberPerQuantityUnit", NA) specify seed species in molecule
      // counts and have real compartment volumes. The JIT state vector uses state[i] = count/V,
      // which equals NA * [M] (NA times molar concentration). For a bimolecular reaction:
      //   JIT flux = k * (NA*[A]) * (NA*[B]) * V
      //   BNG2 ODE  = kf_M * [A] * [B] * NA * V
      // Match requires: k = kf_M / NA. For n-reactant reactions: k = kf_M / NA^(n-1).
      // Unimolecular reactions (handled separately above) need no correction.
      // Signal: scalingVolume != 1.0 means real compartment volumes are in play.
      if (scalingVolume && scalingVolume !== 1.0) {
        const naParam = this.options.parameters?.get('NA') ?? this.options.parameters?.get('Navo');
        if (naParam !== undefined) {
          const naValue = this.evaluateArrheniusParam(naParam.toString(), 6.022e23);
          if (naValue > 1e20) { // sanity check: NA must be ~6e23
            const numReactants = currentSpeciesIndices.length;
            for (let r = 1; r < numReactants; r++) {
              effectiveRate /= naValue;
            }
          }
        }
      }
    }

    // There is no per-pattern automorphism division here. BioNetGen applies exactly
    // ONE statistical divisor per rule instance -- the one `computeRuleDivisor`
    // derives from `find_reaction_center` and `multiplicity` already carries.
    // `patternAutomorphismFactor` (the product over reactant patterns of the
    // molecule-level self-automorphism count `|Aut(rg)|`) was our own invention:
    // it is 24 for `zhang_2021`'s `Ang1_4(tie2bs,tie2bs,tie2bs,tie2bs)` where BNG2's
    // divisor is 1, and 1 for every rule where BNG2's divisor is 2 (`rafi`, `ERK`),
    // so it moved rates in the wrong direction in both families.

    // For Arrhenius rules: clear rateExpression so NET file writes numeric rate,
    // not the un-evaluatable "Arrhenius(phi, Eact)" string.
    let finalRateExpr = (rule as RxnRule & { isArrhenius?: boolean }).isArrhenius ? undefined : rule.rateExpression;
    let exprScaleFactor = multiplicity;

    if (hasRateExpression && finalRateExpr) {
      finalRateExpr = finalRateExpr.trim();
    }

    // BIO-NETGEN PARITY: Symmetry Factor Correction
    // For reactions with identical reactants (e.g., A + A -> B), BNG2 divides the rate by N!
    // where N is the multiplicity of the identical reactant.
    const reactantCounts = new Map<number, number>();
    for (const idx of currentSpeciesIndices) {
      reactantCounts.set(idx, (reactantCounts.get(idx) || 0) + 1);
    }

    // NOTE: We do NOT apply symmetry factor division (1/N!) here because 'multiplicity' calculation
    // for identical patterns (ruleSymmetryFactor) already accounts for it.
    // Applying it again would cause double-counting (e.g. 0.25*k instead of 0.5*k).

    // BNG2 NET PARITY: For identical-reactant bimolecular rules WITHOUT bond formation
    // (e.g. A+A→B state-change, logistic carrying-capacity terms like R+R→R),
    // BNG2 writes the full rate constant k in the NET (no 0.5 prefix).
    // The web was incorrectly writing 0.5*k because multiplicity = 1/2 was baked into storedRate.
    // NOTE: split the ruleSymmetryFactor (1/2) into a separate propensityFactor field so that:
    //   - NET file writes the full k (matches BNG2 convention for non-bond rules)
    //   - ODE/SSA simulation kernels apply propensityFactor implicitly (already do this)
    //
    // NOTE: For bond-FORMING symmetric A+A rules (e.g. gp130+gp130→gp130.gp130),
    // BNG2 *does* write 0.5*k in the NET. These are handled by the existing multiplicity
    // logic (symmetric bond → multiplicity=0.5, effectiveRate=0.5*k → NET writes "0.5*k").
    // Do NOT apply the split for bond-forming rules or we break that convention.
    let storedRate = effectiveRate;
    let storedExprScaleFactor = exprScaleFactor;
    let storedPropensityFactor: number | undefined = undefined;
    // Detect bond formation either from explicit ops (full parser) or from the
    // reactant→product bond count change (simplified parser / tests).
    const hasBondFormation =
      rule.addBonds.length > 0 || productPatternBondCount > reactantPatternBondCount;
    const isNonBondFormingSymmetricPair =
      hasRepeatedReactantPatterns && n === 2 && ruleSymmetryFactor > 1 &&
      !hasBondFormation &&
      // BNG2 convention for A+A symmetric non-bond rules:
      // - writes k  when a reactant molecule TYPE appears in products (state-change or carry-through)
      //   e.g. Droplet(s~1)+Droplet(s~1)→Droplet(s~2), A+A→A+B
      // - writes 0.5*k when the product is a completely NEW molecule type (pure combination)
      //   e.g. RA()+RA()→R2() (where R2 is a different molecule type from RA)
      // The propensityFactor=0.5 below is applied by the ODE/SSA kernel to correctly halve
      // the propensity for same-pool molecule selection.
      (() => {
        if (hasCarryThroughReactant) return true;
        // Check molecule-level carry-through: does the product contain any molecule
        // type that appears in the reactant patterns?
        const reactantMolNames = new Set<string>();
        for (const pat of patterns) {
          for (const mol of pat.molecules) {
            if (mol.name) reactantMolNames.add(mol.name);
          }
        }
        return rule.products.some(productPattern =>
          productPattern.molecules.some(mol => reactantMolNames.has(mol.name))
        );
      })();
    if (isNonBondFormingSymmetricPair) {
      storedRate = effectiveRate * ruleSymmetryFactor;
      storedExprScaleFactor = exprScaleFactor * ruleSymmetryFactor;
      storedPropensityFactor = 1 / ruleSymmetryFactor;
    }

    // 6. Record Reaction
    const rxn = new Rxn(
      currentSpeciesIndices,
      productIndices,
      storedRate,
      rule.name,
      {
        degeneracy: 1, // NOTE: Multiplicity is already in storedRate. ODE loop applies degeneracy again, so set to 1.
        propensityFactor: storedPropensityFactor,
        statFactor: storedExprScaleFactor,
        rateExpression: finalRateExpr,
        scalingVolume: scalingVolume,
        totalRate: rule.totalRate
      }
    );
    if (isIdentityReactionByGraph(rxn.reactants, rxn.products, speciesList)) {
      return;
    }

    // BNG2 treats reactions that differ only in bond labelling as one reaction.
    // The index-based key below cannot see that, so duplicates were emitted and
    // the reaction count drifted above BNG2's. Merge them the way BNG2
    // accumulates duplicates.
    const canonicalKey = canonicalReactionKey(rxn.reactants, rxn.products, rateIdentity(rule.name, rxn.rateExpression, rxn.rate), speciesList);
    const canonicalIdx = this.canonicalReactionIndex.get(canonicalKey);
    if (canonicalIdx !== undefined) {
      reactionsList[canonicalIdx].rate += rxn.rate;
      mergeReactionExpressionWithStatFactors(reactionsList[canonicalIdx], rxn);
      return;
    }
    this.canonicalReactionIndex.set(canonicalKey, reactionsList.length);

    const preserveOrderInKey = hasRateExpression;
    const rxnKey = getReactionKeyWithOrderMode(
      rxn.reactants,
      rxn.products,
      rule.name,
      preserveOrderInKey
    );
    const existingIdx = reactionIndexByKey.get(rxnKey);

    if (existingIdx === undefined) {
      reactionIndexByKey.set(rxnKey, reactionsList.length);
      reactionsList.push(rxn);
    } else {
      const sortedReactants = currentSpeciesIndices.slice().sort((a, b) => a - b);
      const sortedProducts = productIndices.slice().sort((a, b) => a - b);
      const isNoNetSpeciesChange =
        sortedReactants.length === sortedProducts.length &&
        sortedReactants.every((idx, pos) => idx === sortedProducts[pos]);

      if (hasCarryThroughReactant && multiplicity === 1 && isNoNetSpeciesChange) {
        return;
      }

      reactionsList[existingIdx].rate += rxn.rate;
      mergeReactionExpressionWithStatFactors(reactionsList[existingIdx], rxn);
      // Keep degeneracy fixed for n-ary merged reactions: multiplicity is already
      // accumulated in `rate`, and ODE/SSA kernels apply `degeneracy` multiplicatively.
      if (reactionsList[existingIdx].degeneracy !== undefined) {
        reactionsList[existingIdx].degeneracy = 1;
      }
    }

    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[applyNaryRule] Added reaction: [${currentSpeciesIndices.join(', ')}] -> [${productIndices.join(', ')}] rate=${effectiveRate}`);
    }
  }


  /**
   * FIX: Properly apply rule transformation
   * Handles degradation rules (X -> 0) by returning empty products array
   */
  private getPureStateChangePlan(rule: RxnRule): PureStateChangePlan | null {
    const cached = this.pureStateChangePlanCache.get(rule);
    if (cached !== undefined) return cached;

    const reject = (): null => {
      this.pureStateChangePlanCache.set(rule, null);
      return null;
    };

    // MoveConnected and DeleteMolecules add semantics beyond the product graph
    // itself, so neither can use the direct clone-and-update path.
    if (rule.isMoveConnected || rule.isDeleteMolecules) return reject();
    if (rule.reactants.length !== 1 || rule.products.length !== 1) return reject();

    const reactant = rule.reactants[0];
    const product = rule.products[0];
    if (reactant.compartment !== product.compartment) return reject();

    // One pattern molecule makes the product-to-reactant molecule mapping
    // unambiguous. Multi-molecule state rules retain the general path until an
    // exact, uniqueness-proving graph correspondence is available.
    if (reactant.molecules.length !== 1 || product.molecules.length !== 1) return reject();

    const reactantMol = reactant.molecules[0];
    const productMol = product.molecules[0];
    if (
      reactantMol.name !== productMol.name ||
      reactantMol.compartment !== productMol.compartment ||
      reactantMol.label !== productMol.label ||
      reactantMol.wildcard !== productMol.wildcard ||
      reactantMol.hasExplicitEmptyComponentList !== productMol.hasExplicitEmptyComponentList ||
      reactantMol.components.length !== productMol.components.length
    ) {
      return reject();
    }

    // Repeated component names can make the positional product correspondence
    // ambiguous even when the written arrays line up. Fall back rather than
    // guessing which repeated site the product intended to modify.
    const componentNames = new Set<string>();
    for (const component of reactantMol.components) {
      if (componentNames.has(component.name)) return reject();
      componentNames.add(component.name);
    }

    const adjacencySignature = (graph: SpeciesGraph): string => {
      const entries: string[] = [];
      for (const [endpoint, partners] of graph.adjacency) {
        entries.push(`${endpoint}>${[...partners].sort().join(',')}`);
      }
      entries.sort();
      return entries.join('|');
    };
    if (adjacencySignature(reactant) !== adjacencySignature(product)) return reject();

    const deltas: PureStateChangeDelta[] = [];
    const requiresUnboundTarget: PureStateChangePlan['requiresUnboundTarget'] = [];
    for (let componentIndex = 0; componentIndex < reactantMol.components.length; componentIndex++) {
      const reactantComponent = reactantMol.components[componentIndex];
      const productComponent = productMol.components[componentIndex];

      const reactantEdgeTargets = [...reactantComponent.edges.values()].sort((a, b) => a - b);
      const productEdgeTargets = [...productComponent.edges.values()].sort((a, b) => a - b);
      if (
        reactantComponent.name !== productComponent.name ||
        reactantComponent.wildcard !== productComponent.wildcard ||
        reactantComponent.syntheticWildcard !== productComponent.syntheticWildcard ||
        reactantEdgeTargets.length !== productEdgeTargets.length ||
        reactantEdgeTargets.some((target, index) => target !== productEdgeTargets[index])
      ) {
        return reject();
      }

      if (!productComponent.wildcard && productComponent.edges.size === 0) {
        requiresUnboundTarget.push({
          reactantComponentIndex: componentIndex,
          componentName: reactantComponent.name,
        });
      }

      if (reactantComponent.state === productComponent.state) continue;
      const fromState = reactantComponent.state;
      const toState = productComponent.state;
      if (!fromState || fromState === '?' || !toState || toState === '?') return reject();
      deltas.push({
        reactantComponentIndex: componentIndex,
        componentName: reactantComponent.name,
        fromState,
        toState,
      });
    }

    if (deltas.length === 0) return reject();
    const plan = { deltas, requiresUnboundTarget };
    this.pureStateChangePlanCache.set(rule, plan);
    return plan;
  }

  private tryApplyPureStateChangePlan(
    plan: PureStateChangePlan,
    reactantPatterns: SpeciesGraph[],
    reactantGraphs: SpeciesGraph[],
    matches: MatchMap[]
  ): SpeciesGraph | null {
    if (reactantPatterns.length !== 1 || reactantGraphs.length !== 1 || matches.length !== 1) return null;

    const target = reactantGraphs[0];
    const match = matches[0];
    if (!target || !match) return null;

    // Network species are connected, but callers can construct SpeciesGraph
    // directly. Preserve the general path's split behavior for malformed or
    // deliberately disconnected targets by declining the shortcut.
    if (
      target.molecules.length > 1 &&
      target.getConnectedComponentMolecules(0).size !== target.molecules.length
    ) {
      return null;
    }

    const targetMolIndex = match.moleculeMap.get(0);
    if (targetMolIndex === undefined || !target.molecules[targetMolIndex]) return null;

    const resolveTargetComponent = (
      reactantComponentIndex: number,
      componentName: string
    ): { molIndex: number; componentIndex: number; component: Component } | null => {
      const mappedComponent = match.componentMap.get(`0.${reactantComponentIndex}`);
      if (!mappedComponent) return null;
      const dotIndex = mappedComponent.indexOf('.');
      if (dotIndex <= 0) return null;
      const molIndex = Number(mappedComponent.slice(0, dotIndex));
      const componentIndex = Number(mappedComponent.slice(dotIndex + 1));
      if (!Number.isInteger(molIndex) || !Number.isInteger(componentIndex) || molIndex !== targetMolIndex) {
        return null;
      }
      const component = target.molecules[molIndex]?.components[componentIndex];
      if (!component || component.name !== componentName) return null;
      return { molIndex, componentIndex, component };
    };

    for (const required of plan.requiresUnboundTarget) {
      const resolved = resolveTargetComponent(
        required.reactantComponentIndex,
        required.componentName
      );
      if (!resolved) return null;
      const endpoint = `${resolved.molIndex}.${resolved.componentIndex}`;
      if (resolved.component.edges.size > 0 || (target.adjacency.get(endpoint)?.length ?? 0) > 0) {
        return null;
      }
    }

    const product = target.clone();
    for (let molIndex = 0; molIndex < product.molecules.length; molIndex++) {
      const productMol = product.molecules[molIndex];
      productMol._sourceKey = `0:${molIndex}`;
      productMol._sourceR = 0;
      productMol._sourceM = molIndex;
      // These are transient builder markers, not species metadata. The general
      // builder starts with a fresh molecule structure on every transformation.
      productMol._explicitUnboundComponents = undefined;
      productMol._explicitBondedComponents = undefined;
    }

    for (const delta of plan.deltas) {
      const resolved = resolveTargetComponent(delta.reactantComponentIndex, delta.componentName);
      if (!resolved) return null;
      const targetComponent = resolved.component;
      const productComponent =
        product.molecules[resolved.molIndex]?.components[resolved.componentIndex];
      if (
        !productComponent ||
        targetComponent.state !== delta.fromState
      ) {
        return null;
      }
      productComponent.state = delta.toState;
    }

    return product;
  }

  private applyRuleTransformation(
    rule: RxnRule,
    reactantPatterns: SpeciesGraph[],
    reactantGraphs: SpeciesGraph[],
    matches: MatchMap[]
  ): SpeciesGraph[] | null {
    const getMolKeyFromMol = (mol: Molecule): number => {
      if (mol._sourceR !== undefined && mol._sourceM !== undefined) {
        return (mol._sourceR << 16) | mol._sourceM;
      }
      const key = mol._sourceKey;
      if (!key) return -1;
      const idx = key.indexOf(':');
      const r = parseInt(key.slice(0, idx), 10);
      const m = parseInt(key.slice(idx + 1), 10);
      mol._sourceR = r;
      mol._sourceM = m;
      return (r << 16) | m;
    };

    const _profStart = profilingEnabled ? performance.now() : 0;
    try {
      const pureStateChangePlan = this.getPureStateChangePlan(rule);
      if (pureStateChangePlan) {
        const product = this.tryApplyPureStateChangePlan(
          pureStateChangePlan,
          reactantPatterns,
          reactantGraphs,
          matches
        );
        if (product) return [product];
      }

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(
          `[applyTransformation] Rule ${rule.name}, ${reactantGraphs.length} reactants -> ${rule.products.length} products`
        );
      }

      const productGraphs: SpeciesGraph[] = [];
      const usedReactantMolsInReaction = new Set<number>(); // Tracks reactant graph molecules surviving in products
      const usedReactantPatternMols = new Set<number>(); // Tracks reactant pattern molecules (for mapping correctness)
      const survivorLocations = reactantGraphs.map(() => new Map<number, { graphIdx: number; molIdx: number }>()); // NOTE: Track where survivors ended up

      // 0. Identify which molecules were explicitly matched by the rule (Targeted for transformation/deletion)
      const matchedReactantKeys = new Set<number>();
      for (let i = 0; i < matches.length; i++) {
        const map = matches[i];
        for (const [_patMolIdx, tgtMolIdx] of map.moleculeMap.entries()) {
          matchedReactantKeys.add((i << 16) | tgtMolIdx);
        }
      }

      // 1. Build explicit products from patterns
      for (const productPattern of rule.products) {
        const fullProductGraph = this.buildProductGraph(
          productPattern,
          reactantPatterns,
          reactantGraphs,
          matches,
          usedReactantPatternMols,
          !!(rule as RxnRule & { isMoveConnected?: boolean }).isMoveConnected,
          rule,
          rule.products.indexOf(productPattern)
        );

        if (!fullProductGraph) {
          if (shouldLogNetworkGenerator) {
            debugNetworkLog('[applyTransformation] Failed to construct product graph; treating as no-op');
          }
          return null;
        }

        // COMPARTMENT COMPATIBILITY: For bimolecular rules that form bonds between molecules
        // from different reactant complexes, verify that the bonded partners were in
        // compartments that are the same or adjacent in the original reactants.
        // BNG2 rejects, e.g., Im@NU binding TF@CP because NM separates NU and CP.
        // We use the adjacency map to find all bonds and check original (pre-override) compartments.
        if (this.options.compartments && this.options.compartments.length > 0 && reactantGraphs.length >= 2) {
          const seenBondIds = new Set<string>();
          let invalidInterComplexBond = false;
          for (const [key1, partners] of fullProductGraph.adjacency) {
            if (invalidInterComplexBond) break;
            const mol1Idx = parseInt(key1, 10);
            const mol1: Molecule = fullProductGraph.molecules[mol1Idx];
            if (!mol1) continue;
            getMolKeyFromMol(mol1); // Ensures _sourceR and _sourceM are initialized
            const r1 = mol1._sourceR;
            const rMol1 = mol1._sourceM;
            if (r1 === undefined || rMol1 === undefined) continue;

            for (const key2 of partners) {
              const bondId = key1 < key2 ? `${key1}||${key2}` : `${key2}||${key1}`;
              if (seenBondIds.has(bondId)) continue;
              seenBondIds.add(bondId);
              const mol2Idx = parseInt(key2, 10);
              const mol2: Molecule = fullProductGraph.molecules[mol2Idx];
              if (!mol2) continue;
              getMolKeyFromMol(mol2); // Ensures _sourceR and _sourceM are initialized
              const r2 = mol2._sourceR;
              if (r1 === r2) continue; // Intra-complex bond — always OK
              const rMol2 = mol2._sourceM;
              if (r2 === undefined || rMol2 === undefined) continue;

              // Use ORIGINAL reactant compartments (before product-pattern compartment override)
              const gr1 = reactantGraphs[r1];
              const gr2 = reactantGraphs[r2];
              const origComp1 = gr1?.molecules[rMol1]?.compartment || gr1?.compartment;
              const origComp2 = gr2?.molecules[rMol2]?.compartment || gr2?.compartment;
              if (!origComp1 || !origComp2) continue; // No compartment info — allow
              if (origComp1 === origComp2) continue;  // Same compartment — valid
              if (this.areCompartmentsAdjacent(origComp1, origComp2)) continue; // Adjacent — valid
              // Non-adjacent: BNG2 disallows this binding
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[applyTransformation] Rejecting inter-reactant bond between non-adjacent compartments ${origComp1} (r${r1}) and ${origComp2} (r${r2})`);
              }
              invalidInterComplexBond = true;
              break;
            }
          }
          if (invalidInterComplexBond) return null;
        }

        // BIO-NETGEN PARITY: Split the product graph into connected components.
        // Often a single product pattern like A.B produces one connected component,
        // but if bonds are broken explicitly or implicitly, it might split.
        const explicitUnboundBySource = new Map<number, Set<number>>();
        const explicitBondedBySource = new Map<number, Set<number>>();
        for (const mol of fullProductGraph.molecules) {
          const mKey = getMolKeyFromMol(mol);
          if (mKey === -1) continue;
          if (mol._explicitUnboundComponents && mol._explicitUnboundComponents.size > 0) {
            explicitUnboundBySource.set(mKey, new Set(mol._explicitUnboundComponents));
          }
          if (mol._explicitBondedComponents && mol._explicitBondedComponents.size > 0) {
            explicitBondedBySource.set(mKey, new Set(mol._explicitBondedComponents));
          }
        }

        const splitProducts = fullProductGraph.split(); // Use fullProductGraph.split()

        for (const subgraph of splitProducts as Array<SpeciesGraph>) {
          for (const mol of subgraph.molecules) {
            const mKey = getMolKeyFromMol(mol);
            if (mKey === -1) continue;
            const explicitUnbound = explicitUnboundBySource.get(mKey);
            if (explicitUnbound && explicitUnbound.size > 0) {
              mol._explicitUnboundComponents = explicitUnbound;
            }
            const explicitBonded = explicitBondedBySource.get(mKey);
            if (explicitBonded && explicitBonded.size > 0) {
              mol._explicitBondedComponents = explicitBonded;
            }
          }
        }

        // BIO-NETGEN PARITY (SpeciesGraph::splitConnectedComponents): every reactant
        // molecule this product pattern explicitly names must survive in ONE connected
        // component. BNG2 assigns each product molecule to the pattern that declared it
        // and aborts the whole reaction when a declared pattern ends up with no component
        // of its own — which is what a rule does when its only effect is to break the bond
        // holding its single written product together, e.g.
        // R(Y1~P!1).S(PTP~O!1) -> R(Y1~U).S(PTP~O). Keeping one fragment and dropping the
        // other would silently delete the released partner.
        const patternOwnedKeys = fullProductGraph.patternOwnedMolKeys;
        if (patternOwnedKeys && patternOwnedKeys.size > 0 && splitProducts.length > 1) {
          let owningComponents = 0;
          for (const subgraph of splitProducts as Array<SpeciesGraph>) {
            for (const mol of subgraph.molecules) {
              const mKey = getMolKeyFromMol(mol);
              if (mKey !== -1 && patternOwnedKeys.has(mKey)) {
                owningComponents++;
                break;
              }
            }
          }
          if (owningComponents !== 1) {
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(
                `[applyTransformation] Rule ${rule.name} REJECTED: product pattern ${productPattern.toString()} spans ${owningComponents} disconnected components.`
              );
            }
            return null;
          }
        }

        // CRITICAL FIX FOR BIO-NETGEN PARITY:
        // A single product pattern like "A().B()" should still be rejected if it resolves
        // to multiple disconnected components that all originate from explicitly matched
        // reactant molecules. However, transformations can legitimately disconnect extra
        // bystander molecules (not matched by the reactant pattern), and BNG2 drops those
        // bystanders rather than rejecting the reaction.
        let productsToKeep = splitProducts;
        if (splitProducts.length > 1) {
          const anchored = splitProducts.filter((subgraph) =>
            subgraph.molecules.some((mol) => {
              const mKey = getMolKeyFromMol(mol);
              return mKey !== -1 && matchedReactantKeys.has(mKey);
            })
          );
          const productPatternMolNames = new Set(productPattern.molecules.map((mol) => mol.name));
          const anchoredMatchingPattern = anchored.filter((subgraph) =>
            subgraph.molecules.some((mol) => productPatternMolNames.has(mol.name))
          );
          // A fragment left over from a *different* product pattern is also anchored and can
          // share a molecule name — e.g. a catalytic rule whose substrate is still unconsumed
          // while the catalyst pattern is processed. Matching on names alone cannot separate
          // `Ras(sos,a~p)` from `Ras(sos!1).Sos(ras!1)`, so fall back to the single anchored
          // component that accounts for every molecule of this product pattern.
          const anchoredCoveringPattern = anchored.filter((subgraph) => {
            const names = new Set(subgraph.molecules.map((mol) => mol.name));
            return productPattern.molecules.every((mol) => names.has(mol.name));
          });

          if (anchored.length === 1) {
            productsToKeep = anchored;
          } else if (anchoredMatchingPattern.length === 1) {
            // If multiple anchored components exist, keep the one matching the molecule
            // identity of the current product pattern and let other product patterns
            // account for the remaining anchored fragments.
            productsToKeep = anchoredMatchingPattern;
          } else if (anchoredCoveringPattern.length === 1) {
            productsToKeep = anchoredCoveringPattern;
          } else {
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[applyTransformation] Rule ${rule.name} REJECTED: Product pattern yielded ${splitProducts.length} disconnected anchored components.`);
            }
            return null;
          }
        }

        for (const subgraph of productsToKeep) {
          // DEDUPLICATION
          let isAlreadyIncluded = false;
          for (const mol of subgraph.molecules) {
            const mKey = getMolKeyFromMol(mol);
            if (mKey !== -1 && usedReactantMolsInReaction.has(mKey)) {
              isAlreadyIncluded = true;
              break;
            }
          }

          if (!isAlreadyIncluded) {
            productGraphs.push(subgraph);
            const graphIdx = productGraphs.length - 1;

            // NOTE: Track survivor locations
            for (let i = 0; i < subgraph.molecules.length; i++) {
              const mol = subgraph.molecules[i];
              const mKey = getMolKeyFromMol(mol);
              if (mKey !== -1) {
                usedReactantMolsInReaction.add(mKey);
                const rIdx = mol._sourceR;
                const mIdx = mol._sourceM;
                if (rIdx !== undefined && mIdx !== undefined) {
                  survivorLocations[rIdx].set(mIdx, { graphIdx, molIdx: i });
                }
              }
            }
          } else if (shouldLogNetworkGenerator) {
            const sourceKeys = new Set<string>();
            for (const mol of subgraph.molecules) {
              if (mol._sourceKey) sourceKeys.add(mol._sourceKey);
            }
            debugNetworkLog(`[applyTransformation] Skipping duplicate product fragment containing molecules: ${Array.from(sourceKeys).join(', ')}`);
          }
        }
      }

      // NOTE: Pre-calculate component state changes for MoveConnected rules
      // This allows us to propagate state changes (like 'loc') to bystanders in the connected component.
      const survivorDeltas = new Map<number, { comp: string, state: string }[]>();
      if ((rule as RxnRule & { isMoveConnected?: boolean }).isMoveConnected) {
        for (let ri = 0; ri < reactantGraphs.length; ri++) {
          const rg = reactantGraphs[ri];

          // Map of survivors in THIS reactant graph
          // NOTE: Track survivor locations
          for (const [mIdx, loc] of survivorLocations[ri].entries()) {
            const oldMol = rg.molecules[mIdx];
            const newMol = productGraphs[loc.graphIdx].molecules[loc.molIdx];
            const sourceKeyNum = (ri << 16) | mIdx;

            const changes: { comp: string, state: string }[] = [];

            // Build a lookup map for new components to avoid O(N*M) linear search
            const newComponentsMap = new Map<string, typeof newMol.components[0]>();
            for (const c of newMol.components) {
              newComponentsMap.set(c.name, c);
            }

            for (const oldC of oldMol.components) {
              const newC = newComponentsMap.get(oldC.name);
              if (newC && newC.state !== undefined && newC.state !== oldC.state) {
                changes.push({ comp: oldC.name, state: newC.state });
              }
            }
            if (changes.length > 0) {
              survivorDeltas.set(sourceKeyNum, changes);
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[applyTransformation] Recorded MoveConnected delta for ${sourceKeyNum}: ${JSON.stringify(changes)}`);
              }
            }
          }
        }
      }

      // Mirror BNG2 MolDel auto-mode per reactant pattern (RxnRule.pm):
      // - molecule-level deletion when DeleteMolecules is set OR only a subset of the
      //   matched reactant-pattern molecules are deleted
      // - whole-species deletion when all matched reactant-pattern molecules are deleted
      //   and DeleteMolecules is NOT set
      const deletesWholeSpeciesByReactant = new Array<boolean>(reactantGraphs.length).fill(false);
      for (let r = 0; r < reactantGraphs.length; r++) {
        const reactantPattern = rule.reactants[r];
        const match = matches[r];
        if (!reactantPattern || !match) continue;

        const patternMolCount = reactantPattern.molecules.length;
        if (patternMolCount === 0) continue;

        let mappedCount = 0;
        let deletedCount = 0;
        for (let pMolIdx = 0; pMolIdx < patternMolCount; pMolIdx++) {
          const targetMolIdx = match.moleculeMap.get(pMolIdx);
          if (targetMolIdx === undefined) continue;
          mappedCount++;
          if (!usedReactantMolsInReaction.has((r << 16) | targetMolIdx)) {
            deletedCount++;
          }
        }

        // Be conservative if mapping is incomplete.
        if (mappedCount !== patternMolCount) continue;

        const usesMoleculeDeletionMode = rule.isDeleteMolecules || deletedCount < patternMolCount;
        deletesWholeSpeciesByReactant[r] = !usesMoleculeDeletionMode && deletedCount === patternMolCount;
      }

      // 2. SELECTIVE ORPHAN HARVESTING (BioNetGen Parity Fix 2.0 + Merge Fix)
      // Identify connected components of molecules that were NOT mapped to explicit products.
      // - If anchored to survivor: Merge.
      // - If NOT anchored:
      //   Check if any molecule in the orphan cluster was MATCHED by the rule.
      //   - If MATCHED: It was deleted (e.g. A->0). Discard cluster.
      //   - If NOT MATCHED: It is a bystander (e.g. C3 attached to FB->0). PRESERVE cluster as new product.

      for (let r = 0; r < reactantGraphs.length; r++) {
        const rg = reactantGraphs[r];
        const visitedInOrphanCheck = new Set<number>();

        for (let m = 0; m < rg.molecules.length; m++) {
          const key = (r << 16) | m;
          if (usedReactantMolsInReaction.has(key) || visitedInOrphanCheck.has(m)) continue;

          // Found unvisited orphan seed. Traverse its connected component in the Reactant Graph.
          const clusterIndices = new Set<number>();
          const queue = [m];
          visitedInOrphanCheck.add(m);
          clusterIndices.add(m);

          let anchorGraphIdx = -1; // -1 means no anchor found yet
          let isAnchoredToSurvivor = false;
          let touchesMatchedBoundary = false;
          const anchors = new Map<number, { graphIdx: number, molIdx: number }>();

          let head = 0;
          while (head < queue.length) {
            const currM = queue[head++];

            // Check neighbors (optimized via precomputed neighborList to completely avoid string keys and map lookups)
            for (const nM of rg.neighborList[currM]) {
              const nKeyNum = (r << 16) | nM;

              if (usedReactantMolsInReaction.has(nKeyNum)) {
                // Connected to a survivor!
                isAnchoredToSurvivor = true;
                const loc = survivorLocations[r].get(nM);
                if (loc) {
                  anchors.set(nKeyNum, loc);
                  if (anchorGraphIdx === -1) {
                    anchorGraphIdx = loc.graphIdx;
                  }
                }
              } else if (matchedReactantKeys.has(nKeyNum)) {
                // Connected to a molecule that is being deleted/transformed.
                // Treat as boundary. Whether this orphan survives is decided below based
                // on BNG2 deletion mode for this reactant (whole-species vs molecule-level).
                touchesMatchedBoundary = true;
                continue;
              } else if (!visitedInOrphanCheck.has(nM)) {
                visitedInOrphanCheck.add(nM);
                clusterIndices.add(nM);
                queue.push(nM);
              }
            }
          }

          if (isAnchoredToSurvivor && anchorGraphIdx !== -1) {
            // Harvest this cluster into the target graph (MERGE)
            const targetGraph = productGraphs[anchorGraphIdx];

            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[applyTransformation] Merging orphan fragment into graph ${anchorGraphIdx}: reactant ${r}, mols [${Array.from(clusterIndices).join(',')}]`);
            }

            const oldToNewIdx = new Map<number, number>();
            const survivingInCluster = new Set<number>();
            for (const idx of clusterIndices) {
              if (!matchedReactantKeys.has((r << 16) | idx)) {
                survivingInCluster.add(idx);
              }
            }

            // Classify the bystanders in this cluster against the anchor:
            //   reconnectable        — can rejoin a survivor's free bond site
            //   bondedToSurvivor     — attached to a surviving molecule; when the
            //     product pattern explicitly frees that bond BNG2 drops them
            //     silently, so we drop them too
            //   strandedBehindDelete  — attached only to a molecule the rule
            //     DELETES. Those become BNG2 surplus products: the reaction is
            //     void unless the rule carries DeleteMolecules.
            //     `complexdegradation`'s `A(b!1).B(a!1) -> A(b)` on
            //     `A(b!1).B(a!1,c!2).C(b!2)` is the case that distinguishes the
            //     last two: C hangs off the deleted B, so the rule must not fire.
            const reconnectable = new Set<number>();
            const bondedToSurvivor = new Set<number>();
            for (const oldIdx of survivingInCluster) {
              const oldMol = rg.molecules[oldIdx];
              for (let c = 0; c < oldMol.components.length; c++) {
                const neighbors = rg.adjacency.get(`${oldIdx}.${c}`);
                if (!neighbors) continue;
                for (const neighbor of neighbors) {
                  const _dIdx3 = neighbor.indexOf('.');
                  const nMStr = neighbor.slice(0, _dIdx3);
                  const nCStr = neighbor.slice(_dIdx3 + 1);
                  const nM = Number(nMStr);
                  const nC = Number(nCStr);
                  const nKey = (r << 16) | nM;
                  const anchorLoc = anchors.get(nKey);
                  if (!anchorLoc) continue;
                  bondedToSurvivor.add(oldIdx);
                  if (anchorLoc.graphIdx !== anchorGraphIdx) continue;

                  const anchorMol = targetGraph.molecules[anchorLoc.molIdx] as Molecule & {
                    _explicitUnboundComponents?: Set<number>;
                    _explicitBondedComponents?: Set<number>;
                  };
                  const explicitUnbound = anchorMol?._explicitUnboundComponents;
                  const explicitBonded = anchorMol?._explicitBondedComponents;
                  if (explicitUnbound && explicitUnbound.has(nC)) continue;
                  if (explicitBonded && explicitBonded.has(nC)) continue;

                  const anchorComp = anchorMol?.components?.[nC];
                  if (!anchorComp) continue;
                  // Allow multi-bond on the anchor component: only block if this SPECIFIC
                  // bond label from the reactant is already placed on the anchor component.
                  // A plain edges.size!==0 check incorrectly prevents the second bystander
                  // bonded to the same multi-valent anchor component (e.g. Im.cargo with two
                  // TF bonds in Motivating_example_cBNGL Rule29 MoveConnected).
                  const reactantBondLabel = oldMol.components[c]?.edges.keys().next().value;
                  if (reactantBondLabel != null && anchorComp.edges.has(reactantBondLabel)) continue;
                  if (reactantBondLabel == null && anchorComp.edges.size !== 0) continue;

                  reconnectable.add(oldIdx);
                }
              }
            }

            const strandedBehindDeletion = new Set<number>();
            for (const oldIdx of Array.from(survivingInCluster)) {
              if (reconnectable.has(oldIdx)) continue;
              if (bondedToSurvivor.has(oldIdx)) {
                survivingInCluster.delete(oldIdx);
              } else {
                strandedBehindDeletion.add(oldIdx);
                survivingInCluster.delete(oldIdx);
              }
            }

            if (strandedBehindDeletion.size > 0) {
              const strandedGraphs = this.harvestStrandedBystanders(r, rg, strandedBehindDeletion, rule.isDeleteMolecules);
              if (strandedGraphs === null) return null;
              productGraphs.push(...strandedGraphs);
            }

            if (survivingInCluster.size === 0) {
              for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add((r << 16) | oldIdx);
              continue;
            }

            // Clone only survivors and append to target graph
            for (const oldIdx of survivingInCluster) {
              const oldMol = rg.molecules[oldIdx];
              const newMol = this.cloneMoleculeStructure(oldMol);

              // NOTE: Apply MoveConnected deltas to bystanders
              if ((rule as RxnRule & { isMoveConnected?: boolean }).isMoveConnected && anchors.size > 0) {
                // Use the first available anchor to determine the delta
                const anchorKey = anchors.keys().next().value;
                if (anchorKey !== undefined) {
                  const deltas = survivorDeltas.get(anchorKey);
                  if (deltas) {
                    for (const delta of deltas) {
                      // ⚡ Bolt: replace array .find in inner loop
                      let compToUpdate: typeof newMol.components[0] | undefined;
                      for (let i = 0; i < newMol.components.length; i++) {
                        if (newMol.components[i].name === delta.comp) {
                          compToUpdate = newMol.components[i];
                          break;
                        }
                      }
                      if (compToUpdate) {
                        // Only update if the bystander has the component and it matches the "old" state implies it's ready to move?
                        // BNG2 semantics: "Move" implies setting the new state regardless,
                        // but usually it operates on compartments where everything moves.
                        // Here we just set it.
                        if (shouldLogNetworkGenerator) {
                          debugNetworkLog(`[applyTransformation] Propagating MoveConnected delta to bystander ${oldIdx}: ${delta.comp} -> ${delta.state}`);
                        }
                        compToUpdate.state = delta.state;
                      }
                    }
                  }
                }
              }
              newMol._sourceKey = `${r}:${oldIdx}`;
              newMol._sourceR = r;
              newMol._sourceM = oldIdx;
              if (!newMol.compartment && rg.compartment) newMol.compartment = rg.compartment;
              const newIdx = targetGraph.molecules.length;
              targetGraph.molecules.push(newMol);
              oldToNewIdx.set(oldIdx, newIdx);
            }

            // Reconstruct internal adjacency (Orphan <-> Orphan)
            for (const oldIdx of survivingInCluster) {
              const oldMol = rg.molecules[oldIdx];
              const newIdx = oldToNewIdx.get(oldIdx)!;

              for (let c = 0; c < oldMol.components.length; c++) {
                const adjKey = `${oldIdx}.${c}`;
                const neighbors = rg.adjacency.get(adjKey);
                if (neighbors) {
                  for (const neighbor of neighbors) {
                    const _dIdx3 = neighbor.indexOf('.');
                    const nMStr = neighbor.slice(0, _dIdx3);
                    const nCStr = neighbor.slice(_dIdx3 + 1);
                    const nM = Number(nMStr);
                    const nC = Number(nCStr);

                    if (survivingInCluster.has(nM)) {
                      const newN = oldToNewIdx.get(nM)!;
                      const keyA = `${newIdx}.${c}`;
                      const valA = `${newN}.${nC}`;
                      if (!targetGraph.adjacency.has(keyA)) targetGraph.adjacency.set(keyA, []);
                      if (!targetGraph.adjacency.get(keyA)!.includes(valA)) targetGraph.adjacency.get(keyA)!.push(valA);
                    }
                  }
                }
              }
            }

            // Reconstruct external adjacency (Orphan <-> Anchor Survivor)
            for (const oldIdx of survivingInCluster) {
              const oldMol = rg.molecules[oldIdx];
              const newIdx = oldToNewIdx.get(oldIdx)!;

              for (let c = 0; c < oldMol.components.length; c++) {
                const neighbors = rg.adjacency.get(`${oldIdx}.${c}`);
                if (neighbors) {
                  for (const neighbor of neighbors) {
                    const _dIdx3 = neighbor.indexOf('.');
                    const nMStr = neighbor.slice(0, _dIdx3);
                    const nCStr = neighbor.slice(_dIdx3 + 1);
                    const nM = Number(nMStr);
                    const nC = Number(nCStr);
                    const nKey = (r << 16) | nM;
                    const anchorLoc = anchors.get(nKey);
                    if (anchorLoc && anchorLoc.graphIdx === anchorGraphIdx) {
                      const bondLabel = oldMol.components[c].edges.keys().next().value;
                      const anchorMol = targetGraph.molecules[anchorLoc.molIdx];
                      const anchorComp = anchorMol?.components?.[nC];
                      const explicitUnbound = (anchorMol as (Molecule & { _explicitUnboundComponents?: Set<number> }) | undefined)?._explicitUnboundComponents as Set<number> | undefined;
                      const explicitBonded = (anchorMol as (Molecule & { _explicitBondedComponents?: Set<number> }) | undefined)?._explicitBondedComponents as Set<number> | undefined;
                      if (explicitUnbound && explicitUnbound.has(nC)) {
                        continue;
                      }
                      if (explicitBonded && explicitBonded.has(nC)) {
                        continue;
                      }
                      if (!anchorComp) continue;
                      // Multi-bond support: only skip if THIS specific bond label is already placed.
                      // A plain edges.size!==0 guard would drop the second bystander bonded to the
                      // same multi-valent anchor component (e.g. Im.cargo with two TF bonds).
                      if (bondLabel != null && anchorComp.edges.has(bondLabel)) {
                        // This exact bond is already present — avoid duplicate.
                        continue;
                      }
                      if (bondLabel == null && anchorComp.edges.size !== 0) {
                        // No label available and anchor is already occupied — skip (legacy guard).
                        continue;
                      }
                      targetGraph.addBond(newIdx, c, anchorLoc.molIdx, nC, bondLabel);
                    }
                  }
                }
              }
            }

            for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add((r << 16) | oldIdx);

          } else {
            // PARTIAL PRESERVATION: The cluster is not anchored to a survivor.

            if (touchesMatchedBoundary && deletesWholeSpeciesByReactant[r]) {
              // BNG2 whole-species deletion mode: if all matched molecules in this reactant
              // pattern were deleted and DeleteMolecules is not set, bystanders connected
              // through that boundary are deleted too.
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[applyTransformation] Whole-species deletion: Dropping orphan cluster from reactant ${r} (Rule ${rule.name})`);
              }
              for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add((r << 16) | oldIdx);
              continue;
            }

            // It may contain a mix of DELETED molecules (matched) and BYSTANDERS (not matched).
            // We must harvest the BYSTANDERS as new products and discard the DELETED ones.

            const survivingOrphans = new Set<number>();
            for (const idx of clusterIndices) {
              if (!matchedReactantKeys.has((r << 16) | idx)) {
                survivingOrphans.add(idx);
              }
            }

            if (survivingOrphans.size > 0) {
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[applyTransformation] Harvesting bystanders from orphan cluster: reactant ${r}, mols [${Array.from(survivingOrphans).join(',')}] (Original cluster size: ${clusterIndices.size})`);
              }

              // Same rule as the anchored path: an unanchored bystander survives only
              // as a surplus product under DeleteMolecules, otherwise the reaction is
              // rejected (BioNetGen RxnRule::build_reaction).
              const strandedGraphs = this.harvestStrandedBystanders(r, rg, survivingOrphans, rule.isDeleteMolecules);
              if (strandedGraphs === null) return null;
              for (const sub of strandedGraphs) {
                productGraphs.push(sub);
              }

              // Track used (even if effectively deleted, we handled them)
              for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add((r << 16) | oldIdx);


            } else {
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[applyTransformation] Discarding fully deleted orphan cluster: [${Array.from(clusterIndices).join(',')}]`);
              }
              // Mark all as used/handled
              for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add((r << 16) | oldIdx);
            }
          }
        }
      }


      if (shouldLogNetworkGenerator) {
        debugNetworkLog(
          `[applyTransformation] Rule ${rule.name} Result: ${productGraphs
            .map((p) => p.toString().slice(0, 150))
            .join(' | ')}`
        );
      }

      // BioNetGen MoveConnected semantics (RxnRule.pm):
      // For each transported matched molecule, move only its connected component while
      // excluding other molecules explicitly named in the same reactant pattern.
      if (rule.isMoveConnected) {
        for (const graph of productGraphs) {
          const sourceToGraphIndex = new Map<number, number>();
          for (let idx = 0; idx < graph.molecules.length; idx++) {
            const mKey = getMolKeyFromMol(graph.molecules[idx]);
            if (mKey !== -1) sourceToGraphIndex.set(mKey, idx);
          }

          for (let anchorIdx = 0; anchorIdx < graph.molecules.length; anchorIdx++) {
            const anchorMol = graph.molecules[anchorIdx];
            const reactantIdx = anchorMol._sourceR;
            const reactantMolIdx = anchorMol._sourceM;
            if (reactantIdx === undefined || reactantMolIdx === undefined) continue;
            if (reactantIdx < 0 || reactantIdx >= reactantGraphs.length) continue;

            const sourceMol = reactantGraphs[reactantIdx].molecules[reactantMolIdx];
            if (!sourceMol) continue;

            const sourceComp = sourceMol.compartment || reactantGraphs[reactantIdx].compartment;
            const targetComp = anchorMol.compartment || graph.compartment;
            if (!sourceComp || !targetComp || sourceComp === targetComp) continue;

            const excluded = new Set<number>();
            const reactantMatch = matches[reactantIdx];
            if (reactantMatch) {
              for (const mappedReactantMolIdx of reactantMatch.moleculeMap.values()) {
                if (mappedReactantMolIdx === reactantMolIdx) continue;
                const mappedKeyNum = (reactantIdx << 16) | mappedReactantMolIdx;
                const mappedGraphIdx = sourceToGraphIndex.get(mappedKeyNum);
                if (mappedGraphIdx !== undefined) {
                  excluded.add(mappedGraphIdx);
                }
              }
            }

            const connected = graph.getConnectedComponentMolecules(anchorIdx);
            for (const movedIdx of connected) {
              if (excluded.has(movedIdx)) continue;
              graph.molecules[movedIdx].compartment = targetComp;
            }
          }
        }
      }

      return productGraphs;
    } finally {
      if (profilingEnabled) {
        PROFILE_DATA.applyTransformation += performance.now() - _profStart;
        PROFILE_DATA.applyTransformationCount++;
      }
    }
  }

  /**
   * Build a product graph by applying a rule transformation.
   *
   * BioNetGen semantics:
   * 1. For each reactant pattern, only the MATCHED molecules participate in the transformation
   * 2. Molecules connected via explicit bonds (!+) in the pattern are preserved
   * 3. State changes are applied as specified in the product pattern
   * 4. New bonds are created between matched molecules from different reactants
   */
  private buildProductGraph(
    pattern: SpeciesGraph,
    reactantPatterns: SpeciesGraph[],
    reactantGraphs: SpeciesGraph[],
    matches: MatchMap[],
    usedReactantPatternMols: Set<number>, // Shared tracking across product patterns
    _isMoveConnectedRule: boolean,
    rule: RxnRule,
    productPatternIdx: number
  ): SpeciesGraph | null {
    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] Building from pattern ${pattern.toString()}`);
      debugNetworkLog(`[buildProductGraph] Reactant patterns: ${reactantPatterns.map(p => p.toString()).join(' | ')}`);
      debugNetworkLog(`[buildProductGraph] Prior used reactant mols: ${Array.from(usedReactantPatternMols).join(', ')}`);
    }

    const productGraph = new SpeciesGraph();

    if (pattern.compartment) {
      productGraph.compartment = pattern.compartment;
    } else if (reactantGraphs.length > 0) {
      // For heterogeneous binding (e.g., L@EC + R@PM), use the inner/membrane compartment
      // BioNetGen uses the 2D surface compartment (PM) not the 3D volume compartment (EC)
      let selectedComp: string | undefined;
      let selectedDim = 99; // Large to pick smallest dimension

      // DEBUG: Log the compartment selection process
      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[buildProductGraph] Compartment selection - available compartments: ${JSON.stringify(this.options.compartments)}`);
      }

      for (let ri = 0; ri < reactantGraphs.length; ri++) {
        const rg = reactantGraphs[ri];
        const comp = rg.compartment || (rg.molecules.length > 0 ? rg.molecules[0].compartment : undefined);
        if (comp) {
          // Get compartment dimension if available
          const compInfo = this.compartmentMap.get(comp);
          const dim = compInfo ? compInfo.dimension : 3; // Default to 3D if unknown

          if (shouldLogNetworkGenerator) {
            debugNetworkLog(`[buildProductGraph] Reactant ${ri}: comp=${comp}, dim=${dim}, selectedComp=${selectedComp}, selectedDim=${selectedDim}`);
          }

          // Prefer lower dimension (2D surface over 3D volume)
          if (dim < selectedDim || !selectedComp) {
            selectedComp = comp;
            selectedDim = dim;
          }
        }
      }

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[buildProductGraph] Final selected compartment: ${selectedComp} (dim=${selectedDim})`);
      }

      if (selectedComp) {
        productGraph.compartment = selectedComp;
      }
    }

    // Track mapping: (reactantIdx, reactantMolIdx) -> productMolIdx  
    const reactantToProductMol = new Map<number, number>();
    // Track mapping: patternMolIdx -> productMolIdx
    const patternToProductMol = new Map<number, number>();
    // Track component mapping: "pMolIdx:pCompIdx" -> product component index
    const componentIndexMap = new Map<string, number>();

    // NEW APPROACH: Build product based on the PRODUCT PATTERN, not by expanding from reactant
    // 
    // For each molecule in the product pattern:
    //   1. Find which reactant pattern molecule it corresponds to
    //   2. Find which reactant graph molecule that maps to
    //   3. Clone that molecule (and any connected molecules if the pattern has !+ wildcards)

    // First, build mapping from product pattern molecules to reactant graph molecules
    // by matching product pattern molecule names to reactant pattern molecule names

    // Build a flat list of all reactant pattern molecules with their matches
    // ENHANCED: Also track the molecule's position within its pattern for better matching
    const allReactantPatternMols: Array<{
      reactantIdx: number,
      patternMolIdx: number,
      name: string,
      targetMolIdx: number,
    }> = [];

    for (let r = 0; r < reactantPatterns.length; r++) {
      const match = matches[r];
      if (!match) continue;

      const reactantPattern = reactantPatterns[r];
      for (let patternMolIdx = 0; patternMolIdx < reactantPattern.molecules.length; patternMolIdx++) {
        const targetMolIdx = match.moleculeMap.get(patternMolIdx);
        if (targetMolIdx !== undefined) {
          allReactantPatternMols.push({
            reactantIdx: r,
            patternMolIdx,
            name: reactantPattern.molecules[patternMolIdx].name,
            targetMolIdx
          });
        }
      }
    }

    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] All reactant pattern mols: ${JSON.stringify(allReactantPatternMols)}`);
    }

    // Map product pattern molecules to reactant graph molecules
    // ENHANCED: Use BioNetGen-like structural matching that respects pattern indices
    // Note: usedReactantPatternMols is now passed in as argument to be shared across product patterns
    const productPatternToReactant = new Map<number, { reactantIdx: number, targetMolIdx: number }>();

    // Match product molecules to reactant molecules preferring same binding state
    // This ensures catalysis reactions like:
    //   SOS.RAS(GDP) + RAS(GDP) -> SOS.RAS(GDP) + RAS(GTP)
    // correctly match free product RAS(GTP) to free reactant RAS(GDP), not bound RAS.

    // Use priority-based matching:
    // Priority 1: Same name + same binding state (bound-to-bound, free-to-free)
    // Priority 2: Same name + any binding state

    // Now match product pattern molecules using a priority-based approach:
    // Priority 1: Same pattern index + same name + same binding state
    // Priority 2: Different pattern index + same name + same binding state  
    // Priority 3: Any available molecule with same name

    const scorePatternMolMatch = (
      pMol: Molecule,
      rpm: { reactantIdx: number; patternMolIdx: number; name: string; targetMolIdx: number }
    ): number => {
      const rpMol = reactantPatterns[rpm.reactantIdx].molecules[rpm.patternMolIdx];
      if (!rpMol) return -Infinity;
      const targetMol = reactantGraphs[rpm.reactantIdx]?.molecules?.[rpm.targetMolIdx];
      if (!targetMol) return -Infinity;

      let score = 0;

      // Allow molecule-type transformations (e.g., Autophagosome -> Autolysosome)
      // when structural/component context strongly supports the mapping.
      // Keep a strong preference for same-name mappings.
      const sameName = rpMol.name === pMol.name;
      if (sameName) {
        score += 200;
      } else {
        score -= 200;
      }

      // NOTE: Do NOT score pattern-level "isBound".
      // A molecule can be bound in the reactant graph via bonds not represented in
      // a reactant pattern. Even a small bonus here can flip tie-breaks and swap
      // molecule identity in symmetric/catalytic rules.

      // Prefer compatible component states. This helps disambiguate identical molecule names
      // in symmetric complexes (e.g., multiple R molecules with different Y1/Y2 states).
      // Reward overlap of *specified* component names between the two pattern molecules.
      // This is important because BNGL patterns often omit components as wildcards, and
      // different molecules in the same rule may specify different components.
      let sharedCompNames = 0;
      let productCompNameCount = 0;
      let reactantCompNameCount = 0;
      for (let pIdx = 0; pIdx < pMol.components.length; pIdx++) {
        const name = pMol.components[pIdx].name;
        let seenEarlier = false;
        for (let i = 0; i < pIdx; i++) {
          if (pMol.components[i].name === name) {
            seenEarlier = true;
            break;
          }
        }
        if (seenEarlier) continue;
        productCompNameCount++;
        for (const rc of rpMol.components) {
          if (rc.name === name) {
            sharedCompNames++;
            break;
          }
        }
      }
      for (let rIdx = 0; rIdx < rpMol.components.length; rIdx++) {
        const name = rpMol.components[rIdx].name;
        let seenEarlier = false;
        for (let i = 0; i < rIdx; i++) {
          if (rpMol.components[i].name === name) {
            seenEarlier = true;
            break;
          }
        }
        if (!seenEarlier) reactantCompNameCount++;
      }
      if (!sameName) {
        if (reactantCompNameCount !== productCompNameCount || sharedCompNames !== productCompNameCount) return -Infinity;
      }
      score += sharedCompNames * 25;

      // Reward overlap of the *bonded sites* (component names that carry an explicit bond
      // or a !+ wildcard) to disambiguate cases like R(Y1~P!2) vs R(Y2~P!1).
      let sharedBondSites = 0;
      for (let pIdx = 0; pIdx < pMol.components.length; pIdx++) {
        const pc = pMol.components[pIdx];
        if (pc.wildcard !== '+' && pc.edges.size === 0) continue;
        let seenEarlier = false;
        for (let i = 0; i < pIdx; i++) {
          const earlier = pMol.components[i];
          if (earlier.name === pc.name && (earlier.wildcard === '+' || earlier.edges.size > 0)) {
            seenEarlier = true;
            break;
          }
        }
        if (seenEarlier) continue;
        for (const rc of rpMol.components) {
          if (rc.name === pc.name && (rc.wildcard === '+' || rc.edges.size > 0)) {
            sharedBondSites++;
            break;
          }
        }
      }
      score += sharedBondSites * 50;

      for (const pc of pMol.components) {
        if (!pc.wildcard && pc.edges.size > 0) {
            let tc: Component | undefined;
            for (let i = targetMol.components.length - 1; i >= 0; i--) {
              if (targetMol.components[i].name === pc.name) {
                tc = targetMol.components[i];
                break;
              }
            }
            if (tc) {
              let rcForBondCheck: Component | undefined;
              for (let i = rpMol.components.length - 1; i >= 0; i--) {
                if (rpMol.components[i].name === pc.name) {
                  rcForBondCheck = rpMol.components[i];
                  break;
                }
              }

            // If the reactant pattern does not mention this component (or mentions it
            // as explicitly unbound), product bond creation should originate from a free
            // target site rather than preserving hidden pre-existing bonds.
            const mustStartUnbound =
              !rcForBondCheck ||
              (!rcForBondCheck.wildcard && rcForBondCheck.edges.size === 0);

            // ⚡ Bolt: Replaced chained .filter(...).length > 1 with early-exit loops
            // to eliminate intermediate array allocations in this hot path.
            let pCount = 0, rpCount = 0, tCount = 0;
            let repeatedSiteName = false;
            for (let i = 0; i < pMol.components.length; i++) {
              if (pMol.components[i].name === pc.name && ++pCount > 1) { repeatedSiteName = true; break; }
            }
            if (!repeatedSiteName) {
              for (let i = 0; i < rpMol.components.length; i++) {
                if (rpMol.components[i].name === pc.name && ++rpCount > 1) { repeatedSiteName = true; break; }
              }
            }
            if (!repeatedSiteName) {
              for (let i = 0; i < targetMol.components.length; i++) {
                if (targetMol.components[i].name === pc.name && ++tCount > 1) { repeatedSiteName = true; break; }
              }
            }

            if (mustStartUnbound && tc.edges.size !== 0 && !repeatedSiteName) {
              return -Infinity;
            }
          }
        }

        let rc: Component | undefined;
        for (let i = rpMol.components.length - 1; i >= 0; i--) {
          if (rpMol.components[i].name === pc.name) {
            rc = rpMol.components[i];
            break;
          }
        }
        if (!rc) continue;

        const pState = pc.state;
        const rState = rc.state;

        if (pState && pState !== '?') {
          if (!rState || rState === '?') {
            score += 10; // compatible but not specific
          } else if (rState === pState) {
            score += 40;
          } else {
            score -= 80; // strongly discourage incompatible mapping
          }
        }

        // Reward shared explicit bond labels (preserved bonds); do not penalize missing labels
        // since product patterns may introduce new bonds not present in reactant patterns.
        // Use a strong reward so state-flip rules on symmetric molecules preserve molecule identity
        // by bond topology instead of swapping molecules by state similarity.
        let shared = 0;
        for (const [reactantLabel] of rc.edges) {
          if (typeof reactantLabel !== 'number') continue;
          for (const [productLabel] of pc.edges) {
            if (productLabel === reactantLabel) {
              shared++;
              break;
            }
          }
        }
        if (shared > 0) {
          score += shared * 250;
        }
      }

      return score;
    };

    // BNG2 pairs reactant pattern molecules with product pattern molecules
    // positionally per molecule name, so the n-th product molecule named `A` is
    // built from the n-th reactant molecule named `A`. That is the primary choice
    // here; the similarity score below is only a fallback.
    //
    // The score cannot stand in for it whenever the rule does not spell out the
    // components that tell two same-named reactant molecules apart. In
    // kesseler_2013, `MPF(B!0,L~C,NE2~U,S~Su).MPF(B!0,L~C,DP~U,S~Ki) ->
    // MPF(B,L~C,NE2~P,S~no)+MPF(B,L~C,DP~U,S~no) kMPFimp` never mentions DP, so the
    // product's NE2~P scored best against the S~Ki copy; the product was then built
    // from that copy, the S~Su copy silently lost the DP~P state it carried, and 120
    // reactions came out phosphorylating the wrong monomer.
    const { reactantOffsets, productOffsets, productToReactant } = this.getRuleMoleculeCorrespondence(rule);
    const productPatternOffset = productPatternIdx < 0 ? 0 : productOffsets[productPatternIdx];
    // Reactant pattern molecules grouped by name, in the order the rule writes them.
    const reactantMolIdxByName = new Map<string, number[]>();
    for (let i = 0; i < allReactantPatternMols.length; i++) {
      const name = allReactantPatternMols[i].name;
      const group = reactantMolIdxByName.get(name);
      if (group) group.push(i); else reactantMolIdxByName.set(name, [i]);
    }

    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const pMol = pattern.molecules[pMolIdx];

      // Primary: the positionally corresponding reactant pattern molecule.
      const positionalGlobal = productToReactant.get(productPatternOffset + pMolIdx);
      let bestMatchIdx = -1;
      if (positionalGlobal !== undefined) {
        for (let r = 0; r < reactantPatterns.length; r++) {
          const local = positionalGlobal - reactantOffsets[r];
          if (local < 0 || local >= reactantPatterns[r].molecules.length) continue;
          if (reactantPatterns[r].molecules[local].name !== pMol.name) continue;
          for (let i = 0; i < allReactantPatternMols.length; i++) {
            const rpm = allReactantPatternMols[i];
            if (rpm.reactantIdx !== r || rpm.patternMolIdx !== local) continue;
            const rpmKey = (rpm.reactantIdx << 16) | rpm.patternMolIdx;
            if (usedReactantPatternMols.has(rpmKey)) break;
            bestMatchIdx = i;
            break;
          }
          if (bestMatchIdx !== -1) break;
        }
      }
      let bestScore = -Infinity;

      // Fallback: the similarity score, for the cases positional correspondence
      // cannot decide — a rule that names fewer product molecules than reactant
      // molecules, a molecule deleted outright, or a name whose product copy was
      // already claimed by an earlier product pattern.
      if (bestMatchIdx !== -1) {
        const rpm = allReactantPatternMols[bestMatchIdx];
        usedReactantPatternMols.add((rpm.reactantIdx << 16) | rpm.patternMolIdx);
        productPatternToReactant.set(pMolIdx, {
          reactantIdx: rpm.reactantIdx,
          targetMolIdx: rpm.targetMolIdx
        });
        continue;
      }

      let hasAvailableSameName = false;
      for (let i = 0; i < allReactantPatternMols.length; i++) {
        const rpmKey = (allReactantPatternMols[i].reactantIdx << 16) | allReactantPatternMols[i].patternMolIdx;
        if (usedReactantPatternMols.has(rpmKey)) continue;
        if (allReactantPatternMols[i].name === pMol.name) {
          hasAvailableSameName = true;
          break;
        }
      }

      // Prefer same-name mappings whenever available; only allow cross-name
      // mappings when no same-name reactant pattern molecule exists.
      for (let i = 0; i < allReactantPatternMols.length; i++) {
        const rpm = allReactantPatternMols[i];
        const rpmKey = (rpm.reactantIdx << 16) | rpm.patternMolIdx;
        if (usedReactantPatternMols.has(rpmKey)) continue;
        if (hasAvailableSameName && rpm.name !== pMol.name) continue;
        const score = scorePatternMolMatch(pMol, rpm);

        // Bonus for matching pattern index (for multi-pattern rules)
        // For catalysis reactions, the free product should come from the second reactant pattern
        // We don't have explicit pattern indices for products, but we can use molecule position
        // Molecules appearing later in product tend to correspond to later reactant patterns
        // This is a heuristic that works for common catalysis patterns
        // Update best match
        if (score > bestScore) {
          bestScore = score;
          bestMatchIdx = i;
        }
      }

      if (bestMatchIdx !== -1 && Number.isFinite(bestScore)) {
        const rpm = allReactantPatternMols[bestMatchIdx];
        const rpmKey = (rpm.reactantIdx << 16) | rpm.patternMolIdx;
        usedReactantPatternMols.add(rpmKey);
        productPatternToReactant.set(pMolIdx, {
          reactantIdx: rpm.reactantIdx,
          targetMolIdx: rpm.targetMolIdx
        });
        if (pMol.name === 'SARM') {
          debugNetworkLog(`[buildProductGraph] DEBUG: Mapped product SARM ${pMolIdx} to reactant ${rpm.reactantIdx} mol ${rpm.targetMolIdx}`);
        }
      } else if (pMol.name === 'SARM') {
        debugNetworkLog(`[buildProductGraph] DEBUG: FAILED to map product SARM ${pMolIdx} to any reactant!`);
      }
    }

    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] Product pattern to reactant map: ${JSON.stringify(Array.from(productPatternToReactant.entries()))}`);
    }

    // Determine which molecules to include based on the PRODUCT PATTERN
    // For each product pattern molecule, include the corresponding reactant molecule
    // PLUS any molecules connected via PRESERVED bonds (wildcards !+ or same bond labels)
    //
    // IMPORTANT: A bond is BROKEN if:
    // - It exists in the reactant pattern (numbered label !n)
    // - It does NOT exist in the product pattern (unbound or different label)
    // 
    // Broken bonds should NOT be traversed when finding connected components.
    const includedMols = new Set<number>(); // 32-bit bitwise integer key: (reactantIdx << 16) | molIdx

    // Build a set of bonds that are BROKEN by this transformation.
    // IMPORTANT: track broken bonds as endpoint pairs (not endpoint flags), so
    // multi-bond sites can break one bond while preserving another.
    const brokenBondPairs = new Set<string>(); // "reactantIdx:mol.comp|reactantIdx:mol.comp"
    const endpointPairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

    // First, collect all bonds from reactant patterns with their labels
    const reactantPatternBonds = new Map<number, Map<string, number>>(); // bondLabel -> {pMolIdx, pCompIdx}
    for (let r = 0; r < reactantPatterns.length; r++) {
      const rp = reactantPatterns[r];
      const match = matches[r];
      if (!match) continue;

      for (let pMolIdx = 0; pMolIdx < rp.molecules.length; pMolIdx++) {
        const pMol = rp.molecules[pMolIdx];
        const targetMolIdx = match.moleculeMap.get(pMolIdx);
        if (targetMolIdx === undefined) continue;

        for (let pCompIdx = 0; pCompIdx < pMol.components.length; pCompIdx++) {
          const pComp = pMol.components[pCompIdx];
          // Check if this component has a numbered bond (!n)
          for (const [bondLabel] of pComp.edges) {
            if (typeof bondLabel === 'number') {
              // Find the corresponding target component via componentMap
              const componentKey = `${pMolIdx}.${pCompIdx}`;
              const targetCompKey = match.componentMap.get(componentKey);
              if (targetCompKey) {
                // Store this as a reactant pattern bond
                if (!reactantPatternBonds.has(bondLabel)) {
                  reactantPatternBonds.set(bondLabel, new Map());
                }
                reactantPatternBonds.get(bondLabel)!.set(`${r}:${targetCompKey}`, bondLabel);
              }
            }
          }
        }
      }
    }

    // Now check which reactant pattern bonds are NOT present in the product pattern
    // A bond is preserved if:
    // - Product pattern has a component with wildcard !+ at the same site, OR
    // - Product pattern has a component with the same numbered bond label
    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const pMol = pattern.molecules[pMolIdx];
      const mapping = productPatternToReactant.get(pMolIdx);
      if (!mapping) continue;

      const match = matches[mapping.reactantIdx];
      if (!match) continue;

      // Find which reactant pattern molecule this product pattern molecule came from
      const reactantPattern = reactantPatterns[mapping.reactantIdx];
      let reactantPatternMolIdx = -1;
      for (const [rpMol, tMol] of match.moleculeMap.entries()) {
        if (tMol === mapping.targetMolIdx) {
          reactantPatternMolIdx = rpMol;
          break;
        }
      }
      if (reactantPatternMolIdx === -1) continue;

      const reactantPatternMol = reactantPattern.molecules[reactantPatternMolIdx];
      const targetMol = reactantGraphs[mapping.reactantIdx].molecules[mapping.targetMolIdx];

      const findComponentByNameOccurrence = (components: Component[], name: string, occurrence: number): Component | undefined => {
        let seen = 0;
        for (const comp of components) {
          if (comp.name !== name) continue;
          if (seen === occurrence) return comp;
          seen++;
        }
        return undefined;
      };

      const findComponentIndexByNameOccurrence = (components: Component[], name: string, occurrence: number): number => {
        let seen = 0;
        for (let idx = 0; idx < components.length; idx++) {
          if (components[idx].name !== name) continue;
          if (seen === occurrence) return idx;
          seen++;
        }
        return -1;
      };

      // For each component in the reactant pattern that has a bond...
      for (let rpCompIdx = 0; rpCompIdx < reactantPatternMol.components.length; rpCompIdx++) {
        const rpComp = reactantPatternMol.components[rpCompIdx];

        // IMPORTANT: BNGL molecules can have repeated component names (e.g., A(b,b)).
        // We must match the *occurrence* (1st b, 2nd b, ...) not just the name.
        let rpOccurrence = 0;
        for (let i = 0; i < rpCompIdx; i++) {
          if (reactantPatternMol.components[i].name === rpComp.name) rpOccurrence++;
        }

        for (const [bondLabel] of rpComp.edges) {
          if (typeof bondLabel !== 'number') continue;

          // Find corresponding product pattern component
          const matchingPpComp = findComponentByNameOccurrence(pMol.components, rpComp.name, rpOccurrence);

          // Check if bond is preserved in product pattern
          let bondPreserved = false;
          if (matchingPpComp) {
            // Check for wildcard
            if (matchingPpComp.wildcard === '+' || matchingPpComp.wildcard === '?') {
              bondPreserved = true;
            }
            // Preserve bond state for optional reactant wildcard (!?) when product keeps
            // the same site semantics without explicitly refining/breaking the bond.
            // Example: R(tf~pY!?) -> R(tf~pY) should keep existing TF/P partners.
            if (!bondPreserved && rpComp.wildcard === '?') {
              const reactantState = rpComp.state ?? '?';
              const productState = matchingPpComp.state ?? '?';
              const reactantStateSpecific = reactantState !== '?' && reactantState.length > 0;
              const productStateSpecific = productState !== '?' && productState.length > 0;
              const preservesExplicitWildcardState =
                reactantStateSpecific &&
                productStateSpecific &&
                reactantState === productState;
              if (preservesExplicitWildcardState) {
                bondPreserved = true;
              }
            }
            // Check for same bond label
            for (const [ppBondLabel] of matchingPpComp.edges) {
              if (ppBondLabel === bondLabel) {
                bondPreserved = true;
                break;
              }
            }
          }

          if (!bondPreserved) {
            // This bond is broken - mark only the specific bond pair(s) for this label.
            const componentKey = `${reactantPatternMolIdx}.${rpCompIdx}`;
            const targetCompKey = match.componentMap.get(componentKey);
            if (targetCompKey) {
              const endpointA = `${mapping.reactantIdx}:${targetCompKey}`;
              const endpointsForLabel = reactantPatternBonds.get(bondLabel);
              let markedPair = false;
              if (endpointsForLabel && endpointsForLabel.size > 1) {
                for (const endpointB of endpointsForLabel.keys()) {
                  if (endpointB === endpointA) continue;
                  brokenBondPairs.add(endpointPairKey(endpointA, endpointB));
                  markedPair = true;
                }
              }
              if (!markedPair) {
                brokenBondPairs.add(endpointPairKey(endpointA, endpointA));
              }
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[buildProductGraph] Bond label ${bondLabel} is BROKEN at ${endpointA}`);
              }
            }
          }
        }
      }

      // If a product component is introduced as explicitly unbound (no wildcard, no bond)
      // and that component is omitted from the reactant pattern, treat any existing target
      // bonds on that site as broken for inclusion traversal. This prevents carrying along
      // bystanders through omitted reactant sites (BNG2 parity).
      for (let ppCompIdx = 0; ppCompIdx < pMol.components.length; ppCompIdx++) {
        const ppComp = pMol.components[ppCompIdx];
        if (ppComp.wildcard || ppComp.edges.size > 0) continue;

        let ppOccurrence = 0;
        for (let i = 0; i < ppCompIdx; i++) {
          if (pMol.components[i].name === ppComp.name) ppOccurrence++;
        }

        const reactantComp = findComponentByNameOccurrence(reactantPatternMol.components, ppComp.name, ppOccurrence);
        if (reactantComp) continue;

        const targetCompIdx = findComponentIndexByNameOccurrence(targetMol.components, ppComp.name, ppOccurrence);
        if (targetCompIdx === -1) continue;

        const endpointA = `${mapping.reactantIdx}:${mapping.targetMolIdx}.${targetCompIdx}`;
        const partnerKeys = reactantGraphs[mapping.reactantIdx].adjacency.get(`${mapping.targetMolIdx}.${targetCompIdx}`) ?? [];
        if (partnerKeys.length === 0) {
          brokenBondPairs.add(endpointPairKey(endpointA, endpointA));
          continue;
        }

        for (const partnerKey of partnerKeys) {
          const endpointB = `${mapping.reactantIdx}:${partnerKey}`;
          brokenBondPairs.add(endpointPairKey(endpointA, endpointB));
        }
      }
    }

    // Start with directly mapped molecules and traverse connections,
    // but SKIP broken bonds when finding connected molecules.
    for (const [, mapping] of productPatternToReactant.entries()) {

      const reactantGraph = reactantGraphs[mapping.reactantIdx];
      const startMolIdx = mapping.targetMolIdx;

      // Include the matched molecule
      includedMols.add((mapping.reactantIdx << 16) | startMolIdx);

      // Traverse connected component, but skip broken bonds
      const visited = new Set<number>([startMolIdx]);
      const queue = [startMolIdx];
      let head = 0;

      while (head < queue.length) {
        const molIdx = queue[head++];

        // Find all molecules bonded to this one
        const currentMol = reactantGraph.molecules[molIdx];
        if (currentMol) {
          for (let cIdx = 0; cIdx < currentMol.components.length; cIdx++) {
            const key = `${molIdx}.${cIdx}`;
            const [molStr, compStr] = [String(molIdx), String(cIdx)];

            const partnerKeys = reactantGraph.adjacency.get(key);
            if (!partnerKeys) continue;

            for (const partnerKey of partnerKeys) {
              const _dIdx4 = partnerKey.indexOf('.');
              const partnerMolStr = partnerKey.slice(0, _dIdx4);
              const partnerMolIdx = Number(partnerMolStr);

              if (!visited.has(partnerMolIdx)) {
                // Check if this specific bond is broken
                const endpointA = `${mapping.reactantIdx}:${molStr}.${compStr}`;
                const endpointB = `${mapping.reactantIdx}:${partnerKey}`;
                const bondKey = endpointPairKey(endpointA, endpointB);
                if (
                  brokenBondPairs.has(bondKey) ||
                  brokenBondPairs.has(endpointPairKey(endpointA, endpointA)) ||
                  brokenBondPairs.has(endpointPairKey(endpointB, endpointB))
                ) {
                  // Skip this bond - it's being broken by the rule
                  continue;
                }

                visited.add(partnerMolIdx);
                includedMols.add((mapping.reactantIdx << 16) | partnerMolIdx);
                queue.push(partnerMolIdx);
              }
            }
          }
        }
      }
    }


    // Check if the product pattern has wildcards that require preserving connections
    // If product pattern has !+ wildcards, we need to include connected molecules
    //
    // IMPORTANT: We need to use the match's component mapping to know exactly which
    // reactant component corresponds to the product pattern's !+ wildcard.
    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const pMol = pattern.molecules[pMolIdx];
      const mapping = productPatternToReactant.get(pMolIdx);
      if (!mapping) continue;

      const reactantGraph = reactantGraphs[mapping.reactantIdx];
      const match = matches[mapping.reactantIdx];
      if (!match) continue;

      // Find the corresponding reactant pattern molecule
      // This is the molecule in reactantPatterns[mapping.reactantIdx] that maps to mapping.targetMolIdx
      const reactantPattern = reactantPatterns[mapping.reactantIdx];
      let reactantPatternMolIdx = -1;
      for (const [rPatternMol, targetMol] of match.moleculeMap.entries()) {
        if (targetMol === mapping.targetMolIdx) {
          reactantPatternMolIdx = rPatternMol;
          break;
        }
      }

      if (reactantPatternMolIdx === -1) continue;

      const reactantPatternMol = reactantPattern.molecules[reactantPatternMolIdx];

      // Track which reactant pattern components have been used for wildcards
      const usedReactantPatternComps = new Set<number>();

      // For each !+ component in the product pattern, find the corresponding
      // reactant pattern component and then the reactant graph component
      for (let pCompIdx = 0; pCompIdx < pMol.components.length; pCompIdx++) {
        const pComp = pMol.components[pCompIdx];
        if (pComp.wildcard !== '+') continue;

        // Find the corresponding component in the reactant pattern
        // Match by name and position (account for already-used components)
        let matchingReactantPatternCompIdx = -1;

        // Find the next unused reactant pattern component with same name and wildcard
        for (let i = 0; i < reactantPatternMol.components.length; i++) {
          if (usedReactantPatternComps.has(i)) continue;
          if (reactantPatternMol.components[i].name === pComp.name &&
            reactantPatternMol.components[i].wildcard === '+') {
            matchingReactantPatternCompIdx = i;
            usedReactantPatternComps.add(i);
            break;
          }
        }

        if (matchingReactantPatternCompIdx === -1) continue;

        // Use the componentMap to find the actual reactant graph component
        const componentMapKey = `${reactantPatternMolIdx}.${matchingReactantPatternCompIdx}`;
        const reactantGraphCompKey = match.componentMap.get(componentMapKey);

        if (!reactantGraphCompKey) continue;

        // Parse the reactant graph component key to get mol.comp
        const _dIdx5 = reactantGraphCompKey.indexOf('.');
        const reactantCompStr = reactantGraphCompKey.slice(_dIdx5 + 1);
        const reactantCompIdx = Number(reactantCompStr);

        // Find what this component is bonded to (support multi-site bonding)
        const bondTargets = reactantGraph.adjacency.get(`${mapping.targetMolIdx}.${reactantCompIdx}`);
        if (bondTargets && bondTargets.length > 0) {
          for (const bondTarget of bondTargets) {
            const _dIdx6 = bondTarget.indexOf('.');
            const partnerMolStr = bondTarget.slice(0, _dIdx6);
            const partnerMolIdx = Number(partnerMolStr);
            includedMols.add((mapping.reactantIdx << 16) | partnerMolIdx);

            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[buildProductGraph] !+ wildcard at pattern comp ${pMolIdx}.${pCompIdx} -> reactant comp ${mapping.targetMolIdx}.${reactantCompIdx} -> bonded to mol ${partnerMolIdx}`);
            }

            // Recursively include the entire connected component from partner
            // (excluding the original molecule we started from)
            const toProcess = [partnerMolIdx];
            const visited = new Set<number>([partnerMolIdx, mapping.targetMolIdx]);
            while (toProcess.length > 0) {
              const molIdx = toProcess.pop();
              if (molIdx === undefined) continue;

              const currentMol = reactantGraph.molecules[molIdx];
              if (currentMol) {
                for (let cIdx = 0; cIdx < currentMol.components.length; cIdx++) {
                  const key = `${molIdx}.${cIdx}`;
                  const partnerKeys = reactantGraph.adjacency.get(key);

                  if (partnerKeys) {
                    for (const partnerKey2 of partnerKeys) {
                      const _dIdx7 = partnerKey2.indexOf('.');
                      const partnerMolStr2 = partnerKey2.slice(0, _dIdx7);
                      const partnerMolIdx2 = Number(partnerMolStr2);

                      if (!visited.has(partnerMolIdx2)) {
                        visited.add(partnerMolIdx2);
                        includedMols.add((mapping.reactantIdx << 16) | partnerMolIdx2);
                        toProcess.push(partnerMolIdx2);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] Included molecules: ${Array.from(includedMols).join(', ')}`);
    }

    // A rule may transform one molecule type into another (`Ang2_3(tie2bs,tie2bs,tie2bs) ->
    // Ang2_2(tie2bs,tie2bs)`). The product molecule is then defined by the product
    // pattern, not by the reactant it was matched from, so its component list has to be
    // rebuilt from the pattern here. Doing it later is not an option: bonds are recreated
    // against the clone's component indices below, so a clone that keeps the reactant's
    // arity yields a product that violates its own type declaration — and such a molecule
    // then also matches reactant patterns written against the shorter type.
    const productPatternMolByReactant = new Map<number, number>();
    for (const [pMolIdx, mapping] of productPatternToReactant.entries()) {
      productPatternMolByReactant.set((mapping.reactantIdx << 16) | mapping.targetMolIdx, pMolIdx);
    }

    // Clone included molecules
    for (const key of includedMols) {
      const r = key >> 16;
      const molIdx = key & 0xffff;

      if (reactantToProductMol.has(key)) continue;

      const sourceMol = reactantGraphs[r].molecules[molIdx];
      const clone = this.cloneMoleculeStructure(sourceMol);
      clone._sourceKey = `${r}:${molIdx}`; // Preserve source mapping (reactantIdx:molIdx)
      clone._sourceR = r;
      clone._sourceM = molIdx;

      // Molecule-type transformation: the product pattern, not the matched reactant,
      // defines this molecule's sites, so take the pattern's component list verbatim.
      const pMolIdxForClone = productPatternMolByReactant.get(key);
      const transformMapping = pMolIdxForClone === undefined ? undefined : productPatternToReactant.get(pMolIdxForClone);
      if (transformMapping) {
        if (pMolIdxForClone !== undefined) {
          const pMolForClone = pattern.molecules[pMolIdxForClone];
          if (pMolForClone && pMolForClone.name !== sourceMol.name) {
          // A bond the rule does not name is a bystander: it has to survive into the
          // product, and a shorter type has no site to put it on. BNGL does not shed it,
          // so such a match is simply not applicable. Bonds the reactant pattern itself
          // declares are under the rule's control and are fine. Counting declared bonds
          // per matched site — rather than per bond endpoint — keeps this correct when
          // symmetric sites let the pattern's !1 land on any of them.
          const rMatch = matches[transformMapping.reactantIdx];
          const rPattern = reactantPatterns[transformMapping.reactantIdx];
          let rpMolIdx = -1;
          if (rMatch) {
            for (const [rpIdx, tIdx] of rMatch.moleculeMap.entries()) {
              if (tIdx === transformMapping.targetMolIdx) {
                rpMolIdx = rpIdx;
                break;
              }
            }
          }

          const declaredSites = new Set<number>();
          if (rpMolIdx !== -1 && rPattern) {
            const rpMol = rPattern.molecules[rpMolIdx];
            for (let i = 0; i < rpMol.components.length; i++) {
              if (rpMol.components[i].edges.size === 0) continue;
              const targetKey = rMatch!.componentMap.get(`${rpMolIdx}.${i}`);
              if (!targetKey) continue;
              declaredSites.add(Number(targetKey.slice(targetKey.indexOf('.') + 1)));
            }
          }

          for (let cIdx = 0; cIdx < sourceMol.components.length; cIdx++) {
            if (declaredSites.has(cIdx)) continue;
            const partnerKeys = reactantGraphs[r].adjacency.get(`${molIdx}.${cIdx}`);
            if (!partnerKeys || partnerKeys.length === 0) continue;
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[buildProductGraph] Rejecting ${sourceMol.name} -> ${pMolForClone.name}: undeclared bond on site ${cIdx} has no counterpart in the product molecule`);
            }
            return null;
          }

          clone.name = pMolForClone.name;
          clone.components = pMolForClone.components.map((component: Component) => {
            const cloned = new Component(component.name, [...component.states]);
            cloned.state = component.state;
            cloned.wildcard = component.wildcard;
            return cloned;
          });
        }
      }
        }

      // CRITICAL FIX: If molecule doesn't have its own compartment, inherit from its reactant graph
      // This ensures that when L@EC.R@PM unbinds, L gets EC and R gets PM (not both PM)
      if (!clone.compartment && reactantGraphs[r].compartment) {
        clone.compartment = reactantGraphs[r].compartment;
      }

      const newIdx = productGraph.molecules.length;
      productGraph.molecules.push(clone);
      reactantToProductMol.set(key, newIdx);

      if (shouldLogNetworkGenerator || (sourceMol.name === 'SARM')) {
        debugNetworkLog(`[buildProductGraph] Cloned reactant ${r} mol ${molIdx} (${sourceMol.name}@${sourceMol.compartment || 'none'}) (from graph ${reactantGraphs[r].compartment}) -> product mol ${newIdx} (@${clone.compartment || 'none'})`);
      }
    }

    // IMPORTANT: Handle product pattern molecules that have NO corresponding reactant
    // These are newly synthesized molecules (e.g., MDM2 in "p53() -> p53() + MDM2()")
    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      if (productPatternToReactant.has(pMolIdx)) continue;  // Already has a reactant mapping

      const pMol = pattern.molecules[pMolIdx];

      // Create a fresh molecule from the pattern
      const newMol = this.cloneMoleculeStructure(pMol);
      const newIdx = productGraph.molecules.length;
      productGraph.molecules.push(newMol);
      patternToProductMol.set(pMolIdx, newIdx);

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[buildProductGraph] Created NEW molecule from pattern mol ${pMolIdx} (${pMol.name}) -> product mol ${newIdx}`);
      }
    }

    // Map product pattern molecules to product graph molecules (for those from reactants)
    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const mapping = productPatternToReactant.get(pMolIdx);
      if (!mapping) continue;

      const key = (mapping.reactantIdx << 16) | mapping.targetMolIdx;
      const productMolIdx = reactantToProductMol.get(key);
      if (productMolIdx !== undefined) {
        patternToProductMol.set(pMolIdx, productMolIdx);
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Pattern mol ${pMolIdx} (${pattern.molecules[pMolIdx].name}) -> product mol ${productMolIdx}`);
        }
      }
    }

    // CRITICAL FIX: Override molecule compartments from product pattern
    // This handles transport rules like "mRNA@NU -> mRNA@CP" where the product
    // pattern explicitly specifies a new compartment for the molecule.
    // Also handles "A(b!1).B(a!1)@CYT" where the graph-level compartment specifies
    // the destination for ALL molecules in the product complex.
    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const pMol = pattern.molecules[pMolIdx];
      const productMolIdx = patternToProductMol.get(pMolIdx);

      if (productMolIdx === undefined) continue;

      // If product pattern molecule has explicit compartment, use it (highest priority)
      if (pMol.compartment) {
        productGraph.molecules[productMolIdx].compartment = pMol.compartment;
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Overriding product mol ${productMolIdx} compartment to ${pMol.compartment} from pattern`);
        }
      } else if (pattern.compartment) {
        // Apply graph-level compartment from product pattern.
        // IMPORTANT: Always override the inherited reactant compartment here.
        // Transport rules like TF()@CP -> TF()@NU specify the destination at graph level.
        // The molecule inherits CP from the reactant clone, but the rule explicitly
        // moves it to NU. We must honor the product pattern's compartment.
        productGraph.molecules[productMolIdx].compartment = pattern.compartment;
        if (shouldLogNetworkGenerator || productGraph.molecules[productMolIdx].name === 'SARM') {
          debugNetworkLog(`[buildProductGraph] Applying species-level compartment ${pattern.compartment} to product mol ${productMolIdx} (${productGraph.molecules[productMolIdx].name}), was ${productGraph.molecules[productMolIdx].compartment}`);
        }
      }
    }

    // INDUCED COMPARTMENT TRANSPORT: When a surface molecule moves to another surface,
    // bound volume molecules should move to the corresponding adjacent volume.
    // E.g., when R moves PM->EM, L (in EC=Outside(PM)) should move to EN=Inside(EM)
    if (this.options.compartments && this.options.compartments.length > 0) {
      const compartmentMap = new Map(this.options.compartments.map(c => [c.name, c]));

      // Build a map of which compartments are "inside" or "outside" of each surface
      const getOutside = (surface: string): string | undefined => {
        const comp = compartmentMap.get(surface);
        return comp?.parent; // Parent is the "outside" compartment
      };

      const getInside = (surface: string): string | undefined => {
        // Find compartment whose parent is this surface
        for (const [name, comp] of compartmentMap) {
          if (comp.parent === surface && comp.dimension === 3) {
            return name;
          }
        }
        return undefined;
      };

      // Build map from sourceKey to product molecule for quick lookup
      const sourceKeyToProductMol = new Map<string, typeof productGraph.molecules[0]>();
      for (const mol of productGraph.molecules) {
        if (mol._sourceKey) {
          sourceKeyToProductMol.set(mol._sourceKey, mol);
        }
      }

      // For each product molecule, check if it changed compartment from reactant
      for (const productMol of productGraph.molecules) {
        const sourceKey = productMol._sourceKey;
        if (!sourceKey) continue;

        const _cIdx = sourceKey.indexOf(':');
        const rStr = sourceKey.slice(0, _cIdx);
        const molIdxStr = sourceKey.slice(_cIdx + 1);
        const rIdx = Number(rStr);
        const sourceMolIdx = Number(molIdxStr);

        if (rIdx >= reactantGraphs.length) continue;
        const reactantGraph = reactantGraphs[rIdx];
        const sourceMol = reactantGraph.molecules[sourceMolIdx];
        if (!sourceMol) continue;

        // Get source and target compartments
        const sourceComp = sourceMol.compartment || reactantGraph.compartment;
        const targetComp = productMol.compartment;

        if (!sourceComp || !targetComp || sourceComp === targetComp) continue;

        // Check if both are surfaces (2D)
        const sourceCompInfo = compartmentMap.get(sourceComp);
        const targetCompInfo = compartmentMap.get(targetComp);

        if (!sourceCompInfo || !targetCompInfo) continue;
        if (sourceCompInfo.dimension !== 2 || targetCompInfo.dimension !== 2) {
          // Volume-to-volume (3D→3D) co-transport: only for MoveConnected rules.
          // When Im moves CP→NU (both 3D), bystanders bonded to Im that are in CP must
          // also move to NU. Without this, the preserved Im@NU–P1@CP bond spans
          // non-adjacent compartments and buildProductGraph rejects the product.
          // Apply unconditionally (like 2D surface co-transport) — in cBNGL, 3D→3D
          // compartment transport implicitly co-transports all bonded same-compartment
          // bystanders, regardless of whether the rule has MoveConnected.
          if (sourceCompInfo.dimension === 3 && targetCompInfo.dimension === 3) {
            const _vol3dRemap = new Map<string, string>();
            _vol3dRemap.set(sourceComp, targetComp);

            const _vol3dVisited = new Set<number>();
            _vol3dVisited.add(sourceMolIdx);
            const _vol3dQueue: number[] = [sourceMolIdx];
            let _vol3dHead = 0;

            while (_vol3dHead < _vol3dQueue.length) {
              const _vol3dCurrIdx = _vol3dQueue[_vol3dHead++];
              const _vol3dCurrMol = reactantGraph.molecules[_vol3dCurrIdx];
              if (!_vol3dCurrMol) continue;

              for (let _vol3dCi = 0; _vol3dCi < _vol3dCurrMol.components.length; _vol3dCi++) {
                const _vol3dAdjKey = `${_vol3dCurrIdx}.${_vol3dCi}`;
                const _vol3dPartners = reactantGraph.adjacency.get(_vol3dAdjKey);
                if (!_vol3dPartners) continue;

                for (const _vol3dPartnerKey of _vol3dPartners) {
                  const _dIdx8 = _vol3dPartnerKey.indexOf('.');
                  const _vol3dPMolIdxStr = _vol3dPartnerKey.slice(0, _dIdx8);
                  const _vol3dPMolIdx = Number(_vol3dPMolIdxStr);
                  if (_vol3dVisited.has(_vol3dPMolIdx)) continue;
                  _vol3dVisited.add(_vol3dPMolIdx);
                  _vol3dQueue.push(_vol3dPMolIdx);

                  const _vol3dSrcKey = `${rIdx}:${_vol3dPMolIdx}`;
                  const _vol3dProductMol = sourceKeyToProductMol.get(_vol3dSrcKey);
                  if (!_vol3dProductMol || _vol3dProductMol === productMol) continue;

                  const _vol3dPComp = _vol3dProductMol.compartment;
                  if (!_vol3dPComp) continue;
                  const _vol3dNewComp = _vol3dRemap.get(_vol3dPComp);
                  if (_vol3dNewComp) {
                    if (shouldLogNetworkGenerator) {
                      debugNetworkLog(`  [MoveConnected 3D] Moving bound ${_vol3dProductMol.name} from ${_vol3dPComp} to ${_vol3dNewComp} (volume co-transport)`);
                    }
                    _vol3dProductMol.compartment = _vol3dNewComp;
                  }
                }
              }
            }
          }
          continue;
        }

        // Surface to surface transport - update bound volume partners
        const sourceOutside = getOutside(sourceComp);
        const sourceInside = getInside(sourceComp);
        const targetOutside = getOutside(targetComp);
        const targetInside = getInside(targetComp);

        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Surface transport: ${sourceComp} -> ${targetComp}`);
          debugNetworkLog(`  Source: Outside=${sourceOutside}, Inside=${sourceInside}`);
          debugNetworkLog(`  Target: Outside=${targetOutside}, Inside=${targetInside}`);
        }

        // BFS through the full connected complex in the REACTANT graph to propagate
        // co-transport.  The original 1-hop loop only moved DIRECT neighbors of the
        // transported surface molecule, missing multi-hop cargo chains (e.g. L-L dimers
        // where one L is a direct partner of R but the second L is only bound to the first).
        //
        // Compartment remapping for this surface→surface move:
        //   Inside(sourceComp)  → Outside(targetComp)
        //   Outside(sourceComp) → Inside(targetComp)
        const _compRemap = new Map<string, string>();
        if (sourceInside && targetOutside && sourceInside !== targetOutside) {
          _compRemap.set(sourceInside, targetOutside);
        }
        if (sourceOutside && targetInside && sourceOutside !== targetInside) {
          _compRemap.set(sourceOutside, targetInside);
        }
        // Always co-transport same-surface bystanders (e.g., R2 bonded to R1 via an
        // L-linker when R1 moves EM→PM). In cBNGL, surface transport implicitly moves
        // all connected molecules on the same surface to the corresponding target surface.
        // This is NOT limited to MoveConnected rules — it is an inherent property of
        // compartmental topology (verified against BNG2 output).
        _compRemap.set(sourceComp, targetComp);

        if (_compRemap.size > 0) {
          const _bfsVisited = new Set<number>();
          _bfsVisited.add(sourceMolIdx);
          const _bfsQueue: number[] = [sourceMolIdx];
          let _bfsHead = 0;

          while (_bfsHead < _bfsQueue.length) {
            const _currMolIdx = _bfsQueue[_bfsHead++];
            const _currMol = reactantGraph.molecules[_currMolIdx];
            if (!_currMol) continue;

            for (let _ci = 0; _ci < _currMol.components.length; _ci++) {
              const _adjKey = `${_currMolIdx}.${_ci}`;
              const _partnerKeys = reactantGraph.adjacency.get(_adjKey);
              if (!_partnerKeys) continue;

              for (const _partnerKey of _partnerKeys) {
                const _dIdx9 = _partnerKey.indexOf('.');
                const _pMolIdxStr = _partnerKey.slice(0, _dIdx9);
                const _pMolIdx = Number(_pMolIdxStr);
                if (_bfsVisited.has(_pMolIdx)) continue;
                _bfsVisited.add(_pMolIdx);
                _bfsQueue.push(_pMolIdx);

                // Apply remapping to the corresponding product molecule
                const _pSourceKey = `${rIdx}:${_pMolIdx}`;
                const _pProductMol = sourceKeyToProductMol.get(_pSourceKey);
                if (!_pProductMol || _pProductMol === productMol) continue;

                const _pComp = _pProductMol.compartment;
                if (!_pComp) continue;
                const _newComp = _compRemap.get(_pComp);
                if (_newComp) {
                  if (shouldLogNetworkGenerator) {
                    debugNetworkLog(`  Moving bound ${_pProductMol.name} from ${_pComp} to ${_newComp} (BFS co-transport)`);
                  }
                  _pProductMol.compartment = _newComp;
                }
              }
            }
          }
        }
      }

      // After induced transport, re-select graph compartment based on updated molecule compartments
      // The graph compartment should be the 2D surface compartment (if any molecule is on a surface)
      let newSelectedComp: string | undefined;
      let newSelectedDim = 99;

      for (const mol of productGraph.molecules) {
        const molComp = mol.compartment;
        if (molComp) {
          const compInfo = compartmentMap.get(molComp);
          const dim = compInfo ? compInfo.dimension : 3;
          if (dim < newSelectedDim || !newSelectedComp) {
            newSelectedComp = molComp;
            newSelectedDim = dim;
          }
        }
      }

      if (newSelectedComp && newSelectedComp !== productGraph.compartment) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Re-selecting graph compartment after induced transport: ${productGraph.compartment} -> ${newSelectedComp}`);
        }
        productGraph.compartment = newSelectedComp;
      }
    }

    // Recreate bonds from reactants (only for molecules that are both included)
    // This preserves existing bonds ONLY if both endpoints are in the product
    const addedBonds = new Set<string>();

    // Map (reactantIdx, oldBondLabel) -> newBondLabel
    const bondLabelMap = new Map<string, number>();
    let nextBondLabel = 1;

    for (let r = 0; r < reactantGraphs.length; r++) {
      const reactantGraph = reactantGraphs[r];

      for (const [key, partnerKeys] of reactantGraph.adjacency.entries()) {
        const _dIdx10 = key.indexOf('.');
        const molStr = key.slice(0, _dIdx10);
        const compStr = key.slice(_dIdx10 + 1);
        const molIdx = Number(molStr);
        const compIdx = Number(compStr);

        for (const partnerKey of partnerKeys) {
          const _dIdx11 = partnerKey.indexOf('.');
          const partnerMolStr = partnerKey.slice(0, _dIdx11);
          const partnerCompStr = partnerKey.slice(_dIdx11 + 1);
          const partnerMolIdx = Number(partnerMolStr);
          const partnerCompIdx = Number(partnerCompStr);

          // Skip if not valid
          if (isNaN(molIdx) || isNaN(compIdx) || isNaN(partnerMolIdx) || isNaN(partnerCompIdx)) continue;

          // Check if both molecules are included
          const mol1Key = (r << 16) | molIdx;
          const mol2Key = (r << 16) | partnerMolIdx;
          if (!includedMols.has(mol1Key) || !includedMols.has(mol2Key)) continue;

          // Check if this specific bond is BROKEN by the rule transformation
          const bondEndpoint1 = `${r}:${molIdx}.${compIdx}`;
          const bondEndpoint2 = `${r}:${partnerMolIdx}.${partnerCompIdx}`;
          const brokenPairKey = endpointPairKey(bondEndpoint1, bondEndpoint2);
          if (
            brokenBondPairs.has(brokenPairKey) ||
            brokenBondPairs.has(endpointPairKey(bondEndpoint1, bondEndpoint1)) ||
            brokenBondPairs.has(endpointPairKey(bondEndpoint2, bondEndpoint2))
          ) {
            // This bond should NOT be recreated - it's being broken by the rule
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[buildProductGraph] SKIPPING broken bond ${bondEndpoint1} - ${bondEndpoint2}`);
            }
            continue;
          }

          // Avoid adding same bond twice
          const bondKey = molIdx < partnerMolIdx || (molIdx === partnerMolIdx && compIdx < partnerCompIdx)
            ? `${r}:${molIdx}.${compIdx}-${partnerMolIdx}.${partnerCompIdx}`
            : `${r}:${partnerMolIdx}.${partnerCompIdx}-${molIdx}.${compIdx}`;
          if (addedBonds.has(bondKey)) continue;
          addedBonds.add(bondKey);

          const productMolIdx1 = reactantToProductMol.get(mol1Key);
          const productMolIdx2 = reactantToProductMol.get(mol2Key);

          if (productMolIdx1 !== undefined && productMolIdx2 !== undefined) {
            // A molecule-type transformation can leave the product with fewer
            // components than the reactant, so a reactant bond may address a product site
            // that no longer exists. Such a bond cannot be carried over; the product
            // pattern decides that site's fate.
            if (
              compIdx >= productGraph.molecules[productMolIdx1].components.length ||
              partnerCompIdx >= productGraph.molecules[productMolIdx2].components.length
            ) {
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[buildProductGraph] SKIPPING bond ${bondEndpoint1} - ${bondEndpoint2}: product site does not exist`);
              }
              continue;
            }
            // Find original label
            const comp = reactantGraph.molecules[molIdx].components[compIdx];
            const partnerComp = reactantGraph.molecules[partnerMolIdx].components[partnerCompIdx];
            let originalLabel = 0;
            for (const [l, target] of comp.edges) {
              if (target !== partnerCompIdx) continue;
              if (partnerComp.edges.has(l) && partnerComp.edges.get(l) === compIdx) {
                originalLabel = l;
                break;
              }
            }
            if (originalLabel === 0) {
              for (const [l, target] of comp.edges) {
                if (target === partnerCompIdx) {
                  originalLabel = l;
                  break;
                }
              }
            }

            // Map to new unique label
            const labelKey = `${r}:${originalLabel}`;
            let newLabel = bondLabelMap.get(labelKey);
            if (newLabel === undefined) {
              newLabel = nextBondLabel++;
              bondLabelMap.set(labelKey, newLabel);
            }

            productGraph.addBond(productMolIdx1, compIdx, productMolIdx2, partnerCompIdx, newLabel);
          }
        }
      }
    }

    // Step 5: Apply component state changes and map components
    // CRITICAL: Process pattern components in the right order:
    // 1. First, map wildcard components (!+) to bound product components
    // 2. Then, map unbound pattern components to unbound product components
    // 3. Finally, map new-bond pattern components to remaining unbound product components
    // CRITICAL NOTE: Build reverse lookup from product pattern molecule to reactant pattern molecule
    // This allows us to use the matcher's componentMap for exact component identification
    const productToReactantPattern = new Map<number, {
      reactantIdx: number,
      reactantPatternMolIdx: number
    }>();
    for (const [pMolIdx, mapping] of productPatternToReactant.entries()) {
      const match = matches[mapping.reactantIdx];
      if (!match) continue;

      const expectedTargetMolIdx = mapping.targetMolIdx;
      for (const [rpMolIdx, tMolIdx] of match.moleculeMap.entries()) {
        if (tMolIdx === expectedTargetMolIdx) {
          productToReactantPattern.set(pMolIdx, {
            reactantIdx: mapping.reactantIdx,
            reactantPatternMolIdx: rpMolIdx
          });
          break;
        }
      }
    }

    const usedComponentIndicesPerMol = new Map<number, Set<number>>();


    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const productMolIdx = patternToProductMol.get(pMolIdx);
      if (productMolIdx === undefined) continue;

      const patternMol = pattern.molecules[pMolIdx];
      const productMol = productGraph.molecules[productMolIdx];

      // BNGL allows molecule-type transformations via rules.
      // When a product pattern molecule is mapped to a reactant molecule of a different
      // name, the resulting product molecule must take the product pattern's name.
      if (productMol.name !== patternMol.name) {
        productMol.name = patternMol.name;
      }

      const usedSet = usedComponentIndicesPerMol.get(productMolIdx) ?? new Set<number>();

      // Categorize pattern components
      const wildcardComps: number[] = [];   // !+ components - should map to bound
      const optionalWildcardComps: number[] = []; // !? components - map after constrained comps
      const unboundComps: number[] = [];    // no edges, no wildcard - should map to unbound
      const newBondComps: number[] = [];    // has edges (new bonds) - should map to unbound

      for (let pCompIdx = 0; pCompIdx < patternMol.components.length; pCompIdx++) {
        const pComp = patternMol.components[pCompIdx];
        if (pComp.wildcard === '+') {
          wildcardComps.push(pCompIdx);
        } else if (pComp.wildcard === '?') {
          optionalWildcardComps.push(pCompIdx);
        } else if (pComp.edges.size > 0) {
          // Explicit bond in product - prioritize this
          newBondComps.push(pCompIdx);
        } else {
          // Unbound in product
          unboundComps.push(pCompIdx);
        }
      }

      // Process in order: constrained bound wildcards first, then explicit new bonds,
      // then unbound/default components, and finally optional wildcards (!?) as catch-all.
      const orderedComps = [...wildcardComps, ...newBondComps, ...unboundComps, ...optionalWildcardComps];

      for (const pCompIdx of orderedComps) {
        const pComp = patternMol.components[pCompIdx];
        let requireUnboundForProductOnlyComponent = false;
        const requireStrictUnboundMapping = false;

        let pCompOccurrence = 0;
        for (let i = 0; i < pCompIdx; i++) {
          if (patternMol.components[i].name === pComp.name) pCompOccurrence++;
        }

        // Find a matching component in the product molecule
        let candidateIdx = -1;
        let markExplicitUnbound = pComp.wildcard === '-';
        let preserveOptionalWildcardBond = false;
        const isBound = (idx: number) => productGraph.adjacency.has(`${productMolIdx}.${idx}`);

        const prMapping = productToReactantPattern.get(pMolIdx);
        if (prMapping) {
          const mappedReactantIdx = prMapping.reactantIdx;
          const match = matches[mappedReactantIdx];
          const reactantPatternsArr = reactantPatterns instanceof Array ? reactantPatterns : [reactantPatterns]; // Safety check
          const reactantPatternMol = reactantPatternsArr[mappedReactantIdx].molecules[prMapping.reactantPatternMolIdx];

          if (!pComp.wildcard && pComp.edges.size === 0) {
            let seen = 0;
            let hasReactantOccurrence = false;
            for (const rpComp of reactantPatternMol.components) {
              if (rpComp.name !== pComp.name) continue;
              if (seen === pCompOccurrence) {
                hasReactantOccurrence = true;
                break;
              }
              seen++;
            }
            if (!hasReactantOccurrence) {
              requireUnboundForProductOnlyComponent = true;
            }
          }

          // Find matching reactant pattern component by name
          for (let rpCompIdx = 0; rpCompIdx < reactantPatternMol.components.length; rpCompIdx++) {
            const reactantPatternComp = reactantPatternMol.components[rpCompIdx];
            if (reactantPatternComp.name !== pComp.name) continue;
            // A product "!+" site is the counterpart of a reactant "!+" site: it means
            // "this site is bound, and whatever is bound to it stays bound". Only the
            // reactant pattern's own "!+" component carries that site. Without this
            // filter a "!+" in a symmetric molecule claims the first same-named site it
            // can find, so a numbered site (b!1) steals the wildcard's slot and the
            // product's bond labels come out rotated, leaving a dangling partner.
            if (pComp.wildcard === '+' && reactantPatternComp.wildcard !== '+') continue;

            // Look up exact target component via componentMap
            const compKey = `${prMapping.reactantPatternMolIdx}.${rpCompIdx}`;
            // NOTE: First try to use componentMap for exact component identification
            const exactComponentMapTarget = match.componentMap.get(compKey);
            const targetKey = exactComponentMapTarget;

            if (!targetKey) continue;
            // ⚡ Bolt: Use slice directly to avoid split() array allocation
            const idx = Number(targetKey.slice(targetKey.indexOf('.') + 1));
            if (usedSet.has(idx)) continue;

            // IMPORTANT: The componentMap lookup is ambiguous when multiple components share the
            // same name (e.g., IgE(Fc,Fc!+)). Enforce bond-state compatibility here.
            //
            // Key distinction:
            // - If product pattern has an explicit numeric bond on this component, it can be either:
            //   (a) preserved (reactant pattern component already bound) -> must map to bound
            //   (b) newly created (reactant pattern component was unbound)  -> must map to unbound
            //
            // This prevents breaking existing bonds (wrong mapping), while still enabling downstream
            // transformations like phosphorylation rules that preserve bonds.
            const bound = isBound(idx);
            if (pComp.wildcard === '+') {
              if (!bound) continue;
            } else if (pComp.wildcard === '-') {
              if (bound) continue;
            } else if (pComp.wildcard === '?') {
              // allow either bound or unbound
            } else if (pComp.edges.size > 0) {
              const reactantWasBound = reactantPatternComp.wildcard === '+' || reactantPatternComp.edges.size > 0;
              const reactantWasUnbound = reactantPatternComp.wildcard === '-';

              if (reactantWasBound) {
                if (!bound) continue;
              } else if (reactantWasUnbound) {
                if (bound) continue;
              } else {
                // Reactant bond state unconstrained (e.g., A(b) -> A(b!1)).
                // Prefer mapping to an unbound target site so explicit product bonds
                // represent true bond formation rather than selecting an already-bound
                // symmetric site and collapsing to a no-op in practice.
                if (bound) continue;
              }
            } else {
              // No wildcard, no bond in product pattern.
              // NOTE: If the REACTANT pattern had a !? wildcard on this component,
              // the bond state should be PRESERVED (allow either bound or unbound).
              // This is essential for transport rules like:
              //   @PM:R(tf~pY!?) -> @EM:R(tf~pY)
              // where the tf component may be bound to TF or P in CP.
              // Only enforce "explicitly unbound" if reactant pattern also expected unbound.
              const reactantExplicitlyUnbound = reactantPatternComp.wildcard === '-';
              const reactantHadOptionalWildcard = reactantPatternComp.wildcard === '?' && !reactantPatternComp.syntheticWildcard;

              if (reactantExplicitlyUnbound) {
                // Reactant pattern explicitly expected unbound, product should be unbound
                if (bound) continue;
                markExplicitUnbound = true;
              } else if (reactantHadOptionalWildcard) {
                // BNG2 semantics: EXPLICITLY written !? in reactant means the bond ALWAYS
                // carries through to the product — the rule does not modify the bond on this
                // component regardless of how the product pattern writes it.
                // Example: CD40(l!?,t!1).TRAF(b!1,s~U) -> CD40(l,t) DeleteMolecules
                //   l!? in reactant → l in product (no bond label) → preserve l bond.
                //   t!1 in reactant → t in product (no bond label) → delete t bond (explicit).
                // Synthetic wildcards (added by completeMissingComponents) do NOT get
                // carry-through: they should obey the product pattern instead, e.g.
                //   BetaR(l,g,loc~cyt) -> BetaR(l,g,loc~mem,s~U)  where `s` is absent in
                //   reactant (synthetic !?) but explicitly free in product → break bond.
                preserveOptionalWildcardBond = true;
              } else if (bound) {
                // Reactant explicitly specified this component (no wildcard or !?), but product
                // leaves the component unbound and bond-label-free. If this mapping lands
                // on a currently bound target site, explicitly clear that bond to match
                // BioNetGen's product-site semantics.
                markExplicitUnbound = true;
              }
              // Otherwise, preserve bond state (allow either)
            }

            if (!pComp.wildcard && pComp.edges.size === 0 && bound && !preserveOptionalWildcardBond) {
              // Product omits any explicit bond for this component. If we mapped onto a
              // currently bound target site, force explicit unbinding in the product.
              markExplicitUnbound = true;
            }

            candidateIdx = idx;
            break;
          }
        }

        // Fall back to name-based search if componentMap lookup failed
        if (candidateIdx === -1) {

          const matchingIndices: number[] = [];
          for (let idx = 0; idx < productMol.components.length; idx++) {
            if (usedSet.has(idx)) continue;
            if (productMol.components[idx].name !== pComp.name) continue;
            matchingIndices.push(idx);
          }

          if (matchingIndices.length > 0) {
            // Bolt optimization: combine O(N) array searches into single pass
            // Reduces overhead compared to two separate matchingIndices.find() calls
            let boundIdx: number | undefined;
            let unboundIdx: number | undefined;
            for (let i = 0; i < matchingIndices.length; i++) {
              const idx = matchingIndices[i];
              if (boundIdx === undefined && isBound(idx)) {
                boundIdx = idx;
              } else if (unboundIdx === undefined && !isBound(idx)) {
                unboundIdx = idx;
              }
              if (boundIdx !== undefined && unboundIdx !== undefined) break;
            }

            if (pComp.wildcard === '+') {
              // !+ must map to an already-bound site
              if (typeof boundIdx === 'number') {
                candidateIdx = boundIdx;
              } else {
                if (shouldLogNetworkGenerator) {
                  debugNetworkLog(`[buildProductGraph] No bound site available for !+ mapping: ${pMolIdx}.${pCompIdx} (${pComp.name})`);
                }
                return null;
              }
            } else if (pComp.wildcard === '-') {
              // !- must map to an unbound site
              if (typeof unboundIdx === 'number') {
                candidateIdx = unboundIdx;
              } else {
                if (shouldLogNetworkGenerator) {
                  debugNetworkLog(`[buildProductGraph] No unbound site available for !- mapping: ${pMolIdx}.${pCompIdx} (${pComp.name})`);
                }
                return null;
              }
            } else if (pComp.wildcard === '?') {
              // !? can map to any available site
              candidateIdx = matchingIndices[0];
            } else {
              // No wildcard:
              // - If product pattern has an explicit numeric bond, prefer unbound (new bond), but allow
              //   bound if no unbound site exists (likely a preserved bond in symmetric contexts).
              // - If product pattern has no bond, require unbound.
              if (pComp.edges.size > 0) {
                if (typeof unboundIdx === 'number') {
                  candidateIdx = unboundIdx;
                } else if (typeof boundIdx === 'number') {
                  candidateIdx = boundIdx;
                } else {
                  if (shouldLogNetworkGenerator) {
                    debugNetworkLog(`[buildProductGraph] No compatible site available for bonded mapping: ${pMolIdx}.${pCompIdx} (${pComp.name})`);
                  }
                  return null;
                }
              } else {
                if (typeof unboundIdx === 'number') {
                  candidateIdx = unboundIdx;
                } else {
                  if (requireStrictUnboundMapping) {
                    return null;
                  }
                  // If this product molecule is mapped from an existing reactant molecule,
                  // BNGL allows omitted-reactant-site updates like:
                  //   BetaR(l,g,loc~cyt) -> BetaR(l,g,loc~mem,s~U)
                  // to apply even when the target site is currently bound. In that case
                  // map to the bound site and force explicit unbinding later.
                  const isReactantMapped = productPatternToReactant.has(pMolIdx);
                  if (requireUnboundForProductOnlyComponent && !isReactantMapped) {
                    return null;
                  }
                  if (isReactantMapped && typeof boundIdx === 'number') {
                    candidateIdx = boundIdx;
                    markExplicitUnbound = true;
                  } else {
                    if (shouldLogNetworkGenerator) {
                      debugNetworkLog(`[buildProductGraph] No unbound site available for mapping: ${pMolIdx}.${pCompIdx} (${pComp.name})`);
                    }
                    return null;
                  }
                }
              }
            }
          }

        } // End of fallback if (candidateIdx === -1) block

        if (candidateIdx === -1) {
          /*
           * BNG2 PARITY NOTE: Before creating a new component, check if this molecule
           * was cloned from a reactant. If so, the component MUST already exist —
           * the bond-state compatibility filter was too strict. Do a relaxed search
           * accepting ANY available same-name component regardless of bond state.
           * BNG2 uses direct pointer maps (MapF) and never creates duplicate components.
           */
          const isReactantMapped = productPatternToReactant.has(pMolIdx);
          if (isReactantMapped) {
            // Relaxed fallback: accept any unused component with matching name
            for (let idx = 0; idx < productMol.components.length; idx++) {
              if (usedSet.has(idx)) continue;
              if (productMol.components[idx].name === pComp.name) {
                candidateIdx = idx;
                break;
              }
            }
          }

          if (candidateIdx === -1) {
            // Component truly doesn't exist — this molecule is newly synthesized
            const newComponent = new Component(pComp.name, [...pComp.states]);
            newComponent.state = pComp.state;
            newComponent.wildcard = pComp.wildcard;
            candidateIdx = productMol.components.length;
            productMol.components.push(newComponent);
          } else if (requireStrictUnboundMapping && isBound(candidateIdx)) {
            return null;
          } else if (requireUnboundForProductOnlyComponent && isBound(candidateIdx)) {
            const isReactantMapped = productPatternToReactant.has(pMolIdx);
            if (!isReactantMapped) {
              return null;
            }
            markExplicitUnbound = true;
          } else if (!pComp.wildcard && pComp.edges.size === 0 && isBound(candidateIdx)) {
            // Relaxed fallback selected a currently bound site with no explicit bond
            // in the product pattern. This means product semantics require this site
            // to become unbound (e.g., BetaR(l,g,loc~cyt) -> BetaR(l,g,loc~mem,s~U)
            // acting on a reactant where s was omitted from the pattern but bound).
            //
            // BNG2 EXCEPTION (cd40 parity): When the REACTANT pattern had this exact
            // component as a wildcard bond (!?), product showing it as free means
            // CARRY-THROUGH — preserve the existing bond, do NOT clear it.
            // Example: CD40(l!?,t!1).TRAF(b!1,s~U) -> CD40(l,t)
            //   l!? in reactant → l appears free in product → preserve l bond
            //   t!1 in reactant → t appears free in product → delete t bond (explicit)
            let reactantHadWildcardForComp = false;
            const reactantMapping4 = productPatternToReactant.get(pMolIdx);
            if (reactantMapping4 !== undefined) {
              const { reactantIdx: rIdx4, targetMolIdx: rTgtMol4 } = reactantMapping4;
              const rMatch4 = matches[rIdx4];
              if (rMatch4) {
                for (const [rPatMolIdx4, rTgtMolIdx4] of rMatch4.moleculeMap.entries()) {
                  if (rTgtMolIdx4 === rTgtMol4) {
                    const rPatMol4 = reactantPatterns[rIdx4]?.molecules[rPatMolIdx4];
                    if (rPatMol4) {
                      // ⚡ Bolt: replace array .find in inner loop
                      let rComp4: typeof rPatMol4.components[0] | undefined;
                      for (let i = 0; i < rPatMol4.components.length; i++) {
                        if (rPatMol4.components[i].name === pComp.name) {
                          rComp4 = rPatMol4.components[i];
                          break;
                        }
                      }
                      if (rComp4 && rComp4.wildcard) {
                        reactantHadWildcardForComp = true;
                      }
                    }
                    break;
                  }
                }
              }
            }
            // Carry-through applies ONLY when the product shows this component with no
            // state change (e.g. CD40 l!? → l, where the product doesn't alter `l` at all).
            // If the product DOES set an explicit new state (e.g. s~U, Y1068~P), the rule
            // is actively modifying the component, so any existing bond should be broken:
            //   BetaR(l,g,loc~cyt) -> BetaR(l,g,loc~mem,s~U)  applied to s~P!1 → breaks Arr bond
            //   EGFR(d!1,Y1068~U) -> EGFR(d!1,Y1068~P) applied to Y1068~P!3 → breaks GRB2 bond
            const productSetsExplicitState = !!(pComp.state && pComp.state !== '?');
            if (!reactantHadWildcardForComp || productSetsExplicitState) {
              markExplicitUnbound = true;
            }
          }
        }

        if (productMol.components[candidateIdx]?.name !== pComp.name) {
          let sameNameCandidate = -1;
          for (let idx = 0; idx < productMol.components.length; idx++) {
            if (usedSet.has(idx)) continue;
            if (productMol.components[idx]?.name !== pComp.name) continue;
            sameNameCandidate = idx;
            break;
          }
          if (sameNameCandidate === -1) {
            return null;
          }
          candidateIdx = sameNameCandidate;
        }

        usedSet.add(candidateIdx);
        usedComponentIndicesPerMol.set(productMolIdx, usedSet);
        componentIndexMap.set(`${pMolIdx}:${pCompIdx}`, candidateIdx);

        // Apply state change if specified
        if (pComp.state && pComp.state !== '?') {
          productMol.components[candidateIdx].state = pComp.state;
        }

        if (markExplicitUnbound) {
          const unboundSet = (productMol as Molecule & { _explicitUnboundComponents?: Set<number> })._explicitUnboundComponents ?? new Set<number>();
          unboundSet.add(candidateIdx);
          (productMol as Molecule & { _explicitUnboundComponents?: Set<number> })._explicitUnboundComponents = unboundSet;
        }

        if (pComp.edges.size > 0 && !pComp.wildcard) {
          const bondedSet = (productMol as Molecule & { _explicitBondedComponents?: Set<number> })._explicitBondedComponents ?? new Set<number>();
          bondedSet.add(candidateIdx);
          (productMol as Molecule & { _explicitBondedComponents?: Set<number> })._explicitBondedComponents = bondedSet;
        }

        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Mapped pattern mol ${pMolIdx} comp ${pCompIdx} (${pComp.name}, wildcard=${pComp.wildcard}, edges=${pComp.edges.size}) -> product mol ${productMolIdx} comp ${candidateIdx} (bound=${isBound(candidateIdx)})`);
        }
      }
    }

    // Step 6: Create NEW bonds specified in the product pattern
    // Only process explicit bonds (numeric labels), not wildcards
    const bondEndpoints = new Map<number, Array<{ pMolIdx: number; pCompIdx: number }>>();

    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const patternMol = pattern.molecules[pMolIdx];
      for (let pCompIdx = 0; pCompIdx < patternMol.components.length; pCompIdx++) {
        const pComp = patternMol.components[pCompIdx];
        // Skip wildcards - they represent preserved bonds, not new ones
        if (pComp.wildcard) continue;

        for (const [bondLabel] of pComp.edges.entries()) {
          if (!bondEndpoints.has(bondLabel)) {
            bondEndpoints.set(bondLabel, []);
          }
          bondEndpoints.get(bondLabel)?.push({ pMolIdx, pCompIdx });
        }
      }
    }

    // Collect all bonds to add first
    const bondsToAdd: Array<{ molIdx1: number; compIdx1: number; molIdx2: number; compIdx2: number; bondLabel: number }> = [];

    for (const [bondLabel, endpoints] of bondEndpoints.entries()) {
      if (endpoints.length !== 2) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Bond label ${bondLabel} has ${endpoints.length} endpoints, expected 2`);
        }
        continue;
      }

      const [end1, end2] = endpoints;
      const molIdx1 = patternToProductMol.get(end1.pMolIdx);
      const molIdx2 = patternToProductMol.get(end2.pMolIdx);
      const compIdx1 = componentIndexMap.get(`${end1.pMolIdx}:${end1.pCompIdx}`);
      const compIdx2 = componentIndexMap.get(`${end2.pMolIdx}:${end2.pCompIdx}`);

      if (
        typeof molIdx1 !== 'number' ||
        typeof molIdx2 !== 'number' ||
        typeof compIdx1 !== 'number' ||
        typeof compIdx2 !== 'number'
      ) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Incomplete bond mapping for new bond ${bondLabel}`);
        }
        continue;
      }

      bondsToAdd.push({ molIdx1, compIdx1, molIdx2, compIdx2, bondLabel });
    }

    // Explicit numeric bonds in product patterns may legitimately reuse the same component
    // (e.g., NFkB Activation!0!1 binding two partners). Our graph core supports multi-site
    // bonding on a single component; do not reject such transformations.
    //
    // Clear bonds from components explicitly marked unbound in the product mapping stage.
    // This is required for rules that refine wildcard-bound reactant sites into concrete
    // unbound product sites (e.g., s~? -> s~U without an explicit product bond).
    for (let molIdx = 0; molIdx < productGraph.molecules.length; molIdx++) {
      const productMol = productGraph.molecules[molIdx] as Molecule & { _explicitUnboundComponents?: Set<number> };
      if (!productMol._explicitUnboundComponents || productMol._explicitUnboundComponents.size === 0) {
        continue;
      }
      for (const compIdx of productMol._explicitUnboundComponents) {
        productGraph.deleteBond(molIdx, compIdx);
      }
    }

    // We still clear any pre-existing bonds from endpoints that participate in explicit bonds
    // to avoid accidentally accumulating stale bonds from the reactant embedding.
    const newBondComponents = new Set<string>();
    for (const bond of bondsToAdd) {
      newBondComponents.add(`${bond.molIdx1}.${bond.compIdx1}`);
      newBondComponents.add(`${bond.molIdx2}.${bond.compIdx2}`);
    }

    // Clear all existing bonds from endpoints that will participate in explicit bonds.
    // This prevents impossible multi-bond artifacts like Fc!1!3.
    for (const key of newBondComponents) {
      const _dIdx10 = key.indexOf('.');
      const molStr = key.slice(0, _dIdx10);
      const compStr = key.slice(_dIdx10 + 1);
      const molIdx = Number(molStr);
      const compIdx = Number(compStr);
      if (!isNaN(molIdx) && !isNaN(compIdx)) {
        productGraph.deleteBond(molIdx, compIdx);
      }
    }

    // Now add all explicit bonds with fresh unique labels.
    const patternBondLabelMap = new Map<number, number>();
    for (const bond of bondsToAdd) {
      let newLabel = patternBondLabelMap.get(bond.bondLabel);
      if (newLabel === undefined) {
        newLabel = nextBondLabel++;
        patternBondLabelMap.set(bond.bondLabel, newLabel);
      }

      // Endpoints may participate in multiple explicit bonds (multi-site bonding), so do not
      // reject if they are already bound from a previous explicit bond in this same product.
      productGraph.addBond(bond.molIdx1, bond.compIdx1, bond.molIdx2, bond.compIdx2, newLabel);
    }

    // COMPARTMENT ADJACENCY VALIDATION: Check if all bonds span adjacent compartments
    // In cBNGL, bonds can only exist between molecules in adjacent compartments:
    // - Two molecules in the same compartment (volume or surface)
    // - A volume molecule and a surface molecule where the volume is adjacent to the surface
    //   (i.e., volume is parent or child of the surface)
    // If a transport rule would create a bond spanning non-adjacent compartments, the rule
    // should not fire (return null to indicate invalid product).
    if (this.options.compartments && this.options.compartments.length > 0) {
      const compartmentMap = new Map(this.options.compartments.map(c => [c.name, c]));

      // Helper to check if two compartments are adjacent (can have bonds between them)
      const areCompartmentsAdjacent = (comp1: string, comp2: string): boolean => {
        if (comp1 === comp2) return true;

        const info1 = compartmentMap.get(comp1);
        const info2 = compartmentMap.get(comp2);
        if (!info1 || !info2) return true; // Unknown compartment, allow

        // Check if one is the parent of the other
        if (info1.parent === comp2 || info2.parent === comp1) return true;

        // Check if they share the same parent (siblings)
        // Actually, for cBNGL, molecules in sibling 3D compartments (both inside same 2D surface)
        // cannot have direct bonds - they would need to be on the shared surface.
        // E.g., EC and CP are both adjacent to PM, but EC and CP are not adjacent to each other.

        return false;
      };

      // Check all bonds in the product graph
      for (const [adjKey, partnerKeys] of productGraph.adjacency.entries()) {
        const _dIdx12 = adjKey.indexOf('.');
        const molIdxStr = adjKey.slice(0, _dIdx12);
        const mol1Idx = Number(molIdxStr);
        const mol1 = productGraph.molecules[mol1Idx];
        const mol1Comp = mol1?.compartment || productGraph.compartment;

        for (const partnerKey of partnerKeys) {
          const _dIdx13 = partnerKey.indexOf('.');
          const partnerMolIdxStr = partnerKey.slice(0, _dIdx13);
          const mol2Idx = Number(partnerMolIdxStr);
          const mol2 = productGraph.molecules[mol2Idx];
          const mol2Comp = mol2?.compartment || productGraph.compartment;

          if (mol1Comp && mol2Comp && !areCompartmentsAdjacent(mol1Comp, mol2Comp)) {
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[buildProductGraph] REJECTING product: bond between ${mol1?.name}@${mol1Comp} and ${mol2?.name}@${mol2Comp} spans non-adjacent compartments`);
            }
            return null; // Invalid product - bond spans non-adjacent compartments
          }
        }
      }
    }

    // Record which reactant molecules this product pattern explicitly names. The
    // product-graph split in applyRuleTransformation must keep them all in one
    // connected component: BioNetGen SpeciesGraph::splitConnectedComponents assigns
    // each product molecule to the pattern that declared it and rejects the whole
    // reaction when a declared pattern is left with no component of its own. Molecules
    // pulled in implicitly (!+ carry-through, bystanders) are deliberately excluded —
    // BNG2 lets those become separate products.
    productGraph.patternOwnedMolKeys = new Set<number>();
    for (const mapping of productPatternToReactant.values()) {
      productGraph.patternOwnedMolKeys.add((mapping.reactantIdx << 16) | mapping.targetMolIdx);
    }

    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] Result: ${productGraph.toString()}`);
    }
    return productGraph;
  }

  private cloneMoleculeStructure(source: Molecule): Molecule {
    const clonedComponents = source.components.map((component) => {
      const cloned = new Component(component.name, [...component.states]);
      cloned.state = component.state;
      cloned.wildcard = component.wildcard;
      return cloned;
    });

    const clone = new Molecule(
      source.name,
      clonedComponents,
      source.compartment,
      source.hasExplicitEmptyComponentList
    );
    clone.label = source.label;
    return clone;
  }

  /**
   * BIO-NETGEN PARITY (`RxnRule::build_reaction`): the transformed graph is split
   * into connected components, and a component that holds no molecule declared by
   * any product pattern is a surplus product. BNG2 accepts surplus components only
   * for a rule carrying `DeleteMolecules`:
   *
   *   if (@$products != $nprod_patterns) {
   *     if ($rr->DeleteMolecules and @$products > $nprod_patterns) { keep }
   *     else { return undef }   # reaction does not happen
   *   }
   *
   * Those surplus molecules are bystanders the rule leaves stranded — the partner of
   * a molecule the rule deleted. With `DeleteMolecules` they are released as
   * products of their own; without it the rule would silently destroy them, so BNG2
   * does not fire it at all. Dropping them quietly is what made
   * `complexdegradation`'s `A(b!1).B(a!1) -> A(b)` destroy the bystander `C`.
   *
   * @returns one graph per stranded component, or `null` to reject the reaction.
   */
  private harvestStrandedBystanders(
    reactantIdx: number,
    reactantGraph: SpeciesGraph,
    bystanderMols: Set<number>,
    deleteMolecules: boolean
  ): SpeciesGraph[] | null {
    if (bystanderMols.size === 0) return [];
    if (!deleteMolecules) {
      if (shouldLogNetworkGenerator) {
        debugNetworkLog(
          `[harvestStrandedBystanders] REJECTED: reactant ${reactantIdx} leaves bystander molecules ` +
            `[${Array.from(bystanderMols).join(',')}] with no product pattern, and the rule has no DeleteMolecules.`
        );
      }
      return null;
    }

    const stranded = new SpeciesGraph();
    stranded.compartment = reactantGraph.compartment;

    const oldToNewIdx = new Map<number, number>();
    for (const oldIdx of bystanderMols) {
      const oldMol = reactantGraph.molecules[oldIdx];
      const newMol = this.cloneMoleculeStructure(oldMol);
      newMol._sourceKey = `${reactantIdx}:${oldIdx}`;
      newMol._sourceR = reactantIdx;
      newMol._sourceM = oldIdx;
      if (!newMol.compartment && reactantGraph.compartment) newMol.compartment = reactantGraph.compartment;
      oldToNewIdx.set(oldIdx, stranded.molecules.length);
      stranded.molecules.push(newMol);
    }

    // Rebuild only the bonds internal to the stranded set: bonds to a deleted
    // molecule die with it, and bonds to a survivor would have merged the
    // bystander into that survivor's product graph instead.
    for (const oldIdx of bystanderMols) {
      const oldMol = reactantGraph.molecules[oldIdx];
      const newIdx = oldToNewIdx.get(oldIdx)!;
      for (let c = 0; c < oldMol.components.length; c++) {
        const neighbors = reactantGraph.adjacency.get(`${oldIdx}.${c}`);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          const _dIdx = neighbor.indexOf('.');
          const nM = Number(neighbor.slice(0, _dIdx));
          const nC = Number(neighbor.slice(_dIdx + 1));
          const newN = oldToNewIdx.get(nM);
          if (newN === undefined) continue;
          const keyA = `${newIdx}.${c}`;
          const valA = `${newN}.${nC}`;
          if (!stranded.adjacency.has(keyA)) stranded.adjacency.set(keyA, []);
          if (!stranded.adjacency.get(keyA)!.includes(valA)) stranded.adjacency.get(keyA)!.push(valA);
        }
      }
    }

    const graphs = stranded.split();
    if (shouldLogNetworkGenerator) {
      debugNetworkLog(
        `[harvestStrandedBystanders] Reactant ${reactantIdx}: releasing ${graphs.length} stranded product(s) ` +
          `[${graphs.map((g) => g.toString()).join(' | ')}] (DeleteMolecules)`
      );
    }
    return graphs;
  }

  /**
   * Add species to network or retrieve existing
   */
  private addOrGetSpecies(
    graph: SpeciesGraph,
    speciesMap: Map<string, Species>,
    speciesList: Species[],
    queue: Species[],
    signal?: AbortSignal
  ): Species {
    const _dedupStart = profilingEnabled ? performance.now() : 0;

    let canonical: string;
    if (graph.adjacency.size === 0) {
      const structHash = graph.getStructuralHash();
      const cached = this.structuralHashMap.get(structHash);
      if (cached !== undefined) {
        canonical = cached;
        graph.cachedCanonical = canonical;
      } else {
        canonical = profiledCanonicalize(graph);
        this.structuralHashMap.set(structHash, canonical);
      }
    } else {
      // A structural hash contains only local neighbour descriptions. Distinct
      // bonded topologies (for example K3,3 and a triangular prism) can collide,
      // so bonded species must establish identity by canonical labeling.
      canonical = profiledCanonicalize(graph);
    }

    if (speciesMap.has(canonical)) {
      if (profilingEnabled) { PROFILE_DATA.speciesDedup += performance.now() - _dedupStart; PROFILE_DATA.speciesDedupCount++; }
      const existing = speciesMap.get(canonical);
      if (existing) return existing;
    }

    if (speciesList.length >= this.options.maxSpecies) {
      this.warnSpeciesLimit();
      throw this.buildLimitError(
        `Max species limit reached (${this.options.maxSpecies}) while applying rule "${this.currentRuleName ?? 'unknown'}"`
      );
    }

    const species = new Species(graph, speciesList.length);

    // Set initial concentration from seeds
    const seedConcentration = (this.seedConcentrationMap?.get(canonical) ?? 0);
    species.initialConcentration = seedConcentration;

    speciesMap.set(canonical, species);
    speciesList.push(species);
    this.indexSpecies(species);
    queue.push(species);

    if (signal?.aborted) {
      throw new DOMException('Network generation cancelled', 'AbortError');
    }

    if (profilingEnabled) { PROFILE_DATA.speciesDedup += performance.now() - _dedupStart; PROFILE_DATA.speciesDedupCount++; }
    return species;
  }



  /**
   * Add a species' molecules to the inverted index for quick lookup when matching
   */
  private indexSpecies(species: Species): void {
    for (const m of species.graph.molecules) {
      const set = this.speciesByMoleculeIndex.get(m.name) ?? new Set<number>();
      set.add(species.index);
      this.speciesByMoleculeIndex.set(m.name, set);
    }
  }



  private checkResourceLimits(signal?: AbortSignal): void {
    // Removed yielding to event loop - it causes issues in some test runners
    if (signal?.aborted) {
      throw new Error(
        'Network generation was cancelled. ' +
        'The expansion was aborted before completion. No partial network is available.'
      );
    }

    const now = Date.now();
    if (now - this.lastMemoryCheck > this.options.checkInterval) {
      this.lastMemoryCheck = now;

      const memory = (performance as ExtendedPerformance).memory;
      if (memory && memory.usedJSHeapSize > this.options.memoryLimit) {
        throw new Error(
          `Network generation stopped: memory usage (${(memory.usedJSHeapSize / 1e6).toFixed(0)} MB) ` +
          `exceeded the ${(this.options.memoryLimit / 1e6).toFixed(0)} MB limit. ` +
          'This usually means the model generates too many species (unbounded polymerization). ' +
          'Try adding max_stoich or max_iter to your generate_network() action, ' +
          'or use simulate({method=>"nf"}) for network-free simulation.'
        );
      }
    }
  }

  private validateProducts(products: SpeciesGraph[]): boolean {
    for (const product of products) {
      if (product.molecules.length > this.options.maxAgg) {
        this.warnAggLimit(product.molecules.length);
        throw this.buildLimitError(
          `Species exceeds max complex size (${this.options.maxAgg}); rule "${this.currentRuleName ?? 'unknown'}" likely produces runaway polymerization.`
        );
      }

      const typeCounts = new Map<string, number>();
      for (const mol of product.molecules) {
        typeCounts.set(mol.name, (typeCounts.get(mol.name) || 0) + 1);
      }
      for (const [typeName, count] of typeCounts.entries()) {
        let limit: number;
        if (typeof this.options.maxStoich === 'number') {
          limit = this.options.maxStoich;
        } else if (this.options.maxStoich instanceof Map) {
          limit = this.options.maxStoich.get(typeName) ?? Infinity;
        } else {
          limit = (this.options.maxStoich as Record<string, number>)[typeName] ?? Infinity;
        }
        if (count > limit) {
          return false;
        }
      }

      for (const mol of product.molecules) {
        for (const comp of mol.components) {
          if (comp.wildcard === '+' && comp.edges.size === 0) {
            console.warn('[validateProducts] Component marked !+ but no bond present; rejecting product');
            return false;
          }
        }
      }
    }
    return true;
  }

  private warnAggLimit(count: number) {
    if (this.aggLimitWarnings < 5) {
      console.warn(`Species exceeds max_agg: ${count}`);
    } else if (this.aggLimitWarnings === 5) {
      console.warn('Species exceeds max_agg: additional occurrences suppressed');
    }
    this.aggLimitWarnings++;
  }



  private warnSpeciesLimit() {
    this.speciesLimitWarnings++;
  }

  private buildLimitError(message: string): NetworkGenerationLimitError {
    return new NetworkGenerationLimitError(
      message,
      this.currentSpeciesList.length,
      this.currentReactionsList.length,
      this.currentRuleName ?? undefined
    );
  }

}
