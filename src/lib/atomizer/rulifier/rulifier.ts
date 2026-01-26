/**
 * Rulifier Module
 * TypeScript port of rulifier components (componentGroups.py, postAnalysis.py, etc.)
 * 
 * Converts flat models (explicit species) to rule-based models (patterns).
 */

import { Species, Molecule, Component, Rule, Action } from '../core/structures';
import { Counter, DefaultDict, deepCopy } from '../utils/helpers';

// =============================================================================
// Types
// =============================================================================

export interface ComponentGroup {
  name: string;
  molecule: string;
  states: string[];
  patterns: Species[];
}

export interface TransformationCenter {
  action: string;
  site1: string;
  site2: string;
  molecules: string[];
}

export interface TransformationContext {
  patterns: Species[];
  modifiers: string[];
}

export interface RuleGrouping {
  center: TransformationCenter;
  context: TransformationContext;
  rate: string;
  rules: Rule[];
}

// =============================================================================
// State Transition Diagram
// =============================================================================

export interface StateTransition {
  from: string;
  to: string;
  molecule: string;
  component: string;
  rate: string;
  rule: Rule;
}

export interface StateTransitionDiagram {
  states: Set<string>;
  transitions: StateTransition[];
  initialState: string;
}

/**
 * Build state transition diagram from rules
 */
export function buildStateTransitionDiagram(
  rules: Rule[],
  moleculeName: string,
  componentName: string
): StateTransitionDiagram {
  const states = new Set<string>();
  const transitions: StateTransition[] = [];
  let initialState = '0';

  for (const rule of rules) {
    // Find state changes for the specified molecule/component
    for (const action of rule.actions) {
      if (action.action !== 'StateChange') continue;

      // Parse action sites to find molecule and component
      const siteInfo = parseActionSite(action.site1, rule.reactants);
      if (!siteInfo) continue;

      if (siteInfo.molecule !== moleculeName || siteInfo.component !== componentName) {
        continue;
      }

      // Find the state change
      const reactantState = findComponentState(rule.reactants, moleculeName, componentName);
      const productState = findComponentState(rule.products, moleculeName, componentName);

      if (reactantState && productState && reactantState !== productState) {
        states.add(reactantState);
        states.add(productState);

        transitions.push({
          from: reactantState,
          to: productState,
          molecule: moleculeName,
          component: componentName,
          rate: rule.rates[0] || '1',
          rule,
        });
      }
    }
  }

  // Try to determine initial state (usually '0' or 'U' for unmodified)
  if (states.has('0')) {
    initialState = '0';
  } else if (states.has('U')) {
    initialState = 'U';
  } else if (states.size > 0) {
    initialState = Array.from(states)[0];
  }

  return { states, transitions, initialState };
}

/**
 * Parse action site to extract molecule and component info
 */
