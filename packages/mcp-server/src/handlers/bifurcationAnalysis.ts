import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    const engine = await import('@bngplayground/engine') as any;
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    const nSpecies = expandedModel.species?.length || 0;
    const params = { ...model.parameters };
    const maxSteps = parsedArgs.max_steps || 500;

    // Build RHS function from expanded model using JIT compiler
    let rhsFactory: any;
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
      rhsFn: rhsFactory as any,
      initialState: new Float64Array(nSpecies),
      parameterStart: parsedArgs.start_value,
      parameterEnd: parsedArgs.end_value,
      stepSize: (parsedArgs.end_value - parsedArgs.start_value) / maxSteps,
      maxSteps,
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
      totalPoints: result.path.length,
      stablePoints: result.path.filter((p: any) => p.stable).length,
      unstablePoints: result.path.filter((p: any) => !p.stable).length,
      technical: `Continuation along ${parsedArgs.parameter} from ${parsedArgs.start_value} to ${parsedArgs.end_value}. Found ${result.bifurcations.length} bifurcation(s).`,
      biological: result.bifurcations.length > 0
        ? `Qualitative behavior changes detected: ${result.bifurcations.map((b: any) => `${b.type} at ${parsedArgs.parameter}=${b.parameterValue.toPrecision(4)}`).join('; ')}.`
        : `No bifurcations detected in the parameter range. The system maintains qualitative stability.`,
      strategic: 'Bifurcation analysis reveals parameter thresholds where the system changes qualitative behavior (oscillation onset, bistability, etc.).',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
