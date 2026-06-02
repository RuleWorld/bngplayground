/**
 * A secure storage utility that encrypts data before storing it in localStorage.
 * Uses AES-GCM for encryption with a non-extractable key stored in IndexedDB.
 */

const DB_NAME = 'BioNetGenSecureKeyDB';
const STORE_NAME = 'keys';
const KEY_ID = 'master-key';

async function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOrGenerateKey(): Promise<CryptoKey> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(KEY_ID);

    request.onsuccess = async () => {
      if (request.result) {
        resolve(request.result);
      } else {
        try {
          const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // non-extractable
            ['encrypt', 'decrypt']
          );
          const writeTx = db.transaction(STORE_NAME, 'readwrite');
          const writeStore = writeTx.objectStore(STORE_NAME);
          writeStore.put(key, KEY_ID);

          writeTx.oncomplete = () => resolve(key);
          writeTx.onerror = () => reject(writeTx.error);
        } catch (e) {
          reject(e);
        }
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export class SecureStorage {
  /**
   * Encrypts and stores a string value in localStorage.
   */
  static async setItem(key: string, value: string): Promise<void> {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle || typeof globalThis.indexedDB === 'undefined') {
      console.warn('SecureStorage: crypto or indexedDB not available. Storage operation aborted to prevent insecure fallback.');
      return;
    }

    try {
      const cryptoKey = await getOrGenerateKey();
      const enc = new TextEncoder();

      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        enc.encode(value)
      );

      const ivBase64 = btoa(String.fromCharCode(...iv));
      const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

      const payload = `enc:${ivBase64}:${encryptedBase64}`;
      localStorage.setItem(key, payload);
    } catch (e) {
      console.warn('SecureStorage: Encryption failed. Storage operation aborted to prevent insecure fallback.', e);
    }
  }

  /**
   * Retrieves and decrypts a value from localStorage.
   */
  static async getItem(key: string): Promise<string | null> {
    const encryptedText = localStorage.getItem(key);
    if (!encryptedText) {
      return null;
    }

    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle || typeof globalThis.indexedDB === 'undefined') {
      console.warn('SecureStorage: crypto or indexedDB not available. Reading fallback insecure value.');
      try {
        return atob(encryptedText);
      } catch {
        return encryptedText;
      }
    }

    try {
      if (!encryptedText.startsWith('enc:')) {
        try {
          const decoded = atob(encryptedText);
          return decoded;
        } catch {
          return encryptedText;
        }
      }

      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      const [, ivBase64, encryptedBase64] = parts;
      const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
      const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));

      const cryptoKey = await getOrGenerateKey();
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encrypted
      );

      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (e) {
      console.warn('SecureStorage: Decryption failed, reading fallback insecure value.', e);
      try {
          return atob(encryptedText);
      } catch {
          return encryptedText;
      }
    }
  }
}
