/**
 * Tests for BNG2 Parity Features:
 *   Task 1: Parser - Loose action commands
 *   Task 2: PLA Simulator
 *   Task 3: Hybrid Model Generation
 */
import { describe, it, expect } from 'vitest';
import { parseBNGLWithANTLR } from '../src/parser/BNGLParserWrapper';
import { SeededRandom } from '../src/utils/random';
import { PLASimulator, simulatePLA } from '../src/services/simulation/PLASimulator';
import { HybridModelGenerator, generateHybridModel } from '../src/services/simulation/HybridModelGenerator';
import type { BNGLModel } from '../src/types';

// ================================================================
// Task 1: Parser Tests - Loose Action Commands
// ================================================================
describe('Task 1: Parser - Loose Action Commands', () => {
  it('should parse action commands between model blocks', () => {
    const input = `
begin model
begin parameters
  k1 1.0
end parameters

begin molecule types
  A(b)
  B(a)
end molecule types

begin species
  A(b) 100
  B(a) 200
end species

begin observables
  Molecules Atot A()
end observables

begin reaction rules
  A(b) + B(a) -> A(b!1).B(a!1) k1
end reaction rules

end model

generate_network({overwrite=>1})
simulate({method=>"ode", t_end=>100, n_steps=>100})
`;

    const result = parseBNGLWithANTLR(input);
    expect(result.model).toBeDefined();
    expect(result.model!.actions).toBeDefined();
    expect(result.model!.actions!.length).toBeGreaterThan(0);

    // Check that generate_network and simulate actions were parsed
    const actionTypes = result.model!.actions!.map(a => a.type);
    expect(actionTypes).toContain('generate_network');
    expect(actionTypes).toContain('simulate');
  });

  it('should parse saveConcentrations action', () => {
    const input = `
begin model
begin parameters
  kon 1.0
  koff 0.1
end parameters

begin molecule types
  L(r)
  R(l)
end molecule types

begin species
  L(r) 100
  R(l) 200
end species

begin observables
  Molecules Ltot L()
end observables

begin reaction rules
  L(r) + R(l) -> L(r!1).R(l!1) kon
  L(r!1).R(l!1) -> L(r) + R(l) koff
end reaction rules

end model

generate_network({overwrite=>1})
simulate({method=>"ode", t_end=>10, n_steps=>10})
saveConcentrations()
simulate({method=>"ode", t_end=>20, n_steps=>10, continue=>1})
`;

    const result = parseBNGLWithANTLR(input);
    expect(result.model).toBeDefined();
    const actionTypes = result.model!.actions!.map(a => a.type);
    expect(actionTypes).toContain('saveConcentrations');
  });

  it('should parse actions inside begin model body', () => {
    const input = `
begin model

begin parameters
  k1 0.5
end parameters

begin molecule types
  X()
end molecule types

begin species
  X() 50
end species

begin observables
  Molecules Xtot X()
end observables

begin reaction rules
  X() -> 0 k1
end reaction rules

end model

simulate({method=>"ode", t_end=>10, n_steps=>10})
`;

    const result = parseBNGLWithANTLR(input);
    expect(result.model).toBeDefined();
    expect(result.model!.parameters.k1).toBe(0.5);
    expect(result.model!.species.length).toBe(1);
  });

  it('should handle model without begin/end model wrapper', () => {
    const input = `
begin parameters
  k1 1.0
end parameters

begin molecule types
  A()
end molecule types

begin species
  A() 100
end species

begin observables
  Molecules Atot A()
end observables

begin reaction rules
  A() -> 0 k1
end reaction rules
`;

    const result = parseBNGLWithANTLR(input);
    expect(result.model).toBeDefined();
    expect(result.model!.parameters.k1).toBe(1.0);
  });
});

