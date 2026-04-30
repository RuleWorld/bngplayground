// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../hooks/useTheme';

describe('useTheme hook', () => {
    beforeEach(() => {
        // Clear localStorage and DOM state before each test
        localStorage.clear();
        document.documentElement.className = '';
    });

    afterEach(() => {
        localStorage.clear();
        document.documentElement.className = '';
    });

    it('should initialize with "light" theme by default when no value is in localStorage', () => {
        const { result } = renderHook(() => useTheme());
        const [theme] = result.current;

        expect(theme).toBe('light');
        expect(localStorage.getItem('theme')).toBe('light');
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should initialize with "dark" theme if it is saved in localStorage', () => {
        localStorage.setItem('theme', 'dark');

        const { result } = renderHook(() => useTheme());
        const [theme] = result.current;

        expect(theme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('should fallback to "light" theme if an invalid value is in localStorage', () => {
        localStorage.setItem('theme', 'invalid-theme');

        const { result } = renderHook(() => useTheme());
        const [theme] = result.current;

        expect(theme).toBe('light');
        expect(localStorage.getItem('theme')).toBe('light'); // The useEffect should overwrite the invalid value
    });

    it('should toggle theme from light to dark', () => {
        const { result } = renderHook(() => useTheme());

        // Initial state is light
        expect(result.current[0]).toBe('light');

        // Toggle to dark
        act(() => {
            result.current[1]();
        });

        expect(result.current[0]).toBe('dark');
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('should toggle theme from dark to light', () => {
        localStorage.setItem('theme', 'dark');
        const { result } = renderHook(() => useTheme());

        // Initial state is dark
        expect(result.current[0]).toBe('dark');

        // Toggle to light
        act(() => {
            result.current[1]();
        });

        expect(result.current[0]).toBe('light');
        expect(localStorage.getItem('theme')).toBe('light');
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
