import { describe, it, expect } from 'vitest';
import { buildSymbolicODESystem } from '@bngplayground/engine';
import type { BNGLReaction } from '../types';
import { symbolicODEToXPP } from '../services/exportODE';

/**
 * Tests for the XPPAUT `.ode` export.
 *
 * We drive symbolicODEToXPP() through the real engine assembly
 * (buildSymbolicODESystem, a pure function — no WASM needed) so the tests
 * exercise the same ODE construction the app uses. Correctness of each
 * dSi/dt is checked *numerically* (evaluate the RHS at a sample point and
 * compare to the hand-derived derivative) so the assertions do not depend on
 * term ordering or exact formatting, only on the mathematics.
 */

// --- helpers ------------------------------------------------------------

function rxn(partial: Partial<BNGLReaction> & Pick<BNGLReaction, 'reactants' | 'products' | 'rate' | 'rateConstant'>): BNGLReaction {
  return partial as BNGLReaction;
}

function makeOde(
  species: string[],
  reactions: BNGLReaction[],
  params: Record<string, number>,
  inits: number[],
  name = 'test',
): string {
  const parameterNames = Object.keys(params);
  const parameterValues = parameterNames.map((n) => params[n]);
  const system = buildSymbolicODESystem(species, reactions, parameterNames, inits, parameterValues);
  return symbolicODEToXPP(system, name);
}

/** Extract the ordered list of dS?/dt right-hand sides from the .ode text. */
function odeRhs(ode: string): string[] {
  return ode
    .split('\n')
    .filter((l) => /^dS\d+\/dt=/.test(l))
    .map((l) => l.replace(/^dS\d+\/dt=/, '').trim());
}

/** Evaluate an XPP RHS string at a binding of variable/parameter -> number. */
function evalExpr(expr: string, bind: Record<string, number>): number {
  let e = expr.replace(/\^/g, '**');
  // Substitute longest names first so S1 doesn't clobber S10, kd doesn't clobber kdim, etc.
  const names = Object.keys(bind).sort((a, b) => b.length - a.length);
  for (const nm of names) {
    e = e.split(nm).join(`(${bind[nm]})`);
  }
   
  return Function(`"use strict";return (${e});`)() as number;
}

function countLines(ode: string, re: RegExp): number {
  return ode.split('\n').filter((l) => re.test(l)).length;
}

// --- structural tests ---------------------------------------------------

describe('symbolicODEToXPP — structure', () => {
  const species = ['A', 'B', 'C'];
  const reactions = [
    rxn({ reactants: ['A', 'B'], products: ['C'], rate: 'k1', rateConstant: 0.3 }),
    rxn({ reactants: ['C'], products: ['A', 'B'], rate: 'k2', rateConstant: 0.7 }),
  ];
  const ode = makeOde(species, reactions, { k1: 0.3, k2: 0.7 }, [10, 5, 0], 'ab_c');

  it('emits one ODE per species', () => {
    expect(countLines(ode, /^dS\d+\/dt=/)).toBe(species.length);
  });

  it('emits one init per species', () => {
    expect(countLines(ode, /^init S\d+=/)).toBe(species.length);
  });

  it('emits one par per parameter', () => {
    expect(countLines(ode, /^par /)).toBe(2);
  });

  it('includes a legend line mapping every Si to its species pattern', () => {
    species.forEach((sp, i) => {
      expect(ode).toContain(`#   S${i + 1} = ${sp}`);
    });
  });

  it('terminates with a done statement', () => {
    expect(ode.trim().endsWith('done')).toBe(true);
  });

  it('uses indexed species variables, not raw BNGL patterns, in the equations', () => {
    // No raw species token like "A" should appear on an ODE RHS; they must be S1..Sn.
    for (const rhs of odeRhs(ode)) {
      expect(/\bS\d+\b/.test(rhs)).toBe(true);
    }
  });
});

// --- numeric correctness ------------------------------------------------

