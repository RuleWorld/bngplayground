/**
 * Structural Influence Graph types.
 *
 * Ported from RuleBender's Influence.java — the influence graph shows
 * rule-to-rule causal relationships based on structural overlap between
 * what one rule produces (center) and what another rule needs (context).
 *
 * Activation/Inhibition values mirror RuleBender:
 *   -1 = none, 0 = possible (partial match), 1 = definite (full match)
 */

export interface InfluenceEdge {
  /** Index of the source rule (the "cause") */
  sourceRuleIndex: number;
  /** Index of the target rule (the "effect") */
  targetRuleIndex: number;
  /** -1 = none, 0 = possible, 1 = definite */
  activation: -1 | 0 | 1;
  /** -1 = none, 0 = possible, 1 = definite */
  inhibition: -1 | 0 | 1;
  /** Human-readable reason for the influence */
  reasons: string[];
}

export interface InfluenceNode {
  ruleIndex: number;
  ruleName: string;
  ruleExpression: string;
}

export interface InfluenceGraphData {
  nodes: InfluenceNode[];
  edges: InfluenceEdge[];
}
