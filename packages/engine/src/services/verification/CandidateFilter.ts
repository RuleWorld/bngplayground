/**
 * CandidateFilter.ts — Filter and rank candidate reaction rules for
 * structure learning. Removes duplicates, validates syntax, and
 * optionally caps the number of rules by biological plausibility.
 */

import type { BNGLMoleculeType } from '../../types';
import type { CandidateRule } from './RuleEnumerator';
import { parseComponent } from './RuleEnumerator';

// ── Types ────────────────────────────────────────────────────────────

export interface FilterConfig {
  requiredObservables?: string[];
  maxRulesPerModel?: number;   // Default: 20
  biologicalPriors?: Record<string, number>;
}

// ── Default biological plausibility priors ───────────────────────────

const DEFAULT_CATEGORY_PRIORS: Record<string, number> = {
  state_change: 0.8,
  binding: 0.7,
  unbinding: 0.7,
  degradation: 0.5,
  synthesis: 0.5,
  enzymatic: 0.6,
};

// ── Main filter function ─────────────────────────────────────────────

/**
 * Filter candidate rules by:
 * 1. Remove duplicates (after normalizing the rule string)
 * 2. Remove rules referencing components/states absent from molecule type declarations
 * 3. Validate basic BNGL syntax
 * 4. Rank by biological plausibility priors and cap at maxRulesPerModel
 */
export function filterCandidates(
  candidates: CandidateRule[],
  moleculeTypes: BNGLMoleculeType[],
  config?: FilterConfig,
): CandidateRule[] {
  const cfg = config ?? {};
  const maxRules = cfg.maxRulesPerModel ?? 20;

  // Build a lookup of valid molecule -> component -> states
  const molMap = buildMoleculeMap(moleculeTypes);

  // Step 1: Deduplicate by normalized rule string
  const seen = new Set<string>();
  let filtered: CandidateRule[] = [];
  for (const c of candidates) {
    const norm = normalizeRule(c.rule);
    if (seen.has(norm)) continue;
    seen.add(norm);
    filtered.push(c);
  }

  // Step 2: Remove rules involving nonexistent components/states
  filtered = filtered.filter((c) => validateAgainstMoleculeTypes(c, molMap));

  // Step 3: Validate BNGL syntax
  filtered = filtered.filter((c) => validateBNGLSyntax(c.rule));

  // Step 4: Rank by plausibility priors and cap
  const priors = cfg.biologicalPriors ?? DEFAULT_CATEGORY_PRIORS;
  filtered = rankAndCap(filtered, priors, maxRules);

  return filtered;
}

// ── Internal helpers ─────────────────────────────────────────────────

interface MolMap {
  [molName: string]: {
    components: { [compName: string]: string[] }; // compName -> states
  };
}

function buildMoleculeMap(moleculeTypes: BNGLMoleculeType[]): MolMap {
  const map: MolMap = {};
  for (const mol of moleculeTypes) {
    const comps: { [k: string]: string[] } = {};
    for (const raw of mol.components) {
      const parsed = parseComponent(raw);
      comps[parsed.name] = parsed.states;
    }
    map[mol.name] = { components: comps };
  }
  return map;
}

/**
 * Normalize a BNGL rule string for deduplication.
 * - Collapse whitespace
 * - Trim
 */
function normalizeRule(rule: string): string {
  return rule.replace(/\s+/g, ' ').trim();
}

/**
 * Validate that a candidate rule only references molecules, components,
 * and states that exist in the molecule type declarations.
 */
function validateAgainstMoleculeTypes(candidate: CandidateRule, molMap: MolMap): boolean {
  // Parse the rule to extract molecule references
  const ruleStr = candidate.rule;

  // Extract molecule patterns like MolName(comp~state, comp!1, ...)
  const molPatternRegex = /([A-Za-z_]\w*)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = molPatternRegex.exec(ruleStr)) !== null) {
    const molName = match[1];
    const compStr = match[2];

    // Check molecule exists
    if (!molMap[molName]) return false;

    if (compStr.trim() === '') continue;

    // Parse components within the parentheses
    const compTokens = compStr.split(',').map((s) => s.trim());
    for (const token of compTokens) {
      // Extract component name, optional state, optional bond
      // Formats: compName, compName~state, compName!bond, compName~state!bond
      const compMatch = token.match(/^([A-Za-z_]\w*)(?:~([A-Za-z_]\w+))?(?:![0-9+?])?$/);
      if (!compMatch) continue; // Skip if can't parse (may be valid BNGL we don't handle)

      const compName = compMatch[1];
      const state = compMatch[2];

      // Check component exists
      if (!molMap[molName].components.hasOwnProperty(compName)) return false;

      // Check state exists (if specified)
      if (state) {
        const validStates = molMap[molName].components[compName];
        if (validStates.length > 0 && !validStates.includes(state)) return false;
      }
    }
  }

  return true;
}

/**
 * Basic BNGL syntax validation for a rule string.
 * Checks for:
 * - Has a reaction arrow (-> or <>)
 * - Has a rate constant after the arrow and products
 * - Balanced parentheses
 * - Valid molecule patterns
 */
function validateBNGLSyntax(rule: string): boolean {
  // Must contain reaction arrow
  if (!rule.includes('->')) return false;

  // Split on arrow
  const arrowIdx = rule.indexOf('->');
  const lhs = rule.substring(0, arrowIdx).trim();
  const rhs = rule.substring(arrowIdx + 2).trim();

  // LHS must be non-empty (can be '0' for synthesis)
  if (!lhs) return false;
  // RHS must have products + rate
  if (!rhs) return false;

  // Check balanced parentheses
  let depth = 0;
  for (const ch of rule) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;

  // RHS should end with a rate constant (last space-separated token)
  const rhsTokens = rhs.split(/\s+/);
  if (rhsTokens.length < 2 && !lhs.includes('0') && !rhs.match(/^0\s/)) {
    // Need at least product(s) + rate, unless it's synthesis/degradation to 0
    // For "0 rate" pattern check
    if (rhsTokens.length < 2) return false;
  }

  return true;
}

/**
 * Rank candidates by biological plausibility priors and take top N.
 */
function rankAndCap(
  candidates: CandidateRule[],
  priors: Record<string, number>,
  maxRules: number,
): CandidateRule[] {
  // Score each candidate
  const scored = candidates.map((c) => ({
    candidate: c,
    score: priors[c.category] ?? 0.5,
  }));

  // Sort descending by score (stable sort preserves order among equal scores)
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  return scored.slice(0, maxRules).map((s) => s.candidate);
}
