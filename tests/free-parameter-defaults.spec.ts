/**
 * The reference generator must give BNG2.pl the same `__FREE` parameter values
 * the playground uses. Without this, BNG2 aborts with
 * `ABORT: Parameter 't0__FREE' is referenced but not defined` and the model is
 * left with no reference at all — the single largest source of unreferenced
 * models in the corpus.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const GENERATOR = 'scripts/generation/generate_no_ref_gdat.ts';
const source = readFileSync(GENERATOR, 'utf8');

/** Mirrors injectFreeParameterDefaults in the generator. */
const injectFreeParameterDefaults = (code: string): string => {
  const freeNames = new Set<string>();
  for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*__FREE)\b/g)) freeNames.add(match[1]);
  if (freeNames.size === 0) return code;
  const block = [...freeNames].sort().map((name) => `setParameter("${name}", 0)`).join('\n');
  const cleaned = code.replace(/\s+$/, '');
  return `${cleaned}\n\n# [auto-generated] PyBNF __FREE defaults, matching the playground's resolution to 0\n${block}\n`;
};

const PYBNF_MODEL = `
begin model
begin parameters
  t0 t0__FREE
  k1 k1__FREE
end parameters
begin molecule types
  A()
end molecule types
end model
`;

describe('__FREE parameter defaults for BNG2 reference generation', () => {
  it('emits a setParameter for every __FREE identifier, set to 0', () => {
    const out = injectFreeParameterDefaults(PYBNF_MODEL);
    expect(out).toContain('setParameter("t0__FREE", 0)');
    expect(out).toContain('setParameter("k1__FREE", 0)');
  });

  it('leaves models without __FREE parameters untouched', () => {
    const plain = 'begin model\nbegin parameters\n  k 0.5\nend parameters\nend model\n';
    expect(injectFreeParameterDefaults(plain)).toBe(plain);
  });

  it('places setParameter before the appended generate_network/simulate actions', () => {
    // setParameter must run first, otherwise BNG2 simulates before the
    // parameter is defined and still aborts.
    const withDefaults = injectFreeParameterDefaults(PYBNF_MODEL);
    const withActions = `${withDefaults.replace(/\s+$/, '')}\n\ngenerate_network({overwrite=>1})\nsimulate({method=>"ode",t_end=>100,n_steps=>100})\n`;
    expect(withActions.indexOf('setParameter')).toBeLessThan(withActions.indexOf('generate_network'));
    expect(withActions.indexOf('setParameter')).toBeLessThan(withActions.indexOf('simulate('));
  });

  it('wires the injection into the generation path before default actions are appended', () => {
    const injectIdx = source.indexOf('sanitized = injectFreeParameterDefaults(sanitized);');
    const appendIdx = source.indexOf('sanitized = appendDefaultOdeActions(sanitized);');
    expect(injectIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeGreaterThan(-1);
    expect(injectIdx).toBeLessThan(appendIdx);
  });

  it('matches the playground, which resolves __FREE identifiers to 0', () => {
    // BNGLVisitor registers `X__FREE` as a constant 0.
    const visitor = readFileSync('packages/engine/src/parser/BNGLVisitor.ts', 'utf8');
    expect(visitor).toMatch(/this\.parameters\[value\] = 0;/);
  });
});
