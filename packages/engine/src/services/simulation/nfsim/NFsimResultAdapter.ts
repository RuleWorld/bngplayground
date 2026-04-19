import type { BNGLModel, SimulationResults } from '../../../types';
import { parseGdat, type GdatData } from '../GdatParser';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_OBJECT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function toSafeKey(raw: string): string | null {
  return SAFE_OBJECT_KEY_PATTERN.test(raw) && !UNSAFE_OBJECT_KEYS.has(raw) ? raw : null;
}

const normalizeHeaders = (headers: string[], model: BNGLModel): string[] => {
  if (!headers.includes('time')) return ['time', ...headers];
  const observableNames = model.observables?.map((o) => o.name) ?? [];
  return headers.map((h) => {
    if (/^O\d+$/i.test(h)) {
      const idx = parseInt(h.slice(1), 10) - 1;
      return observableNames[idx] ?? h;
    }
    return h;
  });
};

export class NFsimResultAdapter {
  static adaptGdatToSimulationResults(gdat: string | GdatData, model: BNGLModel): SimulationResults {
    const parsed = typeof gdat === 'string' ? parseGdat(gdat) : gdat;
    const headers = normalizeHeaders(parsed.headers, model);
    const data = parsed.data.map((row) => {
      const mapped: Record<string, number> = Object.create(null) as Record<string, number>;
      for (const header of headers) {
        const safeHeader = toSafeKey(header);
        if (!safeHeader) continue;
        const value = row[safeHeader] ?? row[parsed.headers[headers.indexOf(header)]];
        Object.defineProperty(mapped, safeHeader, {
          value: typeof value === 'number' ? value : Number(value ?? 0),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return mapped;
    });

    const speciesHeaders = model.species.map((s) => s.name);
    const speciesData = data.map((row) => {
      const sp: Record<string, number> = Object.create(null) as Record<string, number>;
      sp.time = row.time ?? 0;
      for (const name of speciesHeaders) {
        const safeName = toSafeKey(name);
        if (!safeName) continue;
        Object.defineProperty(sp, safeName, {
          value: row[safeName] ?? 0,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return sp;
    });

    return {
      headers,
      data,
      speciesHeaders,
      speciesData,
      expandedReactions: model.reactions ?? [],
      expandedSpecies: model.species ?? []
    };
  }

  static compareObservables(a: SimulationResults, b: SimulationResults) {
    const obs = new Set([...(a.headers || []), ...(b.headers || [])].filter((h) => h !== 'time'));
    let maxAbsDiff = 0;
    let maxRelDiff = 0;
    for (const name of obs) {
      const aVal = a.data?.[a.data.length - 1]?.[name] ?? 0;
      const bVal = b.data?.[b.data.length - 1]?.[name] ?? 0;
      const abs = Math.abs(aVal - bVal);
      const rel = Math.abs(aVal) > 0 ? abs / Math.abs(aVal) : abs;
      maxAbsDiff = Math.max(maxAbsDiff, abs);
      maxRelDiff = Math.max(maxRelDiff, rel);
    }
    return { maxAbsDiff, maxRelDiff };
  }

  static validateCrossMethodCompatibility(a: SimulationResults, b: SimulationResults) {
    const comparison = NFsimResultAdapter.compareObservables(a, b);
    return {
      compatible: comparison.maxRelDiff < 1,
      comparison
    };
  }
}
