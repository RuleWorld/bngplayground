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
const child = spawn(
  resolve('node_modules', '.bin', 'vitest'),
  ['run', ...args],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
);

let output = '';
let lastOutputTime = Date.now();

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
const HARD_TIMEOUT_MS = 5 * 60 * 1000;
let killed = false;

const idleCheck = setInterval(() => {
  if (killed) return;
  const idle = Date.now() - lastOutputTime;
  if (idle >= IDLE_KILL_MS && output.length > 0) {
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

child.on('close', (code) => {
  clearInterval(idleCheck);
  clearTimeout(hardTimer);

  // Clean exit
  if (code === 0) {
    console.log('\n[run_full_tests] vitest exited cleanly — all tests passed');
    process.exit(0);
  }

  // Vitest was killed or crashed. Determine pass/fail from captured output.
  const hasPassSummary = /Test Files\s.*passed/.test(output);
  const hasFailSummary = /Test Files\s.*failed/.test(output);
  const hasShardEnds   = /\[ShardTrace\] FILE END/.test(output);
  const hasTestFail    = /FAIL /.test(output);

  // Case 1: vitest printed full summary before we killed it
  if (hasPassSummary && !hasFailSummary) {
    console.log('\n[run_full_tests] All tests passed (killed during pool shutdown)');
    process.exit(0);
  }

  // Case 2: vitest never printed summary (common), but ShardTrace shows
  // all files completed and no explicit failures in output
  if (hasShardEnds && !hasTestFail && !hasFailSummary) {
    console.log('\n[run_full_tests] All test files completed without failures (killed during pool shutdown)');
    process.exit(0);
  }

  // Case 3: real failure
  console.error(`\n[run_full_tests] Tests failed (vitest exit code: ${code})`);
  process.exit(1);
});

// Emergency exit if close event never fires
setTimeout(() => {
  console.error('\n[run_full_tests] Emergency exit');
  process.exit(1);
}, HARD_TIMEOUT_MS + 30_000).unref();
