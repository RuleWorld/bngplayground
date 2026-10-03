/**
 * Regression: a product pattern whose molecules are split apart by the
 * transformation must invalidate the reaction, not silently drop a partner.
 *
 * BioNetGen assigns every product molecule to the product pattern that declared
 * it (`RxnRule::apply_operations` -> `SpeciesGraph::splitConnectedComponents`) and
 * aborts the whole reaction when a declared pattern is left with no connected
 * component of its own (`SpeciesGraph.pm:2261-2264`). So
 *
 *   R(Y1~P!1).S(PTP~O!1) -> R(Y1~U).S(PTP~O)
 *
 * only fires when R and S stay joined through some *other* site. When bond 1 is
 * the only thing holding them together, BNG2 drops the reaction; the playground
 * used to emit it with the released S deleted from the products, which both
 * invented reactions and lost mass.
 *
 * Verified against BioNetGen 2.9.3 (`BNG2.pl` on the same model: 1 reaction,
 * from `spD` only).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { loadEvaluator, _setEvaluatorRefForTests, SafeExpressionEvaluator } from '@bngplayground/engine';
import type { BNGLModel, BNGLReaction } from '@bngplayground/engine';

const RULE = 'kcat: R(Y1~P!1).S(PTP~O!1) -> R(Y1~U).S(PTP~O) kcat';

const expand = async (species: string[]): Promise<BNGLModel> => {
  const model = parseBNGLStrict(`
begin model
begin parameters
  kcat 1
  spA 1
  spB 1
  spC 1
  spD 1
end parameters
begin molecule types
  R(DD,Y1~U~P,Y2~P)
  S(NSH2~C~O,CSH2,PTP~C~O)
end molecule types
begin species
${species.join('\n')}
end species
begin reaction rules
  ${RULE}
end reaction rules
end model
`);
  return generateExpandedNetwork(model as BNGLModel, () => {}, () => {});
};

describe('product patterns that split during transformation', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
    void loadEvaluator(SafeExpressionEvaluator).catch(() => undefined);
  });

  it('drops the reaction when the declared product pattern falls apart', async () => {
    // R and S are joined only by bond 1, which the product deletes.
    const net = await expand([
      '  R(DD,Y1~P!1,Y2~P).S(NSH2~O,CSH2,PTP~O!1) spA',
      '  R(DD,Y1~P!1,Y2~P!2).S(NSH2~C,CSH2!2,PTP~C).S(NSH2~O,CSH2,PTP~O!1) spB',
      '  R(DD,Y1~P!1,Y2~P!2).S(NSH2~O,CSH2!2,PTP~O).S(NSH2~O,CSH2,PTP~O!1) spC',
    ]);

    expect(net.reactions, 'a reaction whose product pattern splits is not a valid reaction').toHaveLength(0);
  });

  it('keeps the reaction when another site still holds the product pattern together', async () => {
    // Same rule, but S.PTP and S.CSH2 both sit on the same R, so deleting bond 1
    // leaves R.Y2-S.CSH2 intact. This is the only species BioNetGen fires on.
    const net = await expand([
      '  R(DD!1,Y1~P!2,Y2~P!3).S(NSH2~O,CSH2!3,PTP~O!2).R(DD!1,Y1~U,Y2~P!4).S(NSH2~O,CSH2!4,PTP~O) spD',
    ]);

    expect(net.reactions).toHaveLength(1);
    const products = (net.reactions as Array<BNGLReaction>)[0].products ?? [];
    // The PTP site is released but the pair stays in one complex.
    expect(products).toEqual([
      'R(DD!1,Y1~U,Y2~P!2).R(DD!1,Y1~U,Y2~P!3).S(CSH2!2,NSH2~O,PTP~O).S(CSH2!3,NSH2~O,PTP~O)',
    ]);
  });

  it('still splits explicitly dissociated products into separate species', async () => {
    // `A + B` products are two declared patterns, so neither one splits and both
    // must survive as separate products.
    const model = parseBNGLStrict(`
begin model
begin parameters
  kcat 1
  sp 1
end parameters
begin molecule types
  R(DD,Y1~U~P)
  S(NSH2~C~O,PTP~C~O)
end molecule types
begin species
  R(DD,Y1~P!1).S(NSH2~O,PTP~O!1) sp
end species
begin reaction rules
  diss: R(Y1~P!1).S(PTP~O!1) -> R(Y1~U) + S(PTP~O) kcat
end reaction rules
end model
`);
    const net = await generateExpandedNetwork(model as BNGLModel, () => {}, () => {});

    expect(net.reactions).toHaveLength(1);
    const products = ((net.reactions as Array<BNGLReaction>)[0].products ?? []).slice().sort();
    expect(products).toEqual(['R(DD,Y1~U)', 'S(NSH2~O,PTP~O)']);
  });
});