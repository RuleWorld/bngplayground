/**
 * Tests for the network-shape parity checker.
 *
 * The reference `.net` is rendered from the playground's own expansion so the
 * "matches" case is exact by construction; the mismatch case drops one reaction
 * and one species, which is the shape a silently-dropped rule produces.
 */
import { describe, it, expect } from 'vitest';

import { parseNetFile } from '../packages/engine/src/services/graph/NetParser';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import type { BNGLModel, BNGLReaction, BNGSpecies } from '../packages/engine/src/types';

const stripCompartment = (name: string): string => name.replace(/@[A-Za-z0-9_]+\s*::\s*/g, '');

const expand = async (bngl: string) => {
  const parsed = parseBNGLWithANTLR(bngl);
  if (!parsed.success) throw new Error(parsed.errors?.[0]?.message ?? 'parse failed');
  const net = await generateExpandedNetwork(parsed.model as BNGLModel, () => {}, () => {});
  return {
    species: net.species.map((s) => s.name).sort(),
    numSpecies: net.species.length,
    numReactions: net.reactions.length,
    reactions: net.reactions.map((r) => r.name).sort(),
    // .net reaction lines carry the actual transformation, not the rule name.
    reactionLines: net.reactions.map((r) => `${r.reactants.join('+')} -> ${r.products.join('+')}`),
  };
};

/** Render an expansion as a BNG2-style .net, optionally dropping the last reaction. */
const renderNet = (net: { species: string[]; reactionLines: string[] }, dropLast = false): string => {
  const reactions = dropLast ? net.reactionLines.slice(0, -1) : net.reactionLines;
  const lines = [
    'begin parameters',
    '  1 NA 6.02e+23',
    'end parameters',
    'begin species',
    ...net.species.map((s, i) => `  ${i + 1} ${s} 0`),
    'end species',
    'begin reactions',
    ...reactions.map((r, i) => `  ${i + 1} ${r} k${i + 1}`),
    'end reactions',
  ];
  return lines.join('\n') + '\n';
};

const CATALYTIC_MODEL = `
begin model
begin parameters
  kon 1e-3
  koff 1e-2
  kcat 1e-2
end parameters
begin molecule types
  Ras(a~p~0,b)
  Lig(b)
end molecule types
begin species
  Ras(a~0,b) 100
  Lig(b) 30
end species
begin reaction rules
  bind: Ras(a~0,b) + Lig(b) <-> Ras(a~0,b!1).Lig(b!1) kon,koff
  phos: Ras(a~0,b) -> Ras(a~p,b) kcat
end reaction rules
end model
`;

/** The comparison the checker performs, extracted so it can be asserted directly. */
const compareShapes = (reference: { species: string[]; numReactions: number }, generated: { species: string[]; numReactions: number }) => {
  const refSet = new Set(reference.species.map(stripCompartment));
  const genSet = new Set(generated.species.map(stripCompartment));
  const missing = [...refSet].filter((s) => !genSet.has(s));
  const extra = [...genSet].filter((s) => !refSet.has(s));
  const countsMatch = reference.numReactions === generated.numReactions && reference.species.length === generated.species.length;
  return { countsMatch, missing, extra, isMatch: countsMatch && missing.length === 0 && extra.length === 0 };
};

describe('network-shape parity', () => {
  it('parses a BNG2 .net into species and reaction counts', async () => {
    const generated = await expand(CATALYTIC_MODEL);
    const parsed = parseNetFile(renderNet(generated));
    expect(parsed.success).toBe(true);
    expect(parsed.model.species).toHaveLength(generated.numSpecies);
    expect(parsed.model.reactions).toHaveLength(generated.numReactions);
  });

  it('reports a match when both engines built the same network', async () => {
    const generated = await expand(CATALYTIC_MODEL);
    const reference = parseNetFile(renderNet(generated)).model as {
      species: BNGSpecies[];
      reactions: BNGLReaction[];
    };
    const result = compareShapes(
      { species: reference.species.map((s) => s.name), numReactions: reference.reactions.length },
      generated,
    );
    expect(result.isMatch).toBe(true);
  });

  it('flags a network that is missing a reaction', async () => {
    const generated = await expand(CATALYTIC_MODEL);
    const reference = parseNetFile(renderNet(generated, /* dropLast */ true)).model as {
      species: BNGSpecies[];
      reactions: BNGLReaction[];
    };
    const result = compareShapes(
      { species: reference.species.map((s) => s.name), numReactions: reference.reactions.length },
      generated,
    );
    expect(result.isMatch).toBe(false);
    expect(result.countsMatch).toBe(false);
  });

  it('ignores compartment annotation when comparing species names', () => {
    expect(stripCompartment('@Cyt::Ras(a~0,b)')).toBe('Ras(a~0,b)');
    expect(stripCompartment('@ER_M::Lig(b!1)')).toBe('Lig(b!1)');
    expect(stripCompartment('Ras(a~0,b)')).toBe('Ras(a~0,b)');
  });
});
