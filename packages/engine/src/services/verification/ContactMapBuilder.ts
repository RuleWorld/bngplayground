import type { ReactionRule, BNGLMoleculeType } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';

export interface ContactNode {
    id: string;
    label: string;
    type: 'molecule' | 'component' | 'state' | 'compartment';
    parent?: string;
    isGroup?: boolean;
}

export interface ContactEdge {
    from: string;
    to: string;
    interactionType: 'binding';
    componentPair?: [string, string];
    ruleIds: string[];
    ruleLabels: string[];
}

export interface ContactMap {
    nodes: ContactNode[];
    edges: ContactEdge[];
}

type ParsedSpeciesGraph = ReturnType<typeof BNGLParser.parseSpeciesGraph>;

function splitByTopLevelCommas(pattern: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (const ch of pattern) {
        if (ch === '(') {
            depth += 1;
        } else if (ch === ')') {
            depth = Math.max(0, depth - 1);
        }
        if (ch === ',' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
                parts.push(trimmed);
            }
            current = '';
            continue;
        }
        current += ch;
    }
    const trimmed = current.trim();
    if (trimmed) {
        parts.push(trimmed);
    }
    return parts;
}

function parseSpeciesGraphs(patterns: string[]): ParsedSpeciesGraph[] {
    const graphs: ParsedSpeciesGraph[] = [];
    for (const pattern of (patterns ?? [])) {
        const pieces = splitByTopLevelCommas(String(pattern));
        for (const piece of pieces) {
            graphs.push(BNGLParser.parseSpeciesGraph(piece, true));
        }
    }
    return graphs;
}

function extractBonds(graphs: ParsedSpeciesGraph[]): Map<string, { mol1: string; mol2: string; comp1: string; comp2: string }> {
    const bonds = new Map<string, { mol1: string; mol2: string; comp1: string; comp2: string }>();
    const sanitize = (name: string) => {
        if (typeof name !== 'string') return '';
        const dotIdx = name.indexOf('.');
        return dotIdx === -1 ? name : name.slice(0, dotIdx);
    };

    (graphs ?? []).forEach((graph) => {
        graph?.molecules?.forEach((molecule, molIdx) => {
            if (!molecule) return;
            const molName = sanitize(molecule.name);
            molecule.components?.forEach((component, compIdx) => {
                if (!component) return;
                const partnerKeys = graph.adjacency?.get(`${molIdx}.${compIdx}`);
                if (!partnerKeys || partnerKeys.length === 0) {
                    return;
                }
                for (const partnerKey of partnerKeys) {
                    const dotIdx = partnerKey.indexOf('.');
                    const partnerMolIdx = Number.parseInt(dotIdx === -1 ? partnerKey : partnerKey.slice(0, dotIdx), 10);
                    const partnerCompIdx = Number.parseInt(dotIdx === -1 ? 'NaN' : partnerKey.slice(dotIdx + 1), 10);
                    if (Number.isNaN(partnerMolIdx) || Number.isNaN(partnerCompIdx)) {
                        continue;
                    }
                    if (partnerMolIdx < molIdx || (partnerMolIdx === molIdx && partnerCompIdx < compIdx)) {
                        continue;
                    }
                    const partnerMolecule = graph.molecules?.[partnerMolIdx];
                    const partnerComponent = partnerMolecule?.components?.[partnerCompIdx];
                    if (!partnerMolecule || !partnerComponent) {
                        continue;
                    }
                    const partnerName = sanitize(partnerMolecule.name);
                    const endpoints = [`${molName}:${component.name}`, `${partnerName}:${partnerComponent.name}`].sort();
                    const key = endpoints.join('|');
                    bonds.set(key, {
                        mol1: molName,
                        mol2: partnerName,
                        comp1: component.name,
                        comp2: partnerComponent.name,
                    });
                }
            });
        });
    });

    return bonds;
}

/**
 * Builds a visual contact map graph (nodes and edges) from BioNetGen reaction rules
 * and molecule type definitions.
 *
 * @param rules - Array of reaction rules in the model.
 * @param moleculeTypes - Array of declared molecule types in the model.
 * @returns Structured `ContactMap` containing node hierarchy (molecules, components, states) and binding edges.
 */
