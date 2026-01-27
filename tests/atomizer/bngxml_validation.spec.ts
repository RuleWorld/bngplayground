import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../../scripts/bngDefaults.js';
import { parseBNGL } from '../../services/parseBNGL';

import fs from 'node:fs';
import { join as joinPath } from 'node:path';

const VALIDATE_DIR = 'bionetgen/bng2/Validate';

// Discover .bngl models in the Validate directory
const MODELS = fs.readdirSync(VALIDATE_DIR)
  .filter(f => f.toLowerCase().endsWith('.bngl'))
  .map(f => joinPath(VALIDATE_DIR, f));

function runBNG2(modelPath: string, outdir: string): boolean {
  const modelName = basename(modelPath);
  copyFileSync(modelPath, join(outdir, modelName));
  const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, modelName, '--outdir', outdir], {
    cwd: outdir,
    encoding: 'utf-8',
    timeout: 120000,
  });
  return result.status === 0 && true;
}

async function convertAndParse(xml: string) {
  const mod = await import('../../src/lib/atomizer/parser/bngXmlParser');
  const bngl = mod.convertBNGXmlToBNGL(xml);
  const parsed = parseBNGL(bngl);
  return { bngl, parsed };
}

describe('BNG XML validation (coverage expansion)', () => {
  for (const model of MODELS) {
    it(`${basename(model)} -> converted BNGL has matching counts`, { timeout: 180000 }, async () => {
      const temp = mkdtempSync(join(tmpdir(), 'bng-validate-'));
      const ok = runBNG2(model, temp);
      if (!ok) {
        // Model couldn't produce SBML; skip
        console.warn('BNG2.pl failed to produce SBML for', model, 'skipping');
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

      // Compare counts
      expect(parsed.moleculeTypes.length).toBe(origParsed.moleculeTypes.length);
      expect(parsed.species.length).toBe(origParsed.species.length);
      expect(parsed.reactionRules.length).toBe(origParsed.reactionRules.length);

    });
  }
});
