/**
 * `parseNetFile` must handle the `.net` files BioNetGen 2.9.3 actually writes.
 *
 * Real output differs from the pattern-style form in three ways that previously
 * made every real file fail to parse:
 *   - species initial values may be a parameter name ("17 LPS(...) LPS_Init")
 *   - reaction participants are species indices ("196 76 60,66 NFkB_DNA_IkB_Unbind")
 *   - `begin groups` lines are "index name speciesIndices" ("8 IkB_active 15,23,57,61")
 *
 * The fixture below is the exact shape BNG2 emits.
 */
import { describe, it, expect } from 'vitest';

import { parseNetFile } from '../packages/engine/src/services/graph/NetParser';

const REAL_BNG2_NET = `# Created by BioNetGen 2.9.3
begin parameters
    1 LPS_MD2_Bind                   0.001  # Constant
    2 LPS_Init                       2500.0  # Constant
    3 kdeg                           0.05  # Constant
end parameters
begin species
    1 CD14(LPS,MD2,TLR4) 1.000000000000e+04
    2 MD2(CD14,LPS,TLR4) 1.000000000000e+04
    3 LPS(CD14,LPS,MD2,TLR4) LPS_Init
    4 LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2) 0.000000000000e+00
end species
begin reactions
    1 2,3 4 LPS_MD2_Bind
    2 4 2,3 LPS_MD2_Unbind
    3 4 4 kdeg #degrade
end reactions
begin groups
    1 TNF                  3
    8 IkB_active           1,2,4
end groups
`;

describe('parseNetFile against real BioNetGen 2.9.3 output', () => {
  const parsed = parseNetFile(REAL_BNG2_NET);

  it('parses without errors', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('resolves a symbolic species initial value against the parameters block', () => {
    const lps = parsed.model.species?.find((s) => s.name === 'LPS(CD14,LPS,MD2,TLR4)');
    expect(lps).toBeDefined();
    expect(lps!.initialConcentration).toBe(2500);
  });

  it('keeps an unresolvable initial value as an expression rather than failing', () => {
    const net = REAL_BNG2_NET.replace('3 LPS(CD14,LPS,MD2,TLR4) LPS_Init', '3 LPS(CD14,LPS,MD2,TLR4) some_undefined');
    const r = parseNetFile(net);
    expect(r.errors).toEqual([]);
    const s = r.model.species?.find((x) => x.name === 'LPS(CD14,LPS,MD2,TLR4)');
    expect(s?.initialConcentration).toBe(0);
    expect(s?.initialExpression).toBe('some_undefined');
  });

  it('resolves index-based reaction participants to species names', () => {
    const bind = parsed.model.reactions?.[0];
    expect(bind?.reactants).toEqual(['MD2(CD14,LPS,TLR4)', 'LPS(CD14,LPS,MD2,TLR4)']);
    expect(bind?.products).toEqual(['LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2)']);
    // The rate is a parameter name, not a number.
    expect(bind?.rate).toBe('LPS_MD2_Bind');
  });

  it('parses groups given as an index list into observables', () => {
    expect(parsed.model.observables).toHaveLength(2);
    expect(parsed.model.observables?.[0]).toEqual({ name: 'TNF', type: 'molecules', pattern: 'LPS(CD14,LPS,MD2,TLR4)' });
    const group = parsed.model.observables?.[1].pattern ?? '';
    // Species names themselves contain commas, so assert on resolved names.
    expect(group).toContain('CD14(LPS,MD2,TLR4)');
    expect(group).toContain('MD2(CD14,LPS,TLR4)');
    expect(group).toContain('LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2)');
  });

  it('still accepts the pattern-style observable form', () => {
    const net = REAL_BNG2_NET.replace('    1 TNF                  3', '    1 Dimers Molecules CD14(CR1!+)');
    const r = parseNetFile(net);
    expect(r.errors).toEqual([]);
    expect(r.model.observables?.[0]).toEqual({ name: 'Dimers', type: 'molecules', pattern: 'CD14(CR1!+)' });
  });

  it('handles stoichiometric coefficients in reactions and groups', () => {
    // BNG2 writes "1,1" for two copies of species 1 and "2*6" in groups.
    const net = REAL_BNG2_NET
      .replace('    1 2,3 4 LPS_MD2_Bind', '    1 2,3 2*4 LPS_MD2_Bind')
      .replace('    8 IkB_active           1,2,4', '    8 IkB_active           2*1,2,4');
    const r = parseNetFile(net);
    expect(r.errors).toEqual([]);
    expect(r.model.reactions?.[0].products).toEqual([
      'LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2)',
      'LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2)'
    ]);
    const groupPattern = r.model.observables?.[1].pattern ?? '';
    const sp1 = 'CD14(LPS,MD2,TLR4)';
    const occurrences = groupPattern.split(sp1).length - 1;
    expect(occurrences).toBe(2);
  });

  it('leaves pattern-style reaction participants untouched', () => {
    const net = REAL_BNG2_NET.replace('    1 2,3 4 LPS_MD2_Bind', '    1 CD14(LPS,MD2,TLR4),MD2(CD14,LPS,TLR4) LPS(CD14,LPS!1,MD2,TLR4).MD2(CD14,LPS!1,MD2) LPS_MD2_Bind');
    const r = parseNetFile(net);
    expect(r.errors).toEqual([]);
    expect(r.model.reactions?.[0].reactants[0]).toBe('CD14(LPS,MD2,TLR4)');
  });
});
