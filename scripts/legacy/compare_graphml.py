#!/usr/bin/env python3
"""
Structural comparison of BNG2.pl vs BNG Playground GraphML exports.

Usage:
    python compare_graphml.py <bng2_file.graphml> <playground_file.graphml>

Extracts semantic graph structure (nodes, edges, types, styles) from both
yED-compatible GraphML files and reports differences at each layer:
  1. Graph topology (node/edge count, missing/extra elements)
  2. Node attributes (shape, color, label, outline)
  3. Edge attributes (direction, color, arrows, line style)
  4. Label/naming conventions
"""

import sys
import re
from lxml import etree
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


# ── Namespaces ──────────────────────────────────────────────────────────────
NS = {
    "g": "http://graphml.graphdrawing.org/xmlns",
    "y": "http://www.yworks.com/xml/graphml",
}


@dataclass
class GNode:
    raw_id: str
    label: str = ""
    shape: str = ""
    fill: str = ""
    outline_color: str = ""
    outline_style: str = ""
    outline_width: str = ""
    font_size: str = ""
    font_style: str = ""
    is_group: bool = False


@dataclass
class GEdge:
    raw_id: str
    source: str
    target: str
    line_color: str = ""
    line_style: str = ""
    line_width: str = ""
    source_arrow: str = ""
    target_arrow: str = ""


@dataclass
class ParsedGraph:
    nodes: dict = field(default_factory=dict)  # label -> GNode
    edges: list = field(default_factory=list)   # list of GEdge
    node_by_id: dict = field(default_factory=dict)  # raw_id -> GNode


def parse_graphml(path: str) -> ParsedGraph:
    """Parse a yED GraphML file into semantic structures."""
    tree = etree.parse(path)
    root = tree.getroot()
    graph = ParsedGraph()

    # Find all nodes (including nested group children)
    for node_el in root.iter("{http://graphml.graphdrawing.org/xmlns}node"):
        raw_id = node_el.get("id", "")
        gn = GNode(raw_id=raw_id)

        # Try ShapeNode first
        shape_node = node_el.find(".//y:ShapeNode", NS)
        group_node = node_el.find(".//y:GroupNode", NS)
        target = shape_node if shape_node is not None else group_node

        if target is not None:
            fill = target.find("y:Fill", NS)
            if fill is not None:
                gn.fill = (fill.get("color") or "").upper()

            border = target.find("y:BorderStyle", NS)
            if border is not None:
                gn.outline_color = (border.get("color") or "").upper()
                gn.outline_style = border.get("type") or ""
                gn.outline_width = border.get("width") or ""

            shape = target.find("y:Shape", NS)
            if shape is not None:
                gn.shape = shape.get("type") or ""

            label = target.find("y:NodeLabel", NS)
            if label is not None:
                gn.label = (label.text or "").strip()
                gn.font_size = label.get("fontSize") or ""
                gn.font_style = label.get("fontStyle") or ""

        if group_node is not None:
            gn.is_group = True

        graph.node_by_id[raw_id] = gn
        # Use label as the canonical key if non-empty, else raw_id
        key = gn.label if gn.label else raw_id
        graph.nodes[key] = gn

    # Parse edges
    for edge_el in root.iter("{http://graphml.graphdrawing.org/xmlns}edge"):
        raw_id = edge_el.get("id", "")
        source_id = edge_el.get("source", "")
        target_id = edge_el.get("target", "")

        ge = GEdge(raw_id=raw_id, source=source_id, target=target_id)

        poly = edge_el.find(".//y:PolyLineEdge", NS)
        if poly is not None:
            ls = poly.find("y:LineStyle", NS)
            if ls is not None:
                ge.line_color = (ls.get("color") or "").upper()
                ge.line_style = ls.get("type") or ""
                ge.line_width = ls.get("width") or ""
            arr = poly.find("y:Arrows", NS)
            if arr is not None:
                ge.source_arrow = arr.get("source") or ""
                ge.target_arrow = arr.get("target") or ""

        graph.edges.append(ge)

    return graph


def resolve_label(graph: ParsedGraph, raw_id: str) -> str:
    """Resolve a raw node ID to its label."""
    node = graph.node_by_id.get(raw_id)
    if node:
        return node.label if node.label else raw_id
    return raw_id


def classify_node(node: GNode) -> str:
    """Classify a node as 'rule' or 'atom' based on shape."""
    if node.shape == "ellipse":
        return "rule"
    elif node.shape in ("roundrectangle", "rectangle"):
        return "atom"
    return "unknown"


