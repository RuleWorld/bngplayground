import { describe, it, expect } from 'vitest';
import { buildContactMap } from '../src/services/verification/ContactMapBuilder';
import type { BNGLMoleculeType, ReactionRule } from '../src/types';

describe('ContactMapBuilder', () => {
    it('returns empty nodes and edges for empty input', () => {
        const result = buildContactMap([], []);
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
    });

    it('builds node hierarchy for molecule types with components and states', () => {
        const moleculeTypes: BNGLMoleculeType[] = [
            {
                name: 'A',
                components: ['b', 's~U~P'],
            },
        ];

        const result = buildContactMap([], moleculeTypes);

        const nodeLabels = result.nodes.map((n) => n.label);
        expect(nodeLabels).toContain('A');
        expect(nodeLabels).toContain('b');
        expect(nodeLabels).toContain('s');
        expect(nodeLabels).toContain('U');
        expect(nodeLabels).toContain('P');

        const molNode = result.nodes.find((n) => n.label === 'A');
        expect(molNode?.type).toBe('molecule');
        expect(molNode?.isGroup).toBe(true);

        const compNode = result.nodes.find((n) => n.label === 's');
        expect(compNode?.type).toBe('component');
        expect(compNode?.parent).toBe(molNode?.id);
    });

    it('builds binding edges between components in reaction rules', () => {
        const moleculeTypes: BNGLMoleculeType[] = [
            { name: 'A', components: ['b'] },
            { name: 'B', components: ['a'] },
        ];

        const rules: ReactionRule[] = [
            {
                name: 'Binding_A_B',
                reactants: ['A(b)', 'B(a)'],
                products: ['A(b!1).B(a!1)'],
                rate: 'kbind',
                isBidirectional: false,
            },
        ];

        const result = buildContactMap(rules, moleculeTypes);

        expect(result.edges.length).toBe(1);
        const edge = result.edges[0];
        expect(edge.interactionType).toBe('binding');
        expect(edge.componentPair).toEqual(['b', 'a']);
        expect(edge.ruleIds).toContain('Binding_A_B');
        expect(edge.ruleLabels).toContain('Binding_A_B');
    });

    it('aggregates reversed endpoint order into one logical edge', () => {
        const moleculeTypes: BNGLMoleculeType[] = [
            { name: 'A', components: ['b'] },
            { name: 'B', components: ['a'] },
        ];
        const rules: ReactionRule[] = [
            {
                name: 'Forward_Order',
                reactants: ['A(b)', 'B(a)'],
                products: ['A(b!1).B(a!1)'],
                rate: 'k1',
                isBidirectional: false,
            },
            {
                name: 'Reverse_Order',
                reactants: ['B(a)', 'A(b)'],
                products: ['B(a!1).A(b!1)'],
                rate: 'k2',
                isBidirectional: false,
            },
        ];

        const result = buildContactMap(rules, moleculeTypes);

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].ruleIds).toEqual(['Forward_Order', 'Reverse_Order']);
        expect(result.edges[0].componentPair).toEqual(['b', 'a']);
    });

    it('handles molecule and component names with underscores without key collision', () => {
        const moleculeTypes: BNGLMoleculeType[] = [
            { name: 'A_B', components: ['c_d'] },
            { name: 'E_F', components: ['g_h'] },
        ];

        const rules: ReactionRule[] = [
            {
                name: 'Rule_Underscore',
                reactants: ['A_B(c_d)', 'E_F(g_h)'],
                products: ['A_B(c_d!1).E_F(g_h!1)'],
                rate: 'k1',
                isBidirectional: false,
            },
        ];

        const result = buildContactMap(rules, moleculeTypes);

        const abNode = result.nodes.find((n) => n.label === 'A_B' && n.type === 'molecule');
        const efNode = result.nodes.find((n) => n.label === 'E_F' && n.type === 'molecule');

        expect(abNode).toBeDefined();
        expect(efNode).toBeDefined();

        const cdNode = result.nodes.find((n) => n.label === 'c_d' && n.parent === abNode?.id);
        const ghNode = result.nodes.find((n) => n.label === 'g_h' && n.parent === efNode?.id);

        expect(cdNode).toBeDefined();
        expect(ghNode).toBeDefined();

        expect(result.edges.length).toBe(1);
        const edge = result.edges[0];
        expect(edge.from).toBe(cdNode?.id);
        expect(edge.to).toBe(ghNode?.id);
        expect(edge.componentPair).toEqual(['c_d', 'g_h']);
    });
});
