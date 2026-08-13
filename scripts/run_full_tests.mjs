#!/usr/bin/env node
/**
 * run_full_tests.mjs — Spawns vitest as a child process and guarantees exit.
 *
 * Vitest with pool:'forks' hangs after WASM-loading children (CVODE) finish.
 * This wrapper detects when vitest goes idle (no output for 15s after tests
 * complete), kills it, checks output for pass/fail, and exits.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const executable = resolve('node_modules', '.bin', 'vitest' + (process.platform === 'win32' ? '.cmd' : ''));
const spawnExecutable = process.platform === 'win32' ? `"${executable}"` : executable;
const child = spawn(
  spawnExecutable,
  ['run', ...args],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, shell: process.platform === 'win32' }
);

let output = '';
let lastOutputTime = Date.now();
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

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

// ── Idle detector: if no output for 15s, vitest is hung during shutdown ──
const IDLE_KILL_MS = 15_000;
const isProfileRun = args.some((arg) => arg.includes('vitest.profile.config'));
const configuredHardTimeout = Number(process.env.RUN_FULL_TESTS_HARD_TIMEOUT_MS);
const HARD_TIMEOUT_MS = Number.isFinite(configuredHardTimeout) && configuredHardTimeout > 0
  ? configuredHardTimeout
  : (isProfileRun ? 20 : 5) * 60 * 1000;
let killed = false;

function hasCompletionSignal() {
  const clean = output.replace(ANSI_ESCAPE_PATTERN, '');
  return /Test Files\s/.test(clean) || /Tests\s+\d+ passed/.test(clean);
}

const idleCheck = setInterval(() => {
  if (killed) return;
  const idle = Date.now() - lastOutputTime;
  // A long-running test can legitimately produce no output for many minutes.
  // Only treat silence as a shutdown hang after Vitest printed its summary.
  if (idle >= IDLE_KILL_MS && hasCompletionSignal()) {
    console.error(`\n[run_full_tests] No output for ${Math.round(idle/1000)}s — killing hung vitest`);
    killed = true;
    child.kill('SIGKILL');
  }
}, 5_000);
idleCheck.unref();

// Hard safety net
const hardTimer = setTimeout(() => {
  if (!killed) {
    console.error('\n[run_full_tests] Hard timeout — killing vitest');
    killed = true;
    child.kill('SIGKILL');
  }
}, HARD_TIMEOUT_MS);
hardTimer.unref();

/**
 * Determine pass/fail from captured vitest output.
 * Works regardless of whether ShardTrace is enabled.
 */
function didTestsPass() {
  // Strip ANSI escape codes for reliable matching
  const clean = output.replace(ANSI_ESCAPE_PATTERN, '');

  // Only a complete, error-free Vitest summary can prove success. In
  // particular, "N passed" plus an "Unhandled Errors" section is a failure.
  if (/Unhandled Errors?/.test(clean) || /Errors\s+\d+ errors?/.test(clean)) return false;
  if (/Test Files\s.*failed/.test(clean)) return false;
  return /Test Files\s.*passed/.test(clean);
}

child.on('close', (code, signal) => {
  clearInterval(idleCheck);
  clearTimeout(hardTimer);

  // Clean exit
  if (code === 0) {
    console.log('\n[run_full_tests] vitest exited cleanly — all tests passed');
    process.exit(0);
  }

  // Only forgive a non-zero close when this wrapper killed a process that had
  // already printed a complete, error-free summary during pool shutdown.
  if (killed && didTestsPass()) {
    const reason = signal ? `killed by ${signal} during pool shutdown` : `exit code ${code}`;
    console.log(`\n[run_full_tests] All tests passed (${reason})`);
    process.exit(0);
  }

  console.error(`\n[run_full_tests] Tests failed (exit code: ${code}, signal: ${signal})`);
  process.exit(1);
});

// Emergency exit if close event never fires
setTimeout(() => {
  console.error('\n[run_full_tests] Emergency exit');
  process.exit(1);
}, HARD_TIMEOUT_MS + 30_000).unref();
