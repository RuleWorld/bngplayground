/**
 * ReactionInformationTheory.ts - Information-theoretic analysis of reaction firing events
 *
 * Computes mutual information, transfer entropy, and phase locking between
 * reaction channels from SSA firing logs, revealing hidden causal and
 * coordination structures in stochastic biochemical networks.
 */

import type { ReactionFiringEvent } from '../../types';

/* ------------------------------------------------------------------ */
/*  Public interfaces                                                  */
/* ------------------------------------------------------------------ */

export interface ReactionITConfig {
    firingLog: ReactionFiringEvent[];
    nReactions: number;
    binWidth?: number;
    nShuffles?: number;
    historyLength?: number;
    minCoFirings?: number;
}

export interface MutualInformationResult {
    pair: {
        reaction1: number;
        reaction2: number;
        reaction1Name?: string;
        reaction2Name?: string;
    };
    mutualInformation: number;
    normalizedMI: number;
    pValue: number;
}

export interface TransferEntropyResult {
    source: number;
    target: number;
    sourceName?: string;
    targetName?: string;
    transferEntropy: number;
    reverseTE: number;
    netInformationFlow: number;
    pValue: number;
}

export interface PhaseLockingResult {
    pair: { reaction1: number; reaction2: number };
    phaseLockingValue: number;
    dominantPhaseOffset: number;
    isLocked: boolean;
}

export interface ReactionITResult {
    mutualInformation: MutualInformationResult[];
    transferEntropy: TransferEntropyResult[];
    phaseLocking: PhaseLockingResult[];
    entropy: Array<{ reactionIndex: number; name?: string; entropy: number }>;
    empiricalCausalGraph: Array<{ source: number; target: number; weight: number }>;
}

/* ------------------------------------------------------------------ */
/*  FFT (Cooley-Tukey radix-2)                                         */
/* ------------------------------------------------------------------ */

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

/**
 * In-place Cooley-Tukey radix-2 FFT.
 * `re` and `im` are modified in place; length must be a power of 2.
 */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
    const n = re.length;
    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if (i < j) {
            let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
            tmp = im[i]; im[i] = im[j]; im[j] = tmp;
        }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = (sign * 2 * Math.PI) / len;
        const wRe = Math.cos(angle);
        const wIm = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < halfLen; j++) {
                const uRe = re[i + j];
                const uIm = im[i + j];
                const vRe = re[i + j + halfLen] * curRe - im[i + j + halfLen] * curIm;
                const vIm = re[i + j + halfLen] * curIm + im[i + j + halfLen] * curRe;
                re[i + j] = uRe + vRe;
                im[i + j] = uIm + vIm;
                re[i + j + halfLen] = uRe - vRe;
                im[i + j + halfLen] = uIm - vIm;
                const tmpRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = tmpRe;
            }
        }
    }
    if (inverse) {
        for (let i = 0; i < n; i++) {
            re[i] /= n;
            im[i] /= n;
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function binaryEntropy(p1: number): number {
    if (p1 <= 0 || p1 >= 1) return 0;
    const p0 = 1 - p1;
    return -p1 * Math.log2(p1) - p0 * Math.log2(p0);
}

function jointEntropy2(p00: number, p01: number, p10: number, p11: number): number {
    let h = 0;
    for (const p of [p00, p01, p10, p11]) {
        if (p > 0) h -= p * Math.log2(p);
    }
    return h;
}

/** Discretize firing log into binary time series per reaction. */
function discretize(
    firingLog: ReactionFiringEvent[],
    nReactions: number,
    binWidth: number,
): { series: Uint8Array[]; nBins: number; names: Map<number, string> } {
    if (firingLog.length === 0) return { series: [], nBins: 0, names: new Map() };

    let tMin = Infinity, tMax = -Infinity;
    for (const e of firingLog) {
        if (e.time < tMin) tMin = e.time;
        if (e.time > tMax) tMax = e.time;
    }
    const nBins = Math.max(1, Math.ceil((tMax - tMin) / binWidth) + 1);
    const series: Uint8Array[] = [];
    for (let i = 0; i < nReactions; i++) series.push(new Uint8Array(nBins));

    const names = new Map<number, string>();
    for (const e of firingLog) {
        const bin = Math.min(Math.floor((e.time - tMin) / binWidth), nBins - 1);
        const reactionIndex = Number.isInteger(e.reactionIndex) ? e.reactionIndex : -1;
        if (
            reactionIndex >= 0 &&
            reactionIndex < nReactions &&
            Number.isInteger(bin) &&
            bin >= 0 &&
            bin < nBins
        ) {
            series[reactionIndex].set([1], bin);
        }
        if (e.ruleName && reactionIndex >= 0 && reactionIndex < nReactions && !names.has(reactionIndex)) {
            names.set(reactionIndex, e.ruleName);
        }
    }
    return { series, nBins, names };
}

function autoDetectBinWidth(firingLog: ReactionFiringEvent[]): number {
    if (firingLog.length < 2) return 1;
    // Group by reaction, compute inter-firing intervals, take median / 10
    const byRxn = new Map<number, number[]>();
    for (const e of firingLog) {
        let arr = byRxn.get(e.reactionIndex);
        if (!arr) { arr = []; byRxn.set(e.reactionIndex, arr); }
        arr.push(e.time);
    }
    const allIntervals: number[] = [];
    for (const times of byRxn.values()) {
        times.sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) {
            const dt = times[i] - times[i - 1];
            if (dt > 0) allIntervals.push(dt);
        }
    }
    if (allIntervals.length === 0) return 1;
    allIntervals.sort((a, b) => a - b);
    const median = allIntervals[Math.floor(allIntervals.length / 2)];
    return Math.max(median / 10, 1e-12);
}

/** Simple seeded LCG for shuffle reproducibility. */
let _shuffleSeed = 42;
function seededRand(): number {
    _shuffleSeed = (_shuffleSeed * 1664525 + 1013904223) & 0x7fffffff;
    return _shuffleSeed / 0x7fffffff;
}

/** Shuffle an array in place (Fisher-Yates) with seeded PRNG. */
function shuffle(arr: Uint8Array): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededRand() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
}

