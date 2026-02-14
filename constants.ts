import { Example } from './types.ts';

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
// blbr removed - has generate_network but NO simulate command
import chylekfceri2014 from './published-models/immune-signaling/ChylekFceRI_2014.bngl?raw';
import chylektcr2014 from './published-models/immune-signaling/ChylekTCR_2014.bngl?raw';
import faeder2003 from './published-models/immune-signaling/Faeder_2003.bngl?raw';
import fceri2003 from './published-models/immune-signaling/fceri_2003.bngl?raw';
import innateImmunity from './published-models/immune-signaling/innate_immunity.bngl?raw';
import jaruszewiczBlonska2023 from './published-models/immune-signaling/Jaruszewicz-Blonska_2023.bngl?raw';
// korwek2023 removed - identical to innate_immunity
import modelZap from './published-models/immune-signaling/Model_ZAP.bngl?raw';
import mukhopadhyay2013 from './published-models/immune-signaling/Mukhopadhyay_2013.bngl?raw';
import tlbr from './published-models/immune-signaling/tlbr.bngl?raw';
import camkiiHolo from './published-models/Ordyan_2020/CaMKII_holo.bngl?raw';
import extraCaMKII from './published-models/Ordyan_2020/extra_CaMKII_Holo.bngl?raw';
import mCaMKII from './published-models/Ordyan_2020/mCaMKII_Ca_Spike.bngl?raw';
import degranulationModel from './published-models/PyBNG/degranulation_model.bngl?raw';
import egfrOde from './published-models/PyBNG/egfr_ode.bngl?raw';

// Tutorials & Simple Examples
import chemistry from './published-models/tutorials/chemistry.bngl?raw';
import polymer from './published-models/tutorials/polymer.bngl?raw';
import polymerDraft from './published-models/tutorials/polymer_draft.bngl?raw';
import simple from './published-models/tutorials/simple.bngl?raw';
import toy1 from './published-models/tutorials/toy1.bngl?raw';
import toy2 from './published-models/tutorials/toy2.bngl?raw';
import quasiEquilibrium from './published-models/toy-models/quasi_equilibrium.bngl?raw';


// Native Tutorials
import ABTutorial from './published-models/native-tutorials/AB/AB.bngl?raw';
import ABCTutorial from './published-models/native-tutorials/ABC/ABC.bngl?raw';
import ABCScanTutorial from './published-models/native-tutorials/ABC/ABC_scan.bngl?raw';
import ABCSsaTutorial from './published-models/native-tutorials/ABC/ABC_ssa.bngl?raw';
import LVTutorial from './published-models/native-tutorials/ABC/LV.bngl?raw';
import SIRTutorial from './published-models/native-tutorials/ABC/SIR.bngl?raw';
import ABpTutorial from './published-models/native-tutorials/ABp/ABp.bngl?raw';
import ABpApproxTutorial from './published-models/native-tutorials/ABp/ABp_approx.bngl?raw';
import GKTutorial from './published-models/native-tutorials/ABp/GK.bngl?raw';
import LismanTutorial from './published-models/native-tutorials/ABp/Lisman.bngl?raw';
import LismanBifurcateTutorial from './published-models/native-tutorials/ABp/Lisman_bifurcate.bngl?raw';
import BABTutorial from './published-models/native-tutorials/BAB/BAB.bngl?raw';
import BABCoopTutorial from './published-models/native-tutorials/BAB/BAB_coop.bngl?raw';
import BABScanTutorial from './published-models/native-tutorials/BAB/BAB_scan.bngl?raw';
import BLBRTutorial from './published-models/native-tutorials/CBNGL/BLBR.bngl?raw';
import cBNGLSimpleTutorial from './published-models/native-tutorials/CBNGL/cBNGL_simple.bngl?raw';
import LRTutorial from './published-models/native-tutorials/CBNGL/LR.bngl?raw';
import LRRTutorial from './published-models/native-tutorials/CBNGL/LRR.bngl?raw';
import LRRCompTutorial from './published-models/native-tutorials/CBNGL/LRR_comp.bngl?raw';
import LRCompTutorial from './published-models/native-tutorials/CBNGL/LR_comp.bngl?raw';
import LVCompTutorial from './published-models/native-tutorials/CBNGL/LV_comp.bngl?raw';
import organelleTransportTutorial from './published-models/native-tutorials/CBNGL/organelle_transport.bngl?raw';
import organelleTransportStructTutorial from './published-models/native-tutorials/CBNGL/organelle_transport_struct.bngl?raw';
import ChylekLibraryTutorial from './published-models/native-tutorials/LargerModels/Chylek_library.bngl?raw';
import Creamer2012Tutorial from './published-models/native-tutorials/LargerModels/Creamer_2012.bngl?raw';
import egfrSimpleTutorial from './published-models/native-tutorials/LargerModels/egfr_simple.bngl?raw';
import FceRIJiTutorial from './published-models/native-tutorials/LargerModels/FceRI_ji.bngl?raw';
import Suderman2013Tutorial from './published-models/native-tutorials/LargerModels/Suderman_2013.bngl?raw';
// import translateSBMLTutorial from './published-models/native-tutorials/SBML/translateSBML.bngl?raw';
import birthDeathTutorial from './published-models/native-tutorials/SynDeg/birth-death.bngl?raw';
import CircadianOscillatorTutorial from './published-models/native-tutorials/SynDeg/CircadianOscillator.bngl?raw';
import ComplexDegradationTutorial from './published-models/native-tutorials/SynDeg/ComplexDegradation.bngl?raw';
import RepressilatorTutorial from './published-models/native-tutorials/SynDeg/Repressilator.bngl?raw';
import toggleTutorial from './published-models/native-tutorials/SynDeg/toggle.bngl?raw';
import FceRIVizTutorial from './published-models/native-tutorials/Viz/FceRI_viz.bngl?raw';
import visualizeTutorial from './published-models/native-tutorials/Viz/visualize.bngl?raw';

// fceri_fyn import is maintained as it was missing from original set
import fceri_fyn from './published-models/immune-signaling/fceri_fyn.bngl?raw';


