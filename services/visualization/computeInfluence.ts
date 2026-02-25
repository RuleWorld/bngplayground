/**
 * Compute the structural influence graph from rule overlays.
 *
 * Port of RuleBender's InfluenceGraphModel.generateImap()/determineinfluence():
 *
 * Algorithm overview:
 *   For each pair of rules (r1, r2) where r1 ≠ r2:
 *     - ACTIVATION: rule r1's products overlap with rule r2's reactants
 *       (r1 creates what r2 needs)
 *     - INHIBITION: rule r1's products conflict with rule r2's reactants
 *       (r1 destroys what r2 needs)
 *
 * "Definite" vs "Possible":
 *   - Definite: Full structural match between center/context sets
 *   - Possible: Partial overlap (some elements match, some don't)
 *
 * For bidirectional rules, RuleBender treats forward/reverse as separate
 * rule nodes. We do the same.
 */

import type { RuleOverlay } from './ruleOverlay';
import type { InfluenceEdge, InfluenceGraphData, InfluenceNode } from './influenceGraph';
import type { ReactionRule } from '../../types';

/**
 * Build the full influence graph from rule overlays.
 *
 * @param overlays - RuleOverlay[] from buildRuleOverlays()
 * @param rules    - The original reaction rules (for bidirectional check)
 */
export function computeInfluenceGraph(
    overlays: RuleOverlay[],
    rules: ReactionRule[],
): InfluenceGraphData {
    // Build rule nodes — bidirectional rules expand to forward + reverse
    const nodes: InfluenceNode[] = [];
    // Map from node index to [overlay index, isForward]
    const nodeInfo: Array<{ overlayIndex: number; isForward: boolean }> = [];

    for (let i = 0; i < overlays.length; i++) {
        const overlay = overlays[i];
        const rule = rules[i];

        nodes.push({
            ruleIndex: i,
            ruleName: overlay.ruleName,
            ruleExpression: overlay.ruleExpression,
        });
        nodeInfo.push({ overlayIndex: i, isForward: true });

        if (rule?.isBidirectional) {
            nodes.push({
                ruleIndex: i,
                ruleName: `${overlay.ruleName} (rev)`,
                ruleExpression: overlay.ruleExpression.replace('->', '<-'),
            });
            nodeInfo.push({ overlayIndex: i, isForward: false });
        }
    }

    // Compute influence edges between all pairs
    const edges: InfluenceEdge[] = [];

    for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;

            const info1 = nodeInfo[i];
            const info2 = nodeInfo[j];
            const overlay1 = overlays[info1.overlayIndex];
            const overlay2 = overlays[info2.overlayIndex];

            const edge = determineInfluence(
                overlay1, info1.isForward,
                overlay2, info2.isForward,
                i, j,
            );

            if (edge.activation !== -1 || edge.inhibition !== -1) {
                edges.push(edge);
            }
        }
    }

    return { nodes, edges };
}

/**
 * Determine the influence of rule r1 on rule r2.
 *
 * Mirrors RuleBender's determineinfluence() logic:
 *
 * When r1 is forward and r2 is forward:
 *   - INHIBITION: r1's reactants (what it consumes) overlap r2's reactants
 *   - ACTIVATION: r1's products (what it creates) overlap r2's reactants
 *
 * The "center" of r1 represents what changes, and the "context" of r2
 * represents what is needed. Influence exists when r1's center can satisfy
 * or conflict with r2's context.
 */
