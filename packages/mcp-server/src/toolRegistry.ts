import { z } from 'zod';
import {
  simulationMethods,
  solverValues,
  parseBnglArgsSchema,
  generateNetworkArgsSchema,
  simulateArgsSchema,
  parameterScanArgsSchema,
  validateModelArgsSchema,
  getContactMapArgsSchema,
  verifyModelArgsSchema,
  searchStructureArgsSchema,
  sobolSensitivityArgsSchema,
  computeFimArgsSchema,
  identifiabilityArgsSchema,
  bayesianInferenceArgsSchema,
  perturbationScreenArgsSchema,
  doseResponseArgsSchema,
  firstPassageTimeArgsSchema,
  lnaAnalysisArgsSchema,
  reactionInformationFlowArgsSchema,
  qssaReductionArgsSchema,
  temporalAnalysisArgsSchema,
  symbolicSteadyStateArgsSchema,
  bifurcationAnalysisArgsSchema,
  optimalExperimentArgsSchema,
  checkHysteresisArgsSchema,
  checkPhaseHandoffArgsSchema,
  composeModelArgsSchema,
  editModelArgsSchema,
  diagnoseModelArgsSchema,
  explainModelArgsSchema,
  suggestFixArgsSchema,
  exportSedmlArgsSchema,
  exportOmexArgsSchema,
  exportSbmlArgsSchema,
  suggestAnnotationsArgsSchema,
  fitParametersArgsSchema,
  diagnoseArgsSchema,
  importPetabArgsSchema,
  reduceModelArgsSchema,
  pkpdArgsSchema,
  searchModelsArgsSchema,
} from './schemas/index.js';
import type { ToolArgs, ToolResult } from './types/index.js';
import { CONTACT_MAP_APP_URI, MODEL_STRUCTURE_APP_URI, PARAMETER_SCAN_APP_URI, SIMULATION_APP_URI, VALIDATION_APP_URI } from './apps.js';
import { handleParseBngl } from './handlers/parseBngl.js';
import { handleGenerateNetwork } from './handlers/generateNetwork.js';
import { handleSimulate } from './handlers/simulate.js';
import { handleParameterScan } from './handlers/parameterScan.js';
import { handleValidateModel } from './handlers/validateModel.js';
import { handleGetContactMap } from './handlers/getContactMap.js';
import { handleFitParameters } from './handlers/fitParameters.js';
import { handleImportPetab } from './handlers/importPetab.js';
import { handleReduceModel } from './handlers/reduceModel.js';
import { handleQueryPathwayCommons } from './handlers/queryPathwayCommons.js';
import { handleSobolSensitivity } from './handlers/sobolSensitivity.js';
import { handleIdentifiability } from './handlers/identifiability.js';
import { handleBayesianInference } from './handlers/bayesianInference.js';
import { handleExportModel } from './handlers/exportModel.js';
import { handleComposeModel } from './handlers/composeModel.js';
import { handleEditModel } from './handlers/editModel.js';
import { handleDiagnoseModel } from './handlers/diagnoseModel.js';
import { handleExplainModel } from './handlers/explainModel.js';
import { handleOptimalExperiment } from './handlers/optimalExperiment.js';
import { handleVerifyModel } from './handlers/verifyModel.js';
import { handleBifurcationAnalysis } from './handlers/bifurcationAnalysis.js';
import { handleTemporalAnalysis } from './handlers/temporalAnalysis.js';
import { handleSymbolicSteadyState } from './handlers/symbolicSteadyState.js';
import { handleCompareModels } from './handlers/compareModels.js';
import { handleSearchStructure } from './handlers/searchStructure.js';
import { handlePKPD } from './handlers/pkpd.js';
import { handleMultiscaleSimulation } from './handlers/multiscaleSimulation.js';
import { handlePerturbationScreen } from './handlers/perturbationScreen.js';
import { handleDoseResponse } from './handlers/doseResponse.js';
import { handleFirstPassageTime } from './handlers/firstPassageTime.js';
import { handleLnaAnalysis } from './handlers/lnaAnalysis.js';
import { handleReactionInformationFlow } from './handlers/reactionInformationFlow.js';
import { handleQssaReduction } from './handlers/qssaReduction.js';
import { handleComputeFim } from './handlers/computeFim.js';
import { handleSuggestFix } from './handlers/suggestFix.js';
import { handleCheckHysteresis } from './handlers/checkHysteresis.js';
import { handleCheckPhaseHandoff } from './handlers/checkPhaseHandoff.js';
import { handleAnalyzeResiduals } from './handlers/analyzeResiduals.js';
import { handleAssessModelMaturity } from './handlers/assessModelMaturity.js';
import { handleDiagnose } from './handlers/diagnose.js';
import { handleExportOmex } from './handlers/exportOmex.js';
import { handleExportSbml } from './handlers/exportSbml.js';
import { handleExportSedml } from './handlers/exportSedml.js';
import { handleSuggestAnnotations } from './handlers/suggestAnnotations.js';
import { handleSearchModels } from './handlers/searchModels.js';