def normalize_label(label: str) -> str:
    """Normalize a label for comparison (strip whitespace around parens, etc.)."""
    # BNG2.pl's prettify adds spaces: "A( b )" -> normalize to "A(b)"
    s = re.sub(r'\s*\(\s*', '(', label)
    s = re.sub(r'\s*\)\s*', ')', s)
    s = re.sub(r'\s*~\s*', '~', s)
    s = re.sub(r'\s*!\s*', '!', s)
    s = re.sub(r'\s*\.\s*', '.', s)
    return s.strip()


def edge_signature(graph: ParsedGraph, edge: GEdge) -> tuple:
    """Create a normalized (source_label, target_label, color) tuple."""
    src = normalize_label(resolve_label(graph, edge.source))
    tgt = normalize_label(resolve_label(graph, edge.target))
    return (src, tgt, edge.line_color)


def compare(ref_path: str, test_path: str):
    """Compare reference (BNG2.pl) vs test (Playground) GraphML files."""
    ref = parse_graphml(ref_path)
    test = parse_graphml(test_path)

    print("=" * 72)
    print("STRUCTURAL GRAPHML COMPARISON")
    print(f"  Reference : {ref_path}")
    print(f"  Test      : {test_path}")
    print("=" * 72)

    # ── 1. Topology ─────────────────────────────────────────────────────
    print("\n┌─ 1. TOPOLOGY ────────────────────────────────────────────┐")
    print(f"  Nodes:  ref={len(ref.nodes):3d}   test={len(test.nodes):3d}")
    print(f"  Edges:  ref={len(ref.edges):3d}   test={len(test.edges):3d}")

    ref_labels = {normalize_label(k) for k in ref.nodes}
    test_labels = {normalize_label(k) for k in test.nodes}

    missing = ref_labels - test_labels
    extra = test_labels - ref_labels
    common = ref_labels & test_labels

    if missing:
        print(f"\n  MISSING from test ({len(missing)}):")
        for m in sorted(missing):
            print(f"    - {m}")
    if extra:
        print(f"\n  EXTRA in test ({len(extra)}):")
        for e in sorted(extra):
            print(f"    + {e}")
    print(f"\n  Common nodes: {len(common)}")

    # ── 2. Node Attributes ──────────────────────────────────────────────
    print("\n┌─ 2. NODE ATTRIBUTES ─────────────────────────────────────┐")

    # Build lookup by normalized label
    ref_by_label = {normalize_label(k): v for k, v in ref.nodes.items()}
    test_by_label = {normalize_label(k): v for k, v in test.nodes.items()}

    attr_diffs = []
    for label in sorted(common):
        rn = ref_by_label.get(label)
        tn = test_by_label.get(label)
        if not rn or not tn:
            continue
        diffs = []
        if rn.shape != tn.shape:
            diffs.append(f"shape: {rn.shape} vs {tn.shape}")
        if rn.fill.upper() != tn.fill.upper():
            diffs.append(f"fill: {rn.fill} vs {tn.fill}")
        if rn.outline_color and tn.outline_color and rn.outline_color != tn.outline_color:
            diffs.append(f"outline: {rn.outline_color} vs {tn.outline_color}")
        if rn.font_size and tn.font_size and rn.font_size != tn.font_size:
            diffs.append(f"fontSize: {rn.font_size} vs {tn.font_size}")
        if diffs:
            attr_diffs.append((label, diffs))

    if attr_diffs:
        for label, diffs in attr_diffs[:20]:
            ntype = classify_node(ref_by_label[label])
            print(f"  [{ntype}] {label}:")
            for d in diffs:
                print(f"    ⚠ {d}")
        if len(attr_diffs) > 20:
            print(f"  ... and {len(attr_diffs) - 20} more")
    else:
        print("  ✓ All common nodes match attributes")

    # ── 3. Edge Comparison ──────────────────────────────────────────────
    print("\n┌─ 3. EDGES ───────────────────────────────────────────────┐")

    ref_edge_sigs = defaultdict(list)
    for e in ref.edges:
        sig = edge_signature(ref, e)
        ref_edge_sigs[sig].append(e)

    test_edge_sigs = defaultdict(list)
    for e in test.edges:
        sig = edge_signature(test, e)
        test_edge_sigs[sig].append(e)

    ref_sig_set = set(ref_edge_sigs.keys())
    test_sig_set = set(test_edge_sigs.keys())

    missing_edges = ref_sig_set - test_sig_set
    extra_edges = test_sig_set - ref_sig_set
    common_edges = ref_sig_set & test_sig_set

    if missing_edges:
        print(f"\n  MISSING edges ({len(missing_edges)}):")
        for src, tgt, color in sorted(missing_edges):
            print(f"    - {src} → {tgt}  [color={color}]")

    if extra_edges:
        print(f"\n  EXTRA edges ({len(extra_edges)}):")
        for src, tgt, color in sorted(extra_edges):
            print(f"    + {src} → {tgt}  [color={color}]")

    print(f"\n  Common edges: {len(common_edges)}")

    # Check arrow style on common edges
    arrow_diffs = []
    for sig in sorted(common_edges):
        re_list = ref_edge_sigs[sig]
        te_list = test_edge_sigs[sig]
        re0 = re_list[0]
        te0 = te_list[0]
        diffs = []
        if re0.source_arrow != te0.source_arrow:
            diffs.append(f"sourceArrow: {re0.source_arrow} vs {te0.source_arrow}")
        if re0.target_arrow != te0.target_arrow:
            diffs.append(f"targetArrow: {re0.target_arrow} vs {te0.target_arrow}")
        if re0.line_width != te0.line_width:
            diffs.append(f"width: {re0.line_width} vs {te0.line_width}")
        if diffs:
            arrow_diffs.append((sig, diffs))

    if arrow_diffs:
        print(f"\n  Arrow/style diffs on common edges ({len(arrow_diffs)}):")
        for (src, tgt, color), diffs in arrow_diffs[:15]:
            print(f"    {src} → {tgt}:")
            for d in diffs:
                print(f"      ⚠ {d}")
    else:
        print("  ✓ All common edges match arrow/style")

    # ── 4. Summary of style defaults ────────────────────────────────────
    print("\n┌─ 4. STYLE DEFAULTS SUMMARY ──────────────────────────────┐")

    for ntype_label, ntype_shape in [("Rule", "ellipse"), ("Atom", "roundrectangle")]:
        ref_samples = [n for n in ref.nodes.values() if n.shape == ntype_shape]
        test_samples = [n for n in test.nodes.values() if n.shape == ntype_shape]
        if ref_samples:
            rs = ref_samples[0]
            print(f"\n  {ntype_label} nodes (ref sample):")
            print(f"    shape={rs.shape} fill={rs.fill} outline={rs.outline_color} "
                  f"fontSize={rs.font_size} fontStyle={rs.font_style}")
        if test_samples:
            ts = test_samples[0]
            print(f"  {ntype_label} nodes (test sample):")
            print(f"    shape={ts.shape} fill={ts.fill} outline={ts.outline_color} "
                  f"fontSize={ts.font_size} fontStyle={ts.font_style}")

    edge_colors_ref = defaultdict(int)
    edge_colors_test = defaultdict(int)
    for e in ref.edges:
        edge_colors_ref[e.line_color] += 1
    for e in test.edges:
        edge_colors_test[e.line_color] += 1

    print(f"\n  Edge color distribution:")
    all_colors = set(edge_colors_ref.keys()) | set(edge_colors_test.keys())
    for c in sorted(all_colors):
        print(f"    {c}: ref={edge_colors_ref.get(c, 0)} test={edge_colors_test.get(c, 0)}")

    # ── 5. Direction analysis ───────────────────────────────────────────
    print("\n┌─ 5. EDGE DIRECTION ANALYSIS ─────────────────────────────┐")

    def analyze_directions(graph, label_prefix):
        rule_to_atom = 0
        atom_to_rule = 0
        other = 0
        for e in graph.edges:
            src_node = graph.node_by_id.get(e.source)
            tgt_node = graph.node_by_id.get(e.target)
            if not src_node or not tgt_node:
                other += 1
                continue
            src_type = classify_node(src_node)
            tgt_type = classify_node(tgt_node)
            if src_type == "rule" and tgt_type == "atom":
                rule_to_atom += 1
            elif src_type == "atom" and tgt_type == "rule":
                atom_to_rule += 1
            else:
                other += 1
        print(f"  {label_prefix}:")
        print(f"    atom→rule: {atom_to_rule}  rule→atom: {rule_to_atom}  other: {other}")

    analyze_directions(ref, "Reference")
    analyze_directions(test, "Test")

    print("\n" + "=" * 72)
    print("DONE")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <ref.graphml> <test.graphml>")
        sys.exit(1)
    compare(sys.argv[1], sys.argv[2])
