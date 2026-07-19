/**
 * vectorMath.ts — small dense vector primitives over Float64Array.
 *
 * These were reimplemented independently across the gradient optimizer,
 * eigen-solver, continuation, and stiffness-detector modules. Consolidated here
 * so there is one implementation of each. The allocating forms (returning a new
 * vector) are convenient; the `*Into` forms write into a caller-provided output
 * buffer and allocate nothing, for hot loops that reuse scratch arrays.
 */

/** Euclidean norm sqrt(sum v_i^2). */
export function vecNorm(v: Float64Array): number {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
}

/** Dot product sum a_i * b_i. */
export function vecDot(a: Float64Array, b: Float64Array): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

/** Scalar multiple, returning a new vector: v * s. */
export function vecScale(v: Float64Array, s: number): Float64Array {
    const r = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) r[i] = v[i] * s;
    return r;
}

/** Element-wise sum, returning a new vector: a + b. */
export function vecAdd(a: Float64Array, b: Float64Array): Float64Array {
    const r = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) r[i] = a[i] + b[i];
    return r;
}

/** Element-wise difference, returning a new vector: a - b. */
export function vecSub(a: Float64Array, b: Float64Array): Float64Array {
    const r = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) r[i] = a[i] - b[i];
    return r;
}

/** In-place scalar multiple: out = v * alpha. */
export function vecScaleInto(v: Float64Array, alpha: number, out: Float64Array): void {
    for (let i = 0; i < v.length; i++) out[i] = v[i] * alpha;
}

/** In-place AXPY: out = y + alpha * x. */
export function vecAxpyInto(
    alpha: number,
    x: Float64Array,
    y: Float64Array,
    out: Float64Array,
): void {
    for (let i = 0; i < x.length; i++) out[i] = y[i] + alpha * x[i];
}
