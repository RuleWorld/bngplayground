// @ts-nocheck
import { BNGLParser } from '../../src/services/graph/core/BNGLParser';
import { GraphCanonicalizer } from '../../src/services/graph/core/Canonical';
import { GraphMatcher } from '../../src/services/graph/core/Matcher';
import { describe, it, expect } from 'vitest';
import {
  boundedReachabilityCheck,
  checkDeadlock,
  checkRuleFires,
} from '../../src/services/verification/BoundedVerifier';
import {
  parseMoleculeTokens,
  extractBindingRequirements,
  extractMoleculeNames,
  checkAbstractReachability,
  enumerateAbstractComplexes,
} from '../../src/services/verification/ContactMapReachability';
import { parseQuery } from '../../src/services/verification/QueryParser';

import {
  checkFiniteContactMap,
  fullReachabilityCheck,
  countReachableSpecies,
  fullDeadlockCheck,
} from '../../src/services/verification/SymmetryReducedVerifier';
import type { BNGLModel, BNGLMoleculeType, ReactionRule, BNGLSpecies } from '../../src/types';

/* ================================================================
 *  1. QueryParser tests
 * ================================================================ */
describe('QueryParser', () => {
  describe('reachable?', () => {
    it('parses a simple reachable query', () => {
      const q = parseQuery('reachable?(A(b!1).B(a!1))');
      expect(q).toEqual({ kind: 'reachable', pattern: 'A(b!1).B(a!1)' });
    });

    it('handles whitespace around parentheses', () => {
      const q = parseQuery('  reachable?( A(b!1).B(a!1) ) ');
      expect(q).toEqual({ kind: 'reachable', pattern: 'A(b!1).B(a!1)' });
    });

    it('handles nested parentheses in pattern', () => {
      const q = parseQuery('reachable?(A(b!1,s~u).B(a!1,c~p))');
      expect(q).toEqual({ kind: 'reachable', pattern: 'A(b!1,s~u).B(a!1,c~p)' });
    });

    it('throws on empty pattern', () => {
      expect(() => parseQuery('reachable?()')).toThrow('non-empty pattern');
    });
  });

  describe('never', () => {
    it('parses a never query', () => {
      const q = parseQuery('never(A(b!1).B(a!1))');
      expect(q).toEqual({ kind: 'never', pattern: 'A(b!1).B(a!1)' });
    });

    it('handles complex patterns', () => {
      const q = parseQuery('never(A(b!1,s~p).B(a!1).C(d~active))');
      expect(q).toEqual({ kind: 'never', pattern: 'A(b!1,s~p).B(a!1).C(d~active)' });
    });

    it('throws on empty pattern', () => {
      expect(() => parseQuery('never()')).toThrow('non-empty pattern');
    });
  });

  describe('fires?', () => {
    it('parses a fires query', () => {
      const q = parseQuery('fires?(rule_name)');
      expect(q).toEqual({ kind: 'fires', ruleName: 'rule_name' });
    });

    it('handles names with underscores and numbers', () => {
      const q = parseQuery('fires?(bind_A_B_2)');
      expect(q).toEqual({ kind: 'fires', ruleName: 'bind_A_B_2' });
    });

    it('throws on empty rule name', () => {
      expect(() => parseQuery('fires?()')).toThrow('non-empty rule name');
    });
  });

  describe('deadlock?', () => {
    it('parses deadlock? with question mark', () => {
      const q = parseQuery('deadlock?');
      expect(q).toEqual({ kind: 'deadlock' });
    });

    it('parses deadlock without question mark', () => {
      const q = parseQuery('deadlock');
      expect(q).toEqual({ kind: 'deadlock' });
    });

    it('is case insensitive', () => {
      const q = parseQuery('Deadlock?');
      expect(q).toEqual({ kind: 'deadlock' });
    });
  });

  describe('count_reachable', () => {
    it('parses a count_reachable query', () => {
      const q = parseQuery('count_reachable(A())');
      expect(q).toEqual({ kind: 'countReachable', moleculeType: 'A()' });
    });

    it('handles molecule types with components', () => {
      const q = parseQuery('count_reachable(A(b,s~u))');
      expect(q).toEqual({ kind: 'countReachable', moleculeType: 'A(b,s~u)' });
    });

    it('throws on empty argument', () => {
      expect(() => parseQuery('count_reachable()')).toThrow('non-empty molecule type');
    });
  });

  describe('always_eventually', () => {
    it('parses always/eventually query', () => {
      const q = parseQuery('always(A(s~u) => eventually(A(s~p)))');
      expect(q).toEqual({
        kind: 'always_eventually',
        premise: 'A(s~u)',
        conclusion: 'A(s~p)',
      });
    });

    it('handles complex premise and conclusion', () => {
      const q = parseQuery('always(A(b!1,s~u).B(a!1) => eventually(A(b!1,s~p).B(a!1)))');
      expect(q).toEqual({
        kind: 'always_eventually',
        premise: 'A(b!1,s~u).B(a!1)',
        conclusion: 'A(b!1,s~p).B(a!1)',
      });
    });

    it('throws when missing =>', () => {
      expect(() => parseQuery('always(A(s~u) eventually(A(s~p)))')).toThrow('=>');
    });

    it('throws when missing eventually', () => {
      expect(() => parseQuery('always(A(s~u) => A(s~p))')).toThrow('eventually');
    });
  });

  describe('error handling', () => {
    it('throws on empty input', () => {
      expect(() => parseQuery('')).toThrow('Empty');
    });

    it('throws on unrecognized query', () => {
      expect(() => parseQuery('bogus(A)')).toThrow('Unrecognized');
    });

    it('throws on unmatched parenthesis', () => {
      expect(() => parseQuery('reachable?(A(b!1).B(a!1)')).toThrow('Unmatched');
    });
  });
});

