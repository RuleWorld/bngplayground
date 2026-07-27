/**
 * Structural coverage check for SBML → BNGL atomization.
 *
 * Motivation: parity-only validation (does the trajectory match a reference?) hides *structural*
 * losses. A model whose events, algebraic rules, or initialAssignment-seeded species were dropped
 * still "atomizes" and only shows up later as a simulation mismatch — misattributing the failure
 * to the solver or rate law. This module counts SBML objects present in the source against objects
 * actually represented in the parsed model, per category, so drops are visible immediately.
 *
 * Counting the source is done by regex on the raw XML rather than via libSBML, because the bundled
 * reduced build omits many getters. This is a coverage *diagnostic*, so a slightly loose count is
 * acceptable — the goal is to flag categories where in != out, not to be a validator.
 */

import type { SBMLModel } from '../config/types';

export interface CategoryCoverage {
  category: string;
  /** Objects of this category found in the source SBML. */
  inSource: number;
  /** Objects represented in the parsed/atomized model. */
  represented: number;
  /** inSource - represented (objects that did not survive). */
  missing: number;
  /** Whether this category, if missing, changes the mathematical model. */
  affectsDynamics: boolean;
}

export interface StructuralCoverageReport {
  categories: CategoryCoverage[];
  /** True if every dynamics-affecting category is fully represented. */
  fullDynamicCoverage: boolean;
  /** Total dynamics-affecting objects that were dropped. */
  droppedDynamicObjects: number;
  /** Copied from the parser's structured diagnostics, if present. */
  importWarnings: SBMLModel['importWarnings'];
  /** Human-readable summary. */
  summary: string;
}

const countMatches = (xml: string, re: RegExp): number => (xml.match(re)?.length ?? 0);

/**
 * Count SBML objects in the raw source by element name. Uses the listOf... wrappers where possible
 * to avoid counting nested elements (e.g. a <species> reference inside a reaction is a
 * <speciesReference>, not a <species>, so a plain `<species\b` count is already safe).
 */
function countSource(xml: string) {
  const rules = {
    assignment: countMatches(xml, /<assignmentRule\b/gi),
    rate: countMatches(xml, /<rateRule\b/gi),
    algebraic: countMatches(xml, /<algebraicRule\b/gi),
  };
  return {
    compartments: countMatches(xml, /<compartment\b/gi),
    species: countMatches(xml, /<species\b/gi),
    parameters: countMatches(xml, /<parameter\b/gi), // includes local parameters; see note in caller
    reactions: countMatches(xml, /<reaction\b/gi),
    assignmentRules: rules.assignment,
    rateRules: rules.rate,
    algebraicRules: rules.algebraic,
    functionDefinitions: countMatches(xml, /<functionDefinition\b/gi),
    events: countMatches(xml, /<event\b/gi),
    initialAssignments: countMatches(xml, /<initialAssignment\b/gi),
    constraints: countMatches(xml, /<constraint\b/gi),
    unitDefinitions: countMatches(xml, /<unitDefinition\b/gi),
  };
}

/**
 * Build a per-category coverage report by comparing the raw SBML against the parsed model.
 *
 * `hasEventExecutor` and `appliesAlgebraicRules` let a caller mark those categories as covered if a
 * future engine gains the capability; both default to false to match the current engine.
 */
export function computeStructuralCoverage(
  model: SBMLModel,
  sbmlString: string,
  opts: { hasEventExecutor?: boolean; appliesAlgebraicRules?: boolean } = {}
): StructuralCoverageReport {
  const src = countSource(sbmlString);

  const modelAssignmentRules = model.rules.filter(r => r.type === 'assignment').length;
  const modelRateRules = model.rules.filter(r => r.type === 'rate').length;
  const modelAlgebraicRules = model.rules.filter(r => r.type === 'algebraic').length;

  // Global parameters only; local parameters live inside kinetic laws and are counted with them.
  const localParamCount = Array.from(model.reactions.values())
    .reduce((n, r) => n + (r.kineticLaw?.localParameters.length ?? 0), 0);
  const representedParams = model.parameters.size + localParamCount;

  const cats: CategoryCoverage[] = [
    { category: 'compartments', inSource: src.compartments, represented: model.compartments.size, affectsDynamics: true },
    { category: 'species', inSource: src.species, represented: model.species.size, affectsDynamics: true },
    { category: 'parameters', inSource: src.parameters, represented: representedParams, affectsDynamics: true },
    { category: 'reactions', inSource: src.reactions, represented: model.reactions.size, affectsDynamics: true },
    { category: 'assignmentRules', inSource: src.assignmentRules, represented: modelAssignmentRules, affectsDynamics: true },
    { category: 'rateRules', inSource: src.rateRules, represented: modelRateRules, affectsDynamics: true },
    // Algebraic rules are parsed but cannot be applied in BNGL: represented = 0 unless a caller says otherwise.
    { category: 'algebraicRules', inSource: src.algebraicRules, represented: opts.appliesAlgebraicRules ? modelAlgebraicRules : 0, affectsDynamics: true },
    { category: 'functionDefinitions', inSource: src.functionDefinitions, represented: model.functionDefinitions.size, affectsDynamics: true },
    // Events are parsed but not executed by the current engine.
    { category: 'events', inSource: src.events, represented: opts.hasEventExecutor ? model.events.length : 0, affectsDynamics: true },
    { category: 'initialAssignments', inSource: src.initialAssignments, represented: model.initialAssignments.length, affectsDynamics: true },
    // Constraints do not affect dynamics; counted for completeness.
    { category: 'constraints', inSource: src.constraints, represented: model.constraintCount ?? 0, affectsDynamics: false },
    { category: 'unitDefinitions', inSource: src.unitDefinitions, represented: model.unitDefinitions.size, affectsDynamics: false },
  ].map(c => ({ ...c, missing: Math.max(0, c.inSource - c.represented) }));

  const droppedDynamicObjects = cats
    .filter(c => c.affectsDynamics)
    .reduce((n, c) => n + c.missing, 0);
  const fullDynamicCoverage = droppedDynamicObjects === 0;

  const lines: string[] = [];
  lines.push(`Structural coverage for "${model.name}" (L${model.level ?? '?'}V${model.version ?? '?'})`);
  lines.push('category               in-source  represented  missing');
  for (const c of cats) {
    const flag = c.missing > 0 && c.affectsDynamics ? '  <-- DROPPED (affects dynamics)'
      : c.missing > 0 ? '  (non-dynamic, ok)' : '';
    lines.push(
      `${c.category.padEnd(22)} ${String(c.inSource).padStart(8)} ${String(c.represented).padStart(12)} ${String(c.missing).padStart(8)}${flag}`
    );
  }
  lines.push(fullDynamicCoverage
    ? 'All dynamics-affecting objects represented.'
    : `${droppedDynamicObjects} dynamics-affecting object(s) not represented — expect trajectory divergence.`);

  const warns = model.importWarnings ?? [];
  if (warns.length > 0) {
    lines.push('Import warnings:');
    for (const w of warns) lines.push(`  [${w.severity}] ${w.category}: ${w.message}${w.count > 1 ? ` (x${w.count})` : ''}`);
  }

  return {
    categories: cats,
    fullDynamicCoverage,
    droppedDynamicObjects,
    importWarnings: warns,
    summary: lines.join('\n'),
  };
}
