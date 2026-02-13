// graph/core/RxnRule.ts
import { SpeciesGraph } from './SpeciesGraph.ts';
import { Molecule } from './Molecule.ts';

export class RxnRule {
  name: string;
  reactants: SpeciesGraph[];
  products: SpeciesGraph[];
  rateConstant: number;
  rateExpression?: string;
  allowsIntramolecular: boolean;
  totalRate: boolean;
  isArrhenius: boolean;
  arrheniusPhi?: string;
  arrheniusEact?: string;
  arrheniusA?: string;

  // Transformation operations
  deleteBonds: Array<[number, number, number, number]>; // [mol1, comp1, mol2, comp2]
  addBonds: Array<[number, number, number, number]>;
  changeStates: Array<[number, number, string]>; // [mol, comp, newState]
  deleteMolecules: number[]; // reactant molecule indices to delete
  addMolecules: Array<[number, Molecule]>; // [productMolIdx, molecule] to add
  changeCompartments: Array<[number, string]>; // [reactantMolIdx, newCompartment]
  excludeReactants: Array<{ reactantIndex: number; pattern: SpeciesGraph }>;
  includeReactants: Array<{ reactantIndex: number; pattern: SpeciesGraph }>;
  isDeleteMolecules: boolean;
  isMoveConnected: boolean;

  // Mapping from Product Molecule Global Index to Reactant Molecule Global Index
  molecularMap: Map<number, number>;

  // For reverse bimolecular rules: max allowed molecules in reactant species
  // Prevents reverse rules from matching complexes larger than forward can produce
  maxReactantMoleculeCount?: number;

  constructor(
    name: string,
    reactants: SpeciesGraph[],
    products: SpeciesGraph[],
    rateConstant: number,
    options: { allowsIntramolecular?: boolean; rateExpression?: string; isMoveConnected?: boolean; totalRate?: boolean } = {}
  ) {
    this.name = name;
    this.reactants = reactants;
    this.products = products;
    this.rateConstant = rateConstant;
    // Default to true to match native BNG behavior (allows intramolecular binding)
    this.allowsIntramolecular = options.allowsIntramolecular ?? true;
    this.rateExpression = options.rateExpression;
    this.isMoveConnected = options.isMoveConnected ?? false;
    this.totalRate = options.totalRate ?? false;
    this.isArrhenius = false;
    this.deleteBonds = [];
    this.addBonds = [];
    this.changeStates = [];
    this.deleteMolecules = [];
    this.addMolecules = [];
    this.changeCompartments = [];
    this.excludeReactants = [];
    this.includeReactants = [];
    this.isDeleteMolecules = false;
    this.molecularMap = new Map();
  }

  /**
   * BioNetGen: RxnRule::toString()
   */
  toString(): string {
    const reactantStr = this.reactants.map(r => r.toString()).join(' + ');
    const productStr = this.products.map(p => p.toString()).join(' + ');
    const rateStr = this.rateExpression || this.rateConstant;
    return `${reactantStr} -> ${productStr} ${rateStr}`;
  }

  /**
   * Returns true when this rule appears to transport molecules between compartments
   * (e.g., A@cyto -> A@nuc). This is a heuristic used to detect possible transport rules.
   */
  isTransportRule(): boolean {
    const reactantCompartments = new Map<string, Set<string>>();
    const productCompartments = new Map<string, Set<string>>();

    for (const r of this.reactants) {
      for (const mol of r.molecules) {
        if (!reactantCompartments.has(mol.name)) reactantCompartments.set(mol.name, new Set());
        reactantCompartments.get(mol.name)!.add(mol.compartment ?? 'default');
      }
    }
    for (const p of this.products) {
      for (const mol of p.molecules) {
        if (!productCompartments.has(mol.name)) productCompartments.set(mol.name, new Set());
        productCompartments.get(mol.name)!.add(mol.compartment ?? 'default');
      }
    }

    for (const [name, rComps] of reactantCompartments.entries()) {
      const pComps = productCompartments.get(name);
      if (!pComps) continue;
      // If reactant and product compartments are disjoint or different sets, consider transport
      const all = new Set([...rComps, ...pComps]);
      if (all.size > rComps.size || all.size > pComps.size) return true;
    }

    return false;
  }

  /**
   * Apply constraints to the rule
   * @param constraints List of constraint strings (e.g., "exclude_reactants(1, A(b~P))")
   * @param parser Callback to parse BNGL patterns into SpeciesGraph
   */
  applyConstraints(constraints: string[], parser: (str: string) => SpeciesGraph) {
    for (const constraint of constraints) {
      // Match constraint type, index, and pattern
      // Example: exclude_reactants(1, A(b~P))
      const match = constraint.match(/^(exclude_reactants|include_reactants)\s*\(\s*(\d+)\s*,\s*(.+)\s*\)$/);
      if (match) {
        const type = match[1];
        const index = parseInt(match[2], 10);
        const patternStr = match[3];

        try {
          const pattern = parser(patternStr);

          // BNGL uses 1-based indexing, convert to 0-based
          const reactantIndex = index - 1;

          if (type === 'exclude_reactants') {
            this.excludeReactants.push({ reactantIndex, pattern });
          } else if (type === 'include_reactants') {
            this.includeReactants.push({ reactantIndex, pattern });
          }
        } catch (e) {
          console.warn(`Failed to parse pattern in constraint: ${constraint}`, e);
        }
      } else {
        console.warn(`Unknown or malformed constraint: ${constraint}`);
      }
    }
  }
}