/**
 * Default BNGL parser entrypoint.
 *
 * IMPORTANT:
 * - `parseBNGL()` uses the ANTLR-based parser (BNG2.pl parity).
 * - `parseBNGLRegexDeprecated()` keeps the legacy regex parser for comparison/debug.
 */

import type { BNGLModel } from '../types.ts';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { SafeExpressionEvaluator } from './safeExpressionEvaluator';
import { parseBNGLWithANTLR } from '../src/parser/BNGLParserWrapper.ts';

interface NetworkGenerationOptions {
  maxStoich?: Record<string, number>;
  maxAgg?: number;
  maxIter?: number;
  overwrite?: boolean;
}

// (Removed unused vulnerable regex)

const escapeRegex = (value: string) => {
  const ESCAPE_CODES: Record<number, true> = {
    92: true,
    94: true,
    36: true,
    42: true,
    43: true,
    63: true,
    46: true,
    40: true,
    41: true,
    124: true,
    91: true,
    93: true,
    123: true,
    125: true,
  };

  let result = '';
  for (let i = 0; i < value.length; i++) {
    const codePoint = value.charCodeAt(i);
    if (ESCAPE_CODES[codePoint]) {
      result += '\\';
    }
    result += value[i];
  }
  return result;
};

const cleanLine = (line: string) => {
  if (typeof line !== 'string') return '';
  return line.replace(/#.*$/, '').trim();
};

const extractInlineComment = (line: string) => {
  if (typeof line !== 'string') return undefined;
  const m = line.match(/#(.*)$/);
  if (!m) return undefined;
  return m[1].trim();
};

const parseEntityList = (segment: string) => {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '(') {
      depth++;
      if (depth > 100) throw new Error('Parsing error: Maximum parenthesis depth exceeded');
    }
    else if (ch === ')') depth--;
    else if (ch === '+' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const splitProductsAndRates = (segment: string, parameters: Record<string, number>) => {
  // Improved splitting logic:
  // Tokenize respecting parentheses, then identify product vs rate tokens.
  // Products are molecule patterns (contain parentheses with component states, @, etc.)
  // Rates are numbers, parameters, or mathematical expressions.
  // 
  // Key insight: In BNGL, "+" between species is a separator (e.g., A() + B()),
  // but within rate expressions, operators like +, -, *, / are math operators.
  // We need to be careful not to merge molecule patterns into math expressions.

  const trimmed = segment.trim();
  if (!trimmed) {
    return { productChunk: '', rateChunk: '' };
  }

  // Helper: Check if a string looks like a molecule pattern
  const looksLikeMolecule = (s: string): boolean => {
    const cleaned = s.trim();
    if (!cleaned) return false;
    // Has parentheses with component syntax (commas, tildes, !, etc. inside)
    if (/\([^)]*[~,!][^)]*\)/.test(cleaned)) return true;
    // Has compartment
    if (/@/.test(cleaned)) return true;
    // Simple molecule with empty parens like A()
    if (/^[A-Za-z_][A-Za-z0-9_]*\(\s*\)$/.test(cleaned)) return true;
    // Molecule with dot notation (complex): A().B()
    if (/\)\s*\.\s*[A-Za-z_]/.test(cleaned)) return true;
    return false;
  };

  // First, tokenize respecting parentheses - group parenthesized expressions together
  const tokens: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      // At top level, whitespace is a separator
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }

  if (tokens.length === 0) {
    return { productChunk: '', rateChunk: '' };
  }

  // Now merge tokens that look like they're part of a math expression
  // But DON'T merge if either side looks like a molecule!
  // An expression may have been split like ["expr1", "*", "expr2"] or ["expr", "/", "expr"]
  const mergedTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isOperator = ['+', '-', '*', '/'].includes(token.trim());

    if (isOperator && mergedTokens.length > 0 && i + 1 < tokens.length) {
      const prev = mergedTokens[mergedTokens.length - 1];
      const next = tokens[i + 1];
      
      // Only merge if NEITHER prev nor next looks like a molecule
      // + between molecules is a separator, not math
      const prevIsMolecule = looksLikeMolecule(prev);
      const nextIsMolecule = looksLikeMolecule(next);
      
      if (!prevIsMolecule && !nextIsMolecule) {
        // Both look like rate expressions, merge them
        mergedTokens.pop();
        mergedTokens.push(`${prev} ${token} ${next}`);
        i++; // Skip next token as we've consumed it
      } else {
        // Don't merge - this is a species separator
        mergedTokens.push(token);
      }
    } else {
      mergedTokens.push(token);
    }
  }

  // Now identify the boundary between products and rates
  // Scan from the end to find where rates begin
  // Products are molecules (usually have parentheses with component syntax, or are "0")
  // Rates are numbers, params, or expressions

  let splitIndex = mergedTokens.length;

  for (let i = mergedTokens.length - 1; i >= 0; i--) {
    const token = mergedTokens[i];
    const cleaned = token.replace(/,$/, '').trim();

    // Skip isolated "+" tokens - they're species separators
    if (cleaned === '+') {
      continue;
    }

    // Check what this token looks like
    const isNumber = !Number.isNaN(parseFloat(cleaned));
    const isParam = Object.prototype.hasOwnProperty.call(parameters, cleaned);
    const isKeyword = /^(exclude_reactants|include_reactants|DeleteMolecules|MoveMolecules)/.test(cleaned);
    const isMolecule = looksLikeMolecule(cleaned);
    
    // Check for comma-separated rate pair like "kp2,km2" (bidirectional rule rates)
    const isCommaSeparatedRates = /^[A-Za-z_][A-Za-z0-9_]*,[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned) ||
      /^[0-9.eE+-]+,[0-9.eE+-]+$/.test(cleaned);  // Also handle numeric pairs
    
    // Math expressions contain operators outside of parentheses (*, /, -, and + in math context)
    const hasMathOutsideParens = (() => {
      let d = 0;
      for (const ch of cleaned) {
        if (ch === '(') d++;
        else if (ch === ')') d--;
        else if (d === 0 && ['*', '/'].includes(ch)) return true;
      }
      return false;
    })();

    // Decide if this is part of rate or product
    if (isMolecule && !isKeyword) {
      // Found a product, stop scanning
      break;
    }

    if (isNumber || isParam || isKeyword || hasMathOutsideParens || isCommaSeparatedRates) {
      splitIndex = i;
    } else if (cleaned.match(/^[A-Za-z_][A-Za-z0-9_]*$/) && !isParam) {
      // Unknown identifier - could be an observable or undefined param
      // Treat as part of rate if it follows rate-like tokens
      splitIndex = i;
    } else {
      // Unknown token type - likely a product
      break;
    }
  }

  // Special case: if splitIndex is 0, everything looks like rate tokens.
  // But if the first token is "0" and there are other tokens, "0" is likely the product (degradation).
  if (splitIndex === 0 && mergedTokens.length > 1 && mergedTokens[0] === '0') {
    splitIndex = 1;
  }

  const productTokens = mergedTokens.slice(0, splitIndex);
  const rateChunkTokens = mergedTokens.slice(splitIndex);

  return {
    productChunk: productTokens.join(' '),
    rateChunk: rateChunkTokens.join(' ')
  };
};