// Test Models
import aktSignaling from './example-models/akt-signaling.bngl?raw';
import allostericActivation from './example-models/allosteric-activation.bngl?raw';
import ampkSignaling from './example-models/ampk-signaling.bngl?raw';
import apoptosisCascade from './example-models/apoptosis-cascade.bngl?raw';
import autoActivationLoop from './example-models/auto-activation-loop.bngl?raw';
import autophagyRegulation from './example-models/autophagy-regulation.bngl?raw';
import bcrSignaling from './example-models/bcr-signaling.bngl?raw';
import betaAdrenergicResponse from './example-models/beta-adrenergic-response.bngl?raw';
import bistableToggleSwitch from './example-models/bistable-toggle-switch.bngl?raw';
import bloodCoagulationThrombin from './example-models/blood-coagulation-thrombin.bngl?raw';
import bmpSignaling from './example-models/bmp-signaling.bngl?raw';
import brusselatorOscillator from './example-models/brusselator-oscillator.bngl?raw';
import calcineurinNfatPathway from './example-models/calcineurin-nfat-pathway.bngl?raw';
import calciumSpikeSignaling from './example-models/calcium-spike-signaling.bngl?raw';
import caspaseActivationLoop from './example-models/caspase-activation-loop.bngl?raw';
import cd40Signaling from './example-models/cd40-signaling.bngl?raw';
import cellCycleCheckpoint from './example-models/cell-cycle-checkpoint.bngl?raw';
import checkpointKinaseSignaling from './example-models/checkpoint-kinase-signaling.bngl?raw';
import chemotaxisSignalTransduction from './example-models/chemotaxis-signal-transduction.bngl?raw';
import circadianOscillator from './example-models/circadian-oscillator.bngl?raw';
import clockBmal1GeneCircuit from './example-models/clock-bmal1-gene-circuit.bngl?raw';
import compartmentEndocytosis from './example-models/compartment_endocytosis.bngl?raw';
import compartmentMembraneBound from './example-models/compartment_membrane_bound.bngl?raw';
import compartmentNestedTransport from './example-models/compartment_nested_transport.bngl?raw';
import compartmentNuclearTransport from './example-models/compartment_nuclear_transport.bngl?raw';
import compartmentOrganelleExchange from './example-models/compartment_organelle_exchange.bngl?raw';
import competitiveEnzymeInhibition from './example-models/competitive-enzyme-inhibition.bngl?raw';
import complementActivationCascade from './example-models/complement-activation-cascade.bngl?raw';
import contactInhibitionHippoYap from './example-models/contact-inhibition-hippo-yap.bngl?raw';
import cooperativeBinding from './example-models/cooperative-binding.bngl?raw';
import csDiffieHellman from './example-models/cs_diffie_hellman.bngl?raw';
import csHashFunction from './example-models/cs_hash_function.bngl?raw';
import csHuffman from './example-models/cs_huffman.bngl?raw';
import csMonteCarloPi from './example-models/cs_monte_carlo_pi.bngl?raw';
import csPagerank from './example-models/cs_pagerank.bngl?raw';
import csPidController from './example-models/cs_pid_controller.bngl?raw';
import csRegexNfa from './example-models/cs_regex_nfa.bngl?raw';
import dnaDamageRepair from './example-models/dna-damage-repair.bngl?raw';
import dnaMethylationDynamics from './example-models/dna-methylation-dynamics.bngl?raw';
import dr5ApoptosisSignaling from './example-models/dr5-apoptosis-signaling.bngl?raw';
import dualSitePhosphorylation from './example-models/dual-site-phosphorylation.bngl?raw';
import e2fRbCellCycleSwitch from './example-models/e2f-rb-cell-cycle-switch.bngl?raw';
import ecoCoevolutionHostParasite from './example-models/eco_coevolution_host_parasite.bngl?raw';
import ecoFoodWebChaos3sp from './example-models/eco_food_web_chaos_3sp.bngl?raw';
import ecoLotkaVolterraGrid from './example-models/eco_lotka_volterra_grid.bngl?raw';
import ecoMutualismObligate from './example-models/eco_mutualism_obligate.bngl?raw';
import ecoRockPaperScissorsSpatial from './example-models/eco_rock_paper_scissors_spatial.bngl?raw';
import egfrSignalingPathway from './example-models/egfr-signaling-pathway.bngl?raw';
import eif2aStressResponse from './example-models/eif2a-stress-response.bngl?raw';
import endosomalSortingRab from './example-models/endosomal-sorting-rab.bngl?raw';
import energyAllosteryMwc from './example-models/energy_allostery_mwc.bngl?raw';
import energyCatalysisMm from './example-models/energy_catalysis_mm.bngl?raw';
import energyCooperativityAdh from './example-models/energy_cooperativity_adh.bngl?raw';
import energyLinearChain from './example-models/energy_linear_chain.bngl?raw';
import energyTransportPump from './example-models/energy_transport_pump.bngl?raw';
import erStressResponse from './example-models/er-stress-response.bngl?raw';
import erkNuclearTranslocation from './example-models/erk-nuclear-translocation.bngl?raw';
import featureFunctionalRatesVolume from './example-models/feature_functional_rates_volume.bngl?raw';
import featureGlobalFunctionsScan from './example-models/feature_global_functions_scan.bngl?raw';
import featureLocalFunctionsExplicit from './example-models/feature_local_functions_explicit.bngl?raw';
import featureSymmetryFactorsCyclic from './example-models/feature_symmetry_factors_cyclic.bngl?raw';
import featureSynthesisDegradationSs from './example-models/feature_synthesis_degradation_ss.bngl?raw';
import fgfSignalingPathway from './example-models/fgf-signaling-pathway.bngl?raw';
import gas6AxlSignaling from './example-models/gas6-axl-signaling.bngl?raw';
import geneExpressionToggle from './example-models/gene-expression-toggle.bngl?raw';
import geneticBistabilityEnergy from './example-models/genetic_bistability_energy.bngl?raw';
import geneticDnaReplicationStochastic from './example-models/genetic_dna_replication_stochastic.bngl?raw';
import geneticGoodwinOscillator from './example-models/genetic_goodwin_oscillator.bngl?raw';
import geneticTranslationKinetics from './example-models/genetic_translation_kinetics.bngl?raw';
import geneticTuringPattern1d from './example-models/genetic_turing_pattern_1d.bngl?raw';
import glioblastomaEgfrviiiSignaling from './example-models/glioblastoma-egfrviii-signaling.bngl?raw';
import glycolysisBranchPoint from './example-models/glycolysis-branch-point.bngl?raw';
import gmGameOfLife from './example-models/gm_game_of_life.bngl?raw';
import gmRayMarcher from './example-models/gm_ray_marcher.bngl?raw';
import gpcrDesensitizationArrestin from './example-models/gpcr-desensitization-arrestin.bngl?raw';
import hedgehogSignalingPathway from './example-models/hedgehog-signaling-pathway.bngl?raw';
import hematopoieticGrowthFactor from './example-models/hematopoietic-growth-factor.bngl?raw';
import hif1aDegradationLoop from './example-models/hif1a_degradation_loop.bngl?raw';
import hypoxiaResponseSignaling from './example-models/hypoxia-response-signaling.bngl?raw';
import il1bSignaling from './example-models/il1b-signaling.bngl?raw';
import il6JakStatPathway from './example-models/il6-jak-stat-pathway.bngl?raw';
import immuneSynapseFormation from './example-models/immune-synapse-formation.bngl?raw';
import inflammasomeActivation from './example-models/inflammasome-activation.bngl?raw';
import inositolPhosphateMetabolism from './example-models/inositol-phosphate-metabolism.bngl?raw';
import insulinGlucoseHomeostasis from './example-models/insulin-glucose-homeostasis.bngl?raw';
import interferonSignaling from './example-models/interferon-signaling.bngl?raw';
import ire1aXbp1ErStress from './example-models/ire1a-xbp1-er-stress.bngl?raw';
import jakStatCytokineSignaling from './example-models/jak-stat-cytokine-signaling.bngl?raw';
import jnkMapkSignaling from './example-models/jnk-mapk-signaling.bngl?raw';
import kirChannelRegulation from './example-models/kir-channel-regulation.bngl?raw';
import lTypeCalciumChannelDynamics from './example-models/l-type-calcium-channel-dynamics.bngl?raw';
import lacOperonRegulation from './example-models/lac-operon-regulation.bngl?raw';
import lipidMediatedPip3Signaling from './example-models/lipid-mediated-pip3-signaling.bngl?raw';
import mapkSignalingCascade from './example-models/mapk-signaling-cascade.bngl?raw';
import metaFormalGameTheory from './example-models/meta_formal_game_theory.bngl?raw';
import metaFormalMolecularClock from './example-models/meta_formal_molecular_clock.bngl?raw';
import metaFormalPetriNet from './example-models/meta_formal_petri_net.bngl?raw';
import michaelisMentenKinetics from './example-models/michaelis-menten-kinetics.bngl?raw';
import mlGradientDescent from './example-models/ml_gradient_descent.bngl?raw';
import mlHopfield from './example-models/ml_hopfield.bngl?raw';
import mlKmeans from './example-models/ml_kmeans.bngl?raw';
import mlQLearning from './example-models/ml_q_learning.bngl?raw';
import mlSvm from './example-models/ml_svm.bngl?raw';
import mtArithmeticCompiler from './example-models/mt_arithmetic_compiler.bngl?raw';
import mtBnglInterpreter from './example-models/mt_bngl_interpreter.bngl?raw';
import mtMusicSequencer from './example-models/mt_music_sequencer.bngl?raw';
import mtPascalTriangle from './example-models/mt_pascal_triangle.bngl?raw';
import mtQuine from './example-models/mt_quine.bngl?raw';
import mtorSignaling from './example-models/mtor-signaling.bngl?raw';
import mtorc2Signaling from './example-models/mtorc2-signaling.bngl?raw';
import myogenicDifferentiation from './example-models/myogenic-differentiation.bngl?raw';
import negativeFeedbackLoop from './example-models/negative-feedback-loop.bngl?raw';
import neurotransmitterRelease from './example-models/neurotransmitter-release.bngl?raw';
import nfkbFeedback from './example-models/nfkb-feedback.bngl?raw';
import nfsimAggregationGelation from './example-models/nfsim_aggregation_gelation.bngl?raw';
import nfsimCoarseGraining from './example-models/nfsim_coarse_graining.bngl?raw';
import nfsimDynamicCompartments from './example-models/nfsim_dynamic_compartments.bngl?raw';
import nfsimHybridParticleField from './example-models/nfsim_hybrid_particle_field.bngl?raw';
import nfsimRingClosurePolymer from './example-models/nfsim_ring_closure_polymer.bngl?raw';
import nnXor from './example-models/nn_xor.bngl?raw';
import noCgmpSignaling from './example-models/no-cgmp-signaling.bngl?raw';
import notchDeltaLateralInhibition from './example-models/notch-delta-lateral-inhibition.bngl?raw';
import oxidativeStressResponse from './example-models/oxidative-stress-response.bngl?raw';
import p38MapkSignaling from './example-models/p38-mapk-signaling.bngl?raw';
import p53Mdm2Oscillator from './example-models/p53-mdm2-oscillator.bngl?raw';
import parp1MediatedDnaRepair from './example-models/parp1-mediated-dna-repair.bngl?raw';
import phLorenzAttractor from './example-models/ph_lorenz_attractor.bngl?raw';
import phNbodyGravity from './example-models/ph_nbody_gravity.bngl?raw';
import phSchrodinger from './example-models/ph_schrodinger.bngl?raw';
import phWaveEquation from './example-models/ph_wave_equation.bngl?raw';
import phosphorelayChain from './example-models/phosphorelay-chain.bngl?raw';
import plateletActivation from './example-models/platelet-activation.bngl?raw';
import predatorPreyDynamics from './example-models/predator-prey-dynamics.bngl?raw';
import processActinTreadmilling from './example-models/process_actin_treadmilling.bngl?raw';
import processAutophagyFlux from './example-models/process_autophagy_flux.bngl?raw';
import processCellAdhesionStrength from './example-models/process_cell_adhesion_strength.bngl?raw';
import processKineticProofreadingTcr from './example-models/process_kinetic_proofreading_tcr.bngl?raw';
import processQuorumSensingSwitch from './example-models/process_quorum_sensing_switch.bngl?raw';
import quorumSensingCircuit from './example-models/quorum-sensing-circuit.bngl?raw';
import rabGtpaseCycle from './example-models/rab-gtpase-cycle.bngl?raw';
import ranklRankSignaling from './example-models/rankl-rank-signaling.bngl?raw';
import rasGefGapCycle from './example-models/ras-gef-gap-cycle.bngl?raw';
import repressilatorOscillator from './example-models/repressilator-oscillator.bngl?raw';
import retinoicAcidSignaling from './example-models/retinoic-acid-signaling.bngl?raw';
import rhoGtpaseActinCytoskeleton from './example-models/rho-gtpase-actin-cytoskeleton.bngl?raw';
import shp2PhosphataseRegulation from './example-models/shp2-phosphatase-regulation.bngl?raw';
import signalAmplificationCascade from './example-models/signal-amplification-cascade.bngl?raw';
import simpleDimerization from './example-models/simple-dimerization.bngl?raw';
import sirEpidemicModel from './example-models/sir-epidemic-model.bngl?raw';
import smadTgfBetaSignaling from './example-models/smad-tgf-beta-signaling.bngl?raw';
import sonicHedgehogGradient from './example-models/sonic-hedgehog-gradient.bngl?raw';
import spFourierSynthesizer from './example-models/sp_fourier_synthesizer.bngl?raw';
import spImageConvolution from './example-models/sp_image_convolution.bngl?raw';
import spKalmanFilter from './example-models/sp_kalman_filter.bngl?raw';
import stat3MediatedTranscription from './example-models/stat3-mediated-transcription.bngl?raw';
import stressResponseAdaptation from './example-models/stress-response-adaptation.bngl?raw';
import synapticPlasticityLtp from './example-models/synaptic-plasticity-ltp.bngl?raw';
import synbioBandPassFilter from './example-models/synbio_band_pass_filter.bngl?raw';
import synbioCounterMolecular from './example-models/synbio_counter_molecular.bngl?raw';
import synbioEdgeDetector from './example-models/synbio_edge_detector.bngl?raw';
import synbioLogicGatesEnzymatic from './example-models/synbio_logic_gates_enzymatic.bngl?raw';
import synbioOscillatorSynchronization from './example-models/synbio_oscillator_synchronization.bngl?raw';
import tCellActivation from './example-models/t-cell-activation.bngl?raw';
import tlr3DsrnaSensing from './example-models/tlr3-dsrna-sensing.bngl?raw';
import tnfInducedApoptosis from './example-models/tnf-induced-apoptosis.bngl?raw';
import twoComponentSystem from './example-models/two-component-system.bngl?raw';
import vegfAngiogenesis from './example-models/vegf-angiogenesis.bngl?raw';
import viralSensingInnateImmunity from './example-models/viral-sensing-innate-immunity.bngl?raw';
import wackyAlchemyStone from './example-models/wacky_alchemy_stone.bngl?raw';
import wackyBlackHole from './example-models/wacky_black_hole.bngl?raw';
import wackyBouncingBall from './example-models/wacky_bouncing_ball.bngl?raw';
import wackyTrafficJamAsep from './example-models/wacky_traffic_jam_asep.bngl?raw';
import wackyZombieInfection from './example-models/wacky_zombie_infection.bngl?raw';
import wntBetaCateninSignaling from './example-models/wnt-beta-catenin-signaling.bngl?raw';
import woundHealingPdgfSignaling from './example-models/wound-healing-pdgf-signaling.bngl?raw';


