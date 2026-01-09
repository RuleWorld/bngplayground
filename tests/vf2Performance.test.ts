// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { performance } from 'perf_hooks';
import { GraphMatcher } from '../src/services/graph/core/Matcher';
import { SpeciesGraph } from '../src/services/graph/core/SpeciesGraph';
import { Molecule } from '../src/services/graph/core/Molecule';
import { Component } from '../src/services/graph/core/Component';

const makeComponent = (name: string) => new Component(name);

const buildChain = (_label: string, length: number): SpeciesGraph => {
  const molecules: Molecule[] = [];
  for (let i = 0; i < length; i++) {
    // Use same base name 'M' for pattern and target so names match
    molecules.push(new Molecule('M', [makeComponent('bind')]));
  }
  const graph = new SpeciesGraph(molecules);
  for (let i = 0; i < length - 1; i++) {
    graph.addBond(i, 0, i + 1, 0, i + 1);
  }
  return graph;
};

describe('GraphMatcher VF2++ performance', () => {
  it('matches medium-sized interaction chains within 200ms', () => {
    const pattern = buildChain('P', 6);
    const target = buildChain('T', 12);

    // add two extra branches to increase search complexity without changing connectivity
    const branch = new Molecule('M', [makeComponent('bind')]);
    target.molecules.push(branch);
    target.addBond(0, 0, target.molecules.length - 1, 0, 99);
    const branch2 = new Molecule('M', [makeComponent('bind')]);
    target.molecules.push(branch2);
    target.addBond(3, 0, target.molecules.length - 1, 0, 100);

    const start = performance.now();
    const matches = GraphMatcher.findAllMaps(pattern, target);
    const elapsed = performance.now() - start;

    expect(matches.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });
});

