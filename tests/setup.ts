import { expect, afterAll, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { isAbsolute, relative } from 'node:path';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers as any);

const TRACE_SHARD = process.env.VITEST_TRACE_SHARD === '1';
const WATCHDOG_TIMEOUT_MS = 120_000; // 2 minutes of silence triggers watchdog

let lastActivity = Date.now();
let watchdogTimer: NodeJS.Timeout | undefined;

function getTraceState() {
  const state = (expect as any).getState?.() ?? {};
  const testPath = typeof state.testPath === 'string'
    ? state.testPath
    : (typeof process.env.VITEST_TEST_PATH === 'string' ? process.env.VITEST_TEST_PATH : undefined);
  const currentTestName = typeof state.currentTestName === 'string'
    ? state.currentTestName
    : undefined;

  return { testPath, currentTestName };
}

function formatTraceLabel() {
  const { testPath, currentTestName } = getTraceState();
  const file = testPath
    ? (isAbsolute(testPath) ? relative(process.cwd(), testPath) : testPath)
    : 'unknown-file';

  return {
    file,
    test: currentTestName ?? 'unknown-test',
    label: `${file} :: ${currentTestName ?? 'unknown-test'}`,
  };
}

function resetWatchdog() {
  lastActivity = Date.now();
}

function startWatchdog() {
  if (!TRACE_SHARD) return;

  const checkActivity = () => {
    const elapsed = Date.now() - lastActivity;
    if (elapsed > WATCHDOG_TIMEOUT_MS) {
      const { file, test } = formatTraceLabel();
      console.error(`[Watchdog] HANG DETECTED: No test activity for ${Math.floor(elapsed / 1000)}s`);
      console.error(`[Watchdog] Last known location: ${file} :: ${test}`);
      console.error(`[Watchdog] This usually indicates a hanging import or test setup`);
      // Don't exit - let the CI timeout handle it, but at least we have diagnostics
    }
  };

  watchdogTimer = setInterval(checkActivity, 30_000);
  watchdogTimer.unref(); // Don't let the watchdog prevent process exit
}

if (TRACE_SHARD) {
  startWatchdog();

  beforeEach(() => {
    resetWatchdog();
    const { label } = formatTraceLabel();
    console.info(`[ShardTrace] START ${label}`);
  });

  afterEach(() => {
    const { label } = formatTraceLabel();
    console.info(`[ShardTrace] END ${label} (cleanup start)`);
    cleanup();
    console.info(`[ShardTrace] END ${label} (cleanup done)`);
    resetWatchdog();
  });

  afterAll(() => {
    const { file } = formatTraceLabel();
    console.info(`[ShardTrace] FILE END ${file}`);
    resetWatchdog();
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
    }
  });
} else {
  // Runs a cleanup after each test case (e.g. clearing jsdom)
  afterEach(() => {
    cleanup();
  });
}
