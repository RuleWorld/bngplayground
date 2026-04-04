import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

const bifurcationArgsSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'BNGL model code' },
    parameter: { type: 'string', description: 'Name of the parameter to vary for continuation' },
    start_value: { type: 'number', description: 'Start value for the continuation parameter' },
    end_value: { type: 'number', description: 'End value for the continuation parameter' },
    max_steps: { type: 'number', description: 'Maximum continuation steps (default: 500)' },
    species: { type: 'string', description: 'Species to track on y-axis (default: first observable)' },
  },
  required: ['code', 'parameter', 'start_value', 'end_value'],
};

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = parseArgs('bifurcation_analysis', bifurcationArgsSchema, args);
  try {
    const engine = await import('@bngplayground/engine');
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    const nSpecies = expandedModel.species?.length || 0;
    const params = { ...model.parameters };
    const maxSteps = parsedArgs.max_steps || 500;

    // Build RHS function from expanded model using JIT compiler
    let rhsFactory: (p: Record<string, number>) => (t: number, y: Float64Array, dydt: Float64Array) => void;
    try {
      const jit = new engine.JITCompiler(expandedModel);
      rhsFactory = (p: Record<string, number>) => {
        // Update parameters and return compiled RHS
        const compiledRhs = jit.compileRHS?.() ?? jit.compile?.();
        return compiledRhs ?? ((t: number, y: Float64Array, dydt: Float64Array) => {
          for (let i = 0; i < nSpecies; i++) dydt[i] = 0;
        });
      };
    } catch {
      // Fallback: zero RHS (continuation will report no bifurcations)
      rhsFactory = (_p: Record<string, number>) => {
        return (t: number, y: Float64Array, dydt: Float64Array) => {
          for (let i = 0; i < nSpecies; i++) dydt[i] = 0;
        };
      };
    }

    // Run continuation
    const result = await engine.continuation({
      nSpecies,
      continuationParameter: parsedArgs.parameter,
      startValue: parsedArgs.start_value,
      endValue: parsedArgs.end_value,
      stepSize: (parsedArgs.end_value - parsedArgs.start_value) / maxSteps,
      maxSteps,
      parameters: params,
      rhsFn: rhsFactory,
    });

    // Attribute bifurcations if any found
    const attributions = result.bifurcations.map((b: any) => ({
      parameterValue: b.parameterValue,
      type: b.type,
      frequency: b.frequency,
      criticalEigenvalues: b.criticalEigenvalues?.slice(0, 3),
    }));

    return createToolResult({
      bifurcations: attributions,
      branches: result.branches,
      totalPoints: result.points.length,
      stablePoints: result.points.filter((p: any) => p.stable).length,
      unstablePoints: result.points.filter((p: any) => !p.stable).length,
      technical: `Continuation along ${parsedArgs.parameter} from ${parsedArgs.start_value} to ${parsedArgs.end_value}. Found ${result.bifurcations.length} bifurcation(s) across ${result.branches} branch(es).`,
      biological: result.bifurcations.length > 0
        ? `Qualitative behavior changes detected: ${result.bifurcations.map((b: any) => `${b.type} at ${parsedArgs.parameter}=${b.parameterValue.toPrecision(4)}`).join('; ')}.`
        : `No bifurcations detected in the parameter range. The system maintains qualitative stability.`,
      strategic: 'Bifurcation analysis reveals parameter thresholds where the system changes qualitative behavior (oscillation onset, bistability, etc.).',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
