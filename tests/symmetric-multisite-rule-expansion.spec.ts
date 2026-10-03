/**
 * Regression: rules on symmetric multi-site molecules produced the wrong network.
 *
 * Two defects, both in buildProductGraph's product-graph construction, both
 * reachable from ordinary BNGL and both covered here:
 *
 * 1. A `!+` site in a PRODUCT pattern was resolved against the first same-named site
 *    of the reactant pattern rather than against its own `!+` counterpart. In a
 *    molecule with repeated site names that lets a numbered site (b!1) steal the
 *    wildcard's slot, so the product's bond labels come out rotated and a bonded
 *    partner is orphaned away. A rule that only changes a state — Zhang_2021's
 *    `Ang1_4(tie2bs!1,tie2bs!+,tie2bs!+,tie2bs!+).Tie2(...pY~dp...) <-> ...pY~p...`
 *    — then destroys a quarter of its own complex instead of phosphorylating it.
 *    On Zhang_2021 this alone cost 93 of 150 species.
 *
 * 2. A rule that transforms one molecule type into a shorter one
 *    (`Ang2_3(t,t,t) -> Ang2_2(t,t)`) kept the reactant's component list, so the
 *    product was a molecule that violated its own type declaration — and such a
 *    molecule also matches reactant patterns written against the shorter type,
 *    inflating every rule that touches that type.
 *
 * The expected counts below are BioNetGen 2.9.3's, read from the .net file it
 * writes for these models.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { loadEvaluator, _setEvaluatorRefForTests, SafeExpressionEvaluator } from '@bngplayground/engine';
import type { BNGLModel, BNGLReaction } from '@bngplayground/engine';

const expand = async (source: string): Promise<BNGLModel> => {
  const model = parseBNGLStrict(source);
  return generateExpandedNetwork(model, () => {}, () => {});
};

const speciesNames = (net: BNGLModel): string[] => net.species.map((s) => s.name);

/** Reactions attributed to a rule label, in either the forward or reverse direction. */
const reactionsOf = (net: BNGLModel, label: string): BNGLReaction[] =>
  net.reactions.filter((r) => {
    const name = r.name ?? '';
    return name === label || name === `${label}_rev` || name === `_reverse__${label}`;
  });

/**
 * A four-valent ligand whose four identical sites are filled one at a time, then
 * phosphorylated through a `!+` pattern that must preserve the whole complex.
 */
const FOUR_VALENT_MODEL = `
begin model
begin parameters
  A0 1
  kbind 1
  kp 1
  kdp 1
end parameters
begin molecule types
  Ang(tie2bs,tie2bs,tie2bs,tie2bs)
  R(angbs,loc~s,pY~p~dp)
end molecule types
begin seed species
  Ang(tie2bs,tie2bs,tie2bs,tie2bs) A0
  R(angbs,loc~s,pY~dp) 1
end seed species
begin reaction rules
  b1: Ang(tie2bs,tie2bs,tie2bs,tie2bs) + R(angbs,loc~s,pY~dp) <-> \\
      Ang(tie2bs!1,tie2bs,tie2bs,tie2bs).R(angbs!1,loc~s,pY~dp) kbind,kbind
  b2: Ang(tie2bs!1,tie2bs,tie2bs,tie2bs).R(angbs!1,loc~s,pY~dp) + R(angbs,loc~s,pY~dp) <-> \\
      Ang(tie2bs!1,tie2bs!2,tie2bs,tie2bs).R(angbs!1,loc~s,pY~dp).R(angbs!2,loc~s,pY~dp) kbind,kbind
  b3: Ang(tie2bs!1,tie2bs!2,tie2bs,tie2bs).R(angbs!1,loc~s,pY~dp).R(angbs!2,loc~s,pY~dp) + R(angbs,loc~s,pY~dp) <-> \\
      Ang(tie2bs!1,tie2bs!2,tie2bs!3,tie2bs).R(angbs!1,loc~s,pY~dp).R(angbs!2,loc~s,pY~dp).R(angbs!3,loc~s,pY~dp) kbind,kbind
  b4: Ang(tie2bs!1,tie2bs!2,tie2bs!3,tie2bs).R(angbs!1,loc~s,pY~dp).R(angbs!2,loc~s,pY~dp).R(angbs!3,loc~s,pY~dp) + R(angbs,loc~s,pY~dp) <-> \\
      Ang(tie2bs!1,tie2bs!2,tie2bs!3,tie2bs!4).R(angbs!1,loc~s,pY~dp).R(angbs!2,loc~s,pY~dp).R(angbs!3,loc~s,pY~dp).R(angbs!4,loc~s,pY~dp) kbind,kbind
  phos: Ang(tie2bs!1,tie2bs!+,tie2bs!+,tie2bs!+).R(angbs!1,loc~s,pY~dp) <-> \\
      Ang(tie2bs!1,tie2bs!+,tie2bs!+,tie2bs!+).R(angbs!1,loc~s,pY~p) kp,kdp
end reaction rules
end model
`;

