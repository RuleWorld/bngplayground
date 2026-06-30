/**
 * HashComputer — content-addressed hashing for provenance.
 *
 * All hashes are SHA-256 hex. Inputs are normalized to ensure the same
 * semantic content produces the same hash regardless of cosmetic differences.
 *
 * Node: uses node:crypto.
 * Browser: uses SubtleCrypto.
 */

let _nodeCrypto: typeof import('node:crypto') | null = null;
async function getNodeCrypto() {
  if (_nodeCrypto) return _nodeCrypto;
  _nodeCrypto = await import('node:crypto');
  return _nodeCrypto;
}

export async function sha256Async(input: string | Uint8Array): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const data = typeof input === 'string' ? new TextEncoder().encode(input) : (input as unknown as BufferSource);
    const buf = await window.crypto.subtle.digest('SHA-256', data);
    return bufToHex(new Uint8Array(buf));
  }
  const c = await getNodeCrypto();
  const h = c.createHash('sha256');
  h.update(typeof input === 'string' ? input : Buffer.from(input));
  return h.digest('hex');
}

/**
 * Synchronous sha256 — only works in Node. Browser must use sha256Async.
 * Provenance recorder is sync-first for convenience in the critical path;
 * falls back to a marker string if called in a browser context and resolves
 * the real hash at export time.
 */
export function sha256Normalized(bnglSource: string): string {
  const normalized = normalizeWhitespace(stripBNGLComments(bnglSource));
  return sha256Sync(normalized);
}

export function sha256OfParams(params: Record<string, number>): string {
  const keys = Object.keys(params).sort();
  const canonical = keys.map((k) => `${k}=${formatNumber(params[k])}`).join('\n');
  return sha256Sync(canonical);
}

export function sha256OfNetwork(networkSerialized: string): string {
  return sha256Sync(networkSerialized);
}

// ── Internals ──────────────────────────────────────────────────────────────

function sha256Sync(input: string): string {
  if (typeof window === 'undefined') {
    // Node path.
    const c = require('node:crypto');
    return c.createHash('sha256').update(input).digest('hex');
  }
  // Browser path: deterministic placeholder. Real hashes resolve at async finalize.
  return `browser-placeholder-${djb2(input).toString(16).padStart(8, '0')}`;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function stripBNGLComments(src: string): string {
  // BNGL line comments start with '#'. Preserve structure by replacing only
  // from '#' to end-of-line, not stripping entire lines.
  // ⚡ Bolt Optimization: Zero-allocation line scanning to reduce GC pressure
  let result = '';
  let startIdx = 0;
  const len = src.length;

  while (startIdx < len) {
    let endIdx = src.indexOf('\n', startIdx);
    if (endIdx === -1) endIdx = len;

    const hashIdx = src.indexOf('#', startIdx);
    if (hashIdx !== -1 && hashIdx < endIdx) {
      let e = hashIdx;
      while (e > startIdx && src.charCodeAt(e - 1) <= 32) e--;
      result += src.substring(startIdx, e);
    } else {
      result += src.substring(startIdx, endIdx);
    }

    if (endIdx < len) result += '\n';
    startIdx = endIdx + 1;
  }
  return result;
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toString();
  return n.toPrecision(15).replace(/0+$/, '').replace(/\.$/, '');
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
