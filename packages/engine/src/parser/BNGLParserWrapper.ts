/**
 * ANTLR4-based BNGL Parser Wrapper
 * 
 * Parses BNGL files using the ANTLR4 grammar and converts to ParsedBNGL type.
 * Provides BNG2.pl-compatible parsing for maximum parity.
 */
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { BNGLexer } from './generated/BNGLexer';
import { BNGParser } from './generated/BNGParser';
import { BNGLVisitor } from './BNGLVisitor';
import type { BNGLModel } from '../types';

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

/**
 * Parse a BNGL file using ANTLR4 grammar
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
    let sanitizedInput = input.replace(/^\uFEFF/, '');

    // Normalize legacy 'begin molecules' / 'end molecules' blocks to
    // the preferred 'begin molecule types' / 'end molecule types' form.
    // We do this as a pre-parse normalization to preserve repository files
    // but remain compatible with BNG2.pl. We skip lines that are comments.
    function normalizeLegacyBlocks(src: string): { normalized: string; warned: boolean } {
      const lines = src.split(/\r\n|\n/);
      let warned = false;
      const out = lines.map(line => {
        const trimmedStart = line.replace(/^\s*/, '');
        // Skip commented lines
        if (/^#/.test(trimmedStart)) return line;
        if (/^\s*begin\s+molecules\b/i.test(line)) {
          warned = true;
          return line.replace(/begin\s+molecules\b/i, 'begin molecule types');
        }
        if (/^\s*end\s+molecules\b/i.test(line)) {
          warned = true;
          return line.replace(/end\s+molecules\b/i, 'end molecule types');
        }
        return line;
      });
      return { normalized: out.join('\n'), warned };
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
      const localContextMatches = Array.from(next.matchAll(/%([A-Za-z_][A-Za-z0-9_]*)::/g));
      if (localContextMatches.length > 0) {
        // Only strip the %x:: prefix from pattern positions; leave function defs/calls intact.
        next = next.replace(/%[A-Za-z_][A-Za-z0-9_]*::/g, '');

        warnings.push('Detected local-function context syntax (%x::); local function calls preserved for per-species rate evaluation.');
      }

      // Normalize legacy compartment-before-parentheses molecule syntax used in
      // some cBNGL models: Mol@Comp(...) -> Mol(...)@Comp.
      // This keeps semantics while matching the ANTLR grammar's expected order.
      const legacyCompBeforeParen = next.replace(
        /\b([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z_][A-Za-z0-9_]*)\(([^(){}]*)\)/g,
        (_m, mol, comp, args) => `${mol}(${String(args ?? '')})@${comp}`
      );
      if (legacyCompBeforeParen !== next) {
        warnings.push('Normalized legacy compartment-before-parentheses syntax (Mol@Comp(...) -> Mol(...)@Comp).');
        next = legacyCompBeforeParen;
      }

      // Normalize explicit line continuations used in legacy reaction rules by
      // folding continued lines into a single logical rule line.
      const joined = next.replace(/\\\s*\r?\n\s*/g, ' ');
      if (joined !== next) {
        warnings.push('Joined legacy line continuations (\\) for parser compatibility.');
        next = joined;
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

      // ── helper: extract molecule-type component states ──────────────────────
      function extractMolCompStates(src: string): Map<string, Map<string, string[]>> {
        const result = new Map<string, Map<string, string[]>>();
        const block = src.match(/begin\s+molecule\s+types\s*[\r\n]+([\s\S]*?)end\s+molecule\s+types/i);
        if (!block) return result;
        for (const line of block[1].split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const mm = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/);
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
        const commentIdx = ruleLine.search(/\s*#(?![-+])/);
        const mainPart = commentIdx >= 0 ? ruleLine.slice(0, commentIdx) : ruleLine;
        const comment = commentIdx >= 0 ? ruleLine.slice(commentIdx) : '';

        // Split into rule components: optional "name:", lhs, arrow, rhs, rate(s)
        // We use a loose split: find the arrow (-> or <->), then parse around it.
        const arrowMatch = mainPart.match(/^(.*?)\s*(<->|->|<-)\s*(.*?)\s+((?:\S+)(?:\s+\S+)?)\s*$/);
        if (!arrowMatch) return null;
        const lhsRaw = arrowMatch[1].trim();
        const arrow = arrowMatch[2];
        const rhsRaw = arrowMatch[3].trim();
        const rateRaw = arrowMatch[4].trim();

        // Find all label definitions in LHS (compName%label)
        const labelRe = /([A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_]+)/g;
        const labelDefs = new Map<
          string,
          { molName: string; compName: string; states: string[]; reactantIdx: number }
        >();

        const reactants = lhsRaw.split('+').map((s) => s.trim());
        for (let ri = 0; ri < reactants.length; ri++) {
          const reactant = reactants[ri];
          // iterate over molecule patterns
          const molPatRe = /([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/g;
          let mm;
          while ((mm = molPatRe.exec(reactant)) !== null) {
            const molName = mm[1];
            for (const comp of mm[2].split(',')) {
              const ct = comp.trim();
              const lm = ct.match(/^([A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_]+)/);
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

      // ── apply expansion to reaction rules block ────────────────────────────
      const molCompStates = extractMolCompStates(next);
      const rulesBlockRe =
        /(begin\s+reaction\s+rules\s*[\r\n]+)([\s\S]*?)([\r\n]+end\s+reaction\s+rules)/i;
      if (/%[A-Za-z0-9_]+/.test(next) && molCompStates.size > 0) {
        const expandedSrc = next.replace(rulesBlockRe, (_full, open, body, close) => {
          const lines = body.split(/\r?\n/);
          const outLines: string[] = [];
          for (const line of lines) {
            const t = line.trim();
            if (!t || t.startsWith('#') || !/%[A-Za-z0-9_]+/.test(t)) {
              outLines.push(line);
              continue;
            }
            const expanded = expandRuleLine(t, molCompStates);
            if (expanded) {
              outLines.push(...expanded);
            } else {
              outLines.push(line); // fallback: keep original
            }
          }
          return open + outLines.join('\n') + close;
        });
        if (expandedSrc !== next) {
          warnings.push('Expanded state-inheritance "%" labels into concrete rules (BNG2 style).');
          next = expandedSrc;
        }
      }

      // Fallback: if any %n patterns remain (molecule type info unavailable or
      // expansion did not apply), strip to wildcard ~? to keep rules applicable.
      // Keep molecule labels like ")%1" unchanged by anchoring to component starts.
      const percentInheritanceNormalized = next.replace(/([,(]\s*[A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_+-]+)/g, '$1~?');
      if (percentInheritanceNormalized !== next) {
        warnings.push('Normalized legacy component inheritance "%" labels to wildcard state "~?" (fallback: no molecule type info available).');
        next = percentInheritanceNormalized;
      }

      // Fold standalone include/exclude_* modifier-only lines onto the previous
      // non-empty rule line instead of dropping them (semantics-preserving).
      const modifierTokenPattern = /(?:include|exclude)_(?:reactants|products)\([^)]*\)/g;
      const modifierOnlyLinePattern = /^\s*(?:(?:include|exclude)_(?:reactants|products)\([^)]*\)\s*)+$/i;
      const foldedLines = next.split(/\r\n|\n/);
      let foldedStandaloneModifierLines = false;
      for (let i = 0; i < foldedLines.length; i++) {
        const line = foldedLines[i];
        if (!modifierOnlyLinePattern.test(line)) continue;

        let prev = i - 1;
        while (prev >= 0 && foldedLines[prev].trim() === '') prev--;
        if (prev >= 0 && !/^\s*#/.test(foldedLines[prev])) {
          foldedLines[prev] = `${foldedLines[prev].replace(/\s+$/,'')} ${line.trim()}`;
          foldedLines[i] = '';
          foldedStandaloneModifierLines = true;
        }
      }
      if (foldedStandaloneModifierLines) {
        warnings.push('Folded standalone legacy include/exclude_* modifier lines onto preceding rules.');
      }
      next = foldedLines.join('\n');

      // Additional unsupported constructs are handled by worker-level best-effort
      // parsing when recoverable.

      // Some published legacy files place version()/setOption() before begin model.
      // Our grammar only parses model blocks and actions, so preserve line count by
      // replacing those directive lines with comments.
      const lines = next.split(/\r\n|\n/);
      let seenBeginModel = false;
      let rewroteTopLevelDirectives = false;
      const rewritten = lines.map(line => {
        const trimmed = line.trim();
        if (/^begin\s+model\b/i.test(trimmed)) {
          seenBeginModel = true;
          return line;
        }
        if (/^setOption\s*\(/i.test(trimmed)) {
          rewroteTopLevelDirectives = true;
          return `# [parser-normalized] ${trimmed}`;
        }
        if (!seenBeginModel) {
          if (/^version\s*\(/i.test(trimmed) || /^setOption\s*\(/i.test(trimmed)) {
            rewroteTopLevelDirectives = true;
            return `# [parser-normalized] ${trimmed}`;
          }
        }
        return line;
      });
      if (rewroteTopLevelDirectives) {
        warnings.push('Commented top-level legacy directives before begin model (version/setOption).');
      }

      return { normalized: rewritten.join('\n'), warnings };
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

    // Parse the input
    // Parse the input
    const tree = parser.prog();

    // Visit the parse tree and build BNGLModel even if there are errors (best effort)
    let model: BNGLModel | undefined;
    try {
      const visitor = new BNGLVisitor();
      model = visitor.visit(tree);
    } catch (visitorError: any) {
      console.error('Visitor exception:', visitorError);
      errors.push({
        line: 0,
        column: 0,
        message: `Visitor error: ${visitorError.message}`
      });
    }

    return {
      success: errors.length === 0,
      model,
      errors
    };
  } catch (e: any) {
    console.error('Parser exception:', e);
    return {
      success: false,
      errors: [{ line: 0, column: 0, message: e.message || 'Unknown parser error' }]
    };
  }
}

/**
 * Parse BNGL and throw on error (for compatibility with existing code)
 */
export function parseBNGLStrict(input: string): BNGLModel {
  const result = parseBNGLWithANTLR(input);

  if (!result.success || !result.model) {
    const errorMsg = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`).join('\n');
    throw new Error(`BNGL parse error:\n${errorMsg}`);
  }

  return result.model;
}
