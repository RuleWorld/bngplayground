import { jules, type JulesClient, type SessionConfig } from '@google/jules-sdk';

import { MCP_MAX_STARTS, mcpPrompt } from './campaigns/mcp.js';
import { PERFORMANCE_MAX_STARTS, performancePrompt } from './campaigns/performance.js';
import { buildRefinementPrompt } from './prompt.js';
import { type CampaignTarget } from './schemas.js';

export type LaunchRecord = {
  candidate: number;
  generation: number;
  prompt: string;
  session_id?: string;
  error?: string;
};

type LaunchOptions = {
  target: CampaignTarget;
  baseSha: string;
  generation: number;
  count: number;
  runId: string;
  client?: JulesClient;
  dryRun?: boolean;
  refinementPatch?: string;
};

function maxStarts(target: CampaignTarget): number {
  return target.campaign === 'mcp' ? MCP_MAX_STARTS : PERFORMANCE_MAX_STARTS;
}

function promptFor(target: CampaignTarget, candidate: number, generation: number, baseSha: string, refinementPatch?: string): string {
  if (generation > 1 && refinementPatch) return buildRefinementPrompt(target, refinementPatch, baseSha);
  return target.campaign === 'mcp'
    ? mcpPrompt(target, candidate, generation, baseSha)
    : performancePrompt(target, candidate, generation, baseSha);
}

export async function launchCandidates(options: LaunchOptions): Promise<LaunchRecord[]> {
  if (!Number.isInteger(options.count) || options.count < 0 || options.count > maxStarts(options.target)) {
    throw new Error(`Launch count must be between 0 and ${maxStarts(options.target)} for ${options.target.campaign}.`);
  }
  const client = options.client ?? jules;
  const sourceBranch = process.env.AUTORESEARCH_JULES_BASE_BRANCH?.trim() || process.env.GITHUB_REF_NAME?.trim() || 'main';
  const tasks = Array.from({ length: options.count }, (_, index) => {
    const candidate = index + 1;
    const prompt = promptFor(options.target, candidate, options.generation, options.baseSha, options.refinementPatch);
    return { candidate, generation: options.generation, prompt };
  });
  if (options.dryRun) {
    return tasks.map((task) => ({ ...task, error: 'dry-run' }));
  }
  if (!process.env.JULES_API_KEY && client === jules) {
    throw new Error('JULES_API_KEY is required for a non-dry autoresearch launch.');
  }

  try {
    const sessions = await client.all(tasks, (task): SessionConfig => ({
      prompt: task.prompt,
      source: { github: 'akutuva21/julesplayground', baseBranch: sourceBranch },
      title: `BNG autoresearch ${options.target.campaign} ${options.runId} candidate ${task.candidate}`,
      requireApproval: false,
      autoPr: false,
    }), { concurrency: 3, stopOnError: false, delayMs: 500 });
    return tasks.map((task, index) => ({ ...task, session_id: sessions[index]?.id }));
  } catch (error) {
    return tasks.map((task) => ({
      ...task,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
