/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Global Theme Management & LocalStorage Persistence
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getStoredTheme, applyTheme, THEME_STORAGE_KEY } from '../src/storage/theme.ts';

describe('Global Theme Management & LocalStorage Persistence', () => {
  let mockStorage: Record<string, string> = {};
  const classListSet = new Set<string>();
  const attributes: Record<string, string> = {};

  const mockLocalStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = String(val);
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      mockStorage = {};
    }
  };

  const mockDocumentElement = {
    classList: {
      add: (c: string) => classListSet.add(c),
      remove: (c: string) => classListSet.delete(c),
      contains: (c: string) => classListSet.has(c)
    },
    setAttribute: (k: string, v: string) => {
      attributes[k] = v;
    },
    getAttribute: (k: string) => attributes[k] || null,
    removeAttribute: (k: string) => {
      delete attributes[k];
    },
    style: { colorScheme: '' }
  };

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    mockStorage = {};
    classListSet.clear();
    Object.keys(attributes).forEach((k) => delete attributes[k]);
    mockDocumentElement.style.colorScheme = '';

    // Set up mock DOM globals
    // @ts-ignore
    globalThis.localStorage = mockLocalStorage;
    // @ts-ignore
    globalThis.document = {
      documentElement: mockDocumentElement as unknown as HTMLElement
    } as unknown as Document;
    // @ts-ignore
    globalThis.window = {
      matchMedia: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      })
    };
  });

  afterAll(() => {
    // @ts-ignore
    globalThis.window = originalWindow;
    // @ts-ignore
    globalThis.document = originalDocument;
    // @ts-ignore
    globalThis.localStorage = originalLocalStorage;
  });

  it('defaults to light theme when localStorage is empty and system is light', () => {
    const theme = getStoredTheme();
    expect(theme).toBe('light');
  });

  it('retrieves saved "dark" theme from localStorage', () => {
    mockLocalStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const theme = getStoredTheme();
    expect(theme).toBe('dark');
  });

  it('retrieves saved "light" theme from localStorage', () => {
    mockLocalStorage.setItem(THEME_STORAGE_KEY, 'light');
    const theme = getStoredTheme();
    expect(theme).toBe('light');
  });

  it('applies dark theme by updating document.documentElement and persisting to localStorage', () => {
    applyTheme('dark');

    expect(mockDocumentElement.classList.contains('dark')).toBe(true);
    expect(mockDocumentElement.getAttribute('data-theme')).toBe('dark');
    expect(mockDocumentElement.style.colorScheme).toBe('dark');
    expect(mockLocalStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('applies light theme by removing dark class and persisting to localStorage', () => {
    // First apply dark
    applyTheme('dark');
    expect(mockDocumentElement.classList.contains('dark')).toBe(true);

    // Then switch to light
    applyTheme('light');
    expect(mockDocumentElement.classList.contains('dark')).toBe(false);
    expect(mockDocumentElement.getAttribute('data-theme')).toBe('light');
    expect(mockDocumentElement.style.colorScheme).toBe('light');
    expect(mockLocalStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('toggles repeatedly between light and dark without state drift', () => {
    applyTheme('dark');
    expect(mockLocalStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(mockDocumentElement.classList.contains('dark')).toBe(true);

    applyTheme('light');
    expect(mockLocalStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(mockDocumentElement.classList.contains('dark')).toBe(false);

    applyTheme('dark');
    expect(mockLocalStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(mockDocumentElement.classList.contains('dark')).toBe(true);
  });
});