describe('symbolicODEToXPP — numeric correctness (A + B <-> C)', () => {
  const species = ['A', 'B', 'C'];
  const reactions = [
    rxn({ reactants: ['A', 'B'], products: ['C'], rate: 'k1', rateConstant: 0.3 }),
    rxn({ reactants: ['C'], products: ['A', 'B'], rate: 'k2', rateConstant: 0.7 }),
  ];
  const ode = makeOde(species, reactions, { k1: 0.3, k2: 0.7 }, [10, 5, 0]);
  const rhs = odeRhs(ode);

  it('reproduces the mass-action derivatives at a sample point', () => {
    const b = { S1: 4, S2: 3, S3: 2, k1: 0.3, k2: 0.7 };
    const dA = -b.k1 * b.S1 * b.S2 + b.k2 * b.S3;
    const dC = b.k1 * b.S1 * b.S2 - b.k2 * b.S3;
    expect(evalExpr(rhs[0], b)).toBeCloseTo(dA, 12); // dA/dt
    expect(evalExpr(rhs[1], b)).toBeCloseTo(dA, 12); // dB/dt (same as A)
    expect(evalExpr(rhs[2], b)).toBeCloseTo(dC, 12); // dC/dt
  });

  it('is correct across several random sample points', () => {
    for (let t = 0; t < 25; t++) {
      const S1 = Math.random() * 10, S2 = Math.random() * 10, S3 = Math.random() * 10;
      const b = { S1, S2, S3, k1: 0.3, k2: 0.7 };
      const dA = -0.3 * S1 * S2 + 0.7 * S3;
      const dC = 0.3 * S1 * S2 - 0.7 * S3;
      expect(evalExpr(rhs[0], b)).toBeCloseTo(dA, 10);
      expect(evalExpr(rhs[2], b)).toBeCloseTo(dC, 10);
    }
  });
});

describe('symbolicODEToXPP — synthesis, degradation, and a homodimer (stoichiometry 2)', () => {
  // 0 -> A (ks);  A -> 0 (kd);  2A -> D (kdim)
  const species = ['A', 'D'];
  const reactions = [
    rxn({ reactants: ['0'], products: ['A'], rate: 'ks', rateConstant: 1.0 }),
    rxn({ reactants: ['A'], products: ['0'], rate: 'kd', rateConstant: 0.2 }),
    rxn({ reactants: ['A', 'A'], products: ['D'], rate: 'kdim', rateConstant: 0.05 }),
  ];
  const ode = makeOde(species, reactions, { ks: 1.0, kd: 0.2, kdim: 0.05 }, [0, 0]);
  const rhs = odeRhs(ode);

  it('applies the correct stoichiometry (two A consumed per dimerization)', () => {
    const A = 6, D = 1;
    const b = { S1: A, S2: D, ks: 1.0, kd: 0.2, kdim: 0.05 };
    const dA = 1.0 - 0.2 * A - 2 * 0.05 * A * A; // synthesis - degradation - 2*(dimerization rate)
    const dD = 0.05 * A * A;
    expect(evalExpr(rhs[0], b)).toBeCloseTo(dA, 12);
    expect(evalExpr(rhs[1], b)).toBeCloseTo(dD, 12);
  });
});

describe('symbolicODEToXPP — catalytic reaction leaves the enzyme unchanged', () => {
  // E + S -> E + P  (enzyme E has net stoichiometry 0)
  const species = ['E', 'S', 'P'];
  const reactions = [
    rxn({ reactants: ['E', 'S'], products: ['E', 'P'], rate: 'kcat', rateConstant: 0.5 }),
  ];
  const ode = makeOde(species, reactions, { kcat: 0.5 }, [10, 100, 0]);
  const rhs = odeRhs(ode);

  it('gives dE/dt = 0 while S is consumed and P produced', () => {
    const b = { S1: 10, S2: 100, S3: 0, kcat: 0.5 };
    expect(evalExpr(rhs[0], b)).toBeCloseTo(0, 12);              // dE/dt = 0
    expect(evalExpr(rhs[1], b)).toBeCloseTo(-0.5 * 10 * 100, 12); // dS/dt
    expect(evalExpr(rhs[2], b)).toBeCloseTo(0.5 * 10 * 100, 12);  // dP/dt
  });
});

describe('symbolicODEToXPP — a species with no reactions has a zero derivative', () => {
  const species = ['A', 'B'];
  const reactions = [
    rxn({ reactants: ['A'], products: ['A'], rate: 'k', rateConstant: 1 }), // A unchanged; B never appears
  ];
  const ode = makeOde(species, reactions, { k: 1 }, [1, 5]);
  const rhs = odeRhs(ode);

  it('emits dB/dt = 0', () => {
    expect(evalExpr(rhs[1], { S1: 1, S2: 5, k: 1 })).toBeCloseTo(0, 12);
  });
});
