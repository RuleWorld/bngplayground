/**
 * Rule application must enumerate every assignment of a bimolecular rule's
 * products when the two reactant patterns can match their targets in more than
 * one way.
 *
 * Reduced from 190127_CHO_EGFR_best-fit (RuleHub) to its first six reaction
 * rules, where the divergence is already visible as 12 reactions instead of
 * BioNetGen's 13. The dropped reaction is the one where `Kin~act` lands on the
 * *second* monomer (the Y1068~P one) rather than the first:
 *
 *   EGF(EGFL!1).EGFR(II~u,I_III!1,Kin~0,Y1068~0,...)
 * + EGF(EGFL!1).EGFR(II~u,I_III!1,Kin~0,Y1068~P,...)
 *   -> ...Kin~rec,Y1068~0...  +  ...Kin~act,Y1068~P...
 *
 * The rule is
 *   EGFR(I_III!+,II~u,Kin~0) + EGFR(I_III!+,II~u,Kin~0)
 *     -> EGFR(I_III!+,II~b,Kin~act) + EGFR(I_III!+,II~b,Kin~rec)
 *
 * Species counts already agree (75/75 in the full model); only the reaction
 * instantiation is missing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import type { BNGLModel, BNGLReaction } from '../packages/engine/src/types';

const FIXTURE = path.join(__dirname, 'fixtures', 'cho-egfr-r2-minimal.bngl');

describe('bimolecular rule orientation enumeration', () => {
  // Known divergence from BNG2: the expander takes the first candidate match per reactant
  // pattern instead of enumerating every valid pattern-to-target assignment, so this
  // instantiation is never produced. it.fails keeps the reproduction in CI and will
  // start failing (and be fixed) once orientation enumeration lands.
  it.fails('generates the reaction where the second monomer becomes the activator', async () => {
    const source = readFileSync(FIXTURE, 'utf8');
    const parsed = parseBNGLWithANTLR(source);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const net = await generateExpandedNetwork(parsed.model as BNGLModel, () => {}, () => {});
    const reactions = net.reactions as Array<BNGLReaction & { ruleName?: string }>;

    /** Signature that ignores bond labelling and participant order. */
    const canon = (s: string): string =>
      s
        .replace(/!\d+/g, '')
        .split('.')
        .map((molecule) => {
          const open = molecule.indexOf('(');
          if (open === -1) return molecule.replace(/^\$/, '');
          const name = molecule.slice(0, open).replace(/^\$/, '');
          const components = molecule
            .slice(open + 1, molecule.lastIndexOf(')'))
            .split(',')
            .map((c) => c.trim().replace(/!\d+/g, ''));
          return `${name}(${components.sort().join(',')})`;
        })
        .sort()
        .join('.');
    const signature = (r: BNGLReaction): string =>
      [...r.reactants].map(canon).sort().join(' + ') + ' -> ' + [...r.products].map(canon).sort().join(' + ');

    const signatures = new Set(reactions.map(signature));

    // The pair of EGF-bound monomers that differ only at Y1068.
    const egfBoundY1068 = (state: string): string =>
      canon(`EGF(EGFL!1).EGFR(II~u,I_III!1,Kin~0,Y1068~${state},Y1173~0,YN~0)`);
    const actY1068P = canon(
      `EGF(EGFL!1).EGFR(II~b,I_III!1,Kin~act,Y1068~P,Y1173~0,YN~0)`
    );
    const recY10680 = canon(
      `EGF(EGFL!1).EGFR(II~b,I_III!1,Kin~rec,Y1068~0,Y1173~0,YN~0)`
    );

    const expected =
      [egfBoundY1068('0'), egfBoundY1068('P')].sort().join(' + ') +
      ' -> ' +
      [recY10680, actY1068P].sort().join(' + ');

    expect(
      signatures.has(expected),
      'dimerisation must produce the activator/recorder assignment where the second monomer becomes Kin~act'
    ).toBe(true);
  });

  it.fails('matches BioNetGen reaction count for this network', async () => {
    const source = readFileSync(FIXTURE, 'utf8');
    const parsed = parseBNGLWithANTLR(source);
    if (!parsed.success) throw new Error('fixture failed to parse');
    const net = await generateExpandedNetwork(parsed.model as BNGLModel, () => {}, () => {});
    // BNG2.pl (2.9.3) produces 13 reactions for this reduced model.
    expect(net.reactions.length).toBe(13);
  });
});
