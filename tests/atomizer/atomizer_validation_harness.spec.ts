import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  compareTimeCourses,
  generateReport,
  validateModel,
} from '../../atomizer_validation_harness';

describe('atomizer validation harness', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('compares time courses with normalized names', () => {
    const ts = new Map<string, number[]>([
      ['A', [1, 2, 3]],
      ['B_total', [0, 0, 0]],
    ]);
    const ref = new Map<string, number[]>([
      ['a', [1, 2, 3]],
      ['b-total', [0, 0, 0]],
    ]);

    const res = compareTimeCourses(ts, ref, 1e-6);
    expect(res.validationRatio).toBe(1);
    expect(res.totalCompared).toBe(2);
    expect(res.totalMatched).toBe(2);
    expect(res.medianRmse).toBe(0);
  });

  it('generates report counts correctly', () => {
    const report = generateReport([
      { biomodelId: 1, status: 'skip_known' },
      { biomodelId: 2, status: 'atomize_fail' },
      { biomodelId: 3, status: 'simulate_fail' },
      { biomodelId: 4, status: 'parity_pass', validationRatio: 1 },
      { biomodelId: 5, status: 'parity_fail', validationRatio: 0.5 },
    ]);

    expect(report.totalModels).toBe(5);
    expect(report.skipped).toBe(1);
    expect(report.tested).toBe(4);
    expect(report.atomizeFails).toBe(1);
    expect(report.simulateFails).toBe(1);
    expect(report.parityPass).toBe(1);
    expect(report.parityFail).toBe(1);
    expect(report.exactMatch).toBe(1);
    expect(report.highVR).toBe(1);
  });

  it('validates a model using provided atomize/simulate functions', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bng-atomizer-'));
    const refPath = path.join(tmpDir, 'bmd0000000002_atomized.bngl');
    await fs.writeFile(refPath, 'begin model\nend model\n', 'utf8');

    const mockFetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<sbml/>'
    }));
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const atomizeFn = async (_sbml: string) => 'begin model\nend model\n';
    const bnglToSbmlFn = async (_bngl: string) => '<sbml/>';
    const simulateSbmlFn = async (_sbml: string, _label: string) => new Map([
      ['A', [1, 2, 3]],
      ['B', [0, 0, 0]],
    ]);

    const result = await validateModel(2, {
      referenceBnglDir: tmpDir,
      atomizeFn,
      bnglToSbmlFn,
      simulateSbmlFn,
      tolerance: 1e-6,
    });

    expect(result.status).toBe('parity_pass');
    expect(result.validationRatio).toBe(1);
  });
});
