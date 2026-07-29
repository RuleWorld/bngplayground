import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLStrict, generateExpandedNetwork } from '@bngplayground/engine';

describe('Fuzzer Regression Tests', () => {
  const fuzzerDir = path.join(process.cwd(), 'tests/fixtures/fuzzer');

  for (let i = 1; i <= 50; i++) {
    const fileName = `model_${i}.bngl`;
    const filePath = path.join(fuzzerDir, fileName);

    it(`should successfully parse and expand ${fileName}`, async () => {
      const exists = fs.existsSync(filePath);
      expect(exists).toBe(true);

      const code = fs.readFileSync(filePath, 'utf8');
      const model = parseBNGLStrict(code);
      expect(model).toBeDefined();
      expect(model.moleculeTypes.length).toBeGreaterThan(0);

      const expanded = await generateExpandedNetwork(model, () => {}, () => {});
      expect(expanded).toBeDefined();
      expect(expanded.species.length).toBeGreaterThan(0);
      expect(expanded.reactions.length).toBeGreaterThan(0);
    });
  }
});
