
/**
 * CVODE Configuration Enhancements for Stiff Systems
 * 
 * This module provides optimized CVODE solver configurations for different
 * model characteristics, particularly addressing the Lang_2024 model which
 * exhibits extreme stiffness (rate ratio > 1e6).
 * 
 * Background:
 * -----------
 * The Lang_2024 model shows 98% relative error between Web Simulator and BNG2.
 * Investigation revealed this is due to CVODE implementation differences, not
 * simulation logic bugs. This module provides configuration options to minimize
 * these differences.
 * 
 * Key CVODE Options for Stiff Systems:
 * ------------------------------------
 * 1. BDF Stability Limit Detection (stab_lim_det)
 *    - Enables the BDF stability limit detection algorithm
 *    - Helps oscillatory/stiff systems by reducing step sizes near instability
 * 
 * 2. Maximum BDF Order (max_ord)
 *    - Default is 5 (highest accuracy for smooth solutions)
 *    - Reducing to 2-3 can improve stability for very stiff systems
 * 
 * 3. Nonlinear Solver Settings
 *    - max_nonlin_iters: More iterations help convergence on stiff problems
 *    - nonlin_conv_coef: Stricter convergence can improve accuracy
 * 
 * 4. Step Size Limits
 *    - min_step: Prevents step from becoming too small
 *    - max_step: Limits step growth (important for oscillators)
 * 
 * Usage:
 * ------
 * import { getOptimalCVODEConfig, StiffnessProfile } from './cvodeStiffConfig';
 * 
 * const profile = analyzeModelStiffness(model);
 * const config = getOptimalCVODEConfig(profile);
 * // Pass config to CVODESolver initialization
 */

/**
 * Characterization of model stiffness based on rate constants
 */
export interface StiffnessProfile {
  /** Ratio of fastest to slowest rate constant */
  rateRatio: number;

  /** Estimated stiffness category */
  category: 'mild' | 'moderate' | 'severe' | 'extreme';

  /** Whether the model contains functional (observable-dependent) rates */
  hasFunctionalRates: boolean;

  /** Whether the model has multiple simulation phases with setConcentration */
  isMultiPhase: boolean;

  /** Number of ODEs in the system */
  systemSize: number;

  /** Detected features that affect solver choice */
  features: string[];
}

/**
 * Enhanced CVODE configuration options
 */
export interface CVODEStiffConfig {
  /** Absolute tolerance */
  atol: number;

  /** Relative tolerance */
  rtol: number;

  /** Maximum number of internal steps per output step */
  maxSteps: number;

  /** Enable BDF stability limit detection (1 = on, 0 = off) */
  stabLimDet: number;

  /** Maximum BDF order (1-5, default 5) */
  maxOrd: number;

  /** Maximum nonlinear solver iterations per step (default 3) */
  maxNonlinIters: number;

  /** Nonlinear solver convergence coefficient (default 0.1) */
  nonlinConvCoef: number;

  /** Maximum error test failures per step (default 7) */
  maxErrTestFails: number;

  /** Maximum convergence failures per step (default 10) */
  maxConvFails: number;

  /** Minimum step size (0 = no limit) */
  minStep: number;

  /** Maximum step size (0 = no limit) */
  maxStep: number;

  /** Initial step size (0 = CVODE chooses) */
  initialStep: number;

  /** Use dense or sparse linear solver */
  useSparse: boolean;

  /** Use analytical Jacobian if available */
  useAnalyticalJacobian: boolean;

  /** Use Adams-Moulton method for non-stiff systems (requires WASM build with _init_solver_adams) */
  useAdams: boolean;

  /** Explanation of why these settings were chosen */
  rationale: string;
}

/**
 * Analyze a model to determine its stiffness characteristics.
 * 
 * This examines the rate constants and model structure to estimate
 * how stiff the ODE system will be.
 */
