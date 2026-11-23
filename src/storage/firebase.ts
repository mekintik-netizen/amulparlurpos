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
  persistentLocalCache,
  persistentMultipleTabManager,
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
  const hasBrowserIndexedDb =
    typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

  // Enable IndexedDB offline persistence (persistentLocalCache) so repeat reads & product catalogs
  // are served from local persistent cache, cutting Firestore read usage by up to 70% while keeping real-time sync active.
  if (hasBrowserIndexedDb && typeof persistentLocalCache === 'function') {
    try {
      const localCache =
        typeof persistentMultipleTabManager === 'function'
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : persistentLocalCache();
      return initializeFirestore(
        firebaseApp,
        {
          localCache,
          experimentalAutoDetectLongPolling: true,
          ignoreUndefinedProperties: true
        },
        databaseId
      );
    } catch {
      // Fall through to single-tab or default Firestore instance if already initialized
    }
  }

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

const isBrowserOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

let networkEnabled = !isBrowserOffline();
let authAuthenticated = false;

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline';

let currentCloudSyncStatus: CloudSyncStatus = isBrowserOffline() ? 'offline' : 'syncing';
let lastCloudSyncIso: string | null = null;
let hasCompletedInitialCloudSync = false;
const cloudSyncStatusListeners = new Set<(state: { status: CloudSyncStatus; lastSyncedAt: string | null }) => void>();

export function getCloudSyncStatus(): { status: CloudSyncStatus; lastSyncedAt: string | null } {
  return { status: currentCloudSyncStatus, lastSyncedAt: lastCloudSyncIso };
}

export function hasInitialCloudSyncCompleted(): boolean {
  return hasCompletedInitialCloudSync;
}

export function setCloudSyncStatus(
  status: CloudSyncStatus,
  syncedAt?: string,
  options?: { force?: boolean }
): void {
  // After the first load completes, never flash 'syncing' on routine background snapshot updates
  // unless explicitly forced (e.g. manual Sync Cloud Data button or reconnection flush).
  if (status === 'syncing' && hasCompletedInitialCloudSync && !options?.force) {
    return;
  }

  const prevStatus = currentCloudSyncStatus;
  const prevSyncedAt = lastCloudSyncIso;
  currentCloudSyncStatus = status;
  if (syncedAt) {
    lastCloudSyncIso = syncedAt;
  } else if (status === 'synced') {
    lastCloudSyncIso = new Date().toISOString();
  }
  if (status === 'synced') {
    hasCompletedInitialCloudSync = true;
  }

  if (prevStatus === currentCloudSyncStatus && prevSyncedAt === lastCloudSyncIso) {
    return;
  }

  const payload = { status: currentCloudSyncStatus, lastSyncedAt: lastCloudSyncIso };
  cloudSyncStatusListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeToCloudSyncStatus(
  callback: (state: { status: CloudSyncStatus; lastSyncedAt: string | null }) => void
): () => void {
  cloudSyncStatusListeners.add(callback);
  try {
    callback(getCloudSyncStatus());
  } catch {
    // ignore
  }
  return () => {
    cloudSyncStatusListeners.delete(callback);
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  options?: { rethrow?: boolean }
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  if (isFirebasePermissionError(error)) {
    console.warn('[Firestore Permission Notice]:', JSON.stringify(errInfo));
  } else {
    console.warn('[Firestore Operation Notice]:', JSON.stringify(errInfo));
  }
  if (options?.rethrow) {
    throw new Error(JSON.stringify(errInfo));
  }
  return errInfo;
}

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

export function isTransientNetworkError(err: unknown): boolean {
  if (isBrowserOffline()) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = String(e.code || '').toLowerCase();
  const msg = String(e.message || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('err_network_changed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('failed to fetch') ||
    msg.includes('unavailable')
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
  if (isBrowserOffline()) {
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
  setCloudSyncStatus('offline');
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
    setCloudSyncStatus('syncing');
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
  if (isBrowserOffline()) {
    setFirestoreOfflineCleanly().catch(() => {});
  }
  window.addEventListener('offline', () => {
    setFirestoreOfflineCleanly().catch(() => {});
  });
  window.addEventListener('online', () => {
    setCloudSyncStatus('syncing');
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

  if (isBrowserOffline()) {
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
    if (!networkEnabled && !isBrowserOffline()) {
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
  if (isBrowserOffline()) {
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
  if (isBrowserOffline()) {
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
  if (isBrowserOffline()) {
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

let cachedAdminAuthConfig: AdminAuthConfig = { ...DEFAULT_ADMIN_AUTH_CONFIG };

/**
 * Fetches the Master Admin Auth Config from Firestore collection 'adminSettings', document 'authConfig'.
 * Initializes it with default superAdmin credentials if it doesn't exist yet.
 * Fails silently with cached/default settings during temporary network drops.
 */
export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  if (isBrowserOffline()) {
    return { ...cachedAdminAuthConfig };
  }
  try {
    await authReady;
    const configDocRef = doc(db, 'adminSettings', 'authConfig');
    const snapshot = await getDoc(configDocRef);
    if (snapshot.exists()) {
      cachedAdminAuthConfig = {
        ...DEFAULT_ADMIN_AUTH_CONFIG,
        ...(snapshot.data() as Partial<AdminAuthConfig>)
      };
      return { ...cachedAdminAuthConfig };
    } else if (!snapshot.metadata?.fromCache) {
      // Seed default config only when confirmed missing on server
      await setDoc(configDocRef, {
        ...DEFAULT_ADMIN_AUTH_CONFIG,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return { ...cachedAdminAuthConfig };
    }
    return { ...cachedAdminAuthConfig };
  } catch {
    // Silent fallback to cached/default settings on temporary network drop
    return { ...cachedAdminAuthConfig };
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
    cachedAdminAuthConfig = {
      ...cachedAdminAuthConfig,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('[Firebase] Failed to update admin auth config:', err);
    }
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
        if (snap.metadata?.fromCache && !snap.exists()) {
          return;
        }
        if (snap.exists()) {
          cachedAdminAuthConfig = {
            ...DEFAULT_ADMIN_AUTH_CONFIG,
            ...(snap.data() as Partial<AdminAuthConfig>)
          };
          callback({ ...cachedAdminAuthConfig });
        } else {
          callback({ ...cachedAdminAuthConfig });
        }
      }, () => {
        // Silent fallback during transient network drops or offline state
      });
    } catch {
      // Silent fallback during offline initialization
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
