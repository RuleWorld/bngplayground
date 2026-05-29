/**
 * SymmetryReducedVerifier.ts
 * Layer 3: Full state-space exploration with symmetry reduction.
 *
 * This layer performs exhaustive reachability analysis with no bound on the
 * number of species (up to available memory). It uses canonical labeling for
 * symmetry reduction to avoid exploring isomorphic species multiple times.
 *
 * This is appropriate when the contact map indicates a finite state space
 * (no unbounded polymerization) and we need exact answers.
 */

import type { BNGLModel } from '../../types';
import {
  boundedReachabilityCheck,
  checkDeadlock as boundedCheckDeadlock,
  type BoundedVerificationConfig,
} from './BoundedVerifier';
import { BNGLParser } from '../graph/core/BNGLParser';
import { GraphCanonicalizer } from '../graph/core/Canonical';
import { GraphMatcher } from '../graph/core/Matcher';
import { SpeciesGraph } from '../graph/core/SpeciesGraph';
import {
  type ContactMap,
  checkAbstractReachability,
} from './ContactMapReachability';

/* ---------- Finiteness check ---------- */

/**
 * Check if a contact map implies a finite set of reachable species.
 *
 * The state space is infinite when unbounded polymerization can occur:
 * a molecule type M has a component c that can bind to another instance of M
 * (possibly through a chain), creating arbitrarily long polymers.
 *
 * We detect this by looking for cycles in the contact map where a molecule type
 * can bind to the same molecule type through a chain of bindings. More precisely,
 * we check if any molecule type participates in a self-binding cycle where
 * the same component pair allows repeated extension.
 *
 * @returns Object with `isFinite` flag and optional reason if infinite.
 */
export function checkFiniteContactMap(
  contactMap: ContactMap
): {
  isFinite: boolean;
  reason?: string;
  polymerizingTypes?: string[];
} {
  // Build a multigraph of molecule-type connectivity
  // An edge exists from M1 to M2 if there's a contact map edge between them
  const molTypeEdges = new Map<string, Set<string>>();

  const ensureMol = (m: string) => {
    if (!molTypeEdges.has(m)) molTypeEdges.set(m, new Set());
  };

  for (const edge of contactMap.edges) {
    const src = edge.source.moleculeType;
    const tgt = edge.target.moleculeType;
    ensureMol(src);
    ensureMol(tgt);
    molTypeEdges.get(src)!.add(tgt);
    molTypeEdges.get(tgt)!.add(src);
  }

  // Check for self-loops: a molecule type that can bind to itself
  // This is the primary indicator of potential polymerization
  const polymerizingTypes: string[] = [];

  for (const [molType, neighbors] of molTypeEdges) {
    if (neighbors.has(molType)) {
      // Self-loop: M can bind to M, which allows unbounded chains M-M-M-...
      // But only if the binding uses different components (otherwise limited to dimers)
      const selfEdges = contactMap.edges.filter(
        e =>
          (e.source.moleculeType === molType && e.target.moleculeType === molType)
      );

      for (const selfEdge of selfEdges) {
        if (selfEdge.source.component !== selfEdge.target.component) {
          // Different components bind, allowing polymer chains:
          // M(a!1).M(b!1,a!2).M(b!2,a!3)...
          polymerizingTypes.push(molType);
          break;
        }
        // Same component binding (e.g., A(a!1).A(a!1)) only allows dimers, not polymers
      }
    }
  }

  // Also check for cycles through multiple types that could allow polymerization
  // e.g., A-B-A-B-... chains
  // Look for cycles of length >= 2 where the binding pattern can repeat
  if (polymerizingTypes.length === 0) {
    // Check for 2-cycles: A binds to B, and B binds back to A through different components
    for (const edge1 of contactMap.edges) {
      const m1 = edge1.source.moleculeType;
      const m2 = edge1.target.moleculeType;
      if (m1 === m2) continue;

      // Find reverse edges (from m2 back to m1) using different components
      for (const edge2 of contactMap.edges) {
        if (edge2.source.moleculeType === m2 && edge2.target.moleculeType === m1) {
          // Check that at least one molecule type uses different components in the two edges
          const m1UsesComp1 = edge1.source.component;
          const m1UsesComp2 = edge2.target.component;
          const m2UsesComp1 = edge1.target.component;
          const m2UsesComp2 = edge2.source.component;

          if (m1UsesComp1 !== m1UsesComp2 && m2UsesComp1 !== m2UsesComp2) {
            // Both types use different components in the two directions,
            // allowing: A(b!1).B(a!1,c!2).A(d!2,b!3).B(a!3)...
            polymerizingTypes.push(m1, m2);
          }
        }
      }
      if (polymerizingTypes.length > 0) break;
    }
  }

  if (polymerizingTypes.length > 0) {
    const uniqueTypes = [...new Set(polymerizingTypes)];
    return {
      isFinite: false,
      reason: `Potential unbounded polymerization involving type(s): ${uniqueTypes.join(', ')}`,
      polymerizingTypes: uniqueTypes,
    };
  }

  return { isFinite: true };
}

