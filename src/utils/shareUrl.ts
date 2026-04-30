/**
 * Hook and utilities for sharing models via URL.
 * Encodes model source code as base64 in URL hash.
 */

export interface SharedModelPayload {
  code: string;
  name?: string;
  modelId?: string;
}

// Compress and encode BNGL code for URL
export function encodeModelForUrl(code: string): string {
  try {
    // Use TextEncoder for proper UTF-8 handling, then base64
    const bytes = new TextEncoder().encode(code);
    const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
    return btoa(binString);
  } catch {
    // Fallback to simple base64
    return btoa(unescape(encodeURIComponent(code)));
  }
}

// Decode BNGL code from URL
export function decodeModelFromUrl(encoded: string): string {
  try {
    const binString = atob(encoded);
    const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0) ?? 0);
    return new TextDecoder().decode(bytes);
  } catch {
    // Fallback
    return decodeURIComponent(escape(atob(encoded)));
  }
}

// Generate a shareable URL for the current model
export function generateShareUrl(
  code: string,
  options?: { name?: string | null; modelId?: string | null }
): string {
  const encoded = encodeModelForUrl(code);

  const params: string[] = [];
  params.push(`model=${encodeURIComponent(encoded)}`);
  if (options?.name) {
    params.push(`name=${encodeURIComponent(options.name)}`);
  }
  if (options?.modelId) {
    params.push(`modelId=${encodeURIComponent(options.modelId)}`);
  }

  // Use current URL but strip any existing hash, then add our model hash
  // This handles GitHub Pages paths like /bngplayground/ correctly
  const url = new URL(window.location.href);
  url.hash = params.join('&');
  return url.toString();
}

function parseHashParams(hash: string): { model?: string; name?: string; modelId?: string } {
  const params: { model?: string; name?: string; modelId?: string } = {};
  const parts = hash.split('&');
  for (const part of parts) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split('=');
    const rawValue = rest.join('=');
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue ?? '');
    if (key === 'model') params.model = value;
    else if (key === 'name') params.name = value;
    else if (key === 'modelId') params.modelId = value;
  }
  return params;
}

// Extract model + metadata from URL hash if present
export function getSharedModelFromUrl(): SharedModelPayload | null {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash || '';
  const hash = rawHash.replace(/^#/, '');
  if (!hash || !hash.includes('model=')) return null;

  try {
    const params = parseHashParams(hash);
    const encoded = params.model;
    if (!encoded) return null;
    const code = decodeModelFromUrl(encoded);

    return {
      code,
      name: params.name || undefined,
      modelId: params.modelId || undefined,
    };
  } catch (e) {
    console.warn('Failed to decode model from URL:', e);
  }
  return null;
}

// Extract only the model code from URL hash if present
export function getModelFromUrl(): string | null {
  return getSharedModelFromUrl()?.code ?? null;
}

// Clear the model from URL hash
export function clearModelFromUrl(): void {
  if (typeof window !== 'undefined' && window.location.hash.includes('model=')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
