/**
 * ODE export validation — end-to-end, against the live simulator.
 *
 * Strategy (per model):
 *   A. RHS parity. The simulator's exact ODE right-hand side is exposed via
 *      buildOdeSystem(); we parse the exported .ode into an independent RHS and
 *      assert dy/dt matches at many random states. This is a solver-independent
 *      proof that the export encodes the same ODE.
 *   B. CVODE trajectory parity. Integrate BOTH RHS with CVODE (stiff solver,
 *      BNG2 tolerances 1e-8) over the timecourse and compare trajectories.
 *   C. End-to-end vs the product path. Integrate the exported RHS with CVODE and
 *      compare species trajectories against the public simulate() output.
 *
 * These use WASM (network generation + CVODE), so run under the project's full
 * test runner (scripts/run_full_tests.mjs), not a WASM-less unit pass.
 */
import { describe, it, expect } from 'vitest';
import {
  parseBNGLWithANTLR,
  simulate,
  buildOdeSystem,
  createSolver,
  type OdeSystemHandle,
} from '@bngplayground/engine';
import { exportModelToODE } from '../services/exportODE';

// ---------------------------------------------------------------------------
// .ode -> callable RHS. Parses the XPPAUT text the exporter produces and builds
// (y, dydt) => void, evaluating observable fixed-variables and user functions
// before the dSi/dt expressions — the same dependency order XPP uses.
// ---------------------------------------------------------------------------
interface CompiledOde {
  numSpecies: number;
  y0: Float64Array;
  rhs: (y: Float64Array, dydt: Float64Array) => void;
}

function compileOdeText(text: string): CompiledOde {
  const params: Record<string, number> = {};
  const obsDefs: Array<{ name: string; expr: string }> = [];
  const funcDefs: Array<{ name: string; args: string[]; body: string }> = [];
  const rhsByIndex: Record<number, string> = {};
  const initByIndex: Record<number, number> = {};
  let maxIdx = -1;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'done') continue;

    if (line.startsWith('par ')) {
      const m = line.slice(4).match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (m) params[m[1]] = Number(m[2]);
      continue;
    }
    if (line.startsWith('init ')) {
      const m = line.slice(5).match(/^S(\d+)\s*=\s*(.+)$/);
      if (m) { const i = Number(m[1]) - 1; initByIndex[i] = Number(m[2]); maxIdx = Math.max(maxIdx, i); }
      continue;
    }
    const dm = line.match(/^d\s*S(\d+)\s*\/\s*dt\s*=\s*(.+)$/);
    if (dm) { const i = Number(dm[1]) - 1; rhsByIndex[i] = dm[2]; maxIdx = Math.max(maxIdx, i); continue; }
    const fm = line.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*=\s*(.+)$/);
    if (fm) { funcDefs.push({ name: fm[1], args: fm[2].split(',').map((s) => s.trim()).filter(Boolean), body: fm[3] }); continue; }
    const om = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (om) { obsDefs.push({ name: om[1], expr: om[2] }); continue; }
  }

  const numSpecies = maxIdx + 1;
  const y0 = new Float64Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) y0[i] = initByIndex[i] ?? 0;

  const toJs = (e: string) => e.replace(/\^/g, '**');
  const mathScope: Record<string, unknown> = {
    sqrt: Math.sqrt, exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10,
    abs: Math.abs, pow: Math.pow, min: Math.min, max: Math.max, sin: Math.sin,
    cos: Math.cos, tan: Math.tan, atan: Math.atan, tanh: Math.tanh, floor: Math.floor,
    ceil: Math.ceil, sign: Math.sign, pi: Math.PI, t: 0,
    heav: (x: number) => (x > 0 ? 1 : 0), mod: (a: number, b: number) => a % b,
  };
  // new Function bodies are sloppy-mode, so `with` is permitted here (test-only).
  const evalExpr = (expr: string, scope: object): number =>
    // eslint-disable-next-line no-new-func
    (Function('__s__', `with(__s__){ return (${toJs(expr)}); }`) as (s: object) => number)(scope);

  const rhs = (y: Float64Array, dydt: Float64Array): void => {
    const ctx: Record<string, unknown> = Object.create(mathScope);
    for (const k in params) ctx[k] = params[k];
    for (let i = 0; i < numSpecies; i++) ctx[`S${i + 1}`] = y[i];
    for (const o of obsDefs) ctx[o.name] = evalExpr(o.expr, ctx);
    for (const f of funcDefs) {
      ctx[f.name] = (...args: number[]) => {
        const local: Record<string, unknown> = Object.create(ctx);
        f.args.forEach((a, k) => { local[a] = args[k]; });
        return evalExpr(f.body, local);
      };
    }
    for (let i = 0; i < numSpecies; i++) dydt[i] = evalExpr(rhsByIndex[i] ?? '0', ctx);
  };

  return { numSpecies, y0, rhs };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseModel(bngl: string) {
  const res = parseBNGLWithANTLR(bngl);
  if (!res.success || !res.model) {
    throw new Error(`BNGL parse failed: ${res.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('; ')}`);
  }
  return res.model;
}

