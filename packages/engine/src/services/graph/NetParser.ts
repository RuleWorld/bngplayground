/**
 * NetParser.ts - Parser for BioNetGen .net files
 *
 * Reads post-network-generation .net format files produced by BNG2's writeNetwork action.
 * This enables the readFile action for .net files and supports 'continue' simulation workflows.
 *
 * Format reference: BNG2/bng2/Perl2/BNGOutput.pm::writeNetwork()
 */

import type { BNGLModel } from '../../types';

export interface NetFileParseResult {
  model: BNGLModel;
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Optimized helper to parse comma-separated strings
 * avoids allocations of split().map().filter()
 */
function parseCommaSeparated(str: string, filterEmpty: boolean = true): string[] {
  const result: string[] = [];
  let start = 0;
  let end = 0;
  while ((end = str.indexOf(',', start)) !== -1) {
    const part = str.substring(start, end).trim();
    if (part || !filterEmpty) result.push(part);
    start = end + 1;
  }
  const lastPart = str.substring(start).trim();
  if (lastPart || !filterEmpty) result.push(lastPart);
  return result;
}

/**
 * Parses the raw content of a BioNetGen .net file into a structured `BNGLModel` object.
 *
 * This function processes the text line-by-line, tracking active block sections (e.g.,
 * `parameters`, `compartments`, `species`, `reactions`, `groups` / `observables`, and `functions`)
 * to reconstruct the structured model's attributes. Comments (lines starting with `#` or inline
 * comment suffixes) are automatically ignored.
 *
 * It is commonly used in BNG Playground to load post-network-generation `.net` files produced by
 * BioNetGen's `writeNetwork` action, thereby enabling "continue" simulation workflows.
 *
 * @invariant Must remain free of browser-specific APIs (browser-API-free) as a core engine package utility in @bngplayground/engine.
 *
 * @param content - The full plain text string content of the BioNetGen .net file.
 * @returns An object of type `NetFileParseResult` indicating success, containing the reconstructed `BNGLModel`,
 *          as well as arrays of accumulated parsing error and warning strings.
 */
export function parseNetFile(content: string): NetFileParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const model: BNGLModel = {
    parameters: {},
    moleculeTypes: [],
    species: [],
    observables: [],
    reactions: [],
    reactionRules: [],
    compartments: [],
    functions: [],
    actions: []
  };

  let currentSection: string | null = null;
  let lineNum = 0;
  let start = 0;
  const len = content.length;

  while (start < len) {
    lineNum++;
    let end = content.indexOf('\n', start);
    if (end === -1) end = len;

    const hashIdx = content.indexOf('#', start);
    let lineEndIdx = end;
    if (hashIdx !== -1 && hashIdx < end) {
      lineEndIdx = hashIdx;
    }

    let actualStart = start;
    while (actualStart < lineEndIdx && content.charCodeAt(actualStart) <= 32) actualStart++;

    let actualEnd = lineEndIdx - 1;
    while (actualEnd >= actualStart && content.charCodeAt(actualEnd) <= 32) actualEnd--;

    if (actualStart <= actualEnd) {
      const line = content.substring(actualStart, actualEnd + 1);

      if (line.startsWith('begin')) {
        const match = line.match(/^begin\s+(\w+)/);
        if (match) {
          currentSection = match[1];
        }
      } else if (line.startsWith('end')) {
        currentSection = null;
      } else {
        try {
          if (currentSection === 'parameters') {
            parseParameterLine(line, model, lineNum);
          } else if (currentSection === 'compartments') {
            parseCompartmentLine(line, model, lineNum);
          } else if (currentSection === 'species') {
            parseSpeciesLine(line, model, lineNum);
          } else if (currentSection === 'reactions') {
            parseReactionLine(line, model, lineNum);
          } else if (currentSection === 'groups') {
            parseObservableLine(line, model, lineNum);
          } else if (currentSection === 'functions') {
            parseFunctionLine(line, model, lineNum);
          }
        } catch (err: any) {
          errors.push(`Line ${lineNum}: ${err.message}`);
        }
      }
    }
    start = end + 1;
  }

