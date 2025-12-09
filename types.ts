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
  type: 'molecules' | 'species';
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
  reverseRate?: string;
  isBidirectional: boolean;
  constraints?: string[];
  deleteMolecules?: boolean;
  allowsIntramolecular?: boolean;
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
    maxStoich?: Record<string, number>;
    overwrite?: boolean;
  };
  simulationOptions?: Partial<SimulationOptions> & { sparse?: boolean };
}

export interface SimulationResults {
  headers: string[];
  data: Record<string, number>[];
}

export interface SimulationOptions {
  method: 'ode' | 'ssa';
  t_end: number;
  n_steps: number;
  // ODE solver options
  atol?: number;           // Absolute tolerance (default: 1e-6)
  rtol?: number;           // Relative tolerance (default: 1e-3)
  solver?: 'auto' | 'cvode' | 'rosenbrock23' | 'rk45' | 'rk4';  // Solver selection (default: 'auto')
  maxSteps?: number;       // Max internal steps per output interval (default: 100000)
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
}

export interface GeneratorProgress {
  species: number;
  reactions: number;
  iteration: number;
  memoryUsed: number;
  timeElapsed: number;
}
