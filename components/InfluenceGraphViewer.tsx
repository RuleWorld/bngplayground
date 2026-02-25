import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import type { InfluenceGraphData } from '../services/visualization/influenceGraph';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';

cytoscape.use(dagre);
cytoscape.use(fcose);

interface InfluenceGraphViewerProps {
  graphData: InfluenceGraphData;
}

type LayoutType = 'circle' | 'cose' | 'fcose' | 'hierarchical' | 'grid';

const LAYOUT_CONFIGS: Record<LayoutType, any> = {
  circle: {
    name: 'circle',
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
    avoidOverlap: true,
    spacingFactor: 1.8,
  },
  cose: {
    name: 'cose',
    animate: true,
    animationDuration: 500,
    padding: 50,
    fit: true,
    nodeRepulsion: 200000,
    idealEdgeLength: 120,
    gravity: 50,
    numIter: 1000,
    nodeDimensionsIncludeLabels: true,
  },
  fcose: {
    name: 'fcose',
    quality: 'proof',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
    nodeRepulsion: 8000,
    idealEdgeLength: 100,
    nodeDimensionsIncludeLabels: true,
  },
  hierarchical: {
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 80,
    rankSep: 120,
    animate: true,
    animationDuration: 400,
    padding: 50,
    fit: true,
    spacingFactor: 1.5,
  },
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  },
};

