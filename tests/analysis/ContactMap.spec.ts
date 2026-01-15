
import { describe, it, expect } from 'vitest';
import { buildContactMap } from '../../services/visualization/contactMapBuilder';
import { ReactionRule, BNGLMoleculeType } from '../../types';

// Helper to create simple rules
const createRule = (
    name: string,
    reactants: string[],
    products: string[],
    isBidirectional = false
): ReactionRule => ({
    name,
    reactants,
    products,
    isBidirectional,
    rate: 'k1'
});

describe('ContactMap Builder', () => {

    describe('Node Hierarchy', () => {
        it('should create molecule nodes', () => {
            const rule = createRule('r1', ['A()'], ['A()']);
            const map = buildContactMap([rule]);

            const molNode = map.nodes.find(n => n.label === 'A');
            expect(molNode).toBeDefined();
            expect(molNode?.type).toBe('molecule');
        });

        it('should create component nodes', () => {
            const rule = createRule('r1', ['A(b)'], ['A(b)']);
            const map = buildContactMap([rule]);

            // Hierarchy: A -> b
            const molNode = map.nodes.find(n => n.label === 'A');
            const compNode = map.nodes.find(n => n.label === 'b');

            expect(molNode).toBeDefined();
            expect(compNode).toBeDefined();
            expect(compNode?.parent).toBe(molNode?.id);
        });

        it('should create state nodes from molecule types', () => {
            const molTypes: BNGLMoleculeType[] = [{
                name: 'A',
                components: ['b~u~p']
            }];
            const rule = createRule('r1', ['A(b~u)'], ['A(b~p)']);
            const map = buildContactMap([rule], molTypes);

            const compNode = map.nodes.find(n => n.label === 'b');
            const uNode = map.nodes.find(n => n.label === 'u');
            const pNode = map.nodes.find(n => n.label === 'p');

            expect(uNode?.parent).toBe(compNode?.id);
            expect(pNode?.parent).toBe(compNode?.id);
            expect(uNode?.type).toBe('state');
        });
    });

    describe('Edge Generation', () => {
        it('should create edge for binding A(b)+B(a)->A(b!1).B(a!1)', () => {
            const rule = createRule('bind', ['A(b)', 'B(a)'], ['A(b!1).B(a!1)']);
            const map = buildContactMap([rule]);

            expect(map.edges.length).toBe(1);
            const edge = map.edges[0];
            // Edges go between components
            // Nodes: A, A.b, B, B.a
            // Edge: A.b -> B.a
            // We need to trace IDs.
            const nodeA = map.nodes.find(n => n.label === 'A');
            const nodeB = map.nodes.find(n => n.label === 'B');
            const compB_A = map.nodes.find(n => n.parent === nodeA?.id && n.label === 'b');
            const compA_B = map.nodes.find(n => n.parent === nodeB?.id && n.label === 'a');

            expect(edge.from).toBe(compB_A?.id);
            expect(edge.to).toBe(compA_B?.id);
        });

        it('should NOT create edge for unbinding A(b!1).B(a!1)->A(b)+B(a)', () => {
            // Current logic: loops product bonds. If not in reactant, add edge.
            // Unbinding: Product has NO bonds.
            // Thus no edges generated.
            const rule = createRule('unbind', ['A(b!1).B(a!1)'], ['A(b)', 'B(a)']);
            const map = buildContactMap([rule]);
            expect(map.edges.length).toBe(0);
        });

        it('should deduplicate edges', () => {
            // Two rules forming same bond
            const r1 = createRule('bind1', ['A(b)', 'B(a)'], ['A(b!1).B(a!1)']);
            const r2 = createRule('bind2', ['A(b)', 'B(a)'], ['A(b!1).B(a!1)']);
            const map = buildContactMap([r1, r2]);

            expect(map.edges.length).toBe(1);
            expect(map.edges[0].ruleIds).toContain('bind1');
            expect(map.edges[0].ruleIds).toContain('bind2');
        });
    });

    describe('Compartments', () => {
        it('should create compartment nodes', () => {
            const rule = createRule('r1', ['@cell:A()'], ['@cell:A()']);
            const map = buildContactMap([rule]);

            const cellNode = map.nodes.find(n => n.type === 'compartment' && n.label === 'cell');
            const molNode = map.nodes.find(n => n.type === 'molecule' && n.label === 'A');

            expect(cellNode).toBeDefined();
            expect(molNode?.parent).toBe(cellNode?.id);
        });
    });

    describe('Sorting and Stability', () => {
        it('should assign consistent numeric IDs', () => {
            const rule = createRule('r', ['B()', 'A()'], ['B()', 'A()']);
            const map = buildContactMap([rule]);

            // Molecules sorted: A (0), B (1)
            const nodeA = map.nodes.find(n => n.label === 'A');
            const nodeB = map.nodes.find(n => n.label === 'B');

            expect(nodeA?.id).toBe('0');
            expect(nodeB?.id).toBe('1');
        });
    });
});
