import type { ToolArgs, ToolResult } from '../types/index.js';
import { searchModelsArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { searchRuleHubModels } from '../services/rulehubSearch.js';

export async function handleSearchModels(args: ToolArgs): Promise<ToolResult<unknown>> {
  try {
    const parsedArgs = parseArgs('search_models', searchModelsArgsSchema, args);
    const result = await searchRuleHubModels(parsedArgs);
    const response = createToolResult(result);
    return {
      ...response,
      content: [
        ...response.content,
        ...result.results.map((model) => ({
          type: 'resource_link' as const,
          uri: model.resource_uri,
          name: model.name,
          ...(model.description ? { description: model.description } : {}),
          mimeType: 'text/x-bngl',
        })),
      ],
    } as unknown as ToolResult<unknown>;
  } catch (error) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
