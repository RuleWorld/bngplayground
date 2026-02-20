// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';

const canon = (g: any) => GraphCanonicalizer.canonicalize(g);

describe('Stat factors / degeneracy', () => {
  it('applies stat_factor=2 for repeated identical binding sites (L(r,r)+R(l))', async () => {
    const seedSpecies = [
      BNGLParser.parseSpeciesGraph('L(r,r)'),
      BNGLParser.parseSpeciesGraph('R(l)'),
    ];

    const rule = BNGLParser.parseRxnRule(
      'L(r,r) + R(l) -> L(r!1,r).R(l!1)',
      0.1,
      'bind'
    );

    const generator = new NetworkGenerator({ maxSpecies: 10, maxIterations: 5 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(speciesCanon.has('L(r,r)')).toBe(true);
    expect(speciesCanon.has('R(l)')).toBe(true);
    expect(speciesCanon.has('L(r!1,r).R(l!1)')).toBe(true);

    const rxn = result.reactions.find((r) => r.reactants.length === 2 && r.products.length === 1);
    expect(rxn).toBeDefined();
    expect(rxn?.rate).toBeCloseTo(0.2, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('does not double-count symmetric dimer unbinding (A(x!1).A(x!1) -> A(x)+A(x))', async () => {
    const seedSpecies = [BNGLParser.parseSpeciesGraph('A(x!1).A(x!1)')];

    const rule = BNGLParser.parseRxnRule(
      'A(x!1).A(x!1) -> A(x) + A(x)',
      0.3,
      'unbind'
    );

    const generator = new NetworkGenerator({ maxSpecies: 10, maxIterations: 5 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(speciesCanon.has('A(x!1).A(x!1)')).toBe(true);
    expect(speciesCanon.has('A(x)')).toBe(true);

    const rxn = result.reactions.find((r) => r.reactants.length === 1 && r.products.length === 2);
    expect(rxn).toBeDefined();
    expect(rxn?.rate).toBeCloseTo(0.3, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('simple A(x)+A(x)->A(x!1).A(x!1) homodimer: 0.5 baked into rate, no propensityFactor (BNG2 convention)', async () => {
    // BNG2 convention for bond-forming symmetric A+A:
    //   Exact enumeration gives multiplicity=0.5 → effectiveRate = 0.5*k.
    //   The propensityFactor split does NOT apply (bond-forming rule detected via bond count change).
    //   NET writes "0.5*k" (the 0.5 is factored into the stored rate).
    const seedSpecies = [BNGLParser.parseSpeciesGraph('A(x)')];

    const rule = BNGLParser.parseRxnRule(
      'A(x) + A(x) -> A(x!1).A(x!1)',
      1.23,
      'dimerize'
    );

    const generator = new NetworkGenerator({ maxSpecies: 10, maxIterations: 10 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(speciesCanon.has('A(x)')).toBe(true);
    expect(speciesCanon.has('A(x!1).A(x!1)')).toBe(true);

    const rxn = result.reactions.find((r) => r.reactants.length === 2 && r.products.length === 1);
    expect(rxn).toBeDefined();

    // Bond-forming rule: no propensityFactor split. multiplicity=0.5 → rate=0.5*1.23=0.615.
    // BNG2 writes "0.5*k" in the NET for symmetric bond-forming A+A.
    expect(rxn?.rate).toBeCloseTo(0.615, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('applies stat_factor=4 when both reactants have repeated identical sites (L(r,r)+R(l,l))', async () => {
    const seedSpecies = [
      BNGLParser.parseSpeciesGraph('L(r,r)'),
      BNGLParser.parseSpeciesGraph('R(l,l)'),
    ];

    const rule = BNGLParser.parseRxnRule(
      'L(r,r) + R(l,l) -> L(r!1,r).R(l!1,l)',
      0.1,
      'bind'
    );

    const generator = new NetworkGenerator({ maxSpecies: 10, maxIterations: 10 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(speciesCanon.has('L(r,r)')).toBe(true);
    expect(speciesCanon.has('R(l,l)')).toBe(true);
    expect(speciesCanon.has('L(r!1,r).R(l!1,l)')).toBe(true);

    const rxn = result.reactions.find((r) => r.reactants.length === 2 && r.products.length === 1);
    expect(rxn).toBeDefined();
    expect(rxn?.rate).toBeCloseTo(0.4, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('handles the hard case: identical reactants with repeated identical sites (A(x,x)+A(x,x))', async () => {
    const seedSpecies = [BNGLParser.parseSpeciesGraph('A(x,x)')];

    const rule = BNGLParser.parseRxnRule(
      'A(x,x) + A(x,x) -> A(x!1,x).A(x!1,x)',
      0.1,
      'bind'
    );

    const generator = new NetworkGenerator({ maxSpecies: 10, maxIterations: 10 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(speciesCanon.has('A(x,x)')).toBe(true);
    expect(speciesCanon.has('A(x!1,x).A(x!1,x)')).toBe(true);

    const rxn = result.reactions.find((r) => r.reactants.length === 2 && r.products.length === 1);
    expect(rxn).toBeDefined();

    // Each reactant has 2 equivalent sites => symmetryFactor=4 in numeric rate.
    // The identical-reactants 1/2 factor is kept separately as propensityFactor.
    expect(rxn?.rate).toBeCloseTo(0.4, 12);
    expect(rxn?.propensityFactor).toBe(0.5);
  });

  it('recovers mixed stat_factor when one side enumerates embeddings and the other collapses repeated sites', async () => {
    // Left reactant is a symmetric *connected* A-A complex.
    // Pattern A(t!+,x) can match either A => 2 embeddings enumerated.
    // Right reactant has repeated sites B(y,y). Pattern B(y) collapses to 1 match with degeneracy 2.
    // Expected overall stat_factor = 2 (enumeration) * 2 (degeneracy) = 4.
    const seedSpecies = [
      BNGLParser.parseSpeciesGraph('A(t!1,x).A(t!1,x)'),
      BNGLParser.parseSpeciesGraph('B(y,y)'),
    ];

    const rule = BNGLParser.parseRxnRule(
      'A(t!+,x) + B(y) -> A(t!+,x!1).B(y!1)',
      0.1,
      'bind'
    );

    // Keep expansion small; this model can otherwise grow quickly.
    const generator = new NetworkGenerator({ maxSpecies: 100, maxIterations: 2 });
    const result = await generator.generate(seedSpecies, [rule]);

    // Seed species exist (canonical form may reorder molecules).
    const speciesCanon = new Set(result.species.map((s) => canon(s.graph)));
    expect(Array.from(speciesCanon).some((s) => s.includes('A(t!1,x).A(t!1,x)'))).toBe(true);
    expect(Array.from(speciesCanon).some((s) => s.startsWith('B(') && s.includes('B(y,y)'))).toBe(true);

    // Intermediate exists: 2x A and 1x B with exactly two bonds (A-A + one A-B).
    const countUndirectedBonds = (g: any): number => {
      const seen = new Set<string>();
      for (const [key, partners] of g.adjacency as Map<string, Set<string>>) {
        for (const p of partners) {
          const a = key;
          const b = p;
          const bondKey = a < b ? `${a}-${b}` : `${b}-${a}`;
          seen.add(bondKey);
        }
      }
      return seen.size;
    };

    const hasIntermediate = result.species.some((sp: any) => {
      const g = sp.graph;
      const molNames = g.molecules.map((m: any) => m.name);
      const aCount = molNames.filter((n: string) => n === 'A').length;
      const bCount = molNames.filter((n: string) => n === 'B').length;
      if (aCount !== 2 || bCount !== 1) return false;
      return countUndirectedBonds(g) === 2;
    });
    expect(hasIntermediate).toBe(true);

    // Reaction rate should reflect mixed multiplicity: 2 (enumeration) * 2 (degeneracy) = 4.
    const rxn = result.reactions.find((r) => r.reactants.length === 2 && r.products.length === 1 && Math.abs(r.rate - 0.4) < 1e-10);
    expect(rxn).toBeDefined();
    expect(rxn?.rate).toBeCloseTo(0.4, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('recovers collapsed single-molecule embeddings for n-ary pure state-change rules', async () => {
    const seedSpecies = [
      BNGLParser.parseSpeciesGraph('G(b!1,s~P).G(b!1,s~U)'),
      BNGLParser.parseSpeciesGraph('S(b!1,s~U).S(b!1,s~U)'),
    ];

    const rule = BNGLParser.parseRxnRule(
      'G(s~P) + S(s~U) -> G(s~P) + S(s~P)',
      1.2,
      'phos'
    );

    const generator = new NetworkGenerator({ maxSpecies: 40, maxIterations: 3 });
    const result = await generator.generate(seedSpecies, [rule]);

    const reactantA = canon(BNGLParser.parseSpeciesGraph('G(b!1,s~P).G(b!1,s~U)'));
    const reactantB = canon(BNGLParser.parseSpeciesGraph('S(b!1,s~U).S(b!1,s~U)'));
    const productA = canon(BNGLParser.parseSpeciesGraph('G(b!1,s~P).G(b!1,s~U)'));
    const productB = canon(BNGLParser.parseSpeciesGraph('S(b!1,s~P).S(b!1,s~U)'));

    const speciesByIndex = new Map<number, string>();
    for (const s of result.species as any[]) {
      speciesByIndex.set(Number(s.index), canon(s.graph));
    }

    const targetReactants = [reactantA, reactantB].sort().join(' + ');
    const targetProducts = [productA, productB].sort().join(' + ');

    const rxn = result.reactions.find((r) => {
      const reactants = r.reactants
        .map((idx: number) => speciesByIndex.get(Number(idx)) ?? '')
        .sort()
        .join(' + ');
      const products = r.products
        .map((idx: number) => speciesByIndex.get(Number(idx)) ?? '')
        .sort()
        .join(' + ');
      return reactants === targetReactants && products === targetProducts;
    });

    expect(rxn).toBeDefined();
    expect(rxn?.rate).toBeCloseTo(2.4, 12);
    expect((rxn as any)?.propensityFactor ?? 1).toBe(1);
  });

  it('IRE1-like ternary identical-reactant multiplicity (monomer/dimer cases)', async () => {
    const seedSpecies = [
      BNGLParser.parseSpeciesGraph('Unfolded(b)'),
      BNGLParser.parseSpeciesGraph('IRE1(b,s~U)'),
      BNGLParser.parseSpeciesGraph('IRE1(b!1,s~U).IRE1(b!1,s~U)'),
      BNGLParser.parseSpeciesGraph('IRE1(b!1,s~P).IRE1(b!1,s~U)')
    ];

    const rule = BNGLParser.parseRxnRule(
      'Unfolded(b) + IRE1(s~U) + IRE1(s~U) -> Unfolded(b) + IRE1(b!1,s~P).IRE1(b!1,s~P)',
      1.0,
      '_R3'
    );

    const generator = new NetworkGenerator({ maxSpecies: 50, maxIterations: 5 });
    const result = await generator.generate(seedSpecies, [rule]);

    const speciesByIndex = new Map<number, string>();
    for (const s of result.species as any[]) {
      speciesByIndex.set(Number(s.index), canon(s.graph));
    }

    const findRateFor = (reactantNames: string[]) => {
      const key = reactantNames.map((n) => canon(BNGLParser.parseSpeciesGraph(n))).sort().join(' + ');
      const rx = result.reactions.find((r) => {
        const rs = r.reactants.map((idx: number) => speciesByIndex.get(Number(idx)) ?? '').sort().join(' + ');
        return rs === key;
      });
      return rx ? rx.rate : undefined;
    };

    // monomer + monomer -> multiplicity 1/2 => rate 0.5
    expect(findRateFor(['Unfolded(b)', 'IRE1(b,s~U)', 'IRE1(b,s~U)'])).toBeCloseTo(0.5, 12);

    // monomer + dimer -> multiplicity 1 => rate 1.0
    expect(findRateFor(['Unfolded(b)', 'IRE1(b,s~U)', 'IRE1(b!1,s~U).IRE1(b!1,s~U)'])).toBeCloseTo(1.0, 12);

    // Additional heterodimer / mixed combinations (BNG2 reference cases)
    expect(findRateFor(['Unfolded(b)', 'IRE1(b,s~U)', 'IRE1(b!1,s~P).IRE1(b!1,s~U)'])).toBeCloseTo(1.0, 12); // monomer + heterodimer
    expect(findRateFor(['Unfolded(b)', 'IRE1(b!1,s~P).IRE1(b!1,s~U)', 'IRE1(b!1,s~U).IRE1(b!1,s~U)'])).toBeCloseTo(1.0, 12); // heterodimer + dimer (different species)
    expect(findRateFor(['Unfolded(b)', 'IRE1(b!1,s~P).IRE1(b!1,s~U)', 'IRE1(b!1,s~P).IRE1(b!1,s~U)'])).toBeCloseTo(0.5, 12); // heterodimer + heterodimer (same species)

    // dimer + dimer -> multiplicity 1/2 => rate 0.5
    expect(findRateFor(['Unfolded(b)', 'IRE1(b!1,s~U).IRE1(b!1,s~U)', 'IRE1(b!1,s~U).IRE1(b!1,s~U)'])).toBeCloseTo(0.5, 12);
  });
});

