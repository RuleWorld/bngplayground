// @ts-nocheck
// tests/network.spec.ts
import { describe, it, expect } from 'vitest';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';

// Simplified parseBNGL for testing
function parseBNGLTest(code: string): any {
  // Minimal parser for test - just parse parameters and use BNGLParser for seed species
  const lines = code.split('\n');
  const parameters: Record<string, number> = {};
  const moleculeTypes: { name: string; components: string[] }[] = [];
  const reactionRules: any[] = [];
  let inParams = false;
  let inMolTypes = false;
  let inSeedSpecies = false;
  let inRules = false;
  let seedSpeciesBlock = '';
  let rulesBlock = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'begin parameters') {
      inParams = true;
    } else if (trimmed === 'end parameters') {
      inParams = false;
    } else if (trimmed === 'begin molecule types') {
      inMolTypes = true;
    } else if (trimmed === 'end molecule types') {
      inMolTypes = false;
    } else if (trimmed === 'begin seed species') {
      inSeedSpecies = true;
    } else if (trimmed === 'end seed species') {
      inSeedSpecies = false;
    } else if (trimmed === 'begin reaction rules') {
      inRules = true;
    } else if (trimmed === 'end reaction rules') {
      inRules = false;
    } else if (inParams && trimmed) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        parameters[parts[0]] = parseFloat(parts[1]);
      }
    } else if (inMolTypes && trimmed) {
      const match = trimmed.match(/([A-Za-z0-9_]+)\((.*?)\)/);
      if (match) {
        const name = match[1];
        const components = match[2].split(',').map((c) => c.trim()).filter(Boolean);
        moleculeTypes.push({ name, components });
      }
    } else if (inSeedSpecies && trimmed && !trimmed.startsWith('#')) {
      seedSpeciesBlock += line + '\n';
    } else if (inRules && trimmed) {
      rulesBlock += line + '\n';
    }
  }

  // Parse rules
  const rulesLines = rulesBlock.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  for (const ruleLine of rulesLines) {
    const trimmed = ruleLine.trim();
    const isBidirectional = trimmed.includes('<->');
    const parts = trimmed.split(isBidirectional ? '<->' : '->');
    if (parts.length < 2) continue;
    const reactantsPart = parts[0].trim();
    const productsAndRatePart = parts[1].trim();
    const reactants = reactantsPart.split('+').map(r => r.trim());
    const productsAndRate = productsAndRatePart.split(/\s+/);
    const products = productsAndRate.slice(0, -1).join(' ').split('+').map(p => p.trim());
    const rate = productsAndRate[productsAndRate.length - 1];
    reactionRules.push({ reactants, products, rate, isBidirectional });
  }

  // Use BNGLParser to parse seed species
  const parametersMap = new Map(Object.entries(parameters));
  const seedSpeciesMap = BNGLParser.parseSeedSpecies(seedSpeciesBlock.trim(), parametersMap);
  const species = Array.from(seedSpeciesMap.entries()).map(([name, initialConcentration]) => ({
    name,
    initialConcentration
  }));

  return {
    parameters,
    moleculeTypes,
    species,
    reactionRules,
    reactions: [],
    observables: []
  };
}

describe('Network Generation Parity', () => {
  it('should generate binding network matching BioNetGen', async () => {
    // Simple binding model: A + B <-> AB
    const bnglCode = `
begin model
begin parameters
    kf 0.1
    kr 0.2
end parameters
begin molecule types
    A(b)
    B(a)
end molecule types
begin seed species
    A(b) 10
    B(a) 10
end seed species
begin reaction rules
    A(b) + B(a) -> A(b!1).B(a!1) kf
    A(b!1).B(a!1) -> A(b) + B(a) kr
end reaction rules
end model
    `.trim();

    // Parse BNGL (simulate parseBNGL from worker)
    const model = parseBNGLTest(bnglCode);

    // Convert to graphs
    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
    const rules = model.reactionRules.map((r: any, index: number) => {
      const rate = model.parameters[r.rate] ?? parseFloat(r.rate);
      const ruleStr = `${r.reactants.join(' + ')} -> ${r.products.join(' + ')}`;
      return BNGLParser.parseRxnRule(ruleStr, rate, `rule_${index}`);
    });

    // Generate network
    const generator = new NetworkGenerator({ maxSpecies: 100, maxIterations: 10 });
    const result = await generator.generate(seedSpecies, rules);

    // Expected species: A(b), B(a), A(b!1).B(a!1)
    expect(result.species.length).toBe(3);

    // Canonical strings
    const canonicals = result.species.map(s => GraphCanonicalizer.canonicalize(s.graph));
    expect(canonicals).toContain('A(b)');
    expect(canonicals).toContain('B(a)');
    expect(canonicals).toContain('A(b!1).B(a!1)');

    // Expected reactions: 2 (forward and reverse)
    expect(result.reactions.length).toBe(2);

    // Check reaction details
    const forward = result.reactions.find(r => r.reactants.length === 2);
    const reverse = result.reactions.find(r => r.products.length === 2);

    expect(forward).toBeDefined();
    expect(reverse).toBeDefined();

    if (forward && reverse) {
      expect(forward.rate).toBe(0.1);
      expect(reverse.rate).toBe(0.2);
    }
  });

  it('should parse seed species with mathematical expressions', () => {
    const bnglCode = `
begin model
begin parameters
    TGFb_0 1.0
    IL6_0 0.0
    s_TGFb 1.0
    s_IL6 1.0
    b_TGFb 0.0
    b_IL6 0.0
end parameters
begin molecule types
    TGFb(r)
    IL6(r)
end molecule types
begin seed species
    TGFb(r) s_TGFb*(TGFb_0 + b_TGFb)
    IL6(r) s_IL6*(IL6_0 + b_IL6)
end seed species
end model
    `.trim();

    // Parse BNGL (simulate parseBNGL from worker)
    const model = parseBNGLTest(bnglCode);

    // Check that expressions were evaluated correctly
    expect(model.species).toHaveLength(2);
    expect(model.species.find((s: any) => s.name === 'TGFb(r)')?.initialConcentration).toBe(1.0);
    expect(model.species.find((s: any) => s.name === 'IL6(r)')?.initialConcentration).toBe(0.0);
  });
});
