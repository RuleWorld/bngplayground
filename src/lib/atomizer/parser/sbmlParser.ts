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

// Global libsbml module reference
let libsbml: any = null;

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
    
    // Add standard parameters
    parameters.set(1, {
      name: 'Nav',
      value: '6.022e8',
      unit: '',
      type: 'Avogadro number for 1 um^3'
    });

    let idx = 2;
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
        }
        if (parameter.getUnits().includes('mole') && !parameter.getUnits().includes('per_mole')) {
          parameterSpecs.value *= 6.022e8;
          parameterSpecs.unit = `${parameterSpecs.unit}*avo.num`;
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
      if (initialConcentration === 0) {
        initialConcentration = species.getInitialAmount();
      }

      // Apply unit conversions
      const substanceUnits = species.getSubstanceUnits();
      if (this.unitDictionary.has(substanceUnits)) {
        const factors = this.unitDictionary.get(substanceUnits)!;
        for (const factor of factors) {
          initialConcentration *= Math.pow(10, factor[1] * factor[2]);
        }
        if (substanceUnits.includes('mole')) {
          initialConcentration /= 6.022e8;
        }
      }
      if (substanceUnits === '') {
        initialConcentration /= 6.022e8;
      }

      if (initialConcentration !== 0 && compData) {
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
          param.value *= 6.022e8;
          param.unit = 'Bimolecular * NaV';
        } else if (stoichiometry === 0) {
          param.value /= 6.022e8;
          param.unit = '0-order / NaV';
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

// =============================================================================
// High-Level SBML Parser
// =============================================================================

/**
 * SBMLParser - High-level wrapper for SBML parsing
 */
export class SBMLParser {
  private initialized: boolean = false;

  /**
   * Initialize the parser by loading libsbmljs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import for libsbmljs
      const libsbmlModule = await import('libsbmljs_stable');
      libsbml = await libsbmlModule.default();
      this.initialized = true;
      logger.info('SBM001', 'libsbmljs initialized successfully');
    } catch (error) {
      logger.error('SBM002', `Failed to load libsbmljs: ${error}`);
      throw new Error(`Failed to initialize SBML parser: ${error}`);
    }
  }

  /**
   * Parse SBML string and extract model data
   */
  async parse(sbmlString: string): Promise<SBMLModel> {
    if (!this.initialized) {
      await this.initialize();
    }

    const document = libsbml.readSBMLFromString(sbmlString);

    try {
      // Check for errors
      const numErrors = document.getNumErrors();
      if (numErrors > 0) {
        const errors: string[] = [];
        for (let i = 0; i < numErrors; i++) {
          const error = document.getError(i);
          if (error.getSeverity() >= 2) {
            errors.push(error.getMessage());
          }
        }
        if (errors.length > 0) {
          logger.warning('SBM003', `SBML parsing warnings: ${errors.slice(0, 3).join('; ')}`);
        }
      }

      const model = document.getModel();
      if (!model) {
        throw new Error('SBML document contains no model');
      }

      return this.extractModel(model);
    } finally {
      document.delete();
    }
  }

  /**
   * Extract all model data into internal format
   */
  private extractModel(model: any): SBMLModel {
    const result: SBMLModel = {
      id: model.getId() || 'unnamed_model',
      name: model.getName() || model.getId() || 'Unnamed Model',
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
    for (let i = 0; i < model.getNumCompartments(); i++) {
      const comp = this.extractCompartment(model.getCompartment(i));
      result.compartments.set(comp.id, comp);
    }

    // Extract species
    for (let i = 0; i < model.getNumSpecies(); i++) {
      const sp = this.extractSpecies(model.getSpecies(i));
      result.species.set(sp.id, sp);
      
      if (!result.speciesByCompartment.has(sp.compartment)) {
        result.speciesByCompartment.set(sp.compartment, []);
      }
      result.speciesByCompartment.get(sp.compartment)!.push(sp.id);
    }

    // Extract parameters
    for (let i = 0; i < model.getNumParameters(); i++) {
      const param = this.extractParameter(model.getParameter(i), 'global');
      result.parameters.set(param.id, param);
    }

    // Extract reactions
    for (let i = 0; i < model.getNumReactions(); i++) {
      const rxn = this.extractReaction(model.getReaction(i));
      result.reactions.set(rxn.id, rxn);
    }

    // Extract rules
    for (let i = 0; i < model.getNumRules(); i++) {
      const rule = this.extractRule(model.getRule(i));
      if (rule) {
        result.rules.push(rule);
      }
    }

    // Extract function definitions
    for (let i = 0; i < model.getNumFunctionDefinitions(); i++) {
      const func = this.extractFunctionDefinition(model.getFunctionDefinition(i));
      result.functionDefinitions.set(func.id, func);
    }

    // Extract events
    for (let i = 0; i < model.getNumEvents(); i++) {
      const event = this.extractEvent(model.getEvent(i));
      if (event) {
        result.events.push(event);
      }
    }

    // Extract initial assignments
    for (let i = 0; i < model.getNumInitialAssignments(); i++) {
      const ia = this.extractInitialAssignment(model.getInitialAssignment(i));
      if (ia) {
        result.initialAssignments.push(ia);
      }
    }

    logger.info('SBM004', 
      `Parsed SBML model: ${result.species.size} species, ${result.reactions.size} reactions`);

    return result;
  }

  private extractCompartment(comp: any): SBMLCompartment {
    return {
      id: comp.getId(),
      name: comp.getName() || comp.getId(),
      spatialDimensions: comp.getSpatialDimensions() || 3,
      size: comp.getSize() || 1,
      units: comp.getUnits() || '',
      constant: comp.getConstant(),
      outside: comp.getOutside() || undefined,
    };
  }

  private extractSpecies(sp: any): SBMLSpecies {
    return {
      id: sp.getId(),
      name: sp.getName() || sp.getId(),
      compartment: sp.getCompartment(),
      initialConcentration: sp.getInitialConcentration() || 0,
      initialAmount: sp.getInitialAmount() || 0,
      substanceUnits: sp.getSubstanceUnits() || '',
      hasOnlySubstanceUnits: sp.getHasOnlySubstanceUnits(),
      boundaryCondition: sp.getBoundaryCondition(),
      constant: sp.getConstant(),
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
    if (kl) {
      const localParams: SBMLParameter[] = [];
      
      const numParams = kl.getNumLocalParameters?.() ?? kl.getNumParameters?.() ?? 0;
      for (let i = 0; i < numParams; i++) {
        const param = kl.getLocalParameter?.(i) ?? kl.getParameter?.(i);
        if (param) {
          localParams.push(this.extractParameter(param, 'local'));
        }
      }

      const math = kl.getMath();
      kineticLaw = {
        math: kl.getFormula() || (math ? libsbml.formulaToString(math) : ''),
        mathML: math ? math.toMathML() : '',
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
    };
  }

  private extractRule(rule: any): SBMLRule | null {
    const math = rule.getMath();
    
    if (rule.isAlgebraic()) {
      return {
        type: 'algebraic',
        math: rule.getFormula() || (math ? libsbml.formulaToString(math) : ''),
      };
    } else if (rule.isAssignment()) {
      return {
        type: 'assignment',
        variable: rule.getVariable(),
        math: rule.getFormula() || (math ? libsbml.formulaToString(math) : ''),
      };
    } else if (rule.isRate()) {
      return {
        type: 'rate',
        variable: rule.getVariable(),
        math: rule.getFormula() || (math ? libsbml.formulaToString(math) : ''),
      };
    }
    
    return null;
  }

  private extractFunctionDefinition(func: any): SBMLFunctionDefinition {
    const args: string[] = [];
    for (let i = 0; i < func.getNumArguments(); i++) {
      const arg = func.getArgument(i);
      args.push(arg.getName ? arg.getName() : libsbml.formulaToString(arg));
    }

    const body = func.getBody();
    
    return {
      id: func.getId(),
      name: func.getName() || func.getId(),
      math: body ? libsbml.formulaToString(body) : '',
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
        math: math ? libsbml.formulaToString(math) : '',
      });
    }

    return {
      id: event.getId(),
      name: event.getName() || event.getId(),
      trigger: triggerMath ? libsbml.formulaToString(triggerMath) : '',
      delay: delayMath ? libsbml.formulaToString(delayMath) : undefined,
      useValuesFromTriggerTime: event.getUseValuesFromTriggerTime?.() || true,
      assignments,
    };
  }

  private extractInitialAssignment(ia: any): SBMLInitialAssignment | null {
    const math = ia.getMath();
    if (!math) return null;
    
    return {
      symbol: ia.getSymbol(),
      math: libsbml.formulaToString(math),
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
