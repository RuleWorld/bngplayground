/**
 * BoundedVerifier.ts
 * Layer 2: Bounded network exploration verification.
 *
 * Performs bounded BFS expansion of the reaction network, checking each newly
 * generated species against a target pattern. This is more precise than the
 * contact-map layer but bounded by resource limits.
 *
 * KNOWN LIMITATIONS (tracked for future refactoring):
 * - Rule application returns literal product patterns instead of transforming
 *   concrete species (limits reachability to single-step products)
 * - Deadlock check considers species types independently, not populations
 */

import type { BNGLModel, ReactionRule } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';
import { GraphCanonicalizer } from '../graph/core/Canonical';
import { GraphMatcher } from '../graph/core/Matcher';
import { SpeciesGraph } from '../graph/core/SpeciesGraph';

/* ---------- Configuration & result types ---------- */

export interface BoundedVerificationConfig {
  maxSpecies?: number;      // Default: 1000
  maxIterations?: number;   // Default: 100
  maxReactions?: number;    // Default: 10000
}

export interface BoundedVerificationResult {
  reachable: boolean;
  witness?: {
    speciesIndex: number;
    speciesString: string;
    generatingRuleSequence: string[];
  };
  explorationComplete: boolean;
  speciesExplored: number;
  reactionsGenerated: number;
}

const DEFAULT_CONFIG: Required<BoundedVerificationConfig> = {
  maxSpecies: 1000,
  maxIterations: 100,
  maxReactions: 10000,
};

/* ---------- Internal species representation ---------- */

export interface InternalSpecies {
  canonical: string;        // Canonical string form for dedup
  graph: SpeciesGraph;
  generatedBy?: string;     // Rule name that generated this species
  parentSpecies?: string[]; // Canonical forms of parents
  index: number;
}

interface ParsedRule {
  name: string;
  reactantPatterns: SpeciesGraph[];   // Each reactant is a list of molecules
  productPatterns: SpeciesGraph[];    // Each product is a list of molecules
  isBidirectional: boolean;
}

/* ---------- Rule application (bounded expansion) ---------- */

/**
 * Parse a ReactionRule from the model into our internal representation.
 */
function parseRule(rule: ReactionRule): ParsedRule {
  return {
    name: rule.name || '(unnamed)',
    reactantPatterns: rule.reactants.map(r => BNGLParser.parseSpeciesGraph(r, true)),
    productPatterns: rule.products.map(p => BNGLParser.parseSpeciesGraph(p, true)),
    isBidirectional: rule.isBidirectional,
  };
}

/**
 * Attempt to apply a unimolecular rule to a single species.
 * Returns new species strings produced, or empty array if rule doesn't match.
 */
function applyUnimolecularRule(
  rule: ParsedRule,
  species: InternalSpecies
): SpeciesGraph[] {
  if (rule.reactantPatterns.length !== 1) return [];

  const reactantPattern = rule.reactantPatterns[0];
  if (!GraphMatcher.matchesPattern(reactantPattern, species.graph)) return [];

  return rule.productPatterns;
}

/**
 * Attempt to apply a bimolecular rule to a pair of species.
 * Returns new species strings produced, or empty array if rule doesn't match.
 */
function applyBimolecularRule(
  rule: ParsedRule,
  species1: InternalSpecies,
  species2: InternalSpecies
): SpeciesGraph[] {
  if (rule.reactantPatterns.length !== 2) return [];

  const [pat1, pat2] = rule.reactantPatterns;

  // Try both orderings
  const match1 = GraphMatcher.matchesPattern(pat1, species1.graph) &&
                 GraphMatcher.matchesPattern(pat2, species2.graph);
  const match2 = GraphMatcher.matchesPattern(pat2, species1.graph) &&
                 GraphMatcher.matchesPattern(pat1, species2.graph);

  if (!match1 && !match2) return [];

  return rule.productPatterns;
}

