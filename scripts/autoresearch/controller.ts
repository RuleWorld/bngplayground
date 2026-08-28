import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { extractPatch } from './extractPatch.js';
import { evaluateCandidate } from './evaluate.js';
import { launchCandidates, type LaunchRecord } from './launch.js';
import { selectWinner } from './rank.js';
import { promoteWinner } from './promote.js';
import {
  candidateResultSchema,
  runManifestSchema,
  type Campaign,
  type CampaignTarget,
  type CandidateResult,
  type TargetSelection,
} from './schemas.js';
import { currentBaseSha, selectMcpTarget, selectPerformanceTarget } from './targets.js';
import { parseBoolean, parseBoundedInteger, runGit, writeJson } from './utils.js';
import { writeBoard } from './board.js';

type CampaignChoice = 'auto' | Campaign;

type ControllerOptions = {
  repositoryRoot: string;
  campaign: CampaignChoice;
  baseSha?: string;
  generation1Starts?: number;
  refinement: boolean;
  dryRun: boolean;
  promotionMode: 'artifact' | 'pr';
};

const DAILY_START_LIMIT = 14;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function selectedCampaigns(choice: CampaignChoice): Campaign[] {
  return choice === 'auto' ? ['mcp', 'performance'] : [choice];
}

function targetForCampaign(campaign: Campaign, repositoryRoot: string): Promise<TargetSelection> {
  return campaign === 'mcp' ? selectMcpTarget(repositoryRoot) : selectPerformanceTarget(repositoryRoot);
}

function defaultStarts(campaign: Campaign): number {
  return campaign === 'mcp' ? 7 : 5;
}

function plannedStarts(targets: Record<string, TargetSelection>, requested: number | undefined, refinement: boolean): Record<string, number> {
  const active = selectedCampaigns('auto').filter((campaign) => targets[campaign]?.status === 'TARGET_FOUND');
  const refinementReserve = refinement ? active.length : 0;
  let remaining = Math.max(0, DAILY_START_LIMIT - refinementReserve);
  const counts: Record<string, number> = {};
  for (const campaign of active) {
    const desired = requested ?? defaultStarts(campaign as Campaign);
    const campaignMaximum = campaign === 'mcp' ? 14 : 14;
    const count = Math.min(desired, campaignMaximum, remaining);
    counts[campaign] = count;
    remaining -= count;
  }
  return counts;
}

function noSessionResult(options: {
  runId: string;
  target: CampaignTarget;
  baseSha: string;
  generation: number;
  launch: LaunchRecord;
}): CandidateResult {
  return candidateResultSchema.parse({
    run_id: options.runId,
    campaign: options.target.campaign,
    generation: options.generation,
    candidate: options.launch.candidate,
    session_id: options.launch.session_id,
    base_sha: options.baseSha,
    status: 'SESSION_FAILED',
    changed_files: [],
    guards: { locked_paths_clean: false, typecheck: false, tests: false, scientific_suite: false },
    notes: [options.launch.error ?? 'Jules did not return a session handle.'],
  });
}

