// @ts-nocheck
import { beforeAll, describe, expect, it } from 'vitest';

import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import { Component } from '../src/services/graph/core/Component';
import { Molecule } from '../src/services/graph/core/Molecule';
import { NautyService } from '../src/services/graph/core/NautyService';
import { SpeciesGraph } from '../src/services/graph/core/SpeciesGraph';

function buildDoubleBondWithTail(order: 'order1' | 'order2'): SpeciesGraph {
  // R has 3 sites; two are used to double-bond to the other R, and one binds an S tail.
  const makeR = (): Molecule => new Molecule('R', [new Component('a'), new Component('b'), new Component('c')]);
  const makeS = (): Molecule => new Molecule('S', [new Component('s')]);

  if (order === 'order1') {
    // Indices: 0=R(head), 1=R(tail), 2=S
    const g = new SpeciesGraph([makeR(), makeR(), makeS()]);
    g.addBond(0, 0, 1, 0, 1); // head.a - tail.a
    g.addBond(0, 1, 1, 1, 2); // head.b - tail.b
    g.addBond(0, 2, 2, 0, 3); // head.c - S.s
    return g;
  }

  // order2: Indices permuted: 0=S, 1=R(tail), 2=R(head)
  const g = new SpeciesGraph([makeS(), makeR(), makeR()]);
  g.addBond(2, 0, 1, 0, 1); // head.a - tail.a
  g.addBond(2, 1, 1, 1, 2); // head.b - tail.b
  g.addBond(2, 2, 0, 0, 3); // head.c - S.s
  return g;
}

describe('Nauty canonicalization', () => {
  beforeAll(async () => {
    await NautyService.getInstance().init();
  });

  it('is invariant under molecule renumbering (double bond + tail)', () => {
    const nauty = NautyService.getInstance();
    if (!nauty.isInitialized) {
      // If Nauty WASM cannot load in this environment, skip rather than fail.
      return;
    }

    const g1 = buildDoubleBondWithTail('order1');
    const g2 = buildDoubleBondWithTail('order2');

    const c1 = GraphCanonicalizer.canonicalize(g1);
    const c2 = GraphCanonicalizer.canonicalize(g2);

    expect(c2).toEqual(c1);
  });

  it('is deterministic across repeated constructions', () => {
    const nauty = NautyService.getInstance();
    if (!nauty.isInitialized) {
      return;
    }

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const g = buildDoubleBondWithTail(i % 2 === 0 ? 'order1' : 'order2');
      results.add(GraphCanonicalizer.canonicalize(g));
    }

    expect(results.size).toBe(1);
  });

  it('handles ≥1025-molecule species without color overflow (C-1 regression)', () => {
    // Build a linear homopolymer chain of 1025 identical A(a) molecules.
    // WL color ranks reach ≥1024, which overflowed the 10-bit color field
    // in the prior shift-based encoding.
    const N = 1025;
    const mols1: Molecule[] = [];
    for (let i = 0; i < N; i++) {
      mols1.push(new Molecule('A', [new Component('a')]));
    }
    const g1 = new SpeciesGraph(mols1);
    for (let i = 0; i < N - 1; i++) {
      g1.addBond(i, 0, i + 1, 0);
    }

    // Same chain with molecules in reverse order
    const mols2: Molecule[] = [];
    for (let i = 0; i < N; i++) {
      mols2.push(new Molecule('A', [new Component('a')]));
    }
    const g2 = new SpeciesGraph(mols2);
    for (let i = 0; i < N - 1; i++) {
      g2.addBond(N - 1 - i, 0, N - 2 - i, 0);
    }

    const c1 = GraphCanonicalizer.canonicalize(g1);
    const c2 = GraphCanonicalizer.canonicalize(g2);
    expect(c1).toEqual(c2);
  });

  it('handles intramolecular bonds correctly in WL refinement (C-3 regression)', () => {
    // Single molecule with an intramolecular bond: A(a!1,b!1)
    // Self-bond (m1 === m2) must contribute two half-edges in the WL signature.
    const g = new SpeciesGraph([new Molecule('A', [new Component('a'), new Component('b')])]);
    g.addBond(0, 0, 0, 1);

    // Should not throw and produce a deterministic result
    const result = GraphCanonicalizer.canonicalize(g);
    expect(result).toBeTruthy();

    // Verify invariance: build the same graph with swapped component order
    const g2 = new SpeciesGraph([new Molecule('A', [new Component('b'), new Component('a')])]);
    g2.addBond(0, 0, 0, 1); // b bonded to a
    const result2 = GraphCanonicalizer.canonicalize(g2);
    expect(result2).toEqual(result);
  });
});

