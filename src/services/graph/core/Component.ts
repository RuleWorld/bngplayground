// graph/core/Component.ts

export interface ComponentState {
  name: string;
  index: number;  // position in allowed states array
}

export class Component {
  name: string;
  states: string[];           // allowed state names (from molecule type)
  state?: string;             // current state (for species instances)
  edges: Map<number, number>; // component index => bond partner component index
  wildcard?: '+' | '?' | '-';  // bond wildcard semantics (include '!' modifiers like !+, !? and !-)
  syntheticWildcard?: boolean; // true when this component was added by completeMissingComponents (implicit !?) rather than explicitly written in the rule

  constructor(name: string, states: string[] = []) {
    this.name = name;
    this.states = states;
    this.edges = new Map();
  }

  /**
   * BioNetGen: Component::toString()
   * Format: name~state!bond or name!bond or name~state
   * For multi-site bonding: name~state!0!1 (multiple bond labels)
   */
  toString(): string {
    let str = this.name;
    if (this.state) str += `~${this.state}`;
    if (this.edges.size > 0) {
      // Output all bond labels for multi-site bonding
      const bondLabels = Array.from(this.edges.keys()).sort((a, b) => a - b);
      for (const bondLabel of bondLabels) {
        str += `!${bondLabel}`;
      }
    } else if (this.wildcard) {
      str += `!${this.wildcard}`;
    }
    return str;
  }

  /**
   * BioNetGen: Component::isomorphicTo()
   * Check structural equivalence for graph matching
   */
  isomorphicTo(other: Component, checkState: boolean = true): boolean {
    if (this.name !== other.name) return false;
    if (checkState && this.state !== other.state) return false;
    if (this.states.length !== other.states.length) return false;
    // Bond wildcard matching (BNGL), per BioNetGen tutorial:
    // - '!+' means the site must be bound (one or more bonds)
    // - '!?' means the site may or may not be bound (zero or one bond)
    // - '!-' means the site must be unbound (zero bonds)
    // - absence of any '!<...>' is handled elsewhere (bond state unconstrained)
    if (this.wildcard === '+' && other.edges.size === 0) return false;
    if (this.wildcard === '-' && other.edges.size !== 0) return false;
    if (this.wildcard === '?' && other.edges.size > 1) return false;
    return true;
  }

  /**
   * Create a deep copy of this component (including bond metadata)
   */
  clone(): Component {
    const copy = new Component(this.name, [...this.states]);
    copy.state = this.state;
    copy.wildcard = this.wildcard;
    copy.edges = new Map(this.edges);
    return copy;
  }


}