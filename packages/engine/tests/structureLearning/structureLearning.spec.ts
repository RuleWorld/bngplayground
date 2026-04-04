import { describe, it, expect } from 'vitest';
import {
  enumerateRules,
  countCandidateRules,
  parseComponent,
  type CandidateRule,
  type EnumerationConfig,
} from '../../src/services/verification/RuleEnumerator';
import { filterCandidates } from '../../src/services/verification/CandidateFilter';
import {
  scoreStructure,
  assembleModelCode,
} from '../../src/services/verification/StructureScorer';
import {
  structureSearch,
  assembleModel,
  type StructureSearchConfig,
} from '../../src/services/inference/StructureABCSMC';
import type { BNGLMoleculeType } from '../../src/types';

// ── Shared fixtures ──────────────────────────────────────────────────

const twoMoleculeTypes: BNGLMoleculeType[] = [
  { name: 'A', components: ['s~u~p', 'b'] },
  { name: 'B', components: ['a', 'x~i~a'] },
];

const simpleMoleculeTypes: BNGLMoleculeType[] = [
  { name: 'X', components: ['s~u~p'] },
];

// ── RuleEnumerator tests ─────────────────────────────────────────────

describe('RuleEnumerator', () => {
  describe('parseComponent', () => {
    it('parses component with states', () => {
      const result = parseComponent('s~u~p');
      expect(result.name).toBe('s');
      expect(result.states).toEqual(['u', 'p']);
    });

    it('parses component without states', () => {
      const result = parseComponent('b');
      expect(result.name).toBe('b');
      expect(result.states).toEqual([]);
    });

    it('parses component with three states', () => {
      const result = parseComponent('s~u~p~pp');
      expect(result.name).toBe('s');
      expect(result.states).toEqual(['u', 'p', 'pp']);
    });
  });

  describe('enumerateRules with two molecule types', () => {
    it('generates the correct total number of rules', () => {
      const rules = enumerateRules(twoMoleculeTypes);
      const count = countCandidateRules(twoMoleculeTypes);
      expect(rules.length).toBe(count);
      // Verify count is > 0
      expect(count).toBeGreaterThan(0);
    });

    it('generates correct number of state change rules', () => {
      const rules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      // A(s~u~p): 2 states => 2 transitions (u->p, p->u)
      // B(x~i~a): 2 states => 2 transitions (i->a, a->i)
      // Total: 4 state change rules
      expect(rules.length).toBe(4);
      expect(rules.every((r) => r.category === 'state_change')).toBe(true);
    });

    it('state change rules have correct BNGL syntax', () => {
      const rules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      for (const rule of rules) {
        // Must contain ->
        expect(rule.rule).toContain('->');
        // Must contain molecule name with component and state
        expect(rule.rule).toMatch(/\w+\(\w+~\w+\)/);
        // Must end with a rate constant name
        const tokens = rule.rule.split(/\s+/);
        expect(tokens[tokens.length - 1]).toMatch(/^k_/);
      }
    });

    it('generates binding rules between binding-capable sites', () => {
      const rules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: true,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      // Binding sites (no states): A.b, B.a => 1 pair
      expect(rules.length).toBe(1);
      expect(rules[0].category).toBe('binding');
      expect(rules[0].rule).toContain('!1');
      expect(rules[0].rule).toContain('A(b');
      expect(rules[0].rule).toContain('B(a');
    });

    it('generates unbinding rules matching binding rules', () => {
      const bindingRules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: true,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      const unbindingRules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: false,
        includeUnbinding: true,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      expect(unbindingRules.length).toBe(bindingRules.length);
      expect(unbindingRules[0].category).toBe('unbinding');
    });

    it('generates synthesis and degradation rules for each molecule', () => {
      const synRules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: true,
        includeEnzymatic: false,
      });
      const degRules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: true,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      expect(synRules.length).toBe(2); // one per molecule
      expect(degRules.length).toBe(2);
      expect(synRules[0].rule).toContain('0 ->');
      expect(degRules[0].rule).toContain('-> 0');
    });

    it('generates enzymatic rules for cross-molecule catalysis', () => {
      const rules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: true,
      });
      // A(s~u~p): 2 transitions * 1 enzyme (B) = 2
      // B(x~i~a): 2 transitions * 1 enzyme (A) = 2
      // Total: 4
      expect(rules.length).toBe(4);
      expect(rules.every((r) => r.category === 'enzymatic')).toBe(true);
      // Each rule involves two different molecules
      for (const r of rules) {
        expect(r.involves.length).toBe(2);
        expect(r.involves[0]).not.toBe(r.involves[1]);
      }
    });

    it('human descriptions are non-empty strings', () => {
      const rules = enumerateRules(twoMoleculeTypes);
      for (const r of rules) {
        expect(r.humanDescription).toBeTruthy();
        expect(typeof r.humanDescription).toBe('string');
      }
    });

    it('phosphorylation description is recognized', () => {
      const rules = enumerateRules(simpleMoleculeTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      const phosphRule = rules.find((r) => r.rule.includes('s~u') && r.rule.includes('s~p'));
      expect(phosphRule).toBeDefined();
      expect(phosphRule!.humanDescription).toContain('Phosphorylation');
    });
  });

  describe('countCandidateRules', () => {
    it('count matches actual enumerated length', () => {
      const count = countCandidateRules(twoMoleculeTypes);
      const rules = enumerateRules(twoMoleculeTypes);
      expect(count).toBe(rules.length);
    });

    it('count with all categories disabled is 0', () => {
      const count = countCandidateRules(twoMoleculeTypes, {
        includeStateChanges: false,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      expect(count).toBe(0);
    });
  });
});

