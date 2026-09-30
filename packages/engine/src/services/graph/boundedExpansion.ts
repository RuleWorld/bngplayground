/**
 * Hard-bounded network expansion.
 *
 * ## Why this exists
 *
 * The parity gates expand a reference model in-process and rely on the
 * expander's cancellation callback to enforce a per-model deadline. That
 * callback is polled between iterations and between rule applications. It is
 * therefore able to stop an expansion that keeps *producing* iterations, but it
 * cannot stop one that is wedged applying a single rule to a combinatorial
 * explosion of match candidates — the callback is never reached, the deadline
 * never fires, and the gate stalls forever instead of reporting a failure.
 *
 * A stalled gate is worse than a failing one: CI stops producing signal
 * entirely, and the models that would have failed are never even named. This
 * module bounds the work at the only level where a bound is real, the process,
 * by expanding in a child that can be killed.
 *
 * ## The two outcomes that matter
 *
 * A timeout here is a *reported* result, not an exception and not a hang:
 *
 *   - `ok`             the model expanded; species/reaction names are returned
 *   - `parse-error`    the model does not parse — the reference pipeline's problem
 *   - `error`          the expander threw, or could not be started
 *   - `killed`         the child died without reporting; `reason` says why
 *
 * For a kill the model should be recorded as *reference unavailable* (BioNetGen
 * could not generate a network for it either) and ratcheted with a stated
 * reason, exactly as an unparseable reference is. It must never be silently
 * skipped: a model that stops expanding for no recorded reason is
 * indistinguishable from a model that expanded correctly.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_PATH = fileURLToPath(new URL('./boundedExpansionWorker.ts', import.meta.url));

/** Markers identifying a Node flag value that registers a TypeScript loader. */
const TS_LOADER_MARKERS = ['tsx', 'ts-node', 'swc', 'esbuild-register'];

/** Node flags whose *value* names a module rather than naming a loader itself. */
const LOADER_VALUE_FLAGS = new Set(['--import', '--require', '--loader', '--experimental-loader']);

/**
 * The parent's loader flags, if it has any.
 *
 * `process.execArgv` is only a usable source of these under some runners. Under
 * `tsx` it carries tsx's own registration, but under a test runner it carries
 * that runner's flags instead and no TypeScript support at all — inheriting
 * those wholesale would hand the child a test bootstrap and still leave the
 * worker unable to load its own `.ts` imports.
 *
 * A flag and its value are separate argv entries and it is the *value* that
 * names the loader, as in `--import file:///.../tsx/dist/loader.mjs`, so a
 * flag can only be judged together with what follows it.
 */
const loaderArgsFromExecArgv = (): string[] => {
  const args = process.execArgv;
  const kept: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (LOADER_VALUE_FLAGS.has(arg)) {
      const value = args[i + 1];
      if (value === undefined || !TS_LOADER_MARKERS.some((marker) => value.includes(marker))) continue;
      kept.push(arg, value);
      i++;
      continue;
    }
    if (TS_LOADER_MARKERS.some((marker) => arg.includes(marker))) kept.push(arg);
  }
  return kept;
};

/**
 * Flags the child needs in order to load TypeScript itself.
 *
 * Prefers whatever registered the parent, and falls back to resolving `tsx`
 * from this module's own location, which works because the loader is hoisted
 * alongside the engine rather than nested inside it.
 */
const resolveLoaderArgs = (): string[] => {
  const inherited = loaderArgsFromExecArgv();
  if (inherited.length > 0) return inherited;
  try {
    createRequire(import.meta.url).resolve('tsx');
    return ['--import', 'tsx'];
  } catch {
    // No TypeScript loader is reachable. The worker will fail to start, and the
    // supervisor reports that as a crash rather than a silent success.
    return [];
  }
};

/** Shape returned when an expansion completes within its bound. */
export interface BoundedExpansionOk {
  status: 'ok';
  /** Species names, unsorted — callers canonicalise and sort as needed. */
  species: string[];
  /** Reactions as the expander produced them, unsorted. */
  reactions: BoundedReaction[];
  durationMs: number;
}

/** Shape returned when the child died without writing a result. */
export interface BoundedExpansionKilled {
  status: 'killed';
  /** Whether the child was stopped by the deadline or died on its own. */
  reason: 'timeout' | 'out-of-memory' | 'crashed';
  error: string;
  durationMs: number;
}

