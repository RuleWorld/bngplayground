import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../../scripts/bngDefaults.js';

function runBNG2(modelPath: string, outdir: string): boolean {
  const modelName = basename(modelPath);
  const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, modelName, '--outdir', outdir], {
    cwd: outdir,
    encoding: 'utf-8',
    timeout: 120000,
  });
  return result.status === 0 && true;
}

describe('BNG SBML -> BNGL converter (fallback)', () => {
  it('converts simple_system SBML produced by BNG2.pl into BNGL text', { timeout: 120000 }, async () => {
    const temp = mkdtempSync(join(tmpdir(), 'bng-verify-'));
    const model = 'bionetgen/bng2/Validate/simple_system.bngl';
    // Copy model into temp and run BNG2.pl from there
    const { copyFileSync } = require('node:fs');
    copyFileSync(model, join(temp, basename(model)));

    // run BNG2
    const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, basename(model), '--outdir', temp], {
      cwd: temp,
      encoding: 'utf-8',
      timeout: 120000,
    });

    if (result.status !== 0) {
      // If BNG2 failed, fail test early with details
      console.warn('BNG2.pl stdout:', result.stdout);
      console.warn('BNG2.pl stderr:', result.stderr);
      throw new Error('BNG2.pl failed to produce SBML during test');
    }

    const xmlPath = join(temp, 'simple_system.xml');
    const xml = readFileSync(xmlPath, 'utf8');

    const mod = await import('../../src/lib/atomizer/parser/bngXmlParser');
    const bngl = mod.convertBNGXmlToBNGL(xml);

    expect(bngl).toContain('begin molecule types');
    expect(bngl).toContain('begin parameters');
    expect(bngl).toContain('begin seed species');
    expect(bngl).toContain('begin reaction rules');
    expect(bngl).toContain('kon 10');
    expect(bngl).toContain('X(y,p~0)');
    expect(bngl).toContain('X(y,p~0) + Y(x) -> X(y!1,p~0).Y(x!1)');
  });
});
