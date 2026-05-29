
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateExpandedNetwork, BNGLParser, NetworkGenerator, GraphCanonicalizer, SpeciesGraph } from '../src/index';

// Mocks
vi.mock('../src/services/graph/core/BNGLParser', () => ({
    BNGLParser: {
        parseSpeciesGraph: vi.fn(),
        parseRxnRule: vi.fn(),
        evaluateExpression: vi.fn().mockImplementation((expr) => parseFloat(expr) || 0)
    }
}));

// Robust Class Mock using vi.hoisted
const { mockGenerate } = vi.hoisted(() => ({
    mockGenerate: vi.fn()
}));

vi.mock('../src/services/graph/NetworkGenerator', () => {
    return {
        NetworkGenerator: vi.fn().mockImplementation(function (this: any) {
            this.generate = mockGenerate;
        })
    };
});

vi.mock('../src/services/graph/core/Canonical', () => ({
    GraphCanonicalizer: {
        canonicalize: vi.fn()
    }
}));

vi.mock('../src/services/simulation/ExpressionEvaluator', () => ({
    evaluateFunctionalRate: vi.fn((expr) => parseFloat(expr) || 1),
    expandRateLawMacros: vi.fn((expr, _substr) => expr),
    containsRateLawMacro: vi.fn(() => false)
}));

describe('NetworkExpansion Service', () => {

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mocks
        const createMockGraph = (id: string) => {
            const g = new SpeciesGraph();
            (g as any).id = id;
            return g;
        };

        vi.mocked(BNGLParser.parseSpeciesGraph).mockImplementation((name: string) => createMockGraph(name));
        vi.mocked(BNGLParser.parseRxnRule).mockReturnValue({
            name: 'rule',
            reactants: [],
            products: [],
            applyConstraints: vi.fn()
        } as any);
        vi.mocked(BNGLParser.evaluateExpression).mockImplementation((expr) => parseFloat(expr) || 0);
        vi.mocked(GraphCanonicalizer.canonicalize).mockImplementation((g: any) => (g as any).id || 'canon');

        mockGenerate.mockResolvedValue({
            species: [
                { graph: createMockGraph('A_canon') },
                { graph: createMockGraph('B_canon') }
            ],
            reactions: [
                { reactants: [0], products: [1], rate: 1, rateExpression: '1' }
            ]
        });
    });

    it('should initialize NetworkGenerator and run generation', async () => {
        const model = {
            species: [{ name: 'A', initialConcentration: 10 }],
            reactionRules: [
                { name: 'R1', rate: '1', reactants: ['A'], products: ['B'] }
            ],
            observables: [],
            functions: [],
            parameterChanges: []
        };

        vi.mocked(GraphCanonicalizer.canonicalize)
            .mockReturnValueOnce('A_canon') // Seed
            .mockReturnValueOnce('A_canon') // Result species 0
            .mockReturnValueOnce('B_canon') // Result species 1
            .mockReturnValueOnce('A_canon') // Rxn reactant
            .mockReturnValueOnce('B_canon'); // Rxn product

        const onProgress = vi.fn();
        const checkCancelled = vi.fn();

        const res = await generateExpandedNetwork(model as any, checkCancelled, onProgress);

        expect(NetworkGenerator).toHaveBeenCalled();
        expect(mockGenerate).toHaveBeenCalled();
        expect(res.species).toHaveLength(2);
        expect(res.reactions).toHaveLength(1);
    });

    it('should handle functional rates', async () => {
        const model = {
            species: [{ name: 'A' }],
            reactionRules: [
                { name: 'R1', rate: 'k1*A', reactants: ['A'], products: ['B'] }
            ],
            parameters: { k1: 2 },
            observables: [{ name: 'A' }],
            functions: [],
            parameterChanges: []
        };

        await generateExpandedNetwork(model as any, vi.fn(), vi.fn());
        // Coverage check
    });

    it('should propagate cancellation check', async () => {
        const model = {
            species: [], reactionRules: [], observables: [], functions: [], parameterChanges: []
        };

        mockGenerate.mockResolvedValue({ species: [], reactions: [] });

        const checkCancelled = vi.fn();
        await generateExpandedNetwork(model as any, checkCancelled, vi.fn());

        expect(checkCancelled).toHaveBeenCalled();
    });

});
