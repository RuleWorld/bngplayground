import { Example } from './types';

// Published BNGL models from RulesRailRoad repository
// Source: https://github.com/RulesRailRoad/RulesRailRoad.github.io/tree/gh-pages/models

// Cell Regulation & Transport
import barua2013 from './published-models/cell-regulation/Barua_2013.bngl?raw';
import blinovRan from './published-models/cell-regulation/Blinov_ran.bngl?raw';
import hat2016 from './published-models/cell-regulation/Hat_2016.bngl?raw';
import kocieniewski2012 from './published-models/cell-regulation/Kocieniewski_2012.bngl?raw';
import notch from './published-models/cell-regulation/notch.bngl?raw';
import pekalski2013 from './published-models/cell-regulation/Pekalski_2013.bngl?raw';
import ruleBasedRanTransport from './published-models/cell-regulation/Rule_based_Ran_transport.bngl?raw';
import ruleBasedRanTransportDraft from './published-models/cell-regulation/Rule_based_Ran_transport_draft.bngl?raw';
import vilar2002 from './published-models/cell-regulation/vilar_2002.bngl?raw';
import vilar2002b from './published-models/cell-regulation/vilar_2002b.bngl?raw';
import vilar2002c from './published-models/cell-regulation/vilar_2002c.bngl?raw';
import wnt from './published-models/cell-regulation/wnt.bngl?raw';

// Complex Published Models
import barua2007 from './published-models/complex-models/Barua_2007.bngl?raw';
import barua2009 from './published-models/complex-models/Barua_2009.bngl?raw';
import blinov2006 from './published-models/complex-models/Blinov_2006.bngl?raw';
import chattaraj2021 from './published-models/complex-models/Chattaraj_2021.bngl?raw';
import dushek2011 from './published-models/complex-models/Dushek_2011.bngl?raw';
import dushek2014 from './published-models/complex-models/Dushek_2014.bngl?raw';
import erdem2021 from './published-models/complex-models/Erdem_2021.bngl?raw';
import jung2017 from './published-models/complex-models/Jung_2017.bngl?raw';
import kesseler2013 from './published-models/complex-models/Kesseler_2013.bngl?raw';
import kozer2013 from './published-models/complex-models/Kozer_2013.bngl?raw';
import kozer2014 from './published-models/complex-models/Kozer_2014.bngl?raw';
import mapkDimers from './published-models/complex-models/mapk-dimers.bngl?raw';
import mapkMonomers from './published-models/complex-models/mapk-monomers.bngl?raw';
import massole2023 from './published-models/complex-models/Massole_2023.bngl?raw';
import mcmillan2021 from './published-models/complex-models/McMillan_2021.bngl?raw';
import nag2009 from './published-models/complex-models/Nag_2009.bngl?raw';
import nosbisch2022 from './published-models/complex-models/Nosbisch_2022.bngl?raw';
import zhang2021 from './published-models/complex-models/Zhang_2021.bngl?raw';
import zhang2023 from './published-models/complex-models/Zhang_2023.bngl?raw';

// Growth Factor Signaling
import blinovEgfr from './published-models/growth-factor-signaling/Blinov_egfr.bngl?raw';
import lang2024 from './published-models/growth-factor-signaling/Lang_2024.bngl?raw';
import ligon2014 from './published-models/growth-factor-signaling/Ligon_2014.bngl?raw';
import mertins2023 from './published-models/growth-factor-signaling/Mertins_2023.bngl?raw';
import ruleBasedEgfrCompart from './published-models/growth-factor-signaling/Rule_based_egfr_compart.bngl?raw';
import ruleBasedEgfrTutorial from './published-models/growth-factor-signaling/Rule_based_egfr_tutorial.bngl?raw';

// Immune Signaling
import an2009 from './published-models/immune-signaling/An_2009.bngl?raw';
import baruabcr2012 from './published-models/immune-signaling/BaruaBCR_2012.bngl?raw';
import baruafceri2012 from './published-models/immune-signaling/BaruaFceRI_2012.bngl?raw';
import blbr from './published-models/immune-signaling/blbr.bngl?raw';
import chylekfceri2014 from './published-models/immune-signaling/ChylekFceRI_2014.bngl?raw';
import chylektcr2014 from './published-models/immune-signaling/ChylekTCR_2014.bngl?raw';
import faeder2003 from './published-models/immune-signaling/Faeder_2003.bngl?raw';
import fceri2003 from './published-models/immune-signaling/fceri_2003.bngl?raw';
import innateImmunity from './published-models/immune-signaling/innate_immunity.bngl?raw';
import jaruszewiczBlonska2023 from './published-models/immune-signaling/Jaruszewicz-Blonska_2023.bngl?raw';
import korwek2023 from './published-models/immune-signaling/Korwek_2023.bngl?raw';
import modelZap from './published-models/immune-signaling/Model_ZAP.bngl?raw';
import mukhopadhyay2013 from './published-models/immune-signaling/Mukhopadhyay_2013.bngl?raw';
import tlbr from './published-models/immune-signaling/tlbr.bngl?raw';

