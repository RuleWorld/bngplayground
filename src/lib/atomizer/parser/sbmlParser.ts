/**
 * SBML Parser using libsbmljs
 * Complete TypeScript port of sbml2json.py with full SBML parsing capabilities
 */

import {
  SBMLModel,
  SBMLCompartment,
  SBMLSpecies,
  SBMLParameter,
  SBMLReaction,
  SBMLSpeciesReference,
  SBMLModifierSpeciesReference,
  SBMLKineticLaw,
  SBMLFunctionDefinition,
  SBMLRule,
  SBMLEvent,
  SBMLInitialAssignment,
  AnnotationInfo,
  BiologicalQualifier,
  ModelQualifier,
  SBMLImportWarning,
} from '../config/types';
import { standardizeName, logger, factorial, comb } from '../utils/helpers';
import { applyUnitScaling } from '../validation/units';
import { parseMultiPackage } from '../validation/multiPackage';
// import { pathToFileURL } from 'node:url';
// import { resolve } from 'node:path';

// Polyfill self for Node.js compatibility (libsbmljs uses it)
if (typeof self === 'undefined') {
  (global as any).self = global;
}

// =============================================================================
// LibSBML Type Declarations
// =============================================================================

// These types represent the libsbmljs WebAssembly API
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace LibSBML {
  interface SBMLReader {
    readSBMLFromString(sbmlString: string): SBMLDocument;
  }

  interface SBMLDocument {
    getNumErrors(): number;
    getNumErrorsWithSeverity(severity: number): number;
    getError(index: number): SBMLError;
    getModel(): Model | null;
    delete(): void;
  }

  interface SBMLError {
    getMessage(): string;
    getSeverity(): number;
    getErrorId(): number;
  }

  interface Model {
    getId(): string;
    getName(): string;
    getNumCompartments(): number;
    getCompartment(index: number): Compartment;
    getNumSpecies(): number;
    getSpecies(index: number): Species;
    getNumParameters(): number;
    getParameter(index: number): Parameter;
    getNumReactions(): number;
    getReaction(index: number): Reaction;
    getNumRules(): number;
    getRule(index: number): Rule;
    getNumFunctionDefinitions(): number;
    getFunctionDefinition(index: number): FunctionDefinition;
    getNumEvents(): number;
    getEvent(index: number): Event;
    getNumInitialAssignments(): number;
    getInitialAssignment(index: number): InitialAssignment;
    getNumUnitDefinitions(): number;
    getUnitDefinition(index: number): UnitDefinition;
    getListOfCompartments(): ListOf<Compartment>;
    getListOfSpecies(): ListOf<Species>;
    getListOfParameters(): ListOf<Parameter>;
    getListOfReactions(): ListOf<Reaction>;
    getListOfRules(): ListOf<Rule>;
    getListOfFunctionDefinitions(): ListOf<FunctionDefinition>;
    getListOfEvents(): ListOf<Event>;
    getListOfInitialAssignments(): ListOf<InitialAssignment>;
  }

  interface ListOf<T> {
    getNumItems(): number;
    get(index: number): T;
    [Symbol.iterator](): Iterator<T>;
  }

  interface Compartment {
    getId(): string;
    getName(): string;
    getSpatialDimensions(): number;
    getSize(): number;
    getUnits(): string;
    getConstant(): boolean;
    getOutside(): string;
  }

  interface Species {
    getId(): string;
    getName(): string;
    getCompartment(): string;
    getInitialConcentration(): number;
    getInitialAmount(): number;
    getSubstanceUnits(): string;
    getHasOnlySubstanceUnits(): boolean;
    getBoundaryCondition(): boolean;
    getConstant(): boolean;
    getAnnotation(): XMLNode | null;
    getNumCVTerms(): number;
    getCVTerm(index: number): CVTerm;
  }

  interface Parameter {
    getId(): string;
    getName(): string;
    getValue(): number;
    getUnits(): string;
    getConstant(): boolean;
  }

  interface Reaction {
    getId(): string;
    getName(): string;
    getReversible(): boolean;
    getFast(): boolean;
    getNumReactants(): number;
    getReactant(index: number): SpeciesReference;
    getNumProducts(): number;
    getProduct(index: number): SpeciesReference;
    getNumModifiers(): number;
    getModifier(index: number): ModifierSpeciesReference;
    getKineticLaw(): KineticLaw | null;
    getListOfReactants(): ListOf<SpeciesReference>;
    getListOfProducts(): ListOf<SpeciesReference>;
    getListOfModifiers(): ListOf<ModifierSpeciesReference>;
  }

  interface SpeciesReference {
    getSpecies(): string;
    getStoichiometry(): number;
    getConstant(): boolean;
  }

  interface ModifierSpeciesReference {
    getSpecies(): string;
  }

  interface KineticLaw {
    getFormula(): string;
    getMath(): ASTNode | null;
    getNumLocalParameters(): number;
    getLocalParameter(index: number): LocalParameter;
    getNumParameters(): number;
    getParameter(index: number): Parameter;
    getListOfLocalParameters(): ListOf<LocalParameter>;
    getListOfParameters(): ListOf<Parameter>;
  }

  interface LocalParameter {
    getId(): string;
    getName(): string;
    getValue(): number;
    getUnits(): string;
  }

  interface ASTNode {
    toInfix(): string;
    toMathML(): string;
    getType(): number;
    getNumChildren(): number;
    getChild(index: number): ASTNode;
    getCharacter(): string;
    getName(): string;
    getValue(): number;
    getLeftChild(): ASTNode;
    getRightChild(): ASTNode;
    deepCopy(): ASTNode;
    replaceChild(index: number, node: ASTNode): void;
  }

  interface Rule {
    isAlgebraic(): boolean;
    isAssignment(): boolean;
    isRate(): boolean;
    getVariable(): string;
    getFormula(): string;
    getMath(): ASTNode | null;
  }

  interface FunctionDefinition {
    getId(): string;
    getName(): string;
    getNumArguments(): number;
    getArgument(index: number): ASTNode;
    getBody(): ASTNode | null;
    getMath(): ASTNode | null;
  }

  interface Event {
    getId(): string;
    getName(): string;
    getTrigger(): Trigger | null;
    getDelay(): Delay | null;
    getUseValuesFromTriggerTime(): boolean;
    getNumEventAssignments(): number;
    getEventAssignment(index: number): EventAssignment;
    getListOfEventAssignments(): ListOf<EventAssignment>;
  }

  interface Trigger {
    getMath(): ASTNode | null;
  }

  interface Delay {
    getMath(): ASTNode | null;
  }

  interface EventAssignment {
    getVariable(): string;
    getMath(): ASTNode | null;
  }

  interface InitialAssignment {
    getSymbol(): string;
    getMath(): ASTNode | null;
  }

  interface UnitDefinition {
    getId(): string;
    getNumUnits(): number;
    getUnit(index: number): Unit;
  }

  interface Unit {
    getKind(): number;
    getScale(): number;
    getExponent(): number;
    getMultiplier(): number;
  }

  interface CVTerm {
    getQualifierType(): number;
    getBiologicalQualifierType(): number;
    getModelQualifierType(): number;
    getNumResources(): number;
    getResourceURI(index: number): string;
  }

  interface XMLNode {
    toXMLString(): string;
  }

  function formulaToString(math: ASTNode): string;
  function readSBMLFromString(str: string): SBMLDocument;
}

// Global libsbml module reference and initialization promise
let libsbml: any = null;
let initPromise: Promise<void> | null = null;

export const getLibSBMLInstance = (): any | null => libsbml;
export const setLibSBMLInstanceForTest = (instance: any) => { libsbml = instance; };

const isAbortLikeError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /abort\(|libsbmljs aborted|runtimeerror|unreachable/i.test(msg);
};

const SBML_PARSER_DEBUG =
  typeof process !== 'undefined' &&
  !!process.env &&
  process.env.SBML_PARSER_DEBUG === '1';

const debugSbml = (...args: unknown[]): void => {
  if (!SBML_PARSER_DEBUG) return;
  logger.debug(
    'SBM000',
    args
      .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')
  );
};

type SimpleXmlNode = {
  name: string;
  children: SimpleXmlNode[];
  text: string;
  attributes?: string;
};

// =============================================================================
// SBML Parser Class
// =============================================================================

/**
 * SBML2JSON - Parser for extracting model data from SBML
 * Complete port of Python SBML2JSON class
 */
export class SBML2JSON {
  private model: any;
  private unitDictionary: Map<string, Array<[number, number, number]>>;
  private moleculeData: Map<string, number[]>;

  constructor(model: any) {
    this.model = model;
    this.unitDictionary = new Map();
    this.moleculeData = new Map();
    this.getUnits();
  }

  /**
   * Extract unit definitions from the model
   */
  getUnits(): void {
    for (let i = 0; i < this.model.getNumUnitDefinitions(); i++) {
      const unitDefinition = this.model.getUnitDefinition(i);
      const unitList: Array<[number, number, number]> = [];

      for (let j = 0; j < unitDefinition.getNumUnits(); j++) {
        const unit = unitDefinition.getUnit(j);
        unitList.push([unit.getKind(), unit.getScale(), unit.getExponent()]);
      }

      this.unitDictionary.set(unitDefinition.getId(), unitList);
    }
  }

  /**
   * Extract parameters from the model
   */
  getParameters(): Map<number, any> {
    const parameters = new Map<number, any>();

    // Add standard parameters (Nav removed to avoid triple-scaling)
    let idx = 1;
    for (let i = 0; i < this.model.getNumParameters(); i++) {
      const parameter = this.model.getParameter(i);
      const parameterSpecs: any = {
        name: parameter.getId(),
        value: parameter.getValue(),
        unit: parameter.getUnits(),
        type: ''
      };

      // Apply unit conversions
      if (this.unitDictionary.has(parameter.getUnits())) {
        const factors = this.unitDictionary.get(parameter.getUnits())!;
        for (const factor of factors) {
          parameterSpecs.value *= Math.pow(10, factor[1] * factor[2]);
          parameterSpecs.unit = `${parameterSpecs.unit}*1e${factor[1] * factor[2]}`;
          // Naive Avogadro scaling removed here. 
          // Proper scaling is now handled unified in the BNGL writer using (Na * V)
          // to convert from concentration math to propensity math.
        }
      }

      parameters.set(idx++, parameterSpecs);
    }

    // Add additional standard parameters
    parameters.set(idx++, { name: 'rxn_layer_t', value: '0.01', unit: 'um', type: '' });
    parameters.set(idx++, { name: 'h', value: 'rxn_layer_t', unit: 'um', type: '' });
    parameters.set(idx++, { name: 'Rs', value: '0.002564', unit: 'um', type: '' });
    parameters.set(idx, { name: 'Rc', value: '0.0015', unit: 'um', type: '' });

    return parameters;
  }

  /**
   * Extract raw compartment information
   */
  private getRawCompartments(): Map<string, [number, number, string]> {
    const compartmentList = new Map<string, [number, number, string]>();

    for (let i = 0; i < this.model.getNumCompartments(); i++) {
      const compartment = this.model.getCompartment(i);
      const name = compartment.getId();
      const size = compartment.getSize() || 1;
      const outside = compartment.getOutside() || '';
      const dimensions = compartment.getSpatialDimensions() || 3;

      compartmentList.set(name, [dimensions, size, outside]);
    }

    return compartmentList;
  }

  /**
   * Get outside/inside compartments
   */
  getOutsideInsideCompartment(
    compartmentList: Map<string, [number, number, string]>,
    compartment: string
  ): [string, string] {
    const compData = compartmentList.get(compartment);
    const outside = compData ? compData[2] : '';

    for (const [comp, data] of compartmentList) {
      if (data[2] === compartment) {
        return [outside, comp];
      }
    }

    return [outside, ''];
  }