// ── CandidateFilter tests ────────────────────────────────────────────

describe('CandidateFilter', () => {
  it('removes duplicate rules', () => {
    const rules = enumerateRules(simpleMoleculeTypes);
    // Duplicate all rules
    const doubled = [...rules, ...rules];
    const filtered = filterCandidates(doubled, simpleMoleculeTypes, { maxRulesPerModel: 100 });
    expect(filtered.length).toBe(rules.length);
  });

  it('respects maxRulesPerModel', () => {
    const rules = enumerateRules(twoMoleculeTypes);
    const filtered = filterCandidates(rules, twoMoleculeTypes, { maxRulesPerModel: 5 });
    expect(filtered.length).toBeLessThanOrEqual(5);
  });

  it('removes rules with nonexistent molecules', () => {
    const bogusRule: CandidateRule = {
      rule: 'FakeMol(x~a) -> FakeMol(x~b) k_fake',
      category: 'state_change',
      involves: ['FakeMol'],
      sites: ['x'],
      humanDescription: 'Fake rule',
    };
    const filtered = filterCandidates([bogusRule], simpleMoleculeTypes, { maxRulesPerModel: 100 });
    expect(filtered.length).toBe(0);
  });

  it('removes rules with nonexistent states', () => {
    const badState: CandidateRule = {
      rule: 'X(s~u) -> X(s~zzz) k_bad',
      category: 'state_change',
      involves: ['X'],
      sites: ['s'],
      humanDescription: 'Bad state rule',
    };
    const filtered = filterCandidates([badState], simpleMoleculeTypes, { maxRulesPerModel: 100 });
    expect(filtered.length).toBe(0);
  });

  it('keeps valid rules', () => {
    const rules = enumerateRules(simpleMoleculeTypes);
    const filtered = filterCandidates(rules, simpleMoleculeTypes, { maxRulesPerModel: 100 });
    expect(filtered.length).toBe(rules.length);
  });

  it('ranks state_change higher than degradation by default priors', () => {
    const rules = enumerateRules(twoMoleculeTypes);
    const filtered = filterCandidates(rules, twoMoleculeTypes, { maxRulesPerModel: 100 });
    // State change rules (prior 0.8) should come before degradation (prior 0.5)
    const stateChangeIdx = filtered.findIndex((r) => r.category === 'state_change');
    const degradationIdx = filtered.findIndex((r) => r.category === 'degradation');
    if (stateChangeIdx >= 0 && degradationIdx >= 0) {
      expect(stateChangeIdx).toBeLessThan(degradationIdx);
    }
  });
});

// ── StructureScorer tests ────────────────────────────────────────────

