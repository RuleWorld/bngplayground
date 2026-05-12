/**
 * Generates a cryptographically secure pseudo-random float between 0 (inclusive) and 1 (exclusive).
 *
 * @throws {Error} If crypto.getRandomValues is unavailable.
 * @returns {number} A float in [0, 1)
 */
export function secureRandom(): number {
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('secureRandom requires crypto.getRandomValues which is not available in this environment.');
  }

  const array = new Uint32Array(1);
  globalThis.crypto.getRandomValues(array);
  return array[0] / 4294967296; // 4294967296 is 2^32
}
