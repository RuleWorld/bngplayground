import React from 'react';

export interface Status {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string | React.ReactNode;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationWarning {
  severity: ValidationSeverity;
  message: string;
  suggestion?: string;
  relatedElement?: string;
  sourceHint?: string;
}

export interface EditorMarker {
  severity: ValidationSeverity;
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn?: number;
  endColumn?: number;
}

export interface Example {
  id: string;
  name: string;
  description: string;
  code: string;
  tags: string[];
}

export interface BNGLMoleculeType {
  name: string;
  components: string[];
  comment?: string;
}

export interface BNGLSpecies {
  name: string;
  initialConcentration: number;
}

export interface BNGLObservable {
  type: 'molecules' | 'species' | string;
  name: string;
  pattern: string;
  comment?: string;
}

export interface BNGLCompartment {
  name: string;
  dimension: number;
  size: number;
  parent?: string;
}

export interface BNGLReaction {
  reactants: string[];
  products: string[];
  rate: string;
  rateConstant: number;
  // For functional rates (containing observables or function calls)
  rateExpression?: string;  // Original expression string for dynamic evaluation
  isFunctionalRate?: boolean;  // True if rate depends on observables/functions
  propensityFactor?: number;  // Statistical factor for degeneracy
  productStoichiometries?: number[]; // Volume scaling factors for products
}

// BNG function definition (e.g., gene_Wip1_activity())
export interface BNGLFunction {
  name: string;
  args: string[];  // Function argument names
  expression: string;  // Function body expression
}

export interface ReactionRule {
  name?: string;
  reactants: string[];
  products: string[];
  rate: string;
  rateExpression?: string;
  reverseRate?: string;
  isBidirectional: boolean;
  constraints?: string[];
  deleteMolecules?: boolean;
  allowsIntramolecular?: boolean;
  isFunctionalRate?: boolean;  // True if rate contains observables/functions
  propensityFactor?: number;  // Statistical factor for degeneracy
  comment?: string;
}

export interface BNGLModel {
  parameters: Record<string, number>;
  moleculeTypes: BNGLMoleculeType[];
  species: BNGLSpecies[];
  observables: BNGLObservable[];
  reactions: BNGLReaction[];
  reactionRules: ReactionRule[];
  compartments?: BNGLCompartment[];
  // User-defined functions (e.g., gene_Wip1_activity())
  functions?: BNGLFunction[];
  // Options provided to generate_network() in the BNGL script.
  // These should be parsed from the BNGL file and respected during network generation.
  networkOptions?: {
    maxAgg?: number;
    maxIter?: number;
    maxStoich?: number | Record<string, number>;
    overwrite?: boolean;
  };
  simulationOptions?: Partial<SimulationOptions> & { sparse?: boolean };
  // Multi-phase simulation support - actions block commands
  simulationPhases?: SimulationPhase[];
  concentrationChanges?: ConcentrationChange[];
  parameterChanges?: ParameterChange[];
  // Original parameter expressions for recalculating derived parameters after setParameter
  paramExpressions?: Record<string, string>;
}

// Represents a single simulate_* action
export interface SimulationPhase {
  method: 'ode' | 'ssa' | 'nf';
  // BNGL supports absolute start/end times with optional continuation between phases.
  // If t_start is omitted, BNG defaults to 0 (or current model time if continuing).
  t_start?: number;
  t_end: number;
  n_steps: number;
  // Maps to BNGL `continue=>1` (true) / `continue=>0` (false).
  // When true, BNG requires t_start to equal the current model time.
  continue_from_previous?: boolean;
  atol?: number;
  rtol?: number;
  suffix?: string;
  sparse?: boolean;
  steady_state?: boolean;
  // Maps to BNGL `print_functions=>1` for including function values as output columns.
  // When true, BNG prints zero-arg function values alongside observables in the GDAT.
  print_functions?: boolean;
}

// Represents a setConcentration() call between simulation phases
export interface ConcentrationChange {
  species: string;           // Species pattern or name
  value: number | string;    // New concentration (can be parameter reference)
  afterPhaseIndex: number;   // Execute after this simulation phase (-1 = before first)
}

// Represents a setParameter() call between simulation phases
export interface ParameterChange {
  parameter: string;         // Parameter name
  value: number | string;    // New value (can be expression referencing other params)
  afterPhaseIndex: number;   // Execute after this simulation phase (-1 = before first)
}

export interface SimulationResults {
  headers: string[];  // Observable names (gdat)
  data: Record<string, number>[];  // Observable values per timepoint
  // Species-level data (cdat) - optional, for dynamic observable support
  speciesHeaders?: string[];  // Canonical species names
  speciesData?: Record<string, number>[];  // Species concentrations per timepoint
  // Expanded network data - for flux analysis
  expandedReactions?: BNGLReaction[];  // Concrete reactions from network expansion
  expandedSpecies?: BNGLSpecies[];  // Concrete species from network expansion
}

export interface SimulationOptions {
  // 'default' means "follow the model's authored method/phases".
  // 'ode'/'ssa' force all phases to that method.
  method: 'default' | 'ode' | 'ssa';
  t_end: number;
  n_steps: number;
  // ODE solver options
  atol?: number;           // Absolute tolerance (default: 1e-6)
  rtol?: number;           // Relative tolerance (default: 1e-3)
  solver?: 'auto' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4';  // Solver selection (implementation defines the default if omitted)
  maxSteps?: number;       // Max internal steps per output interval (default: 100000)
  maxStep?: number;        // Max step size (hmax) (default: 0 = unlimited)
  // Steady state options
  steadyState?: boolean;
  steadyStateTolerance?: number;
  steadyStateWindow?: number;
}


export interface SerializedWorkerError {
  name?: string;
  message: string;
  stack?: string;
  details?: Record<string, unknown>;
}

export interface ExtendedError extends Error {
  stack?: string;
  cause?: unknown;
}

export type WorkerRequest =
  | { id: number; type: 'parse'; payload: string }
  | { id: number; type: 'simulate'; payload: { model: BNGLModel; options: SimulationOptions } }
  | { id: number; type: 'cache_model'; payload: { model: BNGLModel } }
  | { id: number; type: 'release_model'; payload: { modelId: number } }
  | { id: number; type: 'simulate'; payload: { modelId: number; parameterOverrides?: Record<string, number>; options: SimulationOptions } }
  | { id: number; type: 'generate_network'; payload: { model: BNGLModel; options?: NetworkGeneratorOptions } }
  | { id: number; type: 'cancel'; payload: { targetId: number } };

export type WorkerResponse =
  | { id: number; type: 'parse_success'; payload: BNGLModel }
  | { id: number; type: 'parse_error'; payload: SerializedWorkerError }
  | { id: number; type: 'simulate_success'; payload: SimulationResults }
  | { id: number; type: 'cache_model_success'; payload: { modelId: number } }
  | { id: number; type: 'cache_model_error'; payload: SerializedWorkerError }
  | { id: number; type: 'release_model_success'; payload: { modelId: number } }
  | { id: number; type: 'release_model_error'; payload: SerializedWorkerError }
  | { id: number; type: 'simulate_error'; payload: SerializedWorkerError }
  | { id: number; type: 'generate_network_success'; payload: BNGLModel }
  | { id: number; type: 'generate_network_error'; payload: SerializedWorkerError }
  | { id: number; type: 'generate_network_progress'; payload: GeneratorProgress }
  | { id: -1; type: 'worker_internal_error'; payload: SerializedWorkerError };

export interface NetworkGeneratorOptions {
  maxSpecies?: number;
  maxReactions?: number;
  maxAgg?: number;
  maxStoich?: number | Map<string, number> | Record<string, number>;
  checkInterval?: number;
  memoryLimit?: number;
  timeLimit?: number;
  maxIterations?: number;
  progressCallback?: (progress: { currentSpecies: number; totalSpecies: number; iteration: number }) => void;
  compartments?: BNGLCompartment[];
}

export interface GeneratorProgress {
  species: number;
  reactions: number;
  iteration: number;
  memoryUsed: number;
  timeElapsed: number;
}
