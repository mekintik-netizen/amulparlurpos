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
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc,
  serverTimestamp,
  Unsubscribe,
  DocumentData,
  SnapshotOptions
} from 'firebase/firestore';
import { 
  getAuth, 
  Auth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyBZL8JkkYe0He8gpE4PrruHKPAaZw1o9BA",
  authDomain: "amulparlour.firebaseapp.com",
  projectId: "amulparlour",
  storageBucket: "amulparlour.firebasestorage.app",
  messagingSenderId: "377416187206",
  appId: "1:377416187206:web:5b0e68ad46f0a2aaf9b947",
  measurementId: "G-3C2T45FYC6"
};

// Initialize Firebase App singleton safely
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);

export interface AdminAuthConfig {
  superAdminEmail: string;
  superAdminPhone: string;
  paymentQrUrl?: string; // Master Admin's uploaded Payment QR
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
  adminName: "Master Admin",
  adminUsername: "admin"
};

/**
 * Fetches the Master Admin Auth Config from Firestore collection 'adminSettings', document 'authConfig'.
 * Initializes it with default superAdmin credentials if it doesn't exist yet.
 */
export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  try {
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
  const configDocRef = doc(db, 'adminSettings', 'authConfig');
  return onSnapshot(configDocRef, (snap) => {
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
}

// Re-export Print Settings handlers
export {
  getCachedPrintSettings,
  getPrintSettingsConfig,
  savePrintSettingsConfig,
  resetPrintSettingsConfig,
  subscribeToPrintSettings
} from './printSettings.ts';
