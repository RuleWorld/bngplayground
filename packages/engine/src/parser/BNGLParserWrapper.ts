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
    let sanitizedInput = input.replace(/^\uFEFF/, '');

    // Normalize legacy 'begin molecules' / 'end molecules' blocks to
    // the preferred 'begin molecule types' / 'end molecule types' form.
    // We do this as a pre-parse normalization to preserve repository files
    // but remain compatible with BNG2.pl. We skip lines that are comments.
    function normalizeLegacyBlocks(src: string): { normalized: string; warned: boolean } {
      if (!/molecules/i.test(src)) {
        return { normalized: src, warned: false };
      }
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
      if (next.includes('::')) {
        const localContextMatches = Array.from(next.matchAll(/%([A-Za-z_][A-Za-z0-9_]*)::/g));
        if (localContextMatches.length > 0) {
          // Only strip the %x:: prefix from pattern positions; leave function defs/calls intact.
          next = next.replace(/%[A-Za-z_][A-Za-z0-9_]*::/g, '');

          warnings.push('Detected local-function context syntax (%x::); local function calls preserved for per-species rate evaluation.');
        }
      }

      // Normalize legacy compartment-before-parentheses molecule syntax used in
      // some cBNGL models: Mol@Comp(...) -> Mol(...)@Comp.
      // This keeps semantics while matching the ANTLR grammar's expected order.
      if (next.includes('@')) {
        const legacyCompBeforeParen = next.replace(
          /\b([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z_][A-Za-z0-9_]*)\(([^(){}]*)\)/g,
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
        const joined = next.replace(/\\\s*\r?\n\s*/g, ' ');
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
        const lower = source.toLowerCase();
        const beginToken = `begin ${beginName}`;
        const endToken = `end ${endName}`;
        const openStart = lower.indexOf(beginToken);
        if (openStart < 0) return null;

        const openLineEnd = source.indexOf('\n', openStart);
        const openEnd = openLineEnd >= 0 ? openLineEnd : source.length;
        const bodyStart = openEnd < source.length ? openEnd + 1 : openEnd;
        const closeStart = lower.indexOf(endToken, bodyStart);
        if (closeStart < 0) return null;

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

        // Find all label definitions in LHS (compName%label)
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

      if (next.includes('%')) {
        // ── apply expansion to reaction rules block ────────────────────────────
        const molCompStates = extractMolCompStates(next);
        if (/%[A-Za-z0-9_]+/.test(next) && molCompStates.size > 0) {
          const ruleBlock = findNamedBlock(next, 'reaction rules', 'reaction rules');
          let expandedSrc = next;
          if (ruleBlock) {
            const body = next.slice(ruleBlock.bodyStart, ruleBlock.bodyEnd);
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
        const percentInheritanceNormalized = next.replace(/([,(]\s*[A-Za-z_][A-Za-z0-9_]*)%([A-Za-z0-9_+-]+)/g, '$1~?');
        if (percentInheritanceNormalized !== next) {
          warnings.push('Normalized legacy component inheritance "%" labels to wildcard state "~?" (fallback: no molecule type info available).');
          next = percentInheritanceNormalized;
        }
      }

      // Fold standalone include/exclude_* modifier-only lines onto the previous
      // non-empty rule line instead of dropping them (semantics-preserving).
      if (/include_|exclude_/i.test(next)) {
        const modifierOnlyLinePattern = /^\s*(?:(?:include|exclude)_(?:reactants|products)\([^)]*\)\s*)+$/i;
        const foldedLines = next.split(/\r\n|\n/);
        let foldedStandaloneModifierLines = false;
        for (let i = 0; i < foldedLines.length; i++) {
          const line = foldedLines[i];
          if (!modifierOnlyLinePattern.test(line)) continue;

          let prev = i - 1;
          while (prev >= 0 && foldedLines[prev].trim() === '') prev--;
          if (prev >= 0 && !/^\s*#/.test(foldedLines[prev])) {
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
      const firstActiveLineMatch = next.match(/^\s*(?!#)\s*(.+)$/m);
      const skipPreambleNormalize = firstActiveLineMatch && /^begin\s+/i.test(firstActiveLineMatch[1]);
      if (!skipPreambleNormalize) {
        const lines = next.split(/\r\n|\n/);
        let seenBeginModel = false;
        let _insideAnyBlock = false;
        let seenAnyBlock = false;
        let rewroteTopLevelDirectives = false;
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (/^begin\s+model\b/i.test(trimmed)) {
            seenBeginModel = true;
            _insideAnyBlock = true;
            seenAnyBlock = true;
            return line;
          }
          if (/^begin\b/i.test(trimmed)) {
            _insideAnyBlock = true;
            seenAnyBlock = true;
            return line;
          }
          if (/^end\b/i.test(trimmed)) {
            _insideAnyBlock = false;
            return line;
          }

          // Only rewrite truly top-level preamble text (before any begin/end block).
          // This preserves bare-block BNGL files that intentionally omit begin/end model.
          if (!seenBeginModel && !seenAnyBlock && trimmed !== '') {
            if (/^version\s*\(/i.test(trimmed) || /^setOption\s*\(/i.test(trimmed)) {
              rewroteTopLevelDirectives = true;
              return `# [parser-normalized] ${line}`;
            }
            if (!/^#/.test(trimmed)) {
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

    // Parse the input
    // Parse the input
    const tree = parser.prog();

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

  // Helper function to check a molecule's components
  const checkMoleculeComponents = (mol: any, line: number, column: number, contextMsg: string): ParseError | null => {
    const declaredComps = declaredMoleculeTypes.get(mol.name);
    if (!declaredComps) {
      const prefix = contextMsg ? `${contextMsg}: ` : '';
      return {
        line,
        column,
        message: `${prefix}Molecule name ${mol.name} not declared in molecule types`
      };
    }

    const presentComps = new Set(mol.components.map((c: any) => c.name));
    const missing: string[] = [];
    for (const comp of declaredComps) {
      if (!presentComps.has(comp)) {
        missing.push(comp);
      }
    }

    if (missing.length > 0) {
      const compStr = mol.components.length > 0 || mol.hasExplicitEmptyComponentList
        ? '(' + mol.components.map((c: any) => c.toString()).join(',') + ')'
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
        const err = checkMoleculeComponents(mol, line, column, '');
        if (err) {
          errors.push(err);
        }
      }
    } catch (e) {
      // Ignore parse errors of species names here
    }
  }

  // 3. Validate reaction rules RHS (created molecules)
  for (const rule of model.reactionRules || []) {
    const line = rule.line ?? 0;
    const column = rule.column ?? 0;
    
    const reactantMols: any[] = [];
    for (const rStr of rule.literalReactants || rule.reactants) {
      try {
        const graph = BNGLParser.parseSpeciesGraph(rStr);
        reactantMols.push(...graph.molecules);
      } catch (e) {}
    }

    const productMols: any[] = [];
    for (const pStr of rule.literalProducts || rule.products) {
      try {
        const graph = BNGLParser.parseSpeciesGraph(pStr);
        productMols.push(...graph.molecules);
      } catch (e) {}
    }

    const reactantCounts = new Map<string, number>();
    for (const rMol of reactantMols) {
      reactantCounts.set(rMol.name, (reactantCounts.get(rMol.name) ?? 0) + 1);
    }

    const incompleteProductsByName = new Map<string, any[]>();
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

      const presentComps = new Set(pMol.components.map((c: any) => c.name));
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
        const declaredComps = declaredMoleculeTypes.get(name)!;
        const presentComps = new Set(pMol.components.map((c: any) => c.name));
        const missing: string[] = [];
        for (const comp of declaredComps) {
          if (!presentComps.has(comp)) {
            missing.push(comp);
          }
        }
        const compStr = pMol.components.length > 0 || pMol.hasExplicitEmptyComponentList
          ? '(' + pMol.components.map((c: any) => c.toString()).join(',') + ')'
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

  return errors;
}