/** Compute p(bin=1) for a binary series. */
function p1(s: Uint8Array): number {
    let c = 0;
    for (let i = 0; i < s.length; i++) c += s[i];
    return c / s.length;
}

/* ------------------------------------------------------------------ */
/*  Mutual information                                                 */
/* ------------------------------------------------------------------ */

function computeMI(
    sA: Uint8Array,
    sB: Uint8Array,
    n: number,
): { mi: number; hA: number; hB: number } {
    let c00 = 0, c01 = 0, c10 = 0, c11 = 0;
    for (let t = 0; t < n; t++) {
        const a = sA[t], b = sB[t];
        if (a === 0 && b === 0) c00++;
        else if (a === 0 && b === 1) c01++;
        else if (a === 1 && b === 0) c10++;
        else c11++;
    }
    const total = c00 + c01 + c10 + c11;
    const hA = binaryEntropy((c10 + c11) / total);
    const hB = binaryEntropy((c01 + c11) / total);
    const hAB = jointEntropy2(c00 / total, c01 / total, c10 / total, c11 / total);
    const mi = Math.max(0, hA + hB - hAB);
    return { mi, hA, hB };
}

/* ------------------------------------------------------------------ */
/*  Transfer entropy                                                   */
/* ------------------------------------------------------------------ */

/**
 * TE(X -> Y) using conditional histograms with Bayesian regularization.
 * k = history length.
 * Pseudocount = 1/N for each bin of each conditional histogram.
 */
function computeTE(
    sX: Uint8Array,
    sY: Uint8Array,
    n: number,
    k: number,
): number {
    // State of Y history is encoded as a k-bit integer (binary).
    // Similarly for X history.
    const nStates = 1 << k; // 2^k
    const pseudo = 1 / n;

    // Counts: joint (yHist, xHist, yNext)
    // yHist: 0..nStates-1, xHist: 0..nStates-1, yNext: 0 or 1
    const countFull = new Float64Array(nStates * nStates * 2);
    // Counts: (yHist, yNext) — marginalised over X
    const countReduced = new Float64Array(nStates * 2);

    for (let t = k; t < n; t++) {
        let yHist = 0, xHist = 0;
        for (let d = 1; d <= k; d++) {
            yHist = (yHist << 1) | sY[t - d];
            xHist = (xHist << 1) | sX[t - d];
        }
        const yNext = sY[t];
        countFull[(yHist * nStates + xHist) * 2 + yNext] += 1;
        countReduced[yHist * 2 + yNext] += 1;
    }

    const totalSamples = n - k;
    if (totalSamples <= 0) return 0;

    // Add pseudocounts
    const totalPseudoFull = nStates * nStates * 2 * pseudo;

    let te = 0;
    for (let yH = 0; yH < nStates; yH++) {
        for (let xH = 0; xH < nStates; xH++) {
            for (let yN = 0; yN < 2; yN++) {
                const cFull = countFull[(yH * nStates + xH) * 2 + yN] + pseudo;
                const cFullMarg = (countFull[(yH * nStates + xH) * 2 + 0] + pseudo) +
                                  (countFull[(yH * nStates + xH) * 2 + 1] + pseudo);
                const cRed = countReduced[yH * 2 + yN] + pseudo;
                const cRedMarg = (countReduced[yH * 2 + 0] + pseudo) +
                                 (countReduced[yH * 2 + 1] + pseudo);

                const pFull = cFull / (totalSamples + totalPseudoFull);
                const pCondFull = cFull / cFullMarg;
                const pCondRed = cRed / cRedMarg;

                if (pCondFull > 0 && pCondRed > 0) {
                    te += pFull * Math.log2(pCondFull / pCondRed);
                }
            }
        }
    }
    return Math.max(0, te);
}

