// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { encodeModelForUrl, decodeModelFromUrl, getModelFromUrl, getSharedModelFromUrl } from '../src/utils/shareUrl';

describe('shareUrl utils', () => {
  it('decodes a raw base64 model from hash', () => {
    const code = 'A+B\nparam k=1';
    const encoded = encodeModelForUrl(code);
    window.location.hash = `#model=${encoded}`;
    expect(getModelFromUrl()).toBe(code);
  });

  it('decodes a percent-encoded model from hash', () => {
    const code = 'A+B\nparam k=1';
    const encoded = encodeModelForUrl(code);
    // Simulate a link that was percent-encoded (e.g. sent via email)
    window.location.hash = `#model=${encodeURIComponent(encoded)}`;
    expect(getModelFromUrl()).toBe(code);
  });

  it('finds model when there are other hash params', () => {
    const code = 'species A+B -> C';
    const encoded = encodeModelForUrl(code);
    window.location.hash = `#foo=1&model=${encoded}&bar=2`;
    expect(getModelFromUrl()).toBe(code);
  });

  it('returns null when no model is present', () => {
    window.location.hash = '#foo=bar';
    expect(getModelFromUrl()).toBeNull();
  });

  it('parses optional name and modelId metadata', () => {
    const code = 'begin model\nend model';
    const encoded = encodeModelForUrl(code);
    window.location.hash = `#model=${encoded}&name=${encodeURIComponent('My Model')}&modelId=abc123`;

    const shared = getSharedModelFromUrl();
    expect(shared?.code).toBe(code);
    expect(shared?.name).toBe('My Model');
    expect(shared?.modelId).toBe('abc123');
  });

  describe('encodeModelForUrl error handling and fallback', () => {
    it('falls back to legacy encoding if TextEncoder is not available', () => {
      const OriginalEncoder = global.TextEncoder;
      (global as any).TextEncoder = undefined;

      try {
        const code = 'species A+B -> C (emoji 😀)';
        const encoded = encodeModelForUrl(code);
        // Uses legacy fallback: btoa(unescape(encodeURIComponent(code)))
        expect(encoded).toBe(btoa(unescape(encodeURIComponent(code))));

        // Restore to decode
        global.TextEncoder = OriginalEncoder;
        expect(decodeModelFromUrl(encoded)).toBe(code);
      } finally {
        global.TextEncoder = OriginalEncoder;
      }
    });
  });

  describe('decodeModelFromUrl error handling and fallback', () => {
    it('throws an error for malformed base64 input', () => {
      expect(() => decodeModelFromUrl('!@#$not-valid-base64')).toThrow();
    });

    it('falls back to legacy decoding if TextDecoder is not available', () => {
      const OriginalDecoder = global.TextDecoder;
      (global as any).TextDecoder = undefined;

      try {
        const code = 'species A+B -> C (emoji 😀)';
        // Encode using legacy method explicitly to ensure it decodes correctly
        const legacyEncoded = btoa(unescape(encodeURIComponent(code)));
        expect(decodeModelFromUrl(legacyEncoded)).toBe(code);
      } finally {
        global.TextDecoder = OriginalDecoder;
      }
    });
  });

  describe('getSharedModelFromUrl error handling', () => {
    it('returns null and logs a warning when URL hash contains malformed base64', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.location.hash = '#model=!@#$not-valid-base64';

      expect(getSharedModelFromUrl()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('Failed to decode model from URL:', expect.any(Error));

      warnSpy.mockRestore();
    });
  });
});