// Literature Models
import dolan2015 from './published-models/literature/Dolan_2015.bngl?raw';
import linErk2019 from './published-models/literature/Lin_ERK_2019.bngl?raw';
import linTcr2019 from './published-models/literature/Lin_TCR_2019.bngl?raw';
import linPrion2019 from './published-models/literature/Lin_Prion_2019.bngl?raw';
import model_CaOscillate_Func from './published-models/validation/CaOscillate_Func.bngl?raw';
import model_CaOscillate_Sat from './published-models/validation/CaOscillate_Sat.bngl?raw';
import model_catalysis from './published-models/validation/catalysis.bngl?raw';
import model_continue from './published-models/validation/continue.bngl?raw';
import model_egfr_net from './published-models/validation/egfr_net.bngl?raw';
import model_egfr_net_red from './published-models/validation/egfr_net_red.bngl?raw';
import model_egfr_path from './published-models/validation/egfr_path.bngl?raw';
import model_energy_example1 from './published-models/validation/energy_example1.bngl?raw';
import model_example1 from './published-models/validation/example1.bngl?raw';
import model_fceri_ji_comp from './published-models/validation/fceri_ji_comp.bngl?raw';
import model_Haugh2b from './published-models/validation/Haugh2b.bngl?raw';
import model_heise from './published-models/validation/heise.bngl?raw';
import model_issue_198_short from './published-models/validation/issue_198_short.bngl?raw';
import model_Kiefhaber_emodel from './published-models/validation/Kiefhaber_emodel.bngl?raw';
import model_Korwek_2023 from './published-models/validation/Korwek_2023.bngl?raw';
import model_localfunc from './published-models/validation/localfunc.bngl?raw';
import model_michment from './published-models/validation/michment.bngl?raw';
import model_michment_cont from './published-models/validation/michment_cont.bngl?raw';
import model_Motivating_example from './published-models/validation/Motivating_example.bngl?raw';
import model_Motivating_example_cBNGL from './published-models/validation/Motivating_example_cBNGL.bngl?raw';
import model_motor from './published-models/validation/motor.bngl?raw';
import model_mwc from './published-models/validation/mwc.bngl?raw';
import model_nfkb from './published-models/validation/nfkb.bngl?raw';
import model_nfkb_illustrating_protocols from './published-models/validation/nfkb_illustrating_protocols.bngl?raw';
import model_rec_dim from './published-models/validation/rec_dim.bngl?raw';
import model_rec_dim_comp from './published-models/validation/rec_dim_comp.bngl?raw';
import model_SHP2_base_model from './published-models/validation/SHP2_base_model.bngl?raw';
import model_simple_sbml_import from './published-models/validation/simple_sbml_import.bngl?raw';
import model_simple_system from './published-models/validation/simple_system.bngl?raw';
import model_test_ANG_synthesis_simple from './published-models/validation/test_ANG_synthesis_simple.bngl?raw';
import model_test_fixed from './published-models/validation/test_fixed.bngl?raw';
import model_test_MM from './published-models/validation/test_MM.bngl?raw';
import model_test_mratio from './published-models/validation/test_mratio.bngl?raw';
import model_test_network_gen from './published-models/validation/test_network_gen.bngl?raw';
import model_test_sat from './published-models/validation/test_sat.bngl?raw';
import model_test_synthesis_cBNGL_simple from './published-models/validation/test_synthesis_cBNGL_simple.bngl?raw';
import model_test_synthesis_complex from './published-models/validation/test_synthesis_complex.bngl?raw';
import model_test_synthesis_complex_0_cBNGL from './published-models/validation/test_synthesis_complex_0_cBNGL.bngl?raw';
import model_test_synthesis_complex_source_cBNGL from './published-models/validation/test_synthesis_complex_source_cBNGL.bngl?raw';
import model_test_synthesis_simple from './published-models/validation/test_synthesis_simple.bngl?raw';
import model_tlmr from './published-models/validation/tlmr.bngl?raw';
import model_toy_jim from './published-models/validation/toy-jim.bngl?raw';
import model_univ_synth from './published-models/validation/univ_synth.bngl?raw';

import cheemalavaguJakStat from './published-models/literature/Cheemalavagu_JAK_STAT.bngl?raw';

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
  'Chattaraj_2021',
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
  'blbr',
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
    code: barua2013,
    tags: ['published'],
  },
  {
    id: 'Blinov_ran',
    name: 'Blinov ran',
    description: 'Ran GTPase cycle',
    code: blinovRan,
    tags: ['published'],
  },
  {
    id: 'Hat_2016',
    name: 'Hat 2016',
    description: 'Nuclear transport',
    code: hat2016,
    tags: ['published'],
  },
  {
    id: 'Kocieniewski_2012',
    name: 'Kocieniewski 2012',
    description: 'Actin dynamics',
    code: kocieniewski2012,
    tags: ['published'],
  },
  {
    id: 'notch',
    name: 'Notch',
    description: 'Notch signaling',
    code: notch,
    tags: ['published'],
  },
  {
    id: 'Pekalski_2013',
    name: 'Pekalski 2013',
    description: 'Spontaneous signaling',
    code: pekalski2013,
    tags: ['published'],
  },
  {
    id: 'Rule_based_Ran_transport',
    name: 'Rule based Ran transport',
    description: 'Nuclear Ran transport',
    code: ruleBasedRanTransport,
    tags: ['published'],
  },
  {
    id: 'Rule_based_Ran_transport_draft',
    name: 'Rule based Ran transport draft',
    description: 'Ran transport (draft)',
    code: ruleBasedRanTransportDraft,
    tags: ['published'],
  },
  {
    id: 'vilar_2002',
    name: 'Vilar 2002',
    description: 'Genetic oscillator',
    code: vilar2002,
    tags: ['published'],
  },
  {
    id: 'vilar_2002b',
    name: 'Vilar 2002b',
    description: 'Gene oscillator',
    code: vilar2002b,
    tags: ['published'],
  },
  {
    id: 'vilar_2002c',
    name: 'Vilar 2002c',
    description: 'Gene oscillator',
    code: vilar2002c,
    tags: ['published'],
  },
  {
    id: 'wnt',
    name: 'Wnt Signaling',
    description: 'Wnt signaling',
    code: wnt,
    tags: ['published'],
  },
];

const COMPLEX_MODELS: Example[] = [
  {
    id: 'Barua_2007',
    name: 'Barua 2007',
    description: 'Model from Haugh (2006)',
    code: barua2007,
    tags: ['published'],
  },
  {
    id: 'Barua_2009',
    name: 'Barua 2009',
    description: 'JAK2-SH2B signaling',
    code: barua2009,
    tags: ['published'],
  },
  {
    id: 'Blinov_2006',
    name: 'Blinov 2006',
    description: 'Phosphotyrosine signaling',
    code: blinov2006,
    tags: ['published'],
  },
  {
    id: 'Chattaraj_2021',
    name: 'Chattaraj 2021',
    description: 'NFkB oscillations',
    code: chattaraj2021,
    tags: ['published'],
  },
  {
    id: 'Dushek_2011',
    name: 'Dushek 2011',
    description: 'TCR signaling',
    code: dushek2011,
    tags: ['published'],
  },
  {
    id: 'Dushek_2014',
    name: 'Dushek 2014',
    description: 'TCR signaling dynamics',
    code: dushek2014,
    tags: ['published'],
  },
  {
    id: 'Erdem_2021',
    name: 'Erdem 2021',
    description: 'InsR/IGF1R signaling',
    code: erdem2021,
    tags: ['published'],
  },
  {
    id: 'Jung_2017',
    name: 'Jung 2017',
    description: 'M1 receptor signaling',
    code: jung2017,
    tags: ['published'],
  },
  {
    id: 'Kesseler_2013',
    name: 'Kesseler 2013',
    description: 'G2/Mitosis transition',
    code: kesseler2013,
    tags: ['published'],
  },
  {
    id: 'Kozer_2013',
    name: 'Kozer 2013',
    description: 'EGFR oligomerization',
    code: kozer2013,
    tags: ['published'],
  },
  {
    id: 'Kozer_2014',
    name: 'Kozer 2014',
    description: 'Grb2-EGFR recruitment',
    code: kozer2014,
    tags: ['published'],
  },
  {
    id: 'mapk-dimers',
    name: 'MAPK Dimers',
    description: 'MAPK dimerization',
    code: mapkDimers,
    tags: ['published'],
  },
  {
    id: 'mapk-monomers',
    name: 'MAPK Monomers',
    description: 'MAPK cascade',
    code: mapkMonomers,
    tags: ['published'],
  },
  {
    id: 'Massole_2023',
    name: 'Massole 2023',
    description: 'Epo receptor signaling',
    code: massole2023,
    tags: ['published'],
  },
  {
    id: 'McMillan_2021',
    name: 'McMillan 2021',
    description: 'TNF signaling',
    code: mcmillan2021,
    tags: ['published'],
  },
  {
    id: 'Nag_2009',
    name: 'Nag 2009',
    description: 'LAT-Grb2-SOS1 signaling',
    code: nag2009,
    tags: ['published'],
  },
  {
    id: 'Nosbisch_2022',
    name: 'Nosbisch 2022',
    description: 'RTK-PLCgamma1 signaling',
    code: nosbisch2022,
    tags: ['published'],
  },
  {
    id: 'Zhang_2021',
    name: 'Zhang 2021',
    description: 'CAR-T signaling',
    code: zhang2021,
    tags: ['published'],
  },
  {
    id: 'Zhang_2023',
    name: 'Zhang 2023',
    description: 'VEGF signaling',
    code: zhang2023,
    tags: ['published'],
  },
  {
    id: 'Lin_Prion_2019',
    name: 'Lin 2019',
    description: 'Prion replication',
    code: linPrion2019,
    tags: ['published', 'literature', 'prion'],
  },
];

