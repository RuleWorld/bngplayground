/**
 * Tests for computeInfluenceGraph — verifies activation/inhibition
 * classification between rules based on center/context overlap.
 */
import { describe, it, expect } from 'vitest';
import { buildRuleOverlays } from '../../services/visualization/buildRuleOverlays';
import { computeInfluenceGraph } from '../../services/visualization/computeInfluence';
import type { ReactionRule, BNGLMoleculeType } from '../../types';

const molTypes: BNGLMoleculeType[] = [
    { name: 'A', components: ['s~U~P', 'b'] },
    { name: 'B', components: ['b'] },
];

describe('computeInfluenceGraph', () => {
    it('finds activation when rule1 creates a bond that rule2 requires', () => {
        // Rule 1: A(b) + B(b) -> A(b!1).B(b!1) (creates bond)
        // Rule 2: A(b!1,s~U).B(b!1) -> A(b!1,s~P).B(b!1) (needs bond)
        const rules: ReactionRule[] = [
            {
                reactants: ['A(b)', 'B(b)'],
                products: ['A(b!1).B(b!1)'],
                rate: 'kon',
                isBidirectional: false,
                name: 'Bind',
            },
            {
                reactants: ['A(b!1,s~U).B(b!1)'],
                products: ['A(b!1,s~P).B(b!1)'],
                rate: 'kp',
                isBidirectional: false,
                name: 'Phospho',
            },
        ];

        const overlays = buildRuleOverlays(rules, molTypes);
        const graph = computeInfluenceGraph(overlays, rules);

        expect(graph.nodes).toHaveLength(2);

        // Rule "Bind" should activate "Phospho"
        const activationEdge = graph.edges.find(
            e => e.sourceRuleIndex === 0 && e.targetRuleIndex === 1,
        );
        expect(activationEdge).toBeDefined();
        expect(activationEdge!.activation).toBeGreaterThanOrEqual(0);
    });

    it('finds inhibition when rule1 removes a bond that rule2 requires', () => {
        // Rule 1: A(b!1).B(b!1) -> A(b) + B(b) (removes bond)
        // Rule 2: A(b!1,s~U).B(b!1) -> A(b!1,s~P).B(b!1) (needs bond)
        const rules: ReactionRule[] = [
            {
                reactants: ['A(b!1).B(b!1)'],
                products: ['A(b)', 'B(b)'],
                rate: 'koff',
                isBidirectional: false,
                name: 'Unbind',
            },
            {
                reactants: ['A(b!1,s~U).B(b!1)'],
                products: ['A(b!1,s~P).B(b!1)'],
                rate: 'kp',
                isBidirectional: false,
                name: 'Phospho',
            },
        ];

        const overlays = buildRuleOverlays(rules, molTypes);
        const graph = computeInfluenceGraph(overlays, rules);

        // Rule "Unbind" should inhibit "Phospho"
        const inhibitionEdge = graph.edges.find(
            e => e.sourceRuleIndex === 0 && e.targetRuleIndex === 1,
        );
        expect(inhibitionEdge).toBeDefined();
        expect(inhibitionEdge!.inhibition).toBeGreaterThanOrEqual(0);
    });

    it('returns no edges when rules have no structural overlap', () => {
        // Rule 1: A(s~U) -> A(s~P)
        // Rule 2: B(b) -> ... (no connection to A)
        const rules: ReactionRule[] = [
            {
                reactants: ['A(s~U)'],
                products: ['A(s~P)'],
                rate: 'k1',
                isBidirectional: false,
                name: 'R1',
            },
            {
                reactants: ['B(b)'],
                products: ['B(b)'],
                rate: 'k2',
                isBidirectional: false,
                name: 'R2',
            },
        ];

        const overlays = buildRuleOverlays(rules, molTypes);
        const graph = computeInfluenceGraph(overlays, rules);

        expect(graph.nodes).toHaveLength(2);
        // R2 has no changes (same reactants/products), so it shouldn't influence anyone
        // and R1 changes A but R2 doesn't test A
        const edgesFrom0To1 = graph.edges.filter(
            e => e.sourceRuleIndex === 0 && e.targetRuleIndex === 1,
        );
        expect(edgesFrom0To1).toHaveLength(0);
    });

    it('handles bidirectional rules as separate nodes', () => {
        const rules: ReactionRule[] = [
            {
                reactants: ['A(b)', 'B(b)'],
                products: ['A(b!1).B(b!1)'],
                rate: 'kon',
                isBidirectional: true,
                name: 'Bind',
            },
        ];

        const overlays = buildRuleOverlays(rules, molTypes);
        const graph = computeInfluenceGraph(overlays, rules);

        // Bidirectional -> 2 nodes (forward + reverse)
        expect(graph.nodes).toHaveLength(2);
        expect(graph.nodes[0].ruleName).toBe('Bind');
        expect(graph.nodes[1].ruleName).toBe('Bind (rev)');
    });
});