export function buildContactMap(rules: ReactionRule[], moleculeTypes: BNGLMoleculeType[] = []): ContactMap {
    const moleculeMap = new Map<string, Set<string>>();
    const componentStateMap = new Map<string, Set<string>>();
    const edgeMap = new Map<string, ContactEdge>();

    (moleculeTypes ?? []).forEach((moleculeType) => {
        if (!moleculeType) return;
        if (!moleculeMap.has(moleculeType.name)) {
            moleculeMap.set(moleculeType.name, new Set());
        }
        moleculeType.components?.forEach((componentDefinition) => {
            if (typeof componentDefinition !== 'string') return;
            const parts = componentDefinition.split('~');
            const componentName = parts[0];
            moleculeMap.get(moleculeType.name)?.add(componentName);
            if (parts.length > 1) {
                const stateKey = `${moleculeType.name}_${componentName}`;
                if (!componentStateMap.has(stateKey)) {
                    componentStateMap.set(stateKey, new Set());
                }
                parts.slice(1).forEach((state) => componentStateMap.get(stateKey)?.add(state));
            }
        });
    });

    (rules ?? []).forEach((rule, index) => {
        if (!rule) return;
        const ruleId = rule.name ?? `rule_${index + 1}`;
        const ruleLabel = rule.name ?? `Rule ${index + 1}`;
        const reactantGraphs = parseSpeciesGraphs(rule.reactants ?? []);
        const productGraphs = parseSpeciesGraphs(rule.products ?? []);
        [...reactantGraphs, ...productGraphs].forEach((graph) => {
            graph?.molecules?.forEach((molecule) => {
                if (!molecule || molecule.name === '0') {
                    return;
                }
                const name = molecule.name ?? '';
                const dotIdx = name.indexOf('.');
                const moleculeName = dotIdx === -1 ? name : name.slice(0, dotIdx);
                if (moleculeName.length > 0) {
                    if (!moleculeMap.has(moleculeName)) {
                        moleculeMap.set(moleculeName, new Set());
                    }
                }
                molecule.components?.forEach((component) => {
                    if (!component || typeof component.name !== 'string') return;
                    if (moleculeName.length > 0) {
                        moleculeMap.get(moleculeName)?.add(component.name);
                    }
                    if (component.state && component.state !== '?') {
                        const stateKey = `${moleculeName}_${component.name}`;
                        if (!componentStateMap.has(stateKey)) {
                            componentStateMap.set(stateKey, new Set());
                        }
                        componentStateMap.get(stateKey)?.add(component.state);
                    }
                });
            });
        });

        const bonds = new Map<string, { mol1: string; mol2: string; comp1: string; comp2: string }>();
        extractBonds(reactantGraphs).forEach((value, key) => bonds.set(key, value));
        extractBonds(productGraphs).forEach((value, key) => bonds.set(key, value));

        bonds.forEach((bond) => {
            const source = `${bond.mol1}_${bond.comp1}`;
            const target = `${bond.mol2}_${bond.comp2}`;
            const edgeKey = `${source}->${target}`;
            if (!edgeMap.has(edgeKey)) {
                edgeMap.set(edgeKey, {
                    from: source,
                    to: target,
                    interactionType: 'binding',
                    componentPair: [bond.comp1, bond.comp2],
                    ruleIds: [],
                    ruleLabels: [],
                });
            }
            const edge = edgeMap.get(edgeKey);
            if (edge && !edge.ruleIds.includes(ruleId)) {
                edge.ruleIds.push(ruleId);
                edge.ruleLabels.push(ruleLabel);
            }
        });
    });

    const nodes: ContactNode[] = [];
    const sortedMolecules = Array.from(moleculeMap.keys()).sort();
    const idMap = new Map<string, string>();

    sortedMolecules.forEach((moleculeName, moleculeIndex) => {
        const moleculeId = `${moleculeIndex}`;
        const components = Array.from(moleculeMap.get(moleculeName) ?? []).sort();
        idMap.set(moleculeName, moleculeId);
        nodes.push({
            id: moleculeId,
            label: moleculeName,
            type: 'molecule',
            isGroup: components.length > 0,
        });
        components.forEach((componentName, componentIndex) => {
            const componentId = `${moleculeIndex}.${componentIndex}`;
            idMap.set(`${moleculeName}_${componentName}`, componentId);
            const stateKey = `${moleculeName}_${componentName}`;
            const states = Array.from(componentStateMap.get(stateKey) ?? []).sort();
            nodes.push({
                id: componentId,
                label: componentName,
                type: 'component',
                parent: moleculeId,
                isGroup: states.length > 0,
            });
            states.forEach((stateName, stateIndex) => {
                nodes.push({
                    id: `${moleculeIndex}.${componentIndex}.${stateIndex}`,
                    label: stateName,
                    type: 'state',
                    parent: componentId,
                });
            });
        });
    });

    const validNodeIds = new Set(nodes.map((node) => node.id));
    const edges = Array.from(edgeMap.values())
        .map((edge) => ({
            ...edge,
            from: idMap.get(edge.from) ?? edge.from,
            to: idMap.get(edge.to) ?? edge.to,
        }))
        .filter((edge) => validNodeIds.has(edge.from) && validNodeIds.has(edge.to));

    return { nodes, edges };
}