describe('StructureScorer', () => {
  it('assembleModelCode produces valid BNGL structure', () => {
    const rules = enumerateRules(simpleMoleculeTypes, {
      includeStateChanges: true,
      includeBinding: false,
      includeUnbinding: false,
      includeDegradation: false,
      includeSynthesis: false,
      includeEnzymatic: false,
    });
    const code = assembleModelCode(
      rules,
      { kf: 1.0 },
      simpleMoleculeTypes,
      [{ name: 'X(s~u)', initialConcentration: 100 }],
      [{ type: 'Molecules', name: 'Xp', pattern: 'X(s~p)' }],
    );

    expect(code).toContain('begin model');
    expect(code).toContain('end model');
    expect(code).toContain('begin parameters');
    expect(code).toContain('end parameters');
    expect(code).toContain('begin molecule types');
    expect(code).toContain('end molecule types');
    expect(code).toContain('begin seed species');
    expect(code).toContain('end seed species');
    expect(code).toContain('begin observables');
    expect(code).toContain('end observables');
    expect(code).toContain('begin reaction rules');
    expect(code).toContain('end reaction rules');
    expect(code).toContain('X(s~u~p)');
    expect(code).toContain('Molecules Xp X(s~p)');
  });

  it('scoreStructure computes BIC and AIC with mock fitter', async () => {
    const rules = enumerateRules(simpleMoleculeTypes, {
      includeStateChanges: true,
      includeBinding: false,
      includeUnbinding: false,
      includeDegradation: false,
      includeSynthesis: false,
      includeEnzymatic: false,
    }).slice(0, 1); // Just one rule

    const mockSimulator = async () => ({
      headers: ['time', 'Xp'],
      data: [
        { time: 0, Xp: 0 },
        { time: 1, Xp: 50 },
        { time: 2, Xp: 80 },
      ],
    });

    const mockFitter = async () => ({
      bestFit: { k_X_s_u_to_p: 0.5 },
      bestScore: 10.0, // SSE
    });

    const expData = [
      { time: 0, observable: 'Xp', value: 0 },
      { time: 1, observable: 'Xp', value: 50 },
      { time: 2, observable: 'Xp', value: 80 },
    ];

    const result = await scoreStructure(
      rules,
      simpleMoleculeTypes,
      [{ name: 'X(s~u)', initialConcentration: 100 }],
      [{ type: 'Molecules', name: 'Xp', pattern: 'X(s~p)' }],
      expData,
      { k_X_s_u_to_p: [0.001, 100] },
      mockSimulator,
      mockFitter,
    );

    expect(result.parameterCount).toBe(1);
    expect(typeof result.bic).toBe('number');
    expect(typeof result.aic).toBe('number');
    expect(typeof result.logLikelihood).toBe('number');
    expect(result.fittedParameters).toHaveProperty('k_X_s_u_to_p');
    // For k=1 and n=3: BIC penalty = k*log(n) = log(3) ~ 1.099, AIC penalty = 2*k = 2
    // So AIC > BIC when n is small and k is small
    expect(result.aic).toBeGreaterThan(result.bic);
  });
});

// ── StructureABCSMC tests ────────────────────────────────────────────

