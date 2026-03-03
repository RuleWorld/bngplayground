import type { BNGLModel } from '../../types';

export type RuleMultiplicity = 'unimolecular' | 'bimolecular' | 'multimolecular';

export interface MatchProjection {
  patternMolecule: number;
  targetMolecule: number;
  componentMappings: Array<{
    patternComponent: number;
    targetComponent: number;
  }>;
}

export interface ExpansionEvent {
  stepId: number;
  timestamp: number;
  ruleId: string;
  ruleName: string;
  ruleMultiplicity: RuleMultiplicity;
  reactantSpeciesIds: number[];
  reactantSpeciesNames: string[];
  productSpeciesIds: number[];
  productSpeciesNames: string[];
  matches: MatchProjection[];
  degeneracy: number;
  propensityFactor: number;
  effectiveRate: number;
  newSpeciesIds: number[];
  totalSpeciesAfter: number;
  totalReactionsAfter: number;
}

export interface NetworkTrace {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  events: ExpansionEvent[];
  eventsByRule: Record<string, ExpansionEvent[]>;
  totalEvents: number;
  totalSpeciesGenerated: number;
  totalReactionsGenerated: number;
  rulesNeverFired: string[];
}

export interface DebuggerReaction {
  id: number;
  ruleName?: string;
  reactantIds: number[];
  productIds: number[];
  rateConstant: number;
  degeneracy: number;
  propensityFactor?: number;
}

export interface DebuggerSpecies {
  id: number;
  name: string;
  concentration: number;
}

export interface DebuggerNetwork {
  species: DebuggerSpecies[];
  reactions: DebuggerReaction[];
  asModel: BNGLModel;
}

export interface TraceResult {
  network: DebuggerNetwork;
  trace: NetworkTrace;
}

export type AtomType = 'molecule' | 'componentState' | 'bond';

export interface Atom {
  kind: AtomType;
  molecule: string;
  component?: string;
  state?: string;
  bondLabel?: string;
}

export interface RuleBlockerDetails {
  reactantIndex: number;
  pattern: string;
  missing: Atom[];
}

export interface RuleBlockerSuggestion {
  atomDescription: string;
  createdByRules: string[];
  mentionedInObservables: boolean;
}

export interface RuleBlockerReport {
  ruleName: string;
  blockers: RuleBlockerDetails[];
  suggestions: RuleBlockerSuggestion[];
}
