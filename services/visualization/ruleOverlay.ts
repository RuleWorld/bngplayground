/**
 * Rule Overlay types for Contact Map visualization.
 *
 * Ported from RuleBender's VisualRule.java — classifies each reaction rule's
 * interaction with contact map elements into "center" (what changes) vs
 * "context" (what must be present but doesn't change).
 *
 * Keys use "Mol.Comp" format to match contact map node identifiers.
 */

/** Which contact map elements a single rule touches */
export interface RuleOverlay {
  ruleIndex: number;
  ruleName: string;
  ruleExpression: string;

  /**
   * CENTER: elements the rule *changes*.
   * Corresponds to RuleBender's addBonds + removeBonds + changedStates.
   */
  center: {
    /** "Mol.Comp" keys for components whose state changes */
    stateChanges: Set<string>;
    /** [Mol1.Comp1, Mol2.Comp2] pairs for bonds created */
    bondsAdded: Array<[string, string]>;
    /** [Mol1.Comp1, Mol2.Comp2] pairs for bonds broken */
    bondsRemoved: Array<[string, string]>;
    /** Molecule names synthesized by the rule */
    moleculesAdded: Set<string>;
    /** Molecule names degraded by the rule */
    moleculesRemoved: Set<string>;
  };

  /**
   * CONTEXT: elements the rule *tests* but doesn't change.
   * Corresponds to RuleBender's reactantComponents not in center,
   * and reactantBonds ∩ productBonds.
   */
  context: {
    /** "Mol.Comp" keys that appear in reactant patterns */
    testedComponents: Set<string>;
    /** [Mol1.Comp1, Mol2.Comp2] bonds preserved across the rule */
    requiredBonds: Array<[string, string]>;
    /** "Mol.Comp~State" entries tested in reactant patterns */
    testedStates: Set<string>;
  };

  /**
   * PRODUCT CONTEXT: elements from the product side, used as the "context"
   * when this rule is treated as a reverse rule target in the influence graph.
   * For a reverse rule, "reactants" are the forward rule's products.
   */
  productContext: {
    testedComponents: Set<string>;
    requiredBonds: Array<[string, string]>;
    testedStates: Set<string>;
  };
}