/**
 * Build the list of all rules including reverse directions for bidirectional rules.
 */
function buildAllRules(rules: ParsedRule[]): ParsedRule[] {
  const allRules: ParsedRule[] = [];
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
  return allRules;
}

/**
 * Initialize the species map from model seed species.
 */
function initializeSpecies(model: BNGLModel): {
  speciesMap: Map<string, InternalSpecies>;
  speciesCount: number;
} {
  const speciesMap = new Map<string, InternalSpecies>();
  let speciesCount = 0;

  for (const seed of model.species) {
    const graph = BNGLParser.parseSpeciesGraph(seed.name, true);
    const canonical = GraphCanonicalizer.canonicalize(graph);
    if (!speciesMap.has(canonical)) {
      speciesMap.set(canonical, {
        canonical,
        graph,
        index: speciesCount++,
      });
    }
  }

  return { speciesMap, speciesCount };
}

/* ---------- Public API ---------- */

/**
 * Performs a bounded state-space reachability analysis using Layer 2 bounded network exploration.
 *
 * This function explores the reaction network starting from the model's initial seed species by
 * iteratively applying reaction rules (both unimolecular and bimolecular) in a Breadth-First Search
 * (BFS) manner. It tests whether any of the generated species match the user-defined target pattern.
 *
 * Key behaviors of the exploration loop:
 * 1. Parses the target pattern and model's reaction rules into graph representations.
 * 2. Checks if any of the initial seed species already match the target pattern. If so, returns
 *    immediately with a seed-level success witness.
 * 3. Iteratively applies the reaction rules to the active frontier of species:
 *    - Unimolecular rules are applied individually to each species.
 *    - Bimolecular rules are applied to all possible pairs of currently discovered species.
 * 4. Limits network expansion using the provided configuration parameter threshold bounds (`maxSpecies`,
 *    `maxIterations`, and `maxReactions`) to prevent excessive memory and CPU usage on infinite or
 *    extremely large state spaces.
 * 5. If the target pattern matches any newly generated species, it stops immediately and traces
 *    the sequential rule application path from seed species to the matching species to build the witness.
 *
 * **Non-obvious Invariant**:
 * This function remains completely browser-API-free, making zero assumptions about DOM, web contexts,
 * or global window attributes, which is essential for execution inside headless services and background Web Workers.
 *
 * @param model - The BNGLModel object containing the list of seed species and reaction rules.
 * @param pattern - The target query pattern string to look for.
 * @param config - Optional configuration object to customize the search bounds (`maxSpecies`, `maxIterations`, `maxReactions`).
 * @returns A structured result of type {@link BoundedVerificationResult}:
 *  - `reachable`: Boolean indicating whether the target pattern was successfully reached.
 *  - `witness`: (Optional) If reachable, provides details of the target species, its internal species index,
 *    and the sequence of rule names that generated it from the seeds.
 *  - `explorationComplete`: Boolean indicating whether the state-space exploration finished completely
 *    without hitting any of the configuration bounds (meaning the entire state space is finite and fully mapped).
 *  - `speciesExplored`: Total count of unique species discovered and registered during search.
 *  - `reactionsGenerated`: Total count of reaction rule applications that occurred during the search.
 */
