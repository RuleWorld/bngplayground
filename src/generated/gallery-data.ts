// AUTO-GENERATED — DO NOT EDIT
// Source: RuleHub manifest-slim.json + gallery.json
// Generated: 2026-05-28T17:09:25.413Z

import type { Example } from '@bngplayground/engine';

export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  models: Example[];
}

const ALL_MODELS: Example[] = [
    { id: "AB", name: "AB", description: "Two-species binding", tags: ["ab"] },
    { id: "ABC", name: "ABC", description: "Three-species cascade", tags: ["abc"] },
    { id: "ABC_scan", name: "ABC scan", description: "Two-species binding", tags: ["abc"] },
    { id: "ABC_ssa", name: "ABC ssa", description: "Three-species (SSA)", tags: ["abc","ssa"] },
    { id: "ABp", name: "ABp", description: "Phosphorylation cycle", tags: ["abp"] },
    { id: "ABp_approx", name: "ABp approx", description: "MM approximation", tags: ["abp","km"] },
    { id: "akt-signaling", name: "akt signaling", description: "AKT-mTOR growth signaling", tags: ["akt","signaling","growthfactor","rtk","pi3k","mtorc2","mtorc1","s6k"] },
    { id: "allosteric-activation", name: "allosteric activation", description: "Allosteric enzyme activation", tags: ["allosteric","activation","enzyme","substrate","activator","product"] },
    { id: "ampk-signaling", name: "ampk signaling", description: "AMPK energy sensing", tags: ["ampk","signaling","amp","lkb1","ca","sik","crtc"] },
    { id: "An_TLR4_2009", name: "An et al. 2009: TLR4 Signaling Model", description: "TLR4 signaling", tags: ["tlr4","immune-signaling","innate-immunity","2009","an"] },
    { id: "apoptosis-cascade", name: "apoptosis cascade", description: "Integrated apoptosis cascade", tags: ["apoptosis","cascade","deathligand","caspase8","bid","mito","apaf1","caspase3","xiap","smac"] },
    { id: "auto-activation-loop", name: "auto activation loop", description: "Positive feedback loop", tags: ["auto","activation","loop","gene","mrna","protein","rbp"] },
    { id: "autophagy-regulation", name: "autophagy regulation", description: "mTOR-AMPK autophagy switch", tags: ["autophagy","regulation","mtor","ampk","ulk1","lc3","p62"] },
    { id: "BAB", name: "BAB", description: "Bivalent ligand binding", tags: ["bab"] },
    { id: "BAB_coop", name: "BAB coop", description: "Cooperative bivalent binding", tags: ["bab","coop"] },
    { id: "BAB_scan", name: "BAB scan", description: "Bivalent ligand binding", tags: ["bab"] },
    { id: "Barua_bcat_2013", name: "Barua et al. 2013: Beta-Catenin Regulation Model", description: "Beta-catenin destruction", tags: ["beta-catenin","regulation","wnt-signaling","2013","barua"] },
    { id: "Barua_BCR_2012", name: "Barua et al. 2012: BCR Signaling Model", description: "BCR signaling", tags: ["bcr","immune-signaling","b-cell","2012","barua"] },
    { id: "Barua_EGFR_2007", name: "Barua et al. 2007: EGFR Signaling Model", description: "Model from Haugh (2006)", tags: ["egfr","signaling","2007","barua"] },
    { id: "Barua_FceRI_2012", name: "Barua et al. 2012: FceRI Signaling Model", description: "FcÃƒÅ½Ã‚ÂµRI signaling", tags: ["fceri","immune-signaling","mast-cell","2012","barua"] },
    { id: "Barua_JAK2_2009", name: "Barua et al. 2009: JAK2-STAT5 Signaling Model", description: "JAK2-SH2B signaling", tags: ["jak2","stat5","signaling","2009","barua"] },
    { id: "bcr-signaling", name: "bcr signaling", description: "B-cell receptor cascade", tags: ["bcr","signaling","antigen","syk","plcg2","cd22","shp1","calcium"] },
    { id: "beta-adrenergic-response", name: "beta adrenergic response", description: "GPCR beta-adrenergic signaling", tags: ["beta","adrenergic","response","epi","betar","gs","ac","arr","camp"] },
    { id: "birth-death", name: "Birth-Death", description: "Stochastic birth-death", tags: ["birth","death"] },
    { id: "bistable-toggle-switch", name: "bistable toggle switch", description: "Bistable gene switch", tags: ["bistable","toggle","switch","proml","promr","tf_l","tf_r","ind_l","ind_r"] },
    { id: "BLBR", name: "BLBR", description: "Bivalent ligand-receptor", tags: ["blbr"] },
    { id: "Blinov_egfr_2006", name: "Blinov et al. 2006: EGFR Signaling Pathway (ODE)", description: "Phosphotyrosine signaling", tags: ["egfr","signaling","ode","receptor-activation","2006","blinov"] },
    { id: "Blinov_egfr_NF_2006", name: "Blinov et al. 2006: EGFR Signaling Pathway (NFsim)", description: "EGFR signaling model", tags: ["egfr","signaling","nfsim","receptor-activation","2006","blinov"] },
    { id: "Blinov_ran_2006", name: "Blinov et al. 2006: Ran-Mediated Nuclear Transport (NFsim)", description: "Ran GTPase cycle", tags: ["ran-gtpase","nuclear-transport","nfsim","2006","blinov"] },
    { id: "blood-coagulation-thrombin", name: "blood coagulation thrombin", description: "Thrombin coagulation cascade", tags: ["blood","coagulation","thrombin","tf","factorx","factorv","prothrombin","fibrinogen","at"] },
    { id: "bmp-signaling", name: "bmp signaling", description: "BMP-Smad gradient relay", tags: ["bmp","signaling","noggin","receptor1","receptor2","smad1","smad4","smad6"] },
    { id: "brusselator-oscillator", name: "brusselator oscillator", description: "Autocatalytic chemical oscillator", tags: ["brusselator","oscillator"] },
    { id: "calcineurin-nfat-pathway", name: "calcineurin nfat pathway", description: "Calcium-NFAT nuclear translocation", tags: ["calcineurin","nfat","pathway","ca","cam","can","rcan1"] },
    { id: "calcium-spike-signaling", name: "calcium spike signaling", description: "IP3-driven calcium spikes", tags: ["calcium","spike","signaling","plc","ip3","ca","stim1"] },
    { id: "CaOscillate_Func", name: "CaOscillate_Func", description: "Calcium oscillations (func)", tags: ["caoscillate","ga","plc","ca"] },
    { id: "CaOscillate_Sat", name: "CaOscillate_Sat", description: "Calcium oscillations (sat)", tags: ["caoscillate","sat","ga","plc","ca"] },
    { id: "caspase-activation-loop", name: "caspase activation loop", description: "Caspase feedback loop", tags: ["caspase","activation","loop","deathligand","caspase8","caspase3","iap","flip"] },
    { id: "catalysis", name: "catalysis", description: "Enzyme catalysis (BNGE)", tags: ["catalysis","pptase","atp","adp"] },
    { id: "cBNGL_simple", name: "cBNGL simple", description: "Compartment signaling", tags: ["cbngl","simple","tf","dna","mrna"] },
    { id: "cd40-signaling", name: "cd40 signaling", description: "CD40 B-cell activation", tags: ["cd40","signaling","cd40l","traf","ikk","nik","nfkb","relb"] },
    { id: "cell-cycle-checkpoint", name: "cell cycle checkpoint", description: "Mitotic CDK1 checkpoint", tags: ["cell","cycle","checkpoint","cyclin","cdk","cdc25","wee1","apc","p21"] },
    { id: "Chattaraj_nephrin_2021", name: "Chattaraj et al. 2021: Nephrin-Nck-NWASP Clustering Model", description: "NFkB oscillations", tags: ["nephrin","nck","nwasp","clustering","2021","chattaraj"] },
    { id: "checkpoint-kinase-signaling", name: "checkpoint kinase signaling", description: "ATM/ATR DNA checkpoint", tags: ["checkpoint","kinase","signaling","dna","atm","atr","chk1","chk2","p53","cdc25"] },
    { id: "Cheemalavagu_JAKSTAT_2024", name: "Cheemalavagu et al. 2024: JAK-STAT Signaling Model", description: "JAK-STAT signaling", tags: ["jak-stat","signaling","2024","cheemalavagu"] },
    { id: "chemistry", name: "chemistry", description: "Basic reaction kinetics", tags: ["tutorials","chemistry"] },
    { id: "chemotaxis-signal-transduction", name: "chemotaxis signal transduction", description: "Bacterial chemotaxis adaptation", tags: ["chemotaxis","signal","transduction","attr","mcp","chea","chey","cheb","motor"] },
    { id: "Chylek_FceRI_2014", name: "Chylek et al. 2014: FceRI Signaling Model", description: "FceRI signaling", tags: ["fceri","immune-signaling","mast-cell","2014","chylek"] },
    { id: "Chylek_library", name: "Chylek library", description: "FcεRI library model", tags: ["chylek","library","sink","pre","pag1"] },
    { id: "Chylek_TCR_2014", name: "Chylek et al. 2014: T Cell Receptor (TCR) Signaling Model", description: "TCR signaling", tags: ["tcr","immune-signaling","t-cell","2014","chylek"] },
    { id: "circadian-oscillator", name: "circadian oscillator", description: "Vilar circadian oscillator", tags: ["circadian","oscillator","pa","pr","mrna_a","mrna_r"] },
    { id: "CircadianOscillator", name: "CircadianOscillator", description: "Circadian rhythm", tags: ["circadianoscillator","pa","pr","mrna_a","mrna_r"] },
    { id: "clock-bmal1-gene-circuit", name: "clock bmal1 gene circuit", description: "BMAL1-CLOCK circadian circuit", tags: ["clock","bmal1","gene","circuit","ror","reverb","dna"] },
    { id: "compartment_endocytosis", name: "compartment endocytosis", description: "Receptor endocytosis", tags: ["compartment","endocytosis"] },
    { id: "compartment_membrane_bound", name: "compartment membrane bound", description: "Membrane-bound signaling", tags: ["compartment","membrane","bound","lipid"] },
    { id: "compartment_nested_transport", name: "compartment nested transport", description: "Nested compartment transport", tags: ["compartment","nested","transport"] },
    { id: "compartment_nuclear_transport", name: "compartment nuclear transport", description: "Nuclear TF transport", tags: ["compartment","nuclear","transport","tf"] },
    { id: "compartment_organelle_exchange", name: "compartment organelle exchange", description: "Organelle cargo exchange", tags: ["compartment","organelle","exchange","cargo"] },
    { id: "competitive-enzyme-inhibition", name: "competitive enzyme inhibition", description: "Competitive enzyme inhibition", tags: ["competitive","enzyme","inhibition","substrate1","substrate2","inhibitor","product"] },
    { id: "complement-activation-cascade", name: "complement activation cascade", description: "Alternative complement pathway", tags: ["complement","activation","cascade","c3","fb","c5","mac","surf"] },
    { id: "ComplexDegradation", name: "ComplexDegradation", description: "Complex degradation", tags: ["complexdegradation"] },
    { id: "contact-inhibition-hippo-yap", name: "contact inhibition hippo yap", description: "Hippo-YAP contact inhibition", tags: ["contact","inhibition","hippo","yap","mst","lats","tead"] },
    { id: "continue", name: "continue", description: "Trajectory continuation", tags: ["continue"] },
    { id: "cooperative-binding", name: "cooperative binding", description: "Hill cooperative binding", tags: ["cooperative","binding","receptor","ligand","competitor"] },
    { id: "Creamer_2012", name: "Creamer 2012", description: "ErbB receptor signaling", tags: ["creamer","2012","egf","hrg","egfr","erbb2","erbb3","erbb4","grb2"] },
    { id: "cs_diffie_hellman", name: "cs diffie hellman", description: "Diffie-Hellman key exchange", tags: ["cs","diffie","hellman","agent","target","dshareda_dt","dsharedb_dt"] },
    { id: "cs_hash_function", name: "cs hash function", description: "Cryptographic hash function", tags: ["cs","hash","function","b0","b1","b2","b3","h0","h1","h2","h3"] },
    { id: "cs_huffman", name: "cs huffman", description: "Huffman encoding", tags: ["cs","huffman","char","hnode"] },
    { id: "cs_monte_carlo_pi", name: "cs monte carlo pi", description: "Monte Carlo pi", tags: ["cs","monte","carlo","pi","trial","pi_estimate"] },
    { id: "cs_pagerank", name: "cs pagerank", description: "PageRank algorithm", tags: ["cs","pagerank","teleport","page"] },
    { id: "cs_pid_controller", name: "cs pid controller", description: "PID controller", tags: ["cs","pid","controller","sensor","accumulator","leakyerror","actuator","disturbance"] },
    { id: "cs_regex_nfa", name: "cs regex nfa", description: "Regex NFA model", tags: ["cs","regex","nfa","state","char"] },
    { id: "Dembo_blbr_1978", name: "Dembo et al. 1978: Bivalent Ligand Bivalent Receptor (BLBR) Model", description: "Dembo blbr", tags: ["blbr","ligand-receptor","binding","1978","dembo"] },
    { id: "dna-damage-repair", name: "dna damage repair", description: "ATM-CHK2-p53 repair", tags: ["dna","damage","repair","mrn","atm","chk2","repaircomplex"] },
    { id: "dna-methylation-dynamics", name: "dna methylation dynamics", description: "CpG methylation dynamics", tags: ["dna","methylation","dynamics","cpg","dnmt1","tet"] },
    { id: "Dolan_Insulin_2015_Dolan_2015", name: "Dolan et al. 2015: Insulin Receptor Signaling Model (Dolan_2015)", description: "Insulin signaling", tags: ["insulin","metabolism","2015","dolan"] },
    { id: "Dolan_Insulin_2015_Dolan2015", name: "Dolan et al. 2015: Insulin Receptor Signaling Model (Dolan2015)", description: "Insulin signaling", tags: ["insulin","metabolism","2015","dolan"] },
    { id: "dr5-apoptosis-signaling", name: "dr5 apoptosis signaling", description: "TRAIL-DISC extrinsic apoptosis", tags: ["dr5","apoptosis","signaling","trail","fadd","caspase8","flip","death_signal"] },
    { id: "Dreisigmeyer_LacOperon_2008", name: "Dreisigmeyer et al. 2008: Lac Operon Regulation Model", description: "Lac operon", tags: ["lac-operon","gene-expression","bacterial-regulation","2008","dreisigmeyer"] },
    { id: "dual-site-phosphorylation", name: "dual site phosphorylation", description: "Sequential dual phosphorylation", tags: ["dual","site","phosphorylation","kinase","phosphatase","substrate"] },
    { id: "Dushek_TCR_2011", name: "Dushek et al. 2011: T Cell Receptor Kinase Kinase Cascade", description: "TCR signaling", tags: ["tcr","phosphorylation","immune-signaling","2011","dushek"] },
    { id: "Dushek_TCR_2014", name: "Dushek et al. 2014: T Cell Receptor Phosphorylation Feedback", description: "TCR signaling dynamics", tags: ["tcr","feedback-loop","immune-signaling","2014","dushek"] },
    { id: "e2f-rb-cell-cycle-switch", name: "e2f rb cell cycle switch", description: "E2F/Rb G1/S switch", tags: ["e2f","rb","cell","cycle","switch","mitogen","cycd","cyce","p27"] },
    { id: "eco_coevolution_host_parasite", name: "eco coevolution host parasite", description: "Host-parasite coevolution", tags: ["eco","coevolution","host","parasite"] },
    { id: "eco_food_web_chaos_3sp", name: "eco food web chaos 3sp", description: "3-species food web", tags: ["eco","food","web","chaos","3sp"] },
    { id: "eco_lotka_volterra_grid", name: "eco lotka volterra grid", description: "Spatial Lotka-Volterra", tags: ["eco","lotka","volterra","grid","prey","pred"] },
    { id: "eco_mutualism_obligate", name: "eco mutualism obligate", description: "Obligate mutualism", tags: ["eco","mutualism","obligate"] },
    { id: "eco_rock_paper_scissors_spatial", name: "eco rock paper scissors spatial", description: "Spatial RPS dynamics", tags: ["eco","rock","paper","scissors","spatial"] },
    { id: "egfr_net", name: "egfr_net", description: "EGFR signaling network", tags: ["egfr","egf","shc","grb2","sos"] },
    { id: "egfr_net_red", name: "egfr_net_red", description: "Reduced EGFR network", tags: ["egfr","egf","grb2","shc","sos"] },
    { id: "egfr_path", name: "egfr_path", description: "EGFR pathway model", tags: ["egfr"] },
    { id: "egfr_simple", name: "egfr simple", description: "Simple EGFR model", tags: ["egfr","simple","egf","grb2","sos1"] },
    { id: "egfr-signaling-pathway", name: "egfr signaling pathway", description: "Combinatorial EGFR signaling", tags: ["egfr","signaling","pathway","egf","grb2","shc"] },
    { id: "eif2a-stress-response", name: "eif2a stress response", description: "eIF2alpha stress response", tags: ["eif2a","stress","response","eif2b","perk","gadd34"] },
    { id: "endosomal-sorting-rab", name: "endosomal sorting rab", description: "Rab GTPase endosomal sorting", tags: ["endosomal","sorting","rab","rab5","rab7","effector"] },
    { id: "energy_allostery_mwc", name: "energy allostery mwc", description: "MWC allostery model", tags: ["energy","allostery","mwc"] },
    { id: "energy_catalysis_mm", name: "energy catalysis mm", description: "MM energy catalysis", tags: ["energy","catalysis","mm"] },
    { id: "energy_cooperativity_adh", name: "energy cooperativity adh", description: "ADH cooperative binding", tags: ["energy","cooperativity","adh"] },
    { id: "energy_example1", name: "energy_example1", description: "Protein scaffold energy", tags: ["energy"] },
    { id: "energy_linear_chain", name: "energy linear chain", description: "Linear energy chain", tags: ["energy","linear","chain"] },
    { id: "energy_transport_pump", name: "energy transport pump", description: "Ion pump transport", tags: ["energy","transport","pump","atp","adp","pi"] },
    { id: "er-stress-response", name: "er stress response", description: "Rate Constants", tags: ["er","stress","response","unfoldedprotein","perk","eif2a","chaperone"] },
    { id: "Erdem_InsR_2021", name: "Erdem et al. 2021: Insulin Receptor Internalization Model", description: "InsR/IGF1R signaling", tags: ["insulin","receptor-internalization","2021","erdem"] },
    { id: "erk-nuclear-translocation", name: "erk nuclear translocation", description: "ERK nuclear translocation", tags: ["erk","nuclear","translocation","mek","elk1","dusp","transcription_signal"] },
    { id: "example1", name: "example1", description: "Introductory BNGL tutorial", tags: [] },
    { id: "Faeder_egfr_2009", name: "Faeder 2009", description: "EGFR signaling", tags: ["based","egf","egfr","rule","shc","signaling"] },
    { id: "Faeder_egfr_compart_2009", name: "Faeder et al. 2009: Compartmental Rule-Based EGFR model", description: "Compartmental EGFR model", tags: ["egfr","compartments","receptor-trafficking","signaling","2009","faeder"] },
    { id: "Faeder_FceRI_2003_Faeder_2003", name: "Faeder et al. 2003: FceRI Signaling Model (Faeder_2003)", description: "FceRI signaling", tags: ["fceri","immune-signaling","mast-cell","2003","faeder"] },
    { id: "Faeder_FceRI_2003_fceri_ji", name: "Faeder et al. 2003: FceRI Signaling Model (fceri_ji)", description: "FceRI signaling", tags: ["fceri","immune-signaling","mast-cell","2003","faeder"] },
    { id: "Faeder_FceRI_Fyn_2003", name: "Faeder et al. 2003: FceRI Signaling with Fyn Kinase Regulation", description: "FceRI signaling", tags: ["fceri","fyn-kinase","mast-cell","immune-signaling","2003","faeder"] },
    { id: "FceRI_ji", name: "FceRI ji", description: "FcεRI mast-cell signaling", tags: ["fceri","ji","lig","lyn","syk","rec"] },
    { id: "fceri_ji_comp", name: "fceri_ji_comp", description: "FcεRI compartment model", tags: ["fceri","ji","lig","lyn","syk","rec"] },
    { id: "FceRI_viz", name: "FceRI Viz", description: "FcεRI visualization", tags: ["fceri","fcr","ige","lat","lyn","syk","pb","pg","sykp"] },
    { id: "feature_functional_rates_volume", name: "feature functional rates volume", description: "Volume-dependent rates", tags: ["feature","functional","rates","volume"] },
    { id: "feature_global_functions_scan", name: "feature global functions scan", description: "Global function scan", tags: ["feature","global","functions","signal","response","stimulus"] },
    { id: "feature_local_functions_explicit", name: "feature local functions explicit", description: "Explicit local functions", tags: ["feature","local","functions","explicit","mm_rate","ratelaw"] },
    { id: "feature_symmetry_factors_cyclic", name: "feature symmetry factors cyclic", description: "Cyclic symmetry factors", tags: ["feature","symmetry","factors","cyclic"] },
    { id: "feature_synthesis_degradation_ss", name: "feature synthesis degradation ss", description: "Synthesis-degradation SS", tags: ["feature","synthesis","degradation"] },
    { id: "fgf-signaling-pathway", name: "fgf signaling pathway", description: "FGFR-Ras/PI3K relay", tags: ["fgf","signaling","pathway","fgfr","frs2","spry","rasgef","internalized_rec"] },
    { id: "Gardner_Toggle_2000", name: "Gardner et al. 2000: Synthetic Gene Toggle Switch", description: "Genetic toggle switch", tags: ["toggle-switch","synthetic-biology","gene-regulation","2000","gardner"] },
    { id: "gas6-axl-signaling", name: "gas6 axl signaling", description: "GAS6/AXL-AKT signaling", tags: ["gas6","axl","signaling","pi3k","akt","socs","survival_burst"] },
    { id: "gene-expression-toggle", name: "gene expression toggle", description: "Kinetic Parameters", tags: ["gene","expression","toggle","mrna","protein"] },
    { id: "genetic_bistability_energy", name: "genetic bistability energy", description: "Genetic bistability energy", tags: ["genetic","bistability","energy","genea","geneb","prota","protb"] },
    { id: "genetic_dna_replication_stochastic", name: "genetic dna replication stochastic", description: "Stochastic DNA replication", tags: ["genetic","dna","replication","stochastic","pol"] },
    { id: "genetic_goodwin_oscillator", name: "genetic goodwin oscillator", description: "Goodwin gene oscillator", tags: ["genetic","goodwin","oscillator","gene","mrna","protein","repressor"] },
    { id: "genetic_translation_kinetics", name: "genetic translation kinetics", description: "Translation kinetics", tags: ["genetic","translation","kinetics","mrna","rib","protein"] },
    { id: "genetic_turing_pattern_1d", name: "genetic turing pattern 1d", description: "genetic turing pattern 1d", tags: ["genetic","turing","pattern","1d"] },
    { id: "GK", name: "GK", description: "Goldbeter-Koshland switch", tags: ["gk"] },
    { id: "glioblastoma-egfrviii-signaling", name: "glioblastoma egfrviii signaling", description: "Constitutive EGFRvIII signaling", tags: ["glioblastoma","egfrviii","signaling","pi3k","akt","oncogenic_output"] },
    { id: "glycolysis-branch-point", name: "glycolysis branch point", description: "glycolysis branch point", tags: ["glycolysis","branch","point","glucose","atp","biomass"] },
    { id: "gm_game_of_life", name: "gm game of life", description: "Game of Life", tags: ["gm","game","of","life","cell"] },
    { id: "gm_ray_marcher", name: "gm ray marcher", description: "Ray marching renderer", tags: ["gm","ray","marcher","ray0","hit0","bright0","sdf0","sdf1","sdf2","sdf3","speed0"] },
    { id: "Goldstein_blbr_1980", name: "Goldstein et al. 1980: Bivalent Ligand Bivalent Receptor (BLBR) Model", description: "Goldstein blbr", tags: ["blbr","ligand-receptor","binding","1980","goldstein"] },
    { id: "Goldstein_TLBR_1984", name: "Goldstein et al. 1984: Trivalent Ligand Bivalent Receptor (TLBR) Model", description: "Ligand binding", tags: ["tlbr","polymerization","ligand-receptor","bivalent-receptor","trivalent-ligand","1984","goldstein"] },
    { id: "gpcr-desensitization-arrestin", name: "gpcr desensitization arrestin", description: "GPCR arrestin desensitization", tags: ["gpcr","desensitization","arrestin","ligand","gprotein"] },
    { id: "Harmon_Antigen_2017", name: "Harmon et al. 2017: Antigen Recognition Feedback Model", description: "Antigen pulses", tags: ["antigen-recognition","immune-signaling","2017","harmon"] },
    { id: "Hat_wip1_2016", name: "Hat et al. 2016: Wip1-Mediated Feedback Oscillator", description: "Nuclear transport", tags: ["wip1","feedback-loop","p53-pathway","2016","hat"] },
    { id: "Haugh2b", name: "Haugh2b", description: "EGFR exclude-reactants", tags: ["haugh2b","exclude_reactants","include_reactants"] },
    { id: "hedgehog-signaling-pathway", name: "hedgehog signaling pathway", description: "Hedgehog-Gli ciliary pathway", tags: ["hedgehog","signaling","pathway","hh","ptch","smo","gli","sufu"] },
    { id: "heise", name: "heise", description: "State inheritance test", tags: ["heise"] },
    { id: "hematopoietic-growth-factor", name: "hematopoietic growth factor", description: "EPO-JAK2-STAT5 axis", tags: ["hematopoietic","growth","factor","epo","epor","jak2","stat5"] },
    { id: "hif1a_degradation_loop", name: "hif1a degradation loop", description: "HIF-1alpha oxygen sensing", tags: ["hif1a","degradation","loop","vhl","arnt"] },
    { id: "HIV_Dynamics_pt303", name: "HIV Viral Load Dynamics - Patient 303", description: "HIV Dynamics pt303", tags: ["hiv","viral-dynamics","patient-303","epidemiology"] },
    { id: "HIV_Dynamics_pt403", name: "HIV Viral Load Dynamics - Patient 403", description: "HIV Dynamics pt403", tags: ["hiv","viral-dynamics","patient-403","epidemiology"] },
    { id: "HIV_Dynamics_pt409", name: "HIV Viral Load Dynamics - Patient 409", description: "HIV Dynamics pt409", tags: ["hiv","viral-dynamics","patient-409","epidemiology"] },
    { id: "Hlavacek_Egg_2018", name: "Hlavacek et al. 2018: Calcium Oscillations in Egg Activation", description: "End of permute change", tags: ["calcium-oscillations","egg-activation","2018","hlavacek"] },
    { id: "Hlavacek_Elephant_2018_elephant_EFA", name: "Hlavacek et al. 2018: Fitting an Elephant with Four Parameters (elephant_EFA)", description: "Hlavacek Elephant 2018 elephant", tags: ["elephant-fitting","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Elephant_2018_elephant_fit", name: "Hlavacek et al. 2018: Fitting an Elephant with Four Parameters (elephant_fit)", description: "Hlavacek Elephant 2018 elephant", tags: ["elephant-fitting","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Proofreading_2001", name: "Hlavacek et al. 2001: Kinetic Proofreading Model", description: "Kinetic proofreading", tags: ["kinetic-proofreading","ligand-discrimination","2001","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_after_bunching", name: "Hlavacek et al. 2018: Network Restructuration Analysis (after_bunching)", description: "Hlavacek Restructuration 2018 after", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_after_decoupling", name: "Hlavacek et al. 2018: Network Restructuration Analysis (after_decoupling)", description: "Hlavacek Restructuration 2018 after", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_after_scaling", name: "Hlavacek et al. 2018: Network Restructuration Analysis (after_scaling)", description: "Hlavacek Restructuration 2018 after", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_before_bunching", name: "Hlavacek et al. 2018: Network Restructuration Analysis (before_bunching)", description: "Hlavacek Restructuration 2018 before", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_before_decoupling", name: "Hlavacek et al. 2018: Network Restructuration Analysis (before_decoupling)", description: "Hlavacek Restructuration 2018 before", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_before_scaling", name: "Hlavacek et al. 2018: Network Restructuration Analysis (before_scaling)", description: "Hlavacek Restructuration 2018 before", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Restructuration_2018_check_scaling", name: "Hlavacek et al. 2018: Network Restructuration Analysis (check_scaling)", description: "Hlavacek Restructuration 2018 check", tags: ["network-restructuration","mathematical-model","2018","hlavacek"] },
    { id: "Hlavacek_Steric_1999", name: "Hlavacek et al. 1999: Steric Hindrance in Ligand Binding", description: "Steric effects", tags: ["steric-hindrance","ligand-binding","1999","hlavacek"] },
    { id: "hypoxia-response-signaling", name: "hypoxia response signaling", description: "Rate Constants", tags: ["hypoxia","response","signaling","oxygensensor","hif1","vegf"] },
    { id: "il1b-signaling", name: "il1b signaling", description: "IL-1beta NF-kB activation", tags: ["il1b","signaling","il1ri","myd88","irak","nfkb"] },
    { id: "il6-jak-stat-pathway", name: "il6 jak stat pathway", description: "IL-6 JAK-STAT signaling", tags: ["il6","jak","stat","pathway","gp130","stat3","socs"] },
    { id: "immune-synapse-formation", name: "immune synapse formation", description: "TCR immune synapse", tags: ["immune","synapse","formation","tcr","pmhc","lck","zap70"] },
    { id: "inflammasome-activation", name: "inflammasome activation", description: "NLRP3 inflammasome activation", tags: ["inflammasome","activation","sensor","asc","caspase1","il1b"] },
    { id: "inositol-phosphate-metabolism", name: "inositol phosphate metabolism", description: "PLC-IP3 branching", tags: ["inositol","phosphate","metabolism","pip2","ip3","ip4","calcium","agonist"] },
    { id: "insulin-glucose-homeostasis", name: "insulin glucose homeostasis", description: "Insulin-GLUT4 transport", tags: ["insulin","glucose","homeostasis","ir","glut4","pancreas"] },
    { id: "interferon-signaling", name: "interferon signaling", description: "IFN-JAK-STAT signaling", tags: ["interferon","signaling","ifn","ifnar","tyk2","stat1"] },
    { id: "ire1a-xbp1-er-stress", name: "ire1a xbp1 er stress", description: "IRE1a-XBP1 ER stress", tags: ["ire1a","xbp1","er","stress","ire1","bip","unfolded","ridd_target"] },
    { id: "issue_198_short", name: "issue_198_short", description: "Regression test", tags: ["issue"] },
    { id: "jak-stat-cytokine-signaling", name: "jak stat cytokine signaling", description: "Cytokine JAK-STAT signaling", tags: ["jak","stat","cytokine","signaling","receptor"] },
    { id: "JaruszewiczBlonska_NFkB_2023", name: "Jaruszewicz-Blonska et al. 2023: NF-kB Feedback Regulation", description: "T-cell discrimination", tags: ["nfkb","feedback-regulation","inflammatory-response","2023","jaruszewiczblonska"] },
    { id: "jnk-mapk-signaling", name: "jnk mapk signaling", description: "JNK scaffold signaling", tags: ["jnk","mapk","signaling","mkk7","jip1"] },
    { id: "Jung_CaMKII_2017", name: "Jung et al. 2017: CaMKII Activation Kinetics", description: "M1 receptor signaling", tags: ["camkii","neuroscience","kinase-activation","2017","jung"] },
    { id: "Kesseler_CellCycle_2013", name: "Kesseler et al. 2013: Cell Cycle Regulation Model", description: "G2/Mitosis transition", tags: ["cell-cycle","mitosis","cdc25","wee1","2013","kesseler"] },
    { id: "Kiefhaber_emodel", name: "Kiefhaber_emodel", description: "Energy model test", tags: ["emodel"] },
    { id: "kir-channel-regulation", name: "kir channel regulation", description: "PIP2 Kir channel gating", tags: ["kir","channel","regulation","pip2","gbg"] },
    { id: "Kocieniewski_published_2012", name: "Kocieniewski et al. 2012: MAPK Signaling on Scaffolds", description: "Actin dynamics", tags: ["mapk","scaffold-proteins","signaling","2012","kocieniewski"] },
    { id: "Korwek_InnateImmunity_2023", name: "Korwek et al. 2023: Innate Immunity Activation Model", description: "Immune response", tags: ["innate-immunity","rig-i-sensing","pkr-activation","rnase-l-cleavage","viral-sensing","2023","korwek"] },
    { id: "Korwek_ViralSensing_2023", name: "Korwek et al. 2023: Viral Sensing and Innate Immune Activation", description: "This BioNetGen file features", tags: ["innate-immunity","rig-i-sensing","pkr-activation","rnase-l-cleavage","viral-sensing","2023","korwek"] },
    { id: "Kozer_egfr_2013", name: "Kozer et al. 2013: EGFR Dimerization and Internalization", description: "EGFR oligomerization", tags: ["egfr","dimerization","internalization","2013","kozer"] },
    { id: "Kozer_egfr_2014", name: "Kozer et al. 2014: EGFR Oligomerization Dynamics", description: "Grb2-EGFR recruitment", tags: ["egfr","oligomerization","internalization","2014","kozer"] },
    { id: "l-type-calcium-channel-dynamics", name: "l type calcium channel dynamics", description: "L-type calcium channel", tags: ["type","calcium","channel","dynamics","ltcc","voltage"] },
    { id: "lac-operon-regulation", name: "lac operon regulation", description: "Lac operon regulation", tags: ["lac","operon","regulation","laci","promoter","mrna","betagal","lactose","allolactose"] },
    { id: "Lang_CellCycle_2024", name: "Lang et al. 2024: Cyclin A-CDK2 Cell Cycle Control", description: "Cell cycle regulation", tags: ["cell-cycle","cyclin-a","cdk2","2024","lang"] },
    { id: "Lee_Wnt_2003", name: "Lee et al. 2003: Wnt/Beta-Catenin Signaling Pathway", description: "Wnt signaling", tags: ["wnt","beta-catenin","axin-degradation","dishevelled-activation","2003","lee"] },
    { id: "Ligon_egfr_2014", name: "Ligon et al. 2014: EGFR Dimerization in Living Cells", description: "Lipoplex delivery", tags: ["egfr","dimerization","fluorescence-microscopy","2014","ligon"] },
    { id: "Lin_ERK_2019", name: "Lin 2019", description: "ERK signaling", tags: ["2019","egfr","erk","lin","mek","raf","ras","rasgap","signaling","sos"] },
    { id: "Lin_Prion_2019", name: "Lin 2019", description: "Prion replication", tags: ["2019","lin","prion","prp"] },
    { id: "Lin_ScalingBench_2019_ERK_model", name: "Lin et al. 2019: Scaling Benchmark Models (ERK_model)", description: "Lin ScalingBench 2019 ERK", tags: ["scaling-benchmark","kinetics","2019","lin"] },
    { id: "Lin_ScalingBench_2019_prion_model", name: "Lin et al. 2019: Scaling Benchmark Models (prion_model)", description: "Lin ScalingBench 2019 prion", tags: ["scaling-benchmark","kinetics","2019","lin"] },
    { id: "Lin_ScalingBench_2019_TCR_model", name: "Lin et al. 2019: Scaling Benchmark Models (TCR_model)", description: "Lin ScalingBench 2019 TCR", tags: ["scaling-benchmark","kinetics","2019","lin"] },
    { id: "Lin_TCR_2019", name: "Lin 2019", description: "TCR signaling", tags: ["2019","erk","immune","lck","lin","mek","pmhc","shp","signaling","tcr","zap"] },
    { id: "lipid-mediated-pip3-signaling", name: "lipid mediated pip3 signaling", description: "PI3K-PTEN PIP3 signaling", tags: ["lipid","mediated","pip3","signaling","pi3k","pip2","pten","pdk1"] },
    { id: "Lisman", name: "Lisman", description: "CaMKII bistability", tags: ["lisman","input"] },
    { id: "Lisman_bifurcate", name: "Lisman bifurcate", description: "CaMKII bifurcation", tags: ["lisman","bifurcate"] },
    { id: "localfunc", name: "localfunc", description: "Local function expansion", tags: ["localfunc","f_synth"] },
    { id: "LR", name: "LR", description: "Ligand-receptor binding", tags: ["lr"] },
    { id: "LR_comp", name: "LR comp", description: "Compartment ligand-receptor", tags: ["lr"] },
    { id: "LRR", name: "LRR", description: "Two-receptor binding", tags: ["lrr"] },
    { id: "LRR_comp", name: "LRR comp", description: "Compartment two-receptor", tags: ["lrr"] },
    { id: "LV", name: "LV", description: "Lotka-Volterra predation", tags: ["lv"] },
    { id: "LV_comp", name: "LV comp", description: "Compartment predator-prey", tags: ["lv"] },
    { id: "Macken_physics_1982", name: "Macken et al. 1982: Polymer Chain Reaction Kinetics", description: "Macken physics", tags: ["polymerization","mathematical-model","1982","macken"] },
    { id: "Mallela_Cities_2021", name: "Mallela et al. 2021: Covid-19 City-Level Transmission Dynamics", description: "Parameter-fit COVID-19 epidemiological models", tags: ["covid-19","epidemiology","city-level","2021","mallela"] },
    { id: "Mallela_COVID_2021", name: "Mallela et al. 2021: Covid-19 State-Level Transmission Dynamics", description: "Parameter-fit COVID-19 epidemiological models", tags: ["covid-19","epidemiology","state-level","2021","mallela"] },
    { id: "Mallela_MSAs_2022", name: "Mallela et al. 2022: Covid-19 MSA-Level Transmission Dynamics", description: "Parameter-fit COVID-19 epidemiological models", tags: ["covid-19","epidemiology","msa-level","2022","mallela"] },
    { id: "Mallela_VaxVariants_Alabama_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - Alabama MSA", description: "reporting period (1 d)", tags: ["covid-19","epidemiology","vaccination","variants","alabama","2022","mallela"] },
    { id: "Mallela_VaxVariants_Dallas_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - Dallas MSA", description: "- This model is", tags: ["covid-19","epidemiology","vaccination","variants","dallas","2022","mallela"] },
    { id: "Mallela_VaxVariants_Houston_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - Houston MSA", description: "- This model is", tags: ["covid-19","epidemiology","vaccination","variants","houston","2022","mallela"] },
    { id: "Mallela_VaxVariants_MyrtleBeach_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - Myrtle Beach MSA", description: "Runtime-only BNGL model migrated", tags: ["covid-19","epidemiology","vaccination","variants","myrtle-beach","2022","mallela"] },
    { id: "Mallela_VaxVariants_NYC_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - New York City MSA", description: "- This model is", tags: ["covid-19","epidemiology","vaccination","variants","nyc","2022","mallela"] },
    { id: "Mallela_VaxVariants_Phoenix_2022", name: "Mallela et al. 2022: Covid-19 Vax and Variants - Phoenix MSA", description: "- This model is", tags: ["covid-19","epidemiology","vaccination","variants","phoenix","2022","mallela"] },
    { id: "MAPK_Dimers_Model", name: "MAPK Cascades with Raf Dimerization", description: "MAPK dimerization", tags: ["mapk-pathway","kinase-cascade","raf-dimerization","phosphorylation"] },
    { id: "MAPK_Monomers_Model", name: "MAPK Cascades with Raf Monomers", description: "MAPK cascade", tags: ["mapk-pathway","kinase-cascade","raf-monomers","phosphorylation"] },
    { id: "mapk-signaling-cascade", name: "mapk signaling cascade", description: "MAPK kinase cascade", tags: ["mapk","signaling","cascade","ligand","receptor","mapkkk","mapkk"] },
    { id: "Massole_developmental_2023", name: "Massole et al. 2023: Notch-Delta Lateral Inhibition Dynamics", description: "Epo receptor signaling", tags: ["notch-delta","lateral-inhibition","developmental","2023","massole"] },
    { id: "McMillan_TNF_2021", name: "McMillan 2021", description: "TNF signaling", tags: ["2021","mcmillan","nfsim","signaling","tnf"] },
    { id: "Mertins_cancer_2023", name: "Mertins et al. 2023: Apoptotic Signaling Response", description: "DNA damage response", tags: ["apoptosis","bax-bclxl","cancer","2023","mertins"] },
    { id: "meta_formal_game_theory", name: "meta formal game theory", description: "Formal game theory", tags: ["meta","formal","game","theory","hawk","dove","pop","payoffh","payoffd"] },
    { id: "meta_formal_molecular_clock", name: "meta formal molecular clock", description: "Molecular clock", tags: ["meta","formal","molecular","clock","fasta","fastb","slowc","slowd"] },
    { id: "meta_formal_petri_net", name: "meta formal petri net", description: "Formal Petri net", tags: ["meta","formal","petri","p1","p2","p3","p4"] },
    { id: "michaelis-menten-kinetics", name: "michaelis menten kinetics", description: "Michaelis-Menten kinetics", tags: ["michaelis","menten","kinetics"] },
    { id: "michment", name: "michment", description: "Michaelis-Menten kinetics", tags: ["michment"] },
    { id: "michment_cont", name: "michment_cont", description: "MM continuation run", tags: ["michment"] },
    { id: "Miller_MEK_2025", name: "Miller et al. 2025: MEK Isoform Specific Signaling", description: "MEK isoform variant models", tags: ["mek-isoforms","mapk-pathway","signaling","2025","miller"] },
    { id: "Miller_NavajoNation_2022", name: "Miller et al. 2022: Covid-19 Transmission in Navajo Nation", description: "COVID-19 epidemiological models fit", tags: ["covid-19","epidemiology","navajo-nation","2022","miller"] },
    { id: "Mitra_Degranulation_2019", name: "Mitra et al. 2019: Mast Cell Degranulation Dynamics", description: "A model of IgE", tags: ["fceri","degranulation","mast-cell","immune-response","2019","mitra"] },
    { id: "Mitra_EGFR_2019", name: "Mitra et al. 2019: EGFR Receptor Signaling (ODE)", description: "EGFR model", tags: ["egfr","signaling","receptor-binding","2019","mitra"] },
    { id: "Mitra_EGFR_2019_egfr", name: "Mitra et al. 2019: EGFR Receptor Signaling (ODE) (egfr)", description: "EGFR model", tags: ["egfr","signaling","receptor-binding","2019","mitra"] },
    { id: "Mitra_EGFR_2019_egfr_ground", name: "Mitra et al. 2019: EGFR Receptor Signaling (ODE) (egfr_ground)", description: "EGFR model", tags: ["egfr","signaling","receptor-binding","2019","mitra"] },
    { id: "Mitra_EGFR_NF_2019", name: "Mitra et al. 2019: EGFR Network-Free Simulation", description: "Mitra EGFR NF", tags: ["egfr","signaling","network-free","nfsim","2019","mitra"] },
    { id: "Mitra_EGFR_ODE_2019", name: "Mitra et al. 2019: EGFR Parameter Estimation (ODE)", description: "Mitra EGFR ODE", tags: ["egfr","signaling","ode","parameter-estimation","2019","mitra"] },
    { id: "Mitra_EGFR_SSA_2019_egfr", name: "Mitra et al. 2019: EGFR Stochastic (SSA) Model (egfr)", description: "EGFR model", tags: ["egfr","stochastic","ssa","signaling","2019","mitra"] },
    { id: "Mitra_EGFR_SSA_2019_egfr_ground", name: "Mitra et al. 2019: EGFR Stochastic (SSA) Model (egfr_ground)", description: "EGFR model", tags: ["egfr","stochastic","ssa","signaling","2019","mitra"] },
    { id: "Mitra_EggOscillator_2019", name: "Mitra et al. 2019: Egg Activation Calcium Oscillator", description: "Mitra EggOscillator", tags: ["calcium-oscillator","egg-activation","oscillations","2019","mitra"] },
    { id: "Mitra_ElephantFitting_2019", name: "Mitra et al. 2019: Elephant Drawing Parameter Fitting", description: "Mitra ElephantFitting", tags: ["elephant-drawing","parameter-fitting","mathematical-model","2019","mitra"] },
    { id: "Mitra_FceRI_gamma2_2019", name: "Mitra et al. 2019: FceRI Gamma2 Subunit Signaling", description: "Added molecule type definition", tags: ["fceri","gamma2-subunit","immune-signaling","2019","mitra"] },
    { id: "Mitra_IGF1R_2019", name: "Mitra et al. 2019: IGF1R (Insulin-like Growth Factor) Signaling", description: "Author: William S. Hlavacek", tags: ["igf1r","receptor-activation","phosphorylation","2019","mitra"] },
    { id: "Mitra_JNK_2019", name: "Mitra et al. 2019: JNK Pathway Cascade", description: "Mitra JNK", tags: ["jnk-signaling","stress-response","kinase-cascade","2019","mitra"] },
    { id: "Mitra_JobScheduling_2019_jobs_ground", name: "Mitra et al. 2019: Job Scheduling Simulation (jobs_ground)", description: "NFsim simulation of the", tags: ["job-scheduling","queueing-theory","non-biological","2019","mitra"] },
    { id: "Mitra_JobScheduling_2019_jobs_tofit", name: "Mitra et al. 2019: Job Scheduling Simulation (jobs_tofit)", description: "NFsim simulation of the", tags: ["job-scheduling","queueing-theory","non-biological","2019","mitra"] },
    { id: "Mitra_Likelihood_2019", name: "Mitra et al. 2019: Likelihood Profiling Analysis Reference", description: "Mitra Likelihood", tags: ["na","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","kp_x","km_x","molecules"] },
    { id: "Mitra_Likelihood_P16_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 16", description: "Mitra Likelihood P16", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P16_3cat_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 16 (3 Categories)", description: "Mitra Likelihood P16 3cat", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P32_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 32", description: "Mitra Likelihood P32", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P32_3cat_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 32 (3 Categories)", description: "Mitra Likelihood P32 3cat", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P4_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 4", description: "Mitra Likelihood P4", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P4_3cat_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 4 (3 Categories)", description: "Mitra Likelihood P4 3cat", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P64_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 64", description: "Mitra Likelihood P64", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P64_3cat_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 64 (3 Categories)", description: "Mitra Likelihood P64 3cat", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P8_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 8", description: "Mitra Likelihood P8", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_P8_3cat_2019", name: "Mitra et al. 2019: Likelihood Profiling - Problem 8 (3 Categories)", description: "Mitra Likelihood P8 3cat", tags: ["likelihood","parameter-estimation","2019","mitra"] },
    { id: "Mitra_Likelihood_Quant_2019", name: "Mitra et al. 2019: Likelihood Profiling - Quantitative Problem", description: "Mitra Likelihood Quant", tags: ["likelihood","parameter-estimation","quantitative","2019","mitra"] },
    { id: "Mitra_MAPK_2019_Scaff-22_ground", name: "Mitra et al. 2019: MAPK Pathway Cascade (Scaff-22_ground)", description: "For \"ground truth\" model", tags: ["mapk","cascade","kinase-cascade","2019","mitra"] },
    { id: "Mitra_MAPK_2019_Scaff-22_tofit", name: "Mitra et al. 2019: MAPK Pathway Cascade (Scaff-22_tofit)", description: "For \"ground truth\" model", tags: ["mapk","cascade","kinase-cascade","2019","mitra"] },
    { id: "Mitra_MAPK_Ensemble_2019_ensemble_tofit", name: "Mitra et al. 2019: MAPK Pathway Ensemble Model (ensemble_tofit)", description: "Ensemble model translated into", tags: ["mapk","ensemble-modeling","parameter-space","2019","mitra"] },
    { id: "Mitra_MAPK_Ensemble_2019_machine_tofit", name: "Mitra et al. 2019: MAPK Pathway Ensemble Model (machine_tofit)", description: "Ensemble model translated into", tags: ["mapk","ensemble-modeling","parameter-space","2019","mitra"] },
    { id: "Mitra_Rab_wt_2019_rab_mon1ccz1_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (rab_mon1ccz1_ox)", description: "Mitra Rab wt 2019", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","kcatgtp_rab7","molecules"] },
    { id: "Mitra_Rab_wt_2019_rab_rab5_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (rab_rab5_ox)", description: "Mitra Rab wt 2019", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","kcatgtp_rab7","molecules"] },
    { id: "Mitra_Rab_wt_2019_rab_rab7_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (rab_rab7_ox)", description: "Mitra Rab wt 2019", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","kcatgtp_rab7","molecules"] },
    { id: "Mitra_Rab_wt_2019_rab_wt", name: "Mitra et al. 2019: Rab Cascade - Wild Type (rab_wt)", description: "Mitra Rab wt 2019", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","kcatgtp_rab7","molecules"] },
    { id: "Mitra_Rab_wt_pybnf_2019_rab_mon1ccz1_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (PyBNF) (rab_mon1ccz1_ox)", description: "Mitra Rab wt pybnf", tags: ["rab-cascade","vesicle-trafficking","mon1-ccz1","rab5","rab7","2019","mitra"] },
    { id: "Mitra_Rab_wt_pybnf_2019_rab_rab5_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (PyBNF) (rab_rab5_ox)", description: "Mitra Rab wt pybnf", tags: ["rab-cascade","vesicle-trafficking","mon1-ccz1","rab5","rab7","2019","mitra"] },
    { id: "Mitra_Rab_wt_pybnf_2019_rab_rab7_ox", name: "Mitra et al. 2019: Rab Cascade - Wild Type (PyBNF) (rab_rab7_ox)", description: "Mitra Rab wt pybnf", tags: ["rab-cascade","vesicle-trafficking","mon1-ccz1","rab5","rab7","2019","mitra"] },
    { id: "Mitra_Rab_wt_pybnf_2019_rab_wt", name: "Mitra et al. 2019: Rab Cascade - Wild Type (PyBNF) (rab_wt)", description: "Mitra Rab wt pybnf", tags: ["rab-cascade","vesicle-trafficking","mon1-ccz1","rab5","rab7","2019","mitra"] },
    { id: "Mitra_RafConstraint_2019", name: "Mitra et al. 2019: Raf Signaling with Activity Constraints", description: "Mitra RafConstraint", tags: ["raf","constraints","activity-constraints","2019","mitra"] },
    { id: "Mitra_RafConstraint4_2019", name: "Mitra et al. 2019: Raf Signaling Constraints (Version 4)", description: "Mitra RafConstraint4", tags: ["raf","constraints","activity-constraints","2019","mitra"] },
    { id: "Mitra_SimpleReceptor_2019_example5_starting_point", name: "Mitra et al. 2019: Simple Ligand-Receptor Binding (example5_starting_point)", description: "A simple model", tags: ["ligand-receptor","binding","reversible-reaction","2019","mitra"] },
    { id: "Mitra_SimpleReceptor_2019_receptor", name: "Mitra et al. 2019: Simple Ligand-Receptor Binding (receptor)", description: "A simple model", tags: ["ligand-receptor","binding","reversible-reaction","2019","mitra"] },
    { id: "Mitra_SimpleReceptor_NF_2019", name: "Mitra et al. 2019: Simple Receptor Network-Free Binding", description: "A simple model of", tags: ["ligand-receptor","binding","nfsim","network-free","2019","mitra"] },
    { id: "Mitra_TCR_2019", name: "Mitra et al. 2019: T Cell Receptor (TCR) Signaling", description: "A model of T", tags: ["tcr","t-cell","immune-signaling","2019","mitra"] },
    { id: "Mitra_TCRSensitivity_2019", name: "Mitra et al. 2019: T Cell Receptor Sensitivity Analysis", description: "Modification of Mukhopadhyay/Dushek 2013", tags: ["tcr","sensitivity-analysis","ligand-discrimination","2019","mitra"] },
    { id: "Mitra_ThreeStepCascade_2019_m1", name: "Mitra et al. 2019: Three-Step Signaling Cascade (m1)", description: "Toy model of a", tags: ["cascade","kinase","phosphorylation","2019","mitra"] },
    { id: "Mitra_ThreeStepCascade_2019_m1_ground", name: "Mitra et al. 2019: Three-Step Signaling Cascade (m1_ground)", description: "Toy model of a", tags: ["cascade","kinase","phosphorylation","2019","mitra"] },
    { id: "Mitra_TLBR_2019", name: "Mitra et al. 2019: Trivalent Ligand Bivalent Receptor (TLBR)", description: "Mitra TLBR", tags: ["tlbr","polymerization","ligand-receptor","2019","mitra"] },
    { id: "ml_gradient_descent", name: "ml gradient descent", description: "Gradient Descent Optimizer in", tags: ["ml","gradient","descent","posx","posy","velx","vely","loss"] },
    { id: "ml_hopfield", name: "ml hopfield", description: "ml hopfield", tags: ["ml","hopfield","neuron","net1","net2","net3","target1"] },
    { id: "ml_kmeans", name: "ml kmeans", description: "ml kmeans", tags: ["ml","kmeans","ax","ay","bx","by"] },
    { id: "ml_q_learning", name: "ml q learning", description: "Q-Learning Agent in BNGL", tags: ["ml","learning","pos","ql","qr","reward","action"] },
    { id: "ml_svm", name: "ml svm", description: "ml svm", tags: ["ml","svm","w1","w2","db_dt","dw1_dt"] },
    { id: "Motivating_example", name: "Motivating_example", description: "Motivating BNGL example", tags: ["motivating","example","tf","dna","mrna1","mrna2"] },
    { id: "Motivating_example_cBNGL", name: "Motivating_example_cBNGL", description: "Compartment BNGL example", tags: ["motivating","example","cbngl","tf","dna","mrna1","mrna2"] },
    { id: "motor", name: "motor", description: "Motor protein", tags: ["motor","chey"] },
    { id: "mt_arithmetic_compiler", name: "mt arithmetic compiler", description: "mt arithmetic compiler", tags: ["mt","arithmetic","compiler","node","target_add","target_mult"] },
    { id: "mt_bngl_interpreter", name: "mt bngl interpreter", description: "mt bngl interpreter", tags: ["mt","bngl","interpreter","rule","species","exec_s1_s2"] },
    { id: "mt_music_sequencer", name: "mt music sequencer", description: "Music Sequencer / Chord", tags: ["mt","music","sequencer","v1s","v1c","v2s","v2c","v3s","v3c","mix","chordphase"] },
    { id: "mt_pascal_triangle", name: "mt pascal triangle", description: "mt pascal triangle", tags: ["mt","pascal","triangle","node"] },
    { id: "mt_quine", name: "mt quine", description: "mt quine", tags: ["mt","quine","gene","protein"] },
    { id: "mtor-signaling", name: "mtor signaling", description: "mTOR Signaling Pathway", tags: ["mtor","signaling","rheb","mtorc1","s6k","ampk"] },
    { id: "mtorc2-signaling", name: "mtorc2 signaling", description: "mTORC2 signaling regulates cell", tags: ["mtorc2","signaling","mtor","sin1","rictor","akt","sgk1","pip3"] },
    { id: "Mukhopadhyay_TCR_2013", name: "Mukhopadhyay et al. 2013: T Cell Receptor Phosphorylation Model", description: "FceRI signaling", tags: ["tcr","phosphorylation","immune-signaling","2013","mukhopadhyay"] },
    { id: "mwc", name: "mwc", description: "Monod-Wyman-Changeux model", tags: ["mwc","ox"] },
    { id: "myogenic-differentiation", name: "myogenic differentiation", description: "Myogenic Differentiation", tags: ["myogenic","differentiation","myod","myog","mef2"] },
    { id: "Nag_cancer_2009", name: "Nag et al. 2009: EGFR-Her2 Heterodimerization Dynamics", description: "LAT-Grb2-SOS1 signaling", tags: ["egfr","her2","heterodimerization","2009","nag"] },
    { id: "negative-feedback-loop", name: "negative feedback loop", description: "Negative Feedback Loop", tags: ["negative","feedback","loop","gene","mrna","protein"] },
    { id: "neurotransmitter-release", name: "neurotransmitter release", description: "Neurotransmitter Release", tags: ["neurotransmitter","release","calcium","snare","vesicle","postsynaptic"] },
    { id: "nfkb", name: "nfkb", description: "NF-kB signaling pathway", tags: ["nfkb","tnfr","ikkk","tnf","ikk","ikba","competitor"] },
    { id: "nfkb_illustrating_protocols", name: "nfkb_illustrating_protocols", description: "NF-kB signaling pathway", tags: ["nfkb","illustrating","protocols","tnfr","ikkk","tnf","ikk","ikba","competitor"] },
    { id: "nfkb-feedback", name: "nfkb feedback", description: "TNFalpha-induced NF-kB signaling with", tags: ["nfkb","feedback","ikb","ikk","a20"] },
    { id: "nfsim_aggregation_gelation", name: "nfsim aggregation gelation", description: "nfsim aggregation gelation", tags: ["nfsim","aggregation","gelation"] },
    { id: "nfsim_coarse_graining", name: "nfsim coarse graining", description: "nfsim coarse graining", tags: ["nfsim","coarse","graining","droplet"] },
    { id: "nfsim_dynamic_compartments", name: "nfsim dynamic compartments", description: "nfsim dynamic compartments", tags: ["nfsim","dynamic","compartments","cell"] },
    { id: "nfsim_hybrid_particle_field", name: "nfsim hybrid particle field", description: "nfsim hybrid particle field", tags: ["nfsim","hybrid","particle","field"] },
    { id: "nfsim_ring_closure_polymer", name: "nfsim ring closure polymer", description: "nfsim ring closure polymer", tags: ["nfsim","ring","closure","polymer"] },
    { id: "nn_xor", name: "nn xor", description: "nn xor", tags: ["nn","xor","input","hidden","output","target","weightih","weightho","dopamine"] },
    { id: "no-cgmp-signaling", name: "no cgmp signaling", description: "Nitric Oxide (NO) /", tags: ["no","cgmp","signaling","sgc","pkg"] },
    { id: "Nosbisch_cancer_2022", name: "Nosbisch et al. 2022: RTK Heterodimerization Modeling", description: "RTK-PLCgamma1 signaling", tags: ["rtk","heterodimerization","cancer","2022","nosbisch"] },
    { id: "Notch_Signaling_Pathway", name: "Canonical Notch Signaling Pathway Model", description: "Notch signaling", tags: ["notch-signaling","csl-binding","fringe-regulation","developmental-signaling"] },
    { id: "notch-delta-lateral-inhibition", name: "notch delta lateral inhibition", description: "Notch-Delta lateral inhibition", tags: ["notch","delta","lateral","inhibition","cellnotch","celldelta"] },
    { id: "Ordyan_CaMKIIholo_2020", name: "Ordyan et al. 2020: CaMKII Holoenzyme Activation Model", description: "CaMKII holo", tags: ["camkii","holoenzyme","neuroscience","2020","ordyan"] },
    { id: "Ordyan_extraCaMKIIHolo_2020", name: "Ordyan et al. 2020: CaMKII Holoenzyme Extra Subunits Model", description: "Extra CaMKII holo (supplement)", tags: ["camkii","holoenzyme","neuroscience","2020","ordyan"] },
    { id: "Ordyan_mCaMKIICaSpike_2020", name: "Ordyan et al. 2020: CaMKII Activation under Calcium Spikes", description: "mCaMKII Ca Spike model", tags: ["camkii","calcium-spikes","neuroscience","2020","ordyan"] },
    { id: "organelle_transport", name: "organelle transport", description: "organelle transport", tags: ["organelle","transport"] },
    { id: "organelle_transport_struct", name: "organelle transport struct", description: "organelle transport struct", tags: ["organelle","transport","struct"] },
    { id: "oxidative-stress-response", name: "oxidative stress response", description: "Oxidative Stress Response (Keap1-Nrf2", tags: ["oxidative","stress","response","ros","keap1","nrf2","antioxidant"] },
    { id: "p38-mapk-signaling", name: "p38 mapk signaling", description: "p38 MAPK stress signaling", tags: ["p38","mapk","signaling","mkk3","mapkap2"] },
    { id: "p53-mdm2-oscillator", name: "p53 mdm2 oscillator", description: "p53 mdm2 oscillator", tags: ["p53","mdm2","oscillator"] },
    { id: "parp1-mediated-dna-repair", name: "parp1 mediated dna repair", description: "PARP1-mediated DNA damage sensing", tags: ["parp1","mediated","dna","repair","par","nad"] },
    { id: "Pekalski_published_2013", name: "Pekalski et al. 2013: TNFR-Mediated NF-kB Activation Model", description: "Spontaneous signaling", tags: ["tnfr","nfkb","inflammatory-signaling","2013","pekalski"] },
    { id: "ph_lorenz_attractor", name: "ph lorenz attractor", description: "Lorenz Attractor in BNGL", tags: ["ph","lorenz","attractor","lx","ly","lz"] },
    { id: "ph_nbody_gravity", name: "ph nbody gravity", description: "ph nbody gravity", tags: ["ph","nbody","gravity","body","r2"] },
    { id: "ph_schrodinger", name: "ph schrodinger", description: "ph schrodinger", tags: ["ph","schrodinger","psi"] },
    { id: "ph_wave_equation", name: "ph wave equation", description: "ph wave equation", tags: ["ph","wave","equation","node"] },
    { id: "phosphorelay-chain", name: "phosphorelay chain", description: "phosphorelay chain", tags: ["phosphorelay","chain","sensor","relay","output"] },
    { id: "platelet-activation", name: "platelet activation", description: "platelet activation", tags: ["platelet","activation","adp","p2y12","integrin","thromboxane"] },
    { id: "polymer", name: "polymer", description: "Polymerization model", tags: ["tutorials","nfsim","polymer","simulate_nf"] },
    { id: "polymer_draft", name: "polymer draft", description: "Polymerization (draft)", tags: ["tutorials","nfsim","polymer","draft","simulate_nf"] },
    { id: "polymer_fixed", name: "polymer_fixed", description: "Runtime-only BNGL model migrated", tags: ["polymer","fixed"] },
    { id: "polynomial", name: "polynomial", description: "Implementation of the parabola", tags: ["polynomial"] },
    { id: "Posner_blbr_1995", name: "Posner et al. 1995: Receptor Ring Aggregation Model", description: "BLBR rings", tags: ["blbr","aggregation","receptor-rings","1995","posner"] },
    { id: "Posner_blbr_2004", name: "Posner et al. 2004: Cooperativity in Receptor Binding", description: "BLBR cooperativity", tags: ["blbr","cooperativity","receptor-binding","2004","posner"] },
    { id: "predator-prey-dynamics", name: "predator prey dynamics", description: "predator prey dynamics", tags: ["predator","prey","dynamics"] },
    { id: "process_actin_treadmilling", name: "process actin treadmilling", description: "process actin treadmilling", tags: ["process","actin","treadmilling"] },
    { id: "process_autophagy_flux", name: "process autophagy flux", description: "process autophagy flux", tags: ["process","autophagy","flux","phagophore","autophagosome","lysosome","autolysosome","cargo"] },
    { id: "process_cell_adhesion_strength", name: "process cell adhesion strength", description: "process cell adhesion strength", tags: ["process","cell","adhesion","strength","c1","c2"] },
    { id: "process_kinetic_proofreading_tcr", name: "process kinetic proofreading tcr", description: "process kinetic proofreading tcr", tags: ["process","kinetic","proofreading","tcr"] },
    { id: "process_quorum_sensing_switch", name: "process quorum sensing switch", description: "process quorum sensing switch", tags: ["process","quorum","sensing","switch","gene_ai","ai","gene_light"] },
    { id: "PyBioNetGen_Actions_Syntax", name: "PyBioNetGen Actions Syntax Verification Model", description: "BNGL actions syntax", tags: ["test-case","syntax-check","actions"] },
    { id: "PyBioNetGen_BNG_Error", name: "PyBioNetGen BNG Error Triggering Test", description: "BNG error test", tags: ["test-case","error-handling"] },
    { id: "PyBioNetGen_Core_Parabola", name: "PyBioNetGen Core: Parabolic Trajectory Model", description: "Implementation of the parabola", tags: ["mathematical-model","parabolic-equation"] },
    { id: "PyBioNetGen_Core_Parabola_Demo", name: "PyBioNetGen Core: Parabolic Trajectory Demo", description: "Original values used to", tags: ["mathematical-model","demo"] },
    { id: "PyBioNetGen_Core_Parabola_Ground", name: "PyBioNetGen Core: Parabolic Ground Truth Reference", description: "Implementation of the parabola", tags: ["mathematical-model","reference-standard"] },
    { id: "PyBioNetGen_Core_Polynomial", name: "PyBioNetGen Core: Polynomial Trajectory Model", description: "Implementation of the parabola", tags: ["mathematical-model","polynomial-equation"] },
    { id: "PyBioNetGen_Core_Polynomial_Ground", name: "PyBioNetGen Core: Polynomial Ground Truth Reference", description: "Implementation of the parabola", tags: ["mathematical-model","reference-standard"] },
    { id: "PyBioNetGen_Core_RAFi", name: "PyBioNetGen Core: Raf Inhibitor Model", description: "PyBioNetGen Core RAFi", tags: ["rafi","raf-kinase","enzyme-inhibition"] },
    { id: "PyBioNetGen_Core_RAFi_Ground", name: "PyBioNetGen Core: Raf Inhibitor Ground Truth Reference", description: "PyBioNetGen Core RAFi Ground", tags: ["rafi","raf-kinase","reference-standard"] },
    { id: "PyBioNetGen_Core_Receptor", name: "PyBioNetGen Core: Simple Ligand-Receptor Binding", description: "A simple model of", tags: ["ligand-receptor","binding-kinetics"] },
    { id: "PyBioNetGen_Core_Receptor_NF", name: "PyBioNetGen Core: Ligand-Receptor Network-Free Simulation", description: "A simple model of", tags: ["ligand-receptor","binding-kinetics","nfsim"] },
    { id: "PyBioNetGen_Core_TCR", name: "PyBioNetGen Core: T Cell Receptor Activation", description: "A model of T", tags: ["tcr","immune-signaling","phosphorylation"] },
    { id: "PyBioNetGen_Core_TLBR", name: "PyBioNetGen Core: Trivalent Ligand Bivalent Receptor Model", description: "A model of trivalent", tags: ["tlbr","polymerization","ligand-receptor"] },
    { id: "PyBioNetGen_Degranulation_Model", name: "PyBioNetGen Core: IgE Receptor Degranulation Model", description: "Degranulation model", tags: ["fceri","degranulation","mast-cell","immune-signaling"] },
    { id: "PyBioNetGen_EGFR_Ground", name: "PyBioNetGen Core: Canonical EGFR Ground Truth Reference", description: "Blinov et al. 2006.", tags: ["egfr","signaling","reference-standard"] },
    { id: "PyBioNetGen_EGFR_Model", name: "PyBioNetGen Core: Canonical EGFR Signaling Model", description: "Blinov et al. 2006.", tags: ["egfr","signaling","receptor-activation"] },
    { id: "PyBioNetGen_EGFR_NF", name: "PyBioNetGen Core: EGFR Network-Free Simulation", description: "PyBioNetGen EGFR NF", tags: ["egfr","signaling","nfsim","network-free"] },
    { id: "PyBioNetGen_EGFR_ODE", name: "PyBioNetGen Core: EGFR ODE-Based Simulation", description: "PyBioNetGen EGFR ODE", tags: ["egfr","signaling","ode-solver"] },
    { id: "PyBioNetGen_EGFR_ODE_Pub", name: "PyBioNetGen Core: Published EGFR ODE-Based Model", description: "EGFR ODE", tags: ["egfr","signaling","ode-solver"] },
    { id: "PyBioNetGen_Egg", name: "PyBioNetGen Egg Cell Oscillator Test", description: "Egg calcium oscillator", tags: ["test-case","calcium-oscillation"] },
    { id: "PyBioNetGen_ErrNoFrees", name: "PyBioNetGen Free Molecule Error Test", description: "Error: no free sites", tags: ["test-case","error-handling"] },
    { id: "PyBioNetGen_Example1", name: "PyBioNetGen Core: Example 1 EGFR Model", description: "PyBioNetGen Example1", tags: ["egfr","signaling","example-model"] },
    { id: "PyBioNetGen_Example2_Start", name: "PyBioNetGen Core: Example 2 EGFR Starting Point", description: "PyBioNetGen Example2 Start", tags: ["egfr","signaling","starting-point","example-model"] },
    { id: "PyBioNetGen_FceRI_Gamma2", name: "PyBioNetGen Core: FceRI Gamma2 Subunit Signaling", description: "PyBioNetGen FceRI Gamma2", tags: ["fceri","gamma2-subunit","immune-signaling"] },
    { id: "PyBioNetGen_FceRI_Gamma2_Ground", name: "PyBioNetGen Core: FceRI Gamma2 Ground Truth Reference", description: "PyBioNetGen FceRI Gamma2 Ground", tags: ["fceri","gamma2-subunit","reference-standard"] },
    { id: "PyBioNetGen_FreeMissing", name: "PyBioNetGen Free Species Constraint Test", description: "Error: missing free", tags: ["test-case","constraints"] },
    { id: "PyBioNetGen_IGF1R_Activation", name: "PyBioNetGen Core: IGF1R Receptor Activation Model", description: "Author: William S. Hlavacek", tags: ["igf1r","receptor-activation","phosphorylation"] },
    { id: "PyBioNetGen_LilyIgE", name: "PyBioNetGen Lily IgE Receptor Test Model", description: "IgE receptor binding", tags: ["test-case","fceri","immune-signaling"] },
    { id: "PyBioNetGen_Model", name: "PyBioNetGen Core: Generic Mast Cell Degranulation Model", description: "PyBioNetGen Model", tags: ["fceri","degranulation","mast-cell"] },
    { id: "PyBioNetGen_Model_aMCMC", name: "PyBioNetGen Core: Mast Cell Degranulation via aMCMC Fitting", description: "A model of IgE", tags: ["fceri","degranulation","amcmc-fitting"] },
    { id: "PyBioNetGen_Model_ToFit", name: "PyBioNetGen Core: Mast Cell Degranulation for Fitting", description: "A model of IgE", tags: ["fceri","degranulation","parameter-fitting"] },
    { id: "PyBioNetGen_NFmodel", name: "PyBioNetGen NFsim Simulation Test", description: "NFsim test model", tags: ["test-case","nfsim"] },
    { id: "PyBioNetGen_NoFrees", name: "PyBioNetGen No Free Constraints Verification", description: "No free sites test", tags: ["test-case","constraints"] },
    { id: "PyBioNetGen_NoGenerateNetwork", name: "PyBioNetGen Direct Simulation Without Expansion Test", description: "No network generation", tags: ["test-case","simulation-modes"] },
    { id: "PyBioNetGen_NoSuffix", name: "PyBioNetGen No Suffix Output Naming Test", description: "No suffix test", tags: ["test-case","output-formatting"] },
    { id: "PyBioNetGen_Parabola", name: "PyBioNetGen Parabolic Trajectory Test", description: "Parabola fitting", tags: ["test-case","mathematical-model"] },
    { id: "PyBioNetGen_Parabola_Files", name: "PyBioNetGen Parabolic Trajectory Files Test", description: "Parabola file fitting", tags: ["test-case","mathematical-model"] },
    { id: "PyBioNetGen_Parabola_Special", name: "PyBioNetGen Parabolic Trajectory Special Cases Test", description: "Parabola special case", tags: ["test-case","mathematical-model"] },
    { id: "PyBioNetGen_Parabola2", name: "PyBioNetGen Parabolic Trajectory Alternative Test", description: "Parabola fitting (2)", tags: ["test-case","mathematical-model"] },
    { id: "PyBioNetGen_ParamsEverywhere", name: "PyBioNetGen Global Parameters Boundary Test", description: "Parameters everywhere test", tags: ["test-case","parameter-boundaries"] },
    { id: "PyBioNetGen_Polynomial_T6", name: "PyBioNetGen Polynomial Trajectory Test (T6-check)", description: "Polynomial T6 fitting", tags: ["test-case","mathematical-model"] },
    { id: "PyBioNetGen_Simple", name: "PyBioNetGen Simple Synthesis & Decay Test", description: "Simple PyBNF model", tags: ["test-case","synthesis-decay"] },
    { id: "PyBioNetGen_Simple_AddActions", name: "PyBioNetGen Simple Synthesis with Dynamic Actions", description: "AddActions syntax demo", tags: ["test-case","actions"] },
    { id: "PyBioNetGen_Simple_Answer", name: "PyBioNetGen Simple Synthesis with Response Check", description: "An example from a", tags: ["test-case","verification"] },
    { id: "PyBioNetGen_Simple_GenOnly", name: "PyBioNetGen Simple Synthesis Network-Generation Only", description: "An example from a", tags: ["test-case","network-generation"] },
    { id: "PyBioNetGen_Simple_NF_Seed", name: "PyBioNetGen NFsim Seed Population Test", description: "PyBioNetGen Simple NF Seed", tags: ["test-case","nfsim","seed"] },
    { id: "PyBioNetGen_Simple_NoGen", name: "PyBioNetGen Simple Synthesis Without Network-Generation", description: "An example from a", tags: ["test-case","direct-simulation"] },
    { id: "PyBioNetGen_Tricky", name: "PyBioNetGen Complex Pattern Matching Test", description: "An example from a", tags: ["test-case","pattern-matching"] },
    { id: "PyBioNetGen_TrickyUS", name: "PyBioNetGen Unstructured Boundary State Test", description: "An example from a", tags: ["test-case","boundary-states"] },
    { id: "PyBioNetGen_Trivial", name: "PyBioNetGen Trivial Decay Reaction Test", description: "A trivial model file", tags: ["test-case","decay-kinetics"] },
    { id: "PyBNF_fitting_setup_190127_CHO_EGFR_forBNF", name: "PyBNF-fitting-setup", description: "PyBNF fitting setup 190127", tags: ["2019","egfr","salazar"] },
    { id: "quasi_equilibrium", name: "quasi equilibrium", description: "Quasi-equilibrium approximation", tags: ["toy models","quasi","equilibrium"] },
    { id: "quorum-sensing-circuit", name: "quorum sensing circuit", description: "quorum sensing circuit", tags: ["quorum","sensing","circuit","autoinducer","autoinducer_env","gene","protein"] },
    { id: "rab-gtpase-cycle", name: "rab gtpase cycle", description: "rab gtpase cycle", tags: ["rab","gtpase","cycle","gef","gap","effector"] },
    { id: "Ran_NuclearTransport", name: "Rule-Based Ran-Mediated Nuclear Transport Model", description: "Nuclear Ran transport", tags: ["ran-gtpase","nuclear-transport","nuclear-pore-complex","import-export"] },
    { id: "Ran_NuclearTransport_Draft", name: "Rule-Based Ran-Mediated Nuclear Transport Model (Draft)", description: "Ran transport (draft)", tags: ["ran-gtpase","nuclear-transport","nuclear-pore-complex","draft-model"] },
    { id: "rankl-rank-signaling", name: "rankl rank signaling", description: "RANKL-RANK-OPG signaling in bone", tags: ["rankl","rank","signaling","opg","nfat","traf6"] },
    { id: "ras-gef-gap-cycle", name: "ras gef gap cycle", description: "Ras-GEF-GAP cycle with explicit", tags: ["ras","gef","gap","cycle","sos","rasgap"] },
    { id: "rec_dim", name: "rec_dim", description: "Ligand-receptor binding", tags: ["rec","dim","lig","writemdl"] },
    { id: "rec_dim_comp", name: "rec_dim_comp", description: "name dimension volume contained_by", tags: ["rec","dim","lig","writemdl"] },
    { id: "receptor_nf", name: "receptor nf", description: "A simple model of", tags: ["receptor","nf"] },
    { id: "Repressilator", name: "Repressilator", description: "Repressilator circuit", tags: ["repressilator","gtetr","gci","glaci","mtetr","mci","mlaci","ptetr","pci"] },
    { id: "repressilator-oscillator", name: "repressilator oscillator", description: "repressilator oscillator", tags: ["repressilator","oscillator","genea","geneb","genec","mrna_a","mrna_b","mrna_c","proteina","proteinb"] },
    { id: "retinoic-acid-signaling", name: "retinoic acid signaling", description: "retinoic acid signaling", tags: ["retinoic","acid","signaling","ra","rarrxr","corepressor","targetgene"] },
    { id: "rho-gtpase-actin-cytoskeleton", name: "rho gtpase actin cytoskeleton", description: "RhoA-GTPase regulation of the", tags: ["rho","gtpase","actin","cytoskeleton","rhoa","rock","limk","cofilin"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_best-fit", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_CHO_EGFR_best-fit)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_Epigen", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_CHO_EGFR_Epigen)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_sensitivity", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_CHO_EGFR_sensitivity)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_CHO_HA_EGFR_L858R", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_CHO_HA_EGFR_L858R)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_HeLa", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_HeLa)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_HMEC", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_HMEC)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "Salazar_Cavazos_egfr_2019_190127_MCF10A", name: "Salazar-Cavazos et al. 2019: Single-Molecule EGFR Phosphorylation Dynamics (190127_MCF10A)", description: "Salazar Cavazos egfr 2019", tags: ["egfr","single-molecule","phosphorylation","2019","salazar"] },
    { id: "SHP2_base_model", name: "SHP2_base_model", description: "Base model of Shp2", tags: ["shp2","base","exclude_reactants"] },
    { id: "shp2-phosphatase-regulation", name: "shp2 phosphatase regulation", description: "SHP2 phosphatase regulation via", tags: ["shp2","phosphatase","regulation","rtk","substrate"] },
    { id: "signal-amplification-cascade", name: "signal amplification cascade", description: "signal amplification cascade", tags: ["signal","amplification","cascade","ligand","receptor","effector","messenger"] },
    { id: "simple", name: "simple", description: "Simple binding model", tags: ["tutorials","simple","dnat"] },
    { id: "simple_nfsim_test", name: "simple_nfsim_test", description: "Runtime-only BNGL model migrated", tags: ["simple","nfsim","test"] },
    { id: "simple_sbml_import", name: "simple_sbml_import", description: "SBML import test", tags: ["simple","sbml","import"] },
    { id: "simple_system", name: "simple_system", description: "Simple binding system", tags: ["simple","system"] },
    { id: "simple-dimerization", name: "simple dimerization", description: "simple dimerization", tags: ["simple","dimerization"] },
    { id: "SIR", name: "SIR", description: "SIR", tags: ["sir"] },
    { id: "sir-epidemic-model", name: "sir epidemic model", description: "SIR epidemic dynamics", tags: ["sir","epidemic","model","human"] },
    { id: "smad-tgf-beta-signaling", name: "smad tgf beta signaling", description: "smad tgf beta signaling", tags: ["smad","tgf","beta","signaling","tgfb","tgfbr","smad2","smad4"] },
    { id: "sonic-hedgehog-gradient", name: "sonic hedgehog gradient", description: "Sonic Hedgehog (Shh) morphogen", tags: ["sonic","hedgehog","gradient","shh","ptc1"] },
    { id: "sp_fourier_synthesizer", name: "sp fourier synthesizer", description: "Fourier Series Synthesizer in", tags: ["sp","fourier","synthesizer","s1","s3","s5","s7","s9","wave","c1"] },
    { id: "sp_image_convolution", name: "sp image convolution", description: "Image Convolution Filter in", tags: ["sp","image","convolution","px","ex","sink"] },
    { id: "sp_kalman_filter", name: "sp kalman filter", description: "Kalman Filter in BNGL", tags: ["sp","kalman","filter","truex","obs","estx","estv","variance","innovation"] },
    { id: "stat3-mediated-transcription", name: "stat3 mediated transcription", description: "STAT3-mediated transcription and feedback.", tags: ["stat3","mediated","transcription","dna","pias3","mrna"] },
    { id: "stress-response-adaptation", name: "stress response adaptation", description: "stress response adaptation", tags: ["stress","response","adaptation","sensor","adapter","enzyme"] },
    { id: "Suderman_2013", name: "Suderman 2013", description: "Ensemble model translated into", tags: ["suderman","2013","pheromone","ste2","gpa1","ste4","sst2","ste20"] },
    { id: "synaptic-plasticity-ltp", name: "synaptic plasticity ltp", description: "Initial Concentrations", tags: ["synaptic","plasticity","ltp","glutamate","nmda","calcium","camkii","ampar","glusource"] },
    { id: "synbio_band_pass_filter", name: "synbio band pass filter", description: "synbio band pass filter", tags: ["synbio","band","pass","filter","out"] },
    { id: "synbio_counter_molecular", name: "synbio counter molecular", description: "synbio counter molecular", tags: ["synbio","counter","molecular","state","input"] },
    { id: "synbio_edge_detector", name: "synbio edge detector", description: "synbio edge detector", tags: ["synbio","edge","detector"] },
    { id: "synbio_logic_gates_enzymatic", name: "synbio logic gates enzymatic", description: "synbio logic gates enzymatic", tags: ["synbio","logic","gates","enzymatic","i1","i2","gateand","gateor","outand","outor"] },
    { id: "synbio_oscillator_synchronization", name: "synbio oscillator synchronization", description: "synbio oscillator synchronization", tags: ["synbio","oscillator","synchronization","osc1","osc2","signal"] },
    { id: "t-cell-activation", name: "t cell activation", description: "t cell activation", tags: ["cell","activation","tcr","antigen","cytokine"] },
    { id: "test_ANG_synthesis_simple", name: "test_ANG_synthesis_simple", description: "Synthesis network test", tags: ["test","ang","synthesis","simple","source","source2"] },
    { id: "test_fixed", name: "test_fixed", description: "# actions ##", tags: ["test","fixed"] },
    { id: "test_MM", name: "test_MM", description: "Kinetic constants", tags: ["test","mm"] },
    { id: "test_mratio", name: "test_mratio", description: "Reaction ratio test", tags: ["test","mratio","c_theory","c_upper","c_lower"] },
    { id: "test_network_gen", name: "test_network_gen", description: "fceri model with network", tags: ["test","network","gen","lig","lyn","syk","rec"] },
    { id: "test_sat", name: "test_sat", description: "Kinetic constants", tags: ["test","sat"] },
    { id: "test_synthesis_cBNGL_simple", name: "test_synthesis_cBNGL_simple", description: "Compartmental synthesis", tags: ["test","synthesis","cbngl","simple","source","source2"] },
    { id: "test_synthesis_complex", name: "test_synthesis_complex", description: "Complex synthesis test", tags: ["test","synthesis","complex","receptor","source","source2"] },
    { id: "test_synthesis_complex_0_cBNGL", name: "test_synthesis_complex_0_cBNGL", description: "volume-surface", tags: ["test","synthesis","complex","cbngl","surface_molecule1","surface_molecule2","surface_receptor"] },
    { id: "test_synthesis_complex_source_cBNGL", name: "test_synthesis_complex_source_cBNGL", description: "volume-surface", tags: ["test","synthesis","complex","source","cbngl","surface_molecule1","surface_molecule2","surface_receptor"] },
    { id: "test_synthesis_simple", name: "test_synthesis_simple", description: "Simple synthesis test", tags: ["test","synthesis","simple","source","source2"] },
    { id: "Thomas_egfr_2016_example1_fit", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example1_fit)", description: "Thomas egfr 2016 example1", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example2_fit", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example2_fit)", description: "Thomas egfr 2016 example2", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example3_fit", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example3_fit)", description: "Thomas egfr 2016 example3", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example4_fit", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example4_fit)", description: "Thomas egfr 2016 example4", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example5_fit", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example5_fit)", description: "Thomas egfr 2016 example5", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example5_ground_truth", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example5_ground_truth)", description: "Thomas egfr 2016 example5", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_egfr_2016_example6_ground_truth", name: "Thomas et al. 2016: Parameter Fitting of EGFR Signaling (example6_ground_truth)", description: "Thomas egfr 2016 example6", tags: ["egfr","signaling","parameter-fitting","2016","thomas"] },
    { id: "Thomas_Example1_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 1 Starting Point", description: "Thomas Example1", tags: ["egfr","signaling","starting-point","2016","thomas"] },
    { id: "Thomas_Example2_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 2 Starting Point", description: "Thomas Example2", tags: ["egfr","signaling","starting-point","2016","thomas"] },
    { id: "Thomas_Example3_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 3 (TLBR)", description: "Thomas Example3", tags: ["tlbr","polymerization","ligand-receptor","2016","thomas"] },
    { id: "Thomas_Example4_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 4 Model", description: "Supplementary File A in", tags: ["egfr","signaling","2016","thomas"] },
    { id: "Thomas_Example5_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 5 Model", description: "A simple model", tags: ["egfr","signaling","2016","thomas"] },
    { id: "Thomas_Example6_2016", name: "Thomas et al. 2016: Parameter Fitting - Example 6 Model", description: "A simple model", tags: ["egfr","signaling","2016","thomas"] },
    { id: "tlmr", name: "tlmr", description: "Trivalent ligand monovalent receptor", tags: ["tlmr"] },
    { id: "tlr3-dsrna-sensing", name: "tlr3 dsrna sensing", description: "TLR3-mediated dsRNA sensing and", tags: ["tlr3","dsrna","sensing","trif","irf3","sarm"] },
    { id: "tnf-induced-apoptosis", name: "tnf induced apoptosis", description: "tnf induced apoptosis", tags: ["tnf","induced","apoptosis","tnfr","caspase8","bid","caspase3"] },
    { id: "toggle", name: "Toggle", description: "Toggle switch", tags: ["toggle","writemfile"] },
    { id: "toy-jim", name: "toy-jim", description: "The model consists of", tags: ["toy","jim"] },
    { id: "toy1", name: "toy1", description: "Basic signaling toy", tags: ["tutorials","toy1"] },
    { id: "toy2", name: "toy2", description: "Enzymatic reaction toy", tags: ["tutorials","toy2"] },
    { id: "translateSBML", name: "translateSBML", description: "translateSBML", tags: ["translatesbml"] },
    { id: "two-component-system", name: "two component system", description: "two component system", tags: ["two","component","system","kinase","regulator","target"] },
    { id: "univ_synth", name: "univ_synth", description: "example of universal synthesis", tags: ["univ","synth"] },
    { id: "vegf-angiogenesis", name: "vegf angiogenesis", description: "VEGF-mediated signaling in angiogenesis.", tags: ["vegf","angiogenesis","vegfr2","vegfr1","erk","endothelial"] },
    { id: "Vilar_Circadian_2002", name: "Vilar 2002", description: "Genetic oscillator", tags: ["2002","dna","oscillations"] },
    { id: "Vilar_Circadian_2002b", name: "Vilar 2002b", description: "Gene oscillator", tags: ["2002","dna","oscillations"] },
    { id: "Vilar_Circadian_2002c", name: "Vilar 2002c", description: "Gene oscillator", tags: ["2002","dna","oscillations"] },
    { id: "viral-sensing-innate-immunity", name: "viral sensing innate immunity", description: "viral sensing innate immunity", tags: ["viral","sensing","innate","immunity","viralrna","rigi","mavs","irf3","ifnb"] },
    { id: "visualize", name: "Visualize", description: "Visualization toy", tags: [] },
    { id: "wacky_alchemy_stone", name: "wacky alchemy stone", description: "wacky alchemy stone", tags: ["wacky","alchemy","stone","lead","gold"] },
    { id: "wacky_black_hole", name: "wacky black hole", description: "wacky black hole", tags: ["wacky","black","hole","bh"] },
    { id: "wacky_bouncing_ball", name: "wacky bouncing ball", description: "wacky bouncing ball", tags: ["wacky","bouncing","ball","height","velocity"] },
    { id: "wacky_traffic_jam_asep", name: "wacky traffic jam asep", description: "wacky traffic jam asep", tags: ["wacky","traffic","jam","asep","site","car"] },
    { id: "wacky_zombie_infection", name: "wacky zombie infection", description: "wacky zombie infection", tags: ["wacky","zombie","infection","human"] },
    { id: "wnt-beta-catenin-signaling", name: "wnt beta catenin signaling", description: "Wnt-beta-catenin signaling", tags: ["wnt","beta","catenin","signaling","frizzled","dvl","dest_complex","betacatenin","tcf"] },
    { id: "wound-healing-pdgf-signaling", name: "wound healing pdgf signaling", description: "PDGF wound healing", tags: ["wound","healing","pdgf","signaling","pdgfr","stat3","fibroblast"] },
    { id: "Yang_tlbr_2008", name: "Yang 2008", description: "TLBR yang 2008", tags: ["2008","yang"] },
    { id: "ZAP70_immunology_2021", name: "Model ZAP", description: "ZAP-70 recruitment", tags: ["cbl","dead","lck","ligand","modelzap","nfsim","zap","zeta"] },
    { id: "Zhang_developmental_2021", name: "Zhang et al. 2021: VE-PTP and Tie2 Receptor Regulation Model", description: "CAR-T signaling", tags: ["ve-ptp","tie2","angiogenesis","2021","zhang"] },
    { id: "Zhang_developmental_2023", name: "Zhang et al. 2023: VEGF-induced PLC-gamma Activation Model", description: "VEGF signaling", tags: ["vegf","plc-gamma","angiogenesis","2023","zhang"] }
];

