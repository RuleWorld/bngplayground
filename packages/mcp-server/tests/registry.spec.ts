import { describe, expect, it } from 'vitest';

import {
  fullToolNames,
  getToolDefinitions,
  getToolNames,
  resolveToolProfile,
  stableToolNames,
} from '../src/index.js';

const EXPECTED_STABLE_TOOLS = [
  'parse_bngl', 'generate_network', 'simulate', 'parameter_scan', 'validate_model', 'get_contact_map',
  'fit_parameters', 'import_petab', 'reduce_model', 'qssa_reduction',
  'sobol_sensitivity', 'identifiability_analysis', 'bayesian_inference', 'optimal_experiment', 'compute_fim',
  'edit_model', 'diagnose_model', 'explain_model',
  'verify_model', 'bifurcation_analysis', 'temporal_analysis', 'symbolic_steady_state', 'compare_models',
  'search_structure', 'check_hysteresis', 'check_phase_handoff',
  'pkpd', 'multiscale_simulation', 'perturbation_screen', 'dose_response', 'first_passage_time',
  'lna_analysis', 'reaction_information_flow',
  'export_model', 'query_pathway_commons', 'search_models',
].sort();

const EXPECTED_FULL_ONLY = [
  'compose_model', 'suggest_fix', 'diagnose', 'analyze_residuals', 'assess_model_maturity',
  'export_omex', 'export_sbml', 'export_sedml', 'suggest_annotations',
].sort();

describe('MCP tool registry profiles', () => {
  it('derives the stable profile from one declarative inventory', () => {
    expect([...stableToolNames].sort()).toEqual(EXPECTED_STABLE_TOOLS);
    expect(stableToolNames).toHaveLength(36);
    expect(getToolDefinitions('stable').every((definition) => definition.outputSchema)).toBe(true);
  });

  it('keeps compatibility handlers in full without removing stable tools', () => {
    expect(fullToolNames).toHaveLength(45);
    expect([...fullToolNames].sort()).toEqual([...stableToolNames, ...EXPECTED_FULL_ONLY].sort());
    expect(EXPECTED_FULL_ONLY.every((name) => !stableToolNames.includes(name))).toBe(true);
    expect(getToolNames('full')).toEqual(fullToolNames);
  });

  it('defaults to stable and rejects unknown profile values', () => {
    expect(resolveToolProfile(undefined)).toBe('stable');
    expect(resolveToolProfile('full')).toBe('full');
    expect(() => resolveToolProfile('experimental')).toThrow(/stable|full/);
  });
});
