import React, { useEffect, useRef, useState } from 'react';
import { escapeXml } from '@bngplayground/engine';
import { useTheme } from '../hooks/useTheme';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import type { RegulatoryGraph } from '../types/visualization';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';

cytoscape.use(dagre);
cytoscape.use(fcose);

interface RegulatoryGraphViewerProps {
  graph: RegulatoryGraph;
  onSelectRule?: (ruleId: string) => void;
}

// Layout type options - matching ContactMapViewer
type LayoutType = 'hierarchical' | 'cose' | 'fcose' | 'grid' | 'concentric' | 'breadthfirst' | 'circle' | 'preset';

// Layout configurations - same as ContactMapViewer
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
    // Physics settings
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
    // Organize by node type (rules in center, species outer)
    concentric: (node: any) => {
      const type = node.data('type');
      return type === 'rule' ? 2 : 1;
    },
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
  preset: {
    name: 'preset',
    animate: true,
    animationDuration: 300,
    padding: 50,
    fit: true,
  },

};

export const RegulatoryGraphViewer: React.FC<RegulatoryGraphViewerProps> = ({ graph, onSelectRule }) => {
  const [theme] = useTheme();
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('hierarchical');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  // Keep a ref to the callback so tap handlers always see the latest version
  // without needing to destroy/recreate the Cytoscape instance on prop changes.
  const onSelectRuleRef = useRef(onSelectRule);
  onSelectRuleRef.current = onSelectRule;

  // Single effect: creates Cytoscape with elements already in the constructor,
  // then immediately runs the default layout. Destroys and re-creates the
  // instance whenever data or theme changes, eliminating the prior two-effect
  // race where cy.fit() fired on an empty graph before elements were loaded.
  useEffect(() => {
    if (!containerRef.current) return;

    const elements = [
      ...graph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          tooltip: node.label,
        },
      })),
      ...graph.edges.map((edge, index) => ({
        data: {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          type: edge.type,
          reversible: edge.reversible || false,
        },
      })),
    ];

    // Destroy any previous instance before creating a new one.
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
            'text-halign': 'center',
            'text-valign': 'center',
            'text-max-width': '100px',
            'font-size': '12px',
          },
        },
        {
          selector: 'node[type = "species"]',
          style: {
             'background-color': theme === 'dark' ? '#78350f' : '#FFE9C7', // BNG yEd AtomicPattern
            'border-color': '#999999',
            'border-width': 1,
            shape: 'round-rectangle', // BNG roundrectangle
            width: 'label',
            height: 'label',
            padding: '8px',
            color: theme === 'dark' ? '#F8FAFC' : '#111827',
            'text-valign': 'center',
            'text-halign': 'center',
            label: 'data(label)',
            'font-size': '14px', // BNG 14pt
          },
        },
        {
          selector: 'node[type = "rule"]',
          style: {
             'background-color': theme === 'dark' ? '#581c87' : '#CC99FF', // BNG yEd Rule color
            'border-color': '#999999',
            'border-width': 1,
            shape: 'ellipse', // BNG uses ellipse for rules
            width: 'label',
            height: 'label',
            padding: '8px',
            color: theme === 'dark' ? '#F8FAFC' : '#111827',
            'text-valign': 'center',
            'text-halign': 'center',
            label: 'data(label)',
            'font-size': '14px', // BNG 14pt
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'curve-style': 'bezier',
            'line-color': theme === 'dark' ? '#9ca3af' : '#888888',
            'target-arrow-color': theme === 'dark' ? '#9ca3af' : '#888888',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.2,
          },
        },
        {
          selector: 'edge[type = "reactant"]',
          style: {
            'line-color': theme === 'dark' ? '#cbd5e1' : '#000000', // BNG yEd black
            'target-arrow-color': theme === 'dark' ? '#cbd5e1' : '#000000',
            'target-arrow-shape': 'triangle', // BNG 'standard'
          },
        },
        {
          selector: 'edge[type = "product"]',
          style: {
            'line-color': theme === 'dark' ? '#cbd5e1' : '#000000', // BNG yEd black
            'target-arrow-color': theme === 'dark' ? '#cbd5e1' : '#000000',
            'target-arrow-shape': 'triangle', // BNG 'standard'
          },
        },
        {
          selector: 'edge[type = "catalyst"]',
          style: {
            'line-color': '#AAAAAA', // BNG yEd Context edge
            'target-arrow-color': '#AAAAAA',
            'target-arrow-shape': 'triangle', // BNG 'standard'
          },
        },
        // Reversible edges: bidirectional arrows (BNG style for reversible reactions)
        {
          selector: 'edge[?reversible][type = "reactant"]',
          style: {
            'source-arrow-shape': 'triangle',
            'source-arrow-color': theme === 'dark' ? '#cbd5e1' : '#000000',
          },
        },
        {
          selector: 'edge[?reversible][type = "product"]',
          style: {
            'source-arrow-shape': 'triangle',
            'source-arrow-color': theme === 'dark' ? '#cbd5e1' : '#000000',
          },
        },
        {
          selector: 'edge[?reversible][type = "catalyst"]',
          style: {
            'source-arrow-shape': 'triangle',
            'source-arrow-color': '#AAAAAA',
          },
        },
      ],
      layout: { name: 'preset' },
    });

    cyRef.current = cy;

    // Tap handlers read from ref so onSelectRule is always current without
    // needing to destroy/recreate cy when the callback identity changes.
    cy.on('tap', 'node[type = "rule"]', (event) => {
      const node = event.target;
      onSelectRuleRef.current?.(node.id());
    });

    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      const source = edge.source();
      const target = edge.target();
      if (source.data('type') === 'rule') {
        onSelectRuleRef.current?.(source.id());
      } else if (target.data('type') === 'rule') {
        onSelectRuleRef.current?.(target.id());
      }
    });

    // Run default layout; fit once it stops so all nodes are visible.
    setIsLayoutRunning(true);
    const layout = cy.layout({ ...LAYOUT_CONFIGS[activeLayout] });
    layout.on('layoutstop', () => {
      cyRef.current?.fit(undefined, 30);
      setIsLayoutRunning(false);
    });
    layout.run();

    // ResizeObserver: re-fit when the container gains its real dimensions
    // (e.g. first paint in a flex chain, or after a tab switch).
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      const c = cyRef.current;
      if (!c || w === 0 || h === 0) return;
      c.resize();
      if (c.elements().length > 0) {
        c.fit(undefined, 30);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.off('tap');
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [graph, theme]);

  const runLayout = (layoutType?: LayoutType) => {
    const cy = cyRef.current;
    if (!cy) return;

    const targetLayout = layoutType || activeLayout;
    if (layoutType) setActiveLayout(layoutType);

    setIsLayoutRunning(true);
    try {
      const config = { ...LAYOUT_CONFIGS[targetLayout] };
      const layout = cy.layout(config);
      layout.run();
      layout.on('layoutstop', () => {
        setIsLayoutRunning(false);
        cy.fit(undefined, 30);
      });
    } catch (err) {
      console.error('Layout failed', err);
      setIsLayoutRunning(false);
    }
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 30);
  };

  const handleExportPNG = () => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'regulatory_graph.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export PNG failed', err);
    }
  };

  // Generate yED-compatible GraphML export (matching BioNetGen format exactly)
  const handleExportGraphML = () => {
    const cy = cyRef.current;
    if (!cy) return;

    // BioNetGen yED colors and styles for regulatory graphs (theme-aware)
    const nodeStyles: Record<string, { fill: string; shape: string; fontStyle: string }> = {
      species: { fill: theme === 'dark' ? '#78350f' : '#FFE9C7', shape: 'roundrectangle', fontStyle: 'plain' },
      rule: { fill: theme === 'dark' ? '#581c87' : '#CC99FF', shape: 'ellipse', fontStyle: 'plain' },
    };

    const edgeStyles: Record<string, { fill: string; sourceArrow: string; targetArrow: string }> = {
      reactant: { fill: theme === 'dark' ? '#cbd5e1' : '#000000', sourceArrow: 'none', targetArrow: 'standard' },
      product: { fill: theme === 'dark' ? '#cbd5e1' : '#000000', sourceArrow: 'none', targetArrow: 'standard' },
      catalyst: { fill: theme === 'dark' ? '#94a3b8' : '#AAAAAA', sourceArrow: 'none', targetArrow: 'standard' },
      activation: { fill: theme === 'dark' ? '#16a34a' : '#66FF66', sourceArrow: 'none', targetArrow: 'standard' },
      inhibition: { fill: theme === 'dark' ? '#dc2626' : '#FF9999', sourceArrow: 'none', targetArrow: 'standard' },
    };

    // Generate GraphML content (matching BioNetGen format)
    let graphml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java" xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0" xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:y="http://www.yworks.com/xml/graphml" xmlns:yed="http://www.yworks.com/xml/yed/3" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
<key id="d0" for="node" yfiles.type="nodegraphics"/>
<key id="d1" for="edge" yfiles.type="edgegraphics"/>
  <graph edgedefault="directed" id="G">
`;

    // Map node IDs to BNG-style IDs (n0, n1, n2, ...)
    const nodeIdMap = new Map<string, string>();
    let nodeIndex = 0;
    cy.nodes().forEach(node => {
      nodeIdMap.set(node.id(), `n${nodeIndex++}`);
    });

    // Generate node XML (all nodes are ShapeNodes in regulatory graph - no hierarchy)
    cy.nodes().forEach(node => {
      const bngId = nodeIdMap.get(node.id()) || node.id();
      const label = node.data('label') || '';
      const type = node.data('type') || 'species';
      const style = nodeStyles[type] || nodeStyles.species;

      graphml += `    <node id="${escapeXml(bngId)}">
      <data key="d0">
        <y:ShapeNode>
          <y:Fill color="${style.fill}"/>
          <y:BorderStyle color="#999999" type="line" width="1"/>
          <y:Shape type="${style.shape}"/>
          <y:NodeLabel alignment="c" autoSizePolicy="content" fontFamily="Dialog" fontSize="14" fontStyle="${style.fontStyle}" hasBackgroundColor="false" hasLineColor="false" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="t" textColor="#000000" verticalTextPosition="bottom" visible="true">${escapeXml(label)}</y:NodeLabel>
        </y:ShapeNode>
      </data>
    </node>
`;
    });

    // Generate edge XML
    const edgeCountMap = new Map<string, number>();
    cy.edges().forEach(edge => {
      const sourceId = nodeIdMap.get(edge.source().id()) || edge.source().id();
      const targetId = nodeIdMap.get(edge.target().id()) || edge.target().id();
      const edgeType = edge.data('type') || 'reactant';
      const isReversible = edge.data('reversible') || false;
      const style = edgeStyles[edgeType] || edgeStyles.reactant;

      // For reversible edges, use bidirectional arrows (source='standard')
      const sourceArrow = isReversible ? 'standard' : style.sourceArrow;

      // Generate edge ID in BNG format: source::eN
      const edgeNum = edgeCountMap.get(sourceId) || 0;
      edgeCountMap.set(sourceId, edgeNum + 1);
      const edgeId = `${sourceId}::e${edgeNum}`;

      graphml += `    <edge id="${escapeXml(edgeId)}" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">
    <data key="d1">
      <y:PolyLineEdge>
        <y:LineStyle color="${style.fill}" type="line" width="1"/>
        <y:Arrows source="${sourceArrow}" target="${style.targetArrow}"/>
        <y:BendStyle smoothed="false"/>
      </y:PolyLineEdge>
    </data>
    </edge>
`;
    });

    graphml += `  </graph>
</graphml>`;

    // Download the GraphML file
    const blob = new Blob([graphml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regulatory_graph.graphml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div role="toolbar" aria-label="Regulatory graph controls" className="flex flex-col gap-1 bg-white dark:bg-slate-900 dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        {/* Row 1: Layout Buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Layout:</span>
          <Button variant={activeLayout === 'hierarchical' ? 'primary' : 'subtle'} onClick={() => runLayout('hierarchical')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Hierarchical (yED-like)">
            {isLayoutRunning && activeLayout === 'hierarchical' ? <LoadingSpinner className="w-3 h-3" /> : '\u2193 Hier'}
          </Button>
          <Button variant={activeLayout === 'cose' ? 'primary' : 'subtle'} onClick={() => runLayout('cose')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Force-Directed (Standard)">
            {isLayoutRunning && activeLayout === 'cose' ? <LoadingSpinner className="w-3 h-3" /> : '\u26A1 Cose'}
          </Button>
          <Button variant={activeLayout === 'fcose' ? 'primary' : 'subtle'} onClick={() => runLayout('fcose')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Fast Compound Force-Directed (Better for components)">
            {isLayoutRunning && activeLayout === 'fcose' ? <LoadingSpinner className="w-3 h-3" /> : '\u2728 Smart'}
          </Button>
          <Button variant={activeLayout === 'grid' ? 'primary' : 'subtle'} onClick={() => runLayout('grid')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Grid Layout">
            {isLayoutRunning && activeLayout === 'grid' ? <LoadingSpinner className="w-3 h-3" /> : '\u25A6 Grid'}
          </Button>
          <Button variant={activeLayout === 'concentric' ? 'primary' : 'subtle'} onClick={() => runLayout('concentric')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Concentric Rings">
            {isLayoutRunning && activeLayout === 'concentric' ? <LoadingSpinner className="w-3 h-3" /> : '\u25CE Rings'}
          </Button>
          <Button variant={activeLayout === 'breadthfirst' ? 'primary' : 'subtle'} onClick={() => runLayout('breadthfirst')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Breadth-first Tree">
            {isLayoutRunning && activeLayout === 'breadthfirst' ? <LoadingSpinner className="w-3 h-3" /> : '\u22A2 Tree'}
          </Button>
          <Button variant={activeLayout === 'circle' ? 'primary' : 'subtle'} onClick={() => runLayout('circle')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Circle Layout">
            {isLayoutRunning && activeLayout === 'circle' ? <LoadingSpinner className="w-3 h-3" /> : '\u25CB Circle'}
          </Button>
        </div>
        {/* Row 2: Actions */}
        <div className="flex items-center gap-1">
          <Button variant="subtle" onClick={handleFit} className="text-xs h-6 px-2">Fit</Button>
          <Button variant="subtle" onClick={() => runLayout()} disabled={isLayoutRunning} className="text-xs h-6 px-2">
            {isLayoutRunning ? <LoadingSpinner className="w-3 h-3" /> : 'Redo'}
          </Button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Export:</span>
          <Button variant="subtle" onClick={handleExportPNG} className="text-xs h-6 px-2">PNG</Button>
          <Button variant="subtle" onClick={async () => {
            const cy = cyRef.current;
            if (!cy) return;
            try {
              // @ts-ignore optional dependency
              const cySvg = await import('cytoscape-svg');
              const plugin = (cySvg as any).default ?? cySvg;
              if (plugin) cytoscape.use(plugin);
              // @ts-ignore - extension introduces svg() method
              const svgContent: string = cy.svg({ scale: 1, full: true });
              const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'regulatory_graph.svg';
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              // fallback to PNG
              const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'regulatory_graph.png';
              a.click();
              URL.revokeObjectURL(url);
            }
          }} className="text-xs h-6 px-2">SVG</Button>
          <Button variant="subtle" onClick={handleExportGraphML} className="text-xs h-6 px-2" title="Export for yED Graph Editor">yED</Button>
        </div>
      </div>

      {/* Graph Container */}
      <div role="img" aria-label="Regulatory graph"
        ref={containerRef}
        className="h-[600px] w-full rounded-lg border border-stone-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:bg-slate-900"
      />

      {/* Legend Box */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Legend</h4>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#FFE9C7] border border-[#999999]" />
            <span className="text-slate-700 dark:text-slate-300">Species / Pattern</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#CC99FF] border border-[#999999]" />
            <span className="text-slate-700 dark:text-slate-300">Rule</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-black" />
            <span className="text-slate-700 dark:text-slate-300">Reactant / Product</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-[#AAAAAA]" />
            <span className="text-slate-700 dark:text-slate-300">Catalyst / Modifier</span>
          </div>
        </div>
      </div>
    </div>
  );
};