  /**
   * Extract species (molecules) from the model
   */
  getMolecules(): { molecules: Map<number, any>; release: Map<number, any> } {
    const compartmentList = this.getRawCompartments();
    const molecules = new Map<number, any>();
    const release = new Map<number, any>();

    for (let i = 0; i < this.model.getNumSpecies(); i++) {
      const species = this.model.getSpecies(i);
      const compartment = species.getCompartment();
      const compData = compartmentList.get(compartment);

      let typeD = '3D';
      let diffusion = '';

      if (compData) {
        if (compData[0] === 3) {
          typeD = '3D';
          diffusion = `KB*T/(6*PI*mu_${compartment}*Rs)`;
        } else {
          typeD = '2D';
          const [outside, inside] = this.getOutsideInsideCompartment(compartmentList, compartment);
          diffusion = `KB*T*LOG((mu_${compartment}*h/(SQRT(4)*Rc*(mu_${outside}+mu_${inside})/2))-gamma)/(4*PI*mu_${compartment}*h)`;
        }

        this.moleculeData.set(species.getId(), [compData[0]]);
      }

      const moleculeSpecs = {
        name: species.getId(),
        type: typeD,
        extendedName: species.getName(),
        dif: diffusion
      };

      let initialConcentration = species.getInitialConcentration();
      let initialAmount = species.getInitialAmount();


      // Apply unit conversions (scaling factors like 1e-3 for milli, etc.)
      const substanceUnits = species.getSubstanceUnits();
      if (this.unitDictionary.has(substanceUnits)) {
        const factors = this.unitDictionary.get(substanceUnits)!;
        for (const factor of factors) {
          const multiplier = Math.pow(10, factor[1] * factor[2]);
          initialConcentration *= multiplier;
          initialAmount *= multiplier;
          // Note: Avogadro scaling is NOT done here anymore.
          // It's handled in getSeedSpecies inside core.ts usingexpressions.
        }
      }

      if ((initialConcentration !== 0 || initialAmount !== 0) && compData) {
        let objectExpr: string;
        if (compData[0] === 2) {
          const [, inside] = this.getOutsideInsideCompartment(compartmentList, compartment);
          objectExpr = `${inside.toUpperCase()}[${compartment.toUpperCase()}]`;
        } else {
          objectExpr = compartment;
        }

        release.set(i + 1, {
          name: `Release_Site_s${i + 1}`,
          molecule: species.getId(),
          shape: 'OBJECT',
          quantity_type: 'NUMBER_TO_RELEASE',
          quantity_expr: initialConcentration,
          object_expr: objectExpr
        });
      }

      molecules.set(i + 1, moleculeSpecs);
    }

    return { molecules, release };
  }

  /**
   * Prune mass action factors from rate expression
   */
  getPrunnedTree(math: any, remainderPatterns: string[]): any {
    if (!math) return math;

    while (
      (math.getCharacter() === '*' || math.getCharacter() === '/') &&
      remainderPatterns.length > 0
    ) {
      const leftFormula = libsbml.formulaToString(math.getLeftChild());
      const rightFormula = libsbml.formulaToString(math.getRightChild());

      // ⚡ Bolt: Replaced double traversal (includes + indexOf) with single indexOf call
      const leftIdx = remainderPatterns.indexOf(leftFormula);
      if (leftIdx !== -1) {
        remainderPatterns.splice(leftIdx, 1);
        math = math.getRightChild();
      } else {
        const rightIdx = remainderPatterns.indexOf(rightFormula);
        if (rightIdx !== -1) {
          remainderPatterns.splice(rightIdx, 1);
          math = math.getLeftChild();
        } else {
          if (math.getLeftChild()?.getCharacter() === '*') {
            math.replaceChild(0, this.getPrunnedTree(math.getLeftChild(), remainderPatterns));
          }
          if (math.getRightChild()?.getCharacter() === '*') {
            math.replaceChild(
              math.getNumChildren() - 1,
              this.getPrunnedTree(math.getRightChild(), remainderPatterns)
            );
          }
          break;
        }
      }
    }

    return math;
  }

  /**
   * Get instance rate for a reaction
   */
  getInstanceRate(
    math: any,
    compartmentList: string[],
    reversible: boolean,
    rReactant: [string, number][],
    rProduct: [string, number][]
  ): [string, string] {
    // Remove compartments from expression
    math = this.getPrunnedTree(math, [...compartmentList]);

    if (reversible) {
      if (math.getCharacter() === '-' && math.getNumChildren() > 1) {
        const [rateL] = this.removeFactorFromMath(math.getLeftChild().deepCopy(), rReactant, rProduct);
        const [rateR] = this.removeFactorFromMath(math.getRightChild().deepCopy(), rProduct, rReactant);
        return [rateL, rateR];
      } else {
        const [rateL] = this.removeFactorFromMath(math, rReactant, rProduct);
        const rateLIf = `if(${rateL} >= 0, ${rateL}, 0)`;
        const [rateR] = this.removeFactorFromMath(math, rReactant, rProduct);
        const rateRIf = `if(${rateR} < 0, -(${rateR}), 0)`;
        return [rateLIf, rateRIf];
      }
    } else {
      const [rateL] = this.removeFactorFromMath(math.deepCopy(), rReactant, rProduct);
      return [rateL, '0'];
    }
  }

  /**
   * Remove mass action factors from math expression
   */
  removeFactorFromMath(
    math: any,
    reactants: [string, number][],
    products: [string, number][]
  ): [string, number] {
    const remainderPatterns: string[] = [];
    let highStoichoimetryFactor = 1;

    for (const [species, stoich] of reactants) {
      highStoichoimetryFactor *= factorial(stoich);
      const productStoich = products.find(p => p[0] === species)?.[1] || 0;

      if (stoich > productStoich) {
        highStoichoimetryFactor /= comb(Math.floor(stoich), Math.floor(productStoich));
      }

      for (let i = 0; i < Math.floor(stoich); i++) {
        remainderPatterns.push(species);
      }
    }

    math = this.getPrunnedTree(math, remainderPatterns);
    let rateR = libsbml.formulaToString(math);

    for (const element of remainderPatterns) {
      rateR = `if(${element} > 0, (${rateR})/${element}, 0)`;
    }

    if (highStoichoimetryFactor !== 1) {
      rateR = `${rateR}*${Math.floor(highStoichoimetryFactor)}`;
    }

    return [rateR, math.getNumChildren()];
  }

  /**
   * Adjust parameters based on stoichiometry
   */
  adjustParameters(
    stoichiometry: number,
    rate: string,
    parameters: Map<number, any>
  ): void {
    for (const [_key, param] of parameters) {
      if (rate.includes(param.name) && param.unit === '') {
        if (stoichiometry === 2) {
          param.unit = 'Bimolecular';
        } else if (stoichiometry === 0) {
          param.unit = '0-order';
        } else if (stoichiometry === 1) {
          param.unit = 'Unimolecular';
        }
      }
    }
  }

  /**
   * Extract reactions from the model
   */
  getReactions(sparameters: Map<number, any>): Map<number, any> {
    const reactionSpecs = new Map<number, any>();
    let idx = 1;

    for (let i = 0; i < this.model.getNumReactions(); i++) {
      const reaction = this.model.getReaction(i);

      // Get reactants
      const reactants: [string, number][] = [];
      for (let j = 0; j < reaction.getNumReactants(); j++) {
        const ref = reaction.getReactant(j);
        if (ref.getSpecies() !== 'EmptySet') {
          reactants.push([ref.getSpecies(), ref.getStoichiometry() || 1]);
        }
      }

      // Get products
      const products: [string, number][] = [];
      for (let j = 0; j < reaction.getNumProducts(); j++) {
        const ref = reaction.getProduct(j);
        if (ref.getSpecies() !== 'EmptySet') {
          products.push([ref.getSpecies(), ref.getStoichiometry() || 1]);
        }
      }

      // Get kinetic law
      const kineticLaw = reaction.getKineticLaw();
      if (!kineticLaw) continue;

      const math = kineticLaw.getMath();
      if (!math) continue;

      const reversible = reaction.getReversible();

      // Get compartment list
      const compartmentList: string[] = [];
      for (let j = 0; j < this.model.getNumCompartments(); j++) {
        compartmentList.push(this.model.getCompartment(j).getId());
      }

      const [rateL, rateR] = this.getInstanceRate(
        math,
        compartmentList,
        reversible,
        reactants,
        products
      );

      // Build reaction specs
      const rcList = reactants.map(([species]) => {
        const hasMultipleDimensions = new Set(
          reactants.map(([s]) => this.moleculeData.get(s)?.[0])
        ).size > 1;
        const is3D = this.moleculeData.get(species)?.[0] === 3;
        const orientation = hasMultipleDimensions && is3D ? ',' : "'";
        return `${species}${orientation}`;
      });

      const prdList = products.map(([species]) => {
        const hasMultipleDimensions = new Set(
          reactants.map(([s]) => this.moleculeData.get(s)?.[0])
        ).size > 1;
        const is3D = this.moleculeData.get(species)?.[0] === 3;
        const orientation = hasMultipleDimensions && is3D ? ',' : "'";
        return `${species}${orientation}`;
      });

      if (rateL !== '0') {
        reactionSpecs.set(idx++, {
          reactants: rcList.join(' + '),
          products: prdList.join(' + '),
          fwd_rate: rateL
        });
      }

      if (rateR !== '0') {
        reactionSpecs.set(idx++, {
          reactants: prdList.join(' + '),
          products: rcList.join(' + '),
          fwd_rate: rateR
        });
      }

      this.adjustParameters(reactants.length, rateL, sparameters);
      this.adjustParameters(products.length, rateR, sparameters);
    }

    return reactionSpecs;
  }
}



/**
 * SBMLParser - High-level wrapper for SBML parsing
 */
export class SBMLParser {
  private initialized: boolean = false;
  private currentSbml: string = '';
  private nativeFormulaToStringDisabled: boolean = false;
  private parameterAliasToId: Map<string, string> = new Map();
  private reactionKineticFormulaById: Map<string, string> = new Map();
  private ruleFormulaByKey: Map<string, string[]> = new Map();
  private ruleFormulaCursorByKey: Map<string, number> = new Map();
  /** Structured diagnostics collected during a parse; attached to the returned model. */
  private importWarnings: SBMLImportWarning[] = [];
  /** Set true if the comp package was successfully flattened during this parse. */
  private compFlattened: boolean = false;

