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
export { simulate, buildOdeSystem } from './services/simulation/SimulationLoop';
export type { OdeSystemHandle } from './types';
export { evaluateFunctionalRate, evaluateExpressionOrParse, loadEvaluator, clearAllEvaluatorCaches, containsRateLawMacro, expandRateLawMacros, getCacheSizes, _setEvaluatorRefForTests } from './services/simulation/ExpressionEvaluator';
export { requiresCompartmentResolution, resolveCompartmentVolumes } from './services/simulation/CompartmentResolver';
export { BNGXMLWriter } from './services/simulation/BNGXMLWriter';
export { parseGdat } from './services/simulation/GdatParser';
export { CVODESolver, Rosenbrock23Solver, RK45Solver, AutoSolver, FastRK4Solver, createSolver } from './services/simulation/ODESolver';
export { PLASimulator, simulatePLA } from './services/simulation/PLASimulator';
export type { PLAOptions } from './services/simulation/PLASimulator';
export { PSASimulator, simulatePSA } from './services/simulation/PSASimulator';
export type { PSAOptions } from './services/simulation/PSASimulator';
export { HybridModelGenerator, generateHybridModel } from './services/simulation/HybridModelGenerator';
export type { HybridModelOptions, HybridModelResult } from './services/simulation/HybridModelGenerator';
export { analyzeModelStiffness, getOptimalCVODEConfig, detectModelPreset } from './services/simulation/cvodeStiffConfig';
export { analyzeQSSA, applyQSSAReduction } from './services/analysis/QSSAPreprocessor';
export type { QSSAOptions, QSSAResult, QSSACandidate, QSSAReductionResult } from './services/analysis/QSSAPreprocessor';

// ── Conserved Moiety Detector ──────────────────────────────────────────
export {
    detectConservedMoieties,
    computeConservationConstants,
    reduceSystem,
} from './services/analysis/ConservedMoietyDetector';
export type {
    ReactionEntry,
    ConservedMoiety,
    ReducedSystemInfo,
} from './services/analysis/ConservedMoietyDetector';

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
export { roundForInput, DEFAULT_ZERO_DELTA, formatNumber, computeDefaultBounds, generateRange, validateScanSettings, runParameterScan } from './services/analysis/ParameterScan';
export type { ParameterScanOptions, RunParameterScanResult } from './services/analysis/ParameterScan';
export { fitParameters } from './services/analysis/paramFitter';
export { MassBalance } from './services/analysis/MassBalance';
export { findUnreachableRules } from './services/analysis/UnreachableRules';
export { assessModelMaturity } from './services/analysis/ModelMaturity';
export type { ModelMaturityInput, ModelMaturityResult, ModelMaturityHistoryEntry, ModelMaturityParameterSource } from './services/analysis/ModelMaturity';
export { diagnoseModel } from './services/analysis/ModelDiagnostics';
export type { ModelDiagnostics } from './services/analysis/ModelDiagnostics';
export type { FitAlgorithm, ParamBounds, FitProgress, FitResult, FitConfig, ExperimentalDataPoint } from './services/analysis/paramFitter';
export { parsePEtab, parsePEtabCombined } from './services/analysis/petabImport';
export type { PEtabProblem, PEtabParameter, PEtabObservable } from './services/analysis/petabImport';
export { computeRegularizationPenalty, pruneModel } from './services/analysis/regularization';
export type { RegularizationType, RegularizationConfig, RegularizationPenalty, ModelReductionResult } from './services/analysis/regularization';
export { parseBPSL, evaluateBPSL } from './services/analysis/bpsl';
export type { BPSLConstraint, BPSLResult, BPSLConstraintResult, ConstraintType } from './services/analysis/bpsl';
export { analyzeHysteresis } from './services/analysis/Hysteresis';
export type { HysteresisConfig, HysteresisResult } from './services/analysis/Hysteresis';

