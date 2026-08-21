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
});
