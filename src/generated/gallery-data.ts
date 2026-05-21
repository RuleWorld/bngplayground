// AUTO-GENERATED — DO NOT EDIT
// Source: RuleHub manifest-slim.json + gallery.json
// Generated: 2026-05-19T13:41:43.000Z

import type { Example } from '@bngplayground/engine';

export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  models: Example[];
}

const ALL_MODELS: Example[] = [
    { id: "03_fcerig_fceri_gamma2", name: "03-fcerig", description: "Added molecule type definition block so that the", tags: ["immunology"] },
    { id: "04_egfrnf_egfr_nf", name: "example2_starting_point.bngl", description: "Filename: example2_starting_point.bngl", tags: ["f","lt_nm","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","molecules"] },
    { id: "06_degranulation_model_tofit", name: "of IgE receptor signaling", description: "A model of IgE receptor signaling", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "07_egg_egg", name: "07-egg", description: "BNGL model: egg", tags: ["a0","a1","a2","b1","b2","c0","c1","c2","d1","d2","period","t","species"] },
    { id: "10_egfr_egfr_ode", name: "example1.bngl", description: "Filename: example1.bngl", tags: ["lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "11_TLBR_tlbr", name: "11-TLBR", description: "BNGL model: tlbr", tags: ["alpha","molecules","species"] },
    { id: "12_TCR_tcr", name: "of T cell receptor signaling", description: "A model of T cell receptor signaling", tags: ["immunology"] },
    { id: "14_receptor_nf_receptor_nf", name: "of ligand/receptor binding and receptor phosphorylation.", description: "A simple model of ligand/receptor binding and receptor phosphorylation.", tags: ["molecules","species"] },
    { id: "15_igf1r_IGF1R_fit_all", name: "15-igf1r", description: "Author: William S. Hlavacek", tags: ["dilution","a1_permpers","a2_permpers","molecules"] },
    { id: "19_raf_constraint_RAFi", name: "19-raf-constraint", description: "BNGL model: RAFi", tags: ["k1","k2","k3","k5","kf1","kf2","kf3","kf4","kf5","kf6","rtot","ifree","species"] },
    { id: "190127_CHO_EGFR_best-fit", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_CHO_EGFR_Epigen", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_CHO_EGFR_sensitivity", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_CHO_HA_EGFR_L858R", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_HeLa", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_HMEC", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "190127_MCF10A", name: "Salazar-Cavazos2019", description: "BNGL model: 190127_CHO_EGFR_best-fit", tags: ["grb2_total__free","shc1_total__free","kdephosy1068__free","kdephosyn__free","ratio_kpkd_y1068__free","ratio_kpkd_yn__free","kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "20_raf_constraint4_RAFi", name: "20-raf-constraint4", description: "BNGL model: RAFi", tags: ["k1","k2","k3","k5","kf1","kf2","kf3","kf4","kf5","kf6","rtot","ifree","species"] },
    { id: "24_jnk_JNKmodel_180724_bnf", name: "24-jnk", description: "BNGL model: JNKmodel_180724_bnf", tags: ["scale_t","ani","k3_zakbyu1","k1_u1tozak","d3_zak","d1_zak","k3_mkk4byzak","k1_zaktomkk4","d3_mkk4","d1_mkk4","k3_mkk7byzak","k1_zaktomkk7","f3_mkk7byzak","d3_mkk7","d1_mkk7","k3_jnkbymkk4","k1_mkk4tojnk","k3_jnkbymkk7","k1_mkk7tojnk","f3_jnkbymkk7","d3_jnk","d1_jnk","k3_mkk7byjnk","k1_jnktomkk7","inh_jnk","d3_mkk7byjnkpt","d1_jnkpttomkk7","f1_zaktomkk7p","k1_zaktojnk","k3_mkk4byakt","k1_akttomkk4","k3_mkk7byakt","k1_akttomkk7","d3_mkk4byaktpt","d1_aktpttomkk4","d3_mkk7byaktpt","d1_aktpttomkk7","scale_ppmkk4","scale_ppmkk7","scale_ppjnk","pakt","molecules"] },
    { id: "26_tcr_sens_tcr_sens_tofit", name: "for the Manz/Groves 2011 data", description: "Modification of Mukhopadhyay/Dushek 2013 model for the Manz/Groves 2011 data", tags: ["immunology"] },
    { id: "31_elephant_elephant", name: "31-elephant", description: "BNGL model: elephant", tags: ["a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15","a16","a17","a18","a19","a20","b1","b2","b3","b4","b5","b6","b7","b8","b9","b10","b11","b12","b13","b14","b15","b16","b17","b18","b19","b20","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","c10","c11","c12","c13","c14","c15","c16","c17","c18","c19","c20","d1","d2","d3","d4","d5","d6","d7","d8","d9","d10","d11","d12","d13","d14","d15","d16","d17","d18","d19","d20","tmax","t","species"] },
    { id: "AB", name: "AB", description: "BioNetGen model: AB", tags: ["ab","a","b","simulate"] },
    { id: "ABC", name: "ABC", description: "BioNetGen model: ABC", tags: ["abc","a","simulate"] },
    { id: "ABC_scan", name: "ABC scan", description: "BioNetGen model: ABC scan", tags: ["abc","scan","a","generate_network","parameter_scan"] },
    { id: "ABC_ssa", name: "ABC ssa", description: "BioNetGen model: ABC ssa", tags: ["abc","ssa","a","simulate"] },
    { id: "ABp", name: "ABp", description: "title: ABp.bngl", tags: ["abp","a","b","simulate"] },
    { id: "ABp_approx", name: "ABp approx", description: "title: ABp.bngl", tags: ["abp","approx","km","a","b","simulate"] },
    { id: "actions_syntax", name: "actions syntax", description: "Original values used to generate parabola.exp", tags: ["actions","syntax","counter","y","generate_network","simulate"] },
    { id: "after_bunching", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "after_decoupling", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "after_scaling", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "akt-signaling", name: "akt signaling", description: "Signaling rates", tags: ["akt","signaling","growthfactor","rtk","pi3k","mtorc2","mtorc1","s6k"] },
    { id: "Alabama", name: "Alabama", description: "reporting period (1 d)", tags: ["alabama","fdcs","counter","s","e1","e2","e3","e4","e5"] },
    { id: "allosteric-activation", name: "allosteric activation", description: "Binding constants", tags: ["allosteric","activation","enzyme","substrate","activator","product"] },
    { id: "ampk-signaling", name: "ampk signaling", description: "AMPK signaling: The cellular energy sensor.", tags: ["ampk","signaling","amp","lkb1","ca","sik","crtc"] },
    { id: "An_2009", name: "An 2009", description: "TLR4 signaling", tags: ["published","immunology","an","2009","cd14","md2","tlr4","tram","trif","sarm","traf4","irak1"] },
    { id: "apoptosis-cascade", name: "apoptosis cascade", description: "Apoptosis cascade: Integrated extrinsic and intrinsic death signaling.", tags: ["apoptosis","cascade","deathligand","caspase8","bid","mito","apaf1","caspase3","xiap","smac"] },
    { id: "auto-activation-loop", name: "auto activation loop", description: "Auto-activation loop: A positive feedback circuit.", tags: ["auto","activation","loop","gene","mrna","protein","rbp"] },
    { id: "autophagy-regulation", name: "autophagy regulation", description: "Autophagy regulation: mTOR and AMPK competition on the ULK1 switch.", tags: ["autophagy","regulation","mtor","ampk","ulk1","lc3","p62"] },
    { id: "BAB", name: "BAB", description: "Simple binding model with a bivalent A molecule that has two identical sites", tags: ["bab","a","b","simulate"] },
    { id: "BAB_coop", name: "BAB coop", description: "Simple binding model with a bivalent A molecule that has two identical sites", tags: ["bab","coop","a","b","simulate"] },
    { id: "BAB_scan", name: "BAB scan", description: "Simple binding model with a bivalent A molecule that has two identical sites", tags: ["bab","scan","a","b","generate_network","parameter_scan"] },
    { id: "Barua_2007", name: "Barua 2007", description: "Model from Haugh (2006)", tags: ["published","barua","2007","version","r","s"] },
    { id: "Barua_2009", name: "Barua 2009", description: "JAK2-SH2B signaling", tags: ["published","barua","2009","s","j"] },
    { id: "Barua_2013", name: "Barua 2013", description: "Beta-catenin destruction", tags: ["published","barua","2013","axin","gsk3b","apc","bcat","ck1a"] },
    { id: "BaruaBCR_2012", name: "Barua 2012", description: "BCR signaling", tags: ["published","immunology","baruabcr","2012","bcr","lyn","fyn","csk","pag","syk"] },
    { id: "BaruaFceRI_2012", name: "BaruaFceRI 2012", description: "FcÃƒÅ½Ã‚ÂµRI signaling", tags: ["published","immunology","baruafceri","2012","r_o","rdimer_o","l_o","t_o","l","fcr","lyn","syk"] },
    { id: "bcr-signaling", name: "bcr signaling", description: "BCR signaling: The B-cell antigen receptor cascade.", tags: ["bcr","signaling","antigen","syk","plcg2","cd22","shp1","calcium"] },
    { id: "before_bunching", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "before_decoupling", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "before_scaling", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "beta-adrenergic-response", name: "beta adrenergic response", description: "Beta-adrenergic signaling: GPCR pathway and desensitization.", tags: ["beta","adrenergic","response","epi","betar","gs","ac","arr","camp"] },
    { id: "birth-death", name: "Birth-Death", description: "Stochastic process", tags: ["published","tutorial","native","birth","death","a","generate_network","saveconcentrations","simulate"] },
    { id: "bistable-toggle-switch", name: "bistable toggle switch", description: "Genetic Toggle Switch: Mutual repression circuit.", tags: ["bistable","toggle","switch","proml","promr","tf_l","tf_r","ind_l","ind_r"] },
    { id: "BLBR", name: "BLBR", description: "title: BLBR.bngl", tags: ["blbr","setoption","r","l","simulate"] },
    { id: "Blinov_2006", name: "Blinov 2006", description: "Phosphotyrosine signaling", tags: ["published","blinov","2006","egf","egfr","shc","grb2","sos"] },
    { id: "Blinov_egfr", name: "Blinov egfr", description: "EGFR signaling model", tags: ["published","nfsim","blinov","egfr","egf","grb2","shc","simulate_nf"] },
    { id: "Blinov_ran", name: "Blinov ran", description: "Ran GTPase cycle", tags: ["published","nfsim","blinov","ran","c","rcc1","simulate_nf"] },
    { id: "blood-coagulation-thrombin", name: "blood coagulation thrombin", description: "Blood coagulation: Thrombin burst and feedback propagation.", tags: ["blood","coagulation","thrombin","tf","factorx","factorv","prothrombin","fibrinogen","at"] },
    { id: "bmp-signaling", name: "bmp signaling", description: "BMP-Smad signaling: Developmental gradient relay.", tags: ["bmp","signaling","noggin","receptor1","receptor2","smad1","smad4","smad6"] },
    { id: "bng_error", name: "bng error", description: "Original values used to generate parabola.exp", tags: ["bng","error","counter","y","generate_network","simulate"] },
    { id: "brusselator-oscillator", name: "brusselator oscillator", description: "The Brusselator: Auto-catalytic chemical oscillator.", tags: ["brusselator","oscillator","a","b","x","y"] },
    { id: "calcineurin-nfat-pathway", name: "calcineurin nfat pathway", description: "NFAT Signaling: Calcium-dependent nuclear translocation.", tags: ["calcineurin","nfat","pathway","ca","cam","can","rcan1"] },
    { id: "calcium-spike-signaling", name: "calcium spike signaling", description: "Calcium spikes: Oscillations driven by IP3R and CICR feedback.", tags: ["calcium","spike","signaling","plc","ip3","ca","stim1"] },
    { id: "CaMKII_holo", name: "Ordyan 2020: CaMKII holo", description: "CaMKII holo", tags: ["published","neuroscience","camkii","holo","ca","cam","ng","pp1","time_counter"] },
    { id: "CaOscillate_Func", name: "CaOscillate_Func", description: "Calcium oscillations (func)", tags: ["validation","caoscillate","func","null","ga","plc","ca"] },
    { id: "CaOscillate_Sat", name: "CaOscillate_Sat", description: "Calcium oscillations (sat)", tags: ["validation","caoscillate","sat","null","ga","plc","ca"] },
    { id: "caspase-activation-loop", name: "caspase activation loop", description: "Caspase activation loop: The executioner feedback system.", tags: ["caspase","activation","loop","deathligand","caspase8","caspase3","iap","flip"] },
    { id: "catalysis", name: "catalysis", description: "Catalysis in energy BNG", tags: ["validation","catalysis","version","setoption","s","kinase","pptase","atp","adp"] },
    { id: "cBNGL_simple", name: "cBNGL simple", description: "A simplified signal transduction model including the following processes:", tags: ["cbngl","simple","l","r","tf","dna","mrna","p"] },
    { id: "cd40-signaling", name: "cd40 signaling", description: "CD40 Signaling: B-cell activation and TRAF-mediated relay.", tags: ["cd40","signaling","cd40l","traf","ikk","nik","nfkb","relb"] },
    { id: "cell-cycle-checkpoint", name: "cell cycle checkpoint", description: "Cell cycle checkpoint: Mitotic entry switch (CDK1).", tags: ["cell","cycle","checkpoint","cyclin","cdk","cdc25","wee1","apc","p21"] },
    { id: "Chattaraj_2021", name: "Chattaraj 2021", description: "NFkB oscillations", tags: ["published","chattaraj","2021","nephrin","nck","nwasp","writexml"] },
    { id: "check_scaling", name: "Hlavacek2018Restructuration", description: "BNGL model: after_bunching", tags: ["na","vecf","egftot","egfrtot","kd","kr","kpx","kmx","kp","kdp","molecules"] },
    { id: "checkpoint-kinase-signaling", name: "checkpoint kinase signaling", description: "DNA Checkpoint: ATM/ATR mediated damage sensing.", tags: ["checkpoint","kinase","signaling","dna","atm","atr","chk1","chk2","p53","cdc25"] },
    { id: "Cheemalavagu_JAK_STAT", name: "Cheemalavagu 2024", description: "JAK-STAT signaling", tags: ["published","literature","signaling","cheemalavagu","jak","stat","l1","il6r","gp130","l2","il10r1","il10r2","jak1","jak2"] },
    { id: "chemistry", name: "chemistry", description: "Basic chemical reactions", tags: ["published","tutorials","chemistry","a","b","c","d","e"] },
    { id: "chemotaxis-signal-transduction", name: "chemotaxis signal transduction", description: "Bacterial Chemotaxis: Adaptation through methylation.", tags: ["chemotaxis","signal","transduction","attr","mcp","chea","chey","cheb","motor"] },
    { id: "Chylek_library", name: "Chylek library", description: "Created by BioNetGen 2.2.6", tags: ["chylek","library","kflatplcg","kfgrb2gab2","kflcp2plcg1","kd1","kd2","sink","pre","pag1"] },
    { id: "ChylekFceRI_2014", name: "Chylek 2014 (FceRI)", description: "FceRI signaling", tags: ["published","immunology","chylekfceri","2014","lig","rec","lyn","fyn","syk","pag1","csk","lat"] },
    { id: "ChylekTCR_2014", name: "Chylek 2014 (TCR)", description: "TCR signaling", tags: ["published","immunology","chylektcr","2014","lig1","lig2","lig3","tcr","cd28","lck","itk","zap70"] },
    { id: "circadian-oscillator", name: "circadian oscillator", description: "title: Vilar Circadian Oscillator Model", tags: ["circadian","oscillator","a","r","pa","pr","mrna_a","mrna_r"] },
    { id: "CircadianOscillator", name: "CircadianOscillator", description: "Circadian rhythm", tags: ["published","tutorial","native","circadianoscillator","a","r","pa","pr","mrna_a","mrna_r"] },
    { id: "clock-bmal1-gene-circuit", name: "clock bmal1 gene circuit", description: "BMAL1-CLOCK: The master activator of the circadian circuit.", tags: ["clock","bmal1","gene","circuit","ror","reverb","dna"] },
    { id: "compartment_endocytosis", name: "compartment endocytosis", description: "Model: compartment_endocytosis.bngl", tags: ["compartment","endocytosis","l","r","t"] },
    { id: "compartment_membrane_bound", name: "compartment membrane bound", description: "Model: compartment_membrane_bound.bngl", tags: ["compartment","membrane","bound","p","lipid","generate_network","simulate"] },
    { id: "compartment_nested_transport", name: "compartment nested transport", description: "Model: compartment_nested_transport.bngl", tags: ["compartment","nested","transport","s","generate_network","simulate"] },
    { id: "compartment_nuclear_transport", name: "compartment nuclear transport", description: "Model: compartment_nuclear_transport.bngl", tags: ["compartment","nuclear","transport","tf","generate_network","simulate"] },
    { id: "compartment_organelle_exchange", name: "compartment organelle exchange", description: "Model: compartment_organelle_exchange.bngl", tags: ["compartment","organelle","exchange","cargo","generate_network","simulate"] },
    { id: "competitive-enzyme-inhibition", name: "competitive enzyme inhibition", description: "Competitive inhibition: Inhibitor (I) and Substrate (S) compete for the same", tags: ["competitive","enzyme","inhibition","substrate1","substrate2","inhibitor","product"] },
    { id: "complement-activation-cascade", name: "complement activation cascade", description: "Complement System: Pathogen opsonization and the Alternative Pathway.", tags: ["complement","activation","cascade","c3","fb","c5","mac","surf"] },
    { id: "ComplexDegradation", name: "ComplexDegradation", description: "Degradation model", tags: ["published","tutorial","native","complexdegradation","a","b","c","generate_network"] },
    { id: "contact-inhibition-hippo-yap", name: "contact inhibition hippo yap", description: "Hippo Pathway: Contact inhibition and YAP regulation.", tags: ["contact","inhibition","hippo","yap","mst","lats","tead"] },
    { id: "continue", name: "continue", description: "Test trajectory continuation", tags: ["validation","continue","a","b","c","trash"] },
    { id: "cooperative-binding", name: "cooperative binding", description: "Cooperative binding: The binding of the first ligand molecule increases", tags: ["cooperative","binding","receptor","ligand","competitor"] },
    { id: "Creamer_2012", name: "Creamer 2012", description: "Initial values", tags: ["creamer","2012","egf","hrg","egfr","erbb2","erbb3","erbb4","p52shc1","grb2"] },
    { id: "cs_diffie_hellman", name: "cs diffie hellman", description: "Model: cs_diffie_hellman.bngl", tags: ["cs","diffie","hellman","agent","target","dshareda_dt","dsharedb_dt"] },
    { id: "cs_hash_function", name: "cs hash function", description: "Cryptographic Hash Function in BNGL", tags: ["cs","hash","function","b0","b1","b2","b3","h0","h1","h2","h3"] },
    { id: "cs_huffman", name: "cs huffman", description: "Model: cs_huffman.bngl", tags: ["cs","huffman","char","hnode","generate_network","simulate"] },
    { id: "cs_monte_carlo_pi", name: "cs monte carlo pi", description: "Model: cs_monte_carlo_pi.bngl", tags: ["cs","monte","carlo","pi","trial","pi_estimate","generate_network","simulate"] },
    { id: "cs_pagerank", name: "cs pagerank", description: "Model: cs_pagerank.bngl", tags: ["cs","pagerank","teleport","page"] },
    { id: "cs_pid_controller", name: "cs pid controller", description: "PID Controller in BNGL", tags: ["cs","pid","controller","sensor","accumulator","leakyerror","actuator","disturbance"] },
    { id: "cs_regex_nfa", name: "cs regex nfa", description: "Model: cs_regex_nfa.bngl", tags: ["cs","regex","nfa","state","char","generate_network","simulate","setparameter"] },
    { id: "Dallas", name: "Dallas", description: "- This model is intended to be consistent with the compartmental model", tags: ["dallas","counter","fdcs","s","sv","e","a","i","v"] },
    { id: "degranulation_model", name: "PyBNG: Degranulation model", description: "Degranulation model", tags: ["published","pybng","degranulation","model","ag","r","syk","ship1","x","pip3","h"] },
    { id: "Dembo_1978", name: "Dembo 1978", description: "BLBR dembo 1978", tags: ["published","physics","dembo","1978"] },
    { id: "dna-damage-repair", name: "dna damage repair", description: "DNA damage sensing and repair pathway (ATM-CHK2-p53 axis)", tags: ["dna","damage","repair","mrn","atm","chk2","repaircomplex"] },
    { id: "dna-methylation-dynamics", name: "dna methylation dynamics", description: "DNA Methylation: Maintenance and de novo dynamics.", tags: ["dna","methylation","dynamics","cpg","dnmt1","tet","v_maint","v_erase"] },
    { id: "Dolan_2015", name: "Dolan 2015", description: "Insulin signaling", tags: ["published","literature","signaling","dolan","2015","time","t","p","e","ir","d","p53_mrna","p53"] },
    { id: "Dolan2015", name: "Dolan 2015", description: "Insulin signaling", tags: ["published","literature","signaling","dolan","2015","time","t","p","e","ir","d","p53_mrna","p53"] },
    { id: "dr5-apoptosis-signaling", name: "dr5 apoptosis signaling", description: "DR5 (TRAIL) Signaling: Extrinsic apoptosis and DISC formation.", tags: ["dr5","apoptosis","signaling","trail","fadd","caspase8","flip","death_signal"] },
    { id: "Dreisigmeyer_2008", name: "Dreisigmeyer 2008", description: "Lac operon", tags: ["published","gene-expression","dreisigmeyer","2008"] },
    { id: "dual-site-phosphorylation", name: "dual site phosphorylation", description: "Dual-site phosphorylation: Requires two sequential modifications for activity.", tags: ["dual","site","phosphorylation","kinase","phosphatase","substrate"] },
    { id: "Dushek_2011", name: "Dushek 2011", description: "TCR signaling", tags: ["published","dushek","2011","s"] },
    { id: "Dushek_2014", name: "Dushek 2014", description: "TCR signaling dynamics", tags: ["published","dushek","2014","e","f","b"] },
    { id: "e2f-rb-cell-cycle-switch", name: "e2f rb cell cycle switch", description: "E2F/Rb Switch: The G1/S transition gate.", tags: ["e2f","rb","cell","cycle","switch","mitogen","cycd","cyce","p27"] },
    { id: "eco_coevolution_host_parasite", name: "eco coevolution host parasite", description: "Model: eco_coevolution_host_parasite.bngl", tags: ["eco","coevolution","host","parasite"] },
    { id: "eco_food_web_chaos_3sp", name: "eco food web chaos 3sp", description: "Model: eco_food_web_chaos_3sp.bngl", tags: ["eco","food","web","chaos","3sp","r","c","p","k_eat_r","k_eat_c"] },
    { id: "eco_lotka_volterra_grid", name: "eco lotka volterra grid", description: "Model: eco_lotka_volterra_grid.bngl", tags: ["eco","lotka","volterra","grid","prey","pred"] },
    { id: "eco_mutualism_obligate", name: "eco mutualism obligate", description: "Model: eco_mutualism_obligate.bngl", tags: ["eco","mutualism","obligate","a","b"] },
    { id: "eco_rock_paper_scissors_spatial", name: "eco rock paper scissors spatial", description: "Model: eco_rock_paper_scissors_spatial.bngl", tags: ["eco","rock","paper","scissors","spatial","s","generate_network"] },
    { id: "egfr", name: "02-egfr", description: "EGFR model", tags: ["signaling"] },
    { id: "egfr", name: "17-egfr-ssa", description: "EGFR model", tags: ["signaling"] },
    { id: "egfr", name: "egfr", description: "Blinov et al. 2006. Biosystems, 83:136", tags: ["egfr","egf","grb2","shc","sos"] },
    { id: "egfr_ground", name: "02-egfr", description: "EGFR model", tags: ["signaling"] },
    { id: "egfr_ground", name: "17-egfr-ssa", description: "EGFR model", tags: ["signaling"] },
    { id: "egfr_ground", name: "egfr ground", description: "Blinov et al. 2006. Biosystems, 83:136", tags: ["egfr","ground","egf","grb2","shc","sos"] },
    { id: "egfr_net", name: "egfr_net", description: "check detailed balanced", tags: ["validation","egfr","net","egf","shc","grb2","sos"] },
    { id: "egfr_net_red", name: "egfr_net_red", description: "Reduced state-space version of EGFR_NET.BNGL with equivalent ODE dynamics", tags: ["validation","egfr","net","red","egf","egfr_1","egfr_2","egfr_3","grb2","shc","sos"] },
    { id: "egfr_nf", name: "egfr nf", description: "Filename: example2_starting_point.bngl", tags: ["egfr","nf","egf","clusters","pre1_dose","pre2_time"] },
    { id: "egfr_ode", name: "egfr ode", description: "Filename: example1.bngl", tags: ["egfr","ode","egf","pre1_dose","pre2_time","pre3_dose"] },
    { id: "egfr_ode", name: "PyBNG: EGFR ODE", description: "EGFR ODE", tags: ["published","pybng","egfr","ode","egf","pre1_dose","pre2_time","pre3_dose"] },
    { id: "egfr_path", name: "egfr_path", description: "The primary focus of the model developed by Kholodenko", tags: ["validation","egfr","path","generate_network","setconcentration","simulate"] },
    { id: "egfr_simple", name: "egfr simple", description: "This is a demo model of EGFR signaling.", tags: ["egfr","simple","egf","grb2","sos1"] },
    { id: "egfr-signaling-pathway", name: "egfr signaling pathway", description: "Enhanced EGFR Signaling: Combinatorial complexity with multiple phosphorylation sites.", tags: ["egfr","signaling","pathway","egf","grb2","shc"] },
    { id: "egg", name: "egg", description: "BioNetGen model: egg", tags: ["egg","x","y","generate_network","simulate"] },
    { id: "eif2a-stress-response", name: "eif2a stress response", description: "Integrated Stress Response: eIF2alpha and the translational gate.", tags: ["eif2a","stress","response","eif2b","perk","gadd34"] },
    { id: "elephant_EFA", name: "Hlavacek2018Elephant", description: "BNGL model: elephant_EFA", tags: ["a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15","a16","a17","a18","a19","a20","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","b10","b11","b12","b13","b14","b15","b16","b17","b18","b19","b20","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","c10","c11","c12","c13","c14","c15","c16","c17","c18","c19","c20","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","d10","d11","d12","d13","d14","d15","d16","d17","d18","d19","d20","period","t","species"] },
    { id: "elephant_fit", name: "Hlavacek2018Elephant", description: "BNGL model: elephant_EFA", tags: ["a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15","a16","a17","a18","a19","a20","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","b10","b11","b12","b13","b14","b15","b16","b17","b18","b19","b20","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","c10","c11","c12","c13","c14","c15","c16","c17","c18","c19","c20","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","d10","d11","d12","d13","d14","d15","d16","d17","d18","d19","d20","period","t","species"] },
    { id: "endosomal-sorting-rab", name: "endosomal sorting rab", description: "Endosomal Sorting: Rab GTPase conversion and effector recruitment.", tags: ["endosomal","sorting","rab","rab5","rab7","effector","v_gef","v_gap_drive"] },
    { id: "energy_allostery_mwc", name: "energy allostery mwc", description: "Model: energy_allostery_mwc.bngl", tags: ["energy","allostery","mwc","p","l"] },
    { id: "energy_catalysis_mm", name: "energy catalysis mm", description: "Model: energy_catalysis_mm.bngl", tags: ["energy","catalysis","mm","e","s","p"] },
    { id: "energy_cooperativity_adh", name: "energy cooperativity adh", description: "Model: energy_cooperativity_adh.bngl", tags: ["energy","cooperativity","adh","r","l"] },
    { id: "energy_example1", name: "energy_example1", description: "Illustration of energy modeling approach w/ a simple protein scaffold model", tags: ["validation","energy","example1","version","setoption","s","a","b","c"] },
    { id: "energy_linear_chain", name: "energy linear chain", description: "Model: energy_linear_chain.bngl", tags: ["energy","linear","chain","m","generate_network"] },
    { id: "energy_transport_pump", name: "energy transport pump", description: "Model: energy_transport_pump.bngl", tags: ["energy","transport","pump","a","atp","adp","pi","t"] },
    { id: "ensemble_tofit", name: "translated into BNGL", description: "Ensemble model translated into BNGL", tags: ["signaling"] },
    { id: "er-stress-response", name: "er stress response", description: "Rate Constants", tags: ["er","stress","response","unfoldedprotein","perk","eif2a","chaperone"] },
    { id: "Erdem_2021", name: "Erdem 2021", description: "InsR/IGF1R signaling", tags: ["published","erdem","2021","igf1","ins","igf1r","insr","irs","sos","ras","raf"] },
    { id: "ERK_model", name: "ERK_model.bngl", description: "filename: ERK_model.bngl", tags: ["egf","erkpp_sos1_fb","erkpp_mek_fb","erkpp_raf1_fb","lambda","egfr_tot","ras_tot","sos_tot","rasgap_tot","raf_tot","mek_tot","erk_tot","ekar3_tot","erktr_tot","a1","d1","b1","u1a","u1b","b2a","u2a","b2b","u2b","k2a","k2b","b3","u3","k3","a2","d2","p1","q1","p2","q2","p3","q3","p4","q4","q5","p6","q6","a0_ekar3","d0_ekar3","a0_erktr","d0_erktr","species"] },
    { id: "erk-nuclear-translocation", name: "erk nuclear translocation", description: "ERK Translocation: Spatial signaling and transcriptional assembly.", tags: ["erk","nuclear","translocation","mek","elk1","dusp","transcription_signal"] },
    { id: "ErrNoFrees", name: "ErrNoFrees", description: "An example from a real application", tags: ["errnofrees","ag","r","h"] },
    { id: "example1", name: "example1", description: "Filename: example1.bngl", tags: ["example1","egf","egfr","pre1_dose","pre2_time","pre3_dose"] },
    { id: "example1", name: "example1", description: "Example file for BNG2 tutorial.", tags: ["validation","example1","version","generate_network","simulate_ode"] },
    { id: "example1_BNFfiles_example1", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example1_fit", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example2_BNFfiles_example2", name: "example2_starting_point.bngl", description: "Filename: example2_starting_point.bngl", tags: ["f","lt_nm","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","molecules"] },
    { id: "example2_fit", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example2_starting_point", name: "example2 starting point", description: "Filename: example2_starting_point.bngl", tags: ["example2","starting","point","egf","egfr","clusters","pre1_dose","pre2_time"] },
    { id: "example3_BNFfiles_example3", name: "example3 BNFfiles", description: "BNGL model: example3", tags: ["alpha","molecules","species"] },
    { id: "example3_fit", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example4_BNFfiles_example4", name: "in BNGL. For a description of BNGL, see:", description: "Supplementary File A in File S1", tags: ["other"] },
    { id: "example4_fit", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example5_BNFfiles_example5", name: "example5 BNFfiles", description: "A simple model", tags: ["ligand_ispresent","molecules","species"] },
    { id: "example5_fit", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example5_ground_truth", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "example5_starting_point", name: "13-receptor", description: "A simple model", tags: ["ligand_ispresent","molecules","species"] },
    { id: "example6_BNFfiles_example6", name: "example6 BNFfiles", description: "A simple model", tags: ["molecules","species"] },
    { id: "example6_ground_truth", name: "example1_starting_point.bngl", description: "Filename: example1_starting_point.bngl", tags: ["chi_r__free__","k_c__free__","k_o__free__","kaf__free__","kar__free__","alpha1_pre__free__","alpha2_pre__free__","alpha3_pre__free__","alpha4_pre__free__","lt","rt","k11","k11r","k21","k21r","k22","k22r","l20","l20r","l21r","l22r","k_o","k_c","kaf","kar","kp","kdp","chi_r","avg1","avg2","avg3","avg4","alpha1","alpha2","alpha3","alpha4","molecules","species"] },
    { id: "extra_CaMKII_Holo", name: "Ordyan 2020: extra CaMKII holo", description: "Extra CaMKII holo (supplement)", tags: ["published","neuroscience","extra","camkii","holo","t1","t2","t3","t4","t5","t6","t7","t8"] },
    { id: "Faeder_2003", name: "Faeder 2003", description: "FceRI signaling", tags: ["published","immunology","faeder","2003","lig","lyn","syk","rec"] },
    { id: "fceri_fyn", name: "FceRI Fyn", description: "FceRI signaling", tags: ["published","immunology","fceri","fyn","lig","lyn","syk","rec"] },
    { id: "fceri_gamma2", name: "fceri gamma2", description: "BioNetGen model: fceri gamma2", tags: ["fceri","gamma2","lig","lyn","syk","rec"] },
    { id: "fceri_gamma2_ground_truth", name: "fceri gamma2 ground truth", description: "BioNetGen model: fceri gamma2 ground truth", tags: ["fceri","gamma2","ground","truth","lig","lyn","syk","rec"] },
    { id: "fceri_ji", name: "Faeder 2003", description: "FceRI signaling", tags: ["published","immunology","faeder","2003","lig","lyn","syk","rec"] },
    { id: "FceRI_ji", name: "FceRI ji", description: "title: FceRI_ji.bngl", tags: ["fceri","ji","lig","lyn","syk","rec"] },
    { id: "fceri_ji_comp", name: "fceri_ji_comp", description: "Ligand-receptor binding", tags: ["validation","fceri","ji","comp","lig","lyn","syk","rec"] },
    { id: "FceRI_viz", name: "FceRI Viz", description: "FcÃƒÅ½Ã‚ÂµRI (viz)", tags: ["published","tutorial","native","fceri","viz","fcr","ige","lat","lyn","syk","pb","pg","sykp"] },
    { id: "feature_functional_rates_volume", name: "feature functional rates volume", description: "Model: feature_functional_rates_volume.bngl", tags: ["feature","functional","rates","volume","a","b","c"] },
    { id: "feature_global_functions_scan", name: "feature global functions scan", description: "Model: feature_global_functions_scan.bngl", tags: ["feature","global","functions","scan","signal","response","stimulus"] },
    { id: "feature_local_functions_explicit", name: "feature local functions explicit", description: "Model: feature_local_functions_explicit.bngl", tags: ["feature","local","functions","explicit","s","p","e","mm_rate","ratelaw"] },
    { id: "feature_symmetry_factors_cyclic", name: "feature symmetry factors cyclic", description: "Model: feature_symmetry_factors_cyclic.bngl", tags: ["feature","symmetry","factors","cyclic","x","generate_network","simulate"] },
    { id: "feature_synthesis_degradation_ss", name: "feature synthesis degradation ss", description: "Model: feature_synthesis_degradation_ss.bngl", tags: ["feature","synthesis","degradation","ss","m","generate_network","simulate"] },
    { id: "fgf-signaling-pathway", name: "fgf signaling pathway", description: "FGF Signaling: FGFR dimerization and FRS2-Ras/PI3K relay.", tags: ["fgf","signaling","pathway","fgfr","frs2","spry","rasgef","internalized_rec"] },
    { id: "free_missing", name: "free missing", description: "Original values used to generate parabola.exp", tags: ["free","missing","counter","y","generate_network","simulate"] },
    { id: "Gardner_2000", name: "Gardner 2000", description: "Genetic toggle switch", tags: ["published","synthetic-biology","gardner","2000"] },
    { id: "gas6-axl-signaling", name: "gas6 axl signaling", description: "GAS6/AXL Signaling: AKT activation and SOCS feedback.", tags: ["gas6","axl","signaling","pi3k","akt","socs","survival_burst"] },
    { id: "gene-expression-toggle", name: "gene expression toggle", description: "Kinetic Parameters", tags: ["gene","expression","toggle","mrna","protein"] },
    { id: "genetic_bistability_energy", name: "genetic bistability energy", description: "Model: genetic_bistability_energy.bngl", tags: ["genetic","bistability","energy","genea","geneb","prota","protb"] },
    { id: "genetic_dna_replication_stochastic", name: "genetic dna replication stochastic", description: "Model: genetic_dna_replication_stochastic.bngl", tags: ["genetic","dna","replication","stochastic","pol","n","generate_network"] },
    { id: "genetic_goodwin_oscillator", name: "genetic goodwin oscillator", description: "Model: genetic_goodwin_oscillator.bngl", tags: ["genetic","goodwin","oscillator","gene","mrna","protein","repressor"] },
    { id: "genetic_translation_kinetics", name: "genetic translation kinetics", description: "Model: genetic_translation_kinetics.bngl", tags: ["genetic","translation","kinetics","mrna","rib","protein"] },
    { id: "genetic_turing_pattern_1d", name: "genetic turing pattern 1d", description: "Model: genetic_turing_pattern_1d.bngl", tags: ["genetic","turing","pattern","1d","a","b"] },
    { id: "GK", name: "GK", description: "title: GK.bngl", tags: ["gk","b","simulate"] },
    { id: "glioblastoma-egfrviii-signaling", name: "glioblastoma egfrviii signaling", description: "EGFRvIII in Glioblastoma: Constitutive AKT drive and escape from decay.", tags: ["glioblastoma","egfrviii","signaling","pi3k","akt","oncogenic_output","v_viii_act"] },
    { id: "glycolysis-branch-point", name: "glycolysis branch point", description: "BioNetGen model: glycolysis branch point", tags: ["glycolysis","branch","point","glucose","atp","biomass"] },
    { id: "gm_game_of_life", name: "gm game of life", description: "Model: gm_game_of_life.bngl", tags: ["gm","game","of","life","cell"] },
    { id: "gm_ray_marcher", name: "gm ray marcher", description: "Ray Marching Renderer in BNGL", tags: ["gm","ray","marcher","ray0","hit0","bright0","sdf0","sdf1","sdf2","sdf3","speed0"] },
    { id: "Goldstein_1980", name: "Goldstein 1980", description: "BLBR heterogeneity", tags: ["published","physics","goldstein","1980"] },
    { id: "gpcr-desensitization-arrestin", name: "gpcr desensitization arrestin", description: "GPCR Desensitization: Arrestin-mediated spatial sequestration.", tags: ["gpcr","desensitization","arrestin","ligand","gprotein"] },
    { id: "Harmon_2017", name: "Harmon 2017", description: "Antigen pulses", tags: ["published","immunology","harmon","2017"] },
    { id: "Hat_2016", name: "Hat 2016", description: "Nuclear transport", tags: ["published","hat","2016","dna_dsb","atm","siah1","hipk2","wip1","gene_wip1","mrna_wip1","p53"] },
    { id: "Haugh2b", name: "Haugh2b", description: "R(KD,Y1~U,Y2~U) 1.00", tags: ["validation","haugh2b","r","s1","s2","exclude_reactants","include_reactants"] },
    { id: "hedgehog-signaling-pathway", name: "hedgehog signaling pathway", description: "Hedgehog (Hh) Signaling: Ciliary translocation and Gli processing.", tags: ["hedgehog","signaling","pathway","hh","ptch","smo","gli","sufu"] },
    { id: "heise", name: "heise", description: "Validate state inheritance in a symmetric context", tags: ["validation","heise","a","b","generate_network","simulate_ode","setparameter"] },
    { id: "hematopoietic-growth-factor", name: "hematopoietic growth factor", description: "Kinetic Parameters", tags: ["hematopoietic","growth","factor","epo","epor","jak2","stat5"] },
    { id: "hif1a_degradation_loop", name: "hif1a degradation loop", description: "HIF-1alpha Oxygen Sensing: Hydroxylation and VHL-mediated decay.", tags: ["hif1a","degradation","loop","vhl","arnt","v_hydrox"] },
    { id: "Hlavacek_1999", name: "Hlavacek 1999", description: "Steric effects", tags: ["published","physics","hlavacek","1999"] },
    { id: "Hlavacek_2001", name: "Hlavacek 2001", description: "Kinetic proofreading", tags: ["published","physics","hlavacek","2001"] },
    { id: "Hlavacek2018Egg_egg", name: "Hlavacek2018Egg", description: "End of permute change log", tags: ["a0__free","a1__free","a2__free","b1__free","b2__free","c0__free","c1__free","c2__free","d1__free","d2__free","a0","a1","a2","b1","b2","c0","c1","c2","d1","d2","period","t","species"] },
    { id: "Houston", name: "Houston", description: "- This model is intended to be consistent with the compartmental model", tags: ["houston","counter","fdcs","s","sv","e","a","i","v"] },
    { id: "hypoxia-response-signaling", name: "hypoxia response signaling", description: "Rate Constants", tags: ["hypoxia","response","signaling","oxygensensor","hif1","vegf"] },
    { id: "IGF1R_Model_receptor_activation_bnf", name: "IGF1R Model receptor activation bnf", description: "Author: William S. Hlavacek", tags: ["igf1r","model","receptor","activation","bnf","igf1"] },
    { id: "il1b-signaling", name: "il1b signaling", description: "IL-1beta Signaling: MyD88/IRAK assembly and NF-kB translocation.", tags: ["il1b","signaling","il1ri","myd88","irak","nfkb"] },
    { id: "il6-jak-stat-pathway", name: "il6 jak stat pathway", description: "IL-6 Signaling: gp130 hexamerization and pSTAT3 import.", tags: ["il6","jak","stat","pathway","gp130","stat3","socs"] },
    { id: "immune-synapse-formation", name: "immune synapse formation", description: "Kinetic Parameters", tags: ["immune","synapse","formation","tcr","pmhc","lck","zap70"] },
    { id: "inflammasome-activation", name: "inflammasome activation", description: "Rate Constants", tags: ["inflammasome","activation","sensor","asc","caspase1","il1b"] },
    { id: "innate_immunity", name: "Korwek 2023", description: "Immune response", tags: ["published","immunology","innate","immunity","polyic","rigi","mavs","pkr","oas3","rnasel","eif2a","rigi_mrna"] },
    { id: "inositol-phosphate-metabolism", name: "inositol phosphate metabolism", description: "Inositol Phosphate (IP) Metabolism: PLC signaling and branch points.", tags: ["inositol","phosphate","metabolism","pip2","ip3","ip4","calcium","agonist"] },
    { id: "insulin-glucose-homeostasis", name: "insulin glucose homeostasis", description: "Insulin-Glucose: Compartmentalized transport.", tags: ["insulin","glucose","homeostasis","ir","glut4","pancreas"] },
    { id: "interferon-signaling", name: "interferon signaling", description: "Rate Constants", tags: ["interferon","signaling","ifn","ifnar","tyk2","stat1"] },
    { id: "ire1a-xbp1-er-stress", name: "ire1a xbp1 er stress", description: "IRE1a/XBP1 ER Stress: Chaperone buffering and mRNA decay (RIDD).", tags: ["ire1a","xbp1","er","stress","ire1","bip","unfolded","ridd_target"] },
    { id: "issue_198_short", name: "issue_198_short", description: "No description available", tags: ["validation","issue","198","short","a","b","c","generate_network","simulate"] },
    { id: "jak-stat-cytokine-signaling", name: "jak stat cytokine signaling", description: "Rate Constants", tags: ["jak","stat","cytokine","signaling","receptor"] },
    { id: "Jaruszewicz-Blonska_2023", name: "Jaruszewicz 2023", description: "T-cell discrimination", tags: ["published","immunology","jaruszewicz","blonska","2023","ikk","ikba","ikba_mrna","a20","nfkb"] },
    { id: "jnk-mapk-signaling", name: "jnk mapk signaling", description: "JNK MAPK Signaling: Scaffold-mediated activation and feedback.", tags: ["jnk","mapk","signaling","mkk7","jip1","v_dephos"] },
    { id: "jobs_ground", name: "30-jobs", description: "NFsim simulation of the job market", tags: ["other"] },
    { id: "jobs_tofit", name: "30-jobs", description: "NFsim simulation of the job market", tags: ["other"] },
    { id: "Jung_2017", name: "Jung 2017", description: "M1 receptor signaling", tags: ["published","jung","2017","m1r","oxo","arrestin","mek","erk","perk","oxo_ec","pp2a"] },
    { id: "Kesseler_2013", name: "Kesseler 2013", description: "G2/Mitosis transition", tags: ["published","kesseler","2013","mpf","cdc25","wee1","myt1","pin1","pp2a","prox","e33"] },
    { id: "Kiefhaber_emodel", name: "Kiefhaber_emodel", description: "Allow molar units to be used for bimolecular rate constants", tags: ["validation","kiefhaber","emodel","setoption","l","p","s","a"] },
    { id: "kir-channel-regulation", name: "kir channel regulation", description: "Kir Channel Regulation: PIP2 modulation and G-protein potentiation.", tags: ["kir","channel","regulation","pip2","gbg","v_opening","v_gbg_factor"] },
    { id: "Kocieniewski_2012", name: "Kocieniewski 2012", description: "Actin dynamics", tags: ["published","kocieniewski","2012","map3k","map2k","mapk","scaff"] },
    { id: "Korwek_2023", name: "Korwek_2023", description: "This BioNetGen file features the article:", tags: ["validation","korwek","2023","polyic","rigi","mavs","pkr","oas3","rnasel","eif2a","rigi_mrna"] },
    { id: "Kozer_2013", name: "Kozer 2013", description: "EGFR oligomerization", tags: ["published","kozer","2013","egf","egfr"] },
    { id: "Kozer_2014", name: "Kozer 2014", description: "Grb2-EGFR recruitment", tags: ["published","kozer","2014","egf","egfr","grb2"] },
    { id: "l-type-calcium-channel-dynamics", name: "l type calcium channel dynamics", description: "L-type Calcium Channel: Voltage gating and CDI (Calcium-dependent inactivation).", tags: ["l","type","calcium","channel","dynamics","ltcc","voltage","v_open","v_inact"] },
    { id: "lac-operon-regulation", name: "lac operon regulation", description: "Kinetic Parameters", tags: ["lac","operon","regulation","laci","promoter","mrna","betagal","lactose","allolactose"] },
    { id: "Lang_2024", name: "Lang 2024", description: "Cell cycle regulation", tags: ["published","lang","2024","e2f","rb1","ppp2r2b","ccnb_promoter","ccna","ccna_promoter","foxm1_promoter","ensa_arpp19"] },
    { id: "Ligon_2014", name: "Ligon 2014", description: "Lipoplex delivery", tags: ["published","nfsim","ligon","2014","lext","pit","lint"] },
    { id: "LilyIgE", name: "LilyIgE", description: "An example from a real application", tags: ["lilyige","ag","r","syk","ship1","x","pip3","h"] },
    { id: "Lin_ERK_2019", name: "Lin 2019", description: "ERK signaling", tags: ["published","literature","signaling","lin","erk","2019","egfr","sos","ras","rasgap","raf","mek","ekar3"] },
    { id: "Lin_Prion_2019", name: "Lin 2019", description: "Prion replication", tags: ["published","literature","prion","lin","2019","prp","scaledupspecies1","scaledupspecies2","scaledupspecies15","scaledupspecies30"] },
    { id: "Lin_TCR_2019", name: "Lin 2019", description: "TCR signaling", tags: ["published","literature","immune","lin","tcr","2019","pmhc","lck","shp","zap","mek","erk"] },
    { id: "lipid-mediated-pip3-signaling", name: "lipid mediated pip3 signaling", description: "Kinetic Parameters", tags: ["lipid","mediated","pip3","signaling","pi3k","pip2","pten","pdk1"] },
    { id: "Lisman", name: "Lisman", description: "title: auto.bngl", tags: ["lisman","k1","p","input","visualize","setparameter","simulate"] },
    { id: "Lisman_bifurcate", name: "Lisman bifurcate", description: "title: Lisman_bifurcate.bngl", tags: ["lisman","bifurcate","k1","p"] },
    { id: "localfunc", name: "localfunc", description: "Test local function expansion", tags: ["validation","localfunc","a","b","c","trash","f_synth"] },
    { id: "LR", name: "LR", description: "title: LR.bngl", tags: ["lr","l","r","simulate"] },
    { id: "LR_comp", name: "LR comp", description: "title: LR_comp.bngl", tags: ["lr","comp","l","r","simulate"] },
    { id: "LRR", name: "LRR", description: "title: LRR.bngl", tags: ["lrr","l","r"] },
    { id: "LRR_comp", name: "LRR comp", description: "title: LRR_comp.bngl", tags: ["lrr","comp","l","r","simulate"] },
    { id: "LV", name: "LV", description: "title: LV.bgl", tags: ["lv","s","w","generate_network","writesbml","simulate"] },
    { id: "LV_comp", name: "LV comp", description: "title: LV_comp.bgl", tags: ["lv","comp","k2","s","w"] },
    { id: "m1", name: "of a 3-step signaling cascade", description: "Toy model of a 3-step signaling cascade", tags: ["k1","k2","k3","ainit","molecules"] },
    { id: "m1_ground", name: "of a 3-step signaling cascade", description: "Toy model of a 3-step signaling cascade", tags: ["k1","k2","k3","ainit","molecules"] },
    { id: "machine_tofit", name: "translated into BNGL", description: "Ensemble model translated into BNGL", tags: ["signaling"] },
    { id: "Macken_1982", name: "Macken 1982", description: "TLBR solution macken 1982", tags: ["published","physics","macken","1982"] },
    { id: "Mallela2021_Cities", name: "Mallela 2021 - COVID-19 City Models", description: "Parameter-fit COVID-19 epidemiological models for major US cities.", tags: ["covid-19","epidemiology","parameter-estimation","pybionetgen"] },
    { id: "Mallela2021_States", name: "Mallela 2021 - COVID-19 State-Level Models", description: "Parameter-fit COVID-19 epidemiological models for all 50 US states.", tags: ["covid-19","epidemiology","parameter-estimation","pybionetgen"] },
    { id: "Mallela2022_MSAs", name: "Mallela 2022 - COVID-19 MSA Models", description: "Parameter-fit COVID-19 epidemiological models for US metropolitan statistical areas.", tags: ["covid-19","epidemiology","parameter-estimation","pybionetgen"] },
    { id: "mapk-dimers", name: "MAPK Dimers", description: "MAPK dimerization", tags: ["published","mapk","dimers","ste5","ste11","ste7","fus3"] },
    { id: "mapk-monomers", name: "MAPK Monomers", description: "MAPK cascade", tags: ["published","mapk","monomers","ste5","ste11","ste7","fus3"] },
    { id: "mapk-signaling-cascade", name: "mapk signaling cascade", description: "Rate Constants", tags: ["mapk","signaling","cascade","ligand","receptor","mapkkk","mapkk"] },
    { id: "Massole_2023", name: "Massole 2023", description: "Epo receptor signaling", tags: ["published","massole","2023"] },
    { id: "mCaMKII_Ca_Spike", name: "Ordyan 2020: mCaMKII Ca Spike", description: "mCaMKII Ca Spike model", tags: ["published","neuroscience","mcamkii","ca","spike","cam","ng","camkii","pp1","time_counter"] },
    { id: "McMillan_2021", name: "McMillan 2021", description: "TNF signaling", tags: ["published","nfsim","mcmillan","2021","r0_tot","t0_tot","r","t","generate_network","simulate_ode"] },
    { id: "Mertins_2023", name: "Mertins 2023", description: "DNA damage response", tags: ["published","mertins","2023","dnadsb","p53","mrna_bax","bax","bclxl","bad","fourteen_3_3","caspase"] },
    { id: "meta_formal_game_theory", name: "meta formal game theory", description: "Model: meta_formal_game_theory.bngl", tags: ["meta","formal","game","theory","hawk","dove","pop","payoffh","payoffd"] },
    { id: "meta_formal_molecular_clock", name: "meta formal molecular clock", description: "Model: meta_formal_molecular_clock.bngl", tags: ["meta","formal","molecular","clock","fasta","fastb","slowc","slowd"] },
    { id: "meta_formal_petri_net", name: "meta formal petri net", description: "Model: meta_formal_petri_net.bngl", tags: ["meta","formal","petri","net","p1","p2","p3","p4"] },
    { id: "michaelis-menten-kinetics", name: "michaelis menten kinetics", description: "Kinetic Constants", tags: ["michaelis","menten","kinetics","e","s","p","generate_network","simulate","writesbml"] },
    { id: "michment", name: "michment", description: "Michaelis Menten", tags: ["validation","michment","e","s","generate_network"] },
    { id: "michment_cont", name: "michment_cont", description: "Michaelis Menten Continue", tags: ["validation","michment","cont","readfile","setconcentration","simulate_ode","addconcentration"] },
    { id: "Miller2022_NavajoNation", name: "Miller 2022 - Navajo Nation Models", description: "COVID-19 epidemiological models fit to Navajo Nation regional data.", tags: ["covid-19","epidemiology","pybionetgen"] },
    { id: "Miller2025_MEK", name: "Miller 2025 - MEK Isoform Models", description: "MEK isoform variant models curated for PyBioNetGen.", tags: ["mek","isoforms","signaling","pybionetgen"] },
    { id: "Mitra2019_02_egfr_bnf1_InputFiles_egfr", name: "InputFiles", description: "EGFR model", tags: ["signaling"] },
    { id: "ml_gradient_descent", name: "ml gradient descent", description: "Gradient Descent Optimizer in BNGL", tags: ["ml","gradient","descent","posx","posy","velx","vely","loss"] },
    { id: "ml_hopfield", name: "ml hopfield", description: "Model: ml_hopfield.bngl", tags: ["ml","hopfield","neuron","net1","net2","net3","target1"] },
    { id: "ml_kmeans", name: "ml kmeans", description: "Model: ml_kmeans.bngl", tags: ["ml","kmeans","ax","ay","bx","by"] },
    { id: "ml_q_learning", name: "ml q learning", description: "Q-Learning Agent in BNGL", tags: ["ml","q","learning","pos","ql","qr","reward","action"] },
    { id: "ml_svm", name: "ml svm", description: "Model: ml_svm.bngl", tags: ["ml","svm","w1","w2","b","db_dt","dw1_dt"] },
    { id: "model", name: "model", description: "filename: model.bngl", tags: ["model","ag","r","syk","ship1","x","pip3","h"] },
    { id: "model", name: "model", description: "A model of IgE receptor signaling", tags: ["model","ag","r","syk","ship1","x","pip3","h"] },
    { id: "model_ground", name: "model_ground.bngl", description: "filename: model_ground.bngl", tags: ["x_tot__free","k_xoff__free","k_xon__free","kase__free","kdegx__free","kdegran__free","km_ship1__free","km_syk__free","km_x__free","koff__free","kp_ship1__free","kp_syk__free","kp_x__free","kpten__free","ksynth1__free","pase__free","f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "model_tofit", name: "model tofit", description: "A model of IgE receptor signaling", tags: ["model","tofit","ag","r","syk","ship1","x","pip3","h"] },
    { id: "Model_ZAP", name: "Model ZAP", description: "ZAP-70 recruitment", tags: ["published","immunology","nfsim","model","zap","kon","a","cbl","cd16","lck","ligand","zeta","dead"] },
    { id: "Motivating_example", name: "Motivating_example", description: "Signal Transduction with receptor internalization", tags: ["validation","motivating","example","l","r","tf","dna","mrna1","mrna2","p1","p2"] },
    { id: "Motivating_example_cBNGL", name: "Motivating_example_cBNGL", description: "Signal transduction with receptor internalization", tags: ["validation","motivating","example","cbngl","l","r","tf","dna","mrna1","mrna2","p1","p2"] },
    { id: "motor", name: "motor", description: "Motor protein", tags: ["validation","motor","chey","kplus","kminus"] },
    { id: "mt_arithmetic_compiler", name: "mt arithmetic compiler", description: "Model: mt_arithmetic_compiler.bngl", tags: ["mt","arithmetic","compiler","node","target_add","target_mult"] },
    { id: "mt_bngl_interpreter", name: "mt bngl interpreter", description: "Model: mt_bngl_interpreter.bngl", tags: ["mt","bngl","interpreter","rule","species","exec_s1_s2","generate_network","simulate"] },
    { id: "mt_music_sequencer", name: "mt music sequencer", description: "Music Sequencer / Chord Synthesizer in BNGL", tags: ["mt","music","sequencer","v1s","v1c","v2s","v2c","v3s","v3c","mix","chordphase"] },
    { id: "mt_pascal_triangle", name: "mt pascal triangle", description: "Model: mt_pascal_triangle.bngl", tags: ["mt","pascal","triangle","node"] },
    { id: "mt_quine", name: "mt quine", description: "Model: mt_quine.bngl", tags: ["mt","quine","gene","protein"] },
    { id: "mtor-signaling", name: "mtor signaling", description: "mTOR Signaling Pathway", tags: ["mtor","signaling","rheb","mtorc1","s6k","ampk"] },
    { id: "mtorc2-signaling", name: "mtorc2 signaling", description: "mTORC2 signaling regulates cell survival and growth via AKT and SGK1.", tags: ["mtorc2","signaling","mtor","sin1","rictor","akt","sgk1","pip3"] },
    { id: "Mukhopadhyay_2013", name: "Mukhopadhyay 2013", description: "FceRI signaling", tags: ["published","immunology","mukhopadhyay","2013","s","e","f","z"] },
    { id: "mwc", name: "mwc", description: "Monod-Wyman-Changeux model", tags: ["validation","mwc","setoption","h","ox","b"] },
    { id: "myogenic-differentiation", name: "myogenic differentiation", description: "Myogenic Differentiation", tags: ["myogenic","differentiation","myod","myog","mef2"] },
    { id: "Myrtle_Beach-Conway-North_Myrtle_Beach_SC-NC", name: "Myrtle_Beach-Conway-North_Myrtle_Beach_SC-NC", description: "Runtime-only BNGL model migrated from public/models: Myrtle_Beach-Conway-North_Myrtle_Beach_SC-NC", tags: ["myrtle","beach","conway","north","sc","nc"] },
    { id: "Nag_2009", name: "Nag 2009", description: "LAT-Grb2-SOS1 signaling", tags: ["published","nag","2009","lig","lyn","syk","rec","lat","grb","sos"] },
    { id: "negative-feedback-loop", name: "negative feedback loop", description: "Negative Feedback Loop", tags: ["negative","feedback","loop","gene","mrna","protein"] },
    { id: "neurotransmitter-release", name: "neurotransmitter release", description: "Neurotransmitter Release", tags: ["neurotransmitter","release","calcium","snare","vesicle","postsynaptic"] },
    { id: "nfkb", name: "nfkb", description: "NF-kB signaling pathway", tags: ["validation","nfkb","tnfr","ikkk","tnf","ikk","ikba","a20","competitor"] },
    { id: "nfkb_illustrating_protocols", name: "nfkb_illustrating_protocols", description: "NF-kB signaling pathway", tags: ["validation","nfkb","illustrating","protocols","tnfr","ikkk","tnf","ikk","ikba","a20","competitor"] },
    { id: "nfkb-feedback", name: "nfkb feedback", description: "TNFalpha-induced NF-kB signaling with IkappaB-alpha feedback.", tags: ["nfkb","feedback","ikb","ikk","a20"] },
    { id: "NFmodel", name: "NFmodel", description: "BioNetGen model: NFmodel", tags: ["nfmodel","ag","ab","simulate"] },
    { id: "nfsim_aggregation_gelation", name: "nfsim aggregation gelation", description: "Model: nfsim_aggregation_gelation.bngl", tags: ["nfsim","aggregation","gelation","m"] },
    { id: "nfsim_coarse_graining", name: "nfsim coarse graining", description: "Model: nfsim_coarse_graining.bngl", tags: ["nfsim","coarse","graining","droplet"] },
    { id: "nfsim_dynamic_compartments", name: "nfsim dynamic compartments", description: "Model: nfsim_dynamic_compartments.bngl", tags: ["nfsim","dynamic","compartments","cell","generate_network","simulate"] },
    { id: "nfsim_hybrid_particle_field", name: "nfsim hybrid particle field", description: "Model: nfsim_hybrid_particle_field.bngl", tags: ["nfsim","hybrid","particle","field"] },
    { id: "nfsim_ring_closure_polymer", name: "nfsim ring closure polymer", description: "Model: nfsim_ring_closure_polymer.bngl", tags: ["nfsim","ring","closure","polymer","a","generate_network","simulate"] },
    { id: "nn_xor", name: "nn xor", description: "Model: nn_xor.bngl", tags: ["nn","xor","input","hidden","output","target","weightih","weightho","dopamine"] },
    { id: "no_frees", name: "no frees", description: "Original values used to generate parabola.exp", tags: ["no","frees","counter","y","generate_network","simulate"] },
    { id: "no_generate_network", name: "no generate network", description: "Original values used to generate parabola.exp", tags: ["no","generate","network","counter","y","simulate"] },
    { id: "no_suffix", name: "no suffix", description: "Original values used to generate parabola.exp", tags: ["no","suffix","counter","y","generate_network","simulate"] },
    { id: "no-cgmp-signaling", name: "no cgmp signaling", description: "Nitric Oxide (NO) / cGMP signaling pathway.", tags: ["no","cgmp","signaling","sgc","pkg"] },
    { id: "Nosbisch_2022", name: "Nosbisch 2022", description: "RTK-PLCgamma1 signaling", tags: ["published","nosbisch","2022","rtk","plcgamma1","generate_network"] },
    { id: "notch", name: "Notch", description: "Notch signaling", tags: ["published","notch","icn","ofut1","fringe","furin","dsl","csl","maml"] },
    { id: "notch-delta-lateral-inhibition", name: "notch delta lateral inhibition", description: "Notch-Delta Lateral Inhibition", tags: ["notch","delta","lateral","inhibition","cellnotch","celldelta"] },
    { id: "NYC", name: "NYC", description: "- This model is intended to be consistent with the compartmental model", tags: ["nyc","counter","fdcs","s","sv","e","a","i","v"] },
    { id: "organelle_transport", name: "organelle transport", description: "title: organelle_transport.bngl", tags: ["organelle","transport","a","b","c","d","t1","at1","ct1","t2"] },
    { id: "organelle_transport_struct", name: "organelle transport struct", description: "title: organelle_transport_abcd.bngl", tags: ["organelle","transport","struct","a","b","t1","t2"] },
    { id: "oxidative-stress-response", name: "oxidative stress response", description: "Oxidative Stress Response (Keap1-Nrf2 Pathway)", tags: ["oxidative","stress","response","ros","keap1","nrf2","antioxidant"] },
    { id: "p38-mapk-signaling", name: "p38 mapk signaling", description: "p38 MAPK stress signaling cascade.", tags: ["p38","mapk","signaling","mkk3","mapkap2","v_thermal"] },
    { id: "p53-mdm2-oscillator", name: "p53 mdm2 oscillator", description: "BioNetGen model: p53 mdm2 oscillator", tags: ["p53","mdm2","oscillator","generate_network"] },
    { id: "parabola", name: "parabola", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["parabola","counter","par","line","generate_network","simulate"] },
    { id: "parabola", name: "parabola", description: "Original values used to generate parabola.exp", tags: ["parabola","counter","y","generate_network","simulate"] },
    { id: "parabola", name: "parabola", description: "Original values used to generate parabola.exp", tags: ["parabola","counter","y","generate_network","simulate","resetconcentrations"] },
    { id: "parabola", name: "parabola", description: "Original values used to generate parabola.exp", tags: ["parabola","counter","y","generate_network","simulate"] },
    { id: "parabola", name: "parabola", description: "Original values used to generate parabola.exp", tags: ["parabola","counter","y","generate_network","simulate"] },
    { id: "parabola_ground", name: "parabola ground", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["parabola","ground","counter","par","line","generate_network","simulate"] },
    { id: "parabola2", name: "parabola2", description: "A file for testing behavior with duplicate file names", tags: ["parabola2","counter","y","generate_network","simulate","resetconcentrations"] },
    { id: "ParamsEverywhere", name: "ParamsEverywhere", description: "An example from a real application", tags: ["paramseverywhere","ag","r","h"] },
    { id: "parp1-mediated-dna-repair", name: "parp1 mediated dna repair", description: "PARP1-mediated DNA damage sensing and repair.", tags: ["parp1","mediated","dna","repair","par","nad","v_parylate"] },
    { id: "Pekalski_2013", name: "Pekalski 2013", description: "Spontaneous signaling", tags: ["published","pekalski","2013","tnfr","ikk","ikkk","ikba","ikba_mrna","a20","a20_mrna","nfkb"] },
    { id: "ph_lorenz_attractor", name: "ph lorenz attractor", description: "Lorenz Attractor in BNGL", tags: ["ph","lorenz","attractor","lx","ly","lz","x","y"] },
    { id: "ph_nbody_gravity", name: "ph nbody gravity", description: "Model: ph_nbody_gravity.bngl", tags: ["ph","nbody","gravity","body","r2"] },
    { id: "ph_schrodinger", name: "ph schrodinger", description: "Model: ph_schrodinger.bngl", tags: ["ph","schrodinger","psi"] },
    { id: "ph_wave_equation", name: "ph wave equation", description: "Model: ph_wave_equation.bngl", tags: ["ph","wave","equation","node"] },
    { id: "Phoenix", name: "Phoenix", description: "- This model is intended to be consistent with the compartmental model", tags: ["phoenix","counter","fdcs","s","sv","e","a","i","v"] },
    { id: "phosphorelay-chain", name: "phosphorelay chain", description: "BioNetGen model: phosphorelay chain", tags: ["phosphorelay","chain","sensor","relay","output"] },
    { id: "platelet-activation", name: "platelet activation", description: "BioNetGen model: platelet activation", tags: ["platelet","activation","adp","p2y12","integrin","thromboxane"] },
    { id: "polymer", name: "polymer", description: "Polymerization model", tags: ["published","tutorials","nfsim","polymer","a","b","c","simulate_nf"] },
    { id: "polymer_draft", name: "polymer draft", description: "Polymerization (draft)", tags: ["published","tutorials","nfsim","polymer","draft","a","b","c","simulate_nf"] },
    { id: "polymer_fixed", name: "polymer_fixed", description: "Runtime-only BNGL model migrated from public/models: polymer_fixed", tags: ["polymer","fixed"] },
    { id: "polynomial", name: "polynomial", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["polynomial","counter","y1","y2","generate_network","simulate","setparameter","resetconcentrations"] },
    { id: "polynomial", name: "polynomial", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["polynomial","counter","y1","y2","generate_network","simulate","setparameter","resetconcentrations"] },
    { id: "polynomial", name: "polynomial", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["polynomial","counter","y1","y2","generate_network","simulate","setparameter","resetconcentrations"] },
    { id: "polynomial_ground", name: "polynomial ground", description: "Implementation of the parabola from the Mitra constrained optimization manuscript Fig. 1", tags: ["polynomial","ground","counter","y1","y2","generate_network","simulate","setparameter","resetconcentrations"] },
    { id: "Posner_1995", name: "Posner 1995", description: "BLBR rings", tags: ["published","physics","posner","1995"] },
    { id: "Posner_2004", name: "Posner 2004", description: "BLBR cooperativity", tags: ["published","physics","posner","2004"] },
    { id: "predator-prey-dynamics", name: "predator prey dynamics", description: "BioNetGen model: predator prey dynamics", tags: ["predator","prey","dynamics"] },
    { id: "prion_model", name: "ERK_model.bngl", description: "filename: ERK_model.bngl", tags: ["egf","erkpp_sos1_fb","erkpp_mek_fb","erkpp_raf1_fb","lambda","egfr_tot","ras_tot","sos_tot","rasgap_tot","raf_tot","mek_tot","erk_tot","ekar3_tot","erktr_tot","a1","d1","b1","u1a","u1b","b2a","u2a","b2b","u2b","k2a","k2b","b3","u3","k3","a2","d2","p1","q1","p2","q2","p3","q3","p4","q4","q5","p6","q6","a0_ekar3","d0_ekar3","a0_erktr","d0_erktr","species"] },
    { id: "problem_quant_model_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem16_3cat_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem16_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem32_3cat_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem32_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem4_3cat_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem4_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem64_3cat_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem64_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem8_3cat_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "problem8_model0_tofit", name: "model.bngl", description: "filename: model.bngl", tags: ["f","na","t","vchannel","nchannel","vcyt","ag_tot_0","ag_conc1","r_tot","syk_tot","ship1_tot","kon","koff","kase","pase","kp_syk","km_syk","kp_ship1","km_ship1","ksynth1","kdeg1","kpten","h_tot","kdegran","kdegx","k_xon","k_xoff","kp_x","km_x","molecules"] },
    { id: "process_actin_treadmilling", name: "process actin treadmilling", description: "Model: process_actin_treadmilling.bngl", tags: ["process","actin","treadmilling","generate_network","simulate"] },
    { id: "process_autophagy_flux", name: "process autophagy flux", description: "Model: process_autophagy_flux.bngl", tags: ["process","autophagy","flux","phagophore","autophagosome","lysosome","autolysosome","cargo"] },
    { id: "process_cell_adhesion_strength", name: "process cell adhesion strength", description: "Model: process_cell_adhesion_strength.bngl", tags: ["process","cell","adhesion","strength","c1","c2","generate_network","simulate"] },
    { id: "process_kinetic_proofreading_tcr", name: "process kinetic proofreading tcr", description: "Model: process_kinetic_proofreading_tcr.bngl", tags: ["process","kinetic","proofreading","tcr","l"] },
    { id: "process_quorum_sensing_switch", name: "process quorum sensing switch", description: "Model: process_quorum_sensing_switch.bngl", tags: ["process","quorum","sensing","switch","gene_ai","ai","r","gene_light"] },
    { id: "pt303", name: "pt303", description: "c = 0.20 /d t_1/2 = 3.5 d (inferred)", tags: ["pt303","counter","v","lnv","s","c","half_life","lnv_tangent"] },
    { id: "pt403", name: "pt403", description: "c = 0.23 /d t_1/2 = 3.0 d (inferred)", tags: ["pt403","counter","v","lnv","s","c","half_life","lnv_tangent"] },
    { id: "pt409", name: "pt409", description: "c = 0.39 /d t_1/2 = 1.8 d (inferred)", tags: ["pt409","counter","v","lnv","s","c","half_life","lnv_tangent"] },
    { id: "PyBNF_fitting_setup_190127_CHO_EGFR_forBNF", name: "PyBNF-fitting-setup", description: "BNGL model: 190127_CHO_EGFR_forBNF", tags: ["kdephosy1068_f","kdephosy1173_f","kphos_f","grb2_f","ratio_kdephosy1173","ratio_kphosy1173","offrate_f","onrate_f","kdephosy1068_pre","kdephosy1173_pre","kdephosyn_pre","kphosy1068_pre","kphosy1173_pre","kphosyn_pre","kdephosy1068","kdephosy1173","kdephosyn","kphosy1068","kphosy1173","kphosyn","ratio_kphos_receiver","molecules"] },
    { id: "quasi_equilibrium", name: "quasi equilibrium", description: "Quasi-equilibrium approximation", tags: ["published","toy models","quasi","equilibrium","a","b","c"] },
    { id: "quorum-sensing-circuit", name: "quorum sensing circuit", description: "BioNetGen model: quorum sensing circuit", tags: ["quorum","sensing","circuit","autoinducer","autoinducer_env","gene","protein"] },
    { id: "rab_mon1ccz1_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["kd_rabgef1__free","d_hill__free","d_threshold__free","k_deg__free","k_dephos__free","k_deub__free","k_extract__free","k_insert__free","k_recyc__free","k_synth__free","k_to_endo__free","kcat_rab5__free","kcat_rab7__free","kf_rab5_mon1__free","kf_rab5_rabep1__free","kf_ptyr_sh2__free","kr_kub_uim__free","kr_rab5_mon1__free","kr_rab5_rabep1__free","kr_ptyr_sh2__free","py_basal_coef__free","py_half_coef__free","py_hill_coef__free","py_scale_coef__free","r_hill__free","r_threshold__free","ub_basal_coef__free","ub_half_coef__free","ub_hill_coef__free","ub_scale_coef__free","rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_mon1ccz1_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_rab5_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["kd_rabgef1__free","d_hill__free","d_threshold__free","k_deg__free","k_dephos__free","k_deub__free","k_extract__free","k_insert__free","k_recyc__free","k_synth__free","k_to_endo__free","kcat_rab5__free","kcat_rab7__free","kf_rab5_mon1__free","kf_rab5_rabep1__free","kf_ptyr_sh2__free","kr_kub_uim__free","kr_rab5_mon1__free","kr_rab5_rabep1__free","kr_ptyr_sh2__free","py_basal_coef__free","py_half_coef__free","py_hill_coef__free","py_scale_coef__free","r_hill__free","r_threshold__free","ub_basal_coef__free","ub_half_coef__free","ub_hill_coef__free","ub_scale_coef__free","rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_rab5_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_rab7_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["kd_rabgef1__free","d_hill__free","d_threshold__free","k_deg__free","k_dephos__free","k_deub__free","k_extract__free","k_insert__free","k_recyc__free","k_synth__free","k_to_endo__free","kcat_rab5__free","kcat_rab7__free","kf_rab5_mon1__free","kf_rab5_rabep1__free","kf_ptyr_sh2__free","kr_kub_uim__free","kr_rab5_mon1__free","kr_rab5_rabep1__free","kr_ptyr_sh2__free","py_basal_coef__free","py_half_coef__free","py_hill_coef__free","py_scale_coef__free","r_hill__free","r_threshold__free","ub_basal_coef__free","ub_half_coef__free","ub_hill_coef__free","ub_scale_coef__free","rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_rab7_ox", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_wt", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["kd_rabgef1__free","d_hill__free","d_threshold__free","k_deg__free","k_dephos__free","k_deub__free","k_extract__free","k_insert__free","k_recyc__free","k_synth__free","k_to_endo__free","kcat_rab5__free","kcat_rab7__free","kf_rab5_mon1__free","kf_rab5_rabep1__free","kf_ptyr_sh2__free","kr_kub_uim__free","kr_rab5_mon1__free","kr_rab5_rabep1__free","kr_ptyr_sh2__free","py_basal_coef__free","py_half_coef__free","py_hill_coef__free","py_scale_coef__free","r_hill__free","r_threshold__free","ub_basal_coef__free","ub_half_coef__free","ub_hill_coef__free","ub_scale_coef__free","rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab_wt", name: "rab_mon1ccz1_ox.bngl", description: "filename:rab_mon1ccz1_ox.bngl", tags: ["rab5_expr","rab7_expr","mon1_expr","ccz1_expr","kf_mon1_ccz1","kr_mon1_ccz1","egf_conc_ngml","ub_hill_coef","ub_half_coef","ub_basal_coef","ub_scale_coef","py_hill_coef","py_half_coef","py_basal_coef","py_scale_coef","gtp_to_gdp_ratio","kcatgtp_rab5","k_gdp_gef_eff","kcatgtp_rab7","molecules","0"] },
    { id: "rab-gtpase-cycle", name: "rab gtpase cycle", description: "BioNetGen model: rab gtpase cycle", tags: ["rab","gtpase","cycle","gef","gap","effector"] },
    { id: "RAFi", name: "RAFi", description: "BioNetGen model: RAFi", tags: ["rafi","r","i","ybar","activity"] },
    { id: "RAFi_ground", name: "RAFi ground", description: "BioNetGen model: RAFi ground", tags: ["rafi","ground","r","i","ybar","activity"] },
    { id: "rankl-rank-signaling", name: "rankl rank signaling", description: "RANKL-RANK-OPG signaling in bone remodeling.", tags: ["rankl","rank","signaling","opg","nfat","traf6"] },
    { id: "ras-gef-gap-cycle", name: "ras gef gap cycle", description: "Ras-GEF-GAP cycle with explicit nucleotide exchange.", tags: ["ras","gef","gap","cycle","sos","rasgap","v_gef","v_gap"] },
    { id: "rec_dim", name: "rec_dim", description: "Ligand-receptor binding", tags: ["validation","rec","dim","lig","writemdl","generate_network","simulate"] },
    { id: "rec_dim_comp", name: "rec_dim_comp", description: "name dimension volume contained_by", tags: ["validation","rec","dim","comp","kp1","kp2","lig","writemdl","generate_network","simulate"] },
    { id: "receptor", name: "13-receptor", description: "A simple model", tags: ["ligand_ispresent","molecules","species"] },
    { id: "receptor", name: "receptor", description: "A simple model of ligand/receptor binding and receptor phosphorylation.", tags: ["receptor","l","r","func"] },
    { id: "receptor_nf", name: "receptor nf", description: "A simple model of ligand/receptor binding and receptor phosphorylation.", tags: ["receptor","nf","l","r"] },
    { id: "receptor_nf", name: "receptor nf", description: "A simple model of ligand/receptor binding and receptor phosphorylation.", tags: ["receptor","nf","l","r"] },
    { id: "Repressilator", name: "Repressilator", description: "Repressilator circuit", tags: ["published","tutorial","native","repressilator","gtetr","gci","glaci","mtetr","mci","mlaci","ptetr","pci"] },
    { id: "repressilator-oscillator", name: "repressilator oscillator", description: "BioNetGen model: repressilator oscillator", tags: ["repressilator","oscillator","genea","geneb","genec","mrna_a","mrna_b","mrna_c","proteina","proteinb"] },
    { id: "retinoic-acid-signaling", name: "retinoic acid signaling", description: "BioNetGen model: retinoic acid signaling", tags: ["retinoic","acid","signaling","ra","rarrxr","corepressor","targetgene"] },
    { id: "rho-gtpase-actin-cytoskeleton", name: "rho gtpase actin cytoskeleton", description: "RhoA-GTPase regulation of the actin cytoskeleton.", tags: ["rho","gtpase","actin","cytoskeleton","rhoa","rock","limk","cofilin"] },
    { id: "Rule_based_egfr_compart", name: "Rule based egfr compart", description: "Compartmental EGFR model", tags: ["published","rule","based","egfr","compart","egf","grb2","shc","generate_network"] },
    { id: "Rule_based_egfr_tutorial", name: "Faeder 2009", description: "EGFR signaling", tags: ["published","rule","based","egfr","tutorial","egf","grb2","shc","generate_network"] },
    { id: "Rule_based_Ran_transport", name: "Rule based Ran transport", description: "Nuclear Ran transport", tags: ["published","rule","based","ran","transport","c","rcc1","generate_network"] },
    { id: "Rule_based_Ran_transport_draft", name: "Rule based Ran transport draft", description: "Ran transport (draft)", tags: ["published","rule","based","ran","transport","draft","c","rcc1","generate_network"] },
    { id: "Scaff-22_ground", name: "18-mapk", description: "For \"ground truth\" model, use median values such that hierarchy H1 occurs, as shown in Table 3.", tags: ["signaling"] },
    { id: "Scaff-22_tofit", name: "18-mapk", description: "For \"ground truth\" model, use median values such that hierarchy H1 occurs, as shown in Table 3.", tags: ["signaling"] },
    { id: "SHP2_base_model", name: "SHP2_base_model", description: "Base model of Shp2 regulation", tags: ["validation","shp2","base","model","r","s","exclude_reactants"] },
    { id: "shp2-phosphatase-regulation", name: "shp2 phosphatase regulation", description: "SHP2 phosphatase regulation via autoinhibition and SH2 binding.", tags: ["shp2","phosphatase","regulation","rtk","substrate","v_dephos"] },
    { id: "signal-amplification-cascade", name: "signal amplification cascade", description: "BioNetGen model: signal amplification cascade", tags: ["signal","amplification","cascade","ligand","receptor","effector","messenger"] },
    { id: "simple", name: "simple", description: "Simple binding model", tags: ["published","tutorials","simple","s","t","dnat","trash"] },
    { id: "Simple", name: "Simple", description: "An example from a real application", tags: ["simple","setoption","ag","r","h"] },
    { id: "Simple_AddActions", name: "Simple AddActions", description: "An example from a real application", tags: ["simple","addactions","setoption","ag","r","h"] },
    { id: "Simple_Answer", name: "Simple Answer", description: "An example from a real application", tags: ["simple","answer","setoption","ag","r","h"] },
    { id: "Simple_GenOnly", name: "Simple GenOnly", description: "An example from a real application", tags: ["simple","genonly","setoption","ag","r","h"] },
    { id: "simple_nf_seed", name: "simple nf seed", description: "BioNetGen model: simple nf seed", tags: ["simple","nf","seed","a","b","function1","simulate"] },
    { id: "simple_nfsim_test", name: "simple_nfsim_test", description: "Runtime-only BNGL model migrated from public/models: simple_nfsim_test", tags: ["simple","nfsim","test"] },
    { id: "Simple_nogen", name: "Simple nogen", description: "An example from a real application", tags: ["simple","nogen","ag","r","h"] },
    { id: "simple_sbml_import", name: "simple_sbml_import", description: "SBML import test", tags: ["validation","simple","sbml","import","readfile","generate_network","simulate"] },
    { id: "simple_system", name: "simple_system", description: "Simple binding system", tags: ["validation","simple","system","x","y"] },
    { id: "simple-dimerization", name: "simple dimerization", description: "BioNetGen model: simple dimerization", tags: ["simple","dimerization","a","b","generate_network","simulate"] },
    { id: "SIR", name: "SIR", description: "BioNetGen model: SIR", tags: ["sir","saveconcentrations","simulate"] },
    { id: "sir-epidemic-model", name: "sir epidemic model", description: "BioNetGen model: sir epidemic model", tags: ["sir","epidemic","model","human","generate_network","simulate"] },
    { id: "smad-tgf-beta-signaling", name: "smad tgf beta signaling", description: "BioNetGen model: smad tgf beta signaling", tags: ["smad","tgf","beta","signaling","tgfb","tgfbr","smad2","smad4"] },
    { id: "sonic-hedgehog-gradient", name: "sonic hedgehog gradient", description: "Sonic Hedgehog (Shh) morphogen gradient formation.", tags: ["sonic","hedgehog","gradient","shh","ptc1","v_prod"] },
    { id: "sp_fourier_synthesizer", name: "sp fourier synthesizer", description: "Fourier Series Synthesizer in BNGL", tags: ["sp","fourier","synthesizer","s1","s3","s5","s7","s9","wave","c1"] },
    { id: "sp_image_convolution", name: "sp image convolution", description: "Image Convolution Filter in BNGL", tags: ["sp","image","convolution","px","ex","sink"] },
    { id: "sp_kalman_filter", name: "sp kalman filter", description: "Kalman Filter in BNGL", tags: ["sp","kalman","filter","truex","obs","estx","estv","variance","innovation"] },
    { id: "stat3-mediated-transcription", name: "stat3 mediated transcription", description: "STAT3-mediated transcription and feedback.", tags: ["stat3","mediated","transcription","dna","pias3","mrna"] },
    { id: "stress-response-adaptation", name: "stress response adaptation", description: "BioNetGen model: stress response adaptation", tags: ["stress","response","adaptation","sensor","adapter","enzyme"] },
    { id: "Suderman_2013", name: "Suderman 2013", description: "Ensemble model translated into BNGL", tags: ["suderman","2013","i","trash","pheromone","ste2","gpa1","ste4","sst2","ste20"] },
    { id: "synaptic-plasticity-ltp", name: "synaptic plasticity ltp", description: "Initial Concentrations", tags: ["synaptic","plasticity","ltp","glutamate","nmda","calcium","camkii","ampar","glusource"] },
    { id: "synbio_band_pass_filter", name: "synbio band pass filter", description: "Model: synbio_band_pass_filter.bngl", tags: ["synbio","band","pass","filter","i","a","r","out"] },
    { id: "synbio_counter_molecular", name: "synbio counter molecular", description: "Model: synbio_counter_molecular.bngl", tags: ["synbio","counter","molecular","state","input"] },
    { id: "synbio_edge_detector", name: "synbio edge detector", description: "Model: synbio_edge_detector.bngl", tags: ["synbio","edge","detector","x","y","z"] },
    { id: "synbio_logic_gates_enzymatic", name: "synbio logic gates enzymatic", description: "Model: synbio_logic_gates_enzymatic.bngl", tags: ["synbio","logic","gates","enzymatic","i1","i2","gateand","gateor","outand","outor"] },
    { id: "synbio_oscillator_synchronization", name: "synbio oscillator synchronization", description: "Model: synbio_oscillator_synchronization.bngl", tags: ["synbio","oscillator","synchronization","osc1","osc2","signal"] },
    { id: "t-cell-activation", name: "t cell activation", description: "BioNetGen model: t cell activation", tags: ["t","cell","activation","tcr","antigen","cytokine"] },
    { id: "tcr", name: "tcr", description: "A model of T cell receptor signaling", tags: ["tcr","lig1","lig2","lig3","cd28","lck","itk","zap70"] },
    { id: "TCR_model", name: "ERK_model.bngl", description: "filename: ERK_model.bngl", tags: ["egf","erkpp_sos1_fb","erkpp_mek_fb","erkpp_raf1_fb","lambda","egfr_tot","ras_tot","sos_tot","rasgap_tot","raf_tot","mek_tot","erk_tot","ekar3_tot","erktr_tot","a1","d1","b1","u1a","u1b","b2a","u2a","b2b","u2b","k2a","k2b","b3","u3","k3","a2","d2","p1","q1","p2","q2","p3","q3","p4","q4","q5","p6","q6","a0_ekar3","d0_ekar3","a0_erktr","d0_erktr","species"] },
    { id: "test_ANG_synthesis_simple", name: "test_ANG_synthesis_simple", description: "Synthesis network test", tags: ["validation","test","ang","synthesis","simple","a","b","c","source","source2","generate_network"] },
    { id: "test_fixed", name: "test_fixed", description: "# actions ##", tags: ["validation","test","fixed","a","b","generate_network","simulate"] },
    { id: "test_MM", name: "test_MM", description: "Kinetic constants", tags: ["validation","test","mm","e","s","p","generate_network"] },
    { id: "test_mratio", name: "test_mratio", description: "Reaction ratio test", tags: ["validation","test","mratio","a","b","c_theory","c_upper","c_lower"] },
    { id: "test_network_gen", name: "test_network_gen", description: "fceri model with network generation", tags: ["validation","test","network","gen","lig","lyn","syk","rec"] },
    { id: "test_sat", name: "test_sat", description: "Kinetic constants", tags: ["validation","test","sat","e","s","p","generate_network"] },
    { id: "test_synthesis_cBNGL_simple", name: "test_synthesis_cBNGL_simple", description: "Compartmental synthesis", tags: ["validation","test","synthesis","cbngl","simple","a","a2","b","c","source","source2"] },
    { id: "test_synthesis_complex", name: "test_synthesis_complex", description: "Complex synthesis test", tags: ["validation","test","synthesis","complex","a","b","c","receptor","source","source2"] },
    { id: "test_synthesis_complex_0_cBNGL", name: "test_synthesis_complex_0_cBNGL", description: "volume-surface", tags: ["validation","test","synthesis","complex","0","cbngl","volume_molecule1","volume_molecule2","surface_molecule1","surface_molecule2","volume_molecule3","volume_molecule4","volume_receptor","surface_receptor"] },
    { id: "test_synthesis_complex_source_cBNGL", name: "test_synthesis_complex_source_cBNGL", description: "volume-surface", tags: ["validation","test","synthesis","complex","source","cbngl","volume_molecule1","volume_molecule2","surface_molecule1","surface_molecule2","volume_molecule3","volume_molecule4","volume_receptor","surface_receptor"] },
    { id: "test_synthesis_simple", name: "test_synthesis_simple", description: "Simple synthesis test", tags: ["validation","test","synthesis","simple","a","b","c","source","source2","generate_network"] },
    { id: "tlbr", name: "tlbr", description: "A model of trivalent ligand, bivalent receptor", tags: ["tlbr","l","r","lambda","fl"] },
    { id: "tlbr", name: "TLBR Tutorial", description: "Ligand binding", tags: ["published","immunology","tlbr","l","r","simulate_rm"] },
    { id: "tlmr", name: "tlmr", description: "Trivalent ligand monovalent receptor", tags: ["validation","tlmr","l","r","generate_network","simulate_ode"] },
    { id: "tlr3-dsrna-sensing", name: "tlr3 dsrna sensing", description: "TLR3-mediated dsRNA sensing and TRIF pathway activation.", tags: ["tlr3","dsrna","sensing","trif","irf3","sarm"] },
    { id: "tnf-induced-apoptosis", name: "tnf induced apoptosis", description: "BioNetGen model: tnf induced apoptosis", tags: ["tnf","induced","apoptosis","tnfr","caspase8","bid","caspase3"] },
    { id: "toggle", name: "Toggle", description: "Toggle switch", tags: ["published","tutorial","native","toggle","x","y","generate_network","writemfile","setconcentration"] },
    { id: "toy-jim", name: "toy-jim", description: "The model consists of a monovalent extracellular ligand,", tags: ["validation","toy","jim","l","r","a","k","null"] },
    { id: "toy1", name: "toy1", description: "Basic signaling toy", tags: ["published","tutorials","toy1","l","r","a","generate_network","writesbml","simulate_ode"] },
    { id: "toy2", name: "toy2", description: "Enzymatic reaction toy", tags: ["published","tutorials","toy2","l","r","a","k"] },
    { id: "translateSBML", name: "translateSBML", description: "title: translateSBML.bngl", tags: ["translatesbml","generate_network","simulate"] },
    { id: "Tricky", name: "Tricky", description: "An example from a real application", tags: ["tricky","ag","r","h"] },
    { id: "TrickyUS", name: "TrickyUS", description: "An example from a real application", tags: ["trickyus","ag","r","h"] },
    { id: "trivial", name: "trivial", description: "A trivial model file for testing MCMC distributions.", tags: ["trivial","q","r","output","generate_network","simulate"] },
    { id: "two-component-system", name: "two component system", description: "BioNetGen model: two component system", tags: ["two","component","system","kinase","regulator","target"] },
    { id: "univ_synth", name: "univ_synth", description: "example of universal synthesis", tags: ["validation","univ","synth","a","b","c","generate_network","simulate_ode"] },
    { id: "vegf-angiogenesis", name: "vegf angiogenesis", description: "VEGF-mediated signaling in angiogenesis.", tags: ["vegf","angiogenesis","vegfr2","vegfr1","erk","endothelial"] },
    { id: "vilar_2002", name: "Vilar 2002", description: "Genetic oscillator", tags: ["published","vilar","2002","dna","a","r"] },
    { id: "vilar_2002b", name: "Vilar 2002b", description: "Gene oscillator", tags: ["published","vilar","2002b","dna","a","r"] },
    { id: "vilar_2002c", name: "Vilar 2002c", description: "Gene oscillator", tags: ["published","vilar","2002c","dna","a","r"] },
    { id: "viral-sensing-innate-immunity", name: "viral sensing innate immunity", description: "BioNetGen model: viral sensing innate immunity", tags: ["viral","sensing","innate","immunity","viralrna","rigi","mavs","irf3","ifnb"] },
    { id: "visualize", name: "Visualize", description: "Visualization toy", tags: ["published","tutorial","native","visualize","x","a1","a2","b"] },
    { id: "wacky_alchemy_stone", name: "wacky alchemy stone", description: "Model: wacky_alchemy_stone.bngl", tags: ["wacky","alchemy","stone","lead","gold"] },
    { id: "wacky_black_hole", name: "wacky black hole", description: "Model: wacky_black_hole.bngl", tags: ["wacky","black","hole","m","bh","k_accrete","k_evap"] },
    { id: "wacky_bouncing_ball", name: "wacky bouncing ball", description: "Model: wacky_bouncing_ball.bngl", tags: ["wacky","bouncing","ball","height","velocity"] },
    { id: "wacky_traffic_jam_asep", name: "wacky traffic jam asep", description: "Model: wacky_traffic_jam_asep.bngl", tags: ["wacky","traffic","jam","asep","site","car","generate_network","simulate"] },
    { id: "wacky_zombie_infection", name: "wacky zombie infection", description: "Model: wacky_zombie_infection.bngl", tags: ["wacky","zombie","infection","human"] },
    { id: "wnt", name: "Wnt Signaling", description: "Wnt signaling", tags: ["published","wnt","dsh","axc","frz","lrp5","bcat"] },
    { id: "wnt-beta-catenin-signaling", name: "wnt beta catenin signaling", description: "Wnt/Beta-Catenin signaling (Canonical pathway).", tags: ["wnt","beta","catenin","signaling","frizzled","dvl","dest_complex","betacatenin","tcf"] },
    { id: "wound-healing-pdgf-signaling", name: "wound healing pdgf signaling", description: "BioNetGen model: wound healing pdgf signaling", tags: ["wound","healing","pdgf","signaling","pdgfr","stat3","fibroblast"] },
    { id: "Yang_2008", name: "Yang 2008", description: "TLBR yang 2008", tags: ["published","physics","yang","2008"] },
    { id: "Zhang_2021", name: "Zhang 2021", description: "CAR-T signaling", tags: ["published","zhang","2021","tie2","tie1","ang1_4","ang2_2","ang2_3","ang2_4","veptp","pten"] },
    { id: "Zhang_2023", name: "Zhang 2023", description: "VEGF signaling", tags: ["published","zhang","2023","vegf","vegfr2","vegfr1","nrp1","pi","plcgamma","dag","ip3_cyto"] }
];

const MODEL_INDEX = new Map(ALL_MODELS.map(m => [m.id, m]));

export const BNG2_COMPATIBLE = new Set(["03_fcerig_fceri_gamma2","04_egfrnf_egfr_nf","06_degranulation_model_tofit","07_egg_egg","10_egfr_egfr_ode","11_TLBR_tlbr","12_TCR_tcr","14_receptor_nf_receptor_nf","15_igf1r_IGF1R_fit_all","19_raf_constraint_RAFi","190127_CHO_EGFR_best-fit","190127_CHO_EGFR_Epigen","190127_CHO_EGFR_sensitivity","190127_CHO_HA_EGFR_L858R","190127_HeLa","190127_HMEC","190127_MCF10A","20_raf_constraint4_RAFi","24_jnk_JNKmodel_180724_bnf","26_tcr_sens_tcr_sens_tofit","31_elephant_elephant","AB","ABC","ABC_scan","ABC_ssa","ABp","ABp_approx","actions_syntax","after_bunching","after_decoupling","after_scaling","akt-signaling","Alabama","allosteric-activation","ampk-signaling","An_2009","apoptosis-cascade","auto-activation-loop","autophagy-regulation","BAB","BAB_coop","BAB_scan","BaruaBCR_2012","bcr-signaling","before_bunching","before_decoupling","before_scaling","beta-adrenergic-response","birth-death","bistable-toggle-switch","BLBR","Blinov_egfr","blood-coagulation-thrombin","bmp-signaling","bng_error","brusselator-oscillator","calcineurin-nfat-pathway","calcium-spike-signaling","CaOscillate_Func","CaOscillate_Sat","caspase-activation-loop","catalysis","cBNGL_simple","cd40-signaling","cell-cycle-checkpoint","check_scaling","checkpoint-kinase-signaling","Cheemalavagu_JAK_STAT","chemotaxis-signal-transduction","Chylek_library","ChylekTCR_2014","circadian-oscillator","clock-bmal1-gene-circuit","compartment_endocytosis","compartment_membrane_bound","compartment_nested_transport","compartment_nuclear_transport","compartment_organelle_exchange","competitive-enzyme-inhibition","complement-activation-cascade","ComplexDegradation","contact-inhibition-hippo-yap","cooperative-binding","Creamer_2012","cs_diffie_hellman","cs_hash_function","cs_huffman","cs_monte_carlo_pi","cs_pagerank","cs_pid_controller","cs_regex_nfa","Dallas","degranulation_model","Dembo_1978","dna-damage-repair","dna-methylation-dynamics","dr5-apoptosis-signaling","Dreisigmeyer_2008","dual-site-phosphorylation","Dushek_2011","Dushek_2014","e2f-rb-cell-cycle-switch","eco_coevolution_host_parasite","eco_food_web_chaos_3sp","eco_lotka_volterra_grid","eco_mutualism_obligate","eco_rock_paper_scissors_spatial","egfr","egfr","egfr","egfr_ground","egfr_ground","egfr_ground","egfr_net_red","egfr_nf","egfr_ode","egfr_path","egfr_simple","egfr-signaling-pathway","egg","eif2a-stress-response","elephant_EFA","elephant_fit","endosomal-sorting-rab","energy_allostery_mwc","energy_catalysis_mm","energy_cooperativity_adh","energy_example1","energy_linear_chain","energy_transport_pump","ensemble_tofit","er-stress-response","ERK_model","erk-nuclear-translocation","ErrNoFrees","example1","example1_BNFfiles_example1","example1_fit","example2_BNFfiles_example2","example2_fit","example2_starting_point","example3_BNFfiles_example3","example3_fit","example4_BNFfiles_example4","example4_fit","example5_BNFfiles_example5","example5_fit","example5_ground_truth","example5_starting_point","example6_BNFfiles_example6","example6_ground_truth","Faeder_2003","fceri_fyn","fceri_gamma2","fceri_gamma2_ground_truth","fceri_ji","FceRI_ji","feature_functional_rates_volume","feature_global_functions_scan","feature_local_functions_explicit","feature_symmetry_factors_cyclic","feature_synthesis_degradation_ss","fgf-signaling-pathway","free_missing","Gardner_2000","gas6-axl-signaling","gene-expression-toggle","genetic_bistability_energy","genetic_dna_replication_stochastic","genetic_goodwin_oscillator","genetic_translation_kinetics","genetic_turing_pattern_1d","GK","glioblastoma-egfrviii-signaling","glycolysis-branch-point","gm_game_of_life","gm_ray_marcher","Goldstein_1980","gpcr-desensitization-arrestin","Harmon_2017","Haugh2b","hedgehog-signaling-pathway","heise","hematopoietic-growth-factor","hif1a_degradation_loop","Hlavacek_1999","Hlavacek_2001","Hlavacek2018Egg_egg","Houston","hypoxia-response-signaling","IGF1R_Model_receptor_activation_bnf","il1b-signaling","il6-jak-stat-pathway","immune-synapse-formation","inflammasome-activation","innate_immunity","inositol-phosphate-metabolism","insulin-glucose-homeostasis","interferon-signaling","ire1a-xbp1-er-stress","issue_198_short","jak-stat-cytokine-signaling","Jaruszewicz-Blonska_2023","jnk-mapk-signaling","jobs_ground","jobs_tofit","kir-channel-regulation","Korwek_2023","l-type-calcium-channel-dynamics","lac-operon-regulation","Lang_2024","Ligon_2014","LilyIgE","Lin_ERK_2019","Lin_Prion_2019","Lin_TCR_2019","lipid-mediated-pip3-signaling","Lisman","Lisman_bifurcate","localfunc","LR","LR_comp","LRR","LRR_comp","LV","LV_comp","m1","m1_ground","machine_tofit","Macken_1982","Mallela2021_Cities","Mallela2021_States","Mallela2022_MSAs","mapk-signaling-cascade","Massole_2023","McMillan_2021","meta_formal_game_theory","meta_formal_molecular_clock","meta_formal_petri_net","michaelis-menten-kinetics","michment","Miller2022_NavajoNation","Miller2025_MEK","Mitra2019_02_egfr_bnf1_InputFiles_egfr","ml_gradient_descent","ml_hopfield","ml_kmeans","ml_q_learning","ml_svm","model","model","model_ground","model_tofit","Model_ZAP","Motivating_example","Motivating_example_cBNGL","motor","mt_arithmetic_compiler","mt_bngl_interpreter","mt_music_sequencer","mt_pascal_triangle","mt_quine","mtor-signaling","mtorc2-signaling","Mukhopadhyay_2013","mwc","myogenic-differentiation","Myrtle_Beach-Conway-North_Myrtle_Beach_SC-NC","negative-feedback-loop","neurotransmitter-release","nfkb","nfkb-feedback","NFmodel","nfsim_aggregation_gelation","nfsim_coarse_graining","nfsim_dynamic_compartments","nfsim_hybrid_particle_field","nfsim_ring_closure_polymer","nn_xor","no_frees","no_generate_network","no_suffix","no-cgmp-signaling","notch-delta-lateral-inhibition","NYC","organelle_transport","organelle_transport_struct","oxidative-stress-response","p38-mapk-signaling","p53-mdm2-oscillator","parabola","parabola","parabola","parabola","parabola","parabola_ground","parabola2","ParamsEverywhere","parp1-mediated-dna-repair","ph_lorenz_attractor","ph_nbody_gravity","ph_schrodinger","ph_wave_equation","Phoenix","phosphorelay-chain","platelet-activation","polymer","polymer_draft","polymer_fixed","polynomial","polynomial","polynomial","polynomial_ground","Posner_1995","Posner_2004","predator-prey-dynamics","prion_model","problem_quant_model_tofit","problem16_3cat_model0_tofit","problem16_model0_tofit","problem32_3cat_model0_tofit","problem32_model0_tofit","problem4_3cat_model0_tofit","problem4_model0_tofit","problem64_3cat_model0_tofit","problem64_model0_tofit","problem8_3cat_model0_tofit","problem8_model0_tofit","process_actin_treadmilling","process_autophagy_flux","process_cell_adhesion_strength","process_kinetic_proofreading_tcr","process_quorum_sensing_switch","pt303","pt403","pt409","PyBNF_fitting_setup_190127_CHO_EGFR_forBNF","quasi_equilibrium","quorum-sensing-circuit","rab_mon1ccz1_ox","rab_mon1ccz1_ox","rab_rab5_ox","rab_rab5_ox","rab_rab7_ox","rab_rab7_ox","rab_wt","rab_wt","rab-gtpase-cycle","RAFi","RAFi_ground","rankl-rank-signaling","ras-gef-gap-cycle","receptor","receptor","receptor_nf","receptor_nf","Repressilator","repressilator-oscillator","retinoic-acid-signaling","rho-gtpase-actin-cytoskeleton","Rule_based_egfr_tutorial","Scaff-22_ground","Scaff-22_tofit","SHP2_base_model","shp2-phosphatase-regulation","signal-amplification-cascade","Simple","Simple_AddActions","Simple_Answer","Simple_GenOnly","simple_nf_seed","simple_nfsim_test","Simple_nogen","simple_system","simple-dimerization","SIR","sir-epidemic-model","smad-tgf-beta-signaling","sonic-hedgehog-gradient","sp_fourier_synthesizer","sp_image_convolution","sp_kalman_filter","stat3-mediated-transcription","stress-response-adaptation","Suderman_2013","synaptic-plasticity-ltp","synbio_band_pass_filter","synbio_counter_molecular","synbio_edge_detector","synbio_logic_gates_enzymatic","synbio_oscillator_synchronization","t-cell-activation","tcr","TCR_model","test_ANG_synthesis_simple","test_fixed","test_MM","test_mratio","test_sat","test_synthesis_cBNGL_simple","test_synthesis_complex","test_synthesis_complex_0_cBNGL","test_synthesis_complex_source_cBNGL","test_synthesis_simple","tlbr","tlmr","tlr3-dsrna-sensing","tnf-induced-apoptosis","toy-jim","translateSBML","Tricky","TrickyUS","trivial","two-component-system","univ_synth","vegf-angiogenesis","viral-sensing-innate-immunity","visualize","wacky_alchemy_stone","wacky_black_hole","wacky_bouncing_ball","wacky_traffic_jam_asep","wacky_zombie_infection","wnt-beta-catenin-signaling","wound-healing-pdgf-signaling","Yang_2008"]);
export const NFSIM_COMPATIBLE = new Set(["04_egfrnf_egfr_nf","11_TLBR_tlbr","12_TCR_tcr","14_receptor_nf_receptor_nf","26_tcr_sens_tcr_sens_tofit","AB","ABC","ABC_ssa","ABp","ABp_approx","akt-signaling","allosteric-activation","apoptosis-cascade","auto-activation-loop","BAB","BAB_coop","beta-adrenergic-response","bistable-toggle-switch","BLBR","Blinov_egfr","Blinov_ran","blood-coagulation-thrombin","brusselator-oscillator","calcium-spike-signaling","CaMKII_holo","cBNGL_simple","cell-cycle-checkpoint","Chattaraj_2021","chemotaxis-signal-transduction","Chylek_library","ChylekFceRI_2014","ChylekTCR_2014","circadian-oscillator","CircadianOscillator","competitive-enzyme-inhibition","complement-activation-cascade","cooperative-binding","Creamer_2012","cs_hash_function","cs_pid_controller","dna-damage-repair","dual-site-phosphorylation","Dushek_2014","egfr_nf","egfr_simple","egfr-signaling-pathway","ensemble_tofit","er-stress-response","example2_BNFfiles_example2","example2_starting_point","example3_BNFfiles_example3","example4_BNFfiles_example4","example6_BNFfiles_example6","extra_CaMKII_Holo","Faeder_2003","fceri_fyn","fceri_gamma2","fceri_ji","gene-expression-toggle","GK","glycolysis-branch-point","gm_ray_marcher","hematopoietic-growth-factor","hif1a_degradation_loop","hypoxia-response-signaling","immune-synapse-formation","inflammasome-activation","insulin-glucose-homeostasis","interferon-signaling","jak-stat-cytokine-signaling","jobs_ground","jobs_tofit","Kesseler_2013","Kocieniewski_2012","lac-operon-regulation","Ligon_2014","lipid-mediated-pip3-signaling","Lisman","Lisman_bifurcate","LR","LR_comp","LRR","LRR_comp","machine_tofit","mapk-signaling-cascade","Massole_2023","McMillan_2021","Mertins_2023","michaelis-menten-kinetics","michment_cont","ml_gradient_descent","ml_q_learning","Model_ZAP","mt_music_sequencer","mtor-signaling","myogenic-differentiation","negative-feedback-loop","neurotransmitter-release","nfkb-feedback","NFmodel","no_generate_network","notch-delta-lateral-inhibition","organelle_transport","organelle_transport_struct","oxidative-stress-response","p53-mdm2-oscillator","ph_lorenz_attractor","phosphorelay-chain","platelet-activation","polymer","polymer_draft","polymer_fixed","predator-prey-dynamics","quorum-sensing-circuit","rab-gtpase-cycle","receptor_nf","receptor_nf","Repressilator","repressilator-oscillator","retinoic-acid-signaling","signal-amplification-cascade","simple_nfsim_test","Simple_nogen","simple-dimerization","SIR","sir-epidemic-model","smad-tgf-beta-signaling","sp_fourier_synthesizer","sp_image_convolution","sp_kalman_filter","stress-response-adaptation","Suderman_2013","synaptic-plasticity-ltp","t-cell-activation","tcr","tlbr","tlbr","tnf-induced-apoptosis","Tricky","two-component-system","vegf-angiogenesis","viral-sensing-innate-immunity","visualize","wnt-beta-catenin-signaling","wound-healing-pdgf-signaling"]);
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
  "02_egfr_egfr": [
    "published-models"
  ],
  "03_fcerig_fceri_gamma2": [
    "published-models"
  ],
  "04_egfrnf_egfr_nf": [
    "published-models"
  ],
  "05_threestep_m1": [
    "published-models"
  ],
  "06_degranulation_model_tofit": [
    "published-models"
  ],
  "07_egg_egg": [
    "published-models"
  ],
  "10_egfr_egfr_ode": [
    "published-models"
  ],
  "11_TLBR_tlbr": [
    "published-models"
  ],
  "12_TCR_tcr": [
    "published-models"
  ],
  "13_receptor_example5_starting_point": [
    "published-models"
  ],
  "14_receptor_nf_receptor_nf": [
    "published-models"
  ],
  "15_igf1r_IGF1R_fit_all": [
    "published-models"
  ],
  "17_egfr_ssa_egfr": [
    "published-models"
  ],
  "18_mapk_Scaff_22_ground": [
    "published-models"
  ],
  "19_raf_constraint_RAFi": [
    "published-models"
  ],
  "20_raf_constraint4_RAFi": [
    "published-models"
  ],
  "24_jnk_JNKmodel_180724_bnf": [
    "published-models"
  ],
  "26_tcr_sens_tcr_sens_tofit": [
    "published-models"
  ],
  "28_mapk_ensemble_tofit": [
    "published-models"
  ],
  "30_jobs_jobs_ground": [
    "published-models"
  ],
  "31_elephant_elephant": [
    "published-models"
  ],
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
  "Alabama": [
    "published-models"
  ],
  "An_2009": [
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
  "BaruaBCR_2012": [
    "immunology",
    "published-models"
  ],
  "BaruaFceRI_2012": [
    "immunology",
    "published-models"
  ],
  "Barua_2007": [
    "cancer",
    "published-models"
  ],
  "Barua_2009": [
    "cancer",
    "published-models"
  ],
  "Barua_2013": [
    "published-models"
  ],
  "Blinov_2006": [
    "cell-cycle",
    "published-models"
  ],
  "Blinov_egfr": [
    "cancer",
    "published-models"
  ],
  "Blinov_ran": [
    "cell-cycle",
    "published-models"
  ],
  "CaMKII_holo": [
    "published-models"
  ],
  "Chattaraj_2021": [
    "neuroscience",
    "published-models"
  ],
  "Cheemalavagu_JAK_STAT": [
    "immunology",
    "published-models"
  ],
  "ChylekFceRI_2014": [
    "immunology",
    "published-models"
  ],
  "ChylekTCR_2014": [
    "immunology",
    "published-models"
  ],
  "Chylek_library": [
    "native-tutorials"
  ],
  "CircadianOscillator": [
    "cell-cycle",
    "native-tutorials",
    "published-models"
  ],
  "ComplexDegradation": [
    "native-tutorials",
    "published-models"
  ],
  "Creamer_2012": [
    "native-tutorials"
  ],
  "Dallas": [
    "published-models"
  ],
  "Dembo_1978": [
    "physics",
    "published-models"
  ],
  "Dolan_2015": [
    "metabolism",
    "published-models"
  ],
  "Dreisigmeyer_2008": [
    "published-models"
  ],
  "Dushek_2011": [
    "immunology",
    "published-models"
  ],
  "Dushek_2014": [
    "immunology",
    "published-models"
  ],
  "Erdem_2021": [
    "metabolism",
    "published-models"
  ],
  "Faeder_2003": [
    "immunology",
    "published-models"
  ],
  "FceRI_ji": [
    "native-tutorials"
  ],
  "FceRI_viz": [
    "native-tutorials",
    "published-models"
  ],
  "GK": [
    "metabolism",
    "native-tutorials"
  ],
  "Gardner_2000": [
    "published-models"
  ],
  "Goldstein_1980": [
    "physics",
    "published-models"
  ],
  "Harmon_2017": [
    "immunology",
    "published-models"
  ],
  "Hat_2016": [
    "cell-cycle",
    "multistage",
    "published-models"
  ],
  "Hlavacek2018Egg_egg": [
    "published-models"
  ],
  "Hlavacek2018Elephant_elephant_EFA": [
    "published-models"
  ],
  "Hlavacek2018Restructuration_after_bunching": [
    "published-models"
  ],
  "Hlavacek_1999": [
    "physics",
    "published-models"
  ],
  "Hlavacek_2001": [
    "physics",
    "published-models"
  ],
  "Houston": [
    "published-models"
  ],
  "IGF1R_Model_receptor_activation_bnf": [
    "published-models"
  ],
  "Jaruszewicz-Blonska_2023": [
    "immunology",
    "published-models"
  ],
  "Jung_2017": [
    "neuroscience",
    "published-models"
  ],
  "Kesseler_2013": [
    "cell-cycle",
    "published-models"
  ],
  "Kocieniewski_2012": [
    "published-models"
  ],
  "Kozer_2013": [
    "cancer",
    "published-models"
  ],
  "Kozer_2014": [
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
  "Lang_2024": [
    "cell-cycle",
    "published-models"
  ],
  "Ligon_2014": [
    "cancer",
    "published-models"
  ],
  "Lin2019_ERK_model": [
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
  "Macken_1982": [
    "physics",
    "published-models"
  ],
  "Mallela2021_Cities": [
    "published-models"
  ],
  "Mallela2021_States": [
    "published-models"
  ],
  "Mallela2022_MSAs": [
    "published-models"
  ],
  "Massole_2023": [
    "developmental",
    "published-models"
  ],
  "McMillan_2021": [
    "immunology",
    "published-models"
  ],
  "Mertins_2023": [
    "cancer",
    "published-models"
  ],
  "Miller2022_NavajoNation": [
    "published-models"
  ],
  "Miller2025_MEK": [
    "published-models"
  ],
  "Mitra2019_02_egfr_bnf1_InputFiles_egfr": [
    "published-models"
  ],
  "Model_ZAP": [
    "immunology",
    "published-models"
  ],
  "Mukhopadhyay_2013": [
    "immunology",
    "published-models"
  ],
  "NYC": [
    "published-models"
  ],
  "Nag_2009": [
    "cancer",
    "published-models"
  ],
  "Nosbisch_2022": [
    "cancer",
    "published-models"
  ],
  "Pekalski_2013": [
    "published-models"
  ],
  "Phoenix": [
    "published-models"
  ],
  "Posner_1995": [
    "physics",
    "published-models"
  ],
  "Posner_2004": [
    "physics",
    "published-models"
  ],
  "PyBNF_fitting_setup_190127_CHO_EGFR_forBNF": [
    "published-models"
  ],
  "RAFi": [
    "published-models"
  ],
  "RAFi_ground": [
    "published-models"
  ],
  "Repressilator": [
    "cell-cycle",
    "native-tutorials",
    "published-models",
    "synbio"
  ],
  "Rule_based_Ran_transport": [
    "published-models"
  ],
  "Rule_based_Ran_transport_draft": [
    "published-models"
  ],
  "Rule_based_egfr_compart": [
    "published-models"
  ],
  "Rule_based_egfr_tutorial": [
    "cancer",
    "published-models"
  ],
  "SIR": [
    "native-tutorials"
  ],
  "Salazar_Cavazos2019_190127_CHO_EGFR_best_fit": [
    "published-models"
  ],
  "Suderman_2013": [
    "native-tutorials"
  ],
  "Thomas2016_example1_fit": [
    "published-models"
  ],
  "Yang_2008": [
    "physics",
    "published-models"
  ],
  "Zhang_2021": [
    "developmental",
    "published-models"
  ],
  "Zhang_2023": [
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
    "native-tutorials",
    "published-models"
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
    "published-models",
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
  "degranulation_model": [
    "immunology",
    "published-models"
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
  "egfr": [
    "published-models"
  ],
  "egfr-signaling-pathway": [
    "cancer",
    "test-models"
  ],
  "egfr_ground": [
    "published-models"
  ],
  "egfr_nf": [
    "published-models"
  ],
  "egfr_ode": [
    "cancer",
    "published-models"
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
    "published-models"
  ],
  "example1_BNFfiles_example1": [
    "published-models"
  ],
  "example2_BNFfiles_example2": [
    "published-models"
  ],
  "example2_starting_point": [
    "published-models"
  ],
  "example3_BNFfiles_example3": [
    "published-models"
  ],
  "example4_BNFfiles_example4": [
    "published-models"
  ],
  "example5_BNFfiles_example5": [
    "published-models"
  ],
  "example6_BNFfiles_example6": [
    "published-models"
  ],
  "extra_CaMKII_Holo": [
    "published-models"
  ],
  "fceri_fyn": [
    "immunology",
    "published-models"
  ],
  "fceri_gamma2": [
    "published-models"
  ],
  "fceri_gamma2_ground_truth": [
    "published-models"
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
  "innate_immunity": [
    "immunology",
    "published-models"
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
  "mCaMKII_Ca_Spike": [
    "published-models"
  ],
  "mapk-dimers": [
    "cancer",
    "published-models"
  ],
  "mapk-monomers": [
    "cancer",
    "published-models"
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
  "model": [
    "published-models"
  ],
  "model_ground": [
    "published-models"
  ],
  "model_tofit": [
    "published-models"
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
  "nfkb-feedback": [
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
  "notch": [
    "published-models"
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
  "parabola": [
    "published-models"
  ],
  "parabola_ground": [
    "published-models"
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
    "published-models",
    "tutorials"
  ],
  "polymer_draft": [
    "published-models",
    "tutorials"
  ],
  "polynomial": [
    "published-models"
  ],
  "polynomial_ground": [
    "published-models"
  ],
  "predator-prey-dynamics": [
    "test-models"
  ],
  "problem16_3cat_model0_tofit": [
    "published-models"
  ],
  "problem16_model0_tofit": [
    "published-models"
  ],
  "problem32_3cat_model0_tofit": [
    "published-models"
  ],
  "problem32_model0_tofit": [
    "published-models"
  ],
  "problem4_3cat_model0_tofit": [
    "published-models"
  ],
  "problem4_model0_tofit": [
    "published-models"
  ],
  "problem64_3cat_model0_tofit": [
    "published-models"
  ],
  "problem64_model0_tofit": [
    "published-models"
  ],
  "problem8_3cat_model0_tofit": [
    "published-models"
  ],
  "problem8_model0_tofit": [
    "published-models"
  ],
  "problem_quant_model_tofit": [
    "published-models"
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
  "pt303": [
    "published-models"
  ],
  "pt403": [
    "published-models"
  ],
  "pt409": [
    "published-models"
  ],
  "pybnf_files_rab_mon1ccz1_ox": [
    "published-models"
  ],
  "quasi_equilibrium": [
    "native-tutorials",
    "published-models",
    "tutorials"
  ],
  "quorum-sensing-circuit": [
    "test-models"
  ],
  "rab-gtpase-cycle": [
    "test-models"
  ],
  "rab_mon1ccz1_ox": [
    "published-models"
  ],
  "rankl-rank-signaling": [
    "developmental",
    "test-models"
  ],
  "ras-gef-gap-cycle": [
    "cancer",
    "test-models"
  ],
  "receptor": [
    "published-models"
  ],
  "receptor_nf": [
    "published-models"
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
    "published-models",
    "tutorials"
  ],
  "simple-dimerization": [
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
  "tcr": [
    "published-models"
  ],
  "tlbr": [
    "immunology",
    "published-models"
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
    "published-models",
    "synbio"
  ],
  "toy1": [
    "published-models",
    "tutorials"
  ],
  "toy2": [
    "published-models",
    "tutorials"
  ],
  "two-component-system": [
    "test-models"
  ],
  "vegf-angiogenesis": [
    "cancer",
    "test-models"
  ],
  "vilar_2002": [
    "cell-cycle",
    "published-models"
  ],
  "vilar_2002b": [
    "cell-cycle",
    "published-models"
  ],
  "vilar_2002c": [
    "published-models"
  ],
  "viral-sensing-innate-immunity": [
    "immunology",
    "test-models"
  ],
  "visualize": [
    "native-tutorials",
    "published-models"
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
  "wnt": [
    "published-models"
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