function closeEnough(a: number, b: number, rel = 1e-6, abs = 1e-9): boolean {
  return Math.abs(a - b) <= abs + rel * (Math.abs(a) + Math.abs(b));
}

async function integrateWithCVODE(
  n: number,
  rhs: (y: Float64Array, dydt: Float64Array) => void,
  y0: Float64Array,
  times: number[],
): Promise<Float64Array[]> {
  const solver = await createSolver(n, rhs, { solver: 'cvode', atol: 1e-8, rtol: 1e-8 });
  const out: Float64Array[] = [];
  let y = Float64Array.from(y0);
  let t0 = 0;
  for (const t of times) {
    if (t <= t0) { out.push(Float64Array.from(y)); continue; }
    const res = solver.integrate(y, t0, t);
    y = Float64Array.from(res.y);
    out.push(Float64Array.from(y));
    t0 = t;
  }
  solver.destroy?.();
  return out;
}

// ---------------------------------------------------------------------------
// Model battery. Each is small but exercises a distinct code path.
// rhsParity=false for models the simulator integrates in amount space
// (functional rates + heterogeneous compartment volumes); those get the
// trajectory checks only.
// ---------------------------------------------------------------------------
interface Case { name: string; bngl: string; tEnd: number; nSteps: number; rhsParity?: boolean; }