/* ================================================================
 *  2. ContactMapReachability tests
 * ================================================================ */
describe('ContactMapReachability', () => {
  // A simple A-B binding contact map
  const simpleContactMap: ContactMap = {
    nodes: [
      { moleculeType: 'A', component: 'b', states: [] },
      { moleculeType: 'B', component: 'a', states: [] },
    ],
    edges: [
      {
        source: { moleculeType: 'A', component: 'b' },
        target: { moleculeType: 'B', component: 'a' },
        ruleNames: ['bind_AB'],
      },
    ],
  };

  const simpleMolTypes: BNGLMoleculeType[] = [
    { name: 'A', components: ['b'] },
    { name: 'B', components: ['a'] },
  ];

  describe('checkAbstractReachability', () => {
    it('reports reachable when binding edge exists', () => {
      const result = checkAbstractReachability(
        simpleContactMap,
        'A(b!1).B(a!1)',
        simpleMolTypes
      );
      expect(result.reachable).toBe(true);
      expect(result.path).toBeDefined();
    });

    it('reports unreachable when no binding edge exists', () => {
      const result = checkAbstractReachability(
        simpleContactMap,
        'A(b!1).A(b!1)',  // A-A binding doesn't exist in contact map
        [...simpleMolTypes]
      );
      expect(result.reachable).toBe(false);
      expect(result.missingEdges).toBeDefined();
      expect(result.missingEdges!.length).toBeGreaterThan(0);
    });

    it('reports unreachable for undeclared molecule type', () => {
      const result = checkAbstractReachability(
        simpleContactMap,
        'C(x!1).A(b!1)',
        simpleMolTypes
      );
      expect(result.reachable).toBe(false);
    });

    it('reports reachable for single molecule (no binding needed)', () => {
      const result = checkAbstractReachability(
        simpleContactMap,
        'A(b)',
        simpleMolTypes
      );
      expect(result.reachable).toBe(true);
    });

    it('identifies path through molecule types', () => {
      // A-B-C chain contact map
      const chainContactMap: ContactMap = {
        nodes: [
          { moleculeType: 'A', component: 'b' },
          { moleculeType: 'B', component: 'a' },
          { moleculeType: 'B', component: 'c' },
          { moleculeType: 'C', component: 'b' },
        ],
        edges: [
          {
            source: { moleculeType: 'A', component: 'b' },
            target: { moleculeType: 'B', component: 'a' },
            ruleNames: ['bind_AB'],
          },
          {
            source: { moleculeType: 'B', component: 'c' },
            target: { moleculeType: 'C', component: 'b' },
            ruleNames: ['bind_BC'],
          },
        ],
      };
      const chainMolTypes: BNGLMoleculeType[] = [
        { name: 'A', components: ['b'] },
        { name: 'B', components: ['a', 'c'] },
        { name: 'C', components: ['b'] },
      ];

      const result = checkAbstractReachability(
        chainContactMap,
        'A(b!1).B(a!1)',
        chainMolTypes
      );
      expect(result.reachable).toBe(true);
      expect(result.path).toContain('A');
      expect(result.path).toContain('B');
    });

    it('detects disconnected molecule types', () => {
      // Contact map with no edges
      const disconnectedMap: ContactMap = {
        nodes: [
          { moleculeType: 'X', component: 'a' },
          { moleculeType: 'Y', component: 'b' },
        ],
        edges: [],
      };
      const molTypes: BNGLMoleculeType[] = [
        { name: 'X', components: ['a'] },
        { name: 'Y', components: ['b'] },
      ];

      const result = checkAbstractReachability(
        disconnectedMap,
        'X(a!1).Y(b!1)',
        molTypes
      );
      expect(result.reachable).toBe(false);
    });
  });

  describe('enumerateAbstractComplexes', () => {
    it('enumerates single molecules', () => {
      const complexes = enumerateAbstractComplexes(simpleContactMap, 1);
      expect(complexes.length).toBe(2); // A and B
      expect(complexes).toContainEqual(['A']);
      expect(complexes).toContainEqual(['B']);
    });

    it('enumerates size-2 complexes', () => {
      const complexes = enumerateAbstractComplexes(simpleContactMap, 2);
      // Should have A, B, and A-B
      expect(complexes.length).toBeGreaterThanOrEqual(3);
      expect(complexes).toContainEqual(['A']);
      expect(complexes).toContainEqual(['B']);
      expect(complexes).toContainEqual(['A', 'B']);
    });

    it('handles empty contact map', () => {
      const emptyMap: ContactMap = { nodes: [], edges: [] };
      const complexes = enumerateAbstractComplexes(emptyMap, 5);
      expect(complexes).toEqual([]);
    });

    it('respects maxSize limit', () => {
      // 3-type contact map
      const triMap: ContactMap = {
        nodes: [
          { moleculeType: 'A', component: 'b' },
          { moleculeType: 'B', component: 'a' },
          { moleculeType: 'B', component: 'c' },
          { moleculeType: 'C', component: 'b' },
        ],
        edges: [
          { source: { moleculeType: 'A', component: 'b' }, target: { moleculeType: 'B', component: 'a' }, ruleNames: ['r1'] },
          { source: { moleculeType: 'B', component: 'c' }, target: { moleculeType: 'C', component: 'b' }, ruleNames: ['r2'] },
        ],
      };
      const complexes = enumerateAbstractComplexes(triMap, 2);
      for (const c of complexes) {
        expect(c.length).toBeLessThanOrEqual(2);
      }
    });
  });
});

