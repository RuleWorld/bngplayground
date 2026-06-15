import { describe, it, expect } from 'vitest';

describe('EigenSolver', () => {
  it('computes eigenvalues of 2x2 matrix', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // Matrix [[2, 1], [1, 2]] has eigenvalues 3 and 1
    const matrix = new Float64Array([2, 1, 1, 2]);
    const eigs = qrEigenvalues(matrix, 2);
    expect(eigs.length).toBe(2);
    const reals = eigs.map(e => e.real).sort((a, b) => b - a);
    expect(reals[0]).toBeCloseTo(3, 4);
    expect(reals[1]).toBeCloseTo(1, 4);
    eigs.forEach(e => expect(e.imag).toBeCloseTo(0, 6));
  });

  it('detects complex eigenvalues', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // Rotation matrix [[0, -1], [1, 0]] has eigenvalues ±i
    const matrix = new Float64Array([0, -1, 1, 0]);
    const eigs = qrEigenvalues(matrix, 2);
    expect(eigs.length).toBe(2);
    eigs.forEach(e => expect(e.real).toBeCloseTo(0, 4));
    const imags = eigs.map(e => Math.abs(e.imag)).sort();
    expect(imags[0]).toBeCloseTo(1, 4);
    expect(imags[1]).toBeCloseTo(1, 4);
  });

  it('handles 3x3 symmetric matrix', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // [[3, 1, 0], [1, 3, 1], [0, 1, 3]] eigenvalues: 3-sqrt(2), 3, 3+sqrt(2)
    const matrix = new Float64Array([3, 1, 0, 1, 3, 1, 0, 1, 3]);
    const eigs = qrEigenvalues(matrix, 3);
    expect(eigs.length).toBe(3);
    const reals = eigs.map(e => e.real).sort((a, b) => a - b);
    expect(reals[0]).toBeCloseTo(3 - Math.SQRT2, 3);
    expect(reals[1]).toBeCloseTo(3, 3);
    expect(reals[2]).toBeCloseTo(3 + Math.SQRT2, 3);
  });
});

describe('SteadyStateFinder', () => {
  it('finds steady state of linear decay', async () => {
    const { findSteadyState } = await import('../../src/services/analysis/SteadyStateFinder');
    // dy/dt = -k*y, steady state: y = 0
    const result = findSteadyState({
      nSpecies: 1,
      parameters: { k: 1 },
      rhsFn: (y: Float64Array, dydt: Float64Array) => { dydt[0] = -1.0 * y[0]; },
      tolerance: 1e-10,
      maxIterations: 100,
    }, new Float64Array([5.0]));

    expect(result).not.toBeNull();
    if (result) {
      expect(result.y[0]).toBeCloseTo(0, 6);
      expect(result.stable).toBe(true);
    }
  });

  it('finds steady state of production-decay', async () => {
    const { findSteadyState } = await import('../../src/services/analysis/SteadyStateFinder');
    // dy/dt = k_prod - k_deg * y, steady state: y = k_prod / k_deg = 5
    const result = findSteadyState({
      nSpecies: 1,
      parameters: {},
      rhsFn: (y: Float64Array, dydt: Float64Array) => { dydt[0] = 10 - 2 * y[0]; },
      tolerance: 1e-10,
    }, new Float64Array([1.0]));

    expect(result).not.toBeNull();
    if (result) {
      expect(result.y[0]).toBeCloseTo(5, 4);
      expect(result.stable).toBe(true);
    }
  });
});

