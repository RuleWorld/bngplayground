import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

const symbolicSteadyStateArgsSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'BNGL model code' },
  },
  required: ['code'],
};

export async function handleSymbolicSteadyState(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = parseArgs('symbolic_steady_state', symbolicSteadyStateArgsSchema, args);
  try {
    const engine = await import('@bngplayground/engine');
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    const speciesNames = expandedModel.species?.map((s: any) => s.name) || [];
    const reactions = expandedModel.reactions || [];
    const parameterNames = Object.keys(model.parameters || {});

    // Check feasibility
    const nSpecies = speciesNames.length;
    if (nSpecies > 15) {
      return createToolResult({
        error: `System has ${nSpecies} species. Symbolic solution is only feasible for ≤15 species.`,
        suggestion: 'Use numerical steady-state analysis instead.',
      });
    }

    // Build symbolic system
    const system = engine.buildSymbolicODESystem(
      speciesNames, reactions, parameterNames,
      new Float64Array(speciesNames.map((_: any, i: number) => expandedModel.species?.[i]?.initialConcentration || 0)),
    );

    // Solve
    const steadyState = engine.solveSymbolicSteadyState(system);

    // Compute sensitivities
    const sensitivities = engine.symbolicSensitivity(steadyState, parameterNames);

    // Format output
    const solutions: Record<string, string> = {};
    const latex: Record<string, string> = {};
    for (const [species, expr] of Object.entries(steadyState.solutions)) {
      solutions[species] = engine.exprToString(expr as any);
      latex[species] = engine.exprToLatex(expr as any);
    }

    const sensitivityOutput: Record<string, Record<string, string>> = {};
    for (const [species, paramSens] of Object.entries(sensitivities)) {
      sensitivityOutput[species] = {};
      for (const [param, expr] of Object.entries(paramSens as any)) {
        sensitivityOutput[species][param] = engine.exprToString(expr as any);
      }
    }

    return createToolResult({
      solutions,
      latex,
      sensitivities: sensitivityOutput,
      exact: steadyState.exact,
      method: steadyState.method,
      validityConditions: steadyState.validityConditions?.map((c: any) => engine.exprToString(c)),
      technical: `Solved ${nSpecies}-species system via ${steadyState.method}. ${steadyState.exact ? 'Exact' : 'Approximate'} solution.`,
      biological: `Closed-form steady-state expressions found for ${Object.keys(solutions).length} species as functions of rate constants.`,
      strategic: 'Symbolic steady states enable instant parameter sweeps (O(1) per point), exact sensitivity analysis, and analytical bifurcation conditions.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
