import {
  buildSymbolicODESystem,
  exprToString,
  substitute,
  symVar,
  countPatternMatches,
  isSpeciesMatch,
  splitObservablePatterns,
  generateExpandedNetwork,
  type SymbolicODESystem,
  type SymExpr,
} from '@bngplayground/engine';
import { BNGLModel } from '../types';

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return String(v);
}

const speciesVarName = (i: number) => `S${i + 1}`;

// ---------------------------------------------------------------------------
// symbolicODEToXPP: mass-action symbolic path (kept for the exportODE tests and
// as a fallback). Renders a pre-built SymbolicODESystem to XPPAUT text.
// ---------------------------------------------------------------------------
export function symbolicODEToXPP(system: SymbolicODESystem, modelName: string, warnings: string[] = []): string {
  const { speciesNames, parameterNames, parameterValues, rhs, initialConcentrations } = system;

  const renderedRhs = rhs.map((expr: SymExpr) => {
    let e = expr;
    speciesNames.forEach((sp, i) => {
      e = substitute(e, sp, symVar(speciesVarName(i)));
    });
    return exprToString(e);
  });

  const lines: string[] = [];
  lines.push(`# ${modelName}.ode`);
  lines.push('# ODE system exported by BNG Playground (mass-action).');
  lines.push('#');
  if (warnings.length > 0) {
    lines.push('# !! WARNING - this export may not match the simulator for this model:');
    warnings.forEach((w) => lines.push(`#   - ${w}`));
    lines.push('#');
  }
  lines.push('# ---- Species legend ----');
  speciesNames.forEach((sp, i) => lines.push(`#   ${speciesVarName(i)} = ${sp}`));
  lines.push('');
  lines.push('# ---- Parameters ----');
  if (parameterNames.length === 0) lines.push('# (no named parameters)');
  else parameterNames.forEach((name, i) => lines.push(`par ${name}=${fmtNum(parameterValues?.[i] ?? 0)}`));
  lines.push('');
  lines.push('# ---- Initial conditions ----');
  speciesNames.forEach((_, i) => lines.push(`init ${speciesVarName(i)}=${fmtNum(initialConcentrations[i] ?? 0)}`));
  lines.push('');
  lines.push('# ---- ODEs ----');
  renderedRhs.forEach((r, i) => lines.push(`d${speciesVarName(i)}/dt=${r}`));
  lines.push('');
  lines.push('done');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Expression helpers for the full exporter.
// ---------------------------------------------------------------------------

// XPPAUT built-in functions / constants that must be left untouched.
const XPP_BUILTINS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'exp', 'log', 'log10', 'ln', 'sqrt', 'abs', 'sign', 'heav', 'floor', 'flr',
  'ceil', 'mod', 'max', 'min', 'pi', 'if', 'then', 'else', 'not', 'and', 'or',
  'besselj', 'bessely', 'erf', 'erfc', 'gamma', 'pow', 't',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace a whole-word identifier token throughout an expression. */
function substituteToken(expr: string, oldName: string, newName: string): string {
  return expr.replace(new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g'), newName);
}

/**
 * Inline zero-argument functions: replace every `f()` with `(body)`, recursively.
 * XPP has no zero-arg user functions, and this is exactly how the simulator
 * evaluates such a rate (it looks up the function and evaluates its body), so
 * inlining is semantically identical and keeps the .ode valid.
 */
function inlineZeroArgFunctions(expr: string, funcByName: Map<string, ExportFunction>): string {
  let e = expr;
  for (let pass = 0; pass < 25; pass++) {
    let changed = false;
    for (const [name, fn] of funcByName) {
      if ((fn.args?.length ?? 0) !== 0) continue;
      const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(\\s*\\)`, 'g');
      if (re.test(e)) { e = e.replace(re, `(${fn.expression})`); changed = true; }
    }
    if (!changed) break;
  }
  return e;
}

interface IdContext {
  paramSet: Set<string>;
  obsByName: Map<string, ExportObservable>;
  funcByName: Map<string, ExportFunction>;
  speciesVarSet: Set<string>;
  localArgs?: Set<string>;
  usedObservables: Set<string>;
  usedFunctions: Set<string>;
  unknownIdentifiers: Set<string>;
}

/**
 * Walk an expression, classifying each identifier. Records observables and
 * functions actually referenced, and flags any identifier we cannot account
 * for (so a bad export is reported rather than silently produced).
 */
function collectIdentifiers(expr: string, ctx: IdContext): void {
  const re = /([A-Za-z_]\w*)\s*(\()?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const id = m[1];
    const isCall = m[2] === '(';
    if (XPP_BUILTINS.has(id) || XPP_BUILTINS.has(id.toLowerCase())) continue;
    if (ctx.localArgs && ctx.localArgs.has(id)) continue;
    if (isCall) {
      if (ctx.funcByName.has(id)) ctx.usedFunctions.add(id);
      else ctx.unknownIdentifiers.add(`${id}()`);
      continue;
    }
    if (ctx.speciesVarSet.has(id)) continue;
    if (ctx.paramSet.has(id)) continue;
    if (ctx.obsByName.has(id)) { ctx.usedObservables.add(id); continue; }
    if (ctx.funcByName.has(id)) { ctx.usedFunctions.add(id); continue; }
    ctx.unknownIdentifiers.add(id);
  }
}

interface ExportObservable {
  type: string;
  name: string;
  pattern: string;
  countFilter?: number;
  countRelation?: string;
}

interface ExportFunction {
  name: string;
  args?: string[];
  expression: string;
}

interface ExportCompartment {
  name: string;
  dimension?: number;
  size?: number;
  resolvedVolume?: number;
}

/** Compartment name from a species/pattern string: "@Comp:X" or "X@Comp". */
function compartmentOf(name: string): string | null {
  if (name.startsWith('@')) {
    const colonIdx = name.indexOf(':');
    if (colonIdx > 0) return name.substring(1, colonIdx);
  }
  const atIdx = name.lastIndexOf('@');
  if (atIdx !== -1 && atIdx < name.length - 1) return name.slice(atIdx + 1).trim();
  return null;
}

function relationHolds(rel: string, x: number, q: number): boolean | null {
  switch (rel) {
    case '>': return x > q;
    case '<': return x < q;
    case '>=': case '=>': return x >= q;
    case '<=': case '=<': return x <= q;
    case '==': case '=': return x === q;
    case '!=': case '<>': return x !== q;
    default: return null;
  }
}

/**
 * Per-species weights for an observable, matching the simulator's observable in
 * the concentration-space ODE branch: molecule/species counts (via the engine's
 * own matcher over comma-split patterns), amount-weighted by compartment volume,
 * with any count filter applied statically per expanded species.
 */
function observableWeights(
  obs: ExportObservable,
  speciesNames: string[],
  speciesVol: number[],
  onUnknownRelation: (name: string, rel: string) => void,
): Map<number, number> {
  const weights = new Map<number, number>();
  const asSpecies = obs.type === 'species';
  const patterns = splitObservablePatterns(obs.pattern);
  const hasFilter = obs.countFilter !== undefined && obs.countFilter !== null;
  const rel = obs.countRelation || '>';
  const q = Number(obs.countFilter);

  for (let i = 0; i < speciesNames.length; i++) {
    // Molecule match count across the comma-split patterns.
    let matchCount = 0;
    for (const p of patterns) matchCount += countPatternMatches(speciesNames[i], p);

    let included: boolean;
    if (hasFilter) {
      const ok = relationHolds(rel, matchCount, q);
      if (ok === null) { onUnknownRelation(obs.name, rel); included = matchCount > 0; }
      else included = ok;
    } else if (asSpecies) {
      // No filter, species type: presence per the simulator's species matcher.
      included = patterns.some((p) => isSpeciesMatch(speciesNames[i], p));
    } else {
      included = matchCount > 0;
    }
    if (!included) continue;

    const base = asSpecies ? 1 : matchCount;
    const w = base * speciesVol[i]; // amount weighting (vol = 1 for unit-volume models)
    if (w !== 0) weights.set(i, w);
  }
  return weights;
}

function renderObservableRhs(weights: Map<number, number>): string {
  const entries = [...weights.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return '0';
  return entries
    .map(([i, w]) => (w === 1 ? speciesVarName(i) : `${fmtNum(w)}*${speciesVarName(i)}`))
    .join('+');
}

// ---------------------------------------------------------------------------
// exportModelToODE: full exporter. Builds the ODE right-hand side directly from
// the network-expanded reactions, matching the simulator's concentration-space
// ODE flux exactly:
//
//   velocity = rate * propensityFactor * degeneracy * vAnchor
//              * PROD_reactants( conc_j * vol_j / vAnchor )
//   d[conc_i]/dt = SUM_r netStoich_r[i] * velocity_r / vol_i
//
// where vol_i is the species' compartment volume, vAnchor is the reaction's
// reacting volume (declared scalingVolume, else the lowest-dimension reactant
// compartment's volume), and rate is the mass-action constant/expression or,
// for a functional reaction, the (macro-expanded) rate expression whose reactant
// placeholders (ridx0, ...) and observables are taken in amount units — matching
// the simulator's rate context in the concentration-space branch. TotalRate is
// ignored for ODEs, as in the simulator.
// ---------------------------------------------------------------------------
export async function exportModelToODE(
  model: BNGLModel,
  modelName: string,
  expandNetwork?: (m: BNGLModel) => Promise<BNGLModel>,
): Promise<string> {
  const hasReactions = (model.reactions?.length ?? 0) > 0;
  const expand = expandNetwork ?? ((m: BNGLModel) => generateExpandedNetwork(m, () => {}, () => {}));
  const gen = hasReactions ? model : await expand(model);

  const species = gen.species ?? [];
  const speciesNames = species.map((s) => s.name);
  const speciesIsConstant = species.map((s) => !!(s as { isConstant?: boolean }).isConstant);
  const speciesIndex = new Map<string, number>(speciesNames.map((n, i) => [n, i]));
  const speciesVarSet = new Set<string>(speciesNames.map((_, i) => speciesVarName(i)));
  const initialConcentrations = species.map((s) => (s as { initialConcentration?: number }).initialConcentration ?? 0);

  const reactions = (gen.reactions ?? []) as Array<{
    reactants?: string[];
    products?: string[];
    rate?: string | number;
    rateConstant?: number;
    isFunctionalRate?: boolean;
    rateExpression?: string | null;
    degeneracy?: number;
    propensityFactor?: number;
    productStoichiometries?: number[] | null;
    scalingVolume?: number | null;
  }>;

  const params = (gen.parameters ?? model.parameters ?? {}) as Record<string, number>;
  const parameterNames = Object.keys(params);
  const paramSet = new Set(parameterNames);

  const observables = (gen.observables ?? []) as ExportObservable[];
  const obsByName = new Map<string, ExportObservable>(observables.map((o) => [o.name, o]));
  const functions = (gen.functions ?? []) as ExportFunction[];
  const funcByName = new Map<string, ExportFunction>(functions.map((f) => [f.name, f]));

  // ---- Compartment volumes (matches the simulator) ----
  const compartments = (gen.compartments ?? model.compartments ?? []) as ExportCompartment[];
  const compVol = new Map<string, number>();
  const compDim = new Map<string, number>();
  for (const c of compartments) {
    compVol.set(c.name, c.resolvedVolume ?? c.size ?? 1);
    compDim.set(c.name, c.dimension ?? 3);
  }
  const speciesVol = speciesNames.map((n) => {
    const c = compartmentOf(n);
    return c && compVol.has(c) ? compVol.get(c)! : 1;
  });
  const usesVolumeScaling = speciesVol.some((v) => Math.abs(v - 1) > 1e-15)
    || [...compVol.values()].some((v) => Math.abs(v - 1) > 1e-15);

  const reactionVAnchor = (r: { reactants?: string[]; products?: string[]; scalingVolume?: number | null }): number => {
    const sv = r.scalingVolume;
    if (typeof sv === 'number' && Number.isFinite(sv) && sv > 0) return sv;
    const candidates = (r.reactants && r.reactants.length > 0) ? r.reactants : (r.products ?? []);
    let vAnchor = 1;
    let minDim = Number.POSITIVE_INFINITY;
    for (const name of candidates) {
      const c = compartmentOf(name);
      if (c && compDim.has(c)) {
        const dim = compDim.get(c)!;
        if (dim < minDim) { minDim = dim; vAnchor = compVol.get(c) ?? 1; }
      } else if (3 < minDim) {
        minDim = 3; vAnchor = 1;
      }
    }
    return vAnchor;
  };

  const warnings: string[] = [];
  const usedObservables = new Set<string>();
  const usedFunctions = new Set<string>();
  const unknownIdentifiers = new Set<string>();
  const unknownRelations = new Set<string>();
  let timeDependent = false;

  // Per-species RHS terms: { coeff, velocity }.
  const rhsTerms: Array<Array<{ coeff: number; velocity: string }>> = speciesNames.map(() => []);

  for (const r of reactions) {
    const reactantIdx: number[] = [];
    for (const name of r.reactants ?? []) {
      const idx = speciesIndex.get(name);
      if (idx !== undefined) reactantIdx.push(idx);
    }

    // Net stoichiometry: -1 per reactant instance, +stoich per product instance.
    const net = new Map<number, number>();
    for (const i of reactantIdx) net.set(i, (net.get(i) ?? 0) - 1);
    (r.products ?? []).forEach((name, j) => {
      const idx = speciesIndex.get(name);
      if (idx === undefined) return;
      const s = r.productStoichiometries ? (r.productStoichiometries[j] ?? 1) : 1;
      net.set(idx, (net.get(idx) ?? 0) + s);
    });

    // Volume scaling constant: vAnchor^(1 - N) * PROD(reactant volumes).
    const nReact = reactantIdx.length;
    const vAnchor = reactionVAnchor(r);
    const reactantVolProduct = reactantIdx.reduce((acc, i) => acc * speciesVol[i], 1);
    const volConst = Math.pow(vAnchor, 1 - nReact) * reactantVolProduct;
    const preFactor = (Number(r.propensityFactor) || 1) * (Number(r.degeneracy) || 1);

    // Rate factor (symbolic where possible; observables/species in amount units).
    let rateFactor: string;
    if (r.isFunctionalRate && r.rateExpression) {
      let expr = String(r.rateExpression);
      for (let j = reactantIdx.length - 1; j >= 0; j--) {
        const vi = speciesVol[reactantIdx[j]];
        const amountVar = vi === 1 ? speciesVarName(reactantIdx[j]) : `(${fmtNum(vi)}*${speciesVarName(reactantIdx[j])})`;
        expr = substituteToken(expr, `ridx${j}`, amountVar);
      }
      if (/\btime\b/.test(expr)) { expr = substituteToken(expr, 'time', 't'); timeDependent = true; }
      expr = inlineZeroArgFunctions(expr, funcByName);
      rateFactor = `(${expr})`;
      collectIdentifiers(expr, { paramSet, obsByName, funcByName, speciesVarSet, usedObservables, usedFunctions, unknownIdentifiers });
    } else {
      const rateStr = String(r.rate ?? '').trim();
      rateFactor = rateStr.length > 0 ? rateStr : fmtNum(Number(r.rateConstant) || 0);
      collectIdentifiers(rateFactor, { paramSet, obsByName, funcByName, speciesVarSet, usedObservables, usedFunctions, unknownIdentifiers });
    }

    // Intrinsic velocity = rateFactor * PROD(reactant concentrations). All numeric
    // factors (preFactor, volConst, netStoich, 1/vol_i) fold into the per-term coeff.
    const reactantProduct = reactantIdx.map((i) => speciesVarName(i)).join('*');
    const velocity = reactantProduct.length > 0 ? `${rateFactor}*${reactantProduct}` : rateFactor;

    for (const [i, c] of net.entries()) {
      if (speciesIsConstant[i]) continue; // clamped species: dS/dt = 0 (matches simulator)
      const coeff = (c * preFactor * volConst) / speciesVol[i];
      if (coeff !== 0) rhsTerms[i].push({ coeff, velocity });
    }
  }

  // Resolve observables/functions reachable through function bodies.
  const funcQueue = [...usedFunctions];
  const seenFns = new Set<string>();
  while (funcQueue.length > 0) {
    const fname = funcQueue.shift()!;
    if (seenFns.has(fname)) continue;
    seenFns.add(fname);
    const fn = funcByName.get(fname);
    if (!fn) continue;
    const inlinedBody = inlineZeroArgFunctions(fn.expression, funcByName);
    if (/\btime\b/.test(inlinedBody)) timeDependent = true;
    const before = usedFunctions.size;
    collectIdentifiers(inlinedBody, {
      paramSet, obsByName, funcByName, speciesVarSet,
      localArgs: new Set(fn.args ?? []),
      usedObservables, usedFunctions, unknownIdentifiers,
    });
    if (usedFunctions.size > before) funcQueue.push(...usedFunctions);
  }

  // Diagnostics.
  const onUnknownRelation = (name: string, rel: string) => unknownRelations.add(`${name}:'${rel}'`);
  if (timeDependent) {
    warnings.push("A rate depends on simulation time; it uses XPP's independent variable t. Note the network ODE path does not itself carry explicit time, so verify the intent.");
  }
  if (unknownIdentifiers.size > 0) {
    warnings.push(`Rate expressions reference symbol(s) this exporter could not resolve to a parameter, observable, function, or species: ${[...unknownIdentifiers].sort().join(', ')}. The ODEs above may be incomplete for those reactions.`);
  }

  // Render per-species RHS.
  const renderedRhs = rhsTerms.map((terms) => {
    if (terms.length === 0) return '0';
    let out = '';
    for (const t of terms) {
      const mag = Math.abs(t.coeff);
      const sign = t.coeff < 0 ? '-' : '+';
      const magStr = mag === 1 ? '' : `${fmtNum(mag)}*`;
      out += `${sign}${magStr}(${t.velocity})`;
    }
    return out.startsWith('+') ? out.slice(1) : out;
  });

  // Build observable fixed-variable definitions (also captures unknown relations).
  const emittedObs = [...usedObservables].filter((n) => obsByName.has(n)).sort();
  const obsDefs = emittedObs.map((name) => {
    const o = obsByName.get(name)!;
    return `${name}=${renderObservableRhs(observableWeights(o, speciesNames, speciesVol, onUnknownRelation))}`;
  });
  if (unknownRelations.size > 0) {
    warnings.push(`Observable count filter uses an unrecognized relation (${[...unknownRelations].join(', ')}); those observables were written without the filter.`);
  }

  if (warnings.length > 0) console.warn('[exportModelToODE] ' + warnings.join(' '));

  // ---- Assemble XPPAUT text ----
  const lines: string[] = [];
  lines.push(`# ${modelName}.ode`);
  lines.push('# ODE system exported by BNG Playground.');
  lines.push('# Built directly from the network-expanded reactions, matching the flux the');
  lines.push('# simulator integrates (concentration space):');
  lines.push('#   velocity = rate * propensityFactor * degeneracy * vAnchor');
  lines.push('#              * product( conc_reactant * vol_reactant / vAnchor )');
  lines.push('#   d[conc_i]/dt = sum_r netStoich_r[i] * velocity_r / vol_i');
  lines.push('# Compartment volume scaling is applied. Functional rate laws are written out');
  lines.push('# with their observables (defined below as fixed variables, amount-weighted).');
  lines.push('# TotalRate is ignored for ODEs, as in the simulator.');
  lines.push('# Format: XPPAUT (.ode). Species are indexed S1..Sn (legend below). Older XPP');
  lines.push('# builds limit name lengths, so very long parameter names may need shortening.');
  lines.push('#');
  if (usesVolumeScaling) {
    lines.push('# Compartment volumes (species indices carry their volume in the flux):');
    for (const c of compartments) lines.push(`#   ${c.name}: volume=${fmtNum(c.resolvedVolume ?? c.size ?? 1)}, dim=${c.dimension ?? 3}`);
    lines.push('#');
  }
  if (warnings.length > 0) {
    lines.push('# !! NOTE - review before trusting this export for the flagged items:');
    warnings.forEach((w) => lines.push(`#   - ${w}`));
    lines.push('#');
  }

  lines.push('# ---- Species legend ----');
  speciesNames.forEach((sp, i) => {
    const v = speciesVol[i];
    lines.push(`#   ${speciesVarName(i)} = ${sp}${usesVolumeScaling ? `   (vol=${fmtNum(v)})` : ''}`);
  });
  lines.push('');

  lines.push('# ---- Parameters ----');
  if (parameterNames.length === 0) lines.push('# (no named parameters)');
  else parameterNames.forEach((name) => lines.push(`par ${name}=${fmtNum(params[name] ?? 0)}`));
  lines.push('');

  if (obsDefs.length > 0) {
    lines.push('# ---- Observables (fixed variables used by functional rates) ----');
    obsDefs.forEach((d) => lines.push(d));
    lines.push('');
  }

  // Zero-arg functions are inlined into expressions, never emitted (XPP has no
  // zero-arg user functions). Only multi-arg functions become XPP functions.
  const emittedFns = [...usedFunctions]
    .filter((n) => funcByName.has(n) && (funcByName.get(n)!.args?.length ?? 0) > 0)
    .sort();
  if (emittedFns.length > 0) {
    lines.push('# ---- Functions ----');
    for (const name of emittedFns) {
      const fn = funcByName.get(name)!;
      let body = inlineZeroArgFunctions(fn.expression, funcByName);
      if (/\btime\b/.test(body)) body = substituteToken(body, 'time', 't');
      lines.push(`${name}(${(fn.args ?? []).join(',')})=${body}`);
    }
    lines.push('');
  }

  lines.push('# ---- Initial conditions ----');
  speciesNames.forEach((_, i) => lines.push(`init ${speciesVarName(i)}=${fmtNum(initialConcentrations[i] ?? 0)}`));
  lines.push('');

  lines.push('# ---- ODEs ----');
  renderedRhs.forEach((r, i) => lines.push(`d${speciesVarName(i)}/dt=${r}`));
  lines.push('');

  lines.push('done');
  lines.push('');
  return lines.join('\n');
}

// Retained for callers/tests that build a mass-action system explicitly.
export function buildMassActionODESystem(
  speciesNames: string[],
  reactions: Parameters<typeof buildSymbolicODESystem>[1],
  parameterNames: string[],
  initialConcentrations: number[],
  parameterValues: number[],
): SymbolicODESystem {
  return buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations, parameterValues);
}