describe('Continuation', () => {
  it('follows steady-state branch of saddle-node', async () => {
    const { continuation } = await import('../../src/services/analysis/Continuation');
    // dx/dt = r + x^2 (saddle-node normal form, bifurcation at r=0)
    const result = await continuation({
      nSpecies: 1,
      rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
        dydt[0] = p + y[0] * y[0];
      },
      initialState: new Float64Array([1.0]),
      parameterStart: -1,
      parameterEnd: 0.5,
      stepSize: 0.05,
      maxSteps: 50,
    });

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.bifurcations).toBeDefined();
    // Should detect exactly 1 saddle-node bifurcation near p=0
    expect(result.bifurcations.length).toBe(1);
    expect(result.bifurcations[0].type).toBe('saddle-node');
    expect(result.bifurcations[0].parameterValue).toBeCloseTo(0, 1);
  });

  it('filters out zero eigenvalues from conserved moieties in positive feedback', async () => {
    const { continuation } = await import('../../src/services/analysis/Continuation');
    // Positive feedback model has a conserved moiety (A + B = const), yielding a zero eigenvalue.
    // Eigenvalue noise must not trigger false bifurcations.
    const result = await continuation({
      nSpecies: 2,
      rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
        const k1 = 1.0, k2 = 1.0, k3 = p;
        dydt[0] = -k1 * y[0] + k2 * y[1] + k3 * y[0] * y[1];
        dydt[1] = k1 * y[0] - k2 * y[1] - k3 * y[0] * y[1];
      },
      initialState: new Float64Array([0.1, 0.0]),
      parameterStart: 0.1,
      parameterEnd: 2.0,
      stepSize: 0.05,
      maxSteps: 40,
    });

    expect(result.path.length).toBeGreaterThan(0);
    // Should filter out the zero eigenvalues and find exactly 0 bifurcations
    expect(result.bifurcations.length).toBe(0);
  });

  it('filters out zero eigenvalues from conserved moieties in Michaelis-Menten', async () => {
    const { continuation } = await import('../../src/services/analysis/Continuation');
    const result = await continuation({
      nSpecies: 4,
      rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
        const kf = p, kr = 1.0, kcat = 1.0;
        const v1 = kf * y[0] * y[1];
        const v2 = kr * y[2];
        const v3 = kcat * y[2];
        dydt[0] = -v1 + v2 + v3;
        dydt[1] = -v1 + v2;
        dydt[2] = v1 - v2 - v3;
        dydt[3] = v3;
      },
      initialState: new Float64Array([1.0, 10.0, 0.0, 0.0]),
      parameterStart: 0.1,
      parameterEnd: 5.0,
      stepSize: 0.1,
      maxSteps: 50,
    });

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.bifurcations.length).toBe(0);
  });

  it('filters out zero eigenvalues from conserved moieties under extremely high parameter/eigenvalue scaling', async () => {
    const { continuation } = await import('../../src/services/analysis/Continuation');
    // Positive feedback model has a conserved moiety (A + B = const), yielding a zero eigenvalue.
    // Scale parameters by 1e12 to simulate large rate constants / small Na, causing high numerical noise.
    const result = await continuation({
      nSpecies: 2,
      rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
        const scaling = 1e12;
        const k1 = 1.0 * scaling, k2 = 1.0 * scaling, k3 = p * scaling;
        dydt[0] = -k1 * y[0] + k2 * y[1] + k3 * y[0] * y[1];
        dydt[1] = k1 * y[0] - k2 * y[1] - k3 * y[0] * y[1];
      },
      initialState: new Float64Array([0.1, 0.0]),
      parameterStart: 0.1,
      parameterEnd: 2.0,
      stepSize: 0.05,
      maxSteps: 40,
    });

    expect(result.path.length).toBeGreaterThan(0);
    // Should filter out the zero eigenvalues even when noise is scaled up by 1e12, finding exactly 0 bifurcations
    expect(result.bifurcations.length).toBe(0);
  });

  it('filters out false bifurcations in DNA damage repair model', async () => {
    const { parseBNGLStrict } = await import('../../src/parser/BNGLParserWrapper');
    const { generateExpandedNetwork } = await import('../../src/services/simulation/NetworkExpansion');
    const { Rxn } = await import('../../src/services/graph/core/Rxn');
    const { JITCompiler } = await import('../../src/services/analysis/JITCompiler');
    const { continuation } = await import('../../src/services/analysis/Continuation');

    const dnaDamageModel = `
begin model
begin parameters
    k_damage 0.1
    k_sense 1.5
    k_atm_act 10.0
    k_chk2_phos 10.0
    k_repair_rec 100.0
    k_repair_act 10.0
    k_reset 0.05
    k_turnover 0.02
    DNA_intact 100
    MRN_tot 50
    ATM_tot 100
    Chk2_tot 150
    Repair_tot 80
end parameters
begin molecule types
    DNA(state~intact~damaged)
    MRN(state~free~bound)
    ATM(state~inactive~active)
    Chk2(state~unphos~phos)
    Repair(state~inactive~active)
end molecule types
begin seed species
    DNA(state~intact) DNA_intact
    MRN(state~free) MRN_tot
    ATM(state~inactive) ATM_tot
    Chk2(state~unphos) Chk2_tot
    Repair(state~inactive) Repair_tot
end seed species
begin reaction rules
    Damage: DNA(state~intact) -> DNA(state~damaged) k_damage
    Sense: MRN(state~free) + DNA(state~damaged) -> MRN(state~bound) + DNA(state~damaged) k_sense
    ATM_Act: ATM(state~inactive) + MRN(state~bound) -> ATM(state~active) + MRN(state~bound) k_atm_act
    Chk2_Phos: Chk2(state~unphos) + ATM(state~active) -> Chk2(state~phos) + ATM(state~active) k_chk2_phos
    Repair_Rec: Repair(state~inactive) + Chk2(state~phos) -> Repair(state~active) + Chk2(state~phos) k_repair_rec
    Repair_Exec: DNA(state~damaged) + Repair(state~active) -> DNA(state~intact) + Repair(state~active) k_repair_act
    MRN_Reset: MRN(state~bound) -> MRN(state~free) k_reset
    ATM_Reset: ATM(state~active) -> ATM(state~inactive) k_reset
    Chk2_Reset: Chk2(state~phos) -> Chk2(state~unphos) k_reset
    Repair_Reset: Repair(state~active) -> Repair(state~inactive) k_reset
end reaction rules
end model
`;

    const model = parseBNGLStrict(dnaDamageModel);
    const expandedModel = await generateExpandedNetwork(model, () => {}, () => {});
    const nSpecies = expandedModel.species.length;
    const params: Record<string, number> = {
      ...(expandedModel.parameters ?? model.parameters),
    };

    const speciesIndexMap = new Map<string, number>();
    expandedModel.species.forEach((s: any, idx: number) => {
      speciesIndexMap.set(s.name, idx);
    });

    const indexedReactions = (expandedModel.reactions ?? []).map((reaction: any) => new Rxn(
      reaction.reactants.map((name: string) => {
        const idx = speciesIndexMap.get(String(name).trim());
        if (idx === undefined) throw new Error(`Unknown reactant: ${name}`);
        return idx;
      }),
      reaction.products.map((name: string) => {
        const idx = speciesIndexMap.get(String(name).trim());
        if (idx === undefined) throw new Error(`Unknown product: ${name}`);
        return idx;
      }),
      reaction.rateConstant,
      reaction.name,
      {
        degeneracy: reaction.degeneracy,
        propensityFactor: reaction.propensityFactor,
        statFactor: reaction.statFactor,
        rateExpression: reaction.rateExpression ?? reaction.rate,
        productStoichiometries: reaction.productStoichiometries,
        scalingVolume: reaction.scalingVolume,
        totalRate: reaction.totalRate,
      },
    ));

    const jit = new JITCompiler();
    const compiled = jit.compileFromRxns(
      indexedReactions,
      nSpecies,
      speciesIndexMap,
      params,
      {
        modelName: 'dna-damage-repair',
        analysis: 'bifurcation',
        parameterName: 'k_sense',
        callsite: 'test',
      }
    );

    const { detectConservedMoieties, computeConservationConstants, reduceSystem } = await import('../../src/services/analysis/ConservedMoietyDetector');

    const initialState = new Float64Array(nSpecies);
    expandedModel.species.forEach((s: any, i: number) => { initialState[i] = s.initialConcentration; });

    const moieties = detectConservedMoieties(indexedReactions, nSpecies);
    const y0 = Array.from(initialState);
    computeConservationConstants(moieties, y0);
    const reducedInfo = reduceSystem(indexedReactions, nSpecies, y0, moieties);

    // Initial reduced state
    const initialReducedState = new Float64Array(reducedInfo.reducedSize);
    for (let i = 0; i < reducedInfo.reducedSize; i++) {
      initialReducedState[i] = initialState[reducedInfo.independentSpecies[i]];
    }

    const result = await continuation({
      nSpecies: reducedInfo.reducedSize,
      rhsFn: (yReduced: Float64Array, p: number, dydtReduced: Float64Array) => {
        params['k_sense'] = p;
        if (compiled?.updateParameters) {
          compiled.updateParameters(params);
        }
        const fullState = new Float64Array(reducedInfo.reconstruct(Array.from(yReduced)));
        const fullDydt = new Float64Array(nSpecies);
        compiled.evaluate(0, fullState, fullDydt);
        for (let i = 0; i < reducedInfo.reducedSize; i++) {
          dydtReduced[i] = fullDydt[reducedInfo.independentSpecies[i]];
        }
      },
      initialState: initialReducedState,
      parameterStart: 0.001,
      parameterEnd: 10,
      stepSize: 10 / 500,
      maxSteps: 500,
    });

    // Reconstruct full path for assertions (or plotting)
    const fullPath = result.path.map(pt => ({
      ...pt,
      y: new Float64Array(reducedInfo.reconstruct(Array.from(pt.y))),
    }));

    expect(fullPath.length).toBeGreaterThan(0);
    // There shouldn't be any real bifurcations in this steady-state tracking of DNA damage repair
    expect(result.bifurcations.length).toBe(0);
  });
});

