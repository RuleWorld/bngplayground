import { Example } from './types.ts';

// Cell Regulation & Transport

// Complex Published Models

// Growth Factor Signaling

// Immune Signaling
// blbr removed - has generate_network but NO simulate command
// korwek2023 removed - identical to innate_immunity

// Tutorials & Simple Examples


// Native Tutorials
import ABTutorial from './published-models/native-tutorials/AB/AB.bngl?raw';
// import translateSBMLTutorial from './published-models/native-tutorials/SBML/translateSBML.bngl?raw';

// fceri_fyn import is maintained as it was missing from original set


// Test Models


// Literature Models


export const CHART_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

// Set AB model as default
export const INITIAL_BNGL_CODE = ABTutorial;

// Models that successfully parse and simulate with BNG2.pl (ODE/SSA compatible)
// Models not in this list either:
// 1. Use NFsim (network-free simulation) - not supported in browser
// 2. Use deprecated/non-standard syntax
// 3. Have missing dependencies or other BNG2.pl errors
export const BNG2_COMPATIBLE_MODELS = new Set([
  'AB',
  'ABC',
  'ABC_ssa',
  'ABp',
  'ABp_approx',
  'An_2009',
  'BAB',
  'BAB_coop',
  'BaruaBCR_2012',
  'CaOscillate_Func',
  'CaOscillate_Sat',
  'Cheemalavagu_JAK_STAT',
  'ChylekTCR_2014',
  'Chylek_library',
  'ComplexDegradation',
  'Creamer_2012',
  'Dushek_2011',
  'Dushek_2014',
  'GK',
  'Haugh2b',
  'Jaruszewicz-Blonska_2023',
  'Korwek_2023',
  'LR',
  'LRR',
  'LRR_comp',
  'LR_comp',
  'LV',
  'LV_comp',
  'Lang_2024',
  'Lin_ERK_2019',
  'Lin_Prion_2019',
  'Lin_TCR_2019',
  'Lisman',
  'Massole_2023',
  'Motivating_example',
  'Motivating_example_cBNGL',
  'Mukhopadhyay_2013',
  'Repressilator',
  'Rule_based_egfr_tutorial',
  'SHP2_base_model',
  'SIR',
  'Suderman_2013',
  'akt-signaling',
  'allosteric-activation',
  'ampk-signaling',
  'apoptosis-cascade',
  'auto-activation-loop',
  'autophagy-regulation',
  'bcr-signaling',
  'beta-adrenergic-response',
  'birth-death',
  'bistable-toggle-switch',
  'blood-coagulation-thrombin',
  'bmp-signaling',
  'brusselator-oscillator',
  'cBNGL_simple',
  'calcineurin-nfat-pathway',
  'calcium-spike-signaling',
  'caspase-activation-loop',
  'catalysis',
  'cd40-signaling',
  'cell-cycle-checkpoint',
  'checkpoint-kinase-signaling',
  'chemotaxis-signal-transduction',
  'circadian-oscillator',
  'clock-bmal1-gene-circuit',
  'compartment_endocytosis',
  'compartment_membrane_bound',
  'compartment_nested_transport',
  'compartment_nuclear_transport',
  'compartment_organelle_exchange',
  'competitive-enzyme-inhibition',
  'complement-activation-cascade',
  'contact-inhibition-hippo-yap',
  'cooperative-binding',
  'cs_diffie_hellman',
  'cs_hash_function',
  'cs_huffman',
  'cs_monte_carlo_pi',
  'cs_pagerank',
  'cs_pid_controller',
  'cs_regex_nfa',
  'degranulation_model',
  'dna-damage-repair',
  'dna-methylation-dynamics',
  'dr5-apoptosis-signaling',
  'dual-site-phosphorylation',
  'e2f-rb-cell-cycle-switch',
  'eco_coevolution_host_parasite',
  'eco_food_web_chaos_3sp',
  'eco_lotka_volterra_grid',
  'eco_mutualism_obligate',
  'eco_rock_paper_scissors_spatial',
  'egfr-signaling-pathway',
  'egfr_net_red',
  'egfr_path',
  'egfr_simple',
  'eif2a-stress-response',
  'endosomal-sorting-rab',
  'energy_allostery_mwc',
  'energy_catalysis_mm',
  'energy_cooperativity_adh',
  'energy_example1',
  'energy_linear_chain',
  'energy_transport_pump',
  'er-stress-response',
  'erk-nuclear-translocation',
  'feature_functional_rates_volume',
  'feature_global_functions_scan',
  'feature_local_functions_explicit',
  'feature_symmetry_factors_cyclic',
  'feature_synthesis_degradation_ss',
  'fgf-signaling-pathway',
  'gas6-axl-signaling',
  'gene-expression-toggle',
  'genetic_bistability_energy',
  'genetic_dna_replication_stochastic',
  'genetic_goodwin_oscillator',
  'genetic_translation_kinetics',
  'genetic_turing_pattern_1d',
  'glioblastoma-egfrviii-signaling',
  'glycolysis-branch-point',
  'gm_game_of_life',
  'gm_ray_marcher',
  'gpcr-desensitization-arrestin',
  'hedgehog-signaling-pathway',
  'heise',
  'hematopoietic-growth-factor',
  'hif1a_degradation_loop',
  'hypoxia-response-signaling',
  'il1b-signaling',
  'il6-jak-stat-pathway',
  'immune-synapse-formation',
  'inflammasome-activation',
  'innate_immunity',
  'inositol-phosphate-metabolism',
  'insulin-glucose-homeostasis',
  'interferon-signaling',
  'ire1a-xbp1-er-stress',
  'issue_198_short',
  'jak-stat-cytokine-signaling',
  'jnk-mapk-signaling',
  'kir-channel-regulation',
  'l-type-calcium-channel-dynamics',
  'lac-operon-regulation',
  'lipid-mediated-pip3-signaling',
  'localfunc',
  'mapk-signaling-cascade',
  'meta_formal_game_theory',
  'meta_formal_molecular_clock',
  'meta_formal_petri_net',
  'michaelis-menten-kinetics',
  'michment',
  'ml_gradient_descent',
  'ml_hopfield',
  'ml_kmeans',
  'ml_q_learning',
  'ml_svm',
  'motor',
  'mt_arithmetic_compiler',
  'mt_bngl_interpreter',
  'mt_music_sequencer',
  'mt_pascal_triangle',
  'mt_quine',
  'mtor-signaling',
  'mtorc2-signaling',
  'mwc',
  'myogenic-differentiation',
  'negative-feedback-loop',
  'neurotransmitter-release',
  'nfkb',
  'nfkb-feedback',
  'nfsim_aggregation_gelation',
  'nfsim_coarse_graining',
  'nfsim_dynamic_compartments',
  'nfsim_hybrid_particle_field',
  'nfsim_ring_closure_polymer',
  'nn_xor',
  'no-cgmp-signaling',
  'notch-delta-lateral-inhibition',
  'organelle_transport',
  'organelle_transport_struct',
  'oxidative-stress-response',
  'p38-mapk-signaling',
  'p53-mdm2-oscillator',
  'parp1-mediated-dna-repair',
  'ph_lorenz_attractor',
  'ph_nbody_gravity',
  'ph_schrodinger',
  'ph_wave_equation',
  'phosphorelay-chain',
  'platelet-activation',
  'predator-prey-dynamics',
  'process_actin_treadmilling',
  'process_autophagy_flux',
  'process_cell_adhesion_strength',
  'process_kinetic_proofreading_tcr',
  'process_quorum_sensing_switch',
  'quasi_equilibrium',
  'quorum-sensing-circuit',
  'rab-gtpase-cycle',
  'rankl-rank-signaling',
  'ras-gef-gap-cycle',
  'repressilator-oscillator',
  'retinoic-acid-signaling',
  'rho-gtpase-actin-cytoskeleton',
  'shp2-phosphatase-regulation',
  'signal-amplification-cascade',
  'simple-dimerization',
  'simple_system',
  'sir-epidemic-model',
  'smad-tgf-beta-signaling',
  'sonic-hedgehog-gradient',
  'sp_fourier_synthesizer',
  'sp_image_convolution',
  'sp_kalman_filter',
  'stat3-mediated-transcription',
  'stress-response-adaptation',
  'synaptic-plasticity-ltp',
  'synbio_band_pass_filter',
  'synbio_counter_molecular',
  'synbio_edge_detector',
  'synbio_logic_gates_enzymatic',
  'synbio_oscillator_synchronization',
  't-cell-activation',
  'test_ANG_synthesis_simple',
  'test_MM',
  'test_fixed',
  'test_mratio',
  'test_sat',
  'test_synthesis_cBNGL_simple',
  'test_synthesis_complex',
  'test_synthesis_complex_0_cBNGL',
  'test_synthesis_complex_source_cBNGL',
  'test_synthesis_simple',
  'tlmr',
  'tlr3-dsrna-sensing',
  'tnf-induced-apoptosis',
  'toy-jim',
  'two-component-system',
  'univ_synth',
  'vegf-angiogenesis',
  'viral-sensing-innate-immunity',
  'visualize',
  'wacky_alchemy_stone',
  'wacky_black_hole',
  'wacky_bouncing_ball',
  'wacky_traffic_jam_asep',
  'wacky_zombie_infection',
  'wnt-beta-catenin-signaling',
  'wound-healing-pdgf-signaling',
]);


// Models that use NFsim (network-free simulation) - for reference
// These models are now included in the gallery since NFsim is supported
export const NFSIM_MODELS = new Set([
  'Blinov_ran',
  'McMillan_2021',
  'Blinov_egfr',
  'Ligon_2014',
  'Model_ZAP',
  'polymer',
  'polymer_draft',
  'BLBR', // Bivalent ligand-bivalent receptor tutorial model
]);

// Helper to filter models to only those supported by the web simulator UI.
// For now we only expose models that include an explicit ODE `simulate(...)` action.
// This excludes NF-only models (method=>"nf"), models that only emit XML (writeXML + RNF protocol),
// and workflows like bifurcate() that don't produce a timecourse via simulate().
// Helper to strip comments