// Tutorials & Simple Examples
import chemistry from './published-models/tutorials/chemistry.bngl?raw';
import polymer from './published-models/tutorials/polymer.bngl?raw';
import polymerDraft from './published-models/tutorials/polymer_draft.bngl?raw';
import simple from './published-models/tutorials/simple.bngl?raw';
import toy1 from './published-models/tutorials/toy1.bngl?raw';
import toy2 from './published-models/tutorials/toy2.bngl?raw';

// Test Models
import aktSignaling from './example-models/akt-signaling.bngl?raw';
import allostericActivation from './example-models/allosteric-activation.bngl?raw';
import apoptosisCascade from './example-models/apoptosis-cascade.bngl?raw';
import autoActivationLoop from './example-models/auto-activation-loop.bngl?raw';
import betaAdrenergicResponse from './example-models/beta-adrenergic-response.bngl?raw';
import bistableToggleSwitch from './example-models/bistable-toggle-switch.bngl?raw';
import bloodCoagulationThrombin from './example-models/blood-coagulation-thrombin.bngl?raw';
import brusselatorOscillator from './example-models/brusselator-oscillator.bngl?raw';
import calciumSpikeSignaling from './example-models/calcium-spike-signaling.bngl?raw';
import cellCycleCheckpoint from './example-models/cell-cycle-checkpoint.bngl?raw';
import chemotaxisSignalTransduction from './example-models/chemotaxis-signal-transduction.bngl?raw';
import circadianOscillator from './example-models/circadian-oscillator.bngl?raw';
import competitiveEnzymeInhibition from './example-models/competitive-enzyme-inhibition.bngl?raw';
import complementActivationCascade from './example-models/complement-activation-cascade.bngl?raw';
import cooperativeBinding from './example-models/cooperative-binding.bngl?raw';
import dnaDamageRepair from './example-models/dna-damage-repair.bngl?raw';
import dualSitePhosphorylation from './example-models/dual-site-phosphorylation.bngl?raw';
import egfrSignalingPathway from './example-models/egfr-signaling-pathway.bngl?raw';
import erStressResponse from './example-models/er-stress-response.bngl?raw';
import geneExpressionToggle from './example-models/gene-expression-toggle.bngl?raw';
import glycolysisBranchPoint from './example-models/glycolysis-branch-point.bngl?raw';
import hematopoieticGrowthFactor from './example-models/hematopoietic-growth-factor.bngl?raw';
import hypoxiaResponseSignaling from './example-models/hypoxia-response-signaling.bngl?raw';
import immuneSynapseFormation from './example-models/immune-synapse-formation.bngl?raw';
import inflammasomeActivation from './example-models/inflammasome-activation.bngl?raw';
import insulinGlucoseHomeostasis from './example-models/insulin-glucose-homeostasis.bngl?raw';
import interferonSignaling from './example-models/interferon-signaling.bngl?raw';
import jakStatCytokineSignaling from './example-models/jak-stat-cytokine-signaling.bngl?raw';
import lacOperonRegulation from './example-models/lac-operon-regulation.bngl?raw';
import lipidMediatedPip3Signaling from './example-models/lipid-mediated-pip3-signaling.bngl?raw';
import mapkSignalingCascade from './example-models/mapk-signaling-cascade.bngl?raw';
import michaelisMentenKinetics from './example-models/michaelis-menten-kinetics.bngl?raw';
import mtorSignaling from './example-models/mtor-signaling.bngl?raw';
import myogenicDifferentiation from './example-models/myogenic-differentiation.bngl?raw';
import negativeFeedbackLoop from './example-models/negative-feedback-loop.bngl?raw';
import neurotransmitterRelease from './example-models/neurotransmitter-release.bngl?raw';
import nfkbFeedback from './example-models/nfkb-feedback.bngl?raw';
import notchDeltaLateralInhibition from './example-models/notch-delta-lateral-inhibition.bngl?raw';
import oxidativeStressResponse from './example-models/oxidative-stress-response.bngl?raw';
import p53Mdm2Oscillator from './example-models/p53-mdm2-oscillator.bngl?raw';
import phosphorelayChain from './example-models/phosphorelay-chain.bngl?raw';
import plateletActivation from './example-models/platelet-activation.bngl?raw';
import predatorPreyDynamics from './example-models/predator-prey-dynamics.bngl?raw';
import quorumSensingCircuit from './example-models/quorum-sensing-circuit.bngl?raw';
import rabGtpaseCycle from './example-models/rab-gtpase-cycle.bngl?raw';
import repressilatorOscillator from './example-models/repressilator-oscillator.bngl?raw';
import retinoicAcidSignaling from './example-models/retinoic-acid-signaling.bngl?raw';
import signalAmplificationCascade from './example-models/signal-amplification-cascade.bngl?raw';
import simpleDimerization from './example-models/simple-dimerization.bngl?raw';
import sirEpidemicModel from './example-models/sir-epidemic-model.bngl?raw';
import smadTgfBetaSignaling from './example-models/smad-tgf-beta-signaling.bngl?raw';
import stressResponseAdaptation from './example-models/stress-response-adaptation.bngl?raw';
import synapticPlasticityLtp from './example-models/synaptic-plasticity-ltp.bngl?raw';
import tCellActivation from './example-models/t-cell-activation.bngl?raw';
import tnfInducedApoptosis from './example-models/tnf-induced-apoptosis.bngl?raw';
import twoComponentSystem from './example-models/two-component-system.bngl?raw';
import vegfAngiogenesis from './example-models/vegf-angiogenesis.bngl?raw';
import viralSensingInnateImmunity from './example-models/viral-sensing-innate-immunity.bngl?raw';
import wntBetaCateninSignaling from './example-models/wnt-beta-catenin-signaling.bngl?raw';
import woundHealingPdgfSignaling from './example-models/wound-healing-pdgf-signaling.bngl?raw';

