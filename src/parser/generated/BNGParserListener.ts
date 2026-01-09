// @ts-nocheck
// Generated from src/parser/grammar/BNGParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

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
import { Component_def_listContext } from "./BNGParser";
import { Component_defContext } from "./BNGParser";
import { State_listContext } from "./BNGParser";
import { State_nameContext } from "./BNGParser";
import { Seed_species_blockContext } from "./BNGParser";
import { Seed_species_defContext } from "./BNGParser";
import { Species_defContext } from "./BNGParser";
import { Molecule_patternContext } from "./BNGParser";
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
 * This interface defines a complete listener for a parse tree produced by
 * `BNGParser`.
 */
export interface BNGParserListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by `BNGParser.prog`.
	 * @param ctx the parse tree
	 */
	enterProg?: (ctx: ProgContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.prog`.
	 * @param ctx the parse tree
	 */
	exitProg?: (ctx: ProgContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.header_block`.
	 * @param ctx the parse tree
	 */
	enterHeader_block?: (ctx: Header_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.header_block`.
	 * @param ctx the parse tree
	 */
	exitHeader_block?: (ctx: Header_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.version_def`.
	 * @param ctx the parse tree
	 */
	enterVersion_def?: (ctx: Version_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.version_def`.
	 * @param ctx the parse tree
	 */
	exitVersion_def?: (ctx: Version_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.substance_def`.
	 * @param ctx the parse tree
	 */
	enterSubstance_def?: (ctx: Substance_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.substance_def`.
	 * @param ctx the parse tree
	 */
	exitSubstance_def?: (ctx: Substance_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.set_option`.
	 * @param ctx the parse tree
	 */
	enterSet_option?: (ctx: Set_optionContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.set_option`.
	 * @param ctx the parse tree
	 */
	exitSet_option?: (ctx: Set_optionContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.set_model_name`.
	 * @param ctx the parse tree
	 */
	enterSet_model_name?: (ctx: Set_model_nameContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.set_model_name`.
	 * @param ctx the parse tree
	 */
	exitSet_model_name?: (ctx: Set_model_nameContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.program_block`.
	 * @param ctx the parse tree
	 */
	enterProgram_block?: (ctx: Program_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.program_block`.
	 * @param ctx the parse tree
	 */
	exitProgram_block?: (ctx: Program_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.parameters_block`.
	 * @param ctx the parse tree
	 */
	enterParameters_block?: (ctx: Parameters_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.parameters_block`.
	 * @param ctx the parse tree
	 */
	exitParameters_block?: (ctx: Parameters_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.parameter_def`.
	 * @param ctx the parse tree
	 */
	enterParameter_def?: (ctx: Parameter_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.parameter_def`.
	 * @param ctx the parse tree
	 */
	exitParameter_def?: (ctx: Parameter_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.param_name`.
	 * @param ctx the parse tree
	 */
	enterParam_name?: (ctx: Param_nameContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.param_name`.
	 * @param ctx the parse tree
	 */
	exitParam_name?: (ctx: Param_nameContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.molecule_types_block`.
	 * @param ctx the parse tree
	 */
	enterMolecule_types_block?: (ctx: Molecule_types_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.molecule_types_block`.
	 * @param ctx the parse tree
	 */
	exitMolecule_types_block?: (ctx: Molecule_types_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.molecule_type_def`.
	 * @param ctx the parse tree
	 */
	enterMolecule_type_def?: (ctx: Molecule_type_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.molecule_type_def`.
	 * @param ctx the parse tree
	 */
	exitMolecule_type_def?: (ctx: Molecule_type_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.molecule_def`.
	 * @param ctx the parse tree
	 */
	enterMolecule_def?: (ctx: Molecule_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.molecule_def`.
	 * @param ctx the parse tree
	 */
	exitMolecule_def?: (ctx: Molecule_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.component_def_list`.
	 * @param ctx the parse tree
	 */
	enterComponent_def_list?: (ctx: Component_def_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.component_def_list`.
	 * @param ctx the parse tree
	 */
	exitComponent_def_list?: (ctx: Component_def_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.component_def`.
	 * @param ctx the parse tree
	 */
	enterComponent_def?: (ctx: Component_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.component_def`.
	 * @param ctx the parse tree
	 */
	exitComponent_def?: (ctx: Component_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.state_list`.
	 * @param ctx the parse tree
	 */
	enterState_list?: (ctx: State_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.state_list`.
	 * @param ctx the parse tree
	 */
	exitState_list?: (ctx: State_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.state_name`.
	 * @param ctx the parse tree
	 */
	enterState_name?: (ctx: State_nameContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.state_name`.
	 * @param ctx the parse tree
	 */
	exitState_name?: (ctx: State_nameContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.seed_species_block`.
	 * @param ctx the parse tree
	 */
	enterSeed_species_block?: (ctx: Seed_species_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.seed_species_block`.
	 * @param ctx the parse tree
	 */
	exitSeed_species_block?: (ctx: Seed_species_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.seed_species_def`.
	 * @param ctx the parse tree
	 */
	enterSeed_species_def?: (ctx: Seed_species_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.seed_species_def`.
	 * @param ctx the parse tree
	 */
	exitSeed_species_def?: (ctx: Seed_species_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.species_def`.
	 * @param ctx the parse tree
	 */
	enterSpecies_def?: (ctx: Species_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.species_def`.
	 * @param ctx the parse tree
	 */
	exitSpecies_def?: (ctx: Species_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.molecule_pattern`.
	 * @param ctx the parse tree
	 */
	enterMolecule_pattern?: (ctx: Molecule_patternContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.molecule_pattern`.
	 * @param ctx the parse tree
	 */
	exitMolecule_pattern?: (ctx: Molecule_patternContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.molecule_tag`.
	 * @param ctx the parse tree
	 */
	enterMolecule_tag?: (ctx: Molecule_tagContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.molecule_tag`.
	 * @param ctx the parse tree
	 */
	exitMolecule_tag?: (ctx: Molecule_tagContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.component_pattern_list`.
	 * @param ctx the parse tree
	 */
	enterComponent_pattern_list?: (ctx: Component_pattern_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.component_pattern_list`.
	 * @param ctx the parse tree
	 */
	exitComponent_pattern_list?: (ctx: Component_pattern_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.component_pattern`.
	 * @param ctx the parse tree
	 */
	enterComponent_pattern?: (ctx: Component_patternContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.component_pattern`.
	 * @param ctx the parse tree
	 */
	exitComponent_pattern?: (ctx: Component_patternContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.state_value`.
	 * @param ctx the parse tree
	 */
	enterState_value?: (ctx: State_valueContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.state_value`.
	 * @param ctx the parse tree
	 */
	exitState_value?: (ctx: State_valueContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.bond_spec`.
	 * @param ctx the parse tree
	 */
	enterBond_spec?: (ctx: Bond_specContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.bond_spec`.
	 * @param ctx the parse tree
	 */
	exitBond_spec?: (ctx: Bond_specContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.bond_id`.
	 * @param ctx the parse tree
	 */
	enterBond_id?: (ctx: Bond_idContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.bond_id`.
	 * @param ctx the parse tree
	 */
	exitBond_id?: (ctx: Bond_idContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observables_block`.
	 * @param ctx the parse tree
	 */
	enterObservables_block?: (ctx: Observables_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observables_block`.
	 * @param ctx the parse tree
	 */
	exitObservables_block?: (ctx: Observables_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observable_def`.
	 * @param ctx the parse tree
	 */
	enterObservable_def?: (ctx: Observable_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observable_def`.
	 * @param ctx the parse tree
	 */
	exitObservable_def?: (ctx: Observable_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observable_type`.
	 * @param ctx the parse tree
	 */
	enterObservable_type?: (ctx: Observable_typeContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observable_type`.
	 * @param ctx the parse tree
	 */
	exitObservable_type?: (ctx: Observable_typeContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observable_pattern_list`.
	 * @param ctx the parse tree
	 */
	enterObservable_pattern_list?: (ctx: Observable_pattern_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observable_pattern_list`.
	 * @param ctx the parse tree
	 */
	exitObservable_pattern_list?: (ctx: Observable_pattern_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observable_pattern`.
	 * @param ctx the parse tree
	 */
	enterObservable_pattern?: (ctx: Observable_patternContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observable_pattern`.
	 * @param ctx the parse tree
	 */
	exitObservable_pattern?: (ctx: Observable_patternContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.reaction_rules_block`.
	 * @param ctx the parse tree
	 */
	enterReaction_rules_block?: (ctx: Reaction_rules_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.reaction_rules_block`.
	 * @param ctx the parse tree
	 */
	exitReaction_rules_block?: (ctx: Reaction_rules_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.reaction_rule_def`.
	 * @param ctx the parse tree
	 */
	enterReaction_rule_def?: (ctx: Reaction_rule_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.reaction_rule_def`.
	 * @param ctx the parse tree
	 */
	exitReaction_rule_def?: (ctx: Reaction_rule_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.label_def`.
	 * @param ctx the parse tree
	 */
	enterLabel_def?: (ctx: Label_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.label_def`.
	 * @param ctx the parse tree
	 */
	exitLabel_def?: (ctx: Label_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.reactant_patterns`.
	 * @param ctx the parse tree
	 */
	enterReactant_patterns?: (ctx: Reactant_patternsContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.reactant_patterns`.
	 * @param ctx the parse tree
	 */
	exitReactant_patterns?: (ctx: Reactant_patternsContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.product_patterns`.
	 * @param ctx the parse tree
	 */
	enterProduct_patterns?: (ctx: Product_patternsContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.product_patterns`.
	 * @param ctx the parse tree
	 */
	exitProduct_patterns?: (ctx: Product_patternsContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.reaction_sign`.
	 * @param ctx the parse tree
	 */
	enterReaction_sign?: (ctx: Reaction_signContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.reaction_sign`.
	 * @param ctx the parse tree
	 */
	exitReaction_sign?: (ctx: Reaction_signContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.rate_law`.
	 * @param ctx the parse tree
	 */
	enterRate_law?: (ctx: Rate_lawContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.rate_law`.
	 * @param ctx the parse tree
	 */
	exitRate_law?: (ctx: Rate_lawContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.rule_modifiers`.
	 * @param ctx the parse tree
	 */
	enterRule_modifiers?: (ctx: Rule_modifiersContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.rule_modifiers`.
	 * @param ctx the parse tree
	 */
	exitRule_modifiers?: (ctx: Rule_modifiersContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.pattern_list`.
	 * @param ctx the parse tree
	 */
	enterPattern_list?: (ctx: Pattern_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.pattern_list`.
	 * @param ctx the parse tree
	 */
	exitPattern_list?: (ctx: Pattern_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.functions_block`.
	 * @param ctx the parse tree
	 */
	enterFunctions_block?: (ctx: Functions_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.functions_block`.
	 * @param ctx the parse tree
	 */
	exitFunctions_block?: (ctx: Functions_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.function_def`.
	 * @param ctx the parse tree
	 */
	enterFunction_def?: (ctx: Function_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.function_def`.
	 * @param ctx the parse tree
	 */
	exitFunction_def?: (ctx: Function_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.param_list`.
	 * @param ctx the parse tree
	 */
	enterParam_list?: (ctx: Param_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.param_list`.
	 * @param ctx the parse tree
	 */
	exitParam_list?: (ctx: Param_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.compartments_block`.
	 * @param ctx the parse tree
	 */
	enterCompartments_block?: (ctx: Compartments_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.compartments_block`.
	 * @param ctx the parse tree
	 */
	exitCompartments_block?: (ctx: Compartments_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.compartment_def`.
	 * @param ctx the parse tree
	 */
	enterCompartment_def?: (ctx: Compartment_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.compartment_def`.
	 * @param ctx the parse tree
	 */
	exitCompartment_def?: (ctx: Compartment_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.energy_patterns_block`.
	 * @param ctx the parse tree
	 */
	enterEnergy_patterns_block?: (ctx: Energy_patterns_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.energy_patterns_block`.
	 * @param ctx the parse tree
	 */
	exitEnergy_patterns_block?: (ctx: Energy_patterns_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.energy_pattern_def`.
	 * @param ctx the parse tree
	 */
	enterEnergy_pattern_def?: (ctx: Energy_pattern_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.energy_pattern_def`.
	 * @param ctx the parse tree
	 */
	exitEnergy_pattern_def?: (ctx: Energy_pattern_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.population_maps_block`.
	 * @param ctx the parse tree
	 */
	enterPopulation_maps_block?: (ctx: Population_maps_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.population_maps_block`.
	 * @param ctx the parse tree
	 */
	exitPopulation_maps_block?: (ctx: Population_maps_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.population_map_def`.
	 * @param ctx the parse tree
	 */
	enterPopulation_map_def?: (ctx: Population_map_defContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.population_map_def`.
	 * @param ctx the parse tree
	 */
	exitPopulation_map_def?: (ctx: Population_map_defContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.actions_block`.
	 * @param ctx the parse tree
	 */
	enterActions_block?: (ctx: Actions_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.actions_block`.
	 * @param ctx the parse tree
	 */
	exitActions_block?: (ctx: Actions_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.wrapped_actions_block`.
	 * @param ctx the parse tree
	 */
	enterWrapped_actions_block?: (ctx: Wrapped_actions_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.wrapped_actions_block`.
	 * @param ctx the parse tree
	 */
	exitWrapped_actions_block?: (ctx: Wrapped_actions_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.begin_actions_block`.
	 * @param ctx the parse tree
	 */
	enterBegin_actions_block?: (ctx: Begin_actions_blockContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.begin_actions_block`.
	 * @param ctx the parse tree
	 */
	exitBegin_actions_block?: (ctx: Begin_actions_blockContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.action_command`.
	 * @param ctx the parse tree
	 */
	enterAction_command?: (ctx: Action_commandContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.action_command`.
	 * @param ctx the parse tree
	 */
	exitAction_command?: (ctx: Action_commandContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.generate_network_cmd`.
	 * @param ctx the parse tree
	 */
	enterGenerate_network_cmd?: (ctx: Generate_network_cmdContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.generate_network_cmd`.
	 * @param ctx the parse tree
	 */
	exitGenerate_network_cmd?: (ctx: Generate_network_cmdContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.simulate_cmd`.
	 * @param ctx the parse tree
	 */
	enterSimulate_cmd?: (ctx: Simulate_cmdContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.simulate_cmd`.
	 * @param ctx the parse tree
	 */
	exitSimulate_cmd?: (ctx: Simulate_cmdContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.write_cmd`.
	 * @param ctx the parse tree
	 */
	enterWrite_cmd?: (ctx: Write_cmdContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.write_cmd`.
	 * @param ctx the parse tree
	 */
	exitWrite_cmd?: (ctx: Write_cmdContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.set_cmd`.
	 * @param ctx the parse tree
	 */
	enterSet_cmd?: (ctx: Set_cmdContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.set_cmd`.
	 * @param ctx the parse tree
	 */
	exitSet_cmd?: (ctx: Set_cmdContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.other_action_cmd`.
	 * @param ctx the parse tree
	 */
	enterOther_action_cmd?: (ctx: Other_action_cmdContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.other_action_cmd`.
	 * @param ctx the parse tree
	 */
	exitOther_action_cmd?: (ctx: Other_action_cmdContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.action_args`.
	 * @param ctx the parse tree
	 */
	enterAction_args?: (ctx: Action_argsContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.action_args`.
	 * @param ctx the parse tree
	 */
	exitAction_args?: (ctx: Action_argsContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.action_arg_list`.
	 * @param ctx the parse tree
	 */
	enterAction_arg_list?: (ctx: Action_arg_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.action_arg_list`.
	 * @param ctx the parse tree
	 */
	exitAction_arg_list?: (ctx: Action_arg_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.action_arg`.
	 * @param ctx the parse tree
	 */
	enterAction_arg?: (ctx: Action_argContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.action_arg`.
	 * @param ctx the parse tree
	 */
	exitAction_arg?: (ctx: Action_argContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.action_arg_value`.
	 * @param ctx the parse tree
	 */
	enterAction_arg_value?: (ctx: Action_arg_valueContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.action_arg_value`.
	 * @param ctx the parse tree
	 */
	exitAction_arg_value?: (ctx: Action_arg_valueContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.keyword_as_value`.
	 * @param ctx the parse tree
	 */
	enterKeyword_as_value?: (ctx: Keyword_as_valueContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.keyword_as_value`.
	 * @param ctx the parse tree
	 */
	exitKeyword_as_value?: (ctx: Keyword_as_valueContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.nested_hash_list`.
	 * @param ctx the parse tree
	 */
	enterNested_hash_list?: (ctx: Nested_hash_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.nested_hash_list`.
	 * @param ctx the parse tree
	 */
	exitNested_hash_list?: (ctx: Nested_hash_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.nested_hash_item`.
	 * @param ctx the parse tree
	 */
	enterNested_hash_item?: (ctx: Nested_hash_itemContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.nested_hash_item`.
	 * @param ctx the parse tree
	 */
	exitNested_hash_item?: (ctx: Nested_hash_itemContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.arg_name`.
	 * @param ctx the parse tree
	 */
	enterArg_name?: (ctx: Arg_nameContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.arg_name`.
	 * @param ctx the parse tree
	 */
	exitArg_name?: (ctx: Arg_nameContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.expression_list`.
	 * @param ctx the parse tree
	 */
	enterExpression_list?: (ctx: Expression_listContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.expression_list`.
	 * @param ctx the parse tree
	 */
	exitExpression_list?: (ctx: Expression_listContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.expression`.
	 * @param ctx the parse tree
	 */
	enterExpression?: (ctx: ExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.expression`.
	 * @param ctx the parse tree
	 */
	exitExpression?: (ctx: ExpressionContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.conditional_expr`.
	 * @param ctx the parse tree
	 */
	enterConditional_expr?: (ctx: Conditional_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.conditional_expr`.
	 * @param ctx the parse tree
	 */
	exitConditional_expr?: (ctx: Conditional_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.or_expr`.
	 * @param ctx the parse tree
	 */
	enterOr_expr?: (ctx: Or_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.or_expr`.
	 * @param ctx the parse tree
	 */
	exitOr_expr?: (ctx: Or_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.and_expr`.
	 * @param ctx the parse tree
	 */
	enterAnd_expr?: (ctx: And_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.and_expr`.
	 * @param ctx the parse tree
	 */
	exitAnd_expr?: (ctx: And_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.equality_expr`.
	 * @param ctx the parse tree
	 */
	enterEquality_expr?: (ctx: Equality_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.equality_expr`.
	 * @param ctx the parse tree
	 */
	exitEquality_expr?: (ctx: Equality_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.relational_expr`.
	 * @param ctx the parse tree
	 */
	enterRelational_expr?: (ctx: Relational_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.relational_expr`.
	 * @param ctx the parse tree
	 */
	exitRelational_expr?: (ctx: Relational_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.additive_expr`.
	 * @param ctx the parse tree
	 */
	enterAdditive_expr?: (ctx: Additive_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.additive_expr`.
	 * @param ctx the parse tree
	 */
	exitAdditive_expr?: (ctx: Additive_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.multiplicative_expr`.
	 * @param ctx the parse tree
	 */
	enterMultiplicative_expr?: (ctx: Multiplicative_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.multiplicative_expr`.
	 * @param ctx the parse tree
	 */
	exitMultiplicative_expr?: (ctx: Multiplicative_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.power_expr`.
	 * @param ctx the parse tree
	 */
	enterPower_expr?: (ctx: Power_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.power_expr`.
	 * @param ctx the parse tree
	 */
	exitPower_expr?: (ctx: Power_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.unary_expr`.
	 * @param ctx the parse tree
	 */
	enterUnary_expr?: (ctx: Unary_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.unary_expr`.
	 * @param ctx the parse tree
	 */
	exitUnary_expr?: (ctx: Unary_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.primary_expr`.
	 * @param ctx the parse tree
	 */
	enterPrimary_expr?: (ctx: Primary_exprContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.primary_expr`.
	 * @param ctx the parse tree
	 */
	exitPrimary_expr?: (ctx: Primary_exprContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.function_call`.
	 * @param ctx the parse tree
	 */
	enterFunction_call?: (ctx: Function_callContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.function_call`.
	 * @param ctx the parse tree
	 */
	exitFunction_call?: (ctx: Function_callContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.observable_ref`.
	 * @param ctx the parse tree
	 */
	enterObservable_ref?: (ctx: Observable_refContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.observable_ref`.
	 * @param ctx the parse tree
	 */
	exitObservable_ref?: (ctx: Observable_refContext) => void;

	/**
	 * Enter a parse tree produced by `BNGParser.literal`.
	 * @param ctx the parse tree
	 */
	enterLiteral?: (ctx: LiteralContext) => void;
	/**
	 * Exit a parse tree produced by `BNGParser.literal`.
	 * @param ctx the parse tree
	 */
	exitLiteral?: (ctx: LiteralContext) => void;
}

