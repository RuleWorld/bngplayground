import {
    BNGLParser
} from '@bngplayground/engine';

export type ToolArgs = Record<string, unknown> | undefined;

export type ToolResult<T> = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    structuredContent: T;
    isError?: boolean;
};

export type { ContactNode, ContactEdge, ContactMap, ValidationMessage, ValidateModelResult } from '@bngplayground/engine';

export type ParameterScanResult = {
    mode: '1d' | '2d';
    xValues: number[];
    observables: Record<string, number[] | number[][]>;
    yValues?: number[];
    parameter: string;
    parameter2?: string;
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

export interface VerifyModelResult {
    query: string;
    answer: boolean | number | 'unknown';
    confidence: 'exact' | 'over_approximate' | 'bounded' | 'unknown';
    layerUsed: number;
    explanation: string;
    technical?: string;
    biological?: string;
    strategic?: string;
    bound?: number;
    witness?: {
        speciesIndex: number;
        speciesString: string;
        generatingRuleSequence: string[];
    } | string[];
    speciesExplored?: number;
}
