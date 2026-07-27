import { describe, it, expect } from 'vitest';
import {
    vecNorm,
    vecDot,
    vecScale,
    vecAdd,
    vecSub,
    vecScaleInto,
    vecAxpyInto,
} from '../../src/utils/vectorMath';

describe('vectorMath primitives', () => {
    it('should correctly calculate Euclidean norm (vecNorm)', () => {
        const v = new Float64Array([3, 4]);
        expect(vecNorm(v)).toBe(5);

        const v2 = new Float64Array([0, 0, 0]);
        expect(vecNorm(v2)).toBe(0);

        const v3 = new Float64Array([1, -1, 1, -1]);
        expect(vecNorm(v3)).toBe(2);
    });

    it('should correctly calculate dot product (vecDot)', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([4, 5, 6]);
        // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
        expect(vecDot(a, b)).toBe(32);

        const zero = new Float64Array([0, 0]);
        const any = new Float64Array([10, 20]);
        expect(vecDot(zero, any)).toBe(0);
    });

    it('should correctly scale a vector (vecScale)', () => {
        const v = new Float64Array([1, -2, 3]);
        const scaled = vecScale(v, 2.5);
        expect(scaled).toBeInstanceOf(Float64Array);
        expect(Array.from(scaled)).toEqual([2.5, -5, 7.5]);
    });

    it('should correctly add vectors (vecAdd)', () => {
        const a = new Float64Array([1, 2]);
        const b = new Float64Array([3, 4]);
        const sum = vecAdd(a, b);
        expect(sum).toBeInstanceOf(Float64Array);
        expect(Array.from(sum)).toEqual([4, 6]);
    });

    it('should correctly subtract vectors (vecSub)', () => {
        const a = new Float64Array([5, 10]);
        const b = new Float64Array([2, 4]);
        const diff = vecSub(a, b);
        expect(diff).toBeInstanceOf(Float64Array);
        expect(Array.from(diff)).toEqual([3, 6]);
    });

    it('should scale a vector in-place (vecScaleInto)', () => {
        const v = new Float64Array([1, 2, 3]);
        const out = new Float64Array(3);
        vecScaleInto(v, 3, out);
        expect(Array.from(out)).toEqual([3, 6, 9]);
    });

    it('should perform in-place AXPY (vecAxpyInto)', () => {
        const x = new Float64Array([1, 2, 3]);
        const y = new Float64Array([4, 5, 6]);
        const out = new Float64Array(3);
        // out = y + 2 * x = [4+2, 5+4, 6+6] = [6, 9, 12]
        vecAxpyInto(2, x, y, out);
        expect(Array.from(out)).toEqual([6, 9, 12]);
    });
});