export const CHART_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

export const INITIAL_BNGL_CODE = simple;

// Models that successfully parse and simulate with BNG2.pl (ODE/SSA compatible)
// Models not in this list either:
// 1. Use NFsim (network-free simulation) - not supported in browser
// 2. Use deprecated/non-standard syntax
// 3. Have missing dependencies or other BNG2.pl errors
const BNG2_COMPATIBLE_MODELS = new Set([
  // Published models that work with BNG2.pl and have simulation capability
  'Barua_2013',
  'Blinov_2006',
  'Lang_2024',
  'An_2009',
  'innate_immunity',
  // All test/example models (generated to be BNG2.pl compatible)
  'akt-signaling',
  'allosteric-activation',
  'apoptosis-cascade',
  'auto-activation-loop',
  'beta-adrenergic-response',
  'bistable-toggle-switch',
  'blood-coagulation-thrombin',
  'brusselator-oscillator',
  'calcium-spike-signaling',
  'cell-cycle-checkpoint',
  'chemotaxis-signal-transduction',
  'circadian-oscillator',
  'competitive-enzyme-inhibition',
  'complement-activation-cascade',
  'cooperative-binding',
  'dna-damage-repair',
  'dual-site-phosphorylation',
  'egfr-signaling-pathway',
  'er-stress-response',
  'gene-expression-toggle',
  'glycolysis-branch-point',
  'hematopoietic-growth-factor',
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
]);

// Models that require NFsim (network-free simulation) - kept for reference but not displayed
const NFSIM_MODELS = new Set([
  'Blinov_ran',
  'McMillan_2021',
  'Blinov_egfr',
  'Ligon_2014',
  'Model_ZAP', // Also has generate_network, so it's in compatible list
  'polymer',
  'polymer_draft',
]);

// Helper to filter models to only BNG2.pl compatible ones
// Excludes models using simulate_nf (network-free simulation) which is not supported
const filterCompatibleModels = (models: Example[]): Example[] => 
  models.filter(m => BNG2_COMPATIBLE_MODELS.has(m.id) && !m.code.includes('simulate_nf'));

