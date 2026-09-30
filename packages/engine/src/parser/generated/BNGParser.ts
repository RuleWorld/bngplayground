// Generated from /Users/akutuva/Documents/BioNetGen/julesplayground/packages/engine/src/parser/grammar/BNGParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { NotNull } from "antlr4ts/Decorators";
import { NoViableAltException } from "antlr4ts/NoViableAltException";
import { Override } from "antlr4ts/Decorators";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import { RecognitionException } from "antlr4ts/RecognitionException";
import { RuleContext } from "antlr4ts/RuleContext";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Token } from "antlr4ts/Token";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";

import { BNGParserListener } from "./BNGParserListener";
import { BNGParserVisitor } from "./BNGParserVisitor";


export class BNGParser extends Parser {
	public static readonly LINE_COMMENT = 1;
	public static readonly LB = 2;
	public static readonly WS = 3;
	public static readonly BEGIN = 4;
	public static readonly END = 5;
	public static readonly MODEL = 6;
	public static readonly PARAMETERS = 7;
	public static readonly COMPARTMENTS = 8;
	public static readonly MOLECULE = 9;
	public static readonly MOLECULES = 10;
	public static readonly COUNTER = 11;
	public static readonly TYPES = 12;
	public static readonly SEED = 13;
	public static readonly SPECIES = 14;
	public static readonly OBSERVABLES = 15;
	public static readonly FUNCTIONS = 16;
	public static readonly REACTION = 17;
	public static readonly REACTIONS = 18;
	public static readonly RULES = 19;
	public static readonly REACTION_RULES = 20;
	public static readonly MOLECULE_TYPES = 21;
	public static readonly GROUPS = 22;
	public static readonly ACTIONS = 23;
	public static readonly POPULATION = 24;
	public static readonly MAPS = 25;
	public static readonly ENERGY = 26;
	public static readonly PATTERNS = 27;
	public static readonly MOLECULAR = 28;
	public static readonly MATCHONCE = 29;
	public static readonly DELETEMOLECULES = 30;
	public static readonly MOVECONNECTED = 31;
	public static readonly INCLUDE_REACTANTS = 32;
	public static readonly INCLUDE_PRODUCTS = 33;
	public static readonly EXCLUDE_REACTANTS = 34;
	public static readonly EXCLUDE_PRODUCTS = 35;
	public static readonly TOTALRATE = 36;
	public static readonly VERSION = 37;
	public static readonly SET_OPTION = 38;
	public static readonly SET_MODEL_NAME = 39;
	public static readonly SUBSTANCEUNITS = 40;
	public static readonly PREFIX = 41;
	public static readonly SUFFIX = 42;
	public static readonly GENERATENETWORK = 43;
	public static readonly OVERWRITE = 44;
	public static readonly MAX_AGG = 45;
	public static readonly MAX_ITER = 46;
	public static readonly MAX_STOICH = 47;
	public static readonly PRINT_ITER = 48;
	public static readonly CHECK_ISO = 49;
	public static readonly GENERATEHYBRIDMODEL = 50;
	public static readonly SAFE = 51;
	public static readonly EXECUTE = 52;
	public static readonly SIMULATE = 53;
	public static readonly METHOD = 54;
	public static readonly ODE = 55;
	public static readonly SSA = 56;
	public static readonly PLA = 57;
	public static readonly NF = 58;
	public static readonly VERBOSE = 59;
	public static readonly NETFILE = 60;
	public static readonly ARGFILE = 61;
	public static readonly CONTINUE = 62;
	public static readonly T_START = 63;
	public static readonly T_END = 64;
	public static readonly N_STEPS = 65;
	public static readonly N_OUTPUT_STEPS = 66;
	public static readonly MAX_SIM_STEPS = 67;
	public static readonly OUTPUT_STEP_INTERVAL = 68;
	public static readonly SAMPLE_TIMES = 69;
	public static readonly SAVE_PROGRESS = 70;
	public static readonly PRINT_CDAT = 71;
	public static readonly PRINT_FUNCTIONS = 72;
	public static readonly PRINT_NET = 73;
	public static readonly PRINT_END = 74;
	public static readonly STOP_IF = 75;
	public static readonly PRINT_ON_STOP = 76;
	public static readonly SIMULATE_ODE = 77;
	public static readonly ATOL = 78;
	public static readonly RTOL = 79;
	public static readonly STEADY_STATE = 80;
	public static readonly SPARSE = 81;
	public static readonly SIMULATE_SSA = 82;
	public static readonly SIMULATE_PLA = 83;
	public static readonly PLA_CONFIG = 84;
	public static readonly PLA_OUTPUT = 85;
	public static readonly SIMULATE_NF = 86;
	public static readonly SIMULATE_RM = 87;
	public static readonly PARAM = 88;
	public static readonly COMPLEX = 89;
	public static readonly GET_FINAL_STATE = 90;
	public static readonly GML = 91;
	public static readonly NOCSLF = 92;
	public static readonly NOTF = 93;
	public static readonly BINARY_OUTPUT = 94;
	public static readonly UTL = 95;
	public static readonly EQUIL = 96;
	public static readonly PARAMETER_SCAN = 97;
	public static readonly BIFURCATE = 98;
	public static readonly PARAMETER = 99;
	public static readonly PAR_MIN = 100;
	public static readonly PAR_MAX = 101;
	public static readonly N_SCAN_PTS = 102;
	public static readonly LOG_SCALE = 103;
	public static readonly RESET_CONC = 104;
	public static readonly READFILE = 105;
	public static readonly FILE = 106;
	public static readonly ATOMIZE = 107;
	public static readonly BLOCKS = 108;
	public static readonly SKIPACTIONS = 109;
	public static readonly VISUALIZE = 110;
	public static readonly TYPE = 111;
	public static readonly BACKGROUND = 112;
	public static readonly COLLAPSE = 113;
	public static readonly OPTS = 114;
	public static readonly WRITESSC = 115;
	public static readonly WRITESSCCFG = 116;
	public static readonly FORMAT = 117;
	public static readonly WRITEFILE = 118;
	public static readonly WRITEMODEL = 119;
	public static readonly WRITEXML = 120;
	public static readonly WRITENETWORK = 121;
	public static readonly WRITESBML = 122;
	public static readonly WRITEMDL = 123;
	public static readonly WRITELATEX = 124;
	public static readonly INCLUDE_MODEL = 125;
	public static readonly INCLUDE_NETWORK = 126;
	public static readonly PRETTY_FORMATTING = 127;
	public static readonly EVALUATE_EXPRESSIONS = 128;
	public static readonly TEXTREACTION = 129;
	public static readonly TEXTSPECIES = 130;
	public static readonly WRITEMFILE = 131;
	public static readonly WRITEMEXFILE = 132;
	public static readonly BDF = 133;
	public static readonly MAX_STEP = 134;
	public static readonly MAXORDER = 135;
	public static readonly STATS = 136;
	public static readonly MAX_NUM_STEPS = 137;
	public static readonly MAX_ERR_TEST_FAILS = 138;
	public static readonly MAX_CONV_FAILS = 139;
	public static readonly STIFF = 140;
	public static readonly SETCONCENTRATION = 141;
	public static readonly ADDCONCENTRATION = 142;
	public static readonly SAVECONCENTRATIONS = 143;
	public static readonly RESETCONCENTRATIONS = 144;
	public static readonly SETPARAMETER = 145;
	public static readonly SAVEPARAMETERS = 146;
	public static readonly RESETPARAMETERS = 147;
	public static readonly SETVOLUME = 148;
	public static readonly SIMULATE_PSA = 149;
	public static readonly QUIT = 150;
	public static readonly TRUE = 151;
	public static readonly FALSE = 152;
	public static readonly SAT = 153;
	public static readonly MM = 154;
	public static readonly HILL = 155;
	public static readonly ARRHENIUS = 156;
	public static readonly MRATIO = 157;
	public static readonly TFUN = 158;
	public static readonly FUNCTIONPRODUCT = 159;
	public static readonly PRIORITY = 160;
	public static readonly IF = 161;
	public static readonly EXP = 162;
	public static readonly LN = 163;
	public static readonly LOG10 = 164;
	public static readonly LOG2 = 165;
	public static readonly SQRT = 166;
	public static readonly RINT = 167;
	public static readonly ABS = 168;
	public static readonly SIN = 169;
	public static readonly COS = 170;
	public static readonly TAN = 171;
	public static readonly ASIN = 172;
	public static readonly ACOS = 173;
	public static readonly ATAN = 174;
	public static readonly SINH = 175;
	public static readonly COSH = 176;
	public static readonly TANH = 177;
	public static readonly ASINH = 178;
	public static readonly ACOSH = 179;
	public static readonly ATANH = 180;
	public static readonly PI = 181;
	public static readonly EULERIAN = 182;
	public static readonly MIN = 183;
	public static readonly MAX = 184;
	public static readonly SUM = 185;
	public static readonly AVG = 186;
	public static readonly TIME = 187;
	public static readonly FLOAT = 188;
	public static readonly INT = 189;
	public static readonly STRING = 190;
	public static readonly SEMI = 191;
	public static readonly COLON = 192;
	public static readonly LSBRACKET = 193;
	public static readonly RSBRACKET = 194;
	public static readonly LBRACKET = 195;
	public static readonly RBRACKET = 196;
	public static readonly COMMA = 197;
	public static readonly DOT = 198;
	public static readonly LPAREN = 199;
	public static readonly RPAREN = 200;
	public static readonly UNI_REACTION_SIGN = 201;
	public static readonly BI_REACTION_SIGN = 202;
	public static readonly DOLLAR = 203;
	public static readonly TILDE = 204;
	public static readonly AT = 205;
	public static readonly GTE = 206;
	public static readonly GT = 207;
	public static readonly LTE = 208;
	public static readonly LT = 209;
	public static readonly ASSIGNS = 210;
	public static readonly EQUALS = 211;
	public static readonly NOT_EQUALS = 212;
	public static readonly BECOMES = 213;
	public static readonly LOGICAL_AND = 214;
	public static readonly LOGICAL_OR = 215;
	public static readonly DIV = 216;
	public static readonly TIMES = 217;
	public static readonly MINUS = 218;
	public static readonly PLUS = 219;
	public static readonly POWER = 220;
	public static readonly MOLECULE_TAG_TOKEN = 221;
	public static readonly MOD = 222;
	public static readonly PIPE = 223;
	public static readonly QMARK = 224;
	public static readonly EMARK = 225;
	public static readonly DBQUOTES = 226;
	public static readonly SQUOTE = 227;
	public static readonly AMPERSAND = 228;
	public static readonly VERSION_NUMBER = 229;
	public static readonly ULB = 230;
	public static readonly RULE_prog = 0;
	public static readonly RULE_header_block = 1;
	public static readonly RULE_version_def = 2;
	public static readonly RULE_substance_def = 3;
	public static readonly RULE_set_option = 4;
	public static readonly RULE_set_model_name = 5;
	public static readonly RULE_program_block = 6;
	public static readonly RULE_parameters_block = 7;
	public static readonly RULE_parameter_def = 8;
	public static readonly RULE_param_name = 9;
	public static readonly RULE_molecule_types_block = 10;
	public static readonly RULE_molecule_type_def = 11;
	public static readonly RULE_molecule_def = 12;
	public static readonly RULE_molecule_attributes = 13;
	public static readonly RULE_component_def_list = 14;
	public static readonly RULE_component_def = 15;
	public static readonly RULE_keyword_as_component_name = 16;
	public static readonly RULE_keyword_as_mol_name = 17;
	public static readonly RULE_state_list = 18;
	public static readonly RULE_state_name = 19;
	public static readonly RULE_seed_species_block = 20;
	public static readonly RULE_seed_species_def = 21;
	public static readonly RULE_species_def = 22;
	public static readonly RULE_molecule_compartment = 23;
	public static readonly RULE_molecule_pattern = 24;
	public static readonly RULE_scope_prefix = 25;
	public static readonly RULE_pattern_bond_wildcard = 26;
	public static readonly RULE_molecule_tag = 27;
	public static readonly RULE_component_pattern_list = 28;
	public static readonly RULE_component_pattern = 29;
	public static readonly RULE_component_label = 30;
	public static readonly RULE_state_value = 31;
	public static readonly RULE_bond_spec = 32;
	public static readonly RULE_bond_id = 33;
	public static readonly RULE_observables_block = 34;
	public static readonly RULE_observable_def = 35;
	public static readonly RULE_observable_type = 36;
	public static readonly RULE_observable_pattern_list = 37;
	public static readonly RULE_observable_pattern = 38;
	public static readonly RULE_reaction_rules_block = 39;
	public static readonly RULE_reaction_rule_def = 40;
	public static readonly RULE_label_def = 41;
	public static readonly RULE_reactant_patterns = 42;
	public static readonly RULE_product_patterns = 43;
	public static readonly RULE_reaction_sign = 44;
	public static readonly RULE_rate_law = 45;
	public static readonly RULE_rule_modifiers = 46;
	public static readonly RULE_pattern_list = 47;
	public static readonly RULE_functions_block = 48;
	public static readonly RULE_function_def = 49;
	public static readonly RULE_param_list = 50;
	public static readonly RULE_compartments_block = 51;
	public static readonly RULE_compartment_def = 52;
	public static readonly RULE_energy_patterns_block = 53;
	public static readonly RULE_energy_pattern_def = 54;
	public static readonly RULE_population_maps_block = 55;
	public static readonly RULE_population_map_def = 56;
	public static readonly RULE_population_types_block = 57;
	public static readonly RULE_population_type_def = 58;
	public static readonly RULE_actions_block = 59;
	public static readonly RULE_wrapped_actions_block = 60;
	public static readonly RULE_begin_actions_block = 61;
	public static readonly RULE_action_command = 62;
	public static readonly RULE_generate_network_cmd = 63;
	public static readonly RULE_generate_hybrid_model_cmd = 64;
	public static readonly RULE_simulate_cmd = 65;
	public static readonly RULE_write_cmd = 66;
	public static readonly RULE_set_cmd = 67;
	public static readonly RULE_other_action_cmd = 68;
	public static readonly RULE_set_option_cmd = 69;
	public static readonly RULE_action_args = 70;
	public static readonly RULE_action_arg_list = 71;
	public static readonly RULE_action_arg = 72;
	public static readonly RULE_action_arg_value = 73;
	public static readonly RULE_keyword_as_value = 74;
	public static readonly RULE_nested_hash_list = 75;
	public static readonly RULE_nested_hash_item = 76;
	public static readonly RULE_arg_name = 77;
	public static readonly RULE_expression_list = 78;
	public static readonly RULE_expression = 79;
	public static readonly RULE_conditional_expr = 80;
	public static readonly RULE_or_expr = 81;
	public static readonly RULE_and_expr = 82;
	public static readonly RULE_equality_expr = 83;
	public static readonly RULE_relational_expr = 84;
	public static readonly RULE_additive_expr = 85;
	public static readonly RULE_multiplicative_expr = 86;
	public static readonly RULE_power_expr = 87;
	public static readonly RULE_unary_expr = 88;
	public static readonly RULE_primary_expr = 89;
	public static readonly RULE_function_call = 90;
	public static readonly RULE_observable_ref = 91;
	public static readonly RULE_literal = 92;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"prog", "header_block", "version_def", "substance_def", "set_option", 
		"set_model_name", "program_block", "parameters_block", "parameter_def", 
		"param_name", "molecule_types_block", "molecule_type_def", "molecule_def", 
		"molecule_attributes", "component_def_list", "component_def", "keyword_as_component_name", 
		"keyword_as_mol_name", "state_list", "state_name", "seed_species_block", 
		"seed_species_def", "species_def", "molecule_compartment", "molecule_pattern", 
		"scope_prefix", "pattern_bond_wildcard", "molecule_tag", "component_pattern_list", 
		"component_pattern", "component_label", "state_value", "bond_spec", "bond_id", 
		"observables_block", "observable_def", "observable_type", "observable_pattern_list", 
		"observable_pattern", "reaction_rules_block", "reaction_rule_def", "label_def", 
		"reactant_patterns", "product_patterns", "reaction_sign", "rate_law", 
		"rule_modifiers", "pattern_list", "functions_block", "function_def", "param_list", 
		"compartments_block", "compartment_def", "energy_patterns_block", "energy_pattern_def", 
		"population_maps_block", "population_map_def", "population_types_block", 
		"population_type_def", "actions_block", "wrapped_actions_block", "begin_actions_block", 
		"action_command", "generate_network_cmd", "generate_hybrid_model_cmd", 
		"simulate_cmd", "write_cmd", "set_cmd", "other_action_cmd", "set_option_cmd", 
		"action_args", "action_arg_list", "action_arg", "action_arg_value", "keyword_as_value", 
		"nested_hash_list", "nested_hash_item", "arg_name", "expression_list", 
		"expression", "conditional_expr", "or_expr", "and_expr", "equality_expr", 
		"relational_expr", "additive_expr", "multiplicative_expr", "power_expr", 
		"unary_expr", "primary_expr", "function_call", "observable_ref", "literal",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, "'begin'", "'end'", "'model'", 
		"'parameters'", "'compartments'", undefined, undefined, "'Counter'", "'types'", 
		"'seed'", undefined, "'observables'", "'functions'", "'reaction'", undefined, 
		"'rules'", "'reaction_rules'", "'molecule_types'", "'groups'", "'actions'", 
		"'population'", "'maps'", "'energy'", "'patterns'", "'molecular'", "'MatchOnce'", 
		"'DeleteMolecules'", "'MoveConnected'", "'include_reactants'", "'include_products'", 
		"'exclude_reactants'", "'exclude_products'", "'TotalRate'", "'version'", 
		"'setOption'", "'setModelName'", "'substanceUnits'", "'prefix'", "'suffix'", 
		"'generate_network'", "'overwrite'", "'max_agg'", "'max_iter'", "'max_stoich'", 
		"'print_iter'", "'check_iso'", "'generate_hybrid_model'", "'safe'", "'execute'", 
		"'simulate'", "'method'", "'ode'", "'ssa'", "'pla'", "'nf'", "'verbose'", 
		"'netfile'", "'argfile'", "'continue'", "'t_start'", "'t_end'", "'n_steps'", 
		"'n_output_steps'", "'max_sim_steps'", "'output_step_interval'", "'sample_times'", 
		"'save_progress'", "'print_CDAT'", "'print_functions'", "'print_net'", 
		"'print_end'", "'stop_if'", "'print_on_stop'", "'simulate_ode'", "'atol'", 
		"'rtol'", "'steady_state'", "'sparse'", "'simulate_ssa'", "'simulate_pla'", 
		"'pla_config'", "'pla_output'", "'simulate_nf'", "'simulate_rm'", "'param'", 
		"'complex'", "'get_final_state'", "'gml'", "'nocslf'", "'notf'", "'binary_output'", 
		"'utl'", "'equil'", "'parameter_scan'", "'bifurcate'", "'parameter'", 
		"'par_min'", "'par_max'", "'n_scan_pts'", "'log_scale'", "'reset_conc'", 
		"'readFile'", "'file'", "'atomize'", "'blocks'", "'skip_actions'", "'visualize'", 
		"'type'", "'background'", "'collapse'", "'opts'", "'writeSSC'", "'writeSSCcfg'", 
		"'format'", "'writeFile'", "'writeModel'", "'writeXML'", "'writeNetwork'", 
		"'writeSBML'", "'writeMDL'", "'writeLatex'", "'include_model'", "'include_network'", 
		"'pretty_formatting'", "'evaluate_expressions'", "'TextReaction'", "'TextSpecies'", 
		"'writeMfile'", "'writeMexfile'", "'bdf'", "'max_step'", "'maxOrder'", 
		"'stats'", "'max_num_steps'", "'max_err_test_fails'", "'max_conv_fails'", 
		"'stiff'", "'setConcentration'", "'addConcentration'", "'saveConcentrations'", 
		"'resetConcentrations'", "'setParameter'", "'saveParameters'", "'resetParameters'", 
		"'setVolume'", "'simulate_psa'", "'quit'", "'true'", "'false'", "'Sat'", 
		"'MM'", "'Hill'", "'Arrhenius'", "'mratio'", "'TFUN'", "'FunctionProduct'", 
		"'priority'", "'if'", "'exp'", "'ln'", "'log10'", "'log2'", "'sqrt'", 
		"'rint'", "'abs'", "'sin'", "'cos'", "'tan'", "'asin'", "'acos'", "'atan'", 
		"'sinh'", "'cosh'", "'tanh'", "'asinh'", "'acosh'", "'atanh'", "'_pi'", 
		"'_e'", "'min'", "'max'", "'sum'", "'avg'", "'time'", undefined, undefined, 
		undefined, "';'", "':'", "'['", "']'", "'{'", "'}'", "','", "'.'", "'('", 
		"')'", "'->'", "'<->'", "'$'", "'~'", "'@'", "'>='", "'>'", "'<='", "'<'", 
		"'=>'", "'=='", undefined, "'='", "'&&'", "'||'", "'/'", "'*'", "'-'", 
		"'+'", undefined, undefined, "'%'", "'|'", "'?'", "'!'", "'\"'", "'''", 
		"'&'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "LINE_COMMENT", "LB", "WS", "BEGIN", "END", "MODEL", "PARAMETERS", 
		"COMPARTMENTS", "MOLECULE", "MOLECULES", "COUNTER", "TYPES", "SEED", "SPECIES", 
		"OBSERVABLES", "FUNCTIONS", "REACTION", "REACTIONS", "RULES", "REACTION_RULES", 
		"MOLECULE_TYPES", "GROUPS", "ACTIONS", "POPULATION", "MAPS", "ENERGY", 
		"PATTERNS", "MOLECULAR", "MATCHONCE", "DELETEMOLECULES", "MOVECONNECTED", 
		"INCLUDE_REACTANTS", "INCLUDE_PRODUCTS", "EXCLUDE_REACTANTS", "EXCLUDE_PRODUCTS", 
		"TOTALRATE", "VERSION", "SET_OPTION", "SET_MODEL_NAME", "SUBSTANCEUNITS", 
		"PREFIX", "SUFFIX", "GENERATENETWORK", "OVERWRITE", "MAX_AGG", "MAX_ITER", 
		"MAX_STOICH", "PRINT_ITER", "CHECK_ISO", "GENERATEHYBRIDMODEL", "SAFE", 
		"EXECUTE", "SIMULATE", "METHOD", "ODE", "SSA", "PLA", "NF", "VERBOSE", 
		"NETFILE", "ARGFILE", "CONTINUE", "T_START", "T_END", "N_STEPS", "N_OUTPUT_STEPS", 
		"MAX_SIM_STEPS", "OUTPUT_STEP_INTERVAL", "SAMPLE_TIMES", "SAVE_PROGRESS", 
		"PRINT_CDAT", "PRINT_FUNCTIONS", "PRINT_NET", "PRINT_END", "STOP_IF", 
		"PRINT_ON_STOP", "SIMULATE_ODE", "ATOL", "RTOL", "STEADY_STATE", "SPARSE", 
		"SIMULATE_SSA", "SIMULATE_PLA", "PLA_CONFIG", "PLA_OUTPUT", "SIMULATE_NF", 
		"SIMULATE_RM", "PARAM", "COMPLEX", "GET_FINAL_STATE", "GML", "NOCSLF", 
		"NOTF", "BINARY_OUTPUT", "UTL", "EQUIL", "PARAMETER_SCAN", "BIFURCATE", 
		"PARAMETER", "PAR_MIN", "PAR_MAX", "N_SCAN_PTS", "LOG_SCALE", "RESET_CONC", 
		"READFILE", "FILE", "ATOMIZE", "BLOCKS", "SKIPACTIONS", "VISUALIZE", "TYPE", 
		"BACKGROUND", "COLLAPSE", "OPTS", "WRITESSC", "WRITESSCCFG", "FORMAT", 
		"WRITEFILE", "WRITEMODEL", "WRITEXML", "WRITENETWORK", "WRITESBML", "WRITEMDL", 
		"WRITELATEX", "INCLUDE_MODEL", "INCLUDE_NETWORK", "PRETTY_FORMATTING", 
		"EVALUATE_EXPRESSIONS", "TEXTREACTION", "TEXTSPECIES", "WRITEMFILE", "WRITEMEXFILE", 
		"BDF", "MAX_STEP", "MAXORDER", "STATS", "MAX_NUM_STEPS", "MAX_ERR_TEST_FAILS", 
		"MAX_CONV_FAILS", "STIFF", "SETCONCENTRATION", "ADDCONCENTRATION", "SAVECONCENTRATIONS", 
		"RESETCONCENTRATIONS", "SETPARAMETER", "SAVEPARAMETERS", "RESETPARAMETERS", 
		"SETVOLUME", "SIMULATE_PSA", "QUIT", "TRUE", "FALSE", "SAT", "MM", "HILL", 
		"ARRHENIUS", "MRATIO", "TFUN", "FUNCTIONPRODUCT", "PRIORITY", "IF", "EXP", 
		"LN", "LOG10", "LOG2", "SQRT", "RINT", "ABS", "SIN", "COS", "TAN", "ASIN", 
		"ACOS", "ATAN", "SINH", "COSH", "TANH", "ASINH", "ACOSH", "ATANH", "PI", 
		"EULERIAN", "MIN", "MAX", "SUM", "AVG", "TIME", "FLOAT", "INT", "STRING", 
		"SEMI", "COLON", "LSBRACKET", "RSBRACKET", "LBRACKET", "RBRACKET", "COMMA", 
		"DOT", "LPAREN", "RPAREN", "UNI_REACTION_SIGN", "BI_REACTION_SIGN", "DOLLAR", 
		"TILDE", "AT", "GTE", "GT", "LTE", "LT", "ASSIGNS", "EQUALS", "NOT_EQUALS", 
		"BECOMES", "LOGICAL_AND", "LOGICAL_OR", "DIV", "TIMES", "MINUS", "PLUS", 
		"POWER", "MOLECULE_TAG_TOKEN", "MOD", "PIPE", "QMARK", "EMARK", "DBQUOTES", 
		"SQUOTE", "AMPERSAND", "VERSION_NUMBER", "ULB",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(BNGParser._LITERAL_NAMES, BNGParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return BNGParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "BNGParser.g4"; }

