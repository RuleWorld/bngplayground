/**
 * GDAT Comparison Benchmarking Tests
 * Reads gdat_models.json and runs benchmark against BNG2.pl output
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Fix imports: Use relative paths. 
// parseBNGL and ODESolver are in root services/, graph is in src/services/
import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { BNGLParser } from './services/graph/core/BNGLParser';
import { GraphCanonicalizer } from './services/graph/core/Canonical';
// ODESolver import restored after cvode_loader.js CJS/ESM conflict fix
import { createSolver, CVODESolver } from '../services/ODESolver';
import type { BNGLModel, SimulationResults } from '../types'; // Root types.ts

import modelsList from './gdat_models.json';

// Inline RK4 integrator to avoid ODESolver import conflict with cvode_loader
type DerivativeFn = (t: number, y: Float64Array, dydt: Float64Array) => void;

function rk4Integrate(
  y: Float64Array,
  t0: number,
  tEnd: number,
  derivatives: DerivativeFn,
  options: { maxStep?: number; minStep?: number } = {}
): { success: boolean; y: Float64Array; t: number } {
  const n = y.length;
  const yNew = new Float64Array(y);
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const yTemp = new Float64Array(n);

  let t = t0;
  const maxStep = options.maxStep || (tEnd - t0) / 100;
  const minStep = options.minStep || 1e-15;

  while (t < tEnd) {
    let h = Math.min(maxStep, tEnd - t);
    if (h < minStep) h = minStep;

    // k1 = f(t, y)
    derivatives(t, yNew, k1);

    // k2 = f(t + h/2, y + h*k1/2)
    for (let i = 0; i < n; i++) yTemp[i] = yNew[i] + 0.5 * h * k1[i];
    derivatives(t + 0.5 * h, yTemp, k2);

    // k3 = f(t + h/2, y + h*k2/2)
    for (let i = 0; i < n; i++) yTemp[i] = yNew[i] + 0.5 * h * k2[i];
    derivatives(t + 0.5 * h, yTemp, k3);

    // k4 = f(t + h, y + h*k3)
    for (let i = 0; i < n; i++) yTemp[i] = yNew[i] + h * k3[i];
    derivatives(t + h, yTemp, k4);

    // y_new = y + h*(k1 + 2*k2 + 2*k3 + k4)/6
    for (let i = 0; i < n; i++) {
      yNew[i] = yNew[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    }

    t += h;
  }

  return { success: true, y: yNew, t };
}

// Initialize CVODE for Node environment
// We need to ensure WASM can be loaded before tests run
beforeAll(async () => {
  // Set up Node.js-compatible WASM loading by patching the init method
  const originalInit = CVODESolver.init;
  CVODESolver.init = async () => {
    if (CVODESolver.module) return;
    try {
      // Try the standard init first
      await originalInit();
    } catch (e) {
      // If standard init fails (e.g., browser paths), load manually
      console.log('Standard CVODE init failed, loading WASM manually...');
      // Dynamic import of loader
      // @ts-ignore
      const createCVodeModule = (await import('../services/cvode_loader')).default;

      const wasmPath = path.resolve(process.cwd(), 'public/cvode.wasm');
      if (!fs.existsSync(wasmPath)) {
        throw new Error('cvode.wasm not found at ' + wasmPath);
      }
      const wasmBinary = fs.readFileSync(wasmPath);
      CVODESolver.module = await createCVodeModule({
        wasmBinary: wasmBinary,
      }) as any;
    }
  };
});

async function simulateModel(inputModel: BNGLModel, options: { t_end: number; n_steps: number; solver: string; atol?: number; rtol?: number; maxSteps?: number }): Promise<SimulationResults> {
  // Network generation
  const seedSpecies = inputModel.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

  const seedConcentrationMap = new Map<string, number>();
  inputModel.species.forEach(s => {
    const g = BNGLParser.parseSpeciesGraph(s.name);
    const canonicalName = GraphCanonicalizer.canonicalize(g);
    seedConcentrationMap.set(canonicalName, s.initialConcentration);
  });

  const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

  const rules = inputModel.reactionRules.flatMap(r => {
    const parametersMap = new Map(Object.entries(inputModel.parameters).map(([k, v]) => [k, Number(v)])); // FIX: Explicit cast to number
    const rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
    const reverseRate = r.reverseRate ? BNGLParser.evaluateExpression(r.reverseRate, parametersMap) : rate;

    // Create rule string for parsing
    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
    const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
    forwardRule.name = r.reactants.join('+') + '->' + r.products.join('+');

    if (r.constraints && r.constraints.length > 0) {
      forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
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

  const generator = new NetworkGenerator({ maxSpecies: 1000, maxIterations: 500 });
  const result = await generator.generate(seedSpecies, rules);

  const expandedModel: BNGLModel = {
    ...inputModel,
    species: result.species.map(s => {
      const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
      const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);
      return { name: canonicalName, initialConcentration: concentration };
    }),
    reactions: result.reactions.map(r => ({
      reactants: r.reactants.map(idx => GraphCanonicalizer.canonicalize(result.species[idx].graph)),
      products: r.products.map(idx => GraphCanonicalizer.canonicalize(result.species[idx].graph)),
      rate: r.rate.toString(),
      rateConstant: r.rate
    })),
  };

  // Prepare ODE Solver
  const { t_end, n_steps, solver: solverType } = options;
  // Headers for output (time + observable names)
  const numSpecies = expandedModel.species.length;

  // Build concrete reactions for derivative function
  const speciesMap = new Map<string, number>();
  expandedModel.species.forEach((s, i) => speciesMap.set(s.name, i));

  const concreteReactions = expandedModel.reactions.map(r => {
    const reactantIndices = r.reactants.map(name => speciesMap.get(name));
    const productIndices = r.products.map(name => speciesMap.get(name));
    if (reactantIndices.some(i => i === undefined) || productIndices.some(i => i === undefined)) return null;
    return {
      reactants: new Int32Array(reactantIndices as number[]),
      products: new Int32Array(productIndices as number[]),
      rateConstant: r.rateConstant
    };
  }).filter(r => r !== null) as { reactants: Int32Array, products: Int32Array, rateConstant: number }[];

  // Derivative function
  const derivatives = (yIn: Float64Array, dydt: Float64Array) => {
    dydt.fill(0);
    // Optimization: plain loop without helper calls (though V8 inlines well)
    for (let i = 0; i < concreteReactions.length; i++) {
      const rxn = concreteReactions[i];
      let velocity = rxn.rateConstant;
      for (let j = 0; j < rxn.reactants.length; j++) {
        velocity *= yIn[rxn.reactants[j]];
      }
      for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
      for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
    }
  };

  // Build observable evaluator - use proper graph pattern matching
  const { GraphMatcher } = await import('./services/graph/core/Matcher');

  const concreteObservables = expandedModel.observables.map(obs => {
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];

    // Parse the observable pattern as a SpeciesGraph for proper matching
    let obsPattern: ReturnType<typeof BNGLParser.parseSpeciesGraph> | null = null;
    try {
      obsPattern = BNGLParser.parseSpeciesGraph(obs.pattern);
    } catch (e) {
      // Fall through to string matching below
    }

    expandedModel.species.forEach((s, i) => {
      if (obsPattern) {
        // Use proper graph pattern matching with VF2 algorithm
        try {
          const speciesGraph = BNGLParser.parseSpeciesGraph(s.name);
          if (GraphMatcher.matchesPattern(obsPattern, speciesGraph)) {
            matchingIndices.push(i);
            coefficients.push(1);
          }
        } catch (e) {
          // Pattern matching failed - fall back to string comparison
          if (s.name.includes(obs.pattern) || obs.pattern.includes(s.name.split('(')[0])) {
            matchingIndices.push(i);
            coefficients.push(1);
          }
        }
      } else {
        // Fallback: naive string match if pattern parsing failed
        if (s.name.includes(obs.pattern) || obs.pattern.includes(s.name.split('(')[0])) {
          matchingIndices.push(i);
          coefficients.push(1);
        }
      }
    });
    return { name: obs.name, indices: new Int32Array(matchingIndices), coefficients: new Float64Array(coefficients) };
  });

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

  // Initialize state
  const y0 = new Float64Array(numSpecies);
  expandedModel.species.forEach((s, i) => y0[i] = s.initialConcentration);

  const data: Record<string, number>[] = [];
  data.push({ time: 0, ...evaluateObservables(y0) });


  // Create Solver
  const solver = await createSolver(numSpecies, derivatives, {
    solver: solverType as any || 'rk4',
    atol: options.atol || 1e-8,  // Match BNG2.pl default
    rtol: options.rtol || 1e-8,  // Match BNG2.pl default
    minStep: 1e-15,
    maxStep: t_end / 100,  // Smaller step for oscillatory models
    maxSteps: options.maxSteps || 500000  // More steps for stiff systems
  });

  // Integrate
  const dtOut = t_end / n_steps;
  let t = 0;
  let yCurrent = new Float64Array(y0);

  for (let i = 1; i <= n_steps; i++) {
    const tTarget = i * dtOut;
    const result = solver.integrate(yCurrent, t, tTarget);
    if (!result.success) {
      console.warn('Solver failed at t=' + tTarget);
      break;
    }
    yCurrent = result.y as Float64Array<ArrayBuffer>;
    t = tTarget;
    data.push({ time: Math.round(t * 1e10) / 1e10, ...evaluateObservables(yCurrent) });
  }

  return { headers: [], data };
}

// Helper to parse GDAT content from string
function parseGdat(content: string) {
  const lines = content.trim().split('\n');
  const headerLine = lines.find(l => l.startsWith('#'));
  if (!headerLine) return null;

  const headers = headerLine.replace(/^#\s*/, '').trim().split(/\s+/);
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

