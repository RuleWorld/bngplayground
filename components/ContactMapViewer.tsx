import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import type { ContactMap } from '../types/visualization';
import type { RuleOverlay } from '../services/visualization/ruleOverlay';
import { applyCytoscapeRuleOverlay, ruleOverlayStyles } from '../services/visualization/applyCytoscapeRuleOverlay';
import type { ContactMapSnapshot } from '../services/visualization/dynamicContactMap';
import { applyCytoscapeDynamicOverlay, dynamicOverlayStyles } from '../services/visualization/applyCytoscapeDynamicOverlay';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';

// Register layouts
cytoscape.use(dagre);
cytoscape.use(fcose);

interface ContactMapViewerProps {
  contactMap: ContactMap;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string) => void;
  ruleOverlay?: RuleOverlay | null;
  dynamicSnapshot?: ContactMapSnapshot | null;
}

type LayoutType = 'hierarchical' | 'cose' | 'fcose' | 'grid' | 'concentric' | 'breadthfirst' | 'circle' | 'preset';

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
    concentric: (node: any) => {
      const type = node.data('type');
      if (type === 'molecule') return 3;
      if (type === 'component') return 2;
      return 1;
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

const BASE_LAYOUT = LAYOUT_CONFIGS.hierarchical;

export const ContactMapViewer: React.FC<ContactMapViewerProps> = ({ contactMap, selectedRuleId, onSelectRule, ruleOverlay, dynamicSnapshot }) => {
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [layoutDone, setLayoutDone] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('hierarchical');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRuleRef = useRef(onSelectRule);
  onSelectRuleRef.current = onSelectRule;

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = [
      ...contactMap.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          parent: node.parent,
          type: node.type,
          isGroup: node.isGroup,
        },
      })),
      ...contactMap.edges.map((edge, index) => ({
        data: {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          label: edge.componentPair ? `${edge.componentPair[0]}-${edge.componentPair[1]}` : '',
          type: edge.interactionType,
          ruleIds: edge.ruleIds,
          ruleLabels: edge.ruleLabels,
        },
      })),
    ];

    cyRef.current?.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const edgeColor = isDark ? '#94a3b8' : '#000000';
    const textColor = isDark ? '#ffffff' : '#000000';

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'text-halign': 'center',
            'text-valign': 'center',
            'font-size': 14,
            'text-wrap': 'none',
            'text-max-width': '10000px',
            color: '#000000',
            label: 'data(label)',
          },
        },
        {
          selector: 'node[type = "molecule"]',
          style: {
            'background-color': '#D2D2D2',
            'border-color': '#000000',
            'border-width': 1,
            'font-weight': 700,
            shape: 'round-rectangle',
            padding: '12px',
          },
        },
        {
          selector: 'node[type = "compartment"]',
          style: {
            'background-color': isDark ? '#1e1b4b' : '#eef2ff',
            'border-color': '#6366f1',
            'border-width': 2,
            'border-style': 'dashed',
            'font-size': 16,
            'font-weight': 700,
            padding: '20px',
          },
        },
        {
          selector: 'node[type = "component"]',
          style: {
            'background-color': '#FFFFFF',
            'border-color': '#000000',
            'border-width': 1,
            shape: 'round-rectangle',
            padding: '6px',
          },
        },
        {
          selector: 'node[type = "state"]',
          style: {
            'background-color': '#FFCC00',
            'border-color': '#000000',
            'border-width': 1,
            padding: '4px',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'curve-style': 'bezier',
            'line-color': edgeColor,
            'target-arrow-color': edgeColor,
            'target-arrow-shape': 'none',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#0ea5e9',
            'line-color': '#0ea5e9',
          },
        },
        ...ruleOverlayStyles,
        ...dynamicOverlayStyles,
      ],
      layout: { name: 'preset' },
    });

    cy.ready(() => {
      // Execute true layout algorithm once Cytoscape is natively attached.
      const initialLayout = cy.layout({ ...BASE_LAYOUT, animate: false });
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

    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      const ruleIds = edge.data('ruleIds') as string[] | undefined;
      if (ruleIds && ruleIds.length > 0) {
        onSelectRuleRef.current?.(ruleIds[0]);
      }
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => {
      const c = cyRef.current;
      if (!c) return;
      c.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.off('tap');
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [contactMap]);

  useEffect(() => {
    if (!cyRef.current) return;
    applyCytoscapeRuleOverlay(cyRef.current, ruleOverlay || null);
  }, [ruleOverlay, contactMap]);

  useEffect(() => {
    if (!cyRef.current) return;
    applyCytoscapeDynamicOverlay(cyRef.current, dynamicSnapshot || null);
  }, [dynamicSnapshot, contactMap]);

  const runLayout = (layoutType: LayoutType = activeLayout) => {
    const cy = cyRef.current;
    if (!cy) return;
    setIsLayoutRunning(true);
    setActiveLayout(layoutType);
    try {
      const layout = cy.layout(LAYOUT_CONFIGS[layoutType]);
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

  const handleFit = () => cyRef.current?.fit(undefined, 30);

  const handleExportPNG = () => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'contact_map.png'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Export PNG failed', err); }
  };

  const handleExportGraphML = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const childrenMap = new Map<string, string[]>();
    const nodeIdMap = new Map<string, string>();
    let rootIndex = 0;
    cy.nodes().forEach(node => {
      const parentId = node.data('parent');
      if (parentId) {
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(node.id());
      }
    });
    const assignIds = (nodeId: string, parentBngId: string | null, childIdx: number) => {
      const bngId = parentBngId ? `${parentBngId}::n${childIdx}` : `n${childIdx}`;
      nodeIdMap.set(nodeId, bngId);
      const children = childrenMap.get(nodeId) || [];
      children.forEach((childId, idx) => assignIds(childId, bngId, idx));
    };
    cy.nodes().filter(n => !n.data('parent')).forEach(node => assignIds(node.id(), null, rootIndex++));
    const escapeXml = (str: string): string => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    let graphml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:y="http://www.yworks.com/xml/graphml" xmlns:yed="http://www.yworks.com/xml/yed/3">\n<key id="d0" for="node" yfiles.type="nodegraphics"/>\n<key id="d1" for="edge" yfiles.type="edgegraphics"/>\n  <graph edgedefault="directed" id="G">\n`;
    const nodeColors: any = { molecule: '#D2D2D2', component: '#FFFFFF', state: '#FFCC00', compartment: '#EEF2FF' };
    const generateNodeXML = (nodeId: string, indent: string = '    '): string => {
      const node = cy.getElementById(nodeId);
      const label = node.data('label') || nodeId;
      const type = node.data('type') || 'molecule';
      const color = nodeColors[type] || '#CCCCCC';
      const hasChildren = childrenMap.has(nodeId);
      const bngId = nodeIdMap.get(nodeId) || nodeId;
      const isBold = type === 'molecule' || hasChildren;
      if (hasChildren) {
        let xml = `${indent}<node id="${bngId}" yfiles.foldertype="group">\n${indent}  <data key="d0">\n${indent}    <y:ProxyAutoBoundsNode>\n${indent}      <y:Realizers active="0">\n${indent}        <y:GroupNode>\n${indent}          <y:Fill color="${color}"/>\n${indent}          <y:BorderStyle color="#000000" type="" width="1"/>\n${indent}          <y:Shape type="roundrectangle"/>\n${indent}          <y:NodeLabel alignment="t" autoSizePolicy="content" fontFamily="Dialog" fontSize="14" fontStyle="${isBold ? 'bold' : ''}" hasBackgroundColor="false" hasLineColor="false" textColor="#000000" visible="true">${escapeXml(label)}</y:NodeLabel>\n${indent}        </y:GroupNode>\n${indent}      </y:Realizers>\n${indent}    </y:ProxyAutoBoundsNode>\n${indent}  </data>\n${indent}  <graph id="${bngId}:" edgedefault="directed">\n`;
        for (const childId of childrenMap.get(nodeId)!) { xml += generateNodeXML(childId, indent + '    '); }
        xml += `${indent}  </graph>\n${indent}</node>\n`;
        return xml;
      } else {
        return `${indent}<node id="${bngId}">\n${indent}  <data key="d0">\n${indent}    <y:ShapeNode>\n${indent}      <y:Fill color="${color}"/>\n${indent}      <y:BorderStyle color="#000000" type="" width="1"/>\n${indent}      <y:Shape type="roundrectangle"/>\n${indent}      <y:NodeLabel alignment="c" autoSizePolicy="content" fontFamily="Dialog" fontSize="14" fontStyle="" hasBackgroundColor="false" hasLineColor="false" textColor="#000000" visible="true">${escapeXml(label)}</y:NodeLabel>\n${indent}    </y:ShapeNode>\n${indent}  </data>\n${indent}</node>\n`;
      }
    };
    cy.nodes().filter(n => !n.data('parent')).forEach(node => { graphml += generateNodeXML(node.id()); });
    cy.edges().forEach((edge) => {
      const sourceId = nodeIdMap.get(edge.source().id());
      const targetId = nodeIdMap.get(edge.target().id());
      if (sourceId && targetId) graphml += `    <edge source="${sourceId}" target="${targetId}">\n      <data key="d1">\n        <y:PolyLineEdge>\n          <y:LineStyle color="#000000" type="line" width="1.0"/>\n          <y:Arrows source="none" target="none"/>\n        </y:PolyLineEdge>\n      </data>\n    </edge>\n`;
    });
    graphml += `  </graph>\n</graphml>`;
    const blob = new Blob([graphml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'contact_map.graphml'; a.click();
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
          <Button variant="subtle" onClick={handleFit} className="text-xs h-6 px-2">Fit</Button>
          <Button variant="subtle" onClick={() => runLayout()} disabled={isLayoutRunning} className="text-xs h-6 px-2">Redo</Button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Export:</span>
          <Button variant="subtle" onClick={handleExportPNG} className="text-xs h-6 px-2">PNG</Button>
          <Button variant="subtle" onClick={handleExportGraphML} className="text-xs h-6 px-2" title="Export for yED Graph Editor">yED</Button>
        </div>
      </div>

      <div className="relative w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
        {!layoutDone && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-lg">
            <LoadingSpinner className="w-8 h-8 text-[#0ea5e9]" />
            <span className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-400 animate-pulse">Computing Layout...</span>
          </div>
        )}
        <div ref={containerRef} className={`w-full h-[600px] rounded-lg transition-opacity duration-300 ${layoutDone ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {/* Legend rendered below the graph container */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 uppercase">Legend</h4>
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#D2D2D2] border border-black" /><span className="text-slate-700 dark:text-slate-300">Molecule</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-white border border-black" /><span className="text-slate-700 dark:text-slate-300">Component</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-[#FFCC00] border border-black" /><span className="text-slate-700 dark:text-slate-300">State</span></div>
          <div className="flex items-center gap-2"><div className="w-6 h-0 border-t border-black" /><span className="text-slate-700 dark:text-slate-300">Bond</span></div>
          {ruleOverlay && (
            <>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#fdedec] border-2 border-[#e74c3c]" />
                <span className="text-slate-700 dark:text-slate-300">Center</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#eaf2f8] border-2 border-[#3498db]" />
                <span className="text-slate-700 dark:text-slate-300">Context</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
