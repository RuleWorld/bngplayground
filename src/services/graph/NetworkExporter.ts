import type { BNGLModel, BNGLObservable } from '../../../types.ts';
import { Species } from './core/Species.ts';
import { Rxn } from './core/Rxn.ts';
import { BNGLParser } from './core/BNGLParser.ts';
import { GraphMatcher } from './core/Matcher.ts';
import { GraphCanonicalizer } from './core/Canonical.ts';
import { countEmbeddingDegeneracy } from './core/degeneracy.ts';

export class NetworkExporter {
  private static requiresGeneratedFunction(expr: string, model: BNGLModel): boolean {
    if (this.containsObservables(expr, model)) return true;
    if (/\bSpecies\d+\b/.test(expr)) return true;
    if (/\b(reactants|products)\b/.test(expr)) return true;

    const fnCallRegex = /\b([A-Za-z_]\w*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = fnCallRegex.exec(expr)) !== null) {
      const name = match[1];
      const isModelFunction = model.functions?.some((f) => f.name === name) ?? false;
      if (isModelFunction) return true;
    }

    return false;
  }

  private static splitObservablePatterns(pattern: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        const token = pattern.slice(start, i).trim();
        if (token.length > 0) parts.push(token);
        start = i + 1;
      }
    }

    const tail = pattern.slice(start).trim();
    if (tail.length > 0) parts.push(tail);
    return parts;
  }

  private static formatNumericFactor(v: number): string {
    if (!Number.isFinite(v)) return 'NaN';
    if (Math.abs(v) < 1e-15) return '0';
    // Keep enough precision for parity while staying compact.
    return Number(v.toPrecision(12)).toString();
  }

  /**
   * Exports the model and its expanded network to BioNetGen .net format.
   * @param model The parsed BNGL model containing parameters, observables, etc.
   * @param speciesList The list of concrete species generated during network expansion.
   * @param reactionList The list of concrete reactions generated during network expansion.
   * @returns A string in BioNetGen .net format.
   */
  static export(
    model: BNGLModel,
    speciesList: Species[],
    reactionList: Rxn[]
  ): string {
    let out = '# Created by BioNetGen Web Simulator\n';

    const normalizedReverse = new Map<string, Rxn>();
    const dedupedReactions: Rxn[] = [];
    for (const rxn of reactionList) {
      const name = rxn.name ?? '';
      const isReverse = name.startsWith('_reverse__');
      if (!isReverse) {
        dedupedReactions.push(rxn);
        continue;
      }

      const reactantsKey = rxn.reactants.slice().sort((a, b) => a - b).join(',');
      const productsKey = rxn.products.slice().sort((a, b) => a - b).join(',');
      const rateExprKey = (rxn.rateExpression ?? '').replace(/\s+/g, ' ').trim();
      const scaleKey = String((rxn as Rxn & { scalingVolume?: number }).scalingVolume ?? '');
      const key = `${reactantsKey}|${productsKey}|${rateExprKey}|${rxn.rate}|${scaleKey}`;

      if (normalizedReverse.has(key)) {
        continue;
      }

      normalizedReverse.set(key, rxn);
      dedupedReactions.push(rxn);
    }

    const sortedReactions = [...dedupedReactions].sort((a, b) => {
      const ra = a.reactants.slice().sort((x, y) => x - y).join(',');
      const rb = b.reactants.slice().sort((x, y) => x - y).join(',');
      if (ra !== rb) return ra.localeCompare(rb);
      const pa = a.products.slice().sort((x, y) => x - y).join(',');
      const pb = b.products.slice().sort((x, y) => x - y).join(',');
      if (pa !== pb) return pa.localeCompare(pb);
      const ea = (a.rateExpression ?? '').replace(/\s+/g, ' ').trim();
      const eb = (b.rateExpression ?? '').replace(/\s+/g, ' ').trim();
      if (ea !== eb) return ea.localeCompare(eb);
      return 0;
    });

    const generatedRateLaws: Array<{ name: string; expr: string; asFunction: boolean }> = [];
    let rateLawCounter = 1;

    const normalizeRateExpr = (rawExpr: string): { key: string; display: string } => {
      let expr = rawExpr.trim();

      while (expr.length >= 2 && expr.startsWith('(') && expr.endsWith(')')) {
        const inside = expr.substring(1, expr.length - 1).trim();
        let balance = 0;
        let isMatchingPair = true;
        for (let i = 0; i < inside.length; i++) {
          if (inside[i] === '(') balance++;
          if (inside[i] === ')') balance--;
          if (balance < 0) {
            isMatchingPair = false;
            break;
          }
        }
        if (isMatchingPair && balance === 0) {
          expr = inside;
        } else {
          break;
        }
      }

      return {
        key: expr.replace(/\s+/g, ''),
        display: expr
      };
    };

    // Helper to get or create a rate law parameter/function name.
    // Each call creates a new _rateLawN entry (no global dedup), matching BNG2's
    // per-rule-occurrence assignment. The pre-pass populates ruleRateLaws in
    // rule order so the parameters section exactly matches BNG2's ordering.
    const getRateLawName = (rawExpr: string, forceFunctionEntry?: boolean) => {
      const normalized = normalizeRateExpr(rawExpr);
      const expr = normalized.display;
      if (!expr) {
        return expr;
      }

      // 1. If it's a parameter name already AND we don't need a forced function entry,
      //    use it directly (no new _rateLawN created)
      if (!forceFunctionEntry && model.parameters[expr] !== undefined) {
        return expr;
      }

      // 2. If it's a function name (possibly with ()), return the function name directly
      //    WITHOUT creating a new _rateLawN entry.  This applies in two scenarios:
      //
      //    a) TotalRate rule (forceFunctionEntry=true) with a named function:
      //       BNG2 uses the named function verbatim — no new _rateLawN created.
      //       e.g. AXL(s~U) -> AXL(s~P) v_axl_phos() TotalRate → uses "v_axl_phos" directly.
      //
      //    b) Non-TotalRate rule (forceFunctionEntry=false) with a named function:
      //       BNG2 uses the named function verbatim when the rate is a named function.
      //       e.g. IP3() -> 0 v_metab_5p() → uses "v_metab_5p" directly.
      //
      //    NOTE: N-ary rules like X+X+Y -> ... v_auto() appear different in BNG2:
      //    BNG2 inlines the function body as a new _rateLawN constant expression.
      //    The web handles this correctly elsewhere via the function section rendering.
      const funcName = expr.endsWith('()') ? expr.slice(0, -2) : expr;
      const isNamedFunc = model.functions?.some(f => f.name === funcName);
      if (isNamedFunc) {
        return funcName;
      }

      // 3. Create a new _rateLawN entry (no dedup — BNG2 creates one per rule occurrence)
      const name = `_rateLaw${rateLawCounter++}`;
      generatedRateLaws.push({
        name,
        expr,
        // TotalRate rules or expressions with observables/functions get a function entry
        asFunction: forceFunctionEntry || this.requiresGeneratedFunction(expr, model)
      });
      return name;
    };

    const ruleRateLaws = new Map<number, { forward?: { key: string; name: string }; reverse?: { key: string; name: string } }>();

    // Pre-calculate generated _rateLawN naming in BNGL reaction-rule order,
    // assigning per rule occurrence (forward then reverse for bidirectional).
    // This ensures the parameters section matches BNG2's ordering.
    // BNG2 generates a _rateLawN() FUNCTION for TotalRate rules (even for simple named-param rates).
    (model.reactionRules ?? []).forEach((rule, idx) => {
      const ruleIndex = idx + 1;
      const entry: { forward?: { key: string; name: string }; reverse?: { key: string; name: string } } = {};

      const forwardExpr = rule.rateExpression ?? rule.rate;
      if (forwardExpr && forwardExpr.trim().length > 0) {
        const normalized = normalizeRateExpr(forwardExpr);
        // TotalRate rules: BNG2 always creates a _rateLawN() function entry
        const forceFunctionEntry = !!(rule as any).totalRate;
        entry.forward = { key: normalized.key, name: getRateLawName(forwardExpr, forceFunctionEntry) };
      }

      if (rule.isBidirectional) {
        const reverseExpr = rule.reverseRate ?? '';
        if (reverseExpr && reverseExpr.trim().length > 0) {
          const normalized = normalizeRateExpr(reverseExpr);
          entry.reverse = { key: normalized.key, name: getRateLawName(reverseExpr) };
        }
      }

      if (entry.forward || entry.reverse) {
        ruleRateLaws.set(ruleIndex, entry);
      }
    });

    // Freeze the counter after the pre-pass. The per-reaction loop should only use
    // pre-assigned names from ruleRateLaws (by rule index), never create new entries.
    // Any fallback that reaches getRateLawName will extend from this count, but that
    // should only happen for synthetic/non-rule reactions (e.g., sink/source).
    const rxnRateNames = new WeakMap<Rxn, string>();
    dedupedReactions.forEach(rxn => {
      const expr = rxn.rateExpression || rxn.rate.toString();
      const name = rxn.name ?? '';
      const ruleMatch = name.match(/_R(\d+)/);
      const ruleIndex = ruleMatch ? Number.parseInt(ruleMatch[1], 10) : null;
      // Two naming conventions for reverse reactions:
      //   NetworkGenerator: "_reverse___R1" (starts with "_reverse__")
      //   NetworkExpansion: "_R1_rev" (ends with "_rev" after extracting the number)
      const isReverse = name.startsWith('_reverse__') || name.endsWith('_rev');

      if (ruleIndex !== null) {
        const mapped = ruleRateLaws.get(ruleIndex);
        const side = isReverse ? mapped?.reverse : mapped?.forward;
        if (side) {
          // Use the pre-assigned name unconditionally — don't re-compare expressions
          // since the reaction's rateExpression may include statFactor or other
          // post-processing that changes the string from the rule's rate expression.
          rxnRateNames.set(rxn, side.name);
          return;
        }
      }

      rxnRateNames.set(rxn, getRateLawName(expr));
    });

    // 1. Parameters
    out += 'begin parameters\n';
    let paramIdx = 1;
    for (const [name, value] of Object.entries(model.parameters)) {
      out += `    ${(paramIdx++).toString().padStart(5)} ${name.padEnd(16)} ${value}\n`;
    }

    // Add generated rate law constants (parameters)
    for (const rateLaw of generatedRateLaws) {
      if (rateLaw.asFunction) {
        continue;
      }
      out += `    ${(paramIdx++).toString().padStart(5)} ${rateLaw.name.padEnd(16)} ${rateLaw.expr}\n`;
    }
    out += 'end parameters\n';

    // 2. Functions
    out += 'begin functions\n';
    let funcIdx = 1;
    if (model.functions) {
      model.functions.forEach(fn => {
        const argsStr = fn.args.length > 0 ? `(${fn.args.join(',')})` : '()';
        out += `    ${(funcIdx++).toString().padStart(5)} ${fn.name}${argsStr} ${fn.expression}\n`;
      });
    }
    // Add generated rate law functions
    for (const rateLaw of generatedRateLaws) {
      if (rateLaw.asFunction) {
        out += `    ${(funcIdx++).toString().padStart(5)} ${rateLaw.name}() ${rateLaw.expr}\n`;
      }
    }
    out += 'end functions\n';

    // 3. Species
    out += 'begin species\n';
    speciesList.forEach((spec, i) => {
      const idx = i + 1;
      // Use canonical species strings so ordering/formatting is stable and
      // closer to BNG2 .net conventions (notably compartment prefixes).
      const rawName = GraphCanonicalizer.canonicalize(spec.graph);
      const conc = spec.concentration ?? spec.initialConcentration ?? 0;
      const isConst = !!(spec as Species & { isConstant?: boolean }).isConstant;
      // BNG2 convention: $ goes AFTER the compartment prefix, e.g. @C::$ATP() not $@C::ATP()
      const compartmentPrefix = rawName.match(/^(@[^:]+::)/)?.[1] ?? '';
      const speciesBody = rawName.slice(compartmentPrefix.length);
      const name = compartmentPrefix + (isConst ? '$' : '') + speciesBody;
      out += `    ${idx.toString().padStart(5)} ${name.padEnd(30)} ${conc}\n`;
    });
    out += 'end species\n';

    // 4. Reactions
    out += 'begin reactions\n';
    const parameterMap = new Map<string, number>(Object.entries(model.parameters ?? {}).map(([k, v]) => [k, Number(v)]));
    // Add generated rate law constants (non-function entries) so inferredStatFactor
    // can resolve them when the merged rxn.rate has been doubled by SB-collapsed matches.
    for (const rateLaw of generatedRateLaws) {
      if (!rateLaw.asFunction) {
        // Try direct numeric parse first, then evaluate as expression
        const directVal = Number(rateLaw.expr);
        if (Number.isFinite(directVal)) {
          parameterMap.set(rateLaw.name, directVal);
        } else {
          try {
            const exprVal = BNGLParser.evaluateExpression(rateLaw.expr, parameterMap as any);
            if (Number.isFinite(exprVal)) {
              parameterMap.set(rateLaw.name, exprVal);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    sortedReactions.forEach((rxn, i) => {
      const idx = i + 1;
      const reactants = rxn.reactants.length > 0
        ? rxn.reactants.map(r => r + 1).join(',')
        : '0'; // BNG .net explicit null species
      const products = rxn.products.length > 0
        ? rxn.products.map(p => p + 1).join(',')
        : '0'; // BNG .net explicit null species

      const rateName = rxnRateNames.get(rxn) ?? (rxn.rateExpression || rxn.rate.toString());
      const baseRateExpr = (rxn.rateExpression ?? '').trim();

      // BNG2 .net stores multiplicative coefficients in reaction coefficients.
      // Reconstruct numeric prefix as: statFactor * unitFactor.
      const reactantOrder = rxn.reactants.length;
      const scalingVolume = (rxn as any).scalingVolume as number | undefined;
      const rateNameIsNumeric = Number.isFinite(Number(rateName));

      // Prefer deriving symbolic multiplicative factor directly from the
      // generated numeric reaction rate when the base rate token is evaluable.
      // This is robust against stale/inexact statFactor metadata on Rxn.
      // IMPORTANT: Use `rateName` (the rule's rate law identifier, e.g. "k_trif_rec")
      // as the base divisor, NOT `baseRateExpr` (which may have been folded to include
      // a statFactor prefix like "(2)*(k_trif_rec)"). Using `baseRateExpr` directly
      // would give ratio = 1 instead of the correct statFactor.
      let inferredStatFactor: number | null = null;
      if (!rateNameIsNumeric) {
        let baseRateValue = Number.NaN;

        // Primary: evaluate rateName (the canonical rate identifier assigned by the exporter)
        try {
          baseRateValue = BNGLParser.evaluateExpression(rateName, parameterMap as any);
        } catch {
          baseRateValue = Number.NaN;
        }

        // Fallback: evaluate baseRateExpr if rateName didn't resolve
        if (!Number.isFinite(baseRateValue) && baseRateExpr.length > 0) {
          try {
            baseRateValue = BNGLParser.evaluateExpression(baseRateExpr, parameterMap as any);
          } catch {
            baseRateValue = Number.NaN;
          }
        }

        if (Number.isFinite(baseRateValue) && Math.abs(baseRateValue) > 1e-15 && Number.isFinite(rxn.rate)) {
          const ratio = rxn.rate / baseRateValue;
          if (Number.isFinite(ratio) && Math.abs(ratio) > 1e-15) {
            inferredStatFactor = Number(ratio.toPrecision(12));
          }
        }
      }

      const statFactor = rateNameIsNumeric
        ? 1
        : (inferredStatFactor ?? (rxn.statFactor ?? 1));
      let unitFactor = 1;
      if (
        typeof scalingVolume === 'number' &&
        Number.isFinite(scalingVolume) &&
        scalingVolume > 0
      ) {
        if (reactantOrder === 0) {
          // Zero-order synthesis in compartment C scales as k * Volume(C).
          unitFactor = scalingVolume;
        } else if (reactantOrder > 1) {
          unitFactor = 1 / Math.pow(scalingVolume, reactantOrder - 1);
        }
      }

      const prefix = statFactor * unitFactor;
      const rateToken = Math.abs(prefix - 1) > 1e-15
        ? `${this.formatNumericFactor(prefix)}*${rateName}`
        : rateName;

      const ruleName = rxn.name ? ` #${rxn.name}` : '';
      out += `    ${idx.toString().padStart(5)} ${reactants.padEnd(10)} ${products.padEnd(10)} ${rateToken}${ruleName}\n`;
    });
    out += 'end reactions\n';

    // 5. Groups (Observables)
    if (model.observables && model.observables.length > 0) {
      out += 'begin groups\n';
      model.observables.forEach((obs, i) => {
        const idx = i + 1;
        const weights = this.calculateObservableWeights(obs, speciesList);
        if (weights.length > 0) {
          const weightStr = weights.map(w => (w.weight === 1 ? `${w.speciesIdx}` : `${w.weight}*${w.speciesIdx}`)).join(',');
          out += `    ${idx.toString().padStart(5)} ${obs.name.padEnd(20)} ${weightStr}\n`;
        } else {
          out += `    ${idx.toString().padStart(5)} ${obs.name.padEnd(20)}\n`;
        }
      });
      out += 'end groups\n';
    }

    return out;
  }

  private static containsObservables(expr: string, model: BNGLModel): boolean {
    if (!model.observables) return false;
    return model.observables.some(obs => {
      const regex = new RegExp(`\\b${obs.name}\\b`);
      return regex.test(expr);
    });
  }

  /**
   * Calculates the weights for each species in an observable group.
   */
  private static calculateObservableWeights(
    obs: BNGLObservable,
    speciesList: Species[]
  ): { speciesIdx: number; weight: number }[] {
    const weightsMap = new Map<number, number>();
    const obsType = (obs.type ?? '').toLowerCase();

    // Split multi-pattern observables on top-level commas only so component
    // lists like A(b,b!?) are preserved as one pattern.
    const patternStrings = this.splitObservablePatterns(obs.pattern);

    // Pre-compute canonical species names once for efficient compartment filtering.
    // These are needed when observable patterns have a compartment scope prefix
    // (e.g. "@PM:L" — matches only species whose canonical compartment is PM).
    const speciesCanonicalNames = speciesList.map(s => s.canonicalString);

    for (const patternStr of patternStrings) {
      // Parse optional compartment scope prefix from the pattern string.
      // BNG2 BNGL supports "@COMP:PatternExpr" notation in observables, meaning
      // only species whose canonical compartment anchor is COMP are eligible.
      // Examples:  "@PM:L"        → scope=PM, inner="L"
      //            "@EM:R(tf~pY)" → scope=EM, inner="R(tf~pY)"
      //            "R(tf~pY!?)"   → scope=null, inner="R(tf~pY!?)" (no filter)
      const compMatch = patternStr.match(/^@([A-Za-z_][A-Za-z0-9_]*):([\s\S]*)/);
      const compartmentScope: string | null = compMatch ? compMatch[1] : null;
      const innerPatternStr = compMatch ? compMatch[2].trim() : patternStr;

      try {
        const patternGraph = BNGLParser.parseSpeciesGraph(innerPatternStr, true);
        // Fix: BNG2 uses EXACT bond-count matching at every specified component
        // site for ALL observable types (Molecules and Species alike).  When a
        // pattern says "Cyclin(b!1)" (one bond at b), species where Cyclin.b
        // carries an additional bond (e.g. "Cyclin(b!1!2)") are NOT counted.
        // This corrects over-counting of multivalent-site species (e.g. p21-
        // bound Cyclin-CDK complexes appearing in Active_CycB).
        const relaxedBonds = false;
        speciesList.forEach((species, i) => {
          const speciesIdx = i + 1;
          // Apply compartment scope filter when the pattern has a "@COMP:" prefix.
          // Only species whose canonical name starts with "@COMP::" are eligible.
          if (compartmentScope !== null) {
            if (!speciesCanonicalNames[i].startsWith(`@${compartmentScope}::`)) {
              return;
            }
          }
          const matches = GraphMatcher.findAllMaps(patternGraph, species.graph, {
            symmetryBreaking: false,
            allowExtraTargetBonds: relaxedBonds
          });
          const count = matches.reduce((total, match) => {
            return total + countEmbeddingDegeneracy(patternGraph, species.graph, match);
          }, 0);
          if (count > 0) {
            // For 'Molecules' observables, the coefficient equals the molecule-level
            // embedding count (how many times the pattern matches within the species).
            // For 'Species' observables, each matching species contributes exactly 1
            // (counting complex instances, not individual molecule embeddings).
            // This matches BNG2 behavior for the vast majority of observable patterns.
            const weightToAdd = (obsType === 'species') ? 1 : count;
            weightsMap.set(speciesIdx, (weightsMap.get(speciesIdx) ?? 0) + weightToAdd);
          }
        });
      } catch (err) {
        console.warn(`[NetworkExporter] Failed to parse pattern '${patternStr}' for observable '${obs.name}':`, err);
      }
    }

    return Array.from(weightsMap.entries()).map(([speciesIdx, weight]) => ({
      speciesIdx,
      weight
    }));
  }
}