function parseActionSite(
  siteId: string,
  patterns: Species[]
): { molecule: string; component: string } | null {
  // Site IDs reference components within the rule patterns
  // Format is typically "MoleculeName_ComponentName" or an internal ID
  
  for (const pattern of patterns) {
    for (const mol of pattern.molecules) {
      for (const comp of mol.components) {
        if (comp.idx === siteId) {
          return { molecule: mol.name, component: comp.name };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find the state of a component in a species pattern
 */
function findComponentState(
  patterns: Species[],
  moleculeName: string,
  componentName: string
): string | null {
  for (const pattern of patterns) {
    for (const mol of pattern.molecules) {
      if (mol.name !== moleculeName) continue;
      
      for (const comp of mol.components) {
        if (comp.name === componentName) {
          return comp.activeState || null;
        }
      }
    }
  }
  
  return null;
}

// =============================================================================
// Component Group Analysis
// =============================================================================

/**
 * Group rules by their transformation center (the part that changes)
 */
export function groupByReactionCenter(rules: Rule[]): Map<string, Rule[]> {
  const groups = new Map<string, Rule[]>();

  for (const rule of rules) {
    const center = extractTransformationCenter(rule);
    const centerKey = JSON.stringify(center);

    if (!groups.has(centerKey)) {
      groups.set(centerKey, []);
    }
    groups.get(centerKey)!.push(rule);
  }

  return groups;
}

/**
 * Extract the transformation center from a rule
 */
function extractTransformationCenter(rule: Rule): TransformationCenter {
  // Find the action that defines the transformation
  const action = rule.actions[0] || new Action();
  
  // Get the molecules involved
  const molecules: string[] = [];
  for (const pattern of [...rule.reactants, ...rule.products]) {
    for (const mol of pattern.molecules) {
      if (!molecules.includes(mol.name)) {
        molecules.push(mol.name);
      }
    }
  }

  return {
    action: action.action,
    site1: action.site1,
    site2: action.site2,
    molecules,
  };
}

/**
 * Extract transformation context (the parts that don't change)
 */
function extractTransformationContext(rule: Rule): TransformationContext {
  const patterns: Species[] = [];
  const modifiers: string[] = [];

  // Context is everything that appears identically on both sides
  for (const reactant of rule.reactants) {
    for (const product of rule.products) {
      if (speciesEqual(reactant, product)) {
        patterns.push(reactant);
      }
    }
  }

  return { patterns, modifiers };
}

/**
 * Check if two species patterns are equal
 */
function speciesEqual(s1: Species, s2: Species): boolean {
  return s1.toString() === s2.toString();
}

// =============================================================================
// Rule Redundancy Detection
// =============================================================================

/**
 * Find redundant rules that can be collapsed
 */
export function findRedundantRules(rules: Rule[]): Map<string, Rule[]> {
  const redundant = new Map<string, Rule[]>();
  
  // Group by center
  const centerGroups = groupByReactionCenter(rules);
  
  for (const [centerKey, groupRules] of centerGroups) {
    if (groupRules.length <= 1) continue;
    
    // Check if rules differ only in context
    const contextSignatures = new Map<string, Rule[]>();
    
    for (const rule of groupRules) {
      const context = extractTransformationContext(rule);
      const contextKey = JSON.stringify(context.patterns.map(p => p.toString()).sort());
      
      if (!contextSignatures.has(contextKey)) {
        contextSignatures.set(contextKey, []);
      }
      contextSignatures.get(contextKey)!.push(rule);
    }
    
    // Rules with the same center but different contexts might be redundant
    for (const [contextKey, contextRules] of contextSignatures) {
      if (contextRules.length > 1) {
        redundant.set(`${centerKey}_${contextKey}`, contextRules);
      }
    }
  }
  
  return redundant;
}

/**
 * Collapse redundant rules into general rules
 */
export function collapseRedundantRules(rules: Rule[]): Rule[] {
  const redundantGroups = findRedundantRules(rules);
  const collapsedRules: Rule[] = [];
  const processedRules = new Set<Rule>();
  
  for (const [_, groupRules] of redundantGroups) {
    // Create a single rule with wildcards
    const baseRule = groupRules[0];
    const generalizedRule = generalizeRule(groupRules);
    collapsedRules.push(generalizedRule);
    
    for (const rule of groupRules) {
      processedRules.add(rule);
    }
  }
  
  // Add non-redundant rules
  for (const rule of rules) {
    if (!processedRules.has(rule)) {
      collapsedRules.push(rule);
    }
  }
  
  return collapsedRules;
}

/**
 * Create a generalized rule from multiple specific rules
 */
function generalizeRule(rules: Rule[]): Rule {
  if (rules.length === 0) {
    return new Rule();
  }
  
  const baseRule = rules[0];
  const generalizedRule = new Rule(baseRule.label + '_generalized');
  
  // Copy reactants and products, generalizing where rules differ
  for (let i = 0; i < baseRule.reactants.length; i++) {
    const generalizedReactant = generalizeSpecies(
      rules.map(r => r.reactants[i]).filter(Boolean)
    );
    generalizedRule.addReactant(generalizedReactant);
  }
  
  for (let i = 0; i < baseRule.products.length; i++) {
    const generalizedProduct = generalizeSpecies(
      rules.map(r => r.products[i]).filter(Boolean)
    );
    generalizedRule.addProduct(generalizedProduct);
  }
  
  // Use the most general rate
  if (baseRule.rates.length > 0) {
    generalizedRule.addRate(baseRule.rates[0]);
  }
  
  generalizedRule.bidirectional = baseRule.bidirectional;
  generalizedRule.actions = [...baseRule.actions];
  
  return generalizedRule;
}

/**
 * Create a generalized species pattern from multiple specific patterns
 */
function generalizeSpecies(patterns: Species[]): Species {
  if (patterns.length === 0) {
    return new Species();
  }
  
  const basePattern = patterns[0].copy();
  
  // For each component, check if states differ
  for (const mol of basePattern.molecules) {
    for (const comp of mol.components) {
      const states = new Set<string>();
      
      for (const pattern of patterns) {
        const matchingMol = pattern.molecules.find(m => m.name === mol.name);
        if (matchingMol) {
          const matchingComp = matchingMol.components.find(c => c.name === comp.name);
          if (matchingComp && matchingComp.activeState) {
            states.add(matchingComp.activeState);
          }
        }
      }
      
      // If multiple states, generalize by removing the state constraint
      if (states.size > 1) {
        comp.activeState = '';
      }
    }
  }
  
  return basePattern;
}

// =============================================================================
// Parameter Extraction
// =============================================================================

/**
 * Extract unique parameter names from rules
 */
export function extractParameters(rules: Rule[]): Set<string> {
  const parameters = new Set<string>();
  
  for (const rule of rules) {
    for (const rate of rule.rates) {
      // Extract parameter names from rate expression
      const paramMatches = rate.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
      if (paramMatches) {
        for (const param of paramMatches) {
          // Skip common function names and keywords
          const reserved = ['if', 'then', 'else', 'ln', 'log', 'exp', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'min', 'max'];
          if (!reserved.includes(param.toLowerCase())) {
            parameters.add(param);
          }
        }
      }
    }
  }
  
  return parameters;
}

/**
 * Analyze rate law to determine reaction order
 */
export function analyzeRateLaw(rate: string, reactantSpecies: string[]): {
  order: number;
  massAction: boolean;
  rateConstant?: string;
} {
  // Check if it's mass action kinetics
  let remainingRate = rate;
  let order = 0;
  
  for (const species of reactantSpecies) {
    const regex = new RegExp(`\\b${species}\\b`, 'g');
    const matches = remainingRate.match(regex);
    if (matches) {
      order += matches.length;
      remainingRate = remainingRate.replace(regex, '1');
    }
  }
  
  // After removing species, what's left should be the rate constant
  const cleaned = remainingRate.replace(/[\s*()1]/g, '');
  const isMassAction = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleaned) || /^[\d.e+-]+$/.test(cleaned);
  
  return {
    order,
    massAction: isMassAction,
    rateConstant: isMassAction ? cleaned : undefined,
  };
}

// =============================================================================
// Export Functions
// =============================================================================

export {
  groupByReactionCenter as groupRulesByCenter,
  extractTransformationCenter,
  extractTransformationContext,
  speciesEqual,
};