/* ------------------------------------------------------------------ */
/*  Phase locking                                                      */
/* ------------------------------------------------------------------ */

/**
 * Extract instantaneous phase via analytic signal (Hilbert transform):
 * FFT -> zero negative freqs -> IFFT -> atan2(im, re).
 */
function instantaneousPhase(signal: Uint8Array, n: number): Float64Array {
    const padLen = nextPow2(n);
    const re = new Float64Array(padLen);
    const im = new Float64Array(padLen);

    // Demean
    let mean = 0;
    for (let i = 0; i < n; i++) mean += signal[i];
    mean /= n;
    for (let i = 0; i < n; i++) re[i] = signal[i] - mean;

    fft(re, im, false);

    // Zero negative frequencies, double positive (analytic signal)
    // DC and Nyquist stay the same
    for (let i = 1; i < padLen / 2; i++) {
        re[i] *= 2;
        im[i] *= 2;
    }
    for (let i = padLen / 2 + 1; i < padLen; i++) {
        re[i] = 0;
        im[i] = 0;
    }

    fft(re, im, true);

    const phase = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        phase[i] = Math.atan2(im[i], re[i]);
    }
    return phase;
}

function computePLV(
    phaseA: Float64Array,
    phaseB: Float64Array,
    n: number,
): { plv: number; dominantOffset: number } {
    let sumCos = 0, sumSin = 0;
    for (let i = 0; i < n; i++) {
        const dPhi = phaseA[i] - phaseB[i];
        sumCos += Math.cos(dPhi);
        sumSin += Math.sin(dPhi);
    }
    const plv = Math.sqrt(sumCos * sumCos + sumSin * sumSin) / n;
    const dominantOffset = Math.atan2(sumSin, sumCos);
    return { plv, dominantOffset };
}

/* ------------------------------------------------------------------ */
/*  Main analysis function                                             */
/* ------------------------------------------------------------------ */

