import { describe, it, expect } from 'vitest';
import { simulate } from '../src/services/simulation/SimulationLoop';
import { setFeatureFlags } from '../src/featureFlags';

describe('Conservation Law Reduction Parity', () => {
    // Michaelis-Menten system: E + S <-> ES -> E + P
    // Laws: E + ES = Etot, S + ES + P = Stot
    const mmModel: any = {
        name: 'Michaelis-Menten',
        species: [
            { name: 'E', initialConcentration: 10 },
            { name: 'S', initialConcentration: 100 },
            { name: 'ES', initialConcentration: 0 },
            { name: 'P', initialConcentration: 0 },
        ],
        reactions: [
            { reactants: ['E', 'S'], products: ['ES'], rateConstant: 0.1, rate: '0.1' }, // kf
            { reactants: ['ES'], products: ['E', 'S'], rateConstant: 1.0, rate: '1.0' }, // kr
            { reactants: ['ES'], products: ['E', 'P'], rateConstant: 0.5, rate: '0.5' }, // kcat
        ],
        observables: [
            { name: 'Free_E', type: 'Molecules', pattern: 'E' },
            { name: 'Free_S', type: 'Molecules', pattern: 'S' },
            { name: 'Complex', type: 'Molecules', pattern: 'ES' },
            { name: 'Product', type: 'Molecules', pattern: 'P' },
            { name: 'Total_E', type: 'Molecules', pattern: 'E, ES' },
        ],
        parameters: {},
        functions: [],
    };

    const options = {
        method: 'ode',
        t_end: 10,
        n_steps: 100,
        atol: 1e-10,
        rtol: 1e-10,
        solver: 'cvode',
    };

    const callbacks = {
        checkCancelled: () => { },
        postMessage: () => { },
    };

    it('should produce identical results with and without reduction', async () => {
        // 1. Run Baseline (no reduction)
        setFeatureFlags({ conservationLawReduction: false });
        const baselineResults = await simulate(0, mmModel, options as any, callbacks);

        // 2. Run with Reduction
        setFeatureFlags({ conservationLawReduction: true });
        const reducedResults = await simulate(0, mmModel, options as any, callbacks);

        // 3. Compare trajectories
        expect(baselineResults.data.length).toBe(reducedResults.data.length);

        for (let i = 0; i < baselineResults.data.length; i++) {
            const b = baselineResults.data[i];
            const r = reducedResults.data[i];

            expect(r.time).toBeCloseTo(b.time, 8);
            expect(r.Free_E).toBeCloseTo(b.Free_E, 6);
            expect(r.Free_S).toBeCloseTo(b.Free_S, 6);
            expect(r.Complex).toBeCloseTo(b.Complex, 6);
            expect(r.Product).toBeCloseTo(b.Product, 6);
            // Total E should be exactly conserved
            expect(r.Total_E).toBeCloseTo(10, 8);
        }
    });

  it('should work with Michaelis-Menten functional rates', async () => {
    // Model with MM macro: ES -> E + P with MM(kcat, Km)
    // Actually simpler: just one reaction with a functional expression
    const funcModel: any = {
        name: 'MM-Functional',
        species: [
          { name: 'E', initialConcentration: 10 },
          { name: 'S', initialConcentration: 100 },
          { name: 'P', initialConcentration: 0 },
        ],
        reactions: [
          { reactants: ['E', 'S'], products: ['E', 'P'], rateConstant: 0, rate: 'Sat(1.0, 50.0)', isFunctionalRate: true },
        ],
        observables: [
          { name: 'Enzyme', type: 'Molecules', pattern: 'E' },
          { name: 'Substrate', type: 'Molecules', pattern: 'S' },
          { name: 'Product', type: 'Molecules', pattern: 'P' },
        ],
        parameters: {},
        functions: [],
      };

      const options = {
        method: 'ode',
        t_end: 20,
        n_steps: 100,
        atol: 1e-10,
        rtol: 1e-10,
        solver: 'cvode',
      };

      // 1. Baseline
      setFeatureFlags({ conservationLawReduction: false });
      const baseline = await simulate(0, funcModel, options as any, callbacks);

      // 2. Reduced
      setFeatureFlags({ conservationLawReduction: true });
      const reduced = await simulate(0, funcModel, options as any, callbacks);

      // 3. Compare
      for (let i = 0; i < baseline.data.length; i++) {
          const b = baseline.data[i];
          const r = reduced.data[i];
          expect(r.Product).toBeCloseTo(b.Product, 5);
      }
  });
});
