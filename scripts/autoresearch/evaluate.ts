import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { campaignTargetSchema, candidateResultSchema, type CampaignTarget, type CandidateResult } from './schemas.js';
import { globalLockedPaths } from './prompt.js';
import { runGit, runProcess, shortId, writeJson } from './utils.js';

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
};

type EvaluateOptions = {
  repositoryRoot: string;
  patchPath: string;
  target: CampaignTarget;
  baseSha: string;
  runId: string;
  candidate: number;
  generation: number;
  outputDirectory: string;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isPathWithin(path: string, roots: string[]): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  return roots.some((root) => {
    const normalizedRoot = root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
  });
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !normalized.split('/').includes('..');
}

type ProcessCommand = { args: readonly string[]; executable: string };

async function executeCommand(command: ProcessCommand, cwd: string, env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  try {
    const result = await runProcess(command.executable, command.args, cwd, env);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const commandError = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    const stdout = commandError.stdout ?? '';
    const stderr = commandError.stderr ?? '';
    return {
      ok: false,
      stdout,
      stderr,
      error: `${commandError.message}${commandError.code === undefined ? '' : ` (code ${commandError.code})`}`,
    };
  }
}

function commandOutput(result: CommandResult): string {
  return `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`;
}

async function runCommand(command: ProcessCommand, cwd: string, logPath: string, env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  const result = await executeCommand(command, cwd, env);
  await writeFile(logPath, commandOutput(result), 'utf8');
  return result;
}

async function runCommands(commands: ProcessCommand[], cwd: string, logPath: string, env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  const results: CommandResult[] = [];
  for (const command of commands) {
    const result = await executeCommand(command, cwd, env);
    results.push(result);
    if (!result.ok) break;
  }
  const stdout = results.map((result) => result.stdout).join('\n');
  const stderr = results.map((result) => result.stderr).filter(Boolean).join('\n');
  const failed = results.find((result) => !result.ok);
  const combined = { ok: failed === undefined, stdout, stderr, ...(failed?.error ? { error: failed.error } : {}) };
  await writeFile(logPath, commandOutput(combined), 'utf8');
  return combined;
}

function lastJsonLine(output: string): Record<string, unknown> | undefined {
  const lines = output.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Evaluators may print progress before their machine-readable final line.
    }
  }
  return undefined;
}

function baselineValue(target: CampaignTarget): number | undefined {
  const direct = target.baseline_metrics[target.fitness.primary_name];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (target.fitness.primary_name === 'stable_tool_count_error') {
    const count = target.baseline_metrics.stable_tool_count;
    const expected = target.baseline_metrics.expected_stable_count;
    if (typeof count === 'number' && typeof expected === 'number') return Math.abs(count - expected);
  }
  if (target.fitness.primary_name.endsWith('_ms')) {
    const valueMs = target.baseline_metrics.value_ms;
    if (typeof valueMs === 'number' && Number.isFinite(valueMs)) return valueMs;
  }
  return undefined;
}

function strictlyImproves(target: CampaignTarget, baseline: number, candidate: number): boolean {
  return target.fitness.higher_is_better ? candidate > baseline : candidate < baseline;
}

async function changedFiles(repositoryRoot: string): Promise<string[]> {
  const tracked = await runGit(repositoryRoot, ['diff', '--name-only']);
  const untracked = await runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))].sort();
}

async function ensureNodeModulesLink(repositoryRoot: string, worktree: string): Promise<void> {
  const source = join(repositoryRoot, 'node_modules');
  const destination = join(worktree, 'node_modules');
  if (!existsSync(source) || existsSync(destination)) return;
  await symlink(source, destination, 'junction');
}

function baseResult(options: EvaluateOptions, status: CandidateResult['status'], notes: string[], changed: string[], guards: CandidateResult['guards'], patchSha256?: string): CandidateResult {
  return candidateResultSchema.parse({
    run_id: options.runId,
    campaign: options.target.campaign,
    generation: options.generation,
    candidate: options.candidate,
    base_sha: options.baseSha,
    status,
    patch_sha256: patchSha256,
    patch_path: options.patchPath,
    changed_files: changed,
    guards,
    notes,
  });
}

