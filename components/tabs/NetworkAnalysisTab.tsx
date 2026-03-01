/**
 * NetworkAnalysisTab.tsx
 *
 * igraph-powered graph-theory analysis tab for BNGL models.
 * Builds a graph from the model (species/molecule/regulatory), sends it to
 * the igraph WASM worker, and displays centrality metrics, community structure,
 * and a degree-distribution histogram.
 *
 * Follows the same Cytoscape viewer pattern as ARGraphViewer / ContactMapViewer:
 * same LAYOUT_CONFIGS, Button toolbar, forceViewport fade-in, ResizeObserver, PNG export.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { BNGLModel, IgraphAnalysisResult, NetworkAnalysisPayload } from '../../types';
import { buildGraphPayload } from '../../services/igraphNetworkAnalysis';
import { tsAnalyseGraph } from '../../services/tsNetworkAnalysis';
import { bnglService } from '../../services/bnglService';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';

// Register layout plugins (idempotent — same pattern as ARGraphViewer)
cytoscape.use(dagre);
cytoscape.use(fcose);

// ---- Layout configs (identical to ARGraphViewer / ContactMapViewer) --------

type LayoutType = 'hierarchical' | 'fcose' | 'grid' | 'circle';

const LAYOUT_CONFIGS: Record<LayoutType, any> = {
  hierarchical: {
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 80,
    rankSep: 120,
    edgeSep: 20,
    animate: true,
    animationDuration: 400,
    padding: 50,
    fit: true,
    spacingFactor: 1.5,
    nodeDimensionsIncludeLabels: true,
  },
  fcose: {
    name: 'fcose',
    quality: 'proof',
    randomize: false,
    animate: true,
    animationDuration: 1000,
    fit: true,
    padding: 30,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    step: 'all',
    nodeRepulsion: 4500,
    idealEdgeLength: 50,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.25,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 10,
    tilingPaddingHorizontal: 10,
  },
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
    avoidOverlap: true,
    avoidOverlapPadding: 15,
    condense: false,
    nodeDimensionsIncludeLabels: true,
  },
  circle: {
    name: 'circle',
    animate: true,
    animationDuration: 300,
    padding: 40,
    fit: true,
    avoidOverlap: true,
    spacingFactor: 1.5,
    nodeDimensionsIncludeLabels: true,
  },
};

// ---- Types -----------------------------------------------------------------

type GraphType = NetworkAnalysisPayload['graphType'];
type SortKey = 'degree' | 'betweenness' | 'closeness' | 'pagerank' | 'localClustering' | 'communityIds';

interface Props {
  model: BNGLModel | null;
}

// ---- Helpers ---------------------------------------------------------------

/** Generate a distinct HSL color string for a community index. */
function communityColor(id: number, total: number): string {
  const hue = total <= 1 ? 210 : (id * (360 / total)) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

/** Build degree frequency histogram data for Recharts. */
function buildDegreeHistogram(degrees: number[]): Array<{ degree: number; count: number }> {
  const freq: Record<number, number> = {};
  for (const d of degrees) freq[d] = (freq[d] ?? 0) + 1;
  return Object.entries(freq)
    .map(([d, c]) => ({ degree: parseInt(d, 10), count: c }))
    .sort((a, b) => a.degree - b.degree);
}

/** Format a number to at most 4 significant digits. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toString();
  return n.toPrecision(4).replace(/\.?0+$/, '');
}

// ---- Component -------------------------------------------------------------

export const NetworkAnalysisTab: React.FC<Props> = ({ model }) => {
  // Analysis state
  const [graphType, setGraphType] = useState<GraphType>('molecular');
  const [result, setResult] = useState<IgraphAnalysisResult | null>(null);
  const [currentPayload, setCurrentPayload] = useState<NetworkAnalysisPayload | null>(null);
  const [expandedReactionModel, setExpandedReactionModel] = useState<BNGLModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpandingNetwork, setIsExpandingNetwork] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasmMissing, setWasmMissing] = useState(false);

  // Table state
  const [sortKey, setSortKey] = useState<SortKey>('pagerank');
  const [sortAsc, setSortAsc] = useState(false);

  // Cytoscape state — matches ARGraphViewer / ContactMapViewer exactly
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [layoutDone, setLayoutDone] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('fcose');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const hasReactions = (model?.reactions?.length ?? 0) > 0;
  const hasExpandedReactions = (expandedReactionModel?.reactions?.length ?? 0) > 0;
  const hasReactionNetwork = hasReactions || hasExpandedReactions;
  const hasMolecules = (model?.moleculeTypes?.length ?? 0) > 0;

  // Keep a ref to the latest runAnalysis so auto-run effects don't capture a
  // stale closure (runAnalysis is recreated when model/graphType change).
  const runAnalysisRef = useRef<() => Promise<void>>(async () => {});

  // When the parsed model changes, clear any reaction-network expansion cache
  // tied to the previous model object.
  useEffect(() => {
    setExpandedReactionModel(null);
  }, [model]);

  // Auto-select best available graph type when model changes.
  // NOTE: do NOT include graphType in deps — that would cause an instant reset
  // loop when the user clicks the Reaction button while !hasReactions.
  // This effect is intentionally only model/availability-driven.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!model) return;
    // Only auto-redirect when the current selection becomes unavailable because
    // the model changed (e.g., reactions were removed from a newly parsed model).
    setGraphType((prev) => {
      if (prev === 'reaction' && !hasReactionNetwork) {
        return hasMolecules ? 'molecular' : 'regulatory';
      }
      return prev;
    });
  }, [model, hasReactionNetwork, hasMolecules]); // graphType intentionally omitted

  // Run analysis (sends payload to igraph WASM worker)
  const runAnalysis = useCallback(async () => {
    if (!model) return;
    setIsLoading(true);
    setError(null);
    setWasmMissing(false);
    setLayoutDone(false);
    try {
      // Auto-expand reaction network if needed
      let sourceModel = graphType === 'reaction' && expandedReactionModel ? expandedReactionModel : model;
      if (graphType === 'reaction' && (sourceModel.reactions?.length ?? 0) === 0) {
        setIsExpandingNetwork(true);
        try {
          sourceModel = await bnglService.generateNetwork(sourceModel, {}, {
            timeoutMs: 120_000,
            description: 'Network expansion for Reaction graph',
          });
          setExpandedReactionModel(sourceModel);
        } catch (expandErr: unknown) {
          const msg = expandErr instanceof Error ? expandErr.message : String(expandErr);
          throw new Error(`Network expansion failed: ${msg}`);
        } finally {
          setIsExpandingNetwork(false);
        }
      }
      const payload = buildGraphPayload(sourceModel, graphType);
      let analysisResult;
      try {
        analysisResult = await bnglService.analyseNetwork(payload, {
          timeoutMs: 60_000,
          description: `igraph analysis (${graphType})`,
        });
      } catch (igraphErr: unknown) {
        const msg = igraphErr instanceof Error ? igraphErr.message : String(igraphErr);
        if (
          msg.includes('igraph_loader') ||
          msg.includes('igraph.wasm') ||
          msg.includes('Failed to resolve') ||
          msg.includes('WASM not built') ||
          // WebAssembly.RuntimeError from WASM trap (e.g. Louvain RNG call_indirect crash)
          msg.includes('index out of bounds') ||
          msg.includes('RuntimeError') ||
          msg.includes('WebAssembly') ||
          msg.includes('memory access') ||
          msg.includes('unreachable')
        ) {
          // igraph WASM not available or crashed — use pure-TypeScript fallback
          setWasmMissing(true);
          analysisResult = tsAnalyseGraph(payload);
        } else {
          throw igraphErr;
        }
      }
      setCurrentPayload(payload);
      setResult(analysisResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [model, graphType, expandedReactionModel]);

  // Always keep the ref pointing at the latest version of runAnalysis.
  useEffect(() => { runAnalysisRef.current = runAnalysis; });

  // Auto-run whenever the model or graph type changes (covers tab-open + type switch).
  useEffect(() => {
    if (!model) return;
    runAnalysisRef.current();
  }, [model, graphType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build Cytoscape instance when result arrives — matches ARGraphViewer pattern
  useEffect(() => {
    if (!containerRef.current || !result || !currentPayload) return;

    const isDark = document.documentElement.classList.contains('dark');
    const edgeColor = isDark ? '#94a3b8' : '#555555';
    const communityCount = Math.max(1, result.communityCount);
    const directed = result.graphType === 'reaction' || result.graphType === 'regulatory';

    // Build elements — nodes from result metrics, edges from stored payload
    // Normalize PageRank so the actual range maps to 20–52 px
    const prValues = result.pagerank;
    const maxPR = Math.max(...prValues, 1e-9);
    const minPR = Math.min(...prValues);
    const prRange = maxPR - minPR;

    const elements: cytoscape.ElementDefinition[] = [
      ...result.nodeLabels.map((label, i) => {
        const cId = result.communityIds[i] ?? 0;
        const pr = prValues[i] ?? 0;
        const normalizedPR = prRange > 1e-9 ? (pr - minPR) / prRange : 0.5;
        const nodeSize = Math.round(20 + normalizedPR * 32); // 20–52 px
        return {
          data: {
            id: String(i),
            label: label.length > 18 ? label.slice(0, 16) + '…' : label,
            fullLabel: label,
            community: cId,
            pagerank: pr,
            color: communityColor(cId, communityCount),
            nodeSize,
          },
        };
      }),
      ...currentPayload.edges.map((edge, idx) => ({
        data: { id: `e${idx}`, source: String(edge.from), target: String(edge.to) },
      })),
    ];

    cyRef.current?.destroy();
    setLayoutDone(false);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            'font-size': 10,
            color: '#ffffff',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-outline-color': 'data(color)',
            'text-outline-width': 2,
            'text-wrap': 'none',
            'text-max-width': '10000px',
            shape: 'ellipse',
            width: 'data(nodeSize)' as any,
            height: 'data(nodeSize)' as any,
            'border-color': '#ffffff',
            'border-width': 1.5,
            'border-opacity': 0.35,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#0ea5e9', 'border-opacity': 1 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'curve-style': 'bezier',
            'line-color': edgeColor,
            'line-opacity': 0.5,
            'target-arrow-color': edgeColor,
            'target-arrow-shape': directed ? 'triangle' : 'none',
            'arrow-scale': 0.9,
          },
        },
        {
          selector: 'edge:selected',
          style: { 'line-color': '#0ea5e9', 'target-arrow-color': '#0ea5e9', 'line-opacity': 1, width: 2.5 },
        },
      ],
      layout: { name: 'preset' },
    });

    // forceViewport + layoutDone pattern — same as ARGraphViewer
    cy.ready(() => {
      const initialLayout = cy.layout({ ...LAYOUT_CONFIGS.fcose, animate: false });
      initialLayout.on('layoutstop', () => {
        const forceViewport = () => { cyRef.current?.resize(); cyRef.current?.fit(undefined, 30); };
        requestAnimationFrame(() => {
          forceViewport();
          setTimeout(forceViewport, 50);
          setTimeout(forceViewport, 150);
          setTimeout(forceViewport, 300);
          setTimeout(() => { setLayoutDone(true); setIsLayoutRunning(false); }, 50);
        });
      });
      initialLayout.run();
    });

    cyRef.current = cy;

    // ResizeObserver — same as ARGraphViewer
    const ro = new ResizeObserver(() => { cyRef.current?.resize(); });
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [result, currentPayload]);

  // runLayout — same as ARGraphViewer
  const runLayout = (type: LayoutType = activeLayout) => {
    const cy = cyRef.current;
    if (!cy) return;
    setIsLayoutRunning(true);
    setActiveLayout(type);
    try {
      const l = cy.layout(LAYOUT_CONFIGS[type]);
      l.run();
      l.on('layoutstop', () => { setIsLayoutRunning(false); cy.fit(undefined, 30); });
    } catch (err) {
      console.error('Network Analysis layout failed', err);
      setIsLayoutRunning(false);
    }
  };

  const handleExportPNG = () => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `network_analysis_${result?.graphType ?? 'graph'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Export PNG failed', err); }
  };

  // Table helpers
  const sortedRows = useMemo(() => {
    if (!result) return [];
    const rows = result.nodeLabels.map((label, i) => ({
      label,
      degree: result.degree[i] ?? 0,
      inDegree: result.inDegree[i] ?? 0,
      outDegree: result.outDegree[i] ?? 0,
      betweenness: result.betweenness[i] ?? 0,
      closeness: result.closeness[i] ?? 0,
      pagerank: result.pagerank[i] ?? 0,
      localClustering: result.localClustering[i] ?? 0,
      communityIds: result.communityIds[i] ?? 0,
    }));
    rows.sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortAsc ? va - vb : vb - va;
    });
    return rows;
  }, [result, sortKey, sortAsc]);

  const degreeHistogram = useMemo(() => (result ? buildDegreeHistogram(result.degree) : []), [result]);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader: React.FC<{ colKey: SortKey; label: string }> = ({ colKey, label }) => (
    <th
      onClick={() => handleSortClick(colKey)}
      className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer hover:text-teal-600 dark:hover:text-teal-400 select-none whitespace-nowrap"
    >
      {label}{sortKey === colKey && <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>}
    </th>
  );

  // ---- Render ---------------------------------------------------------------

  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500 text-sm gap-2">
        <span className="text-3xl">🕸️</span>
        <p>Parse a BNGL model to enable network analysis.</p>
      </div>
    );
  }

  const directed = result?.graphType === 'reaction' || result?.graphType === 'regulatory';

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Graph type selector + run button */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Graph Type
          </label>
          <div className="flex gap-1">
            {(['molecular', 'reaction', 'regulatory'] as GraphType[]).map((gt) => (
              <Button
                key={gt}
                variant={graphType === gt ? 'primary' : 'subtle'}
                onClick={() => setGraphType(gt)}
                className="text-xs h-7 px-2.5"
              >
                {gt === 'molecular' ? '🧬 Molecule' : gt === 'reaction' ? '⚗️ Reaction' : '🔀 Regulatory'}
                {gt === 'reaction' && !hasReactionNetwork && ' ⚠️'}
              </Button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          onClick={runAnalysis}
          disabled={isLoading || !model}
          className="text-xs h-7 px-3 flex items-center gap-1.5"
        >
          {isLoading ? <LoadingSpinner className="w-3 h-3" /> : '▶'}
          {isLoading ? (isExpandingNetwork ? 'Expanding…' : 'Analysing…') : 'Run Analysis'}
        </Button>
      </div>

      {/* Reaction graph — auto-expand info */}
      {graphType === 'reaction' && !hasReactionNetwork && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          <span>
            <strong>Reaction graph requires a reaction network.</strong>{' '}
            Click <strong>Run Analysis</strong> to auto-generate the network, or go to the{' '}
            <strong>Network</strong> tab and click <strong>Generate Network</strong> first.
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          <strong>Analysis failed:</strong> {error}
        </div>
      )}

      {/* WASM not available — non-blocking info note shown alongside results */}
      {wasmMissing && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          <span>
            <strong>Using TypeScript fallback</strong> — igraph WASM unavailable (not built or crashed).
            Results are approximate. Run <code className="font-mono">wasm-igraph/build_wasm.bat</code> for full igraph accuracy.
          </span>
        </div>
      )}

      {/* Loading placeholder */}
      {isLoading && (
        <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 gap-2 text-sm">
          <LoadingSpinner className="w-8 h-8" />
          <span>{isExpandingNetwork ? 'Expanding reaction network…' : 'Running network analysis…'}</span>
        </div>
      )}

      {/* Results */}
      {result && !isLoading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {[
              { label: 'Nodes', value: result.nodeCount },
              { label: 'Edges', value: result.edgeCount },
              { label: 'Comm.', value: result.communityCount },
              { label: 'Comp.', value: result.components },
              { label: 'Diameter', value: fmt(result.diameter) },
              { label: 'Avg Path', value: fmt(result.avgPathLength) },
              { label: 'Clust.', value: fmt(result.globalClustering) },
              { label: 'Modularity', value: fmt(result.modularity) },
              { label: 'Connected', value: result.isConnected ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-2 flex flex-col min-w-0">
                <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 truncate">{label}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm mt-0.5 truncate">{String(value)}</span>
              </div>
            ))}
          </div>

          {/* Community graph (Cytoscape) + degree distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ---- Cytoscape viewer — follows ARGraphViewer / ContactMapViewer pattern ---- */}
            <div className="flex flex-col gap-2">
              {/* Toolbar */}
              <div className="flex items-center gap-1 flex-wrap bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Layout:</span>
                {(['hierarchical', 'fcose', 'grid', 'circle'] as LayoutType[]).map(lt => {
                  const labels: Record<LayoutType, string> = {
                    hierarchical: '↓ Hier', fcose: '✨ Smart', grid: '▦ Grid', circle: '○ Circle',
                  };
                  const titles: Record<LayoutType, string> = {
                    hierarchical: 'Hierarchical (dagre)', fcose: 'Force-Directed (fCoSE)', grid: 'Grid', circle: 'Circle',
                  };
                  return (
                    <Button key={lt} variant={activeLayout === lt ? 'primary' : 'subtle'} onClick={() => runLayout(lt)} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title={titles[lt]}>
                      {isLayoutRunning && activeLayout === lt ? <LoadingSpinner className="w-3 h-3" /> : labels[lt]}
                    </Button>
                  );
                })}
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                <Button variant="subtle" onClick={() => cyRef.current?.fit(undefined, 30)} className="text-xs h-6 px-2">Fit</Button>
                <Button variant="subtle" onClick={() => runLayout()} disabled={isLayoutRunning} className="text-xs h-6 px-2">Redo</Button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Export:</span>
                <Button variant="subtle" onClick={handleExportPNG} className="text-xs h-6 px-2">PNG</Button>
              </div>

              {/* Graph canvas */}
              <div className="relative w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                {!layoutDone && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-lg">
                    <LoadingSpinner className="w-8 h-8 text-[#21808D]" />
                    <span className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-400 animate-pulse">Computing Layout…</span>
                  </div>
                )}
                <div
                  ref={containerRef}
                  className={`w-full h-[360px] rounded-lg transition-opacity duration-300 ${layoutDone ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 uppercase">Legend</span>
                {Array.from({ length: Math.min(result.communityCount, 6) }, (_, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: communityColor(i, result.communityCount) }} />
                    <span className="text-xs text-slate-600 dark:text-slate-300">C{i}</span>
                  </div>
                ))}
                {result.communityCount > 6 && <span className="text-xs text-slate-400">+{result.communityCount - 6} more</span>}
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-4 h-0 border-t border-slate-400" />
                  <span className="text-xs text-slate-500">{directed ? 'directed edge' : 'edge'}</span>
                </div>
                <span className="text-xs text-slate-400 italic">size ∝ PageRank</span>
              </div>
            </div>

            {/* ---- Degree distribution (Recharts) ---- */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Degree Distribution
              </div>
              <div className="p-2 flex-1" style={{ minHeight: 280 }}>
                {degreeHistogram.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 text-xs">No degree data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={degreeHistogram} margin={{ top: 8, right: 12, bottom: 28, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.2)" />
                      <XAxis dataKey="degree" label={{ value: 'Degree', position: 'insideBottom', offset: -14, fontSize: 11 }} tick={{ fontSize: 10 }} />
                      <YAxis label={{ value: 'Nodes', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, 'Nodes']} labelFormatter={(d) => `Degree: ${d}`} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {degreeHistogram.map((_entry, idx) => (
                          <Cell key={idx} fill={communityColor(idx, degreeHistogram.length)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Centrality table */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Node Centrality Metrics
              <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">— click column headers to sort</span>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Node</th>
                    <SortHeader colKey="degree" label="Degree" />
                    {directed && (
                      <>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">In</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Out</th>
                      </>
                    )}
                    <SortHeader colKey="betweenness" label="Betweenness" />
                    <SortHeader colKey="closeness" label="Closeness" />
                    <SortHeader colKey="pagerank" label="PageRank" />
                    <SortHeader colKey="localClustering" label="Local Clust." />
                    <SortHeader colKey="communityIds" label="Community" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {sortedRows.slice(0, 200).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-3 py-1.5 font-mono text-slate-800 dark:text-slate-200 max-w-32 truncate" title={row.label}>
                        {row.label.length > 28 ? row.label.slice(0, 26) + '…' : row.label}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{row.degree}</td>
                      {directed && (
                        <>
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{row.inDegree}</td>
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{row.outDegree}</td>
                        </>
                      )}
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{fmt(row.betweenness)}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{fmt(row.closeness)}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{fmt(row.pagerank)}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{fmt(row.localClustering)}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: communityColor(row.communityIds, result.communityCount) }}
                        >
                          C{row.communityIds}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedRows.length > 200 && (
                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                  Showing top 200 of {sortedRows.length} nodes — sort to see top ranked nodes.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