export function boundedReachabilityCheck(
  model: BNGLModel,
  pattern: string,
  config: BoundedVerificationConfig = {}
): BoundedVerificationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const targetGraph = BNGLParser.parseSpeciesGraph(pattern, true);

  const rules = (model.reactionRules || []).map(parseRule);
  const allRules = buildAllRules(rules);

  // Initialize with seed species
  const { speciesMap, speciesCount: initialCount } = initializeSpecies(model);
  let speciesCount = initialCount;
  let reactionsGenerated = 0;

  // Check if any seed matches target
  for (const sp of speciesMap.values()) {
    if (GraphMatcher.matchesPattern(targetGraph, sp.graph)) {
      return {
        reachable: true,
        witness: {
          speciesIndex: sp.index,
          speciesString: sp.canonical,
          generatingRuleSequence: ['(seed species)'],
        },
        explorationComplete: false,
        speciesExplored: speciesCount,
        reactionsGenerated: 0,
      };
    }
  }

  // BFS expansion
  let frontier = [...speciesMap.values()];
  let iteration = 0;

  while (frontier.length > 0 && iteration < cfg.maxIterations) {
    iteration++;
    const nextFrontier: InternalSpecies[] = [];

    for (const species of frontier) {
      if (speciesCount >= cfg.maxSpecies || reactionsGenerated >= cfg.maxReactions) {
        return {
          reachable: false,
          explorationComplete: false,
          speciesExplored: speciesCount,
          reactionsGenerated,
        };
      }

      // Try unimolecular rules
      for (const rule of allRules) {
        if (rule.reactantPatterns.length === 1) {
          const products = applyUnimolecularRule(rule, species);
          if (products.length > 0) {
            reactionsGenerated++;
            for (const prodGraph of products) {
              const canonical = GraphCanonicalizer.canonicalize(prodGraph);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  graph: prodGraph,
                  generatedBy: rule.name,
                  parentSpecies: [species.canonical],
                  index: speciesCount++,
                };
                speciesMap.set(canonical, newSp);
                nextFrontier.push(newSp);

                if (GraphMatcher.matchesPattern(targetGraph, prodGraph)) {
                  return {
                    reachable: true,
                    witness: {
                      speciesIndex: newSp.index,
                      speciesString: canonical,
                      generatingRuleSequence: traceRuleSequence(speciesMap, newSp),
                    },
                    explorationComplete: false,
                    speciesExplored: speciesCount,
                    reactionsGenerated,
                  };
                }
              }
            }
          }
        }
      }

      // Try bimolecular rules (pair with all existing species)
      for (const rule of allRules) {
        if (rule.reactantPatterns.length === 2) {
          for (const other of speciesMap.values()) {
            if (reactionsGenerated >= cfg.maxReactions) break;

            const products = applyBimolecularRule(rule, species, other);
            if (products.length > 0) {
              reactionsGenerated++;
              for (const prodGraph of products) {
                const canonical = GraphCanonicalizer.canonicalize(prodGraph);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    graph: prodGraph,
                    generatedBy: rule.name,
                    parentSpecies: [species.canonical, other.canonical],
                    index: speciesCount++,
                  };
                  speciesMap.set(canonical, newSp);
                  nextFrontier.push(newSp);

                  if (GraphMatcher.matchesPattern(targetGraph, prodGraph)) {
                    return {
                      reachable: true,
                      witness: {
                        speciesIndex: newSp.index,
                        speciesString: canonical,
                        generatingRuleSequence: traceRuleSequence(speciesMap, newSp),
                      },
                      explorationComplete: false,
                      speciesExplored: speciesCount,
                      reactionsGenerated,
                    };
                  }
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
    reachable: false,
    explorationComplete: frontier.length === 0,
    speciesExplored: speciesCount,
    reactionsGenerated,
  };
}

/**
 * Trace back the rule sequence that generated a species.
 */
function traceRuleSequence(
  speciesMap: Map<string, InternalSpecies>,
  target: InternalSpecies
): string[] {
  const sequence: string[] = [];
  let current: InternalSpecies | undefined = target;
  const visited = new Set<string>();

  while (current && current.generatedBy && !visited.has(current.canonical)) {
    visited.add(current.canonical);
    sequence.unshift(current.generatedBy);
    if (current.parentSpecies && current.parentSpecies.length > 0) {
      current = speciesMap.get(current.parentSpecies[0]);
    } else {
      break;
    }
  }

  if (sequence.length === 0) {
    sequence.push('(seed species)');
  }

  return sequence;
}

/**
 * Check if the model can reach a deadlock state (a state where no rules are applicable).
 */
export function checkDeadlock(
  model: BNGLModel,
  config: BoundedVerificationConfig = {}
): {
  hasDeadlock: boolean;
  deadlockState?: string;
  explorationComplete: boolean;
  speciesExplored: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rules = (model.reactionRules || []).map(parseRule);
  const allRules = buildAllRules(rules);

  const { speciesMap, speciesCount: initialCount } = initializeSpecies(model);
  let speciesCount = initialCount;

  let frontier = [...speciesMap.values()];
  let iteration = 0;
  let reactionsGenerated = 0;

  while (frontier.length > 0 && iteration < cfg.maxIterations) {
    iteration++;
    const nextFrontier: InternalSpecies[] = [];
    const allSpeciesList = [...speciesMap.values()];

    // Check deadlock: can any rule fire on any species or pair?
    let anyRuleFires = false;
    for (const rule of allRules) {
      if (anyRuleFires) break;
      if (rule.reactantPatterns.length === 1) {
        for (const sp of allSpeciesList) {
          if (GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp.graph)) {
            anyRuleFires = true;
            break;
          }
        }
      } else if (rule.reactantPatterns.length === 2) {
        for (const sp1 of allSpeciesList) {
          if (anyRuleFires) break;
          for (const sp2 of allSpeciesList) {
            const match1 = GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp1.graph) &&
                           GraphMatcher.matchesPattern(rule.reactantPatterns[1], sp2.graph);
            const match2 = GraphMatcher.matchesPattern(rule.reactantPatterns[1], sp1.graph) &&
                           GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp2.graph);
            if (match1 || match2) {
              anyRuleFires = true;
              break;
            }
          }
        }
      }
    }

    if (!anyRuleFires) {
      const stateStr = allSpeciesList.map(s => s.canonical).sort().join(' + ');
      return {
        hasDeadlock: true,
        deadlockState: stateStr,
        explorationComplete: false,
        speciesExplored: speciesCount,
      };
    }

    // Expand frontier
    for (const species of frontier) {
      if (speciesCount >= cfg.maxSpecies || reactionsGenerated >= cfg.maxReactions) {
        return {
          hasDeadlock: false,
          explorationComplete: false,
          speciesExplored: speciesCount,
        };
      }

      for (const rule of allRules) {
        if (rule.reactantPatterns.length === 1) {
          const products = applyUnimolecularRule(rule, species);
          if (products.length > 0) {
            reactionsGenerated++;
            for (const prodGraph of products) {
              const canonical = GraphCanonicalizer.canonicalize(prodGraph);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  graph: prodGraph,
                  generatedBy: rule.name,
                  index: speciesCount++,
                };
                speciesMap.set(canonical, newSp);
                nextFrontier.push(newSp);
              }
            }
          }
        } else if (rule.reactantPatterns.length === 2) {
          for (const other of [...speciesMap.values()]) {
            if (reactionsGenerated >= cfg.maxReactions) break;
            const products = applyBimolecularRule(rule, species, other);
            if (products.length > 0) {
              reactionsGenerated++;
              for (const prodGraph of products) {
                const canonical = GraphCanonicalizer.canonicalize(prodGraph);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    graph: prodGraph,
                    generatedBy: rule.name,
                    index: speciesCount++,
                  };
                  speciesMap.set(canonical, newSp);
                  nextFrontier.push(newSp);
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
    hasDeadlock: false,
    explorationComplete: frontier.length === 0,
    speciesExplored: speciesCount,
  };
}

/**
 * Check if a named rule fires within bounded exploration.
 */
export function checkRuleFires(
  model: BNGLModel,
  ruleName: string,
  config: BoundedVerificationConfig = {}
): {
  fires: boolean;
  matchingSpecies?: string[];
  explorationComplete: boolean;
  speciesExplored: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rules = (model.reactionRules || []).map(parseRule);

  // Find the target rule
  const targetRule = rules.find(r => r.name === ruleName);
  if (!targetRule) {
    return {
      fires: false,
      explorationComplete: true,
      speciesExplored: 0,
    };
  }

  const allRules = buildAllRules(rules);

  const { speciesMap, speciesCount: initialCount } = initializeSpecies(model);
  let speciesCount = initialCount;
  let reactionsGenerated = 0;

  // Check if target rule fires on initial species
  const fireResult = doesRuleFire(targetRule, [...speciesMap.values()]);
  if (fireResult) {
    return {
      fires: true,
      matchingSpecies: fireResult,
      explorationComplete: false,
      speciesExplored: speciesCount,
    };
  }

  // BFS expansion
  let frontier = [...speciesMap.values()];
  let iteration = 0;

  while (frontier.length > 0 && iteration < cfg.maxIterations) {
    iteration++;
    const nextFrontier: InternalSpecies[] = [];

    for (const species of frontier) {
      if (speciesCount >= cfg.maxSpecies || reactionsGenerated >= cfg.maxReactions) {
        return {
          fires: false,
          explorationComplete: false,
          speciesExplored: speciesCount,
        };
      }

      for (const rule of allRules) {
        if (rule.reactantPatterns.length === 1) {
          const products = applyUnimolecularRule(rule, species);
          if (products.length > 0) {
            reactionsGenerated++;
            for (const prodGraph of products) {
              const canonical = GraphCanonicalizer.canonicalize(prodGraph);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  graph: prodGraph,
                  generatedBy: rule.name,
                  index: speciesCount++,
                };
                speciesMap.set(canonical, newSp);
                nextFrontier.push(newSp);
              }
            }
          }
        } else if (rule.reactantPatterns.length === 2) {
          for (const other of [...speciesMap.values()]) {
            if (reactionsGenerated >= cfg.maxReactions) break;
            const products = applyBimolecularRule(rule, species, other);
            if (products.length > 0) {
              reactionsGenerated++;
              for (const prodGraph of products) {
                const canonical = GraphCanonicalizer.canonicalize(prodGraph);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    graph: prodGraph,
                    generatedBy: rule.name,
                    index: speciesCount++,
                  };
                  speciesMap.set(canonical, newSp);
                  nextFrontier.push(newSp);
                }
              }
            }
          }
        }
      }
    }

    frontier = nextFrontier;

    // Check after each iteration if target rule can now fire
    const result = doesRuleFire(targetRule, [...speciesMap.values()]);
    if (result) {
      return {
        fires: true,
        matchingSpecies: result,
        explorationComplete: false,
        speciesExplored: speciesCount,
      };
    }
  }

  return {
    fires: false,
    explorationComplete: frontier.length === 0,
    speciesExplored: speciesCount,
  };
}

/**
 * Check if a rule can fire given the current set of species.
 * Returns the matching species canonicals if it fires, null otherwise.
 */
function doesRuleFire(
  rule: ParsedRule,
  allSpecies: InternalSpecies[]
): string[] | null {
  if (rule.reactantPatterns.length === 1) {
    for (const sp of allSpecies) {
      if (GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp.graph)) {
        return [sp.canonical];
      }
    }
  } else if (rule.reactantPatterns.length === 2) {
    for (const sp1 of allSpecies) {
      for (const sp2 of allSpecies) {
        const match1 = GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp1.graph) &&
                        GraphMatcher.matchesPattern(rule.reactantPatterns[1], sp2.graph);
        const match2 = GraphMatcher.matchesPattern(rule.reactantPatterns[1], sp1.graph) &&
                        GraphMatcher.matchesPattern(rule.reactantPatterns[0], sp2.graph);
        if (match1 || match2) {
          return sp1.canonical === sp2.canonical
            ? [sp1.canonical]
            : [sp1.canonical, sp2.canonical];
        }
      }
    }
  }
  return null;
}