/* ================================================================
 *  3. BoundedVerifier tests
 * ================================================================ */
describe('BoundedVerifier', () => {
  describe('BNGLParser.parseSpeciesGraph', () => {
    it('parses a simple molecule', () => {
      const mols = BNGLParser.parseSpeciesGraph('A(b)', true);
      expect(mols.molecules).toHaveLength(1);
      expect(mols.molecules[0].name).toBe('A');
      expect(mols.molecules[0].components).toHaveLength(1);
      expect(mols.molecules[0].components[0].name).toBe('b');
    });

    it('parses a complex with bonds', () => {
      const mols = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)', true);
      expect(mols.molecules).toHaveLength(2);
      expect(mols.molecules[0].name).toBe('A');
      expect(Array.from(mols.molecules[0].components[0].edges.keys())[0]).toBe(1);
      expect(mols.molecules[1].name).toBe('B');
      expect(Array.from(mols.molecules[1].components[0].edges.keys())[0]).toBe(1);
    });

    it('parses states and bonds together', () => {
      const mols = BNGLParser.parseSpeciesGraph('A(s~u,b!1).B(a!1)', true);
      expect(mols.molecules[0].components).toHaveLength(2);
      const sComp = mols.molecules[0].components.find(c => c.name === 's');
      expect(sComp?.state).toBe('u');
      const bComp = mols.molecules[0].components.find(c => c.name === 'b');
      expect(Array.from(bComp?.edges.keys())[0]).toBe(1);
    });

    it('parses molecule with no components', () => {
      const mols = BNGLParser.parseSpeciesGraph('Trash()', true);
      expect(mols.molecules).toHaveLength(1);
      expect(mols.molecules[0].name).toBe('Trash');
      expect(mols.molecules[0].components).toHaveLength(0);
    });
  });

  describe('GraphCanonicalizer.canonicalize', () => {
    it('produces same canonical form for reordered molecules', () => {
      const m1 = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)', true);
      const m2 = BNGLParser.parseSpeciesGraph('B(a!1).A(b!1)', true);
      expect(GraphCanonicalizer.canonicalize(m1)).toBe(GraphCanonicalizer.canonicalize(m2));
    });

    it('distinguishes different species', () => {
      const m1 = BNGLParser.parseSpeciesGraph('A(s~u)', true);
      const m2 = BNGLParser.parseSpeciesGraph('A(s~p)', true);
      expect(GraphCanonicalizer.canonicalize(m1)).not.toBe(GraphCanonicalizer.canonicalize(m2));
    });
  });

  describe('GraphMatcher.matchesPattern', () => {
    it('matches identical species', () => {
      const species = BNGLParser.parseSpeciesGraph('A(b!1,s~u).B(a!1)', true);
      const pattern = BNGLParser.parseSpeciesGraph('A(b!1,s~u).B(a!1)', true);
      expect(GraphMatcher.matchesPattern(pattern, species)).toBe(true);
    });

    it('matches with wildcard state (pattern omits state)', () => {
      const species = BNGLParser.parseSpeciesGraph('A(s~u)', true);
      const pattern = BNGLParser.parseSpeciesGraph('A(s)', true);
      // Pattern doesn't specify state, so any state matches
      expect(GraphMatcher.matchesPattern(pattern, species)).toBe(true);
    });

    it('rejects wrong state', () => {
      const species = BNGLParser.parseSpeciesGraph('A(s~u)', true);
      const pattern = BNGLParser.parseSpeciesGraph('A(s~p)', true);
      expect(GraphMatcher.matchesPattern(pattern, species)).toBe(false);
    });

    it('matches when pattern is subset of species', () => {
      const species = BNGLParser.parseSpeciesGraph('A(b!1,s~u).B(a!1)', true);
      const pattern = BNGLParser.parseSpeciesGraph('A(s~u)', true);
      expect(GraphMatcher.matchesPattern(pattern, species)).toBe(true);
    });

    it('rejects when pattern requires more molecules', () => {
      const species = BNGLParser.parseSpeciesGraph('A(b)', true);
      const pattern = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)', true);
      expect(GraphMatcher.matchesPattern(pattern, species)).toBe(false);
    });
  });

  describe('boundedReachabilityCheck', () => {
    it('finds species reachable from seed', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [
          { name: 'A', components: ['b', 's'] },
          { name: 'B', components: ['a'] },
        ],
        species: [
          { name: 'A(b,s~u)', initialConcentration: 100 },
          { name: 'B(a)', initialConcentration: 100 },
        ],
        observables: [],
        reactionRules: [
          {
            name: 'bind',
            reactants: ['A(b)', 'B(a)'],
            products: ['A(b!1,s~u).B(a!1)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      const result = boundedReachabilityCheck(model, 'A(b!1).B(a!1)');
      expect(result.reachable).toBe(true);
      expect(result.witness).toBeDefined();
      expect(result.witness!.speciesString).toBeDefined();
    });

    it('detects when pattern is already in seed species', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~p)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [],
      };

      const result = boundedReachabilityCheck(model, 'A(s~p)');
      expect(result.reachable).toBe(true);
      expect(result.witness!.generatingRuleSequence).toContain('(seed species)');
    });

    it('reports unreachable when no matching rule exists', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [],
      };

      const result = boundedReachabilityCheck(model, 'A(s~p)', { maxIterations: 10 });
      expect(result.reachable).toBe(false);
      expect(result.explorationComplete).toBe(true);
    });

    it('respects maxSpecies limit', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'modify',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      const result = boundedReachabilityCheck(model, 'NONEXISTENT()', { maxSpecies: 5, maxIterations: 3 });
      expect(result.reachable).toBe(false);
    });
  });

  describe('checkDeadlock', () => {
    it('detects deadlock when no rules can fire', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~p)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'modify',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      // The only rule requires A(s~u) but seed only has A(s~p)
      const result = checkDeadlock(model);
      expect(result.hasDeadlock).toBe(true);
      expect(result.deadlockState).toBeDefined();
    });

    it('reports no deadlock when rules can fire', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'modify',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: true,
            reverseRate: '1',
          },
        ],
      };

      const result = checkDeadlock(model);
      expect(result.hasDeadlock).toBe(false);
    });
  });

  describe('checkRuleFires', () => {
    it('detects when a rule can fire on seed species', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'phosphorylate',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      const result = checkRuleFires(model, 'phosphorylate');
      expect(result.fires).toBe(true);
      expect(result.matchingSpecies).toBeDefined();
    });

    it('reports not firing when rule name does not exist', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [],
      };

      const result = checkRuleFires(model, 'nonexistent_rule');
      expect(result.fires).toBe(false);
    });

    it('detects rule firing after network expansion', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [
          { name: 'A', components: ['b', 's'] },
          { name: 'B', components: ['a'] },
        ],
        species: [
          { name: 'A(b,s~u)', initialConcentration: 100 },
          { name: 'B(a)', initialConcentration: 100 },
        ],
        observables: [],
        reactionRules: [
          {
            name: 'bind',
            reactants: ['A(b)', 'B(a)'],
            products: ['A(b!1,s~u).B(a!1)'],
            rate: '1',
            isBidirectional: false,
          },
          {
            name: 'phosphorylate_bound',
            reactants: ['A(b!1,s~u).B(a!1)'],
            products: ['A(b!1,s~p).B(a!1)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      // phosphorylate_bound requires A-B complex, which isn't in seed
      // but can be generated by the bind rule
      const result = checkRuleFires(model, 'phosphorylate_bound');
      expect(result.fires).toBe(true);
    });
  });
});

