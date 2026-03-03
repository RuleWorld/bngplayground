/**
 * Validation Model Names
 * 
 * These models are loaded from public/models/{name}.bngl files.
 * The inline code has been extracted to separate files.
 * 
 * To load a model's code, use: `fetch('/models/{name}.bngl')`
 * or `fs.readFileSync('public/models/{name}.bngl')` in Node.js scripts.
 */

// All validation models available in public/models/
export const VALIDATION_MODEL_NAMES: string[] = [
  'AB',
  'ABC',
  'ABp',
  'ABp_approx',
  'akt-signaling',
  'allosteric-activation',
  'An_2009',
  'apoptosis-cascade',
  'auto-activation-loop',
  'BAB',
  'BAB_coop',
  'Barua_2007',
  'Barua_2009',
  'BaruaFceRI_2012',
  'Barua_2013',
  'beta-adrenergic-response',
  'birth-death',
  'bistable-toggle-switch',
  'Blinov_2006',
  'blood-coagulation-thrombin',
  'brusselator-oscillator',
  'calcium-spike-signaling',
  'CaOscillate_Func',
  'CaOscillate_Sat',
  'catalysis',
  'cBNGL_simple',
  'cell-cycle-checkpoint',
  'Cheemalavagu_JAK_STAT',
  'chemotaxis-signal-transduction',
  'circadian-oscillator',
  'competitive-enzyme-inhibition',
  'complement-activation-cascade',
  'continue',
  'cooperative-binding',
  'dna-damage-repair',
  'dual-site-phosphorylation',
  'Dushek_2011',
  'egfr_net',
  'egfr_net_red',
  'egfr_path',
  'egfr_simple',
  'egfr-signaling-pathway',
  'energy_example1',
  'er-stress-response',
  'example1',
  'FceRI_ji',
  'fceri_ji_comp',
  'FceRI_viz',
  'gene-expression-toggle',
  'GK',
  'glycolysis-branch-point',
  'Hat_2016',
  'Haugh2b',
  'heise',
  'hematopoietic-growth-factor',
  'hypoxia-response-signaling',
  'immune-synapse-formation',
  'inflammasome-activation',
  'innate_immunity',
  'insulin-glucose-homeostasis',
  'interferon-signaling',
  'issue_198_short',
  'jak-stat-cytokine-signaling',
  'Jaruszewicz-Blonska_2023',
  'Kesseler_2013',
  'Kozer_2013',
  'Kozer_2014',
  'Kiefhaber_emodel',
  'Korwek_2023',
  'lac-operon-regulation',
  'Lang_2024',
  'Lin_ERK_2019',
  'Lin_Prion_2019',
  'Lin_TCR_2019',
  'lipid-mediated-pip3-signaling',
  'Lisman',
  'localfunc',
  'LR',
  'LR_comp',
  'LRR_comp',
  'LV',
  'mapk-dimers',
  'mapk-monomers',
  'mapk-signaling-cascade',
  'McMillan_2021',
  'michaelis-menten-kinetics',
  'michment',
  'michment_cont',
  'Motivating_example',
  'Motivating_example_cBNGL',
  'motor',
  'mtor-signaling',
  'mwc',
  'myogenic-differentiation',
  'negative-feedback-loop',
  'neurotransmitter-release',
  'nfkb',
  'nfkb_illustrating_protocols',
  'nfkb-feedback',
  'notch-delta-lateral-inhibition',
  'organelle_transport',
  'organelle_transport_struct',
  'oxidative-stress-response',
  'p53-mdm2-oscillator',
  'Pekalski_2013',
  'phosphorelay-chain',
  'platelet-activation',
  'predator-prey-dynamics',
  'quorum-sensing-circuit',
  'rab-gtpase-cycle',
  'rec_dim',
  'rec_dim_comp',
  'Repressilator',
  'repressilator-oscillator',
  'retinoic-acid-signaling',
  'SHP2_base_model',
  'signal-amplification-cascade',
  'simple',
  'simple_sbml_import',
  'simple_system',
  'simple-dimerization',
  'SIR',
  'sir-epidemic-model',
  'smad-tgf-beta-signaling',
  'stress-response-adaptation',
  'synaptic-plasticity-ltp',
  't-cell-activation',
  'test_ANG_synthesis_simple',
  'test_fixed',
  'test_MM',
  'test_mratio',
  'test_network_gen',
  'test_sat',
  'test_synthesis_cBNGL_simple',
  'test_synthesis_complex',
  'test_synthesis_complex_0_cBNGL',
  'test_synthesis_complex_source_cBNGL',
  'test_synthesis_simple',
  'tlmr',
  'tnf-induced-apoptosis',
  'toy-jim',
  'toy1',
  'toy2',
  'two-component-system',
  'univ_synth',
  'vegf-angiogenesis',
  'vilar_2002',
  'vilar_2002b',
  'vilar_2002c',
  'viral-sensing-innate-immunity',
  'wnt',
  'wnt-beta-catenin-signaling',
  'wound-healing-pdgf-signaling',
];

// Helper function to get model file path (for browser)
export const getModelPath = (modelName: string): string => 
  `/models/${modelName}.bngl`;

// Helper function to load model code (for use in browser)
export const loadModelCode = async (modelName: string): Promise<string> => {
  const response = await fetch(getModelPath(modelName));
  if (!response.ok) {
    throw new Error(`Failed to load model ${modelName}: ${response.statusText}`);
  }
  return await response.text();
};

export const VALIDATION_MODELS: Array<{name: string; code: string}> = []; // Browser-safe export

// Helper to load models in Node.js environment
export const loadModelsFromFiles = async (): Promise<Array<{name: string; code: string}>> => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    return VALIDATION_MODEL_NAMES.map(name => {
      const filePath = path.join(process.cwd(), 'public', 'models', `${name}.bngl`);
      const code = fs.readFileSync(filePath, 'utf-8');
      return { name, code };
    });
  } catch (error) {
    console.warn('loadModelsFromFiles is only supported in Node.js environment');
    return [];
  }
};
