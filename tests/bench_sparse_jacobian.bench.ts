import { bench, describe } from 'vitest';
import { buildJacobianContributions } from '../packages/engine/src/services/analysis/SparseJacobian.js';

describe('buildJacobianContributions performance', () => {
  // Generate a large number of reactions with many reactants to emphasize the O(N^2) issue
  const numReactions = 1000;
  const numSpecies = 1000;

  const reactions = [];
  for (let i = 0; i < numReactions; i++) {
    // Reaction with 100 reactants to make indexOf noticeable
    const reactants = Array.from({ length: 100 }, (_, idx) => (i + idx) % numSpecies);
    const products = [(i + 1) % numSpecies];
    reactions.push({ reactants, products, rate: 1.0 });
  }

  // Fake sparsity (dense-ish)
  const rowPtr = new Int32Array(numSpecies + 1);
  const colIdxList = [];

  let ptr = 0;
  for (let i = 0; i < numSpecies; i++) {
    rowPtr[i] = ptr;
    for (let j = 0; j < 100; j++) {
      colIdxList.push((i + j) % numSpecies);
      ptr++;
    }
  }
  rowPtr[numSpecies] = ptr;
  const colIdx = new Int32Array(colIdxList);

  const sparsity = {
    nnz: colIdx.length,
    rowPtr,
    colIdx,
    fillRatio: colIdx.length / (numSpecies * numSpecies)
  };

  bench('buildJacobianContributions', () => {
    buildJacobianContributions(reactions, numSpecies, sparsity);
  });
});
