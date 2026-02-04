/**
 * Core Data Structures for BNG Atomizer
 * Complete TypeScript port of smallStructures.py and structures.py
 * 
 * These structures represent BNGL patterns: Species contain Molecules,
 * Molecules contain Components, Components have states and bonds.
 */

import { deepCopy, Counter, randInt } from '../utils/helpers';

// =============================================================================
// Component Class
// =============================================================================

/**
 * Represents a component (binding site or modification site) within a molecule.
 * Components can have states (e.g., phosphorylated/unphosphorylated) and bonds.
 */
export class Component {
  name: string;
  idx: string;
  states: string[];
  bonds: (string | number)[];
  activeState: string;

  constructor(name: string, idx: string = '', bonds: (string | number)[] = [], states: string[] = []) {
    this.name = name;
    this.idx = idx || `${name}_${randInt(0, 100000)}`;
    this.states = states || [];
    this.bonds = bonds || [];
    this.activeState = '';
  }

  copy(): Component {
    const component = new Component(
      this.name,
      this.idx,
      deepCopy(this.bonds),
      deepCopy(this.states)
    );
    component.activeState = this.activeState;
    return component;
  }

  /**
   * Add a state to this component
   * @param state - The state to add (e.g., 'P', 'U', '0')
   * @param update - If true, also sets this as the active state
   */
  addState(state: string, update: boolean = true): void {
    if (!this.states.includes(state)) {
      this.states.push(state);
    }
    if (update) {
      this.setActiveState(state);
    }
  }

  /**
   * Add multiple states
   */
  addStates(states: string[], update: boolean = true): void {
    for (const state of states) {
      if (!this.states.includes(state)) {
        this.addState(state, update);
      }
    }
  }

  /**
   * Add a bond to this component
   * @param bondName - Bond identifier (number or '+' for any bond, '?' for optional)
   */
  addBond(bondName: string | number): void {
    const bondStr = String(bondName);
    // Prevent duplicates on same bond index
    if (!this.bonds.some(b => String(b) === bondStr)) {
      this.bonds.push(bondName);
    }
  }

  /**
   * Set the active state of this component
   */
  setActiveState(state: string): boolean {
    if (state !== '') {
      if (!this.states.includes(state)) {
        this.states.push(state);
      }
      this.activeState = state;
      return true;
    }
    this.activeState = '';
    return true;
  }

  /**
   * Get the name of this component
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if this component has wildcard bonds (+ or ?)
   */
  hasWildcardBonds(): boolean {
    return this.bonds.includes('+') || this.bonds.includes('?');
  }

  /**
   * Reset bonds and active state
   */
  reset(): void {
    this.bonds = [];
    if (this.states.includes('0')) {
      this.activeState = '0';
    }
  }

  /**
   * Get rule-style string representation (for patterns)
   * Format: name~state!bond!bond
   */
  getRuleStr(): string {
    let tmp = this.name;
    if (this.bonds.length > 0) {
      tmp += '!' + this.bonds.map(b => String(b)).join('!');
    }
    if (this.activeState !== '') {
      tmp += '~' + this.activeState;
    }
    return tmp;
  }

  /**
   * Get total string representation (all states)
   */
  getTotalStr(): string {
    return this.name + '~' + this.states.join('~');
  }

  /**
   * String representation for rules (active state only)
   */
  toString(): string {
    return this.getRuleStr();
  }

  /**
   * String representation for molecule types (all possible states)
   */
  str2(): string {
    let tmp = this.name;
    if (this.states.length > 0) {
      tmp += '~' + this.states.join('~');
    }
    return tmp;
  }

  /**
   * Hash function for comparisons
   */
  hash(): string {
    return this.name;
  }
}

// =============================================================================
// Molecule Class
// =============================================================================

/**
 * Represents a molecule type with components.
 * Molecules are the building blocks of species patterns.
 */
export class Molecule {
  name: string;
  idx: string;
  components: Component[];
  compartment: string;
  trueName: string;
  uniqueIdentifier: number;

  constructor(name: string, idx: string = '') {
    this.name = name;
    this.idx = idx || `${name}_${randInt(0, 100000)}`;
    this.components = [];
    this.compartment = '';
    this.trueName = '';
    this.uniqueIdentifier = randInt(0, 100000);
  }

