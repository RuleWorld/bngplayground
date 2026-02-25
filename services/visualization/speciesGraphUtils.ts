import { BNGLParser, type SpeciesGraph } from '@bngplayground/engine';
import type {
  VisualizationComponent,
  VisualizationMolecule,
} from '../../types/visualization';
import { colorFromName, foregroundForBackground } from './colorUtils';

export interface BondInfo {
  key: string;
  mol1: string;
  mol2: string;
  comp1: string;
  comp2: string;
  label?: string;
}

export interface StateSnapshot {
  molecule: string;
  component: string;
  state?: string;
}

export const parseSpeciesGraphs = (patterns: string[]): SpeciesGraph[] => {
  // Handle patterns that may contain multiple top-level comma-separated
  // species (e.g., "A(), B()") by splitting on commas that are not
  // inside parentheses. This is defensive: some callers or upstream
  // representations sometimes provide combined strings; parsing them
  // directly will create invalid molecule names like "A(), B()".
  const splitByTopLevelCommas = (s: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        const t = current.trim();
        if (t) parts.push(t);
        current = '';
        continue;
      }
      current += ch;
    }
    const t = current.trim();
    if (t) parts.push(t);
    return parts;
  };

  const graphs: SpeciesGraph[] = [];
  for (const pattern of patterns) {
    const pieces = splitByTopLevelCommas(String(pattern));
    for (const piece of pieces) {
      graphs.push(BNGLParser.parseSpeciesGraph(piece, true));
    }
  }
  return graphs;
};

export const buildVisualizationMolecule = (
  graph: SpeciesGraph,
  molIdx: number,
): VisualizationMolecule => {
  const molecule = graph.molecules[molIdx];

  const components: VisualizationComponent[] = molecule.components.map((component, compIdx) => {
    const visualComponent: VisualizationComponent = {
      name: component.name,
    };

    if (component.state) {
      visualComponent.state = component.state;
    }

    // translate BNGL wildcard bond hints into a UI-friendly bond requirement
    if (component.wildcard) {
      switch (component.wildcard) {
        case '+':
          visualComponent.bondRequirement = 'bound';
          break;
        case '?':
          visualComponent.bondRequirement = 'either';
          break;
        case '-':
          visualComponent.bondRequirement = 'free';
          break;
        default:
          visualComponent.bondRequirement = null;
      }
    } else {
      visualComponent.bondRequirement = null;
    }

    const bonds = Array.from(component.edges.entries());
    if (bonds.length > 0) {
      const partnerKeys = graph.adjacency.get(`${molIdx}.${compIdx}`);
      if (partnerKeys && partnerKeys.length > 0) {
        const partnerKey = partnerKeys[0]; // Use first partner for visualization
        const [partnerMolIdxStr, partnerCompIdxStr] = partnerKey.split('.');
        const partnerMolIdx = Number.parseInt(partnerMolIdxStr, 10);
        const partnerCompIdx = Number.parseInt(partnerCompIdxStr, 10);
        const partnerMolecule = graph.molecules[partnerMolIdx];
        const partnerComponent = partnerMolecule?.components[partnerCompIdx];
        if (partnerMolecule && partnerComponent) {
          const match = bonds.find(([, targetCompIdx]) => targetCompIdx === partnerCompIdx);
          const bondLabel = match ? match[0] : bonds[0]?.[0];
          if (bondLabel !== undefined) {
            visualComponent.bondLabel = `!${bondLabel}`;
            visualComponent.bondPartner = `${partnerMolecule.name}:${partnerComponent.name}`;
          }
        }
      }
    }

    return visualComponent;
  });

  // set a molecule color and derive text color for good contrast
  const color = colorFromName(molecule.name);
  const fg = foregroundForBackground(color);

  return {
    name: molecule.name,
    components,
    color,
    // expose a human readable text color so svg/cytoscape can pick readable labels
    textColor: fg,
  } as VisualizationMolecule & { textColor?: string };
};

export const convertSpeciesGraph = (graph: SpeciesGraph): VisualizationMolecule[] => {
  return graph.molecules.map((_, molIdx) => buildVisualizationMolecule(graph, molIdx));
};

export const extractBonds = (graphs: SpeciesGraph[]): Map<string, BondInfo> => {
  const bonds = new Map<string, BondInfo>();

  const sanitize = (name: string) => name.split('.')[0];

  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule, molIdx) => {
      const molName = sanitize(molecule.name);
      molecule.components.forEach((component, compIdx) => {
        const partnerKeys = graph.adjacency.get(`${molIdx}.${compIdx}`);
        if (!partnerKeys || partnerKeys.length === 0) {
          return;
        }

        for (const partnerKey of partnerKeys) {
          const [partnerMolIdxStr, partnerCompIdxStr] = partnerKey.split('.');
          const partnerMolIdx = Number.parseInt(partnerMolIdxStr, 10);
          const partnerCompIdx = Number.parseInt(partnerCompIdxStr, 10);

          if (
            Number.isNaN(partnerMolIdx) ||
            Number.isNaN(partnerCompIdx) ||
            (partnerMolIdx === molIdx && partnerCompIdx === compIdx)
          ) {
            continue;
          }

          if (partnerMolIdx < molIdx || (partnerMolIdx === molIdx && partnerCompIdx < compIdx)) {
            continue;
          }

          const partnerMolecule = graph.molecules[partnerMolIdx];
          const partnerComponent = partnerMolecule?.components[partnerCompIdx];
          if (!partnerMolecule || !partnerComponent) {
            continue;
          }

          const partnerName = sanitize(partnerMolecule.name);

          const endpoints = [
            `${molName}:${component.name}`,
            `${partnerName}:${partnerComponent.name}`,
          ].sort();
          const key = endpoints.join('|');

          let bondLabel: string | undefined;
          component.edges.forEach((targetCompIdx, edgeLabel) => {
            if (targetCompIdx === partnerCompIdx) {
              bondLabel = `!${edgeLabel}`;
            }
          });

          bonds.set(key, {
            key,
            mol1: molName,
            mol2: partnerName,
            comp1: component.name,
            comp2: partnerComponent.name,
            label: bondLabel,
          });
        }
      });
    });
  });

  return bonds;
};

