// ── Types ──────────────────────────────────────────────────────────
export * from './types';

// ── Parser ─────────────────────────────────────────────────────────
export { parseBNGLWithANTLR, parseBNGLStrict } from './parser/BNGLParserWrapper';
export type { ParseResult, ParseError } from './parser/BNGLParserWrapper';
export { BNGLVisitor } from './parser/BNGLVisitor';
export { getExpressionDependencies } from './parser/ExpressionDependencies';

// ── Graph Services ─────────────────────────────────────────────────
// Core data structures
export { Species } from './services/graph/core/Species';
export { Rxn } from './services/graph/core/Rxn';
export { RxnRule } from './services/graph/core/RxnRule';
export { SpeciesGraph } from './services/graph/core/SpeciesGraph';
export { Component } from './services/graph/core/Component';
export { Molecule } from './services/graph/core/Molecule';
export { MoleculeType } from './services/graph/core/MoleculeType';

// Core services
export { BNGLParser } from './services/graph/core/BNGLParser';
export { GraphCanonicalizer } from './services/graph/core/Canonical';
export { GraphMatcher, clearMatchCache } from './services/graph/core/Matcher';
export { NautyService } from './services/graph/core/NautyService';
export { EnergyService } from './services/graph/core/EnergyService';
export { ExpressionTranslator } from './services/graph/core/ExpressionTranslator';
export { countEmbeddingDegeneracy } from './services/graph/core/degeneracy';

// High-level graph algorithms
export { NetworkGenerator, NetworkGenerationLimitError } from './services/graph/NetworkGenerator';
export { NetworkExporter } from './services/graph/NetworkExporter';
export { parseNetFile, loadNetFile } from './services/graph/NetParser';
export type { NetFileParseResult } from './services/graph/NetParser';
export { writeBNGL, writeBNGLFile } from './services/graph/BNGLWriter';
export type { BNGLWriterOptions } from './services/graph/BNGLWriter';

// ── Feature Flags ──────────────────────────────────────────────────
export { getFeatureFlags, setFeatureFlags, registerCacheClearCallback } from './featureFlags';
export type { FeatureFlags } from './featureFlags';

// ── Simulation ─────────────────────────────────────────────────────
export { generateExpandedNetwork } from './services/simulation/NetworkExpansion';
export { simulate } from './services/simulation/SimulationLoop';
export { evaluateFunctionalRate, evaluateExpressionOrParse, loadEvaluator, clearAllEvaluatorCaches, containsRateLawMacro, expandRateLawMacros, getCacheSizes, _setEvaluatorRefForTests } from './services/simulation/ExpressionEvaluator';
export { requiresCompartmentResolution, resolveCompartmentVolumes } from './services/simulation/CompartmentResolver';
export { BNGXMLWriter } from './services/simulation/BNGXMLWriter';
export { parseGdat } from './services/simulation/GdatParser';
export { CVODESolver, Rosenbrock23Solver, RK45Solver, AutoSolver, FastRK4Solver, SmartAutoSolver, CVODEAutoSolver, createSolver } from './services/simulation/ODESolver';
export { PLASimulator, simulatePLA } from './services/simulation/PLASimulator';
export type { PLAOptions } from './services/simulation/PLASimulator';
export { HybridModelGenerator, generateHybridModel } from './services/simulation/HybridModelGenerator';
export type { HybridModelOptions, HybridModelResult } from './services/simulation/HybridModelGenerator';
export { analyzeModelStiffness, getOptimalCVODEConfig, detectModelPreset } from './services/simulation/cvodeStiffConfig';