export type ToolProfile = 'stable' | 'full';
export type ToolHandler = (args: ToolArgs, signal?: AbortSignal) => Promise<ToolResult<unknown>>;

export interface BngToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  handler: ToolHandler;
  profiles: ToolProfile[];
  category: string;
  appResourceUri?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  metadata?: Record<string, unknown>;
}

const jsonObjectOutputSchema = z.object({}).passthrough();

function handlerOf(
  handler: (args: ToolArgs, signal?: AbortSignal) => Promise<ToolResult<unknown>>,
): ToolHandler {
  return handler;
}

function define(
  definition: Omit<BngToolDefinition, 'outputSchema' | 'profiles'> & { profiles?: ToolProfile[] },
): BngToolDefinition {
  return {
    ...definition,
    outputSchema: jsonObjectOutputSchema,
    profiles: definition.profiles ?? ['stable', 'full'],
  };
}

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;

export const toolDefinitions: BngToolDefinition[] = [
  define({
    name: 'parse_bngl', title: 'Parse BNGL',
    description: 'Parse BNGL and return model structure, inventory, and parser diagnostics. Use when inspecting what code contains; do not use as the main correctness check, use validate_model for validity and compatibility diagnostics.',
    inputSchema: parseBnglArgsSchema, handler: handlerOf(handleParseBngl), category: 'core', appResourceUri: MODEL_STRUCTURE_APP_URI, annotations: readOnly,
  }),
  define({
    name: 'generate_network', title: 'Generate reaction network',
    description: 'Expand a BNGL model into its explicit species and reactions when network inspection is needed. Do not use merely to validate syntax or for models whose combinatorics require NFsim.',
    inputSchema: generateNetworkArgsSchema, handler: handlerOf(handleGenerateNetwork), category: 'core', annotations: readOnly,
  }),
  define({
    name: 'simulate', title: 'Simulate BNGL model',
    description: 'Run an ODE, SSA, or NFsim simulation and return trajectories or observables. Validate first for normal workflows; use temporal_analysis for event/phase summaries and parameter_scan for a finite parameter grid.',
    inputSchema: simulateArgsSchema, handler: handlerOf(handleSimulate), category: 'core', appResourceUri: SIMULATION_APP_URI,
  }),
  define({
    name: 'parameter_scan', title: 'Parameter scan',
    description: 'Run a finite 1D or 2D parameter sweep over specified values or ranges. Do not use for steady-state continuation (bifurcation_analysis), history-dependent hysteresis (check_hysteresis), or a defined dose-response curve (dose_response).',
    inputSchema: parameterScanArgsSchema, handler: handlerOf(handleParameterScan), category: 'core', appResourceUri: PARAMETER_SCAN_APP_URI,
  }),
  define({
    name: 'validate_model', title: 'Validate BNGL model',
    description: 'Validate BNGL/model semantics and compatibility and return actionable errors and warnings. Use when asking whether a model can run; do not use merely to inspect structure, use parse_bngl.',
    inputSchema: validateModelArgsSchema, handler: handlerOf(handleValidateModel), category: 'core', appResourceUri: VALIDATION_APP_URI, annotations: readOnly,
  }),
  define({
    name: 'get_contact_map', title: 'Build contact map',
    description: 'Build a static contact map of molecule components and bonds from a BNGL model. Use for structural interaction inspection, not for dynamic causal influence.',
    inputSchema: getContactMapArgsSchema, handler: handlerOf(handleGetContactMap), category: 'core', appResourceUri: CONTACT_MAP_APP_URI, annotations: readOnly,
  }),

  define({ name: 'fit_parameters', title: 'Fit parameters', description: 'Find parameter values that best match supplied experimental data. Use for point estimation; do not use bayesian_inference for a posterior or identifiability_analysis for a best fit alone.', inputSchema: fitParametersArgsSchema, handler: handlerOf(handleFitParameters), category: 'calibration' }),
  define({ name: 'import_petab', title: 'Import PEtab problem', description: 'Import a PEtab parameter-estimation problem and fit the BNGL model. Use when PEtab tables are supplied; do not hand-convert them into a generic parameter scan.', inputSchema: importPetabArgsSchema, handler: handlerOf(handleImportPetab), category: 'calibration' }),
  define({ name: 'reduce_model', title: 'Reduce calibrated model', description: 'Fit and prune a calibrated or overparameterized model using regularization. Use for data-informed reduction; use qssa_reduction for fast-species quasi-steady-state candidates.', inputSchema: reduceModelArgsSchema, handler: handlerOf(handleReduceModel), category: 'calibration' }),
  define({ name: 'qssa_reduction', title: 'QSSA reduction', description: 'Identify fast-reaction/species candidates and optionally apply a quasi-steady-state reduction. Do not use for generic fitted-model pruning, use reduce_model.', inputSchema: qssaReductionArgsSchema, handler: handlerOf(handleQssaReduction), category: 'calibration' }),

  define({ name: 'sobol_sensitivity', title: 'Sobol global sensitivity', description: 'Measure which parameters drive global output variance over supplied bounds. Do not use compute_fim for a global variance question; FIM is local.', inputSchema: sobolSensitivityArgsSchema, handler: handlerOf(handleSobolSensitivity), category: 'sensitivity' }),
  define({ name: 'identifiability_analysis', title: 'Practical identifiability', description: 'Profile data-constrained parameters and classify practical or structural identifiability. Do not use compute_fim as a substitute for a profile likelihood.', inputSchema: identifiabilityArgsSchema, handler: handlerOf(handleIdentifiability), category: 'sensitivity' }),
  define({ name: 'bayesian_inference', title: 'Bayesian inference', description: 'Infer posterior parameter distributions from priors and experimental data. Do not use fit_parameters when posterior uncertainty, rather than a point estimate, is the scientific object.', inputSchema: bayesianInferenceArgsSchema, handler: handlerOf(handleBayesianInference), category: 'sensitivity' }),
  define({ name: 'optimal_experiment', title: 'Optimal experiment', description: 'Recommend informative experiments or timepoints using the model and parameter uncertainty. Do not use sensitivity tools when the requested output is an experiment design.', inputSchema: optimalExperimentArgsSchema, handler: handlerOf(handleOptimalExperiment), category: 'sensitivity' }),
  define({ name: 'compute_fim', title: 'Compute local FIM', description: 'Compute local Fisher-information-based parameter distinguishability around a specified point or experiment. Do not use for global variance sensitivity (sobol_sensitivity) or practical profile-likelihood identifiability (identifiability_analysis).', inputSchema: computeFimArgsSchema, handler: handlerOf(handleComputeFim), category: 'sensitivity' }),

  define({ name: 'edit_model', title: 'Edit BNGL model', description: 'Apply explicit deterministic edits such as parameter, rule, observable, molecule-type, or species changes to supplied BNGL. Prefer direct BNGL edits over legacy NLP composition.', inputSchema: editModelArgsSchema, handler: handlerOf(handleEditModel), category: 'intelligence' }),
  define({ name: 'diagnose_model', title: 'Diagnose model', description: 'Run unified model diagnosis, optionally including residual and maturity analysis. Use for numerical/model-readiness diagnosis; use validate_model for validity and parse_bngl for structure.', inputSchema: diagnoseModelArgsSchema, handler: handlerOf(handleDiagnoseModel), category: 'intelligence' }),
  define({ name: 'explain_model', title: 'Explain model', description: 'Explain the biological and computational structure of supplied BNGL. Use for interpretation, not for checking whether the model is valid or numerically stable.', inputSchema: explainModelArgsSchema, handler: handlerOf(handleExplainModel), category: 'intelligence' }),

  define({ name: 'verify_model', title: 'Verify model property', description: 'Answer a bounded structural or behavioral property query with an explanation and confidence layer. Do not use it as a substitute for simulation or validation of an arbitrary claim.', inputSchema: verifyModelArgsSchema, handler: handlerOf(handleVerifyModel), category: 'verification' }),
  define({ name: 'bifurcation_analysis', title: 'Bifurcation analysis', description: 'Track steady-state branches and bifurcation points while continuing a parameter. Do not use for an arbitrary finite grid (parameter_scan) or up/down history comparison (check_hysteresis).', inputSchema: bifurcationAnalysisArgsSchema, handler: handlerOf(handleBifurcationAnalysis), category: 'verification' }),
  define({ name: 'temporal_analysis', title: 'Temporal analysis', description: 'Summarize time-domain events, phases, and reaction timing from a simulation. Use when events or phases are the object, not when raw trajectories alone are needed (simulate).', inputSchema: temporalAnalysisArgsSchema, handler: handlerOf(handleTemporalAnalysis), category: 'verification' }),
  define({ name: 'symbolic_steady_state', title: 'Symbolic steady state', description: 'Derive symbolic steady-state equations and sensitivities for an expandable model. Do not use for a numerical steady-state curve or continuation.', inputSchema: symbolicSteadyStateArgsSchema, handler: handlerOf(handleSymbolicSteadyState), category: 'verification' }),
  define({ name: 'compare_models', title: 'Compare model variants', description: 'Compare supplied BNGL model variants and identify structural or dynamical differences. Do not use diagnose_model to compare separate variants.', inputSchema: z.object({ variants: z.array(z.object({ name: z.string(), code: z.string() }).strict()).min(1), t_end: z.number().finite().positive().optional(), divergence_threshold: z.number().finite().nonnegative().optional() }).strict(), handler: handlerOf(handleCompareModels), category: 'verification' }),
  define({ name: 'search_structure', title: 'Search model structure', description: 'Search model structure or reaction patterns using the supplied BNGL model. Do not use search_models, which searches the external RuleHub corpus.', inputSchema: searchStructureArgsSchema, handler: handlerOf(handleSearchStructure), category: 'verification' }),
  define({ name: 'check_hysteresis', title: 'Check hysteresis', description: 'Sweep a parameter upward and downward to test history-dependent hysteresis or bistability. Do not use parameter_scan for a claim that depends on reversal history.', inputSchema: checkHysteresisArgsSchema, handler: handlerOf(handleCheckHysteresis), category: 'verification' }),
  define({ name: 'check_phase_handoff', title: 'Check phase handoff', description: 'Run an equilibrate-then-step experiment and track the response across a parameter handoff. Do not use temporal_analysis for this explicit two-phase intervention.', inputSchema: checkPhaseHandoffArgsSchema, handler: handlerOf(handleCheckPhaseHandoff), category: 'verification' }),

  define({ name: 'pkpd', title: 'PK/PD analysis', description: 'Generate or simulate supported pharmacokinetic/pharmacodynamic model templates and metrics. Use for PK/PD workflows, not generic BNGL parameter fitting.', inputSchema: pkpdArgsSchema, handler: handlerOf(handlePKPD), category: 'applied' }),
  define({ name: 'multiscale_simulation', title: 'Multiscale simulation', description: 'Run a supplied multiscale intracellular, cell-agent, and extracellular definition. Use when multiple spatial/biological scales are explicit.', inputSchema: z.object({ definition: z.record(z.string(), z.unknown()), max_cells: z.number().int().positive().optional() }).strict(), handler: handlerOf(handleMultiscaleSimulation), category: 'applied' }),
  define({ name: 'perturbation_screen', title: 'Perturbation screen', description: 'Run a bounded rule/species/molecule knockout or pairwise perturbation screen and rank trajectory deviations. Use for systematic interventions, not a single model edit.', inputSchema: perturbationScreenArgsSchema, handler: handlerOf(handlePerturbationScreen), category: 'applied' }),
  define({ name: 'dose_response', title: 'Dose-response curve', description: 'Compute a defined input/dose-response relationship for selected observables, including steady-state/Hill summaries. Do not use for an arbitrary two-parameter grid or continuation.', inputSchema: doseResponseArgsSchema, handler: handlerOf(handleDoseResponse), category: 'applied' }),
  define({ name: 'first_passage_time', title: 'First-passage time', description: 'Compute threshold-crossing time distributions from an SSA ensemble. Use for rare-event timing; do not use temporal_analysis for a distributional threshold-time question.', inputSchema: firstPassageTimeArgsSchema, handler: handlerOf(handleFirstPassageTime), category: 'applied' }),
  define({ name: 'lna_analysis', title: 'Linear noise approximation', description: 'Estimate local stochastic mean/covariance with the linear noise approximation. Do not use it as a replacement for an SSA ensemble when non-Gaussian event timing matters.', inputSchema: lnaAnalysisArgsSchema, handler: handlerOf(handleLnaAnalysis), category: 'applied' }),
  define({ name: 'reaction_information_flow', title: 'Reaction information flow', description: 'Analyze information-theoretic flow and causal associations in SSA reaction firing logs. Use for empirical reaction-level dynamics, not static contact-map structure.', inputSchema: reactionInformationFlowArgsSchema, handler: handlerOf(handleReactionInformationFlow), category: 'applied' }),

  define({ name: 'export_model', title: 'Export model', description: 'Unified export surface for supported BioNetGen interchange and annotation formats. Prefer this stable tool instead of legacy format-specific export aliases.', inputSchema: z.object({ code: z.string(), format: z.enum(['sedml', 'omex', 'sbml', 'annotations']), method: z.enum(['ode', 'ssa', 'nf']).optional(), t_end: z.number().nonnegative().optional(), n_steps: z.number().int().positive().optional(), observables: z.array(z.string()).optional(), model_name: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(), annotate: z.boolean().optional(), organism: z.string().optional() }).strict(), handler: handlerOf(handleExportModel), category: 'integration' }),
  define({ name: 'query_pathway_commons', title: 'Query Pathway Commons', description: 'Query Pathway Commons for known interactions among molecules in a supplied model. Use for external pathway context, not for RuleHub BNGL model discovery.', inputSchema: z.object({ code: z.string() }).strict(), handler: handlerOf(handleQueryPathwayCommons), category: 'integration' }),
  define({ name: 'search_models', title: 'Search RuleHub models', description: 'Search RuleWorld/RuleHub, the canonical BioNetGen model repository, for published, tutorial, contributed, or validation BNGL models matching a biological mechanism or BNGL feature. Returns metadata and resource links, not full model text. Read the returned rulehub://model/{id} resource for exact BNGL. Do not use when the user already supplied the model and only needs a local edit or simulation.', inputSchema: searchModelsArgsSchema, handler: handlerOf(handleSearchModels), category: 'rulehub', annotations: { ...readOnly, openWorldHint: true } }),

  define({ name: 'compose_model', title: 'Compose model (legacy)', description: 'Legacy Designer/INDRA translation helper for compatibility. It is not the general-purpose BNGL authoring path; write BNGL directly and validate it instead.', inputSchema: composeModelArgsSchema, handler: handlerOf(handleComposeModel), category: 'legacy', profiles: ['full'] }),
  define({ name: 'suggest_fix', title: 'Suggest fix (legacy)', description: 'Legacy parser-error fix suggestions. Prefer validate_model and direct BNGL editing for new workflows.', inputSchema: suggestFixArgsSchema, handler: handlerOf(handleSuggestFix), category: 'legacy', profiles: ['full'] }),
  define({ name: 'diagnose', title: 'Numerical diagnose (legacy)', description: 'Legacy numerical diagnosis leaf handler retained in the full profile; prefer diagnose_model for unified diagnosis.', inputSchema: diagnoseArgsSchema, handler: handlerOf(handleDiagnose), category: 'legacy', profiles: ['full'] }),
  define({ name: 'analyze_residuals', title: 'Analyze residuals (legacy)', description: 'Legacy residual-analysis leaf handler retained in the full profile; diagnose_model can include residual analysis.', inputSchema: z.object({ code: z.string(), experimental_data: z.array(z.record(z.string(), z.unknown())), parameters: z.record(z.string(), z.number()).optional(), method: z.enum(['ode', 'ssa']).optional(), t_end: z.number().nonnegative().optional() }).strict(), handler: handlerOf(handleAnalyzeResiduals), category: 'legacy', profiles: ['full'] }),
  define({ name: 'assess_model_maturity', title: 'Assess model maturity (legacy)', description: 'Legacy model-maturity leaf handler retained in the full profile; diagnose_model can include maturity assessment.', inputSchema: z.object({ code: z.string(), validation_history: z.array(z.record(z.string(), z.unknown())).optional(), parameter_sources: z.record(z.string(), z.record(z.string(), z.unknown())).optional(), n_observables: z.number().int().positive().optional() }).strict(), handler: handlerOf(handleAssessModelMaturity), category: 'legacy', profiles: ['full'] }),
  define({ name: 'export_omex', title: 'Export OMEX (legacy)', description: 'Legacy format-specific export alias retained in the full profile. Prefer export_model with format="omex".', inputSchema: exportOmexArgsSchema, handler: handlerOf(handleExportOmex), category: 'legacy', profiles: ['full'] }),
  define({ name: 'export_sbml', title: 'Export SBML (legacy)', description: 'Legacy format-specific export alias retained in the full profile. Prefer export_model with format="sbml".', inputSchema: exportSbmlArgsSchema, handler: handlerOf(handleExportSbml), category: 'legacy', profiles: ['full'] }),
  define({ name: 'export_sedml', title: 'Export SED-ML (legacy)', description: 'Legacy format-specific export alias retained in the full profile. Prefer export_model with format="sedml".', inputSchema: exportSedmlArgsSchema, handler: handlerOf(handleExportSedml), category: 'legacy', profiles: ['full'] }),
  define({ name: 'suggest_annotations', title: 'Suggest annotations (legacy)', description: 'Legacy annotation suggestion alias retained in the full profile. Prefer export_model with format="annotations".', inputSchema: suggestAnnotationsArgsSchema, handler: handlerOf(handleSuggestAnnotations), category: 'legacy', profiles: ['full'] }),
];

export function getToolDefinitions(profile: ToolProfile): BngToolDefinition[] {
  return toolDefinitions.filter((definition) => definition.profiles.includes(profile));
}

export function getToolNames(profile: ToolProfile): string[] {
  return getToolDefinitions(profile).map((definition) => definition.name);
}

export const stableToolNames = getToolNames('stable');
export const fullToolNames = getToolNames('full');

export function validateToolRegistry(): void {
  const names = toolDefinitions.map((definition) => definition.name);
  if (new Set(names).size !== names.length) throw new Error('MCP tool registry contains duplicate names');
  if (!stableToolNames.every((name) => fullToolNames.includes(name))) {
    throw new Error('Stable MCP tools must be included in the full profile');
  }
  for (const definition of toolDefinitions) {
    if (!definition.description.trim() || !definition.inputSchema || !definition.outputSchema || !definition.handler) {
      throw new Error(`Incomplete MCP tool definition: ${definition.name}`);
    }
  }
}

validateToolRegistry();

export { simulationMethods, solverValues };
