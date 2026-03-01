/**
 * tsNetworkAnalysis.ts
 *
 * Pure-TypeScript fallback for igraph network analysis.
 * Computes all fields of IgraphAnalysisResult without WebAssembly.
 *
 * Algorithms:
 *  - Degree / in-degree / out-degree: O(E)
 *  - Connected components: BFS O(n+E)
 *  - Betweenness / closeness / diameter / avgPathLength: Brandes BFS, O(n*(n+E))
 *    — capped at n ≤ 300 to stay interactive; larger graphs get 0.
 *  - PageRank: power iteration, O(iter * E)
 *  - Local/global clustering: O(n * d²) undirected triangle counting
 *  - Community detection: label propagation O(iter * E)   (fast approx.)
 *  - Modularity: Q = Σ[A_ij - k_i*k_j/(2m)] * δ(c_i,c_j) / (2m)
 */

import type { IgraphAnalysisResult, NetworkAnalysisPayload } from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build directed AND undirected adjacency lists in one pass. */
function buildAdj(n: number, edges: Array<{ from: number; to: number }>, directed: boolean) {
  const adj: number[][] = Array.from({ length: n }, () => []);     // directed out
  const adjIn: number[][] = Array.from({ length: n }, () => []);   // directed in
  const adjUnd: number[][] = Array.from({ length: n }, () => []);  // undirected

  for (const { from, to } of edges) {
    if (from < 0 || from >= n || to < 0 || to >= n) continue;
    adj[from].push(to);
    adjIn[to].push(from);
    // undirected: add both directions (avoid dupes via set later if needed)
    adjUnd[from].push(to);
    if (directed) {
      adjUnd[to].push(from);
    }
  }

  // For undirected graphs adj === adjUnd conceptually
  if (!directed) {
    for (let i = 0; i < n; i++) {
      adj[i] = adjUnd[i];
      adjIn[i] = adjUnd[i];
    }
  }

  return { adj, adjIn, adjUnd };
}

/** BFS from src returning distance array (-1 = unreachable). */
function bfs(src: number, adj: number[][]): Int32Array {
  const n = adj.length;
  const dist = new Int32Array(n).fill(-1);
  dist[src] = 0;
  const queue = new Uint32Array(n);
  let head = 0; let tail = 0;
  queue[tail++] = src;
  while (head < tail) {
    const u = queue[head++];
    for (const v of adj[u]) {
      if (dist[v] === -1) { dist[v] = dist[u] + 1; queue[tail++] = v; }
    }
  }
  return dist;
}

/**
 * Brandes' algorithm for betweenness centrality (unweighted).
 * Returns raw (unnormalised) betweenness values.
 */
