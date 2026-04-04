/**
 * BoundedVerifier.ts
 * Layer 2: Bounded network exploration verification.
 *
 * Performs bounded BFS expansion of the reaction network, checking each newly
 * generated species against a target pattern. This is more precise than the
 * contact-map layer but bounded by resource limits.
 *
 * KNOWN LIMITATIONS (tracked for future refactoring):
 * - Uses hand-rolled species parsing instead of BNGLParser.parseSpeciesGraph()
 * - Uses sort-based canonicalization instead of GraphCanonicalizer (may be incorrect
 *   for symmetric species with automorphisms)
 * - Pattern matching doesn't use GraphMatcher subgraph isomorphism
 * - Rule application returns literal product patterns instead of transforming
 *   concrete species (limits reachability to single-step products)
 * - Deadlock check considers species types independently, not populations
 *
 * TODO: Refactor to use BNGLParser + GraphCanonicalizer + GraphMatcher from
 * packages/engine/src/services/graph/core/ for correctness on symmetric models.
 */

import type { BNGLModel, ReactionRule, BNGLSpecies, BNGLMoleculeType } from '../../types';
import {
  parseSpeciesString,
  canonicalizeSpecies,
  speciesMatchesPattern,
  type ParsedMolecule,
  type ParsedComponent,
} from './PatternMatcher';

// Re-export pattern matching utilities so the public API is preserved
export {
  parseSpeciesString,
  canonicalizeSpecies,
  speciesMatchesPattern,
  type ParsedMolecule,
  type ParsedComponent,
} from './PatternMatcher';

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
  molecules: ParsedMolecule[];
  generatedBy?: string;     // Rule name that generated this species
  parentSpecies?: string[]; // Canonical forms of parents
  index: number;
}

interface ParsedRule {
  name: string;
  reactantPatterns: ParsedMolecule[][];   // Each reactant is a list of molecules
  productPatterns: ParsedMolecule[][];    // Each product is a list of molecules
  isBidirectional: boolean;
}

/* ---------- Rule application (bounded expansion) ---------- */

/**
 * Parse a ReactionRule from the model into our internal representation.
 */
function parseRule(rule: ReactionRule): ParsedRule {
  return {
    name: rule.name || '(unnamed)',
    reactantPatterns: rule.reactants.map(r => parseSpeciesString(r)),
    productPatterns: rule.products.map(p => parseSpeciesString(p)),
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
): ParsedMolecule[][] {
  if (rule.reactantPatterns.length !== 1) return [];

  const reactantPattern = rule.reactantPatterns[0];
  if (!speciesMatchesPattern(species.molecules, reactantPattern)) return [];

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
): ParsedMolecule[][] {
  if (rule.reactantPatterns.length !== 2) return [];

  const [pat1, pat2] = rule.reactantPatterns;

  // Try both orderings
  const match1 = speciesMatchesPattern(species1.molecules, pat1) &&
                  speciesMatchesPattern(species2.molecules, pat2);
  const match2 = speciesMatchesPattern(species1.molecules, pat2) &&
                  speciesMatchesPattern(species2.molecules, pat1);

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
    const molecules = parseSpeciesString(seed.name);
    const canonical = canonicalizeSpecies(molecules);
    if (!speciesMap.has(canonical)) {
      speciesMap.set(canonical, {
        canonical,
        molecules,
        index: speciesCount++,
      });
    }
  }

  return { speciesMap, speciesCount };
}

/* ---------- Public API ---------- */

/**
 * Bounded reachability check: expand the reaction network from seed species,
 * checking each new species against the target pattern.
 *
 * @param model - BNGLModel with reactionRules and species
 * @param pattern - Target pattern to search for
 * @param config - Exploration bounds
 */
export function boundedReachabilityCheck(
  model: BNGLModel,
  pattern: string,
  config: BoundedVerificationConfig = {}
): BoundedVerificationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const targetMolecules = parseSpeciesString(pattern);

  const rules = (model.reactionRules || []).map(parseRule);
  const allRules = buildAllRules(rules);

  // Initialize with seed species
  const { speciesMap, speciesCount: initialCount } = initializeSpecies(model);
  let speciesCount = initialCount;
  let reactionsGenerated = 0;

  // Check if any seed matches target
  for (const sp of speciesMap.values()) {
    if (speciesMatchesPattern(sp.molecules, targetMolecules)) {
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
            for (const prodMols of products) {
              const canonical = canonicalizeSpecies(prodMols);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  molecules: prodMols,
                  generatedBy: rule.name,
                  parentSpecies: [species.canonical],
                  index: speciesCount++,
                };
                speciesMap.set(canonical, newSp);
                nextFrontier.push(newSp);

                if (speciesMatchesPattern(prodMols, targetMolecules)) {
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
              for (const prodMols of products) {
                const canonical = canonicalizeSpecies(prodMols);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    molecules: prodMols,
                    generatedBy: rule.name,
                    parentSpecies: [species.canonical, other.canonical],
                    index: speciesCount++,
                  };
                  speciesMap.set(canonical, newSp);
                  nextFrontier.push(newSp);

                  if (speciesMatchesPattern(prodMols, targetMolecules)) {
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
          if (speciesMatchesPattern(sp.molecules, rule.reactantPatterns[0])) {
            anyRuleFires = true;
            break;
          }
        }
      } else if (rule.reactantPatterns.length === 2) {
        for (const sp1 of allSpeciesList) {
          if (anyRuleFires) break;
          for (const sp2 of allSpeciesList) {
            const match1 = speciesMatchesPattern(sp1.molecules, rule.reactantPatterns[0]) &&
                           speciesMatchesPattern(sp2.molecules, rule.reactantPatterns[1]);
            const match2 = speciesMatchesPattern(sp1.molecules, rule.reactantPatterns[1]) &&
                           speciesMatchesPattern(sp2.molecules, rule.reactantPatterns[0]);
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
            for (const prodMols of products) {
              const canonical = canonicalizeSpecies(prodMols);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  molecules: prodMols,
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
              for (const prodMols of products) {
                const canonical = canonicalizeSpecies(prodMols);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    molecules: prodMols,
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
            for (const prodMols of products) {
              const canonical = canonicalizeSpecies(prodMols);
              if (!speciesMap.has(canonical)) {
                const newSp: InternalSpecies = {
                  canonical,
                  molecules: prodMols,
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
              for (const prodMols of products) {
                const canonical = canonicalizeSpecies(prodMols);
                if (!speciesMap.has(canonical)) {
                  const newSp: InternalSpecies = {
                    canonical,
                    molecules: prodMols,
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
      if (speciesMatchesPattern(sp.molecules, rule.reactantPatterns[0])) {
        return [sp.canonical];
      }
    }
  } else if (rule.reactantPatterns.length === 2) {
    for (const sp1 of allSpecies) {
      for (const sp2 of allSpecies) {
        const match1 = speciesMatchesPattern(sp1.molecules, rule.reactantPatterns[0]) &&
                        speciesMatchesPattern(sp2.molecules, rule.reactantPatterns[1]);
        const match2 = speciesMatchesPattern(sp1.molecules, rule.reactantPatterns[1]) &&
                        speciesMatchesPattern(sp2.molecules, rule.reactantPatterns[0]);
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
