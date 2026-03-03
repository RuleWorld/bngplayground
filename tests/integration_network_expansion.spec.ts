/**
 * Integration test: Network Expansion with Rate Evaluation
 * Tests the full flow of auto-generating network from reaction rules
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion';
import { loadEvaluator, _setEvaluatorRefForTests } from '../services/simulation/ExpressionEvaluator';
import { SafeExpressionEvaluator } from '../services/safeExpressionEvaluator';

describe('Integration: Network Expansion with Rate Evaluation', () => {
  beforeAll(async () => {
    // Setup evaluator reference for tests
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
  });

  it('should generate network from AB model with proper rate constants', async () => {
    const bngl = `
begin model
begin parameters
  ka 0.01
  kd 1.0
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) 10
  B(a) 10
end seed species
begin reaction rules
  A(b) + B(a) <-> A(b!1).B(a!1) ka, kd
end reaction rules
end model
`;

    const model = parseBNGLStrict(bngl);
    console.log('[Test] Parsed model:');
    console.log('  - Parameters:', model.parameters);
    console.log('  - Species:', model.species.map(s => s.name));
    console.log('  - Reactions:', model.reactions?.length ?? 0);
    console.log('  - ReactionRules:', model.reactionRules.length);

    const expanded = await generateExpandedNetwork(
      model,
      () => { /* check cancelled */ },
      (p) => console.log('[Test] Progress:', p)
    );

    console.log('[Test] Expanded network:');
    console.log('  - Species:', expanded.species.length, expanded.species.map(s => s.name));
    console.log('  - Reactions:', expanded.reactions.length);
    
    expanded.reactions.forEach((rxn, i) => {
      console.log(`  - Reaction ${i}: rate=${rxn.rateConstant}, propensity=${rxn.propensityFactor}`);
    });

    // Expectations
    expect(expanded.species.length).toBeGreaterThanOrEqual(2);
    expect(expanded.reactions.length).toBeGreaterThan(0);
    
    // Check that at least one reaction has the forward rate constant
    const forwardRxn = expanded.reactions.find(r => r.rateConstant > 0.001 && r.rateConstant < 0.02);
    expect(forwardRxn).toBeDefined();
    if (forwardRxn) {
      expect(forwardRxn.rateConstant).toBeCloseTo(0.01, 3);
    }

    // Check for reverse reaction with kd=1.0
    const reverseRxn = expanded.reactions.find(r => r.rateConstant > 0.9 && r.rateConstant < 1.1);
    expect(reverseRxn).toBeDefined();
    if (reverseRxn) {
      expect(reverseRxn.rateConstant).toBeCloseTo(1.0, 1);
    }
  });

  it('should work with manually called loadEvaluator (simulating worker)', async () => {
    // First, clear the evaluator reference to simulate fresh worker state
    _setEvaluatorRefForTests(undefined);

    // Now manually call loadEvaluator like the worker does
    await loadEvaluator();

    const bngl = `
begin model
begin parameters
  k_on 0.05
  k_off 0.1
end parameters
begin molecule types
  X(b)
  Y(a)
end molecule types
begin seed species
  X(b) 5
  Y(a) 5
end seed species
begin reaction rules
  X(b) + Y(a) -> X(b!1).Y(a!1) k_on
  X(b!1).Y(a!1) -> X(b) + Y(a) k_off
end reaction rules
end model
`;

    const model = parseBNGLStrict(bngl);
    const expanded = await generateExpandedNetwork(model, () => { }, () => { });

    console.log('[Test] Network after manual loadEvaluator:');
    console.log('  - Reactions:', expanded.reactions.length);
    expanded.reactions.forEach((rxn, i) => {
      console.log(`    Reaction ${i}: rate=${rxn.rateConstant}`);
    });

    expect(expanded.reactions.length).toBeGreaterThan(0);
    const hasNonZeroRate = expanded.reactions.some(r => r.rateConstant > 0);
    expect(hasNonZeroRate).toBe(true);
  });
});
