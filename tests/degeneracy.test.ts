// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SpeciesGraph } from '../packages/engine/src/services/graph/core/SpeciesGraph';
import { Molecule } from '../packages/engine/src/services/graph/core/Molecule';
import { Component } from '../packages/engine/src/services/graph/core/Component';
import { GraphMatcher } from '../packages/engine/src/services/graph/core/Matcher';
import { countEmbeddingDegeneracy, countRxnCenterImages } from '../packages/engine/src/services/graph/core/degeneracy';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';

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

describe('Reaction-centre image count (BioNetGen filter_identical_by_rxn_center)', () => {
  // SpeciesGraph.pm:3251-3270 — a pattern component with no bonds may only map
  // onto a free target site (`else { next; }`). Verified against
  // SpeciesGraph::isomorphicToSubgraph: `A(b!1).B(c).C(c!1)` has zero embeddings
  // in `A(b!1).B(c!2).C(c!1).D(b!2)`.
  it('rejects a bondless pattern component that would land on a bound site', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1).B(c).C(c!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1).B(c!2).C(c!1).D(b!2)');
    expect(GraphMatcher.findAllMaps(pattern, target)).toHaveLength(0);
  });

  it('collapses spectator permutations onto the number of distinct centre images', () => {
    // Three free `b` sites; the rule bonds whichever one the pattern's
    // component 0.2 lands on. SpeciesGraph::isomorphicToSubgraph returns all
    // 3! = 6 embeddings, and filter_identical_by_rxn_center keeps 3 — one per
    // image of the reaction centre.
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const [match] = GraphMatcher.findAllMaps(pattern, target);

    expect(countEmbeddingDegeneracy(pattern, target, match)).toBe(6);
    expect(countRxnCenterImages(pattern, target, match, ['0.0.2'], 0, 20000)).toBe(3);
  });

  it('reports a single image when the centre is pinned by a bond label', () => {
    // Same free-site permutation, but the reaction centre is component 0.0,
    // which is pinned to target component 0.0 by its `!1` bond.
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const [match] = GraphMatcher.findAllMaps(pattern, target);

    expect(countRxnCenterImages(pattern, target, match, ['0.0.0'], 0, 20000)).toBe(1);
  });

  it('returns null rather than a truncated answer when the budget is exhausted', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1,b!2,b,b,b).C(b!1)');
    const [match] = GraphMatcher.findAllMaps(pattern, target);

    expect(countRxnCenterImages(pattern, target, match, ['0.0.2'], 0, 2)).toBeNull();
  });
});