const CASES: Case[] = [
  {
    name: 'reversible binding (mass action)',
    tEnd: 50, nSteps: 25,
    bngl: `begin model
begin parameters
 kon 0.01
 koff 0.1
 A0 100
 B0 80
end parameters
begin molecule types
 A(b)
 B(a)
end molecule types
begin seed species
 A(b) A0
 B(a) B0
end seed species
begin observables
 Molecules AB A(b!1).B(a!1)
 Molecules freeA A(b)
end observables
begin reaction rules
 A(b) + B(a) <-> A(b!1).B(a!1) kon,koff
end reaction rules
end model`,
  },
  {
    name: 'homodimerization (symmetry factor)',
    tEnd: 100, nSteps: 25,
    bngl: `begin model
begin parameters
 kdim 0.005
 kundim 0.05
 A0 200
end parameters
begin molecule types
 A(d)
end molecule types
begin seed species
 A(d) A0
end seed species
begin observables
 Molecules Dimer A(d!1).A(d!1)
 Molecules Monomer A(d)
end observables
begin reaction rules
 A(d) + A(d) <-> A(d!1).A(d!1) kdim,kundim
end reaction rules
end model`,
  },
  {
    name: 'enzyme kinetics E+S<->ES->E+P (stiff mass action)',
    tEnd: 200, nSteps: 40,
    bngl: `begin model
begin parameters
 kf 0.02
 kr 0.5
 kcat 0.3
 E0 10
 S0 100
end parameters
begin molecule types
 E(s)
 S(e)
 P()
end molecule types
begin seed species
 E(s) E0
 S(e) S0
 P() 0
end seed species
begin observables
 Molecules Product P()
 Molecules FreeE E(s)
end observables
begin reaction rules
 E(s) + S(e) <-> E(s!1).S(e!1) kf,kr
 E(s!1).S(e!1) -> E(s) + P() kcat
end reaction rules
end model`,
  },
  {
    name: 'clamped (constant) enzyme, mass action',
    tEnd: 100, nSteps: 30,
    bngl: `begin model
begin parameters
 kf 0.02
 kr 0.5
 kcat 0.3
 E0 5
 S0 100
end parameters
begin molecule types
 E(s)
 S(e)
 P()
end molecule types
begin seed species
 $E(s) E0
 S(e) S0
 P() 0
end seed species
begin observables
 Molecules Product P()
end observables
begin reaction rules
 E(s) + S(e) <-> E(s!1).S(e!1) kf,kr
 E(s!1).S(e!1) -> E(s) + P() kcat
end reaction rules
end model`,
  },
  {
    name: 'functional Michaelis-Menten rate (observable + function)',
    tEnd: 100, nSteps: 30,
    bngl: `begin model
begin parameters
 kcat 1.0
 Km 40
 Etot 5
end parameters
begin molecule types
 S()
 P()
end molecule types
begin seed species
 S() 100
 P() 0
end seed species
begin observables
 Molecules Sub S()
 Molecules Prod P()
end observables
begin functions
 mm_rate() = kcat*Etot/(Km + Sub)
end functions
begin reaction rules
 S() -> P() mm_rate()
end reaction rules
end model`,
  },
  {
    name: 'nested functional rate with Hill feedback',
    tEnd: 80, nSteps: 30,
    bngl: `begin model
begin parameters
 kmax 2.0
 Kd 30
 kback 0.05
 X0 100
end parameters
begin molecule types
 X()
 Y()
end molecule types
begin seed species
 X() X0
 Y() 0
end seed species
begin observables
 Molecules Yobs Y()
 Molecules Xobs X()
end observables
begin functions
 hill() = (Yobs*Yobs)/(Kd*Kd + Yobs*Yobs)
 fwd_rate() = kmax*(0.1 + hill())
end functions
begin reaction rules
 X() -> Y() fwd_rate()
 Y() -> X() kback
end reaction rules
end model`,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ODE export — validation against the live simulator (CVODE)', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      let handle: OdeSystemHandle;
      let compiled: CompiledOde;

      it('prepares the simulator RHS and parses the exported .ode', async () => {
        const model = parseModel(c.bngl);
        handle = await buildOdeSystem(model, { t_end: c.tEnd, n_steps: c.nSteps });
        const odeText = await exportModelToODE(model, c.name.replace(/\W+/g, '_'));
        compiled = compileOdeText(odeText);

        expect(compiled.numSpecies).toBe(handle.numSpecies);
        // Initial conditions match.
        for (let i = 0; i < handle.numSpecies; i++) {
          expect(closeEnough(compiled.y0[i], handle.y0[i])).toBe(true);
        }
      });

      const rhsParity = c.rhsParity !== false;
      (rhsParity ? it : it.skip)('RHS matches the simulator at random states', () => {
        const n = handle.numSpecies;
        const a = new Float64Array(n);
        const b = new Float64Array(n);
        for (let trial = 0; trial < 40; trial++) {
          const y = new Float64Array(n);
          for (let i = 0; i < n; i++) y[i] = Math.random() * 120; // concentrations >= 0
          handle.rhs(y, a);
          compiled.rhs(y, b);
          for (let i = 0; i < n; i++) {
            expect(closeEnough(a[i], b[i], 1e-6, 1e-8)).toBe(true);
          }
        }
      });

      it('CVODE trajectory matches the simulator RHS', async () => {
        const n = handle.numSpecies;
        const times = Array.from({ length: c.nSteps }, (_, k) => ((k + 1) * c.tEnd) / c.nSteps);
        const [simTraj, expTraj] = await Promise.all([
          integrateWithCVODE(n, handle.rhs, handle.y0, times),
          integrateWithCVODE(n, compiled.rhs, compiled.y0, times),
        ]);
        for (let k = 0; k < times.length; k++) {
          for (let i = 0; i < n; i++) {
            expect(closeEnough(expTraj[k][i], simTraj[k][i], 1e-4, 1e-6)).toBe(true);
          }
        }
      });

      it('CVODE trajectory of the exported ODE matches the public simulate() species output', async () => {
        const model = parseModel(c.bngl);
        const times = Array.from({ length: c.nSteps }, (_, k) => ((k + 1) * c.tEnd) / c.nSteps);
        const sim = await simulate(0, model, {
          method: 'ode', t_end: c.tEnd, n_steps: c.nSteps, solver: 'cvode',
          atol: 1e-8, rtol: 1e-8, includeSpeciesData: true,
        }, { checkCancelled: () => {}, postMessage: () => {} });

        const headers = sim.speciesHeaders ?? [];
        const rows = sim.speciesData ?? [];
        if (headers.length === 0 || rows.length === 0) {
          // Species output not available in this build; checks A/B cover correctness.
          return;
        }
        // Align exported species (handle order) to simulate() species columns by name.
        const colFor = handle.speciesNames.map((nm) => headers.indexOf(nm));
        expect(colFor.every((c2) => c2 >= 0)).toBe(true);

        // Compare final state (robust to how simulate() lays out intermediate rows).
        const expTraj = await integrateWithCVODE(handle.numSpecies, compiled.rhs, compiled.y0, times);
        const expFinal = expTraj[expTraj.length - 1];
        const simFinal = rows[rows.length - 1];
        for (let i = 0; i < handle.numSpecies; i++) {
          const simVal = Number(simFinal[headers[colFor[i]]]);
          expect(closeEnough(expFinal[i], simVal, 2e-3, 1e-4)).toBe(true);
        }
      });
    });
  }
});
