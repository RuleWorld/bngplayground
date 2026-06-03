import { bench, describe } from 'vitest';
import { runCPUSSAEnsemble, type GPUSSAConfig, type SSAReaction } from '../src/services/WebGPUSSA';

describe('WebGPUSSA CPUSSAEnsemble Allocation Benchmark', () => {
  const nSpecies = 500;
  const nReactions = 10000;
  const reactions: SSAReaction[] = [];

  for (let i = 0; i < nReactions; i++) {
    reactions.push({
      reactants: [Math.floor(Math.random() * nSpecies), Math.floor(Math.random() * nSpecies)],
      products: [Math.floor(Math.random() * nSpecies), Math.floor(Math.random() * nSpecies), Math.floor(Math.random() * nSpecies)],
      rateConstant: Math.random()
    });
  }

  const config: GPUSSAConfig = {
    nSpecies,
    reactions,
    tEnd: 10,
    nTrajectories: 10,
    nOutputPoints: 10,
    maxStepsPerTrajectory: 100, // keep steps small to focus on setup overhead which contains the map allocations
  };

  bench('runCPUSSAEnsemble (Setup heavy)', () => {
    runCPUSSAEnsemble(config);
  });
});
