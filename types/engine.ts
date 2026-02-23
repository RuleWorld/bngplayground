export interface Example {
    id: string;
    name: string;
    description: string;
    /** Embedded code (present for bundled models, absent after lazy-loading migration). */
    code?: string;
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
    isConstant?: boolean;
    initialExpression?: string;
}

export interface BNGLObservable {
    type: 'molecules' | 'species' | 'counter' | string;
    name: string;
    pattern: string;
    comment?: string;
    countFilter?: number;
    countRelation?: string;
}

export interface BNGLCompartment {
    name: string;
    dimension: number;
    size: number;
    parent?: string;
    resolvedVolume?: number;
    scalingFactor?: number;
}

export interface BNGLEnergyPattern {
    name?: string;
    pattern: string;
    expression: string;
    value?: number;
}

export interface BNGLReaction {
    reactants: string[];
    products: string[];
    rate: string;
    rateConstant: number;
    rateExpression?: string;
    isFunctionalRate?: boolean;
    propensityFactor?: number;
    productStoichiometries?: number[];
    scalingVolume?: number;
    isArrhenius?: boolean;
    arrheniusPhi?: string;
    arrheniusEact?: string;
    arrheniusA?: string;
    isReverseArrhenius?: boolean;
    reverseArrheniusPhi?: string;
    reverseArrheniusEact?: string;
    reverseArrheniusA?: string;
}

export interface BNGLFunction {
    name: string;
    args: string[];
    expression: string;
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
    moveConnected?: boolean;
    matchOnce?: boolean;
    allowsIntramolecular?: boolean;
    isFunctionalRate?: boolean;
    propensityFactor?: number;
    comment?: string;
    reactionString?: string;
    totalRate?: boolean;
    isArrhenius?: boolean;
    arrheniusPhi?: string;
    arrheniusEact?: string;
    arrheniusA?: string;
    isReverseArrhenius?: boolean;
    reverseArrheniusPhi?: string;
    reverseArrheniusEact?: string;
    reverseArrheniusA?: string;
}

export interface BNGLAction {
    type: string;
    args: Record<string, any>;
}

export interface BNGLModel {
    name?: string;
    parameters: Record<string, number>;
    moleculeTypes: BNGLMoleculeType[];
    species: BNGLSpecies[];
    observables: BNGLObservable[];
    limitations?: string[];
    actions?: BNGLAction[];
    reactions: BNGLReaction[];
    reactionRules: ReactionRule[];
    compartments?: BNGLCompartment[];
    functions?: BNGLFunction[];
    networkOptions?: {
        maxSpecies?: number;
        maxReactions?: number;
        maxAgg?: number;
        maxIter?: number;
        maxStoich?: number | Record<string, number>;
        overwrite?: boolean;
    };
    simulationOptions?: Partial<SimulationOptions>;
    simulationPhases?: SimulationPhase[];
    concentrationChanges?: ConcentrationChange[];
    parameterChanges?: ParameterChange[];
    paramExpressions?: Record<string, string>;
    energyPatterns?: BNGLEnergyPattern[];
}

export interface SimulationPhase {
    method: 'ode' | 'ssa' | 'nf' | 'nfsim';
    t_start?: number;
    t_end: number;
    n_steps: number;
    continue?: boolean;
    atol?: number;
    rtol?: number;
    suffix?: string;
    sparse?: boolean;
    steady_state?: boolean;
    print_functions?: boolean;
    utl?: number;
    gml?: number;
    equilibrate?: number;
}

export interface ConcentrationChange {
    species: string;
    value: number | string;
    mode?: 'set' | 'add' | 'save' | 'reset';
    afterPhaseIndex: number;
}

export interface ParameterChange {
    parameter: string;
    value: number | string;
    afterPhaseIndex: number;
}

export interface SimulationResults {
    headers: string[];
    data: Record<string, number>[];
    speciesHeaders?: string[];
    speciesData?: Record<string, number>[];
    expandedReactions?: BNGLReaction[];
    expandedSpecies?: BNGLSpecies[];
    ssaInfluence?: SSAInfluenceTimeSeries;
}

export interface SSAInfluenceData {
    ruleNames: string[];
    din_hits: number[];
    din_fluxs: number[][];
    din_start: number;
    din_end: number;
}

export interface SSAInfluenceTimeSeries {
    windows: SSAInfluenceData[];
    globalSummary: SSAInfluenceData;
}

export interface SimulationOptions {
    method: 'default' | 'ode' | 'ssa' | 'nf' | 'nfsim';
    t_end: number;
    n_steps: number;
    atol?: number;
    rtol?: number;
    solver?: 'auto' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4';
    maxSteps?: number;
    maxStep?: number;
    steadyState?: boolean;
    steadyStateTolerance?: number;
    steadyStateWindow?: number;
    stabLimDet?: boolean;
    maxOrd?: number;
    maxNonlinIters?: number;
    nonlinConvCoef?: number;
    maxErrTestFails?: number;
    maxConvFails?: number;
    adaptiveCvodeTuning?: boolean;
    minStep?: number;
    print_functions?: boolean;
    sparse?: boolean;
    recordFromPhase?: number;
    seed?: number;
    maxIterations?: number;
    maxSpecies?: number;
    utl?: number;
    gml?: number;
    equilibrate?: number;
    memoryLimit?: number;
    verbose?: boolean;
    includeInfluence?: boolean;
    includeSpeciesData?: boolean;
    maxEvents?: number;
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
    | { id: number; type: 'atomize'; payload: string }
    | { id: number; type: 'cancel'; payload: { targetId: number } };

export type WorkerResponse =
    | { id: number; type: 'parse_success'; payload: BNGLModel }
    | { id: number; type: 'parse_error'; payload: SerializedWorkerError }
    | { id: number; type: 'atomize_success'; payload: AtomizerResult }
    | { id: number; type: 'atomize_error'; payload: SerializedWorkerError }
    | { id: number; type: 'simulate_success'; payload: SimulationResults }
    | { id: number; type: 'cache_model_success'; payload: { modelId: number } }
    | { id: -1; type: 'worker_internal_error'; payload: SerializedWorkerError }
    | { id: number; type: 'cache_model_error'; payload: SerializedWorkerError }
    | { id: number; type: 'release_model_success'; payload: { modelId: number } }
    | { id: number; type: 'release_model_error'; payload: SerializedWorkerError }
    | { id: number; type: 'simulate_error'; payload: SerializedWorkerError }
    | { id: number; type: 'generate_network_success'; payload: BNGLModel }
    | { id: number; type: 'generate_network_error'; payload: SerializedWorkerError }
    | { id: number; type: 'generate_network_progress'; payload: GeneratorProgress };

export interface AtomizerResult {
    bngl: string;
    database: any;
    annotation: any;
    observableMap: Map<string, string>;
    log: any[];
    success: boolean;
    error?: string;
}

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
    seedConcentrationMap?: Map<string, number>;
}

export interface GeneratorProgress {
    species: number;
    reactions: number;
    iteration: number;
    memoryUsed: number;
    timeElapsed: number;
}