// ── NFsim ──────────────────────────────────────────────────────────
export { runNFsimSimulation, validateModelForNFsim } from './services/simulation/nfsim/NFsimRunner';
export type { NFsimSimulationOptions } from './services/simulation/nfsim/NFsimRunner';
export { NFsimValidator, getValidator, resetValidator, ValidationErrorType } from './services/simulation/nfsim/NFsimValidator';
export { NFsimResultAdapter } from './services/simulation/nfsim/NFsimResultAdapter';
export { NFsimConcurrencyManager, getConcurrencyManager, resetConcurrencyManager } from './services/simulation/nfsim/NFsimConcurrencyManager';
export { NFsimErrorHandler, getErrorHandler, resetErrorHandler, NFsimErrorType, RecoveryStrategy } from './services/simulation/nfsim/NFsimErrorHandler';
export type { NFsimError } from './services/simulation/nfsim/NFsimErrorHandler';
export { NFsimExecutionWrapper } from './services/simulation/nfsim/NFsimExecutionWrapper';
export type { NFsimExecutionOptions, NFsimExecutionResult as ExecutionResult } from './services/simulation/nfsim/NFsimExecutionWrapper';
export { resetMemoryManager, NFsimMemoryManager } from './services/simulation/nfsim/NFsimMemoryManager';
export { NFsimFunctionCompatibility, getFunctionCompatibilityChecker, resetFunctionCompatibilityChecker } from './services/simulation/nfsim/NFsimFunctionCompatibility';
export type { FunctionDefinition, CompatibilityAnalysis, ReplacementSuggestion } from './services/simulation/nfsim/NFsimFunctionCompatibility';

// ── Parity ─────────────────────────────────────────────────────────
export { formatSpeciesList, toBngGridTime } from './services/parity/ParityService';
export { countPatternMatches, isSpeciesMatch, isFunctionalRateExpr, removeCompartment, getCompartment } from './services/parity/PatternMatcher';

// ── Analysis ───────────────────────────────────────────────────────
export { buildStoichiometricMatrix, computeLeftNullSpace, findConservationLaws, createReducedSystem } from './services/analysis/ConservationLaws';
export type { ConservationLaw, ConservationAnalysis } from './services/analysis/ConservationLaws';
export { computeJacobianSparsity, buildJacobianContributions, generateSparseJacobianFunction } from './services/analysis/SparseJacobian';
export { SparseODESolver } from './services/analysis/SparseODESolver';
export { denseToCSR, ilu0Factorize, forwardSolve, backwardSolve, sparseSolve, csrMatVec, gmres } from './services/analysis/SparseLUSolver';
export type { CSRMatrix } from './services/analysis/SparseLUSolver';
export { JITCompiler, jitCompiler } from './services/analysis/JITCompiler';
export { analyzeNetwork, checkDeficiencyZeroTheorem } from './services/analysis/NetworkAnalysis';
export type { NetworkAnalysis } from './services/analysis/NetworkAnalysis';
export { roundForInput, DEFAULT_ZERO_DELTA, formatNumber, computeDefaultBounds, generateRange, validateScanSettings } from './services/analysis/ParameterScan';
export { fitParameters } from './services/analysis/paramFitter';
export { MassBalance } from './services/analysis/MassBalance';
export type { FitAlgorithm, ParamBounds, FitProgress, FitResult, FitConfig, ExperimentalDataPoint } from './services/analysis/paramFitter';
export { parsePEtab, parsePEtabCombined } from './services/analysis/petabImport';
export type { PEtabProblem, PEtabParameter, PEtabObservable } from './services/analysis/petabImport';
export { computeRegularizationPenalty, pruneModel } from './services/analysis/regularization';
export type { RegularizationType, RegularizationConfig, RegularizationPenalty, ModelReductionResult } from './services/analysis/regularization';
export { parseBPSL, evaluateBPSL } from './services/analysis/bpsl';
export type { BPSLConstraint, BPSLResult, BPSLConstraintResult, ConstraintType } from './services/analysis/bpsl';

// ── Utils ───────────────────────────────────────────────────────────
export { SafeExpressionEvaluator } from './utils/safeExpressionEvaluator';
export { SeededRandom } from './utils/random';
export { resolveAutoMethod, getSimulationOptionsFromParsedModel } from './utils/simulationOptions';
export { isMultiPhaseModel, identifyOutputChain, getExpectedRowCount } from './utils/multiPhaseSimulation';
export { formatBNGL } from './utils/formatBNGL';
export { parseParametersFromCode, isNumericLiteral, stripParametersBlock } from './utils/paramUtils';
export { parseObservablePattern, computeObservableValue, computeDynamicObservable, validateObservablePattern } from './utils/dynamicObservable';
export type { DynamicObservableDefinition, ComputedObservableResult } from './utils/dynamicObservable';
export { normalizeFilterNames, safeModelName, executeMultiPhaseSimulation, runSingleBatchItem } from './utils/batchRunner';
export type { BatchModelDef, BatchSimulator, BatchReporter, BatchRunnerOptions } from './utils/batchRunner';

