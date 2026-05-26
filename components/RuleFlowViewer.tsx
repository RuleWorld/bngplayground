import React, { useEffect, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { RuleFlowGraph } from '../types/visualization';

cytoscape.use(dagre);

interface RuleFlowViewerProps {
  graph: RuleFlowGraph;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string) => void;
}

export const RuleFlowViewer: React.FC<RuleFlowViewerProps> = ({ graph, selectedRuleId, onSelectRule }) => {
  const [theme] = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const elements = [
      ...graph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.displayName,
          type: node.type,
          layer: node.layer,
          color: node.color,
          fgColor: node.color ? (function hexToFg(hex:string){
            // naive fg: black for bright, white for dark
            return parseInt(hex.replace('#', ''), 16) > 0xffffff / 2 ? '#0f172a' : '#ffffff';
          })(node.color) : undefined,
        },
      })),
      ...graph.edges.map((edge, index) => ({
        data: {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          label:
            edge.producedSpecies.length > 0
              ? edge.producedSpecies.slice(0, 2).join(', ') + (edge.producedSpecies.length > 2 ? '…' : '')
              : '',
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
            'text-halign': 'center',
            'text-valign': 'center',
            'font-size': '11px',
            shape: 'round-rectangle',
            width: 150,
            height: 46,
            // avoid mapping to data(color) here — use a presence selector below
            'border-width': 1,
            'border-color': theme === 'dark' ? '#94a3b8' : '#0f172a',
          },
        },
          {
            selector: 'node[color]',
            style: {
              'background-color': 'data(color)',
              color: 'data(fgColor)',
            },
          },
        {
          selector: 'node[type = "binding"]',
          style: { 'background-color': '#59A14F' },
        },
        {
          selector: 'node[type = "modification"]',
          style: { 'background-color': '#F28E2B' },
        },
        {
          selector: 'node[type = "synthesis"]',
          style: { 'background-color': '#76B7B2', color: theme === 'dark' ? '#f8fafc' : '#0f172a' },
        },
        {
          selector: 'node[type = "degradation"]',
          style: { 'background-color': '#E15759' },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#cbd5f5',
            'target-arrow-color': '#cbd5f5',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'font-size': '9px',
            // label mapping is done only for edges that actually have a label
            'text-background-color': theme === 'dark' ? '#1e293b' : '#f8fafc',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
          },
        },
        {
          selector: 'edge[label]'
          ,
          style: {
            label: 'data(label)',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#0ea5e9',
            'line-color': '#0ea5e9',
            'target-arrow-color': '#0ea5e9',
            'transition-property': 'border-width, border-color, line-color, target-arrow-color',
            'transition-duration': 200,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 80,
        rankSep: 120,
        animate: false,
      } as any,
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on('tap', 'node', (event) => {
      const tappedId = event.target.id();
      onSelectRule?.(tappedId);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph, onSelectRule, theme]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.elements().removeClass('highlighted');
    if (!selectedRuleId) {
      return;
    }

    const node = cy.getElementById(selectedRuleId);
    if (node && node.nonempty()) {
      node.addClass('highlighted');
      node.connectedEdges().addClass('highlighted');
      node.connectedEdges().targets().addClass('highlighted');
      node.connectedEdges().sources().addClass('highlighted');
    }
  }, [selectedRuleId]);

  const handleExport = () => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const pngData = cy.png({ full: true, scale: 2 });
    const link = document.createElement('a');
    link.href = pngData;
    link.download = 'rule-flow.png';
    link.click();
  };

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={handleExport}
          className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white shadow hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:text-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800/50"
        >
          Export PNG
        </button>
      </div>
      <div
        ref={containerRef}
        className="h-96 w-full rounded-lg border border-stone-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>
  );
};
