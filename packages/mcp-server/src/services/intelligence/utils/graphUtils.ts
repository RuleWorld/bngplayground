import { extractMoleculeNames } from '../../engine.js';
import { buildDirectedReactionGraph } from '@bngplayground/engine';

export { extractMoleculeNames };

/**
 * Rule-level provenance for parameter sensitivity.
 *
 * The functions here build the *structural* route that connects a rate
 * parameter to an observable. They deliberately do NOT assert causation on
 * their own: global sensitivity analysis (Sobol) establishes THAT a parameter
 * influences an observable; the route here is a mechanistic hypothesis for HOW
 * that influence is carried, expressed as a directed, rule-labeled path through
 * the reaction structure. Whether the dynamics actually carry information along
 * that route is a separate, checkable question (see `annotateRouteSupport`).
 */

export interface RouteEdge {
    from: string;
    to: string;
    rule: string;
    /** filled in by annotateRouteSupport when empirical information flow is available */
    supported?: boolean;
}

export interface ReactionRoute {
    nodes: string[];
    edges: RouteEdge[];
}

export type ReactionGraph = Map<string, RouteEdge[]>;

/**
 * True iff `paramName` appears in `rateExpr` as a complete identifier token,
 * not merely as a substring. Prevents `k1` from matching `k10`, `mk1`,
 * `k1_deg`, etc. Identifier characters are [A-Za-z0-9_].
 */
