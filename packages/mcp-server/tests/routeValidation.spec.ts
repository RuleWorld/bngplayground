import { describe, expect, it } from 'vitest';
import {
    matchesParameter,
    buildReactionGraph,
    findReactionRoute,
    annotateRouteSupport,
    buildReactionRuleMap,
    activeRulesFromFiringLog,
    projectEmpiricalToRuleFlow,
} from '../src/services/intelligence/utils/graphUtils.js';

// A small linear cascade: R --r_activate--> Ra --r_downstream--> A --r_output--> Out
const RULES = [
    { name: 'r_activate', reactants: ['R'], products: ['Ra'], rate: 'k1*R' },
    { name: 'r_downstream', reactants: ['Ra'], products: ['A'], rate: 'k2*Ra' },
    { name: 'r_output', reactants: ['A'], products: ['Out'], rate: 'k10*A' },
    { name: 'r_side', reactants: ['B'], products: ['Out'], rate: 'k1b*B' },
];

describe('matchesParameter (token-aware attribution)', () => {
    it('matches a whole-token parameter but not substrings', () => {
        expect(matchesParameter('k1*R', 'k1')).toBe(true);
        expect(matchesParameter('k1', 'k1')).toBe(true);
        expect(matchesParameter('f(k1)+k2', 'k1')).toBe(true);
        expect(matchesParameter('k10*A', 'k1')).toBe(false);
        expect(matchesParameter('mk1*x', 'k1')).toBe(false);
        expect(matchesParameter('k1_deg', 'k1')).toBe(false);
    });
});

describe('buildReactionGraph + findReactionRoute (directed, rule-labelled)', () => {
    const graph = buildReactionGraph(RULES);

    it('preserves reaction direction', () => {
        expect((graph.get('R') ?? []).some((e) => e.to === 'Ra')).toBe(true);
        expect((graph.get('Ra') ?? []).some((e) => e.to === 'R')).toBe(false);
    });

    it('returns the directed route with its rule labels', () => {
        const route = findReactionRoute(graph, new Set(['R']), new Set(['Out']), 8);
        expect(route).not.toBeNull();
        expect(route!.nodes).toEqual(['R', 'Ra', 'A', 'Out']);
        expect(route!.edges.map((e) => e.rule)).toEqual(['r_activate', 'r_downstream', 'r_output']);
    });

    it('returns a zero-edge route when a source is already the observable', () => {
        const route = findReactionRoute(graph, new Set(['A', 'Out']), new Set(['Out']), 8);
        expect(route).not.toBeNull();
        expect(route!.edges.length).toBe(0);
    });
});

describe('annotateRouteSupport (falsifiability against dynamics)', () => {
    const route = findReactionRoute(buildReactionGraph(RULES), new Set(['R']), new Set(['Out']), 8)!;

    it('is unchecked without dynamical data', () => {
        expect(annotateRouteSupport(route.edges).status).toBe('unchecked');
        expect(annotateRouteSupport(route.edges, {}).status).toBe('unchecked');
    });

    it('marks steps supported by rule firing', () => {
        const all = new Set(['r_activate', 'r_downstream', 'r_output']);
        expect(annotateRouteSupport(route.edges, { activeRules: all }).status).toBe('dynamically_supported');

        const some = new Set(['r_activate', 'r_output']); // r_downstream never fires
        const partial = annotateRouteSupport(route.edges, { activeRules: some });
        expect(partial.status).toBe('partially_supported');
        expect(partial.edges.find((e) => e.rule === 'r_downstream')!.supported).toBe(false);

        expect(annotateRouteSupport(route.edges, { activeRules: new Set() }).status).toBe('structural_only');
    });

    it('corroborates the whole route only when every hand-off shows information flow', () => {
        const all = new Set(['r_activate', 'r_downstream', 'r_output']);
        const full = new Set(['r_activate->r_downstream', 'r_downstream->r_output']);
        expect(annotateRouteSupport(route.edges, { activeRules: all, ruleFlow: full }).informationFlowCorroborated).toBe(true);

        const missing = new Set(['r_activate->r_downstream']);
        expect(annotateRouteSupport(route.edges, { activeRules: all, ruleFlow: missing }).informationFlowCorroborated).toBe(false);
    });
});

describe('reaction -> rule bridge (from the SSA firing log)', () => {
    const firingLog = [
        { time: 0.1, reactionIndex: 0, ruleName: 'r_activate', propensity: 1 },
        { time: 0.2, reactionIndex: 1, ruleName: 'r_downstream', propensity: 1 },
        { time: 0.3, reactionIndex: 0, ruleName: 'r_activate', propensity: 1 },
        { time: 0.4, reactionIndex: 2, ruleName: 'r_output', propensity: 1 },
    ];

    it('maps reaction indices back to their generating rule', () => {
        const map = buildReactionRuleMap(firingLog);
        expect(map.get(0)).toBe('r_activate');
        expect(map.get(1)).toBe('r_downstream');
        expect(map.get(2)).toBe('r_output');
    });

    it('counts active rules by a firing threshold', () => {
        expect(activeRulesFromFiringLog(firingLog, 2)).toEqual(new Set(['r_activate']));
        expect(activeRulesFromFiringLog(firingLog, 1).size).toBe(3);
    });

    it('projects the empirical reaction graph to rule-level flow, dropping self-loops and weak edges', () => {
        const map = buildReactionRuleMap(firingLog);
        const empirical = [
            { source: 0, target: 1, weight: 0.5 },
            { source: 1, target: 2, weight: 0.3 },
            { source: 0, target: 0, weight: 0.9 }, // self-loop
            { source: 2, target: 1, weight: 0.05 }, // below threshold
        ];
        const flow = projectEmpiricalToRuleFlow(empirical, map, 0.1);
        expect(flow.has('r_activate->r_downstream')).toBe(true);
        expect(flow.has('r_downstream->r_output')).toBe(true);
        expect(flow.has('r_activate->r_activate')).toBe(false);
        expect(flow.has('r_output->r_downstream')).toBe(false);
    });
});