/* ---------- Full exploration ---------- */

/**
 * Full reachability check with symmetry-reduced exploration.
 *
 * Uses the same BFS as BoundedVerifier but with effectively unlimited bounds.
 * Before starting, checks whether the contact map indicates a finite state space.
 *
 * @param model - BNGLModel
 * @param pattern - Target pattern
 * @param contactMap - Optional contact map for finiteness check
 * @returns Result with exact confidence if exploration completes, or bounded otherwise.
 */
export function fullReachabilityCheck(
  model: BNGLModel,
  pattern: string,
  contactMap?: ContactMap
): {
  reachable: boolean;
  confidence: 'exact' | 'bounded';
  witness?: { speciesIndex: number; speciesString: string; generatingRuleSequence: string[] };
  explorationComplete: boolean;
  speciesExplored: number;
  reactionsGenerated: number;
  finiteness?: { isFinite: boolean; reason?: string };
} {
  // Step 1: Check finiteness if contact map provided
  let finiteness: { isFinite: boolean; reason?: string } | undefined;
  if (contactMap) {
    finiteness = checkFiniteContactMap(contactMap);

    // If contact map says pattern is abstractly unreachable, return early
    const abstractCheck = checkAbstractReachability(
      contactMap,
      pattern,
      model.moleculeTypes
    );
    if (!abstractCheck.reachable) {
      return {
        reachable: false,
        confidence: 'exact',
        explorationComplete: true,
        speciesExplored: 0,
        reactionsGenerated: 0,
        finiteness,
      };
    }
  }

  // Step 2: Run bounded verification with very large limits
  // For finite state spaces, we set no practical limit.
  // For potentially infinite state spaces, we use a large but bounded limit.
  const isFinite = finiteness?.isFinite ?? false;
  const config: BoundedVerificationConfig = isFinite
    ? { maxSpecies: 1_000_000, maxIterations: 10_000, maxReactions: 10_000_000 }
    : { maxSpecies: 50_000, maxIterations: 500, maxReactions: 500_000 };

  const result = boundedReachabilityCheck(model, pattern, config);

  return {
    reachable: result.reachable,
    confidence: result.explorationComplete ? 'exact' : 'bounded',
    witness: result.witness,
    explorationComplete: result.explorationComplete,
    speciesExplored: result.speciesExplored,
    reactionsGenerated: result.reactionsGenerated,
    finiteness,
  };
}

/**
 * Full exploration to count all reachable species matching a molecule type.
 *
 * @param model - BNGLModel
 * @param moleculeType - Molecule type pattern to count (e.g., "A()")
 * @param contactMap - Optional contact map for finiteness check
 */