function brandBetweenness(n: number, adj: number[][]): Float64Array {
  const bc = new Float64Array(n);
  const sigma = new Float64Array(n);
  const dist = new Int32Array(n);
  const delta = new Float64Array(n);
  const stack: number[] = [];
  const queue = new Uint32Array(n);
  const pred: number[][] = Array.from({ length: n }, () => []);

  for (let s = 0; s < n; s++) {
    // Reset
    for (let i = 0; i < n; i++) { pred[i].length = 0; sigma[i] = 0; dist[i] = -1; delta[i] = 0; }
    stack.length = 0;
    sigma[s] = 1; dist[s] = 0;
    let head = 0; let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const v = queue[head++];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) { queue[tail++] = w; dist[w] = dist[v] + 1; }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
      }
    }
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) bc[w] += delta[w];
    }
  }
  return bc;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function tsAnalyseGraph(payload: NetworkAnalysisPayload): IgraphAnalysisResult {
  const n = payload.nodeLabels.length;
  const edges = payload.edges;
  const directed = payload.directed ?? false;
  const graphType = payload.graphType ?? 'molecular';

  if (n === 0) {
    return emptyResult(payload.nodeLabels, graphType);
  }

  const { adj, adjIn, adjUnd } = buildAdj(n, edges, directed);

  // ---- Degree ---------------------------------------------------------------
  const outDeg = adj.map(a => a.length);
  const inDeg = adjIn.map(a => a.length);
  const degree = Array.from({ length: n }, (_, i) => directed ? outDeg[i] + inDeg[i] : adjUnd[i].length);

  // ---- Connected components (undirected BFS) --------------------------------
  const compId = new Int32Array(n).fill(-1);
  let components = 0;
  for (let start = 0; start < n; start++) {
    if (compId[start] !== -1) continue;
    const q: number[] = [start];
    compId[start] = components;
    let h = 0;
    while (h < q.length) {
      const u = q[h++];
      for (const v of adjUnd[u]) {
        if (compId[v] === -1) { compId[v] = components; q.push(v); }
      }
    }
    components++;
  }
  const isConnected = components === 1;

  // ---- All-pairs BFS (betweenness, closeness, diameter, avgPath) ------------
  // Only run for small graphs to avoid freezing the browser.
  const BFS_CAP = 300;
  const canRunAllPairs = n <= BFS_CAP;

  let betweenness: Float64Array | null = null;
  let closeness: Float64Array | null = null;
  let diameter = -1;
  let avgPathLength = 0;

  if (canRunAllPairs) {
    const adjForBFS = directed ? adj : adjUnd;

    // Betweenness (Brandes)
    betweenness = brandBetweenness(n, adjForBFS);
    // Normalise into [0,1]
    const bcMax = Math.max(...betweenness, 1);
    for (let i = 0; i < n; i++) betweenness[i] /= bcMax;

    // Closeness + diameter + avgPathLength via BFS from each node
    closeness = new Float64Array(n);
    let totalPairs = 0;
    let totalDist = 0;

    for (let s = 0; s < n; s++) {
      const dist = bfs(s, adjForBFS);
      let reachable = 0; let sumDist = 0;
      for (let t = 0; t < n; t++) {
        if (t === s) continue;
        if (dist[t] >= 0) {
          reachable++;
          sumDist += dist[t];
          if (dist[t] > diameter) diameter = dist[t];
          totalDist += dist[t];
          totalPairs++;
        }
      }
      closeness[s] = reachable > 0 ? (reachable * reachable) / ((n - 1) * sumDist) : 0;
    }
    avgPathLength = totalPairs > 0 ? totalDist / totalPairs : 0;
  }

  // ---- PageRank (power iteration) ------------------------------------------
  const DAMPING = 0.85;
  const PAGERANK_ITER = 50;
  let pr = new Float64Array(n).fill(1 / n);
  const dangling_sum_weight = 1 / n;

  for (let iter = 0; iter < PAGERANK_ITER; iter++) {
    const next = new Float64Array(n).fill(0);
    // Accumulate dangling nodes contribution
    let danglingSum = 0;
    for (let i = 0; i < n; i++) { if (outDeg[i] === 0) danglingSum += pr[i]; }
    for (let v = 0; v < n; v++) {
      // Out-neighbours of v contribute to v's rank
      const neighbours = directed ? adjIn[v] : adjUnd[v];
      for (const u of neighbours) {
        const od = directed ? outDeg[u] : adjUnd[u].length;
        if (od > 0) next[v] += DAMPING * (pr[u] / od);
      }
      next[v] += DAMPING * danglingSum * dangling_sum_weight + (1 - DAMPING) / n;
    }
    pr = next;
  }
  // Normalise
  const prMax = Math.max(...pr, 1e-12);
  for (let i = 0; i < n; i++) pr[i] /= prMax;

  // ---- Local clustering coefficient (undirected triangles) -----------------
  // Use a Set per neighbour for fast lookup
  const neighbourSets = adjUnd.map(a => new Set(a));
  const localClustering = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const nbrs = adjUnd[v];
    const d = nbrs.length;
    if (d < 2) continue;
    let triangles = 0;
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        if (neighbourSets[nbrs[i]].has(nbrs[j])) triangles++;
      }
    }
    localClustering[v] = (2 * triangles) / (d * (d - 1));
  }

  // Global clustering = 3 * triangles / triplets
  let totalTriangles = 0;
  for (let v = 0; v < n; v++) {
    for (const u of adjUnd[v]) {
      for (const w of adjUnd[v]) {
        if (u < w && neighbourSets[u].has(w)) totalTriangles++;
      }
    }
  }
  const totalTriplets = degree.reduce((s, d) => s + d * (d - 1) / 2, 0);
  const globalClustering = totalTriplets > 0 ? (3 * totalTriangles) / totalTriplets : 0;

  // ---- Community detection (label propagation) -----------------------------
  const labels = Array.from({ length: n }, (_, i) => i);
  const LP_ITER = 20;
  for (let iter = 0; iter < LP_ITER; iter++) {
    // Random order (Fisher-Yates)
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let changed = false;
    for (const v of order) {
      const nbrs = adjUnd[v];
      if (nbrs.length === 0) continue;
      const freq = new Map<number, number>();
      for (const u of nbrs) { freq.set(labels[u], (freq.get(labels[u]) ?? 0) + 1); }
      let best = labels[v]; let bestCnt = 0;
      for (const [lbl, cnt] of freq) { if (cnt > bestCnt) { bestCnt = cnt; best = lbl; } }
      if (best !== labels[v]) { labels[v] = best; changed = true; }
    }
    if (!changed) break;
  }
  // Remap labels to compact 0-based community IDs
  const labelMap = new Map<number, number>();
  let nextCid = 0;
  const communityIds = labels.map(l => {
    if (!labelMap.has(l)) labelMap.set(l, nextCid++);
    return labelMap.get(l)!;
  });
  const communityCount = nextCid;

  // ---- Modularity Q --------------------------------------------------------
  const m = edges.length;
  let Q = 0;
  if (m > 0) {
    for (const { from, to } of edges) {
      if (communityIds[from] === communityIds[to]) {
        Q += 1 - (degree[from] * degree[to]) / (2 * m);
      }
    }
    Q /= 2 * m;
  }

  // ---- Assemble result -----------------------------------------------------
  return {
    nodeCount: n,
    edgeCount: edges.length,
    nodeLabels: payload.nodeLabels,
    graphType,
    degree,
    inDegree: Array.from(inDeg),
    outDegree: Array.from(outDeg),
    betweenness: betweenness ? Array.from(betweenness) : new Array(n).fill(0),
    closeness:   closeness   ? Array.from(closeness)   : new Array(n).fill(0),
    pagerank:    Array.from(pr),
    localClustering: Array.from(localClustering),
    communityIds,
    communityCount,
    modularity: Math.max(0, Q),
    globalClustering,
    diameter: canRunAllPairs ? diameter : -1,
    avgPathLength: canRunAllPairs ? avgPathLength : 0,
    components,
    isConnected,
  };
}

function emptyResult(
  nodeLabels: string[],
  graphType: IgraphAnalysisResult['graphType'],
): IgraphAnalysisResult {
  const n = nodeLabels.length;
  return {
    nodeCount: n, edgeCount: 0, nodeLabels, graphType,
    degree: new Array(n).fill(0), inDegree: new Array(n).fill(0), outDegree: new Array(n).fill(0),
    betweenness: new Array(n).fill(0), closeness: new Array(n).fill(0),
    pagerank: new Array(n).fill(1 / Math.max(n, 1)),
    localClustering: new Array(n).fill(0),
    communityIds: Array.from({ length: n }, (_, i) => i),
    communityCount: n, modularity: 0, globalClustering: 0,
    diameter: 0, avgPathLength: 0, components: n, isConnected: n <= 1,
  };
}
