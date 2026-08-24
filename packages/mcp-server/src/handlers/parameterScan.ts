import { runParameterScan } from '@bngplayground/engine';
import { ToolArgs, ToolResult, ParameterScanResult, MCPErrorResult } from '../types/index.js';
import { parameterScanArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, buildSimulationOptions, expandModel, assertScannableParameter } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleParameterScan(args: ToolArgs): Promise<ToolResult<ParameterScanResult | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('parameter_scan', parameterScanArgsSchema, args);

    const baseModel = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
    assertScannableParameter(baseModel, parsedArgs.parameter);
    if (parsedArgs.parameter2 !== undefined) {
      assertScannableParameter(baseModel, parsedArgs.parameter2);
    }
    if (!Array.isArray(baseModel.observables) || baseModel.observables.length === 0) {
      throw new Error('Model must define at least one observable for parameter_scan.');
    }

    const seedExpressions = new Map<string, string>();
    for (const species of baseModel.species ?? []) {
      if (typeof species.initialExpression === 'string' && species.initialExpression.trim().length > 0) {
        seedExpressions.set(species.name, species.initialExpression);
      }
    }

    const expandedModel = await expandModel(baseModel);
    const simulationOptions = buildSimulationOptions(parsedArgs);

    const scanResult = await runParameterScan(
      expandedModel,
      {
        parameter: parsedArgs.parameter,
        start: parsedArgs.start,
        end: parsedArgs.end,
        steps: parsedArgs.steps,
        logarithmic: parsedArgs.logarithmic,
        parameter2: parsedArgs.parameter2,
        start2: parsedArgs.start2,
        end2: parsedArgs.end2,
        steps2: parsedArgs.steps2,
      },
      simulationOptions,
      seedExpressions
    );

    return createToolResult(scanResult as any);
  } catch (error) {
    const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
    return createToolResult(structured);
  }
}
