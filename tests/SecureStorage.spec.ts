/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureStorage } from '../src/utils/SecureStorage';

describe('SecureStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('setItem does not use base64 fallback when crypto is unavailable', async () => {
    // Save original object
    const originalCrypto = globalThis.crypto;

    // Simulate no crypto
    // @ts-ignore
    delete globalThis.crypto;

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await SecureStorage.setItem('test-key', 'secret-value');

    // It should not store plaintext or base64 equivalent
    const stored = localStorage.getItem('test-key');
    expect(stored).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
        'SecureStorage: crypto or indexedDB not available. Storage operation aborted to prevent insecure fallback.'
    );

    // Restore
    globalThis.crypto = originalCrypto;
  });

  it('getItem returns null when crypto is unavailable and data is validly missing', async () => {
    const originalCrypto = globalThis.crypto;
    // @ts-ignore
    delete globalThis.crypto;

    const value = await SecureStorage.getItem('test-key');
    expect(value).toBeNull();

    globalThis.crypto = originalCrypto;
  });
});