describe('Nullclines', () => {
  it('computes Lotka-Volterra nullclines', async () => {
    const { computeNullclines } = await import('../../src/services/analysis/Nullclines');
    // dx/dt = ax - bxy (nullcline: x=0 or y=a/b)
    // dy/dt = -cy + dxy (nullcline: y=0 or x=c/d)
    const a = 1, b = 0.1, c = 1.5, d = 0.075;
    const result = computeNullclines({
      rhsFn: (state: Float64Array) => {
        const out = new Float64Array(2);
        out[0] = a * state[0] - b * state[0] * state[1];
        out[1] = -c * state[1] + d * state[0] * state[1];
        return out;
      },
      xRange: [0, 40],
      yRange: [0, 20],
      nGridX: 50,
      nGridY: 50,
    });

    expect(result.xNullclines.length).toBeGreaterThan(0);
    expect(result.yNullclines.length).toBeGreaterThan(0);
    expect(result.fixedPoints.length).toBeGreaterThanOrEqual(1);
    // The coexistence fixed point should be at x=c/d=20, y=a/b=10
    const coexistence = result.fixedPoints.find(fp => fp.x > 5 && fp.y > 5);
    if (coexistence) {
      expect(coexistence.x).toBeCloseTo(c / d, 0);
      expect(coexistence.y).toBeCloseTo(a / b, 0);
    }
  });
});