// ── Optimization ────────────────────────────────────────────────────────
export { nelderMead } from './services/optimization/nelderMead';
export type { NelderMeadOptions, NelderMeadProgress, NelderMeadResult } from './services/optimization/nelderMead';
export { projectedNM } from './services/optimization/projectedNM';
export type { ProjectedNMOptions } from './services/optimization/projectedNM';
export { sbplx } from './services/optimization/sbplx';
export type { SbplxOptions, SbplxResult } from './services/optimization/sbplx';
export { differentialEvolution } from './services/optimization/differentialEvolution';
export type { DEOptions, DEProgress, DEResult } from './services/optimization/differentialEvolution';

// ── Debugger ────────────────────────────────────────────────────────
export { NetworkTracer } from './services/debugger/NetworkTracer';
export { RuleBlocker } from './services/debugger/RuleBlocker';
// Debugger types
export type { NetworkTrace, ExpansionEvent, DebuggerNetwork, TraceResult, RuleBlockerReport, RuleBlockerDetails, RuleBlockerSuggestion } from './services/debugger/types';

// ── Interfaces ───────────────────────────────────────────────────────
export type { SimulationEngine, ExpandedNetwork } from './interfaces/SimulationEngine';
export { EngineRegistry } from './interfaces/SimulationEngine';

// ── Sensitivity Analysis (Track E) ──────────────────────────────────
export { sobolSensitivity, generateSaltelliSamples } from './services/analysis/SobolSensitivity';
export type { SobolResult, SobolAnalysisConfig, SobolSampleSet, SobolSamplingOptions } from './services/analysis/SobolSensitivity';
export { computeFIM, computeCollinearity } from './services/analysis/FisherInformationMatrix';
export type { FIMConfig, FIMResult, CollinearityResult } from './services/analysis/FisherInformationMatrix';
export { profileLikelihood } from './services/analysis/ProfileLikelihood';
export type { ProfileLikelihoodConfig, ProfileLikelihoodResult } from './services/analysis/ProfileLikelihood';

// ── Bayesian Inference (Track G) ────────────────────────────────────
export { abcSMC } from './services/inference/ABCSMC';
export type { ABCSMCConfig, ABCSMCResult, ABCSMCProgress } from './services/inference/ABCSMC';
export { createPrior } from './services/inference/priors';
export type { PriorDistribution, PriorSpec } from './services/inference/priors';
export { weightedPercentile, weightedStats, kde, effectiveSampleSize, systematicResample, weightedCovariance, interpolateAtTime } from './services/inference/posteriorAnalysis';

// ── Standards & Export (Track F) ────────────────────────────────────
export { generateSedML } from './services/export/SedMLWriter';
export type { SedMLExportOptions } from './services/export/SedMLWriter';
export { generateOMEX } from './services/export/OMEXWriter';
export type { OMEXExportOptions } from './services/export/OMEXWriter';
export { SBMLWriter } from './services/export/SBMLWriter';
export type { SBMLWriterOptions } from './services/export/SBMLWriter';
export { inferReactionSBO, inferRateLawSBO, SBO } from './services/export/SBOAnnotations';
export { generateMIRIAMBlock, suggestMIRIAMAnnotations, resolveAnnotations, createUniProtResolver } from './services/export/MIRIAMAnnotation';
export type { MIRIAMAnnotation, IdentifierResolver } from './services/export/MIRIAMAnnotation';

// ── Math Utils ──────────────────────────────────────────────────────
export { normInv, chi2Quantile, jacobiEigenDecomposition, matMul, matTranspose, invertSymmetricMatrix } from './utils/mathUtils';

// ── ZIP Utils ───────────────────────────────────────────────────────
export { createZip } from './utils/miniZip';
export type { ZipEntry } from './utils/miniZip';

// ── Spatial Simulation ─────────────────────────────────────────────
export * from './services/spatial';