// For published models, only expose ones that:
// 1) contain an explicit ODE simulate() action, and
// 2) we have verified can run in BNG2.pl and produce outputs (.net + .gdat/.cdat).
// This avoids showing published models that parse in our UI but fail/abort in canonical BNG2.
// =============================
// WEBSITE VISIBILITY GATE
// =============================
// The Example Gallery / model picker must ONLY show models that satisfy BOTH:
//
// (A) Canonical BNG2.pl compatibility ("BNG2 published")
//     - The BNGL file must run successfully in canonical BioNetGen (BNG2.pl)
//     - Verified by running: scripts/verify_published_models_with_bng2.cjs
//       with VERIFY_MODE=parse (i.e., exit status == 0; output files are NOT required).
//     - Source of truth: temp_bng_output/bng2_verify_published_report.json
//       (filter results where status == "PASS").
//
// (B) Deterministic ODE timecourse eligibility ("ODE verified")
//     - The BNGL text must contain an *active* (uncommented) ODE simulate action:
//         simulate({ method => "ode", ... })  OR  simulate_ode(...)
//     - NF-only (simulate_nf / method=>"nf"), writeXML-only, bifurcate-only, etc. do NOT qualify.
//
// This set is the intersection: PASS(parse) Ã¢Ë†Â© HasActiveOdeSimulate.
// It is intentionally a hard allowlist so website contents remain stable/reproducible.
// Last regenerated on 2026-01-04 (count=92) from the verifier report above.
// Note: A separate "web batch run" (e.g., web_output/*.csv) is useful for parity checks,
// but is NOT used for website visibility gating.
export const BNG2_PARSE_AND_ODE_VERIFIED_MODELS = new Set([
  'akt-signaling',
  'allosteric-activation',
  'apoptosis-cascade',
  'auto-activation-loop',
  'beta-adrenergic-response',
  'bistable-toggle-switch',
  'blood-coagulation-thrombin',
  'brusselator-oscillator',
  'calcium-spike-signaling',
  'cBNGL_simple',
  'cell-cycle-checkpoint',
  'chemotaxis-signal-transduction',
  'circadian-oscillator',
  'competitive-enzyme-inhibition',
  'complement-activation-cascade',
  'cooperative-binding',
  'dna-damage-repair',
  'dual-site-phosphorylation',
  'egfr_simple',
  'egfr-signaling-pathway',
  'er-stress-response',
  'gene-expression-toggle',
  'glycolysis-branch-point',
  'hematopoietic-growth-factor',
  'hif1a_degradation_loop',
  'hypoxia-response-signaling',
  'immune-synapse-formation',
  'inflammasome-activation',
  'insulin-glucose-homeostasis',
  'interferon-signaling',
  'jak-stat-cytokine-signaling',
  'lac-operon-regulation',
  'lipid-mediated-pip3-signaling',
  'mapk-signaling-cascade',
  'michaelis-menten-kinetics',
  'mtor-signaling',
  'myogenic-differentiation',
  'negative-feedback-loop',
  'neurotransmitter-release',
  'nfkb-feedback',
  'notch-delta-lateral-inhibition',
  'organelle_transport',
  'organelle_transport_struct',
  'oxidative-stress-response',
  'p53-mdm2-oscillator',
  'phosphorelay-chain',
  'platelet-activation',
  'predator-prey-dynamics',
  'quorum-sensing-circuit',
  'rab-gtpase-cycle',
  'repressilator-oscillator',
  'retinoic-acid-signaling',
  'signal-amplification-cascade',
  'simple-dimerization',
  'sir-epidemic-model',
  'smad-tgf-beta-signaling',
  'stress-response-adaptation',
  'synaptic-plasticity-ltp',
  't-cell-activation',
  'tnf-induced-apoptosis',
  'two-component-system',
  'vegf-angiogenesis',
  'viral-sensing-innate-immunity',
  'wnt-beta-catenin-signaling',
  'wound-healing-pdgf-signaling',

  // Missing Published Models
  // 'blbr', // REMOVED: Has generate_network but NO simulate command

  // Internal Validation Models
]);

// Known BNG2.pl failures or models lacking simulate_ode (explicitly excluded).
// These are excluded from GDAT comparison and CSV creation, but still visible on website if parseable.
export const BNG2_EXCLUDED_MODELS = new Set([
  'Dolan_2015', // Too slow / validation timeout
  'Erdem_2021',
  'Faeder_2003',
  'fceri_2003',
  //   'Barua_2013', // Too slow
  //   'Kozer_2013', // Too slow
  //   'Kozer_2014', // Too slow

  // ========================================================
  // Models that FAIL BNG2.pl parsing (verified 2026-01-14)
  // ========================================================
  'Dushek_2014',    // "Not a CODE reference" error
  'Jung_2017',      // Uses reserved keyword 'end' as parameter name
  'Mertins_2023',   // Invalid block structure (begin reactions vs reaction rules)
  'notch',          // Uses unsupported 'begin molecules' block
  'toy2',           // Uses unsupported 'begin molecules' block
  //   'vilar_2002c',    // Species concentration error / multiple model blocks

  // ========================================================
  // VCell-only models (use 'begin anchors' - not BNG2 syntax)
  // ========================================================
  'Blinov_egfr',               // VCell anchors block
  'Blinov_ran',                // VCell anchors block
  'Rule_based_Ran_transport',  // VCell anchors block
  'Rule_based_Ran_transport_draft', // VCell anchors block
  'Rule_based_egfr_compart',   // VCell anchors block

  // ========================================================
  // NFsim-only models (require network-free simulation)
  // ========================================================
  'polymer',        // NFsim: missing .species / produces no GDAT rows
  'polymer_draft',  // NFsim: missing .species / produces no GDAT rows
  'cheemalavagu_2024', // NOREF: no GDAT produced by BNG2.pl
  'mallela_2022__alabama', // NOREF: no GDAT produced by BNG2.pl
  'pybng__degranulation_model', // NOREF / custom pyBNG wrapper
  'pybng__egfr_ode', // NOREF / custom pyBNG wrapper


  // ========================================================
  // Models too slow for web benchmark (large network expansion)
  // ========================================================
  //   'Lin_ERK_2019',   // 300+ species, 12k+ reactions, takes >160s
  //   'Lin_TCR_2019',   // Similar network complexity to Lin_ERK
  //   'Lin_Prion_2019', // Similar network complexity to Lin_ERK
  'Kozer_2013',     // 1200+ species, 8k+ reactions, too slow
  'Kozer_2014',     // Similar complexity to Kozer_2013

  // Models lacking simulate_ode commands:
  'fceri_fyn_lig',
  'fceri_trimer',
  'fceri_fyn',
  'fceri_gamma2_asym',
  'fceri_gamma2',
  'fceri_ji_red',
  'fceri_lyn_745',
  'hybrid_test_hpp',
  'test_sbml_flat_SBML',
  'test_sbml_structured_SBML',
  'wofsy-goldstein',
  // Additional models without ODE simulation or special formats:
  'ANx',
  'deleteMolecules',
  'empty_compartments_block',
  'gene_expr_func',
  'gene_expr_simple',
  'gene_expr',
  'hybrid_test',
  'isingspin_energy',
  'isingspin_localfcn',
  'isomerization',
  'partial_dynamical_scaling',
  'simple_nfsim',
  'statfactor',
  'test_ANG_parscan_synthesis_simple',
  'test_ANG_SSA_synthesis_simple',
  'test_assignment',
  'test_compartment_XML',
  'test_continue',
  'test_paramname',
  'test_partial_dynamical_scaling',
  'test_sat_cont',
  'test_sbml_flat',
  'test_sbml_structured',
  'test_setconc',
  'test_tfun',
  'test_write_sbml_multi',
]);

const filterCompatibleModels = (models: Example[]): Example[] =>
  models.filter((m) => {
    // Only include models verified to be BNG2.pl compatible
    if (!BNG2_COMPATIBLE_MODELS.has(m.id)) return false;

    // Code is not bundled after lazy-load migration; BNG2_COMPATIBLE_MODELS
    // membership already implies a simulate action exists, so skip code parsing.
    if (!m.code) return true;

    const lines = m.code.split('\n');

    // Check for uncommented actions
    let hasSimulate = false;

    for (const line of lines) {
      const codePart = line.split('#')[0];
      // Check for any simulate action (simulate, simulate_ode, simulate_ssa, simulate_nf, etc.)
      if (codePart.includes('simulate')) {
        hasSimulate = true;
        break; // Found a simulate action, no need to continue
      }
    }

    // Debug logging for specific models and all NFsim models
    if (m.id === 'Model_ZAP' || m.id === 'polymer' || m.id === 'polymer_draft' || NFSIM_MODELS.has(m.id)) {
      console.log(`[filterCompatibleModels] ${m.id}: hasSimulate=${hasSimulate}, excluded=${BNG2_EXCLUDED_MODELS.has(m.id)}, isNFsim=${NFSIM_MODELS.has(m.id)}`);
    }

    // Require at least some simulate action
    // This includes ODE, SSA, and NFsim simulations
    if (!hasSimulate) return false;

    return true;
  });
const CELL_REGULATION: Example[] = [
  {
    id: 'Barua_2013',
    name: 'Barua 2013',
    description: 'Beta-catenin destruction',
    tags: ['published'],
  },
  {
    id: 'Blinov_ran',
    name: 'Blinov ran',
    description: 'Ran GTPase cycle',
    tags: ['published'],
  },
  {
    id: 'Hat_2016',
    name: 'Hat 2016',
    description: 'Nuclear transport',
    tags: ['published'],
  },
  {
    id: 'Kocieniewski_2012',
    name: 'Kocieniewski 2012',
    description: 'Actin dynamics',
    tags: ['published'],
  },
  {
    id: 'notch',
    name: 'Notch',
    description: 'Notch signaling',
    tags: ['published'],
  },
  {
    id: 'Pekalski_2013',
    name: 'Pekalski 2013',
    description: 'Spontaneous signaling',
    tags: ['published'],
  },
  {
    id: 'Rule_based_Ran_transport',
    name: 'Rule based Ran transport',
    description: 'Nuclear Ran transport',
    tags: ['published'],
  },
  {
    id: 'Rule_based_Ran_transport_draft',
    name: 'Rule based Ran transport draft',
    description: 'Ran transport (draft)',
    tags: ['published'],
  },
  {
    id: 'vilar_2002',
    name: 'Vilar 2002',
    description: 'Genetic oscillator',
    tags: ['published'],
  },
  {
    id: 'vilar_2002b',
    name: 'Vilar 2002b',
    description: 'Gene oscillator',
    tags: ['published'],
  },
  {
    id: 'vilar_2002c',
    name: 'Vilar 2002c',
    description: 'Gene oscillator',
    tags: ['published'],
  },
  {
    id: 'wnt',
    name: 'Wnt Signaling',
    description: 'Wnt signaling',
    tags: ['published'],
  },
];

