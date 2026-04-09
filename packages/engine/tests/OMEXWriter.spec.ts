import { describe, it, expect } from 'vitest';
import { generateOMEX } from '../src/services/export/OMEXWriter';
import type { BNGLModel } from '../src/types';

const mockModel: BNGLModel = {
  name: 'TestModel',
  parameters: { kf: 0.1 },
  moleculeTypes: [],
  species: [],
  observables: [{ name: 'A', type: 'Molecules', pattern: 'A()' }],
  reactions: [],
  reactionRules: [],
  compartments: [],
  functions: [],
};

const bnglCode = `begin model
begin parameters
  kf 0.1
end parameters
end model`;

describe('generateOMEX', () => {
  it('generates a valid ZIP (magic bytes PK\\x03\\x04)', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    expect(archive[0]).toBe(0x50);
    expect(archive[1]).toBe(0x4b);
    expect(archive[2]).toBe(0x03);
    expect(archive[3]).toBe(0x04);
  });

  it('contains manifest.xml', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    const str = new TextDecoder().decode(archive);
    expect(str).toContain('manifest.xml');
  });

  it('contains model.bngl with matching content', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    const str = new TextDecoder().decode(archive);
    expect(str).toContain('model.bngl');
    expect(str).toContain('begin model');
  });

  it('contains experiment.sedml', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    const str = new TextDecoder().decode(archive);
    expect(str).toContain('experiment.sedml');
    expect(str).toContain('sed-ml.org');
  });

  it('manifest lists all content entries', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    const str = new TextDecoder().decode(archive);
    expect(str).toContain('combine.specifications/omex');
    expect(str).toContain('combine.specifications/bngl');
    expect(str).toContain('combine.specifications/sed-ml');
  });

  it('includes metadata.rdf when metadata provided', () => {
    const archive = generateOMEX(mockModel, {
      bnglCode,
      metadata: {
        title: 'Test Model',
        creators: ['Jane Doe'],
        description: 'A test model',
        created: '2024-01-01',
      },
    });
    const str = new TextDecoder().decode(archive);
    expect(str).toContain('metadata.rdf');
    expect(str).toContain('Test Model');
    expect(str).toContain('Jane Doe');
    expect(str).toContain('A test model');
  });

  it('omits metadata.rdf when no metadata', () => {
    const archive = generateOMEX(mockModel, { bnglCode });
    const str = new TextDecoder().decode(archive);
    expect(str).not.toContain('metadata.rdf');
  });
});
