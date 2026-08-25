import { describe, expect, it } from 'vitest';
import {
    buildTrajectoryFeatureMatrix,
    type TrajectoryRun,
} from '../../services/trajectoryEmbedding';

const makeRun = (observables: Record<string, number[]>): TrajectoryRun => ({ observables });

describe('trajectory embedding feature construction', () => {
    it('balances observables with different count scales', () => {
        const runs = [
            makeRun({ large: [0, 0], small: [0, 0] }),
            makeRun({ large: [10, 10], small: [1, 1] }),
        ];

        const result = buildTrajectoryFeatureMatrix(runs, {
            observableNames: ['large', 'small'],
            normalization: 'robust',
        });

        expect(result.selectedObservableNames).toEqual(['large', 'small']);
        expect(result.matrix[0]).toHaveLength(4);
        expect(result.matrix[0][0]).toBeCloseTo(result.matrix[0][2]);
        expect(result.matrix[1][0]).toBeCloseTo(result.matrix[1][2]);
        expect(result.matrix[1][0] - result.matrix[0][0])
            .toBeCloseTo(result.matrix[1][2] - result.matrix[0][2]);
    });

    it('removes zero-weight and unobserved inputs without producing NaN values', () => {
        const runs = [
            makeRun({ A: [1, 2], B: [Number.NaN, Number.NaN], time: [0, 1] }),
            makeRun({ A: [2, 3], B: [], time: [0, 1] }),
        ];

        const result = buildTrajectoryFeatureMatrix(runs, {
            observableNames: ['A', 'B', 'time'],
            observableWeights: { A: 2, B: 0, time: 0 },
        });

        expect(result.selectedObservableNames).toEqual(['A']);
        expect(result.droppedObservableNames).toEqual(['B', 'time']);
        expect(result.matrix).toHaveLength(2);
        expect(result.matrix[0]).toHaveLength(2);
        expect(result.matrix.flat().every(Number.isFinite)).toBe(true);
    });

    it('samples evenly while preserving the first and last time points', () => {
        const result = buildTrajectoryFeatureMatrix([
            makeRun({ A: [0, 1, 2, 3, 4] }),
        ], {
            observableNames: ['A'],
            normalization: 'raw',
            maxTimePoints: 3,
        });

        expect(result.sampledTimePointCount).toBe(3);
        expect(result.matrix[0][0]).toBeCloseTo(0);
        expect(result.matrix[0][1]).toBeCloseTo(2 / Math.sqrt(3));
        expect(result.matrix[0][2]).toBeCloseTo(4 / Math.sqrt(3));
    });

    it('applies relative observable weights after per-observable scaling', () => {
        const result = buildTrajectoryFeatureMatrix([
            makeRun({ A: [0, 10], B: [0, 1] }),
            makeRun({ A: [10, 20], B: [1, 2] }),
        ], {
            observableNames: ['A', 'B'],
            observableWeights: { A: 4, B: 1 },
        });

        const AContribution = result.matrix[1][0] - result.matrix[0][0];
        const BContribution = result.matrix[1][2] - result.matrix[0][2];
        expect(Math.abs(AContribution / BContribution)).toBeCloseTo(2);
    });
});