const CELL_REGULATION: Example[] = [
  {
    id: 'Barua_2013',
    name: 'Barua 2013',
    description: 'BNGL model: Barua 2013',
    code: barua2013,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Blinov_ran',
    name: 'Blinov ran',
    description: 'BNGL model: Blinov ran',
    code: blinovRan,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Hat_2016',
    name: 'Hat 2016',
    description: 'BNGL model: Hat 2016',
    code: hat2016,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Kocieniewski_2012',
    name: 'Kocieniewski 2012',
    description: 'BNGL model: Kocieniewski 2012',
    code: kocieniewski2012,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'notch',
    name: 'Notch',
    description: 'BNGL model: Notch',
    code: notch,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Pekalski_2013',
    name: 'Pekalski 2013',
    description: 'BNGL model: Pekalski 2013',
    code: pekalski2013,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Rule_based_Ran_transport',
    name: 'Rule based Ran transport',
    description: 'BNGL model: Rule based Ran transport',
    code: ruleBasedRanTransport,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'Rule_based_Ran_transport_draft',
    name: 'Rule based Ran transport draft',
    description: 'BNGL model: Rule based Ran transport draft',
    code: ruleBasedRanTransportDraft,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'vilar_2002',
    name: 'Vilar 2002',
    description: 'BNGL model: Vilar 2002',
    code: vilar2002,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'vilar_2002b',
    name: 'Vilar 2002b',
    description: 'BNGL model: Vilar 2002b',
    code: vilar2002b,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'vilar_2002c',
    name: 'Vilar 2002c',
    description: 'BNGL model: Vilar 2002c',
    code: vilar2002c,
    tags: ['published', 'cell regulation'],
  },
  {
    id: 'wnt',
    name: 'Wnt',
    description: 'BNGL model: Wnt',
    code: wnt,
    tags: ['published', 'cell regulation'],
  },
];

const COMPLEX_MODELS: Example[] = [
  {
    id: 'Barua_2007',
    name: 'Barua 2007',
    description: 'Model from Haugh (2006)',
    code: barua2007,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Barua_2009',
    name: 'Barua 2009',
    description: 'BNGL model: Barua 2009',
    code: barua2009,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Blinov_2006',
    name: 'Blinov 2006',
    description: 'BNGL model: Blinov 2006',
    code: blinov2006,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Chattaraj_2021',
    name: 'Chattaraj 2021',
    description: 'BNGL model: Chattaraj 2021',
    code: chattaraj2021,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Dushek_2011',
    name: 'Dushek 2011',
    description: 'BNGL model: Dushek 2011',
    code: dushek2011,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Dushek_2014',
    name: 'Dushek 2014',
    description: 'BNGL model: Dushek 2014',
    code: dushek2014,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Erdem_2021',
    name: 'Erdem 2021',
    description: 'BNGL model: Erdem 2021',
    code: erdem2021,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Jung_2017',
    name: 'Jung 2017',
    description: 'BNGL model: Jung 2017',
    code: jung2017,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Kesseler_2013',
    name: 'Kesseler 2013',
    description: 'BNGL model: Kesseler 2013',
    code: kesseler2013,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Kozer_2013',
    name: 'Kozer 2013',
    description: 'Model from Faeder et al. (2009)',
    code: kozer2013,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Kozer_2014',
    name: 'Kozer 2014',
    description: 'Model from Kozer et al. (2013)',
    code: kozer2014,
    tags: ['published', 'complex models'],
  },
  {
    id: 'mapk-dimers',
    name: 'MAPK Dimers',
    description: 'BNGL model: MAPK Dimers',
    code: mapkDimers,
    tags: ['published', 'complex models'],
  },
  {
    id: 'mapk-monomers',
    name: 'MAPK Monomers',
    description: 'BNGL model: MAPK Monomers',
    code: mapkMonomers,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Massole_2023',
    name: 'Massole 2023',
    description: 'BNGL model: Massole 2023',
    code: massole2023,
    tags: ['published', 'complex models'],
  },
  {
    id: 'McMillan_2021',
    name: 'McMillan 2021',
    description: 'BNGL model: McMillan 2021',
    code: mcmillan2021,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Nag_2009',
    name: 'Nag 2009',
    description: 'BNGL model: Nag 2009',
    code: nag2009,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Nosbisch_2022',
    name: 'Nosbisch 2022',
    description: 'BNGL model: Nosbisch 2022',
    code: nosbisch2022,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Zhang_2021',
    name: 'Zhang 2021',
    description: 'BNGL model: Zhang 2021',
    code: zhang2021,
    tags: ['published', 'complex models'],
  },
  {
    id: 'Zhang_2023',
    name: 'Zhang 2023',
    description: 'BNGL model: Zhang 2023',
    code: zhang2023,
    tags: ['published', 'complex models'],
  },
];