export function analyzeModelStiffness(
  rateConstants: number[],
  options: {
    hasFunctionalRates?: boolean;
    isMultiPhase?: boolean;
    systemSize?: number;
  } = {}
): StiffnessProfile {
  const { hasFunctionalRates = false, isMultiPhase = false, systemSize = rateConstants.length } = options;

  // Filter out zeros and get absolute values
  const nonZeroRates = rateConstants
    .filter(r => r !== 0 && Number.isFinite(r))
    .map(Math.abs);

  if (nonZeroRates.length < 2) {
    return {
      rateRatio: 1,
      category: 'mild',
      hasFunctionalRates,
      isMultiPhase,
      systemSize,
      features: ['single_rate']
    };
  }

  let maxRate = nonZeroRates[0];
  let minRate = nonZeroRates[0];
  for (let i = 1; i < nonZeroRates.length; i++) {
    const rate = nonZeroRates[i];
    if (rate > maxRate) maxRate = rate;
    if (rate < minRate) minRate = rate;
  }
  const rateRatio = maxRate / minRate;

  // Categorize stiffness
  let category: StiffnessProfile['category'];
  const features: string[] = [];

  if (rateRatio < 1e3) {
    category = 'mild';
  } else if (rateRatio < 1e6) {
    category = 'moderate';
    features.push('moderate_stiffness');
  } else if (rateRatio < 1e9) {
    category = 'severe';
    features.push('severe_stiffness');
  } else {
    category = 'extreme';
    features.push('extreme_stiffness');
  }

  // Check for other problematic features
  if (hasFunctionalRates) {
    features.push('functional_rates');
  }

  if (isMultiPhase) {
    features.push('multi_phase');
  }

  if (systemSize > 100) {
    features.push('large_system');
  }

  // Check for rates that might indicate oscillatory behavior
  // (fast positive feedback combined with slower negative feedback)
  const sortedRates = [...nonZeroRates].sort((a, b) => b - a);
  if (sortedRates.length >= 4) {
    const topQuartileRatio = sortedRates[0] / sortedRates[Math.floor(sortedRates.length / 4)];
    if (topQuartileRatio > 100) {
      features.push('potential_oscillator');
    }
  }

  return {
    rateRatio,
    category,
    hasFunctionalRates,
    isMultiPhase,
    systemSize,
    features
  };
}

/**
 * Get optimal CVODE configuration for a given stiffness profile.
 * 
 * These settings are tuned to match BNG2's behavior as closely as possible
 * while accounting for WASM CVODE implementation differences.
 */
export function getOptimalCVODEConfig(profile: StiffnessProfile): CVODEStiffConfig {
  // Start with BNG2-compatible defaults
  const config: CVODEStiffConfig = {
    atol: 1e-8,
    rtol: 1e-8,
    maxSteps: 1000000,
    stabLimDet: 0,
    maxOrd: 5,
    maxNonlinIters: 3,
    nonlinConvCoef: 0.1,
    maxErrTestFails: 7,
    maxConvFails: 10,
    minStep: 0,
    maxStep: 0,
    initialStep: 0,
    useSparse: false,
    useAnalyticalJacobian: false,
    useAdams: false,
    rationale: 'Default BNG2-compatible settings'
  };

  // Adjust based on stiffness category
  switch (profile.category) {
    case 'mild':
      config.useAdams = true; // Adams-Moulton is superior for non-stiff systems
      config.rationale = 'Mild stiffness: Adams-Moulton solver enabled for improved performance';
      break;

    case 'moderate':
      config.maxSteps = 5000;
      config.maxNonlinIters = 5;
      config.rationale = 'Moderate stiffness: increased iteration limits';
      break;

    case 'severe':
      config.maxSteps = 10000;
      config.maxNonlinIters = 7;
      config.nonlinConvCoef = 0.05;
      config.stabLimDet = 1;  // Enable stability limit detection
      config.maxOrd = 4;      // Slightly reduce max BDF order for stability
      config.rationale = 'Severe stiffness: stability detection enabled, stricter convergence';
      break;

    case 'extreme':
      config.atol = 1e-10;
      config.rtol = 1e-10;
      config.maxSteps = 20000;
      config.maxNonlinIters = 10;
      config.nonlinConvCoef = 0.01;
      config.stabLimDet = 1;
      config.maxOrd = 3;       // Lower BDF order for better stability
      config.maxConvFails = 20;
      config.maxErrTestFails = 15;
      config.useAnalyticalJacobian = true;  // Analytical Jacobian crucial for extreme stiffness
      config.rationale = 'Extreme stiffness: maximum stability settings, analytical Jacobian recommended';
      break;
  }

  // Additional adjustments based on features
  if (profile.features.includes('potential_oscillator')) {
    config.stabLimDet = 1;
    // Limit max step to capture oscillation dynamics
    config.rationale += '; oscillator detection: stability limit enabled';
  }

  if (profile.features.includes('functional_rates')) {
    config.useAnalyticalJacobian = false;  // Can't use analytical Jacobian with functional rates
    config.maxNonlinIters = Math.max(config.maxNonlinIters, 5);
    config.rationale += '; functional rates: finite-difference Jacobian required';
  }

  if (profile.features.includes('large_system')) {
    config.useSparse = true;
    config.rationale += '; large system: sparse solver recommended';
  }

  if (profile.features.includes('multi_phase')) {
    config.maxSteps = Math.max(config.maxSteps, 5000);
    config.rationale += '; multi-phase: increased step budget per phase';
  }

  return config;
}

