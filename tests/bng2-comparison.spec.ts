/**
 * GDAT Comparison Tests: Web Simulator vs BNG2.pl
 * 
 * This test suite:
 * 1. Runs the BNG2.pl simulator to generate reference GDAT output
 * 2. Runs the web simulator with the same model
 * 3. Compares the results
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, rmSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBNGL } from '../services/parseBNGL';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator, GeneratorProgress } from '../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import type { BNGLModel } from '../types';

// Import BNG2 path defaults
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../scripts/bngDefaults.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');

const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;
const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;

const bngAvailable = existsSync(BNG2_PATH);

// Tolerance settings
const ABS_TOL = 1e-4;  // Absolute tolerance
const REL_TOL = 0.05;  // 5% relative tolerance

const TIMEOUT_MS = 120_000; // 120 seconds per model
const NETWORK_TIMEOUT_MS = 60_000;  // 1 minute baseline for network generation
const PROGRESS_LOG_INTERVAL = 100;  // Log every 100 new species

// Models to skip due to known issues
const SKIP_MODELS = new Set([
  // Network-free models (use simulate_nf, not ODE/SSA)
  'Model_ZAP',               // simulate_nf - not designed for ODE
  'Blinov_egfr',             // simulate_nf - not designed for ODE
  'Blinov_ran',              // simulate_nf - not designed for ODE
  'Ligon_2014',              // simulate_nf - not designed for ODE
  'polymer',                 // simulate_nf - not designed for ODE
  'polymer_draft',           // simulate_nf - not designed for ODE
  
  // Performance issues (very long single-phase simulation)
  'Barua_2013',              // t_end=250000, n_steps=2500 - no early termination
  
  // Network explosion (no maxStoich constraint)
  'Barua_2007',              // Network explodes without maxStoich constraint
  
  // Network generation takes too long
  'Blinov_2006',             // Network generation takes too long (356 species, 4025 reactions)
  
  // Vitest Promise resolution bug - works standalone but hangs in bng2-comparison.spec.ts
  // See tests/an2009-exact-structure.spec.ts which passes with exact same code
  // 'An_2009',                 // Promise doesn't resolve despite generate() completing
  
  // Complex multi-phase models 
  'Lang_2024',               // Multi-phase simulation
  'Korwek_2023',             // Multi-phase + very long sim time
  'innate_immunity',         // Multi-phase
]);

// Progress logger class to track network generation progress
class ProgressTracker {
  modelName: string;
  startTime: number;
  lastLogTime: number;
  lastSpeciesCount: number;
  logInterval: number;
  stuckThreshold: number;
  
  constructor(modelName: string, logInterval = PROGRESS_LOG_INTERVAL) {
    this.modelName = modelName;
    this.startTime = Date.now();
    this.lastLogTime = this.startTime;
    this.lastSpeciesCount = 0;
    this.logInterval = logInterval;
    this.stuckThreshold = 30000;  // 30 seconds without progress = stuck
  }
  
  log(progress: GeneratorProgress) {
    const now = Date.now();
    const timeSinceLast = now - this.lastLogTime;
    const speciesAddedSinceLast = progress.species - this.lastSpeciesCount;
    
    // Log if enough new species or time has passed (every 5 seconds at least)
    if (speciesAddedSinceLast >= this.logInterval || timeSinceLast > 5000) {
      const rate = timeSinceLast > 0 ? (speciesAddedSinceLast / timeSinceLast * 1000).toFixed(1) : '?';
      console.log(
        `  [${this.modelName}] Iter ${progress.iteration}: ` +
        `${progress.species} species, ${progress.reactions} reactions ` +
        `(${rate} sp/s, ${(progress.timeElapsed/1000).toFixed(1)}s elapsed)`
      );
      this.lastLogTime = now;
      this.lastSpeciesCount = progress.species;
    }
  }
  
  isStuck(progress: GeneratorProgress): boolean {
    const now = Date.now();
    const timeSinceLast = now - this.lastLogTime;
    const speciesAddedSinceLast = progress.species - this.lastSpeciesCount;
    return speciesAddedSinceLast === 0 && timeSinceLast > this.stuckThreshold;
  }
  
  timeout(): boolean {
    return Date.now() - this.startTime > NETWORK_TIMEOUT_MS;
  }
}

// ============================================================================
// GDAT Parsing
// ============================================================================

interface GdatData {
  headers: string[];
  data: Record<string, number>[];
}

function parseGdat(content: string): GdatData {
  const lines = content.trim().split(/\r?\n/);
  const headerLine = lines.find(l => l.startsWith('#'));
  if (!headerLine) throw new Error('No header line found');
  
  const headers = headerLine.slice(1).trim().split(/\s+/);
  const data: Record<string, number>[] = [];
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const values = line.trim().split(/\s+/).map(v => parseFloat(v));
    if (values.length === headers.length) {
      const row: Record<string, number> = {};
      headers.forEach((h, i) => row[h] = values[i]);
      data.push(row);
    }
  }
  
  return { headers, data };
}

// ============================================================================
// BNG2.pl Runner
// ============================================================================

function runBNG2(bnglPath: string): GdatData | null {
  const tempDir = mkdtempSync(join(tmpdir(), 'bng-compare-'));
  const modelName = basename(bnglPath);
  const modelCopy = join(tempDir, modelName);
  copyFileSync(bnglPath, modelCopy);

  try {
    const result = spawnSync(PERL_CMD, [BNG2_PATH, modelName], {
      cwd: tempDir,
      encoding: 'utf-8',
      timeout: 120000,  // 2 minutes timeout (some models take a while in BNG2)
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.status !== 0) {
      // Check if it's just stderr output (BNG2 prints progress to stderr)
      // Only fail if there's no gdat file produced
      const gdatFiles = readdirSync(tempDir).filter(f => f.endsWith('.gdat'));
      if (gdatFiles.length === 0) {
        console.warn(`BNG2 failed: ${result.stderr || result.stdout}`);
        return null;
      }
    }

    const gdatFiles = readdirSync(tempDir).filter(f => f.endsWith('.gdat'));
    if (gdatFiles.length === 0) return null;

    const gdatContent = readFileSync(join(tempDir, gdatFiles[0]), 'utf-8');
    return parseGdat(gdatContent);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Web Simulator (extracted from bnglWorker.ts)
// ============================================================================

const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

// Pattern matching helpers (from bnglWorker.ts)
const getCompartment = (s: string) => {
  const prefix = s.match(/^@([A-Za-z0-9_]+):/);
  if (prefix) return prefix[1];
  const suffix = s.match(/@([A-Za-z0-9_]+)$/);
  if (suffix) return suffix[1];
  return null;
};

const removeCompartment = (s: string) => {
  return s.replace(/^@[A-Za-z0-9_]+:/, '').replace(/@[A-Za-z0-9_]+$/, '');
};

function matchMolecule(patMol: string, specMol: string): boolean {
  const patMatch = patMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);
  const specMatch = specMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);

  if (!patMatch || !specMatch) return false;

  const patName = patMatch[1];
  const specName = specMatch[1];

  if (patName !== specName) return false;
  if (patMatch[2] === undefined) return true;

  const patCompsStr = patMatch[2];
  const specCompsStr = specMatch[2] || "";

  const patComps = patCompsStr.split(',').map(s => s.trim()).filter(Boolean);
  const specComps = specCompsStr.split(',').map(s => s.trim()).filter(Boolean);

  return patComps.every(pCompStr => {
    // Enhanced pattern for bond syntax: !+, !?, !N, or no bond
    const pM = pCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_]+))?(?:!([0-9]+|\+|\?))?$/);
    if (!pM) return false;
    const [_, pName, pState, pBond] = pM;

    const sCompStr = specComps.find(s => {
      const sName = s.split(/[~!]/)[0];
      return sName === pName;
    });

    if (!sCompStr) return false;

    // Enhanced pattern for species bond syntax
    const sM = sCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_]+))?(?:!([0-9]+))?$/);
    if (!sM) return false;
    const [__, sName, sState, sBond] = sM;

    // State matching
    if (pState && pState !== sState) return false;

    // Bond matching logic:
    // !? means "bond or no bond" - matches anything
    // !+ means "must have some bond"
    // !N means "must have bond N" (but we don't track exact bonds in observables)
    // no bond specification means "must not have a bond"
    if (pBond) {
      if (pBond === '?') {
        // matches anything - bond or no bond
      } else if (pBond === '+') {
        // must have some bond
        if (!sBond) return false;
      } else {
        // specific bond number - just require some bond exists
        if (!sBond) return false;
      }
    } else {
      // pattern has no bond specification - species must not be bonded
      if (sBond) return false;
    }

    return true;
  });
}

function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
  const patComp = getCompartment(pattern);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return false;

  const cleanPat = removeCompartment(pattern);
  const cleanSpec = removeCompartment(speciesStr);

  if (cleanPat.includes('.')) {
    const patternMolecules = cleanPat.split('.').map(s => s.trim());
    const speciesMolecules = cleanSpec.split('.').map(s => s.trim());
    
    // For complex patterns, we need to find a matching assignment of pattern molecules to species molecules
    // Each pattern molecule must match a different species molecule
    if (patternMolecules.length > speciesMolecules.length) return false;
    
    // Use recursive matching to find valid assignment
    const usedIndices = new Set<number>();
    
    const findMatch = (patIdx: number): boolean => {
      if (patIdx >= patternMolecules.length) return true;
      
      const patMol = patternMolecules[patIdx];
      for (let i = 0; i < speciesMolecules.length; i++) {
        if (usedIndices.has(i)) continue;
        if (matchMolecule(patMol, speciesMolecules[i])) {
          usedIndices.add(i);
          if (findMatch(patIdx + 1)) return true;
          usedIndices.delete(i);
        }
      }
      return false;
    };
    
    return findMatch(0);
  } else {
    const specMols = cleanSpec.split('.');
    return specMols.some(sMol => matchMolecule(cleanPat, sMol));
  }
}

function countPatternMatches(speciesStr: string, patternStr: string): number {
  const patComp = getCompartment(patternStr);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return 0;

  const cleanPat = removeCompartment(patternStr);
  const cleanSpec = removeCompartment(speciesStr);

  if (cleanPat.includes('.')) {
    return isSpeciesMatch(speciesStr, patternStr) ? 1 : 0;
  } else {
    const specMols = cleanSpec.split('.');
    let count = 0;
    for (const sMol of specMols) {
      if (matchMolecule(cleanPat, sMol)) {
        count++;
      }
    }
    return count;
  }
}

// Helper to check if a rate expression contains observable names
function rateContainsObservables(rateExpr: string, observableNames: Set<string>): boolean {
  for (const obsName of observableNames) {
    const regex = new RegExp(`\\b${obsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (regex.test(rateExpr)) return true;
  }
  return false;
}

// Create a rate evaluator function for observable-dependent rates
function createRateEvaluator(
  rateExpr: string, 
  parameters: Map<string, number>,
  observableNames: Set<string>
): (obsValues: Record<string, number>) => number {
  // Substitute parameters first
  let expr = rateExpr;
  const sortedParams = Array.from(parameters.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [name, value] of sortedParams) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), value.toString());
  }
  
  // Now create a function that substitutes observable values at runtime
  return (obsValues: Record<string, number>) => {
    let evalExpr = expr;
    const sortedObs = Array.from(observableNames).sort((a, b) => b.length - a.length);
    for (const obsName of sortedObs) {
      const escaped = obsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const value = obsValues[obsName] ?? 0;
      evalExpr = evalExpr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), value.toString());
    }
    try {
      const result = new Function(`return ${evalExpr}`)();
      return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
    } catch {
      return 0;
    }
  };
}

async function runWebSimulator(
  model: BNGLModel, 
  params: SimulationParams,
  modelName: string = 'unknown'
): Promise<GdatData> {
  const startTime = Date.now();
  
  // Create progress tracker for this model
  const progressTracker = new ProgressTracker(modelName);
  
  // Generate network
  const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
  
  const seedConcentrationMap = new Map<string, number>();
  model.species.forEach(s => {
    const g = BNGLParser.parseSpeciesGraph(s.name);
    const canonicalName = GraphCanonicalizer.canonicalize(g);
    seedConcentrationMap.set(canonicalName, s.initialConcentration);
  });

  // Create a set of observable names to pass to evaluateExpression
  const observableNames = new Set(model.observables.map(o => o.name));
  const parametersMap = new Map(Object.entries(model.parameters));

  // Track original rate expressions for observable-dependent rates
  const ruleRateExpressions: { forwardRate: string, reverseRate?: string }[] = [];

  const rules = model.reactionRules.flatMap((r, ruleIdx) => {
    const hasObsInForward = rateContainsObservables(r.rate, observableNames);
    const hasObsInReverse = r.reverseRate ? rateContainsObservables(r.reverseRate, observableNames) : false;
    
    // Store rate expressions
    ruleRateExpressions.push({
      forwardRate: r.rate,
      reverseRate: r.reverseRate
    });
    
    // For network generation, use placeholder rate (1) if observable-dependent
    const rate = hasObsInForward ? 1 : BNGLParser.evaluateExpression(r.rate, parametersMap, observableNames);
    const reverseRate = r.reverseRate 
      ? (hasObsInReverse ? 1 : BNGLParser.evaluateExpression(r.reverseRate, parametersMap, observableNames))
      : rate;
    
    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
    const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
    forwardRule.name = r.reactants.join('+') + '->' + r.products.join('+');

    if (r.constraints && r.constraints.length > 0) {
      forwardRule.applyConstraints(r.constraints, (s: string) => BNGLParser.parseSpeciesGraph(s));
    }

    if (r.isBidirectional) {
      const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
      const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
      reverseRule.name = r.products.join('+') + '->' + r.reactants.join('+');
      return [forwardRule, reverseRule];
    } else {
      return [forwardRule];
    }
  });

  // Build a map from rule name to rate expression
  const ruleRateMap = new Map<string, string>();
  model.reactionRules.forEach(r => {
    const forwardName = r.reactants.join('+') + '->' + r.products.join('+');
    ruleRateMap.set(forwardName, r.rate);
    if (r.isBidirectional && r.reverseRate) {
      const reverseName = r.products.join('+') + '->' + r.reactants.join('+');
      ruleRateMap.set(reverseName, r.reverseRate);
    }
  });

  // Use network options from BNGL file if available, with reasonable defaults
  const networkOpts = model.networkOptions || {};
  
  // Convert Record<string, number> to Map for maxStoich if provided
  const maxStoich = networkOpts.maxStoich 
    ? new Map(Object.entries(networkOpts.maxStoich))
    : 500;  // Default limit per molecule type
  
  // Create abort controller for timeout (apply to all models, including An_2009)
  const abortController = new AbortController();
  const networkTimeoutMs = modelName === 'An_2009' ? NETWORK_TIMEOUT_MS * 2 : NETWORK_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
    console.error(`\n  ❌ [${modelName}] NETWORK GENERATION TIMEOUT after ${networkTimeoutMs/1000}s`);
  }, networkTimeoutMs);
  
  const generator = new NetworkGenerator({ 
    maxSpecies: 5000,  // Higher default to allow complete network generation
    maxIterations: 5000,
    maxAgg: networkOpts.maxAgg ?? 500,
    maxStoich 
  });
  
  const networkStart = Date.now();
  console.log(`\n  ▶ [${modelName}] Starting network generation...`);
  
  const result = await generator.generate(
    seedSpecies, 
    rules,
    (progress) => {
      progressTracker.log(progress);
      if (progressTracker.isStuck(progress)) {
        console.warn(`\n  ⚠️ [${modelName}] Network generation appears STUCK at ${progress.species} species`);
      }
    },
    abortController.signal
  );
  
  clearTimeout(timeoutId);
  const networkTime = Date.now() - networkStart;
  console.log(`  ✓ [${modelName}] Network: ${result.species.length} species, ${result.reactions.length} reactions in ${(networkTime/1000).toFixed(2)}s`);

  const expandedModel: BNGLModel = {
    ...model,
    species: result.species.map(s => {
      const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
      const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);
      return { name: canonicalName, initialConcentration: concentration };
    }),
    reactions: result.reactions.map(r => ({
      reactants: r.reactants.map(idx => GraphCanonicalizer.canonicalize(result.species[idx].graph)),
      products: r.products.map(idx => GraphCanonicalizer.canonicalize(result.species[idx].graph)),
      rate: r.rate.toString(),
      rateConstant: r.rate,
      ruleName: r.name  // Preserve rule name to look up rate expression
    })),
  };

  // Build simulation structures
  const speciesMap = new Map<string, number>();
  expandedModel.species.forEach((s, i) => speciesMap.set(s.name, i));
  const numSpecies = expandedModel.species.length;

  // Build concrete reactions with rate evaluators for observable-dependent rates
  type ConcreteReaction = {
    reactants: Int32Array;
    products: Int32Array;
    rateConstant: number;
    rateEvaluator: ((obsValues: Record<string, number>) => number) | null;
  };

  const concreteReactions: ConcreteReaction[] = (expandedModel.reactions as any[]).map(r => {
    const reactantIndices = r.reactants.map((name: string) => speciesMap.get(name));
    const productIndices = r.products.map((name: string) => speciesMap.get(name));
    
    if (reactantIndices.some((i: number | undefined) => i === undefined) || 
        productIndices.some((i: number | undefined) => i === undefined)) {
      return null;
    }

    // Check if this reaction came from a rule with observable-dependent rate
    let rateEvaluator: ((obsValues: Record<string, number>) => number) | null = null;
    if (r.ruleName) {
      const rateExpr = ruleRateMap.get(r.ruleName);
      if (rateExpr && rateContainsObservables(rateExpr, observableNames)) {
        rateEvaluator = createRateEvaluator(rateExpr, parametersMap, observableNames);
      }
    }

    return {
      reactants: new Int32Array(reactantIndices as number[]),
      products: new Int32Array(productIndices as number[]),
      rateConstant: r.rateConstant!,
      rateEvaluator
    };
  }).filter((r): r is ConcreteReaction => r !== null);

  const concreteObservables = expandedModel.observables.map(obs => {
    const patterns = obs.pattern.split(/\s+/).filter(p => p.length > 0);
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];
    
    expandedModel.species.forEach((s, i) => {
      let count = 0;
      for (const pat of patterns) {
        if (obs.type === 'species') {
          if (isSpeciesMatch(s.name, pat)) {
            count = 1;
            break;
          }
        } else {
          count += countPatternMatches(s.name, pat);
        }
      }
      
      if (count > 0) {
        matchingIndices.push(i);
        coefficients.push(count);
      }
    });
    
    return {
      name: obs.name,
      indices: new Int32Array(matchingIndices),
      coefficients: new Float64Array(coefficients)
    };
  });

  // Initialize state
  const state = new Float64Array(numSpecies);
  expandedModel.species.forEach((s, i) => state[i] = s.initialConcentration);

  const evaluateObservables = (currentState: Float64Array) => {
    const obsValues: Record<string, number> = {};
    for (const obs of concreteObservables) {
      let sum = 0;
      for (let j = 0; j < obs.indices.length; j++) {
        sum += currentState[obs.indices[j]] * obs.coefficients[j];
      }
      obsValues[obs.name] = sum;
    }
    return obsValues;
  };

  // ==========================================================================
  // ODE Solver: Auto-switching between RK4 (explicit) and Rosenbrock23 (implicit)
  // ==========================================================================
  
  const derivatives = (yIn: Float64Array, dydt: Float64Array, obsValues: Record<string, number>) => {
    dydt.fill(0);
    for (const rxn of concreteReactions) {
      const effectiveRate = rxn.rateEvaluator ? rxn.rateEvaluator(obsValues) : rxn.rateConstant;
      let velocity = effectiveRate;
      for (let j = 0; j < rxn.reactants.length; j++) {
        velocity *= yIn[rxn.reactants[j]];
      }
      for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
      for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
    }
  };

  // Compute full Jacobian matrix df/dy using finite differences
  const computeJacobian = (y: Float64Array, obsValues: Record<string, number>): Float64Array[] => {
    const n = y.length;
    const eps = 1e-8;
    const f0 = new Float64Array(n);
    const f1 = new Float64Array(n);
    const yPert = new Float64Array(y);
    
    derivatives(y, f0, obsValues);
    
    // J[i][j] = df_i/dy_j stored as J[j][i] for column-major access
    const J: Float64Array[] = [];
    for (let j = 0; j < n; j++) {
      J.push(new Float64Array(n));
    }
    
    for (let j = 0; j < n; j++) {
      const yj = y[j];
      const delta = Math.max(eps * Math.abs(yj), eps);
      yPert[j] = yj + delta;
      const pertObs = evaluateObservables(yPert);
      derivatives(yPert, f1, pertObs);
      
      for (let i = 0; i < n; i++) {
        J[j][i] = (f1[i] - f0[i]) / delta;
      }
      yPert[j] = yj;  // Restore
    }
    
    return J;
  };

  // LU decomposition with partial pivoting (in-place)
  // Returns pivot indices, modifies A in place to contain L and U
  const luDecompose = (A: Float64Array[], n: number): Int32Array => {
    const pivot = new Int32Array(n);
    
    for (let k = 0; k < n; k++) {
      // Find pivot
      let maxVal = Math.abs(A[k][k]);
      let maxIdx = k;
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(A[k][i]);
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }
      pivot[k] = maxIdx;
      
      // Swap rows if needed
      if (maxIdx !== k) {
        for (let j = 0; j < n; j++) {
          const tmp = A[j][k];
          A[j][k] = A[j][maxIdx];
          A[j][maxIdx] = tmp;
        }
      }
      
      // Check for singular matrix
      if (Math.abs(A[k][k]) < 1e-30) {
        A[k][k] = 1e-30;  // Regularize
      }
      
      // Elimination
      for (let i = k + 1; i < n; i++) {
        A[k][i] /= A[k][k];
        for (let j = k + 1; j < n; j++) {
          A[j][i] -= A[k][i] * A[j][k];
        }
      }
    }
    
    return pivot;
  };

  // Solve Ax = b given LU decomposition of A
  const luSolve = (LU: Float64Array[], pivot: Int32Array, b: Float64Array, n: number): Float64Array => {
    const x = new Float64Array(b);
    
    // Apply pivots and forward substitution (L)
    for (let k = 0; k < n; k++) {
      const pk = pivot[k];
      if (pk !== k) {
        const tmp = x[k];
        x[k] = x[pk];
        x[pk] = tmp;
      }
      for (let i = k + 1; i < n; i++) {
        x[i] -= LU[k][i] * x[k];
      }
    }
    
    // Back substitution (U)
    for (let k = n - 1; k >= 0; k--) {
      for (let j = k + 1; j < n; j++) {
        x[k] -= LU[j][k] * x[j];
      }
      x[k] /= LU[k][k];
    }
    
    return x;
  };

  // Rosenbrock23 method (2nd order, L-stable, embedded error estimate)
  // Solves: (I - gamma*h*J) * k_i = f(y + ...) + gamma*h*J*sum(...)
  // Coefficients from Shampine & Reichelt (1997)
  const rosenbrockStep = (
    yCurr: Float64Array, 
    h: number,
    J: Float64Array[],
    LU: Float64Array[],
    pivot: Int32Array
  ): { yNext: Float64Array; yErr: Float64Array } => {
    const n = yCurr.length;
    const gamma = 0.5 + Math.sqrt(3) / 6;  // ~0.7886751346
    const d21 = 1 / (2 * gamma);
    const d31 = -1.0 / gamma;
    const d32 = 1 / (2 * gamma);
    
    // Stage 1: solve (I - gamma*h*J) * k1 = f(y)
    const f0 = new Float64Array(n);
    const obs0 = evaluateObservables(yCurr);
    derivatives(yCurr, f0, obs0);
    
    const k1 = luSolve(LU, pivot, f0, n);
    
    // Stage 2: solve (I - gamma*h*J) * k2 = f(y + h*k1) - 2*k1
    const y1 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      y1[i] = yCurr[i] + h * k1[i];
    }
    const f1 = new Float64Array(n);
    const obs1 = evaluateObservables(y1);
    derivatives(y1, f1, obs1);
    
    const rhs2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      rhs2[i] = f1[i] - d21 * k1[i];
    }
    const k2 = luSolve(LU, pivot, rhs2, n);
    
    // 2nd order solution: y_new = y + (3/2)*h*k1 + (1/2)*h*k2
    const yNext = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      yNext[i] = yCurr[i] + h * (1.5 * k1[i] + 0.5 * k2[i]);
    }
    
    // Error estimate (difference between 2nd and 1st order)
    const yErr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      yErr[i] = h * 0.5 * Math.abs(k2[i] - k1[i]);
    }
    
    return { yNext, yErr };
  };

  // Classic RK4 step with error estimate (compare to half-steps)
  const rk4StepWithError = (yCurr: Float64Array, h: number): { yNext: Float64Array; yErr: Float64Array } => {
    const n = yCurr.length;
    const k1 = new Float64Array(n);
    const k2 = new Float64Array(n);
    const k3 = new Float64Array(n);
    const k4 = new Float64Array(n);
    const temp = new Float64Array(n);

    const obs1 = evaluateObservables(yCurr);
    derivatives(yCurr, k1, obs1);
    
    for (let i = 0; i < n; i++) temp[i] = yCurr[i] + 0.5 * h * k1[i];
    const obs2 = evaluateObservables(temp);
    derivatives(temp, k2, obs2);
    
    for (let i = 0; i < n; i++) temp[i] = yCurr[i] + 0.5 * h * k2[i];
    const obs3 = evaluateObservables(temp);
    derivatives(temp, k3, obs3);
    
    for (let i = 0; i < n; i++) temp[i] = yCurr[i] + h * k3[i];
    const obs4 = evaluateObservables(temp);
    derivatives(temp, k4, obs4);

    const yNext = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      yNext[i] = yCurr[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    
    // Estimate error using embedded 3rd order formula
    const yErr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // Difference between RK4 and RK3 (midpoint)
      const y3 = yCurr[i] + h * k2[i];  // 2nd order midpoint
      yErr[i] = Math.abs(yNext[i] - y3);
    }
    
    return { yNext, yErr };
  };

  // Compute error norm (mixed absolute/relative tolerance)
  const errorNorm = (yErr: Float64Array, yCurr: Float64Array, yNext: Float64Array, atol: number, rtol: number): number => {
    let maxErr = 0;
    for (let i = 0; i < yErr.length; i++) {
      const scale = atol + rtol * Math.max(Math.abs(yCurr[i]), Math.abs(yNext[i]));
      const err = yErr[i] / scale;
      if (err > maxErr) maxErr = err;
    }
    return maxErr;
  };

  // Prepare LU factorization of (I - gamma*h*J) for Rosenbrock
  const prepareLU = (J: Float64Array[], h: number, gamma: number, n: number): { LU: Float64Array[]; pivot: Int32Array } => {
    const LU: Float64Array[] = [];
    for (let j = 0; j < n; j++) {
      LU.push(new Float64Array(n));
      for (let i = 0; i < n; i++) {
        LU[j][i] = (i === j ? 1 : 0) - gamma * h * J[j][i];
      }
    }
    const pivot = luDecompose(LU, n);
    return { LU, pivot };
  };

  // Helper function to find species index by pattern matching
  const findSpeciesIndex = (pattern: string): number => {
    // Try exact match first
    const exactIdx = speciesMap.get(pattern);
    if (exactIdx !== undefined) {
      console.log(`    [findSpeciesIndex] Pattern "${pattern}" exact match at index ${exactIdx}`);
      return exactIdx;
    }
    
    // Try pattern matching (for BNGL patterns like "egf(r)")
    for (const [speciesName, idx] of speciesMap.entries()) {
      if (isSpeciesMatch(speciesName, pattern)) {
        console.log(`    [findSpeciesIndex] Pattern "${pattern}" matched species "${speciesName}" at index ${idx}`);
        return idx;
      }
    }
    console.log(`    [findSpeciesIndex] Pattern "${pattern}" NOT FOUND`);
    console.log(`    [findSpeciesIndex] Available species (first 10): ${Array.from(speciesMap.keys()).slice(0, 10).join(', ')}`);
    return -1;
  };

  // Helper to apply setConcentration commands
  const applySetConcentrations = (
    y: Float64Array, 
    setConcs: { species: string; value: string }[]
  ): Float64Array => {
    const result = new Float64Array(y);
    for (const { species, value } of setConcs) {
      const idx = findSpeciesIndex(species);
      if (idx >= 0) {
        // Evaluate value (could be parameter name or number)
        let newConc: number;
        if (parametersMap.has(value)) {
          newConc = parametersMap.get(value) as number;
        } else {
          try {
            // Try to evaluate as expression
            newConc = new Function(`return ${value}`)();
          } catch {
            newConc = parseFloat(value) || 0;
          }
        }
        console.log(`  [setConcentration] ${species} (idx ${idx}): ${result[idx]} -> ${newConc}`);
        result[idx] = newConc;
      } else {
        console.warn(`  [setConcentration] Species not found: ${species}`);
      }
    }
    return result;
  };

  // Run single phase of simulation with auto-switching solver
  const runPhase = (
    y: Float64Array,
    phase: SimulationPhase,
    phaseIdx: number
  ): { y: Float64Array; phaseData: Record<string, number>[] } => {
    const phaseData: Record<string, number>[] = [];
    const { t_start, t_end, n_steps, steady_state } = phase;
    
    const dtOut = (t_end - t_start) / n_steps;
    const dydt = new Float64Array(numSpecies);
    
    // Solver tolerances
    // Relax tolerances for stiff models like An_2009
    const isStiff = modelName === 'An_2009';
    const atol = isStiff ? 1e-6 : 1e-8;
    const rtol = isStiff ? 1e-4 : 1e-6;
    
    // Steady-state detection parameters
    const ssAbsTol = 1e-9;
    const ssRelTol = 1e-6;
    let steadyStateReached = false;
    
    // Auto-switching state
    let useImplicit = isStiff; // Default to implicit for stiff models
    let consecutiveRejects = 0;
    let lastJacobianT = -Infinity;
    let cachedJ: Float64Array[] | null = null;
    let cachedLU: Float64Array[] | null = null;
    let cachedPivot: Int32Array | null = null;
    let cachedH = 0;
    const jacobianRefreshInterval = dtOut / 5;  // Refresh Jacobian periodically
    
    let t = t_start;
    let h = Math.min(dtOut / 10, (t_end - t_start) / 100);  // Initial step size
    const minStep = 1e-15;
    const maxStep = dtOut;
    
    // Don't record initial point if this is a continuation phase (it's already recorded)
    if (phaseIdx === 0 || !phase.continue_from_previous) {
      phaseData.push({ time: t, ...evaluateObservables(y) });
    }
    
    for (let i = 1; i <= n_steps; i++) {
      const tTarget = t_start + i * dtOut;
      let stepsInInterval = 0;
      
      // If steady state already reached, just copy final values
      if (steady_state && steadyStateReached) {
        phaseData.push({ time: Math.round(tTarget * 1e10) / 1e10, ...evaluateObservables(y) });
        continue;
      }
      
      while (t < tTarget - 1e-12) {
        stepsInInterval++;
        if (stepsInInterval > 1000000) {
             throw new Error(`Integration stuck at t=${t}, step size ${h}. Too many steps in interval.`);
        }

        const currentObs = evaluateObservables(y);
        derivatives(y, dydt, currentObs);
        
        // Check for steady state
        if (steady_state && !steadyStateReached) {
          let atSteadyState = true;
          for (let k = 0; k < numSpecies; k++) {
            const deriv = Math.abs(dydt[k]);
            const conc = Math.abs(y[k]);
            if (deriv > ssAbsTol && deriv > ssRelTol * conc) {
              atSteadyState = false;
              break;
            }
          }
          if (atSteadyState) {
            steadyStateReached = true;
            console.log(`  ✓ [${modelName}] Phase ${phaseIdx + 1}: Steady state reached at t=${t.toFixed(2)}`);
            break;
          }
        }
        
        // Limit step to not overshoot target
        if (t + h > tTarget) h = tTarget - t;
        if (h < minStep) h = minStep;
        if (h > maxStep) h = maxStep;
        
        let yNext: Float64Array;
        let yErr: Float64Array;
        let stepAccepted = false;
        
        if (useImplicit) {
          // Use Rosenbrock method for stiff systems
          const gamma = 0.5 + Math.sqrt(3) / 6;
          
          // Refresh Jacobian and LU if needed
          if (!cachedJ || !cachedLU || !cachedPivot || 
              t - lastJacobianT > jacobianRefreshInterval ||
              Math.abs(h - cachedH) / cachedH > 0.5) {
            cachedJ = computeJacobian(y, currentObs);
            const { LU, pivot } = prepareLU(cachedJ, h, gamma, numSpecies);
            cachedLU = LU;
            cachedPivot = pivot;
            cachedH = h;
            lastJacobianT = t;
          }
          
          const result = rosenbrockStep(y, h, cachedJ, cachedLU, cachedPivot);
          yNext = result.yNext;
          yErr = result.yErr;
        } else {
          // Use RK4 with derivative-based step control for non-stiff
          // First, check if step size is limited by derivatives
          let hAdj = h;
          const maxChange = 0.01;
          const minConc = 1e-12;
          
          for (let k = 0; k < numSpecies; k++) {
            const deriv = dydt[k];
            const absderiv = Math.abs(deriv);
            if (absderiv > 1e-12) {
              const conc = y[k];
              if (conc < minConc && deriv > 0) continue;
              const limit = Math.max(conc, minConc) * maxChange;
              const maxStepForSpecies = limit / absderiv;
              if (maxStepForSpecies < hAdj) hAdj = maxStepForSpecies;
            }
          }
          
          if (hAdj < h * 0.001 && h > minStep * 1000) {
            // Step size is being severely limited - switch to implicit
            consecutiveRejects++;
            if (consecutiveRejects > 3) {
              useImplicit = true;
              console.log(`  ⚡ [${modelName}] Switching to implicit solver at t=${t.toFixed(4)} (step limited to ${hAdj.toExponential(2)})`);
              cachedJ = null;  // Force Jacobian refresh
              continue;  // Retry with implicit solver
            }
          } else {
            consecutiveRejects = 0;
          }
          
          h = Math.max(hAdj, minStep);
          if (t + h > tTarget) h = tTarget - t;
          
          const result = rk4StepWithError(y, h);
          yNext = result.yNext;
          yErr = result.yErr;
        }
        
        // Check error and adapt step size
        const err = errorNorm(yErr, y, yNext, atol, rtol);
        
        // Reject numerically unstable proposals early
        let invalidReason: string | null = null;
        let maxGrowth = 0;
        for (let k = 0; k < numSpecies; k++) {
          const val = yNext[k];
          if (!Number.isFinite(val)) {
            invalidReason = 'NaN/Infinity';
            break;
          }
          if (val < -1e-12) {
            invalidReason = 'negative concentration';
            break;
          }
          const denom = Math.max(Math.abs(y[k]), 1e-12);
          const growth = Math.abs(val - y[k]) / denom;
          if (growth > maxGrowth) maxGrowth = growth;
        }

        if (!invalidReason && maxGrowth > 1e6) {
          invalidReason = 'explosive growth';
        }

        if (invalidReason) {
          h = Math.max(h * 0.25, minStep);
          useImplicit = true;  // Fall back to stiff solver after instability
          consecutiveRejects = 0;
          cachedJ = null;
          if (h <= minStep) {
            throw new Error(`Simulation failed: ${invalidReason} detected at t=${t} and step size too small (${h})`);
          }
          continue;
        }

        if (err <= 1.0 || h <= minStep) {
          // Accept step
          y = yNext;
          for (let k = 0; k < numSpecies; k++) {
            if (y[k] < 0 && y[k] > -1e-12) y[k] = 0;
          }
          t += h;
          stepAccepted = true;
          
          // Increase step size if error is small
          if (err < 0.1 && h < maxStep) {
            h = Math.min(h * 2, maxStep);
          } else if (err < 0.5 && h < maxStep) {
            h = Math.min(h * 1.2, maxStep);
          }
          
          // Check if we can switch back to explicit (system became non-stiff)
          if (useImplicit && h > dtOut / 20) {
            // Large steps with implicit suggest system may no longer be stiff
            // Try switching back to explicit
            useImplicit = false;
            consecutiveRejects = 0;
          }
        } else {
          // Reject step and reduce step size
          const factor = Math.max(0.2, 0.9 / Math.sqrt(err));
          h = Math.max(h * factor, minStep);
          
          if (useImplicit) {
            // Force Jacobian refresh on next attempt
            cachedJ = null;
          }
        }
      }
      
      phaseData.push({ time: Math.round(tTarget * 1e10) / 1e10, ...evaluateObservables(y) });
    }
    
    return { y, phaseData };
  };

  // Initialize state
  let y = new Float64Array(state);
  const headers = ['time', ...expandedModel.observables.map(o => o.name)];
  const data: Record<string, number>[] = [];
  
  // Run multi-phase simulation
  if (params.isMultiPhase) {
    console.log(`  ▶ [${modelName}] Running ${params.phases.length}-phase simulation`);
  }
  
  for (let phaseIdx = 0; phaseIdx < params.phases.length; phaseIdx++) {
    const phase = params.phases[phaseIdx];
    
    // Apply setConcentration commands before this phase
    if (phase.setConcentrations.length > 0) {
      console.log(`  ▶ [${modelName}] Phase ${phaseIdx + 1}: Applying ${phase.setConcentrations.length} concentration changes`);
      y = applySetConcentrations(y, phase.setConcentrations);
    }
    
    if (params.isMultiPhase) {
      const phaseType = phase.steady_state ? 'equilibration' : 'kinetics';
      console.log(`  ▶ [${modelName}] Phase ${phaseIdx + 1}: ${phaseType} t=${phase.t_start} to ${phase.t_end} (${phase.n_steps} steps)`);
    }
    
    const { y: yAfter, phaseData } = runPhase(y, phase, phaseIdx);
    y = yAfter;
    
    // For equilibration phases (steady_state=true), don't add to output data
    // Only the final kinetics phase data is used for comparison
    if (!phase.steady_state || phaseIdx === params.phases.length - 1) {
      data.push(...phaseData);
    }
  }

  const totalTime = Date.now() - startTime;
  const odeTime = totalTime - networkTime;
  console.log(`  ✓ [${modelName}] ODE simulation: ${(odeTime/1000).toFixed(2)}s (total: ${(totalTime/1000).toFixed(2)}s)`);

  return { headers, data };
}

// ============================================================================
// Extract simulation parameters from BNGL (multi-phase support)
// ============================================================================

interface SimulationPhase {
  t_start: number;
  t_end: number;
  n_steps: number;
  steady_state: boolean;
  continue_from_previous: boolean;
  setConcentrations: { species: string; value: string }[];
}

interface SimulationParams {
  phases: SimulationPhase[];
  t_end: number;      // Final t_end for comparison
  n_steps: number;    // Total steps for comparison
  steady_state: boolean;  // True if any phase uses steady_state
  isMultiPhase: boolean;
}

function extractSimParams(bnglContent: string): SimulationParams {
  const phases: SimulationPhase[] = [];
  
  // Extract action block (everything after "end model" or after observables)
  let actionBlock = bnglContent;
  const endModelMatch = bnglContent.match(/end\s+model/i);
  if (endModelMatch && endModelMatch.index !== undefined) {
    actionBlock = bnglContent.slice(endModelMatch.index);
  }
  
  // Remove comments
  actionBlock = actionBlock.replace(/#[^\n]*/g, '');
  
  // Find setConcentration calls - these have arguments with parens inside, so use a different approach
  // Match setConcentration with quoted string containing parens, then comma, then value
  const setConcentrationRegex = /setConcentration\s*\(\s*"([^"]+)"\s*,\s*"?([^)"]+)"?\s*\)/gi;
  
  // Find simulate calls
  const simulateRegex = /simulate[_a-z]*\s*\(\s*\{([^}]*)\}\s*\)/gi;
  
  // Collect all actions with their positions
  interface ActionInfo {
    type: 'setConcentration' | 'simulate';
    index: number;
    species?: string;
    value?: string;
    params?: string;
  }
  const actions: ActionInfo[] = [];
  
  let match;
  while ((match = setConcentrationRegex.exec(actionBlock)) !== null) {
    actions.push({
      type: 'setConcentration',
      index: match.index,
      species: match[1],
      value: match[2]
    });
  }
  
  while ((match = simulateRegex.exec(actionBlock)) !== null) {
    actions.push({
      type: 'simulate',
      index: match.index,
      params: match[1]
    });
  }
  
  // Sort actions by their position in the file
  actions.sort((a, b) => a.index - b.index);
  
  // Process actions in order
  let pendingSetConcentrations: { species: string; value: string }[] = [];
  let currentT = 0;
  
  for (const action of actions) {
    if (action.type === 'setConcentration') {
      pendingSetConcentrations.push({
        species: action.species!,
        value: action.value!
      });
    } else if (action.type === 'simulate') {
      const params = action.params!;
      
      // Parse simulation parameters
      const tEndMatch = params.match(/t_end\s*=>?\s*([^,}\s]+)/i);
      const tStartMatch = params.match(/t_start\s*=>?\s*([^,}\s]+)/i);
      const nStepsMatch = params.match(/n_steps\s*=>?\s*(\d+)/i);
      const continueMatch = params.match(/continue\s*=>?\s*1/i);
      const steadyStateMatch = params.match(/steady_state\s*=>?\s*1/i);
      
      let t_end = 100;
      let t_start = continueMatch ? currentT : 0;
      let n_steps = 100;
      
      if (tEndMatch) {
        try {
          t_end = new Function(`return ${tEndMatch[1]}`)();
        } catch {
          t_end = parseFloat(tEndMatch[1]) || 100;
        }
      }
      
      if (tStartMatch) {
        try {
          t_start = new Function(`return ${tStartMatch[1]}`)();
        } catch {
          t_start = parseFloat(tStartMatch[1]) || t_start;
        }
      }
      
      if (nStepsMatch) {
        n_steps = parseInt(nStepsMatch[1]);
      }
      
      phases.push({
        t_start,
        t_end,
        n_steps,
        steady_state: !!steadyStateMatch,
        continue_from_previous: !!continueMatch || phases.length > 0,
        setConcentrations: [...pendingSetConcentrations]
      });
      
      // Clear pending setConcentrations and update current time
      pendingSetConcentrations = [];
      currentT = t_end;
    }
  }
  
  // If no phases found, create a default one
  if (phases.length === 0) {
    const tEndMatch = bnglContent.match(/t_end\s*=>?\s*([^,}\s]+)/i);
    const nStepsMatch = bnglContent.match(/n_steps\s*=>?\s*(\d+)/i);
    const steadyStateMatch = bnglContent.match(/steady_state\s*=>?\s*1/i);
    
    let t_end = 100;
    if (tEndMatch) {
      try {
        t_end = new Function(`return ${tEndMatch[1]}`)();
      } catch {
        t_end = parseFloat(tEndMatch[1]) || 100;
      }
    }
    
    phases.push({
      t_start: 0,
      t_end,
      n_steps: nStepsMatch ? parseInt(nStepsMatch[1]) : 100,
      steady_state: !!steadyStateMatch,
      continue_from_previous: false,
      setConcentrations: []
    });
  }
  
  // Calculate totals for comparison
  const lastPhase = phases[phases.length - 1];
  const totalSteps = phases.reduce((sum, p) => sum + p.n_steps, 0);
  const hasSteadyState = phases.some(p => p.steady_state);
  
  return {
    phases,
    t_end: lastPhase.t_end,
    n_steps: totalSteps,
    steady_state: hasSteadyState,
    isMultiPhase: phases.length > 1 || phases[0].setConcentrations.length > 0
  };
}

