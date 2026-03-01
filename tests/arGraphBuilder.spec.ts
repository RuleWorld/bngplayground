import { describe, it, expect } from 'vitest';
import { buildAtomRuleGraph } from '../services/visualization/arGraphBuilder';
import { exportArGraphToGraphML } from '../services/visualization/arGraphExporter';
import { parseSpeciesGraphs } from '../services/visualization/speciesGraphUtils';

describe('Atom-rule graph builder enhancements', () => {
  it('prefixes numeric rule names with underscore', () => {
    const graph = buildAtomRuleGraph([{ name: '1', reactants: ['A()'], products: ['B()'], rate: '', isBidirectional: false }]);
    const ruleNode = graph.nodes.find(n => n.type === 'rule');
    expect(ruleNode).toBeDefined();
    expect(ruleNode!.id).toBe('_1');
  });

  it('expands wildcard atoms/edges and removes helpers (bng2 mode)', () => {
    // A(b!+) is a wildcard bond — it matches any bound component.
    // In BNG2 decomposition mode, the reactant A(b!+).B(a) gets parsed:
    //  - A(b!+) is an existing bond so b is treated as a bonded component
    //  - The product A(b!1).B(a!1) introduces a bond → the bond atom is the product
    // After wildcard removal, no node id should contain "!+".
    const r = { name: 'w', reactants: ['A(b!+).B(a)'], products: ['A(b!1).B(a!1)'], rate: '', isBidirectional: false };
    const graph = buildAtomRuleGraph([r], { atomization: 'bng2' });
    // debug output
    // eslint-disable-next-line no-console
    console.log('wildcard graph nodes:', graph.nodes);
    // eslint-disable-next-line no-console
    console.log('wildcard graph edges:', graph.edges);

    // wildcard nodes/edges should have been removed
    expect(graph.nodes.map(n => n.id)).not.toContain('A(b!+)');
    const wildcardEdges = graph.edges.filter(e => e.edgeType === 'wildcard');
    expect(wildcardEdges.length).toBe(0);

    // The bond atom should appear as a product atom node (id may be sanitized)
    const bondNode = graph.nodes.find(n => n.type === 'atom' && n.label === 'A(b!1).B(a!1)');
    expect(bondNode).toBeDefined();
  });

  it('suppresses rate-law dependency edges when includeRateLawDeps=false', () => {
    // choose a species not part of reactants/products
    const rule = { name: 'r', reactants: ['A()'], products: ['B()'], rate: 'C', isBidirectional: false };
    const full = buildAtomRuleGraph([rule], { includeRateLawDeps: true });
    const slim = buildAtomRuleGraph([rule], { includeRateLawDeps: false });
    const fullMod = full.edges.filter(e => e.edgeType === 'modifies');
    const slimMod = slim.edges.filter(e => e.edgeType === 'modifies');
    expect(fullMod.length).toBeGreaterThan(slimMod.length);
  });

  it('prettifies compound atom labels (bonds) with spaces', () => {
    // A bond generates a hyphenated label that should get spaces around it
    const graph = buildAtomRuleGraph([{ name: 'r', reactants: ['A(b!1).B(a!1)'], products: ['A(b!1).B(a!1)'], rate: '', isBidirectional: false }]);
    const node = graph.nodes.find(n => n.type === 'atom' && n.label.includes('—'));
    expect(node).toBeDefined();
    // label should contain spaces around the dash and parentheses if present
    expect(node!.label).toMatch(/\s—\s/);
  });

  it('decomposes rules into atomic patterns in BNG2 mode (not full species strings)', () => {
    // A(b!1).B(a!1) -> C():  reactant is a bond pattern → bond atom consumed, free atoms produced
    const rule = { name: 'r', reactants: ['A(b!1).B(a!1)'], products: ['C()'], rate: '', isBidirectional: false };
    const def = buildAtomRuleGraph([rule]);
    const bng2 = buildAtomRuleGraph([rule], { atomization: 'bng2' });
    const defLabels = def.nodes.filter(n => n.type === 'atom').map(n => n.label);
    const bng2Labels = bng2.nodes.filter(n => n.type === 'atom').map(n => n.label);
    // BNG2 mode should decompose to: bond atom (reactant) + free atoms (products) + C (product)
    expect(bng2Labels).toContain('A(b!1).B(a!1)'); // bond atom from DeleteBond
    // default mode breaks the species into component atoms instead
    expect(defLabels).not.toContain('A(b!1).B(a!1)');
    // BNG2 graph should have the bond atom + 2 free component products + C product
    // (A(b), B(a) as DeleteBond products, C as AddMol product)
    expect(bng2Labels.length).toBeGreaterThan(1);
  });

  it('sanitizes atom ids containing dots so edges always find a matching node', () => {
    const rule = {
      name: 'r',
      reactants: ['IL6(r!+).IL6R(activity~I,l_bind!+)'],
      products: ['X()'],
      rate: '',
      isBidirectional: false,
    };
    // check parsing separately to catch parse failures early
    const reactantGraphs = parseSpeciesGraphs(rule.reactants);
    expect(reactantGraphs.length).toBeGreaterThan(0);
    // show what the parser returned for debugging
    // eslint-disable-next-line no-console
    console.log('parsed reactant graphs:', reactantGraphs.map(g => g.toString()));

    const graph = buildAtomRuleGraph([rule], { atomization: 'bng2' });
    // log graph for debugging on failure
    // eslint-disable-next-line no-console
    console.log('graph nodes', graph.nodes);
    // wildcard helpers should have been removed entirely, so there
    // should be no node or edge referring to IL6(r!+)
    expect(graph.nodes.map(n => n.id)).not.toContain('IL6(r!+)');
    const badEdge = graph.edges.find(e => e.from === 'IL6(r!+)' || e.to === 'IL6(r!+)');
    expect(badEdge).toBeUndefined();
  });
});

