/**
 * Quick verification of the new ODE solvers on Robertson stiff problem
 */

import { createSolver, Rosenbrock23Solver } from '../services/ODESolver';

// Robertson problem derivative function
function robertson(y: Float64Array, dydt: Float64Array) {
    dydt[0] = -0.04 * y[0] + 1e4 * y[1] * y[2];
    dydt[1] = 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] * y[1];
    dydt[2] = 3e7 * y[1] * y[1];
}

async function main() {
    console.log('=== ODE Solver Verification ===\n');

    const y0 = new Float64Array([1, 0, 0]);

    // Test Rosenbrock23
    console.log('Testing Rosenbrock23...');
    const solver = new Rosenbrock23Solver(3, robertson, {
        atol: 1e-6,
        rtol: 1e-3,
        maxSteps: 100000,
        minStep: 1e-15,
        maxStep: 100,
        solver: 'rosenbrock23',
    });

    const start = Date.now();
    const result = solver.integrate(y0, 0, 100);
    const elapsed = Date.now() - start;

    console.log(`  success=${result.success}, steps=${result.steps}, time=${elapsed}ms`);
    console.log(`  y = [${result.y[0].toFixed(6)}, ${result.y[1].toExponential(3)}, ${result.y[2].toFixed(6)}]`);

    const sum = result.y[0] + result.y[1] + result.y[2];
    console.log(`  mass conservation: ${sum.toFixed(12)} (should be 1.0)`);

    if (result.success && Math.abs(sum - 1) < 1e-5) {
        console.log('\n✓ Rosenbrock23 PASSED\n');
    } else {
        console.log('\n✗ Rosenbrock23 FAILED\n');
        process.exit(1);
    }

    // Test AutoSolver
    console.log('Testing AutoSolver...');
    const auto = await createSolver(3, robertson, {
        atol: 1e-6,
        rtol: 1e-3,
        maxSteps: 100000,
        minStep: 1e-15,
        maxStep: 100,
        solver: 'auto',
    });

    const start2 = Date.now();
    const result2 = auto.integrate(new Float64Array([1, 0, 0]), 0, 100);
    const elapsed2 = Date.now() - start2;

    console.log(`  success=${result2.success}, steps=${result2.steps}, time=${elapsed2}ms`);

    if (result2.success) {
        console.log('\n✓ AutoSolver PASSED\n');
    } else {
        console.log('\n✗ AutoSolver FAILED\n');
    }

    // Test CVODE (WASM)
    console.log('Testing CVODE (WASM)...');

    // In Node.js, we need to help Emscripten find the WASM file
    // We can do this by inspecting how logic in ODESolver.ts works, 
    // or by overriding the init logic here if needed.
    // However, verify_solver imports createSolver which calls CVODESolver.init().
    // We need to ensure that init finds the file. 
    // CVODESolver.init uses locateFile: () => '/cvode.wasm' which fails in Node.

    // We'll hack the CVODESolver.init method for this test environment
    const { CVODESolver } = await import('../services/ODESolver');
    const path = await import('path');
    const fs = await import('fs');

    // Override init to load from local file system
    CVODESolver.init = async () => {
        if (CVODESolver.module) return;

        // Dynamic import of loader
        // @ts-ignore
        const createCVodeModule = (await import('../services/cvode_loader')).default;

        const wasmPath = path.resolve(__dirname, '../public/cvode.wasm');
        const wasmBinary = fs.readFileSync(wasmPath);

        CVODESolver.module = await createCVodeModule({
            wasmBinary: wasmBinary,
        }) as any;
    };

    const cvode = await createSolver(3, robertson, {
        atol: 1e-6,
        rtol: 1e-3,
        maxSteps: 100000,
        minStep: 1e-15,
        maxStep: 100,
        solver: 'cvode',
    });

    const start3 = Date.now();
    const result3 = cvode.integrate(new Float64Array([1, 0, 0]), 0, 100);
    const elapsed3 = Date.now() - start3;

    console.log(`  success=${result3.success}, steps=${result3.steps}, time=${elapsed3}ms`);
    console.log(`  y = [${result3.y[0].toFixed(6)}, ${result3.y[1].toExponential(3)}, ${result3.y[2].toFixed(6)}]`);

    if (result3.success) {
        console.log('\n✓ CVODE PASSED\n');
    } else {
        console.log('\n✗ CVODE FAILED\n');
        process.exit(1);
    }

    console.log('All tests passed!');
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
