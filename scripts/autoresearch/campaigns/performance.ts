import type { CampaignTarget } from '../schemas.js';
import { buildCandidatePrompt } from '../prompt.js';

export const PERFORMANCE_DEFAULT_STARTS = 5;
export const PERFORMANCE_MAX_STARTS = 14;

export function performancePrompt(target: CampaignTarget, candidate: number, generation: number, baseSha: string): string {
  return buildCandidatePrompt(target, candidate, generation, baseSha);
}