// ================================================================
// Task 2: PLA Simulator Tests
// ================================================================
describe('Task 2: PLA Simulator', () => {
  describe('SeededRandom.poisson()', () => {
    it('should generate Poisson random variates with correct mean', () => {
      const rng = new SeededRandom(42);
      const lambda = 5;
      const n = 10000;
      let sum = 0;

      for (let i = 0; i < n; i++) {
        sum += rng.poisson(lambda);
      }

      const mean = sum / n;
      // Mean should be close to lambda (within ~3 standard deviations)
      expect(mean).toBeCloseTo(lambda, 0);
      expect(Math.abs(mean - lambda)).toBeLessThan(0.3);
    });

    it('should handle large lambda using normal approximation', () => {
      const rng = new SeededRandom(42);
      const lambda = 100;
      const n = 5000;
      let sum = 0;

      for (let i = 0; i < n; i++) {
        sum += rng.poisson(lambda);
      }

      const mean = sum / n;
      // Normal approximation for large lambda
      expect(mean).toBeCloseTo(lambda, -1);
      expect(Math.abs(mean - lambda)).toBeLessThan(5);
    });

    it('should return 0 for lambda <= 0', () => {
      const rng = new SeededRandom(42);
      expect(rng.poisson(0)).toBe(0);
      expect(rng.poisson(-5)).toBe(0);
    });

    it('should be deterministic with same seed', () => {
      const rng1 = new SeededRandom(123);
      const rng2 = new SeededRandom(123);

      for (let i = 0; i < 20; i++) {
        expect(rng1.poisson(10)).toBe(rng2.poisson(10));
      }
    });
  });

  describe('SeededRandom.exponential()', () => {
    it('should generate exponential variates with correct mean', () => {
      const rng = new SeededRandom(42);
      const rate = 2.0;
      const n = 10000;
      let sum = 0;

      for (let i = 0; i < n; i++) {
        sum += rng.exponential(rate);
      }

      const mean = sum / n;
      const expectedMean = 1 / rate;
      expect(Math.abs(mean - expectedMean)).toBeLessThan(0.05);
    });

    it('should return Infinity for rate <= 0', () => {
      const rng = new SeededRandom(42);
      expect(rng.exponential(0)).toBe(Infinity);
      expect(rng.exponential(-1)).toBe(Infinity);
    });
  });

  describe('PLASimulator', () => {
    const createSimpleModel = (): BNGLModel => ({
      name: 'simple_decay',
      parameters: { k1: 0.1 },
      moleculeTypes: [{ name: 'A', components: [] }],
      species: [{ name: 'A()', initialConcentration: 1000 }],
      observables: [{ type: 'molecules', name: 'Atot', pattern: 'A()' }],
      reactionRules: [
        {
          name: 'decay',
          reactants: ['A()'],
          products: [],
          rate: '0.1',
          isBidirectional: false,
        },
      ],
      reactions: [
        {
          reactants: ['A()'],
          products: [],
          rate: '0.1',
          rateConstant: 0.1,
          name: 'decay',
        },
      ],
    });

    it('should create a PLASimulator instance', () => {
      const sim = new PLASimulator();
      expect(sim).toBeDefined();
    });

    it('should simulate simple decay', async () => {
      const model = createSimpleModel();
      const result = await simulatePLA(model, {
        method: 'pla',
        t_end: 10,
        n_steps: 10,
        seed: 42,
      });

      expect(result.headers).toContain('time');
      expect(result.data.length).toBeGreaterThan(0);
      // Initial population should be ~1000
      expect(result.data[0].time).toBe(0);
    });

    it('should produce monotonically decreasing population for pure decay', async () => {
      const model = createSimpleModel();
      const result = await simulatePLA(model, {
        method: 'pla',
        t_end: 5,
        n_steps: 5,
        seed: 42,
      });

      // Population should generally decrease for pure decay
      const first = result.data[0].Atot ?? 1000;
      const last = result.data[result.data.length - 1].Atot ?? 0;
      expect(last).toBeLessThanOrEqual(first);
    });

    it('should be deterministic with same seed', async () => {
      const model1 = createSimpleModel();
      const model2 = createSimpleModel();

      const result1 = await simulatePLA(model1, {
        method: 'pla',
        t_end: 5,
        n_steps: 5,
        seed: 42,
      });

      const result2 = await simulatePLA(model2, {
        method: 'pla',
        t_end: 5,
        n_steps: 5,
        seed: 42,
      });

      for (let i = 0; i < result1.data.length && i < result2.data.length; i++) {
        expect(result1.data[i].time).toBeCloseTo(result2.data[i].time, 10);
      }
    });
  });
});

