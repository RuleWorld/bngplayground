import type { BNGLModel } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';
import type { SpeciesGraph } from '../graph/core/SpeciesGraph';
import { escapeXml } from '../../utils/xmlUtils';

export interface BNGXMLValidationIssue {
  message: string;
}

export interface BNGXMLValidationResult {
  valid: boolean;
  errors: BNGXMLValidationIssue[];
  warnings: BNGXMLValidationIssue[];
}

const normalizeObservableType = (value?: string): string => {
  const raw = String(value ?? 'Molecules');
  const lower = raw.toLowerCase();
  if (lower === 'molecules') return 'Molecules';
  if (lower === 'species') return 'Species';
  return raw;
};

function parseObservableConstraint(pattern: string): { cleanPattern: string; relation?: string; quantity?: string } {
  const trimmed = pattern.trim();
  const operators = ['==', '<=', '>=', '!=', '<', '>'];

  for (const operator of operators) {
    const operatorIndex = trimmed.lastIndexOf(operator);
    if (operatorIndex <= 0) continue;

    const quantityText = trimmed.slice(operatorIndex + operator.length).trim();
    if (!quantityText || !/^[0-9]+$/.test(quantityText)) continue;

    const cleanPattern = trimmed.slice(0, operatorIndex).trimEnd();
    if (cleanPattern.length === 0) continue;

    return {
      cleanPattern,
      relation: operator,
      quantity: quantityText,
    };
  }

  return { cleanPattern: trimmed };
}

function isIdentifierChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    ch === '_' ||
    ch === '$'
  );
}

