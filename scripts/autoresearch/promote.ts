import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';

import { renderBoard } from './board.js';
import { isEligibleWinner } from './rank.js';
import { boardResultSchema, promotionRecordSchema, type BoardResult, type CampaignTarget, type CandidateResult, type PromotionRecord } from './schemas.js';
import { readJson, runGit, writeJson } from './utils.js';

const execFileAsync = promisify(execFile);

type PromotionOptions = {
  mode: 'artifact' | 'pr';
  repositoryRoot: string;
  runId: string;
  baseSha: string;
  target: CampaignTarget;
  candidate: CandidateResult;
  patchPath: string;
  outputDirectory: string;
};

function isPathWithin(path: string, roots: string[]): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  return roots.some((root) => {
    const normalizedRoot = root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
  });
}

function pathPolicyIsClean(files: string[], target: CampaignTarget): boolean {
  return files.every((path) => {
    const safe = !path.startsWith('/') && !path.split('/').includes('..');
    const editable = isPathWithin(path, target.editable_paths);
    const locked = isPathWithin(path, target.locked_paths) || isPathWithin(path, [
      '.github/workflows/autoresearch.yml',
      'scripts/autoresearch/',
      'tests/',
      'artifacts/',
    ]);
    return safe && editable && !locked;
  });
}

async function filesInWorktree(worktree: string): Promise<string[]> {
  const tracked = await runGit(worktree, ['diff', '--name-only']);
  const untracked = await runGit(worktree, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))].sort();
}

function record(options: PromotionOptions, status: PromotionRecord['status'], notes: string[], extras: Partial<PromotionRecord> = {}): PromotionRecord {
  return promotionRecordSchema.parse({
    run_id: options.runId,
    campaign: options.target.campaign,
    target_id: options.target.target_id,
    mode: options.mode,
    status,
    patch_sha256: options.candidate.patch_sha256,
    notes,
    ...extras,
  });
}

