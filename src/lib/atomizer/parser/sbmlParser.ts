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
} from '../config/types';
import { standardizeName, logger, factorial, comb } from '../utils/helpers';
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
  private speciesDictionary: Map<string, string>;

  constructor(model: any) {
    this.model = model;
    this.unitDictionary = new Map();
    this.moleculeData = new Map();
    this.speciesDictionary = new Map();
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
    parameters.set(idx++, { name: 'Rc', value: '0.0015', unit: 'um', type: '' });

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
          const [outside, inside] = this.getOutsideInsideCompartment(compartmentList, compartment);
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
          const [outside, inside] = this.getOutsideInsideCompartment(compartmentList, compartment);
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

      if (remainderPatterns.includes(leftFormula)) {
        const idx = remainderPatterns.indexOf(leftFormula);
        remainderPatterns.splice(idx, 1);
        math = math.getRightChild();
      } else if (remainderPatterns.includes(rightFormula)) {
        const idx = remainderPatterns.indexOf(rightFormula);
        remainderPatterns.splice(idx, 1);
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
    for (const [key, param] of parameters) {
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

  /**
   * Initialize the parser by loading libsbmljs
   */
  async initialize(): Promise<void> {
    if (this.initialized && libsbml) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        console.log('[SBMLParser] Dynamic import of libsbmljs_stable ...');
        const libsbmlModule = await import('libsbmljs_stable');
        console.log('[SBMLParser] Import complete.');

        const factory = libsbmlModule.default || libsbmlModule.libsbml || libsbmlModule;
        if (typeof factory !== 'function') {
          throw new Error(`libsbmljs export is not a function: ${typeof factory}`);
        }

        await new Promise<void>((res, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('libsbmljs initialization timed out (30s)'));
          }, 30000);

          const config = {
            locateFile: (file: string) => {
              console.log(`[SBMLParser] locateFile: ${file}`);
              if (file.endsWith('.wasm')) {
                // Node environment: prefer the local public asset via file URL
                if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                  try {
                    // For Node environment, use a simple string path
                    return './public/libsbml.wasm';
                  } catch (e) {
                    console.warn('[SBMLParser] Failed to locate libsbml.wasm via resolve:', e);
                    // fall back to bundled path
                    return '/bngplayground/libsbml.wasm';
                  }
                }

                // Browser default
                return '/bngplayground/libsbml.wasm';
              }

              if (file.endsWith('.wast') || file.endsWith('.asm.js')) {
                return 'data:application/octet-stream;base64,';
              }
              return file;
            },
            TOTAL_MEMORY: 128 * 1024 * 1024,
            print: (text: string) => console.log(`[libsbml] ${text}`),
            printErr: (text: string) => console.warn(`[libsbml-err] ${text}`),
            onRuntimeInitialized: () => {
              console.log('[SBMLParser] onRuntimeInitialized');
              clearTimeout(timeoutId);
              
              // If libsbml wasn't set by the Thenable yet, it might be available in 'this' or global
              if (!libsbml && (typeof (self as any).readSBMLFromString === 'function' || (self as any).SBMLReader)) {
                libsbml = self;
              }

              if (libsbml && (typeof libsbml.readSBMLFromString === 'function' || libsbml.SBMLReader)) {
                console.log('[SBMLParser] libsbml ready via onRuntimeInitialized');
                res();
              } else {
                console.log('[SBMLParser] waiting for Thenable to set libsbml...');
                // We don't resolve yet, wait for the factory promise
              }
            },
            onAbort: (msg: any) => {
              console.error('[SBMLParser] Aborted:', msg);
              clearTimeout(timeoutId);
              reject(new Error(`libsbmljs aborted: ${msg}`));
            },
            noInitialRun: true
          };

          console.log('[SBMLParser] Calling factory...');
          try {
            const result = factory.call(self, config);

            if (result && typeof result.then === 'function') {
              console.log('[SBMLParser] Factory returned Thenable, awaiting...');
              result.then(
                (instance: any) => {
                  console.log('[SBMLParser] Thenable resolved. Instance type:', typeof instance);
                  // Only set libsbml if instance is actually valid
                  if (instance && (typeof instance.SBMLReader === 'function' || typeof instance.readSBMLFromString === 'function')) {
                    libsbml = instance;
                    console.log('[SBMLParser] libsbml ready via Thenable. SBMLReader type:', typeof libsbml.SBMLReader);
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
              console.log('[SBMLParser] Factory returned immediate result. SBMLReader type:', typeof (result as any)?.SBMLReader);
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
        throw new Error(`Failed to initialize SBML parser: ${error}`);
      }
    })();

    return initPromise;
  }

  /**
   * Parse SBML string and extract model data
   */
  async parse(sbmlString: string): Promise<SBMLModel> {
    const start = performance.now();
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

    if (typeof self !== 'undefined' && (self as any).postMessage) {
      (self as any).postMessage({ type: 'debug_heartbeat', payload: 'BEFORE_READ_SBML' });
    }

    console.log(`!!! [SBMLParser] _parseInternal: Length: ${sbmlString.length}`);
    this.currentSbml = sbmlString;
    console.log(`!!! [SBMLParser] SBML Snippet: ${sbmlString.substring(0, 200)}`);
    let document: any;
    let reader: any;
    try {
      reader = new libsbml.SBMLReader();
      document = reader.readSBMLFromString(sbmlString);

      if (typeof self !== 'undefined' && (self as any).postMessage) {
        (self as any).postMessage({ type: 'debug_heartbeat', payload: 'AFTER_READ_SBML' });
      }
      console.log('!!! [SBMLParser] AFTER readSBMLFromString');
      if (document) {
        console.log(`!!! [SBMLParser] document pointer: ${document.ptr}`);
        console.log(`!!! [SBMLParser] document.getNumErrors: ${typeof document.getNumErrors}`);
        if (typeof document.getNumErrors === 'function') {
          console.log(`!!! [SBMLParser] numErrors: ${document.getNumErrors()}`);
        }
        if (typeof document.getLevel === 'function') {
          console.log(`!!! [SBMLParser] Level: ${document.getLevel()}, Version: ${document.getVersion()}`);
        }
      }
    } catch (e) {
      console.error('!!! [SBMLParser] readSBMLFromString threw error:', e);
      throw e;
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

      console.log('!!! [SBMLParser] Calling getModel()');
      const model = typeof document.getModel === 'function' ? document.getModel() : null;
      console.log(`!!! [SBMLParser] getModel result: ${model ? 'object' : 'null'}`);
      if (model && typeof model.ptr !== 'undefined') {
        console.log(`!!! [SBMLParser] model pointer: ${model.ptr}`);
      }

      if (!model || model.ptr === 0) {
        console.error('[SBMLParser] document.getModel() returned null or NULL pointer (0)');
        throw new Error('SBML document contains no model or model pointer is NULL (0)');
      }

      console.log('!!! [SBMLParser] Calling extractModel()');
      const extractedModel = this.extractModel(model);
      console.log(`[SBMLParser] Total parse time: ${(performance.now() - start).toFixed(2)}ms`);
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
    console.log('!!! [SBMLParser] extractModel: Entered');
    if (model) {
      console.log(`!!! [SBMLParser] model pointer: ${model.ptr}`);
      console.log(`!!! [SBMLParser] model keys: ${Object.keys(model).filter(k => !k.startsWith('_')).join(', ')}`);
    }

    console.log('!!! [SBMLParser] extractModel: Calling model.getId()');
    const modelId = (typeof model.getId === 'function') ? model.getId() : 'unnamed_model';
    console.log(`!!! [SBMLParser] modelId: ${modelId}`);

    console.log('!!! [SBMLParser] extractModel: Calling model.getName()');
    const modelName = (typeof model.getName === 'function') ? model.getName() : (modelId || 'Unnamed Model');
    console.log(`!!! [SBMLParser] modelName: ${modelName}`);

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
    };

    // Extract compartments
    console.log('!!! [SBMLParser] extractModel: getNumCompartments');
    const numComps = model.getNumCompartments();
    console.log(`!!! [SBMLParser] Extracting ${numComps} compartments...`);
    let t = performance.now();
    for (let i = 0; i < model.getNumCompartments(); i++) {
      const compRaw = model.getCompartment(i);
      if (!compRaw) continue;
      const comp = this.extractCompartment(compRaw);
      result.compartments.set(comp.id, comp);
    }
    const compTime = performance.now() - t;

    // Extract species
    console.log('!!! [SBMLParser] extractModel: getNumSpecies');
    const numSpecies = model.getNumSpecies();
    console.log(`!!! [SBMLParser] Extracting ${numSpecies} species...`);
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
    console.log('!!! [SBMLParser] extractModel: getNumParameters');
    const numParams = model.getNumParameters();
    console.log(`!!! [SBMLParser] Extracting ${numParams} parameters...`);
    t = performance.now();
    for (let i = 0; i < model.getNumParameters(); i++) {
      const paramRaw = model.getParameter(i);
      if (!paramRaw) continue;
      const param = this.extractParameter(paramRaw, 'global');
      result.parameters.set(param.id, param);
    }
    const paramTime = performance.now() - t;

    // Extract reactions
    console.log('!!! [SBMLParser] extractModel: getNumReactions');
    const numRxns = model.getNumReactions();
    console.log(`!!! [SBMLParser] Extracting ${numRxns} reactions...`);
    t = performance.now();
    for (let i = 0; i < model.getNumReactions(); i++) {
      const rxnRaw = model.getReaction(i);
      if (!rxnRaw) continue;
      const rxn = this.extractReaction(rxnRaw);
      result.reactions.set(rxn.id, rxn);
    }
    const rxnTime = performance.now() - t;

    // Extract rules/functions/events
    console.log('[SBMLParser] Extracting rules/functions/events...');
    t = performance.now();
    for (let i = 0; i < model.getNumFunctionDefinitions(); i++) {
      const func = this.extractFunctionDefinition(model.getFunctionDefinition(i));
      result.functionDefinitions.set(func.id, func);
    }

    // Extract rules
    for (let i = 0; i < model.getNumRules(); i++) {
      const rule = this.extractRule(model.getRule(i));
      if (rule) {
        result.rules.push(rule);
      }
    }

    for (let i = 0; i < model.getNumEvents(); i++) {
      const event = this.extractEvent(model.getEvent(i));
      if (event) result.events.push(event);
    }
    for (let i = 0; i < model.getNumInitialAssignments(); i++) {
      const ia = this.extractInitialAssignment(model.getInitialAssignment(i));
      if (ia) result.initialAssignments.push(ia);
    }

    // Extract Unit Definitions
    for (let i = 0; i < model.getNumUnitDefinitions(); i++) {
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
    }
    const otherTime = performance.now() - t;

    console.log(`[SBMLParser] extractModel breakdown:
      Compartments: ${compTime.toFixed(2)}ms
      Species: ${speciesTime.toFixed(2)}ms
      Parameters: ${paramTime.toFixed(2)}ms
      Reactions: ${rxnTime.toFixed(2)}ms
      Other: ${otherTime.toFixed(2)}ms
      Total: ${(performance.now() - start).toFixed(2)}ms`);

    logger.info('SBM004',
      `Parsed SBML model: ${result.species.size} species, ${result.reactions.size} reactions`);

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

    return {
      id: comp.getId(),
      name: comp.getName() || comp.getId(),
      spatialDimensions: typeof comp.getSpatialDimensions === 'function' ? comp.getSpatialDimensions() : 3,
      size: typeof comp.getSize === 'function' ? comp.getSize() : 1,
      units: typeof comp.getUnits === 'function' ? comp.getUnits() : '',
      constant: typeof comp.getConstant === 'function' ? comp.getConstant() : true,
      outside: outside || (isSetO ? comp.getOutside() : (getAttrO || (typeof comp.getOutside === 'function' ? (comp.getOutside() || undefined) : undefined))),
    };
  }

  private extractSpecies(sp: any): SBMLSpecies {
    console.log(`!!! [SBMLParser] extractSpecies: ${sp.getId ? sp.getId() : 'unknown'}`);
    const name = typeof sp.getName === 'function' ? (sp.getName() || '') : '';
    const attrName = typeof sp.getAttributeValue === 'function' ? (sp.getAttributeValue('name') || '') : '';
    const finalName = name || attrName || sp.getId();
    
    const hasInitialAmount = typeof sp.getInitialAmount === 'function' && (sp.getInitialAmount() || 0) > 0;
    const hasInitialConcentration = typeof sp.getInitialConcentration === 'function' && (sp.getInitialConcentration() || 0) > 0;
    
    // Only use explicit hasOnlySubstanceUnits attribute from SBML.
    // Inferred logic based on non-zero initialAmount was incorrect for mixed-unit systems.
    const hasOnlySubstanceUnits = typeof sp.getHasOnlySubstanceUnits === 'function' ? sp.getHasOnlySubstanceUnits() : false;
    
    return {
      id: sp.getId(),
      name: finalName,
      compartment: sp.getCompartment(),
      initialConcentration: hasInitialConcentration ? (sp.getInitialConcentration() || 0) : 0,
      initialAmount: hasInitialAmount ? (sp.getInitialAmount() || 0) : 0,
      substanceUnits: typeof sp.getSubstanceUnits === 'function' ? (sp.getSubstanceUnits() || '') : '',
      hasOnlySubstanceUnits,
      boundaryCondition: typeof sp.getBoundaryCondition === 'function' ? sp.getBoundaryCondition() : false,
      constant: typeof sp.getConstant === 'function' ? sp.getConstant() : false,
      annotations: this.extractAnnotations(sp),
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
    return {
      id: param.getId(),
      name: param.getName() || param.getId(),
      value: param.getValue() || 0,
      units: param.getUnits() || '',
      constant: param.getConstant(),
      scope,
    };
  }

  private safeFormulaToString(math: any): string {
    if (!math) return '';

    // 1. Try built-in libsbml.formulaToString
    try {
      if (typeof libsbml.formulaToString === 'function') {
        const s = libsbml.formulaToString(math);
        if (s) return s;
      }
    } catch (e) { /* ignore */ }

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

    // Fallback for names if type check failed or unknown (e.g. sometimes vars are just names)
    if (node.isName && node.isName()) return node.getName();
    if (node.isNumber && node.isNumber()) {
      if (node.isInteger()) return node.getInteger().toString();
      return node.getReal().toString();
    }

    // Last resort: name
    const fallbackName = node.getName();
    if (fallbackName) return fallbackName;

    return '';
  }

  private extractReaction(rxn: any): SBMLReaction {
    const reactants: SBMLSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumReactants(); i++) {
      const ref = rxn.getReactant(i);
      reactants.push({
        species: ref.getSpecies(),
        stoichiometry: ref.getStoichiometry() || 1,
        constant: ref.getConstant(),
      });
    }

    const products: SBMLSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumProducts(); i++) {
      const ref = rxn.getProduct(i);
      products.push({
        species: ref.getSpecies(),
        stoichiometry: ref.getStoichiometry() || 1,
        constant: ref.getConstant(),
      });
    }

    const modifiers: SBMLModifierSpeciesReference[] = [];
    for (let i = 0; i < rxn.getNumModifiers(); i++) {
      const ref = rxn.getModifier(i);
      modifiers.push({
        species: ref.getSpecies(),
      });
    }

    let kineticLaw: SBMLKineticLaw | null = null;
    const kl = rxn.getKineticLaw();
    if (kl && (typeof kl.ptr === 'undefined' || kl.ptr !== 0)) {
      const localParams: SBMLParameter[] = [];

      const numParams = kl.getNumLocalParameters?.() ?? kl.getNumParameters?.() ?? 0;
      for (let i = 0; i < numParams; i++) {
        const param = kl.getLocalParameter?.(i) ?? kl.getParameter?.(i);
        if (param) {
          localParams.push(this.extractParameter(param, 'local'));
        }
      }

      const math = kl.getMath();
      let mathExpr = '';
      let mathML = '';

      if (typeof kl.getFormula === 'function') {
        mathExpr = kl.getFormula() || '';
      }

      if (math && !mathExpr) {
        mathExpr = this.safeFormulaToString(math);
      }

      if (math && typeof (math as any).toMathML === 'function') {
        mathML = (math as any).toMathML() || '';
      }

      kineticLaw = {
        math: mathExpr,
        mathML: mathML,
        localParameters: localParams,
      };
    }

    return {
      id: rxn.getId(),
      name: rxn.getName() || rxn.getId(),
      reversible: rxn.getReversible(),
      fast: rxn.getFast?.() || false,
      reactants,
      products,
      modifiers,
      kineticLaw,
      compartment: typeof rxn.getCompartment === 'function' ? rxn.getCompartment() : undefined,
    };
  }

  private extractRule(rule: any): SBMLRule | null {
    const math = rule.getMath();
    const formula = rule.getFormula() || (math ? this.safeFormulaToString(math) : '');

    if (rule.isAlgebraic()) {
      return {
        type: 'algebraic',
        math: formula,
      };
    } else if (rule.isAssignment()) {
      return {
        type: 'assignment',
        variable: rule.getVariable(),
        math: formula,
      };
    } else if (rule.isRate()) {
      return {
        type: 'rate',
        variable: rule.getVariable(),
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
    let body = func.getBody();
    let mathStr = '';
    if (body) {
      mathStr = this.safeFormulaToString(body);
    } else {
      // BNG-XML format: use getMath() directly, skipping <lambda> wrapper if present
      const math = func.getMath();
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
        math: math ? this.safeFormulaToString(math) : '',
      });
    }

    return {
      id: event.getId(),
      name: event.getName() || event.getId(),
      trigger: triggerMath ? this.safeFormulaToString(triggerMath) : '',
      delay: delayMath ? this.safeFormulaToString(delayMath) : undefined,
      useValuesFromTriggerTime: event.getUseValuesFromTriggerTime?.() || true,
      assignments,
    };
  }

  private extractInitialAssignment(ia: any): SBMLInitialAssignment | null {
    const math = ia.getMath();
    if (!math) return null;

    return {
      symbol: ia.getSymbol(),
      math: this.safeFormulaToString(math),
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
