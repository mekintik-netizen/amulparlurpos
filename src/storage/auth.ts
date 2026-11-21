/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Local-First Cryptographic Authentication Engine for Amul Parlour POS
 * Strict Security Principles:
 * - Passwords are NEVER stored in plaintext (no localStorage, no plaintext in DB).
 * - Per-user cryptographically random 16-byte salt via crypto.getRandomValues().
 * - Key derivation / hashing via Web Crypto API SHA-256 (crypto.subtle.digest).
 * - Safe fallback for restricted or legacy browser environments.
 * - Multi-tenant shop-level authorization for SHOP_USER and system-level for ADMIN.
 */

import { openAppDatabase, getAllShops, getShopById, saveShop, prefillMasterAmulCatalogWithZeroStock } from './db.ts';
import { db, getAdminAuthConfig, updateAdminAuthConfig, DEFAULT_ADMIN_AUTH_CONFIG, AdminAuthConfig, ensureAnonymousAuth } from './firebase.ts';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { syncShopToCloud, normalizeRemoteShop } from './firestoreSync.ts';
import { Shop } from '../types/index.ts';
import { isShopSubscriptionActive } from './subscription.ts';
import { constantTimeEqual, generateSalt, hashPasswordWithSalt } from '../utils/cryptoHash.ts';
import {
  consumeAdminVerificationToken,
  getAdminSecurityConfig,
  getCurrentYearMonth,
  matchesStoredAdminSecurityPin,
  saveAdminCredentialsToSecurity
} from './adminEmailOtp.ts';

export { generateSalt, hashPasswordWithSalt };
export const SHOP_PASSWORD_ROTATION_DAYS = 90;

export type UserRole = 'ADMIN' | 'SHOP_USER';

export interface LocalUser {
  id: string; // UUID
  username: string; // Unique lowercase login handle
  fullName: string;
  role: UserRole;
  isMasterAdmin?: boolean; // Initialized Master Administrator
  designation?: string;
  shopId?: string; // Bound shop ID for SHOP_USER
  shopCode?: string; // e.g. "AP-2026-1001"
  salt: string; // Hex string (never the password)
  passwordHash: string; // SHA-256 hash (never the password)
  securityQuestion?: string; // Secret security question for admin recovery
  securityAnswerSalt?: string; // Salt for security answer
  securityAnswerHash?: string; // SHA-256 hash of normalized security answer
  createdAt: string; // ISO string
  lastLoginAt?: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  shopId?: string;
  shopCode?: string;
  shopName?: string;
  tokenExpiresAt: number; // Unix timestamp
  loggedInAt: string;
}

const SESSION_KEY = 'amul_pos_active_session';

const LEGACY_KEY_PAIRS: ReadonlyArray<[string, string]> = [
  ['parlourpro_pos_active_session', 'amul_pos_active_session'],
  ['parlourpro_active_session', 'amul_pos_active_session'],
  ['amul_parlour_active_session', 'amul_pos_active_session'],
  ['parlourpro_pos_theme', 'amul_pos_theme'],
  ['parlourpro_theme', 'amul_pos_theme'],
  ['parlourpro_pos_print_settings', 'amul_pos_print_settings'],
  ['parlourpro_pos_subscription_settings', 'amul_pos_subscription_settings'],
  ['parlourpro_pos_deleted_products', 'amul_pos_deleted_products'],
  ['parlourpro_pos_deleted_suppliers', 'amul_pos_deleted_suppliers'],
  ['parlourpro_pos_deleted_purchases', 'amul_pos_deleted_purchases'],
  ['parlourpro_admin_otp_last_sent_ms', 'amul_admin_otp_last_sent_ms'],
  ['parlourpro_admin_otp_lockout', 'amul_admin_otp_lockout']
];

const LEGACY_PREFIX_MAP: ReadonlyArray<[string, string]> = [
  ['parlourpro_last_cloud_sync_', 'amul_last_cloud_sync_'],
  ['parlourpro_pos_sup_seeded_', 'amul_pos_sup_seeded_'],
  ['parlourpro_pos_prod_seeded_', 'amul_pos_prod_seeded_'],
  ['parlourpro_pos_morning_greeting_', 'amul_pos_morning_greeting_'],
  ['amul_parlour_last_cloud_sync_', 'amul_last_cloud_sync_'],
  ['amul_parlour_pos_', 'amul_pos_']
];

/**
 * Safely scans browser storage for legacy (`amul*`, `amul_parlour*`) or rebranded (`parlourpro*`)
 * keys and ensures all canonical original storage keys are preserved without deleting or overwriting
 * any existing values.
 */
