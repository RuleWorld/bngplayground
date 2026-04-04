// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeModelForUrl, getModelFromUrl, getSharedModelFromUrl, clearModelFromUrl } from '../src/utils/shareUrl';

describe('shareUrl utils', () => {
  beforeEach(() => {
    // Reset hash before each test
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  describe('clearModelFromUrl', () => {
    it('clears the model from the URL hash using history.replaceState', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      window.location.hash = '#model=123&other=456';

      clearModelFromUrl();

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        window.location.pathname + window.location.search
      );
    });

    it('does not call replaceState if hash does not contain model=', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      window.location.hash = '#other=456';

      clearModelFromUrl();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('does nothing when window is undefined', () => {
      // Stub window to be undefined
      vi.stubGlobal('window', undefined);

      // This shouldn't throw any errors
      expect(() => clearModelFromUrl()).not.toThrow();
    });
  });
});
