/**
 * Dynamic Contact Map — maps simulation results back to contact map elements.
 *
 * Ported from RuleBender's MoleculeCounter.java / SmallMultiple.java:
 * For each time point, parse species concentrations and aggregate to
 * molecule-level abundances and bond occupancy fractions.
 *
 * Uses the actual SimulationResults type:
 *   - speciesHeaders: string[] (species pattern names like "A(b!1,s~U).B(b!1)")
 *   - speciesData: Record<string, number>[] (rows with "time" + species cols)
 */

import type { SimulationResults, BNGLMoleculeType } from '../../types';
import { parseSpeciesGraphs, extractBonds } from './speciesGraphUtils';

/** Snapshot of contact map element annotations at a single time point */
export interface ContactMapSnapshot {
  time: number;
  /** Molecule name -> total abundance (sum of species containing it) */
  moleculeAbundance: Map<string, number>;
  /** "Mol.Comp~State" -> fractional occupancy [0,1] */
  stateFractions: Map<string, number>;
  /** "Mol1.Comp1--Mol2.Comp2" -> fraction of molecules with bond [0,1] */
  bondOccupancy: Map<string, number>;
}

/**
 * Build time-indexed snapshots from simulation results.
 *
 * We parse each species header into a graph to identify which molecules,
 * states, and bonds it contains, then weight by concentration at each
 * time point.
 */
export function buildContactMapSnapshots(
  results: SimulationResults,
  moleculeTypes: BNGLMoleculeType[] = [],
): ContactMapSnapshot[] {
  const speciesHeaders = results.speciesHeaders;
  const speciesData = results.speciesData;

  if (!speciesHeaders || !speciesData || speciesData.length === 0) {
    return [];
  }

  // Pre-parse species: for each header, extract molecules, states, bonds
  const speciesInfo = parseSpeciesInfo(speciesHeaders);

  return speciesData.map(row => {
    const time = row['time'] ?? 0;
    const moleculeAbundance = new Map<string, number>();
    const stateCounters = new Map<string, number>();
    const molTotalForState = new Map<string, number>();
    const bondCounters = new Map<string, number>();
    const molTotalForBond = new Map<string, number>();

    for (let i = 0; i < speciesHeaders.length; i++) {
      const header = speciesHeaders[i];
      const concentration = row[header] ?? 0;
      if (concentration === 0) continue;

      const info = speciesInfo[i];
      if (!info) continue;

      // Molecule abundances
      for (const [mol, count] of info.moleculeCounts) {
        moleculeAbundance.set(
          mol,
          (moleculeAbundance.get(mol) ?? 0) + concentration * count,
        );
      }

      // State occupancy
      for (const stateKey of info.states) {
        const mol = stateKey.split('.')[0];
        stateCounters.set(
          stateKey,
          (stateCounters.get(stateKey) ?? 0) + concentration,
        );
        molTotalForState.set(
          mol,
          (molTotalForState.get(mol) ?? 0) + concentration,
        );
      }

      // Bond occupancy
      for (const bondKey of info.bonds) {
        const parts = bondKey.split('--');
        const mol1 = parts[0].split('.')[0];
        bondCounters.set(
          bondKey,
          (bondCounters.get(bondKey) ?? 0) + concentration,
        );
        molTotalForBond.set(
          mol1,
          (molTotalForBond.get(mol1) ?? 0) + concentration,
        );
      }
    }

    // Normalize state fractions
    const stateFractions = new Map<string, number>();
    for (const [key, count] of stateCounters) {
      const mol = key.split('.')[0];
      const total = molTotalForState.get(mol) ?? 1;
      stateFractions.set(key, total > 0 ? count / total : 0);
    }

    // Normalize bond occupancy
    const bondOccupancy = new Map<string, number>();
    for (const [key, count] of bondCounters) {
      const parts = key.split('--');
      const mol1 = parts[0].split('.')[0];
      const total = molTotalForBond.get(mol1) ?? 1;
      bondOccupancy.set(key, total > 0 ? count / total : 0);
    }

    return { time, moleculeAbundance, stateFractions, bondOccupancy };
  });
}

interface SpeciesInfo {
  moleculeCounts: Map<string, number>;
  states: string[];     // "Mol.Comp~State" entries
  bonds: string[];      // "Mol1.Comp1--Mol2.Comp2" entries
}

function parseSpeciesInfo(headers: string[]): Array<SpeciesInfo | null> {
  return headers.map(header => {
    try {
      const sanitize = (name: string) => name.split('.')[0];
      const graphs = parseSpeciesGraphs([header]);
      if (graphs.length === 0) return null;

      const moleculeCounts = new Map<string, number>();
      const states: string[] = [];
      const bonds: string[] = [];

      for (const graph of graphs) {
        for (const mol of graph.molecules) {
          if (mol.name === '0') continue;
          const molName = sanitize(mol.name);
          moleculeCounts.set(molName, (moleculeCounts.get(molName) ?? 0) + 1);

          for (const comp of mol.components) {
            if (comp.state && comp.state !== '?' && comp.state !== '*') {
              states.push(`${molName}.${comp.name}~${comp.state}`);
            }
          }
        }
      }

      // Use the existing extractBonds utility which reads graph.adjacency
      const bondMap = extractBonds(graphs);
      for (const [, bondInfo] of bondMap) {
        const a = `${bondInfo.mol1}.${bondInfo.comp1}`;
        const b = `${bondInfo.mol2}.${bondInfo.comp2}`;
        bonds.push([a, b].sort().join('--'));
      }

      return { moleculeCounts, states, bonds };
    } catch {
      return null;
    }
  });
}
