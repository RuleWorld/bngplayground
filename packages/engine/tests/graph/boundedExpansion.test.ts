import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

import { expandBounded, isReferenceUnavailable } from '../../src/services/graph/boundedExpansion';

const scratch = mkdtempSync(path.join(tmpdir(), 'bounded-expansion-test-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const writeModel = (name: string, body: string): string => {
  const file = path.join(scratch, `${name}.bngl`);
  writeFileSync(file, body);
  return file;
};

/** Monomer-dimerisation: bounded, so it expands to completion. */
const DIMER = `
begin parameters
  kon 1
  koff 1
end parameters
begin molecule types
  A(x,y)
end molecule types
begin seed species
  A(x,y) 10
end seed species
begin reaction rules
  A(x) + A(y) <-> A(x!1,y).A(x!1,y) kon, koff
end reaction rules
`;

/**
 * Unbounded oligomerisation: three rules, no stoichiometric ceiling.
 *
 * Reduced from the Kozer et al. `egfr_ode` reference model by delta
 * debugging, and confirmed to grow without bound in BioNetGen as well: the
 * species count runs 3, 4, 5, 7, 10, 14, 24, 120 and BioNetGen is still
 * climbing when it is killed. Tail cross-linking joins two receptors, ligand
 * binding is only possible on a receptor that is already cross-linked, and
 * the conformational flip is only reachable once ligand is bound — so each
 * round of the cycle mints more species that can start another one, and
 * nothing ever closes the loop.
 *
 * This is the shape of model that used to stall the gate outright.
 */
const UNBOUNDED_OLIGOMERISATION = `
begin parameters
  LT 30
  k21f 0.053
  k21r 0.02
  k_o 1
  kaf 1
  kar 1
end parameters
begin molecule types
  EGF(rec)
  EGFR(back,lig,cd~c~o)
end molecule types
begin seed species
  EGF(rec) LT
  EGFR(back,lig,cd~c) 30
  EGFR(back!1,lig,cd~c).EGFR(back!1,lig,cd~c) 10
end seed species
begin reaction rules
  EGF(rec) + EGFR(back!1,lig).EGFR(back!1,lig) <-> EGF(rec!2).EGFR(back!1,lig!2).EGFR(back!1,lig) k21f,k21r
  EGFR(lig!+,cd~c) -> EGFR(lig!+,cd~o) k_o
  EGFR(cd~o) + EGFR(cd~o) <-> EGFR(cd~o!1).EGFR(cd~o!1) kaf, kar
end reaction rules
`;

/** Unterminated component list — the parser must reject this. */
const MALFORMED = `
begin molecule types
  A(x)
end molecule types
begin seed species
  A(x
end seed species
`;

describe('expandBounded', () => {
  test('reports species and reactions for a model that expands', async () => {
    const result = await expandBounded(writeModel('dimer', DIMER), { timeoutMs: 120_000 });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // The monomer and the single symmetric dimer, matching BioNetGen exactly.
    expect(result.species).toEqual(['A(x,y)', 'A(x!1,y).A(x!1,y)']);
    expect(result.reactions).toHaveLength(2);
    expect(result.reactions[0].reactants).toEqual(['A(x,y)', 'A(x,y)']);
    expect(result.reactions[0].products).toEqual(['A(x!1,y).A(x!1,y)']);
  });

  test('kills a model that cannot expand and reports it instead of hanging', async () => {
    const started = Date.now();
    const result = await expandBounded(writeModel('unbounded', UNBOUNDED_OLIGOMERISATION), { timeoutMs: 5_000 });
    const elapsed = Date.now() - started;

    // The point of the module: the call returns a value, and returns near the bound
    // rather than running until the machine gives out.
    expect(result.status).toBe('killed');
    expect(elapsed).toBeLessThan(40_000);
    if (result.status !== 'killed') return;
    expect(result.reason).toBe('timeout');
    expect(isReferenceUnavailable(result)).toBe(true);
  }, 60_000);

  test('distinguishes a model that does not parse from one that will not finish', async () => {
    const result = await expandBounded(writeModel('malformed', MALFORMED), { timeoutMs: 60_000 });

    expect(result.status).toBe('parse-error');
    // A parse failure is a pipeline defect, not a missing reference.
    expect(isReferenceUnavailable(result)).toBe(false);
  });

  test('rejects a non-positive bound without starting a process', async () => {
    const result = await expandBounded(writeModel('dimer2', DIMER), { timeoutMs: 0 });

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toContain('timeoutMs');
  });
});