const COMPLEX_MODELS: Example[] = [
  {
    id: 'Barua_2007',
    name: 'Barua 2007',
    description: 'Model from Haugh (2006)',
    tags: ['published'],
  },
  {
    id: 'Barua_2009',
    name: 'Barua 2009',
    description: 'JAK2-SH2B signaling',
    tags: ['published'],
  },
  {
    id: 'Blinov_2006',
    name: 'Blinov 2006',
    description: 'Phosphotyrosine signaling',
    tags: ['published'],
  },
  {
    id: 'Chattaraj_2021',
    name: 'Chattaraj 2021',
    description: 'NFkB oscillations',
    tags: ['published'],
  },
  {
    id: 'Dushek_2011',
    name: 'Dushek 2011',
    description: 'TCR signaling',
    tags: ['published'],
  },
  {
    id: 'Dushek_2014',
    name: 'Dushek 2014',
    description: 'TCR signaling dynamics',
    tags: ['published'],
  },
  {
    id: 'Erdem_2021',
    name: 'Erdem 2021',
    description: 'InsR/IGF1R signaling',
    tags: ['published'],
  },
  {
    id: 'Jung_2017',
    name: 'Jung 2017',
    description: 'M1 receptor signaling',
    tags: ['published'],
  },
  {
    id: 'Kesseler_2013',
    name: 'Kesseler 2013',
    description: 'G2/Mitosis transition',
    tags: ['published'],
  },
  {
    id: 'Kozer_2013',
    name: 'Kozer 2013',
    description: 'EGFR oligomerization',
    tags: ['published'],
  },
  {
    id: 'Kozer_2014',
    name: 'Kozer 2014',
    description: 'Grb2-EGFR recruitment',
    tags: ['published'],
  },
  {
    id: 'mapk-dimers',
    name: 'MAPK Dimers',
    description: 'MAPK dimerization',
    tags: ['published'],
  },
  {
    id: 'mapk-monomers',
    name: 'MAPK Monomers',
    description: 'MAPK cascade',
    tags: ['published'],
  },
  {
    id: 'Massole_2023',
    name: 'Massole 2023',
    description: 'Epo receptor signaling',
    tags: ['published'],
  },
  {
    id: 'McMillan_2021',
    name: 'McMillan 2021',
    description: 'TNF signaling',
    tags: ['published'],
  },
  {
    id: 'Nag_2009',
    name: 'Nag 2009',
    description: 'LAT-Grb2-SOS1 signaling',
    tags: ['published'],
  },
  {
    id: 'Nosbisch_2022',
    name: 'Nosbisch 2022',
    description: 'RTK-PLCgamma1 signaling',
    tags: ['published'],
  },
  {
    id: 'Zhang_2021',
    name: 'Zhang 2021',
    description: 'CAR-T signaling',
    tags: ['published'],
  },
  {
    id: 'Zhang_2023',
    name: 'Zhang 2023',
    description: 'VEGF signaling',
    tags: ['published'],
  },
  {
    id: 'Lin_Prion_2019',
    name: 'Lin 2019',
    description: 'Prion replication',
    tags: ['published', 'literature', 'prion'],
  },
];

const GROWTH_FACTOR_SIGNALING: Example[] = [
  {
    id: 'Blinov_egfr',
    name: 'Blinov egfr',
    description: 'EGFR signaling model',
    tags: ['published'],
  },
  {
    id: 'Lang_2024',
    name: 'Lang 2024',
    description: 'Cell cycle regulation',
    tags: ['published'],
  },
  {
    id: 'Ligon_2014',
    name: 'Ligon 2014',
    description: 'Lipoplex delivery',
    tags: ['published'],
  },
  {
    id: 'Mertins_2023',
    name: 'Mertins 2023',
    description: 'DNA damage response',
    tags: ['published'],
  },
  {
    id: 'Rule_based_egfr_compart',
    name: 'Rule based egfr compart',
    description: 'Compartmental EGFR model',
    tags: ['published'],
  },
  {
    id: 'Rule_based_egfr_tutorial',
    name: 'Faeder 2009',
    description: 'EGFR signaling',
    tags: ['published'],
  },
  {
    id: 'Dolan_2015',
    name: 'Dolan 2015',
    description: 'Insulin signaling',
    tags: ['published', 'literature', 'signaling'],
  },
  {
    id: 'Lin_ERK_2019',
    name: 'Lin 2019',
    description: 'ERK signaling',
    tags: ['published', 'literature', 'signaling'],
  },

  {
    id: 'egfr_ode',
    name: 'PyBNG: EGFR ODE',
    description: 'EGFR ODE',
    tags: ['published', 'PyBNG'],
  },
];

const IMMUNE_SIGNALING: Example[] = [
  {
    id: 'An_2009',
    name: 'An 2009',
    description: 'TLR4 signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'BaruaBCR_2012',
    name: 'Barua 2012',
    description: 'BCR signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'BaruaFceRI_2012',
    name: 'BaruaFceRI 2012',
    description: 'FcÃŽÂµRI signaling',
    tags: ['published', 'immunology'],
  },
  // REMOVED: blbr model has generate_network but NO simulate command
  // {
  //   id: 'blbr',
  //   name: 'BLBR',
  //   description: 'Bivalent ligand binding',
  //   code: blbr,
  //   tags: ['published', 'immunology'],
  // },
  {
    id: 'ChylekFceRI_2014',
    name: 'Chylek 2014 (FceRI)',
    description: 'FceRI signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'ChylekTCR_2014',
    name: 'Chylek 2014 (TCR)',
    description: 'TCR signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'Faeder_2003',
    name: 'Faeder 2003',
    description: 'FceRI signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'innate_immunity',
    name: 'Korwek 2023',
    description: 'Immune response',
    tags: ['published', 'immunology'],
  },
  {
    id: 'Jaruszewicz-Blonska_2023',
    name: 'Jaruszewicz 2023',
    description: 'T-cell discrimination',
    tags: ['published', 'immunology'],
  },

  {
    id: 'Model_ZAP',
    name: 'Model ZAP',
    description: 'ZAP-70 recruitment',
    tags: ['published', 'immunology'],
  },
  {
    id: 'Mukhopadhyay_2013',
    name: 'Mukhopadhyay 2013',
    description: 'FceRI signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'fceri_fyn',
    name: 'FceRI Fyn',
    description: 'FceRI signaling',
    tags: ['published', 'immunology'],
  },
  {
    id: 'tlbr',
    name: 'TLBR Tutorial',
    description: 'Ligand binding',
    tags: ['published', 'immunology'],
  },
  {
    id: 'Lin_TCR_2019',
    name: 'Lin 2019',
    description: 'TCR signaling',
    tags: ['published', 'literature', 'immune'],
  },
  {
    id: 'Cheemalavagu_JAK_STAT',
    name: 'Cheemalavagu 2024',
    description: 'JAK-STAT signaling',
    tags: ['published', 'literature', 'signaling'],
  },

  {
    id: 'degranulation_model',
    name: 'PyBNG: Degranulation model',
    description: 'Degranulation model',
    tags: ['published', 'PyBNG'],
  },
];

// New published-models categories added from published-models/ directory
const ORDYAN_2020: Example[] = [
  {
    id: 'CaMKII_holo',
    name: 'Ordyan 2020: CaMKII holo',
    description: 'CaMKII holo',
    tags: ['published', 'neuroscience'],
  },
  {
    id: 'extra_CaMKII_Holo',
    name: 'Ordyan 2020: extra CaMKII holo',
    description: 'Extra CaMKII holo (supplement)',
    tags: ['published', 'neuroscience'],
  },
  {
    id: 'mCaMKII_Ca_Spike',
    name: 'Ordyan 2020: mCaMKII Ca Spike',
    description: 'mCaMKII Ca Spike model',
    tags: ['published', 'neuroscience'],
  },
];





const TUTORIALS: Example[] = [
  {
    id: 'chemistry',
    name: 'chemistry',
    description: 'Basic chemical reactions',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer',
    name: 'polymer',
    description: 'Polymerization model',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer_draft',
    name: 'polymer draft',
    description: 'Polymerization (draft)',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'simple',
    name: 'simple',
    description: 'Simple binding model',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy1',
    name: 'toy1',
    description: 'Basic signaling toy',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy2',
    name: 'toy2',
    description: 'Enzymatic reaction toy',
    tags: ['published', 'tutorials'],
  },
  {
    id: 'quasi_equilibrium',
    name: 'quasi equilibrium',
    description: 'Quasi-equilibrium approximation',
    tags: ['published', 'toy models'],
  },
  {
    id: 'sir-epidemic-model',
    name: 'sir epidemic model',
    description: 'SIR epidemic model',
    tags: ['published', 'epidemiology'],
  },

];

