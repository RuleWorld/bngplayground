# Generated from BNGParser.g4 by ANTLR 4.13.2
from antlr4 import *
if "." in __name__:
    from .BNGParser import BNGParser
else:
    from BNGParser import BNGParser

# This class defines a complete generic visitor for a parse tree produced by BNGParser.

class BNGParserVisitor(ParseTreeVisitor):

    # Visit a parse tree produced by BNGParser#prog.
    def visitProg(self, ctx:BNGParser.ProgContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#header_block.
    def visitHeader_block(self, ctx:BNGParser.Header_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#version_def.
    def visitVersion_def(self, ctx:BNGParser.Version_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#substance_def.
    def visitSubstance_def(self, ctx:BNGParser.Substance_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#set_option.
    def visitSet_option(self, ctx:BNGParser.Set_optionContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#set_model_name.
    def visitSet_model_name(self, ctx:BNGParser.Set_model_nameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#program_block.
    def visitProgram_block(self, ctx:BNGParser.Program_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#parameters_block.
    def visitParameters_block(self, ctx:BNGParser.Parameters_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#parameter_def.
    def visitParameter_def(self, ctx:BNGParser.Parameter_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#param_name.
    def visitParam_name(self, ctx:BNGParser.Param_nameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_types_block.
    def visitMolecule_types_block(self, ctx:BNGParser.Molecule_types_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_type_def.
    def visitMolecule_type_def(self, ctx:BNGParser.Molecule_type_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_def.
    def visitMolecule_def(self, ctx:BNGParser.Molecule_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_attributes.
    def visitMolecule_attributes(self, ctx:BNGParser.Molecule_attributesContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#component_def_list.
    def visitComponent_def_list(self, ctx:BNGParser.Component_def_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#component_def.
    def visitComponent_def(self, ctx:BNGParser.Component_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#keyword_as_component_name.
    def visitKeyword_as_component_name(self, ctx:BNGParser.Keyword_as_component_nameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#state_list.
    def visitState_list(self, ctx:BNGParser.State_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#state_name.
    def visitState_name(self, ctx:BNGParser.State_nameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#seed_species_block.
    def visitSeed_species_block(self, ctx:BNGParser.Seed_species_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#seed_species_def.
    def visitSeed_species_def(self, ctx:BNGParser.Seed_species_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#species_def.
    def visitSpecies_def(self, ctx:BNGParser.Species_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_compartment.
    def visitMolecule_compartment(self, ctx:BNGParser.Molecule_compartmentContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_pattern.
    def visitMolecule_pattern(self, ctx:BNGParser.Molecule_patternContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#pattern_bond_wildcard.
    def visitPattern_bond_wildcard(self, ctx:BNGParser.Pattern_bond_wildcardContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#molecule_tag.
    def visitMolecule_tag(self, ctx:BNGParser.Molecule_tagContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#component_pattern_list.
    def visitComponent_pattern_list(self, ctx:BNGParser.Component_pattern_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#component_pattern.
    def visitComponent_pattern(self, ctx:BNGParser.Component_patternContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#state_value.
    def visitState_value(self, ctx:BNGParser.State_valueContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#bond_spec.
    def visitBond_spec(self, ctx:BNGParser.Bond_specContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#bond_id.
    def visitBond_id(self, ctx:BNGParser.Bond_idContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observables_block.
    def visitObservables_block(self, ctx:BNGParser.Observables_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observable_def.
    def visitObservable_def(self, ctx:BNGParser.Observable_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observable_type.
    def visitObservable_type(self, ctx:BNGParser.Observable_typeContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observable_pattern_list.
    def visitObservable_pattern_list(self, ctx:BNGParser.Observable_pattern_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observable_pattern.
    def visitObservable_pattern(self, ctx:BNGParser.Observable_patternContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#reaction_rules_block.
    def visitReaction_rules_block(self, ctx:BNGParser.Reaction_rules_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#reaction_rule_def.
    def visitReaction_rule_def(self, ctx:BNGParser.Reaction_rule_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#label_def.
    def visitLabel_def(self, ctx:BNGParser.Label_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#reactant_patterns.
    def visitReactant_patterns(self, ctx:BNGParser.Reactant_patternsContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#product_patterns.
    def visitProduct_patterns(self, ctx:BNGParser.Product_patternsContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#reaction_sign.
    def visitReaction_sign(self, ctx:BNGParser.Reaction_signContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#rate_law.
    def visitRate_law(self, ctx:BNGParser.Rate_lawContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#rule_modifiers.
    def visitRule_modifiers(self, ctx:BNGParser.Rule_modifiersContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#pattern_list.
    def visitPattern_list(self, ctx:BNGParser.Pattern_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#functions_block.
    def visitFunctions_block(self, ctx:BNGParser.Functions_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#function_def.
    def visitFunction_def(self, ctx:BNGParser.Function_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#param_list.
    def visitParam_list(self, ctx:BNGParser.Param_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#compartments_block.
    def visitCompartments_block(self, ctx:BNGParser.Compartments_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#compartment_def.
    def visitCompartment_def(self, ctx:BNGParser.Compartment_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#energy_patterns_block.
    def visitEnergy_patterns_block(self, ctx:BNGParser.Energy_patterns_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#energy_pattern_def.
    def visitEnergy_pattern_def(self, ctx:BNGParser.Energy_pattern_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#population_maps_block.
    def visitPopulation_maps_block(self, ctx:BNGParser.Population_maps_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#population_map_def.
    def visitPopulation_map_def(self, ctx:BNGParser.Population_map_defContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#actions_block.
    def visitActions_block(self, ctx:BNGParser.Actions_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#wrapped_actions_block.
    def visitWrapped_actions_block(self, ctx:BNGParser.Wrapped_actions_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#begin_actions_block.
    def visitBegin_actions_block(self, ctx:BNGParser.Begin_actions_blockContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#action_command.
    def visitAction_command(self, ctx:BNGParser.Action_commandContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#generate_network_cmd.
    def visitGenerate_network_cmd(self, ctx:BNGParser.Generate_network_cmdContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#simulate_cmd.
    def visitSimulate_cmd(self, ctx:BNGParser.Simulate_cmdContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#write_cmd.
    def visitWrite_cmd(self, ctx:BNGParser.Write_cmdContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#set_cmd.
    def visitSet_cmd(self, ctx:BNGParser.Set_cmdContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#other_action_cmd.
    def visitOther_action_cmd(self, ctx:BNGParser.Other_action_cmdContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#action_args.
    def visitAction_args(self, ctx:BNGParser.Action_argsContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#action_arg_list.
    def visitAction_arg_list(self, ctx:BNGParser.Action_arg_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#action_arg.
    def visitAction_arg(self, ctx:BNGParser.Action_argContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#action_arg_value.
    def visitAction_arg_value(self, ctx:BNGParser.Action_arg_valueContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#keyword_as_value.
    def visitKeyword_as_value(self, ctx:BNGParser.Keyword_as_valueContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#nested_hash_list.
    def visitNested_hash_list(self, ctx:BNGParser.Nested_hash_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#nested_hash_item.
    def visitNested_hash_item(self, ctx:BNGParser.Nested_hash_itemContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#arg_name.
    def visitArg_name(self, ctx:BNGParser.Arg_nameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#expression_list.
    def visitExpression_list(self, ctx:BNGParser.Expression_listContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#expression.
    def visitExpression(self, ctx:BNGParser.ExpressionContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#conditional_expr.
    def visitConditional_expr(self, ctx:BNGParser.Conditional_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#or_expr.
    def visitOr_expr(self, ctx:BNGParser.Or_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#and_expr.
    def visitAnd_expr(self, ctx:BNGParser.And_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#equality_expr.
    def visitEquality_expr(self, ctx:BNGParser.Equality_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#relational_expr.
    def visitRelational_expr(self, ctx:BNGParser.Relational_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#additive_expr.
    def visitAdditive_expr(self, ctx:BNGParser.Additive_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#multiplicative_expr.
    def visitMultiplicative_expr(self, ctx:BNGParser.Multiplicative_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#power_expr.
    def visitPower_expr(self, ctx:BNGParser.Power_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#unary_expr.
    def visitUnary_expr(self, ctx:BNGParser.Unary_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#primary_expr.
    def visitPrimary_expr(self, ctx:BNGParser.Primary_exprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#function_call.
    def visitFunction_call(self, ctx:BNGParser.Function_callContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#observable_ref.
    def visitObservable_ref(self, ctx:BNGParser.Observable_refContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by BNGParser#literal.
    def visitLiteral(self, ctx:BNGParser.LiteralContext):
        return self.visitChildren(ctx)



del BNGParser