// ── Utils ───────────────────────────────────────────────────────────
export { SafeExpressionEvaluator } from './utils/safeExpressionEvaluator';
export { escapeXml } from './utils/xmlUtils';
export { SeededRandom } from './utils/random';
export { resolveAutoMethod, getSimulationOptionsFromParsedModel } from './utils/simulationOptions';
export { isMultiPhaseModel, identifyOutputChain, getExpectedRowCount } from './utils/multiPhaseSimulation';
export { formatBNGL } from './utils/formatBNGL';
export { parseParametersFromCode, isNumericLiteral, stripParametersBlock, reevaluateSeedSpecies } from './utils/paramUtils';
export { parseObservablePattern, computeObservableValue, computeDynamicObservable, validateObservablePattern } from './utils/dynamicObservable';
export { splitObservablePatterns } from './utils/observableUtils';
export type { DynamicObservableDefinition, ComputedObservableResult } from './utils/dynamicObservable';
export { normalizeFilterNames, safeModelName, executeMultiPhaseSimulation, runSingleBatchItem } from './utils/batchRunner';
export type { BatchModelDef, BatchSimulator, BatchReporter, BatchRunnerOptions, BatchItemStatus } from './utils/batchRunner';

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
export { MatlabWriter } from './services/export/MatlabWriter';
export type { MatlabWriterOptions } from './services/export/MatlabWriter';
export { inferReactionSBO, inferRateLawSBO, SBO } from './services/export/SBOAnnotations';
export { generateMIRIAMBlock, suggestMIRIAMAnnotations, resolveAnnotations, createUniProtResolver } from './services/export/MIRIAMAnnotation';
export type { MIRIAMAnnotation, IdentifierResolver } from './services/export/MIRIAMAnnotation';

// ── Math Utils ──────────────────────────────────────────────────────
export { normInv, chi2Quantile, jacobiEigenDecomposition, matMul, matTranspose, invertSymmetricMatrix } from './utils/mathUtils';
export { infixToMathML, infixToContentMathML } from './utils/infixToMathML';

// ── ZIP Utils ───────────────────────────────────────────────────────
export { createZip } from './utils/miniZip';
export type { ZipEntry } from './utils/miniZip';

// ── Spatial Simulation ─────────────────────────────────────────────
export * from './services/spatial';

// ── Symbolic Analysis ───────────────────────────────────────────────
export { symConst, symVar, symAdd, symMul, symDiv, symPow, symNeg, simplify, evaluate, differentiate, exprToString, exprToLatex, expand, collectTerms, factor, isPolynomial, degree, freeVariables, substitute } from './services/symbolic/SymbolicExpr';
export type { SymExpr } from './services/symbolic/SymbolicExpr';
export { buildSymbolicODESystem, solveSymbolicSteadyState, symbolicSensitivity, symbolicBifurcationConditions } from './services/symbolic/SymbolicODE';
export type { SymbolicODESystem, SymbolicSteadyState, SymbolicSensitivityResult } from './services/symbolic/SymbolicODE';
export { resultant, solvePolynomialSystem, symbolicGaussianElimination, symbolicDeterminant } from './services/symbolic/PolynomialSolver';

// ── Verification ────────────────────────────────────────────────────
export { parseQuery } from './services/verification/QueryParser';
export type { VerificationQuery, VerificationResult } from './services/verification/QueryParser';
export { checkAbstractReachability, enumerateAbstractComplexes } from './services/verification/ContactMapReachability';
export { boundedReachabilityCheck, checkDeadlock, checkRuleFires } from './services/verification/BoundedVerifier';
export { fullReachabilityCheck } from './services/verification/SymmetryReducedVerifier';
export { buildContactMap } from './services/verification/ContactMapBuilder';
export type { ContactNode, ContactEdge, ContactMap } from './services/verification/ContactMapBuilder';

// ── Structure Learning ──────────────────────────────────────────────
export { enumerateRules, countCandidateRules } from './services/verification/RuleEnumerator';
export type { CandidateRule, EnumerationConfig } from './services/verification/RuleEnumerator';
export { filterCandidates } from './services/verification/CandidateFilter';
export { scoreStructure } from './services/verification/StructureScorer';
export { structureSearch } from './services/inference/StructureABCSMC';
export { assembleModel } from './services/inference/modelAssembly';
export type { StructureSearchConfig, StructureSearchResult, StructureParticle } from './services/inference/StructureABCSMC';

