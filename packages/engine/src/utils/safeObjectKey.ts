/**
 * safeObjectKey.ts — canonical guard for writing string keys into plain objects.
 *
 * Simulation and expression code builds `Record<string, number>` maps keyed by
 * species/observable/parameter names taken from user models. Writing an
 * attacker-controlled key such as `__proto__` into such an object is a
 * prototype-pollution vector, so every such write must be gated.
 *
 * This consolidates several copies that had drifted apart: some checked both a
 * character allowlist pattern and a denylist, others only the denylist (a
 * weaker check). The canonical guard applies both — the denylist blocks the
 * classic pollution keys, and the pattern rejects anything with unexpected
 * characters as defence in depth — and caches results, since the same handful
 * of keys are validated repeatedly inside hot simulation loops.
 */

export const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Model identifiers: letters/underscore start, then BNGL name characters
// (component syntax, compartments, bonds, states, stoichiometric signs).
const SAFE_OBJECT_KEY_PATTERN = /^[A-Za-z_@:.!~(),+\-][A-Za-z0-9_@:.!~(),+\-]*$/;

const SAFE_KEY_CACHE = new Set<string>();
const UNSAFE_KEY_CACHE = new Set<string>();
const KEY_CACHE_MAX = 100000;

/**
 * True if `key` is safe to use as a property name on a plain object: it is not
 * a prototype-pollution key and matches the allowed identifier pattern.
 */
export function isSafeObjectKey(key: string): boolean {
    if (SAFE_KEY_CACHE.has(key)) return true;
    if (UNSAFE_KEY_CACHE.has(key)) return false;
    const safe = SAFE_OBJECT_KEY_PATTERN.test(key) && !UNSAFE_OBJECT_KEYS.has(key);
    if (SAFE_KEY_CACHE.size + UNSAFE_KEY_CACHE.size >= KEY_CACHE_MAX) {
        SAFE_KEY_CACHE.clear();
        UNSAFE_KEY_CACHE.clear();
    }
    (safe ? SAFE_KEY_CACHE : UNSAFE_KEY_CACHE).add(key);
    return safe;
}

/**
 * Write `value` to `target[key]` only if `key` passes {@link isSafeObjectKey};
 * unsafe keys are silently dropped.
 */
export function setSafeNumberField(
    target: Record<string, number>,
    key: string,
    value: number,
): void {
    if (!isSafeObjectKey(key)) return;
    Reflect.set(target, key, value);
}