const GROWTH_FACTOR_SIGNALING: Example[] = [
  {
    id: 'Blinov_egfr',
    name: 'Blinov egfr',
    description: 'BNGL model: Blinov egfr',
    code: blinovEgfr,
    tags: ['published', 'growth factor signaling'],
  },
  {
    id: 'Lang_2024',
    name: 'Lang 2024',
    description: 'BNGL model: Lang 2024',
    code: lang2024,
    tags: ['published', 'growth factor signaling'],
  },
  {
    id: 'Ligon_2014',
    name: 'Ligon 2014',
    description: 'BNGL model: Ligon 2014',
    code: ligon2014,
    tags: ['published', 'growth factor signaling'],
  },
  {
    id: 'Mertins_2023',
    name: 'Mertins 2023',
    description: 'BNGL model: Mertins 2023',
    code: mertins2023,
    tags: ['published', 'growth factor signaling'],
  },
  {
    id: 'Rule_based_egfr_compart',
    name: 'Rule based egfr compart',
    description: 'BNGL model: Rule based egfr compart',
    code: ruleBasedEgfrCompart,
    tags: ['published', 'growth factor signaling'],
  },
  {
    id: 'Rule_based_egfr_tutorial',
    name: 'Rule based egfr tutorial',
    description: 'BNGL model: Rule based egfr tutorial',
    code: ruleBasedEgfrTutorial,
    tags: ['published', 'growth factor signaling'],
  },
];

const IMMUNE_SIGNALING: Example[] = [
  {
    id: 'An_2009',
    name: 'An 2009',
    description: 'BNGL model: An 2009',
    code: an2009,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'BaruaBCR_2012',
    name: 'BaruaBCR 2012',
    description: 'BNGL model: BaruaBCR 2012',
    code: baruabcr2012,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'BaruaFceRI_2012',
    name: 'BaruaFceRI 2012',
    description: 'BNGL model: BaruaFceRI 2012',
    code: baruafceri2012,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'blbr',
    name: 'BLBR',
    description: 'BNGL model: BLBR',
    code: blbr,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'ChylekFceRI_2014',
    name: 'ChylekFceRI 2014',
    description: 'BNGL model: ChylekFceRI 2014',
    code: chylekfceri2014,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'ChylekTCR_2014',
    name: 'ChylekTCR 2014',
    description: 'Model from Faeder et al. (2009)',
    code: chylektcr2014,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'Faeder_2003',
    name: 'Faeder 2003',
    description: 'BNGL model: Faeder 2003',
    code: faeder2003,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'fceri_2003',
    name: 'FceRI 2003',
    description: 'BNGL model: FceRI 2003',
    code: fceri2003,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'innate_immunity',
    name: 'Innate Immunity',
    description: 'Model from Signaling (2023). Science Signaling (2023).',
    code: innateImmunity,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'Jaruszewicz-Blonska_2023',
    name: 'Jaruszewicz Blonska 2023',
    description: 'BNGL model: Jaruszewicz Blonska 2023',
    code: jaruszewiczBlonska2023,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'Korwek_2023',
    name: 'Korwek 2023',
    description: 'Model from Signaling (2023). Science Signaling (2023).',
    code: korwek2023,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'Model_ZAP',
    name: 'Model ZAP',
    description: 'BNGL model: Model ZAP',
    code: modelZap,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'Mukhopadhyay_2013',
    name: 'Mukhopadhyay 2013',
    description: 'BNGL model: Mukhopadhyay 2013',
    code: mukhopadhyay2013,
    tags: ['published', 'immune signaling'],
  },
  {
    id: 'tlbr',
    name: 'TLBR',
    description: 'BNGL model: TLBR',
    code: tlbr,
    tags: ['published', 'immune signaling'],
  },
];

const TUTORIALS: Example[] = [
  {
    id: 'chemistry',
    name: 'chemistry',
    description: 'BNGL model: chemistry',
    code: chemistry,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer',
    name: 'polymer',
    description: 'BNGL model: polymer',
    code: polymer,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer_draft',
    name: 'polymer draft',
    description: 'BNGL model: polymer draft',
    code: polymerDraft,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'simple',
    name: 'simple',
    description: 'BNGL model: simple',
    code: simple,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy1',
    name: 'toy1',
    description: 'BNGL model: toy1',
    code: toy1,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy2',
    name: 'toy2',
    description: 'BNGL model: toy2',
    code: toy2,
    tags: ['published', 'tutorials'],
  },
];

