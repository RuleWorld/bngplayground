/**
 * NFsimAnalysis.ts - Post-processing analysis for NFsim simulation output
 *
 * Extracts molecule-level information from NFsim species strings:
 * - Complex size distributions
 * - Bond occupancy per component
 * - Site state distributions
 * - Molecules per complex
 */

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Structured molecule type definition for analysis config */
export interface NFsimMoleculeType {
  name: string;
  components: Array<{ name: string; states?: string[] }>;
}

export interface NFsimAnalysisConfig {
  speciesTimeSeries: Array<{ time: number; species: Record<string, number> }>;
  moleculeTypes: NFsimMoleculeType[];
}

export interface ComplexSizeDistribution {
  time: number;
  sizeHistogram: Map<number, number>;
  meanSize: number;
  maxSize: number;
}

export interface BondOccupancy {
  moleculeType: string;
  component: string;
  timeSeries: Array<{ time: number; fractionBound: number }>;
}

export interface SiteStateDistribution {
  moleculeType: string;
  component: string;
  stateFractions: Map<string, Array<{ time: number; fraction: number }>>;
}

export interface NFsimAnalysisResult {
  complexSizes: ComplexSizeDistribution[];
  bondOccupancies: BondOccupancy[];
  siteStates: SiteStateDistribution[];
  moleculesPerComplex: Map<string, Array<{ time: number; mean: number }>>;
}

// ---------------------------------------------------------------------------
// Internal parsed representation
// ---------------------------------------------------------------------------

interface ParsedComponent {
  name: string;
  bond?: string;
  state?: string;
}

interface ParsedMolecule {
  type: string;
  components: ParsedComponent[];
}

interface ParsedSpecies {
  molecules: ParsedMolecule[];
}

// ---------------------------------------------------------------------------
// Lightweight BNGL species string parser
// ---------------------------------------------------------------------------

/**
 * Split a BNGL species string into top-level molecule tokens.
 * Molecules are separated by '.' at the top level (outside parentheses).
 * Example: "A(b!1,s~P).B(a!1)" -> ["A(b!1,s~P)", "B(a!1)"]
 */
function splitMolecules(speciesStr: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < speciesStr.length; i++) {
    const ch = speciesStr[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === '.' && depth === 0) {
      tokens.push(speciesStr.slice(start, i));
      start = i + 1;
    }
  }
  tokens.push(speciesStr.slice(start));
  return tokens;
}

/**
 * Parse a single component string like "name", "name~state", "name!bond",
 * or "name~state!bond".
 */
function parseComponent(compStr: string): ParsedComponent {
  const comp: ParsedComponent = { name: '' };

  // Order of parsing: name first, then optional ~state and/or !bond
  // Possible formats:
  //   name
  //   name~state
  //   name!bond
  //   name~state!bond
  //   name!bond~state  (unlikely but handle)

  let rest = compStr;

  // Find the first ~ or ! to determine end of name
  const tildeIdx = rest.indexOf('~');
  const bangIdx = rest.indexOf('!');

  let nameEnd: number;
  if (tildeIdx === -1 && bangIdx === -1) {
    nameEnd = rest.length;
  } else if (tildeIdx === -1) {
    nameEnd = bangIdx;
  } else if (bangIdx === -1) {
    nameEnd = tildeIdx;
  } else {
    nameEnd = Math.min(tildeIdx, bangIdx);
  }

  comp.name = rest.slice(0, nameEnd);
  rest = rest.slice(nameEnd);

  // Parse remaining modifiers
  while (rest.length > 0) {
    if (rest[0] === '~') {
      // State: read until next modifier or end
      const nextBang = rest.indexOf('!', 1);
      if (nextBang === -1) {
        comp.state = rest.slice(1);
        rest = '';
      } else {
        comp.state = rest.slice(1, nextBang);
        rest = rest.slice(nextBang);
      }
    } else if (rest[0] === '!') {
      // Bond: read until next modifier or end
      const nextTilde = rest.indexOf('~', 1);
      if (nextTilde === -1) {
        comp.bond = rest.slice(1);
        rest = '';
      } else {
        comp.bond = rest.slice(1, nextTilde);
        rest = rest.slice(nextTilde);
      }
    } else {
      break;
    }
  }

  return comp;
}

/**
 * Parse a single molecule token like "A(b!1,s~P)" into a ParsedMolecule.
 */
