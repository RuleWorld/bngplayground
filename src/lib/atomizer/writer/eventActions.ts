/**
 * Translate SBML events into BNGL multi-phase action blocks.
 *
 * The engine has no general trigger-based event executor, but it fully supports the BNG2 idiom of
 * chaining simulate() phases with setConcentration/setParameter between them (see ActionDispatcher
 * and BNGLVisitor: setConcentration/setParameter/addConcentration + continue=>1). That covers the
 * common and important class of events: a change applied at a fixed time (dosing, wash-out, a
 * parameter step). We translate exactly that class and leave anything state-dependent to the
 * diagnostic block, so nothing is silently mis-simulated.
 *
 * Translatable event = time-threshold trigger (time >= T / geq(time,T) / ...) with a constant
 * (parameter-foldable) trigger time, a constant delay, and assignment right-hand sides that reduce
 * to numbers. Those are the only assignments the engine's setConcentration/setParameter can accept,
 * since both resolve their value via parseFloat / parameter lookup, not a full expression evaluator.
 */

import type { SBMLEvent } from '../config/types';
import { standardizeName } from '../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal, safe numeric constant-folder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a scalar arithmetic expression to a number, resolving identifiers via `resolve`.
 * Supports + - * / ^, parentheses, unary +/-, and numeric literals. Returns null when the
 * expression references something non-constant (a species, `time`, an unknown id, or a function
 * call) — i.e. exactly when it is not safe to bake into a scheduled action. Uses no eval/Function.
 */
export function foldNumeric(expr: string, resolve: (id: string) => number | undefined): number | null {
  if (!expr || !expr.trim()) return null;
  const tokens = tokenize(expr);
  if (!tokens) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // expr := term (('+'|'-') term)*
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  // term := factor (('*'|'/') factor)*
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  // factor := unary ('^' factor)?   (right-associative power)
  const parseFactor = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (peek() === '^') {
      next();
      const exp = parseFactor();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  };
  // unary := ('+'|'-')? primary
  const parseUnary = (): number | null => {
    if (peek() === '+') { next(); return parseUnary(); }
    if (peek() === '-') { next(); const v = parseUnary(); return v === null ? null : -v; }
    return parsePrimary();
  };
  // primary := number | identifier | '(' expr ')'
  const parsePrimary = (): number | null => {
    const tok = peek();
    if (tok === undefined) return null;
    if (tok === '(') {
      next();
      const v = parseExpr();
      if (v === null || next() !== ')') return null;
      return v;
    }
    if (/^[0-9.]/.test(tok) || /^[0-9.]+[eE]/.test(tok)) {
      const n = Number(tok);
      if (!Number.isFinite(n)) return null;
      next();
      return n;
    }
    if (/^[A-Za-z_]/.test(tok)) {
      // A function call (identifier immediately followed by '(') is not constant-foldable here.
      if (tokens[pos + 1] === '(') return null;
      next();
      const v = resolve(tok);
      return v === undefined || !Number.isFinite(v) ? null : v;
    }
    return null;
  };

  const result = parseExpr();
  // Reject trailing garbage (e.g. an unconsumed relational operator).
  if (result === null || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}

function tokenize(expr: string): string[] | null {
  const re = /\s*([A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+(?:[eE][+-]?\d+)?|[()+\-*/^])/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(expr)) !== null) {
    out.push(m[1]);
    consumed = re.lastIndex;
  }
  // If anything other than whitespace was left unconsumed, the expression has an unsupported
  // construct (relational/logical operator, comma, etc.) — treat as non-foldable.
  if (expr.slice(consumed).trim() !== '') return null;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If the trigger is a simple time threshold, return the threshold expression (as a string), else
 * null. Handles both the function form emitted by the MathML reader (geq(time, T), lt(T, time), …)
 * and the infix form from the AST walker ((time >= T)).
 */
export function parseTimeThreshold(trigger: string): string | null {
  if (!trigger) return null;
  const t = trigger.trim();

  // Function form: geq(time, T) | gt(time, T)  → time >= T
  let m = t.match(/^(?:geq|gt)\s*\(\s*time\s*,\s*(.+)\)\s*$/i);
  if (m) return balancedInner(m[1]);
  // Function form with time on the right: leq(T, time) | lt(T, time)  → time >= T
  m = t.match(/^(?:leq|lt)\s*\(\s*(.+?)\s*,\s*time\s*\)\s*$/i);
  if (m) return m[1].trim();

  // Infix form: (time >= T) / time > T / (T <= time) …
  m = t.match(/^\(?\s*time\s*(?:>=|>)\s*(.+?)\s*\)?$/i);
  if (m) return stripOuterParens(m[1]);
  m = t.match(/^\(?\s*(.+?)\s*(?:<=|<)\s*time\s*\)?$/i);
  if (m) return stripOuterParens(m[1]);

  return null;
}

// Return the substring up to the matching close paren of a `geq(time, ...)` capture, trimming a
// trailing unbalanced ")" that the greedy capture may have swallowed.
function balancedInner(s: string): string {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { if (depth === 0) return s.slice(0, i).trim(); depth--; }
  }
  return s.trim();
}
function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1).trim();
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event → phases
// ─────────────────────────────────────────────────────────────────────────────

