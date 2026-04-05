/**
 * RuleEnumerator.ts — Enumerate all syntactically valid BNGL reaction rules
 * from a set of molecule type declarations.
 *
 * Used by the structure-learning pipeline to define the candidate model space.
 */

import type { BNGLMoleculeType } from '../../types';

// ── Types ────────────────────────────────────────────────────────────

export interface EnumerationConfig {
  maxReactants?: number;       // Default: 2
  includeStateChanges: boolean;
  includeBinding: boolean;
  includeUnbinding: boolean;
  includeDegradation: boolean;
  includeSynthesis: boolean;
  includeEnzymatic: boolean;
  maxProducts?: number;        // Default: 2
}

export interface CandidateRule {
  rule: string;                // BNGL rule string
  category: 'state_change' | 'binding' | 'unbinding' | 'degradation' | 'synthesis' | 'enzymatic';
  involves: string[];          // Molecule type names
  sites: string[];             // Component names touched
  humanDescription: string;
}

// ── Internal helpers ─────────────────────────────────────────────────

interface ParsedComponent {
  name: string;
  states: string[];
}

/**
 * Parse a component string like "s~u~p" into { name: "s", states: ["u","p"] }
 * or "b" into { name: "b", states: [] }.
 */
export function parseComponent(raw: string): ParsedComponent {
  const parts = raw.split('~');
  return { name: parts[0], states: parts.length > 1 ? parts.slice(1) : [] };
}

const DEFAULT_CONFIG: EnumerationConfig = {
  maxReactants: 2,
  maxProducts: 2,
  includeStateChanges: true,
  includeBinding: true,
  includeUnbinding: true,
  includeDegradation: true,
  includeSynthesis: true,
  includeEnzymatic: true,
};

// ── Enumeration ──────────────────────────────────────────────────────

/**
 * Enumerate all syntactically valid BNGL reaction rules from molecule type
 * declarations. Returns an array of candidate rules with metadata.
 */
export function enumerateRules(
  moleculeTypes: BNGLMoleculeType[],
  config?: Partial<EnumerationConfig>,
): CandidateRule[] {
  const cfg: EnumerationConfig = { ...DEFAULT_CONFIG, ...config };
  const candidates: CandidateRule[] = [];

  // Pre-parse all components per molecule type
  const parsed: Array<{ mol: BNGLMoleculeType; components: ParsedComponent[] }> = moleculeTypes.map(
    (mol) => ({ mol, components: mol.components.map(parseComponent) }),
  );

  // 1. State changes
  if (cfg.includeStateChanges) {
    for (const { mol, components } of parsed) {
      for (const comp of components) {
        if (comp.states.length < 2) continue;
        for (let i = 0; i < comp.states.length; i++) {
          for (let j = 0; j < comp.states.length; j++) {
            if (i === j) continue;
            const from = comp.states[i];
            const to = comp.states[j];
            const rateName = `k_${mol.name}_${comp.name}_${from}_to_${to}`;
            const rule = `${mol.name}(${comp.name}~${from}) -> ${mol.name}(${comp.name}~${to}) ${rateName}`;
            const desc = describeStateChange(mol.name, comp.name, from, to);
            candidates.push({
              rule,
              category: 'state_change',
              involves: [mol.name],
              sites: [comp.name],
              humanDescription: desc,
            });
          }
        }
      }
    }
  }

  // 2. Binding — pair each binding-capable component across (or within) molecule types
  if (cfg.includeBinding) {
    const bindingSites = collectBindingSites(parsed);
    for (let i = 0; i < bindingSites.length; i++) {
      for (let j = i + 1; j < bindingSites.length; j++) {
        const a = bindingSites[i];
        const b = bindingSites[j];
        // Skip same molecule same component
        if (a.mol === b.mol && a.comp === b.comp) continue;
        const rateName = `kon_${a.mol}_${a.comp}_${b.mol}_${b.comp}`;
        // Reactant sites must be unbound (BNGL: component without ! means "don't care about bond state")
        const rule = `${a.mol}(${a.comp}) + ${b.mol}(${b.comp}) -> ${a.mol}(${a.comp}!1).${b.mol}(${b.comp}!1) ${rateName}`;
        candidates.push({
          rule,
          category: 'binding',
          involves: uniqueStrings([a.mol, b.mol]),
          sites: [a.comp, b.comp],
          humanDescription: `Binding of ${a.mol} at ${a.comp} to ${b.mol} at ${b.comp}`,
        });
      }
    }
  }

  // 3. Unbinding — reverse of every binding
  if (cfg.includeUnbinding) {
    const bindingSites = collectBindingSites(parsed);
    for (let i = 0; i < bindingSites.length; i++) {
      for (let j = i + 1; j < bindingSites.length; j++) {
        const a = bindingSites[i];
        const b = bindingSites[j];
        if (a.mol === b.mol && a.comp === b.comp) continue;
        const rateName = `koff_${a.mol}_${a.comp}_${b.mol}_${b.comp}`;
        const rule = `${a.mol}(${a.comp}!1).${b.mol}(${b.comp}!1) -> ${a.mol}(${a.comp}) + ${b.mol}(${b.comp}) ${rateName}`;
        candidates.push({
          rule,
          category: 'unbinding',
          involves: uniqueStrings([a.mol, b.mol]),
          sites: [a.comp, b.comp],
          humanDescription: `Unbinding of ${a.mol} at ${a.comp} from ${b.mol} at ${b.comp}`,
        });
      }
    }
  }

  // 4. Enzymatic / catalytic state changes
  if (cfg.includeEnzymatic) {
    for (const { mol: substrate, components: subComps } of parsed) {
      for (const comp of subComps) {
        if (comp.states.length < 2) continue;
        for (let i = 0; i < comp.states.length; i++) {
          for (let j = 0; j < comp.states.length; j++) {
            if (i === j) continue;
            const from = comp.states[i];
            const to = comp.states[j];
            for (const { mol: enzyme } of parsed) {
              if (enzyme.name === substrate.name) continue;
              const rateName = `kcat_${enzyme.name}_${substrate.name}_${comp.name}_${from}_to_${to}`;
              const rule = `${substrate.name}(${comp.name}~${from}) + ${enzyme.name}() -> ${substrate.name}(${comp.name}~${to}) + ${enzyme.name}() ${rateName}`;
              candidates.push({
                rule,
                category: 'enzymatic',
                involves: [substrate.name, enzyme.name],
                sites: [comp.name],
                humanDescription: `${enzyme.name}-catalyzed ${describeStateChange(substrate.name, comp.name, from, to)}`,
              });
            }
          }
        }
      }
    }
  }

  // 5. Synthesis
  if (cfg.includeSynthesis) {
    for (const { mol } of parsed) {
      const rateName = `ksyn_${mol.name}`;
      const rule = `0 -> ${mol.name}() ${rateName}`;
      candidates.push({
        rule,
        category: 'synthesis',
        involves: [mol.name],
        sites: [],
        humanDescription: `Synthesis of ${mol.name}`,
      });
    }
  }

  // 6. Degradation
  if (cfg.includeDegradation) {
    for (const { mol } of parsed) {
      const rateName = `kdeg_${mol.name}`;
      const rule = `${mol.name}() -> 0 ${rateName}`;
      candidates.push({
        rule,
        category: 'degradation',
        involves: [mol.name],
        sites: [],
        humanDescription: `Degradation of ${mol.name}`,
      });
    }
  }

  return candidates;
}