function parseMolecule(molStr: string): ParsedMolecule {
  const parenIdx = molStr.indexOf('(');
  if (parenIdx === -1) {
    // Molecule with no components
    return { type: molStr.trim(), components: [] };
  }

  const type = molStr.slice(0, parenIdx).trim();
  // Extract content between parens
  const inner = molStr.slice(parenIdx + 1, molStr.lastIndexOf(')'));

  if (inner.length === 0) {
    return { type, components: [] };
  }

  const components = inner.split(',').map(s => parseComponent(s.trim()));
  return { type, components };
}

/** Cache for parsed species strings (keyed by species string). */
const parseCache = new Map<string, ParsedSpecies>();

/**
 * Parse a full BNGL species string into a ParsedSpecies.
 * Results are cached for repeated lookups.
 */
function parseSpeciesString(speciesStr: string): ParsedSpecies {
  const cached = parseCache.get(speciesStr);
  if (cached) return cached;

  const molTokens = splitMolecules(speciesStr.trim());
  const molecules = molTokens.map(parseMolecule);
  const result: ParsedSpecies = { molecules };
  parseCache.set(speciesStr, result);
  return result;
}

// ---------------------------------------------------------------------------
// Analysis entry point
// ---------------------------------------------------------------------------

export function analyzeNFsimOutput(config: NFsimAnalysisConfig): NFsimAnalysisResult {
  // Clear parse cache for fresh analysis
  parseCache.clear();

  const { speciesTimeSeries, moleculeTypes } = config;

  // Build a set of known molecule types and their stateful components
  const molTypeMap = new Map<string, NFsimMoleculeType>();
  for (const mt of moleculeTypes) {
    molTypeMap.set(mt.name, mt);
  }

  // Collect all unique (moleculeType, component) pairs that have bonds
  // and all that have states, from the molecule type definitions
  const bondComponents: Array<{ moleculeType: string; component: string }> = [];
  const stateComponents: Array<{
    moleculeType: string;
    component: string;
    possibleStates: string[];
  }> = [];

  for (const mt of moleculeTypes) {
    for (const comp of mt.components) {
      // Every component can potentially be bound
      bondComponents.push({ moleculeType: mt.name, component: comp.name });
      if (comp.states && comp.states.length > 0) {
        stateComponents.push({
          moleculeType: mt.name,
          component: comp.name,
          possibleStates: comp.states,
        });
      }
    }
  }

  // All known molecule type names for molecules-per-complex tracking
  const molTypeNames = moleculeTypes.map(mt => mt.name);

  // ----------- Per-time-point analysis -----------

  const complexSizes: ComplexSizeDistribution[] = [];

  // Intermediate accumulators keyed by "molType:comp"
  const bondTimeSeries = new Map<string, Array<{ time: number; fractionBound: number }>>();
  for (const bc of bondComponents) {
    bondTimeSeries.set(`${bc.moleculeType}:${bc.component}`, []);
  }

  const stateTimeSeries = new Map<
    string,
    Map<string, Array<{ time: number; fraction: number }>>
  >();
  for (const sc of stateComponents) {
    const stateMap = new Map<string, Array<{ time: number; fraction: number }>>();
    for (const s of sc.possibleStates) {
      stateMap.set(s, []);
    }
    stateTimeSeries.set(`${sc.moleculeType}:${sc.component}`, stateMap);
  }

  const molPerComplexTimeSeries = new Map<string, Array<{ time: number; mean: number }>>();
  for (const name of molTypeNames) {
    molPerComplexTimeSeries.set(name, []);
  }

  for (const tp of speciesTimeSeries) {
    const { time, species } = tp;

    // --- Complex size distribution ---
    const sizeHistogram = new Map<number, number>();
    let totalComplexes = 0;
    let sumSize = 0;
    let maxSize = 0;

    // --- Bond occupancy accumulators: total and bound counts per (molType, comp) ---
    const bondTotal = new Map<string, number>();
    const bondBound = new Map<string, number>();
    for (const bc of bondComponents) {
      const key = `${bc.moleculeType}:${bc.component}`;
      bondTotal.set(key, 0);
      bondBound.set(key, 0);
    }

    // --- State accumulators: count per (molType, comp, state) ---
    const stateCount = new Map<string, Map<string, number>>();
    const stateTotal = new Map<string, number>();
    for (const sc of stateComponents) {
      const key = `${sc.moleculeType}:${sc.component}`;
      stateTotal.set(key, 0);
      const counts = new Map<string, number>();
      for (const s of sc.possibleStates) {
        counts.set(s, 0);
      }
      stateCount.set(key, counts);
    }

    // --- Molecules per complex accumulators ---
    // Sum of (count_of_molType_in_complex * species_count) per molType
    const molCountSum = new Map<string, number>();
    // Total number of complexes that contain at least one molecule of that type
    const molComplexCount = new Map<string, number>();
    for (const name of molTypeNames) {
      molCountSum.set(name, 0);
      molComplexCount.set(name, 0);
    }

    // Iterate over all species at this time point
    for (const [specStr, count] of Object.entries(species)) {
      if (count === 0) continue;

      const parsed = parseSpeciesString(specStr);
      const numMolecules = parsed.molecules.length;

      // Complex size
      sizeHistogram.set(numMolecules, (sizeHistogram.get(numMolecules) || 0) + count);
      totalComplexes += count;
      sumSize += numMolecules * count;
      if (numMolecules > maxSize) maxSize = numMolecules;

      // Count molecules of each type in this complex
      const molTypeCounts = new Map<string, number>();
      for (const mol of parsed.molecules) {
        molTypeCounts.set(mol.type, (molTypeCounts.get(mol.type) || 0) + 1);
      }

      // Molecules per complex
      for (const [molType, molCount] of molTypeCounts) {
        if (molCountSum.has(molType)) {
          molCountSum.set(molType, molCountSum.get(molType)! + molCount * count);
          molComplexCount.set(molType, molComplexCount.get(molType)! + count);
        }
      }

      // Per-molecule analysis
      for (const mol of parsed.molecules) {
        for (const comp of mol.components) {
          const key = `${mol.type}:${comp.name}`;

          // Bond occupancy
          if (bondTotal.has(key)) {
            bondTotal.set(key, bondTotal.get(key)! + count);
            if (comp.bond !== undefined) {
              bondBound.set(key, bondBound.get(key)! + count);
            }
          }

          // State distribution
          if (comp.state !== undefined && stateCount.has(key)) {
            stateTotal.set(key, stateTotal.get(key)! + count);
            const counts = stateCount.get(key)!;
            if (counts.has(comp.state)) {
              counts.set(comp.state, counts.get(comp.state)! + count);
            } else {
              // Unknown state encountered in data - still track it
              counts.set(comp.state, count);
            }
          }
        }
      }
    }

    // Record complex size distribution
    const meanSize = totalComplexes > 0 ? sumSize / totalComplexes : 0;
    complexSizes.push({ time, sizeHistogram, meanSize, maxSize });

    // Record bond occupancy for this time point
    for (const bc of bondComponents) {
      const key = `${bc.moleculeType}:${bc.component}`;
      const total = bondTotal.get(key)!;
      const bound = bondBound.get(key)!;
      const fractionBound = total > 0 ? bound / total : 0;
      bondTimeSeries.get(key)!.push({ time, fractionBound });
    }

    // Record state distribution for this time point
    for (const sc of stateComponents) {
      const key = `${sc.moleculeType}:${sc.component}`;
      const total = stateTotal.get(key)!;
      const counts = stateCount.get(key)!;
      const stateMap = stateTimeSeries.get(key)!;
      for (const [state, stateArr] of stateMap) {
        const cnt = counts.get(state) || 0;
        const fraction = total > 0 ? cnt / total : 0;
        stateArr.push({ time, fraction });
      }
    }

    // Record molecules per complex for this time point
    for (const name of molTypeNames) {
      const sum = molCountSum.get(name)!;
      const complexCount = molComplexCount.get(name)!;
      const mean = complexCount > 0 ? sum / complexCount : 0;
      molPerComplexTimeSeries.get(name)!.push({ time, mean });
    }
  }

  // ----------- Assemble results -----------

  const bondOccupancies: BondOccupancy[] = bondComponents.map(bc => ({
    moleculeType: bc.moleculeType,
    component: bc.component,
    timeSeries: bondTimeSeries.get(`${bc.moleculeType}:${bc.component}`)!,
  }));

  const siteStates: SiteStateDistribution[] = stateComponents.map(sc => ({
    moleculeType: sc.moleculeType,
    component: sc.component,
    stateFractions: stateTimeSeries.get(`${sc.moleculeType}:${sc.component}`)!,
  }));

  return {
    complexSizes,
    bondOccupancies,
    siteStates,
    moleculesPerComplex: molPerComplexTimeSeries,
  };
}
