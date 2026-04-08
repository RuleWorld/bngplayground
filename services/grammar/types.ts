export type ActionType =
  | "binds"
  | "phosphorylates"
  | "dephosphorylates"
  | "synthesizes"
  | "degrades"
  | "dimerizes"
  | "translocates"
  | "activates"
  | "inhibits"
  | "cleaves"
  | "ubiquitinates"
  | "deubiquitinates"
  | "methylates"
  | "demethylates"
  | "acetylates"
  | "deacetylates"
  | "unknown";

export interface Agent {
  name: string;
  sites: string[];
  states: Record<string, string[]>; // site -> [possible states]
}

export interface MoleculeInstance {
  name: string;
  stateConstraints: Record<string, string>; // site -> current state
}

export type ParseError = {
  message: string;
  startColumn: number;
  endColumn: number;
};

export type SentenceType =
  | "DEFINITION"
  | "COMPARTMENT"
  | "INTERACTION"
  | "INITIALIZATION"
  | "SIMULATION"
  | "COMMENT"
  | "OBSERVABLE"
  | "INVALID";

export interface BaseSentence {
  id: string; // unique ID for tracking (useful for React keys)
  text: string;
  type: SentenceType;
  isValid: boolean;
  error?: ParseError;
}

export interface CompartmentSentence extends BaseSentence {
  type: "COMPARTMENT";
  name: string;
  volume?: number;
  dimension?: number;
}

export interface DefinitionSentence extends BaseSentence {
  type: "DEFINITION";
  agent: Agent;
}

export interface InteractionSentence extends BaseSentence {
  type: "INTERACTION";
  subject: MoleculeInstance;
  action: ActionType;
  object: MoleculeInstance;
  isBidirectional?: boolean; // For binding
  rate?: string; // "k_on", "0.1"
  reverseRate?: string; // "k_off"
  site?: string; // Target site for modifications
  compartment?: string; // For translocation
  targetCompartment?: string; // For translocation destination
}

export interface InitializationSentence extends BaseSentence {
  type: "INITIALIZATION";
  molecule: MoleculeInstance;
  count: string; // "100", "E0"
}

export interface SimulationSentence extends BaseSentence {
  type: "SIMULATION";
  duration: number; // t_end
  steps: number; // n_steps
}

export interface ObservableSentence extends BaseSentence {
  type: "OBSERVABLE";
  pattern: string;
  name?: string;
}

export interface CommentSentence extends BaseSentence {
  type: "COMMENT";
}

export interface InvalidSentence extends BaseSentence {
  type: "INVALID";
}

export type BioSentence =
  | DefinitionSentence
  | CompartmentSentence
  | InteractionSentence
  | InitializationSentence
  | SimulationSentence
  | ObservableSentence
  | CommentSentence
  | InvalidSentence;