const GROWTH_FACTOR_SIGNALING: Example[] = [
  {
    id: 'Blinov_egfr',
    name: 'Blinov egfr',
    description: 'EGFR signaling model',
    code: blinovEgfr,
    tags: ['published'],
  },
  {
    id: 'Lang_2024',
    name: 'Lang 2024',
    description: 'Cell cycle regulation',
    code: lang2024,
    tags: ['published'],
  },
  {
    id: 'Ligon_2014',
    name: 'Ligon 2014',
    description: 'Lipoplex delivery',
    code: ligon2014,
    tags: ['published'],
  },
  {
    id: 'Mertins_2023',
    name: 'Mertins 2023',
    description: 'DNA damage response',
    code: mertins2023,
    tags: ['published'],
  },
  {
    id: 'Rule_based_egfr_compart',
    name: 'Rule based egfr compart',
    description: 'Compartmental EGFR model',
    code: ruleBasedEgfrCompart,
    tags: ['published'],
  },
  {
    id: 'Rule_based_egfr_tutorial',
    name: 'Faeder 2009',
    description: 'EGFR signaling',
    code: ruleBasedEgfrTutorial,
    tags: ['published'],
  },
  {
    id: 'Dolan_2015',
    name: 'Dolan 2015',
    description: 'Insulin signaling',
    code: dolan2015,
    tags: ['published', 'literature', 'signaling'],
  },
  {
    id: 'Lin_ERK_2019',
    name: 'Lin 2019',
    description: 'ERK signaling',
    code: linErk2019,
    tags: ['published', 'literature', 'signaling'],
  },

  {
    id: 'egfr_ode',
    name: 'PyBNG: EGFR ODE',
    description: 'EGFR ODE',
    code: egfrOde,
    tags: ['published', 'PyBNG'],
  },
];

const IMMUNE_SIGNALING: Example[] = [
  {
    id: 'An_2009',
    name: 'An 2009',
    description: 'TLR4 signaling',
    code: an2009,
    tags: ['published', 'immunology'],
  },
  {
    id: 'BaruaBCR_2012',
    name: 'Barua 2012',
    description: 'BCR signaling',
    code: baruabcr2012,
    tags: ['published', 'immunology'],
  },
  {
    id: 'BaruaFceRI_2012',
    name: 'BaruaFceRI 2012',
    description: 'FcÃŽÂµRI signaling',
    code: baruafceri2012,
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
    code: chylekfceri2014,
    tags: ['published', 'immunology'],
  },
  {
    id: 'ChylekTCR_2014',
    name: 'Chylek 2014 (TCR)',
    description: 'TCR signaling',
    code: chylektcr2014,
    tags: ['published', 'immunology'],
  },
  {
    id: 'Faeder_2003',
    name: 'Faeder 2003',
    description: 'FceRI signaling',
    code: faeder2003,
    tags: ['published', 'immunology'],
  },
  {
    id: 'innate_immunity',
    name: 'Korwek 2023',
    description: 'Immune response',
    code: innateImmunity,
    tags: ['published', 'immunology'],
  },
  {
    id: 'Jaruszewicz-Blonska_2023',
    name: 'Jaruszewicz 2023',
    description: 'T-cell discrimination',
    code: jaruszewiczBlonska2023,
    tags: ['published', 'immunology'],
  },

  {
    id: 'Model_ZAP',
    name: 'Model ZAP',
    description: 'ZAP-70 recruitment',
    code: modelZap,
    tags: ['published', 'immunology'],
  },
  {
    id: 'Mukhopadhyay_2013',
    name: 'Mukhopadhyay 2013',
    description: 'FceRI signaling',
    code: mukhopadhyay2013,
    tags: ['published', 'immunology'],
  },
  {
    id: 'fceri_fyn',
    name: 'FceRI Fyn',
    description: 'FceRI signaling',
    code: fceri_fyn,
    tags: ['published', 'immunology'],
  },
  {
    id: 'tlbr',
    name: 'TLBR Tutorial',
    description: 'Ligand binding',
    code: tlbr,
    tags: ['published', 'immunology'],
  },
  {
    id: 'Lin_TCR_2019',
    name: 'Lin 2019',
    description: 'TCR signaling',
    code: linTcr2019,
    tags: ['published', 'literature', 'immune'],
  },
  {
    id: 'Cheemalavagu_JAK_STAT',
    name: 'Cheemalavagu 2024',
    description: 'JAK-STAT signaling',
    code: cheemalavaguJakStat,
    tags: ['published', 'literature', 'signaling'],
  },

  {
    id: 'degranulation_model',
    name: 'PyBNG: Degranulation model',
    description: 'Degranulation model',
    code: degranulationModel,
    tags: ['published', 'PyBNG'],
  },
];

// New published-models categories added from published-models/ directory
const ORDYAN_2020: Example[] = [
  {
    id: 'CaMKII_holo',
    name: 'Ordyan 2020: CaMKII holo',
    description: 'CaMKII holo',
    code: camkiiHolo,
    tags: ['published', 'neuroscience'],
  },
  {
    id: 'extra_CaMKII_Holo',
    name: 'Ordyan 2020: extra CaMKII holo',
    description: 'Extra CaMKII holo (supplement)',
    code: extraCaMKII,
    tags: ['published', 'neuroscience'],
  },
  {
    id: 'mCaMKII_Ca_Spike',
    name: 'Ordyan 2020: mCaMKII Ca Spike',
    description: 'mCaMKII Ca Spike model',
    code: mCaMKII,
    tags: ['published', 'neuroscience'],
  },
];





const TUTORIALS: Example[] = [
  {
    id: 'chemistry',
    name: 'chemistry',
    description: 'Basic chemical reactions',
    code: chemistry,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer',
    name: 'polymer',
    description: 'Polymerization model',
    code: polymer,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'polymer_draft',
    name: 'polymer draft',
    description: 'Polymerization (draft)',
    code: polymerDraft,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'simple',
    name: 'simple',
    description: 'Simple binding model',
    code: simple,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy1',
    name: 'toy1',
    description: 'Basic signaling toy',
    code: toy1,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'toy2',
    name: 'toy2',
    description: 'Enzymatic reaction toy',
    code: toy2,
    tags: ['published', 'tutorials'],
  },
  {
    id: 'quasi_equilibrium',
    name: 'quasi equilibrium',
    description: 'Quasi-equilibrium approximation',
    code: quasiEquilibrium,
    tags: ['published', 'toy models'],
  },
  {
    id: 'sir-epidemic-model',
    name: 'sir epidemic model',
    description: 'SIR epidemic model',
    code: sirEpidemicModel,
    tags: ['published', 'epidemiology'],
  },

];