const MODEL_INDEX = new Map(ALL_MODELS.map(m => [m.id, m]));

export const BNG2_COMPATIBLE = new Set(["AB","ABC","ABC_scan","ABC_ssa","ABp","ABp_approx","akt-signaling","allosteric-activation","ampk-signaling","An_TLR4_2009","apoptosis-cascade","auto-activation-loop","autophagy-regulation","BAB","BAB_coop","BAB_scan","Barua_BCR_2012","bcr-signaling","beta-adrenergic-response","birth-death","bistable-toggle-switch","BLBR","Blinov_egfr_NF_2006","blood-coagulation-thrombin","bmp-signaling","brusselator-oscillator","calcineurin-nfat-pathway","calcium-spike-signaling","CaOscillate_Func","CaOscillate_Sat","caspase-activation-loop","catalysis","cBNGL_simple","cd40-signaling","cell-cycle-checkpoint","checkpoint-kinase-signaling","Cheemalavagu_JAKSTAT_2024","chemotaxis-signal-transduction","Chylek_library","Chylek_TCR_2014","circadian-oscillator","clock-bmal1-gene-circuit","compartment_endocytosis","compartment_membrane_bound","compartment_nested_transport","compartment_nuclear_transport","compartment_organelle_exchange","competitive-enzyme-inhibition","complement-activation-cascade","ComplexDegradation","contact-inhibition-hippo-yap","cooperative-binding","Creamer_2012","cs_diffie_hellman","cs_hash_function","cs_huffman","cs_monte_carlo_pi","cs_pagerank","cs_pid_controller","cs_regex_nfa","Dembo_blbr_1978","dna-damage-repair","dna-methylation-dynamics","dr5-apoptosis-signaling","Dreisigmeyer_LacOperon_2008","dual-site-phosphorylation","Dushek_TCR_2011","Dushek_TCR_2014","e2f-rb-cell-cycle-switch","eco_coevolution_host_parasite","eco_food_web_chaos_3sp","eco_lotka_volterra_grid","eco_mutualism_obligate","eco_rock_paper_scissors_spatial","egfr_net_red","egfr_path","egfr_simple","egfr-signaling-pathway","eif2a-stress-response","endosomal-sorting-rab","energy_allostery_mwc","energy_catalysis_mm","energy_cooperativity_adh","energy_example1","energy_linear_chain","energy_transport_pump","er-stress-response","erk-nuclear-translocation","Faeder_egfr_2009","Faeder_FceRI_2003_Faeder_2003","Faeder_FceRI_2003_fceri_ji","Faeder_FceRI_Fyn_2003","FceRI_ji","feature_functional_rates_volume","feature_global_functions_scan","feature_local_functions_explicit","feature_symmetry_factors_cyclic","feature_synthesis_degradation_ss","fgf-signaling-pathway","Gardner_Toggle_2000","gas6-axl-signaling","gene-expression-toggle","genetic_bistability_energy","genetic_dna_replication_stochastic","genetic_goodwin_oscillator","genetic_translation_kinetics","genetic_turing_pattern_1d","GK","glioblastoma-egfrviii-signaling","glycolysis-branch-point","gm_game_of_life","gm_ray_marcher","Goldstein_blbr_1980","gpcr-desensitization-arrestin","Harmon_Antigen_2017","Haugh2b","hedgehog-signaling-pathway","heise","hematopoietic-growth-factor","hif1a_degradation_loop","HIV_Dynamics_pt303","HIV_Dynamics_pt403","HIV_Dynamics_pt409","Hlavacek_Egg_2018","Hlavacek_Elephant_2018_elephant_EFA","Hlavacek_Elephant_2018_elephant_fit","Hlavacek_Proofreading_2001","Hlavacek_Restructuration_2018_after_bunching","Hlavacek_Restructuration_2018_after_decoupling","Hlavacek_Restructuration_2018_after_scaling","Hlavacek_Restructuration_2018_before_bunching","Hlavacek_Restructuration_2018_before_decoupling","Hlavacek_Restructuration_2018_before_scaling","Hlavacek_Restructuration_2018_check_scaling","Hlavacek_Steric_1999","hypoxia-response-signaling","il1b-signaling","il6-jak-stat-pathway","immune-synapse-formation","inflammasome-activation","inositol-phosphate-metabolism","insulin-glucose-homeostasis","interferon-signaling","ire1a-xbp1-er-stress","issue_198_short","jak-stat-cytokine-signaling","JaruszewiczBlonska_NFkB_2023","jnk-mapk-signaling","kir-channel-regulation","Korwek_InnateImmunity_2023","Korwek_ViralSensing_2023","l-type-calcium-channel-dynamics","lac-operon-regulation","Lang_CellCycle_2024","Ligon_egfr_2014","Lin_ERK_2019","Lin_Prion_2019","Lin_ScalingBench_2019_ERK_model","Lin_ScalingBench_2019_prion_model","Lin_ScalingBench_2019_TCR_model","Lin_TCR_2019","lipid-mediated-pip3-signaling","Lisman","Lisman_bifurcate","localfunc","LR","LR_comp","LRR","LRR_comp","LV","LV_comp","Macken_physics_1982","Mallela_Cities_2021","Mallela_COVID_2021","Mallela_MSAs_2022","Mallela_VaxVariants_Alabama_2022","Mallela_VaxVariants_Dallas_2022","Mallela_VaxVariants_Houston_2022","Mallela_VaxVariants_MyrtleBeach_2022","Mallela_VaxVariants_NYC_2022","Mallela_VaxVariants_Phoenix_2022","mapk-signaling-cascade","Massole_developmental_2023","McMillan_TNF_2021","meta_formal_game_theory","meta_formal_molecular_clock","meta_formal_petri_net","michaelis-menten-kinetics","michment","Miller_MEK_2025","Miller_NavajoNation_2022","Mitra_Degranulation_2019","Mitra_EGFR_2019","Mitra_EGFR_2019_egfr","Mitra_EGFR_2019_egfr_ground","Mitra_EGFR_NF_2019","Mitra_EGFR_ODE_2019","Mitra_EGFR_SSA_2019_egfr","Mitra_EGFR_SSA_2019_egfr_ground","Mitra_EggOscillator_2019","Mitra_ElephantFitting_2019","Mitra_FceRI_gamma2_2019","Mitra_IGF1R_2019","Mitra_JNK_2019","Mitra_JobScheduling_2019_jobs_ground","Mitra_JobScheduling_2019_jobs_tofit","Mitra_Likelihood_2019","Mitra_Likelihood_P16_2019","Mitra_Likelihood_P16_3cat_2019","Mitra_Likelihood_P32_2019","Mitra_Likelihood_P32_3cat_2019","Mitra_Likelihood_P4_2019","Mitra_Likelihood_P4_3cat_2019","Mitra_Likelihood_P64_2019","Mitra_Likelihood_P64_3cat_2019","Mitra_Likelihood_P8_2019","Mitra_Likelihood_P8_3cat_2019","Mitra_Likelihood_Quant_2019","Mitra_MAPK_2019_Scaff-22_ground","Mitra_MAPK_2019_Scaff-22_tofit","Mitra_MAPK_Ensemble_2019_ensemble_tofit","Mitra_MAPK_Ensemble_2019_machine_tofit","Mitra_Rab_wt_2019_rab_mon1ccz1_ox","Mitra_Rab_wt_2019_rab_rab5_ox","Mitra_Rab_wt_2019_rab_rab7_ox","Mitra_Rab_wt_2019_rab_wt","Mitra_Rab_wt_pybnf_2019_rab_mon1ccz1_ox","Mitra_Rab_wt_pybnf_2019_rab_rab5_ox","Mitra_Rab_wt_pybnf_2019_rab_rab7_ox","Mitra_Rab_wt_pybnf_2019_rab_wt","Mitra_RafConstraint_2019","Mitra_RafConstraint4_2019","Mitra_SimpleReceptor_2019_example5_starting_point","Mitra_SimpleReceptor_2019_receptor","Mitra_SimpleReceptor_NF_2019","Mitra_TCR_2019","Mitra_TCRSensitivity_2019","Mitra_ThreeStepCascade_2019_m1","Mitra_ThreeStepCascade_2019_m1_ground","Mitra_TLBR_2019","ml_gradient_descent","ml_hopfield","ml_kmeans","ml_q_learning","ml_svm","Motivating_example","Motivating_example_cBNGL","motor","mt_arithmetic_compiler","mt_bngl_interpreter","mt_music_sequencer","mt_pascal_triangle","mt_quine","mtor-signaling","mtorc2-signaling","Mukhopadhyay_TCR_2013","mwc","myogenic-differentiation","negative-feedback-loop","neurotransmitter-release","nfkb","nfkb-feedback","nfsim_aggregation_gelation","nfsim_coarse_graining","nfsim_dynamic_compartments","nfsim_hybrid_particle_field","nfsim_ring_closure_polymer","nn_xor","no-cgmp-signaling","notch-delta-lateral-inhibition","organelle_transport","organelle_transport_struct","oxidative-stress-response","p38-mapk-signaling","p53-mdm2-oscillator","parp1-mediated-dna-repair","ph_lorenz_attractor","ph_nbody_gravity","ph_schrodinger","ph_wave_equation","phosphorelay-chain","platelet-activation","polymer","polymer_draft","polymer_fixed","polynomial","Posner_blbr_1995","Posner_blbr_2004","predator-prey-dynamics","process_actin_treadmilling","process_autophagy_flux","process_cell_adhesion_strength","process_kinetic_proofreading_tcr","process_quorum_sensing_switch","PyBioNetGen_Actions_Syntax","PyBioNetGen_BNG_Error","PyBioNetGen_Core_Parabola","PyBioNetGen_Core_Parabola_Demo","PyBioNetGen_Core_Parabola_Ground","PyBioNetGen_Core_Polynomial","PyBioNetGen_Core_Polynomial_Ground","PyBioNetGen_Core_RAFi","PyBioNetGen_Core_RAFi_Ground","PyBioNetGen_Core_Receptor","PyBioNetGen_Core_Receptor_NF","PyBioNetGen_Core_TCR","PyBioNetGen_Core_TLBR","PyBioNetGen_Degranulation_Model","PyBioNetGen_EGFR_Ground","PyBioNetGen_EGFR_Model","PyBioNetGen_EGFR_NF","PyBioNetGen_EGFR_ODE","PyBioNetGen_Egg","PyBioNetGen_ErrNoFrees","PyBioNetGen_Example1","PyBioNetGen_Example2_Start","PyBioNetGen_FceRI_Gamma2","PyBioNetGen_FceRI_Gamma2_Ground","PyBioNetGen_FreeMissing","PyBioNetGen_IGF1R_Activation","PyBioNetGen_LilyIgE","PyBioNetGen_Model","PyBioNetGen_Model_aMCMC","PyBioNetGen_Model_ToFit","PyBioNetGen_NFmodel","PyBioNetGen_NoFrees","PyBioNetGen_NoGenerateNetwork","PyBioNetGen_NoSuffix","PyBioNetGen_Parabola","PyBioNetGen_Parabola_Files","PyBioNetGen_Parabola_Special","PyBioNetGen_Parabola2","PyBioNetGen_ParamsEverywhere","PyBioNetGen_Polynomial_T6","PyBioNetGen_Simple","PyBioNetGen_Simple_AddActions","PyBioNetGen_Simple_Answer","PyBioNetGen_Simple_GenOnly","PyBioNetGen_Simple_NF_Seed","PyBioNetGen_Simple_NoGen","PyBioNetGen_Tricky","PyBioNetGen_TrickyUS","PyBioNetGen_Trivial","PyBNF_fitting_setup_190127_CHO_EGFR_forBNF","quasi_equilibrium","quorum-sensing-circuit","rab-gtpase-cycle","rankl-rank-signaling","ras-gef-gap-cycle","receptor_nf","Repressilator","repressilator-oscillator","retinoic-acid-signaling","rho-gtpase-actin-cytoskeleton","Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_best-fit","Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_Epigen","Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_sensitivity","Salazar_Cavazos_egfr_2019_190127_CHO_HA_EGFR_L858R","Salazar_Cavazos_egfr_2019_190127_HeLa","Salazar_Cavazos_egfr_2019_190127_HMEC","Salazar_Cavazos_egfr_2019_190127_MCF10A","SHP2_base_model","shp2-phosphatase-regulation","signal-amplification-cascade","simple_nfsim_test","simple_system","simple-dimerization","SIR","sir-epidemic-model","smad-tgf-beta-signaling","sonic-hedgehog-gradient","sp_fourier_synthesizer","sp_image_convolution","sp_kalman_filter","stat3-mediated-transcription","stress-response-adaptation","Suderman_2013","synaptic-plasticity-ltp","synbio_band_pass_filter","synbio_counter_molecular","synbio_edge_detector","synbio_logic_gates_enzymatic","synbio_oscillator_synchronization","t-cell-activation","test_ANG_synthesis_simple","test_fixed","test_MM","test_mratio","test_sat","test_synthesis_cBNGL_simple","test_synthesis_complex","test_synthesis_complex_0_cBNGL","test_synthesis_complex_source_cBNGL","test_synthesis_simple","Thomas_egfr_2016_example1_fit","Thomas_egfr_2016_example2_fit","Thomas_egfr_2016_example3_fit","Thomas_egfr_2016_example4_fit","Thomas_egfr_2016_example5_fit","Thomas_egfr_2016_example5_ground_truth","Thomas_egfr_2016_example6_ground_truth","Thomas_Example1_2016","Thomas_Example2_2016","Thomas_Example3_2016","Thomas_Example4_2016","Thomas_Example5_2016","Thomas_Example6_2016","tlmr","tlr3-dsrna-sensing","tnf-induced-apoptosis","toy-jim","translateSBML","two-component-system","univ_synth","vegf-angiogenesis","viral-sensing-innate-immunity","visualize","wacky_alchemy_stone","wacky_black_hole","wacky_bouncing_ball","wacky_traffic_jam_asep","wacky_zombie_infection","wnt-beta-catenin-signaling","wound-healing-pdgf-signaling","Yang_tlbr_2008","ZAP70_immunology_2021"]);
export const NFSIM_COMPATIBLE = new Set(["AB","ABC","ABC_ssa","ABp","ABp_approx","akt-signaling","allosteric-activation","apoptosis-cascade","auto-activation-loop","BAB","BAB_coop","beta-adrenergic-response","bistable-toggle-switch","BLBR","Blinov_egfr_NF_2006","Blinov_ran_2006","blood-coagulation-thrombin","brusselator-oscillator","calcium-spike-signaling","cBNGL_simple","cell-cycle-checkpoint","Chattaraj_nephrin_2021","chemotaxis-signal-transduction","Chylek_FceRI_2014","Chylek_library","Chylek_TCR_2014","circadian-oscillator","CircadianOscillator","competitive-enzyme-inhibition","complement-activation-cascade","cooperative-binding","Creamer_2012","cs_hash_function","cs_pid_controller","dna-damage-repair","dual-site-phosphorylation","Dushek_TCR_2014","egfr_simple","egfr-signaling-pathway","er-stress-response","Faeder_FceRI_2003_Faeder_2003","Faeder_FceRI_2003_fceri_ji","Faeder_FceRI_Fyn_2003","gene-expression-toggle","GK","glycolysis-branch-point","gm_ray_marcher","Goldstein_TLBR_1984","hematopoietic-growth-factor","hif1a_degradation_loop","hypoxia-response-signaling","immune-synapse-formation","inflammasome-activation","insulin-glucose-homeostasis","interferon-signaling","jak-stat-cytokine-signaling","Kesseler_CellCycle_2013","Kocieniewski_published_2012","lac-operon-regulation","Ligon_egfr_2014","lipid-mediated-pip3-signaling","Lisman","Lisman_bifurcate","LR","LR_comp","LRR","LRR_comp","mapk-signaling-cascade","Massole_developmental_2023","McMillan_TNF_2021","Mertins_cancer_2023","michaelis-menten-kinetics","michment_cont","Mitra_EGFR_NF_2019","Mitra_JobScheduling_2019_jobs_ground","Mitra_JobScheduling_2019_jobs_tofit","Mitra_MAPK_Ensemble_2019_ensemble_tofit","Mitra_MAPK_Ensemble_2019_machine_tofit","Mitra_SimpleReceptor_NF_2019","Mitra_TCR_2019","Mitra_TCRSensitivity_2019","Mitra_TLBR_2019","ml_gradient_descent","ml_q_learning","mt_music_sequencer","mtor-signaling","myogenic-differentiation","negative-feedback-loop","neurotransmitter-release","nfkb-feedback","notch-delta-lateral-inhibition","Ordyan_CaMKIIholo_2020","Ordyan_extraCaMKIIHolo_2020","organelle_transport","organelle_transport_struct","oxidative-stress-response","p53-mdm2-oscillator","ph_lorenz_attractor","phosphorelay-chain","platelet-activation","polymer","polymer_draft","polymer_fixed","predator-prey-dynamics","PyBioNetGen_Core_Receptor_NF","PyBioNetGen_Core_TCR","PyBioNetGen_Core_TLBR","PyBioNetGen_EGFR_NF","PyBioNetGen_Example2_Start","PyBioNetGen_FceRI_Gamma2","PyBioNetGen_NFmodel","PyBioNetGen_NoGenerateNetwork","PyBioNetGen_Simple_NoGen","PyBioNetGen_Tricky","quorum-sensing-circuit","rab-gtpase-cycle","receptor_nf","Repressilator","repressilator-oscillator","retinoic-acid-signaling","signal-amplification-cascade","simple_nfsim_test","simple-dimerization","SIR","sir-epidemic-model","smad-tgf-beta-signaling","sp_fourier_synthesizer","sp_image_convolution","sp_kalman_filter","stress-response-adaptation","Suderman_2013","synaptic-plasticity-ltp","t-cell-activation","Thomas_Example2_2016","Thomas_Example3_2016","Thomas_Example4_2016","Thomas_Example6_2016","tnf-induced-apoptosis","two-component-system","vegf-angiogenesis","viral-sensing-innate-immunity","visualize","wnt-beta-catenin-signaling","wound-healing-pdgf-signaling","ZAP70_immunology_2021"]);
export const EXCLUDED = new Set([]);