const TEST_MODELS: Example[] = [
  {
    id: 'akt-signaling',
    name: 'akt signaling',
    description: 'Akt Signaling',
    tags: ['example model'],
  },
  {
    id: 'allosteric-activation',
    name: 'allosteric activation',
    description: 'Allosteric Activation',
    tags: ['example model'],
  },
  {
    id: 'ampk-signaling',
    name: 'ampk signaling',
    description: 'Ampk Signaling',
    tags: ['example model'],
  },
  {
    id: 'apoptosis-cascade',
    name: 'apoptosis cascade',
    description: 'Apoptosis Cascade',
    tags: ['example model'],
  },
  {
    id: 'auto-activation-loop',
    name: 'auto activation loop',
    description: 'Auto Activation Loop',
    tags: ['example model'],
  },
  {
    id: 'autophagy-regulation',
    name: 'autophagy regulation',
    description: 'Autophagy Regulation',
    tags: ['example model'],
  },
  {
    id: 'bcr-signaling',
    name: 'bcr signaling',
    description: 'Bcr Signaling',
    tags: ['example model'],
  },
  {
    id: 'beta-adrenergic-response',
    name: 'beta adrenergic response',
    description: 'Beta Adrenergic Response',
    tags: ['example model'],
  },
  {
    id: 'bistable-toggle-switch',
    name: 'bistable toggle switch',
    description: 'Bistable Toggle Switch',
    tags: ['example model'],
  },
  {
    id: 'blood-coagulation-thrombin',
    name: 'blood coagulation thrombin',
    description: 'Blood Coagulation Thrombin',
    tags: ['example model'],
  },
  {
    id: 'bmp-signaling',
    name: 'bmp signaling',
    description: 'Bmp Signaling',
    tags: ['example model'],
  },
  {
    id: 'brusselator-oscillator',
    name: 'brusselator oscillator',
    description: 'Brusselator Oscillator',
    tags: ['example model'],
  },
  {
    id: 'calcineurin-nfat-pathway',
    name: 'calcineurin nfat pathway',
    description: 'Calcineurin Nfat Pathway',
    tags: ['example model'],
  },
  {
    id: 'calcium-spike-signaling',
    name: 'calcium spike signaling',
    description: 'Calcium Spike Signaling',
    tags: ['example model'],
  },
  {
    id: 'caspase-activation-loop',
    name: 'caspase activation loop',
    description: 'Caspase Activation Loop',
    tags: ['example model'],
  },
  {
    id: 'cd40-signaling',
    name: 'cd40 signaling',
    description: 'Cd40 Signaling',
    tags: ['example model'],
  },
  {
    id: 'cell-cycle-checkpoint',
    name: 'cell cycle checkpoint',
    description: 'Cell Cycle Checkpoint',
    tags: ['example model'],
  },
  {
    id: 'checkpoint-kinase-signaling',
    name: 'checkpoint kinase signaling',
    description: 'Checkpoint Kinase Signaling',
    tags: ['example model'],
  },
  {
    id: 'chemotaxis-signal-transduction',
    name: 'chemotaxis signal transduction',
    description: 'Chemotaxis Signal Transduction',
    tags: ['example model'],
  },
  {
    id: 'circadian-oscillator',
    name: 'circadian oscillator',
    description: 'Circadian Oscillator',
    tags: ['example model'],
  },
  {
    id: 'clock-bmal1-gene-circuit',
    name: 'clock bmal1 gene circuit',
    description: 'Clock Bmal1 Gene Circuit',
    tags: ['example model'],
  },
  {
    id: 'compartment_endocytosis',
    name: 'compartment endocytosis',
    description: 'Compartment Endocytosis',
    tags: ['example model'],
  },
  {
    id: 'compartment_membrane_bound',
    name: 'compartment membrane bound',
    description: 'Compartment Membrane Bound',
    tags: ['example model'],
  },
  {
    id: 'compartment_nested_transport',
    name: 'compartment nested transport',
    description: 'Compartment Nested Transport',
    tags: ['example model'],
  },
  {
    id: 'compartment_nuclear_transport',
    name: 'compartment nuclear transport',
    description: 'Compartment Nuclear Transport',
    tags: ['example model'],
  },
  {
    id: 'compartment_organelle_exchange',
    name: 'compartment organelle exchange',
    description: 'Compartment Organelle Exchange',
    tags: ['example model'],
  },
  {
    id: 'competitive-enzyme-inhibition',
    name: 'competitive enzyme inhibition',
    description: 'Competitive Enzyme Inhibition',
    tags: ['example model'],
  },
  {
    id: 'complement-activation-cascade',
    name: 'complement activation cascade',
    description: 'Complement Activation Cascade',
    tags: ['example model'],
  },
  {
    id: 'contact-inhibition-hippo-yap',
    name: 'contact inhibition hippo yap',
    description: 'Contact Inhibition Hippo Yap',
    tags: ['example model'],
  },
  {
    id: 'cooperative-binding',
    name: 'cooperative binding',
    description: 'Cooperative Binding',
    tags: ['example model'],
  },
  {
    id: 'cs_diffie_hellman',
    name: 'Diffie-Hellman',
    description: 'Diffie-Hellman Key Exchange',
    tags: ['example model'],
  },
  {
    id: 'cs_hash_function',
    name: 'Hash Function',
    description: 'Hash Function',
    tags: ['example model'],
  },
  {
    id: 'cs_huffman',
    name: 'Huffman Coding',
    description: 'Huffman Coding',
    tags: ['example model'],
  },
  {
    id: 'cs_monte_carlo_pi',
    name: 'Monte Carlo Pi',
    description: 'Monte Carlo Pi Estimation',
    tags: ['example model'],
  },
  {
    id: 'cs_pagerank',
    name: 'PageRank',
    description: 'PageRank Algorithm',
    tags: ['example model'],
  },
  {
    id: 'cs_pid_controller',
    name: 'PID Controller',
    description: 'PID Controller',
    tags: ['example model'],
  },
  {
    id: 'cs_regex_nfa',
    name: 'Regex NFA',
    description: 'Regex NFA Simulation',
    tags: ['example model'],
  },
  {
    id: 'dna-damage-repair',
    name: 'dna damage repair',
    description: 'Dna Damage Repair',
    tags: ['example model'],
  },
  {
    id: 'dna-methylation-dynamics',
    name: 'dna methylation dynamics',
    description: 'Dna Methylation Dynamics',
    tags: ['example model'],
  },
  {
    id: 'dr5-apoptosis-signaling',
    name: 'dr5 apoptosis signaling',
    description: 'Dr5 Apoptosis Signaling',
    tags: ['example model'],
  },
  {
    id: 'dual-site-phosphorylation',
    name: 'dual site phosphorylation',
    description: 'Dual Site Phosphorylation',
    tags: ['example model'],
  },
  {
    id: 'e2f-rb-cell-cycle-switch',
    name: 'e2f rb cell cycle switch',
    description: 'E2f Rb Cell Cycle Switch',
    tags: ['example model'],
  },
  {
    id: 'eco_coevolution_host_parasite',
    name: 'Coevolution: Host-Parasite',
    description: 'Host-Parasite Coevolution',
    tags: ['example model'],
  },
  {
    id: 'eco_food_web_chaos_3sp',
    name: 'Food Web Chaos (3 Species)',
    description: 'Food Web Chaos (3 Species)',
    tags: ['example model'],
  },
  {
    id: 'eco_lotka_volterra_grid',
    name: 'Lotka-Volterra Grid',
    description: 'Lotka-Volterra Grid',
    tags: ['example model'],
  },
  {
    id: 'eco_mutualism_obligate',
    name: 'Obligate Mutualism',
    description: 'Obligate Mutualism',
    tags: ['example model'],
  },
  {
    id: 'eco_rock_paper_scissors_spatial',
    name: 'Rock-Paper-Scissors (Spatial)',
    description: 'Rock-Paper-Scissors Spatial',
    tags: ['example model'],
  },
  {
    id: 'egfr-signaling-pathway',
    name: 'egfr signaling pathway',
    description: 'Egfr Signaling Pathway',
    tags: ['example model'],
  },
  {
    id: 'eif2a-stress-response',
    name: 'eif2a stress response',
    description: 'Eif2a Stress Response',
    tags: ['example model'],
  },
  {
    id: 'endosomal-sorting-rab',
    name: 'endosomal sorting rab',
    description: 'Endosomal Sorting Rab',
    tags: ['example model'],
  },
  {
    id: 'energy_allostery_mwc',
    name: 'Allostery (MWC)',
    description: 'Allostery (MWC Model)',
    tags: ['example model'],
  },
  {
    id: 'energy_catalysis_mm',
    name: 'Catalysis (MM)',
    description: 'Catalysis (Michaelis-Menten)',
    tags: ['example model'],
  },
  {
    id: 'energy_cooperativity_adh',
    name: 'Cooperativity (ADH)',
    description: 'Cooperativity (ADH)',
    tags: ['example model'],
  },
  {
    id: 'energy_linear_chain',
    name: 'Linear Chain (Energy)',
    description: 'Linear Chain',
    tags: ['example model'],
  },
  {
    id: 'energy_transport_pump',
    name: 'Transport Pump (Energy)',
    description: 'Transport Pump',
    tags: ['example model'],
  },
  {
    id: 'er-stress-response',
    name: 'er stress response',
    description: 'Er Stress Response',
    tags: ['example model'],
  },
  {
    id: 'erk-nuclear-translocation',
    name: 'erk nuclear translocation',
    description: 'Erk Nuclear Translocation',
    tags: ['example model'],
  },
  {
    id: 'feature_functional_rates_volume',
    name: 'Functional Rates (Volume)',
    description: 'Functional Rates with Volume',
    tags: ['example model'],
  },
  {
    id: 'feature_global_functions_scan',
    name: 'Global Functions Scan',
    description: 'Global Functions Scan',
    tags: ['example model'],
  },
  {
    id: 'feature_local_functions_explicit',
    name: 'Local Functions (Explicit)',
    description: 'Local Functions (Explicit)',
    tags: ['example model'],
  },
  {
    id: 'feature_symmetry_factors_cyclic',
    name: 'Symmetry Factors (Cyclic)',
    description: 'Symmetry Factors (Cyclic)',
    tags: ['example model'],
  },
  {
    id: 'feature_synthesis_degradation_ss',
    name: 'Synthesis-Degradation SS',
    description: 'Synthesis-Degradation Steady State',
    tags: ['example model'],
  },
  {
    id: 'fgf-signaling-pathway',
    name: 'fgf signaling pathway',
    description: 'Fgf Signaling Pathway',
    tags: ['example model'],
  },
  {
    id: 'gas6-axl-signaling',
    name: 'gas6 axl signaling',
    description: 'Gas6 Axl Signaling',
    tags: ['example model'],
  },
  {
    id: 'gene-expression-toggle',
    name: 'gene expression toggle',
    description: 'Gene Expression Toggle',
    tags: ['example model'],
  },
  {
    id: 'genetic_bistability_energy',
    name: 'genetic bistability energy',
    description: 'Bistability Energy',
    tags: ['example model'],
  },
  {
    id: 'genetic_dna_replication_stochastic',
    name: 'genetic dna replication stochastic',
    description: 'Dna Replication Stochastic',
    tags: ['example model'],
  },
  {
    id: 'genetic_goodwin_oscillator',
    name: 'genetic goodwin oscillator',
    description: 'Goodwin Oscillator',
    tags: ['example model'],
  },
  {
    id: 'genetic_translation_kinetics',
    name: 'genetic translation kinetics',
    description: 'Translation Kinetics',
    tags: ['example model'],
  },
  {
    id: 'genetic_turing_pattern_1d',
    name: 'genetic turing pattern 1d',
    description: 'Turing Pattern 1d',
    tags: ['example model'],
  },
  {
    id: 'glioblastoma-egfrviii-signaling',
    name: 'glioblastoma egfrviii signaling',
    description: 'Glioblastoma Egfrviii Signaling',
    tags: ['example model'],
  },
  {
    id: 'glycolysis-branch-point',
    name: 'glycolysis branch point',
    description: 'Glycolysis Branch Point',
    tags: ['example model'],
  },
  {
    id: 'gm_game_of_life',
    name: 'gm game of life',
    description: 'Game Of Life',
    tags: ['example model'],
  },
  {
    id: 'gm_ray_marcher',
    name: 'gm ray marcher',
    description: 'Ray Marcher',
    tags: ['example model'],
  },
  {
    id: 'gpcr-desensitization-arrestin',
    name: 'gpcr desensitization arrestin',
    description: 'Gpcr Desensitization Arrestin',
    tags: ['example model'],
  },
  {
    id: 'hedgehog-signaling-pathway',
    name: 'hedgehog signaling pathway',
    description: 'Hedgehog Signaling Pathway',
    tags: ['example model'],
  },
  {
    id: 'hematopoietic-growth-factor',
    name: 'hematopoietic growth factor',
    description: 'Hematopoietic Growth Factor',
    tags: ['example model'],
  },
  {
    id: 'hif1a_degradation_loop',
    name: 'hif1a degradation loop',
    description: 'Hif1a Degradation Loop',
    tags: ['example model'],
  },
  {
    id: 'hypoxia-response-signaling',
    name: 'hypoxia response signaling',
    description: 'Hypoxia Response Signaling',
    tags: ['example model'],
  },
  {
    id: 'il1b-signaling',
    name: 'il1b signaling',
    description: 'Il1b Signaling',
    tags: ['example model'],
  },
  {
    id: 'il6-jak-stat-pathway',
    name: 'il6 jak stat pathway',
    description: 'Il6 Jak Stat Pathway',
    tags: ['example model'],
  },
  {
    id: 'immune-synapse-formation',
    name: 'immune synapse formation',
    description: 'Immune Synapse Formation',
    tags: ['example model'],
  },
  {
    id: 'inflammasome-activation',
    name: 'inflammasome activation',
    description: 'Inflammasome Activation',
    tags: ['example model'],
  },
  {
    id: 'inositol-phosphate-metabolism',
    name: 'inositol phosphate metabolism',
    description: 'Inositol Phosphate Metabolism',
    tags: ['example model'],
  },
  {
    id: 'insulin-glucose-homeostasis',
    name: 'insulin glucose homeostasis',
    description: 'Insulin Glucose Homeostasis',
    tags: ['example model'],
  },
  {
    id: 'interferon-signaling',
    name: 'interferon signaling',
    description: 'Interferon Signaling',
    tags: ['example model'],
  },
  {
    id: 'ire1a-xbp1-er-stress',
    name: 'ire1a xbp1 er stress',
    description: 'Ire1a Xbp1 Er Stress',
    tags: ['example model'],
  },
  {
    id: 'jak-stat-cytokine-signaling',
    name: 'jak stat cytokine signaling',
    description: 'Jak Stat Cytokine Signaling',
    tags: ['example model'],
  },
  {
    id: 'jnk-mapk-signaling',
    name: 'jnk mapk signaling',
    description: 'Jnk Mapk Signaling',
    tags: ['example model'],
  },
  {
    id: 'kir-channel-regulation',
    name: 'kir channel regulation',
    description: 'Kir Channel Regulation',
    tags: ['example model'],
  },
  {
    id: 'l-type-calcium-channel-dynamics',
    name: 'l type calcium channel dynamics',
    description: 'L Type Calcium Channel Dynamics',
    tags: ['example model'],
  },
  {
    id: 'lac-operon-regulation',
    name: 'lac operon regulation',
    description: 'Lac Operon Regulation',
    tags: ['example model'],
  },
  {
    id: 'lipid-mediated-pip3-signaling',
    name: 'lipid mediated pip3 signaling',
    description: 'Lipid Mediated Pip3 Signaling',
    tags: ['example model'],
  },
  {
    id: 'mapk-signaling-cascade',
    name: 'mapk signaling cascade',
    description: 'Mapk Signaling Cascade',
    tags: ['example model'],
  },
  {
    id: 'meta_formal_game_theory',
    name: 'meta formal game theory',
    description: 'Formal Game Theory',
    tags: ['example model'],
  },
  {
    id: 'meta_formal_molecular_clock',
    name: 'meta formal molecular clock',
    description: 'Formal Molecular Clock',
    tags: ['example model'],
  },
  {
    id: 'meta_formal_petri_net',
    name: 'meta formal petri net',
    description: 'Formal Petri Net',
    tags: ['example model'],
  },
  {
    id: 'michaelis-menten-kinetics',
    name: 'michaelis menten kinetics',
    description: 'Michaelis Menten Kinetics',
    tags: ['example model'],
  },
  {
    id: 'ml_gradient_descent',
    name: 'Gradient Descent',
    description: 'Gradient Descent',
    tags: ['example model'],
  },
  {
    id: 'ml_hopfield',
    name: 'Hopfield Network',
    description: 'Hopfield Network',
    tags: ['example model'],
  },
  {
    id: 'ml_kmeans',
    name: 'K-Means Clustering',
    description: 'K-Means Clustering',
    tags: ['example model'],
  },
  {
    id: 'ml_q_learning',
    name: 'Q-Learning',
    description: 'Q-Learning',
    tags: ['example model'],
  },
  {
    id: 'ml_svm',
    name: 'Support Vector Machine',
    description: 'Support Vector Machine',
    tags: ['example model'],
  },
  {
    id: 'mt_arithmetic_compiler',
    name: 'Arithmetic Compiler',
    description: 'Arithmetic Compiler',
    tags: ['example model'],
  },
  {
    id: 'mt_bngl_interpreter',
    name: 'BNGL Interpreter',
    description: 'BNGL Interpreter',
    tags: ['example model'],
  },
  {
    id: 'mt_music_sequencer',
    name: 'Music Sequencer',
    description: 'Music Sequencer',
    tags: ['example model'],
  },
  {
    id: 'mt_pascal_triangle',
    name: "Pascal's Triangle",
    description: "Pascal's Triangle",
    tags: ['example model'],
  },
  {
    id: 'mt_quine',
    name: 'Quine',
    description: 'Quine',
    tags: ['example model'],
  },
  {
    id: 'mtor-signaling',
    name: 'mtor signaling',
    description: 'Mtor Signaling',
    tags: ['example model'],
  },
  {
    id: 'mtorc2-signaling',
    name: 'mtorc2 signaling',
    description: 'Mtorc2 Signaling',
    tags: ['example model'],
  },
  {
    id: 'myogenic-differentiation',
    name: 'myogenic differentiation',
    description: 'Myogenic Differentiation',
    tags: ['example model'],
  },
  {
    id: 'negative-feedback-loop',
    name: 'negative feedback loop',
    description: 'Negative Feedback Loop',
    tags: ['example model'],
  },
  {
    id: 'neurotransmitter-release',
    name: 'neurotransmitter release',
    description: 'Neurotransmitter Release',
    tags: ['example model'],
  },
  {
    id: 'nfkb-feedback',
    name: 'nfkb feedback',
    description: 'Nfkb Feedback',
    tags: ['example model'],
  },
  {
    id: 'nfsim_aggregation_gelation',
    name: 'Aggregation Gelation',
    description: 'Aggregation Gelation',
    tags: ['example model'],
  },
  {
    id: 'nfsim_coarse_graining',
    name: 'Coarse Graining',
    description: 'Coarse Graining',
    tags: ['example model'],
  },
  {
    id: 'nfsim_dynamic_compartments',
    name: 'Dynamic Compartments',
    description: 'Dynamic Compartments',
    tags: ['example model'],
  },
  {
    id: 'nfsim_hybrid_particle_field',
    name: 'Hybrid Particle Field',
    description: 'Hybrid Particle Field',
    tags: ['example model'],
  },
  {
    id: 'nfsim_ring_closure_polymer',
    name: 'Ring Closure Polymer',
    description: 'Ring Closure Polymer',
    tags: ['example model'],
  },
  {
    id: 'nn_xor',
    name: 'XOR Neural Network',
    description: 'XOR Neural Network',
    tags: ['example model'],
  },
  {
    id: 'no-cgmp-signaling',
    name: 'no cgmp signaling',
    description: 'No Cgmp Signaling',
    tags: ['example model'],
  },
  {
    id: 'notch-delta-lateral-inhibition',
    name: 'notch delta lateral inhibition',
    description: 'Notch Delta Lateral Inhibition',
    tags: ['example model'],
  },
  {
    id: 'oxidative-stress-response',
    name: 'oxidative stress response',
    description: 'Oxidative Stress Response',
    tags: ['example model'],
  },
  {
    id: 'p38-mapk-signaling',
    name: 'p38 mapk signaling',
    description: 'P38 Mapk Signaling',
    tags: ['example model'],
  },
  {
    id: 'p53-mdm2-oscillator',
    name: 'p53 mdm2 oscillator',
    description: 'P53 Mdm2 Oscillator',
    tags: ['example model'],
  },
  {
    id: 'parp1-mediated-dna-repair',
    name: 'parp1 mediated dna repair',
    description: 'Parp1 Mediated Dna Repair',
    tags: ['example model'],
  },
  {
    id: 'ph_lorenz_attractor',
    name: 'Lorenz Attractor',
    description: 'Lorenz Attractor',
    tags: ['example model'],
  },
  {
    id: 'ph_nbody_gravity',
    name: 'N-Body Gravity',
    description: 'N-Body Gravity',
    tags: ['example model'],
  },
  {
    id: 'ph_schrodinger',
    name: 'Schrödinger Equation',
    description: 'Schrödinger Equation',
    tags: ['example model'],
  },
  {
    id: 'ph_wave_equation',
    name: 'Wave Equation',
    description: 'Wave Equation',
    tags: ['example model'],
  },
  {
    id: 'phosphorelay-chain',
    name: 'phosphorelay chain',
    description: 'Phosphorelay Chain',
    tags: ['example model'],
  },
  {
    id: 'platelet-activation',
    name: 'platelet activation',
    description: 'Platelet Activation',
    tags: ['example model'],
  },
  {
    id: 'predator-prey-dynamics',
    name: 'predator prey dynamics',
    description: 'Predator Prey Dynamics',
    tags: ['example model'],
  },
  {
    id: 'process_actin_treadmilling',
    name: 'process actin treadmilling',
    description: 'Actin Treadmilling',
    tags: ['example model'],
  },
  {
    id: 'process_autophagy_flux',
    name: 'process autophagy flux',
    description: 'Autophagy Flux',
    tags: ['example model'],
  },
  {
    id: 'process_cell_adhesion_strength',
    name: 'process cell adhesion strength',
    description: 'Cell Adhesion Strength',
    tags: ['example model'],
  },
  {
    id: 'process_kinetic_proofreading_tcr',
    name: 'process kinetic proofreading tcr',
    description: 'Kinetic Proofreading Tcr',
    tags: ['example model'],
  },
  {
    id: 'process_quorum_sensing_switch',
    name: 'process quorum sensing switch',
    description: 'Quorum Sensing Switch',
    tags: ['example model'],
  },
  {
    id: 'quorum-sensing-circuit',
    name: 'quorum sensing circuit',
    description: 'Quorum Sensing Circuit',
    tags: ['example model'],
  },
  {
    id: 'rab-gtpase-cycle',
    name: 'rab gtpase cycle',
    description: 'Rab Gtpase Cycle',
    tags: ['example model'],
  },
  {
    id: 'rankl-rank-signaling',
    name: 'rankl rank signaling',
    description: 'Rankl Rank Signaling',
    tags: ['example model'],
  },
  {
    id: 'ras-gef-gap-cycle',
    name: 'ras gef gap cycle',
    description: 'Ras Gef Gap Cycle',
    tags: ['example model'],
  },
  {
    id: 'repressilator-oscillator',
    name: 'repressilator oscillator',
    description: 'Repressilator Oscillator',
    tags: ['example model'],
  },
  {
    id: 'retinoic-acid-signaling',
    name: 'retinoic acid signaling',
    description: 'Retinoic Acid Signaling',
    tags: ['example model'],
  },
  {
    id: 'rho-gtpase-actin-cytoskeleton',
    name: 'rho gtpase actin cytoskeleton',
    description: 'Rho Gtpase Actin Cytoskeleton',
    tags: ['example model'],
  },
  {
    id: 'shp2-phosphatase-regulation',
    name: 'shp2 phosphatase regulation',
    description: 'Shp2 Phosphatase Regulation',
    tags: ['example model'],
  },
  {
    id: 'signal-amplification-cascade',
    name: 'signal amplification cascade',
    description: 'Signal Amplification Cascade',
    tags: ['example model'],
  },
  {
    id: 'simple-dimerization',
    name: 'simple dimerization',
    description: 'Simple Dimerization',
    tags: ['example model'],
  },
  {
    id: 'sir-epidemic-model',
    name: 'sir epidemic model',
    description: 'Sir Epidemic Model',
    tags: ['example model'],
  },
  {
    id: 'smad-tgf-beta-signaling',
    name: 'smad tgf beta signaling',
    description: 'Smad Tgf Beta Signaling',
    tags: ['example model'],
  },
  {
    id: 'sonic-hedgehog-gradient',
    name: 'sonic hedgehog gradient',
    description: 'Sonic Hedgehog Gradient',
    tags: ['example model'],
  },
  {
    id: 'sp_fourier_synthesizer',
    name: 'sp fourier synthesizer',
    description: 'Fourier Synthesizer',
    tags: ['example model'],
  },
  {
    id: 'sp_image_convolution',
    name: 'sp image convolution',
    description: 'Image Convolution',
    tags: ['example model'],
  },
  {
    id: 'sp_kalman_filter',
    name: 'sp kalman filter',
    description: 'Kalman Filter',
    tags: ['example model'],
  },
  {
    id: 'stat3-mediated-transcription',
    name: 'stat3 mediated transcription',
    description: 'Stat3 Mediated Transcription',
    tags: ['example model'],
  },
  {
    id: 'stress-response-adaptation',
    name: 'stress response adaptation',
    description: 'Stress Response Adaptation',
    tags: ['example model'],
  },
  {
    id: 'synaptic-plasticity-ltp',
    name: 'synaptic plasticity ltp',
    description: 'Synaptic Plasticity Ltp',
    tags: ['example model'],
  },
  {
    id: 'synbio_band_pass_filter',
    name: 'synbio band pass filter',
    description: 'Band Pass Filter',
    tags: ['example model'],
  },
  {
    id: 'synbio_counter_molecular',
    name: 'synbio counter molecular',
    description: 'Counter Molecular',
    tags: ['example model'],
  },
  {
    id: 'synbio_edge_detector',
    name: 'synbio edge detector',
    description: 'Edge Detector',
    tags: ['example model'],
  },
  {
    id: 'synbio_logic_gates_enzymatic',
    name: 'synbio logic gates enzymatic',
    description: 'Logic Gates Enzymatic',
    tags: ['example model'],
  },
  {
    id: 'synbio_oscillator_synchronization',
    name: 'synbio oscillator synchronization',
    description: 'Oscillator Synchronization',
    tags: ['example model'],
  },
  {
    id: 't-cell-activation',
    name: 't cell activation',
    description: 'T Cell Activation',
    tags: ['example model'],
  },
  {
    id: 'tlr3-dsrna-sensing',
    name: 'tlr3 dsrna sensing',
    description: 'Tlr3 Dsrna Sensing',
    tags: ['example model'],
  },
  {
    id: 'tnf-induced-apoptosis',
    name: 'tnf induced apoptosis',
    description: 'Tnf Induced Apoptosis',
    tags: ['example model'],
  },
  {
    id: 'two-component-system',
    name: 'two component system',
    description: 'Two Component System',
    tags: ['example model'],
  },
  {
    id: 'vegf-angiogenesis',
    name: 'vegf angiogenesis',
    description: 'Vegf Angiogenesis',
    tags: ['example model'],
  },
  {
    id: 'viral-sensing-innate-immunity',
    name: 'viral sensing innate immunity',
    description: 'Viral Sensing Innate Immunity',
    tags: ['example model'],
  },
  {
    id: 'wacky_alchemy_stone',
    name: 'wacky alchemy stone',
    description: 'Alchemy Stone',
    tags: ['example model'],
  },
  {
    id: 'wacky_black_hole',
    name: 'wacky black hole',
    description: 'Black Hole',
    tags: ['example model'],
  },
  {
    id: 'wacky_bouncing_ball',
    name: 'wacky bouncing ball',
    description: 'Bouncing Ball',
    tags: ['example model'],
  },
  {
    id: 'wacky_traffic_jam_asep',
    name: 'wacky traffic jam asep',
    description: 'Traffic Jam Asep',
    tags: ['example model'],
  },
  {
    id: 'wacky_zombie_infection',
    name: 'wacky zombie infection',
    description: 'Zombie Infection',
    tags: ['example model'],
  },
  {
    id: 'wnt-beta-catenin-signaling',
    name: 'wnt beta catenin signaling',
    description: 'Wnt Beta Catenin Signaling',
    tags: ['example model'],
  },
  {
    id: 'wound-healing-pdgf-signaling',
    name: 'wound healing pdgf signaling',
    description: 'Wound Healing Pdgf Signaling',
    tags: ['example model'],
  }
];

