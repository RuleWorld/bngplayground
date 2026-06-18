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

type EngineEigenvalue = {
  re?: number;
  im?: number;
  real?: number;
  imag?: number;
};

type EngineContinuationPoint = { stable: boolean };
type EngineBifurcation = {
  parameterValue: number;
  type: string;
  frequency?: number;
  criticalEigenvalues?: EngineEigenvalue[];
};
type EngineContinuationResult = {
  bifurcations: EngineBifurcation[];
  path: EngineContinuationPoint[];
};
type CompiledRhs = {
  updateParameters?: (params: Record<string, number>) => void;
  evaluate: (t: number, y: Float64Array, dydt: Float64Array) => void;
};
type ContinuationWithConservationFn = (args: {
  nSpecies: number;
  reactions: Array<{ reactants: number[]; products: number[] }>;
  rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
  updateParams?: (p: number) => void;
  initialGuess: Float64Array;
  parameterStart: number;
  parameterEnd: number;
  stepSize: number;
  maxSteps: number;
  skipReduction?: boolean;
}) => EngineContinuationResult | Promise<EngineContinuationResult>;

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
  continuationWithConservation: ContinuationWithConservationFn;
};

function assertEngineModule(module: unknown): asserts module is EngineModule {
  if (!module || typeof module !== 'object') {
    throw new Error('Failed to load engine module.');
  }
  const maybeModule = module as Partial<EngineModule>;
  if (typeof maybeModule.JITCompiler !== 'function' || typeof maybeModule.continuationWithConservation !== 'function') {
    throw new Error('Engine module is missing required bifurcation analysis exports (JITCompiler, continuationWithConservation).');
  }
}

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs: BifurcationAnalysisArgs = (args ?? {}) as BifurcationAnalysisArgs;
  try {
    const rawEngine = await import('@bngplayground/engine');
    assertEngineModule(rawEngine);
    const engine = rawEngine;
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
    if (!(parameterName in params)) {
      throw new Error(`Unknown continuation parameter: ${parameterName}`);
    }

    const speciesIndexMap = new Map<string, number>(
      ((expandedModel.species ?? []) as ExpandedSpecies[]).map((species: ExpandedSpecies, index: number) => [species.name, index])
    );

    // Build RHS function from expanded model using JIT compiler.
    let rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
    let compiled: any;
    try {
      const jit = new engine.JITCompiler(expandedModel);
      const reactionRules = expandedModel.reactions ?? [];
      compiled = jit.compileFromRxns(reactionRules, nSpecies, speciesIndexMap, params, {
        modelName: model.name ?? 'unnamed-model',
        analysis: 'bifurcation-mcp',
        parameterName,
        callsite: 'mcp-server.handleBifurcationAnalysis',
      });

      rhsFn = (y: Float64Array, p: number, dydt: Float64Array) => {
        params[parameterName] = p;
        compiled.updateParameters?.(params);
        compiled.evaluate(0, y, dydt);
      };
    } catch (jitError: unknown) {
      const msg = jitError instanceof Error ? jitError.message : String(jitError);
      return createToolResult(
        structureError(new Error(`Could not compile model RHS for bifurcation analysis: ${msg}`))
      );
    }

    // Build initial state from seed species concentrations
    const initialState = new Float64Array(
      ((expandedModel.species ?? []) as ExpandedSpecies[]).map(
        (s: ExpandedSpecies) => s.initialConcentration ?? s.initialAmount ?? 0
      )
    );

    // Build reaction entries for conserved-moiety detection
    const reactionEntries = (expandedModel.reactions ?? []).map((r: any) => ({
      reactants: (r.reactants ?? []).map((name: string) => {
        const idx = speciesIndexMap.get(String(name).trim());
        if (idx === undefined) throw new Error(`Unknown reactant: ${name}`);
        return idx;
      }),
      products: (r.products ?? []).map((name: string) => {
        const idx = speciesIndexMap.get(String(name).trim());
        if (idx === undefined) throw new Error(`Unknown product: ${name}`);
        return idx;
      }),
    }));

    // Run continuation with conserved-moiety reduction
    const result = await engine.continuationWithConservation({
      nSpecies,
      reactions: reactionEntries,
      rhsFn,
      updateParams: (p: number) => {
        params[parameterName] = p;
        compiled?.updateParameters?.(params);
      },
      initialGuess: initialState,
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
      technical: `Continuation along ${parameterName} from ${parameterStart} to ${parameterEnd}. Found ${result.bifurcations.length} bifurcation(s).`,
      biological: result.bifurcations.length > 0
        ? `Qualitative behavior changes detected: ${result.bifurcations.map((b: EngineBifurcation) => `${b.type} at ${parameterName}=${b.parameterValue.toPrecision(4)}`).join('; ')}.`
        : `No bifurcations detected in the parameter range. The system maintains qualitative stability.`,
      strategic: 'Bifurcation analysis reveals parameter thresholds where the system changes qualitative behavior (oscillation onset, bistability, etc.).',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
