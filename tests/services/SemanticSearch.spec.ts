
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cosineSimilarity, semanticSearch, isSemanticSearchReady, preloadEmbeddingModel, getAllModels, resetSemanticSearchState, _internalState } from '../../services/semanticSearch';

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

export const mockLoadTransformersPipeline = vi.fn();
vi.mock('@/src/utils/transformersLoader', () => ({
    loadTransformersPipeline: () => mockLoadTransformersPipeline()
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
            mockLoadTransformersPipeline.mockResolvedValue((...args: any[]) => mockPipeline(...args));

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

        it('should handle embedding model load failure by throwing and setting loadError', async () => {
            // Override the default mock to throw an error
            mockLoadTransformersPipeline.mockRejectedValue(new Error('Failed to load transformers'));

            await expect(semanticSearch('test')).rejects.toThrow('Failed to load transformers');

            // If the search failed, subsequent attempts to load embedder should immediately throw the cached loadError
            // Calling it again without waiting for fetch will trigger the cached error branch
            await expect(semanticSearch('test')).rejects.toThrow('Failed to load transformers');
        });

        it('should handle string errors during model load', async () => {
            mockLoadTransformersPipeline.mockRejectedValue('String error');
            await expect(semanticSearch('test')).rejects.toThrow('String error');
        });

        it('should return cached embedder if already loaded', async () => {
            // First load
            await semanticSearch('test');
            // Second load should use cache
            const results = await semanticSearch('test2');
            expect(results).toBeDefined();
            expect(mockLoadTransformersPipeline).toHaveBeenCalledTimes(1);
        });

        it('should wait for ongoing load and return embedder', async () => {
            // Test the `if (isLoading)` branch with successful load
            let resolveLoad: any;
            mockLoadTransformersPipeline.mockReturnValue(new Promise(resolve => {
                resolveLoad = () => resolve((...args: any[]) => mockPipeline(...args));
            }));

            // Start first search which sets isLoading = true
            const searchPromise1 = semanticSearch('test1');

            // Wait a tick to ensure isLoading is true
            await new Promise(process.nextTick);

            // Start second search which should wait
            const searchPromise2 = semanticSearch('test2');

            // Resolve the pipeline load
            resolveLoad();

            const [results1, results2] = await Promise.all([searchPromise1, searchPromise2]);
            expect(results1).toBeDefined();
            expect(results2).toBeDefined();
        });

        it('should wait for ongoing load and throw cached error if it failed', async () => {
            // Test the `if (isLoading)` branch with failed load
            let rejectLoad: any;
            mockLoadTransformersPipeline.mockReturnValue(new Promise((_, reject) => {
                rejectLoad = () => reject(new Error('Delayed load error'));
            }));

            // Start first search which sets isLoading = true
            const searchPromise1 = semanticSearch('test1');

            // Wait a tick to ensure isLoading is true
            await new Promise(process.nextTick);

            // Start second search which should wait
            const searchPromise2 = semanticSearch('test2');

            // Reject the pipeline load
            rejectLoad();

            await expect(searchPromise1).rejects.toThrow('Delayed load error');
            await expect(searchPromise2).rejects.toThrow('Delayed load error');
        });

        it('should log warning if queryEmbedding length is 0', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            mockPipeline.mockResolvedValue(async () => {
                return {
                    data: new Float32Array([]) // Empty array
                };
            });

            await semanticSearch('test empty array');
            expect(warnSpy).toHaveBeenCalledWith('[SemanticSearch][DEBUG] queryEmbedding length:', 0);

            warnSpy.mockRestore();
        });

        it('should throw error if embed output is missing data', async () => {
            mockPipeline.mockResolvedValue(async () => {
                return {
                    // No data property
                };
            });

            await expect(semanticSearch('test missing data')).rejects.toThrow('Embedding pipeline returned unexpected output');
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

        it('should return false if index fetch is not ok', async () => {
            vi.spyOn(global, 'fetch').mockResolvedValue({
                ok: false,
                status: 404
            } as Response);

            const ready = await isSemanticSearchReady();
            expect(ready).toBe(false);
        });
    });

    describe('preloadEmbeddingModel', () => {
        it('should catch error and log warning if preloading fails', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const testError = new Error('Preload test error');
            mockLoadTransformersPipeline.mockRejectedValue(testError);

            preloadEmbeddingModel();

            // Wait a tick for the promise to reject
            await new Promise(process.nextTick);

            expect(warnSpy).toHaveBeenCalledWith('[SemanticSearch] Failed to preload model:', testError);
            warnSpy.mockRestore();
        });

        it('should successfully preload without logging errors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            mockLoadTransformersPipeline.mockResolvedValue((...args: any[]) => mockPipeline(...args));

            preloadEmbeddingModel();

            await new Promise(process.nextTick);

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('getAllModels', () => {
        it('should return all models with score 1', async () => {
            vi.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mockIndex
            } as Response);

            const models = await getAllModels();
            expect(models).toHaveLength(2);
            expect(models[0].id).toBe('m1');
            expect(models[0].score).toBe(1);
            expect(models[1].id).toBe('m2');
            expect(models[1].score).toBe(1);
        });

        it('should use import.meta.env.BASE_URL if available', async () => {
            vi.stubEnv('BASE_URL', '/test-base/');

            const fetchSpyLocal = vi.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mockIndex
            } as Response);

            await getAllModels();

            expect(fetchSpyLocal).toHaveBeenCalledWith('/test-base/model-embeddings.json');

            vi.unstubAllEnvs();
        });

        it('should fallback to root if BASE_URL is empty', async () => {
            // Unset or empty BASE_URL
            vi.stubEnv('BASE_URL', '');

            const fetchSpyLocal = vi.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => mockIndex
            } as Response);

            await getAllModels();

            // Should fallback to '/'
            expect(fetchSpyLocal).toHaveBeenCalledWith('/model-embeddings.json');

            vi.unstubAllEnvs();
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
