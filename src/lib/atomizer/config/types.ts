/**
 * Configuration Types and Defaults for BNG Atomizer
 * Contains reaction definitions, naming conventions, and atomizer options
 */

import { LogLevel } from '../utils/helpers';
import { Species } from '../core/structures';

// =============================================================================
// BNGL Model Types (Internal copy for SBML Writer)
// =============================================================================

export interface BNGLMoleculeType {
  name: string;
  components: string[];
  comment?: string;
}

export interface BNGLSpecies {
  name: string;
  initialConcentration: number;
  isConstant?: boolean;
}

export interface BNGLObservable {
  type: 'molecules' | 'species' | 'counter' | string;
  name: string;
  pattern: string;
  comment?: string;
}

export interface BNGLCompartment {
  name: string;
  dimension: number;
  size: number;
  parent?: string;
}

export interface BNGLReaction {
  reactants: string[];
  products: string[];
  rate: string;
  rateConstant: number;
  reversible?: boolean;
  reverseRate?: string;
}

export interface ReactionRule {
  name?: string;
  reactants: string[];
  products: string[];
  rate: string;
  isBidirectional: boolean;
}

export interface BNGLFunction {
  name: string;
  args: string[];
  expression: string;
}

export interface BNGLModel {
  name?: string;
  parameters: Record<string, number>;
  moleculeTypes: BNGLMoleculeType[];
  species: BNGLSpecies[];
  observables: BNGLObservable[];
  reactions: BNGLReaction[];
  reactionRules: ReactionRule[];
  compartments?: BNGLCompartment[];
  functions?: BNGLFunction[];
}

export interface SeedSpeciesEntry {
  species: Species;
  concentration: string;
  compartment: string;
  sbmlId: string;
}

// =============================================================================
// Naming Conventions Configuration
// =============================================================================

export interface NamingPattern {
  /** The character/string differences that indicate this pattern */
  differences: string[];
  /** The modification type this pattern represents */
  modification: string;
}

export interface NamingConventions {
  /** List of known modification types */
  modificationList: string[];
  /** Reaction site patterns */
  reactionSite: string[];
  /** Reaction state patterns */
  reactionState: string[];
  /** Mapping definitions */
  definitions: Array<{ rsi: number; rst: number }>;
  /** Pattern to modification mapping */
  patterns: Map<string, string>;
}

/**
 * Default naming conventions for biological modifications
 */
