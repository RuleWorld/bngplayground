import { BNGLParser as CoreBNGLParser } from '../services/graph/core/BNGLParser.ts';
/**
 * ANTLR4 BNGL Visitor
 * 
 * Converts ANTLR4 parse tree to BNGLModel type.
 */
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor.js';
import type { BNGParserVisitor } from './generated/BNGParserVisitor.ts';
import * as Parser from './generated/BNGParser.ts';
import type {
  BNGLModel,
  BNGLMoleculeType,
  BNGLSpecies,
  BNGLObservable,
  BNGLCompartment,
  BNGLFunction,
  ReactionRule,
  SimulationOptions,
  SimulationPhase,
  ConcentrationChange,
  ParameterChange,
  BNGLEnergyPattern,
  BNGLAction
} from '../../types';

export class BNGLVisitor extends AbstractParseTreeVisitor<BNGLModel> implements BNGParserVisitor<any> {
  private parameters: Record<string, number> = {};
  private moleculeTypes: BNGLMoleculeType[] = [];
  private species: BNGLSpecies[] = [];
  private observables: BNGLObservable[] = [];
  private reactionRules: ReactionRule[] = [];
  private compartments: BNGLCompartment[] = [];
  private functions: BNGLFunction[] = [];
  private networkOptions: BNGLModel['networkOptions'] = {};
  private simulationOptions: Partial<SimulationOptions> = {};
  private paramExpressions: Record<string, string> = {};
  // Multi-phase simulation support
  private simulationPhases: SimulationPhase[] = [];
  private concentrationChanges: ConcentrationChange[] = [];
  private parameterChanges: ParameterChange[] = [];
  private actions: BNGLAction[] = [];
  private speciesExpressions: string[] = [];
  private energyPatterns: BNGLEnergyPattern[] = [];

  protected defaultResult(): BNGLModel {
    return {
      parameters: this.parameters,
      moleculeTypes: this.moleculeTypes,
      species: this.species,
      observables: this.observables,
      reactions: [],
      reactionRules: this.reactionRules,
      compartments: this.compartments,
      functions: this.functions,
      networkOptions: this.networkOptions,
      simulationOptions: this.simulationOptions,
      simulationPhases: this.simulationPhases,
      concentrationChanges: this.concentrationChanges,
      parameterChanges: this.parameterChanges,
      actions: this.actions,
      paramExpressions: { ...this.paramExpressions },  // Export for setParameter recalculation
      energyPatterns: this.energyPatterns,
    };
  }

  // Visit the root program
  visitProg(ctx: Parser.ProgContext): BNGLModel {
    // Visit all program blocks
    for (const block of ctx.program_block()) {
      try {
        this.visitProgram_block(block);
      } catch (e: any) {
        console.error('Error visiting program block:', e.message);
        console.error(e.stack);
      }
    }

    // Visit top-level action commands (often outside blocks, e.g. at end of file)
    for (const action of (ctx as any).action_command?.() || []) {
      try {
        this.visit(action);
      } catch (e: any) {
        console.error('Error visiting top-level action:', e.message);
      }
    }

    // Visit actions blocks if present
    const actionsBlock = ctx.actions_block();
    if (actionsBlock) {
      try {
        this.visitActions_block(actionsBlock);
      } catch (e: any) {
        console.error('Error visiting actions block:', e.message);
      }
    }

    // Many published models use BEGIN ACTIONS ... END ACTIONS
    const wrappedActionsBlock = ctx.wrapped_actions_block?.();
    if (wrappedActionsBlock) {
      try {
        this.visitWrapped_actions_block(wrappedActionsBlock);
      } catch (e: any) {
        console.error('Error visiting wrapped actions block:', e.message);
      }
    }

    // Some grammars/inputs may surface begin_actions_block explicitly
    const beginActionsBlock = (ctx as any).begin_actions_block?.();
    if (beginActionsBlock) {
      try {
        this.visitBegin_actions_block(beginActionsBlock);
      } catch (e: any) {
        console.error('Error visiting begin actions block:', e.message);
      }
    }

    // Resolve parameter expressions
    this.resolveParameters();

    // Re-evaluate species concentrations after parameters are resolved
    this.resolveSpeciesConcentrations();

    return this.defaultResult();
  }

  // Multi-pass parameter resolution
  private resolveParameters(): void {
    const maxPasses = 10;
    const resolvedParams: Record<string, number> = {};

    for (let pass = 0; pass < maxPasses; pass++) {
      let allResolved = true;
      for (const [name, expr] of Object.entries(this.paramExpressions)) {
        if (name in resolvedParams) continue;

        // Evaluate using current resolved params
        const paramMap = new Map(Object.entries(resolvedParams));
        const val = CoreBNGLParser.evaluateExpression(expr, paramMap);

        if (!isNaN(val)) {
          resolvedParams[name] = val;
        } else {
          allResolved = false;
        }
      }
      if (allResolved) break;
    }

    // Assign resolved values to model
    Object.assign(this.parameters, resolvedParams);

    // PARITY FIX: Remove truly constant parameters from paramExpressions.
    // If a parameter doesn't depend on other parameters (evaluates with empty map),
    // it shouldn't be in paramExpressions because SimulationLoop.ts uses that list
    // to "revert" parameter changes back to their original BNGL definitions.
    // This ensures that setParameter("K", 200) works for parameters defined as constants (e.g. "K 0.1").
    for (const [name, expr] of Object.entries(this.paramExpressions)) {
      try {
        if (!isNaN(CoreBNGLParser.evaluateExpression(expr, new Map()))) {
          delete this.paramExpressions[name];
        }
      } catch {
        // If it fails with empty map, it's likely dependent or complex; keep it.
      }
    }

    // Ensure all params have at least a default value (e.g. 0) if resolution failed
    const unresolved = Object.keys(this.paramExpressions).filter(name => !(name in this.parameters));
    if (unresolved.length > 0) {
      console.warn(`[BNGLVisitor] Failed to resolve ${unresolved.length} parameters: ${unresolved.join(', ')}. Using default value 0 for these.`);
      for (const name of unresolved) {
        this.parameters[name] = 0;
      }
    } else {
      // console.log(`[BNGLVisitor] All ${Object.keys(this.paramExpressions).length} parameters resolved successfully.`);
    }
  }

