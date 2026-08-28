import type { CampaignTarget } from '../schemas.js';
import { buildCandidatePrompt } from '../prompt.js';

export const MCP_DEFAULT_STARTS = 7;
export const MCP_MAX_STARTS = 14;

export function mcpPrompt(target: CampaignTarget, candidate: number, generation: number, baseSha: string): string {
  return buildCandidatePrompt(target, candidate, generation, baseSha);
}
