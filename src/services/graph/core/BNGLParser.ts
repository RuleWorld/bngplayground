import { Component } from './Component';
import { Molecule } from './Molecule';
import { SpeciesGraph } from './SpeciesGraph';

import { evaluateExpressionHighPrecision, needsHighPrecision } from './highPrecisionEvaluator';
import { RxnRule } from './RxnRule';

const shouldLogParser = false;


/**
 * Parser for BNGL strings to graph structures
 * Mirrors BioNetGen parsing logic
 */
export class BNGLParser {
  /**
   * Parse a BNGL species string into SpeciesGraph
   * Example: "A(b!1).B(a!1)" -> SpeciesGraph with two molecules connected by bond 1
   */
  static parseSpeciesGraph(bnglString: string, resolveBonds: boolean = true): SpeciesGraph {
    const graph = new SpeciesGraph();

    if (!bnglString.trim()) return graph;

    // Handle global compartment prefix like @nuc:A.B
    let globalCompartment: string | undefined;
    let content = bnglString.trim();

    // Support both single colon (Web) and double colon (BNG2) separators
    // e.g. @cell:Species or @cell::Species
    const prefixMatch = content.match(/^@([A-Za-z0-9_]+):(:?)(.+)$/);
    if (prefixMatch) {
      globalCompartment = prefixMatch[1];
      content = prefixMatch[3]; // Group 3 is the content after :: or :
      graph.compartment = globalCompartment;
    }

    // Handle suffix compartment notation like R(l,tf~Y)@PM (after last closing paren)
    // This is common in cBNGL models
    if (!globalCompartment) {
      const suffixMatch = content.match(/^(.+\))@([A-Za-z0-9_]+)$/);
      if (suffixMatch) {
        globalCompartment = suffixMatch[2];
        content = suffixMatch[1];
        graph.compartment = globalCompartment;
      }
    }

    // Handle suffix compartment notation for single-molecule species WITHOUT parentheses,
    // e.g. "mRNA@NU" or "mRNA@CP" (common in cBNGL). Normalize to "mRNA()".
    // Without this, "mRNA@NU" and "mRNA()@NU" produce different graphs and break
    // reactions like transport/translation.
    if (!globalCompartment) {
      const bareSuffixMatch = content.match(/^([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z0-9_]+)$/);
      if (bareSuffixMatch) {
        globalCompartment = bareSuffixMatch[2];
        content = `${bareSuffixMatch[1]}()`;
        graph.compartment = globalCompartment;
      }
    }

    // Helper to split by dot outside parentheses (use static method)
    const moleculeStrings = BNGLParser.splitMolecules(content);

    for (const molStr of moleculeStrings) {
      const molecule = this.parseMolecule(molStr.trim());
      graph.molecules.push(molecule);
    }

    // Resolve bonds: connect components with same bond label
    if (resolveBonds) {
      const bondMap = new Map<number, { molIdx: number; compIdx: number }[]>();
      graph.molecules.forEach((mol, molIdx) => {
        mol.components.forEach((comp, compIdx) => {
          for (const bond of comp.edges.keys()) {
            if (!bondMap.has(bond)) bondMap.set(bond, []);
            bondMap.get(bond)!.push({ molIdx, compIdx });
          }
        });
      });

      bondMap.forEach((partners, label) => {
        if (partners.length === 2) {
          const [p1, p2] = partners;
          if (shouldLogParser) {
            // console.log(`[BNGLParser] Adding bond ${label} between ${p1.molIdx}.${p1.compIdx} and ${p2.molIdx}.${p2.compIdx}`);
          }
          graph.addBond(p1.molIdx, p1.compIdx, p2.molIdx, p2.compIdx, label);
        } else {
          if (shouldLogParser) {
            console.warn(`[BNGLParser] Bond ${label} has ${partners.length} partners (expected 2) in string: ${bnglString}`);
          }
        }
      });
    }

