// graph/core/SpeciesGraph.ts
import { Molecule } from './Molecule.ts';

export class SpeciesGraph {
  molecules: Molecule[];
  adjacency: Map<string, string[]>;  // "molIdx.compIdx" => ["molIdx.compIdx", ...] (supports multi-site bonding)
  compartment?: string;  // species-level compartment
  adjacencyBitset?: Uint32Array;

  // Cached properties
  private _stringExact?: string;
  private _canonicalString?: string;  // Cached canonical form
  private _componentOffsets?: number[];
  private _componentCount?: number;

  constructor(molecules: Molecule[] = []) {
    this.molecules = molecules;
    this.adjacency = new Map();
    this.adjacencyBitset = undefined;
    this._componentOffsets = undefined;
    this._componentCount = undefined;
  }

  /**
   * BioNetGen: SpeciesGraph::addBond()
   * Create edge between two components
   * Supports multi-site bonding where one component can have multiple bonds
   */
  addBond(mol1: number, comp1: number, mol2: number, comp2: number, bondLabel?: number): void {
    const compA = this.molecules[mol1].components[comp1];
    const compB = this.molecules[mol2].components[comp2];

    // Find next available bond label if not specified
    // FIX: Check if bondLabel is defined (including 0)
    const label = (bondLabel !== undefined) ? bondLabel : this.getNextBondLabel();

    // Update adjacency map (both directions) - supports multi-site bonding
    const key1 = `${mol1}.${comp1}`;
    const key2 = `${mol2}.${comp2}`;

    // Add key2 to key1's partner list (avoid duplicates)
    if (!this.adjacency.has(key1)) {
      this.adjacency.set(key1, []);
    }
    const partners1 = this.adjacency.get(key1)!;
    if (!partners1.includes(key2)) {
      partners1.push(key2);
    }

    // Add key1 to key2's partner list (avoid duplicates)
    if (!this.adjacency.has(key2)) {
      this.adjacency.set(key2, []);
    }
    const partners2 = this.adjacency.get(key2)!;
    if (!partners2.includes(key1)) {
      partners2.push(key1);
    }

    // Update Component.edges for VF2 matching
    // FIX: Remove any existing "unresolved" edges that might have been set by parser
    if (compA.edges.has(label) && compA.edges.get(label) === -1) {
      compA.edges.delete(label);
    }
    if (compB.edges.has(label) && compB.edges.get(label) === -1) {
      compB.edges.delete(label);
    }

    compA.edges.set(label, comp2);
    compB.edges.set(label, comp1);

    // Invalidate caches
    this._stringExact = undefined;
    this._canonicalString = undefined;
    this.adjacencyBitset = undefined;
    this._componentOffsets = undefined;
    this._componentCount = undefined;
  }

  /**
   * Get next available bond label
   */
  private getNextBondLabel(): number {
    let maxLabel = 0;
    const used = new Set<number>();

    for (const mol of this.molecules) {
      for (const comp of mol.components) {
        for (const label of comp.edges.keys()) {
          if (typeof label === 'number' && Number.isInteger(label)) {
            used.add(label);
            if (label > maxLabel) {
              maxLabel = label;
            }
          }
        }
      }
    }

    let candidate = maxLabel + 1;
    while (used.has(candidate)) {
      candidate += 1;
    }

    return candidate;
  }

  /**
   * BioNetGen: SpeciesGraph::deleteBond()
   * Safely removes a bond between a component and its partner.
   * For multi-site bonding, removes all bonds from this component.
   */
  deleteBond(mol: number, comp: number): void {
    const key = `${mol}.${comp}`;
    const partners = this.adjacency.get(key);

    const labelsPerPartner = new Map<string, Set<number>>();
    const molecule = this.molecules[mol];
    const component = molecule?.components[comp];
    if (component && partners) {
      for (const [label] of component.edges.entries()) {
        for (const partner of partners) {
          const [pMolStr, pCompStr] = partner.split('.');
          const pMol = Number(pMolStr);
          const pComp = Number(pCompStr);
          const pComponent = this.molecules[pMol]?.components[pComp];
          if (!pComponent) continue;
          if (pComponent.edges.has(label) && pComponent.edges.get(label) === comp) {
            if (!labelsPerPartner.has(partner)) {
              labelsPerPartner.set(partner, new Set<number>());
            }
            labelsPerPartner.get(partner)!.add(label);
          }
        }
      }
    }

    // 1. Remove forward link from adjacency
    this.adjacency.delete(key);

    // 2. Remove edge from this component
    if (molecule) {
      if (component) {
        component.edges.clear();
      }
    }

    // 3. Handle partners (all of them for multi-site bonding)
    if (partners) {
      for (const partner of partners) {
        // Remove us from partner's list
        const partnerPartners = this.adjacency.get(partner);
        if (partnerPartners) {
          const idx = partnerPartners.indexOf(key);
          if (idx >= 0) {
            partnerPartners.splice(idx, 1);
          }
          // If partner has no more partners, remove it from adjacency
          if (partnerPartners.length === 0) {
            this.adjacency.delete(partner);
          }
        }

        // Clear partner component edges that point to us
        const [pMolStr, pCompStr] = partner.split('.');
        const pMol = Number(pMolStr);
        const pComp = Number(pCompStr);
        const pMolecule = this.molecules[pMol];
        if (pMolecule) {
          const pComponent = pMolecule.components[pComp];
          if (pComponent) {
            // Remove only labels that are confirmed to connect to this exact endpoint
            const labelsToRemove = labelsPerPartner.get(partner);
            if (labelsToRemove) {
              for (const label of labelsToRemove) {
                pComponent.edges.delete(label);
              }
            }
          }
        }
      }
    }

    this.adjacencyBitset = undefined;
    this._componentOffsets = undefined;
    this._componentCount = undefined;
  }

