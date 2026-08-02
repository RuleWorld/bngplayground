import {
    validateModelForNFsim,
    BNGLParser
} from '@bngplayground/engine';

export type ToolArgs = Record<string, unknown> | undefined;

export type ToolResult<T> = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    structuredContent: T;
};

export type ValidationMessage = {
    source: 'parse' | 'model' | 'observable' | 'nfsim';
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    relatedElement?: string;
};

export type ContactNode = {
    id: string;
    label: string;
    type: 'molecule' | 'component' | 'state' | 'compartment';
    parent?: string;
    isGroup?: boolean;
};

export type ContactEdge = {
    from: string;
    to: string;
    interactionType: 'binding';
    componentPair?: [string, string];
    ruleIds: string[];
    ruleLabels: string[];
};

export type ContactMap = {
    nodes: ContactNode[];
    edges: ContactEdge[];
};

export type ParameterScanResult = {
    mode: '1d' | '2d';
    xValues: number[];
    observables: Record<string, number[] | number[][]>;
    yValues?: number[];
    parameter: string;
    parameter2?: string;
};

export type ValidateModelResult = {
    valid: boolean;
    parseSuccess: boolean;
    parseErrors: Array<{ line: number; column: number; message: string }>;
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    info: ValidationMessage[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
    nfsim: ReturnType<typeof validateModelForNFsim> | null;
};

export type ParsedSpeciesGraph = ReturnType<typeof BNGLParser.parseSpeciesGraph>;

export interface MCPErrorResult {
    error: string;
    diagnosis: string;
    recovery: string;
    severity: 'fatal' | 'recoverable' | 'warning';
    relatedTools?: string[];
}

export interface SymbolicSteadyStateResult {
    solutions: Record<string, string>;
    latex: Record<string, string>;
    sensitivities: Record<string, Record<string, string>>;
    exact: boolean;
    technical: string;
    biological: string;
    strategic: string;
}
