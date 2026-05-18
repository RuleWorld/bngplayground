import { describe, it, expect } from 'vitest';
import { tsAnalyseGraph } from '../services/tsNetworkAnalysis';
import type { NetworkAnalysisPayload } from '../types';

describe('tsNetworkAnalysis', () => {
  it('should compute analysis result without errors', () => {
    const n = 50;
    const edges = [];
    for (let i = 0; i < n; i++) {
      edges.push({ from: i, to: (i + 1) % n });
    }

    const payload: NetworkAnalysisPayload = {
      nodeLabels: Array.from({ length: n }, (_, i) => `Node ${i}`),
      edges,
      directed: false,
      graphType: 'molecular'
    };

    const res = tsAnalyseGraph(payload);
    expect(res).toBeDefined();
    expect(res.nodeCount).toBe(50);
    expect(res.communityCount).toBeGreaterThan(0);
  });

  it('should handle an empty graph', () => {
    const payload: NetworkAnalysisPayload = {
      nodeLabels: [],
      edges: [],
      directed: false,
      graphType: 'molecular'
    };
    const res = tsAnalyseGraph(payload);
    expect(res.nodeCount).toBe(0);
    expect(res.edgeCount).toBe(0);
    expect(res.degree).toEqual([]);
    expect(res.betweenness).toEqual([]);
    expect(res.closeness).toEqual([]);
    expect(res.pagerank).toEqual([]);
  });

  it('should compute correct centralities for an undirected star graph', () => {
    // 0 is center, 1, 2, 3 are leaves
    const payload: NetworkAnalysisPayload = {
      nodeLabels: ['Center', 'Leaf1', 'Leaf2', 'Leaf3'],
      edges: [
        { from: 0, to: 1 }, { from: 1, to: 0 },
        { from: 0, to: 2 }, { from: 2, to: 0 },
        { from: 0, to: 3 }, { from: 3, to: 0 },
      ],
      directed: false,
      graphType: 'molecular'
    };
    const res = tsAnalyseGraph(payload);

    // Degrees: Center has 3, leaves have 1
    expect(res.degree).toEqual([3, 1, 1, 1]);

    // Betweenness (unnormalized): Center is on all shortest paths between leaves (3 pairs) -> 3.
    // Leaves are on 0 shortest paths.
    expect(res.betweenness).toEqual([1, 0, 0, 0]); // Note: tsNetworkAnalysis normalizes betweenness by max value

    // Closeness:
    // Center -> all 3 leaves are dist 1. sumDist = 3. closeness = (3*3)/(3*3) = 1
    // Leaf -> center is dist 1, 2 leaves are dist 2. sumDist = 5. closeness = (3*3)/(3*5) = 9/15 = 0.6
    expect(res.closeness[0]).toBeCloseTo(1);
    expect(res.closeness[1]).toBeCloseTo(0.6);
    expect(res.closeness[2]).toBeCloseTo(0.6);
    expect(res.closeness[3]).toBeCloseTo(0.6);
  });

  it('should compute correct centralities for an undirected line graph', () => {
    // 0 - 1 - 2 - 3
    const payload: NetworkAnalysisPayload = {
      nodeLabels: ['A', 'B', 'C', 'D'],
      edges: [
        { from: 0, to: 1 }, { from: 1, to: 0 },
        { from: 1, to: 2 }, { from: 2, to: 1 },
        { from: 2, to: 3 }, { from: 3, to: 2 },
      ],
      directed: false,
      graphType: 'molecular'
    };
    const res = tsAnalyseGraph(payload);

    // Degrees
    expect(res.degree).toEqual([1, 2, 2, 1]);

    // Betweenness: Ends are 0, Middle nodes are 2 (paths: 0-1-2, 0-1-2-3 for node 1, etc but normalized max is what we output if it was normalized, here it is raw: Node 1 is on 0-2 and 0-3. Node 2 is on 0-3 and 1-3)
    // Wait, tsNetworkAnalysis normalizes betweenness by max value.
    // Actually in tsNetworkAnalysis: "const bcMax = Math.max(...betweenness, 1); for (...) betweenness[i] /= bcMax;"
    // So the max betweenness becomes 1.
    // Let's check max before normalization: Node 1 is on 0-2 and 0-3 -> 2. So max is 2.
    // Therefore Node 1 gets 1, Node 2 gets 1.
    expect(res.betweenness).toEqual([0, 1, 1, 0]);

    // Closeness:
    // Node 0: dists = 1, 2, 3. sum = 6. closeness = (3*3)/(3*6) = 0.5
    // Node 1: dists = 1, 1, 2. sum = 4. closeness = (3*3)/(3*4) = 0.75
    expect(res.closeness[0]).toBeCloseTo(0.5);
    expect(res.closeness[1]).toBeCloseTo(0.75);
    expect(res.closeness[2]).toBeCloseTo(0.75);
    expect(res.closeness[3]).toBeCloseTo(0.5);
  });

  it('should compute correct centralities for a directed line graph', () => {
    // 0 -> 1 -> 2 -> 3
    const payload: NetworkAnalysisPayload = {
      nodeLabels: ['A', 'B', 'C', 'D'],
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
      directed: true,
      graphType: 'molecular'
    };
    const res = tsAnalyseGraph(payload);

    // Degrees: directed so in+out
    expect(res.degree).toEqual([1, 2, 2, 1]);
    expect(res.outDegree).toEqual([1, 1, 1, 0]);
    expect(res.inDegree).toEqual([0, 1, 1, 1]);

    // Betweenness: Node 1 is on 0-2, 0-3. Node 2 is on 0-3, 1-3.
    // Normalized so middle nodes are 1.
    expect(res.betweenness).toEqual([0, 1, 1, 0]);

    // Closeness (directed: reachable only):
    // Node 0: reachable=3, sumDist=6. (3*3)/(3*6) = 0.5
    // Node 1: reachable=2, sumDist=3. (2*2)/(3*3) = 4/9 = 0.444...
    // Node 2: reachable=1, sumDist=1. (1*1)/(3*1) = 1/3 = 0.333...
    // Node 3: reachable=0, sumDist=0. 0
    expect(res.closeness[0]).toBeCloseTo(0.5);
    expect(res.closeness[1]).toBeCloseTo(0.4444444444444444);
    expect(res.closeness[2]).toBeCloseTo(0.3333333333333333);
    expect(res.closeness[3]).toBeCloseTo(0);
  });
});