  return {
    model,
    success: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse a parameter line: <index> <name> <value>
 * Example: "1 NA 6.02e+23"
 */
function parseParameterLine(line: string, model: BNGLModel, lineNum: number): void {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) {
    throw new Error(
      `Invalid parameter format in .net file at line ${lineNum}: expected "index name value" (e.g., "1 NA 6.02e+23"), ` +
      `but got "${line.trim()}".`
    );
  }

  const index = parseInt(parts[0]);
  const name = parts[1];
  const value = parseFloat(parts[2]);

  if (isNaN(index) || isNaN(value)) {
    throw new Error(
      `Invalid parameter in .net file at line ${lineNum}: the index and value must be numeric, ` +
      `but got index="${parts[0]}", value="${parts[2]}".`
    );
  }

  model.parameters[name] = value;
}

/**
 * Parse a compartment line: <index> <name> <dimension> <size> [<parent>]
 * Example: "1 EC 3 1.0e-10"
 */
function parseCompartmentLine(line: string, model: BNGLModel, lineNum: number): void {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(
      `Invalid compartment format in .net file at line ${lineNum}: expected "index name dimension size [parent]" ` +
      `(e.g., "1 EC 3 1.0e-10"), but got "${line.trim()}".`
    );
  }

  const index = parseInt(parts[0]);
  const name = parts[1];
  const dimension = parseInt(parts[2]);
  const size = parseFloat(parts[3]);
  const parent = parts.length > 4 ? parts[4] : undefined;

  if (isNaN(index) || isNaN(dimension) || isNaN(size)) {
    throw new Error(
      `Invalid compartment in .net file at line ${lineNum}: index, dimension, and size must be numeric, ` +
      `but got index="${parts[0]}", dimension="${parts[2]}", size="${parts[3]}".`
    );
  }

  model.compartments!.push({
    name,
    dimension,
    size,
    parent
  });
}

/**
 * Parse a species line: <index> <pattern> <initialConcentration>
 * Example: "1 EGFR(L,CR1,Y1068~U) 1.8e5"
 */
function parseSpeciesLine(line: string, model: BNGLModel, _lineNum: number): void {
  // Format: index pattern concentration
  // The pattern may contain spaces, so we can't just split on whitespace
  // Typical format: "1 A(b!1).B(a!1) 100"

  const trimmed = line.trim();
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace <= 0) {
    throw new Error(`Invalid species format (expected: index pattern concentration)`);
  }
  const indexToken = trimmed.slice(0, firstSpace).trim();
  const rest = trimmed.slice(firstSpace).trim();
  const lastSpace = rest.lastIndexOf(' ');
  if (lastSpace <= 0) {
    throw new Error(`Invalid species format (expected: index pattern concentration)`);
  }

  const pattern = rest.slice(0, lastSpace).trim();
  const concentrationToken = rest.slice(lastSpace + 1).trim();
  const index = parseInt(indexToken, 10);
  const concentration = parseFloat(concentrationToken);

  if (isNaN(index) || isNaN(concentration)) {
    throw new Error(`Invalid species: index or concentration not a number`);
  }

  model.species.push({
    name: pattern,
    initialConcentration: concentration
  });
}

/**
 * Parse a reaction line: <index> <reactants> -> <products> <rate> [<label>]
 * Example: "1 S1,S2 S3 k1*S1*S2"
 * Example: "2 S3 S1,S2 k2*S3 #_reverse__R1"
 */