  /**
   * Merge another graph into this one. Returns the molecule index offset.
   */
  merge(other: SpeciesGraph): number {
    const offset = this.molecules.length;

    // Clone and add molecules
    for (const mol of other.molecules) {
      this.molecules.push(mol.clone());
    }

    // Calculate max bond label in current graph to apply offset
    let maxBond = 0;
    for (const mol of this.molecules) {
      if (mol === undefined) continue; // Safety check
      for (const comp of mol.components) {
        for (const label of comp.edges.keys()) {
          if (label > maxBond) maxBond = label;
        }
      }
    }
    const bondOffset = maxBond + 1;

    // Rebuild adjacency for the new molecules based on the cloned components
    // Support multi-site bonding where one component can have multiple partners
    for (let i = 0; i < other.molecules.length; i++) {
      const newMolIdx = offset + i;
      const mol = this.molecules[newMolIdx];

      for (let c = 0; c < mol.components.length; c++) {
        const comp = mol.components[c];
        const newEdges = new Map<number, number>();
        const oldKey = `${i}.${c}`;
        const oldPartners = other.adjacency.get(oldKey);

        // Update edges with offset
        for (const [label, targetCompIdx] of comp.edges.entries()) {
          newEdges.set(label + bondOffset, targetCompIdx);
        }
        comp.edges = newEdges;

        if (oldPartners) {
          for (const oldPartner of oldPartners) {
            const [oldPartnerMol, oldPartnerComp] = oldPartner.split('.').map(Number);
            const newPartnerMol = offset + oldPartnerMol;
            const newPartnerComp = oldPartnerComp;

            const newKey = `${newMolIdx}.${c}`;
            const newPartnerKey = `${newPartnerMol}.${newPartnerComp}`;

            // Add to adjacency (supports multi-site)
            if (!this.adjacency.has(newKey)) {
              this.adjacency.set(newKey, []);
            }
            const partners = this.adjacency.get(newKey)!;
            if (!partners.includes(newPartnerKey)) {
              partners.push(newPartnerKey);
            }
          }
        }
      }
    }

    this.adjacencyBitset = undefined;
    this._componentOffsets = undefined;
    this._componentCount = undefined;

    return offset;
  }