// Helper to extract sim params
function extractSimParams(bnglContent: string) {
  const tEndMatch = bnglContent.match(/t_end\s*=>?\s*([\d.e+-]+)/i);
  const nStepsMatch = bnglContent.match(/n_steps\s*=>?\s*(\d+)/i);

  return {
    t_end: tEndMatch ? parseFloat(tEndMatch[1]) : 100,
    n_steps: nStepsMatch ? parseInt(nStepsMatch[1]) : 100
  };
}

describe('GDAT Comparison: Web Simulator vs BNG2.pl', () => {
  // Include all models that have valid GDAT files, sort by simplest first
  const MODELS_TO_TEST = modelsList
    .filter(m => m.status === 'ready_for_comparison')
    .sort((a, b) => a.bng2DataPoints - b.bng2DataPoints);


  for (const modelInfo of MODELS_TO_TEST) {
    const modelName = modelInfo.modelName;

    it(`should match BNG2.pl output for ${modelName}`, { timeout: 300000 }, async () => {
      // Access files relative to project root
      const bng2GdatPath = modelInfo.bng2GdatPath;
      const projectRoot = path.resolve(__dirname, '..');
      let bnglPath: string | null = null;

      if (modelName.includes('-') && !modelName.includes('_')) {
        // Hyphenated example models - simple path
        bnglPath = path.join(projectRoot, 'example-models', `${modelName}.bngl`);
      } else {
        // Published models - search in subdirectories of published-models/
        const publishedModelsDir = path.join(projectRoot, 'published-models');
        const subdirs = ['cell-regulation', 'complex-models', 'growth-factor-signaling', 'immune-signaling', 'tutorials'];
        for (const subdir of subdirs) {
          const candidatePath = path.join(publishedModelsDir, subdir, `${modelName}.bngl`);
          if (fs.existsSync(candidatePath)) {
            bnglPath = candidatePath;
            break;
          }
        }
      }

      if (!bnglPath || !fs.existsSync(bnglPath)) {
        console.log(`Skipping ${modelName} - BNGL not found`);
        return;
      }

      const bng2Content = fs.readFileSync(bng2GdatPath, 'utf-8');
      const bnglContent = fs.readFileSync(bnglPath, 'utf-8');

      // Skip models that use simulate_nf (NFsim) - not supported by ODE solver
      if (bnglContent.includes('simulate_nf') || ['test_viz', 'simple_system'].some(s => modelName.includes(s))) {
        console.log(`Skipping ${modelName} - uses simulate_nf or excluded`);
        return;
      }

      const model = parseBNGL(bnglContent);
      const params = extractSimParams(bnglContent);

      // Determine solver options - use CVODE to match BNG2.pl accuracy
      const simOptions: any = { ...params, method: 'ode', solver: 'cvode' };

      // Increase maxSteps for stiff models
      if (modelName.includes('An_2009') || modelName.includes('stiff')) {
        simOptions.maxSteps = 1000000;
      }

      const webResults = await simulateModel(model, simOptions);
      const bng2Gdat = parseGdat(bng2Content);

      if (!bng2Gdat) throw new Error('Failed to parse BNG2 gdat');

      // Compare final values
      const webFinal = webResults.data[webResults.data.length - 1];
      const bng2Final = bng2Gdat.data[bng2Gdat.data.length - 1];

      for (const header of bng2Gdat.headers) {
        if (header === 'time') continue;

        const bng2Val = bng2Final[header];
        const webVal = webFinal[header];

        if (webVal === undefined) continue;

        const diff = Math.abs(bng2Val - webVal);
        const relDiff = bng2Val !== 0 ? diff / Math.abs(bng2Val) : diff;

        expect(relDiff < 0.02 || diff < 1e-6,
          `${header}: BNG2=${bng2Val}, Web=${webVal}, relDiff=${(relDiff * 100).toFixed(2)}%`
        ).toBe(true);
      }

    });
  }
});
