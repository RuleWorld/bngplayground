/**
 * Regression: a rule's product constraint was applied to the wrong reactant molecule.
 *
 * `matchRespectsProductImpliedFreeConstraints` enforces BNG2's rule that a component
 * a PRODUCT lists as free, but the reactant pattern never mentions, must already be
 * free on the matched target. To know which product constrains which reactant it
 * used to ask "do these two molecules share a bonded component name", which stops
 * being a correspondence as soon as two reactant molecules of the same name share a
 * component name. Every molecule of a disulfide-linked dimer lists its cysteine `C`,
 * so the question answered "yes" for both copies, each product's free-site
 * constraint was checked against both, and the match was rejected whenever the
 * *other* copy happened to hold that site.
 *
 * The rule's molecule lists are in fact positionally corresponding per name: the
 * n-th reactant molecule named `A` becomes the n-th product molecule named `A`.
 * Using that correspondence fixes the loss and keeps the cases the heuristic was
 * written for (dissolution `A(x!1).A(y!1) -> A(x) + A(y)`, GPCR transport) working,
 * because there the two same-named molecules do not share a bonded component name.
 *
 * The model below is the IGF1R ligand/receptor core of the `igf1r_fit_all_*` fitting
 * models, reduced to the two capture rules. The expected species and reaction sets
 * are BioNetGen's, read from a hand-run of this exact model. Before the fix it
 * expanded to 6 species / 6 reactions; BNG2 produces 7 / 12.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { loadEvaluator, _setEvaluatorRefForTests, SafeExpressionEvaluator } from '@bngplayground/engine';
import type { BNGLModel } from '@bngplayground/engine';

const expand = async (source: string): Promise<BNGLModel> => {
  const model = parseBNGLStrict(source);
  return generateExpandedNetwork(model, () => {}, () => {});
};

/**
 * A bivalent ligand L binding a cysteine-linked homodimer of R at either of its two
 * capture sites. `C` is the disulfide cysteine: it is bonded on *every* R, which is
 * exactly what made the old name-overlap correspondence ambiguous.
 *
 * The two rules mirror the IGF1R model's capture rules in structure:
 *   `L(ds,hs)+R(S1,C!0).R(S2,C!0)<->L(ds!1,hs).R(S1!1,C!0).R(S2,C!0)`  (k1, d1)
 *   `L(ds,hs)+R(S2,C!0).R(S1,C!0)<->L(ds,hs!1).R(S2!1,C!0).R(S1,C!0)`  (k2, d2)
 */
const TWO_SITE_DIMER_MODEL = `
begin model
begin parameters
  k1 1.0
  d1 0.1
  k2 2.0
  d2 0.2
end parameters
begin molecule types
  L(ds,hs)
  R(S1,S2,C)
end molecule types
begin seed species
  L(ds,hs) 1000
  R(S1,S2,C!0).R(S1,S2,C!0) 100
end seed species
begin reaction rules
  L(ds,hs)+R(S1,C!0).R(S2,C!0)<->L(ds!1,hs).R(S1!1,C!0).R(S2,C!0) k1,d1
  L(ds,hs)+R(S2,C!0).R(S1,C!0)<->L(ds,hs!1).R(S2!1,C!0).R(S1,C!0) k2,d2
end reaction rules
end model
`;

/**
 * The same dimer with only the ds-capture rule. The fix must not simply unlock every
 * match: BNG2 expands this one to 4 species / 4 reactions.
 */
const ONE_SITE_DIMER_MODEL = TWO_SITE_DIMER_MODEL.replace(
  /^ {2}L\(ds,hs\)\+R\(S2,C!0\)\.R\(S1,C!0\).*$/m,
  ''
);

/** Species with bond labels erased and molecules sorted, so label numbering cannot matter. */
const structure = (name: string): string =>
  name
    .replace(/\s+/g, '')
    .replace(/!\+?[^,)]*/g, '')
    .split('.')
    .map((mol) => {
      const open = mol.indexOf('(');
      const head = mol.slice(0, open);
      const inner = mol.slice(open + 1, mol.length - 1);
      const comps: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of inner) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { comps.push(cur); cur = ''; } else cur += ch;
      }
      if (cur) comps.push(cur);
      return `${head}(${comps.map((c) => c.replace(/\s+/g, '')).sort().join(',')})`;
    })
    .sort()
    .join('.');

describe('Product-implied free constraints use positional molecule correspondence', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
    void loadEvaluator(SafeExpressionEvaluator).catch(() => undefined);
  });

  it('keeps the two-ligand species where both ligands crosslink the same R copy', async () => {
    const net = await expand(TWO_SITE_DIMER_MODEL);
    const species = net.species.map((s) => structure(s.name));

    // BNG2 expands this model to 7 species. The one the old correspondence dropped is
    // the species whose two ligands are captured by the SAME receptor copy:
    // L(ds!1,hs).L(ds,hs!2).R(S1!1,S2!2).R(S1,S2). Before the fix only 6 came out.
    expect(species).toContain(structure('L(ds!1,hs).L(ds,hs!2).R(C!3,S1!1,S2!2).R(C!3,S1,S2)'));
    expect(net.species.length).toBe(7);
  });

  it('produces BNG2 reaction count and both routes into the crosslinked species', async () => {
    const net = await expand(TWO_SITE_DIMER_MODEL);

    // BNG2's own .net for this model: 7 species, 12 reactions.
    expect(net.reactions.length).toBe(12);

    const reactionKeys = new Set(
      net.reactions.map((r) => {
        const side = (xs: string[] | undefined) =>
          (xs ?? []).map((x) => structure(String(x).replace(/^\d+:/, ''))).sort().join('+');
        return `${side(r.reactants as string[])} -> ${side(r.products as string[])}`;
      })
    );
    const crosslinked = structure('L(ds!1,hs).L(ds,hs!2).R(C!3,S1!1,S2!2).R(C!3,S1,S2)');
    // One route per capture rule, from each singly-bound species. Both were dropped
    // before the fix.
    expect(reactionKeys).toContain(
      `${structure('L(ds,hs)')}+${structure('L(ds!1,hs).R(C!2,S1!1,S2).R(C!2,S1,S2)')} -> ${crosslinked}`
    );
    expect(reactionKeys).toContain(
      `${structure('L(ds,hs)')}+${structure('L(ds,hs!1).R(C!2,S1,S2!1).R(C!2,S1,S2)')} -> ${crosslinked}`
    );
  });

  it('does not unlock matches BNG2 also rejects', async () => {
    // A single capture rule stays at BNG2's 4 species / 4 reactions.
    const net = await expand(ONE_SITE_DIMER_MODEL);
    expect(net.species.length).toBe(4);
    expect(net.reactions.length).toBe(4);
  });
});