export async function evaluateCandidate(options: EvaluateOptions): Promise<CandidateResult> {
  await writeJson(join(options.outputDirectory, 'target.json'), options.target);
  const patch = await readFile(options.patchPath, 'utf8');
  const patchSha256 = createHash('sha256').update(patch).digest('hex');
  const worktree = join('/private/tmp', 'bng-autoresearch', options.runId, options.target.campaign, `${options.candidate}-${shortId(options.target.target_id)}`);
  const guards = { locked_paths_clean: false, typecheck: false, tests: false, scientific_suite: false };
  let result: CandidateResult;

  try {
    await mkdir(dirname(worktree), { recursive: true });
    await runGit(options.repositoryRoot, ['worktree', 'add', '--detach', worktree, options.baseSha]);
    await ensureNodeModulesLink(options.repositoryRoot, worktree);

    const check = await runCommand({ executable: 'git', args: ['apply', '--check', options.patchPath] }, worktree, join(options.outputDirectory, 'patch-check.log'));
    if (!check.ok) {
      result = baseResult(options, 'PATCH_REJECTED', [`git apply --check failed: ${check.error ?? check.stderr}`], [], guards, patchSha256);
      return result;
    }
    const apply = await runCommand({ executable: 'git', args: ['apply', options.patchPath] }, worktree, join(options.outputDirectory, 'patch-apply.log'));
    if (!apply.ok) {
      result = baseResult(options, 'PATCH_REJECTED', [`git apply failed: ${apply.error ?? apply.stderr}`], [], guards, patchSha256);
      return result;
    }

    const files = await changedFiles(worktree);
    const invalidPath = files.find((path) => !isSafeRelativePath(path));
    const lockedPath = files.find((path) => isPathWithin(path, [...globalLockedPaths, ...options.target.locked_paths]));
    const outsideEditableScope = files.find((path) => !isPathWithin(path, options.target.editable_paths));
    if (invalidPath || lockedPath || outsideEditableScope || files.length === 0) {
      const reason = invalidPath
        ? `unsafe changed path ${invalidPath}`
        : lockedPath
          ? `locked path changed ${lockedPath}`
          : outsideEditableScope
            ? `path outside editable scope ${outsideEditableScope}`
            : 'patch produced no changed files';
      guards.locked_paths_clean = !invalidPath && !lockedPath && !outsideEditableScope;
      result = baseResult(options, 'GUARD_REJECTED', [reason], files, guards, patchSha256);
      return result;
    }
    guards.locked_paths_clean = true;

    const typecheck = await runCommand({ executable: 'npm', args: ['run', 'type-check'] }, worktree, join(options.outputDirectory, 'typecheck.log'), { AUTORESEARCH_BASE_SHA: options.baseSha });
    guards.typecheck = typecheck.ok;
    if (!typecheck.ok) {
      result = baseResult(options, 'TEST_FAILED', [`type-check failed: ${typecheck.error ?? typecheck.stderr}`], files, guards, patchSha256);
      return result;
    }

    const tests = await runCommands([
      { executable: 'npm', args: ['run', 'test:fast'] },
      { executable: 'npm', args: ['run', 'test', '--workspace', '@bngplayground/mcp-server'] },
    ], worktree, join(options.outputDirectory, 'tests.log'), { AUTORESEARCH_BASE_SHA: options.baseSha });
    guards.tests = tests.ok;
    if (!tests.ok) {
      result = baseResult(options, 'TEST_FAILED', [`tests failed: ${tests.error ?? tests.stderr}`], files, guards, patchSha256);
      return result;
    }

    const scientific = await runCommand({ executable: 'npm', args: ['run', 'test:full:safe'] }, worktree, join(options.outputDirectory, 'scientific-suite.log'), { AUTORESEARCH_BASE_SHA: options.baseSha });
    guards.scientific_suite = scientific.ok;
    if (!scientific.ok) {
      result = baseResult(options, 'TEST_FAILED', [`scientific suite failed: ${scientific.error ?? scientific.stderr}`], files, guards, patchSha256);
      return result;
    }

    const fitness = await runCommand({ executable: 'node', args: options.target.fitness_command.args }, worktree, join(options.outputDirectory, 'fitness.log'), { AUTORESEARCH_BASE_SHA: options.baseSha });
    if (!fitness.ok) {
      result = baseResult(options, 'EVALUATION_ERROR', [`fitness evaluator failed: ${fitness.error ?? fitness.stderr}`], files, guards, patchSha256);
      return result;
    }
    const measured = lastJsonLine(fitness.stdout);
    const candidateValue = measured?.value;
    const primaryName = measured?.primary_name;
    const baseline = baselineValue(options.target);
    if (typeof candidateValue !== 'number' || !Number.isFinite(candidateValue) || primaryName !== options.target.fitness.primary_name || baseline === undefined) {
      result = baseResult(options, 'EVALUATION_ERROR', ['fitness evaluator did not return the expected finite metric and primary name'], files, guards, patchSha256);
      return result;
    }
    const fitnessResult = {
      primary_name: options.target.fitness.primary_name,
      baseline,
      candidate: candidateValue,
      delta: candidateValue - baseline,
      higher_is_better: options.target.fitness.higher_is_better,
    };
    result = candidateResultSchema.parse({
      ...baseResult(options, strictlyImproves(options.target, baseline, candidateValue) ? 'VALID_WIN' : 'VALID_NO_WIN', [], files, guards, patchSha256),
      fitness: fitnessResult,
    });
    return result;
  } catch (error) {
    result = baseResult(options, 'EVALUATION_ERROR', [error instanceof Error ? error.message : String(error)], [], guards, patchSha256);
    return result;
  } finally {
    try {
      await runGit(options.repositoryRoot, ['worktree', 'remove', '--force', worktree]);
    } catch {
      // Preserve the candidate result. The controller can report a cleanup warning.
    }
    await writeJson(join(options.outputDirectory, 'result.json'), result!);
  }
}

if (process.argv[1]?.endsWith('evaluate.ts')) {
  const patchPath = argument('--patch');
  const targetPath = argument('--target');
  const baseSha = argument('--base-sha') ?? process.env.AUTORESEARCH_BASE_SHA;
  const outputDirectory = argument('--output') ?? process.env.AUTORESEARCH_OUTPUT;
  if (!patchPath || !targetPath || !baseSha || !outputDirectory) {
    throw new Error('Usage: evaluate.ts --patch <path> --target <path> --base-sha <sha> --output <directory>');
  }
  const target = campaignTargetSchema.parse(JSON.parse(await readFile(resolve(targetPath), 'utf8')));
  const result = await evaluateCandidate({
    repositoryRoot: process.cwd(),
    patchPath: resolve(patchPath),
    target,
    baseSha,
    runId: process.env.AUTORESEARCH_RUN_ID ?? 'manual',
    candidate: Number(process.env.AUTORESEARCH_CANDIDATE ?? 1),
    generation: Number(process.env.AUTORESEARCH_GENERATION ?? 1),
    outputDirectory: resolve(outputDirectory),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
