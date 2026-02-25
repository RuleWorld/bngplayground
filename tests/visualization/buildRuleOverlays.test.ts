/**
 * Tests for buildRuleOverlays — verifies center/context classification
 * of rule interactions with contact map elements.
 */
import { describe, it, expect } from 'vitest';
import { buildRuleOverlays } from '../../services/visualization/buildRuleOverlays';
import type { ReactionRule, BNGLMoleculeType } from '../../types';

const molTypes: BNGLMoleculeType[] = [
  { name: 'A', components: ['s~U~P', 'b'] },
  { name: 'B', components: ['b'] },
  { name: 'C', components: ['x~off~on'] },
];

describe('buildRuleOverlays', () => {
  it('returns an empty array when no rules are provided', () => {
    expect(buildRuleOverlays([], molTypes)).toEqual([]);
  });

  it('classifies a binding rule correctly', () => {
    // A(b) + B(b) -> A(b!1).B(b!1)
    const rule: ReactionRule = {
      reactants: ['A(b)', 'B(b)'],
      products: ['A(b!1).B(b!1)'],
      rate: 'kon',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    expect(overlays).toHaveLength(1);

    const overlay = overlays[0];
    expect(overlay.ruleIndex).toBe(0);

    // CENTER: bond A.b—B.b should be added
    expect(overlay.center.bondsAdded).toHaveLength(1);
    expect(overlay.center.bondsAdded[0]).toEqual(
      expect.arrayContaining(['A.b', 'B.b']),
    );

    // No state changes, no synthesis/degradation
    expect(overlay.center.stateChanges.size).toBe(0);
    expect(overlay.center.moleculesAdded.size).toBe(0);
    expect(overlay.center.moleculesRemoved.size).toBe(0);
    expect(overlay.center.bondsRemoved).toHaveLength(0);
  });

  it('classifies an unbinding rule correctly', () => {
    // A(b!1).B(b!1) -> A(b) + B(b)
    const rule: ReactionRule = {
      reactants: ['A(b!1).B(b!1)'],
      products: ['A(b)', 'B(b)'],
      rate: 'koff',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    const overlay = overlays[0];

    // CENTER: bond A.b—B.b should be removed
    expect(overlay.center.bondsRemoved).toHaveLength(1);
    expect(overlay.center.bondsAdded).toHaveLength(0);
  });

  it('classifies a state change rule correctly', () => {
    // A(s~U) -> A(s~P)
    const rule: ReactionRule = {
      reactants: ['A(s~U)'],
      products: ['A(s~P)'],
      rate: 'kp',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    const overlay = overlays[0];

    // CENTER: state change on A.s
    expect(overlay.center.stateChanges.has('A.s')).toBe(true);

    // CONTEXT: A.s should NOT be in testedComponents (it's in center)
    expect(overlay.context.testedComponents.has('A.s')).toBe(false);
  });

  it('classifies a synthesis rule correctly', () => {
    // 0 -> C(x~off)
    const rule: ReactionRule = {
      reactants: ['0'],
      products: ['C(x~off)'],
      rate: 'ksyn',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    const overlay = overlays[0];

    // CENTER: molecule C should be added
    expect(overlay.center.moleculesAdded.has('C')).toBe(true);
    expect(overlay.center.moleculesRemoved.size).toBe(0);
  });

  it('classifies a degradation rule correctly', () => {
    // C(x~off) -> 0
    const rule: ReactionRule = {
      reactants: ['C(x~off)'],
      products: ['0'],
      rate: 'kdeg',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    const overlay = overlays[0];

    // CENTER: molecule C should be removed
    expect(overlay.center.moleculesRemoved.has('C')).toBe(true);
    expect(overlay.center.moleculesAdded.size).toBe(0);
  });

  it('preserves context bonds that exist on both sides', () => {
    // A(b!1,s~U).B(b!1) -> A(b!1,s~P).B(b!1)
    // The A-B bond is preserved (context), state change is center
    const rule: ReactionRule = {
      reactants: ['A(b!1,s~U).B(b!1)'],
      products: ['A(b!1,s~P).B(b!1)'],
      rate: 'kp',
      isBidirectional: false,
    };

    const overlays = buildRuleOverlays([rule], molTypes);
    const overlay = overlays[0];

    // CENTER: state change on A.s
    expect(overlay.center.stateChanges.has('A.s')).toBe(true);
    expect(overlay.center.bondsAdded).toHaveLength(0);
    expect(overlay.center.bondsRemoved).toHaveLength(0);

    // CONTEXT: bond A.b—B.b should be preserved
    expect(overlay.context.requiredBonds).toHaveLength(1);
  });

  it('handles multiple rules', () => {
    const rules: ReactionRule[] = [
      {
        reactants: ['A(b)', 'B(b)'],
        products: ['A(b!1).B(b!1)'],
        rate: 'kon',
        isBidirectional: false,
      },
      {
        reactants: ['A(s~U)'],
        products: ['A(s~P)'],
        rate: 'kp',
        isBidirectional: false,
      },
    ];

    const overlays = buildRuleOverlays(rules, molTypes);
    expect(overlays).toHaveLength(2);
    expect(overlays[0].ruleIndex).toBe(0);
    expect(overlays[1].ruleIndex).toBe(1);
  });
});