// ============================================================================
// Compare GDAT results
// ============================================================================

function compareGdat(bng2: GdatData, web: GdatData): { match: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Get observable names (excluding 'time')
  const bng2Obs = bng2.headers.filter(h => h !== 'time');
  const webObs = web.headers.filter(h => h !== 'time');
  
  // Check headers
  const missingInWeb = bng2Obs.filter(h => !webObs.includes(h));
  const extraInWeb = webObs.filter(h => !bng2Obs.includes(h));
  
  if (missingInWeb.length > 0) {
    errors.push(`Missing observables in web: ${missingInWeb.join(', ')}`);
  }
  
  // Compare common observables at final time
  const bng2Final = bng2.data[bng2.data.length - 1];
  const webFinal = web.data[web.data.length - 1];
  
  for (const obs of bng2Obs) {
    if (!webObs.includes(obs)) continue;
    
    const bng2Val = bng2Final[obs];
    const webVal = webFinal[obs];
    
    const diff = Math.abs(bng2Val - webVal);
    const relDiff = Math.abs(bng2Val) > 1e-10 ? diff / Math.abs(bng2Val) : diff;
    
    if (relDiff > REL_TOL && diff > ABS_TOL) {
      errors.push(`${obs}: BNG2=${bng2Val.toFixed(6)}, Web=${webVal.toFixed(6)}, relDiff=${(relDiff*100).toFixed(2)}%`);
    }
  }
  
  return { match: errors.length === 0, errors };
}

