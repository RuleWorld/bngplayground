import { describe, expect, it } from 'vitest';
import {
    normalizeWhitespace,
    collapseWhitespace,
    escapeRegExp,
    stripInlineComment,
    isIdentifierChar,
} from '../../src/utils/stringUtils';

describe('normalizeWhitespace', () => {
    it('collapses runs of whitespace and trims', () => {
        expect(normalizeWhitespace('  a   b\t c  ')).toBe('a b c');
    });
    it('treats Unicode whitespace as whitespace (regex \\s)', () => {
        expect(normalizeWhitespace('a\u00a0b')).toBe('a b');
    });
});

describe('collapseWhitespace', () => {
    it('collapses ASCII whitespace and trims', () => {
        expect(collapseWhitespace('  a   b\tc  ')).toBe('a b c');
    });
    it('is ASCII-only: leaves Unicode whitespace untouched', () => {
        expect(collapseWhitespace('a\u00a0b')).toBe('a\u00a0b');
    });
    it('differs from normalizeWhitespace on Unicode — the reason they stay distinct', () => {
        const input = 'a\u00a0b';
        expect(collapseWhitespace(input)).not.toBe(normalizeWhitespace(input));
    });
});

describe('escapeRegExp', () => {
    it('escapes regex metacharacters', () => {
        expect(escapeRegExp('a.b(c)[d]')).toBe('a\\.b\\(c\\)\\[d\\]');
    });
    it('produces a pattern that matches the original literally', () => {
        expect(new RegExp('^' + escapeRegExp('k[1]') + '$').test('k[1]')).toBe(true);
    });
});

describe('stripInlineComment', () => {
    it('removes a trailing # comment and trims', () => {
        expect(stripInlineComment('  A = 1  # rate ')).toBe('A = 1');
        expect(stripInlineComment('  A = 1 ')).toBe('A = 1');
    });
});

describe('isIdentifierChar', () => {
    it('accepts identifier characters and rejects others', () => {
        for (const c of ['a', 'Z', '7', '_', '$']) expect(isIdentifierChar(c)).toBe(true);
        for (const c of ['(', ' ', '-', undefined]) expect(isIdentifierChar(c)).toBe(false);
    });
});
