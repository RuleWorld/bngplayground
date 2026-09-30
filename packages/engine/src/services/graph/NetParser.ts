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
 * Split a participant list on commas that are not nested inside parentheses.
 *
 * BNG2 writes participants as species indices, so a plain comma split is
 * enough for its own output — but the pattern form ("A(b,c),D(e,f)") contains
 * commas inside the pattern and must not be split there.
 *
 * Tokens may carry a stoichiometric coefficient ("2*6"). The coefficient is
 * dropped: BNGLReaction has no field for it, and species identity is what
 * network comparison needs.
 */
function splitParticipants(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      const part = str.slice(start, i).trim();
      if (part) result.push(...expandParticipantToken(part));
      start = i + 1;
    }
  }
  const last = str.slice(start).trim();
  if (last) result.push(...expandParticipantToken(last));
  return result;
}

/** "2*6" -> ["6", "6"]; "6" -> ["6"]. */
function expandParticipantToken(token: string): string[] {
  const star = token.lastIndexOf('*');
  if (star > 0 && /^\d+$/.test(token.slice(0, star))) {
    const count = parseInt(token.slice(0, star), 10);
    const rest = token.slice(star + 1).trim();
    if (count > 0 && rest) {
      return Array(count).fill(rest);
    }
  }
  return [token];
}