async function collectCandidates(options: {
  client?: Parameters<typeof extractPatch>[0]['client'];
  target: CampaignTarget;
  launches: LaunchRecord[];
  runId: string;
  baseSha: string;
  generation: number;
  runDirectory: string;
  repositoryRoot: string;
}): Promise<CandidateResult[]> {
  const results: CandidateResult[] = [];
  for (const launch of options.launches) {
    const candidateDirectory = join(options.runDirectory, options.target.campaign, `generation-${options.generation}`, `candidate-${launch.candidate}`);
    await writeJson(join(candidateDirectory, 'launch.json'), launch);
    if (!launch.session_id) {
      const result = noSessionResult({ runId: options.runId, target: options.target, baseSha: options.baseSha, generation: options.generation, launch });
      await writeJson(join(candidateDirectory, 'result.json'), result);
      results.push(result);
      continue;
    }

    const extracted = await extractPatch({
      client: options.client,
      sessionId: launch.session_id,
      runId: options.runId,
      candidate: launch.candidate,
      generation: options.generation,
      campaign: options.target.campaign,
      targetId: options.target.target_id,
      baseSha: options.baseSha,
      outputDirectory: candidateDirectory,
    });
    if (extracted.status !== 'VALID_WIN' || !extracted.patchPath) {
      const result = candidateResultSchema.parse({
        run_id: options.runId,
        campaign: options.target.campaign,
        generation: options.generation,
        candidate: launch.candidate,
        session_id: launch.session_id,
        base_sha: options.baseSha,
        status: extracted.status,
        changed_files: [],
        guards: { locked_paths_clean: false, typecheck: false, tests: false, scientific_suite: false },
        notes: [extracted.status === 'NO_CHANGE' ? 'Completed Jules session returned no change-set.' : 'Jules session did not produce an evaluable patch.'],
      });
      await writeJson(join(candidateDirectory, 'result.json'), result);
      results.push(result);
      continue;
    }

    const result = await evaluateCandidate({
      repositoryRoot: options.repositoryRoot,
      patchPath: extracted.patchPath,
      target: options.target,
      baseSha: options.baseSha,
      runId: options.runId,
      candidate: launch.candidate,
      generation: options.generation,
      outputDirectory: candidateDirectory,
    });
    results.push(result);
  }
  return results;
}

async function setGithubOutputs(values: Record<string, string>): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await appendFile(outputPath, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
}