// ============================================================================
// Test Models
// ============================================================================

// Get list of test models from bng2_test_report.json AND example-models
function getTestModels(): { model: string; path: string }[] {
  const models: { model: string; path: string }[] = [];
  
  // 1. Add models from bng2_test_report.json (published + test models that BNG2.pl can run)
  const reportPath = join(projectRoot, 'bng2_test_report.json');
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    // Report format: { passed: [...], failed: [...] }
    // Each entry has: { model, path, hasGdat, ... }
    for (const r of (report.passed || [])) {
      if (r.hasGdat) {
        models.push({ model: r.model, path: r.path });
      }
    }
  }
  
  // 2. Add example-models (AI-generated, should all pass)
  const exampleDir = join(projectRoot, 'example-models');
  if (existsSync(exampleDir)) {
    const exampleFiles = readdirSync(exampleDir).filter(f => f.endsWith('.bngl'));
    for (const file of exampleFiles) {
      const modelName = file.replace('.bngl', '');
      // Skip if already in list
      if (!models.some(m => m.model === modelName)) {
        models.push({ model: modelName, path: join(exampleDir, file) });
      }
    }
  }
  
  return models;
}

// ============================================================================
// Test Suite
// ============================================================================

const describeFn = bngAvailable ? describe : describe.skip;

