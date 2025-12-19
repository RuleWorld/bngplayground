import { BNGLParser as CoreBNGLParser } from '../services/graph/core/BNGLParser';
/**
 * ANTLR4 BNGL Visitor
 * 
 * Converts ANTLR4 parse tree to BNGLModel type.
 */
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import { BNGParserVisitor } from './generated/BNGParserVisitor';
import * as Parser from './generated/BNGParser';
import type {
  BNGLModel,
  BNGLMoleculeType,
  BNGLSpecies,
  BNGLObservable,
  BNGLCompartment,
  BNGLFunction,
  ReactionRule,
  SimulationOptions
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

    // Visit actions block if present
    const actionsBlock = ctx.actions_block();
    if (actionsBlock) {
      try {
        this.visitActions_block(actionsBlock);
      } catch (e: any) {
        console.error('Error visiting actions block:', e.message);
      }
    }

    // Resolve parameter expressions
    this.resolveParameters();

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

    // Ensure all params have at least a default value (e.g. 0) if resolution failed
    for (const name of Object.keys(this.paramExpressions)) {
      if (!(name in this.parameters)) {
        this.parameters[name] = 0;
        console.warn(`Failed to resolve parameter '${name}'`);
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

    // Actions block (begin actions / end actions) - skip for model parsing
    const actionsBlock = ctx.wrapped_actions_block();
    if (actionsBlock) { /* Actions handled separately by bnglWorker */ return; }

    // energy_patterns_block and population_maps_block are less common, skip for now
  }

  // Parameters block
  visitParameters_block(ctx: Parser.Parameters_blockContext): void {
    for (const paramDef of ctx.parameter_def()) {
      this.visitParameter_def(paramDef);
    }
    // Resolve immediately so subsequent blocks (seed species) can use them
    this.resolveParameters();
  }

  // Parameter definition
  visitParameter_def(ctx: Parser.Parameter_defContext): void {
    try {
      const strings = ctx.STRING();
      let name = '';
      if (strings && strings.length > 0) {
        name = strings[0].text;
      }

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

    const nameNode = molDef.STRING();
    if (!nameNode) return;
    const name = nameNode.text;
    const components: string[] = [];

    const compListCtx = molDef.component_def_list();
    if (compListCtx) {
      for (const compDef of compListCtx.component_def()) {
        // component_def.STRING() returns single TerminalNode, not array
        const compNameNode = compDef.STRING();
        if (!compNameNode) continue;
        const compName = compNameNode.text;
        const stateList = compDef.state_list();
        if (stateList) {
          // state_list can contain both STRING and INT tokens (e.g., Y~0~P where 0 is INT and P is STRING)
          const stringNodes = stateList.STRING() as any[] || [];
          const intNodes = stateList.INT() as any[] || [];
          // Merge both arrays and extract text
          const allStateNodes = [...stringNodes, ...intNodes];
          const states = allStateNodes.map(s => s.text);
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
    for (const speciesDef of ctx.seed_species_def()) {
      this.visitSeed_species_def(speciesDef);
    }
  }

  visitSeed_species_def(ctx: Parser.Seed_species_defContext): void {
    const speciesDefCtx = ctx.species_def();
    if (!speciesDefCtx) return;

    let name = this.getSpeciesString(speciesDefCtx);

    // FIX: Check if seed_species_def matched a compartment prefix (AT STRING COLON)
    // This happens because the grammar allows the prefix in the parent rule
    if (ctx.AT()) {
      // Find the compartment name associated with AT
      // It's the STRING that comes after AT
      // We can scan children to be sure
      let foundAt = false;
      for (let i = 0; i < ctx.children!.length; i++) {
        const child = ctx.children![i];
        if (child.text === '@') {
          foundAt = true;
          continue;
        }
        if (foundAt) {
          // The next token/node should be the compartment name (or whitespace, but ANTLR tree usually has tokens)
          // If it's a TerminalNode with text, use it
          if (child.payload) { // check if it's a token
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

    this.species.push({ name, initialConcentration: concentration });
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

    const typeText = typeCtx.STRING()?.text?.toLowerCase() || 'molecules';
    const type: 'molecules' | 'species' = typeText === 'species' ? 'species' : 'molecules';

    // Get observable name - skip label if present
    const name = ctx.COLON() && strings.length >= 2 ? strings[1].text : strings[0].text;

    // Get patterns
    const patterns = patternListCtx.species_def().map(sd => this.getSpeciesString(sd));

    this.observables.push({ type, name, pattern: patterns.join(', ') });
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

    const name = labelCtx ? (labelCtx.STRING()?.text || labelCtx.INT()?.text) : undefined;

    // Get reactants
    const reactantSpecies = reactantCtx.species_def();
    const reactants = reactantSpecies.length > 0
      ? reactantSpecies.map(sd => this.getSpeciesString(sd))
      : ['0'];  // Null pattern

    // Get products
    const productSpecies = productCtx.species_def();
    const products = productSpecies.length > 0
      ? productSpecies.map(sd => this.getSpeciesString(sd))
      : ['0'];  // Null pattern

    // Get rate(s)
    const rateExpressions = rateLawCtx.expression();
    const rate = rateExpressions.length > 0 ? this.getExpressionText(rateExpressions[0]) : '0';
    const reverseRate = rateExpressions.length > 1 ? this.getExpressionText(rateExpressions[1]) : undefined;

    const isBidirectional = !!reactionSignCtx.BI_REACTION_SIGN();

    // Check modifiers (can be prefix or suffix, so we get an array)
    let deleteMolecules = false;
    const constraints: string[] = [];

    // rule_modifiers() returns an array in the new grammar
    const modifiersList = ctx.rule_modifiers();

    const processModifiers = (modifiersCtx: Parser.Rule_modifiersContext) => {
      if (modifiersCtx.DELETEMOLECULES() || modifiersCtx.MOVECONNECTED()) {
        deleteMolecules = true;
      }

      const getPatternListStr = (pl?: Parser.Pattern_listContext) => {
        return pl ? pl.species_def().map(sd => this.getSpeciesString(sd)).join(',') : '';
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
      // Note: MATCHONCE is valid but probably ignored by simulator currently
      // If needed: if (modifiersCtx.MATCHONCE()) ...
    };

    if (modifiersList && modifiersList.length > 0) {
      modifiersList.forEach(m => processModifiers(m));
    }

    this.reactionRules.push({
      name,
      reactants,
      products,
      rate,
      reverseRate,
      isBidirectional,
      deleteMolecules,
      constraints,
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

  // Actions block
  visitActions_block(ctx: Parser.Actions_blockContext): void {
    for (const cmd of ctx.action_command()) {
      this.visit(cmd);
    }
  }

  visitGenerate_network_cmd(ctx: Parser.Generate_network_cmdContext): void {
    const argsCtx = ctx.action_args();
    if (!argsCtx) return;

    const args = this.parseActionArgs(argsCtx);

    if (args.max_agg !== undefined) this.networkOptions!.maxAgg = parseInt(args.max_agg);
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

    if (args.method) {
      if (args.method === 'ssa') this.simulationOptions.method = 'ssa';
      else this.simulationOptions.method = 'ode';
    }
    if (args.t_end !== undefined) this.simulationOptions.t_end = parseFloat(args.t_end);
    if (args.n_steps !== undefined) this.simulationOptions.n_steps = parseInt(args.n_steps);
    if (args.atol !== undefined) this.simulationOptions.atol = parseFloat(args.atol);
    if (args.atoll !== undefined) this.simulationOptions.atol = parseFloat(args.atoll);
    if (args.rtol !== undefined) this.simulationOptions.rtol = parseFloat(args.rtol);
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
  private getSpeciesString(ctx: Parser.Species_defContext): string {
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


    const molecules = molPatterns.map(mp => {
      const nameNode = mp.STRING();
      if (!nameNode) return '';
      const name = nameNode.text;
      const compListCtx = mp.component_pattern_list();

      // If no component list, molecule has no components (e.g., "dead" or "I")
      if (!compListCtx) return name;


      // Filter out undefined/empty entries (from double commas ",,")
      const compPatterns = compListCtx.component_pattern().filter(cp => cp && cp.STRING());
      if (compPatterns.length === 0) return `${name}()`;

      const components = compPatterns.map(cp => {
        const compNode = cp.STRING();
        let comp = compNode ? compNode.text : '';

        const stateCtx = cp.state_value();
        if (stateCtx) {
          const stateStr = stateCtx.STRING()?.text;
          const qmark = stateCtx.QMARK();
          comp += `~${stateStr || (qmark ? '?' : '')}`;
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

      return `${name}(${components.join(',')})`;
    }).filter(m => m); // Filter out empty molecules

    // Handle compartment (AT STRING at end)
    const atCtx = ctx.AT();
    if (atCtx) {
      // The compartment name comes after the AT token
      // In the grammar: (AT STRING)?
      // We need to get the text after AT
      const fullText = ctx.text;
      const atIndex = fullText.indexOf('@');
      if (atIndex >= 0) {
      }
    }

    let res = prefix + molecules.join('.');

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
    try {
      const text = ctx.text;

      // Simple cases
      if (/^[0-9.eE+-]+$/.test(text)) {
        return parseFloat(text);
      }

      // If it's just a parameter reference
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text) && this.parameters[text] !== undefined) {
        return this.parameters[text];
      }

      // Try to substitute parameters and evaluate
      let expr = text;
      for (const [name, value] of Object.entries(this.parameters)) {
        expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
      }

      // Replace math constants
      expr = expr.replace(/\b_pi\b/g, String(Math.PI));
      expr = expr.replace(/\b_e\b/g, String(Math.E));

      // Replace math functions
      expr = expr.replace(/\bexp\(/g, 'Math.exp(');
      expr = expr.replace(/\bln\(/g, 'Math.log(');
      expr = expr.replace(/\blog10\(/g, 'Math.log10(');
      expr = expr.replace(/\bsqrt\(/g, 'Math.sqrt(');
      expr = expr.replace(/\babs\(/g, 'Math.abs(');
      expr = expr.replace(/\bsin\(/g, 'Math.sin(');
      expr = expr.replace(/\bcos\(/g, 'Math.cos(');
      expr = expr.replace(/\btan\(/g, 'Math.tan(');
      expr = expr.replace(/\bpow\(/g, 'Math.pow(');
      expr = expr.replace(/\^/g, '**');

      // Evaluate
      // eslint-disable-next-line no-new-func
      const result = new Function('return ' + expr)();
      if (typeof result !== 'number' || !isFinite(result)) {
        console.warn(`[BNGLVisitor] Expression '${ctx.text}' evaluated to non-numeric: ${result}`);
        return 0;
      }
      return result;
    } catch (e: any) {
      // MEDIUM BUG FIX: Warn instead of silently returning 0
      console.warn(`[BNGLVisitor] Failed to evaluate expression '${ctx.text}': ${e.message || e}`);
      return 0;
    }
  }
}