/**
 * Generate a configuration patch for CVODESolver initialization.
 * 
 * This returns code that can be applied to enhance the solver for stiff systems.
 */
export function generateSolverPatch(config: CVODEStiffConfig): string {
  return `
// Apply enhanced CVODE configuration for stiff systems
// Rationale: ${config.rationale}

const stiffConfig = {
  atol: ${config.atol},
  rtol: ${config.rtol},
  maxSteps: ${config.maxSteps},
};

// After solver initialization, apply additional settings:
if (CVODESolver.module && solverMem) {
  const mod = CVODESolver.module;
  
  ${config.stabLimDet ? `// Enable BDF stability limit detection
  if (mod._set_stab_lim_det) {
    mod._set_stab_lim_det(solverMem, ${config.stabLimDet});
  }` : '// Stability limit detection: disabled'}
  
  ${config.maxOrd !== 5 ? `// Reduce maximum BDF order for stability
  if (mod._set_max_ord) {
    mod._set_max_ord(solverMem, ${config.maxOrd});
  }` : '// BDF order: default (5)'}
  
  ${config.maxNonlinIters !== 3 ? `// Increase nonlinear solver iterations
  if (mod._set_max_nonlin_iters) {
    mod._set_max_nonlin_iters(solverMem, ${config.maxNonlinIters});
  }` : '// Nonlinear iterations: default (3)'}
  
  ${config.nonlinConvCoef !== 0.1 ? `// Stricter nonlinear convergence
  if (mod._set_nonlin_conv_coef) {
    mod._set_nonlin_conv_coef(solverMem, ${config.nonlinConvCoef});
  }` : '// Nonlinear convergence: default (0.1)'}
  
  ${config.maxStep > 0 ? `// Limit maximum step size
  // This helps capture dynamics in oscillatory/stiff systems
  // mod._set_max_step(solverMem, ${config.maxStep});` : '// Max step: unlimited'}
}
`;
}

/**
 * Preset configurations for known problematic models
 */
export const MODEL_PRESETS: Record<string, Partial<CVODEStiffConfig>> = {
  'Lang_2024': {
    atol: 1e-10,
    rtol: 1e-10,
    maxSteps: 1000000,
    stabLimDet: 1,
    maxOrd: 3,
    maxNonlinIters: 10,
    nonlinConvCoef: 0.01,
    maxErrTestFails: 15,
    maxConvFails: 20,
    useAnalyticalJacobian: true,
    rationale: 'Lang_2024: Extreme stiffness (rate ratio >1e6), multi-phase with setConcentration'
  },

  'cBNGL_simple': {
    stabLimDet: 1,
    maxOrd: 5,
    maxNonlinIters: 5,
    // Note: This model's divergence is due to Hill function bifurcation sensitivity,
    // not solver configuration. These settings may help but won't fully resolve it.
    rationale: 'cBNGL_simple: Hill function (n=50) bifurcation sensitivity'
  },

  'eco_coevolution_host_parasite': {
    stabLimDet: 1,
    maxOrd: 4,
    maxNonlinIters: 7,
    nonlinConvCoef: 0.05,
    maxErrTestFails: 15,
    maxConvFails: 20,
    maxSteps: 50000,
    useAnalyticalJacobian: true,
    rationale: 'eco_coevolution_host_parasite: oscillatory deterministic regime requiring tighter CVODE convergence'
  },

  'Lin_Prion_2019': {
    stabLimDet: 1,
    maxOrd: 4,
    maxNonlinIters: 7,
    nonlinConvCoef: 0.05,
    maxErrTestFails: 15,
    maxConvFails: 20,
    maxSteps: 50000,
    useSparse: true,
    rationale: 'Lin_Prion_2019: large stiff network benefits from sparse linear solver and stricter nonlinear controls'
  },

  'repressilator': {
    // Note: The repressilator's divergence is due to parameter precision in
    // expressions like c0/Na/V*tF/pF, not solver configuration.
    // Use high-precision evaluation instead.
    rationale: 'repressilator: Parameter precision issue (use high-precision evaluator)'
  }
};

/**
 * Detect if current model matches a known preset
 */
export function detectModelPreset(modelName: string): Partial<CVODEStiffConfig> | null {
  const normalizedName = modelName.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [preset, config] of Object.entries(MODEL_PRESETS)) {
    if (normalizedName.includes(preset.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      return config;
    }
  }

  return null;
}

export default {
  analyzeModelStiffness,
  getOptimalCVODEConfig,
  generateSolverPatch,
  detectModelPreset,
  MODEL_PRESETS
};
