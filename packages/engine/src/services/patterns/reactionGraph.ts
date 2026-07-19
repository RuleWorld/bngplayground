/**
 * reactionGraph.ts — general directed reactant->product graph primitive.
 *
 * A single construction underlies several graphs the codebase builds
 * separately: the MCP server's rule-labelled molecule route graph, the app's
 * species interaction graph, and the app's regulatory (rule LHS -> RHS) graph.
 * All are "for each reaction/rule, connect reactant-derived nodes to
 * product-derived nodes, directed"; they differ only in how a reactant/product
 * entry maps to node keys (identity for species, molecule-name extraction for
 * patterns) and whether edges carry a label. This primitive captures that once.
 *
 * Pure; no engine-state or browser dependencies.
 */

export interface ReactionLike {
    reactants: string[];
    products: string[];
    name?: string;
}

export interface DirectedEdge {
    from: string;
    to: string;
    label?: string;
}

/**
 * Build the directed reactant->product edge set for a collection of reactions
 * or rules.
 *
 * @param reactions  reactions/rules with `reactants`/`products` entries
 * @param opts.nodesOf  maps one reactant/product entry (a species id or a BNGL
 *                      pattern) to zero or more node keys; defaults to identity
 * @param opts.labelOf  optional per-reaction edge label (e.g. the rule name)
 *
 * An edge is emitted from every reactant-derived node to every product-derived
 * node, self-loops are skipped, and edges are de-duplicated on (from, to, label)
 * so distinct rules between the same pair are preserved as parallel edges.
 */
export function buildDirectedReactionGraph(
    reactions: ReactionLike[],
    opts?: {
        nodesOf?: (entry: string) => string[];
        labelOf?: (reaction: ReactionLike) => string | undefined;
    },
): DirectedEdge[] {
    const nodesOf = opts?.nodesOf ?? ((entry: string) => [entry]);
    const labelOf = opts?.labelOf;
    const seen = new Set<string>();
    const edges: DirectedEdge[] = [];

    for (const reaction of reactions) {
        const reactantNodes = Array.from(new Set((reaction.reactants ?? []).flatMap(nodesOf)));
        const productNodes = Array.from(new Set((reaction.products ?? []).flatMap(nodesOf)));
        const label = labelOf ? labelOf(reaction) : undefined;

        for (const from of reactantNodes) {
            for (const to of productNodes) {
                if (from === to) continue;
                const key = `${from}\u0000${to}\u0000${label ?? ''}`;
                if (seen.has(key)) continue;
                seen.add(key);
                edges.push(label !== undefined ? { from, to, label } : { from, to });
            }
        }
    }

    return edges;
}
