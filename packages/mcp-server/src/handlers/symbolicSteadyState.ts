import { ToolArgs, ToolResult, MCPErrorResult, SymbolicSteadyStateResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { symbolicSteadyStateArgsSchema } from '../schemas/index.js';
import { structureError } from '../services/errors.js';

export async function handleSymbolicSteadyState(
  args: ToolArgs
): Promise<ToolResult<SymbolicSteadyStateResult | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('symbolic_steady_state', symbolicSteadyStateArgsSchema, args);
    const engine = await import('@bngplayground/engine');
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    const speciesNames = expandedModel.species?.map((s) => s.name) || [];
    const reactions = expandedModel.reactions || [];
    const parameterNames = Object.keys(model.parameters || {});

    // Check feasibility
    const nSpecies = speciesNames.length;
    if (nSpecies > 15) {
      const errorMsg = `System has ${nSpecies} species. Symbolic solution is only feasible for ≤15 species.`;
      const errRes: MCPErrorResult = {
        code: 'SYMBOLIC_SYSTEM_TOO_LARGE',
        error: errorMsg,
        diagnosis: 'Symbolic elimination / solving complexity scales exponentially with species count.',
        recovery: 'Use numerical steady-state analysis or dose sweep instead.',
        severity: 'recoverable',
        relatedTools: ['dose_response', 'simulate'],
      };
      return createToolResult(errRes);
    }

    const initialConcentrations = speciesNames.map((_, i) => expandedModel.species?.[i]?.initialConcentration ?? 0);

    // Build symbolic system
    const system = engine.buildSymbolicODESystem(
      speciesNames,
      reactions,
      parameterNames,
      initialConcentrations,
    );

    // Solve
    const steadyState = engine.solveSymbolicSteadyState(system);

    // Compute sensitivities
    const sensitivities = engine.symbolicSensitivity(system, steadyState, parameterNames);

    // Format output
    const solutions: Record<string, string> = {};
    const latex: Record<string, string> = {};
    if (steadyState.values) {
      for (const [species, expr] of steadyState.values.entries()) {
        solutions[species] = engine.exprToString(expr);
        latex[species] = engine.exprToLatex(expr);
      }
    }

    const sensitivityOutput: Record<string, Record<string, string>> = {};
    if (sensitivities.sensitivities) {
      for (const [param, speciesMap] of sensitivities.sensitivities.entries()) {
        for (const [species, expr] of speciesMap.entries()) {
          if (!sensitivityOutput[species]) {
            sensitivityOutput[species] = {};
          }
          sensitivityOutput[species][param] = engine.exprToString(expr);
        }
      }
    }

    const resultPayload: SymbolicSteadyStateResult = {
      solutions,
      latex,
      sensitivities: sensitivityOutput,
      exact: steadyState.isExact,
      technical: `Solved ${nSpecies}-species system. ${steadyState.isExact ? 'Exact' : 'Approximate'} solution.`,
      biological: `Closed-form steady-state expressions found for ${Object.keys(solutions).length} species as functions of rate constants.`,
      strategic: 'Symbolic steady states enable instant parameter sweeps (O(1) per point), exact sensitivity analysis, and analytical bifurcation conditions.',
    };

    return createToolResult(resultPayload);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error), { cause: error });
    return createToolResult(structureError(errObj));
  }
}
