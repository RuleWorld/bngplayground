/**
 * Tests for buildContactMapSnapshots — verifies time-varying species
 * concentrations are correctly aggregated to contact map elements.
 */
import { describe, it, expect } from 'vitest';
import { buildContactMapSnapshots } from '../../services/visualization/dynamicContactMap';
import type { SimulationResults } from '../../types';

describe('buildContactMapSnapshots', () => {
    it('returns empty array when no species data', () => {
        const results: SimulationResults = { headers: ['time'], data: [] };
        expect(buildContactMapSnapshots(results)).toEqual([]);
    });

    it('aggregates molecule abundance from species concentrations', () => {
        const results: SimulationResults = {
            headers: ['time', 'A_free', 'AB_complex'],
            data: [],
            speciesHeaders: ['A(b)', 'A(b!1).B(b!1)'],
            speciesData: [
                { time: 0, 'A(b)': 100, 'A(b!1).B(b!1)': 0 },
                { time: 1, 'A(b)': 50, 'A(b!1).B(b!1)': 50 },
            ],
        };

        const snapshots = buildContactMapSnapshots(results);
        expect(snapshots).toHaveLength(2);

        // At t=0: A has 100 from A(b), B has 0
        expect(snapshots[0].moleculeAbundance.get('A')).toBe(100);
        expect(snapshots[0].moleculeAbundance.has('B')).toBe(false);

        // At t=1: A has 50 + 50 = 100, B has 50
        expect(snapshots[1].moleculeAbundance.get('A')).toBe(100);
        expect(snapshots[1].moleculeAbundance.get('B')).toBe(50);
    });

    it('computes bond occupancy fraction', () => {
        const results: SimulationResults = {
            headers: ['time'],
            data: [],
            speciesHeaders: ['A(b)', 'A(b!1).B(b!1)'],
            speciesData: [
                { time: 1, 'A(b)': 50, 'A(b!1).B(b!1)': 50 },
            ],
        };

        const snapshots = buildContactMapSnapshots(results);
        expect(snapshots).toHaveLength(1);

        // Bond A.b--B.b should exist with occupancy fraction
        const bonds = snapshots[0].bondOccupancy;
        expect(bonds.size).toBeGreaterThan(0);
        // Bond is present in 50 out of 50 species that contain A.b
        const bondKey = Array.from(bonds.keys())[0];
        expect(bonds.get(bondKey)).toBeGreaterThan(0);
        expect(bonds.get(bondKey)).toBeLessThanOrEqual(1);
    });

    it('computes state fractions', () => {
        const results: SimulationResults = {
            headers: ['time'],
            data: [],
            speciesHeaders: ['A(s~U)', 'A(s~P)'],
            speciesData: [
                { time: 0, 'A(s~U)': 100, 'A(s~P)': 0 },
                { time: 1, 'A(s~U)': 25, 'A(s~P)': 75 },
            ],
        };

        const snapshots = buildContactMapSnapshots(results);
        expect(snapshots).toHaveLength(2);

        // At t=0: 100% U, 0% P
        expect(snapshots[0].stateFractions.get('A.s~U')).toBe(1.0);
        // At t=1: 25/(25+75) = 0.25 U, 75/(25+75) = 0.75 P
        expect(snapshots[1].stateFractions.get('A.s~U')).toBeCloseTo(0.25);
        expect(snapshots[1].stateFractions.get('A.s~P')).toBeCloseTo(0.75);
    });
});
