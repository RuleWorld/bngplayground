/**
 * PKTemplates.ts – PK model template library that generates BNGL code from PK configurations.
 */

export type PKModelType =
  | 'one_compartment_iv'
  | 'one_compartment_oral'
  | 'two_compartment_iv'
  | 'two_compartment_oral'
  | 'three_compartment'
  | 'tmdd'
  | 'pbpk_minimal';

export interface PKModelConfig {
  type: PKModelType;
  drugName: string;
  targetName?: string;
  route: 'iv_bolus' | 'iv_infusion' | 'oral' | 'subcutaneous' | 'intramuscular';
  molecularWeight?: number;
  includePD?: boolean;
  pdModel?: 'direct_emax' | 'indirect_response' | 'signal_transduction' | 'cell_kill';
  parameters?: Record<string, number>;
}

export interface PKParameterDescription {
  name: string;
  description: string;
  units: string;
  defaultValue: number;
  typicalRange: [number, number];
}

export interface PKObservableDescription {
  name: string;
  description: string;
  units: string;
  clinicalRelevance: string;
}

export interface SuggestedDosingEvent {
  time: number;
  amount: number;
  compartment: string;
  duration?: number;
}

export interface SuggestedDosing {
  name: string;
  events: SuggestedDosingEvent[];
}

export interface PKModelResult {
  bnglCode: string;
  parameterDescriptions: Record<string, PKParameterDescription>;
  observableDescriptions: Record<string, PKObservableDescription>;
  suggestedDosing: SuggestedDosing[];
}

// ---------------------------------------------------------------------------
// Default parameter sets
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: Record<PKModelType, Record<string, number>> = {
  one_compartment_iv: {
    V_central: 3.0,
    CL: 0.5,
    Dose: 100,
  },
  one_compartment_oral: {
    V_central: 3.0,
    CL: 0.5,
    ka: 1.0,
    F: 1.0,
    Dose: 100,
  },
  two_compartment_iv: {
    V1: 3.0,
    V2: 10.0,
    CL: 0.5,
    Q: 0.8,
    Dose: 100,
  },
  two_compartment_oral: {
    V1: 3.0,
    V2: 10.0,
    CL: 0.5,
    Q: 0.8,
    ka: 1.0,
    F: 1.0,
    Dose: 100,
  },
  three_compartment: {
    V1: 3.0,
    V2: 10.0,
    V3: 20.0,
    CL: 0.5,
    Q2: 0.8,
    Q3: 0.3,
    Dose: 100,
  },
  tmdd: {
    V_central: 3.0,
    CL: 0.5,
    kon: 0.1,
    koff: 0.01,
    kint: 0.05,
    kdeg: 0.02,
    ksyn: 0.1,
    kdeg_target: 0.05,
    R0: 10.0,
    Dose: 100,
  },
  pbpk_minimal: {
    V_plasma: 3.0,
    V_liver: 1.5,
    V_kidney: 0.3,
    V_muscle: 30.0,
    V_adipose: 15.0,
    Q_liver: 1.5,
    Q_kidney: 1.0,
    Q_muscle: 0.8,
    Q_adipose: 0.3,
    Kp_liver: 5.0,
    Kp_kidney: 3.0,
    Kp_muscle: 2.0,
    Kp_adipose: 10.0,
    CL_hepatic: 0.5,
    CL_renal: 0.2,
    Dose: 100,
  },
};

export function getDefaultPKParameters(type: PKModelType): Record<string, number> {
  return { ...DEFAULT_PARAMS[type] };
}

// ---------------------------------------------------------------------------
// BNGL code generators
// ---------------------------------------------------------------------------

function mergeParams(type: PKModelType, overrides?: Record<string, number>): Record<string, number> {
  return { ...DEFAULT_PARAMS[type], ...overrides };
}

