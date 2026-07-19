import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveBNG2Paths, resolveBNGValidateDir } from '../../tools/bng2-paths';

const bng2Paths = resolveBNG2Paths();
const DEFAULT_BNG2_PATH = bng2Paths.bng2pl ?? '';
const DEFAULT_PERL5LIB = bng2Paths.perl5lib ?? '';
const DEFAULT_PERL_CMD = process.env.PERL_CMD ?? 'perl';

describe('BNG SBML -> BNGL converter (fallback)', () => {
  it('converts simple_system SBML produced by BNG2.pl into BNGL text', { timeout: 120000 }, async () => {
    const temp = mkdtempSync(join(tmpdir(), 'bng-verify-'));
    const validateDir = resolveBNGValidateDir();
    if (!validateDir) {
      console.warn('Validate directory not available, skipping test');
      return;
    }
    const model = join(validateDir, 'simple_system.bngl');
    // Copy model into temp and run BNG2.pl from there
    copyFileSync(model, join(temp, basename(model)));

    // run BNG2 - use inline call with env to ensure PERL5LIB is set
    const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, basename(model), '--outdir', temp], {
      cwd: temp,
      encoding: 'utf-8',
      timeout: 120000,
      env: { ...process.env, PERL5LIB: process.env.PERL5LIB ?? DEFAULT_PERL5LIB },
    });

    if (result.status !== 0) {
      // Skip test if BNG2 is not available
      console.warn('BNG2.pl not available, skipping test');
      return;
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
