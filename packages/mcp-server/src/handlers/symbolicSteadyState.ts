import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleSymbolicSteadyState(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    const engine = await import('@bngplayground/engine') as any;
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
    const values = steadyState.values ?? steadyState.solutions;
    if (values) {
      for (const [species, expr] of Object.entries(values)) {
        solutions[species] = engine.exprToString(expr as any);
        latex[species] = engine.exprToLatex(expr as any);
      }
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
      exact: steadyState.isExact,
      technical: `Solved ${nSpecies}-species system. ${steadyState.isExact ? 'Exact' : 'Approximate'} solution.`,
      biological: `Closed-form steady-state expressions found for ${Object.keys(solutions).length} species as functions of rate constants.`,
      strategic: 'Symbolic steady states enable instant parameter sweeps (O(1) per point), exact sensitivity analysis, and analytical bifurcation conditions.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
  }
}