/**
 * A trimer that internalizes into a shorter-typed dimer, as Zhang_2021 rule 35 does.
 * The reactant pattern names only two of the three ligand sites, so the third is a
 * bystander: the rule may only fire when that site is free, because the dimer has
 * nowhere to put the bond the trimer was carrying there.
 *
 * `shrink` must stay unidirectional. Written `<->`, BioNetGen treats Ang2_3 as a
 * molecule *created* by the reverse rule and rejects the model outright, because
 * `Ang2_3(tie2bs!1,tie2bs!2)` is an incomplete specification of a three-site type.
 * Zhang_2021 escapes this only because its rule 35 is one-way.
 */
const SHRINKING_TYPE_MODEL = `
begin model
begin parameters
  kb 1
  ki 1
  A2_0 1
end parameters
begin molecule types
  Ang2_3(tie2bs,tie2bs,tie2bs)
  Ang2_2(tie2bs,tie2bs)
  T2(angbs)
end molecule types
begin seed species
  Ang2_3(tie2bs,tie2bs,tie2bs) 1
  Ang2_2(tie2bs,tie2bs) A2_0
  T2(angbs) 1
end seed species
begin reaction rules
  b1: Ang2_3(tie2bs,tie2bs,tie2bs) + T2(angbs) <-> Ang2_3(tie2bs!1,tie2bs,tie2bs).T2(angbs!1) kb,kb
  b2: Ang2_3(tie2bs!1,tie2bs,tie2bs).T2(angbs!1) + T2(angbs) <-> Ang2_3(tie2bs!1,tie2bs!2,tie2bs).T2(angbs!1).T2(angbs!2) kb,kb
  shrink: Ang2_3(tie2bs!1,tie2bs!2).T2(angbs!1).T2(angbs!2) -> Ang2_2(tie2bs,tie2bs) + T2(angbs) + T2(angbs) ki
end reaction rules
end model
`;

describe('Symmetric multi-site reaction rules', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
    void loadEvaluator(SafeExpressionEvaluator).catch(() => undefined);
  });

  describe('!+ sites in a product pattern', () => {
    it('keeps every bound partner when a !+ pattern only changes a state', async () => {
      const net = await expand(FOUR_VALENT_MODEL);

      for (const rxn of reactionsOf(net, 'phos')) {
        for (const side of [rxn.reactants ?? [], rxn.products ?? []]) {
          for (const molecule of side) {
            // Every product molecule must be a complete, well-formed complex: the
            // bug orphaned one R away and left Ang with a dangling-free site.
            expect(molecule, `${rxn.name} side ${side.join(' + ')}`).not.toMatch(
              /R\(angbs,loc/,
            );
          }
        }
      }

      const phosphorylated = speciesNames(net).filter((n) => n.includes('pY~p'));
      // Every species the rule produces keeps all four receptors.
      expect(phosphorylated.length).toBeGreaterThan(0);
      for (const name of phosphorylated) {
        expect((name.match(/R\(/g) ?? []).length, `species ${name} lost a receptor`).toBe(4);
      }
    });

    it('reproduces BioNetGen species and reaction counts', async () => {
      const net = await expand(FOUR_VALENT_MODEL);
      expect(net.species.length).toBe(10);
      expect(net.reactions.length).toBe(16);
    });
  });

  describe('molecule-type transformations', () => {
    it('builds the product molecule with the target type site count', async () => {
      const net = await expand(SHRINKING_TYPE_MODEL);

      const dimerProducts = reactionsOf(net, 'shrink').flatMap((r) => r.products ?? []).filter((p) => p.startsWith('Ang2_2('));
      expect(dimerProducts.length).toBeGreaterThan(0);
      for (const product of dimerProducts) {
        const arity = (product.slice('Ang2_2('.length).match(/,/g) ?? []).length + 1;
        // Ang2_2 declares two sites; keeping the reactant's third would be a molecule
        // that violates its own type declaration.
        expect(arity, `product ${product} kept the reactant arity`).toBe(2);
      }
    });

    it('does not fire when a site the product drops is carrying a bond', async () => {
      const net = await expand(SHRINKING_TYPE_MODEL);

      const shrink = reactionsOf(net, 'shrink');
      // BioNetGen fires the rule once, from the complex whose third site is free.
      // Matching it against a triply-bound complex would have to shed a bond the
      // dimer product cannot represent.
      expect(shrink.length).toBe(1);
      // The trimer's third site must be free. A triply-bound complex would need the
      // transformation to shed a bond the dimer cannot represent.
      for (const reactant of shrink[0].reactants ?? []) {
        expect(reactant, 'the rule fired on a triply-bound trimer').not.toMatch(
          /Ang2_3\(tie2bs!1,tie2bs!2,tie2bs!3\)/,
        );
      }
    });

    it('reproduces BioNetGen species and reaction counts', async () => {
      const net = await expand(SHRINKING_TYPE_MODEL);
      expect(net.species.length).toBe(5);
      expect(net.reactions.length).toBe(5);
    });
  });
});