export const DEFAULT_NAMING_CONVENTIONS: NamingConventions = {
  modificationList: [
    'Phosphorylation',
    'Double-Phosphorylation',
    'Triple-Phosphorylation',
    'Dephosphorylation',
    'Ubiquitination',
    'Deubiquitination',
    'Acetylation',
    'Deacetylation',
    'Methylation',
    'Demethylation',
    'Activation',
    'Inactivation',
    'Binding',
    'Unbinding',
    'Localization',
    'Translocation',
    'Dimerization',
    'Trimerization',
    'Oligomerization',
    'Cleavage',
    'Synthesis',
    'Degradation',
  ],
  reactionSite: [
    'phospho', 'phos', 'p',
    'ub', 'ubiq',
    'ac', 'acet',
    'me', 'methyl',
    'act', 'active',
    'inact', 'inactive',
  ],
  reactionState: [
    'P', 'PP', 'PPP',
    'U', 'UU',
    'Ac',
    'Me', 'MeMe',
    'A', 'I',
    '0', '1',
  ],
  definitions: [
    { rsi: 0, rst: 0 },  // phospho -> P
    { rsi: 0, rst: 1 },  // phospho -> PP
    { rsi: 1, rst: 2 },  // ub -> U
  ],
  patterns: new Map([
    // Single phosphorylation patterns
    [JSON.stringify(['+ p']), 'Phosphorylation'],
    [JSON.stringify(['+ P']), 'Phosphorylation'],
    [JSON.stringify(['+ _', '+ p']), 'Phosphorylation'],
    [JSON.stringify(['+ _', '+ P']), 'Phosphorylation'],
    [JSON.stringify(['+ p', '+ h', '+ o', '+ s']), 'Phosphorylation'],
    [JSON.stringify(['+ p', '+ h', '+ o', '+ s', '+ p', '+ h', '+ o']), 'Phosphorylation'],

    // Double phosphorylation patterns
    [JSON.stringify(['+ p', '+ p']), 'Double-Phosphorylation'],
    [JSON.stringify(['+ P', '+ P']), 'Double-Phosphorylation'],
    [JSON.stringify(['+ _', '+ P', '+ P']), 'Double-Phosphorylation'],
    [JSON.stringify(['+ P', '+ P', '+ _']), 'Double-Phosphorylation'],
    [JSON.stringify(['+ _', '+ p', '+ p']), 'Double-Phosphorylation'],

    // Triple phosphorylation
    [JSON.stringify(['+ p', '+ p', '+ p']), 'Triple-Phosphorylation'],
    [JSON.stringify(['+ P', '+ P', '+ P']), 'Triple-Phosphorylation'],

    // Ubiquitination
    [JSON.stringify(['+ u', '+ b']), 'Ubiquitination'],
    [JSON.stringify(['+ U', '+ b']), 'Ubiquitination'],
    [JSON.stringify(['+ _', '+ u', '+ b']), 'Ubiquitination'],
    [JSON.stringify(['+ _', '+ U', '+ b']), 'Ubiquitination'],
    [JSON.stringify(['+ u', '+ b', '+ i', '+ q']), 'Ubiquitination'],

    // Acetylation
    [JSON.stringify(['+ a', '+ c']), 'Acetylation'],
    [JSON.stringify(['+ A', '+ c']), 'Acetylation'],
    [JSON.stringify(['+ _', '+ a', '+ c']), 'Acetylation'],
    [JSON.stringify(['+ a', '+ c', '+ e', '+ t']), 'Acetylation'],

    // Methylation
    [JSON.stringify(['+ m', '+ e']), 'Methylation'],
    [JSON.stringify(['+ M', '+ e']), 'Methylation'],
    [JSON.stringify(['+ _', '+ m', '+ e']), 'Methylation'],
    [JSON.stringify(['+ m', '+ e', '+ t', '+ h']), 'Methylation'],

    // Activation
    [JSON.stringify(['+ a']), 'Activation'],
    [JSON.stringify(['+ A']), 'Activation'],
    [JSON.stringify(['+ *']), 'Activation'],
    [JSON.stringify(['+ _', '+ a']), 'Activation'],
    [JSON.stringify(['+ _', '+ A']), 'Activation'],
    [JSON.stringify(['+ _', '+ a', '+ c', '+ t']), 'Activation'],
    [JSON.stringify(['+ a', '+ c', '+ t', '+ i', '+ v', '+ e']), 'Activation'],

    // Inactivation
    [JSON.stringify(['+ i']), 'Inactivation'],
    [JSON.stringify(['+ I']), 'Inactivation'],
    [JSON.stringify(['+ _', '+ i']), 'Inactivation'],
    [JSON.stringify(['+ _', '+ I']), 'Inactivation'],
    [JSON.stringify(['+ i', '+ n', '+ a', '+ c', '+ t']), 'Inactivation'],

    // Binding (complex formation)
    [JSON.stringify(['+ _']), 'Binding'],
    [JSON.stringify(['+ _', '+ b', '+ o', '+ u', '+ n', '+ d']), 'Binding'],

    // Localization
    [JSON.stringify(['+ _', '+ c', '+ y', '+ t']), 'Localization'],
    [JSON.stringify(['+ _', '+ n', '+ u', '+ c']), 'Localization'],
    [JSON.stringify(['+ _', '+ m', '+ e', '+ m']), 'Localization'],
    [JSON.stringify(['+ _', '+ p', '+ m']), 'Localization'],
    [JSON.stringify(['+ _', '+ e', '+ r']), 'Localization'],

    // Dimerization
    [JSON.stringify(['+ 2']), 'Dimerization'],
    [JSON.stringify(['+ _', '+ d', '+ i', '+ m']), 'Dimerization'],
    [JSON.stringify(['+ _', '+ d', '+ i', '+ m', '+ e', '+ r']), 'Dimerization'],

    // Trimerization
    [JSON.stringify(['+ 3']), 'Trimerization'],
    [JSON.stringify(['+ _', '+ t', '+ r', '+ i', '+ m']), 'Trimerization'],
  ]),
};