const NATIVE_TUTORIALS: Example[] = [
  {
    id: 'AB',
    name: 'AB',
    description: 'Bivalent binding',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC',
    name: 'ABC',
    description: 'Cooperative binding',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC_scan',
    name: 'ABC Scan',
    description: 'Cooperative (scan)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC_ssa',
    name: 'ABC Ssa',
    description: 'Cooperative (SSA)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LV',
    name: 'LV',
    description: 'Predator-prey',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABp',
    name: 'ABp',
    description: 'Phosphorylation logic',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABp_approx',
    name: 'ABp Approx',
    description: 'Phosphorylation (approx)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'GK',
    name: 'GK',
    description: 'Goldbeter-Koshland',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Lisman',
    name: 'Lisman',
    description: 'Lisman bistable',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Lisman_bifurcate',
    name: 'Lisman Bifurcate',
    description: 'Lisman bifurcation',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB',
    name: 'BAB',
    description: 'Trivalent binding',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB_coop',
    name: 'BAB Coop',
    description: 'Trivalent (coop)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB_scan',
    name: 'BAB Scan',
    description: 'Trivalent (scan)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'blbr',
    name: 'BLBR Tutorial',
    description: 'Bivalent ligand/receptor (tutorial)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'cBNGL_simple',
    name: 'CBNGL Simple',
    description: 'Simple compartmental',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LR',
    name: 'LR',
    description: 'Ligand-receptor',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LRR',
    name: 'LRR',
    description: 'Receptor recruitment',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LRR_comp',
    name: 'LRR Comp',
    description: 'Compartmental LRR',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LR_comp',
    name: 'LR Comp',
    description: 'Compartmental LR',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LV_comp',
    name: 'LV Comp',
    description: 'Compartmental LV',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'organelle_transport',
    name: 'Organelle Transport',
    description: 'Organelle transport',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'organelle_transport_struct',
    name: 'Organelle Transport Struct',
    description: 'Transport (struct)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Chylek_library',
    name: 'Chylek Library',
    description: 'Signaling library',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Creamer_2012',
    name: 'Creamer 2012',
    description: 'Aggregation model',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'egfr_simple',
    name: 'Egfr Simple',
    description: 'Basic EGFR model',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'FceRI_ji',
    name: 'FceRI Ji',
    description: 'FcÃŽÂµRI signaling',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Suderman_2013',
    name: 'Suderman 2013',
    description: 'Signaling model',
    tags: ['published', 'tutorial', 'native'],
  },

  {
    id: 'birth-death',
    name: 'Birth-Death',
    description: 'Stochastic process',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'CircadianOscillator',
    name: 'CircadianOscillator',
    description: 'Circadian rhythm',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ComplexDegradation',
    name: 'ComplexDegradation',
    description: 'Degradation model',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Repressilator',
    name: 'Repressilator',
    description: 'Repressilator circuit',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'toggle',
    name: 'Toggle',
    description: 'Toggle switch',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'FceRI_viz',
    name: 'FceRI Viz',
    description: 'FcÃŽÂµRI (viz)',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'visualize',
    name: 'Visualize',
    description: 'Visualization toy',
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'SIR',
    name: 'SIR',
    description: 'Epidemic model (tutorial)',
    tags: ['published', 'epidemiology'],
  },

  {
    id: 'quasi_equilibrium',
    name: 'quasi equilibrium',
    description: 'Quasi-equilibrium approximation',
    tags: ['published', 'toy models'],
  },
];