  private resolveSpeciesConcentrations(): void {
    const paramMap = new Map(Object.entries(this.parameters));
    const funcMap = new Map<string, { args: string[]; expr: string }>();
    for (const f of this.functions) {
      funcMap.set(f.name, { args: f.args, expr: f.expression });
    }

    for (let i = 0; i < this.species.length; i++) {
      const expr = this.speciesExpressions[i];
      if (expr) {
        const val = CoreBNGLParser.evaluateExpression(expr, paramMap, undefined, funcMap);
        if (!isNaN(val)) {
          this.species[i].initialConcentration = val;
        }
      }
    }
  }

  // Route program_block to specific block visitors
  visitProgram_block(ctx: Parser.Program_blockContext): void {
    const paramsBlock = ctx.parameters_block();
    if (paramsBlock) { this.visitParameters_block(paramsBlock); return; }

    const molTypesBlock = ctx.molecule_types_block();
    if (molTypesBlock) { this.visitMolecule_types_block(molTypesBlock); return; }

    const seedBlock = ctx.seed_species_block();
    if (seedBlock) { this.visitSeed_species_block(seedBlock); return; }

    const obsBlock = ctx.observables_block();
    if (obsBlock) { this.visitObservables_block(obsBlock); return; }

    const rulesBlock = ctx.reaction_rules_block();
    if (rulesBlock) { this.visitReaction_rules_block(rulesBlock); return; }

    const funcsBlock = ctx.functions_block();
    if (funcsBlock) { this.visitFunctions_block(funcsBlock); return; }

    const compBlock = ctx.compartments_block();
    if (compBlock) { this.visitCompartments_block(compBlock); return; }

    // Actions blocks (BEGIN ACTIONS ... END ACTIONS)
    const wrappedActionsBlock = ctx.wrapped_actions_block();
    if (wrappedActionsBlock) {
      this.visitWrapped_actions_block(wrappedActionsBlock);
      return;
    }

    const beginActionsBlock = ctx.begin_actions_block();
    if (beginActionsBlock) {
      this.visitBegin_actions_block(beginActionsBlock);
      return;
    }

    // energy_patterns_block and population_maps_block
    const energyPatternsBlock = ctx.energy_patterns_block();
    if (energyPatternsBlock) {
      this.visitEnergy_patterns_block(energyPatternsBlock);
      return;
    }
  }

  private splitTopLevelCommaList(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);

      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  // Parameters block
  visitParameters_block(ctx: Parser.Parameters_blockContext): void {
    for (const paramDef of ctx.parameter_def()) {
      this.visitParameter_def(paramDef);
    }
    // Resolve immediately so subsequent blocks (seed species) can use them
    this.resolveParameters();
  }

  // Actions block visitors
  visitActions_block(ctx: Parser.Actions_blockContext): void {
    for (const cmd of ctx.action_command()) {
      this.visit(cmd);
    }
  }

  visitWrapped_actions_block(ctx: Parser.Wrapped_actions_blockContext): void {
    for (const cmd of ctx.action_command()) {
      this.visit(cmd);
    }
  }

  visitBegin_actions_block(ctx: Parser.Begin_actions_blockContext): void {
    for (const cmd of ctx.action_command()) {
      this.visit(cmd);
    }
  }

  // Parameter definition
  visitParameter_def(ctx: Parser.Parameter_defContext): void {
    try {
      // parameter_def uses param_name rules: (param_name COLON)? param_name BECOMES? expression?
      const paramNames = ctx.param_name();
      if (!paramNames || paramNames.length === 0) return;

      // The actual parameter name is the last param_name (first one is optional label)
      const nameCtx = paramNames[paramNames.length > 1 && ctx.COLON() ? 1 : 0];
      const name = nameCtx?.text || '';

      const value = ctx.expression() ? ctx.expression()!.text : undefined;

      if (!name || !value) return;

      // Store raw expression for resolution
      this.paramExpressions[name] = value;
      // Initialize with 0
      this.parameters[name] = 0;

    } catch (e: any) {
      console.error('Error in visitParameter_def:', e.message);
    }
  }

  // Molecule types block
  visitMolecule_types_block(ctx: Parser.Molecule_types_blockContext): void {
    for (const molTypeDef of ctx.molecule_type_def()) {
      this.visitMolecule_type_def(molTypeDef);
    }
  }

  visitMolecule_type_def(ctx: Parser.Molecule_type_defContext): void {
    const molDef = ctx.molecule_def();
    if (!molDef) return;

    const nameNode = molDef.STRING() || (molDef as any).keyword_as_mol_name?.();
    if (!nameNode) return;
    const name = nameNode.text;
    const components: string[] = [];

    const compListCtx = molDef.component_def_list();
    if (compListCtx) {
      for (const compDef of compListCtx.component_def()) {
        const compNameNode = compDef.STRING() || compDef.INT() || compDef.keyword_as_component_name();
        if (!compNameNode) continue;
        const compName = compNameNode.text;
        const stateList = compDef.state_list();
        if (stateList) {
          // state_list now uses state_name rules: state_name (TILDE state_name)*
          // state_name can be STRING | INT STRING?
          const stateNames = stateList.state_name();
          const states = stateNames.map(sn => sn.text);
          components.push(`${compName}~${states.join('~')}`);
        } else {
          components.push(compName);
        }
      }
    }

    this.moleculeTypes.push({ name, components });
  }

  // Seed species block
  visitSeed_species_block(ctx: Parser.Seed_species_blockContext): void {
    const seenLines = new Set<number>();
    for (const speciesDef of ctx.seed_species_def()) {
      const line = (speciesDef as any).start?.line as number | undefined;
      if (typeof line === 'number') {
        if (seenLines.has(line)) {
          continue;
        }
        seenLines.add(line);
      }
      this.visitSeed_species_def(speciesDef);
    }
  }

