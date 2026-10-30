/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Global Theme Management (Light / Dark mode) with LocalStorage persistence
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'amul_pos_theme';

/**
 * Retrieves the saved theme from localStorage, or defaults to system preference / light mode.
 */
export function getStoredTheme(): Theme {
  try {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch (e) {
    console.warn('Failed to access localStorage for theme:', e);
  }
  return 'light';
}

/**
 * Applies the theme to document.documentElement (.dark class and data-theme attribute)
 * and persists the preference to localStorage.
 */
export function applyTheme(theme: Theme): void {
  try {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch (e) {
    console.warn('Failed to apply/persist theme:', e);
  }
}
