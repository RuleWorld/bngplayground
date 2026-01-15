
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeFIM } from '../../services/fim';
import { bnglService } from '../../services/bnglService';

// Mock dependencies
vi.mock('../../services/bnglService', () => ({
    bnglService: {
        prepareModel: vi.fn(),
        simulateCached: vi.fn(),
        releaseModel: vi.fn()
    }
}));

describe('FIM Service', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should compute FIM for simple identifiable parameter', async () => {
        // Setup mock model
        const model = { parameters: { k1: 1.0 } };
        const paramNames = ['k1'];
        
        // Mock prepare
        vi.mocked(bnglService.prepareModel).mockResolvedValue(123);
        vi.mocked(bnglService.releaseModel).mockResolvedValue();
        
        // Mock simulations
        // 1 baseline + 2 perturbations (plus, minus)
        // Baseline: A(t) = exp(-k*t). At t=1, exp(-1) = 0.3678
        // k+ (1+eps): exp(-(1+eps)*t)
        // k- (1-eps): exp(-(1-eps)*t)
        
        const eps = 1e-4;
        const baseVal = 0.367879; // exp(-1)
        
        vi.mocked(bnglService.simulateCached).mockImplementation(async (id, override) => {
             let val = baseVal;
             if (override && override.k1) {
                 const k = override.k1;
                 val = Math.exp(-k); // Simple model A(1) = exp(-k)
             }
             return {
                 data: [{ time: 1, A: val }], // Single timepoint
                 headers: ['time', 'A']
             };
        });
        
        const result = await computeFIM(
            model as any, 
            paramNames, 
            {} as any, 
            undefined, 
            undefined, 
            false // last timepoint only
        );
        
        expect(result).toBeDefined();
        expect(result.eigenvalues).toHaveLength(1);
        expect(result.eigenvalues[0]).toBeGreaterThan(0);
        expect(result.conditionNumber).toBeCloseTo(1); // 1 parameter -> cond=1
        
        // Check Jacobian entry: d(exp(-k))/dk = -exp(-k). At k=1 -> -0.3678
        expect(result.jacobian![0][0]).toBeCloseTo(-baseVal, 3);
    });

    it('should identify unidentifiable parameter (flat sensitivity)', async () => {
        const model = { parameters: { k1: 1.0 } };
        const paramNames = ['k1'];
        
        vi.mocked(bnglService.prepareModel).mockResolvedValue(123);
        
        // Mock simulation: Output is constant regardless of k1
        vi.mocked(bnglService.simulateCached).mockResolvedValue({
            data: [{ time: 1, A: 10 }],
            headers: ['time', 'A']
        });
        
        const result = await computeFIM(model as any, paramNames, {} as any);
        
        // Jacobian should be 0. FIM should be 0.
        expect(result.eigenvalues[0]).toBeCloseTo(0);
        expect(result.conditionNumber).toBe(Infinity);
        
        // Should be flagged as unidentifiable
        expect(result.unidentifiableParams).toContain('k1');
    });

    it('should handle multiple parameters', async () => {
         const model = { parameters: { k1: 1, k2: 2 } };
         const paramNames = ['k1', 'k2'];
         
         vi.mocked(bnglService.prepareModel).mockResolvedValue(123);
         
         vi.mocked(bnglService.simulateCached).mockImplementation(async (id, override) => {
             const k1 = override?.k1 ?? 1;
             const k2 = override?.k2 ?? 2;
             // Linear model: Y = k1 + k2
             return {
                 data: [{ time: 1, Y: k1 + k2 }],
                 headers: ['time', 'Y']
             };
         });
         
         const result = await computeFIM(model as any, paramNames, {} as any);
         
         // J = [[1, 1]]. FIM = [[1, 1], [1, 1]].
         // Eigenvalues: 2, 0.
         // Unidentifiable (linear dependence)
         
         expect(result.eigenvalues[0]).toBeCloseTo(2);
         expect(result.eigenvalues[1]).toBeCloseTo(0);
         expect(result.conditionNumber).toBe(Infinity);
         
         // Both parameters involved in null space
         expect(result.unidentifiableParams).toContain('k1');
         expect(result.unidentifiableParams).toContain('k2');
    });
    
    it('should respect abort signal', async () => {
        const model = { parameters: { k1: 1.0 } };
        vi.mocked(bnglService.prepareModel).mockResolvedValue(123);
        vi.mocked(bnglService.simulateCached).mockRejectedValue(new DOMException('Aborted', 'AbortError'));
        
        const controller = new AbortController();
        controller.abort();
        
        await expect(computeFIM(model as any, ['k1'], {} as any, controller.signal))
            .rejects.toThrow('Aborted');
            
        expect(bnglService.releaseModel).toHaveBeenCalled(); // cleanup
    });

});
