import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { ContactMap } from '../types/visualization';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';

// Register dagre layout for hierarchical display
cytoscape.use(dagre);

interface ContactMapViewerProps {
  contactMap: ContactMap;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string) => void;
}

// Layout type options - all built-in Cytoscape layouts plus dagre
type LayoutType = 'hierarchical' | 'cose' | 'grid' | 'concentric' | 'breadthfirst' | 'circle';

// Layout configurations for different algorithms
const LAYOUT_CONFIGS: Record<LayoutType, any> = {
  hierarchical: {
    name: 'dagre',
    rankDir: 'TB', // Top-to-bottom hierarchy
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
    // Organize by node type (molecules outer, states inner)
    concentric: (node: any) => {
      const type = node.data('type');
      if (type === 'molecule') return 3;
      if (type === 'component') return 2;
      return 1; // state
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
};

// Hierarchical layout configuration (yED-like) - used as default
const BASE_LAYOUT = LAYOUT_CONFIGS.hierarchical;

export const ContactMapViewer: React.FC<ContactMapViewerProps> = ({ contactMap, selectedRuleId, onSelectRule }) => {
  const [theme] = useTheme();
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutType>('hierarchical');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Create the Cytoscape instance once the container mounts
  useEffect(() => {
    if (!containerRef.current || cyRef.current) {
      return;
    }

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-wrap': 'wrap',
            'text-halign': 'center',
            'text-valign': 'center',
            'text-max-width': '70px',
            'font-size': '12px',
            // Default text color based on theme
            color: theme === 'dark' ? '#FFFFFF' : '#000000',
          },
        },
        {
          selector: 'node[type = "molecule"]',
          style: {
            'background-color': '#D2D2D2', // BNG yEd exact gray
            'border-color': '#000000', // Black border
            'border-width': 1,
            'text-valign': 'top',
            'text-halign': 'center',
            label: 'data(label)',
            shape: 'round-rectangle', // BNG yEd uses roundrectangle
            padding: '12px',
            'font-size': 12,
            'font-weight': 700, // bold
            color: '#000000',
          },
        },
        {
          selector: 'node[type = "compartment"]',
          style: {
            'background-color': '#eef2ff',
            'border-color': '#6366f1',
            'border-width': 2,
            'border-style': 'dashed',
            'text-valign': 'top',
            'text-halign': 'center',
            label: 'data(label)',
            shape: 'round-rectangle',
            padding: '20px',
            'font-size': 16,
            'font-weight': 700,
            color: theme === 'dark' ? '#FFFFFF' : '#000000',
          },
        },
        {
          // Non-compound component nodes (leaf components without states)
          selector: 'node[type = "component"][!isGroup]',
          style: {
            'background-color': '#FFFFFF', // BNG yEd exact white
            'border-color': '#000000', // Black border
            'border-width': 1,
            width: 'label',
            height: 'label',
            padding: '6px',
            label: 'data(label)',
            'font-size': 12, // BNG yEd standard
            shape: 'round-rectangle', // BNG yEd uses roundrectangle
            color: '#000000',
          },
        },
        {
          // Compound component nodes (components with child states)
          selector: 'node[type = "component"][?isGroup]',
          style: {
            'background-color': '#FFFFFF', // BNG yEd exact white
            'border-color': '#000000', // Black border
            'border-width': 1,
            'text-valign': 'top',
            'text-halign': 'center',
            label: 'data(label)',
            'font-size': 12,
            shape: 'round-rectangle',
            padding: '10px',
            color: '#000000',
          },
        },
        {
          selector: 'node[type = "state"]',
          style: {
            'background-color': '#FFCC00', // BNG yEd exact yellow
            'border-color': '#000000', // Black border
            'border-width': 1,
            width: 'label',
            height: 'label',
            padding: '4px',
            label: 'data(label)',
            'font-size': 12, // BNG yEd standard
            shape: 'round-rectangle', // BNG yEd uses roundrectangle
            color: '#000000',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'curve-style': 'bezier',
            'line-color': '#000000', // BNG yEd uses black edges
            'target-arrow-shape': 'none', // Contact maps are undirected graphs
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#0ea5e9',
            'line-color': '#0ea5e9',
            // 'target-arrow-color': '#0ea5e9',
            'transition-property': 'border-width, border-color, line-color, target-arrow-color',
            'transition-duration': 150,
          },
        },
      ],
      layout: { ...BASE_LAYOUT },
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [theme]);

  // Refresh tap handlers whenever the callback changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.off('tap', 'edge');
    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      const ruleIds = edge.data('ruleIds') as string[] | undefined;
      if (ruleIds && ruleIds.length > 0) {
        onSelectRule?.(ruleIds[0]);
      }
    });
  }, [onSelectRule]);

  // Update elements and layout whenever the contact map changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
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

    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    cy.layout({ ...BASE_LAYOUT }).run();
  }, [contactMap]);

  const runLayout = (layoutType: LayoutType = activeLayout) => {
    const cy = cyRef.current;
    if (!cy) return;

    setIsLayoutRunning(true);
    setActiveLayout(layoutType);
    try {
      const layoutConfig = LAYOUT_CONFIGS[layoutType];
      const layout = cy.layout(layoutConfig);
      layout.run();
      layout.on('layoutstop', () => setIsLayoutRunning(false));
    } catch (err) {
      // eslint-disable-next-line no-console
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
      a.download = 'contact_map.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Export PNG failed', err);
    }
  };

  // Generate yED-compatible GraphML export (matching BioNetGen format exactly)
  const handleExportGraphML = () => {
    const cy = cyRef.current;
    if (!cy) return;

    // BioNetGen yED colors
    const nodeColors: Record<string, string> = {
      molecule: '#D2D2D2',
      component: '#FFFFFF',
      state: '#FFCC00',
      compartment: '#EEF2FF',
    };

    // Build node hierarchy map (parent -> children) and assign sequential IDs
    const childrenMap = new Map<string, string[]>();
    const nodeIdMap = new Map<string, string>(); // Map original ID to BNG-style ID (n0, n0::n0, etc.)
    let rootIndex = 0;

    // First pass: collect children
    cy.nodes().forEach(node => {
      const parentId = node.data('parent');
      if (parentId) {
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(node.id());
      }
    });

    // Assign BNG-style IDs (n0, n0::n0, n0::n0::n0)
    const assignIds = (nodeId: string, parentBngId: string | null, childIdx: number) => {
      const bngId = parentBngId ? `${parentBngId}::n${childIdx}` : `n${childIdx}`;
      nodeIdMap.set(nodeId, bngId);
      const children = childrenMap.get(nodeId) || [];
      children.forEach((childId, idx) => assignIds(childId, bngId, idx));
    };
    cy.nodes().filter(n => !n.data('parent')).forEach(node => {
      assignIds(node.id(), null, rootIndex++);
    });

    // Helper to escape XML special characters
    const escapeXml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Generate GraphML content (matching BioNetGen format)
    let graphml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java" xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0" xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:y="http://www.yworks.com/xml/graphml" xmlns:yed="http://www.yworks.com/xml/yed/3" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
<key id="d0" for="node" yfiles.type="nodegraphics"/>
<key id="d1" for="edge" yfiles.type="edgegraphics"/>
  <graph edgedefault="directed" id="G">
`;

    // Helper to generate node XML
    const generateNodeXML = (nodeId: string, indent: string = '    '): string => {
      const node = cy.getElementById(nodeId);
      const label = node.data('label') || nodeId;
      const type = node.data('type') || 'molecule';
      const color = nodeColors[type] || '#CCCCCC';
      const hasChildren = childrenMap.has(nodeId);
      const bngId = nodeIdMap.get(nodeId) || nodeId;
      const isBold = type === 'molecule' || hasChildren;

      if (hasChildren) {
        // GroupNode for nodes with children (matches BioNetGen format)
        let xml = `${indent}<node id="${bngId}" yfiles.foldertype="group">
${indent}  <data key="d0">
${indent}    <y:ProxyAutoBoundsNode>
${indent}      <y:Realizers active="0">
${indent}        <y:GroupNode>
${indent}          <y:Fill color="${color}"/>
${indent}          <y:BorderStyle color="#000000" type="" width="1"/>
${indent}          <y:Shape type="roundrectangle"/>
${indent}          <y:NodeLabel alignment="t" autoSizePolicy="content" fontFamily="Dialog" fontSize="12" fontStyle="${isBold ? 'bold' : ''}" hasBackgroundColor="false" hasLineColor="false" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="t" textColor="#000000" verticalTextPosition="bottom" visible="true">${escapeXml(label)}</y:NodeLabel>
${indent}        </y:GroupNode>
${indent}      </y:Realizers>
${indent}    </y:ProxyAutoBoundsNode>
${indent}  </data>
${indent}  <graph id="${bngId}:" edgedefault="directed">
`;
        // Add children
        for (const childId of childrenMap.get(nodeId)!) {
          xml += generateNodeXML(childId, indent + '    ');
        }
        xml += `${indent}  </graph>
${indent}</node>
`;
        return xml;
      } else {
        // ShapeNode for leaf nodes (matches BioNetGen format)
        return `${indent}<node id="${bngId}">
${indent}  <data key="d0">
${indent}    <y:ShapeNode>
${indent}      <y:Fill color="${color}"/>
${indent}      <y:BorderStyle color="#000000" type="" width="1"/>
${indent}      <y:Shape type="roundrectangle"/>
${indent}      <y:NodeLabel alignment="c" autoSizePolicy="content" fontFamily="Dialog" fontSize="12" fontStyle="" hasBackgroundColor="false" hasLineColor="false" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="t" textColor="#000000" verticalTextPosition="bottom" visible="true">${escapeXml(label)}</y:NodeLabel>
${indent}    </y:ShapeNode>
${indent}  </data>
${indent}</node>
`;
      }
    };

    // Add root-level nodes (no parent)
    cy.nodes().filter(n => !n.data('parent')).forEach(node => {
      graphml += generateNodeXML(node.id());
    });

    // Add edges (using BNG-style node IDs)
    cy.edges().forEach((edge, idx) => {
      const sourceId = nodeIdMap.get(edge.source().id()) || edge.source().id();
      const targetId = nodeIdMap.get(edge.target().id()) || edge.target().id();
      graphml += `    <edge id="e${idx}" source="${sourceId}" target="${targetId}">
      <data key="d1">
        <y:PolyLineEdge>
          <y:LineStyle color="#000000" type="line" width="1.0"/>
          <y:Arrows source="none" target="none"/>
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
    a.download = 'contact_map.graphml';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.elements().removeClass('highlighted');
    if (!selectedRuleId) {
      return;
    }

    cy.edges().forEach((edge) => {
      const ruleIds = edge.data('ruleIds') as string[] | undefined;
      if (ruleIds && ruleIds.includes(selectedRuleId)) {
        edge.addClass('highlighted');
        edge.connectedNodes().addClass('highlighted');
        edge.connectedNodes().parents().addClass('highlighted');
      }
    });
  }, [selectedRuleId, contactMap]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap justify-between gap-2 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        {/* Layout Buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400">Layout:</span>
          <Button variant={activeLayout === 'hierarchical' ? 'primary' : 'subtle'} onClick={() => runLayout('hierarchical')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Hierarchical (yED-like)">
            {isLayoutRunning && activeLayout === 'hierarchical' ? <LoadingSpinner className="w-3 h-3" /> : '↓ Hierarchy'}
          </Button>
          <Button variant={activeLayout === 'cose' ? 'primary' : 'subtle'} onClick={() => runLayout('cose')} disabled={isLayoutRunning} className="text-xs h-6 px-1.5" title="Force-Directed (avoids overlaps)">
            {isLayoutRunning && activeLayout === 'cose' ? <LoadingSpinner className="w-3 h-3" /> : '⚡ Cose'}
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
          <Button variant="subtle" onClick={handleFit} className="text-xs h-7 px-2">Fit</Button>
          <Button variant="subtle" onClick={handleExportPNG} className="text-xs h-7 px-2">PNG</Button>
          <Button variant="subtle" onClick={handleExportGraphML} className="text-xs h-7 px-2" title="Export for yED Graph Editor">yED</Button>
          <Button variant="subtle" onClick={async () => {
            // Try to export SVG; fall back to PNG if unsupported
            const cy = cyRef.current;
            if (!cy) return;

            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
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
              a.download = 'contact_map.svg';
              a.click();
              URL.revokeObjectURL(url);
              return;
            } catch (svgErr) {
              // fallback to PNG
              try {
                const blob = cy.png({ output: 'blob', scale: 2, full: true }) as Blob;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'contact_map.png';
                a.click();
                URL.revokeObjectURL(url);
                return;
              } catch (pngErr) {
                // eslint-disable-next-line no-console
                console.error('Export failed:', svgErr, pngErr);
              }
            }
          }} className="text-xs h-7 px-3">Export SVG</Button>
        </div>
      </div>

      {/* Graph Container */}
      <div className="relative flex-1 min-h-[500px] w-full rounded-lg border border-stone-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0 z-0" />
      </div>

      {/* Legend Box */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 uppercase">Legend</h4>
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#D2D2D2] border border-black" />
            <span className="text-slate-700 dark:text-slate-300">Molecule</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-white border border-black" />
            <span className="text-slate-700 dark:text-slate-300">Component</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#FFCC00] border border-black" />
            <span className="text-slate-700 dark:text-slate-300">State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t border-black" />
            <span className="text-slate-700 dark:text-slate-300">Bond</span>
          </div>
        </div>
      </div>
    </div>
  );
};