// ── Bifurcation Analysis ────────────────────────────────────────────
export { findSteadyState, computeEigenvalues } from './services/analysis/SteadyStateFinder';
export type { SteadyState, SteadyStateConfig } from './services/analysis/SteadyStateFinder';
export { qrEigenvalues, arnoldiEigenvalues } from './services/analysis/EigenSolver';
export { continuation, detectBifurcation } from './services/analysis/Continuation';
export type { ContinuationConfig, ContinuationPoint, BifurcationPoint, ContinuationResult } from './services/analysis/Continuation';
export { continuationWithConservation, runBifurcationAnalysis } from './services/analysis/ContinuationWithConservation';
export type { ConservedContinuationConfig, ConservedContinuationResult, RunBifurcationAnalysisConfig, RunBifurcationAnalysisResult } from './services/analysis/ContinuationWithConservation';
export { attributeBifurcation, eigenvalueSensitivity } from './services/analysis/BifurcationAttribution';
export type { AttributionResult as BifurcationAttributionResult } from './services/analysis/BifurcationAttribution';
export { computeNullclines } from './services/analysis/Nullclines';
export type { NullclineConfig, NullclineResult } from './services/analysis/Nullclines';

// ── Temporal Information Theory ─────────────────────────────────────
export { analyzeReactionInformation, compareCausalGraphs, buildStructuralEdges, summarizeTemporalAnalysis } from './services/analysis/ReactionInformationTheory';
export type { TemporalAnalysisSummary } from './services/analysis/ReactionInformationTheory';

// ── Phase Handoff ───────────────────────────────────────────────────
export { analyzePhaseHandoff } from './services/analysis/PhaseHandoff';
export type { PhaseHandoffConfig, PhaseHandoffResult } from './services/analysis/PhaseHandoff';
export {
    extractMoleculeNames,
    parseMoleculeTokens,
    extractBindingRequirements,
    type MoleculeToken,
    type MoleculeTokenComponent,
    type BindingRequirement,
} from './services/patterns/patternTokens';
export {
    buildDirectedReactionGraph,
    type ReactionLike,
    type DirectedEdge,
} from './services/patterns/reactionGraph';
export { isSafeObjectKey, setSafeNumberField } from './utils/safeObjectKey';
export { normalizeWhitespace, collapseWhitespace, escapeRegExp } from './utils/stringUtils';
export {
    sanitizeObservableName,
    insertBeforeEndModel,
    hasSimulateAction,
    hasObservablesBlock,
    hasGenerateNetworkAction,
    ensureDefaultObservables,
    ensureDefaultActions,
} from './services/indra/indraModelPrep';
export { updateMassActionRates } from './services/analysis/DoseResponse';
export type { ReactionITConfig, ReactionITResult, MutualInformationResult, TransferEntropyResult, PhaseLockingResult } from './services/analysis/ReactionInformationTheory';

export { analyzeResiduals } from './services/analysis/AnalyzeResiduals';
export type { ExperimentalDataPoint as ResidualExperimentalDataPoint, ResidualAnalysisResult } from './services/analysis/AnalyzeResiduals';

// ── Multi-Model Comparison ──────────────────────────────────────────
export { compareModels, generateVariants, attributeDivergence } from './services/analysis/MultiModelComparator';
export type { ModelVariant, MultiModelResult, MultiModelConfig, DivergencePoint, RuleAttribution } from './services/analysis/MultiModelComparator';

// ── Model Versioning ────────────────────────────────────────────────
export { computeSemanticDiff, createVersionDAG, recordVersion, getHistory, createBranch, serializeDAG, deserializeDAG } from './services/versioning/ModelVersionTracker';
export type { SemanticDiff, ModelVersion, VersionDAG } from './services/versioning/ModelVersionTracker';
export { bisectBehavior, compareVersions } from './services/versioning/BehavioralBisection';
export type { BehavioralProperty, BisectionResult } from './services/versioning/BehavioralBisection';

