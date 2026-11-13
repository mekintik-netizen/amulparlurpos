/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Print Settings Persistence & Real-time Cloud Synchronization
 * Manages receipt layout, header/footer text, compactness, and margins.
 * Persists directly to Cloud Firestore collection 'adminSettings', document 'printConfig'
 * with local caching for instant counter rendering and offline reliability.
 */

import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase.ts';
import { PrintSettingsConfig, DEFAULT_PRINT_SETTINGS_CONFIG } from '../types/index.ts';

const LOCAL_STORAGE_KEY = 'amul_pos_print_settings';
const CUSTOM_EVENT_KEY = 'amul-print-settings-changed';

let inMemoryConfig: PrintSettingsConfig | null = null;

/**
 * Cleanly reads the cached print settings from LocalStorage or returns defaults.
 */
export function getCachedPrintSettings(): PrintSettingsConfig {
  if (inMemoryConfig) return inMemoryConfig;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        inMemoryConfig = { ...DEFAULT_PRINT_SETTINGS_CONFIG, ...parsed };
        return inMemoryConfig!;
      }
    }
  } catch (err) {
    console.warn('[PrintSettings] Failed to parse local print config:', err);
  }

  inMemoryConfig = { ...DEFAULT_PRINT_SETTINGS_CONFIG };
  return inMemoryConfig;
}

/**
 * Saves configuration to local cache and dispatches cross-tab event.
 */
function cacheLocally(config: PrintSettingsConfig): void {
  inMemoryConfig = config;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_KEY, { detail: config }));
    }
  } catch (err) {
    console.warn('[PrintSettings] Failed to update local storage:', err);
  }
}

/**
 * Fetches the master Print Settings from Cloud Firestore (`adminSettings/printConfig`).
 * If not yet created in Firestore, seeds the document with default values.
 */
export async function getPrintSettingsConfig(): Promise<PrintSettingsConfig> {
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'printConfig');
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const remote = snap.data() as Partial<PrintSettingsConfig>;
      const merged: PrintSettingsConfig = {
        ...DEFAULT_PRINT_SETTINGS_CONFIG,
        ...remote
      };
      cacheLocally(merged);
      return merged;
    } else {
      // Initialize with default configuration in Firestore
      const initial: PrintSettingsConfig = {
        ...DEFAULT_PRINT_SETTINGS_CONFIG,
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, initial, { merge: true });
      cacheLocally(initial);
      return initial;
    }
  } catch (err) {
    console.warn('[PrintSettings] Failed to fetch remote config from Firestore, using cache:', err);
    return getCachedPrintSettings();
  }
}

/**
 * Saves customized print settings directly to Cloud Firestore under `adminSettings/printConfig`
 * and updates local memory/storage.
 */
export async function savePrintSettingsConfig(
  updates: Partial<PrintSettingsConfig>,
  updatedBy: string = 'Master Admin'
): Promise<PrintSettingsConfig> {
  const current = getCachedPrintSettings();
  const updated: PrintSettingsConfig = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy
  };

  // 1. Immediately update cache for local responsive UI
  cacheLocally(updated);

  // 2. Persist to Cloud Firestore
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'printConfig');
    await setDoc(docRef, updated, { merge: true });
  } catch (err) {
    console.error('[PrintSettings] Failed to save to Firestore:', err);
    // Even if remote push fails temporarily, the local state is preserved
  }

  return updated;
}

/**
 * Resets print settings back to official Amul default recommendations.
 */
export async function resetPrintSettingsConfig(updatedBy: string = 'Master Admin'): Promise<PrintSettingsConfig> {
  return savePrintSettingsConfig(DEFAULT_PRINT_SETTINGS_CONFIG, updatedBy);
}

/**
 * Subscribes to real-time changes in print settings across devices.
 * Calls callback immediately with current cache, then listens to Firestore and LocalStorage changes.
 */
export function subscribeToPrintSettings(callback: (config: PrintSettingsConfig) => void): Unsubscribe {
  // 1. Trigger immediately with current cached values
  callback(getCachedPrintSettings());

  // 2. Listen to Firestore real-time snapshot once authenticated
  let firestoreUnsub: Unsubscribe = () => {};
  let isCancelled = false;

  ensureAnonymousAuth().then(() => {
    if (isCancelled) return;
    try {
      const docRef = doc(db, 'adminSettings', 'printConfig');
      firestoreUnsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const remote = snap.data() as Partial<PrintSettingsConfig>;
          const merged: PrintSettingsConfig = {
            ...DEFAULT_PRINT_SETTINGS_CONFIG,
            ...remote
          };
          cacheLocally(merged);
          callback(merged);
        }
      }, (err) => {
        console.warn('[PrintSettings] Firestore realtime snapshot notice:', err.message);
      });
    } catch (err) {
      console.warn('[PrintSettings] Realtime listener setup skipped:', err);
    }
  });

  // 3. Listen to local custom event for instant same-tab updates
  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<PrintSettingsConfig>;
    if (custom.detail) {
      callback(custom.detail);
    }
  };

  // 4. Listen to cross-tab storage event
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        callback({ ...DEFAULT_PRINT_SETTINGS_CONFIG, ...parsed });
      } catch (err) {
        // Ignore parse error
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    isCancelled = true;
    firestoreUnsub();
    if (typeof window !== 'undefined') {
      window.removeEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}