const TEST_MODELS: Example[] = [
  {
    id: 'akt-signaling',
    name: 'akt signaling',
    description: 'BNGL model: akt signaling',
    code: aktSignaling,
    tags: ['test model'],
  },
  {
    id: 'allosteric-activation',
    name: 'allosteric activation',
    description: 'BNGL model: allosteric activation',
    code: allostericActivation,
    tags: ['test model'],
  },
  {
    id: 'apoptosis-cascade',
    name: 'apoptosis cascade',
    description: 'BNGL model: apoptosis cascade',
    code: apoptosisCascade,
    tags: ['test model'],
  },
  {
    id: 'auto-activation-loop',
    name: 'auto activation loop',
    description: 'BNGL model: auto activation loop',
    code: autoActivationLoop,
    tags: ['test model'],
  },
  {
    id: 'beta-adrenergic-response',
    name: 'beta adrenergic response',
    description: 'BNGL model: beta adrenergic response',
    code: betaAdrenergicResponse,
    tags: ['test model'],
  },
  {
    id: 'bistable-toggle-switch',
    name: 'bistable toggle switch',
    description: 'BNGL model: bistable toggle switch',
    code: bistableToggleSwitch,
    tags: ['test model'],
  },
  {
    id: 'blood-coagulation-thrombin',
    name: 'blood coagulation thrombin',
    description: 'BNGL model: blood coagulation thrombin',
    code: bloodCoagulationThrombin,
    tags: ['test model'],
  },
  {
    id: 'brusselator-oscillator',
    name: 'brusselator oscillator',
    description: 'BNGL model: brusselator oscillator',
    code: brusselatorOscillator,
    tags: ['test model'],
  },
  {
    id: 'calcium-spike-signaling',
    name: 'calcium spike signaling',
    description: 'BNGL model: calcium spike signaling',
    code: calciumSpikeSignaling,
    tags: ['test model'],
  },
  {
    id: 'cell-cycle-checkpoint',
    name: 'cell cycle checkpoint',
    description: 'BNGL model: cell cycle checkpoint',
    code: cellCycleCheckpoint,
    tags: ['test model'],
  },
  {
    id: 'chemotaxis-signal-transduction',
    name: 'chemotaxis signal transduction',
    description: 'BNGL model: chemotaxis signal transduction',
    code: chemotaxisSignalTransduction,
    tags: ['test model'],
  },
  {
    id: 'circadian-oscillator',
    name: 'circadian oscillator',
    description: 'BNGL model: circadian oscillator',
    code: circadianOscillator,
    tags: ['test model'],
  },
  {
    id: 'competitive-enzyme-inhibition',
    name: 'competitive enzyme inhibition',
    description: 'BNGL model: competitive enzyme inhibition',
    code: competitiveEnzymeInhibition,
    tags: ['test model'],
  },
  {
    id: 'complement-activation-cascade',
    name: 'complement activation cascade',
    description: 'BNGL model: complement activation cascade',
    code: complementActivationCascade,
    tags: ['test model'],
  },
  {
    id: 'cooperative-binding',
    name: 'cooperative binding',
    description: 'BNGL model: cooperative binding',
    code: cooperativeBinding,
    tags: ['test model'],
  },
  {
    id: 'dna-damage-repair',
    name: 'dna damage repair',
    description: 'BNGL model: dna damage repair',
    code: dnaDamageRepair,
    tags: ['test model'],
  },
  {
    id: 'dual-site-phosphorylation',
    name: 'dual site phosphorylation',
    description: 'BNGL model: dual site phosphorylation',
    code: dualSitePhosphorylation,
    tags: ['test model'],
  },
  {
    id: 'egfr-signaling-pathway',
    name: 'egfr signaling pathway',
    description: 'BNGL model: egfr signaling pathway',
    code: egfrSignalingPathway,
    tags: ['test model'],
  },
  {
    id: 'er-stress-response',
    name: 'er stress response',
    description: 'BNGL model: er stress response',
    code: erStressResponse,
    tags: ['test model'],
  },
  {
    id: 'gene-expression-toggle',
    name: 'gene expression toggle',
    description: 'BNGL model: gene expression toggle',
    code: geneExpressionToggle,
    tags: ['test model'],
  },
  {
    id: 'glycolysis-branch-point',
    name: 'glycolysis branch point',
    description: 'BNGL model: glycolysis branch point',
    code: glycolysisBranchPoint,
    tags: ['test model'],
  },
  {
    id: 'hematopoietic-growth-factor',
    name: 'hematopoietic growth factor',
    description: 'BNGL model: hematopoietic growth factor',
    code: hematopoieticGrowthFactor,
    tags: ['test model'],
  },
  {
    id: 'hypoxia-response-signaling',
    name: 'hypoxia response signaling',
    description: 'BNGL model: hypoxia response signaling',
    code: hypoxiaResponseSignaling,
    tags: ['test model'],
  },
  {
    id: 'immune-synapse-formation',
    name: 'immune synapse formation',
    description: 'BNGL model: immune synapse formation',
    code: immuneSynapseFormation,
    tags: ['test model'],
  },
  {
    id: 'inflammasome-activation',
    name: 'inflammasome activation',
    description: 'BNGL model: inflammasome activation',
    code: inflammasomeActivation,
    tags: ['test model'],
  },
  {
    id: 'insulin-glucose-homeostasis',
    name: 'insulin glucose homeostasis',
    description: 'BNGL model: insulin glucose homeostasis',
    code: insulinGlucoseHomeostasis,
    tags: ['test model'],
  },
  {
    id: 'interferon-signaling',
    name: 'interferon signaling',
    description: 'BNGL model: interferon signaling',
    code: interferonSignaling,
    tags: ['test model'],
  },
  {
    id: 'jak-stat-cytokine-signaling',
    name: 'jak stat cytokine signaling',
    description: 'BNGL model: jak stat cytokine signaling',
    code: jakStatCytokineSignaling,
    tags: ['test model'],
  },
  {
    id: 'lac-operon-regulation',
    name: 'lac operon regulation',
    description: 'BNGL model: lac operon regulation',
    code: lacOperonRegulation,
    tags: ['test model'],
  },
  {
    id: 'lipid-mediated-pip3-signaling',
    name: 'lipid mediated pip3 signaling',
    description: 'BNGL model: lipid mediated pip3 signaling',
    code: lipidMediatedPip3Signaling,
    tags: ['test model'],
  },
  {
    id: 'mapk-signaling-cascade',
    name: 'mapk signaling cascade',
    description: 'BNGL model: mapk signaling cascade',
    code: mapkSignalingCascade,
    tags: ['test model'],
  },
  {
    id: 'michaelis-menten-kinetics',
    name: 'michaelis menten kinetics',
    description: 'BNGL model: michaelis menten kinetics',
    code: michaelisMentenKinetics,
    tags: ['test model'],
  },
  {
    id: 'mtor-signaling',
    name: 'mtor signaling',
    description: 'BNGL model: mtor signaling',
    code: mtorSignaling,
    tags: ['test model'],
  },
  {
    id: 'myogenic-differentiation',
    name: 'myogenic differentiation',
    description: 'BNGL model: myogenic differentiation',
    code: myogenicDifferentiation,
    tags: ['test model'],
  },
  {
    id: 'negative-feedback-loop',
    name: 'negative feedback loop',
    description: 'BNGL model: negative feedback loop',
    code: negativeFeedbackLoop,
    tags: ['test model'],
  },
  {
    id: 'neurotransmitter-release',
    name: 'neurotransmitter release',
    description: 'BNGL model: neurotransmitter release',
    code: neurotransmitterRelease,
    tags: ['test model'],
  },
  {
    id: 'nfkb-feedback',
    name: 'nfkb feedback',
    description: 'BNGL model: nfkb feedback',
    code: nfkbFeedback,
    tags: ['test model'],
  },
  {
    id: 'notch-delta-lateral-inhibition',
    name: 'notch delta lateral inhibition',
    description: 'BNGL model: notch delta lateral inhibition',
    code: notchDeltaLateralInhibition,
    tags: ['test model'],
  },
  {
    id: 'oxidative-stress-response',
    name: 'oxidative stress response',
    description: 'BNGL model: oxidative stress response',
    code: oxidativeStressResponse,
    tags: ['test model'],
  },
  {
    id: 'p53-mdm2-oscillator',
    name: 'p53 mdm2 oscillator',
    description: 'BNGL model: p53 mdm2 oscillator',
    code: p53Mdm2Oscillator,
    tags: ['test model'],
  },
  {
    id: 'phosphorelay-chain',
    name: 'phosphorelay chain',
    description: 'BNGL model: phosphorelay chain',
    code: phosphorelayChain,
    tags: ['test model'],
  },
  {
    id: 'platelet-activation',
    name: 'platelet activation',
    description: 'BNGL model: platelet activation',
    code: plateletActivation,
    tags: ['test model'],
  },
  {
    id: 'predator-prey-dynamics',
    name: 'predator prey dynamics',
    description: 'BNGL model: predator prey dynamics',
    code: predatorPreyDynamics,
    tags: ['test model'],
  },
  {
    id: 'quorum-sensing-circuit',
    name: 'quorum sensing circuit',
    description: 'BNGL model: quorum sensing circuit',
    code: quorumSensingCircuit,
    tags: ['test model'],
  },
  {
    id: 'rab-gtpase-cycle',
    name: 'rab gtpase cycle',
    description: 'BNGL model: rab gtpase cycle',
    code: rabGtpaseCycle,
    tags: ['test model'],
  },
  {
    id: 'repressilator-oscillator',
    name: 'repressilator oscillator',
    description: 'BNGL model: repressilator oscillator',
    code: repressilatorOscillator,
    tags: ['test model'],
  },
  {
    id: 'retinoic-acid-signaling',
    name: 'retinoic acid signaling',
    description: 'BNGL model: retinoic acid signaling',
    code: retinoicAcidSignaling,
    tags: ['test model'],
  },
  {
    id: 'signal-amplification-cascade',
    name: 'signal amplification cascade',
    description: 'BNGL model: signal amplification cascade',
    code: signalAmplificationCascade,
    tags: ['test model'],
  },
  {
    id: 'simple-dimerization',
    name: 'simple dimerization',
    description: 'BNGL model: simple dimerization',
    code: simpleDimerization,
    tags: ['test model'],
  },
  {
    id: 'sir-epidemic-model',
    name: 'sir epidemic model',
    description: 'BNGL model: sir epidemic model',
    code: sirEpidemicModel,
    tags: ['test model'],
  },
  {
    id: 'smad-tgf-beta-signaling',
    name: 'smad tgf beta signaling',
    description: 'BNGL model: smad tgf beta signaling',
    code: smadTgfBetaSignaling,
    tags: ['test model'],
  },
  {
    id: 'stress-response-adaptation',
    name: 'stress response adaptation',
    description: 'BNGL model: stress response adaptation',
    code: stressResponseAdaptation,
    tags: ['test model'],
  },
  {
    id: 'synaptic-plasticity-ltp',
    name: 'synaptic plasticity ltp',
    description: 'BNGL model: synaptic plasticity ltp',
    code: synapticPlasticityLtp,
    tags: ['test model'],
  },
  {
    id: 't-cell-activation',
    name: 't cell activation',
    description: 'BNGL model: t cell activation',
    code: tCellActivation,
    tags: ['test model'],
  },
  {
    id: 'tnf-induced-apoptosis',
    name: 'tnf induced apoptosis',
    description: 'BNGL model: tnf induced apoptosis',
    code: tnfInducedApoptosis,
    tags: ['test model'],
  },
  {
    id: 'two-component-system',
    name: 'two component system',
    description: 'BNGL model: two component system',
    code: twoComponentSystem,
    tags: ['test model'],
  },
  {
    id: 'vegf-angiogenesis',
    name: 'vegf angiogenesis',
    description: 'BNGL model: vegf angiogenesis',
    code: vegfAngiogenesis,
    tags: ['test model'],
  },
  {
    id: 'viral-sensing-innate-immunity',
    name: 'viral sensing innate immunity',
    description: 'BNGL model: viral sensing innate immunity',
    code: viralSensingInnateImmunity,
    tags: ['test model'],
  },
  {
    id: 'wnt-beta-catenin-signaling',
    name: 'wnt beta catenin signaling',
    description: 'BNGL model: wnt beta catenin signaling',
    code: wntBetaCateninSignaling,
    tags: ['test model'],
  },
  {
    id: 'wound-healing-pdgf-signaling',
    name: 'wound healing pdgf signaling',
    description: 'BNGL model: wound healing pdgf signaling',
    code: woundHealingPdgfSignaling,
    tags: ['test model'],
  },
];

