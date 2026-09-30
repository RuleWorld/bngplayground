/**
 * The reference generator must define `__FREE` parameters so BNG2.pl can build a
 * reference. Without this, BNG2 aborts with
 * `ABORT: Parameter 't0__FREE' is referenced but not defined` and the model is
 * left with no reference at all — the single largest source of unreferenced
 * models in the corpus (413 of 692 in the last sweep).
 *
 * BNG2 resolves parameter references at model-read time, so a trailing
 * `setParameter` does not work; the value has to be in the parameters block.
 * These tests exercise the real helper used by the generator.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { injectFreeParameterDefaults, findFreeParameters } from '../scripts/generation/freeParameterDefaults';

const PYBNF_MODEL = `begin model
begin parameters
  t0 t0__FREE
  k1 k1__FREE
  kd KD_LckCd28__FREE__
end parameters
begin molecule types
  A()
end molecule types
begin actions
  simulate({method=>"ode",t_end=>100,n_steps=>10})
end actions
end model
`;

describe('__FREE parameter defaults for BNG2 reference generation', () => {
  it('finds every __FREE identifier referenced in the model', () => {
    expect(findFreeParameters(PYBNF_MODEL)).toEqual(['KD_LckCd28__FREE__', 'k1__FREE', 't0__FREE']);
  });

  it('defines each __FREE parameter inside the parameters block', () => {
    const out = injectFreeParameterDefaults(PYBNF_MODEL);
    const params = out.slice(out.indexOf('begin parameters'), out.indexOf('end parameters'));
    expect(params).toMatch(/^[ \t]*t0__FREE[ \t]+0$/m);
    expect(params).toMatch(/^[ \t]*k1__FREE[ \t]+0$/m);
  });

  it('defines the parameter in the block, not as a trailing setParameter action', () => {
    // BNG2 aborts before actions run, so a setParameter anywhere in the actions
    // block would not help. Assert the definition precedes `end parameters`.
    const out = injectFreeParameterDefaults(PYBNF_MODEL);
    expect(out).not.toMatch(/setParameter\(/);
    expect(out.indexOf('t0__FREE 0')).toBeLessThan(out.indexOf('end parameters'));
  });

  it('leaves models without __FREE parameters untouched', () => {
    const plain = 'begin model\nbegin parameters\n  k 0.5\nend parameters\nend model\n';
    expect(injectFreeParameterDefaults(plain)).toBe(plain);
  });

  it('creates a parameters block when the model has none', () => {
    const noBlock = 'begin model\nbegin molecule types\n  A()\nend molecule types\nend model\n\n# free parameter referenced by a rule\n# t0__FREE\n';
    const out = injectFreeParameterDefaults(noBlock);
    expect(out).toMatch(/begin parameters\n[ \t]*t0__FREE 0\nend parameters/);
  });

  it('does not redefine a __FREE parameter the model already defines', () => {
    const already = 'begin model\nbegin parameters\n  t0__FREE 5\n  t0 t0__FREE\nend parameters\nend model\n';
    const out = injectFreeParameterDefaults(already);
    expect(out).toBe(already);
  });

  it('keeps the playground and BNG2 in agreement on __FREE = 0', () => {
    const visitor = readFileSync('packages/engine/src/parser/BNGLVisitor.ts', 'utf8');
    expect(visitor).toMatch(/this\.parameters\[value\] = 0;/);
  });
});
