import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { structureError } from '../services/errors.js';

const multiscaleArgsSchema = {
  type: 'object',
  properties: {
    definition: {
      type: 'object',
      description: 'Multi-scale model definition (JSON object with cellTypes, extracellular, domain, population, time)',
    },
    max_cells: { type: 'number', description: 'Maximum number of cells (safety limit, default: 10000)' },
  },
  required: ['definition'],
};

export async function handleMultiscaleSimulation(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = parseArgs('multiscale_simulation', multiscaleArgsSchema, args);
  try {
    const engine = await import('@bngplayground/engine');

    const config = engine.parseMultiscaleModel(parsedArgs.definition);
    if (parsedArgs.max_cells) config.maxCells = parsedArgs.max_cells;

    const result = await engine.multiscaleSimulation(config, (time: number, nCells: number, phase: string) => {
      // Progress tracking
    });

    const finalSnapshot = result.snapshots[result.snapshots.length - 1];
    const finalCounts = finalSnapshot?.populationCounts || {};

    return createToolResult({
      populationSummary: result.populationTimeSeries,
      finalCellCount: finalCounts,
      totalCells: Object.values(finalCounts).reduce((a: number, b: number) => a + b, 0),
      meanObservables: finalSnapshot?.meanObservables || {},
      nSnapshots: result.snapshots.length,
      lineageSize: result.cellLineage.length,
      technical: `Simulated ${config.cellTypes.length} cell type(s) for ${config.tEnd}s. Final population: ${Object.values(finalCounts).reduce((a: number, b: number) => a + b, 0)} cells.`,
      biological: `Population dynamics: ${Object.entries(finalCounts).map(([type, count]) => `${type}: ${count}`).join(', ')}.`,
      strategic: 'Multi-scale models bridge intracellular BNGL models with cell-population dynamics — essential for tumor growth, immune response, and tissue-level phenomena.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
