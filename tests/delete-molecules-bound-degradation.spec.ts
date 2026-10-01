/**
 * Regression: `X() -> Y() DeleteMolecules` degradation rules were dropped for
 * every species where the deleted molecule was bound inside a complex.
 *
 * `buildProductGraph`'s similarity fallback mapped the product (`Trash`) onto
 * the matched reactant molecule (`T`) even though BioNetGen's label pairing
 * cannot pair molecules with different names — the product must be instantiated
 * fresh and the reactant deleted. Building Trash *from* T then tripped the
 * undeclared-bond guard whenever T's site carried a bystander bond, and
 * `applyRuleTransformation` returned null, silently losing the reaction:
 * `simple_general_simple` lost all 8 bound-T degradation reactions from its
 * network (17 species matched, but 52 of 60 distinct reactions).
 */

import { describe, it, expect } from 'vitest';

import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '@bngplayground/engine';
import type { BNGLModel } from '@bngplayground/engine';

const MODEL = `
begin model
begin parameters
  kdeg 1e-3
end parameters
begin molecule types
  S(t)
  T(s)
  Trash()
end molecule types
begin seed species
  T(s) 10
  S(t!1).T(s!1) 10
  $Trash() 1
end seed species
begin reaction rules
  deg: T() -> Trash() kdeg DeleteMolecules
end reaction rules
end model
`;

/** Order-insensitive canonical form: strip bond labels, sort molecules/sides. */
const canon = (side: string[]): string =>
  side
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '0')
    .map((s) => s.replace(/!\d+/g, '').split('.').sort().join('.'))
    .sort()
    .join('+');

describe('DeleteMolecules degradation of a bound molecule', () => {
  it('frees the bystander partner instead of dropping the reaction', async () => {
    const model = parseBNGLStrict(MODEL);
    const net: BNGLModel = await generateExpandedNetwork(model, () => {}, () => {});

    const degradation = (net.reactions ?? []).filter((r) =>
      (r.products ?? []).some((p) => p.includes('Trash'))
    );
    const byOutcome = new Map(degradation.map((r) => [canon(r.reactants ?? []), canon(r.products ?? [])]));

    // Free T is deleted outright.
    expect(byOutcome.get('T(s)')).toBe('Trash()');
    // The regression: T bound to S must be deleted while S survives as a
    // separate product species (BioNetGen releases it under DeleteMolecules).
    expect(byOutcome.get('S(t).T(s)')).toBe('S(t)+Trash()');
    // Exactly these two — no surplus degradation channels.
    expect(byOutcome.size).toBe(2);
  });
});