  /**
   * Attempt to flatten SBML hierarchical composition (comp package) using libSBML's own
   * CompFlatteningConverter, then re-serialize so the raw-XML fallbacks keep working. Runs only
   * when the build exposes the full conversion + serialization API; otherwise returns false and a
   * precise diagnostic is emitted by detectUnsupportedPackages. We do not re-implement flattening.
   */
  private tryFlattenComp(document: any): boolean {
    if (!this.currentSbml || !/xmlns:[A-Za-z0-9_]+\s*=\s*["']http:\/\/www\.sbml\.org\/sbml\/level3\/version\d+\/comp\//i.test(this.currentSbml)) {
      return false; // no comp package present
    }
    try {
      const hasConv = typeof libsbml.ConversionProperties === 'function';
      const hasOption = typeof libsbml.ConversionOption === 'function';
      const canConvert = document && typeof document.convert === 'function';
      const canSerialize = typeof libsbml.writeSBMLToString === 'function';
      // A drivable ConversionProperties needs addOption/setValue to select "flatten comp".
      const props = hasConv ? new libsbml.ConversionProperties() : null;
      const canDrive = props && (typeof props.addOption === 'function' || (hasOption && typeof props.setValue === 'function'));
      if (!canConvert || !canDrive || !canSerialize) {
        this.recordWarning('package:comp',
          'comp (hierarchical composition) present but this libSBML build cannot flatten it (conversion/serialization API not exported). Submodels are not expanded. Use a fuller libsbmljs build or pre-flatten the model.',
          'dropped');
        return false;
      }
      if (typeof props!.addOption === 'function') {
        props!.addOption('flatten comp', true, 'flatten comp');
      }
      const status = document.convert(props);
      if (status !== 0 && status !== undefined) {
        this.recordWarning('package:comp', `comp flattening returned status ${status}; submodels may not be fully expanded.`, 'approximated');
      }
      const flat = libsbml.writeSBMLToString(document);
      if (typeof flat === 'string' && flat.length > 0) {
        this.currentSbml = flat; // keep raw-XML fallbacks consistent with the flattened model
        this.reactionKineticFormulaById = this.buildReactionKineticFormulaFallbackMap(flat);
        this.ruleFormulaByKey = this.buildRuleFormulaFallbackMap(flat);
        this.recordWarning('package:comp', 'comp package flattened via libSBML CompFlatteningConverter.', 'info');
        return true;
      }
      return false;
    } catch (e) {
      this.recordWarning('package:comp', `comp flattening attempt failed (${String(e)}); submodels not expanded.`, 'dropped');
      return false;
    }
  }

  /**
   * Read the attribute string of the first element `<tag ... id="id" ...>` from the raw SBML.
   * The bundled libsbmljs build omits many L3 getters (sboTerm, conversionFactor, isSet*, event
   * trigger attributes), so we recover them from the source text. Returns '' if not found.
   */
  private rawElementAttrs(tag: string, id: string): string {
    if (!this.currentSbml || !id) return '';
    const eid = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // id may appear before or after other attributes; match either order.
    const re = new RegExp(`<${tag}\\b([^>]*\\bid\\s*=\\s*["']${eid}["'][^>]*)>`, 'i');
    const m = this.currentSbml.match(re);
    return m ? m[1] : '';
  }

  /** True if `attr="..."` (or attr='...') is literally present in the given attribute string. */
  private rawHasAttr(attrs: string, attr: string): boolean {
    if (!attrs) return false;
    return new RegExp(`\\b${attr}\\s*=\\s*["']`, 'i').test(attrs);
  }

  private recordWarning(category: string, message: string, severity: SBMLImportWarning['severity']): void {
    const existing = this.importWarnings.find(w => w.category === category && w.message === message);
    if (existing) {
      existing.count += 1;
    } else {
      this.importWarnings.push({ category, message, count: 1, severity });
    }
  }

  /**
   * Detect SBML Level 3 packages by their namespace and count the elements each contributes.
   * The bundled build has no getPlugin, and full support for comp/multi/fbc/qual is a separate
   * subsystem — so rather than silently ignore these, we count what would be lost and say so.
   */
  private detectUnsupportedPackages(_model: SBMLModel): void {
    const xml = this.currentSbml;
    if (!xml) return;

    // Packages whose content changes the mathematical model (dropping them corrupts results).
    const dynamicPkgs: Record<string, string> = {
      comp: 'hierarchical model composition (submodels/externalModelDefinitions are not flattened)',
      multi: 'multistate/multicomponent species — the structure the atomizer otherwise reconstructs heuristically',
      fbc: 'flux-balance constraints and objectives',
      qual: 'qualitative (logical) model transitions',
      spatial: 'spatial geometry and diffusion',
      arrays: 'array-expanded objects',
      distrib: 'distributions and uncertainty',
      dyn: 'dynamic (agent) behaviour',
    };
    // Cosmetic / non-dynamic packages: safe to skip, noted for completeness only.
    const benignPkgs: Record<string, string> = {
      layout: 'diagram layout',
      render: 'diagram rendering',
      groups: 'element grouping',
    };

    const nsRe = /xmlns:([A-Za-z0-9_]+)\s*=\s*["']http:\/\/www\.sbml\.org\/sbml\/level3\/version\d+\/([a-z]+)\/version\d+["']/gi;
    const prefixByPkg = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = nsRe.exec(xml)) !== null) {
      prefixByPkg.set(m[2].toLowerCase(), m[1]);
    }

    const countPrefixed = (prefix: string): number =>
      (xml.match(new RegExp(`<${prefix}:[A-Za-z]`, 'g'))?.length || 0);

    // Some packages aren't merely unimplemented — they describe a different kind of model than the
    // kinetic ODE/SSA network BNGL expresses. Spell that out so the diagnostic isn't mistaken for a
    // missing feature that a rate law could paper over.
    const pkgWhy: Record<string, string> = {
      fbc: ' This is a constraint-based (flux-balance) model: a steady-state linear program over an objective and flux bounds, with no kinetics or time course. It has no faithful mass-action/ODE representation; use an FBA tool (e.g. COBRApy) instead of forcing kinetic rates.',
      qual: ' This is a qualitative/logical model: discrete levels with logical transition functions, not continuous-time kinetics. Its asynchronous/synchronous logical update semantics do not correspond to reaction rates, so a rate-based translation would compute different dynamics; use a logical-modelling tool such as GINsim or bioLQM instead.',
    };

    for (const [pkg, desc] of Object.entries(dynamicPkgs)) {
      if (pkg === 'comp') continue; // comp diagnostics are emitted by tryFlattenComp
      const prefix = prefixByPkg.get(pkg);
      if (!prefix) continue;
      const n = countPrefixed(prefix);
      this.recordWarning(`package:${pkg}`,
        `SBML "${pkg}" package detected (${n} element(s)): ${desc}. This package is not imported; affected structure is missing from the atomized model.${pkgWhy[pkg] || ''}`,
        'dropped');
    }
    for (const [pkg, desc] of Object.entries(benignPkgs)) {
      const prefix = prefixByPkg.get(pkg);
      if (!prefix) continue;
      this.recordWarning(`package:${pkg}`,
        `SBML "${pkg}" package detected (${desc}); not imported. This does not affect the mathematical model.`,
        'info');
    }
  }

  /**
   * Initialize the parser by loading libsbmljs
   */
  async initialize(): Promise<void> {
    if (this.initialized && libsbml) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        debugSbml('[SBMLParser] Dynamic import of libsbmljs_stable ...');
        const libsbmlModule = await import('libsbmljs_stable');
        debugSbml('[SBMLParser] Import complete.');

        const factory = libsbmlModule.default || libsbmlModule.libsbml || libsbmlModule;
        if (typeof factory !== 'function') {
          throw new Error(`libsbmljs export is not a function: ${typeof factory}`);
        }

        const isNodeEnv =
          typeof process !== 'undefined' &&
          !!(process as any).versions?.node;
        let nodeWasmPath: string | null = null;
        let nodeWasmBinary: Uint8Array | null = null;
        if (isNodeEnv) {
          try {
            const fs = await import('node:fs');
            const path = await import('node:path');
            nodeWasmPath = path.resolve(process.cwd(), 'public', 'libsbml.wasm');
            if (fs.existsSync(nodeWasmPath)) {
              nodeWasmBinary = new Uint8Array(fs.readFileSync(nodeWasmPath));
              debugSbml(`[SBMLParser] Node wasm preload path=${nodeWasmPath} bytes=${nodeWasmBinary.byteLength}`);
            } else {
              debugSbml(`[SBMLParser] Node wasm preload path missing: ${nodeWasmPath}`);
            }
          } catch (e) {
            debugSbml('[SBMLParser] Node wasm preload failed:', e);
          }
        }

        await new Promise<void>((res, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('libsbmljs initialization timed out (30s)'));
          }, 30000);

          // libsbml.wasm imports its memory (env.memory), so we can supply a growable one.
          // The old fixed 128 MB caused dense models (deeply nested MathML / many piecewise)
          // to abort on read — a catchable bad_alloc in some cases, an uncatchable Emscripten
          // "cannot enlarge memory" abort in others (which kills the process). We start at a
          // modest 256 MB and allow growth to 2 GB on demand, so normal models pay almost
          // nothing while pathological ones can complete. All the size knobs are set because
          // different Emscripten glue versions read different ones.
          const WASM_PAGE = 64 * 1024;
          const INITIAL_WASM_BYTES = 256 * 1024 * 1024;   // 256 MB
          const MAXIMUM_WASM_BYTES = 2048 * 1024 * 1024;  // 2 GB ceiling (wasm32-safe)
          let providedWasmMemory: WebAssembly.Memory | undefined;
          try {
            providedWasmMemory = new WebAssembly.Memory({
              initial: Math.floor(INITIAL_WASM_BYTES / WASM_PAGE),
              maximum: Math.floor(MAXIMUM_WASM_BYTES / WASM_PAGE),
            });
          } catch {
            // Environment can't build a growable memory of this size — fall back to letting
            // the glue size its own memory from the numeric options below.
            providedWasmMemory = undefined;
          }

