import type { SimulationResults } from '../types';

/**
 * Translates a structured simulation results object into a tab-delimited string
 * conforming to the BioNetGen .gdat file format specification.
 *
 * It extracts headers either from the pre-defined results headers array or
 * dynamically infers them from the data keys. It then formats each data row's
 * corresponding values, separating them with tabs and terminating each row with
 * a newline. Missing or non-finite values (such as NaN, Infinity, -Infinity)
 * are represented as the string 'NaN' in the output.
 *
 * This is a pure utility function. It does not access any browser-specific APIs
 * and must remain browser-API-free to allow execution in headless/Node.js environments.
 *
 * @param results - The simulation results object containing headers and trajectory data rows.
 * @returns A tab-delimited, newline-terminated .gdat formatted string with comments starting with `#`.
 */
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