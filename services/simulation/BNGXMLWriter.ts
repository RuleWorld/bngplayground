import type { BNGLModel } from '../../types';
import { BNGLParser } from '../../src/services/graph/core/BNGLParser';
import type { SpeciesGraph } from '../../src/services/graph/core/SpeciesGraph';

export interface BNGXMLValidationIssue {
  message: string;
}

export interface BNGXMLValidationResult {
  valid: boolean;
  errors: BNGXMLValidationIssue[];
  warnings: BNGXMLValidationIssue[];
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeObservableType = (value?: string): string => {
  const raw = String(value ?? 'Molecules');
  const lower = raw.toLowerCase();
  if (lower === 'molecules') return 'Molecules';
  if (lower === 'species') return 'Species';
  return raw;
};

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
      .map(p => {
        const val = BNGLParser.evaluateExpression(p.expression, evalParams);
        const valStr = isNaN(val) ? p.expression : String(val);
        return `      <Parameter id="${escapeXml(p.id)}" type="Constant" value="${escapeXml(valStr)}" expr="${escapeXml(p.expression)}"/>\n`;
      })
      .join('');

    const moleculeTypesXml = Array.from(moleculeTypeDefs.entries())
      .map(([molName, compMap]) => {
        if (compMap.size === 0) {
          return `      <MoleculeType id="${escapeXml(molName)}"/>\n`;
        }
        const componentTypesXml = Array.from(compMap.entries())
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
      .map((c) => `      <Compartment id="${escapeXml(c.name)}" size="${escapeXml(String(c.size))}" dimension="${escapeXml(String(c.dimension))}"/>\n`)
      .join('');

    const speciesXml = species
      .map((s, idx) => {
        const graph = BNGLParser.parseSpeciesGraph(s.name);
        const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `S${idx + 1}`, moleculeTypeDefs, false);
        const compAttr = graph.compartment ? ` compartment="${escapeXml(graph.compartment)}"` : '';
        return `      <Species id="S${idx + 1}" concentration="${escapeXml(String(s.initialConcentration))}" name="${escapeXml(s.name)}"${compAttr}>\n        ${moleculesXml}\n        ${bondsXml}\n      </Species>\n`;
      })
      .join('');

    const synthesizedFunctions: { name: string; expression: string; args: string[] }[] = [];

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

          const rateLawType = 'Ele';
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

          const { mapXml, operationsXml } = this.buildRuleOperations(reactantPatternData, productPatternData, {
            deleteMolecules: Boolean(r.deleteMolecules)
          });

          return `\n    <ReactionRule id="${ruleId}" name="${ruleName}" symmetry_factor="1">\n` +
            `      <ListOfReactantPatterns>${reactantPatterns}\n      </ListOfReactantPatterns>\n` +
            `      <ListOfProductPatterns>${productPatterns}\n      </ListOfProductPatterns>\n` +
            `      <RateLaw id="${ruleId}_RateLaw" type="${rateLawType}" totalrate="${totalrate}">\n` +
            `        <ListOfRateConstants>\n            <RateConstant value="${escapeXml(finalRateValue)}"/>\n        </ListOfRateConstants>\n` +
            `      </RateLaw>\n` +
            `      ${mapXml}${operationsXml}\n` +
            `    </ReactionRule>\n`;
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
              const m = pattern.match(/^(.*?)\s*(==|<=|>=|<|>|!=)\s*(\d+)\s*$/);
              let cleanPattern = pattern;
              if (m) {
                cleanPattern = m[1];
                constraintAttrs = ` relation="${escapeXml(m[2])}" quantity="${m[3]}"`;
              } else if (obs.countFilter !== undefined) {
                // Fallback to observable-level filter if present
                const rel = obs.countRelation || '>';
                constraintAttrs = ` relation="${escapeXml(rel)}" quantity="${obs.countFilter}"`;
              }
              const graph = BNGLParser.parseSpeciesGraph(cleanPattern);
              const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `O${idx + 1}_P${pIdx + 1}`, moleculeTypeDefs, true);
              return `<Pattern id="O${idx + 1}_P${pIdx + 1}"${constraintAttrs}>${moleculesXml}${bondsXml}</Pattern>`;
            } else {
              const graph = BNGLParser.parseSpeciesGraph(pattern);
              const { moleculesXml, bondsXml } = this.serializeMolecules(graph, `O${idx + 1}_P${pIdx + 1}`, moleculeTypeDefs, true);
              return `<Pattern id="O${idx + 1}_P${pIdx + 1}">${moleculesXml}${bondsXml}</Pattern>`;
            }
          })
          .join('');
        return `<Observable id="O${idx + 1}" name="${escapeXml(obs.name)}" type="${escapeXml(obsType)}">` +
          `<ListOfPatterns>${patternsXml}</ListOfPatterns>` +
          `</Observable>`;
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

  private static inferMoleculeTypes(model: BNGLModel): Map<string, Map<string, Set<string>>> {
    const defs = new Map<string, Map<string, Set<string>>>();

    const ensureComponent = (molName: string, compName: string): Set<string> => {
      if (!defs.has(molName)) defs.set(molName, new Map());
      const compMap = defs.get(molName)!;
      if (!compMap.has(compName)) compMap.set(compName, new Set());
      return compMap.get(compName)!;
    };

    const addStatesFromComponentString = (molName: string, comp: string) => {
      const parts = comp.split('~').map((s) => s.trim()).filter(Boolean);
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
        const components = mol.components;

        const moleculeId = `${prefix}_M${molIdx + 1}`;
        moleculeIdMap.set(molIdx, moleculeId);

        const componentsXml = components
          .map((comp, compIdx) => {
            const numberOfBonds = this.getNumberOfBonds(comp, isPattern);
            const attrs = [
              `id="${prefix}_M${molIdx + 1}_C${compIdx + 1}"`,
              `name="${escapeXml(comp.name)}"`,
              `numberOfBonds="${numberOfBonds}"`
            ];
            if (comp.state) attrs.push(`state="${escapeXml(comp.state)}"`);

            componentIdMap.set(`${molIdx}.${compIdx}`, `${prefix}_M${molIdx + 1}_C${compIdx + 1}`);
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
    options: { deleteMolecules?: boolean } = {}
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

    const signature = (ref: MolRef) => `${ref.name}|${ref.componentNames.join(',')}`;

    productRefs.forEach((prodRef) => {
      const matchIdx = prodRef.label
        ? reactantRefs.findIndex((reactRef, rIdx) => {
          if (reactantUsed.has(rIdx)) return false;
          return reactRef.name === prodRef.name && reactRef.label === prodRef.label;
        })
        : reactantRefs.findIndex((reactRef, rIdx) => {
          if (reactantUsed.has(rIdx)) return false;
          return signature(reactRef) === signature(prodRef);
        });
      if (matchIdx >= 0) {
        const reactRef = reactantRefs[matchIdx];
        reactantUsed.add(matchIdx);
        productToReactant.set(`${prodRef.patternIdx}.${prodRef.molIdx}`, reactRef);
        reactantToProduct.set(`${reactRef.patternIdx}.${reactRef.molIdx}`, prodRef);
      }
    });

    const mapItems: string[] = [];

    const addComponentMapItems = (
      reactantPattern: typeof reactantPatterns[number],
      productPattern: typeof productPatterns[number] | null,
      reactMolIdx: number,
      productMolIdx?: number
    ) => {
      const reactMol = reactantPattern.graph.molecules[reactMolIdx];
      const prodMol = productPattern?.graph.molecules[productMolIdx ?? -1];
      reactMol?.components.forEach((comp, compIdx) => {
        const sourceId = reactantPattern.componentIdMap.get(`${reactMolIdx}.${compIdx}`);
        if (!sourceId) return;
        if (prodMol) {
          const prodCompIdx = prodMol.components.findIndex((c) => c.name === comp.name);
          if (prodCompIdx >= 0) {
            const targetId = productPattern?.componentIdMap.get(`${productMolIdx}.${prodCompIdx}`);
            if (targetId) {
              mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${targetId}"/>`);
              return;
            }
          }
        }
        mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${sourceId}"/>`);
      });
    };

    reactantPatterns.forEach((pattern, patternIdx) => {
      pattern.graph.molecules.forEach((_, molIdx) => {
        const reactKey = `${patternIdx}.${molIdx}`;
        const reactRef = reactantRefs.find((r) => r.patternIdx === patternIdx && r.molIdx === molIdx);
        const prodRef = reactRef ? reactantToProduct.get(reactKey) : undefined;
        const sourceId = pattern.moleculeIdMap.get(molIdx);
        if (!sourceId) return;
        if (prodRef) {
          const prodPattern = productPatterns[prodRef.patternIdx];
          const targetId = prodPattern?.moleculeIdMap.get(prodRef.molIdx);
          if (targetId) {
            mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${targetId}"/>`);
          } else {
            mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${sourceId}"/>`);
          }
          addComponentMapItems(pattern, prodPattern ?? null, molIdx, prodRef.molIdx);
        } else {
          mapItems.push(`<MapItem sourceID="${sourceId}" targetID="${sourceId}"/>`);
          addComponentMapItems(pattern, null, molIdx);
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
              const reactMolA = reactPatternA.graph.molecules[reactA.molIdx];
              const reactMolB = reactPatternB.graph.molecules[reactB.molIdx];
              const compNameA = mol.components[compIdx]?.name;
              const compNameB = pattern.graph.molecules[pMolIdx].components[pCompIdx]?.name;
              if (!compNameA || !compNameB) return;

              const reactCompIdxA = reactMolA.components.findIndex((c) => c.name === compNameA);
              const reactCompIdxB = reactMolB.components.findIndex((c) => c.name === compNameB);
              if (reactCompIdxA < 0 || reactCompIdxB < 0) return;

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
          mol.components.forEach((comp, compIdx) => {
            const prodComp = prodMol.components.find((c) => c.name === comp.name);
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

          const reactCompartment = mol.compartment ?? '';
          const prodCompartment = prodMol.compartment ?? '';

          if (reactCompartment !== prodCompartment && prodCompartment) {
            const molId = pattern.moleculeIdMap.get(molIdx);
            if (molId) {
              operations.push(`<ChangeCompartment id="${molId}" destination="${escapeXml(prodCompartment)}"/>`);
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
    comp: { edges: Map<number, number>; wildcard?: '+' | '?' | '-' },
    isPattern: boolean
  ): string {
    if (comp.edges.size > 0) return String(comp.edges.size);
    if (comp.wildcard === '+') return '+';
    if (comp.wildcard === '?') return '?';
    if (comp.wildcard === '-') return '0';
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