  /**
   * Find all molecules in the same connected component as the given molecule.
   */
  getConnectedComponentMolecules(molIdx: number): Set<number> {
    const visited = new Set<number>();
    if (molIdx < 0 || molIdx >= this.molecules.length) return visited;

    const queue = [molIdx];
    visited.add(molIdx);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      // Check neighbors via adjacency (support multi-site bonding)
      const mol = this.molecules[curr];
      for (let c = 0; c < mol.components.length; c++) {
        const key = `${curr}.${c}`;
        const partners = this.adjacency.get(key);
        if (partners) {
          for (const partner of partners) {
            const [pMol] = partner.split('.').map(Number);
            if (!visited.has(pMol)) {
              visited.add(pMol);
              queue.push(pMol);
            }
          }
        }
      }
    }
    return visited;
  }

  /**
   * Split graph into connected components (separate species)
   */
  split(): SpeciesGraph[] {
    const visited = new Set<number>();
    const graphs: SpeciesGraph[] = [];

    for (let i = 0; i < this.molecules.length; i++) {
      if (visited.has(i)) continue;

      const componentMols: number[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        componentMols.push(curr);

        // Check neighbors via adjacency (support multi-site bonding)
        const mol = this.molecules[curr];
        for (let c = 0; c < mol.components.length; c++) {
          const key = `${curr}.${c}`;
          const partners = this.adjacency.get(key);
          if (partners) {
            for (const partner of partners) {
              const [pMol] = partner.split('.').map(Number);
              if (!visited.has(pMol)) {
                visited.add(pMol);
                queue.push(pMol);
              }
            }
          }
        }
      }

      // Build new graph for this component
      const oldToNew = new Map<number, number>();
      componentMols.sort((a, b) => a - b); // keep relative order
      componentMols.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));

      const newMolecules = componentMols.map(idx => this.molecules[idx].clone());
      for (const molecule of newMolecules) {
        for (const component of molecule.components) {
          component.edges.clear();
        }
      }
      const newGraph = new SpeciesGraph(newMolecules);

      // Reconstruct bonds (support multi-site bonding)
      const addedBonds = new Set<string>(); // Track added bonds to avoid duplicates
      componentMols.forEach(oldMolIdx => {
        const mol = this.molecules[oldMolIdx];
        mol.components.forEach((comp, compIdx) => {
          const key = `${oldMolIdx}.${compIdx}`;
          const partners = this.adjacency.get(key);
          if (partners) {
            for (const partner of partners) {
              const [pMolIdx, pCompIdx] = partner.split('.').map(Number);
              // Create canonical bond key to avoid duplicates
              const bondKey = oldMolIdx < pMolIdx || (oldMolIdx === pMolIdx && compIdx < pCompIdx)
                ? `${oldMolIdx}.${compIdx}-${pMolIdx}.${pCompIdx}`
                : `${pMolIdx}.${pCompIdx}-${oldMolIdx}.${compIdx}`;

              if (!addedBonds.has(bondKey)) {
                addedBonds.add(bondKey);
                // Find bond label
                let label: number | undefined;
                const partnerComp = this.molecules[pMolIdx].components[pCompIdx];
                for (const [l, targetC] of comp.edges.entries()) {
                  if (targetC !== pCompIdx) continue;
                  if (partnerComp.edges.has(l) && partnerComp.edges.get(l) === compIdx) {
                    label = l;
                    break;
                  }
                }
                if (label === undefined) {
                  for (const [l, targetC] of comp.edges.entries()) {
                    if (targetC === pCompIdx) {
                      label = l;
                      break;
                    }
                  }
                }

                const newM1 = oldToNew.get(oldMolIdx)!;
                const newM2 = oldToNew.get(pMolIdx)!;
                newGraph.addBond(newM1, compIdx, newM2, pCompIdx, label);
              }
            }
          }
        });
      });

      // Propagate compartment
      newGraph.compartment = this.compartment;

      graphs.push(newGraph);
    }

    return graphs;
  }

  /**
   * VF2++ optimization: build a compact bitset encoding bonds for O(1) lookups.
   */
  buildAdjacencyBitset(): void {
    if (
      this.adjacencyBitset &&
      this._componentOffsets &&
      typeof this._componentCount === 'number'
    ) {
      return;
    }

    const offsets: number[] = [];
    let runningIndex = 0;

    for (const mol of this.molecules) {
      offsets.push(runningIndex);
      runningIndex += mol.components.length;
    }

    const totalComponents = runningIndex;
    this._componentOffsets = offsets;
    this._componentCount = totalComponents;

    if (totalComponents === 0) {
      this.adjacencyBitset = new Uint32Array(0);
      return;
    }

    const bitsetSize = Math.ceil((totalComponents * totalComponents) / 32);
    this.adjacencyBitset = new Uint32Array(bitsetSize);

    const getIndex = (molIdx: number, compIdx: number): number => {
      return offsets[molIdx] + compIdx;
    };

    for (const [key, partnerKeys] of this.adjacency.entries()) {
      const [molAStr, compAStr] = key.split('.');
      const molA = Number(molAStr);
      const compA = Number(compAStr);

      for (const partnerKey of partnerKeys) {
        const [molBStr, compBStr] = partnerKey.split('.');
        const molB = Number(molBStr);
        const compB = Number(compBStr);

        if (
          Number.isNaN(molA) ||
          Number.isNaN(compA) ||
          Number.isNaN(molB) ||
          Number.isNaN(compB)
        ) {
          continue;
        }

        const idxA = getIndex(molA, compA);
        const idxB = getIndex(molB, compB);
        const bitIndex = idxA * totalComponents + idxB;
        const arrayIndex = Math.floor(bitIndex / 32);
        const bitPosition = bitIndex % 32;
        const mask = (1 << bitPosition) >>> 0;
        this.adjacencyBitset[arrayIndex] |= mask;
      }
    }
  }

  hasBondFast(molA: number, compA: number, molB: number, compB: number): boolean {
    if (!this.adjacencyBitset || !this._componentOffsets || !this._componentCount) {
      this.buildAdjacencyBitset();
      if (!this.adjacencyBitset || !this._componentOffsets || !this._componentCount) {
        const keyA = `${molA}.${compA}`;
        const keyB = `${molB}.${compB}`;
        const partnersA = this.adjacency.get(keyA);
        return partnersA !== undefined && partnersA.includes(keyB);
      }
    }

    const total = this._componentCount;
    if (!total) {
      const keyA = `${molA}.${compA}`;
      const keyB = `${molB}.${compB}`;
      const partnersA = this.adjacency.get(keyA);
      return partnersA !== undefined && partnersA.includes(keyB);
    }

    const idxA = this._componentOffsets[molA] + compA;
    const idxB = this._componentOffsets[molB] + compB;
    const bitIndex = idxA * total + idxB;
    const arrayIndex = Math.floor(bitIndex / 32);
    const bitPosition = bitIndex % 32;
    const mask = (1 << bitPosition) >>> 0;

    if (arrayIndex >= this.adjacencyBitset.length) {
      return false;
    }

    return (this.adjacencyBitset[arrayIndex] & mask) !== 0;
  }

  componentHasAnyBond(molIdx: number, compIdx: number): boolean {
    if (!this.adjacencyBitset || !this._componentOffsets || !this._componentCount) {
      this.buildAdjacencyBitset();
      if (!this.adjacencyBitset || !this._componentOffsets || !this._componentCount) {
        const key = `${molIdx}.${compIdx}`;
        return this.adjacency.has(key);
      }
    }

    const total = this._componentCount;
    if (!total) {
      const key = `${molIdx}.${compIdx}`;
      return this.adjacency.has(key);
    }

    const rowIndex = this._componentOffsets[molIdx] + compIdx;
    const startBit = rowIndex * total;
    let remaining = total;
    let bitIndex = startBit;

    while (remaining > 0) {
      const arrayIndex = Math.floor(bitIndex / 32);
      const bitOffset = bitIndex % 32;
      const chunkSize = Math.min(32 - bitOffset, remaining);

      if (chunkSize === 32 && bitOffset === 0) {
        if (this.adjacencyBitset[arrayIndex] !== 0) {
          return true;
        }
      } else {
        const chunk = this.adjacencyBitset[arrayIndex] >>> bitOffset;
        const mask = chunkSize >= 32 ? 0xffffffff : ((1 << chunkSize) - 1);
        if ((chunk & mask) !== 0) {
          return true;
        }
      }

      remaining -= chunkSize;
      bitIndex += chunkSize;
    }

    return false;
  }

  /**
   * BioNetGen: SpeciesGraph::toString() / StringExact()
   * Non-canonical string (molecule order as-is)
   */
  toString(): string {
    if (this._stringExact) return this._stringExact;
    const moleculesStr = this.molecules.map(m => m.toString()).join('.');
    let str = moleculesStr;
    if (this.compartment) {
      // Use single colon for web-compatible serialization
      str = `@${this.compartment}:${str}`;
    }
    this._stringExact = str;
    return this._stringExact;
  }

  /**
   * Get or set the cached canonical string.
   * Used by GraphCanonicalizer to avoid recomputing.
   */
  get cachedCanonical(): string | undefined {
    return this._canonicalString;
  }

  set cachedCanonical(value: string | undefined) {
    this._canonicalString = value;
  }

  /**
   * BioNetGen: SpeciesGraph::findMaps()
   * Find all isomorphisms from pattern to this graph
   * Returns array of Map<patternMolIdx, thisMolIdx>
   */
  findMaps(_pattern: SpeciesGraph): Map<number, number>[] {
    // This is the core isomorphism algorithm - implement VF2 or Ullmann
    // See Phase 2 below for full implementation
    return [];
  }

  /**
   * Deep clone
   */
  clone(): SpeciesGraph {
    const sg = new SpeciesGraph(this.molecules.map(m => m.clone()));
    // BUG FIX: Deep clone adjacency Map values (arrays) to prevent mutation
    sg.adjacency = new Map();
    for (const [key, partners] of this.adjacency.entries()) {
      sg.adjacency.set(key, [...partners]);
    }
    sg.compartment = this.compartment;
    if (this.adjacencyBitset) {
      sg.adjacencyBitset = this.adjacencyBitset.slice();
    }
    if (this._componentOffsets) {
      sg._componentOffsets = [...this._componentOffsets];
    }
    if (typeof this._componentCount === 'number') {
      sg._componentCount = this._componentCount;
    }
    return sg;
  }
}