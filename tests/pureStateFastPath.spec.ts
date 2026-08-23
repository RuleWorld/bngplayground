import { describe, expect, it, vi } from 'vitest';
import {
  BNGLParser,
  GraphCanonicalizer,
  NetworkGenerator,
} from '@bngplayground/engine';

interface TestableGenerator {
  buildProductGraph: (...args: unknown[]) => unknown;
  getPureStateChangePlan: (...args: unknown[]) => unknown;
  tryApplyPureStateChangePlan: (...args: unknown[]) => unknown;
}

interface RunOptions {
  forceSlow?: boolean;
  configureRule?: (rule: ReturnType<typeof BNGLParser.parseRxnRule>) => void;
}

async function runGeneration(seedText: string, ruleText: string, options: RunOptions = {}) {
  const seed = BNGLParser.parseSpeciesGraph(seedText);
  const rule = BNGLParser.parseRxnRule(ruleText, 0.25, 'state_rule');
  options.configureRule?.(rule);

  const generator = new NetworkGenerator({
    maxSpecies: 100,
    maxReactions: 100,
    maxIterations: 20,
  });
  const testable = generator as unknown as TestableGenerator;
  const buildProductSpy = vi.spyOn(testable, 'buildProductGraph');
  if (options.forceSlow) {
    vi.spyOn(testable, 'getPureStateChangePlan').mockReturnValue(null);
  }

  const result = await generator.generate([seed], [rule]);
  return { result, rule, buildProductSpy };
}

function networkDigest(result: Awaited<ReturnType<NetworkGenerator['generate']>>) {
  const canonicalByIndex = result.species.map((species) =>
    GraphCanonicalizer.canonicalize(species.graph)
  );
  return {
    species: [...canonicalByIndex].sort(),
    reactions: result.reactions.map((reaction) => ({
      reactants: reaction.reactants.map((index) => canonicalByIndex[index]),
      products: reaction.products.map((index) => canonicalByIndex[index]),
      rate: reaction.rate,
      rateExpression: reaction.rateExpression,
      degeneracy: reaction.degeneracy,
      statFactor: reaction.statFactor,
      propensityFactor: reaction.propensityFactor,
    })),
  };
}

describe('NetworkGenerator pure-state fast path', () => {
  it('matches the general transformation path for a completed multisite state rule', async () => {
    const seed = 'A(s0~U,s1~U,s2~U)';
    const rule = 'A(s0~U,s1~U,s2~U) -> A(s0~P,s1~U,s2~U)';

    const fast = await runGeneration(seed, rule);
    const slow = await runGeneration(seed, rule, { forceSlow: true });

    // Parser operation arrays are intentionally empty; eligibility comes from
    // the completed reactant/product graphs instead.
    expect(fast.rule.changeStates).toEqual([]);
    expect(fast.rule.addBonds).toEqual([]);
    expect(fast.rule.deleteBonds).toEqual([]);
    expect(fast.buildProductSpy).not.toHaveBeenCalled();
    expect(slow.buildProductSpy).toHaveBeenCalled();
    expect(networkDigest(fast.result)).toEqual(networkDigest(slow.result));
    expect(fast.result.species).toHaveLength(2);
    expect(fast.result.reactions).toHaveLength(1);
    expect(fast.result.reactions[0].rate).toBeCloseTo(0.25, 12);
  });

  it('preserves a connected bystander, its bond, and source metadata', async () => {
    const seed = 'A(s~U,b!1).B(a!1)';
    const rule = 'A(s~U,b!+) -> A(s~P,b!+)';

    const fast = await runGeneration(seed, rule);
    const slow = await runGeneration(seed, rule, { forceSlow: true });

    expect(fast.buildProductSpy).not.toHaveBeenCalled();
    expect(networkDigest(fast.result)).toEqual(networkDigest(slow.result));

    const productSpecies = fast.result.species.find((species) =>
      species.graph.molecules.some((molecule) =>
        molecule.components.some((component) => component.state === 'P')
      )
    );
    expect(productSpecies).toBeDefined();
    expect(productSpecies?.graph.molecules).toHaveLength(2);
    expect(productSpecies?.graph.bondCount).toBe(1);
    expect(productSpecies?.graph.molecules.map((molecule) => molecule._sourceKey)).toEqual([
      '0:0',
      '0:1',
    ]);
  });

  it.each([
    {
      name: 'the changed component carries a hidden target bond',
      seed: 'A(s~U!1).B(x!1)',
      rule: 'A(s~U) -> A(s~P)',
    },
    {
      name: 'an unchanged plain component carries a hidden target bond',
      seed: 'A(s~U,b!1).B(x!1)',
      rule: 'A(s~U,b) -> A(s~P,b)',
    },
  ])('declines a shortcut match when $name', ({ seed, rule: ruleText }) => {
    const target = BNGLParser.parseSpeciesGraph(seed);
    const rule = BNGLParser.parseRxnRule(ruleText, 0.25, 'state_rule');
    const generator = new NetworkGenerator();
    const testable = generator as unknown as TestableGenerator;
    const plan = testable.getPureStateChangePlan(rule);
    const componentMap = new Map<string, string>();
    for (let componentIndex = 0; componentIndex < rule.reactants[0].molecules[0].components.length; componentIndex++) {
      componentMap.set(`0.${componentIndex}`, `0.${componentIndex}`);
    }

    expect(plan).not.toBeNull();
    expect(testable.tryApplyPureStateChangePlan(
      plan,
      rule.reactants,
      [target],
      [{ moleculeMap: new Map([[0, 0]]), componentMap }]
    )).toBeNull();
  });

  it.each([
    {
      name: 'bond topology changes',
      seed: 'A(s~U,x,y)',
      rule: 'A(s~U,x,y) -> A(s~P,x!1,y!1)',
    },
    {
      name: 'the compartment changes',
      seed: '@CP:A(s~U)',
      rule: '@CP:A(s~U) -> @NU:A(s~P)',
    },
    {
      name: 'a component wildcard changes',
      seed: 'A(s~U,b)',
      rule: 'A(s~U,b!?) -> A(s~P,b)',
    },
    {
      name: 'the source state is a wildcard',
      seed: 'A(s~U)',
      rule: 'A(s~?) -> A(s~P)',
    },
    {
      name: 'component correspondence is ambiguous',
      seed: 'A(s~U,s~U)',
      rule: 'A(s~U,s~U) -> A(s~P,s~U)',
    },
    {
      name: 'the pattern contains multiple molecules',
      seed: 'A(s~U,x!1).B(y!1)',
      rule: 'A(s~U,x!1).B(y!1) -> A(s~P,x!1).B(y!1)',
    },
  ])('falls back when $name', async ({ seed, rule }) => {
    const run = await runGeneration(seed, rule);
    expect(run.buildProductSpy).toHaveBeenCalled();
  });

  it('falls back for MoveConnected even when the written graphs only change state', async () => {
    const run = await runGeneration('A(s~U)', 'A(s~U) -> A(s~P)', {
      configureRule: (rule) => {
        rule.isMoveConnected = true;
      },
    });
    expect(run.buildProductSpy).toHaveBeenCalled();
  });
});