export function migrateLegacyLocalStorageKeys(): { migratedKeys: string[]; scannedKeys: number } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { migratedKeys: [], scannedKeys: 0 };
  }

  const migratedKeys: string[] = [];
  let scannedKeys = 0;

  try {
    const storages: Storage[] = [window.localStorage];
    if (window.sessionStorage) {
      storages.push(window.sessionStorage);
    }

    for (const storage of storages) {
      // 1. Exact pair restoration (never overwrites an existing canonical key, never deletes source)
      for (const [altKey, canonicalKey] of LEGACY_KEY_PAIRS) {
        const canonicalVal = storage.getItem(canonicalKey);
        const altVal = storage.getItem(altKey);
        if ((canonicalVal === null || canonicalVal === '') && altVal !== null && altVal !== '') {
          storage.setItem(canonicalKey, altVal);
          migratedKeys.push(`${altKey}->${canonicalKey}`);
        }
      }

      // 2. Dynamic prefix scan (e.g., per-shop sync timestamps, seed flags, greeting flags)
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) keys.push(k);
      }
      scannedKeys += keys.length;

      for (const key of keys) {
        for (const [altPrefix, canonicalPrefix] of LEGACY_PREFIX_MAP) {
          if (key.startsWith(altPrefix)) {
            const targetKey = canonicalPrefix + key.slice(altPrefix.length);
            const existingTarget = storage.getItem(targetKey);
            const sourceVal = storage.getItem(key);
            if ((existingTarget === null || existingTarget === '') && sourceVal !== null && sourceVal !== '') {
              storage.setItem(targetKey, sourceVal);
              migratedKeys.push(`${key}->${targetKey}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Legacy localStorage migration check notice:', err);
  }

  return { migratedKeys, scannedKeys };
}

// Salted SHA-256 helpers are shared from ../utils/cryptoHash.ts and re-exported above.

/**
 * Access the localUsers store in IndexedDB (using appSettings key-value store to maintain backward compatibility)
 */
const USERS_STORAGE_KEY = 'registered_local_users';

export async function getAllLocalUsers(): Promise<LocalUser[]> {
  const db = await openAppDatabase();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('appSettings', 'readonly');
      const store = tx.objectStore('appSettings');
      const req = store.get(USERS_STORAGE_KEY);
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.value)) {
          resolve(req.result.value);
        } else {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function saveAllLocalUsers(users: LocalUser[]): Promise<void> {
  try {
    const db = await openAppDatabase();
    if (!db || typeof db.transaction !== 'function') return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('appSettings', 'readwrite');
        const store = tx.objectStore('appSettings');
        store.put({ key: USERS_STORAGE_KEY, value: users });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    // Graceful fallback for non-browser or test runner environments
  }
}

/**
 * Seed initial default accounts if none exist, so the user can immediately test or create fresh ones
 */
export async function ensureDefaultAccountsSeeded(): Promise<void> {
  const existing = await getAllLocalUsers();
  if (existing.length > 0) return;

  // Initial Shop Cashier for AP-2026-1001 ('cashier' / 'amul123')
  const cashierSalt = generateSalt();
  const cashierHash = await hashPasswordWithSalt('amul123', cashierSalt);

  const initialUsers: LocalUser[] = [
    {
      id: 'usr-cashier-1001',
      username: 'cashier',
      fullName: 'Anand Main Kiosk Operator',
      role: 'SHOP_USER',
      shopId: 'shop-amul-001',
      shopCode: 'AP-2026-1001',
      salt: cashierSalt,
      passwordHash: cashierHash,
      createdAt: new Date().toISOString()
    }
  ];

  await saveAllLocalUsers(initialUsers);
}

/**
 * Register a new User ID (Shop User or Admin)
 * Validates uniqueness, salts & hashes password, saves zero plaintext.
 */
export async function registerLocalUser(params: {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
  shopId?: string;
  shopCode?: string;
}): Promise<LocalUser> {
  const cleanUsername = params.username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain letters, numbers, hyphens, dots, and underscores.');
  }
  if (!params.password || params.password.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }
  if (params.role === 'SHOP_USER' && (!params.shopId || !params.shopCode)) {
    throw new Error('Shop User must be assigned to an active Shop Code.');
  }

  const users = await getAllLocalUsers();
  if (users.some(u => u.username === cleanUsername)) {
    throw new Error(`Username "${cleanUsername}" is already registered. Please choose another.`);
  }

  const salt = generateSalt();
  const passwordHash = await hashPasswordWithSalt(params.password, salt);

  const newUser: LocalUser = {
    id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    fullName: params.fullName.trim() || cleanUsername,
    role: params.role,
    shopId: params.role === 'SHOP_USER' ? params.shopId : undefined,
    shopCode: params.role === 'SHOP_USER' ? params.shopCode : undefined,
    salt,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await saveAllLocalUsers(users);

  // Return user without any sensitive fields
  return newUser;
}

/**
 * Convenience helper to create a shop cashier account bound to a specific shop
 */
export async function registerShopCashierAccount(params: {
  username: string;
  fullName?: string;
  password: string;
  shopId: string;
  shopCode: string;
}): Promise<LocalUser> {
  return registerLocalUser({
    username: params.username,
    fullName: params.fullName || `Cashier (${params.shopCode})`,
    password: params.password,
    role: 'SHOP_USER',
    shopId: params.shopId,
    shopCode: params.shopCode
  });
}

/**
 * Global Firestore Authentication for Shop Counter (Mobile Number & Cross-Device Access)
 * Validates entered Shop Mobile Number, Shop ID, or Cashier Username and Password
 * directly against the live Cloud Firestore 'shops' collection.
 */
export async function authenticateShopCounterFromFirestore(params: {
  usernameOrShopId?: string;
  mobileNumberOrShopId?: string;
  password: string;
}): Promise<AuthSession> {
  const rawInput = (params.mobileNumberOrShopId || params.usernameOrShopId || '').trim();
  if (!rawInput) {
    throw new Error('Please enter your Shop Mobile Number.');
  }
  if (!params.password) {
    throw new Error('Please enter your password.');
  }

  const cleanLower = rawInput.toLowerCase();
  const cleanNoHyphen = cleanLower.replace(/[^a-z0-9]/g, '');
  const digitsOnly = rawInput.replace(/\D/g, '');
  const last10Digits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
  const isLikelyPhone = digitsOnly.length >= 7;

  let matchedShop: Shop | null = null;

  // 1. Attempt lookup against live Cloud Firestore
  try {
    await ensureAnonymousAuth();
    // A. Query directly by registered phone number if input is phone-like
    if (isLikelyPhone) {
      const qPhoneExact = query(collection(db, 'shops'), where('phone', '==', rawInput));
      const snapPhoneExact = await getDocs(qPhoneExact);
      if (!snapPhoneExact.empty) {
        const docSnap = snapPhoneExact.docs[0];
        matchedShop = normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id);
      }

      if (!matchedShop && last10Digits.length === 10) {
        const qPhoneWithPrefix = query(collection(db, 'shops'), where('phone', '==', `+91 ${last10Digits}`));
        const snapPhoneWithPrefix = await getDocs(qPhoneWithPrefix);
        if (!snapPhoneWithPrefix.empty) {
          const docSnap = snapPhoneWithPrefix.docs[0];
          matchedShop = normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id);
        }
      }
    }

    // B. Check by document ID directly
    if (!matchedShop) {
      const shopDocRef = doc(db, 'shops', rawInput);
      const shopDocSnap = await getDoc(shopDocRef);
      if (shopDocSnap.exists()) {
        matchedShop = normalizeRemoteShop(shopDocSnap.data() as Record<string, any>, shopDocSnap.id);
      }
    }

    // C. Query by shopCode
    if (!matchedShop) {
      const qCodeUpper = query(collection(db, 'shops'), where('shopCode', '==', rawInput.toUpperCase()));
      const snapCodeUpper = await getDocs(qCodeUpper);
      if (!snapCodeUpper.empty) {
        const docSnap = snapCodeUpper.docs[0];
        matchedShop = normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id);
      }
    }

    // D. Query by cashierUsername
    if (!matchedShop) {
      const qCashier = query(collection(db, 'shops'), where('cashierUsername', '==', cleanLower));
      const snapCashier = await getDocs(qCashier);
      if (!snapCashier.empty) {
        const docSnap = snapCashier.docs[0];
        matchedShop = normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id);
      }
    }

    // E. Scan collection in Firestore if formatting differs (e.g. spaces/hyphens in phone number or shopCode)
    if (!matchedShop) {
      const allShopsSnap = await getDocs(collection(db, 'shops'));
      for (const d of allShopsSnap.docs) {
        const rawData = d.data() as Record<string, any>;
        const s = normalizeRemoteShop(rawData, d.id);
        const sId = (s.id || d.id || '').toLowerCase();
        const sCode = (s.shopCode || '').toLowerCase();
        const sCodeClean = sCode.replace(/[^a-z0-9]/g, '');
        const sCashier = (s.cashierUsername || '').toLowerCase();
        const sPhone = String(s.phone || rawData.shopMobile || rawData.mobile || '').trim();
        const sPhoneDigits = sPhone.replace(/\D/g, '');
        const sPhoneLast10 = sPhoneDigits.length >= 10 ? sPhoneDigits.slice(-10) : sPhoneDigits;
        const sName = (s.name || '').toLowerCase();

        const phoneMatches = isLikelyPhone && (
          sPhone === rawInput ||
          sPhoneDigits === digitsOnly ||
          (last10Digits.length >= 10 && sPhoneLast10 === last10Digits)
        );

        if (
          phoneMatches ||
          sId === cleanLower ||
          sCode === cleanLower ||
          sCodeClean === cleanNoHyphen ||
          sCashier === cleanLower ||
          sName === cleanLower
        ) {
          matchedShop = s;
          break;
        }
      }
    }
  } catch (firestoreErr) {
    console.warn('[Auth] Firestore query error, falling back to local database:', firestoreErr);
  }

  // 2. Fallback to local IndexedDB if Firestore was unavailable or returned no match
  if (!matchedShop) {
    try {
      const localShops = await getAllShops();
      matchedShop = localShops.find(s => {
        const sId = (s.id || '').toLowerCase();
        const sCode = (s.shopCode || '').toLowerCase();
        const sCodeClean = sCode.replace(/[^a-z0-9]/g, '');
        const sCashier = (s.cashierUsername || '').toLowerCase();
        const sPhone = (s.phone || '').trim();
        const sPhoneDigits = sPhone.replace(/\D/g, '');
        const sPhoneLast10 = sPhoneDigits.length >= 10 ? sPhoneDigits.slice(-10) : sPhoneDigits;
        const sName = (s.name || '').toLowerCase();

        const phoneMatches = isLikelyPhone && (
          sPhone === rawInput ||
          sPhoneDigits === digitsOnly ||
          (last10Digits.length >= 10 && sPhoneLast10 === last10Digits)
        );

        return (
          phoneMatches ||
          sId === cleanLower ||
          sCode === cleanLower ||
          sCodeClean === cleanNoHyphen ||
          sCashier === cleanLower ||
          sName === cleanLower
        );
      }) || null;
    } catch (localErr) {
      console.warn('[Auth] Local shops lookup error:', localErr);
    }
  }

  if (!matchedShop) {
    if (isLikelyPhone) {
      throw new Error(`Shop with mobile number "${rawInput}" was not found. Please verify your registered mobile number or contact Amul Admin.`);
    } else {
      throw new Error(`Shop "${rawInput}" was not found. Please verify your Shop Mobile Number or Shop ID.`);
    }
  }

  // 3. Password Verification
  let passwordMatches = false;

  // A. Salted SHA-256 Hash check
  if (matchedShop.passwordHash && matchedShop.salt) {
    const computedHash = await hashPasswordWithSalt(params.password, matchedShop.salt);
    if (computedHash === matchedShop.passwordHash) {
      passwordMatches = true;
    }
  }

  // B. Plaintext cashierPassword check (if created before hashing)
  if (!passwordMatches && matchedShop.cashierPassword) {
    if (params.password === matchedShop.cashierPassword) {
      passwordMatches = true;
    }
  }

  // C. Default initial password fallback for newly provisioned shops
  if (!passwordMatches && !matchedShop.passwordHash && !matchedShop.cashierPassword) {
    if (params.password === 'amul123' || params.password === 'admin123') {
      passwordMatches = true;
    }
  }

  // D. Local User record check
  if (!passwordMatches) {
    try {
      const users = await getAllLocalUsers();
      const userMatch = users.find(u => 
        (u.shopId === matchedShop!.id || u.shopCode === matchedShop!.shopCode || u.username === cleanLower) &&
        u.role === 'SHOP_USER'
      );
      if (userMatch) {
        const computedLocalHash = await hashPasswordWithSalt(params.password, userMatch.salt);
        if (computedLocalHash === userMatch.passwordHash) {
          passwordMatches = true;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!passwordMatches) {
    throw new Error('Invalid password. Please check your credentials or contact Amul Administrator.');
  }

  // Auto-upgrade security hash and initialize passwordUpdatedAt timestamp on shop document if missing
  let shopNeedsCloudSync = false;
  if (!matchedShop.passwordHash || !matchedShop.salt) {
    const newSalt = generateSalt();
    const newHash = await hashPasswordWithSalt(params.password, newSalt);
    matchedShop.salt = newSalt;
    matchedShop.passwordHash = newHash;
    shopNeedsCloudSync = true;
  }
  if (!matchedShop.passwordUpdatedAt) {
    matchedShop.passwordUpdatedAt = Date.now();
    matchedShop.updatedAt = new Date().toISOString();
    shopNeedsCloudSync = true;
  }
  if (shopNeedsCloudSync) {
    try {
      await syncShopToCloud(matchedShop);
    } catch (upgradeErr) {
      console.warn('[Auth] Failed to auto-upgrade shop password metadata:', upgradeErr);
    }
  }

  // 4. Check Subscription & Account Status
  const subCheck = isShopSubscriptionActive(matchedShop);
  if (subCheck.isPendingApproval) {
    throw new Error('Shop account approval is pending from Amul Headquarters Admin.');
  }
  if (matchedShop.approvalStatus === 'SUSPENDED' || matchedShop.status === 'suspended') {
    throw new Error('Shop account has been suspended by Amul Headquarters Admin.');
  }

  // 5. Cache shop document and catalog into local IndexedDB for immediate offline/online performance
  try {
    await saveShop(matchedShop);
    await prefillMasterAmulCatalogWithZeroStock(matchedShop.id);
  } catch (dbErr) {
    console.warn('[Auth] Failed to cache shop to local IndexedDB:', dbErr);
  }

  // 6. Ensure cashier local user record exists in IndexedDB
  try {
    const users = await getAllLocalUsers();
    const cashierUsername = matchedShop.cashierUsername || cleanLower;
    let existingUser = users.find(u => u.shopId === matchedShop!.id || u.username === cashierUsername);

    const cashierSalt = matchedShop.salt || generateSalt();
    const cashierHash = matchedShop.passwordHash || (await hashPasswordWithSalt(params.password, cashierSalt));

    if (!existingUser) {
      existingUser = {
        id: `usr-cashier-${matchedShop.id}`,
        username: cashierUsername,
        fullName: matchedShop.ownerName || `Cashier (${matchedShop.shopCode})`,
        role: 'SHOP_USER',
        shopId: matchedShop.id,
        shopCode: matchedShop.shopCode,
        salt: cashierSalt,
        passwordHash: cashierHash,
        createdAt: matchedShop.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      users.push(existingUser);
    } else {
      existingUser.salt = cashierSalt;
      existingUser.passwordHash = cashierHash;
      existingUser.lastLoginAt = new Date().toISOString();
      existingUser.shopId = matchedShop.id;
      existingUser.shopCode = matchedShop.shopCode;
    }
    await saveAllLocalUsers(users);
  } catch (userErr) {
    console.warn('[Auth] Failed to sync local cashier user:', userErr);
  }

  // 7. Construct and return AuthSession
  const session: AuthSession = {
    userId: `usr-cashier-${matchedShop.id}`,
    username: matchedShop.cashierUsername || cleanLower,
    fullName: matchedShop.name || matchedShop.ownerName,
    role: 'SHOP_USER',
    shopId: matchedShop.id,
    shopCode: matchedShop.shopCode,
    shopName: matchedShop.name,
    tokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    loggedInAt: new Date().toISOString()
  };

  saveSession(session, false);
  return session;
}

/**
 * Verifies an entered password against the current shop's stored login credentials
 * (salted SHA-256 hash, legacy cashierPassword, local SHOP_USER record, or default initial password).
 * Used for sensitive actions such as permanently deleting cancelled purchase bills.
 */
export async function verifyShopPassword(shop: Shop, password: string): Promise<boolean> {
  if (!password) return false;

  // Prefer the latest local shop record in case credentials were updated after login
  let targetShop: Shop = shop;
  try {
    const latestLocal = await getShopById(shop.id);
    if (latestLocal) {
      targetShop = latestLocal;
    }
  } catch {
    // Use passed shop object
  }

  // 1. Salted SHA-256 hash check
  if (targetShop.passwordHash && targetShop.salt) {
    const computedHash = await hashPasswordWithSalt(password, targetShop.salt);
    if (computedHash === targetShop.passwordHash) {
      return true;
    }
  }

  // 2. Plaintext cashierPassword check (legacy pre-hash provisioning)
  if (targetShop.cashierPassword && password === targetShop.cashierPassword) {
    return true;
  }

  // 3. Default initial password fallback for newly provisioned shops without a set hash
  if (!targetShop.passwordHash && !targetShop.cashierPassword) {
    if (password === 'amul123' || password === 'admin123') {
      return true;
    }
  }

  // 4. Local SHOP_USER record fallback check
  try {
    const users = await getAllLocalUsers();
    const matchingUsers = users.filter(
      u =>
        u.role === 'SHOP_USER' &&
        (u.shopId === targetShop.id ||
          (targetShop.shopCode && u.shopCode === targetShop.shopCode) ||
          (targetShop.cashierUsername && u.username === targetShop.cashierUsername.toLowerCase()))
    );
    for (const userMatch of matchingUsers) {
      const computedLocalHash = await hashPasswordWithSalt(password, userMatch.salt);
      if (computedLocalHash === userMatch.passwordHash) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Authenticate user credentials
 * Compares computed salted hash with stored hash. Zero plaintext saved.
 */
export async function authenticateLocalUser(params: {
  username: string;
  password: string;
  role: UserRole;
  shopCode?: string;
}): Promise<AuthSession> {
  await ensureDefaultAccountsSeeded();

  // If authenticating as Shop User, validate via global Firestore authentication
  if (params.role === 'SHOP_USER') {
    try {
      return await authenticateShopCounterFromFirestore({
        usernameOrShopId: params.username,
        password: params.password
      });
    } catch (shopAuthErr: any) {
      // If error is about password or subscription, throw directly
      if (shopAuthErr.message && !shopAuthErr.message.includes('was not found')) {
        throw shopAuthErr;
      }
      // Otherwise allow falling through to local user lookup below
    }
  }

  const cleanUsername = params.username.trim().toLowerCase();
  const users = await getAllLocalUsers();

  const user = users.find(u => u.username === cleanUsername);

  // If Admin user check runs against Cloud Firestore adminSettings (authConfig or security)
  if (params.role === 'ADMIN') {
    try {
      const [cloudConfig, secConfig] = await Promise.all([
        getAdminAuthConfig(),
        getAdminSecurityConfig().catch(() => null)
      ]);
      const cloudUsername = (cloudConfig.adminUsername || 'admin').trim().toLowerCase();
      const candidateHashes: Array<{ hash: string; salt: string }> = [];
      if (secConfig?.adminPasswordHash && secConfig?.adminPasswordSalt) {
        candidateHashes.push({ hash: secConfig.adminPasswordHash, salt: secConfig.adminPasswordSalt });
      }
      if (cloudConfig.adminPasswordHash && cloudConfig.adminSalt) {
        candidateHashes.push({ hash: cloudConfig.adminPasswordHash, salt: cloudConfig.adminSalt });
      }

      if (candidateHashes.length > 0 && (cleanUsername === cloudUsername || !user)) {
        for (const cred of candidateHashes) {
          const cloudComputedHash = await hashPasswordWithSalt(params.password, cred.salt);
          if (constantTimeEqual(cloudComputedHash, cred.hash)) {
            let adminUser = user;
            if (!adminUser) {
              adminUser = {
                id: `usr-admin-${Date.now()}`,
                username: cloudUsername,
                fullName: cloudConfig.adminName || 'Master Administrator',
                role: 'ADMIN',
                isMasterAdmin: true,
                salt: cred.salt,
                passwordHash: cred.hash,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
              };
              users.push(adminUser);
            } else {
              adminUser.salt = cred.salt;
              adminUser.passwordHash = cred.hash;
              adminUser.lastLoginAt = new Date().toISOString();
            }
            await saveAllLocalUsers(users);

            const session: AuthSession = {
              userId: adminUser.id,
              username: adminUser.username,
              fullName: adminUser.fullName,
              role: adminUser.role,
              tokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
              loggedInAt: new Date().toISOString()
            };

            saveSession(session);
            return session;
          }
        }
      }
    } catch (cloudErr) {
      console.warn('[Auth] Remote admin check skipped:', cloudErr);
    }
  }

  if (!user) {
    throw new Error('Invalid username or password.');
  }

  if (user.role !== params.role) {
    if (params.role === 'ADMIN') {
      throw new Error(`This user "${cleanUsername}" is registered as a Shop Cashier, not an Admin.`);
    } else {
      throw new Error(`This user "${cleanUsername}" is registered as an Admin. Please use the Admin Login tab.`);
    }
  }

  if (params.role === 'SHOP_USER' && params.shopCode && user.shopCode !== params.shopCode) {
    throw new Error(`User is registered under shop ${user.shopCode}, not ${params.shopCode}.`);
  }

  // Compute hash of entered password using the user's stored salt
  const computedHash = await hashPasswordWithSalt(params.password, user.salt);
  if (computedHash !== user.passwordHash) {
    throw new Error('Invalid username or password.');
  }

  // Update last login
  user.lastLoginAt = new Date().toISOString();
  await saveAllLocalUsers(users);

  // Create session (24h validity, zero passwords stored)
  const session: AuthSession = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    shopId: user.shopId,
    shopCode: user.shopCode,
    tokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    loggedInAt: new Date().toISOString()
  };

  saveSession(session);
  return session;
}

/**
 * Session storage helpers (Stores only public identity tokens, never passwords or hashes)
 */
export function getActiveSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    migrateLegacyLocalStorageKeys();
    let raw = sessionStorage.getItem(SESSION_KEY);
    // Check localStorage only if trusted device persisted session exists
    if (!raw) {
      raw = localStorage.getItem(SESSION_KEY);
    }
    if (!raw) return null;

    const session = JSON.parse(raw) as AuthSession;
    if (session.tokenExpiresAt && session.tokenExpiresAt < Date.now()) {
      clearActiveSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession, isTrustedDevice = false): void {
  if (typeof window === 'undefined') return;
  try {
    const sessionWithExpiry: AuthSession = {
      ...session,
      tokenExpiresAt: Date.now() + 60 * 60 * 1000 // 60 minutes
    };
    const serialized = JSON.stringify(sessionWithExpiry);

    if (isTrustedDevice) {
      localStorage.setItem(SESSION_KEY, serialized);
      sessionStorage.setItem(SESSION_KEY, serialized);
    } else {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem(SESSION_KEY, serialized);
    }
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('Failed to clear session:', err);
  }
}

/**
 * =========================================================
 * ONE-TIME MASTER ADMIN INITIALIZATION & SHOP CREATION GUARD
 * =========================================================
 */

const MASTER_ADMIN_SETTING_KEY = 'master_admin_initialized';

/**
 * Check if the one-time Master Admin has already been initialized in IndexedDB
 */
/**
 * Check if the one-time Master Admin has already been initialized in IndexedDB
 */
export async function isMasterAdminInitialized(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return false;
  }
  try {
    const db = await openAppDatabase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('appSettings', 'readonly');
        const store = tx.objectStore('appSettings');
        const req = store.get(MASTER_ADMIN_SETTING_KEY);
        req.onsuccess = async () => {
          if (req.result?.value === true) {
            resolve(true);
          } else {
            // Check if any explicitly initialized master admin exists
            const users = await getAllLocalUsers();
            const hasMaster = users.some(u => u.role === 'ADMIN' && u.isMasterAdmin === true);
            resolve(hasMaster);
          }
        };
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Execute one-time Master Admin initialization setup in IndexedDB
 * Includes secret Security Question and Answer for password recovery.
 * Salted SHA-256 hash stored, zero plaintext, permanent one-time lock.
 */
export async function performOneTimeAdminSetup(params: {
  username: string;
  fullName: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
  designation?: string;
  department?: string;
}): Promise<AuthSession> {
  const isAlreadyInit = await isMasterAdminInitialized();
  if (isAlreadyInit) {
    throw new Error('Master administrator has already been initialized on this device. Only existing authorized administrators may sign in.');
  }

  const cleanUsername = params.username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error('Admin username must be at least 3 characters long.');
  }
  if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
    throw new Error('Admin username can only contain letters, numbers, hyphens, dots, and underscores.');
  }
  if (!params.password || params.password.length < 6) {
    throw new Error('Master Admin password must be at least 6 characters for local security.');
  }
  if (!params.securityQuestion || params.securityQuestion.trim().length < 5) {
    throw new Error('Please enter or select a valid security question.');
  }
  if (!params.securityAnswer || params.securityAnswer.trim().length < 2) {
    throw new Error('Please provide a secret answer for password recovery.');
  }

  const users = await getAllLocalUsers();
  const existingIdx = users.findIndex(u => u.username === cleanUsername);

  const salt = generateSalt();
  const passwordHash = await hashPasswordWithSalt(params.password, salt);

  const answerSalt = generateSalt();
  const cleanAnswer = params.securityAnswer.trim().toLowerCase();
  const answerHash = await hashPasswordWithSalt(cleanAnswer, answerSalt);

  const masterAdmin: LocalUser = {
    id: `usr-admin-master-${Date.now()}`,
    username: cleanUsername,
    fullName: params.fullName.trim() || `${cleanUsername} (Master Admin)`,
    role: 'ADMIN',
    isMasterAdmin: true,
    designation: params.designation?.trim() || 'Chief Franchise Administrator',
    salt,
    passwordHash,
    securityQuestion: params.securityQuestion.trim(),
    securityAnswerSalt: answerSalt,
    securityAnswerHash: answerHash,
    createdAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    users[existingIdx] = masterAdmin;
  } else {
    users.unshift(masterAdmin);
  }

  await saveAllLocalUsers(users);

  // Set master_admin_initialized flag in appSettings
  const db = await openAppDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction('appSettings', 'readwrite');
      const store = tx.objectStore('appSettings');
      store.put({
        key: MASTER_ADMIN_SETTING_KEY,
        value: true,
        initializedAt: new Date().toISOString(),
        initializedBy: cleanUsername,
        designation: masterAdmin.designation
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });

  const session: AuthSession = {
    userId: masterAdmin.id,
    username: masterAdmin.username,
    fullName: masterAdmin.fullName,
    role: masterAdmin.role,
    tokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    loggedInAt: new Date().toISOString()
  };

  saveSession(session);
  return session;
}

/**
 * Fetch the security question for an admin account to initiate password recovery
 */
export async function getAdminSecurityQuestion(username: string): Promise<{ success: boolean; question?: string; message?: string }> {
  const clean = username.trim().toLowerCase();
  const users = await getAllLocalUsers();
  const admin = users.find(u => u.username === clean && u.role === 'ADMIN');
  if (!admin) {
    return { success: false, message: `Admin account "${clean}" was not found.` };
  }
  if (!admin.securityQuestion) {
    return { success: false, message: 'No security recovery question is configured for this admin.' };
  }
  return { success: true, question: admin.securityQuestion };
}

/**
 * Reset admin password by verifying BOTH the secret security answer AND a valid Gmail OTP verification token.
 */
export async function resetAdminPasswordWithSecurityAnswer(params: {
  username: string;
  securityAnswer: string;
  newPassword: string;
  verificationToken: string;
}): Promise<{ success: boolean; message: string }> {
  const clean = params.username.trim().toLowerCase();
  const users = await getAllLocalUsers();
  const admin = users.find(u => u.username === clean && u.role === 'ADMIN');
  if (!admin) {
    throw new Error(`Admin account "${clean}" was not found.`);
  }
  if (!admin.securityAnswerHash || !admin.securityAnswerSalt) {
    throw new Error('No security recovery question was configured for this admin account.');
  }

  const cleanEnteredAnswer = params.securityAnswer.trim().toLowerCase();
  const computedHash = await hashPasswordWithSalt(cleanEnteredAnswer, admin.securityAnswerSalt);
  if (computedHash !== admin.securityAnswerHash) {
    throw new Error('Security answer does not match the answer registered during setup. Please try again.');
  }

  if (!params.newPassword || params.newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  // Strictly enforce valid single-use Gmail OTP verification before updating password
  await consumeAdminVerificationToken(params.verificationToken, 'ADMIN_PASSWORD_RESET');

  const newSalt = generateSalt();
  const newHash = await hashPasswordWithSalt(params.newPassword, newSalt);
  admin.salt = newSalt;
  admin.passwordHash = newHash;

  await saveAllLocalUsers(users);
  try {
    await updateAdminAuthConfig({
      adminUsername: clean,
      adminPasswordHash: newHash,
      adminSalt: newSalt,
      updatedAt: new Date().toISOString()
    });
  } catch {
    // non-fatal if offline
  }
  return { success: true, message: 'Admin password updated successfully! Please sign in with your new password.' };
}

/**
 * Reset shop owner / cashier password by Admin from Admin Portal
 */
export async function adminResetShopPassword(params: {
  adminSession: AuthSession | null;
  shopCode: string;
  newPassword: string;
}): Promise<{ success: boolean; username: string }> {
  if (!params.adminSession || params.adminSession.role !== 'ADMIN') {
    throw new Error('Unauthorized. Only administrators can reset shop passwords.');
  }
  if (!params.newPassword || params.newPassword.length < 4) {
    throw new Error('Shop password must be at least 4 characters long.');
  }

  const users = await getAllLocalUsers();
  const shopUser = users.find(u => u.shopCode === params.shopCode && u.role === 'SHOP_USER');

  const newSalt = generateSalt();
  const newHash = await hashPasswordWithSalt(params.newPassword, newSalt);

  let username = params.shopCode.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (shopUser) {
    shopUser.salt = newSalt;
    shopUser.passwordHash = newHash;
    username = shopUser.username;
    await saveAllLocalUsers(users);
  }

  // Update shop document in local IndexedDB and Cloud Firestore so cross-device logins use new password
  const nowTs = Date.now();
  const nowIso = new Date(nowTs).toISOString();
  try {
    const shops = await getAllShops();
    const shop = shops.find(s => s.shopCode === params.shopCode);
    if (shop) {
      shop.salt = newSalt;
      shop.passwordHash = newHash;
      delete shop.cashierPassword;
      shop.passwordUpdatedAt = nowTs;
      shop.updatedAt = nowIso;
      await saveShop(shop);
      await syncShopToCloud(shop);
    } else {
      const q = query(collection(db, 'shops'), where('shopCode', '==', params.shopCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const s = normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id);
        s.salt = newSalt;
        s.passwordHash = newHash;
        delete s.cashierPassword;
        s.passwordUpdatedAt = nowTs;
        s.updatedAt = nowIso;
        await saveShop(s);
        await syncShopToCloud(s);
      }
    }
  } catch (syncErr) {
    console.warn('[Auth] Could not update remote shop credentials:', syncErr);
  }

  return { success: true, username: shopUser ? shopUser.username : username };
}

/**
 * Evaluates whether a Shop Owner's password has reached the 90-day (3-month) rotation mark.
 */
export function getShopPasswordAgeDays(
  shop: Shop | null | undefined,
  nowMs: number = Date.now()
): { hasTimestamp: boolean; daysSinceUpdate: number; isRotationDue: boolean } {
  if (!shop || shop.passwordUpdatedAt === undefined || shop.passwordUpdatedAt === null || shop.passwordUpdatedAt === '') {
    return { hasTimestamp: false, daysSinceUpdate: 0, isRotationDue: false };
  }

  const parsedMs =
    typeof shop.passwordUpdatedAt === 'number'
      ? shop.passwordUpdatedAt
      : Date.parse(String(shop.passwordUpdatedAt));

  if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
    return { hasTimestamp: false, daysSinceUpdate: 0, isRotationDue: false };
  }

  const daysSinceUpdate = Math.max(0, Math.floor((nowMs - parsedMs) / (24 * 60 * 60 * 1000)));
  return {
    hasTimestamp: true,
    daysSinceUpdate,
    isRotationDue: daysSinceUpdate >= SHOP_PASSWORD_ROTATION_DAYS
  };
}

/**
 * Allows a Shop Owner to update their shop password cleanly (from Shop Profile or 90-day prompt).
 * Stores ONLY salted SHA-256 hash and updates `passwordUpdatedAt` in IndexedDB + Firestore (`shops/{shopId}`).
 */
export async function changeShopOwnPassword(params: {
  shop: Shop;
  currentPassword: string;
  newPassword: string;
}): Promise<Shop> {
  if (!params.currentPassword) {
    throw new Error('Please enter your current shop password.');
  }
  const validCurrent = await verifyShopPassword(params.shop, params.currentPassword);
  if (!validCurrent) {
    throw new Error('Current shop password is incorrect.');
  }
  if (!params.newPassword || params.newPassword.length < 6) {
    throw new Error('New shop password must be at least 6 characters long.');
  }
  if (params.newPassword === params.currentPassword) {
    throw new Error('New password must be different from your current shop password.');
  }

  const newSalt = generateSalt(16);
  const newHash = await hashPasswordWithSalt(params.newPassword, newSalt);
  const nowTs = Date.now();
  const updatedShop: Shop = {
    ...params.shop,
    salt: newSalt,
    passwordHash: newHash,
    passwordUpdatedAt: nowTs,
    updatedAt: new Date(nowTs).toISOString()
  };
  delete updatedShop.cashierPassword;

  await saveShop(updatedShop);
  try {
    await syncShopToCloud(updatedShop);
  } catch (err) {
    console.warn('[Auth] Shop password cloud sync deferred:', err);
  }

  try {
    const users = await getAllLocalUsers();
    const targetUser = users.find(
      (u) =>
        u.role === 'SHOP_USER' &&
        (u.shopId === updatedShop.id ||
          (updatedShop.shopCode && u.shopCode === updatedShop.shopCode))
    );
    if (targetUser) {
      targetUser.salt = newSalt;
      targetUser.passwordHash = newHash;
      await saveAllLocalUsers(users);
    }
  } catch {
    // non-fatal
  }

  return updatedShop;
}

/**
 * Verify whether the current user is authorized to create/provision shops.
 */
export async function canUserCreateShops(currentUser?: AuthSession | null): Promise<{ allowed: boolean; reason?: string }> {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return {
      allowed: false,
      reason: 'Only authenticated Amul Headquarters Administrators can register new shops.'
    };
  }

  return { allowed: true };
}

/**
 * Retrieve Master Admin profile information (Username, Admin Security Email & Phone)
 */
export async function getMasterAdminProfile(): Promise<{ username: string; email: string; phone: string }> {
  const users = await getAllLocalUsers();
  const admin = users.find(u => u.role === 'ADMIN' && u.isMasterAdmin) || users.find(u => u.role === 'ADMIN');
  
  let cloudConfig: AdminAuthConfig | null = null;
  try {
    cloudConfig = await getAdminAuthConfig();
  } catch (err) {
    console.warn('[Auth] Could not fetch cloud admin auth config:', err);
  }

  let securityEmail = 'mekintik@gmail.com';
  try {
    const sec = await getAdminSecurityConfig();
    if (sec?.adminEmail) {
      securityEmail = sec.adminEmail;
    }
  } catch {
    // use default security email
  }

  const username = admin?.username || cloudConfig?.adminUsername || 'admin';
  const email = securityEmail || cloudConfig?.superAdminEmail || DEFAULT_ADMIN_AUTH_CONFIG.superAdminEmail;
  const phone = cloudConfig?.superAdminPhone || DEFAULT_ADMIN_AUTH_CONFIG.superAdminPhone;

  return { username, email, phone };
}

/**
 * Resets Master Admin Password AND (when provided) 6-Digit Security PIN via verified Gmail OTP flow.
 * Enforces:
 * - Valid single-use `ADMIN_PASSWORD_RESET` Gmail OTP verification token
 * - New Password MUST differ from previous Admin Password
 * - New 6-Digit Security PIN MUST differ from previous Security PIN
 * - Stores ONLY salted SHA-256 hashes in Cloud Firestore (`adminSettings/security` & `authConfig`)
 * - Updates `lastResetMonth` and `lastReminderMonth` to current `YYYY-MM`.
 */
export async function resetAdminPasswordViaTwoFactor(
  newPassword: string,
  verificationToken: string,
  options?: { newSecurityPin?: string; currentMonth?: string; nowMs?: number }
): Promise<{ username: string; resetMonth: string }> {
  if (!verificationToken || typeof verificationToken !== 'string') {
    throw new Error('Valid Gmail OTP verification is required before updating the Admin password.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const cleanPin = options?.newSecurityPin ? options.newSecurityPin.trim() : undefined;
  if (cleanPin !== undefined && !/^\d{6}$/.test(cleanPin)) {
    throw new Error('New Security PIN must be exactly 6 numeric digits.');
  }

  // Gather existing credential hashes BEFORE consuming the verification token so user can retry on reuse error
  const [secConfig, cloudConfig, users] = await Promise.all([
    getAdminSecurityConfig().catch(() => null),
    getAdminAuthConfig().catch(() => null),
    getAllLocalUsers().catch(() => [] as LocalUser[])
  ]);

  const profile = await getMasterAdminProfile().catch(() => ({
    username: cloudConfig?.adminUsername || 'admin',
    email: secConfig?.adminEmail || 'mekintik@gmail.com',
    phone: ''
  }));
  const cleanUsername = profile.username.trim().toLowerCase();
  const localAdmin =
    users.find((u) => u.role === 'ADMIN' && (u.username === cleanUsername || u.isMasterAdmin)) ||
    users.find((u) => u.role === 'ADMIN');

  // Verify new password differs from previous password hashes
  const previousPasswordPairs: Array<{ salt: string; hash: string }> = [];
  if (secConfig?.adminPasswordSalt && secConfig?.adminPasswordHash) {
    previousPasswordPairs.push({ salt: secConfig.adminPasswordSalt, hash: secConfig.adminPasswordHash });
  }
  if (cloudConfig?.adminSalt && cloudConfig?.adminPasswordHash) {
    previousPasswordPairs.push({ salt: cloudConfig.adminSalt, hash: cloudConfig.adminPasswordHash });
  }
  if (localAdmin?.salt && localAdmin?.passwordHash) {
    previousPasswordPairs.push({ salt: localAdmin.salt, hash: localAdmin.passwordHash });
  }

  for (const prev of previousPasswordPairs) {
    const candidateHash = await hashPasswordWithSalt(newPassword, prev.salt);
    if (constantTimeEqual(candidateHash, prev.hash)) {
      throw new Error('New Admin password must be different from your previous password.');
    }
  }

  // Verify new 6-digit Security PIN differs from previous PIN hashes
  if (cleanPin !== undefined) {
    const matchesOldPin = await matchesStoredAdminSecurityPin(cleanPin, secConfig);
    if (matchesOldPin) {
      throw new Error('New 6-Digit Security PIN must be different from your previous Security PIN.');
    }
  }

  // Strictly enforce verified Gmail OTP token before ANY credential update
  await consumeAdminVerificationToken(verificationToken, 'ADMIN_PASSWORD_RESET', options?.nowMs);

  const newSalt = generateSalt(16);
  const newHash = await hashPasswordWithSalt(newPassword, newSalt);
  const resetMonth = options?.currentMonth || getCurrentYearMonth(options?.nowMs);

  // 1. Update adminSettings/authConfig
  try {
    await updateAdminAuthConfig({
      adminUsername: cleanUsername,
      adminPasswordHash: newHash,
      adminSalt: newSalt,
      updatedAt: new Date().toISOString()
    });
  } catch (cloudErr: any) {
    console.error('[Auth] Failed to update admin password in authConfig:', cloudErr);
  }

  // 2. Update adminSettings/security with salted SHA-256 hashes + lastResetMonth
  if (cleanPin !== undefined) {
    await saveAdminCredentialsToSecurity({
      passwordSalt: newSalt,
      passwordHash: newHash,
      securityPin: cleanPin,
      currentMonth: resetMonth,
      updatedBy: cleanUsername
    });
  }

  // 3. Local IndexedDB update
  let admin = localAdmin;
  if (admin) {
    admin.username = cleanUsername;
    admin.salt = newSalt;
    admin.passwordHash = newHash;
  } else {
    admin = {
      id: `usr-admin-${Date.now()}`,
      username: cleanUsername,
      fullName: 'Master Administrator',
      role: 'ADMIN',
      isMasterAdmin: true,
      salt: newSalt,
      passwordHash: newHash,
      createdAt: new Date().toISOString()
    };
    users.push(admin);
  }

  await saveAllLocalUsers(users);

  return { username: cleanUsername, resetMonth };
}

/**
 * Unified Monthly & Forgot Recovery reset requiring BOTH a new Admin Password and a new 6-Digit Security PIN.
 */
export async function resetAdminCredentialsViaGmailOtp(params: {
  newPassword: string;
  newSecurityPin: string;
  verificationToken: string;
  currentMonth?: string;
  nowMs?: number;
}): Promise<{ username: string; resetMonth: string }> {
  return resetAdminPasswordViaTwoFactor(params.newPassword, params.verificationToken, {
    newSecurityPin: params.newSecurityPin,
    currentMonth: params.currentMonth,
    nowMs: params.nowMs
  });
}


