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
    line?: number;
    column?: number;
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


export interface BNGLPopulationMap {
  /** Species pattern being lumped (e.g., "A(b!1).B(a!1)") */
  pattern: string;
  /** Population variable name (e.g., "P0001") */
  populationName: string;
  /** Lumping rate constant name or value */
  lumpingRate: string;
}

export interface BNGLPopulationType {
  /** Population molecule name (e.g., "P0001") */
  name: string;
  /** Components (usually empty for lumped populations) */
  components: string[];
}
export interface BNGLReaction {
    reactants: string[];
    products: string[];
    rate: string;
    rateConstant: number;
    name?: string;
    rateExpression?: string;
    isFunctionalRate?: boolean;
    propensityFactor?: number;
    degeneracy?: number;
    statFactor?: number;
    totalRate?: boolean;
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
    literalReactants?: string[];
    literalProducts?: string[];
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
    line?: number;
    column?: number;
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
  populationMaps?: BNGLPopulationMap[];
  populationTypes?: BNGLPopulationType[];
}

export interface SimulationPhase {
    method: 'ode' | 'ssa' | 'nf' | 'nfsim' | 'pla' | 'psa';
    t_start?: number;
    t_end: number;
    n_steps: number;
    continue?: boolean;
    atol?: number;
    rtol?: number;
    suffix?: string;
    sparse?: boolean;
    steady_state?: boolean;
    stop_if?: string;  // Boolean expression to evaluate at each step; stop if true
    print_functions?: boolean;
    utl?: number;
    gml?: number;
    equilibrate?: number;
    useAdams?: boolean;
    /** BNG2 parity: non-uniform output time points (sample_times=>[t1,t2,...]) */
    sample_times?: number[];
    /** BNG2 parity: print_CDAT=>0 suppresses species concentration columns from output */
    print_CDAT?: boolean;
    /** PSA: population threshold for ODE vs SSA partitioning (default 100) */
    poplevel?: number;
}

export interface ConcentrationChange {
    species: string;
    value: number | string;
    mode?: 'set' | 'add' | 'save' | 'reset';
    afterPhaseIndex: number;
    /** Optional label for saveConcentrations/resetConcentrations (BNG2 Cache semantics) */
    label?: string;
}

export interface ParameterChange {
    parameter: string;
    value: number | string;
    afterPhaseIndex: number;
    /** BNG2 parity: 'set' (default setParameter), 'save' (saveParameters), 'reset' (resetParameters) */
    mode?: 'set' | 'save' | 'reset';
    /** Optional label for saveParameters/resetParameters (BNG2 Cache semantics) */
    label?: string;
}

export interface ReactionFiringEvent {
    time: number;
    reactionIndex: number;
    ruleName?: string;
    propensity: number;
}

export interface SimulationResults {
    headers: string[];
    data: Record<string, number>[];
    dataBySuffix?: Record<string, Record<string, number>[]>;
    speciesHeaders?: string[];
    speciesData?: Record<string, number>[];
    speciesDataBySuffix?: Record<string, Record<string, number>[]>;
    expandedReactions?: BNGLReaction[];
    expandedSpecies?: BNGLSpecies[];
    ssaInfluence?: SSAInfluenceTimeSeries;
    /** Reaction firing log (only populated when recordFirings=true and method='ssa') */
    firingLog?: ReactionFiringEvent[];
    /** Dense output buffer for continuous interpolation (only populated when denseOutput=true and method='ode') */
    denseOutput?: import('./services/simulation/DenseOutput').DenseOutputBuffer;
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
    method: 'default' | 'ode' | 'ssa' | 'nf' | 'nfsim' | 'pla' | 'psa';
    t_end: number;
    n_steps: number;
    atol?: number;
    rtol?: number;
    // `cvode` uses CVODE as the primary solver and automatically falls back to
    // Rosenbrock23 on hard CVODE failures (convergence/invalid-state guard).
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
    /** Record individual reaction firing events for information-theoretic analysis */
    recordFirings?: boolean;
    /** Maximum firing events to record (prevents memory blowout, default: 100000) */
    maxFiringEvents?: number;
    useAdams?: boolean;
    /** PSA: population threshold for ODE vs SSA partitioning (default 100) */
    poplevel?: number;
    /** Optional callback invoked by the solver after each integration step */
    onStep?: (currentStep: number, maxSteps: number) => void;
    /** Enable Hermite dense output (continuous interpolation between steps). Default: false. */
    denseOutput?: boolean;
}

export interface SerializedWorkerError {
    name?: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
}

export interface SharedSimulationOutputDescriptor {
    slot: number;
    runCount: number;
    rowCount: number;
    columnCount: number;
    headers: string[];
    valuesBuffer: SharedArrayBuffer;
    completionBuffer: SharedArrayBuffer;
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
    | { id: number; type: 'simulate'; payload: { modelId: number; parameterOverrides?: Record<string, number>; options: SimulationOptions; sharedOutput?: SharedSimulationOutputDescriptor } }
    | { id: number; type: 'generate_network'; payload: { model: BNGLModel; options?: NetworkGeneratorOptions } }
    | { id: number; type: 'atomize'; payload: string }
    | { id: number; type: 'cancel'; payload: { targetId: number } }
    | { id: number; type: 'analyse_network'; payload: NetworkAnalysisPayload };

export type WorkerResponse =
    | { id: number; type: 'parse_success'; payload: BNGLModel }
    | { id: number; type: 'parse_error'; payload: SerializedWorkerError }
    | { id: number; type: 'atomize_success'; payload: AtomizerResult }
    | { id: number; type: 'atomize_error'; payload: SerializedWorkerError }
    | { id: number; type: 'simulate_success'; payload: SimulationResults }
    | { id: number; type: 'simulate_shared_success'; payload: { slot: number } }
    | { id: number; type: 'cache_model_success'; payload: { modelId: number } }
    | { id: -1; type: 'worker_internal_error'; payload: SerializedWorkerError }
    | { id: number; type: 'cache_model_error'; payload: SerializedWorkerError }
    | { id: number; type: 'release_model_success'; payload: { modelId: number } }
    | { id: number; type: 'release_model_error'; payload: SerializedWorkerError }
    | { id: number; type: 'simulate_error'; payload: SerializedWorkerError }
    | { id: number; type: 'generate_network_success'; payload: BNGLModel }
    | { id: number; type: 'generate_network_error'; payload: SerializedWorkerError }
    | { id: number; type: 'generate_network_progress'; payload: GeneratorProgress }
    | { id: number; type: 'analyse_network_success'; payload: IgraphAnalysisResult }
    | { id: number; type: 'analyse_network_error'; payload: SerializedWorkerError };

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

export interface NetworkAnalysisPayload {
    edges: Array<{ from: number; to: number }>;
    nodeLabels: string[];
    directed: boolean;
    graphType: 'reaction' | 'molecular' | 'regulatory';
}

export interface IgraphAnalysisResult {
    nodeCount: number;
    edgeCount: number;
    nodeLabels: string[];
    graphType: 'reaction' | 'molecular' | 'regulatory';
    degree: number[];
    inDegree: number[];
    outDegree: number[];
    betweenness: number[];
    closeness: number[];
    pagerank: number[];
    localClustering: number[];
    communityIds: number[];
    communityCount: number;
    modularity: number;
    globalClustering: number;
    diameter: number;
    avgPathLength: number;
    components: number;
    isConnected: boolean;
}
