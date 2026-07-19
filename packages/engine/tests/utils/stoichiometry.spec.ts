import { describe, expect, it } from 'vitest';
import { buildStoichiometryMatrix } from '../../src/utils/stoichiometry';

describe('buildStoichiometryMatrix', () => {
    it('applies the sign convention over name-keyed reactions', () => {
        const idx = new Map([
            ['S1', 0],
            ['S2', 1],
            ['S3', 2],
        ]);
        const S = buildStoichiometryMatrix(
            [
                { reactants: ['S1'], products: ['S2'] },
                { reactants: ['S1', 'S2'], products: ['S3'] },
            ],
            3,
            (name: string) => idx.get(name),
        );
        // rows = species (S1,S2,S3), cols = reactions; reactant -1, product +1
        expect(S).toEqual([
            [-1, -1],
            [1, -1],
            [0, 1],
        ]);
    });

    it('works with already-resolved index entries (identity resolver)', () => {
        const S = buildStoichiometryMatrix(
            [{ reactants: [0], products: [1] }],
            2,
            (i: number) => i,
        );
        expect(S).toEqual([[-1], [1]]);
    });

    it('skips entries that do not resolve to a species row', () => {
        const idx = new Map([['S1', 0]]);
        const S = buildStoichiometryMatrix(
            [{ reactants: ['S1'], products: ['unknown'] }],
            3,
            (name: string) => idx.get(name),
        );
        expect(S).toEqual([[-1], [0], [0]]);
    });
});
