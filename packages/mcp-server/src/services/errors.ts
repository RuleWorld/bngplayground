import { MCPErrorResult } from '../types/index.js';

/**
 * Analyzes an Error object from the engine or execution layer and translates
 * it into a structured MCPErrorResult, mapping known failure conditions (like
 * ODE divergence, BNGL syntax errors, network generation limits, timeout, etc.)
 * into a categorized diagnosis, recovery suggestion, severity level, and related tools.
 *
 * Invariants:
 * - This function must not change error behavior or swallow errors, it purely translates an existing Error into a predictable schema for the MCP client.
 * - Always provides a 'fatal' severity fallback with generic diagnosis for unrecognized errors.
 *
 * @param error - The raw Error object caught during engine simulation, validation, or other operations.
 * @returns A structured MCPErrorResult containing the original message, a diagnosis, suggested recovery steps, severity, and optionally related MCP tools.
 */
export function structureError(error: Error): MCPErrorResult {
    const msg = error.message;
    if (error.name === 'AnalysisDataError') {
        return {
            code: 'INVALID_ANALYSIS_RESULT',
            error: msg,
            diagnosis: 'The analysis received an empty, malformed, non-finite, or structurally incompatible simulation trajectory.',
            recovery: 'Run simulate first and ensure it returns sorted time points, at least one observable column, and finite numeric values at every reported time point.',
            severity: 'recoverable',
            relatedTools: ['simulate', 'validate_model'],
        };
    }
    if (msg.includes('Invalid arguments for')) {
        return {
            code: 'INVALID_ARGUMENTS',
            error: msg,
            diagnosis: 'The arguments passed to the MCP tool did not match the expected schema.',
            recovery: 'Check the tool schema definition and ensure all required fields are provided with correct types and formats.',
            severity: 'recoverable',
        };
    }
    if (msg.includes('diverged') || msg.includes('step size')) {
        return {
            code: 'SOLVER_FAILURE',
            error: msg,
            diagnosis: 'ODE solver failed — likely stiff system or rate constant mismatch.',
            recovery: 'Try: (1) switch solver to cvode or rosenbrock23, (2) reduce t_end to locate divergence point, (3) check for rate constants differing by >6 orders of magnitude.',
            severity: 'recoverable',
            relatedTools: ['diagnose_model'],
        };
    }
    if (msg.includes('parse') || msg.includes('BNGL parse')) {
        return {
            code: 'BNGL_PARSE_ERROR',
            error: msg,
            diagnosis: 'BNGL syntax error in the model code.',
            recovery: 'Use suggest_fix to get auto-corrected code, or check for missing end statements and unmatched parentheses.',
            severity: 'recoverable',
            relatedTools: ['suggest_fix', 'validate_model'],
        };
    }
    if (msg.includes('network') || msg.includes('expansion')) {
        return {
            code: 'NETWORK_GENERATION_FAILED',
            error: msg,
            diagnosis: 'Network generation failed or hit size limits.',
            recovery: 'Reduce max_agents/max_iterations, or use NFsim (method: "nf") for large models.',
            severity: 'recoverable',
            relatedTools: ['simulate'],
        };
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return {
            code: 'TIMEOUT',
            error: msg,
            diagnosis: 'Operation timed out — model may be too complex or parameters causing slow simulation.',
            recovery: 'Reduce t_end, n_steps, or max_iterations. Consider using NFsim for stochastic simulation of large models.',
            severity: 'recoverable',
            relatedTools: ['diagnose_model', 'simulate'],
        };
    }
    if (msg.includes('FIM') || msg.includes('singular') || msg.includes('determinant')) {
        return {
            code: 'FIM_SINGULAR',
            error: msg,
            diagnosis: 'Fisher Information Matrix is singular — parameters are not identifiable.',
            recovery: 'The system is over-parameterized. Consider fixing some parameters or measuring different observables.',
            severity: 'recoverable',
            relatedTools: ['diagnose_model', 'identifiability_analysis'],
        };
    }
    if (msg.includes('NFsim') || msg.includes('nfsim')) {
        return {
            code: 'NFSIM_INCOMPATIBLE',
            error: msg,
            diagnosis: 'NFsim incompatibility detected.',
            recovery: 'NFsim does not support functional rates or certain rule patterns. Use ODE or SSA method instead.',
            severity: 'recoverable',
            relatedTools: ['simulate'],
        };
    }
    if (msg.includes('export') || msg.includes('SED-ML') || msg.includes('SBML') || msg.includes('OMEX')) {
        return {
            code: 'EXPORT_UNSUPPORTED',
            error: msg,
            diagnosis: 'Export failed — model may contain unsupported features.',
            recovery: 'Check that the model does not use NFsim-specific features, functional rates, or complex compartment rules.',
            severity: 'recoverable',
            relatedTools: ['validate_model'],
        };
    }
    if (msg.includes('memory') || msg.includes('heap') || msg.includes('allocation')) {
        return {
            code: 'RESOURCE_EXHAUSTED',
            error: msg,
            diagnosis: 'Out of memory — model is too large for available resources.',
            recovery: 'Reduce max_agents, max_reactions, or max_iterations. Consider using NFsim for stochastic simulation.',
            severity: 'recoverable',
            relatedTools: ['diagnose_model'],
        };
    }
    if (msg.includes('stack') || msg.includes('recursion') || msg.includes('call stack')) {
        return {
            code: 'STACK_OVERFLOW',
            error: msg,
            diagnosis: 'Stack overflow — model may have cyclic rules or excessive recursion.',
            recovery: 'Check for recursive rule patterns. Consider simplifying the model structure.',
            severity: 'recoverable',
            relatedTools: ['validate_model', 'diagnose_model'],
        };
    }
    if (msg.includes('invalid') || msg.includes('undefined') || msg.includes('null')) {
        return {
            code: 'INVALID_MODEL_VALUE',
            error: msg,
            diagnosis: 'Invalid value detected — model contains undefined parameters or invalid references.',
            recovery: 'Check that all parameters and species referenced in rules are properly defined.',
            severity: 'recoverable',
            relatedTools: ['validate_model'],
        };
    }
    // Generic fallback
    return {
        code: 'UNEXPECTED_ERROR',
        error: msg,
        diagnosis: 'Unexpected error during tool execution.',
        recovery: 'Retry with simpler parameters or check the model with validate_model first.',
        severity: 'fatal',
    };
}
