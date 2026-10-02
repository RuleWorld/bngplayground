// graph/core/RxnRule.ts
import { SpeciesGraph } from './SpeciesGraph.ts';
import { Molecule } from './Molecule.ts';
import { computeRuleOperations, reactionCenterFromOperations } from './RxnRuleOps.ts';

/** Merged-graph molecule index of an `iPatt.iMol[.iComp]` pointer. */
const mergedMoleculeIndex = (ptr: string): number => Number(ptr.slice(ptr.indexOf('.') + 1).split('.')[0]);

/** Component index of an `iPatt.iMol.iComp` pointer; -1 for molecule pointers. */
const mergedComponentIndex = (ptr: string): number => {
  const rest = ptr.slice(ptr.indexOf('.') + 1);
  const dot = rest.indexOf('.');
  return dot === -1 ? -1 : Number(rest.slice(dot + 1));
};

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
  excludeProducts: Array<{ productIndex: number; pattern: SpeciesGraph }>;
  includeProducts: Array<{ productIndex: number; pattern: SpeciesGraph }>;
  isMoveConnected: boolean;
  isMatchOnce: boolean;

  // Mapping from Product Molecule Global Index to Reactant Molecule Global Index
  molecularMap: Map<number, number>;

  // For reverse bimolecular rules: max allowed molecules in reactant species
  // Prevents reverse rules from matching complexes larger than forward can produce
  maxReactantMoleculeCount?: number;

  /**
   * Reactant patterns whose whole species is deleted by this rule
   * (BioNetGen `MolDel` entries that are a bare pattern index).
   */
  deletedSpeciesPatterns: number[];

  /** Reactant patterns whose species-level compartment the rule changes. */
  transportedSpeciesPatterns: number[];

  /**
   * Reaction centre, one entry per reactant pattern, of node pointers in
   * `iPatt.iMol.iComp` notation (a bare `iPatt` for species-level entries).
   * `undefined` until `computeReactionCenter()` has run.
   */
  reactionCenter?: string[][];

  constructor(
    name: string,
    reactants: SpeciesGraph[],
    products: SpeciesGraph[],
    rateConstant: number,
    options: { allowsIntramolecular?: boolean; rateExpression?: string; isMoveConnected?: boolean; isMatchOnce?: boolean; totalRate?: boolean } = {}
  ) {
    this.name = name;
    this.reactants = reactants;
    this.products = products;
    this.rateConstant = rateConstant;
    // Default to true to match native BNG behavior (allows intramolecular binding)
    this.allowsIntramolecular = options.allowsIntramolecular ?? true;
    this.rateExpression = options.rateExpression;
    this.isMoveConnected = options.isMoveConnected ?? false;
    this.isMatchOnce = options.isMatchOnce ?? false;
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
    this.excludeProducts = [];
    this.includeProducts = [];
    this.isDeleteMolecules = false;
    this.molecularMap = new Map();
    this.deletedSpeciesPatterns = [];
    this.transportedSpeciesPatterns = [];
  }

  private _isDeleteMolecules = false;

  /**
   * The `DeleteMolecules` rule modifier. BioNetGen's `RxnRule::findMap`
   * (RxnRule.pm:2103) branches on this keyword to decide whether a fully
   * consumed reactant pattern is recorded as per-molecule deletions or as a
   * whole-species deletion, so the derived op arrays and the reaction centre
   * depend on it. The parser assigns the flag after the rule object exists
   * (NetworkExpansion.ts, immediately after `parseRxnRule` has already run
   * `computeOperations`), so flip it through an accessor that recomputes
   * rather than serving ops derived from the wrong branch.
   */
  get isDeleteMolecules(): boolean {
    return this._isDeleteMolecules;
  }

  set isDeleteMolecules(value: boolean) {
    if (this._isDeleteMolecules === value) return;
    this._isDeleteMolecules = value;
    if (this.reactionCenter !== undefined) {
      this.reactionCenter = undefined;
      this.computeOperations();
    }
  }

  /**
   * Populate the transformation op arrays and the reaction centre from the
   * rule's own reactant/product patterns — a transcription of BioNetGen
   * `RxnRule::findMap` followed by `RxnRule::find_reaction_center`.
   *
   * Molecule indices in `deleteBonds`, `changeStates`, `deleteMolecules` and
   * `changeCompartments` are merged-reactant-graph indices (the reactant
   * patterns concatenated in order); `addBonds` uses merged-product-graph
   * indices, as in BioNetGen, which only ever maps it back to reactant space.
   */
  computeOperations(): void {
    if (this.reactionCenter !== undefined) return;
    const ops = computeRuleOperations(this);
    // `addBonds` endpoints are merged-product "im.ic" pointers; the others are
    // rule pointers "iPatt.iMol[.iComp]".
    const toMergedBond = ([a, b]: [string, string]): [number, number, number, number] => {
      const aDot = a.indexOf('.');
      const bDot = b.indexOf('.');
      return [
        Number(a.slice(0, aDot)), Number(a.slice(aDot + 1)),
        Number(b.slice(0, bDot)), Number(b.slice(bDot + 1)),
      ];
    };
    const toBond = ([a, b]: [string, string]): [number, number, number, number] =>
      [mergedMoleculeIndex(a), mergedComponentIndex(a), mergedMoleculeIndex(b), mergedComponentIndex(b)];
    this.addBonds = ops.edgeAddMerged.map(toMergedBond);
    this.deleteBonds = ops.edgeDel.map(toBond);
    this.changeStates = ops.compStateChange.map(
      ([p, , next]) => [mergedMoleculeIndex(p), mergedComponentIndex(p), next ?? ''] as [number, number, string]
    );
    this.deleteMolecules = ops.molDel.map(mergedMoleculeIndex);
    this.changeCompartments = ops.changeCompartment.map(
      ([p, dest]) => [mergedMoleculeIndex(p), dest] as [number, string]
    );
    this.deletedSpeciesPatterns = ops.speciesDel;
    this.transportedSpeciesPatterns = ops.speciesCompartmentChange;
    this.molecularMap = new Map();
    for (let imP = 0; imP < ops.productMoleculeSource.length; imP++) {
      const imR = ops.productMoleculeSource[imP];
      if (imR >= 0) this.molecularMap.set(imP, imR);
    }
    this.reactionCenter = reactionCenterFromOperations(this, ops);
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
      const trimmed = constraint.trim();
      const openIdx = trimmed.indexOf('(');
      const closeIdx = trimmed.lastIndexOf(')');
      if (openIdx <= 0 || closeIdx <= openIdx) {
        console.warn(`Unknown or malformed constraint: ${constraint}`);
        continue;
      }

      const type = trimmed.slice(0, openIdx).trim();
      if (!['exclude_reactants', 'include_reactants', 'exclude_products', 'include_products'].includes(type)) {
        console.warn(`Unknown or malformed constraint: ${constraint}`);
        continue;
      }

      const argBody = trimmed.slice(openIdx + 1, closeIdx).trim();
      const commaIdx = argBody.indexOf(',');
      if (commaIdx <= 0) {
        console.warn(`Unknown or malformed constraint: ${constraint}`);
        continue;
      }

      const index = parseInt(argBody.slice(0, commaIdx).trim(), 10);
      const patternStr = argBody.slice(commaIdx + 1).trim();
      if (!Number.isFinite(index) || !patternStr) {
        console.warn('Unknown or malformed constraint:', constraint);
        continue;
      }

      try {
        const pattern = parser(patternStr);

        // BNGL uses 1-based indexing, convert to 0-based
        const mappedIndex = index - 1;

        if (type === 'exclude_reactants') {
          this.excludeReactants.push({ reactantIndex: mappedIndex, pattern });
        } else if (type === 'include_reactants') {
          this.includeReactants.push({ reactantIndex: mappedIndex, pattern });
        } else if (type === 'exclude_products') {
          this.excludeProducts.push({ productIndex: mappedIndex, pattern });
        } else if (type === 'include_products') {
          this.includeProducts.push({ productIndex: mappedIndex, pattern });
        }
      } catch (e) {
        console.warn('Failed to parse pattern in constraint:', String(constraint), e);
      }
    }
  }
}
