import { describe, it, expect } from 'vitest';
import { compile } from '../services/safeExpressionEvaluator';

describe('SafeExpressionEvaluator Fuzzing', () => {
    const NUM_TESTS = 1000;
    const MAX_LEN = 50;
    const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789+-*/%^()., ';

    function generateRandomString(len: number): string {
        let res = '';
        for (let i = 0; i < len; i++) {
            res += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        }
        return res;
    }

    it('should not crash or hang on random inputs', () => {
        let failures = 0;
        for (let i = 0; i < NUM_TESTS; i++) {
            const expr = generateRandomString(Math.floor(Math.random() * MAX_LEN) + 1);
            try {
                // It should either compile or throw a handled error
                compile(expr, []);
            } catch (e: any) {
                // Error is expected for garbage input
                // Check if it's a stack overflow (RangeError) -> that would be bad
                if (e instanceof RangeError && e.message.includes('stack')) {
                    console.error('Stack overflow detected on input:', expr);
                    failures++;
                }
            }
        }
        expect(failures).toBe(0);
    });

    it('should reject repeated operators', () => {
        const sensitive = ['+++', '---', '***', '///', '^^^'];
        sensitive.forEach(pattern => {
            expect(() => compile(`1 ${pattern} 2`, [])).toThrow();
        });
    });
});
