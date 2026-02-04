/**
 * BNG Atomizer - Main Entry Point
 * Complete TypeScript port of atomizeTool.py and libsbml2bngl.py
 * 
 * This is the main class that orchestrates SBML to BNGL conversion
 * with optional structure inference (atomization).
 */

import { Species, Molecule, Component, Databases } from './core/structures';
import {
  AtomizerOptions,
  DEFAULT_ATOMIZER_OPTIONS,
  AtomizerResult,
  SBMLModel,
  NamingConventions,
  DEFAULT_NAMING_CONVENTIONS,
  SpeciesCompositionTable,
} from './config/types';
import { SBMLParser } from './parser/sbmlParser';
import {
  buildSpeciesCompositionTable,
  getMoleculeTypes,
  getSeedSpecies,
  analyzeReactions,
  analyzeNamingConventions,
  reconcileSCT,
} from './atomization/core';
import {
  generateBNGL,
  writeParameters,
  writeCompartments,
  writeMoleculeTypes,
  writeSeedSpecies,
  writeObservables,
  writeReactionRulesFlat,
} from './writer/bnglWriter';
import {
  logger,
  standardizeName,
  LogLevel,
} from './utils/helpers';

// =============================================================================
// Main Atomizer Class
// =============================================================================

export class Atomizer {
  private options: AtomizerOptions;
  private parser: SBMLParser;
  private initialized: boolean = false;
  private model: SBMLModel | null = null;
  private sct: SpeciesCompositionTable | null = null;
  private databases: Databases;

  constructor(options: Partial<AtomizerOptions> = {}) {
    this.options = { ...DEFAULT_ATOMIZER_OPTIONS, ...options };
    this.parser = new SBMLParser();
    this.databases = new Databases();

    // Configure logger
    logger.setLevel(this.options.logLevel);
    logger.setQuietMode(this.options.quietMode);
  }

  /**
   * Initialize the atomizer by loading required libraries
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.parser.initialize();
      this.initialized = true;
      logger.info('ATM001', 'Atomizer initialized successfully');
    } catch (error) {
      logger.error('ATM002', `Failed to initialize atomizer: ${error}`);
      throw error;
    }
  }

  /**
   * Set atomizer options
   */
  setOptions(options: Partial<AtomizerOptions>): void {
    this.options = { ...this.options, ...options };
    logger.setLevel(this.options.logLevel);
    logger.setQuietMode(this.options.quietMode);
  }

  /**
   * Get current options
   */
  getOptions(): AtomizerOptions {
    return { ...this.options };
  }

  /**
   * Convert SBML to BNGL
   * 
   * @param sbmlString - SBML model as a string
   * @returns AtomizerResult containing BNGL and metadata
   */
  async atomize(sbmlString: string): Promise<AtomizerResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // If this SBML was produced by BioNetGen (BNG-style SBML), use the fast-path converter
      if (/ListOfMoleculeTypes\b/i.test(sbmlString) || /ListOfReactionRules\b/i.test(sbmlString)) {
        // Try conversion to BNGL directly from the BNG-exported SBML XML
        try {
          const { convertBNGXmlToBNGL } = await import('./parser/bngXmlParser');
          const bngl = convertBNGXmlToBNGL(sbmlString);
          logger.info('ATM_BNG_FASTPATH', 'Detected BNG-style SBML and converted directly to BNGL');

          return {
            bngl,
            database: this.databases,
            annotation: null,
            observableMap: new Map(),
            log: logger.getMessages(),
            success: true,
          } as AtomizerResult;
        } catch (e) {
          logger.warning('ATM_BNG_FASTPATH_FAIL', `BNG XML fast-path failed: ${e}`);
          // fall through to regular parsing
        }
      }

      // Parse SBML
      logger.info('ATM003', 'Parsing SBML model...');
      this.model = await this.parser.parse(sbmlString);

      logger.info('ATM004',
        `Model "${this.model.name}": ${this.model.species.size} species, ${this.model.reactions.size} reactions`
      );

      // Build Species Composition Table
      logger.info('ATM005', 'Building species composition table...');
      this.sct = buildSpeciesCompositionTable(this.model, {
        useId: this.options.useId,
        useAnnotations: this.options.annotation,
        namingConventions: this.options.namingConventions || DEFAULT_NAMING_CONVENTIONS,
        memoizedResolver: this.options.memoizedResolver,
        atomize: this.options.atomize,
      });

      // Get molecule types
      const moleculeTypes = getMoleculeTypes(this.sct);
      logger.info('ATM006', `Found ${moleculeTypes.length} molecule types`);

      // Reconcile SCT entries with discovered molecule types
      reconcileSCT(this.sct, moleculeTypes);

      // Get seed species
      const seedSpecies = getSeedSpecies(this.sct, this.model);
      logger.info('ATM007', `Found ${seedSpecies.length} seed species`);

      // Generate BNGL
      logger.info('ATM008', 'Generating BNGL model...');
      const result = generateBNGL(
        this.model,
        this.sct,
        moleculeTypes,
        seedSpecies,
        this.options
      );

      // Build annotation data if requested
      let annotation: any = null;
      if (this.options.annotation) {
        annotation = this.buildAnnotationData();
      }

      logger.info('ATM009', 'BNGL generation complete');

