
import { describe, it, expect } from 'vitest';
import { buildRegulatoryGraph } from '../../services/visualization/regulatoryGraphBuilder';
import { ReactionRule } from '../../types';

// Helper to create simple rules
const createRule = (
  name: string,
  reactants: string[],
  products: string[],
  isBidirectional = false
): ReactionRule => ({
  name,
  reactants: reactants.map(s => s), // Simple strings for graph builder
  products: products.map(s => s),
  isBidirectional,
  rate: 'k1', 
});

describe('RegulatoryGraph Builder', () => {

  describe('Basic Graph Structure', () => {
    it('should return empty graph for no rules', () => {
      const g = buildRegulatoryGraph([]);
      expect(g.nodes).toEqual([]);
      expect(g.edges).toEqual([]);
    });

    it('should create nodes for A -> B', () => {
      const rule = createRule('r1', ['A'], ['B']);
      const g = buildRegulatoryGraph([rule]);
      
      // Nodes: r1, A, B
      expect(g.nodes.length).toBe(3);
      expect(g.nodes.find(n => n.label === 'r1')).toBeDefined();
      expect(g.nodes.find(n => n.label === 'A')).toBeDefined();
      expect(g.nodes.find(n => n.label === 'B')).toBeDefined();
      
      // Edges: A->r1, r1->B
      expect(g.edges.length).toBe(2);
      expect(g.edges.some(e => e.from === 'species_A' && e.to === 'r1')).toBe(true);
      expect(g.edges.some(e => e.from === 'r1' && e.to === 'species_B')).toBe(true);
    });

    it('should distinguish rule and species nodes', () => {
      const rule = createRule('r1', ['A'], ['B']);
      const g = buildRegulatoryGraph([rule]);
      const ruleNode = g.nodes.find(n => n.id === 'r1');
      const speciesNode = g.nodes.find(n => n.id === 'species_A');
      
      expect(ruleNode?.type).toBe('rule');
      expect(speciesNode?.type).toBe('species');
    });
  });

  describe('Catalysis Logic', () => {
    it('should identify catalyst in A + E -> B + E', () => {
      const rule = createRule('cat', ['A', 'E'], ['B', 'E']);
      const g = buildRegulatoryGraph([rule]);
      
      // Nodes: cat, A, B, E (4)
      expect(g.nodes.length).toBe(4);
      
      // Edges: 
      // A -> cat (reactant)
      // cat -> B (product)
      // E -> cat (catalyst)
      // NO cat -> E edge
      expect(g.edges.length).toBe(3);
      
      const catEdge = g.edges.find(e => e.from === 'species_E' && e.to === 'cat');
      expect(catEdge).toBeDefined();
      expect(catEdge?.type).toBe('catalyst');
      
      const prodEdgeE = g.edges.find(e => e.from === 'cat' && e.to === 'species_E');
      expect(prodEdgeE).toBeUndefined(); // Should NOT exist
    });

    it('should handle self-catalysis A -> A + B', () => {
       // A is consumed and produced ? 
       // Reactants: {A}, Products: {A, B}
       // Intersection: {A} -> A is catalyst?
       // Usually A -> A + B implies A produces B while conserving A.
       // Graph logic: A is catalyst.
       const rule = createRule('auto', ['A'], ['A', 'B']);
       const g = buildRegulatoryGraph([rule]);
       
       const catEdge = g.edges.find(e => e.from === 'species_A' && e.to === 'auto');
       expect(catEdge?.type).toBe('catalyst');
       
       // B is product
       const bEdge = g.edges.find(e => e.from === 'auto' && e.to === 'species_B');
       expect(bEdge?.type).toBe('product');
    });
  });

  describe('Reversibility', () => {
    it('should mark edges as reversible if rule is bidirectional', () => {
      const rule = createRule('rev', ['A'], ['B'], true);
      const g = buildRegulatoryGraph([rule]);
      
      expect(g.edges.every(e => e.reversible === true)).toBe(true);
    });

    it('should mark edges as not reversible if rule is unidirectional', () => {
      const rule = createRule('uni', ['A'], ['B'], false);
      const g = buildRegulatoryGraph([rule]);
      
      expect(g.edges.every(e => e.reversible === false)).toBe(true);
    });
  });

  describe('Stoichiometry Simplification', () => {
    it('should treat A + A -> B as single inputs', () => {
      const rule = createRule('dimer', ['A', 'A'], ['B']);
      const g = buildRegulatoryGraph([rule]);
      
      // Only one edge from A to dimer
      const edgesFromA = g.edges.filter(e => e.from === 'species_A');
      expect(edgesFromA.length).toBe(1);
    });
    
    it('should treat A -> B + B as single output', () => {
       const rule = createRule('split', ['A'], ['B', 'B']);
       const g = buildRegulatoryGraph([rule]);
       
       const edgesToB = g.edges.filter(e => e.to === 'species_B');
       expect(edgesToB.length).toBe(1);
    });
  });

  describe('Complex Scenarios', () => {
     it('simple phosphorylation loop', () => {
         // A + Kinase -> AP + Kinase
         // AP + P'ase -> A + P'ase
         const r1 = createRule('phos', ['A', 'Kinase'], ['AP', 'Kinase']);
         const r2 = createRule('dephos', ['AP', 'Pase'], ['A', 'Pase']);
         const g = buildRegulatoryGraph([r1, r2]);
         
         // Nodes: phos, dephos, A, AP, Kinase, Pase (6)
         expect(g.nodes.length).toBe(6);
         
         // Edges: 
         // r1: A->r1 (R), Kinase->r1 (C), r1->AP (P) = 3
         // r2: AP->r2 (R), Pase->r2 (C), r2->A (P) = 3
         expect(g.edges.length).toBe(6);
     });
     
     it('complex formation with catalyst', () => {
         // A + B + C -> ABC
         const rule = createRule('bind', ['A', 'B', 'C'], ['ABC']);
         const g = buildRegulatoryGraph([rule]);
         expect(g.nodes.length).toBe(5); // bind, A, B, C, ABC
         expect(g.edges.length).toBe(4); // A->, B->, C->, ->ABC
     });

     // Random graph generation for stress testing
     for(let i=0; i<20; i++) {
         it(`should generate valid graph for random rule set ${i}`, () => {
             const r1 = createRule(`r${i}`, [`S${i}`], [`P${i}`]);
             const g = buildRegulatoryGraph([r1]);
             expect(g.nodes.length).toBe(3);
             expect(g.edges.length).toBe(2);
         });
     }
  });

  describe('Options', () => {
      it('should use custom ID generator', () => {
          const rule = createRule('r1', ['A'], ['B']);
          const g = buildRegulatoryGraph([rule], {
              getRuleId: (r, i) => `custom_${r.name}`
          });
          
          expect(g.nodes.find(n => n.id === 'custom_r1')).toBeDefined();
      });

       it('should use custom Label generator', () => {
          const rule = createRule('r1', ['A'], ['B']);
          const g = buildRegulatoryGraph([rule], {
              getRuleLabel: (r, i) => `Label ${r.name}`
          });
          
          expect(g.nodes.find(n => n.label === 'Label r1')).toBeDefined();
      });
  });
});
