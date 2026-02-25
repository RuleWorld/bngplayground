import type { ReactionRule, BNGLMoleculeType } from '../../types';
import type { ContactMap, ContactEdge } from '../../types/visualization';
import {
  extractBonds,
  parseSpeciesGraphs,
} from './speciesGraphUtils';

interface ContactMapOptions {
  getRuleId?: (rule: ReactionRule, index: number) => string;
  getRuleLabel?: (rule: ReactionRule, index: number) => string;
}

export const buildContactMap = (
  rules: ReactionRule[],
  moleculeTypes: BNGLMoleculeType[] = [],
  options: ContactMapOptions = {},
): ContactMap => {
  // sanitize a molecule name returned by the parser.  In some edge cases
  // (old parser bugs or malformed patterns) the name may include a dot
  // separating multiple molecules or full pattern text.  We only care about
  // the base type for the contact map, so take the portion before the first
  // dot. This mirrors the behaviour of the parsers used earlier.
  const sanitizeName = (name: string) => name.split('.')[0];

  // Track molecules and their component set for hierarchical (compound) nodes
  const moleculeMap = new Map<string, Set<string>>();
  // Track states for each component: key="molecule_component", value=Set<stateName>
  const componentStateMap = new Map<string, Set<string>>();
  const edgeMap = new Map<string, ContactEdge>();
  const activeMolecules = new Set<string>();

  // Pre-populate states from molecule types definition if available
  moleculeTypes.forEach((mt) => {
    if (!moleculeMap.has(mt.name)) moleculeMap.set(mt.name, new Set());

    mt.components.forEach((compStr) => {
      // compStr is like "state~inactive~active" or just "binding_site"
      const parts = compStr.split('~');
      const compName = parts[0];

      moleculeMap.get(mt.name)!.add(compName);

      const states = parts.slice(1);
      if (states.length > 0) {
        const compKey = `${mt.name}_${compName}`;
        if (!componentStateMap.has(compKey)) {
          componentStateMap.set(compKey, new Set());
        }
        states.forEach((s) => componentStateMap.get(compKey)!.add(s));
      }
    });
  });

  rules.forEach((rule, ruleIndex) => {
    const ruleId = options.getRuleId?.(rule, ruleIndex) ?? rule.name ?? `rule_${ruleIndex + 1}`;
    const ruleLabel = options.getRuleLabel?.(rule, ruleIndex) ?? rule.name ?? `Rule ${ruleIndex + 1}`;
    const reactantGraphs = parseSpeciesGraphs(rule.reactants as string[]);
    const productGraphs = parseSpeciesGraphs(rule.products as string[]);

    const collectStructure = (graphs: any[]) => {
      graphs.forEach((graph) => {
        graph.molecules.forEach((molecule: any) => {
          // Skip null molecule '0' but NOT Trash (which is a valid molecule type)
          if (molecule.name === '0') return;

          const molName = sanitizeName(molecule.name);
          activeMolecules.add(molName);

          if (!moleculeMap.has(molName)) moleculeMap.set(molName, new Set());

          molecule.components.forEach((c: any) => {
            moleculeMap.get(molName)!.add(c.name);

            // Skip '?' wildcard — it means "any state" in BNGL rule patterns
            // and must not be materialised as a concrete state node.
            if (c.state && c.state !== '?') {
              const compKey = `${molecule.name}_${c.name}`;
              if (!componentStateMap.has(compKey)) {
                componentStateMap.set(compKey, new Set());
              }
              componentStateMap.get(compKey)!.add(c.state);
            }
          });
        });
      });
    };

    collectStructure(reactantGraphs);
    collectStructure(productGraphs);

    // (colors are chosen at render-time by viewers using colorFromName)

    const reactantBonds = extractBonds(reactantGraphs);
    const productBonds = extractBonds(productGraphs);

    // Collect all unique bonds seen in this rule (union of reactants and products)
    // BioNetGen contact maps show any bond that *can* exist in the model.
    const allBondsInRule = new Map<string, any>();
    reactantBonds.forEach((v, k) => allBondsInRule.set(k, v));
    productBonds.forEach((v, k) => allBondsInRule.set(k, v));

    allBondsInRule.forEach((bondInfo, key) => {
      // Edge now connects component-level nodes (compound nodes)
      const sourceId = `${bondInfo.mol1}_${bondInfo.comp1}`;
      const targetId = `${bondInfo.mol2}_${bondInfo.comp2}`;
      const edgeKey = `${sourceId}->>${targetId}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          from: sourceId,
          to: targetId,
          interactionType: 'binding',
          componentPair: [bondInfo.comp1, bondInfo.comp2],
          ruleIds: [],
          ruleLabels: [],
        });
      }
      const edge = edgeMap.get(edgeKey)!;
      if (!edge.ruleIds.includes(ruleId)) {
        edge.ruleIds.push(ruleId);
        edge.ruleLabels.push(ruleLabel);
      }
    });

    // Note: BioNetGen contact maps show ALL binding edges present in the model or rules
    // They do NOT show unbinding, state changes, or molecule conversions separately,
    // just the static map of possible component interactions.
  });

  // Create compound nodes for molecules and component child nodes (BNG-style hierarchy)
  const nodes: any[] = [];
  // Add compartments if present (detect by looking for @compartment on molecules in rules)
  const compartmentSet = new Set<string>();
  // Map a molecule type to a compartment if seen
  const moleculeCompartment = new Map<string, string>();

  // scan rules again to collect molecule compartments
  rules.forEach((rule) => {
    const graphs = parseSpeciesGraphs([...rule.reactants, ...rule.products] as string[]);
    graphs.forEach((g) => {
      g.molecules.forEach((m) => {
        if (m.compartment) {
          compartmentSet.add(m.compartment);
          if (!moleculeCompartment.has(m.name)) moleculeCompartment.set(m.name, m.compartment);
        }
      });
    });
  });

  // Emit compartment parent nodes first so cytoscape layout keeps them at root
  compartmentSet.forEach((compName) => {
    nodes.push({ id: `compartment_${compName}`, label: compName, type: 'compartment', isGroup: true });
  });

  // Sort molecules for consistent ordering and numeric IDs (BNG-style)
  const sortedMolNames = Array.from(moleculeMap.keys())
    .sort();

  sortedMolNames.forEach((molName, molIndex) => {
    const components = moleculeMap.get(molName)!;
    const molParent = moleculeCompartment.get(molName);
    const molParentId = molParent ? `compartment_${molParent}` : undefined;

    // Use numeric ID for molecule (BNG-style: 0, 1, 2, ...)
    const molId = molIndex.toString();

    // Check if molecule has components (is a group)
    const hasComponents = components.size > 0;

    nodes.push({
      id: molId,
      label: molName,
      type: 'molecule',
      parent: molParentId,
      isGroup: hasComponents
    });

    // Sort components for consistent ordering
    const sortedComps = Array.from(components).sort();

    sortedComps.forEach((compName, compIndex) => {
      const compKey = `${molName}_${compName}`;
      const compId = `${molIndex}.${compIndex}`;

      // Check if component has states (is a group)
      const hasStates = componentStateMap.has(compKey) && componentStateMap.get(compKey)!.size > 0;

      nodes.push({
        id: compId,
        label: compName,
        parent: molId,
        type: 'component',
        isGroup: hasStates
      });

      // Add state child nodes (BNG-style: each state is a separate child node)
      if (hasStates) {
        const states = Array.from(componentStateMap.get(compKey)!).sort();
        states.forEach((stateName, stateIndex) => {
          const stateId = `${molIndex}.${compIndex}.${stateIndex}`;
          nodes.push({
            id: stateId,
            label: stateName, // Use state value (U, P, etc.) to match BioNetGen yED format
            parent: compId,
            type: 'state'
          });
        });
      }
    });
  });

  // Build mapping from old-style IDs (mol_comp) to new numeric IDs
  const idMap = new Map<string, string>();
  sortedMolNames.forEach((molName, molIndex) => {
    const components = moleculeMap.get(molName)!;
    const sortedComps = Array.from(components).sort();
    sortedComps.forEach((compName, compIndex) => {
      const oldId = `${molName}_${compName}`;
      const newId = `${molIndex}.${compIndex}`;
      idMap.set(oldId, newId);
    });
    // Also map molecule names to their numeric IDs
    idMap.set(molName, molIndex.toString());
  });

  // Remap edge source/target to use numeric IDs and filter out invalid edges
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const remappedEdges = Array.from(edgeMap.values())
    .map(edge => ({
      ...edge,
      from: idMap.get(edge.from) ?? edge.from,
      to: idMap.get(edge.to) ?? edge.to,
    }))
    // Filter out edges that reference non-existent nodes (e.g., Trash, 0)
    .filter(edge => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to));

  // Deduplicate edges: ensure at most one edge between any pair of nodes
  const seenEdgePairs = new Set<string>();
  const deduplicatedEdges = remappedEdges.filter(edge => {
    // Create a canonical key for the edge pair (order-independent)
    const key = [edge.from, edge.to].sort().join('--');
    if (seenEdgePairs.has(key)) {
      return false;
    }
    seenEdgePairs.add(key);
    return true;
  });

  return {
    nodes,
    edges: deduplicatedEdges,
  };
};
