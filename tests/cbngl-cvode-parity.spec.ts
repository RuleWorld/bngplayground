import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { generateExpandedNetwork, simulate } from '../packages/engine/src/index';

import { parseBNGL } from '../services/parseBNGL.ts';
import { getSimulationOptionsFromParsedModel } from '../packages/engine/src/utils/simulationOptions.ts';
import { hasBNG2, resolveBNG2Paths } from '../tools/bng2-paths';
import { findRuleHubModelPath } from './helpers/rulehub.ts';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');
const bng2PathsAtLoad = resolveBNG2Paths();
const bng2PathAtLoad = process.env.BNG2_PATH ?? bng2PathsAtLoad.bng2pl;
const maybeItBng2 = bng2PathAtLoad && hasBNG2() ? it : it.skip;

function generateReferenceGdatWithBng2(modelPath: string): string {
  const bng2Paths = resolveBNG2Paths();
  const bng2Path = process.env.BNG2_PATH ?? bng2Paths.bng2pl;
  if (!bng2Path) {
    throw new Error('BNG2.pl not found. Set BNG2_PATH or install PyBioNetGen for runtime GDAT generation.');
  }

  const perlCmd = process.env.PERL_CMD ?? 'perl';
  const workDir = mkdtempSync(join(tmpdir(), 'cbngl-cvode-parity-'));
  const modelName = basename(modelPath);
  const localModelPath = join(workDir, modelName);
  copyFileSync(modelPath, localModelPath);

  try {
    const run = spawnSync(perlCmd, [bng2Path, modelName, '--outdir', workDir], {
      cwd: workDir,
      encoding: 'utf8',
      timeout: 2 * 60 * 1000,
      env: {
        ...process.env,
        ...(bng2Paths.bngRoot ? { BNGPATH: bng2Paths.bngRoot } : {}),
        ...(bng2Paths.perl5lib ? { PERL5LIB: process.env.PERL5LIB ?? bng2Paths.perl5lib } : {}),
      },
    });

    if (run.status !== 0) {
      throw new Error(
        `BNG2.pl failed (status=${run.status ?? 'null'})\nstdout:\n${run.stdout ?? ''}\nstderr:\n${run.stderr ?? ''}`
      );
    }

    const gdatName = basename(modelName).replace(/\.bngl$/i, '.gdat');
    const gdatPath = join(workDir, gdatName);
    const candidates = readdirSync(workDir).filter((name) => name.toLowerCase().endsWith('.gdat'));
    const chosenPath = candidates.includes(gdatName) ? gdatPath : candidates[0] ? join(workDir, candidates[0]) : null;

    if (!chosenPath) {
      throw new Error(`BNG2.pl completed but produced no GDAT output in ${workDir}`);
    }

    return readFileSync(chosenPath, 'utf8');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function parseGdat(text: string): Record<string, number>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines[0].trim().replace(/^#\s*/, '').split(/\s+/);
  return lines.slice(1).map((line) => {
    const parts = line.trim().split(/\s+/).map(Number);
    const row: Record<string, number> = {};
    headers.forEach((header, idx) => {
      row[header] = parts[idx];
    });
    return row;
  });
}

describe('cBNGL_simple CVODE parity', () => {
  maybeItBng2('matches the BioNetGen reference without model-specific CVODE tuning', async () => {
    const modelPath = findRuleHubModelPath('cBNGL_simple', projectRoot);
    expect(modelPath).toBeTruthy();

    const parsed = parseBNGL(readFileSync(modelPath!, 'utf8'), { modelName: 'cBNGL_simple' });
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const baseOptions = getSimulationOptionsFromParsedModel(expanded, 'default');
    const ref = parseGdat(generateReferenceGdatWithBng2(modelPath!));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const results = await simulate(
        0,
        expanded,
        { ...baseOptions, solver: 'cvode', adaptiveCvodeTuning: false },
        { checkCancelled: () => {}, postMessage: () => {} }
      );

      let maxAbs = 0;
      for (let i = 0; i < Math.min(results.data.length, ref.length); i++) {
        for (const key of ['TF_nuc', 'Tot_mRNA', 'Tot_P', 'P_R'] as const) {
          const diff = Math.abs((results.data[i] as Record<string, number>)[key] - ref[i][key]);
          if (diff > maxAbs) maxAbs = diff;
        }
      }

      expect(maxAbs).toBeLessThan(1e-5);
      expect(
        warnSpy.mock.calls.some(([msg]) => String(msg).includes('Unknown function: rate_transcribe'))
      ).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  }, 60_000);

  it('keeps the amount-space fast path numerically aligned with the slow path', async () => {
    const modelPath = findRuleHubModelPath('cBNGL_simple', projectRoot);
    expect(modelPath).toBeTruthy();

    const parsed = parseBNGL(readFileSync(modelPath!, 'utf8'), { modelName: 'cBNGL_simple' });
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const baseOptions = getSimulationOptionsFromParsedModel(expanded, 'default');
    const callbacks = { checkCancelled: () => {}, postMessage: () => {} };

    const fastResult = await simulate(
      0,
      expanded,
      { ...baseOptions, solver: 'cvode', adaptiveCvodeTuning: false, enableNativeBytecode: true } as any,
      callbacks
    );

    const slowResult = await simulate(
      1,
      expanded,
      { ...baseOptions, solver: 'cvode', adaptiveCvodeTuning: false, disableNativeBytecode: true } as any,
      callbacks
    );

    expect(fastResult.data.length).toBe(slowResult.data.length);

    let maxDiff = 0;
    for (let i = 0; i < fastResult.data.length; i++) {
      const fastRow = fastResult.data[i] as Record<string, number>;
      const slowRow = slowResult.data[i] as Record<string, number>;
      const keys = Object.keys(fastRow);
      expect(Object.keys(slowRow)).toEqual(keys);
      for (const key of keys) {
        const diff = Math.abs(fastRow[key] - slowRow[key]);
        if (diff > maxDiff) maxDiff = diff;
      }
    }

    expect(maxDiff).toBeLessThan(2e-6);
  }, 60_000);
});
