
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cosineSimilarity, semanticSearch, isSemanticSearchReady, resetSemanticSearchState, _internalState } from '../../services/semanticSearch';

// Mock fetching the index
const mockIndex = {
    version: 1,
    model: 'all-MiniLM-L6-v2',
    dimensions: 3,
    count: 2,
    generated: '2023-01-01',
    models: [
        {
            id: 'm1',
            filename: 'model1.bngl',
            path: '/path/m1',
            category: 'test',
            preview: 'preview1',
            embedding: [1, 0, 0] // Unit X
        },
        {
            id: 'm2',
            filename: 'model2.bngl',
            path: '/path/m2',
            category: 'test',
            preview: 'preview2',
            embedding: [0, 1, 0] // Unit Y
        }
    ]
};

// Mock pipeline
const mockPipeline = vi.fn();

// In the browser branch we load the UMD bundle which exposes a global
// `transformers.pipeline`. For the tests we emulate that global.
beforeEach(() => {
    (global as any).transformers = { pipeline: (...args: any[]) => mockPipeline(...args) };
});

// Also mock the Node import path (used when `window` is undefined in tests)
vi.mock('@xenova/transformers', () => ({
    pipeline: (...args: any[]) => mockPipeline(...args)
}));

describe('Semantic Search Service', () => {

    beforeEach(() => {
        resetSemanticSearchState();
        vi.resetAllMocks(); // Clear call counts
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Restore original implementations
    });

    describe('cosineSimilarity', () => {
        it('should compute 1 for identical vectors', () => {
            expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
        });
        it('should compute 0 for orthogonal vectors', () => {
            expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
        });
        it('should compute -1 for opposite vectors', () => {
            expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
        });
        it('should handle non-normalized vectors', () => {
            expect(cosineSimilarity([3, 0], [0, 4])).toBeCloseTo(0);
        });

        // Property-based testing for Cosine Similarity
        for (let i = 0; i < 40; i++) {
            it(`should be within [-1, 1] range for random vectors #${i}`, () => {
                const vecA = Array.from({ length: 5 }, () => Math.random() * 2 - 1);
                const vecB = Array.from({ length: 5 }, () => Math.random() * 2 - 1);
                if (vecA.every(v => v === 0) || vecB.every(v => v === 0)) return; // skip zero vectors
                const sim = cosineSimilarity(vecA, vecB);
                expect(sim).toBeGreaterThanOrEqual(-1.000001);
                expect(sim).toBeLessThanOrEqual(1.000001);
            });
        }
    });

    describe('semanticSearch', () => {
        let fetchSpy: any;

        beforeEach(() => {
            // Setup default successful fetch for search tests
            fetchSpy = vi.spyOn(global, 'fetch');
            fetchSpy.mockResolvedValue({
                ok: true,
                json: async () => mockIndex
            } as Response);

            // Setup default successful pipeline
            mockPipeline.mockResolvedValue(async (query: string) => {
                let data;
                if (query === 'find X') data = [1, 0, 0];
                else if (query === 'find Y') data = [0, 1, 0];
                else data = [0, 0, 1]; // Z-axis
                return {
                    data: new Float32Array(data)
                };
            });
        });

        it('should return top results for exact match', async () => {
            const results = await semanticSearch('find X');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('m1');
            expect(results[0].score).toBeCloseTo(1);
        });

        it('should rank correctly', async () => {
            const results = await semanticSearch('find Y');
            expect(results[0].id).toBe('m2');
            expect(results[0].score).toBeCloseTo(1);
            expect(results[1].id).toBe('m1');
            expect(results[1].score).toBeCloseTo(0);
        });

        it('should handle empty query', async () => {
            const results = await semanticSearch('   ');
            expect(results).toEqual([]);
        });

        it('should handle fetch failure by throwing', async () => {
            // Override the default mock for this specific test
            fetchSpy.mockResolvedValue({
                ok: false,
                status: 404
            } as Response);

            await expect(semanticSearch('test')).rejects.toThrow('Failed to load embeddings index: 404');
        });
    });

    describe('isSemanticSearchReady', () => {
        it('should return true if index loads', async () => {
            vi.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mockIndex
            } as Response);

            const ready = await isSemanticSearchReady();
            expect(ready).toBe(true);
        });

        it('should return false if index load fails', async () => {
            vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

            const ready = await isSemanticSearchReady();
            expect(ready).toBe(false);
        });
    });

    describe('resetSemanticSearchState', () => {
        it('should reset all internal state variables to defaults', () => {
            // Set internal state to dummy values
            _internalState.embedder = { dummy: true };
            _internalState.embeddingsIndex = { dummy: true } as any;
            _internalState.isLoading = true;
            _internalState.loadError = new Error('Test error');

            // Verify they were set
            expect(_internalState.embedder).not.toBeNull();
            expect(_internalState.embeddingsIndex).not.toBeNull();
            expect(_internalState.isLoading).toBe(true);
            expect(_internalState.loadError).not.toBeNull();

            // Call reset
            resetSemanticSearchState();

            // Verify they were reset
            expect(_internalState.embedder).toBeNull();
            expect(_internalState.embeddingsIndex).toBeNull();
            expect(_internalState.isLoading).toBe(false);
            expect(_internalState.loadError).toBeNull();
        });
    });
});
