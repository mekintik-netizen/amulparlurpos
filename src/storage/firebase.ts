/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase SDK Initialization & Cloud Firestore Real-time Engine
 * Uses the exact project configuration provided for amulparlour.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  enableNetwork,
  disableNetwork,
  setLogLevel,
  Firestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

type AppletFirebaseConfig = typeof firebaseAppletConfig & {
  firestoreDatabaseId?: string;
};

export const firebaseConfig: AppletFirebaseConfig = firebaseAppletConfig;

// Initialize Firebase App singleton safely
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function initFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  // Prevent @firebase/firestore internal OnlineStateTracker from emitting noisy 10s console.error on offline/proxy devices;
  // application-level try/catch and onSnapshot error handlers still report actual operation failures.
  try {
    if (typeof setLogLevel === 'function') {
      setLogLevel('silent');
    }
  } catch {
    // ignore in restricted environments
  }

  const databaseId = firebaseConfig.firestoreDatabaseId;
  try {
    // Auto-detect long-polling cleanly so standard HTTP/2 WebChannel works when available and proxies fall back smoothly
    return initializeFirestore(
      firebaseApp,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true
      },
      databaseId
    );
  } catch {
    return databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
  }
}

export const db: Firestore = initFirestoreInstance(app);
export const auth: Auth = getAuth(app);

let networkEnabled = typeof navigator === 'undefined' ? true : navigator.onLine;
let authAuthenticated = false;

export function isFirebasePermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; status?: number };
  const code = String(e.code || '').toLowerCase();
  const msg = String(e.message || '').toLowerCase();
  return (
    code === 'permission-denied' ||
    code.includes('permission') ||
    e.status === 403 ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission_denied') ||
    msg.includes('403')
  );
}

export function hasAuthenticatedFirebaseUser(): boolean {
  try {
    return authAuthenticated || Boolean(auth?.currentUser);
  } catch {
    return false;
  }
}

/**
 * Fast, non-intrusive reachability check using same-origin manifest HEAD probe.
 * Avoids hitting Cloud Firestore REST endpoints anonymously before Auth completes (which causes HTTP 403).
 */
export async function probeFirestoreReachability(timeoutMs: number = 3500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch('./manifest.json', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function setFirestoreOfflineCleanly(): Promise<void> {
  networkEnabled = false;
  try {
    await disableNetwork(db);
  } catch {
    // ignore
  }
}

async function syncNetworkStateWithConnectivity(): Promise<boolean> {
  const reachable = await probeFirestoreReachability(3500);
  if (!reachable) {
    await setFirestoreOfflineCleanly();
    return false;
  }
  if (!networkEnabled) {
    networkEnabled = true;
    try {
      await enableNetwork(db);
    } catch {
      // ignore
    }
  }
  return true;
}

// Keep Firestore network state aligned with browser connectivity so offline states never log 10s backend timeouts
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  if (!navigator.onLine) {
    setFirestoreOfflineCleanly().catch(() => {});
  }
  window.addEventListener('offline', () => {
    setFirestoreOfflineCleanly().catch(() => {});
  });
  window.addEventListener('online', () => {
    syncNetworkStateWithConnectivity().catch(() => {});
  });
}

// Check existing session via onAuthStateChanged and silently authenticate anonymously if needed
export const authReady: Promise<void> = new Promise<void>((resolve) => {
  let settled = false;
  const finish = () => {
    if (!settled) {
      settled = true;
      resolve();
    }
  };

  // Never block local-first IndexedDB UI if network auth is slow or offline
  const timeoutId = setTimeout(() => {
    setFirestoreOfflineCleanly().catch(() => {});
    finish();
  }, 4500);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    clearTimeout(timeoutId);
    finish();
    return;
  }

  let unsub: (() => void) | undefined;
  try {
    unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (unsub) {
          unsub();
          unsub = undefined;
        }
        if (user) {
          authAuthenticated = true;
          clearTimeout(timeoutId);
          console.log('[Firebase] Secure anonymous session active');
          finish();
          return;
        }
        try {
          await signInAnonymously(auth);
          authAuthenticated = true;
          console.log('[Firebase] Secure anonymous session active');
        } catch (error: any) {
          authAuthenticated = false;
          console.warn('[Firebase] Anonymous auth deferred (offline/local mode):', error?.code || error?.message);
          await setFirestoreOfflineCleanly();
        } finally {
          clearTimeout(timeoutId);
          finish();
        }
      },
      () => {
        authAuthenticated = false;
        clearTimeout(timeoutId);
        setFirestoreOfflineCleanly().catch(() => {});
        finish();
      }
    );
  } catch {
    authAuthenticated = false;
    clearTimeout(timeoutId);
    finish();
  }
});

let retryAuthPromise: Promise<boolean> | null = null;

export async function ensureAnonymousAuth(): Promise<boolean> {
  await authReady;

  if (authAuthenticated || Boolean(auth?.currentUser)) {
    authAuthenticated = true;
    if (!networkEnabled && (typeof navigator === 'undefined' || navigator.onLine)) {
      networkEnabled = true;
      try {
        await enableNetwork(db);
      } catch {
        // ignore
      }
    }
    return true;
  }

  // If offline, stay local-first without throwing
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  // Retry silent anonymous auth cleanly if initial startup auth timed out or was deferred
  if (!retryAuthPromise) {
    retryAuthPromise = (async () => {
      try {
        if (!networkEnabled) {
          networkEnabled = true;
          try {
            await enableNetwork(db);
          } catch {
            // ignore
          }
        }
        await signInAnonymously(auth);
        authAuthenticated = true;
        return true;
      } catch {
        authAuthenticated = false;
        return false;
      } finally {
        retryAuthPromise = null;
      }
    })();
  }

  return retryAuthPromise;
}