export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  models: Example[];
}

// Raw categories with all models (including incompatible ones)
const RAW_MODEL_CATEGORIES: ModelCategory[] = [
  {
    id: 'cell-regulation',
    name: 'Cell Regulation & Transport',
    description: 'Models of cell signaling, nuclear transport, and developmental pathways',
    models: CELL_REGULATION,
  },
  {
    id: 'complex-models',
    name: 'Complex Published Models',
    description: 'Advanced models from recent publications',
    models: COMPLEX_MODELS,
  },
  {
    id: 'growth-factor-signaling',
    name: 'Growth Factor Signaling',
    description: 'Models of receptor tyrosine kinases and growth factor pathways',
    models: GROWTH_FACTOR_SIGNALING,
  },
  {
    id: 'immune-signaling',
    name: 'Immune Signaling',
    description: 'Models of immune cell receptor signaling and innate immunity',
    models: IMMUNE_SIGNALING,
  },
  {
    id: 'tutorials',
    name: 'Tutorials & Simple Examples',
    description: 'Educational models and basic BNGL syntax examples',
    models: TUTORIALS,
  },
  {
    id: 'test-models',
    name: 'Test Models',
    description: 'Models generated for testing and demonstration',
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

// Flat list of all compatible models
export const EXAMPLES: Example[] = MODEL_CATEGORIES.flatMap(cat => cat.models);
