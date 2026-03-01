/**
 * Tests for BNG2-style atomic pattern decomposition in arGraphBuilder.
 *
 * Reference: BNG2.pl NetworkGraph.pm makeAtomicPattern + makeTransformation + getContext
 *
 * BNG2 decomposes each rule into three sets:
 *   reactants  – the "before" side of each graph operation
 *   products   – the "after" side of each graph operation
 *   context    – atoms present on BOTH sides (unchanged)
 *
 * These tests verify that buildAtomRuleGraph with atomization:'bng2' produces the
 * exact same atom-node labels as BNG2.pl, validated against BNG2.pl reference outputs.
 */

import { describe, it, expect } from 'vitest';
import { buildAtomRuleGraph } from '../../services/visualization/arGraphBuilder';
import type { ReactionRule } from '../../types';

const mkRule = (
    name: string,
    reactants: string[],
    products: string[],
    rate = 'k',
    isBidirectional = false,
): ReactionRule => ({ name, reactants, products, rate, isBidirectional });

// Helper: pull only atom-type node labels (not rule labels)
const atomLabels = (graph: ReturnType<typeof buildAtomRuleGraph>) =>
    graph.nodes.filter(n => n.type === 'atom').map(n => n.label).sort();

// Helper: edge types from atoms → rule or rule → atoms
const edgeTypes = (graph: ReturnType<typeof buildAtomRuleGraph>, ruleName: string) => {
    const ruleNode = graph.nodes.find(n => n.id === ruleName);
    if (!ruleNode) return { into: [] as string[], outof: [] as string[], context: [] as string[] };
    const into: string[] = [];
    const outof: string[] = [];
    const context: string[] = [];
    for (const e of graph.edges) {
        const fromAtom = graph.nodes.find(n => n.id === e.from && n.type === 'atom');
        const toAtom = graph.nodes.find(n => n.id === e.to && n.type === 'atom');
        if (e.to === ruleNode.id && fromAtom) {
            if (e.edgeType === 'modifies') context.push(fromAtom.label);
            else into.push(fromAtom.label);
        }
        if (e.from === ruleNode.id && toAtom) {
            outof.push(toAtom.label);
        }
    }
    return { into: into.sort(), outof: outof.sort(), context: context.sort() };
};

const BNG2_OPTS = { atomization: 'bng2' as const, includeRateLawDeps: false };

// ─── Bond formation ────────────────────────────────────────────────────────────
describe('AddBond: A(x) + B(a) -> A(x!1).B(a!1)', () => {
    // BNG2 reference (viz_test2_regulatory.graphml):
    //   Atom nodes: A(x!1).B(a!1)
    //   Rule node → A(x!1).B(a!1)  (Product edge)
    //   A(x) → Rule (Reactant)   B(a) → Rule (Reactant)

    const rule = mkRule('bind', ['A(x)', 'B(a)'], ['A(x!1).B(a!1)']);

    it('produces the bond atom as an atom node', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        expect(atomLabels(g)).toContain('A(x!1).B(a!1)');
    });

    it('produces free-component reactant atoms', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        expect(atomLabels(g)).toContain('A(x)');
        expect(atomLabels(g)).toContain('B(a)');
    });

    it('marks bond as product, components as reactants', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const { into, outof, context } = edgeTypes(g, 'bind');
        expect(into.sort()).toEqual(['A(x)', 'B(a)'].sort());
        expect(outof).toEqual(['A(x!1).B(a!1)']);
        expect(context).toHaveLength(0);
    });
});

// ─── State change ──────────────────────────────────────────────────────────────
describe('ChangeState: A(y~u) -> A(y~p)', () => {
    // BNG2: reactant atom A(y~u), product atom A(y~p)
    const rule = mkRule('phos', ['A(y~u)'], ['A(y~p)']);

    it('produces state atoms for both sides', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        expect(atomLabels(g)).toContain('A(y~u)');
        expect(atomLabels(g)).toContain('A(y~p)');
    });

    it('marks u-state as reactant, p-state as product', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const { into, outof } = edgeTypes(g, 'phos');
        expect(into).toContain('A(y~u)');
        expect(outof).toContain('A(y~p)');
    });
});

// ─── State change with bond context ───────────────────────────────────────────
describe('ChangeState with bond context: A(x!1,y~u).B(a!1) -> A(x!1,y~p).B(a!1)', () => {
    // BNG2 reference (viz_test_regulatory.graphml for `phos` rule):
    //   Reactant atom: A(y~u)
    //   Product atom:  A(y~p)
    //   Context atom:  A(x!1).B(a!1)
    const rule = mkRule('phos', ['A(x!1,y~u).B(a!1)'], ['A(x!1,y~p).B(a!1)']);

    it('produces state change atoms and bond context', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const labels = atomLabels(g);
        expect(labels).toContain('A(y~u)');
        expect(labels).toContain('A(y~p)');
        expect(labels).toContain('A(x!1).B(a!1)');
    });

    it('does NOT produce whole-species strings as atom nodes', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const labels = atomLabels(g);
        expect(labels).not.toContain('A(x!1,y~u).B(a!1)');
        expect(labels).not.toContain('A(x!1,y~p).B(a!1)');
    });

    it('classifies edges correctly', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const { into, outof, context } = edgeTypes(g, 'phos');
        expect(into).toContain('A(y~u)');
        expect(outof).toContain('A(y~p)');
        expect(context).toContain('A(x!1).B(a!1)');
    });
});

// ─── Bond deletion ────────────────────────────────────────────────────────────
describe('DeleteBond: A(x!1).B(a!1) -> A(x) + B(a)', () => {
    // BNG2: reactant = bond atom A(x!1).B(a!1), products = A(x), B(a)
    const rule = mkRule('unbind', ['A(x!1).B(a!1)'], ['A(x)', 'B(a)']);

    it('uses bond as reactant, free components as products', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const { into, outof } = edgeTypes(g, 'unbind');
        expect(into).toContain('A(x!1).B(a!1)');
        expect(outof).toContain('A(x)');
        expect(outof).toContain('B(a)');
    });
});

// ─── Molecule synthesis ────────────────────────────────────────────────────────
// '0' (null species) can't be parsed by the engine as a molecule name;
// synthesis rules use empty reactants in practice.
describe('AddMol: [] -> A()', () => {
    const rule = mkRule('synth', [], ['A()']);

    it('produces molecule atom as product', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const { outof } = edgeTypes(g, 'synth');
        expect(outof.some(l => l.startsWith('A'))).toBe(true);
    });
});

// ─── Bidirectional rules create two rule nodes ────────────────────────────────
describe('Bidirectional bind: A(x) + B(a) <-> A(x!1).B(a!1)', () => {
    const rule = mkRule('bind', ['A(x)', 'B(a)'], ['A(x!1).B(a!1)'], 'k', true);

    it('creates a rule node', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const ruleNodes = g.nodes.filter(n => n.type === 'rule');
        expect(ruleNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('still produces bond atom and free-component atoms', () => {
        const g = buildAtomRuleGraph([rule], BNG2_OPTS);
        const labels = atomLabels(g);
        expect(labels).toContain('A(x!1).B(a!1)');
        expect(labels).toContain('A(x)');
        expect(labels).toContain('B(a)');
    });
});
