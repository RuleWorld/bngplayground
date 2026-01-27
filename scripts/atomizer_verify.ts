#!/usr/bin/env ts-node-esm
/*
 * Local verification script (do NOT commit this file unless approved)
 * - For each BNGL in a configured set (default: small set in bionetgen/bng2/Validate)
 * - Run BNG2.pl to export SBML into a temp directory
 * - Run the web atomizer on the generated SBML
 * - Compare normalized BNGL outputs (text) and report differences
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from './bngDefaults.js';


const MODELS = [
  'bionetgen/bng2/Validate/simple_system.bngl',
  'bionetgen/bng2/Validate/isomerization.bngl',
  'bionetgen/bng2/Validate/Repressilator.bngl'
];

function normalizeBNGL(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function runBNG2OnModel(bnglPath: string, tempDir: string): boolean {
  const modelName = basename(bnglPath);
  const modelCopy = join(tempDir, modelName);
  copyFileSync(bnglPath, modelCopy);

  const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;
  const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;

  console.log(`Running: ${PERL_CMD} ${BNG2_PATH} ${modelName} --outdir ${tempDir}`);
  const result = spawnSync(PERL_CMD, [BNG2_PATH, modelName, '--outdir', tempDir], {
    cwd: tempDir,
    encoding: 'utf-8',
    timeout: 2 * 60 * 1000,
  });

  if (result.error) {
    console.warn(`BNG2 spawn error: ${result.error}`);
    return false;
  }

  if (result.status !== 0) {
    console.warn(`BNG2 non-zero status: ${result.status}`);
    console.warn(result.stdout);
    console.warn(result.stderr);
    // still check if SBML file exists
  }

  const xmlName = modelName.replace(/\.bngl$/i, '.xml');
  return existsSync(join(tempDir, xmlName));
}

(async function main() {
  console.log('Local atomizer verification. No files will be committed.');

  for (const model of MODELS) {
    console.log('\n=== MODEL: %s ===', model);
    const tempDir = mkdtempSync(join(tmpdir(), 'bng-atomize-'));

    const bng2Success = runBNG2OnModel(model, tempDir);
    if (!bng2Success) {
      console.warn('BNG2 did not produce SBML for model, skipping:', model);
      continue;
    }

    const xmlName = basename(model).replace(/\.bngl$/i, '.xml');
    const xmlPath = join(tempDir, xmlName);
    const xml = readFileSync(xmlPath, 'utf8');

    // Shim for libsbmljs (worker global 'self' in Node environment)
    // Save original if present
    const originalSelf = (globalThis as any).self;
    try {
      (globalThis as any).self = globalThis;

      // Import Atomizer after setting global 'self' so libsbmljs can initialize correctly
      let Atomizer: any;
      try {
        const mod = await import('../src/lib/atomizer/index.ts');
        Atomizer = mod.Atomizer;
      } catch (e) {
        console.error('Failed to import Atomizer module:', e?.message || e);
        console.error('Skipping atomizer run for this model.');
        continue;
      }

      const atomizer = new Atomizer();
      try {
        await atomizer.initialize();
      } catch (e) {
        console.error('Atomizer.initialize() failed:', e?.message || e);
        console.error('Skipping atomizer run for this model (libsbmljs may not be compatible in Node).');
        continue;
      }

      const res = await atomizer.atomize(xml);
      if (!res.success) {
        console.warn('Atomizer failed for model:', model, 'error:', res.error);
        continue;
      }

      const generatedBNGL = res.bngl;
      const originalBNGL = readFileSync(model, 'utf8');

      const a = normalizeBNGL(generatedBNGL);
      const b = normalizeBNGL(originalBNGL);

      if (a === b) {
        console.log('TEXT MATCH: Generated BNGL matches original (text-normalized).');
      } else {
        console.log('TEXT MISMATCH: Outputs differ (showing first 400 chars each)');
        console.log('\n--- ORIGINAL BNGL START ---\n', b.slice(0, 400));
        console.log('\n--- GENERATED BNGL START ---\n', a.slice(0, 400));

        // Optionally write outputs to tempDir for manual inspection
        // (Not committed)
        try {
          // eslint-disable-next-line node/no-unsupported-features/es-builtins
          import('node:fs').then(fs => {
            fs.writeFileSync(join(tempDir, 'original.bngl'), originalBNGL);
            fs.writeFileSync(join(tempDir, 'generated.bngl'), generatedBNGL);
            console.log('Wrote original/generated BNGL to:', tempDir);
          });
        } catch (e) {}
      }

    } finally {
      // restore
      (globalThis as any).self = originalSelf;
    }
  }
})();
