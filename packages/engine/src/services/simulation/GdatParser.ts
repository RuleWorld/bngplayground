export interface GdatData {
  headers: string[];
  data: Record<string, number>[];
  rawHeaderLine?: string;
}

const splitLine = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(',')) return line.split(',');
  return line.trim().split(/\s+/);
};

export function parseGdat(gdat: string): GdatData {
  const lines = gdat.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  
  // Look for the last line starting with #, which is usually the header in NFsim .gdat files
  const headerLineIndex = lines.findLastIndex((l) => l.startsWith('#'));
  let headerTokens: string[] = [];
  let dataStartIndex = 0;

  if (headerLineIndex >= 0) {
    const rawHeader = lines[headerLineIndex].replace(/^#\s*/, '');
    headerTokens = splitLine(rawHeader).filter(Boolean);
    dataStartIndex = headerLineIndex + 1;
  } else {
    // Fallback: look for the first non-comment line and see if it looks like data
    const firstDataLine = lines.find((l) => !l.startsWith('#')) || '';
    headerTokens = firstDataLine ? splitLine(firstDataLine).filter(Boolean) : [];
  }

  const looksNumeric = (token: string) => /^-?\d*(\.\d+)?([eE][+-]?\d+)?$/.test(token);
  const hasTimeHeader = headerTokens.some((t) => t.toLowerCase() === 'time');
  const allNumeric = headerTokens.length > 0 && headerTokens.every(looksNumeric);
  
  const headerIsData = headerTokens.length > 0 && !hasTimeHeader && allNumeric;

  let headers: string[];
  if (headerIsData) {
    // If the header tokens look like numbers, it's actually the first row of data
    headers = ['time', ...Array.from({ length: Math.max(0, headerTokens.length - 1) }, (_, i) => `O${i + 1}`)];
    dataStartIndex = lines.findIndex((l) => !l.startsWith('#'));
  } else {
    headers = headerTokens.length > 0 ? headerTokens : ['time'];
  }

  const data: Record<string, number>[] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    const tokens = splitLine(line);
    if (tokens.length === 0) continue;
    const row: Record<string, number> = {};
    for (let j = 0; j < headers.length && j < tokens.length; j++) {
      const value = Number(tokens[j]);
      row[headers[j]] = Number.isFinite(value) ? value : 0;
    }
    data.push(row);
  }

  return { headers, data };
}