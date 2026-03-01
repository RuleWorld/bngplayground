import type { AtomRuleGraph } from '../../types/visualization';

export interface ExportArGraphOptions {
  /**
   * When false (default) rule labels are hidden to match BNG2.pl's
   * `ruleNames=>0` behaviour.  Set true to show rule names.
   */
  showRuleNames?: boolean;
  /**
   * When true, atom nodes that represent single (unbonded) molecular patterns
   * will be rendered with empty labels.  BNG2.pl typically only annotates
   * bonded complexes in its regulatory outputs, so hiding monomer labels
   * reduces spurious differences during parity comparisons.
   */
  hideAtomLabels?: boolean;
  /**
   * Optional map of node positions (from Cytoscape) to embed layout geometry
   * in the exported GraphML.  Keys are node ids and values are {x,y} coords.
   * This allows yEd to preserve the on‑screen layout when the file is loaded.
   */
  positions?: Record<string, { x: number; y: number }>;
}

export const exportArGraphToGraphML = (
  graph: AtomRuleGraph,
  options: ExportArGraphOptions = {},
): string => {
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // assign stable numeric ids sorted by type & label for parity with BNG2.pl
  const sortedNodes = [...graph.nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'atom' ? -1 : 1;
    return (a.label || a.id).localeCompare(b.label || b.id);
  });
  const idMap = new Map<string, string>();
  sortedNodes.forEach((n, i) => {
    idMap.set(n.id, `n${i}`);
  });

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:y="http://www.yworks.com/xml/graphml" xmlns:yed="http://www.yworks.com/xml/yed/3" xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java" xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0" xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
  <key id="d0" for="node" yfiles.type="nodegraphics"/>
  <key id="d1" for="edge" yfiles.type="edgegraphics"/>
  <graph edgedefault="directed" id="G">
`;

  sortedNodes.forEach((node) => {
    const id = esc(idMap.get(node.id) ?? node.id);
    const showLabel = node.type === 'rule'
      ? !!options.showRuleNames
      : node.type === 'atom'
        ? (() => {
            if (!options.hideAtomLabels) return true;
            const id = node.id;
            const isBonded = id.startsWith('bond:') || id.includes('!') || id.includes('.');
            return isBonded;
          })()
        : true;
    const label = esc(showLabel ? node.label || node.id : '');
    const isRule = node.type === 'rule';
    const fillColor = isRule ? '#CC99FF' : '#FFE9C7';
    const shape = isRule ? 'ellipse' : 'roundrectangle';

    xml += `    <node id="${id}">
      <data key="d0">
        <y:ShapeNode>
          <y:Fill color="${fillColor}"/>
          <y:BorderStyle color="#999999" type="line" width="1"/>
          <y:Shape type="${shape}"/>
`;
    // insert geometry if provided
    if (options.positions && options.positions[node.id]) {
      const pos = options.positions[node.id];
      xml += `          <y:Geometry x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="0" height="0"/>
`;
    }
    xml += `          <y:NodeLabel alignment="c" autoSizePolicy="content" fontFamily="Dialog" fontSize="14" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="t" textColor="#000000" verticalTextPosition="bottom" visible="true">${label}</y:NodeLabel>
        </y:ShapeNode>
      </data>
    </node>
`;
  });

  const colorMap: Record<string, string> = {
    produces: '#000000',
    consumes: '#000000',
    modifies: '#AAAAAA',
    wildcard: '#000000',
  };
  const edgeIdxBySource = new Map<string, number>();
  graph.edges.forEach((edge) => {
    const src = esc(idMap.get(edge.from) ?? edge.from);
    const tgt = esc(idMap.get(edge.to) ?? edge.to);
    const edgeType = edge.edgeType;
    const lineColor = colorMap[edgeType] ?? '#000000';
    const srcNum = src.startsWith('n') ? src.slice(1) : src;
    const idx = edgeIdxBySource.get(src) ?? 0;
    const eid = `n${srcNum}::e${idx}`;
    edgeIdxBySource.set(src, idx + 1);
    xml += `    <edge id="${eid}" source="${src}" target="${tgt}">
      <data key="d1">
        <y:PolyLineEdge>
          <y:LineStyle color="${lineColor}" type="line" width="1"/>
          <y:Arrows source="none" target="standard"/>
          <y:BendStyle smoothed="false"/>
        </y:PolyLineEdge>
      </data>
    </edge>
`;
  });

  xml += `  </graph>\n</graphml>`;
  return xml;
};
