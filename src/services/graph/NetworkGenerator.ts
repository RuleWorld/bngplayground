// graph/NetworkGenerator.ts
import { SpeciesGraph } from './core/SpeciesGraph';
import { Species } from './core/Species';
import { RxnRule } from './core/RxnRule';
import { Rxn } from './core/Rxn';
import { GraphCanonicalizer } from './core/Canonical';
import { GraphMatcher, MatchMap, clearMatchCache } from './core/Matcher';
import { countEmbeddingDegeneracy } from './core/degeneracy';
import { Molecule } from './core/Molecule';
import { Component } from './core/Component';

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

const shouldLogNetworkGenerator = false;
// typeof process !== 'undefined' &&
// typeof process.env !== 'undefined' &&
// process.env.DEBUG_NETWORK_GENERATOR === 'true';

// Progress logging (like BNG2.pl's output)
const shouldLogProgress = true;
// typeof process !== 'undefined' &&
// typeof process.env !== 'undefined' &&
// (process.env.DEBUG_NETWORK_PROGRESS === 'true' || process.env.DEBUG_NETWORK_GENERATOR === 'true');

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
function profiledFindAllMaps(pattern: SpeciesGraph, target: SpeciesGraph): MatchMap[] {
  if (profilingEnabled) {
    const start = performance.now();
    const result = GraphMatcher.findAllMaps(pattern, target);
    PROFILE_DATA.findAllMaps += performance.now() - start;
    PROFILE_DATA.findAllMapsCount++;
    return result;
  }
  return GraphMatcher.findAllMaps(pattern, target);
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
 * This applies only in BAB-like scenarios where:
 * - The pattern specifies fewer bound/specific components than the target molecule has
 * - Example: pattern A(b!1) matching target A(b!1,b!2) - pattern has 1 bound b, target has 2
 * 
 * This should NOT apply for cases like LRR dimer where the pattern fully covers the target.
 */
function shouldApplyDegeneracyStatFactor(pattern: SpeciesGraph, target: SpeciesGraph, match: MatchMap): boolean {

  for (const [pMolIdx, tMolIdx] of match.moleculeMap.entries()) {
    const pMol = pattern.molecules[pMolIdx];
    const tMol = target.molecules[tMolIdx];
    if (!pMol || !tMol) continue;

    // Count bound components with same name in pattern and target
    // Group by component name since symmetry is within same-named components
    const pBoundByName = new Map<string, number>();
    const tBoundByName = new Map<string, number>();

    for (const comp of pMol.components) {
      if (comp.edges.size > 0 || comp.wildcard === '+') {
        pBoundByName.set(comp.name, (pBoundByName.get(comp.name) ?? 0) + 1);
      }
    }

    for (const comp of tMol.components) {
      if (comp.edges.size > 0) {
        tBoundByName.set(comp.name, (tBoundByName.get(comp.name) ?? 0) + 1);
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
  }

  return false;
}



/**
 * Generate a reaction key for fast duplicate detection.
 * Uses sorted reactant and product indices for canonical comparison.
 */
function getReactionKey(reactants: number[], products: number[], ruleName: string): string {
  return `${reactants.slice().sort().join(',')}:${products.slice().sort().join(',')}:${ruleName}`;
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
  private startTime: number = 0;
  private lastMemoryCheck: number = 0;
  private aggLimitWarnings = 0;
  private speciesLimitWarnings = 0;
  private currentRuleName: string | null = null;

  constructor(options: Partial<GeneratorOptions> = {}) {
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
    if (this.options.compartments) {
      for (const c of this.options.compartments) {
        this.compartmentVolumes.set(c.name, c.size);
      }
    }
    this.currentRuleName = null;
  }

  /**
   * Calculate volume scaling factor for transport reactions (Unimolecular).
   * Scaling = V_source / V_dest.
   */
  private getTransportVolumeScale(source: SpeciesGraph, dest: SpeciesGraph): number {
    if (this.compartmentVolumes.size === 0) return 1;

    const vSource = source.compartment ? this.compartmentVolumes.get(source.compartment) : undefined;
    const vDest = dest.compartment ? this.compartmentVolumes.get(dest.compartment) : undefined;

    if (vSource !== undefined && vDest !== undefined && vDest > 0) {
      return vSource / vDest; // Restore BNG2 parity scaling
    }
    return 1;
  }



  private computeCollapsedRuleStatFactor(rule: RxnRule): number {
    // Recover BioNetGen's stat_factor for symmetric repeated sites when the matcher returns
    // a single embedding. We approximate this from *pattern-level* bond-count changes.
    //
    // Example: L(r,r) + R(l) -> L(r,r!1).R(l!1)
    // - L has 2 equivalent unbound r sites; one becomes bound => stat_factor = 2.
    const summarize = (graphs: SpeciesGraph[]) => {
      const byMol = new Map<string, { bound: Map<string, number>; unbound: Map<string, number> }>();

      const bump = (m: Map<string, number>, key: string, delta: number) => {
        m.set(key, (m.get(key) ?? 0) + delta);
      };

      for (const g of graphs) {
        for (const mol of g.molecules) {
          if (!byMol.has(mol.name)) {
            byMol.set(mol.name, { bound: new Map(), unbound: new Map() });
          }
          const entry = byMol.get(mol.name)!;

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

    const addCandidates: number[] = [];
    const delCandidates: number[] = [];

    for (const [molName, rCounts] of react.entries()) {
      const pCounts = prod.get(molName);
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
        // Approximate the number of equivalent deletable bonds as rBound/2 for same-site
        // bond types. This prevents the common 2x overcount while still allowing >1 when
        // multiple equivalent bonds exist.
        if (pBound === rBound - 1 && rBound > 1) {
          delCandidates.push(Math.max(1, Math.floor(rBound / 2)));
        }
      }
    }

    const addFactor = addCandidates.length > 0 ? Math.max(...addCandidates) : 1;
    const delFactor = delCandidates.length > 0 ? Math.max(...delCandidates) : 1;
    return Math.max(addFactor, delFactor, 1);
  }

  /**
   * Calculate volume scaling factor for bimolecular reactions.
   * For reactions in 3D compartments, rate is scaled by 1/volume.
   * For heterogeneous reactions (3D+2D), use the 3D compartment's volume.
   * Returns 1 if no compartments defined or reactants not in 3D compartment.
   * 
   * @param reactant1 First reactant species
   * @param reactant2 Second reactant species (optional for unimolecular)
   */
  private getVolumeScale(reactant1: Species, reactant2?: Species): number {
    if (!this.options.compartments || this.options.compartments.length === 0) {
      return 1;  // No compartments defined, no scaling
    }

    // Determine an effective compartment for a (possibly mixed-compartment) species.
    // Prefer any 3D compartment present in the complex; otherwise fall back to a 2D
    // compartment if present. This matches cBNGL semantics where surface-associated
    // complexes still scale bimolecular rates using the bulk (3D) compartment volume.
    const getSpeciesCompartment = (species: Species): string | null => {
      if (species.graph.compartment) {
        return species.graph.compartment;
      }

      const molCompartments = species.graph.molecules
        .map(m => m.compartment)
        .filter((c): c is string => typeof c === 'string' && c.length > 0);

      if (molCompartments.length === 0) return null;

      // Prefer any 3D compartment present.
      for (const cName of molCompartments) {
        const comp = this.options.compartments!.find(c => c.name === cName);
        if (comp && comp.dimension >= 3) return cName;
      }

      // Otherwise, return the first known compartment.
      return molCompartments[0] ?? null;
    };

    const comp1Name = getSpeciesCompartment(reactant1);
    const comp2Name = reactant2 ? getSpeciesCompartment(reactant2) : null;

    if (DEBUG_VOLUME_SCALE) {
      console.log(`[VolumeScale] ${reactant1.toString()} (comp=${comp1Name}) + ${reactant2?.toString()} (comp=${comp2Name})`);
    }

    // Get compartment details
    const comp1 = comp1Name ? this.options.compartments.find(c => c.name === comp1Name) : null;
    const comp2 = comp2Name ? this.options.compartments.find(c => c.name === comp2Name) : null;

    // For heterogeneous reactions (3D + 2D), use the 3D compartment's volume
    // This matches BioNetGen semantics where adsorption reactions scale by bulk volume
    let scalingCompartment: { name: string; dimension: number; size: number } | null = null;

    if (comp1 && comp2) {
      // Bimolecular: 
      // HYPOTHESIS: For heterogeneous (3D+2D) reactions, BNG2 uses the Surface compartment's 
      // effective volume (Size) for scaling, effectively treating the reaction as occurring 
      // in the membrane boundary layer.
      if (comp1.dimension >= 3 && comp2.dimension < 3) {
        scalingCompartment = comp2;  // Use 2D volume (effective layer)
      } else if (comp2.dimension >= 3 && comp1.dimension < 3) {
        scalingCompartment = comp1;  // Use 2D volume (effective layer)
      } else if (comp1.dimension >= 3 && comp2.dimension >= 3) {
        // Both 3D: use first (should be same compartment typically)
        scalingCompartment = comp1;
      } else {
        // Both 2D: use first (surface reaction)
        scalingCompartment = comp1;
      }
    } else if (comp1) {
      scalingCompartment = comp1;
    } else if (comp2) {
      scalingCompartment = comp2;
    }

    if (!scalingCompartment || scalingCompartment.size <= 0) {
      if (DEBUG_VOLUME_SCALE) {
        console.log(`[VolumeScale] → No scaling compartment, returning 1`);
      }
      return 1;
    }

    const scale = 1 / scalingCompartment.size;
    if (DEBUG_VOLUME_SCALE) {
      console.log(`[VolumeScale] → Using ${scalingCompartment.name} (dim=${scalingCompartment.dimension}, size=${scalingCompartment.size}) → scale=${scale}`);
    }
    // Scale by 1/size (volume for 3D, area for 2D)
    return scale;
  }

  /**
   * Check if two compartments are adjacent (BNG2: Compartment::adjacent).
   * Two compartments are adjacent if one is the parent (outside) of the other.
   * Returns true if adjacent, false otherwise.
   */
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

    // Get compartment from species graph or first molecule
    const getSpeciesCompartment = (species: Species): string | null => {
      if (species.graph.compartment) return species.graph.compartment;
      if (species.graph.molecules.length > 0 && species.graph.molecules[0].compartment) {
        return species.graph.molecules[0].compartment;
      }
      return null;
    };

    const comp1Name = getSpeciesCompartment(reactant1);
    const comp2Name = getSpeciesCompartment(reactant2);

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
      const canonical = profiledCanonicalize(sg);
      if (!speciesMap.has(canonical)) {
        const species = new Species(sg, speciesList.length);
        speciesMap.set(canonical, species);
        speciesList.push(species);
        this.indexSpecies(species);
        queue.push(sg);
      }
    }

    // Handle synthesis rules (0 -> X) - add products directly
    // These are zero-order reactions that produce species regardless of existing species
    for (const rule of rules) {
      if (rule.reactants.length === 0 && rule.products.length > 0) {
        debugNetworkLog(`[NetworkGenerator] Processing synthesis rule: ${rule.name}`);

        // Add each product species if not already present
        for (const productGraph of rule.products) {


          const productCanonical = profiledCanonicalize(productGraph);
          if (!speciesMap.has(productCanonical)) {
            const productSpecies = new Species(productGraph, speciesList.length);
            speciesMap.set(productCanonical, productSpecies);
            speciesList.push(productSpecies);
            this.indexSpecies(productSpecies);
            queue.push(productGraph);
          }
        }

        // Create the synthesis reaction (no reactants -> products)
        const productIndices = rule.products.map(pg => {
          const canonical = profiledCanonicalize(pg);
          return speciesMap.get(canonical)!.index;
        });

        const rxn = new Rxn([], productIndices, rule.rateConstant, rule.name, {
          rateExpression: rule.rateExpression
        });

        const rxnKey = getReactionKey(rxn.reactants, rxn.products, rule.name);
        const existingIdx = reactionIndexByKey.get(rxnKey);
        if (existingIdx === undefined) {
          reactionKeys.add(rxnKey);
          reactionIndexByKey.set(rxnKey, reactionsList.length);
          reactionsList.push(rxn);
        } else {
          reactionsList[existingIdx].rate += rxn.rate;
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
              try {
                const reactantInfo = (rule.reactants || [])
                  .map((r: any, i: number) => {
                    try {
                      return `${i}:${r?.toString?.() ?? String(r)}[${r && typeof r === 'object' && r.constructor ? r.constructor.name : typeof r
                        }]`;
                    } catch (e) {
                      return `${i}:<unserializable>`;
                    }
                  })
                  .join(' | ');
                debugNetworkLog(
                  `[NetworkGenerator] Dispatching rule ${ruleIdx}: ${rule.name}, Reactants count: ${rule.reactants?.length ?? 0} -> ${reactantInfo}`
                );
              } catch (e) {
                debugNetworkLog('[NetworkGenerator] Dispatching rule: <error reading rule>');
              }
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
                speciesList,
                queue,
                reactionsList,
                reactionKeys,
                reactionIndexByKey,
                signal
              );
            } else if (rule.reactants.length > 1) {
              // Bimolecular rule - only try with current species as FIRST reactant
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(
                  `[applyBimolecularRule] Applying bimolecular rule with patterns: ${rule.reactants[0].toString()} + ${rule.reactants[1].toString()}`
                );
              }
              await this.applyBimolecularRule(
                rule,
                ruleIdx,
                currentSpeciesObj,
                speciesList,
                speciesMap,
                speciesList,
                queue,
                reactionsList,
                reactionKeys,
                reactionIndexByKey,
                processedPairs,
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

  /**
   * FIX: Apply unimolecular rule (A -> B + C)
   */
  private async applyUnimolecularRule(
    rule: RxnRule,
    reactantSpecies: Species,
    speciesMap: Map<string, Species>,
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

      if (ops.length === 0) return null;
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

    const matches = profiledFindAllMaps(pattern, reactantSpecies.graph);

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

    // Recover stat_factor for collapsed symmetric embeddings (e.g., repeated identical sites).
    const collapsedRuleStatFactor = matchCount === 1 ? this.computeCollapsedRuleStatFactor(rule) : 1;



    for (const match of matches) {

      if (signal?.aborted) {
        throw new DOMException('Network generation cancelled', 'AbortError');
      }

      const degeneracy = profiledDegeneracy(pattern, reactantSpecies.graph, match);

      // Apply transformation
      const products = this.applyRuleTransformation(
        rule,
        [rule.reactants[0]],
        [reactantSpecies.graph],
        [match]
      );

      // Debug: log transformation result for phosphorylation rule
      if (shouldLogNetworkGenerator && rule.name?.includes('s45~U') && rule.name?.includes('CK1a')) {
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
      if (products.length !== expectedProductCount) {
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

      // Add all products to network
      const productSpeciesIndices: number[] = [];
      for (const product of products) {
        const productSpecies = this.addOrGetSpecies(product, speciesMap, speciesList, queue, signal);
        productSpeciesIndices.push(productSpecies.index);
      }

      // Unimolecular reactions do not get the identical-reactant 1/2 factor.
      // Symmetry-equivalent embeddings are handled via event-signature dedup.
      const propensityFactor = 1;

      // Create reaction (each match contributes additively; duplicates are aggregated by key)
      // Semantics: effective rate = (numeric scaling) * (evaluated symbolic expression, if present).
      // Therefore, degeneracy/volume scaling must live ONLY in the numeric factor.
      const baseRateConstant = rule.rateExpression && rule.rateConstant === 0 ? 1 : rule.rateConstant;
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
      const useDegeneracy = matchCount === 1 && shouldApplyDegeneracyStatFactor(pattern, reactantSpecies.graph, match);
      const statFactor = useDegeneracy ? degeneracy : (matchCount === 1 ? collapsedRuleStatFactor : 1);
      const effectiveRate = baseRateConstant * statFactor;

      // Preserve the BNGL expression without embedding degeneracy/volume scaling.
      // The solver/evaluator layer is responsible for multiplying: effectiveRate * eval(rateExpression).
      const rateExpression = rule.rateExpression ? `(${rule.rateExpression})` : undefined;



      // Calculate volume scaling for each product (e.g. CP -> NU transport needs scaling by V_CP/V_NU)
      const productStoichiometries = products.map(product => {
        return this.getTransportVolumeScale(reactantSpecies.graph, product);
      });

      const rxn = new Rxn(
        [reactantSpecies.index],
        productSpeciesIndices,
        effectiveRate,
        rule.name,
        { degeneracy, rateExpression, propensityFactor, productStoichiometries }
      );

      // Fast O(1) duplicate detection using Set
      const rxnKey = getReactionKey(rxn.reactants, rxn.products, rule.name);
      const existingIdx = reactionIndexByKey.get(rxnKey);
      if (existingIdx === undefined) {
        reactionKeys.add(rxnKey);
        reactionIndexByKey.set(rxnKey, reactionsList.length);
        reactionsList.push(rxn);
      } else {
        reactionsList[existingIdx].rate += rxn.rate;
      }
    }
  }

  /**
   * FIX: Apply bimolecular rule (A + B -> C)
   * Only apply when current species is the FIRST reactant to avoid double-counting
   */
  private async applyBimolecularRule(
    rule: RxnRule,
    ruleIdx: number,
    reactant1Species: Species,
    allSpecies: Species[],
    speciesMap: Map<string, Species>,
    speciesList: Species[],
    queue: SpeciesGraph[],
    reactionsList: Rxn[],
    reactionKeys: Set<string>,
    reactionIndexByKey: Map<string, number>,
    processedPairs: Set<string>,
    signal?: AbortSignal
  ): Promise<void> {
    const patternCount = rule.reactants.length;
    if (patternCount < 2) {
      return;
    }

    const pattern1 = rule.reactants[0];
    const pattern2 = rule.reactants[1];

    // Recover stat_factor for collapsed symmetric embeddings when both reactant matchers
    // return a single match (common with repeated identical sites like L(r,r)).
    if (!reactant1Species.graph.adjacencyBitset) {
      reactant1Species.graph.buildAdjacencyBitset();
    }


    const getDegeneracy = (
      cache: WeakMap<MatchMap, number>,
      match: MatchMap,
      patternGraph: SpeciesGraph,
      speciesGraph: SpeciesGraph
    ): number => {
      const cached = cache.get(match);
      if (cached !== undefined) {
        return cached;
      }
      const computed = profiledDegeneracy(patternGraph, speciesGraph, match);
      cache.set(match, computed);
      return computed;
    };

    // Debug Trace for Missing Interaction
    // const traceInteraction = (tag: string, msg: string) => { ... }; // Removed

    for (const firstIdx of [0, 1]) {
      const firstPattern = firstIdx === 0 ? pattern1 : pattern2;
      const secondIdx = firstIdx === 0 ? 1 : 0;
      const secondPattern = secondIdx === 0 ? pattern1 : pattern2;

      const matchesFirst = profiledFindAllMaps(firstPattern, reactant1Species.graph);
      if (matchesFirst.length === 0) {
        continue;
      }


      // NOTE: Do not orbit-group matches here; aggregate duplicate reactions by key instead.

      const firstDegeneracyCache = new WeakMap<MatchMap, number>();


      // Candidate optimization: choose only species that contain the molecules required by secondPattern
      const requiredMols = secondPattern.molecules.map((m) => m.name);


      let candidateIndices: Set<number> | null = null;

      if (requiredMols.length === 0) {
        candidateIndices = new Set(allSpecies.map((s) => s.index));
      } else {
        for (const molName of requiredMols) {
          const set = this.speciesByMoleculeIndex.get(molName);
          if (!set) {
            candidateIndices = null;
            break;
          }
          if (!candidateIndices) {
            candidateIndices = new Set(set);
          } else {
            // intersect
            const next = new Set<number>();
            for (const id of candidateIndices) {
              if (set.has(id)) next.add(id);
            }
            candidateIndices = next;
          }
        }
      }

      if (!candidateIndices || candidateIndices.size === 0) {
        continue;
      }

      for (const idx of candidateIndices) {
        const reactant2Species = allSpecies[idx];

        if (signal?.aborted) {
          throw new DOMException('Network generation cancelled', 'AbortError');
        }

        if (!reactant2Species.graph.adjacencyBitset) {
          reactant2Species.graph.buildAdjacencyBitset();
        }

        // Check constraints using correct reactant order
        // firstIdx=0 -> pattern1 matched reactant1Species, pattern2 matching reactant2Species -> order (R1, R2)
        // firstIdx=1 -> pattern2 matched reactant1Species, pattern1 matching reactant2Species -> order (R2, R1)
        const checkR1 = firstIdx === 0 ? reactant1Species : reactant2Species;
        const checkR2 = firstIdx === 0 ? reactant2Species : reactant1Species;

        if (!this.checkConstraints(rule, checkR1, checkR2)) {
          continue;
        }

        // Check compartment adjacency for cBNGL - species must be in same or adjacent compartments
        if (!this.isInteractingSet(reactant1Species, reactant2Species)) {
          continue;
        }

        const matchesSecond = profiledFindAllMaps(secondPattern, reactant2Species.graph);



        if (matchesSecond.length === 0) {
          continue; // No matches found
        }


        // NOTE: Do not orbit-group matches here; aggregate duplicate reactions by key instead.

        const secondDegeneracyCache = new WeakMap<MatchMap, number>();

        const keyA = Math.min(reactant1Species.index, reactant2Species.index);
        const keyB = Math.max(reactant1Species.index, reactant2Species.index);
        const pairKey = `${keyA}::${keyB}::${ruleIdx}`;
        if (processedPairs.has(pairKey)) {
          continue;
        }

        const identicalSpecies = reactant1Species.index === reactant2Species.index;

        let producedReaction = false;

        // When reactants contain internal symmetries, `findAllMaps` can return multiple
        // match combinations that are related by automorphisms but represent the *same physical event*
        // (e.g., catalysis/state-change rules in symmetric complexes). BNG2 counts such events once.
        // Deduplicate by a stable signature derived from the concrete transformation outcome.
        const seenEventSignatures = new Set<string>();


        const buildBimolecularEventSignatureFromProducts = (
          reactantGraphsOrderedLocal: SpeciesGraph[],
          products: SpeciesGraph[]
        ): string | null => {
          // Map (reactantIdx, reactantMolIdx) -> product component index.
          const molToProduct = new Map<string, number>();
          for (let pi = 0; pi < products.length; pi++) {
            const product = products[pi];
            for (const mol of product.molecules) {
              const sourceKey = (mol as any)._sourceKey as string | undefined;
              if (!sourceKey) continue;
              molToProduct.set(sourceKey, pi);
            }
          }

          const ops: string[] = [];

          // Deletions: reactant molecules that disappear from all products.
          for (let ri = 0; ri < reactantGraphsOrderedLocal.length; ri++) {
            const rg = reactantGraphsOrderedLocal[ri];
            for (let molIdx = 0; molIdx < rg.molecules.length; molIdx++) {
              const sk = `${ri}:${molIdx}`;
              if (!molToProduct.has(sk)) ops.push(`delMol:${sk}`);
            }
          }

          // State changes: compare product molecule components to their source reactant molecule.
          for (const product of products) {
            for (let pm = 0; pm < product.molecules.length; pm++) {
              const pMol = product.molecules[pm];
              const sourceKey = (pMol as any)._sourceKey as string | undefined;
              if (!sourceKey) continue;
              const [rStr, molStr] = sourceKey.split(':');
              const ri = Number(rStr);
              const molIdx = Number(molStr);
              if (!Number.isFinite(ri) || !Number.isFinite(molIdx)) continue;
              const rg = reactantGraphsOrderedLocal[ri];
              const rMol = rg?.molecules?.[molIdx];
              if (!rMol) continue;

              const maxComps = Math.min(rMol.components.length, pMol.components.length);
              for (let ci = 0; ci < maxComps; ci++) {
                const rc = rMol.components[ci];
                const pc = pMol.components[ci];
                const rState = (rc as any).state;
                const pState = (pc as any).state;
                if (rState !== pState) {
                  ops.push(
                    `state:${ri}:${molIdx}.${ci}:${rMol.name}:${rc.name}:${String(rState)}->${String(pState)}`
                  );
                }
              }
            }
          }

          // Bond cuts: bonds in reactants whose endpoints end up in different products.
          const seenPairs = new Set<string>();
          for (let ri = 0; ri < reactantGraphsOrderedLocal.length; ri++) {
            const rg = reactantGraphsOrderedLocal[ri];
            for (let molIdx = 0; molIdx < rg.molecules.length; molIdx++) {
              const mol = rg.molecules[molIdx];
              const groupA = molToProduct.get(`${ri}:${molIdx}`);
              if (groupA === undefined) continue;

              for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
                const comp = mol.components[compIdx];
                const partners = rg.adjacency.get(`${molIdx}.${compIdx}`);
                if (!partners) continue;

                for (const partnerKey of partners) {
                  const [mol2Str, comp2Str] = partnerKey.split('.');
                  const mol2Idx = Number(mol2Str);
                  const comp2Idx = Number(comp2Str);
                  if (!Number.isFinite(mol2Idx) || !Number.isFinite(comp2Idx)) continue;

                  const groupB = molToProduct.get(`${ri}:${mol2Idx}`);
                  if (groupB === undefined) continue;
                  if (groupA === groupB) continue;

                  const aKey = `${ri}:${molIdx}.${compIdx}`;
                  const bKey = `${ri}:${mol2Idx}.${comp2Idx}`;
                  const pairKey = [aKey, bKey].sort().join('|');
                  if (seenPairs.has(pairKey)) continue;
                  seenPairs.add(pairKey);

                  const mol2 = rg.molecules[mol2Idx];
                  const comp2 = mol2?.components?.[comp2Idx];
                  if (!mol2 || !comp2) continue;

                  const aDesc = `${ri}:${molIdx}.${compIdx}:${mol.name}:${comp.name}`;
                  const bDesc = `${ri}:${mol2Idx}.${comp2Idx}:${mol2.name}:${comp2.name}`;
                  ops.push(`delBond:${[aDesc, bDesc].sort().join('|')}`);
                }
              }
            }
          }

          if (ops.length === 0) return null;
          ops.sort();
          return ops.join(';');
        };



        for (const matchFirst of matchesFirst) {
          const firstDegeneracy = getDegeneracy(
            firstDegeneracyCache,
            matchFirst,
            firstPattern,
            reactant1Species.graph
          );

          for (const matchSecond of matchesSecond) {
            // NOTE: The intramolecular check (shareTargets / inSameConnectedComponent) is intended
            // to skip rules that would act within a single complex instance when they are
            // defined as bimolecular. However, for intermolecular reactions between two
            // DISTINCT instances of the same species (e.g., S + S -> D), these checks would
            // incorrectly skip valid matches. Since this loop is specifically for generating
            // 2-reactant reactions, we assume they are distinct instances and do not skip.
            // (If we want to support intramolecular reactions from bimolecular rules, they
            // should be handled as a separate 1-reactant reaction case.)



            const secondDegeneracy = getDegeneracy(
              secondDegeneracyCache,
              matchSecond,
              secondPattern,
              reactant2Species.graph
            );

            // FIX: Ensure arguments are passed in Rule Order [Pattern 1, Pattern 2]
            // If firstIdx === 1, we matched Pattern 2 first, so we must swap the order.

            const reactantPatternsOrdered = firstIdx === 0
              ? [firstPattern, secondPattern]
              : [secondPattern, firstPattern];

            const reactantGraphsOrdered = firstIdx === 0
              ? [reactant1Species.graph, reactant2Species.graph]
              : [reactant2Species.graph, reactant1Species.graph];

            const matchesOrdered = firstIdx === 0
              ? [matchFirst, matchSecond]
              : [matchSecond, matchFirst];

            // Apply rule transformation to get products
            const products = this.applyRuleTransformation(
              rule,
              reactantPatternsOrdered,
              reactantGraphsOrdered,
              matchesOrdered
            );

            // products === null means transformation failed (e.g., no match)
            // products === [] (empty array) is valid for degradation rules
            if (products === null || !this.validateProducts(products)) {
              continue;
            }

            // BNG2.pl parity check (RxnRule.pm lines 3156-3170):
            // Number of product graphs must equal number of product patterns.
            // For example, a rule like "DNA(A20!0).NFkB(...) + IkB(...) -> DNA(A20) + NFkB.IkB"
            // expects 2 product components. If applied to a larger complex where breaking the
            // specified bond does not disconnect the products (e.g., NFkB is still tethered via
            // another DNA site), the result is fewer components and the reaction is rejected.
            const expectedProductCount = rule.products.length;
            if (products.length !== expectedProductCount) {
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(
                  `[applyBimolecularRule] Rejecting rule ${rule.name}: product count ${products.length} != expected ${expectedProductCount}`
                );
              }
              continue;
            }

            const signature = buildBimolecularEventSignatureFromProducts(reactantGraphsOrdered, products);
            if (signature) {
              if (seenEventSignatures.has(signature)) {
                continue;
              }
              seenEventSignatures.add(signature);
            }

            const productSpeciesIndices: number[] = [];
            for (const product of products) {
              const productSpecies = this.addOrGetSpecies(product, speciesMap, speciesList, queue, signal);
              productSpeciesIndices.push(productSpecies.index);
            }

            // For bimolecular reactions, scale by 1/volume/area per cBNGL.
            const volumeScale = this.getVolumeScale(reactant1Species, reactant2Species);

            // BioNetGen-style statistical factors:
            // - If the matcher enumerates multiple distinct embeddings, multiplicity is recovered by
            //   summing identical reactions via reaction-key aggregation.
            // - If the matcher collapses symmetric embeddings to a single match (common with repeated
            //   identical sites/components), BNG2 still applies a stat_factor. Recover it here using
            //   the computed embedding degeneracy *only* in the single-match case.
            const totalDegeneracy = Math.max(firstDegeneracy * secondDegeneracy, 1);
            // Recover stat_factor when the matcher collapses symmetric embeddings into a single match.
            // IMPORTANT: This can happen independently per reactant. When one side enumerates multiple
            // embeddings (e.g., pattern matches either of two identical molecules in a complex), and the
            // other side collapses repeated identical sites into a single embedding with degeneracy>1,
            // we must still apply the degeneracy for the collapsed side.
            // Example (mixed): A(x) matches A(x).A(x) (2 embeddings enumerated) and B(y) matches B(y,y)
            // (1 embedding, degeneracy 2). Correct stat_factor is 2*2=4 (enumeration * degeneracy).
            const degeneracyFactor =
              (matchesFirst.length === 1 ? firstDegeneracy : 1) *
              (matchesSecond.length === 1 ? secondDegeneracy : 1);
            const symmetryFactor = Math.max(degeneracyFactor, 1);

            // Semantics: effective rate = (numeric scaling) * (evaluated symbolic expression, if present).
            // Keep scaling in the numeric factor; keep the symbolic rateExpression untouched.
            const baseRateConstant = rule.rateExpression && rule.rateConstant === 0 ? 1 : rule.rateConstant;
            const effectiveRate = baseRateConstant * symmetryFactor * volumeScale;
            const propensityFactor = identicalSpecies ? 0.5 : 1;

            // Preserve the BNGL expression without embedding degeneracy/volume scaling.
            // The solver/evaluator layer is responsible for multiplying: effectiveRate * eval(rateExpression).
            const rateExpression = rule.rateExpression ? `(${rule.rateExpression})` : undefined;

            const reactantIndices = [reactant1Species.index, reactant2Species.index];
            const rxn = new Rxn(
              reactantIndices,
              productSpeciesIndices,
              effectiveRate,
              rule.name,
              {
                // Keep the raw degeneracy for debugging/inspection.
                degeneracy: totalDegeneracy,
                propensityFactor,
                rateExpression
              }
            );

            // Fast O(1) duplicate detection using Set
            const rxnKey = getReactionKey(rxn.reactants, rxn.products, rule.name);
            const existingIdx = reactionIndexByKey.get(rxnKey);
            if (existingIdx === undefined) {
              reactionKeys.add(rxnKey);
              reactionIndexByKey.set(rxnKey, reactionsList.length);
              reactionsList.push(rxn);
              producedReaction = true;
            } else {
              reactionsList[existingIdx].rate += rxn.rate;
              producedReaction = true;
            }

            if (signal?.aborted) {
              throw new DOMException('Network generation cancelled', 'AbortError');
            }
          }
        }

        if (producedReaction) {
          processedPairs.add(pairKey);
        }
      }
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

    // Degradation rule: X -> 0 (empty products)
    if (rule.products.length === 0) {
      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[applyTransformation] Degradation rule - no products`);
      }
      return [];  // Return empty array for degradation
    }

    const productGraphs: SpeciesGraph[] = [];
    const usedReactantMolsInReaction = new Set<string>(); // Tracks reactant graph molecules (for deduplication)
    const usedReactantPatternMols = new Set<string>(); // Tracks reactant pattern molecules (for mapping correctness)

    for (const productPattern of rule.products) {
      const productGraph = this.buildProductGraph(
        productPattern,
        reactantPatterns,
        reactantGraphs,
        matches,
        usedReactantPatternMols // NEW: Pass shared usage set
      );

      if (!productGraph) {
        if (shouldLogNetworkGenerator) {
          debugNetworkLog('[applyTransformation] Failed to construct product graph; treating as no-op');
        }
        return null;
      }

      // FIX: Split the product graph into connected components.
      // When bonds are broken during transformation, molecules may become disconnected
      // and should be treated as separate species.
      const splitProducts = productGraph.split();
      for (const subgraph of splitProducts) {
        // Collect source keys for this subgraph
        const sourceKeys = new Set<string>();
        for (const mol of subgraph.molecules) {
          if (mol._sourceKey) {
            sourceKeys.add(mol._sourceKey);
          }
        }

        // DEDUPLICATION FIX:
        // Check if ANY molecule in this subgraph was already covered by a previous product fragment.
        // A molecule from the reactant(s) should only appear in ONE product species.
        // If we find an overlap, it means multiple product patterns in the rule
        // point to the same physical connected component in the result.
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
          // Mark all molecules in this subgraph as used
          for (const key of sourceKeys) {
            usedReactantMolsInReaction.add(key);
          }
        } else if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[applyTransformation] Skipping duplicate product fragment containing molecules: ${Array.from(sourceKeys).join(', ')}`);
        }
      }
    }


    if (shouldLogNetworkGenerator) {
      debugNetworkLog(
        `[applyTransformation] Result: ${productGraphs
          .map((p) => p.toString().slice(0, 150))
          .join(' | ')}`
      );
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
    usedReactantPatternMols: Set<string> // NEW: Shared tracking across product patterns
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
      if (!rpMol || rpMol.name !== pMol.name) return -Infinity;

      let score = 0;

      // NOTE: Do NOT strongly weight pattern-level "isBound".
      // A molecule can be bound in the *reactant graph* via bonds not mentioned in the rule
      // (e.g., receptor dimers via DD!1), while the reactant *pattern* may omit that bond.
      // Over-weighting this causes incorrect molecule identity swaps.
      if (rpm.isBound === pMolIsBound) score += 5;

      // Prefer compatible component states. This helps disambiguate identical molecule names
      // in symmetric complexes (e.g., multiple R molecules with different Y1/Y2 states).
      const rpCompByName = new Map<string, any>();
      for (const c of rpMol.components) rpCompByName.set(c.name, c);

      // Reward overlap of *specified* component names between the two pattern molecules.
      // This is important because BNGL patterns often omit components as wildcards, and
      // different molecules in the same rule may specify different components.
      const rpCompNames = new Set<string>(rpMol.components.map((c: any) => c.name));
      const pCompNames = new Set<string>(pMol.components.map((c: any) => c.name));
      let sharedCompNames = 0;
      for (const name of pCompNames) {
        if (rpCompNames.has(name)) sharedCompNames++;
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
        const pLabels = new Set<number>();
        for (const [lbl] of pc.edges) {
          if (typeof lbl === 'number') pLabels.add(lbl);
        }
        if (pLabels.size > 0) {
          let shared = 0;
          for (const [lbl] of rc.edges) {
            if (typeof lbl === 'number' && pLabels.has(lbl)) shared++;
          }
          score += shared * 10;
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

      for (let i = 0; i < allReactantPatternMols.length; i++) {
        // Construct a unique key for this reactant pattern molecule
        const rpmKey = `${allReactantPatternMols[i].reactantIdx}:${allReactantPatternMols[i].patternMolIdx}`;
        if (usedReactantPatternMols.has(rpmKey)) continue;

        const rpm = allReactantPatternMols[i];
        if (rpm.name !== pMol.name) continue;

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

      // If no score-based match found, fall back to first available
      if (bestMatchIdx === -1) {
        for (let i = 0; i < allReactantPatternMols.length; i++) {
          const rpmKey = `${allReactantPatternMols[i].reactantIdx}:${allReactantPatternMols[i].patternMolIdx}`;
          if (usedReactantPatternMols.has(rpmKey)) continue;
          if (allReactantPatternMols[i].name !== pMol.name) continue;
          bestMatchIdx = i;
          break;
        }
      }

      if (bestMatchIdx !== -1) {
        const rpm = allReactantPatternMols[bestMatchIdx];
        const rpmKey = `${rpm.reactantIdx}:${rpm.patternMolIdx}`;
        usedReactantPatternMols.add(rpmKey);
        productPatternToReactant.set(pMolIdx, {
          reactantIdx: rpm.reactantIdx,
          targetMolIdx: rpm.targetMolIdx
        });
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

    // Build a set of bonds that are BROKEN by this transformation
    // A broken bond is one that exists in reactant patterns but not in product pattern
    const brokenBonds = new Set<string>(); // "reactantIdx:molIdx.compIdx"

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

      const findComponentByNameOccurrence = (components: any[], name: string, occurrence: number): any | undefined => {
        let seen = 0;
        for (const comp of components) {
          if (comp.name !== name) continue;
          if (seen === occurrence) return comp;
          seen++;
        }
        return undefined;
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
            // Check for same bond label
            for (const [ppBondLabel] of matchingPpComp.edges) {
              if (ppBondLabel === bondLabel) {
                bondPreserved = true;
                break;
              }
            }
          }

          if (!bondPreserved) {
            // This bond is broken - mark the target component
            const componentKey = `${reactantPatternMolIdx}.${rpCompIdx}`;
            const targetCompKey = match.componentMap.get(componentKey);
            if (targetCompKey) {
              brokenBonds.add(`${mapping.reactantIdx}:${targetCompKey}`);
              if (shouldLogNetworkGenerator) {
                debugNetworkLog(`[buildProductGraph] Bond label ${bondLabel} is BROKEN at ${mapping.reactantIdx}:${targetCompKey}`);
              }
            }
          }
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
                // Check if this bond is broken
                const bondKey = `${mapping.reactantIdx}:${molStr}.${compStr}`;
                if (brokenBonds.has(bondKey)) {
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

      if (shouldLogNetworkGenerator) {
        debugNetworkLog(`[buildProductGraph] Cloned reactant ${r} mol ${molIdx} (${sourceMol.name}@${clone.compartment || 'none'}) -> product mol ${newIdx}`);
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
        // CRITICAL FIX: If pattern has graph-level compartment, ALWAYS apply it to all molecules
        // This handles transport rules like "A(t!2,b!1).B(a!1).T1(a!2) -> T1(a) + A(t,b!1).B(a!1)@CYT"
        // where the product complex A.B@CYT should have BOTH A and B in CYT, overriding any
        // compartment inherited from the reactant (e.g., O1V).
        productGraph.molecules[productMolIdx].compartment = pattern.compartment;
        if (shouldLogNetworkGenerator) {
          debugNetworkLog(`[buildProductGraph] Setting product mol ${productMolIdx} compartment to ${pattern.compartment} from graph-level pattern compartment (override)`);
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

          // FIX: Check if this bond is BROKEN by the rule transformation
          // A bond is broken if either endpoint is in the brokenBonds set
          const bondEndpoint1 = `${r}:${molIdx}.${compIdx}`;
          const bondEndpoint2 = `${r}:${partnerMolIdx}.${partnerCompIdx}`;
          if (brokenBonds.has(bondEndpoint1) || brokenBonds.has(bondEndpoint2)) {
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
            let originalLabel = 0;
            for (const [l, target] of comp.edges) {
              if (target === partnerCompIdx) {
                originalLabel = l;
                break;
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
      const usedSet = usedComponentIndicesPerMol.get(productMolIdx) ?? new Set<number>();

      // Categorize pattern components
      const wildcardComps: number[] = [];   // !+ components - should map to bound
      const unboundComps: number[] = [];    // no edges, no wildcard - should map to unbound
      const newBondComps: number[] = [];    // has edges (new bonds) - should map to unbound

      for (let pCompIdx = 0; pCompIdx < patternMol.components.length; pCompIdx++) {
        const pComp = patternMol.components[pCompIdx];
        if (pComp.wildcard === '+') {
          wildcardComps.push(pCompIdx);
        } else if (pComp.edges.size === 0) {
          unboundComps.push(pCompIdx);
        } else {
          newBondComps.push(pCompIdx);
        }
      }

      // Process in order: wildcards first, then unbound, then new bonds
      const orderedComps = [...wildcardComps, ...unboundComps, ...newBondComps];

      for (const pCompIdx of orderedComps) {
        const pComp = patternMol.components[pCompIdx];

        // Find a matching component in the product molecule
        let candidateIdx = -1;
        const isBound = (idx: number) => productGraph.adjacency.has(`${productMolIdx}.${idx}`);

        // CRITICAL FIX: First try to use componentMap for exact component identification
        const prMapping = productToReactantPattern.get(pMolIdx);
        if (prMapping) {
          const match = matches[prMapping.reactantIdx];
          const reactantPatternsArr = reactantPatterns instanceof Array ? reactantPatterns : [reactantPatterns]; // Safety check
          const reactantPatternMol = reactantPatternsArr[prMapping.reactantIdx].molecules[prMapping.reactantPatternMolIdx];

          // Find matching reactant pattern component by name
          for (let rpCompIdx = 0; rpCompIdx < reactantPatternMol.components.length; rpCompIdx++) {
            if (reactantPatternMol.components[rpCompIdx].name !== pComp.name) continue;

            const reactantPatternComp = reactantPatternMol.components[rpCompIdx];

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
            //   (a) preserved (reactant pattern component was already bound) -> must map to bound
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
              if (reactantWasBound) {
                if (!bound) continue;
              } else {
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
              const reactantAllowedBond = reactantPatternComp.wildcard === '?' ||
                reactantPatternComp.wildcard === '+' ||
                reactantPatternComp.edges.size > 0;
              if (!reactantAllowedBond) {
                // Reactant pattern expected unbound, product should be unbound
                if (bound) continue;
              }
              // Otherwise, preserve bond state (allow either)
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
                  if (shouldLogNetworkGenerator) {
                    debugNetworkLog(`[buildProductGraph] No unbound site available for mapping: ${pMolIdx}.${pCompIdx} (${pComp.name})`);
                  }
                  return null;
                }
              }
            }
          }

        } // End of fallback if (candidateIdx === -1) block

        if (candidateIdx === -1) {

          // Component doesn't exist, create it
          const newComponent = new Component(pComp.name, [...pComp.states]);
          newComponent.state = pComp.state;
          newComponent.wildcard = pComp.wildcard;
          candidateIdx = productMol.components.length;
          productMol.components.push(newComponent);
        }

        usedSet.add(candidateIdx);
        usedComponentIndicesPerMol.set(productMolIdx, usedSet);
        componentIndexMap.set(`${pMolIdx}:${pCompIdx}`, candidateIdx);

        // Apply state change if specified
        if (pComp.state && pComp.state !== '?') {
          productMol.components[candidateIdx].state = pComp.state;
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
    speciesList: Species[],
    queue: SpeciesGraph[],
    signal?: AbortSignal
  ): Species {
    const canonical = profiledCanonicalize(graph);
    // Debug logging for specific species
    if (graph.molecules.some(m => m.name === 'CCND')) {
      console.log(`[addOrGetSpecies] Check CCND: comp='${graph.compartment}', canonical='${canonical}'`);
    }


    if (speciesMap.has(canonical)) {
      return speciesMap.get(canonical)!;
    }

    if (speciesList.length >= this.options.maxSpecies) {
      this.warnSpeciesLimit();
      throw this.buildLimitError(
        `Max species limit reached (${this.options.maxSpecies}) while applying rule "${this.currentRuleName ?? 'unknown'}"`
      );
    }

    const species = new Species(graph, speciesList.length);
    speciesMap.set(canonical, species);
    speciesList.push(species);
    queue.push(graph);

    if (signal?.aborted) {
      throw new DOMException('Network generation cancelled', 'AbortError');
    }

    // Index the newly created species by molecule type for faster candidate lookup
    this.indexSpecies(species);

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
          if (comp.wildcard === '?' && comp.edges.size > 0) {
            console.warn('[validateProducts] Component marked !? but bond detected; rejecting product');
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
    if (this.speciesLimitWarnings < 5) {
      console.warn('Max species limit reached');
    } else if (this.speciesLimitWarnings === 5) {
      console.warn('Max species limit reached: additional occurrences suppressed');
    }
    this.speciesLimitWarnings++;
  }

  private buildLimitError(message: string): Error {
    const err = new Error(message);
    err.name = 'NetworkGenerationLimitError';
    return err;
  }
}