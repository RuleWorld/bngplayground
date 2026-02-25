/**
 * Tests for modelComparison — verifies adjacency matrix building
 * and model diff logic.
 */
import { describe, it, expect } from 'vitest';
import { buildAdjacencyMatrix, compareModels } from '../../services/visualization/modelComparison';
import type { ContactMap } from '../../types/visualization';

const makeContactMap = (
    nodes: Array<{ id: string; label: string; type: string; parent?: string; isGroup?: boolean }>,
    edges: Array<{ from: string; to: string }>,
): ContactMap => ({
    nodes: nodes.map(n => ({ ...n, interactionType: undefined, ruleIds: undefined, ruleLabels: undefined, componentPair: undefined })),
    edges: edges.map(e => ({ ...e, interactionType: undefined, ruleIds: undefined, ruleLabels: undefined, componentPair: undefined })),
} as any);

describe('buildAdjacencyMatrix', () => {
    it('builds adjacency from a simple contact map', () => {
        const cmap = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
                { id: '1', label: 'B', type: 'molecule' },
                { id: '1.0', label: 'b', type: 'component', parent: '1' },
            ],
            [{ from: '0.0', to: '1.0' }],
        );

        const adj = buildAdjacencyMatrix(cmap);
        expect(adj.labels).toContain('A');
        expect(adj.labels).toContain('B');
        expect(adj.labels).toContain('A.b');
        expect(adj.labels).toContain('B.b');

        // A.b—B.b edge should be in the matrix
        const ai = adj.labels.indexOf('A.b');
        const bi = adj.labels.indexOf('B.b');
        expect(adj.matrix[ai][bi]).toBe(true);
        expect(adj.matrix[bi][ai]).toBe(true);
    });
});

describe('compareModels', () => {
    it('finds shared connections between identical models', () => {
        const cmap = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
            ],
            [],
        );
        const adj = buildAdjacencyMatrix(cmap);
        const result = compareModels(adj, adj);

        expect(result.summary.addedInB).toBe(0);
        expect(result.summary.removedFromA).toBe(0);
        expect(result.summary.shared).toBe(result.summary.totalA);
    });

    it('detects added edges in model B', () => {
        const cmapA = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
            ],
            [],
        );
        const cmapB = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
                { id: '1', label: 'B', type: 'molecule' },
                { id: '1.0', label: 'b', type: 'component', parent: '1' },
            ],
            [{ from: '0.0', to: '1.0' }],
        );

        const result = compareModels(
            buildAdjacencyMatrix(cmapA),
            buildAdjacencyMatrix(cmapB),
        );

        expect(result.summary.addedInB).toBeGreaterThan(0);
    });

    it('detects removed edges from model A', () => {
        const cmapA = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
                { id: '1', label: 'B', type: 'molecule' },
                { id: '1.0', label: 'b', type: 'component', parent: '1' },
            ],
            [{ from: '0.0', to: '1.0' }],
        );
        const cmapB = makeContactMap(
            [
                { id: '0', label: 'A', type: 'molecule' },
                { id: '0.0', label: 'b', type: 'component', parent: '0' },
            ],
            [],
        );

        const result = compareModels(
            buildAdjacencyMatrix(cmapA),
            buildAdjacencyMatrix(cmapB),
        );

        expect(result.summary.removedFromA).toBeGreaterThan(0);
    });
});
