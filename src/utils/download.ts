export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Format a number to BNG2-compatible scientific notation with 12 decimal digits.
 * Uses "round half down" for tie-breaker cases to match observed BNG2 printf behavior.
 */
function toBngScientific12(x: number): string {
  if (!Number.isFinite(x) || x === 0) {
    const raw = x.toExponential(12);
    const m = raw.match(/^(-?\d(?:\.\d{12})?)e([+-]?\d+)$/i);
    if (!m) return raw;
    const mantissa = m[1];
    const expNum = Number.parseInt(m[2], 10);
    if (!Number.isFinite(expNum)) return raw;
    const expSign = expNum >= 0 ? '+' : '-';
    const expAbs = Math.abs(expNum);
    const expPadded = expAbs < 100 ? String(expAbs).padStart(2, '0') : String(expAbs);
    return `${mantissa}e${expSign}${expPadded}`;
  }

  const sign = x < 0 ? '-' : '';
  const absX = Math.abs(x);

  // Get exponent: floor(log10(absX))
  const exp = Math.floor(Math.log10(absX));
  
  // Normalized mantissa: absX / 10^exp should be in [1, 10)
  const scale = Math.pow(10, exp);
  const mantissa = absX / scale;

  // We need 13 significant digits total (1 before decimal + 12 after)
  // Multiply by 10^12 to get all significant digits as an integer
  const shifted = mantissa * 1e12;
  
  // Custom rounding: for tie-breaker cases, round DOWN (floor)
  // Check if we're at a tie (value ends in exactly .5 after shifting)
  const floored = Math.floor(shifted);
  const fraction = shifted - floored;
  
  // Tie condition: fraction is exactly 0.5 (or very close due to FP errors)
  // If tie, round DOWN. Otherwise, use normal rounding.
  let rounded: number;
  if (Math.abs(fraction - 0.5) < 1e-9) {
    // Tie-breaker: round DOWN (toward zero) for positive numbers
    rounded = floored;
  } else {
    // Normal rounding
    rounded = Math.round(shifted);
  }

  // Handle overflow case (e.g., 9.9999... rounds to 10.0)
  if (rounded >= 1e13) {
    rounded = Math.round(rounded / 10);
    const newExp = exp + 1;
    const mantStr = (rounded / 1e12).toFixed(12);
    const expSign = newExp >= 0 ? '+' : '-';
    const expAbs = Math.abs(newExp);
    const expPadded = expAbs < 100 ? String(expAbs).padStart(2, '0') : String(expAbs);
    return `${sign}${mantStr}e${expSign}${expPadded}`;
  }

  // Format mantissa with exactly 12 decimal places
  const mantStr = (rounded / 1e12).toFixed(12);
  const expSign = exp >= 0 ? '+' : '-';
  const expAbs = Math.abs(exp);
  const expPadded = expAbs < 100 ? String(expAbs).padStart(2, '0') : String(expAbs);
  
  return `${sign}${mantStr}e${expSign}${expPadded}`;
}

function formatCsvValue(value: unknown, header: string): string {
  if (value === null || value === undefined) return '';

  // For strict parity with BNG2 GDAT references (TIME_TOL is very strict), we
  // must avoid tiny rounding differences at the string/parseFloat layer.
  // Strategy: use BNG2-compatible rounding (round half down) to match BNG2's
  // printf behavior at tie-breaker boundaries.
  if (header === 'time') {
    const t = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(t)) return '';

    const normalized = Object.is(t, -0) ? 0 : t;

    // Use custom BNG2-compatible formatting with round-half-down tie-breaker
    return toBngScientific12(normalized);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }

  return String(value);
}

/**
 * Serialize a table with an explicit column order as interoperable CSV.
 * Unlike `toCsv`, this function does not force a `time` column and preserves
 * the header row when the table has no data rows.
 */
export function toCsvTable(data: Record<string, unknown>[], headers: string[]): string {
  if (headers.length === 0) return '';

  const csvHeaders = headers.map((header) => escapeCsvValue(header));
  const csvRows = data.map((row) => headers
    .map((header) => escapeCsvValue(formatCsvValue(row[header], header)))
    .join(','));

  return [csvHeaders.join(','), ...csvRows].join('\n');
}

export function toCsv(data: Record<string, any>[], headers: string[]): string {
  if (!data || data.length === 0) return '';

  const csvHeaders = ['time', ...headers.filter((h) => h !== 'time')];
  const csvRows = data.map((row) => csvHeaders
    .map((header) => escapeCsvValue(formatCsvValue(row[header], header)))
    .join(','));
  return [csvHeaders.map((header) => escapeCsvValue(header)).join(','), ...csvRows].join('\n');
}

export function downloadCsv(data: Record<string, any>[], headers: string[], filename: string): void {
  const csv = toCsv(data, headers);
  if (!csv) return;
  downloadTextFile(csv, filename, 'text/csv');
}