	// @Override
	public get ruleNames(): string[] { return BNGParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return BNGParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(BNGParser._ATN, this);
	}
	// @RuleVersion(0)
	public prog(): ProgContext {
		let _localctx: ProgContext = new ProgContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, BNGParser.RULE_prog);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 189;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 186;
				this.match(BNGParser.LB);
				}
				}
				this.state = 191;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 196;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					this.state = 194;
					this._errHandler.sync(this);
					switch ( this.interpreter.adaptivePredict(this._input, 1, this._ctx) ) {
					case 1:
						{
						this.state = 192;
						this.header_block();
						}
						break;

					case 2:
						{
						this.state = 193;
						this.action_command();
						}
						break;
					}
					}
				}
				this.state = 198;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
			}
			this.state = 226;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				{
				{
				this.state = 199;
				this.match(BNGParser.BEGIN);
				this.state = 200;
				this.match(BNGParser.MODEL);
				this.state = 202;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 201;
					this.match(BNGParser.LB);
					}
					}
					this.state = 204;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 209;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.BEGIN || ((((_la - 38)) & ~0x1F) === 0 && ((1 << (_la - 38)) & ((1 << (BNGParser.SET_OPTION - 38)) | (1 << (BNGParser.GENERATENETWORK - 38)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 38)) | (1 << (BNGParser.SIMULATE - 38)))) !== 0) || ((((_la - 77)) & ~0x1F) === 0 && ((1 << (_la - 77)) & ((1 << (BNGParser.SIMULATE_ODE - 77)) | (1 << (BNGParser.SIMULATE_SSA - 77)) | (1 << (BNGParser.SIMULATE_PLA - 77)) | (1 << (BNGParser.SIMULATE_NF - 77)) | (1 << (BNGParser.SIMULATE_RM - 77)) | (1 << (BNGParser.PARAMETER_SCAN - 77)) | (1 << (BNGParser.BIFURCATE - 77)) | (1 << (BNGParser.READFILE - 77)))) !== 0) || ((((_la - 110)) & ~0x1F) === 0 && ((1 << (_la - 110)) & ((1 << (BNGParser.VISUALIZE - 110)) | (1 << (BNGParser.WRITEFILE - 110)) | (1 << (BNGParser.WRITEMODEL - 110)) | (1 << (BNGParser.WRITEXML - 110)) | (1 << (BNGParser.WRITENETWORK - 110)) | (1 << (BNGParser.WRITESBML - 110)) | (1 << (BNGParser.WRITEMDL - 110)) | (1 << (BNGParser.WRITELATEX - 110)) | (1 << (BNGParser.WRITEMFILE - 110)) | (1 << (BNGParser.WRITEMEXFILE - 110)) | (1 << (BNGParser.SETCONCENTRATION - 110)))) !== 0) || ((((_la - 142)) & ~0x1F) === 0 && ((1 << (_la - 142)) & ((1 << (BNGParser.ADDCONCENTRATION - 142)) | (1 << (BNGParser.SAVECONCENTRATIONS - 142)) | (1 << (BNGParser.RESETCONCENTRATIONS - 142)) | (1 << (BNGParser.SETPARAMETER - 142)) | (1 << (BNGParser.SAVEPARAMETERS - 142)) | (1 << (BNGParser.RESETPARAMETERS - 142)) | (1 << (BNGParser.SETVOLUME - 142)) | (1 << (BNGParser.SIMULATE_PSA - 142)) | (1 << (BNGParser.QUIT - 142)))) !== 0)) {
					{
					{
					this.state = 206;
					this.program_block();
					}
					}
					this.state = 211;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 212;
				this.match(BNGParser.END);
				this.state = 213;
				this.match(BNGParser.MODEL);
				this.state = 217;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 214;
					this.match(BNGParser.LB);
					}
					}
					this.state = 219;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				}
				break;

			case 2:
				{
				this.state = 223;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 6, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 220;
						this.program_block();
						}
						}
					}
					this.state = 225;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 6, this._ctx);
				}
				}
				break;
			}
			this.state = 230;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.BEGIN:
				{
				this.state = 228;
				this.wrapped_actions_block();
				}
				break;
			case BNGParser.SET_OPTION:
			case BNGParser.GENERATENETWORK:
			case BNGParser.GENERATEHYBRIDMODEL:
			case BNGParser.SIMULATE:
			case BNGParser.SIMULATE_ODE:
			case BNGParser.SIMULATE_SSA:
			case BNGParser.SIMULATE_PLA:
			case BNGParser.SIMULATE_NF:
			case BNGParser.SIMULATE_RM:
			case BNGParser.PARAMETER_SCAN:
			case BNGParser.BIFURCATE:
			case BNGParser.READFILE:
			case BNGParser.VISUALIZE:
			case BNGParser.WRITEFILE:
			case BNGParser.WRITEMODEL:
			case BNGParser.WRITEXML:
			case BNGParser.WRITENETWORK:
			case BNGParser.WRITESBML:
			case BNGParser.WRITEMDL:
			case BNGParser.WRITELATEX:
			case BNGParser.WRITEMFILE:
			case BNGParser.WRITEMEXFILE:
			case BNGParser.SETCONCENTRATION:
			case BNGParser.ADDCONCENTRATION:
			case BNGParser.SAVECONCENTRATIONS:
			case BNGParser.RESETCONCENTRATIONS:
			case BNGParser.SETPARAMETER:
			case BNGParser.SAVEPARAMETERS:
			case BNGParser.RESETPARAMETERS:
			case BNGParser.SETVOLUME:
			case BNGParser.SIMULATE_PSA:
			case BNGParser.QUIT:
				{
				this.state = 229;
				this.actions_block();
				}
				break;
			case BNGParser.EOF:
				break;
			default:
				break;
			}
			this.state = 232;
			this.match(BNGParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public header_block(): Header_blockContext {
		let _localctx: Header_blockContext = new Header_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 2, BNGParser.RULE_header_block);
		try {
			this.state = 238;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.VERSION:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 234;
				this.version_def();
				}
				break;
			case BNGParser.SUBSTANCEUNITS:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 235;
				this.substance_def();
				}
				break;
			case BNGParser.SET_OPTION:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 236;
				this.set_option();
				}
				break;
			case BNGParser.SET_MODEL_NAME:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 237;
				this.set_model_name();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public version_def(): Version_defContext {
		let _localctx: Version_defContext = new Version_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, BNGParser.RULE_version_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 240;
			this.match(BNGParser.VERSION);
			this.state = 241;
			this.match(BNGParser.LPAREN);
			this.state = 242;
			this.match(BNGParser.DBQUOTES);
			this.state = 243;
			this.match(BNGParser.VERSION_NUMBER);
			this.state = 245;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 244;
				this.match(BNGParser.STRING);
				}
			}

			this.state = 247;
			this.match(BNGParser.DBQUOTES);
			this.state = 248;
			this.match(BNGParser.RPAREN);
			this.state = 250;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 249;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 253;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 252;
				this.match(BNGParser.LB);
				}
				}
				this.state = 255;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public substance_def(): Substance_defContext {
		let _localctx: Substance_defContext = new Substance_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, BNGParser.RULE_substance_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 257;
			this.match(BNGParser.SUBSTANCEUNITS);
			this.state = 258;
			this.match(BNGParser.LPAREN);
			this.state = 259;
			this.match(BNGParser.DBQUOTES);
			this.state = 260;
			this.match(BNGParser.STRING);
			this.state = 261;
			this.match(BNGParser.DBQUOTES);
			this.state = 262;
			this.match(BNGParser.RPAREN);
			this.state = 264;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 263;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 267;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 266;
				this.match(BNGParser.LB);
				}
				}
				this.state = 269;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public set_option(): Set_optionContext {
		let _localctx: Set_optionContext = new Set_optionContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, BNGParser.RULE_set_option);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 271;
			this.match(BNGParser.SET_OPTION);
			this.state = 272;
			this.match(BNGParser.LPAREN);
			this.state = 273;
			this.match(BNGParser.DBQUOTES);
			this.state = 277;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
				{
				{
				this.state = 274;
				_la = this._input.LA(1);
				if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				}
				}
				this.state = 279;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 280;
			this.match(BNGParser.DBQUOTES);
			this.state = 281;
			this.match(BNGParser.COMMA);
			this.state = 282;
			this.match(BNGParser.DBQUOTES);
			this.state = 286;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
				{
				{
				this.state = 283;
				_la = this._input.LA(1);
				if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				}
				}
				this.state = 288;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 289;
			this.match(BNGParser.DBQUOTES);
			this.state = 310;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 290;
				this.match(BNGParser.COMMA);
				this.state = 291;
				this.match(BNGParser.DBQUOTES);
				this.state = 295;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
					{
					{
					this.state = 292;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 297;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 298;
				this.match(BNGParser.DBQUOTES);
				this.state = 299;
				this.match(BNGParser.COMMA);
				this.state = 300;
				this.match(BNGParser.DBQUOTES);
				this.state = 304;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
					{
					{
					this.state = 301;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 306;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 307;
				this.match(BNGParser.DBQUOTES);
				}
				}
				this.state = 312;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 313;
			this.match(BNGParser.RPAREN);
			this.state = 315;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 314;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 318;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 317;
				this.match(BNGParser.LB);
				}
				}
				this.state = 320;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public set_model_name(): Set_model_nameContext {
		let _localctx: Set_model_nameContext = new Set_model_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, BNGParser.RULE_set_model_name);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 322;
			this.match(BNGParser.SET_MODEL_NAME);
			this.state = 323;
			this.match(BNGParser.LPAREN);
			this.state = 324;
			this.match(BNGParser.DBQUOTES);
			this.state = 325;
			this.match(BNGParser.STRING);
			this.state = 326;
			this.match(BNGParser.DBQUOTES);
			this.state = 327;
			this.match(BNGParser.RPAREN);
			this.state = 329;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 328;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 332;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 331;
				this.match(BNGParser.LB);
				}
				}
				this.state = 334;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public program_block(): Program_blockContext {
		let _localctx: Program_blockContext = new Program_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, BNGParser.RULE_program_block);
		try {
			this.state = 349;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 24, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 336;
				this.parameters_block();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 337;
				this.molecule_types_block();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 338;
				this.seed_species_block();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 339;
				this.observables_block();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 340;
				this.reaction_rules_block();
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 341;
				this.functions_block();
				}
				break;

			case 7:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 342;
				this.compartments_block();
				}
				break;

			case 8:
				this.enterOuterAlt(_localctx, 8);
				{
				this.state = 343;
				this.energy_patterns_block();
				}
				break;

			case 9:
				this.enterOuterAlt(_localctx, 9);
				{
				this.state = 344;
				this.population_maps_block();
				}
				break;

			case 10:
				this.enterOuterAlt(_localctx, 10);
				{
				this.state = 345;
				this.population_types_block();
				}
				break;

			case 11:
				this.enterOuterAlt(_localctx, 11);
				{
				this.state = 346;
				this.wrapped_actions_block();
				}
				break;

			case 12:
				this.enterOuterAlt(_localctx, 12);
				{
				this.state = 347;
				this.begin_actions_block();
				}
				break;

			case 13:
				this.enterOuterAlt(_localctx, 13);
				{
				this.state = 348;
				this.action_command();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public parameters_block(): Parameters_blockContext {
		let _localctx: Parameters_blockContext = new Parameters_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, BNGParser.RULE_parameters_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 351;
			this.match(BNGParser.BEGIN);
			this.state = 352;
			this.match(BNGParser.PARAMETERS);
			this.state = 354;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 353;
				this.match(BNGParser.LB);
				}
				}
				this.state = 356;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 366;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)))) !== 0) || ((((_la - 187)) & ~0x1F) === 0 && ((1 << (_la - 187)) & ((1 << (BNGParser.TIME - 187)) | (1 << (BNGParser.INT - 187)) | (1 << (BNGParser.STRING - 187)))) !== 0)) {
				{
				{
				this.state = 358;
				this.parameter_def();
				this.state = 360;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 359;
					this.match(BNGParser.LB);
					}
					}
					this.state = 362;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 368;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 369;
			this.match(BNGParser.END);
			this.state = 370;
			this.match(BNGParser.PARAMETERS);
			this.state = 374;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 371;
				this.match(BNGParser.LB);
				}
				}
				this.state = 376;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public parameter_def(): Parameter_defContext {
		let _localctx: Parameter_defContext = new Parameter_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, BNGParser.RULE_parameter_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 378;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.INT) {
				{
				this.state = 377;
				this.match(BNGParser.INT);
				}
			}

			this.state = 383;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 30, this._ctx) ) {
			case 1:
				{
				this.state = 380;
				this.param_name();
				this.state = 381;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 385;
			this.param_name();
			this.state = 387;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.BECOMES) {
				{
				this.state = 386;
				this.match(BNGParser.BECOMES);
				}
			}

			this.state = 390;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)) | (1 << (BNGParser.SAT - 138)) | (1 << (BNGParser.MM - 138)) | (1 << (BNGParser.HILL - 138)) | (1 << (BNGParser.ARRHENIUS - 138)) | (1 << (BNGParser.MRATIO - 138)) | (1 << (BNGParser.TFUN - 138)) | (1 << (BNGParser.FUNCTIONPRODUCT - 138)) | (1 << (BNGParser.IF - 138)) | (1 << (BNGParser.EXP - 138)) | (1 << (BNGParser.LN - 138)) | (1 << (BNGParser.LOG10 - 138)) | (1 << (BNGParser.LOG2 - 138)) | (1 << (BNGParser.SQRT - 138)) | (1 << (BNGParser.RINT - 138)) | (1 << (BNGParser.ABS - 138)) | (1 << (BNGParser.SIN - 138)))) !== 0) || ((((_la - 170)) & ~0x1F) === 0 && ((1 << (_la - 170)) & ((1 << (BNGParser.COS - 170)) | (1 << (BNGParser.TAN - 170)) | (1 << (BNGParser.ASIN - 170)) | (1 << (BNGParser.ACOS - 170)) | (1 << (BNGParser.ATAN - 170)) | (1 << (BNGParser.SINH - 170)) | (1 << (BNGParser.COSH - 170)) | (1 << (BNGParser.TANH - 170)) | (1 << (BNGParser.ASINH - 170)) | (1 << (BNGParser.ACOSH - 170)) | (1 << (BNGParser.ATANH - 170)) | (1 << (BNGParser.PI - 170)) | (1 << (BNGParser.EULERIAN - 170)) | (1 << (BNGParser.MIN - 170)) | (1 << (BNGParser.MAX - 170)) | (1 << (BNGParser.SUM - 170)) | (1 << (BNGParser.AVG - 170)) | (1 << (BNGParser.TIME - 170)) | (1 << (BNGParser.FLOAT - 170)) | (1 << (BNGParser.INT - 170)) | (1 << (BNGParser.STRING - 170)) | (1 << (BNGParser.LPAREN - 170)))) !== 0) || ((((_la - 204)) & ~0x1F) === 0 && ((1 << (_la - 204)) & ((1 << (BNGParser.TILDE - 204)) | (1 << (BNGParser.MINUS - 204)) | (1 << (BNGParser.PLUS - 204)) | (1 << (BNGParser.EMARK - 204)))) !== 0)) {
				{
				this.state = 389;
				this.expression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public param_name(): Param_nameContext {
		let _localctx: Param_nameContext = new Param_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, BNGParser.RULE_param_name);
		try {
			this.state = 394;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 33, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 392;
				this.match(BNGParser.STRING);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 393;
				this.arg_name();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_types_block(): Molecule_types_blockContext {
		let _localctx: Molecule_types_blockContext = new Molecule_types_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, BNGParser.RULE_molecule_types_block);
		let _la: number;
		try {
			this.state = 450;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 42, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 396;
				this.match(BNGParser.BEGIN);
				this.state = 397;
				this.match(BNGParser.MOLECULE);
				this.state = 398;
				this.match(BNGParser.TYPES);
				this.state = 400;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 399;
					this.match(BNGParser.LB);
					}
					}
					this.state = 402;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 412;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || _la === BNGParser.STRING) {
					{
					{
					this.state = 404;
					this.molecule_type_def();
					this.state = 406;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 405;
						this.match(BNGParser.LB);
						}
						}
						this.state = 408;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 414;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 415;
				this.match(BNGParser.END);
				this.state = 416;
				this.match(BNGParser.MOLECULE);
				this.state = 417;
				this.match(BNGParser.TYPES);
				this.state = 421;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 418;
					this.match(BNGParser.LB);
					}
					}
					this.state = 423;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 424;
				this.match(BNGParser.BEGIN);
				this.state = 425;
				this.match(BNGParser.MOLECULE_TYPES);
				this.state = 427;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 426;
					this.match(BNGParser.LB);
					}
					}
					this.state = 429;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 439;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || _la === BNGParser.STRING) {
					{
					{
					this.state = 431;
					this.molecule_type_def();
					this.state = 433;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 432;
						this.match(BNGParser.LB);
						}
						}
						this.state = 435;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 441;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 442;
				this.match(BNGParser.END);
				this.state = 443;
				this.match(BNGParser.MOLECULE_TYPES);
				this.state = 447;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 444;
					this.match(BNGParser.LB);
					}
					}
					this.state = 449;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_type_def(): Molecule_type_defContext {
		let _localctx: Molecule_type_defContext = new Molecule_type_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, BNGParser.RULE_molecule_type_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 454;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 43, this._ctx) ) {
			case 1:
				{
				this.state = 452;
				this.match(BNGParser.STRING);
				this.state = 453;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 456;
			this.molecule_def();
			this.state = 458;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.POPULATION) {
				{
				this.state = 457;
				this.match(BNGParser.POPULATION);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_def(): Molecule_defContext {
		let _localctx: Molecule_defContext = new Molecule_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, BNGParser.RULE_molecule_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 462;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				{
				this.state = 460;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.MODEL:
			case BNGParser.PARAMETERS:
			case BNGParser.COMPARTMENTS:
			case BNGParser.MOLECULE:
			case BNGParser.MOLECULES:
			case BNGParser.COUNTER:
			case BNGParser.SEED:
			case BNGParser.SPECIES:
			case BNGParser.OBSERVABLES:
			case BNGParser.FUNCTIONS:
			case BNGParser.REACTION:
			case BNGParser.REACTIONS:
			case BNGParser.RULES:
			case BNGParser.GROUPS:
			case BNGParser.POPULATION:
			case BNGParser.ENERGY:
			case BNGParser.PATTERNS:
				{
				this.state = 461;
				this.keyword_as_mol_name();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 469;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LPAREN) {
				{
				this.state = 464;
				this.match(BNGParser.LPAREN);
				this.state = 466;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 46, this._ctx) ) {
				case 1:
					{
					this.state = 465;
					this.component_def_list();
					}
					break;
				}
				this.state = 468;
				this.match(BNGParser.RPAREN);
				}
			}

			this.state = 472;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 471;
				this.molecule_attributes();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_attributes(): Molecule_attributesContext {
		let _localctx: Molecule_attributesContext = new Molecule_attributesContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, BNGParser.RULE_molecule_attributes);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 474;
			this.match(BNGParser.LBRACKET);
			this.state = 476;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)))) !== 0) || _la === BNGParser.TIME || _la === BNGParser.STRING) {
				{
				this.state = 475;
				this.action_arg_list();
				}
			}

			this.state = 478;
			this.match(BNGParser.RBRACKET);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public component_def_list(): Component_def_listContext {
		let _localctx: Component_def_listContext = new Component_def_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, BNGParser.RULE_component_def_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 481;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.METHOD - 41)))) !== 0) || ((((_la - 99)) & ~0x1F) === 0 && ((1 << (_la - 99)) & ((1 << (BNGParser.PARAMETER - 99)) | (1 << (BNGParser.FILE - 99)) | (1 << (BNGParser.TYPE - 99)) | (1 << (BNGParser.FORMAT - 99)))) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)) | (1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)))) !== 0)) {
				{
				this.state = 480;
				this.component_def();
				}
			}

			this.state = 489;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 483;
				this.match(BNGParser.COMMA);
				this.state = 485;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.METHOD - 41)))) !== 0) || ((((_la - 99)) & ~0x1F) === 0 && ((1 << (_la - 99)) & ((1 << (BNGParser.PARAMETER - 99)) | (1 << (BNGParser.FILE - 99)) | (1 << (BNGParser.TYPE - 99)) | (1 << (BNGParser.FORMAT - 99)))) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)) | (1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)))) !== 0)) {
					{
					this.state = 484;
					this.component_def();
					}
				}

				}
				}
				this.state = 491;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public component_def(): Component_defContext {
		let _localctx: Component_defContext = new Component_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, BNGParser.RULE_component_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 495;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				{
				this.state = 492;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				{
				this.state = 493;
				this.match(BNGParser.INT);
				}
				break;
			case BNGParser.PREFIX:
			case BNGParser.SUFFIX:
			case BNGParser.METHOD:
			case BNGParser.PARAMETER:
			case BNGParser.FILE:
			case BNGParser.TYPE:
			case BNGParser.FORMAT:
			case BNGParser.SAT:
			case BNGParser.MM:
			case BNGParser.HILL:
			case BNGParser.ARRHENIUS:
			case BNGParser.MRATIO:
			case BNGParser.TFUN:
			case BNGParser.FUNCTIONPRODUCT:
			case BNGParser.IF:
			case BNGParser.EXP:
			case BNGParser.LN:
			case BNGParser.LOG10:
			case BNGParser.LOG2:
			case BNGParser.SQRT:
			case BNGParser.ABS:
			case BNGParser.SIN:
			case BNGParser.COS:
			case BNGParser.TAN:
			case BNGParser.ASIN:
			case BNGParser.ACOS:
			case BNGParser.ATAN:
			case BNGParser.SINH:
			case BNGParser.COSH:
			case BNGParser.TANH:
			case BNGParser.ASINH:
			case BNGParser.ACOSH:
			case BNGParser.ATANH:
			case BNGParser.MIN:
			case BNGParser.MAX:
			case BNGParser.SUM:
			case BNGParser.AVG:
			case BNGParser.TIME:
				{
				this.state = 494;
				this.keyword_as_component_name();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 499;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.TILDE) {
				{
				this.state = 497;
				this.match(BNGParser.TILDE);
				this.state = 498;
				this.state_list();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public keyword_as_component_name(): Keyword_as_component_nameContext {
		let _localctx: Keyword_as_component_nameContext = new Keyword_as_component_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, BNGParser.RULE_keyword_as_component_name);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 501;
			_la = this._input.LA(1);
			if (!(((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.METHOD - 41)))) !== 0) || ((((_la - 99)) & ~0x1F) === 0 && ((1 << (_la - 99)) & ((1 << (BNGParser.PARAMETER - 99)) | (1 << (BNGParser.FILE - 99)) | (1 << (BNGParser.TYPE - 99)) | (1 << (BNGParser.FORMAT - 99)))) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public keyword_as_mol_name(): Keyword_as_mol_nameContext {
		let _localctx: Keyword_as_mol_nameContext = new Keyword_as_mol_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, BNGParser.RULE_keyword_as_mol_name);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 503;
			_la = this._input.LA(1);
			if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public state_list(): State_listContext {
		let _localctx: State_listContext = new State_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, BNGParser.RULE_state_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 505;
			this.state_name();
			this.state = 510;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.TILDE) {
				{
				{
				this.state = 506;
				this.match(BNGParser.TILDE);
				this.state = 507;
				this.state_name();
				}
				}
				this.state = 512;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public state_name(): State_nameContext {
		let _localctx: State_nameContext = new State_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, BNGParser.RULE_state_name);
		let _la: number;
		try {
			this.state = 518;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 513;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 514;
				this.match(BNGParser.INT);
				this.state = 516;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 515;
					this.match(BNGParser.STRING);
					}
				}

				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public seed_species_block(): Seed_species_blockContext {
		let _localctx: Seed_species_blockContext = new Seed_species_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, BNGParser.RULE_seed_species_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 520;
			this.match(BNGParser.BEGIN);
			this.state = 524;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.SEED:
				{
				this.state = 521;
				this.match(BNGParser.SEED);
				this.state = 522;
				this.match(BNGParser.SPECIES);
				}
				break;
			case BNGParser.SPECIES:
				{
				this.state = 523;
				this.match(BNGParser.SPECIES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 527;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 526;
				this.match(BNGParser.LB);
				}
				}
				this.state = 529;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 543;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.DOLLAR - 189)) | (1 << (BNGParser.AT - 189)))) !== 0) || _la === BNGParser.MOLECULE_TAG_TOKEN) {
				{
				{
				this.state = 532;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 531;
					this.seed_species_def();
					}
					}
					this.state = 534;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.DOLLAR - 189)) | (1 << (BNGParser.AT - 189)))) !== 0) || _la === BNGParser.MOLECULE_TAG_TOKEN);
				this.state = 537;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 536;
					this.match(BNGParser.LB);
					}
					}
					this.state = 539;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 545;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 546;
			this.match(BNGParser.END);
			this.state = 550;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.SEED:
				{
				this.state = 547;
				this.match(BNGParser.SEED);
				this.state = 548;
				this.match(BNGParser.SPECIES);
				}
				break;
			case BNGParser.SPECIES:
				{
				this.state = 549;
				this.match(BNGParser.SPECIES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 555;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 552;
				this.match(BNGParser.LB);
				}
				}
				this.state = 557;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public seed_species_def(): Seed_species_defContext {
		let _localctx: Seed_species_defContext = new Seed_species_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 42, BNGParser.RULE_seed_species_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 559;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.INT) {
				{
				this.state = 558;
				this.match(BNGParser.INT);
				}
			}

			this.state = 563;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 66, this._ctx) ) {
			case 1:
				{
				this.state = 561;
				this.match(BNGParser.STRING);
				this.state = 562;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 566;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.DOLLAR) {
				{
				this.state = 565;
				this.match(BNGParser.DOLLAR);
				}
			}

			this.state = 571;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 68, this._ctx) ) {
			case 1:
				{
				this.state = 568;
				this.match(BNGParser.AT);
				this.state = 569;
				this.match(BNGParser.STRING);
				this.state = 570;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 573;
			this.species_def();
			this.state = 575;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 69, this._ctx) ) {
			case 1:
				{
				this.state = 574;
				this.expression();
				}
				break;
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public species_def(): Species_defContext {
		let _localctx: Species_defContext = new Species_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 44, BNGParser.RULE_species_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 580;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.AT) {
				{
				this.state = 577;
				this.match(BNGParser.AT);
				this.state = 578;
				this.match(BNGParser.STRING);
				this.state = 579;
				this.match(BNGParser.COLON);
				}
			}

			this.state = 582;
			this.molecule_pattern();
			this.state = 584;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 71, this._ctx) ) {
			case 1:
				{
				this.state = 583;
				this.molecule_compartment();
				}
				break;
			}
			this.state = 593;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.DOT) {
				{
				{
				this.state = 586;
				this.match(BNGParser.DOT);
				this.state = 587;
				this.molecule_pattern();
				this.state = 589;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 72, this._ctx) ) {
				case 1:
					{
					this.state = 588;
					this.molecule_compartment();
					}
					break;
				}
				}
				}
				this.state = 595;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 598;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 74, this._ctx) ) {
			case 1:
				{
				this.state = 596;
				this.match(BNGParser.AT);
				this.state = 597;
				this.match(BNGParser.STRING);
				}
				break;
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_compartment(): Molecule_compartmentContext {
		let _localctx: Molecule_compartmentContext = new Molecule_compartmentContext(this._ctx, this.state);
		this.enterRule(_localctx, 46, BNGParser.RULE_molecule_compartment);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 600;
			this.match(BNGParser.AT);
			this.state = 601;
			this.match(BNGParser.STRING);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_pattern(): Molecule_patternContext {
		let _localctx: Molecule_patternContext = new Molecule_patternContext(this._ctx, this.state);
		this.enterRule(_localctx, 48, BNGParser.RULE_molecule_pattern);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 604;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.MOLECULE_TAG_TOKEN) {
				{
				this.state = 603;
				this.scope_prefix();
				}
			}

			this.state = 608;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				{
				this.state = 606;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.MODEL:
			case BNGParser.PARAMETERS:
			case BNGParser.COMPARTMENTS:
			case BNGParser.MOLECULE:
			case BNGParser.MOLECULES:
			case BNGParser.COUNTER:
			case BNGParser.SEED:
			case BNGParser.SPECIES:
			case BNGParser.OBSERVABLES:
			case BNGParser.FUNCTIONS:
			case BNGParser.REACTION:
			case BNGParser.REACTIONS:
			case BNGParser.RULES:
			case BNGParser.GROUPS:
			case BNGParser.POPULATION:
			case BNGParser.ENERGY:
			case BNGParser.PATTERNS:
				{
				this.state = 607;
				this.keyword_as_mol_name();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 611;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 77, this._ctx) ) {
			case 1:
				{
				this.state = 610;
				this.molecule_compartment();
				}
				break;
			}
			this.state = 614;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 78, this._ctx) ) {
			case 1:
				{
				this.state = 613;
				this.molecule_tag();
				}
				break;
			}
			this.state = 621;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 80, this._ctx) ) {
			case 1:
				{
				this.state = 616;
				this.match(BNGParser.LPAREN);
				this.state = 618;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 79, this._ctx) ) {
				case 1:
					{
					this.state = 617;
					this.component_pattern_list();
					}
					break;
				}
				this.state = 620;
				this.match(BNGParser.RPAREN);
				}
				break;
			}
			this.state = 624;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 81, this._ctx) ) {
			case 1:
				{
				this.state = 623;
				this.pattern_bond_wildcard();
				}
				break;
			}
			this.state = 627;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 82, this._ctx) ) {
			case 1:
				{
				this.state = 626;
				this.molecule_tag();
				}
				break;
			}
			this.state = 630;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 629;
				this.molecule_attributes();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public scope_prefix(): Scope_prefixContext {
		let _localctx: Scope_prefixContext = new Scope_prefixContext(this._ctx, this.state);
		this.enterRule(_localctx, 50, BNGParser.RULE_scope_prefix);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 632;
			this.match(BNGParser.MOLECULE_TAG_TOKEN);
			this.state = 633;
			this.match(BNGParser.COLON);
			this.state = 634;
			this.match(BNGParser.COLON);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public pattern_bond_wildcard(): Pattern_bond_wildcardContext {
		let _localctx: Pattern_bond_wildcardContext = new Pattern_bond_wildcardContext(this._ctx, this.state);
		this.enterRule(_localctx, 52, BNGParser.RULE_pattern_bond_wildcard);
		try {
			this.state = 640;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 84, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 636;
				this.match(BNGParser.EMARK);
				this.state = 637;
				this.match(BNGParser.PLUS);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 638;
				this.match(BNGParser.EMARK);
				this.state = 639;
				this.match(BNGParser.QMARK);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public molecule_tag(): Molecule_tagContext {
		let _localctx: Molecule_tagContext = new Molecule_tagContext(this._ctx, this.state);
		this.enterRule(_localctx, 54, BNGParser.RULE_molecule_tag);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 642;
			this.match(BNGParser.MOLECULE_TAG_TOKEN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public component_pattern_list(): Component_pattern_listContext {
		let _localctx: Component_pattern_listContext = new Component_pattern_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 56, BNGParser.RULE_component_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 645;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.METHOD - 41)))) !== 0) || ((((_la - 99)) & ~0x1F) === 0 && ((1 << (_la - 99)) & ((1 << (BNGParser.PARAMETER - 99)) | (1 << (BNGParser.FILE - 99)) | (1 << (BNGParser.TYPE - 99)) | (1 << (BNGParser.FORMAT - 99)))) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)) | (1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)))) !== 0)) {
				{
				this.state = 644;
				this.component_pattern();
				}
			}

			this.state = 653;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 647;
				this.match(BNGParser.COMMA);
				this.state = 649;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.METHOD - 41)))) !== 0) || ((((_la - 99)) & ~0x1F) === 0 && ((1 << (_la - 99)) & ((1 << (BNGParser.PARAMETER - 99)) | (1 << (BNGParser.FILE - 99)) | (1 << (BNGParser.TYPE - 99)) | (1 << (BNGParser.FORMAT - 99)))) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)) | (1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)))) !== 0)) {
					{
					this.state = 648;
					this.component_pattern();
					}
				}

				}
				}
				this.state = 655;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public component_pattern(): Component_patternContext {
		let _localctx: Component_patternContext = new Component_patternContext(this._ctx, this.state);
		this.enterRule(_localctx, 58, BNGParser.RULE_component_pattern);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 659;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				{
				this.state = 656;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				{
				this.state = 657;
				this.match(BNGParser.INT);
				}
				break;
			case BNGParser.PREFIX:
			case BNGParser.SUFFIX:
			case BNGParser.METHOD:
			case BNGParser.PARAMETER:
			case BNGParser.FILE:
			case BNGParser.TYPE:
			case BNGParser.FORMAT:
			case BNGParser.SAT:
			case BNGParser.MM:
			case BNGParser.HILL:
			case BNGParser.ARRHENIUS:
			case BNGParser.MRATIO:
			case BNGParser.TFUN:
			case BNGParser.FUNCTIONPRODUCT:
			case BNGParser.IF:
			case BNGParser.EXP:
			case BNGParser.LN:
			case BNGParser.LOG10:
			case BNGParser.LOG2:
			case BNGParser.SQRT:
			case BNGParser.ABS:
			case BNGParser.SIN:
			case BNGParser.COS:
			case BNGParser.TAN:
			case BNGParser.ASIN:
			case BNGParser.ACOS:
			case BNGParser.ATAN:
			case BNGParser.SINH:
			case BNGParser.COSH:
			case BNGParser.TANH:
			case BNGParser.ASINH:
			case BNGParser.ACOSH:
			case BNGParser.ATANH:
			case BNGParser.MIN:
			case BNGParser.MAX:
			case BNGParser.SUM:
			case BNGParser.AVG:
			case BNGParser.TIME:
				{
				this.state = 658;
				this.keyword_as_component_name();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 668;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 198)) & ~0x1F) === 0 && ((1 << (_la - 198)) & ((1 << (BNGParser.DOT - 198)) | (1 << (BNGParser.TILDE - 198)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 198)) | (1 << (BNGParser.EMARK - 198)))) !== 0)) {
				{
				this.state = 666;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 89, this._ctx) ) {
				case 1:
					{
					{
					this.state = 661;
					this.match(BNGParser.TILDE);
					this.state = 662;
					this.state_value();
					}
					}
					break;

				case 2:
					{
					this.state = 663;
					this.bond_spec();
					}
					break;

				case 3:
					{
					this.state = 664;
					this.component_label();
					}
					break;

				case 4:
					{
					this.state = 665;
					this.match(BNGParser.DOT);
					}
					break;
				}
				}
				this.state = 670;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public component_label(): Component_labelContext {
		let _localctx: Component_labelContext = new Component_labelContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, BNGParser.RULE_component_label);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 671;
			this.match(BNGParser.MOLECULE_TAG_TOKEN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public state_value(): State_valueContext {
		let _localctx: State_valueContext = new State_valueContext(this._ctx, this.state);
		this.enterRule(_localctx, 62, BNGParser.RULE_state_value);
		let _la: number;
		try {
			this.state = 679;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 673;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 674;
				this.match(BNGParser.INT);
				this.state = 676;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 675;
					this.match(BNGParser.STRING);
					}
				}

				}
				break;
			case BNGParser.QMARK:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 678;
				this.match(BNGParser.QMARK);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public bond_spec(): Bond_specContext {
		let _localctx: Bond_specContext = new Bond_specContext(this._ctx, this.state);
		this.enterRule(_localctx, 64, BNGParser.RULE_bond_spec);
		try {
			this.state = 688;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 93, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 681;
				this.match(BNGParser.DOT);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 682;
				this.match(BNGParser.EMARK);
				this.state = 683;
				this.bond_id();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 684;
				this.match(BNGParser.EMARK);
				this.state = 685;
				this.match(BNGParser.PLUS);
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 686;
				this.match(BNGParser.EMARK);
				this.state = 687;
				this.match(BNGParser.QMARK);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public bond_id(): Bond_idContext {
		let _localctx: Bond_idContext = new Bond_idContext(this._ctx, this.state);
		this.enterRule(_localctx, 66, BNGParser.RULE_bond_id);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 690;
			_la = this._input.LA(1);
			if (!(_la === BNGParser.INT || _la === BNGParser.STRING)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observables_block(): Observables_blockContext {
		let _localctx: Observables_blockContext = new Observables_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 68, BNGParser.RULE_observables_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 692;
			this.match(BNGParser.BEGIN);
			this.state = 693;
			this.match(BNGParser.OBSERVABLES);
			this.state = 695;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 694;
				this.match(BNGParser.LB);
				}
				}
				this.state = 697;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 707;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SPECIES))) !== 0) || _la === BNGParser.STRING) {
				{
				{
				this.state = 699;
				this.observable_def();
				this.state = 701;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 700;
					this.match(BNGParser.LB);
					}
					}
					this.state = 703;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 709;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 710;
			this.match(BNGParser.END);
			this.state = 711;
			this.match(BNGParser.OBSERVABLES);
			this.state = 715;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 712;
				this.match(BNGParser.LB);
				}
				}
				this.state = 717;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observable_def(): Observable_defContext {
		let _localctx: Observable_defContext = new Observable_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 70, BNGParser.RULE_observable_def);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 720;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 98, this._ctx) ) {
			case 1:
				{
				this.state = 718;
				this.match(BNGParser.STRING);
				this.state = 719;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 723;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 99, this._ctx) ) {
			case 1:
				{
				this.state = 722;
				this.observable_type();
				}
				break;
			}
			this.state = 725;
			this.match(BNGParser.STRING);
			this.state = 726;
			this.observable_pattern_list();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observable_type(): Observable_typeContext {
		let _localctx: Observable_typeContext = new Observable_typeContext(this._ctx, this.state);
		this.enterRule(_localctx, 72, BNGParser.RULE_observable_type);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 728;
			_la = this._input.LA(1);
			if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SPECIES))) !== 0) || _la === BNGParser.STRING)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observable_pattern_list(): Observable_pattern_listContext {
		let _localctx: Observable_pattern_listContext = new Observable_pattern_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 74, BNGParser.RULE_observable_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 730;
			this.observable_pattern();
			this.state = 737;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 190)) & ~0x1F) === 0 && ((1 << (_la - 190)) & ((1 << (BNGParser.STRING - 190)) | (1 << (BNGParser.COMMA - 190)) | (1 << (BNGParser.AT - 190)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 190)))) !== 0)) {
				{
				{
				this.state = 732;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.COMMA) {
					{
					this.state = 731;
					this.match(BNGParser.COMMA);
					}
				}

				this.state = 734;
				this.observable_pattern();
				}
				}
				this.state = 739;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observable_pattern(): Observable_patternContext {
		let _localctx: Observable_patternContext = new Observable_patternContext(this._ctx, this.state);
		this.enterRule(_localctx, 76, BNGParser.RULE_observable_pattern);
		let _la: number;
		try {
			this.state = 748;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 103, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 740;
				this.species_def();
				this.state = 743;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.GT) {
					{
					this.state = 741;
					this.match(BNGParser.GT);
					this.state = 742;
					this.match(BNGParser.INT);
					}
				}

				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 745;
				this.match(BNGParser.STRING);
				this.state = 746;
				_la = this._input.LA(1);
				if (!(((((_la - 206)) & ~0x1F) === 0 && ((1 << (_la - 206)) & ((1 << (BNGParser.GTE - 206)) | (1 << (BNGParser.GT - 206)) | (1 << (BNGParser.LTE - 206)) | (1 << (BNGParser.LT - 206)) | (1 << (BNGParser.EQUALS - 206)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 747;
				this.match(BNGParser.INT);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public reaction_rules_block(): Reaction_rules_blockContext {
		let _localctx: Reaction_rules_blockContext = new Reaction_rules_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 78, BNGParser.RULE_reaction_rules_block);
		let _la: number;
		try {
			this.state = 830;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 116, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 750;
				this.match(BNGParser.BEGIN);
				this.state = 751;
				this.match(BNGParser.REACTION);
				this.state = 752;
				this.match(BNGParser.RULES);
				this.state = 754;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 753;
					this.match(BNGParser.LB);
					}
					}
					this.state = 756;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 766;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.LBRACKET - 189)) | (1 << (BNGParser.AT - 189)))) !== 0) || _la === BNGParser.MOLECULE_TAG_TOKEN) {
					{
					{
					this.state = 758;
					this.reaction_rule_def();
					this.state = 760;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 759;
						this.match(BNGParser.LB);
						}
						}
						this.state = 762;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 768;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 769;
				this.match(BNGParser.END);
				this.state = 770;
				this.match(BNGParser.REACTION);
				this.state = 771;
				this.match(BNGParser.RULES);
				this.state = 775;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 772;
					this.match(BNGParser.LB);
					}
					}
					this.state = 777;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 778;
				this.match(BNGParser.BEGIN);
				this.state = 779;
				this.match(BNGParser.REACTION_RULES);
				this.state = 781;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 780;
					this.match(BNGParser.LB);
					}
					}
					this.state = 783;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 793;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.LBRACKET - 189)) | (1 << (BNGParser.AT - 189)))) !== 0) || _la === BNGParser.MOLECULE_TAG_TOKEN) {
					{
					{
					this.state = 785;
					this.reaction_rule_def();
					this.state = 787;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 786;
						this.match(BNGParser.LB);
						}
						}
						this.state = 789;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 795;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 796;
				this.match(BNGParser.END);
				this.state = 797;
				this.match(BNGParser.REACTION_RULES);
				this.state = 801;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 798;
					this.match(BNGParser.LB);
					}
					}
					this.state = 803;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 804;
				this.match(BNGParser.BEGIN);
				this.state = 805;
				this.match(BNGParser.REACTIONS);
				this.state = 807;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 806;
					this.match(BNGParser.LB);
					}
					}
					this.state = 809;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 819;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.LBRACKET - 189)) | (1 << (BNGParser.AT - 189)))) !== 0) || _la === BNGParser.MOLECULE_TAG_TOKEN) {
					{
					{
					this.state = 811;
					this.reaction_rule_def();
					this.state = 813;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 812;
						this.match(BNGParser.LB);
						}
						}
						this.state = 815;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 821;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 822;
				this.match(BNGParser.END);
				this.state = 823;
				this.match(BNGParser.REACTIONS);
				this.state = 827;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 824;
					this.match(BNGParser.LB);
					}
					}
					this.state = 829;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public reaction_rule_def(): Reaction_rule_defContext {
		let _localctx: Reaction_rule_defContext = new Reaction_rule_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 80, BNGParser.RULE_reaction_rule_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 833;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 117, this._ctx) ) {
			case 1:
				{
				this.state = 832;
				this.label_def();
				}
				break;
			}
			this.state = 848;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 835;
				this.match(BNGParser.LBRACKET);
				this.state = 836;
				this.rule_modifiers();
				this.state = 843;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (((((_la - 29)) & ~0x1F) === 0 && ((1 << (_la - 29)) & ((1 << (BNGParser.MATCHONCE - 29)) | (1 << (BNGParser.DELETEMOLECULES - 29)) | (1 << (BNGParser.MOVECONNECTED - 29)) | (1 << (BNGParser.INCLUDE_REACTANTS - 29)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 29)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 29)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 29)) | (1 << (BNGParser.TOTALRATE - 29)))) !== 0) || _la === BNGParser.PRIORITY || _la === BNGParser.COMMA) {
					{
					{
					this.state = 838;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					if (_la === BNGParser.COMMA) {
						{
						this.state = 837;
						this.match(BNGParser.COMMA);
						}
					}

					this.state = 840;
					this.rule_modifiers();
					}
					}
					this.state = 845;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 846;
				this.match(BNGParser.RBRACKET);
				}
			}

			this.state = 850;
			this.reactant_patterns();
			this.state = 851;
			this.reaction_sign();
			this.state = 852;
			this.product_patterns();
			this.state = 853;
			this.rate_law();
			this.state = 857;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 29)) & ~0x1F) === 0 && ((1 << (_la - 29)) & ((1 << (BNGParser.MATCHONCE - 29)) | (1 << (BNGParser.DELETEMOLECULES - 29)) | (1 << (BNGParser.MOVECONNECTED - 29)) | (1 << (BNGParser.INCLUDE_REACTANTS - 29)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 29)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 29)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 29)) | (1 << (BNGParser.TOTALRATE - 29)))) !== 0) || _la === BNGParser.PRIORITY) {
				{
				{
				this.state = 854;
				this.rule_modifiers();
				}
				}
				this.state = 859;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public label_def(): Label_defContext {
		let _localctx: Label_defContext = new Label_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 82, BNGParser.RULE_label_def);
		let _la: number;
		try {
			this.state = 875;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 125, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 860;
				_la = this._input.LA(1);
				if (!(_la === BNGParser.INT || _la === BNGParser.STRING)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 870;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (((((_la - 189)) & ~0x1F) === 0 && ((1 << (_la - 189)) & ((1 << (BNGParser.INT - 189)) | (1 << (BNGParser.STRING - 189)) | (1 << (BNGParser.LPAREN - 189)))) !== 0)) {
					{
					this.state = 868;
					this._errHandler.sync(this);
					switch (this._input.LA(1)) {
					case BNGParser.STRING:
						{
						this.state = 861;
						this.match(BNGParser.STRING);
						}
						break;
					case BNGParser.INT:
						{
						this.state = 862;
						this.match(BNGParser.INT);
						}
						break;
					case BNGParser.LPAREN:
						{
						this.state = 863;
						this.match(BNGParser.LPAREN);
						this.state = 865;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
						if (_la === BNGParser.STRING) {
							{
							this.state = 864;
							this.match(BNGParser.STRING);
							}
						}

						this.state = 867;
						this.match(BNGParser.RPAREN);
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					}
					this.state = 872;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 873;
				this.match(BNGParser.COLON);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 874;
				this.match(BNGParser.INT);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public reactant_patterns(): Reactant_patternsContext {
		let _localctx: Reactant_patternsContext = new Reactant_patternsContext(this._ctx, this.state);
		this.enterRule(_localctx, 84, BNGParser.RULE_reactant_patterns);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 879;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.MODEL:
			case BNGParser.PARAMETERS:
			case BNGParser.COMPARTMENTS:
			case BNGParser.MOLECULE:
			case BNGParser.MOLECULES:
			case BNGParser.COUNTER:
			case BNGParser.SEED:
			case BNGParser.SPECIES:
			case BNGParser.OBSERVABLES:
			case BNGParser.FUNCTIONS:
			case BNGParser.REACTION:
			case BNGParser.REACTIONS:
			case BNGParser.RULES:
			case BNGParser.GROUPS:
			case BNGParser.POPULATION:
			case BNGParser.ENERGY:
			case BNGParser.PATTERNS:
			case BNGParser.STRING:
			case BNGParser.AT:
			case BNGParser.MOLECULE_TAG_TOKEN:
				{
				this.state = 877;
				this.species_def();
				}
				break;
			case BNGParser.INT:
				{
				this.state = 878;
				this.match(BNGParser.INT);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 888;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.PLUS) {
				{
				{
				this.state = 881;
				this.match(BNGParser.PLUS);
				this.state = 884;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case BNGParser.MODEL:
				case BNGParser.PARAMETERS:
				case BNGParser.COMPARTMENTS:
				case BNGParser.MOLECULE:
				case BNGParser.MOLECULES:
				case BNGParser.COUNTER:
				case BNGParser.SEED:
				case BNGParser.SPECIES:
				case BNGParser.OBSERVABLES:
				case BNGParser.FUNCTIONS:
				case BNGParser.REACTION:
				case BNGParser.REACTIONS:
				case BNGParser.RULES:
				case BNGParser.GROUPS:
				case BNGParser.POPULATION:
				case BNGParser.ENERGY:
				case BNGParser.PATTERNS:
				case BNGParser.STRING:
				case BNGParser.AT:
				case BNGParser.MOLECULE_TAG_TOKEN:
					{
					this.state = 882;
					this.species_def();
					}
					break;
				case BNGParser.INT:
					{
					this.state = 883;
					this.match(BNGParser.INT);
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				}
				}
				this.state = 890;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public product_patterns(): Product_patternsContext {
		let _localctx: Product_patternsContext = new Product_patternsContext(this._ctx, this.state);
		this.enterRule(_localctx, 86, BNGParser.RULE_product_patterns);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 893;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.MODEL:
			case BNGParser.PARAMETERS:
			case BNGParser.COMPARTMENTS:
			case BNGParser.MOLECULE:
			case BNGParser.MOLECULES:
			case BNGParser.COUNTER:
			case BNGParser.SEED:
			case BNGParser.SPECIES:
			case BNGParser.OBSERVABLES:
			case BNGParser.FUNCTIONS:
			case BNGParser.REACTION:
			case BNGParser.REACTIONS:
			case BNGParser.RULES:
			case BNGParser.GROUPS:
			case BNGParser.POPULATION:
			case BNGParser.ENERGY:
			case BNGParser.PATTERNS:
			case BNGParser.STRING:
			case BNGParser.AT:
			case BNGParser.MOLECULE_TAG_TOKEN:
				{
				this.state = 891;
				this.species_def();
				}
				break;
			case BNGParser.INT:
				{
				this.state = 892;
				this.match(BNGParser.INT);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 902;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 131, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 895;
					this.match(BNGParser.PLUS);
					this.state = 898;
					this._errHandler.sync(this);
					switch (this._input.LA(1)) {
					case BNGParser.MODEL:
					case BNGParser.PARAMETERS:
					case BNGParser.COMPARTMENTS:
					case BNGParser.MOLECULE:
					case BNGParser.MOLECULES:
					case BNGParser.COUNTER:
					case BNGParser.SEED:
					case BNGParser.SPECIES:
					case BNGParser.OBSERVABLES:
					case BNGParser.FUNCTIONS:
					case BNGParser.REACTION:
					case BNGParser.REACTIONS:
					case BNGParser.RULES:
					case BNGParser.GROUPS:
					case BNGParser.POPULATION:
					case BNGParser.ENERGY:
					case BNGParser.PATTERNS:
					case BNGParser.STRING:
					case BNGParser.AT:
					case BNGParser.MOLECULE_TAG_TOKEN:
						{
						this.state = 896;
						this.species_def();
						}
						break;
					case BNGParser.INT:
						{
						this.state = 897;
						this.match(BNGParser.INT);
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					}
					}
				}
				this.state = 904;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 131, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public reaction_sign(): Reaction_signContext {
		let _localctx: Reaction_signContext = new Reaction_signContext(this._ctx, this.state);
		this.enterRule(_localctx, 88, BNGParser.RULE_reaction_sign);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 905;
			_la = this._input.LA(1);
			if (!(_la === BNGParser.UNI_REACTION_SIGN || _la === BNGParser.BI_REACTION_SIGN)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public rate_law(): Rate_lawContext {
		let _localctx: Rate_lawContext = new Rate_lawContext(this._ctx, this.state);
		this.enterRule(_localctx, 90, BNGParser.RULE_rate_law);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 907;
			this.expression();
			this.state = 910;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.COMMA) {
				{
				this.state = 908;
				this.match(BNGParser.COMMA);
				this.state = 909;
				this.expression();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public rule_modifiers(): Rule_modifiersContext {
		let _localctx: Rule_modifiersContext = new Rule_modifiersContext(this._ctx, this.state);
		this.enterRule(_localctx, 92, BNGParser.RULE_rule_modifiers);
		try {
			this.state = 947;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.DELETEMOLECULES:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 912;
				this.match(BNGParser.DELETEMOLECULES);
				}
				break;
			case BNGParser.MOVECONNECTED:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 913;
				this.match(BNGParser.MOVECONNECTED);
				}
				break;
			case BNGParser.MATCHONCE:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 914;
				this.match(BNGParser.MATCHONCE);
				}
				break;
			case BNGParser.TOTALRATE:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 915;
				this.match(BNGParser.TOTALRATE);
				}
				break;
			case BNGParser.PRIORITY:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 916;
				this.match(BNGParser.PRIORITY);
				this.state = 917;
				this.match(BNGParser.BECOMES);
				this.state = 918;
				this.expression();
				}
				break;
			case BNGParser.INCLUDE_REACTANTS:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 919;
				this.match(BNGParser.INCLUDE_REACTANTS);
				this.state = 920;
				this.match(BNGParser.LPAREN);
				this.state = 921;
				this.match(BNGParser.INT);
				this.state = 922;
				this.match(BNGParser.COMMA);
				this.state = 923;
				this.pattern_list();
				this.state = 924;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.EXCLUDE_REACTANTS:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 926;
				this.match(BNGParser.EXCLUDE_REACTANTS);
				this.state = 927;
				this.match(BNGParser.LPAREN);
				this.state = 928;
				this.match(BNGParser.INT);
				this.state = 929;
				this.match(BNGParser.COMMA);
				this.state = 930;
				this.pattern_list();
				this.state = 931;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.INCLUDE_PRODUCTS:
				this.enterOuterAlt(_localctx, 8);
				{
				this.state = 933;
				this.match(BNGParser.INCLUDE_PRODUCTS);
				this.state = 934;
				this.match(BNGParser.LPAREN);
				this.state = 935;
				this.match(BNGParser.INT);
				this.state = 936;
				this.match(BNGParser.COMMA);
				this.state = 937;
				this.pattern_list();
				this.state = 938;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.EXCLUDE_PRODUCTS:
				this.enterOuterAlt(_localctx, 9);
				{
				this.state = 940;
				this.match(BNGParser.EXCLUDE_PRODUCTS);
				this.state = 941;
				this.match(BNGParser.LPAREN);
				this.state = 942;
				this.match(BNGParser.INT);
				this.state = 943;
				this.match(BNGParser.COMMA);
				this.state = 944;
				this.pattern_list();
				this.state = 945;
				this.match(BNGParser.RPAREN);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public pattern_list(): Pattern_listContext {
		let _localctx: Pattern_listContext = new Pattern_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 94, BNGParser.RULE_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 949;
			this.species_def();
			this.state = 954;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 950;
				this.match(BNGParser.COMMA);
				this.state = 951;
				this.species_def();
				}
				}
				this.state = 956;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public functions_block(): Functions_blockContext {
		let _localctx: Functions_blockContext = new Functions_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 96, BNGParser.RULE_functions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 957;
			this.match(BNGParser.BEGIN);
			this.state = 958;
			this.match(BNGParser.FUNCTIONS);
			this.state = 960;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 959;
				this.match(BNGParser.LB);
				}
				}
				this.state = 962;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 972;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING) {
				{
				{
				this.state = 964;
				this.function_def();
				this.state = 966;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 965;
					this.match(BNGParser.LB);
					}
					}
					this.state = 968;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 974;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 975;
			this.match(BNGParser.END);
			this.state = 976;
			this.match(BNGParser.FUNCTIONS);
			this.state = 980;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 977;
				this.match(BNGParser.LB);
				}
				}
				this.state = 982;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public function_def(): Function_defContext {
		let _localctx: Function_defContext = new Function_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 98, BNGParser.RULE_function_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 985;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 139, this._ctx) ) {
			case 1:
				{
				this.state = 983;
				this.match(BNGParser.STRING);
				this.state = 984;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 987;
			this.match(BNGParser.STRING);
			this.state = 993;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 141, this._ctx) ) {
			case 1:
				{
				this.state = 988;
				this.match(BNGParser.LPAREN);
				this.state = 990;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 989;
					this.param_list();
					}
				}

				this.state = 992;
				this.match(BNGParser.RPAREN);
				}
				break;
			}
			this.state = 996;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.BECOMES) {
				{
				this.state = 995;
				this.match(BNGParser.BECOMES);
				}
			}

			this.state = 998;
			this.expression();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public param_list(): Param_listContext {
		let _localctx: Param_listContext = new Param_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 100, BNGParser.RULE_param_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1000;
			this.match(BNGParser.STRING);
			this.state = 1005;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1001;
				this.match(BNGParser.COMMA);
				this.state = 1002;
				this.match(BNGParser.STRING);
				}
				}
				this.state = 1007;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public compartments_block(): Compartments_blockContext {
		let _localctx: Compartments_blockContext = new Compartments_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 102, BNGParser.RULE_compartments_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1008;
			this.match(BNGParser.BEGIN);
			this.state = 1009;
			this.match(BNGParser.COMPARTMENTS);
			this.state = 1011;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1010;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1013;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1023;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING) {
				{
				{
				this.state = 1015;
				this.compartment_def();
				this.state = 1017;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1016;
					this.match(BNGParser.LB);
					}
					}
					this.state = 1019;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 1025;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1026;
			this.match(BNGParser.END);
			this.state = 1027;
			this.match(BNGParser.COMPARTMENTS);
			this.state = 1031;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1028;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1033;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public compartment_def(): Compartment_defContext {
		let _localctx: Compartment_defContext = new Compartment_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 104, BNGParser.RULE_compartment_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1036;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 148, this._ctx) ) {
			case 1:
				{
				this.state = 1034;
				this.match(BNGParser.STRING);
				this.state = 1035;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 1038;
			this.match(BNGParser.STRING);
			this.state = 1039;
			this.match(BNGParser.INT);
			this.state = 1040;
			this.expression();
			this.state = 1042;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 1041;
				this.match(BNGParser.STRING);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public energy_patterns_block(): Energy_patterns_blockContext {
		let _localctx: Energy_patterns_blockContext = new Energy_patterns_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 106, BNGParser.RULE_energy_patterns_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1044;
			this.match(BNGParser.BEGIN);
			this.state = 1045;
			this.match(BNGParser.ENERGY);
			this.state = 1046;
			this.match(BNGParser.PATTERNS);
			this.state = 1048;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1047;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1050;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1060;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 190)) & ~0x1F) === 0 && ((1 << (_la - 190)) & ((1 << (BNGParser.STRING - 190)) | (1 << (BNGParser.AT - 190)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 190)))) !== 0)) {
				{
				{
				this.state = 1052;
				this.energy_pattern_def();
				this.state = 1054;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1053;
					this.match(BNGParser.LB);
					}
					}
					this.state = 1056;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 1062;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1063;
			this.match(BNGParser.END);
			this.state = 1064;
			this.match(BNGParser.ENERGY);
			this.state = 1065;
			this.match(BNGParser.PATTERNS);
			this.state = 1069;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1066;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1071;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public energy_pattern_def(): Energy_pattern_defContext {
		let _localctx: Energy_pattern_defContext = new Energy_pattern_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 108, BNGParser.RULE_energy_pattern_def);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1074;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 154, this._ctx) ) {
			case 1:
				{
				this.state = 1072;
				this.match(BNGParser.STRING);
				this.state = 1073;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 1076;
			this.species_def();
			this.state = 1077;
			this.expression();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public population_maps_block(): Population_maps_blockContext {
		let _localctx: Population_maps_blockContext = new Population_maps_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 110, BNGParser.RULE_population_maps_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1079;
			this.match(BNGParser.BEGIN);
			this.state = 1080;
			this.match(BNGParser.POPULATION);
			this.state = 1081;
			this.match(BNGParser.MAPS);
			this.state = 1083;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1082;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1085;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1095;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || ((((_la - 190)) & ~0x1F) === 0 && ((1 << (_la - 190)) & ((1 << (BNGParser.STRING - 190)) | (1 << (BNGParser.AT - 190)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 190)))) !== 0)) {
				{
				{
				this.state = 1087;
				this.population_map_def();
				this.state = 1089;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1088;
					this.match(BNGParser.LB);
					}
					}
					this.state = 1091;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 1097;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1098;
			this.match(BNGParser.END);
			this.state = 1099;
			this.match(BNGParser.POPULATION);
			this.state = 1100;
			this.match(BNGParser.MAPS);
			this.state = 1104;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1101;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1106;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public population_map_def(): Population_map_defContext {
		let _localctx: Population_map_defContext = new Population_map_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 112, BNGParser.RULE_population_map_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1109;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 159, this._ctx) ) {
			case 1:
				{
				this.state = 1107;
				this.match(BNGParser.STRING);
				this.state = 1108;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 1111;
			this.species_def();
			this.state = 1112;
			this.match(BNGParser.UNI_REACTION_SIGN);
			this.state = 1113;
			this.match(BNGParser.STRING);
			this.state = 1114;
			this.match(BNGParser.LPAREN);
			this.state = 1116;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 1115;
				this.param_list();
				}
			}

			this.state = 1118;
			this.match(BNGParser.RPAREN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public population_types_block(): Population_types_blockContext {
		let _localctx: Population_types_blockContext = new Population_types_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 114, BNGParser.RULE_population_types_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1120;
			this.match(BNGParser.BEGIN);
			this.state = 1121;
			this.match(BNGParser.POPULATION);
			this.state = 1122;
			this.match(BNGParser.TYPES);
			this.state = 1124;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1123;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1126;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1136;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS))) !== 0) || _la === BNGParser.STRING) {
				{
				{
				this.state = 1128;
				this.population_type_def();
				this.state = 1130;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1129;
					this.match(BNGParser.LB);
					}
					}
					this.state = 1132;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 1138;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1139;
			this.match(BNGParser.END);
			this.state = 1140;
			this.match(BNGParser.POPULATION);
			this.state = 1141;
			this.match(BNGParser.TYPES);
			this.state = 1145;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1142;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1147;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public population_type_def(): Population_type_defContext {
		let _localctx: Population_type_defContext = new Population_type_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 116, BNGParser.RULE_population_type_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1148;
			this.molecule_def();
			this.state = 1150;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 1149;
				this.match(BNGParser.STRING);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public actions_block(): Actions_blockContext {
		let _localctx: Actions_blockContext = new Actions_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 118, BNGParser.RULE_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1153;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1152;
				this.action_command();
				}
				}
				this.state = 1155;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (((((_la - 38)) & ~0x1F) === 0 && ((1 << (_la - 38)) & ((1 << (BNGParser.SET_OPTION - 38)) | (1 << (BNGParser.GENERATENETWORK - 38)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 38)) | (1 << (BNGParser.SIMULATE - 38)))) !== 0) || ((((_la - 77)) & ~0x1F) === 0 && ((1 << (_la - 77)) & ((1 << (BNGParser.SIMULATE_ODE - 77)) | (1 << (BNGParser.SIMULATE_SSA - 77)) | (1 << (BNGParser.SIMULATE_PLA - 77)) | (1 << (BNGParser.SIMULATE_NF - 77)) | (1 << (BNGParser.SIMULATE_RM - 77)) | (1 << (BNGParser.PARAMETER_SCAN - 77)) | (1 << (BNGParser.BIFURCATE - 77)) | (1 << (BNGParser.READFILE - 77)))) !== 0) || ((((_la - 110)) & ~0x1F) === 0 && ((1 << (_la - 110)) & ((1 << (BNGParser.VISUALIZE - 110)) | (1 << (BNGParser.WRITEFILE - 110)) | (1 << (BNGParser.WRITEMODEL - 110)) | (1 << (BNGParser.WRITEXML - 110)) | (1 << (BNGParser.WRITENETWORK - 110)) | (1 << (BNGParser.WRITESBML - 110)) | (1 << (BNGParser.WRITEMDL - 110)) | (1 << (BNGParser.WRITELATEX - 110)) | (1 << (BNGParser.WRITEMFILE - 110)) | (1 << (BNGParser.WRITEMEXFILE - 110)) | (1 << (BNGParser.SETCONCENTRATION - 110)))) !== 0) || ((((_la - 142)) & ~0x1F) === 0 && ((1 << (_la - 142)) & ((1 << (BNGParser.ADDCONCENTRATION - 142)) | (1 << (BNGParser.SAVECONCENTRATIONS - 142)) | (1 << (BNGParser.RESETCONCENTRATIONS - 142)) | (1 << (BNGParser.SETPARAMETER - 142)) | (1 << (BNGParser.SAVEPARAMETERS - 142)) | (1 << (BNGParser.RESETPARAMETERS - 142)) | (1 << (BNGParser.SETVOLUME - 142)) | (1 << (BNGParser.SIMULATE_PSA - 142)) | (1 << (BNGParser.QUIT - 142)))) !== 0));
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public wrapped_actions_block(): Wrapped_actions_blockContext {
		let _localctx: Wrapped_actions_blockContext = new Wrapped_actions_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 120, BNGParser.RULE_wrapped_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1157;
			this.match(BNGParser.BEGIN);
			this.state = 1158;
			this.match(BNGParser.ACTIONS);
			this.state = 1160;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1159;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1162;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1167;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 38)) & ~0x1F) === 0 && ((1 << (_la - 38)) & ((1 << (BNGParser.SET_OPTION - 38)) | (1 << (BNGParser.GENERATENETWORK - 38)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 38)) | (1 << (BNGParser.SIMULATE - 38)))) !== 0) || ((((_la - 77)) & ~0x1F) === 0 && ((1 << (_la - 77)) & ((1 << (BNGParser.SIMULATE_ODE - 77)) | (1 << (BNGParser.SIMULATE_SSA - 77)) | (1 << (BNGParser.SIMULATE_PLA - 77)) | (1 << (BNGParser.SIMULATE_NF - 77)) | (1 << (BNGParser.SIMULATE_RM - 77)) | (1 << (BNGParser.PARAMETER_SCAN - 77)) | (1 << (BNGParser.BIFURCATE - 77)) | (1 << (BNGParser.READFILE - 77)))) !== 0) || ((((_la - 110)) & ~0x1F) === 0 && ((1 << (_la - 110)) & ((1 << (BNGParser.VISUALIZE - 110)) | (1 << (BNGParser.WRITEFILE - 110)) | (1 << (BNGParser.WRITEMODEL - 110)) | (1 << (BNGParser.WRITEXML - 110)) | (1 << (BNGParser.WRITENETWORK - 110)) | (1 << (BNGParser.WRITESBML - 110)) | (1 << (BNGParser.WRITEMDL - 110)) | (1 << (BNGParser.WRITELATEX - 110)) | (1 << (BNGParser.WRITEMFILE - 110)) | (1 << (BNGParser.WRITEMEXFILE - 110)) | (1 << (BNGParser.SETCONCENTRATION - 110)))) !== 0) || ((((_la - 142)) & ~0x1F) === 0 && ((1 << (_la - 142)) & ((1 << (BNGParser.ADDCONCENTRATION - 142)) | (1 << (BNGParser.SAVECONCENTRATIONS - 142)) | (1 << (BNGParser.RESETCONCENTRATIONS - 142)) | (1 << (BNGParser.SETPARAMETER - 142)) | (1 << (BNGParser.SAVEPARAMETERS - 142)) | (1 << (BNGParser.RESETPARAMETERS - 142)) | (1 << (BNGParser.SETVOLUME - 142)) | (1 << (BNGParser.SIMULATE_PSA - 142)) | (1 << (BNGParser.QUIT - 142)))) !== 0)) {
				{
				{
				this.state = 1164;
				this.action_command();
				}
				}
				this.state = 1169;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1170;
			this.match(BNGParser.END);
			this.state = 1171;
			this.match(BNGParser.ACTIONS);
			this.state = 1175;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1172;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1177;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public begin_actions_block(): Begin_actions_blockContext {
		let _localctx: Begin_actions_blockContext = new Begin_actions_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 122, BNGParser.RULE_begin_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1178;
			this.match(BNGParser.BEGIN);
			this.state = 1179;
			this.match(BNGParser.ACTIONS);
			this.state = 1181;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1180;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1183;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1188;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 38)) & ~0x1F) === 0 && ((1 << (_la - 38)) & ((1 << (BNGParser.SET_OPTION - 38)) | (1 << (BNGParser.GENERATENETWORK - 38)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 38)) | (1 << (BNGParser.SIMULATE - 38)))) !== 0) || ((((_la - 77)) & ~0x1F) === 0 && ((1 << (_la - 77)) & ((1 << (BNGParser.SIMULATE_ODE - 77)) | (1 << (BNGParser.SIMULATE_SSA - 77)) | (1 << (BNGParser.SIMULATE_PLA - 77)) | (1 << (BNGParser.SIMULATE_NF - 77)) | (1 << (BNGParser.SIMULATE_RM - 77)) | (1 << (BNGParser.PARAMETER_SCAN - 77)) | (1 << (BNGParser.BIFURCATE - 77)) | (1 << (BNGParser.READFILE - 77)))) !== 0) || ((((_la - 110)) & ~0x1F) === 0 && ((1 << (_la - 110)) & ((1 << (BNGParser.VISUALIZE - 110)) | (1 << (BNGParser.WRITEFILE - 110)) | (1 << (BNGParser.WRITEMODEL - 110)) | (1 << (BNGParser.WRITEXML - 110)) | (1 << (BNGParser.WRITENETWORK - 110)) | (1 << (BNGParser.WRITESBML - 110)) | (1 << (BNGParser.WRITEMDL - 110)) | (1 << (BNGParser.WRITELATEX - 110)) | (1 << (BNGParser.WRITEMFILE - 110)) | (1 << (BNGParser.WRITEMEXFILE - 110)) | (1 << (BNGParser.SETCONCENTRATION - 110)))) !== 0) || ((((_la - 142)) & ~0x1F) === 0 && ((1 << (_la - 142)) & ((1 << (BNGParser.ADDCONCENTRATION - 142)) | (1 << (BNGParser.SAVECONCENTRATIONS - 142)) | (1 << (BNGParser.RESETCONCENTRATIONS - 142)) | (1 << (BNGParser.SETPARAMETER - 142)) | (1 << (BNGParser.SAVEPARAMETERS - 142)) | (1 << (BNGParser.RESETPARAMETERS - 142)) | (1 << (BNGParser.SETVOLUME - 142)) | (1 << (BNGParser.SIMULATE_PSA - 142)) | (1 << (BNGParser.QUIT - 142)))) !== 0)) {
				{
				{
				this.state = 1185;
				this.action_command();
				}
				}
				this.state = 1190;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1191;
			this.match(BNGParser.END);
			this.state = 1192;
			this.match(BNGParser.ACTIONS);
			this.state = 1196;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1193;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1198;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public action_command(): Action_commandContext {
		let _localctx: Action_commandContext = new Action_commandContext(this._ctx, this.state);
		this.enterRule(_localctx, 124, BNGParser.RULE_action_command);
		try {
			this.state = 1206;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 173, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1199;
				this.generate_network_cmd();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1200;
				this.generate_hybrid_model_cmd();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1201;
				this.simulate_cmd();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1202;
				this.write_cmd();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1203;
				this.set_cmd();
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 1204;
				this.other_action_cmd();
				}
				break;

			case 7:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 1205;
				this.set_option_cmd();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public generate_network_cmd(): Generate_network_cmdContext {
		let _localctx: Generate_network_cmdContext = new Generate_network_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 126, BNGParser.RULE_generate_network_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1208;
			this.match(BNGParser.GENERATENETWORK);
			this.state = 1209;
			this.match(BNGParser.LPAREN);
			this.state = 1211;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 1210;
				this.action_args();
				}
			}

			this.state = 1213;
			this.match(BNGParser.RPAREN);
			this.state = 1215;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1214;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1220;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1217;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1222;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public generate_hybrid_model_cmd(): Generate_hybrid_model_cmdContext {
		let _localctx: Generate_hybrid_model_cmdContext = new Generate_hybrid_model_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 128, BNGParser.RULE_generate_hybrid_model_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1223;
			this.match(BNGParser.GENERATEHYBRIDMODEL);
			this.state = 1224;
			this.match(BNGParser.LPAREN);
			this.state = 1226;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 1225;
				this.action_args();
				}
			}

			this.state = 1228;
			this.match(BNGParser.RPAREN);
			this.state = 1230;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1229;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1235;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1232;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1237;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public simulate_cmd(): Simulate_cmdContext {
		let _localctx: Simulate_cmdContext = new Simulate_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 130, BNGParser.RULE_simulate_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1238;
			_la = this._input.LA(1);
			if (!(((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & ((1 << (BNGParser.SIMULATE - 53)) | (1 << (BNGParser.SIMULATE_ODE - 53)) | (1 << (BNGParser.SIMULATE_SSA - 53)) | (1 << (BNGParser.SIMULATE_PLA - 53)))) !== 0) || _la === BNGParser.SIMULATE_NF || _la === BNGParser.SIMULATE_RM || _la === BNGParser.SIMULATE_PSA)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1239;
			this.match(BNGParser.LPAREN);
			this.state = 1241;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 1240;
				this.action_args();
				}
			}

			this.state = 1243;
			this.match(BNGParser.RPAREN);
			this.state = 1245;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1244;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1250;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1247;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1252;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public write_cmd(): Write_cmdContext {
		let _localctx: Write_cmdContext = new Write_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 132, BNGParser.RULE_write_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1253;
			_la = this._input.LA(1);
			if (!(((((_la - 118)) & ~0x1F) === 0 && ((1 << (_la - 118)) & ((1 << (BNGParser.WRITEFILE - 118)) | (1 << (BNGParser.WRITEMODEL - 118)) | (1 << (BNGParser.WRITEXML - 118)) | (1 << (BNGParser.WRITENETWORK - 118)) | (1 << (BNGParser.WRITESBML - 118)) | (1 << (BNGParser.WRITELATEX - 118)) | (1 << (BNGParser.WRITEMFILE - 118)) | (1 << (BNGParser.WRITEMEXFILE - 118)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1254;
			this.match(BNGParser.LPAREN);
			this.state = 1256;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 1255;
				this.action_args();
				}
			}

			this.state = 1258;
			this.match(BNGParser.RPAREN);
			this.state = 1260;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1259;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1265;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1262;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1267;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public set_cmd(): Set_cmdContext {
		let _localctx: Set_cmdContext = new Set_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 134, BNGParser.RULE_set_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1268;
			_la = this._input.LA(1);
			if (!(((((_la - 141)) & ~0x1F) === 0 && ((1 << (_la - 141)) & ((1 << (BNGParser.SETCONCENTRATION - 141)) | (1 << (BNGParser.ADDCONCENTRATION - 141)) | (1 << (BNGParser.SETPARAMETER - 141)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1269;
			this.match(BNGParser.LPAREN);
			this.state = 1270;
			this.match(BNGParser.DBQUOTES);
			this.state = 1277;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 187, this._ctx) ) {
			case 1:
				{
				this.state = 1271;
				this.species_def();
				}
				break;

			case 2:
				{
				this.state = 1273;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1272;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 1275;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0));
				}
				break;
			}
			this.state = 1279;
			this.match(BNGParser.DBQUOTES);
			this.state = 1280;
			this.match(BNGParser.COMMA);
			this.state = 1290;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.PREFIX:
			case BNGParser.SUFFIX:
			case BNGParser.OVERWRITE:
			case BNGParser.MAX_AGG:
			case BNGParser.MAX_ITER:
			case BNGParser.MAX_STOICH:
			case BNGParser.PRINT_ITER:
			case BNGParser.CHECK_ISO:
			case BNGParser.SAFE:
			case BNGParser.EXECUTE:
			case BNGParser.METHOD:
			case BNGParser.VERBOSE:
			case BNGParser.NETFILE:
			case BNGParser.CONTINUE:
			case BNGParser.T_START:
			case BNGParser.T_END:
			case BNGParser.N_STEPS:
			case BNGParser.N_OUTPUT_STEPS:
			case BNGParser.MAX_SIM_STEPS:
			case BNGParser.OUTPUT_STEP_INTERVAL:
			case BNGParser.SAMPLE_TIMES:
			case BNGParser.SAVE_PROGRESS:
			case BNGParser.PRINT_CDAT:
			case BNGParser.PRINT_FUNCTIONS:
			case BNGParser.PRINT_NET:
			case BNGParser.PRINT_END:
			case BNGParser.STOP_IF:
			case BNGParser.PRINT_ON_STOP:
			case BNGParser.ATOL:
			case BNGParser.RTOL:
			case BNGParser.STEADY_STATE:
			case BNGParser.SPARSE:
			case BNGParser.PLA_CONFIG:
			case BNGParser.PLA_OUTPUT:
			case BNGParser.PARAM:
			case BNGParser.COMPLEX:
			case BNGParser.GET_FINAL_STATE:
			case BNGParser.GML:
			case BNGParser.NOCSLF:
			case BNGParser.NOTF:
			case BNGParser.BINARY_OUTPUT:
			case BNGParser.UTL:
			case BNGParser.EQUIL:
			case BNGParser.PARAMETER:
			case BNGParser.PAR_MIN:
			case BNGParser.PAR_MAX:
			case BNGParser.N_SCAN_PTS:
			case BNGParser.LOG_SCALE:
			case BNGParser.RESET_CONC:
			case BNGParser.FILE:
			case BNGParser.ATOMIZE:
			case BNGParser.BLOCKS:
			case BNGParser.SKIPACTIONS:
			case BNGParser.TYPE:
			case BNGParser.BACKGROUND:
			case BNGParser.COLLAPSE:
			case BNGParser.OPTS:
			case BNGParser.FORMAT:
			case BNGParser.INCLUDE_MODEL:
			case BNGParser.INCLUDE_NETWORK:
			case BNGParser.PRETTY_FORMATTING:
			case BNGParser.EVALUATE_EXPRESSIONS:
			case BNGParser.TEXTREACTION:
			case BNGParser.TEXTSPECIES:
			case BNGParser.BDF:
			case BNGParser.MAX_STEP:
			case BNGParser.MAXORDER:
			case BNGParser.STATS:
			case BNGParser.MAX_NUM_STEPS:
			case BNGParser.MAX_ERR_TEST_FAILS:
			case BNGParser.MAX_CONV_FAILS:
			case BNGParser.STIFF:
			case BNGParser.SAT:
			case BNGParser.MM:
			case BNGParser.HILL:
			case BNGParser.ARRHENIUS:
			case BNGParser.MRATIO:
			case BNGParser.TFUN:
			case BNGParser.FUNCTIONPRODUCT:
			case BNGParser.IF:
			case BNGParser.EXP:
			case BNGParser.LN:
			case BNGParser.LOG10:
			case BNGParser.LOG2:
			case BNGParser.SQRT:
			case BNGParser.RINT:
			case BNGParser.ABS:
			case BNGParser.SIN:
			case BNGParser.COS:
			case BNGParser.TAN:
			case BNGParser.ASIN:
			case BNGParser.ACOS:
			case BNGParser.ATAN:
			case BNGParser.SINH:
			case BNGParser.COSH:
			case BNGParser.TANH:
			case BNGParser.ASINH:
			case BNGParser.ACOSH:
			case BNGParser.ATANH:
			case BNGParser.PI:
			case BNGParser.EULERIAN:
			case BNGParser.MIN:
			case BNGParser.MAX:
			case BNGParser.SUM:
			case BNGParser.AVG:
			case BNGParser.TIME:
			case BNGParser.FLOAT:
			case BNGParser.INT:
			case BNGParser.STRING:
			case BNGParser.LPAREN:
			case BNGParser.TILDE:
			case BNGParser.MINUS:
			case BNGParser.PLUS:
			case BNGParser.EMARK:
				{
				this.state = 1281;
				this.expression();
				}
				break;
			case BNGParser.DBQUOTES:
				{
				this.state = 1282;
				this.match(BNGParser.DBQUOTES);
				this.state = 1286;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
					{
					{
					this.state = 1283;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 1288;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1289;
				this.match(BNGParser.DBQUOTES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 1292;
			this.match(BNGParser.RPAREN);
			this.state = 1294;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1293;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1299;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1296;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1301;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public other_action_cmd(): Other_action_cmdContext {
		let _localctx: Other_action_cmdContext = new Other_action_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 136, BNGParser.RULE_other_action_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1302;
			_la = this._input.LA(1);
			if (!(_la === BNGParser.SET_OPTION || _la === BNGParser.GENERATEHYBRIDMODEL || ((((_la - 97)) & ~0x1F) === 0 && ((1 << (_la - 97)) & ((1 << (BNGParser.PARAMETER_SCAN - 97)) | (1 << (BNGParser.BIFURCATE - 97)) | (1 << (BNGParser.READFILE - 97)) | (1 << (BNGParser.VISUALIZE - 97)) | (1 << (BNGParser.WRITEMDL - 97)))) !== 0) || ((((_la - 143)) & ~0x1F) === 0 && ((1 << (_la - 143)) & ((1 << (BNGParser.SAVECONCENTRATIONS - 143)) | (1 << (BNGParser.RESETCONCENTRATIONS - 143)) | (1 << (BNGParser.SAVEPARAMETERS - 143)) | (1 << (BNGParser.RESETPARAMETERS - 143)) | (1 << (BNGParser.SETVOLUME - 143)) | (1 << (BNGParser.QUIT - 143)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1303;
			this.match(BNGParser.LPAREN);
			this.state = 1306;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 192, this._ctx) ) {
			case 1:
				{
				this.state = 1304;
				this.action_args();
				}
				break;

			case 2:
				{
				this.state = 1305;
				this.action_arg_value();
				}
				break;
			}
			this.state = 1308;
			this.match(BNGParser.RPAREN);
			this.state = 1310;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1309;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1315;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1312;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1317;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public set_option_cmd(): Set_option_cmdContext {
		let _localctx: Set_option_cmdContext = new Set_option_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 138, BNGParser.RULE_set_option_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1318;
			this.match(BNGParser.SET_OPTION);
			this.state = 1319;
			this.match(BNGParser.LPAREN);
			this.state = 1320;
			this.match(BNGParser.DBQUOTES);
			this.state = 1324;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
				{
				{
				this.state = 1321;
				_la = this._input.LA(1);
				if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				}
				}
				this.state = 1326;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1327;
			this.match(BNGParser.DBQUOTES);
			this.state = 1328;
			this.match(BNGParser.COMMA);
			this.state = 1329;
			this.match(BNGParser.DBQUOTES);
			this.state = 1333;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
				{
				{
				this.state = 1330;
				_la = this._input.LA(1);
				if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				}
				}
				this.state = 1335;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1336;
			this.match(BNGParser.DBQUOTES);
			this.state = 1337;
			this.match(BNGParser.RPAREN);
			this.state = 1339;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1338;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1344;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1341;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1346;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public action_args(): Action_argsContext {
		let _localctx: Action_argsContext = new Action_argsContext(this._ctx, this.state);
		this.enterRule(_localctx, 140, BNGParser.RULE_action_args);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1347;
			this.match(BNGParser.LBRACKET);
			this.state = 1349;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)))) !== 0) || _la === BNGParser.TIME || _la === BNGParser.STRING) {
				{
				this.state = 1348;
				this.action_arg_list();
				}
			}

			this.state = 1351;
			this.match(BNGParser.RBRACKET);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public action_arg_list(): Action_arg_listContext {
		let _localctx: Action_arg_listContext = new Action_arg_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 142, BNGParser.RULE_action_arg_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1353;
			this.action_arg();
			this.state = 1358;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1354;
				this.match(BNGParser.COMMA);
				this.state = 1355;
				this.action_arg();
				}
				}
				this.state = 1360;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public action_arg(): Action_argContext {
		let _localctx: Action_argContext = new Action_argContext(this._ctx, this.state);
		this.enterRule(_localctx, 144, BNGParser.RULE_action_arg);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1361;
			this.arg_name();
			this.state = 1362;
			this.match(BNGParser.ASSIGNS);
			this.state = 1363;
			this.action_arg_value();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public action_arg_value(): Action_arg_valueContext {
		let _localctx: Action_arg_valueContext = new Action_arg_valueContext(this._ctx, this.state);
		this.enterRule(_localctx, 146, BNGParser.RULE_action_arg_value);
		let _la: number;
		try {
			this.state = 1392;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 204, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1365;
				this.expression();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1366;
				this.keyword_as_value();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1367;
				this.match(BNGParser.DBQUOTES);
				this.state = 1371;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.SQUOTE - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
					{
					{
					this.state = 1368;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.DBQUOTES)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 1373;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1374;
				this.match(BNGParser.DBQUOTES);
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1375;
				this.match(BNGParser.SQUOTE);
				this.state = 1379;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.COUNTER) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MOLECULAR) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.INCLUDE_REACTANTS - 32)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.T_END - 64)) | (1 << (BNGParser.N_STEPS - 64)) | (1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.EQUIL - 96)) | (1 << (BNGParser.PARAMETER_SCAN - 96)) | (1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.EVALUATE_EXPRESSIONS - 128)) | (1 << (BNGParser.TEXTREACTION - 128)) | (1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.SETVOLUME - 128)) | (1 << (BNGParser.SIMULATE_PSA - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.PRIORITY - 160)) | (1 << (BNGParser.IF - 160)) | (1 << (BNGParser.EXP - 160)) | (1 << (BNGParser.LN - 160)) | (1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.COLON - 192)) | (1 << (BNGParser.LSBRACKET - 192)) | (1 << (BNGParser.RSBRACKET - 192)) | (1 << (BNGParser.LBRACKET - 192)) | (1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOLECULE_TAG_TOKEN - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)))) !== 0) || ((((_la - 224)) & ~0x1F) === 0 && ((1 << (_la - 224)) & ((1 << (BNGParser.QMARK - 224)) | (1 << (BNGParser.EMARK - 224)) | (1 << (BNGParser.DBQUOTES - 224)) | (1 << (BNGParser.AMPERSAND - 224)) | (1 << (BNGParser.VERSION_NUMBER - 224)) | (1 << (BNGParser.ULB - 224)))) !== 0)) {
					{
					{
					this.state = 1376;
					_la = this._input.LA(1);
					if (_la <= 0 || (_la === BNGParser.SQUOTE)) {
					this._errHandler.recoverInline(this);
					} else {
						if (this._input.LA(1) === Token.EOF) {
							this.matchedEOF = true;
						}

						this._errHandler.reportMatch(this);
						this.consume();
					}
					}
					}
					this.state = 1381;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1382;
				this.match(BNGParser.SQUOTE);
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1383;
				this.match(BNGParser.LSBRACKET);
				this.state = 1384;
				this.expression_list();
				this.state = 1385;
				this.match(BNGParser.RSBRACKET);
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 1387;
				this.match(BNGParser.LBRACKET);
				this.state = 1389;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)))) !== 0) || _la === BNGParser.TIME || _la === BNGParser.STRING) {
					{
					this.state = 1388;
					this.nested_hash_list();
					}
				}

				this.state = 1391;
				this.match(BNGParser.RBRACKET);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public keyword_as_value(): Keyword_as_valueContext {
		let _localctx: Keyword_as_valueContext = new Keyword_as_valueContext(this._ctx, this.state);
		this.enterRule(_localctx, 148, BNGParser.RULE_keyword_as_value);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1394;
			_la = this._input.LA(1);
			if (!(((((_la - 44)) & ~0x1F) === 0 && ((1 << (_la - 44)) & ((1 << (BNGParser.OVERWRITE - 44)) | (1 << (BNGParser.SAFE - 44)) | (1 << (BNGParser.EXECUTE - 44)) | (1 << (BNGParser.METHOD - 44)) | (1 << (BNGParser.ODE - 44)) | (1 << (BNGParser.SSA - 44)) | (1 << (BNGParser.PLA - 44)) | (1 << (BNGParser.NF - 44)) | (1 << (BNGParser.VERBOSE - 44)) | (1 << (BNGParser.CONTINUE - 44)))) !== 0) || ((((_la - 80)) & ~0x1F) === 0 && ((1 << (_la - 80)) & ((1 << (BNGParser.STEADY_STATE - 80)) | (1 << (BNGParser.SPARSE - 80)) | (1 << (BNGParser.BINARY_OUTPUT - 80)))) !== 0) || ((((_la - 133)) & ~0x1F) === 0 && ((1 << (_la - 133)) & ((1 << (BNGParser.BDF - 133)) | (1 << (BNGParser.STIFF - 133)) | (1 << (BNGParser.TRUE - 133)) | (1 << (BNGParser.FALSE - 133)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public nested_hash_list(): Nested_hash_listContext {
		let _localctx: Nested_hash_listContext = new Nested_hash_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 150, BNGParser.RULE_nested_hash_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1396;
			this.nested_hash_item();
			this.state = 1401;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1397;
				this.match(BNGParser.COMMA);
				this.state = 1398;
				this.nested_hash_item();
				}
				}
				this.state = 1403;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public nested_hash_item(): Nested_hash_itemContext {
		let _localctx: Nested_hash_itemContext = new Nested_hash_itemContext(this._ctx, this.state);
		this.enterRule(_localctx, 152, BNGParser.RULE_nested_hash_item);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1406;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 206, this._ctx) ) {
			case 1:
				{
				this.state = 1404;
				this.match(BNGParser.STRING);
				}
				break;

			case 2:
				{
				this.state = 1405;
				this.arg_name();
				}
				break;
			}
			this.state = 1408;
			this.match(BNGParser.ASSIGNS);
			this.state = 1409;
			this.action_arg_value();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public arg_name(): Arg_nameContext {
		let _localctx: Arg_nameContext = new Arg_nameContext(this._ctx, this.state);
		this.enterRule(_localctx, 154, BNGParser.RULE_arg_name);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1411;
			_la = this._input.LA(1);
			if (!(((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)))) !== 0) || _la === BNGParser.TIME || _la === BNGParser.STRING)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public expression_list(): Expression_listContext {
		let _localctx: Expression_listContext = new Expression_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 156, BNGParser.RULE_expression_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1413;
			this.expression();
			this.state = 1418;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1414;
				this.match(BNGParser.COMMA);
				this.state = 1415;
				this.expression();
				}
				}
				this.state = 1420;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public expression(): ExpressionContext {
		let _localctx: ExpressionContext = new ExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 158, BNGParser.RULE_expression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1421;
			this.conditional_expr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public conditional_expr(): Conditional_exprContext {
		let _localctx: Conditional_exprContext = new Conditional_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 160, BNGParser.RULE_conditional_expr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1423;
			this.or_expr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public or_expr(): Or_exprContext {
		let _localctx: Or_exprContext = new Or_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 162, BNGParser.RULE_or_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1425;
			this.and_expr();
			this.state = 1430;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LOGICAL_OR) {
				{
				{
				this.state = 1426;
				this.match(BNGParser.LOGICAL_OR);
				this.state = 1427;
				this.and_expr();
				}
				}
				this.state = 1432;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public and_expr(): And_exprContext {
		let _localctx: And_exprContext = new And_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 164, BNGParser.RULE_and_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1433;
			this.equality_expr();
			this.state = 1438;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LOGICAL_AND) {
				{
				{
				this.state = 1434;
				this.match(BNGParser.LOGICAL_AND);
				this.state = 1435;
				this.equality_expr();
				}
				}
				this.state = 1440;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public equality_expr(): Equality_exprContext {
		let _localctx: Equality_exprContext = new Equality_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 166, BNGParser.RULE_equality_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1441;
			this.relational_expr();
			this.state = 1446;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 206)) & ~0x1F) === 0 && ((1 << (_la - 206)) & ((1 << (BNGParser.GTE - 206)) | (1 << (BNGParser.GT - 206)) | (1 << (BNGParser.LTE - 206)) | (1 << (BNGParser.LT - 206)) | (1 << (BNGParser.EQUALS - 206)) | (1 << (BNGParser.NOT_EQUALS - 206)))) !== 0)) {
				{
				{
				this.state = 1442;
				_la = this._input.LA(1);
				if (!(((((_la - 206)) & ~0x1F) === 0 && ((1 << (_la - 206)) & ((1 << (BNGParser.GTE - 206)) | (1 << (BNGParser.GT - 206)) | (1 << (BNGParser.LTE - 206)) | (1 << (BNGParser.LT - 206)) | (1 << (BNGParser.EQUALS - 206)) | (1 << (BNGParser.NOT_EQUALS - 206)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 1443;
				this.relational_expr();
				}
				}
				this.state = 1448;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public relational_expr(): Relational_exprContext {
		let _localctx: Relational_exprContext = new Relational_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 168, BNGParser.RULE_relational_expr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1449;
			this.additive_expr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public additive_expr(): Additive_exprContext {
		let _localctx: Additive_exprContext = new Additive_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 170, BNGParser.RULE_additive_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1451;
			this.multiplicative_expr();
			this.state = 1456;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.MINUS || _la === BNGParser.PLUS) {
				{
				{
				this.state = 1452;
				_la = this._input.LA(1);
				if (!(_la === BNGParser.MINUS || _la === BNGParser.PLUS)) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 1453;
				this.multiplicative_expr();
				}
				}
				this.state = 1458;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public multiplicative_expr(): Multiplicative_exprContext {
		let _localctx: Multiplicative_exprContext = new Multiplicative_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 172, BNGParser.RULE_multiplicative_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1459;
			this.power_expr();
			this.state = 1464;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 216)) & ~0x1F) === 0 && ((1 << (_la - 216)) & ((1 << (BNGParser.DIV - 216)) | (1 << (BNGParser.TIMES - 216)) | (1 << (BNGParser.MOD - 216)))) !== 0)) {
				{
				{
				this.state = 1460;
				_la = this._input.LA(1);
				if (!(((((_la - 216)) & ~0x1F) === 0 && ((1 << (_la - 216)) & ((1 << (BNGParser.DIV - 216)) | (1 << (BNGParser.TIMES - 216)) | (1 << (BNGParser.MOD - 216)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 1461;
				this.power_expr();
				}
				}
				this.state = 1466;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public power_expr(): Power_exprContext {
		let _localctx: Power_exprContext = new Power_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 174, BNGParser.RULE_power_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1467;
			this.unary_expr();
			this.state = 1472;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.POWER) {
				{
				{
				this.state = 1468;
				this.match(BNGParser.POWER);
				this.state = 1469;
				this.unary_expr();
				}
				}
				this.state = 1474;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public unary_expr(): Unary_exprContext {
		let _localctx: Unary_exprContext = new Unary_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 176, BNGParser.RULE_unary_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1476;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 204)) & ~0x1F) === 0 && ((1 << (_la - 204)) & ((1 << (BNGParser.TILDE - 204)) | (1 << (BNGParser.MINUS - 204)) | (1 << (BNGParser.PLUS - 204)) | (1 << (BNGParser.EMARK - 204)))) !== 0)) {
				{
				this.state = 1475;
				_la = this._input.LA(1);
				if (!(((((_la - 204)) & ~0x1F) === 0 && ((1 << (_la - 204)) & ((1 << (BNGParser.TILDE - 204)) | (1 << (BNGParser.MINUS - 204)) | (1 << (BNGParser.PLUS - 204)) | (1 << (BNGParser.EMARK - 204)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				}
			}

			this.state = 1478;
			this.primary_expr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public primary_expr(): Primary_exprContext {
		let _localctx: Primary_exprContext = new Primary_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 178, BNGParser.RULE_primary_expr);
		try {
			this.state = 1488;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 215, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1480;
				this.match(BNGParser.LPAREN);
				this.state = 1481;
				this.expression();
				this.state = 1482;
				this.match(BNGParser.RPAREN);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1484;
				this.function_call();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1485;
				this.observable_ref();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1486;
				this.literal();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1487;
				this.arg_name();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public function_call(): Function_callContext {
		let _localctx: Function_callContext = new Function_callContext(this._ctx, this.state);
		this.enterRule(_localctx, 180, BNGParser.RULE_function_call);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1490;
			_la = this._input.LA(1);
			if (!(((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & ((1 << (BNGParser.SAT - 153)) | (1 << (BNGParser.MM - 153)) | (1 << (BNGParser.HILL - 153)) | (1 << (BNGParser.ARRHENIUS - 153)) | (1 << (BNGParser.MRATIO - 153)) | (1 << (BNGParser.TFUN - 153)) | (1 << (BNGParser.FUNCTIONPRODUCT - 153)) | (1 << (BNGParser.IF - 153)) | (1 << (BNGParser.EXP - 153)) | (1 << (BNGParser.LN - 153)) | (1 << (BNGParser.LOG10 - 153)) | (1 << (BNGParser.LOG2 - 153)) | (1 << (BNGParser.SQRT - 153)) | (1 << (BNGParser.RINT - 153)) | (1 << (BNGParser.ABS - 153)) | (1 << (BNGParser.SIN - 153)) | (1 << (BNGParser.COS - 153)) | (1 << (BNGParser.TAN - 153)) | (1 << (BNGParser.ASIN - 153)) | (1 << (BNGParser.ACOS - 153)) | (1 << (BNGParser.ATAN - 153)) | (1 << (BNGParser.SINH - 153)) | (1 << (BNGParser.COSH - 153)) | (1 << (BNGParser.TANH - 153)) | (1 << (BNGParser.ASINH - 153)) | (1 << (BNGParser.ACOSH - 153)) | (1 << (BNGParser.ATANH - 153)) | (1 << (BNGParser.MIN - 153)) | (1 << (BNGParser.MAX - 153)))) !== 0) || ((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.SUM - 185)) | (1 << (BNGParser.AVG - 185)) | (1 << (BNGParser.TIME - 185)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1491;
			this.match(BNGParser.LPAREN);
			this.state = 1493;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)) | (1 << (BNGParser.SAT - 138)) | (1 << (BNGParser.MM - 138)) | (1 << (BNGParser.HILL - 138)) | (1 << (BNGParser.ARRHENIUS - 138)) | (1 << (BNGParser.MRATIO - 138)) | (1 << (BNGParser.TFUN - 138)) | (1 << (BNGParser.FUNCTIONPRODUCT - 138)) | (1 << (BNGParser.IF - 138)) | (1 << (BNGParser.EXP - 138)) | (1 << (BNGParser.LN - 138)) | (1 << (BNGParser.LOG10 - 138)) | (1 << (BNGParser.LOG2 - 138)) | (1 << (BNGParser.SQRT - 138)) | (1 << (BNGParser.RINT - 138)) | (1 << (BNGParser.ABS - 138)) | (1 << (BNGParser.SIN - 138)))) !== 0) || ((((_la - 170)) & ~0x1F) === 0 && ((1 << (_la - 170)) & ((1 << (BNGParser.COS - 170)) | (1 << (BNGParser.TAN - 170)) | (1 << (BNGParser.ASIN - 170)) | (1 << (BNGParser.ACOS - 170)) | (1 << (BNGParser.ATAN - 170)) | (1 << (BNGParser.SINH - 170)) | (1 << (BNGParser.COSH - 170)) | (1 << (BNGParser.TANH - 170)) | (1 << (BNGParser.ASINH - 170)) | (1 << (BNGParser.ACOSH - 170)) | (1 << (BNGParser.ATANH - 170)) | (1 << (BNGParser.PI - 170)) | (1 << (BNGParser.EULERIAN - 170)) | (1 << (BNGParser.MIN - 170)) | (1 << (BNGParser.MAX - 170)) | (1 << (BNGParser.SUM - 170)) | (1 << (BNGParser.AVG - 170)) | (1 << (BNGParser.TIME - 170)) | (1 << (BNGParser.FLOAT - 170)) | (1 << (BNGParser.INT - 170)) | (1 << (BNGParser.STRING - 170)) | (1 << (BNGParser.LPAREN - 170)))) !== 0) || ((((_la - 204)) & ~0x1F) === 0 && ((1 << (_la - 204)) & ((1 << (BNGParser.TILDE - 204)) | (1 << (BNGParser.MINUS - 204)) | (1 << (BNGParser.PLUS - 204)) | (1 << (BNGParser.EMARK - 204)))) !== 0)) {
				{
				this.state = 1492;
				this.expression_list();
				}
			}

			this.state = 1495;
			this.match(BNGParser.RPAREN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public observable_ref(): Observable_refContext {
		let _localctx: Observable_refContext = new Observable_refContext(this._ctx, this.state);
		this.enterRule(_localctx, 182, BNGParser.RULE_observable_ref);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1497;
			this.match(BNGParser.STRING);
			this.state = 1498;
			this.match(BNGParser.LPAREN);
			this.state = 1500;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.PREFIX - 41)) | (1 << (BNGParser.SUFFIX - 41)) | (1 << (BNGParser.OVERWRITE - 41)) | (1 << (BNGParser.MAX_AGG - 41)) | (1 << (BNGParser.MAX_ITER - 41)) | (1 << (BNGParser.MAX_STOICH - 41)) | (1 << (BNGParser.PRINT_ITER - 41)) | (1 << (BNGParser.CHECK_ISO - 41)) | (1 << (BNGParser.SAFE - 41)) | (1 << (BNGParser.EXECUTE - 41)) | (1 << (BNGParser.METHOD - 41)) | (1 << (BNGParser.VERBOSE - 41)) | (1 << (BNGParser.NETFILE - 41)) | (1 << (BNGParser.CONTINUE - 41)) | (1 << (BNGParser.T_START - 41)) | (1 << (BNGParser.T_END - 41)) | (1 << (BNGParser.N_STEPS - 41)) | (1 << (BNGParser.N_OUTPUT_STEPS - 41)) | (1 << (BNGParser.MAX_SIM_STEPS - 41)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 41)) | (1 << (BNGParser.SAMPLE_TIMES - 41)) | (1 << (BNGParser.SAVE_PROGRESS - 41)) | (1 << (BNGParser.PRINT_CDAT - 41)) | (1 << (BNGParser.PRINT_FUNCTIONS - 41)))) !== 0) || ((((_la - 73)) & ~0x1F) === 0 && ((1 << (_la - 73)) & ((1 << (BNGParser.PRINT_NET - 73)) | (1 << (BNGParser.PRINT_END - 73)) | (1 << (BNGParser.STOP_IF - 73)) | (1 << (BNGParser.PRINT_ON_STOP - 73)) | (1 << (BNGParser.ATOL - 73)) | (1 << (BNGParser.RTOL - 73)) | (1 << (BNGParser.STEADY_STATE - 73)) | (1 << (BNGParser.SPARSE - 73)) | (1 << (BNGParser.PLA_CONFIG - 73)) | (1 << (BNGParser.PLA_OUTPUT - 73)) | (1 << (BNGParser.PARAM - 73)) | (1 << (BNGParser.COMPLEX - 73)) | (1 << (BNGParser.GET_FINAL_STATE - 73)) | (1 << (BNGParser.GML - 73)) | (1 << (BNGParser.NOCSLF - 73)) | (1 << (BNGParser.NOTF - 73)) | (1 << (BNGParser.BINARY_OUTPUT - 73)) | (1 << (BNGParser.UTL - 73)) | (1 << (BNGParser.EQUIL - 73)) | (1 << (BNGParser.PARAMETER - 73)) | (1 << (BNGParser.PAR_MIN - 73)) | (1 << (BNGParser.PAR_MAX - 73)) | (1 << (BNGParser.N_SCAN_PTS - 73)) | (1 << (BNGParser.LOG_SCALE - 73)) | (1 << (BNGParser.RESET_CONC - 73)))) !== 0) || ((((_la - 106)) & ~0x1F) === 0 && ((1 << (_la - 106)) & ((1 << (BNGParser.FILE - 106)) | (1 << (BNGParser.ATOMIZE - 106)) | (1 << (BNGParser.BLOCKS - 106)) | (1 << (BNGParser.SKIPACTIONS - 106)) | (1 << (BNGParser.TYPE - 106)) | (1 << (BNGParser.BACKGROUND - 106)) | (1 << (BNGParser.COLLAPSE - 106)) | (1 << (BNGParser.OPTS - 106)) | (1 << (BNGParser.FORMAT - 106)) | (1 << (BNGParser.INCLUDE_MODEL - 106)) | (1 << (BNGParser.INCLUDE_NETWORK - 106)) | (1 << (BNGParser.PRETTY_FORMATTING - 106)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 106)) | (1 << (BNGParser.TEXTREACTION - 106)) | (1 << (BNGParser.TEXTSPECIES - 106)) | (1 << (BNGParser.BDF - 106)) | (1 << (BNGParser.MAX_STEP - 106)) | (1 << (BNGParser.MAXORDER - 106)) | (1 << (BNGParser.STATS - 106)) | (1 << (BNGParser.MAX_NUM_STEPS - 106)))) !== 0) || ((((_la - 138)) & ~0x1F) === 0 && ((1 << (_la - 138)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 138)) | (1 << (BNGParser.MAX_CONV_FAILS - 138)) | (1 << (BNGParser.STIFF - 138)) | (1 << (BNGParser.SAT - 138)) | (1 << (BNGParser.MM - 138)) | (1 << (BNGParser.HILL - 138)) | (1 << (BNGParser.ARRHENIUS - 138)) | (1 << (BNGParser.MRATIO - 138)) | (1 << (BNGParser.TFUN - 138)) | (1 << (BNGParser.FUNCTIONPRODUCT - 138)) | (1 << (BNGParser.IF - 138)) | (1 << (BNGParser.EXP - 138)) | (1 << (BNGParser.LN - 138)) | (1 << (BNGParser.LOG10 - 138)) | (1 << (BNGParser.LOG2 - 138)) | (1 << (BNGParser.SQRT - 138)) | (1 << (BNGParser.RINT - 138)) | (1 << (BNGParser.ABS - 138)) | (1 << (BNGParser.SIN - 138)))) !== 0) || ((((_la - 170)) & ~0x1F) === 0 && ((1 << (_la - 170)) & ((1 << (BNGParser.COS - 170)) | (1 << (BNGParser.TAN - 170)) | (1 << (BNGParser.ASIN - 170)) | (1 << (BNGParser.ACOS - 170)) | (1 << (BNGParser.ATAN - 170)) | (1 << (BNGParser.SINH - 170)) | (1 << (BNGParser.COSH - 170)) | (1 << (BNGParser.TANH - 170)) | (1 << (BNGParser.ASINH - 170)) | (1 << (BNGParser.ACOSH - 170)) | (1 << (BNGParser.ATANH - 170)) | (1 << (BNGParser.PI - 170)) | (1 << (BNGParser.EULERIAN - 170)) | (1 << (BNGParser.MIN - 170)) | (1 << (BNGParser.MAX - 170)) | (1 << (BNGParser.SUM - 170)) | (1 << (BNGParser.AVG - 170)) | (1 << (BNGParser.TIME - 170)) | (1 << (BNGParser.FLOAT - 170)) | (1 << (BNGParser.INT - 170)) | (1 << (BNGParser.STRING - 170)) | (1 << (BNGParser.LPAREN - 170)))) !== 0) || ((((_la - 204)) & ~0x1F) === 0 && ((1 << (_la - 204)) & ((1 << (BNGParser.TILDE - 204)) | (1 << (BNGParser.MINUS - 204)) | (1 << (BNGParser.PLUS - 204)) | (1 << (BNGParser.EMARK - 204)))) !== 0)) {
				{
				this.state = 1499;
				this.expression_list();
				}
			}

			this.state = 1502;
			this.match(BNGParser.RPAREN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public literal(): LiteralContext {
		let _localctx: LiteralContext = new LiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 184, BNGParser.RULE_literal);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1504;
			_la = this._input.LA(1);
			if (!(((((_la - 181)) & ~0x1F) === 0 && ((1 << (_la - 181)) & ((1 << (BNGParser.PI - 181)) | (1 << (BNGParser.EULERIAN - 181)) | (1 << (BNGParser.FLOAT - 181)) | (1 << (BNGParser.INT - 181)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	private static readonly _serializedATNSegments: number = 3;
	private static readonly _serializedATNSegment0: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\xE8\u05E5\x04" +
		"\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04" +
		"\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r" +
		"\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12" +
		"\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17" +
		"\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C" +
		"\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x04" +
		"#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(\x04)\t)\x04*\t*\x04+\t" +
		"+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041\t1\x042\t2\x043\t3\x04" +
		"4\t4\x045\t5\x046\t6\x047\t7\x048\t8\x049\t9\x04:\t:\x04;\t;\x04<\t<\x04" +
		"=\t=\x04>\t>\x04?\t?\x04@\t@\x04A\tA\x04B\tB\x04C\tC\x04D\tD\x04E\tE\x04" +
		"F\tF\x04G\tG\x04H\tH\x04I\tI\x04J\tJ\x04K\tK\x04L\tL\x04M\tM\x04N\tN\x04" +
		"O\tO\x04P\tP\x04Q\tQ\x04R\tR\x04S\tS\x04T\tT\x04U\tU\x04V\tV\x04W\tW\x04" +
		"X\tX\x04Y\tY\x04Z\tZ\x04[\t[\x04\\\t\\\x04]\t]\x04^\t^\x03\x02\x07\x02" +
		"\xBE\n\x02\f\x02\x0E\x02\xC1\v\x02\x03\x02\x03\x02\x07\x02\xC5\n\x02\f" +
		"\x02\x0E\x02\xC8\v\x02\x03\x02\x03\x02\x03\x02\x06\x02\xCD\n\x02\r\x02" +
		"\x0E\x02\xCE\x03\x02\x07\x02\xD2\n\x02\f\x02\x0E\x02\xD5\v\x02\x03\x02" +
		"\x03\x02\x03\x02\x07\x02\xDA\n\x02\f\x02\x0E\x02\xDD\v\x02\x03\x02\x07" +
		"\x02\xE0\n\x02\f\x02\x0E\x02\xE3\v\x02\x05\x02\xE5\n\x02\x03\x02\x03\x02" +
		"\x05\x02\xE9\n\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x05" +
		"\x03\xF1\n\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x05\x04\xF8\n\x04" +
		"\x03\x04\x03\x04\x03\x04\x05\x04\xFD\n\x04\x03\x04\x06\x04\u0100\n\x04" +
		"\r\x04\x0E\x04\u0101\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03" +
		"\x05\x05\x05\u010B\n\x05\x03\x05\x06\x05\u010E\n\x05\r\x05\x0E\x05\u010F" +
		"\x03\x06\x03\x06\x03\x06\x03\x06\x07\x06\u0116\n\x06\f\x06\x0E\x06\u0119" +
		"\v\x06\x03\x06\x03\x06\x03\x06\x03\x06\x07\x06\u011F\n\x06\f\x06\x0E\x06" +
		"\u0122\v\x06\x03\x06\x03\x06\x03\x06\x03\x06\x07\x06\u0128\n\x06\f\x06" +
		"\x0E\x06\u012B\v\x06\x03\x06\x03\x06\x03\x06\x03\x06\x07\x06\u0131\n\x06" +
		"\f\x06\x0E\x06\u0134\v\x06\x03\x06\x07\x06\u0137\n\x06\f\x06\x0E\x06\u013A" +
		"\v\x06\x03\x06\x03\x06\x05\x06\u013E\n\x06\x03\x06\x06\x06\u0141\n\x06" +
		"\r\x06\x0E\x06\u0142\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
		"\x07\x05\x07\u014C\n\x07\x03\x07\x06\x07\u014F\n\x07\r\x07\x0E\x07\u0150" +
		"\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03" +
		"\b\x03\b\x05\b\u0160\n\b\x03\t\x03\t\x03\t\x06\t\u0165\n\t\r\t\x0E\t\u0166" +
		"\x03\t\x03\t\x06\t\u016B\n\t\r\t\x0E\t\u016C\x07\t\u016F\n\t\f\t\x0E\t" +
		"\u0172\v\t\x03\t\x03\t\x03\t\x07\t\u0177\n\t\f\t\x0E\t\u017A\v\t\x03\n" +
		"\x05\n\u017D\n\n\x03\n\x03\n\x03\n\x05\n\u0182\n\n\x03\n\x03\n\x05\n\u0186" +
		"\n\n\x03\n\x05\n\u0189\n\n\x03\v\x03\v\x05\v\u018D\n\v\x03\f\x03\f\x03" +
		"\f\x03\f\x06\f\u0193\n\f\r\f\x0E\f\u0194\x03\f\x03\f\x06\f\u0199\n\f\r" +
		"\f\x0E\f\u019A\x07\f\u019D\n\f\f\f\x0E\f\u01A0\v\f\x03\f\x03\f\x03\f\x03" +
		"\f\x07\f\u01A6\n\f\f\f\x0E\f\u01A9\v\f\x03\f\x03\f\x03\f\x06\f\u01AE\n" +
		"\f\r\f\x0E\f\u01AF\x03\f\x03\f\x06\f\u01B4\n\f\r\f\x0E\f\u01B5\x07\f\u01B8" +
		"\n\f\f\f\x0E\f\u01BB\v\f\x03\f\x03\f\x03\f\x07\f\u01C0\n\f\f\f\x0E\f\u01C3" +
		"\v\f\x05\f\u01C5\n\f\x03\r\x03\r\x05\r\u01C9\n\r\x03\r\x03\r\x05\r\u01CD" +
		"\n\r\x03\x0E\x03\x0E\x05\x0E\u01D1\n\x0E\x03\x0E\x03\x0E\x05\x0E\u01D5" +
		"\n\x0E\x03\x0E\x05\x0E\u01D8\n\x0E\x03\x0E\x05\x0E\u01DB\n\x0E\x03\x0F" +
		"\x03\x0F\x05\x0F\u01DF\n\x0F\x03\x0F\x03\x0F\x03\x10\x05\x10\u01E4\n\x10" +
		"\x03\x10\x03\x10\x05\x10\u01E8\n\x10\x07\x10\u01EA\n\x10\f\x10\x0E\x10" +
		"\u01ED\v\x10\x03\x11\x03\x11\x03\x11\x05\x11\u01F2\n\x11\x03\x11\x03\x11" +
		"\x05\x11\u01F6\n\x11\x03\x12\x03\x12\x03\x13\x03\x13\x03\x14\x03\x14\x03" +
		"\x14\x07\x14\u01FF\n\x14\f\x14\x0E\x14\u0202\v\x14\x03\x15\x03\x15\x03" +
		"\x15\x05\x15\u0207\n\x15\x05\x15\u0209\n\x15\x03\x16\x03\x16\x03\x16\x03" +
		"\x16\x05\x16\u020F\n\x16\x03\x16\x06\x16\u0212\n\x16\r\x16\x0E\x16\u0213" +
		"\x03\x16\x06\x16\u0217\n\x16\r\x16\x0E\x16\u0218\x03\x16\x06\x16\u021C" +
		"\n\x16\r\x16\x0E\x16\u021D\x07\x16\u0220\n\x16\f\x16\x0E\x16\u0223\v\x16" +
		"\x03\x16\x03\x16\x03\x16\x03\x16\x05\x16\u0229\n\x16\x03\x16\x07\x16\u022C" +
		"\n\x16\f\x16\x0E\x16\u022F\v\x16\x03\x17\x05\x17\u0232\n\x17\x03\x17\x03" +
		"\x17\x05\x17\u0236\n\x17\x03\x17\x05\x17\u0239\n\x17\x03\x17\x03\x17\x03" +
		"\x17\x05\x17\u023E\n\x17\x03\x17\x03\x17\x05\x17\u0242\n\x17\x03\x18\x03" +
		"\x18\x03\x18\x05\x18\u0247\n\x18\x03\x18\x03\x18\x05\x18\u024B\n\x18\x03" +
		"\x18\x03\x18\x03\x18\x05\x18\u0250\n\x18\x07\x18\u0252\n\x18\f\x18\x0E" +
		"\x18\u0255\v\x18\x03\x18\x03\x18\x05\x18\u0259\n\x18\x03\x19\x03\x19\x03" +
		"\x19\x03\x1A\x05\x1A\u025F\n\x1A\x03\x1A\x03\x1A\x05\x1A\u0263\n\x1A\x03" +
		"\x1A\x05\x1A\u0266\n\x1A\x03\x1A\x05\x1A\u0269\n\x1A\x03\x1A\x03\x1A\x05" +
		"\x1A\u026D\n\x1A\x03\x1A\x05\x1A\u0270\n\x1A\x03\x1A\x05\x1A\u0273\n\x1A" +
		"\x03\x1A\x05\x1A\u0276\n\x1A\x03\x1A\x05\x1A\u0279\n\x1A\x03\x1B\x03\x1B" +
		"\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x05\x1C\u0283\n\x1C\x03" +
		"\x1D\x03\x1D\x03\x1E\x05\x1E\u0288\n\x1E\x03\x1E\x03\x1E\x05\x1E\u028C" +
		"\n\x1E\x07\x1E\u028E\n\x1E\f\x1E\x0E\x1E\u0291\v\x1E\x03\x1F\x03\x1F\x03" +
		"\x1F\x05\x1F\u0296\n\x1F\x03\x1F\x03\x1F\x03\x1F\x03\x1F\x03\x1F\x07\x1F" +
		"\u029D\n\x1F\f\x1F\x0E\x1F\u02A0\v\x1F\x03 \x03 \x03!\x03!\x03!\x05!\u02A7" +
		"\n!\x03!\x05!\u02AA\n!\x03\"\x03\"\x03\"\x03\"\x03\"\x03\"\x03\"\x05\"" +
		"\u02B3\n\"\x03#\x03#\x03$\x03$\x03$\x06$\u02BA\n$\r$\x0E$\u02BB\x03$\x03" +
		"$\x06$\u02C0\n$\r$\x0E$\u02C1\x07$\u02C4\n$\f$\x0E$\u02C7\v$\x03$\x03" +
		"$\x03$\x07$\u02CC\n$\f$\x0E$\u02CF\v$\x03%\x03%\x05%\u02D3\n%\x03%\x05" +
		"%\u02D6\n%\x03%\x03%\x03%\x03&\x03&\x03\'\x03\'\x05\'\u02DF\n\'\x03\'" +
		"\x07\'\u02E2\n\'\f\'\x0E\'\u02E5\v\'\x03(\x03(\x03(\x05(\u02EA\n(\x03" +
		"(\x03(\x03(\x05(\u02EF\n(\x03)\x03)\x03)\x03)\x06)\u02F5\n)\r)\x0E)\u02F6" +
		"\x03)\x03)\x06)\u02FB\n)\r)\x0E)\u02FC\x07)\u02FF\n)\f)\x0E)\u0302\v)" +
		"\x03)\x03)\x03)\x03)\x07)\u0308\n)\f)\x0E)\u030B\v)\x03)\x03)\x03)\x06" +
		")\u0310\n)\r)\x0E)\u0311\x03)\x03)\x06)\u0316\n)\r)\x0E)\u0317\x07)\u031A" +
		"\n)\f)\x0E)\u031D\v)\x03)\x03)\x03)\x07)\u0322\n)\f)\x0E)\u0325\v)\x03" +
		")\x03)\x03)\x06)\u032A\n)\r)\x0E)\u032B\x03)\x03)\x06)\u0330\n)\r)\x0E" +
		")\u0331\x07)\u0334\n)\f)\x0E)\u0337\v)\x03)\x03)\x03)\x07)\u033C\n)\f" +
		")\x0E)\u033F\v)\x05)\u0341\n)\x03*\x05*\u0344\n*\x03*\x03*\x03*\x05*\u0349" +
		"\n*\x03*\x07*\u034C\n*\f*\x0E*\u034F\v*\x03*\x03*\x05*\u0353\n*\x03*\x03" +
		"*\x03*\x03*\x03*\x07*\u035A\n*\f*\x0E*\u035D\v*\x03+\x03+\x03+\x03+\x03" +
		"+\x05+\u0364\n+\x03+\x07+\u0367\n+\f+\x0E+\u036A\v+\x03+\x03+\x05+\u036E" +
		"\n+\x03,\x03,\x05,\u0372\n,\x03,\x03,\x03,\x05,\u0377\n,\x07,\u0379\n" +
		",\f,\x0E,\u037C\v,\x03-\x03-\x05-\u0380\n-\x03-\x03-\x03-\x05-\u0385\n" +
		"-\x07-\u0387\n-\f-\x0E-\u038A\v-\x03.\x03.\x03/\x03/\x03/\x05/\u0391\n" +
		"/\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x03" +
		"0\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x030\x03" +
		"0\x030\x030\x030\x030\x030\x030\x030\x050\u03B6\n0\x031\x031\x031\x07" +
		"1\u03BB\n1\f1\x0E1\u03BE\v1\x032\x032\x032\x062\u03C3\n2\r2\x0E2\u03C4" +
		"\x032\x032\x062\u03C9\n2\r2\x0E2\u03CA\x072\u03CD\n2\f2\x0E2\u03D0\v2" +
		"\x032\x032\x032\x072\u03D5\n2\f2\x0E2\u03D8\v2\x033\x033\x053\u03DC\n" +
		"3\x033\x033\x033\x053\u03E1\n3\x033\x053\u03E4\n3\x033\x053\u03E7\n3\x03" +
		"3\x033\x034\x034\x034\x074\u03EE\n4\f4\x0E4\u03F1\v4\x035\x035\x035\x06" +
		"5\u03F6\n5\r5\x0E5\u03F7\x035\x035\x065\u03FC\n5\r5\x0E5\u03FD\x075\u0400" +
		"\n5\f5\x0E5\u0403\v5\x035\x035\x035\x075\u0408\n5\f5\x0E5\u040B\v5\x03" +
		"6\x036\x056\u040F\n6\x036\x036\x036\x036\x056\u0415\n6\x037\x037\x037" +
		"\x037\x067\u041B\n7\r7\x0E7\u041C\x037\x037\x067\u0421\n7\r7\x0E7\u0422" +
		"\x077\u0425\n7\f7\x0E7\u0428\v7\x037\x037\x037\x037\x077\u042E\n7\f7\x0E" +
		"7\u0431\v7\x038\x038\x058\u0435\n8\x038\x038\x038\x039\x039\x039\x039" +
		"\x069\u043E\n9\r9\x0E9\u043F\x039\x039\x069\u0444\n9\r9\x0E9\u0445\x07" +
		"9\u0448\n9\f9\x0E9\u044B\v9\x039\x039\x039\x039\x079\u0451\n9\f9\x0E9" +
		"\u0454\v9\x03:\x03:\x05:\u0458\n:\x03:\x03:\x03:\x03:\x03:\x05:\u045F" +
		"\n:\x03:\x03:\x03;\x03;\x03;\x03;\x06;\u0467\n;\r;\x0E;\u0468\x03;\x03" +
		";\x06;\u046D\n;\r;\x0E;\u046E\x07;\u0471\n;\f;\x0E;\u0474\v;\x03;\x03" +
		";\x03;\x03;\x07;\u047A\n;\f;\x0E;\u047D\v;\x03<\x03<\x05<\u0481\n<\x03" +
		"=\x06=\u0484\n=\r=\x0E=\u0485\x03>\x03>\x03>\x06>\u048B\n>\r>\x0E>\u048C" +
		"\x03>\x07>\u0490\n>\f>\x0E>\u0493\v>\x03>\x03>\x03>\x07>\u0498\n>\f>\x0E" +
		">\u049B\v>\x03?\x03?\x03?\x06?\u04A0\n?\r?\x0E?\u04A1\x03?\x07?\u04A5" +
		"\n?\f?\x0E?\u04A8\v?\x03?\x03?\x03?\x07?\u04AD\n?\f?\x0E?\u04B0\v?\x03" +
		"@\x03@\x03@\x03@\x03@\x03@\x03@\x05@\u04B9\n@\x03A\x03A\x03A\x05A\u04BE" +
		"\nA\x03A\x03A\x05A\u04C2\nA\x03A\x07A\u04C5\nA\fA\x0EA\u04C8\vA\x03B\x03" +
		"B\x03B\x05B\u04CD\nB\x03B\x03B\x05B\u04D1\nB\x03B\x07B\u04D4\nB\fB\x0E" +
		"B\u04D7\vB\x03C\x03C\x03C\x05C\u04DC\nC\x03C\x03C\x05C\u04E0\nC\x03C\x07" +
		"C\u04E3\nC\fC\x0EC\u04E6\vC\x03D\x03D\x03D\x05D\u04EB\nD\x03D\x03D\x05" +
		"D\u04EF\nD\x03D\x07D\u04F2\nD\fD\x0ED\u04F5\vD\x03E\x03E\x03E\x03E\x03" +
		"E\x06E\u04FC\nE\rE\x0EE\u04FD\x05E\u0500\nE\x03E\x03E\x03E\x03E\x03E\x07" +
		"E\u0507\nE\fE\x0EE\u050A\vE\x03E\x05E\u050D\nE\x03E\x03E\x05E\u0511\n" +
		"E\x03E\x07E\u0514\nE\fE\x0EE\u0517\vE\x03F\x03F\x03F\x03F\x05F\u051D\n" +
		"F\x03F\x03F\x05F\u0521\nF\x03F\x07F\u0524\nF\fF\x0EF\u0527\vF\x03G\x03" +
		"G\x03G\x03G\x07G\u052D\nG\fG\x0EG\u0530\vG\x03G\x03G\x03G\x03G\x07G\u0536" +
		"\nG\fG\x0EG\u0539\vG\x03G\x03G\x03G\x05G\u053E\nG\x03G\x07G\u0541\nG\f" +
		"G\x0EG\u0544\vG\x03H\x03H\x05H\u0548\nH\x03H\x03H\x03I\x03I\x03I\x07I" +
		"\u054F\nI\fI\x0EI\u0552\vI\x03J\x03J\x03J\x03J\x03K\x03K\x03K\x03K\x07" +
		"K\u055C\nK\fK\x0EK\u055F\vK\x03K\x03K\x03K\x07K\u0564\nK\fK\x0EK\u0567" +
		"\vK\x03K\x03K\x03K\x03K\x03K\x03K\x03K\x05K\u0570\nK\x03K\x05K\u0573\n" +
		"K\x03L\x03L\x03M\x03M\x03M\x07M\u057A\nM\fM\x0EM\u057D\vM\x03N\x03N\x05" +
		"N\u0581\nN\x03N\x03N\x03N\x03O\x03O\x03P\x03P\x03P\x07P\u058B\nP\fP\x0E" +
		"P\u058E\vP\x03Q\x03Q\x03R\x03R\x03S\x03S\x03S\x07S\u0597\nS\fS\x0ES\u059A" +
		"\vS\x03T\x03T\x03T\x07T\u059F\nT\fT\x0ET\u05A2\vT\x03U\x03U\x03U\x07U" +
		"\u05A7\nU\fU\x0EU\u05AA\vU\x03V\x03V\x03W\x03W\x03W\x07W\u05B1\nW\fW\x0E" +
		"W\u05B4\vW\x03X\x03X\x03X\x07X\u05B9\nX\fX\x0EX\u05BC\vX\x03Y\x03Y\x03" +
		"Y\x07Y\u05C1\nY\fY\x0EY\u05C4\vY\x03Z\x05Z\u05C7\nZ\x03Z\x03Z\x03[\x03" +
		"[\x03[\x03[\x03[\x03[\x03[\x03[\x05[\u05D3\n[\x03\\\x03\\\x03\\\x05\\" +
		"\u05D8\n\\\x03\\\x03\\\x03]\x03]\x03]\x05]\u05DF\n]\x03]\x03]\x03^\x03" +
		"^\x03^\x02\x02\x02_\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02" +
		"\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02" +
		"\"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x022\x024\x026\x028\x02:\x02<\x02" +
		">\x02@\x02B\x02D\x02F\x02H\x02J\x02L\x02N\x02P\x02R\x02T\x02V\x02X\x02" +
		"Z\x02\\\x02^\x02`\x02b\x02d\x02f\x02h\x02j\x02l\x02n\x02p\x02r\x02t\x02" +
		"v\x02x\x02z\x02|\x02~\x02\x80\x02\x82\x02\x84\x02\x86\x02\x88\x02\x8A" +
		"\x02\x8C\x02\x8E\x02\x90\x02\x92\x02\x94\x02\x96\x02\x98\x02\x9A\x02\x9C" +
		"\x02\x9E\x02\xA0\x02\xA2\x02\xA4\x02\xA6\x02\xA8\x02\xAA\x02\xAC\x02\xAE" +
		"\x02\xB0\x02\xB2\x02\xB4\x02\xB6\x02\xB8\x02\xBA\x02\x02\x16\x03\x02\xE4" +
		"\xE4\f\x02+,88eellqqww\x9B\xA1\xA3\xA8\xAA\xB6\xB9\xBD\x07\x02\b\r\x0F" +
		"\x15\x18\x18\x1A\x1A\x1C\x1D\x03\x02\xBF\xC0\x05\x02\f\r\x10\x10\xC0\xC0" +
		"\x04\x02\xD0\xD3\xD5\xD5\x03\x02\xCB\xCC\x07\x0277OOTUXY\x97\x97\x05\x02" +
		"x|~~\x85\x86\x04\x02\x8F\x90\x93\x93\v\x02((44cdkkpp}}\x91\x92\x94\x96" +
		"\x98\x98\x03\x02\xE5\xE5\v\x02..568=@@RS``\x87\x87\x8E\x8E\x99\x9A\x13" +
		"\x02+,.35688=>@NPSVWZbejloqtww\x7F\x84\x87\x8E\xBD\xBD\xC0\xC0\x04\x02" +
		"\xD0\xD3\xD5\xD6\x03\x02\xDC\xDD\x04\x02\xDA\xDB\xE0\xE0\x05\x02\xCE\xCE" +
		"\xDC\xDD\xE3\xE3\x05\x02\x9B\xA1\xA3\xB6\xB9\xBD\x04\x02\xB7\xB8\xBE\xBF" +
		"\x02\u068C\x02\xBF\x03\x02\x02\x02\x04\xF0\x03\x02\x02\x02\x06\xF2\x03" +
		"\x02\x02\x02\b\u0103\x03\x02\x02\x02\n\u0111\x03\x02\x02\x02\f\u0144\x03" +
		"\x02\x02\x02\x0E\u015F\x03\x02\x02\x02\x10\u0161\x03\x02\x02\x02\x12\u017C" +
		"\x03\x02\x02\x02\x14\u018C\x03\x02\x02\x02\x16\u01C4\x03\x02\x02\x02\x18" +
		"\u01C8\x03\x02\x02\x02\x1A\u01D0\x03\x02\x02\x02\x1C\u01DC\x03\x02\x02" +
		"\x02\x1E\u01E3\x03\x02\x02\x02 \u01F1\x03\x02\x02\x02\"\u01F7\x03\x02" +
		"\x02\x02$\u01F9\x03\x02\x02\x02&\u01FB\x03\x02\x02\x02(\u0208\x03\x02" +
		"\x02\x02*\u020A\x03\x02\x02\x02,\u0231\x03\x02\x02\x02.\u0246\x03\x02" +
		"\x02\x020\u025A\x03\x02\x02\x022\u025E\x03\x02\x02\x024\u027A\x03\x02" +
		"\x02\x026\u0282\x03\x02\x02\x028\u0284\x03\x02\x02\x02:\u0287\x03\x02" +
		"\x02\x02<\u0295\x03\x02\x02\x02>\u02A1\x03\x02\x02\x02@\u02A9\x03\x02" +
		"\x02\x02B\u02B2\x03\x02\x02\x02D\u02B4\x03\x02\x02\x02F\u02B6\x03\x02" +
		"\x02\x02H\u02D2\x03\x02\x02\x02J\u02DA\x03\x02\x02\x02L\u02DC\x03\x02" +
		"\x02\x02N\u02EE\x03\x02\x02\x02P\u0340\x03\x02\x02\x02R\u0343\x03\x02" +
		"\x02\x02T\u036D\x03\x02\x02\x02V\u0371\x03\x02\x02\x02X\u037F\x03\x02" +
		"\x02\x02Z\u038B\x03\x02\x02\x02\\\u038D\x03\x02\x02\x02^\u03B5\x03\x02" +
		"\x02\x02`\u03B7\x03\x02\x02\x02b\u03BF\x03\x02\x02\x02d\u03DB\x03\x02" +
		"\x02\x02f\u03EA\x03\x02\x02\x02h\u03F2\x03\x02\x02\x02j\u040E\x03\x02" +
		"\x02\x02l\u0416\x03\x02\x02\x02n\u0434\x03\x02\x02\x02p\u0439\x03\x02" +
		"\x02\x02r\u0457\x03\x02\x02\x02t\u0462\x03\x02\x02\x02v\u047E\x03\x02" +
		"\x02\x02x\u0483\x03\x02\x02\x02z\u0487\x03\x02\x02\x02|\u049C\x03\x02" +
		"\x02\x02~\u04B8\x03\x02\x02\x02\x80\u04BA\x03\x02\x02\x02\x82\u04C9\x03" +
		"\x02\x02\x02\x84\u04D8\x03\x02\x02\x02\x86\u04E7\x03\x02\x02\x02\x88\u04F6" +
		"\x03\x02\x02\x02\x8A\u0518\x03\x02\x02\x02\x8C\u0528\x03\x02\x02\x02\x8E" +
		"\u0545\x03\x02\x02\x02\x90\u054B\x03\x02\x02\x02\x92\u0553\x03\x02\x02" +
		"\x02\x94\u0572\x03\x02\x02\x02\x96\u0574\x03\x02\x02\x02\x98\u0576\x03" +
		"\x02\x02\x02\x9A\u0580\x03\x02\x02\x02\x9C\u0585\x03\x02\x02\x02\x9E\u0587" +
		"\x03\x02\x02\x02\xA0\u058F\x03\x02\x02\x02\xA2\u0591\x03\x02\x02\x02\xA4" +
		"\u0593\x03\x02\x02\x02\xA6\u059B\x03\x02\x02\x02\xA8\u05A3\x03\x02\x02" +
		"\x02\xAA\u05AB\x03\x02\x02\x02\xAC\u05AD\x03\x02\x02\x02\xAE\u05B5\x03" +
		"\x02\x02\x02\xB0\u05BD\x03\x02\x02\x02\xB2\u05C6\x03\x02\x02\x02\xB4\u05D2" +
		"\x03\x02\x02\x02\xB6\u05D4\x03\x02\x02\x02\xB8\u05DB\x03\x02\x02\x02\xBA" +
		"\u05E2\x03\x02\x02\x02\xBC\xBE\x07\x04\x02\x02\xBD\xBC\x03\x02\x02\x02" +
		"\xBE\xC1\x03\x02\x02\x02\xBF\xBD\x03\x02\x02\x02\xBF\xC0\x03\x02\x02\x02" +
		"\xC0\xC6\x03\x02\x02\x02\xC1\xBF\x03\x02\x02\x02\xC2\xC5\x05\x04\x03\x02" +
		"\xC3\xC5\x05~@\x02\xC4\xC2\x03\x02\x02\x02\xC4\xC3\x03\x02\x02\x02\xC5" +
		"\xC8\x03\x02\x02\x02\xC6\xC4\x03\x02\x02\x02\xC6\xC7\x03\x02\x02\x02\xC7" +
		"\xE4\x03\x02\x02\x02\xC8\xC6\x03\x02\x02\x02\xC9\xCA\x07\x06\x02\x02\xCA" +
		"\xCC\x07\b\x02\x02\xCB\xCD\x07\x04\x02\x02\xCC\xCB\x03\x02\x02\x02\xCD" +
		"\xCE\x03\x02\x02\x02\xCE\xCC\x03\x02\x02\x02\xCE\xCF\x03\x02\x02\x02\xCF" +
		"\xD3\x03\x02\x02\x02\xD0\xD2\x05\x0E\b\x02\xD1\xD0\x03\x02\x02\x02\xD2" +
		"\xD5\x03\x02\x02\x02\xD3\xD1\x03\x02\x02\x02\xD3\xD4\x03\x02\x02\x02\xD4" +
		"\xD6\x03\x02\x02\x02\xD5\xD3\x03\x02\x02\x02\xD6\xD7\x07\x07\x02\x02\xD7" +
		"\xDB\x07\b\x02\x02\xD8\xDA\x07\x04\x02\x02\xD9\xD8\x03\x02\x02\x02\xDA" +
		"\xDD\x03\x02\x02\x02\xDB\xD9\x03\x02\x02\x02\xDB\xDC\x03\x02\x02\x02\xDC" +
		"\xE5\x03\x02\x02\x02\xDD\xDB\x03\x02\x02\x02\xDE\xE0\x05\x0E\b\x02\xDF" +
		"\xDE\x03\x02\x02\x02\xE0\xE3\x03\x02\x02\x02\xE1\xDF\x03\x02\x02\x02\xE1" +
		"\xE2\x03\x02\x02\x02\xE2\xE5\x03\x02\x02\x02\xE3\xE1\x03\x02\x02\x02\xE4" +
		"\xC9\x03\x02\x02\x02\xE4\xE1\x03\x02\x02\x02\xE5\xE8\x03\x02\x02\x02\xE6" +
		"\xE9\x05z>\x02\xE7\xE9\x05x=\x02\xE8\xE6\x03\x02\x02\x02\xE8\xE7\x03\x02" +
		"\x02\x02\xE8\xE9\x03\x02\x02\x02\xE9\xEA\x03\x02\x02\x02\xEA\xEB\x07\x02" +
		"\x02\x03\xEB\x03\x03\x02\x02\x02\xEC\xF1\x05\x06\x04\x02\xED\xF1\x05\b" +
		"\x05\x02\xEE\xF1\x05\n\x06\x02\xEF\xF1\x05\f\x07\x02\xF0\xEC\x03\x02\x02" +
		"\x02\xF0\xED\x03\x02\x02\x02\xF0\xEE\x03\x02\x02\x02\xF0\xEF\x03\x02\x02" +
		"\x02\xF1\x05\x03\x02\x02\x02\xF2\xF3\x07\'\x02\x02\xF3\xF4\x07\xC9\x02" +
		"\x02\xF4\xF5\x07\xE4\x02\x02\xF5\xF7\x07\xE7\x02\x02\xF6\xF8\x07\xC0\x02" +
		"\x02\xF7\xF6\x03\x02\x02\x02\xF7\xF8\x03\x02\x02\x02\xF8\xF9\x03\x02\x02" +
		"\x02\xF9\xFA\x07\xE4\x02\x02\xFA\xFC\x07\xCA\x02\x02\xFB\xFD\x07\xC1\x02" +
		"\x02\xFC\xFB\x03\x02\x02\x02\xFC\xFD\x03\x02\x02\x02\xFD\xFF\x03\x02\x02" +
		"\x02\xFE\u0100\x07\x04\x02\x02\xFF\xFE\x03\x02\x02\x02\u0100\u0101\x03" +
		"\x02\x02\x02\u0101\xFF\x03\x02\x02\x02\u0101\u0102\x03\x02\x02\x02\u0102" +
		"\x07\x03\x02\x02\x02\u0103\u0104\x07*\x02\x02\u0104\u0105\x07\xC9\x02" +
		"\x02\u0105\u0106\x07\xE4\x02\x02\u0106\u0107\x07\xC0\x02\x02\u0107\u0108" +
		"\x07\xE4\x02\x02\u0108\u010A\x07\xCA\x02\x02\u0109\u010B\x07\xC1\x02\x02" +
		"\u010A\u0109\x03\x02\x02\x02\u010A\u010B\x03\x02\x02\x02\u010B\u010D\x03" +
		"\x02\x02\x02\u010C\u010E\x07\x04\x02\x02\u010D\u010C\x03\x02\x02\x02\u010E" +
		"\u010F\x03\x02\x02\x02\u010F\u010D\x03\x02\x02\x02\u010F\u0110\x03\x02" +
		"\x02\x02\u0110\t\x03\x02\x02\x02\u0111\u0112\x07(\x02\x02\u0112\u0113" +
		"\x07\xC9\x02\x02\u0113\u0117\x07\xE4\x02\x02\u0114\u0116\n\x02\x02\x02" +
		"\u0115\u0114\x03\x02\x02\x02\u0116\u0119\x03\x02\x02\x02\u0117\u0115\x03" +
		"\x02\x02\x02\u0117\u0118\x03\x02\x02\x02\u0118\u011A\x03\x02\x02\x02\u0119" +
		"\u0117\x03\x02\x02\x02\u011A\u011B\x07\xE4\x02\x02\u011B\u011C\x07\xC7" +
		"\x02\x02\u011C\u0120\x07";
	private static readonly _serializedATNSegment1: string =
		"\xE4\x02\x02\u011D\u011F\n\x02\x02\x02\u011E\u011D\x03\x02\x02\x02\u011F" +
		"\u0122\x03\x02\x02\x02\u0120\u011E\x03\x02\x02\x02\u0120\u0121\x03\x02" +
		"\x02\x02\u0121\u0123\x03\x02\x02\x02\u0122\u0120\x03\x02\x02\x02\u0123" +
		"\u0138\x07\xE4\x02\x02\u0124\u0125\x07\xC7\x02\x02\u0125\u0129\x07\xE4" +
		"\x02\x02\u0126\u0128\n\x02\x02\x02\u0127\u0126\x03\x02\x02\x02\u0128\u012B" +
		"\x03\x02\x02\x02\u0129\u0127\x03\x02\x02\x02\u0129\u012A\x03\x02\x02\x02" +
		"\u012A\u012C\x03\x02\x02\x02\u012B\u0129\x03\x02\x02\x02\u012C\u012D\x07" +
		"\xE4\x02\x02\u012D\u012E\x07\xC7\x02\x02\u012E\u0132\x07\xE4\x02\x02\u012F" +
		"\u0131\n\x02\x02\x02\u0130\u012F\x03\x02\x02\x02\u0131\u0134\x03\x02\x02" +
		"\x02\u0132\u0130\x03\x02\x02\x02\u0132\u0133\x03\x02\x02\x02\u0133\u0135" +
		"\x03\x02\x02\x02\u0134\u0132\x03\x02\x02\x02\u0135\u0137\x07\xE4\x02\x02" +
		"\u0136\u0124\x03\x02\x02\x02\u0137\u013A\x03\x02\x02\x02\u0138\u0136\x03" +
		"\x02\x02\x02\u0138\u0139\x03\x02\x02\x02\u0139\u013B\x03\x02\x02\x02\u013A" +
		"\u0138\x03\x02\x02\x02\u013B\u013D\x07\xCA\x02\x02\u013C\u013E\x07\xC1" +
		"\x02\x02\u013D\u013C\x03\x02\x02\x02\u013D\u013E\x03\x02\x02\x02\u013E" +
		"\u0140\x03\x02\x02\x02\u013F\u0141\x07\x04\x02\x02\u0140\u013F\x03\x02" +
		"\x02\x02\u0141\u0142\x03\x02\x02\x02\u0142\u0140\x03\x02\x02\x02\u0142" +
		"\u0143\x03\x02\x02\x02\u0143\v\x03\x02\x02\x02\u0144\u0145\x07)\x02\x02" +
		"\u0145\u0146\x07\xC9\x02\x02\u0146\u0147\x07\xE4\x02\x02\u0147\u0148\x07" +
		"\xC0\x02\x02\u0148\u0149\x07\xE4\x02\x02\u0149\u014B\x07\xCA\x02\x02\u014A" +
		"\u014C\x07\xC1\x02\x02\u014B\u014A\x03\x02\x02\x02\u014B\u014C\x03\x02" +
		"\x02\x02\u014C\u014E\x03\x02\x02\x02\u014D\u014F\x07\x04\x02\x02\u014E" +
		"\u014D\x03\x02\x02\x02\u014F\u0150\x03\x02\x02\x02\u0150\u014E\x03\x02" +
		"\x02\x02\u0150\u0151\x03\x02\x02\x02\u0151\r\x03\x02\x02\x02\u0152\u0160" +
		"\x05\x10\t\x02\u0153\u0160\x05\x16\f\x02\u0154\u0160\x05*\x16\x02\u0155" +
		"\u0160\x05F$\x02\u0156\u0160\x05P)\x02\u0157\u0160\x05b2\x02\u0158\u0160" +
		"\x05h5\x02\u0159\u0160\x05l7\x02\u015A\u0160\x05p9\x02\u015B\u0160\x05" +
		"t;\x02\u015C\u0160\x05z>\x02\u015D\u0160\x05|?\x02\u015E\u0160\x05~@\x02" +
		"\u015F\u0152\x03\x02\x02\x02\u015F\u0153\x03\x02\x02\x02\u015F\u0154\x03" +
		"\x02\x02\x02\u015F\u0155\x03\x02\x02\x02\u015F\u0156\x03\x02\x02\x02\u015F" +
		"\u0157\x03\x02\x02\x02\u015F\u0158\x03\x02\x02\x02\u015F\u0159\x03\x02" +
		"\x02\x02\u015F\u015A\x03\x02\x02\x02\u015F\u015B\x03\x02\x02\x02\u015F" +
		"\u015C\x03\x02\x02\x02\u015F\u015D\x03\x02\x02\x02\u015F\u015E\x03\x02" +
		"\x02\x02\u0160\x0F\x03\x02\x02\x02\u0161\u0162\x07\x06\x02\x02\u0162\u0164" +
		"\x07\t\x02\x02\u0163\u0165\x07\x04\x02\x02\u0164\u0163\x03\x02\x02\x02" +
		"\u0165\u0166\x03\x02\x02\x02\u0166\u0164\x03\x02\x02\x02\u0166\u0167\x03" +
		"\x02\x02\x02\u0167\u0170\x03\x02\x02\x02\u0168\u016A\x05\x12\n\x02\u0169" +
		"\u016B\x07\x04\x02\x02\u016A\u0169\x03\x02\x02\x02\u016B\u016C\x03\x02" +
		"\x02\x02\u016C\u016A\x03\x02\x02\x02\u016C\u016D\x03\x02\x02\x02\u016D" +
		"\u016F\x03\x02\x02\x02\u016E\u0168\x03\x02\x02\x02\u016F\u0172\x03\x02" +
		"\x02\x02\u0170\u016E\x03\x02\x02\x02\u0170\u0171\x03\x02\x02\x02\u0171" +
		"\u0173\x03\x02\x02\x02\u0172\u0170\x03\x02\x02\x02\u0173\u0174\x07\x07" +
		"\x02\x02\u0174\u0178\x07\t\x02\x02\u0175\u0177\x07\x04\x02\x02\u0176\u0175" +
		"\x03\x02\x02\x02\u0177\u017A\x03\x02\x02\x02\u0178\u0176\x03\x02\x02\x02" +
		"\u0178\u0179\x03\x02\x02\x02\u0179\x11\x03\x02\x02\x02\u017A\u0178\x03" +
		"\x02\x02\x02\u017B\u017D\x07\xBF\x02\x02\u017C\u017B\x03\x02\x02\x02\u017C" +
		"\u017D\x03\x02\x02\x02\u017D\u0181\x03\x02\x02\x02\u017E\u017F\x05\x14" +
		"\v\x02\u017F\u0180\x07\xC2\x02\x02\u0180\u0182\x03\x02\x02\x02\u0181\u017E" +
		"\x03\x02\x02\x02\u0181\u0182\x03\x02\x02\x02\u0182\u0183\x03\x02\x02\x02" +
		"\u0183\u0185\x05\x14\v\x02\u0184\u0186\x07\xD7\x02\x02\u0185\u0184\x03" +
		"\x02\x02\x02\u0185\u0186\x03\x02\x02\x02\u0186\u0188\x03\x02\x02\x02\u0187" +
		"\u0189\x05\xA0Q\x02\u0188\u0187\x03\x02\x02\x02\u0188\u0189\x03\x02\x02" +
		"\x02\u0189\x13\x03\x02\x02\x02\u018A\u018D\x07\xC0\x02\x02\u018B\u018D" +
		"\x05\x9CO\x02\u018C\u018A\x03\x02\x02\x02\u018C\u018B\x03\x02\x02\x02" +
		"\u018D\x15\x03\x02\x02\x02\u018E\u018F\x07\x06\x02\x02\u018F\u0190\x07" +
		"\v\x02\x02\u0190\u0192\x07\x0E\x02\x02\u0191\u0193\x07\x04\x02\x02\u0192" +
		"\u0191\x03\x02\x02\x02\u0193\u0194\x03\x02\x02\x02\u0194\u0192\x03\x02" +
		"\x02\x02\u0194\u0195\x03\x02\x02\x02\u0195\u019E\x03\x02\x02\x02\u0196" +
		"\u0198\x05\x18\r\x02\u0197\u0199\x07\x04\x02\x02\u0198\u0197\x03\x02\x02" +
		"\x02\u0199\u019A\x03\x02\x02\x02\u019A\u0198\x03\x02\x02\x02\u019A\u019B" +
		"\x03\x02\x02\x02\u019B\u019D\x03\x02\x02\x02\u019C\u0196\x03\x02\x02\x02" +
		"\u019D\u01A0\x03\x02\x02\x02\u019E\u019C\x03\x02\x02\x02\u019E\u019F\x03" +
		"\x02\x02\x02\u019F\u01A1\x03\x02\x02\x02\u01A0\u019E\x03\x02\x02\x02\u01A1" +
		"\u01A2\x07\x07\x02\x02\u01A2\u01A3\x07\v\x02\x02\u01A3\u01A7\x07\x0E\x02" +
		"\x02\u01A4\u01A6\x07\x04\x02\x02\u01A5\u01A4\x03\x02\x02\x02\u01A6\u01A9" +
		"\x03\x02\x02\x02\u01A7\u01A5\x03\x02\x02\x02\u01A7\u01A8\x03\x02\x02\x02" +
		"\u01A8\u01C5\x03\x02\x02\x02\u01A9\u01A7\x03\x02\x02\x02\u01AA\u01AB\x07" +
		"\x06\x02\x02\u01AB\u01AD\x07\x17\x02\x02\u01AC\u01AE\x07\x04\x02\x02\u01AD" +
		"\u01AC\x03\x02\x02\x02\u01AE\u01AF\x03\x02\x02\x02\u01AF\u01AD\x03\x02" +
		"\x02\x02\u01AF\u01B0\x03\x02\x02\x02\u01B0\u01B9\x03\x02\x02\x02\u01B1" +
		"\u01B3\x05\x18\r\x02\u01B2\u01B4\x07\x04\x02\x02\u01B3\u01B2\x03\x02\x02" +
		"\x02\u01B4\u01B5\x03\x02\x02\x02\u01B5\u01B3\x03\x02\x02\x02\u01B5\u01B6" +
		"\x03\x02\x02\x02\u01B6\u01B8\x03\x02\x02\x02\u01B7\u01B1\x03\x02\x02\x02" +
		"\u01B8\u01BB\x03\x02\x02\x02\u01B9\u01B7\x03\x02\x02\x02\u01B9\u01BA\x03" +
		"\x02\x02\x02\u01BA\u01BC\x03\x02\x02\x02\u01BB\u01B9\x03\x02\x02\x02\u01BC" +
		"\u01BD\x07\x07\x02\x02\u01BD\u01C1\x07\x17\x02\x02\u01BE\u01C0\x07\x04" +
		"\x02\x02\u01BF\u01BE\x03\x02\x02\x02\u01C0\u01C3\x03\x02\x02\x02\u01C1" +
		"\u01BF\x03\x02\x02\x02\u01C1\u01C2\x03\x02\x02\x02\u01C2\u01C5\x03\x02" +
		"\x02\x02\u01C3\u01C1\x03\x02\x02\x02\u01C4\u018E\x03\x02\x02\x02\u01C4" +
		"\u01AA\x03\x02\x02\x02\u01C5\x17\x03\x02\x02\x02\u01C6\u01C7\x07\xC0\x02" +
		"\x02\u01C7\u01C9\x07\xC2\x02\x02\u01C8\u01C6\x03\x02\x02\x02\u01C8\u01C9" +
		"\x03\x02\x02\x02\u01C9\u01CA\x03\x02\x02\x02\u01CA\u01CC\x05\x1A\x0E\x02" +
		"\u01CB\u01CD\x07\x1A\x02\x02\u01CC\u01CB\x03\x02\x02\x02\u01CC\u01CD\x03" +
		"\x02\x02\x02\u01CD\x19\x03\x02\x02\x02\u01CE\u01D1\x07\xC0\x02\x02\u01CF" +
		"\u01D1\x05$\x13\x02\u01D0\u01CE\x03\x02\x02\x02\u01D0\u01CF\x03\x02\x02" +
		"\x02\u01D1\u01D7\x03\x02\x02\x02\u01D2\u01D4\x07\xC9\x02\x02\u01D3\u01D5" +
		"\x05\x1E\x10\x02\u01D4\u01D3\x03\x02\x02\x02\u01D4\u01D5\x03\x02\x02\x02" +
		"\u01D5\u01D6\x03\x02\x02\x02\u01D6\u01D8\x07\xCA\x02\x02\u01D7\u01D2\x03" +
		"\x02\x02\x02\u01D7\u01D8\x03\x02\x02\x02\u01D8\u01DA\x03\x02\x02\x02\u01D9" +
		"\u01DB\x05\x1C\x0F\x02\u01DA\u01D9\x03\x02\x02\x02\u01DA\u01DB\x03\x02" +
		"\x02\x02\u01DB\x1B\x03\x02\x02\x02\u01DC\u01DE\x07\xC5\x02\x02\u01DD\u01DF" +
		"\x05\x90I\x02\u01DE\u01DD\x03\x02\x02\x02\u01DE\u01DF\x03\x02\x02\x02" +
		"\u01DF\u01E0\x03\x02\x02\x02\u01E0\u01E1\x07\xC6\x02\x02\u01E1\x1D\x03" +
		"\x02\x02\x02\u01E2\u01E4\x05 \x11\x02\u01E3\u01E2\x03\x02\x02\x02\u01E3" +
		"\u01E4\x03\x02\x02\x02\u01E4\u01EB\x03\x02\x02\x02\u01E5\u01E7\x07\xC7" +
		"\x02\x02\u01E6\u01E8\x05 \x11\x02\u01E7\u01E6\x03\x02\x02\x02\u01E7\u01E8" +
		"\x03\x02\x02\x02\u01E8\u01EA\x03\x02\x02\x02\u01E9\u01E5\x03\x02\x02\x02" +
		"\u01EA\u01ED\x03\x02\x02\x02\u01EB\u01E9\x03\x02\x02\x02\u01EB\u01EC\x03" +
		"\x02\x02\x02\u01EC\x1F\x03\x02\x02\x02\u01ED\u01EB\x03\x02\x02\x02\u01EE" +
		"\u01F2\x07\xC0\x02\x02\u01EF\u01F2\x07\xBF\x02\x02\u01F0\u01F2\x05\"\x12" +
		"\x02\u01F1\u01EE\x03\x02\x02\x02\u01F1\u01EF\x03\x02\x02\x02\u01F1\u01F0" +
		"\x03\x02\x02\x02\u01F2\u01F5\x03\x02\x02\x02\u01F3\u01F4\x07\xCE\x02\x02" +
		"\u01F4\u01F6\x05&\x14\x02\u01F5\u01F3\x03\x02\x02\x02\u01F5\u01F6\x03" +
		"\x02\x02\x02\u01F6!\x03\x02\x02\x02\u01F7\u01F8\t\x03\x02\x02\u01F8#\x03" +
		"\x02\x02\x02\u01F9\u01FA\t\x04\x02\x02\u01FA%\x03\x02\x02\x02\u01FB\u0200" +
		"\x05(\x15\x02\u01FC\u01FD\x07\xCE\x02\x02\u01FD\u01FF\x05(\x15\x02\u01FE" +
		"\u01FC\x03\x02\x02\x02\u01FF\u0202\x03\x02\x02\x02\u0200\u01FE\x03\x02" +
		"\x02\x02\u0200\u0201\x03\x02\x02\x02\u0201\'\x03\x02\x02\x02\u0202\u0200" +
		"\x03\x02\x02\x02\u0203\u0209\x07\xC0\x02\x02\u0204\u0206\x07\xBF\x02\x02" +
		"\u0205\u0207\x07\xC0\x02\x02\u0206\u0205\x03\x02\x02\x02\u0206\u0207\x03" +
		"\x02\x02\x02\u0207\u0209\x03\x02\x02\x02\u0208\u0203\x03\x02\x02\x02\u0208" +
		"\u0204\x03\x02\x02\x02\u0209)\x03\x02\x02\x02\u020A\u020E\x07\x06\x02" +
		"\x02\u020B\u020C\x07\x0F\x02\x02\u020C\u020F\x07\x10\x02\x02\u020D\u020F" +
		"\x07\x10\x02\x02\u020E\u020B\x03\x02\x02\x02\u020E\u020D\x03\x02\x02\x02" +
		"\u020F\u0211\x03\x02\x02\x02\u0210\u0212\x07\x04\x02\x02\u0211\u0210\x03" +
		"\x02\x02\x02\u0212\u0213\x03\x02\x02\x02\u0213\u0211\x03\x02\x02\x02\u0213" +
		"\u0214\x03\x02\x02\x02\u0214\u0221\x03\x02\x02\x02\u0215\u0217\x05,\x17" +
		"\x02\u0216\u0215\x03\x02\x02\x02\u0217\u0218\x03\x02\x02\x02\u0218\u0216" +
		"\x03\x02\x02\x02\u0218\u0219\x03\x02\x02\x02\u0219\u021B\x03\x02\x02\x02" +
		"\u021A\u021C\x07\x04\x02\x02\u021B\u021A\x03\x02\x02\x02\u021C\u021D\x03" +
		"\x02\x02\x02\u021D\u021B\x03\x02\x02\x02\u021D\u021E\x03\x02\x02\x02\u021E" +
		"\u0220\x03\x02\x02\x02\u021F\u0216\x03\x02\x02\x02\u0220\u0223\x03\x02" +
		"\x02\x02\u0221\u021F\x03\x02\x02\x02\u0221\u0222\x03\x02\x02\x02\u0222" +
		"\u0224\x03\x02\x02\x02\u0223\u0221\x03\x02\x02\x02\u0224\u0228\x07\x07" +
		"\x02\x02\u0225\u0226\x07\x0F\x02\x02\u0226\u0229\x07\x10\x02\x02\u0227" +
		"\u0229\x07\x10\x02\x02\u0228\u0225\x03\x02\x02\x02\u0228\u0227\x03\x02" +
		"\x02\x02\u0229\u022D\x03\x02\x02\x02\u022A\u022C\x07\x04\x02\x02\u022B" +
		"\u022A\x03\x02\x02\x02\u022C\u022F\x03\x02\x02\x02\u022D\u022B\x03\x02" +
		"\x02\x02\u022D\u022E\x03\x02\x02\x02\u022E+\x03\x02\x02\x02\u022F\u022D" +
		"\x03\x02\x02\x02\u0230\u0232\x07\xBF\x02\x02\u0231\u0230\x03\x02\x02\x02" +
		"\u0231\u0232\x03\x02\x02\x02\u0232\u0235\x03\x02\x02\x02\u0233\u0234\x07" +
		"\xC0\x02\x02\u0234\u0236\x07\xC2\x02\x02\u0235\u0233\x03\x02\x02\x02\u0235" +
		"\u0236\x03\x02\x02\x02\u0236\u0238\x03\x02\x02\x02\u0237\u0239\x07\xCD" +
		"\x02\x02\u0238\u0237\x03\x02\x02\x02\u0238\u0239\x03\x02\x02\x02\u0239" +
		"\u023D\x03\x02\x02\x02\u023A\u023B\x07\xCF\x02\x02\u023B\u023C\x07\xC0" +
		"\x02\x02\u023C\u023E\x07\xC2\x02\x02\u023D\u023A\x03\x02\x02\x02\u023D" +
		"\u023E\x03\x02\x02\x02\u023E\u023F\x03\x02\x02\x02\u023F\u0241\x05.\x18" +
		"\x02\u0240\u0242\x05\xA0Q\x02\u0241\u0240\x03\x02\x02\x02\u0241\u0242" +
		"\x03\x02\x02\x02\u0242-\x03\x02\x02\x02\u0243\u0244\x07\xCF\x02\x02\u0244" +
		"\u0245\x07\xC0\x02\x02\u0245\u0247\x07\xC2\x02\x02\u0246\u0243\x03\x02" +
		"\x02\x02\u0246\u0247\x03\x02\x02\x02\u0247\u0248\x03\x02\x02\x02\u0248" +
		"\u024A\x052\x1A\x02\u0249\u024B\x050\x19\x02\u024A\u0249\x03\x02\x02\x02" +
		"\u024A\u024B\x03\x02\x02\x02\u024B\u0253\x03\x02\x02\x02\u024C\u024D\x07" +
		"\xC8\x02\x02\u024D\u024F\x052\x1A\x02\u024E\u0250\x050\x19\x02\u024F\u024E" +
		"\x03\x02\x02\x02\u024F\u0250\x03\x02\x02\x02\u0250\u0252\x03\x02\x02\x02" +
		"\u0251\u024C\x03\x02\x02\x02\u0252\u0255\x03\x02\x02\x02\u0253\u0251\x03" +
		"\x02\x02\x02\u0253\u0254\x03\x02\x02\x02\u0254\u0258\x03\x02\x02\x02\u0255" +
		"\u0253\x03\x02\x02\x02\u0256\u0257\x07\xCF\x02\x02\u0257\u0259\x07\xC0" +
		"\x02\x02\u0258\u0256\x03\x02\x02\x02\u0258\u0259\x03\x02\x02\x02\u0259" +
		"/\x03\x02\x02\x02\u025A\u025B\x07\xCF\x02\x02\u025B\u025C\x07\xC0\x02" +
		"\x02\u025C1\x03\x02\x02\x02\u025D\u025F\x054\x1B\x02\u025E\u025D\x03\x02" +
		"\x02\x02\u025E\u025F\x03\x02\x02\x02\u025F\u0262\x03\x02\x02\x02\u0260" +
		"\u0263\x07\xC0\x02\x02\u0261\u0263\x05$\x13\x02\u0262\u0260\x03\x02\x02" +
		"\x02\u0262\u0261\x03\x02\x02\x02\u0263\u0265\x03\x02\x02\x02\u0264\u0266" +
		"\x050\x19\x02\u0265\u0264\x03\x02\x02\x02\u0265\u0266\x03\x02\x02\x02" +
		"\u0266\u0268\x03\x02\x02\x02\u0267\u0269\x058\x1D\x02\u0268\u0267\x03" +
		"\x02\x02\x02\u0268\u0269\x03\x02\x02\x02\u0269\u026F\x03\x02\x02\x02\u026A" +
		"\u026C\x07\xC9\x02\x02\u026B\u026D\x05:\x1E\x02\u026C\u026B\x03\x02\x02" +
		"\x02\u026C\u026D\x03\x02\x02\x02\u026D\u026E\x03\x02\x02\x02\u026E\u0270" +
		"\x07\xCA\x02\x02\u026F\u026A\x03\x02\x02\x02\u026F\u0270\x03\x02\x02\x02" +
		"\u0270\u0272\x03\x02\x02\x02\u0271\u0273\x056\x1C\x02\u0272\u0271\x03" +
		"\x02\x02\x02\u0272\u0273\x03\x02\x02\x02\u0273\u0275\x03\x02\x02\x02\u0274" +
		"\u0276\x058\x1D\x02\u0275\u0274\x03\x02\x02\x02\u0275\u0276\x03\x02\x02" +
		"\x02\u0276\u0278\x03\x02\x02\x02\u0277\u0279\x05\x1C\x0F\x02\u0278\u0277" +
		"\x03\x02\x02\x02\u0278\u0279\x03\x02\x02\x02\u02793\x03\x02\x02\x02\u027A" +
		"\u027B\x07\xDF\x02\x02\u027B\u027C\x07\xC2\x02\x02\u027C\u027D\x07\xC2" +
		"\x02\x02\u027D5\x03\x02\x02\x02\u027E\u027F\x07\xE3\x02\x02\u027F\u0283" +
		"\x07\xDD\x02\x02\u0280\u0281\x07\xE3\x02\x02\u0281\u0283\x07\xE2\x02\x02" +
		"\u0282\u027E\x03\x02\x02\x02\u0282\u0280\x03\x02\x02\x02\u02837\x03\x02" +
		"\x02\x02\u0284\u0285\x07\xDF\x02\x02\u02859\x03\x02\x02\x02\u0286\u0288" +
		"\x05<\x1F\x02\u0287\u0286\x03\x02\x02\x02\u0287\u0288\x03\x02\x02\x02" +
		"\u0288\u028F\x03\x02\x02\x02\u0289\u028B\x07\xC7\x02\x02\u028A\u028C\x05" +
		"<\x1F\x02\u028B\u028A\x03\x02\x02\x02\u028B\u028C\x03\x02\x02\x02\u028C" +
		"\u028E\x03\x02\x02\x02\u028D\u0289\x03\x02\x02\x02\u028E\u0291\x03\x02" +
		"\x02\x02\u028F\u028D\x03\x02\x02\x02\u028F\u0290\x03\x02\x02\x02\u0290" +
		";\x03\x02\x02\x02\u0291\u028F\x03\x02\x02\x02\u0292\u0296\x07\xC0\x02" +
		"\x02\u0293\u0296\x07\xBF\x02\x02\u0294\u0296\x05\"\x12\x02\u0295\u0292" +
		"\x03\x02\x02\x02\u0295\u0293\x03\x02\x02\x02\u0295\u0294\x03\x02\x02\x02" +
		"\u0296\u029E\x03\x02\x02\x02\u0297\u0298\x07\xCE\x02\x02\u0298\u029D\x05" +
		"@!\x02\u0299\u029D\x05B\"\x02\u029A\u029D\x05> \x02\u029B\u029D\x07\xC8" +
		"\x02\x02\u029C\u0297\x03\x02\x02\x02\u029C\u0299\x03\x02\x02\x02\u029C" +
		"\u029A\x03\x02\x02\x02\u029C\u029B\x03\x02\x02\x02\u029D\u02A0\x03\x02" +
		"\x02\x02\u029E\u029C\x03\x02\x02\x02\u029E\u029F\x03\x02\x02\x02\u029F" +
		"=\x03\x02\x02\x02\u02A0\u029E\x03\x02\x02\x02\u02A1\u02A2\x07\xDF\x02" +
		"\x02\u02A2?\x03\x02\x02\x02\u02A3\u02AA\x07\xC0\x02\x02\u02A4\u02A6\x07" +
		"\xBF\x02\x02\u02A5\u02A7\x07\xC0\x02\x02\u02A6\u02A5\x03\x02\x02\x02\u02A6" +
		"\u02A7\x03\x02\x02\x02\u02A7\u02AA\x03\x02\x02\x02\u02A8\u02AA\x07\xE2" +
		"\x02\x02\u02A9\u02A3\x03\x02\x02\x02\u02A9\u02A4\x03\x02\x02\x02\u02A9" +
		"\u02A8\x03\x02\x02\x02\u02AAA\x03\x02\x02\x02\u02AB\u02B3\x07\xC8\x02" +
		"\x02\u02AC\u02AD\x07\xE3\x02\x02\u02AD\u02B3\x05D#\x02\u02AE\u02AF\x07" +
		"\xE3\x02\x02\u02AF\u02B3\x07\xDD\x02\x02\u02B0\u02B1\x07\xE3\x02\x02\u02B1" +
		"\u02B3\x07\xE2\x02\x02\u02B2\u02AB\x03\x02\x02\x02\u02B2\u02AC\x03\x02" +
		"\x02\x02\u02B2\u02AE\x03\x02\x02\x02\u02B2\u02B0\x03\x02\x02\x02\u02B3" +
		"C\x03\x02\x02\x02\u02B4\u02B5\t\x05\x02\x02\u02B5E\x03\x02\x02\x02\u02B6" +
		"\u02B7\x07\x06\x02\x02\u02B7\u02B9\x07\x11\x02\x02\u02B8\u02BA\x07\x04" +
		"\x02\x02\u02B9\u02B8\x03\x02\x02\x02\u02BA\u02BB\x03\x02\x02\x02\u02BB" +
		"\u02B9\x03\x02\x02\x02\u02BB\u02BC\x03\x02\x02\x02\u02BC\u02C5\x03\x02" +
		"\x02\x02\u02BD\u02BF\x05H%\x02\u02BE\u02C0\x07\x04\x02\x02\u02BF\u02BE" +
		"\x03\x02\x02\x02\u02C0\u02C1\x03\x02\x02\x02\u02C1\u02BF\x03\x02\x02\x02" +
		"\u02C1\u02C2\x03\x02\x02\x02\u02C2\u02C4\x03\x02\x02\x02\u02C3\u02BD\x03" +
		"\x02\x02\x02\u02C4\u02C7\x03\x02\x02\x02\u02C5\u02C3\x03\x02\x02\x02\u02C5" +
		"\u02C6\x03\x02\x02\x02\u02C6\u02C8\x03\x02\x02\x02\u02C7\u02C5\x03\x02" +
		"\x02\x02\u02C8\u02C9\x07\x07\x02\x02\u02C9\u02CD\x07\x11\x02\x02\u02CA" +
		"\u02CC\x07\x04\x02\x02\u02CB\u02CA\x03\x02\x02\x02\u02CC\u02CF\x03\x02" +
		"\x02\x02\u02CD\u02CB\x03\x02\x02\x02\u02CD\u02CE\x03\x02\x02\x02\u02CE" +
		"G\x03\x02\x02\x02\u02CF\u02CD\x03\x02\x02\x02\u02D0\u02D1\x07\xC0\x02" +
		"\x02\u02D1\u02D3\x07\xC2\x02\x02\u02D2\u02D0\x03\x02\x02\x02\u02D2\u02D3" +
		"\x03\x02\x02\x02\u02D3\u02D5\x03\x02\x02\x02\u02D4\u02D6\x05J&\x02\u02D5" +
		"\u02D4\x03\x02\x02\x02\u02D5\u02D6\x03\x02\x02\x02\u02D6\u02D7\x03\x02" +
		"\x02\x02\u02D7\u02D8\x07\xC0\x02\x02\u02D8\u02D9\x05L\'\x02\u02D9I\x03" +
		"\x02\x02\x02\u02DA\u02DB\t\x06\x02\x02\u02DBK\x03\x02\x02\x02\u02DC\u02E3" +
		"\x05N(\x02\u02DD\u02DF\x07\xC7\x02\x02\u02DE\u02DD\x03\x02\x02\x02\u02DE" +
		"\u02DF\x03\x02\x02\x02\u02DF\u02E0\x03\x02\x02\x02\u02E0\u02E2\x05N(\x02" +
		"\u02E1\u02DE\x03\x02\x02\x02\u02E2\u02E5\x03\x02\x02\x02\u02E3\u02E1\x03" +
		"\x02\x02\x02\u02E3\u02E4\x03\x02\x02\x02\u02E4M\x03\x02\x02\x02\u02E5" +
		"\u02E3\x03\x02\x02\x02\u02E6\u02E9\x05.\x18\x02\u02E7\u02E8\x07\xD1\x02" +
		"\x02\u02E8\u02EA\x07\xBF\x02\x02\u02E9\u02E7\x03\x02\x02\x02\u02E9\u02EA" +
		"\x03\x02\x02\x02\u02EA\u02EF\x03\x02\x02\x02\u02EB\u02EC\x07\xC0\x02\x02" +
		"\u02EC\u02ED\t\x07\x02\x02\u02ED\u02EF\x07\xBF\x02\x02\u02EE\u02E6\x03" +
		"\x02\x02\x02\u02EE\u02EB\x03\x02\x02\x02\u02EFO\x03\x02\x02\x02\u02F0" +
		"\u02F1\x07\x06\x02\x02\u02F1\u02F2\x07\x13\x02\x02\u02F2\u02F4\x07\x15" +
		"\x02\x02\u02F3\u02F5\x07\x04\x02\x02\u02F4\u02F3\x03\x02\x02\x02\u02F5" +
		"\u02F6\x03\x02\x02\x02\u02F6\u02F4\x03\x02\x02\x02\u02F6\u02F7\x03\x02" +
		"\x02\x02\u02F7\u0300\x03\x02\x02\x02\u02F8\u02FA\x05R*\x02\u02F9\u02FB" +
		"\x07\x04\x02\x02\u02FA\u02F9\x03\x02\x02\x02\u02FB\u02FC\x03\x02\x02\x02" +
		"\u02FC\u02FA\x03\x02\x02\x02\u02FC\u02FD\x03\x02\x02\x02\u02FD\u02FF\x03" +
		"\x02\x02\x02\u02FE\u02F8\x03\x02\x02\x02\u02FF\u0302\x03\x02\x02\x02\u0300" +
		"\u02FE\x03\x02\x02\x02\u0300\u0301\x03\x02\x02\x02\u0301\u0303\x03\x02" +
		"\x02\x02\u0302\u0300\x03\x02\x02\x02\u0303\u0304\x07\x07\x02\x02\u0304" +
		"\u0305\x07\x13\x02\x02\u0305\u0309\x07\x15\x02\x02\u0306\u0308\x07\x04" +
		"\x02\x02\u0307\u0306\x03\x02\x02\x02\u0308\u030B\x03\x02\x02\x02\u0309" +
		"\u0307\x03\x02\x02\x02\u0309\u030A\x03\x02\x02\x02\u030A\u0341\x03\x02" +
		"\x02\x02\u030B\u0309\x03\x02\x02\x02\u030C\u030D\x07\x06\x02\x02\u030D" +
		"\u030F\x07\x16\x02\x02\u030E\u0310\x07\x04\x02\x02\u030F\u030E\x03\x02" +
		"\x02\x02\u0310\u0311\x03\x02\x02\x02\u0311\u030F\x03\x02\x02\x02\u0311" +
		"\u0312\x03\x02\x02\x02\u0312\u031B\x03\x02\x02\x02\u0313\u0315\x05R*\x02" +
		"\u0314\u0316\x07\x04\x02\x02\u0315\u0314\x03\x02\x02\x02\u0316\u0317\x03" +
		"\x02\x02\x02\u0317\u0315\x03\x02\x02\x02\u0317\u0318\x03\x02\x02\x02\u0318" +
		"\u031A\x03\x02\x02\x02\u0319\u0313\x03\x02\x02\x02\u031A\u031D\x03\x02" +
		"\x02\x02\u031B\u0319\x03\x02\x02\x02\u031B\u031C\x03\x02\x02\x02\u031C" +
		"\u031E\x03\x02\x02\x02\u031D\u031B\x03\x02\x02\x02\u031E\u031F\x07\x07" +
		"\x02\x02\u031F\u0323\x07\x16\x02\x02\u0320\u0322\x07\x04\x02\x02\u0321" +
		"\u0320\x03\x02\x02\x02\u0322\u0325\x03\x02\x02\x02\u0323\u0321\x03\x02" +
		"\x02\x02\u0323\u0324\x03\x02\x02\x02\u0324\u0341\x03\x02\x02\x02\u0325" +
		"\u0323\x03\x02\x02\x02\u0326\u0327\x07\x06\x02\x02\u0327\u0329\x07\x14" +
		"\x02\x02\u0328\u032A\x07\x04\x02\x02\u0329\u0328\x03\x02\x02\x02\u032A" +
		"\u032B\x03\x02\x02\x02\u032B\u0329\x03\x02\x02\x02\u032B\u032C\x03\x02" +
		"\x02\x02\u032C\u0335\x03\x02\x02\x02\u032D\u032F\x05R*\x02\u032E\u0330" +
		"\x07\x04\x02\x02\u032F\u032E\x03\x02\x02\x02\u0330\u0331\x03\x02\x02\x02" +
		"\u0331\u032F\x03\x02\x02\x02\u0331\u0332\x03\x02\x02\x02\u0332\u0334\x03" +
		"\x02\x02\x02\u0333\u032D\x03\x02\x02\x02\u0334\u0337\x03\x02\x02\x02\u0335" +
		"\u0333\x03\x02\x02\x02\u0335\u0336\x03\x02\x02\x02\u0336\u0338\x03\x02" +
		"\x02\x02\u0337\u0335\x03\x02\x02\x02\u0338\u0339\x07\x07\x02\x02\u0339" +
		"\u033D\x07\x14\x02\x02\u033A\u033C\x07\x04\x02\x02\u033B\u033A\x03\x02" +
		"\x02\x02\u033C\u033F\x03\x02\x02\x02\u033D\u033B\x03\x02\x02\x02\u033D" +
		"\u033E\x03\x02\x02\x02\u033E\u0341\x03\x02\x02\x02\u033F\u033D\x03\x02" +
		"\x02\x02\u0340\u02F0\x03\x02\x02\x02\u0340\u030C\x03\x02\x02\x02\u0340" +
		"\u0326\x03\x02\x02\x02\u0341Q\x03\x02\x02\x02\u0342\u0344\x05T+\x02\u0343" +
		"\u0342\x03\x02\x02\x02\u0343\u0344\x03\x02\x02\x02\u0344\u0352\x03\x02" +
		"\x02\x02\u0345\u0346\x07\xC5\x02\x02\u0346\u034D\x05^0\x02\u0347\u0349" +
		"\x07\xC7\x02\x02\u0348\u0347\x03\x02\x02\x02\u0348\u0349\x03\x02\x02\x02" +
		"\u0349\u034A\x03\x02\x02\x02\u034A\u034C\x05^0\x02\u034B\u0348\x03\x02" +
		"\x02\x02\u034C\u034F\x03\x02\x02\x02\u034D\u034B\x03\x02\x02\x02\u034D" +
		"\u034E\x03\x02\x02\x02\u034E\u0350\x03\x02\x02\x02\u034F\u034D\x03\x02" +
		"\x02\x02\u0350\u0351\x07\xC6\x02\x02\u0351\u0353\x03\x02\x02\x02\u0352" +
		"\u0345\x03\x02\x02\x02\u0352\u0353\x03\x02\x02\x02\u0353\u0354\x03\x02" +
		"\x02\x02\u0354\u0355\x05V,\x02\u0355\u0356\x05Z.\x02\u0356\u0357\x05X" +
		"-\x02\u0357\u035B\x05\\/\x02\u0358\u035A\x05^0\x02\u0359\u0358\x03\x02" +
		"\x02\x02\u035A\u035D\x03\x02\x02\x02\u035B\u0359\x03\x02\x02\x02\u035B" +
		"\u035C\x03\x02\x02\x02\u035CS\x03\x02\x02\x02\u035D\u035B\x03\x02\x02" +
		"\x02\u035E\u0368\t\x05\x02\x02\u035F\u0367\x07\xC0\x02\x02\u0360\u0367" +
		"\x07\xBF\x02\x02\u0361\u0363\x07\xC9\x02\x02\u0362\u0364\x07\xC0\x02\x02" +
		"\u0363\u0362\x03\x02\x02\x02\u0363\u0364\x03\x02\x02\x02\u0364\u0365\x03" +
		"\x02\x02\x02\u0365\u0367\x07\xCA\x02\x02\u0366\u035F\x03\x02\x02\x02\u0366" +
		"\u0360\x03\x02\x02\x02\u0366\u0361\x03\x02\x02\x02\u0367\u036A\x03\x02" +
		"\x02\x02\u0368\u0366\x03\x02\x02\x02\u0368\u0369\x03\x02\x02\x02\u0369" +
		"\u036B\x03\x02\x02\x02\u036A\u0368\x03\x02\x02\x02\u036B\u036E\x07\xC2" +
		"\x02\x02\u036C\u036E\x07\xBF\x02\x02\u036D\u035E\x03\x02\x02\x02\u036D" +
		"\u036C\x03\x02\x02\x02\u036EU\x03\x02\x02\x02\u036F\u0372\x05.\x18\x02" +
		"\u0370\u0372\x07\xBF\x02\x02\u0371\u036F\x03\x02\x02\x02\u0371\u0370\x03" +
		"\x02\x02\x02\u0372\u037A\x03\x02\x02\x02\u0373\u0376\x07\xDD\x02\x02\u0374" +
		"\u0377\x05.\x18\x02\u0375\u0377\x07\xBF\x02\x02\u0376\u0374\x03\x02\x02" +
		"\x02\u0376\u0375\x03\x02\x02\x02\u0377\u0379\x03\x02\x02\x02\u0378\u0373" +
		"\x03\x02\x02\x02\u0379\u037C\x03\x02\x02\x02\u037A\u0378\x03\x02\x02\x02" +
		"\u037A\u037B\x03\x02\x02\x02\u037BW\x03\x02\x02\x02\u037C\u037A\x03\x02" +
		"\x02\x02\u037D\u0380\x05.\x18\x02\u037E\u0380\x07\xBF\x02\x02\u037F\u037D" +
		"\x03\x02\x02\x02\u037F\u037E\x03\x02\x02\x02\u0380\u0388\x03\x02\x02\x02" +
		"\u0381\u0384\x07\xDD\x02\x02\u0382\u0385\x05.\x18\x02\u0383\u0385\x07" +
		"\xBF\x02\x02\u0384\u0382\x03\x02\x02\x02\u0384\u0383\x03\x02\x02\x02\u0385" +
		"\u0387\x03\x02\x02\x02\u0386\u0381\x03\x02\x02\x02\u0387\u038A\x03\x02" +
		"\x02\x02\u0388\u0386\x03\x02\x02\x02\u0388\u0389\x03\x02\x02\x02\u0389" +
		"Y\x03\x02\x02\x02\u038A\u0388\x03\x02\x02\x02\u038B\u038C\t\b\x02\x02" +
		"\u038C[\x03\x02\x02\x02\u038D\u0390\x05\xA0Q\x02\u038E\u038F\x07\xC7\x02" +
		"\x02\u038F\u0391\x05\xA0Q\x02\u0390\u038E\x03\x02\x02\x02\u0390\u0391" +
		"\x03\x02\x02\x02\u0391]\x03\x02\x02\x02\u0392\u03B6\x07 \x02\x02\u0393" +
		"\u03B6\x07!\x02\x02\u0394\u03B6\x07\x1F\x02\x02\u0395\u03B6\x07&\x02\x02" +
		"\u0396\u0397\x07\xA2\x02\x02\u0397\u0398\x07\xD7\x02\x02\u0398\u03B6\x05" +
		"\xA0Q\x02\u0399\u039A\x07\"\x02\x02\u039A\u039B\x07\xC9\x02\x02\u039B" +
		"\u039C\x07\xBF\x02\x02\u039C\u039D\x07\xC7\x02\x02\u039D\u039E\x05`1\x02" +
		"\u039E\u039F\x07\xCA\x02\x02\u039F\u03B6\x03\x02\x02\x02\u03A0\u03A1\x07" +
		"$\x02\x02\u03A1\u03A2\x07\xC9\x02\x02\u03A2\u03A3\x07\xBF\x02\x02\u03A3" +
		"\u03A4\x07\xC7\x02\x02\u03A4\u03A5\x05`1\x02\u03A5\u03A6\x07\xCA\x02\x02" +
		"\u03A6\u03B6\x03\x02\x02\x02\u03A7\u03A8\x07#\x02\x02\u03A8\u03A9\x07" +
		"\xC9\x02\x02\u03A9\u03AA\x07\xBF\x02\x02\u03AA\u03AB\x07\xC7\x02\x02\u03AB" +
		"\u03AC\x05`1\x02\u03AC\u03AD\x07\xCA\x02\x02\u03AD\u03B6\x03\x02\x02\x02" +
		"\u03AE\u03AF\x07%\x02\x02\u03AF\u03B0\x07\xC9\x02\x02\u03B0\u03B1\x07" +
		"\xBF\x02\x02\u03B1\u03B2\x07\xC7\x02\x02\u03B2\u03B3\x05`1\x02\u03B3\u03B4" +
		"\x07\xCA\x02\x02\u03B4\u03B6\x03\x02\x02\x02\u03B5\u0392\x03\x02\x02\x02" +
		"\u03B5\u0393\x03\x02\x02\x02\u03B5\u0394\x03\x02\x02\x02\u03B5\u0395\x03" +
		"\x02\x02\x02\u03B5\u0396\x03\x02\x02\x02\u03B5\u0399\x03\x02\x02\x02\u03B5" +
		"\u03A0\x03\x02\x02\x02\u03B5\u03A7\x03\x02\x02\x02\u03B5\u03AE\x03\x02" +
		"\x02\x02\u03B6_\x03\x02\x02\x02\u03B7\u03BC\x05.\x18\x02\u03B8\u03B9\x07" +
		"\xC7\x02\x02\u03B9\u03BB\x05.\x18\x02\u03BA\u03B8\x03\x02\x02\x02\u03BB" +
		"\u03BE\x03\x02\x02\x02\u03BC\u03BA\x03\x02\x02\x02\u03BC\u03BD\x03\x02" +
		"\x02\x02\u03BDa\x03\x02\x02\x02\u03BE\u03BC\x03\x02\x02\x02\u03BF\u03C0" +
		"\x07\x06\x02\x02\u03C0\u03C2\x07\x12\x02\x02\u03C1\u03C3\x07\x04\x02\x02" +
		"\u03C2\u03C1\x03\x02\x02\x02\u03C3\u03C4\x03\x02\x02\x02\u03C4\u03C2\x03" +
		"\x02\x02\x02\u03C4\u03C5\x03\x02\x02\x02\u03C5\u03CE\x03\x02\x02\x02\u03C6" +
		"\u03C8\x05d3\x02\u03C7\u03C9\x07\x04\x02\x02\u03C8\u03C7\x03\x02\x02\x02" +
		"\u03C9\u03CA\x03\x02\x02\x02\u03CA\u03C8\x03\x02\x02";
	private static readonly _serializedATNSegment2: string =
		"\x02\u03CA\u03CB\x03\x02\x02\x02\u03CB\u03CD\x03\x02\x02\x02\u03CC\u03C6" +
		"\x03\x02\x02\x02\u03CD\u03D0\x03\x02\x02\x02\u03CE\u03CC\x03\x02\x02\x02" +
		"\u03CE\u03CF\x03\x02\x02\x02\u03CF\u03D1\x03\x02\x02\x02\u03D0\u03CE\x03" +
		"\x02\x02\x02\u03D1\u03D2\x07\x07\x02\x02\u03D2\u03D6\x07\x12\x02\x02\u03D3" +
		"\u03D5\x07\x04\x02\x02\u03D4\u03D3\x03\x02\x02\x02\u03D5\u03D8\x03\x02" +
		"\x02\x02\u03D6\u03D4\x03\x02\x02\x02\u03D6\u03D7\x03\x02\x02\x02\u03D7" +
		"c\x03\x02\x02\x02\u03D8\u03D6\x03\x02\x02\x02\u03D9\u03DA\x07\xC0\x02" +
		"\x02\u03DA\u03DC\x07\xC2\x02\x02\u03DB\u03D9\x03\x02\x02\x02\u03DB\u03DC" +
		"\x03\x02\x02\x02\u03DC\u03DD\x03\x02\x02\x02\u03DD\u03E3\x07\xC0\x02\x02" +
		"\u03DE\u03E0\x07\xC9\x02\x02\u03DF\u03E1\x05f4\x02\u03E0\u03DF\x03\x02" +
		"\x02\x02\u03E0\u03E1\x03\x02\x02\x02\u03E1\u03E2\x03\x02\x02\x02\u03E2" +
		"\u03E4\x07\xCA\x02\x02\u03E3\u03DE\x03\x02\x02\x02\u03E3\u03E4\x03\x02" +
		"\x02\x02\u03E4\u03E6\x03\x02\x02\x02\u03E5\u03E7\x07\xD7\x02\x02\u03E6" +
		"\u03E5\x03\x02\x02\x02\u03E6\u03E7\x03\x02\x02\x02\u03E7\u03E8\x03\x02" +
		"\x02\x02\u03E8\u03E9\x05\xA0Q\x02\u03E9e\x03\x02\x02\x02\u03EA\u03EF\x07" +
		"\xC0\x02\x02\u03EB\u03EC\x07\xC7\x02\x02\u03EC\u03EE\x07\xC0\x02\x02\u03ED" +
		"\u03EB\x03\x02\x02\x02\u03EE\u03F1\x03\x02\x02\x02\u03EF\u03ED\x03\x02" +
		"\x02\x02\u03EF\u03F0\x03\x02\x02\x02\u03F0g\x03\x02\x02\x02\u03F1\u03EF" +
		"\x03\x02\x02\x02\u03F2\u03F3\x07\x06\x02\x02\u03F3\u03F5\x07\n\x02\x02" +
		"\u03F4\u03F6\x07\x04\x02\x02\u03F5\u03F4\x03\x02\x02\x02\u03F6\u03F7\x03" +
		"\x02\x02\x02\u03F7\u03F5\x03\x02\x02\x02\u03F7\u03F8\x03\x02\x02\x02\u03F8" +
		"\u0401\x03\x02\x02\x02\u03F9\u03FB\x05j6\x02\u03FA\u03FC\x07\x04\x02\x02" +
		"\u03FB\u03FA\x03\x02\x02\x02\u03FC\u03FD\x03\x02\x02\x02\u03FD\u03FB\x03" +
		"\x02\x02\x02\u03FD\u03FE\x03\x02\x02\x02\u03FE\u0400\x03\x02\x02\x02\u03FF" +
		"\u03F9\x03\x02\x02\x02\u0400\u0403\x03\x02\x02\x02\u0401\u03FF\x03\x02" +
		"\x02\x02\u0401\u0402\x03\x02\x02\x02\u0402\u0404\x03\x02\x02\x02\u0403" +
		"\u0401\x03\x02\x02\x02\u0404\u0405\x07\x07\x02\x02\u0405\u0409\x07\n\x02" +
		"\x02\u0406\u0408\x07\x04\x02\x02\u0407\u0406\x03\x02\x02\x02\u0408\u040B" +
		"\x03\x02\x02\x02\u0409\u0407\x03\x02\x02\x02\u0409\u040A\x03\x02\x02\x02" +
		"\u040Ai\x03\x02\x02\x02\u040B\u0409\x03\x02\x02\x02\u040C\u040D\x07\xC0" +
		"\x02\x02\u040D\u040F\x07\xC2\x02\x02\u040E\u040C\x03\x02\x02\x02\u040E" +
		"\u040F\x03\x02\x02\x02\u040F\u0410\x03\x02\x02\x02\u0410\u0411\x07\xC0" +
		"\x02\x02\u0411\u0412\x07\xBF\x02\x02\u0412\u0414\x05\xA0Q\x02\u0413\u0415" +
		"\x07\xC0\x02\x02\u0414\u0413\x03\x02\x02\x02\u0414\u0415\x03\x02\x02\x02" +
		"\u0415k\x03\x02\x02\x02\u0416\u0417\x07\x06\x02\x02\u0417\u0418\x07\x1C" +
		"\x02\x02\u0418\u041A\x07\x1D\x02\x02\u0419\u041B\x07\x04\x02\x02\u041A" +
		"\u0419\x03\x02\x02\x02\u041B\u041C\x03\x02\x02\x02\u041C\u041A\x03\x02" +
		"\x02\x02\u041C\u041D\x03\x02\x02\x02\u041D\u0426\x03\x02\x02\x02\u041E" +
		"\u0420\x05n8\x02\u041F\u0421\x07\x04\x02\x02\u0420\u041F\x03\x02\x02\x02" +
		"\u0421\u0422\x03\x02\x02\x02\u0422\u0420\x03\x02\x02\x02\u0422\u0423\x03" +
		"\x02\x02\x02\u0423\u0425\x03\x02\x02\x02\u0424\u041E\x03\x02\x02\x02\u0425" +
		"\u0428\x03\x02\x02\x02\u0426\u0424\x03\x02\x02\x02\u0426\u0427\x03\x02" +
		"\x02\x02\u0427\u0429\x03\x02\x02\x02\u0428\u0426\x03\x02\x02\x02\u0429" +
		"\u042A\x07\x07\x02\x02\u042A\u042B\x07\x1C\x02\x02\u042B\u042F\x07\x1D" +
		"\x02\x02\u042C\u042E\x07\x04\x02\x02\u042D\u042C\x03\x02\x02\x02\u042E" +
		"\u0431\x03\x02\x02\x02\u042F\u042D\x03\x02\x02\x02\u042F\u0430\x03\x02" +
		"\x02\x02\u0430m\x03\x02\x02\x02\u0431\u042F\x03\x02\x02\x02\u0432\u0433" +
		"\x07\xC0\x02\x02\u0433\u0435\x07\xC2\x02\x02\u0434\u0432\x03\x02\x02\x02" +
		"\u0434\u0435\x03\x02\x02\x02\u0435\u0436\x03\x02\x02\x02\u0436\u0437\x05" +
		".\x18\x02\u0437\u0438\x05\xA0Q\x02\u0438o\x03\x02\x02\x02\u0439\u043A" +
		"\x07\x06\x02\x02\u043A\u043B\x07\x1A\x02\x02\u043B\u043D\x07\x1B\x02\x02" +
		"\u043C\u043E\x07\x04\x02\x02\u043D\u043C\x03\x02\x02\x02\u043E\u043F\x03" +
		"\x02\x02\x02\u043F\u043D\x03\x02\x02\x02\u043F\u0440\x03\x02\x02\x02\u0440" +
		"\u0449\x03\x02\x02\x02\u0441\u0443\x05r:\x02\u0442\u0444\x07\x04\x02\x02" +
		"\u0443\u0442\x03\x02\x02\x02\u0444\u0445\x03\x02\x02\x02\u0445\u0443\x03" +
		"\x02\x02\x02\u0445\u0446\x03\x02\x02\x02\u0446\u0448\x03\x02\x02\x02\u0447" +
		"\u0441\x03\x02\x02\x02\u0448\u044B\x03\x02\x02\x02\u0449\u0447\x03\x02" +
		"\x02\x02\u0449\u044A\x03\x02\x02\x02\u044A\u044C\x03\x02\x02\x02\u044B" +
		"\u0449\x03\x02\x02\x02\u044C\u044D\x07\x07\x02\x02\u044D\u044E\x07\x1A" +
		"\x02\x02\u044E\u0452\x07\x1B\x02\x02\u044F\u0451\x07\x04\x02\x02\u0450" +
		"\u044F\x03\x02\x02\x02\u0451\u0454\x03\x02\x02\x02\u0452\u0450\x03\x02" +
		"\x02\x02\u0452\u0453\x03\x02\x02\x02\u0453q\x03\x02\x02\x02\u0454\u0452" +
		"\x03\x02\x02\x02\u0455\u0456\x07\xC0\x02\x02\u0456\u0458\x07\xC2\x02\x02" +
		"\u0457\u0455\x03\x02\x02\x02\u0457\u0458\x03\x02\x02\x02\u0458\u0459\x03" +
		"\x02\x02\x02\u0459\u045A\x05.\x18\x02\u045A\u045B\x07\xCB\x02\x02\u045B" +
		"\u045C\x07\xC0\x02\x02\u045C\u045E\x07\xC9\x02\x02\u045D\u045F\x05f4\x02" +
		"\u045E\u045D\x03\x02\x02\x02\u045E\u045F\x03\x02\x02\x02\u045F\u0460\x03" +
		"\x02\x02\x02\u0460\u0461\x07\xCA\x02\x02\u0461s\x03\x02\x02\x02\u0462" +
		"\u0463\x07\x06\x02\x02\u0463\u0464\x07\x1A\x02\x02\u0464\u0466\x07\x0E" +
		"\x02\x02\u0465\u0467\x07\x04\x02\x02\u0466\u0465\x03\x02\x02\x02\u0467" +
		"\u0468\x03\x02\x02\x02\u0468\u0466\x03\x02\x02\x02\u0468\u0469\x03\x02" +
		"\x02\x02\u0469\u0472\x03\x02\x02\x02\u046A\u046C\x05v<\x02\u046B\u046D" +
		"\x07\x04\x02\x02\u046C\u046B\x03\x02\x02\x02\u046D\u046E\x03\x02\x02\x02" +
		"\u046E\u046C\x03\x02\x02\x02\u046E\u046F\x03\x02\x02\x02\u046F\u0471\x03" +
		"\x02\x02\x02\u0470\u046A\x03\x02\x02\x02\u0471\u0474\x03\x02\x02\x02\u0472" +
		"\u0470\x03\x02\x02\x02\u0472\u0473\x03\x02\x02\x02\u0473\u0475\x03\x02" +
		"\x02\x02\u0474\u0472\x03\x02\x02\x02\u0475\u0476\x07\x07\x02\x02\u0476" +
		"\u0477\x07\x1A\x02\x02\u0477\u047B\x07\x0E\x02\x02\u0478\u047A\x07\x04" +
		"\x02\x02\u0479\u0478\x03\x02\x02\x02\u047A\u047D\x03\x02\x02\x02\u047B" +
		"\u0479\x03\x02\x02\x02\u047B\u047C\x03\x02\x02\x02\u047Cu\x03\x02\x02" +
		"\x02\u047D\u047B\x03\x02\x02\x02\u047E\u0480\x05\x1A\x0E\x02\u047F\u0481" +
		"\x07\xC0\x02\x02\u0480\u047F\x03\x02\x02\x02\u0480\u0481\x03\x02\x02\x02" +
		"\u0481w\x03\x02\x02\x02\u0482\u0484\x05~@\x02\u0483\u0482\x03\x02\x02" +
		"\x02\u0484\u0485\x03\x02\x02\x02\u0485\u0483\x03\x02\x02\x02\u0485\u0486" +
		"\x03\x02\x02\x02\u0486y\x03\x02\x02\x02\u0487\u0488\x07\x06\x02\x02\u0488" +
		"\u048A\x07\x19\x02\x02\u0489\u048B\x07\x04\x02\x02\u048A\u0489\x03\x02" +
		"\x02\x02\u048B\u048C\x03\x02\x02\x02\u048C\u048A\x03\x02\x02\x02\u048C" +
		"\u048D\x03\x02\x02\x02\u048D\u0491\x03\x02\x02\x02\u048E\u0490\x05~@\x02" +
		"\u048F\u048E\x03\x02\x02\x02\u0490\u0493\x03\x02\x02\x02\u0491\u048F\x03" +
		"\x02\x02\x02\u0491\u0492\x03\x02\x02\x02\u0492\u0494\x03\x02\x02\x02\u0493" +
		"\u0491\x03\x02\x02\x02\u0494\u0495\x07\x07\x02\x02\u0495\u0499\x07\x19" +
		"\x02\x02\u0496\u0498\x07\x04\x02\x02\u0497\u0496\x03\x02\x02\x02\u0498" +
		"\u049B\x03\x02\x02\x02\u0499\u0497\x03\x02\x02\x02\u0499\u049A\x03\x02" +
		"\x02\x02\u049A{\x03\x02\x02\x02\u049B\u0499\x03\x02\x02\x02\u049C\u049D" +
		"\x07\x06\x02\x02\u049D\u049F\x07\x19\x02\x02\u049E\u04A0\x07\x04\x02\x02" +
		"\u049F\u049E\x03\x02\x02\x02\u04A0\u04A1\x03\x02\x02\x02\u04A1\u049F\x03" +
		"\x02\x02\x02\u04A1\u04A2\x03\x02\x02\x02\u04A2\u04A6\x03\x02\x02\x02\u04A3" +
		"\u04A5\x05~@\x02\u04A4\u04A3\x03\x02\x02\x02\u04A5\u04A8\x03\x02\x02\x02" +
		"\u04A6\u04A4\x03\x02\x02\x02\u04A6\u04A7\x03\x02\x02\x02\u04A7\u04A9\x03" +
		"\x02\x02\x02\u04A8\u04A6\x03\x02\x02\x02\u04A9\u04AA\x07\x07\x02\x02\u04AA" +
		"\u04AE\x07\x19\x02\x02\u04AB\u04AD\x07\x04\x02\x02\u04AC\u04AB\x03\x02" +
		"\x02\x02\u04AD\u04B0\x03\x02\x02\x02\u04AE\u04AC\x03\x02\x02\x02\u04AE" +
		"\u04AF\x03\x02\x02\x02\u04AF}\x03\x02\x02\x02\u04B0\u04AE\x03\x02\x02" +
		"\x02\u04B1\u04B9\x05\x80A\x02\u04B2\u04B9\x05\x82B\x02\u04B3\u04B9\x05" +
		"\x84C\x02\u04B4\u04B9\x05\x86D\x02\u04B5\u04B9\x05\x88E\x02\u04B6\u04B9" +
		"\x05\x8AF\x02\u04B7\u04B9\x05\x8CG\x02\u04B8\u04B1\x03\x02\x02\x02\u04B8" +
		"\u04B2\x03\x02\x02\x02\u04B8\u04B3\x03\x02\x02\x02\u04B8\u04B4\x03\x02" +
		"\x02\x02\u04B8\u04B5\x03\x02\x02\x02\u04B8\u04B6\x03\x02\x02\x02\u04B8" +
		"\u04B7\x03\x02\x02\x02\u04B9\x7F\x03\x02\x02\x02\u04BA\u04BB\x07-\x02" +
		"\x02\u04BB\u04BD\x07\xC9\x02\x02\u04BC\u04BE\x05\x8EH\x02\u04BD\u04BC" +
		"\x03\x02\x02\x02\u04BD\u04BE\x03\x02\x02\x02\u04BE\u04BF\x03\x02\x02\x02" +
		"\u04BF\u04C1\x07\xCA\x02\x02\u04C0\u04C2\x07\xC1\x02\x02\u04C1\u04C0\x03" +
		"\x02\x02\x02\u04C1\u04C2\x03\x02\x02\x02\u04C2\u04C6\x03\x02\x02\x02\u04C3" +
		"\u04C5\x07\x04\x02\x02\u04C4\u04C3\x03\x02\x02\x02\u04C5\u04C8\x03\x02" +
		"\x02\x02\u04C6\u04C4\x03\x02\x02\x02\u04C6\u04C7\x03\x02\x02\x02\u04C7" +
		"\x81\x03\x02\x02\x02\u04C8\u04C6\x03\x02\x02\x02\u04C9\u04CA\x074\x02" +
		"\x02\u04CA\u04CC\x07\xC9\x02\x02\u04CB\u04CD\x05\x8EH\x02\u04CC\u04CB" +
		"\x03\x02\x02\x02\u04CC\u04CD\x03\x02\x02\x02\u04CD\u04CE\x03\x02\x02\x02" +
		"\u04CE\u04D0\x07\xCA\x02\x02\u04CF\u04D1\x07\xC1\x02\x02\u04D0\u04CF\x03" +
		"\x02\x02\x02\u04D0\u04D1\x03\x02\x02\x02\u04D1\u04D5\x03\x02\x02\x02\u04D2" +
		"\u04D4\x07\x04\x02\x02\u04D3\u04D2\x03\x02\x02\x02\u04D4\u04D7\x03\x02" +
		"\x02\x02\u04D5\u04D3\x03\x02\x02\x02\u04D5\u04D6\x03\x02\x02\x02\u04D6" +
		"\x83\x03\x02\x02\x02\u04D7\u04D5\x03\x02\x02\x02\u04D8\u04D9\t\t\x02\x02" +
		"\u04D9\u04DB\x07\xC9\x02\x02\u04DA\u04DC\x05\x8EH\x02\u04DB\u04DA\x03" +
		"\x02\x02\x02\u04DB\u04DC\x03\x02\x02\x02\u04DC\u04DD\x03\x02\x02\x02\u04DD" +
		"\u04DF\x07\xCA\x02\x02\u04DE\u04E0\x07\xC1\x02\x02\u04DF\u04DE\x03\x02" +
		"\x02\x02\u04DF\u04E0\x03\x02\x02\x02\u04E0\u04E4\x03\x02\x02\x02\u04E1" +
		"\u04E3\x07\x04\x02\x02\u04E2\u04E1\x03\x02\x02\x02\u04E3\u04E6\x03\x02" +
		"\x02\x02\u04E4\u04E2\x03\x02\x02\x02\u04E4\u04E5\x03\x02\x02\x02\u04E5" +
		"\x85\x03\x02\x02\x02\u04E6\u04E4\x03\x02\x02\x02\u04E7\u04E8\t\n\x02\x02" +
		"\u04E8\u04EA\x07\xC9\x02\x02\u04E9\u04EB\x05\x8EH\x02\u04EA\u04E9\x03" +
		"\x02\x02\x02\u04EA\u04EB\x03\x02\x02\x02\u04EB\u04EC\x03\x02\x02\x02\u04EC" +
		"\u04EE\x07\xCA\x02\x02\u04ED\u04EF\x07\xC1\x02\x02\u04EE\u04ED\x03\x02" +
		"\x02\x02\u04EE\u04EF\x03\x02\x02\x02\u04EF\u04F3\x03\x02\x02\x02\u04F0" +
		"\u04F2\x07\x04\x02\x02\u04F1\u04F0\x03\x02\x02\x02\u04F2\u04F5\x03\x02" +
		"\x02\x02\u04F3\u04F1\x03\x02\x02\x02\u04F3\u04F4\x03\x02\x02\x02\u04F4" +
		"\x87\x03\x02\x02\x02\u04F5\u04F3\x03\x02\x02\x02\u04F6\u04F7\t\v\x02\x02" +
		"\u04F7\u04F8\x07\xC9\x02\x02\u04F8\u04FF\x07\xE4\x02\x02\u04F9\u0500\x05" +
		".\x18\x02\u04FA\u04FC\n\x02\x02\x02\u04FB\u04FA\x03\x02\x02\x02\u04FC" +
		"\u04FD\x03\x02\x02\x02\u04FD\u04FB\x03\x02\x02\x02\u04FD\u04FE\x03\x02" +
		"\x02\x02\u04FE\u0500\x03\x02\x02\x02\u04FF\u04F9\x03\x02\x02\x02\u04FF" +
		"\u04FB\x03\x02\x02\x02\u0500\u0501\x03\x02\x02\x02\u0501\u0502\x07\xE4" +
		"\x02\x02\u0502\u050C\x07\xC7\x02\x02\u0503\u050D\x05\xA0Q\x02\u0504\u0508" +
		"\x07\xE4\x02\x02\u0505\u0507\n\x02\x02\x02\u0506\u0505\x03\x02\x02\x02" +
		"\u0507\u050A\x03\x02\x02\x02\u0508\u0506\x03\x02\x02\x02\u0508\u0509\x03" +
		"\x02\x02\x02\u0509\u050B\x03\x02\x02\x02\u050A\u0508\x03\x02\x02\x02\u050B" +
		"\u050D\x07\xE4\x02\x02\u050C\u0503\x03\x02\x02\x02\u050C\u0504\x03\x02" +
		"\x02\x02\u050D\u050E\x03\x02\x02\x02\u050E\u0510\x07\xCA\x02\x02\u050F" +
		"\u0511\x07\xC1\x02\x02\u0510\u050F\x03\x02\x02\x02\u0510\u0511\x03\x02" +
		"\x02\x02\u0511\u0515\x03\x02\x02\x02\u0512\u0514\x07\x04\x02\x02\u0513" +
		"\u0512\x03\x02\x02\x02\u0514\u0517\x03\x02\x02\x02\u0515\u0513\x03\x02" +
		"\x02\x02\u0515\u0516\x03\x02\x02\x02\u0516\x89\x03\x02\x02\x02\u0517\u0515" +
		"\x03\x02\x02\x02\u0518\u0519\t\f\x02\x02\u0519\u051C\x07\xC9\x02\x02\u051A" +
		"\u051D\x05\x8EH\x02\u051B\u051D\x05\x94K\x02\u051C\u051A\x03\x02\x02\x02" +
		"\u051C\u051B\x03\x02\x02\x02\u051C\u051D\x03\x02\x02\x02\u051D\u051E\x03" +
		"\x02\x02\x02\u051E\u0520\x07\xCA\x02\x02\u051F\u0521\x07\xC1\x02\x02\u0520" +
		"\u051F\x03\x02\x02\x02\u0520\u0521\x03\x02\x02\x02\u0521\u0525\x03\x02" +
		"\x02\x02\u0522\u0524\x07\x04\x02\x02\u0523\u0522\x03\x02\x02\x02\u0524" +
		"\u0527\x03\x02\x02\x02\u0525\u0523\x03\x02\x02\x02\u0525\u0526\x03\x02" +
		"\x02\x02\u0526\x8B\x03\x02\x02\x02\u0527\u0525\x03\x02\x02\x02\u0528\u0529" +
		"\x07(\x02\x02\u0529\u052A\x07\xC9\x02\x02\u052A\u052E\x07\xE4\x02\x02" +
		"\u052B\u052D\n\x02\x02\x02\u052C\u052B\x03\x02\x02\x02\u052D\u0530\x03" +
		"\x02\x02\x02\u052E\u052C\x03\x02\x02\x02\u052E\u052F\x03\x02\x02\x02\u052F" +
		"\u0531\x03\x02\x02\x02\u0530\u052E\x03\x02\x02\x02\u0531\u0532\x07\xE4" +
		"\x02\x02\u0532\u0533\x07\xC7\x02\x02\u0533\u0537\x07\xE4\x02\x02\u0534" +
		"\u0536\n\x02\x02\x02\u0535\u0534\x03\x02\x02\x02\u0536\u0539\x03\x02\x02" +
		"\x02\u0537\u0535\x03\x02\x02\x02\u0537\u0538\x03\x02\x02\x02\u0538\u053A" +
		"\x03\x02\x02\x02\u0539\u0537\x03\x02\x02\x02\u053A\u053B\x07\xE4\x02\x02" +
		"\u053B\u053D\x07\xCA\x02\x02\u053C\u053E\x07\xC1\x02\x02\u053D\u053C\x03" +
		"\x02\x02\x02\u053D\u053E\x03\x02\x02\x02\u053E\u0542\x03\x02\x02\x02\u053F" +
		"\u0541\x07\x04\x02\x02\u0540\u053F\x03\x02\x02\x02\u0541\u0544\x03\x02" +
		"\x02\x02\u0542\u0540\x03\x02\x02\x02\u0542\u0543\x03\x02\x02\x02\u0543" +
		"\x8D\x03\x02\x02\x02\u0544\u0542\x03\x02\x02\x02\u0545\u0547\x07\xC5\x02" +
		"\x02\u0546\u0548\x05\x90I\x02\u0547\u0546\x03\x02\x02\x02\u0547\u0548" +
		"\x03\x02\x02\x02\u0548\u0549\x03\x02\x02\x02\u0549\u054A\x07\xC6\x02\x02" +
		"\u054A\x8F\x03\x02\x02\x02\u054B\u0550\x05\x92J\x02\u054C\u054D\x07\xC7" +
		"\x02\x02\u054D\u054F\x05\x92J\x02\u054E\u054C\x03\x02\x02\x02\u054F\u0552" +
		"\x03\x02\x02\x02\u0550\u054E\x03\x02\x02\x02\u0550\u0551\x03\x02\x02\x02" +
		"\u0551\x91\x03\x02\x02\x02\u0552\u0550\x03\x02\x02\x02\u0553\u0554\x05" +
		"\x9CO\x02\u0554\u0555\x07\xD4\x02\x02\u0555\u0556\x05\x94K\x02\u0556\x93" +
		"\x03\x02\x02\x02\u0557\u0573\x05\xA0Q\x02\u0558\u0573\x05\x96L\x02\u0559" +
		"\u055D\x07\xE4\x02\x02\u055A\u055C\n\x02\x02\x02\u055B\u055A\x03\x02\x02" +
		"\x02\u055C\u055F\x03\x02\x02\x02\u055D\u055B\x03\x02\x02\x02\u055D\u055E" +
		"\x03\x02\x02\x02\u055E\u0560\x03\x02\x02\x02\u055F\u055D\x03\x02\x02\x02" +
		"\u0560\u0573\x07\xE4\x02\x02\u0561\u0565\x07\xE5\x02\x02\u0562\u0564\n" +
		"\r\x02\x02\u0563\u0562\x03\x02\x02\x02\u0564\u0567\x03\x02\x02\x02\u0565" +
		"\u0563\x03\x02\x02\x02\u0565\u0566\x03\x02\x02\x02\u0566\u0568\x03\x02" +
		"\x02\x02\u0567\u0565\x03\x02\x02\x02\u0568\u0573\x07\xE5\x02\x02\u0569" +
		"\u056A\x07\xC3\x02\x02\u056A\u056B\x05\x9EP\x02\u056B\u056C\x07\xC4\x02" +
		"\x02\u056C\u0573\x03\x02\x02\x02\u056D\u056F\x07\xC5\x02\x02\u056E\u0570" +
		"\x05\x98M\x02\u056F\u056E\x03\x02\x02\x02\u056F\u0570\x03\x02\x02\x02" +
		"\u0570\u0571\x03\x02\x02\x02\u0571\u0573\x07\xC6\x02\x02\u0572\u0557\x03" +
		"\x02\x02\x02\u0572\u0558\x03\x02\x02\x02\u0572\u0559\x03\x02\x02\x02\u0572" +
		"\u0561\x03\x02\x02\x02\u0572\u0569\x03\x02\x02\x02\u0572\u056D\x03\x02" +
		"\x02\x02\u0573\x95\x03\x02\x02\x02\u0574\u0575\t\x0E\x02\x02\u0575\x97" +
		"\x03\x02\x02\x02\u0576\u057B\x05\x9AN\x02\u0577\u0578\x07\xC7\x02\x02" +
		"\u0578\u057A\x05\x9AN\x02\u0579\u0577\x03\x02\x02\x02\u057A\u057D\x03" +
		"\x02\x02\x02\u057B\u0579\x03\x02\x02\x02\u057B\u057C\x03\x02\x02\x02\u057C" +
		"\x99\x03\x02\x02\x02\u057D\u057B\x03\x02\x02\x02\u057E\u0581\x07\xC0\x02" +
		"\x02\u057F\u0581\x05\x9CO\x02\u0580\u057E\x03\x02\x02\x02\u0580\u057F" +
		"\x03\x02\x02\x02\u0581\u0582\x03\x02\x02\x02\u0582\u0583\x07\xD4\x02\x02" +
		"\u0583\u0584\x05\x94K\x02\u0584\x9B\x03\x02\x02\x02\u0585\u0586\t\x0F" +
		"\x02\x02\u0586\x9D\x03\x02\x02\x02\u0587\u058C\x05\xA0Q\x02\u0588\u0589" +
		"\x07\xC7\x02\x02\u0589\u058B\x05\xA0Q\x02\u058A\u0588\x03\x02\x02\x02" +
		"\u058B\u058E\x03\x02\x02\x02\u058C\u058A\x03\x02\x02\x02\u058C\u058D\x03" +
		"\x02\x02\x02\u058D\x9F\x03\x02\x02\x02\u058E\u058C\x03\x02\x02\x02\u058F" +
		"\u0590\x05\xA2R\x02\u0590\xA1\x03\x02\x02\x02\u0591\u0592\x05\xA4S\x02" +
		"\u0592\xA3\x03\x02\x02\x02\u0593\u0598\x05\xA6T\x02\u0594\u0595\x07\xD9" +
		"\x02\x02\u0595\u0597\x05\xA6T\x02\u0596\u0594\x03\x02\x02\x02\u0597\u059A" +
		"\x03\x02\x02\x02\u0598\u0596\x03\x02\x02\x02\u0598\u0599\x03\x02\x02\x02" +
		"\u0599\xA5\x03\x02\x02\x02\u059A\u0598\x03\x02\x02\x02\u059B\u05A0\x05" +
		"\xA8U\x02\u059C\u059D\x07\xD8\x02\x02\u059D\u059F\x05\xA8U\x02\u059E\u059C" +
		"\x03\x02\x02\x02\u059F\u05A2\x03\x02\x02\x02\u05A0\u059E\x03\x02\x02\x02" +
		"\u05A0\u05A1\x03\x02\x02\x02\u05A1\xA7\x03\x02\x02\x02\u05A2\u05A0\x03" +
		"\x02\x02\x02\u05A3\u05A8\x05\xAAV\x02\u05A4\u05A5\t\x10\x02\x02\u05A5" +
		"\u05A7\x05\xAAV\x02\u05A6\u05A4\x03\x02\x02\x02\u05A7\u05AA\x03\x02\x02" +
		"\x02\u05A8\u05A6\x03\x02\x02\x02\u05A8\u05A9\x03\x02\x02\x02\u05A9\xA9" +
		"\x03\x02\x02\x02\u05AA\u05A8\x03\x02\x02\x02\u05AB\u05AC\x05\xACW\x02" +
		"\u05AC\xAB\x03\x02\x02\x02\u05AD\u05B2\x05\xAEX\x02\u05AE\u05AF\t\x11" +
		"\x02\x02\u05AF\u05B1\x05\xAEX\x02\u05B0\u05AE\x03\x02\x02\x02\u05B1\u05B4" +
		"\x03\x02\x02\x02\u05B2\u05B0\x03\x02\x02\x02\u05B2\u05B3\x03\x02\x02\x02" +
		"\u05B3\xAD\x03\x02\x02\x02\u05B4\u05B2\x03\x02\x02\x02\u05B5\u05BA\x05" +
		"\xB0Y\x02\u05B6\u05B7\t\x12\x02\x02\u05B7\u05B9\x05\xB0Y\x02\u05B8\u05B6" +
		"\x03\x02\x02\x02\u05B9\u05BC\x03\x02\x02\x02\u05BA\u05B8\x03\x02\x02\x02" +
		"\u05BA\u05BB\x03\x02\x02\x02\u05BB\xAF\x03\x02\x02\x02\u05BC\u05BA\x03" +
		"\x02\x02\x02\u05BD\u05C2\x05\xB2Z\x02\u05BE\u05BF\x07\xDE\x02\x02\u05BF" +
		"\u05C1\x05\xB2Z\x02\u05C0\u05BE\x03\x02\x02\x02\u05C1\u05C4\x03\x02\x02" +
		"\x02\u05C2\u05C0\x03\x02\x02\x02\u05C2\u05C3\x03\x02\x02\x02\u05C3\xB1" +
		"\x03\x02\x02\x02\u05C4\u05C2\x03\x02\x02\x02\u05C5\u05C7\t\x13\x02\x02" +
		"\u05C6\u05C5\x03\x02\x02\x02\u05C6\u05C7\x03\x02\x02\x02\u05C7\u05C8\x03" +
		"\x02\x02\x02\u05C8\u05C9\x05\xB4[\x02\u05C9\xB3\x03\x02\x02\x02\u05CA" +
		"\u05CB\x07\xC9\x02\x02\u05CB\u05CC\x05\xA0Q\x02\u05CC\u05CD\x07\xCA\x02" +
		"\x02\u05CD\u05D3\x03\x02\x02\x02\u05CE\u05D3\x05\xB6\\\x02\u05CF\u05D3" +
		"\x05\xB8]\x02\u05D0\u05D3\x05\xBA^\x02\u05D1\u05D3\x05\x9CO\x02\u05D2" +
		"\u05CA\x03\x02\x02\x02\u05D2\u05CE\x03\x02\x02\x02\u05D2\u05CF\x03\x02" +
		"\x02\x02\u05D2\u05D0\x03\x02\x02\x02\u05D2\u05D1\x03\x02\x02\x02\u05D3" +
		"\xB5\x03\x02\x02\x02\u05D4\u05D5\t\x14\x02\x02\u05D5\u05D7\x07\xC9\x02" +
		"\x02\u05D6\u05D8\x05\x9EP\x02\u05D7\u05D6\x03\x02\x02\x02\u05D7\u05D8" +
		"\x03\x02\x02\x02\u05D8\u05D9\x03\x02\x02\x02\u05D9\u05DA\x07\xCA\x02\x02" +
		"\u05DA\xB7\x03\x02\x02\x02\u05DB\u05DC\x07\xC0\x02\x02\u05DC\u05DE\x07" +
		"\xC9\x02\x02\u05DD\u05DF\x05\x9EP\x02\u05DE\u05DD\x03\x02\x02\x02\u05DE" +
		"\u05DF\x03\x02\x02\x02\u05DF\u05E0\x03\x02\x02\x02\u05E0\u05E1\x07\xCA" +
		"\x02\x02\u05E1\xB9\x03\x02\x02\x02\u05E2\u05E3\t\x15\x02\x02\u05E3\xBB" +
		"\x03\x02\x02\x02\xDC\xBF\xC4\xC6\xCE\xD3\xDB\xE1\xE4\xE8\xF0\xF7\xFC\u0101" +
		"\u010A\u010F\u0117\u0120\u0129\u0132\u0138\u013D\u0142\u014B\u0150\u015F" +
		"\u0166\u016C\u0170\u0178\u017C\u0181\u0185\u0188\u018C\u0194\u019A\u019E" +
		"\u01A7\u01AF\u01B5\u01B9\u01C1\u01C4\u01C8\u01CC\u01D0\u01D4\u01D7\u01DA" +
		"\u01DE\u01E3\u01E7\u01EB\u01F1\u01F5\u0200\u0206\u0208\u020E\u0213\u0218" +
		"\u021D\u0221\u0228\u022D\u0231\u0235\u0238\u023D\u0241\u0246\u024A\u024F" +
		"\u0253\u0258\u025E\u0262\u0265\u0268\u026C\u026F\u0272\u0275\u0278\u0282" +
		"\u0287\u028B\u028F\u0295\u029C\u029E\u02A6\u02A9\u02B2\u02BB\u02C1\u02C5" +
		"\u02CD\u02D2\u02D5\u02DE\u02E3\u02E9\u02EE\u02F6\u02FC\u0300\u0309\u0311" +
		"\u0317\u031B\u0323\u032B\u0331\u0335\u033D\u0340\u0343\u0348\u034D\u0352" +
		"\u035B\u0363\u0366\u0368\u036D\u0371\u0376\u037A\u037F\u0384\u0388\u0390" +
		"\u03B5\u03BC\u03C4\u03CA\u03CE\u03D6\u03DB\u03E0\u03E3\u03E6\u03EF\u03F7" +
		"\u03FD\u0401\u0409\u040E\u0414\u041C\u0422\u0426\u042F\u0434\u043F\u0445" +
		"\u0449\u0452\u0457\u045E\u0468\u046E\u0472\u047B\u0480\u0485\u048C\u0491" +
		"\u0499\u04A1\u04A6\u04AE\u04B8\u04BD\u04C1\u04C6\u04CC\u04D0\u04D5\u04DB" +
		"\u04DF\u04E4\u04EA\u04EE\u04F3\u04FD\u04FF\u0508\u050C\u0510\u0515\u051C" +
		"\u0520\u0525\u052E\u0537\u053D\u0542\u0547\u0550\u055D\u0565\u056F\u0572" +
		"\u057B\u0580\u058C\u0598\u05A0\u05A8\u05B2\u05BA\u05C2\u05C6\u05D2\u05D7" +
		"\u05DE";
	public static readonly _serializedATN: string = Utils.join(
		[
			BNGParser._serializedATNSegment0,
			BNGParser._serializedATNSegment1,
			BNGParser._serializedATNSegment2,
		],
		"",
	);
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!BNGParser.__ATN) {
			BNGParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(BNGParser._serializedATN));
		}

		return BNGParser.__ATN;
	}

}

export class ProgContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(BNGParser.EOF, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public header_block(): Header_blockContext[];
	public header_block(i: number): Header_blockContext;
	public header_block(i?: number): Header_blockContext | Header_blockContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Header_blockContext);
		} else {
			return this.getRuleContext(i, Header_blockContext);
		}
	}
	public action_command(): Action_commandContext[];
	public action_command(i: number): Action_commandContext;
	public action_command(i?: number): Action_commandContext | Action_commandContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Action_commandContext);
		} else {
			return this.getRuleContext(i, Action_commandContext);
		}
	}
	public wrapped_actions_block(): Wrapped_actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Wrapped_actions_blockContext);
	}
	public actions_block(): Actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Actions_blockContext);
	}
	public BEGIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BEGIN, 0); }
	public MODEL(): TerminalNode[];
	public MODEL(i: number): TerminalNode;
	public MODEL(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MODEL);
		} else {
			return this.getToken(BNGParser.MODEL, i);
		}
	}
	public END(): TerminalNode | undefined { return this.tryGetToken(BNGParser.END, 0); }
	public program_block(): Program_blockContext[];
	public program_block(i: number): Program_blockContext;
	public program_block(i?: number): Program_blockContext | Program_blockContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Program_blockContext);
		} else {
			return this.getRuleContext(i, Program_blockContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_prog; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterProg) {
			listener.enterProg(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitProg) {
			listener.exitProg(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitProg) {
			return visitor.visitProg(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Header_blockContext extends ParserRuleContext {
	public version_def(): Version_defContext | undefined {
		return this.tryGetRuleContext(0, Version_defContext);
	}
	public substance_def(): Substance_defContext | undefined {
		return this.tryGetRuleContext(0, Substance_defContext);
	}
	public set_option(): Set_optionContext | undefined {
		return this.tryGetRuleContext(0, Set_optionContext);
	}
	public set_model_name(): Set_model_nameContext | undefined {
		return this.tryGetRuleContext(0, Set_model_nameContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_header_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterHeader_block) {
			listener.enterHeader_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitHeader_block) {
			listener.exitHeader_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitHeader_block) {
			return visitor.visitHeader_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Version_defContext extends ParserRuleContext {
	public VERSION(): TerminalNode { return this.getToken(BNGParser.VERSION, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public VERSION_NUMBER(): TerminalNode { return this.getToken(BNGParser.VERSION_NUMBER, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_version_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterVersion_def) {
			listener.enterVersion_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitVersion_def) {
			listener.exitVersion_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitVersion_def) {
			return visitor.visitVersion_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Substance_defContext extends ParserRuleContext {
	public SUBSTANCEUNITS(): TerminalNode { return this.getToken(BNGParser.SUBSTANCEUNITS, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_substance_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSubstance_def) {
			listener.enterSubstance_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSubstance_def) {
			listener.exitSubstance_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSubstance_def) {
			return visitor.visitSubstance_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Set_optionContext extends ParserRuleContext {
	public SET_OPTION(): TerminalNode { return this.getToken(BNGParser.SET_OPTION, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_set_option; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSet_option) {
			listener.enterSet_option(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSet_option) {
			listener.exitSet_option(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSet_option) {
			return visitor.visitSet_option(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Set_model_nameContext extends ParserRuleContext {
	public SET_MODEL_NAME(): TerminalNode { return this.getToken(BNGParser.SET_MODEL_NAME, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_set_model_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSet_model_name) {
			listener.enterSet_model_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSet_model_name) {
			listener.exitSet_model_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSet_model_name) {
			return visitor.visitSet_model_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Program_blockContext extends ParserRuleContext {
	public parameters_block(): Parameters_blockContext | undefined {
		return this.tryGetRuleContext(0, Parameters_blockContext);
	}
	public molecule_types_block(): Molecule_types_blockContext | undefined {
		return this.tryGetRuleContext(0, Molecule_types_blockContext);
	}
	public seed_species_block(): Seed_species_blockContext | undefined {
		return this.tryGetRuleContext(0, Seed_species_blockContext);
	}
	public observables_block(): Observables_blockContext | undefined {
		return this.tryGetRuleContext(0, Observables_blockContext);
	}
	public reaction_rules_block(): Reaction_rules_blockContext | undefined {
		return this.tryGetRuleContext(0, Reaction_rules_blockContext);
	}
	public functions_block(): Functions_blockContext | undefined {
		return this.tryGetRuleContext(0, Functions_blockContext);
	}
	public compartments_block(): Compartments_blockContext | undefined {
		return this.tryGetRuleContext(0, Compartments_blockContext);
	}
	public energy_patterns_block(): Energy_patterns_blockContext | undefined {
		return this.tryGetRuleContext(0, Energy_patterns_blockContext);
	}
	public population_maps_block(): Population_maps_blockContext | undefined {
		return this.tryGetRuleContext(0, Population_maps_blockContext);
	}
	public population_types_block(): Population_types_blockContext | undefined {
		return this.tryGetRuleContext(0, Population_types_blockContext);
	}
	public wrapped_actions_block(): Wrapped_actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Wrapped_actions_blockContext);
	}
	public begin_actions_block(): Begin_actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Begin_actions_blockContext);
	}
	public action_command(): Action_commandContext | undefined {
		return this.tryGetRuleContext(0, Action_commandContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_program_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterProgram_block) {
			listener.enterProgram_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitProgram_block) {
			listener.exitProgram_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitProgram_block) {
			return visitor.visitProgram_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Parameters_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public PARAMETERS(): TerminalNode[];
	public PARAMETERS(i: number): TerminalNode;
	public PARAMETERS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PARAMETERS);
		} else {
			return this.getToken(BNGParser.PARAMETERS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public parameter_def(): Parameter_defContext[];
	public parameter_def(i: number): Parameter_defContext;
	public parameter_def(i?: number): Parameter_defContext | Parameter_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Parameter_defContext);
		} else {
			return this.getRuleContext(i, Parameter_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_parameters_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterParameters_block) {
			listener.enterParameters_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitParameters_block) {
			listener.exitParameters_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitParameters_block) {
			return visitor.visitParameters_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Parameter_defContext extends ParserRuleContext {
	public param_name(): Param_nameContext[];
	public param_name(i: number): Param_nameContext;
	public param_name(i?: number): Param_nameContext | Param_nameContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Param_nameContext);
		} else {
			return this.getRuleContext(i, Param_nameContext);
		}
	}
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public BECOMES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BECOMES, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_parameter_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterParameter_def) {
			listener.enterParameter_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitParameter_def) {
			listener.exitParameter_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitParameter_def) {
			return visitor.visitParameter_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Param_nameContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public arg_name(): Arg_nameContext | undefined {
		return this.tryGetRuleContext(0, Arg_nameContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_param_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterParam_name) {
			listener.enterParam_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitParam_name) {
			listener.exitParam_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitParam_name) {
			return visitor.visitParam_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_types_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public MOLECULE(): TerminalNode[];
	public MOLECULE(i: number): TerminalNode;
	public MOLECULE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MOLECULE);
		} else {
			return this.getToken(BNGParser.MOLECULE, i);
		}
	}
	public TYPES(): TerminalNode[];
	public TYPES(i: number): TerminalNode;
	public TYPES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.TYPES);
		} else {
			return this.getToken(BNGParser.TYPES, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public molecule_type_def(): Molecule_type_defContext[];
	public molecule_type_def(i: number): Molecule_type_defContext;
	public molecule_type_def(i?: number): Molecule_type_defContext | Molecule_type_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Molecule_type_defContext);
		} else {
			return this.getRuleContext(i, Molecule_type_defContext);
		}
	}
	public MOLECULE_TYPES(): TerminalNode[];
	public MOLECULE_TYPES(i: number): TerminalNode;
	public MOLECULE_TYPES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MOLECULE_TYPES);
		} else {
			return this.getToken(BNGParser.MOLECULE_TYPES, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_types_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_types_block) {
			listener.enterMolecule_types_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_types_block) {
			listener.exitMolecule_types_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_types_block) {
			return visitor.visitMolecule_types_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_type_defContext extends ParserRuleContext {
	public molecule_def(): Molecule_defContext {
		return this.getRuleContext(0, Molecule_defContext);
	}
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public POPULATION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.POPULATION, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_type_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_type_def) {
			listener.enterMolecule_type_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_type_def) {
			listener.exitMolecule_type_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_type_def) {
			return visitor.visitMolecule_type_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_defContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public keyword_as_mol_name(): Keyword_as_mol_nameContext | undefined {
		return this.tryGetRuleContext(0, Keyword_as_mol_nameContext);
	}
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public molecule_attributes(): Molecule_attributesContext | undefined {
		return this.tryGetRuleContext(0, Molecule_attributesContext);
	}
	public component_def_list(): Component_def_listContext | undefined {
		return this.tryGetRuleContext(0, Component_def_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_def) {
			listener.enterMolecule_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_def) {
			listener.exitMolecule_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_def) {
			return visitor.visitMolecule_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_attributesContext extends ParserRuleContext {
	public LBRACKET(): TerminalNode { return this.getToken(BNGParser.LBRACKET, 0); }
	public RBRACKET(): TerminalNode { return this.getToken(BNGParser.RBRACKET, 0); }
	public action_arg_list(): Action_arg_listContext | undefined {
		return this.tryGetRuleContext(0, Action_arg_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_attributes; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_attributes) {
			listener.enterMolecule_attributes(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_attributes) {
			listener.exitMolecule_attributes(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_attributes) {
			return visitor.visitMolecule_attributes(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_def_listContext extends ParserRuleContext {
	public component_def(): Component_defContext[];
	public component_def(i: number): Component_defContext;
	public component_def(i?: number): Component_defContext | Component_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Component_defContext);
		} else {
			return this.getRuleContext(i, Component_defContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_def_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterComponent_def_list) {
			listener.enterComponent_def_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitComponent_def_list) {
			listener.exitComponent_def_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_def_list) {
			return visitor.visitComponent_def_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_defContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public keyword_as_component_name(): Keyword_as_component_nameContext | undefined {
		return this.tryGetRuleContext(0, Keyword_as_component_nameContext);
	}
	public TILDE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TILDE, 0); }
	public state_list(): State_listContext | undefined {
		return this.tryGetRuleContext(0, State_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterComponent_def) {
			listener.enterComponent_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitComponent_def) {
			listener.exitComponent_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_def) {
			return visitor.visitComponent_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Keyword_as_component_nameContext extends ParserRuleContext {
	public SIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIN, 0); }
	public COS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COS, 0); }
	public TAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TAN, 0); }
	public ASIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ASIN, 0); }
	public ACOS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ACOS, 0); }
	public ATAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATAN, 0); }
	public SINH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SINH, 0); }
	public COSH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COSH, 0); }
	public TANH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TANH, 0); }
	public ASINH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ASINH, 0); }
	public ACOSH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ACOSH, 0); }
	public ATANH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATANH, 0); }
	public EXP(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXP, 0); }
	public LN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LN, 0); }
	public LOG10(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LOG10, 0); }
	public LOG2(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LOG2, 0); }
	public SQRT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SQRT, 0); }
	public ABS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ABS, 0); }
	public MIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MIN, 0); }
	public MAX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX, 0); }
	public SUM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SUM, 0); }
	public AVG(): TerminalNode | undefined { return this.tryGetToken(BNGParser.AVG, 0); }
	public IF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.IF, 0); }
	public TIME(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TIME, 0); }
	public SAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAT, 0); }
	public MM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MM, 0); }
	public HILL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.HILL, 0); }
	public ARRHENIUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ARRHENIUS, 0); }
	public MRATIO(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MRATIO, 0); }
	public TFUN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TFUN, 0); }
	public FUNCTIONPRODUCT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FUNCTIONPRODUCT, 0); }
	public TYPE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TYPE, 0); }
	public METHOD(): TerminalNode | undefined { return this.tryGetToken(BNGParser.METHOD, 0); }
	public PARAMETER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PARAMETER, 0); }
	public FILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FILE, 0); }
	public FORMAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FORMAT, 0); }
	public PREFIX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PREFIX, 0); }
	public SUFFIX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SUFFIX, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_keyword_as_component_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterKeyword_as_component_name) {
			listener.enterKeyword_as_component_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitKeyword_as_component_name) {
			listener.exitKeyword_as_component_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitKeyword_as_component_name) {
			return visitor.visitKeyword_as_component_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Keyword_as_mol_nameContext extends ParserRuleContext {
	public SPECIES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SPECIES, 0); }
	public MOLECULE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MOLECULE, 0); }
	public MOLECULES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MOLECULES, 0); }
	public REACTION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.REACTION, 0); }
	public REACTIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.REACTIONS, 0); }
	public RULES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RULES, 0); }
	public PARAMETERS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PARAMETERS, 0); }
	public OBSERVABLES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.OBSERVABLES, 0); }
	public FUNCTIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FUNCTIONS, 0); }
	public COMPARTMENTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COMPARTMENTS, 0); }
	public ENERGY(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ENERGY, 0); }
	public PATTERNS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PATTERNS, 0); }
	public MODEL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MODEL, 0); }
	public SEED(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEED, 0); }
	public GROUPS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GROUPS, 0); }
	public POPULATION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.POPULATION, 0); }
	public COUNTER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COUNTER, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_keyword_as_mol_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterKeyword_as_mol_name) {
			listener.enterKeyword_as_mol_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitKeyword_as_mol_name) {
			listener.exitKeyword_as_mol_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitKeyword_as_mol_name) {
			return visitor.visitKeyword_as_mol_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class State_listContext extends ParserRuleContext {
	public state_name(): State_nameContext[];
	public state_name(i: number): State_nameContext;
	public state_name(i?: number): State_nameContext | State_nameContext[] {
		if (i === undefined) {
			return this.getRuleContexts(State_nameContext);
		} else {
			return this.getRuleContext(i, State_nameContext);
		}
	}
	public TILDE(): TerminalNode[];
	public TILDE(i: number): TerminalNode;
	public TILDE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.TILDE);
		} else {
			return this.getToken(BNGParser.TILDE, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_state_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterState_list) {
			listener.enterState_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitState_list) {
			listener.exitState_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitState_list) {
			return visitor.visitState_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class State_nameContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_state_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterState_name) {
			listener.enterState_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitState_name) {
			listener.exitState_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitState_name) {
			return visitor.visitState_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Seed_species_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public SEED(): TerminalNode[];
	public SEED(i: number): TerminalNode;
	public SEED(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.SEED);
		} else {
			return this.getToken(BNGParser.SEED, i);
		}
	}
	public SPECIES(): TerminalNode[];
	public SPECIES(i: number): TerminalNode;
	public SPECIES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.SPECIES);
		} else {
			return this.getToken(BNGParser.SPECIES, i);
		}
	}
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public seed_species_def(): Seed_species_defContext[];
	public seed_species_def(i: number): Seed_species_defContext;
	public seed_species_def(i?: number): Seed_species_defContext | Seed_species_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Seed_species_defContext);
		} else {
			return this.getRuleContext(i, Seed_species_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_seed_species_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSeed_species_block) {
			listener.enterSeed_species_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSeed_species_block) {
			listener.exitSeed_species_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSeed_species_block) {
			return visitor.visitSeed_species_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Seed_species_defContext extends ParserRuleContext {
	public species_def(): Species_defContext {
		return this.getRuleContext(0, Species_defContext);
	}
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public COLON(): TerminalNode[];
	public COLON(i: number): TerminalNode;
	public COLON(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COLON);
		} else {
			return this.getToken(BNGParser.COLON, i);
		}
	}
	public DOLLAR(): TerminalNode | undefined { return this.tryGetToken(BNGParser.DOLLAR, 0); }
	public AT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.AT, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_seed_species_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSeed_species_def) {
			listener.enterSeed_species_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSeed_species_def) {
			listener.exitSeed_species_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSeed_species_def) {
			return visitor.visitSeed_species_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Species_defContext extends ParserRuleContext {
	public molecule_pattern(): Molecule_patternContext[];
	public molecule_pattern(i: number): Molecule_patternContext;
	public molecule_pattern(i?: number): Molecule_patternContext | Molecule_patternContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Molecule_patternContext);
		} else {
			return this.getRuleContext(i, Molecule_patternContext);
		}
	}
	public AT(): TerminalNode[];
	public AT(i: number): TerminalNode;
	public AT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.AT);
		} else {
			return this.getToken(BNGParser.AT, i);
		}
	}
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public molecule_compartment(): Molecule_compartmentContext[];
	public molecule_compartment(i: number): Molecule_compartmentContext;
	public molecule_compartment(i?: number): Molecule_compartmentContext | Molecule_compartmentContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Molecule_compartmentContext);
		} else {
			return this.getRuleContext(i, Molecule_compartmentContext);
		}
	}
	public DOT(): TerminalNode[];
	public DOT(i: number): TerminalNode;
	public DOT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DOT);
		} else {
			return this.getToken(BNGParser.DOT, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_species_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSpecies_def) {
			listener.enterSpecies_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSpecies_def) {
			listener.exitSpecies_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSpecies_def) {
			return visitor.visitSpecies_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_compartmentContext extends ParserRuleContext {
	public AT(): TerminalNode { return this.getToken(BNGParser.AT, 0); }
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_compartment; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_compartment) {
			listener.enterMolecule_compartment(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_compartment) {
			listener.exitMolecule_compartment(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_compartment) {
			return visitor.visitMolecule_compartment(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_patternContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public keyword_as_mol_name(): Keyword_as_mol_nameContext | undefined {
		return this.tryGetRuleContext(0, Keyword_as_mol_nameContext);
	}
	public scope_prefix(): Scope_prefixContext | undefined {
		return this.tryGetRuleContext(0, Scope_prefixContext);
	}
	public molecule_compartment(): Molecule_compartmentContext | undefined {
		return this.tryGetRuleContext(0, Molecule_compartmentContext);
	}
	public molecule_tag(): Molecule_tagContext[];
	public molecule_tag(i: number): Molecule_tagContext;
	public molecule_tag(i?: number): Molecule_tagContext | Molecule_tagContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Molecule_tagContext);
		} else {
			return this.getRuleContext(i, Molecule_tagContext);
		}
	}
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public pattern_bond_wildcard(): Pattern_bond_wildcardContext | undefined {
		return this.tryGetRuleContext(0, Pattern_bond_wildcardContext);
	}
	public molecule_attributes(): Molecule_attributesContext | undefined {
		return this.tryGetRuleContext(0, Molecule_attributesContext);
	}
	public component_pattern_list(): Component_pattern_listContext | undefined {
		return this.tryGetRuleContext(0, Component_pattern_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_pattern; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_pattern) {
			listener.enterMolecule_pattern(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_pattern) {
			listener.exitMolecule_pattern(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_pattern) {
			return visitor.visitMolecule_pattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Scope_prefixContext extends ParserRuleContext {
	public MOLECULE_TAG_TOKEN(): TerminalNode { return this.getToken(BNGParser.MOLECULE_TAG_TOKEN, 0); }
	public COLON(): TerminalNode[];
	public COLON(i: number): TerminalNode;
	public COLON(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COLON);
		} else {
			return this.getToken(BNGParser.COLON, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_scope_prefix; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterScope_prefix) {
			listener.enterScope_prefix(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitScope_prefix) {
			listener.exitScope_prefix(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitScope_prefix) {
			return visitor.visitScope_prefix(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Pattern_bond_wildcardContext extends ParserRuleContext {
	public EMARK(): TerminalNode { return this.getToken(BNGParser.EMARK, 0); }
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLUS, 0); }
	public QMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QMARK, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_pattern_bond_wildcard; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPattern_bond_wildcard) {
			listener.enterPattern_bond_wildcard(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPattern_bond_wildcard) {
			listener.exitPattern_bond_wildcard(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPattern_bond_wildcard) {
			return visitor.visitPattern_bond_wildcard(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_tagContext extends ParserRuleContext {
	public MOLECULE_TAG_TOKEN(): TerminalNode { return this.getToken(BNGParser.MOLECULE_TAG_TOKEN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_tag; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMolecule_tag) {
			listener.enterMolecule_tag(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMolecule_tag) {
			listener.exitMolecule_tag(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_tag) {
			return visitor.visitMolecule_tag(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_pattern_listContext extends ParserRuleContext {
	public component_pattern(): Component_patternContext[];
	public component_pattern(i: number): Component_patternContext;
	public component_pattern(i?: number): Component_patternContext | Component_patternContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Component_patternContext);
		} else {
			return this.getRuleContext(i, Component_patternContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_pattern_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterComponent_pattern_list) {
			listener.enterComponent_pattern_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitComponent_pattern_list) {
			listener.exitComponent_pattern_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_pattern_list) {
			return visitor.visitComponent_pattern_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_patternContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public keyword_as_component_name(): Keyword_as_component_nameContext | undefined {
		return this.tryGetRuleContext(0, Keyword_as_component_nameContext);
	}
	public bond_spec(): Bond_specContext[];
	public bond_spec(i: number): Bond_specContext;
	public bond_spec(i?: number): Bond_specContext | Bond_specContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Bond_specContext);
		} else {
			return this.getRuleContext(i, Bond_specContext);
		}
	}
	public component_label(): Component_labelContext[];
	public component_label(i: number): Component_labelContext;
	public component_label(i?: number): Component_labelContext | Component_labelContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Component_labelContext);
		} else {
			return this.getRuleContext(i, Component_labelContext);
		}
	}
	public DOT(): TerminalNode[];
	public DOT(i: number): TerminalNode;
	public DOT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DOT);
		} else {
			return this.getToken(BNGParser.DOT, i);
		}
	}
	public TILDE(): TerminalNode[];
	public TILDE(i: number): TerminalNode;
	public TILDE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.TILDE);
		} else {
			return this.getToken(BNGParser.TILDE, i);
		}
	}
	public state_value(): State_valueContext[];
	public state_value(i: number): State_valueContext;
	public state_value(i?: number): State_valueContext | State_valueContext[] {
		if (i === undefined) {
			return this.getRuleContexts(State_valueContext);
		} else {
			return this.getRuleContext(i, State_valueContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_pattern; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterComponent_pattern) {
			listener.enterComponent_pattern(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitComponent_pattern) {
			listener.exitComponent_pattern(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_pattern) {
			return visitor.visitComponent_pattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_labelContext extends ParserRuleContext {
	public MOLECULE_TAG_TOKEN(): TerminalNode { return this.getToken(BNGParser.MOLECULE_TAG_TOKEN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_label; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterComponent_label) {
			listener.enterComponent_label(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitComponent_label) {
			listener.exitComponent_label(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_label) {
			return visitor.visitComponent_label(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class State_valueContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public QMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QMARK, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_state_value; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterState_value) {
			listener.enterState_value(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitState_value) {
			listener.exitState_value(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitState_value) {
			return visitor.visitState_value(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Bond_specContext extends ParserRuleContext {
	public DOT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.DOT, 0); }
	public EMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EMARK, 0); }
	public bond_id(): Bond_idContext | undefined {
		return this.tryGetRuleContext(0, Bond_idContext);
	}
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLUS, 0); }
	public QMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QMARK, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_bond_spec; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterBond_spec) {
			listener.enterBond_spec(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitBond_spec) {
			listener.exitBond_spec(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitBond_spec) {
			return visitor.visitBond_spec(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Bond_idContext extends ParserRuleContext {
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_bond_id; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterBond_id) {
			listener.enterBond_id(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitBond_id) {
			listener.exitBond_id(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitBond_id) {
			return visitor.visitBond_id(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observables_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public OBSERVABLES(): TerminalNode[];
	public OBSERVABLES(i: number): TerminalNode;
	public OBSERVABLES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.OBSERVABLES);
		} else {
			return this.getToken(BNGParser.OBSERVABLES, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public observable_def(): Observable_defContext[];
	public observable_def(i: number): Observable_defContext;
	public observable_def(i?: number): Observable_defContext | Observable_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Observable_defContext);
		} else {
			return this.getRuleContext(i, Observable_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observables_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservables_block) {
			listener.enterObservables_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservables_block) {
			listener.exitObservables_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservables_block) {
			return visitor.visitObservables_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observable_defContext extends ParserRuleContext {
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public observable_pattern_list(): Observable_pattern_listContext {
		return this.getRuleContext(0, Observable_pattern_listContext);
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public observable_type(): Observable_typeContext | undefined {
		return this.tryGetRuleContext(0, Observable_typeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservable_def) {
			listener.enterObservable_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservable_def) {
			listener.exitObservable_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservable_def) {
			return visitor.visitObservable_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observable_typeContext extends ParserRuleContext {
	public MOLECULES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MOLECULES, 0); }
	public SPECIES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SPECIES, 0); }
	public COUNTER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COUNTER, 0); }
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_type; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservable_type) {
			listener.enterObservable_type(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservable_type) {
			listener.exitObservable_type(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservable_type) {
			return visitor.visitObservable_type(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observable_pattern_listContext extends ParserRuleContext {
	public observable_pattern(): Observable_patternContext[];
	public observable_pattern(i: number): Observable_patternContext;
	public observable_pattern(i?: number): Observable_patternContext | Observable_patternContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Observable_patternContext);
		} else {
			return this.getRuleContext(i, Observable_patternContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_pattern_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservable_pattern_list) {
			listener.enterObservable_pattern_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservable_pattern_list) {
			listener.exitObservable_pattern_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservable_pattern_list) {
			return visitor.visitObservable_pattern_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observable_patternContext extends ParserRuleContext {
	public species_def(): Species_defContext | undefined {
		return this.tryGetRuleContext(0, Species_defContext);
	}
	public GT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GT, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public EQUALS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EQUALS, 0); }
	public GTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GTE, 0); }
	public LT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LT, 0); }
	public LTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LTE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_pattern; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservable_pattern) {
			listener.enterObservable_pattern(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservable_pattern) {
			listener.exitObservable_pattern(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservable_pattern) {
			return visitor.visitObservable_pattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Reaction_rules_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public REACTION(): TerminalNode[];
	public REACTION(i: number): TerminalNode;
	public REACTION(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.REACTION);
		} else {
			return this.getToken(BNGParser.REACTION, i);
		}
	}
	public RULES(): TerminalNode[];
	public RULES(i: number): TerminalNode;
	public RULES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.RULES);
		} else {
			return this.getToken(BNGParser.RULES, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public reaction_rule_def(): Reaction_rule_defContext[];
	public reaction_rule_def(i: number): Reaction_rule_defContext;
	public reaction_rule_def(i?: number): Reaction_rule_defContext | Reaction_rule_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Reaction_rule_defContext);
		} else {
			return this.getRuleContext(i, Reaction_rule_defContext);
		}
	}
	public REACTION_RULES(): TerminalNode[];
	public REACTION_RULES(i: number): TerminalNode;
	public REACTION_RULES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.REACTION_RULES);
		} else {
			return this.getToken(BNGParser.REACTION_RULES, i);
		}
	}
	public REACTIONS(): TerminalNode[];
	public REACTIONS(i: number): TerminalNode;
	public REACTIONS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.REACTIONS);
		} else {
			return this.getToken(BNGParser.REACTIONS, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reaction_rules_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterReaction_rules_block) {
			listener.enterReaction_rules_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitReaction_rules_block) {
			listener.exitReaction_rules_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitReaction_rules_block) {
			return visitor.visitReaction_rules_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Reaction_rule_defContext extends ParserRuleContext {
	public reactant_patterns(): Reactant_patternsContext {
		return this.getRuleContext(0, Reactant_patternsContext);
	}
	public reaction_sign(): Reaction_signContext {
		return this.getRuleContext(0, Reaction_signContext);
	}
	public product_patterns(): Product_patternsContext {
		return this.getRuleContext(0, Product_patternsContext);
	}
	public rate_law(): Rate_lawContext {
		return this.getRuleContext(0, Rate_lawContext);
	}
	public label_def(): Label_defContext | undefined {
		return this.tryGetRuleContext(0, Label_defContext);
	}
	public LBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LBRACKET, 0); }
	public rule_modifiers(): Rule_modifiersContext[];
	public rule_modifiers(i: number): Rule_modifiersContext;
	public rule_modifiers(i?: number): Rule_modifiersContext | Rule_modifiersContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Rule_modifiersContext);
		} else {
			return this.getRuleContext(i, Rule_modifiersContext);
		}
	}
	public RBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RBRACKET, 0); }
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reaction_rule_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterReaction_rule_def) {
			listener.enterReaction_rule_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitReaction_rule_def) {
			listener.exitReaction_rule_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitReaction_rule_def) {
			return visitor.visitReaction_rule_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Label_defContext extends ParserRuleContext {
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public INT(): TerminalNode[];
	public INT(i: number): TerminalNode;
	public INT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.INT);
		} else {
			return this.getToken(BNGParser.INT, i);
		}
	}
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public LPAREN(): TerminalNode[];
	public LPAREN(i: number): TerminalNode;
	public LPAREN(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LPAREN);
		} else {
			return this.getToken(BNGParser.LPAREN, i);
		}
	}
	public RPAREN(): TerminalNode[];
	public RPAREN(i: number): TerminalNode;
	public RPAREN(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.RPAREN);
		} else {
			return this.getToken(BNGParser.RPAREN, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_label_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterLabel_def) {
			listener.enterLabel_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitLabel_def) {
			listener.exitLabel_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitLabel_def) {
			return visitor.visitLabel_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Reactant_patternsContext extends ParserRuleContext {
	public species_def(): Species_defContext[];
	public species_def(i: number): Species_defContext;
	public species_def(i?: number): Species_defContext | Species_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Species_defContext);
		} else {
			return this.getRuleContext(i, Species_defContext);
		}
	}
	public INT(): TerminalNode[];
	public INT(i: number): TerminalNode;
	public INT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.INT);
		} else {
			return this.getToken(BNGParser.INT, i);
		}
	}
	public PLUS(): TerminalNode[];
	public PLUS(i: number): TerminalNode;
	public PLUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PLUS);
		} else {
			return this.getToken(BNGParser.PLUS, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reactant_patterns; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterReactant_patterns) {
			listener.enterReactant_patterns(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitReactant_patterns) {
			listener.exitReactant_patterns(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitReactant_patterns) {
			return visitor.visitReactant_patterns(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Product_patternsContext extends ParserRuleContext {
	public species_def(): Species_defContext[];
	public species_def(i: number): Species_defContext;
	public species_def(i?: number): Species_defContext | Species_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Species_defContext);
		} else {
			return this.getRuleContext(i, Species_defContext);
		}
	}
	public INT(): TerminalNode[];
	public INT(i: number): TerminalNode;
	public INT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.INT);
		} else {
			return this.getToken(BNGParser.INT, i);
		}
	}
	public PLUS(): TerminalNode[];
	public PLUS(i: number): TerminalNode;
	public PLUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PLUS);
		} else {
			return this.getToken(BNGParser.PLUS, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_product_patterns; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterProduct_patterns) {
			listener.enterProduct_patterns(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitProduct_patterns) {
			listener.exitProduct_patterns(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitProduct_patterns) {
			return visitor.visitProduct_patterns(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Reaction_signContext extends ParserRuleContext {
	public UNI_REACTION_SIGN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.UNI_REACTION_SIGN, 0); }
	public BI_REACTION_SIGN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BI_REACTION_SIGN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reaction_sign; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterReaction_sign) {
			listener.enterReaction_sign(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitReaction_sign) {
			listener.exitReaction_sign(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitReaction_sign) {
			return visitor.visitReaction_sign(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Rate_lawContext extends ParserRuleContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COMMA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COMMA, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_rate_law; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterRate_law) {
			listener.enterRate_law(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitRate_law) {
			listener.exitRate_law(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitRate_law) {
			return visitor.visitRate_law(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Rule_modifiersContext extends ParserRuleContext {
	public DELETEMOLECULES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.DELETEMOLECULES, 0); }
	public MOVECONNECTED(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MOVECONNECTED, 0); }
	public MATCHONCE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MATCHONCE, 0); }
	public TOTALRATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TOTALRATE, 0); }
	public PRIORITY(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRIORITY, 0); }
	public BECOMES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BECOMES, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public INCLUDE_REACTANTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INCLUDE_REACTANTS, 0); }
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public COMMA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COMMA, 0); }
	public pattern_list(): Pattern_listContext | undefined {
		return this.tryGetRuleContext(0, Pattern_listContext);
	}
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public EXCLUDE_REACTANTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXCLUDE_REACTANTS, 0); }
	public INCLUDE_PRODUCTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INCLUDE_PRODUCTS, 0); }
	public EXCLUDE_PRODUCTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXCLUDE_PRODUCTS, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_rule_modifiers; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterRule_modifiers) {
			listener.enterRule_modifiers(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitRule_modifiers) {
			listener.exitRule_modifiers(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitRule_modifiers) {
			return visitor.visitRule_modifiers(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Pattern_listContext extends ParserRuleContext {
	public species_def(): Species_defContext[];
	public species_def(i: number): Species_defContext;
	public species_def(i?: number): Species_defContext | Species_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Species_defContext);
		} else {
			return this.getRuleContext(i, Species_defContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_pattern_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPattern_list) {
			listener.enterPattern_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPattern_list) {
			listener.exitPattern_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPattern_list) {
			return visitor.visitPattern_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Functions_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public FUNCTIONS(): TerminalNode[];
	public FUNCTIONS(i: number): TerminalNode;
	public FUNCTIONS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.FUNCTIONS);
		} else {
			return this.getToken(BNGParser.FUNCTIONS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public function_def(): Function_defContext[];
	public function_def(i: number): Function_defContext;
	public function_def(i?: number): Function_defContext | Function_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Function_defContext);
		} else {
			return this.getRuleContext(i, Function_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_functions_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterFunctions_block) {
			listener.enterFunctions_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitFunctions_block) {
			listener.exitFunctions_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitFunctions_block) {
			return visitor.visitFunctions_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Function_defContext extends ParserRuleContext {
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public BECOMES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BECOMES, 0); }
	public param_list(): Param_listContext | undefined {
		return this.tryGetRuleContext(0, Param_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_function_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterFunction_def) {
			listener.enterFunction_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitFunction_def) {
			listener.exitFunction_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitFunction_def) {
			return visitor.visitFunction_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Param_listContext extends ParserRuleContext {
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_param_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterParam_list) {
			listener.enterParam_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitParam_list) {
			listener.exitParam_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitParam_list) {
			return visitor.visitParam_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Compartments_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public COMPARTMENTS(): TerminalNode[];
	public COMPARTMENTS(i: number): TerminalNode;
	public COMPARTMENTS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMPARTMENTS);
		} else {
			return this.getToken(BNGParser.COMPARTMENTS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public compartment_def(): Compartment_defContext[];
	public compartment_def(i: number): Compartment_defContext;
	public compartment_def(i?: number): Compartment_defContext | Compartment_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Compartment_defContext);
		} else {
			return this.getRuleContext(i, Compartment_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_compartments_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterCompartments_block) {
			listener.enterCompartments_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitCompartments_block) {
			listener.exitCompartments_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitCompartments_block) {
			return visitor.visitCompartments_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Compartment_defContext extends ParserRuleContext {
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public INT(): TerminalNode { return this.getToken(BNGParser.INT, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_compartment_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterCompartment_def) {
			listener.enterCompartment_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitCompartment_def) {
			listener.exitCompartment_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitCompartment_def) {
			return visitor.visitCompartment_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Energy_patterns_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public ENERGY(): TerminalNode[];
	public ENERGY(i: number): TerminalNode;
	public ENERGY(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.ENERGY);
		} else {
			return this.getToken(BNGParser.ENERGY, i);
		}
	}
	public PATTERNS(): TerminalNode[];
	public PATTERNS(i: number): TerminalNode;
	public PATTERNS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PATTERNS);
		} else {
			return this.getToken(BNGParser.PATTERNS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public energy_pattern_def(): Energy_pattern_defContext[];
	public energy_pattern_def(i: number): Energy_pattern_defContext;
	public energy_pattern_def(i?: number): Energy_pattern_defContext | Energy_pattern_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Energy_pattern_defContext);
		} else {
			return this.getRuleContext(i, Energy_pattern_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_energy_patterns_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterEnergy_patterns_block) {
			listener.enterEnergy_patterns_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitEnergy_patterns_block) {
			listener.exitEnergy_patterns_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitEnergy_patterns_block) {
			return visitor.visitEnergy_patterns_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Energy_pattern_defContext extends ParserRuleContext {
	public species_def(): Species_defContext {
		return this.getRuleContext(0, Species_defContext);
	}
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_energy_pattern_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterEnergy_pattern_def) {
			listener.enterEnergy_pattern_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitEnergy_pattern_def) {
			listener.exitEnergy_pattern_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitEnergy_pattern_def) {
			return visitor.visitEnergy_pattern_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Population_maps_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public POPULATION(): TerminalNode[];
	public POPULATION(i: number): TerminalNode;
	public POPULATION(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.POPULATION);
		} else {
			return this.getToken(BNGParser.POPULATION, i);
		}
	}
	public MAPS(): TerminalNode[];
	public MAPS(i: number): TerminalNode;
	public MAPS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MAPS);
		} else {
			return this.getToken(BNGParser.MAPS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public population_map_def(): Population_map_defContext[];
	public population_map_def(i: number): Population_map_defContext;
	public population_map_def(i?: number): Population_map_defContext | Population_map_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Population_map_defContext);
		} else {
			return this.getRuleContext(i, Population_map_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_population_maps_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPopulation_maps_block) {
			listener.enterPopulation_maps_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPopulation_maps_block) {
			listener.exitPopulation_maps_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPopulation_maps_block) {
			return visitor.visitPopulation_maps_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Population_map_defContext extends ParserRuleContext {
	public species_def(): Species_defContext {
		return this.getRuleContext(0, Species_defContext);
	}
	public UNI_REACTION_SIGN(): TerminalNode { return this.getToken(BNGParser.UNI_REACTION_SIGN, 0); }
	public STRING(): TerminalNode[];
	public STRING(i: number): TerminalNode;
	public STRING(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.STRING);
		} else {
			return this.getToken(BNGParser.STRING, i);
		}
	}
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	public param_list(): Param_listContext | undefined {
		return this.tryGetRuleContext(0, Param_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_population_map_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPopulation_map_def) {
			listener.enterPopulation_map_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPopulation_map_def) {
			listener.exitPopulation_map_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPopulation_map_def) {
			return visitor.visitPopulation_map_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Population_types_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public POPULATION(): TerminalNode[];
	public POPULATION(i: number): TerminalNode;
	public POPULATION(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.POPULATION);
		} else {
			return this.getToken(BNGParser.POPULATION, i);
		}
	}
	public TYPES(): TerminalNode[];
	public TYPES(i: number): TerminalNode;
	public TYPES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.TYPES);
		} else {
			return this.getToken(BNGParser.TYPES, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public population_type_def(): Population_type_defContext[];
	public population_type_def(i: number): Population_type_defContext;
	public population_type_def(i?: number): Population_type_defContext | Population_type_defContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Population_type_defContext);
		} else {
			return this.getRuleContext(i, Population_type_defContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_population_types_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPopulation_types_block) {
			listener.enterPopulation_types_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPopulation_types_block) {
			listener.exitPopulation_types_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPopulation_types_block) {
			return visitor.visitPopulation_types_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Population_type_defContext extends ParserRuleContext {
	public molecule_def(): Molecule_defContext {
		return this.getRuleContext(0, Molecule_defContext);
	}
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_population_type_def; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPopulation_type_def) {
			listener.enterPopulation_type_def(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPopulation_type_def) {
			listener.exitPopulation_type_def(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPopulation_type_def) {
			return visitor.visitPopulation_type_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Actions_blockContext extends ParserRuleContext {
	public action_command(): Action_commandContext[];
	public action_command(i: number): Action_commandContext;
	public action_command(i?: number): Action_commandContext | Action_commandContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Action_commandContext);
		} else {
			return this.getRuleContext(i, Action_commandContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_actions_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterActions_block) {
			listener.enterActions_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitActions_block) {
			listener.exitActions_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitActions_block) {
			return visitor.visitActions_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Wrapped_actions_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public ACTIONS(): TerminalNode[];
	public ACTIONS(i: number): TerminalNode;
	public ACTIONS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.ACTIONS);
		} else {
			return this.getToken(BNGParser.ACTIONS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public action_command(): Action_commandContext[];
	public action_command(i: number): Action_commandContext;
	public action_command(i?: number): Action_commandContext | Action_commandContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Action_commandContext);
		} else {
			return this.getRuleContext(i, Action_commandContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_wrapped_actions_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterWrapped_actions_block) {
			listener.enterWrapped_actions_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitWrapped_actions_block) {
			listener.exitWrapped_actions_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitWrapped_actions_block) {
			return visitor.visitWrapped_actions_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Begin_actions_blockContext extends ParserRuleContext {
	public BEGIN(): TerminalNode { return this.getToken(BNGParser.BEGIN, 0); }
	public ACTIONS(): TerminalNode[];
	public ACTIONS(i: number): TerminalNode;
	public ACTIONS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.ACTIONS);
		} else {
			return this.getToken(BNGParser.ACTIONS, i);
		}
	}
	public END(): TerminalNode { return this.getToken(BNGParser.END, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	public action_command(): Action_commandContext[];
	public action_command(i: number): Action_commandContext;
	public action_command(i?: number): Action_commandContext | Action_commandContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Action_commandContext);
		} else {
			return this.getRuleContext(i, Action_commandContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_begin_actions_block; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterBegin_actions_block) {
			listener.enterBegin_actions_block(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitBegin_actions_block) {
			listener.exitBegin_actions_block(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitBegin_actions_block) {
			return visitor.visitBegin_actions_block(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_commandContext extends ParserRuleContext {
	public generate_network_cmd(): Generate_network_cmdContext | undefined {
		return this.tryGetRuleContext(0, Generate_network_cmdContext);
	}
	public generate_hybrid_model_cmd(): Generate_hybrid_model_cmdContext | undefined {
		return this.tryGetRuleContext(0, Generate_hybrid_model_cmdContext);
	}
	public simulate_cmd(): Simulate_cmdContext | undefined {
		return this.tryGetRuleContext(0, Simulate_cmdContext);
	}
	public write_cmd(): Write_cmdContext | undefined {
		return this.tryGetRuleContext(0, Write_cmdContext);
	}
	public set_cmd(): Set_cmdContext | undefined {
		return this.tryGetRuleContext(0, Set_cmdContext);
	}
	public other_action_cmd(): Other_action_cmdContext | undefined {
		return this.tryGetRuleContext(0, Other_action_cmdContext);
	}
	public set_option_cmd(): Set_option_cmdContext | undefined {
		return this.tryGetRuleContext(0, Set_option_cmdContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_command; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAction_command) {
			listener.enterAction_command(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAction_command) {
			listener.exitAction_command(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAction_command) {
			return visitor.visitAction_command(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Generate_network_cmdContext extends ParserRuleContext {
	public GENERATENETWORK(): TerminalNode { return this.getToken(BNGParser.GENERATENETWORK, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public action_args(): Action_argsContext | undefined {
		return this.tryGetRuleContext(0, Action_argsContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_generate_network_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterGenerate_network_cmd) {
			listener.enterGenerate_network_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitGenerate_network_cmd) {
			listener.exitGenerate_network_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitGenerate_network_cmd) {
			return visitor.visitGenerate_network_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Generate_hybrid_model_cmdContext extends ParserRuleContext {
	public GENERATEHYBRIDMODEL(): TerminalNode { return this.getToken(BNGParser.GENERATEHYBRIDMODEL, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public action_args(): Action_argsContext | undefined {
		return this.tryGetRuleContext(0, Action_argsContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_generate_hybrid_model_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterGenerate_hybrid_model_cmd) {
			listener.enterGenerate_hybrid_model_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitGenerate_hybrid_model_cmd) {
			listener.exitGenerate_hybrid_model_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitGenerate_hybrid_model_cmd) {
			return visitor.visitGenerate_hybrid_model_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Simulate_cmdContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SIMULATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE, 0); }
	public SIMULATE_ODE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_ODE, 0); }
	public SIMULATE_SSA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_SSA, 0); }
	public SIMULATE_PLA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_PLA, 0); }
	public SIMULATE_NF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_NF, 0); }
	public SIMULATE_RM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_RM, 0); }
	public SIMULATE_PSA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIMULATE_PSA, 0); }
	public action_args(): Action_argsContext | undefined {
		return this.tryGetRuleContext(0, Action_argsContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_simulate_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSimulate_cmd) {
			listener.enterSimulate_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSimulate_cmd) {
			listener.exitSimulate_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSimulate_cmd) {
			return visitor.visitSimulate_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Write_cmdContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public WRITEFILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEFILE, 0); }
	public WRITEXML(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEXML, 0); }
	public WRITESBML(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITESBML, 0); }
	public WRITENETWORK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITENETWORK, 0); }
	public WRITEMODEL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEMODEL, 0); }
	public WRITEMFILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEMFILE, 0); }
	public WRITEMEXFILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEMEXFILE, 0); }
	public WRITELATEX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITELATEX, 0); }
	public action_args(): Action_argsContext | undefined {
		return this.tryGetRuleContext(0, Action_argsContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_write_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterWrite_cmd) {
			listener.enterWrite_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitWrite_cmd) {
			listener.exitWrite_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitWrite_cmd) {
			return visitor.visitWrite_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Set_cmdContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public COMMA(): TerminalNode { return this.getToken(BNGParser.COMMA, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SETCONCENTRATION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SETCONCENTRATION, 0); }
	public ADDCONCENTRATION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ADDCONCENTRATION, 0); }
	public SETPARAMETER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SETPARAMETER, 0); }
	public species_def(): Species_defContext | undefined {
		return this.tryGetRuleContext(0, Species_defContext);
	}
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_set_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSet_cmd) {
			listener.enterSet_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSet_cmd) {
			listener.exitSet_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSet_cmd) {
			return visitor.visitSet_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Other_action_cmdContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SAVECONCENTRATIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAVECONCENTRATIONS, 0); }
	public RESETCONCENTRATIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RESETCONCENTRATIONS, 0); }
	public SAVEPARAMETERS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAVEPARAMETERS, 0); }
	public RESETPARAMETERS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RESETPARAMETERS, 0); }
	public QUIT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QUIT, 0); }
	public PARAMETER_SCAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PARAMETER_SCAN, 0); }
	public BIFURCATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BIFURCATE, 0); }
	public VISUALIZE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.VISUALIZE, 0); }
	public GENERATEHYBRIDMODEL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GENERATEHYBRIDMODEL, 0); }
	public READFILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.READFILE, 0); }
	public SETVOLUME(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SETVOLUME, 0); }
	public WRITEMDL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.WRITEMDL, 0); }
	public SET_OPTION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SET_OPTION, 0); }
	public action_args(): Action_argsContext | undefined {
		return this.tryGetRuleContext(0, Action_argsContext);
	}
	public action_arg_value(): Action_arg_valueContext | undefined {
		return this.tryGetRuleContext(0, Action_arg_valueContext);
	}
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_other_action_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterOther_action_cmd) {
			listener.enterOther_action_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitOther_action_cmd) {
			listener.exitOther_action_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitOther_action_cmd) {
			return visitor.visitOther_action_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Set_option_cmdContext extends ParserRuleContext {
	public SET_OPTION(): TerminalNode { return this.getToken(BNGParser.SET_OPTION, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public COMMA(): TerminalNode { return this.getToken(BNGParser.COMMA, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public SEMI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SEMI, 0); }
	public LB(): TerminalNode[];
	public LB(i: number): TerminalNode;
	public LB(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LB);
		} else {
			return this.getToken(BNGParser.LB, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_set_option_cmd; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterSet_option_cmd) {
			listener.enterSet_option_cmd(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitSet_option_cmd) {
			listener.exitSet_option_cmd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitSet_option_cmd) {
			return visitor.visitSet_option_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_argsContext extends ParserRuleContext {
	public LBRACKET(): TerminalNode { return this.getToken(BNGParser.LBRACKET, 0); }
	public RBRACKET(): TerminalNode { return this.getToken(BNGParser.RBRACKET, 0); }
	public action_arg_list(): Action_arg_listContext | undefined {
		return this.tryGetRuleContext(0, Action_arg_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_args; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAction_args) {
			listener.enterAction_args(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAction_args) {
			listener.exitAction_args(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAction_args) {
			return visitor.visitAction_args(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_arg_listContext extends ParserRuleContext {
	public action_arg(): Action_argContext[];
	public action_arg(i: number): Action_argContext;
	public action_arg(i?: number): Action_argContext | Action_argContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Action_argContext);
		} else {
			return this.getRuleContext(i, Action_argContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_arg_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAction_arg_list) {
			listener.enterAction_arg_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAction_arg_list) {
			listener.exitAction_arg_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAction_arg_list) {
			return visitor.visitAction_arg_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_argContext extends ParserRuleContext {
	public arg_name(): Arg_nameContext {
		return this.getRuleContext(0, Arg_nameContext);
	}
	public ASSIGNS(): TerminalNode { return this.getToken(BNGParser.ASSIGNS, 0); }
	public action_arg_value(): Action_arg_valueContext {
		return this.getRuleContext(0, Action_arg_valueContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_arg; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAction_arg) {
			listener.enterAction_arg(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAction_arg) {
			listener.exitAction_arg(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAction_arg) {
			return visitor.visitAction_arg(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_arg_valueContext extends ParserRuleContext {
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public keyword_as_value(): Keyword_as_valueContext | undefined {
		return this.tryGetRuleContext(0, Keyword_as_valueContext);
	}
	public DBQUOTES(): TerminalNode[];
	public DBQUOTES(i: number): TerminalNode;
	public DBQUOTES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DBQUOTES);
		} else {
			return this.getToken(BNGParser.DBQUOTES, i);
		}
	}
	public SQUOTE(): TerminalNode[];
	public SQUOTE(i: number): TerminalNode;
	public SQUOTE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.SQUOTE);
		} else {
			return this.getToken(BNGParser.SQUOTE, i);
		}
	}
	public LSBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LSBRACKET, 0); }
	public expression_list(): Expression_listContext | undefined {
		return this.tryGetRuleContext(0, Expression_listContext);
	}
	public RSBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RSBRACKET, 0); }
	public LBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LBRACKET, 0); }
	public RBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RBRACKET, 0); }
	public nested_hash_list(): Nested_hash_listContext | undefined {
		return this.tryGetRuleContext(0, Nested_hash_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_arg_value; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAction_arg_value) {
			listener.enterAction_arg_value(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAction_arg_value) {
			listener.exitAction_arg_value(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAction_arg_value) {
			return visitor.visitAction_arg_value(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Keyword_as_valueContext extends ParserRuleContext {
	public ODE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ODE, 0); }
	public SSA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SSA, 0); }
	public NF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.NF, 0); }
	public PLA(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLA, 0); }
	public SPARSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SPARSE, 0); }
	public VERBOSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.VERBOSE, 0); }
	public OVERWRITE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.OVERWRITE, 0); }
	public CONTINUE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.CONTINUE, 0); }
	public SAFE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAFE, 0); }
	public EXECUTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXECUTE, 0); }
	public BINARY_OUTPUT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BINARY_OUTPUT, 0); }
	public STEADY_STATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STEADY_STATE, 0); }
	public BDF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BDF, 0); }
	public STIFF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STIFF, 0); }
	public METHOD(): TerminalNode | undefined { return this.tryGetToken(BNGParser.METHOD, 0); }
	public TRUE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TRUE, 0); }
	public FALSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FALSE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_keyword_as_value; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterKeyword_as_value) {
			listener.enterKeyword_as_value(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitKeyword_as_value) {
			listener.exitKeyword_as_value(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitKeyword_as_value) {
			return visitor.visitKeyword_as_value(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Nested_hash_listContext extends ParserRuleContext {
	public nested_hash_item(): Nested_hash_itemContext[];
	public nested_hash_item(i: number): Nested_hash_itemContext;
	public nested_hash_item(i?: number): Nested_hash_itemContext | Nested_hash_itemContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Nested_hash_itemContext);
		} else {
			return this.getRuleContext(i, Nested_hash_itemContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_nested_hash_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterNested_hash_list) {
			listener.enterNested_hash_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitNested_hash_list) {
			listener.exitNested_hash_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitNested_hash_list) {
			return visitor.visitNested_hash_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Nested_hash_itemContext extends ParserRuleContext {
	public ASSIGNS(): TerminalNode { return this.getToken(BNGParser.ASSIGNS, 0); }
	public action_arg_value(): Action_arg_valueContext {
		return this.getRuleContext(0, Action_arg_valueContext);
	}
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public arg_name(): Arg_nameContext | undefined {
		return this.tryGetRuleContext(0, Arg_nameContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_nested_hash_item; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterNested_hash_item) {
			listener.enterNested_hash_item(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitNested_hash_item) {
			listener.exitNested_hash_item(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitNested_hash_item) {
			return visitor.visitNested_hash_item(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Arg_nameContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public TIME(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TIME, 0); }
	public OVERWRITE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.OVERWRITE, 0); }
	public MAX_AGG(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_AGG, 0); }
	public MAX_ITER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_ITER, 0); }
	public MAX_STOICH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_STOICH, 0); }
	public PRINT_ITER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_ITER, 0); }
	public CHECK_ISO(): TerminalNode | undefined { return this.tryGetToken(BNGParser.CHECK_ISO, 0); }
	public METHOD(): TerminalNode | undefined { return this.tryGetToken(BNGParser.METHOD, 0); }
	public T_START(): TerminalNode | undefined { return this.tryGetToken(BNGParser.T_START, 0); }
	public T_END(): TerminalNode | undefined { return this.tryGetToken(BNGParser.T_END, 0); }
	public N_STEPS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.N_STEPS, 0); }
	public N_OUTPUT_STEPS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.N_OUTPUT_STEPS, 0); }
	public ATOL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATOL, 0); }
	public RTOL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RTOL, 0); }
	public STEADY_STATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STEADY_STATE, 0); }
	public SPARSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SPARSE, 0); }
	public VERBOSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.VERBOSE, 0); }
	public NETFILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.NETFILE, 0); }
	public CONTINUE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.CONTINUE, 0); }
	public PREFIX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PREFIX, 0); }
	public SUFFIX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SUFFIX, 0); }
	public FORMAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FORMAT, 0); }
	public FILE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FILE, 0); }
	public PRINT_CDAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_CDAT, 0); }
	public PRINT_FUNCTIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_FUNCTIONS, 0); }
	public PRINT_NET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_NET, 0); }
	public PRINT_END(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_END, 0); }
	public STOP_IF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STOP_IF, 0); }
	public PRINT_ON_STOP(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRINT_ON_STOP, 0); }
	public SAVE_PROGRESS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAVE_PROGRESS, 0); }
	public MAX_SIM_STEPS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_SIM_STEPS, 0); }
	public OUTPUT_STEP_INTERVAL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.OUTPUT_STEP_INTERVAL, 0); }
	public SAMPLE_TIMES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAMPLE_TIMES, 0); }
	public PLA_CONFIG(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLA_CONFIG, 0); }
	public PLA_OUTPUT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLA_OUTPUT, 0); }
	public PARAM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PARAM, 0); }
	public COMPLEX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COMPLEX, 0); }
	public GET_FINAL_STATE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GET_FINAL_STATE, 0); }
	public GML(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GML, 0); }
	public NOCSLF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.NOCSLF, 0); }
	public NOTF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.NOTF, 0); }
	public BINARY_OUTPUT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BINARY_OUTPUT, 0); }
	public UTL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.UTL, 0); }
	public EQUIL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EQUIL, 0); }
	public PARAMETER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PARAMETER, 0); }
	public PAR_MIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PAR_MIN, 0); }
	public PAR_MAX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PAR_MAX, 0); }
	public N_SCAN_PTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.N_SCAN_PTS, 0); }
	public LOG_SCALE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LOG_SCALE, 0); }
	public RESET_CONC(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RESET_CONC, 0); }
	public BDF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BDF, 0); }
	public MAX_STEP(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_STEP, 0); }
	public MAXORDER(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAXORDER, 0); }
	public STATS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STATS, 0); }
	public MAX_NUM_STEPS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_NUM_STEPS, 0); }
	public MAX_ERR_TEST_FAILS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_ERR_TEST_FAILS, 0); }
	public MAX_CONV_FAILS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX_CONV_FAILS, 0); }
	public STIFF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STIFF, 0); }
	public ATOMIZE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATOMIZE, 0); }
	public BLOCKS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BLOCKS, 0); }
	public SKIPACTIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SKIPACTIONS, 0); }
	public INCLUDE_MODEL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INCLUDE_MODEL, 0); }
	public INCLUDE_NETWORK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INCLUDE_NETWORK, 0); }
	public PRETTY_FORMATTING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PRETTY_FORMATTING, 0); }
	public EVALUATE_EXPRESSIONS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EVALUATE_EXPRESSIONS, 0); }
	public TYPE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TYPE, 0); }
	public BACKGROUND(): TerminalNode | undefined { return this.tryGetToken(BNGParser.BACKGROUND, 0); }
	public COLLAPSE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLLAPSE, 0); }
	public OPTS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.OPTS, 0); }
	public SAFE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAFE, 0); }
	public EXECUTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXECUTE, 0); }
	public TEXTREACTION(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TEXTREACTION, 0); }
	public TEXTSPECIES(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TEXTSPECIES, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_arg_name; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterArg_name) {
			listener.enterArg_name(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitArg_name) {
			listener.exitArg_name(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitArg_name) {
			return visitor.visitArg_name(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Expression_listContext extends ParserRuleContext {
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COMMA(): TerminalNode[];
	public COMMA(i: number): TerminalNode;
	public COMMA(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.COMMA);
		} else {
			return this.getToken(BNGParser.COMMA, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_expression_list; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterExpression_list) {
			listener.enterExpression_list(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitExpression_list) {
			listener.exitExpression_list(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitExpression_list) {
			return visitor.visitExpression_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExpressionContext extends ParserRuleContext {
	public conditional_expr(): Conditional_exprContext {
		return this.getRuleContext(0, Conditional_exprContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_expression; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterExpression) {
			listener.enterExpression(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitExpression) {
			listener.exitExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitExpression) {
			return visitor.visitExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Conditional_exprContext extends ParserRuleContext {
	public or_expr(): Or_exprContext {
		return this.getRuleContext(0, Or_exprContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_conditional_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterConditional_expr) {
			listener.enterConditional_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitConditional_expr) {
			listener.exitConditional_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitConditional_expr) {
			return visitor.visitConditional_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Or_exprContext extends ParserRuleContext {
	public and_expr(): And_exprContext[];
	public and_expr(i: number): And_exprContext;
	public and_expr(i?: number): And_exprContext | And_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(And_exprContext);
		} else {
			return this.getRuleContext(i, And_exprContext);
		}
	}
	public LOGICAL_OR(): TerminalNode[];
	public LOGICAL_OR(i: number): TerminalNode;
	public LOGICAL_OR(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LOGICAL_OR);
		} else {
			return this.getToken(BNGParser.LOGICAL_OR, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_or_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterOr_expr) {
			listener.enterOr_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitOr_expr) {
			listener.exitOr_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitOr_expr) {
			return visitor.visitOr_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class And_exprContext extends ParserRuleContext {
	public equality_expr(): Equality_exprContext[];
	public equality_expr(i: number): Equality_exprContext;
	public equality_expr(i?: number): Equality_exprContext | Equality_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Equality_exprContext);
		} else {
			return this.getRuleContext(i, Equality_exprContext);
		}
	}
	public LOGICAL_AND(): TerminalNode[];
	public LOGICAL_AND(i: number): TerminalNode;
	public LOGICAL_AND(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LOGICAL_AND);
		} else {
			return this.getToken(BNGParser.LOGICAL_AND, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_and_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAnd_expr) {
			listener.enterAnd_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAnd_expr) {
			listener.exitAnd_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAnd_expr) {
			return visitor.visitAnd_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Equality_exprContext extends ParserRuleContext {
	public relational_expr(): Relational_exprContext[];
	public relational_expr(i: number): Relational_exprContext;
	public relational_expr(i?: number): Relational_exprContext | Relational_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Relational_exprContext);
		} else {
			return this.getRuleContext(i, Relational_exprContext);
		}
	}
	public EQUALS(): TerminalNode[];
	public EQUALS(i: number): TerminalNode;
	public EQUALS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.EQUALS);
		} else {
			return this.getToken(BNGParser.EQUALS, i);
		}
	}
	public NOT_EQUALS(): TerminalNode[];
	public NOT_EQUALS(i: number): TerminalNode;
	public NOT_EQUALS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.NOT_EQUALS);
		} else {
			return this.getToken(BNGParser.NOT_EQUALS, i);
		}
	}
	public GTE(): TerminalNode[];
	public GTE(i: number): TerminalNode;
	public GTE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.GTE);
		} else {
			return this.getToken(BNGParser.GTE, i);
		}
	}
	public GT(): TerminalNode[];
	public GT(i: number): TerminalNode;
	public GT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.GT);
		} else {
			return this.getToken(BNGParser.GT, i);
		}
	}
	public LTE(): TerminalNode[];
	public LTE(i: number): TerminalNode;
	public LTE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LTE);
		} else {
			return this.getToken(BNGParser.LTE, i);
		}
	}
	public LT(): TerminalNode[];
	public LT(i: number): TerminalNode;
	public LT(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.LT);
		} else {
			return this.getToken(BNGParser.LT, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_equality_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterEquality_expr) {
			listener.enterEquality_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitEquality_expr) {
			listener.exitEquality_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitEquality_expr) {
			return visitor.visitEquality_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Relational_exprContext extends ParserRuleContext {
	public additive_expr(): Additive_exprContext {
		return this.getRuleContext(0, Additive_exprContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_relational_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterRelational_expr) {
			listener.enterRelational_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitRelational_expr) {
			listener.exitRelational_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitRelational_expr) {
			return visitor.visitRelational_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Additive_exprContext extends ParserRuleContext {
	public multiplicative_expr(): Multiplicative_exprContext[];
	public multiplicative_expr(i: number): Multiplicative_exprContext;
	public multiplicative_expr(i?: number): Multiplicative_exprContext | Multiplicative_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Multiplicative_exprContext);
		} else {
			return this.getRuleContext(i, Multiplicative_exprContext);
		}
	}
	public PLUS(): TerminalNode[];
	public PLUS(i: number): TerminalNode;
	public PLUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PLUS);
		} else {
			return this.getToken(BNGParser.PLUS, i);
		}
	}
	public MINUS(): TerminalNode[];
	public MINUS(i: number): TerminalNode;
	public MINUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MINUS);
		} else {
			return this.getToken(BNGParser.MINUS, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_additive_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterAdditive_expr) {
			listener.enterAdditive_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitAdditive_expr) {
			listener.exitAdditive_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitAdditive_expr) {
			return visitor.visitAdditive_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Multiplicative_exprContext extends ParserRuleContext {
	public power_expr(): Power_exprContext[];
	public power_expr(i: number): Power_exprContext;
	public power_expr(i?: number): Power_exprContext | Power_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Power_exprContext);
		} else {
			return this.getRuleContext(i, Power_exprContext);
		}
	}
	public TIMES(): TerminalNode[];
	public TIMES(i: number): TerminalNode;
	public TIMES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.TIMES);
		} else {
			return this.getToken(BNGParser.TIMES, i);
		}
	}
	public DIV(): TerminalNode[];
	public DIV(i: number): TerminalNode;
	public DIV(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.DIV);
		} else {
			return this.getToken(BNGParser.DIV, i);
		}
	}
	public MOD(): TerminalNode[];
	public MOD(i: number): TerminalNode;
	public MOD(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MOD);
		} else {
			return this.getToken(BNGParser.MOD, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_multiplicative_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterMultiplicative_expr) {
			listener.enterMultiplicative_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitMultiplicative_expr) {
			listener.exitMultiplicative_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMultiplicative_expr) {
			return visitor.visitMultiplicative_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Power_exprContext extends ParserRuleContext {
	public unary_expr(): Unary_exprContext[];
	public unary_expr(i: number): Unary_exprContext;
	public unary_expr(i?: number): Unary_exprContext | Unary_exprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Unary_exprContext);
		} else {
			return this.getRuleContext(i, Unary_exprContext);
		}
	}
	public POWER(): TerminalNode[];
	public POWER(i: number): TerminalNode;
	public POWER(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.POWER);
		} else {
			return this.getToken(BNGParser.POWER, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_power_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPower_expr) {
			listener.enterPower_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPower_expr) {
			listener.exitPower_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPower_expr) {
			return visitor.visitPower_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Unary_exprContext extends ParserRuleContext {
	public primary_expr(): Primary_exprContext {
		return this.getRuleContext(0, Primary_exprContext);
	}
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLUS, 0); }
	public MINUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MINUS, 0); }
	public EMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EMARK, 0); }
	public TILDE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TILDE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_unary_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterUnary_expr) {
			listener.enterUnary_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitUnary_expr) {
			listener.exitUnary_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitUnary_expr) {
			return visitor.visitUnary_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Primary_exprContext extends ParserRuleContext {
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public function_call(): Function_callContext | undefined {
		return this.tryGetRuleContext(0, Function_callContext);
	}
	public observable_ref(): Observable_refContext | undefined {
		return this.tryGetRuleContext(0, Observable_refContext);
	}
	public literal(): LiteralContext | undefined {
		return this.tryGetRuleContext(0, LiteralContext);
	}
	public arg_name(): Arg_nameContext | undefined {
		return this.tryGetRuleContext(0, Arg_nameContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_primary_expr; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterPrimary_expr) {
			listener.enterPrimary_expr(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitPrimary_expr) {
			listener.exitPrimary_expr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPrimary_expr) {
			return visitor.visitPrimary_expr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Function_callContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public EXP(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EXP, 0); }
	public LN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LN, 0); }
	public LOG10(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LOG10, 0); }
	public LOG2(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LOG2, 0); }
	public SQRT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SQRT, 0); }
	public ABS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ABS, 0); }
	public SIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SIN, 0); }
	public COS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COS, 0); }
	public TAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TAN, 0); }
	public ASIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ASIN, 0); }
	public ACOS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ACOS, 0); }
	public ATAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATAN, 0); }
	public SINH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SINH, 0); }
	public COSH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COSH, 0); }
	public TANH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TANH, 0); }
	public ASINH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ASINH, 0); }
	public ACOSH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ACOSH, 0); }
	public ATANH(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ATANH, 0); }
	public RINT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RINT, 0); }
	public MIN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MIN, 0); }
	public MAX(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MAX, 0); }
	public SUM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SUM, 0); }
	public AVG(): TerminalNode | undefined { return this.tryGetToken(BNGParser.AVG, 0); }
	public IF(): TerminalNode | undefined { return this.tryGetToken(BNGParser.IF, 0); }
	public SAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.SAT, 0); }
	public MM(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MM, 0); }
	public HILL(): TerminalNode | undefined { return this.tryGetToken(BNGParser.HILL, 0); }
	public ARRHENIUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.ARRHENIUS, 0); }
	public TIME(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TIME, 0); }
	public MRATIO(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MRATIO, 0); }
	public TFUN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.TFUN, 0); }
	public FUNCTIONPRODUCT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FUNCTIONPRODUCT, 0); }
	public expression_list(): Expression_listContext | undefined {
		return this.tryGetRuleContext(0, Expression_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_function_call; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterFunction_call) {
			listener.enterFunction_call(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitFunction_call) {
			listener.exitFunction_call(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitFunction_call) {
			return visitor.visitFunction_call(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Observable_refContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	public LPAREN(): TerminalNode { return this.getToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode { return this.getToken(BNGParser.RPAREN, 0); }
	public expression_list(): Expression_listContext | undefined {
		return this.tryGetRuleContext(0, Expression_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_ref; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterObservable_ref) {
			listener.enterObservable_ref(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitObservable_ref) {
			listener.exitObservable_ref(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitObservable_ref) {
			return visitor.visitObservable_ref(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class LiteralContext extends ParserRuleContext {
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public FLOAT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.FLOAT, 0); }
	public PI(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PI, 0); }
	public EULERIAN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EULERIAN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_literal; }
	// @Override
	public enterRule(listener: BNGParserListener): void {
		if (listener.enterLiteral) {
			listener.enterLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: BNGParserListener): void {
		if (listener.exitLiteral) {
			listener.exitLiteral(this);
		}
	}
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitLiteral) {
			return visitor.visitLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


