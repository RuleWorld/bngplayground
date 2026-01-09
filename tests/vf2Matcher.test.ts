// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { GraphMatcher } from '../src/services/graph/core/Matcher';
import { SpeciesGraph } from '../src/services/graph/core/SpeciesGraph';
import { Molecule } from '../src/services/graph/core/Molecule';
import { Component } from '../src/services/graph/core/Component';

const createComponent = (
  name: string,
  options: { state?: string; wildcard?: '+' | '?'; states?: string[] } = {}
) => {
  const comp = new Component(name, options.states ?? []);
  if (options.state) {
    comp.state = options.state;
  }
  if (options.wildcard) {
    comp.wildcard = options.wildcard;
  }
  return comp;
};

describe('GraphMatcher VF2++ integration', () => {
  it('matches wildcard-bound pattern components against any bound partner', () => {
    const pattern = new SpeciesGraph([
      new Molecule('A', [createComponent('dock', { wildcard: '+' })])
    ]);

    const target = new SpeciesGraph([
      new Molecule('A', [createComponent('dock')]),
      new Molecule('B', [createComponent('site')])
    ]);

    target.addBond(0, 0, 1, 0, 1);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
    expect(matches[0].moleculeMap.get(0)).toBe(0);
  });

  it('rejects mappings when bonded partners have incompatible molecule names', () => {
    const pattern = new SpeciesGraph([
      new Molecule('A', [createComponent('dock')]),
      new Molecule('B', [createComponent('site')])
    ]);
    pattern.addBond(0, 0, 1, 0, 1);

    const target = new SpeciesGraph([
      new Molecule('A', [createComponent('dock')]),
      new Molecule('C', [createComponent('site')])
    ]);
    target.addBond(0, 0, 1, 0, 1);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });

  it('maps repeated component names without over-pruning candidate domains', () => {
    const pattern = new SpeciesGraph([
      new Molecule('Complex', [createComponent('site'), createComponent('site')])
    ]);

    const target = new SpeciesGraph([
      new Molecule('Complex', [
        createComponent('site'),
        createComponent('site'),
        createComponent('extra')
      ])
    ]);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBeGreaterThan(0);
    const mappingValues = Array.from(matches[0].componentMap.values());
    expect(mappingValues.length).toBe(2);
    expect(new Set(mappingValues).size).toBe(2);
    mappingValues.forEach(key => {
      expect(key.startsWith('0.')).toBe(true);
    });
  });

  it('prunes mappings when the frontier demands labels absent from the target', () => {
    const pattern = new SpeciesGraph([
      new Molecule('Kinase', [createComponent('dock')]),
      new Molecule('Substrate', [createComponent('site')])
    ]);
    pattern.addBond(0, 0, 1, 0, 1);

    const target = new SpeciesGraph([
      new Molecule('Kinase', [createComponent('dock')]),
      new Molecule('Adaptor', [createComponent('site')])
    ]);
    target.addBond(0, 0, 1, 0, 1);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });

  it('matches bonds across compartments when pattern has no compartment constraints (cBNGL)', () => {
    // In cBNGL, molecules can be bonded across adjacent compartments (e.g., L@EC bound to R@PM)
    // A pattern without compartment annotations should match such targets
    const pattern = new SpeciesGraph([
      new Molecule('A', [createComponent('bind')]),
      new Molecule('B', [createComponent('bind')])
    ]);
    pattern.addBond(0, 0, 1, 0, 1);

    const target = new SpeciesGraph([
      new Molecule('A', [createComponent('bind')], 'cyto'),
      new Molecule('B', [createComponent('bind')], 'mito')
    ]);
    target.addBond(0, 0, 1, 0, 1);

    // Pattern without compartment constraints should match target with molecules in different compartments
    // Compartment adjacency validation is done at the NetworkGenerator level, not the Matcher level
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
  });

  it('matches multi-site phosphorylation patterns without starving candidates', () => {
    const pattern = new SpeciesGraph([
      new Molecule('RAF', [
        createComponent('phos1', { state: 'U', states: ['U', 'P'] }),
        createComponent('phos2', { state: 'U', states: ['U', 'P'] })
      ])
    ]);

    const target = new SpeciesGraph([
      new Molecule('RAF', [
        createComponent('phos1', { state: 'P', states: ['U', 'P'] }),
        createComponent('phos2', { state: 'U', states: ['U', 'P'] })
      ]),
      new Molecule('RAF', [
        createComponent('phos1', { state: 'U', states: ['U', 'P'] }),
        createComponent('phos2', { state: 'U', states: ['U', 'P'] })
      ])
    ]);

    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
    expect(matches[0].moleculeMap.get(0)).toBe(1);
  });
});

