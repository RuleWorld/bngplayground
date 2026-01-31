// graph/core/Species.ts
import { SpeciesGraph } from './SpeciesGraph.ts';
import { GraphCanonicalizer } from './Canonical.ts';

export class Species {
  graph: SpeciesGraph;
  index: number;  // unique index in network
  concentration?: number;
  initialConcentration?: number; // Added to track initial values from seeds

  constructor(graph: SpeciesGraph, index: number, concentration?: number) {
    this.graph = graph;
    this.index = index;
    this.concentration = concentration;
  }

  /**
   * BioNetGen: Species::toString()
   */
  toString(): string {
    return this.graph.toString();
  }

  /**
   * Get canonical string for species identification
   */
  get canonicalString(): string {
    return GraphCanonicalizer.canonicalize(this.graph);
  }
}