describeFn('Web Simulator vs BNG2.pl GDAT Comparison', () => {
  const testModels = getTestModels();
  
  if (testModels.length === 0) {
    it.skip('No test models available', () => {});
    return;
  }

  // Filter out models with known performance issues
  let modelsToTest = testModels.filter(m => !SKIP_MODELS.has(m.model));
  const skippedModels = testModels.filter(m => SKIP_MODELS.has(m.model));
  
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Testing ${modelsToTest.length} models (skipping ${skippedModels.length} slow models)            ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  if (skippedModels.length > 0) {
    console.log(`Skipped: ${skippedModels.map(m => m.model).join(', ')}\n`);
  }
  
  for (const { model: modelName, path: bnglPath } of modelsToTest) {
    it(`matches BNG2.pl for ${modelName}`, async () => {
      console.log(`\n┌─ Testing: ${modelName} ─────────────────────────────────────`);
      
      if (!existsSync(bnglPath)) {
        console.warn(`  ⚠️ Skipping: BNGL file not found at ${bnglPath}`);
        return;
      }
      
      const bnglContent = readFileSync(bnglPath, 'utf-8');
      const params = extractSimParams(bnglContent);
      console.log(`  Parameters: t_end=${params.t_end}, n_steps=${params.n_steps}${params.isMultiPhase ? ` (${params.phases.length} phases)` : ''}`);
      
      // Run BNG2.pl
      console.log(`  Running BNG2.pl...`);
      let bng2Result: GdatData | null = null;
      
      const bng2Start = Date.now();
      bng2Result = runBNG2(bnglPath);
      const bng2Time = Date.now() - bng2Start;
      
      if (!bng2Result) {
        console.warn(`  ⚠️ Skipping: BNG2.pl failed`);
        return;
      }
      console.log(`  ✓ BNG2.pl completed in ${(bng2Time/1000).toFixed(2)}s`);
      
      // Parse and run web simulator
      const model = parseBNGL(bnglContent);
      
      try {
        const webResult = await runWebSimulator(model, params, modelName);
        
        // Compare
        const comparison = compareGdat(bng2Result!, webResult);
        
        if (!comparison.match) {
          console.log(`\n  ❌ [${modelName}] MISMATCH:`);
          comparison.errors.forEach(e => console.log(`     - ${e}`));
        } else {
          console.log(`  ✓ [${modelName}] Results MATCH`);
        }
        console.log(`└─────────────────────────────────────────────────────────────────`);
        
        expect(comparison.match, comparison.errors.join('\n')).toBe(true);
      } catch (err) {
        console.error(`  ❌ [${modelName}] ERROR:`, err instanceof Error ? err.message : err);
        console.log(`└─────────────────────────────────────────────────────────────────`);
        throw err;
      }
    }, TIMEOUT_MS);
  }
});
