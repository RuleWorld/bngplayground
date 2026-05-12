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
});