export const InfluenceGraphViewer: React.FC<InfluenceGraphViewerProps> = ({ graphData }) => {
  const [theme] = useTheme();
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('circle');
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current || graphData.nodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...graphData.nodes.map((node, idx) => ({
        data: {
          id: `rule-${idx}`,
          label: node.ruleName,
          expression: node.ruleExpression,
          ruleIndex: node.ruleIndex,
        },
      })),
      ...graphData.edges.map((edge, idx) => ({
        data: {
          id: `influence-${idx}`,
          source: `rule-${edge.sourceRuleIndex}`,
          target: `rule-${edge.targetRuleIndex}`,
          activation: edge.activation,
          inhibition: edge.inhibition,
          reasons: edge.reasons.join('; '),
          edgeType: getEdgeType(edge.activation, edge.inhibition),
        },
      })),
    ];

    cyRef.current?.destroy();

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'text-halign': 'center',
            'text-valign': 'center',
            'font-size': '11px',
            'background-color': theme === 'dark' ? '#334155' : '#f1f5f9',
            'border-color': theme === 'dark' ? '#64748b' : '#94a3b8',
            'border-width': 2,
            color: theme === 'dark' ? '#e2e8f0' : '#1e293b',
            width: 'label',
            height: 'label',
            padding: '12px',
            shape: 'round-rectangle',
          },
        },
        // Activation edge: green, filled arrow
        {
          selector: 'edge[edgeType = "activation-definite"]',
          style: {
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            width: 2,
            'arrow-scale': 1.2,
          },
        },
        {
          selector: 'edge[edgeType = "activation-possible"]',
          style: {
            'line-color': '#86efac',
            'target-arrow-color': '#86efac',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-style': 'dashed',
            width: 1.5,
            'arrow-scale': 1,
          },
        },
        // Inhibition edge: magenta, flat-head (tee) arrow
        {
          selector: 'edge[edgeType = "inhibition-definite"]',
          style: {
            'line-color': '#ec4899',
            'target-arrow-color': '#ec4899',
            'target-arrow-shape': 'tee',
            'curve-style': 'bezier',
            width: 2,
            'arrow-scale': 1.2,
          },
        },
        {
          selector: 'edge[edgeType = "inhibition-possible"]',
          style: {
            'line-color': '#f9a8d4',
            'target-arrow-color': '#f9a8d4',
            'target-arrow-shape': 'tee',
            'curve-style': 'bezier',
            'line-style': 'dashed',
            width: 1.5,
            'arrow-scale': 1,
          },
        },
        // Mixed activation+inhibition: orange
        {
          selector: 'edge[edgeType = "mixed"]',
          style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'target-arrow-shape': 'diamond',
            'curve-style': 'bezier',
            width: 2,
            'arrow-scale': 1.2,
          },
        },
        // Selected node
        {
          selector: 'node.selected',
          style: {
            'border-color': '#3b82f6',
            'border-width': 3,
            'background-color': theme === 'dark' ? '#1e3a5f' : '#dbeafe',
          },
        },
        // Dimmed elements when a node is selected
        {
          selector: '.influence-dimmed',
          style: {
            opacity: 0.15,
          },
        },
      ],
      layout: { name: 'preset' },
    });

    cyRef.current = cy;

    // Click handler for node selection
    cy.on('tap', 'node', (event) => {
      const nodeId = event.target.data('ruleIndex') as number;
      setSelectedNode(prev => prev === nodeId ? null : nodeId);
    });

    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null);
      }
    });

    // Tooltip on hover
    cy.on('mouseover', 'edge', (event) => {
      const reasons = event.target.data('reasons');
      if (reasons) {
        event.target.style('label', reasons);
        event.target.style('font-size', '9px');
        event.target.style('text-rotation', 'autorotate');
        event.target.style('color', theme === 'dark' ? '#94a3b8' : '#64748b');
      }
    });
    cy.on('mouseout', 'edge', (event) => {
      event.target.style('label', '');
    });

    // Run initial layout
    setIsLayoutRunning(true);
    const layout = cy.layout(LAYOUT_CONFIGS.circle);
    layout.on('layoutstop', () => {
      cy.fit(undefined, 30);
      setIsLayoutRunning(false);
    });
    layout.run();

    // ResizeObserver
    let lastW = 0, lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      if (cyRef.current && w > 0 && h > 0) {
        cyRef.current.resize();
        cyRef.current.fit(undefined, 30);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.off('tap');
      cy.off('mouseover');
      cy.off('mouseout');
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [graphData, theme]);

  // Apply selection highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('selected influence-dimmed');

    if (selectedNode === null) return;

    const nodeEl = cy.nodes().filter(n => n.data('ruleIndex') === selectedNode);
    if (nodeEl.length === 0) return;

    cy.elements().addClass('influence-dimmed');
    nodeEl.removeClass('influence-dimmed').addClass('selected');

    // Show connected edges and their endpoints
    const connectedEdges = nodeEl.connectedEdges();
    connectedEdges.removeClass('influence-dimmed');
    connectedEdges.connectedNodes().removeClass('influence-dimmed');
  }, [selectedNode, graphData]);

  const runLayout = (layoutType: LayoutType = activeLayout) => {
    const cy = cyRef.current;
    if (!cy) return;
    setIsLayoutRunning(true);
    setActiveLayout(layoutType);
    const layout = cy.layout(LAYOUT_CONFIGS[layoutType]);
    layout.on('layoutstop', () => {
      setIsLayoutRunning(false);
      cy.fit(undefined, 30);
    });
    layout.run();
  };

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        No influence data. Parse a model with rules to generate the influence graph.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex flex-col gap-1 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        {/* Row 1: Layout Buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Layout:</span>
          <Button variant={activeLayout === 'hierarchical' ? 'primary' : 'subtle'} onClick={() => runLayout('hierarchical')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Hierarchical (dagre)">
            {isLayoutRunning && activeLayout === 'hierarchical' ? <LoadingSpinner className="w-3 h-3" /> : '↓ Hier'}
          </Button>
          <Button variant={activeLayout === 'cose' ? 'primary' : 'subtle'} onClick={() => runLayout('cose')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Force-Directed (Standard)">
            {isLayoutRunning && activeLayout === 'cose' ? <LoadingSpinner className="w-3 h-3" /> : '⚡ Cose'}
          </Button>
          <Button variant={activeLayout === 'fcose' ? 'primary' : 'subtle'} onClick={() => runLayout('fcose')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Fast Compound Force-Directed">
            {isLayoutRunning && activeLayout === 'fcose' ? <LoadingSpinner className="w-3 h-3" /> : '✨ Smart'}
          </Button>
          <Button variant={activeLayout === 'grid' ? 'primary' : 'subtle'} onClick={() => runLayout('grid')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Grid Layout">
            {isLayoutRunning && activeLayout === 'grid' ? <LoadingSpinner className="w-3 h-3" /> : '▦ Grid'}
          </Button>
          <Button variant={activeLayout === 'circle' ? 'primary' : 'subtle'} onClick={() => runLayout('circle')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Circle Layout">
            {isLayoutRunning && activeLayout === 'circle' ? <LoadingSpinner className="w-3 h-3" /> : '○ Circle'}
          </Button>
        </div>
        {/* Row 2: Actions & Stats */}
        <div className="flex items-center gap-1">
          <Button variant="subtle" onClick={() => cyRef.current?.fit(undefined, 30)} className="text-xs h-6 px-2">Fit</Button>
          <Button variant="subtle" onClick={() => runLayout()} disabled={isLayoutRunning} className="text-xs h-6 px-2">
            {isLayoutRunning ? <LoadingSpinner className="w-3 h-3" /> : 'Redo'}
          </Button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Export:</span>
          <Button variant="subtle" onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'influence_graph.png';
            a.click();
            URL.revokeObjectURL(url);
          }} className="text-xs h-6 px-2">PNG</Button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <div className="flex items-center gap-2 ml-auto text-[10px] text-slate-400 uppercase tracking-tighter">
            <span>{graphData.nodes.length} rules, {graphData.edges.length} edges</span>
            {selectedNode !== null && (
              <button
                className="underline cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                onClick={() => setSelectedNode(null)}
              >
                Clear selection
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div
        ref={containerRef}
        className="h-[600px] w-full rounded-lg border border-stone-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      />

      {/* Legend */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 uppercase">Legend</h4>
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-[#22c55e]" />
            <span className="text-slate-700 dark:text-slate-300">Activation (definite)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-dashed border-[#86efac]" />
            <span className="text-slate-700 dark:text-slate-300">Activation (possible)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-[#ec4899]" />
            <span className="text-slate-700 dark:text-slate-300">Inhibition (definite)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-dashed border-[#f9a8d4]" />
            <span className="text-slate-700 dark:text-slate-300">Inhibition (possible)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-[#f59e0b]" />
            <span className="text-slate-700 dark:text-slate-300">Mixed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getEdgeType(activation: number, inhibition: number): string {
  const hasAct = activation >= 0;
  const hasInh = inhibition >= 0;
  if (hasAct && hasInh) return 'mixed';
  if (hasAct) return activation === 1 ? 'activation-definite' : 'activation-possible';
  if (hasInh) return inhibition === 1 ? 'inhibition-definite' : 'inhibition-possible';
  return 'none';
}