async function openPullRequest(options: PromotionOptions): Promise<PromotionRecord> {
  const branch = `autoresearch/${options.target.campaign}/${options.runId}/${options.target.target_id.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^\/+|\/+$/g, '')}`;
  const worktree = join('/private/tmp', 'bng-autoresearch-promote', options.runId, options.target.campaign);
  try {
    await mkdir(dirname(worktree), { recursive: true });
    await runGit(options.repositoryRoot, ['worktree', 'add', '-b', branch, worktree, options.baseSha]);
    await runGit(worktree, ['apply', '--check', options.patchPath]);
    await runGit(worktree, ['apply', options.patchPath]);
    const files = await filesInWorktree(worktree);
    if (!files.length || !pathPolicyIsClean(files, options.target)) {
      return record(options, 'REJECTED', [`Promotion path policy rejected changed files: ${files.join(', ')}`], { branch });
    }
    const expectedSha = options.candidate.patch_sha256;
    const actualSha = createHash('sha256').update(await readFile(options.patchPath, 'utf8')).digest('hex');
    if (expectedSha && expectedSha !== actualSha) {
      return record(options, 'REJECTED', ['Patch digest changed after evaluation.'], { branch });
    }
    await runGit(worktree, ['config', 'user.name', 'github-actions[bot]']);
    await runGit(worktree, ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    await runGit(worktree, ['add', '--all', '--', ...files]);
    await runGit(worktree, ['commit', '-m', `autoresearch: ${options.target.target_id}`]);
    await runGit(worktree, ['push', '--set-upstream', 'origin', branch]);
    const body = [
      '## Autoresearch candidate',
      '',
      `- Frozen base: \`${options.baseSha}\``,
      `- Campaign: \`${options.target.campaign}\``,
      `- Target: \`${options.target.target_id}\``,
      `- Candidate: ${options.candidate.candidate} (generation ${options.candidate.generation})`,
      `- Fitness: ${options.candidate.fitness?.primary_name ?? 'unknown'} = ${options.candidate.fitness?.candidate ?? 'unknown'}`,
      '',
      'This PR was created only after independent patch application, locked-path checks, type-checking, fast tests, and the safe scientific suite passed. It is intentionally not auto-merged.',
    ].join('\n');
    const { stdout } = await execFileAsync('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Autoresearch: ${options.target.target_id}`, '--body', body], {
      cwd: options.repositoryRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
    const url = stdout.trim().split(/\s+/).find((value) => /^https?:\/\//.test(value));
    if (!url) return record(options, 'ERROR', ['gh pr create did not return a pull request URL.'], { branch });
    return record(options, 'PR_OPENED', ['Pull request created without auto-merge.'], { branch, pull_request_url: url });
  } catch (error) {
    return record(options, 'ERROR', [error instanceof Error ? error.message : String(error)], { branch });
  } finally {
    try {
      await runGit(options.repositoryRoot, ['worktree', 'remove', '--force', worktree]);
    } catch {
      // Keep the promotion record even if cleanup needs manual attention.
    }
  }
}

export async function promoteRun(options: {
  mode: 'artifact' | 'pr';
  repositoryRoot: string;
  runDirectory: string;
}): Promise<PromotionRecord[]> {
  const board = boardResultSchema.parse(await readJson<BoardResult>(join(options.runDirectory, 'results.json')));
  const promotions: PromotionRecord[] = [];
  for (const [campaign, candidate] of Object.entries(board.winners)) {
    const selection = board.targets[campaign];
    if (selection?.status !== 'TARGET_FOUND') continue;
    const recordedPatch = candidate.patch_path && existsSync(candidate.patch_path) ? candidate.patch_path : undefined;
    const patchPath = recordedPatch ?? join(options.runDirectory, campaign, `generation-${candidate.generation}`, `candidate-${candidate.candidate}`, 'candidate.patch');
    promotions.push(await promoteWinner({
      mode: options.mode,
      repositoryRoot: options.repositoryRoot,
      runId: board.run_id,
      baseSha: board.base_sha,
      target: selection,
      candidate,
      patchPath: resolve(patchPath),
      outputDirectory: dirname(resolve(patchPath)),
    }));
  }
  const updated = boardResultSchema.parse({ ...board, promotions });
  await writeJson(join(options.runDirectory, 'results.json'), updated);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(options.runDirectory, 'board.md'), renderBoard(updated), 'utf8');
  return promotions;
}

export async function promoteWinner(options: PromotionOptions): Promise<PromotionRecord> {
  if (!isEligibleWinner(options.candidate, options.target)) {
    const result = record(options, 'REJECTED', ['Candidate is not an eligible hard-guarded winner.']);
    await writeJson(join(options.outputDirectory, 'promotion.json'), result);
    return result;
  }
  if (!existsSync(options.patchPath)) {
    const result = record(options, 'ERROR', [`Patch does not exist: ${options.patchPath}`]);
    await writeJson(join(options.outputDirectory, 'promotion.json'), result);
    return result;
  }
  const result = options.mode === 'artifact'
    ? record(options, 'ARTIFACT_WRITTEN', ['Winner retained as an artifact; no branch or pull request was created.'])
    : await openPullRequest(options);
  await writeJson(join(options.outputDirectory, 'promotion.json'), result);
  return result;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith('promote.ts')) {
  const runDirectory = argument('--run-directory');
  const modeValue = argument('--mode');
  if (runDirectory) {
    if (!modeValue || !['artifact', 'pr'].includes(modeValue)) throw new Error('Usage: promote.ts --mode artifact|pr --run-directory <directory>');
    const promotions = await promoteRun({ mode: modeValue as 'artifact' | 'pr', repositoryRoot: process.cwd(), runDirectory: resolve(runDirectory) });
    process.stdout.write(`${JSON.stringify(promotions)}\n`);
    process.exit(0);
  }
  const targetPath = argument('--target');
  const candidatePath = argument('--candidate');
  const patchPath = argument('--patch');
  const outputDirectory = argument('--output');
  const mode = modeValue as 'artifact' | 'pr' | undefined;
  const baseSha = argument('--base-sha') ?? process.env.AUTORESEARCH_BASE_SHA;
  if (!targetPath || !candidatePath || !patchPath || !outputDirectory || !mode || !baseSha || !['artifact', 'pr'].includes(mode)) {
    throw new Error('Usage: promote.ts --mode artifact|pr --target <target.json> --candidate <result.json> --patch <patch> --base-sha <sha> --output <directory>');
  }
  const target = JSON.parse(await readFile(targetPath, 'utf8')) as CampaignTarget;
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as CandidateResult;
  const result = await promoteWinner({
    mode,
    repositoryRoot: process.cwd(),
    runId: process.env.AUTORESEARCH_RUN_ID ?? 'manual',
    baseSha,
    target,
    candidate,
    patchPath,
    outputDirectory,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