      return {
        bngl: result.bngl,
        database: this.databases,
        annotation,
        observableMap: result.observableMap,
        log: logger.getMessages(),
        success: true,
      };

    } catch (error) {
      logger.error('ATM010', `Atomization failed: ${error}`);

      return {
        bngl: '',
        database: this.databases,
        annotation: null,
        observableMap: new Map(),
        log: logger.getMessages(),
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Perform flat translation (no structure inference)
   */
  async flatTranslation(sbmlString: string): Promise<AtomizerResult> {
    const savedAtomize = this.options.atomize;
    this.options.atomize = false;

    try {
      return await this.atomize(sbmlString);
    } finally {
      this.options.atomize = savedAtomize;
    }
  }

  /**
   * Perform full atomization (with structure inference)
   */
  async fullAtomization(sbmlString: string): Promise<AtomizerResult> {
    const savedAtomize = this.options.atomize;
    this.options.atomize = true;

    try {
      return await this.atomize(sbmlString);
    } finally {
      this.options.atomize = savedAtomize;
    }
  }

  /**
   * Get the parsed SBML model
   */
  getModel(): SBMLModel | null {
    return this.model;
  }

  /**
   * Get the Species Composition Table
   */
  getSCT(): SpeciesCompositionTable | null {
    return this.sct;
  }

  /**
   * Get UniProt IDs for a species from annotations
   */
  getUniProtIds(speciesId: string): string[] {
    if (!this.model) return [];
    const species = this.model.species.get(speciesId);
    if (!species) return [];
    
    const { extractUniProtIds } = require('./parser/sbmlParser');
    return extractUniProtIds(species.annotations);
  }

  /**
   * Get the translation databases
   */
  getDatabases(): Databases {
    return this.databases;
  }

  /**
   * Analyze naming conventions in the model
   */
  analyzeNaming(): {
    pairClassification: Map<string, [string, string][]>;
    patterns: Map<string, string>;
  } | null {
    if (!this.model) return null;

    const speciesNames = Array.from(this.model.species.values())
      .map(sp => sp.name || sp.id);

    return analyzeNamingConventions(
      speciesNames,
      this.options.namingConventions || DEFAULT_NAMING_CONVENTIONS
    );
  }

  /**
   * Analyze reactions in the model
   */
  analyzeReactionPatterns(): ReturnType<typeof analyzeReactions> | null {
    if (!this.model) return null;
    return analyzeReactions(this.model);
  }

  /**
   * Build annotation data for output
   */
  private buildAnnotationData(): any {
    if (!this.model || !this.sct) return null;

    const annotations: any = {
      species: {},
      reactions: {},
      compartments: {},
    };

    // Species annotations
    for (const [id, sp] of this.model.species) {
      if (sp.annotations.length > 0) {
        annotations.species[id] = {
          name: sp.name,
          annotations: sp.annotations.map(a => ({
            type: a.qualifierType,
            biologicalQualifier: a.biologicalQualifier,
            modelQualifier: a.modelQualifier,
            resources: a.resources,
          })),
        };
      }
    }

    // Reaction annotations (if any)
    // SBML reactions don't typically have CV terms, but we can include metadata

    // Compartment info
    for (const [id, comp] of this.model.compartments) {
      annotations.compartments[id] = {
        name: comp.name,
        dimensions: comp.spatialDimensions,
        size: comp.size,
      };
    }

    return annotations;
  }

  /**
   * Clear internal state
   */
  clear(): void {
    this.model = null;
    this.sct = null;
    this.databases = new Databases();
    logger.clear();
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick conversion from SBML to BNGL
 */
export async function sbmlToBngl(
  sbmlString: string,
  options: Partial<AtomizerOptions> = {}
): Promise<AtomizerResult> {
  const atomizer = new Atomizer(options);
  return atomizer.atomize(sbmlString);
}

/**
 * Quick flat translation (no atomization)
 */
export async function sbmlToBnglFlat(
  sbmlString: string,
  options: Partial<AtomizerOptions> = {}
): Promise<AtomizerResult> {
  const atomizer = new Atomizer({ ...options, atomize: false });
  return atomizer.atomize(sbmlString);
}

/**
 * Quick full atomization
 */
export async function sbmlToBnglAtomized(
  sbmlString: string,
  options: Partial<AtomizerOptions> = {}
): Promise<AtomizerResult> {
  const atomizer = new Atomizer({ ...options, atomize: true });
  return atomizer.atomize(sbmlString);
}

// =============================================================================
// Re-exports
// =============================================================================

export { Species, Molecule, Component, Databases } from './core/structures';
export { SBMLParser } from './parser/sbmlParser';
export {
  buildSpeciesCompositionTable,
  getMoleculeTypes,
  getSeedSpecies,
  analyzeReactions,
  analyzeNamingConventions,
  topologicalSort,
  classifyReaction,
} from './atomization/core';
export {
  generateBNGL,
  bnglFunction,
  bnglReaction,
} from './writer/bnglWriter';
export { generateSBML } from './writer/sbmlWriter';
export type {
  AtomizerOptions,
  AtomizerResult,
  SBMLModel,
  SBMLSpecies,
  SBMLReaction,
  SBMLParameter,
  SBMLCompartment,
  NamingConventions,
  SpeciesCompositionTable,
  SCTEntry,
} from './config/types';
export {
  DEFAULT_ATOMIZER_OPTIONS,
  DEFAULT_NAMING_CONVENTIONS,
} from './config/types';
export type {
  LogLevel,
} from './utils/helpers';
export {
  levenshtein,
  similarity,
  standardizeName,
  convertMathFunction,
  Counter,
  DefaultDict,
  logger,
} from './utils/helpers';
