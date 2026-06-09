import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureStorage } from './SecureStorage';

describe('SecureStorage', () => {
  let originalCrypto: any;
  let originalIndexedDB: any;
  let originalLocalStorage: any;
  let mockStore: Record<string, string>;

  beforeEach(() => {
    // Save original globals
    originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    mockStore = {};

    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockStore[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStore[key] = value.toString();
        }),
        clear: vi.fn(() => {
          for (const k in mockStore) delete mockStore[k];
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStore[key];
        })
      },
      configurable: true,
      writable: true
    });

    // Mock basic IndexedDB structure
    const mockIndexedDB = {
      open: vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              return {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = { mockKey: true }; // Return a mock key
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      })
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: mockIndexedDB,
      configurable: true
    });

    // Default Mock Crypto
    const mockCrypto = {
      subtle: {
        generateKey: vi.fn().mockResolvedValue({ mockKey: true }),
        encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
        decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode('secret-message').buffer),
      },
      getRandomValues: vi.fn((arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i;
        return arr;
      })
    };
    Object.defineProperty(globalThis, 'crypto', { value: mockCrypto, configurable: true });
  });

  afterEach(() => {
    // Restore globals
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    } else {
      // @ts-ignore
      delete globalThis.crypto;
    }

    if (originalIndexedDB) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
    } else {
      // @ts-ignore
      delete globalThis.indexedDB;
    }

    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      // @ts-ignore
      delete globalThis.localStorage;
    }
  });

  describe('setItem', () => {
    it('aborts and warns if crypto is missing', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

      await SecureStorage.setItem('test-key', 'secret-message');

      expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('crypto or indexedDB not available'));
      consoleWarnSpy.mockRestore();
    });

    it('encrypts and stores the payload in localStorage', async () => {
      await SecureStorage.setItem('test-key', 'secret-message');

      expect(globalThis.localStorage.setItem).toHaveBeenCalledWith('test-key', expect.stringMatching(/^enc:/));
    });

    it('aborts and warns on encryption error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Force an encryption error
      globalThis.crypto.subtle.encrypt = vi.fn().mockRejectedValue(new Error('Encryption failed'));

      await SecureStorage.setItem('test-key', 'secret-message');

      expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getItem', () => {
    it('returns null if item is not found in localStorage', async () => {
      const result = await SecureStorage.getItem('nonexistent-key');
      expect(result).toBeNull();
    });

    it('aborts and returns null if crypto is missing', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalThis.localStorage.setItem('test-key', 'enc:YWJj:ZGVm');
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

      const result = await SecureStorage.getItem('test-key');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('crypto or indexedDB not available'));
      consoleWarnSpy.mockRestore();
    });

    it('returns null and warns if encrypted format is invalid (missing enc: prefix)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalThis.localStorage.setItem('test-key', 'invalid-format-abc-def');

      const result = await SecureStorage.getItem('test-key');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid encrypted format'));
      consoleWarnSpy.mockRestore();
    });

    it('returns null and warns on decryption error (e.g. invalid base64 parts)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Has enc: prefix but parts are invalid
      globalThis.localStorage.setItem('test-key', 'enc:invalid_b64!');

      const result = await SecureStorage.getItem('test-key');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Decryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });

    it('decrypts and returns the stored string correctly', async () => {
      // Mock an encrypted string format "enc:<ivBase64>:<encryptedBase64>"
      // btoa(String.fromCharCode(0, 1, 2)) -> 'AAEC'
      const mockPayload = 'enc:AAEC:AQID';
      globalThis.localStorage.setItem('test-key', mockPayload);

      const result = await SecureStorage.getItem('test-key');

      expect(result).toBe('secret-message');
      expect(globalThis.crypto.subtle.decrypt).toHaveBeenCalled();
    });
  });

  describe('Key Generation and IndexedDB', () => {
    it('generates a new key if one is not found in IndexedDB', async () => {
      // Mock the initial get to return null so it forces generateKey
      globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              return {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = null; // No existing key
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      // Provide a mock transaction completion to allow generation to resolve
      // We will override transaction to intercept the readwrite one.
      globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              const tx: any = {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = null; // Forces generation
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };

              if (mode === 'readwrite') {
                 setTimeout(() => {
                   if (tx.oncomplete) tx.oncomplete();
                 }, 0);
              }
              return tx;
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      await SecureStorage.setItem('test-key', 'secret-message');

      expect(globalThis.crypto.subtle.generateKey).toHaveBeenCalled();
    });

    it('handles indexedDB onupgradeneeded event', async () => {
      // Simulate onupgradeneeded
      const createObjectStoreMock = vi.fn();
      globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: createObjectStoreMock,
            transaction: vi.fn((storeName, mode) => {
              const tx: any = {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = { mockKey: true }; // Existing key
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };
              return tx;
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onupgradeneeded) request.onupgradeneeded();
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      await SecureStorage.setItem('test-key', 'secret-message');
      expect(createObjectStoreMock).toHaveBeenCalledWith('keys');
    });

    it('rejects if getDb fails', async () => {
      globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          onerror: null
        };
        setTimeout(() => {
          request.error = new Error('Database open failed');
          if (request.onerror) request.onerror();
        }, 0);
        return request;
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await SecureStorage.setItem('test-key', 'secret-message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });

    it('rejects if store.get fails', async () => {
      globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              return {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.error = new Error('Get failed');
                        if (req.onerror) req.onerror();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await SecureStorage.setItem('test-key', 'secret-message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });

    it('rejects if key generation or writeTx fails', async () => {
       globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              const tx: any = {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = null; // Forces generation
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };

              if (mode === 'readwrite') {
                 setTimeout(() => {
                   tx.error = new Error('Write failed');
                   if (tx.onerror) tx.onerror();
                 }, 0);
              }
              return tx;
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await SecureStorage.setItem('test-key', 'secret-message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });

    it('rejects if crypto.subtle.generateKey fails', async () => {
       globalThis.crypto.subtle.generateKey = vi.fn().mockRejectedValue(new Error('Generate failed'));

       globalThis.indexedDB.open = vi.fn((dbName, version) => {
        const request: any = {
          result: {
            createObjectStore: vi.fn(),
            transaction: vi.fn((storeName, mode) => {
              const tx: any = {
                objectStore: vi.fn(() => {
                  return {
                    get: vi.fn((keyId) => {
                      const req: any = {};
                      setTimeout(() => {
                        req.result = null; // Forces generation
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }),
                    put: vi.fn(() => {})
                  };
                }),
                oncomplete: null,
                onerror: null
              };
              return tx;
            })
          },
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null
        };

        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);

        return request;
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await SecureStorage.setItem('test-key', 'secret-message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption failed'), expect.any(Error));
      consoleWarnSpy.mockRestore();
    });
  });
});