/* ================================================================
 *  4. SymmetryReducedVerifier tests
 * ================================================================ */
describe('SymmetryReducedVerifier', () => {
  describe('checkFiniteContactMap', () => {
    it('detects finite contact map (no self-loops)', () => {
      const finiteMap: ContactMap = {
        nodes: [
          { moleculeType: 'A', component: 'b' },
          { moleculeType: 'B', component: 'a' },
        ],
        edges: [
          {
            source: { moleculeType: 'A', component: 'b' },
            target: { moleculeType: 'B', component: 'a' },
            ruleNames: ['bind'],
          },
        ],
      };

      const result = checkFiniteContactMap(finiteMap);
      expect(result.isFinite).toBe(true);
    });

    it('detects infinite contact map from polymerization', () => {
      // Molecule L with two binding sites: can form L-L-L-... chains
      const polymerMap: ContactMap = {
        nodes: [
          { moleculeType: 'L', component: 'r' },
          { moleculeType: 'L', component: 'l' },
        ],
        edges: [
          {
            source: { moleculeType: 'L', component: 'r' },
            target: { moleculeType: 'L', component: 'l' },
            ruleNames: ['polymerize'],
          },
        ],
      };

      const result = checkFiniteContactMap(polymerMap);
      expect(result.isFinite).toBe(false);
      expect(result.polymerizingTypes).toContain('L');
    });

    it('does not flag same-component self-binding as infinite', () => {
      // A(a!1).A(a!1) is at most a dimer
      const dimerMap: ContactMap = {
        nodes: [{ moleculeType: 'A', component: 'a' }],
        edges: [
          {
            source: { moleculeType: 'A', component: 'a' },
            target: { moleculeType: 'A', component: 'a' },
            ruleNames: ['dimerize'],
          },
        ],
      };

      const result = checkFiniteContactMap(dimerMap);
      expect(result.isFinite).toBe(true);
    });
  });

  describe('fullReachabilityCheck', () => {
    it('returns exact confidence for small finite models', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~u)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'modify',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      const finiteMap: ContactMap = {
        nodes: [{ moleculeType: 'A', component: 's', states: ['u', 'p'] }],
        edges: [],
      };

      const result = fullReachabilityCheck(model, 'A(s~p)', finiteMap);
      expect(result.reachable).toBe(true);
      expect(result.witness).toBeDefined();
    });

    it('uses contact map to prune unreachable patterns early', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [
          { name: 'A', components: ['b'] },
          { name: 'B', components: ['a'] },
        ],
        species: [
          { name: 'A(b)', initialConcentration: 100 },
          { name: 'B(a)', initialConcentration: 100 },
        ],
        observables: [],
        reactionRules: [],
      };

      // Contact map with no edges: A(b!1).B(a!1) is unreachable
      const emptyEdgeMap: ContactMap = {
        nodes: [
          { moleculeType: 'A', component: 'b' },
          { moleculeType: 'B', component: 'a' },
        ],
        edges: [],
      };

      const result = fullReachabilityCheck(model, 'A(b!1).B(a!1)', emptyEdgeMap);
      expect(result.reachable).toBe(false);
      expect(result.confidence).toBe('exact');
      expect(result.speciesExplored).toBe(0); // Pruned early
    });
  });

  describe('fullDeadlockCheck', () => {
    it('detects deadlock with exact confidence', () => {
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [{ name: 'A', components: ['s'] }],
        species: [{ name: 'A(s~p)', initialConcentration: 100 }],
        observables: [],
        reactionRules: [
          {
            name: 'modify',
            reactants: ['A(s~u)'],
            products: ['A(s~p)'],
            rate: '1',
            isBidirectional: false,
          },
        ],
      };

      const result = fullDeadlockCheck(model);
      expect(result.hasDeadlock).toBe(true);
    });
  });
});