export const snapshotComponentStates = (graphs: SpeciesGraph[]): Map<string, StateSnapshot> => {
  const states = new Map<string, StateSnapshot>();

  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule) => {
      molecule.components.forEach((component) => {
        const key = `${molecule.name}:${component.name}`;
        if (!states.has(key)) {
          states.set(key, {
            molecule: molecule.name,
            component: component.name,
            state: component.state,
          });
        }
      });
    });
  });

  return states;
};

/**
 * Indexed snapshot that includes molecule and component indices for proper positional comparison.
 * This is needed for state change detection where the same molecule type appears on both sides.
 */
export interface IndexedStateSnapshot {
  molecule: string;
  component: string;
  state?: string;
  molIdx: number;
  compIdx: number;
}

/**
 * Snapshot component states with positional indices for proper reactant/product comparison.
 * Unlike snapshotComponentStates, this preserves all instances rather than deduplicating by type.
 */
export const snapshotComponentStatesIndexed = (graphs: SpeciesGraph[]): IndexedStateSnapshot[] => {
  const states: IndexedStateSnapshot[] = [];
  let globalMolIdx = 0;

  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule) => {
      molecule.components.forEach((component, compIdx) => {
        states.push({
          molecule: molecule.name,
          component: component.name,
          state: component.state,
          molIdx: globalMolIdx,
          compIdx,
        });
      });
      globalMolIdx++;
    });
  });

  return states;
};

/**
 * Detect state changes between reactant and product patterns by matching molecules positionally.
 * Returns an array of state changes with from/to states.
 */
export interface DetectedStateChange {
  molecule: string;
  component: string;
  fromState: string;
  toState: string;
}

export const detectStateChanges = (
  reactantGraphs: SpeciesGraph[],
  productGraphs: SpeciesGraph[]
): DetectedStateChange[] => {
  const changes: DetectedStateChange[] = [];

  // Build maps indexed by molecule position within each pattern
  // For rules like EGFR(Y2~u) -> EGFR(Y2~p), we match molecules by their order
  const reactantMolecules: Array<{ name: string; components: Map<string, string | undefined> }> = [];
  const productMolecules: Array<{ name: string; components: Map<string, string | undefined> }> = [];

  reactantGraphs.forEach((graph) => {
    graph.molecules.forEach((mol) => {
      const compMap = new Map<string, string | undefined>();
      mol.components.forEach((comp) => {
        compMap.set(comp.name, comp.state);
      });
      reactantMolecules.push({ name: mol.name, components: compMap });
    });
  });

  productGraphs.forEach((graph) => {
    graph.molecules.forEach((mol) => {
      const compMap = new Map<string, string | undefined>();
      mol.components.forEach((comp) => {
        compMap.set(comp.name, comp.state);
      });
      productMolecules.push({ name: mol.name, components: compMap });
    });
  });

  // Match molecules by name and position
  const usedProductIdx = new Set<number>();

  reactantMolecules.forEach((reactantMol) => {
    // Find matching product molecule by name (first unused one)
    const productIdx = productMolecules.findIndex((prodMol, idx) => {
      return !usedProductIdx.has(idx) && prodMol.name === reactantMol.name;
    });

    if (productIdx === -1) return; // Molecule was deleted

    usedProductIdx.add(productIdx);
    const productMol = productMolecules[productIdx];

    // Compare components between matched molecules
    reactantMol.components.forEach((reactantState, compName) => {
      const productState = productMol.components.get(compName);

      const fromState = reactantState ?? 'unspecified';
      const toState = productState ?? 'unspecified';

      if (fromState !== toState) {
        changes.push({
          molecule: reactantMol.name,
          component: compName,
          fromState,
          toState,
        });
      }
    });
  });

  return changes;
};

export const extractAtoms = (graphs: SpeciesGraph[]): Set<string> => {
  const atoms = new Set<string>();

  // 1. State atoms: Mol.comp~state
  const states = snapshotComponentStates(graphs);
  states.forEach((snapshot) => {
    if (snapshot.state) {
      atoms.add(`${snapshot.molecule}.${snapshot.component}~${snapshot.state}`);
    }
  });

  // 2. Bond atoms: bond:Mol1:comp1|Mol2:comp2 (from extractBonds)
  const bonds = extractBonds(graphs);
  bonds.forEach((bond) => {
    atoms.add(`bond:${bond.key}`);
  });

  // 3. Free component atoms: Mol.comp  (components that have no state and no bond)
  //    Without this, rules that only bind/unbind components (no state changes)
  //    show no reactant/product atom nodes at all.
  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule, molIdx) => {
      molecule.components.forEach((component, compIdx) => {
        const partnerKeys = graph.adjacency.get(`${molIdx}.${compIdx}`);
        const isBonded = partnerKeys && partnerKeys.length > 0;
        if (!isBonded && !component.state) {
          atoms.add(`${molecule.name}.${component.name}`);
        }
      });
    });
  });

  // 4. Molecule atoms: Mol (for molecules that have no components, like H0)
  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule) => {
      if (molecule.components.length === 0) {
        atoms.add(molecule.name);
      }
    });
  });

  return atoms;
};