export interface ParseBNGLOptions {
  checkCancelled?: () => void;
  debug?: boolean;
}

export function parseBNGL(code: string, options: ParseBNGLOptions = {}): BNGLModel {
  if (options.checkCancelled) {
    options.checkCancelled();
  }

  const result = parseBNGLWithANTLR(code);
  if (!result.model) {
    const errorMsg = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`).join('\n');
    throw new Error(`BNGL parse error:\n${errorMsg}`);
  }

  if (!result.success && options.debug) {
    const errorMsg = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`).join('\n');
    console.warn(`[parseBNGL] ANTLR parse reported errors (best-effort model returned):\n${errorMsg}`);
  }

  return result.model;
}

/**
 * @deprecated Legacy regex-based BNGL parser.
 * Prefer `parseBNGL()` (ANTLR).
 */
export function parseBNGLRegexDeprecated(code: string, options: ParseBNGLOptions = {}): BNGLModel {
  const { checkCancelled, debug } = options;
  const logDebug = (...args: unknown[]) => {
    if (debug) {
      console.log(...args);
    }
  };
  // compartments are parsed later once model is constructed
  const maybeCancel = () => {
    if (checkCancelled) {
      checkCancelled();
    }
  };

  const getBlockContent = (blockName: string, sourceCode: string) => {
    const escapedBlock = escapeRegex(blockName);
    const beginPattern = new RegExp('^\\s*begin\\s+' + escapedBlock + '\\b', 'i');
    const endPattern = new RegExp('^\\s*end\\s+' + escapedBlock + '\\b', 'i');

    const lines = sourceCode.split(/\r?\n/);
    const collected: string[] = [];
    let inBlock = false;

    for (const rawLine of lines) {
      maybeCancel();
      const lineWithoutComments = rawLine.replace(/#.*$/, '').trim();
      if (!inBlock) {
        if (beginPattern.test(lineWithoutComments)) {
          inBlock = true;
        }
        continue;
      }

      if (endPattern.test(lineWithoutComments)) {
        break;
      }

      collected.push(lineWithoutComments);
    }

    return collected.join('\n').trim();
  };

  const model: BNGLModel = {
    parameters: {},
    moleculeTypes: [],
    species: [],
    observables: [],
    reactions: [],
    reactionRules: [],
  } as BNGLModel;

  const paramsContent = getBlockContent('parameters', code);
  if (paramsContent) {
    // First pass: collect all parameter expressions (may reference other params)
    const paramExpressions: Record<string, string> = {};
    for (const line of paramsContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(line);
      if (cleaned) {
        const parts = cleaned.split(/\s+/);
        if (parts.length >= 2) {
          // Store the raw expression (could be a number or another parameter name or math expression)
          paramExpressions[parts[0]] = parts.slice(1).join(' ');
        }
      }
    }
    
    // Second pass: resolve parameter expressions
    // We may need multiple passes for dependencies like a = b, b = c, c = 1
    const resolvedParams: Record<string, number> = {};
    const maxPasses = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let allResolved = true;
      for (const [name, expr] of Object.entries(paramExpressions)) {
        if (name in resolvedParams) continue;
        
        // Try to evaluate the expression using already resolved params
        let evalExpr = expr;
        const sortedResolved = Object.entries(resolvedParams).sort((a, b) => b[0].length - a[0].length);
        for (const [resolvedName, resolvedValue] of sortedResolved) {
          const escaped = resolvedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          evalExpr = evalExpr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), resolvedValue.toString());
        }
        
        // Convert BNGL operators to JavaScript
        evalExpr = evalExpr.replace(/\^/g, '**');  // Power operator
        evalExpr = evalExpr.replace(/\b_pi\b/g, String(Math.PI));
        evalExpr = evalExpr.replace(/\b_e\b/g, String(Math.E));
        
        try {
          const value = SafeExpressionEvaluator.evaluateConstant(evalExpr);
          if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
            resolvedParams[name] = value;
            logDebug('[parseBNGL] parameter', name, value);
          } else {
            allResolved = false;
          }
        } catch {
          allResolved = false;
        }
      }
      if (allResolved) break;
    }
    
    // Copy resolved params to model
    Object.assign(model.parameters, resolvedParams);
  }

  // Support both "molecule types" and "molecules" blocks
  let molTypesContent = getBlockContent('molecule types', code);
  if (!molTypesContent) {
    molTypesContent = getBlockContent('molecules', code);
  }
  if (molTypesContent) {
    for (const line of molTypesContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(line);
      if (cleaned) {
        const match = cleaned.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*$/);
        if (match) {
          const name = match[1];
          const componentsStr = match[2] || '';
          const components = componentsStr ? componentsStr.split(',').map((c) => c.trim()).filter(Boolean) : [];
          model.moleculeTypes.push({ name, components, comment: extractInlineComment(line) });
        } else {
          model.moleculeTypes.push({ name: cleaned, components: [], comment: extractInlineComment(line) });
        }
      }
    }
  }

  let speciesContent = getBlockContent('seed species', code);
  if (!speciesContent) {
    speciesContent = getBlockContent('species', code);
  }
  if (speciesContent) {
    const parametersMap = new Map(Object.entries(model.parameters));
    const seedSpeciesMap = BNGLParser.parseSeedSpecies(speciesContent, parametersMap);

    const completeSpeciesName = (partial: string): string => {
      if (partial.includes('.')) {
        return partial
          .split('.')
          .map((m) => completeSpeciesName(m.trim()))
          .join('.');
      }
      // allow optional @Compartment suffix after molecule or after parentheses
      const mm = partial.match(/^([A-Za-z0-9_]+)(\(([^)]*)\))?(?:@([A-Za-z0-9_]+))?$/);
      if (!mm) return partial;
      const name = mm[1];
      const specified = (mm[3] || '').trim();
      const compartment = mm[4];
      if (specified) return `${name}(${specified})${compartment ? `@${compartment}` : ''}`;
      const mt = model.moleculeTypes.find((m) => m.name === name);
      if (!mt) return partial;
      const comps = mt.components.map((c) => {
        const [base, ...states] = c.split('~');
        return states.length ? `${base}~${states[0]}` : base;
      });
      return `${name}(${comps.join(',')})${compartment ? `@${compartment}` : ''}`;
    };

    for (const [s, amt] of seedSpeciesMap.entries()) {
      maybeCancel();
      const completed = completeSpeciesName(s);
      logDebug('[parseBNGL] seed species', s, '=>', completed, amt);
      model.species.push({ name: completed, initialConcentration: amt });
    }
  }

  // Now we can parse compartments once the model has been created and helper functions are available
  const compartmentsContent = getBlockContent('compartments', code);
  if (compartmentsContent) {
    model.compartments = [];
    for (const rawLine of compartmentsContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(rawLine);
      if (!cleaned) continue;
      const parts = cleaned.split(/\s+/).filter(Boolean);
      // Expect at least name dim size
      if (parts.length >= 3) {
        const name = parts[0];
        const dimension = parseInt(parts[1], 10) || 3;
        // size may be a parameter name; try to parse float, otherwise 1.0
        const rawSize = parts[2];
        const sizeVal = parseFloat(rawSize);
        const size = Number.isNaN(sizeVal) ? 1.0 : sizeVal;
        const parent = parts[3];
        model.compartments.push({ name, dimension, size, parent });
      }
    }
  }

  const observablesContent = getBlockContent('observables', code);
  if (observablesContent) {
    for (const line of observablesContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(line);
      if (cleaned) {
        const parts = cleaned.split(/\s+/);
        if (parts.length >= 2) {
          let type = 'molecules';
          let name = parts[0];
          let pattern = parts.slice(1).join(' ');

          if (parts.length >= 3 && (parts[0].toLowerCase() === 'molecules' || parts[0].toLowerCase() === 'species')) {
            type = parts[0].toLowerCase();
            name = parts[1];
            pattern = parts.slice(2).join(' ');
          }

          model.observables.push({ type: type as 'molecules' | 'species', name, pattern, comment: extractInlineComment(line) });
        }
      }
    }
  }

  // Parse functions block
  // Function syntax: function_name(args) expression
  // Example: gene_Wip1_activity() (q0_wip1 + q1_wip1*p53_arr^h)/(q2 + q0_wip1 + q1_wip1*p53_arr^h)
  const functionsContent = getBlockContent('functions', code);
  if (functionsContent) {
    model.functions = [];
    for (const line of functionsContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(line);
      if (!cleaned) continue;
      
      // Match: function_name(arg1, arg2, ...) expression
      // Args can be empty (zero-argument function)
      const funcMatch = cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(.+)$/);
      if (funcMatch) {
        const name = funcMatch[1];
        const argsStr = funcMatch[2].trim();
        const args = argsStr ? argsStr.split(',').map(a => a.trim()).filter(Boolean) : [];
        const expression = funcMatch[3].trim();
        model.functions.push({ name, args, expression });
        logDebug('[parseBNGL] function', name, 'args:', args, 'expr:', expression);
      }
    }
  }

  let rulesContent = getBlockContent('reaction rules', code);
  if (!rulesContent) {
    rulesContent = getBlockContent('reactions', code);
  }
  if (rulesContent) {
    const statements: string[] = [];
    let current = '';

    for (const line of rulesContent.split(/\r?\n/)) {
      maybeCancel();
      const cleaned = cleanLine(line);
      if (!cleaned) continue;

      if (cleaned.endsWith('\\')) {
        current += cleaned.slice(0, -1).trim() + ' ';
      } else {
        current += cleaned;
        statements.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) {
      statements.push(current.trim());
    }

    statements.forEach((statement) => {
      maybeCancel();
      let ruleLine = statement;
      let ruleName: string | undefined;

      // Check for Label: ...
      const labelMatch = ruleLine.match(/^([^:]+):\s*(.*)$/);
      if (labelMatch) {
        const labelSegment = labelMatch[1].trim();
        if (labelSegment) {
          ruleName = labelSegment;
        }
        ruleLine = labelMatch[2];
      } else {
        // Check for Label ... (no colon, but space separated at start)
        const spaceMatch = ruleLine.match(/^([A-Za-z0-9_]+)\s+(.*)$/);
        if (spaceMatch) {
          const potentialLabel = spaceMatch[1];
          const rest = spaceMatch[2];

          // If potentialLabel starts with digit, it's a label
          if (/^\d/.test(potentialLabel)) {
            ruleName = potentialLabel;
            ruleLine = rest;
          }
        }
      }

      const arrowRegex = /(?:<->|->|<-|~>|-)/;
      const arrowMatch = ruleLine.match(arrowRegex);
      if (!arrowMatch) {
        console.warn('[parseBNGL] Rule parsing failed - no arrow found:', statement);
        return;
      }
      const arrow = arrowMatch[0];
      const isBidirectional = arrow === '<->' || arrow === '-';

      const arrowIndex = ruleLine.indexOf(arrow);
      if (arrowIndex < 0) {
        console.warn('[parseBNGL] Rule parsing failed - arrow index not found:', statement);
        return;
      }

      const reactantsPart = ruleLine.slice(0, arrowIndex).trim();
      const productsAndRatesPart = ruleLine.slice(arrowIndex + arrow.length).trim();

      // Parse reactants, allowing "0" for synthesis rules
      let reactants = parseEntityList(reactantsPart);
      // Handle synthesis rules: "0 -> X" means zero reactants
      if (reactants.length === 1 && reactants[0] === '0') {
        reactants = [];
      }

      const { productChunk, rateChunk } = splitProductsAndRates(productsAndRatesPart, model.parameters);
      const rawProducts = productChunk ? parseEntityList(productChunk) : [];
      const products = rawProducts.length === 1 && rawProducts[0] === '0' ? [] : rawProducts;

      // Tokenize rate chunk respecting parentheses to handle function calls like exclude_reactants(2,R)
      // FIX: Split by comma only to preserve math expressions like "2.0 * 602.0"
      // Also handle whitespace-separated keywords (exclude_reactants, include_reactants, DeleteMolecules)
      const tokenizeRateChunk = (chunk: string) => {
        const tokens: string[] = [];
        let current = '';
        let depth = 0;

        // Keywords that should be split on whitespace
        const keywords = ['exclude_reactants', 'include_reactants', 'DeleteMolecules', 'MoveMolecules'];

        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;

          // Only split on comma at top level
          if (ch === ',' && depth === 0) {
            if (current.trim()) tokens.push(current.trim());
            current = '';
          } else if (/\s/.test(ch) && depth === 0) {
            // At top level whitespace, check if next non-whitespace starts a keyword
            let j = i + 1;
            while (j < chunk.length && /\s/.test(chunk[j])) j++;
            const remaining = chunk.substring(j);
            const startsWithKeyword = keywords.some(kw => remaining.startsWith(kw));
            
            if (startsWithKeyword && current.trim()) {
              // Split here - current token ends, keyword starts
              tokens.push(current.trim());
              current = '';
            } else {
              // Regular whitespace in expression, keep it
              current += ch;
            }
          } else {
            current += ch;
          }
        }
        if (current.trim()) tokens.push(current.trim());
        return tokens;
      };

      const allRateTokens = tokenizeRateChunk(rateChunk);

      const constraints: string[] = [];
      const rateConstants: string[] = [];

      let deleteMolecules = false;
      allRateTokens.forEach(token => {
        if (token.startsWith('exclude_reactants') || token.startsWith('include_reactants')) {
          constraints.push(token);
        } else if (token === 'DeleteMolecules' || token === 'MoveMolecules') {
          deleteMolecules = true;
        } else {
          rateConstants.push(token);
        }
      });

      const forwardRateLabel = rateConstants[0] ?? '';
      const reverseRateLabel = rateConstants[1];

      if (products.length === 0 && forwardRateLabel === '') {
        console.warn('[parseBNGL] Rule parsing: could not determine products or rate for:', statement);
        return;
      }

      model.reactionRules.push({
        name: ruleName,
        reactants,
        products,
        rate: forwardRateLabel,
        isBidirectional,
        reverseRate: isBidirectional ? reverseRateLabel : undefined,
        constraints,
        deleteMolecules,
        comment: extractInlineComment(statement),
      });
    });
  }

  const parametersMap = new Map(Object.entries(model.parameters));

  // Create sets for detecting functional rates (observables and functions)
  const observableNames = new Set(model.observables.map(o => o.name));
  const functionNames = new Set((model.functions || []).map(f => f.name));

  // Helper to check if a rate expression contains observable or function references
  const isFunctionalRateExpr = (rateExpr: string): boolean => {
    for (const obsName of observableNames) {
      if (new RegExp(`\\b${obsName}\\b`).test(rateExpr)) return true;
    }
    for (const funcName of functionNames) {
      if (new RegExp(`\\b${funcName}\\s*\\(`).test(rateExpr)) return true;
    }
    return false;
  };

  model.reactionRules.forEach((rule) => {
    maybeCancel();
    
    // Check if this is a functional rate
    const isFunctionalForward = isFunctionalRateExpr(rule.rate);
    
    // For non-functional rates, evaluate statically
    // For functional rates, store 0 as placeholder (will be evaluated dynamically)
    let forwardRate: number;
    if (isFunctionalForward) {
      forwardRate = 0; // Placeholder - will be evaluated dynamically at simulation time
    } else {
      forwardRate = BNGLParser.evaluateExpression(rule.rate, parametersMap, observableNames);
    }

    // Always add the reaction (functional rates use 0 as placeholder)
    if (!Number.isNaN(forwardRate) || isFunctionalForward) {
      model.reactions.push({
        reactants: rule.reactants,
        products: rule.products,
        rate: rule.rate,
        rateConstant: Number.isNaN(forwardRate) ? 0 : forwardRate,
        rateExpression: isFunctionalForward ? rule.rate : undefined,
        isFunctionalRate: isFunctionalForward,
      });
    }

    if (rule.isBidirectional && rule.reverseRate) {
      const isFunctionalReverse = isFunctionalRateExpr(rule.reverseRate);
      
      let reverseRate: number;
      if (isFunctionalReverse) {
        reverseRate = 0; // Placeholder
      } else {
        reverseRate = BNGLParser.evaluateExpression(rule.reverseRate, parametersMap, observableNames);
      }
      
      if (!Number.isNaN(reverseRate) || isFunctionalReverse) {
        model.reactions.push({
          reactants: rule.products,
          products: rule.reactants,
          rate: rule.reverseRate,
          rateConstant: Number.isNaN(reverseRate) ? 0 : reverseRate,
          rateExpression: isFunctionalReverse ? rule.reverseRate : undefined,
          isFunctionalRate: isFunctionalReverse,
        });
      }
    }
  });

  // Parse actions like generate_network, simulate, simulate_ode
  const actionKeywords = ['generate_network', 'simulate', 'simulate_ode'];

  for (const keyword of actionKeywords) {
    const regex = new RegExp(`${keyword}\\s*\\(`, 'g');
    let match;
    while ((match = regex.exec(code)) !== null) {
      const startIndex = match.index + match[0].length;
      let depth = 1;
      let endIndex = startIndex;
      for (let i = startIndex; i < code.length; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;

        if (depth === 0) {
          endIndex = i;
          break;
        }
      }

      if (depth === 0) {
        const argsStr = code.substring(startIndex, endIndex);

        if (keyword === 'generate_network') {
          try {
            const options: NetworkGenerationOptions = {};

            // Extract max_stoich
            const maxStoichMatch = argsStr.match(/max_stoich\s*=>\s*({[^}]+})/);
            if (maxStoichMatch) {
              const stoichContent = maxStoichMatch[1];
              const stoichMap: Record<string, number> = {};
              const pairs = stoichContent.match(/([a-zA-Z0-9_]+)\s*=>\s*(\d+)/g);
              if (pairs) {
                pairs.forEach(p => {
                  const [mol, val] = p.split('=>').map(s => s.trim());
                  stoichMap[mol] = parseInt(val, 10);
                });
              }
              options.maxStoich = stoichMap;
            }

            // Extract max_agg
            const maxAggMatch = argsStr.match(/max_agg\s*=>\s*(\d+)/);
            if (maxAggMatch) {
              options.maxAgg = parseInt(maxAggMatch[1], 10);
            }

            // Extract max_iter
            const maxIterMatch = argsStr.match(/max_iter\s*=>\s*(\d+)/);
            if (maxIterMatch) {
              options.maxIter = parseInt(maxIterMatch[1], 10);
            }

            // Extract overwrite
            const overwriteMatch = argsStr.match(/overwrite\s*=>\s*(\d+)/);
            if (overwriteMatch) {
              options.overwrite = parseInt(overwriteMatch[1], 10) === 1;
            }

            model.networkOptions = options;
            logDebug('[parseBNGL] Parsed network options:', options);

          } catch (e) {
            console.warn('[parseBNGL] Failed to parse generate_network options', e);
          }
        } else if (keyword === 'simulate' || keyword === 'simulate_ode') {
          try {
            // Initialize if not exists
            if (!model.simulationOptions) model.simulationOptions = {};

            const parseNum = (str: string, key: string) => {
              const regex = new RegExp(`${key}\\s*=>\\s*([0-9.eE+-]+)`);
              const match = str.match(regex);
              return match ? parseFloat(match[1]) : undefined;
            };

            const t_end = parseNum(argsStr, 't_end');
            if (t_end !== undefined) model.simulationOptions.t_end = t_end;

            const n_steps = parseNum(argsStr, 'n_steps');
            if (n_steps !== undefined) model.simulationOptions.n_steps = n_steps;
            
            // Handle both atol and atoll (legacy typo support)
            const atol = parseNum(argsStr, 'atol') ?? parseNum(argsStr, 'atoll');
            if (atol !== undefined) model.simulationOptions.atol = atol;

            const rtol = parseNum(argsStr, 'rtol');
            if (rtol !== undefined) model.simulationOptions.rtol = rtol;
            
            const sparseMatch = argsStr.match(/sparse\s*=>\s*(\d+)/);
            if (sparseMatch) {
               model.simulationOptions.sparse = parseInt(sparseMatch[1], 10) === 1;
            }

            logDebug('[parseBNGL] Parsed simulation options:', model.simulationOptions);

          } catch (e) {
            console.warn('[parseBNGL] Failed to parse simulate options', e);
          }
        }
      }
    }
  }

  return model;
}