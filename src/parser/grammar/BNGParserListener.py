# Generated from BNGParser.g4 by ANTLR 4.13.2
from antlr4 import *
if "." in __name__:
    from .BNGParser import BNGParser
else:
    from BNGParser import BNGParser

# This class defines a complete listener for a parse tree produced by BNGParser.
class BNGParserListener(ParseTreeListener):

    # Enter a parse tree produced by BNGParser#prog.
    def enterProg(self, ctx:BNGParser.ProgContext):
        pass

    # Exit a parse tree produced by BNGParser#prog.
    def exitProg(self, ctx:BNGParser.ProgContext):
        pass


    # Enter a parse tree produced by BNGParser#header_block.
    def enterHeader_block(self, ctx:BNGParser.Header_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#header_block.
    def exitHeader_block(self, ctx:BNGParser.Header_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#version_def.
    def enterVersion_def(self, ctx:BNGParser.Version_defContext):
        pass

    # Exit a parse tree produced by BNGParser#version_def.
    def exitVersion_def(self, ctx:BNGParser.Version_defContext):
        pass


    # Enter a parse tree produced by BNGParser#substance_def.
    def enterSubstance_def(self, ctx:BNGParser.Substance_defContext):
        pass

    # Exit a parse tree produced by BNGParser#substance_def.
    def exitSubstance_def(self, ctx:BNGParser.Substance_defContext):
        pass


    # Enter a parse tree produced by BNGParser#set_option.
    def enterSet_option(self, ctx:BNGParser.Set_optionContext):
        pass

    # Exit a parse tree produced by BNGParser#set_option.
    def exitSet_option(self, ctx:BNGParser.Set_optionContext):
        pass


    # Enter a parse tree produced by BNGParser#set_model_name.
    def enterSet_model_name(self, ctx:BNGParser.Set_model_nameContext):
        pass

    # Exit a parse tree produced by BNGParser#set_model_name.
    def exitSet_model_name(self, ctx:BNGParser.Set_model_nameContext):
        pass


    # Enter a parse tree produced by BNGParser#program_block.
    def enterProgram_block(self, ctx:BNGParser.Program_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#program_block.
    def exitProgram_block(self, ctx:BNGParser.Program_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#parameters_block.
    def enterParameters_block(self, ctx:BNGParser.Parameters_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#parameters_block.
    def exitParameters_block(self, ctx:BNGParser.Parameters_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#parameter_def.
    def enterParameter_def(self, ctx:BNGParser.Parameter_defContext):
        pass

    # Exit a parse tree produced by BNGParser#parameter_def.
    def exitParameter_def(self, ctx:BNGParser.Parameter_defContext):
        pass


    # Enter a parse tree produced by BNGParser#param_name.
    def enterParam_name(self, ctx:BNGParser.Param_nameContext):
        pass

    # Exit a parse tree produced by BNGParser#param_name.
    def exitParam_name(self, ctx:BNGParser.Param_nameContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_types_block.
    def enterMolecule_types_block(self, ctx:BNGParser.Molecule_types_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_types_block.
    def exitMolecule_types_block(self, ctx:BNGParser.Molecule_types_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_type_def.
    def enterMolecule_type_def(self, ctx:BNGParser.Molecule_type_defContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_type_def.
    def exitMolecule_type_def(self, ctx:BNGParser.Molecule_type_defContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_def.
    def enterMolecule_def(self, ctx:BNGParser.Molecule_defContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_def.
    def exitMolecule_def(self, ctx:BNGParser.Molecule_defContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_attributes.
    def enterMolecule_attributes(self, ctx:BNGParser.Molecule_attributesContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_attributes.
    def exitMolecule_attributes(self, ctx:BNGParser.Molecule_attributesContext):
        pass


    # Enter a parse tree produced by BNGParser#component_def_list.
    def enterComponent_def_list(self, ctx:BNGParser.Component_def_listContext):
        pass

    # Exit a parse tree produced by BNGParser#component_def_list.
    def exitComponent_def_list(self, ctx:BNGParser.Component_def_listContext):
        pass


    # Enter a parse tree produced by BNGParser#component_def.
    def enterComponent_def(self, ctx:BNGParser.Component_defContext):
        pass

    # Exit a parse tree produced by BNGParser#component_def.
    def exitComponent_def(self, ctx:BNGParser.Component_defContext):
        pass


    # Enter a parse tree produced by BNGParser#keyword_as_component_name.
    def enterKeyword_as_component_name(self, ctx:BNGParser.Keyword_as_component_nameContext):
        pass

    # Exit a parse tree produced by BNGParser#keyword_as_component_name.
    def exitKeyword_as_component_name(self, ctx:BNGParser.Keyword_as_component_nameContext):
        pass


    # Enter a parse tree produced by BNGParser#state_list.
    def enterState_list(self, ctx:BNGParser.State_listContext):
        pass

    # Exit a parse tree produced by BNGParser#state_list.
    def exitState_list(self, ctx:BNGParser.State_listContext):
        pass


    # Enter a parse tree produced by BNGParser#state_name.
    def enterState_name(self, ctx:BNGParser.State_nameContext):
        pass

    # Exit a parse tree produced by BNGParser#state_name.
    def exitState_name(self, ctx:BNGParser.State_nameContext):
        pass


    # Enter a parse tree produced by BNGParser#seed_species_block.
    def enterSeed_species_block(self, ctx:BNGParser.Seed_species_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#seed_species_block.
    def exitSeed_species_block(self, ctx:BNGParser.Seed_species_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#seed_species_def.
    def enterSeed_species_def(self, ctx:BNGParser.Seed_species_defContext):
        pass

    # Exit a parse tree produced by BNGParser#seed_species_def.
    def exitSeed_species_def(self, ctx:BNGParser.Seed_species_defContext):
        pass


    # Enter a parse tree produced by BNGParser#species_def.
    def enterSpecies_def(self, ctx:BNGParser.Species_defContext):
        pass

    # Exit a parse tree produced by BNGParser#species_def.
    def exitSpecies_def(self, ctx:BNGParser.Species_defContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_compartment.
    def enterMolecule_compartment(self, ctx:BNGParser.Molecule_compartmentContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_compartment.
    def exitMolecule_compartment(self, ctx:BNGParser.Molecule_compartmentContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_pattern.
    def enterMolecule_pattern(self, ctx:BNGParser.Molecule_patternContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_pattern.
    def exitMolecule_pattern(self, ctx:BNGParser.Molecule_patternContext):
        pass


    # Enter a parse tree produced by BNGParser#pattern_bond_wildcard.
    def enterPattern_bond_wildcard(self, ctx:BNGParser.Pattern_bond_wildcardContext):
        pass

    # Exit a parse tree produced by BNGParser#pattern_bond_wildcard.
    def exitPattern_bond_wildcard(self, ctx:BNGParser.Pattern_bond_wildcardContext):
        pass


    # Enter a parse tree produced by BNGParser#molecule_tag.
    def enterMolecule_tag(self, ctx:BNGParser.Molecule_tagContext):
        pass

    # Exit a parse tree produced by BNGParser#molecule_tag.
    def exitMolecule_tag(self, ctx:BNGParser.Molecule_tagContext):
        pass


    # Enter a parse tree produced by BNGParser#component_pattern_list.
    def enterComponent_pattern_list(self, ctx:BNGParser.Component_pattern_listContext):
        pass

    # Exit a parse tree produced by BNGParser#component_pattern_list.
    def exitComponent_pattern_list(self, ctx:BNGParser.Component_pattern_listContext):
        pass


    # Enter a parse tree produced by BNGParser#component_pattern.
    def enterComponent_pattern(self, ctx:BNGParser.Component_patternContext):
        pass

    # Exit a parse tree produced by BNGParser#component_pattern.
    def exitComponent_pattern(self, ctx:BNGParser.Component_patternContext):
        pass


    # Enter a parse tree produced by BNGParser#state_value.
    def enterState_value(self, ctx:BNGParser.State_valueContext):
        pass

    # Exit a parse tree produced by BNGParser#state_value.
    def exitState_value(self, ctx:BNGParser.State_valueContext):
        pass


    # Enter a parse tree produced by BNGParser#bond_spec.
    def enterBond_spec(self, ctx:BNGParser.Bond_specContext):
        pass

    # Exit a parse tree produced by BNGParser#bond_spec.
    def exitBond_spec(self, ctx:BNGParser.Bond_specContext):
        pass


    # Enter a parse tree produced by BNGParser#bond_id.
    def enterBond_id(self, ctx:BNGParser.Bond_idContext):
        pass

    # Exit a parse tree produced by BNGParser#bond_id.
    def exitBond_id(self, ctx:BNGParser.Bond_idContext):
        pass


    # Enter a parse tree produced by BNGParser#observables_block.
    def enterObservables_block(self, ctx:BNGParser.Observables_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#observables_block.
    def exitObservables_block(self, ctx:BNGParser.Observables_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#observable_def.
    def enterObservable_def(self, ctx:BNGParser.Observable_defContext):
        pass

    # Exit a parse tree produced by BNGParser#observable_def.
    def exitObservable_def(self, ctx:BNGParser.Observable_defContext):
        pass


    # Enter a parse tree produced by BNGParser#observable_type.
    def enterObservable_type(self, ctx:BNGParser.Observable_typeContext):
        pass

    # Exit a parse tree produced by BNGParser#observable_type.
    def exitObservable_type(self, ctx:BNGParser.Observable_typeContext):
        pass


    # Enter a parse tree produced by BNGParser#observable_pattern_list.
    def enterObservable_pattern_list(self, ctx:BNGParser.Observable_pattern_listContext):
        pass

    # Exit a parse tree produced by BNGParser#observable_pattern_list.
    def exitObservable_pattern_list(self, ctx:BNGParser.Observable_pattern_listContext):
        pass


    # Enter a parse tree produced by BNGParser#observable_pattern.
    def enterObservable_pattern(self, ctx:BNGParser.Observable_patternContext):
        pass

    # Exit a parse tree produced by BNGParser#observable_pattern.
    def exitObservable_pattern(self, ctx:BNGParser.Observable_patternContext):
        pass


    # Enter a parse tree produced by BNGParser#reaction_rules_block.
    def enterReaction_rules_block(self, ctx:BNGParser.Reaction_rules_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#reaction_rules_block.
    def exitReaction_rules_block(self, ctx:BNGParser.Reaction_rules_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#reaction_rule_def.
    def enterReaction_rule_def(self, ctx:BNGParser.Reaction_rule_defContext):
        pass

    # Exit a parse tree produced by BNGParser#reaction_rule_def.
    def exitReaction_rule_def(self, ctx:BNGParser.Reaction_rule_defContext):
        pass


    # Enter a parse tree produced by BNGParser#label_def.
    def enterLabel_def(self, ctx:BNGParser.Label_defContext):
        pass

    # Exit a parse tree produced by BNGParser#label_def.
    def exitLabel_def(self, ctx:BNGParser.Label_defContext):
        pass


    # Enter a parse tree produced by BNGParser#reactant_patterns.
    def enterReactant_patterns(self, ctx:BNGParser.Reactant_patternsContext):
        pass

    # Exit a parse tree produced by BNGParser#reactant_patterns.
    def exitReactant_patterns(self, ctx:BNGParser.Reactant_patternsContext):
        pass


    # Enter a parse tree produced by BNGParser#product_patterns.
    def enterProduct_patterns(self, ctx:BNGParser.Product_patternsContext):
        pass

    # Exit a parse tree produced by BNGParser#product_patterns.
    def exitProduct_patterns(self, ctx:BNGParser.Product_patternsContext):
        pass


    # Enter a parse tree produced by BNGParser#reaction_sign.
    def enterReaction_sign(self, ctx:BNGParser.Reaction_signContext):
        pass

    # Exit a parse tree produced by BNGParser#reaction_sign.
    def exitReaction_sign(self, ctx:BNGParser.Reaction_signContext):
        pass


    # Enter a parse tree produced by BNGParser#rate_law.
    def enterRate_law(self, ctx:BNGParser.Rate_lawContext):
        pass

    # Exit a parse tree produced by BNGParser#rate_law.
    def exitRate_law(self, ctx:BNGParser.Rate_lawContext):
        pass


    # Enter a parse tree produced by BNGParser#rule_modifiers.
    def enterRule_modifiers(self, ctx:BNGParser.Rule_modifiersContext):
        pass

    # Exit a parse tree produced by BNGParser#rule_modifiers.
    def exitRule_modifiers(self, ctx:BNGParser.Rule_modifiersContext):
        pass


    # Enter a parse tree produced by BNGParser#pattern_list.
    def enterPattern_list(self, ctx:BNGParser.Pattern_listContext):
        pass

    # Exit a parse tree produced by BNGParser#pattern_list.
    def exitPattern_list(self, ctx:BNGParser.Pattern_listContext):
        pass


    # Enter a parse tree produced by BNGParser#functions_block.
    def enterFunctions_block(self, ctx:BNGParser.Functions_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#functions_block.
    def exitFunctions_block(self, ctx:BNGParser.Functions_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#function_def.
    def enterFunction_def(self, ctx:BNGParser.Function_defContext):
        pass

    # Exit a parse tree produced by BNGParser#function_def.
    def exitFunction_def(self, ctx:BNGParser.Function_defContext):
        pass


    # Enter a parse tree produced by BNGParser#param_list.
    def enterParam_list(self, ctx:BNGParser.Param_listContext):
        pass

    # Exit a parse tree produced by BNGParser#param_list.
    def exitParam_list(self, ctx:BNGParser.Param_listContext):
        pass


    # Enter a parse tree produced by BNGParser#compartments_block.
    def enterCompartments_block(self, ctx:BNGParser.Compartments_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#compartments_block.
    def exitCompartments_block(self, ctx:BNGParser.Compartments_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#compartment_def.
    def enterCompartment_def(self, ctx:BNGParser.Compartment_defContext):
        pass

    # Exit a parse tree produced by BNGParser#compartment_def.
    def exitCompartment_def(self, ctx:BNGParser.Compartment_defContext):
        pass


    # Enter a parse tree produced by BNGParser#energy_patterns_block.
    def enterEnergy_patterns_block(self, ctx:BNGParser.Energy_patterns_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#energy_patterns_block.
    def exitEnergy_patterns_block(self, ctx:BNGParser.Energy_patterns_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#energy_pattern_def.
    def enterEnergy_pattern_def(self, ctx:BNGParser.Energy_pattern_defContext):
        pass

    # Exit a parse tree produced by BNGParser#energy_pattern_def.
    def exitEnergy_pattern_def(self, ctx:BNGParser.Energy_pattern_defContext):
        pass


    # Enter a parse tree produced by BNGParser#population_maps_block.
    def enterPopulation_maps_block(self, ctx:BNGParser.Population_maps_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#population_maps_block.
    def exitPopulation_maps_block(self, ctx:BNGParser.Population_maps_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#population_map_def.
    def enterPopulation_map_def(self, ctx:BNGParser.Population_map_defContext):
        pass

    # Exit a parse tree produced by BNGParser#population_map_def.
    def exitPopulation_map_def(self, ctx:BNGParser.Population_map_defContext):
        pass


    # Enter a parse tree produced by BNGParser#actions_block.
    def enterActions_block(self, ctx:BNGParser.Actions_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#actions_block.
    def exitActions_block(self, ctx:BNGParser.Actions_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#wrapped_actions_block.
    def enterWrapped_actions_block(self, ctx:BNGParser.Wrapped_actions_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#wrapped_actions_block.
    def exitWrapped_actions_block(self, ctx:BNGParser.Wrapped_actions_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#begin_actions_block.
    def enterBegin_actions_block(self, ctx:BNGParser.Begin_actions_blockContext):
        pass

    # Exit a parse tree produced by BNGParser#begin_actions_block.
    def exitBegin_actions_block(self, ctx:BNGParser.Begin_actions_blockContext):
        pass


    # Enter a parse tree produced by BNGParser#action_command.
    def enterAction_command(self, ctx:BNGParser.Action_commandContext):
        pass

    # Exit a parse tree produced by BNGParser#action_command.
    def exitAction_command(self, ctx:BNGParser.Action_commandContext):
        pass


    # Enter a parse tree produced by BNGParser#generate_network_cmd.
    def enterGenerate_network_cmd(self, ctx:BNGParser.Generate_network_cmdContext):
        pass

    # Exit a parse tree produced by BNGParser#generate_network_cmd.
    def exitGenerate_network_cmd(self, ctx:BNGParser.Generate_network_cmdContext):
        pass


    # Enter a parse tree produced by BNGParser#simulate_cmd.
    def enterSimulate_cmd(self, ctx:BNGParser.Simulate_cmdContext):
        pass

    # Exit a parse tree produced by BNGParser#simulate_cmd.
    def exitSimulate_cmd(self, ctx:BNGParser.Simulate_cmdContext):
        pass


    # Enter a parse tree produced by BNGParser#write_cmd.
    def enterWrite_cmd(self, ctx:BNGParser.Write_cmdContext):
        pass

    # Exit a parse tree produced by BNGParser#write_cmd.
    def exitWrite_cmd(self, ctx:BNGParser.Write_cmdContext):
        pass


    # Enter a parse tree produced by BNGParser#set_cmd.
    def enterSet_cmd(self, ctx:BNGParser.Set_cmdContext):
        pass

    # Exit a parse tree produced by BNGParser#set_cmd.
    def exitSet_cmd(self, ctx:BNGParser.Set_cmdContext):
        pass


    # Enter a parse tree produced by BNGParser#other_action_cmd.
    def enterOther_action_cmd(self, ctx:BNGParser.Other_action_cmdContext):
        pass

    # Exit a parse tree produced by BNGParser#other_action_cmd.
    def exitOther_action_cmd(self, ctx:BNGParser.Other_action_cmdContext):
        pass


    # Enter a parse tree produced by BNGParser#action_args.
    def enterAction_args(self, ctx:BNGParser.Action_argsContext):
        pass

    # Exit a parse tree produced by BNGParser#action_args.
    def exitAction_args(self, ctx:BNGParser.Action_argsContext):
        pass


    # Enter a parse tree produced by BNGParser#action_arg_list.
    def enterAction_arg_list(self, ctx:BNGParser.Action_arg_listContext):
        pass

    # Exit a parse tree produced by BNGParser#action_arg_list.
    def exitAction_arg_list(self, ctx:BNGParser.Action_arg_listContext):
        pass


    # Enter a parse tree produced by BNGParser#action_arg.
    def enterAction_arg(self, ctx:BNGParser.Action_argContext):
        pass

    # Exit a parse tree produced by BNGParser#action_arg.
    def exitAction_arg(self, ctx:BNGParser.Action_argContext):
        pass


    # Enter a parse tree produced by BNGParser#action_arg_value.
    def enterAction_arg_value(self, ctx:BNGParser.Action_arg_valueContext):
        pass

    # Exit a parse tree produced by BNGParser#action_arg_value.
    def exitAction_arg_value(self, ctx:BNGParser.Action_arg_valueContext):
        pass


    # Enter a parse tree produced by BNGParser#keyword_as_value.
    def enterKeyword_as_value(self, ctx:BNGParser.Keyword_as_valueContext):
        pass

    # Exit a parse tree produced by BNGParser#keyword_as_value.
    def exitKeyword_as_value(self, ctx:BNGParser.Keyword_as_valueContext):
        pass


    # Enter a parse tree produced by BNGParser#nested_hash_list.
    def enterNested_hash_list(self, ctx:BNGParser.Nested_hash_listContext):
        pass

    # Exit a parse tree produced by BNGParser#nested_hash_list.
    def exitNested_hash_list(self, ctx:BNGParser.Nested_hash_listContext):
        pass


    # Enter a parse tree produced by BNGParser#nested_hash_item.
    def enterNested_hash_item(self, ctx:BNGParser.Nested_hash_itemContext):
        pass

    # Exit a parse tree produced by BNGParser#nested_hash_item.
    def exitNested_hash_item(self, ctx:BNGParser.Nested_hash_itemContext):
        pass


    # Enter a parse tree produced by BNGParser#arg_name.
    def enterArg_name(self, ctx:BNGParser.Arg_nameContext):
        pass

    # Exit a parse tree produced by BNGParser#arg_name.
    def exitArg_name(self, ctx:BNGParser.Arg_nameContext):
        pass


    # Enter a parse tree produced by BNGParser#expression_list.
    def enterExpression_list(self, ctx:BNGParser.Expression_listContext):
        pass

    # Exit a parse tree produced by BNGParser#expression_list.
    def exitExpression_list(self, ctx:BNGParser.Expression_listContext):
        pass


    # Enter a parse tree produced by BNGParser#expression.
    def enterExpression(self, ctx:BNGParser.ExpressionContext):
        pass

    # Exit a parse tree produced by BNGParser#expression.
    def exitExpression(self, ctx:BNGParser.ExpressionContext):
        pass


    # Enter a parse tree produced by BNGParser#conditional_expr.
    def enterConditional_expr(self, ctx:BNGParser.Conditional_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#conditional_expr.
    def exitConditional_expr(self, ctx:BNGParser.Conditional_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#or_expr.
    def enterOr_expr(self, ctx:BNGParser.Or_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#or_expr.
    def exitOr_expr(self, ctx:BNGParser.Or_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#and_expr.
    def enterAnd_expr(self, ctx:BNGParser.And_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#and_expr.
    def exitAnd_expr(self, ctx:BNGParser.And_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#equality_expr.
    def enterEquality_expr(self, ctx:BNGParser.Equality_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#equality_expr.
    def exitEquality_expr(self, ctx:BNGParser.Equality_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#relational_expr.
    def enterRelational_expr(self, ctx:BNGParser.Relational_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#relational_expr.
    def exitRelational_expr(self, ctx:BNGParser.Relational_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#additive_expr.
    def enterAdditive_expr(self, ctx:BNGParser.Additive_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#additive_expr.
    def exitAdditive_expr(self, ctx:BNGParser.Additive_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#multiplicative_expr.
    def enterMultiplicative_expr(self, ctx:BNGParser.Multiplicative_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#multiplicative_expr.
    def exitMultiplicative_expr(self, ctx:BNGParser.Multiplicative_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#power_expr.
    def enterPower_expr(self, ctx:BNGParser.Power_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#power_expr.
    def exitPower_expr(self, ctx:BNGParser.Power_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#unary_expr.
    def enterUnary_expr(self, ctx:BNGParser.Unary_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#unary_expr.
    def exitUnary_expr(self, ctx:BNGParser.Unary_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#primary_expr.
    def enterPrimary_expr(self, ctx:BNGParser.Primary_exprContext):
        pass

    # Exit a parse tree produced by BNGParser#primary_expr.
    def exitPrimary_expr(self, ctx:BNGParser.Primary_exprContext):
        pass


    # Enter a parse tree produced by BNGParser#function_call.
    def enterFunction_call(self, ctx:BNGParser.Function_callContext):
        pass

    # Exit a parse tree produced by BNGParser#function_call.
    def exitFunction_call(self, ctx:BNGParser.Function_callContext):
        pass


    # Enter a parse tree produced by BNGParser#observable_ref.
    def enterObservable_ref(self, ctx:BNGParser.Observable_refContext):
        pass

    # Exit a parse tree produced by BNGParser#observable_ref.
    def exitObservable_ref(self, ctx:BNGParser.Observable_refContext):
        pass


    # Enter a parse tree produced by BNGParser#literal.
    def enterLiteral(self, ctx:BNGParser.LiteralContext):
        pass

    # Exit a parse tree produced by BNGParser#literal.
    def exitLiteral(self, ctx:BNGParser.LiteralContext):
        pass



del BNGParser