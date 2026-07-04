#!/usr/bin/env node
// === MCP stdio transport compatibility ===
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Only redirect console and change CWD if running as the main script
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href || process.env.MCP_SERVER_RUN === 'true';

if (isMain) {
  // Set CWD to project root (Claude Desktop launches from System32)
  process.chdir(resolve(__dirname, '..', '..', '..'));

  // MCP uses stdout for JSON-RPC - redirect all console output to stderr
  const _write = (msg: string) => { process.stderr.write(msg + '\n'); };
  console.log = (...args: unknown[]) => _write(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => _write('[WARN] ' + args.map(String).join(' '));
  console.error = (...args: unknown[]) => _write('[ERROR] ' + args.map(String).join(' '));
  console.info = (...args: unknown[]) => _write(args.map(String).join(' '));
  console.debug = (...args: unknown[]) => _write('[DEBUG] ' + args.map(String).join(' '));
}

import { Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema } from './sdk.js';

import { simulationMethods, solverValues } from './schemas/index.js';

import { handleParseBngl } from './handlers/parseBngl.js';
import { handleGenerateNetwork } from './handlers/generateNetwork.js';
import { handleSimulate } from './handlers/simulate.js';
import { handleParameterScan } from './handlers/parameterScan.js';
import { handleValidateModel } from './handlers/validateModel.js';
import { handleGetContactMap } from './handlers/getContactMap.js';
import { handleFitParameters } from './handlers/fitParameters.js';
import { handleImportPetab } from './handlers/importPetab.js';
import { handleReduceModel } from './handlers/reduceModel.js';
import { handleQueryPathwayCommons } from './handlers/queryPathwayCommons.js';
import { handleSobolSensitivity } from './handlers/sobolSensitivity.js';
import { handleIdentifiability } from './handlers/identifiability.js';
import { handleBayesianInference } from './handlers/bayesianInference.js';
import { handleExportModel } from './handlers/exportModel.js';
import { handleComposeModel } from './handlers/composeModel.js';
import { handleEditModel } from './handlers/editModel.js';
import { handleDiagnoseModel } from './handlers/diagnoseModel.js';
import { handleExplainModel } from './handlers/explainModel.js';
import { handleOptimalExperiment } from './handlers/optimalExperiment.js';
import { handleVerifyModel } from './handlers/verifyModel.js';
import { handleBifurcationAnalysis } from './handlers/bifurcationAnalysis.js';
import { handleTemporalAnalysis } from './handlers/temporalAnalysis.js';
import { handleSymbolicSteadyState } from './handlers/symbolicSteadyState.js';
import { handleCompareModels } from './handlers/compareModels.js';
import { handleSearchStructure } from './handlers/searchStructure.js';
import { handlePKPD } from './handlers/pkpd.js';
import { handleMultiscaleSimulation } from './handlers/multiscaleSimulation.js';
import { handlePerturbationScreen } from './handlers/perturbationScreen.js';
import { handleDoseResponse } from './handlers/doseResponse.js';
import { handleFirstPassageTime } from './handlers/firstPassageTime.js';
import { handleLnaAnalysis } from './handlers/lnaAnalysis.js';
import { handleReactionInformationFlow } from './handlers/reactionInformationFlow.js';
import { handleQssaReduction } from './handlers/qssaReduction.js';
import { handleComputeFim } from './handlers/computeFim.js';
import { handleSuggestFix } from './handlers/suggestFix.js';
import { handleCheckHysteresis } from './handlers/checkHysteresis.js';
import { handleCheckPhaseHandoff } from './handlers/checkPhaseHandoff.js';

const server = new Server(
  {
    name: 'bng-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'parse_bngl',
        description: 'Parse BNGL (BioNetGen Language) code and return structured result',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'BNGL code to parse',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'generate_network',
        description: 'Generate expanded reaction network from BNGL model',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'BNGL code to generate network from',
            },
            max_agents: {
              type: 'number',
              description: 'Maximum number of agent patterns (default: 1000)',
            },
            max_iterations: {
              type: 'number',
              description: 'Maximum number of expansion iterations (default: 100)',
            },
            max_reactions: {
              type: 'number',
              description: 'Maximum number of generated reactions',
            },
            max_agg: {
              type: 'number',
              description: 'Maximum aggregate size during expansion',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'simulate',
        description: 'Run ODE/SSA simulation on BNGL model',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to local BNGL file. If provided, overrides code.',
            },
            code: {
              type: 'string',
              description: 'BNGL code to simulate (ignored when file is provided)',
            },
            output_mode: {
              type: 'string',
              enum: ['full', 'observables_only'],
              description: 'Response payload mode. Use observables_only for LLM clients unless expanded network payloads are needed.',
            },
            method: {
              type: 'string',
              enum: [...simulationMethods],
              description: 'Simulation method (default: ode)',
            },
            t_end: {
              type: 'number',
              description: 'End time for simulation (default: 10)',
            },
            n_steps: {
              type: 'number',
              description: 'Number of time points (default: 100)',
            },
            solver: {
              type: 'string',
              enum: [...solverValues],
              description: 'Optional ODE solver override. Defaults to rk4 for ODE requests.',
            },
            atol: {
              type: 'number',
              description: 'Absolute tolerance for deterministic solvers',
            },
            rtol: {
              type: 'number',
              description: 'Relative tolerance for deterministic solvers',
            },
            max_steps: {
              type: 'number',
              description: 'Maximum internal solver steps',
            },
            seed: {
              type: 'number',
              description: 'Random seed for stochastic simulations',
            },
            sparse: {
              type: 'boolean',
              description: 'Request sparse deterministic solving when supported',
            },
            include_species_data: {
              type: 'boolean',
              description: 'Include species trajectories in the response',
            },
            max_agents: {
              type: 'number',
              description: 'Max generated species',
            },
            max_reactions: {
              type: 'number',
              description: 'Max generated reactions',
            },
            max_iterations: {
              type: 'number',
              description: 'Max iterations',
            },
            max_agg: {
              type: 'number',
              description: 'Max aggregate size',
            },
          },
          anyOf: [
            { required: ['code'] },
            { required: ['file'] },
          ],
        },
      },
      {
        name: 'parameter_scan',
        description: 'Run a 1D or 2D parameter scan while reusing a single expanded network',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL code to scan' },
            parameter: { type: 'string', description: 'Primary parameter name to scan' },
            start: { type: 'number', description: 'Start value for the primary parameter' },
            end: { type: 'number', description: 'End value for the primary parameter' },
            steps: { type: 'number', description: 'Number of primary scan points' },
            parameter2: { type: 'string', description: 'Optional second parameter for a 2D scan' },
            start2: { type: 'number', description: 'Start value for the secondary parameter' },
            end2: { type: 'number', description: 'End value for the secondary parameter' },
            steps2: { type: 'number', description: 'Number of secondary scan points' },
            logarithmic: { type: 'boolean', description: 'Use log-spaced ranges instead of linear spacing' },
            method: { type: 'string', enum: [...simulationMethods], description: 'Simulation method for each scan point' },
            t_end: { type: 'number', description: 'End time for each simulation' },
            n_steps: { type: 'number', description: 'Number of output steps for each simulation' },
            solver: { type: 'string', enum: [...solverValues], description: 'Optional deterministic solver override' },
          },
          required: ['code', 'parameter', 'start', 'end', 'steps'],
        },
      },
      {
        name: 'validate_model',
        description: 'Parse and validate BNGL structure, observables, and NFsim compatibility',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL code to validate' },
            include_nfsim: { type: 'boolean', description: 'Include NFsim compatibility checks in the result' },
          },
          required: ['code'],
        },
      },
      {
        name: 'get_contact_map',
        description: 'Build a static contact map from the parsed molecule types and reaction rules',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL code to analyze' },
          },
          required: ['code'],
        },
      },
      {
        name: 'fit_parameters',
        description: 'Optimize model parameters to match experimental data',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL code' },
            parameters: {
              type: 'object',
              description: 'Map of param name to { min, max, initial? }'
            },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: { type: 'number' },
                  observables: { type: 'object' }
                }
              },
              description: 'Experimental data points'
            },
            method: { type: 'string', enum: ['ode', 'ssa'], default: 'ode' },
            algorithm: { type: 'string', enum: ['nelder-mead', 'sbplx'], default: 'nelder-mead' }
          },
          required: ['code', 'parameters', 'data'],
        },
      },
      {
        name: 'import_petab',
        description: 'Import a PEtab parameter estimation problem (parameters + measurements in TSV format) and run fitting against the BNGL model.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            petab_parameters: { type: 'string', description: 'PEtab parameters TSV content' },
            petab_measurements: { type: 'string', description: 'PEtab measurements TSV content' },
            petab_conditions: { type: 'string', description: 'PEtab conditions TSV content' },
            algorithm: { type: 'string', enum: ['nelder-mead', 'sbplx', 'de'], default: 'nelder-mead' },
            max_iterations: { type: 'number', description: 'Maximum iterations for the optimizer' },
          },
          required: ['code', 'petab_parameters', 'petab_measurements'],
        },
      },
      {
        name: 'reduce_model',
        description: 'Fit parameters with L1 regularization and prune negligible rules to produce a reduced model. Based on PTLasso (Gupta, Lee & Faeder 2020).',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameters: { type: 'object', description: 'Map of parameter names to fitting bounds { min, max, initial? }' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: { type: 'number' },
                  observables: { type: 'object' },
                },
                required: ['time', 'observables'],
              },
              description: 'Experimental data points',
            },
            lambda: { type: 'number', default: 0.01, description: 'Regularization strength' },
            regularization: { type: 'string', enum: ['l1', 'l2', 'elastic-net'], default: 'l1' },
            prune_threshold: { type: 'number', default: 0.01, description: 'Relative threshold for pruning' },
            method: { type: 'string', enum: ['ode', 'ssa'], default: 'ode' },
            max_iterations: { type: 'number', default: 1000 },
          },
          required: ['code', 'parameters', 'data'],
        },
      },
      {
        name: 'query_pathway_commons',
        description: 'Query Pathway Commons for known interactions between molecules in the model. Returns confirmed interactions, missing interactions (candidates for new rules), and shared pathways.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'BNGL model code. Molecule names are extracted and queried against Pathway Commons.',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'sobol_sensitivity',
        description: 'Run Sobol global sensitivity analysis on a BNGL model. Returns first-order and total-order indices with bootstrap confidence intervals.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameters: { type: 'array', minItems: 1, items: { type: 'object', properties: { name: { type: 'string' }, min: { type: 'number' }, max: { type: 'number' } }, required: ['name', 'min', 'max'] }, description: 'Parameters to analyze with bounds (must be non-empty)' },
            observables: { type: 'array', items: { type: 'string' }, description: 'Observables to analyze (default: all)' },
            n_samples: { type: 'number', description: 'Saltelli base samples (default: 512)' },
            n_bootstrap: { type: 'number', description: 'Bootstrap replicates (default: 500)' },
            log_scale: { type: 'boolean', description: 'Use log-uniform sampling' },
            seed: { type: 'number', description: 'Random seed' },
            method: { type: 'string', enum: [...simulationMethods] },
            t_end: { type: 'number' },
            n_steps: { type: 'number' },
          },
          required: ['code', 'parameters'],
        },
      },
      {
        name: 'identifiability_analysis',
        description: 'Run profile likelihood analysis to classify parameters as identifiable, practically or structurally unidentifiable.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameters: { type: 'array', items: { type: 'string' }, description: 'Parameters to profile' },
            data: { type: 'array', items: { type: 'object', properties: { time: { type: 'number' }, observables: { type: 'object' } } }, description: 'Experimental data' },
            n_grid: { type: 'number' },
            range_factor: { type: 'number' },
            alpha: { type: 'number' },
          },
          required: ['code', 'data'],
        },
      },
      {
        name: 'bayesian_inference',
        description: 'Run ABC-SMC Bayesian inference to estimate posterior distributions of model parameters given experimental data.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            priors: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, distribution: { type: 'string', enum: ['uniform', 'log-uniform', 'normal'] }, min: { type: 'number' }, max: { type: 'number' }, mean: { type: 'number' }, std: { type: 'number' } } }, description: 'Prior distribution specs' },
            data: { type: 'array', items: { type: 'object', properties: { time: { type: 'number' }, observables: { type: 'object' } } }, description: 'Experimental data' },
            observables: { type: 'array', items: { type: 'string' } },
            n_particles: { type: 'number' },
            n_populations: { type: 'number' },
            seed: { type: 'number' },
          },
          required: ['code', 'priors', 'data'],
        },
      },
      {
        name: 'export_model',
        description: 'Unified export surface. Choose format: sedml, omex, sbml, or annotations.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            format: { type: 'string', enum: ['sedml', 'omex', 'sbml', 'annotations'] },
            method: { type: 'string', enum: ['ode', 'ssa', 'nf'] },
            t_end: { type: 'number' },
            n_steps: { type: 'number' },
            observables: { type: 'array', items: { type: 'string' } },
            model_name: { type: 'string' },
            metadata: { type: 'object', properties: { title: { type: 'string' }, creators: { type: 'array', items: { type: 'string' } }, description: { type: 'string' } } },
            annotate: { type: 'boolean' },
            organism: { type: 'string' },
          },
          required: ['code', 'format'],
        },
      },
      {
        name: 'compose_model',
        description: 'Compose BNGL model code from natural-language biological statements.',
        inputSchema: {
          type: 'object',
          properties: {
            statements: { type: 'array', items: { type: 'string' }, description: 'Natural-language statements to convert into rules' },
            parameters: { type: 'object', description: 'Optional explicit parameter values' },
            seed_species: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  species: { type: 'string' },
                  count: { type: 'number' },
                },
                required: ['species', 'count'],
              },
            },
          },
          required: ['statements'],
        },
      },
      {
        name: 'edit_model',
        description: 'Apply structured editing operations to BNGL code and return an updated model.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Original BNGL code' },
            operations: { type: 'array', items: { type: 'object' }, description: 'Ordered list of edit operations' },
          },
          required: ['code', 'operations'],
        },
      },
      {
         name: 'diagnose_model',
         description: 'Unified diagnosis surface. Supports quick or deep analysis, optional fix suggestions, residual analysis, and maturity assessment in one tool.',
         inputSchema: {
           type: 'object',
           properties: {
             code: { type: 'string', description: 'BNGL model code' },
             mode: { type: 'string', enum: ['quick', 'deep'], description: 'Quick mode runs lightweight checks; deep mode runs full diagnostics' },
             max_parameters: { type: 'number', description: 'Maximum number of parameters to include in Sobol/FIM sub-analysis (default: 5)' },
             method: { type: 'string', enum: [...simulationMethods], description: 'Simulation method used for dynamic probing' },
             t_end: { type: 'number', description: 'End time for dynamic probing simulation' },
             n_steps: { type: 'number', description: 'Number of simulation steps for dynamic probing' },
             include_fix_suggestions: { type: 'boolean', description: 'Include validation-driven fix suggestions' },
             include_residuals: { type: 'boolean', description: 'Include residual analysis when experimental_data is provided' },
             include_maturity: { type: 'boolean', description: 'Include model maturity scoring' },
             residual_parameters: { type: 'object', description: 'Optional parameter overrides for residual analysis' },
             experimental_data: {
               type: 'array',
               items: {
                 type: 'object',
                 properties: {
                   time: { type: 'number' },
                   observables: { type: 'object' }
                 }
               },
               description: 'Experimental data for profile likelihood. When provided, enables identifiability classification.'
             },
             validation_history: { type: 'array', items: { type: 'object' }, description: 'Optional validation records for maturity scoring' },
             parameter_sources: { type: 'object', description: 'Optional parameter provenance map for maturity scoring' },
           },
           required: ['code'],
         },
      },
      {
        name: 'explain_model',
        description: 'Generate a human-readable conceptual explanation of a BNGL model, including entity classification, mechanism breakdown, and optional crux identification for critical pathways.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            include_crux: { type: 'boolean', description: 'Identify critical pathways via rule knockout analysis (for models with ≤20 rules)' },
          },
          required: ['code'],
        },
      },
      {
        name: 'optimal_experiment',
        description: 'Suggest optimal experimental design for parameter identifiability using FIM analysis across candidate timepoints.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            observables: { type: 'array', items: { type: 'string' }, description: 'Observables to measure (default: all)' },
            candidate_times: { type: 'array', items: { type: 'number' }, description: 'Candidate time points to sample' },
            n_samples: { type: 'number', description: 'Number of samples per experiment (default: 10)' },
            method: { type: 'string', enum: ['ode', 'ssa'], description: 'Simulation method' },
            t_end: { type: 'number', description: 'End time' },
          },
          required: ['code'],
        },
      },
      {
        name: 'verify_model',
        description: 'Formally verify reachability, safety, and liveness properties of a BNGL model without simulation',
        inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'BNGL model code' }, query: { type: 'string', description: 'BVL query (reachable?, never, fires?, deadlock?)' }, maxSpecies: { type: 'number' } }, required: ['code', 'query'] },
      },
      {
        name: 'bifurcation_analysis',
        description: 'Trace steady-state branches as a parameter varies, detecting qualitative changes and attributing them to specific rules',
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, parameter: { type: 'string' }, start_value: { type: 'number' }, end_value: { type: 'number' }, max_steps: { type: 'number' } }, required: ['code', 'parameter', 'start_value', 'end_value'] },
      },
      {
        name: 'temporal_analysis',
        description: 'Analyze SSA reaction firing trajectories using information theory (mutual information, transfer entropy, phase locking)',
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, t_end: { type: 'number' }, n_steps: { type: 'number' }, bin_width: { type: 'number' } }, required: ['code'] },
      },
      {
        name: 'symbolic_steady_state',
        description: 'Compute closed-form algebraic expressions for steady-state concentrations as functions of rate constants',
        inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      },
      {
        name: 'compare_models',
        description: 'Simultaneously simulate multiple model variants, detect behavioral divergences, and attribute them to specific rules',
        inputSchema: { type: 'object', properties: { variants: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' } }, required: ['name', 'code'] } }, t_end: { type: 'number' }, divergence_threshold: { type: 'number' } }, required: ['variants'] },
      },
      {
        name: 'search_structure',
        description: 'Search the space of possible rule sets to find model structures that best explain experimental data',
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, experimental_data: { type: 'array' }, n_particles: { type: 'number' }, n_generations: { type: 'number' } }, required: ['code', 'experimental_data'] },
      },
      {
        name: 'pkpd',
        description: 'Pharmacokinetic/pharmacodynamic analysis: generate PK models, design dosing schedules, compute PK metrics, run population simulations',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['generate_model', 'simulate_dosing', 'compute_metrics', 'population_simulation'] }, model_type: { type: 'string' }, drug_name: { type: 'string' }, route: { type: 'string' }, dose: { type: 'number' }, code: { type: 'string' }, observable: { type: 'string' }, n_patients: { type: 'number' } }, required: ['action'] },
      },
      {
        name: 'multiscale_simulation',
        description: 'Run multi-scale simulation combining intracellular BNGL models with cell-agent decisions and extracellular diffusion',
        inputSchema: { type: 'object', properties: { definition: { type: 'object', description: 'Multi-scale model definition' }, max_cells: { type: 'number' } }, required: ['definition'] },
      },
      {
        name: 'perturbation_screen',
        description: 'Run a systematic in-silico perturbation screen (rule knockout, species knockdown, molecule knockout, or pairwise rule combinations) and rank each perturbation by its deviation from the wild-type trajectory. Returns per-target deviation scores per observable plus optional synthetic-lethal pair detection.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            observables: { type: 'array', items: { type: 'string' }, minItems: 1 },
            perturbations: { type: 'array', items: { type: 'string', enum: ['rule_knockout', 'species_knockdown', 'molecule_knockout', 'pairwise_rules'] }, minItems: 1 },
            t_end: { type: 'number', minimum: 0 },
            n_steps: { type: 'integer', minimum: 1 },
            knockdown_fraction: { type: 'number', minimum: 0, maximum: 1 },
            metric: { type: 'string', enum: ['max_absolute', 'integral_absolute', 'endpoint', 'rmsd'] },
            max_pairwise: { type: 'integer', minimum: 1 },
            method: { type: 'string', enum: ['ode', 'ssa', 'nf', 'default'] },
            solver: { type: 'string', enum: ['auto', 'cvode', 'cvode_auto', 'cvode_sparse', 'cvode_jac', 'rosenbrock23', 'rk45', 'rk4', 'webgpu_rk4'] },
          },
          required: ['code', 'observables', 'perturbations', 't_end', 'n_steps'],
        },
      },
      {
        name: 'dose_response',
        description: 'Steady-state dose–response analysis with Hill fitting and optional bifurcation detection. Sweeps an input parameter across a range, finds steady state at each dose, and fits the Hill equation.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            input_parameter: { type: 'string', description: 'Name of the parameter to sweep (must be declared in model.parameters)' },
            input_min: { type: 'number' },
            input_max: { type: 'number' },
            observables: { type: 'array', items: { type: 'string' }, minItems: 1 },
            n_points: { type: 'integer', minimum: 1 },
            log_scale: { type: 'boolean' },
            method: { type: 'string', enum: ['simulate', 'rootfind'] },
            t_end: { type: 'number', minimum: 0 },
            tolerance: { type: 'number', minimum: 0 },
            detect_bifurcations: { type: 'boolean' },
          },
          required: ['code', 'input_parameter', 'input_min', 'input_max', 'observables'],
        },
      },
      {
        name: 'first_passage_time',
        description: 'From an ensemble of SSA trajectories, compute first-passage-time distributions (mean, median, std, CV, percentiles) for threshold crossings on observables.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            thresholds: { type: 'array', items: { type: 'object', properties: { observable: { type: 'string' }, value: { type: 'number' }, direction: { type: 'string', enum: ['above', 'below'] }, label: { type: 'string' } }, required: ['observable', 'value', 'direction'] }, minItems: 1 },
            n_trajectories: { type: 'integer', minimum: 1 },
            t_end: { type: 'number', minimum: 0 },
            n_steps: { type: 'integer', minimum: 1 },
            seed: { type: 'integer' },
          },
          required: ['code', 'thresholds', 'n_trajectories', 't_end', 'n_steps'],
        },
      },
      {
        name: 'lna_analysis',
        description: 'Linear Noise Approximation (van Kampen system-size expansion) for analytical mean and covariance estimation. Supports steady-state and time-course modes.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            mode: { type: 'string', enum: ['steady_state', 'time_course'] },
            volume: { type: 'number', minimum: 0 },
            t_end: { type: 'number', minimum: 0 },
            n_steps: { type: 'integer', minimum: 1 },
            include_covariance_matrix: { type: 'boolean' },
          },
          required: ['code'],
        },
      },
      {
        name: 'reaction_information_flow',
        description: 'Information-theoretic analysis of SSA reaction firing logs: per-reaction entropy, mutual information, transfer entropy, phase locking, and empirical causal graph. Optionally compares to the structural rule graph.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            t_end: { type: 'number', minimum: 0 },
            n_steps: { type: 'integer', minimum: 1 },
            seed: { type: 'integer' },
            bin_width: { type: 'number', minimum: 0 },
            n_shuffles: { type: 'integer', minimum: 1 },
            history_length: { type: 'integer', minimum: 1, maximum: 8 },
            min_co_firings: { type: 'integer', minimum: 0 },
            compare_structural_graph: { type: 'boolean' },
            max_firing_events: { type: 'integer', minimum: 1 },
          },
          required: ['code', 't_end', 'n_steps'],
        },
      },
      {
        name: 'qssa_reduction',
        description: 'Identify fast-reaction candidates and optionally apply a quasi-steady-state reduction. Mode "analyze" lists candidates; mode "apply" returns the reduced model.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            mode: { type: 'string', enum: ['analyze', 'apply'] },
            fast_slow_threshold: { type: 'number', minimum: 0 },
            min_fast_reactions: { type: 'integer', minimum: 1 },
            species_to_eliminate: { type: 'array', items: { type: 'string' } },
            generate_reduced_model: { type: 'boolean' },
          },
          required: ['code'],
        },
      },
      {
        name: 'compute_fim',
        description: 'Compute the Fisher Information Matrix (local sensitivity) for a BNGL model via central finite differences: eigenvalues, parameter correlations, identifiable / unidentifiable sets, and an optional collinearity index.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameters: { type: 'array', items: { type: 'string' }, description: 'Parameter names to include (default: all)' },
            all_timepoints: { type: 'boolean', description: 'Use all timepoints (default: true)' },
            log_parameters: { type: 'boolean', description: 'Use log-parameter sensitivities (d/d ln p)' },
            approx_profile: { type: 'boolean', description: 'Run approximate 1D profile scans' },
            compute_collinearity: { type: 'boolean', description: 'Also compute the collinearity index' },
            collinearity_subset_size: { type: 'integer', minimum: 1, description: 'Subset size for collinearity (default: 2)' },
            method: { type: 'string', enum: ['ode', 'ssa', 'nf', 'default'] },
            t_end: { type: 'number', minimum: 0 },
            n_steps: { type: 'integer', minimum: 1 },
            solver: { type: 'string', enum: ['auto', 'cvode', 'cvode_auto', 'cvode_sparse', 'cvode_jac', 'rosenbrock23', 'rk45', 'rk4', 'webgpu_rk4'] },
            atol: { type: 'number' },
            rtol: { type: 'number' },
            max_agents: { type: 'integer', minimum: 1 },
            max_reactions: { type: 'integer', minimum: 1 },
          },
          required: ['code'],
        },
      },
      {
        name: 'suggest_fix',
        description: 'Analyze BNGL code for errors and suggest fixes. Optionally returns an auto-corrected version of the code.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            include_auto_corrected_code: { type: 'boolean', description: 'Return an auto-corrected version of the code' },
          },
          required: ['code'],
        },
      },
      {
        name: 'check_hysteresis',
        description: 'Sweep a parameter up and back down and detect hysteresis / bistability in an observable (a signature of an irreversible or memory switch).',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameter: { type: 'string', description: 'Parameter to vary' },
            sweep_range: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Min and max values for the parameter sweep' },
            steps: { type: 'integer', minimum: 1, description: 'Number of sweep steps (default: 20)' },
            observable: { type: 'string', description: 'Observable to analyze (default: first)' },
            method: { type: 'string', enum: ['ode', 'ssa'], description: 'Simulation method (default: ode)' },
            t_end: { type: 'number', minimum: 0, description: 'End time per sweep point (default: 50)' },
          },
          required: ['code', 'parameter', 'sweep_range'],
        },
      },
      {
        name: 'check_phase_handoff',
        description: 'Two-phase simulation: equilibrate, then step a parameter to a new value and track how an observable responds across the transition (e.g. stimulus on/off, dilution).',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'BNGL model code' },
            parameter: { type: 'string', description: 'Parameter to change at the transition' },
            initial_value: { type: 'number', description: 'Parameter value during phase 1' },
            final_value: { type: 'number', description: 'Parameter value during phase 2' },
            transition_time: { type: 'number', minimum: 0, description: 'Duration of phase 1 (equilibration)' },
            observable: { type: 'string', description: 'Observable to track (default: first)' },
            method: { type: 'string', enum: ['ode', 'ssa'], description: 'Simulation method (default: ode)' },
            t_end: { type: 'number', minimum: 0, description: 'End time for each phase (default: transition_time)' },
          },
          required: ['code', 'parameter', 'initial_value', 'final_value', 'transition_time'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments: Record<string, unknown> } }) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'parse_bngl':
      return handleParseBngl(args);
    case 'generate_network':
      return handleGenerateNetwork(args);
    case 'simulate':
      return handleSimulate(args);
    case 'parameter_scan':
      return handleParameterScan(args);
    case 'validate_model':
      return handleValidateModel(args);
    case 'get_contact_map':
      return handleGetContactMap(args);
    case 'fit_parameters':
      return handleFitParameters(args);
    case 'import_petab':
      return handleImportPetab(args);
    case 'reduce_model':
      return handleReduceModel(args);
    case 'query_pathway_commons':
      return handleQueryPathwayCommons(args);
    case 'sobol_sensitivity':
      return handleSobolSensitivity(args);
    case 'identifiability_analysis':
      return handleIdentifiability(args);
    case 'bayesian_inference':
      return handleBayesianInference(args);
    case 'export_model':
      return handleExportModel(args);
    case 'compose_model':
      return handleComposeModel(args);
    case 'edit_model':
      return handleEditModel(args);
    case 'diagnose_model':
      return handleDiagnoseModel(args);
    case 'explain_model':
      return handleExplainModel(args);
    case 'optimal_experiment':
      return handleOptimalExperiment(args);
    case 'verify_model':
      return handleVerifyModel(args);
    case 'bifurcation_analysis':
      return handleBifurcationAnalysis(args);
    case 'temporal_analysis':
      return handleTemporalAnalysis(args);
    case 'symbolic_steady_state':
      return handleSymbolicSteadyState(args);
    case 'compare_models':
      return handleCompareModels(args);
    case 'search_structure':
      return handleSearchStructure(args);
    case 'pkpd':
      return handlePKPD(args);
    case 'multiscale_simulation':
      return handleMultiscaleSimulation(args);
    case 'perturbation_screen':
      return handlePerturbationScreen(args);
    case 'dose_response':
      return handleDoseResponse(args);
    case 'first_passage_time':
      return handleFirstPassageTime(args);
    case 'lna_analysis':
      return handleLnaAnalysis(args);
    case 'reaction_information_flow':
      return handleReactionInformationFlow(args);
    case 'qssa_reduction':
      return handleQssaReduction(args);
    case 'compute_fim':
      return handleComputeFim(args);
    case 'suggest_fix':
      return handleSuggestFix(args);
    case 'check_hysteresis':
      return handleCheckHysteresis(args);
    case 'check_phase_handoff':
      return handleCheckPhaseHandoff(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// start listening (stubbed behavior for tests, stdio transport for runtime)
if (isMain) {
  server.listen?.(new StdioServerTransport());
}

export { server };
