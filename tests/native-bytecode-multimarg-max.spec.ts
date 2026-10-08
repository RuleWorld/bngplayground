/**
 * Native-bytecode parity for a rate law that uses a 3-argument `max()`.
 *
 * `max(A,B,C)` used to compile to a single MAX opcode, so the native bytecode
 * path and the JS rate path disagreed on the same model. This test runs the
 * same model both ways and requires identical trajectories.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { generateExpandedNetwork, simulate } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const maybeIt = hasCvode ? it : it.skip;

// A + B -> C gated by a 3-argument max, so the rate law exercises the
// variadic fold on both the native and the JS side.
const MODEL = `
begin parameters
  k1 0.7
end parameters

begin species
  A() 10
  B() 4
  C() 0
end species

begin observables
  Molecules Ac A()
  Molecules Bc B()
end observables

begin reactions
  A() + B() -> C() k1*max(Ac,Bc,1)
end reactions
`;

describe('native bytecode parity — variadic max() rate law', () => {
  maybeIt('produces the same trajectory with and without native bytecode', async () => {
    const warnings: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    const parsed = parseBNGL(MODEL);
    const expanded = await generateExpandedNetwork(parsed as any, () => {}, () => {});
    const model = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: (expanded as any).concreteObservables,
    };

    const callbacks = { checkCancelled() {}, postMessage() {} };
    const baseOptions = {
      method: 'ode',
      solver: 'auto',
      t_end: 5,
      n_steps: 100,
    } as const;

    const native = await simulate(1, model as any, {
      ...baseOptions,
      enableNativeBytecode: true,
    } as any, callbacks as any);

    const fallback = await simulate(2, model as any, {
      ...baseOptions,
      disableNativeBytecode: true,
    } as any, callbacks as any);

    expect(native.data).toHaveLength(101);
    expect(fallback.data).toHaveLength(101);

    const nativeLast = native.data[native.data.length - 1] as Record<string, number>;
    const fallbackLast = fallback.data[fallback.data.length - 1] as Record<string, number>;

    expect(nativeLast.time).toBeCloseTo(5, 10);
    // A wrong-arity max() makes the native rate k1*max(Bc,1) instead of
    // k1*max(Ac,Bc,1), which diverges by an order of magnitude here.
    expect(nativeLast.Ac).toBeCloseTo(fallbackLast.Ac, 8);
    expect(nativeLast.Bc).toBeCloseTo(fallbackLast.Bc, 8);
    // The reaction must actually have run, so the comparison is not trivially
    // satisfied by two identical no-op trajectories.
    expect(fallbackLast.Ac).toBeGreaterThan(0);
    expect(fallbackLast.Ac).toBeLessThan(10);

    // Guard against a vacuous pass: if the native bytecode path had silently
    // fallen back to JS, both runs would use the same evaluator and this
    // comparison would prove nothing.
    expect(warnings.filter(w => /falling back|Failed to compile bytecode/i.test(w))).toEqual([]);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});