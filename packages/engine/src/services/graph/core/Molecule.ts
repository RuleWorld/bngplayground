// graph/core/Molecule.ts
import { Component } from './Component.ts';

export class Molecule {
  name: string;
  components: Component[];
  compartment?: string;
  label?: string;  // for pattern matching (e.g., A1, A2 in rules)
  wildcard?: string; // Molecule-level bond wildcard (!+, !?, !-)
  _sourceKey?: string; // Internal property for tracking reactant source
  hasExplicitEmptyComponentList: boolean;
  private _componentCounts?: Map<string, number>;
  _sourceR?: number;
  _sourceM?: number;
  _explicitUnboundComponents?: Set<number>;
  _explicitBondedComponents?: Set<number>;

  constructor(
    name: string,
    components: Component[] = [],
    compartment?: string,
    hasExplicitEmptyComponentList: boolean = false
  ) {
    this.name = name;
    this.components = components;
    this.compartment = compartment;
    this.hasExplicitEmptyComponentList = hasExplicitEmptyComponentList;
  }

  get componentCounts(): Map<string, number> {
    if (this._componentCounts !== undefined) return this._componentCounts;
    const counts = new Map<string, number>();
    for (let i = 0; i < this.components.length; i++) {
      const compName = this.components[i].name;
      counts.set(compName, (counts.get(compName) ?? 0) + 1);
    }
    this._componentCounts = counts;
    return counts;
  }

  /**
   * BioNetGen: Molecule::toString()
   * Format: Name(comp1,comp2~state!1)@compartment
   */
  toString(): string {
    // Sort components by name for a more stable string representation
    // BUT only if they aren't already sorted by some other logic
    const sortedComps = [...this.components].sort((a, b) => a.name.localeCompare(b.name));
    const compStr = sortedComps.map(c => c.toString()).join(',');
    const compSuffix = compStr ? `(${compStr})` : (this.hasExplicitEmptyComponentList ? '()' : '');
    const wildcardSuffix = this.wildcard ? `!${this.wildcard}` : '';
    const compartmentSuffix = this.compartment ? `@${this.compartment}` : '';
    if (compStr || this.hasExplicitEmptyComponentList) {
      return `${this.name}${compSuffix}${wildcardSuffix}${compartmentSuffix}`;
    }
    return `${this.name}${wildcardSuffix}${compartmentSuffix}`;
  }

  /**
   * BioNetGen: Molecule::isomorphicTo()
   */
  isomorphicTo(other: Molecule, componentMap: Map<number, number>): boolean {
    if (this.name !== other.name) return false;
    if (this.compartment !== other.compartment) return false;
    if (this.wildcard !== other.wildcard) return false;
    if (this.components.length !== other.components.length) return false;

    // Components must match in order (BioNetGen assumes sorted components)
    for (let i = 0; i < this.components.length; i++) {
      if (!this.components[i].isomorphicTo(other.components[i])) return false;
      componentMap.set(i, i);  // track component correspondence
    }
    return true;
  }

  /**
   * Deep clone for graph transformations
   */
  clone(): Molecule {
    const clonedComponents = this.components.map(comp => {
      const cloned = comp.clone();
      return cloned;
    });

    const cloned = new Molecule(
      this.name,
      clonedComponents,
      this.compartment,
      this.hasExplicitEmptyComponentList
    );
    cloned.label = this.label;
    cloned.wildcard = this.wildcard;
    cloned._sourceKey = this._sourceKey;
    cloned._sourceR = this._sourceR;
    cloned._sourceM = this._sourceM;
    if (this._explicitUnboundComponents) {
      cloned._explicitUnboundComponents = new Set(this._explicitUnboundComponents);
    }
    if (this._explicitBondedComponents) {
      cloned._explicitBondedComponents = new Set(this._explicitBondedComponents);
    }
    return cloned;
  }
}