const TEST_MODELS: Example[] = [
  {
    id: 'akt-signaling',
    name: 'akt signaling',
    description: 'Akt Signaling',
    code: aktSignaling,
    tags: ['example model'],
  },
  {
    id: 'allosteric-activation',
    name: 'allosteric activation',
    description: 'Allosteric Activation',
    code: allostericActivation,
    tags: ['example model'],
  },
  {
    id: 'ampk-signaling',
    name: 'ampk signaling',
    description: 'Ampk Signaling',
    code: ampkSignaling,
    tags: ['example model'],
  },
  {
    id: 'apoptosis-cascade',
    name: 'apoptosis cascade',
    description: 'Apoptosis Cascade',
    code: apoptosisCascade,
    tags: ['example model'],
  },
  {
    id: 'auto-activation-loop',
    name: 'auto activation loop',
    description: 'Auto Activation Loop',
    code: autoActivationLoop,
    tags: ['example model'],
  },
  {
    id: 'autophagy-regulation',
    name: 'autophagy regulation',
    description: 'Autophagy Regulation',
    code: autophagyRegulation,
    tags: ['example model'],
  },
  {
    id: 'bcr-signaling',
    name: 'bcr signaling',
    description: 'Bcr Signaling',
    code: bcrSignaling,
    tags: ['example model'],
  },
  {
    id: 'beta-adrenergic-response',
    name: 'beta adrenergic response',
    description: 'Beta Adrenergic Response',
    code: betaAdrenergicResponse,
    tags: ['example model'],
  },
  {
    id: 'bistable-toggle-switch',
    name: 'bistable toggle switch',
    description: 'Bistable Toggle Switch',
    code: bistableToggleSwitch,
    tags: ['example model'],
  },
  {
    id: 'blood-coagulation-thrombin',
    name: 'blood coagulation thrombin',
    description: 'Blood Coagulation Thrombin',
    code: bloodCoagulationThrombin,
    tags: ['example model'],
  },
  {
    id: 'bmp-signaling',
    name: 'bmp signaling',
    description: 'Bmp Signaling',
    code: bmpSignaling,
    tags: ['example model'],
  },
  {
    id: 'brusselator-oscillator',
    name: 'brusselator oscillator',
    description: 'Brusselator Oscillator',
    code: brusselatorOscillator,
    tags: ['example model'],
  },
  {
    id: 'calcineurin-nfat-pathway',
    name: 'calcineurin nfat pathway',
    description: 'Calcineurin Nfat Pathway',
    code: calcineurinNfatPathway,
    tags: ['example model'],
  },
  {
    id: 'calcium-spike-signaling',
    name: 'calcium spike signaling',
    description: 'Calcium Spike Signaling',
    code: calciumSpikeSignaling,
    tags: ['example model'],
  },
  {
    id: 'caspase-activation-loop',
    name: 'caspase activation loop',
    description: 'Caspase Activation Loop',
    code: caspaseActivationLoop,
    tags: ['example model'],
  },
  {
    id: 'cd40-signaling',
    name: 'cd40 signaling',
    description: 'Cd40 Signaling',
    code: cd40Signaling,
    tags: ['example model'],
  },
  {
    id: 'cell-cycle-checkpoint',
    name: 'cell cycle checkpoint',
    description: 'Cell Cycle Checkpoint',
    code: cellCycleCheckpoint,
    tags: ['example model'],
  },
  {
    id: 'checkpoint-kinase-signaling',
    name: 'checkpoint kinase signaling',
    description: 'Checkpoint Kinase Signaling',
    code: checkpointKinaseSignaling,
    tags: ['example model'],
  },
  {
    id: 'chemotaxis-signal-transduction',
    name: 'chemotaxis signal transduction',
    description: 'Chemotaxis Signal Transduction',
    code: chemotaxisSignalTransduction,
    tags: ['example model'],
  },
  {
    id: 'circadian-oscillator',
    name: 'circadian oscillator',
    description: 'Circadian Oscillator',
    code: circadianOscillator,
    tags: ['example model'],
  },
  {
    id: 'clock-bmal1-gene-circuit',
    name: 'clock bmal1 gene circuit',
    description: 'Clock Bmal1 Gene Circuit',
    code: clockBmal1GeneCircuit,
    tags: ['example model'],
  },
  {
    id: 'compartment_endocytosis',
    name: 'compartment endocytosis',
    description: 'Compartment Endocytosis',
    code: compartmentEndocytosis,
    tags: ['example model'],
  },
  {
    id: 'compartment_membrane_bound',
    name: 'compartment membrane bound',
    description: 'Compartment Membrane Bound',
    code: compartmentMembraneBound,
    tags: ['example model'],
  },
  {
    id: 'compartment_nested_transport',
    name: 'compartment nested transport',
    description: 'Compartment Nested Transport',
    code: compartmentNestedTransport,
    tags: ['example model'],
  },
  {
    id: 'compartment_nuclear_transport',
    name: 'compartment nuclear transport',
    description: 'Compartment Nuclear Transport',
    code: compartmentNuclearTransport,
    tags: ['example model'],
  },
  {
    id: 'compartment_organelle_exchange',
    name: 'compartment organelle exchange',
    description: 'Compartment Organelle Exchange',
    code: compartmentOrganelleExchange,
    tags: ['example model'],
  },
  {
    id: 'competitive-enzyme-inhibition',
    name: 'competitive enzyme inhibition',
    description: 'Competitive Enzyme Inhibition',
    code: competitiveEnzymeInhibition,
    tags: ['example model'],
  },
  {
    id: 'complement-activation-cascade',
    name: 'complement activation cascade',
    description: 'Complement Activation Cascade',
    code: complementActivationCascade,
    tags: ['example model'],
  },
  {
    id: 'contact-inhibition-hippo-yap',
    name: 'contact inhibition hippo yap',
    description: 'Contact Inhibition Hippo Yap',
    code: contactInhibitionHippoYap,
    tags: ['example model'],
  },
  {
    id: 'cooperative-binding',
    name: 'cooperative binding',
    description: 'Cooperative Binding',
    code: cooperativeBinding,
    tags: ['example model'],
  },
  {
    id: 'cs_diffie_hellman',
    name: 'cs diffie hellman',
    description: 'Diffie Hellman',
    code: csDiffieHellman,
    tags: ['example model'],
  },
  {
    id: 'cs_hash_function',
    name: 'cs hash function',
    description: 'Hash Function',
    code: csHashFunction,
    tags: ['example model'],
  },
  {
    id: 'cs_huffman',
    name: 'cs huffman',
    description: 'Huffman',
    code: csHuffman,
    tags: ['example model'],
  },
  {
    id: 'cs_monte_carlo_pi',
    name: 'cs monte carlo pi',
    description: 'Monte Carlo Pi',
    code: csMonteCarloPi,
    tags: ['example model'],
  },
  {
    id: 'cs_pagerank',
    name: 'cs pagerank',
    description: 'Pagerank',
    code: csPagerank,
    tags: ['example model'],
  },
  {
    id: 'cs_pid_controller',
    name: 'cs pid controller',
    description: 'Pid Controller',
    code: csPidController,
    tags: ['example model'],
  },
  {
    id: 'cs_regex_nfa',
    name: 'cs regex nfa',
    description: 'Regex Nfa',
    code: csRegexNfa,
    tags: ['example model'],
  },
  {
    id: 'dna-damage-repair',
    name: 'dna damage repair',
    description: 'Dna Damage Repair',
    code: dnaDamageRepair,
    tags: ['example model'],
  },
  {
    id: 'dna-methylation-dynamics',
    name: 'dna methylation dynamics',
    description: 'Dna Methylation Dynamics',
    code: dnaMethylationDynamics,
    tags: ['example model'],
  },
  {
    id: 'dr5-apoptosis-signaling',
    name: 'dr5 apoptosis signaling',
    description: 'Dr5 Apoptosis Signaling',
    code: dr5ApoptosisSignaling,
    tags: ['example model'],
  },
  {
    id: 'dual-site-phosphorylation',
    name: 'dual site phosphorylation',
    description: 'Dual Site Phosphorylation',
    code: dualSitePhosphorylation,
    tags: ['example model'],
  },
  {
    id: 'e2f-rb-cell-cycle-switch',
    name: 'e2f rb cell cycle switch',
    description: 'E2f Rb Cell Cycle Switch',
    code: e2fRbCellCycleSwitch,
    tags: ['example model'],
  },
  {
    id: 'eco_coevolution_host_parasite',
    name: 'eco coevolution host parasite',
    description: 'Coevolution Host Parasite',
    code: ecoCoevolutionHostParasite,
    tags: ['example model'],
  },
  {
    id: 'eco_food_web_chaos_3sp',
    name: 'eco food web chaos 3sp',
    description: 'Food Web Chaos 3sp',
    code: ecoFoodWebChaos3sp,
    tags: ['example model'],
  },
  {
    id: 'eco_lotka_volterra_grid',
    name: 'eco lotka volterra grid',
    description: 'Lotka Volterra Grid',
    code: ecoLotkaVolterraGrid,
    tags: ['example model'],
  },
  {
    id: 'eco_mutualism_obligate',
    name: 'eco mutualism obligate',
    description: 'Mutualism Obligate',
    code: ecoMutualismObligate,
    tags: ['example model'],
  },
  {
    id: 'eco_rock_paper_scissors_spatial',
    name: 'eco rock paper scissors spatial',
    description: 'Rock Paper Scissors Spatial',
    code: ecoRockPaperScissorsSpatial,
    tags: ['example model'],
  },
  {
    id: 'egfr-signaling-pathway',
    name: 'egfr signaling pathway',
    description: 'Egfr Signaling Pathway',
    code: egfrSignalingPathway,
    tags: ['example model'],
  },
  {
    id: 'eif2a-stress-response',
    name: 'eif2a stress response',
    description: 'Eif2a Stress Response',
    code: eif2aStressResponse,
    tags: ['example model'],
  },
  {
    id: 'endosomal-sorting-rab',
    name: 'endosomal sorting rab',
    description: 'Endosomal Sorting Rab',
    code: endosomalSortingRab,
    tags: ['example model'],
  },
  {
    id: 'energy_allostery_mwc',
    name: 'energy allostery mwc',
    description: 'Allostery Mwc',
    code: energyAllosteryMwc,
    tags: ['example model'],
  },
  {
    id: 'energy_catalysis_mm',
    name: 'energy catalysis mm',
    description: 'Catalysis Mm',
    code: energyCatalysisMm,
    tags: ['example model'],
  },
  {
    id: 'energy_cooperativity_adh',
    name: 'energy cooperativity adh',
    description: 'Cooperativity Adh',
    code: energyCooperativityAdh,
    tags: ['example model'],
  },
  {
    id: 'energy_linear_chain',
    name: 'energy linear chain',
    description: 'Linear Chain',
    code: energyLinearChain,
    tags: ['example model'],
  },
  {
    id: 'energy_transport_pump',
    name: 'energy transport pump',
    description: 'Transport Pump',
    code: energyTransportPump,
    tags: ['example model'],
  },
  {
    id: 'er-stress-response',
    name: 'er stress response',
    description: 'Er Stress Response',
    code: erStressResponse,
    tags: ['example model'],
  },
  {
    id: 'erk-nuclear-translocation',
    name: 'erk nuclear translocation',
    description: 'Erk Nuclear Translocation',
    code: erkNuclearTranslocation,
    tags: ['example model'],
  },
  {
    id: 'feature_functional_rates_volume',
    name: 'feature functional rates volume',
    description: 'Functional Rates Volume',
    code: featureFunctionalRatesVolume,
    tags: ['example model'],
  },
  {
    id: 'feature_global_functions_scan',
    name: 'feature global functions scan',
    description: 'Global Functions Scan',
    code: featureGlobalFunctionsScan,
    tags: ['example model'],
  },
  {
    id: 'feature_local_functions_explicit',
    name: 'feature local functions explicit',
    description: 'Local Functions Explicit',
    code: featureLocalFunctionsExplicit,
    tags: ['example model'],
  },
  {
    id: 'feature_symmetry_factors_cyclic',
    name: 'feature symmetry factors cyclic',
    description: 'Symmetry Factors Cyclic',
    code: featureSymmetryFactorsCyclic,
    tags: ['example model'],
  },
  {
    id: 'feature_synthesis_degradation_ss',
    name: 'feature synthesis degradation ss',
    description: 'Synthesis Degradation Ss',
    code: featureSynthesisDegradationSs,
    tags: ['example model'],
  },
  {
    id: 'fgf-signaling-pathway',
    name: 'fgf signaling pathway',
    description: 'Fgf Signaling Pathway',
    code: fgfSignalingPathway,
    tags: ['example model'],
  },
  {
    id: 'gas6-axl-signaling',
    name: 'gas6 axl signaling',
    description: 'Gas6 Axl Signaling',
    code: gas6AxlSignaling,
    tags: ['example model'],
  },
  {
    id: 'gene-expression-toggle',
    name: 'gene expression toggle',
    description: 'Gene Expression Toggle',
    code: geneExpressionToggle,
    tags: ['example model'],
  },
  {
    id: 'genetic_bistability_energy',
    name: 'genetic bistability energy',
    description: 'Bistability Energy',
    code: geneticBistabilityEnergy,
    tags: ['example model'],
  },
  {
    id: 'genetic_dna_replication_stochastic',
    name: 'genetic dna replication stochastic',
    description: 'Dna Replication Stochastic',
    code: geneticDnaReplicationStochastic,
    tags: ['example model'],
  },
  {
    id: 'genetic_goodwin_oscillator',
    name: 'genetic goodwin oscillator',
    description: 'Goodwin Oscillator',
    code: geneticGoodwinOscillator,
    tags: ['example model'],
  },
  {
    id: 'genetic_translation_kinetics',
    name: 'genetic translation kinetics',
    description: 'Translation Kinetics',
    code: geneticTranslationKinetics,
    tags: ['example model'],
  },
  {
    id: 'genetic_turing_pattern_1d',
    name: 'genetic turing pattern 1d',
    description: 'Turing Pattern 1d',
    code: geneticTuringPattern1d,
    tags: ['example model'],
  },
  {
    id: 'glioblastoma-egfrviii-signaling',
    name: 'glioblastoma egfrviii signaling',
    description: 'Glioblastoma Egfrviii Signaling',
    code: glioblastomaEgfrviiiSignaling,
    tags: ['example model'],
  },
  {
    id: 'glycolysis-branch-point',
    name: 'glycolysis branch point',
    description: 'Glycolysis Branch Point',
    code: glycolysisBranchPoint,
    tags: ['example model'],
  },
  {
    id: 'gm_game_of_life',
    name: 'gm game of life',
    description: 'Game Of Life',
    code: gmGameOfLife,
    tags: ['example model'],
  },
  {
    id: 'gm_ray_marcher',
    name: 'gm ray marcher',
    description: 'Ray Marcher',
    code: gmRayMarcher,
    tags: ['example model'],
  },
  {
    id: 'gpcr-desensitization-arrestin',
    name: 'gpcr desensitization arrestin',
    description: 'Gpcr Desensitization Arrestin',
    code: gpcrDesensitizationArrestin,
    tags: ['example model'],
  },
  {
    id: 'hedgehog-signaling-pathway',
    name: 'hedgehog signaling pathway',
    description: 'Hedgehog Signaling Pathway',
    code: hedgehogSignalingPathway,
    tags: ['example model'],
  },
  {
    id: 'hematopoietic-growth-factor',
    name: 'hematopoietic growth factor',
    description: 'Hematopoietic Growth Factor',
    code: hematopoieticGrowthFactor,
    tags: ['example model'],
  },
  {
    id: 'hif1a_degradation_loop',
    name: 'hif1a degradation loop',
    description: 'Hif1a Degradation Loop',
    code: hif1aDegradationLoop,
    tags: ['example model'],
  },
  {
    id: 'hypoxia-response-signaling',
    name: 'hypoxia response signaling',
    description: 'Hypoxia Response Signaling',
    code: hypoxiaResponseSignaling,
    tags: ['example model'],
  },
  {
    id: 'il1b-signaling',
    name: 'il1b signaling',
    description: 'Il1b Signaling',
    code: il1bSignaling,
    tags: ['example model'],
  },
  {
    id: 'il6-jak-stat-pathway',
    name: 'il6 jak stat pathway',
    description: 'Il6 Jak Stat Pathway',
    code: il6JakStatPathway,
    tags: ['example model'],
  },
  {
    id: 'immune-synapse-formation',
    name: 'immune synapse formation',
    description: 'Immune Synapse Formation',
    code: immuneSynapseFormation,
    tags: ['example model'],
  },
  {
    id: 'inflammasome-activation',
    name: 'inflammasome activation',
    description: 'Inflammasome Activation',
    code: inflammasomeActivation,
    tags: ['example model'],
  },
  {
    id: 'inositol-phosphate-metabolism',
    name: 'inositol phosphate metabolism',
    description: 'Inositol Phosphate Metabolism',
    code: inositolPhosphateMetabolism,
    tags: ['example model'],
  },
  {
    id: 'insulin-glucose-homeostasis',
    name: 'insulin glucose homeostasis',
    description: 'Insulin Glucose Homeostasis',
    code: insulinGlucoseHomeostasis,
    tags: ['example model'],
  },
  {
    id: 'interferon-signaling',
    name: 'interferon signaling',
    description: 'Interferon Signaling',
    code: interferonSignaling,
    tags: ['example model'],
  },
  {
    id: 'ire1a-xbp1-er-stress',
    name: 'ire1a xbp1 er stress',
    description: 'Ire1a Xbp1 Er Stress',
    code: ire1aXbp1ErStress,
    tags: ['example model'],
  },
  {
    id: 'jak-stat-cytokine-signaling',
    name: 'jak stat cytokine signaling',
    description: 'Jak Stat Cytokine Signaling',
    code: jakStatCytokineSignaling,
    tags: ['example model'],
  },
  {
    id: 'jnk-mapk-signaling',
    name: 'jnk mapk signaling',
    description: 'Jnk Mapk Signaling',
    code: jnkMapkSignaling,
    tags: ['example model'],
  },
  {
    id: 'kir-channel-regulation',
    name: 'kir channel regulation',
    description: 'Kir Channel Regulation',
    code: kirChannelRegulation,
    tags: ['example model'],
  },
  {
    id: 'l-type-calcium-channel-dynamics',
    name: 'l type calcium channel dynamics',
    description: 'L Type Calcium Channel Dynamics',
    code: lTypeCalciumChannelDynamics,
    tags: ['example model'],
  },
  {
    id: 'lac-operon-regulation',
    name: 'lac operon regulation',
    description: 'Lac Operon Regulation',
    code: lacOperonRegulation,
    tags: ['example model'],
  },
  {
    id: 'lipid-mediated-pip3-signaling',
    name: 'lipid mediated pip3 signaling',
    description: 'Lipid Mediated Pip3 Signaling',
    code: lipidMediatedPip3Signaling,
    tags: ['example model'],
  },
  {
    id: 'mapk-signaling-cascade',
    name: 'mapk signaling cascade',
    description: 'Mapk Signaling Cascade',
    code: mapkSignalingCascade,
    tags: ['example model'],
  },
  {
    id: 'meta_formal_game_theory',
    name: 'meta formal game theory',
    description: 'Formal Game Theory',
    code: metaFormalGameTheory,
    tags: ['example model'],
  },
  {
    id: 'meta_formal_molecular_clock',
    name: 'meta formal molecular clock',
    description: 'Formal Molecular Clock',
    code: metaFormalMolecularClock,
    tags: ['example model'],
  },
  {
    id: 'meta_formal_petri_net',
    name: 'meta formal petri net',
    description: 'Formal Petri Net',
    code: metaFormalPetriNet,
    tags: ['example model'],
  },
  {
    id: 'michaelis-menten-kinetics',
    name: 'michaelis menten kinetics',
    description: 'Michaelis Menten Kinetics',
    code: michaelisMentenKinetics,
    tags: ['example model'],
  },
  {
    id: 'ml_gradient_descent',
    name: 'ml gradient descent',
    description: 'Gradient Descent',
    code: mlGradientDescent,
    tags: ['example model'],
  },
  {
    id: 'ml_hopfield',
    name: 'ml hopfield',
    description: 'Hopfield',
    code: mlHopfield,
    tags: ['example model'],
  },
  {
    id: 'ml_kmeans',
    name: 'ml kmeans',
    description: 'Kmeans',
    code: mlKmeans,
    tags: ['example model'],
  },
  {
    id: 'ml_q_learning',
    name: 'ml q learning',
    description: 'Q Learning',
    code: mlQLearning,
    tags: ['example model'],
  },
  {
    id: 'ml_svm',
    name: 'ml svm',
    description: 'Svm',
    code: mlSvm,
    tags: ['example model'],
  },
  {
    id: 'mt_arithmetic_compiler',
    name: 'mt arithmetic compiler',
    description: 'Arithmetic Compiler',
    code: mtArithmeticCompiler,
    tags: ['example model'],
  },
  {
    id: 'mt_bngl_interpreter',
    name: 'mt bngl interpreter',
    description: 'Bngl Interpreter',
    code: mtBnglInterpreter,
    tags: ['example model'],
  },
  {
    id: 'mt_music_sequencer',
    name: 'mt music sequencer',
    description: 'Music Sequencer',
    code: mtMusicSequencer,
    tags: ['example model'],
  },
  {
    id: 'mt_pascal_triangle',
    name: 'mt pascal triangle',
    description: 'Pascal Triangle',
    code: mtPascalTriangle,
    tags: ['example model'],
  },
  {
    id: 'mt_quine',
    name: 'mt quine',
    description: 'Quine',
    code: mtQuine,
    tags: ['example model'],
  },
  {
    id: 'mtor-signaling',
    name: 'mtor signaling',
    description: 'Mtor Signaling',
    code: mtorSignaling,
    tags: ['example model'],
  },
  {
    id: 'mtorc2-signaling',
    name: 'mtorc2 signaling',
    description: 'Mtorc2 Signaling',
    code: mtorc2Signaling,
    tags: ['example model'],
  },
  {
    id: 'myogenic-differentiation',
    name: 'myogenic differentiation',
    description: 'Myogenic Differentiation',
    code: myogenicDifferentiation,
    tags: ['example model'],
  },
  {
    id: 'negative-feedback-loop',
    name: 'negative feedback loop',
    description: 'Negative Feedback Loop',
    code: negativeFeedbackLoop,
    tags: ['example model'],
  },
  {
    id: 'neurotransmitter-release',
    name: 'neurotransmitter release',
    description: 'Neurotransmitter Release',
    code: neurotransmitterRelease,
    tags: ['example model'],
  },
  {
    id: 'nfkb-feedback',
    name: 'nfkb feedback',
    description: 'Nfkb Feedback',
    code: nfkbFeedback,
    tags: ['example model'],
  },
  {
    id: 'nfsim_aggregation_gelation',
    name: 'nfsim aggregation gelation',
    description: 'Aggregation Gelation',
    code: nfsimAggregationGelation,
    tags: ['example model'],
  },
  {
    id: 'nfsim_coarse_graining',
    name: 'nfsim coarse graining',
    description: 'Coarse Graining',
    code: nfsimCoarseGraining,
    tags: ['example model'],
  },
  {
    id: 'nfsim_dynamic_compartments',
    name: 'nfsim dynamic compartments',
    description: 'Dynamic Compartments',
    code: nfsimDynamicCompartments,
    tags: ['example model'],
  },
  {
    id: 'nfsim_hybrid_particle_field',
    name: 'nfsim hybrid particle field',
    description: 'Hybrid Particle Field',
    code: nfsimHybridParticleField,
    tags: ['example model'],
  },
  {
    id: 'nfsim_ring_closure_polymer',
    name: 'nfsim ring closure polymer',
    description: 'Ring Closure Polymer',
    code: nfsimRingClosurePolymer,
    tags: ['example model'],
  },
  {
    id: 'nn_xor',
    name: 'nn xor',
    description: 'Nn Xor',
    code: nnXor,
    tags: ['example model'],
  },
  {
    id: 'no-cgmp-signaling',
    name: 'no cgmp signaling',
    description: 'No Cgmp Signaling',
    code: noCgmpSignaling,
    tags: ['example model'],
  },
  {
    id: 'notch-delta-lateral-inhibition',
    name: 'notch delta lateral inhibition',
    description: 'Notch Delta Lateral Inhibition',
    code: notchDeltaLateralInhibition,
    tags: ['example model'],
  },
  {
    id: 'oxidative-stress-response',
    name: 'oxidative stress response',
    description: 'Oxidative Stress Response',
    code: oxidativeStressResponse,
    tags: ['example model'],
  },
  {
    id: 'p38-mapk-signaling',
    name: 'p38 mapk signaling',
    description: 'P38 Mapk Signaling',
    code: p38MapkSignaling,
    tags: ['example model'],
  },
  {
    id: 'p53-mdm2-oscillator',
    name: 'p53 mdm2 oscillator',
    description: 'P53 Mdm2 Oscillator',
    code: p53Mdm2Oscillator,
    tags: ['example model'],
  },
  {
    id: 'parp1-mediated-dna-repair',
    name: 'parp1 mediated dna repair',
    description: 'Parp1 Mediated Dna Repair',
    code: parp1MediatedDnaRepair,
    tags: ['example model'],
  },
  {
    id: 'ph_lorenz_attractor',
    name: 'ph lorenz attractor',
    description: 'Lorenz Attractor',
    code: phLorenzAttractor,
    tags: ['example model'],
  },
  {
    id: 'ph_nbody_gravity',
    name: 'ph nbody gravity',
    description: 'Nbody Gravity',
    code: phNbodyGravity,
    tags: ['example model'],
  },
  {
    id: 'ph_schrodinger',
    name: 'ph schrodinger',
    description: 'Schrodinger',
    code: phSchrodinger,
    tags: ['example model'],
  },
  {
    id: 'ph_wave_equation',
    name: 'ph wave equation',
    description: 'Wave Equation',
    code: phWaveEquation,
    tags: ['example model'],
  },
  {
    id: 'phosphorelay-chain',
    name: 'phosphorelay chain',
    description: 'Phosphorelay Chain',
    code: phosphorelayChain,
    tags: ['example model'],
  },
  {
    id: 'platelet-activation',
    name: 'platelet activation',
    description: 'Platelet Activation',
    code: plateletActivation,
    tags: ['example model'],
  },
  {
    id: 'predator-prey-dynamics',
    name: 'predator prey dynamics',
    description: 'Predator Prey Dynamics',
    code: predatorPreyDynamics,
    tags: ['example model'],
  },
  {
    id: 'process_actin_treadmilling',
    name: 'process actin treadmilling',
    description: 'Actin Treadmilling',
    code: processActinTreadmilling,
    tags: ['example model'],
  },
  {
    id: 'process_autophagy_flux',
    name: 'process autophagy flux',
    description: 'Autophagy Flux',
    code: processAutophagyFlux,
    tags: ['example model'],
  },
  {
    id: 'process_cell_adhesion_strength',
    name: 'process cell adhesion strength',
    description: 'Cell Adhesion Strength',
    code: processCellAdhesionStrength,
    tags: ['example model'],
  },
  {
    id: 'process_kinetic_proofreading_tcr',
    name: 'process kinetic proofreading tcr',
    description: 'Kinetic Proofreading Tcr',
    code: processKineticProofreadingTcr,
    tags: ['example model'],
  },
  {
    id: 'process_quorum_sensing_switch',
    name: 'process quorum sensing switch',
    description: 'Quorum Sensing Switch',
    code: processQuorumSensingSwitch,
    tags: ['example model'],
  },
  {
    id: 'quorum-sensing-circuit',
    name: 'quorum sensing circuit',
    description: 'Quorum Sensing Circuit',
    code: quorumSensingCircuit,
    tags: ['example model'],
  },
  {
    id: 'rab-gtpase-cycle',
    name: 'rab gtpase cycle',
    description: 'Rab Gtpase Cycle',
    code: rabGtpaseCycle,
    tags: ['example model'],
  },
  {
    id: 'rankl-rank-signaling',
    name: 'rankl rank signaling',
    description: 'Rankl Rank Signaling',
    code: ranklRankSignaling,
    tags: ['example model'],
  },
  {
    id: 'ras-gef-gap-cycle',
    name: 'ras gef gap cycle',
    description: 'Ras Gef Gap Cycle',
    code: rasGefGapCycle,
    tags: ['example model'],
  },
  {
    id: 'repressilator-oscillator',
    name: 'repressilator oscillator',
    description: 'Repressilator Oscillator',
    code: repressilatorOscillator,
    tags: ['example model'],
  },
  {
    id: 'retinoic-acid-signaling',
    name: 'retinoic acid signaling',
    description: 'Retinoic Acid Signaling',
    code: retinoicAcidSignaling,
    tags: ['example model'],
  },
  {
    id: 'rho-gtpase-actin-cytoskeleton',
    name: 'rho gtpase actin cytoskeleton',
    description: 'Rho Gtpase Actin Cytoskeleton',
    code: rhoGtpaseActinCytoskeleton,
    tags: ['example model'],
  },
  {
    id: 'shp2-phosphatase-regulation',
    name: 'shp2 phosphatase regulation',
    description: 'Shp2 Phosphatase Regulation',
    code: shp2PhosphataseRegulation,
    tags: ['example model'],
  },
  {
    id: 'signal-amplification-cascade',
    name: 'signal amplification cascade',
    description: 'Signal Amplification Cascade',
    code: signalAmplificationCascade,
    tags: ['example model'],
  },
  {
    id: 'simple-dimerization',
    name: 'simple dimerization',
    description: 'Simple Dimerization',
    code: simpleDimerization,
    tags: ['example model'],
  },
  {
    id: 'sir-epidemic-model',
    name: 'sir epidemic model',
    description: 'Sir Epidemic Model',
    code: sirEpidemicModel,
    tags: ['example model'],
  },
  {
    id: 'smad-tgf-beta-signaling',
    name: 'smad tgf beta signaling',
    description: 'Smad Tgf Beta Signaling',
    code: smadTgfBetaSignaling,
    tags: ['example model'],
  },
  {
    id: 'sonic-hedgehog-gradient',
    name: 'sonic hedgehog gradient',
    description: 'Sonic Hedgehog Gradient',
    code: sonicHedgehogGradient,
    tags: ['example model'],
  },
  {
    id: 'sp_fourier_synthesizer',
    name: 'sp fourier synthesizer',
    description: 'Fourier Synthesizer',
    code: spFourierSynthesizer,
    tags: ['example model'],
  },
  {
    id: 'sp_image_convolution',
    name: 'sp image convolution',
    description: 'Image Convolution',
    code: spImageConvolution,
    tags: ['example model'],
  },
  {
    id: 'sp_kalman_filter',
    name: 'sp kalman filter',
    description: 'Kalman Filter',
    code: spKalmanFilter,
    tags: ['example model'],
  },
  {
    id: 'stat3-mediated-transcription',
    name: 'stat3 mediated transcription',
    description: 'Stat3 Mediated Transcription',
    code: stat3MediatedTranscription,
    tags: ['example model'],
  },
  {
    id: 'stress-response-adaptation',
    name: 'stress response adaptation',
    description: 'Stress Response Adaptation',
    code: stressResponseAdaptation,
    tags: ['example model'],
  },
  {
    id: 'synaptic-plasticity-ltp',
    name: 'synaptic plasticity ltp',
    description: 'Synaptic Plasticity Ltp',
    code: synapticPlasticityLtp,
    tags: ['example model'],
  },
  {
    id: 'synbio_band_pass_filter',
    name: 'synbio band pass filter',
    description: 'Band Pass Filter',
    code: synbioBandPassFilter,
    tags: ['example model'],
  },
  {
    id: 'synbio_counter_molecular',
    name: 'synbio counter molecular',
    description: 'Counter Molecular',
    code: synbioCounterMolecular,
    tags: ['example model'],
  },
  {
    id: 'synbio_edge_detector',
    name: 'synbio edge detector',
    description: 'Edge Detector',
    code: synbioEdgeDetector,
    tags: ['example model'],
  },
  {
    id: 'synbio_logic_gates_enzymatic',
    name: 'synbio logic gates enzymatic',
    description: 'Logic Gates Enzymatic',
    code: synbioLogicGatesEnzymatic,
    tags: ['example model'],
  },
  {
    id: 'synbio_oscillator_synchronization',
    name: 'synbio oscillator synchronization',
    description: 'Oscillator Synchronization',
    code: synbioOscillatorSynchronization,
    tags: ['example model'],
  },
  {
    id: 't-cell-activation',
    name: 't cell activation',
    description: 'T Cell Activation',
    code: tCellActivation,
    tags: ['example model'],
  },
  {
    id: 'tlr3-dsrna-sensing',
    name: 'tlr3 dsrna sensing',
    description: 'Tlr3 Dsrna Sensing',
    code: tlr3DsrnaSensing,
    tags: ['example model'],
  },
  {
    id: 'tnf-induced-apoptosis',
    name: 'tnf induced apoptosis',
    description: 'Tnf Induced Apoptosis',
    code: tnfInducedApoptosis,
    tags: ['example model'],
  },
  {
    id: 'two-component-system',
    name: 'two component system',
    description: 'Two Component System',
    code: twoComponentSystem,
    tags: ['example model'],
  },
  {
    id: 'vegf-angiogenesis',
    name: 'vegf angiogenesis',
    description: 'Vegf Angiogenesis',
    code: vegfAngiogenesis,
    tags: ['example model'],
  },
  {
    id: 'viral-sensing-innate-immunity',
    name: 'viral sensing innate immunity',
    description: 'Viral Sensing Innate Immunity',
    code: viralSensingInnateImmunity,
    tags: ['example model'],
  },
  {
    id: 'wacky_alchemy_stone',
    name: 'wacky alchemy stone',
    description: 'Alchemy Stone',
    code: wackyAlchemyStone,
    tags: ['example model'],
  },
  {
    id: 'wacky_black_hole',
    name: 'wacky black hole',
    description: 'Black Hole',
    code: wackyBlackHole,
    tags: ['example model'],
  },
  {
    id: 'wacky_bouncing_ball',
    name: 'wacky bouncing ball',
    description: 'Bouncing Ball',
    code: wackyBouncingBall,
    tags: ['example model'],
  },
  {
    id: 'wacky_traffic_jam_asep',
    name: 'wacky traffic jam asep',
    description: 'Traffic Jam Asep',
    code: wackyTrafficJamAsep,
    tags: ['example model'],
  },
  {
    id: 'wacky_zombie_infection',
    name: 'wacky zombie infection',
    description: 'Zombie Infection',
    code: wackyZombieInfection,
    tags: ['example model'],
  },
  {
    id: 'wnt-beta-catenin-signaling',
    name: 'wnt beta catenin signaling',
    description: 'Wnt Beta Catenin Signaling',
    code: wntBetaCateninSignaling,
    tags: ['example model'],
  },
  {
    id: 'wound-healing-pdgf-signaling',
    name: 'wound healing pdgf signaling',
    description: 'Wound Healing Pdgf Signaling',
    code: woundHealingPdgfSignaling,
    tags: ['example model'],
  }
];