export function analyzeReactionInformation(config: ReactionITConfig): ReactionITResult {
    const {
        firingLog,
        nReactions,
        nShuffles = 200,
        historyLength = 1,
        minCoFirings = 0,
    } = config;

    const binWidth = config.binWidth ?? autoDetectBinWidth(firingLog);
    const { series, nBins, names } = discretize(firingLog, nReactions, binWidth);

    if (nBins === 0 || series.length === 0) {
        return {
            mutualInformation: [],
            transferEntropy: [],
            phaseLocking: [],
            entropy: [],
            empiricalCausalGraph: [],
        };
    }

    const k = Math.max(1, Math.min(historyLength, 8)); // cap history to 8 bits

    // ---- Per-reaction entropy ----
    const entropies: Array<{ reactionIndex: number; name?: string; entropy: number }> = [];
    const hVals: number[] = [];
    for (let r = 0; r < nReactions; r++) {
        const h = binaryEntropy(p1(series[r]));
        hVals.push(h);
        entropies.push({ reactionIndex: r, name: names.get(r), entropy: h });
    }

    // ---- Pairwise MI ----
    const miResults: MutualInformationResult[] = [];
    for (let i = 0; i < nReactions; i++) {
        for (let j = i + 1; j < nReactions; j++) {
            // Check minimum co-firings
            if (minCoFirings > 0) {
                let coFire = 0;
                for (let t = 0; t < nBins; t++) {
                    if (series[i][t] === 1 && series[j][t] === 1) coFire++;
                }
                if (coFire < minCoFirings) continue;
            }

            const { mi } = computeMI(series[i], series[j], nBins);
            const minH = Math.min(hVals[i], hVals[j]);
            const normMI = minH > 0 ? mi / minH : 0;

            // Significance via shuffle test
            let countAbove = 0;
            const shuffled = new Uint8Array(series[i]);
            for (let s = 0; s < nShuffles; s++) {
                shuffled.set(series[i]);
                shuffle(shuffled);
                const { mi: miShuf } = computeMI(shuffled, series[j], nBins);
                if (miShuf >= mi) countAbove++;
            }
            const pValue = countAbove / nShuffles;

            miResults.push({
                pair: {
                    reaction1: i,
                    reaction2: j,
                    reaction1Name: names.get(i),
                    reaction2Name: names.get(j),
                },
                mutualInformation: mi,
                normalizedMI: normMI,
                pValue,
            });
        }
    }

    // ---- Transfer entropy ----
    const teResults: TransferEntropyResult[] = [];
    for (let i = 0; i < nReactions; i++) {
        for (let j = 0; j < nReactions; j++) {
            if (i === j) continue;
            const teForward = computeTE(series[i], series[j], nBins, k);
            const teReverse = computeTE(series[j], series[i], nBins, k);
            const netFlow = teForward - teReverse;

            // Shuffle test on forward TE
            let countAbove = 0;
            const shuffled = new Uint8Array(series[i]);
            for (let s = 0; s < nShuffles; s++) {
                shuffled.set(series[i]);
                shuffle(shuffled);
                const teShuf = computeTE(shuffled, series[j], nBins, k);
                if (teShuf >= teForward) countAbove++;
            }
            const pValue = countAbove / nShuffles;

            teResults.push({
                source: i,
                target: j,
                sourceName: names.get(i),
                targetName: names.get(j),
                transferEntropy: teForward,
                reverseTE: teReverse,
                netInformationFlow: netFlow,
                pValue,
            });
        }
    }

    // ---- Phase locking ----
    const plResults: PhaseLockingResult[] = [];
    const phases: Float64Array[] = [];
    for (let r = 0; r < nReactions; r++) {
        phases.push(instantaneousPhase(series[r], nBins));
    }
    for (let i = 0; i < nReactions; i++) {
        for (let j = i + 1; j < nReactions; j++) {
            const { plv, dominantOffset } = computePLV(phases[i], phases[j], nBins);
            // Significance threshold: PLV > 2/sqrt(nBins) is a rough significance criterion
            const isLocked = plv > 2 / Math.sqrt(nBins);
            plResults.push({
                pair: { reaction1: i, reaction2: j },
                phaseLockingValue: plv,
                dominantPhaseOffset: dominantOffset,
                isLocked,
            });
        }
    }

    // ---- Empirical causal graph ----
    const causalEdges: Array<{ source: number; target: number; weight: number }> = [];
    for (const te of teResults) {
        if (te.pValue < 0.05 && te.netInformationFlow > 0) {
            causalEdges.push({
                source: te.source,
                target: te.target,
                weight: te.netInformationFlow,
            });
        }
    }

    return {
        mutualInformation: miResults,
        transferEntropy: teResults,
        phaseLocking: plResults,
        entropy: entropies,
        empiricalCausalGraph: causalEdges,
    };
}

/* ------------------------------------------------------------------ */
/*  Compare empirical causal graph to structural edges                 */
/* ------------------------------------------------------------------ */

export interface CausalGraphComparison {
    concordant: Array<{ source: number; target: number; empiricalWeight: number }>;
    structuralOnly: Array<{ source: number; target: number }>;
    emergent: Array<{ source: number; target: number; empiricalWeight: number }>;
}

export function compareCausalGraphs(
    empirical: Array<{ source: number; target: number; weight: number }>,
    structuralEdges: Array<{ source: number; target: number }>,
): CausalGraphComparison {
    const structSet = new Set<string>();
    for (const e of structuralEdges) {
        structSet.add(`${e.source}->${e.target}`);
    }
    const empSet = new Set<string>();
    for (const e of empirical) {
        empSet.add(`${e.source}->${e.target}`);
    }

    const concordant: CausalGraphComparison['concordant'] = [];
    const emergent: CausalGraphComparison['emergent'] = [];
    const structuralOnly: CausalGraphComparison['structuralOnly'] = [];

    for (const e of empirical) {
        const key = `${e.source}->${e.target}`;
        if (structSet.has(key)) {
            concordant.push({ source: e.source, target: e.target, empiricalWeight: e.weight });
        } else {
            emergent.push({ source: e.source, target: e.target, empiricalWeight: e.weight });
        }
    }
    for (const e of structuralEdges) {
        const key = `${e.source}->${e.target}`;
        if (!empSet.has(key)) {
            structuralOnly.push({ source: e.source, target: e.target });
        }
    }

    return { concordant, structuralOnly, emergent };
}