function generateOneCompartmentIV(config: PKModelConfig): PKModelResult {
  const p = mergeParams('one_compartment_iv', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V_central ${p.V_central}  # Volume of distribution (L)`,
    `  CL ${p.CL}         # Clearance (L/hr)`,
    '  ke CL/V_central # Elimination rate constant',
    `  Dose ${p.Dose}       # mg`,
    'end parameters',
    '',
    'begin compartments',
    `  central 3 V_central`,
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @central:${drug}() Dose/V_central`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @central:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @central:${drug}() -> 0 ke`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V_central: { name: 'V_central', description: 'Volume of distribution (central)', units: 'L', defaultValue: p.V_central, typicalRange: [1, 10] },
      CL: { name: 'CL', description: 'Total body clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.1, 5.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Plasma drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint for exposure assessment' },
    },
    suggestedDosing: [
      { name: 'Single IV bolus', events: [{ time: 0, amount: p.Dose, compartment: 'central' }] },
      { name: 'QD IV x7', events: Array.from({ length: 7 }, (_, i) => ({ time: i * 24, amount: p.Dose, compartment: 'central' })) },
    ],
  };
}

function generateOneCompartmentOral(config: PKModelConfig): PKModelResult {
  const p = mergeParams('one_compartment_oral', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V_central ${p.V_central}  # Volume of distribution (L)`,
    `  CL ${p.CL}         # Clearance (L/hr)`,
    '  ke CL/V_central # Elimination rate constant',
    `  ka ${p.ka}          # Absorption rate constant (1/hr)`,
    `  F ${p.F}           # Bioavailability`,
    `  Dose ${p.Dose}       # mg`,
    'end parameters',
    '',
    'begin compartments',
    '  gut 3 1.0',
    `  central 3 V_central`,
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @gut:${drug}() Dose*F`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @central:${drug}()`,
    `  Molecules A_gut @gut:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @gut:${drug}() -> @central:${drug}() ka`,
    `  @central:${drug}() -> 0 ke`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V_central: { name: 'V_central', description: 'Volume of distribution (central)', units: 'L', defaultValue: p.V_central, typicalRange: [1, 10] },
      CL: { name: 'CL', description: 'Total body clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.1, 5.0] },
      ka: { name: 'ka', description: 'First-order absorption rate constant', units: '1/hr', defaultValue: p.ka, typicalRange: [0.1, 5.0] },
      F: { name: 'F', description: 'Oral bioavailability', units: 'dimensionless', defaultValue: p.F, typicalRange: [0.1, 1.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Plasma drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint for exposure assessment' },
      A_gut: { name: 'A_gut', description: 'Amount of drug remaining in gut', units: 'mg', clinicalRelevance: 'Indicates absorption phase completeness' },
    },
    suggestedDosing: [
      { name: 'Single oral dose', events: [{ time: 0, amount: p.Dose, compartment: 'gut' }] },
      { name: 'QD oral x7', events: Array.from({ length: 7 }, (_, i) => ({ time: i * 24, amount: p.Dose, compartment: 'gut' })) },
    ],
  };
}

function generateTwoCompartmentIV(config: PKModelConfig): PKModelResult {
  const p = mergeParams('two_compartment_iv', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V1 ${p.V1}  # Central volume (L)`,
    `  V2 ${p.V2}  # Peripheral volume (L)`,
    `  CL ${p.CL}  # Clearance (L/hr)`,
    `  Q ${p.Q}    # Intercompartmental clearance (L/hr)`,
    '  k10 CL/V1   # Elimination rate constant',
    '  k12 Q/V1     # Central to peripheral rate',
    '  k21 Q/V2     # Peripheral to central rate',
    `  Dose ${p.Dose}  # mg`,
    'end parameters',
    '',
    'begin compartments',
    '  central 3 V1',
    '  peripheral 3 V2',
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @central:${drug}() Dose/V1`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @central:${drug}()`,
    `  Molecules C_peripheral @peripheral:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @central:${drug}() -> @peripheral:${drug}() k12`,
    `  @peripheral:${drug}() -> @central:${drug}() k21`,
    `  @central:${drug}() -> 0 k10`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V1: { name: 'V1', description: 'Central compartment volume', units: 'L', defaultValue: p.V1, typicalRange: [1, 10] },
      V2: { name: 'V2', description: 'Peripheral compartment volume', units: 'L', defaultValue: p.V2, typicalRange: [5, 50] },
      CL: { name: 'CL', description: 'Total body clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.1, 5.0] },
      Q: { name: 'Q', description: 'Intercompartmental clearance', units: 'L/hr', defaultValue: p.Q, typicalRange: [0.1, 5.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Central (plasma) drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint' },
      C_peripheral: { name: 'C_peripheral', description: 'Peripheral tissue drug concentration', units: 'mg/L', clinicalRelevance: 'Tissue distribution assessment' },
    },
    suggestedDosing: [
      { name: 'Single IV bolus', events: [{ time: 0, amount: p.Dose, compartment: 'central' }] },
    ],
  };
}

function generateTwoCompartmentOral(config: PKModelConfig): PKModelResult {
  const p = mergeParams('two_compartment_oral', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V1 ${p.V1}  # Central volume (L)`,
    `  V2 ${p.V2}  # Peripheral volume (L)`,
    `  CL ${p.CL}  # Clearance (L/hr)`,
    `  Q ${p.Q}    # Intercompartmental clearance (L/hr)`,
    '  k10 CL/V1   # Elimination rate constant',
    '  k12 Q/V1     # Central to peripheral rate',
    '  k21 Q/V2     # Peripheral to central rate',
    `  ka ${p.ka}   # Absorption rate constant (1/hr)`,
    `  F ${p.F}     # Bioavailability`,
    `  Dose ${p.Dose}  # mg`,
    'end parameters',
    '',
    'begin compartments',
    '  gut 3 1.0',
    '  central 3 V1',
    '  peripheral 3 V2',
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @gut:${drug}() Dose*F`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @central:${drug}()`,
    `  Molecules C_peripheral @peripheral:${drug}()`,
    `  Molecules A_gut @gut:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @gut:${drug}() -> @central:${drug}() ka`,
    `  @central:${drug}() -> @peripheral:${drug}() k12`,
    `  @peripheral:${drug}() -> @central:${drug}() k21`,
    `  @central:${drug}() -> 0 k10`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V1: { name: 'V1', description: 'Central compartment volume', units: 'L', defaultValue: p.V1, typicalRange: [1, 10] },
      V2: { name: 'V2', description: 'Peripheral compartment volume', units: 'L', defaultValue: p.V2, typicalRange: [5, 50] },
      CL: { name: 'CL', description: 'Total body clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.1, 5.0] },
      Q: { name: 'Q', description: 'Intercompartmental clearance', units: 'L/hr', defaultValue: p.Q, typicalRange: [0.1, 5.0] },
      ka: { name: 'ka', description: 'First-order absorption rate constant', units: '1/hr', defaultValue: p.ka, typicalRange: [0.1, 5.0] },
      F: { name: 'F', description: 'Oral bioavailability', units: 'dimensionless', defaultValue: p.F, typicalRange: [0.1, 1.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Central (plasma) drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint' },
      C_peripheral: { name: 'C_peripheral', description: 'Peripheral tissue drug concentration', units: 'mg/L', clinicalRelevance: 'Tissue distribution assessment' },
      A_gut: { name: 'A_gut', description: 'Amount of drug remaining in gut', units: 'mg', clinicalRelevance: 'Absorption phase assessment' },
    },
    suggestedDosing: [
      { name: 'Single oral dose', events: [{ time: 0, amount: p.Dose, compartment: 'gut' }] },
    ],
  };
}

function generateThreeCompartment(config: PKModelConfig): PKModelResult {
  const p = mergeParams('three_compartment', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V1 ${p.V1}   # Central volume (L)`,
    `  V2 ${p.V2}   # Shallow peripheral volume (L)`,
    `  V3 ${p.V3}   # Deep peripheral volume (L)`,
    `  CL ${p.CL}   # Clearance (L/hr)`,
    `  Q2 ${p.Q2}   # Intercompartmental clearance central-shallow (L/hr)`,
    `  Q3 ${p.Q3}   # Intercompartmental clearance central-deep (L/hr)`,
    '  k10 CL/V1',
    '  k12 Q2/V1',
    '  k21 Q2/V2',
    '  k13 Q3/V1',
    '  k31 Q3/V3',
    `  Dose ${p.Dose}`,
    'end parameters',
    '',
    'begin compartments',
    '  central 3 V1',
    '  shallow 3 V2',
    '  deep 3 V3',
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @central:${drug}() Dose/V1`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @central:${drug}()`,
    `  Molecules C_shallow @shallow:${drug}()`,
    `  Molecules C_deep @deep:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @central:${drug}() -> @shallow:${drug}() k12`,
    `  @shallow:${drug}() -> @central:${drug}() k21`,
    `  @central:${drug}() -> @deep:${drug}() k13`,
    `  @deep:${drug}() -> @central:${drug}() k31`,
    `  @central:${drug}() -> 0 k10`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V1: { name: 'V1', description: 'Central compartment volume', units: 'L', defaultValue: p.V1, typicalRange: [1, 10] },
      V2: { name: 'V2', description: 'Shallow peripheral volume', units: 'L', defaultValue: p.V2, typicalRange: [5, 30] },
      V3: { name: 'V3', description: 'Deep peripheral volume', units: 'L', defaultValue: p.V3, typicalRange: [10, 50] },
      CL: { name: 'CL', description: 'Total body clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.1, 5.0] },
      Q2: { name: 'Q2', description: 'Intercompartmental clearance (shallow)', units: 'L/hr', defaultValue: p.Q2, typicalRange: [0.1, 5.0] },
      Q3: { name: 'Q3', description: 'Intercompartmental clearance (deep)', units: 'L/hr', defaultValue: p.Q3, typicalRange: [0.05, 2.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Plasma drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint' },
      C_shallow: { name: 'C_shallow', description: 'Shallow peripheral concentration', units: 'mg/L', clinicalRelevance: 'Well-perfused tissue distribution' },
      C_deep: { name: 'C_deep', description: 'Deep peripheral concentration', units: 'mg/L', clinicalRelevance: 'Slowly equilibrating tissue distribution' },
    },
    suggestedDosing: [
      { name: 'Single IV bolus', events: [{ time: 0, amount: p.Dose, compartment: 'central' }] },
    ],
  };
}

function generateTMDD(config: PKModelConfig): PKModelResult {
  const p = mergeParams('tmdd', config.parameters);
  const drug = config.drugName;
  const target = config.targetName || 'Target';

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V_central ${p.V_central}  # Volume of distribution (L)`,
    `  CL ${p.CL}          # Linear clearance (L/hr)`,
    '  ke CL/V_central      # Linear elimination rate constant',
    `  kon ${p.kon}         # Binding on-rate (1/nM/hr)`,
    `  koff ${p.koff}       # Binding off-rate (1/hr)`,
    `  kint ${p.kint}       # Internalization rate (1/hr)`,
    `  kdeg ${p.kdeg}       # Complex degradation rate (1/hr)`,
    `  ksyn ${p.ksyn}       # Target synthesis rate (nM/hr)`,
    `  kdeg_target ${p.kdeg_target}  # Target degradation rate (1/hr)`,
    `  R0 ${p.R0}           # Baseline target concentration (nM)`,
    `  Dose ${p.Dose}        # mg`,
    'end parameters',
    '',
    'begin compartments',
    '  central 3 V_central',
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}(r)`,
    `  ${target}(d,state~free~bound~internal)`,
    'end molecule types',
    '',
    'begin seed species',
    `  @central:${drug}(r) Dose/V_central`,
    `  @central:${target}(d,state~free) R0`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_drug_free @central:${drug}(r)`,
    `  Molecules C_target_free @central:${target}(d,state~free)`,
    `  Molecules C_complex @central:${drug}(r!1).${target}(d!1,state~bound)`,
    `  Molecules C_drug_total @central:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  @central:${drug}(r) + @central:${target}(d,state~free) -> @central:${drug}(r!1).${target}(d!1,state~bound) kon`,
    `  @central:${drug}(r!1).${target}(d!1,state~bound) -> @central:${drug}(r) + @central:${target}(d,state~free) koff`,
    `  @central:${drug}(r!1).${target}(d!1,state~bound) -> @central:${drug}(r!1).${target}(d!1,state~internal) kint`,
    `  @central:${drug}(r!1).${target}(d!1,state~internal) -> 0 kdeg`,
    `  0 -> @central:${target}(d,state~free) ksyn`,
    `  @central:${target}(d,state~free) -> 0 kdeg_target`,
    `  @central:${drug}(r) -> 0 ke`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V_central: { name: 'V_central', description: 'Volume of distribution', units: 'L', defaultValue: p.V_central, typicalRange: [1, 10] },
      CL: { name: 'CL', description: 'Linear clearance', units: 'L/hr', defaultValue: p.CL, typicalRange: [0.01, 1.0] },
      kon: { name: 'kon', description: 'Binding on-rate', units: '1/nM/hr', defaultValue: p.kon, typicalRange: [0.001, 10] },
      koff: { name: 'koff', description: 'Binding off-rate', units: '1/hr', defaultValue: p.koff, typicalRange: [0.001, 1.0] },
      kint: { name: 'kint', description: 'Internalization rate constant', units: '1/hr', defaultValue: p.kint, typicalRange: [0.01, 0.5] },
      kdeg: { name: 'kdeg', description: 'Complex degradation rate', units: '1/hr', defaultValue: p.kdeg, typicalRange: [0.01, 0.5] },
      ksyn: { name: 'ksyn', description: 'Target synthesis rate', units: 'nM/hr', defaultValue: p.ksyn, typicalRange: [0.01, 1.0] },
      kdeg_target: { name: 'kdeg_target', description: 'Target degradation rate', units: '1/hr', defaultValue: p.kdeg_target, typicalRange: [0.01, 0.5] },
      R0: { name: 'R0', description: 'Baseline target concentration', units: 'nM', defaultValue: p.R0, typicalRange: [0.1, 100] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [1, 1000] },
    },
    observableDescriptions: {
      C_drug_free: { name: 'C_drug_free', description: 'Free drug concentration', units: 'nM', clinicalRelevance: 'Pharmacologically active fraction' },
      C_target_free: { name: 'C_target_free', description: 'Free target concentration', units: 'nM', clinicalRelevance: 'Target suppression assessment' },
      C_complex: { name: 'C_complex', description: 'Drug-target complex concentration', units: 'nM', clinicalRelevance: 'Target engagement measurement' },
      C_drug_total: { name: 'C_drug_total', description: 'Total drug concentration', units: 'nM', clinicalRelevance: 'Bioanalytical assay measurement' },
    },
    suggestedDosing: [
      { name: 'Low dose IV', events: [{ time: 0, amount: 1, compartment: 'central' }] },
      { name: 'High dose IV', events: [{ time: 0, amount: 100, compartment: 'central' }] },
    ],
  };
}

function generatePBPKMinimal(config: PKModelConfig): PKModelResult {
  const p = mergeParams('pbpk_minimal', config.parameters);
  const drug = config.drugName;

  const bnglCode = [
    'begin model',
    'begin parameters',
    `  V_plasma ${p.V_plasma}    # Plasma volume (L)`,
    `  V_liver ${p.V_liver}      # Liver volume (L)`,
    `  V_kidney ${p.V_kidney}    # Kidney volume (L)`,
    `  V_muscle ${p.V_muscle}    # Muscle volume (L)`,
    `  V_adipose ${p.V_adipose}  # Adipose volume (L)`,
    `  Q_liver ${p.Q_liver}      # Hepatic blood flow (L/hr)`,
    `  Q_kidney ${p.Q_kidney}    # Renal blood flow (L/hr)`,
    `  Q_muscle ${p.Q_muscle}    # Muscle blood flow (L/hr)`,
    `  Q_adipose ${p.Q_adipose}  # Adipose blood flow (L/hr)`,
    `  Kp_liver ${p.Kp_liver}    # Liver partition coefficient`,
    `  Kp_kidney ${p.Kp_kidney}  # Kidney partition coefficient`,
    `  Kp_muscle ${p.Kp_muscle}  # Muscle partition coefficient`,
    `  Kp_adipose ${p.Kp_adipose} # Adipose partition coefficient`,
    `  CL_hepatic ${p.CL_hepatic} # Hepatic clearance (L/hr)`,
    `  CL_renal ${p.CL_renal}    # Renal clearance (L/hr)`,
    `  Dose ${p.Dose}             # mg`,
    'end parameters',
    '',
    'begin compartments',
    '  plasma 3 V_plasma',
    '  liver 3 V_liver',
    '  kidney 3 V_kidney',
    '  muscle 3 V_muscle',
    '  adipose 3 V_adipose',
    'end compartments',
    '',
    'begin molecule types',
    `  ${drug}()`,
    'end molecule types',
    '',
    'begin seed species',
    `  @plasma:${drug}() Dose/V_plasma`,
    'end seed species',
    '',
    'begin observables',
    `  Molecules C_plasma @plasma:${drug}()`,
    `  Molecules C_liver @liver:${drug}()`,
    `  Molecules C_kidney @kidney:${drug}()`,
    `  Molecules C_muscle @muscle:${drug}()`,
    `  Molecules C_adipose @adipose:${drug}()`,
    'end observables',
    '',
    'begin reaction rules',
    `  # Liver blood flow: plasma -> liver`,
    `  @plasma:${drug}() -> @liver:${drug}() Q_liver/V_plasma`,
    `  @liver:${drug}() -> @plasma:${drug}() Q_liver/(V_liver*Kp_liver)`,
    `  # Kidney blood flow: plasma -> kidney`,
    `  @plasma:${drug}() -> @kidney:${drug}() Q_kidney/V_plasma`,
    `  @kidney:${drug}() -> @plasma:${drug}() Q_kidney/(V_kidney*Kp_kidney)`,
    `  # Muscle blood flow: plasma -> muscle`,
    `  @plasma:${drug}() -> @muscle:${drug}() Q_muscle/V_plasma`,
    `  @muscle:${drug}() -> @plasma:${drug}() Q_muscle/(V_muscle*Kp_muscle)`,
    `  # Adipose blood flow: plasma -> adipose`,
    `  @plasma:${drug}() -> @adipose:${drug}() Q_adipose/V_plasma`,
    `  @adipose:${drug}() -> @plasma:${drug}() Q_adipose/(V_adipose*Kp_adipose)`,
    `  # Hepatic elimination`,
    `  @liver:${drug}() -> 0 CL_hepatic/V_liver`,
    `  # Renal elimination`,
    `  @kidney:${drug}() -> 0 CL_renal/V_kidney`,
    'end reaction rules',
    'end model',
  ].join('\n');

  return {
    bnglCode,
    parameterDescriptions: {
      V_plasma: { name: 'V_plasma', description: 'Plasma volume', units: 'L', defaultValue: p.V_plasma, typicalRange: [2, 5] },
      V_liver: { name: 'V_liver', description: 'Liver volume', units: 'L', defaultValue: p.V_liver, typicalRange: [1, 2] },
      V_kidney: { name: 'V_kidney', description: 'Kidney volume', units: 'L', defaultValue: p.V_kidney, typicalRange: [0.2, 0.5] },
      V_muscle: { name: 'V_muscle', description: 'Muscle volume', units: 'L', defaultValue: p.V_muscle, typicalRange: [20, 40] },
      V_adipose: { name: 'V_adipose', description: 'Adipose volume', units: 'L', defaultValue: p.V_adipose, typicalRange: [5, 40] },
      CL_hepatic: { name: 'CL_hepatic', description: 'Hepatic intrinsic clearance', units: 'L/hr', defaultValue: p.CL_hepatic, typicalRange: [0.1, 5.0] },
      CL_renal: { name: 'CL_renal', description: 'Renal clearance', units: 'L/hr', defaultValue: p.CL_renal, typicalRange: [0.05, 2.0] },
      Dose: { name: 'Dose', description: 'Administered dose', units: 'mg', defaultValue: p.Dose, typicalRange: [10, 1000] },
    },
    observableDescriptions: {
      C_plasma: { name: 'C_plasma', description: 'Plasma drug concentration', units: 'mg/L', clinicalRelevance: 'Primary PK endpoint' },
      C_liver: { name: 'C_liver', description: 'Liver drug concentration', units: 'mg/L', clinicalRelevance: 'Hepatotoxicity risk assessment' },
      C_kidney: { name: 'C_kidney', description: 'Kidney drug concentration', units: 'mg/L', clinicalRelevance: 'Nephrotoxicity risk assessment' },
      C_muscle: { name: 'C_muscle', description: 'Muscle drug concentration', units: 'mg/L', clinicalRelevance: 'Efficacy at muscle targets' },
      C_adipose: { name: 'C_adipose', description: 'Adipose drug concentration', units: 'mg/L', clinicalRelevance: 'Drug accumulation in fat tissue' },
    },
    suggestedDosing: [
      { name: 'Single IV bolus', events: [{ time: 0, amount: p.Dose, compartment: 'plasma' }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// PD extensions (appended to PK model code when includePD is true)
// ---------------------------------------------------------------------------

function generatePDBlock(config: PKModelConfig): string {
  if (!config.includePD || !config.pdModel) return '';

  switch (config.pdModel) {
    case 'direct_emax': {
      return [
        '',
        '  # PD: Direct Emax model',
        '  Emax 100        # Maximum effect',
        '  EC50 10          # Concentration for 50% effect',
        '  gamma 1          # Hill coefficient',
      ].join('\n');
    }
    case 'indirect_response': {
      return [
        '',
        '  # PD: Indirect response model',
        '  kin 1.0          # Zero-order production rate',
        '  kout 0.1         # First-order degradation rate',
        '  Imax 1.0         # Maximum inhibition',
        '  IC50 10          # Concentration for 50% inhibition',
      ].join('\n');
    }
    case 'signal_transduction': {
      return [
        '',
        '  # PD: Signal transduction model',
        '  ktr 0.5          # Transit rate constant',
        '  n_transit 3      # Number of transit compartments',
        '  Emax 100         # Maximum effect',
        '  EC50 10          # Concentration for 50% effect',
      ].join('\n');
    }
    case 'cell_kill': {
      return [
        '',
        '  # PD: Cell kill model',
        '  kgrowth 0.01     # Tumor growth rate',
        '  kkill_max 0.1    # Maximum kill rate',
        '  KC50 10          # Concentration for 50% kill',
        '  psi 20           # Carrying capacity parameter',
      ].join('\n');
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

export function generatePKModel(config: PKModelConfig): PKModelResult {
  let result: PKModelResult;

  switch (config.type) {
    case 'one_compartment_iv':
      result = generateOneCompartmentIV(config);
      break;
    case 'one_compartment_oral':
      result = generateOneCompartmentOral(config);
      break;
    case 'two_compartment_iv':
      result = generateTwoCompartmentIV(config);
      break;
    case 'two_compartment_oral':
      result = generateTwoCompartmentOral(config);
      break;
    case 'three_compartment':
      result = generateThreeCompartment(config);
      break;
    case 'tmdd':
      result = generateTMDD(config);
      break;
    case 'pbpk_minimal':
      result = generatePBPKMinimal(config);
      break;
    default:
      throw new Error(
        `Unknown PK model type: "${(config as any).type}". ` +
        'Supported types: one_compartment, two_compartment, three_compartment, tmdd, pbpk_minimal.'
      );
  }

  // Inject PD parameter lines if requested
  if (config.includePD && config.pdModel) {
    const pdBlock = generatePDBlock(config);
    if (pdBlock) {
      result.bnglCode = result.bnglCode.replace('end parameters', pdBlock + '\nend parameters');
    }
  }

  return result;
}
