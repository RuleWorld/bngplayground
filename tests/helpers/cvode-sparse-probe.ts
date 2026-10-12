/**
 * cvode-sparse-probe.ts
 * -----------------------------------------------------------------------------
 * Runs the reported two-step-binding model twice -- once through the native
 * sparse (KLU) Jacobian path and once through the dense analytical Jacobian --
 * and prints both trajectories as JSON on stdout.
 *
 * This exists as a SEPARATE PROCESS because the regression it guards against is
 * a hang: when the KLU sparsity pattern is lost, the CVODE step size collapses
 * and the solver spins inside WASM, blocking the event loop. A test that called
 * simulate() directly could never time out and would take the whole suite with
 * it. Running the solve out-of-process lets the spec enforce a real wall-clock
 * timeout and report an ordinary test failure instead.
 *
 * Invoked by cvode-sparse-klu-jacobian.spec.ts; not a standalone test.
 * -----------------------------------------------------------------------------
 */

import { generateExpandedNetwork, parseBNGLStrict, simulate } from '@bngplayground/engine';
import type { BNGLModel, SimulationOptions } from '../../packages/engine/src/types';

// The engine logs to stdout; stdout here is the JSON channel the spec parses,
// so silence console and emit only the payload.
console.log = () => {};
console.warn = () => {};
console.info = () => {};

const SITES = 20;
const CALLBACKS = { checkCancelled() {}, postMessage() {} };

function buildModel(): string {
  const sites = ['U', ...Array.from({ length: SITES }, (_, i) => `${i + 1}P`)];
  const constants: string[] = [];
  const binding: string[] = [];
  const catalysis: string[] = [];

  for (let k = 1; k <= SITES; k++) {
    // Kinase on-rates fall with site index; phosphatase on-rates rise.
    constants.push(`  Ekf${k} ${SITES + 1 - k} * 10/A`);
    binding.push(`  S(E~1,A~0,Y~${sites[k - 1]}) <-> S(E~1!1,A~0,Y~${sites[k - 1]}!1) Ekf${k}, Ekb`);
    catalysis.push(`  S(E~1!1,A~0,Y~${sites[k - 1]}!1) -> S(E~1,A~1,Y~${sites[k]}) Ekc`);
  }
  for (let k = 1; k <= SITES; k++) {
    constants.push(`  Fkf${k} ${k} * 10/A`);
    binding.push(`  S(F~1,A~0,Y~${sites[k]}) <-> S(F~1!1,A~0,Y~${sites[k]}!1) Fkf${k}, Fkb`);
    catalysis.push(`  S(F~1!1,A~0,Y~${sites[k]}!1) -> S(F~1,A~1,Y~${sites[k - 1]}) Fkc`);
  }

  return [
    'begin parameters',
    '  A 0.0001',
    '  tS 1',
    '  Ekp 0.1',
    '  Fkp 0.1',
    '  Ekm 0.1/A',
    '  Fkm 0.1/A',
    ...constants,
    '  Ekb 1',
    '  Fkb 1',
    '  Ekc 0.1',
    '  Fkc 0.1',
    '  Emu 1',
    '  Fmu 1',
    'end parameters',
    'begin molecule types',
    `  S(E~0~1,F~0~1,A~0~1,Y~${sites.join('~')})`,
    'end molecule types',
    'begin species',
    '  S(E~0,F~0,A~0,Y~U) tS',
    'end species',
    'begin reaction rules',
    '  S(E~0,F~0,A~0) <-> S(E~1,F~0,A~0) Ekp,Ekm',
    '  S(E~0,F~0,A~0) <-> S(E~0,F~1,A~0) Fkp,Fkm',
    '  S(E~1,F~0,A~1) -> S(E~0,F~0,A~0) Ekm',
    '  S(E~0,F~1,A~1) -> S(E~0,F~0,A~0) Fkm',
    ...binding,
    ...catalysis,
    '  S(E~1,A~1) -> S(E~1,A~0) Emu',
    '  S(F~1,A~1) -> S(F~1,A~0) Fmu',
    'end reaction rules',
    'begin observables',
    // "!?" matches regardless of the Y bond, so bound encounter complexes are
    // counted too and the S0..S20 sum is the conserved total substrate.
    ...sites.map((site, i) => `  Molecules S${i} S(Y~${site}!?)`),
    'end observables',
    '',
  ].join('\n');
}

const parsed = parseBNGLStrict(buildModel());
const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
const model: BNGLModel = {
  ...parsed,
  reactions: expanded.reactions,
  species: expanded.species,
  concreteObservables: expanded.concreteObservables,
  observables: expanded.observables ?? parsed.observables,
};

async function run(solver: 'cvode_sparse' | 'cvode_jac'): Promise<Array<Record<string, number>>> {
  const options: SimulationOptions = {
    method: 'ode',
    solver,
    t_end: 500000,
    n_steps: 30,
    sparse: solver === 'cvode_sparse',
    steadyState: true,
    adaptiveCvodeTuning: false,
  };
  return (await simulate(1, model, options, CALLBACKS)).data as Array<Record<string, number>>;
}

const sparse = await run('cvode_sparse');
const dense = await run('cvode_jac');
process.stdout.write(JSON.stringify({ species: expanded.species.length, sparse, dense }));
