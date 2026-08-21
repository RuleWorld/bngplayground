/**
 * ANTLR4-based BNGL Parser Wrapper
 * 
 * Parses BNGL files using the ANTLR4 grammar and converts to ParsedBNGL type.
 * Provides BNG2.pl-compatible parsing for maximum parity.
 */
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { PredictionMode } from 'antlr4ts/atn/PredictionMode';
import { BailErrorStrategy } from 'antlr4ts/BailErrorStrategy';
import { DefaultErrorStrategy } from 'antlr4ts/DefaultErrorStrategy';
import { BNGLexer } from './generated/BNGLexer';
import { BNGParser } from './generated/BNGParser';
import { BNGLVisitor } from './BNGLVisitor';
import type { BNGLModel } from '../types';
import { BNGLParser } from '../services/graph/core/BNGLParser';

export interface ParseError {
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  success: boolean;
  model?: BNGLModel;
  errors: ParseError[];
}

const MOLECULES_CHECK_RE = /molecules/i;
const BEGIN_MOLECULES_RE = /^[^\S\r\n]*(?!#)begin\s+molecules\b/im;
const END_MOLECULES_RE = /^[^\S\r\n]*(?!#)end\s+molecules\b/im;
const BEGIN_MOLECULES_REPLACE_RE = /(^[^\S\r\n]*(?!#)begin\s+)molecules\b/gim;
const END_MOLECULES_REPLACE_RE = /(^[^\S\r\n]*(?!#)end\s+)molecules\b/gim;

const LOCAL_CONTEXT_MATCH_RE = /%([A-Za-z_][A-Za-z0-9_]*)::/g;
const LOCAL_CONTEXT_STRIP_RE = /%[A-Za-z_][A-Za-z0-9_]*::/g;

const LEGACY_COMP_BEFORE_PAREN_RE = /\b([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z_][A-Za-z0-9_]*)\(([^(){}]*)\)/g;
const LINE_CONTINUATION_RE = /\\\s*\r?\n\s*/g;

const MOL_HEADER_RE = /^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/;
const COMMENT_INLINE_RE = /\s*#(?![-+])/;
const RULE_ARROW_RE = /^(.*?)\s*(<->|->|<-)\s*(.*?)\s+((?:\S+)(?:\s+\S+)?)\s*$/;
const MOL_PAT_RE = /([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/g;
const COMP_LABEL_RE = /^([A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_]+)/;
const PERCENT_LABEL_CHECK_RE = /%[A-Za-z0-9_]+/;
const PERCENT_INHERITANCE_NORM_RE = /([,(]\s*[A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_]+)/g;

const INCLUDE_EXCLUDE_CHECK_RE = /include_|exclude_/i;
const MODIFIER_ONLY_LINE_RE = /^\s*(?:(?:include|exclude)_(?:reactants|products)\([^)]*\)\s*)+$/i;

const BEGIN_MODEL_RE = /^begin\s+model\b/i;
const BEGIN_BLOCK_RE = /^begin\b/i;
const END_BLOCK_RE = /^end\b/i;
const VERSION_DIRECTIVE_RE = /^version\s*\(/i;
const SET_OPTION_DIRECTIVE_RE = /^setOption\s*\(/i;

function getFirstActiveLine(src: string): string | null {
  let start = 0;
  const len = src.length;
  while (start < len) {
    // Skip leading whitespace of the current line
    while (start < len) {
      const char = src.charCodeAt(start);
      if (char === 32 || char === 9 || char === 13) { // space, tab, carriage return
        start++;
      } else {
        break;
      }
    }
    if (start >= len) return null;
    const char = src.charCodeAt(start);
    if (char === 10) { // newline
      start++;
      continue;
    }
    if (char === 35) { // '#' - comment line, skip to end of line
      const end = src.indexOf('\n', start);
      if (end === -1) {
        return null;
      }
      start = end + 1;
      continue;
    }
    // Found active line, find its end and return the substring
    let end = src.indexOf('\n', start);
    if (end === -1) {
      end = len;
    }
    // Trim trailing carriage return if any
    let last = end - 1;
    while (last >= start) {
      const lastChar = src.charCodeAt(last);
      if (lastChar === 32 || lastChar === 9 || lastChar === 13) {
        last--;
      } else {
        break;
      }
    }
    return src.substring(start, last + 1);
  }
  return null;
}

/**
 * Parses raw BioNetGen Language (BNGL) model text using ANTLR4 grammar into a structured model.
 *
 * This function performs comprehensive preprocessing/normalization steps on the input to handle legacy
 * cBNGL syntax and BNG2.pl compatibility quirks prior to executing the ANTLR lexer and parser:
 * - Strips UTF-8 Byte Order Marks (BOM).
 * - Normalizes legacy blocks like 'begin/end molecules' to 'begin/end molecule types' (ignoring comments).
 * - Strips and normalizes legacy local function context syntax (%x::Pattern -> Pattern) for rule-level matching.
 * - Restructures legacy compartment-before-parentheses molecules: Mol@Comp(...) -> Mol(...)@Comp.
 * - Folds line continuations ('\') to resolve rules spread across multiple lines.
 * - Expands state-inheritance labels ('%') in rules to generate concrete combinatorial rules based on declared molecule types.
 * - Cascades unmatched '%' labels to wildcard state '~?' to ensure parser compatibility when type info is missing.
 * - Folds standalone parameter or compartment include/exclude modifier lines onto their preceding rules.
 * - Disables/comments out top-level pre-amble directives (e.g., version(), setOption()) located before 'begin model' blocks.
 *
 * Once parsing of the normalized text completes (either successfully or through best-effort recovery),
 * it validates the model's semantic properties (e.g. valid molecule type definitions, missing components in seed species
 * or created reaction rules) and returns the aggregated errors and the parsed model representation.
 *
 * @invariant Must remain free of browser APIs (browser-API-free) as a core package utility in @bngplayground/engine.
 *
 * @param input - The raw BNGL source string to parse.
 * @returns An object of type `ParseResult` indicating success, containing the parsed `BNGLModel` if successful,
 *          and list of accumulated syntactic/semantic parsing errors.
 */
export function parseBNGLWithANTLR(input: string): ParseResult {
  const errors: ParseError[] = [];

  try {
    if (!input) {
      return { 
        success: true, 
        errors: [], 
        model: {
          name: 'default',
          parameters: {},
          moleculeTypes: [],
          species: [],
          observables: [],
          reactionRules: [],
          reactions: [],
          compartments: [],
          functions: [],
          networkOptions: {},
          simulationOptions: {},
          simulationPhases: [],
          concentrationChanges: [],
          parameterChanges: [],
          actions: [],
          paramExpressions: {}
        }
      };
    }
    // Create lexer and parser
    // Some published BNGL files can start with a UTF-8 BOM (U+FEFF). BNG2.pl
    // accepts this; our lexer should too.
    let sanitizedInput = input;
    if (input.charCodeAt(0) === 0xFEFF) {
      sanitizedInput = input.substring(1);
    }

    // Normalize legacy 'begin molecules' / 'end molecules' blocks to
    // the preferred 'begin molecule types' / 'end molecule types' form.
    // We do this as a pre-parse normalization to preserve repository files
    // but remain compatible with BNG2.pl. We skip lines that are comments.
    function normalizeLegacyBlocks(src: string): { normalized: string; warned: boolean } {
      if (!MOLECULES_CHECK_RE.test(src)) {
        return { normalized: src, warned: false };
      }
      let warned = false;
      let next = src;
      if (BEGIN_MOLECULES_RE.test(next)) {
        warned = true;
        next = next.replace(BEGIN_MOLECULES_REPLACE_RE, '$1molecule types');
      }
      if (END_MOLECULES_RE.test(next)) {
        warned = true;
        next = next.replace(END_MOLECULES_REPLACE_RE, '$1molecule types');
      }
      return { normalized: next, warned };
    }

    function normalizeLegacySyntax(src: string): { normalized: string; warnings: string[] } {
      const warnings: string[] = [];
      let next = src;

      // Normalization for local function context syntax (e.g., %x::A()).
      // Strategy:
      //   %x::Pattern      -> Pattern  (stripped so ANTLR can parse the pattern)
      //   f(x) = expr(x)   -> KEPT AS-IS (grammar supports param_list in function defs)
      //   f(x) in rates    -> KEPT AS-IS (NetworkExpansion detects & handles these)
      // The local function bodies and calls are preserved so NetworkExpansion.ts can
      // detect which rules use local functions and compute per-species rates at
      // network-generation time.
      if (next.includes('::')) {
        const localContextMatches = Array.from(next.matchAll(LOCAL_CONTEXT_MATCH_RE));
        if (localContextMatches.length > 0) {
          // Only strip the %x:: prefix from pattern positions; leave function defs/calls intact.
          next = next.replace(LOCAL_CONTEXT_STRIP_RE, '');

          warnings.push('Detected local-function context syntax (%x::); local function calls preserved for per-species rate evaluation.');
        }
      }

      // Normalize legacy compartment-before-parentheses molecule syntax used in
      // some cBNGL models: Mol@Comp(...) -> Mol(...)@Comp.
      // This keeps semantics while matching the ANTLR grammar's expected order.
      if (next.includes('@')) {
        const legacyCompBeforeParen = next.replace(
          LEGACY_COMP_BEFORE_PAREN_RE,
          (_m, mol, comp, args) => `${mol}(${String(args ?? '')})@${comp}`
        );
        if (legacyCompBeforeParen !== next) {
          warnings.push('Normalized legacy compartment-before-parentheses syntax (Mol@Comp(...) -> Mol(...)@Comp).');
          next = legacyCompBeforeParen;
        }
      }

      // Normalize explicit line continuations used in legacy reaction rules by
      // folding continued lines into a single logical rule line.
      if (next.includes('\\')) {
        const joined = next.replace(LINE_CONTINUATION_RE, ' ');
        if (joined !== next) {
          warnings.push('Joined legacy line continuations (\\) for parser compatibility.');
          next = joined;
        }
      }

      // Legacy state-inheritance labels in component patterns use "%" (e.g., c1%1).
      // The core parser/runtime does not model this syntax directly.
      // Strategy: expand each rule with %n labels into one concrete rule per state
      // combination by enumerating all possible states of the labelled components
      // (from the molecule types block).  This matches the BNG2 expansion behaviour.
      // Deduplication: for labels that appear on same-type reactants in different
      // reactant slots (interchangeable reactants), only generate assignments in
      // sorted state order to avoid double-counting.
      // Fallback (no molecule-type info or expansion failed): strip %n to ~? wildcard.

      function findNamedBlock(source: string, beginName: string, endName: string): {
        openStart: number;
        openEnd: number;
        bodyStart: number;
        bodyEnd: number;
        closeStart: number;
        closeEnd: number;
      } | null {
        const beginRegex = new RegExp(`begin\\s+${beginName}`, 'gi');
        const beginMatch = beginRegex.exec(source);
        if (!beginMatch) return null;
        const openStart = beginMatch.index;

        const openLineEnd = source.indexOf('\n', openStart);
        const openEnd = openLineEnd >= 0 ? openLineEnd : source.length;
        const bodyStart = openEnd < source.length ? openEnd + 1 : openEnd;

        const endRegex = new RegExp(`end\\s+${endName}`, 'gi');
        endRegex.lastIndex = bodyStart;
        const endMatch = endRegex.exec(source);
        if (!endMatch) return null;
        const closeStart = endMatch.index;

        let closeEnd = source.indexOf('\n', closeStart);
        if (closeEnd < 0) closeEnd = source.length;

        const bodyEnd = closeStart;
        return { openStart, openEnd, bodyStart, bodyEnd, closeStart, closeEnd };
      }

      // ── helper: extract molecule-type component states ──────────────────────
      function extractMolCompStates(src: string): Map<string, Map<string, string[]>> {
        const result = new Map<string, Map<string, string[]>>();
        const block = findNamedBlock(src, 'molecule types', 'molecule types');
        if (!block) return result;
        for (const line of src.slice(block.bodyStart, block.bodyEnd).split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const mm = t.match(MOL_HEADER_RE);
          if (!mm) continue;
          const cmap = new Map<string, string[]>();
          for (const c of mm[2].split(',')) {
            const parts = c.trim().split('~');
            const cn = parts[0].trim();
            const states = parts.slice(1).map((s) => s.trim()).filter((s) => s.length > 0);
            if (states.length > 0) cmap.set(cn, states);
          }
          result.set(mm[1], cmap);
        }
        return result;
      }

      // ── helper: cartesian product ──────────────────────────────────────────
      function cartesian(arrs: string[][]): string[][] {
        return arrs.reduce<string[][]>((acc, arr) => {
          const res: string[][] = [];
          for (const a of acc) for (const s of arr) res.push([...a, s]);
          return res;
        }, [[]]);
      }

      // ── helper: expand a single rule line ─────────────────────────────────
      function expandRuleLine(
        ruleLine: string,
        molCompStates: Map<string, Map<string, string[]>>
      ): string[] | null {
        // strip inline comment for processing, re-add later
        const commentIdx = ruleLine.search(COMMENT_INLINE_RE);
        const mainPart = commentIdx >= 0 ? ruleLine.slice(0, commentIdx) : ruleLine;
        const comment = commentIdx >= 0 ? ruleLine.slice(commentIdx) : '';

        // Split into rule components: optional "name:", lhs, arrow, rhs, rate(s)
        // We use a loose split: find the arrow (-> or <->), then parse around it.
        const arrowMatch = mainPart.match(RULE_ARROW_RE);
        if (!arrowMatch) return null;
        const lhsRaw = arrowMatch[1].trim();

        // Find all label definitions in LHS (compName%label)
        const labelDefs = new Map<
          string,
          { molName: string; compName: string; states: string[]; reactantIdx: number }
        >();

        const reactants = lhsRaw.split('+').map((s) => s.trim());
        for (let ri = 0; ri < reactants.length; ri++) {
          const reactant = reactants[ri];
          // iterate over molecule patterns
          const molPatRe = new RegExp(MOL_PAT_RE.source, 'g');
          let mm;
          while ((mm = molPatRe.exec(reactant)) !== null) {
            const molName = mm[1];
            for (const comp of mm[2].split(',')) {
              const ct = comp.trim();
              const lm = ct.match(COMP_LABEL_RE);
              if (!lm) continue;
              const compName = lm[1];
              const label = lm[2];
              const states = molCompStates.get(molName)?.get(compName) ?? [];
              if (states.length > 0) labelDefs.set(label, { molName, compName, states, reactantIdx: ri });
            }
          }
        }

        if (labelDefs.size === 0) return null; // no expandable labels

        const labels = [...labelDefs.keys()];
        const stateArrays = labels.map((l) => labelDefs.get(l)!.states);

        // Identify deduplication groups: labels on same (molName.compName) in different
        // reactant slots that are interchangeable (swap does not change unordered set).
        interface GroupEntry { label: string; reactantIdx: number }
        const byGroupKey = new Map<string, GroupEntry[]>();
        for (const [label, info] of labelDefs) {
          const gk = `${info.molName}.${info.compName}`;
          if (!byGroupKey.has(gk)) byGroupKey.set(gk, []);
          byGroupKey.get(gk)!.push({ label, reactantIdx: info.reactantIdx });
        }

        // Collect groups where each entry is from a distinct reactant slot
        const dedupeGroups: string[][] = []; // sorted label lists
        for (const entries of byGroupKey.values()) {
          const idxSet = new Set(entries.map((e) => e.reactantIdx));
          if (idxSet.size === entries.length && entries.length > 1) {
            dedupeGroups.push(entries.map((e) => e.label).sort());
          }
        }

        const allAssignments = cartesian(stateArrays);

        function assignmentAsMap(a: string[]): Map<string, string> {
          const m = new Map<string, string>();
          labels.forEach((l, i) => m.set(l, a[i]));
          return m;
        }

        function isCanonical(a: string[]): boolean {
          const am = assignmentAsMap(a);
          for (const group of dedupeGroups) {
            const groupStates = group.map((l) => am.get(l)!);
            for (let i = 0; i < groupStates.length - 1; i++) {
              if (groupStates[i] > groupStates[i + 1]) return false;
            }
          }
          return true;
        }

        const canonical = allAssignments.filter(isCanonical);

        return canonical.map((assignment) => {
          const am = assignmentAsMap(assignment);
          let expanded = mainPart;
          for (const [label, state] of am) {
            const re = new RegExp(`([A-Za-z_][A-Za-z0-9_]*)%${label}(?![A-Za-z0-9_])`, 'g');
            expanded = expanded.replace(re, `$1~${state}`);
          }
          return expanded + comment;
        });
      }

      if (next.includes('%')) {
        // ── apply expansion to reaction rules block ────────────────────────────
        const molCompStates = extractMolCompStates(next);
        if (PERCENT_LABEL_CHECK_RE.test(next) && molCompStates.size > 0) {
          const ruleBlock = findNamedBlock(next, 'reaction rules', 'reaction rules');
          let expandedSrc = next;
          if (ruleBlock) {
            const body = next.slice(ruleBlock.bodyStart, ruleBlock.bodyEnd);
            const lines = body.split(/\r?\n/);
            const outLines: string[] = [];
            for (const line of lines) {
              const t = line.trim();
              if (!t || t.startsWith('#') || !PERCENT_LABEL_CHECK_RE.test(t)) {
                outLines.push(line);
                continue;
              }
              const expanded = expandRuleLine(t, molCompStates);
              if (expanded) {
                outLines.push(...expanded);
              } else {
                outLines.push(line);
              }
            }
            expandedSrc = `${next.slice(0, ruleBlock.bodyStart)}${outLines.join('\n')}${next.slice(ruleBlock.bodyEnd)}`;
          }
          if (expandedSrc !== next) {
            warnings.push('Expanded state-inheritance "%" labels into concrete rules (BNG2 style).');
            next = expandedSrc;
          }
        }

        // Fallback: if any %n patterns remain (molecule type info unavailable or
        // expansion did not apply), strip to wildcard ~? to keep rules applicable.
        // Keep molecule labels like ")%1" unchanged by anchoring to component starts.
        const percentInheritanceNormalized = next.replace(PERCENT_INHERITANCE_NORM_RE, '$1~?');
        if (percentInheritanceNormalized !== next) {
          warnings.push('Normalized legacy component inheritance "%" labels to wildcard state "~?" (fallback: no molecule type info available).');
          next = percentInheritanceNormalized;
        }
      }

      // Fold standalone include/exclude_* modifier-only lines onto the previous
      // non-empty rule line instead of dropping them (semantics-preserving).
      if (INCLUDE_EXCLUDE_CHECK_RE.test(next)) {
        const foldedLines = next.split(/\r\n|\n/);
        let foldedStandaloneModifierLines = false;
        for (let i = 0; i < foldedLines.length; i++) {
          const line = foldedLines[i];
          if (!MODIFIER_ONLY_LINE_RE.test(line)) continue;

          let prev = i - 1;
          while (prev >= 0 && foldedLines[prev].trim() === '') prev--;
          if (prev >= 0 && !foldedLines[prev].trim().startsWith('#')) {
            foldedLines[prev] = `${foldedLines[prev].trimEnd()} ${line.trim()}`;
            foldedLines[i] = '';
            foldedStandaloneModifierLines = true;
          }
        }
        if (foldedStandaloneModifierLines) {
          warnings.push('Folded standalone legacy include/exclude_* modifier lines onto preceding rules.');
        }
        next = foldedLines.join('\n');
      }

      // Additional unsupported constructs are handled by worker-level best-effort
      // parsing when recoverable.

      // Some published legacy files place version()/setOption() before begin model.
      // Our grammar only parses model blocks and actions, so preserve line count by
      // replacing those directive lines with comments.
      const firstActiveLine = getFirstActiveLine(next);
      const skipPreambleNormalize = firstActiveLine && firstActiveLine.toLowerCase().startsWith('begin');
      if (!skipPreambleNormalize) {
        const lines = next.split(/\r\n|\n/);
        let seenBeginModel = false;
        let _insideAnyBlock = false;
        let seenAnyBlock = false;
        let rewroteTopLevelDirectives = false;
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (BEGIN_MODEL_RE.test(trimmed)) {
            seenBeginModel = true;
            _insideAnyBlock = true;
            seenAnyBlock = true;
            return line;
          }
          if (BEGIN_BLOCK_RE.test(trimmed)) {
            _insideAnyBlock = true;
            seenAnyBlock = true;
            return line;
          }
          if (END_BLOCK_RE.test(trimmed)) {
            _insideAnyBlock = false;
            return line;
          }

          // Only rewrite truly top-level preamble text (before any begin/end block).
          // This preserves bare-block BNGL files that intentionally omit begin/end model.
          if (!seenBeginModel && !seenAnyBlock && trimmed !== '') {
            if (VERSION_DIRECTIVE_RE.test(trimmed) || SET_OPTION_DIRECTIVE_RE.test(trimmed)) {
              rewroteTopLevelDirectives = true;
              return `# [parser-normalized] ${line}`;
            }
            if (!trimmed.startsWith('#')) {
              rewroteTopLevelDirectives = true;
              return `# [parser-normalized] ${line}`;
            }
          }
          return line;
        });
        if (rewroteTopLevelDirectives) {
          warnings.push('Commented top-level legacy directives or non-BNGL content before begin model.');
        }
        next = rewritten.join('\n');
      }

      return { normalized: next, warnings };
    }

    const { normalized: legacyBlockNormalized, warned } = normalizeLegacyBlocks(sanitizedInput);
    sanitizedInput = legacyBlockNormalized;
    if (warned) {
      console.warn('[BNGL parser] Rewrote legacy "begin molecules"/"end molecules" to "begin molecule types" for parsing. Consider updating the model file.');
    }

    const { normalized: legacySyntaxNormalized, warnings: legacyWarnings } = normalizeLegacySyntax(sanitizedInput);
    sanitizedInput = legacySyntaxNormalized;
    for (const warning of legacyWarnings) {
      console.warn(`[BNGL parser] ${warning}`);
    }

    const inputStream = CharStreams.fromString(sanitizedInput);
    const lexer = new BNGLexer(inputStream);

    // Collect lexer errors
    lexer.removeErrorListeners();
    lexer.addErrorListener({
      syntaxError: (_recognizer, _offendingSymbol, line, charPositionInLine, msg) => {
        errors.push({ line, column: charPositionInLine, message: msg });
      }
    });

    const tokenStream = new CommonTokenStream(lexer);
    const parser = new BNGParser(tokenStream);

    // Collect parser errors
    parser.removeErrorListeners();
    parser.addErrorListener({
      syntaxError: (_recognizer, _offendingSymbol, line, charPositionInLine, msg) => {
        errors.push({ line, column: charPositionInLine, message: msg });
      }
    });

    // Two-stage parsing: try fast SLL prediction mode first with BailErrorStrategy.
    // If ambiguity or syntax error occurs in SLL mode, fall back to standard LL prediction mode.
    parser.interpreter.predictionMode = PredictionMode.SLL;
    parser.errorHandler = new BailErrorStrategy();

    let tree;
    try {
      tree = parser.prog();
    } catch (e: any) {
      if (e && (e.name === 'ParseCancellationException' || e.constructor?.name === 'ParseCancellationException')) {
        errors.length = 0;
        tokenStream.seek(0);
        parser.reset();
        parser.errorHandler = new DefaultErrorStrategy();
        parser.interpreter.predictionMode = PredictionMode.LL;
        tree = parser.prog();
      } else {
        throw e;
      }
    }

    // Visit the parse tree and build BNGLModel even if there are errors (best effort)
    let model: BNGLModel | undefined;
    try {
      const visitor = new BNGLVisitor();
      visitor.hasCompartments = sanitizedInput.includes('@');
      model = visitor.visit(tree);
    } catch (visitorError) {
      const message = visitorError instanceof Error ? visitorError.message : String(visitorError);
      console.error('Visitor exception:', visitorError);
      errors.push({
        line: 0,
        column: 0,
        message: `Visitor error: ${message}`
      });
    }

    if (errors.length === 0 && model) {
      const semanticErrors = validateModelSemantics(model);
      errors.push(...semanticErrors);
    }

    return {
      success: errors.length === 0,
      model,
      errors
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Parser exception:', e);
    return {
      success: false,
      errors: [{ line: 0, column: 0, message: message || 'Unknown parser error' }]
    };
  }
}

/**
 * Parses raw BioNetGen Language (BNGL) model text and returns the parsed model, throwing an Error if parsing fails.
 *
 * This function wraps `parseBNGLWithANTLR`, delegating full parsing, ANTLR lexing, legacy syntax normalization,
 * and semantic validation. If syntactic or semantic validation errors occur, it aggregates error messages formatted
 * with line and column numbers and throws a detailed Error.
 *
 * @invariant Must remain free of browser APIs (browser-API-free) as a core package utility in @bngplayground/engine.
 *
 * @param input - The raw BNGL model source code string to parse.
 * @returns The fully parsed and validated `BNGLModel` object.
 * @throws {Error} If `parseBNGLWithANTLR` fails to produce a model or encounters syntax or semantic errors.
 */
export function parseBNGLStrict(input: string): BNGLModel {
  const result = parseBNGLWithANTLR(input);

  if (!result.success || !result.model) {
    const errorMsg = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`).join('\n');
    throw new Error(`BNGL parse error:\n${errorMsg}`);
  }

  return result.model;
}

export function validateModelSemantics(model: BNGLModel): ParseError[] {
  const errors: ParseError[] = [];
  
  if (!model.moleculeTypes || model.moleculeTypes.length === 0) {
    return errors;
  }

  // 1. Build declared molecule types map
  const declaredMoleculeTypes = new Map<string, Set<string>>();
  for (const mt of model.moleculeTypes) {
    const componentNames = new Set<string>();
    for (const comp of mt.components) {
      const tildeIdx = comp.indexOf('~');
      const baseName = tildeIdx !== -1 ? comp.substring(0, tildeIdx).trim() : comp.trim();
      componentNames.add(baseName);
    }
    declaredMoleculeTypes.set(mt.name, componentNames);
  }

  interface GraphMolecule {
    name: string;
    components: Array<{ name: string; toString(): string }>;
    hasExplicitEmptyComponentList?: boolean;
  }

  // Helper function to check a molecule's components
  const checkMoleculeComponents = (mol: GraphMolecule, line: number, column: number, contextMsg: string): ParseError | null => {
    const declaredComps = declaredMoleculeTypes.get(mol.name);
    if (!declaredComps) {
      const prefix = contextMsg ? `${contextMsg}: ` : '';
      return {
        line,
        column,
        message: `${prefix}Molecule name ${mol.name} not declared in molecule types`
      };
    }

    const presentComps = new Set(mol.components.map((c) => c.name));
    const missing: string[] = [];
    for (const comp of declaredComps) {
      if (!presentComps.has(comp)) {
        missing.push(comp);
      }
    }

    if (missing.length > 0) {
      const compStr = mol.components.length > 0 || mol.hasExplicitEmptyComponentList
        ? '(' + mol.components.map((c) => c.toString()).join(',') + ')'
        : '()';
      const molStr = `${mol.name}${compStr}`;
      const prefix = contextMsg ? `${contextMsg}: ` : '';
      return {
        line,
        column,
        message: `${prefix}Component(s) ${missing.join(',')} missing from molecule ${molStr}`
      };
    }

    return null;
  };

  // 2. Validate seed species
  for (const sp of model.species || []) {
    const line = sp.line ?? 0;
    const column = sp.column ?? 0;
    try {
      const graph = BNGLParser.parseSpeciesGraph(sp.name);
      for (const mol of graph.molecules) {
        const err = checkMoleculeComponents(mol as GraphMolecule, line, column, '');
        if (err) {
          errors.push(err);
        }
      }
    } catch {
      // Ignore parse errors of species names here
    }
  }

  // 3. Validate reaction rules RHS (created molecules)
  for (const rule of model.reactionRules || []) {
    const line = rule.line ?? 0;
    const column = rule.column ?? 0;
    
    const reactantMols: GraphMolecule[] = [];
    for (const rStr of rule.literalReactants || rule.reactants) {
      try {
        const graph = BNGLParser.parseSpeciesGraph(rStr);
        reactantMols.push(...(graph.molecules as GraphMolecule[]));
      } catch {
        /* ignore parse errors in rule reactants */
      }
    }

    const productMols: GraphMolecule[] = [];
    for (const pStr of rule.literalProducts || rule.products) {
      try {
        const graph = BNGLParser.parseSpeciesGraph(pStr);
        productMols.push(...(graph.molecules as GraphMolecule[]));
      } catch {
        /* ignore parse errors in rule products */
      }
    }

    const reactantCounts = new Map<string, number>();
    for (const rMol of reactantMols) {
      reactantCounts.set(rMol.name, (reactantCounts.get(rMol.name) ?? 0) + 1);
    }

    const incompleteProductsByName = new Map<string, GraphMolecule[]>();
    for (const pMol of productMols) {
      const declaredComps = declaredMoleculeTypes.get(pMol.name);
      if (!declaredComps) {
        errors.push({
          line,
          column,
          message: `Molecule created in reaction rule: Molecule name ${pMol.name} not declared in molecule types`
        });
        continue;
      }

      const presentComps = new Set(pMol.components.map((c) => c.name));
      const hasMissing = Array.from(declaredComps).some(comp => !presentComps.has(comp));
      if (hasMissing) {
        if (!incompleteProductsByName.has(pMol.name)) {
          incompleteProductsByName.set(pMol.name, []);
        }
        incompleteProductsByName.get(pMol.name)!.push(pMol);
      }
    }

    for (const [name, incompleteList] of incompleteProductsByName.entries()) {
      const L = reactantCounts.get(name) ?? 0;
      if (incompleteList.length > L) {
        const pMol = incompleteList[0];
        const declaredComps = declaredMoleculeTypes.get(name);
        if (declaredComps) {
          const presentComps = new Set(pMol.components.map((c) => c.name));
          const missing: string[] = [];
          for (const comp of declaredComps) {
            if (!presentComps.has(comp)) {
              missing.push(comp);
            }
          }
          const compStr = pMol.components.length > 0 || pMol.hasExplicitEmptyComponentList
            ? '(' + pMol.components.map((c) => c.toString()).join(',') + ')'
            : '()';
          const molStr = `${pMol.name}${compStr}`;
          errors.push({
            line,
            column,
            message: `Molecule created in reaction rule: Component(s) ${missing.join(',')} missing from molecule ${molStr}`
          });
        }
      }
    }
  }

  return errors;
}
