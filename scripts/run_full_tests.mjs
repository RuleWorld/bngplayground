#!/usr/bin/env node
/**
 * run_full_tests.mjs — Spawns vitest as a child process and guarantees exit.
 *
 * Vitest with pool:'forks' hangs after WASM-loading children (CVODE) finish.
 * This wrapper detects when vitest goes idle (no output for 15s after tests
 * complete), kills it, checks output for pass/fail, and exits.
 *
 * It also handles a second wedge seen in CI: every test file completes (all
 * green) but vitest never prints its "Test Files" summary and sits silent
 * until the hard timeout. Prolonged silence without a summary is treated as
 * that wedge; the run is retried once with a fresh vitest process so an
 * all-green suite is not red-flagged after 24 minutes. A wedge that leaves
 * failure markers in the output is NOT retried — it is a genuine red suite
 * and fails fast instead.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const executable = resolve('node_modules', '.bin', 'vitest' + (process.platform === 'win32' ? '.cmd' : ''));
const spawnExecutable = process.platform === 'win32' ? `"${executable}"` : executable;

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const isProfileRun = args.some((arg) => arg.includes('vitest.profile.config'));
const configuredHardTimeout = Number(process.env.RUN_FULL_TESTS_HARD_TIMEOUT_MS);
// Generous, because the timer starts when this process launches — not when
// vitest does — so it also absorbs checkout and dependency-install time spent
// before the suite begins. It is a backstop against a genuinely wedged run, not
// a budget for the suite: the workflow's per-job `timeout-minutes` is the real
// bound. At 5 minutes a healthy 6 500-test run on a contended runner was killed
// mid-suite and reported as a failure, having run for under three.
const HARD_TIMEOUT_MS = Number.isFinite(configuredHardTimeout) && configuredHardTimeout > 0
  ? configuredHardTimeout
  : (isProfileRun ? 35 : 24) * 60 * 1000;
// One absolute deadline for the whole wrapper, shared across attempts, so a
// wedge retry can never push the job past the hard timeout.
const deadline = Date.now() + HARD_TIMEOUT_MS;

const IDLE_KILL_MS = 15_000;
const configuredWedgeSilence = Number(process.env.RUN_FULL_TESTS_WEDGE_SILENCE_MS);
// Longer than testTimeout (5 minutes): a hanging TEST fails loudly into the
// output stream long before this elapses, so only a wedged process tree —
// one that produces nothing at all — triggers the wedge path.
const WEDGE_SILENCE_MS = Number.isFinite(configuredWedgeSilence) && configuredWedgeSilence > 0
  ? configuredWedgeSilence
  : 10 * 60 * 1000;
const configuredRetries = Number(process.env.RUN_FULL_TESTS_WEDGE_RETRIES);
// Profile runs are too expensive to repeat; everything else retries a
// summary-less wedge once.
const WEDGE_RETRIES = Number.isFinite(configuredRetries) && configuredRetries >= 0
  ? configuredRetries
  : (isProfileRun ? 0 : 1);

let output = '';
let lastOutputTime = Date.now();
let attemptKillReason = null; // 'shutdown' | 'wedge' | null

function stripAnsi(text) {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}

function hasCompletionSignal(clean = stripAnsi(output)) {
  return /Test Files\s/.test(clean) || /Tests\s+\d+ passed/.test(clean);
}

// Per-file result lines the default reporter prints as files finish:
// "  ✓ path/file.spec.ts (3 tests) 5ms", "  × … (2 tests | 1 failed)",
// "  ↓ … (0 test)".
const FILE_RESULT_PATTERN = /^\s*[✓×↓❯]\s+\S+\.(?:spec|test)\.[cm]?[jt]sx?\s\(/gm;

function countFileResults(clean) {
  return (clean.match(FILE_RESULT_PATTERN) || []).length;
}

function sawFailure(clean) {
  return /Unhandled Errors?/.test(clean)
    || /Errors\s+\d+ errors?/.test(clean)
    || /Test Files\s.*failed/.test(clean)
    || /^\s*[×❯]\s/m.test(clean);
}

function runVitest() {
  output = '';
  attemptKillReason = null;
  lastOutputTime = Date.now();
  return new Promise((resolveRun) => {
    const child = spawn(
      spawnExecutable,
      ['run', ...args],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, shell: process.platform === 'win32' }
    );

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      lastOutputTime = Date.now();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
      lastOutputTime = Date.now();
      process.stderr.write(chunk);
    });

    let settled = false;
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      clearInterval(idleCheck);
      clearTimeout(hardTimer);
      resolveRun({ code, signal, reason: attemptKillReason });
    };

    // ── Idle detector ──
    const idleCheck = setInterval(() => {
      if (attemptKillReason) return;
      const idle = Date.now() - lastOutputTime;
      const clean = stripAnsi(output);
      if (idle >= IDLE_KILL_MS && hasCompletionSignal(clean)) {
        console.error(`\n[run_full_tests] No output for ${Math.round(idle / 1000)}s — killing hung vitest`);
        attemptKillReason = 'shutdown';
        child.kill('SIGKILL');
      } else if (idle >= WEDGE_SILENCE_MS && !hasCompletionSignal(clean)) {
        console.error(`\n[run_full_tests] No output for ${Math.round(idle / 1000)}s without a test summary — killing wedged vitest`);
        attemptKillReason = 'wedge';
        child.kill('SIGKILL');
      }
    }, 5_000);
    idleCheck.unref();

    // Hard safety net: one global deadline, shared by every attempt.
    const remaining = deadline - Date.now();
    const hardTimer = setTimeout(() => {
      if (!attemptKillReason) {
        console.error('\n[run_full_tests] Hard timeout — killing vitest');
        attemptKillReason = 'hard';
        child.kill('SIGKILL');
      }
    }, Math.max(remaining, 0));
    hardTimer.unref();

    child.on('exit', (code, signal) => {
      // 'close' waits for the stdio streams to end, but descendants of a
      // SIGKILLed vitest can hold the pipes open indefinitely. Give streams a
      // short grace period, then settle with whatever has been captured.
      setTimeout(() => settle(code, signal), 2_000);
    });
    child.on('close', (code, signal) => settle(code, signal));
  });
}

const maxAttempts = 1 + WEDGE_RETRIES;
let attempt = 1;

// Emergency exit if vitest close events never fire. Registered before the
// retry loop: the loop's first `await` suspends module evaluation, so anything
// below it would never run.
setTimeout(() => {
  console.error('\n[run_full_tests] Emergency exit');
  process.exit(1);
}, HARD_TIMEOUT_MS + 30_000).unref();

for (;;) {
  const result = await runVitest();
  const clean = stripAnsi(output);
  const fileResults = countFileResults(clean);

  // Clean exit
  if (result.code === 0) {
    console.log('\n[run_full_tests] vitest exited cleanly — all tests passed');
    process.exit(0);
  }

  // Forgive a non-zero close only when the wrapper killed a process that had
  // already printed a complete, error-free summary (pool shutdown hang).
  if ((result.reason || result.signal) && hasCompletionSignal(clean) && !sawFailure(clean)) {
    const reason = result.signal ? `killed by ${result.signal} during pool shutdown` : `exit code ${result.code}`;
    console.log(`\n[run_full_tests] All tests passed (${reason})`);
    process.exit(0);
  }

  // Wedge without a summary and without any failure marker: every reported
  // file is green, vitest just never aggregated. Retry once with a fresh
  // process — only a retry that also fails keeps the run red.
  const retryBudgetLeft = deadline - Date.now() > WEDGE_SILENCE_MS + 120_000;
  if (result.reason === 'wedge' && attempt < maxAttempts && !sawFailure(clean) && retryBudgetLeft) {
    console.error(`\n[run_full_tests] Vitest wedged after ${fileResults} green file results without printing its summary — retrying (attempt ${attempt + 1}/${maxAttempts})`);
    attempt += 1;
    continue;
  }

  if (result.reason === 'wedge') {
    console.error(`\n[run_full_tests] Tests failed: vitest wedged with no output and no summary after ${fileResults} file results (exit code: ${result.code}, signal: ${result.signal})`);
  } else {
    console.error(`\n[run_full_tests] Tests failed (exit code: ${result.code}, signal: ${result.signal})`);
  }
  process.exit(1);
}

