'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'drafted_theme';

interface ThemeProviderProps {
  children: ReactNode;
  /** Force a specific theme (used by DevMode to force dark) */
  forcedTheme?: Theme | null;
}

export function ThemeProvider({ children, forcedTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        setThemeState(saved);
      }
    } catch (e) {
      console.error('[Theme] Failed to load theme:', e);
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;
    
    const effectiveTheme = forcedTheme ?? theme;
    const root = document.documentElement;
    
    // Remove both classes first
    root.classList.remove('light', 'dark');
    // Add the active theme class
    root.classList.add(effectiveTheme);
    
    // Also set data attribute for CSS selectors
    root.setAttribute('data-theme', effectiveTheme);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        effectiveTheme === 'dark' ? '#1a1a2e' : '#faf9f7'
      );
    }
  }, [theme, forcedTheme, mounted]);

  // Save theme to localStorage
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      console.error('[Theme] Failed to save theme:', e);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const effectiveTheme = forcedTheme ?? theme;
  const isDark = effectiveTheme === 'dark';

  const value: ThemeContextValue = {
    theme: effectiveTheme,
    setTheme,
    toggleTheme,
    isDark,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext);
}