function parseReactionLine(line: string, model: BNGLModel, lineNum: number): void {
  // Format: index reactants products rate [label]
  // reactants and products are comma-separated species indices or patterns

  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(
      `Invalid reaction format in .net file at line ${lineNum}: expected "index reactants products rate [label]" ` +
      `(e.g., "1 S1,S2 S3 k1*S1*S2"), but got "${line.trim()}".`
    );
  }

  const index = parseInt(parts[0]);
  if (isNaN(index)) {
    throw new Error(
      `Invalid reaction in .net file at line ${lineNum}: the reaction index "${parts[0]}" is not a valid number.`
    );
  }

  const reactants = parseCommaSeparated(parts[1]);
  const products = parseCommaSeparated(parts[2]);
  const rateExpr = parts[3];
  const label = parts.length > 4 ? parts.slice(4).join(' ').trim() : undefined;

  // Try to parse rate as a number, otherwise keep as expression
  let rateConstant = parseFloat(rateExpr);
  if (isNaN(rateConstant)) {
    rateConstant = 0; // Will be evaluated from rateExpression
  }

  model.reactions!.push({
    reactants,
    products,
    rate: rateExpr,
    rateConstant,
    rateExpression: rateExpr,
    name: label,
    isFunctionalRate: !/^[\d.eE+-]+$/.test(rateExpr)
  });
}

/**
 * Parse an observable (group) line: <index> <name> <type> <patterns...>
 * Example: "1 Dimers Molecules EGFR(CR1!+)"
 * Example: "2 TotalEGFR Species EGFR()"
 */
function parseObservableLine(line: string, model: BNGLModel, lineNum: number): void {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(
      `Invalid observable format in .net file at line ${lineNum}: expected "index name type pattern" ` +
      `(e.g., "1 Dimers Molecules EGFR(CR1!+)"), but got "${line.trim()}".`
    );
  }

  const index = parseInt(parts[0]);
  const name = parts[1];
  const type = parts[2].toLowerCase(); // 'Molecules' or 'Species'
  const patterns = parts.slice(3).join(' ');

  if (isNaN(index)) {
    throw new Error(
      `Invalid observable in .net file at line ${lineNum}: the observable index "${parts[0]}" is not a valid number.`
    );
  }

  model.observables.push({
    name,
    type,
    pattern: patterns
  });
}

/**
 * Parse a function line: <index> <name>() = <expression>
 * Example: "1 TotEGFR() = EGFR_free + EGFR_bound"
 */
function parseFunctionLine(line: string, model: BNGLModel, lineNum: number): void {
  // Format: index name(args) = expression
  const trimmed = line.trim();
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace <= 0) {
    throw new Error(
      `Invalid function format in .net file at line ${lineNum}: expected "index name(args) = expression" ` +
      `(e.g., "1 TotEGFR() = EGFR_free + EGFR_bound"), but got "${line.trim()}".`
    );
  }

  const indexToken = trimmed.slice(0, firstSpace).trim();
  const rhs = trimmed.slice(firstSpace).trim();
  const openParen = rhs.indexOf('(');
  const closeParen = rhs.indexOf(')', openParen + 1);
  const eqIdx = rhs.indexOf('=', closeParen + 1);
  if (openParen <= 0 || closeParen <= openParen || eqIdx <= closeParen) {
    throw new Error(
      `Invalid function format in .net file at line ${lineNum}: expected "index name(args) = expression" ` +
      `(e.g., "1 TotEGFR() = EGFR_free + EGFR_bound"), but got "${line.trim()}".`
    );
  }

  const index = parseInt(indexToken, 10);
  const name = rhs.slice(0, openParen).trim();
  const argsStr = rhs.slice(openParen + 1, closeParen).trim();
  const expression = rhs.slice(eqIdx + 1).trim();

  if (isNaN(index)) {
    throw new Error(
      `Invalid function in .net file at line ${lineNum}: the function index "${indexToken}" is not a valid number.`
    );
  }

  const args = argsStr ? parseCommaSeparated(argsStr, false) : [];

  model.functions!.push({
    name,
    args,
    expression
  });
}

/**
 * Load a .net file and return the parsed model
 * @param filepath Path to the .net file
 * @returns Parsed model or throws error
 */
export async function loadNetFile(_filepath: string): Promise<BNGLModel> {
  // This is a placeholder - actual implementation depends on runtime environment
  // In Node.js, use fs.readFileSync; in browser, use fetch
  throw new Error(
    'loadNetFile (direct file loading) is not available in this environment. ' +
    'Use parseNetFile(content) instead, passing the .net file content as a string. ' +
    'In Node.js, read the file with fs.readFileSync first; in the browser, use fetch or FileReader.'
  );
}
