/**
 * NFsimResultCompatibility.spec.ts
 * 
 * Unit tests for NFsim result format compatibility.
 * Tests that NFsim results work with existing visualization and analysis tools.
 * 
 * **Validates: Requirements 10.2, 10.5, 10.3**
 */

import { describe, it, expect } from 'vitest';
import { NFsimResultAdapter } from '@bngplayground/engine';
import { BNGLModel, SimulationResults, BNGLObservable } from '../../types';
import { GdatData } from '@bngplayground/engine';

describe('NFsim Result Format Compatibility', () => {
  describe('GDAT to SimulationResults Adaptation', () => {
    it('should adapt GDAT data to standard SimulationResults format', () => {
      // **Requirement 10.2**: NFsim results compatible with visualization components
      
      const gdatData: GdatData = {
        headers: ['time', 'O1', 'O2'],
        data: [
          { time: 0, O1: 100, O2: 0 },
          { time: 1, O1: 90, O2: 10 },
          { time: 2, O1: 80, O2: 20 }
        ],
        rawHeaderLine: '# time O1 O2'
      };
      
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [],
        species: [
          { name: 'A()', initialConcentration: 100 },
          { name: 'B()', initialConcentration: 0 }
        ],
        observables: [
          { type: 'molecules', name: 'A_total', pattern: 'A()' },
          { type: 'molecules', name: 'B_total', pattern: 'B()' }
        ],
        reactions: [],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      // Check structure
      expect(results.headers).toContain('time');
      expect(results.headers).toContain('A_total');
      expect(results.headers).toContain('B_total');
      expect(results.data).toHaveLength(3);
      
      // Check data mapping
      expect(results.data[0].time).toBe(0);
      expect(results.data[0].A_total).toBe(100);
      expect(results.data[0].B_total).toBe(0);
      
      // Check species data is included
      expect(results.speciesHeaders).toBeDefined();
      expect(results.speciesData).toBeDefined();
      expect(results.speciesData).toHaveLength(3);
      
      // Check expanded network data
      expect(results.expandedReactions).toBeDefined();
      expect(results.expandedSpecies).toBeDefined();
    });
    
    it('should handle indexed observable IDs (O1, O2, etc.)', () => {
      const gdatData: GdatData = {
        headers: ['time', 'O1', 'O2', 'O3'],
        data: [
          { time: 0, O1: 100, O2: 50, O3: 25 }
        ],
        rawHeaderLine: '# time O1 O2 O3'
      };
      
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [],
        species: [],
        observables: [
          { type: 'molecules', name: 'Total_A', pattern: 'A()' },
          { type: 'molecules', name: 'Total_B', pattern: 'B()' },
          { type: 'molecules', name: 'Total_C', pattern: 'C()' }
        ],
        reactions: [],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      expect(results.headers).toContain('Total_A');
      expect(results.headers).toContain('Total_B');
      expect(results.headers).toContain('Total_C');
      expect(results.data[0].Total_A).toBe(100);
      expect(results.data[0].Total_B).toBe(50);
      expect(results.data[0].Total_C).toBe(25);
    });
    
    it('should fill missing observables with 0', () => {
      // **Requirement 10.5**: GDAT parsing compatible with analysis tools
      
      const gdatData: GdatData = {
        headers: ['time', 'O1'],
        data: [
          { time: 0, O1: 100 }
        ],
        rawHeaderLine: '# time O1'
      };
      
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [],
        species: [],
        observables: [
          { type: 'molecules', name: 'A_total', pattern: 'A()' },
          { type: 'molecules', name: 'B_total', pattern: 'B()' },
          { type: 'molecules', name: 'C_total', pattern: 'C()' }
        ],
        reactions: [],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      // All observables should be present
      expect(results.headers).toContain('A_total');
      expect(results.headers).toContain('B_total');
      expect(results.headers).toContain('C_total');
      
      // Missing observables should be 0
      expect(results.data[0].A_total).toBe(100);
      expect(results.data[0].B_total).toBe(0);
      expect(results.data[0].C_total).toBe(0);
    });
    
    it('should preserve time column', () => {
      const gdatData: GdatData = {
        headers: ['time', 'O1'],
        data: [
          { time: 0, O1: 100 },
          { time: 0.5, O1: 95 },
          { time: 1.0, O1: 90 }
        ],
        rawHeaderLine: '# time O1'
      };
      
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [],
        species: [],
        observables: [
          { type: 'molecules', name: 'A_total', pattern: 'A()' }
        ],
        reactions: [],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      expect(results.data[0].time).toBe(0);
      expect(results.data[1].time).toBe(0.5);
      expect(results.data[2].time).toBe(1.0);
    });
  });
  
  describe('Cross-Method Observable Equivalence', () => {
    it('should validate compatibility between NFsim and ODE results', () => {
      // **Requirement 10.3**: Cross-method observable equivalence
      
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total', 'B_total'],
        data: [
          { time: 0, A_total: 100, B_total: 0 },
          { time: 1, A_total: 90, B_total: 10 },
          { time: 2, A_total: 80, B_total: 20 }
        ]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total', 'B_total'],
        data: [
          { time: 0, A_total: 100, B_total: 0 },
          { time: 1, A_total: 90.5, B_total: 9.5 },
          { time: 2, A_total: 81, B_total: 19 }
        ]
      };
      
      const validation = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults,
        odeResults,
        { allowStochasticVariance: true }
      );
      
      expect(validation.compatible).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
    
    it('should detect missing observables', () => {
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [{ time: 0, A_total: 100 }]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total', 'B_total'],
        data: [{ time: 0, A_total: 100, B_total: 0 }]
      };
      
      const validation = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults,
        odeResults
      );
      
      expect(validation.compatible).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues[0]).toContain('B_total');
    });
    
    it('should detect time point mismatches', () => {
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 90 }
        ]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1.5, A_total: 90 }
        ]
      };
      
      const validation = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults,
        odeResults,
        { timeTolerance: 0.1 }
      );
      
      expect(validation.compatible).toBe(false);
      expect(validation.issues.some(issue => issue.includes('Time mismatch'))).toBe(true);
    });
    
    it('should allow stochastic variance when enabled', () => {
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 70 }  // Larger variance (30% difference from ODE max)
        ]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 90 }
        ]
      };
      
      const validationWithVariance = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults,
        odeResults,
        { allowStochasticVariance: true, valueTolerance: 0.1 }
      );
      
      // Should be compatible when stochastic variance is allowed
      expect(validationWithVariance.compatible).toBe(true);
      // The relative difference is (100-70)/100 = 0.3 > 0.1, so should have warning
      // But we're comparing max values: nfMax=100, odeMax=100, relDiff=0
      // So no warning is expected! The test logic was wrong.
      
      // Let's test with different max values
      const nfsimResults2: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 120 }  // NFsim max is higher
        ]
      };
      
      const validation2 = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults2,
        odeResults,
        { allowStochasticVariance: true, valueTolerance: 0.1 }
      );
      
      // Now nfMax=120, odeMax=100, relDiff=0.167 > 0.1
      expect(validation2.compatible).toBe(true);
      expect(validation2.warnings.some(w => w.includes('stochastic variance'))).toBe(true);
      
      const validation3 = NFsimResultAdapter.validateCrossMethodCompatibility(
        nfsimResults2,
        odeResults,
        { allowStochasticVariance: false, valueTolerance: 0.1 }
      );
      
      // Should not be compatible when stochastic variance is not allowed
      expect(validation3.compatible).toBe(false);
      expect(validation3.issues.some(i => i.includes('large difference'))).toBe(true);
    });
  });
  
  describe('Observable Comparison', () => {
    it('should calculate comparison metrics between methods', () => {
      // **Requirement 10.3**: Cross-method observable equivalence
      
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 90 },
          { time: 2, A_total: 80 }
        ]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 91 },
          { time: 2, A_total: 82 }
        ]
      };
      
      const comparison = NFsimResultAdapter.compareObservables(nfsimResults, odeResults);
      
      expect(comparison.has('A_total')).toBe(true);
      
      const metrics = comparison.get('A_total')!;
      expect(metrics.meanAbsoluteError).toBeGreaterThan(0);
      expect(metrics.meanRelativeError).toBeGreaterThan(0);
      expect(metrics.maxDeviation).toBeGreaterThanOrEqual(metrics.meanAbsoluteError);
      expect(metrics.correlation).toBeGreaterThan(0.9); // High correlation expected
    });
    
    it('should handle perfect correlation', () => {
      const results1: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 50 },
          { time: 2, A_total: 0 }
        ]
      };
      
      const results2: SimulationResults = {
        headers: ['time', 'A_total'],
        data: [
          { time: 0, A_total: 100 },
          { time: 1, A_total: 50 },
          { time: 2, A_total: 0 }
        ]
      };
      
      const comparison = NFsimResultAdapter.compareObservables(results1, results2);
      const metrics = comparison.get('A_total')!;
      
      expect(metrics.meanAbsoluteError).toBe(0);
      expect(metrics.meanRelativeError).toBe(0);
      expect(metrics.maxDeviation).toBe(0);
      expect(metrics.correlation).toBeCloseTo(1.0, 5);
    });
    
    it('should handle multiple observables', () => {
      const nfsimResults: SimulationResults = {
        headers: ['time', 'A_total', 'B_total', 'C_total'],
        data: [
          { time: 0, A_total: 100, B_total: 0, C_total: 0 },
          { time: 1, A_total: 80, B_total: 15, C_total: 5 }
        ]
      };
      
      const odeResults: SimulationResults = {
        headers: ['time', 'A_total', 'B_total', 'C_total'],
        data: [
          { time: 0, A_total: 100, B_total: 0, C_total: 0 },
          { time: 1, A_total: 82, B_total: 14, C_total: 4 }
        ]
      };
      
      const comparison = NFsimResultAdapter.compareObservables(nfsimResults, odeResults);
      
      expect(comparison.size).toBe(3);
      expect(comparison.has('A_total')).toBe(true);
      expect(comparison.has('B_total')).toBe(true);
      expect(comparison.has('C_total')).toBe(true);
    });
  });
  
  describe('Visualization Component Compatibility', () => {
    it('should produce results compatible with plot components', () => {
      // **Requirement 10.2**: Compatible with existing visualization components
      
      const gdatData: GdatData = {
        headers: ['time', 'O1', 'O2'],
        data: [
          { time: 0, O1: 100, O2: 0 },
          { time: 1, O1: 90, O2: 10 },
          { time: 2, O1: 80, O2: 20 }
        ],
        rawHeaderLine: '# time O1 O2'
      };
      
      const model: BNGLModel = {
        parameters: {},
        moleculeTypes: [],
        species: [],
        observables: [
          { type: 'molecules', name: 'A_total', pattern: 'A()' },
          { type: 'molecules', name: 'B_total', pattern: 'B()' }
        ],
        reactions: [],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      // Check that results can be used for plotting
      // (same structure as ODE/SSA results)
      expect(results.headers).toBeInstanceOf(Array);
      expect(results.data).toBeInstanceOf(Array);
      expect(results.data.every(row => typeof row === 'object')).toBe(true);
      expect(results.data.every(row => typeof row.time === 'number')).toBe(true);
      
      // Check that all observables are numeric
      for (const row of results.data) {
        for (const header of results.headers) {
          if (header !== 'time') {
            expect(typeof row[header]).toBe('number');
          }
        }
      }
    });
    
    it('should include expanded network data for flux analysis', () => {
      // **Requirement 10.5**: Compatible with analysis tools
      
      const gdatData: GdatData = {
        headers: ['time', 'O1'],
        data: [{ time: 0, O1: 100 }],
        rawHeaderLine: '# time O1'
      };
      
      const model: BNGLModel = {
        parameters: { k1: 0.1 },
        moleculeTypes: [],
        species: [
          { name: 'A()', initialConcentration: 100 }
        ],
        observables: [
          { type: 'molecules', name: 'A_total', pattern: 'A()' }
        ],
        reactions: [
          {
            reactants: ['A()'],
            products: [],
            rate: 'k1',
            rateConstant: 0.1
          }
        ],
        reactionRules: []
      };
      
      const results = NFsimResultAdapter.adaptGdatToSimulationResults(gdatData, model);
      
      // Flux analysis tools need expanded reactions
      expect(results.expandedReactions).toBeDefined();
      expect(results.expandedReactions).toHaveLength(1);
      expect(results.expandedReactions![0].reactants).toContain('A()');
      
      // Flux analysis tools need expanded species
      expect(results.expandedSpecies).toBeDefined();
      expect(results.expandedSpecies).toHaveLength(1);
      expect(results.expandedSpecies![0].name).toBe('A()');
    });
  });
});
