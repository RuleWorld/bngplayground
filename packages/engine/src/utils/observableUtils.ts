export function splitObservablePatterns(pattern: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const token = pattern.slice(start, i).trim();
      if (token.length > 0) parts.push(token);
      start = i + 1;
    }
  }

  const tail = pattern.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}