  copy(): Molecule {
    const molecule = new Molecule(this.name, `${this.name}_${randInt(0, 1000000)}`);
    molecule.compartment = this.compartment;
    molecule.trueName = this.trueName;
    for (const element of this.components) {
      molecule.components.push(element.copy());
    }
    return molecule;
  }

  /**
   * Add a component to this molecule
   * @param component - The component to add
   * @param overlap - If true, merge with existing component of same name
   */
  addComponent(component: Component, overlap: boolean = false): void {
    if (!overlap) {
      this.components.push(component);
    } else {
      const existing = this.components.find(x => x.name === component.name);
      if (!existing) {
        this.components.push(component);
      } else {
        for (const state of component.states) {
          existing.addState(state);
        }
      }
    }
  }

  /**
   * Set the compartment for this molecule
   */
  setCompartment(compartment: string): void {
    this.compartment = compartment;
  }

  /**
   * Get a component by its ID
   */
  getComponentById(idx: string): Component | undefined {
    return this.components.find(c => c.idx === idx);
  }

  /**
   * Get all bond numbers used by this molecule's components
   */
  getBondNumbers(): number[] {
    const bondNumbers: number[] = [];
    for (const element of this.components) {
      for (const bond of element.bonds) {
        const num = typeof bond === 'number' ? bond : parseInt(bond, 10);
        if (!isNaN(num) && bond !== '+' && bond !== '?') {
          bondNumbers.push(num);
        }
      }
    }
    return bondNumbers;
  }

  /**
   * Get a component by its name
   */
  getComponent(componentName: string): Component | undefined {
    return this.components.find(c => c.getName() === componentName);
  }

  /**
   * Remove a component by name
   */
  removeComponent(componentName: string): void {
    const idx = this.components.findIndex(x => x.name === componentName);
    if (idx !== -1) {
      this.components.splice(idx, 1);
    }
  }

  /**
   * Remove multiple components
   */
  removeComponents(components: Component[]): void {
    for (const element of components) {
      const idx = this.components.indexOf(element);
      if (idx !== -1) {
        this.components.splice(idx, 1);
      }
    }
  }

  /**
   * Add a bond to a specific component
   */
  addBond(componentName: string, bondName: number): void {
    const bondNumbers = this.getBondNumbers();
    while (bondNumbers.includes(bondName)) {
      bondName += 1;
    }
    const component = this.getComponent(componentName);
    if (component) {
      component.addBond(bondName);
    }
  }

  /**
   * Get all components that have bonds
   */
  getComponentWithBonds(): Component[] {
    return this.components.filter(x => x.bonds.length > 0);
  }

  /**
   * Check if molecule contains a component with given name
   */
  contains(componentName: string): boolean {
    return this.components.some(x => x.name === componentName);
  }

  /**
   * Check if molecule has any wildcard bonds
   */
  hasWildcardBonds(): boolean {
    return this.components.some(c => c.hasWildcardBonds());
  }

  /**
   * Extend this molecule with components from another molecule
   */
  extend(molecule: Molecule): void {
    for (const element of molecule.components) {
      const existing = this.components.find(x => x.name === element.name);
      if (!existing) {
        this.components.push(deepCopy(element));
      } else {
        for (const bond of element.bonds) {
          existing.addBond(bond);
        }
        for (const state of element.states) {
          existing.addState(state);
        }
      }
    }
  }

  /**
   * Update this molecule with components from another
   */
  update(molecule: Molecule): void {
    for (const comp of molecule.components) {
      if (!this.components.some(x => x.name === comp.name)) {
        this.components.push(deepCopy(comp));
      }
    }
  }

  /**
   * Reset all components
   */
  reset(): void {
    for (const element of this.components) {
      element.reset();
    }
  }

  /**
   * Calculate distance (difference) from another molecule
   */
  distance(other: Molecule): number {
    let distance = 0;
    distance += this.name !== other.name ? 10000 : 0;

    const maxLen = Math.max(this.components.length, other.components.length);
    for (let i = 0; i < maxLen; i++) {
      const c1 = this.components[i];
      const c2 = other.components[i];
      if (!c1 || !c2) {
        distance += 1;
        continue;
      }
      distance += JSON.stringify(c1.bonds) !== JSON.stringify(c2.bonds) ? 1 : 0;
      distance += c1.activeState !== c2.activeState ? 1 : 0;
    }
    return distance;
  }

