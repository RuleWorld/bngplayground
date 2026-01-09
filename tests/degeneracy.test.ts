// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SpeciesGraph } from '../src/services/graph/core/SpeciesGraph';
import { Molecule } from '../src/services/graph/core/Molecule';
import { Component } from '../src/services/graph/core/Component';
import { GraphMatcher } from '../src/services/graph/core/Matcher';
import { countEmbeddingDegeneracy } from '../src/services/graph/core/degeneracy';

const comp = (name: string) => new Component(name);

describe('Embedding degeneracy', () => {
  it('detects automorphisms for symmetric reactant patterns', () => {
    const pattern = new SpeciesGraph([
      new Molecule('A', [comp('site')]),
      new Molecule('A', [comp('site')])
    ]);

    const target = new SpeciesGraph([
      new Molecule('A', [comp('site')]),
      new Molecule('A', [comp('site')])
    ]);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(2);

    const degeneracy = countEmbeddingDegeneracy(pattern, target, matches[0]);
    expect(degeneracy).toBe(1);
  });
});

