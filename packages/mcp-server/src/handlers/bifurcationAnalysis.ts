import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

type BifurcationAnalysisArgs = {
  code?: string;
  max_steps?: number;
  parameter?: string;
  start_value?: number;
  end_value?: number;
};

type ExpandedSpecies = {
  name: string;
  initialConcentration?: number;
  initialAmount?: number;
};

type EngineContinuationPoint = { stable: boolean };
type EngineBifurcation = {
  parameterValue: number;
  type: string;
  frequency?: number;
  criticalEigenvalues?: unknown[];
};
type EngineContinuationResult = {
  bifurcations: EngineBifurcation[];
  path: EngineContinuationPoint[];
};
type CompiledRhs = {
  updateParameters?: (params: Record<string, number>) => void;
  evaluate: (t: number, y: Float64Array, dydt: Float64Array) => void;
};
type EngineModule = {
  JITCompiler: new (model: unknown) => {
    compileFromRxns: (
      reactions: unknown[],
      nSpecies: number,
      speciesIndexMap: Map<string, number>,
      params: Record<string, number>,
      metadata: Record<string, string>
    ) => CompiledRhs;
  };
  continuation: (args: {
    nSpecies: number;
    rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
    initialState: Float64Array;
    parameterStart: number;
    parameterEnd: number;
    stepSize: number;
    maxSteps: number;
  }) => EngineContinuationResult | Promise<EngineContinuationResult>;
};

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs: BifurcationAnalysisArgs = (args ?? {}) as BifurcationAnalysisArgs;
  try {
    const engine = (await import('@bngplayground/engine')) as unknown as EngineModule;
    const model = parseModelOrThrow(parsedArgs.code ?? '');
    const expandedModel = await expandModel(model);

    const nSpecies = expandedModel.species?.length || 0;
    const params = { ...model.parameters };
    const maxSteps = parsedArgs.max_steps || 500;
    const parameterName = parsedArgs.parameter;
    const parameterStart = parsedArgs.start_value ?? 0;
    const parameterEnd = parsedArgs.end_value ?? 1;

    if (!parameterName) {
      throw new Error('Bifurcation analysis requires a parameter name.');
    }

    const speciesIndexMap = new Map<string, number>(
      ((expandedModel.species ?? []) as ExpandedSpecies[]).map((species: ExpandedSpecies, index: number) => [species.name, index])
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
    } catch (jitError: unknown) {
      // Fallback is intentional, but log the root cause for observability/debugging.
      console.warn(
        `[bifurcationAnalysis] Failed to compile JIT RHS; falling back to zero RHS: ${
          jitError instanceof Error ? jitError.message : String(jitError)
        }`
      );
      // Fallback: zero RHS (continuation will report no bifurcations)
      rhsFn = (_y: Float64Array, _p: number, dydt: Float64Array) => {
        for (let i = 0; i < nSpecies; i++) dydt[i] = 0;
      };
    }

    // Build initial state from seed species concentrations
    const initialState = new Float64Array(
      ((expandedModel.species ?? []) as ExpandedSpecies[]).map(
        (s: ExpandedSpecies) => s.initialConcentration ?? s.initialAmount ?? 0
      )
    );

    // Run continuation
    const result = await engine.continuation({
      nSpecies,
      rhsFn,
      initialState,
      parameterStart,
      parameterEnd,
      stepSize: (parameterEnd - parameterStart) / maxSteps,
      maxSteps,
    });

    // Attribute bifurcations if any found
    const attributions = result.bifurcations.map((b: EngineBifurcation) => ({
      parameterValue: b.parameterValue,
      type: b.type,
      frequency: b.frequency,
      criticalEigenvalues: b.criticalEigenvalues?.slice(0, 3),
    }));

    return createToolResult({
      bifurcations: attributions,
      totalPoints: result.path.length,
      stablePoints: result.path.filter((p: EngineContinuationPoint) => p.stable).length,
      unstablePoints: result.path.filter((p: EngineContinuationPoint) => !p.stable).length,
      technical: `Continuation along ${parsedArgs.parameter} from ${parsedArgs.start_value} to ${parsedArgs.end_value}. Found ${result.bifurcations.length} bifurcation(s).`,
      biological: result.bifurcations.length > 0
        ? `Qualitative behavior changes detected: ${result.bifurcations.map((b: EngineBifurcation) => `${b.type} at ${parsedArgs.parameter}=${b.parameterValue.toPrecision(4)}`).join('; ')}.`
        : `No bifurcations detected in the parameter range. The system maintains qualitative stability.`,
      strategic: 'Bifurcation analysis reveals parameter thresholds where the system changes qualitative behavior (oscillation onset, bistability, etc.).',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
