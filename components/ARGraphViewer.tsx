import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import type { AtomRuleGraph } from '../types/visualization';
import { colorFromName, foregroundForBackground } from '../services/visualization/colorUtils';
import { exportArGraphToGraphML } from '../services/visualization/arGraphExporter';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';

// Register layout plugins (idempotent)
cytoscape.use(dagre);
cytoscape.use(fcose);

type LayoutType = 'hierarchical' | 'cose' | 'fcose' | 'grid' | 'concentric' | 'breadthfirst' | 'circle';

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
    nodeDimensionsIncludeLabels: true, // Fix tiny collision boxes
  },
  cose: {
    name: 'cose',
    animate: true,
    animationDuration: 500,
    padding: 50,
    fit: true,
    nodeRepulsion: 100000,
    nodeOverlap: 20,
    idealEdgeLength: 60,
    nestingFactor: 1.2,
    gravity: 80,
    numIter: 1000,
    nodeDimensionsIncludeLabels: true,
    randomize: false,
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
  concentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
    avoidOverlap: true,
    minNodeSpacing: 50,
    spacingFactor: 1.5,
    nodeDimensionsIncludeLabels: true,
    concentric: (node: any) => (node.data('type') === 'rule' ? 2 : 1),
    levelWidth: () => 1,
  },
  breadthfirst: {
    name: 'breadthfirst',
    directed: true,
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
    avoidOverlap: true,
    spacingFactor: 1.5,
    circle: false,
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

interface ARGraphViewerProps {
  arGraph: AtomRuleGraph;
  selectedRuleId?: string | null;
  selectedAtomId?: string | null;
  onSelectRule?: (ruleId: string | null) => void;
  onSelectAtom?: (atomId: string | null) => void;
  forceFitTrigger?: any;
}

export const ARGraphViewer: React.FC<ARGraphViewerProps> = ({
  arGraph,
  selectedRuleId,
  selectedAtomId,
  onSelectRule,
  onSelectAtom,
  forceFitTrigger,
}) => {
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [layoutDone, setLayoutDone] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('hierarchical');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRuleRef = useRef(onSelectRule);
  const onSelectAtomRef = useRef(onSelectAtom);
  onSelectRuleRef.current = onSelectRule;
  onSelectAtomRef.current = onSelectAtom;

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      edgeColor: isDark ? '#94a3b8' : '#000000',
      textColor: isDark ? '#ffffff' : '#000000',
      contextEdgeColor: isDark ? '#64748b' : '#AAAAAA',
    };
  };

  const colors = getThemeColors(); // Added here for use in render

  useEffect(() => {
    if (forceFitTrigger !== undefined) {
      cyRef.current?.fit(undefined, 30);
    }
  }, [forceFitTrigger]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const colors = getThemeColors();

    const elements = [
      ...arGraph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          bngLabel: node.label,
          type: node.type,
          details: node.details,
        },
      })),
      ...arGraph.edges.map((edge, index) => ({
        data: {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          edgeType: edge.edgeType,
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
            'text-halign': 'center',
            'text-valign': 'center', // Center labels inside nodes
            'font-size': 14,
            color: '#000000', // Black text since backgrounds are light
            'text-wrap': 'none', // DO NOT WRAP OR CLIP
            'text-max-width': '10000px', // Prevent internal Cytoscape word-wrap checks from truncating width measurements at punctuation like dots
            padding: '10px',
          },
        },
        {
          selector: 'node[type = "rule"]',
          style: {
            shape: 'ellipse',
            width: ((ele: any) => Math.max((ele.data('label') || '').length * 8.5 + 24, 40)) as any,
            height: 35,
            padding: '4px',
            label: 'data(label)',
            'background-color': '#CC99FF',
            'border-color': '#999999',
            'border-width': 1,
          },
        },
        {
          selector: 'node[type = "atom"]',
          style: {
            shape: 'round-rectangle',
            width: ((ele: any) => Math.max((ele.data('label') || '').length * 8.5 + 24, 40)) as any,
            height: 30,
            padding: '4px',
            label: 'data(label)',
            'background-color': '#FFE9C7',
            'border-color': '#999999',
            'border-width': 1,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.2,
            'font-size': 9,
            'line-color': colors.edgeColor,
            'target-arrow-color': colors.edgeColor,
          },
        },
        {
          selector: 'edge[edgeType = "modifies"]',
          style: {
            'line-color': colors.contextEdgeColor,
            'target-arrow-color': colors.contextEdgeColor,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#000000',
            'border-width': 3,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#000000',
            'target-arrow-color': '#000000',
            'width': 2,
          },
        },
      ],
      layout: { name: 'preset' },
    });

    cy.ready(() => {
      // Execute true layout algorithm once Cytoscape is natively attached.
      const initialLayout = cy.layout({ ...LAYOUT_CONFIGS.hierarchical, animate: false });
      initialLayout.on('layoutstop', () => {
        // Guarantee fit across React rendering paints and container resizing 
        const forceViewport = () => {
          cyRef.current?.resize();
          cyRef.current?.fit(undefined, 30);
        };
        
        requestAnimationFrame(() => {
          forceViewport();
          setTimeout(forceViewport, 50);
          setTimeout(forceViewport, 150);
          setTimeout(forceViewport, 300);
          // Wait for 300ms layout-settling tick to fade canvas in, hiding layout pop
          setTimeout(() => {
            setLayoutDone(true);
            setIsLayoutRunning(false);
          }, 50);
        });
      });
      initialLayout.run();
    });

    cy.on('tap', 'node[type = "rule"]', (e) => onSelectRuleRef.current?.(e.target.id()));
    cy.on('tap', 'node[type = "atom"]', (e) => onSelectAtomRef.current?.(e.target.id()));
    cy.on('tap', (e) => {
      // If clicking the background container, unselect
      if (e.target === cy) {
        onSelectRuleRef.current?.(null);
        onSelectAtomRef.current?.(null);
      }
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => {
      const c = cyRef.current;
      if (!c) return;
      c.resize();
      // Debounced or throttled fit could go here, but for now we just resize
      // to avoid the jitter reported earlier. Manual 'Fit' is available.
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.off('tap');
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [arGraph]);

  // Selected state effect
  useEffect(() => {
    if (!layoutDone) return;
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted');
    const highlight = (id: string | null | undefined) => {
      if (!id) return;
      const el = cy.getElementById(id);
      if (el.nonempty()) {
        el.addClass('highlighted');
        el.connectedEdges().addClass('highlighted');
        el.connectedEdges().connectedNodes().addClass('highlighted');
      }
    };
    highlight(selectedRuleId);
    highlight(selectedAtomId);
  }, [selectedRuleId, selectedAtomId, layoutDone]);

  const runLayout = (type: LayoutType = activeLayout) => {
    const cy = cyRef.current;
    if (!cy) return;
    setIsLayoutRunning(true);
    setActiveLayout(type);
    try {
      const l = cy.layout(LAYOUT_CONFIGS[type]);
      l.run();
      l.on('layoutstop', () => {
        setIsLayoutRunning(false);
        cy.fit(undefined, 30);
      });
    } catch (err) {
      console.error('Layout failed', err);
      setIsLayoutRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex flex-col gap-1 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Layout:</span>
          <Button variant={activeLayout === 'hierarchical' ? 'primary' : 'subtle'} onClick={() => runLayout('hierarchical')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Hierarchical (yED-like)">
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
          <Button variant={activeLayout === 'concentric' ? 'primary' : 'subtle'} onClick={() => runLayout('concentric')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Concentric Rings">
            {isLayoutRunning && activeLayout === 'concentric' ? <LoadingSpinner className="w-3 h-3" /> : '◎ Rings'}
          </Button>
          <Button variant={activeLayout === 'breadthfirst' ? 'primary' : 'subtle'} onClick={() => runLayout('breadthfirst')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Breadth-first Tree">
            {isLayoutRunning && activeLayout === 'breadthfirst' ? <LoadingSpinner className="w-3 h-3" /> : '⊢ Tree'}
          </Button>
          <Button variant={activeLayout === 'circle' ? 'primary' : 'subtle'} onClick={() => runLayout('circle')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Circle Layout">
            {isLayoutRunning && activeLayout === 'circle' ? <LoadingSpinner className="w-3 h-3" /> : '○ Circle'}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="subtle" onClick={() => cyRef.current?.fit()} className="text-xs h-6 px-2">Fit</Button>
          <Button variant="subtle" onClick={() => runLayout()} disabled={isLayoutRunning} className="text-xs h-6 px-2">Redo</Button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Export:</span>
          <Button variant="subtle" onClick={() => {
            const blob = cyRef.current?.png({ output: 'blob', scale: 2, full: true }) as Blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'regulatory_graph.png'; a.click();
          }} className="text-xs h-6 px-2">PNG</Button>
          <Button variant="subtle" onClick={() => {
             const graphml = exportArGraphToGraphML(arGraph);
             const blob = new Blob([graphml], { type: 'application/xml;charset=utf-8' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a'); a.href = url; a.download = 'regulatory_graph.graphml'; a.click();
          }} className="text-xs h-6 px-2" title="Export for yED Graph Editor">yED</Button>
        </div>
      </div>
      
      <div className="relative w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
        {!layoutDone && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-lg">
            <LoadingSpinner className="w-8 h-8 text-[#CC99FF]" />
            <span className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-400 animate-pulse">Computing Layout...</span>
          </div>
        )}
        <div ref={containerRef} className={`h-[600px] w-full rounded-lg transition-opacity duration-300 ${layoutDone ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 uppercase">Legend</h4>
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded-full bg-[#CC99FF] border border-[#999999]" />
            <span className="text-slate-700 dark:text-slate-300">Rule</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded bg-[#FFE9C7] border border-[#999999]" />
            <span className="text-slate-700 dark:text-slate-300">AtomicPattern</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1 rounded" style={{ background: colors.edgeColor, color: '#fff' }}>→</span>
            <span className="text-slate-700 dark:text-slate-300">Interaction</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1 rounded" style={{ background: colors.contextEdgeColor, color: '#fff' }}>→</span>
            <span className="text-slate-700 dark:text-slate-300">Context</span>
          </div>
        </div>
      </div>
    </div>
  );
};