export interface EventSet {
  kind: 'conc' | 'param';
  target: string; // BNGL species pattern (conc) or parameter name (param)
  value: number;
  variable: string; // original SBML variable id, for comments
}

export interface EventTranslationContext {
  /** SBML species id → BNGL species pattern string (for setConcentration), or null if not a species. */
  resolveSpeciesPattern: (sbmlId: string) => string | null;
  /** Resolve a parameter/compartment id to its numeric value, else undefined. */
  resolveParam: (id: string) => number | undefined;
  /** True if the id names a global parameter or compartment (a valid setParameter target). */
  isParam: (id: string) => boolean;
  /** Simulation method for the synthesized phases. */
  method: string;
  /** Total end time (from the source's simulate action if known, else a fallback). */
  baseTEnd: number;
  /** Total step count to distribute across phases. */
  baseSteps: number;
}

export interface EventActionsResult {
  /** The synthesized action block, or null if no event was translatable. */
  actionsBlock: string | null;
  /** Number of events converted to scheduled actions. */
  converted: number;
  /** Events that could not be scheduled, with the reason, for the diagnostic block. */
  untranslated: Array<{ event: SBMLEvent; reason: string }>;
}

export function synthesizeEventActions(
  events: SBMLEvent[],
  ctx: EventTranslationContext
): EventActionsResult {
  const untranslated: Array<{ event: SBMLEvent; reason: string }> = [];
  const scheduled: Array<{ time: number; sets: EventSet[]; priority: number }> = [];

  const fold = (e: string) => foldNumeric(e, ctx.resolveParam);

  for (const ev of events) {
    const threshold = parseTimeThreshold(ev.trigger);
    if (threshold === null) {
      untranslated.push({ event: ev, reason: 'trigger is not a simple time threshold (state-dependent triggers cannot be scheduled)' });
      continue;
    }
    let time = fold(threshold);
    if (time === null) {
      untranslated.push({ event: ev, reason: `trigger time "${threshold}" does not reduce to a constant` });
      continue;
    }
    if (ev.delay) {
      const d = fold(ev.delay);
      if (d === null) {
        untranslated.push({ event: ev, reason: `delay "${ev.delay}" is not constant` });
        continue;
      }
      time += d;
    }

    const sets: EventSet[] = [];
    let failed: string | null = null;
    for (const a of ev.assignments) {
      const value = fold(a.math);
      if (value === null) {
        failed = `assignment "${a.variable} := ${a.math}" is not constant (depends on species/time or a function)`;
        break;
      }
      const speciesPattern = ctx.resolveSpeciesPattern(a.variable);
      if (speciesPattern) {
        sets.push({ kind: 'conc', target: speciesPattern, value, variable: a.variable });
      } else if (ctx.isParam(a.variable)) {
        sets.push({ kind: 'param', target: standardizeName(a.variable), value, variable: a.variable });
      } else {
        failed = `assignment target "${a.variable}" is neither a known species nor a parameter`;
        break;
      }
    }
    if (failed) {
      untranslated.push({ event: ev, reason: failed });
      continue;
    }
    // SBML executes simultaneous events in decreasing-priority order. Fold the priority to a
    // constant (default 0 when absent/non-constant); we later apply higher-priority sets first so a
    // lower-priority write to the same target lands last and wins, matching the spec.
    let priority = 0;
    if (ev.priority) {
      const p = fold(ev.priority);
      if (p !== null) priority = p;
    }
    scheduled.push({ time, sets, priority });
  }

  if (scheduled.length === 0) {
    return { actionsBlock: null, converted: 0, untranslated };
  }

  // Merge events firing at the same time; sort by time ascending, then priority descending so that
  // within one instant the sets are applied highest-priority-first (last write wins per SBML).
  scheduled.sort((a, b) => (a.time - b.time) || (b.priority - a.priority));
  const merged: Array<{ time: number; sets: EventSet[] }> = [];
  for (const s of scheduled) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.time - s.time) < 1e-12) last.sets.push(...s.sets);
    else merged.push({ time: s.time, sets: [...s.sets] });
  }

  const lastFire = merged[merged.length - 1].time;
  const tFinal = ctx.baseTEnd > lastFire ? ctx.baseTEnd : lastFire * 1.5 + 1;
  const method = ctx.method || 'ode';

  // Distribute steps across phases by duration; the phase boundaries are 0, t1, t2, …, tFinal.
  const boundaries = [0, ...merged.map(m => m.time).filter(t => t > 0), tFinal]
    .filter((v, i, arr) => i === 0 || v > arr[i - 1]);
  const totalDur = tFinal - boundaries[0];
  const stepsFor = (from: number, to: number) =>
    Math.max(1, Math.round(ctx.baseSteps * (totalDur > 0 ? (to - from) / totalDur : 1)));

  const lines: string[] = [];
  lines.push(`# ${merged.length} time-triggered SBML event(s) translated to scheduled actions.`);
  lines.push('generate_network({overwrite=>1})');

  // Events at t<=0 apply before the first simulate phase.
  const t0 = merged.find(m => m.time <= 0);
  if (t0) {
    for (const s of t0.sets) lines.push(renderSet(s));
  }

  let phaseStart = 0;
  let first = true;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const to = boundaries[i + 1];
    const nSteps = stepsFor(phaseStart, to);
    if (first) {
      lines.push(`simulate({method=>"${method}", t_start=>0, t_end=>${fmt(to)}, n_steps=>${nSteps}})`);
      first = false;
    } else {
      lines.push(`simulate({continue=>1, t_end=>${fmt(to)}, n_steps=>${nSteps}})`);
    }
    // Apply the sets scheduled exactly at this boundary (if it corresponds to an event time).
    const atBoundary = merged.find(m => Math.abs(m.time - to) < 1e-12 && m.time > 0);
    if (atBoundary) {
      for (const s of atBoundary.sets) lines.push(renderSet(s));
    }
    phaseStart = to;
  }
  // Final continuation to tFinal if the last event was before tFinal.
  if (Math.abs(phaseStart - tFinal) > 1e-12) {
    lines.push(`simulate({continue=>1, t_end=>${fmt(tFinal)}, n_steps=>${stepsFor(phaseStart, tFinal)}})`);
  }

  return { actionsBlock: lines.join('\n'), converted: scheduled.length, untranslated };
}

function renderSet(s: EventSet): string {
  return s.kind === 'conc'
    ? `setConcentration("${s.target}", "${fmt(s.value)}")`
    : `setParameter("${s.target}", "${fmt(s.value)}")`;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(12)));
}
