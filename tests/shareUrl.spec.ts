// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { encodeModelForUrl, getModelFromUrl, getSharedModelFromUrl, generateShareUrl } from '../src/utils/shareUrl';

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
});

describe('generateShareUrl', () => {
  it('generates a URL with only the model code', () => {
    const code = 'A+B';
    const encoded = encodeModelForUrl(code);
    const urlString = generateShareUrl(code);
    const url = new URL(urlString);
    expect(url.hash).toBe(`#model=${encodeURIComponent(encoded)}`);
  });

  it('generates a URL with model code and name', () => {
    const code = 'A+B';
    const encoded = encodeModelForUrl(code);
    const urlString = generateShareUrl(code, { name: 'My Model' });
    const url = new URL(urlString);
    expect(url.hash).toBe(`#model=${encodeURIComponent(encoded)}&name=My%20Model`);
  });

  it('generates a URL with model code, name, and modelId', () => {
    const code = 'A+B';
    const encoded = encodeModelForUrl(code);
    const urlString = generateShareUrl(code, { name: 'My Model', modelId: 'abc123' });
    const url = new URL(urlString);
    expect(url.hash).toBe(`#model=${encodeURIComponent(encoded)}&name=My%20Model&modelId=abc123`);
  });
});
