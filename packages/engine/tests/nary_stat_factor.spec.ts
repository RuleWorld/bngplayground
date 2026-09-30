import { describe, it, expect } from 'vitest';
import { parseBNGLWithANTLR } from '../src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../src/services/simulation/NetworkExpansion';
import type { BNGLModel } from '../src/types';

/**
 * BNG2 statistical factors for n-ary rules (RxnRule::find_reaction_center).
 *
 * `multScale = 1 / (|RG| / |Stab|) / crg_permutations`. For a rule with two
 * identical reactant patterns that both change, exchanging them moves the
 * reaction centre out of itself, so the swap is in RG but not in Stab and
 * |RG|/|Stab| = 2: the per-instance factor is 1/2.
 *
 * That factor is per *instance*. `expand_rule` still enumerates every ordering
 * of the identical patterns and `RxnList::add` sums the stat factors of the
 * orderings that fold into a single entry, so for a heterodimerisation of two
 * distinct species the two orderings sum 0.5 + 0.5 = 1 (`k_dimer`), while the
 * homodimerisation has one ordering and keeps 0.5 (`0.5*k_dimer`).
 *
 * A "tuple-aware" correction that dropped the 1/2 exactly when the two identical
 * patterns landed on distinct species double-counted that case: each ordering
 * got factor 1 and the pair summed to 2, halving `k_dimer` in the ODE RHS and
 * shifting trajectories by several percent.
 */
describe('n-ary identical-pattern statistical factors (BNG2 parity)', () => {
  const expand = async (bngl: string) => {
    const parsed = parseBNGLWithANTLR(bngl);
    expect(parsed.success, parsed.success ? '' : String(parsed.errors?.[0]?.message)).toBe(true);
    const net = await generateExpandedNetwork(parsed.model as BNGLModel, () => {}, () => {});
    // Reactions carry species names, so key on those directly.
    const rows = (net.reactions as unknown[]).map(raw => {
      const r = raw as {
        reactants: string[]; products: string[];
        rateExpression?: string; rate: number; name?: string;
      };
      return {
        reactants: [...r.reactants].sort(),
        products: [...r.products].sort(),
        expr: r.rateExpression,
        name: r.name,
      };
    });
    return { net, rows };
  };

  it('gives the heterodimerisation stat factor 1 and each homodimerisation 0.5', async () => {
    const { net, rows } = await expand(`
begin model
begin parameters
  k_dimer 1.5
end parameters
begin molecule types
  ERK(b,s~P,loc~cyt~nuc)
end molecule types
begin seed species
  ERK(b,s~P,loc~cyt) 10
  ERK(b,s~P,loc~nuc) 10
end seed species
begin reaction rules
  ERK(s~P,b) + ERK(s~P,b) <-> ERK(s~P,b!1).ERK(s~P,b!1) k_dimer,0.2
end reaction rules
end model
`);

    const CYT = 'ERK(b,loc~cyt,s~P)';
    const NUC = 'ERK(b,loc~nuc,s~P)';
    const find = (r: string[], p: string[]) =>
      rows.filter(x => x.reactants.join('+') === [...r].sort().join('+') && x.products.join('+') === [...p].sort().join('+'));

    const cytHomodimer = find([CYT, CYT], [`ERK(b!1,loc~cyt,s~P).ERK(b!1,loc~cyt,s~P)`]);
    const heterodimer = find([CYT, NUC], [`ERK(b!1,loc~cyt,s~P).ERK(b!1,loc~nuc,s~P)`]);
    const nucHomodimer = find([NUC, NUC], [`ERK(b!1,loc~nuc,s~P).ERK(b!1,loc~nuc,s~P)`]);

    // Two distinct heterodimer orderings fold into one reaction; both must sum
    // to a factor of 1, never 2.
    expect(heterodimer).toHaveLength(1);
    expect(heterodimer[0].expr).toBe('k_dimer');

    // A single ordering carries the raw 1/2.
    expect(cytHomodimer).toHaveLength(1);
    expect(cytHomodimer[0].expr).toBe('(0.5)*(k_dimer)');
    expect(nucHomodimer).toHaveLength(1);
    expect(nucHomodimer[0].expr).toBe('(0.5)*(k_dimer)');

    // Sanity: the network is unchanged in size by this rule (3 forward + 3 reverse).
    expect(net.reactions).toHaveLength(6);
    expect(net.species).toHaveLength(5);
  });
});
