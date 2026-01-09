// @ts-nocheck
// Generated from src/parser/grammar/BNGParser.g4 by ANTLR 4.9.0-SNAPSHOT


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
	public static readonly TYPES = 11;
	public static readonly SEED = 12;
	public static readonly SPECIES = 13;
	public static readonly OBSERVABLES = 14;
	public static readonly FUNCTIONS = 15;
	public static readonly REACTION = 16;
	public static readonly REACTIONS = 17;
	public static readonly RULES = 18;
	public static readonly REACTION_RULES = 19;
	public static readonly MOLECULE_TYPES = 20;
	public static readonly GROUPS = 21;
	public static readonly ACTIONS = 22;
	public static readonly POPULATION = 23;
	public static readonly MAPS = 24;
	public static readonly ENERGY = 25;
	public static readonly PATTERNS = 26;
	public static readonly MATCHONCE = 27;
	public static readonly DELETEMOLECULES = 28;
	public static readonly MOVECONNECTED = 29;
	public static readonly INCLUDE_REACTANTS = 30;
	public static readonly INCLUDE_PRODUCTS = 31;
	public static readonly EXCLUDE_REACTANTS = 32;
	public static readonly EXCLUDE_PRODUCTS = 33;
	public static readonly TOTALRATE = 34;
	public static readonly VERSION = 35;
	public static readonly SET_OPTION = 36;
	public static readonly SET_MODEL_NAME = 37;
	public static readonly SUBSTANCEUNITS = 38;
	public static readonly PREFIX = 39;
	public static readonly SUFFIX = 40;
	public static readonly GENERATENETWORK = 41;
	public static readonly OVERWRITE = 42;
	public static readonly MAX_AGG = 43;
	public static readonly MAX_ITER = 44;
	public static readonly MAX_STOICH = 45;
	public static readonly PRINT_ITER = 46;
	public static readonly CHECK_ISO = 47;
	public static readonly GENERATEHYBRIDMODEL = 48;
	public static readonly SAFE = 49;
	public static readonly EXECUTE = 50;
	public static readonly SIMULATE = 51;
	public static readonly METHOD = 52;
	public static readonly ODE = 53;
	public static readonly SSA = 54;
	public static readonly PLA = 55;
	public static readonly NF = 56;
	public static readonly VERBOSE = 57;
	public static readonly NETFILE = 58;
	public static readonly ARGFILE = 59;
	public static readonly CONTINUE = 60;
	public static readonly T_START = 61;
	public static readonly T_END = 62;
	public static readonly N_STEPS = 63;
	public static readonly N_OUTPUT_STEPS = 64;
	public static readonly MAX_SIM_STEPS = 65;
	public static readonly OUTPUT_STEP_INTERVAL = 66;
	public static readonly SAMPLE_TIMES = 67;
	public static readonly SAVE_PROGRESS = 68;
	public static readonly PRINT_CDAT = 69;
	public static readonly PRINT_FUNCTIONS = 70;
	public static readonly PRINT_NET = 71;
	public static readonly PRINT_END = 72;
	public static readonly STOP_IF = 73;
	public static readonly PRINT_ON_STOP = 74;
	public static readonly SIMULATE_ODE = 75;
	public static readonly ATOL = 76;
	public static readonly RTOL = 77;
	public static readonly STEADY_STATE = 78;
	public static readonly SPARSE = 79;
	public static readonly SIMULATE_SSA = 80;
	public static readonly SIMULATE_PLA = 81;
	public static readonly PLA_CONFIG = 82;
	public static readonly PLA_OUTPUT = 83;
	public static readonly SIMULATE_NF = 84;
	public static readonly SIMULATE_RM = 85;
	public static readonly PARAM = 86;
	public static readonly COMPLEX = 87;
	public static readonly GET_FINAL_STATE = 88;
	public static readonly GML = 89;
	public static readonly NOCSLF = 90;
	public static readonly NOTF = 91;
	public static readonly BINARY_OUTPUT = 92;
	public static readonly UTL = 93;
	public static readonly EQUIL = 94;
	public static readonly PARAMETER_SCAN = 95;
	public static readonly BIFURCATE = 96;
	public static readonly PARAMETER = 97;
	public static readonly PAR_MIN = 98;
	public static readonly PAR_MAX = 99;
	public static readonly N_SCAN_PTS = 100;
	public static readonly LOG_SCALE = 101;
	public static readonly RESET_CONC = 102;
	public static readonly READFILE = 103;
	public static readonly FILE = 104;
	public static readonly ATOMIZE = 105;
	public static readonly BLOCKS = 106;
	public static readonly SKIPACTIONS = 107;
	public static readonly VISUALIZE = 108;
	public static readonly TYPE = 109;
	public static readonly BACKGROUND = 110;
	public static readonly COLLAPSE = 111;
	public static readonly OPTS = 112;
	public static readonly WRITESSC = 113;
	public static readonly WRITESSCCFG = 114;
	public static readonly FORMAT = 115;
	public static readonly WRITEFILE = 116;
	public static readonly WRITEMODEL = 117;
	public static readonly WRITEXML = 118;
	public static readonly WRITENETWORK = 119;
	public static readonly WRITESBML = 120;
	public static readonly WRITEMDL = 121;
	public static readonly WRITELATEX = 122;
	public static readonly INCLUDE_MODEL = 123;
	public static readonly INCLUDE_NETWORK = 124;
	public static readonly PRETTY_FORMATTING = 125;
	public static readonly EVALUATE_EXPRESSIONS = 126;
	public static readonly TEXTREACTION = 127;
	public static readonly TEXTSPECIES = 128;
	public static readonly WRITEMFILE = 129;
	public static readonly WRITEMEXFILE = 130;
	public static readonly BDF = 131;
	public static readonly MAX_STEP = 132;
	public static readonly MAXORDER = 133;
	public static readonly STATS = 134;
	public static readonly MAX_NUM_STEPS = 135;
	public static readonly MAX_ERR_TEST_FAILS = 136;
	public static readonly MAX_CONV_FAILS = 137;
	public static readonly STIFF = 138;
	public static readonly SETCONCENTRATION = 139;
	public static readonly ADDCONCENTRATION = 140;
	public static readonly SAVECONCENTRATIONS = 141;
	public static readonly RESETCONCENTRATIONS = 142;
	public static readonly SETPARAMETER = 143;
	public static readonly SAVEPARAMETERS = 144;
	public static readonly RESETPARAMETERS = 145;
	public static readonly QUIT = 146;
	public static readonly TRUE = 147;
	public static readonly FALSE = 148;
	public static readonly SAT = 149;
	public static readonly MM = 150;
	public static readonly HILL = 151;
	public static readonly ARRHENIUS = 152;
	public static readonly MRATIO = 153;
	public static readonly TFUN = 154;
	public static readonly FUNCTIONPRODUCT = 155;
	public static readonly PRIORITY = 156;
	public static readonly IF = 157;
	public static readonly EXP = 158;
	public static readonly LN = 159;
	public static readonly LOG10 = 160;
	public static readonly LOG2 = 161;
	public static readonly SQRT = 162;
	public static readonly RINT = 163;
	public static readonly ABS = 164;
	public static readonly SIN = 165;
	public static readonly COS = 166;
	public static readonly TAN = 167;
	public static readonly ASIN = 168;
	public static readonly ACOS = 169;
	public static readonly ATAN = 170;
	public static readonly SINH = 171;
	public static readonly COSH = 172;
	public static readonly TANH = 173;
	public static readonly ASINH = 174;
	public static readonly ACOSH = 175;
	public static readonly ATANH = 176;
	public static readonly PI = 177;
	public static readonly EULERIAN = 178;
	public static readonly MIN = 179;
	public static readonly MAX = 180;
	public static readonly SUM = 181;
	public static readonly AVG = 182;
	public static readonly TIME = 183;
	public static readonly FLOAT = 184;
	public static readonly INT = 185;
	public static readonly STRING = 186;
	public static readonly SEMI = 187;
	public static readonly COLON = 188;
	public static readonly LSBRACKET = 189;
	public static readonly RSBRACKET = 190;
	public static readonly LBRACKET = 191;
	public static readonly RBRACKET = 192;
	public static readonly COMMA = 193;
	public static readonly DOT = 194;
	public static readonly LPAREN = 195;
	public static readonly RPAREN = 196;
	public static readonly UNI_REACTION_SIGN = 197;
	public static readonly BI_REACTION_SIGN = 198;
	public static readonly DOLLAR = 199;
	public static readonly TILDE = 200;
	public static readonly AT = 201;
	public static readonly GTE = 202;
	public static readonly GT = 203;
	public static readonly LTE = 204;
	public static readonly LT = 205;
	public static readonly ASSIGNS = 206;
	public static readonly EQUALS = 207;
	public static readonly NOT_EQUALS = 208;
	public static readonly BECOMES = 209;
	public static readonly LOGICAL_AND = 210;
	public static readonly LOGICAL_OR = 211;
	public static readonly DIV = 212;
	public static readonly TIMES = 213;
	public static readonly MINUS = 214;
	public static readonly PLUS = 215;
	public static readonly POWER = 216;
	public static readonly MOD = 217;
	public static readonly PIPE = 218;
	public static readonly QMARK = 219;
	public static readonly EMARK = 220;
	public static readonly DBQUOTES = 221;
	public static readonly SQUOTE = 222;
	public static readonly AMPERSAND = 223;
	public static readonly VERSION_NUMBER = 224;
	public static readonly ULB = 225;
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
	public static readonly RULE_component_def_list = 13;
	public static readonly RULE_component_def = 14;
	public static readonly RULE_state_list = 15;
	public static readonly RULE_state_name = 16;
	public static readonly RULE_seed_species_block = 17;
	public static readonly RULE_seed_species_def = 18;
	public static readonly RULE_species_def = 19;
	public static readonly RULE_molecule_compartment = 20;
	public static readonly RULE_molecule_pattern = 21;
	public static readonly RULE_molecule_tag = 22;
	public static readonly RULE_component_pattern_list = 23;
	public static readonly RULE_component_pattern = 24;
	public static readonly RULE_state_value = 25;
	public static readonly RULE_bond_spec = 26;
	public static readonly RULE_bond_id = 27;
	public static readonly RULE_observables_block = 28;
	public static readonly RULE_observable_def = 29;
	public static readonly RULE_observable_type = 30;
	public static readonly RULE_observable_pattern_list = 31;
	public static readonly RULE_observable_pattern = 32;
	public static readonly RULE_reaction_rules_block = 33;
	public static readonly RULE_reaction_rule_def = 34;
	public static readonly RULE_label_def = 35;
	public static readonly RULE_reactant_patterns = 36;
	public static readonly RULE_product_patterns = 37;
	public static readonly RULE_reaction_sign = 38;
	public static readonly RULE_rate_law = 39;
	public static readonly RULE_rule_modifiers = 40;
	public static readonly RULE_pattern_list = 41;
	public static readonly RULE_functions_block = 42;
	public static readonly RULE_function_def = 43;
	public static readonly RULE_param_list = 44;
	public static readonly RULE_compartments_block = 45;
	public static readonly RULE_compartment_def = 46;
	public static readonly RULE_energy_patterns_block = 47;
	public static readonly RULE_energy_pattern_def = 48;
	public static readonly RULE_population_maps_block = 49;
	public static readonly RULE_population_map_def = 50;
	public static readonly RULE_actions_block = 51;
	public static readonly RULE_wrapped_actions_block = 52;
	public static readonly RULE_begin_actions_block = 53;
	public static readonly RULE_action_command = 54;
	public static readonly RULE_generate_network_cmd = 55;
	public static readonly RULE_simulate_cmd = 56;
	public static readonly RULE_write_cmd = 57;
	public static readonly RULE_set_cmd = 58;
	public static readonly RULE_other_action_cmd = 59;
	public static readonly RULE_action_args = 60;
	public static readonly RULE_action_arg_list = 61;
	public static readonly RULE_action_arg = 62;
	public static readonly RULE_action_arg_value = 63;
	public static readonly RULE_keyword_as_value = 64;
	public static readonly RULE_nested_hash_list = 65;
	public static readonly RULE_nested_hash_item = 66;
	public static readonly RULE_arg_name = 67;
	public static readonly RULE_expression_list = 68;
	public static readonly RULE_expression = 69;
	public static readonly RULE_conditional_expr = 70;
	public static readonly RULE_or_expr = 71;
	public static readonly RULE_and_expr = 72;
	public static readonly RULE_equality_expr = 73;
	public static readonly RULE_relational_expr = 74;
	public static readonly RULE_additive_expr = 75;
	public static readonly RULE_multiplicative_expr = 76;
	public static readonly RULE_power_expr = 77;
	public static readonly RULE_unary_expr = 78;
	public static readonly RULE_primary_expr = 79;
	public static readonly RULE_function_call = 80;
	public static readonly RULE_observable_ref = 81;
	public static readonly RULE_literal = 82;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"prog", "header_block", "version_def", "substance_def", "set_option", 
		"set_model_name", "program_block", "parameters_block", "parameter_def", 
		"param_name", "molecule_types_block", "molecule_type_def", "molecule_def", 
		"component_def_list", "component_def", "state_list", "state_name", "seed_species_block", 
		"seed_species_def", "species_def", "molecule_compartment", "molecule_pattern", 
		"molecule_tag", "component_pattern_list", "component_pattern", "state_value", 
		"bond_spec", "bond_id", "observables_block", "observable_def", "observable_type", 
		"observable_pattern_list", "observable_pattern", "reaction_rules_block", 
		"reaction_rule_def", "label_def", "reactant_patterns", "product_patterns", 
		"reaction_sign", "rate_law", "rule_modifiers", "pattern_list", "functions_block", 
		"function_def", "param_list", "compartments_block", "compartment_def", 
		"energy_patterns_block", "energy_pattern_def", "population_maps_block", 
		"population_map_def", "actions_block", "wrapped_actions_block", "begin_actions_block", 
		"action_command", "generate_network_cmd", "simulate_cmd", "write_cmd", 
		"set_cmd", "other_action_cmd", "action_args", "action_arg_list", "action_arg", 
		"action_arg_value", "keyword_as_value", "nested_hash_list", "nested_hash_item", 
		"arg_name", "expression_list", "expression", "conditional_expr", "or_expr", 
		"and_expr", "equality_expr", "relational_expr", "additive_expr", "multiplicative_expr", 
		"power_expr", "unary_expr", "primary_expr", "function_call", "observable_ref", 
		"literal",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, "'begin'", "'end'", "'model'", 
		"'parameters'", "'compartments'", undefined, undefined, "'types'", "'seed'", 
		undefined, "'observables'", "'functions'", "'reaction'", undefined, "'rules'", 
		"'reaction_rules'", "'molecule_types'", "'groups'", "'actions'", "'population'", 
		"'maps'", "'energy'", "'patterns'", "'MatchOnce'", "'DeleteMolecules'", 
		"'MoveConnected'", "'include_reactants'", "'include_products'", "'exclude_reactants'", 
		"'exclude_products'", "'TotalRate'", "'version'", "'setOption'", "'setModelName'", 
		"'substanceUnits'", "'prefix'", "'suffix'", "'generate_network'", "'overwrite'", 
		"'max_agg'", "'max_iter'", "'max_stoich'", "'print_iter'", "'check_iso'", 
		"'generate_hybrid_model'", "'safe'", "'execute'", "'simulate'", "'method'", 
		"'ode'", "'ssa'", "'pla'", "'nf'", "'verbose'", "'netfile'", "'argfile'", 
		"'continue'", "'t_start'", "'t_end'", "'n_steps'", "'n_output_steps'", 
		"'max_sim_steps'", "'output_step_interval'", "'sample_times'", "'save_progress'", 
		"'print_CDAT'", "'print_functions'", "'print_net'", "'print_end'", "'stop_if'", 
		"'print_on_stop'", "'simulate_ode'", "'atol'", "'rtol'", "'steady_state'", 
		"'sparse'", "'simulate_ssa'", "'simulate_pla'", "'pla_config'", "'pla_output'", 
		"'simulate_nf'", "'simulate_rm'", "'param'", "'complex'", "'get_final_state'", 
		"'gml'", "'nocslf'", "'notf'", "'binary_output'", "'utl'", "'equil'", 
		"'parameter_scan'", "'bifurcate'", "'parameter'", "'par_min'", "'par_max'", 
		"'n_scan_pts'", "'log_scale'", "'reset_conc'", "'readFile'", "'file'", 
		"'atomize'", "'blocks'", "'skip_actions'", "'visualize'", "'type'", "'background'", 
		"'collapse'", "'opts'", "'writeSSC'", "'writeSSCcfg'", "'format'", "'writeFile'", 
		"'writeModel'", "'writeXML'", "'writeNetwork'", "'writeSBML'", "'writeMDL'", 
		"'writeLatex'", "'include_model'", "'include_network'", "'pretty_formatting'", 
		"'evaluate_expressions'", "'TextReaction'", "'TextSpecies'", "'writeMfile'", 
		"'writeMexfile'", "'bdf'", "'max_step'", "'maxOrder'", "'stats'", "'max_num_steps'", 
		"'max_err_test_fails'", "'max_conv_fails'", "'stiff'", "'setConcentration'", 
		"'addConcentration'", "'saveConcentrations'", "'resetConcentrations'", 
		"'setParameter'", "'saveParameters'", "'resetParameters'", "'quit'", "'true'", 
		"'false'", "'Sat'", "'MM'", "'Hill'", "'Arrhenius'", "'mratio'", "'TFUN'", 
		"'FunctionProduct'", "'priority'", "'if'", "'exp'", "'ln'", "'log10'", 
		"'log2'", "'sqrt'", "'rint'", "'abs'", "'sin'", "'cos'", "'tan'", "'asin'", 
		"'acos'", "'atan'", "'sinh'", "'cosh'", "'tanh'", "'asinh'", "'acosh'", 
		"'atanh'", "'_pi'", "'_e'", "'min'", "'max'", "'sum'", "'avg'", "'time'", 
		undefined, undefined, undefined, "';'", "':'", "'['", "']'", "'{'", "'}'", 
		"','", "'.'", "'('", "')'", "'->'", "'<->'", "'$'", "'~'", "'@'", "'>='", 
		"'>'", "'<='", "'<'", "'=>'", "'=='", undefined, "'='", "'&&'", "'||'", 
		"'/'", "'*'", "'-'", "'+'", undefined, "'%'", "'|'", "'?'", "'!'", "'\"'", 
		"'''", "'&'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "LINE_COMMENT", "LB", "WS", "BEGIN", "END", "MODEL", "PARAMETERS", 
		"COMPARTMENTS", "MOLECULE", "MOLECULES", "TYPES", "SEED", "SPECIES", "OBSERVABLES", 
		"FUNCTIONS", "REACTION", "REACTIONS", "RULES", "REACTION_RULES", "MOLECULE_TYPES", 
		"GROUPS", "ACTIONS", "POPULATION", "MAPS", "ENERGY", "PATTERNS", "MATCHONCE", 
		"DELETEMOLECULES", "MOVECONNECTED", "INCLUDE_REACTANTS", "INCLUDE_PRODUCTS", 
		"EXCLUDE_REACTANTS", "EXCLUDE_PRODUCTS", "TOTALRATE", "VERSION", "SET_OPTION", 
		"SET_MODEL_NAME", "SUBSTANCEUNITS", "PREFIX", "SUFFIX", "GENERATENETWORK", 
		"OVERWRITE", "MAX_AGG", "MAX_ITER", "MAX_STOICH", "PRINT_ITER", "CHECK_ISO", 
		"GENERATEHYBRIDMODEL", "SAFE", "EXECUTE", "SIMULATE", "METHOD", "ODE", 
		"SSA", "PLA", "NF", "VERBOSE", "NETFILE", "ARGFILE", "CONTINUE", "T_START", 
		"T_END", "N_STEPS", "N_OUTPUT_STEPS", "MAX_SIM_STEPS", "OUTPUT_STEP_INTERVAL", 
		"SAMPLE_TIMES", "SAVE_PROGRESS", "PRINT_CDAT", "PRINT_FUNCTIONS", "PRINT_NET", 
		"PRINT_END", "STOP_IF", "PRINT_ON_STOP", "SIMULATE_ODE", "ATOL", "RTOL", 
		"STEADY_STATE", "SPARSE", "SIMULATE_SSA", "SIMULATE_PLA", "PLA_CONFIG", 
		"PLA_OUTPUT", "SIMULATE_NF", "SIMULATE_RM", "PARAM", "COMPLEX", "GET_FINAL_STATE", 
		"GML", "NOCSLF", "NOTF", "BINARY_OUTPUT", "UTL", "EQUIL", "PARAMETER_SCAN", 
		"BIFURCATE", "PARAMETER", "PAR_MIN", "PAR_MAX", "N_SCAN_PTS", "LOG_SCALE", 
		"RESET_CONC", "READFILE", "FILE", "ATOMIZE", "BLOCKS", "SKIPACTIONS", 
		"VISUALIZE", "TYPE", "BACKGROUND", "COLLAPSE", "OPTS", "WRITESSC", "WRITESSCCFG", 
		"FORMAT", "WRITEFILE", "WRITEMODEL", "WRITEXML", "WRITENETWORK", "WRITESBML", 
		"WRITEMDL", "WRITELATEX", "INCLUDE_MODEL", "INCLUDE_NETWORK", "PRETTY_FORMATTING", 
		"EVALUATE_EXPRESSIONS", "TEXTREACTION", "TEXTSPECIES", "WRITEMFILE", "WRITEMEXFILE", 
		"BDF", "MAX_STEP", "MAXORDER", "STATS", "MAX_NUM_STEPS", "MAX_ERR_TEST_FAILS", 
		"MAX_CONV_FAILS", "STIFF", "SETCONCENTRATION", "ADDCONCENTRATION", "SAVECONCENTRATIONS", 
		"RESETCONCENTRATIONS", "SETPARAMETER", "SAVEPARAMETERS", "RESETPARAMETERS", 
		"QUIT", "TRUE", "FALSE", "SAT", "MM", "HILL", "ARRHENIUS", "MRATIO", "TFUN", 
		"FUNCTIONPRODUCT", "PRIORITY", "IF", "EXP", "LN", "LOG10", "LOG2", "SQRT", 
		"RINT", "ABS", "SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN", "SINH", "COSH", 
		"TANH", "ASINH", "ACOSH", "ATANH", "PI", "EULERIAN", "MIN", "MAX", "SUM", 
		"AVG", "TIME", "FLOAT", "INT", "STRING", "SEMI", "COLON", "LSBRACKET", 
		"RSBRACKET", "LBRACKET", "RBRACKET", "COMMA", "DOT", "LPAREN", "RPAREN", 
		"UNI_REACTION_SIGN", "BI_REACTION_SIGN", "DOLLAR", "TILDE", "AT", "GTE", 
		"GT", "LTE", "LT", "ASSIGNS", "EQUALS", "NOT_EQUALS", "BECOMES", "LOGICAL_AND", 
		"LOGICAL_OR", "DIV", "TIMES", "MINUS", "PLUS", "POWER", "MOD", "PIPE", 
		"QMARK", "EMARK", "DBQUOTES", "SQUOTE", "AMPERSAND", "VERSION_NUMBER", 
		"ULB",
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
			this.state = 169;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 166;
				this.match(BNGParser.LB);
				}
				}
				this.state = 171;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 175;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 35)) & ~0x1F) === 0 && ((1 << (_la - 35)) & ((1 << (BNGParser.VERSION - 35)) | (1 << (BNGParser.SET_OPTION - 35)) | (1 << (BNGParser.SET_MODEL_NAME - 35)) | (1 << (BNGParser.SUBSTANCEUNITS - 35)))) !== 0)) {
				{
				{
				this.state = 172;
				this.header_block();
				}
				}
				this.state = 177;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 205;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				{
				{
				this.state = 178;
				this.match(BNGParser.BEGIN);
				this.state = 179;
				this.match(BNGParser.MODEL);
				this.state = 181;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 180;
					this.match(BNGParser.LB);
					}
					}
					this.state = 183;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 188;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.BEGIN) {
					{
					{
					this.state = 185;
					this.program_block();
					}
					}
					this.state = 190;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 191;
				this.match(BNGParser.END);
				this.state = 192;
				this.match(BNGParser.MODEL);
				this.state = 196;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 193;
					this.match(BNGParser.LB);
					}
					}
					this.state = 198;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				}
				break;

			case 2:
				{
				this.state = 202;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 199;
						this.program_block();
						}
						}
					}
					this.state = 204;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
				}
				}
				break;
			}
			this.state = 209;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.BEGIN:
				{
				this.state = 207;
				this.wrapped_actions_block();
				}
				break;
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
			case BNGParser.QUIT:
				{
				this.state = 208;
				this.actions_block();
				}
				break;
			case BNGParser.EOF:
				break;
			default:
				break;
			}
			this.state = 211;
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
			this.state = 217;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.VERSION:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 213;
				this.version_def();
				}
				break;
			case BNGParser.SUBSTANCEUNITS:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 214;
				this.substance_def();
				}
				break;
			case BNGParser.SET_OPTION:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 215;
				this.set_option();
				}
				break;
			case BNGParser.SET_MODEL_NAME:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 216;
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
			this.state = 219;
			this.match(BNGParser.VERSION);
			this.state = 220;
			this.match(BNGParser.LPAREN);
			this.state = 221;
			this.match(BNGParser.DBQUOTES);
			this.state = 222;
			this.match(BNGParser.VERSION_NUMBER);
			this.state = 224;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 223;
				this.match(BNGParser.STRING);
				}
			}

			this.state = 226;
			this.match(BNGParser.DBQUOTES);
			this.state = 227;
			this.match(BNGParser.RPAREN);
			this.state = 229;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 228;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 232;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 231;
				this.match(BNGParser.LB);
				}
				}
				this.state = 234;
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
			this.state = 236;
			this.match(BNGParser.SUBSTANCEUNITS);
			this.state = 237;
			this.match(BNGParser.LPAREN);
			this.state = 238;
			this.match(BNGParser.DBQUOTES);
			this.state = 239;
			this.match(BNGParser.STRING);
			this.state = 240;
			this.match(BNGParser.DBQUOTES);
			this.state = 241;
			this.match(BNGParser.RPAREN);
			this.state = 243;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 242;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 246;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 245;
				this.match(BNGParser.LB);
				}
				}
				this.state = 248;
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
			this.state = 250;
			this.match(BNGParser.SET_OPTION);
			this.state = 251;
			this.match(BNGParser.LPAREN);
			this.state = 252;
			this.match(BNGParser.DBQUOTES);
			this.state = 256;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
				{
				{
				this.state = 253;
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
				this.state = 258;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 259;
			this.match(BNGParser.DBQUOTES);
			this.state = 260;
			this.match(BNGParser.COMMA);
			this.state = 261;
			this.match(BNGParser.DBQUOTES);
			this.state = 265;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
				{
				{
				this.state = 262;
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
				this.state = 267;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 268;
			this.match(BNGParser.DBQUOTES);
			this.state = 289;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 269;
				this.match(BNGParser.COMMA);
				this.state = 270;
				this.match(BNGParser.DBQUOTES);
				this.state = 274;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 271;
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
					this.state = 276;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 277;
				this.match(BNGParser.DBQUOTES);
				this.state = 278;
				this.match(BNGParser.COMMA);
				this.state = 279;
				this.match(BNGParser.DBQUOTES);
				this.state = 283;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 280;
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
					this.state = 285;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 286;
				this.match(BNGParser.DBQUOTES);
				}
				}
				this.state = 291;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 292;
			this.match(BNGParser.RPAREN);
			this.state = 294;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 293;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 297;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 296;
				this.match(BNGParser.LB);
				}
				}
				this.state = 299;
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
			this.state = 301;
			this.match(BNGParser.SET_MODEL_NAME);
			this.state = 302;
			this.match(BNGParser.LPAREN);
			this.state = 303;
			this.match(BNGParser.DBQUOTES);
			this.state = 304;
			this.match(BNGParser.STRING);
			this.state = 305;
			this.match(BNGParser.DBQUOTES);
			this.state = 306;
			this.match(BNGParser.RPAREN);
			this.state = 308;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 307;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 311;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 310;
				this.match(BNGParser.LB);
				}
				}
				this.state = 313;
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
			this.state = 326;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 23, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 315;
				this.parameters_block();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 316;
				this.molecule_types_block();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 317;
				this.seed_species_block();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 318;
				this.observables_block();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 319;
				this.reaction_rules_block();
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 320;
				this.functions_block();
				}
				break;

			case 7:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 321;
				this.compartments_block();
				}
				break;

			case 8:
				this.enterOuterAlt(_localctx, 8);
				{
				this.state = 322;
				this.energy_patterns_block();
				}
				break;

			case 9:
				this.enterOuterAlt(_localctx, 9);
				{
				this.state = 323;
				this.population_maps_block();
				}
				break;

			case 10:
				this.enterOuterAlt(_localctx, 10);
				{
				this.state = 324;
				this.wrapped_actions_block();
				}
				break;

			case 11:
				this.enterOuterAlt(_localctx, 11);
				{
				this.state = 325;
				this.begin_actions_block();
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
			this.state = 328;
			this.match(BNGParser.BEGIN);
			this.state = 329;
			this.match(BNGParser.PARAMETERS);
			this.state = 331;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 330;
				this.match(BNGParser.LB);
				}
				}
				this.state = 333;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 343;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)))) !== 0) || _la === BNGParser.INT || _la === BNGParser.STRING) {
				{
				{
				this.state = 335;
				this.parameter_def();
				this.state = 337;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 336;
					this.match(BNGParser.LB);
					}
					}
					this.state = 339;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 345;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 346;
			this.match(BNGParser.END);
			this.state = 347;
			this.match(BNGParser.PARAMETERS);
			this.state = 351;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 348;
				this.match(BNGParser.LB);
				}
				}
				this.state = 353;
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
			this.state = 355;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.INT) {
				{
				this.state = 354;
				this.match(BNGParser.INT);
				}
			}

			this.state = 360;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 29, this._ctx) ) {
			case 1:
				{
				this.state = 357;
				this.param_name();
				this.state = 358;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 362;
			this.param_name();
			this.state = 364;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.BECOMES) {
				{
				this.state = 363;
				this.match(BNGParser.BECOMES);
				}
			}

			this.state = 367;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)) | (1 << (BNGParser.SAT - 136)) | (1 << (BNGParser.MM - 136)) | (1 << (BNGParser.HILL - 136)) | (1 << (BNGParser.ARRHENIUS - 136)) | (1 << (BNGParser.MRATIO - 136)) | (1 << (BNGParser.TFUN - 136)) | (1 << (BNGParser.FUNCTIONPRODUCT - 136)) | (1 << (BNGParser.IF - 136)) | (1 << (BNGParser.EXP - 136)) | (1 << (BNGParser.LN - 136)) | (1 << (BNGParser.LOG10 - 136)) | (1 << (BNGParser.LOG2 - 136)) | (1 << (BNGParser.SQRT - 136)) | (1 << (BNGParser.RINT - 136)) | (1 << (BNGParser.ABS - 136)) | (1 << (BNGParser.SIN - 136)) | (1 << (BNGParser.COS - 136)) | (1 << (BNGParser.TAN - 136)))) !== 0) || ((((_la - 168)) & ~0x1F) === 0 && ((1 << (_la - 168)) & ((1 << (BNGParser.ASIN - 168)) | (1 << (BNGParser.ACOS - 168)) | (1 << (BNGParser.ATAN - 168)) | (1 << (BNGParser.SINH - 168)) | (1 << (BNGParser.COSH - 168)) | (1 << (BNGParser.TANH - 168)) | (1 << (BNGParser.ASINH - 168)) | (1 << (BNGParser.ACOSH - 168)) | (1 << (BNGParser.ATANH - 168)) | (1 << (BNGParser.PI - 168)) | (1 << (BNGParser.EULERIAN - 168)) | (1 << (BNGParser.MIN - 168)) | (1 << (BNGParser.MAX - 168)) | (1 << (BNGParser.SUM - 168)) | (1 << (BNGParser.AVG - 168)) | (1 << (BNGParser.TIME - 168)) | (1 << (BNGParser.FLOAT - 168)) | (1 << (BNGParser.INT - 168)) | (1 << (BNGParser.STRING - 168)) | (1 << (BNGParser.LPAREN - 168)))) !== 0) || ((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0)) {
				{
				this.state = 366;
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
			this.state = 371;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 32, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 369;
				this.match(BNGParser.STRING);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 370;
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
			this.state = 453;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 45, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 373;
				this.match(BNGParser.BEGIN);
				this.state = 374;
				this.match(BNGParser.MOLECULE);
				this.state = 375;
				this.match(BNGParser.TYPES);
				this.state = 377;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 376;
					this.match(BNGParser.LB);
					}
					}
					this.state = 379;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 389;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.STRING) {
					{
					{
					this.state = 381;
					this.molecule_type_def();
					this.state = 383;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 382;
						this.match(BNGParser.LB);
						}
						}
						this.state = 385;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 391;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 392;
				this.match(BNGParser.END);
				this.state = 393;
				this.match(BNGParser.MOLECULE);
				this.state = 394;
				this.match(BNGParser.TYPES);
				this.state = 398;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 395;
					this.match(BNGParser.LB);
					}
					}
					this.state = 400;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 401;
				this.match(BNGParser.BEGIN);
				this.state = 402;
				this.match(BNGParser.MOLECULES);
				this.state = 404;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 403;
					this.match(BNGParser.LB);
					}
					}
					this.state = 406;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 416;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.STRING) {
					{
					{
					this.state = 408;
					this.molecule_type_def();
					this.state = 410;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 409;
						this.match(BNGParser.LB);
						}
						}
						this.state = 412;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 418;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 419;
				this.match(BNGParser.END);
				this.state = 420;
				this.match(BNGParser.MOLECULES);
				this.state = 424;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 421;
					this.match(BNGParser.LB);
					}
					}
					this.state = 426;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 427;
				this.match(BNGParser.BEGIN);
				this.state = 428;
				this.match(BNGParser.MOLECULE_TYPES);
				this.state = 430;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 429;
					this.match(BNGParser.LB);
					}
					}
					this.state = 432;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 442;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.STRING) {
					{
					{
					this.state = 434;
					this.molecule_type_def();
					this.state = 436;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 435;
						this.match(BNGParser.LB);
						}
						}
						this.state = 438;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 444;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 445;
				this.match(BNGParser.END);
				this.state = 446;
				this.match(BNGParser.MOLECULE_TYPES);
				this.state = 450;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 447;
					this.match(BNGParser.LB);
					}
					}
					this.state = 452;
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
			this.state = 457;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 46, this._ctx) ) {
			case 1:
				{
				this.state = 455;
				this.match(BNGParser.STRING);
				this.state = 456;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 459;
			this.molecule_def();
			this.state = 461;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.POPULATION) {
				{
				this.state = 460;
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
			this.state = 463;
			this.match(BNGParser.STRING);
			this.state = 469;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LPAREN) {
				{
				this.state = 464;
				this.match(BNGParser.LPAREN);
				this.state = 466;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 48, this._ctx) ) {
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
		this.enterRule(_localctx, 26, BNGParser.RULE_component_def_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 472;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 471;
				this.component_def();
				}
			}

			this.state = 480;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 474;
				this.match(BNGParser.COMMA);
				this.state = 476;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 475;
					this.component_def();
					}
				}

				}
				}
				this.state = 482;
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
		this.enterRule(_localctx, 28, BNGParser.RULE_component_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 483;
			this.match(BNGParser.STRING);
			this.state = 486;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.TILDE) {
				{
				this.state = 484;
				this.match(BNGParser.TILDE);
				this.state = 485;
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
	public state_list(): State_listContext {
		let _localctx: State_listContext = new State_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, BNGParser.RULE_state_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 488;
			this.state_name();
			this.state = 493;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.TILDE) {
				{
				{
				this.state = 489;
				this.match(BNGParser.TILDE);
				this.state = 490;
				this.state_name();
				}
				}
				this.state = 495;
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
		this.enterRule(_localctx, 32, BNGParser.RULE_state_name);
		let _la: number;
		try {
			this.state = 501;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 496;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 497;
				this.match(BNGParser.INT);
				this.state = 499;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 498;
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
		this.enterRule(_localctx, 34, BNGParser.RULE_seed_species_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 503;
			this.match(BNGParser.BEGIN);
			this.state = 507;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.SEED:
				{
				this.state = 504;
				this.match(BNGParser.SEED);
				this.state = 505;
				this.match(BNGParser.SPECIES);
				}
				break;
			case BNGParser.SPECIES:
				{
				this.state = 506;
				this.match(BNGParser.SPECIES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 510;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 509;
				this.match(BNGParser.LB);
				}
				}
				this.state = 512;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 522;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)) | (1 << (BNGParser.DOLLAR - 185)) | (1 << (BNGParser.AT - 185)))) !== 0)) {
				{
				{
				this.state = 514;
				this.seed_species_def();
				this.state = 516;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 515;
					this.match(BNGParser.LB);
					}
					}
					this.state = 518;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 524;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 525;
			this.match(BNGParser.END);
			this.state = 529;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.SEED:
				{
				this.state = 526;
				this.match(BNGParser.SEED);
				this.state = 527;
				this.match(BNGParser.SPECIES);
				}
				break;
			case BNGParser.SPECIES:
				{
				this.state = 528;
				this.match(BNGParser.SPECIES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 534;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 531;
				this.match(BNGParser.LB);
				}
				}
				this.state = 536;
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
		this.enterRule(_localctx, 36, BNGParser.RULE_seed_species_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 538;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.INT) {
				{
				this.state = 537;
				this.match(BNGParser.INT);
				}
			}

			this.state = 542;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 64, this._ctx) ) {
			case 1:
				{
				this.state = 540;
				this.match(BNGParser.STRING);
				this.state = 541;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 545;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.DOLLAR) {
				{
				this.state = 544;
				this.match(BNGParser.DOLLAR);
				}
			}

			this.state = 550;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 66, this._ctx) ) {
			case 1:
				{
				this.state = 547;
				this.match(BNGParser.AT);
				this.state = 548;
				this.match(BNGParser.STRING);
				this.state = 549;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 552;
			this.species_def();
			this.state = 554;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)) | (1 << (BNGParser.SAT - 136)) | (1 << (BNGParser.MM - 136)) | (1 << (BNGParser.HILL - 136)) | (1 << (BNGParser.ARRHENIUS - 136)) | (1 << (BNGParser.MRATIO - 136)) | (1 << (BNGParser.TFUN - 136)) | (1 << (BNGParser.FUNCTIONPRODUCT - 136)) | (1 << (BNGParser.IF - 136)) | (1 << (BNGParser.EXP - 136)) | (1 << (BNGParser.LN - 136)) | (1 << (BNGParser.LOG10 - 136)) | (1 << (BNGParser.LOG2 - 136)) | (1 << (BNGParser.SQRT - 136)) | (1 << (BNGParser.RINT - 136)) | (1 << (BNGParser.ABS - 136)) | (1 << (BNGParser.SIN - 136)) | (1 << (BNGParser.COS - 136)) | (1 << (BNGParser.TAN - 136)))) !== 0) || ((((_la - 168)) & ~0x1F) === 0 && ((1 << (_la - 168)) & ((1 << (BNGParser.ASIN - 168)) | (1 << (BNGParser.ACOS - 168)) | (1 << (BNGParser.ATAN - 168)) | (1 << (BNGParser.SINH - 168)) | (1 << (BNGParser.COSH - 168)) | (1 << (BNGParser.TANH - 168)) | (1 << (BNGParser.ASINH - 168)) | (1 << (BNGParser.ACOSH - 168)) | (1 << (BNGParser.ATANH - 168)) | (1 << (BNGParser.PI - 168)) | (1 << (BNGParser.EULERIAN - 168)) | (1 << (BNGParser.MIN - 168)) | (1 << (BNGParser.MAX - 168)) | (1 << (BNGParser.SUM - 168)) | (1 << (BNGParser.AVG - 168)) | (1 << (BNGParser.TIME - 168)) | (1 << (BNGParser.FLOAT - 168)) | (1 << (BNGParser.INT - 168)) | (1 << (BNGParser.STRING - 168)) | (1 << (BNGParser.LPAREN - 168)))) !== 0) || ((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0)) {
				{
				this.state = 553;
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
	public species_def(): Species_defContext {
		let _localctx: Species_defContext = new Species_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, BNGParser.RULE_species_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 559;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.AT) {
				{
				this.state = 556;
				this.match(BNGParser.AT);
				this.state = 557;
				this.match(BNGParser.STRING);
				this.state = 558;
				this.match(BNGParser.COLON);
				}
			}

			this.state = 561;
			this.molecule_pattern();
			this.state = 563;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 69, this._ctx) ) {
			case 1:
				{
				this.state = 562;
				this.molecule_compartment();
				}
				break;
			}
			this.state = 572;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.DOT) {
				{
				{
				this.state = 565;
				this.match(BNGParser.DOT);
				this.state = 566;
				this.molecule_pattern();
				this.state = 568;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 70, this._ctx) ) {
				case 1:
					{
					this.state = 567;
					this.molecule_compartment();
					}
					break;
				}
				}
				}
				this.state = 574;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 577;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 72, this._ctx) ) {
			case 1:
				{
				this.state = 575;
				this.match(BNGParser.AT);
				this.state = 576;
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
		this.enterRule(_localctx, 40, BNGParser.RULE_molecule_compartment);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 579;
			this.match(BNGParser.AT);
			this.state = 580;
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
		this.enterRule(_localctx, 42, BNGParser.RULE_molecule_pattern);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 582;
			this.match(BNGParser.STRING);
			this.state = 588;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 74, this._ctx) ) {
			case 1:
				{
				this.state = 583;
				this.match(BNGParser.LPAREN);
				this.state = 585;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 73, this._ctx) ) {
				case 1:
					{
					this.state = 584;
					this.component_pattern_list();
					}
					break;
				}
				this.state = 587;
				this.match(BNGParser.RPAREN);
				}
				break;
			}
			this.state = 591;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.MOD) {
				{
				this.state = 590;
				this.molecule_tag();
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
	public molecule_tag(): Molecule_tagContext {
		let _localctx: Molecule_tagContext = new Molecule_tagContext(this._ctx, this.state);
		this.enterRule(_localctx, 44, BNGParser.RULE_molecule_tag);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 593;
			this.match(BNGParser.MOD);
			this.state = 594;
			this.match(BNGParser.INT);
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
		this.enterRule(_localctx, 46, BNGParser.RULE_component_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 597;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 596;
				this.component_pattern();
				}
			}

			this.state = 605;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 599;
				this.match(BNGParser.COMMA);
				this.state = 601;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 600;
					this.component_pattern();
					}
				}

				}
				}
				this.state = 607;
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
		this.enterRule(_localctx, 48, BNGParser.RULE_component_pattern);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 608;
			this.match(BNGParser.STRING);
			this.state = 614;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.TILDE || _la === BNGParser.EMARK) {
				{
				this.state = 612;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case BNGParser.TILDE:
					{
					this.state = 609;
					this.match(BNGParser.TILDE);
					this.state = 610;
					this.state_value();
					}
					break;
				case BNGParser.EMARK:
					{
					this.state = 611;
					this.bond_spec();
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				}
				this.state = 616;
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
	public state_value(): State_valueContext {
		let _localctx: State_valueContext = new State_valueContext(this._ctx, this.state);
		this.enterRule(_localctx, 50, BNGParser.RULE_state_value);
		let _la: number;
		try {
			this.state = 623;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 617;
				this.match(BNGParser.STRING);
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 618;
				this.match(BNGParser.INT);
				this.state = 620;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 619;
					this.match(BNGParser.STRING);
					}
				}

				}
				break;
			case BNGParser.QMARK:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 622;
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
		this.enterRule(_localctx, 52, BNGParser.RULE_bond_spec);
		try {
			this.state = 633;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 83, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 625;
				this.match(BNGParser.EMARK);
				this.state = 626;
				this.bond_id();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 627;
				this.match(BNGParser.EMARK);
				this.state = 628;
				this.match(BNGParser.PLUS);
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 629;
				this.match(BNGParser.EMARK);
				this.state = 630;
				this.match(BNGParser.QMARK);
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 631;
				this.match(BNGParser.EMARK);
				this.state = 632;
				this.match(BNGParser.MINUS);
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
		this.enterRule(_localctx, 54, BNGParser.RULE_bond_id);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 635;
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
		this.enterRule(_localctx, 56, BNGParser.RULE_observables_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 637;
			this.match(BNGParser.BEGIN);
			this.state = 638;
			this.match(BNGParser.OBSERVABLES);
			this.state = 640;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 639;
				this.match(BNGParser.LB);
				}
				}
				this.state = 642;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 652;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.MOLECULES || _la === BNGParser.SPECIES || _la === BNGParser.STRING) {
				{
				{
				this.state = 644;
				this.observable_def();
				this.state = 646;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 645;
					this.match(BNGParser.LB);
					}
					}
					this.state = 648;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 654;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 655;
			this.match(BNGParser.END);
			this.state = 656;
			this.match(BNGParser.OBSERVABLES);
			this.state = 660;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 657;
				this.match(BNGParser.LB);
				}
				}
				this.state = 662;
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
		this.enterRule(_localctx, 58, BNGParser.RULE_observable_def);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 665;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 88, this._ctx) ) {
			case 1:
				{
				this.state = 663;
				this.match(BNGParser.STRING);
				this.state = 664;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 668;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 89, this._ctx) ) {
			case 1:
				{
				this.state = 667;
				this.observable_type();
				}
				break;
			}
			this.state = 670;
			this.match(BNGParser.STRING);
			this.state = 671;
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
		this.enterRule(_localctx, 60, BNGParser.RULE_observable_type);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 673;
			_la = this._input.LA(1);
			if (!(_la === BNGParser.MOLECULES || _la === BNGParser.SPECIES || _la === BNGParser.STRING)) {
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
		this.enterRule(_localctx, 62, BNGParser.RULE_observable_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 675;
			this.observable_pattern();
			this.state = 682;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 186)) & ~0x1F) === 0 && ((1 << (_la - 186)) & ((1 << (BNGParser.STRING - 186)) | (1 << (BNGParser.COMMA - 186)) | (1 << (BNGParser.AT - 186)))) !== 0)) {
				{
				{
				this.state = 677;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.COMMA) {
					{
					this.state = 676;
					this.match(BNGParser.COMMA);
					}
				}

				this.state = 679;
				this.observable_pattern();
				}
				}
				this.state = 684;
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
		this.enterRule(_localctx, 64, BNGParser.RULE_observable_pattern);
		let _la: number;
		try {
			this.state = 689;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 92, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 685;
				this.species_def();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 686;
				this.match(BNGParser.STRING);
				this.state = 687;
				_la = this._input.LA(1);
				if (!(((((_la - 202)) & ~0x1F) === 0 && ((1 << (_la - 202)) & ((1 << (BNGParser.GTE - 202)) | (1 << (BNGParser.GT - 202)) | (1 << (BNGParser.LTE - 202)) | (1 << (BNGParser.LT - 202)) | (1 << (BNGParser.EQUALS - 202)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 688;
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
		this.enterRule(_localctx, 66, BNGParser.RULE_reaction_rules_block);
		let _la: number;
		try {
			this.state = 771;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 105, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 691;
				this.match(BNGParser.BEGIN);
				this.state = 692;
				this.match(BNGParser.REACTION);
				this.state = 693;
				this.match(BNGParser.RULES);
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
				while (((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)) | (1 << (BNGParser.LBRACKET - 185)) | (1 << (BNGParser.AT - 185)))) !== 0)) {
					{
					{
					this.state = 699;
					this.reaction_rule_def();
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
				this.match(BNGParser.REACTION);
				this.state = 712;
				this.match(BNGParser.RULES);
				this.state = 716;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 713;
					this.match(BNGParser.LB);
					}
					}
					this.state = 718;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 719;
				this.match(BNGParser.BEGIN);
				this.state = 720;
				this.match(BNGParser.REACTION_RULES);
				this.state = 722;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 721;
					this.match(BNGParser.LB);
					}
					}
					this.state = 724;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 734;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)) | (1 << (BNGParser.LBRACKET - 185)) | (1 << (BNGParser.AT - 185)))) !== 0)) {
					{
					{
					this.state = 726;
					this.reaction_rule_def();
					this.state = 728;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					do {
						{
						{
						this.state = 727;
						this.match(BNGParser.LB);
						}
						}
						this.state = 730;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					} while (_la === BNGParser.LB);
					}
					}
					this.state = 736;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 737;
				this.match(BNGParser.END);
				this.state = 738;
				this.match(BNGParser.REACTION_RULES);
				this.state = 742;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 739;
					this.match(BNGParser.LB);
					}
					}
					this.state = 744;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 745;
				this.match(BNGParser.BEGIN);
				this.state = 746;
				this.match(BNGParser.REACTIONS);
				this.state = 748;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 747;
					this.match(BNGParser.LB);
					}
					}
					this.state = 750;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				this.state = 760;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)) | (1 << (BNGParser.LBRACKET - 185)) | (1 << (BNGParser.AT - 185)))) !== 0)) {
					{
					{
					this.state = 752;
					this.reaction_rule_def();
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
					}
					}
					this.state = 762;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 763;
				this.match(BNGParser.END);
				this.state = 764;
				this.match(BNGParser.REACTIONS);
				this.state = 768;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.LB) {
					{
					{
					this.state = 765;
					this.match(BNGParser.LB);
					}
					}
					this.state = 770;
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
		this.enterRule(_localctx, 68, BNGParser.RULE_reaction_rule_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 774;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 106, this._ctx) ) {
			case 1:
				{
				this.state = 773;
				this.label_def();
				}
				break;
			}
			this.state = 780;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET) {
				{
				this.state = 776;
				this.match(BNGParser.LBRACKET);
				this.state = 777;
				this.rule_modifiers();
				this.state = 778;
				this.match(BNGParser.RBRACKET);
				}
			}

			this.state = 782;
			this.reactant_patterns();
			this.state = 783;
			this.reaction_sign();
			this.state = 784;
			this.product_patterns();
			this.state = 785;
			this.rate_law();
			this.state = 787;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 27)) & ~0x1F) === 0 && ((1 << (_la - 27)) & ((1 << (BNGParser.MATCHONCE - 27)) | (1 << (BNGParser.DELETEMOLECULES - 27)) | (1 << (BNGParser.MOVECONNECTED - 27)) | (1 << (BNGParser.INCLUDE_REACTANTS - 27)) | (1 << (BNGParser.INCLUDE_PRODUCTS - 27)) | (1 << (BNGParser.EXCLUDE_REACTANTS - 27)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 27)) | (1 << (BNGParser.TOTALRATE - 27)))) !== 0) || _la === BNGParser.PRIORITY) {
				{
				this.state = 786;
				this.rule_modifiers();
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
	public label_def(): Label_defContext {
		let _localctx: Label_defContext = new Label_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 70, BNGParser.RULE_label_def);
		let _la: number;
		try {
			this.state = 804;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 112, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 789;
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
				this.state = 799;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (((((_la - 185)) & ~0x1F) === 0 && ((1 << (_la - 185)) & ((1 << (BNGParser.INT - 185)) | (1 << (BNGParser.STRING - 185)) | (1 << (BNGParser.LPAREN - 185)))) !== 0)) {
					{
					this.state = 797;
					this._errHandler.sync(this);
					switch (this._input.LA(1)) {
					case BNGParser.STRING:
						{
						this.state = 790;
						this.match(BNGParser.STRING);
						}
						break;
					case BNGParser.INT:
						{
						this.state = 791;
						this.match(BNGParser.INT);
						}
						break;
					case BNGParser.LPAREN:
						{
						this.state = 792;
						this.match(BNGParser.LPAREN);
						this.state = 794;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
						if (_la === BNGParser.STRING) {
							{
							this.state = 793;
							this.match(BNGParser.STRING);
							}
						}

						this.state = 796;
						this.match(BNGParser.RPAREN);
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					}
					this.state = 801;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 802;
				this.match(BNGParser.COLON);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 803;
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
		this.enterRule(_localctx, 72, BNGParser.RULE_reactant_patterns);
		let _la: number;
		try {
			this.state = 815;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
			case BNGParser.AT:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 806;
				this.species_def();
				this.state = 811;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === BNGParser.PLUS) {
					{
					{
					this.state = 807;
					this.match(BNGParser.PLUS);
					this.state = 808;
					this.species_def();
					}
					}
					this.state = 813;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 814;
				this.match(BNGParser.INT);
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
	public product_patterns(): Product_patternsContext {
		let _localctx: Product_patternsContext = new Product_patternsContext(this._ctx, this.state);
		this.enterRule(_localctx, 74, BNGParser.RULE_product_patterns);
		try {
			let _alt: number;
			this.state = 826;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.STRING:
			case BNGParser.AT:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 817;
				this.species_def();
				this.state = 822;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 115, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 818;
						this.match(BNGParser.PLUS);
						this.state = 819;
						this.species_def();
						}
						}
					}
					this.state = 824;
					this._errHandler.sync(this);
					_alt = this.interpreter.adaptivePredict(this._input, 115, this._ctx);
				}
				}
				break;
			case BNGParser.INT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 825;
				this.match(BNGParser.INT);
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
	public reaction_sign(): Reaction_signContext {
		let _localctx: Reaction_signContext = new Reaction_signContext(this._ctx, this.state);
		this.enterRule(_localctx, 76, BNGParser.RULE_reaction_sign);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 828;
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
		this.enterRule(_localctx, 78, BNGParser.RULE_rate_law);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 830;
			this.expression();
			this.state = 833;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.COMMA) {
				{
				this.state = 831;
				this.match(BNGParser.COMMA);
				this.state = 832;
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
		this.enterRule(_localctx, 80, BNGParser.RULE_rule_modifiers);
		try {
			this.state = 870;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.DELETEMOLECULES:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 835;
				this.match(BNGParser.DELETEMOLECULES);
				}
				break;
			case BNGParser.MOVECONNECTED:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 836;
				this.match(BNGParser.MOVECONNECTED);
				}
				break;
			case BNGParser.MATCHONCE:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 837;
				this.match(BNGParser.MATCHONCE);
				}
				break;
			case BNGParser.TOTALRATE:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 838;
				this.match(BNGParser.TOTALRATE);
				}
				break;
			case BNGParser.PRIORITY:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 839;
				this.match(BNGParser.PRIORITY);
				this.state = 840;
				this.match(BNGParser.BECOMES);
				this.state = 841;
				this.expression();
				}
				break;
			case BNGParser.INCLUDE_REACTANTS:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 842;
				this.match(BNGParser.INCLUDE_REACTANTS);
				this.state = 843;
				this.match(BNGParser.LPAREN);
				this.state = 844;
				this.match(BNGParser.INT);
				this.state = 845;
				this.match(BNGParser.COMMA);
				this.state = 846;
				this.pattern_list();
				this.state = 847;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.EXCLUDE_REACTANTS:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 849;
				this.match(BNGParser.EXCLUDE_REACTANTS);
				this.state = 850;
				this.match(BNGParser.LPAREN);
				this.state = 851;
				this.match(BNGParser.INT);
				this.state = 852;
				this.match(BNGParser.COMMA);
				this.state = 853;
				this.pattern_list();
				this.state = 854;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.INCLUDE_PRODUCTS:
				this.enterOuterAlt(_localctx, 8);
				{
				this.state = 856;
				this.match(BNGParser.INCLUDE_PRODUCTS);
				this.state = 857;
				this.match(BNGParser.LPAREN);
				this.state = 858;
				this.match(BNGParser.INT);
				this.state = 859;
				this.match(BNGParser.COMMA);
				this.state = 860;
				this.pattern_list();
				this.state = 861;
				this.match(BNGParser.RPAREN);
				}
				break;
			case BNGParser.EXCLUDE_PRODUCTS:
				this.enterOuterAlt(_localctx, 9);
				{
				this.state = 863;
				this.match(BNGParser.EXCLUDE_PRODUCTS);
				this.state = 864;
				this.match(BNGParser.LPAREN);
				this.state = 865;
				this.match(BNGParser.INT);
				this.state = 866;
				this.match(BNGParser.COMMA);
				this.state = 867;
				this.pattern_list();
				this.state = 868;
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
		this.enterRule(_localctx, 82, BNGParser.RULE_pattern_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 872;
			this.species_def();
			this.state = 877;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 873;
				this.match(BNGParser.COMMA);
				this.state = 874;
				this.species_def();
				}
				}
				this.state = 879;
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
		this.enterRule(_localctx, 84, BNGParser.RULE_functions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 880;
			this.match(BNGParser.BEGIN);
			this.state = 881;
			this.match(BNGParser.FUNCTIONS);
			this.state = 883;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 882;
				this.match(BNGParser.LB);
				}
				}
				this.state = 885;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 895;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING) {
				{
				{
				this.state = 887;
				this.function_def();
				this.state = 889;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 888;
					this.match(BNGParser.LB);
					}
					}
					this.state = 891;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 897;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 898;
			this.match(BNGParser.END);
			this.state = 899;
			this.match(BNGParser.FUNCTIONS);
			this.state = 903;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 900;
				this.match(BNGParser.LB);
				}
				}
				this.state = 905;
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
		this.enterRule(_localctx, 86, BNGParser.RULE_function_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 908;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 124, this._ctx) ) {
			case 1:
				{
				this.state = 906;
				this.match(BNGParser.STRING);
				this.state = 907;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 910;
			this.match(BNGParser.STRING);
			this.state = 916;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 126, this._ctx) ) {
			case 1:
				{
				this.state = 911;
				this.match(BNGParser.LPAREN);
				this.state = 913;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === BNGParser.STRING) {
					{
					this.state = 912;
					this.param_list();
					}
				}

				this.state = 915;
				this.match(BNGParser.RPAREN);
				}
				break;
			}
			this.state = 919;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.BECOMES) {
				{
				this.state = 918;
				this.match(BNGParser.BECOMES);
				}
			}

			this.state = 921;
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
		this.enterRule(_localctx, 88, BNGParser.RULE_param_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 923;
			this.match(BNGParser.STRING);
			this.state = 928;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 924;
				this.match(BNGParser.COMMA);
				this.state = 925;
				this.match(BNGParser.STRING);
				}
				}
				this.state = 930;
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
		this.enterRule(_localctx, 90, BNGParser.RULE_compartments_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 931;
			this.match(BNGParser.BEGIN);
			this.state = 932;
			this.match(BNGParser.COMPARTMENTS);
			this.state = 934;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 933;
				this.match(BNGParser.LB);
				}
				}
				this.state = 936;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 946;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING) {
				{
				{
				this.state = 938;
				this.compartment_def();
				this.state = 940;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 939;
					this.match(BNGParser.LB);
					}
					}
					this.state = 942;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 948;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 949;
			this.match(BNGParser.END);
			this.state = 950;
			this.match(BNGParser.COMPARTMENTS);
			this.state = 954;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 951;
				this.match(BNGParser.LB);
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
	public compartment_def(): Compartment_defContext {
		let _localctx: Compartment_defContext = new Compartment_defContext(this._ctx, this.state);
		this.enterRule(_localctx, 92, BNGParser.RULE_compartment_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 959;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 133, this._ctx) ) {
			case 1:
				{
				this.state = 957;
				this.match(BNGParser.STRING);
				this.state = 958;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 961;
			this.match(BNGParser.STRING);
			this.state = 962;
			this.match(BNGParser.INT);
			this.state = 963;
			this.expression();
			this.state = 965;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 964;
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
		this.enterRule(_localctx, 94, BNGParser.RULE_energy_patterns_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 967;
			this.match(BNGParser.BEGIN);
			this.state = 968;
			this.match(BNGParser.ENERGY);
			this.state = 969;
			this.match(BNGParser.PATTERNS);
			this.state = 971;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 970;
				this.match(BNGParser.LB);
				}
				}
				this.state = 973;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 983;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING || _la === BNGParser.AT) {
				{
				{
				this.state = 975;
				this.energy_pattern_def();
				this.state = 977;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 976;
					this.match(BNGParser.LB);
					}
					}
					this.state = 979;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 985;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 986;
			this.match(BNGParser.END);
			this.state = 987;
			this.match(BNGParser.ENERGY);
			this.state = 988;
			this.match(BNGParser.PATTERNS);
			this.state = 992;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 989;
				this.match(BNGParser.LB);
				}
				}
				this.state = 994;
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
		this.enterRule(_localctx, 96, BNGParser.RULE_energy_pattern_def);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 997;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 139, this._ctx) ) {
			case 1:
				{
				this.state = 995;
				this.match(BNGParser.STRING);
				this.state = 996;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 999;
			this.species_def();
			this.state = 1000;
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
		this.enterRule(_localctx, 98, BNGParser.RULE_population_maps_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1002;
			this.match(BNGParser.BEGIN);
			this.state = 1003;
			this.match(BNGParser.POPULATION);
			this.state = 1004;
			this.match(BNGParser.MAPS);
			this.state = 1006;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1005;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1008;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1018;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.STRING || _la === BNGParser.AT) {
				{
				{
				this.state = 1010;
				this.population_map_def();
				this.state = 1012;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1011;
					this.match(BNGParser.LB);
					}
					}
					this.state = 1014;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while (_la === BNGParser.LB);
				}
				}
				this.state = 1020;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1021;
			this.match(BNGParser.END);
			this.state = 1022;
			this.match(BNGParser.POPULATION);
			this.state = 1023;
			this.match(BNGParser.MAPS);
			this.state = 1027;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1024;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1029;
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
		this.enterRule(_localctx, 100, BNGParser.RULE_population_map_def);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1032;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 144, this._ctx) ) {
			case 1:
				{
				this.state = 1030;
				this.match(BNGParser.STRING);
				this.state = 1031;
				this.match(BNGParser.COLON);
				}
				break;
			}
			this.state = 1034;
			this.species_def();
			this.state = 1035;
			this.match(BNGParser.UNI_REACTION_SIGN);
			this.state = 1036;
			this.match(BNGParser.STRING);
			this.state = 1037;
			this.match(BNGParser.LPAREN);
			this.state = 1039;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.STRING) {
				{
				this.state = 1038;
				this.param_list();
				}
			}

			this.state = 1041;
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
	public actions_block(): Actions_blockContext {
		let _localctx: Actions_blockContext = new Actions_blockContext(this._ctx, this.state);
		this.enterRule(_localctx, 102, BNGParser.RULE_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1044;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1043;
				this.action_command();
				}
				}
				this.state = 1046;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.GENERATENETWORK - 41)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 41)) | (1 << (BNGParser.SIMULATE - 41)))) !== 0) || ((((_la - 75)) & ~0x1F) === 0 && ((1 << (_la - 75)) & ((1 << (BNGParser.SIMULATE_ODE - 75)) | (1 << (BNGParser.SIMULATE_SSA - 75)) | (1 << (BNGParser.SIMULATE_PLA - 75)) | (1 << (BNGParser.SIMULATE_NF - 75)) | (1 << (BNGParser.SIMULATE_RM - 75)) | (1 << (BNGParser.PARAMETER_SCAN - 75)) | (1 << (BNGParser.BIFURCATE - 75)) | (1 << (BNGParser.READFILE - 75)))) !== 0) || ((((_la - 108)) & ~0x1F) === 0 && ((1 << (_la - 108)) & ((1 << (BNGParser.VISUALIZE - 108)) | (1 << (BNGParser.WRITEFILE - 108)) | (1 << (BNGParser.WRITEMODEL - 108)) | (1 << (BNGParser.WRITEXML - 108)) | (1 << (BNGParser.WRITENETWORK - 108)) | (1 << (BNGParser.WRITESBML - 108)) | (1 << (BNGParser.WRITELATEX - 108)) | (1 << (BNGParser.WRITEMFILE - 108)) | (1 << (BNGParser.WRITEMEXFILE - 108)) | (1 << (BNGParser.SETCONCENTRATION - 108)))) !== 0) || ((((_la - 140)) & ~0x1F) === 0 && ((1 << (_la - 140)) & ((1 << (BNGParser.ADDCONCENTRATION - 140)) | (1 << (BNGParser.SAVECONCENTRATIONS - 140)) | (1 << (BNGParser.RESETCONCENTRATIONS - 140)) | (1 << (BNGParser.SETPARAMETER - 140)) | (1 << (BNGParser.SAVEPARAMETERS - 140)) | (1 << (BNGParser.RESETPARAMETERS - 140)) | (1 << (BNGParser.QUIT - 140)))) !== 0));
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
		this.enterRule(_localctx, 104, BNGParser.RULE_wrapped_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1048;
			this.match(BNGParser.BEGIN);
			this.state = 1049;
			this.match(BNGParser.ACTIONS);
			this.state = 1051;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1050;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1053;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1058;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.GENERATENETWORK - 41)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 41)) | (1 << (BNGParser.SIMULATE - 41)))) !== 0) || ((((_la - 75)) & ~0x1F) === 0 && ((1 << (_la - 75)) & ((1 << (BNGParser.SIMULATE_ODE - 75)) | (1 << (BNGParser.SIMULATE_SSA - 75)) | (1 << (BNGParser.SIMULATE_PLA - 75)) | (1 << (BNGParser.SIMULATE_NF - 75)) | (1 << (BNGParser.SIMULATE_RM - 75)) | (1 << (BNGParser.PARAMETER_SCAN - 75)) | (1 << (BNGParser.BIFURCATE - 75)) | (1 << (BNGParser.READFILE - 75)))) !== 0) || ((((_la - 108)) & ~0x1F) === 0 && ((1 << (_la - 108)) & ((1 << (BNGParser.VISUALIZE - 108)) | (1 << (BNGParser.WRITEFILE - 108)) | (1 << (BNGParser.WRITEMODEL - 108)) | (1 << (BNGParser.WRITEXML - 108)) | (1 << (BNGParser.WRITENETWORK - 108)) | (1 << (BNGParser.WRITESBML - 108)) | (1 << (BNGParser.WRITELATEX - 108)) | (1 << (BNGParser.WRITEMFILE - 108)) | (1 << (BNGParser.WRITEMEXFILE - 108)) | (1 << (BNGParser.SETCONCENTRATION - 108)))) !== 0) || ((((_la - 140)) & ~0x1F) === 0 && ((1 << (_la - 140)) & ((1 << (BNGParser.ADDCONCENTRATION - 140)) | (1 << (BNGParser.SAVECONCENTRATIONS - 140)) | (1 << (BNGParser.RESETCONCENTRATIONS - 140)) | (1 << (BNGParser.SETPARAMETER - 140)) | (1 << (BNGParser.SAVEPARAMETERS - 140)) | (1 << (BNGParser.RESETPARAMETERS - 140)) | (1 << (BNGParser.QUIT - 140)))) !== 0)) {
				{
				{
				this.state = 1055;
				this.action_command();
				}
				}
				this.state = 1060;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1061;
			this.match(BNGParser.END);
			this.state = 1062;
			this.match(BNGParser.ACTIONS);
			this.state = 1066;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1063;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1068;
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
		this.enterRule(_localctx, 106, BNGParser.RULE_begin_actions_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1069;
			this.match(BNGParser.BEGIN);
			this.state = 1070;
			this.match(BNGParser.ACTIONS);
			this.state = 1072;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 1071;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1074;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === BNGParser.LB);
			this.state = 1079;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 41)) & ~0x1F) === 0 && ((1 << (_la - 41)) & ((1 << (BNGParser.GENERATENETWORK - 41)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 41)) | (1 << (BNGParser.SIMULATE - 41)))) !== 0) || ((((_la - 75)) & ~0x1F) === 0 && ((1 << (_la - 75)) & ((1 << (BNGParser.SIMULATE_ODE - 75)) | (1 << (BNGParser.SIMULATE_SSA - 75)) | (1 << (BNGParser.SIMULATE_PLA - 75)) | (1 << (BNGParser.SIMULATE_NF - 75)) | (1 << (BNGParser.SIMULATE_RM - 75)) | (1 << (BNGParser.PARAMETER_SCAN - 75)) | (1 << (BNGParser.BIFURCATE - 75)) | (1 << (BNGParser.READFILE - 75)))) !== 0) || ((((_la - 108)) & ~0x1F) === 0 && ((1 << (_la - 108)) & ((1 << (BNGParser.VISUALIZE - 108)) | (1 << (BNGParser.WRITEFILE - 108)) | (1 << (BNGParser.WRITEMODEL - 108)) | (1 << (BNGParser.WRITEXML - 108)) | (1 << (BNGParser.WRITENETWORK - 108)) | (1 << (BNGParser.WRITESBML - 108)) | (1 << (BNGParser.WRITELATEX - 108)) | (1 << (BNGParser.WRITEMFILE - 108)) | (1 << (BNGParser.WRITEMEXFILE - 108)) | (1 << (BNGParser.SETCONCENTRATION - 108)))) !== 0) || ((((_la - 140)) & ~0x1F) === 0 && ((1 << (_la - 140)) & ((1 << (BNGParser.ADDCONCENTRATION - 140)) | (1 << (BNGParser.SAVECONCENTRATIONS - 140)) | (1 << (BNGParser.RESETCONCENTRATIONS - 140)) | (1 << (BNGParser.SETPARAMETER - 140)) | (1 << (BNGParser.SAVEPARAMETERS - 140)) | (1 << (BNGParser.RESETPARAMETERS - 140)) | (1 << (BNGParser.QUIT - 140)))) !== 0)) {
				{
				{
				this.state = 1076;
				this.action_command();
				}
				}
				this.state = 1081;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 1082;
			this.match(BNGParser.END);
			this.state = 1083;
			this.match(BNGParser.ACTIONS);
			this.state = 1087;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1084;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1089;
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
		this.enterRule(_localctx, 108, BNGParser.RULE_action_command);
		try {
			this.state = 1095;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.GENERATENETWORK:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1090;
				this.generate_network_cmd();
				}
				break;
			case BNGParser.SIMULATE:
			case BNGParser.SIMULATE_ODE:
			case BNGParser.SIMULATE_SSA:
			case BNGParser.SIMULATE_PLA:
			case BNGParser.SIMULATE_NF:
			case BNGParser.SIMULATE_RM:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1091;
				this.simulate_cmd();
				}
				break;
			case BNGParser.WRITEFILE:
			case BNGParser.WRITEMODEL:
			case BNGParser.WRITEXML:
			case BNGParser.WRITENETWORK:
			case BNGParser.WRITESBML:
			case BNGParser.WRITELATEX:
			case BNGParser.WRITEMFILE:
			case BNGParser.WRITEMEXFILE:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1092;
				this.write_cmd();
				}
				break;
			case BNGParser.SETCONCENTRATION:
			case BNGParser.ADDCONCENTRATION:
			case BNGParser.SETPARAMETER:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1093;
				this.set_cmd();
				}
				break;
			case BNGParser.GENERATEHYBRIDMODEL:
			case BNGParser.PARAMETER_SCAN:
			case BNGParser.BIFURCATE:
			case BNGParser.READFILE:
			case BNGParser.VISUALIZE:
			case BNGParser.SAVECONCENTRATIONS:
			case BNGParser.RESETCONCENTRATIONS:
			case BNGParser.SAVEPARAMETERS:
			case BNGParser.RESETPARAMETERS:
			case BNGParser.QUIT:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1094;
				this.other_action_cmd();
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
	public generate_network_cmd(): Generate_network_cmdContext {
		let _localctx: Generate_network_cmdContext = new Generate_network_cmdContext(this._ctx, this.state);
		this.enterRule(_localctx, 110, BNGParser.RULE_generate_network_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1097;
			this.match(BNGParser.GENERATENETWORK);
			this.state = 1098;
			this.match(BNGParser.LPAREN);
			this.state = 1100;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET || _la === BNGParser.DBQUOTES) {
				{
				this.state = 1099;
				this.action_args();
				}
			}

			this.state = 1102;
			this.match(BNGParser.RPAREN);
			this.state = 1104;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1103;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1109;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1106;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1111;
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
		this.enterRule(_localctx, 112, BNGParser.RULE_simulate_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1112;
			_la = this._input.LA(1);
			if (!(((((_la - 51)) & ~0x1F) === 0 && ((1 << (_la - 51)) & ((1 << (BNGParser.SIMULATE - 51)) | (1 << (BNGParser.SIMULATE_ODE - 51)) | (1 << (BNGParser.SIMULATE_SSA - 51)) | (1 << (BNGParser.SIMULATE_PLA - 51)))) !== 0) || _la === BNGParser.SIMULATE_NF || _la === BNGParser.SIMULATE_RM)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1113;
			this.match(BNGParser.LPAREN);
			this.state = 1115;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET || _la === BNGParser.DBQUOTES) {
				{
				this.state = 1114;
				this.action_args();
				}
			}

			this.state = 1117;
			this.match(BNGParser.RPAREN);
			this.state = 1119;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1118;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1124;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1121;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1126;
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
		this.enterRule(_localctx, 114, BNGParser.RULE_write_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1127;
			_la = this._input.LA(1);
			if (!(((((_la - 116)) & ~0x1F) === 0 && ((1 << (_la - 116)) & ((1 << (BNGParser.WRITEFILE - 116)) | (1 << (BNGParser.WRITEMODEL - 116)) | (1 << (BNGParser.WRITEXML - 116)) | (1 << (BNGParser.WRITENETWORK - 116)) | (1 << (BNGParser.WRITESBML - 116)) | (1 << (BNGParser.WRITELATEX - 116)) | (1 << (BNGParser.WRITEMFILE - 116)) | (1 << (BNGParser.WRITEMEXFILE - 116)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1128;
			this.match(BNGParser.LPAREN);
			this.state = 1130;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET || _la === BNGParser.DBQUOTES) {
				{
				this.state = 1129;
				this.action_args();
				}
			}

			this.state = 1132;
			this.match(BNGParser.RPAREN);
			this.state = 1134;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1133;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1139;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1136;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1141;
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
		this.enterRule(_localctx, 116, BNGParser.RULE_set_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1142;
			_la = this._input.LA(1);
			if (!(((((_la - 139)) & ~0x1F) === 0 && ((1 << (_la - 139)) & ((1 << (BNGParser.SETCONCENTRATION - 139)) | (1 << (BNGParser.ADDCONCENTRATION - 139)) | (1 << (BNGParser.SETPARAMETER - 139)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1143;
			this.match(BNGParser.LPAREN);
			this.state = 1144;
			this.match(BNGParser.DBQUOTES);
			this.state = 1151;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 164, this._ctx) ) {
			case 1:
				{
				this.state = 1145;
				this.species_def();
				}
				break;

			case 2:
				{
				this.state = 1147;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				do {
					{
					{
					this.state = 1146;
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
					this.state = 1149;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB);
				}
				break;
			}
			this.state = 1153;
			this.match(BNGParser.DBQUOTES);
			this.state = 1154;
			this.match(BNGParser.COMMA);
			this.state = 1164;
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
				this.state = 1155;
				this.expression();
				}
				break;
			case BNGParser.DBQUOTES:
				{
				this.state = 1156;
				this.match(BNGParser.DBQUOTES);
				this.state = 1160;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 1157;
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
					this.state = 1162;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1163;
				this.match(BNGParser.DBQUOTES);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this.state = 1166;
			this.match(BNGParser.RPAREN);
			this.state = 1168;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1167;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1173;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1170;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1175;
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
		this.enterRule(_localctx, 118, BNGParser.RULE_other_action_cmd);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1176;
			_la = this._input.LA(1);
			if (!(_la === BNGParser.GENERATEHYBRIDMODEL || ((((_la - 95)) & ~0x1F) === 0 && ((1 << (_la - 95)) & ((1 << (BNGParser.PARAMETER_SCAN - 95)) | (1 << (BNGParser.BIFURCATE - 95)) | (1 << (BNGParser.READFILE - 95)) | (1 << (BNGParser.VISUALIZE - 95)))) !== 0) || ((((_la - 141)) & ~0x1F) === 0 && ((1 << (_la - 141)) & ((1 << (BNGParser.SAVECONCENTRATIONS - 141)) | (1 << (BNGParser.RESETCONCENTRATIONS - 141)) | (1 << (BNGParser.SAVEPARAMETERS - 141)) | (1 << (BNGParser.RESETPARAMETERS - 141)) | (1 << (BNGParser.QUIT - 141)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1177;
			this.match(BNGParser.LPAREN);
			this.state = 1179;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.LBRACKET || _la === BNGParser.DBQUOTES) {
				{
				this.state = 1178;
				this.action_args();
				}
			}

			this.state = 1181;
			this.match(BNGParser.RPAREN);
			this.state = 1183;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.SEMI) {
				{
				this.state = 1182;
				this.match(BNGParser.SEMI);
				}
			}

			this.state = 1188;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LB) {
				{
				{
				this.state = 1185;
				this.match(BNGParser.LB);
				}
				}
				this.state = 1190;
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
		this.enterRule(_localctx, 120, BNGParser.RULE_action_args);
		let _la: number;
		try {
			this.state = 1204;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case BNGParser.LBRACKET:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1191;
				this.match(BNGParser.LBRACKET);
				this.state = 1193;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)))) !== 0) || _la === BNGParser.STRING) {
					{
					this.state = 1192;
					this.action_arg_list();
					}
				}

				this.state = 1195;
				this.match(BNGParser.RBRACKET);
				}
				break;
			case BNGParser.DBQUOTES:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1196;
				this.match(BNGParser.DBQUOTES);
				this.state = 1200;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 1197;
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
					this.state = 1202;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1203;
				this.match(BNGParser.DBQUOTES);
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
	public action_arg_list(): Action_arg_listContext {
		let _localctx: Action_arg_listContext = new Action_arg_listContext(this._ctx, this.state);
		this.enterRule(_localctx, 122, BNGParser.RULE_action_arg_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1206;
			this.action_arg();
			this.state = 1211;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1207;
				this.match(BNGParser.COMMA);
				this.state = 1208;
				this.action_arg();
				}
				}
				this.state = 1213;
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
		this.enterRule(_localctx, 124, BNGParser.RULE_action_arg);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1214;
			this.arg_name();
			this.state = 1215;
			this.match(BNGParser.ASSIGNS);
			this.state = 1216;
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
		this.enterRule(_localctx, 126, BNGParser.RULE_action_arg_value);
		let _la: number;
		try {
			this.state = 1245;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 179, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1218;
				this.expression();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1219;
				this.keyword_as_value();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1220;
				this.match(BNGParser.DBQUOTES);
				this.state = 1224;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.SQUOTE - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 1221;
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
					this.state = 1226;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1227;
				this.match(BNGParser.DBQUOTES);
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1228;
				this.match(BNGParser.SQUOTE);
				this.state = 1232;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << BNGParser.LINE_COMMENT) | (1 << BNGParser.LB) | (1 << BNGParser.WS) | (1 << BNGParser.BEGIN) | (1 << BNGParser.END) | (1 << BNGParser.MODEL) | (1 << BNGParser.PARAMETERS) | (1 << BNGParser.COMPARTMENTS) | (1 << BNGParser.MOLECULE) | (1 << BNGParser.MOLECULES) | (1 << BNGParser.TYPES) | (1 << BNGParser.SEED) | (1 << BNGParser.SPECIES) | (1 << BNGParser.OBSERVABLES) | (1 << BNGParser.FUNCTIONS) | (1 << BNGParser.REACTION) | (1 << BNGParser.REACTIONS) | (1 << BNGParser.RULES) | (1 << BNGParser.REACTION_RULES) | (1 << BNGParser.MOLECULE_TYPES) | (1 << BNGParser.GROUPS) | (1 << BNGParser.ACTIONS) | (1 << BNGParser.POPULATION) | (1 << BNGParser.MAPS) | (1 << BNGParser.ENERGY) | (1 << BNGParser.PATTERNS) | (1 << BNGParser.MATCHONCE) | (1 << BNGParser.DELETEMOLECULES) | (1 << BNGParser.MOVECONNECTED) | (1 << BNGParser.INCLUDE_REACTANTS) | (1 << BNGParser.INCLUDE_PRODUCTS))) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & ((1 << (BNGParser.EXCLUDE_REACTANTS - 32)) | (1 << (BNGParser.EXCLUDE_PRODUCTS - 32)) | (1 << (BNGParser.TOTALRATE - 32)) | (1 << (BNGParser.VERSION - 32)) | (1 << (BNGParser.SET_OPTION - 32)) | (1 << (BNGParser.SET_MODEL_NAME - 32)) | (1 << (BNGParser.SUBSTANCEUNITS - 32)) | (1 << (BNGParser.PREFIX - 32)) | (1 << (BNGParser.SUFFIX - 32)) | (1 << (BNGParser.GENERATENETWORK - 32)) | (1 << (BNGParser.OVERWRITE - 32)) | (1 << (BNGParser.MAX_AGG - 32)) | (1 << (BNGParser.MAX_ITER - 32)) | (1 << (BNGParser.MAX_STOICH - 32)) | (1 << (BNGParser.PRINT_ITER - 32)) | (1 << (BNGParser.CHECK_ISO - 32)) | (1 << (BNGParser.GENERATEHYBRIDMODEL - 32)) | (1 << (BNGParser.SAFE - 32)) | (1 << (BNGParser.EXECUTE - 32)) | (1 << (BNGParser.SIMULATE - 32)) | (1 << (BNGParser.METHOD - 32)) | (1 << (BNGParser.ODE - 32)) | (1 << (BNGParser.SSA - 32)) | (1 << (BNGParser.PLA - 32)) | (1 << (BNGParser.NF - 32)) | (1 << (BNGParser.VERBOSE - 32)) | (1 << (BNGParser.NETFILE - 32)) | (1 << (BNGParser.ARGFILE - 32)) | (1 << (BNGParser.CONTINUE - 32)) | (1 << (BNGParser.T_START - 32)) | (1 << (BNGParser.T_END - 32)) | (1 << (BNGParser.N_STEPS - 32)))) !== 0) || ((((_la - 64)) & ~0x1F) === 0 && ((1 << (_la - 64)) & ((1 << (BNGParser.N_OUTPUT_STEPS - 64)) | (1 << (BNGParser.MAX_SIM_STEPS - 64)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 64)) | (1 << (BNGParser.SAMPLE_TIMES - 64)) | (1 << (BNGParser.SAVE_PROGRESS - 64)) | (1 << (BNGParser.PRINT_CDAT - 64)) | (1 << (BNGParser.PRINT_FUNCTIONS - 64)) | (1 << (BNGParser.PRINT_NET - 64)) | (1 << (BNGParser.PRINT_END - 64)) | (1 << (BNGParser.STOP_IF - 64)) | (1 << (BNGParser.PRINT_ON_STOP - 64)) | (1 << (BNGParser.SIMULATE_ODE - 64)) | (1 << (BNGParser.ATOL - 64)) | (1 << (BNGParser.RTOL - 64)) | (1 << (BNGParser.STEADY_STATE - 64)) | (1 << (BNGParser.SPARSE - 64)) | (1 << (BNGParser.SIMULATE_SSA - 64)) | (1 << (BNGParser.SIMULATE_PLA - 64)) | (1 << (BNGParser.PLA_CONFIG - 64)) | (1 << (BNGParser.PLA_OUTPUT - 64)) | (1 << (BNGParser.SIMULATE_NF - 64)) | (1 << (BNGParser.SIMULATE_RM - 64)) | (1 << (BNGParser.PARAM - 64)) | (1 << (BNGParser.COMPLEX - 64)) | (1 << (BNGParser.GET_FINAL_STATE - 64)) | (1 << (BNGParser.GML - 64)) | (1 << (BNGParser.NOCSLF - 64)) | (1 << (BNGParser.NOTF - 64)) | (1 << (BNGParser.BINARY_OUTPUT - 64)) | (1 << (BNGParser.UTL - 64)) | (1 << (BNGParser.EQUIL - 64)) | (1 << (BNGParser.PARAMETER_SCAN - 64)))) !== 0) || ((((_la - 96)) & ~0x1F) === 0 && ((1 << (_la - 96)) & ((1 << (BNGParser.BIFURCATE - 96)) | (1 << (BNGParser.PARAMETER - 96)) | (1 << (BNGParser.PAR_MIN - 96)) | (1 << (BNGParser.PAR_MAX - 96)) | (1 << (BNGParser.N_SCAN_PTS - 96)) | (1 << (BNGParser.LOG_SCALE - 96)) | (1 << (BNGParser.RESET_CONC - 96)) | (1 << (BNGParser.READFILE - 96)) | (1 << (BNGParser.FILE - 96)) | (1 << (BNGParser.ATOMIZE - 96)) | (1 << (BNGParser.BLOCKS - 96)) | (1 << (BNGParser.SKIPACTIONS - 96)) | (1 << (BNGParser.VISUALIZE - 96)) | (1 << (BNGParser.TYPE - 96)) | (1 << (BNGParser.BACKGROUND - 96)) | (1 << (BNGParser.COLLAPSE - 96)) | (1 << (BNGParser.OPTS - 96)) | (1 << (BNGParser.WRITESSC - 96)) | (1 << (BNGParser.WRITESSCCFG - 96)) | (1 << (BNGParser.FORMAT - 96)) | (1 << (BNGParser.WRITEFILE - 96)) | (1 << (BNGParser.WRITEMODEL - 96)) | (1 << (BNGParser.WRITEXML - 96)) | (1 << (BNGParser.WRITENETWORK - 96)) | (1 << (BNGParser.WRITESBML - 96)) | (1 << (BNGParser.WRITEMDL - 96)) | (1 << (BNGParser.WRITELATEX - 96)) | (1 << (BNGParser.INCLUDE_MODEL - 96)) | (1 << (BNGParser.INCLUDE_NETWORK - 96)) | (1 << (BNGParser.PRETTY_FORMATTING - 96)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 96)) | (1 << (BNGParser.TEXTREACTION - 96)))) !== 0) || ((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & ((1 << (BNGParser.TEXTSPECIES - 128)) | (1 << (BNGParser.WRITEMFILE - 128)) | (1 << (BNGParser.WRITEMEXFILE - 128)) | (1 << (BNGParser.BDF - 128)) | (1 << (BNGParser.MAX_STEP - 128)) | (1 << (BNGParser.MAXORDER - 128)) | (1 << (BNGParser.STATS - 128)) | (1 << (BNGParser.MAX_NUM_STEPS - 128)) | (1 << (BNGParser.MAX_ERR_TEST_FAILS - 128)) | (1 << (BNGParser.MAX_CONV_FAILS - 128)) | (1 << (BNGParser.STIFF - 128)) | (1 << (BNGParser.SETCONCENTRATION - 128)) | (1 << (BNGParser.ADDCONCENTRATION - 128)) | (1 << (BNGParser.SAVECONCENTRATIONS - 128)) | (1 << (BNGParser.RESETCONCENTRATIONS - 128)) | (1 << (BNGParser.SETPARAMETER - 128)) | (1 << (BNGParser.SAVEPARAMETERS - 128)) | (1 << (BNGParser.RESETPARAMETERS - 128)) | (1 << (BNGParser.QUIT - 128)) | (1 << (BNGParser.TRUE - 128)) | (1 << (BNGParser.FALSE - 128)) | (1 << (BNGParser.SAT - 128)) | (1 << (BNGParser.MM - 128)) | (1 << (BNGParser.HILL - 128)) | (1 << (BNGParser.ARRHENIUS - 128)) | (1 << (BNGParser.MRATIO - 128)) | (1 << (BNGParser.TFUN - 128)) | (1 << (BNGParser.FUNCTIONPRODUCT - 128)) | (1 << (BNGParser.PRIORITY - 128)) | (1 << (BNGParser.IF - 128)) | (1 << (BNGParser.EXP - 128)) | (1 << (BNGParser.LN - 128)))) !== 0) || ((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & ((1 << (BNGParser.LOG10 - 160)) | (1 << (BNGParser.LOG2 - 160)) | (1 << (BNGParser.SQRT - 160)) | (1 << (BNGParser.RINT - 160)) | (1 << (BNGParser.ABS - 160)) | (1 << (BNGParser.SIN - 160)) | (1 << (BNGParser.COS - 160)) | (1 << (BNGParser.TAN - 160)) | (1 << (BNGParser.ASIN - 160)) | (1 << (BNGParser.ACOS - 160)) | (1 << (BNGParser.ATAN - 160)) | (1 << (BNGParser.SINH - 160)) | (1 << (BNGParser.COSH - 160)) | (1 << (BNGParser.TANH - 160)) | (1 << (BNGParser.ASINH - 160)) | (1 << (BNGParser.ACOSH - 160)) | (1 << (BNGParser.ATANH - 160)) | (1 << (BNGParser.PI - 160)) | (1 << (BNGParser.EULERIAN - 160)) | (1 << (BNGParser.MIN - 160)) | (1 << (BNGParser.MAX - 160)) | (1 << (BNGParser.SUM - 160)) | (1 << (BNGParser.AVG - 160)) | (1 << (BNGParser.TIME - 160)) | (1 << (BNGParser.FLOAT - 160)) | (1 << (BNGParser.INT - 160)) | (1 << (BNGParser.STRING - 160)) | (1 << (BNGParser.SEMI - 160)) | (1 << (BNGParser.COLON - 160)) | (1 << (BNGParser.LSBRACKET - 160)) | (1 << (BNGParser.RSBRACKET - 160)) | (1 << (BNGParser.LBRACKET - 160)))) !== 0) || ((((_la - 192)) & ~0x1F) === 0 && ((1 << (_la - 192)) & ((1 << (BNGParser.RBRACKET - 192)) | (1 << (BNGParser.COMMA - 192)) | (1 << (BNGParser.DOT - 192)) | (1 << (BNGParser.LPAREN - 192)) | (1 << (BNGParser.RPAREN - 192)) | (1 << (BNGParser.UNI_REACTION_SIGN - 192)) | (1 << (BNGParser.BI_REACTION_SIGN - 192)) | (1 << (BNGParser.DOLLAR - 192)) | (1 << (BNGParser.TILDE - 192)) | (1 << (BNGParser.AT - 192)) | (1 << (BNGParser.GTE - 192)) | (1 << (BNGParser.GT - 192)) | (1 << (BNGParser.LTE - 192)) | (1 << (BNGParser.LT - 192)) | (1 << (BNGParser.ASSIGNS - 192)) | (1 << (BNGParser.EQUALS - 192)) | (1 << (BNGParser.NOT_EQUALS - 192)) | (1 << (BNGParser.BECOMES - 192)) | (1 << (BNGParser.LOGICAL_AND - 192)) | (1 << (BNGParser.LOGICAL_OR - 192)) | (1 << (BNGParser.DIV - 192)) | (1 << (BNGParser.TIMES - 192)) | (1 << (BNGParser.MINUS - 192)) | (1 << (BNGParser.PLUS - 192)) | (1 << (BNGParser.POWER - 192)) | (1 << (BNGParser.MOD - 192)) | (1 << (BNGParser.PIPE - 192)) | (1 << (BNGParser.QMARK - 192)) | (1 << (BNGParser.EMARK - 192)) | (1 << (BNGParser.DBQUOTES - 192)) | (1 << (BNGParser.AMPERSAND - 192)))) !== 0) || _la === BNGParser.VERSION_NUMBER || _la === BNGParser.ULB) {
					{
					{
					this.state = 1229;
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
					this.state = 1234;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 1235;
				this.match(BNGParser.SQUOTE);
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1236;
				this.match(BNGParser.LSBRACKET);
				this.state = 1237;
				this.expression_list();
				this.state = 1238;
				this.match(BNGParser.RSBRACKET);
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 1240;
				this.match(BNGParser.LBRACKET);
				this.state = 1242;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)))) !== 0) || _la === BNGParser.STRING) {
					{
					this.state = 1241;
					this.nested_hash_list();
					}
				}

				this.state = 1244;
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
		this.enterRule(_localctx, 128, BNGParser.RULE_keyword_as_value);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1247;
			_la = this._input.LA(1);
			if (!(((((_la - 42)) & ~0x1F) === 0 && ((1 << (_la - 42)) & ((1 << (BNGParser.OVERWRITE - 42)) | (1 << (BNGParser.SAFE - 42)) | (1 << (BNGParser.EXECUTE - 42)) | (1 << (BNGParser.METHOD - 42)) | (1 << (BNGParser.ODE - 42)) | (1 << (BNGParser.SSA - 42)) | (1 << (BNGParser.PLA - 42)) | (1 << (BNGParser.NF - 42)) | (1 << (BNGParser.VERBOSE - 42)) | (1 << (BNGParser.CONTINUE - 42)))) !== 0) || ((((_la - 78)) & ~0x1F) === 0 && ((1 << (_la - 78)) & ((1 << (BNGParser.STEADY_STATE - 78)) | (1 << (BNGParser.SPARSE - 78)) | (1 << (BNGParser.BINARY_OUTPUT - 78)))) !== 0) || ((((_la - 131)) & ~0x1F) === 0 && ((1 << (_la - 131)) & ((1 << (BNGParser.BDF - 131)) | (1 << (BNGParser.STIFF - 131)) | (1 << (BNGParser.TRUE - 131)) | (1 << (BNGParser.FALSE - 131)))) !== 0))) {
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
		this.enterRule(_localctx, 130, BNGParser.RULE_nested_hash_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1249;
			this.nested_hash_item();
			this.state = 1254;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1250;
				this.match(BNGParser.COMMA);
				this.state = 1251;
				this.nested_hash_item();
				}
				}
				this.state = 1256;
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
		this.enterRule(_localctx, 132, BNGParser.RULE_nested_hash_item);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1259;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 181, this._ctx) ) {
			case 1:
				{
				this.state = 1257;
				this.match(BNGParser.STRING);
				}
				break;

			case 2:
				{
				this.state = 1258;
				this.arg_name();
				}
				break;
			}
			this.state = 1261;
			this.match(BNGParser.ASSIGNS);
			this.state = 1262;
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
		this.enterRule(_localctx, 134, BNGParser.RULE_arg_name);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1264;
			_la = this._input.LA(1);
			if (!(((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)))) !== 0) || _la === BNGParser.STRING)) {
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
		this.enterRule(_localctx, 136, BNGParser.RULE_expression_list);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1266;
			this.expression();
			this.state = 1271;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.COMMA) {
				{
				{
				this.state = 1267;
				this.match(BNGParser.COMMA);
				this.state = 1268;
				this.expression();
				}
				}
				this.state = 1273;
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
		this.enterRule(_localctx, 138, BNGParser.RULE_expression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1274;
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
		this.enterRule(_localctx, 140, BNGParser.RULE_conditional_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1276;
			this.or_expr();
			this.state = 1282;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === BNGParser.QMARK) {
				{
				this.state = 1277;
				this.match(BNGParser.QMARK);
				this.state = 1278;
				this.expression();
				this.state = 1279;
				this.match(BNGParser.COLON);
				this.state = 1280;
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
	public or_expr(): Or_exprContext {
		let _localctx: Or_exprContext = new Or_exprContext(this._ctx, this.state);
		this.enterRule(_localctx, 142, BNGParser.RULE_or_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1284;
			this.and_expr();
			this.state = 1293;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LOGICAL_OR || _la === BNGParser.PIPE) {
				{
				{
				this.state = 1288;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case BNGParser.PIPE:
					{
					this.state = 1285;
					this.match(BNGParser.PIPE);
					this.state = 1286;
					this.match(BNGParser.PIPE);
					}
					break;
				case BNGParser.LOGICAL_OR:
					{
					this.state = 1287;
					this.match(BNGParser.LOGICAL_OR);
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 1290;
				this.and_expr();
				}
				}
				this.state = 1295;
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
		this.enterRule(_localctx, 144, BNGParser.RULE_and_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1296;
			this.equality_expr();
			this.state = 1305;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.LOGICAL_AND || _la === BNGParser.AMPERSAND) {
				{
				{
				this.state = 1300;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case BNGParser.AMPERSAND:
					{
					this.state = 1297;
					this.match(BNGParser.AMPERSAND);
					this.state = 1298;
					this.match(BNGParser.AMPERSAND);
					}
					break;
				case BNGParser.LOGICAL_AND:
					{
					this.state = 1299;
					this.match(BNGParser.LOGICAL_AND);
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 1302;
				this.equality_expr();
				}
				}
				this.state = 1307;
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
		this.enterRule(_localctx, 146, BNGParser.RULE_equality_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1308;
			this.relational_expr();
			this.state = 1313;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 202)) & ~0x1F) === 0 && ((1 << (_la - 202)) & ((1 << (BNGParser.GTE - 202)) | (1 << (BNGParser.GT - 202)) | (1 << (BNGParser.LTE - 202)) | (1 << (BNGParser.LT - 202)) | (1 << (BNGParser.EQUALS - 202)) | (1 << (BNGParser.NOT_EQUALS - 202)))) !== 0)) {
				{
				{
				this.state = 1309;
				_la = this._input.LA(1);
				if (!(((((_la - 202)) & ~0x1F) === 0 && ((1 << (_la - 202)) & ((1 << (BNGParser.GTE - 202)) | (1 << (BNGParser.GT - 202)) | (1 << (BNGParser.LTE - 202)) | (1 << (BNGParser.LT - 202)) | (1 << (BNGParser.EQUALS - 202)) | (1 << (BNGParser.NOT_EQUALS - 202)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 1310;
				this.relational_expr();
				}
				}
				this.state = 1315;
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
		this.enterRule(_localctx, 148, BNGParser.RULE_relational_expr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1316;
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
		this.enterRule(_localctx, 150, BNGParser.RULE_additive_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1318;
			this.multiplicative_expr();
			this.state = 1323;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.MINUS || _la === BNGParser.PLUS) {
				{
				{
				this.state = 1319;
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
				this.state = 1320;
				this.multiplicative_expr();
				}
				}
				this.state = 1325;
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
		this.enterRule(_localctx, 152, BNGParser.RULE_multiplicative_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1326;
			this.power_expr();
			this.state = 1331;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (((((_la - 212)) & ~0x1F) === 0 && ((1 << (_la - 212)) & ((1 << (BNGParser.DIV - 212)) | (1 << (BNGParser.TIMES - 212)) | (1 << (BNGParser.MOD - 212)))) !== 0)) {
				{
				{
				this.state = 1327;
				_la = this._input.LA(1);
				if (!(((((_la - 212)) & ~0x1F) === 0 && ((1 << (_la - 212)) & ((1 << (BNGParser.DIV - 212)) | (1 << (BNGParser.TIMES - 212)) | (1 << (BNGParser.MOD - 212)))) !== 0))) {
				this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 1328;
				this.power_expr();
				}
				}
				this.state = 1333;
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
		this.enterRule(_localctx, 154, BNGParser.RULE_power_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1334;
			this.unary_expr();
			this.state = 1339;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === BNGParser.POWER) {
				{
				{
				this.state = 1335;
				this.match(BNGParser.POWER);
				this.state = 1336;
				this.unary_expr();
				}
				}
				this.state = 1341;
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
		this.enterRule(_localctx, 156, BNGParser.RULE_unary_expr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1343;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0)) {
				{
				this.state = 1342;
				_la = this._input.LA(1);
				if (!(((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0))) {
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

			this.state = 1345;
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
		this.enterRule(_localctx, 158, BNGParser.RULE_primary_expr);
		try {
			this.state = 1355;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 193, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 1347;
				this.match(BNGParser.LPAREN);
				this.state = 1348;
				this.expression();
				this.state = 1349;
				this.match(BNGParser.RPAREN);
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 1351;
				this.function_call();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 1352;
				this.observable_ref();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 1353;
				this.literal();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 1354;
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
		this.enterRule(_localctx, 160, BNGParser.RULE_function_call);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1357;
			_la = this._input.LA(1);
			if (!(((((_la - 149)) & ~0x1F) === 0 && ((1 << (_la - 149)) & ((1 << (BNGParser.SAT - 149)) | (1 << (BNGParser.MM - 149)) | (1 << (BNGParser.HILL - 149)) | (1 << (BNGParser.ARRHENIUS - 149)) | (1 << (BNGParser.MRATIO - 149)) | (1 << (BNGParser.TFUN - 149)) | (1 << (BNGParser.FUNCTIONPRODUCT - 149)) | (1 << (BNGParser.IF - 149)) | (1 << (BNGParser.EXP - 149)) | (1 << (BNGParser.LN - 149)) | (1 << (BNGParser.LOG10 - 149)) | (1 << (BNGParser.LOG2 - 149)) | (1 << (BNGParser.SQRT - 149)) | (1 << (BNGParser.RINT - 149)) | (1 << (BNGParser.ABS - 149)) | (1 << (BNGParser.SIN - 149)) | (1 << (BNGParser.COS - 149)) | (1 << (BNGParser.TAN - 149)) | (1 << (BNGParser.ASIN - 149)) | (1 << (BNGParser.ACOS - 149)) | (1 << (BNGParser.ATAN - 149)) | (1 << (BNGParser.SINH - 149)) | (1 << (BNGParser.COSH - 149)) | (1 << (BNGParser.TANH - 149)) | (1 << (BNGParser.ASINH - 149)) | (1 << (BNGParser.ACOSH - 149)) | (1 << (BNGParser.ATANH - 149)) | (1 << (BNGParser.MIN - 149)) | (1 << (BNGParser.MAX - 149)))) !== 0) || ((((_la - 181)) & ~0x1F) === 0 && ((1 << (_la - 181)) & ((1 << (BNGParser.SUM - 181)) | (1 << (BNGParser.AVG - 181)) | (1 << (BNGParser.TIME - 181)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 1358;
			this.match(BNGParser.LPAREN);
			this.state = 1360;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)) | (1 << (BNGParser.SAT - 136)) | (1 << (BNGParser.MM - 136)) | (1 << (BNGParser.HILL - 136)) | (1 << (BNGParser.ARRHENIUS - 136)) | (1 << (BNGParser.MRATIO - 136)) | (1 << (BNGParser.TFUN - 136)) | (1 << (BNGParser.FUNCTIONPRODUCT - 136)) | (1 << (BNGParser.IF - 136)) | (1 << (BNGParser.EXP - 136)) | (1 << (BNGParser.LN - 136)) | (1 << (BNGParser.LOG10 - 136)) | (1 << (BNGParser.LOG2 - 136)) | (1 << (BNGParser.SQRT - 136)) | (1 << (BNGParser.RINT - 136)) | (1 << (BNGParser.ABS - 136)) | (1 << (BNGParser.SIN - 136)) | (1 << (BNGParser.COS - 136)) | (1 << (BNGParser.TAN - 136)))) !== 0) || ((((_la - 168)) & ~0x1F) === 0 && ((1 << (_la - 168)) & ((1 << (BNGParser.ASIN - 168)) | (1 << (BNGParser.ACOS - 168)) | (1 << (BNGParser.ATAN - 168)) | (1 << (BNGParser.SINH - 168)) | (1 << (BNGParser.COSH - 168)) | (1 << (BNGParser.TANH - 168)) | (1 << (BNGParser.ASINH - 168)) | (1 << (BNGParser.ACOSH - 168)) | (1 << (BNGParser.ATANH - 168)) | (1 << (BNGParser.PI - 168)) | (1 << (BNGParser.EULERIAN - 168)) | (1 << (BNGParser.MIN - 168)) | (1 << (BNGParser.MAX - 168)) | (1 << (BNGParser.SUM - 168)) | (1 << (BNGParser.AVG - 168)) | (1 << (BNGParser.TIME - 168)) | (1 << (BNGParser.FLOAT - 168)) | (1 << (BNGParser.INT - 168)) | (1 << (BNGParser.STRING - 168)) | (1 << (BNGParser.LPAREN - 168)))) !== 0) || ((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0)) {
				{
				this.state = 1359;
				this.expression_list();
				}
			}

			this.state = 1362;
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
		this.enterRule(_localctx, 162, BNGParser.RULE_observable_ref);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1364;
			this.match(BNGParser.STRING);
			this.state = 1365;
			this.match(BNGParser.LPAREN);
			this.state = 1367;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & ((1 << (BNGParser.PREFIX - 39)) | (1 << (BNGParser.SUFFIX - 39)) | (1 << (BNGParser.OVERWRITE - 39)) | (1 << (BNGParser.MAX_AGG - 39)) | (1 << (BNGParser.MAX_ITER - 39)) | (1 << (BNGParser.MAX_STOICH - 39)) | (1 << (BNGParser.PRINT_ITER - 39)) | (1 << (BNGParser.CHECK_ISO - 39)) | (1 << (BNGParser.SAFE - 39)) | (1 << (BNGParser.EXECUTE - 39)) | (1 << (BNGParser.METHOD - 39)) | (1 << (BNGParser.VERBOSE - 39)) | (1 << (BNGParser.NETFILE - 39)) | (1 << (BNGParser.CONTINUE - 39)) | (1 << (BNGParser.T_START - 39)) | (1 << (BNGParser.T_END - 39)) | (1 << (BNGParser.N_STEPS - 39)) | (1 << (BNGParser.N_OUTPUT_STEPS - 39)) | (1 << (BNGParser.MAX_SIM_STEPS - 39)) | (1 << (BNGParser.OUTPUT_STEP_INTERVAL - 39)) | (1 << (BNGParser.SAMPLE_TIMES - 39)) | (1 << (BNGParser.SAVE_PROGRESS - 39)) | (1 << (BNGParser.PRINT_CDAT - 39)) | (1 << (BNGParser.PRINT_FUNCTIONS - 39)))) !== 0) || ((((_la - 71)) & ~0x1F) === 0 && ((1 << (_la - 71)) & ((1 << (BNGParser.PRINT_NET - 71)) | (1 << (BNGParser.PRINT_END - 71)) | (1 << (BNGParser.STOP_IF - 71)) | (1 << (BNGParser.PRINT_ON_STOP - 71)) | (1 << (BNGParser.ATOL - 71)) | (1 << (BNGParser.RTOL - 71)) | (1 << (BNGParser.STEADY_STATE - 71)) | (1 << (BNGParser.SPARSE - 71)) | (1 << (BNGParser.PLA_CONFIG - 71)) | (1 << (BNGParser.PLA_OUTPUT - 71)) | (1 << (BNGParser.PARAM - 71)) | (1 << (BNGParser.COMPLEX - 71)) | (1 << (BNGParser.GET_FINAL_STATE - 71)) | (1 << (BNGParser.GML - 71)) | (1 << (BNGParser.NOCSLF - 71)) | (1 << (BNGParser.NOTF - 71)) | (1 << (BNGParser.BINARY_OUTPUT - 71)) | (1 << (BNGParser.UTL - 71)) | (1 << (BNGParser.EQUIL - 71)) | (1 << (BNGParser.PARAMETER - 71)) | (1 << (BNGParser.PAR_MIN - 71)) | (1 << (BNGParser.PAR_MAX - 71)) | (1 << (BNGParser.N_SCAN_PTS - 71)) | (1 << (BNGParser.LOG_SCALE - 71)) | (1 << (BNGParser.RESET_CONC - 71)))) !== 0) || ((((_la - 104)) & ~0x1F) === 0 && ((1 << (_la - 104)) & ((1 << (BNGParser.FILE - 104)) | (1 << (BNGParser.ATOMIZE - 104)) | (1 << (BNGParser.BLOCKS - 104)) | (1 << (BNGParser.SKIPACTIONS - 104)) | (1 << (BNGParser.TYPE - 104)) | (1 << (BNGParser.BACKGROUND - 104)) | (1 << (BNGParser.COLLAPSE - 104)) | (1 << (BNGParser.OPTS - 104)) | (1 << (BNGParser.FORMAT - 104)) | (1 << (BNGParser.INCLUDE_MODEL - 104)) | (1 << (BNGParser.INCLUDE_NETWORK - 104)) | (1 << (BNGParser.PRETTY_FORMATTING - 104)) | (1 << (BNGParser.EVALUATE_EXPRESSIONS - 104)) | (1 << (BNGParser.TEXTREACTION - 104)) | (1 << (BNGParser.TEXTSPECIES - 104)) | (1 << (BNGParser.BDF - 104)) | (1 << (BNGParser.MAX_STEP - 104)) | (1 << (BNGParser.MAXORDER - 104)) | (1 << (BNGParser.STATS - 104)) | (1 << (BNGParser.MAX_NUM_STEPS - 104)))) !== 0) || ((((_la - 136)) & ~0x1F) === 0 && ((1 << (_la - 136)) & ((1 << (BNGParser.MAX_ERR_TEST_FAILS - 136)) | (1 << (BNGParser.MAX_CONV_FAILS - 136)) | (1 << (BNGParser.STIFF - 136)) | (1 << (BNGParser.SAT - 136)) | (1 << (BNGParser.MM - 136)) | (1 << (BNGParser.HILL - 136)) | (1 << (BNGParser.ARRHENIUS - 136)) | (1 << (BNGParser.MRATIO - 136)) | (1 << (BNGParser.TFUN - 136)) | (1 << (BNGParser.FUNCTIONPRODUCT - 136)) | (1 << (BNGParser.IF - 136)) | (1 << (BNGParser.EXP - 136)) | (1 << (BNGParser.LN - 136)) | (1 << (BNGParser.LOG10 - 136)) | (1 << (BNGParser.LOG2 - 136)) | (1 << (BNGParser.SQRT - 136)) | (1 << (BNGParser.RINT - 136)) | (1 << (BNGParser.ABS - 136)) | (1 << (BNGParser.SIN - 136)) | (1 << (BNGParser.COS - 136)) | (1 << (BNGParser.TAN - 136)))) !== 0) || ((((_la - 168)) & ~0x1F) === 0 && ((1 << (_la - 168)) & ((1 << (BNGParser.ASIN - 168)) | (1 << (BNGParser.ACOS - 168)) | (1 << (BNGParser.ATAN - 168)) | (1 << (BNGParser.SINH - 168)) | (1 << (BNGParser.COSH - 168)) | (1 << (BNGParser.TANH - 168)) | (1 << (BNGParser.ASINH - 168)) | (1 << (BNGParser.ACOSH - 168)) | (1 << (BNGParser.ATANH - 168)) | (1 << (BNGParser.PI - 168)) | (1 << (BNGParser.EULERIAN - 168)) | (1 << (BNGParser.MIN - 168)) | (1 << (BNGParser.MAX - 168)) | (1 << (BNGParser.SUM - 168)) | (1 << (BNGParser.AVG - 168)) | (1 << (BNGParser.TIME - 168)) | (1 << (BNGParser.FLOAT - 168)) | (1 << (BNGParser.INT - 168)) | (1 << (BNGParser.STRING - 168)) | (1 << (BNGParser.LPAREN - 168)))) !== 0) || ((((_la - 200)) & ~0x1F) === 0 && ((1 << (_la - 200)) & ((1 << (BNGParser.TILDE - 200)) | (1 << (BNGParser.MINUS - 200)) | (1 << (BNGParser.PLUS - 200)) | (1 << (BNGParser.EMARK - 200)))) !== 0)) {
				{
				this.state = 1366;
				this.expression();
				}
			}

			this.state = 1369;
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
		this.enterRule(_localctx, 164, BNGParser.RULE_literal);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 1371;
			_la = this._input.LA(1);
			if (!(((((_la - 177)) & ~0x1F) === 0 && ((1 << (_la - 177)) & ((1 << (BNGParser.PI - 177)) | (1 << (BNGParser.EULERIAN - 177)) | (1 << (BNGParser.FLOAT - 177)) | (1 << (BNGParser.INT - 177)))) !== 0))) {
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\xE3\u0560\x04" +
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
		"O\tO\x04P\tP\x04Q\tQ\x04R\tR\x04S\tS\x04T\tT\x03\x02\x07\x02\xAA\n\x02" +
		"\f\x02\x0E\x02\xAD\v\x02\x03\x02\x07\x02\xB0\n\x02\f\x02\x0E\x02\xB3\v" +
		"\x02\x03\x02\x03\x02\x03\x02\x06\x02\xB8\n\x02\r\x02\x0E\x02\xB9\x03\x02" +
		"\x07\x02\xBD\n\x02\f\x02\x0E\x02\xC0\v\x02\x03\x02\x03\x02\x03\x02\x07" +
		"\x02\xC5\n\x02\f\x02\x0E\x02\xC8\v\x02\x03\x02\x07\x02\xCB\n\x02\f\x02" +
		"\x0E\x02\xCE\v\x02\x05\x02\xD0\n\x02\x03\x02\x03\x02\x05\x02\xD4\n\x02" +
		"\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x05\x03\xDC\n\x03\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x03\x04\x05\x04\xE3\n\x04\x03\x04\x03\x04" +
		"\x03\x04\x05\x04\xE8\n\x04\x03\x04\x06\x04\xEB\n\x04\r\x04\x0E\x04\xEC" +
		"\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x05\x05\xF6\n" +
		"\x05\x03\x05\x06\x05\xF9\n\x05\r\x05\x0E\x05\xFA\x03\x06\x03\x06\x03\x06" +
		"\x03\x06\x07\x06\u0101\n\x06\f\x06\x0E\x06\u0104\v\x06\x03\x06\x03\x06" +
		"\x03\x06\x03\x06\x07\x06\u010A\n\x06\f\x06\x0E\x06\u010D\v\x06\x03\x06" +
		"\x03\x06\x03\x06\x03\x06\x07\x06\u0113\n\x06\f\x06\x0E\x06\u0116\v\x06" +
		"\x03\x06\x03\x06\x03\x06\x03\x06\x07\x06\u011C\n\x06\f\x06\x0E\x06\u011F" +
		"\v\x06\x03\x06\x07\x06\u0122\n\x06\f\x06\x0E\x06\u0125\v\x06\x03\x06\x03" +
		"\x06\x05\x06\u0129\n\x06\x03\x06\x06\x06\u012C\n\x06\r\x06\x0E\x06\u012D" +
		"\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x05\x07\u0137" +
		"\n\x07\x03\x07\x06\x07\u013A\n\x07\r\x07\x0E\x07\u013B\x03\b\x03\b\x03" +
		"\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x03\b\x05\b\u0149\n\b\x03" +
		"\t\x03\t\x03\t\x06\t\u014E\n\t\r\t\x0E\t\u014F\x03\t\x03\t\x06\t\u0154" +
		"\n\t\r\t\x0E\t\u0155\x07\t\u0158\n\t\f\t\x0E\t\u015B\v\t\x03\t\x03\t\x03" +
		"\t\x07\t\u0160\n\t\f\t\x0E\t\u0163\v\t\x03\n\x05\n\u0166\n\n\x03\n\x03" +
		"\n\x03\n\x05\n\u016B\n\n\x03\n\x03\n\x05\n\u016F\n\n\x03\n\x05\n\u0172" +
		"\n\n\x03\v\x03\v\x05\v\u0176\n\v\x03\f\x03\f\x03\f\x03\f\x06\f\u017C\n" +
		"\f\r\f\x0E\f\u017D\x03\f\x03\f\x06\f\u0182\n\f\r\f\x0E\f\u0183\x07\f\u0186" +
		"\n\f\f\f\x0E\f\u0189\v\f\x03\f\x03\f\x03\f\x03\f\x07\f\u018F\n\f\f\f\x0E" +
		"\f\u0192\v\f\x03\f\x03\f\x03\f\x06\f\u0197\n\f\r\f\x0E\f\u0198\x03\f\x03" +
		"\f\x06\f\u019D\n\f\r\f\x0E\f\u019E\x07\f\u01A1\n\f\f\f\x0E\f\u01A4\v\f" +
		"\x03\f\x03\f\x03\f\x07\f\u01A9\n\f\f\f\x0E\f\u01AC\v\f\x03\f\x03\f\x03" +
		"\f\x06\f\u01B1\n\f\r\f\x0E\f\u01B2\x03\f\x03\f\x06\f\u01B7\n\f\r\f\x0E" +
		"\f\u01B8\x07\f\u01BB\n\f\f\f\x0E\f\u01BE\v\f\x03\f\x03\f\x03\f\x07\f\u01C3" +
		"\n\f\f\f\x0E\f\u01C6\v\f\x05\f\u01C8\n\f\x03\r\x03\r\x05\r\u01CC\n\r\x03" +
		"\r\x03\r\x05\r\u01D0\n\r\x03\x0E\x03\x0E\x03\x0E\x05\x0E\u01D5\n\x0E\x03" +
		"\x0E\x05\x0E\u01D8\n\x0E\x03\x0F\x05\x0F\u01DB\n\x0F\x03\x0F\x03\x0F\x05" +
		"\x0F\u01DF\n\x0F\x07\x0F\u01E1\n\x0F\f\x0F\x0E\x0F\u01E4\v\x0F\x03\x10" +
		"\x03\x10\x03\x10\x05\x10\u01E9\n\x10\x03\x11\x03\x11\x03\x11\x07\x11\u01EE" +
		"\n\x11\f\x11\x0E\x11\u01F1\v\x11\x03\x12\x03\x12\x03\x12\x05\x12\u01F6" +
		"\n\x12\x05\x12\u01F8\n\x12\x03\x13\x03\x13\x03\x13\x03\x13\x05\x13\u01FE" +
		"\n\x13\x03\x13\x06\x13\u0201\n\x13\r\x13\x0E\x13\u0202\x03\x13\x03\x13" +
		"\x06\x13\u0207\n\x13\r\x13\x0E\x13\u0208\x07\x13\u020B\n\x13\f\x13\x0E" +
		"\x13\u020E\v\x13\x03\x13\x03\x13\x03\x13\x03\x13\x05\x13\u0214\n\x13\x03" +
		"\x13\x07\x13\u0217\n\x13\f\x13\x0E\x13\u021A\v\x13\x03\x14\x05\x14\u021D" +
		"\n\x14\x03\x14\x03\x14\x05\x14\u0221\n\x14\x03\x14\x05\x14\u0224\n\x14" +
		"\x03\x14\x03\x14\x03\x14\x05\x14\u0229\n\x14\x03\x14\x03\x14\x05\x14\u022D" +
		"\n\x14\x03\x15\x03\x15\x03\x15\x05\x15\u0232\n\x15\x03\x15\x03\x15\x05" +
		"\x15\u0236\n\x15\x03\x15\x03\x15\x03\x15\x05\x15\u023B\n\x15\x07\x15\u023D" +
		"\n\x15\f\x15\x0E\x15\u0240\v\x15\x03\x15\x03\x15\x05\x15\u0244\n\x15\x03" +
		"\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x05\x17\u024C\n\x17\x03\x17" +
		"\x05\x17\u024F\n\x17\x03\x17\x05\x17\u0252\n\x17\x03\x18\x03\x18\x03\x18" +
		"\x03\x19\x05\x19\u0258\n\x19\x03\x19\x03\x19\x05\x19\u025C\n\x19\x07\x19" +
		"\u025E\n\x19\f\x19\x0E\x19\u0261\v\x19\x03\x1A\x03\x1A\x03\x1A\x03\x1A" +
		"\x07\x1A\u0267\n\x1A\f\x1A\x0E\x1A\u026A\v\x1A\x03\x1B\x03\x1B\x03\x1B" +
		"\x05\x1B\u026F\n\x1B\x03\x1B\x05\x1B\u0272\n\x1B\x03\x1C\x03\x1C\x03\x1C" +
		"\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x05\x1C\u027C\n\x1C\x03\x1D\x03" +
		"\x1D\x03\x1E\x03\x1E\x03\x1E\x06\x1E\u0283\n\x1E\r\x1E\x0E\x1E\u0284\x03" +
		"\x1E\x03\x1E\x06\x1E\u0289\n\x1E\r\x1E\x0E\x1E\u028A\x07\x1E\u028D\n\x1E" +
		"\f\x1E\x0E\x1E\u0290\v\x1E\x03\x1E\x03\x1E\x03\x1E\x07\x1E\u0295\n\x1E" +
		"\f\x1E\x0E\x1E\u0298\v\x1E\x03\x1F\x03\x1F\x05\x1F\u029C\n\x1F\x03\x1F" +
		"\x05\x1F\u029F\n\x1F\x03\x1F\x03\x1F\x03\x1F\x03 \x03 \x03!\x03!\x05!" +
		"\u02A8\n!\x03!\x07!\u02AB\n!\f!\x0E!\u02AE\v!\x03\"\x03\"\x03\"\x03\"" +
		"\x05\"\u02B4\n\"\x03#\x03#\x03#\x03#\x06#\u02BA\n#\r#\x0E#\u02BB\x03#" +
		"\x03#\x06#\u02C0\n#\r#\x0E#\u02C1\x07#\u02C4\n#\f#\x0E#\u02C7\v#\x03#" +
		"\x03#\x03#\x03#\x07#\u02CD\n#\f#\x0E#\u02D0\v#\x03#\x03#\x03#\x06#\u02D5" +
		"\n#\r#\x0E#\u02D6\x03#\x03#\x06#\u02DB\n#\r#\x0E#\u02DC\x07#\u02DF\n#" +
		"\f#\x0E#\u02E2\v#\x03#\x03#\x03#\x07#\u02E7\n#\f#\x0E#\u02EA\v#\x03#\x03" +
		"#\x03#\x06#\u02EF\n#\r#\x0E#\u02F0\x03#\x03#\x06#\u02F5\n#\r#\x0E#\u02F6" +
		"\x07#\u02F9\n#\f#\x0E#\u02FC\v#\x03#\x03#\x03#\x07#\u0301\n#\f#\x0E#\u0304" +
		"\v#\x05#\u0306\n#\x03$\x05$\u0309\n$\x03$\x03$\x03$\x03$\x05$\u030F\n" +
		"$\x03$\x03$\x03$\x03$\x03$\x05$\u0316\n$\x03%\x03%\x03%\x03%\x03%\x05" +
		"%\u031D\n%\x03%\x07%\u0320\n%\f%\x0E%\u0323\v%\x03%\x03%\x05%\u0327\n" +
		"%\x03&\x03&\x03&\x07&\u032C\n&\f&\x0E&\u032F\v&\x03&\x05&\u0332\n&\x03" +
		"\'\x03\'\x03\'\x07\'\u0337\n\'\f\'\x0E\'\u033A\v\'\x03\'\x05\'\u033D\n" +
		"\'\x03(\x03(\x03)\x03)\x03)\x05)\u0344\n)\x03*\x03*\x03*\x03*\x03*\x03" +
		"*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03" +
		"*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03*\x03" +
		"*\x03*\x05*\u0369\n*\x03+\x03+\x03+\x07+\u036E\n+\f+\x0E+\u0371\v+\x03" +
		",\x03,\x03,\x06,\u0376\n,\r,\x0E,\u0377\x03,\x03,\x06,\u037C\n,\r,\x0E" +
		",\u037D\x07,\u0380\n,\f,\x0E,\u0383\v,\x03,\x03,\x03,\x07,\u0388\n,\f" +
		",\x0E,\u038B\v,\x03-\x03-\x05-\u038F\n-\x03-\x03-\x03-\x05-\u0394\n-\x03" +
		"-\x05-\u0397\n-\x03-\x05-\u039A\n-\x03-\x03-\x03.\x03.\x03.\x07.\u03A1" +
		"\n.\f.\x0E.\u03A4\v.\x03/\x03/\x03/\x06/\u03A9\n/\r/\x0E/\u03AA\x03/\x03" +
		"/\x06/\u03AF\n/\r/\x0E/\u03B0\x07/\u03B3\n/\f/\x0E/\u03B6\v/\x03/\x03" +
		"/\x03/\x07/\u03BB\n/\f/\x0E/\u03BE\v/\x030\x030\x050\u03C2\n0\x030\x03" +
		"0\x030\x030\x050\u03C8\n0\x031\x031\x031\x031\x061\u03CE\n1\r1\x0E1\u03CF" +
		"\x031\x031\x061\u03D4\n1\r1\x0E1\u03D5\x071\u03D8\n1\f1\x0E1\u03DB\v1" +
		"\x031\x031\x031\x031\x071\u03E1\n1\f1\x0E1\u03E4\v1\x032\x032\x052\u03E8" +
		"\n2\x032\x032\x032\x033\x033\x033\x033\x063\u03F1\n3\r3\x0E3\u03F2\x03" +
		"3\x033\x063\u03F7\n3\r3\x0E3\u03F8\x073\u03FB\n3\f3\x0E3\u03FE\v3\x03" +
		"3\x033\x033\x033\x073\u0404\n3\f3\x0E3\u0407\v3\x034\x034\x054\u040B\n" +
		"4\x034\x034\x034\x034\x034\x054\u0412\n4\x034\x034\x035\x065\u0417\n5" +
		"\r5\x0E5\u0418\x036\x036\x036\x066\u041E\n6\r6\x0E6\u041F\x036\x076\u0423" +
		"\n6\f6\x0E6\u0426\v6\x036\x036\x036\x076\u042B\n6\f6\x0E6\u042E\v6\x03" +
		"7\x037\x037\x067\u0433\n7\r7\x0E7\u0434\x037\x077\u0438\n7\f7\x0E7\u043B" +
		"\v7\x037\x037\x037\x077\u0440\n7\f7\x0E7\u0443\v7\x038\x038\x038\x038" +
		"\x038\x058\u044A\n8\x039\x039\x039\x059\u044F\n9\x039\x039\x059\u0453" +
		"\n9\x039\x079\u0456\n9\f9\x0E9\u0459\v9\x03:\x03:\x03:\x05:\u045E\n:\x03" +
		":\x03:\x05:\u0462\n:\x03:\x07:\u0465\n:\f:\x0E:\u0468\v:\x03;\x03;\x03" +
		";\x05;\u046D\n;\x03;\x03;\x05;\u0471\n;\x03;\x07;\u0474\n;\f;\x0E;\u0477" +
		"\v;\x03<\x03<\x03<\x03<\x03<\x06<\u047E\n<\r<\x0E<\u047F\x05<\u0482\n" +
		"<\x03<\x03<\x03<\x03<\x03<\x07<\u0489\n<\f<\x0E<\u048C\v<\x03<\x05<\u048F" +
		"\n<\x03<\x03<\x05<\u0493\n<\x03<\x07<\u0496\n<\f<\x0E<\u0499\v<\x03=\x03" +
		"=\x03=\x05=\u049E\n=\x03=\x03=\x05=\u04A2\n=\x03=\x07=\u04A5\n=\f=\x0E" +
		"=\u04A8\v=\x03>\x03>\x05>\u04AC\n>\x03>\x03>\x03>\x07>\u04B1\n>\f>\x0E" +
		">\u04B4\v>\x03>\x05>\u04B7\n>\x03?\x03?\x03?\x07?\u04BC\n?\f?\x0E?\u04BF" +
		"\v?\x03@\x03@\x03@\x03@\x03A\x03A\x03A\x03A\x07A\u04C9\nA\fA\x0EA\u04CC" +
		"\vA\x03A\x03A\x03A\x07A\u04D1\nA\fA\x0EA\u04D4\vA\x03A\x03A\x03A\x03A" +
		"\x03A\x03A\x03A\x05A\u04DD\nA\x03A\x05A\u04E0\nA\x03B\x03B\x03C\x03C\x03" +
		"C\x07C\u04E7\nC\fC\x0EC\u04EA\vC\x03D\x03D\x05D\u04EE\nD\x03D\x03D\x03" +
		"D\x03E\x03E\x03F\x03F\x03F\x07F\u04F8\nF\fF\x0EF\u04FB\vF\x03G\x03G\x03" +
		"H\x03H\x03H\x03H\x03H\x03H\x05H\u0505\nH\x03I\x03I\x03I\x03I\x05I\u050B" +
		"\nI\x03I\x07I\u050E\nI\fI\x0EI\u0511\vI\x03J\x03J\x03J\x03J\x05J\u0517" +
		"\nJ\x03J\x07J\u051A\nJ\fJ\x0EJ\u051D\vJ\x03K\x03K\x03K\x07K\u0522\nK\f" +
		"K\x0EK\u0525\vK\x03L\x03L\x03M\x03M\x03M\x07M\u052C\nM\fM\x0EM\u052F\v" +
		"M\x03N\x03N\x03N\x07N\u0534\nN\fN\x0EN\u0537\vN\x03O\x03O\x03O\x07O\u053C" +
		"\nO\fO\x0EO\u053F\vO\x03P\x05P\u0542\nP\x03P\x03P\x03Q\x03Q\x03Q\x03Q" +
		"\x03Q\x03Q\x03Q\x03Q\x05Q\u054E\nQ\x03R\x03R\x03R\x05R\u0553\nR\x03R\x03" +
		"R\x03S\x03S\x03S\x05S\u055A\nS\x03S\x03S\x03T\x03T\x03T\x02\x02\x02U\x02" +
		"\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02" +
		"\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02" +
		",\x02.\x020\x022\x024\x026\x028\x02:\x02<\x02>\x02@\x02B\x02D\x02F\x02" +
		"H\x02J\x02L\x02N\x02P\x02R\x02T\x02V\x02X\x02Z\x02\\\x02^\x02`\x02b\x02" +
		"d\x02f\x02h\x02j\x02l\x02n\x02p\x02r\x02t\x02v\x02x\x02z\x02|\x02~\x02" +
		"\x80\x02\x82\x02\x84\x02\x86\x02\x88\x02\x8A\x02\x8C\x02\x8E\x02\x90\x02" +
		"\x92\x02\x94\x02\x96\x02\x98\x02\x9A\x02\x9C\x02\x9E\x02\xA0\x02\xA2\x02" +
		"\xA4\x02\xA6\x02\x02\x14\x03\x02\xDF\xDF\x03\x02\xBB\xBC\x05\x02\f\f\x0F" +
		"\x0F\xBC\xBC\x04\x02\xCC\xCF\xD1\xD1\x03\x02\xC7\xC8\x06\x0255MMRSVW\x05" +
		"\x02vz||\x83\x84\x04\x02\x8D\x8E\x91\x91\b\x0222abiinn\x8F\x90\x92\x94" +
		"\x03\x02\xE0\xE0\v\x02,,346;>>PQ^^\x85\x85\x8C\x8C\x95\x96\x12\x02)*," +
		"13466;<>LNQTUX`chjmoruu}\x82\x85\x8C\xBC\xBC\x04\x02\xCC\xCF\xD1\xD2\x03" +
		"\x02\xD8\xD9\x04\x02\xD6\xD7\xDB\xDB\x05\x02\xCA\xCA\xD8\xD9\xDE\xDE\x05" +
		"\x02\x97\x9D\x9F\xB2\xB5\xB9\x04\x02\xB3\xB4\xBA\xBB\x02\u05F3\x02\xAB" +
		"\x03\x02\x02\x02\x04\xDB\x03\x02\x02\x02\x06\xDD\x03\x02\x02\x02\b\xEE" +
		"\x03\x02\x02\x02\n\xFC\x03\x02\x02\x02\f\u012F\x03\x02\x02\x02\x0E\u0148" +
		"\x03\x02\x02\x02\x10\u014A\x03\x02\x02\x02\x12\u0165\x03\x02\x02\x02\x14" +
		"\u0175\x03\x02\x02\x02\x16\u01C7\x03\x02\x02\x02\x18\u01CB\x03\x02\x02" +
		"\x02\x1A\u01D1\x03\x02\x02\x02\x1C\u01DA\x03\x02\x02\x02\x1E\u01E5\x03" +
		"\x02\x02\x02 \u01EA\x03\x02\x02\x02\"\u01F7\x03\x02\x02\x02$\u01F9\x03" +
		"\x02\x02\x02&\u021C\x03\x02\x02\x02(\u0231\x03\x02\x02\x02*\u0245\x03" +
		"\x02\x02\x02,\u0248\x03\x02\x02\x02.\u0253\x03\x02\x02\x020\u0257\x03" +
		"\x02\x02\x022\u0262\x03\x02\x02\x024\u0271\x03\x02\x02\x026\u027B\x03" +
		"\x02\x02\x028\u027D\x03\x02\x02\x02:\u027F\x03\x02\x02\x02<\u029B\x03" +
		"\x02\x02\x02>\u02A3\x03\x02\x02\x02@\u02A5\x03\x02\x02\x02B\u02B3\x03" +
		"\x02\x02\x02D\u0305\x03\x02\x02\x02F\u0308\x03\x02\x02\x02H\u0326\x03" +
		"\x02\x02\x02J\u0331\x03\x02\x02\x02L\u033C\x03\x02\x02\x02N\u033E\x03" +
		"\x02\x02\x02P\u0340\x03\x02\x02\x02R\u0368\x03\x02\x02\x02T\u036A\x03" +
		"\x02\x02\x02V\u0372\x03\x02\x02\x02X\u038E\x03\x02\x02\x02Z\u039D\x03" +
		"\x02\x02\x02\\\u03A5\x03\x02\x02\x02^\u03C1\x03\x02\x02\x02`\u03C9\x03" +
		"\x02\x02\x02b\u03E7\x03\x02\x02\x02d\u03EC\x03\x02\x02\x02f\u040A\x03" +
		"\x02\x02\x02h\u0416\x03\x02\x02\x02j\u041A\x03\x02\x02\x02l\u042F\x03" +
		"\x02\x02\x02n\u0449\x03\x02\x02\x02p\u044B\x03\x02\x02\x02r\u045A\x03" +
		"\x02\x02\x02t\u0469\x03\x02\x02\x02v\u0478\x03\x02\x02\x02x\u049A\x03" +
		"\x02\x02\x02z\u04B6\x03\x02\x02\x02|\u04B8\x03\x02\x02\x02~\u04C0\x03" +
		"\x02\x02\x02\x80\u04DF\x03\x02\x02\x02\x82\u04E1\x03\x02\x02\x02\x84\u04E3" +
		"\x03\x02\x02\x02\x86\u04ED\x03\x02\x02\x02\x88\u04F2\x03\x02\x02\x02\x8A" +
		"\u04F4\x03\x02\x02\x02\x8C\u04FC\x03\x02\x02\x02\x8E\u04FE\x03\x02\x02" +
		"\x02\x90\u0506\x03\x02\x02\x02\x92\u0512\x03\x02\x02\x02\x94\u051E\x03" +
		"\x02\x02\x02\x96\u0526\x03\x02\x02\x02\x98\u0528\x03\x02\x02\x02\x9A\u0530" +
		"\x03\x02\x02\x02\x9C\u0538\x03\x02\x02\x02\x9E\u0541\x03\x02\x02\x02\xA0" +
		"\u054D\x03\x02\x02\x02\xA2\u054F\x03\x02\x02\x02\xA4\u0556\x03\x02\x02" +
		"\x02\xA6\u055D\x03\x02\x02\x02\xA8\xAA\x07\x04\x02\x02\xA9\xA8\x03\x02" +
		"\x02\x02\xAA\xAD\x03\x02\x02\x02\xAB\xA9\x03\x02\x02\x02\xAB\xAC\x03\x02" +
		"\x02\x02\xAC\xB1\x03\x02\x02\x02\xAD\xAB\x03\x02\x02\x02\xAE\xB0\x05\x04" +
		"\x03\x02\xAF\xAE\x03\x02\x02\x02\xB0\xB3\x03\x02\x02\x02\xB1\xAF\x03\x02" +
		"\x02\x02\xB1\xB2\x03\x02\x02\x02\xB2\xCF\x03\x02\x02\x02\xB3\xB1\x03\x02" +
		"\x02\x02\xB4\xB5\x07\x06\x02\x02\xB5\xB7\x07\b\x02\x02\xB6\xB8\x07\x04" +
		"\x02\x02\xB7\xB6\x03\x02\x02\x02\xB8\xB9\x03\x02\x02\x02\xB9\xB7\x03\x02" +
		"\x02\x02\xB9\xBA\x03\x02\x02\x02\xBA\xBE\x03\x02\x02\x02\xBB\xBD\x05\x0E" +
		"\b\x02\xBC\xBB\x03\x02\x02\x02\xBD\xC0\x03\x02\x02\x02\xBE\xBC\x03\x02" +
		"\x02\x02\xBE\xBF\x03\x02\x02\x02\xBF\xC1\x03\x02\x02\x02\xC0\xBE\x03\x02" +
		"\x02\x02\xC1\xC2\x07\x07\x02\x02\xC2\xC6\x07\b\x02\x02\xC3\xC5\x07\x04" +
		"\x02\x02\xC4\xC3\x03\x02\x02\x02\xC5\xC8\x03\x02\x02\x02\xC6\xC4\x03\x02" +
		"\x02\x02\xC6\xC7\x03\x02\x02\x02\xC7\xD0\x03\x02\x02\x02\xC8\xC6\x03\x02" +
		"\x02\x02\xC9\xCB\x05\x0E\b\x02\xCA\xC9\x03\x02\x02\x02\xCB\xCE\x03\x02" +
		"\x02\x02\xCC\xCA\x03\x02\x02\x02\xCC\xCD\x03\x02\x02\x02\xCD\xD0\x03\x02" +
		"\x02\x02\xCE\xCC\x03\x02\x02\x02\xCF\xB4\x03\x02\x02\x02\xCF\xCC\x03\x02" +
		"\x02\x02\xD0\xD3\x03\x02\x02\x02\xD1\xD4\x05j6\x02\xD2\xD4\x05h5\x02\xD3" +
		"\xD1\x03\x02\x02\x02\xD3\xD2\x03\x02\x02\x02\xD3\xD4\x03\x02\x02\x02\xD4" +
		"\xD5\x03\x02\x02\x02\xD5\xD6\x07\x02\x02\x03\xD6\x03\x03\x02\x02\x02\xD7" +
		"\xDC\x05\x06\x04\x02\xD8\xDC\x05\b\x05\x02\xD9\xDC\x05\n\x06\x02\xDA\xDC" +
		"\x05\f\x07\x02\xDB\xD7\x03\x02\x02\x02\xDB\xD8\x03\x02\x02\x02\xDB\xD9" +
		"\x03\x02\x02\x02\xDB\xDA\x03\x02\x02\x02\xDC\x05\x03\x02\x02\x02\xDD\xDE" +
		"\x07%\x02\x02\xDE\xDF\x07\xC5\x02\x02\xDF\xE0\x07\xDF\x02\x02\xE0\xE2" +
		"\x07\xE2\x02\x02\xE1\xE3\x07\xBC\x02\x02\xE2\xE1\x03\x02\x02\x02\xE2\xE3" +
		"\x03\x02\x02\x02\xE3\xE4\x03\x02\x02\x02\xE4\xE5\x07\xDF\x02\x02\xE5\xE7" +
		"\x07\xC6\x02\x02\xE6\xE8\x07\xBD\x02\x02\xE7\xE6\x03\x02\x02\x02\xE7\xE8" +
		"\x03\x02\x02\x02\xE8\xEA\x03\x02\x02\x02\xE9\xEB\x07\x04\x02\x02\xEA\xE9" +
		"\x03\x02\x02\x02\xEB\xEC\x03\x02\x02\x02\xEC\xEA\x03\x02\x02\x02\xEC\xED" +
		"\x03\x02\x02\x02\xED\x07\x03\x02\x02\x02\xEE\xEF\x07(\x02\x02\xEF\xF0" +
		"\x07\xC5\x02\x02\xF0\xF1\x07\xDF\x02\x02\xF1\xF2\x07\xBC\x02\x02\xF2\xF3" +
		"\x07\xDF\x02\x02\xF3\xF5\x07\xC6\x02\x02\xF4\xF6\x07\xBD\x02\x02\xF5\xF4" +
		"\x03\x02\x02\x02\xF5\xF6\x03\x02\x02\x02\xF6\xF8\x03\x02\x02\x02\xF7\xF9" +
		"\x07\x04\x02\x02\xF8\xF7\x03\x02\x02\x02\xF9\xFA\x03\x02\x02\x02\xFA\xF8" +
		"\x03\x02\x02\x02\xFA\xFB\x03\x02\x02\x02\xFB\t\x03\x02\x02\x02\xFC\xFD" +
		"\x07&\x02\x02\xFD\xFE\x07\xC5\x02\x02\xFE\u0102\x07\xDF\x02\x02\xFF\u0101" +
		"\n\x02\x02\x02\u0100\xFF\x03\x02\x02\x02\u0101\u0104\x03\x02\x02\x02\u0102" +
		"\u0100\x03\x02\x02\x02\u0102\u0103\x03\x02\x02\x02\u0103\u0105\x03\x02" +
		"\x02\x02\u0104\u0102\x03\x02\x02\x02\u0105\u0106\x07\xDF\x02\x02\u0106" +
		"\u0107\x07\xC3\x02\x02\u0107\u010B\x07\xDF\x02\x02\u0108\u010A\n\x02\x02" +
		"\x02\u0109\u0108\x03\x02\x02\x02\u010A\u010D\x03\x02\x02\x02\u010B\u0109" +
		"\x03\x02\x02\x02\u010B\u010C\x03\x02\x02\x02\u010C\u010E\x03\x02\x02\x02" +
		"\u010D\u010B\x03\x02\x02\x02\u010E\u0123\x07\xDF\x02\x02\u010F\u0110\x07" +
		"\xC3\x02\x02\u0110\u0114\x07\xDF\x02\x02\u0111\u0113\n\x02\x02\x02\u0112" +
		"\u0111\x03\x02\x02\x02\u0113\u0116\x03\x02\x02\x02\u0114\u0112\x03\x02" +
		"\x02\x02\u0114\u0115\x03\x02\x02\x02\u0115\u0117\x03\x02\x02\x02\u0116" +
		"\u0114\x03\x02\x02\x02\u0117\u0118\x07\xDF\x02\x02\u0118\u0119\x07\xC3" +
		"\x02\x02\u0119\u011D\x07\xDF\x02\x02\u011A\u011C\n\x02\x02\x02\u011B\u011A" +
		"\x03\x02\x02\x02\u011C\u011F\x03\x02\x02\x02\u011D\u011B\x03\x02\x02\x02" +
		"\u011D\u011E\x03\x02\x02\x02\u011E\u0120\x03\x02\x02\x02\u011F\u011D\x03" +
		"\x02\x02\x02\u0120\u0122\x07\xDF\x02\x02\u0121\u010F\x03\x02\x02\x02\u0122" +
		"\u0125\x03\x02\x02\x02\u0123\u0121\x03\x02\x02\x02\u0123\u0124\x03\x02" +
		"\x02\x02\u0124\u0126\x03\x02\x02\x02\u0125\u0123\x03\x02\x02\x02\u0126" +
		"\u0128\x07\xC6\x02\x02\u0127\u0129\x07\xBD\x02\x02\u0128\u0127\x03\x02" +
		"\x02\x02\u0128\u0129\x03\x02\x02\x02\u0129\u012B\x03\x02\x02\x02\u012A" +
		"\u012C\x07\x04\x02\x02\u012B\u012A\x03\x02\x02\x02\u012C\u012D\x03\x02" +
		"\x02\x02\u012D\u012B\x03\x02\x02\x02\u012D\u012E\x03\x02\x02\x02\u012E" +
		"\v\x03\x02\x02\x02\u012F\u0130\x07\'\x02\x02\u0130\u0131\x07\xC5\x02\x02" +
		"\u0131\u0132\x07\xDF\x02\x02\u0132\u0133\x07\xBC\x02\x02\u0133\u0134\x07" +
		"\xDF\x02\x02\u0134\u0136\x07\xC6\x02\x02\u0135\u0137\x07\xBD\x02\x02\u0136" +
		"\u0135\x03\x02\x02\x02\u0136\u0137\x03\x02\x02\x02\u0137\u0139\x03\x02" +
		"\x02\x02\u0138\u013A\x07\x04\x02\x02\u0139\u0138\x03\x02\x02\x02\u013A" +
		"\u013B\x03\x02\x02\x02\u013B\u0139\x03\x02\x02\x02\u013B\u013C\x03\x02" +
		"\x02\x02\u013C\r\x03\x02\x02\x02\u013D\u0149\x05\x10\t\x02\u013E\u0149" +
		"\x05\x16\f\x02\u013F\u0149\x05$\x13\x02\u0140\u0149\x05:\x1E\x02\u0141" +
		"\u0149\x05D#\x02\u0142\u0149\x05V,\x02\u0143\u0149\x05\\/\x02\u0144\u0149" +
		"\x05`1\x02\u0145\u0149\x05d3\x02\u0146\u0149\x05j6\x02";
	private static readonly _serializedATNSegment1: string =
		"\u0147\u0149\x05l7\x02\u0148\u013D\x03\x02\x02\x02\u0148\u013E\x03\x02" +
		"\x02\x02\u0148\u013F\x03\x02\x02\x02\u0148\u0140\x03\x02\x02\x02\u0148" +
		"\u0141\x03\x02\x02\x02\u0148\u0142\x03\x02\x02\x02\u0148\u0143\x03\x02" +
		"\x02\x02\u0148\u0144\x03\x02\x02\x02\u0148\u0145\x03\x02\x02\x02\u0148" +
		"\u0146\x03\x02\x02\x02\u0148\u0147\x03\x02\x02\x02\u0149\x0F\x03\x02\x02" +
		"\x02\u014A\u014B\x07\x06\x02\x02\u014B\u014D\x07\t\x02\x02\u014C\u014E" +
		"\x07\x04\x02\x02\u014D\u014C\x03\x02\x02\x02\u014E\u014F\x03\x02\x02\x02" +
		"\u014F\u014D\x03\x02\x02\x02\u014F\u0150\x03\x02\x02\x02\u0150\u0159\x03" +
		"\x02\x02\x02\u0151\u0153\x05\x12\n\x02\u0152\u0154\x07\x04\x02\x02\u0153" +
		"\u0152\x03\x02\x02\x02\u0154\u0155\x03\x02\x02\x02\u0155\u0153\x03\x02" +
		"\x02\x02\u0155\u0156\x03\x02\x02\x02\u0156\u0158\x03\x02\x02\x02\u0157" +
		"\u0151\x03\x02\x02\x02\u0158\u015B\x03\x02\x02\x02\u0159\u0157\x03\x02" +
		"\x02\x02\u0159\u015A\x03\x02\x02\x02\u015A\u015C\x03\x02\x02\x02\u015B" +
		"\u0159\x03\x02\x02\x02\u015C\u015D\x07\x07\x02\x02\u015D\u0161\x07\t\x02" +
		"\x02\u015E\u0160\x07\x04\x02\x02\u015F\u015E\x03\x02\x02\x02\u0160\u0163" +
		"\x03\x02\x02\x02\u0161\u015F\x03\x02\x02\x02\u0161\u0162\x03\x02\x02\x02" +
		"\u0162\x11\x03\x02\x02\x02\u0163\u0161\x03\x02\x02\x02\u0164\u0166\x07" +
		"\xBB\x02\x02\u0165\u0164\x03\x02\x02\x02\u0165\u0166\x03\x02\x02\x02\u0166" +
		"\u016A\x03\x02\x02\x02\u0167\u0168\x05\x14\v\x02\u0168\u0169\x07\xBE\x02" +
		"\x02\u0169\u016B\x03\x02\x02\x02\u016A\u0167\x03\x02\x02\x02\u016A\u016B" +
		"\x03\x02\x02\x02\u016B\u016C\x03\x02\x02\x02\u016C\u016E\x05\x14\v\x02" +
		"\u016D\u016F\x07\xD3\x02\x02\u016E\u016D\x03\x02\x02\x02\u016E\u016F\x03" +
		"\x02\x02\x02\u016F\u0171\x03\x02\x02\x02\u0170\u0172\x05\x8CG\x02\u0171" +
		"\u0170\x03\x02\x02\x02\u0171\u0172\x03\x02\x02\x02\u0172\x13\x03\x02\x02" +
		"\x02\u0173\u0176\x07\xBC\x02\x02\u0174\u0176\x05\x88E\x02\u0175\u0173" +
		"\x03\x02\x02\x02\u0175\u0174\x03\x02\x02\x02\u0176\x15\x03\x02\x02\x02" +
		"\u0177\u0178\x07\x06\x02\x02\u0178\u0179\x07\v\x02\x02\u0179\u017B\x07" +
		"\r\x02\x02\u017A\u017C\x07\x04\x02\x02\u017B\u017A\x03\x02\x02\x02\u017C" +
		"\u017D\x03\x02\x02\x02\u017D\u017B\x03\x02\x02\x02\u017D\u017E\x03\x02" +
		"\x02\x02\u017E\u0187\x03\x02\x02\x02\u017F\u0181\x05\x18\r\x02\u0180\u0182" +
		"\x07\x04\x02\x02\u0181\u0180\x03\x02\x02\x02\u0182\u0183\x03\x02\x02\x02" +
		"\u0183\u0181\x03\x02\x02\x02\u0183\u0184\x03\x02\x02\x02\u0184\u0186\x03" +
		"\x02\x02\x02\u0185\u017F\x03\x02\x02\x02\u0186\u0189\x03\x02\x02\x02\u0187" +
		"\u0185\x03\x02\x02\x02\u0187\u0188\x03\x02\x02\x02\u0188\u018A\x03\x02" +
		"\x02\x02\u0189\u0187\x03\x02\x02\x02\u018A\u018B\x07\x07\x02\x02\u018B" +
		"\u018C\x07\v\x02\x02\u018C\u0190\x07\r\x02\x02\u018D\u018F\x07\x04\x02" +
		"\x02\u018E\u018D\x03\x02\x02\x02\u018F\u0192\x03\x02\x02\x02\u0190\u018E" +
		"\x03\x02\x02\x02\u0190\u0191\x03\x02\x02\x02\u0191\u01C8\x03\x02\x02\x02" +
		"\u0192\u0190\x03\x02\x02\x02\u0193\u0194\x07\x06\x02\x02\u0194\u0196\x07" +
		"\f\x02\x02\u0195\u0197\x07\x04\x02\x02\u0196\u0195\x03\x02\x02\x02\u0197" +
		"\u0198\x03\x02\x02\x02\u0198\u0196\x03\x02\x02\x02\u0198\u0199\x03\x02" +
		"\x02\x02\u0199\u01A2\x03\x02\x02\x02\u019A\u019C\x05\x18\r\x02\u019B\u019D" +
		"\x07\x04\x02\x02\u019C\u019B\x03\x02\x02\x02\u019D\u019E\x03\x02\x02\x02" +
		"\u019E\u019C\x03\x02\x02\x02\u019E\u019F\x03\x02\x02\x02\u019F\u01A1\x03" +
		"\x02\x02\x02\u01A0\u019A\x03\x02\x02\x02\u01A1\u01A4\x03\x02\x02\x02\u01A2" +
		"\u01A0\x03\x02\x02\x02\u01A2\u01A3\x03\x02\x02\x02\u01A3\u01A5\x03\x02" +
		"\x02\x02\u01A4\u01A2\x03\x02\x02\x02\u01A5\u01A6\x07\x07\x02\x02\u01A6" +
		"\u01AA\x07\f\x02\x02\u01A7\u01A9\x07\x04\x02\x02\u01A8\u01A7\x03\x02\x02" +
		"\x02\u01A9\u01AC\x03\x02\x02\x02\u01AA\u01A8\x03\x02\x02\x02\u01AA\u01AB" +
		"\x03\x02\x02\x02\u01AB\u01C8\x03\x02\x02\x02\u01AC\u01AA\x03\x02\x02\x02" +
		"\u01AD\u01AE\x07\x06\x02\x02\u01AE\u01B0\x07\x16\x02\x02\u01AF\u01B1\x07" +
		"\x04\x02\x02\u01B0\u01AF\x03\x02\x02\x02\u01B1\u01B2\x03\x02\x02\x02\u01B2" +
		"\u01B0\x03\x02\x02\x02\u01B2\u01B3\x03\x02\x02\x02\u01B3\u01BC\x03\x02" +
		"\x02\x02\u01B4\u01B6\x05\x18\r\x02\u01B5\u01B7\x07\x04\x02\x02\u01B6\u01B5" +
		"\x03\x02\x02\x02\u01B7\u01B8\x03\x02\x02\x02\u01B8\u01B6\x03\x02\x02\x02" +
		"\u01B8\u01B9\x03\x02\x02\x02\u01B9\u01BB\x03\x02\x02\x02\u01BA\u01B4\x03" +
		"\x02\x02\x02\u01BB\u01BE\x03\x02\x02\x02\u01BC\u01BA\x03\x02\x02\x02\u01BC" +
		"\u01BD\x03\x02\x02\x02\u01BD\u01BF\x03\x02\x02\x02\u01BE\u01BC\x03\x02" +
		"\x02\x02\u01BF\u01C0\x07\x07\x02\x02\u01C0\u01C4\x07\x16\x02\x02\u01C1" +
		"\u01C3\x07\x04\x02\x02\u01C2\u01C1\x03\x02\x02\x02\u01C3\u01C6\x03\x02" +
		"\x02\x02\u01C4\u01C2\x03\x02\x02\x02\u01C4\u01C5\x03\x02\x02\x02\u01C5" +
		"\u01C8\x03\x02\x02\x02\u01C6\u01C4\x03\x02\x02\x02\u01C7\u0177\x03\x02" +
		"\x02\x02\u01C7\u0193\x03\x02\x02\x02\u01C7\u01AD\x03\x02\x02\x02\u01C8" +
		"\x17\x03\x02\x02\x02\u01C9\u01CA\x07\xBC\x02\x02\u01CA\u01CC\x07\xBE\x02" +
		"\x02\u01CB\u01C9\x03\x02\x02\x02\u01CB\u01CC\x03\x02\x02\x02\u01CC\u01CD" +
		"\x03\x02\x02\x02\u01CD\u01CF\x05\x1A\x0E\x02\u01CE\u01D0\x07\x19\x02\x02" +
		"\u01CF\u01CE\x03\x02\x02\x02\u01CF\u01D0\x03\x02\x02\x02\u01D0\x19\x03" +
		"\x02\x02\x02\u01D1\u01D7\x07\xBC\x02\x02\u01D2\u01D4\x07\xC5\x02\x02\u01D3" +
		"\u01D5\x05\x1C\x0F\x02\u01D4\u01D3\x03\x02\x02\x02\u01D4\u01D5\x03\x02" +
		"\x02\x02\u01D5\u01D6\x03\x02\x02\x02\u01D6\u01D8\x07\xC6\x02\x02\u01D7" +
		"\u01D2\x03\x02\x02\x02\u01D7\u01D8\x03\x02\x02\x02\u01D8\x1B\x03\x02\x02" +
		"\x02\u01D9\u01DB\x05\x1E\x10\x02\u01DA\u01D9\x03\x02\x02\x02\u01DA\u01DB" +
		"\x03\x02\x02\x02\u01DB\u01E2\x03\x02\x02\x02\u01DC\u01DE\x07\xC3\x02\x02" +
		"\u01DD\u01DF\x05\x1E\x10\x02\u01DE\u01DD\x03\x02\x02\x02\u01DE\u01DF\x03" +
		"\x02\x02\x02\u01DF\u01E1\x03\x02\x02\x02\u01E0\u01DC\x03\x02\x02\x02\u01E1" +
		"\u01E4\x03\x02\x02\x02\u01E2\u01E0\x03\x02\x02\x02\u01E2\u01E3\x03\x02" +
		"\x02\x02\u01E3\x1D\x03\x02\x02\x02\u01E4\u01E2\x03\x02\x02\x02\u01E5\u01E8" +
		"\x07\xBC\x02\x02\u01E6\u01E7\x07\xCA\x02\x02\u01E7\u01E9\x05 \x11\x02" +
		"\u01E8\u01E6\x03\x02\x02\x02\u01E8\u01E9\x03\x02\x02\x02\u01E9\x1F\x03" +
		"\x02\x02\x02\u01EA\u01EF\x05\"\x12\x02\u01EB\u01EC\x07\xCA\x02\x02\u01EC" +
		"\u01EE\x05\"\x12\x02\u01ED\u01EB\x03\x02\x02\x02\u01EE\u01F1\x03\x02\x02" +
		"\x02\u01EF\u01ED\x03\x02\x02\x02\u01EF\u01F0\x03\x02\x02\x02\u01F0!\x03" +
		"\x02\x02\x02\u01F1\u01EF\x03\x02\x02\x02\u01F2\u01F8\x07\xBC\x02\x02\u01F3" +
		"\u01F5\x07\xBB\x02\x02\u01F4\u01F6\x07\xBC\x02\x02\u01F5\u01F4\x03\x02" +
		"\x02\x02\u01F5\u01F6\x03\x02\x02\x02\u01F6\u01F8\x03\x02\x02\x02\u01F7" +
		"\u01F2\x03\x02\x02\x02\u01F7\u01F3\x03\x02\x02\x02\u01F8#\x03\x02\x02" +
		"\x02\u01F9\u01FD\x07\x06\x02\x02\u01FA\u01FB\x07\x0E\x02\x02\u01FB\u01FE" +
		"\x07\x0F\x02\x02\u01FC\u01FE\x07\x0F\x02\x02\u01FD\u01FA\x03\x02\x02\x02" +
		"\u01FD\u01FC\x03\x02\x02\x02\u01FE\u0200\x03\x02\x02\x02\u01FF\u0201\x07" +
		"\x04\x02\x02\u0200\u01FF\x03\x02\x02\x02\u0201\u0202\x03\x02\x02\x02\u0202" +
		"\u0200\x03\x02\x02\x02\u0202\u0203\x03\x02\x02\x02\u0203\u020C\x03\x02" +
		"\x02\x02\u0204\u0206\x05&\x14\x02\u0205\u0207\x07\x04\x02\x02\u0206\u0205" +
		"\x03\x02\x02\x02\u0207\u0208\x03\x02\x02\x02\u0208\u0206\x03\x02\x02\x02" +
		"\u0208\u0209\x03\x02\x02\x02\u0209\u020B\x03\x02\x02\x02\u020A\u0204\x03" +
		"\x02\x02\x02\u020B\u020E\x03\x02\x02\x02\u020C\u020A\x03\x02\x02\x02\u020C" +
		"\u020D\x03\x02\x02\x02\u020D\u020F\x03\x02\x02\x02\u020E\u020C\x03\x02" +
		"\x02\x02\u020F\u0213\x07\x07\x02\x02\u0210\u0211\x07\x0E\x02\x02\u0211" +
		"\u0214\x07\x0F\x02\x02\u0212\u0214\x07\x0F\x02\x02\u0213\u0210\x03\x02" +
		"\x02\x02\u0213\u0212\x03\x02\x02\x02\u0214\u0218\x03\x02\x02\x02\u0215" +
		"\u0217\x07\x04\x02\x02\u0216\u0215\x03\x02\x02\x02\u0217\u021A\x03\x02" +
		"\x02\x02\u0218\u0216\x03\x02\x02\x02\u0218\u0219\x03\x02\x02\x02\u0219" +
		"%\x03\x02\x02\x02\u021A\u0218\x03\x02\x02\x02\u021B\u021D\x07\xBB\x02" +
		"\x02\u021C\u021B\x03\x02\x02\x02\u021C\u021D\x03\x02\x02\x02\u021D\u0220" +
		"\x03\x02\x02\x02\u021E\u021F\x07\xBC\x02\x02\u021F\u0221\x07\xBE\x02\x02" +
		"\u0220\u021E\x03\x02\x02\x02\u0220\u0221\x03\x02\x02\x02\u0221\u0223\x03" +
		"\x02\x02\x02\u0222\u0224\x07\xC9\x02\x02\u0223\u0222\x03\x02\x02\x02\u0223" +
		"\u0224\x03\x02\x02\x02\u0224\u0228\x03\x02\x02\x02\u0225\u0226\x07\xCB" +
		"\x02\x02\u0226\u0227\x07\xBC\x02\x02\u0227\u0229\x07\xBE\x02\x02\u0228" +
		"\u0225\x03\x02\x02\x02\u0228\u0229\x03\x02\x02\x02\u0229\u022A\x03\x02" +
		"\x02\x02\u022A\u022C\x05(\x15\x02\u022B\u022D\x05\x8CG\x02\u022C\u022B" +
		"\x03\x02\x02\x02\u022C\u022D\x03\x02\x02\x02\u022D\'\x03\x02\x02\x02\u022E" +
		"\u022F\x07\xCB\x02\x02\u022F\u0230\x07\xBC\x02\x02\u0230\u0232\x07\xBE" +
		"\x02\x02\u0231\u022E\x03\x02\x02\x02\u0231\u0232\x03\x02\x02\x02\u0232" +
		"\u0233\x03\x02\x02\x02\u0233\u0235\x05,\x17\x02\u0234\u0236\x05*\x16\x02" +
		"\u0235\u0234\x03\x02\x02\x02\u0235\u0236\x03\x02\x02\x02\u0236\u023E\x03" +
		"\x02\x02\x02\u0237\u0238\x07\xC4\x02\x02\u0238\u023A\x05,\x17\x02\u0239" +
		"\u023B\x05*\x16\x02\u023A\u0239\x03\x02\x02\x02\u023A\u023B\x03\x02\x02" +
		"\x02\u023B\u023D\x03\x02\x02\x02\u023C\u0237\x03\x02\x02\x02\u023D\u0240" +
		"\x03\x02\x02\x02\u023E\u023C\x03\x02\x02\x02\u023E\u023F\x03\x02\x02\x02" +
		"\u023F\u0243\x03\x02\x02\x02\u0240\u023E\x03\x02\x02\x02\u0241\u0242\x07" +
		"\xCB\x02\x02\u0242\u0244\x07\xBC\x02\x02\u0243\u0241\x03\x02\x02\x02\u0243" +
		"\u0244\x03\x02\x02\x02\u0244)\x03\x02\x02\x02\u0245\u0246\x07\xCB\x02" +
		"\x02\u0246\u0247\x07\xBC\x02\x02\u0247+\x03\x02\x02\x02\u0248\u024E\x07" +
		"\xBC\x02\x02\u0249\u024B\x07\xC5\x02\x02\u024A\u024C\x050\x19\x02\u024B" +
		"\u024A\x03\x02\x02\x02\u024B\u024C\x03\x02\x02\x02\u024C\u024D\x03\x02" +
		"\x02\x02\u024D\u024F\x07\xC6\x02\x02\u024E\u0249\x03\x02\x02\x02\u024E" +
		"\u024F\x03\x02\x02\x02\u024F\u0251\x03\x02\x02\x02\u0250\u0252\x05.\x18" +
		"\x02\u0251\u0250\x03\x02\x02\x02\u0251\u0252\x03\x02\x02\x02\u0252-\x03" +
		"\x02\x02\x02\u0253\u0254\x07\xDB\x02\x02\u0254\u0255\x07\xBB\x02\x02\u0255" +
		"/\x03\x02\x02\x02\u0256\u0258\x052\x1A\x02\u0257\u0256\x03\x02\x02\x02" +
		"\u0257\u0258\x03\x02\x02\x02\u0258\u025F\x03\x02\x02\x02\u0259\u025B\x07" +
		"\xC3\x02\x02\u025A\u025C\x052\x1A\x02\u025B\u025A\x03\x02\x02\x02\u025B" +
		"\u025C\x03\x02\x02\x02\u025C\u025E\x03\x02\x02\x02\u025D\u0259\x03\x02" +
		"\x02\x02\u025E\u0261\x03\x02\x02\x02\u025F\u025D\x03\x02\x02\x02\u025F" +
		"\u0260\x03\x02\x02\x02\u02601\x03\x02\x02\x02\u0261\u025F\x03\x02\x02" +
		"\x02\u0262\u0268\x07\xBC\x02\x02\u0263\u0264\x07\xCA\x02\x02\u0264\u0267" +
		"\x054\x1B\x02\u0265\u0267\x056\x1C\x02\u0266\u0263\x03\x02\x02\x02\u0266" +
		"\u0265\x03\x02\x02\x02\u0267\u026A\x03\x02\x02\x02\u0268\u0266\x03\x02" +
		"\x02\x02\u0268\u0269\x03\x02\x02\x02\u02693\x03\x02\x02\x02\u026A\u0268" +
		"\x03\x02\x02\x02\u026B\u0272\x07\xBC\x02\x02\u026C\u026E\x07\xBB\x02\x02" +
		"\u026D\u026F\x07\xBC\x02\x02\u026E\u026D\x03\x02\x02\x02\u026E\u026F\x03" +
		"\x02\x02\x02\u026F\u0272\x03\x02\x02\x02\u0270\u0272\x07\xDD\x02\x02\u0271" +
		"\u026B\x03\x02\x02\x02\u0271\u026C\x03\x02\x02\x02\u0271\u0270\x03\x02" +
		"\x02\x02\u02725\x03\x02\x02\x02\u0273\u0274\x07\xDE\x02\x02\u0274\u027C" +
		"\x058\x1D\x02\u0275\u0276\x07\xDE\x02\x02\u0276\u027C\x07\xD9\x02\x02" +
		"\u0277\u0278\x07\xDE\x02\x02\u0278\u027C\x07\xDD\x02\x02\u0279\u027A\x07" +
		"\xDE\x02\x02\u027A\u027C\x07\xD8\x02\x02\u027B\u0273\x03\x02\x02\x02\u027B" +
		"\u0275\x03\x02\x02\x02\u027B\u0277\x03\x02\x02\x02\u027B\u0279\x03\x02" +
		"\x02\x02\u027C7\x03\x02\x02\x02\u027D\u027E\t\x03\x02\x02\u027E9\x03\x02" +
		"\x02\x02\u027F\u0280\x07\x06\x02\x02\u0280\u0282\x07\x10\x02\x02\u0281" +
		"\u0283\x07\x04\x02\x02\u0282\u0281\x03\x02\x02\x02\u0283\u0284\x03\x02" +
		"\x02\x02\u0284\u0282\x03\x02\x02\x02\u0284\u0285\x03\x02\x02\x02\u0285" +
		"\u028E\x03\x02\x02\x02\u0286\u0288\x05<\x1F\x02\u0287\u0289\x07\x04\x02" +
		"\x02\u0288\u0287\x03\x02\x02\x02\u0289\u028A\x03\x02\x02\x02\u028A\u0288" +
		"\x03\x02\x02\x02\u028A\u028B\x03\x02\x02\x02\u028B\u028D\x03\x02\x02\x02" +
		"\u028C\u0286\x03\x02\x02\x02\u028D\u0290\x03\x02\x02\x02\u028E\u028C\x03" +
		"\x02\x02\x02\u028E\u028F\x03\x02\x02\x02\u028F\u0291\x03\x02\x02\x02\u0290" +
		"\u028E\x03\x02\x02\x02\u0291\u0292\x07\x07\x02\x02\u0292\u0296\x07\x10" +
		"\x02\x02\u0293\u0295\x07\x04\x02\x02\u0294\u0293\x03\x02\x02\x02\u0295" +
		"\u0298\x03\x02\x02\x02\u0296\u0294\x03\x02\x02\x02\u0296\u0297\x03\x02" +
		"\x02\x02\u0297;\x03\x02\x02\x02\u0298\u0296\x03\x02\x02\x02\u0299\u029A" +
		"\x07\xBC\x02\x02\u029A\u029C\x07\xBE\x02\x02\u029B\u0299\x03\x02\x02\x02" +
		"\u029B\u029C\x03\x02\x02\x02\u029C\u029E\x03\x02\x02\x02\u029D\u029F\x05" +
		"> \x02\u029E\u029D\x03\x02\x02\x02\u029E\u029F\x03\x02\x02\x02\u029F\u02A0" +
		"\x03\x02\x02\x02\u02A0\u02A1\x07\xBC\x02\x02\u02A1\u02A2\x05@!\x02\u02A2" +
		"=\x03\x02\x02\x02\u02A3\u02A4\t\x04\x02\x02\u02A4?\x03\x02\x02\x02\u02A5" +
		"\u02AC\x05B\"\x02\u02A6\u02A8\x07\xC3\x02\x02\u02A7\u02A6\x03\x02\x02" +
		"\x02\u02A7\u02A8\x03\x02\x02\x02\u02A8\u02A9\x03\x02\x02\x02\u02A9\u02AB" +
		"\x05B\"\x02\u02AA\u02A7\x03\x02\x02\x02\u02AB\u02AE\x03\x02\x02\x02\u02AC" +
		"\u02AA\x03\x02\x02\x02\u02AC\u02AD\x03\x02\x02\x02\u02ADA\x03\x02\x02" +
		"\x02\u02AE\u02AC\x03\x02\x02\x02\u02AF\u02B4\x05(\x15\x02\u02B0\u02B1" +
		"\x07\xBC\x02\x02\u02B1\u02B2\t\x05\x02\x02\u02B2\u02B4\x07\xBB\x02\x02" +
		"\u02B3\u02AF\x03\x02\x02\x02\u02B3\u02B0\x03\x02\x02\x02\u02B4C\x03\x02" +
		"\x02\x02\u02B5\u02B6\x07\x06\x02\x02\u02B6\u02B7\x07\x12\x02\x02\u02B7" +
		"\u02B9\x07\x14\x02\x02\u02B8\u02BA\x07\x04\x02\x02\u02B9\u02B8\x03\x02" +
		"\x02\x02\u02BA\u02BB\x03\x02\x02\x02\u02BB\u02B9\x03\x02\x02\x02\u02BB" +
		"\u02BC\x03\x02\x02\x02\u02BC\u02C5\x03\x02\x02\x02\u02BD\u02BF\x05F$\x02" +
		"\u02BE\u02C0\x07\x04\x02\x02\u02BF\u02BE\x03\x02\x02\x02\u02C0\u02C1\x03" +
		"\x02\x02\x02\u02C1\u02BF\x03\x02\x02\x02\u02C1\u02C2\x03\x02\x02\x02\u02C2" +
		"\u02C4\x03\x02\x02\x02\u02C3\u02BD\x03\x02\x02\x02\u02C4\u02C7\x03\x02" +
		"\x02\x02\u02C5\u02C3\x03\x02\x02\x02\u02C5\u02C6\x03\x02\x02\x02\u02C6" +
		"\u02C8\x03\x02\x02\x02\u02C7\u02C5\x03\x02\x02\x02\u02C8\u02C9\x07\x07" +
		"\x02\x02\u02C9\u02CA\x07\x12\x02\x02\u02CA\u02CE\x07\x14\x02\x02\u02CB" +
		"\u02CD\x07\x04\x02\x02\u02CC\u02CB\x03\x02\x02\x02\u02CD\u02D0\x03\x02" +
		"\x02\x02\u02CE\u02CC\x03\x02\x02\x02\u02CE\u02CF\x03\x02\x02\x02\u02CF" +
		"\u0306\x03\x02\x02\x02\u02D0\u02CE\x03\x02\x02\x02\u02D1\u02D2\x07\x06" +
		"\x02\x02\u02D2\u02D4\x07\x15\x02\x02\u02D3\u02D5\x07\x04\x02\x02\u02D4" +
		"\u02D3\x03\x02\x02\x02\u02D5\u02D6\x03\x02\x02\x02\u02D6\u02D4\x03\x02" +
		"\x02\x02\u02D6\u02D7\x03\x02\x02\x02\u02D7\u02E0\x03\x02\x02\x02\u02D8" +
		"\u02DA\x05F$\x02\u02D9\u02DB\x07\x04\x02\x02\u02DA\u02D9\x03\x02\x02\x02" +
		"\u02DB\u02DC\x03\x02\x02\x02\u02DC\u02DA\x03\x02\x02\x02\u02DC\u02DD\x03" +
		"\x02\x02\x02\u02DD\u02DF\x03\x02\x02\x02\u02DE\u02D8\x03\x02\x02\x02\u02DF" +
		"\u02E2\x03\x02\x02\x02\u02E0\u02DE\x03\x02\x02\x02\u02E0\u02E1\x03\x02" +
		"\x02\x02\u02E1\u02E3\x03\x02\x02\x02\u02E2\u02E0\x03\x02\x02\x02\u02E3" +
		"\u02E4\x07\x07\x02\x02\u02E4\u02E8\x07\x15\x02\x02\u02E5\u02E7\x07\x04" +
		"\x02\x02\u02E6\u02E5\x03\x02\x02\x02\u02E7\u02EA\x03\x02\x02\x02\u02E8" +
		"\u02E6\x03\x02\x02\x02\u02E8\u02E9\x03\x02\x02\x02\u02E9\u0306\x03\x02" +
		"\x02\x02\u02EA\u02E8\x03\x02\x02\x02\u02EB\u02EC\x07\x06\x02\x02\u02EC" +
		"\u02EE\x07\x13\x02\x02\u02ED\u02EF\x07\x04\x02\x02\u02EE\u02ED\x03\x02" +
		"\x02\x02\u02EF\u02F0\x03\x02\x02\x02\u02F0\u02EE\x03\x02\x02\x02\u02F0" +
		"\u02F1\x03\x02\x02\x02\u02F1\u02FA\x03\x02\x02\x02\u02F2\u02F4\x05F$\x02" +
		"\u02F3\u02F5\x07\x04\x02\x02\u02F4\u02F3\x03\x02\x02\x02\u02F5\u02F6\x03" +
		"\x02\x02\x02\u02F6\u02F4\x03\x02\x02\x02\u02F6\u02F7\x03\x02\x02\x02\u02F7" +
		"\u02F9\x03\x02\x02\x02\u02F8\u02F2\x03\x02\x02\x02\u02F9\u02FC\x03\x02" +
		"\x02\x02\u02FA\u02F8\x03\x02\x02\x02\u02FA\u02FB\x03\x02\x02\x02\u02FB" +
		"\u02FD\x03\x02\x02\x02\u02FC\u02FA\x03\x02\x02\x02\u02FD\u02FE\x07\x07" +
		"\x02\x02\u02FE\u0302\x07\x13\x02\x02\u02FF\u0301\x07\x04\x02\x02\u0300" +
		"\u02FF\x03\x02\x02\x02\u0301\u0304\x03\x02\x02\x02\u0302\u0300\x03\x02" +
		"\x02\x02\u0302\u0303\x03\x02\x02\x02\u0303\u0306\x03\x02\x02\x02\u0304" +
		"\u0302\x03\x02\x02\x02\u0305\u02B5\x03\x02\x02\x02\u0305\u02D1\x03\x02" +
		"\x02\x02\u0305\u02EB\x03\x02\x02\x02\u0306E\x03\x02\x02\x02\u0307\u0309" +
		"\x05H%\x02\u0308\u0307\x03\x02\x02\x02\u0308\u0309\x03\x02\x02\x02\u0309" +
		"\u030E\x03\x02\x02\x02\u030A\u030B\x07\xC1\x02\x02\u030B\u030C\x05R*\x02" +
		"\u030C\u030D\x07\xC2\x02\x02\u030D\u030F\x03\x02\x02\x02\u030E\u030A\x03" +
		"\x02\x02\x02\u030E\u030F\x03\x02\x02\x02\u030F\u0310\x03\x02\x02\x02\u0310" +
		"\u0311\x05J&\x02\u0311\u0312\x05N(\x02\u0312\u0313\x05L\'\x02\u0313\u0315" +
		"\x05P)\x02\u0314\u0316\x05R*\x02\u0315\u0314\x03\x02\x02\x02\u0315\u0316" +
		"\x03\x02\x02\x02\u0316G\x03\x02\x02\x02\u0317\u0321\t\x03\x02\x02\u0318" +
		"\u0320\x07\xBC\x02\x02\u0319\u0320\x07\xBB\x02\x02\u031A\u031C\x07\xC5" +
		"\x02\x02\u031B\u031D\x07\xBC\x02\x02\u031C\u031B\x03\x02\x02\x02\u031C" +
		"\u031D\x03\x02\x02\x02\u031D\u031E\x03\x02\x02\x02\u031E\u0320\x07\xC6" +
		"\x02\x02\u031F\u0318\x03\x02\x02\x02\u031F\u0319\x03\x02\x02\x02\u031F" +
		"\u031A\x03\x02\x02\x02\u0320\u0323\x03\x02\x02\x02\u0321\u031F\x03\x02" +
		"\x02\x02\u0321\u0322\x03\x02\x02\x02\u0322\u0324\x03\x02\x02\x02\u0323" +
		"\u0321\x03\x02\x02\x02\u0324\u0327\x07\xBE\x02\x02\u0325\u0327\x07\xBB" +
		"\x02\x02\u0326\u0317\x03\x02\x02\x02\u0326\u0325\x03\x02\x02\x02\u0327" +
		"I\x03\x02\x02\x02\u0328\u032D\x05(\x15\x02\u0329\u032A\x07\xD9\x02\x02" +
		"\u032A\u032C\x05(\x15\x02\u032B\u0329\x03\x02\x02\x02\u032C\u032F\x03" +
		"\x02\x02\x02\u032D\u032B\x03\x02\x02\x02\u032D\u032E\x03\x02\x02\x02\u032E" +
		"\u0332\x03\x02\x02\x02\u032F\u032D\x03\x02\x02\x02\u0330\u0332\x07\xBB" +
		"\x02\x02\u0331\u0328\x03\x02\x02\x02\u0331\u0330\x03\x02\x02\x02\u0332" +
		"K\x03\x02\x02\x02\u0333\u0338\x05(\x15\x02\u0334\u0335\x07\xD9\x02\x02" +
		"\u0335\u0337\x05(\x15\x02\u0336\u0334\x03\x02\x02\x02\u0337\u033A\x03" +
		"\x02\x02\x02\u0338\u0336\x03\x02\x02\x02\u0338\u0339\x03\x02\x02\x02\u0339" +
		"\u033D\x03\x02\x02\x02\u033A\u0338\x03\x02\x02\x02\u033B\u033D\x07\xBB" +
		"\x02\x02\u033C\u0333\x03\x02\x02\x02\u033C\u033B\x03\x02\x02\x02\u033D" +
		"M\x03\x02\x02\x02\u033E\u033F\t\x06\x02\x02\u033FO\x03\x02\x02\x02\u0340" +
		"\u0343\x05\x8CG\x02\u0341\u0342\x07\xC3\x02\x02\u0342\u0344\x05\x8CG\x02" +
		"\u0343\u0341\x03\x02\x02\x02\u0343\u0344\x03\x02\x02\x02\u0344Q\x03\x02" +
		"\x02\x02\u0345\u0369\x07\x1E\x02\x02\u0346\u0369\x07\x1F\x02\x02\u0347" +
		"\u0369\x07\x1D\x02\x02\u0348\u0369\x07$\x02\x02\u0349\u034A\x07\x9E\x02" +
		"\x02\u034A\u034B\x07\xD3\x02\x02\u034B\u0369\x05\x8CG\x02\u034C\u034D" +
		"\x07 \x02\x02\u034D\u034E\x07\xC5\x02\x02\u034E\u034F\x07\xBB\x02\x02" +
		"\u034F\u0350\x07\xC3\x02\x02\u0350\u0351\x05T+\x02\u0351\u0352\x07\xC6" +
		"\x02\x02\u0352\u0369\x03\x02\x02\x02\u0353\u0354\x07\"\x02\x02\u0354\u0355" +
		"\x07\xC5\x02\x02\u0355\u0356\x07\xBB\x02\x02\u0356\u0357\x07\xC3\x02\x02" +
		"\u0357\u0358\x05T+\x02\u0358\u0359\x07\xC6\x02\x02\u0359\u0369\x03\x02" +
		"\x02\x02\u035A\u035B\x07!\x02\x02\u035B\u035C\x07\xC5\x02\x02\u035C\u035D" +
		"\x07\xBB\x02\x02\u035D\u035E\x07\xC3\x02\x02\u035E\u035F\x05T+\x02\u035F" +
		"\u0360\x07\xC6\x02\x02\u0360\u0369\x03\x02\x02\x02\u0361\u0362\x07#\x02" +
		"\x02\u0362\u0363\x07\xC5\x02\x02\u0363\u0364\x07\xBB\x02\x02\u0364\u0365" +
		"\x07\xC3\x02\x02\u0365\u0366\x05T+\x02\u0366\u0367\x07\xC6\x02\x02\u0367" +
		"\u0369\x03\x02\x02\x02\u0368\u0345\x03\x02\x02\x02\u0368\u0346\x03\x02" +
		"\x02\x02\u0368\u0347\x03\x02\x02\x02\u0368\u0348\x03\x02\x02\x02\u0368" +
		"\u0349\x03\x02\x02\x02\u0368\u034C\x03\x02\x02\x02\u0368\u0353\x03\x02" +
		"\x02\x02\u0368\u035A\x03\x02\x02\x02\u0368\u0361\x03\x02\x02\x02\u0369" +
		"S\x03\x02\x02\x02\u036A\u036F\x05(\x15\x02\u036B\u036C\x07\xC3\x02\x02" +
		"\u036C\u036E\x05(\x15\x02\u036D\u036B\x03\x02\x02\x02\u036E\u0371\x03" +
		"\x02\x02\x02\u036F\u036D\x03\x02\x02\x02\u036F\u0370\x03\x02\x02\x02\u0370" +
		"U\x03\x02\x02\x02\u0371\u036F\x03\x02\x02\x02\u0372\u0373\x07\x06\x02" +
		"\x02\u0373\u0375\x07\x11\x02\x02\u0374\u0376\x07\x04\x02\x02\u0375\u0374" +
		"\x03\x02\x02\x02\u0376\u0377\x03\x02\x02\x02\u0377\u0375\x03\x02\x02\x02" +
		"\u0377\u0378\x03\x02\x02\x02\u0378\u0381\x03\x02\x02\x02\u0379\u037B\x05" +
		"X-\x02\u037A\u037C\x07\x04\x02\x02\u037B\u037A\x03\x02\x02\x02\u037C\u037D" +
		"\x03\x02\x02\x02\u037D\u037B\x03\x02\x02\x02\u037D\u037E\x03\x02\x02\x02" +
		"\u037E\u0380\x03\x02\x02\x02\u037F\u0379\x03\x02\x02\x02\u0380\u0383\x03" +
		"\x02\x02\x02\u0381\u037F\x03\x02\x02\x02\u0381\u0382\x03\x02\x02\x02\u0382" +
		"\u0384\x03\x02\x02\x02\u0383\u0381\x03\x02\x02\x02\u0384\u0385\x07\x07" +
		"\x02\x02\u0385\u0389\x07\x11\x02\x02\u0386\u0388\x07\x04\x02\x02\u0387" +
		"\u0386\x03\x02\x02\x02\u0388\u038B\x03\x02\x02\x02\u0389\u0387\x03\x02" +
		"\x02\x02\u0389\u038A\x03\x02\x02\x02\u038AW\x03\x02\x02\x02\u038B\u0389" +
		"\x03\x02\x02\x02\u038C\u038D\x07\xBC\x02\x02\u038D\u038F\x07\xBE\x02\x02" +
		"\u038E\u038C\x03\x02\x02\x02\u038E\u038F\x03\x02\x02\x02\u038F\u0390\x03" +
		"\x02\x02\x02\u0390\u0396\x07\xBC\x02\x02\u0391\u0393\x07\xC5\x02\x02\u0392" +
		"\u0394\x05Z.\x02\u0393\u0392\x03\x02\x02\x02\u0393\u0394\x03\x02\x02\x02" +
		"\u0394\u0395\x03\x02\x02\x02\u0395\u0397\x07\xC6\x02\x02\u0396\u0391\x03" +
		"\x02\x02\x02\u0396\u0397\x03\x02\x02\x02\u0397\u0399\x03\x02\x02\x02\u0398" +
		"\u039A\x07\xD3\x02\x02\u0399\u0398\x03\x02\x02\x02\u0399\u039A\x03\x02" +
		"\x02\x02\u039A\u039B\x03\x02\x02\x02\u039B\u039C\x05\x8CG\x02\u039CY\x03" +
		"\x02\x02\x02\u039D\u03A2\x07\xBC\x02\x02\u039E\u039F\x07\xC3\x02\x02\u039F" +
		"\u03A1\x07\xBC\x02\x02\u03A0\u039E\x03\x02\x02\x02\u03A1\u03A4\x03\x02" +
		"\x02\x02\u03A2\u03A0\x03\x02\x02\x02\u03A2\u03A3\x03\x02\x02\x02\u03A3" +
		"[\x03\x02\x02\x02\u03A4\u03A2\x03\x02\x02\x02\u03A5\u03A6\x07\x06\x02" +
		"\x02\u03A6\u03A8\x07\n\x02\x02\u03A7\u03A9\x07\x04\x02\x02\u03A8\u03A7" +
		"\x03\x02\x02\x02\u03A9\u03AA\x03\x02\x02\x02\u03AA\u03A8\x03\x02\x02\x02" +
		"\u03AA\u03AB\x03\x02\x02\x02\u03AB\u03B4\x03\x02\x02\x02\u03AC\u03AE\x05" +
		"^0\x02\u03AD\u03AF\x07\x04\x02\x02\u03AE\u03AD\x03\x02\x02\x02\u03AF\u03B0" +
		"\x03\x02\x02\x02\u03B0\u03AE\x03\x02\x02\x02\u03B0\u03B1\x03\x02\x02\x02" +
		"\u03B1\u03B3\x03\x02\x02\x02\u03B2\u03AC\x03\x02\x02\x02\u03B3\u03B6\x03" +
		"\x02\x02\x02\u03B4\u03B2\x03\x02\x02\x02\u03B4\u03B5\x03\x02\x02\x02\u03B5" +
		"\u03B7\x03\x02\x02\x02\u03B6\u03B4\x03\x02\x02\x02\u03B7\u03B8\x07\x07" +
		"\x02\x02\u03B8\u03BC\x07\n\x02\x02\u03B9\u03BB\x07\x04\x02\x02\u03BA\u03B9" +
		"\x03\x02\x02\x02\u03BB\u03BE\x03\x02\x02\x02\u03BC\u03BA\x03\x02\x02\x02" +
		"\u03BC\u03BD\x03\x02\x02\x02\u03BD]\x03\x02\x02\x02\u03BE\u03BC\x03\x02" +
		"\x02\x02\u03BF\u03C0\x07\xBC\x02\x02\u03C0\u03C2\x07\xBE\x02\x02\u03C1" +
		"\u03BF\x03\x02\x02\x02\u03C1\u03C2\x03\x02\x02\x02\u03C2\u03C3\x03\x02" +
		"\x02\x02\u03C3\u03C4\x07\xBC\x02\x02\u03C4\u03C5\x07\xBB\x02\x02\u03C5" +
		"\u03C7\x05\x8CG\x02\u03C6\u03C8\x07\xBC\x02\x02\u03C7\u03C6\x03\x02\x02" +
		"\x02\u03C7\u03C8\x03\x02\x02\x02\u03C8_\x03\x02\x02\x02\u03C9\u03CA\x07" +
		"\x06\x02\x02\u03CA\u03CB\x07\x1B\x02\x02\u03CB\u03CD\x07\x1C\x02\x02\u03CC" +
		"\u03CE\x07\x04\x02\x02\u03CD\u03CC\x03\x02\x02\x02\u03CE\u03CF\x03\x02" +
		"\x02\x02\u03CF\u03CD\x03\x02\x02\x02\u03CF\u03D0\x03\x02\x02\x02\u03D0" +
		"\u03D9\x03\x02\x02\x02\u03D1\u03D3\x05b2\x02\u03D2\u03D4\x07\x04\x02\x02" +
		"\u03D3\u03D2\x03\x02\x02\x02\u03D4\u03D5\x03\x02\x02\x02\u03D5\u03D3\x03" +
		"\x02\x02\x02\u03D5\u03D6\x03\x02\x02\x02\u03D6\u03D8\x03\x02\x02\x02\u03D7" +
		"\u03D1\x03\x02\x02\x02\u03D8\u03DB\x03\x02\x02\x02\u03D9\u03D7\x03\x02" +
		"\x02\x02\u03D9\u03DA\x03\x02\x02\x02\u03DA\u03DC\x03\x02\x02\x02\u03DB" +
		"\u03D9\x03\x02\x02\x02\u03DC\u03DD\x07\x07\x02\x02\u03DD\u03DE\x07\x1B" +
		"\x02\x02\u03DE\u03E2\x07\x1C\x02\x02\u03DF\u03E1\x07\x04\x02\x02\u03E0" +
		"\u03DF\x03\x02\x02\x02\u03E1\u03E4\x03\x02\x02\x02\u03E2\u03E0\x03\x02" +
		"\x02\x02\u03E2\u03E3\x03\x02\x02\x02\u03E3a\x03\x02\x02\x02\u03E4\u03E2" +
		"\x03\x02\x02\x02\u03E5\u03E6\x07\xBC\x02\x02\u03E6\u03E8\x07\xBE\x02\x02" +
		"\u03E7\u03E5\x03\x02\x02\x02\u03E7\u03E8\x03\x02\x02\x02\u03E8\u03E9\x03" +
		"\x02\x02\x02\u03E9\u03EA\x05(\x15\x02\u03EA\u03EB\x05\x8CG\x02\u03EBc" +
		"\x03\x02\x02\x02\u03EC\u03ED\x07\x06\x02\x02\u03ED\u03EE\x07\x19\x02\x02" +
		"\u03EE\u03F0\x07\x1A\x02\x02\u03EF\u03F1\x07\x04\x02\x02\u03F0\u03EF\x03" +
		"\x02\x02\x02\u03F1\u03F2\x03\x02\x02\x02\u03F2\u03F0\x03\x02\x02\x02\u03F2" +
		"\u03F3\x03\x02\x02\x02\u03F3\u03FC\x03\x02\x02\x02\u03F4\u03F6\x05f4\x02" +
		"\u03F5\u03F7\x07\x04\x02\x02\u03F6\u03F5\x03\x02\x02\x02\u03F7\u03F8\x03" +
		"\x02\x02\x02\u03F8\u03F6\x03\x02\x02\x02\u03F8\u03F9\x03\x02\x02\x02\u03F9" +
		"\u03FB\x03\x02\x02\x02\u03FA\u03F4\x03\x02\x02\x02\u03FB\u03FE";
	private static readonly _serializedATNSegment2: string =
		"\x03\x02\x02\x02\u03FC\u03FA\x03\x02\x02\x02\u03FC\u03FD\x03\x02\x02\x02" +
		"\u03FD\u03FF\x03\x02\x02\x02\u03FE\u03FC\x03\x02\x02\x02\u03FF\u0400\x07" +
		"\x07\x02\x02\u0400\u0401\x07\x19\x02\x02\u0401\u0405\x07\x1A\x02\x02\u0402" +
		"\u0404\x07\x04\x02\x02\u0403\u0402\x03\x02\x02\x02\u0404\u0407\x03\x02" +
		"\x02\x02\u0405\u0403\x03\x02\x02\x02\u0405\u0406\x03\x02\x02\x02\u0406" +
		"e\x03\x02\x02\x02\u0407\u0405\x03\x02\x02\x02\u0408\u0409\x07\xBC\x02" +
		"\x02\u0409\u040B\x07\xBE\x02\x02\u040A\u0408\x03\x02\x02\x02\u040A\u040B" +
		"\x03\x02\x02\x02\u040B\u040C\x03\x02\x02\x02\u040C\u040D\x05(\x15\x02" +
		"\u040D\u040E\x07\xC7\x02\x02\u040E\u040F\x07\xBC\x02\x02\u040F\u0411\x07" +
		"\xC5\x02\x02\u0410\u0412\x05Z.\x02\u0411\u0410\x03\x02\x02\x02\u0411\u0412" +
		"\x03\x02\x02\x02\u0412\u0413\x03\x02\x02\x02\u0413\u0414\x07\xC6\x02\x02" +
		"\u0414g\x03\x02\x02\x02\u0415\u0417\x05n8\x02\u0416\u0415\x03\x02\x02" +
		"\x02\u0417\u0418\x03\x02\x02\x02\u0418\u0416\x03\x02\x02\x02\u0418\u0419" +
		"\x03\x02\x02\x02\u0419i\x03\x02\x02\x02\u041A\u041B\x07\x06\x02\x02\u041B" +
		"\u041D\x07\x18\x02\x02\u041C\u041E\x07\x04\x02\x02\u041D\u041C\x03\x02" +
		"\x02\x02\u041E\u041F\x03\x02\x02\x02\u041F\u041D\x03\x02\x02\x02\u041F" +
		"\u0420\x03\x02\x02\x02\u0420\u0424\x03\x02\x02\x02\u0421\u0423\x05n8\x02" +
		"\u0422\u0421\x03\x02\x02\x02\u0423\u0426\x03\x02\x02\x02\u0424\u0422\x03" +
		"\x02\x02\x02\u0424\u0425\x03\x02\x02\x02\u0425\u0427\x03\x02\x02\x02\u0426" +
		"\u0424\x03\x02\x02\x02\u0427\u0428\x07\x07\x02\x02\u0428\u042C\x07\x18" +
		"\x02\x02\u0429\u042B\x07\x04\x02\x02\u042A\u0429\x03\x02\x02\x02\u042B" +
		"\u042E\x03\x02\x02\x02\u042C\u042A\x03\x02\x02\x02\u042C\u042D\x03\x02" +
		"\x02\x02\u042Dk\x03\x02\x02\x02\u042E\u042C\x03\x02\x02\x02\u042F\u0430" +
		"\x07\x06\x02\x02\u0430\u0432\x07\x18\x02\x02\u0431\u0433\x07\x04\x02\x02" +
		"\u0432\u0431\x03\x02\x02\x02\u0433\u0434\x03\x02\x02\x02\u0434\u0432\x03" +
		"\x02\x02\x02\u0434\u0435\x03\x02\x02\x02\u0435\u0439\x03\x02\x02\x02\u0436" +
		"\u0438\x05n8\x02\u0437\u0436\x03\x02\x02\x02\u0438\u043B\x03\x02\x02\x02" +
		"\u0439\u0437\x03\x02\x02\x02\u0439\u043A\x03\x02\x02\x02\u043A\u043C\x03" +
		"\x02\x02\x02\u043B\u0439\x03\x02\x02\x02\u043C\u043D\x07\x07\x02\x02\u043D" +
		"\u0441\x07\x18\x02\x02\u043E\u0440\x07\x04\x02\x02\u043F\u043E\x03\x02" +
		"\x02\x02\u0440\u0443\x03\x02\x02\x02\u0441\u043F\x03\x02\x02\x02\u0441" +
		"\u0442\x03\x02\x02\x02\u0442m\x03\x02\x02\x02\u0443\u0441\x03\x02\x02" +
		"\x02\u0444\u044A\x05p9\x02\u0445\u044A\x05r:\x02\u0446\u044A\x05t;\x02" +
		"\u0447\u044A\x05v<\x02\u0448\u044A\x05x=\x02\u0449\u0444\x03\x02\x02\x02" +
		"\u0449\u0445\x03\x02\x02\x02\u0449\u0446\x03\x02\x02\x02\u0449\u0447\x03" +
		"\x02\x02\x02\u0449\u0448\x03\x02\x02\x02\u044Ao\x03\x02\x02\x02\u044B" +
		"\u044C\x07+\x02\x02\u044C\u044E\x07\xC5\x02\x02\u044D\u044F\x05z>\x02" +
		"\u044E\u044D\x03\x02\x02\x02\u044E\u044F\x03\x02\x02\x02\u044F\u0450\x03" +
		"\x02\x02\x02\u0450\u0452\x07\xC6\x02\x02\u0451\u0453\x07\xBD\x02\x02\u0452" +
		"\u0451\x03\x02\x02\x02\u0452\u0453\x03\x02\x02\x02\u0453\u0457\x03\x02" +
		"\x02\x02\u0454\u0456\x07\x04\x02\x02\u0455\u0454\x03\x02\x02\x02\u0456" +
		"\u0459\x03\x02\x02\x02\u0457\u0455\x03\x02\x02\x02\u0457\u0458\x03\x02" +
		"\x02\x02\u0458q\x03\x02\x02\x02\u0459\u0457\x03\x02\x02\x02\u045A\u045B" +
		"\t\x07\x02\x02\u045B\u045D\x07\xC5\x02\x02\u045C\u045E\x05z>\x02\u045D" +
		"\u045C\x03\x02\x02\x02\u045D\u045E\x03\x02\x02\x02\u045E\u045F\x03\x02" +
		"\x02\x02\u045F\u0461\x07\xC6\x02\x02\u0460\u0462\x07\xBD\x02\x02\u0461" +
		"\u0460\x03\x02\x02\x02\u0461\u0462\x03\x02\x02\x02\u0462\u0466\x03\x02" +
		"\x02\x02\u0463\u0465\x07\x04\x02\x02\u0464\u0463\x03\x02\x02\x02\u0465" +
		"\u0468\x03\x02\x02\x02\u0466\u0464\x03\x02\x02\x02\u0466\u0467\x03\x02" +
		"\x02\x02\u0467s\x03\x02\x02\x02\u0468\u0466\x03\x02\x02\x02\u0469\u046A" +
		"\t\b\x02\x02\u046A\u046C\x07\xC5\x02\x02\u046B\u046D\x05z>\x02\u046C\u046B" +
		"\x03\x02\x02\x02\u046C\u046D\x03\x02\x02\x02\u046D\u046E\x03\x02\x02\x02" +
		"\u046E\u0470\x07\xC6\x02\x02\u046F\u0471\x07\xBD\x02\x02\u0470\u046F\x03" +
		"\x02\x02\x02\u0470\u0471\x03\x02\x02\x02\u0471\u0475\x03\x02\x02\x02\u0472" +
		"\u0474\x07\x04\x02\x02\u0473\u0472\x03\x02\x02\x02\u0474\u0477\x03\x02" +
		"\x02\x02\u0475\u0473\x03\x02\x02\x02\u0475\u0476\x03\x02\x02\x02\u0476" +
		"u\x03\x02\x02\x02\u0477\u0475\x03\x02\x02\x02\u0478\u0479\t\t\x02\x02" +
		"\u0479\u047A\x07\xC5\x02\x02\u047A\u0481\x07\xDF\x02\x02\u047B\u0482\x05" +
		"(\x15\x02\u047C\u047E\n\x02\x02\x02\u047D\u047C\x03\x02\x02\x02\u047E" +
		"\u047F\x03\x02\x02\x02\u047F\u047D\x03\x02\x02\x02\u047F\u0480\x03\x02" +
		"\x02\x02\u0480\u0482\x03\x02\x02\x02\u0481\u047B\x03\x02\x02\x02\u0481" +
		"\u047D\x03\x02\x02\x02\u0482\u0483\x03\x02\x02\x02\u0483\u0484\x07\xDF" +
		"\x02\x02\u0484\u048E\x07\xC3\x02\x02\u0485\u048F\x05\x8CG\x02\u0486\u048A" +
		"\x07\xDF\x02\x02\u0487\u0489\n\x02\x02\x02\u0488\u0487\x03\x02\x02\x02" +
		"\u0489\u048C\x03\x02\x02\x02\u048A\u0488\x03\x02\x02\x02\u048A\u048B\x03" +
		"\x02\x02\x02\u048B\u048D\x03\x02\x02\x02\u048C\u048A\x03\x02\x02\x02\u048D" +
		"\u048F\x07\xDF\x02\x02\u048E\u0485\x03\x02\x02\x02\u048E\u0486\x03\x02" +
		"\x02\x02\u048F\u0490\x03\x02\x02\x02\u0490\u0492\x07\xC6\x02\x02\u0491" +
		"\u0493\x07\xBD\x02\x02\u0492\u0491\x03\x02\x02\x02\u0492\u0493\x03\x02" +
		"\x02\x02\u0493\u0497\x03\x02\x02\x02\u0494\u0496\x07\x04\x02\x02\u0495" +
		"\u0494\x03\x02\x02\x02\u0496\u0499\x03\x02\x02\x02\u0497\u0495\x03\x02" +
		"\x02\x02\u0497\u0498\x03\x02\x02\x02\u0498w\x03\x02\x02\x02\u0499\u0497" +
		"\x03\x02\x02\x02\u049A\u049B\t\n\x02\x02\u049B\u049D\x07\xC5\x02\x02\u049C" +
		"\u049E\x05z>\x02\u049D\u049C\x03\x02\x02\x02\u049D\u049E\x03\x02\x02\x02" +
		"\u049E\u049F\x03\x02\x02\x02\u049F\u04A1\x07\xC6\x02\x02\u04A0\u04A2\x07" +
		"\xBD\x02\x02\u04A1\u04A0\x03\x02\x02\x02\u04A1\u04A2\x03\x02\x02\x02\u04A2" +
		"\u04A6\x03\x02\x02\x02\u04A3\u04A5\x07\x04\x02\x02\u04A4\u04A3\x03\x02" +
		"\x02\x02\u04A5\u04A8\x03\x02\x02\x02\u04A6\u04A4\x03\x02\x02\x02\u04A6" +
		"\u04A7\x03\x02\x02\x02\u04A7y\x03\x02\x02\x02\u04A8\u04A6\x03\x02\x02" +
		"\x02\u04A9\u04AB\x07\xC1\x02\x02\u04AA\u04AC\x05|?\x02\u04AB\u04AA\x03" +
		"\x02\x02\x02\u04AB\u04AC\x03\x02\x02\x02\u04AC\u04AD\x03\x02\x02\x02\u04AD" +
		"\u04B7\x07\xC2\x02\x02\u04AE\u04B2\x07\xDF\x02\x02\u04AF\u04B1\n\x02\x02" +
		"\x02\u04B0\u04AF\x03\x02\x02\x02\u04B1\u04B4\x03\x02\x02\x02\u04B2\u04B0" +
		"\x03\x02\x02\x02\u04B2\u04B3\x03\x02\x02\x02\u04B3\u04B5\x03\x02\x02\x02" +
		"\u04B4\u04B2\x03\x02\x02\x02\u04B5\u04B7\x07\xDF\x02\x02\u04B6\u04A9\x03" +
		"\x02\x02\x02\u04B6\u04AE\x03\x02\x02\x02\u04B7{\x03\x02\x02\x02\u04B8" +
		"\u04BD\x05~@\x02\u04B9\u04BA\x07\xC3\x02\x02\u04BA\u04BC\x05~@\x02\u04BB" +
		"\u04B9\x03\x02\x02\x02\u04BC\u04BF\x03\x02\x02\x02\u04BD\u04BB\x03\x02" +
		"\x02\x02\u04BD\u04BE\x03\x02\x02\x02\u04BE}\x03\x02\x02\x02\u04BF\u04BD" +
		"\x03\x02\x02\x02\u04C0\u04C1\x05\x88E\x02\u04C1\u04C2\x07\xD0\x02\x02" +
		"\u04C2\u04C3\x05\x80A\x02\u04C3\x7F\x03\x02\x02\x02\u04C4\u04E0\x05\x8C" +
		"G\x02\u04C5\u04E0\x05\x82B\x02\u04C6\u04CA\x07\xDF\x02\x02\u04C7\u04C9" +
		"\n\x02\x02\x02\u04C8\u04C7\x03\x02\x02\x02\u04C9\u04CC\x03\x02\x02\x02" +
		"\u04CA\u04C8\x03\x02\x02\x02\u04CA\u04CB\x03\x02\x02\x02\u04CB\u04CD\x03" +
		"\x02\x02\x02\u04CC\u04CA\x03\x02\x02\x02\u04CD\u04E0\x07\xDF\x02\x02\u04CE" +
		"\u04D2\x07\xE0\x02\x02\u04CF\u04D1\n\v\x02\x02\u04D0\u04CF\x03\x02\x02" +
		"\x02\u04D1\u04D4\x03\x02\x02\x02\u04D2\u04D0\x03\x02\x02\x02\u04D2\u04D3" +
		"\x03\x02\x02\x02\u04D3\u04D5\x03\x02\x02\x02\u04D4\u04D2\x03\x02\x02\x02" +
		"\u04D5\u04E0\x07\xE0\x02\x02\u04D6\u04D7\x07\xBF\x02\x02\u04D7\u04D8\x05" +
		"\x8AF\x02\u04D8\u04D9\x07\xC0\x02\x02\u04D9\u04E0\x03\x02\x02\x02\u04DA" +
		"\u04DC\x07\xC1\x02\x02\u04DB\u04DD\x05\x84C\x02\u04DC\u04DB\x03\x02\x02" +
		"\x02\u04DC\u04DD\x03\x02\x02\x02\u04DD\u04DE\x03\x02\x02\x02\u04DE\u04E0" +
		"\x07\xC2\x02\x02\u04DF\u04C4\x03\x02\x02\x02\u04DF\u04C5\x03\x02\x02\x02" +
		"\u04DF\u04C6\x03\x02\x02\x02\u04DF\u04CE\x03\x02\x02\x02\u04DF\u04D6\x03" +
		"\x02\x02\x02\u04DF\u04DA\x03\x02\x02\x02\u04E0\x81\x03\x02\x02\x02\u04E1" +
		"\u04E2\t\f\x02\x02\u04E2\x83\x03\x02\x02\x02\u04E3\u04E8\x05\x86D\x02" +
		"\u04E4\u04E5\x07\xC3\x02\x02\u04E5\u04E7\x05\x86D\x02\u04E6\u04E4\x03" +
		"\x02\x02\x02\u04E7\u04EA\x03\x02\x02\x02\u04E8\u04E6\x03\x02\x02\x02\u04E8" +
		"\u04E9\x03\x02\x02\x02\u04E9\x85\x03\x02\x02\x02\u04EA\u04E8\x03\x02\x02" +
		"\x02\u04EB\u04EE\x07\xBC\x02\x02\u04EC\u04EE\x05\x88E\x02\u04ED\u04EB" +
		"\x03\x02\x02\x02\u04ED\u04EC\x03\x02\x02\x02\u04EE\u04EF\x03\x02\x02\x02" +
		"\u04EF\u04F0\x07\xD0\x02\x02\u04F0\u04F1\x05\x80A\x02\u04F1\x87\x03\x02" +
		"\x02\x02\u04F2\u04F3\t\r\x02\x02\u04F3\x89\x03\x02\x02\x02\u04F4\u04F9" +
		"\x05\x8CG\x02\u04F5\u04F6\x07\xC3\x02\x02\u04F6\u04F8\x05\x8CG\x02\u04F7" +
		"\u04F5\x03\x02\x02\x02\u04F8\u04FB\x03\x02\x02\x02\u04F9\u04F7\x03\x02" +
		"\x02\x02\u04F9\u04FA\x03\x02\x02\x02\u04FA\x8B\x03\x02\x02\x02\u04FB\u04F9" +
		"\x03\x02\x02\x02\u04FC\u04FD\x05\x8EH\x02\u04FD\x8D\x03\x02\x02\x02\u04FE" +
		"\u0504\x05\x90I\x02\u04FF\u0500\x07\xDD\x02\x02\u0500\u0501\x05\x8CG\x02" +
		"\u0501\u0502\x07\xBE\x02\x02\u0502\u0503\x05\x8CG\x02\u0503\u0505\x03" +
		"\x02\x02\x02\u0504\u04FF\x03\x02\x02\x02\u0504\u0505\x03\x02\x02\x02\u0505" +
		"\x8F\x03\x02\x02\x02\u0506\u050F\x05\x92J\x02\u0507\u0508\x07\xDC\x02" +
		"\x02\u0508\u050B\x07\xDC\x02\x02\u0509\u050B\x07\xD5\x02\x02\u050A\u0507" +
		"\x03\x02\x02\x02\u050A\u0509\x03\x02\x02\x02\u050B\u050C\x03\x02\x02\x02" +
		"\u050C\u050E\x05\x92J\x02\u050D\u050A\x03\x02\x02\x02\u050E\u0511\x03" +
		"\x02\x02\x02\u050F\u050D\x03\x02\x02\x02\u050F\u0510\x03\x02\x02\x02\u0510" +
		"\x91\x03\x02\x02\x02\u0511\u050F\x03\x02\x02\x02\u0512\u051B\x05\x94K" +
		"\x02\u0513\u0514\x07\xE1\x02\x02\u0514\u0517\x07\xE1\x02\x02\u0515\u0517" +
		"\x07\xD4\x02\x02\u0516\u0513\x03\x02\x02\x02\u0516\u0515\x03\x02\x02\x02" +
		"\u0517\u0518\x03\x02\x02\x02\u0518\u051A\x05\x94K\x02\u0519\u0516\x03" +
		"\x02\x02\x02\u051A\u051D\x03\x02\x02\x02\u051B\u0519\x03\x02\x02\x02\u051B" +
		"\u051C\x03\x02\x02\x02\u051C\x93\x03\x02\x02\x02\u051D\u051B\x03\x02\x02" +
		"\x02\u051E\u0523\x05\x96L\x02\u051F\u0520\t\x0E\x02\x02\u0520\u0522\x05" +
		"\x96L\x02\u0521\u051F\x03\x02\x02\x02\u0522\u0525\x03\x02\x02\x02\u0523" +
		"\u0521\x03\x02\x02\x02\u0523\u0524\x03\x02\x02\x02\u0524\x95\x03\x02\x02" +
		"\x02\u0525\u0523\x03\x02\x02\x02\u0526\u0527\x05\x98M\x02\u0527\x97\x03" +
		"\x02\x02\x02\u0528\u052D\x05\x9AN\x02\u0529\u052A\t\x0F\x02\x02\u052A" +
		"\u052C\x05\x9AN\x02\u052B\u0529\x03\x02\x02\x02\u052C\u052F\x03\x02\x02" +
		"\x02\u052D\u052B\x03\x02\x02\x02\u052D\u052E\x03\x02\x02\x02\u052E\x99" +
		"\x03\x02\x02\x02\u052F\u052D\x03\x02\x02\x02\u0530\u0535\x05\x9CO\x02" +
		"\u0531\u0532\t\x10\x02\x02\u0532\u0534\x05\x9CO\x02\u0533\u0531\x03\x02" +
		"\x02\x02\u0534\u0537\x03\x02\x02\x02\u0535\u0533\x03\x02\x02\x02\u0535" +
		"\u0536\x03\x02\x02\x02\u0536\x9B\x03\x02\x02\x02\u0537\u0535\x03\x02\x02" +
		"\x02\u0538\u053D\x05\x9EP\x02\u0539\u053A\x07\xDA\x02\x02\u053A\u053C" +
		"\x05\x9EP\x02\u053B\u0539\x03\x02\x02\x02\u053C\u053F\x03\x02\x02\x02" +
		"\u053D\u053B\x03\x02\x02\x02\u053D\u053E\x03\x02\x02\x02\u053E\x9D\x03" +
		"\x02\x02\x02\u053F\u053D\x03\x02\x02\x02\u0540\u0542\t\x11\x02\x02\u0541" +
		"\u0540\x03\x02\x02\x02\u0541\u0542\x03\x02\x02\x02\u0542\u0543\x03\x02" +
		"\x02\x02\u0543\u0544\x05\xA0Q\x02\u0544\x9F\x03\x02\x02\x02\u0545\u0546" +
		"\x07\xC5\x02\x02\u0546\u0547\x05\x8CG\x02\u0547\u0548\x07\xC6\x02\x02" +
		"\u0548\u054E\x03\x02\x02\x02\u0549\u054E\x05\xA2R\x02\u054A\u054E\x05" +
		"\xA4S\x02\u054B\u054E\x05\xA6T\x02\u054C\u054E\x05\x88E\x02\u054D\u0545" +
		"\x03\x02\x02\x02\u054D\u0549\x03\x02\x02\x02\u054D\u054A\x03\x02\x02\x02" +
		"\u054D\u054B\x03\x02\x02\x02\u054D\u054C\x03\x02\x02\x02\u054E\xA1\x03" +
		"\x02\x02\x02\u054F\u0550\t\x12\x02\x02\u0550\u0552\x07\xC5\x02\x02\u0551" +
		"\u0553\x05\x8AF\x02\u0552\u0551\x03\x02\x02\x02\u0552\u0553\x03\x02\x02" +
		"\x02\u0553\u0554\x03\x02\x02\x02\u0554\u0555\x07\xC6\x02\x02\u0555\xA3" +
		"\x03\x02\x02\x02\u0556\u0557\x07\xBC\x02\x02\u0557\u0559\x07\xC5\x02\x02" +
		"\u0558\u055A\x05\x8CG\x02\u0559\u0558\x03\x02\x02\x02\u0559\u055A\x03" +
		"\x02\x02\x02\u055A\u055B\x03\x02\x02\x02\u055B\u055C\x07\xC6\x02\x02\u055C" +
		"\xA5\x03\x02\x02\x02\u055D\u055E\t\x13\x02\x02\u055E\xA7\x03\x02\x02\x02" +
		"\xC6\xAB\xB1\xB9\xBE\xC6\xCC\xCF\xD3\xDB\xE2\xE7\xEC\xF5\xFA\u0102\u010B" +
		"\u0114\u011D\u0123\u0128\u012D\u0136\u013B\u0148\u014F\u0155\u0159\u0161" +
		"\u0165\u016A\u016E\u0171\u0175\u017D\u0183\u0187\u0190\u0198\u019E\u01A2" +
		"\u01AA\u01B2\u01B8\u01BC\u01C4\u01C7\u01CB\u01CF\u01D4\u01D7\u01DA\u01DE" +
		"\u01E2\u01E8\u01EF\u01F5\u01F7\u01FD\u0202\u0208\u020C\u0213\u0218\u021C" +
		"\u0220\u0223\u0228\u022C\u0231\u0235\u023A\u023E\u0243\u024B\u024E\u0251" +
		"\u0257\u025B\u025F\u0266\u0268\u026E\u0271\u027B\u0284\u028A\u028E\u0296" +
		"\u029B\u029E\u02A7\u02AC\u02B3\u02BB\u02C1\u02C5\u02CE\u02D6\u02DC\u02E0" +
		"\u02E8\u02F0\u02F6\u02FA\u0302\u0305\u0308\u030E\u0315\u031C\u031F\u0321" +
		"\u0326\u032D\u0331\u0338\u033C\u0343\u0368\u036F\u0377\u037D\u0381\u0389" +
		"\u038E\u0393\u0396\u0399\u03A2\u03AA\u03B0\u03B4\u03BC\u03C1\u03C7\u03CF" +
		"\u03D5\u03D9\u03E2\u03E7\u03F2\u03F8\u03FC\u0405\u040A\u0411\u0418\u041F" +
		"\u0424\u042C\u0434\u0439\u0441\u0449\u044E\u0452\u0457\u045D\u0461\u0466" +
		"\u046C\u0470\u0475\u047F\u0481\u048A\u048E\u0492\u0497\u049D\u04A1\u04A6" +
		"\u04AB\u04B2\u04B6\u04BD\u04CA\u04D2\u04DC\u04DF\u04E8\u04ED\u04F9\u0504" +
		"\u050A\u050F\u0516\u051B\u0523\u052D\u0535\u053D\u0541\u054D\u0552\u0559";
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
	public wrapped_actions_block(): Wrapped_actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Wrapped_actions_blockContext);
	}
	public begin_actions_block(): Begin_actions_blockContext | undefined {
		return this.tryGetRuleContext(0, Begin_actions_blockContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_program_block; }
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
	public MOLECULES(): TerminalNode[];
	public MOLECULES(i: number): TerminalNode;
	public MOLECULES(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.MOLECULES);
		} else {
			return this.getToken(BNGParser.MOLECULES, i);
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_type_def) {
			return visitor.visitMolecule_type_def(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_defContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public component_def_list(): Component_def_listContext | undefined {
		return this.tryGetRuleContext(0, Component_def_listContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_def; }
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_def) {
			return visitor.visitMolecule_def(this);
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_def_list) {
			return visitor.visitComponent_def_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_defContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_def) {
			return visitor.visitComponent_def(this);
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_compartment) {
			return visitor.visitMolecule_compartment(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_patternContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LPAREN, 0); }
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RPAREN, 0); }
	public molecule_tag(): Molecule_tagContext | undefined {
		return this.tryGetRuleContext(0, Molecule_tagContext);
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitMolecule_pattern) {
			return visitor.visitMolecule_pattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Molecule_tagContext extends ParserRuleContext {
	public MOD(): TerminalNode { return this.getToken(BNGParser.MOD, 0); }
	public INT(): TerminalNode { return this.getToken(BNGParser.INT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_molecule_tag; }
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_pattern_list) {
			return visitor.visitComponent_pattern_list(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Component_patternContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(BNGParser.STRING, 0); }
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
	public bond_spec(): Bond_specContext[];
	public bond_spec(i: number): Bond_specContext;
	public bond_spec(i?: number): Bond_specContext | Bond_specContext[] {
		if (i === undefined) {
			return this.getRuleContexts(Bond_specContext);
		} else {
			return this.getRuleContext(i, Bond_specContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_component_pattern; }
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitComponent_pattern) {
			return visitor.visitComponent_pattern(this);
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitState_value) {
			return visitor.visitState_value(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Bond_specContext extends ParserRuleContext {
	public EMARK(): TerminalNode { return this.getToken(BNGParser.EMARK, 0); }
	public bond_id(): Bond_idContext | undefined {
		return this.tryGetRuleContext(0, Bond_idContext);
	}
	public PLUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.PLUS, 0); }
	public QMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QMARK, 0); }
	public MINUS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.MINUS, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_bond_spec; }
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
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_type; }
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
	public STRING(): TerminalNode | undefined { return this.tryGetToken(BNGParser.STRING, 0); }
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	public EQUALS(): TerminalNode | undefined { return this.tryGetToken(BNGParser.EQUALS, 0); }
	public GT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GT, 0); }
	public GTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.GTE, 0); }
	public LT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LT, 0); }
	public LTE(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LTE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_pattern; }
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
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reaction_rule_def; }
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
	public PLUS(): TerminalNode[];
	public PLUS(i: number): TerminalNode;
	public PLUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PLUS);
		} else {
			return this.getToken(BNGParser.PLUS, i);
		}
	}
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_reactant_patterns; }
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
	public PLUS(): TerminalNode[];
	public PLUS(i: number): TerminalNode;
	public PLUS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PLUS);
		} else {
			return this.getToken(BNGParser.PLUS, i);
		}
	}
	public INT(): TerminalNode | undefined { return this.tryGetToken(BNGParser.INT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_product_patterns; }
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitPopulation_map_def) {
			return visitor.visitPopulation_map_def(this);
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
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_command; }
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitGenerate_network_cmd) {
			return visitor.visitGenerate_network_cmd(this);
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
	public get ruleIndex(): number { return BNGParser.RULE_other_action_cmd; }
	// @Override
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitOther_action_cmd) {
			return visitor.visitOther_action_cmd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class Action_argsContext extends ParserRuleContext {
	public LBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.LBRACKET, 0); }
	public RBRACKET(): TerminalNode | undefined { return this.tryGetToken(BNGParser.RBRACKET, 0); }
	public action_arg_list(): Action_arg_listContext | undefined {
		return this.tryGetRuleContext(0, Action_arg_listContext);
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
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_action_args; }
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
	public QMARK(): TerminalNode | undefined { return this.tryGetToken(BNGParser.QMARK, 0); }
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public COLON(): TerminalNode | undefined { return this.tryGetToken(BNGParser.COLON, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_conditional_expr; }
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
	public PIPE(): TerminalNode[];
	public PIPE(i: number): TerminalNode;
	public PIPE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.PIPE);
		} else {
			return this.getToken(BNGParser.PIPE, i);
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
	public AMPERSAND(): TerminalNode[];
	public AMPERSAND(i: number): TerminalNode;
	public AMPERSAND(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(BNGParser.AMPERSAND);
		} else {
			return this.getToken(BNGParser.AMPERSAND, i);
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
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return BNGParser.RULE_observable_ref; }
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
	public accept<Result>(visitor: BNGParserVisitor<Result>): Result {
		if (visitor.visitLiteral) {
			return visitor.visitLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