describe('StructureABCSMC', () => {
  describe('assembleModel', () => {
    it('produces parseable BNGL code with all sections', () => {
      const rules = enumerateRules(twoMoleculeTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: false,
        includeSynthesis: false,
        includeEnzymatic: false,
      });
      const code = assembleModel(
        rules.slice(0, 2),
        { k_A_s_u_to_p: 0.1, k_A_s_p_to_u: 0.05 },
        twoMoleculeTypes,
        [
          { name: 'A(s~u,b)', initialConcentration: 100 },
          { name: 'B(a,x~i)', initialConcentration: 50 },
        ],
        [
          { type: 'Molecules', name: 'Ap', pattern: 'A(s~p)' },
        ],
      );

      expect(code).toContain('begin model');
      expect(code).toContain('end model');
      expect(code).toContain('k_A_s_u_to_p 0.1');
      expect(code).toContain('k_A_s_p_to_u 0.05');
      expect(code).toContain('A(s~u~p,b)');
      expect(code).toContain('B(a,x~i~a)');
      expect(code).toContain('A(s~u,b) 100');
      expect(code).toContain('Molecules Ap A(s~p)');
      // Should have reaction rules
      expect(code).toContain('begin reaction rules');

      // Check it has properly nested begin/end blocks
      const beginCount = (code.match(/begin /g) || []).length;
      const endCount = (code.match(/end /g) || []).length;
      expect(beginCount).toBe(endCount);
    });

    it('handles empty rule list', () => {
      const code = assembleModel(
        [],
        {},
        simpleMoleculeTypes,
        [{ name: 'X(s~u)', initialConcentration: 100 }],
        [{ type: 'Molecules', name: 'Xp', pattern: 'X(s~p)' }],
      );
      expect(code).toContain('begin reaction rules');
      expect(code).toContain('end reaction rules');
    });
  });

  describe('structureSearch', () => {
    it('with mock simulator, best structure has lower score than random', async () => {
      // Simple model: X with phosphorylation. Experimental data shows
      // Xp increasing over time, so a phosphorylation rule should be favored.
      const molTypes: BNGLMoleculeType[] = [
        { name: 'X', components: ['s~u~p'] },
      ];
      const candidates = enumerateRules(molTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: true,
        includeSynthesis: true,
        includeEnzymatic: false,
      });

      const expData = [
        { time: 0, observable: 'Xp', value: 0 },
        { time: 1, observable: 'Xp', value: 30 },
        { time: 2, observable: 'Xp', value: 55 },
        { time: 5, observable: 'Xp', value: 85 },
        { time: 10, observable: 'Xp', value: 95 },
      ];

      // Mock simulator: for phosphorylation rule, simulate exponential approach
      const mockSimulator = async (code: string) => {
        const hasPhosph = code.includes('s~u') && code.includes('s~p') && code.includes('->');
        // Extract a rough rate from the parameter section
        const rateMatch = code.match(/k_X_s_u_to_p\s+([\d.eE+-]+)/);
        const rate = rateMatch ? parseFloat(rateMatch[1]) : 0.1;
        const maxVal = 100;
        const times = [0, 1, 2, 5, 10];
        const data = times.map((t) => ({
          time: t,
          Xp: hasPhosph ? maxVal * (1 - Math.exp(-rate * t)) : 0,
        }));
        return { headers: ['time', 'Xp'], data };
      };

      const searchConfig: StructureSearchConfig = {
        candidates,
        moleculeTypes: molTypes,
        seedSpecies: [{ name: 'X(s~u)', initialConcentration: 100 }],
        observables: [{ type: 'Molecules', name: 'Xp', pattern: 'X(s~p)' }],
        experimentalData: expData,
        parameterBounds: {
          k_X_s_u_to_p: [0.01, 10],
          k_X_s_p_to_u: [0.01, 10],
          ksyn_X: [0.01, 10],
          kdeg_X: [0.01, 10],
        },
        inclusionPrior: 0.3,
        nParticles: 20,
        nGenerations: 3,
        seed: 42,
      };

      const result = await structureSearch(searchConfig, mockSimulator);

      // The best structure should have a finite, positive score
      expect(isFinite(result.bestStructure.score)).toBe(true);
      expect(result.bestStructure.score).toBeGreaterThanOrEqual(0);

      // Should have particles
      expect(result.particles.length).toBe(20);

      // Rule inclusion probabilities should be defined
      expect(Object.keys(result.ruleInclusionProbabilities).length).toBeGreaterThan(0);

      // The best structure score should be less than a random baseline
      // Compute what a "no rules" model would give (all zeros => large SSE)
      const noRuleSSE = expData.reduce((sum, dp) => sum + dp.value ** 2, 0);
      expect(result.bestStructure.score).toBeLessThan(noRuleSSE);

      // Best structure BNGL code should be non-empty
      expect(result.bestStructure.bnglCode).toContain('begin model');

      // Convergence diagnostics should exist
      expect(result.convergenceDiagnostics.effectiveSampleSize).toBeGreaterThan(0);
    }, 30000);

    it('topK structures are sorted by posterior probability descending', async () => {
      const molTypes: BNGLMoleculeType[] = [
        { name: 'X', components: ['s~u~p'] },
      ];
      const candidates = enumerateRules(molTypes, {
        includeStateChanges: true,
        includeBinding: false,
        includeUnbinding: false,
        includeDegradation: true,
        includeSynthesis: false,
        includeEnzymatic: false,
      });

      const mockSimulator = async (code: string) => {
        const hasPhos = code.includes('s~u') && code.includes('s~p');
        const data = [0, 1, 2].map((t) => ({ time: t, Xp: hasPhos ? 50 * t : 0 }));
        return { headers: ['time', 'Xp'], data };
      };

      const result = await structureSearch(
        {
          candidates,
          moleculeTypes: molTypes,
          seedSpecies: [{ name: 'X(s~u)', initialConcentration: 100 }],
          observables: [{ type: 'Molecules', name: 'Xp', pattern: 'X(s~p)' }],
          experimentalData: [
            { time: 0, observable: 'Xp', value: 0 },
            { time: 1, observable: 'Xp', value: 50 },
            { time: 2, observable: 'Xp', value: 100 },
          ],
          parameterBounds: {
            k_X_s_u_to_p: [0.01, 10],
            k_X_s_p_to_u: [0.01, 10],
            kdeg_X: [0.01, 10],
          },
          nParticles: 15,
          nGenerations: 2,
          seed: 99,
        },
        mockSimulator,
      );

      // topK should be sorted descending by posteriorProbability
      for (let i = 1; i < result.topK.length; i++) {
        expect(result.topK[i - 1].posteriorProbability).toBeGreaterThanOrEqual(
          result.topK[i].posteriorProbability,
        );
      }
    }, 30000);
  });
});