function determineInfluence(
    sourceOverlay: RuleOverlay,
    sourceIsForward: boolean,
    targetOverlay: RuleOverlay,
    targetIsForward: boolean,
    sourceIdx: number,
    targetIdx: number,
): InfluenceEdge {
    const edge: InfluenceEdge = {
        sourceRuleIndex: sourceIdx,
        targetRuleIndex: targetIdx,
        activation: -1,
        inhibition: -1,
        reasons: [],
    };

    // What the source rule produces (center) and what the target needs (context)
    const sourceCenter = sourceIsForward
        ? sourceOverlay.center
        : reverseCenter(sourceOverlay.center);

    // For a reverse rule TARGET, its "reactants" are the forward rule's PRODUCTS,
    // so use productContext instead of the reactant-derived context.
    const context = targetIsForward
        ? targetOverlay.context
        : targetOverlay.productContext;

    // --- ACTIVATION: source creates what target needs ---

    // Bond activation: source adds a bond that target requires
    for (const [a, b] of sourceCenter.bondsAdded) {
        if (bondPairExistsIn(a, b, context.requiredBonds)) {
            upgradeActivation(edge, true, `creates bond ${a}—${b}`);
        } else if (componentTested(a, context.testedComponents) ||
            componentTested(b, context.testedComponents)) {
            upgradeActivation(edge, false, `touches component near ${a}—${b}`);
        }
    }

    // Molecule activation: source creates a molecule that target tests
    for (const mol of sourceCenter.moleculesAdded) {
        if (moleculeTestedIn(mol, context.testedComponents)) {
            upgradeActivation(edge, true, `creates molecule ${mol}`);
        }
    }

    // State activation: source changes state that matches target's tested state
    for (const key of sourceCenter.stateChanges) {
        if (context.testedComponents.has(key)) {
            upgradeActivation(edge, false, `changes state of ${key}`);
        }
        // Check if the new state value matches what target tests
        for (const testedState of context.testedStates) {
            if (testedState.startsWith(`${key}~`)) {
                upgradeActivation(edge, false, `modifies tested state ${testedState}`);
            }
        }
    }

    // --- INHIBITION: source destroys what target needs ---

    // Bond inhibition: source removes a bond that target requires
    for (const [a, b] of sourceCenter.bondsRemoved) {
        if (bondPairExistsIn(a, b, context.requiredBonds)) {
            upgradeInhibition(edge, true, `breaks required bond ${a}—${b}`);
        } else if (componentTested(a, context.testedComponents) ||
            componentTested(b, context.testedComponents)) {
            upgradeInhibition(edge, false, `disrupts context near ${a}—${b}`);
        }
    }

    // Molecule inhibition: source degrades a molecule that target tests
    for (const mol of sourceCenter.moleculesRemoved) {
        if (moleculeTestedIn(mol, context.testedComponents)) {
            upgradeInhibition(edge, true, `degrades molecule ${mol}`);
        }
    }

    return edge;
}

/**
 * For a reverse rule, swap what's "added" and "removed".
 */
function reverseCenter(center: RuleOverlay['center']): RuleOverlay['center'] {
    return {
        stateChanges: center.stateChanges, // states still change, just in opposite direction
        bondsAdded: center.bondsRemoved,
        bondsRemoved: center.bondsAdded,
        moleculesAdded: center.moleculesRemoved,
        moleculesRemoved: center.moleculesAdded,
    };
}

function bondPairExistsIn(
    a: string,
    b: string,
    bonds: Array<[string, string]>,
): boolean {
    return bonds.some(
        ([x, y]) => (x === a && y === b) || (x === b && y === a),
    );
}

function componentTested(key: string, tested: Set<string>): boolean {
    return tested.has(key);
}

function moleculeTestedIn(mol: string, tested: Set<string>): boolean {
    for (const key of tested) {
        if (key.startsWith(`${mol}.`)) return true;
    }
    return false;
}

/**
 * Upgrade activation: definite overrides possible, possible overrides none.
 * Mirrors RuleBender's Influence.setActivation(boolean definite).
 */
function upgradeActivation(
    edge: InfluenceEdge,
    definite: boolean,
    reason: string,
): void {
    edge.reasons.push(`+${reason}`);
    if (definite) {
        edge.activation = 1;
    } else if (edge.activation === -1) {
        edge.activation = 0;
    }
}

function upgradeInhibition(
    edge: InfluenceEdge,
    definite: boolean,
    reason: string,
): void {
    edge.reasons.push(`-${reason}`);
    if (definite) {
        edge.inhibition = 1;
    } else if (edge.inhibition === -1) {
        edge.inhibition = 0;
    }
}