export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  models: Example[];
}

// Raw categories with all models (including incompatible ones)
export const INTERNAL_VALIDATION_MODELS: Example[] = [
  {
    id: 'CaOscillate_Func',
    name: 'CaOscillate_Func',
    description: 'Calcium oscillations (func)',
    tags: ['validation'],
  },
  {
    id: 'CaOscillate_Sat',
    name: 'CaOscillate_Sat',
    description: 'Calcium oscillations (sat)',
    tags: ['validation'],
  },
  {
    id: 'catalysis',
    name: 'catalysis',
    description: 'Catalysis in energy BNG',
    tags: ['validation'],
  },
  {
    id: 'continue',
    name: 'continue',
    description: 'Test trajectory continuation',
    tags: ['validation'],
  },
  {
    id: 'egfr_net',
    name: 'egfr_net',
    description: 'check detailed balanced',
    tags: ['validation'],
  },
  {
    id: 'egfr_net_red',
    name: 'egfr_net_red',
    description: 'Reduced state-space version of EGFR_NET.BNGL with equivalent ODE dynamics',
    tags: ['validation'],
  },
  {
    id: 'egfr_path',
    name: 'egfr_path',
    description: 'The primary focus of the model developed by Kholodenko',
    tags: ['validation'],
  },
  {
    id: 'energy_example1',
    name: 'energy_example1',
    description: 'Illustration of energy modeling approach w/ a simple protein scaffold model',
    tags: ['validation'],
  },
  {
    id: 'example1',
    name: 'example1',
    description: 'Example file for BNG2 tutorial.',
    tags: ['validation'],
  },
  {
    id: 'fceri_ji_comp',
    name: 'fceri_ji_comp',
    description: 'Ligand-receptor binding',
    tags: ['validation'],
  },
  {
    id: 'Haugh2b',
    name: 'Haugh2b',
    description: 'R(KD,Y1~U,Y2~U) 1.00',
    tags: ['validation'],
  },
  {
    id: 'heise',
    name: 'heise',
    description: 'Validate state inheritance in a symmetric context',
    tags: ['validation'],
  },
  {
    id: 'issue_198_short',
    name: 'issue_198_short',
    description: 'No description available',
    tags: ['validation'],
  },
  {
    id: 'Kiefhaber_emodel',
    name: 'Kiefhaber_emodel',
    description: 'Allow molar units to be used for bimolecular rate constants',
    tags: ['validation'],
  },
  {
    id: 'Korwek_2023',
    name: 'Korwek_2023',
    description: 'This BioNetGen file features the article:',
    tags: ['validation'],
  },
  {
    id: 'localfunc',
    name: 'localfunc',
    description: 'Test local function expansion',
    tags: ['validation'],
  },
  {
    id: 'michment',
    name: 'michment',
    description: 'Michaelis Menten',
    tags: ['validation'],
  },
  {
    id: 'michment_cont',
    name: 'michment_cont',
    description: 'Michaelis Menten Continue',
    tags: ['validation'],
  },
  {
    id: 'Motivating_example',
    name: 'Motivating_example',
    description: 'Signal Transduction with receptor internalization',
    tags: ['validation'],
  },
  {
    id: 'Motivating_example_cBNGL',
    name: 'Motivating_example_cBNGL',
    description: 'Signal transduction with receptor internalization',
    tags: ['validation'],
  },
  {
    id: 'motor',
    name: 'motor',
    description: 'Motor protein',
    tags: ['validation'],
  },
  {
    id: 'mwc',
    name: 'mwc',
    description: 'Monod-Wyman-Changeux model',
    tags: ['validation'],
  },
  {
    id: 'nfkb',
    name: 'nfkb',
    description: 'NF-kB signaling pathway',
    tags: ['validation'],
  },
  {
    id: 'nfkb_illustrating_protocols',
    name: 'nfkb_illustrating_protocols',
    description: 'NF-kB signaling pathway',
    tags: ['validation'],
  },
  {
    id: 'rec_dim',
    name: 'rec_dim',
    description: 'Ligand-receptor binding',
    tags: ['validation'],
  },
  {
    id: 'rec_dim_comp',
    name: 'rec_dim_comp',
    description: 'name dimension volume contained_by',
    tags: ['validation'],
  },
  {
    id: 'SHP2_base_model',
    name: 'SHP2_base_model',
    description: 'Base model of Shp2 regulation',
    tags: ['validation'],
  },
  {
    id: 'simple_sbml_import',
    name: 'simple_sbml_import',
    description: 'SBML import test',
    tags: ['validation'],
  },
  {
    id: 'simple_system',
    name: 'simple_system',
    description: 'Simple binding system',
    tags: ['validation'],
  },
  {
    id: 'test_ANG_synthesis_simple',
    name: 'test_ANG_synthesis_simple',
    description: 'Synthesis network test',
    tags: ['validation'],
  },
  {
    id: 'test_fixed',
    name: 'test_fixed',
    description: '# actions ##',
    tags: ['validation'],
  },
  {
    id: 'test_MM',
    name: 'test_MM',
    description: 'Kinetic constants',
    tags: ['validation'],
  },
  {
    id: 'test_mratio',
    name: 'test_mratio',
    description: 'Reaction ratio test',
    tags: ['validation'],
  },
  {
    id: 'test_network_gen',
    name: 'test_network_gen',
    description: 'fceri model with network generation',
    tags: ['validation'],
  },
  {
    id: 'test_sat',
    name: 'test_sat',
    description: 'Kinetic constants',
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_cBNGL_simple',
    name: 'test_synthesis_cBNGL_simple',
    description: 'Compartmental synthesis',
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex',
    name: 'test_synthesis_complex',
    description: 'Complex synthesis test',
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex_0_cBNGL',
    name: 'test_synthesis_complex_0_cBNGL',
    description: 'volume-surface',
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex_source_cBNGL',
    name: 'test_synthesis_complex_source_cBNGL',
    description: 'volume-surface',
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_simple',
    name: 'test_synthesis_simple',
    description: 'Simple synthesis test',
    tags: ['validation'],
  },
  {
    id: 'tlmr',
    name: 'tlmr',
    description: 'Trivalent ligand monovalent receptor',
    tags: ['validation'],
  },
  {
    id: 'toy-jim',
    name: 'toy-jim',
    description: 'The model consists of a monovalent extracellular ligand,',
    tags: ['validation'],
  },
  {
    id: 'univ_synth',
    name: 'univ_synth',
    description: 'example of universal synthesis',
    tags: ['validation'],
  },
];

