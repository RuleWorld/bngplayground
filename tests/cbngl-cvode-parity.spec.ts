import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { generateExpandedNetwork, simulate } from '@bngplayground/engine';

import { parseBNGL } from '../services/parseBNGL.ts';
import { getSimulationOptionsFromParsedModel } from '../packages/engine/src/utils/simulationOptions.ts';
import { findRuleHubModelPath } from './helpers/rulehub.ts';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');
const cbnglReferencePath = resolve(projectRoot, 'tests', 'fixtures', 'gdat', 'cBNGL_simple.gdat');

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
  it('matches the BioNetGen reference without model-specific CVODE tuning', async () => {
    const modelPath = findRuleHubModelPath('cBNGL_simple', projectRoot);
    expect(modelPath).toBeTruthy();

    const parsed = parseBNGL(readFileSync(modelPath!, 'utf8'), { modelName: 'cBNGL_simple' });
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const baseOptions = getSimulationOptionsFromParsedModel(expanded, 'default');
    const ref = parseGdat(readFileSync(cbnglReferencePath, 'utf8'));

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
});
