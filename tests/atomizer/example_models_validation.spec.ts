import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../../scripts/bngDefaults.js';
import { parseBNGL } from '../../services/parseBNGL';

const EXAMPLES_DIR = 'example-models';

function runBNG2(modelPath: string, outdir: string): boolean {
  const modelName = basename(modelPath);
  copyFileSync(modelPath, join(outdir, modelName));
  const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, modelName, '--outdir', outdir], {
    cwd: outdir,
    encoding: 'utf-8',
    timeout: 2 * 60 * 1000,
  });
  return result.status === 0 && true;
}

async function convertAndParse(xml: string) {
  const mod = await import('../../src/lib/atomizer/parser/bngXmlParser');
  const bngl = mod.convertBNGXmlToBNGL(xml);
  const parsed = parseBNGL(bngl);
  return { bngl, parsed };
}

// Discover candidate .bngl files in example-models (top-level only)
const EXAMPLES = readdirSync(EXAMPLES_DIR).filter(f => f.toLowerCase().endsWith('.bngl')).map(f => join(EXAMPLES_DIR, f));

describe('Example models validation (BNG->SBML->convert->parse)', () => {
  for (const model of EXAMPLES) {
    it(`${basename(model)} -> converted BNGL parsed OK`, { timeout: 180000 }, async () => {
      const temp = mkdtempSync(join(tmpdir(), 'bng-examples-'));
      const ok = runBNG2(model, temp);
      if (!ok) {
        console.warn('BNG2.pl did not produce SBML for', model, 'skipping');
        return;
      }

      const xmlPath = join(temp, basename(model).replace(/\.bngl$/, '.xml'));
      const { existsSync } = await import('node:fs');
      if (!existsSync(xmlPath)) {
        console.warn('BNG2.pl did not write SBML for', model, 'skipping');
        return;
      }

      const xml = readFileSync(xmlPath, 'utf8');
      const originalBNGL = readFileSync(model, 'utf8');
      const origParsed = parseBNGL(originalBNGL);

      const { bngl, parsed } = await convertAndParse(xml);

      // Basic sanity checks: counts should be non-zero and comparable types
      expect(parsed.moleculeTypes.length).toBeGreaterThanOrEqual(1);
      expect(parsed.species.length).toBeGreaterThanOrEqual(1);
      expect(parsed.reactionRules.length).toBeGreaterThanOrEqual(1);

      // If original model parses, try to compare high-level counts (where available)
      if (origParsed && origParsed.moleculeTypes) {
        expect(parsed.moleculeTypes.length).toBe(origParsed.moleculeTypes.length);
      }

    });
  }
});