/* ================================================================
 *  5. Cross-layer consistency tests
 * ================================================================ */
describe('Cross-layer consistency', () => {
  it('all layers agree on reachable A-B complex', () => {
    const contactMap: ContactMap = {
      nodes: [
        { moleculeType: 'A', component: 'b' },
        { moleculeType: 'B', component: 'a' },
      ],
      edges: [
        {
          source: { moleculeType: 'A', component: 'b' },
          target: { moleculeType: 'B', component: 'a' },
          ruleNames: ['bind'],
        },
      ],
    };

    const molTypes: BNGLMoleculeType[] = [
      { name: 'A', components: ['b'] },
      { name: 'B', components: ['a'] },
    ];

    const model: BNGLModel = {
      parameters: {},
      moleculeTypes: molTypes,
      species: [
        { name: 'A(b)', initialConcentration: 100 },
        { name: 'B(a)', initialConcentration: 100 },
      ],
      observables: [],
      reactionRules: [
        {
          name: 'bind',
          reactants: ['A(b)', 'B(a)'],
          products: ['A(b!1,s~u).B(a!1)'],
          rate: '1',
          isBidirectional: false,
        },
      ],
    };

    const pattern = 'A(b!1).B(a!1)';

    // Layer 1: Contact map
    const layer1 = checkAbstractReachability(contactMap, pattern, molTypes);
    expect(layer1.reachable).toBe(true);

    // Layer 2: Bounded verification
    const layer2 = boundedReachabilityCheck(model, pattern);
    expect(layer2.reachable).toBe(true);

    // Layer 3: Full verification
    const layer3 = fullReachabilityCheck(model, pattern, contactMap);
    expect(layer3.reachable).toBe(true);
  });

  it('all layers agree on unreachable pattern', () => {
    const contactMap: ContactMap = {
      nodes: [
        { moleculeType: 'A', component: 'b' },
        { moleculeType: 'B', component: 'a' },
      ],
      edges: [
        {
          source: { moleculeType: 'A', component: 'b' },
          target: { moleculeType: 'B', component: 'a' },
          ruleNames: ['bind'],
        },
      ],
    };

    const molTypes: BNGLMoleculeType[] = [
      { name: 'A', components: ['b'] },
      { name: 'B', components: ['a'] },
      { name: 'C', components: ['x'] },
    ];

    const model: BNGLModel = {
      parameters: {},
      moleculeTypes: molTypes,
      species: [
        { name: 'A(b)', initialConcentration: 100 },
        { name: 'B(a)', initialConcentration: 100 },
      ],
      observables: [],
      reactionRules: [
        {
          name: 'bind',
          reactants: ['A(b)', 'B(a)'],
          products: ['A(b!1).B(a!1)'],
          rate: '1',
          isBidirectional: false,
        },
      ],
    };

    // Pattern requiring A-C binding which doesn't exist in contact map
    const pattern = 'A(b!1).C(x!1)';

    // Layer 1: Contact map
    const layer1 = checkAbstractReachability(contactMap, pattern, molTypes);
    expect(layer1.reachable).toBe(false);

    // Layer 2: Bounded verification (C not even in seeds)
    const layer2 = boundedReachabilityCheck(model, pattern, { maxIterations: 10 });
    expect(layer2.reachable).toBe(false);

    // Layer 3: Full verification with contact map shortcut
    const layer3 = fullReachabilityCheck(model, pattern, contactMap);
    expect(layer3.reachable).toBe(false);
  });

  it('phosphorylation model: all layers consistent', () => {
    const contactMap: ContactMap = {
      nodes: [
        { moleculeType: 'K', component: 's', states: ['u', 'p'] },
      ],
      edges: [],
    };

    const molTypes: BNGLMoleculeType[] = [
      { name: 'K', components: ['s'] },
    ];

    const model: BNGLModel = {
      parameters: {},
      moleculeTypes: molTypes,
      species: [{ name: 'K(s~u)', initialConcentration: 100 }],
      observables: [],
      reactionRules: [
        {
          name: 'phosphorylate',
          reactants: ['K(s~u)'],
          products: ['K(s~p)'],
          rate: '1',
          isBidirectional: true,
          reverseRate: '0.5',
        },
      ],
    };

    // K(s~p) should be reachable
    const layer1 = checkAbstractReachability(contactMap, 'K(s~p)', molTypes);
    expect(layer1.reachable).toBe(true); // Single molecule, always abstractly reachable

    const layer2 = boundedReachabilityCheck(model, 'K(s~p)');
    expect(layer2.reachable).toBe(true);

    const layer3 = fullReachabilityCheck(model, 'K(s~p)', contactMap);
    expect(layer3.reachable).toBe(true);

    // No deadlock since bidirectional rule always applies
    const deadlock2 = checkDeadlock(model);
    expect(deadlock2.hasDeadlock).toBe(false);
  });
});