const CANCER_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["egfr-signaling-pathway", "glioblastoma-egfrviii-signaling", "hif1a-degradation-loop", "hypoxia-response-signaling", "vegf-angiogenesis", "dna-damage-repair", "checkpoint-kinase-signaling", "ras-gef-gap-cycle", "p38-mapk-signaling", "mapk-signaling-cascade"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["Barua_2007", "Barua_2009", "Nag_2009", "Nosbisch_2022", "Kozer_2013", "Kozer_2014", "mapk-dimers", "mapk-monomers"].includes(m.id)),
  ...GROWTH_FACTOR_SIGNALING.filter(m => ["Blinov_egfr", "egfr_ode", "Ligon_2014", "Mertins_2023"].includes(m.id)),
  ...INTERNAL_VALIDATION_MODELS.filter(m => ["egfr_net", "egfr_path"].includes(m.id)),
];

const IMMUNOLOGY_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["bcr-signaling", "cd40-signaling", "complement-activation-cascade", "immune-synapse-formation", "inflammasome-activation", "interferon-signaling", "jak-stat-cytokine-signaling", "t-cell-activation", "tlr3-dsrna-sensing", "viral-sensing-innate-immunity", "platelet-activation", "blood-coagulation-thrombin"].includes(m.id)),
  ...IMMUNE_SIGNALING.filter(m => ["An_2009", "BaruaBCR_2012", "BaruaFceRI_2012", "ChylekTCR_2014", "Lin_TCR_2019", "Cheemalavagu_JAK_STAT", "Model_ZAP", "degranulation_model", "Dushek_2011", "Dushek_2014", "Faeder_2003", "Mukhopadhyay_2013", "fceri_fyn", "tlbr"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["McMillan_2021"].includes(m.id)),
  ...INTERNAL_VALIDATION_MODELS.filter(m => ["fceri_ji_comp"].includes(m.id)),
];

const NEUROSCIENCE_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["ampk-signaling", "calcineurin-nfat-pathway", "calcium-spike-signaling", "inositol-phosphate-metabolism", "l-type-calcium-channel-dynamics", "mtor-signaling", "neurotransmitter-release", "synaptic-plasticity-ltp", "beta-adrenergic-response"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["Chattaraj_2021", "Lin_Prion_2019", "Jung_2017"].includes(m.id)),
  ...NATIVE_TUTORIALS.filter(m => ["Lisman", "Lisman_bifurcate"].includes(m.id)),
  ...ORDYAN_2020,
  ...INTERNAL_VALIDATION_MODELS.filter(m => ["motor", "mwc"].includes(m.id)),
];

