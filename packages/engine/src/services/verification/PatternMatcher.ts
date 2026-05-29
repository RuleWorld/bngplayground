/**
 * PatternMatcher.ts
 * Pattern matching logic and species matching helpers extracted from BoundedVerifier.
 */

/* ---------- Types (shared with BoundedVerifier) ---------- */

export interface ParsedMolecule {
  name: string;
  components: ParsedComponent[];
}

export interface ParsedComponent {
  name: string;
  state?: string;
  bondLabel?: string;       // numeric bond label or wildcard
}

/* ---------- Pattern string parsing ---------- */

/**
 * Parse a BNGL species/pattern string into molecules.
 * E.g., "A(b!1,s~u).B(a!1)" => [{ name: 'A', components: [...] }, { name: 'B', ... }]
 */
export function parseSpeciesString(specStr: string): ParsedMolecule[] {
  const molecules: ParsedMolecule[] = [];
  const molStrings = splitTopLevel(specStr, '.');

  for (const molStr of molStrings) {
    const trimmed = molStr.trim();
    if (trimmed.length === 0) continue;

    const parenStart = trimmed.indexOf('(');
    if (parenStart === -1) {
      molecules.push({ name: trimmed, components: [] });
      continue;
    }

    const name = trimmed.substring(0, parenStart).trim();
    const parenEnd = trimmed.lastIndexOf(')');
    const compBody = trimmed.substring(parenStart + 1, parenEnd === -1 ? trimmed.length : parenEnd);

    const components: ParsedComponent[] = [];
    if (compBody.trim().length > 0) {
      const compParts = compBody.split(',');
      for (const part of compParts) {
        const t = part.trim();
        if (t.length === 0) continue;
        components.push(parseComponentString(t));
      }
    }

    molecules.push({ name, components });
  }

  return molecules;
}

/**
 * Parse a component string like "s~u" or "b!1" or "s~p!2" into parts.
 */
function parseComponentString(compStr: string): ParsedComponent {
  let name = compStr;
  let state: string | undefined;
  let bondLabel: string | undefined;

  // Extract bond label
  const bangIdx = name.indexOf('!');
  if (bangIdx !== -1) {
    bondLabel = name.substring(bangIdx + 1);
    name = name.substring(0, bangIdx);
  }

  // Extract state
  const tildeIdx = name.indexOf('~');
  if (tildeIdx !== -1) {
    state = name.substring(tildeIdx + 1);
    name = name.substring(0, tildeIdx);
  }

  return { name, state, bondLabel };
}

/**
 * Split a string on a delimiter at top-level (not inside parentheses).
 */
function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;

    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/* ---------- Canonical form ---------- */

/**
 * Produce a canonical string for a species (sorted molecules and components).
 * This allows deduplication of species during exploration.
 */
export function canonicalizeSpecies(molecules: ParsedMolecule[]): string {
  // Renumber bonds canonically
  const bondMap = new Map<string, number>();
  let nextBond = 1;

  // Sort molecules by name, then by component signature
  const sortedMols = [...molecules].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return moleculeSignature(a).localeCompare(moleculeSignature(b));
  });

  // First pass: assign canonical bond numbers in sorted order
  for (const mol of sortedMols) {
    const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));
    for (const comp of sortedComps) {
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        if (!bondMap.has(comp.bondLabel)) {
          bondMap.set(comp.bondLabel, nextBond++);
        }
      }
    }
  }

  // Second pass: produce canonical string
  const molStrings = sortedMols.map(mol => {
    const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));
    const compStr = sortedComps.map(comp => {
      let s = comp.name;
      if (comp.state) s += `~${comp.state}`;
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        s += `!${bondMap.get(comp.bondLabel)}`;
      } else if (comp.bondLabel) {
        s += `!${comp.bondLabel}`;
      }
      return s;
    }).join(',');
    return `${mol.name}(${compStr})`;
  });

  return molStrings.join('.');
}

function moleculeSignature(mol: ParsedMolecule): string {
  const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));
  return sortedComps.map(c => {
    let s = c.name;
    if (c.state) s += `~${c.state}`;
    return s;
  }).join(',');
}

/* ---------- Pattern matching ---------- */

/**
 * Check if a species (set of molecules) matches a pattern.
 * Pattern matching supports wildcards:
 *   - Missing component state in pattern means "any state"
 *   - Missing bond in pattern means "any bond state"
 *   - Specific bond label means that bond must exist between specific partners
 */
