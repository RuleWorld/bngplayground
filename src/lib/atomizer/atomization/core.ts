/**
 * Atomization Core Logic
 * Complete TypeScript port of atomizer core algorithms
 * 
 * This module contains:
 * - Dependency graph construction and resolution
 * - Naming convention analysis (detectOntology.py)
 * - Species Composition Table (SCT) building
 * - Molecular structure inference
 */

import { Species, Molecule, Component, Databases, readFromString } from '../core/structures';
import {
  SBMLModel,
  SBMLReaction,
  SBMLSpecies,
  NamingConventions,
  DEFAULT_NAMING_CONVENTIONS,
  ReactionDefinitions,
  DEFAULT_REACTION_DEFINITIONS,
  SCTEntry,
  SpeciesCompositionTable,
  BiologicalQualifier,
  SeedSpeciesEntry,
} from '../config/types';
import {
  levenshtein,
  similarity,
  longestCommonSubstring,
  Counter,
  DefaultDict,
  deepCopy,
  standardizeName,
  logger,
  pmemoize,
  CycleError,
  BindingException,
} from '../utils/helpers';
import { getAnnotationsByQualifier, extractUniProtIds } from '../parser/sbmlParser';

const DEP_CYCLE_LOG_LIMIT = Number(
  (typeof process !== 'undefined' && process.env?.ATOMIZER_DEP_CYCLE_LOG_LIMIT) || '20'
);
let depCycleLogCount = 0;

const logDependencyCycle = (message: string): void => {
  if (DEP_CYCLE_LOG_LIMIT < 0 || depCycleLogCount < DEP_CYCLE_LOG_LIMIT) {
    logger.warning('DEP001', message);
  } else if (depCycleLogCount === DEP_CYCLE_LOG_LIMIT) {
    logger.warning('DEP001', 'Additional dependency cycle logs suppressed.');
  }
  depCycleLogCount += 1;
};

// =============================================================================
// Dependency Graph
// =============================================================================

/**
 * Add a value to the dependency graph
 */
export function addToDependencyGraph(
  dependencyGraph: Map<string, string[]>,
  label: string,
  value: string | string[]
): void {
  if (!dependencyGraph.has(label)) {
    dependencyGraph.set(label, []);
  }
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (v && !dependencyGraph.get(label)!.includes(v)) {
      dependencyGraph.get(label)!.push(v);
    }
  }
}

/**
 * Topological sort of species based on dependencies
 * Returns species in order from elemental (no dependencies) to complex
 */
export function topologicalSort(
  speciesIds: string[],
  dependencies: Map<string, Set<string>>
): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string, path: string[] = []): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      logDependencyCycle(`Dependency cycle detected: ${path.join(' -> ')} -> ${id}`);
      return;
    }

    visiting.add(id);
    path.push(id);

    const deps = dependencies.get(id);
    if (deps) {
      for (const dep of deps) {
        if (speciesIds.includes(dep)) {
          visit(dep, [...path]);
        }
      }
    }

    visiting.delete(id);
    visited.add(id);
    sorted.push(id);
  }

  for (const id of speciesIds) {
    visit(id);
  }

  return sorted;
}

/**
 * Compute weights (complexity) for each species
 * Weight = 1 + sum of weights of components
 */
export function computeWeights(
  speciesIds: string[],
  dependencies: Map<string, Set<string>>
): Map<string, number> {
  const weights = new Map<string, number>();
  const sorted = topologicalSort(speciesIds, dependencies);

  for (const id of sorted) {
    const deps = dependencies.get(id);
    if (!deps || deps.size === 0) {
      weights.set(id, 1);
    } else {
      let weight = 1;
      for (const dep of deps) {
        weight += weights.get(dep) || 1;
      }
      weights.set(id, weight);
    }
  }

  return weights;
}

// =============================================================================
// Naming Convention Analysis (detectOntology.py port)
// =============================================================================

/**
 * Compute pairwise edit distance matrix for species names
 */
export function defineEditDistanceMatrix(
  speciesNames: string[],
  similarityThreshold: number = 4
): {
  matrix: number[][];
  pairs: [string, string][];
  differences: string[][];
} {
  const n = speciesNames.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  const pairs: [string, string][] = [];
  const differences: string[][] = [];

  for (let i = 0; i < n; i++) {
    const s1 = speciesNames[i];
    for (let j = i + 1; j < n; j++) {
      const s2 = speciesNames[j];

      // Optimization: If length difference > threshold, distance must be > threshold
      if (Math.abs(s1.length - s2.length) > similarityThreshold) {
        continue;
      }

      const dist = levenshtein(s1, s2);
      matrix[i][j] = dist;
      matrix[j][i] = dist;

      if (dist <= similarityThreshold && dist > 0) {
        const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1];
        pairs.push([shorter, longer]);
        differences.push(getDifferences(shorter, longer));
      }
    }
  }

  return { matrix, pairs, differences };
}

