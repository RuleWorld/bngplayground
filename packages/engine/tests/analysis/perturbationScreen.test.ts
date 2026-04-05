import { describe, expect, it } from 'vitest';
import {
  perturbationScreen,
  PerturbationScreenConfig,
} from '../../src/services/analysis/PerturbationScreen';
import type { SimulationResults } from '../../src/types';

// ---------------------------------------------------------------------------
// Shared BNGL model: simple A -> B -> C linear cascade
// ---------------------------------------------------------------------------

const MODEL_CODE = `
begin model
begin parameters
  k1 0.1
  k2 0.05
end parameters

begin molecule types
  A()
  B()
  C()
end molecule types

begin seed species
  A() 100
  B() 0
  C() 0
end seed species

begin reaction rules
  RuleAB: A() -> B()  k1
  RuleBC: B() -> C()  k2
end reaction rules

begin observables
  Molecules A A()
  Molecules B B()
  Molecules C C()
end observables
end model
`.trim();

// ---------------------------------------------------------------------------
// Mock simulation function
//
// Parses rate constants from the parameters block and checks which rules are
// still active (not commented out).  Then runs a simple Euler integration of
// A -> B -> C using those rates.  Species initial concentrations are read
// from the seed-species / species block.
// ---------------------------------------------------------------------------