/**
 * Count the number of candidate rules without generating them.
 */
export function countCandidateRules(
  moleculeTypes: BNGLMoleculeType[],
  config?: Partial<EnumerationConfig>,
): number {
  const cfg: EnumerationConfig = { ...DEFAULT_CONFIG, ...config };
  let count = 0;

  const parsed = moleculeTypes.map((mol) => ({
    mol,
    components: mol.components.map(parseComponent),
  }));

  // State changes
  if (cfg.includeStateChanges) {
    for (const { components } of parsed) {
      for (const comp of components) {
        const n = comp.states.length;
        if (n >= 2) count += n * (n - 1);
      }
    }
  }

  // Binding + Unbinding share same count
  const bindingPairCount = countPairsExcludingSameMolSameComp(parsed);

  if (cfg.includeBinding) count += bindingPairCount;
  if (cfg.includeUnbinding) count += bindingPairCount;

  // Enzymatic
  if (cfg.includeEnzymatic) {
    for (const { mol: substrate, components } of parsed) {
      for (const comp of components) {
        const n = comp.states.length;
        if (n < 2) continue;
        const transitions = n * (n - 1);
        const enzymeCount = parsed.filter((p) => p.mol.name !== substrate.name).length;
        count += transitions * enzymeCount;
      }
    }
  }

  // Synthesis + Degradation
  if (cfg.includeSynthesis) count += moleculeTypes.length;
  if (cfg.includeDegradation) count += moleculeTypes.length;

  return count;
}

// ── Private helpers ──────────────────────────────────────────────────

interface BindingSite {
  mol: string;
  comp: string;
}

function collectBindingSites(
  parsed: Array<{ mol: BNGLMoleculeType; components: ParsedComponent[] }>,
): BindingSite[] {
  const sites: BindingSite[] = [];
  for (const { mol, components } of parsed) {
    for (const comp of components) {
      // Components without states are binding sites; components with states
      // can also serve as binding sites, but we only enumerate binding for
      // those without states (pure binding sites) to keep the space manageable.
      if (comp.states.length === 0) {
        sites.push({ mol: mol.name, comp: comp.name });
      }
    }
  }
  return sites;
}

function countPairsExcludingSameMolSameComp(
  parsed: Array<{ mol: BNGLMoleculeType; components: ParsedComponent[] }>,
): number {
  const sites = collectBindingSites(parsed);
  let count = 0;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      if (sites[i].mol === sites[j].mol && sites[i].comp === sites[j].comp) continue;
      count++;
    }
  }
  return count;
}

function describeStateChange(mol: string, site: string, from: string, to: string): string {
  // Attempt to give a biological name
  if (to === 'p' && from === 'u') return `Phosphorylation of ${mol} at site ${site}`;
  if (to === 'u' && from === 'p') return `Dephosphorylation of ${mol} at site ${site}`;
  if (to === 'a' && from === 'i') return `Activation of ${mol} at site ${site}`;
  if (to === 'i' && from === 'a') return `Inactivation of ${mol} at site ${site}`;
  if (to === 'open' && from === 'closed') return `Opening of ${mol} at site ${site}`;
  if (to === 'closed' && from === 'open') return `Closing of ${mol} at site ${site}`;
  return `State change of ${mol} at site ${site} from ${from} to ${to}`;
}

function uniqueStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}