/** True when a token is a species-index list, e.g. "1,2,4" or "2*6,7". */
function isSpeciesIndexList(token: string): boolean {
  return token.split(',').every((t) => /^\d*\*?\d+$/.test(t.trim()));
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

  // BNG2 references species by their 1-based index in `begin reactions` and
  // `begin groups`, so keep the index -> name mapping as species are read.
  const speciesByIndex = new Map<number, string>();
  const resolveParticipant = (token: string): string => {
    if (/^\d+$/.test(token)) {
      const name = speciesByIndex.get(parseInt(token, 10));
      if (name) return name;
    }
    return token;
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
            parseSpeciesLine(line, model, speciesByIndex, lineNum);
          } else if (currentSection === 'reactions') {
            parseReactionLine(line, model, lineNum, resolveParticipant);
          } else if (currentSection === 'groups') {
            parseGroupLine(line, model, lineNum, resolveParticipant);
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
 *
 * BNG2 also writes expression-valued parameters, marked with a trailing
 * "# ConstantExpression" comment:
 *   2 k2  2*k1  # Constant
 *   3 k3  k1*2  # ConstantExpression
 * A value that is not a plain number is kept in paramExpressions instead of
 * failing the parse.
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
  if (isNaN(index)) {
    throw new Error(
      `Invalid parameter in .net file at line ${lineNum}: the index "${parts[0]}" is not a valid number.`
    );
  }

  const name = parts[1];
  const value = parseFloat(parts[2]);

  if (isNaN(value)) {
    model.paramExpressions ??= {};
    model.paramExpressions[name] = parts[2];
    model.parameters[name] = 0;
    return;
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
 *
 * BNG2 may write the initial value as a parameter name rather than a number
 * (e.g. "17 LPS(CD14,LPS,MD2,TLR4) LPS_Init"). Parameters are declared before
 * species, so such a token resolves against them; anything else is preserved
 * as an initial expression with a zero value.
 */
function parseSpeciesLine(
  line: string,
  model: BNGLModel,
  speciesByIndex: Map<number, string>,
  _lineNum: number
): void {
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
  if (isNaN(index)) {
    throw new Error(`Invalid species: index "${indexToken}" is not a valid number`);
  }

  let concentration = parseFloat(concentrationToken);
  let initialExpression: string | undefined;
  if (isNaN(concentration)) {
    const resolved = model.parameters[concentrationToken];
    if (typeof resolved === 'number' && !isNaN(resolved)) {
      concentration = resolved;
    } else {
      concentration = 0;
      initialExpression = concentrationToken;
    }
  }

  model.species.push({
    name: pattern,
    initialConcentration: concentration,
    ...(initialExpression ? { initialExpression } : {})
  });
  speciesByIndex.set(index, pattern);
}

/**
 * Parse a reaction line: <index> <reactants> <products> <rate> [<label>]
 * Example: "1 S1,S2 S3 k1*S1*S2"
 * Example: "2 S3 S1,S2 k2*S3 #_reverse__R1"
 *
 * BNG2 writes participants as species indices ("196 76 60,66 NFkB_DNA_IkB_Unbind"),
 * so numeric tokens are resolved to species names; pattern-style tokens are
 * kept as they are.
 */
function parseReactionLine(
  line: string,
  model: BNGLModel,
  lineNum: number,
  resolveParticipant: (token: string) => string
): void {
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

  const reactants = splitParticipants(parts[1]).map(resolveParticipant);
  const products = splitParticipants(parts[2]).map(resolveParticipant);
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
 * Parse a `begin groups` line.
 *
 * BNG2 writes groups as "<index> <name> <species indices>", e.g.
 *   1 TNF                  73
 *   8 IkB_active           15,23,57,61
 * Older/alternate writers use "<index> <name> <type> <patterns...>", e.g.
 *   1 Dimers Molecules EGFR(CR1!+)
 * Both are accepted; the group form resolves its indices to species names.
 */
function parseGroupLine(
  line: string,
  model: BNGLModel,
  lineNum: number,
  resolveParticipant: (token: string) => string
): void {
  const parts = line.trim().split(/\s+/);
  const index = parseInt(parts[0]);
  if (isNaN(index)) {
    throw new Error(
      `Invalid observable in .net file at line ${lineNum}: the observable index "${parts[0]}" is not a valid number.`
    );
  }

  const name = parts[1];

  // A group can end up with no species once its members are filtered out of
  // the network, leaving just "1 Name".
  if (parts.length === 2) {
    model.observables.push({ name, type: 'molecules', pattern: '' });
    return;
  }

  // Group form: the third token is a species index list, not a type keyword.
  const looksLikeGroup = parts.length === 3 && isSpeciesIndexList(parts[2]);

  if (looksLikeGroup) {
    const species = splitParticipants(parts[2]).map(resolveParticipant);
    model.observables.push({
      name,
      type: 'molecules',
      pattern: species.join(',')
    });
    return;
  }

  if (parts.length < 4) {
    throw new Error(
      `Invalid observable format in .net file at line ${lineNum}: expected "index name type pattern" ` +
      `(e.g., "1 Dimers Molecules EGFR(CR1!+)"), but got "${line.trim()}".`
    );
  }

  model.observables.push({
    name,
    type: parts[2].toLowerCase(), // 'Molecules' or 'Species'
    pattern: parts.slice(3).join(' ')
  });
}

/**
 * Parse a function line: <index> <name>(<args>) [=] <expression>
 * Example: "1 TotEGFR() = EGFR_free + EGFR_bound"
 *
 * BNG2 omits the '=' when the expression is unambiguous, writing
 * "1 pY1068_percent() (100*pY1068)/E" instead.
 */
function parseFunctionLine(line: string, model: BNGLModel, lineNum: number): void {
  const trimmed = line.trim();
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace <= 0) {
    throw new Error(
      `Invalid function format in .net file at line ${lineNum}: expected "index name(args) [=] expression" ` +
      `(e.g., "1 TotEGFR() = EGFR_free + EGFR_bound"), but got "${line.trim()}".`
    );
  }

  const indexToken = trimmed.slice(0, firstSpace).trim();
  const rhs = trimmed.slice(firstSpace).trim();
  const openParen = rhs.indexOf('(');
  const closeParen = rhs.indexOf(')', openParen + 1);
  if (openParen <= 0 || closeParen <= openParen) {
    throw new Error(
      `Invalid function format in .net file at line ${lineNum}: expected "index name(args) [=] expression" ` +
      `(e.g., "1 TotEGFR() = EGFR_free + EGFR_bound"), but got "${line.trim()}".`
    );
  }

  const index = parseInt(indexToken, 10);
  if (isNaN(index)) {
    throw new Error(
      `Invalid function in .net file at line ${lineNum}: the function index "${indexToken}" is not a valid number.`
    );
  }

  const name = rhs.slice(0, openParen).trim();
  const argsStr = rhs.slice(openParen + 1, closeParen).trim();
  // Everything after the argument list, minus an optional leading '='.
  const tail = rhs.slice(closeParen + 1).trim();
  const expression = tail.startsWith('=') ? tail.slice(1).trim() : tail;

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
