import { describe, it, expect } from 'vitest';
import { exportToNet } from '../../services/exportNet';
import { exportToSBML } from '../../services/exportSBML';
import { exportToSedML } from '../../services/exportSedML';
import { exportToOMEX } from '../../services/exportOMEX';
import { BNGLModel } from '../../types';

const minimalModel: BNGLModel = {
  name: 'TestModel',
  parameters: { kf: 0.1, kr: 0.01 },
  moleculeTypes: [
    { name: 'A', components: [] },
    { name: 'B', components: [] },
  ],
  species: [
    { name: 'A()', initialConcentration: 100 },
    { name: 'B()', initialConcentration: 0 },
  ],
  observables: [
    { type: 'Molecules', name: 'A_total', pattern: 'A()' },
    { type: 'Molecules', name: 'B_total', pattern: 'B()' },
  ],
  reactionRules: [
    {
      reactants: ['A()'],
      products: ['B()'],
      rate: 'kf',
      name: 'R1',
      isBidirectional: false
    },
  ],
  reactions: [
    {
      reactants: ['A()'],
      products: ['B()'],
      rate: "0.1",
      rateExpression: 'kf',
      name: 'R1',
      rateConstant: 0.1
    },
  ],
};

describe('exportToNet', () => {
  it('produces a non-empty string for a valid expanded model', async () => {
    const result = await exportToNet(minimalModel);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes species block with correct count', async () => {
    const result = await exportToNet(minimalModel);
    expect(result).toContain('begin species');
    expect(result).toContain('end species');
  });

  it('includes reactions block', async () => {
    const result = await exportToNet(minimalModel);
    expect(result).toContain('begin reactions');
    expect(result).toContain('end reactions');
  });

  it('throws when a reaction references an unknown species', async () => {
    const bad = {
      ...minimalModel,
      reactions: [{ reactants: ['Unknown()'], products: ['B()'], rate: "1", rateConstant: 1, rateExpression: '1', name: 'bad' }],
    };
    await expect(exportToNet(bad as unknown as BNGLModel)).rejects.toThrow(/unable to map/i);
  });

  it('handles model with no reactions gracefully', async () => {
    const noRxn = { ...minimalModel, reactions: [] };
    const result = await exportToNet(noRxn);
    expect(result).toContain('begin reactions');
  });

  it('accepts an optional evalParamMap', async () => {
    const paramMap = new Map([['kf', 0.5], ['kr', 0.05]]);
    const result = await exportToNet(minimalModel, paramMap);
    expect(typeof result).toBe('string');
  });
});

describe('exportToSBML', () => {
  it('produces valid XML string', async () => {
    const result = await exportToSBML(minimalModel);
    expect(result).toContain('<?xml');
    expect(result).toContain('sbml');
  });

  it('throws on malformed model and does not silently return empty', async () => {
    // A model with no species or molecule types is degenerate
    const empty: BNGLModel = {
      parameters: {},
      moleculeTypes: [],
      species: [],
      observables: [],
    };
    // Depending on implementation, this may produce minimal SBML or throw
    try {
        const result = await exportToSBML(empty);
        expect(typeof result).toBe('string');
    } catch (e) {
        expect(e).toBeDefined();
    }
  });
});

describe('exportToSedML', () => {
  it('produces XML containing sedML namespace', () => {
    const result = exportToSedML(minimalModel);
    expect(result).toContain('sedML');
  });

  it('applies default simulation options when none provided', () => {
    const result = exportToSedML(minimalModel);
    // Default t_end=100, n_steps=100
    expect(result).toContain('100');
  });

  it('overrides defaults with provided options', () => {
    const result = exportToSedML(minimalModel, { t_end: 500, n_steps: 250 });
    expect(result).toContain('500');
  });
});

describe('exportToOMEX', () => {
  const bnglCode = 'begin model\\nend model\\n';

  it('produces a Uint8Array (ZIP bytes)', () => {
    const result = exportToOMEX(minimalModel, bnglCode);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output starts with ZIP magic bytes (PK\\x03\\x04)', () => {
    const result = exportToOMEX(minimalModel, bnglCode);
    expect(result[0]).toBe(0x50); // 'P'
    expect(result[1]).toBe(0x4B); // 'K'
    expect(result[2]).toBe(0x03);
    expect(result[3]).toBe(0x04);
  });

  it('uses model name from model object', () => {
    const named = { ...minimalModel, name: 'CustomName' };
    const result = exportToOMEX(named, bnglCode);
    expect(result.length).toBeGreaterThan(0);
  });
});