const NATIVE_TUTORIALS: Example[] = [
  {
    id: 'AB',
    name: 'AB',
    description: 'Bivalent binding',
    code: ABTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC',
    name: 'ABC',
    description: 'Cooperative binding',
    code: ABCTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC_scan',
    name: 'ABC Scan',
    description: 'Cooperative (scan)',
    code: ABCScanTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABC_ssa',
    name: 'ABC Ssa',
    description: 'Cooperative (SSA)',
    code: ABCSsaTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LV',
    name: 'LV',
    description: 'Predator-prey',
    code: LVTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABp',
    name: 'ABp',
    description: 'Phosphorylation logic',
    code: ABpTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ABp_approx',
    name: 'ABp Approx',
    description: 'Phosphorylation (approx)',
    code: ABpApproxTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'GK',
    name: 'GK',
    description: 'Goldbeter-Koshland',
    code: GKTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Lisman',
    name: 'Lisman',
    description: 'Lisman bistable',
    code: LismanTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Lisman_bifurcate',
    name: 'Lisman Bifurcate',
    description: 'Lisman bifurcation',
    code: LismanBifurcateTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB',
    name: 'BAB',
    description: 'Trivalent binding',
    code: BABTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB_coop',
    name: 'BAB Coop',
    description: 'Trivalent (coop)',
    code: BABCoopTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'BAB_scan',
    name: 'BAB Scan',
    description: 'Trivalent (scan)',
    code: BABScanTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'blbr',
    name: 'BLBR Tutorial',
    description: 'Bivalent ligand/receptor (tutorial)',
    code: BLBRTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'cBNGL_simple',
    name: 'CBNGL Simple',
    description: 'Simple compartmental',
    code: cBNGLSimpleTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LR',
    name: 'LR',
    description: 'Ligand-receptor',
    code: LRTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LRR',
    name: 'LRR',
    description: 'Receptor recruitment',
    code: LRRTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LRR_comp',
    name: 'LRR Comp',
    description: 'Compartmental LRR',
    code: LRRCompTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LR_comp',
    name: 'LR Comp',
    description: 'Compartmental LR',
    code: LRCompTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'LV_comp',
    name: 'LV Comp',
    description: 'Compartmental LV',
    code: LVCompTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'organelle_transport',
    name: 'Organelle Transport',
    description: 'Organelle transport',
    code: organelleTransportTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'organelle_transport_struct',
    name: 'Organelle Transport Struct',
    description: 'Transport (struct)',
    code: organelleTransportStructTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Chylek_library',
    name: 'Chylek Library',
    description: 'Signaling library',
    code: ChylekLibraryTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Creamer_2012',
    name: 'Creamer 2012',
    description: 'Aggregation model',
    code: Creamer2012Tutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'egfr_simple',
    name: 'Egfr Simple',
    description: 'Basic EGFR model',
    code: egfrSimpleTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'FceRI_ji',
    name: 'FceRI Ji',
    description: 'FcÃŽÂµRI signaling',
    code: FceRIJiTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Suderman_2013',
    name: 'Suderman 2013',
    description: 'Signaling model',
    code: Suderman2013Tutorial,
    tags: ['published', 'tutorial', 'native'],
  },

  {
    id: 'birth-death',
    name: 'Birth-Death',
    description: 'Stochastic process',
    code: birthDeathTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'CircadianOscillator',
    name: 'CircadianOscillator',
    description: 'Circadian rhythm',
    code: CircadianOscillatorTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'ComplexDegradation',
    name: 'ComplexDegradation',
    description: 'Degradation model',
    code: ComplexDegradationTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'Repressilator',
    name: 'Repressilator',
    description: 'Repressilator circuit',
    code: RepressilatorTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'toggle',
    name: 'Toggle',
    description: 'Toggle switch',
    code: toggleTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'FceRI_viz',
    name: 'FceRI Viz',
    description: 'FcÃŽÂµRI (viz)',
    code: FceRIVizTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'visualize',
    name: 'Visualize',
    description: 'Visualization toy',
    code: visualizeTutorial,
    tags: ['published', 'tutorial', 'native'],
  },
  {
    id: 'SIR',
    name: 'SIR',
    description: 'Epidemic model (tutorial)',
    code: SIRTutorial,
    tags: ['published', 'epidemiology'],
  },

  {
    id: 'quasi_equilibrium',
    name: 'quasi equilibrium',
    description: 'Quasi-equilibrium approximation',
    code: quasiEquilibrium,
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
    code: model_CaOscillate_Func,
    tags: ['validation'],
  },
  {
    id: 'CaOscillate_Sat',
    name: 'CaOscillate_Sat',
    description: 'Calcium oscillations (sat)',
    code: model_CaOscillate_Sat,
    tags: ['validation'],
  },
  {
    id: 'catalysis',
    name: 'catalysis',
    description: 'Catalysis in energy BNG',
    code: model_catalysis,
    tags: ['validation'],
  },
  {
    id: 'continue',
    name: 'continue',
    description: 'Test trajectory continuation',
    code: model_continue,
    tags: ['validation'],
  },
  {
    id: 'egfr_net',
    name: 'egfr_net',
    description: 'check detailed balanced',
    code: model_egfr_net,
    tags: ['validation'],
  },
  {
    id: 'egfr_net_red',
    name: 'egfr_net_red',
    description: 'Reduced state-space version of EGFR_NET.BNGL with equivalent ODE dynamics',
    code: model_egfr_net_red,
    tags: ['validation'],
  },
  {
    id: 'egfr_path',
    name: 'egfr_path',
    description: 'The primary focus of the model developed by Kholodenko',
    code: model_egfr_path,
    tags: ['validation'],
  },
  {
    id: 'energy_example1',
    name: 'energy_example1',
    description: 'Illustration of energy modeling approach w/ a simple protein scaffold model',
    code: model_energy_example1,
    tags: ['validation'],
  },
  {
    id: 'example1',
    name: 'example1',
    description: 'Example file for BNG2 tutorial.',
    code: model_example1,
    tags: ['validation'],
  },
  {
    id: 'fceri_ji_comp',
    name: 'fceri_ji_comp',
    description: 'Ligand-receptor binding',
    code: model_fceri_ji_comp,
    tags: ['validation'],
  },
  {
    id: 'Haugh2b',
    name: 'Haugh2b',
    description: 'R(KD,Y1~U,Y2~U) 1.00',
    code: model_Haugh2b,
    tags: ['validation'],
  },
  {
    id: 'heise',
    name: 'heise',
    description: 'Validate state inheritance in a symmetric context',
    code: model_heise,
    tags: ['validation'],
  },
  {
    id: 'issue_198_short',
    name: 'issue_198_short',
    description: 'No description available',
    code: model_issue_198_short,
    tags: ['validation'],
  },
  {
    id: 'Kiefhaber_emodel',
    name: 'Kiefhaber_emodel',
    description: 'Allow molar units to be used for bimolecular rate constants',
    code: model_Kiefhaber_emodel,
    tags: ['validation'],
  },
  {
    id: 'Korwek_2023',
    name: 'Korwek_2023',
    description: 'This BioNetGen file features the article:',
    code: model_Korwek_2023,
    tags: ['validation'],
  },
  {
    id: 'localfunc',
    name: 'localfunc',
    description: 'Test local function expansion',
    code: model_localfunc,
    tags: ['validation'],
  },
  {
    id: 'michment',
    name: 'michment',
    description: 'Michaelis Menten',
    code: model_michment,
    tags: ['validation'],
  },
  {
    id: 'michment_cont',
    name: 'michment_cont',
    description: 'Michaelis Menten Continue',
    code: model_michment_cont,
    tags: ['validation'],
  },
  {
    id: 'Motivating_example',
    name: 'Motivating_example',
    description: 'Signal Transduction with receptor internalization',
    code: model_Motivating_example,
    tags: ['validation'],
  },
  {
    id: 'Motivating_example_cBNGL',
    name: 'Motivating_example_cBNGL',
    description: 'Signal transduction with receptor internalization',
    code: model_Motivating_example_cBNGL,
    tags: ['validation'],
  },
  {
    id: 'motor',
    name: 'motor',
    description: 'Motor protein',
    code: model_motor,
    tags: ['validation'],
  },
  {
    id: 'mwc',
    name: 'mwc',
    description: 'Monod-Wyman-Changeux model',
    code: model_mwc,
    tags: ['validation'],
  },
  {
    id: 'nfkb',
    name: 'nfkb',
    description: 'NF-kB signaling pathway',
    code: model_nfkb,
    tags: ['validation'],
  },
  {
    id: 'nfkb_illustrating_protocols',
    name: 'nfkb_illustrating_protocols',
    description: 'NF-kB signaling pathway',
    code: model_nfkb_illustrating_protocols,
    tags: ['validation'],
  },
  {
    id: 'rec_dim',
    name: 'rec_dim',
    description: 'Ligand-receptor binding',
    code: model_rec_dim,
    tags: ['validation'],
  },
  {
    id: 'rec_dim_comp',
    name: 'rec_dim_comp',
    description: 'name dimension volume contained_by',
    code: model_rec_dim_comp,
    tags: ['validation'],
  },
  {
    id: 'SHP2_base_model',
    name: 'SHP2_base_model',
    description: 'Base model of Shp2 regulation',
    code: model_SHP2_base_model,
    tags: ['validation'],
  },
  {
    id: 'simple_sbml_import',
    name: 'simple_sbml_import',
    description: 'SBML import test',
    code: model_simple_sbml_import,
    tags: ['validation'],
  },
  {
    id: 'simple_system',
    name: 'simple_system',
    description: 'Simple binding system',
    code: model_simple_system,
    tags: ['validation'],
  },
  {
    id: 'test_ANG_synthesis_simple',
    name: 'test_ANG_synthesis_simple',
    description: 'Synthesis network test',
    code: model_test_ANG_synthesis_simple,
    tags: ['validation'],
  },
  {
    id: 'test_fixed',
    name: 'test_fixed',
    description: '# actions ##',
    code: model_test_fixed,
    tags: ['validation'],
  },
  {
    id: 'test_MM',
    name: 'test_MM',
    description: 'Kinetic constants',
    code: model_test_MM,
    tags: ['validation'],
  },
  {
    id: 'test_mratio',
    name: 'test_mratio',
    description: 'Reaction ratio test',
    code: model_test_mratio,
    tags: ['validation'],
  },
  {
    id: 'test_network_gen',
    name: 'test_network_gen',
    description: 'fceri model with network generation',
    code: model_test_network_gen,
    tags: ['validation'],
  },
  {
    id: 'test_sat',
    name: 'test_sat',
    description: 'Kinetic constants',
    code: model_test_sat,
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_cBNGL_simple',
    name: 'test_synthesis_cBNGL_simple',
    description: 'Compartmental synthesis',
    code: model_test_synthesis_cBNGL_simple,
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex',
    name: 'test_synthesis_complex',
    description: 'Complex synthesis test',
    code: model_test_synthesis_complex,
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex_0_cBNGL',
    name: 'test_synthesis_complex_0_cBNGL',
    description: 'volume-surface',
    code: model_test_synthesis_complex_0_cBNGL,
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_complex_source_cBNGL',
    name: 'test_synthesis_complex_source_cBNGL',
    description: 'volume-surface',
    code: model_test_synthesis_complex_source_cBNGL,
    tags: ['validation'],
  },
  {
    id: 'test_synthesis_simple',
    name: 'test_synthesis_simple',
    description: 'Simple synthesis test',
    code: model_test_synthesis_simple,
    tags: ['validation'],
  },
  {
    id: 'tlmr',
    name: 'tlmr',
    description: 'Trivalent ligand monovalent receptor',
    code: model_tlmr,
    tags: ['validation'],
  },
  {
    id: 'toy-jim',
    name: 'toy-jim',
    description: 'The model consists of a monovalent extracellular ligand,',
    code: model_toy_jim,
    tags: ['validation'],
  },
  {
    id: 'univ_synth',
    name: 'univ_synth',
    description: 'example of universal synthesis',
    code: model_univ_synth,
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