export function matchesParameter(rateExpr: string, paramName: string): boolean {
    if (!rateExpr || !paramName) return false;
    const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Token boundary: start/non-identifier char before, non-identifier char/end after.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`);
    return re.test(rateExpr);
}

/**
 * Directed, rule-labeled species graph. For each rule, an edge A -> B labeled
 * with the rule name is added for every reactant molecule A and product
 * molecule B (A != B): rule r consumes/uses A and produces/affects B. This is
 * the standard directed substrate/species-reaction projection, which — unlike
 * an undirected co-occurrence graph — preserves transformation direction and
 * remembers which rule carries each step.
 */
export function buildReactionGraph(
    ruleDescriptors: Array<{ name: string; reactants: string[]; products: string[] }>,
): ReactionGraph {
    // Molecule-level instance of the shared directed reactant->product primitive:
    // nodes are molecule-type names, edges are labelled by the rule name.
    const edges = buildDirectedReactionGraph(ruleDescriptors, {
        nodesOf: extractMoleculeNames,
        labelOf: (rule) => rule.name,
    });

    const graph: ReactionGraph = new Map();
    for (const edge of edges) {
        const routeEdge: RouteEdge = { from: edge.from, to: edge.to, rule: edge.label ?? '' };
        if (!graph.has(edge.from)) graph.set(edge.from, []);
        graph.get(edge.from)!.push(routeEdge);
    }
    return graph;
}

/**
 * Shortest directed route (fewest rule-steps) from any source molecule to any
 * target (observable) molecule, following reaction direction. Returns the node
 * sequence AND the rule that carries each step, or null if no route exists
 * within `maxDepth`. A source that is itself a target yields a zero-edge route
 * (the parameter's rule already involves the observed species). Deterministic:
 * BFS follows graph insertion order.
 */
export function findReactionRoute(
    graph: ReactionGraph,
    sources: Iterable<string>,
    targets: Set<string>,
    maxDepth = 8,
): ReactionRoute | null {
    const sourceList = Array.from(new Set(Array.from(sources).filter(Boolean)));

    // Trivial route: an implicated rule already touches an observable species.
    for (const s of sourceList) {
        if (targets.has(s)) return { nodes: [s], edges: [] };
    }

    const visited = new Set<string>(sourceList);
    const queue: Array<{ node: string; nodes: string[]; edges: RouteEdge[] }> = sourceList.map((s) => ({
        node: s,
        nodes: [s],
        edges: [],
    }));

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.edges.length >= maxDepth) continue;
        const outgoing = graph.get(current.node);
        if (!outgoing) continue;
        for (const edge of outgoing) {
            if (visited.has(edge.to)) continue;
            const nextEdges = [...current.edges, { from: edge.from, to: edge.to, rule: edge.rule }];
            if (targets.has(edge.to)) {
                return { nodes: [...current.nodes, edge.to], edges: nextEdges };
            }
            visited.add(edge.to);
            queue.push({ node: edge.to, nodes: [...current.nodes, edge.to], edges: nextEdges });
        }
    }

    return null;
}

export type RouteSupportStatus =
    | 'dynamically_supported'   // every step carries empirical information flow
    | 'partially_supported'     // some steps carry empirical flow
    | 'structural_only'         // no step is corroborated by the dynamics
    | 'unchecked'               // no empirical information-flow data supplied
    | 'trivial';                // zero-edge route (rule directly touches observable)

/**
 * Falsifiability check. Given the directed route and a set of directed couplings
 * the dynamics actually exhibit (empirical information flow, keyed as
 * "from->to" over the same molecule labels), mark each route edge as supported
 * or not and return an overall status. This is what turns "here is a plausible
 * route" into "here is a route, and here is whether the model's own dynamics
 * corroborate it." Pass an empty/undefined set to leave the route `unchecked`.
 */
/**
 * Falsifiability check against the model's own stochastic dynamics.
 *
 * Two independent, honest signals are used:
 *  - Per-step firing (`activeRules`): a route step carried by rule `r` is
 *    supported iff `r` actually fires in the recorded SSA run. A structural
 *    route that passes through a rule that never fires is not a dynamical
 *    pathway, and is flagged `structural_only` rather than presented as fact.
 *  - Whole-route information flow (`ruleFlow`): the route is additionally
 *    corroborated iff every consecutive rule hand-off along it appears in the
 *    empirical transfer-entropy graph between reactions (projected to rules).
 *
 * With no dynamical data supplied, the route is left `unchecked`.
 */
export function annotateRouteSupport(
    edges: RouteEdge[],
    opts?: { activeRules?: Set<string>; ruleFlow?: Set<string> },
): { edges: RouteEdge[]; status: RouteSupportStatus; informationFlowCorroborated?: boolean } {
    if (edges.length === 0) {
        return { edges, status: 'trivial' };
    }
    const activeRules = opts?.activeRules;
    if (!activeRules) {
        return { edges: edges.map((e) => ({ ...e })), status: 'unchecked' };
    }
    let supportedCount = 0;
    const annotated = edges.map((e) => {
        const supported = activeRules.has(e.rule);
        if (supported) supportedCount++;
        return { ...e, supported };
    });
    const status: RouteSupportStatus =
        supportedCount === edges.length ? 'dynamically_supported'
        : supportedCount > 0 ? 'partially_supported'
        : 'structural_only';

    let informationFlowCorroborated: boolean | undefined;
    if (opts?.ruleFlow && edges.length >= 2) {
        informationFlowCorroborated = true;
        for (let i = 0; i < edges.length - 1; i++) {
            if (!opts.ruleFlow.has(`${edges[i].rule}->${edges[i + 1].rule}`)) {
                informationFlowCorroborated = false;
                break;
            }
        }
    }
    return { edges: annotated, status, informationFlowCorroborated };
}

/* ------------------------------------------------------------------ */
/*  Reaction-index <-> rule bridge (for dynamical route validation)    */
/* ------------------------------------------------------------------ */

/**
 * Map each expanded-reaction index to the rule that generated it, read
 * directly from the SSA firing log (every firing event carries both). This is
 * the ground-truth bridge from the reaction-level information-flow graph back
 * to rule-level routes — no heuristic inference.
 */
export function buildReactionRuleMap(
    firingLog: Array<{ reactionIndex: number; ruleName?: string }>,
): Map<number, string> {
    const map = new Map<number, string>();
    for (const ev of firingLog) {
        if (ev.ruleName && !map.has(ev.reactionIndex)) {
            map.set(ev.reactionIndex, ev.ruleName);
        }
    }
    return map;
}

/** Rules that fired at least `minFirings` times in the recorded dynamics. */
export function activeRulesFromFiringLog(
    firingLog: Array<{ ruleName?: string }>,
    minFirings = 1,
): Set<string> {
    const counts = new Map<string, number>();
    for (const ev of firingLog) {
        if (!ev.ruleName) continue;
        counts.set(ev.ruleName, (counts.get(ev.ruleName) ?? 0) + 1);
    }
    const active = new Set<string>();
    for (const [rule, count] of counts) {
        if (count >= minFirings) active.add(rule);
    }
    return active;
}

/**
 * Project the reaction-level empirical information-flow graph into a set of
 * rule-level directed couplings ("ruleA->ruleB"), using the reaction->rule map.
 * Self-couplings (a rule feeding its own reactions) are dropped so that the set
 * describes flow *between* rules along a route.
 */
export function projectEmpiricalToRuleFlow(
    empirical: Array<{ source: number; target: number; weight: number }>,
    reactionRule: Map<number, string>,
    minWeight = 0,
): Set<string> {
    const flow = new Set<string>();
    for (const e of empirical) {
        if (e.weight < minWeight) continue;
        const s = reactionRule.get(e.source);
        const t = reactionRule.get(e.target);
        if (!s || !t || s === t) continue;
        flow.add(`${s}->${t}`);
    }
    return flow;
}
