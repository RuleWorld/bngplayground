import { describe, expect, it } from 'vitest';
import type { SimulationResults } from '../../types';
import { materializeSimulationResult, toCompactSimulationResult } from '../../services/workerResultTransport';

describe('worker result matrix transport', () => {
  it('round-trips ordered numeric rows through a transferable matrix', () => {
    const source: SimulationResults = {
      headers: ['time', 'A'],
      data: [{ time: 0, A: 2 }, { time: 1, A: 3 }],
      terminationReason: 'completed',
    };
    const compact = toCompactSimulationResult(source);
    expect(compact).not.toBeNull();
    expect(compact?.values).toBeInstanceOf(ArrayBuffer);
    expect(materializeSimulationResult(compact!)).toEqual(source);
  });

  it('keeps multi-suffix rows on object transport', () => {
    const source: SimulationResults = {
      headers: ['time', 'A'],
      data: [{ time: 0, A: 2 }],
      dataBySuffix: { cell: [{ time: 0, A: 2 }] },
    };
    expect(toCompactSimulationResult(source)).toBeNull();
  });

  it('reconstructs a single default suffix without cloning duplicate object rows', () => {
    const rows = [{ time: 0, A: 2 }, { time: 1, A: 3 }];
    const source: SimulationResults = {
      headers: ['time', 'A'],
      data: rows,
      dataBySuffix: { __default__: rows },
    };
    const compact = toCompactSimulationResult(source);
    expect(compact?.dataBySuffixKey).toBe('__default__');
    const materialized = materializeSimulationResult(compact!);
    expect(materialized.dataBySuffix?.__default__).toBe(materialized.data);
  });
});
