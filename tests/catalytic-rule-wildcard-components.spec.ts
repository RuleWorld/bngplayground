/**
 * Regression: catalytic reaction rules whose catalyst pattern omits a component
 * (e.g. `Ras(sos!1).Sos(ras!1)` without naming the `a` site) were silently dropped
 * during network generation, so the whole catalytic cycle disappeared and the
 * simulation produced a flat, chemistry-free trajectory.
 *
 * In BNGL an unspecified component is a wildcard: it may be in any state, and an
 * unchanged catalyst must survive the transformation untouched.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork, simulate } from '@bngplayground/engine';
import { loadEvaluator, _setEvaluatorRefForTests, SafeExpressionEvaluator } from '@bngplayground/engine';
import type { BNGLModel } from '@bngplayground/engine';

const RAS_HEADER = `
begin model
begin parameters
  kcat 1e-2
  kon 1e-3
  koff 1e-2
end parameters
begin molecule types
  Ras(sos,a~p~0)
  Sos(ras)
end molecule types
begin species
  Ras(sos,a~0) 500
  Sos(ras) 30
end species
begin observables
  Molecules gtp Ras(sos,a~p)
end observables
begin reaction rules
  bind: Ras(sos,a~0) + Sos(ras) <-> Ras(sos!1,a~0).Sos(ras!1) kon,koff
`;

const expand = async (rules: string): Promise<BNGLModel> => {
  const model = parseBNGLStrict(RAS_HEADER + rules + '\nend reaction rules\nend model\n');
  return generateExpandedNetwork(model, () => {}, () => {});
};

const reactionNamed = (net: BNGLModel, name: string) =>
  net.reactions.find((r) => r.name === name);

describe('Catalytic rules with wildcard components on the catalyst', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
    void loadEvaluator(SafeExpressionEvaluator).catch(() => undefined);
  });

  it('expands a catalytic rule whose catalyst pattern omits a component', async () => {
    const net = await expand(
      '  phos: Ras(sos,a~0) + Ras(sos!1).Sos(ras!1) -> Ras(sos,a~p) + Ras(sos!1).Sos(ras!1) kcat',
    );

    const phos = reactionNamed(net, 'phos');
    expect(phos, 'the catalytic rule must not be dropped').toBeDefined();
    // The catalyst is unchanged by the transformation, so it appears on both sides.
    expect(phos!.reactants).toContain('Ras(a~0,sos!1).Sos(ras!1)');
    expect(phos!.products).toContain('Ras(a~0,sos!1).Sos(ras!1)');
    expect(phos!.products).toContain('Ras(a~p,sos)');
  });

  it('still expands a catalytic rule whose catalyst names an explicit state', async () => {
    const net = await expand(
      '  phos: Ras(sos,a~0) + Ras(sos!1,a~0).Sos(ras!1) -> Ras(sos,a~p) + Ras(sos!1,a~0).Sos(ras!1) kcat',
    );

    const phos = reactionNamed(net, 'phos');
    expect(phos).toBeDefined();
    expect(phos!.reactants).toContain('Ras(a~0,sos!1).Sos(ras!1)');
    expect(phos!.products).toContain('Ras(a~0,sos!1).Sos(ras!1)');
  });

  it('treats an explicit state wildcard on the catalyst as any state', async () => {
    const net = await expand(
      '  phos: Ras(sos,a~0) + Ras(sos!1,a~?).Sos(ras!1) -> Ras(sos,a~p) + Ras(sos!1,a~?).Sos(ras!1) kcat',
    );

    expect(reactionNamed(net, 'phos')).toBeDefined();
  });

  it('does not resurrect a reactant the product pattern genuinely drops', async () => {
    const net = await expand(
      '  swap: Ras(sos,a~0) + Ras(sos!1,a~0).Sos(ras!1) -> Ras(sos,a~p) + Sos(ras) kcat',
    );

    const swap = reactionNamed(net, 'swap');
    expect(swap).toBeDefined();
    // The complex is genuinely consumed here, so it must not reappear as a product.
    expect(swap!.products).not.toContain('Ras(a~0,sos!1).Sos(ras!1)');
    expect(swap!.products).toContain('Sos(ras)');
  });

  it('produces phosphorylation dynamics instead of a flat trajectory', async () => {
    const net = await expand(
      '  phos: Ras(sos,a~0) + Ras(sos!1).Sos(ras!1) -> Ras(sos,a~p) + Ras(sos!1).Sos(ras!1) kcat',
    );

    const results = await simulate(
      1,
      net,
      { method: 'ssa', t_end: 10000, n_steps: 100 },
      { checkCancelled: () => {}, postMessage: () => {} },
    );

    const gtp = results.data.map((row) => Number(row.gtp));
    expect(Math.max(...gtp), 'Ras must actually get phosphorylated').toBeGreaterThan(0);
  });
});
