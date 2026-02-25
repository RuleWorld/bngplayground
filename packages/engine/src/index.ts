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
export { NetworkGenerator } from './services/graph/NetworkGenerator';
export { NetworkExporter } from './services/graph/NetworkExporter';

// ── Feature Flags ──────────────────────────────────────────────────
export { getFeatureFlags, setFeatureFlags, registerCacheClearCallback } from './featureFlags';

// ── Simulation ─────────────────────────────────────────────────────
export { generateExpandedNetwork } from './services/simulation/NetworkExpansion';
export { simulate } from './services/simulation/SimulationLoop';
export { evaluateFunctionalRate, evaluateExpressionOrParse, loadEvaluator, clearAllEvaluatorCaches, containsRateLawMacro, expandRateLawMacros, getCacheSizes, _setEvaluatorRefForTests } from './services/simulation/ExpressionEvaluator';
export { requiresCompartmentResolution, resolveCompartmentVolumes } from './services/simulation/CompartmentResolver';
export { BNGXMLWriter } from './services/simulation/BNGXMLWriter';
export { parseGdat } from './services/simulation/GdatParser';
export { CVODESolver, Rosenbrock23Solver, RK45Solver, AutoSolver, FastRK4Solver, SmartAutoSolver, CVODEAutoSolver, createSolver } from './services/simulation/ODESolver';
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

// ── Utils ───────────────────────────────────────────────────────────
export { SafeExpressionEvaluator } from './utils/safeExpressionEvaluator';
export { SeededRandom } from './utils/random';
export { resolveAutoMethod, getSimulationOptionsFromParsedModel } from './utils/simulationOptions';
export { isMultiPhaseModel, identifyOutputChain, getExpectedRowCount } from './utils/multiPhaseSimulation';
export { formatBNGL } from './utils/formatBNGL';
export { parseParametersFromCode, isNumericLiteral, stripParametersBlock } from './utils/paramUtils';
export { parseObservablePattern, computeObservableValue, computeDynamicObservable, validateObservablePattern } from './utils/dynamicObservable';
export type { DynamicObservableDefinition, ComputedObservableResult } from './utils/dynamicObservable';

// ── Debugger ────────────────────────────────────────────────────────
export { NetworkTracer } from './services/debugger/NetworkTracer';
export { RuleBlocker } from './services/debugger/RuleBlocker';

// ── Interfaces ───────────────────────────────────────────────────────
export type { SimulationEngine, ExpandedNetwork } from './interfaces/SimulationEngine';
export { EngineRegistry } from './interfaces/SimulationEngine';