  /**
   * Compare with another molecule and unify states
   */
  compare(other: Molecule): void {
    this.components.sort((a, b) => a.name.localeCompare(b.name));
    other.components.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < Math.min(this.components.length, other.components.length); i++) {
      const c1 = this.components[i];
      const c2 = other.components[i];

      if (c1.activeState !== c2.activeState) {
        c1.activeState = '';
      }
    }
  }

  /**
   * String representation
   */
  toString(full: boolean = false): string {
    this.components.sort((a, b) => a.name.localeCompare(b.name));
    const interesting = full
      ? this.components
      : this.components.filter(c => c.bonds.length > 0 || c.activeState !== '');

    let finalStr = this.name;
    if (interesting.length > 0) {
      finalStr += '(' + interesting.map(x => x.toString()).join(',') + ')';
    } else if (full && this.components.length > 0) {
      // If full is true, we force parentheses for molecules with components
      finalStr += '(' + this.components.map(x => x.toString()).join(',') + ')';
    }

    if (this.compartment !== '') {
      finalStr += '@' + this.compartment;
    }
    return finalStr;
  }

  /**
   * Molecule type definition string (all possible states)
   */
  str2(): string {
    this.components.sort((a, b) => a.name.localeCompare(b.name));
    let finalStr = this.name;
    if (this.components.length > 0) {
      finalStr += '(' + this.components.map(x => x.str2()).join(',') + ')';
    }
    return finalStr;
  }

  /**
   * Simple string with just first component
   */
  str3(): string {
    if (this.components.length > 0) {
      return this.name + '(' + this.components[0].name + ')';
    }
    return this.name + '()';
  }
}

// =============================================================================
// Species Class
// =============================================================================

/**
 * Represents a species pattern - a collection of molecules with bonds between them.
 * This is the main unit of BNGL patterns.
 */
export class Species {
  molecules: Molecule[];
  bondNumbers: number[];
  bonds: [string, string][];
  identifier: number;
  idx: string;

  constructor() {
    this.molecules = [];
    this.bondNumbers = [];
    this.bonds = [];
    this.identifier = randInt(0, 100000);
    this.idx = '';
  }

  /**
   * Get all bond numbers used in this species
   */
  getBondNumbers(): number[] {
    const bondNumbers: number[] = [0];
    for (const element of this.molecules) {
      bondNumbers.push(...element.getBondNumbers());
    }
    return bondNumbers;
  }

  /**
   * Create a deep copy of this species
   */
  copy(): Species {
    const species = new Species();
    species.identifier = randInt(0, 1000000);
    species.idx = this.idx;
    for (const molecule of this.molecules) {
      species.molecules.push(molecule.copy());
    }
    species.bonds = this.bonds.map(b => [...b] as [string, string]);
    return species;
  }

  /**
   * Get a molecule by its ID
   */
  getMoleculeById(idx: string): Molecule | undefined {
    return this.molecules.find(m => m.idx === idx);
  }

  /**
   * Add a molecule to this species
   * @param molecule - The molecule to add
   * @param concatenate - If true, merge with existing molecule of same name
   * @param iteration - Which instance to merge with if concatenate is true
   */
  addMolecule(molecule: Molecule, concatenate: boolean = false, iteration: number = 1): void {
    if (!concatenate) {
      this.molecules.push(molecule);
    } else {
      let counter = 1;
      for (const element of this.molecules) {
        if (element.name === molecule.name) {
          if (iteration === counter) {
            element.extend(molecule);
            return;
          } else {
            counter++;
          }
        }
      }
      this.molecules.push(molecule);
    }
  }

  /**
   * Set compartment for all molecules
   */
  addCompartment(tags: string): void {
    for (const molecule of this.molecules) {
      if (!molecule.compartment) {
        molecule.setCompartment(tags);
      }
    }
  }