// =============================================================================
// Reaction Definitions Configuration
// =============================================================================

export interface ReactionTemplate {
  /** Number of reactants and their pattern indices */
  reactants: string[];
  /** Number of products and their pattern indices */
  products: string[];
}

export interface ReactionDefinition {
  /** Reaction type index */
  r?: number[];
  /** Naming convention index */
  n?: number[];
}

export interface ReactionDefinitions {
  /** Reaction patterns: [reactants, products] pairs */
  reactions: [string[], string[]][];
  /** Names for each reaction type */
  reactionsNames: string[];
  /** Definitions mapping reactions to naming conventions */
  definitions: ReactionDefinition[];
}

/**
 * Default reaction definitions
 */
export const DEFAULT_REACTION_DEFINITIONS: ReactionDefinitions = {
  reactions: [
    // Binding: A + B -> C
    [['S0', 'S1'], ['S2']],
    // Unbinding: C -> A + B
    [['S2'], ['S0', 'S1']],
    // Synthesis: 0 -> A
    [[], ['S0']],
    // Degradation: A -> 0
    [['S0'], []],
    // Complex binding: A + B + C -> D
    [['S0', 'S1', 'S2'], ['S3']],
    // Complex unbinding: D -> A + B + C
    [['S3'], ['S0', 'S1', 'S2']],
    // Modification: A -> A' (1:1)
    [['S0'], ['S1']],
    // Catalyzed modification: A + E -> A' + E
    [['S0', 'S1'], ['S2', 'S1']],
  ],
  reactionsNames: [
    'Binding',
    'Unbinding',
    'Synthesis',
    'Degradation',
    'Binding',
    'Unbinding',
    'Modification',
    'Catalysis',
  ],
  definitions: [
    { r: [0] },      // Binding reaction pattern
    { r: [1] },      // Unbinding reaction pattern
    { r: [2] },      // Synthesis pattern
    { r: [3] },      // Degradation pattern
    { r: [4] },      // Complex binding
    { r: [5] },      // Complex unbinding
    { n: [0] },      // Naming-based modification
    { n: [], r: [6] }, // Modification by reaction
  ],
};

// =============================================================================
// Species Equivalence Configuration
// =============================================================================

export interface SpeciesEquivalence {
  /** Species name */
  name: string;
  /** Equivalent structure in BNGL format */
  structure: string;
  /** Components and their states */
  components?: Record<string, string[]>;
}

export interface UserStructures {
  /** User-defined species structures */
  equivalences: SpeciesEquivalence[];
}

// =============================================================================
// Atomizer Options
// =============================================================================

