export type ComposeSeedSpecies = {
    species: string;
    count: number;
};

export type ComposeRule = {
    name: string;
    rule: string;
    source: string;
};

export type ComposeAnalysis = {
    recognizedCount: number;
    unparsedStatements: string[];
};

export type ComposeMolecule = {
    name: string;
    sites: string[];
    states: Record<string, string[]>;
};

export type SuggestedFix = {
    issue: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
};

export type ExplainSection = {
    title: string;
    content: string;
};

export type StiffnessResult = {
    category: string;
    ratio: number;
    features: string[];
};

export type DynamicsResult = {
    reaches_steady_state: boolean;
    likely_oscillatory: boolean;
};

export type ConservationResult = {
    count: number;
    preview: string[];
};

export type SobolSummary = {
    observable: string;
    topFirstOrder: Array<{ name: string; value: number }>;
    topTotalOrder: Array<{ name: string; value: number }>;
};

export type FIMSummary = {
    conditionNumber: number;
    identifiableParams: string[];
    unidentifiableParams: string[];
};

export type ContactMapStep = {
    molecule: string;
    site?: string;
    interaction: 'binding' | 'state_change' | 'synthesis' | 'degradation';
    rule: string;
};

export type CausalTraceEntry = {
    parameter: string;
    firstOrder: number;
    implicatedRules: string[];
    targetObservable?: string;
    topologyPath?: string[];
    contactMapPath?: ContactMapStep[];
    narrative?: string;
};

export type ProfileLikelihoodResult = {
    profiles: Record<string, {
        identifiability: 'identifiable' | 'practically_unidentifiable' | 'structurally_unidentifiable';
        ci: { lower: number; upper: number } | null;
        flat: boolean;
    }>;
    threshold: number;
    baselineSSR: number;
};

export type ParameterSelection = {
    strategy: 'triage_end_observable' | 'magnitude';
    candidates: number;
    analyzed: number;
    selectedParameters: string[];
};

export type CompilationSurprise = {
    numRules: number;
    numGeneratedSpecies: number;
    numGeneratedReactions: number;
    surpriseLevel: 'high' | 'moderate' | 'none';
    warning?: string;
};

export type IrreversibleStep = {
    rule: string;
    type: 'degradation' | 'cleavage' | 'irreversible_modification';
    controllingParameters: string[];
    note: string;
};

export type PlausibilityCheck = {
    parameter: string;
    value: number;
    issue: string;
    physicalBound: number;
    message: string;
};

export type UnreachableAnalysis = {
    unreachableRules: string[];
    totalRules: number;
    performanceNote: string;
};

export type SurpriseDetection = {
    observable: string;
    surprise: string;
    severity: 'low' | 'medium' | 'high';
};

export type DiminishingReturns = {
    detected: boolean;
    message: string;
};

export type CrosstalkWarning = {
    molecule: string;
    pathways: number;
    rules: string[];
    warning: string;
};

export type DiagnosticSummary = {
    technical: string;
    biological: string;
    strategic: string;
};

export type DriftInfo = {
    totalOperations: number;
    structuralChanges: number;
    parametricChanges: number;
    driftWarning?: string;
};

export type ScopeInfo = {
    includes: string[];
    excludes: string[];
    justification: string;
};