          const config = {
            locateFile: (file: string) => {
              debugSbml(`[SBMLParser] locateFile: ${file}`);
              if (file.endsWith('.wasm')) {
                // Node environment: prefer the local public asset via file URL
                if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                  if (nodeWasmPath) return nodeWasmPath;
                  return './public/libsbml.wasm';
                }

                // Browser default
                return '/bngplayground/libsbml.wasm';
              }

              if (file.endsWith('.wast') || file.endsWith('.asm.js')) {
                return 'data:application/octet-stream;base64,';
              }
              return file;
            },
            // Memory sizing (see note above). TOTAL_MEMORY is the legacy alias; INITIAL_MEMORY
            // / MAXIMUM_MEMORY / ALLOW_MEMORY_GROWTH are the modern ones; wasmMemory forces a
            // growable memory when the build imports it (this one does).
            TOTAL_MEMORY: INITIAL_WASM_BYTES,
            INITIAL_MEMORY: INITIAL_WASM_BYTES,
            MAXIMUM_MEMORY: MAXIMUM_WASM_BYTES,
            ALLOW_MEMORY_GROWTH: 1,
            ...(providedWasmMemory ? { wasmMemory: providedWasmMemory } : {}),
            print: (text: string) => debugSbml(`[libsbml] ${text}`),
            printErr: (text: string) => debugSbml(`[libsbml-err] ${text}`),
            onRuntimeInitialized: () => {
              debugSbml('[SBMLParser] onRuntimeInitialized');
              clearTimeout(timeoutId);
              
              // If libsbml wasn't set by the Thenable yet, it might be available in 'this' or global
              if (!libsbml && (typeof (self as any).readSBMLFromString === 'function' || (self as any).SBMLReader)) {
                libsbml = self;
              }

              if (libsbml && (typeof libsbml.readSBMLFromString === 'function' || libsbml.SBMLReader)) {
                debugSbml('[SBMLParser] libsbml ready via onRuntimeInitialized');
                res();
              } else {
                debugSbml('[SBMLParser] waiting for Thenable to set libsbml...');
                // We don't resolve yet, wait for the factory promise
              }
            },
            onAbort: (msg: any) => {
              debugSbml('[SBMLParser] Aborted:', msg);
              clearTimeout(timeoutId);
              reject(new Error(`libsbmljs aborted: ${msg}`));
            },
            noInitialRun: true
          };

          if (nodeWasmBinary) {
            (config as any).wasmBinary = nodeWasmBinary;
          }

          debugSbml('[SBMLParser] Calling factory...');
          try {
            const result = factory.call(self, config);

            if (result && typeof result.then === 'function') {
              debugSbml('[SBMLParser] Factory returned Thenable, awaiting...');
              result.then(
                (instance: any) => {
                  debugSbml('[SBMLParser] Thenable resolved. Instance type:', typeof instance);
                  // Only set libsbml if instance is actually valid
                  if (instance && (typeof instance.SBMLReader === 'function' || typeof instance.readSBMLFromString === 'function')) {
                    libsbml = instance;
                    debugSbml('[SBMLParser] libsbml ready via Thenable. SBMLReader type:', typeof libsbml.SBMLReader);
                  } else {
                    console.error('[SBMLParser] Invalid libsbml instance:', instance);
                    reject(new Error('libsbml initialization returned invalid instance'));
                    return;
                  }
                  clearTimeout(timeoutId);
                  res();
                },
                (err: any) => {
                  console.error('[SBMLParser] Thenable rejected:', err);
                  clearTimeout(timeoutId);
                  reject(err);
                }
              );
            } else {
              debugSbml('[SBMLParser] Factory returned immediate result. SBMLReader type:', typeof (result as any)?.SBMLReader);
              if (result && (typeof (result as any).SBMLReader === 'function' || typeof (result as any).readSBMLFromString === 'function')) {
                libsbml = result;
                clearTimeout(timeoutId);
                res();
              } else {
                reject(new Error('libsbml factory returned invalid result'));
              }
            }
          } catch (e) {
            console.error('[SBMLParser] Factory call THREW:', e);
            clearTimeout(timeoutId);
            reject(e);
          }

        });

        this.initialized = true;
        logger.info('SBM001', 'libsbmljs initialized successfully');
      } catch (error) {
        logger.error('SBM002', `Failed to load libsbmljs: ${error}`);
        throw new Error(`Failed to initialize SBML parser: ${error}`, { cause: error });
      }
    })();

    return initPromise;
  }

  /**
   * Parse SBML string and extract model data
   */
  async parse(sbmlString: string): Promise<SBMLModel> {
    let document: any;
    let reader: any;

    try {
      const result = await this._parseInternal(sbmlString);
      document = (result as any)._document;
      reader = (result as any)._reader;
      return (result as any).model;
    } finally {
      if (document) {
        if (typeof (document as any).delete === 'function') (document as any).delete();
        else if (typeof libsbml.destroy === 'function') libsbml.destroy(document);
      }
      if (reader) {
        if (typeof (reader as any).delete === 'function') (reader as any).delete();
        else if (typeof libsbml.destroy === 'function') libsbml.destroy(reader);
      }
    }
  }

  /**
   * Internal parse logic that keeps objects alive for extraction
   */
  private async _parseInternal(sbmlString: string): Promise<{ model: SBMLModel, _document: any, _reader: any }> {
    const start = performance.now();
    if (!this.initialized || !libsbml) {
      await this.initialize();
    }

    if (SBML_PARSER_DEBUG && typeof self !== 'undefined' && (self as any).postMessage) {
      (self as any).postMessage({ type: 'debug_heartbeat', payload: 'BEFORE_READ_SBML' });
    }

    debugSbml(`!!! [SBMLParser] _parseInternal: Length: ${sbmlString.length}`);
    this.currentSbml = sbmlString;
    this.importWarnings = [];
    this.reactionKineticFormulaById = this.buildReactionKineticFormulaFallbackMap(sbmlString);
    this.ruleFormulaByKey = this.buildRuleFormulaFallbackMap(sbmlString);
    this.ruleFormulaCursorByKey = new Map();
    debugSbml(`!!! [SBMLParser] SBML Snippet: ${sbmlString.substring(0, 200)}`);
    let document: any;
    let reader: any;
    try {
      reader = new libsbml.SBMLReader();
      document = reader.readSBMLFromString(sbmlString);

      if (SBML_PARSER_DEBUG && typeof self !== 'undefined' && (self as any).postMessage) {
        (self as any).postMessage({ type: 'debug_heartbeat', payload: 'AFTER_READ_SBML' });
      }
      debugSbml('!!! [SBMLParser] AFTER readSBMLFromString');
      if (document) {
        debugSbml(`!!! [SBMLParser] document pointer: ${document.ptr}`);
        debugSbml(`!!! [SBMLParser] document.getNumErrors: ${typeof document.getNumErrors}`);
        if (typeof document.getNumErrors === 'function') {
          debugSbml(`!!! [SBMLParser] numErrors: ${document.getNumErrors()}`);
        }
        if (typeof document.getLevel === 'function') {
          debugSbml(`!!! [SBMLParser] Level: ${document.getLevel()}, Version: ${document.getVersion()}`);
        }
      }
    } catch (e) {
      // Fallback: heavy <annotation> metadata (celldesigner / render / layout — none of
      // which carries kinetics) can exhaust the WASM heap during read and make libsbml
      // throw. If the first read threw, retry once with annotation blocks stripped. This
      // path is only reached when the model failed to read at all, so it cannot affect any
      // model that already parses; SBML annotations are not nested, so the non-greedy strip
      // is safe.
      if (typeof e === 'number') {
        try {
          const stripped = sbmlString.replace(/<annotation\b[\s\S]*?<\/annotation>/g, '');
          if (stripped.length < sbmlString.length) {
            reader = new libsbml.SBMLReader();
            document = reader.readSBMLFromString(stripped);
            if (document) {
              logger.warning(
                'SBM023',
                'Model read only after stripping annotation metadata; visualization/layout annotations were dropped (kinetics unaffected).'
              );
            }
          }
        } catch {
          // retry also failed — fall through to decode + throw below
        }
      }

      if (!document) {
        // libsbml runs as Emscripten WASM: a thrown C++ exception surfaces in JS as a bare
        // number (a pointer into the WASM heap), e.g. "6875904", which is useless on its own.
        // Decode it to a real message when the build exposes a decoder; otherwise annotate it.
        let decoded: unknown = e;
        if (typeof e === 'number' && libsbml) {
          try {
            const mod = libsbml as any;
            if (typeof mod.getExceptionMessage === 'function') {
              const info = mod.getExceptionMessage(e); // usually [type, message]
              decoded = new Error(
                `libsbml WASM exception: ${Array.isArray(info) ? info.filter(Boolean).join(': ') : info}`
              );
            } else if (typeof mod.what === 'function') {
              decoded = new Error(`libsbml WASM exception: ${mod.what(e)}`);
            } else {
              decoded = new Error(
                `libsbml WASM threw a C++ exception (pointer ${e}) with no decoder available. ` +
                `This usually means an out-of-memory during read of a very large model, or an ` +
                `SBML Level-3 package (comp/fbc/multi/arrays/distrib) not compiled into this build.`
              );
            }
          } catch {
            decoded = new Error(`libsbml WASM threw a C++ exception (pointer ${e}); message decode failed.`);
          }
        }
        console.error('!!! [SBMLParser] readSBMLFromString threw error:', decoded);
        throw decoded;
      }
    }

    if (!document) {
      throw new Error('libsbml.readSBMLFromString returned null');
    }

    try {
      // Check for errors
      const numErrors = typeof document.getNumErrors === 'function' ? document.getNumErrors() : 0;
      if (numErrors > 0) {
        const errors: string[] = [];
        for (let i = 0; i < numErrors; i++) {
          const error = document.getError ? document.getError(i) : null;
          if (!error) continue;

          const severity = typeof (error as any).getSeverity === 'function' ? (error as any).getSeverity() : 0;
          const message = typeof (error as any).getMessage === 'function' ? (error as any).getMessage() : 'Unknown SBML error';

          if (severity >= 2) {
            errors.push(message);
          }
        }
        if (errors.length > 0) {
          logger.warning('SBM003', `SBML parsing warnings: ${errors.slice(0, 3).join('; ')}`);
        }
      }

      debugSbml('!!! [SBMLParser] Calling getModel()');
      // Attempt hierarchical (comp) flattening before extraction. This bundled libsbmljs build does
      // not export the pieces needed to drive/serialize the converter, so in practice it records a
      // build-level diagnostic; the code runs the real converter automatically if a fuller build is
      // ever used. Hand-rolling a flattener (submodels/ports/replacements) is deliberately avoided.
      this.compFlattened = this.tryFlattenComp(document);
      const model = typeof document.getModel === 'function' ? document.getModel() : null;
      debugSbml(`!!! [SBMLParser] getModel result: ${model ? 'object' : 'null'}`);
      if (model && typeof model.ptr !== 'undefined') {
        debugSbml(`!!! [SBMLParser] model pointer: ${model.ptr}`);
      }

      if (!model || model.ptr === 0) {
        console.error('[SBMLParser] document.getModel() returned null or NULL pointer (0)');
        throw new Error('SBML document contains no model or model pointer is NULL (0)');
      }

      debugSbml('!!! [SBMLParser] Calling extractModel()');
      const extractedModel = this.extractModel(model);
      debugSbml(`[SBMLParser] Total parse time: ${(performance.now() - start).toFixed(2)}ms`);
      return { model: extractedModel, _document: document, _reader: reader };
    } finally {
      // Cleanup happens AFTER extractModel() completes
    }
  }

  /**
   * Extract all model data into internal format
   */
  private extractModel(model: any): SBMLModel {
    const start = performance.now();
    debugSbml('!!! [SBMLParser] extractModel: Entered');
    if (model) {
      debugSbml(`!!! [SBMLParser] model pointer: ${model.ptr}`);
      debugSbml(`!!! [SBMLParser] model keys: ${Object.keys(model).filter(k => !k.startsWith('_')).join(', ')}`);
    }

    debugSbml('!!! [SBMLParser] extractModel: Calling model.getId()');
    const modelId = (typeof model.getId === 'function') ? model.getId() : 'unnamed_model';
    debugSbml(`!!! [SBMLParser] modelId: ${modelId}`);

    debugSbml('!!! [SBMLParser] extractModel: Calling model.getName()');
    const modelName = (typeof model.getName === 'function') ? model.getName() : (modelId || 'Unnamed Model');
    debugSbml(`!!! [SBMLParser] modelName: ${modelName}`);

    const result: SBMLModel = {
      id: modelId || 'unnamed_model',
      name: modelName || modelId || 'Unnamed Model',
      compartments: new Map(),
      species: new Map(),
      parameters: new Map(),
      reactions: new Map(),
      rules: [],
      functionDefinitions: new Map(),
      events: [],
      initialAssignments: [],
      speciesByCompartment: new Map(),
      unitDefinitions: new Map(),
      level: typeof model.getLevel === 'function' ? model.getLevel() : undefined,
      version: typeof model.getVersion === 'function' ? model.getVersion() : undefined,
      conversionFactor: (typeof model.getConversionFactor === 'function' ? model.getConversionFactor() : '')
        || this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'conversionFactor')
        || undefined,
      substanceUnits: (typeof model.getSubstanceUnits === 'function' ? model.getSubstanceUnits() : '')
        || this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'substanceUnits') || undefined,
      timeUnits: this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'timeUnits') || undefined,
      volumeUnits: this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'volumeUnits') || undefined,
      areaUnits: this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'areaUnits') || undefined,
      lengthUnits: this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'lengthUnits') || undefined,
      extentUnits: this.getXmlAttribute(this.currentSbml.match(/<model\b[^>]*>/i)?.[0] || '', 'extentUnits') || undefined,
      constraintCount: 0,
      importWarnings: [],
    };

    // Reset per-model parameter alias cache used for math normalization.
    this.parameterAliasToId = new Map();

    // Extract compartments
    debugSbml('!!! [SBMLParser] extractModel: getNumCompartments');
    const numComps = model.getNumCompartments();
    debugSbml(`!!! [SBMLParser] Extracting ${numComps} compartments...`);
    let t = performance.now();
    for (let i = 0; i < model.getNumCompartments(); i++) {
      const compRaw = model.getCompartment(i);
      if (!compRaw) continue;
      const comp = this.extractCompartment(compRaw);
      result.compartments.set(comp.id, comp);
    }
    const compTime = performance.now() - t;

    // Extract species
    debugSbml('!!! [SBMLParser] extractModel: getNumSpecies');
    const numSpecies = model.getNumSpecies();
    debugSbml(`!!! [SBMLParser] Extracting ${numSpecies} species...`);
    t = performance.now();
    for (let i = 0; i < model.getNumSpecies(); i++) {
      const spRaw = model.getSpecies(i);
      if (!spRaw) continue;
      const sp = this.extractSpecies(spRaw);
      result.species.set(sp.id, sp);

      if (!result.speciesByCompartment.has(sp.compartment)) {
        result.speciesByCompartment.set(sp.compartment, []);
      }
      result.speciesByCompartment.get(sp.compartment)!.push(sp.id);
    }
    const speciesTime = performance.now() - t;

    // Extract parameters
    debugSbml('!!! [SBMLParser] extractModel: getNumParameters');
    const numParams = model.getNumParameters();
    debugSbml(`!!! [SBMLParser] Extracting ${numParams} parameters...`);
    t = performance.now();
    for (let i = 0; i < model.getNumParameters(); i++) {
      const paramRaw = model.getParameter(i);
      if (!paramRaw) continue;
      const param = this.extractParameter(paramRaw, 'global');
      const existing = result.parameters.get(param.id);
      if (existing) {
        const valuesMatch =
          (Number.isFinite(existing.value) && Number.isFinite(param.value))
            ? Math.abs(existing.value - param.value) <= 1e-12
            : existing.value === param.value;
        if (valuesMatch) {
          this.registerGlobalParameterAliases(existing.id, param.name);
          continue;
        }
        const baseId = param.id;
        let suffix = 2;
        while (result.parameters.has(`${baseId}_${suffix}`)) suffix += 1;
        param.id = `${baseId}_${suffix}`;
        logger.warning('SBM010', `Duplicate parameter id "${baseId}" remapped to "${param.id}"`);
      }
      result.parameters.set(param.id, param);
      this.registerGlobalParameterAliases(param.id, param.name);
    }
    const paramTime = performance.now() - t;

    // Extract reactions
    debugSbml('!!! [SBMLParser] extractModel: getNumReactions');
    const numRxns = model.getNumReactions();
    debugSbml(`!!! [SBMLParser] Extracting ${numRxns} reactions...`);
    t = performance.now();
    for (let i = 0; i < model.getNumReactions(); i++) {
      try {
        const rxnRaw = model.getReaction(i);
        if (!rxnRaw) continue;
        const rxn = this.extractReaction(rxnRaw);
        result.reactions.set(rxn.id, rxn);
      } catch (e) {
        logger.warning('SBM005', `Skipping reaction #${i}: ${String(e)}`);
        if (isAbortLikeError(e)) {
          logger.warning(
            'SBM006',
            'libSBML aborted while parsing reactions; continuing with successfully extracted reactions only.'
          );
          break;
        }
      }
    }
    const rxnTime = performance.now() - t;

    // Extract rules/functions/events
    debugSbml('[SBMLParser] Extracting rules/functions/events...');
    t = performance.now();
    let advancedExtractionAborted = false;

    for (let i = 0; i < model.getNumFunctionDefinitions(); i++) {
      try {
        const func = this.extractFunctionDefinition(model.getFunctionDefinition(i));
        result.functionDefinitions.set(func.id, func);
      } catch (e) {
        logger.warning('SBM005', `Skipping function definition #${i}: ${String(e)}`);
        if (isAbortLikeError(e)) {
          advancedExtractionAborted = true;
          break;
        }
      }
    }

    if (!advancedExtractionAborted) {
      for (let i = 0; i < model.getNumRules(); i++) {
        try {
          const rule = this.extractRule(model.getRule(i));
          if (rule) result.rules.push(rule);
        } catch (e) {
          logger.warning('SBM005', `Skipping rule #${i}: ${String(e)}`);
          if (isAbortLikeError(e)) {
            advancedExtractionAborted = true;
            break;
          }
        }
      }
    }

    if (!advancedExtractionAborted) {
      for (let i = 0; i < model.getNumEvents(); i++) {
        try {
          const event = this.extractEvent(model.getEvent(i));
          if (event) result.events.push(event);
        } catch (e) {
          logger.warning('SBM005', `Skipping event #${i}: ${String(e)}`);
          if (isAbortLikeError(e)) {
            advancedExtractionAborted = true;
            break;
          }
        }
      }
    }

    if (!advancedExtractionAborted) {
      for (let i = 0; i < model.getNumInitialAssignments(); i++) {
        try {
          const ia = this.extractInitialAssignment(model.getInitialAssignment(i));
          if (ia) result.initialAssignments.push(ia);
        } catch (e) {
          logger.warning('SBM005', `Skipping initial assignment #${i}: ${String(e)}`);
          if (isAbortLikeError(e)) {
            advancedExtractionAborted = true;
            break;
          }
        }
      }
    }

    if (advancedExtractionAborted) {
      logger.warning(
        'SBM006',
        'libSBML aborted while parsing events/rules; continuing with species/reactions only.'
      );
    } else {
      // Extract Unit Definitions only when the module remains healthy.
      for (let i = 0; i < model.getNumUnitDefinitions(); i++) {
        try {
          const ud = model.getUnitDefinition(i);
          const units: Array<[number, number, number, number]> = [];
          for (let j = 0; j < ud.getNumUnits(); j++) {
            const u = ud.getUnit(j);
            if (u) {
              const kind = typeof u.getKind === 'function' ? u.getKind() : 0;
              const scale = typeof u.getScale === 'function' ? u.getScale() : 0;
              const exponent = typeof u.getExponent === 'function' ? u.getExponent() : 1;
              const multiplier = typeof u.getMultiplier === 'function' ? u.getMultiplier() : 1;
              units.push([kind, scale, exponent, multiplier]);
            }
          }
          result.unitDefinitions.set(ud.getId(), units);
        } catch (e) {
          logger.warning('SBM005', `Skipping unit definition #${i}: ${String(e)}`);
          if (isAbortLikeError(e)) {
            break;
          }
        }
      }
    }
    const otherTime = performance.now() - t;

    // Constraints: recorded but not simulated (they are validity assertions, not dynamics).
    const numConstraints = typeof model.getNumConstraints === 'function'
      ? model.getNumConstraints()
      : (this.currentSbml.match(/<constraint\b/gi)?.length || 0);
    result.constraintCount = numConstraints;
    if (numConstraints > 0) {
      this.recordWarning('constraint',
        `${numConstraints} <constraint> element(s) present; not enforced during simulation.`,
        'info');
    }

    // L3 package detection. The reduced build exposes no getPlugin, so detect by namespace in the
    // source and count top-level objects so nothing is dropped without an explicit, counted notice.
    this.detectUnsupportedPackages(result);

    // Events are captured but the engine has no general event executor, so they change nothing
    // during simulation unless the writer maps them (only simple time-triggered cases can be).
    if (result.events.length > 0) {
      this.recordWarning('event',
        `${result.events.length} SBML event(s) parsed; discrete state changes are not executed by the simulation engine and are emitted as an annotated block for review.`,
        'dropped');
    }

    // Algebraic rules cannot be represented in BNGL (implicit DAE constraints).
    const numAlgebraic = result.rules.filter(r => r.type === 'algebraic').length;
    if (numAlgebraic > 0) {
      this.recordWarning('algebraicRule',
        `${numAlgebraic} algebraic rule(s) present; these are implicit DAE constraints with no BNGL equivalent and are not applied.`,
        'dropped');
    }

    // Recover BNGL molecule-type skeletons from the multi package, if present.
    const multi = parseMultiPackage(this.currentSbml || '');
    if (multi.present) {
      for (const w of multi.warnings) this.importWarnings.push(w);
      if (multi.bnglMoleculeTypes.length > 0) result.multiMoleculeTypes = multi.bnglMoleculeTypes;
      if (multi.complexPatterns.length > 0) result.multiComplexPatterns = multi.complexPatterns.map(c => c.pattern);
      if (multi.seedPatterns.length > 0) result.multiSeedPatterns = multi.seedPatterns.map(s => `${s.species}: ${s.pattern}`);
    }

    // Convert declared units to SI base so the downstream conc*Na*V step lands on real counts.
    // No-op for undeclared/dimensionless units, so unit-less models (incl. BNG round-trips) are safe.
    for (const w of applyUnitScaling(result)) this.importWarnings.push(w);

    result.importWarnings = this.importWarnings.slice();

    debugSbml(`[SBMLParser] extractModel breakdown:
      Compartments: ${compTime.toFixed(2)}ms
      Species: ${speciesTime.toFixed(2)}ms
      Parameters: ${paramTime.toFixed(2)}ms
      Reactions: ${rxnTime.toFixed(2)}ms
      Other: ${otherTime.toFixed(2)}ms
      Total: ${(performance.now() - start).toFixed(2)}ms`);

    logger.info('SBM004',
      `Parsed SBML model: ${result.species.size} species, ${result.reactions.size} reactions`);
    for (const w of this.importWarnings) {
      const code = w.severity === 'dropped' ? 'SBM020' : w.severity === 'approximated' ? 'SBM021' : 'SBM022';
      logger.warning(code, `[${w.category}] ${w.message}${w.count > 1 ? ` (x${w.count})` : ''}`);
    }

    return result;
  }

  private extractCompartment(comp: any): SBMLCompartment {
    const id = comp.getId ? comp.getId() : 'c';
    
    // Fallback: search for outside="X" in the raw SBML string for this compartment ID
    let outside: string | undefined = undefined;
    if (this.currentSbml) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const compRegex = new RegExp(`<compartment[^>]+id=["']${escapedId}["'][^>]*outside=["']([^"']+)["']`, 'i');
      const match = this.currentSbml.match(compRegex);
      if (match) {
        outside = match[1];
      }
    }

    const isSetO = typeof comp.isSetOutside === 'function' && comp.isSetOutside();
    const getAttrO = typeof comp.getAttributeValue === 'function' ? comp.getAttributeValue('outside') : undefined;

    const compId = comp.getId();
    const compAttrs = this.rawElementAttrs('compartment', compId);
    const sizeSet = this.rawHasAttr(compAttrs, 'size') || this.rawHasAttr(compAttrs, 'volume');

    return {
      id: compId,
      name: comp.getName() || compId,
      spatialDimensions: typeof comp.getSpatialDimensions === 'function' ? comp.getSpatialDimensions() : 3,
      size: typeof comp.getSize === 'function' ? comp.getSize() : 1,
      units: typeof comp.getUnits === 'function' ? comp.getUnits() : '',
      constant: typeof comp.getConstant === 'function' ? comp.getConstant() : true,
      outside: outside || (isSetO ? comp.getOutside() : (getAttrO || (typeof comp.getOutside === 'function' ? (comp.getOutside() || undefined) : undefined))),
      compartmentType: (typeof comp.getCompartmentType === 'function' ? comp.getCompartmentType() : '')
        || this.getXmlAttribute(compAttrs, 'compartmentType') || undefined,
      sizeSet,
    };
  }

  private extractSpecies(sp: any): SBMLSpecies {
    debugSbml(`!!! [SBMLParser] extractSpecies: ${sp.getId ? sp.getId() : 'unknown'}`);
    const name = typeof sp.getName === 'function' ? (sp.getName() || '') : '';
    const attrName = typeof sp.getAttributeValue === 'function' ? (sp.getAttributeValue('name') || '') : '';
    const finalName = name || attrName || sp.getId();
    
    const speciesId = sp.getId();

    // The reduced libsbmljs build has no isSetInitialAmount/isSetInitialConcentration, so we
    // detect explicit presence from the raw SBML. This is what lets us tell a genuine 0 (or an
    // unset value that an initialAssignment will supply) apart from a value the modeller meant.
    const rawAttrs = this.rawElementAttrs('species', speciesId);
    const amountSet = this.rawHasAttr(rawAttrs, 'initialAmount');
    const concSet = this.rawHasAttr(rawAttrs, 'initialConcentration');

    const rawAmount = typeof sp.getInitialAmount === 'function' ? (sp.getInitialAmount() || 0) : 0;
    const rawConc = typeof sp.getInitialConcentration === 'function' ? (sp.getInitialConcentration() || 0) : 0;

    // Only use explicit hasOnlySubstanceUnits attribute from SBML.
    // Inferred logic based on non-zero initialAmount was incorrect for mixed-unit systems.
    const hasOnlySubstanceUnits = typeof sp.getHasOnlySubstanceUnits === 'function' ? sp.getHasOnlySubstanceUnits() : false;

    const sboAttr = this.getXmlAttribute(rawAttrs, 'sboTerm');
    const convAttr = this.getXmlAttribute(rawAttrs, 'conversionFactor');

    return {
      id: speciesId,
      name: finalName,
      compartment: sp.getCompartment(),
      // Keep the actual value when the attribute is set (including a literal 0). When neither is
      // set, both stay 0 and the seed builder will look to an initialAssignment instead.
      initialConcentration: concSet ? rawConc : 0,
      initialAmount: amountSet ? rawAmount : 0,
      substanceUnits: typeof sp.getSubstanceUnits === 'function' ? (sp.getSubstanceUnits() || '') : '',
      hasOnlySubstanceUnits,
      boundaryCondition: typeof sp.getBoundaryCondition === 'function' ? sp.getBoundaryCondition() : false,
      constant: typeof sp.getConstant === 'function' ? sp.getConstant() : false,
      annotations: this.extractAnnotations(sp),
      initialAmountSet: amountSet,
      initialConcentrationSet: concSet,
      sboTerm: sboAttr || undefined,
      conversionFactor: convAttr || undefined,
      charge: this.rawHasAttr(rawAttrs, 'charge') ? Number(this.getXmlAttribute(rawAttrs, 'charge')) : undefined,
      speciesType: this.getXmlAttribute(rawAttrs, 'speciesType') || undefined,
    };
  }

  private extractAnnotations(sp: any): AnnotationInfo[] {
    const annotations: AnnotationInfo[] = [];

    for (let i = 0; i < sp.getNumCVTerms(); i++) {
      const cvTerm = sp.getCVTerm(i);
      const qualifierType = cvTerm.getQualifierType();

      const resources: string[] = [];
      for (let j = 0; j < cvTerm.getNumResources(); j++) {
        resources.push(cvTerm.getResourceURI(j));
      }

      const annotation: AnnotationInfo = {
        qualifierType,
        resources,
      };

      if (qualifierType === 1) {
        annotation.biologicalQualifier = cvTerm.getBiologicalQualifierType() as BiologicalQualifier;
      } else {
        annotation.modelQualifier = cvTerm.getModelQualifierType() as ModelQualifier;
      }

      annotations.push(annotation);
    }

    return annotations;
  }

  private extractParameter(param: any, scope: 'global' | 'local'): SBMLParameter {
    const get = <T>(fn: unknown, fallback: T): T => {
      try {
        if (typeof fn === 'function') {
          const value = fn();
          return (value ?? fallback) as T;
        }
      } catch {
        // ignore malformed libsbml bindings and use fallback
      }
      return fallback;
    };

    const rawId = String(get<string>(param?.getId?.bind(param), '') || '').trim();
    const rawName = String(get<string>(param?.getName?.bind(param), '') || '').trim();
    const baseId = rawId || rawName || `${scope}_parameter`;
    const id = standardizeName(baseId);
    return {
      id,
      name: rawName || rawId || id,
      value: Number(get<number>(param?.getValue?.bind(param), 0)) || 0,
      units: String(get<string>(param?.getUnits?.bind(param), '')),
      constant: Boolean(get<boolean>(param?.getConstant?.bind(param), true)),
      scope,
    };
  }

  private registerAlias(target: Map<string, string>, aliasRaw: string, canonicalId: string): void {
    const direct = String(aliasRaw || '').trim();
    if (!direct) return;
    const collapsed = direct.replace(/\s+/g, ' ');
    const aliases = new Set<string>([direct, collapsed, standardizeName(direct)]);
    for (const alias of aliases) {
      const key = String(alias || '').trim();
      if (!key) continue;
      const existing = target.get(key);
      if (!existing || existing === canonicalId) {
        target.set(key, canonicalId);
      }
    }
  }

  private registerGlobalParameterAliases(id: string, name: string): void {
    this.registerAlias(this.parameterAliasToId, id, id);
    this.registerAlias(this.parameterAliasToId, name, id);
  }

  private normalizeFormulaIdentifiers(formula: string, localAliases?: Map<string, string>): string {
    let normalized = String(formula || '');
    if (!normalized) return normalized;

    const orderedAliases: Array<[string, string]> = [];
    const pushAliases = (source?: Map<string, string>) => {
      if (!source) return;
      for (const [alias, canonicalId] of source.entries()) {
        const key = String(alias || '').trim();
        const value = String(canonicalId || '').trim();
        if (!key || !value || key === value) continue;
        orderedAliases.push([key, value]);
      }
    };

    // Local aliases first so local-parameter substitutions win when names overlap globals.
    pushAliases(localAliases);
    pushAliases(this.parameterAliasToId);
    orderedAliases.sort((a, b) => b[0].length - a[0].length);

    for (const [alias, canonicalId] of orderedAliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'g');
      normalized = normalized.replace(pattern, (_match, prefix: string) => `${prefix}${canonicalId}`);
    }

    return normalized;
  }

  private sanitizeMathExpression(formula: string): string {
    let sanitized = String(formula || '').trim();
    if (!sanitized) return '';

    // Some malformed extraction paths leak a standalone '=' token.
    sanitized = sanitized.replace(/^\s*=\s*/, '').trim();
    if (!sanitized) return '';

    // Keep valid function/operator expressions, but reject punctuation-only artifacts.
    if (/^[=(){}[],;\s]+$/.test(sanitized)) {
      return '';
    }
    return sanitized;
  }

  private makeRuleFormulaKey(ruleType: SBMLRule['type'], variable?: string): string {
    return `${ruleType}:${String(variable || '').trim()}`;
  }

  private getXmlAttribute(tagAttributes: string, attributeName: string): string | null {
    const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrRe = new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
    const match = tagAttributes.match(attrRe);
    if (!match) return null;
    return (match[1] ?? match[2] ?? '').trim();
  }

  private decodeXmlEntities(value: string): string {
    if (!value || value.indexOf('&') === -1) return value;
    return value
      .replace(/&#x([0-9a-f]+);/gi, (full, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : full;
      })
      .replace(/&#([0-9]+);/g, (full, dec) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : full;
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private buildReactionKineticFormulaFallbackMap(sbmlString: string): Map<string, string> {
    const formulaByReactionId = new Map<string, string>();
    if (!sbmlString) return formulaByReactionId;

    const reactionRe = /<reaction\b([^>]*)>([\s\S]*?)<\/reaction>/gi;
    let reactionMatch: RegExpExecArray | null;
    while ((reactionMatch = reactionRe.exec(sbmlString)) !== null) {
      const reactionAttrs = reactionMatch[1] ?? '';
      const reactionBody = reactionMatch[2] ?? '';
      const reactionId = this.getXmlAttribute(reactionAttrs, 'id');
      if (!reactionId) continue;

      const kineticLawTag = reactionBody.match(/<kineticLaw\b([^>]*?)(?:\/>|>)/i);
      if (!kineticLawTag) continue;
      const formulaRaw = this.getXmlAttribute(kineticLawTag[1] ?? '', 'formula');
      if (!formulaRaw) continue;

      const formula = this.decodeXmlEntities(formulaRaw).trim();
      if (!formula) continue;
      formulaByReactionId.set(reactionId, formula);
    }

    return formulaByReactionId;
  }

  private getFallbackKineticLawFormula(reactionId: string): string | null {
    if (!reactionId) return null;
    const formula = this.reactionKineticFormulaById.get(reactionId);
    if (!formula) return null;
    const trimmed = formula.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildRuleFormulaFallbackMap(sbmlString: string): Map<string, string[]> {
    const formulaByRuleKey = new Map<string, string[]>();
    if (!sbmlString) return formulaByRuleKey;

    const ruleRe = /<(assignmentRule|rateRule|algebraicRule)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRe.exec(sbmlString)) !== null) {
      const tagName = String(ruleMatch[1] || '').toLowerCase();
      const attrs = ruleMatch[2] ?? '';
      const body = ruleMatch[3] ?? '';
      const ruleType: SBMLRule['type'] =
        tagName === 'assignmentrule' ? 'assignment' : tagName === 'raterule' ? 'rate' : 'algebraic';
      const variable = this.getXmlAttribute(attrs, 'variable') || '';

      let formula = '';
      const formulaRaw = this.getXmlAttribute(attrs, 'formula');
      if (formulaRaw) {
        formula = this.decodeXmlEntities(formulaRaw);
      }
      if (!formula) {
        const mathTag = body.match(/<math\b[\s\S]*?<\/math>/i);
        if (mathTag?.[0]) {
          formula = this.mathMlToFormula(mathTag[0]);
        }
      }

      formula = this.sanitizeMathExpression(this.normalizeFormulaIdentifiers(formula));
      if (!formula) continue;

      const key = this.makeRuleFormulaKey(ruleType, variable);
      const existing = formulaByRuleKey.get(key);
      if (existing) {
        existing.push(formula);
      } else {
        formulaByRuleKey.set(key, [formula]);
      }
    }

    return formulaByRuleKey;
  }

  private getFallbackRuleFormula(ruleType: SBMLRule['type'], variable?: string): string | null {
    const key = this.makeRuleFormulaKey(ruleType, variable);
    const formulas = this.ruleFormulaByKey.get(key);
    if (!formulas || formulas.length === 0) return null;

    const cursor = this.ruleFormulaCursorByKey.get(key) ?? 0;
    this.ruleFormulaCursorByKey.set(key, cursor + 1);
    const formula = formulas[Math.min(cursor, formulas.length - 1)] || '';
    const sanitized = this.sanitizeMathExpression(formula);
    return sanitized || null;
  }

  private parseSimpleXml(xml: string): SimpleXmlNode | null {
    const source = String(xml || '').trim();
    if (!source) return null;

    const tokens = source.match(/<[^>]+>|[^<]+/g);
    if (!tokens) return null;

    const root: SimpleXmlNode = { name: '#root', children: [], text: '' };
    const stack: SimpleXmlNode[] = [root];

    for (const token of tokens) {
      if (!token) continue;
      if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<!')) continue;

      if (token.startsWith('</')) {
        const closeNameRaw = token.replace(/^<\s*\/\s*/, '').replace(/\s*>$/, '').trim();
        const closeName = closeNameRaw.split(':').pop()?.toLowerCase() || '';
        while (stack.length > 1) {
          const popped = stack.pop();
          if (popped?.name === closeName) break;
        }
        continue;
      }

      if (token.startsWith('<')) {
        const openNameMatch = token.match(/^<\s*([^\s/>]+)/);
        if (!openNameMatch) continue;
        const rawName = openNameMatch[1];
        const name = rawName.split(':').pop()?.toLowerCase() || rawName.toLowerCase();
        const attributes = token
          .replace(/^<\s*[^\s/>]+/, '')   // drop "<name"
          .replace(/\/?\s*>$/, '')        // drop trailing ">" or "/>"
          .trim();
        const node: SimpleXmlNode = { name, children: [], text: '', attributes };
        const parent = stack[stack.length - 1];
        parent.children.push(node);

        if (!/\/\s*>$/.test(token)) {
          stack.push(node);
        }
        continue;
      }

      const text = token.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      stack[stack.length - 1].children.push({ name: '#text', children: [], text });
    }

    return root.children[0] || null;
  }

  private simpleXmlText(node: SimpleXmlNode | null): string {
    if (!node) return '';
    if (node.name === '#text') return node.text.trim();
    const parts: string[] = [];
    for (const child of node.children) {
      const text = this.simpleXmlText(child);
      if (text) parts.push(text);
    }
    return parts.join(' ').trim();
  }

  private mathMlToFormula(mathMl: string): string {
    const parsed = this.parseSimpleXml(mathMl);
    if (!parsed) return '';
    const expression = this.mathMlNodeToFormula(parsed);
    return this.sanitizeMathExpression(expression);
  }

  private mathMlNodeToFormula(node: SimpleXmlNode | null): string {
    if (!node) return '';
    if (node.name === '#text') return node.text.trim();

    const elementChildren = node.children.filter((child) => child.name !== '#text');
    // Compute the first non-empty child expression ON DEMAND. Doing this eagerly for every node
    // (as a mapped childExprs array) double-recurses through operands in the `apply` branch below,
    // which is O(2^depth) and hangs on deeply nested arithmetic (e.g. long left-associative
    // subtraction chains). Only the passthrough cases and the default need it.
    const firstChildExpr = (): string => {
      for (const child of elementChildren) {
        const e = this.mathMlNodeToFormula(child).trim();
        if (e) return e;
      }
      return '';
    };

    switch (node.name) {
      case 'math':
      case 'semantics':
      case 'annotation-xml':
      case 'condition':
      case 'piece':
      case 'otherwise':
        return firstChildExpr();
      case 'ci':
      case 'csymbol':
        return this.simpleXmlText(node);
      case 'cn': {
        // <cn> may carry a type: rational (a<sep/>b => a/b) or e-notation (m<sep/>e => m*10^e).
        const hasSep = node.children.some((c) => c.name === 'sep');
        const textChunks = node.children.filter((c) => c.name === '#text').map((c) => c.text.trim()).filter(Boolean);
        const type = (this.getXmlAttribute(node.attributes || '', 'type') || '').toLowerCase();
        if (hasSep && textChunks.length >= 2) {
          if (type === 'e-notation' || type === 'enotation') return `(${textChunks[0]} * 10^(${textChunks[1]}))`;
          // rational (the default meaning of a <sep/> between two integers)
          if (type !== 'rational') {
            this.recordWarning('mathml', `<cn> with <sep/> and unspecified type treated as rational.`, 'approximated');
          }
          return `(${textChunks[0]} / ${textChunks[1]})`;
        }
        return this.simpleXmlText(node);
      }
      case 'true':
        return '1';
      case 'false':
        return '0';
      case 'pi':
        return '3.141592653589793';
      case 'exponentiale':
        return '2.718281828459045';
      case 'infinity':
        this.recordWarning('mathml', '<infinity> constant encountered in math; emitted as a large finite value.', 'approximated');
        return '1e308';
      case 'notanumber':
        this.recordWarning('mathml', '<notanumber> constant encountered in math; cannot be represented.', 'approximated');
        return '0';
      case 'piecewise': {
        const args: string[] = [];
        for (const child of elementChildren) {
          if (child.name === 'piece') {
            const pieceChildren = child.children.filter((c) => c.name !== '#text');
            const conditionNode = pieceChildren.find((c) => c.name === 'condition') || null;
            const valueNode = pieceChildren.find((c) => c.name !== 'condition') || null;
            const valueExpr = this.mathMlNodeToFormula(valueNode);
            const conditionExpr = this.mathMlNodeToFormula(conditionNode);
            if (valueExpr && conditionExpr) {
              args.push(valueExpr, conditionExpr);
            } else if (valueExpr) {
              args.push(valueExpr);
            }
          } else if (child.name === 'otherwise') {
            const otherwiseExpr = this.mathMlNodeToFormula(child);
            if (otherwiseExpr) args.push(otherwiseExpr);
          }
        }
        if (args.length === 0) return '';
        return `piecewise(${args.join(', ')})`;
      }
      case 'apply': {
        if (elementChildren.length === 0) return '';
        const opNode = elementChildren[0];
        const opName = opNode.name;

        if (opName === 'ci' || opName === 'csymbol') {
          // Only a function-call apply needs its operands mapped here. Computing this eagerly for
          // EVERY apply (as was done before) is a second O(2^depth) traversal on top of `a` below,
          // and hangs on deeply nested arithmetic — so it must stay inside this branch.
          const opArgs = elementChildren
            .slice(1)
            .map((child) => this.mathMlNodeToFormula(child))
            .map((expr) => expr.trim())
            .filter(Boolean);
          const fnName = this.simpleXmlText(opNode);
          return fnName ? `${fnName}(${opArgs.join(', ')})` : opArgs.join(', ');
        }

        // <degree> (for root) and <logbase> (for log) are qualifiers, not arguments.
        const degreeNode = elementChildren.slice(1).find((c) => c.name === 'degree') || null;
        const logbaseNode = elementChildren.slice(1).find((c) => c.name === 'logbase') || null;
        const a = elementChildren
          .slice(1)
          .filter((c) => c.name !== 'degree' && c.name !== 'logbase')
          .map((c) => this.mathMlNodeToFormula(c))
          .map((e) => e.trim())
          .filter(Boolean);

        // Functions supported directly by the engine's expression evaluator.
        const direct: Record<string, string> = {
          exp: 'exp', ln: 'ln', abs: 'abs', floor: 'floor',
          sin: 'sin', cos: 'cos', tan: 'tan',
          sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
          asin: 'asin', acos: 'acos', atan: 'atan',
          arcsin: 'asin', arccos: 'acos', arctan: 'atan',
          arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh',
          ceiling: 'ceil', min: 'min', max: 'max',
        };

        switch (opName) {
          case 'plus':
            return a.length ? `(${a.join(' + ')})` : '0';
          case 'times':
            return a.length ? `(${a.join(' * ')})` : '1';
          case 'minus':
            return a.length === 1 ? `(-${a[0]})` : `(${a.join(' - ')})`;
          case 'divide':
            return a.length >= 2 ? `(${a[0]} / ${a[1]})` : `(${a.join(' / ')})`;
          case 'power':
            return a.length >= 2 ? `pow(${a[0]}, ${a[1]})` : `pow(${a.join(', ')})`;
          case 'root': {
            // Default is square root; a <degree> gives the nth root => x^(1/n).
            const deg = degreeNode ? this.mathMlNodeToFormula(degreeNode).trim() : '';
            if (deg && deg !== '2') return `pow(${a[0]}, (1 / (${deg})))`;
            return `sqrt(${a[0]})`;
          }
          case 'log': {
            // Default base is 10; a <logbase> gives log_b(x) = ln(x)/ln(b).
            const base = logbaseNode ? this.mathMlNodeToFormula(logbaseNode).trim() : '';
            if (base && base !== '10') return `(ln(${a[0]}) / ln(${base}))`;
            return `log10(${a[0]})`;
          }
          case 'quotient':
            return a.length >= 2 ? `floor((${a[0]}) / (${a[1]}))` : a.join(', ');
          case 'rem':
            return a.length >= 2 ? `((${a[0]}) - (${a[1]}) * floor((${a[0]}) / (${a[1]})))` : a.join(', ');
          case 'factorial':
            this.recordWarning('mathml', '<factorial> used in math; emitted as factorial(x), which the engine may not support.', 'approximated');
            return `factorial(${a.join(', ')})`;
          case 'sec': return `(1 / cos(${a[0]}))`;
          case 'csc': return `(1 / sin(${a[0]}))`;
          case 'cot': return `(1 / tan(${a[0]}))`;
          case 'sech': return `(1 / cosh(${a[0]}))`;
          case 'csch': return `(1 / sinh(${a[0]}))`;
          case 'coth': return `(1 / tanh(${a[0]}))`;
          case 'eq':
          case 'neq':
          case 'gt':
          case 'lt':
          case 'geq':
          case 'leq':
          case 'and':
          case 'or':
          case 'xor':
          case 'not':
            return `${opName}(${a.join(', ')})`;
          case 'piecewise':
            return `piecewise(${a.join(', ')})`;
          default: {
            if (direct[opName]) return `${direct[opName]}(${a.join(', ')})`;
            const fallbackName = this.simpleXmlText(opNode) || opName;
            if (opName === 'gcd' || opName === 'lcm') {
              this.recordWarning('mathml', `<${opName}> used in math; the engine does not provide it. Emitted as ${opName}(...).`, 'approximated');
            }
            return fallbackName ? `${fallbackName}(${a.join(', ')})` : a.join(', ');
          }
        }
      }
      default:
        return firstChildExpr() || this.simpleXmlText(node);
    }
  }

  /** Pull the raw <math>...</math> block for a reaction's kinetic law from the source SBML. */
  private rawMathForKineticLaw(reactionId: string): string | null {
    if (!this.currentSbml || !reactionId) return null;
    const eid = reactionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rxnBlock = this.currentSbml.match(
      new RegExp(`<reaction\\b[^>]*\\bid\\s*=\\s*["']${eid}["'][\\s\\S]*?</reaction>`, 'i'));
    if (!rxnBlock) return null;
    const kl = rxnBlock[0].match(/<kineticLaw\b[\s\S]*?<\/kineticLaw>/i);
    const scope = kl ? kl[0] : rxnBlock[0];
    const math = scope.match(/<math\b[\s\S]*?<\/math>/i);
    return math ? math[0] : null;
  }

  /** Pull the raw <math>...</math> block for a rule (by variable, or first of its kind) from source. */
  private rawMathForRule(type: SBMLRule['type'], variable?: string): string | null {
    if (!this.currentSbml) return null;
    const tag = type === 'assignment' ? 'assignmentRule' : type === 'rate' ? 'rateRule' : 'algebraicRule';
    let block: RegExpMatchArray | null;
    if (variable) {
      const ev = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      block = this.currentSbml.match(
        new RegExp(`<${tag}\\b[^>]*\\bvariable\\s*=\\s*["']${ev}["'][\\s\\S]*?</${tag}>`, 'i'));
    } else {
      block = this.currentSbml.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'i'));
    }
    if (!block) return null;
    const math = block[0].match(/<math\b[\s\S]*?<\/math>/i);
    return math ? math[0] : null;
  }

  /** True if the MathML uses constructs the old L1 formula converter drops or mangles. */
  private mathHasLossyConstructs(mathXml: string | null): boolean {
    if (!mathXml) return false;
    return /<piecewise\b|<(?:lt|gt|leq|geq|eq|neq|and|or|not|xor)\b|definitionURL\s*=\s*["'][^"']*(?:delay|rateOf|avogadro)/i.test(mathXml);
  }

  private safeFormulaToString(math: any): string {
    if (!math) return '';

    // 1. Try built-in libsbml.formulaToString
    if (!this.nativeFormulaToStringDisabled) {
      try {
        if (typeof libsbml.formulaToString === 'function') {
          const s = libsbml.formulaToString(math);
          if (s) return s;
        }
      } catch (e) {
        if (isAbortLikeError(e)) {
          this.nativeFormulaToStringDisabled = true;
          logger.warning('SBM007', 'Disabled libsbml.formulaToString after abort-like failure; using AST fallback.');
        }
      }
    }

    // 2. Try object's toString (unless it's [object Object])
    if (typeof math.toString === 'function') {
      const s = math.toString();
      if (s && s !== '[object Object]') return s;
    }

    // 3. Manual AST Walker
    return this.astToString(math);
  }

  /**
   * Manual AST to string converter for SBML L3 math / MathML
   * implementing a recursive walker based on AST node types.
   */
  private astToString(node: any): string {
    if (!node) return '';

    const type = node.getType();
    const children: string[] = [];
    if (node.getNumChildren) {
      for (let i = 0; i < node.getNumChildren(); i++) {
        children.push(this.astToString(node.getChild(i)));
      }
    }

    // AST Node Type Constants (mapped from runtime discovery)
    // Operators
    if (type === 43) return `(${children.join(' + ')})`; // AST_PLUS
    if (type === 45) { // AST_MINUS
      if (children.length === 1) return `-${children[0]}`;
      return `(${children.join(' - ')})`;
    }
    if (type === 42) return `(${children.join(' * ')})`; // AST_TIMES
    if (type === 47) return `(${children.join(' / ')})`; // AST_DIVIDE
    if (type === 94) return `(${children[0]}^${children[1]})`; // AST_POWER (using ^ for BNGL compatibility if possible, or pow)

    // Numbers & Leaves
    if (type === 256) return node.getInteger().toString(); // AST_INTEGER
    if (type === 257 || type === 258) return node.getReal().toString(); // AST_REAL, AST_REAL_E
    if (type === 260) return node.getName(); // AST_NAME
    if (type === 262) return 'time'; // AST_NAME_TIME

    // Functions
    if (type === 268 || type === 400 || (type >= 269 && type <= 303)) { // AST_FUNCTION & variants
      const name = node.getName();
      return `${name}(${children.join(', ')})`;
    }

    // Logical & Relational
    if (type === 308) return `(${children.join(' == ')})`; // AST_RELATIONAL_EQ
    if (type === 310) return `(${children.join(' > ')})`;  // AST_RELATIONAL_GT
    if (type === 312) return `(${children.join(' < ')})`;  // AST_RELATIONAL_LT
    if (type === 309) return `(${children.join(' >= ')})`; // AST_RELATIONAL_GEQ
    if (type === 311) return `(${children.join(' <= ')})`; // AST_RELATIONAL_LEQ
    if (type === 313) return `(${children.join(' != ')})`; // AST_RELATIONAL_NEQ

    if (type === 304) return `(${children.join(' && ')})`; // AST_LOGICAL_AND
    if (type === 306) return `(${children.join(' || ')})`; // AST_LOGICAL_OR
    if (type === 305) return `!(${children[0]})`;         // AST_LOGICAL_NOT

    // Lambda: emit only the body (last child); earlier children are bound-variable declarations.
    if (typeof node.isLambda === 'function' && node.isLambda()) {
      return children.length ? children[children.length - 1] : '';
    }

    // Math constants and csymbols, matched by name so we don't depend on build-specific type ints.
    const rawName = typeof node.getName === 'function' ? (node.getName() || '') : '';
    const lowered = rawName.toLowerCase();
    if (children.length === 0) {
      if (lowered === 'pi') return 'PI';
      if (lowered === 'exponentiale') return 'exp(1)';
      if (lowered === 'true') return '1';
      if (lowered === 'false') return '0';
      if (lowered === 'avogadro') return 'Na';
      if (typeof node.isConstant === 'function' && node.isConstant() && rawName) return rawName;
    }

    // Fallback for names if type check failed or unknown (e.g. sometimes vars are just names)
    if (node.isName && node.isName()) return node.getName();
    if (node.isNumber && node.isNumber()) {
      if (node.isInteger()) return node.getInteger().toString();
      return node.getReal().toString();
    }

    // A node with children but no matched operator is almost certainly an unrecognized function
    // (piecewise, delay, rateOf, factorial, ...). Emit name(args) rather than dropping it silently.
    if (children.length > 0) {
      if (rawName) return `${rawName}(${children.join(', ')})`;
      this.recordWarning('mathml',
        'AST fallback hit an unnamed function-like node; emitted arguments only. Verify the affected expression.',
        'approximated');
      return `(${children.join(', ')})`;
    }

    // Last resort: name
    if (rawName) return rawName;

    return '';
  }

  private extractReaction(rxn: any): SBMLReaction {
    const reactionId = typeof rxn.getId === 'function' ? rxn.getId() : '';

    const extractSpeciesRef = (ref: any): SBMLSpeciesReference => {
      const refId = typeof ref.getId === 'function' ? (ref.getId() || '') : '';
      // getStoichiometry() returns 1 for an unset attribute, so we cannot use `|| 1` (that would
      // clobber a legitimate 0). Detect presence from the raw element and keep the exact value.
      const rawStoich = typeof ref.getStoichiometry === 'function' ? ref.getStoichiometry() : NaN;
      const refAttrs = refId ? this.rawElementAttrs('speciesReference', refId) : '';
      const stoichSet = this.rawHasAttr(refAttrs, 'stoichiometry');
      let stoichiometry = Number.isFinite(rawStoich) && (stoichSet || rawStoich !== 1) ? rawStoich : 1;

      // L2v1 rational stoichiometry: stoichiometry / denominator.
      const denomAttr = this.getXmlAttribute(refAttrs, 'denominator');
      const denom = denomAttr !== null ? Number(denomAttr) : NaN;
      if (Number.isFinite(denom) && denom !== 0 && denom !== 1) {
        stoichiometry = stoichiometry / denom;
      }

      const isConstant = typeof ref.getConstant === 'function' ? ref.getConstant() : true;
      // Non-constant stoichiometry, or an L2 <stoichiometryMath> child, means the coefficient can
      // change over time. BNGL has no representation for that; record it so it is not silently lost.
      const hasStoichMath = /<stoichiometryMath\b/i.test(refAttrs) ||
        (refId ? new RegExp(`<speciesReference\\b[^>]*\\bid\\s*=\\s*["']${refId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?<stoichiometryMath`, 'i').test(this.currentSbml) : false);
      const variableStoichiometry = (isConstant === false) || hasStoichMath;
      if (variableStoichiometry) {
        this.recordWarning('stoichiometry',
          `Reaction "${reactionId}" has variable/StoichiometryMath stoichiometry on species "${ref.getSpecies()}"; BNGL cannot represent this, treated as fixed value ${stoichiometry}.`,
          'approximated');
      }
      const rounded = Math.round(stoichiometry);
      if (Math.abs(rounded - stoichiometry) > 1e-9) {
        this.recordWarning('stoichiometry',
          `Reaction "${reactionId}" has non-integer stoichiometry ${stoichiometry} on species "${ref.getSpecies()}"; BNGL requires integers.`,
          'approximated');
      }

      return {
        species: ref.getSpecies(),
        stoichiometry,
        constant: isConstant,
        id: refId || undefined,
        stoichiometrySet: stoichSet,
        variableStoichiometry: variableStoichiometry || undefined,
      };
    };

    const reactants: SBMLSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumReactants(); i++) {
      reactants.push(extractSpeciesRef(rxn.getReactant(i)));
    }

    const products: SBMLSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumProducts(); i++) {
      products.push(extractSpeciesRef(rxn.getProduct(i)));
    }

    const modifiers: SBMLModifierSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumModifiers(); i++) {
      const ref = rxn.getModifier(i);
      modifiers.push({
        species: ref.getSpecies(),
      });
    }

    let kineticLaw: SBMLKineticLaw | null = null;
    let localAliases: Map<string, string> | undefined;
    let localParams: SBMLParameter[] = [];
    let kl: any;
    try {
      kl = rxn.getKineticLaw();
    } catch {
      kl = null;
    }
    if (kl && (typeof kl.ptr === 'undefined' || kl.ptr !== 0)) {
      localParams = [];
      localAliases = new Map<string, string>();

      let numParams: number;
      try {
        numParams = kl.getNumLocalParameters?.() ?? kl.getNumParameters?.() ?? 0;
      } catch {
        numParams = 0;
      }
      for (let i = 0; i < numParams; i++) {
        let param: any;
        try {
          param = kl.getLocalParameter?.(i) ?? kl.getParameter?.(i);
        } catch {
          param = null;
        }
        if (param) {
          try {
            const localParam = this.extractParameter(param, 'local');
            if (localAliases.has(localParam.id)) {
              localParam.id = `${localParam.id}_${i + 1}`;
            }
            localParams.push(localParam);
            this.registerAlias(localAliases, localParam.id, localParam.id);
            this.registerAlias(localAliases, localParam.name, localParam.id);
          } catch {
            // Ignore malformed local parameter entries and keep parsing reaction.
          }
        }
      }

      let mathExpr = '';
      let mathML = '';
      let math: any = null;

      if (typeof kl.getFormula === 'function') {
        try {
          mathExpr = kl.getFormula() || '';
        } catch {
          mathExpr = '';
        }
      }

      if (!mathExpr && typeof kl.getMath === 'function') {
        try {
          math = kl.getMath();
        } catch {
          math = null;
        }
      }
      if (math && !mathExpr) {
        try {
          mathExpr = this.safeFormulaToString(math);
        } catch {
          mathExpr = '';
        }
      }
      if (!mathExpr) {
        const fallbackFormula = this.getFallbackKineticLawFormula(reactionId);
        if (fallbackFormula) {
          mathExpr = fallbackFormula;
        }
      }

      // The bundled build only has the L1 formulaToString, which silently drops piecewise,
      // relational, logical, and csymbol (delay/rateOf/avogadro) math. When the source MathML
      // uses any of those, re-derive from the raw <math> via the full MathML reader instead.
      const rawKlMath = this.rawMathForKineticLaw(reactionId);
      if (this.mathHasLossyConstructs(rawKlMath)) {
        const fromMathMl = this.mathMlToFormula(rawKlMath!);
        if (fromMathMl && fromMathMl.trim()) {
          mathExpr = fromMathMl;
          this.recordWarning('mathml',
            `Kinetic law for reaction "${reactionId}" uses piecewise/relational/logical/csymbol math; parsed from MathML directly because the L1 converter is lossy for these.`,
            'info');
        }
      }

      mathExpr = this.sanitizeMathExpression(this.normalizeFormulaIdentifiers(mathExpr, localAliases));

      if (math && typeof (math as any).toMathML === 'function') {
        try {
          mathML = (math as any).toMathML() || '';
        } catch {
          mathML = '';
        }
      }

      kineticLaw = {
        math: mathExpr,
        mathML: mathML,
        localParameters: localParams,
      };
    }

    if (!kineticLaw || !kineticLaw.math || kineticLaw.math.trim().length === 0) {
      const fallbackFormula = this.getFallbackKineticLawFormula(reactionId);
      if (fallbackFormula) {
        kineticLaw = {
          math: this.sanitizeMathExpression(this.normalizeFormulaIdentifiers(fallbackFormula, localAliases)),
          mathML: kineticLaw?.mathML || '',
          localParameters: kineticLaw?.localParameters || localParams,
        };
      }
    }

    const fast = rxn.getFast?.() || false;
    if (fast) {
      this.recordWarning('fastReaction',
        `Reaction "${reactionId}" is marked fast (fast="true"); BNGL/BNG has no fast-equilibrium solve, so it is treated as an ordinary reaction.`,
        'approximated');
    }

    const rxnAttrs = this.rawElementAttrs('reaction', reactionId);
    const convFactor = this.getXmlAttribute(rxnAttrs, 'conversionFactor') || undefined;
    if (convFactor) {
      this.recordWarning('conversionFactor',
        `Reaction "${reactionId}" declares conversionFactor="${convFactor}"; captured but not yet applied to the rate law.`,
        'approximated');
    }

    return {
      id: reactionId,
      name: rxn.getName() || reactionId,
      reversible: rxn.getReversible(),
      fast,
      reactants,
      products,
      modifiers,
      kineticLaw,
      compartment: typeof rxn.getCompartment === 'function' ? rxn.getCompartment() : undefined,
      conversionFactor: convFactor,
    };
  }

  private extractRule(rule: any): SBMLRule | null {
    const ruleType: SBMLRule['type'] | null = rule.isAlgebraic()
      ? 'algebraic'
      : rule.isAssignment()
        ? 'assignment'
        : rule.isRate()
          ? 'rate'
          : null;
    if (!ruleType) return null;
    const variable = ruleType === 'algebraic'
      ? undefined
      : (typeof rule.getVariable === 'function' ? rule.getVariable() : undefined);

    let formula = '';

    // Some generated SBML may encode rule formulas in the formula attribute.
    // Prefer getFormula() first to avoid aborts when getMath() is unavailable/invalid.
    try {
      if (typeof rule.getFormula === 'function') {
        const raw = rule.getFormula();
        if (typeof raw === 'string' && raw.trim().length > 0) {
          formula = raw.trim();
        }
      }
    } catch {
      // Fall through to getMath fallback.
    }

    if (!formula) {
      try {
        const math = typeof rule.getMath === 'function' ? rule.getMath() : null;
        formula = math ? this.safeFormulaToString(math) : '';
      } catch {
        formula = '';
      }
    }
    formula = this.sanitizeMathExpression(formula);
    if (!formula) {
      const fallbackFormula = this.getFallbackRuleFormula(ruleType, variable);
      if (fallbackFormula) {
        formula = fallbackFormula;
      }
    }

    // Same lossy-math guard as kinetic laws (see extractReaction).
    const rawRuleMath = this.rawMathForRule(ruleType, variable);
    if (this.mathHasLossyConstructs(rawRuleMath)) {
      const fromMathMl = this.mathMlToFormula(rawRuleMath!);
      if (fromMathMl && fromMathMl.trim()) {
        formula = fromMathMl;
        this.recordWarning('mathml',
          `${ruleType} rule${variable ? ` for "${variable}"` : ''} uses piecewise/relational/logical/csymbol math; parsed from MathML directly.`,
          'info');
      }
    }

    formula = this.sanitizeMathExpression(this.normalizeFormulaIdentifiers(formula));

    if (ruleType === 'algebraic') {
      return {
        type: 'algebraic',
        math: formula,
      };
    } else if (ruleType === 'assignment') {
      return {
        type: 'assignment',
        variable: variable || '',
        math: formula,
      };
    } else if (ruleType === 'rate') {
      return {
        type: 'rate',
        variable: variable || '',
        math: formula,
      };
    }

    return null;
  }

  private extractFunctionDefinition(func: any): SBMLFunctionDefinition {
    const args: string[] = [];
    for (let i = 0; i < func.getNumArguments(); i++) {
      // Safe check for getArgument return
      const arg = func.getArgument(i);
      // Sometimes arguments are ASTNodes, sometimes they are parameters with names
      // Check if arg has getName, otherwise use formulaToString
      let name = `arg${i}`;
      if (arg) {
        if (typeof arg.getName === 'function') {
          name = arg.getName();
        } else {
          name = this.safeFormulaToString(arg);
        }
      }
      args.push(name);
    }

    // Try getBody() first (standard SBML with <lambda>), fall back to getMath() (BNG-XML without <lambda>)
    let mathStr = '';
    let body: any;
    try {
      body = func.getBody();
    } catch {
      body = null;
    }
    if (body) {
      mathStr = this.safeFormulaToString(body);
    } else {
      // BNG-XML format: use getMath() directly, skipping <lambda> wrapper if present
      let math: any;
      try {
        math = func.getMath();
      } catch {
        math = null;
      }
      if (math) {
        const mathStrRaw = this.safeFormulaToString(math);
        // If the result looks like it's wrapped in lambda (starts with lambda or has bvar),
        // we need to extract just the body
        if (/^lambda\s*\(/i.test(mathStrRaw) || /\bbvar\b/i.test(mathStrRaw)) {
          // Extract content inside lambda(...), skipping bvar declarations
          const lambdaMatch = mathStrRaw.match(/lambda\s*\(\s*(?:[^)]*?\bbvar\b[^)]*,?\s*)*(.+)\s*\)/is);
          if (lambdaMatch) {
            mathStr = lambdaMatch[1].trim();
          } else {
            mathStr = mathStrRaw;
          }
        } else {
          mathStr = mathStrRaw;
        }
      }
    }
    mathStr = this.sanitizeMathExpression(this.normalizeFormulaIdentifiers(mathStr));

    return {
      id: func.getId(),
      name: func.getName() || func.getId(),
      math: mathStr,
      arguments: args,
    };
  }

  private extractEvent(event: any): SBMLEvent | null {
    const trigger = event.getTrigger();
    const triggerMath = trigger?.getMath();
    const delay = event.getDelay();
    const delayMath = delay?.getMath();

    const assignments: Array<{ variable: string; math: string }> = [];
    for (let i = 0; i < event.getNumEventAssignments(); i++) {
      const ea = event.getEventAssignment(i);
      const math = ea.getMath();
      assignments.push({
        variable: ea.getVariable(),
        math: math ? this.normalizeFormulaIdentifiers(this.safeFormulaToString(math)) : '',
      });
    }

    // L3 trigger attributes (initialValue, persistent) and event priority are absent from the
    // reduced build's API, so read them from the raw <trigger>/<priority> tags.
    const eventId = event.getId();
    const eventBlock = eventId
      ? (this.currentSbml.match(new RegExp(`<event\\b[^>]*\\bid\\s*=\\s*["']${eventId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?</event>`, 'i'))?.[0] || '')
      : '';
    const triggerTag = eventBlock.match(/<trigger\b[^>]*>/i)?.[0] || '';
    const initValAttr = this.getXmlAttribute(triggerTag, 'initialValue');
    const persistAttr = this.getXmlAttribute(triggerTag, 'persistent');
    const priorityMath = eventBlock.match(/<priority\b[\s\S]*?<math\b[\s\S]*?<\/math>[\s\S]*?<\/priority>/i)?.[0] || '';

    return {
      id: eventId,
      name: event.getName() || eventId,
      trigger: triggerMath ? this.normalizeFormulaIdentifiers(this.safeFormulaToString(triggerMath)) : '',
      delay: delayMath ? this.normalizeFormulaIdentifiers(this.safeFormulaToString(delayMath)) : undefined,
      useValuesFromTriggerTime: event.getUseValuesFromTriggerTime?.() || true,
      assignments,
      triggerInitialValue: initValAttr === null ? undefined : /true|1/i.test(initValAttr),
      triggerPersistent: persistAttr === null ? undefined : /true|1/i.test(persistAttr),
      priority: priorityMath ? this.mathMlToFormula(priorityMath) : undefined,
    };
  }

  private extractInitialAssignment(ia: any): SBMLInitialAssignment | null {
    const math = ia.getMath();
    if (!math) return null;

    return {
      symbol: ia.getSymbol(),
      math: this.normalizeFormulaIdentifiers(this.safeFormulaToString(math)),
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get annotations by qualifier type
 */
export function getAnnotationsByQualifier(
  annotations: AnnotationInfo[],
  qualifier: BiologicalQualifier | ModelQualifier,
  isBiological: boolean = true
): string[] {
  const results: string[] = [];

  for (const ann of annotations) {
    if (isBiological && ann.qualifierType === 1 && ann.biologicalQualifier === qualifier) {
      results.push(...ann.resources);
    } else if (!isBiological && ann.qualifierType === 0 && ann.modelQualifier === qualifier) {
      results.push(...ann.resources);
    }
  }

  return results;
}

/**
 * Extract UniProt IDs from annotation resources
 */
export function extractUniProtIds(resources: string[]): string[] {
  const uniprotIds: string[] = [];

  for (const resource of resources) {
    const match = resource.match(/uniprot[:/]([A-Z0-9]+)/i);
    if (match) {
      uniprotIds.push(match[1]);
    }
  }

  return uniprotIds;
}

/**
 * Extract GO terms from annotation resources
 */
export function extractGOTerms(resources: string[]): string[] {
  const goTerms: string[] = [];

  for (const resource of resources) {
    const match = resource.match(/GO[:/](\d+)/i);
    if (match) {
      goTerms.push(`GO:${match[1]}`);
    }
  }

  return goTerms;
}