export interface AtomizerOptions {
  /** Input file path (for file-based processing) */
  inputFile?: string;
  /** Output file path */
  outputFile?: string;
  /** Convention file path */
  conventionFile?: string;
  /** Naming conventions configuration */
  namingConventions?: NamingConventions;
  /** User-defined species structures */
  userStructures?: UserStructures;
  /** Use SBML IDs instead of names */
  useId: boolean;
  /** Keep annotation information */
  annotation: boolean;
  /** Perform atomization (true) or flat translation (false) */
  atomize: boolean;
  /** Use Pathway Commons for binding inference */
  pathwaycommons: boolean;
  /** Use BioGrid for binding inference */
  bioGrid: boolean;
  /** Path to BioNetGen for post-analysis */
  bionetgenAnalysis?: string;
  /** Check for isomorphic structures */
  isomorphismCheck: boolean;
  /** Ignore translation errors */
  ignore: boolean;
  /** Skip unit conversion */
  noConversion: boolean;
  /** Use memoized resolver (memory-efficient but slower) */
  memoizedResolver: boolean;
  /** Replace local parameters with values */
  replaceLocParams: boolean;
  /** Suppress logging to stdout */
  quietMode: boolean;
  /** Logging level */
  logLevel: LogLevel;
  /** Output file for observable mapping */
  obsMapFile?: string;
  /** Custom actions block text */
  actions?: string;
  /** Simulation end time */
  tEnd?: number;
  /** Number of simulation steps */
  nSteps?: number;
  /** Variables defined by assignment rules (internal use) */
  assignmentRuleVariables?: Set<string>;
  /** Rules that were converted to observables (internal use) */
  observableConvertedRules?: Set<string>;
  /** Species that have amount-based observables (internal use) */
  speciesAmts?: Set<string>;
  /** Detected name for Avogadro's Constant (e.g. 'Na', 'NA') */
  avogadroName?: string;
}

/**
 * Default atomizer options
 */
export const DEFAULT_ATOMIZER_OPTIONS: AtomizerOptions = {
  useId: false,
  annotation: false,
  atomize: false,  // Default is flat translation
  pathwaycommons: false,
  bioGrid: false,
  isomorphismCheck: false,
  ignore: false,
  noConversion: true,
  memoizedResolver: false,
  replaceLocParams: true,
  quietMode: false,
  logLevel: 'WARNING',
  tEnd: 10,
  nSteps: 100,
};

// =============================================================================
// SBML Qualifier Types
// =============================================================================

export enum BiologicalQualifier {
  BQB_IS = 0,
  BQB_HAS_PART = 1,
  BQB_IS_PART_OF = 2,
  BQB_IS_VERSION_OF = 3,
  BQB_HAS_VERSION = 4,
  BQB_IS_HOMOLOG_TO = 5,
  BQB_IS_DESCRIBED_BY = 6,
  BQB_IS_ENCODED_BY = 7,
  BQB_ENCODES = 8,
  BQB_OCCURS_IN = 9,
  BQB_HAS_PROPERTY = 10,
  BQB_IS_PROPERTY_OF = 11,
  BQB_HAS_TAXON = 12,
  BQB_UNKNOWN = 13,
}

export enum ModelQualifier {
  BQM_IS = 0,
  BQM_IS_DESCRIBED_BY = 1,
  BQM_IS_DERIVED_FROM = 2,
  BQM_IS_INSTANCE_OF = 3,
  BQM_HAS_INSTANCE = 4,
  BQM_UNKNOWN = 5,
}

export const BIOLOGICAL_QUALIFIER_NAMES: Record<number, string> = {
  0: 'BQB_IS',
  1: 'BQB_HAS_PART',
  2: 'BQB_IS_PART_OF',
  3: 'BQB_IS_VERSION_OF',
  4: 'BQB_HAS_VERSION',
  5: 'BQB_IS_HOMOLOG_TO',
  6: 'BQB_IS_DESCRIBED_BY',
  7: 'BQB_IS_ENCODED_BY',
  8: 'BQB_ENCODES',
  9: 'BQB_OCCURS_IN',
  10: 'BQB_HAS_PROPERTY',
  11: 'BQB_IS_PROPERTY_OF',
  12: 'BQB_HAS_TAXON',
  13: 'BQB_UNKNOWN',
};

export const MODEL_QUALIFIER_NAMES: Record<number, string> = {
  0: 'BQM_IS',
  1: 'BQM_IS_DESCRIBED_BY',
  2: 'BQM_IS_DERIVED_FROM',
  3: 'BQM_IS_INSTANCE_OF',
  4: 'BQM_HAS_INSTANCE',
  5: 'BQM_UNKNOWN',
};

// =============================================================================
// Result Types
// =============================================================================

