import { generateRange, simulate, loadEvaluator, reevaluateSeedSpecies } from '@bngplayground/engine';
import { ToolArgs, ToolResult, ParameterScanResult, MCPErrorResult } from '../types/index.js';
import { parameterScanArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, buildSimulationOptions, expandModel, assertScannableParameter, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleParameterScan(args: ToolArgs): Promise<ToolResult<ParameterScanResult | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('parameter_scan', parameterScanArgsSchema, args);
    if (parsedArgs.parameter2 !== undefined) {
      if (parsedArgs.parameter2 === parsedArgs.parameter) {
        throw new Error('parameter_scan requires two distinct parameters for 2D scans.');
      }
      if (parsedArgs.start2 === undefined || parsedArgs.end2 === undefined || parsedArgs.steps2 === undefined) {
        throw new Error('parameter_scan requires start2, end2, and steps2 when parameter2 is provided.');
      }
    }

    const baseModel = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
    assertScannableParameter(baseModel, parsedArgs.parameter);
    if (parsedArgs.parameter2 !== undefined) {
      assertScannableParameter(baseModel, parsedArgs.parameter2);
    }

    const seedExpressions = new Map<string, string>();
    for (const species of baseModel.species ?? []) {
      if (typeof species.initialExpression === 'string' && species.initialExpression.trim().length > 0) {
        seedExpressions.set(species.name, species.initialExpression);
      }
    }

    const expandedModel = await expandModel(baseModel);
    const xValues = generateRange(parsedArgs.start, parsedArgs.end, parsedArgs.steps, parsedArgs.logarithmic ?? false);
    const yValues = parsedArgs.parameter2 !== undefined
      ? generateRange(parsedArgs.start2!, parsedArgs.end2!, parsedArgs.steps2!, parsedArgs.logarithmic ?? false)
      : [];

    if (xValues.length * Math.max(1, yValues.length || 1) > 400) {
      throw new Error('parameter_scan supports at most 400 simulation combinations per request.');
    }

    const simulationOptions = buildSimulationOptions(parsedArgs);

    if (parsedArgs.parameter2 === undefined) {
      const observables: Record<string, number[]> = {};
      expandedModel.observables.forEach((observable) => {
        observables[observable.name] = [];
      });

      await loadEvaluator();
      for (const value of xValues) {
        const runModel = cloneExpandedModel(expandedModel);
        runModel.parameters[parsedArgs.parameter] = value;
        reevaluateSeedSpecies(runModel, seedExpressions);
        updateMassActionRates(runModel);
        const result = await simulate(0, runModel, simulationOptions, {
          checkCancelled: () => { },
          postMessage: () => { },
        });
        const lastPoint = result.data.at(-1) ?? {};
        Object.keys(observables).forEach((observableName) => {
          const rawValue = lastPoint[observableName as keyof typeof lastPoint];
          const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
          observables[observableName].push(Number.isFinite(numericValue) ? numericValue : 0);
        });
      }

      return createToolResult({
        mode: '1d',
        parameter: parsedArgs.parameter,
        xValues,
        observables,
      });
    }

    const observables: Record<string, number[][]> = {};
    expandedModel.observables.forEach((observable) => {
      observables[observable.name] = yValues.map(() => new Array(xValues.length).fill(0));
    });

    await loadEvaluator();
    for (let yIndex = 0; yIndex < yValues.length; yIndex += 1) {
      for (let xIndex = 0; xIndex < xValues.length; xIndex += 1) {
        const runModel = cloneExpandedModel(expandedModel);
        runModel.parameters[parsedArgs.parameter] = xValues[xIndex];
        runModel.parameters[parsedArgs.parameter2] = yValues[yIndex];
        reevaluateSeedSpecies(runModel, seedExpressions);
        updateMassActionRates(runModel);
        const result = await simulate(0, runModel, simulationOptions, {
          checkCancelled: () => { },
          postMessage: () => { },
        });
        const lastPoint = result.data.at(-1) ?? {};
        Object.keys(observables).forEach((observableName) => {
          const rawValue = lastPoint[observableName as keyof typeof lastPoint];
          const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
          observables[observableName][yIndex][xIndex] = Number.isFinite(numericValue) ? numericValue : 0;
        });
      }
    }

    return createToolResult({
      mode: '2d',
      parameter: parsedArgs.parameter,
      parameter2: parsedArgs.parameter2,
      xValues,
      yValues,
      observables,
    });
  } catch (error) {
    const structured = structureError(error instanceof Error ? error : new Error(String(error)));
    return createToolResult(structured);
  }
}