/**
 * One reaction as the expander produced it.
 *
 * Reactants and products are returned separately rather than as a canonical
 * string, because how a reaction is keyed for comparison is a decision for
 * whichever gate is doing the comparing, not for the expander.
 */
export interface BoundedReaction {
  reactants: string[];
  products: string[];
}

/** Shape returned when the model itself could not be expanded. */
export interface BoundedExpansionFailed {
  status: 'parse-error' | 'error';
  error: string;
  durationMs: number;
}

export type BoundedExpansionResult = BoundedExpansionOk | BoundedExpansionKilled | BoundedExpansionFailed;

export interface BoundedExpansionOptions {
  /** Hard wall-clock bound for the expansion, in milliseconds. */
  timeoutMs: number;
  /**
   * Heap ceiling for the child, in megabytes. A model that expands without
   * bound will otherwise take the whole machine down with it before the
   * deadline is reached.
   */
  maxOldSpaceMb?: number;
  /**
   * Grace period between SIGTERM and SIGKILL, in milliseconds. Long enough for
   * the child to flush, short enough that it does not meaningfully extend the
   * bound.
   */
  killGraceMs?: number;
}

const DEFAULT_MAX_OLD_SPACE_MB = 4096;
const DEFAULT_KILL_GRACE_MS = 2_000;

/**
 * Expand one model in a child process that is killed if it overruns.
 *
 * The result is always a value: an overrun becomes a `killed` result rather
 * than a rejection, so a caller sweeping a directory can record it and carry on
 * instead of unwinding the whole sweep.
 */
export const expandBounded = (
  bnglPath: string,
  options: BoundedExpansionOptions,
): Promise<BoundedExpansionResult> => {
  const { timeoutMs, maxOldSpaceMb = DEFAULT_MAX_OLD_SPACE_MB, killGraceMs = DEFAULT_KILL_GRACE_MS } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve({
      status: 'error',
      error: `expandBounded: timeoutMs must be a positive number, got ${timeoutMs}`,
      durationMs: 0,
    });
  }

  const scratch = mkdtempSync(path.join(tmpdir(), 'bounded-expansion-'));
  const resultPath = path.join(scratch, 'result.json');
  const started = Date.now();

  return new Promise<BoundedExpansionResult>((resolve) => {
    let settled = false;
    let timedOut = false;

    const settle = (value: BoundedExpansionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      rmSync(scratch, { recursive: true, force: true });
      resolve(value);
    };

    const child = spawn(
      process.execPath,
      [
        ...resolveLoaderArgs(),
        `--max-old-space-size=${maxOldSpaceMb}`,
        WORKER_PATH,
        bnglPath,
        resultPath,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );

    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // SIGTERM is advisory: a child wedged in a tight loop never reaches a
      // signal handler, so the escalation to SIGKILL is what actually bounds
      // the run.
      setTimeout(() => child.kill('SIGKILL'), killGraceMs).unref();
    }, timeoutMs);
    deadlineTimer.unref();

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      // A result file means the child finished its work; the exit code only
      // tells us how it got there.
      try {
        settle(JSON.parse(readFileSync(resultPath, 'utf8')) as BoundedExpansionResult);
        return;
      } catch {
        // No readable result — the child died before it could report.
      }
      if (timedOut) {
        settle({
          status: 'killed',
          reason: 'timeout',
          error: `expansion exceeded ${timeoutMs}ms and was killed`,
          durationMs: Date.now() - started,
        });
        return;
      }
      settle({
        status: 'killed',
        reason: signal === 'SIGKILL' || code === 137 ? 'out-of-memory' : 'crashed',
        error: `expansion process exited without reporting (code=${code}, signal=${signal})`,
        durationMs: Date.now() - started,
      });
    };

    child.on('error', (err) => {
      settle({
        status: 'error',
        error: `failed to start expansion process: ${err.message}`,
        durationMs: Date.now() - started,
      });
    });
    child.on('exit', onExit);
  });
};

/**
 * True when the result means "no network was produced for this model", as
 * opposed to a network that disagrees with the reference.
 *
 * These are the outcomes that must be ratcheted with a reason rather than
 * counted as parity failures, because BioNetGen does not produce a network for
 * them either.
 */
export const isReferenceUnavailable = (result: BoundedExpansionResult): boolean =>
  result.status === 'killed';
