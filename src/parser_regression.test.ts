// @ts-nocheck
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseBNGLWithANTLR } from './parser/BNGLParserWrapper';

describe('BNGL parser regressions', () => {
  it('parses Jaruszewicz-Blonska_2023 (handles UTF-8 BOM)', () => {
    const bnglContent = readFileSync('public/models/Jaruszewicz-Blonska_2023.bngl', 'utf8');
    const result = parseBNGLWithANTLR(bnglContent);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.model).toBeTruthy();

    // Regression: BEGIN ACTIONS blocks must be visited so simulate_* commands populate phases/options.
    // This model includes a simulate_ode(...) inside a begin/end actions block.
    expect(result.model!.simulationPhases?.length).toBeGreaterThan(0);
    expect(result.model!.simulationPhases![0].method).toBe('ode');
    expect(result.model!.simulationPhases![0].t_end).toBe(30 * 24 * 3600);
    expect(result.model!.simulationPhases![0].n_steps).toBe(200);
  });

  it('parses organelle_transport_struct (CBNGL per-molecule compartments)', () => {
    const bnglContent = readFileSync(
      'published-models/native-tutorials/CBNGL/organelle_transport_struct.bngl',
      'utf8'
    );
    const result = parseBNGLWithANTLR(bnglContent);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.model).toBeTruthy();
  });

  it('parses scientific notation in simulate() args (Lang_2024: 1e3 steps)', () => {
    const bnglContent = readFileSync('public/models/Lang_2024.bngl', 'utf8');
    const result = parseBNGLWithANTLR(bnglContent);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.model).toBeTruthy();

    // Regression: parseInt("1e3") -> 1 caused truncated time grids.
    expect(result.model!.simulationPhases?.length).toBeGreaterThan(0);
    expect(result.model!.simulationPhases![0].t_end).toBe(0.73e5);
    expect(result.model!.simulationPhases![0].n_steps).toBe(1000);
  });
});

