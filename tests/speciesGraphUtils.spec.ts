import { describe, it, expect } from 'vitest';
import { parseSpeciesGraphs } from '../services/visualization/speciesGraphUtils';

describe('speciesGraphUtils.parseSpeciesGraphs', () => {
  it('should split and parse top-level comma-separated patterns', () => {
    const patterns = ['ATM(state~A), Chk2(state~P)'];
    const graphs = parseSpeciesGraphs(patterns);
    expect(graphs.length).toBe(2);
    const names = graphs.map(g => g.molecules.map(m => m.name).join('.'));
    expect(names).toContain('ATM');
    expect(names).toContain('Chk2');
  });

  it('should parse standard single patterns unchanged', () => {
    const patterns = ['A(b!1).B(a!1)'];
    const graphs = parseSpeciesGraphs(patterns);
    expect(graphs.length).toBe(1);
    expect(graphs[0].molecules.map(m => m.name)).toEqual(['A', 'B']);
  });
});