  /**
   * Delete a molecule by name and clean up associated bonds
   */
  deleteMolecule(moleculeName: string): void {
    const deadMolecule = this.molecules.find(m => m.name === moleculeName);
    if (!deadMolecule) return;

    const bondNumbers = deadMolecule.getBondNumbers();
    const idx = this.molecules.indexOf(deadMolecule);
    if (idx !== -1) {
      this.molecules.splice(idx, 1);
    }

    // Remove bonds from other molecules
    for (const element of this.molecules) {
      for (const component of element.components) {
        for (const number of bondNumbers) {
          const bondIdx = component.bonds.indexOf(String(number));
          if (bondIdx !== -1) {
            component.bonds.splice(bondIdx, 1);
          }
        }
      }
    }
  }

  /**
   * Get a molecule by name
   */
  getMolecule(moleculeName: string): Molecule | undefined {
    return this.molecules.find(m => m.name === moleculeName);
  }

  /**
   * Get the number of molecules in this species
   */
  getSize(): number {
    return this.molecules.length;
  }

  /**
   * Get list of molecule names
   */
  getMoleculeNames(): string[] {
    return this.molecules.map(x => x.name);
  }

  /**
   * Check if species contains a molecule with given name
   */
  contains(moleculeName: string): boolean {
    return this.molecules.some(m => m.name === moleculeName);
  }

  /**
   * Check if species has any wildcard bonds
   */
  hasWildCardBonds(): boolean {
    return this.molecules.some(m => m.hasWildcardBonds());
  }

