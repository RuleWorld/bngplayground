import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { secureRandom } from './secureRandom';

describe('secureRandom', () => {
  let originalCrypto: any;

  beforeEach(() => {
    // Save original globalThis.crypto getter/setter if possible, or just value
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    originalCrypto = descriptor ? descriptor : { value: globalThis.crypto, writable: true, configurable: true };
  });

  afterEach(() => {
    // Restore original crypto
    Object.defineProperty(globalThis, 'crypto', originalCrypto);
  });

  it('should generate a number between 0 and 1', () => {
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
      const val = secureRandom();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    } else {
      console.warn('Skipping test because crypto is not available in test environment');
    }
  });

  it('should throw an error if crypto is undefined', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    expect(() => secureRandom()).toThrow('secureRandom requires crypto.getRandomValues which is not available in this environment.');
  });

  it('should throw an error if crypto.getRandomValues is not a function', () => {
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: null }, configurable: true });

    expect(() => secureRandom()).toThrow('secureRandom requires crypto.getRandomValues which is not available in this environment.');
  });

  it('should use crypto.getRandomValues and divide by 2^32', () => {
    // Mock getRandomValues
    const mockGetRandomValues = vi.fn((arr: Uint32Array) => {
        arr[0] = 2147483648; // exactly half of 2^32
        return arr;
    });

    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: mockGetRandomValues }, configurable: true });

    const val = secureRandom();

    expect(mockGetRandomValues).toHaveBeenCalled();
    expect(val).toBe(0.5);
  });
});
