import { describe, expect, it } from 'vitest';
import { isSafeObjectKey, setSafeNumberField } from '../../src/utils/safeObjectKey';

describe('isSafeObjectKey', () => {
    it('blocks prototype-pollution keys', () => {
        expect(isSafeObjectKey('__proto__')).toBe(false);
        expect(isSafeObjectKey('constructor')).toBe(false);
        expect(isSafeObjectKey('prototype')).toBe(false);
    });

    it('allows ordinary model identifiers', () => {
        for (const k of ['k1', 'S1', 'A_bind', 'x+y', 'p-q']) {
            expect(isSafeObjectKey(k)).toBe(true);
        }
    });

    it('allows BNGL pattern/compartment characters', () => {
        expect(isSafeObjectKey('@PM:A')).toBe(true);
        expect(isSafeObjectKey('A(b!1)')).toBe(true);
    });

    it('rejects keys with characters outside the allowed set', () => {
        // These pass a denylist-only check but must be rejected by the pattern —
        // the behaviour the pre-consolidation weak copies were missing.
        expect(isSafeObjectKey('foo bar')).toBe(false);
        expect(isSafeObjectKey('a[b]')).toBe(false);
        expect(isSafeObjectKey('x/y')).toBe(false);
        expect(isSafeObjectKey('1abc')).toBe(false); // leading digit
    });
});

describe('setSafeNumberField', () => {
    it('writes safe keys and drops unsafe ones', () => {
        const target: Record<string, number> = {};
        setSafeNumberField(target, 'good', 5);
        setSafeNumberField(target, '__proto__', 999);
        expect(target.good).toBe(5);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    });
});
