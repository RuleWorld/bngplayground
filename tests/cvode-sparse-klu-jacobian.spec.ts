/**
 * cvode-sparse-klu-jacobian.spec.ts
 * -----------------------------------------------------------------------------
 * Regression cover for the native sparse (KLU) Jacobian path in the CVODE WASM
 * wrapper (wasm-sundials/cvode_wrapper.c, network_jac).
 *
 * WHY THIS EXISTS
 * SUNDIALS >= 7.0 changed SUNMatZero() on a SUNSparseMatrix so that it clears the
 * index arrays (indexptrs/indexvals) as well as the values. CVODE calls
 * SUNMatZero(A) before EVERY user-supplied Jacobian whenever the linear solver
 * is DIRECT, and KLU is direct. The wrapper installed the CSR pattern once, in
 * bind_network(), so from the first Jacobian call onward the KLU matrix arrived
 * with an empty pattern: KLU factorized nothing, the Newton solve failed, and
 * CVODE shrank its step until mxstep was exhausted. The engine's mxstep
 * escalation loop then advanced time only in proportion to each doubling, which
 * presents to the user as a hang.
 *
 * WHY THE PRE-EXISTING COVERAGE MISSED IT
 * native-bytecode-cvode.spec.ts exercises this path with a 2-species model over
 * t_end=1 and asserts only the row count, which a crippled Jacobian can still
 * limp through. The model here is the reported failure itself -- stiff fast
 * on-rates against slow catalysis, 143 species -- and the assertion is on VALUES.
 *
 * WHY THE SOLVE RUNS OUT-OF-PROCESS
 * The failure mode is a hang inside WASM, which blocks the event loop, so
 * vitest cannot enforce a timeout on an in-process solve: measured here, a
 * direct in-process spec still had not reported after 240s. Running the solve in
 * a child process (tests/helpers/cvode-sparse-probe.ts) lets this spec enforce a
 * real wall-clock timeout and report an ordinary failure rather than wedging the
 * suite. A timeout here is a failure, not a flake.
 * -----------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const itMaybe = hasCvode ? it : it.skip;

const PROBE = fileURLToPath(new URL('./helpers/cvode-sparse-probe.ts', import.meta.url));
const PROBE_TIMEOUT_MS = 90_000;
const OBSERVABLE_COUNT = 21;

interface ProbeRow extends Record<string, number> { time: number }
interface ProbeResult {
  species: number;
  sparse: ProbeRow[];
  dense: ProbeRow[];
}

function runProbe(): ProbeResult {
  let raw: string;
  try {
    raw = execFileSync(process.execPath, ['--import', 'tsx', PROBE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error: unknown) {
    const killed = (error as { signal?: string }).signal === 'SIGTERM';
    throw new Error(
      killed
        ? `CVODE sparse probe exceeded ${PROBE_TIMEOUT_MS}ms and was killed. ` +
          `The KLU sparsity pattern is probably being cleared between Jacobian calls, ` +
          `which collapses the step size (see wasm-sundials/cvode_wrapper.c network_jac).`
        : `CVODE sparse probe failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return JSON.parse(raw) as ProbeResult;
}

describe('CVODE native sparse KLU Jacobian', () => {
  itMaybe('keeps the CSR sparsity pattern across every Jacobian evaluation', () => {
    const { species, sparse, dense } = runProbe();

    expect(species).toBe(143);
    expect(sparse).toHaveLength(dense.length);

    const names = Object.keys(sparse[0]).filter(name => name !== 'time');
    expect(names).toHaveLength(OBSERVABLE_COUNT);

    // Values, not just shape: a cleared sparsity pattern survives a row-count
    // check on an easy model but cannot reproduce the trajectory.
    for (const [index, sparseRow] of sparse.entries()) {
      const denseRow = dense[index];
      expect(sparseRow.time).toBeCloseTo(denseRow.time, 9);

      const total = names.reduce((sum, name) => sum + sparseRow[name], 0);
      expect(total).toBeCloseTo(1, 8);

      for (const name of names) {
        expect(sparseRow[name]).toBeCloseTo(denseRow[name], 8);
      }
    }

    // steady_state=1 stops early, so the run is short; make sure the terminal row
    // is a real distribution rather than something trivially equal.
    const steady = sparse[sparse.length - 1];
    expect(steady.S0).toBeGreaterThan(0);
    expect(steady.S20).toBeGreaterThan(0);
  }, 180_000);
});