function createMockRunSimulation() {
  let callCount = 0;

  const mockRunSimulation = async (
    code: string,
    t_end: number,
    n_steps: number,
  ): Promise<SimulationResults> => {
    callCount++;

    // Parse parameters
    const rates: Record<string, number> = {};
    const paramMatch = code.match(
      /begin\s+parameters\s*\n([\s\S]*?)\nend\s+parameters/i,
    );
    if (paramMatch) {
      for (const line of paramMatch[1].split('\n')) {
        const m = line.trim().match(/^(\w+)\s+([\d.eE+-]+)/);
        if (m) rates[m[1]] = parseFloat(m[2]);
      }
    }

    // Parse species initial concentrations
    let A0 = 100,
      B0 = 0,
      C0 = 0;
    for (const blockName of ['seed species', 'species']) {
      const speciesMatch = code.match(
        new RegExp(
          `begin\\s+${blockName}\\s*\\n([\\s\\S]*?)\\nend\\s+${blockName}`,
          'i',
        ),
      );
      if (!speciesMatch) continue;
      for (const line of speciesMatch[1].split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const sm = trimmed.match(/^(\S+)\s+([\d.eE+-]+)/);
        if (!sm) continue;
        const name = sm[1];
        const conc = parseFloat(sm[2]);
        if (name.startsWith('A')) A0 = conc;
        else if (name.startsWith('B')) B0 = conc;
        else if (name.startsWith('C')) C0 = conc;
      }
    }

    // Check active rules
    const rulesMatch = code.match(
      /begin\s+reaction rules\s*\n([\s\S]*?)\nend\s+reaction rules/i,
    );
    const activeRules = rulesMatch
      ? rulesMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
      : [];

    const hasAB = activeRules.some((r) => r.includes('A()') && r.includes('B()'));
    const hasBC = activeRules.some((r) => r.includes('B()') && r.includes('C()'));

    const rateAB = hasAB ? (rates['k1'] ?? 0.1) : 0;
    const rateBC = hasBC ? (rates['k2'] ?? 0.05) : 0;

    // Euler integration
    const dt = t_end / n_steps;
    const data: Record<string, number>[] = [];
    let A = A0,
      B = B0,
      C = C0;

    for (let i = 0; i <= n_steps; i++) {
      data.push({ time: i * dt, A, B, C });
      if (i < n_steps) {
        const dA = -rateAB * A * dt;
        const dB = (rateAB * A - rateBC * B) * dt;
        const dC = rateBC * B * dt;
        A += dA;
        B += dB;
        C += dC;
      }
    }

    return { headers: ['time', 'A', 'B', 'C'], data };
  };

  return { mockRunSimulation, getCallCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PerturbationScreen', () => {
  // ---- Test 1: Essential rule knockout ------------------------------------

  it('should detect deviation when an essential rule is knocked out', async () => {
    const { mockRunSimulation } = createMockRunSimulation();

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 100,
      n_steps: 100,
      observables: ['A', 'B', 'C'],
      perturbations: ['rule_knockout'],
      runSimulation: mockRunSimulation,
    };

    const result = await perturbationScreen(config);

    expect(result.wildTypeTrajectory).toBeDefined();
    expect(result.wildTypeTrajectory['A']).toHaveLength(101);
    expect(result.results.length).toBe(2); // two rules

    // Knocking out RuleAB should cause big deviation in C
    const abKnockout = result.results.find((r) => r.target === 'RuleAB');
    expect(abKnockout).toBeDefined();
    expect(abKnockout!.success).toBe(true);
    expect(abKnockout!.aggregateScore).toBeGreaterThan(0);
    expect(abKnockout!.deviations['C']).toBeGreaterThan(0);

    // Knocking out RuleBC should cause deviation in C (and B)
    const bcKnockout = result.results.find((r) => r.target === 'RuleBC');
    expect(bcKnockout).toBeDefined();
    expect(bcKnockout!.success).toBe(true);
    expect(bcKnockout!.deviations['C']).toBeGreaterThan(0);

    // Total simulations: 1 (WT) + 2 (rule knockouts)
    expect(result.totalSimulations).toBe(3);
    expect(result.failedSimulations).toBe(0);
    expect(result.wallTimeMs).toBeGreaterThanOrEqual(0);
  });

  // ---- Test 2: Species knockdown ------------------------------------------

  it('should detect deviation when species A is knocked down to zero', async () => {
    const { mockRunSimulation } = createMockRunSimulation();

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 100,
      n_steps: 100,
      observables: ['A', 'B', 'C'],
      perturbations: ['species_knockdown'],
      knockdownFraction: 0,
      runSimulation: mockRunSimulation,
    };

    const result = await perturbationScreen(config);

    // 3 species in the model
    expect(result.results.length).toBe(3);

    const aKnockdown = result.results.find((r) => r.target === 'A()');
    expect(aKnockdown).toBeDefined();
    expect(aKnockdown!.success).toBe(true);
    // A knocked to zero means no B or C produced - big deviation
    expect(aKnockdown!.aggregateScore).toBeGreaterThan(0);
    expect(aKnockdown!.deviations['A']).toBeGreaterThan(0);

    // B and C start at 0, so knocking them down changes nothing
    const bKnockdown = result.results.find((r) => r.target === 'B()');
    expect(bKnockdown).toBeDefined();
    expect(bKnockdown!.aggregateScore).toBe(0);
  });

  // ---- Test 3: Metric computation -----------------------------------------

  it('should compute all four metrics correctly on known data', async () => {
    // We test indirectly by running the screen with each metric and
    // verifying the scores are consistent and non-negative.
    const { mockRunSimulation } = createMockRunSimulation();

    const metrics = [
      'max_absolute',
      'integral_absolute',
      'endpoint',
      'rmsd',
    ] as const;
    const scores: Record<string, number> = {};

    for (const metric of metrics) {
      const config: PerturbationScreenConfig = {
        code: MODEL_CODE,
        t_end: 100,
        n_steps: 50,
        observables: ['C'],
        perturbations: ['rule_knockout'],
        metric,
        runSimulation: mockRunSimulation,
      };

      const result = await perturbationScreen(config);
      const abResult = result.results.find((r) => r.target === 'RuleAB');
      expect(abResult).toBeDefined();
      expect(abResult!.success).toBe(true);
      scores[metric] = abResult!.deviations['C'];
      expect(scores[metric]).toBeGreaterThan(0);
    }

    // max_absolute >= integral_absolute (max of absolutes >= mean of absolutes)
    expect(scores['max_absolute']).toBeGreaterThanOrEqual(
      scores['integral_absolute'],
    );

    // All should be positive since knocking out A->B blocks C production
    for (const metric of metrics) {
      expect(scores[metric]).toBeGreaterThan(0);
    }
  });

  // ---- Test 4: Cancellation -----------------------------------------------

  it('should terminate early when signal is cancelled', async () => {
    const { mockRunSimulation, getCallCount } = createMockRunSimulation();
    const signal = { cancelled: false };

    // Wrap to cancel after first perturbation simulation (second call total)
    let simCount = 0;
    const wrappedRun = async (
      code: string,
      t_end: number,
      n_steps: number,
    ) => {
      const result = await mockRunSimulation(code, t_end, n_steps);
      simCount++;
      if (simCount >= 2) {
        signal.cancelled = true;
      }
      return result;
    };

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 100,
      n_steps: 50,
      observables: ['A', 'B', 'C'],
      perturbations: ['rule_knockout'],
      signal,
      runSimulation: wrappedRun,
    };

    const result = await perturbationScreen(config);

    // Should have run WT + at most 1 perturbation before cancellation kicks in
    // (signal set after 2nd call, so the 2nd perturbation loop iteration sees it)
    expect(result.results.length).toBeLessThan(2);
    expect(result.totalSimulations).toBeLessThanOrEqual(3);
  });

  // ---- Test 5: Pairwise synergy -------------------------------------------

  it('should compute pairwise synergy for rule knockouts', async () => {
    // Model with two partially redundant paths:  A -> B and A -> C, plus B -> D and C -> D
    const twoPathModel = `
begin model
begin parameters
  k1 0.1
  k2 0.1
  k3 0.05
  k4 0.05
end parameters

begin molecule types
  A()
  B()
  C()
  D()
end molecule types

begin seed species
  A() 100
  B() 0
  C() 0
  D() 0
end seed species

begin reaction rules
  R1: A() -> B()  k1
  R2: A() -> C()  k2
  R3: B() -> D()  k3
  R4: C() -> D()  k4
end reaction rules

begin observables
  Molecules A A()
  Molecules B B()
  Molecules C C()
  Molecules D D()
end observables
end model
`.trim();

    // Custom mock for the two-path model
    const twoPathMock = async (
      code: string,
      t_end: number,
      n_steps: number,
    ): Promise<SimulationResults> => {
      const rates: Record<string, number> = {};
      const paramMatch = code.match(
        /begin\s+parameters\s*\n([\s\S]*?)\nend\s+parameters/i,
      );
      if (paramMatch) {
        for (const line of paramMatch[1].split('\n')) {
          const m = line.trim().match(/^(\w+)\s+([\d.eE+-]+)/);
          if (m) rates[m[1]] = parseFloat(m[2]);
        }
      }

      // Parse species
      let A0 = 100, B0 = 0, C0 = 0, D0 = 0;
      for (const bn of ['seed species', 'species']) {
        const sm = code.match(
          new RegExp(`begin\\s+${bn}\\s*\\n([\\s\\S]*?)\\nend\\s+${bn}`, 'i'),
        );
        if (!sm) continue;
        for (const line of sm[1].split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const pm = t.match(/^(\S+)\s+([\d.eE+-]+)/);
          if (!pm) continue;
          if (pm[1].startsWith('A')) A0 = parseFloat(pm[2]);
          else if (pm[1].startsWith('B')) B0 = parseFloat(pm[2]);
          else if (pm[1].startsWith('C')) C0 = parseFloat(pm[2]);
          else if (pm[1].startsWith('D')) D0 = parseFloat(pm[2]);
        }
      }

      const rulesMatch = code.match(
        /begin\s+reaction rules\s*\n([\s\S]*?)\nend\s+reaction rules/i,
      );
      const activeRules = rulesMatch
        ? rulesMatch[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
        : [];

      const hasR1 = activeRules.some((r) => /R1/.test(r) || (/A\(\)/.test(r) && /B\(\)/.test(r) && /k1/.test(r)));
      const hasR2 = activeRules.some((r) => /R2/.test(r) || (/A\(\)/.test(r) && /C\(\)/.test(r) && /k2/.test(r)));
      const hasR3 = activeRules.some((r) => /R3/.test(r) || (/B\(\)/.test(r) && /D\(\)/.test(r) && /k3/.test(r)));
      const hasR4 = activeRules.some((r) => /R4/.test(r) || (/C\(\)/.test(r) && /D\(\)/.test(r) && /k4/.test(r)));

      const rAB = hasR1 ? (rates['k1'] ?? 0.1) : 0;
      const rAC = hasR2 ? (rates['k2'] ?? 0.1) : 0;
      const rBD = hasR3 ? (rates['k3'] ?? 0.05) : 0;
      const rCD = hasR4 ? (rates['k4'] ?? 0.05) : 0;

      const dt = t_end / n_steps;
      const data: Record<string, number>[] = [];
      let A = A0, B = B0, C = C0, D = D0;

      for (let i = 0; i <= n_steps; i++) {
        data.push({ time: i * dt, A, B, C, D });
        if (i < n_steps) {
          const dA = -(rAB + rAC) * A * dt;
          const dB = (rAB * A - rBD * B) * dt;
          const dC = (rAC * A - rCD * C) * dt;
          const dD = (rBD * B + rCD * C) * dt;
          A += dA;
          B += dB;
          C += dC;
          D += dD;
        }
      }

      return { headers: ['time', 'A', 'B', 'C', 'D'], data };
    };

    const config: PerturbationScreenConfig = {
      code: twoPathModel,
      t_end: 100,
      n_steps: 100,
      observables: ['D'],
      perturbations: ['rule_knockout', 'pairwise_rules'],
      maxPairwise: 100,
      runSimulation: twoPathMock,
    };

    const result = await perturbationScreen(config);

    expect(result.syntheticPairs).toBeDefined();
    expect(result.syntheticPairs!.length).toBeGreaterThan(0);

    // Find the pair that knocks out both paths to D (R1+R2 or R3+R4)
    // Knocking out R1 and R2 together blocks ALL flow from A, so D stays at 0
    // Individual knockouts only block one path - D still gets some flow
    const r1r2Pair = result.syntheticPairs!.find(
      (p) =>
        (p.target1 === 'R1' && p.target2 === 'R2') ||
        (p.target1 === 'R2' && p.target2 === 'R1'),
    );

    if (r1r2Pair) {
      // Combined effect should be >= individual effects
      expect(r1r2Pair.combinedScore).toBeGreaterThanOrEqual(
        r1r2Pair.individual1Score,
      );
      expect(r1r2Pair.combinedScore).toBeGreaterThanOrEqual(
        r1r2Pair.individual2Score,
      );
      // For redundant paths, combined knockout should show positive synergy
      expect(r1r2Pair.synergy).toBeGreaterThanOrEqual(0);
    }

    // All synthetic pairs should have defined numeric fields
    for (const pair of result.syntheticPairs!) {
      expect(Number.isFinite(pair.combinedScore)).toBe(true);
      expect(Number.isFinite(pair.individual1Score)).toBe(true);
      expect(Number.isFinite(pair.individual2Score)).toBe(true);
      expect(Number.isFinite(pair.synergy)).toBe(true);
    }
  });

  // ---- Test 6: Molecule-type knockout -------------------------------------

  it('should knock out all rules and species for a molecule type', async () => {
    const { mockRunSimulation } = createMockRunSimulation();

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 100,
      n_steps: 50,
      observables: ['A', 'B', 'C'],
      perturbations: ['molecule_knockout'],
      runSimulation: mockRunSimulation,
    };

    const result = await perturbationScreen(config);

    // 3 molecule types: A, B, C
    expect(result.results.length).toBe(3);

    // Knocking out molecule type B should block both rules (both mention B)
    // and zero out B species
    const bKnockout = result.results.find((r) => r.target === 'B');
    expect(bKnockout).toBeDefined();
    expect(bKnockout!.success).toBe(true);
    expect(bKnockout!.type).toBe('molecule_knockout');
  });

  // ---- Test 7: Empty perturbation list ------------------------------------

  it('should return just the wild-type run with no perturbation types', async () => {
    const { mockRunSimulation } = createMockRunSimulation();

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 10,
      n_steps: 10,
      observables: ['A'],
      perturbations: [],
      runSimulation: mockRunSimulation,
    };

    const result = await perturbationScreen(config);

    expect(result.results.length).toBe(0);
    expect(result.totalSimulations).toBe(1); // just WT
    expect(result.wildTypeTrajectory['A']).toHaveLength(11);
  });

  // ---- Test 8: Simulation failure handling --------------------------------

  it('should handle simulation failures gracefully', async () => {
    let callCount = 0;
    const failingMock = async (
      code: string,
      t_end: number,
      n_steps: number,
    ): Promise<SimulationResults> => {
      callCount++;
      if (callCount === 1) {
        // WT succeeds
        return {
          headers: ['time', 'A'],
          data: Array.from({ length: n_steps + 1 }, (_, i) => ({
            time: (i * t_end) / n_steps,
            A: 100 - i,
          })),
        };
      }
      // All perturbation sims fail
      throw new Error('Simulation diverged');
    };

    const config: PerturbationScreenConfig = {
      code: MODEL_CODE,
      t_end: 100,
      n_steps: 10,
      observables: ['A'],
      perturbations: ['rule_knockout'],
      runSimulation: failingMock,
    };

    const result = await perturbationScreen(config);

    expect(result.results.length).toBe(2);
    for (const r of result.results) {
      expect(r.success).toBe(false);
      expect(r.error).toBe('Simulation diverged');
      expect(r.aggregateScore).toBe(0);
    }
    expect(result.failedSimulations).toBe(2);
  });
});