const CELL_CYCLE_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["apoptosis-cascade", "caspase-activation-loop", "cell-cycle-checkpoint", "dr5-apoptosis-signaling", "e2f-rb-cell-cycle-switch", "tnf-induced-apoptosis", "parp1-mediated-dna-repair", "p53-mdm2-oscillator", "clock-bmal1-gene-circuit"].includes(m.id)),
  ...CELL_REGULATION.filter(m => ["Hat_2016", "vilar_2002", "vilar_2002b", "Blinov_ran"].includes(m.id)),
  ...GROWTH_FACTOR_SIGNALING.filter(m => ["Lang_2024"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["Blinov_2006", "Kesseler_2013"].includes(m.id)),
  ...NATIVE_TUTORIALS.filter(m => ["Repressilator", "CircadianOscillator"].includes(m.id)),
  ...INTERNAL_VALIDATION_MODELS.filter(m => ["Kiefhaber_emodel"].includes(m.id)),
];

const METABOLISM_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["allosteric-activation", "auto-activation-loop", "autophagy-regulation", "glycolysis-branch-point", "insulin-glucose-homeostasis", "lac-operon-regulation", "no-cgmp-signaling", "michaelis-menten-kinetics", "competitive-enzyme-inhibition"].includes(m.id)),
  ...INTERNAL_VALIDATION_MODELS.filter(m => ["toy-jim", "michment", "michment_cont", "Haugh2b", "CaOscillate_Func", "CaOscillate_Sat", "heise", "SHP2_base_model", "catalysis"].includes(m.id)),
  ...NATIVE_TUTORIALS.filter(m => ["ABC", "ABp", "GK"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["Erdem_2021"].includes(m.id)),
  ...GROWTH_FACTOR_SIGNALING.filter(m => ["Dolan_2015"].includes(m.id)),
];

const DEVELOPMENTAL_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => ["hedgehog-signaling-pathway", "myogenic-differentiation", "notch-delta-lateral-inhibition", "rankl-rank-signaling", "sonic-hedgehog-gradient", "wnt-beta-catenin-signaling", "fgf-signaling-pathway", "smad-tgf-beta-signaling", "retinoic-acid-signaling", "bmp-signaling"].includes(m.id)),
  ...COMPLEX_MODELS.filter(m => ["Zhang_2021", "Zhang_2023", "Massole_2023"].includes(m.id)),
  ...IMMUNE_SIGNALING.filter(m => ["Lin_ERK_2019"].includes(m.id)),
];

const ECOLOGY_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => [
    "eco_coevolution_host_parasite", "eco_food_web_chaos_3sp", "eco_lotka_volterra_grid",
    "eco_mutualism_obligate", "eco_rock_paper_scissors_spatial", "wacky_zombie_infection",
    "sir-epidemic-model"
  ].includes(m.id)),
];

const PHYSICS_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => [
    "ph_lorenz_attractor", "ph_nbody_gravity", "ph_schrodinger", "ph_wave_equation",
    "wacky_bouncing_ball", "wacky_traffic_jam_asep", "brusselator-oscillator"
  ].includes(m.id)),
];

const COMPUTER_SCIENCE_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => [
    "cs_diffie_hellman", "cs_hash_function", "cs_huffman", "cs_monte_carlo_pi",
    "cs_pagerank", "cs_pid_controller", "cs_regex_nfa", "mt_arithmetic_compiler",
    "mt_bngl_interpreter", "mt_music_sequencer", "mt_pascal_triangle", "mt_quine"
  ].includes(m.id)),
];

const ML_SIGNAL_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => [
    "ml_gradient_descent", "ml_hopfield", "ml_kmeans", "ml_q_learning", "ml_svm",
    "nn_xor", "sp_fourier_synthesizer", "sp_image_convolution", "sp_kalman_filter"
  ].includes(m.id)),
];

const SYNBIO_MODELS: Example[] = [
  ...TEST_MODELS.filter(m => [
    "synbio_band_pass_filter", "synbio_counter_molecular", "synbio_edge_detector",
    "synbio_logic_gates_enzymatic", "synbio_oscillator_synchronization", "wacky_alchemy_stone"
  ].includes(m.id)),
  ...NATIVE_TUTORIALS.filter(m => ["Repressilator", "toggle"].includes(m.id)),
];

const RAW_MODEL_CATEGORIES: ModelCategory[] = [
  {
    id: 'cancer',
    name: 'Cancer Biology',
    description: 'Models related to oncogenic signaling and tumor suppression',
    models: CANCER_MODELS,
  },
  {
    id: 'immunology',
    name: 'Immunology',
    description: 'Specialized models of immune response and cytokine signaling',
    models: IMMUNOLOGY_MODELS,
  },
  {
    id: 'neuroscience',
    name: 'Neuroscience',
    description: 'Models of synaptic plasticity, ion channels, and neuronal signaling',
    models: NEUROSCIENCE_MODELS,
  },
  {
    id: 'cell-cycle',
    name: 'Cell Cycle & Death',
    description: 'Models of mitosis, apoptosis, and cell cycle checkpoints',
    models: CELL_CYCLE_MODELS,
  },
  {
    id: 'metabolism',
    name: 'Metabolism',
    description: 'Models of metabolic pathways and homeostasis',
    models: METABOLISM_MODELS,
  },
  {
    id: 'developmental',
    name: 'Developmental Biology',
    description: 'Models of morphogens, differentiation, and tissue patterning',
    models: DEVELOPMENTAL_MODELS,
  },
  {
    id: 'ecology',
    name: 'Ecology & Evolution',
    description: 'Predator-prey dynamics, food webs, and spatial niche models',
    models: ECOLOGY_MODELS,
  },
  {
    id: 'physics',
    name: 'Mathematics & Physics',
    description: 'Strange attractors, N-body gravity, wave equations, and quantum circuits',
    models: PHYSICS_MODELS,
  },
  {
    id: 'cs',
    name: 'Computer Science & Algorithms',
    description: 'Encryption, compression, logic engines, and interpreters',
    models: COMPUTER_SCIENCE_MODELS,
  },
  {
    id: 'ml-signal',
    name: 'Machine Learning & Signal Processing',
    description: 'Bio-inspired ML algorithms and digital signal filters',
    models: ML_SIGNAL_MODELS,
  },
  {
    id: 'synbio',
    name: 'Synthetic Biology',
    description: 'Pulse generators, molecular counters, and logic gates',
    models: SYNBIO_MODELS,
  },

  {
    id: 'multistage',
    name: 'Multistage',
    description: 'Models with distinct simulation phases or protocol shifts',
    models: [
      ...CELL_REGULATION.filter(m => ["Hat_2016"].includes(m.id)),
      ...GROWTH_FACTOR_SIGNALING.filter(m => ["Lang_2024"].includes(m.id)),
      ...TEST_MODELS.filter(m => [
        "auto-activation-loop", "autophagy-regulation", "beta-adrenergic-response", "bistable-toggle-switch",
        "brusselator-oscillator", "calcineurin-nfat-pathway", "calcium-spike-signaling", "contact-inhibition-hippo-yap",
        "e2f-rb-cell-cycle-switch", "eif2a-stress-response", "hematopoietic-growth-factor", "hif1a_degradation_loop",
        "inositol-phosphate-metabolism", "interferon-signaling", "l-type-calcium-channel-dynamics", "lac-operon-regulation",
        "mapk-signaling-cascade", "nfkb-feedback", "sonic-hedgehog-gradient", "synaptic-plasticity-ltp"
      ].includes(m.id)),
    ],
  },

  {
    id: 'tutorials',
    name: 'Tutorials & Simple Examples',
    description: 'Educational models and basic BNGL syntax examples',
    models: TUTORIALS,
  },
  {
    id: 'native-tutorials',
    name: 'RuleWorld Tutorials',
    description: 'Models from the official BioNetGen tutorial',
    models: NATIVE_TUTORIALS,
  },
  {
    id: 'test-models',
    name: 'Example Models',
    description: 'Complete list of example models generated for demonstration',
    models: TEST_MODELS,
  },
];

// Filtered categories with only BNG2.pl compatible models (ODE/SSA)
// Categories with no compatible models are excluded
export const MODEL_CATEGORIES: ModelCategory[] = RAW_MODEL_CATEGORIES
  .map(cat => ({
    ...cat,
    models: filterCompatibleModels(cat.models),
  }))
  .filter(cat => cat.models.length > 0);

// Tiny DEV-only debug print to verify filtering behavior in the browser console.
// (Avoids impacting production builds.)
if ((import.meta as any)?.env?.DEV) {
  const rawTotal = RAW_MODEL_CATEGORIES.reduce((sum, cat) => sum + cat.models.length, 0);
  const filteredTotal = MODEL_CATEGORIES.reduce((sum, cat) => sum + cat.models.length, 0);
  const breakdown = MODEL_CATEGORIES.map((c) => ({ id: c.id, count: c.models.length }));

  const excludedExamples: string[] = [];
  for (const cat of RAW_MODEL_CATEGORIES) {
    const kept = new Set(filterCompatibleModels(cat.models).map((m) => m.id));
    for (const m of cat.models) {
      if (!kept.has(m.id)) excludedExamples.push(m.id);
    }
  }


  console.log('[BNGL gallery] raw examples:', rawTotal, 'filtered:', filteredTotal, 'categories:', breakdown);

  console.log('[BNGL gallery] excluded example ids (first 50):', excludedExamples.slice(0, 50));
}

// Flat list of all compatible models (deduplicated by ID)
export const EXAMPLES: Example[] = Array.from(
  new Map(
    MODEL_CATEGORIES.flatMap(cat => cat.models).map(model => [model.id, model])
  ).values()
);

// Debug: Log EXAMPLES count in dev mode
if ((import.meta as any)?.env?.DEV) {
  console.log('[BNGL gallery] EXAMPLES count after deduplication:', EXAMPLES.length);
  const blbrEntries = EXAMPLES.filter(m => m.id === 'BLBR' || m.id === 'blbr');
  console.log('[BNGL gallery] BLBR entries:', blbrEntries.length, blbrEntries.map(m => ({ id: m.id, name: m.name })));

  // Log NFsim models specifically
  const nfsimInExamples = EXAMPLES.filter(m => NFSIM_MODELS.has(m.id));
  console.log('[BNGL gallery] NFsim models in EXAMPLES:', nfsimInExamples.length, nfsimInExamples.map(m => m.id));

  // Log Model_ZAP specifically
  const modelZapEntries = EXAMPLES.filter(m => m.id === 'Model_ZAP');
  console.log('[BNGL gallery] Model_ZAP entries:', modelZapEntries.length, modelZapEntries.map(m => ({ id: m.id, name: m.name })));
}
