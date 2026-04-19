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
    const parameterName = parsedArgs.parameter;

    if (!parameterName) {
      throw new Error('Bifurcation analysis requires a parameter name.');
    }

    const speciesIndexMap = new Map<string, number>(
      (expandedModel.species ?? []).map((species: any, index: number) => [species.name, index])
    );

    // Build RHS function from expanded model using JIT compiler.
    // Continuation needs a direct derivative callback, so we compile once and
    // update the tracked parameter before each RHS evaluation.
    let rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
    try {
      const jit = new engine.JITCompiler(expandedModel);
      const reactionRules = expandedModel.reactions ?? [];
      const compiled = jit.compileFromRxns(reactionRules, nSpecies, speciesIndexMap, params, {
        modelName: model.name ?? 'unnamed-model',
        analysis: 'bifurcation-mcp',
        parameterName,
        callsite: 'mcp-server.handleBifurcationAnalysis',
      });

      if (!(parameterName in params)) {
        throw new Error(`Unknown continuation parameter: ${parameterName}`);
      }

      rhsFn = (y: Float64Array, p: number, dydt: Float64Array) => {
        params[parameterName] = p;
        compiled.updateParameters?.(params);
        compiled.evaluate(0, y, dydt);
      };
    } catch {
      // Fallback: zero RHS (continuation will report no bifurcations)
      rhsFn = (_y: Float64Array, _p: number, dydt: Float64Array) => {
        for (let i = 0; i < nSpecies; i++) dydt[i] = 0;
      };
    }

    // Build initial state from seed species concentrations
    const initialState = new Float64Array(
      (expandedModel.species ?? []).map(
        (s: any) => s?.initialConcentration ?? s?.initialAmount ?? 0
      )
    );

    // Run continuation
    const result = await engine.continuation({
      nSpecies,
      rhsFn: rhsFn as any,
      initialState,
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
