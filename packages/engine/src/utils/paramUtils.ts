import { collapseWhitespace } from './stringUtils';
import { stripInlineComment } from './stringUtils';

function unwrapOuterParens(expr: string): string {
  let start = 0;
  let end = expr.length;

  while (start < end && expr[start] === '(') start++;
  while (end > start && expr[end - 1] === ')') end--;

  return expr.slice(start, end).trim();
}

function isNumericLiteralBody(expr: string): boolean {
  if (expr.length === 0) return false;

  let i = 0;
  if (expr[i] === '+' || expr[i] === '-') i++;

  let sawDigit = false;
  let sawDot = false;
  let sawExponent = false;
  let sawExponentDigit = false;

  for (; i < expr.length; i++) {
    const ch = expr[i];
    if (ch >= '0' && ch <= '9') {
      sawDigit = true;
      if (sawExponent) sawExponentDigit = true;
      continue;
    }
    if (ch === '.' && !sawDot && !sawExponent) {
      sawDot = true;
      continue;
    }
    if ((ch === 'e' || ch === 'E') && !sawExponent && sawDigit) {
      sawExponent = true;
      sawExponentDigit = false;
      if (i + 1 < expr.length && (expr[i + 1] === '+' || expr[i + 1] === '-')) {
        i++;
      }
      continue;
    }
    return false;
  }

  return sawDigit && (!sawExponent || sawExponentDigit);
}

export function parseParametersFromCode(src: string): Map<string,string> {
  const paramMap = new Map<string,string>();
  const lines = src.split('\n');
  let inParams = false;

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine);
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower === 'begin parameters') { inParams = true; continue; }
    if (lower === 'end parameters') { inParams = false; continue; }
    if (!inParams) continue;

    const parts = collapseWhitespace(line).split(' ');
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
  const trimmed = unwrapOuterParens(expr.trim());
  return isNumericLiteralBody(trimmed);
}

export function stripParametersBlock(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inParams = false;

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower === 'begin parameters') { inParams = true; continue; }
    if (lower === 'end parameters') { inParams = false; continue; }
    if (!inParams) out.push(line);
  }

  return out.join('\n').trimEnd().trim();
}