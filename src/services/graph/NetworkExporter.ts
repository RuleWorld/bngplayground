import { BNGLModel, BNGLObservable } from '../../../types.ts';
import { Species } from './core/Species.ts';
import { Rxn } from './core/Rxn.ts';
import { BNGLParser } from './core/BNGLParser.ts';
import { GraphMatcher } from './core/Matcher.ts';

export class NetworkExporter {
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

    // Identified unique rate laws that are not simple constants or parameters
    const uniqueRates = new Map<string, string>();
    let rateLawCounter = 1;

    // Helper to get or create a rate law parameter/function name
    const getRateLawName = (rawExpr: string) => {
      let expr = rawExpr.trim();

      // Unwrap simple parentheses, e.g., "(p1)" -> "p1"
      // Unwrap outer parentheses if present (NetworkGenerator often adds them)
      while (expr.length >= 2 && expr.startsWith('(') && expr.endsWith(')')) {
        const inside = expr.substring(1, expr.length - 1).trim();
        
        // Only unwrap if the parentheses are matching pair for the whole string
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

      // 1. If it's a parameter name already, use it directly
      if (model.parameters[expr] !== undefined) {
        return expr;
      }

      // 2. If it's a function name (possibly with ()), use it directly
      const funcName = expr.endsWith('()') ? expr.slice(0, -2) : expr;
      const isNamedFunc = model.functions?.some(f => f.name === funcName);
      if (isNamedFunc) {
        return funcName;
      }

      console.log(`[DEBUG_EXPORTER] getRateLawName(${expr}): not found in params (${Object.keys(model.parameters).length}) or functions (${model.functions?.length || 0})`);

      // 3. Check cache
      if (uniqueRates.has(expr)) {
        return uniqueRates.get(expr)!;
      }

      // 4. Create a new _rateLawN
      const name = `_rateLaw${rateLawCounter++}`;
      uniqueRates.set(expr, name);
      return name;
    };

    // Pre-calculate rate law names for all rules (BNG2 includes these even if rules don't fire)
    model.reactionRules.forEach(rule => {
      if (rule.rateExpression !== undefined && rule.rateExpression !== null) {
        getRateLawName(rule.rateExpression.toString());
      } else if (rule.rate !== undefined && rule.rate !== null) {
        getRateLawName(rule.rate.toString());
      }
      if (rule.isBidirectional && rule.reverseRate !== undefined && rule.reverseRate !== null) {
        getRateLawName(rule.reverseRate.toString());
      }
    });

    // Pre-calculate rate law names for reactions
    const rxnRateNames = reactionList.map(rxn => {
      const expr = rxn.rateExpression || rxn.rate.toString();
      return getRateLawName(expr);
    });

    // 1. Parameters
    out += 'begin parameters\n';
    let paramIdx = 1;
    for (const [name, value] of Object.entries(model.parameters)) {
      out += `    ${(paramIdx++).toString().padStart(5)} ${name.padEnd(16)} ${value}\n`;
    }

    // Add generated rate law constants (parameters)
    for (const [expr, name] of uniqueRates.entries()) {
      if (expr.includes('(') || this.containsObservables(expr, model)) {
        continue;
      }
      out += `    ${(paramIdx++).toString().padStart(5)} ${name.padEnd(16)} ${expr}\n`;
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
    for (const [expr, name] of uniqueRates.entries()) {
      if (expr.includes('(') || this.containsObservables(expr, model)) {
        out += `    ${(funcIdx++).toString().padStart(5)} ${name}() ${expr}\n`;
      }
    }
    out += 'end functions\n';

    // 3. Species
    out += 'begin species\n';
    speciesList.forEach((spec, i) => {
      const idx = i + 1;
      const name = spec.toString();
      const conc = spec.initialConcentration ?? 0;
      out += `    ${idx.toString().padStart(5)} ${name.padEnd(30)} ${conc}\n`;
    });
    out += 'end species\n';

    // 4. Reactions
    out += 'begin reactions\n';
    reactionList.forEach((rxn, i) => {
      const idx = i + 1;
      const reactants = rxn.reactants.map(r => r + 1).join(','); // 1-indexed
      const products = rxn.products.map(p => p + 1).join(',');   // 1-indexed
      const rateName = rxnRateNames[i];
      const ruleName = rxn.name ? ` #${rxn.name}` : '';
      out += `    ${idx.toString().padStart(5)} ${reactants.padEnd(10)} ${products.padEnd(10)} ${rateName}${ruleName}\n`;
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

    // Split multi-pattern observables (e.g., "A(b), B(a)")
    const patternStrings = obs.pattern.split(',').map(s => s.trim()).filter(Boolean);

    for (const patternStr of patternStrings) {
      try {
        const patternGraph = BNGLParser.parseSpeciesGraph(patternStr, true);
        speciesList.forEach((species, i) => {
          const speciesIdx = i + 1;
          const matches = GraphMatcher.findAllMaps(patternGraph, species.graph, { symmetryBreaking: false });
          const count = matches.length;
          if (count > 0) {
            const weightToAdd = (obs.type === 'Species') ? 1 : count;
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
