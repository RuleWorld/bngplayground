import { describe, expect, it } from 'vitest';
import {
  Component,
  GraphCanonicalizer,
  Molecule,
  NetworkGenerator,
  SpeciesGraph,
} from '@bngplayground/engine';

type Edge = readonly [number, number];

function regularGraph(edges: Edge[]): SpeciesGraph {
  const graph = new SpeciesGraph(
    Array.from({ length: 6 }, () => new Molecule('M', [
      new Component('x'),
      new Component('x'),
      new Component('x'),
    ]))
  );
  const nextSite = new Int32Array(6);
  for (let bond = 0; bond < edges.length; bond++) {
    const [a, b] = edges[bond];
    graph.addBond(a, nextSite[a]++, b, nextSite[b]++, bond + 1);
  }
  return graph;
}

function k33(): SpeciesGraph {
  return regularGraph([
    [0, 3], [0, 4], [0, 5],
    [1, 3], [1, 4], [1, 5],
    [2, 3], [2, 4], [2, 5],
  ]);
}

function triangularPrism(): SpeciesGraph {
  return regularGraph([
    [0, 1], [1, 2], [2, 0],
    [3, 4], [4, 5], [5, 3],
    [0, 3], [1, 4], [2, 5],
  ]);
}

describe('NetworkGenerator species identity', () => {
  it('does not merge non-isomorphic species with the same structural hash', async () => {
    const bipartite = k33();
    const prism = triangularPrism();

    expect(bipartite.getStructuralHash()).toBe(prism.getStructuralHash());
    expect(GraphCanonicalizer.canonicalize(bipartite)).not.toBe(
      GraphCanonicalizer.canonicalize(prism)
    );

    const result = await new NetworkGenerator().generate([bipartite, prism], []);
    expect(result.species).toHaveLength(2);
  });

  it('still merges exact duplicate bonded seed species', async () => {
    const graph = k33();
    const result = await new NetworkGenerator().generate([graph, graph.clone()], []);
    expect(result.species).toHaveLength(1);
  });
});
