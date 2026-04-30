import { describe, it, expect } from 'vitest';
import { classifyRuleChanges } from '../../../services/ruleAnalysis/ruleChangeClassifier';
import type { ReactionRule } from '../../../types';

// Helper to construct a basic ReactionRule for testing
const createRule = (
  reactants: string[],
  products: string[],
  isBidirectional: boolean = false,
  name: string = 'test_rule'
): ReactionRule => ({
  name,
  reactants,
  products,
  isBidirectional,
  rate: '1.0', // Dummy rate
});

describe('classifyRuleChanges', () => {
  it('should correctly classify a pure binding (association) rule', () => {
    const rule = createRule(['A(b)', 'B(a)'], ['A(b!1).B(a!1)']);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('association');
    expect(result.complexChange).toBe('assoc_nonrev');
    expect(result.reversibility).toBe('irreversible');

    // Check bond changes
    expect(result.bondChanges).toHaveLength(2); // Two endpoints for one bond added
    expect(result.bondChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ molecule: 'A', site: 'b', change: 'added' }),
        expect.objectContaining({ molecule: 'B', site: 'a', change: 'added' }),
      ])
    );

    expect(result.stateChanges).toHaveLength(0);
    expect(result.synthDegChanges).toHaveLength(0);
  });

  it('should correctly classify a pure dissociation rule', () => {
    const rule = createRule(['A(b!1).B(a!1)'], ['A(b)', 'B(a)']);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('dissociation');
    expect(result.complexChange).toBe('dissoc_nonrev');

    // Check bond changes
    expect(result.bondChanges).toHaveLength(2); // Two endpoints removed
    expect(result.bondChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ molecule: 'A', site: 'b', change: 'removed' }),
        expect.objectContaining({ molecule: 'B', site: 'a', change: 'removed' }),
      ])
    );
  });

  it('should correctly classify a pure state change rule', () => {
    const rule = createRule(['A(p~U)'], ['A(p~P)']);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('pure_state_change');
    expect(result.complexChange).toBe('no_change_complex'); // Or no_change_separate depending on lhs length

    expect(result.stateChanges).toHaveLength(1);
    expect(result.stateChanges[0]).toEqual(
      expect.objectContaining({
        molecule: 'A',
        site: 'p',
        fromState: 'U',
        toState: 'P',
      })
    );

    expect(result.bondChanges).toHaveLength(0);
  });

  it('should correctly classify a mixed rule (binding and state change)', () => {
    // A(b,p~U) + B(a) -> A(b!1,p~P).B(a!1)
    const rule = createRule(['A(b,p~U)', 'B(a)'], ['A(b!1,p~P).B(a!1)']);
    const result = classifyRuleChanges(rule);

    // According to logic, assoc takes precedence in decideRuleKind
    expect(result.kind).toBe('association');

    expect(result.bondChanges.length).toBeGreaterThan(0);
    expect(result.stateChanges).toHaveLength(1);
    expect(result.stateChanges[0]).toEqual(
      expect.objectContaining({
        molecule: 'A',
        site: 'p',
        fromState: 'U',
        toState: 'P',
      })
    );
  });

  it('should correctly classify an intramolecular bond formation (pure_binding)', () => {
    // A(b,c) -> A(b!1,c!1)
    const rule = createRule(['A(b,c)'], ['A(b!1,c!1)']);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('pure_binding');
    expect(result.complexChange).toBe('no_change_complex');

    expect(result.bondChanges).toHaveLength(2);
    expect(result.bondChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ molecule: 'A', site: 'b', change: 'added' }),
        expect.objectContaining({ molecule: 'A', site: 'c', change: 'added' }),
      ])
    );
  });

  it('should correctly classify a synthesis rule', () => {
    const rule = createRule([], ['A()']);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('synthesis');
    expect(result.synthDegChanges).toHaveLength(1);
    expect(result.synthDegChanges[0]).toEqual(
      expect.objectContaining({
        molecule: 'A()',
        change: 'synthesized',
      })
    );
  });

  it('should correctly classify a degradation rule', () => {
    const rule = createRule(['A()'], []);
    const result = classifyRuleChanges(rule);

    expect(result.kind).toBe('degradation');
    expect(result.synthDegChanges).toHaveLength(1);
    expect(result.synthDegChanges[0]).toEqual(
      expect.objectContaining({
        molecule: 'A()',
        change: 'degraded',
      })
    );
  });

  it('should accurately reflect reversibility', () => {
    const rule = createRule(['A(b)', 'B(a)'], ['A(b!1).B(a!1)'], true);
    const result = classifyRuleChanges(rule);

    expect(result.reversibility).toBe('reversible');
    expect(result.complexChange).toBe('assoc_rev');

    // Check that reversibility cascades down to changes
    expect(result.bondChanges[0].reversibility).toBe('reversible');
  });

  it('should respect custom options for ruleId and ruleName', () => {
    const rule = createRule(['A()'], ['B()'], false, 'original_name');
    const result = classifyRuleChanges(rule, {
      ruleId: 'custom_id',
      ruleName: 'Custom Name',
    });

    expect(result.ruleId).toBe('custom_id');
    expect(result.ruleName).toBe('Custom Name');
  });

  it('should handle unnamed rules gracefully', () => {
    const rule: ReactionRule = {
      reactants: ['A()'],
      products: ['B()'],
      isBidirectional: false,
      rate: '1.0',
    };
    const result = classifyRuleChanges(rule);

    expect(result.ruleId).toBe('unnamed_rule');
    expect(result.ruleName).toBe('unnamed_rule');
  });
});