/**
 * Get character-level differences between two strings
 */
export function getDifferences(shorter: string, longer: string): string[] {
  const differences: string[] = [];
  let i = 0, j = 0;

  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      // Character added in longer string
      if (longer.slice(j).includes(shorter[i])) {
        differences.push(`+ ${longer[j]}`);
        j++;
      } else {
        // Character in shorter doesn't exist in longer
        differences.push(`- ${shorter[i]}`);
        i++;
      }
    }
  }

  // Remaining characters in longer string
  while (j < longer.length) {
    differences.push(`+ ${longer[j]}`);
    j++;
  }

  return differences;
}

/**
 * Find the longest common substring between two species names
 */
export function findLongestSubstring(speciesA: string, speciesB: string): string {
  return longestCommonSubstring(speciesA, speciesB);
}

/**
 * Analyze naming conventions in species names
 */
export function analyzeNamingConventions(
  speciesNames: string[],
  conventions: NamingConventions = DEFAULT_NAMING_CONVENTIONS,
  similarityThreshold: number = 4
): {
  pairClassification: Map<string, [string, string][]>;
  keys: string[];
  patterns: Map<string, string>;
} {
  const { pairs, differences } = defineEditDistanceMatrix(speciesNames, similarityThreshold);

  const pairClassification = new Map<string, [string, string][]>();
  const differenceCounter = new Counter<string>();

  for (const diff of differences) {
    const key = JSON.stringify(diff);
    differenceCounter.update([key]);
  }

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const diff = differences[i];
    const diffKey = JSON.stringify(diff);

    const modification = conventions.patterns.get(diffKey);
    if (modification) {
      if (!pairClassification.has(modification)) {
        pairClassification.set(modification, []);
      }
      pairClassification.get(modification)!.push(pair);
    }
  }

  const keys = Array.from(differenceCounter.keys());

  logger.info('NAM001',
    `Naming analysis: ${pairs.length} similar pairs, ${pairClassification.size} classifications`);

  return { pairClassification, keys, patterns: conventions.patterns };
}

/**
 * Infer modification type from species name pair
 */
export function inferModification(
  speciesName: string,
  baseSpecies: string[],
  conventions: NamingConventions = DEFAULT_NAMING_CONVENTIONS
): { base: string | null; modification: string | null; confidence: number } {
  const candidates = baseSpecies.filter(s => s.length < speciesName.length);

  if (candidates.length === 0) {
    return { base: null, modification: null, confidence: 0 };
  }

  let bestMatch = { base: '', modification: '', confidence: 0 };

  for (const candidate of candidates) {
    const diff = getDifferences(candidate, speciesName);
    const diffKey = JSON.stringify(diff);

    const modification = conventions.patterns.get(diffKey);
    if (modification) {
      const confidence = similarity(candidate, speciesName);
      if (confidence > bestMatch.confidence) {
        bestMatch = { base: candidate, modification, confidence };
      }
    }
  }

  if (bestMatch.confidence > 0) {
    return bestMatch;
  }

  // Fall back to longest common substring
  for (const candidate of candidates) {
    const lcs = longestCommonSubstring(candidate, speciesName);
    const sim = lcs.length / Math.max(candidate.length, speciesName.length);

    if (sim > bestMatch.confidence && sim > 0.5) {
      // Try to infer modification from suffix
      const suffix = speciesName.slice(candidate.length);
      let modification: string | null = null;

      if (/^_?[pP]+$/.test(suffix)) {
        modification = suffix.replace(/_/g, '').length > 1 ? 'Double-Phosphorylation' : 'Phosphorylation';
      } else if (/^_?[aA]ct?$/.test(suffix)) {
        modification = 'Activation';
      } else if (/^_?[uU]b?$/.test(suffix)) {
        modification = 'Ubiquitination';
      } else if (suffix.startsWith('_')) {
        modification = 'Binding';
      }

      if (modification) {
        bestMatch = { base: candidate, modification, confidence: sim };
      }
    }
  }

  return bestMatch.confidence > 0
    ? bestMatch
    : { base: null, modification: null, confidence: 0 };
}

// =============================================================================
// Reaction Analysis
// =============================================================================