const GALLERY_CATEGORIES: { id: string; name: string; description: string; sortOrder: number }[] = [
  {
    "id": "cancer",
    "name": "Cancer Biology",
    "description": "Oncogenic signaling pathways and cancer models",
    "sortOrder": 0
  },
  {
    "id": "immunology",
    "name": "Immunology",
    "description": "Immune signaling models, TCR, BCR, Fc receptors",
    "sortOrder": 1
  },
  {
    "id": "neuroscience",
    "name": "Neuroscience",
    "description": "Neuronal signaling, neural networks, synaptic models",
    "sortOrder": 2
  },
  {
    "id": "cell-cycle",
    "name": "Cell Cycle",
    "description": "Cell division, cell cycle regulation models",
    "sortOrder": 3
  },
  {
    "id": "metabolism",
    "name": "Metabolism",
    "description": "Metabolic networks, biochemical pathways",
    "sortOrder": 4
  },
  {
    "id": "developmental",
    "name": "Developmental Biology",
    "description": "Developmental signaling, pattern formation",
    "sortOrder": 5
  },
  {
    "id": "ecology",
    "name": "Ecology",
    "description": "Population dynamics, ecological networks",
    "sortOrder": 6
  },
  {
    "id": "physics",
    "name": "Physics",
    "description": "Physical systems modeled with BNGL",
    "sortOrder": 7
  },
  {
    "id": "cs",
    "name": "Computer Science",
    "description": "CS models, computational systems",
    "sortOrder": 8
  },
  {
    "id": "ml-signal",
    "name": "ML / Signal Processing",
    "description": "Signal processing, machine learning models",
    "sortOrder": 9
  },
  {
    "id": "synbio",
    "name": "Synthetic Biology",
    "description": "Synthetic gene circuits, engineered systems",
    "sortOrder": 10
  },
  {
    "id": "published-models",
    "name": "Published Models",
    "description": "Peer-reviewed published models from literature",
    "sortOrder": 11
  },
  {
    "id": "multistage",
    "name": "Multistage Models",
    "description": "Models with multiple stages or compartments",
    "sortOrder": 12
  },
  {
    "id": "tutorials",
    "name": "Tutorials",
    "description": "Example models for learning BNGL",
    "sortOrder": 13
  },
  {
    "id": "native-tutorials",
    "name": "Native Tutorials",
    "description": "Built-in tutorial models with guided steps",
    "sortOrder": 14
  },
  {
    "id": "test-models",
    "name": "Test Models",
    "description": "Internal test and validation models",
    "sortOrder": 15
  }
];
const ASSIGNMENTS: Record<string, string[]> = {
  "AB": [
    "native-tutorials"
  ],
  "ABC": [
    "metabolism",
    "native-tutorials"
  ],
  "ABC_scan": [
    "native-tutorials"
  ],
  "ABC_ssa": [
    "native-tutorials"
  ],
  "ABp": [
    "metabolism",
    "native-tutorials"
  ],
  "ABp_approx": [
    "native-tutorials"
  ],
  "An_TLR4_2009": [
    "immunology",
    "published-models"
  ],
  "BAB": [
    "native-tutorials"
  ],
  "BAB_coop": [
    "native-tutorials"
  ],
  "BAB_scan": [
    "native-tutorials"
  ],
  "BLBR": [
    "native-tutorials"
  ],
  "Barua_BCR_2012": [
    "immunology",
    "published-models"
  ],
  "Barua_EGFR_2007": [
    "cancer",
    "published-models"
  ],
  "Barua_FceRI_2012": [
    "immunology",
    "published-models"
  ],
  "Barua_JAK2_2009": [
    "cancer",
    "published-models"
  ],
  "Barua_bcat_2013": [
    "published-models"
  ],
  "Blinov_egfr_2006": [
    "cell-cycle",
    "published-models"
  ],
  "Blinov_egfr_NF_2006": [
    "cancer",
    "published-models"
  ],
  "Blinov_ran_2006": [
    "cell-cycle",
    "published-models"
  ],
  "CaOscillate_Func": [
    "test-models"
  ],
  "CaOscillate_Sat": [
    "test-models"
  ],
  "Chattaraj_nephrin_2021": [
    "neuroscience",
    "published-models"
  ],
  "Cheemalavagu_JAKSTAT_2024": [
    "immunology",
    "published-models"
  ],
  "Chylek_FceRI_2014": [
    "immunology",
    "published-models"
  ],
  "Chylek_TCR_2014": [
    "immunology",
    "published-models"
  ],
  "Chylek_library": [
    "native-tutorials"
  ],
  "CircadianOscillator": [
    "cell-cycle",
    "native-tutorials"
  ],
  "ComplexDegradation": [
    "native-tutorials"
  ],
  "Creamer_2012": [
    "native-tutorials"
  ],
  "Dembo_blbr_1978": [
    "physics",
    "published-models"
  ],
  "Dolan_Insulin_2015_Dolan2015": [
    "metabolism",
    "published-models"
  ],
  "Dolan_Insulin_2015_Dolan_2015": [
    "metabolism",
    "published-models"
  ],
  "Dreisigmeyer_LacOperon_2008": [
    "published-models"
  ],
  "Dushek_TCR_2011": [
    "immunology",
    "published-models"
  ],
  "Dushek_TCR_2014": [
    "immunology",
    "published-models"
  ],
  "Erdem_InsR_2021": [
    "metabolism",
    "published-models"
  ],
  "Faeder_FceRI_2003_Faeder_2003": [
    "immunology",
    "published-models"
  ],
  "Faeder_FceRI_2003_fceri_ji": [
    "immunology",
    "published-models"
  ],
  "Faeder_FceRI_Fyn_2003": [
    "immunology",
    "published-models"
  ],
  "Faeder_egfr_2009": [
    "cancer",
    "published-models"
  ],
  "Faeder_egfr_compart_2009": [
    "published-models"
  ],
  "FceRI_ji": [
    "native-tutorials"
  ],
  "FceRI_viz": [
    "native-tutorials"
  ],
  "GK": [
    "metabolism",
    "native-tutorials"
  ],
  "Gardner_Toggle_2000": [
    "published-models"
  ],
  "Goldstein_TLBR_1984": [
    "immunology",
    "published-models"
  ],
  "Goldstein_blbr_1980": [
    "physics",
    "published-models"
  ],
  "HIV_Dynamics_pt303": [
    "published-models"
  ],
  "HIV_Dynamics_pt403": [
    "published-models"
  ],
  "HIV_Dynamics_pt409": [
    "published-models"
  ],
  "Harmon_Antigen_2017": [
    "immunology",
    "published-models"
  ],
  "Hat_wip1_2016": [
    "cell-cycle",
    "multistage",
    "published-models"
  ],
  "Haugh2b": [
    "test-models"
  ],
  "Hlavacek_Egg_2018": [
    "published-models"
  ],
  "Hlavacek_Elephant_2018_elephant_EFA": [
    "published-models"
  ],
  "Hlavacek_Elephant_2018_elephant_fit": [
    "published-models"
  ],
  "Hlavacek_Proofreading_2001": [
    "physics",
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_after_bunching": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_after_decoupling": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_after_scaling": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_before_bunching": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_before_decoupling": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_before_scaling": [
    "published-models"
  ],
  "Hlavacek_Restructuration_2018_check_scaling": [
    "published-models"
  ],
  "Hlavacek_Steric_1999": [
    "physics",
    "published-models"
  ],
  "JaruszewiczBlonska_NFkB_2023": [
    "immunology",
    "published-models"
  ],
  "Jung_CaMKII_2017": [
    "neuroscience",
    "published-models"
  ],
  "Kesseler_CellCycle_2013": [
    "cell-cycle",
    "published-models"
  ],
  "Kiefhaber_emodel": [
    "test-models"
  ],
  "Kocieniewski_published_2012": [
    "published-models"
  ],
  "Korwek_InnateImmunity_2023": [
    "immunology",
    "published-models"
  ],
  "Korwek_ViralSensing_2023": [
    "test-models"
  ],
  "Kozer_egfr_2013": [
    "cancer",
    "published-models"
  ],
  "Kozer_egfr_2014": [
    "cancer",
    "published-models"
  ],
  "LR": [
    "native-tutorials"
  ],
  "LRR": [
    "native-tutorials"
  ],
  "LRR_comp": [
    "native-tutorials"
  ],
  "LR_comp": [
    "native-tutorials"
  ],
  "LV": [
    "native-tutorials"
  ],
  "LV_comp": [
    "native-tutorials"
  ],
  "Lang_CellCycle_2024": [
    "cell-cycle",
    "published-models"
  ],
  "Lee_Wnt_2003": [
    "published-models"
  ],
  "Ligon_egfr_2014": [
    "cancer",
    "published-models"
  ],
  "Lin_ERK_2019": [
    "developmental",
    "published-models"
  ],
  "Lin_Prion_2019": [
    "neuroscience",
    "published-models"
  ],
  "Lin_ScalingBench_2019_ERK_model": [
    "published-models"
  ],
  "Lin_ScalingBench_2019_TCR_model": [
    "published-models"
  ],
  "Lin_ScalingBench_2019_prion_model": [
    "published-models"
  ],
  "Lin_TCR_2019": [
    "immunology",
    "published-models"
  ],
  "Lisman": [
    "native-tutorials",
    "neuroscience"
  ],
  "Lisman_bifurcate": [
    "native-tutorials",
    "neuroscience"
  ],
  "MAPK_Dimers_Model": [
    "cancer",
    "published-models"
  ],
  "MAPK_Monomers_Model": [
    "cancer",
    "published-models"
  ],
  "Macken_physics_1982": [
    "physics",
    "published-models"
  ],
  "Mallela_COVID_2021": [
    "published-models"
  ],
  "Mallela_Cities_2021": [
    "published-models"
  ],
  "Mallela_MSAs_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_Alabama_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_Dallas_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_Houston_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_MyrtleBeach_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_NYC_2022": [
    "published-models"
  ],
  "Mallela_VaxVariants_Phoenix_2022": [
    "published-models"
  ],
  "Massole_developmental_2023": [
    "developmental",
    "published-models"
  ],
  "McMillan_TNF_2021": [
    "immunology",
    "published-models"
  ],
  "Mertins_cancer_2023": [
    "cancer",
    "published-models"
  ],
  "Miller_MEK_2025": [
    "published-models"
  ],
  "Miller_NavajoNation_2022": [
    "published-models"
  ],
  "Mitra_Degranulation_2019": [
    "published-models"
  ],
  "Mitra_EGFR_2019": [
    "published-models"
  ],
  "Mitra_EGFR_2019_egfr": [
    "published-models"
  ],
  "Mitra_EGFR_2019_egfr_ground": [
    "published-models"
  ],
  "Mitra_EGFR_NF_2019": [
    "published-models"
  ],
  "Mitra_EGFR_ODE_2019": [
    "published-models"
  ],
  "Mitra_EGFR_SSA_2019_egfr": [
    "published-models"
  ],
  "Mitra_EGFR_SSA_2019_egfr_ground": [
    "published-models"
  ],
  "Mitra_EggOscillator_2019": [
    "published-models"
  ],
  "Mitra_ElephantFitting_2019": [
    "published-models"
  ],
  "Mitra_FceRI_gamma2_2019": [
    "published-models"
  ],
  "Mitra_IGF1R_2019": [
    "published-models"
  ],
  "Mitra_JNK_2019": [
    "published-models"
  ],
  "Mitra_JobScheduling_2019_jobs_ground": [
    "published-models"
  ],
  "Mitra_JobScheduling_2019_jobs_tofit": [
    "published-models"
  ],
  "Mitra_Likelihood_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P16_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P16_3cat_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P32_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P32_3cat_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P4_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P4_3cat_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P64_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P64_3cat_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P8_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_P8_3cat_2019": [
    "published-models"
  ],
  "Mitra_Likelihood_Quant_2019": [
    "published-models"
  ],
  "Mitra_MAPK_2019_Scaff-22_ground": [
    "published-models"
  ],
  "Mitra_MAPK_2019_Scaff-22_tofit": [
    "published-models"
  ],
  "Mitra_MAPK_Ensemble_2019_ensemble_tofit": [
    "published-models"
  ],
  "Mitra_MAPK_Ensemble_2019_machine_tofit": [
    "published-models"
  ],
  "Mitra_Rab_wt_2019_rab_mon1ccz1_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_2019_rab_rab5_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_2019_rab_rab7_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_2019_rab_wt": [
    "published-models"
  ],
  "Mitra_Rab_wt_pybnf_2019_rab_mon1ccz1_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_pybnf_2019_rab_rab5_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_pybnf_2019_rab_rab7_ox": [
    "published-models"
  ],
  "Mitra_Rab_wt_pybnf_2019_rab_wt": [
    "published-models"
  ],
  "Mitra_RafConstraint4_2019": [
    "published-models"
  ],
  "Mitra_RafConstraint_2019": [
    "published-models"
  ],
  "Mitra_SimpleReceptor_2019_example5_starting_point": [
    "published-models"
  ],
  "Mitra_SimpleReceptor_2019_receptor": [
    "published-models"
  ],
  "Mitra_SimpleReceptor_NF_2019": [
    "published-models"
  ],
  "Mitra_TCRSensitivity_2019": [
    "published-models"
  ],
  "Mitra_TCR_2019": [
    "published-models"
  ],
  "Mitra_TLBR_2019": [
    "published-models"
  ],
  "Mitra_ThreeStepCascade_2019_m1": [
    "published-models"
  ],
  "Mitra_ThreeStepCascade_2019_m1_ground": [
    "published-models"
  ],
  "Motivating_example": [
    "test-models"
  ],
  "Motivating_example_cBNGL": [
    "test-models"
  ],
  "Mukhopadhyay_TCR_2013": [
    "immunology",
    "published-models"
  ],
  "Nag_cancer_2009": [
    "cancer",
    "published-models"
  ],
  "Nosbisch_cancer_2022": [
    "cancer",
    "published-models"
  ],
  "Notch_Signaling_Pathway": [
    "published-models"
  ],
  "Ordyan_CaMKIIholo_2020": [
    "published-models"
  ],
  "Ordyan_extraCaMKIIHolo_2020": [
    "published-models"
  ],
  "Ordyan_mCaMKIICaSpike_2020": [
    "published-models"
  ],
  "Pekalski_published_2013": [
    "published-models"
  ],
  "Posner_blbr_1995": [
    "physics",
    "published-models"
  ],
  "Posner_blbr_2004": [
    "physics",
    "published-models"
  ],
  "PyBNF_fitting_setup_190127_CHO_EGFR_forBNF": [
    "published-models"
  ],
  "PyBioNetGen_Actions_Syntax": [
    "test-models"
  ],
  "PyBioNetGen_BNG_Error": [
    "test-models"
  ],
  "PyBioNetGen_Core_Parabola": [
    "published-models"
  ],
  "PyBioNetGen_Core_Parabola_Demo": [
    "published-models"
  ],
  "PyBioNetGen_Core_Parabola_Ground": [
    "published-models"
  ],
  "PyBioNetGen_Core_Polynomial": [
    "published-models"
  ],
  "PyBioNetGen_Core_Polynomial_Ground": [
    "published-models"
  ],
  "PyBioNetGen_Core_RAFi": [
    "published-models"
  ],
  "PyBioNetGen_Core_RAFi_Ground": [
    "published-models"
  ],
  "PyBioNetGen_Core_Receptor": [
    "published-models"
  ],
  "PyBioNetGen_Core_Receptor_NF": [
    "published-models"
  ],
  "PyBioNetGen_Core_TCR": [
    "published-models"
  ],
  "PyBioNetGen_Core_TLBR": [
    "immunology",
    "published-models"
  ],
  "PyBioNetGen_Degranulation_Model": [
    "immunology",
    "published-models"
  ],
  "PyBioNetGen_EGFR_Ground": [
    "published-models"
  ],
  "PyBioNetGen_EGFR_Model": [
    "published-models"
  ],
  "PyBioNetGen_EGFR_NF": [
    "published-models"
  ],
  "PyBioNetGen_EGFR_ODE": [
    "cancer",
    "published-models"
  ],
  "PyBioNetGen_EGFR_ODE_Pub": [
    "cancer",
    "published-models"
  ],
  "PyBioNetGen_Egg": [
    "test-models"
  ],
  "PyBioNetGen_ErrNoFrees": [
    "test-models"
  ],
  "PyBioNetGen_Example1": [
    "published-models"
  ],
  "PyBioNetGen_Example2_Start": [
    "published-models"
  ],
  "PyBioNetGen_FceRI_Gamma2": [
    "published-models"
  ],
  "PyBioNetGen_FceRI_Gamma2_Ground": [
    "published-models"
  ],
  "PyBioNetGen_FreeMissing": [
    "test-models"
  ],
  "PyBioNetGen_IGF1R_Activation": [
    "published-models"
  ],
  "PyBioNetGen_LilyIgE": [
    "test-models"
  ],
  "PyBioNetGen_Model": [
    "published-models"
  ],
  "PyBioNetGen_Model_ToFit": [
    "published-models"
  ],
  "PyBioNetGen_Model_aMCMC": [
    "published-models"
  ],
  "PyBioNetGen_NFmodel": [
    "test-models"
  ],
  "PyBioNetGen_NoFrees": [
    "test-models"
  ],
  "PyBioNetGen_NoGenerateNetwork": [
    "test-models"
  ],
  "PyBioNetGen_NoSuffix": [
    "test-models"
  ],
  "PyBioNetGen_Parabola": [
    "test-models"
  ],
  "PyBioNetGen_Parabola2": [
    "test-models"
  ],
  "PyBioNetGen_Parabola_Files": [
    "test-models"
  ],
  "PyBioNetGen_Parabola_Special": [
    "test-models"
  ],
  "PyBioNetGen_ParamsEverywhere": [
    "test-models"
  ],
  "PyBioNetGen_Polynomial_T6": [
    "test-models"
  ],
  "PyBioNetGen_Simple": [
    "test-models"
  ],
  "PyBioNetGen_Simple_AddActions": [
    "test-models"
  ],
  "PyBioNetGen_Simple_Answer": [
    "test-models"
  ],
  "PyBioNetGen_Simple_GenOnly": [
    "test-models"
  ],
  "PyBioNetGen_Simple_NF_Seed": [
    "test-models"
  ],
  "PyBioNetGen_Simple_NoGen": [
    "test-models"
  ],
  "PyBioNetGen_Tricky": [
    "test-models"
  ],
  "PyBioNetGen_TrickyUS": [
    "test-models"
  ],
  "PyBioNetGen_Trivial": [
    "test-models"
  ],
  "Ran_NuclearTransport": [
    "published-models"
  ],
  "Ran_NuclearTransport_Draft": [
    "published-models"
  ],
  "Repressilator": [
    "cell-cycle",
    "native-tutorials",
    "synbio"
  ],
  "SHP2_base_model": [
    "test-models"
  ],
  "SIR": [
    "native-tutorials"
  ],
  "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_Epigen": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_best-fit": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_CHO_EGFR_sensitivity": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_CHO_HA_EGFR_L858R": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_HMEC": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_HeLa": [
    "published-models"
  ],
  "Salazar_Cavazos_egfr_2019_190127_MCF10A": [
    "published-models"
  ],
  "Suderman_2013": [
    "native-tutorials"
  ],
  "Thomas_Example1_2016": [
    "published-models"
  ],
  "Thomas_Example2_2016": [
    "published-models"
  ],
  "Thomas_Example3_2016": [
    "published-models"
  ],
  "Thomas_Example4_2016": [
    "published-models"
  ],
  "Thomas_Example5_2016": [
    "published-models"
  ],
  "Thomas_Example6_2016": [
    "published-models"
  ],
  "Thomas_egfr_2016_example1_fit": [
    "published-models"
  ],
  "Thomas_egfr_2016_example2_fit": [
    "published-models"
  ],
  "Thomas_egfr_2016_example3_fit": [
    "published-models"
  ],
  "Thomas_egfr_2016_example4_fit": [
    "published-models"
  ],
  "Thomas_egfr_2016_example5_fit": [
    "published-models"
  ],
  "Thomas_egfr_2016_example5_ground_truth": [
    "published-models"
  ],
  "Thomas_egfr_2016_example6_ground_truth": [
    "published-models"
  ],
  "Vilar_Circadian_2002": [
    "cell-cycle",
    "published-models"
  ],
  "Vilar_Circadian_2002b": [
    "cell-cycle",
    "published-models"
  ],
  "Vilar_Circadian_2002c": [
    "published-models"
  ],
  "Yang_tlbr_2008": [
    "physics",
    "published-models"
  ],
  "ZAP70_immunology_2021": [
    "immunology",
    "published-models"
  ],
  "Zhang_developmental_2021": [
    "developmental",
    "published-models"
  ],
  "Zhang_developmental_2023": [
    "developmental",
    "published-models"
  ],
  "akt-signaling": [
    "test-models"
  ],
  "allosteric-activation": [
    "metabolism",
    "test-models"
  ],
  "ampk-signaling": [
    "neuroscience",
    "test-models"
  ],
  "apoptosis-cascade": [
    "cell-cycle",
    "test-models"
  ],
  "auto-activation-loop": [
    "metabolism",
    "test-models"
  ],
  "autophagy-regulation": [
    "metabolism",
    "test-models"
  ],
  "bcr-signaling": [
    "immunology",
    "test-models"
  ],
  "beta-adrenergic-response": [
    "neuroscience",
    "test-models"
  ],
  "birth-death": [
    "native-tutorials"
  ],
  "bistable-toggle-switch": [
    "test-models"
  ],
  "blood-coagulation-thrombin": [
    "immunology",
    "test-models"
  ],
  "bmp-signaling": [
    "developmental",
    "test-models"
  ],
  "brusselator-oscillator": [
    "physics",
    "test-models"
  ],
  "cBNGL_simple": [
    "native-tutorials"
  ],
  "calcineurin-nfat-pathway": [
    "neuroscience",
    "test-models"
  ],
  "calcium-spike-signaling": [
    "neuroscience",
    "test-models"
  ],
  "caspase-activation-loop": [
    "cell-cycle",
    "test-models"
  ],
  "catalysis": [
    "test-models"
  ],
  "cd40-signaling": [
    "immunology",
    "test-models"
  ],
  "cell-cycle-checkpoint": [
    "cell-cycle",
    "test-models"
  ],
  "checkpoint-kinase-signaling": [
    "cancer",
    "test-models"
  ],
  "chemistry": [
    "tutorials"
  ],
  "chemotaxis-signal-transduction": [
    "test-models"
  ],
  "circadian-oscillator": [
    "test-models"
  ],
  "clock-bmal1-gene-circuit": [
    "cell-cycle",
    "test-models"
  ],
  "compartment_endocytosis": [
    "test-models"
  ],
  "compartment_membrane_bound": [
    "test-models"
  ],
  "compartment_nested_transport": [
    "test-models"
  ],
  "compartment_nuclear_transport": [
    "test-models"
  ],
  "compartment_organelle_exchange": [
    "test-models"
  ],
  "competitive-enzyme-inhibition": [
    "metabolism",
    "test-models"
  ],
  "complement-activation-cascade": [
    "immunology",
    "test-models"
  ],
  "contact-inhibition-hippo-yap": [
    "test-models"
  ],
  "continue": [
    "test-models"
  ],
  "cooperative-binding": [
    "test-models"
  ],
  "cs_diffie_hellman": [
    "cs",
    "test-models"
  ],
  "cs_hash_function": [
    "cs",
    "test-models"
  ],
  "cs_huffman": [
    "cs",
    "test-models"
  ],
  "cs_monte_carlo_pi": [
    "cs",
    "test-models"
  ],
  "cs_pagerank": [
    "cs",
    "test-models"
  ],
  "cs_pid_controller": [
    "cs",
    "test-models"
  ],
  "cs_regex_nfa": [
    "cs",
    "test-models"
  ],
  "dna-damage-repair": [
    "cancer",
    "test-models"
  ],
  "dna-methylation-dynamics": [
    "test-models"
  ],
  "dr5-apoptosis-signaling": [
    "cell-cycle",
    "test-models"
  ],
  "dual-site-phosphorylation": [
    "test-models"
  ],
  "e2f-rb-cell-cycle-switch": [
    "cell-cycle",
    "test-models"
  ],
  "eco_coevolution_host_parasite": [
    "ecology",
    "test-models"
  ],
  "eco_food_web_chaos_3sp": [
    "ecology",
    "test-models"
  ],
  "eco_lotka_volterra_grid": [
    "ecology",
    "test-models"
  ],
  "eco_mutualism_obligate": [
    "ecology",
    "test-models"
  ],
  "eco_rock_paper_scissors_spatial": [
    "ecology",
    "test-models"
  ],
  "egfr-signaling-pathway": [
    "cancer",
    "test-models"
  ],
  "egfr_net": [
    "test-models"
  ],
  "egfr_net_red": [
    "test-models"
  ],
  "egfr_path": [
    "test-models"
  ],
  "egfr_simple": [
    "native-tutorials"
  ],
  "eif2a-stress-response": [
    "test-models"
  ],
  "endosomal-sorting-rab": [
    "test-models"
  ],
  "energy_allostery_mwc": [
    "test-models"
  ],
  "energy_catalysis_mm": [
    "test-models"
  ],
  "energy_cooperativity_adh": [
    "test-models"
  ],
  "energy_example1": [
    "test-models"
  ],
  "energy_linear_chain": [
    "test-models"
  ],
  "energy_transport_pump": [
    "test-models"
  ],
  "er-stress-response": [
    "test-models"
  ],
  "erk-nuclear-translocation": [
    "test-models"
  ],
  "example1": [
    "test-models"
  ],
  "fceri_ji_comp": [
    "test-models"
  ],
  "feature_functional_rates_volume": [
    "test-models"
  ],
  "feature_global_functions_scan": [
    "test-models"
  ],
  "feature_local_functions_explicit": [
    "test-models"
  ],
  "feature_symmetry_factors_cyclic": [
    "test-models"
  ],
  "feature_synthesis_degradation_ss": [
    "test-models"
  ],
  "fgf-signaling-pathway": [
    "developmental",
    "test-models"
  ],
  "gas6-axl-signaling": [
    "test-models"
  ],
  "gene-expression-toggle": [
    "test-models"
  ],
  "genetic_bistability_energy": [
    "test-models"
  ],
  "genetic_dna_replication_stochastic": [
    "test-models"
  ],
  "genetic_goodwin_oscillator": [
    "test-models"
  ],
  "genetic_translation_kinetics": [
    "test-models"
  ],
  "genetic_turing_pattern_1d": [
    "test-models"
  ],
  "glioblastoma-egfrviii-signaling": [
    "cancer",
    "test-models"
  ],
  "glycolysis-branch-point": [
    "metabolism",
    "test-models"
  ],
  "gm_game_of_life": [
    "test-models"
  ],
  "gm_ray_marcher": [
    "test-models"
  ],
  "gpcr-desensitization-arrestin": [
    "test-models"
  ],
  "hedgehog-signaling-pathway": [
    "developmental",
    "test-models"
  ],
  "heise": [
    "test-models"
  ],
  "hematopoietic-growth-factor": [
    "test-models"
  ],
  "hif1a_degradation_loop": [
    "test-models"
  ],
  "hypoxia-response-signaling": [
    "cancer",
    "test-models"
  ],
  "il1b-signaling": [
    "test-models"
  ],
  "il6-jak-stat-pathway": [
    "test-models"
  ],
  "immune-synapse-formation": [
    "immunology",
    "test-models"
  ],
  "inflammasome-activation": [
    "immunology",
    "test-models"
  ],
  "inositol-phosphate-metabolism": [
    "neuroscience",
    "test-models"
  ],
  "insulin-glucose-homeostasis": [
    "metabolism",
    "test-models"
  ],
  "interferon-signaling": [
    "immunology",
    "test-models"
  ],
  "ire1a-xbp1-er-stress": [
    "test-models"
  ],
  "issue_198_short": [
    "test-models"
  ],
  "jak-stat-cytokine-signaling": [
    "immunology",
    "test-models"
  ],
  "jnk-mapk-signaling": [
    "test-models"
  ],
  "kir-channel-regulation": [
    "test-models"
  ],
  "l-type-calcium-channel-dynamics": [
    "neuroscience",
    "test-models"
  ],
  "lac-operon-regulation": [
    "metabolism",
    "test-models"
  ],
  "lipid-mediated-pip3-signaling": [
    "test-models"
  ],
  "localfunc": [
    "test-models"
  ],
  "mapk-signaling-cascade": [
    "cancer",
    "test-models"
  ],
  "meta_formal_game_theory": [
    "test-models"
  ],
  "meta_formal_molecular_clock": [
    "test-models"
  ],
  "meta_formal_petri_net": [
    "test-models"
  ],
  "michaelis-menten-kinetics": [
    "metabolism",
    "test-models"
  ],
  "michment": [
    "test-models"
  ],
  "michment_cont": [
    "test-models"
  ],
  "ml_gradient_descent": [
    "ml-signal",
    "test-models"
  ],
  "ml_hopfield": [
    "ml-signal",
    "test-models"
  ],
  "ml_kmeans": [
    "ml-signal",
    "test-models"
  ],
  "ml_q_learning": [
    "ml-signal",
    "test-models"
  ],
  "ml_svm": [
    "ml-signal",
    "test-models"
  ],
  "motor": [
    "test-models"
  ],
  "mt_arithmetic_compiler": [
    "cs",
    "test-models"
  ],
  "mt_bngl_interpreter": [
    "cs",
    "test-models"
  ],
  "mt_music_sequencer": [
    "cs",
    "test-models"
  ],
  "mt_pascal_triangle": [
    "cs",
    "test-models"
  ],
  "mt_quine": [
    "cs",
    "test-models"
  ],
  "mtor-signaling": [
    "neuroscience",
    "test-models"
  ],
  "mtorc2-signaling": [
    "test-models"
  ],
  "mwc": [
    "test-models"
  ],
  "myogenic-differentiation": [
    "developmental",
    "test-models"
  ],
  "negative-feedback-loop": [
    "test-models"
  ],
  "neurotransmitter-release": [
    "neuroscience",
    "test-models"
  ],
  "nfkb": [
    "test-models"
  ],
  "nfkb-feedback": [
    "test-models"
  ],
  "nfkb_illustrating_protocols": [
    "test-models"
  ],
  "nfsim_aggregation_gelation": [
    "test-models"
  ],
  "nfsim_coarse_graining": [
    "test-models"
  ],
  "nfsim_dynamic_compartments": [
    "test-models"
  ],
  "nfsim_hybrid_particle_field": [
    "test-models"
  ],
  "nfsim_ring_closure_polymer": [
    "test-models"
  ],
  "nn_xor": [
    "ml-signal",
    "test-models"
  ],
  "no-cgmp-signaling": [
    "metabolism",
    "test-models"
  ],
  "notch-delta-lateral-inhibition": [
    "developmental",
    "test-models"
  ],
  "organelle_transport": [
    "native-tutorials"
  ],
  "organelle_transport_struct": [
    "native-tutorials"
  ],
  "oxidative-stress-response": [
    "test-models"
  ],
  "p38-mapk-signaling": [
    "cancer",
    "test-models"
  ],
  "p53-mdm2-oscillator": [
    "cell-cycle",
    "test-models"
  ],
  "parp1-mediated-dna-repair": [
    "cell-cycle",
    "test-models"
  ],
  "ph_lorenz_attractor": [
    "physics",
    "test-models"
  ],
  "ph_nbody_gravity": [
    "physics",
    "test-models"
  ],
  "ph_schrodinger": [
    "physics",
    "test-models"
  ],
  "ph_wave_equation": [
    "physics",
    "test-models"
  ],
  "phosphorelay-chain": [
    "test-models"
  ],
  "platelet-activation": [
    "immunology",
    "test-models"
  ],
  "polymer": [
    "tutorials"
  ],
  "polymer_draft": [
    "tutorials"
  ],
  "polymer_fixed": [
    "tutorials"
  ],
  "polynomial": [
    "test-models"
  ],
  "predator-prey-dynamics": [
    "test-models"
  ],
  "process_actin_treadmilling": [
    "test-models"
  ],
  "process_autophagy_flux": [
    "test-models"
  ],
  "process_cell_adhesion_strength": [
    "test-models"
  ],
  "process_kinetic_proofreading_tcr": [
    "test-models"
  ],
  "process_quorum_sensing_switch": [
    "test-models"
  ],
  "quasi_equilibrium": [
    "native-tutorials",
    "tutorials"
  ],
  "quorum-sensing-circuit": [
    "test-models"
  ],
  "rab-gtpase-cycle": [
    "test-models"
  ],
  "rankl-rank-signaling": [
    "developmental",
    "test-models"
  ],
  "ras-gef-gap-cycle": [
    "cancer",
    "test-models"
  ],
  "rec_dim": [
    "test-models"
  ],
  "rec_dim_comp": [
    "test-models"
  ],
  "receptor_nf": [
    "test-models"
  ],
  "repressilator-oscillator": [
    "test-models"
  ],
  "retinoic-acid-signaling": [
    "developmental",
    "test-models"
  ],
  "rho-gtpase-actin-cytoskeleton": [
    "test-models"
  ],
  "shp2-phosphatase-regulation": [
    "test-models"
  ],
  "signal-amplification-cascade": [
    "test-models"
  ],
  "simple": [
    "tutorials"
  ],
  "simple-dimerization": [
    "test-models"
  ],
  "simple_nfsim_test": [
    "tutorials"
  ],
  "simple_sbml_import": [
    "test-models"
  ],
  "simple_system": [
    "test-models"
  ],
  "sir-epidemic-model": [
    "ecology",
    "test-models",
    "tutorials"
  ],
  "smad-tgf-beta-signaling": [
    "developmental",
    "test-models"
  ],
  "sonic-hedgehog-gradient": [
    "developmental",
    "test-models"
  ],
  "sp_fourier_synthesizer": [
    "ml-signal",
    "test-models"
  ],
  "sp_image_convolution": [
    "ml-signal",
    "test-models"
  ],
  "sp_kalman_filter": [
    "ml-signal",
    "test-models"
  ],
  "stat3-mediated-transcription": [
    "test-models"
  ],
  "stress-response-adaptation": [
    "test-models"
  ],
  "synaptic-plasticity-ltp": [
    "neuroscience",
    "test-models"
  ],
  "synbio_band_pass_filter": [
    "synbio",
    "test-models"
  ],
  "synbio_counter_molecular": [
    "synbio",
    "test-models"
  ],
  "synbio_edge_detector": [
    "synbio",
    "test-models"
  ],
  "synbio_logic_gates_enzymatic": [
    "synbio",
    "test-models"
  ],
  "synbio_oscillator_synchronization": [
    "synbio",
    "test-models"
  ],
  "t-cell-activation": [
    "immunology",
    "test-models"
  ],
  "test_ANG_synthesis_simple": [
    "test-models"
  ],
  "test_MM": [
    "test-models"
  ],
  "test_fixed": [
    "test-models"
  ],
  "test_mratio": [
    "test-models"
  ],
  "test_network_gen": [
    "test-models"
  ],
  "test_sat": [
    "test-models"
  ],
  "test_synthesis_cBNGL_simple": [
    "test-models"
  ],
  "test_synthesis_complex": [
    "test-models"
  ],
  "test_synthesis_complex_0_cBNGL": [
    "test-models"
  ],
  "test_synthesis_complex_source_cBNGL": [
    "test-models"
  ],
  "test_synthesis_simple": [
    "test-models"
  ],
  "tlmr": [
    "test-models"
  ],
  "tlr3-dsrna-sensing": [
    "immunology",
    "test-models"
  ],
  "tnf-induced-apoptosis": [
    "cell-cycle",
    "test-models"
  ],
  "toggle": [
    "native-tutorials",
    "synbio"
  ],
  "toy-jim": [
    "test-models"
  ],
  "toy1": [
    "tutorials"
  ],
  "toy2": [
    "tutorials"
  ],
  "translateSBML": [
    "native-tutorials"
  ],
  "two-component-system": [
    "test-models"
  ],
  "univ_synth": [
    "test-models"
  ],
  "vegf-angiogenesis": [
    "cancer",
    "test-models"
  ],
  "viral-sensing-innate-immunity": [
    "immunology",
    "test-models"
  ],
  "visualize": [
    "native-tutorials"
  ],
  "wacky_alchemy_stone": [
    "synbio",
    "test-models"
  ],
  "wacky_black_hole": [
    "test-models"
  ],
  "wacky_bouncing_ball": [
    "physics",
    "test-models"
  ],
  "wacky_traffic_jam_asep": [
    "physics",
    "test-models"
  ],
  "wacky_zombie_infection": [
    "ecology",
    "test-models"
  ],
  "wnt-beta-catenin-signaling": [
    "developmental",
    "test-models"
  ],
  "wound-healing-pdgf-signaling": [
    "test-models"
  ]
};

function buildCategory(cat: typeof GALLERY_CATEGORIES[0]): ModelCategory {
  const modelIds = Object.entries(ASSIGNMENTS)
    .filter(([_, cats]) => cats.includes(cat.id))
    .map(([id]) => id);
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    models: modelIds.map(id => MODEL_INDEX.get(id)).filter(Boolean) as Example[],
  };
}

export const MODEL_CATEGORIES: ModelCategory[] = GALLERY_CATEGORIES
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(buildCategory)
  .filter(cat => cat.models.length > 0);

export const EXAMPLES: Example[] = Array.from(
  new Map(MODEL_CATEGORIES.flatMap(cat => cat.models).map(m => [m.id, m])).values()
);

// Backward-compatible aliases
export const NFSIM_MODELS = NFSIM_COMPATIBLE;
export const BNG2_COMPATIBLE_MODELS = BNG2_COMPATIBLE;
