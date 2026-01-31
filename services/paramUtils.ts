export function parseParametersFromCode(src: string): Map<string,string> {
  const paramMap = new Map<string,string>();
  const lines = src.split(/\r?\n/);
  let inParams = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (/^begin\s+parameters\b/.test(lower)) { inParams = true; continue; }
    if (/^end\s+parameters\b/.test(lower)) { inParams = false; continue; }
    if (!inParams) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const name = parts[0];
      const expr = parts.slice(1).join(' ');
      paramMap.set(name, expr);
    }
  }
  return paramMap;
}

export function isNumericLiteral(expr: string): boolean {
  if (!expr) return false;
  const trimmed = expr.trim();
  const unwrapped = trimmed.replace(/^\(+/, '').replace(/\)+$/, '');
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(unwrapped);
}

export function stripParametersBlock(src: string): string {
  const lines = src.split(/\r?\n/);
  let out: string[] = [];
  let inParams = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^begin\s+parameters\b/i.test(l)) { inParams = true; continue; }
    if (/^end\s+parameters\b/i.test(l)) { inParams = false; continue; }
    if (!inParams) out.push(raw);
  }
  return out.join('\n').replace(/\s+$/g, '').trim();
}