export function speciesMatchesPattern(
  species: ParsedMolecule[],
  pattern: ParsedMolecule[]
): boolean {
  // Each pattern molecule must match some species molecule.
  // We use backtracking to find a valid assignment.


  if (pattern.length > species.length) return false;

  // Build bond partner map for both pattern and species
  const patternBonds = buildBondPartnerMap(pattern);
  const speciesBonds = buildBondPartnerMap(species);

  const used = new Array(species.length).fill(false);

  return backtrackMatch(
    pattern, species, 0, new Map(), used, patternBonds, speciesBonds
  );
}

interface BondPartner {
  molIdx: number;
  compName: string;
}

/**
 * Build a map from bond label to the two partners involved.
 */
function buildBondPartnerMap(
  molecules: ParsedMolecule[]
): Map<string, BondPartner[]> {
  const map = new Map<string, BondPartner[]>();
  for (let mi = 0; mi < molecules.length; mi++) {
    for (const comp of molecules[mi].components) {
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        if (!map.has(comp.bondLabel)) {
          map.set(comp.bondLabel, []);
        }
        map.get(comp.bondLabel)!.push({ molIdx: mi, compName: comp.name });
      }
    }
  }
  return map;
}

function backtrackMatch(
  patternMols: ParsedMolecule[],
  speciesMols: ParsedMolecule[],
  patIdx: number,
  assignment: Map<number, number>,   // patternMolIdx -> speciesMolIdx
  used: boolean[],
  patternBonds: Map<string, BondPartner[]>,
  speciesBonds: Map<string, BondPartner[]>
): boolean {
  if (patIdx === patternMols.length) {
    // Verify bond consistency: for each pattern bond, the assigned species
    // molecules must also be bonded through the same component names.
    return verifyBondConsistency(assignment, patternBonds, speciesBonds);
  }

  const patMol = patternMols[patIdx];

  for (let si = 0; si < speciesMols.length; si++) {
    if (used[si]) continue;
    if (!moleculeMatches(patMol, speciesMols[si])) continue;

    assignment.set(patIdx, si);
    used[si] = true;

    if (backtrackMatch(
      patternMols, speciesMols, patIdx + 1, assignment, used,
      patternBonds, speciesBonds
    )) {
      return true;
    }

    assignment.delete(patIdx);
    used[si] = false;
  }

  return false;
}

/**
 * Check if a pattern molecule matches a species molecule.
 * Pattern components are matched against species components by name.
 * If the pattern specifies a state, the species must have the same state.
 */
function moleculeMatches(pattern: ParsedMolecule, species: ParsedMolecule): boolean {
  if (pattern.name !== species.name) return false;

  for (const patComp of pattern.components) {
    const specComp = species.components.find(
      sc => sc.name === patComp.name
    );
    if (!specComp) {
      // Component not explicitly listed in species -- treat as implicitly
      // present (BNGL semantics: unmentioned components are unchanged).
      continue;
    }

    // If pattern specifies a state, species must match
    if (patComp.state !== undefined && specComp.state !== undefined && specComp.state !== patComp.state) {
      return false;
    }

    // If pattern specifies a bond wildcard
    if (patComp.bondLabel === '+') {
      // Must be bonded
      if (!specComp.bondLabel || specComp.bondLabel === '-') return false;
    } else if (patComp.bondLabel === '-') {
      // Must be unbound
      if (specComp.bondLabel && /^\d+$/.test(specComp.bondLabel)) return false;
    }
    // Numeric bond labels are checked in verifyBondConsistency
  }

  return true;
}

/**
 * After molecule assignment, verify that pattern bonds are satisfied by the
 * species: if pattern says mol_i.comp_a is bonded to mol_j.comp_b, then
 * the assigned species molecules must also have a bond between those components.
 */
function verifyBondConsistency(
  assignment: Map<number, number>,
  patternBonds: Map<string, BondPartner[]>,
  speciesBonds: Map<string, BondPartner[]>
): boolean {
  for (const [, partners] of patternBonds) {
    if (partners.length !== 2) continue;

    const [p1, p2] = partners;
    const s1Idx = assignment.get(p1.molIdx);
    const s2Idx = assignment.get(p2.molIdx);
    if (s1Idx === undefined || s2Idx === undefined) return false;

    // Check species has a bond between species[s1Idx].comp matching p1.compName
    // and species[s2Idx].comp matching p2.compName
    let found = false;
    for (const [, sPartners] of speciesBonds) {
      if (sPartners.length !== 2) continue;
      const [sp1, sp2] = sPartners;
      if (
        (sp1.molIdx === s1Idx && sp1.compName === p1.compName &&
         sp2.molIdx === s2Idx && sp2.compName === p2.compName) ||
        (sp1.molIdx === s2Idx && sp1.compName === p2.compName &&
         sp2.molIdx === s1Idx && sp2.compName === p1.compName)
      ) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  return true;
}
