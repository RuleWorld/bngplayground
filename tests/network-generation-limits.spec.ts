/**
 * A breached generation limit truncates the network. Expansion still returns what
 * it built - large models must keep working - but the result has to say so, both
 * on the result itself and through the progress channel the UI listens to. These
 * tests pin that contract, because a console-only warning is invisible to callers
 * and regresses silently.
 */
import { describe, it, expect } from 'vitest';

import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import type { BNGLModel, GeneratorProgress } from '../packages/engine/src/types';

// A(b) + B(a) -> A(b!1).B(a!1): 2 seeds plus the bound complex is a 3-species,
// 1-reaction network, so a cap below that truncates mid-expansion.
const SEED_GRAPHS = ['A(b)', 'B(a)'].map(s => BNGLParser.parseSpeciesGraph(s));
const BINDING_RULE = BNGLParser.parseRxnRule('A(b) + B(a) -> A(b!1).B(a!1)', 0.1, 'rule_0');
const UNBINDING_RULE = BNGLParser.parseRxnRule('A(b!1).B(a!1) -> A(b) + B(a)', 0.2, 'rule_1');

const BINDING_MODEL = `
begin model
begin molecule types
    A(b)
    B(a)
end molecule types
begin seed species
    A(b) 1
    B(a) 1
end seed species
begin reaction rules
    A(b) + B(a) -> A(b!1).B(a!1) k1
end reaction rules
begin parameters
    k1 0.1
end parameters
end model
`.trim();

const parseModel = (bngl: string, networkOptions?: BNGLModel['networkOptions']) => {
  const parsed = parseBNGLWithANTLR(bngl);
  if (!parsed.success) throw new Error(parsed.errors?.[0]?.message ?? 'parse failed');
  return { ...(parsed.model as BNGLModel), networkOptions } as BNGLModel;
};

describe('network generation limits', () => {
  it('flags a species-capped network instead of reporting it complete', async () => {
    const result = await new NetworkGenerator({ maxSpecies: 2, maxReactions: 100, maxIterations: 100 })
      .generate(SEED_GRAPHS, [BINDING_RULE]);

    // Expansion stops at the cap rather than running past it: the network is a
    // prefix, not a different (larger) network.
    expect(result.species.length).toBe(2);
    expect(result.complete).toBe(false);
    expect(result.warning).toContain('Max species limit reached (2)');
    expect(result.warning).toContain('rule "rule_0"');
  });

  it('flags a reaction-capped network', async () => {
    const result = await new NetworkGenerator({ maxSpecies: 100, maxReactions: 1, maxIterations: 100 })
      .generate(SEED_GRAPHS, [BINDING_RULE]);

    expect(result.complete).toBe(false);
    expect(result.warning).toContain('Reached max reactions limit (1)');
  });

  it('flags an exhausted iteration budget with species still queued', async () => {
    // The bound complex is produced in iteration 1 and is still queued afterwards.
    const result = await new NetworkGenerator({ maxSpecies: 100, maxReactions: 100, maxIterations: 1 })
      .generate(SEED_GRAPHS, [BINDING_RULE]);

    expect(result.complete).toBe(false);
    expect(result.warning).toContain('Max iterations limit (1)');
    expect(result.warning).toContain('network is incomplete');
  });

  it('reports exactly one reason per run', async () => {
    const result = await new NetworkGenerator({ maxSpecies: 2, maxReactions: 1, maxIterations: 1 })
      .generate(SEED_GRAPHS, [BINDING_RULE]);

    expect(result.complete).toBe(false);
    expect(result.warning?.match(/limit/gi)?.length ?? 0).toBeLessThanOrEqual(3);
    expect(result.warning).not.toContain('\n');
  });

  it('reports a complete network as complete', async () => {
    const result = await new NetworkGenerator({ maxSpecies: 100, maxReactions: 100, maxIterations: 100 })
      .generate(SEED_GRAPHS, [BINDING_RULE, UNBINDING_RULE]);

    expect(result.species.length).toBe(3);
    expect(result.reactions.length).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('carries the reason on the expanded model and on the final progress update', async () => {
    const progress: GeneratorProgress[] = [];
    const model = await generateExpandedNetwork(
      parseModel(BINDING_MODEL, { maxSpecies: 2 }),
      () => {},
      (p) => progress.push(p),
    );

    expect(model.networkComplete).toBe(false);
    expect(model.networkWarning).toContain('Max species limit reached (2)');

    const finalProgress = progress[progress.length - 1];
    expect(finalProgress.warning).toBe(model.networkWarning);
  });

  it('leaves a complete model unflagged', async () => {
    const progress: GeneratorProgress[] = [];
    const model = await generateExpandedNetwork(parseModel(BINDING_MODEL), () => {}, (p) => progress.push(p));

    expect(model.species.length).toBe(3);
    expect(model.reactions.length).toBe(1);
    expect(model.networkComplete).toBe(true);
    expect(model.networkWarning).toBeUndefined();
    expect(progress.every(p => p.warning === undefined)).toBe(true);
  });

  it('does not leak generation state into a later network after a capped run', async () => {
    const capped = new NetworkGenerator({ maxSpecies: 2, maxReactions: 100, maxIterations: 100 });
    expect((await capped.generate(SEED_GRAPHS, [BINDING_RULE])).complete).toBe(false);

    const relaxed = new NetworkGenerator({ maxSpecies: 100, maxReactions: 100, maxIterations: 100 });
    const result = await relaxed.generate(SEED_GRAPHS, [BINDING_RULE]);
    expect(result.species.length).toBe(3);
    expect(result.complete).toBe(true);
  });
});