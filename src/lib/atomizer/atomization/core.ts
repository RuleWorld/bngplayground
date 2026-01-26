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
      logger.warning('DEP001', `Dependency cycle detected: ${path.join(' -> ')} -> ${id}`);
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
 * Classify a reaction based on stoichiometry
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
}

const DEFAULT_SCT_OPTIONS: SCTBuilderOptions = {
  useId: false,
  useAnnotations: true,
  namingConventions: DEFAULT_NAMING_CONVENTIONS,
  memoizedResolver: false,
};

/**
 * Create elemental species structure
 */
function createElementalSpecies(
  sbmlSpecies: SBMLSpecies,
  useId: boolean = false
): Species {
  const species = new Species();
  const name = useId ? sbmlSpecies.id : standardizeName(sbmlSpecies.name || sbmlSpecies.id);
  
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
  bondIndex: { current: number },
  useId: boolean = false
): Species {
  const species = new Species();
  
  for (let i = 0; i < componentSpeciesIds.length; i++) {
    const compId = componentSpeciesIds[i];
    const compEntry = sctEntries.get(compId);
    
    if (compEntry && compEntry.structure) {
      const compCopy = compEntry.structure.copy();
      
      // Add binding component
      for (const mol of compCopy.molecules) {
        const bindingSite = new Component(`b${i + 1}`, `${mol.idx}_b${i + 1}`);
        mol.addComponent(bindingSite);
      }
      
      for (const mol of compCopy.molecules) {
        species.addMolecule(mol);
      }
    } else {
      const name = useId ? compId : standardizeName(compId);
      const molecule = new Molecule(name, compId);
      const bindingSite = new Component(`b${i + 1}`, `${compId}_b${i + 1}`);
      molecule.addComponent(bindingSite);
      species.addMolecule(molecule);
    }
  }

  // Add bonds for binary complexes
  if (componentSpeciesIds.length === 2 && species.molecules.length >= 2) {
    const bondNum = bondIndex.current++;
    const mol1 = species.molecules[0];
    const mol2 = species.molecules[1];
    
    const site1 = mol1.components.find(c => c.name.startsWith('b'));
    const site2 = mol2.components.find(c => c.name.startsWith('b'));
    
    if (site1 && site2) {
      site1.addBond(bondNum);
      site2.addBond(bondNum);
      species.bonds.push([site1.idx, site2.idx]);
    }
  }
  
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

  // Bond index counter
  const bondIndex = { current: 1 };

  // Build SCT entries in topological order
  for (const speciesId of sct.sortedSpecies) {
    const sbmlSpecies = model.species.get(speciesId)!;
    const speciesName = sbmlSpecies.name || speciesId;
    const deps = sct.dependencies.get(speciesId);
    
    let structure: Species;
    let components: string[] = [];
    let isElemental = true;
    const modifications = new Map<string, string>();

    // Check if this is a complex (from binding reactions)
    if (bindingReactions.has(speciesId)) {
      components = bindingReactions.get(speciesId)!;
      isElemental = false;
      structure = createComplexSpecies(sbmlSpecies, components, sct.entries, bondIndex, opts.useId);
    }
    // Check if modified species
    else if (modificationReactions.has(speciesId)) {
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
    else if (deps && deps.size > 0) {
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
          structure = createComplexSpecies(sbmlSpecies, depArray, sct.entries, bondIndex, opts.useId);
        }
      } else {
        structure = createComplexSpecies(sbmlSpecies, depArray, sct.entries, bondIndex, opts.useId);
      }
    }
    // Elemental species
    else {
      structure = createElementalSpecies(sbmlSpecies, opts.useId);
    }

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
  
  logger.info('SCT001', 
    `Built SCT: ${sct.entries.size} species (${elementalCount} elemental, ${complexCount} complex)`);

  return sct;
}

/**
 * Get all molecule types from the SCT
 */
export function getMoleculeTypes(sct: SpeciesCompositionTable): Molecule[] {
  const moleculeTypes = new Map<string, Molecule>();

  for (const [_, entry] of sct.entries) {
    if (entry.isElemental) {
      for (const mol of entry.structure.molecules) {
        if (!moleculeTypes.has(mol.name)) {
          moleculeTypes.set(mol.name, mol.copy());
        } else {
          const existing = moleculeTypes.get(mol.name)!;
          for (const comp of mol.components) {
            if (!existing.contains(comp.name)) {
              existing.addComponent(comp.copy());
            } else {
              const existingComp = existing.getComponent(comp.name)!;
              for (const state of comp.states) {
                if (!existingComp.states.includes(state)) {
                  existingComp.addState(state, false);
                }
              }
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
): Array<{ species: Species; concentration: string; compartment: string }> {
  const seedSpecies: Array<{ species: Species; concentration: string; compartment: string }> = [];

  for (const [speciesId, entry] of sct.entries) {
    const sbmlSpecies = model.species.get(speciesId)!;
    
    // Skip constant species with 0 initial value
    if (sbmlSpecies.constant && sbmlSpecies.boundaryCondition && 
        sbmlSpecies.initialConcentration === 0 && sbmlSpecies.initialAmount === 0) {
      continue;
    }

    const concentration = sbmlSpecies.initialConcentration > 0
      ? sbmlSpecies.initialConcentration.toString()
      : sbmlSpecies.initialAmount > 0
        ? sbmlSpecies.initialAmount.toString()
        : '0';

    if (parseFloat(concentration) > 0) {
      seedSpecies.push({
        species: entry.structure.copy(),
        concentration,
        compartment: sbmlSpecies.compartment,
      });
    }
  }

  return seedSpecies;
}
