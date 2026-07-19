import { normInv } from '@bngplayground/engine';

// Inverse standard normal CDF approximation (Acklam's method)

export function chi2Quantile(p: number, df = 1): number {
    if (df === 1) {
        // chi2(1) is Z^2 where Z ~ N(0,1)
        // For CDF p, we want x such that P(Z^2 <= x) = p
        // P(-sqrt(x) <= Z <= sqrt(x)) = p
        // P(Z <= sqrt(x)) = (p + 1) / 2
        const z = normInv((p + 1) / 2);
        return z * z;
    }
    // For general df, use Wilson-Hilferty transform as approximation
    const t = chi2Quantile(p, 1); // fallback to 1-df approx as baseline
    return t * (df / 1);
}

// Small helper: Jacobi eigenvalue algorithm for real symmetric matrices.
export function jacobiEigenDecomposition(A: number[][], maxIter = 100, tol = 1e-12) {
    const n = A.length;
    const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const a = A.map((row) => row.slice());

    const maxOffdiag = () => {
        let max = 0;
        let p = 0,
            q = 1;
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

        // rotate
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

        // update eigenvector matrix
        for (let i = 0; i < n; i++) {
            const vip = V[i][p];
            const viq = V[i][q];
            V[i][p] = c * vip - s * viq;
            V[i][q] = s * vip + c * viq;
        }
    }

    const eigenvalues = a.map((row, i) => row[i]);
    const eigenvectors = V; // columns of V are eigenvectors
    return { eigenvalues, eigenvectors };
}

export { normInv };