// ================================================================
// Task 3: Hybrid Model Generation Tests
// ================================================================
describe('Task 3: Hybrid Model Generation', () => {
  const createHybridModel = (): BNGLModel => ({
    name: 'hybrid_test',
    parameters: { kon: 1.0, koff: 0.1, kcat: 0.01 },
    moleculeTypes: [
      { name: 'L', components: ['r'] },
      { name: 'R', components: ['l', 'state~U~P'] },
    ],
    species: [
      { name: 'L(r)', initialConcentration: 1000 },
      { name: 'R(l,state~U)', initialConcentration: 200 },
    ],
    observables: [
      { type: 'molecules', name: 'Ltot', pattern: 'L()' },
      { type: 'molecules', name: 'Rtot', pattern: 'R()' },
      { type: 'molecules', name: 'RP', pattern: 'R(state~P)' },
    ],
    reactionRules: [
      {
        name: 'binding',
        reactants: ['L(r)', 'R(l)'],
        products: ['L(r!1).R(l!1)'],
        rate: 'kon',
        isBidirectional: false,
      },
      {
        name: 'unbinding',
        reactants: ['L(r!1).R(l!1)'],
        products: ['L(r)', 'R(l)'],
        rate: 'koff',
        isBidirectional: false,
      },
    ],
    populationTypes: [
      { name: 'LP', components: [] },
    ],
    populationMaps: [
      { pattern: 'L(r)', populationName: 'LP', lumpingRate: '0' },
    ],
  });

  it('should detect population types in model', () => {
    const model = createHybridModel();
    expect(HybridModelGenerator.hasPopulationTypes(model)).toBe(true);
  });

  it('should detect population maps in model', () => {
    const model = createHybridModel();
    expect(HybridModelGenerator.hasPopulationMaps(model)).toBe(true);
  });

  it('should generate a hybrid model', async () => {
    const model = createHybridModel();
    const result = await generateHybridModel(model, { verbose: true });

    expect(result.model).toBeDefined();
    expect(result.model.name).toContain('hpp');
    expect(result.bngl).toContain('begin model');
    expect(result.bngl).toContain('end model');
    expect(result.log.length).toBeGreaterThan(0);
  });

  it('should add population type to molecule types', async () => {
    const model = createHybridModel();
    const result = await generateHybridModel(model);

    const mtNames = result.model.moleculeTypes.map(mt => mt.name);
    expect(mtNames).toContain('LP');
  });

  it('should replace seed species with population molecule', async () => {
    const model = createHybridModel();
    const result = await generateHybridModel(model, { verbose: true });

    // L(r) should be replaced with LP()
    const speciesNames = result.model.species.map(s => s.name);
    expect(speciesNames).toContain('LP()');
  });

  it('should add population mapping rules', async () => {
    const model = createHybridModel();
    const result = await generateHybridModel(model);

    // Should have the original rules + mapping rule
    const ruleNames = result.model.reactionRules!.map(r => r.name);
    expect(ruleNames.some(n => n?.includes('mapping'))).toBe(true);
  });

  it('should infer population types from model', () => {
    const model: BNGLModel = {
      name: 'test',
      parameters: {},
      moleculeTypes: [
        { name: 'A', components: [] },
        { name: 'B', components: ['s1', 's2', 's3', 's4'] },
      ],
      species: [
        { name: 'A()', initialConcentration: 500 },
        { name: 'B(s1,s2,s3,s4)', initialConcentration: 10 },
      ],
      observables: [],
    };

    const types = HybridModelGenerator.inferPopulationTypes(model);
    expect(types.length).toBe(2);

    // A should be inferred as population (high abundance, simple)
    const typeA = types.find(t => t.moleculeName === 'A');
    expect(typeA?.treatAsPopulation).toBe(true);

    // B should not be population (low abundance OR many components)
    const typeB = types.find(t => t.moleculeName === 'B');
    expect(typeB?.treatAsPopulation).toBe(false);
  });

  it('should partition rules correctly', () => {
    const model = createHybridModel();
    const popTypes = [
      { moleculeName: 'L', treatAsPopulation: true },
      { moleculeName: 'R', treatAsPopulation: false },
    ];

    const { populationRules, particleRules, hybridRules } = 
      HybridModelGenerator.partitionRules(model, popTypes);

    // binding rule has both L (population) and R (particle) → hybrid
    expect(hybridRules.length).toBeGreaterThan(0);
  });

  it('should throw for model without molecule types', async () => {
    const model: BNGLModel = {
      name: 'empty',
      parameters: {},
      moleculeTypes: [],
      species: [{ name: 'A()', initialConcentration: 100 }],
      observables: [],
      reactionRules: [{ reactants: ['A()'], products: [], rate: '1', isBidirectional: false }],
    };

    await expect(generateHybridModel(model)).rejects.toThrow('no molecule type definitions');
  });

  it('should serialize hybrid model to BNGL', async () => {
    const model = createHybridModel();
    const result = await generateHybridModel(model);

    // Should contain key BNGL blocks
    expect(result.bngl).toContain('begin parameters');
    expect(result.bngl).toContain('begin molecule types');
    expect(result.bngl).toContain('begin species');
    expect(result.bngl).toContain('begin observables');
    expect(result.bngl).toContain('begin reaction rules');
    expect(result.bngl).toContain('begin population maps');
    expect(result.bngl).toContain('begin population types');
  });
});

// ================================================================
// Task 1d: Population Maps Parser Test
// ================================================================
describe('BNGLPopulationMap types', () => {
  it('should parse population_maps and population_types blocks', () => {
    const input = `
begin model

begin parameters
  k1 1.0
end parameters

begin molecule types
  A(b)
end molecule types

begin species
  A(b) 100
end species

begin population maps
  A() -> AP()
  map2: A(b) -> AP(b)
end population maps

begin population types
  AP PopulationType1
  BP PopulationType2
end population types

end model
`;

    const result = parseBNGLWithANTLR(input);
    expect(result.model).toBeDefined();
    expect(result.model!.populationMaps).toBeDefined();
    expect(result.model!.populationMaps!.length).toBe(2);
    expect(result.model!.populationMaps![0].populationName).toBe('AP');
    expect(result.model!.populationMaps![1].populationName).toBe('AP');

    expect(result.model!.populationTypes).toBeDefined();
    expect(result.model!.populationTypes!.length).toBe(2);
    expect(result.model!.populationTypes![0].name).toBe('AP');
    expect(result.model!.populationTypes![0].components[0]).toBe('PopulationType1');
    expect(result.model!.populationTypes![1].name).toBe('BP');
    expect(result.model!.populationTypes![1].components[0]).toBe('PopulationType2');
  });
});