  /**
   * Extend this species with content from another species
   */
  extend(species: Species, update: boolean = true): void {
    if (this.molecules.length === species.molecules.length) {
      const list1 = [...this.molecules].sort((a, b) =>
        a.components.length - b.components.length || a.name.localeCompare(b.name)
      );
      const list2 = [...species.molecules].sort((a, b) =>
        a.components.length - b.components.length || a.name.localeCompare(b.name)
      );

      for (let i = 0; i < list1.length; i++) {
        const selement = list1[i];
        const oelement = list2[i];
        const cocomponents = new Counter(oelement.components.map(x => x.name));

        for (const component of oelement.components) {
          const refcomponents = new Counter(selement.components.map(x => x.name));
          if ((refcomponents.get(component.name) || 0) < (cocomponents.get(component.name) || 0)) {
            selement.components.push(component);
          } else {
            const existing = selement.components.find(x => x.name === component.name);
            if (existing) {
              existing.addStates(component.states, update);
            }
          }
        }
      }
    } else {
      for (const element of species.molecules) {
        if (!this.molecules.some(x => x.name === element.name)) {
          this.addMolecule(deepCopy(element));
        } else {
          // Find best matching molecule based on bonds
          let bestMatch: Molecule | null = null;
          let bestScore = -1;
          const elementBonds = element.components.flatMap(c => c.bonds);

          for (const mol of this.molecules.filter(m => m.name === element.name)) {
            const molBonds = mol.components.flatMap(c => c.bonds);
            const score = this.sequenceMatchRatio(molBonds, elementBonds);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = mol;
            }
          }

          if (bestMatch) {
            for (const component of element.components) {
              const existing = bestMatch.components.find(x => x.name === component.name);
              if (!existing) {
                bestMatch.addComponent(deepCopy(component), update);
              } else {
                for (const state of component.states) {
                  existing.addState(state, update);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Helper function to calculate sequence similarity
   */
  private sequenceMatchRatio(seq1: (string | number)[], seq2: (string | number)[]): number {
    if (seq1.length === 0 && seq2.length === 0) return 1;
    if (seq1.length === 0 || seq2.length === 0) return 0;

    const s1 = seq1.map(String);
    const s2 = seq2.map(String);
    let matches = 0;

    for (const item of s1) {
      if (s2.includes(item)) {
        matches++;
      }
    }

    return (2 * matches) / (s1.length + s2.length);
  }

  /**
   * Update bond numbers to avoid conflicts
   */
  updateBonds(bondNumbers: number[]): void {
    const newBase = Math.max(...bondNumbers, 0) + 1;
    for (const element of this.molecules) {
      for (const component of element.components) {
        component.bonds = component.bonds.map(x => {
          const num = typeof x === 'number' ? x : parseInt(x, 10);
          if (!isNaN(num)) {
            return num + newBase;
          }
          return x;
        });
      }
    }
  }

  /**
   * Delete bond between two molecules
   */
  deleteBond(moleculePair: string[]): void {
    for (const molecule of this.molecules) {
      if (moleculePair.includes(molecule.name)) {
        const pairCopy = [...moleculePair];
        const idx = pairCopy.indexOf(molecule.name);
        if (idx !== -1) pairCopy.splice(idx, 1);

        for (const component of molecule.components) {
          if (pairCopy.some(p => p.toLowerCase() === component.name.toLowerCase())) {
            component.bonds = [];
          }
        }
      }
    }
  }

  /**
   * Append another species to this one
   */
  append(species: Species): void {
    const newSpecies = deepCopy(species);
    newSpecies.updateBonds(this.getBondNumbers());

    for (const element of newSpecies.molecules) {
      this.molecules.push(deepCopy(element));
    }
  }

  /**
   * Sort molecules for canonical representation
   */
  sort(): void {
    this.molecules.sort((a, b) => {
      // Sort by: component count, min bond number, bonded component count, active states, string length
      const aCompCount = a.components.length;
      const bCompCount = b.components.length;
      if (aCompCount !== bCompCount) return bCompCount - aCompCount;

      const getMinBond = (mol: Molecule): number => {
        const bonds = mol.components.flatMap(c => c.bonds);
        const nums = bonds
          .filter(b => b !== '+' && b !== '?')
          .map(b => typeof b === 'number' ? b : parseInt(b, 10))
          .filter(n => !isNaN(n));
        return nums.length > 0 ? Math.min(...nums) : 999;
      };

      const aMinBond = getMinBond(a);
      const bMinBond = getMinBond(b);
      if (aMinBond !== bMinBond) return aMinBond - bMinBond;

      const aBondedCount = a.components.filter(c => c.bonds.length > 0).length;
      const bBondedCount = b.components.filter(c => c.bonds.length > 0).length;
      if (aBondedCount !== bBondedCount) return bBondedCount - aBondedCount;

      const aStateCount = a.components.filter(c => c.activeState !== '' && c.activeState !== '0').length;
      const bStateCount = b.components.filter(c => c.activeState !== '' && c.activeState !== '0').length;
      if (aStateCount !== bStateCount) return bStateCount - aStateCount;

      const aStr = a.toString();
      const bStr = b.toString();
      if (aStr.length !== bStr.length) return aStr.length - bStr.length;

      return aStr.localeCompare(bStr);
    });
  }

  /**
   * Renumber bonds sequentially to canonicalize the pattern
   */
  renumberBonds(): void {
    const bondMap = new Map<string, number>();
    let nextBond = 1;

    for (const mol of this.molecules) {
      for (const comp of mol.components) {
        for (let i = 0; i < comp.bonds.length; i++) {
          const b = comp.bonds[i];
          if (b === '+' || b === '?') continue;

          const bStr = String(b);
          if (!bondMap.has(bStr)) {
            bondMap.set(bStr, nextBond++);
          }
          comp.bonds[i] = bondMap.get(bStr)!;
        }
      }
    }
  }

  /**
   * String representation (BNGL pattern)
   */
  toString(full: boolean = false): string {
    this.sort();
    return this.molecules.map(x => x.toString(full).replace(/-/g, '_')).join('.');
  }

  /**
   * Molecule type string representation
   */
  str2(): string {
    this.sort();
    return this.molecules.map(x => x.str2().replace(/-/g, '_')).join('.');
  }

  /**
   * Reset all molecules
   */
  reset(): void {
    for (const element of this.molecules) {
      element.reset();
    }
  }

  /**
   * Extract atomic patterns from this species for rule analysis
   */
  extractAtomicPatterns(
    action: string,
    site1: string,
    site2: string,
    differentiateDimers: boolean = false
  ): {
    atomicPatterns: Map<string, Species>;
    reactionCenter: string[];
    context: string[];
  } {
    const atomicPatterns = new Map<string, Species>();
    const bondedPatterns = new Map<string, Species>();
    const reactionCenter: Species[] = [];
    const context: Species[] = [];

    const nameCounter = new Counter(this.molecules.map(x => x.name));
    const nameCounterCopy = new Counter(this.molecules.map(x => x.name));
    this.sort();

    for (const molecule of this.molecules) {
      const moleculeCounter = (nameCounter.get(molecule.name) || 0) - (nameCounterCopy.get(molecule.name) || 0);
      nameCounterCopy.set(molecule.name, (nameCounterCopy.get(molecule.name) || 0) - 1);

      for (const component of molecule.components) {
        // One atomic pattern for the states
        if (component.activeState !== '') {
          const speciesStructure = new Species();
          speciesStructure.bonds = [...this.bonds];

          const molName = differentiateDimers
            ? `${molecule.name}%${moleculeCounter}`
            : molecule.name;
          const moleculeStructure = new Molecule(molName, molecule.idx);
          const componentStructure = new Component(component.name, component.idx);

          componentStructure.addState(component.activeState);
          componentStructure.activeState = component.activeState;
          moleculeStructure.addComponent(componentStructure);
          speciesStructure.addMolecule(moleculeStructure);

          if ([site1, site2].includes(componentStructure.idx) && action === 'StateChange') {
            reactionCenter.push(speciesStructure);
          } else {
            context.push(speciesStructure);
          }
          atomicPatterns.set(speciesStructure.toString(), speciesStructure);
        }

        // One atomic pattern for the bonds
        const speciesStructure = new Species();
        speciesStructure.bonds = [...this.bonds];

        const molName = differentiateDimers
          ? `${molecule.name}%${moleculeCounter}`
          : molecule.name;
        const moleculeStructure = new Molecule(molName, molecule.idx);
        const componentStructure = new Component(component.name, component.idx);
        moleculeStructure.addComponent(componentStructure);
        speciesStructure.addMolecule(moleculeStructure);

        if (component.bonds.length === 0) {
          atomicPatterns.set(speciesStructure.toString(), speciesStructure);
        } else {
          const bondKey = String(component.bonds[0]);
          if (bondKey !== '+') {
            componentStructure.addBond(1);
          } else {
            componentStructure.addBond('+');
          }

          if (!bondedPatterns.has(bondKey)) {
            bondedPatterns.set(bondKey, speciesStructure);
          } else if (bondKey !== '+' || bondedPatterns.get(bondKey)!.molecules.length === 0) {
            bondedPatterns.get(bondKey)!.addMolecule(moleculeStructure);
          }
        }

        if ([site1, site2].includes(componentStructure.idx) && action !== 'StateChange') {
          reactionCenter.push(speciesStructure);
        } else if (component.bonds.length > 0 || component.activeState === '') {
          context.push(speciesStructure);
        }
      }
    }

    for (const [key, value] of bondedPatterns) {
      atomicPatterns.set(value.toString(), value);
    }

    const reactionCenterStrs = reactionCenter
      .map(x => x.toString())
      .filter(x => atomicPatterns.has(x));
    const contextStrs = context
      .map(x => x.toString())
      .filter(x => atomicPatterns.has(x));

    return { atomicPatterns, reactionCenter: reactionCenterStrs, context: contextStrs };
  }

  /**
   * Get list of bonds as molecule-component pairs
   */
  listOfBonds(nameDict: Map<string, string>): Map<string, Map<string, [string, string][]>> {
    const listofbonds = new Map<string, Map<string, [string, string][]>>();

    for (const bond of this.bonds) {
      const mol1 = bond[0].replace(/_C[^_]*$/, '');
      const mol2 = bond[1].replace(/_C[^_]*$/, '');

      const mol1Name = nameDict.get(mol1) || mol1;
      const mol2Name = nameDict.get(mol2) || mol2;
      const bond0Name = nameDict.get(bond[0]) || bond[0];
      const bond1Name = nameDict.get(bond[1]) || bond[1];

      if (!listofbonds.has(mol1Name)) {
        listofbonds.set(mol1Name, new Map());
      }
      listofbonds.get(mol1Name)!.set(bond0Name, [[mol2Name, bond1Name]]);

      if (!listofbonds.has(mol2Name)) {
        listofbonds.set(mol2Name, new Map());
      }
      listofbonds.get(mol2Name)!.set(bond1Name, [[mol1Name, bond0Name]]);
    }

    return listofbonds;
  }
}

// =============================================================================
// Action Class
// =============================================================================

/**
 * Represents an action in a rule (AddBond, DeleteBond, StateChange, etc.)
 */
export class Action {
  action: string;
  site1: string;
  site2: string;

  constructor() {
    this.action = '';
    this.site1 = '';
    this.site2 = '';
  }

  setAction(action: string, site1: string, site2: string = ''): void {
    this.action = action;
    this.site1 = site1;
    this.site2 = site2;
  }

  toString(): string {
    return `${this.action}, ${this.site1}, ${this.site2}`;
  }
}

// =============================================================================
// Rule Class
// =============================================================================

/**
 * Represents a reaction rule with reactants, products, rates, and actions.
 */
export class Rule {
  label: string;
  reactants: Species[];
  products: Species[];
  rates: string[];
  bidirectional: boolean;
  actions: Action[];
  mapping: [string, string][];

  constructor(label: string = '') {
    this.label = label;
    this.reactants = [];
    this.products = [];
    this.rates = [];
    this.bidirectional = false;
    this.actions = [];
    this.mapping = [];
  }

  addReactant(reactant: Species): void {
    this.reactants.push(reactant);
  }

  addProduct(product: Species): void {
    this.products.push(product);
  }

  addReactantList(reactants: Species[]): void {
    this.reactants.push(...reactants);
  }

  addProductList(products: Species[]): void {
    this.products.push(...products);
  }

  addRate(rate: string): void {
    this.rates.push(rate);
  }

  addMapping(mapping: [string, string]): void {
    this.mapping.push(mapping);
  }

  addMappingList(mappingList: [string, string][]): void {
    this.mapping.push(...mappingList);
  }

  addActionList(actionList: Action[]): void {
    this.actions.push(...actionList);
  }

  toString(): string {
    let finalStr = '';
    if (this.label !== '') {
      finalStr += `${this.label}: `;
    }
    const arrow = this.bidirectional ? ' <-> ' : ' -> ';
    finalStr += this.reactants.map(x => x.toString()).join(' + ') +
      arrow +
      this.products.map(x => x.toString()).join(' + ') +
      ' ' +
      this.rates.join(',');
    return finalStr;
  }
}

// =============================================================================
// Databases Class
// =============================================================================

/**
 * Container for various translation databases used during atomization.
 */
export class Databases {
  translator: Map<string, Species>;
  synthesisDatabase: Map<string, any>;
  catalysisDatabase: Map<string, any>;
  rawDatabase: Map<string, any>;
  labelDictionary: Map<string, any>;
  synthesisDatabase2: Map<string, any>;

  constructor() {
    this.translator = new Map();
    this.synthesisDatabase = new Map();
    this.catalysisDatabase = new Map();
    this.rawDatabase = new Map();
    this.labelDictionary = new Map();
    this.synthesisDatabase2 = new Map();
  }

  getRawDatabase(): Map<string, any> {
    return this.rawDatabase;
  }

  getLabelDictionary(): Map<string, any> {
    return this.labelDictionary;
  }

  add2LabelDictionary(key: string[], value: any): void {
    const temp = [...key].sort().join(',');
    this.labelDictionary.set(temp, value);
  }

  getTranslator(): Map<string, Species> {
    return this.translator;
  }
}

// =============================================================================
// States Class
// =============================================================================

/**
 * Simple container for state information.
 */
export class States {
  name: string;
  idx: string;

  constructor(name: string = '', idx: string = '') {
    this.name = name;
    this.idx = idx;
  }
}

// =============================================================================
// Parse BNGL pattern string
// =============================================================================

/**
 * Parse a BNGL pattern string into a Species object
 * @param patternStr - A BNGL pattern like "A(b!1,p~P).B(a!1)"
 */
export function readFromString(patternStr: string): Species {
  const sp = new Species();

  // Simple regex-based parser for BNGL patterns
  const moleculePattern = /([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/g;
  let match;

  while ((match = moleculePattern.exec(patternStr)) !== null) {
    const molName = match[1];
    const compStr = match[2];
    const mol = new Molecule(molName, '');

    if (compStr.trim() !== '') {
      // Parse components
      const components = compStr.split(',');
      for (const compDef of components) {
        const compMatch = compDef.match(/([A-Za-z_][A-Za-z0-9_]*)(?:~([^!]*))?(?:!(.+))?/);
        if (compMatch) {
          const comp = new Component(compMatch[1], '');
          if (compMatch[2]) {
            comp.addState(compMatch[2]);
          }
          if (compMatch[3]) {
            comp.addBond(compMatch[3]);
          }
          mol.addComponent(comp);
        }
      }
    }

    sp.addMolecule(mol);
  }

  return sp;
}
