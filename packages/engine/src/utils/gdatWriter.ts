import type { SimulationResults } from '../types';

export function gdatFromResults(results: SimulationResults): string {
  const rows = results.data ?? [];
  const headers = results.headers.length > 0 ? results.headers : inferHeaders(rows);
  const lines = [`# ${headers.join('\t')}`];

  for (const row of rows) {
    lines.push(headers.map((header) => formatValue(row[header])).join('\t'));
  }

  return lines.join('\n') + '\n';
}

function inferHeaders(rows: Record<string, number>[]): string[] {
  const headers = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) headers.add(key);
  }
  return Array.from(headers);
}

function formatValue(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : 'NaN';
}