export async function runController(options: ControllerOptions): Promise<void> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const baseSha = options.baseSha ?? currentBaseSha(repositoryRoot);
  await runGit(repositoryRoot, ['cat-file', '-e', `${baseSha}^{commit}`]);
  const runId = `run-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const runDirectory = resolve(repositoryRoot, 'artifacts', 'autoresearch', runId);
  const startedAt = new Date().toISOString();
  const targets: Record<string, TargetSelection> = {};
  for (const campaign of selectedCampaigns(options.campaign)) {
    targets[campaign] = await targetForCampaign(campaign, repositoryRoot);
  }

  const counts = plannedStarts(targets, options.generation1Starts, options.refinement);
  const generation1Starts = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const activeTargetCount = Object.values(targets).filter((target) => target.status === 'TARGET_FOUND').length;
  const planned = generation1Starts + (options.refinement ? Math.min(activeTargetCount, DAILY_START_LIMIT - generation1Starts) : 0);
  const manifest = runManifestSchema.parse({
    run_id: runId,
    base_sha: baseSha,
    base_branch: process.env.AUTORESEARCH_JULES_BASE_BRANCH?.trim() || process.env.GITHUB_REF_NAME?.trim() || 'main',
    started_at: startedAt,
    jules_budget_planned: planned,
    reserve_tasks: Math.max(0, DAILY_START_LIMIT - planned),
    campaigns: targets,
    generation1_starts: generation1Starts,
    refinement_requested: options.refinement,
    dry_run: options.dryRun,
  });
  await writeJson(join(runDirectory, 'manifest.json'), manifest);
  await writeJson(join(runDirectory, 'promotion-mode.json'), { mode: options.promotionMode, note: 'PR creation is isolated to the promotion job.' });

  const candidates: CandidateResult[] = [];
  const launchesByCampaign: Record<string, LaunchRecord[]> = {};
  if (!options.dryRun) {
    for (const campaign of selectedCampaigns(options.campaign)) {
      const selection = targets[campaign];
      if (selection.status !== 'TARGET_FOUND' || !counts[campaign]) continue;
      const launches = await launchCandidates({
        target: selection,
        baseSha,
        generation: 1,
        count: counts[campaign],
        runId,
        dryRun: false,
      });
      launchesByCampaign[campaign] = launches;
      candidates.push(...await collectCandidates({ target: selection, launches, runId, baseSha, generation: 1, runDirectory, repositoryRoot }));
    }
  } else {
    for (const campaign of selectedCampaigns(options.campaign)) {
      const selection = targets[campaign];
      if (selection.status !== 'TARGET_FOUND' || !counts[campaign]) continue;
      const launches = await launchCandidates({ target: selection, baseSha, generation: 1, count: counts[campaign], runId, dryRun: true });
      launchesByCampaign[campaign] = launches;
      await writeJson(join(runDirectory, campaign, 'generation-1-launch.json'), launches);
    }
  }
  await writeJson(join(runDirectory, 'generation-1-launches.json'), launchesByCampaign);

  if (options.refinement && !options.dryRun) {
    for (const campaign of selectedCampaigns(options.campaign)) {
      const selection = targets[campaign];
      if (selection.status !== 'TARGET_FOUND') continue;
      const winner = selectWinner(candidates.filter((candidate) => candidate.campaign === campaign), selection);
      if (!winner?.patch_path) continue;
      const parentPatch = await readFile(winner.patch_path, 'utf8');
      const launches = await launchCandidates({ target: selection, baseSha, generation: 2, count: 1, runId, refinementPatch: parentPatch });
      await writeJson(join(runDirectory, campaign, 'generation-2-launch.json'), launches);
      candidates.push(...await collectCandidates({ target: selection, launches, runId, baseSha, generation: 2, runDirectory, repositoryRoot }));
    }
  }

  const winners: Record<string, CandidateResult> = {};
  const promotions = [];
  for (const campaign of selectedCampaigns(options.campaign)) {
    const selection = targets[campaign];
    if (selection.status !== 'TARGET_FOUND') continue;
    const winner = selectWinner(candidates.filter((candidate) => candidate.campaign === campaign), selection);
    if (!winner) continue;
    winners[campaign] = winner;
    if (winner.patch_path) {
      promotions.push(await promoteWinner({
        mode: 'artifact',
        repositoryRoot,
        runId,
        baseSha,
        target: selection,
        candidate: winner,
        patchPath: winner.patch_path,
        outputDirectory: join(runDirectory, campaign, `generation-${winner.generation}`, `candidate-${winner.candidate}`),
      }));
    }
  }

  const board = await writeBoard(runDirectory, { run_id: runId, base_sha: baseSha, targets, candidates, winners, promotions });
  await writeJson(join(runDirectory, 'summary.json'), { ...board, finished_at: new Date().toISOString() });
  await setGithubOutputs({ run_id: runId, run_directory: runDirectory, base_sha: baseSha, winner_exists: String(Object.keys(winners).length > 0) });
  process.stdout.write(`${JSON.stringify({ run_id: runId, base_sha: baseSha, run_directory: runDirectory, candidates: candidates.length, winners: Object.keys(winners) })}\n`);
}

if (process.argv[1]?.endsWith('controller.ts')) {
  const campaignValue = argument('--campaign') ?? process.env.AUTORESEARCH_CAMPAIGN ?? 'auto';
  if (!['auto', 'mcp', 'performance'].includes(campaignValue)) throw new Error(`Unknown campaign: ${campaignValue}`);
  const campaign = campaignValue as CampaignChoice;
  const refinement = parseBoolean(argument('--refinement') ?? process.env.AUTORESEARCH_REFINEMENT, true);
  const dryRun = parseBoolean(argument('--dry-run') ?? process.env.AUTORESEARCH_DRY_RUN, false);
  const startsValue = argument('--generation1-starts') ?? process.env.AUTORESEARCH_GENERATION1_STARTS;
  const generation1Starts = startsValue?.trim() ? parseBoundedInteger(startsValue, 0, 0, DAILY_START_LIMIT) : undefined;
  const modeValue = argument('--promotion-mode') ?? process.env.AUTORESEARCH_PROMOTION_MODE ?? 'artifact';
  if (!['artifact', 'pr'].includes(modeValue)) throw new Error(`Unknown promotion mode: ${modeValue}`);
  const baseShaValue = argument('--base-sha') ?? process.env.AUTORESEARCH_BASE_SHA;
  await runController({
    repositoryRoot: process.cwd(),
    campaign,
    baseSha: baseShaValue?.trim() || undefined,
    generation1Starts,
    refinement,
    dryRun,
    promotionMode: modeValue as 'artifact' | 'pr',
  });
}
