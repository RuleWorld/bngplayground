// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SpeciesGraph } from '../src/services/graph/core/SpeciesGraph';
import { Molecule } from '../src/services/graph/core/Molecule';
import { Component } from '../src/services/graph/core/Component';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';

const comp = (name: string) => new Component(name);

describe('Graph canonicalization', () => {
  it('produces identical keys for molecule permutations', () => {
    const g1 = new SpeciesGraph([
      new Molecule('A', [comp('x')]),
      new Molecule('B', [comp('y')])
    ]);

    const g2 = new SpeciesGraph([
      new Molecule('B', [comp('y')]),
      new Molecule('A', [comp('x')])
    ]);

    const key1 = GraphCanonicalizer.canonicalize(g1);
    const key2 = GraphCanonicalizer.canonicalize(g2);

    expect(key1).toBe(key2);
  });
});

