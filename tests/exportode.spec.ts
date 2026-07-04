import { describe, it, expect } from 'vitest';
import { buildSymbolicODESystem } from '@bngplayground/engine';
import type { BNGLReaction } from '@bngplayground/engine';
import { symbolicODEToXPP } from '../services/exportODE';

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

function odeRhs(ode: string): string[] {
  return ode
    .split('\n')
    .filter((l) => /^dS\d+\/dt=/.test(l))
    .map((l) => l.replace(/^dS\d+\/dt=/, '').trim());
}

function evalExpr(expr: string, bind: Record<string, number>): number {
  let e = expr.replace(/\^/g, '**');
  const names = Object.keys(bind).sort((a, b) => b.length - a.length);
  for (const nm of names) {
    e = e.split(nm).join(`(${bind[nm]})`);
  }
  // eslint-disable-next-line no-new-func
  return Function(`"use strict";return (${e});`)() as number;
}

function countLines(ode: string, re: RegExp): number {
  return ode.split('\n').filter((l) => re.test(l)).length;
}

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
    for (const rhs of odeRhs(ode)) {
      expect(/\bS\d+\b/.test(rhs)).toBe(true);
    }
  });
});

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
    expect(evalExpr(rhs[0], b)).toBeCloseTo(dA, 12);
    expect(evalExpr(rhs[1], b)).toBeCloseTo(dA, 12);
    expect(evalExpr(rhs[2], b)).toBeCloseTo(dC, 12);
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
    const dA = 1.0 - 0.2 * A - 2 * 0.05 * A * A;
    const dD = 0.05 * A * A;
    expect(evalExpr(rhs[0], b)).toBeCloseTo(dA, 12);
    expect(evalExpr(rhs[1], b)).toBeCloseTo(dD, 12);
  });
});

describe('symbolicODEToXPP — catalytic reaction leaves the enzyme unchanged', () => {
  const species = ['E', 'S', 'P'];
  const reactions = [
    rxn({ reactants: ['E', 'S'], products: ['E', 'P'], rate: 'kcat', rateConstant: 0.5 }),
  ];
  const ode = makeOde(species, reactions, { kcat: 0.5 }, [10, 100, 0]);
  const rhs = odeRhs(ode);

  it('gives dE/dt = 0 while S is consumed and P produced', () => {
    const b = { S1: 10, S2: 100, S3: 0, kcat: 0.5 };
    expect(evalExpr(rhs[0], b)).toBeCloseTo(0, 12);
    expect(evalExpr(rhs[1], b)).toBeCloseTo(-0.5 * 10 * 100, 12);
    expect(evalExpr(rhs[2], b)).toBeCloseTo(0.5 * 10 * 100, 12);
  });
});

describe('symbolicODEToXPP — a species with no reactions has a zero derivative', () => {
  const species = ['A', 'B'];
  const reactions = [
    rxn({ reactants: ['A'], products: ['A'], rate: 'k', rateConstant: 1 }),
  ];
  const ode = makeOde(species, reactions, { k: 1 }, [1, 5]);
  const rhs = odeRhs(ode);

  it('emits dB/dt = 0', () => {
    expect(evalExpr(rhs[1], { S1: 1, S2: 5, k: 1 })).toBeCloseTo(0, 12);
  });
});
