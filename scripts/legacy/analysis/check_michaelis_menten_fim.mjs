// Sanity-check script: reproduces the Fisher Information Matrix (FIM) computation
// for the Michaelis–Menten example using the same numerical procedure as
// `services/fim.ts`. Run with `node scripts/check_michaelis_menten_fim.mjs`.

const parameterNames = ['k_on', 'k_off', 'k_cat'];
const baseParams = {
  k_on: 1.0,
  k_off: 0.5,
  k_cat: 0.2,
  E_0: 1.0,
  S_0: 10.0,
};

const simulationOptions = {
  tEnd: 50,
  nSteps: 500,  // Increased from 50 for better numerical stability with faster dynamics
};

const observableKeys = ['obs_Product', 'obs_ES_Complex'];

function ode(state, params) {
  const [E, S, C, P] = state;
  const { k_on, k_off, k_cat } = params;
  const binding = k_on * E * S;
  const unbinding = k_off * C;
  const catalysis = k_cat * C;

  const dE = -binding + unbinding + catalysis;
  const dS = -binding + unbinding;
  const dC = binding - unbinding - catalysis;
  const dP = catalysis;

  return [dE, dS, dC, dP];
}

function rk4Step(state, dt, params) {
  // Ensure numerical stability by preventing negative concentrations
  const clampState = (s) => s.map(x => Math.max(0, x));
  
  const k1v = ode(clampState(state), params);
  const mid1 = state.map((x, i) => x + 0.5 * dt * k1v[i]);
  const k2v = ode(clampState(mid1), params);
  const mid2 = state.map((x, i) => x + 0.5 * dt * k2v[i]);
  const k3v = ode(clampState(mid2), params);
  const end = state.map((x, i) => x + dt * k3v[i]);
  const k4v = ode(clampState(end), params);

  const newState = state.map((x, i) => x + (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]));
  return clampState(newState);
}

function simulateModel(params) {
  const dt = simulationOptions.tEnd / simulationOptions.nSteps;
  const steps = simulationOptions.nSteps;
  const result = [];
  let state = [baseParams.E_0, baseParams.S_0, 0, 0]; // [E_free, S_free, Complex, Product]

  for (let i = 0; i <= steps; i++) {
    const time = i * dt;
    const [E_free, S_free, C, P] = state;
    result.push({
      time,
      obs_Product: P,
      obs_ES_Complex: C,
    });
    if (i < steps) {
      state = rk4Step(state, dt, params);
    }
  }

  return result;
}

function jacobiEigenDecomposition(A, maxIter = 100, tol = 1e-12) {
  const n = A.length;
  const V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  const a = A.map((row) => row.slice());

  const maxOffdiag = () => {
    let max = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(a[i][j]);
        if (v > max) {
          max = v;
          p = i;
          q = j;
        }
      }
    }
    return { max, p, q };
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const { max, p, q } = maxOffdiag();
    if (max < tol) break;

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const aip = a[i][p];
        const aiq = a[i][q];
        a[i][p] = c * aip - s * aiq;
        a[p][i] = a[i][p];
        a[i][q] = s * aip + c * aiq;
        a[q][i] = a[i][q];
      }
    }

    const new_pp = c * c * app - 2 * s * c * apq + s * s * aqq;
    const new_qq = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][p] = new_pp;
    a[q][q] = new_qq;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let i = 0; i < n; i++) {
      const vip = V[i][p];
      const viq = V[i][q];
      V[i][p] = c * vip - s * viq;
      V[i][q] = s * vip + c * viq;
    }
  }

  const eigenvalues = a.map((row, i) => row[i]);
  const eigenvectors = V;
  return { eigenvalues, eigenvectors };
}