// ── Differentiable Simulation ───────────────────────────────────────
export { forwardSensitivity, adjointSensitivity, computeObjectiveGradient, setCVodeSensModule } from './services/analysis/DifferentiableSolver';
export type { SensitivityConfig, SensitivityResult, GradientResult } from './services/analysis/DifferentiableSolver';
export { lbfgsOptimize, adamOptimize, trustRegionOptimize } from './services/analysis/GradientOptimizer';
export type { GradientOptimizerConfig, OptimizationResult } from './services/analysis/GradientOptimizer';
export { computeExactFIM } from './services/analysis/ExactFIM';
export type { ExactFIMConfig, ExactFIMResult } from './services/analysis/ExactFIM';

// ── Multi-Scale ─────────────────────────────────────────────────────
export { multiscaleSimulation } from './services/multiscale/MultiscaleSimulation';
export type { MultiscaleConfig, MultiscaleSnapshot, MultiscaleResult } from './services/multiscale/MultiscaleSimulation';
export type { CellState, CellDecisionRule, CellAction, CellTypeDefinition } from './services/multiscale/CellAgent';
export { ExtracellularGrid } from './services/multiscale/ExtracellularGrid';
export { parseMultiscaleModel } from './services/multiscale/MultiscaleParser';
export type { MultiscaleModelDefinition } from './services/multiscale/MultiscaleParser';

// ── Linear Noise Approximation ─────────────────────────────────────
export { computeLNASteadyState, computeLNATimeCourse } from './services/analysis/LinearNoiseApproximation';
export type { LNAConfig, LNASteadyStateResult, LNATimeResult } from './services/analysis/LinearNoiseApproximation';

// ── NFsim Post-Processing ──────────────────────────────────────────
export { analyzeNFsimOutput } from './services/analysis/NFsimAnalysis';
export type { NFsimAnalysisConfig, NFsimAnalysisResult, ComplexSizeDistribution, BondOccupancy, SiteStateDistribution } from './services/analysis/NFsimAnalysis';

// ── First Passage Time ─────────────────────────────────────────────
export { computeFirstPassageTimes } from './services/analysis/FirstPassageTime';
export type { FirstPassageTimeConfig, FPTDistribution } from './services/analysis/FirstPassageTime';

// ── Dose-Response ──────────────────────────────────────────────────
export { computeDoseResponse, computeDoseResponseBySimulation } from './services/analysis/DoseResponse';
export type { DoseResponseConfig, DoseResponseResult, DoseResponseCurve, HillFit } from './services/analysis/DoseResponse';

// ── Perturbation Screen ────────────────────────────────────────────
export { perturbationScreen } from './services/analysis/PerturbationScreen';
export type { PerturbationScreenConfig, PerturbationScreenResult, PerturbationResult, SyntheticLethalPair } from './services/analysis/PerturbationScreen';

// ── Posterior Predictive ───────────────────────────────────────────
export { posteriorPredictive } from './services/inference/PosteriorPredictive';
export type { PosteriorPredictiveConfig, PosteriorPredictiveResult, PredictionBand } from './services/inference/PosteriorPredictive';

// ── PK/PD ───────────────────────────────────────────────────────────
export { generatePKModel, getDefaultPKParameters } from './services/pkpd/PKTemplates';
export type { PKModelType, PKModelConfig, PKModelResult } from './services/pkpd/PKTemplates';
export { generateDosingSchedule, dosingToSimulationPhases } from './services/pkpd/DosingSchedule';
export type { DosingEvent, DosingRegimen, StandardDosingConfig } from './services/pkpd/DosingSchedule';
export { computePKMetrics, trapezoidalAUC, estimateTerminalHalfLife, nonCompartmentalAnalysis } from './services/pkpd/PKMetrics';
export type { PKMetricsResult } from './services/pkpd/PKMetrics';
export { generatePopulation, populationSimulation, summarizePopulationParameters } from './services/pkpd/VirtualPopulation';
export type { PopulationParameter, VirtualPopulationConfig, VirtualPatient, PopulationSimulationResult } from './services/pkpd/VirtualPopulation';
