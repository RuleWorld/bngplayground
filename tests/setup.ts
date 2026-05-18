import { expect, afterAll, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { isAbsolute, relative } from 'node:path';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers as any);

const TRACE_SHARD = process.env.VITEST_TRACE_SHARD === '1';

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

if (TRACE_SHARD) {
  const { file } = formatTraceLabel();
  console.info(`[ShardTrace] FILE START ${file}`);

  beforeEach(() => {
    const { label } = formatTraceLabel();
    console.info(`[ShardTrace] START ${label}`);
  });

  afterEach(() => {
    const { label } = formatTraceLabel();
    console.info(`[ShardTrace] END ${label} (cleanup start)`);
    cleanup();
    console.info(`[ShardTrace] END ${label} (cleanup done)`);
  });

  afterAll(() => {
    const { file } = formatTraceLabel();
    console.info(`[ShardTrace] FILE END ${file}`);
  });
} else {
  // Runs a cleanup after each test case (e.g. clearing jsdom)
  afterEach(() => {
    cleanup();
  });
}