describe('GraphML exporter styling & id scheme', () => {
  it('assigns numeric ids and hides rule labels by default', () => {
    const graph = buildAtomRuleGraph([
      { name: 'x', reactants: ['A()'], products: ['B()'], rate: '', isBidirectional: false },
    ]);
    const xml = exportArGraphToGraphML(graph);
    expect(xml).toMatch(/<node id="n0"/);
    expect(xml).toMatch(/<node id="n1"/);
    // rule label blank
    expect(xml).toMatch(/<y:NodeLabel[^>]*>\s*<\/y:NodeLabel>/);
  });

  it('uses proper outline color and font size, and emits hierarchical edge ids', () => {
    const graph = buildAtomRuleGraph([
      { name: 'x', reactants: ['A()'], products: ['B()'], rate: '', isBidirectional: false },
    ]);
    const xml = exportArGraphToGraphML(graph, { showRuleNames: true });
    expect(xml).toContain('BorderStyle color="#999999"');
    expect(xml).toContain('fontSize="14"');
    expect(xml).toContain('fontStyle="plain"');
    // there should be an edge id with the nX::eY pattern
    expect(xml).toMatch(/edge id="n\d+::e\d+"/);
  });

  it('can hide monomer atom labels (but not complexes) when hideAtomLabels=true', () => {
    // create a rule with a simple monomer reactant and a bonded product complex
    const graph = buildAtomRuleGraph([
      { name: 'x', reactants: ['A()'], products: ['A(b!1).B(a!1)'], rate: '', isBidirectional: false },
    ]);
    const xml = exportArGraphToGraphML(graph, { hideAtomLabels: true, showRuleNames: false });
    // the monomer atom should be hidden, but the bonded complex should still appear
    expect(xml).not.toContain('A()');
    // prettified compound labels use spaces and dash
    expect(xml).toContain('A.b — B.a');
  });

  it('embeds geometry positions when supplied', () => {
    const graph = buildAtomRuleGraph([
      { name: 'r', reactants: ['A()'], products: ['B()'], rate: '', isBidirectional: false },
    ]);
    const xml = exportArGraphToGraphML(graph, { positions: { A: { x: 1, y: 2 }, B: { x: -3, y: 4 } }, showRuleNames: false });
    expect(xml).toContain('Geometry x="1.0" y="2.0"');
    expect(xml).toContain('Geometry x="-3.0" y="4.0"');
  });
});