export function countReachableSpecies(
  model: BNGLModel,
  moleculeType: string,
  contactMap?: ContactMap
): {
  count: number;
  confidence: 'exact' | 'bounded';
  explorationComplete: boolean;
  speciesExplored: number;
  matchingSpecies: string[];
} {
  const targetGraph = BNGLParser.parseSpeciesGraph(moleculeType, true);

  // Determine limits
  let finiteness: { isFinite: boolean } | undefined;
  if (contactMap) {
    finiteness = checkFiniteContactMap(contactMap);
  }
  const isFinite = finiteness?.isFinite ?? false;
  const config: Required<BoundedVerificationConfig> = isFinite
    ? { maxSpecies: 1_000_000, maxIterations: 10_000, maxReactions: 10_000_000 }
    : { maxSpecies: 50_000, maxIterations: 500, maxReactions: 500_000 };

  // Run full expansion and collect matches
  const rules = (model.reactionRules || []).map(rule => ({
    name: rule.name || '(unnamed)',
    reactantPatterns: rule.reactants.map(r => BNGLParser.parseSpeciesGraph(r, true)),
    productPatterns: rule.products.map(p => BNGLParser.parseSpeciesGraph(p, true)),
    isBidirectional: rule.isBidirectional,
  }));

  const allRules: typeof rules = [];
  for (const rule of rules) {
    allRules.push(rule);
    if (rule.isBidirectional) {
      allRules.push({
        name: `${rule.name}_rev`,
        reactantPatterns: rule.productPatterns,
        productPatterns: rule.reactantPatterns,
        isBidirectional: false,
      });
    }
  }

  const speciesMap = new Map<string, SpeciesGraph>();
  const matchingSpecies: string[] = [];
  let speciesCount = 0;
  let reactionsGenerated = 0;

  // Initialize with seeds
  for (const seed of model.species) {
    const graph = BNGLParser.parseSpeciesGraph(seed.name, true);
    const canonical = GraphCanonicalizer.canonicalize(graph);
    if (!speciesMap.has(canonical)) {
      speciesMap.set(canonical, graph);
      speciesCount++;
      if (GraphMatcher.matchesPattern(targetGraph, graph)) {
        matchingSpecies.push(canonical);
      }
    }
  }

  let frontier = [...speciesMap.entries()].map(([c, m]) => ({ canonical: c, graph: m }));
  let iteration = 0;

  while (frontier.length > 0 && iteration < config.maxIterations) {
    iteration++;
    const nextFrontier: Array<{ canonical: string; graph: SpeciesGraph }> = [];

    for (const species of frontier) {
      if (speciesCount >= config.maxSpecies || reactionsGenerated >= config.maxReactions) {
        return {
          count: matchingSpecies.length,
          confidence: 'bounded',
          explorationComplete: false,
          speciesExplored: speciesCount,
          matchingSpecies,
        };
      }

      for (const rule of allRules) {
        if (rule.reactantPatterns.length === 1) {
          if (GraphMatcher.matchesPattern(rule.reactantPatterns[0], species.graph)) {
            reactionsGenerated++;
            for (const prodGraph of rule.productPatterns) {
              const canonical = GraphCanonicalizer.canonicalize(prodGraph);
              if (!speciesMap.has(canonical)) {
                speciesMap.set(canonical, prodGraph);
                speciesCount++;
                nextFrontier.push({ canonical, graph: prodGraph });
                if (GraphMatcher.matchesPattern(targetGraph, prodGraph)) {
                  matchingSpecies.push(canonical);
                }
              }
            }
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return {
    count: matchingSpecies.length,
    confidence: frontier.length === 0 ? 'exact' : 'bounded',
    explorationComplete: frontier.length === 0,
    speciesExplored: speciesCount,
    matchingSpecies,
  };
}

/**
 * Full deadlock check with symmetry reduction.
 */
export function fullDeadlockCheck(
  model: BNGLModel,
  contactMap?: ContactMap
): {
  hasDeadlock: boolean;
  confidence: 'exact' | 'bounded';
  deadlockState?: string;
  explorationComplete: boolean;
  speciesExplored: number;
} {
  let finiteness: { isFinite: boolean } | undefined;
  if (contactMap) {
    finiteness = checkFiniteContactMap(contactMap);
  }
  const isFinite = finiteness?.isFinite ?? false;
  const config: BoundedVerificationConfig = isFinite
    ? { maxSpecies: 1_000_000, maxIterations: 10_000, maxReactions: 10_000_000 }
    : { maxSpecies: 50_000, maxIterations: 500, maxReactions: 500_000 };

  const result = boundedCheckDeadlock(model, config);

  return {
    hasDeadlock: result.hasDeadlock,
    confidence: result.explorationComplete ? 'exact' : 'bounded',
    deadlockState: result.deadlockState,
    explorationComplete: result.explorationComplete,
    speciesExplored: result.speciesExplored,
  };
}
