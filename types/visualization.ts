export interface VisualizationComponent {
  name: string;
  state?: string;
  bondLabel?: string;
  bondPartner?: string;
  role?: VisualizationComponentRole;
  bondRequirement?: 'free' | 'bound' | 'either' | null;
}

export interface VisualizationMolecule {
  name: string;
  components: VisualizationComponent[];
  position?: { x: number; y: number };
  color?: string;
  textColor?: string;
}

export type VisualizationComponentRole = 'context' | 'transformed' | 'created';

export interface VisualizationRule {
  id: string;
  name: string;
  reactants: VisualizationMolecule[][];
  products: VisualizationMolecule[][];
  rate: string;
  reverseRate?: string;
  isBidirectional: boolean;
  comment?: string;
}

export type OperationType =
  | 'bind'
  | 'unbind'
  | 'state_change'
  | 'add_molecule'
  | 'remove_molecule';

export interface RuleOperation {
  type: OperationType;
  target: string;
  from?: string;
  to?: string;
  bondLabel?: string;
}

export interface CompactRule {
  name: string;
  context: VisualizationMolecule[];
  operations: RuleOperation[];
  rate: string;
  comment?: string;
}

export interface ContactEdge {
  from: string;
  to: string;
  interactionType: 'binding' | 'unbinding' | 'state_change';
  componentPair?: [string, string];
  ruleIds: string[];
  ruleLabels: string[];
}

export interface ContactNode {
  id: string;
  label: string;
  type: 'molecule' | 'component' | 'state' | 'compartment';
  parent?: string; // parent is molecule id for compound nodes or compartment id when molecule belongs to a compartment
  isGroup?: boolean; // true if this node contains children (for compound node layouts)
}

export interface ContactMap {
  nodes: ContactNode[];
  edges: ContactEdge[];
}

export interface ARNode {
  id: string;
  type: 'atom' | 'rule';
  label: string;
  details?: string;
}

export interface AREdge {
  from: string;
  to: string;
  edgeType: 'produces' | 'consumes' | 'modifies';
}

export interface AtomRuleGraph {
  nodes: ARNode[];
  edges: AREdge[];
}

export interface RuleFlowNode {
  id: string;
  displayName: string;
  type: 'binding' | 'modification' | 'synthesis' | 'degradation' | 'complex';
  layer: number;
  color?: string;
}

export interface RuleFlowEdge {
  from: string;
  to: string;
  producedSpecies: string[];
}

export interface RuleFlowGraph {
  nodes: RuleFlowNode[];
  edges: RuleFlowEdge[];
}

export interface RegulatoryNode {
  id: string;
  label: string;
  type: 'rule' | 'species';
  details?: string;
}

export interface RegulatoryEdge {
  from: string;
  to: string;
  type: 'reactant' | 'product' | 'catalyst';
}

export interface RegulatoryGraph {
  nodes: RegulatoryNode[];
  edges: RegulatoryEdge[];
}
