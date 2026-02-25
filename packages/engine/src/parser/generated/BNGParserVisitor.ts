// Generated from packages/engine/src/parser/grammar/BNGParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { ProgContext } from "./BNGParser";
import { Header_blockContext } from "./BNGParser";
import { Version_defContext } from "./BNGParser";
import { Substance_defContext } from "./BNGParser";
import { Set_optionContext } from "./BNGParser";
import { Set_model_nameContext } from "./BNGParser";
import { Program_blockContext } from "./BNGParser";
import { Parameters_blockContext } from "./BNGParser";
import { Parameter_defContext } from "./BNGParser";
import { Param_nameContext } from "./BNGParser";
import { Molecule_types_blockContext } from "./BNGParser";
import { Molecule_type_defContext } from "./BNGParser";
import { Molecule_defContext } from "./BNGParser";
import { Molecule_attributesContext } from "./BNGParser";
import { Component_def_listContext } from "./BNGParser";
import { Component_defContext } from "./BNGParser";
import { Keyword_as_component_nameContext } from "./BNGParser";
import { Keyword_as_mol_nameContext } from "./BNGParser";
import { State_listContext } from "./BNGParser";
import { State_nameContext } from "./BNGParser";
import { Seed_species_blockContext } from "./BNGParser";
import { Seed_species_defContext } from "./BNGParser";
import { Species_defContext } from "./BNGParser";
import { Molecule_compartmentContext } from "./BNGParser";
import { Molecule_patternContext } from "./BNGParser";
import { Pattern_bond_wildcardContext } from "./BNGParser";
import { Molecule_tagContext } from "./BNGParser";
import { Component_pattern_listContext } from "./BNGParser";
import { Component_patternContext } from "./BNGParser";
import { State_valueContext } from "./BNGParser";
import { Bond_specContext } from "./BNGParser";
import { Bond_idContext } from "./BNGParser";
import { Observables_blockContext } from "./BNGParser";
import { Observable_defContext } from "./BNGParser";
import { Observable_typeContext } from "./BNGParser";
import { Observable_pattern_listContext } from "./BNGParser";
import { Observable_patternContext } from "./BNGParser";
import { Reaction_rules_blockContext } from "./BNGParser";
import { Reaction_rule_defContext } from "./BNGParser";
import { Label_defContext } from "./BNGParser";
import { Reactant_patternsContext } from "./BNGParser";
import { Product_patternsContext } from "./BNGParser";
import { Reaction_signContext } from "./BNGParser";
import { Rate_lawContext } from "./BNGParser";
import { Rule_modifiersContext } from "./BNGParser";
import { Pattern_listContext } from "./BNGParser";
import { Functions_blockContext } from "./BNGParser";
import { Function_defContext } from "./BNGParser";
import { Param_listContext } from "./BNGParser";
import { Compartments_blockContext } from "./BNGParser";
import { Compartment_defContext } from "./BNGParser";
import { Energy_patterns_blockContext } from "./BNGParser";
import { Energy_pattern_defContext } from "./BNGParser";
import { Population_maps_blockContext } from "./BNGParser";
import { Population_map_defContext } from "./BNGParser";
import { Actions_blockContext } from "./BNGParser";
import { Wrapped_actions_blockContext } from "./BNGParser";
import { Begin_actions_blockContext } from "./BNGParser";
import { Action_commandContext } from "./BNGParser";
import { Generate_network_cmdContext } from "./BNGParser";
import { Simulate_cmdContext } from "./BNGParser";
import { Write_cmdContext } from "./BNGParser";
import { Set_cmdContext } from "./BNGParser";
import { Other_action_cmdContext } from "./BNGParser";
import { Action_argsContext } from "./BNGParser";
import { Action_arg_listContext } from "./BNGParser";
import { Action_argContext } from "./BNGParser";
import { Action_arg_valueContext } from "./BNGParser";
import { Keyword_as_valueContext } from "./BNGParser";
import { Nested_hash_listContext } from "./BNGParser";
import { Nested_hash_itemContext } from "./BNGParser";
import { Arg_nameContext } from "./BNGParser";
import { Expression_listContext } from "./BNGParser";
import { ExpressionContext } from "./BNGParser";
import { Conditional_exprContext } from "./BNGParser";
import { Or_exprContext } from "./BNGParser";
import { And_exprContext } from "./BNGParser";
import { Equality_exprContext } from "./BNGParser";
import { Relational_exprContext } from "./BNGParser";
import { Additive_exprContext } from "./BNGParser";
import { Multiplicative_exprContext } from "./BNGParser";
import { Power_exprContext } from "./BNGParser";
import { Unary_exprContext } from "./BNGParser";
import { Primary_exprContext } from "./BNGParser";
import { Function_callContext } from "./BNGParser";
import { Observable_refContext } from "./BNGParser";
import { LiteralContext } from "./BNGParser";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `BNGParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface BNGParserVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by `BNGParser.prog`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitProg?: (ctx: ProgContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.header_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitHeader_block?: (ctx: Header_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.version_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitVersion_def?: (ctx: Version_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.substance_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSubstance_def?: (ctx: Substance_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.set_option`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSet_option?: (ctx: Set_optionContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.set_model_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSet_model_name?: (ctx: Set_model_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.program_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitProgram_block?: (ctx: Program_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.parameters_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParameters_block?: (ctx: Parameters_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.parameter_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParameter_def?: (ctx: Parameter_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.param_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParam_name?: (ctx: Param_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_types_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_types_block?: (ctx: Molecule_types_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_type_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_type_def?: (ctx: Molecule_type_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_def?: (ctx: Molecule_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_attributes`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_attributes?: (ctx: Molecule_attributesContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.component_def_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitComponent_def_list?: (ctx: Component_def_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.component_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitComponent_def?: (ctx: Component_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.keyword_as_component_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitKeyword_as_component_name?: (ctx: Keyword_as_component_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.keyword_as_mol_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitKeyword_as_mol_name?: (ctx: Keyword_as_mol_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.state_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitState_list?: (ctx: State_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.state_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitState_name?: (ctx: State_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.seed_species_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSeed_species_block?: (ctx: Seed_species_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.seed_species_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSeed_species_def?: (ctx: Seed_species_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.species_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSpecies_def?: (ctx: Species_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_compartment`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_compartment?: (ctx: Molecule_compartmentContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_pattern`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_pattern?: (ctx: Molecule_patternContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.pattern_bond_wildcard`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPattern_bond_wildcard?: (ctx: Pattern_bond_wildcardContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.molecule_tag`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMolecule_tag?: (ctx: Molecule_tagContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.component_pattern_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitComponent_pattern_list?: (ctx: Component_pattern_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.component_pattern`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitComponent_pattern?: (ctx: Component_patternContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.state_value`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitState_value?: (ctx: State_valueContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.bond_spec`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBond_spec?: (ctx: Bond_specContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.bond_id`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBond_id?: (ctx: Bond_idContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observables_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservables_block?: (ctx: Observables_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observable_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservable_def?: (ctx: Observable_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observable_type`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservable_type?: (ctx: Observable_typeContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observable_pattern_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservable_pattern_list?: (ctx: Observable_pattern_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observable_pattern`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservable_pattern?: (ctx: Observable_patternContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.reaction_rules_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitReaction_rules_block?: (ctx: Reaction_rules_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.reaction_rule_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitReaction_rule_def?: (ctx: Reaction_rule_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.label_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitLabel_def?: (ctx: Label_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.reactant_patterns`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitReactant_patterns?: (ctx: Reactant_patternsContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.product_patterns`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitProduct_patterns?: (ctx: Product_patternsContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.reaction_sign`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitReaction_sign?: (ctx: Reaction_signContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.rate_law`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRate_law?: (ctx: Rate_lawContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.rule_modifiers`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRule_modifiers?: (ctx: Rule_modifiersContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.pattern_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPattern_list?: (ctx: Pattern_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.functions_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFunctions_block?: (ctx: Functions_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.function_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFunction_def?: (ctx: Function_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.param_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParam_list?: (ctx: Param_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.compartments_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCompartments_block?: (ctx: Compartments_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.compartment_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCompartment_def?: (ctx: Compartment_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.energy_patterns_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEnergy_patterns_block?: (ctx: Energy_patterns_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.energy_pattern_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEnergy_pattern_def?: (ctx: Energy_pattern_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.population_maps_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPopulation_maps_block?: (ctx: Population_maps_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.population_map_def`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPopulation_map_def?: (ctx: Population_map_defContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.actions_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActions_block?: (ctx: Actions_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.wrapped_actions_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWrapped_actions_block?: (ctx: Wrapped_actions_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.begin_actions_block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBegin_actions_block?: (ctx: Begin_actions_blockContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.action_command`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction_command?: (ctx: Action_commandContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.generate_network_cmd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitGenerate_network_cmd?: (ctx: Generate_network_cmdContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.simulate_cmd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSimulate_cmd?: (ctx: Simulate_cmdContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.write_cmd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWrite_cmd?: (ctx: Write_cmdContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.set_cmd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSet_cmd?: (ctx: Set_cmdContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.other_action_cmd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitOther_action_cmd?: (ctx: Other_action_cmdContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.action_args`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction_args?: (ctx: Action_argsContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.action_arg_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction_arg_list?: (ctx: Action_arg_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.action_arg`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction_arg?: (ctx: Action_argContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.action_arg_value`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction_arg_value?: (ctx: Action_arg_valueContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.keyword_as_value`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitKeyword_as_value?: (ctx: Keyword_as_valueContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.nested_hash_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitNested_hash_list?: (ctx: Nested_hash_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.nested_hash_item`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitNested_hash_item?: (ctx: Nested_hash_itemContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.arg_name`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitArg_name?: (ctx: Arg_nameContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.expression_list`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExpression_list?: (ctx: Expression_listContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.expression`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExpression?: (ctx: ExpressionContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.conditional_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConditional_expr?: (ctx: Conditional_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.or_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitOr_expr?: (ctx: Or_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.and_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAnd_expr?: (ctx: And_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.equality_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEquality_expr?: (ctx: Equality_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.relational_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRelational_expr?: (ctx: Relational_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.additive_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAdditive_expr?: (ctx: Additive_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.multiplicative_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMultiplicative_expr?: (ctx: Multiplicative_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.power_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPower_expr?: (ctx: Power_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.unary_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitUnary_expr?: (ctx: Unary_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.primary_expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPrimary_expr?: (ctx: Primary_exprContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.function_call`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFunction_call?: (ctx: Function_callContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.observable_ref`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitObservable_ref?: (ctx: Observable_refContext) => Result;

	/**
	 * Visit a parse tree produced by `BNGParser.literal`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitLiteral?: (ctx: LiteralContext) => Result;
}