function computeFIM() {
  const baseline = simulateModel(baseParams);
  const timeCount = baseline.length;
  const numObs = observableKeys.length;
  const p = parameterNames.length;
  const m = timeCount * numObs;

  const J = Array.from({ length: m }, () => Array(p).fill(0));

  for (let j = 0; j < p; j++) {
    const name = parameterNames[j];
    const baseVal = baseParams[name];
    const eps = Math.max(1e-8, Math.abs(baseVal) * 1e-4, 1e-8);
    const plusParams = { ...baseParams, [name]: baseVal + eps };
    const minusParams = { ...baseParams, [name]: Math.max(0, baseVal - eps) };

    const plusData = simulateModel(plusParams);
    const minusData = simulateModel(minusParams);
    const denom = plusParams[name] - minusParams[name] || eps;

    for (let ti = 0; ti < timeCount; ti++) {
      for (let oi = 0; oi < numObs; oi++) {
        const key = observableKeys[oi];
        const vPlus = Number(plusData[ti][key] ?? 0);
        const vMinus = Number(minusData[ti][key] ?? 0);
        const deriv = (vPlus - vMinus) / denom;
        const rowIndex = ti * numObs + oi;
        J[rowIndex][j] = Number.isFinite(deriv) ? deriv : 0;
      }
    }
  }

  const F = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += J[k][i] * J[k][j];
      }
      F[i][j] = sum;
      F[j][i] = sum;
    }
  }

  const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(F, Math.max(100, p * 20));
  const eigPairs = eigenvalues.map((val, idx) => ({
    val,
    vec: eigenvectors.map((row) => row[idx]),
  }));
  eigPairs.sort((a, b) => b.val - a.val);

  const sortedVals = eigPairs.map((pair) => pair.val);
  const sortedVecs = eigPairs.map((pair) => pair.vec);

  const maxEig = sortedVals[0] ?? 0;
  const minEig = sortedVals[sortedVals.length - 1] ?? 0;
  const rawCondition = maxEig > 0 && minEig > 0 ? maxEig / minEig : Infinity;
  const relEps = Math.max(Math.abs(maxEig) * 1e-12, 1e-16);
  const regularizedCondition = maxEig / Math.max(minEig, relEps);

  const n = p;
  const cov = Array.from({ length: n }, () => Array(n).fill(0));
  const eigThreshold = Math.max(1e-12, maxEig * 1e-12);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const lambda = sortedVals[k];
        if (lambda > eigThreshold) {
          sum += (sortedVecs[k][i] * sortedVecs[k][j]) / lambda;
        }
      }
      cov[i][j] = sum;
    }
  }

  const correlations = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const varI = cov[i][i];
      const varJ = cov[j][j];
      if (varI > 0 && varJ > 0) {
        correlations[i][j] = cov[i][j] / Math.sqrt(varI * varJ);
      } else {
        correlations[i][j] = 0;
      }
    }
  }

  const identifiableParams = [];
  const unidentifiableParams = [];
  const contribThreshold = maxEig * 1e-6;
  for (let i = 0; i < n; i++) {
    let contribution = 0;
    for (let k = 0; k < n; k++) {
      const lambda = sortedVals[k];
      if (lambda > eigThreshold) {
        contribution += (sortedVecs[k][i] ** 2) * lambda;
      }
    }
    if (contribution > contribThreshold) identifiableParams.push(parameterNames[i]);
    else unidentifiableParams.push(parameterNames[i]);
  }

  const nullTol = Math.max(1e-12, Math.abs(maxEig) * 1e-4);
  const nullspaceCombinations = [];
  for (let k = sortedVals.length - 1; k >= 0; k--) {
    const lambda = sortedVals[k];
    if (lambda > nullTol) break;
    const vec = sortedVecs[k];
    const maxAbs = Math.max(...vec.map((v) => Math.abs(v)), 0);
    const threshold = maxAbs * 0.1;
    const components = [];
    for (let i = 0; i < vec.length; i++) {
      const loading = vec[i];
      if (Math.abs(loading) >= threshold && Number.isFinite(loading)) {
        components.push({ name: parameterNames[i], loading });
      }
    }
    components.sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading));
    nullspaceCombinations.push({ eigenvalue: lambda, components });
  }

  const corrPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      corrPairs.push({
        i,
        j,
        names: [parameterNames[i], parameterNames[j]],
        corr: correlations[i][j],
      });
    }
  }
  corrPairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  const topCorrelatedPairs = corrPairs.slice(0, Math.min(3, corrPairs.length));

  return {
    eigenvalues: sortedVals,
    eigenvectors: sortedVecs,
    fimMatrix: F,
    jacobian: J,
    correlations,
    covarianceMatrix: cov,
    conditionNumber: rawCondition,
    regularizedConditionNumber: regularizedCondition,
    identifiableParams,
    unidentifiableParams,
    nullspaceCombinations,
    topCorrelatedPairs,
  };
}

function printMatrix(matrix) {
  return matrix
    .map((row) =>
      row
        .map((value) => value.toExponential(3).padStart(12))
        .join(' ')
    )
    .join('\n');
}

function main() {
  const result = computeFIM();

  console.log('FIM eigenvalues (descending):');
  result.eigenvalues.forEach((val, idx) => {
    console.log(`  λ${idx + 1}: ${val.toExponential(6)}`);
  });
  console.log();

  console.log('Condition number (raw / regularized):');
  console.log(
    `  ${result.conditionNumber.toExponential(6)} / ${result.regularizedConditionNumber.toExponential(6)}`
  );
  console.log();

  console.log('Identifiable parameters:', result.identifiableParams.join(', ') || '(none)');
  console.log('Unidentifiable parameters:', result.unidentifiableParams.join(', ') || '(none)');
  console.log();

  if (result.nullspaceCombinations.length > 0) {
    console.log('Near-null eigenvectors (suggesting unidentifiable combinations):');
    result.nullspaceCombinations.forEach((combination, idx) => {
      console.log(`  Mode ${idx + 1} (λ = ${combination.eigenvalue.toExponential(6)}):`);
      combination.components.forEach(({ name, loading }) => {
        console.log(`    ${name}: ${loading.toFixed(4)}`);
      });
    });
    console.log();
  }

  if (result.topCorrelatedPairs.length > 0) {
    console.log('Top correlated parameter pairs:');
    result.topCorrelatedPairs.forEach(({ names, corr }) => {
      console.log(`  ${names[0]} vs ${names[1]}: corr = ${corr.toFixed(4)}`);
    });
    console.log();
  }

  console.log('Correlation matrix:');
  console.log(printMatrix(result.correlations));
  console.log();

  console.log('FIM matrix:');
  console.log(printMatrix(result.fimMatrix));
}

main();