export interface AtomizerResult {
  /** Generated BNGL model text */
  bngl: string;
  /** Database of translated structures */
  database: any;
  /** Annotation information */
  annotation: any;
  /** Observable mapping (SBML ID -> BNGL observable name) */
  observableMap: Map<string, string>;
  /** Translation log messages */
  log: any[];
  /** Whether translation was successful */
  success: boolean;
  /** Error message if translation failed */
  error?: string;
}

// =============================================================================
// SBML Model Types
// =============================================================================

export interface SBMLCompartment {
  id: string;
  name: string;
  spatialDimensions: number;
  size: number;
  units: string;
  constant: boolean;
  outside?: string;
}

export interface SBMLParameter {
  id: string;
  name: string;
  value: number;
  units: string;
  constant: boolean;
  scope: 'global' | 'local';
}

export interface SBMLSpecies {
  id: string;
  name: string;
  compartment: string;
  initialConcentration: number;
  initialAmount: number;
  substanceUnits: string;
  hasOnlySubstanceUnits: boolean;
  boundaryCondition: boolean;
  constant: boolean;
  annotations: AnnotationInfo[];
}

export interface SBMLSpeciesReference {
  species: string;
  stoichiometry: number;
  constant: boolean;
}

export interface SBMLModifierSpeciesReference {
  species: string;
}

export interface SBMLKineticLaw {
  math: string;
  mathML: string;
  localParameters: SBMLParameter[];
}

export interface SBMLReaction {
  id: string;
  name: string;
  reversible: boolean;
  fast: boolean;
  reactants: SBMLSpeciesReference[];
  products: SBMLSpeciesReference[];
  modifiers: SBMLModifierSpeciesReference[];
  kineticLaw: SBMLKineticLaw | null;
  compartment?: string;
}

export interface SBMLFunctionDefinition {
  id: string;
  name: string;
  math: string;
  arguments: string[];
}

export interface SBMLRule {
  type: 'algebraic' | 'assignment' | 'rate';
  variable?: string;
  math: string;
}

export interface SBMLEvent {
  id: string;
  name: string;
  trigger: string;
  delay?: string;
  useValuesFromTriggerTime: boolean;
  assignments: Array<{ variable: string; math: string }>;
}

export interface SBMLInitialAssignment {
  symbol: string;
  math: string;
}

export interface AnnotationInfo {
  qualifierType: number;
  biologicalQualifier?: BiologicalQualifier;
  modelQualifier?: ModelQualifier;
  resources: string[];
}

export interface SBMLModel {
  id: string;
  name: string;
  compartments: Map<string, SBMLCompartment>;
  species: Map<string, SBMLSpecies>;
  parameters: Map<string, SBMLParameter>;
  reactions: Map<string, SBMLReaction>;
  rules: SBMLRule[];
  functionDefinitions: Map<string, SBMLFunctionDefinition>;
  events: SBMLEvent[];
  initialAssignments: SBMLInitialAssignment[];
  speciesByCompartment: Map<string, string[]>;
  unitDefinitions: Map<string, any>;
}

// =============================================================================
// Species Composition Table Types
// =============================================================================

export interface SCTEntry {
  /** The BNGL species structure */
  structure: any;  // Species class
  /** Component species that make up this complex */
  components: string[];
  /** Original SBML species ID */
  sbmlId: string;
  /** Whether this is an elemental (non-complex) species */
  isElemental: boolean;
  /** Modification state relative to base species */
  modifications: Map<string, string>;
  /** Weight/depth in dependency graph */
  weight: number;
  /** Bond information */
  bonds: any[];
}

export interface SpeciesCompositionTable {
  /** SCT entries keyed by species name */
  entries: Map<string, SCTEntry>;
  /** Dependency graph: species -> species it depends on */
  dependencies: Map<string, Set<string>>;
  /** Reverse dependency: species -> species that depend on it */
  reverseDependencies: Map<string, Set<string>>;
  /** Topologically sorted species (elemental first) */
  sortedSpecies: string[];
  /** Weight of each species in the dependency graph */
  weights: [string, number][];
}
