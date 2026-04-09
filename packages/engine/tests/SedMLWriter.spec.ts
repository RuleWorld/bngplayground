import { describe, it, expect } from 'vitest';
import { generateSedML } from '../src/services/export/SedMLWriter';
import type { BNGLModel } from '../src/types';

const mockModel: BNGLModel = {
  name: 'TestModel',
  parameters: { kf: 0.1, kr: 0.01 },
  moleculeTypes: [],
  species: [],
  observables: [
    { name: 'A_total', type: 'Molecules', pattern: 'A()' },
    { name: 'B_total', type: 'Molecules', pattern: 'B()' },
  ],
  reactions: [],
  reactionRules: [],
  compartments: [],
  functions: [],
};

describe('generateSedML', () => {
  it('generates valid XML with correct structure', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 200,
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('sed-ml.org/sed-ml/level1/version4');
    expect(xml).toContain('level="1" version="4"');
  });

  it('includes correct KISAO ID for ODE', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
    });
    expect(xml).toContain('KISAO:0000019');
  });

  it('includes correct KISAO ID for SSA', () => {
    const xml = generateSedML(mockModel, {
      method: 'ssa',
      t_end: 100,
      n_steps: 100,
    });
    expect(xml).toContain('KISAO:0000029');
  });

  it('includes correct KISAO ID for NFsim', () => {
    const xml = generateSedML(mockModel, {
      method: 'nf',
      t_end: 100,
      n_steps: 100,
    });
    expect(xml).toContain('KISAO:0000263');
  });

  it('sets time course parameters', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 200,
      n_steps: 50,
      t_start: 10,
    });
    expect(xml).toContain('outputEndTime="200"');
    expect(xml).toContain('numberOfPoints="50"');
    expect(xml).toContain('initialTime="10"');
  });

  it('includes tolerance algorithm parameters', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
      atol: 1e-8,
      rtol: 1e-6,
    });
    expect(xml).toContain('KISAO:0000211');
    expect(xml).toContain('value="1e-8"');
    expect(xml).toContain('KISAO:0000209');
    expect(xml).toContain('value="0.000001"');
  });

  it('filters observables when specified', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
      observables: ['A_total'],
    });
    expect(xml).toContain('A_total');
    expect(xml).not.toContain('B_total');
  });

  it('includes all observables by default', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
    });
    expect(xml).toContain('A_total');
    expect(xml).toContain('B_total');
  });

  it('includes model reference', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
      modelSource: 'my_model.bngl',
    });
    expect(xml).toContain('source="my_model.bngl"');
    expect(xml).toContain('language="urn:sedml:language:bngl"');
  });

  it('roundtrip: all structural elements present', () => {
    const xml = generateSedML(mockModel, {
      method: 'ode',
      t_end: 100,
      n_steps: 100,
    });

    expect(xml).toMatch(/<listOfModels>/);
    expect(xml).toMatch(/<listOfSimulations>/);
    expect(xml).toMatch(/<listOfTasks>/);
    expect(xml).toMatch(/<listOfDataGenerators>/);
    expect(xml).toMatch(/<listOfOutputs>/);
    expect(xml).toMatch(/<plot2D/);
    expect(xml).toMatch(/<curve/);
  });
});