  visitSeed_species_def(ctx: Parser.Seed_species_defContext): void {
    const speciesDefCtx = ctx.species_def();
    if (!speciesDefCtx) return;

    let name = this.getSpeciesString(speciesDefCtx, { completeMissingComponents: false });
    let isConstant = false;

    // Check all children for $ prefix (constant/source species)
    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.text === '$') {
          isConstant = true;
          break;
        }
      }
    }

    // Handle compartment prefix (AT STRING COLON)
    if (ctx.AT()) {
      let foundAt = false;
      for (let i = 0; i < ctx.children!.length; i++) {
        const child = ctx.children![i];
        if (child.text === '@') {
          foundAt = true;
          continue;
        }
        if (foundAt) {
          if (child.payload) {
            const tokenText = child.text;
            if (tokenText && tokenText !== ':' && tokenText !== '$') {
              name = `@${tokenText}:${name}`;
              break;
            }
          }
        }
      }
    }

    const exprCtx = ctx.expression();
    const concentration = exprCtx ? this.evaluateExpression(exprCtx) : 0;

    this.species.push({
      name,
      initialConcentration: concentration,
      isConstant,
      initialExpression: exprCtx ? exprCtx.text : '0'
    });
    this.speciesExpressions.push(exprCtx ? exprCtx.text : '0');
  }

  // Observables block
  visitObservables_block(ctx: Parser.Observables_blockContext): void {
    for (const obsDef of ctx.observable_def()) {
      this.visitObservable_def(obsDef);
    }
  }

  visitObservable_def(ctx: Parser.Observable_defContext): void {
    const typeCtx = ctx.observable_type();
    const strings = ctx.STRING();
    const patternListCtx = ctx.observable_pattern_list();

    if (!typeCtx || strings.length === 0 || !patternListCtx) return;

    // Check for MOLECULES or SPECIES tokens first, then fall back to STRING
    // Use lowercase to match BNGLModel interface and simulation expectations
    let type: 'molecules' | 'species' | 'counter' | string = 'molecules';
    if (typeCtx.SPECIES()) {
      type = 'species';
    } else if (typeCtx.MOLECULES()) {
      type = 'molecules';
    } else if ((typeCtx as any).COUNTER?.()) {
      type = 'counter';
    } else if (typeCtx.STRING()) {
      const text = typeCtx.STRING()!.text.toLowerCase();
      if (text === 'species' || text === 'molecules' || text === 'counter') {
        type = text;
      }
    }

    // Get observable name - skip label if present
    const name = ctx.COLON() && strings.length >= 2 ? strings[1].text : strings[0].text;

    // Get patterns - observable_pattern wraps species_def
    const patterns = patternListCtx.observable_pattern().map(op => {
      const speciesDef = op.species_def();
      if (speciesDef) {
        return this.getSpeciesString(speciesDef, { completeMissingComponents: false });
      }
      // For stoichiometry comparisons like R==1, just return the text
      return op.text;
    }).map((p) => p?.trim() ?? '').filter((p) => p.length > 0 && p !== ',');

    // Check for count filter (>N syntax) in the first pattern (NFsim limitation: typically per-species observable)
    let countFilter: number | undefined;
    let countRelation: string | undefined;

    if (patternListCtx.observable_pattern().length > 0) {
      const firstOp = patternListCtx.observable_pattern()[0];
      const intToken = firstOp.INT();

      if (intToken) {
        const token = Array.isArray(intToken) ? intToken[0] : intToken;
        countFilter = parseInt(token.text);

        if (firstOp.GT()) countRelation = '>';
        else if (firstOp.GTE()) countRelation = '>=';
        else if (firstOp.LT()) countRelation = '<';
        else if (firstOp.LTE()) countRelation = '<=';
        else if (firstOp.EQUALS()) countRelation = '==';
      }
    }

    this.observables.push({ type, name, pattern: patterns.join(', '), countFilter, countRelation });
  }

  // Reaction rules block
  visitReaction_rules_block(ctx: Parser.Reaction_rules_blockContext): void {
    if (!ctx) return;
    try {
      const rules = ctx.reaction_rule_def();
      if (!rules) return;
      for (const ruleDef of rules) {
        if (ruleDef) this.visitReaction_rule_def(ruleDef);
      }
    } catch (e: any) {
      console.error('Error in visitReaction_rules_block:', e.message);
    }
  }

  // Reaction rule definition
  visitReaction_rule_def(ctx: Parser.Reaction_rule_defContext): void {
    const labelCtx = ctx.label_def();
    const reactantCtx = ctx.reactant_patterns();
    const productCtx = ctx.product_patterns();
    const reactionSignCtx = ctx.reaction_sign();
    const rateLawCtx = ctx.rate_law();


    if (!reactantCtx || !productCtx || !reactionSignCtx || !rateLawCtx) return;

    // label_def can have STRING or INT, handle both single nodes and arrays
    const labelStr = labelCtx?.STRING();
    const labelInt = labelCtx?.INT();
    const strNode = Array.isArray(labelStr) ? labelStr[0] : labelStr;
    const intNode = Array.isArray(labelInt) ? labelInt[0] : labelInt;
    const name = labelCtx ? (strNode?.text || intNode?.text) : undefined;

    // Get reactants - collect all species and skip '0'
    const reactantSpecies = reactantCtx.species_def();

    // Original logic: "0 -> Product" meant reactants = []
    // New logic: collect all species. If only '0' is present, results in [] anyway.
    // completeMissingComponents: true adds any absent components as synthetic `!?` wildcards.
    // Components added this way are flagged syntheticWildcard=true in buildWildcardComponent so
    // that matchRespectsProductImpliedFreeConstraints can distinguish them from explicitly-written
    // !? wildcards (e.g. CD40(l!?) in cd40-signaling). Synthetic wildcards are treated as absent
    // in the product-implied-free filter (GPCR fix), while explicit !? wildcards are carry-through.
    let reactants: string[] = reactantSpecies.map(sd => this.getSpeciesString(sd, { completeMissingComponents: true }));

    // Get products - collect all species and skip '0'
    const productSpecies = productCtx.species_def();

    // Mixed products like "A + 0" should result in ["A"]
    let products: string[] = productSpecies.map(sd => this.getSpeciesString(sd, { completeMissingComponents: true }));

    // Get rate(s)
    const rateExpressions = rateLawCtx.expression();
    let rate = rateExpressions.length > 0 ? this.getExpressionText(rateExpressions[0]) : '0';
    const reverseRate = rateExpressions.length > 1 ? this.getExpressionText(rateExpressions[1]) : undefined;

    let isArrhenius = false;
    let arrheniusPhi: string | undefined;
    let arrheniusEact: string | undefined;
    let arrheniusA: string | undefined;

    let isReverseArrhenius = false;
    let reverseArrheniusPhi: string | undefined;
    let reverseArrheniusEact: string | undefined;
    let reverseArrheniusA: string | undefined;

    if (rateExpressions.length > 0) {
      if (rate.toLowerCase().startsWith('arrhenius(')) {
        isArrhenius = true;
        const openParen = rate.indexOf('(');
        const closeParen = rate.lastIndexOf(')');
        if (openParen !== -1 && closeParen !== -1) {
          const argStr = rate.substring(openParen + 1, closeParen);
          const args = this.splitTopLevelCommaList(argStr);
          if (args.length === 1) {
            arrheniusPhi = "0.5";
            arrheniusEact = args[0].trim();
          } else if (args.length === 2) {
            arrheniusPhi = args[0].trim();    // phi is FIRST argument
            arrheniusEact = args[1].trim();   // Ea is SECOND argument
          } else if (args.length >= 3) {
            arrheniusPhi = args[0].trim();
            arrheniusEact = args[1].trim();
            arrheniusA = args[2].trim();
          }
        }
      }
    }

    if (rateExpressions.length > 1 && reverseRate) {
      if (reverseRate.toLowerCase().startsWith('arrhenius(')) {
        isReverseArrhenius = true;
        const openParen = reverseRate.indexOf('(');
        const closeParen = reverseRate.lastIndexOf(')');
        if (openParen !== -1 && closeParen !== -1) {
          const argStr = reverseRate.substring(openParen + 1, closeParen);
          const args = this.splitTopLevelCommaList(argStr);
          if (args.length === 1) {
            reverseArrheniusPhi = "0.5";
            reverseArrheniusEact = args[0].trim();
          } else if (args.length === 2) {
            reverseArrheniusPhi = args[0].trim();    // phi is FIRST argument
            reverseArrheniusEact = args[1].trim();   // Ea is SECOND argument
          } else if (args.length >= 3) {
            reverseArrheniusPhi = args[0].trim();
            reverseArrheniusEact = args[1].trim();
            reverseArrheniusA = args[2].trim();
          }
        }
      }
    }

    const isBidirectional = !!reactionSignCtx.BI_REACTION_SIGN();

    // Check modifiers (can be prefix or suffix, so we get an array)
    let deleteMolecules = false;
    let moveConnected = false;
    let matchOnce = false;
    let totalRate = false;
    const constraints: string[] = [];

    // rule_modifiers() returns an array in the new grammar
    const modifiersList = ctx.rule_modifiers();

    const processModifiers = (modifiersCtx: Parser.Rule_modifiersContext) => {
      if (modifiersCtx.DELETEMOLECULES()) {
        deleteMolecules = true;
      }
      if (modifiersCtx.MOVECONNECTED()) {
        moveConnected = true;
      }
      if (modifiersCtx.MATCHONCE()) {
        matchOnce = true;
      }
      if (modifiersCtx.TOTALRATE()) {
        totalRate = true;
      }

      const getPatternListStr = (pl?: Parser.Pattern_listContext) => {
        return pl ? pl.species_def().map(sd => this.getSpeciesString(sd, { completeMissingComponents: false })).join(',') : '';
      };

      if (modifiersCtx.INCLUDE_REACTANTS()) {
        const idx = modifiersCtx.INT()?.text;
        const patterns = getPatternListStr(modifiersCtx.pattern_list());
        constraints.push(`include_reactants(${idx},${patterns})`);
      }
      if (modifiersCtx.EXCLUDE_REACTANTS()) {
        const idx = modifiersCtx.INT()?.text;
        const patterns = getPatternListStr(modifiersCtx.pattern_list());
        constraints.push(`exclude_reactants(${idx},${patterns})`);
      }
      if (modifiersCtx.INCLUDE_PRODUCTS()) {
        const idx = modifiersCtx.INT()?.text;
        const patterns = getPatternListStr(modifiersCtx.pattern_list());
        constraints.push(`include_products(${idx},${patterns})`);
      }
      if (modifiersCtx.EXCLUDE_PRODUCTS()) {
        const idx = modifiersCtx.INT()?.text;
        const patterns = getPatternListStr(modifiersCtx.pattern_list());
        constraints.push(`exclude_products(${idx},${patterns})`);
      }
    };

    if (modifiersList && modifiersList.length > 0) {
      modifiersList.forEach(m => processModifiers(m));
    }

    this.reactionRules.push({
      name: name || `_R${this.reactionRules.length + 1}`,
      reactants,
      products,
      rate,
      rateExpression: rate, // Always preserve the rate expression string
      reactionString: reactantCtx.text + (isBidirectional ? ' <-> ' : ' -> ') + productCtx.text,
      reverseRate,
      isBidirectional,
      deleteMolecules,
      moveConnected,
      matchOnce,
      constraints,
      totalRate,
      isArrhenius,
      arrheniusPhi,
      arrheniusEact,
      arrheniusA,
      isReverseArrhenius,
      reverseArrheniusPhi,
      reverseArrheniusEact,
      reverseArrheniusA,
    });
  }

  // Functions block
  visitFunctions_block(ctx: Parser.Functions_blockContext): void {
    for (const funcDef of ctx.function_def()) {
      this.visitFunction_def(funcDef);
    }
  }

  visitFunction_def(ctx: Parser.Function_defContext): void {
    const strings = ctx.STRING();
    if (strings.length === 0) return;

    // Get function name (skip label if present)
    const name = ctx.COLON() && strings.length >= 2 ? strings[1].text : strings[0].text;

    // Get arguments
    const args: string[] = [];
    const paramListCtx = ctx.param_list();
    if (paramListCtx) {
      for (const s of paramListCtx.STRING()) {
        args.push(s.text);
      }
    }

    // Get expression
    const exprCtx = ctx.expression();
    const expression = exprCtx ? this.getExpressionText(exprCtx) : '';

    this.functions.push({ name, args, expression });
  }

  // Compartments block
  visitCompartments_block(ctx: Parser.Compartments_blockContext): void {
    for (const compDef of ctx.compartment_def()) {
      this.visitCompartment_def(compDef);
    }
  }

  visitCompartment_def(ctx: Parser.Compartment_defContext): void {
    const strings = ctx.STRING();
    if (strings.length === 0) return;

    const name = ctx.COLON() && strings.length >= 2 ? strings[1].text : strings[0].text;
    const dimension = ctx.INT() ? parseInt(ctx.INT()!.text) : 3;

    const exprCtx = ctx.expression();
    const size = exprCtx ? this.evaluateExpression(exprCtx) : 1;


    // Parent is the last STRING if there are multiple
    const parent = strings.length >= (ctx.COLON() ? 3 : 2)
      ? strings[strings.length - 1].text
      : undefined;

    this.compartments.push({ name, dimension, size, parent });
  }

  // Energy patterns block
  visitEnergy_patterns_block(ctx: Parser.Energy_patterns_blockContext): void {
    for (const def of ctx.energy_pattern_def()) {
      this.visitEnergy_pattern_def(def);
    }
  }

  visitEnergy_pattern_def(ctx: Parser.Energy_pattern_defContext): void {
    const speciesDef = ctx.species_def();
    const expr = ctx.expression();
    if (!speciesDef || !expr) return;

    const pattern = this.getSpeciesString(speciesDef, { completeMissingComponents: false });
    const expression = expr.text;

    // Optional label
    const labelNode = ctx.STRING();
    const label = (ctx.COLON() && labelNode) ? labelNode.text : undefined;

    // Initial value evaluation
    const value = this.evaluateExpression(expr);

    this.energyPatterns.push({
      name: label,
      pattern,
      expression,
      value
    });
  }

  visitGenerate_network_cmd(ctx: Parser.Generate_network_cmdContext): void {
    const argsCtx = ctx.action_args();
    if (!argsCtx) return;

    const args = this.parseActionArgs(argsCtx);
    this.actions.push({ type: 'generate_network', args });

    if (args.max_agg !== undefined) {
      this.networkOptions!.maxAgg = parseInt(args.max_agg);
    }
    if (args.max_iter !== undefined) this.networkOptions!.maxIter = parseInt(args.max_iter);
    if (args.overwrite !== undefined) this.networkOptions!.overwrite = args.overwrite === '1';
    if (args.max_stoich !== undefined) {
      if (args.max_stoich.startsWith('{')) {
        this.networkOptions!.maxStoich = this.parseBNGLMap(args.max_stoich);
      } else {
        this.networkOptions!.maxStoich = parseInt(args.max_stoich);
      }
    }
  }

  // Helper: Parse BNGL map string "{Key=>Val, ...}"
  private parseBNGLMap(text: string): Record<string, number> {
    const map: Record<string, number> = {};
    const content = text.trim().replace(/^\{|\}$/g, '');
    if (!content) return map;

    const parts = content.split(',');
    for (const part of parts) {
      const [key, valStr] = part.split('=>');
      if (key && valStr) {
        const val = parseFloat(valStr.trim());
        if (!isNaN(val)) {
          map[key.trim()] = val;
        }
      }
    }
    return map;
  }

  visitSimulate_cmd(ctx: Parser.Simulate_cmdContext): void {
    const argsCtx = ctx.action_args();
    if (!argsCtx) return;

    const args = this.parseActionArgs(argsCtx);

    // Helper to evaluate numeric expression arguments (e.g., "14*24*60*60")
    const evalNumericArg = (val: string | undefined, defaultVal: number): number => {
      if (val === undefined) return defaultVal;
      // Try simple number first
      const num = parseFloat(val);
      if (!isNaN(num) && !val.includes('*') && !val.includes('/') && !val.includes('+') && !val.includes('-') && !val.includes('^')) {
        return num;
      }
      // Evaluate as expression
      try {
        const paramMap = new Map(Object.entries(this.parameters));
        const result = CoreBNGLParser.evaluateExpression(val, paramMap);
        return isNaN(result) ? defaultVal : result;
      } catch (e) {
        return num; // Fall back to simple parse
      }
    };

    const evalIntArg = (val: string | undefined, defaultVal: number): number => {
      const n = evalNumericArg(val, defaultVal);
      if (!Number.isFinite(n)) return defaultVal;
      return Math.trunc(n);
    };

    // Determine method from command name or args
    let method: 'ode' | 'ssa' | 'nf' = 'ode';
    const cmdText = ctx.text.toLowerCase();
    if (cmdText.includes('simulate_nf')) method = 'nf';
    else if (cmdText.includes('simulate_ssa') || args.method === 'ssa' || args.method === '"ssa"') method = 'ssa';
    else if (args.method) {
      // Remove quotes if present
      const methodValue = String(args.method).replace(/['"]/g, '').toLowerCase();
      if (methodValue === 'nf' || methodValue === 'nfsim') method = 'nf';
      else if (methodValue === 'ssa') method = 'ssa';
      else method = 'ode';
    }


    // Build simulation phase
    console.log(`[BNGLVisitor] visitSimulate_cmd: ${cmdText}, raw args:`, args);
    const parsedContinue = args.continue !== undefined
      ? (String(args.continue).trim() === '1' || String(args.continue).trim().toLowerCase() === 'true')
      : undefined;
    const phase: SimulationPhase = {
      method,
      t_start: args.t_start !== undefined ? evalNumericArg(args.t_start, 0) : undefined,
      t_end: evalNumericArg(args.t_end, 100),
      n_steps: args.n_steps !== undefined ? evalIntArg(args.n_steps, 100) : 100,
      continue: parsedContinue,
      atol: args.atol !== undefined ? evalNumericArg(args.atol, 1e-8) : (args.atoll !== undefined ? evalNumericArg(args.atoll, 1e-8) : undefined),
      rtol: args.rtol !== undefined ? evalNumericArg(args.rtol, 1e-8) : undefined,
      suffix: args.suffix?.replace(/["']/g, ''),
      // Preserve tri-state sparse flag:
      sparse: args.sparse !== undefined
        ? (args.sparse === '1' || args.sparse === 'true')
        : undefined,
      steady_state: args.steady_state === '1' || args.steady_state === 'true',
      print_functions: args.print_functions !== undefined
        ? (String(args.print_functions).trim() === '1' || String(args.print_functions).trim().toLowerCase() === 'true')
        : undefined,
    };
    console.log(`[BNGLVisitor] evaluated phase:`, phase);

    // Add to standardized actions list
    this.actions.push({
      type: 'simulate',
      args: { ...args, ...phase } // Include parsed phase props for convenience
    });

    this.simulationPhases.push(phase);

    // Also update global simulationOptions for backward compatibility (uses last phase)
    if (args.method) {
      if (args.method === 'ssa') this.simulationOptions.method = 'ssa';
      else this.simulationOptions.method = 'ode';
    }
    if (args.t_end !== undefined) this.simulationOptions.t_end = evalNumericArg(args.t_end, this.simulationOptions.t_end ?? 100);
    if (args.n_steps !== undefined) this.simulationOptions.n_steps = evalIntArg(args.n_steps, this.simulationOptions.n_steps ?? 100);
    if (args.atol !== undefined) this.simulationOptions.atol = evalNumericArg(args.atol, this.simulationOptions.atol ?? 1e-8);
    if (args.atoll !== undefined) this.simulationOptions.atol = evalNumericArg(args.atoll, this.simulationOptions.atol ?? 1e-8);
    if (args.rtol !== undefined) this.simulationOptions.rtol = evalNumericArg(args.rtol, this.simulationOptions.rtol ?? 1e-8);
  }



  // Explicitly ignore write commands (writeXML, writeSBML, etc)
  visitWrite_cmd(_ctx: Parser.Write_cmdContext): void {
    return;
  }

  // Handle setConcentration/addConcentration/setParameter commands
  visitSet_cmd(ctx: Parser.Set_cmdContext): void {
    // Grammar: SETCONCENTRATION/SETPARAMETER LPAREN DBQUOTES ... DBQUOTES COMMA (expression | DBQUOTES...) RPAREN

    const text = ctx.text;

    // Handle setConcentration("Species", value)
    const concMatch = text.match(/setConcentration\s*\(\s*"([^"]+)"\s*,\s*(.+)\s*\)/i);
    if (concMatch) {
      const species = concMatch[1];
      let value: string | number = concMatch[2].trim();

      // Try to parse as number or evaluate expression
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1); // Keep as parameter reference
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num;
        } else {
          // Try to evaluate as expression with current parameters
          try {
            const paramsMap = new Map(Object.entries(this.parameters));
            value = CoreBNGLParser.evaluateExpression(value, paramsMap);
          } catch (e) {
            // If evaluation fails, keep as string (might be parameter ref)
            console.warn(`[BNGLVisitor] Could not evaluate setConcentration expression: ${value}`);
          }
        }
      }

      // afterPhaseIndex is the number of simulation phases already parsed - 1
      const afterPhaseIndex = this.simulationPhases.length - 1;

      this.concentrationChanges.push({
        species,
        value,
        mode: 'set',
        afterPhaseIndex
      });
      // Add to standardized actions
      this.actions.push({ type: 'setConcentration', args: { species, value } });
      return;
    }

    // Handle setParameter("ParamName", value)
    const paramMatch = text.match(/setParameter\s*\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)/i);
    if (paramMatch) {
      const parameter = paramMatch[1];
      let value: string | number = paramMatch[2].trim();

      // Try to parse as number or expression
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1); // Keep as expression string (e.g., "10*60")
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num;
        }
      }

      // afterPhaseIndex is the number of simulation phases already parsed - 1
      const afterPhaseIndex = this.simulationPhases.length - 1;

      this.parameterChanges.push({
        parameter,
        value,
        afterPhaseIndex
      });
      // Add to standardized actions
      this.actions.push({ type: 'setParameter', args: { parameter, value } });
      return;
    }

    // Handle addConcentration (similar to setConcentration but additive)
    const addMatch = text.match(/addConcentration\s*\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)/i);
    if (addMatch) {
      const species = addMatch[1];
      let value: string | number = addMatch[2].trim();

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num;
        }
      }

      const afterPhaseIndex = this.simulationPhases.length - 1;

      this.concentrationChanges.push({
        species,
        value,
        mode: 'add',
        afterPhaseIndex
      });
      // Add to standardized actions
      this.actions.push({ type: 'addConcentration', args: { species, value } });
    }
  }

  // Handle other action commands
  visitOther_action_cmd(ctx: Parser.Other_action_cmdContext): void {
    // Explicitly ignore visualize commands
    if (ctx.VISUALIZE()) {
      return;
    }

    if (ctx.SAVECONCENTRATIONS()) {
      const afterPhaseIndex = this.simulationPhases.length - 1;
      this.concentrationChanges.push({
        species: '',
        value: 0,
        mode: 'save',
        afterPhaseIndex,
      });
      this.actions.push({ type: 'saveConcentrations', args: {} });
      return;
    }

    if (ctx.RESETCONCENTRATIONS()) {
      const afterPhaseIndex = this.simulationPhases.length - 1;
      this.concentrationChanges.push({
        species: '',
        value: 0,
        mode: 'reset',
        afterPhaseIndex,
      });
      this.actions.push({ type: 'resetConcentrations', args: {} });
      return;
    }

    // For other commands, default to visiting children
    this.visitChildren(ctx);
  }

  // Helper: Parse action arguments
  private parseActionArgs(ctx: Parser.Action_argsContext): Record<string, string> {
    const args: Record<string, string> = {};

    const argListCtx = ctx.action_arg_list();
    if (!argListCtx) return args;

    for (const argCtx of argListCtx.action_arg()) {
      // arg_name can be STRING or a keyword like OVERWRITE, METHOD, etc.
      const argNameCtx = argCtx.arg_name();
      const name = argNameCtx?.text;
      if (!name) continue;

      // Get value from action_arg_value rule
      const valueCtx = argCtx.action_arg_value();
      if (valueCtx) {
        // Try expression first
        const exprCtx = valueCtx.expression();
        if (exprCtx) {
          args[name] = this.getExpressionText(exprCtx);
        } else {
          // Fall back to raw text for quoted strings, arrays, or nested hashes
          args[name] = valueCtx.text;
        }
      }
    }

    return args;
  }

  // Helper: Get species pattern as string
  private getSpeciesString(
    ctx: Parser.Species_defContext,
    options: { completeMissingComponents?: boolean } = {}
  ): string {
    const molPatterns = ctx.molecule_pattern();
    if (!molPatterns || molPatterns.length === 0) return '';

    // DEBUG LOGGING


    // Check for compartment prefix
    let prefix = '';
    // If COLON exists, we have @comp: prefix
    if (ctx.COLON()) {
      // The compartment name matches the STRING() rule
      // Accessing the first STRING token at this level
      const strings = ctx.STRING();
      if (strings && strings.length > 0) {
        prefix = `@${strings[0].text}:`;
        // console.log(`[getSpeciesString] Found prefix: ${prefix}`);
      }
    } else {
      // console.log(`[getSpeciesString] No COLON (prefix) found in ${speciesStr}`);
    }


    const moleculeEntries: Array<{ pattern: Parser.Molecule_patternContext; compartment?: string }> = [];
    const getRuleIndex = (node: unknown): number | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      const maybeRuleIndex = (node as { ruleIndex?: unknown }).ruleIndex;
      return typeof maybeRuleIndex === 'number' ? maybeRuleIndex : undefined;
    };
    if (ctx.children) {
      for (const child of ctx.children) {
        const ruleIndex = getRuleIndex(child);
        if (ruleIndex === Parser.BNGParser.RULE_molecule_pattern) {
          moleculeEntries.push({ pattern: child as Parser.Molecule_patternContext });
          continue;
        }
        if (ruleIndex === Parser.BNGParser.RULE_molecule_compartment && moleculeEntries.length > 0) {
          const compNode = (child as Parser.Molecule_compartmentContext).STRING();
          if (compNode) {
            moleculeEntries[moleculeEntries.length - 1].compartment = compNode.text;
          }
        }
      }
    }
    if (moleculeEntries.length === 0) {
      for (const mp of molPatterns) {
        moleculeEntries.push({ pattern: mp });
      }
    }

    const molecules = moleculeEntries.map((entry) => {
      const mp = entry.pattern;
      const nameNode = mp.STRING() || (mp as any).keyword_as_mol_name?.();
      if (!nameNode) return '';
      const name = nameNode.text;
      const rawPatternText = mp.text?.replace(/\s+/g, '') ?? '';
      const compListCtx = mp.component_pattern_list();

      const shouldComplete = options.completeMissingComponents === true;
      const molType = this.moleculeTypes.find((m) => m.name === name);

      const buildWildcardComponent = (compDef: string): string => {
        const parts = compDef.split('~');
        const base = parts[0];
        let comp = base;
        if (parts.length > 1) {
          comp += '~?';
        }
        // Use !?__SYN__ to mark this as a synthetically-added wildcard (absent in user rule).
        // BNGLParser.parseComponent recognises __SYN__ and sets syntheticWildcard=true so that
        // matchRespectsProductImpliedFreeConstraints can treat this component as absent rather than
        // as an explicit !? carry-through (e.g. CD40(l!?) which must NOT be treated as synthetic).
        comp += '!?__SYN__';
        return comp;
      };

      let molStr = `${name}()`;

      if (!compListCtx) {
        // If no component list, molecule has no components (e.g., "dead" or "I")
        // Normalize to name() to match GraphCanonicalizer and BioNetGen conventions
        if (shouldComplete && molType && molType.components.length > 0) {
          const completed = molType.components.map(buildWildcardComponent);
          molStr = `${name}(${completed.join(',')})`;
        }
      } else {
        // Filter out undefined/empty entries (from double commas ",,")
        const compPatterns = compListCtx.component_pattern();
        const validComps = compPatterns.filter(cp => cp && (cp.STRING() || cp.INT() || cp.keyword_as_component_name()));
        // console.log(`[getSpeciesString] Mol ${name}, total comps: ${compPatterns.length}, valid comps: ${validComps.length}`);

        if (validComps.length > 0) {
          let components = validComps.map(cp => {
            const compNode = cp.STRING() || cp.INT() || cp.keyword_as_component_name();
            let comp = compNode ? compNode.text : '';

            const stateCtxs = cp.state_value();
            if (stateCtxs && stateCtxs.length > 0) {
              for (const stateCtx of stateCtxs) {
                // state_value grammar: STRING | INT STRING? | QMARK
                // For states like "2P", INT()="2" and STRING()="P" — must concatenate both.
                const intPart = stateCtx.INT()?.text ?? '';
                const strPart = stateCtx.STRING()?.text ?? '';
                const stateStr = intPart + strPart;
                const qmark = stateCtx.QMARK();
                comp += `~${stateStr || (qmark ? '?' : '')}`;
              }
            }

            // Handle multiple bond specs (bond_spec* returns array)
            const bondSpecs = cp.bond_spec();
            if (bondSpecs && bondSpecs.length > 0) {
              for (const bondCtx of bondSpecs) {
                const bondIdCtx = bondCtx.bond_id();
                if (bondIdCtx) {
                  comp += `!${bondIdCtx.INT()?.text || bondIdCtx.STRING()?.text || ''}`;
                } else if (bondCtx.PLUS()) {
                  comp += '!+';
                } else if (bondCtx.QMARK()) {
                  comp += '!?';
                }
              }
            }

            return comp;
          }).filter(c => c); // Filter out empty components

          if (shouldComplete && molType && molType.components.length > 0) {
            const byName = new Map<string, string[]>();
            for (const comp of components) {
              const base = comp.split('~')[0].split('!')[0].trim();
              if (!byName.has(base)) byName.set(base, []);
              byName.get(base)!.push(comp);
            }

            const ordered: string[] = [];
            for (const compDef of molType.components) {
              const base = compDef.split('~')[0];
              const queue = byName.get(base);
              if (queue && queue.length > 0) {
                ordered.push(queue.shift()!);
              } else {
                ordered.push(buildWildcardComponent(compDef));
              }
            }

            for (const remaining of byName.values()) {
              ordered.push(...remaining);
            }
            components = ordered;
          }

          // console.log(`[getSpeciesString] Mol ${name}, components:`, components);
          molStr = `${name}(${components.join(',')})`;
        }
      }

      // Support molecule-level wildcards (!+, !?)
      const wildcardCtx = mp.pattern_bond_wildcard();
      if (wildcardCtx) molStr += wildcardCtx.text;

      const tagCtx = mp.molecule_tag();
      if (tagCtx) molStr += tagCtx.text;

      const attrCtx = (mp as any).molecule_attributes?.();
      if (attrCtx) molStr += attrCtx.text;

      if (entry.compartment) {
        molStr += `@${entry.compartment}`;
      } else {
        // Legacy compartment-before-parentheses syntax support, e.g. "B@EC()".
        const legacyCompBeforeParen = rawPatternText.match(/^([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z0-9_]+)\(([^()]*)\)$/);
        if (legacyCompBeforeParen && legacyCompBeforeParen[1] === name && !/@[A-Za-z0-9_]+$/.test(molStr)) {
          const comp = legacyCompBeforeParen[2];
          molStr += `@${comp}`;
        }
      }

      return molStr;
    }).filter(m => m); // Filter out empty molecules

    const rawSpeciesText = ctx.text?.replace(/\s+/g, '') ?? '';
    let res = prefix + molecules.join('.');

    // Handle species-level suffix compartment (AT STRING at end) - e.g., A.B@PM
    // This is distinct from molecule_compartment contexts (e.g., A@EC.B@PM).
    if (!prefix && ctx.children && ctx.children.length >= 2) {
      const last = ctx.children[ctx.children.length - 1];
      const prev = ctx.children[ctx.children.length - 2];
      const suffixComp = last?.text ?? '';
      if (prev?.text === '@' && /^[A-Za-z0-9_]+$/.test(suffixComp)) {
        res = `${res}@${suffixComp}`;
      }
    }

    // Fallback: recover compartment-before-parentheses syntax when parse-tree
    // compartment nodes are missing in some observable contexts.
    // Example: `B@EC()` should normalize to `B()@EC`.
    if (!prefix && !res.includes('@') && rawSpeciesText.includes('@')) {
      const normalizedRaw = rawSpeciesText.replace(
        /([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z0-9_]+)\(([^()]*)\)/g,
        (_m, mol, comp, args) => `${mol}(${String(args ?? '')})@${comp}`
      );
      if (normalizedRaw.includes('@')) {
        res = normalizedRaw;
      }
    }

    // Workaround for Issue where prefix is sometimes duplicated as suffix in complex patterns
    // e.g. E2F(...)@cell:E2F(...)
    if (res.includes('@') && res.includes(':')) {
      const match = res.match(/^(.+)@([a-zA-Z0-9_]+):(.+)$/);
      if (match) {
        const [_, name1, comp, name2] = match;
        // Check if name2 is duplication of name1 (with or without parens)
        if (name1 === name2 || (name1 + '()' === name2) || (name1 === name2 + '()') || name2.startsWith(name1)) {
          res = `@${comp}:${name1}`;
        }
      }
    }

    return res;
  }

  // Helper: Get expression text (preserving structure)
  private getExpressionText(ctx: Parser.ExpressionContext): string {
    return ctx.text;
  }

  // Helper: Evaluate expression to number
  private evaluateExpression(ctx: Parser.ExpressionContext): number {
    const text = ctx.text;

    // Convert parameters record to Map
    const paramMap = new Map<string, number>(Object.entries(this.parameters));

    // Define Observables Map (if available in this context?)
    // BNGLVisitor collects observables in this.observables [BNGLObservable[]]
    // We can allow observable names as valid identifiers (value 1.0 or 0.0 for initial check)
    // But for rate laws, we usually want to preserve structure?
    // Wait, this method is used for evaluating CONSTANTS (like parameters).
    // If we use it for rates, we might get numbers.
    // But BNGLVisitor collects rate expressions as strings usually.
    // It calls evaluateExpression ONLY for numeric arguments (like t_end, n_steps, parameter values).

    // However, if a parameter depends on a function?
    // e.g. begin parameters; k1 f(); end parameters;
    // Then we need function support here too.

    const funcMap = new Map<string, { args: string[], expr: string }>();
    for (const f of this.functions) {
      funcMap.set(f.name, { args: f.args, expr: f.expression });
    }

    // Also add observables to map so they don't cause errors if referenced in params (though uncommon)
    // If a parameter references an observable, it's usually invalid in BNG unless it's an expression parameter.
    const obsMap = new Map<string, number>();
    for (const obs of this.observables) {
      obsMap.set(obs.name, 1.0);
    }

    return CoreBNGLParser.evaluateExpression(text, paramMap, obsMap, funcMap);
  }
}