function replaceWholeWord(source: string, target: string, replacement: string): string {
  let result = '';

  for (let i = 0; i < source.length; ) {
    if (
      source.startsWith(target, i) &&
      !isIdentifierChar(source[i - 1]) &&
      !isIdentifierChar(source[i + target.length])
    ) {
      result += replacement;
      i += target.length;
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}

function findFunctionCallStart(source: string, fnName: string, fromIndex: number): number {
  let searchIndex = fromIndex;

  while (true) {
    const startIdx = source.indexOf(fnName, searchIndex);
    if (startIdx === -1) return -1;

    if (isIdentifierChar(source[startIdx - 1])) {
      searchIndex = startIdx + 1;
      continue;
    }

    let cursor = startIdx + fnName.length;
    while (cursor < source.length && /\s/.test(source[cursor])) {
      cursor++;
    }

    if (source[cursor] === '(') return startIdx;
    searchIndex = startIdx + 1;
  }
}

/**
 * Expand user-defined function calls inline for NFsim compatibility.
 * NFsim doesn't support user-defined functions in rate expressions — they must be fully expanded.
 * Recursively expands nested function calls.
 */
function expandUserDefinedFunctions(
  expr: string,
  functions: Array<{ name: string; args: string[]; expression: string }>,
  maxDepth = 10
): string {
  if (maxDepth <= 0) return expr; // prevent infinite recursion

  const fnMap = new Map(functions.map(f => [f.name, f]));
  let expanded = expr;
  let changed = true;

  while (changed && maxDepth > 0) {
    changed = false;
    maxDepth--;

    // Match function calls: fname(arg1, arg2, ...)
    // Use a regex that handles nested parentheses via counting (simplified: one level)
    for (const [fnName, fn] of fnMap) {
      let searchFrom = 0;

      while (true) {
        const startIdx = findFunctionCallStart(expanded, fnName, searchFrom);
        if (startIdx === -1) break;
        let openParenIdx = startIdx + fnName.length;
        while (openParenIdx < expanded.length && /\s/.test(expanded[openParenIdx])) {
          openParenIdx++;
        }
        const argsStartIdx = openParenIdx + 1;

        // Find matching closing paren by counting depth
        let depth = 1;
        let i = argsStartIdx;
        const argChars: string[] = [];

        while (i < expanded.length && depth > 0) {
          const ch = expanded[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          if (depth > 0) argChars.push(ch);
          i++;
        }

        if (depth !== 0) break; // unmatched parens — skip this malformed call

        const argsStr = argChars.join('');
        const args = argsStr.split(',').map(a => a.trim());

        if (args.length !== fn.args.length) continue; // arg count mismatch — skip

        // Substitute parameters with arguments in the function body
        let bodyExpanded = fn.expression;
        for (let j = 0; j < fn.args.length; j++) {
          const paramName = fn.args[j];
          const argValue = args[j];
          // Replace whole-word occurrences of the parameter with the argument
          bodyExpanded = replaceWholeWord(bodyExpanded, paramName, `(${argValue})`);
        }

        // Replace the function call with the expanded body
        const callEnd = i;
        expanded = expanded.slice(0, startIdx) + `(${bodyExpanded})` + expanded.slice(callEnd);
        changed = true;
        break; // restart the while loop to handle the modified string
      }
    }
  }

  return expanded;
}

export class BNGXMLWriter {
  static write(model: BNGLModel): string {
    const modelId = model.name ? escapeXml(model.name) : 'model';
    const parameters = model.parameters || {};
    const observables = model.observables || [];
    const species = model.species || [];
    const reactions = model.reactionRules || [];
    const compartments = model.compartments || [];

    const moleculeTypeDefs = this.inferMoleculeTypes(model);

    const synthesizedParameters: { id: string; expression: string }[] = [];
    // Rate expressions that reference observables must be emitted as <Function>
    // elements (not <Parameter>) so NFsim can resolve them at runtime.
    const observableDependentRates = new Set<string>();

    const obsNames = new Set(observables.map(o => o.name));

    // Pre-pass on reaction rules to collect synthesized rate laws
    reactions.forEach((r, idx) => {
      const baseId = `RR${idx + 1}`;
      const rates = r.isBidirectional && r.reverseRate !== undefined ? [r.rate, r.reverseRate] : [r.rate];
      rates.forEach((rate, rIdx) => {
        const rateValue = rate !== undefined ? String(rate) : '0';
        const isComplex = rateValue.length > 0 &&
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rateValue) &&
          !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(rateValue);

        if (isComplex) {
          const pId = rIdx === 0 ? `_func_rate_${baseId}` : `_func_rate_${baseId}_rev`;
          // Check if expression references any observables
          const tokens = rateValue.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
          const refsObservable = tokens.some(t => obsNames.has(t));
          if (refsObservable) {
            observableDependentRates.add(pId);
          }
          const expandedRateValue = expandUserDefinedFunctions(rateValue, model.functions || []);
          const expandedTokens = expandedRateValue.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
          if (expandedTokens.some(t => obsNames.has(t))) {
            observableDependentRates.add(pId);
          }
          synthesizedParameters.push({ id: pId, expression: rateValue });
        }
      });
    });

    const evalParams = new Map<string, number>();
    Object.entries(parameters).forEach(([name, value]) => {
      evalParams.set(name, typeof value === 'number' ? value : parseFloat(String(value)));
    });

    const parametersXml = Object.entries(parameters)
      .map(([name, value]) => {
        const val = escapeXml(String(value));
        return `      <Parameter id="${escapeXml(name)}" type="Constant" value="${val}" expr="${val}"/>\n`;
      })
      .join('') +
      synthesizedParameters
      .filter(p => !observableDependentRates.has(p.id))
      .map(p => {
        // Expand user-defined functions for NFsim compatibility
        const expandedExpr = expandUserDefinedFunctions(p.expression, model.functions || []);
        const val = BNGLParser.evaluateExpression(expandedExpr, evalParams);
        const valStr = isNaN(val) ? expandedExpr : String(val);
        return `      <Parameter id="${escapeXml(p.id)}" type="Constant" value="${escapeXml(valStr)}" expr="${escapeXml(expandedExpr)}"/>\n`;
      })
      .join('');

    const explicitMoleculeTypes = new Map<string, string[]>();
    (model.moleculeTypes || []).forEach((mt) => {
      explicitMoleculeTypes.set(mt.name, [...(mt.components || [])]);
    });

    const orderedMoleculeTypeNames: string[] = [
      ...(model.moleculeTypes || []).map((mt) => mt.name),
      ...Array.from(moleculeTypeDefs.keys()).filter((name) => !explicitMoleculeTypes.has(name))
    ];

    const moleculeTypesXml = orderedMoleculeTypeNames
      .map((molName) => {
        const inferredCompMap = moleculeTypeDefs.get(molName) ?? new Map<string, Set<string>>();
        const explicitComponents = explicitMoleculeTypes.get(molName);

        if (explicitComponents && explicitComponents.length > 0) {
          const componentTypesXml = explicitComponents
            .map((compRaw) => {
              // Optimized string parsing: single loop is ~1.5x faster than .map().filter()
              const parts: string[] = [];
              const splitRaw = compRaw.split('~');
              for (let j = 0; j < splitRaw.length; j++) {
                const s = splitRaw[j].trim();
                if (s) parts.push(s);
              }
              const compName = parts[0];
              const states = new Set<string>(parts.slice(1));
              const inferredStates = inferredCompMap.get(compName);
              inferredStates?.forEach((s) => states.add(s));
              const allowedStatesXml = states.size > 0
                ? `\n            <ListOfAllowedStates>${Array.from(states).map((s) => `<AllowedState id="${escapeXml(s)}"/>`).join('')}</ListOfAllowedStates>`
                : '';
              return `\n          <ComponentType id="${escapeXml(compName)}">${allowedStatesXml}</ComponentType>`;
            })
            .join('');
          return `      <MoleculeType id="${escapeXml(molName)}">\n        <ListOfComponentTypes>${componentTypesXml}\n        </ListOfComponentTypes>\n      </MoleculeType>\n`;
        }

        if (inferredCompMap.size === 0) {
          return `      <MoleculeType id="${escapeXml(molName)}"/>\n`;
        }

        const componentTypesXml = Array.from(inferredCompMap.entries())
          .map(([compName, states]) => {
            const allowedStatesXml = states.size > 0
              ? `\n            <ListOfAllowedStates>${Array.from(states).map((s) => `<AllowedState id="${escapeXml(s)}"/>`).join('')}</ListOfAllowedStates>`
              : '';
            return `\n          <ComponentType id="${escapeXml(compName)}">${allowedStatesXml}</ComponentType>`;
          })
          .join('');
        return `      <MoleculeType id="${escapeXml(molName)}">\n        <ListOfComponentTypes>${componentTypesXml}\n        </ListOfComponentTypes>\n      </MoleculeType>\n`;
      })
      .join('');

    const compartmentsXml = compartments
      .map((c) => {
        const outsideAttr = c.parent ? ` outside="${escapeXml(c.parent)}"` : '';
        return `      <compartment id="${escapeXml(c.name)}" spatialDimensions="${escapeXml(String(c.dimension))}" size="${escapeXml(String(c.size))}"${outsideAttr}/>\n`;
      })
      .join('');

    const speciesXml = species
      .map((s, idx) => {
        const graph = BNGLParser.parseSpeciesGraph(s.name);
        const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `S${idx + 1}`, moleculeTypeDefs, false);
        const compAttr = graph.compartment ? ` compartment="${escapeXml(graph.compartment)}"` : '';
        const fixedAttr = s.isConstant ? ' Fixed="1"' : '';
        return `      <Species id="S${idx + 1}" concentration="${escapeXml(String(s.initialConcentration))}" name="${escapeXml(s.name)}"${compAttr}${fixedAttr}>\n        ${moleculesXml}\n        ${bondsXml}\n      </Species>\n`;
      })
      .join('');

    // Observable-dependent rate expressions are emitted as <Function> elements
    // so NFsim can resolve observable references at runtime via its function system.
    const synthesizedFunctions: { name: string; expression: string; args: string[] }[] = [];
    for (const p of synthesizedParameters) {
      if (observableDependentRates.has(p.id)) {
        const expandedExpr = expandUserDefinedFunctions(p.expression, model.functions || []);
        synthesizedFunctions.push({ name: p.id, expression: expandedExpr, args: [] });
      }
    }

    const reactionRulesXml = reactions
      .flatMap((r, idx) => {
        const baseId = `RR${idx + 1}`;
        const baseName = r.name ?? baseId;
        const variants: Array<{ id: string; name: string; reactants: string[]; products: string[]; rate?: number | string }> = [];

        if (r.isBidirectional && r.reverseRate !== undefined) {
          variants.push({
            id: baseId,
            name: baseName,
            reactants: r.reactants || [],
            products: r.products || [],
            rate: r.rate
          });
          variants.push({
            id: `${baseId}_rev`,
            name: `${baseName}_rev`,
            reactants: r.products || [],
            products: r.reactants || [],
            rate: r.reverseRate
          });
        } else {
          variants.push({
            id: baseId,
            name: baseName,
            reactants: r.reactants || [],
            products: r.products || [],
            rate: r.rate
          });
        }

        return variants.map((variant) => {
          const ruleId = variant.id;
          const ruleName = escapeXml(variant.name);
          const reactantPatternData = (variant.reactants || []).map((pattern, rpIdx) => {
            const graph = BNGLParser.parseSpeciesGraph(pattern);
            const data = this.serializeMolecules(graph, `${ruleId}_RP${rpIdx + 1}`, moleculeTypeDefs, true);
            return {
              graph,
              prefix: `${ruleId}_RP${rpIdx + 1}`,
              ...data
            };
          });
          const rawProductGraphs = (variant.products || []).map((pattern) => BNGLParser.parseSpeciesGraph(pattern));

          const productPatternData = rawProductGraphs.map((graph, ppIdx) => {
            const data = this.serializeMolecules(graph, `${ruleId}_PP${ppIdx + 1}`, moleculeTypeDefs, true);
            return {
              graph,
              prefix: `${ruleId}_PP${ppIdx + 1}`,
              ...data
            };
          });

          const reactantPatterns = reactantPatternData
            .map((p) => {
              const compAttr = p.graph.compartment ? ` compartment="${escapeXml(p.graph.compartment)}"` : '';
              return `\n          <ReactantPattern id="${p.prefix}"${compAttr}>${p.moleculesXml}${p.bondsXml}</ReactantPattern>`;
            })
            .join('');
          const productPatterns = productPatternData
            .map((p) => {
              const compAttr = p.graph.compartment ? ` compartment="${escapeXml(p.graph.compartment)}"` : '';
              return `\n          <ProductPattern id="${p.prefix}"${compAttr}>${p.moleculesXml}${p.bondsXml}</ProductPattern>`;
            })
            .join('');

          const totalrate = r.totalRate ? '1' : '0';

          const rateValue = variant.rate !== undefined ? String(variant.rate) : '0';
          let finalRateValue = rateValue;

          // NFsim/BioNetGen XML parity: Complex expressions in rate must be exported as parameters
          const isComplex = rateValue.length > 0 &&
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rateValue) &&
            !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(rateValue);

          if (isComplex) {
            finalRateValue = `_func_rate_${variant.id}`;
          }

          // If this rate references observables, use Function rate law type so
          // NFsim resolves observable values at runtime via its function system.
          const rateLawType = observableDependentRates.has(finalRateValue) ? 'Function' : 'Ele';

          const { mapXml, operationsXml } = this.buildRuleOperations(reactantPatternData, productPatternData, {
            deleteMolecules: Boolean(r.deleteMolecules),
            moveConnected: Boolean(r.moveConnected)
          });

          let rateLawXml: string;
          if (rateLawType === 'Function') {
            rateLawXml = `\n      <RateLaw id="${ruleId}_RateLaw" type="Function" name="${finalRateValue}" totalrate="${totalrate}">\n        <ListOfRateConstants>\n          <RateConstant value="${finalRateValue}"/>\n        </ListOfRateConstants>\n      </RateLaw>`;
          } else {
            rateLawXml = `\n      <RateLaw id="${ruleId}_RateLaw" type="${rateLawType}" totalrate="${totalrate}">\n        <ListOfRateConstants>\n          <RateConstant value="${finalRateValue}"/>\n        </ListOfRateConstants>\n      </RateLaw>`;
          }

          // operationsXml from buildRuleOperations already includes the <ListOfOperations> wrapper — use it directly
          const opsTag = operationsXml;

          return `\n    <ReactionRule id="${ruleId}" name="${ruleName}" symmetry_factor="1">\n` +
            `      <ListOfReactantPatterns>${reactantPatterns}\n      </ListOfReactantPatterns>\n` +
            `      <ListOfProductPatterns>${productPatterns}\n      </ListOfProductPatterns>${mapXml}${rateLawXml}${opsTag}\n    </ReactionRule>`;
        });
      })
      .join('');

    const observablesXml = observables
      .map((obs, idx) => {
        const patterns = this.splitPatternList(obs.pattern || '');
        const obsType = normalizeObservableType(obs.type);
        const patternsXml = patterns
          .map((pattern, pIdx) => {
            // NFsim specific: Stoichiometric constraints (relation/quantity)
            // Note: NFsim only supports these for 'Species' type observables.
            let constraintAttrs = '';
            if (obsType === 'Species') {
              // Try to extract from pattern string first (precedence)
              const parsedConstraint = parseObservableConstraint(pattern);
              let cleanPattern = pattern;
              if (parsedConstraint.relation && parsedConstraint.quantity) {
                cleanPattern = parsedConstraint.cleanPattern;
                constraintAttrs = ` relation="${escapeXml(parsedConstraint.relation)}" quantity="${parsedConstraint.quantity}"`;
              } else if (obs.countFilter !== undefined) {
                // Fallback to observable-level filter if present
                const rel = obs.countRelation || '>';
                constraintAttrs = ` relation="${escapeXml(rel)}" quantity="${obs.countFilter}"`;
              }
              const graph = BNGLParser.parseSpeciesGraph(cleanPattern);
              const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `O${idx + 1}_P${pIdx + 1}`, moleculeTypeDefs, true);
              return `          <Pattern id="O${idx + 1}_P${pIdx + 1}"${constraintAttrs}>${moleculesXml}${bondsXml}</Pattern>`;
            } else {
              const graph = BNGLParser.parseSpeciesGraph(pattern);
              const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `O${idx + 1}_P${pIdx + 1}`, moleculeTypeDefs, true);
              return `          <Pattern id="O${idx + 1}_P${pIdx + 1}">${moleculesXml}${bondsXml}</Pattern>`;
            }
          })
          .join('\n');
        return `      <Observable id="O${idx + 1}" name="${escapeXml(obs.name)}" type="${escapeXml(obsType)}">\n` +
          `        <ListOfPatterns>\n${patternsXml}\n` +
          `        </ListOfPatterns>\n` +
          `      </Observable>\n`;
      })
      .join('');

    const parameterNames = new Set(Object.keys(model.parameters || {}));
    const observableNames = new Set(model.observables.map(o => o.name));
    const allBNGLFunctions = model.functions || [];
    const functionNames = new Set([...allBNGLFunctions.map(f => f.name), ...synthesizedFunctions.map(f => f.name)]);

    const allFunctions = [...allBNGLFunctions, ...synthesizedFunctions];

    const functionsXml = allFunctions
      .map((f) => {
        const argsXml = (f.args || [])
          .map(arg => `<Argument id="${escapeXml(arg)}"/>`)
          .join('');
        
        // Basic reference detection (very simple regex approach)
        const refs: { name: string, type: string }[] = [];
        // Extract all word-like tokens from expression
        const tokens = f.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
        const uniqueTokens = new Set(tokens);
        
        uniqueTokens.forEach(token => {
          if (parameterNames.has(token)) {
            refs.push({ name: token, type: 'Constant' });
          } else if (observableNames.has(token)) {
            refs.push({ name: token, type: 'Observable' });
          } else if (functionNames.has(token) && token !== f.name) {
            refs.push({ name: token, type: 'Function' });
          }
        });

        const refsXml = refs
          .map(ref => `<Reference name="${escapeXml(ref.name)}" type="${escapeXml(ref.type)}"/>`)
          .join('');

        return `      <Function id="${escapeXml(f.name)}">` +
          (argsXml ? `<ListOfArguments>${argsXml}</ListOfArguments>` : '') +
          `<Expression>${escapeXml(f.expression)}</Expression>` +
          (refsXml ? `<ListOfReferences>${refsXml}</ListOfReferences>` : '') +
          `</Function>\n`;
      })
      .join('');

    const energyPatternsXml = this.writeEnergyPatterns(model, moleculeTypeDefs);

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">\n` +
      `  <model id="${modelId}">\n` +
      `    <ListOfParameters>\n${parametersXml}    </ListOfParameters>\n` +
      `    <ListOfMoleculeTypes>\n${moleculeTypesXml}    </ListOfMoleculeTypes>\n` +
      `    <ListOfCompartments>\n${compartmentsXml}    </ListOfCompartments>\n` +
      `    <ListOfSpecies>\n${speciesXml}    </ListOfSpecies>\n` +
      `    <ListOfReactionRules>\n${reactionRulesXml}    </ListOfReactionRules>\n` +
      `    <ListOfObservables>\n${observablesXml}    </ListOfObservables>\n` +
      `    <ListOfFunctions>\n${functionsXml}    </ListOfFunctions>\n` +
      energyPatternsXml +
      `  </model>\n` +
      `</sbml>`;
  }

  static validate(model: BNGLModel): BNGXMLValidationResult {
    const errors: BNGXMLValidationIssue[] = [];
    const warnings: BNGXMLValidationIssue[] = [];

    if ((!model.moleculeTypes || model.moleculeTypes.length === 0) && (!model.species || model.species.length === 0)) {
      errors.push({ message: 'Model has no molecule types or species; XML cannot be generated.' });
    }

    if (!model.species || model.species.length === 0) {
      warnings.push({ message: 'Model has no species; XML may be incomplete.' });
    }

    if (!model.observables || model.observables.length === 0) {
      warnings.push({ message: 'Model has no observables.' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private static writeEnergyPatterns(
    model: BNGLModel,
    moleculeTypeDefs: Map<string, Map<string, Set<string>>>
  ): string {
    const energyPatterns = model.energyPatterns || [];
    if (energyPatterns.length === 0) return '';

    const items = energyPatterns
      .map((ep, idx) => {
        const epId = `EP${idx + 1}`;
        const patternId = `${epId}_P1`;
        const graph = BNGLParser.parseSpeciesGraph(ep.pattern);
        const { moleculesXml, bondsXml } = this.serializeMolecules(graph, patternId, moleculeTypeDefs, true);

        return `      <EnergyPattern id="${epId}" expression="${escapeXml(ep.expression)}">\n` +
          `        <Pattern id="${patternId}">\n` +
          `          ${moleculesXml}\n` +
          `          ${bondsXml}\n` +
          `        </Pattern>\n` +
          `      </EnergyPattern>\n`;
      })
      .join('');

    return `    <ListOfEnergyPatterns>\n${items}    </ListOfEnergyPatterns>\n`;
  }

  private static inferMoleculeTypes(model: BNGLModel): Map<string, Map<string, Set<string>>> {
    const defs = new Map<string, Map<string, Set<string>>>();

    const ensureComponent = (molName: string, compName: string): Set<string> => {
      if (!defs.has(molName)) defs.set(molName, new Map());
      const compMap = defs.get(molName)!;
      if (!compMap.has(compName)) compMap.set(compName, new Set());
      return compMap.get(compName)!;
    };

    const addStatesFromComponentString = (molName: string, comp: string) => {
      // Optimized string parsing: single loop is ~1.5x faster than .map().filter()
      const parts: string[] = [];
      const splitComp = comp.split('~');
      for (let j = 0; j < splitComp.length; j++) {
        const s = splitComp[j].trim();
        if (s) parts.push(s);
      }
      if (parts.length === 0) return;
      const compName = parts[0];
      const stateSet = ensureComponent(molName, compName);
      for (const state of parts.slice(1)) stateSet.add(state);
    };

    for (const mt of model.moleculeTypes || []) {
      for (const comp of mt.components || []) {
        addStatesFromComponentString(mt.name, comp);
      }
    }

    const collectFromGraph = (graph: SpeciesGraph) => {
      graph.molecules.forEach((mol) => {
        // Only if name is a simple identifier (not complex BNGL)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(mol.name)) return;

        mol.components.forEach((comp) => {
          const stateSet = ensureComponent(mol.name, comp.name);
          if (comp.state) stateSet.add(comp.state);
        });
        if (mol.components.length === 0 && !defs.has(mol.name)) {
          defs.set(mol.name, new Map());
        }
      });
    };

    for (const sp of model.species || []) {
      collectFromGraph(BNGLParser.parseSpeciesGraph(sp.name));
    }
    for (const rule of model.reactionRules || []) {
      (rule.reactants || []).forEach((pat) => collectFromGraph(BNGLParser.parseSpeciesGraph(pat)));
      (rule.products || []).forEach((pat) => collectFromGraph(BNGLParser.parseSpeciesGraph(pat)));
    }
    for (const obs of model.observables || []) {
      if (obs.pattern) {
        const patterns = this.splitPatternList(obs.pattern);
        patterns.forEach((p) => collectFromGraph(BNGLParser.parseSpeciesGraph(p)));
      }
    }

    return defs;
  }

  private static serializeMolecules(
    graph: SpeciesGraph,
    prefix: string,
    _moleculeTypeDefs: Map<string, Map<string, Set<string>>>,
    isPattern: boolean
  ): {
    moleculesXml: string;
    bondsXml: string;
    moleculeIdMap: Map<number, string>;
    componentIdMap: Map<string, string>;
  } {
    const componentIdMap = new Map<string, string>();
    const moleculeIdMap = new Map<number, string>();

    const moleculesXml = graph.molecules
      .map((mol, molIdx) => {
        // NOTE: populate moleculeIdMap BEFORE component loop
        const moleculeId = `${prefix}_M${molIdx + 1}`;
        moleculeIdMap.set(molIdx, moleculeId);

        const components = (isPattern
          ? mol.components
            .map((comp, sourceCompIdx) => ({ comp, sourceCompIdx }))
            .filter(({ comp }) => !(comp as any).syntheticWildcard)
          : mol.components.map((comp, sourceCompIdx) => ({ comp, sourceCompIdx })));

        const componentsXml = components
          .map(({ comp, sourceCompIdx }, localCompIdx) => {
            const componentId = `${prefix}_M${molIdx + 1}_C${localCompIdx + 1}`;
            componentIdMap.set(`${molIdx}.${sourceCompIdx}`, componentId);

            const numberOfBonds = this.getNumberOfBonds(comp, isPattern);
            const attrs = [
              `id="${componentId}"`,
              `name="${escapeXml(comp.name)}"`
            ];
            if (numberOfBonds !== '?') {
              attrs.push(`numberOfBonds="${numberOfBonds}"`);
            } else if (!isPattern) {
              attrs.push(`numberOfBonds="0"`);
            }
            if (comp.state) attrs.push(`state="${escapeXml(comp.state)}"`);

            return `<Component ${attrs.join(' ')} />`;
          })
          .join('');

        const labelAttr = mol.label ? ` label="${escapeXml(mol.label)}"` : '';
        const compAttr = mol.compartment ? ` compartment="${escapeXml(mol.compartment)}"` : '';

        const innerXml = componentsXml
          ? `<ListOfComponents>${componentsXml}</ListOfComponents>`
          : '<ListOfComponents/>';

        return `<Molecule id="${moleculeId}" name="${escapeXml(mol.name)}"${labelAttr}${compAttr}>${innerXml}</Molecule>`;
      })
      .join('');

    const bondsXml = this.serializeBonds(graph, prefix, componentIdMap);

    return {
      moleculesXml: `<ListOfMolecules>${moleculesXml}</ListOfMolecules>`,
      bondsXml,
      moleculeIdMap,
      componentIdMap
    };
  }

  private static buildRuleOperations(
    reactantPatterns: Array<{
      graph: SpeciesGraph;
      prefix: string;
      moleculeIdMap: Map<number, string>;
      componentIdMap: Map<string, string>;
    }>,
    productPatterns: Array<{
      graph: SpeciesGraph;
      prefix: string;
      moleculeIdMap: Map<number, string>;
      componentIdMap: Map<string, string>;
    }>,
    options: { deleteMolecules?: boolean; moveConnected?: boolean } = {}
  ): { mapXml: string; operationsXml: string } {
    type MolRef = {
      patternIdx: number;
      molIdx: number;
      name: string;
      componentNames: string[];
      moleculeId: string;
      label?: string;
    };

    const flattenPatterns = (patterns: typeof reactantPatterns): MolRef[] => {
      const refs: MolRef[] = [];
      patterns.forEach((pattern, patternIdx) => {
        pattern.graph.molecules.forEach((mol, molIdx) => {
          const moleculeId = pattern.moleculeIdMap.get(molIdx) ?? `${pattern.prefix}_M${molIdx + 1}`;
          refs.push({
            patternIdx,
            molIdx,
            name: mol.name,
            componentNames: mol.components.map((c) => c.name).sort(),
            moleculeId,
            label: mol.label
          });
        });
      });
      return refs;
    };

    const reactantRefs = flattenPatterns(reactantPatterns);
    const productRefs = flattenPatterns(productPatterns);

    const reactantUsed = new Set<number>();
    const productToReactant = new Map<string, MolRef>();
    const reactantToProduct = new Map<string, MolRef>();
    const moleculeComponentIndexMaps = new Map<
      string,
      { reactToProd: Map<number, number>; prodToReact: Map<number, number> }
    >();

    // Precompute a map of reactant indices to optimize product-to-reactant matching from O(N^2) to O(N).
    // Uses shift() to pop indices matching the same signature.
    const precomputedReactants = new Map<string, number[]>();
    reactantRefs.forEach((reactRef, rIdx) => {
      const key = reactRef.label
        ? `lbl|${reactRef.name}|${reactRef.label}`
        : `heur|${reactRef.name}|${reactRef.componentNames.join(',')}`;

      const list = precomputedReactants.get(key);
      if (list) list.push(rIdx);
      else precomputedReactants.set(key, [rIdx]);
    });

    productRefs.forEach((prodRef) => {
      const key = prodRef.label
        ? `lbl|${prodRef.name}|${prodRef.label}`
        : `heur|${prodRef.name}|${prodRef.componentNames.join(',')}`;

      const list = precomputedReactants.get(key);
      if (list && list.length > 0) {
        const matchIdx = list.shift()!;
        const reactRef = reactantRefs[matchIdx];
        reactantUsed.add(matchIdx);
        productToReactant.set(`${prodRef.patternIdx}.${prodRef.molIdx}`, reactRef);
        reactantToProduct.set(`${reactRef.patternIdx}.${reactRef.molIdx}`, prodRef);
      }
    });

    reactantPatterns.forEach((reactPattern, reactPatternIdx) => {
      reactPattern.graph.molecules.forEach((reactMol, reactMolIdx) => {
        const prodRef = reactantToProduct.get(`${reactPatternIdx}.${reactMolIdx}`);
        if (!prodRef) return;
        const prodPattern = productPatterns[prodRef.patternIdx];
        const prodMol = prodPattern?.graph.molecules[prodRef.molIdx];
        if (!prodMol) return;

        const productCompQueuesByName = new Map<string, number[]>();
        prodMol.components.forEach((comp, prodCompIdx) => {
          const queue = productCompQueuesByName.get(comp.name);
          if (queue) queue.push(prodCompIdx);
          else productCompQueuesByName.set(comp.name, [prodCompIdx]);
        });

        const reactToProd = new Map<number, number>();
        const prodToReact = new Map<number, number>();
        reactMol.components.forEach((comp, reactCompIdx) => {
          const queue = productCompQueuesByName.get(comp.name);
          if (queue && queue.length > 0) {
            const prodCompIdx = queue.shift()!;
            reactToProd.set(reactCompIdx, prodCompIdx);
            prodToReact.set(prodCompIdx, reactCompIdx);
          }
        });

        moleculeComponentIndexMaps.set(`${reactPatternIdx}.${reactMolIdx}`, {
          reactToProd,
          prodToReact
        });
      });
    });

    const mapItems: string[] = [];

    const addComponentMapItems = (
      reactantPattern: (typeof reactantPatterns)[number],
      reactantPatternIdx: number,
      productPattern: (typeof productPatterns)[number] | null,
      reactMolIdx: number,
      productMolIdx?: number
    ) => {
      const reactMol = reactantPattern.graph.molecules[reactMolIdx];
      const prodMol = productPattern?.graph.molecules[productMolIdx ?? -1];
      reactMol?.components.forEach((comp, compIdx) => {
        const sourceId = reactantPattern.componentIdMap.get(`${reactMolIdx}.${compIdx}`);
        if (!sourceId) return;
        if (prodMol) {
          const compIndexMap = moleculeComponentIndexMaps
            .get(`${reactantPatternIdx}.${reactMolIdx}`)
            ?.reactToProd;
          const prodCompIdx = compIndexMap?.get(compIdx) ?? prodMol.components.findIndex((c) => c.name === comp.name);
          if (prodCompIdx >= 0) {
            const targetId = productPattern?.componentIdMap.get(`${productMolIdx}.${prodCompIdx}`);
            if (targetId) {
              mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${targetId}"/>`);
              return;
            }
          }
        }
        // If no product equivalent, map to self as placeholder (prevents missing sourceID errors)
        mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${sourceId}"/>`);
      });
    };

    reactantPatterns.forEach((pattern, patternIdx) => {
      pattern.graph.molecules.forEach((_, molIdx) => {
        const prodRef = reactantToProduct.get(`${patternIdx}.${molIdx}`);
        const sourceId = pattern.moleculeIdMap.get(molIdx);
        if (!sourceId) return;

        if (prodRef) {
          const prodPattern = productPatterns[prodRef.patternIdx];
          const targetId = prodPattern?.moleculeIdMap.get(prodRef.molIdx);
          if (targetId) {
            mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${targetId}"/>`);
            addComponentMapItems(pattern, patternIdx, prodPattern, molIdx, prodRef.molIdx);
          }
        } else {
          // Molecule is deleted/consumed. NFsim requires a complete <Map> where every
          // source item is accounted for. Map to self as a placeholder.
          mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${sourceId}"/>`);
          addComponentMapItems(pattern, patternIdx, null, molIdx);
        }
      });
    });

    const operations: string[] = [];

    const hasAnyMapping = reactantToProduct.size > 0;

    const reactantBondKeys = new Set<string>();
    const reactantBondLookup = new Map<string, { site1: string; site2: string }>();

    const addReactantBond = (
      patternIdx: number,
      molIdx1: number,
      compIdx1: number,
      molIdx2: number,
      compIdx2: number
    ) => {
      const pattern = reactantPatterns[patternIdx];
      const site1 = pattern.componentIdMap.get(`${molIdx1}.${compIdx1}`);
      const site2 = pattern.componentIdMap.get(`${molIdx2}.${compIdx2}`);
      if (!site1 || !site2) return;
      const key = [site1, site2].sort().join('|');
      reactantBondKeys.add(key);
      reactantBondLookup.set(key, { site1, site2 });
    };

    if (hasAnyMapping) {
      reactantPatterns.forEach((pattern, patternIdx) => {
        pattern.graph.molecules.forEach((mol, molIdx) => {
          for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
            const compPartners = pattern.graph.adjacency.get(`${molIdx}.${compIdx}`);
            if (!compPartners) continue;
            compPartners.forEach((partnerKey) => {
              const [pMolStr, pCompStr] = partnerKey.split('.');
              const pMolIdx = Number(pMolStr);
              const pCompIdx = Number(pCompStr);
              if (!Number.isFinite(pMolIdx) || !Number.isFinite(pCompIdx)) return;
              if (pMolIdx < molIdx || (pMolIdx === molIdx && pCompIdx < compIdx)) return;
              addReactantBond(patternIdx, molIdx, compIdx, pMolIdx, pCompIdx);
            });
          }
        });
      });
    }

    const mappedProductBondKeys = new Set<string>();

    if (hasAnyMapping) {
      productPatterns.forEach((pattern, patternIdx) => {
        pattern.graph.molecules.forEach((mol, molIdx) => {
          for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
            const compPartners = pattern.graph.adjacency.get(`${molIdx}.${compIdx}`);
            if (!compPartners) continue;
            compPartners.forEach((partnerKey) => {
              const [pMolStr, pCompStr] = partnerKey.split('.');
              const pMolIdx = Number(pMolStr);
              const pCompIdx = Number(pCompStr);
              if (!Number.isFinite(pMolIdx) || !Number.isFinite(pCompIdx)) return;
              if (pMolIdx < molIdx || (pMolIdx === molIdx && pCompIdx < compIdx)) return;

              const reactA = productToReactant.get(`${patternIdx}.${molIdx}`);
              const reactB = productToReactant.get(`${patternIdx}.${pMolIdx}`);
              if (!reactA || !reactB) return;

              const reactPatternA = reactantPatterns[reactA.patternIdx];
              const reactPatternB = reactantPatterns[reactB.patternIdx];
              const reactCompMapA = moleculeComponentIndexMaps.get(`${reactA.patternIdx}.${reactA.molIdx}`)?.prodToReact;
              const reactCompMapB = moleculeComponentIndexMaps.get(`${reactB.patternIdx}.${reactB.molIdx}`)?.prodToReact;
              const reactCompIdxA = reactCompMapA?.get(compIdx);
              const reactCompIdxB = reactCompMapB?.get(pCompIdx);
              if (reactCompIdxA === undefined || reactCompIdxB === undefined) return;

              const site1 = reactPatternA.componentIdMap.get(`${reactA.molIdx}.${reactCompIdxA}`);
              const site2 = reactPatternB.componentIdMap.get(`${reactB.molIdx}.${reactCompIdxB}`);
              if (!site1 || !site2) return;
              const key = [site1, site2].sort().join('|');
              mappedProductBondKeys.add(key);
            });
          }
        });
      });
    }

    if (hasAnyMapping) {
      for (const key of reactantBondKeys) {
        if (!mappedProductBondKeys.has(key)) {
          const bond = reactantBondLookup.get(key);
          if (bond) {
            operations.push(`<DeleteBond site1="${bond.site1}" site2="${bond.site2}"/>`);
          }
        }
      }

      for (const key of mappedProductBondKeys) {
        if (!reactantBondKeys.has(key)) {
          const [site1, site2] = key.split('|');
          operations.push(`<AddBond site1="${site1}" site2="${site2}"/>`);
        }
      }
    }

    if (hasAnyMapping) {
      reactantPatterns.forEach((pattern, patternIdx) => {
        pattern.graph.molecules.forEach((mol, molIdx) => {
          const prodRef = reactantToProduct.get(`${patternIdx}.${molIdx}`);
          if (!prodRef) return;
          const prodPattern = productPatterns[prodRef.patternIdx];
          const prodMol = prodPattern?.graph.molecules[prodRef.molIdx];
          if (!prodMol) return;
          const compIndexMap = moleculeComponentIndexMaps.get(`${patternIdx}.${molIdx}`)?.reactToProd;
          mol.components.forEach((comp, compIdx) => {
            const prodCompIdx = compIndexMap?.get(compIdx);
            if (prodCompIdx === undefined) return;
            const prodComp = prodMol.components[prodCompIdx];
            if (!prodComp) return;
            const reactState = comp.state ?? '';
            const prodState = prodComp.state ?? '';
            if (reactState !== prodState && prodState) {
              const site = pattern.componentIdMap.get(`${molIdx}.${compIdx}`);
              if (site) {
                operations.push(`<StateChange site="${site}" finalState="${escapeXml(prodState)}"/>`);
              }
            }
          });
        });
      });
    }

    // Detect compartment changes
    if (hasAnyMapping) {
      reactantPatterns.forEach((pattern, patternIdx) => {
        pattern.graph.molecules.forEach((mol, molIdx) => {
          const prodRef = reactantToProduct.get(`${patternIdx}.${molIdx}`);
          if (!prodRef) return;
          const prodPattern = productPatterns[prodRef.patternIdx];
          const prodMol = prodPattern?.graph.molecules[prodRef.molIdx];
          if (!prodMol) return;

          const reactCompartment = mol.compartment || pattern.graph.compartment || '';
          const prodCompartment = prodMol.compartment || prodPattern.graph.compartment || '';

          if (reactCompartment !== prodCompartment && prodCompartment) {
            const molId = pattern.moleculeIdMap.get(molIdx);
            if (molId) {
              const moveConnectedAttr = options.moveConnected ? ' moveConnected="1"' : '';
              operations.push(`<ChangeCompartment id="${molId}" destination="${escapeXml(prodCompartment)}"${moveConnectedAttr}/>`);
            }
          }
        });
      });
    }

    productPatterns.forEach((pattern, patternIdx) => {
      pattern.graph.molecules.forEach((_, molIdx) => {
        if (!productToReactant.has(`${patternIdx}.${molIdx}`)) {
          const molId = pattern.moleculeIdMap.get(molIdx);
          if (molId) {
            operations.push(`<Add id="${molId}"/>`);
          }
        }
      });
    });

    const deleteMoleculesFlag = options.deleteMolecules ? '1' : '0';

    reactantPatterns.forEach((pattern, patternIdx) => {
      const hasMappedMolecule = pattern.graph.molecules.some((_, molIdx) =>
        reactantToProduct.has(`${patternIdx}.${molIdx}`)
      );

      if (!hasMappedMolecule) {
        operations.push(`<Delete id="${pattern.prefix}" DeleteMolecules="${deleteMoleculesFlag}"/>`);
        return;
      }

      pattern.graph.molecules.forEach((_, molIdx) => {
        if (!reactantToProduct.has(`${patternIdx}.${molIdx}`)) {
          const molId = pattern.moleculeIdMap.get(molIdx);
          if (molId) {
            operations.push(`<Delete id="${molId}" DeleteMolecules="${deleteMoleculesFlag}"/>`);
          }
        }
      });
    });

    const mapXml = mapItems.length > 0 ? `\n      <Map>\n        ${mapItems.join('\n        ')}\n      </Map>` : '';
    const operationsXml = operations.length > 0 ? `\n      <ListOfOperations>\n        ${operations.join('\n        ')}\n      </ListOfOperations>` : '';

    return { mapXml, operationsXml };
  }

  private static getNumberOfBonds(
    comp: { name: string; edges: Map<number, number>; wildcard?: string },
    isPattern: boolean
  ): string {
    if (comp.edges.size > 0) return String(comp.edges.size);
    if (comp.wildcard === '+') return '+';
    // For wildcard '?' patterns, omit numberOfBonds (caller skips '?').
    if (isPattern && comp.wildcard === '?') return '?';
    // Otherwise emit explicit zero, matching BNG2 XML conventions.
    return '0';
  }

  private static serializeBonds(
    graph: SpeciesGraph,
    prefix: string,
    componentIdMap: Map<string, string>
  ): string {
    const bonds: { id: string; site1: string; site2: string }[] = [];
    const seen = new Set<string>();

    graph.molecules.forEach((mol, molIdx) => {
      mol.components.forEach((comp, compIdx) => {
        const partners = graph.adjacency.get(`${molIdx}.${compIdx}`) || [];
        comp.edges.forEach((_targetCompIdx, label) => {
          const partner = partners
            .map((partnerKey) => {
              const [pMolStr, pCompStr] = partnerKey.split('.');
              return { molIdx: Number(pMolStr), compIdx: Number(pCompStr) };
            })
            .find(({ molIdx: pMol, compIdx: pComp }) => {
              const partnerComp = graph.molecules[pMol]?.components[pComp];
              return Boolean(partnerComp?.edges.has(label));
            });

          if (!partner) return;

          const site1 = componentIdMap.get(`${molIdx}.${compIdx}`);
          const site2 = componentIdMap.get(`${partner.molIdx}.${partner.compIdx}`);
          if (!site1 || !site2) return;

          const key = `${label}:${[site1, site2].sort().join('|')}`;
          if (seen.has(key)) return;
          seen.add(key);

          bonds.push({
            id: `${prefix}_B${bonds.length + 1}`,
            site1,
            site2
          });
        });
      });
    });

    if (bonds.length === 0) return '';
    return `<ListOfBonds>${bonds.map((bond) => `<Bond id="${bond.id}" site1="${bond.site1}" site2="${bond.site2}"/>`).join('')}</ListOfBonds>`;
  }

  private static splitPatternList(value: string): string[] {
    const input = value.trim();
    if (!input) return [];
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (char === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }
}
