// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD, DEFAULT_PERL5LIB, DEFAULT_BNG_BIN } from '../scripts/bngDefaults.js';

const ABS_TOL = 1e-6;
const REL_TOL = 1e-4;
const TIMEOUT_MS = 120_000;

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');
const fixturesDir = resolve(projectRoot, 'tests/fixtures/gdat');
const exampleDir = resolve(projectRoot, 'example-models');

const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;
const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;

const bngAvailable = existsSync(BNG2_PATH);

if (!bngAvailable) {
  console.warn(`Skipping GDAT regression tests: BNG2.pl not found at ${BNG2_PATH}. Set BNG2_PATH to enable.`);
}

const describeFn = bngAvailable ? describe : describe.skip;

function parseGdat(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`Empty GDAT file: ${filePath}`);
  }

  const headerIndex = lines.findIndex((line) => line.startsWith('#'));
  if (headerIndex === -1) {
    throw new Error(`Missing header line in GDAT file: ${filePath}`);
  }

  const headerLine = lines[headerIndex].slice(1).trim();
  const headers = headerLine.split(/\s+/);

  const dataLines = lines.slice(headerIndex + 1);
  if (dataLines.length === 0) {
    throw new Error(`No data rows in GDAT file: ${filePath}`);
  }

  const rows = dataLines.map((line, rowIdx) => {
    const parts = line.split(/\s+/);
    if (parts.length !== headers.length) {
      throw new Error(`Row ${rowIdx} in ${filePath} has ${parts.length} columns, expected ${headers.length}.`);
    }
    return parts.map((value, colIdx) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Value "${value}" in ${filePath} at row ${rowIdx}, column ${headers[colIdx]} is not numeric.`);
      }
      return parsed;
    });
  });

  return { headers, rows };
}

function runBioNetGen(bnglPath: string) {
  const tempDir = mkdtempSync(join(tmpdir(), 'bng-gdat-'));
  const modelName = basename(bnglPath);
  const modelCopy = join(tempDir, modelName);
  copyFileSync(bnglPath, modelCopy);

  // Create bin directory and copy run_network executable
  const binDir = join(tempDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const runNetworkSource = join(DEFAULT_BNG_BIN, 'run_network.exe');
  const runNetworkDest = join(binDir, 'run_network.exe');
  if (existsSync(runNetworkSource)) {
    copyFileSync(runNetworkSource, runNetworkDest);
  }

  const perl5lib = process.env.PERL5LIB || DEFAULT_PERL5LIB;
  const result = spawnSync(PERL_CMD, ['-I', perl5lib, BNG2_PATH, modelName], {
    cwd: tempDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: `${DEFAULT_BNG_BIN};${process.env.PATH}`
    }
  });

  if (result.status !== 0) {
    const errorOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`BioNetGen failed for ${modelName}: ${errorOutput || 'unknown error'}`);
  }

  const outputs = readdirSync(tempDir).filter((file) => file.toLowerCase().endsWith('.gdat'));
  if (outputs.length === 0) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`No GDAT output produced for ${modelName}.`);
  }

  const outputPath = join(tempDir, outputs[0]);
  const parsed = parseGdat(outputPath);

  rmSync(tempDir, { recursive: true, force: true });
  return parsed;
}

function assertWithinTolerance(expected: number, actual: number, label: string) {
  const diff = Math.abs(expected - actual);
  const tolerance = ABS_TOL + REL_TOL * Math.max(Math.abs(expected), Math.abs(actual));
  expect(diff, `${label} differs by ${diff}, exceeds tolerance ${tolerance}`).toBeLessThanOrEqual(tolerance);
}

const fixtureFiles = existsSync(fixturesDir)
  ? readdirSync(fixturesDir).filter((file) => file.toLowerCase().endsWith('.gdat')).sort()
  : [];

describeFn('BioNetGen GDAT regression', () => {
  if (fixtureFiles.length === 0) {
    it.skip('No GDAT fixtures available', () => {});
    return;
  }

  fixtureFiles.forEach((fixtureName) => {
    const baseName = fixtureName.replace(/\.gdat$/i, '');
    const fixturePath = join(fixturesDir, fixtureName);
    const bnglPath = join(exampleDir, `${baseName}.bngl`);

    it(`matches fixture for ${baseName}`, () => {
      if (!existsSync(bnglPath)) {
        throw new Error(`Missing BNGL source for fixture ${fixtureName} at ${bnglPath}`);
      }

      const expected = parseGdat(fixturePath);
      const actual = runBioNetGen(bnglPath);

      expect(actual.headers).toEqual(expected.headers);
      expect(actual.rows.length).toBe(expected.rows.length);

      for (let row = 0; row < expected.rows.length; row += 1) {
        const expectedRow = expected.rows[row];
        const actualRow = actual.rows[row];
        expect(actualRow.length).toBe(expectedRow.length);

        for (let col = 0; col < expectedRow.length; col += 1) {
          const label = `${baseName} row ${row} col ${expected.headers[col]}`;
          assertWithinTolerance(expectedRow[col], actualRow[col], label);
        }
      }
    }, TIMEOUT_MS);
  });
});

