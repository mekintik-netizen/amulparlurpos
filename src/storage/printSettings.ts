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
import { stripSoftwareBranding } from '../utils/shopPdfBranding.ts';

const LOCAL_STORAGE_KEY = 'amul_pos_print_settings';
const CUSTOM_EVENT_KEY = 'amul-print-settings-changed';

let inMemoryConfig: PrintSettingsConfig | null = null;

/**
 * Strips any legacy third-party software branding from cached or remote print configs
 * so customer receipts always remain 100% white-labeled to the shop.
 */
export function sanitizePrintSettings(raw: Partial<PrintSettingsConfig>): PrintSettingsConfig {
  const merged: PrintSettingsConfig = {
    ...DEFAULT_PRINT_SETTINGS_CONFIG,
    ...raw
  };
  return {
    ...merged,
    headerTitle: stripSoftwareBranding(merged.headerTitle, ''),
    footerNote1: stripSoftwareBranding(merged.footerNote1, DEFAULT_PRINT_SETTINGS_CONFIG.footerNote1),
    footerNote2: stripSoftwareBranding(merged.footerNote2, DEFAULT_PRINT_SETTINGS_CONFIG.footerNote2),
    footerNote3: stripSoftwareBranding(merged.footerNote3, DEFAULT_PRINT_SETTINGS_CONFIG.footerNote3 || '')
  };
}

/**
 * Reads the current in-memory print settings (hydrated from Cloud Firestore `adminSettings/printConfig`).
 * Never relies on browser localStorage as a source of truth for business settings.
 */
export function getCachedPrintSettings(): PrintSettingsConfig {
  if (inMemoryConfig) return inMemoryConfig;
  inMemoryConfig = { ...DEFAULT_PRINT_SETTINGS_CONFIG };
  return inMemoryConfig;
}

/**
 * Updates in-memory configuration and dispatches in-tab custom event.
 * Business settings live strictly in Cloud Firestore (never persisted to localStorage).
 */
function cacheInMemory(config: PrintSettingsConfig): void {
  const sanitized = sanitizePrintSettings(config);
  inMemoryConfig = sanitized;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_KEY, { detail: sanitized }));
    }
  } catch {
    // ignore event dispatch issues
  }
}

/**
 * One-time safe reader & cleaner for any legacy localStorage print settings from older versions.
 */
function consumeLegacyPrintSettingsFromLocalStorage(): Partial<PrintSettingsConfig> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    return JSON.parse(raw) as Partial<PrintSettingsConfig>;
  } catch {
    return null;
  }
}

/**
 * Fetches the master Print Settings from Cloud Firestore (`adminSettings/printConfig`).
 * Performs a safe one-time migration if legacy localStorage settings existed and Firestore is empty,
 * then clears the legacy browser key so stale local cache never overwrites Cloud Firestore.
 */
export async function getPrintSettingsConfig(): Promise<PrintSettingsConfig> {
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'printConfig');
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      // Firestore already has authoritative data — purge any stale legacy localStorage key
      consumeLegacyPrintSettingsFromLocalStorage();
      const remote = snap.data() as Partial<PrintSettingsConfig>;
      const merged = sanitizePrintSettings(remote);
      cacheInMemory(merged);
      return merged;
    } else {
      // One-time safe migration of legacy localStorage settings if present; otherwise defaults
      const legacy = consumeLegacyPrintSettingsFromLocalStorage();
      const initial: PrintSettingsConfig = sanitizePrintSettings({
        ...DEFAULT_PRINT_SETTINGS_CONFIG,
        ...(legacy || {}),
        updatedAt: new Date().toISOString()
      });
      await setDoc(docRef, initial, { merge: true });
      cacheInMemory(initial);
      return initial;
    }
  } catch (err) {
    console.warn('[PrintSettings] Failed to fetch remote config from Firestore, using in-memory defaults:', err);
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
  const updated: PrintSettingsConfig = sanitizePrintSettings({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy
  });

  // 1. Immediately update in-memory state for responsive UI
  cacheInMemory(updated);

  // 2. Persist directly to Cloud Firestore
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'printConfig');
    await setDoc(docRef, updated, { merge: true });
  } catch (err) {
    console.error('[PrintSettings] Failed to save to Firestore:', err);
  }

  return updated;
}

/**
 * Resets print settings back to clean white-label shop defaults.
 */
export async function resetPrintSettingsConfig(updatedBy: string = 'Master Admin'): Promise<PrintSettingsConfig> {
  return savePrintSettingsConfig(DEFAULT_PRINT_SETTINGS_CONFIG, updatedBy);
}

/**
 * Subscribes to real-time changes in print settings across devices directly via Cloud Firestore onSnapshot.
 */
export function subscribeToPrintSettings(callback: (config: PrintSettingsConfig) => void): Unsubscribe {
  callback(getCachedPrintSettings());

  let firestoreUnsub: Unsubscribe = () => {};
  let isCancelled = false;

  ensureAnonymousAuth().then(() => {
    if (isCancelled) return;
    try {
      const docRef = doc(db, 'adminSettings', 'printConfig');
      firestoreUnsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const remote = snap.data() as Partial<PrintSettingsConfig>;
          const merged = sanitizePrintSettings(remote);
          cacheInMemory(merged);
          callback(merged);
        }
      }, (err) => {
        console.warn('[PrintSettings] Firestore realtime snapshot notice:', err.message);
      });
    } catch (err) {
      console.warn('[PrintSettings] Realtime listener setup skipped:', err);
    }
  });

  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<PrintSettingsConfig>;
    if (custom.detail) {
      callback(sanitizePrintSettings(custom.detail));
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);
  }

  return () => {
    isCancelled = true;
    firestoreUnsub();
    if (typeof window !== 'undefined') {
      window.removeEventListener(CUSTOM_EVENT_KEY, handleCustomEvent);
    }
  };
}
