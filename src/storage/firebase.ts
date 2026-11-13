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
  const databaseId = firebaseConfig.firestoreDatabaseId;
  try {
    // Use HTTP long-polling so proxy, iframe, and restricted HTTP/2 environments do not stall on WebChannel for 10s
    return initializeFirestore(
      firebaseApp,
      {
        experimentalForceLongPolling: true,
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

// Keep Firestore network state aligned with browser connectivity so offline states never log 10s backend timeouts
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  if (!navigator.onLine) {
    disableNetwork(db).catch(() => {});
  }
  window.addEventListener('offline', () => {
    disableNetwork(db).catch(() => {});
  });
  window.addEventListener('online', () => {
    enableNetwork(db).catch(() => {});
  });
}

// Validate server connectivity cleanly in browser runtime when online
export async function validateFirestoreConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await getDocFromServer(doc(db, 'adminSettings', 'authConfig'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Firestore client is currently operating offline.');
    }
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  validateFirestoreConnection().catch(() => {});
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
  const timeoutId = setTimeout(finish, 5000);

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
        } finally {
          clearTimeout(timeoutId);
          finish();
        }
      },
      () => {
        clearTimeout(timeoutId);
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
