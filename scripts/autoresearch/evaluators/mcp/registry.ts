import { getToolDefinitions, validateToolRegistry } from '../../../../packages/mcp-server/src/toolRegistry.ts';

const requestedMetric = process.argv.includes('--metric')
  ? process.argv[process.argv.indexOf('--metric') + 1]
  : 'contrastive-description-coverage';

const definitions = getToolDefinitions('stable');
const contrastivePattern = /\b(do not|don't|prefer|use when|use for|instead of|rather than)\b/i;

let value: number;
let primaryName: string;
switch (requestedMetric) {
  case 'stable-tool-count':
    primaryName = 'stable_tool_count_error';
    value = Math.abs(definitions.length - 36);
    break;
  case 'registry-integrity':
    primaryName = 'registry_integrity';
    try {
      validateToolRegistry();
      value = 0;
    } catch {
      value = 1;
    }
    break;
  case 'contrastive-description-coverage':
  default:
    primaryName = 'contrastive_description_coverage';
    value = definitions.length === 0
      ? 0
      : definitions.filter((definition) => contrastivePattern.test(definition.description)).length / definitions.length;
    break;
}

process.stdout.write(`${JSON.stringify({ primary_name: primaryName, value, stable_tool_count: definitions.length })}\n`);
