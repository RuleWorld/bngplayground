import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme(): [Theme, () => void] {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        // valid values check, default to 'light'
        return (saved === 'dark' || saved === 'light') ? saved : 'light';
    });

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    return [theme, toggleTheme];
}