/**
 * Forces Firestore network re-enable + anonymous auth recovery (used by manual "Sync Cloud Data" and login hydration).
 */
export async function reconnectFirestoreCloud(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  networkEnabled = true;
  try {
    await enableNetwork(db);
  } catch {
    // ignore
  }
  return ensureAnonymousAuth();
}

/**
 * Validates Cloud Firestore connectivity after authentication completes without issuing
 * synthetic unauthenticated document reads that can emit 403 console errors.
 */
export async function validateFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await setFirestoreOfflineCleanly();
    return false;
  }
  await ensureAnonymousAuth();
  const reachable = await syncNetworkStateWithConnectivity();
  if (!reachable) return false;
  return networkEnabled;
}

export interface AdminAuthConfig {
  superAdminEmail: string;
  superAdminPhone: string;
  paymentQrUrl?: string; // Master Admin's uploaded Payment QR
  desktopIconIcoBase64?: string; // Multi-size Windows .ico data URL synced across devices
  brandLogoPngBase64?: string;   // Official circular PNG brand logo data URL
  desktopIconUpdatedAt?: string;
  adminName?: string;
  adminUsername?: string;
  adminPasswordHash?: string;
  adminSalt?: string;
  updatedAt?: string;
}

export const DEFAULT_ADMIN_AUTH_CONFIG: AdminAuthConfig = {
  superAdminEmail: "mekintik@gmail.com",
  superAdminPhone: "+919173598234",
  paymentQrUrl: "",
  desktopIconIcoBase64: "",
  brandLogoPngBase64: "",
  desktopIconUpdatedAt: "",
  adminName: "Master Admin",
  adminUsername: "admin"
};

/**
 * Fetches the Master Admin Auth Config from Firestore collection 'adminSettings', document 'authConfig'.
 * Initializes it with default superAdmin credentials if it doesn't exist yet.
 */
export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  try {
    await authReady;
    const configDocRef = doc(db, 'adminSettings', 'authConfig');
    const snapshot = await getDoc(configDocRef);
    if (snapshot.exists()) {
      return {
        ...DEFAULT_ADMIN_AUTH_CONFIG,
        ...(snapshot.data() as Partial<AdminAuthConfig>)
      };
    } else {
      // Seed default config
      await setDoc(configDocRef, {
        ...DEFAULT_ADMIN_AUTH_CONFIG,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return DEFAULT_ADMIN_AUTH_CONFIG;
    }
  } catch (err) {
    console.warn('[Firebase] Could not fetch remote adminSettings, using local defaults:', err);
    return DEFAULT_ADMIN_AUTH_CONFIG;
  }
}

/**
 * Updates Master Admin Auth Config (including Payment QR) in Firestore.
 */
export async function updateAdminAuthConfig(updates: Partial<AdminAuthConfig>): Promise<void> {
  try {
    await authReady;
    const configDocRef = doc(db, 'adminSettings', 'authConfig');
    await setDoc(configDocRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to update admin auth config:', err);
    throw err;
  }
}

/**
 * Subscribes to real-time changes of the Admin Auth Config (e.g. Payment QR updates).
 */
export function subscribeToAdminAuthConfig(callback: (config: AdminAuthConfig) => void): Unsubscribe {
  let firestoreUnsub: Unsubscribe = () => {};
  let isCancelled = false;

  authReady.then(() => {
    if (isCancelled) return;
    try {
      const configDocRef = doc(db, 'adminSettings', 'authConfig');
      firestoreUnsub = onSnapshot(configDocRef, (snap) => {
        if (snap.exists()) {
          callback({
            ...DEFAULT_ADMIN_AUTH_CONFIG,
            ...(snap.data() as Partial<AdminAuthConfig>)
          });
        } else {
          callback(DEFAULT_ADMIN_AUTH_CONFIG);
        }
      }, (err) => {
        if (!isFirebasePermissionError(err)) {
          console.warn('[Firebase] Realtime admin config listener notice:', err.message);
        }
      });
    } catch (err) {
      if (!isFirebasePermissionError(err)) {
        console.warn('[Firebase] Admin config realtime listener skipped:', err);
      }
    }
  });

  return () => {
    isCancelled = true;
    firestoreUnsub();
  };
}

// Re-export Print Settings handlers
export {
  getCachedPrintSettings,
  getPrintSettingsConfig,
  savePrintSettingsConfig,
  resetPrintSettingsConfig,
  subscribeToPrintSettings
} from './printSettings.ts';

// Re-export Subscription Settings handlers
export {
  getCachedSubscriptionSettings,
  getSubscriptionSettingsConfig,
  saveSubscriptionSettingsConfig,
  resetSubscriptionSettingsConfig,
  subscribeToSubscriptionSettings,
  getUpiQrCodeUrl,
  getWhatsAppPaymentLink
} from './subscriptionSettings.ts';