    return graph;
  }

  /**
   * Validate a BNGL pattern string without parsing it
   * Returns null if valid, error message if invalid
   */
  static validatePattern(bnglString: string): string | null {
    const trimmed = bnglString.trim();

    if (!trimmed) {
      return 'Observable pattern cannot be empty';
    }

    // Check for unmatched parentheses
    let depth = 0;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '(') depth++;
      else if (trimmed[i] === ')') {
        depth--;
        if (depth < 0) {
          return `Unmatched closing parenthesis at position ${i + 1}`;
        }
      }
    }
    if (depth > 0) {
      return `Unmatched opening parenthesis in pattern`;
    }

    // Extract content without compartment prefix/suffix for molecule validation
    let content = trimmed;

    // Handle global compartment prefix (@cell: or @cell::)
    const prefixMatch = content.match(/^@([A-Za-z_][A-Za-z0-9_]*):(:?)(.+)$/);
    if (prefixMatch) {
      // Validate compartment name
      if (!/^[A-Za-z_]/.test(prefixMatch[1])) {
        return `Invalid compartment name "${prefixMatch[1]}": must start with a letter or underscore`;
      }
      content = prefixMatch[3];
    }

    // Handle suffix compartment notation (after closing paren)
    const suffixMatch = content.match(/^(.+\))@([A-Za-z_][A-Za-z0-9_]+)$/);
    if (suffixMatch) {
      // Validate compartment name
      if (!/^[A-Za-z_]/.test(suffixMatch[2])) {
        return `Invalid compartment name "${suffixMatch[2]}": must start with a letter or underscore`;
      }
      content = suffixMatch[1];
    }

    // Handle bare suffix compartment (no parens, molecule@comp)
    const bareSuffixMatch = content.match(/^([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z_][A-Za-z0-9_]+)$/);
    if (bareSuffixMatch) {
      // Validate compartment name
      if (!/^[A-Za-z_]/.test(bareSuffixMatch[2])) {
        return `Invalid compartment name "${bareSuffixMatch[2]}": must start with a letter or underscore`;
      }
      content = `${bareSuffixMatch[1]}()`;
    }

    // Check for unhandled @ patterns that would indicate invalid compartment notation
    // We need to check each molecule part after splitting by dots
    const potentialMoleculeStrings = this.splitMolecules(content);
    for (const molStr of potentialMoleculeStrings) {
      const trimmedMol = molStr.trim();
      if (!trimmedMol) continue;

      // Check if this molecule has an unhandled @ (compartment suffix that wasn't parsed)
      // This happens when the compartment name starts with a digit or invalid character
      if (trimmedMol.includes('@')) {
        // Check if it's NOT a valid suffix compartment pattern
        // Valid patterns: molecule@comp, molecule(comp)@comp
        const validCompartmentMatch = trimmedMol.match(/^([A-Za-z_][A-Za-z0-9_]*)(\([^)]*\))?@([A-Za-z_][A-Za-z0-9_]+)$/);
        if (!validCompartmentMatch) {
          // Extract the compartment name for the error message
          const atMatch = trimmedMol.match(/@([A-Za-z0-9_]+)/);
          if (atMatch) {
            return `Invalid compartment name "${atMatch[1]}": must start with a letter or underscore`;
          }
          return `Invalid pattern: contains unhandled "@" notation`;
        }
      }
    }

    // Split by dots and validate each molecule string
    const moleculeStrings = this.splitMolecules(content);

    for (const molStr of moleculeStrings) {
      const trimmedMol = molStr.trim();
      if (!trimmedMol) {
        return 'Empty molecule name in pattern';
      }

      // Check for molecule-level bonds (e.g., "A(b,c)!1") - not supported
      if (trimmedMol.includes(')!')) {
        return `Molecule-level bonds like "${trimmedMol}" are not supported`;
      }

      // Validate molecule name (must start with letter, underscore, or wildcard *)
      const nameMatch = trimmedMol.match(/^([A-Za-z_][A-Za-z0-9_]*|\*)/);
      if (!nameMatch) {
        return `Invalid molecule name "${trimmedMol}": must start with a letter, underscore, or wildcard (*)`;
      }

      // Validate characters in molecule string
      // Allow: letters, numbers, underscore, wildcard, tilde, comma, parentheses, exclamation, question, plus, percent, at sign, hyphen, brackets, space
      for (let i = 0; i < trimmedMol.length; i++) {
        const char = trimmedMol[i];
        // Characters that are valid in BNGL patterns (including wildcard *)
        const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~!?,()+%@-[ ]*';
        if (!validChars.includes(char)) {
          return `Invalid character "${char}" in molecule "${trimmedMol}"`;
        }
      }

      // Additional validation: check bond labels are positive integers
      // Match patterns like "b!123" or "b!+", "b!?"
      const componentMatch = trimmedMol.match(/\(([^)]*)\)/);
      if (componentMatch) {
        const components = componentMatch[1];
        const bondMatches = components.matchAll(/!([^!,\s)]+)/g);
        for (const bondMatch of bondMatches) {
          const bondLabel = bondMatch[1];
          // Skip wildcards
          if (bondLabel === '+' || bondLabel === '?' || bondLabel === '-') continue;
          // Check if it's a valid positive integer
          const bondNum = parseInt(bondLabel);
          if (isNaN(bondNum) || bondNum <= 0) {
            return `Invalid bond label "${bondLabel}" in molecule "${trimmedMol}": must be a positive integer`;
          }
        }
      }
    }

    return null; // Valid
  }

  /**
   * Split a BNGL string by dots outside parentheses
   * Static version for use in validation
   */
  static splitMolecules(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === '.' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    parts.push(current);
    return parts;
  }
  static parseMolecule(molStr: string): Molecule {
    if (shouldLogParser && molStr.includes('!+')) console.log(`[BNGLParser] parseMolecule input: '${molStr}'`);
    // Check for prefix notation: @comp:Name...
    let compartment: string | undefined;
    let cleanStr = molStr;

    // Support both single colon (Web) and double colon (BNG2/canonical) separators
    // e.g. @cell:Mol(...) or @cell::Mol(...)
    const prefixMatch = molStr.match(/^@([A-Za-z0-9_]+)::?(.+)$/);
    if (prefixMatch) {
      compartment = prefixMatch[1];
      cleanStr = prefixMatch[2];
    }

    // Check for suffix notation: Name@comp
    // Be careful not to match inside parentheses
    const suffixMatch = cleanStr.match(/^([^\(]+)@([A-Za-z0-9_]+)(\(.*\))?$/);
    if (suffixMatch) {
      // This regex is simplistic, might need robustness
    }

    // Extract molecule label (e.g., A(b)!1%2) outside parentheses
    let label: string | undefined;
    let baseStr = cleanStr;
    let depth = 0;
    for (let i = 0; i < cleanStr.length; i++) {
      const char = cleanStr[i];
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (char === '%' && depth === 0) {
        baseStr = cleanStr.slice(0, i).trim();
        label = cleanStr.slice(i + 1).trim();
        break;
      }
    }

    // Parse name and components
    // FIX: Molecule name must start with letter or underscore (not number or wildcard)
    // Allow '*' for wildcard molecule patterns
    const match = baseStr.match(/^\s*([A-Za-z_*][A-Za-z0-9_*]*)\s*(?:\(([^)]*)\))?(?:@([A-Za-z0-9_]+))?\s*$/);
    if (!match) {
      // Check if this is a wildcard-only molecule like "*"
      if (baseStr.trim() === '*') {
        const molecule = new Molecule('*', [], compartment);
        if (label) molecule.label = label;
        return molecule;
      }
      // Molecule without components, e.g., "A"
      // Validate name starts with letter or underscore (not number)
      const simpleMatch = baseStr.trim().match(/^[A-Za-z_][A-Za-z0-9_]*$/);
      if (simpleMatch) {
        const molecule = new Molecule(baseStr, [], compartment);
        if (label) molecule.label = label;
        return molecule;
      }
      // Invalid molecule name
      throw new Error(`Invalid molecule name: "${baseStr}". Must start with a letter or underscore.`);
    }

    const name = match[1];
    const componentStr = match[2] || '';
    const suffixCompartment = match[3];

    if (suffixCompartment) {
      compartment = suffixCompartment;
    }

    if (!componentStr.trim()) {
      const molecule = new Molecule(name, [], compartment, true);
      if (label) molecule.label = label;
      return molecule;
    }

    const components: Component[] = [];
    const compStrings = componentStr.split(',');

    for (const compStr of compStrings) {
      const trimmed = compStr.trim();
      // Skip empty component strings (e.g., from double commas like "a,,b")
      if (!trimmed) continue;
      const component = this.parseComponent(trimmed);
      components.push(component);
    }

    const molecule = new Molecule(name, components, compartment);
    if (label) molecule.label = label;
    return molecule;
  }

  /**
   * Parse a BNGL component string
   * Examples: "b!1" (bonded), "c~P" (state), "d" (unbound), "x!1!2" (multi-bonded)
   */
  static parseComponent(compStr: string): Component {
    const parts = compStr.split('!');
    const nameAndStates = parts[0].trim();
    const bondParts = parts.slice(1); // ALL bond parts, not just the first one
    const stateParts = nameAndStates.split('~');
    const name = stateParts[0];
    const states = stateParts.slice(1);
    const component = new Component(name, states);
    if (states.length > 0) component.state = states[0];
    // FIX: Handle '?' or '*' as "any state" wildcard in BNGL
    if (component.state === '*' || component.state === '?') {
      component.state = '?';
    }

    // Handle ALL bonds (for multi-site bonding like !1!2)
    for (const bondPart of bondParts) {
      if (bondPart === '+' || bondPart === '?' || bondPart === '-') {
        component.wildcard = bondPart;
      } else if (bondPart === '0') {
        // BioNetGen: !0 explicitly denotes an unbound site
        component.wildcard = '-';
      } else {
        // FIX: Validate bond label is a positive integer
        const bond = parseInt(bondPart);
        if (!isNaN(bond) && bond > 0) {
          component.edges.set(bond, -1);
        }
      }
    }
    if (compStr.includes('!+')) {
      if (shouldLogParser) console.log(`[BNGLParser] Parsing component '${compStr}': wildcard='${component.wildcard}'`);
    }
    return component;
  }

  /**
   * Parse a BNGL reaction rule string into RxnRule
   * Example: "A(b) + B(a) -> A(b!1).B(a!1)"
   * Also handles synthesis rules: "0 -> A()" or "" -> A()
   * Also handles degradation rules: "A() -> 0"
   */
  static parseRxnRule(ruleStr: string, rateConstant: number | string, name?: string, options?: { isMoveConnected?: boolean }): RxnRule {
    // Detect arrow robustly (->, <-, <->, ~>) and split around the first arrow
    const arrowRegex = /(?:<->|->|<-|~>)/;
    const arrowMatch = ruleStr.match(arrowRegex);
    if (!arrowMatch) throw new Error(`Invalid rule (no arrow found): ${ruleStr}`);
    const parts = ruleStr.split(arrowRegex).map(p => p.trim());
    // Filter but keep track of empty strings for synthesis rules
    const nonEmpty = parts.filter(Boolean);
    if (nonEmpty.length < 1) throw new Error(`Invalid rule: ${ruleStr}`);

    const reactantsStr = parts[0] || '';
    const productsStr = parts.slice(1).join(' ').trim();

    // parseEntityList: split top-level entities by '+' respecting parentheses depth
    const parseEntityList = (segment: string) => {
      if (!segment || !segment.trim()) return [] as string[];

      const parts: string[] = [];
      let current = '';
      let depth = 0;

      for (let i = 0; i < segment.length; i++) {
        const char = segment[i];

        if (char === '(') {
          depth++;
          current += char;
        } else if (char === ')') {
          depth--;
          current += char;
        } else if (depth === 0 && char === '+') {
          // Split on + at top level
          if (current.trim()) parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) parts.push(current.trim());

      return parts;
    };

    // Handle synthesis rules: "0 -> X" means empty reactants
    let reactantsList = parseEntityList(reactantsStr);
    if (reactantsList.length === 1 && reactantsList[0] === '0') {
      reactantsList = [];
    }

    // Handle degradation rules: "X -> 0" means empty products
    let productsList = parseEntityList(productsStr);
    if (productsList.length === 1 && productsList[0] === '0') {
      productsList = [];
    }

    if (shouldLogParser && reactantsStr.includes('!+')) {
      console.log(`[BNGLParser] parseRxnRule reactantsStr: '${reactantsStr}'`);
      console.log(`[BNGLParser] parseEntityList result:`, JSON.stringify(reactantsList));
    }
    const reactants = reactantsList.map(s => this.parseSpeciesGraph(s.trim(), true));
    const products = productsList.map(s => this.parseSpeciesGraph(s.trim(), true));

    let rateNum: number;
    let rateExpr: string | undefined;

    if (typeof rateConstant === 'number') {
      rateNum = rateConstant;
    } else {
      // It's a string
      const parsed = parseFloat(rateConstant);
      if (!isNaN(parsed) && isFinite(parsed) && !rateConstant.match(/[a-zA-Z_]/)) {
        rateNum = parsed;
      } else {
        rateNum = 0; // Or NaN? 0 allows simulation to proceed (rate expression used instead)
        rateExpr = rateConstant;
      }
    }

    return new RxnRule(name || '', reactants, products, rateNum, { rateExpression: rateExpr, isMoveConnected: options?.isMoveConnected });
  }

  /**
   * Convert SpeciesGraph back to BNGL string
   */
  static speciesGraphToString(graph: SpeciesGraph): string {
    return graph.toString();
  }

  /**
   * Convert RxnRule back to BNGL string
   */
  static rxnRuleToString(rule: RxnRule): string {
    const reactants = rule.reactants.map(r => this.speciesGraphToString(r)).join(' + ');
    const products = rule.products.map(p => this.speciesGraphToString(p)).join(' + ');
    return `${reactants} -> ${products}`;
  }

  /**
   * BioNetGen special function: mratio(a, b, z)
   * Computes M(a+1,b+1,z) / M(a,b,z) where M is Kummer's confluent hypergeometric function.
   * Used in parameter expressions for models with hypergeometric kinetics.
   */
  static mratio(a: number, b: number, z: number): number {
    const eps = 1e-16; // Convergence tolerance
    const tiny = 1e-32; // Small number to prevent division by zero

    let f = tiny;
    let C = f;
    let D = 0.0;
    let err = 1.0 + eps;

    let odd = 1;
    let even = 0;
    let iodd = 0;
    let ieven = 0;
    let j = 0;

    while (err > eps && j < 10000) { // Add iteration limit for safety
      j++;

      let p: number;
      if (j === 1) {
        p = 1.0;
      } else {
        const den = (b + (j - 2)) * (b + (j - 1));
        let num: number;
        if (odd === 1) {
          iodd++;
          num = z * (a + iodd);
        } else if (even === 1) {
          ieven++;
          num = z * (a - (b + ieven - 1));
        } else {
          throw new Error(`mratio: invalid state iodd=${iodd}, ieven=${ieven}`);
        }
        p = num / den;
      }

      const q = 1.0;

      D = q + p * D;
      if (Math.abs(D) < tiny) D = tiny;
      C = q + p / C;
      if (Math.abs(C) < tiny) C = tiny;
      D = 1.0 / D;

      const Delta = C * D;
      f = Delta * f;

      err = Math.abs(Delta - 1.0);

      // Swap odd/even for next iteration
      const tmp = odd;
      odd = even;
      even = tmp;
    }

    return f;
  }

  /**
   * Parse seed species block and evaluate expressions
   */
  static parseSeedSpecies(block: string, parameters: Map<string, number>): Map<string, number> {
    const seed = new Map<string, number>();
    for (const raw of block.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;

      // Handle format: [index] [label:] species_pattern concentration_expression
      let remaining = line;
      const leadingMatch = remaining.match(/^(\d+)\s+/);
      if (leadingMatch) {
        remaining = remaining.slice(leadingMatch[0].length);
      }

      const labelMatch = remaining.match(/^(\S+:)\s+/);
      if (labelMatch) {
        remaining = remaining.slice(labelMatch[0].length);
      }

      const firstSpace = remaining.search(/\s/);
      if (firstSpace === -1) continue;  // No concentration specified

      const speciesStr = remaining.slice(0, firstSpace);
      const concentrationStr = remaining.slice(firstSpace).trim();

      if (!speciesStr || !concentrationStr) continue;

      const amt = this.evaluateExpression(concentrationStr, parameters);
      seed.set(speciesStr, amt);
    }
    return seed;
  }

  /**
   * Extract parameter names used in the seed species block of a BNGL model
   * @param bnglCode - The full BNGL source code
   * @returns Array of parameter names used in seed species
   */
  static getSeedParameters(bnglCode: string): string[] {
    if (!bnglCode) return [];

    // Find the seed species block
    const seedMatch = bnglCode.match(/begin\s+seed\s+species[\s\S]*?end\s+seed\s+species/i);
    if (!seedMatch) return [];

    const block = seedMatch[0];
    const parameterNames = new Set<string>();

    // Parse each line in the block
    for (const raw of block.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (!line || line.toLowerCase().startsWith('begin') || line.toLowerCase().startsWith('end')) continue;

      // Handle format: [index] [label:] species_pattern concentration_expression
      let remaining = line;
      const leadingMatch = remaining.match(/^(\d+)\s+/);
      if (leadingMatch) remaining = remaining.slice(leadingMatch[0].length);

      const labelMatch = remaining.match(/^(\S+:)\s+/);
      if (labelMatch) remaining = remaining.slice(labelMatch[0].length);

      const firstSpace = remaining.search(/\s/);
      if (firstSpace === -1) continue;

      const concentrationStr = remaining.slice(firstSpace).trim();
      if (!concentrationStr) continue;

      // Extract all potential identifiers from the concentration expression
      // BNGL identifiers start with a letter/underscore and contain letters/digits/underscores
      const idMatches = concentrationStr.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g);
      for (const match of idMatches) {
        parameterNames.add(match[1]);
      }
    }

    return Array.from(parameterNames);
  }

  /**
   * Evaluate mathematical expressions with parameter substitution
   * @param expr - The expression to evaluate
   * @param parameters - Map of parameter names to values
   * @param observables - Optional map of observable names (for validation, uses placeholder values)
   * @returns The evaluated number, or NaN if evaluation fails or expression is invalid
   */
  static evaluateExpression(
    expr: string,
    parameters: Map<string, number>,
    observables?: Map<string, number> | Set<string>,
    functions?: Map<string, { args: string[], expr: string }>
  ): number {
    try {
      // Return NaN for empty or whitespace-only expressions
      if (!expr || expr.trim() === '') {
        return NaN;
      }

      // Check if we need high-precision evaluation
      if (needsHighPrecision(parameters)) {
        let evalParams = parameters;
        if (observables) {
          evalParams = new Map(parameters);
          const obsNames = observables instanceof Set
            ? Array.from(observables)
            : Array.from(observables.keys());

          for (const obs of obsNames) {
            evalParams.set(obs, 1.0);
          }
        }

        const result = evaluateExpressionHighPrecision(expr, evalParams);
        if (!isNaN(result)) {
          return result;
        }
      }

      // Replace entity names (parameters and observables) with values
      let evaluable = expr;

      // 1. Collect all entities to replace
      const entities = new Map<string, number>();
      for (const [name, value] of parameters.entries()) entities.set(name, value);
      if (observables) {
        if (observables instanceof Set) {
          for (const name of observables) if (!entities.has(name)) entities.set(name, 1.0);
        } else {
          for (const [name, value] of observables.entries()) if (!entities.has(name)) entities.set(name, value);
        }
      }

      // 2. Sort entities by length (longest first) to avoid partial replacement issues
      const sortedEntities = Array.from(entities.entries()).sort((a, b) => b[0].length - a[0].length);

      // 3. Perform replacements (longest names first)
      for (const [name, value] of sortedEntities) {
        const valueStr = (value < 0 || isNaN(value)) ? `(${value})` : value.toString();

        // Escape name for use in regex
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Match name with word boundaries if it's a simple identifier, 
        // otherwise match it literally.
        const isSimpleName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
        const regex = isSimpleName
          ? new RegExp(`\\b${escapedName}\\b`, 'g')
          : new RegExp(escapedName, 'g');

        evaluable = evaluable.replace(regex, valueStr);
      }

      // Convert BNGL operators to JavaScript
      evaluable = evaluable.replace(/\^/g, '**');  // Power operator

      // Replace BNGL math constants
      evaluable = evaluable.replace(/\b_pi\b/g, String(Math.PI));
      evaluable = evaluable.replace(/\b_e\b/g, String(Math.E));

      // BNGL math functions with JavaScript equivalents
      evaluable = evaluable.replace(/\bexp\(/g, 'Math.exp(');
      evaluable = evaluable.replace(/\bln\(/g, 'Math.log(');
      evaluable = evaluable.replace(/\blog10\(/g, 'Math.log10(');
      evaluable = evaluable.replace(/\bsqrt\(/g, 'Math.sqrt(');
      evaluable = evaluable.replace(/\babs\(/g, 'Math.abs(');
      evaluable = evaluable.replace(/\bsin\(/g, 'Math.sin(');
      evaluable = evaluable.replace(/\bcos\(/g, 'Math.cos(');
      evaluable = evaluable.replace(/\btan\(/g, 'Math.tan(');
      evaluable = evaluable.replace(/\basin\(/g, 'Math.asin(');
      evaluable = evaluable.replace(/\bacos\(/g, 'Math.acos(');
      evaluable = evaluable.replace(/\batan\(/g, 'Math.atan(');
      evaluable = evaluable.replace(/\basinh\(/g, 'Math.asinh(');
      evaluable = evaluable.replace(/\bacosh\(/g, 'Math.acosh(');
      evaluable = evaluable.replace(/\batanh\(/g, 'Math.atanh(');
      evaluable = evaluable.replace(/\brint\(/g, 'Math.round(');
      evaluable = evaluable.replace(/\batan2\(/g, 'Math.atan2(');
      evaluable = evaluable.replace(/\bpow\(/g, 'Math.pow(');
      evaluable = evaluable.replace(/\bmin\(/g, 'Math.min(');
      evaluable = evaluable.replace(/\bmax\(/g, 'Math.max(');
      evaluable = evaluable.replace(/\bfloor\(/g, 'Math.floor(');
      evaluable = evaluable.replace(/\bceil\(/g, 'Math.ceil(');

      // Check if mratio, if, or FunctionProduct is used
      const usesMratio = /\bmratio\s*\(/g.test(evaluable);
      const usesIf = /\bif\s*\(/g.test(evaluable);
      const usesFunctionProduct = /\bFunctionProduct\s*\(/gi.test(evaluable);
      let needsHP = usesIf || usesMratio || usesFunctionProduct;

      // Also check if any custom function is used
      if (functions) {
        for (const fname of functions.keys()) {
          const escaped = fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escaped}\\s*\\(`, 'g').test(evaluable)) {
            needsHP = true;
            break;
          }
        }
      }

      if (needsHP) {
        let evalParams = parameters;
        if (observables) {
          evalParams = new Map(parameters);
          const obsNames = observables instanceof Set
            ? Array.from(observables)
            : Array.from(observables.keys());

          for (const obs of obsNames) {
            evalParams.set(obs, 1.0);
          }
        }
        return evaluateExpressionHighPrecision(expr, evalParams, functions);
      }

      // Use Function constructor for safe evaluation
      const result = new Function(`return ${evaluable}`)();
      return typeof result === 'number' && !isNaN(result) ? result : NaN;
    } catch (e) {
      // Silence ReferenceErrors during multi-pass parameter resolution
      if (!(e instanceof ReferenceError)) {
        console.error(`[evaluateExpression] Failed to evaluate: "${expr}"`, e);
      }
      return NaN;
    }
  }
}