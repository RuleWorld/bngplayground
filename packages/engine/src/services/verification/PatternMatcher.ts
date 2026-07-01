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

  for (let i = 0; i < molStrings.length; i++) {
    const molStr = molStrings[i];
    let s = 0;
    let e = molStr.length;
    while(s < e && molStr.charCodeAt(s) <= 32) s++;
    while(e > s && molStr.charCodeAt(e - 1) <= 32) e--;
    if (s === e) continue;
    const trimmed = molStr.substring(s, e);

    const parenStart = trimmed.indexOf('(');
    if (parenStart === -1) {
      molecules.push({ name: trimmed, components: [] });
      continue;
    }

    const name = trimmed.substring(0, parenStart).trim();
    const parenEnd = trimmed.lastIndexOf(')');
    const compBody = trimmed.substring(parenStart + 1, parenEnd === -1 ? trimmed.length : parenEnd);

    const components: ParsedComponent[] = [];
    let cs = 0;
    let ce = compBody.length;
    while(cs < ce && compBody.charCodeAt(cs) <= 32) cs++;
    while(ce > cs && compBody.charCodeAt(ce - 1) <= 32) ce--;

    if (cs < ce) {
      let startIdx = cs;
      const len = ce;
      while (startIdx < len) {
        let endIdx = compBody.indexOf(',', startIdx);
        if (endIdx === -1 || endIdx > len) endIdx = len;

        let subS = startIdx;
        let subE = endIdx;
        while(subS < subE && compBody.charCodeAt(subS) <= 32) subS++;
        while(subE > subS && compBody.charCodeAt(subE - 1) <= 32) subE--;

        if (subS < subE) {
           components.push(parseComponentString(compBody.substring(subS, subE)));
        }
        startIdx = endIdx + 1;
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
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === delimiter && depth === 0) {
      parts.push(input.substring(start, i));
      start = i + 1;
    }
  }
  if (start < input.length) {
    parts.push(input.substring(start));
  }
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
  for (let i = 0; i < sortedMols.length; i++) {
    const mol = sortedMols[i];
    const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));
    for (let j = 0; j < sortedComps.length; j++) {
      const comp = sortedComps[j];
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        if (!bondMap.has(comp.bondLabel)) {
          bondMap.set(comp.bondLabel, nextBond++);
        }
      }
    }
  }

  // Second pass: produce canonical string
  let result = '';
  for (let i = 0; i < sortedMols.length; i++) {
    const mol = sortedMols[i];
    const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));

    let compStr = '';
    for (let j = 0; j < sortedComps.length; j++) {
      const comp = sortedComps[j];
      compStr += comp.name;
      if (comp.state) compStr += '~' + comp.state;
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        compStr += '!' + bondMap.get(comp.bondLabel);
      } else if (comp.bondLabel) {
        compStr += '!' + comp.bondLabel;
      }
      if (j < sortedComps.length - 1) compStr += ',';
    }

    result += mol.name + '(' + compStr + ')';
    if (i < sortedMols.length - 1) result += '.';
  }

  return result;
}

function moleculeSignature(mol: ParsedMolecule): string {
  const sortedComps = [...mol.components].sort((a, b) => a.name.localeCompare(b.name));
  let sig = '';
  for (let i = 0; i < sortedComps.length; i++) {
    const c = sortedComps[i];
    sig += c.name;
    if (c.state) sig += '~' + c.state;
    if (i < sortedComps.length - 1) sig += ',';
  }
  return sig;
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
  const assignment = new Int32Array(pattern.length).fill(-1);

  return backtrackMatch(
    pattern, species, 0, assignment, used, patternBonds, speciesBonds
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
    const comps = molecules[mi].components;
    for (let ci = 0; ci < comps.length; ci++) {
      const comp = comps[ci];
      const lbl = comp.bondLabel;
      if (lbl) {
        let isNum = true;
        for (let i = 0; i < lbl.length; i++) {
          const ch = lbl.charCodeAt(i);
          if (ch < 48 || ch > 57) {
            isNum = false;
            break;
          }
        }
        if (isNum) {
          let list = map.get(lbl);
          if (!list) {
            list = [];
            map.set(lbl, list);
          }
          list.push({ molIdx: mi, compName: comp.name });
        }
      }
    }
  }
  return map;
}

function backtrackMatch(
  patternMols: ParsedMolecule[],
  speciesMols: ParsedMolecule[],
  patIdx: number,
  assignment: Int32Array,   // patternMolIdx -> speciesMolIdx
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

    assignment[patIdx] = si;
    used[si] = true;

    if (backtrackMatch(
      patternMols, speciesMols, patIdx + 1, assignment, used,
      patternBonds, speciesBonds
    )) {
      return true;
    }

    assignment[patIdx] = -1;
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
    // ⚡ Bolt: Convert array .find to single pass O(N) array search inside hot loop
    let specComp: typeof species.components[0] | undefined;
    for (let i = 0; i < species.components.length; i++) {
      if (species.components[i].name === patComp.name) {
        specComp = species.components[i];
        break;
      }
    }
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
  assignment: Int32Array,
  patternBonds: Map<string, BondPartner[]>,
  speciesBonds: Map<string, BondPartner[]>
): boolean {
  for (const partners of patternBonds.values()) {
    if (partners.length !== 2) continue;

    const p1 = partners[0];
    const p2 = partners[1];
    const s1Idx = assignment[p1.molIdx];
    const s2Idx = assignment[p2.molIdx];
    if (s1Idx === -1 || s2Idx === -1) return false;

    // Check species has a bond between species[s1Idx].comp matching p1.compName
    // and species[s2Idx].comp matching p2.compName
    let found = false;
    for (const sPartners of speciesBonds.values()) {
      if (sPartners.length !== 2) continue;
      const sp1 = sPartners[0];
      const sp2 = sPartners[1];
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
