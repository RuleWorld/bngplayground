import { describe, it, expect } from 'vitest';
import { buildJacobianFunction, JacobianReaction } from '../packages/engine/src/services/simulation/AnalyticalJacobian.js';

describe('AnalyticalJacobian Performance', () => {
  it('measures Jacobian execution time', () => {
    const N = 1000;
    const reactions: JacobianReaction[] = [];

    // Create some functional reactions to trigger the FD fallback path
    for (let i = 0; i < 50; i++) {
        reactions.push({
            reactants: [i],
            products: [(i + 1) % N],
            rateConstant: 1.0,
            isFunctionalRate: true
        });
    }

    // Create mass action reactions
    for (let i = 0; i < 200; i++) {
        reactions.push({
            reactants: [i, (i + 1) % N],
            products: [(i + 2) % N],
            rateConstant: 0.1,
            isFunctionalRate: false
        });
    }

    const rhsFunction = (y: Float64Array, dydt: Float64Array) => {
        dydt.fill(0);
        for(let i=0; i<N; i++) dydt[i] = y[i] * 0.1;
    };

    const jacobian = buildJacobianFunction(reactions, N, rhsFunction);

    const y = new Float64Array(N);
    y.fill(1.0);
    const J = new Float64Array(N * N);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      jacobian(y, J);
    }
    const end = performance.now();

    console.log(`Time taken: ${(end - start).toFixed(2)} ms`);
    expect(end - start).toBeGreaterThan(0);
  });
});
