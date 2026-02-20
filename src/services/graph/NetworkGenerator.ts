// graph/NetworkGenerator.ts
import { SpeciesGraph } from './core/SpeciesGraph.ts';
import { Species } from './core/Species.ts';
import { RxnRule } from './core/RxnRule.ts';
import { Rxn } from './core/Rxn.ts';
import { GraphCanonicalizer } from './core/Canonical.ts';
import { GraphMatcher, clearMatchCache } from './core/Matcher.ts';
import type { MatchMap } from './core/Matcher.ts';
import { countEmbeddingDegeneracy } from './core/degeneracy.ts';
import { Component } from './core/Component.ts';
import { EnergyService } from './core/EnergyService.ts';
import type { BNGLEnergyPattern } from '../../../types.ts';
import { Molecule } from './core/Molecule.ts';
import { BNGLParser } from './core/BNGLParser.ts';

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
}

export function disableProfiling() {
  profilingEnabled = false;
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
};

export function resetProfileData() {
  for (const key of Object.keys(PROFILE_DATA) as Array<keyof typeof PROFILE_DATA>) {
    PROFILE_DATA[key] = 0;
  }
}

export function printProfileData() {
  console.log('\n=== NetworkGenerator Profile ===');
  console.log(`  canonicalize: ${(PROFILE_DATA.canonicalize / 1000).toFixed(3)}s (${PROFILE_DATA.canonicalizeCount} calls)`);
  console.log(`  findAllMaps: ${(PROFILE_DATA.findAllMaps / 1000).toFixed(3)}s (${PROFILE_DATA.findAllMapsCount} calls)`);
  console.log(`  applyTransformation: ${(PROFILE_DATA.applyTransformation / 1000).toFixed(3)}s (${PROFILE_DATA.applyTransformationCount} calls)`);
  console.log(`  isDuplicateReaction: ${(PROFILE_DATA.isDuplicateReaction / 1000).toFixed(3)}s (${PROFILE_DATA.isDuplicateReactionCount} calls)`);
  console.log(`  degeneracy: ${(PROFILE_DATA.degeneracy / 1000).toFixed(3)}s (${PROFILE_DATA.degeneracyCount} calls)`);
  console.log('================================\n');
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
    normalizeRateExpressionForMerge(existingExprRaw!) === normalizeRateExpressionForMerge(incomingExprRaw!)
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

export interface GeneratorProgress {
  species: number;
  reactions: number;
  iteration: number;
  memoryUsed: number;
  timeElapsed: number;
}

// Debug flag for volume scaling
const DEBUG_VOLUME_SCALE = false; // Set to true to debug cBNGL volume scaling

export class NetworkGenerator {
  private options: GeneratorOptions;
  // NEW: map Molecule name -> set of species indices that contain that molecule
  private speciesByMoleculeIndex: Map<string, Set<number>> = new Map();
  // NEW: map Compartment name -> Size (for volume scaling)
  private compartmentVolumes: Map<string, number> = new Map();
  // NEW: map Canonical Name -> Initial Concentration (from seed parameter evaluation)
  private seedConcentrationMap?: Map<string, number>;

  private startTime: number = 0;
  private lastMemoryCheck: number = 0;
  private aggLimitWarnings = 0;
  private speciesLimitWarnings = 0;
  private currentRuleName: string | null = null;
  private energyService?: EnergyService;

  constructor(options: Partial<GeneratorOptions> & { seedConcentrationMap?: Map<string, number> } = {}) {
    this.options = {
      maxSpecies: 10000,
      maxReactions: 100000,
      maxIterations: 50,
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
        console.warn(`[NetworkGenerator] Failed to evaluate Arrhenius param expression: ${expr}`, e);
        return this.options.parameters.get(expr) ?? defaultValue;
      }
    }
    return defaultValue;
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
        const comp = this.options.compartments.find(c => c.name === cName);
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
  private getSpeciesVolume(s: Species | SpeciesGraph): number {
    const cName = this.getSpeciesCompartment(s);
    if (!cName || !this.options.compartments) return 1;
    const comp = this.options.compartments.find(c => c.name === cName);
    return (comp && comp.size > 0) ? comp.size : 1;
  }

  /**
   * Calculate volume scaling info for reactions.
   * Mirrors BNG2 Rxn.pm anchor logic:
   * - If any reactant is on a surface (2D), anchor to the surface.
   * - Otherwise anchor to a volume (3D).
   * - For zero-order synthesis (no reactants), anchor to the product compartment.
   */
  private getVolumeScalingInfo(reactants: Species[], products: Species[] = []): { scale: number; scalingVolume: number } {
    if (!this.options.compartments || this.options.compartments.length === 0) {
      return { scale: 1, scalingVolume: 1 };
    }
    const compartments = this.options.compartments;

    const pickAnchorVolume = (candidates: Species[]): number => {
      // INLINE COMMENT: BNG2 prefers 3D volumes as reaction anchors for mass-action ODE scaling.
      // Surface areas (dim 2) are only used if no 3D volumes are involved in the reaction.
      const surfaceVolumes: number[] = [];
      const volumeVolumes: number[] = [];

      for (const species of candidates) {
        const compName = this.getSpeciesCompartment(species);
        if (!compName) continue;
        const comp = compartments.find(c => c.name === compName);
        if (!comp) continue;
        const size = comp.size > 0 ? comp.size : 1;
        if (comp.dimension === 2) surfaceVolumes.push(size);
        else volumeVolumes.push(size); // dimension 3 or undefined
      }

      // Prefer 3D volumes (standard BNG2 behavior)
      if (volumeVolumes.length > 0) return volumeVolumes[0];
      if (surfaceVolumes.length > 0) return surfaceVolumes[0];
      return 1;
    };

    const anchorVolume = reactants.length > 0
      ? pickAnchorVolume(reactants)
      : pickAnchorVolume(products);

    return { scale: 1 / anchorVolume, scalingVolume: anchorVolume };
  }

  /**
   * Helper: Check if two compartments are adjacent (share a boundary) or identical.
   * In BNGL, a 2D compartment is adjacent to its 3D parent and possible 3D children.
   */
  private areAdjacent(comp1Name: string | null, comp2Name: string | null): boolean {
    if (comp1Name === comp2Name) return true;
    if (!comp1Name || !comp2Name) return true; // Default/null compartments can interact? 

    if (!this.options.compartments) return true;

    const c1 = this.options.compartments.find(c => c.name === comp1Name);
    const c2 = this.options.compartments.find(c => c.name === comp2Name);

    if (!c1 || !c2) return true;

    // Check parent-child relationship
    if (c1.parent === c2.name || c2.parent === c1.name) return true;

    // Siblings might be adjacent if they share a surface, but BNGL usually requires 
    // one to be the parent (Volume) of the other (Surface).

    return false;
  }



  private computeCollapsedRuleStatFactor(rule: RxnRule): number {
    // Recover BioNetGen's stat_factor for symmetric repeated sites when the matcher returns
    // a single embedding. We approximate this from *pattern-level* bond-count changes.
    //
    // Example: L(r,r) + R(l) -> L(r,r!1).R(l!1)
    // - L has 2 equivalent unbound r sites; one becomes bound => stat_factor = 2.
    const summarize = (graphs: SpeciesGraph[]) => {
      const byMol = new Map<string, { bound: Map<string, number>; unbound: Map<string, number> }>();

      const moleculePatternKey = (mol: Molecule): string => {
        const componentSig = mol.components
          .map((comp) => {
            const statePart = comp.state !== null ? `~${comp.state}` : '';
            const wildcardPart = comp.wildcard ? `?${comp.wildcard}` : '';
            const boundPart = comp.edges.size > 0 ? '!b' : '';
            return `${comp.name}${statePart}${wildcardPart}${boundPart}`;
          })
          .sort()
          .join(',');
        return `${mol.name}|${componentSig}`;
      };

      const bump = (m: Map<string, number>, key: string, delta: number) => {
        m.set(key, (m.get(key) ?? 0) + delta);
      };

      for (const g of graphs) {
        for (const mol of g.molecules) {
          const molKey = moleculePatternKey(mol);
          if (!byMol.has(molKey)) {
            byMol.set(molKey, { bound: new Map(), unbound: new Map() });
          }
          const entry = byMol.get(molKey)!;

          for (const comp of mol.components) {
            const isBound = comp.edges.size > 0 || comp.wildcard === '+';
            // Treat explicit '-' as unbound. Also treat "plain" sites (no wildcard/edges)
            // as unbound, which matches BNGL semantics for patterns like r or r~U.
            const isUnbound = (!isBound && comp.wildcard === '-') || (!isBound && !comp.wildcard);

            if (isBound) bump(entry.bound, comp.name, 1);
            else if (isUnbound) bump(entry.unbound, comp.name, 1);
          }
        }
      }

      return byMol;
    };

    const react = summarize(rule.reactants);
    const prod = summarize(rule.products);
    const reactantMolTypeCount = new Set(
      rule.reactants.flatMap((graph) => graph.molecules.map((mol) => mol.name))
    ).size;

    const addCandidates: number[] = [];
    const delCandidates: number[] = [];

    for (const [molPatternKey, rCounts] of react.entries()) {
      const pCounts = prod.get(molPatternKey);
      if (!pCounts) continue;

      const allCompNames = new Set<string>([
        ...Array.from(rCounts.bound.keys()),
        ...Array.from(rCounts.unbound.keys()),
        ...Array.from(pCounts.bound.keys()),
        ...Array.from(pCounts.unbound.keys()),
      ]);

      for (const compName of allCompNames) {
        const rBound = rCounts.bound.get(compName) ?? 0;
        const rUnbound = rCounts.unbound.get(compName) ?? 0;
        const pBound = pCounts.bound.get(compName) ?? 0;

        // One new bond formed at this site type.
        // NOTE: Bond formation consumes one unbound endpoint on *each* side of the bond.
        // When patterns have symmetric repeated sites, BNG2's stat_factor corresponds to
        // the number of equivalent endpoint choices. For the common single-bond case,
        // the correct factor is the max endpoint multiplicity (e.g., L has 2 r sites, R has 1).
        if (pBound === rBound + 1 && rUnbound > 1) {
          addCandidates.push(rUnbound);
        }

        // One bond broken at this site type.
        // IMPORTANT: rBound counts *endpoints*, not bonds. For symmetric dimer unbinding
        // (e.g., TLR4(TLR4!1).TLR4(TLR4!1) -> TLR4 + TLR4), rBound=2 but the number of
        // distinct bonds to break is 1, and BNG2's stat_factor is 1 (not 2).
        //
        // Approximate the number of equivalent deletable bonds as rBound/2 only when
        // the reactant side is a single molecule type (typical symmetric homodimer case).
        // For multi-type complexes (e.g., gene-protein), each bound endpoint can represent
        // a distinct deletable bond and should keep full multiplicity.
        if (pBound === rBound - 1 && rBound > 1) {
          const deleteFactor = reactantMolTypeCount === 1
            ? Math.max(1, Math.floor(rBound / 2))
            : rBound;
          delCandidates.push(deleteFactor);
        }
      }
    }

    const addFactor = addCandidates.length > 0 ? Math.max(...addCandidates) : 1;
    const delFactor = delCandidates.length > 0 ? Math.max(...delCandidates) : 1;
    return Math.max(addFactor, delFactor, 1);
  }

  private areCompartmentsAdjacent(comp1Name: string | null, comp2Name: string | null): boolean {
    // If either is null/undefined, can't check adjacency - allow (for backward compatibility)
    if (!comp1Name || !comp2Name) return true;

    // Same compartment is always OK
    if (comp1Name === comp2Name) return true;

    // No compartments defined in model - allow
    if (!this.options.compartments || this.options.compartments.length === 0) return true;

    const comp1 = this.options.compartments.find(c => c.name === comp1Name);
    const comp2 = this.options.compartments.find(c => c.name === comp2Name);

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

    const comp1 = this.options.compartments.find(c => c.name === comp1Name);
    const comp2 = this.options.compartments.find(c => c.name === comp2Name);

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
    clearMatchCache();

    const speciesMap = new Map<string, Species>();
  const speciesByFingerprint = new Map<string, Species[]>();
    const speciesList: Species[] = [];
    const reactionsList: Rxn[] = [];
    const reactionKeys = new Set<string>();  // Fast duplicate detection for reactions
    const reactionIndexByKey = new Map<string, number>();
    const queue: SpeciesGraph[] = [];
    const processedPairs = new Set<string>();  // Track processed (species, rule) pairs
    const ruleProcessedSpecies = new Map<number, Set<string>>(); // Track species processed per rule (by rule index) to prevent runaway generation

    // Initialize rule processed sets using rule index as key
    for (let i = 0; i < rules.length; i++) {
      ruleProcessedSpecies.set(i, new Set<string>());
    }

    // Initialize with seed species
    for (const sg of seedSpecies) {
      this.addOrGetSpecies(sg, speciesMap, speciesByFingerprint, speciesList, queue, signal);
    }

    // Handle synthesis rules (0 -> X) - add products directly
    // These are zero-order reactions that produce species regardless of existing species
    for (const rule of rules) {
      if (rule.reactants.length === 0 && rule.products.length > 0) {
        debugNetworkLog(`[NetworkGenerator] Processing synthesis rule: ${rule.name}`);

        // Add each product species if not already present
        for (const productGraph of rule.products) {
          this.addOrGetSpecies(productGraph, speciesMap, speciesByFingerprint, speciesList, queue, signal);
        }

        // Create the synthesis reaction (no reactants -> products)
        const productIndices = rule.products.map(pg => {
          const canonical = profiledCanonicalize(pg);
          return speciesMap.get(canonical)!.index;
        });

        const productSpeciesList = productIndices.map(idx => speciesList[idx]);
        const { scalingVolume } = this.getVolumeScalingInfo([], productSpeciesList);

        const rxn = new Rxn([], productIndices, rule.rateConstant, rule.name, {
          statFactor: 1,
          rateExpression: rule.rateExpression,
          scalingVolume
        });

        const rxnKey = getReactionKey(rxn.reactants, rxn.products, rule.name);
        const existingIdx = reactionIndexByKey.get(rxnKey);
        if (existingIdx === undefined) {
          reactionKeys.add(rxnKey);
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
    }

    let iteration = 0;
    let lastLoggedSpeciesCount = speciesList.length;
    const logInterval = 50; // Log every 50 new species
    let lastProgressCallback = Date.now();

    progressLog(`[NetworkGenerator] Starting with ${speciesList.length} seed species, ${rules.length} rules`);

    try {
      // BNG2-style iteration: process all current species in the queue per iteration
      while (queue.length > 0 && iteration < this.options.maxIterations) {
        if (signal?.aborted) {
          throw new DOMException('Network generation cancelled', 'AbortError');
        }
        await this.checkResourceLimits(signal);
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
          // Log progress every 10 species or so
          if (speciesList.length % 10 === 0 && speciesList.length > 0) {
            console.log(`[NetworkGenerator] Progress: ${speciesList.length} species, ${reactionsList.length} reactions...`);
          }
          const currentSpecies = queue.shift()!;
          const currentCanonical = profiledCanonicalize(currentSpecies);
          const currentSpeciesObj = speciesMap.get(currentCanonical)!;



          if (shouldLogNetworkGenerator) {
            debugNetworkLog(
              `[NetworkGenerator] Iter ${iteration}, Species ${currentSpeciesObj.index}: ${currentSpecies
                .toString()
                .slice(0, 100)}`
            );
          }

          // Apply each rule to current species
          for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
            const rule = rules[ruleIdx];
            if (signal?.aborted) {
              throw new DOMException('Network generation cancelled', 'AbortError');
            }

            this.currentRuleName = rule.name;
            // Debug: Print rule dispatch info (reactant count and types)
            if (shouldLogNetworkGenerator) {
              const reactantInfo = (rule.reactants || [])
                .map((reactant: any, index: number) => {
                  const reactantType =
                    reactant && typeof reactant === 'object' && reactant.constructor
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

            // Skip if already processed this (species, rule) pair
            const pairKey = `${currentCanonical}::${ruleIdx}`;
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);

            // Skip if this species was already processed for this rule (prevents runaway generation)
            const ruleProcessed = ruleProcessedSpecies.get(ruleIdx)!;
            if (ruleProcessed.has(currentCanonical)) continue;
            ruleProcessed.add(currentCanonical);

            if (rule.reactants.length === 0) {
              // Synthesis rule (0 -> X): Skip in network generation loop
              // Synthesis rules are zero-order and don't depend on existing species
              // They are handled separately by adding products directly
              continue;
            } else if (rule.reactants.length === 1) {
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
                speciesByFingerprint,
                speciesList,
                queue,
                reactionsList,
                reactionKeys,
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
                speciesByFingerprint,
                speciesList,
                queue,
                reactionsList,
                reactionKeys,
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
          const now = Date.now();
          if (onProgress && (now - lastProgressCallback >= 100)) { // Update every 100ms
            lastProgressCallback = now;
            onProgress({
              species: speciesList.length,
              reactions: reactionsList.length,
              iteration,
              memoryUsed: (performance as any).memory?.usedJSHeapSize || 0,
              timeElapsed: Date.now() - this.startTime
            });
          }
        } // End of batch for-loop

        // Ensure final update at end of iteration if not just updated
        const now2 = Date.now();
        if (onProgress && now2 - lastProgressCallback > 50) {
          lastProgressCallback = now2;
          onProgress({
            species: speciesList.length,
            reactions: reactionsList.length,
            iteration,
            memoryUsed: (performance as any).memory?.usedJSHeapSize || 0,
            timeElapsed: Date.now() - this.startTime
          });
        }
      }
    } catch (e: any) {
      // Catch limit errors and return partial results
      if (e.name === 'NetworkGenerationLimitError') {
        console.warn(`Network generation limit reached: ${e.message}`);
        // Continue and return partial results
      } else {
        throw e;
      }
    }

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);

    // MEDIUM BUG FIX: Warn when maxIterations limit was reached
    if (iteration >= this.options.maxIterations && queue.length > 0) {
      console.warn(`[NetworkGenerator] WARNING: maxIterations limit (${this.options.maxIterations}) reached with ${queue.length} species still in queue. Network may be incomplete.`);
    }

    progressLog(`[NetworkGenerator] Complete: ${speciesList.length} species, ${reactionsList.length} reactions in ${totalTime}s (${iteration} iterations)`);

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
    speciesByFingerprint: Map<string, Species[]>,
    speciesList: Species[],
    queue: SpeciesGraph[],
    reactionsList: Rxn[],
    reactionKeys: Set<string>,
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {
    const pattern = rule.reactants[0];

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
        const parts = targetCompKey.split('.');
        if (parts.length === 2) {
          const parsed = Number(parts[1]);
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
          const sourceKey = (mol as any)._sourceKey as string | undefined;
          if (!sourceKey) continue;
          const [rStr, molIdxStr] = sourceKey.split(':');
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
            const [mol2Str, comp2Str] = partnerKey.split('.');
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
            const sourceKey = (mol as any)._sourceKey as string | undefined;
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

    let filteredMatches: MatchMap[];
    if (rule.isMatchOnce) {
      const firstMap = profiledFindFirstMap(pattern, reactantSpecies.graph, { symmetryBreaking: true });
      if (firstMap && this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, firstMap) &&
          this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, firstMap)) {
        filteredMatches = [firstMap];
      } else {
        filteredMatches = profiledFindAllMaps(pattern, reactantSpecies.graph, { symmetryBreaking: true }).filter((match) =>
          this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, match) &&
          this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, match)
        );
      }
    } else {
      filteredMatches = profiledFindAllMaps(pattern, reactantSpecies.graph, { symmetryBreaking: true }).filter((match) =>
        this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, match) &&
        this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, match)
      );
    }
    const matches = rule.isMatchOnce ? filteredMatches.slice(0, 1) : filteredMatches;

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

    // Recover stat_factor for collapsed symmetric embeddings (e.g., repeated identical sites).
    const collapsedRuleStatFactor = matchCount === 1 ? this.computeCollapsedRuleStatFactor(rule) : 1;

    const signatureMultiplicityByOutcome = new Map<string, number>();
    for (const candidateMatch of matches) {
      const candidateProducts = this.applyRuleTransformation(
        rule,
        [rule.reactants[0]],
        [reactantSpecies.graph],
        [candidateMatch]
      );
      if (candidateProducts === null || !this.validateProducts(candidateProducts)) {
        continue;
      }
      const expectedProductCount = rule.products.length;
      if (candidateProducts.length < expectedProductCount) {
        continue;
      }
      const sig =
        buildUnimolecularEventSignatureFromRuleOps(candidateMatch) ??
        buildUnimolecularEventSignatureFromProducts(candidateProducts);
      if (!sig) continue;
      signatureMultiplicityByOutcome.set(sig, (signatureMultiplicityByOutcome.get(sig) ?? 0) + 1);
    }


    for (const match of matches) {

      if (signal?.aborted) {
        throw new DOMException('Network generation cancelled', 'AbortError');
      }

      const degeneracy = countEmbeddingDegeneracy(pattern, reactantSpecies.graph, match);

      // 3. Apply Transformation
      const products = this.applyRuleTransformation(
        rule,
        [rule.reactants[0]],
        [reactantSpecies.graph],
        [match]
      );

      // Debug: log transformation result for phosphorylation rule
      if (rule.name?.includes('DeCe1')) {
        const productSummary = products ? products.map(p => p.toString()).join('|') : 'null';
        console.log(`[DeCe1_TRACE] Name='${rule.name}' ProductsLen=${products?.length} Result=${productSummary}`);
      }
      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[applyUnimolecularRule] Transformation result: ${products ? products.map(p => p.toString()).join(', ') : 'null'}`);
      }

      // products === null means transformation failed (e.g., no match)
      // products === [] (empty array) is valid for degradation rules
      if (products === null || !this.validateProducts(products)) {
        continue;
      }

      // BNG2.pl parity check (RxnRule.pm lines 3156-3170):
      // Number of product graphs must equal number of product patterns.
      // For example, reverse unbind "A.B -> A + B" has 2 product patterns.
      // If applied to a ternary complex where breaking one bond leaves the complex
      // still connected (e.g., by another bond), result is 1 connected product.
      // Reaction is rejected because 1 != 2.
      const expectedProductCount = rule.products.length;
      if (products.length < expectedProductCount) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[applyUnimolecularRule] Rejecting rule ${rule.name}: product count ${products.length} != expected ${expectedProductCount}`);
        }
        continue;
      }

      // Now that we have a concrete outcome, build a stable event signature and deduplicate.
      // Prefer explicit RxnRule ops when present; otherwise derive from the product split.
      const signature =
        buildUnimolecularEventSignatureFromRuleOps(match) ??
        buildUnimolecularEventSignatureFromProducts(products);
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

      const skipSignatureDedup = hasWildcardBoundPattern && rule.deleteBonds.length > 0 && rule.addBonds.length === 0;

      // Deduplicate symmetry-equivalent embeddings (same physical event).
      // This avoids 2x overcounting for cases like symmetric dimer unbinding where
      // multiple automorphism-related embeddings map to the same bond endpoints.
      if (signature && !skipSignatureDedup) {
        if (seenSignatures.has(signature)) {
          if (debugSignatureForThisRule && debugPrinted < 10) {
            console.log('  -> DUPLICATE signature, skipping (symmetry-equivalent)');
          }
          continue;
        }
        seenSignatures.add(signature);
      }

      // Add all products to network
      const productSpeciesIndices: number[] = [];
      const productSpeciesList: Species[] = [];
      for (const product of products) {
        const productSpecies = this.addOrGetSpecies(product, speciesMap, speciesByFingerprint, speciesList, queue, signal);
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
      const baseRateConstant = (rule as any).isFunctionalRate && rule.rateConstant === 0 ? 1 : rule.rateConstant;
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

      let statFactor = useDegeneracy ? degeneracy : (matchCount === 1 ? collapsedRuleStatFactor : 1);

      if (isSymmetricHomodimerUnbind) {
        statFactor = 1;
      }

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

      if (hasTopologyChangingOps && hasWildcardBoundPattern && statFactor === 1 && collapsedRuleStatFactor > 1) {
        statFactor = collapsedRuleStatFactor;
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

      // For unimolecular bond-topology rules on symmetric multi-monomer complexes,
      // symmetry-broken matching collapses equivalent embeddings to a single match.
      // When full (non-SB) map count exceeds the SB match count, the missing factor
      // must be restored (e.g., dsRNA unbinding from TLR3 homodimer has 2 equivalent sites).
      // Only apply when statFactor is not already accounting for the symmetry (statFactor <= 1)
      // and the rule genuinely has topology-changing ops.
      if (
        hasTopologyChangingOps &&
        !isSymmetricHomodimerUnbind &&
        !rule.isMatchOnce &&
        statFactor <= 1
      ) {
        const fullMapsNoSB = profiledFindAllMaps(pattern, reactantSpecies.graph, {
          symmetryBreaking: false,
        }).filter(
          (m) =>
            this.matchRespectsExplicitComponentBondCounts(pattern, reactantSpecies.graph, m) &&
            this.matchRespectsProductImpliedFreeConstraints(rule, pattern, reactantSpecies.graph, m)
        );
        // matchCount = SB match count (from filteredMatches above)
        // Only apply if SB collapsed some equivalent embeddings
        if (fullMapsNoSB.length > matchCount && matchCount > 0) {
          statFactor = Math.max(statFactor, fullMapsNoSB.length / matchCount);
        }
      }
      const hasRateExpression = !!rule.rateExpression;
      let effectiveRate = baseRateConstant * statFactor;

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
        effectiveRate = A * Math.exp(-(Eact + phi * deltaG)) * statFactor;
      }

      // For Arrhenius rules: use null rateExpression so the NET file writes the numeric rate.
      // The string "Arrhenius(phi,Ea0)" cannot be evaluated by downstream tools.
      const rateExpression = (rule as any).isArrhenius ? undefined : rule.rateExpression;



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
          scalingVolume
        }
      );

      if (isIdentityReactionBySpeciesIndices(rxn.reactants, rxn.products)) {
        continue;
      }

      // Fast O(1) duplicate detection using Set
      const rxnKey = getReactionKey(rxn.reactants, rxn.products, rule.name);
      const existingIdx = reactionIndexByKey.get(rxnKey);
      if (existingIdx === undefined) {
        reactionKeys.add(rxnKey);
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

        const targetCompIdx = Number(targetCompKey.split('.')[1]);
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

    // Count total reactant molecules by name across ALL reactant patterns, and
    // total product molecules by name. If a molecule type has more reactant instances
    // than product instances, some are being deleted (DeleteMolecules). For deleted
    // molecules, we cannot determine which product corresponds to which reactant, so
    // we skip the product-implied-free constraint for those molecule types.
    // Example: DeCe2: CCNE(CDKN1A) + CCNE() -> CCNE(CDKN1A) DeleteMolecules
    //   2 CCNE reactants, 1 CCNE product → 1 CCNE is deleted → skip constraint for CCNE
    //   (The product CCNE(CDKN1A) comes from reactant slot 0, NOT slot 1; applying it to slot 1
    //    would wrongly reject CCNE complexes from matching the "any CCNE" pattern.)
    const totalReactantMolsByName = new Map<string, number>();
    for (const rPat of rule.reactants) {
      for (const rMol of rPat.molecules) {
        totalReactantMolsByName.set(rMol.name, (totalReactantMolsByName.get(rMol.name) ?? 0) + 1);
      }
    }
    const totalProductMolsByName = new Map<string, number>();
    for (const pPat of rule.products) {
      for (const pMol of pPat.molecules) {
        totalProductMolsByName.set(pMol.name, (totalProductMolsByName.get(pMol.name) ?? 0) + 1);
      }
    }

    for (let pMolIdx = 0; pMolIdx < reactantPattern.molecules.length; pMolIdx++) {
      const reactantMol = reactantPattern.molecules[pMolIdx];
      const targetMolIdx = match.moleculeMap.get(pMolIdx);
      if (targetMolIdx === undefined) continue;
      const targetMol = target.molecules[targetMolIdx];
      if (!targetMol) continue;

      // If fewer products have this molecule name than there are reactant instances, some are
      // deleted. Skip the product-implied-free constraint to avoid cross-contamination where a
      // product belonging to a different reactant slot is wrongly applied as a constraint here.
      const reactCountForName = totalReactantMolsByName.get(reactantMol.name) ?? 0;
      const prodCountForName = totalProductMolsByName.get(reactantMol.name) ?? 0;
      if (reactCountForName > prodCountForName) continue;

      // Build set of component names present in the reactant pattern molecule.
      // Components in the pattern are explicitly constrained; missing ones are free.
      const reactantCompNames = new Set(reactantMol.components.map(c => c.name));

      // Search for a matching product molecule by molecule name and collect
      // components that are explicitly unbound in the product but absent from
      // the reactant pattern.
      for (const prodPattern of rule.products) {
        for (const prodMol of prodPattern.molecules) {
          if (prodMol.name !== reactantMol.name) continue;

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
              const reactantComp = reactantMol.components.find(c => c.name === prodComp.name);
              if (!reactantComp?.syntheticWildcard) continue; // explicit pattern component — already constrained
              // synthetic wildcard — fall through to check target bond state
            }

            // Component is explicitly free in product but absent from reactant pattern.
            // BNG2 requires the target to also have it free.
            const targetComp = targetMol.components.find(c => c.name === prodComp.name);
            if (!targetComp) continue; // molecule type doesn't have this component on this instance
            if (targetComp.edges.size !== 0) {
              // Target has this component bonded — reject this match.
              return false;
            }
          }
        }
      }
    }

    return true;
  }

  /**
   * Supports arbitrary number of reactants (unimolecular, bimolecular, ternary, etc.)
   */
  private async applyNaryRule(
    rule: RxnRule,
    ruleIdx: number,
    currentSpecies: Species,
    allSpecies: Species[],
    speciesMap: Map<string, Species>,
    speciesByFingerprint: Map<string, Species[]>,
    speciesList: Species[],
    queue: SpeciesGraph[],
    reactionsList: Rxn[],
    reactionKeys: Set<string>,
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {

    const patterns = rule.reactants;
    const n = patterns.length;
    if (n < 2) return; // Unimolecular handled separately

    const isPureStateChangeRule =
      rule.changeStates.length > 0 &&
      rule.addBonds.length === 0 &&
      rule.deleteBonds.length === 0 &&
      rule.deleteMolecules.length === 0;
    const matchSymmetryBreaking = !isPureStateChangeRule;

    // Detect carry-through (catalyst) reactant patterns by comparing reactant pattern keys
    // against product pattern keys. A reactant is "carry-through" if the same pattern graph
    // (molecule types, component names, states, bond topology) appears unchanged in the products.
    // This handles the common case where the parser does NOT populate changeStates.
    //
    // Example: gp130(s~P) + STAT3(s~U) → gp130(s~P) + STAT3(s~P)
    //   gp130(s~P) key matches a product pattern → carry-through catalyst
    //   STAT3(s~U) key does NOT match any product pattern → substrate
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
    // Also include carry-through detected via explicit changeStates ops (for parsers that do populate them).
    if (isPureStateChangeRule && rule.changeStates.length > 0) {
      const changedPatternSet = new Set<number>();
      let molOffset = 0;
      for (let k = 0; k < n; k++) {
        const patternMolCount = patterns[k].molecules.length;
        for (const [globalMolIdx] of rule.changeStates) {
          if (globalMolIdx >= molOffset && globalMolIdx < molOffset + patternMolCount) {
            changedPatternSet.add(k);
          }
        }
        molOffset += patternMolCount;
      }
      for (let k = 0; k < n; k++) {
        if (!changedPatternSet.has(k)) {
          carryThroughPatternIndices.add(k);
        }
      }
    }

    // Only apply carry-through anchor-skip optimization when:
    //   1. Some (but not all) patterns are carry-through — partial catalyst scenario
    //   2. Rule has equal count of reactant and product patterns (not synthesis/degradation)
    //   3. No repeated reactant patterns (identical-pattern rules handled separately)
    // When active, substrate anchors enumerate without symmetry-breaking to capture all
    // substrate embeddings; carry-through partner matches are restricted to 1 canonical pick.
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

    // Try matching currentSpecies against EVERY pattern position i
    for (let i = 0; i < n; i++) {
      // For carry-through rules (catalyst + substrate pattern), substrate anchors need
      // SB=false to enumerate ALL substrate embeddings. This enables sigMult to capture
      // the correct rate multiplier (e.g., STAT3(U).STAT3(U) has 2 s~U sites → sigMult=2 → rate=2k).
      // Carry-through (catalyst) anchors use the standard matchSymmetryBreaking flag.
      // The canonical anchor check (maxIdx guard below) prevents double-counting:
      // only the species with the highest index in the reaction set acts as anchor.
      const isSubstrateAnchor = applyCarryThroughAnchorSkip && !carryThroughPatternIndices.has(i);
      const anchorSB = isSubstrateAnchor ? false : matchSymmetryBreaking;

      let allMatches: MatchMap[];
      if (rule.isMatchOnce) {
        const firstMap = profiledFindFirstMap(patterns[i], currentSpecies.graph, { symmetryBreaking: anchorSB });
        if (firstMap && this.matchRespectsExplicitComponentBondCounts(patterns[i], currentSpecies.graph, firstMap) &&
            this.matchRespectsProductImpliedFreeConstraints(rule, patterns[i], currentSpecies.graph, firstMap)) {
          allMatches = [firstMap];
        } else {
          allMatches = profiledFindAllMaps(patterns[i], currentSpecies.graph, { symmetryBreaking: anchorSB }).filter((match) =>
            this.matchRespectsExplicitComponentBondCounts(patterns[i], currentSpecies.graph, match) &&
            this.matchRespectsProductImpliedFreeConstraints(rule, patterns[i], currentSpecies.graph, match)
          );
        }
      } else {
        allMatches = profiledFindAllMaps(patterns[i], currentSpecies.graph, { symmetryBreaking: anchorSB }).filter((match) =>
          this.matchRespectsExplicitComponentBondCounts(patterns[i], currentSpecies.graph, match) &&
          this.matchRespectsProductImpliedFreeConstraints(rule, patterns[i], currentSpecies.graph, match)
        );
      }
      // isMatchOnce and non-substrate carry-through anchors are restricted to 1 match.
      // Substrate anchors in carry-through rules (SB=false) use all matches for full embedding count.
      const matches = (rule.isMatchOnce || (!isSubstrateAnchor && carryThroughPatternIndices.has(i))) ? allMatches.slice(0, 1) : allMatches;
      if (matches.length === 0) continue;

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[applyNaryRule] Rule ${rule.name}: currentSpecies ${currentSpecies.index} matches pattern ${i}`);
      }

      const seenSignaturesForThisSpeciesSet = new Map<string, {
        indices: number[];
        matches: MatchMap[];
        multiplicity: number;
      }>();

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

          // Canonicalize assignments for identical reactant patterns (e.g., A + A) so
          // permutations of the same species tuple are counted once.
          for (const group of identicalPatternGroups.values()) {
            if (group.length < 2) continue;
            for (let gi = 1; gi < group.length; gi++) {
              const prev = currentIndices[group[gi - 1]];
              const next = currentIndices[group[gi]];
              if (prev > next) return;
            }
          }

          // Proceed with reaction generation
          const reactantSpeciesList = currentIndices.map(idx => allSpecies[idx]);

          // 1. Check Constraints
          for (let p1 = 0; p1 < n; p1++) {
            for (let p2 = p1 + 1; p2 < n; p2++) {
              if (!this.checkConstraints(rule, reactantSpeciesList[p1], reactantSpeciesList[p2])) return;
              if (!this.isInteractingSet(reactantSpeciesList[p1], reactantSpeciesList[p2])) return;
            }
          }

          // EVENT SIGNATURE DEDUPLICATION
          // If a species has internal symmetries, multiple match maps can represent
          // the same physical event. Deduplicate by mapped transformation signature,
          // but keep a count so multiplicity can be restored in rate factors.
          const signature = this.buildNaryEventSignature(rule, currentMatches, reactantSpeciesList);
          if (signature) {
            const bucket = seenSignaturesForThisSpeciesSet.get(signature);
            if (bucket) {
              bucket.multiplicity += 1;
              return;
            }
            seenSignaturesForThisSpeciesSet.set(signature, {
              indices: [...currentIndices],
              matches: [...currentMatches],
              multiplicity: 1,
            });
            return;
          }

          // Generate product graphs and aggregate reaction
          await this.generateNaryReaction(
            rule,
            reactantSpeciesList,
            currentIndices,
            currentMatches,
            1,
            allSpecies,
            speciesMap,
            speciesByFingerprint,
            speciesList,
            queue,
            reactionsList,
            reactionKeys,
            reactionIndexByKey,
            signal
          );
          return;
        }

        const nextPatternIdx = patternIndicesToMatch[0];
        const nextPattern = patterns[nextPatternIdx];
        const remainingPatterns = patternIndicesToMatch.slice(1);

        // Optimization: Inverted index lookup for molecule types required by nextPattern
        const requiredMols = nextPattern.molecules.map(m => m.name);
        let candidateSet: Set<number> | null = null;
        for (const molName of requiredMols) {
          const set = this.speciesByMoleculeIndex.get(molName);
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
          let allCandMaps: MatchMap[];
          if (rule.isMatchOnce || isCarryThroughPattern) {
            const firstCandMap = profiledFindFirstMap(nextPattern, candidateSpecies.graph, { symmetryBreaking: matchSymmetryBreaking });
            if (firstCandMap && this.matchRespectsExplicitComponentBondCounts(nextPattern, candidateSpecies.graph, firstCandMap) &&
                this.matchRespectsProductImpliedFreeConstraints(rule, nextPattern, candidateSpecies.graph, firstCandMap)) {
              allCandMaps = [firstCandMap];
            } else {
              allCandMaps = profiledFindAllMaps(nextPattern, candidateSpecies.graph, { symmetryBreaking: matchSymmetryBreaking }).filter((candMatch) =>
                this.matchRespectsExplicitComponentBondCounts(nextPattern, candidateSpecies.graph, candMatch) &&
                this.matchRespectsProductImpliedFreeConstraints(rule, nextPattern, candidateSpecies.graph, candMatch)
              );
              if (isCarryThroughPattern) allCandMaps = allCandMaps.slice(0, 1);
            }
          } else {
            allCandMaps = profiledFindAllMaps(nextPattern, candidateSpecies.graph, { symmetryBreaking: matchSymmetryBreaking }).filter((candMatch) =>
              this.matchRespectsExplicitComponentBondCounts(nextPattern, candidateSpecies.graph, candMatch) &&
              this.matchRespectsProductImpliedFreeConstraints(rule, nextPattern, candidateSpecies.graph, candMatch)
            );
          }
          const candMaps = (rule.isMatchOnce || isCarryThroughPattern) ? allCandMaps.slice(0, 1) : allCandMaps;

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

      // Materialize signature-deduplicated events, restoring collapsed multiplicity.
      for (const bucket of seenSignaturesForThisSpeciesSet.values()) {
        const reactantSpeciesList = bucket.indices.map((idx) => allSpecies[idx]);
        await this.generateNaryReaction(
          rule,
          reactantSpeciesList,
          bucket.indices,
          bucket.matches,
          bucket.multiplicity,
          allSpecies,
          speciesMap,
          speciesByFingerprint,
          speciesList,
          queue,
          reactionsList,
          reactionKeys,
          reactionIndexByKey,
          signal
        );
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
    signatureMultiplicity: number,
    allSpecies: Species[],
    speciesMap: Map<string, Species>,
    speciesByFingerprint: Map<string, Species[]>,
    speciesList: Species[],
    queue: SpeciesGraph[],
    reactionsList: Rxn[],
    reactionKeys: Set<string>,
    reactionIndexByKey: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {

    const patterns = rule.reactants;
    const n = patterns.length;

    // 2. Aggregate Matches / Multiplicity
    // Multiplicity = (Sum over all embeddings P1..Pn) / ruleSymmetryFactor
    // However, our outer loop visits each embedding combo.
    // We aggregate them by (reactantIndices, productIndices).

    // Calculate rule symmetry factor (e.g. 2 for A+A)
    const rulePatternCounts = new Map<string, number>();
    for (const p of patterns) {
      const s = getPatternSymmetryKey(p);
      rulePatternCounts.set(s, (rulePatternCounts.get(s) || 0) + 1);
    }
    let ruleSymmetryFactor = 1;
    for (const count of rulePatternCounts.values()) {
      ruleSymmetryFactor *= factorial(count);
    }
    const hasRepeatedReactantPatterns = Array.from(rulePatternCounts.values()).some((count) => count > 1);

    let totalDegeneracy = 1;
    for (let k = 0; k < n; k++) {
      totalDegeneracy *= countEmbeddingDegeneracy(patterns[k], reactantSpeciesList[k].graph, currentMatches[k]);
    }

    // Account for signature-collapsed duplicate SB matches: bucket.multiplicity
    // represents how many SB match-tuples were deduplicated into this signature.
    // For most cases we must multiply totalDegeneracy by signatureMultiplicity to
    // recover the true raw-embedding count. However, for N-ary rules with
    // repeated reactant patterns (e.g. ternary rules with A + A + B), the
    // signature multiplicity is already reflected in the cross-product of
    // per-pattern embeddings and in tuple-aware combinatorics below; multiplying
    // here causes double-counting. Skip multiplicative application in that
    // scenario and let tuple-aware corrections handle multiplicity.
    const skipSignatureMultForRepeatedPatterns = (n > 2 && Array.from(rulePatternCounts.values()).some(c => c > 1));
    // For bond-topology rules with wildcard-bound patterns, signatureMultiplicity is already
    // handled by the bondTopoFullMapCount fix. Multiplying it here causes 2x overcounting.
    const _earlyHasWilcardBound = patterns.some((pat) =>
      pat.molecules.some((mol) => mol.components.some((comp) => comp.wildcard === '+'))
    );
    const _earlyHasBondTopoOps =
      rule.addBonds.length > 0 ||
      rule.deleteBonds.length > 0 ||
      rule.changeStates.length > 0 ||
      rule.deleteMolecules.length > 0;
    const skipSignatureMultForBondTopo = _earlyHasBondTopoOps && _earlyHasWilcardBound;
    if (!skipSignatureMultForRepeatedPatterns && !skipSignatureMultForBondTopo) {
      totalDegeneracy *= signatureMultiplicity;
    } else {
      // preserve signatureMultiplicity for later consideration via Math.max() guards
      // (do not include it in totalDegeneracy product to avoid overcounting)
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

    // For pure state-change rules, symmetry-broken matching is disabled (matchSymmetryBreaking=false),
    // so distinct equivalent events are enumerated as separate buckets in seenSignaturesForThisSpeciesSet,
    // each with signatureMultiplicity=1. Each bucket represents exactly one physical event and should
    // contribute multiplicity=1 (not the total full-map count across all events).
    // Using all full maps here would over-count: N buckets × N full-maps/bucket = N² instead of N.
    // Use signatureMultiplicity (the collapsed count for THIS bucket) instead.
    let stateChangeEmbeddingDegeneracy = totalDegeneracy;
    if (hasPureStateChangeOps) {
      stateChangeEmbeddingDegeneracy = signatureMultiplicity;
    }
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
      // The signature-dedup mechanism already handles signatureMultiplicity>1 cases.
      // Scale the SB baseline by signatureMultiplicity to account for deduplicated matches.
      const effectiveSBCount = bondTopoSBMapCount * signatureMultiplicity;
      if (bondTopoFullMapCount > effectiveSBCount * totalDegeneracy) {
        multiplicity = Math.max(multiplicity, bondTopoFullMapCount / (effectiveSBCount * ruleSymmetryFactor));
      }
    }

    const shouldSkipBondTopologySignatureMultiplicity =
      n > 2 &&
      hasRepeatedReactantPatterns;

    if (
      !rule.isMatchOnce &&
      hasBondTopologyOps &&
      signatureMultiplicity > 1 &&
      !shouldSkipBondTopologySignatureMultiplicity
    ) {
      multiplicity = Math.max(multiplicity, signatureMultiplicity);
    }

    if (!rule.isMatchOnce && !hasBondTopologyOps && signatureMultiplicity > 1) {
      // For non-topology rules where the fallback signature (ops arrays all empty) collapsed
      // N equivalent N-ary event-tuples into one bucket, signatureMultiplicity directly
      // encodes the total number of physically distinct events that produce the same product.
      // Example: G(s~P) + S(s~U) → G(s~P) + S(s~P) with S(b!1,s~U).S(b!1,s~U):
      //   both S monomers give the same fallback signature (molecule index dropped) →
      //   signatureMultiplicity=2 → multiplicity=2 → rate=2*k. ✓
      //
      // For the full-parser / topology-signature path, this block is not entered because
      // hasPureStateChangeOps=true → distinct topology signatures per monomer → sigMult=1 per
      // bucket → two separate buckets merge via rate += to give the correct total.
      multiplicity = Math.max(multiplicity, signatureMultiplicity / ruleSymmetryFactor);
    }

    const collapsedRuleStatFactor = this.computeCollapsedRuleStatFactor(rule);
    if (
      hasBondTopologyOps &&
      multiplicity === 1 &&
      collapsedRuleStatFactor > 1 &&
      rulePatternCounts.size > 1
    ) {
      multiplicity = collapsedRuleStatFactor;
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

      // For correctness with embedding degeneracy we must convert the naive
      // per-pattern product-of-embeddings into the proper combinatorial count
      // of unordered assignments for identical patterns mapped across species.
      // Let e_j = embedding count for species j, and c_j the number of
      // identical patterns mapped to that species.  The correct contribution
      // is product_j C(e_j, c_j).  The current `multiplicity` was initialized
      // earlier to (product_j e_j^{c_j}) / factorial(group.length).  We apply
      // a corrective multiplier so the net group contribution becomes
      // product_j C(e_j, c_j).
      // Compute per-species embedding counts (emb_j) for this identical-pattern
      // group.  If every emb_j == 1 (no component-level degeneracy), apply the
      // classic tuple-aware correction factorial(group.length)/denom to undo the
      // ruleSymmetryFactor division; otherwise *do not* apply the general
      // correction (BNG2 semantics for embedding-degenerate cases match the
      // baseline multiplicity = totalDegeneracy / ruleSymmetryFactor).
      const embCounts: number[] = [];
      for (const [speciesIdx, count] of speciesCountInGroup.entries()) {
        const repPatternIdx = group.find((pIdx) => currentSpeciesIndices[pIdx] === speciesIdx)!;
        const emb = Math.max(1, countEmbeddingDegeneracy(patterns[repPatternIdx], reactantSpeciesList[repPatternIdx].graph, currentMatches[repPatternIdx]));
        embCounts.push(emb);
      }

      // Historical/BNG2 semantics:
      // - If there is NO component-level embedding degeneracy for this identical
      //   pattern group (all emb_j == 1), restore the classic tuple-aware
      //   correction factorial(group.length)/prod_j factorial(c_j).
      // - Otherwise (some emb_j > 1), *do not* apply the tuple-aware collapse and
      //   leave multiplicity as initialized (totalDegeneracy / ruleSymmetryFactor).
      const allEmbeddingsAreOne = embCounts.every((v) => v === 1);
      if (allEmbeddingsAreOne) {
        const correction = factorial(group.length) / Array.from(speciesCountInGroup.values()).reduce((s, c) => s * factorial(c), 1);
        multiplicity *= correction;
        if (correction !== 1) tupleAwareCorrectionApplied = true;
      }

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
      } catch (err) {
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

    if (
      hasConcreteBondChange &&
      hasWildcardBoundPattern &&
      collapsedRuleStatFactor > 1 &&
      rulePatternCounts.size > 1
    ) {
      const concreteMultiplicity = totalDegeneracy / ruleSymmetryFactor;
      if (concreteMultiplicity > multiplicity) {
        multiplicity = concreteMultiplicity;
      }
    }

    if (rule.isMatchOnce) {
      multiplicity = 1;
    }

    // 4. Resolve Product Species
    const productSpeciesList = products.map(p => this.addOrGetSpecies(p, speciesMap, speciesByFingerprint, speciesList, queue, signal));
    if (!this.checkProductConstraints(rule, productSpeciesList)) {
      return;
    }
    const productIndices = productSpeciesList.map((species) => species.index);
    const hasCarryThroughReactant = currentSpeciesIndices.some((reactantIdx) => productIndices.includes(reactantIdx));

    // 5. Volume Scaling
    const { scalingVolume } = this.getVolumeScalingInfo(reactantSpeciesList, productIndices.map(idx => allSpecies[idx]));

    const hasRateExpression = !!rule.rateExpression;
    const baseRateConstant = (rule as any).isFunctionalRate && rule.rateConstant === 0 ? 1 : rule.rateConstant;

    let effectiveRate = baseRateConstant * multiplicity;

    // Arrhenius rate law calculation for N-ary rule
    if (rule.isArrhenius && this.energyService) {
      const deltaG = this.energyService.calculateDeltaG(reactantSpeciesList.map(s => s.graph), products);

      const phi = this.evaluateArrheniusParam(rule.arrheniusPhi, 0.5);
      const Eact = this.evaluateArrheniusParam(rule.arrheniusEact);
      const A = this.evaluateArrheniusParam(rule.arrheniusA, rule.rateConstant === 0 ? 1 : rule.rateConstant);

      // BNG2 parity: k = A * exp(-(Eact + phi * deltaG))
      // deltaG is already dimensionless (in units of RT) from EnergyService.
      // Do NOT divide by RT — verified against BNG2-generated catalysis.net.
      effectiveRate = A * Math.exp(-(Eact + phi * deltaG)) * multiplicity;

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

    // BIO-NETGEN PARITY: Pattern Automorphism Correction
    // BNG2 divides the rate by the number of automorphisms of the reactant pattern itself.
    // This corrects for overcounting when the pattern is symmetric (see auto_activation_loop).
    let patternAutomorphismFactor = 1;
    for (const pattern of patterns) {
      try {
        const autos = GraphMatcher.findAllMaps(pattern, pattern);
        patternAutomorphismFactor *= (autos.length || 1);
      } catch (err) {
        console.warn(`[NetworkGenerator] Failed to compute automorphisms for pattern ${pattern.toString()}`, err);
      }
    }

    // For Arrhenius rules: clear rateExpression so NET file writes numeric rate,
    // not the un-evaluatable "Arrhenius(phi, Eact)" string.
    let finalRateExpr = (rule as any).isArrhenius ? undefined : rule.rateExpression;
    let exprScaleFactor = multiplicity;

    const allIdenticalReactants =
      currentSpeciesIndices.length > 1 &&
      currentSpeciesIndices.every((idx) => idx === currentSpeciesIndices[0]);
    const shouldSkipAutomorphismDivision = allIdenticalReactants && multiplicity <= 1;

    if (patternAutomorphismFactor > 1 && !useEmbeddingDegeneracy && !rule.isMatchOnce && !shouldSkipAutomorphismDivision) {
      effectiveRate /= patternAutomorphismFactor;
      if (hasRateExpression) {
        exprScaleFactor /= patternAutomorphismFactor;
      }
    }

    if (hasRateExpression && finalRateExpr) {
      finalRateExpr = finalRateExpr.trim();
    }

    // Always log for this model during investigation
    // if (rule.name.includes("_R")) {
    //   console.log(`[DEBUG_RULES] Rule: ${rule.name}, rate: ${effectiveRate}, auto: ${patternAutomorphismFactor}, sym: ${ruleSymmetryFactor}`);
    // }

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
    // Fix: split the ruleSymmetryFactor (1/2) into a separate propensityFactor field so that:
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
        degeneracy: 1, // Fix: Multiplicity is already in storedRate. ODE loop applies degeneracy again, so set to 1.
        propensityFactor: storedPropensityFactor,
        statFactor: storedExprScaleFactor,
        rateExpression: finalRateExpr,
        scalingVolume: scalingVolume,
        totalRate: rule.totalRate
      }
    );
    if (isIdentityReactionBySpeciesIndices(rxn.reactants, rxn.products)) {
      return;
    }

    const preserveOrderInKey = hasRateExpression;
    const rxnKey = getReactionKeyWithOrderMode(
      rxn.reactants,
      rxn.products,
      rule.name,
      preserveOrderInKey
    );
    const existingIdx = reactionIndexByKey.get(rxnKey);

    if (existingIdx === undefined) {
      reactionKeys.add(rxnKey);
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
  private applyRuleTransformation(
    rule: RxnRule,
    reactantPatterns: SpeciesGraph[],
    reactantGraphs: SpeciesGraph[],
    matches: MatchMap[]
  ): SpeciesGraph[] | null {
    if (shouldLogNetworkGenerator) {
      debugNetworkLog(
        `[applyTransformation] Rule ${rule.name}, ${reactantGraphs.length} reactants -> ${rule.products.length} products`
      );
    }

    const productGraphs: SpeciesGraph[] = [];
    const usedReactantMolsInReaction = new Set<string>(); // Tracks reactant graph molecules surviving in products
    const usedReactantPatternMols = new Set<string>(); // Tracks reactant pattern molecules (for mapping correctness)
    const survivorLocations = new Map<string, { graphIdx: number; molIdx: number }>(); // FIX: Track where survivors ended up

    // 0. Identify which molecules were explicitly matched by the rule (Targeted for transformation/deletion)
    const matchedReactantKeys = new Set<string>();
    for (let i = 0; i < matches.length; i++) {
      const map = matches[i];
      for (const [patMolIdx, tgtMolIdx] of map.moleculeMap.entries()) {
        matchedReactantKeys.add(`${i}:${tgtMolIdx}`);
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
        !!(rule as any).isMoveConnected
      );

      if (!fullProductGraph) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog('[applyTransformation] Failed to construct product graph; treating as no-op');
        }
        return null;
      }

      // BIO-NETGEN PARITY: Split the product graph into connected components.
      // Often a single product pattern like A.B produces one connected component,
      // but if bonds are broken explicitly or implicitly, it might split.
      const explicitUnboundBySource = new Map<string, Set<number>>();
      const explicitBondedBySource = new Map<string, Set<number>>();
      for (const mol of fullProductGraph.molecules as Array<Molecule & { _sourceKey?: string; _explicitUnboundComponents?: Set<number>; _explicitBondedComponents?: Set<number> }>) {
        if (!mol._sourceKey) continue;
        if (mol._explicitUnboundComponents && mol._explicitUnboundComponents.size > 0) {
          explicitUnboundBySource.set(mol._sourceKey, new Set(mol._explicitUnboundComponents));
        }
        if (mol._explicitBondedComponents && mol._explicitBondedComponents.size > 0) {
          explicitBondedBySource.set(mol._sourceKey, new Set(mol._explicitBondedComponents));
        }
      }

      const splitProducts = fullProductGraph.split(); // Use fullProductGraph.split()

      for (const subgraph of splitProducts as Array<SpeciesGraph>) {
        for (const mol of subgraph.molecules as Array<Molecule & { _sourceKey?: string; _explicitUnboundComponents?: Set<number>; _explicitBondedComponents?: Set<number> }>) {
          if (!mol._sourceKey) continue;
          const explicitUnbound = explicitUnboundBySource.get(mol._sourceKey);
          if (explicitUnbound && explicitUnbound.size > 0) {
            mol._explicitUnboundComponents = new Set(explicitUnbound);
          }
          const explicitBonded = explicitBondedBySource.get(mol._sourceKey);
          if (explicitBonded && explicitBonded.size > 0) {
            mol._explicitBondedComponents = new Set(explicitBonded);
          }
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
          subgraph.molecules.some((mol) => mol._sourceKey && matchedReactantKeys.has(mol._sourceKey))
        );
        const productPatternMolNames = new Set(productPattern.molecules.map((mol) => mol.name));
        const anchoredMatchingPattern = anchored.filter((subgraph) =>
          subgraph.molecules.some((mol) => productPatternMolNames.has(mol.name))
        );

        if (anchored.length === 1) {
          productsToKeep = anchored;
        } else if (anchoredMatchingPattern.length === 1) {
          // If multiple anchored components exist, keep the one matching the molecule
          // identity of the current product pattern and let other product patterns
          // account for the remaining anchored fragments.
          productsToKeep = anchoredMatchingPattern;
        } else {
          if (shouldLogNetworkGenerator) {
            debugNetworkLog(`[applyTransformation] Rule ${rule.name} REJECTED: Product pattern yielded ${splitProducts.length} disconnected anchored components.`);
          }
          return null;
        }
      }

      for (const subgraph of productsToKeep) {
        const sourceKeys = new Set<string>();
        for (const mol of subgraph.molecules) {
          if (mol._sourceKey) {
            sourceKeys.add(mol._sourceKey);
          }
        }

        // DEDUPLICATION
        let isAlreadyIncluded = false;
        if (sourceKeys.size > 0) {
          for (const key of sourceKeys) {
            if (usedReactantMolsInReaction.has(key)) {
              isAlreadyIncluded = true;
              break;
            }
          }
        }

        if (!isAlreadyIncluded) {
          productGraphs.push(subgraph);
          const graphIdx = productGraphs.length - 1;

          // FIX: Track survivor locations
          for (let i = 0; i < subgraph.molecules.length; i++) {
            const mol = subgraph.molecules[i];
            if (mol._sourceKey) {
              usedReactantMolsInReaction.add(mol._sourceKey);
              survivorLocations.set(mol._sourceKey, { graphIdx, molIdx: i });
            }
          }
        } else if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[applyTransformation] Skipping duplicate product fragment containing molecules: ${Array.from(sourceKeys).join(', ')}`);
        }
      }
    }

    // FIX: Pre-calculate component state changes for MoveConnected rules
    // This allows us to propagate state changes (like 'loc') to bystanders in the connected component.
    const survivorDeltas = new Map<string, { comp: string, state: string }[]>();
    if ((rule as any).isMoveConnected) {
      for (const [sourceKey, loc] of survivorLocations.entries()) {
        const [rIdxStr, mIdxStr] = sourceKey.split(':');
        const rIdx = Number(rIdxStr);
        const mIdx = Number(mIdxStr);
        const oldMol = reactantGraphs[rIdx].molecules[mIdx];
        const newMol = productGraphs[loc.graphIdx].molecules[loc.molIdx];

        const changes: { comp: string, state: string }[] = [];
        for (const oldC of oldMol.components) {
          const newC = newMol.components.find(c => c.name === oldC.name);
          if (newC && newC.state !== undefined && newC.state !== oldC.state) {
            changes.push({ comp: oldC.name, state: newC.state });
          }
        }
        if (changes.length > 0) {
          survivorDeltas.set(sourceKey, changes);
          if (shouldLogNetworkGenerator) {
            debugNetworkLog(`[applyTransformation] Recorded MoveConnected delta for ${sourceKey}: ${JSON.stringify(changes)}`);
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
        if (!usedReactantMolsInReaction.has(`${r}:${targetMolIdx}`)) {
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
        const key = `${r}:${m}`;
        if (usedReactantMolsInReaction.has(key) || visitedInOrphanCheck.has(m)) continue;

        // Found unvisited orphan seed. Traverse its connected component in the Reactant Graph.
        const clusterIndices = new Set<number>();
        const queue = [m];
        visitedInOrphanCheck.add(m);
        clusterIndices.add(m);

        let anchorGraphIdx = -1; // -1 means no anchor found yet
        let isAnchoredToSurvivor = false;
        let touchesMatchedBoundary = false;
        const anchors = new Map<string, { graphIdx: number, molIdx: number }>();

        let head = 0;
        while (head < queue.length) {
          const currM = queue[head++];

          // Check neighbors
          const mol = rg.molecules[currM];
          for (let c = 0; c < mol.components.length; c++) {
            const adjKey = `${currM}.${c}`;
            const neighbors = rg.adjacency.get(adjKey);
            if (neighbors) {
              for (const neighbor of neighbors) {
                const [nMStr] = neighbor.split('.');
                const nM = Number(nMStr);
                const nKey = `${r}:${nM}`;

                if (usedReactantMolsInReaction.has(nKey)) {
                  // Connected to a survivor!
                  isAnchoredToSurvivor = true;
                  const loc = survivorLocations.get(nKey);
                  if (loc) {
                    anchors.set(nKey, loc);
                    if (anchorGraphIdx === -1) {
                      anchorGraphIdx = loc.graphIdx;
                    }
                  }
                } else if (matchedReactantKeys.has(nKey)) {
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
            if (!matchedReactantKeys.has(`${r}:${idx}`)) {
              survivingInCluster.add(idx);
            }
          }

          // Keep only orphan molecules that can still reconnect to a bound anchor site.
          // If a transformation explicitly unbound an anchor component, connected bystanders
          // should not be resurrected as detached products for this anchored merge path.
          const reconnectable = new Set<number>();
          for (const oldIdx of survivingInCluster) {
            const oldMol = rg.molecules[oldIdx];
            for (let c = 0; c < oldMol.components.length; c++) {
              const neighbors = rg.adjacency.get(`${oldIdx}.${c}`);
              if (!neighbors) continue;
              for (const neighbor of neighbors) {
                const [nMStr, nCStr] = neighbor.split('.');
                const nM = Number(nMStr);
                const nC = Number(nCStr);
                const nKey = `${r}:${nM}`;
                const anchorLoc = anchors.get(nKey);
                if (!anchorLoc || anchorLoc.graphIdx !== anchorGraphIdx) continue;

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
                if (anchorComp.edges.size !== 0) continue;

                reconnectable.add(oldIdx);
              }
            }
          }

          for (const oldIdx of Array.from(survivingInCluster)) {
            if (!reconnectable.has(oldIdx)) {
              survivingInCluster.delete(oldIdx);
            }
          }

          if (survivingInCluster.size === 0) {
            for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add(`${r}:${oldIdx}`);
            continue;
          }

          // Clone only survivors and append to target graph
          for (const oldIdx of survivingInCluster) {
            const oldMol = rg.molecules[oldIdx];
            const newMol = this.cloneMoleculeStructure(oldMol);

            // FIX: Apply MoveConnected deltas to bystanders
            if ((rule as any).isMoveConnected && anchors.size > 0) {
              // Use the first available anchor to determine the delta
              const anchorKey = anchors.keys().next().value;
              if (anchorKey) {
                const deltas = survivorDeltas.get(anchorKey);
                if (deltas) {
                  for (const delta of deltas) {
                    const compToUpdate = newMol.components.find(c => c.name === delta.comp);
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
                  const [nMStr, nCStr] = neighbor.split('.');
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
                  const [nMStr, nCStr] = neighbor.split('.');
                  const nM = Number(nMStr);
                  const nC = Number(nCStr);
                  const nKey = `${r}:${nM}`;
                  const anchorLoc = anchors.get(nKey);
                  if (anchorLoc && anchorLoc.graphIdx === anchorGraphIdx) {
                    const bondLabel = oldMol.components[c].edges.keys().next().value;
                    const anchorMol = targetGraph.molecules[anchorLoc.molIdx];
                    const anchorComp = anchorMol?.components?.[nC];
                    const anchorIsFree = !!anchorComp && anchorComp.edges.size === 0;
                    const explicitUnbound = (anchorMol as any)?._explicitUnboundComponents as Set<number> | undefined;
                    const explicitBonded = (anchorMol as any)?._explicitBondedComponents as Set<number> | undefined;
                    if (explicitUnbound && explicitUnbound.has(nC)) {
                      continue;
                    }
                    if (explicitBonded && explicitBonded.has(nC)) {
                      continue;
                    }
                    if (!anchorIsFree) {
                      // Anchor component is already occupied in retained product; do not
                      // resurrect historical orphan bonds and create multi-bond artifacts.
                      continue;
                    }
                    targetGraph.addBond(newIdx, c, anchorLoc.molIdx, nC, bondLabel);
                  }
                }
              }
            }
          }

          for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add(`${r}:${oldIdx}`);

        } else {
          // PARTIAL PRESERVATION: The cluster is not anchored to a survivor.

          if (touchesMatchedBoundary && deletesWholeSpeciesByReactant[r]) {
            // BNG2 whole-species deletion mode: if all matched molecules in this reactant
            // pattern were deleted and DeleteMolecules is not set, bystanders connected
            // through that boundary are deleted too.
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[applyTransformation] Whole-species deletion: Dropping orphan cluster from reactant ${r} (Rule ${rule.name})`);
            }
            for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add(`${r}:${oldIdx}`);
            continue;
          }

          // It may contain a mix of DELETED molecules (matched) and BYSTANDERS (not matched).
          // We must harvest the BYSTANDERS as new products and discard the DELETED ones.

          const survivingOrphans = new Set<number>();
          for (const idx of clusterIndices) {
            if (!matchedReactantKeys.has(`${r}:${idx}`)) {
              survivingOrphans.add(idx);
            }
          }

          if (survivingOrphans.size > 0) {
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[applyTransformation] Preserving bystanders from orphan cluster: reactant ${r}, mols [${Array.from(survivingOrphans).join(',')}] (Original cluster size: ${clusterIndices.size})`);
            }

            // Create new SpeciesGraph for the surviving bystanders
            const newGraph = new SpeciesGraph();
            newGraph.compartment = rg.compartment;

            const oldToNewIdx = new Map<number, number>();

            // 1. Clone only survivors
            for (const oldIdx of survivingOrphans) {
              const oldMol = rg.molecules[oldIdx];
              const newMol = this.cloneMoleculeStructure(oldMol);
              newMol._sourceKey = `${r}:${oldIdx}`;
              if (!newMol.compartment && rg.compartment) newMol.compartment = rg.compartment;

              const newIdx = newGraph.molecules.length;
              newGraph.molecules.push(newMol);
              oldToNewIdx.set(oldIdx, newIdx);
            }

            // 2. Reconstruct adjacency among survivors
            for (const oldIdx of survivingOrphans) {
              const oldMol = rg.molecules[oldIdx];
              const newIdx = oldToNewIdx.get(oldIdx)!;

              for (let c = 0; c < oldMol.components.length; c++) {
                const neighbors = rg.adjacency.get(`${oldIdx}.${c}`);
                if (neighbors) {
                  for (const neighbor of neighbors) {
                    const [nMStr, nCStr] = neighbor.split('.');
                    const nM = Number(nMStr);
                    const nC = Number(nCStr);

                    // Only add bond if neighbor is ALSO a survivor
                    if (survivingOrphans.has(nM)) {
                      const newN = oldToNewIdx.get(nM)!;
                      const keyA = `${newIdx}.${c}`;
                      const valA = `${newN}.${nC}`;
                      if (!newGraph.adjacency.has(keyA)) newGraph.adjacency.set(keyA, []);
                      if (!newGraph.adjacency.get(keyA)!.includes(valA)) newGraph.adjacency.get(keyA)!.push(valA);
                    }
                  }
                }
              }
            }

            // Split potential disconnected components if the deleted molecule bridged them
            const splitOrphans = newGraph.split();
            for (const sub of splitOrphans) {
              productGraphs.push(sub);
            }

            // Track used (even if effectively deleted, we handled them)
            for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add(`${r}:${oldIdx}`);

          } else {
            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[applyTransformation] Discarding fully deleted orphan cluster: [${Array.from(clusterIndices).join(',')}]`);
            }
            // Mark all as used/handled
            for (const oldIdx of clusterIndices) usedReactantMolsInReaction.add(`${r}:${oldIdx}`);
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
        const sourceToGraphIndex = new Map<string, number>();
        for (let idx = 0; idx < graph.molecules.length; idx++) {
          const sourceKey = graph.molecules[idx]._sourceKey;
          if (sourceKey) sourceToGraphIndex.set(sourceKey, idx);
        }

        for (let anchorIdx = 0; anchorIdx < graph.molecules.length; anchorIdx++) {
          const anchorMol = graph.molecules[anchorIdx];
          if (!anchorMol._sourceKey) continue;

          const [rStr, mStr] = anchorMol._sourceKey.split(':');
          const reactantIdx = Number(rStr);
          const reactantMolIdx = Number(mStr);
          if (!Number.isFinite(reactantIdx) || !Number.isFinite(reactantMolIdx)) continue;
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
              const mappedKey = `${reactantIdx}:${mappedReactantMolIdx}`;
              const mappedGraphIdx = sourceToGraphIndex.get(mappedKey);
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
    usedReactantPatternMols: Set<string>, // NEW: Shared tracking across product patterns
    isMoveConnectedRule: boolean
  ): SpeciesGraph | null {
    if (shouldLogNetworkGenerator) {
      debugNetworkLog(`[buildProductGraph] Building from pattern ${pattern.toString()}`);
      debugNetworkLog(`[buildProductGraph] Reactant patterns: ${reactantPatterns.map(p => p.toString()).join(' | ')}`);
      debugNetworkLog(`[buildProductGraph] Prior used reactant mols: ${Array.from(usedReactantPatternMols).join(', ')}`);
    }

    const productGraph = new SpeciesGraph();

    // FIX: Function check priority for compartment:
    // 1. Explicit in product pattern (@cell:P)
    // 2. Inherited from first reactant (if any)
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
          const compInfo = this.options.compartments?.find(c => c.name === comp);
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
    const reactantToProductMol = new Map<string, number>();
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
      isBound: boolean  // NEW: track if this molecule is bonded within its pattern
    }> = [];

    for (let r = 0; r < reactantPatterns.length; r++) {
      const match = matches[r];
      if (!match) continue;

      const reactantPattern = reactantPatterns[r];
      for (let patternMolIdx = 0; patternMolIdx < reactantPattern.molecules.length; patternMolIdx++) {
        const targetMolIdx = match.moleculeMap.get(patternMolIdx);
        if (targetMolIdx !== undefined) {
          // Check if this molecule is bonded to other molecules in the pattern
          const patternMol = reactantPattern.molecules[patternMolIdx];
          let isBound = false;
          for (const comp of patternMol.components) {
            // Check for explicit bonds (!1, !2 etc) or wildcards (!+)
            if (comp.edges.size > 0 || comp.wildcard === '+') {
              isBound = true;
              break;
            }
          }

          allReactantPatternMols.push({
            reactantIdx: r,
            patternMolIdx,
            name: reactantPattern.molecules[patternMolIdx].name,
            targetMolIdx,
            isBound
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
      pMol: any,
      rpm: { reactantIdx: number; patternMolIdx: number; name: string; targetMolIdx: number; isBound: boolean },
      pMolIsBound: boolean
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
      const rpCompByName = new Map<string, any>();
      for (const c of rpMol.components) rpCompByName.set(c.name, c);
      const targetCompByName = new Map<string, any>();
      for (const c of targetMol.components) targetCompByName.set(c.name, c);

      // Reward overlap of *specified* component names between the two pattern molecules.
      // This is important because BNGL patterns often omit components as wildcards, and
      // different molecules in the same rule may specify different components.
      const rpCompNames = new Set<string>(rpMol.components.map((c: any) => c.name));
      const pCompNames = new Set<string>(pMol.components.map((c: any) => c.name));
      let sharedCompNames = 0;
      for (const name of pCompNames) {
        if (rpCompNames.has(name)) sharedCompNames++;
      }
      if (!sameName) {
        if (rpCompNames.size !== pCompNames.size) return -Infinity;
        for (const name of pCompNames) {
          if (!rpCompNames.has(name)) return -Infinity;
        }
      }
      score += sharedCompNames * 25;

      // Reward overlap of the *bonded sites* (component names that carry an explicit bond
      // or a !+ wildcard) to disambiguate cases like R(Y1~P!2) vs R(Y2~P!1).
      const rpBondSites = new Set<string>();
      for (const c of rpMol.components) {
        if (c.wildcard === '+' || c.edges?.size > 0) rpBondSites.add(c.name);
      }
      const pBondSites = new Set<string>();
      for (const c of pMol.components) {
        if (c.wildcard === '+' || c.edges?.size > 0) pBondSites.add(c.name);
      }
      let sharedBondSites = 0;
      for (const name of pBondSites) {
        if (rpBondSites.has(name)) sharedBondSites++;
      }
      score += sharedBondSites * 50;

      for (const pc of pMol.components) {
        if (!pc.wildcard && pc.edges.size > 0) {
          const tc = targetCompByName.get(pc.name);
          if (tc) {
            const rcForBondCheck = rpCompByName.get(pc.name);

            // If the reactant pattern does not mention this component (or mentions it
            // as explicitly unbound), product bond creation should originate from a free
            // target site rather than preserving hidden pre-existing bonds.
            const mustStartUnbound =
              !rcForBondCheck ||
              (!rcForBondCheck.wildcard && rcForBondCheck.edges.size === 0);
            const repeatedSiteName =
              pMol.components.filter((c: any) => c.name === pc.name).length > 1 ||
              rpMol.components.filter((c: any) => c.name === pc.name).length > 1 ||
              targetMol.components.filter((c: any) => c.name === pc.name).length > 1;
            if (mustStartUnbound && tc.edges.size !== 0 && !repeatedSiteName) {
              return -Infinity;
            }
          }
        }

        const rc = rpCompByName.get(pc.name);
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
        const pLabels = new Set<number>();
        for (const [lbl] of pc.edges) {
          if (typeof lbl === 'number') pLabels.add(lbl);
        }
        if (pLabels.size > 0) {
          let shared = 0;
          for (const [lbl] of rc.edges) {
            if (typeof lbl === 'number' && pLabels.has(lbl)) shared++;
          }
          score += shared * 250;
        }
      }

      return score;
    };

    for (let pMolIdx = 0; pMolIdx < pattern.molecules.length; pMolIdx++) {
      const pMol = pattern.molecules[pMolIdx];

      // Determine if product molecule is bound within the product pattern
      let pMolIsBound = false;
      for (const comp of pMol.components) {
        if (comp.edges.size > 0 || comp.wildcard === '+') {
          pMolIsBound = true;
          break;
        }
      }

      // Try to find the best matching reactant molecule
      let bestMatchIdx = -1;
      let bestScore = -Infinity;

      const availableIndices: number[] = [];
      const availableSameNameIndices: number[] = [];
      for (let i = 0; i < allReactantPatternMols.length; i++) {
        const rpmKey = `${allReactantPatternMols[i].reactantIdx}:${allReactantPatternMols[i].patternMolIdx}`;
        if (usedReactantPatternMols.has(rpmKey)) continue;
        availableIndices.push(i);
        if (allReactantPatternMols[i].name === pMol.name) {
          availableSameNameIndices.push(i);
        }
      }

      // Prefer same-name mappings whenever available; only allow cross-name
      // mappings when no same-name reactant pattern molecule exists.
      const candidateIndices =
        availableSameNameIndices.length > 0 ? availableSameNameIndices : availableIndices;

      for (const i of candidateIndices) {
        const rpm = allReactantPatternMols[i];
        const score = scorePatternMolMatch(pMol, rpm, pMolIsBound);

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
        const rpmKey = `${rpm.reactantIdx}:${rpm.patternMolIdx}`;
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
    const includedMols = new Set<string>(); // "reactantIdx:molIdx"

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

      const findComponentByNameOccurrence = (components: any[], name: string, occurrence: number): any | undefined => {
        let seen = 0;
        for (const comp of components) {
          if (comp.name !== name) continue;
          if (seen === occurrence) return comp;
          seen++;
        }
        return undefined;
      };

      const findComponentIndexByNameOccurrence = (components: any[], name: string, occurrence: number): number => {
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
            // For repeated same-name components, occurrence-based matching can be ambiguous.
            // Re-check all same-name product components before concluding this bond is broken.
            const sameNamePpComps = pMol.components.filter((comp) => comp.name === rpComp.name);
            for (const ppComp of sameNamePpComps) {
              if (ppComp.wildcard === '+' || ppComp.wildcard === '?') {
                bondPreserved = true;
                break;
              }
              for (const [ppBondLabel] of ppComp.edges) {
                if (ppBondLabel === bondLabel) {
                  bondPreserved = true;
                  break;
                }
              }
              if (bondPreserved) break;
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
      includedMols.add(`${mapping.reactantIdx}:${startMolIdx}`);

      // Traverse connected component, but skip broken bonds
      const visited = new Set<number>([startMolIdx]);
      const queue = [startMolIdx];

      while (queue.length > 0) {
        const molIdx = queue.shift()!;

        // Find all molecules bonded to this one
        const currentMol = reactantGraph.molecules[molIdx];
        if (currentMol) {
          for (let cIdx = 0; cIdx < currentMol.components.length; cIdx++) {
            const key = `${molIdx}.${cIdx}`;
            const [molStr, compStr] = [String(molIdx), String(cIdx)];
            // const keyMolIdx = molIdx;

            const partnerKeys = reactantGraph.adjacency.get(key);
            if (!partnerKeys) continue;

            for (const partnerKey of partnerKeys) {
              const [partnerMolStr] = partnerKey.split('.');
              const partnerMolIdx = Number(partnerMolStr);

              if (!visited.has(partnerMolIdx)) {
                // Check if this specific bond is broken
                const endpointA = `${mapping.reactantIdx}:${molStr}.${compStr}`;
                const endpointB = `${mapping.reactantIdx}:${partnerKey}`;
                const bondKey = endpointPairKey(endpointA, endpointB);
                if (brokenBondPairs.has(bondKey)) {
                  // Skip this bond - it's being broken by the rule
                  // Optimized: don't log inside tight loop unless debugging
                  // if (shouldLogNetworkGenerator) {
                  //   debugNetworkLog(`[buildProductGraph] Skipping broken bond at ${bondKey}`);
                  // }
                  continue;
                }

                visited.add(partnerMolIdx);
                includedMols.add(`${mapping.reactantIdx}:${partnerMolIdx}`);
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
        const [, reactantCompStr] = reactantGraphCompKey.split('.');
        const reactantCompIdx = Number(reactantCompStr);

        // Find what this component is bonded to (support multi-site bonding)
        const bondTargets = reactantGraph.adjacency.get(`${mapping.targetMolIdx}.${reactantCompIdx}`);
        if (bondTargets && bondTargets.length > 0) {
          for (const bondTarget of bondTargets) {
            const [partnerMolStr] = bondTarget.split('.');
            const partnerMolIdx = Number(partnerMolStr);
            includedMols.add(`${mapping.reactantIdx}:${partnerMolIdx}`);

            if (shouldLogNetworkGenerator) {
              debugNetworkLog(`[buildProductGraph] !+ wildcard at pattern comp ${pMolIdx}.${pCompIdx} -> reactant comp ${mapping.targetMolIdx}.${reactantCompIdx} -> bonded to mol ${partnerMolIdx}`);
            }

            // Recursively include the entire connected component from partner
            // (excluding the original molecule we started from)
            const toProcess = [partnerMolIdx];
            const visited = new Set<number>([partnerMolIdx, mapping.targetMolIdx]);
            while (toProcess.length > 0) {
              const molIdx = toProcess.pop()!;

              const currentMol = reactantGraph.molecules[molIdx];
              if (currentMol) {
                for (let cIdx = 0; cIdx < currentMol.components.length; cIdx++) {
                  const key = `${molIdx}.${cIdx}`;
                  const partnerKeys = reactantGraph.adjacency.get(key);

                  if (partnerKeys) {
                    for (const partnerKey2 of partnerKeys) {
                      const [partnerMolStr2] = partnerKey2.split('.');
                      const partnerMolIdx2 = Number(partnerMolStr2);

                      if (!visited.has(partnerMolIdx2)) {
                        visited.add(partnerMolIdx2);
                        includedMols.add(`${mapping.reactantIdx}:${partnerMolIdx2}`);
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

    // Clone included molecules
    for (const key of includedMols) {
      const [rStr, molIdxStr] = key.split(':');
      const r = Number(rStr);
      const molIdx = Number(molIdxStr);

      if (reactantToProductMol.has(key)) continue;

      const sourceMol = reactantGraphs[r].molecules[molIdx];
      const clone = this.cloneMoleculeStructure(sourceMol);
      clone._sourceKey = key; // Preserve source mapping (reactantIdx:molIdx)

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

      const key = `${mapping.reactantIdx}:${mapping.targetMolIdx}`;
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

        const [rStr, molIdxStr] = sourceKey.split(':');
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
        if (sourceCompInfo.dimension !== 2 || targetCompInfo.dimension !== 2) continue;

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

        // Find molecules bound to this one in the REACTANT graph
        for (let compIdx = 0; compIdx < sourceMol.components.length; compIdx++) {
          const adjKey = `${sourceMolIdx}.${compIdx}`;
          const partnerKeys = reactantGraph.adjacency.get(adjKey);
          if (!partnerKeys) continue;

          for (const partnerKey of partnerKeys) {
            const [partnerMolIdxStr] = partnerKey.split('.');
            const partnerMolIdx = Number(partnerMolIdxStr);

            // Find the corresponding product molecule
            const partnerSourceKey = `${rIdx}:${partnerMolIdx}`;
            const partnerProductMol = sourceKeyToProductMol.get(partnerSourceKey);
            if (!partnerProductMol || partnerProductMol === productMol) continue;

            // Check if partner is in an adjacent volume and needs transport
            const partnerComp = partnerProductMol.compartment;
            if (!partnerComp) continue;

            if (partnerComp === sourceOutside) {
              // Outside(source) -> Inside(target)
              if (targetInside) {
                if (shouldLogNetworkGenerator) {
                  debugNetworkLog(`  Moving bound ${partnerProductMol.name} from ${partnerComp} to ${targetInside} (Outside->Inside)`);
                }
                partnerProductMol.compartment = targetInside;
              }
            } else if (partnerComp === sourceInside) {
              // Inside(source) -> Outside(target)
              if (targetOutside) {
                if (shouldLogNetworkGenerator) {
                  debugNetworkLog(`  Moving bound ${partnerProductMol.name} from ${partnerComp} to ${targetOutside} (Inside->Outside)`);
                }
                partnerProductMol.compartment = targetOutside;
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
        const [molStr, compStr] = key.split('.');
        const molIdx = Number(molStr);
        const compIdx = Number(compStr);

        for (const partnerKey of partnerKeys) {
          const [partnerMolStr, partnerCompStr] = partnerKey.split('.');
          const partnerMolIdx = Number(partnerMolStr);
          const partnerCompIdx = Number(partnerCompStr);

          // Skip if not valid
          if (isNaN(molIdx) || isNaN(compIdx) || isNaN(partnerMolIdx) || isNaN(partnerCompIdx)) continue;

          // Check if both molecules are included
          const mol1Key = `${r}:${molIdx}`;
          const mol2Key = `${r}:${partnerMolIdx}`;
          if (!includedMols.has(mol1Key) || !includedMols.has(mol2Key)) continue;

          // FIX: Check if this specific bond is BROKEN by the rule transformation
          const bondEndpoint1 = `${r}:${molIdx}.${compIdx}`;
          const bondEndpoint2 = `${r}:${partnerMolIdx}.${partnerCompIdx}`;
          const brokenPairKey = endpointPairKey(bondEndpoint1, bondEndpoint2);
          if (brokenBondPairs.has(brokenPairKey)) {
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
    // CRITICAL FIX: Build reverse lookup from product pattern molecule to reactant pattern molecule
    // This allows us to use the matcher's componentMap for exact component identification
    const productToReactantPattern = new Map<number, {
      reactantIdx: number,
      reactantPatternMolIdx: number
    }>();
    for (const [pMolIdx, mapping] of productPatternToReactant.entries()) {
      const match = matches[mapping.reactantIdx];
      if (!match) continue;
      for (const [rpMolIdx, tMolIdx] of match.moleculeMap.entries()) {
        if (tMolIdx === mapping.targetMolIdx) {
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
        let requireStrictUnboundMapping = false;

        let pCompOccurrence = 0;
        for (let i = 0; i < pCompIdx; i++) {
          if (patternMol.components[i].name === pComp.name) pCompOccurrence++;
        }

        // Find a matching component in the product molecule
        let candidateIdx = -1;
        let markExplicitUnbound = pComp.wildcard === '-';
        let preserveOptionalWildcardBond = false;
        const isBound = (idx: number) => productGraph.adjacency.has(`${productMolIdx}.${idx}`);

        // CRITICAL FIX: First try to use componentMap for exact component identification
        const prMapping = productToReactantPattern.get(pMolIdx);
        if (prMapping) {
          const match = matches[prMapping.reactantIdx];
          const reactantPatternsArr = reactantPatterns instanceof Array ? reactantPatterns : [reactantPatterns]; // Safety check
          const reactantPatternMol = reactantPatternsArr[prMapping.reactantIdx].molecules[prMapping.reactantPatternMolIdx];

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

            // Look up exact target component via componentMap
            const compKey = `${prMapping.reactantPatternMolIdx}.${rpCompIdx}`;
            const targetKey = match.componentMap.get(compKey);

            if (!targetKey) continue;
            const idx = Number(targetKey.split('.')[1]);
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
              // CRITICAL FIX: If the REACTANT pattern had a !? wildcard on this component,
              // the bond state should be PRESERVED (allow either bound or unbound).
              // This is essential for transport rules like:
              //   @PM:R(tf~pY!?) -> @EM:R(tf~pY)
              // where the tf component may be bound to TF or P in CP.
              // Only enforce "explicitly unbound" if reactant pattern also expected unbound.
              const reactantExplicitlyUnbound = reactantPatternComp.wildcard === '-';
              if (reactantExplicitlyUnbound) {
                // Reactant pattern explicitly expected unbound, product should be unbound
                if (bound) continue;
                markExplicitUnbound = true;
              } else if (reactantPatternComp.wildcard === '?' && !reactantPatternComp.syntheticWildcard) {
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
            const boundIdx = matchingIndices.find(idx => isBound(idx));
            const unboundIdx = matchingIndices.find(idx => !isBound(idx));

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
          // BNG2 PARITY FIX: Before creating a new component, check if this molecule
          // was cloned from a reactant. If so, the component MUST already exist —
          // the bond-state compatibility filter was too strict. Do a relaxed search
          // accepting ANY available same-name component regardless of bond state.
          // BNG2 uses direct pointer maps (MapF) and never creates duplicate components.
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
                      const rComp4 = rPatMol4.components.find(c => c.name === pComp.name);
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
          const unboundSet = (productMol as any)._explicitUnboundComponents ?? new Set<number>();
          unboundSet.add(candidateIdx);
          (productMol as any)._explicitUnboundComponents = unboundSet;
        }

        if (pComp.edges.size > 0 && !pComp.wildcard) {
          const bondedSet = (productMol as any)._explicitBondedComponents ?? new Set<number>();
          bondedSet.add(candidateIdx);
          (productMol as any)._explicitBondedComponents = bondedSet;
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
          bondEndpoints.get(bondLabel)!.push({ pMolIdx, pCompIdx });
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
      const [molStr, compStr] = key.split('.');
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
        const [molIdxStr] = adjKey.split('.');
        const mol1Idx = Number(molIdxStr);
        const mol1 = productGraph.molecules[mol1Idx];
        const mol1Comp = mol1?.compartment || productGraph.compartment;

        for (const partnerKey of partnerKeys) {
          const [partnerMolIdxStr] = partnerKey.split('.');
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
   * Add species to network or retrieve existing
   */
  private addOrGetSpecies(
    graph: SpeciesGraph,
    speciesMap: Map<string, Species>,
    speciesByFingerprint: Map<string, Species[]>,
    speciesList: Species[],
    queue: SpeciesGraph[],
    signal?: AbortSignal
  ): Species {
    const canonical = profiledCanonicalize(graph);

    if (speciesMap.has(canonical)) {
      return speciesMap.get(canonical)!;
    }

    const isomorphic = this.findIsomorphicSpecies(graph, speciesByFingerprint);
    if (isomorphic) {
      speciesMap.set(canonical, isomorphic);
      return isomorphic;
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

    // DEBUG: Trace FB species creation
    if (canonical.includes('FB') && canonical.includes('s~U')) {
      console.log(`[NetworkGen] Creating Species '${canonical}': init=${seedConcentration}`);
    }

    speciesMap.set(canonical, species);
    speciesList.push(species);
    this.indexSpecies(species);
    this.indexFingerprint(species, speciesByFingerprint);
    queue.push(graph);

    if (signal?.aborted) {
      throw new DOMException('Network generation cancelled', 'AbortError');
    }

    return species;
  }

  private indexFingerprint(species: Species, speciesByFingerprint: Map<string, Species[]>): void {
    const fingerprint = this.buildSpeciesFingerprint(species.graph);
    const bucket = speciesByFingerprint.get(fingerprint);
    if (bucket) {
      bucket.push(species);
      return;
    }
    speciesByFingerprint.set(fingerprint, [species]);
  }

  private findIsomorphicSpecies(graph: SpeciesGraph, speciesByFingerprint: Map<string, Species[]>): Species | undefined {
    const fingerprint = this.buildSpeciesFingerprint(graph);
    const candidates = speciesByFingerprint.get(fingerprint);
    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    for (const candidate of candidates) {
      const maps = profiledFindAllMaps(graph, candidate.graph, { symmetryBreaking: true });
      if (maps.some(match => match.moleculeMap.size === graph.molecules.length)) {
        return candidate;
      }
    }

    return undefined;
  }

  private buildSpeciesFingerprint(graph: SpeciesGraph): string {
    const moleculeSignatures = graph.molecules
      .map((molecule) => {
        const componentSignature = molecule.components
          .map(component => `${component.name}~${component.state ?? ''}!${component.wildcard ?? ''}`)
          .sort()
          .join(',');
        return `${molecule.name}@${molecule.compartment ?? ''}(${componentSignature})`;
      })
      .sort()
      .join('|');

    const adjacencyDegreeSignature = graph.molecules
      .map((molecule, molIdx) => {
        const componentDegrees = molecule.components
          .map((_component, compIdx) => {
            const key = `${molIdx}.${compIdx}`;
            return graph.adjacency.get(key)?.length ?? 0;
          })
          .sort((a, b) => a - b)
          .join(',');
        return `${molecule.name}:${componentDegrees}`;
      })
      .sort()
      .join('|');

    return `${graph.compartment ?? ''}::${moleculeSignatures}::${adjacencyDegreeSignature}`;
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



  private async checkResourceLimits(signal?: AbortSignal): Promise<void> {
    // Removed yielding to event loop - it causes issues in some test runners
    if (signal?.aborted) {
      throw new Error('Network generation aborted by user');
    }

    const now = Date.now();
    if (now - this.lastMemoryCheck > this.options.checkInterval) {
      this.lastMemoryCheck = now;

      const memory = (performance as any).memory;
      if (memory && memory.usedJSHeapSize > this.options.memoryLimit) {
        throw new Error(
          `Memory limit exceeded: ${(memory.usedJSHeapSize / 1e6).toFixed(0)}MB > ` +
          `${(this.options.memoryLimit / 1e6).toFixed(0)}MB`
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

  private buildNaryEventSignature(
    rule: RxnRule,
    matches: MatchMap[],
    reactantSpeciesList: Species[]
  ): string | null {
    const ops: string[] = [];

    const buildMoleculeLocalSignature = (mol: Molecule): string => {
      const compSig = mol.components
        .map((comp) => {
          const state = comp.state ?? '';
          const wildcard = comp.wildcard ?? '';
          const bondDegree = comp.edges.size;
          return `${comp.name}~${state}!${wildcard}#${bondDegree}`;
        })
        .sort()
        .join(',');
      return `${mol.name}(${compSig})`;
    };

    const getTargetComponentDescriptor = (globalMolIdx: number, compIdx: number): string | null => {
      let currentMolOffset = 0;
      for (let k = 0; k < rule.reactants.length; k++) {
        const pattern = rule.reactants[k];
        if (globalMolIdx < currentMolOffset + pattern.molecules.length) {
          const molIdxInPattern = globalMolIdx - currentMolOffset;
          const match = matches[k];
          const targetSpecies = reactantSpeciesList[k];
          if (!match || !targetSpecies) return null;

          const targetMolIdx = match.moleculeMap.get(molIdxInPattern);
          if (targetMolIdx === undefined) return null;
          const targetMol = targetSpecies.graph.molecules[targetMolIdx];
          if (!targetMol) return null;

          const targetCompKey = match.componentMap.get(`${molIdxInPattern}.${compIdx}`);
          let targetCompIdx: number;
          if (targetCompKey) {
            const parts = targetCompKey.split('.');
            if (parts.length !== 2) return null;
            const parsed = Number(parts[1]);
            if (!Number.isFinite(parsed)) return null;
            targetCompIdx = parsed;
          } else {
            // Some rules reference components not explicitly constrained in reactant patterns
            // (e.g., add-bond on product-only sites). Fall back to direct component index
            // on the mapped target molecule so signature dedup can still work.
            targetCompIdx = compIdx;
          }

          const targetComp = targetMol.components[targetCompIdx];
          if (!targetComp) return null;

          const molSig = buildMoleculeLocalSignature(targetMol);
          const compSig = `${targetComp.name}~${targetComp.state ?? ''}#${targetComp.edges.size}`;
          return `S${targetSpecies.index}_MI${targetMolIdx}_M{${molSig}}_CI${targetCompIdx}_C{${compSig}}`;
        }
        currentMolOffset += pattern.molecules.length;
      }
      return null;
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

    for (const globalMolIdx of rule.deleteMolecules) {
      let currentMolOffset = 0;
      for (let k = 0; k < rule.reactants.length; k++) {
        const pattern = rule.reactants[k];
        if (globalMolIdx < currentMolOffset + pattern.molecules.length) {
          const molIdxInPattern = globalMolIdx - currentMolOffset;
          const targetMolIdx = matches[k]?.moleculeMap.get(molIdxInPattern);
          if (targetMolIdx !== undefined) {
            ops.push(`delMol:S${reactantSpeciesList[k].index}_M${targetMolIdx}`);
          }
          break;
        }
        currentMolOffset += pattern.molecules.length;
      }
    }

    if (ops.length === 0) {
      // Fallback for rules where explicit op arrays are empty (common for state-only
      // transforms parsed via reactant/product graphs). Build a signature from changed
      // reactant embeddings while ignoring pure carry-through catalysts.
      const remainingProductCounts = new Map<string, number>();
      for (const product of rule.products) {
        const key = getPatternSymmetryKey(product);
        remainingProductCounts.set(key, (remainingProductCounts.get(key) ?? 0) + 1);
      }

      const embeddingSignatureParts: string[] = [];
      for (let k = 0; k < rule.reactants.length; k++) {
        const reactantKey = getPatternSymmetryKey(rule.reactants[k]);
        const remaining = remainingProductCounts.get(reactantKey) ?? 0;
        const reactantSpecies = reactantSpeciesList[k];
        const speciesPart = `R${k}:S${reactantSpecies?.index ?? -1}`;

        if (remaining > 0) {
          remainingProductCounts.set(reactantKey, remaining - 1);
          embeddingSignatureParts.push(`${speciesPart}:carry`);
          continue;
        }

        const match = matches[k];
        if (!match || !reactantSpecies) continue;

        const mappedMoleculeSignatures = Array.from(match.moleculeMap.values())
          .map((molIdx) => {
            const mol = reactantSpecies.graph.molecules[molIdx];
            if (!mol) return `M${molIdx}`;
            // Use 1-hop neighborhood signature (neighbor LOCAL signatures per component)
            // to distinguish non-equivalent embeddings in asymmetric species.
            // E.g., FGFR bonded to Spry vs FGFR bonded to FRS2 — identical local
            // degree signatures but different neighbors → should NOT be deduplicated.
            // Using full local signature of neighbor (includes state+degree) also
            // distinguishes FGFR bonded to FRS2(s~P) vs FRS2(s~U).
            // For truly symmetric cases the neighbor-extended sigs are still equal,
            // so correct sigMult=2 is preserved for those.
            const compSig = mol.components.map((comp, ci) => {
              const state = comp.state ?? '';
              const bondDegree = comp.edges.size;
              const partnerKeys = reactantSpecies.graph.adjacency.get(`${molIdx}.${ci}`) ?? [];
              const neighborSigs = partnerKeys.map((pk: string) => {
                const partnerMolIdx = parseInt(pk.split('.')[0]);
                const neighborMol = reactantSpecies.graph.molecules[partnerMolIdx];
                if (!neighborMol) return '?';
                // Local (degree-only) sig of neighbor: captures name+state+bond degree
                return buildMoleculeLocalSignature(neighborMol);
              }).sort().join(',');
              return `${comp.name}~${state}#${bondDegree}[${neighborSigs}]`;
            }).sort().join(',');
            return `${mol.name}(${compSig})`;
          })
          .sort();
        embeddingSignatureParts.push(`${speciesPart}:M${mappedMoleculeSignatures.join('|')}`);
      }

      if (embeddingSignatureParts.length === 0) {
        return 'identity';
      }

      embeddingSignatureParts.sort();
      return embeddingSignatureParts.join('|');
    }
    ops.sort();
    return ops.join(';');
  }

  private buildLimitError(message: string): Error {
    const err = new Error(message);
    err.name = 'NetworkGenerationLimitError';
    return err;
  }

}
