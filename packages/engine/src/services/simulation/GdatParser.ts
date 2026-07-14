export interface GdatData {
  headers: string[];
  data: Record<string, number>[];
  rawHeaderLine?: string;
}

const splitLine = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(',')) return line.split(',');
  return line.split(/\s+/);
};

export function parseGdat(gdat: string): GdatData {
  const lines = gdat.split(/\r?\n/);

  let headerLineIndex = -1;
  let firstCommentIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let start = 0;
    while(start < line.length && line.charCodeAt(start) <= 32) start++;
    if (start < line.length && line.charCodeAt(start) === 35) { // '#'
      if (firstCommentIndex === -1) {
        firstCommentIndex = i;
      }
      if (line.toLowerCase().includes('time')) {
        headerLineIndex = i;
        break;
      }
    } else if (start < line.length) {
      break;
    }
  }
  if (headerLineIndex === -1 && firstCommentIndex !== -1) {
    headerLineIndex = firstCommentIndex;
  }

  let headerTokens: string[] = [];
  let dataStartIndex = 0;
  let rawHeaderLine: string | undefined;

  if (headerLineIndex >= 0) {
    rawHeaderLine = lines[headerLineIndex];
    let start = 0;
    while(start < rawHeaderLine.length && rawHeaderLine.charCodeAt(start) <= 32) start++;
    const rawHeader = rawHeaderLine.substring(start).replace(/^#\s*/, '').trim();
    headerTokens = splitLine(rawHeader).filter(Boolean);
    dataStartIndex = headerLineIndex + 1;
  } else {
    let firstDataLine = '';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let start = 0;
        while(start < line.length && line.charCodeAt(start) <= 32) start++;
        if (start < line.length && line.charCodeAt(start) !== 35) {
            firstDataLine = line.trim();
            break;
        }
    }
    headerTokens = firstDataLine ? splitLine(firstDataLine).filter(Boolean) : [];
  }

  const looksNumeric = (token: string) => /^-?\d*(\.\d+)?([eE][+-]?\d+)?$/.test(token);
  const hasTimeHeader = headerTokens.some((t) => t.toLowerCase() === 'time');
  const allNumeric = headerTokens.length > 0 && headerTokens.every(looksNumeric);

  const headerIsData = headerTokens.length > 0 && !hasTimeHeader && allNumeric;

  let headers: string[];
  if (headerIsData) {
    headers = ['time', ...Array.from({ length: Math.max(0, headerTokens.length - 1) }, (_, i) => `O${i + 1}`)];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let start = 0;
        while(start < line.length && line.charCodeAt(start) <= 32) start++;
        if (start < line.length && line.charCodeAt(start) !== 35) {
            dataStartIndex = i;
            break;
        }
    }
    rawHeaderLine = undefined;
  } else {
    headers = headerTokens.length > 0 ? headerTokens : ['time'];
  }

  const data: Record<string, number>[] = [];
  const numHeaders = headers.length;
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    let start = 0;
    while(start < line.length && line.charCodeAt(start) <= 32) start++;
    if (start === line.length || line.charCodeAt(start) === 35) continue; // 35 is '#'

    let end = line.length;
    while(end > start && line.charCodeAt(end - 1) <= 32) end--;
    const trimmedLine = (start === 0 && end === line.length) ? line : line.substring(start, end);

    let tokens: string[];
    if (trimmedLine.includes('\t')) tokens = trimmedLine.split('\t');
    else if (trimmedLine.includes(',')) tokens = trimmedLine.split(',');
    else tokens = trimmedLine.split(/\s+/);

    if (tokens.length === 0) continue;

    const row: Record<string, number> = {};
    const limit = numHeaders < tokens.length ? numHeaders : tokens.length;
    for (let j = 0; j < limit; j++) {
      const value = Number(tokens[j]);
      row[headers[j]] = Number.isFinite(value) ? value : 0;
    }
    data.push(row);
  }

  return { headers, data, rawHeaderLine };
}
