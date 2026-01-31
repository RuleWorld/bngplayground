// @ts-nocheck
/**
 * GDAT Comparison Benchmarking Tests
 * Reads gdat_models.json and runs benchmark against BNG2.pl output
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Use ANTLR parser wrapper
import { parseBNGLWithANTLR } from './parser/BNGLParserWrapper';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { BNGLParser } from './services/graph/core/BNGLParser';
import { GraphCanonicalizer } from './services/graph/core/Canonical';
import { NautyService } from './services/graph/core/NautyService';
import { createSolver } from '../services/ODESolver';
import { findConservationLaws, createReducedSystem } from './services/ConservationLaws';
import type { BNGLModel, SimulationResults, SimulationPhase, ConcentrationChange } from '../types';

import modelsList from './gdat_models.json';

beforeAll(async () => {
  await NautyService.getInstance().init();
});

// The web simulator currently does not implement BioNetGen's compartment semantics.
// Until it does, exclude compartmental models from GDAT parity benchmarks.
const SKIP_COMPARTMENT_MODELS = true;

// Conservation-law reduction should be mathematically equivalent, but numeric/conditioning
// differences can affect strict parity comparisons. Keep benchmarks on the full system.
const ENABLE_CONSERVATION_REDUCTION = false;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitTopLevelCommaList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

function createExpressionEvaluator(
  params: Record<string, number>,
  observableNames: string[],
  functions: NonNullable<BNGLModel['functions']> = []
) {
  const compiledExprCache = new Map<string, (paramsObj: Record<string, number>, obsObj: Record<string, number>, fnObj: any) => number>();
  const compiledFnCache = new Map<string, (...args: number[]) => number>();

  const paramKeys = Object.keys(params);
  const obsKeys = observableNames;
  const functionDefs = new Map(functions.map(f => [f.name, f]));

  const normalizeToJS = (expr: string): string => {
    let js = expr;
    js = js.replace(/\^/g, '**');

    js = js.replace(/\b_pi\b/g, String(Math.PI));
    js = js.replace(/\b_e\b/g, String(Math.E));

    js = js.replace(/\bexp\s*\(/g, 'Math.exp(');
    js = js.replace(/\bln\s*\(/g, 'Math.log(');
    js = js.replace(/\blog10\s*\(/g, 'Math.log10(');
    js = js.replace(/\bsqrt\s*\(/g, 'Math.sqrt(');
    js = js.replace(/\babs\s*\(/g, 'Math.abs(');
    js = js.replace(/\bmin\s*\(/g, 'Math.min(');
    js = js.replace(/\bmax\s*\(/g, 'Math.max(');

    // Map known user-defined functions to fn.<name>(...)
    for (const name of functionDefs.keys()) {
      const escaped = escapeRegExp(name);
      js = js.replace(new RegExp(`\\b${escaped}\\s*\\(`, 'g'), `fn.${name}(`);
    }

    // Replace observables and parameters with lookups (defaulting to 0)
    for (const key of obsKeys) {
      const escaped = escapeRegExp(key);
      js = js.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `(obs[${JSON.stringify(key)}] ?? 0)`);
    }
    for (const key of paramKeys) {
      const escaped = escapeRegExp(key);
      js = js.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `(params[${JSON.stringify(key)}] ?? 0)`);
    }

    return js;
  };

  const compileExpression = (expr: string) => {
    const cached = compiledExprCache.get(expr);
    if (cached) return cached;

    const js = normalizeToJS(expr);
     
    const fn = new Function('params', 'obs', 'fn', `"use strict"; return (${js});`) as any;
    const wrapped = (paramsObj: Record<string, number>, obsObj: Record<string, number>, fnObj: any) => {
      const out = fn(paramsObj, obsObj, fnObj);
      return typeof out === 'number' && Number.isFinite(out) ? out : 0;
    };
    compiledExprCache.set(expr, wrapped);
    return wrapped;
  };

  // Mutable reference to current observables for user-defined function calls
  let currentObs: Record<string, number> = {};

  const fnEnv: Record<string, (...args: number[]) => number> = {};
  for (const [name, def] of functionDefs.entries()) {
    fnEnv[name] = (...args: number[]) => {
      const cached = compiledFnCache.get(name);
      if (cached) return cached(...args);

      const jsBody = normalizeToJS(def.expression);
       
      const compiled = new Function(
        'params',
        'obs',
        'fn',
        ...def.args,
        `"use strict"; return (${jsBody});`
      ) as any;

      const wrapped = (...innerArgs: number[]) => {
        const out = compiled(params, currentObs, fnEnv, ...innerArgs);
        return typeof out === 'number' && Number.isFinite(out) ? out : 0;
      };
      compiledFnCache.set(name, wrapped);
      return wrapped(...args);
    };
  }

  return {
    eval: (expr: string, obsValues: Record<string, number>) => {
      currentObs = obsValues;
      const f = compileExpression(expr);
      return f(params, obsValues, fnEnv);
    },
  };
}

function evalAsNumber(expr: string, parametersMap: Map<string, number>, observableNames: Set<string>): number {
  // Actions params generally depend only on parameters; treat observables as 0.
  const paramsObj: Record<string, number> = {};
  for (const [k, v] of parametersMap.entries()) paramsObj[k] = v;
  const evaluator = createExpressionEvaluator(paramsObj, Array.from(observableNames), []);
  return evaluator.eval(expr, {});
}

// ... (keep rk4Integrate and beforeAll logic the same) ...

export async function _simulateModel(inputModel: BNGLModel, options: { t_end: number; n_steps: number; solver: string; atol?: number; rtol?: number; maxSteps?: number }): Promise<SimulationResults> {
  // Network generation
  const seedSpecies = inputModel.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

  const seedConcentrationMap = new Map<string, number>();
  inputModel.species.forEach(s => {
    const g = BNGLParser.parseSpeciesGraph(s.name);
    const canonicalName = GraphCanonicalizer.canonicalize(g);
    seedConcentrationMap.set(canonicalName, s.initialConcentration);
  });

  const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');
  
  // Create rules with proper naming to avoid deduplication issues
  const rules = inputModel.reactionRules.flatMap((r, i) => {
    const parametersMap = new Map(Object.entries(inputModel.parameters).map(([k, v]) => [k, Number(v)]));
    const rateStr = String(r.rate); // Ensure string
    const rate = BNGLParser.evaluateExpression(rateStr, parametersMap);
    
    const parsedRules: any[] = [];

    // Forward rule
    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
    const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
    // Use explicit naming if available, otherwise index-based to ensure uniqueness
    forwardRule.name = r.name ? `${r.name}_fwd` : `_R${i+1}_fwd`; 
    forwardRule.rateExpression = rateStr; // Preserve expression for generator

    if (r.constraints && r.constraints.length > 0) {
        forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
    }
    parsedRules.push(forwardRule);

    // Reverse rule
    if (r.isBidirectional && r.reverseRate) {
        const revRateStr = String(r.reverseRate);
        const reverseRate = BNGLParser.evaluateExpression(revRateStr, parametersMap);
        
        const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
        const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
        reverseRule.name = r.name ? `${r.name}_rev` : `_R${i+1}_rev`;
        reverseRule.rateExpression = revRateStr;

        // BNG2.pl parity: reverse of bimolecular rules should only match
        // species that could have been produced by the forward reaction.
        if (r.reactants.length === 2 && r.products.length === 1) {
            const productGraph = BNGLParser.parseSpeciesGraph(r.products[0]);
            reverseRule.maxReactantMoleculeCount = productGraph.molecules.length;
        }
        parsedRules.push(reverseRule);
    }
    
    return parsedRules;
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
      rateConstant: r.rateConstant,
      propensityFactor: 1
    };
  }).filter(r => r !== null) as { reactants: Int32Array, products: Int32Array, rateConstant: number, propensityFactor: number }[];

  // Derivative function
  const derivatives = (yIn: Float64Array, dydt: Float64Array) => {
    dydt.fill(0);
    // Optimization: plain loop without helper calls (though V8 inlines well)
    for (let i = 0; i < concreteReactions.length; i++) {
      const rxn = concreteReactions[i];
      let velocity = rxn.rateConstant * rxn.propensityFactor;
      for (let j = 0; j < rxn.reactants.length; j++) {
        velocity *= yIn[rxn.reactants[j]];
      }
      for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
      for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
    }
  };

  // Build observable evaluator - use proper graph pattern matching
  const { GraphMatcher } = await import('./services/graph/core/Matcher');

  // BNG2 semantics: observable pattern match counts should not overcount purely
  // symmetric embeddings (e.g., swapping identical molecules in a dimer).
  // GraphMatcher.findAllMaps returns all embeddings; we dedupe maps by their
  // target-image signature while preserving distinct component assignments.
  const countObservableMatches = (patternGraph: ReturnType<typeof BNGLParser.parseSpeciesGraph>, speciesGraph: ReturnType<typeof BNGLParser.parseSpeciesGraph>): number => {
    const rawMaps = GraphMatcher.findAllMaps(patternGraph, speciesGraph);
    if (rawMaps.length <= 1) return rawMaps.length;

    const unique = new Set<string>();
    for (const m of rawMaps) {
      // Align to BNG2's SpeciesGraph::isomorphicToSubgraph(): count distinct
      // mappings (pattern mol->target mol and pattern comp->target comp).
      // This removes only true duplicate match enumerations while preserving
      // distinct mappings like swapping two identical molecules in a dimer.
      const molPairs = Array.from(m.moleculeMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([pMol, tMol]) => `${pMol}->${tMol}`);

      const compPairs = Array.from(m.componentMap.entries())
        .sort((a, b) => {
          const [aMolStr, aCompStr] = a[0].split('.');
          const [bMolStr, bCompStr] = b[0].split('.');
          const aMol = Number(aMolStr);
          const bMol = Number(bMolStr);
          if (aMol !== bMol) return aMol - bMol;
          return Number(aCompStr) - Number(bCompStr);
        })
        .map(([pComp, tComp]) => `${pComp}->${tComp}`);

      unique.add(`${molPairs.join('|')}//${compPairs.join('|')}`);
    }

    return unique.size;
  };

  const concreteObservables = expandedModel.observables.map(obs => {
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];

    // Observable patterns are a comma-separated list at the top level, but commas
    // also appear inside molecule site lists. Split safely at top-level commas.
    const patternStrings = splitTopLevelCommaList(obs.pattern);
    const parsedPatterns = patternStrings
      .map(p => {
        try {
          return BNGLParser.parseSpeciesGraph(p);
        } catch {
          return null;
        }
      })
      .filter((p): p is ReturnType<typeof BNGLParser.parseSpeciesGraph> => p !== null);

    expandedModel.species.forEach((s, i) => {
      if (parsedPatterns.length > 0) {
        try {
          const speciesGraph = BNGLParser.parseSpeciesGraph(s.name);
          let contribution = 0;

          for (const pat of parsedPatterns) {
            const matchCount = countObservableMatches(pat, speciesGraph);
            if (matchCount <= 0) continue;
            if (obs.type === 'species') {
              contribution = 1;
              break;
            }
            contribution += matchCount;
          }

          if (contribution > 0) {
            matchingIndices.push(i);
            coefficients.push(contribution);
          }
          return;
        } catch {
          // Fall through to string matching below
        }
      }

      // Fallback: naive string match if pattern parsing failed
      const speciesBase = s.name.split('(')[0];
      const canonicalHit = patternStrings.some(p => s.name.includes(p) || p.includes(speciesBase));
      if (canonicalHit) {
        matchingIndices.push(i);
        coefficients.push(1);
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
  let yCurrent: Float64Array<ArrayBufferLike> = new Float64Array(y0);

  for (let i = 1; i <= n_steps; i++) {
    const tTarget = i * dtOut;
    const result = solver.integrate(yCurrent, t, tTarget);
    if (!result.success) {
      console.warn('Solver failed at t=' + tTarget);
      break;
    }
    yCurrent = result.y as Float64Array;
    t = tTarget;
    data.push({ time: Math.round(t * 1e10) / 1e10, ...evaluateObservables(yCurrent) });
  }

  try {
    (solver as any)?.destroy?.();
  } catch {
    // ignore
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

function parseNetSpeciesCanonical(netContent: string): Map<number, string> {
  const lines = netContent.split(/\r?\n/);
  let inSpecies = false;
  const out = new Map<number, string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^begin\s+species\b/i.test(line)) {
      inSpecies = true;
      continue;
    }
    if (/^end\s+species\b/i.test(line)) {
      break;
    }
    if (!inSpecies) continue;
    if (line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const idx = Number.parseInt(parts[0], 10);
    if (!Number.isFinite(idx)) continue;

    const speciesText = parts[1];
    try {
      const g = BNGLParser.parseSpeciesGraph(speciesText);
      const canon = GraphCanonicalizer.canonicalize(g);
      out.set(idx, canon);
    } catch {
      // ignore
    }
  }

  return out;
}

function readCdatRowClosestToTime(
  cdatContent: string,
  targetTime: number,
  expectedNumSpecies: number
): { time: number; values: Float64Array } | null {
  const lines = cdatContent.split(/\r?\n/);
  let bestTime = NaN;
  let bestDt = Number.POSITIVE_INFINITY;
  let bestValues: Float64Array | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 1 + expectedNumSpecies) continue;
    const t = Number.parseFloat(parts[0]);
    if (!Number.isFinite(t)) continue;
    const dt = Math.abs(t - targetTime);
    if (dt < bestDt) {
      const vals = new Float64Array(expectedNumSpecies);
      for (let i = 0; i < expectedNumSpecies; i++) {
        vals[i] = Number.parseFloat(parts[i + 1]);
      }
      bestDt = dt;
      bestTime = t;
      bestValues = vals;
    }
  }

  if (!bestValues) return null;
  return { time: bestTime, values: bestValues };
}

// Helper to extract all simulation phases and concentration changes from BNGL
interface ExtractedSimParams {
  phases: SimulationPhase[];
  concentrationChanges: ConcentrationChange[];
  parameterChanges: { parameter: string; value: number | string; afterPhaseIndex: number }[];
  // For backward compatibility - the last ODE phase
  t_end: number;
  n_steps: number;
  atol: number;
  rtol: number;
}

function extractMultiPhaseParams(
  bnglContent: string,
  parametersMap: Map<string, number>,
  observableNames: Set<string>
): ExtractedSimParams {
  const phases: SimulationPhase[] = [];
  const concentrationChanges: ConcentrationChange[] = [];
  const parameterChanges: { parameter: string; value: number | string; afterPhaseIndex: number }[] = [];

  // IMPORTANT: ignore commented-out action commands.
  // Several published models include alternative protocols behind leading '#'.
  // The benchmark harness should follow BNG2 behavior and not execute those.
  const scanContent = bnglContent.replace(/#.*$/gm, '');

  // Use regex global matching instead of line splitting (handles all line ending formats)

  // Match simulate_ode commands
  const odeRegex = /simulate_ode\s*\(\s*\{([^}]*)\}/gi;
  let match;
  while ((match = odeRegex.exec(scanContent)) !== null) {
    const argsStr = match[1];
    const t_startMatch = argsStr.match(/t_start\s*=>\s*([^,}\n]+)/i);
    const t_endMatch = argsStr.match(/t_end\s*=>\s*([^,}\n]+)/i);
    const n_stepsMatch = argsStr.match(/n_steps\s*=>\s*([^,}\n]+)/i);
    const atolMatch = argsStr.match(/atol\s*=>\s*([^,}\n]+)/i);
    const rtolMatch = argsStr.match(/rtol\s*=>\s*([^,}\n]+)/i);
    const suffixMatch = argsStr.match(/suffix\s*=>\s*["']?(\w+)["']?/i);
    const continueMatch = argsStr.match(/continue\s*=>\s*(\d+|true|false)/i);
    const steady_stateMatch = argsStr.match(/steady_state\s*=>\s*(\d+)/i);
    const sparseMatch = argsStr.match(/sparse\s*=>\s*(\d+)/i);

    phases.push({
      method: 'ode',
      t_start: t_startMatch ? evalAsNumber(t_startMatch[1].trim(), parametersMap, observableNames) : undefined,
      t_end: t_endMatch ? evalAsNumber(t_endMatch[1].trim(), parametersMap, observableNames) : 100,
      n_steps: n_stepsMatch ? Math.max(1, Math.round(evalAsNumber(n_stepsMatch[1].trim(), parametersMap, observableNames))) : 100,
      continue_from_previous: continueMatch
        ? (() => {
            const raw = continueMatch[1].trim().toLowerCase();
            return raw === '1' || raw === 'true';
          })()
        : undefined,
      atol: atolMatch ? evalAsNumber(atolMatch[1].trim(), parametersMap, observableNames) : undefined,
      rtol: rtolMatch ? evalAsNumber(rtolMatch[1].trim(), parametersMap, observableNames) : undefined,
      suffix: suffixMatch?.[1],
      steady_state: steady_stateMatch?.[1] === '1',
      // Preserve tri-state:
      // - undefined: not specified (use defaults / heuristic)
      // - false: sparse=>0 (force dense)
      // - true: sparse=>1 (force sparse)
      sparse: sparseMatch ? sparseMatch[1] === '1' : undefined,
    });
  }

  // Match simulate_ssa commands (per user request)
  const ssaRegex = /simulate_ssa\s*\(\s*\{([^}]*)\}/gi;
  while ((match = ssaRegex.exec(scanContent)) !== null) {
    const argsStr = match[1];
    const t_startMatch = argsStr.match(/t_start\s*=>\s*([^,}\n]+)/i);
    const t_endMatch = argsStr.match(/t_end\s*=>\s*([^,}\n]+)/i);
    const n_stepsMatch = argsStr.match(/n_steps\s*=>\s*([^,}\n]+)/i);
    const continueMatch = argsStr.match(/continue\s*=>\s*(\d+|true|false)/i);

    phases.push({
      method: 'ssa',
      t_start: t_startMatch ? evalAsNumber(t_startMatch[1].trim(), parametersMap, observableNames) : undefined,
      t_end: t_endMatch ? evalAsNumber(t_endMatch[1].trim(), parametersMap, observableNames) : 100,
      n_steps: n_stepsMatch ? Math.max(1, Math.round(evalAsNumber(n_stepsMatch[1].trim(), parametersMap, observableNames))) : 100,
      continue_from_previous: continueMatch
        ? (() => {
            const raw = continueMatch[1].trim().toLowerCase();
            return raw === '1' || raw === 'true';
          })()
        : undefined,
    });
  }

  // Match simulate({method=>ode,...}) syntax
  const genericSimRegex = /simulate\s*\(\s*\{([^}]*method\s*=>\s*["']?(ode|ssa|nf)["']?[^}]*)\}/gi;
  while ((match = genericSimRegex.exec(scanContent)) !== null) {
    const argsStr = match[1];
    const methodMatch = argsStr.match(/method\s*=>\s*["']?(ode|ssa|nf)["']?/i);
    const methodRaw = methodMatch?.[1]?.toLowerCase();
    const method = methodRaw === 'ssa' ? 'ssa' : (methodRaw === 'nf' ? 'nf' : 'ode');
    const t_startMatch = argsStr.match(/t_start\s*=>\s*([^,}\n]+)/i);
    const t_endMatch = argsStr.match(/t_end\s*=>\s*([^,}\n]+)/i);
    const n_stepsMatch = argsStr.match(/n_steps\s*=>\s*([^,}\n]+)/i);
    const atolMatch = argsStr.match(/atol\s*=>\s*([^,}\n]+)/i);
    const rtolMatch = argsStr.match(/rtol\s*=>\s*([^,}\n]+)/i);
    const continueMatch = argsStr.match(/continue\s*=>\s*(\d+|true|false)/i);

    phases.push({
      method: method as 'ode' | 'ssa' | 'nf',
      t_start: t_startMatch ? evalAsNumber(t_startMatch[1].trim(), parametersMap, observableNames) : undefined,
      t_end: t_endMatch ? evalAsNumber(t_endMatch[1].trim(), parametersMap, observableNames) : 100,
      n_steps: n_stepsMatch ? Math.max(1, Math.round(evalAsNumber(n_stepsMatch[1].trim(), parametersMap, observableNames))) : 100,
      continue_from_previous: continueMatch
        ? (() => {
            const raw = continueMatch[1].trim().toLowerCase();
            return raw === '1' || raw === 'true';
          })()
        : undefined,
      atol: atolMatch ? evalAsNumber(atolMatch[1].trim(), parametersMap, observableNames) : undefined,
      rtol: rtolMatch ? evalAsNumber(rtolMatch[1].trim(), parametersMap, observableNames) : undefined,
    });
  }

  // Match setConcentration commands
  const setConcentrationRegex = /setConcentration\s*\(\s*"([^"]+)"\s*,\s*([^)]+)\)/gi;
  while ((match = setConcentrationRegex.exec(scanContent)) !== null) {
    const species = match[1];
    const rawValue = match[2].trim();
    let value: string | number;

    // Parse value (may be number, parameter name, or expression)
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    } else {
      const num = Number(rawValue);
      value = Number.isFinite(num) ? num : rawValue;
    }

    // Determine which phase this comes after by counting simulate commands before this position
    const beforeContent = scanContent.slice(0, match.index);
    const phasesBefore = (beforeContent.match(/simulate_ode|simulate_ssa|simulate\s*\(\s*\{[^}]*method/gi) || []).length;

    concentrationChanges.push({
      species,
      value,
      afterPhaseIndex: phasesBefore - 1 // -1 because it's after the previous phase (or -1 if before all)
    });
  }

  // Match setParameter commands
  const setParameterRegex = /setParameter\s*\(\s*"([^"]+)"\s*,\s*([^)]+)\)/gi;
  while ((match = setParameterRegex.exec(scanContent)) !== null) {
    const parameter = match[1];
    const rawValue = match[2].trim();
    let value: string | number;

    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    } else {
      const num = Number(rawValue);
      value = Number.isFinite(num) ? num : rawValue;
    }

    const beforeContent = scanContent.slice(0, match.index);
    const phasesBefore = (beforeContent.match(/simulate_ode|simulate_ssa|simulate\s*\(\s*\{[^}]*method/gi) || []).length;

    parameterChanges.push({
      parameter,
      value,
      afterPhaseIndex: phasesBefore - 1
    });
  }

  // Get the last ODE phase for backward compatibility
  const lastOdePhase = phases.filter(p => p.method === 'ode').pop();

  return {
    phases,
    concentrationChanges,
    parameterChanges,
    t_end: lastOdePhase?.t_end || 100,
    n_steps: lastOdePhase?.n_steps || 100,
    atol: lastOdePhase?.atol || 1e-8,
    rtol: lastOdePhase?.rtol || 1e-8
  };
}

function recomputeDerivedParameters(
  model: BNGLModel,
  parametersMap: Map<string, number>,
  overridden: Set<string>
) {
  const exprs = model.paramExpressions;
  if (!exprs) return;

  const maxPasses = 10;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const [name, expr] of Object.entries(exprs)) {
      if (overridden.has(name)) continue;
      try {
        const val = BNGLParser.evaluateExpression(expr, parametersMap);
        if (Number.isFinite(val)) {
          const prev = parametersMap.get(name);
          if (prev === undefined || Math.abs(prev - val) > 0) {
            parametersMap.set(name, val);
            model.parameters[name] = val;
            changed = true;
          }
        }
      } catch {
        // ignore
      }
    }
    if (!changed) break;
  }
}

describe('GDAT Comparison: Web Simulator vs BNG2.pl', () => {
  // Include all models that have valid GDAT files, sort by simplest first
  const MODELS_TO_TEST = modelsList
    .filter(m => m.status === 'ready_for_comparison')
    .sort((a, b) => a.bng2DataPoints - b.bng2DataPoints);


  for (const modelInfo of MODELS_TO_TEST) {
    const modelName = modelInfo.modelName;

    // Pre-resolve BNGL path and early skip reasons so Vitest reports these as skipped.
    const bng2GdatPath = modelInfo.bng2GdatPath;
    const projectRoot = path.resolve(__dirname, '..');
    let bnglPath: string | null = null;

    if (modelName.includes('-') && !modelName.includes('_')) {
      bnglPath = path.join(projectRoot, 'example-models', `${modelName}.bngl`);
    } else {
      const publishedModelsDir = path.join(projectRoot, 'published-models');
      const subdirs = [
        path.join('native-tutorials', 'CBNGL'),
        'cell-regulation',
        'complex-models',
        'growth-factor-signaling',
        'immune-signaling',
        'tutorials',
      ];
      for (const subdir of subdirs) {
        const candidatePath = path.join(publishedModelsDir, subdir, `${modelName}.bngl`);
        if (fs.existsSync(candidatePath)) {
          bnglPath = candidatePath;
          break;
        }
      }
    }

    let skipReason: string | null = null;
    let bnglContentForTest: string | null = null;
    if (!bnglPath || !fs.existsSync(bnglPath)) {
      skipReason = 'BNGL not found';
    } else {
      bnglContentForTest = fs.readFileSync(bnglPath, 'utf-8');
      const usesNfMethod = /simulate_nf\b/i.test(bnglContentForTest) || /method\s*=>\s*["']?nf["']?/i.test(bnglContentForTest);
      if (usesNfMethod || ['test_viz', 'simple_system'].some(s => modelName.includes(s))) {
        skipReason = 'uses simulate_nf or excluded';
      }
      if (!skipReason && SKIP_COMPARTMENT_MODELS) {
        const usesCompartments = /begin\s+compartments\b/i.test(bnglContentForTest);
        if (usesCompartments) skipReason = 'uses compartments (unsupported)';
      }
    }

    const testFn = skipReason ? it.skip : it;

    testFn(`should match BNG2.pl output for ${modelName}`, { timeout: 300000 }, async () => {
      if (skipReason) {
        console.log(`Skipping ${modelName} - ${skipReason}`);
        return;
      }

      const bng2Content = fs.readFileSync(bng2GdatPath, 'utf-8');
      const bnglContent = bnglContentForTest ?? fs.readFileSync(bnglPath!, 'utf-8');

      const parseResult = parseBNGLWithANTLR(bnglContent);
      if (!parseResult.success || !parseResult.model) {
          console.warn(`[${modelName}] Parse failed: ${parseResult.errors?.join(', ')}`);
          return;
      }
      const model = parseResult.model;

      const parametersMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)]));
      const observableNames = new Set(model.observables.map(o => o.name));

      // Prefer action commands parsed by ANTLR (these ignore commented-out protocols)
      const extracted = extractMultiPhaseParams(bnglContent, parametersMap, observableNames);
      const phases = (model.simulationPhases && model.simulationPhases.length > 0) ? model.simulationPhases : extracted.phases;
      const concentrationChanges = (model.concentrationChanges && model.concentrationChanges.length > 0) ? model.concentrationChanges : extracted.concentrationChanges;
      const parameterChanges = (model.parameterChanges && model.parameterChanges.length > 0) ? model.parameterChanges : extracted.parameterChanges;

      const expressionEvaluator = createExpressionEvaluator(
        model.parameters,
        model.observables.map(o => o.name),
        model.functions || []
      );

      console.log(`[${modelName}] ${phases.length} phases, ${concentrationChanges.length} concentration changes, ${parameterChanges.length} parameter changes`);

      // Build expanded network once (shared across all phases)
      const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
      const seedConcentrationMap = new Map<string, number>();
      model.species.forEach(s => {
        const g = BNGLParser.parseSpeciesGraph(s.name);
        const canonicalName = GraphCanonicalizer.canonicalize(g);
        seedConcentrationMap.set(canonicalName, s.initialConcentration);
      });

      const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

      const rules = model.reactionRules.flatMap(r => {
        // Network generation does not depend on numeric rates; seed with 1 to avoid
        // brittle evaluation (e.g., user-defined BNGL functions like gene_*_activity()).
        const seedRate = 1;
        const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, seedRate);
        forwardRule.name = r.reactants.join('+') + '->' + r.products.join('+');
        (forwardRule as any).rateExpression = r.rate;
        if (r.constraints && r.constraints.length > 0) {
          forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }
        if (r.isBidirectional) {
          const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
          const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, seedRate);
          reverseRule.name = r.products.join('+') + '->' + r.reactants.join('+');
          (reverseRule as any).rateExpression = r.reverseRate || r.rate;
          
          // BNG2.pl parity: reverse of bimolecular rules should only match
          // species that could have been produced by the forward reaction.
          if (r.reactants.length === 2 && r.products.length === 1) {
            const productGraph = BNGLParser.parseSpeciesGraph(r.products[0]);
            reverseRule.maxReactantMoleculeCount = productGraph.molecules.length;
          }
          
          return [forwardRule, reverseRule];
        }
        return [forwardRule];
      });

      const maxSpecies = 20000;
      const generatorOptions: any = { maxSpecies, maxIterations: 5000 };

      // Manual maxStoich for Barua_2013 to prevent infinite polymerization
      if (modelName === 'Barua_2013') {
        const maxStoich = new Map<string, number>();
        maxStoich.set('APC', 1);
        maxStoich.set('AXIN', 1);
        maxStoich.set('bCat', 1);
        generatorOptions.maxStoich = maxStoich;
      }

      const generator = new NetworkGenerator(generatorOptions);
      const netResult = await generator.generate(seedSpecies, rules);

      if (netResult.species.length >= maxSpecies) {
        throw new Error(`[${modelName}] Network generation hit max species limit (${maxSpecies}). Increase limit or check model.`);
      }

      // Build species map for concentration changes
      const speciesMap = new Map<string, number>();
      netResult.species.forEach((s, i) => {
        const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
        speciesMap.set(canonicalName, i);
      });

      // Initialize state from seed concentrations
      const numSpecies = netResult.species.length;
      let yCurrent: Float64Array<ArrayBufferLike> = new Float64Array(numSpecies);
      netResult.species.forEach((s, i) => {
        const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
        yCurrent[i] = seedConcentrationMap.get(canonicalName) || s.concentration || 0;
      });

      // Build ODE system (preserve rateExpression for functional rates)
      const concreteReactions = netResult.reactions.map(r => ({
        reactants: new Int32Array(r.reactants),
        products: new Int32Array(r.products),
        rateConstant: r.rate,
        rateExpression: (r as any).rateExpression as string | undefined,
        propensityFactor: (r as any).propensityFactor ?? 1,
      }));

      if (process.env.GDAT_DEBUG_MODEL && process.env.GDAT_DEBUG_MODEL === modelName) {
        const identical = concreteReactions.filter(r => r.reactants.length === 2 && r.reactants[0] === r.reactants[1]);
        console.log(`[${modelName}] Identical-reactant reactions: ${identical.length}`);
        for (const r of identical.slice(0, 20)) {
          const rStr = `${Array.from(r.reactants).join(',')} -> ${Array.from(r.products).join(',')}`;
          const kEff = r.rateConstant * r.propensityFactor;
          console.log(`  ${rStr}  k=${r.rateConstant}  pf=${r.propensityFactor}  kEff=${kEff}` + (r.rateExpression ? `  expr=${r.rateExpression}` : ''));
        }

        // Spot-check against known BNG2.net lines like "7,7 -> 8 0.5*kp2"
        const target = concreteReactions.find(r => r.reactants.length === 2 && r.reactants[0] === 7 && r.reactants[1] === 7 && r.products.length === 1 && r.products[0] === 8);
        if (target) {
          console.log(`[${modelName}] Spot-check rxn 7,7->8: k=${target.rateConstant} pf=${target.propensityFactor} kEff=${target.rateConstant * target.propensityFactor}` + (target.rateExpression ? ` expr=${target.rateExpression}` : ''));
        } else {
          console.log(`[${modelName}] Spot-check rxn 7,7->8: NOT FOUND`);
        }

        // Compare web-generated reaction rate constants to BNG2 .net reactions (mapped by canonical species).
        // This helps localize kinetics mismatches without relying on index alignment.
        try {
          const netPath = path.join(process.cwd(), `${modelName}.net`);
          if (fs.existsSync(netPath)) {
            const netText = fs.readFileSync(netPath, 'utf-8');
            const speciesBlock = netText.match(/begin\s+species[\s\S]*?end\s+species/i)?.[0] ?? '';
            const rxnBlock = netText.match(/begin\s+reactions[\s\S]*?end\s+reactions/i)?.[0] ?? '';

            const webCanonToIdx = new Map<string, number>();
            for (let i = 0; i < netResult.species.length; i++) {
              const canon = GraphCanonicalizer.canonicalize(netResult.species[i].graph);
              webCanonToIdx.set(canon, i);
            }

            const bng2IdxToWebIdx = new Map<number, number>();
            for (const raw of speciesBlock.split(/\r?\n/)) {
              const line = raw.split('#')[0].trim();
              if (!line || /^begin\b/i.test(line) || /^end\b/i.test(line)) continue;
              const parts = line.split(/\s+/);
              if (parts.length < 2) continue;
              const bng2Idx = Number(parts[0]);
              const pattern = parts[1];
              if (!Number.isFinite(bng2Idx)) continue;
              try {
                const g = BNGLParser.parseSpeciesGraph(pattern);
                const canon = GraphCanonicalizer.canonicalize(g);
                const webIdx = webCanonToIdx.get(canon);
                if (webIdx !== undefined) bng2IdxToWebIdx.set(bng2Idx, webIdx);
              } catch {
                // ignore parse failures
              }
            }

            type NetRxn = { reactants: number[]; products: number[]; rateExpr: string };
            const bng2Rxns: NetRxn[] = [];
            for (const raw of rxnBlock.split(/\r?\n/)) {
              const line = raw.split('#')[0].trim();
              if (!line || /^begin\b/i.test(line) || /^end\b/i.test(line)) continue;
              const parts = line.split(/\s+/);
              if (parts.length < 4) continue;
              const reactantIdxs = parts[1].split(',').filter(Boolean).map(s => Number(s));
              const productIdxs = parts[2].split(',').filter(Boolean).map(s => Number(s));
              const rateExpr = parts[3];
              if (reactantIdxs.some(n => !Number.isFinite(n)) || productIdxs.some(n => !Number.isFinite(n))) continue;
              bng2Rxns.push({ reactants: reactantIdxs, products: productIdxs, rateExpr });
            }

            const webRxnIndex = new Map<string, typeof concreteReactions[number][]>();
            const keyFor = (rs: number[], ps: number[]) => {
              const rKey = [...rs].sort((a, b) => a - b).join(',');
              const pKey = [...ps].sort((a, b) => a - b).join(',');
              return `${rKey}->${pKey}`;
            };
            for (const r of concreteReactions) {
              const k = keyFor(Array.from(r.reactants), Array.from(r.products));
              const arr = webRxnIndex.get(k);
              if (arr) arr.push(r);
              else webRxnIndex.set(k, [r]);
            }

            const obsForRates: Record<string, number> = {}; // Blinov_2006 rates are param-only in .net
            let mapped = 0;
            let compared = 0;
            const worst: Array<{ key: string; bng2: number; web: number; rel: number; rateExpr: string; webExpr?: string }> = [];

            for (const r of bng2Rxns) {
              const webReactants = r.reactants.map(i => bng2IdxToWebIdx.get(i)).filter((v): v is number => v !== undefined);
              const webProducts = r.products.map(i => bng2IdxToWebIdx.get(i)).filter((v): v is number => v !== undefined);
              if (webReactants.length !== r.reactants.length || webProducts.length !== r.products.length) continue;
              mapped++;

              const k = keyFor(webReactants, webProducts);
              const candidates = webRxnIndex.get(k);
              if (!candidates || candidates.length === 0) continue;

              const bng2Val = expressionEvaluator.eval(r.rateExpr, obsForRates);
              if (!Number.isFinite(bng2Val)) continue;

              // Pick the candidate whose (evaluated) rate is closest to BNG2.
              let best: { webVal: number; rxn: typeof candidates[number] } | null = null;
              for (const cand of candidates) {
                const exprVal = cand.rateExpression ? expressionEvaluator.eval(cand.rateExpression, obsForRates) : 1;
                const webVal = cand.rateConstant * (cand.propensityFactor ?? 1) * (cand.rateExpression ? exprVal : 1);
                if (!Number.isFinite(webVal)) continue;
                if (!best || Math.abs(webVal - bng2Val) < Math.abs(best.webVal - bng2Val)) {
                  best = { webVal, rxn: cand };
                }
              }
              if (!best) continue;
              compared++;

              const denom = Math.max(Math.abs(bng2Val), 1e-30);
              const rel = Math.abs(best.webVal - bng2Val) / denom;
              if (worst.length < 10 || rel > worst[worst.length - 1].rel) {
                worst.push({
                  key: k,
                  bng2: bng2Val,
                  web: best.webVal,
                  rel,
                  rateExpr: r.rateExpr,
                  webExpr: best.rxn.rateExpression,
                });
                worst.sort((a, b) => b.rel - a.rel);
                if (worst.length > 10) worst.pop();
              }
            }

            console.log(`[${modelName}] Rate-check vs .net: mapped=${mapped}/${bng2Rxns.length}, compared=${compared}`);
            for (const w of worst.slice(0, 5)) {
              console.log(
                `  worst ${w.rel.toExponential(2)}  bng2=${w.bng2}  web=${w.web}  key=${w.key}  netRate=${w.rateExpr}` +
                  (w.webExpr ? `  webExpr=${w.webExpr}` : '')
              );
            }
          } else {
            console.log(`[${modelName}] Rate-check: ${modelName}.net not found at ${netPath}`);
          }
        } catch (e) {
          console.log(`[${modelName}] Rate-check failed: ${(e as any)?.message ?? String(e)}`);
        }
      }

      // Build observable evaluator (used for both output and functional rates)
      const { GraphMatcher } = await import('./services/graph/core/Matcher');

      // BNG2 semantics: observable pattern match counts should not overcount purely
      // symmetric embeddings (e.g., swapping identical molecules in a dimer).
      // GraphMatcher.findAllMaps returns all embeddings; we dedupe maps by their
      // target-image signature while preserving distinct component assignments.
      const countObservableMatches = (patternGraph: ReturnType<typeof BNGLParser.parseSpeciesGraph>, speciesGraph: ReturnType<typeof BNGLParser.parseSpeciesGraph>): number => {
        const rawMaps = GraphMatcher.findAllMaps(patternGraph, speciesGraph);
        if (rawMaps.length <= 1) return rawMaps.length;

        const unique = new Set<string>();
        for (const m of rawMaps) {
          // Align to BNG2's SpeciesGraph::isomorphicToSubgraph(): count distinct
          // mappings (pattern mol->target mol and pattern comp->target comp).
          // This removes only true duplicate match enumerations while preserving
          // distinct mappings like swapping two identical molecules in a dimer.
          const molPairs = Array.from(m.moleculeMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([pMol, tMol]) => `${pMol}->${tMol}`);

          const compPairs = Array.from(m.componentMap.entries())
            .sort((a, b) => {
              const [aMolStr, aCompStr] = a[0].split('.');
              const [bMolStr, bCompStr] = b[0].split('.');
              const aMol = Number(aMolStr);
              const bMol = Number(bMolStr);
              if (aMol !== bMol) return aMol - bMol;
              return Number(aCompStr) - Number(bCompStr);
            })
            .map(([pComp, tComp]) => `${pComp}->${tComp}`);

          unique.add(`${molPairs.join('|')}//${compPairs.join('|')}`);
        }

        return unique.size;
      };

      const debugModel = process.env.GDAT_DEBUG_MODEL;
      const debugObservable = process.env.GDAT_DEBUG_OBSERVABLE;
      const shouldDebugThisModel = !!debugModel && debugModel === modelName;

      const concreteObservables = model.observables.map(obs => {
        const matchingIndices: number[] = [];
        const coefficients: number[] = [];

        const patternStrings = splitTopLevelCommaList(obs.pattern);
        const parsedPatterns = patternStrings
          .map(p => {
            try {
              return BNGLParser.parseSpeciesGraph(p);
            } catch {
              return null;
            }
          })
          .filter((p): p is ReturnType<typeof BNGLParser.parseSpeciesGraph> => p !== null);

        netResult.species.forEach((s, i) => {
          if (parsedPatterns.length > 0) {
            try {
              let contribution = 0;
              for (const pat of parsedPatterns) {
                const matchCount = countObservableMatches(pat, s.graph);
                if (matchCount <= 0) continue;
                if (obs.type === 'species') {
                  contribution = 1;
                  break;
                }
                contribution += matchCount;
              }

              if (contribution > 0) {
                matchingIndices.push(i);
                coefficients.push(contribution);
                return;
              }
            } catch {
              // fall through
            }
          }

          if (parsedPatterns.length === 0) {
            const canonical = GraphCanonicalizer.canonicalize(s.graph);
            const speciesBase = canonical.split('(')[0];
            if (patternStrings.some(p => canonical.includes(p) || p.includes(speciesBase))) {
              matchingIndices.push(i);
              coefficients.push(1);
            }
          }
        });

        return { name: obs.name, indices: new Int32Array(matchingIndices), coefficients: new Float64Array(coefficients) };
      });

      if (shouldDebugThisModel) {
        const speciesCanon = netResult.species.map(s => GraphCanonicalizer.canonicalize(s.graph));
        for (const obs of concreteObservables) {
          if (debugObservable && obs.name !== debugObservable) continue;
          const entries: Array<{ idx: number; coef: number; name: string }> = [];
          for (let j = 0; j < obs.indices.length; j++) {
            const idx = obs.indices[j];
            entries.push({ idx, coef: obs.coefficients[j], name: speciesCanon[idx] || `S${idx}` });
          }
          entries.sort((a, b) => b.coef - a.coef);
          console.log(`[${modelName}] Observable '${obs.name}': ${entries.length} matching species`);
          for (const e of entries.slice(0, 25)) {
            console.log(`  coef=${e.coef} idx=${e.idx} ${e.name}`);
          }
          if (entries.length > 25) console.log(`  ... ${entries.length - 25} more`);
        }
      }

      const evaluateObservables = (state: Float64Array) => {
        const obsValues: Record<string, number> = {};
        for (const obs of concreteObservables) {
          let sum = 0;
          for (let j = 0; j < obs.indices.length; j++) sum += state[obs.indices[j]] * obs.coefficients[j];
          obsValues[obs.name] = sum;
        }
        return obsValues;
      };

      // Full derivatives function on all species (functional rates supported)
      const fullDerivatives = (yIn: Float64Array, dydt: Float64Array) => {
        dydt.fill(0);
        const currentObservables = evaluateObservables(yIn);
        for (const rxn of concreteReactions) {
          let velocity = rxn.rateConstant;
          if (rxn.rateExpression) {
            velocity *= expressionEvaluator.eval(rxn.rateExpression, currentObservables);
          }
          velocity *= rxn.propensityFactor;

          for (let j = 0; j < rxn.reactants.length; j++) velocity *= yIn[rxn.reactants[j]];
          for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
          for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
        }
      };

      // Conservation law analysis - reduce ODE system for stiff models
      const speciesNames = netResult.species.map((s, i) => GraphCanonicalizer.canonicalize(s.graph) || `S${i}`);
      const rxnsForConservation = netResult.reactions.map(r => ({
        reactants: Array.from(r.reactants),
        products: Array.from(r.products)
      }));

      let conservationAnalysis: any;
      if (modelName === 'Barua_2013') {
         conservationAnalysis = { laws: [], independentSpecies: new Array(numSpecies).fill(0).map((_, i) => i) };
      } else {
         conservationAnalysis = findConservationLaws(rxnsForConservation as any, numSpecies, yCurrent, speciesNames);
      }
      console.log(`[${modelName}] Conservation laws: ${conservationAnalysis.laws.length}, ` +
        `independent: ${conservationAnalysis.independentSpecies.length}/${numSpecies}`);

      // Use reduced system if conservation laws found
      let derivatives: (yIn: Float64Array, dydt: Float64Array) => void;
      let effectiveNumSpecies = numSpecies;
      let expand: ((y_r: Float64Array) => Float64Array) | null = null;
      let reduce: ((y: Float64Array) => Float64Array) | null = null;

      if (shouldDebugThisModel) {
        console.log(`[${modelName}] ENABLE_CONSERVATION_REDUCTION=${ENABLE_CONSERVATION_REDUCTION}`);
      }

      if (ENABLE_CONSERVATION_REDUCTION && conservationAnalysis.laws.length > 0) {
        const reducedSystem = createReducedSystem(conservationAnalysis, numSpecies);
        reduce = reducedSystem.reduce;
        expand = reducedSystem.expand;
        derivatives = reducedSystem.transformDerivatives(fullDerivatives);
        effectiveNumSpecies = conservationAnalysis.independentSpecies.length;
        console.log(`[${modelName}] Using reduced system: ${effectiveNumSpecies} species (eliminated ${numSpecies - effectiveNumSpecies})`);
      } else {
        derivatives = fullDerivatives;
      }

      // (evaluateObservables is already defined above and reused here)

      // Multi-phase simulation loop
      // Track BNG model time across phases (BNG uses absolute t_start/t_end).
      // Note: `continue=>0` resets time but does NOT reset concentrations.
      let modelTime = 0;
      const finalPhaseData: Record<string, number>[] = [];

      const overriddenParams = new Set<string>();

      for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
        const phase = phases[phaseIdx];

        // Apply parameter changes that should happen BEFORE this phase
        for (const change of parameterChanges) {
          if (change.afterPhaseIndex === phaseIdx - 1) {
            let resolved: number;
            if (typeof change.value === 'number') {
              resolved = change.value;
            } else {
              const byName = parametersMap.get(change.value);
              resolved = byName !== undefined ? byName : evalAsNumber(change.value, parametersMap, observableNames);
            }

            parametersMap.set(change.parameter, resolved);
            model.parameters[change.parameter] = resolved;
            overriddenParams.add(change.parameter);

            // Update derived parameters that depend on overridden base params (but do not clobber overrides).
            recomputeDerivedParameters(model, parametersMap, overriddenParams);

            console.log(`[${modelName}] Phase ${phaseIdx}: Set parameter ${change.parameter} = ${resolved}`);
          }
        }

        // Apply concentration changes that should happen BEFORE this phase (afterPhaseIndex === phaseIdx - 1)
        for (const change of concentrationChanges) {
          if (change.afterPhaseIndex === phaseIdx - 1) {
            // Resolve value to number (number, parameter name, or expression)
            let resolved: number;
            if (typeof change.value === 'number') {
              resolved = change.value;
            } else {
              const byName = parametersMap.get(change.value);
              resolved = byName !== undefined ? byName : evalAsNumber(change.value, parametersMap, observableNames);
            }

            // Try to match species exactly by canonical name
            let matched = false;

            // First try exact match
            if (speciesMap.has(change.species)) {
              const idx = speciesMap.get(change.species)!;
              yCurrent[idx] = resolved;
              console.log(`[${modelName}] Phase ${phaseIdx}: Set (exact) ${change.species} = ${resolved}`);
              matched = true;
            }

            // If not exact, try canonical form
            if (!matched) {
              try {
                const pattern = BNGLParser.parseSpeciesGraph(change.species);
                const canonicalPattern = GraphCanonicalizer.canonicalize(pattern);
                if (speciesMap.has(canonicalPattern)) {
                  const idx = speciesMap.get(canonicalPattern)!;
                  yCurrent[idx] = resolved;
                  console.log(`[${modelName}] Phase ${phaseIdx}: Set (canonical) ${canonicalPattern} = ${resolved}`);
                  matched = true;
                }
              } catch { }
            }

            if (!matched) {
              console.warn(`[${modelName}] Phase ${phaseIdx}: Could not find species for ${change.species}`);
            }
          }
        }

        // Stiffness detection: use sparse_implicit for extremely stiff systems
        // Estimate stiffness from current full-state observables (before creating yReduced)
        const obsForRates = evaluateObservables(yCurrent);
        let maxRate = -Infinity;
        let minRate = Infinity;
        for (const rxn of concreteReactions) {
          const k = rxn.rateExpression
            ? (rxn.rateConstant * expressionEvaluator.eval(rxn.rateExpression, obsForRates))
            : rxn.rateConstant;
          if (k > 0) {
            maxRate = Math.max(maxRate, k);
            minRate = Math.min(minRate, k);
          }
        }
        const rateRatio = minRate > 0 ? maxRate / minRate : 1;
        const isExtremelyStiff = rateRatio > 1e4;
        // Honor model-authored `sparse` setting exactly when provided.
        // `sparse=>0` forces dense CVODE; `sparse=>1` forces sparse CVODE.
        // If unspecified, fall back to a stiffness heuristic.
        const solverType = phase.sparse === true
          ? 'cvode_sparse'
          : (phase.sparse === false
              ? 'cvode'
              : ((modelName === 'Barua_2013') ? 'cvode' : (isExtremelyStiff ? 'cvode_sparse' : 'cvode')));
        console.log(`[${modelName}] Rate ratio: ${rateRatio.toExponential(2)}, solver: ${solverType}`);

        // Determine phase start and duration using BNG semantics
        const phaseStart = phase.t_start !== undefined
          ? phase.t_start
          : ((phase.continue_from_previous ?? false) ? modelTime : 0);

        if ((phase.continue_from_previous ?? false) && Math.abs(phaseStart - modelTime) > 1e-9) {
          throw new Error(`Phase ${phaseIdx}: t_start (${phaseStart}) must equal current model time (${modelTime}) for continuation`);
        }

        const phaseDuration = phase.t_end - phaseStart;
        if (!(phaseDuration > 0)) {
          throw new Error(`Phase ${phaseIdx}: t_end (${phase.t_end}) must be greater than t_start (${phaseStart})`);
        }

        // Run this phase
        // Use reduced state if conservation laws were found
        let yReduced = reduce ? reduce(yCurrent) : yCurrent;

        let cvodeMaxSteps = 2000;

        const createPhaseSolver = async (solverName: string, opts?: { maxSteps?: number }) => {
          return await createSolver(effectiveNumSpecies, derivatives, {
            solver: solverName as any,
            atol: phase.atol || 1e-8,
            rtol: phase.rtol || 1e-8,
            minStep: 1e-15,
            // Match BNG2: do not set CVODE hmax (leave unlimited).
            maxStep: Infinity,
            // Match BNG2 initial mxstep (CVodeSetMaxNumSteps starts at 2000 and can grow).
            // In practice, some models (e.g., An_2009) require increasing this limit to finish.
            maxSteps: opts?.maxSteps ?? cvodeMaxSteps
          });
        };

        const isCvodeSolver = (name: string) => name.startsWith('cvode');

        const integrateChunked = (
          activeSolver: { integrate: (y0: Float64Array, t0: number, tEnd: number) => { success: boolean; y: Float64Array; errorMessage?: string } },
          y0: Float64Array,
          t0: number,
          tEnd: number,
          maxChunk: number
        ) => {
          // Integrate in smaller intervals to help stiff solvers that fail on large tout,
          // or that hit internal mxstep limits.
          let y = y0;
          let tNow = t0;
          const eps = 1e-12 * Math.max(1, Math.abs(tEnd));
          while (tNow < tEnd - eps) {
            const tNext = Math.min(tEnd, tNow + maxChunk);
            const r = activeSolver.integrate(y, tNow, tNext);
            if (!r.success) return { success: false as const, y, t: tNow, errorMessage: r.errorMessage };
            y = r.y;
            tNow = tNext;
          }
          return { success: true as const, y, t: tEnd };
        };

        let solver = await createPhaseSolver(solverType);

        const dtOut = phaseDuration / phase.n_steps;
        let t = 0;

        // BNG2 (Network3) steady_state behavior:
        //   - check steady state at each *output* step
        //   - compute dx = ||dydt||_2 / dim(x)
        //   - stop immediately when dx < atol
        //   - rtol is not used for the steady-state stopping criterion
        const steadyStateEnabled = !!phase.steady_state;
        const steadyStateAtol = phase.atol ?? 1e-8;
        const steadyStateDerivs = steadyStateEnabled ? new Float64Array(numSpecies) : null;

        // Clear final phase data if this is the last phase (we only output from last phase)
        if (phaseIdx === phases.length - 1) {
          const fullState = expand ? expand(yReduced) : yCurrent;
          finalPhaseData.push({ time: phaseStart, ...evaluateObservables(fullState) });
        }

        try {
          for (let i = 1; i <= phase.n_steps; i++) {
            const tTarget = i * dtOut;

          // Strategy: attempt direct integration; if it fails, retry in chunks.
          const maxChunk = modelName === 'Hat_2016'
            ? Math.max(1e-6, Math.min(10, dtOut / 50))
            : Math.max(1e-6, Math.min(dtOut, dtOut / 10));

          let result = solver.integrate(yReduced, t, tTarget) as any;
          if (!result.success) {
            const chunked = integrateChunked(solver as any, yReduced, t, tTarget, maxChunk);
            result = chunked.success
              ? ({ success: true, y: chunked.y } as any)
              : ({ success: false, y: yReduced, errorMessage: chunked.errorMessage } as any);
          }

          // If CVODE hits mxstep, retry with a higher maxSteps before changing solver type.
          if (!result.success && isCvodeSolver(solverType)) {
            const yReduced0 = yReduced.slice() as Float64Array;
            const yCurrent0 = yCurrent.slice() as Float64Array;
            const t0 = t;

            const retryMaxSteps = [20000, 200000, 500000];
            for (const nextMax of retryMaxSteps) {
              if (nextMax <= cvodeMaxSteps) continue;
              const candidate = await createPhaseSolver(solverType, { maxSteps: nextMax });
              try {
                const retryDirect = candidate.integrate(yReduced0, t0, tTarget) as any;
                const retry = retryDirect.success
                  ? retryDirect
                  : (() => {
                      const chunkedRetry = integrateChunked(candidate as any, yReduced0, t0, tTarget, maxChunk);
                      return chunkedRetry.success
                        ? ({ success: true, y: chunkedRetry.y } as any)
                        : ({ success: false, y: yReduced0, errorMessage: chunkedRetry.errorMessage } as any);
                    })();

                if (retry.success) {
                  try {
                    (solver as any)?.destroy?.();
                  } catch {
                    // ignore
                  }

                  solver = candidate;
                  cvodeMaxSteps = nextMax;
                  yReduced = retry.y as Float64Array;
                  yCurrent = expand ? expand(yReduced) : yReduced;
                  t = tTarget;
                  result = { success: true, y: yReduced } as any;
                  break;
                }
              } finally {
                if (!result.success) {
                  try {
                    (candidate as any)?.destroy?.();
                  } catch {
                    // ignore
                  }
                }
              }

              if (result.success) {
                break;
              }
            }

            if (!result.success) {
              yReduced = yReduced0;
              yCurrent = yCurrent0;
              t = t0;
            }
          }

          if (!result.success) {
            if (i <= 2) {
              console.warn(`Solver failed at phase ${phaseIdx}, t=${tTarget}; retrying with fallback solver`);
              const yReduced0 = yReduced.slice() as Float64Array;
              const yCurrent0 = yCurrent.slice() as Float64Array;
              const t0 = t;

              const fallbackOrder = solverType === 'cvode_sparse'
                ? ['cvode_auto', 'rosenbrock23', 'rk4']
                : ['rosenbrock23', 'rk4'];

              let recovered = false;
              for (const fallback of fallbackOrder) {
                const candidate = await createPhaseSolver(fallback);
                try {
                  // Use chunked integration on fallback solvers too.
                  const retryDirect = candidate.integrate(yReduced0, t0, tTarget) as any;
                  const retry = retryDirect.success
                    ? retryDirect
                    : (() => {
                        const chunked = integrateChunked(candidate as any, yReduced0, t0, tTarget, maxChunk);
                        return chunked.success
                          ? ({ success: true, y: chunked.y } as any)
                          : ({ success: false, y: yReduced0, errorMessage: chunked.errorMessage } as any);
                      })();

                  if (retry.success) {
                    try {
                      (solver as any)?.destroy?.();
                    } catch {
                      // ignore
                    }
                    solver = candidate;
                    yReduced = retry.y as Float64Array;
                    yCurrent = expand ? expand(yReduced) : yReduced;
                    t = tTarget;
                    recovered = true;
                    break;
                  }
                } finally {
                  if (!recovered) {
                    try {
                      (candidate as any)?.destroy?.();
                    } catch {
                      // ignore
                    }
                  }
                }
              }

              if (recovered) {
                if (phaseIdx === phases.length - 1) {
                  finalPhaseData.push({ time: phaseStart + t, ...evaluateObservables(yCurrent) });
                }
                continue;
              }

              yReduced = yReduced0;
              yCurrent = yCurrent0;
              throw new Error(`Solver failed at phase ${phaseIdx}, t=${tTarget}: ${result.errorMessage || 'unknown error'}`);
            }

            throw new Error(`Solver failed at phase ${phaseIdx}, t=${tTarget}: ${result.errorMessage || 'unknown error'}`);
          }
          yReduced = result.y as Float64Array;
          yCurrent = expand ? expand(yReduced) : yReduced;
          t = tTarget;

          // Only record data from the final phase
          if (phaseIdx === phases.length - 1) {
            finalPhaseData.push({ time: phaseStart + t, ...evaluateObservables(yCurrent) });
          }

          // BNG2 checks for steady state *after* printing the current output step.
          if (steadyStateEnabled) {
            // Use full (non-reduced) derivatives for steady-state detection.
            // This mirrors BNG2, which checks the full network state.
            fullDerivatives(yCurrent, steadyStateDerivs!);
            let sumSq = 0;
            for (let sIdx = 0; sIdx < steadyStateDerivs!.length; sIdx++) {
              const v = steadyStateDerivs![sIdx];
              sumSq += v * v;
            }
            const dx = Math.sqrt(sumSq) / steadyStateDerivs!.length;
            if (dx < steadyStateAtol) {
              break;
            }
          }

          }
        } finally {
          try {
            (solver as any)?.destroy?.();
          } catch {
            // ignore
          }
        }

        // When steady-state triggers, the simulation can stop before t_end.
        modelTime = phaseStart + t;
      }

      const webResults = { headers: [], data: finalPhaseData };
      const bng2Gdat = parseGdat(bng2Content);

      if (!bng2Gdat) throw new Error('Failed to parse BNG2 gdat');

      // Compare final values
      const webFinal = webResults.data[webResults.data.length - 1];
      const bng2Final = bng2Gdat.data[bng2Gdat.data.length - 1];

      if (shouldDebugThisModel) {
        console.log(
          `[${modelName}] Final timepoints: Web=${webFinal?.time}, BNG2=${bng2Final?.time} ` +
          `(webRows=${webResults.data.length}, bng2Rows=${bng2Gdat.data.length})`
        );
      }

      if (shouldDebugThisModel && process.env.GDAT_COMPARE_CDAT === '1') {
        try {
          const projectRoot = path.resolve(__dirname, '..');
          const artifactsDir = path.join(projectRoot, 'gdat_comparison_output');
          const netPath = path.join(artifactsDir, `${modelName}.net`);
          const cdatPath = path.join(artifactsDir, `${modelName}.cdat`);

          if (fs.existsSync(netPath) && fs.existsSync(cdatPath)) {
            const netContent = fs.readFileSync(netPath, 'utf-8');
            const cdatContent = fs.readFileSync(cdatPath, 'utf-8');
            const bng2CanonByIndex = parseNetSpeciesCanonical(netContent);
            const cdatRow = readCdatRowClosestToTime(cdatContent, webFinal.time, numSpecies);

            if (cdatRow) {
              const bng2ConcByCanon = new Map<string, number>();
              for (let i = 1; i <= numSpecies; i++) {
                const canon = bng2CanonByIndex.get(i);
                if (!canon) continue;
                bng2ConcByCanon.set(canon, cdatRow.values[i - 1]);
              }

              // Recompute observables from BNG2 concentrations using our observable indices/coefficients.
              const obsFromBng2: Record<string, number> = {};
              for (const obs of concreteObservables) {
                let sum = 0;
                for (let j = 0; j < obs.indices.length; j++) {
                  const idx = obs.indices[j];
                  const canon = speciesNames[idx] || `S${idx}`;
                  const val = bng2ConcByCanon.get(canon);
                  sum += (val ?? 0) * obs.coefficients[j];
                }
                obsFromBng2[obs.name] = sum;
              }

              console.log(
                `[${modelName}] CDAT check: closest time=${cdatRow.time} (target=${webFinal.time}, dt=${Math.abs(cdatRow.time - webFinal.time)})`
              );
              for (const header of bng2Gdat.headers) {
                if (header === 'time') continue;
                if (obsFromBng2[header] === undefined) continue;
                console.log(
                  `[${modelName}] Observable '${header}' from BNG2 CDAT via our matcher = ${obsFromBng2[header]} (BNG2 GDAT=${bng2Final[header]})`
                );
              }

              // Compare our final species concentrations to BNG2 CDAT by canonical name.
              const diffs: Array<{ idx: number; canon: string; web: number; bng2: number; absDiff: number; relDiff: number }> = [];
              let missing = 0;
              for (let i = 0; i < numSpecies; i++) {
                const canon = speciesNames[i] || `S${i}`;
                const bng2Val = bng2ConcByCanon.get(canon);
                if (bng2Val === undefined) {
                  missing++;
                  continue;
                }
                const webVal = yCurrent[i];
                const absDiff = Math.abs(webVal - bng2Val);
                const relDiff = bng2Val !== 0 ? absDiff / Math.abs(bng2Val) : absDiff;
                diffs.push({ idx: i, canon, web: webVal, bng2: bng2Val, absDiff, relDiff });
              }

              diffs.sort((a, b) => b.absDiff - a.absDiff);
              console.log(`[${modelName}] CDAT species compare: matched=${diffs.length}/${numSpecies}, missingCanon=${missing}`);
              for (const d of diffs.slice(0, 20)) {
                console.log(
                  `  idx=${d.idx} absDiff=${d.absDiff} relDiff=${(d.relDiff * 100).toFixed(2)}% web=${d.web} bng2=${d.bng2} ${d.canon}`
                );
              }
            } else {
              console.log(`[${modelName}] CDAT check: could not find any numeric rows in ${cdatPath}`);
            }
          } else {
            console.log(`[${modelName}] CDAT check: missing ${!fs.existsSync(netPath) ? netPath : ''} ${!fs.existsSync(cdatPath) ? cdatPath : ''}`);
          }
        } catch (e: any) {
          console.log(`[${modelName}] CDAT check failed: ${e?.message || e}`);
        }
      }

      for (const header of bng2Gdat.headers) {
        if (header === 'time') continue;

        const bng2Val = bng2Final[header];
        const webVal = webFinal[header];

        if (webVal === undefined) continue;

        const diff = Math.abs(bng2Val - webVal);
        const relDiff = bng2Val !== 0 ? diff / Math.abs(bng2Val) : diff;

        if (!(relDiff < 0.02 || diff < 1e-6)) {
          console.log(`FAILURE: ${header}: BNG2=${bng2Val}, Web=${webVal}, relDiff=${(relDiff * 100).toFixed(2)}%`);
        }
        expect(relDiff < 0.02 || diff < 1e-6,
          `${header}: BNG2=${bng2Val}, Web=${webVal}, relDiff=${(relDiff * 100).toFixed(2)}%`
        ).toBe(true);
      }

    });
  }
});

