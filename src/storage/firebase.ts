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
  getDocFromServer,
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

/**
 * Fast pre-flight reachability probe against Firestore REST endpoint with strict timeout.
 * Prevents Firestore's internal 10-second watch stream timeout when offline or behind blocking proxies.
 */
export async function probeFirestoreReachability(timeoutMs: number = 3500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
    return true;
  }

  const dbName = firebaseConfig.firestoreDatabaseId || '(default)';
  const probeUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(
    dbName
  )}/documents/adminSettings/connectionCheck`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any HTTP response (including 403/404) confirms HTTPS connectivity to Cloud Firestore backend
    await fetch(probeUrl, {
      method: 'GET',
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
          clearTimeout(timeoutId);
          console.log('[Firebase] Secure anonymous session active');
          finish();
          return;
        }
        try {
          await signInAnonymously(auth);
          console.log('[Firebase] Secure anonymous session active');
        } catch (error: any) {
          console.warn('[Firebase] Anonymous auth deferred (offline/local mode):', error?.code || error?.message);
          await setFirestoreOfflineCleanly();
        } finally {
          clearTimeout(timeoutId);
          finish();
        }
      },
      () => {
        clearTimeout(timeoutId);
        setFirestoreOfflineCleanly().catch(() => {});
        finish();
      }
    );
  } catch {
    clearTimeout(timeoutId);
    finish();
  }
});

export function ensureAnonymousAuth(): Promise<void> {
  return authReady;
}

/**
 * Validates Cloud Firestore connectivity after authentication without stalling for 10s.
 * If the backend is unreachable or does not respond within 5s, cleanly switches Firestore
 * into offline mode so IndexedDB operates uninterrupted.
 */
export async function validateFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await setFirestoreOfflineCleanly();
    return false;
  }
  await authReady;
  const reachable = await syncNetworkStateWithConnectivity();
  if (!reachable) return false;

  try {
    const serverCheck = getDocFromServer(doc(db, 'adminSettings', 'connectionCheck'));
    const timedOut = await Promise.race([
      serverCheck.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 5000))
    ]);
    if (timedOut) {
      await setFirestoreOfflineCleanly();
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      await setFirestoreOfflineCleanly();
    }
    return false;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  validateFirestoreConnection().catch(() => {});
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
        console.warn('[Firebase] Realtime admin config listener notice:', err.message);
      });
    } catch (err) {
      console.warn('[Firebase] Admin config realtime listener skipped:', err);
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
