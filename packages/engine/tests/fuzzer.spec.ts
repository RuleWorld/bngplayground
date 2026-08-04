import { describe, it, expect, beforeAll } from 'vitest';
import { SeededRandom, generateModel, testPipeline, initializeNFsimHeadless } from '../../../scripts/testing/bngl_fuzzer';

describe('BNGL Fuzzing Regression Suite', () => {
  beforeAll(async () => {
    await initializeNFsimHeadless();
  });

  it('should successfully run 15 randomly generated valid models through the full pipeline', async () => {
    const rng = new SeededRandom(101); // Unique fixed seed for continuous regression coverage

    for (let i = 1; i <= 15; i++) {
      const { bngl } = generateModel(rng);

      // We expect the entire pipeline (parse -> expand -> ODE -> SSA -> NFsim) to execute without throwing
      await expect(testPipeline(bngl)).resolves.not.toThrow();
    }
  });
});