export interface ReactionPattern {
  type: 'binding' | 'unbinding' | 'modification' | 'synthesis' | 'degradation' | 'transformation' | 'catalysis';
  reactants: string[];
  products: string[];
  modifiers: string[];
  catalyst?: string;
}

/**
 * Check if a kinetic law uses saturation kinetics (Sat/MM/Hill)
 * Looks for patterns like: (k * S * E) / (K + E) or (kmax * S) / (Km + S)
 */
function hasSatRateLaw(reaction: SBMLReaction): boolean {
  if (!reaction.kineticLaw || !reaction.kineticLaw.math) {
    return false;
  }

  const mathLower = reaction.kineticLaw.math.toLowerCase();

  if (mathLower.includes('sat') || mathLower.includes('mm') || mathLower.includes('hill')) {
    return true;
  }

  const dividePattern = mathLower.match(/\//g);
  if (dividePattern && dividePattern.length >= 1) {
    const plusPattern = mathLower.match(/\+/g);
    if (plusPattern && plusPattern.length >= 1) {
      const timesPattern = mathLower.match(/\*/g);
      if (timesPattern && timesPattern.length >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Classify a reaction based on stoichiometry and rate law
 */
export function classifyReaction(reaction: SBMLReaction): ReactionPattern {
  const reactantIds = reaction.reactants.map(r => r.species).filter(s => s !== 'EmptySet');
  const productIds = reaction.products.map(p => p.species).filter(s => s !== 'EmptySet');
  const modifierIds = reaction.modifiers.map(m => m.species);

  const numReactants = reactantIds.length;
  const numProducts = productIds.length;

  // Synthesis: 0 → A
  if (numReactants === 0 && numProducts >= 1) {
    return {
      type: 'synthesis',
      reactants: [],
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Degradation: A → 0
  if (numReactants >= 1 && numProducts === 0) {
    return {
      type: 'degradation',
      reactants: reactantIds,
      products: [],
      modifiers: modifierIds,
    };
  }

  // Catalysis (Sat/MM/Hill): A + B -> B where A catalyzes B production/consumption
  // Pattern: A + B -> B with Sat(k, K) rate law (B is unchanged catalyst/substrate)
  if (numReactants === 2 && numProducts === 1) {
    const commonSpecies = reactantIds.filter(r => productIds.includes(r));
    if (commonSpecies.length === 1 && hasSatRateLaw(reaction)) {
      const catalyst = commonSpecies[0];
      const substrate = reactantIds.find(r => r !== catalyst)!;
      return {
        type: 'catalysis',
        reactants: [substrate],
        products: [substrate],
        modifiers: [catalyst, ...modifierIds],
        catalyst: catalyst,
      };
    }
  }

  // Binding: A + B → C
  if (numReactants === 2 && numProducts === 1) {
    return {
      type: 'binding',
      reactants: reactantIds,
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Complex binding: A + B + C → D
  if (numReactants > 2 && numProducts === 1) {
    return {
      type: 'binding',
      reactants: reactantIds,
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Catalysis / Synthesis: E -> E + P (enzyme catalyzes its own production)
  // Pattern: 1 reactant, 2+ products where reactant is also a product
  if (numReactants === 1 && numProducts >= 2) {
    const commonSpecies = reactantIds.filter(r => productIds.includes(r));
    if (commonSpecies.length === 1) {
      return {
        type: 'synthesis',
        reactants: [],
        products: productIds.filter(p => !commonSpecies.includes(p)),
        modifiers: [commonSpecies[0], ...modifierIds],
        catalyst: commonSpecies[0],
      };
    }
  }

  // Unbinding: C → A + B
  if (numReactants === 1 && numProducts === 2) {
    return {
      type: 'unbinding',
      reactants: reactantIds,
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Complex unbinding: D → A + B + C
  if (numReactants === 1 && numProducts > 2) {
    return {
      type: 'unbinding',
      reactants: reactantIds,
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Modification: A → A'
  if (numReactants === 1 && numProducts === 1) {
    return {
      type: 'modification',
      reactants: reactantIds,
      products: productIds,
      modifiers: modifierIds,
    };
  }

  // Catalysis: A + E → A' + E (enzyme unchanged)
  if (numReactants === 2 && numProducts === 2) {
    // Check if one species is unchanged (catalyst)
    const commonSpecies = reactantIds.filter(r => productIds.includes(r));
    if (commonSpecies.length === 1) {
      return {
        type: 'catalysis',
        reactants: reactantIds.filter(r => !commonSpecies.includes(r)),
        products: productIds.filter(p => !commonSpecies.includes(p)),
        modifiers: modifierIds,
        catalyst: commonSpecies[0],
      };
    }
  }

  // Catalysis / Synthesis: E -> E + P
  if (numReactants === 1 && numProducts === 2) {
    const commonSpecies = reactantIds.filter(r => productIds.includes(r));
    if (commonSpecies.length === 1) {
      return {
        type: 'synthesis',
        reactants: [],
        products: productIds.filter(p => !commonSpecies.includes(p)),
        modifiers: modifierIds,
        catalyst: commonSpecies[0],
      };
    }
  }

  // General transformation
  return {
    type: 'transformation',
    reactants: reactantIds,
    products: productIds,
    modifiers: modifierIds,
  };
}

/**
 * Analyze all reactions to build dependency information
 */
export function analyzeReactions(model: SBMLModel): {
  bindingReactions: Map<string, string[]>;
  modificationReactions: Map<string, string>;
  dependencies: Map<string, Set<string>>;
  patterns: Map<string, ReactionPattern>;
} {
  const bindingReactions = new Map<string, string[]>();
  const modificationReactions = new Map<string, string>();
  const dependencies = new Map<string, Set<string>>();
  const patterns = new Map<string, ReactionPattern>();

  for (const [rxnId, reaction] of model.reactions) {
    const pattern = classifyReaction(reaction);
    patterns.set(rxnId, pattern);

    switch (pattern.type) {
      case 'binding':
        if (pattern.products.length === 1) {
          const product = pattern.products[0];
          bindingReactions.set(product, pattern.reactants);

          if (!dependencies.has(product)) {
            dependencies.set(product, new Set());
          }
          for (const reactant of pattern.reactants) {
            dependencies.get(product)!.add(reactant);
          }
        }
        break;

      case 'unbinding':
        if (pattern.reactants.length === 1) {
          const complex = pattern.reactants[0];
          const complexName = model.species.get(complex)?.name || complex;
          
          // Heuristic: only treat as binding/unbinding if the names suggest it
          const allProductsInName = pattern.products.every(p => {
              const pName = model.species.get(p)?.name || p;
              return complexName.includes(pName) || pName.includes(complexName);
          });

          if (allProductsInName) {
            if (!bindingReactions.has(complex)) {
              bindingReactions.set(complex, pattern.products);
            }
            if (!dependencies.has(complex)) {
              dependencies.set(complex, new Set());
            }
            for (const prod of pattern.products) {
              dependencies.get(complex)!.add(prod);
            }
          }
        }
        break;

      case 'modification':
      case 'catalysis':
        if (pattern.reactants.length >= 1 && pattern.products.length >= 1) {
          const baseSpecies = pattern.reactants[0];
          const modifiedSpecies = pattern.products[0];

          const baseName = model.species.get(baseSpecies)?.name || baseSpecies;
          const modifiedName = model.species.get(modifiedSpecies)?.name || modifiedSpecies;

          // Check if names suggest modification relationship
          if (modifiedName.includes(baseName) || modifiedName.length > baseName.length) {
            modificationReactions.set(modifiedSpecies, baseSpecies);
            if (!dependencies.has(modifiedSpecies)) {
              dependencies.set(modifiedSpecies, new Set());
            }
            dependencies.get(modifiedSpecies)!.add(baseSpecies);
          }
        }
        break;
    }
  }

  logger.info('RXN001',
    `Reaction analysis: ${bindingReactions.size} binding, ${modificationReactions.size} modification`);

  return { bindingReactions, modificationReactions, dependencies, patterns };
}

// =============================================================================
// Species Composition Table Builder
// =============================================================================

export interface SCTBuilderOptions {
  useId: boolean;
  useAnnotations: boolean;
  namingConventions: NamingConventions;
  memoizedResolver: boolean;
  atomize: boolean;
}

const DEFAULT_SCT_OPTIONS: SCTBuilderOptions = {
  useId: false,
  useAnnotations: true,
  namingConventions: DEFAULT_NAMING_CONVENTIONS,
  memoizedResolver: false,
  atomize: false,
};

/**
 * Parse compartment information from species name and apply to molecules.
 * BNG2.pl exports SBML with species names like "@PM::L(r!1,r)@EC.R(l!1)" where:
 * - @PM:: prefix indicates species compartment
 * - @EC, @PM suffixes on molecules indicate molecule compartments
 * 
 * Returns the species compartment (if any) and sets molecule compartments.
 */
function parseAndApplyCompartments(
  speciesName: string,
  species: Species
): string | undefined {
  if (!speciesName) return undefined;

  // Check for prefix notation: @Comp::Species
  const prefixMatch = speciesName.match(/^@([^:]+)::/);
  const speciesCompartment = prefixMatch ? prefixMatch[1] : undefined;

  // Parse molecule compartments from the pattern part (after prefix)
  const patternPart = prefixMatch ? speciesName.slice(prefixMatch[0].length) : speciesName;

  // Split by '.' to get individual molecules
  const moleculeStrs = patternPart.split('.');

  // Check if any molecule has a compartment suffix
  let hasSuffixCompartments = false;
  const moleculeComps: (string | undefined)[] = [];
  
  for (const molStr of moleculeStrs) {
    // Extract compartment suffix: Molecule@Comp
    const suffixMatch = molStr.match(/@([^@.]+)$/);
    if (suffixMatch) {
      hasSuffixCompartments = true;
      moleculeComps.push(suffixMatch[1]);
    } else {
      moleculeComps.push(undefined);
    }
  }

  // Apply compartments to molecules
  for (let i = 0; i < Math.min(moleculeStrs.length, species.molecules.length); i++) {
    if (moleculeComps[i]) {
      // Molecule has its own compartment suffix
      species.molecules[i].setCompartment(moleculeComps[i]!);
    } else if (speciesCompartment) {
      // Molecule inherits species-level compartment
      species.molecules[i].setCompartment(speciesCompartment);
    }
  }

  return speciesCompartment;
}

function sanitizeComponentStateToken(token: string): string {
  if (!token) return token;
  if (token === '+' || token === '?') return token;
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return token;
  return standardizeName(token);
}

/**
 * SBML names can contain punctuation that parses as BNGL component syntax
 * but is not a valid BNGL identifier (e.g., apostrophes/hyphens in metabolite names).
 * Normalize parsed tokens so generated BNGL remains syntactically valid.
 */
function sanitizeSpeciesStructureNames(species: Species): void {
  for (const mol of species.molecules) {
    mol.name = standardizeName(mol.name);
    if (mol.compartment) {
      mol.compartment = standardizeName(mol.compartment);
    }
    for (const comp of mol.components) {
      comp.name = standardizeName(comp.name);
      comp.states = comp.states.map((s) => sanitizeComponentStateToken(s));
      comp.activeState = sanitizeComponentStateToken(comp.activeState);
    }
  }
}

/**
  * Create elemental species structure
   */
function createElementalSpecies(
  sbmlSpecies: SBMLSpecies,
  useId: boolean = false
): Species {
  // Strip compartment prefix from species name (e.g., "@EC::L(r,r)" -> "L(r,r)")
  const speciesName = sbmlSpecies.name || sbmlSpecies.id;
  const nameWithoutCompartment = speciesName.replace(/^@[^:]+::/, '');
  
  // Try to parse the pattern using readFromString
  try {
    const parsedSpecies = readFromString(nameWithoutCompartment);
    if (parsedSpecies.molecules.length > 0) {
      sanitizeSpeciesStructureNames(parsedSpecies);
      // Update molecule IDs to use SBML species ID
      for (const mol of parsedSpecies.molecules) {
        mol.idx = sbmlSpecies.id;
      }
      return parsedSpecies;
    }
  } catch (e) {
    // Fall back to simple molecule creation
  }
  
  // Fallback: create simple molecule without components
  const species = new Species();
  const name = useId ? sbmlSpecies.id : standardizeName(nameWithoutCompartment);
  const molecule = new Molecule(name, sbmlSpecies.id);
  species.addMolecule(molecule);

  return species;
}

/**
 * Create complex species structure from components
 */
function createComplexSpecies(
  sbmlSpecies: SBMLSpecies,
  componentSpeciesIds: string[],
  sctEntries: Map<string, SCTEntry>,
  useId: boolean = false
): Species {
  const species = new Species();
  const compMolecules: Molecule[][] = [];

  for (let i = 0; i < componentSpeciesIds.length; i++) {
    const compId = componentSpeciesIds[i];
    const compEntry = sctEntries.get(compId);

    if (compEntry && compEntry.structure) {
      const compCopy = compEntry.structure.copy();

      // Update bonds to prevent collisions with existing molecules in the species
      compCopy.updateBonds(species.getBondNumbers());

      // Add binding sites for connectivity
      for (const mol of compCopy.molecules) {
        // Site for predecessor (connect i-1 to i)
        if (i > 0) {
          const bName = `b${i}`;
          if (!mol.contains(bName)) {
            mol.addComponent(new Component(bName, `${mol.idx}_${bName}`));
          }
        }
        // Site for successor (connect i to i+1)
        if (i < componentSpeciesIds.length - 1) {
          const bName = `b${i + 1}`;
          if (!mol.contains(bName)) {
            mol.addComponent(new Component(bName, `${mol.idx}_${bName}`));
          }
        }
      }

      compMolecules.push(compCopy.molecules);

      for (const mol of compCopy.molecules) {
        species.addMolecule(mol);
      }
    } else {
      const name = useId ? compId : standardizeName(compId);
      const molecule = new Molecule(name, compId);

      // Add sites for connectivity
      if (i > 0) {
        const bName = `b${i}`;
        molecule.addComponent(new Component(bName, `${molecule.idx}_${bName}`));
      }
      if (i < componentSpeciesIds.length - 1) {
        const bName = `b${i + 1}`;
        molecule.addComponent(new Component(bName, `${molecule.idx}_${bName}`));
      }

      compMolecules.push([molecule]);
      species.addMolecule(molecule);
    }
  }

  // Add bonds for n-ary complexes (chain connectivity)
  if (componentSpeciesIds.length > 1 && compMolecules.length >= 2) {
    for (let i = 0; i < compMolecules.length - 1; i++) {
        // Connect component i to i+1
        const mol1 = compMolecules[i][0];
        const mol2 = compMolecules[i+1][0];
        
        const bondNum = Math.max(...species.getBondNumbers(), 0) + 1;
        
        // mol1 needs site for successor (b_{i+1}), mol2 needs site for predecessor (b_{i+1})
        const bName1 = `b${i + 1}`;
        const bName2 = `b${i + 1}`;
        
        const site1 = mol1.getComponent(bName1);
        const site2 = mol2.getComponent(bName2);

        if (site1 && site2) {
            site1.addBond(bondNum);
            site2.addBond(bondNum);
            species.bonds.push([site1.idx, site2.idx]);
        }
    }
  }

  species.renumberBonds();

  return species;
}

/**
 * Create modified species structure
 */
function createModifiedSpecies(
  sbmlSpecies: SBMLSpecies,
  baseSpeciesId: string,
  modificationInfo: { type: string; confidence: number },
  sctEntries: Map<string, SCTEntry>,
  useId: boolean = false
): Species {
  const baseEntry = sctEntries.get(baseSpeciesId);

  if (!baseEntry || !baseEntry.structure) {
    return createElementalSpecies(sbmlSpecies, useId);
  }

  const species = baseEntry.structure.copy();
  const modType = modificationInfo.type;
  const molecule = species.molecules[0];

  if (molecule) {
    const existingMod = molecule.getComponent(modType.toLowerCase());

    if (existingMod) {
      existingMod.setActiveState(getModificationState(modType));
    } else {
      const modComponent = new Component(
        modType.toLowerCase(),
        `${molecule.idx}_${modType.toLowerCase()}`
      );
      modComponent.addState('0');
      modComponent.addState(getModificationState(modType));
      modComponent.setActiveState(getModificationState(modType));
      molecule.addComponent(modComponent);
    }
  }

  return species;
}

/**
 * Get state label for modification type
 */
function getModificationState(modType: string): string {
  const stateMap: Record<string, string> = {
    'Phosphorylation': 'P',
    'Double-Phosphorylation': 'PP',
    'Triple-Phosphorylation': 'PPP',
    'Dephosphorylation': '0',
    'Ubiquitination': 'Ub',
    'Deubiquitination': '0',
    'Acetylation': 'Ac',
    'Deacetylation': '0',
    'Methylation': 'Me',
    'Demethylation': '0',
    'Activation': 'A',
    'Inactivation': 'I',
    'Binding': 'bound',
    'Localization': 'loc',
    'Dimerization': 'dim',
    'Trimerization': 'trim',
  };
  return stateMap[modType] || modType.charAt(0).toUpperCase();
}

/**
 * Build the Species Composition Table from an SBML model
 */
export function buildSpeciesCompositionTable(
  model: SBMLModel,
  options: Partial<SCTBuilderOptions> = {}
): SpeciesCompositionTable {
  const opts = { ...DEFAULT_SCT_OPTIONS, ...options };

  const sct: SpeciesCompositionTable = {
    entries: new Map(),
    dependencies: new Map(),
    reverseDependencies: new Map(),
    sortedSpecies: [],
    weights: [],
  };

  const speciesIds = Array.from(model.species.keys());
  const speciesNames = speciesIds.map(id => model.species.get(id)!.name || id);

  // Analyze reactions
  const { bindingReactions, modificationReactions, dependencies } = analyzeReactions(model);

  // Analyze naming conventions
  const namingAnalysis = analyzeNamingConventions(speciesNames, opts.namingConventions);

  // Merge dependencies from reactions
  for (const [speciesId, deps] of dependencies) {
    if (!sct.dependencies.has(speciesId)) {
      sct.dependencies.set(speciesId, new Set());
    }
    for (const dep of deps) {
      sct.dependencies.get(speciesId)!.add(dep);
    }
  }

  // Add naming-based dependencies
  for (const [modification, pairs] of namingAnalysis.pairClassification) {
    for (const [baseName, derivedName] of pairs) {
      const derivedId = speciesIds.find(id => {
        const sp = model.species.get(id);
        return sp?.name === derivedName || id === derivedName;
      });
      const baseId = speciesIds.find(id => {
        const sp = model.species.get(id);
        return sp?.name === baseName || id === baseName;
      });

      if (derivedId && baseId && derivedId !== baseId) {
        if (!sct.dependencies.has(derivedId)) {
          sct.dependencies.set(derivedId, new Set());
        }
        sct.dependencies.get(derivedId)!.add(baseId);
      }
    }
  }

  // Build reverse dependencies
  for (const [species, deps] of sct.dependencies) {
    for (const dep of deps) {
      if (!sct.reverseDependencies.has(dep)) {
        sct.reverseDependencies.set(dep, new Set());
      }
      sct.reverseDependencies.get(dep)!.add(species);
    }
  }

  // Topological sort
  sct.sortedSpecies = topologicalSort(speciesIds, sct.dependencies);

  // Compute weights
  const weights = computeWeights(speciesIds, sct.dependencies);
  sct.weights = Array.from(weights.entries()).sort((a, b) => a[1] - b[1]);

  // Build SCT entries in topological order
  for (const speciesId of sct.sortedSpecies) {
    const sbmlSpecies = model.species.get(speciesId)!;
    const speciesName = sbmlSpecies.name || speciesId;
    const deps = sct.dependencies.get(speciesId);

    let structure: Species;
    let components: string[] = [];
    let isElemental = true;
    const modifications = new Map<string, string>();

    // Check if this is a pre-structured BNGL name
    const bnglStructure = (speciesName.includes('.') || speciesName.includes('(')) && speciesName.includes('!');
    
    // Check if this is a complex (from binding reactions)
    if (opts.atomize && bnglStructure) {
      isElemental = false;
      structure = readFromString(speciesName);
      // Infer components from molecules in the structure
      components = structure.getMoleculeNames();
    }
    else if (opts.atomize && bindingReactions.has(speciesId)) {
      components = bindingReactions.get(speciesId)!;
      isElemental = false;
      structure = createComplexSpecies(sbmlSpecies, components, sct.entries, opts.useId);
    }
    // Check if modified species
    else if (opts.atomize && modificationReactions.has(speciesId)) {
      const baseId = modificationReactions.get(speciesId)!;
      components = [baseId];
      isElemental = false;

      const baseSp = model.species.get(baseId);
      const baseName = baseSp?.name || baseId;
      const modInfo = inferModification(speciesName, [baseName], opts.namingConventions);

      if (modInfo.modification) {
        modifications.set('state', modInfo.modification);
      }

      structure = createModifiedSpecies(sbmlSpecies, baseId, {
        type: modInfo.modification || 'Modification',
        confidence: modInfo.confidence,
      }, sct.entries, opts.useId);
    }
    // Check naming relationships
    else if (opts.atomize && deps && deps.size > 0) {
      const depArray = Array.from(deps);
      components = depArray;
      isElemental = false;

      if (depArray.length === 1) {
        const baseId = depArray[0];
        const baseSp = model.species.get(baseId);
        const baseName = baseSp?.name || baseId;
        const modInfo = inferModification(speciesName, [baseName], opts.namingConventions);

        if (modInfo.modification) {
          modifications.set('state', modInfo.modification);
          structure = createModifiedSpecies(sbmlSpecies, baseId, {
            type: modInfo.modification,
            confidence: modInfo.confidence,
          }, sct.entries, opts.useId);
        } else {
          structure = createComplexSpecies(sbmlSpecies, depArray, sct.entries, opts.useId);
        }
      } else {
        structure = createComplexSpecies(sbmlSpecies, depArray, sct.entries, opts.useId);
      }
    }
    // Elemental species
    else {
      structure = createElementalSpecies(sbmlSpecies, opts.useId);
    }

    // Parse and apply compartment info from species name
    parseAndApplyCompartments(speciesName, structure);

    const entry: SCTEntry = {
      structure,
      components,
      bonds: [],
      sbmlId: speciesId,
      isElemental,
      modifications,
      weight: weights.get(speciesId) || 1,
    };

    sct.entries.set(speciesId, entry);
  }

  const elementalCount = Array.from(sct.entries.values()).filter(e => e.isElemental).length;
  const complexCount = sct.entries.size - elementalCount;

  // Build SCT: Built ...
  logger.info('SCT001',
    `Built SCT: ${sct.entries.size} species (${elementalCount} elemental, ${complexCount} complex)`);

  // Final reconciliation: ensure every molecule has all components of its type
  const moleculeTypes = getMoleculeTypes(sct);
  reconcileSCT(sct, moleculeTypes);

  return sct;
}

/**
 * Reconcile SCT entries with finalized molecule types.
 * Ensures every molecule instance has all components defined for its type.
 */
export function reconcileSCT(sct: SpeciesCompositionTable, moleculeTypes: Molecule[]): void {
  const typeMap = new Map<string, Molecule>();
  for (const type of moleculeTypes) {
    typeMap.set(type.name, type);
  }

  for (const entry of sct.entries.values()) {
    for (const mol of entry.structure.molecules) {
      const type = typeMap.get(mol.name);
      if (type) {
        const typeCounts = new Counter<string>(type.components.map(c => c.name));
        const molCounts = new Counter<string>(mol.components.map(c => c.name));

        for (const [name, count] of typeCounts.entries()) {
          const diff = count - (molCounts.get(name) || 0);
          if (diff > 0) {
            const template = type.components.find(c => c.name === name)!;
            for (let i = 0; i < diff; i++) {
              const newComp = template.copy();
              newComp.bonds = [];
              if (newComp.states.includes('0')) {
                newComp.setActiveState('0');
              } else if (newComp.states.length > 0) {
                newComp.setActiveState(newComp.states[0]);
              } else {
                newComp.setActiveState('');
              }
              mol.addComponent(newComp);
            }
          }
        }
      }
    }
  }
}

/**
 * Get all molecule types from the SCT
 */
export function getMoleculeTypes(sct: SpeciesCompositionTable): Molecule[] {
  const moleculeTypes = new Map<string, Molecule>();

  for (const [_, entry] of sct.entries) {
    // If not atomizing, every species is its own molecule type (or composed of them)
    // If atomizing, only elemental entries define molecule types
    for (const mol of entry.structure.molecules) {
      if (!moleculeTypes.has(mol.name)) {
        moleculeTypes.set(mol.name, mol.copy());
      } else {
        const existing = moleculeTypes.get(mol.name)!;
        // Count existing components by name
        const existingCounts = new Counter<string>(existing.components.map(c => c.name));
        const molCounts = new Counter<string>(mol.components.map(c => c.name));

        for (const [name, count] of molCounts.entries()) {
          const diff = count - (existingCounts.get(name) || 0);
          if (diff > 0) {
            // Add missing components
            const template = mol.components.find(c => c.name === name)!;
            for (let i = 0; i < diff; i++) {
              existing.addComponent(template.copy());
            }
          }
          // Merge states for existing components
          const existingComps = existing.components.filter(c => c.name === name);
          const molComps = mol.components.filter(c => c.name === name);
          for (let i = 0; i < Math.min(existingComps.length, molComps.length); i++) {
            for (const state of molComps[i].states) {
              existingComps[i].addState(state, false);
            }
          }
        }
      }
    }
  }

  return Array.from(moleculeTypes.values());
}

/**
 * Get seed species from the SCT
 */
export function getSeedSpecies(
  sct: SpeciesCompositionTable,
  model: SBMLModel
): SeedSpeciesEntry[] {
  const seedSpecies: SeedSpeciesEntry[] = [];

  for (const [speciesId, entry] of sct.entries) {
    const sbmlSpecies = model.species.get(speciesId)!;

    let amountExpr: string;
    if (sbmlSpecies.initialAmount > 0) {
      // BNG exports SBML with molecule counts in initialAmount
      // We use the value directly regardless of hasOnlySubstanceUnits
      amountExpr = sbmlSpecies.initialAmount.toString();
    } else if (sbmlSpecies.initialConcentration > 0) {
      // Concentration based: scale by Na * Vol
      const compId = standardizeName(sbmlSpecies.compartment);
      const volParam = `__compartment_${compId}__`;
      amountExpr = `(${sbmlSpecies.initialConcentration} * Na * ${volParam})`;
    } else {
      amountExpr = '0';
    }

    seedSpecies.push({
      species: entry.structure.copy(),
      concentration: amountExpr,
      compartment: sbmlSpecies.compartment,
      sbmlId: speciesId,
    });
  }

  return seedSpecies;
}
