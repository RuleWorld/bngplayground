/**
 * patternTokens.ts — canonical BNGL pattern parsing.
 *
 * Single source of truth for turning a BNGL pattern string (a rule reactant/
 * product, a species, or an observable pattern) into structured molecule tokens
 * and, from those, molecule-type names and binding requirements. Historically
 * three subsystems (the MCP server, the app's network analysis, and the
 * engine's reachability checker) each carried their own molecule-name extractor
 * with subtly different behaviour on bare molecules, leading digits, and
 * compartments; this module replaces all of them.
 *
 * Pure string logic, no browser or engine-state dependencies.
 */

export interface MoleculeTokenComponent {
    name: string;
    state?: string;
    bondLabel?: string;
}

export interface MoleculeToken {
    name: string;
    components: MoleculeTokenComponent[];
}

export interface BindingRequirement {
    mol1: string;
    comp1: string;
    mol2: string;
    comp2: string;
}

/**
 * Strip BNGL compartment annotations from a molecule token so only the
 * molecule-type name remains. Handles a leading pattern/molecule compartment
 * (`@PM:A`) and a trailing molecule compartment (`A@PM`).
 */
function stripCompartment(token: string): string {
    return token
        .replace(/^@[A-Za-z0-9_]+:/, '') // leading  @Comp:Mol
        .replace(/@[A-Za-z0-9_]+$/, '')  // trailing Mol@Comp
        .trim();
}

/**
 * Split a pattern into its molecule substrings on top-level '.' only — a '.'
 * inside component parentheses does not separate molecules.
 */
function splitMolecules(pattern: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;

        if (ch === '.' && depth === 0) {
            if (current.trim().length > 0) out.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim().length > 0) out.push(current.trim());
    return out;
}

/**
 * Parse a BNGL pattern string (e.g. "@PM:A(b~P!1).B(a!1)") into molecule tokens.
 * Handles nested parentheses for components, states (~), bonds (!), bare
 * molecules with no component list, and compartment annotations.
 */
export function parseMoleculeTokens(pattern: string): MoleculeToken[] {
    if (!pattern) return [];
    const molecules: MoleculeToken[] = [];

    for (const molStr of splitMolecules(pattern)) {
        const parenStart = molStr.indexOf('(');

        if (parenStart === -1) {
            // Molecule with no component list (may still carry a compartment).
            const name = stripCompartment(molStr);
            if (name.length > 0) molecules.push({ name, components: [] });
            continue;
        }

        const name = stripCompartment(molStr.substring(0, parenStart));
        const parenEnd = molStr.lastIndexOf(')');
        const compBody = molStr.substring(parenStart + 1, parenEnd === -1 ? molStr.length : parenEnd);

        const components: MoleculeTokenComponent[] = [];
        if (compBody.trim().length > 0) {
            for (const part of compBody.split(',')) {
                const trimmed = part.trim();
                if (trimmed.length === 0) continue;

                let compName = trimmed;
                let state: string | undefined;
                let bondLabel: string | undefined;

                const bangIdx = compName.indexOf('!');
                if (bangIdx !== -1) {
                    bondLabel = compName.substring(bangIdx + 1);
                    compName = compName.substring(0, bangIdx);
                }

                const tildeIdx = compName.indexOf('~');
                if (tildeIdx !== -1) {
                    state = compName.substring(tildeIdx + 1);
                    compName = compName.substring(0, tildeIdx);
                }

                components.push({ name: compName.trim(), state, bondLabel });
            }
        }

        if (name.length > 0) molecules.push({ name, components });
    }

    return molecules;
}

/**
 * Extract the molecule-type names that appear in a pattern, in order of
 * appearance (duplicates preserved — a homodimer pattern reports its molecule
 * twice, which callers can de-duplicate if they need a set).
 */
export function extractMoleculeNames(pattern: string): string[] {
    return parseMoleculeTokens(pattern).map((t) => t.name);
}

/**
 * Extract binding requirements from a pattern: two components sharing the same
 * numeric bond label form a required bond (e.g. "A(b!1).B(a!1)" -> A.b <-> B.a).
 */
export function extractBindingRequirements(pattern: string): BindingRequirement[] {
    const molecules = parseMoleculeTokens(pattern);
    const bondMap = new Map<string, Array<{ mol: string; comp: string }>>();

    for (const mol of molecules) {
        for (const comp of mol.components) {
            if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
                if (!bondMap.has(comp.bondLabel)) bondMap.set(comp.bondLabel, []);
                bondMap.get(comp.bondLabel)!.push({ mol: mol.name, comp: comp.name });
            }
        }
    }

    const requirements: BindingRequirement[] = [];
    for (const [, partners] of bondMap) {
        if (partners.length === 2) {
            requirements.push({
                mol1: partners[0].mol,
                comp1: partners[0].comp,
                mol2: partners[1].mol,
                comp2: partners[1].comp,
            });
        }
        // >2 partners for one label is invalid BNGL; skip gracefully.
    }
    return requirements;
}
