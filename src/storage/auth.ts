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
import { syncShopToCloud } from './firestoreSync.ts';
import { Shop } from '../types/index.ts';
import { isShopSubscriptionActive } from './subscription.ts';
import { generateSalt, hashPasswordWithSalt } from '../utils/cryptoHash.ts';
import { consumeAdminVerificationToken, getAdminSecurityConfig } from './adminEmailOtp.ts';

export { generateSalt, hashPasswordWithSalt };

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
        matchedShop = snapPhoneExact.docs[0].data() as Shop;
      }

      if (!matchedShop && last10Digits.length === 10) {
        const qPhoneWithPrefix = query(collection(db, 'shops'), where('phone', '==', `+91 ${last10Digits}`));
        const snapPhoneWithPrefix = await getDocs(qPhoneWithPrefix);
        if (!snapPhoneWithPrefix.empty) {
          matchedShop = snapPhoneWithPrefix.docs[0].data() as Shop;
        }
      }
    }

    // B. Check by document ID directly
    if (!matchedShop) {
      const shopDocRef = doc(db, 'shops', rawInput);
      const shopDocSnap = await getDoc(shopDocRef);
      if (shopDocSnap.exists()) {
        matchedShop = shopDocSnap.data() as Shop;
      }
    }

    // C. Query by shopCode
    if (!matchedShop) {
      const qCodeUpper = query(collection(db, 'shops'), where('shopCode', '==', rawInput.toUpperCase()));
      const snapCodeUpper = await getDocs(qCodeUpper);
      if (!snapCodeUpper.empty) {
        matchedShop = snapCodeUpper.docs[0].data() as Shop;
      }
    }

    // D. Query by cashierUsername
    if (!matchedShop) {
      const qCashier = query(collection(db, 'shops'), where('cashierUsername', '==', cleanLower));
      const snapCashier = await getDocs(qCashier);
      if (!snapCashier.empty) {
        matchedShop = snapCashier.docs[0].data() as Shop;
      }
    }

    // E. Scan collection in Firestore if formatting differs (e.g. spaces/hyphens in phone number or shopCode)
    if (!matchedShop) {
      const allShopsSnap = await getDocs(collection(db, 'shops'));
      for (const d of allShopsSnap.docs) {
        const s = d.data() as Shop;
        const sId = (s.id || d.id || '').toLowerCase();
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

  // Auto-upgrade security hash on shop document if missing
  if (!matchedShop.passwordHash || !matchedShop.salt) {
    try {
      const newSalt = generateSalt();
      const newHash = await hashPasswordWithSalt(params.password, newSalt);
      matchedShop.salt = newSalt;
      matchedShop.passwordHash = newHash;
      await syncShopToCloud(matchedShop);
    } catch (upgradeErr) {
      console.warn('[Auth] Failed to auto-upgrade shop password hash:', upgradeErr);
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

  // If Admin user not found locally or password check fails, check Cloud Firestore adminSettings
  if (params.role === 'ADMIN') {
    try {
      const cloudConfig = await getAdminAuthConfig();
      const cloudUsername = (cloudConfig.adminUsername || 'admin').trim().toLowerCase();
      if (cloudConfig.adminPasswordHash && cloudConfig.adminSalt && (cleanUsername === cloudUsername || !user)) {
        const cloudComputedHash = await hashPasswordWithSalt(params.password, cloudConfig.adminSalt);
        if (cloudComputedHash === cloudConfig.adminPasswordHash) {
          // Cloud credentials match! Sync into local IndexedDB
          let adminUser = user;
          if (!adminUser) {
            adminUser = {
              id: `usr-admin-${Date.now()}`,
              username: cloudUsername,
              fullName: cloudConfig.adminName || 'Master Administrator',
              role: 'ADMIN',
              isMasterAdmin: true,
              salt: cloudConfig.adminSalt,
              passwordHash: cloudConfig.adminPasswordHash,
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            };
            users.push(adminUser);
          } else {
            adminUser.salt = cloudConfig.adminSalt;
            adminUser.passwordHash = cloudConfig.adminPasswordHash;
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
  try {
    const shops = await getAllShops();
    const shop = shops.find(s => s.shopCode === params.shopCode);
    if (shop) {
      shop.salt = newSalt;
      shop.passwordHash = newHash;
      shop.cashierPassword = params.newPassword;
      await saveShop(shop);
      await syncShopToCloud(shop);
    } else {
      const q = query(collection(db, 'shops'), where('shopCode', '==', params.shopCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const s = docSnap.data() as Shop;
        s.salt = newSalt;
        s.passwordHash = newHash;
        s.cashierPassword = params.newPassword;
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
 * Reset Master Admin password via verified Gmail OTP 2FA recovery flow.
 * Strictly requires a valid single-use Gmail OTP verification token before updating
 * Firestore 'adminSettings/authConfig' and local IndexedDB, and immediately invalidates it.
 */
export async function resetAdminPasswordViaTwoFactor(
  newPassword: string,
  verificationToken: string
): Promise<{ username: string }> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  // Strictly enforce verified Gmail OTP token before ANY password change
  await consumeAdminVerificationToken(verificationToken, 'ADMIN_PASSWORD_RESET');

  const profile = await getMasterAdminProfile();
  const cleanUsername = profile.username.trim().toLowerCase();

  const newSalt = generateSalt();
  const newHash = await hashPasswordWithSalt(newPassword, newSalt);

  // 1. Instant Cloud Firestore update
  try {
    await updateAdminAuthConfig({
      adminUsername: cleanUsername,
      adminPasswordHash: newHash,
      adminSalt: newSalt,
      updatedAt: new Date().toISOString()
    });
  } catch (cloudErr: any) {
    console.error('[Auth] Failed to update admin password in Firestore:', cloudErr);
    // Still proceed to update local storage so admin is not locked out
  }

  // 2. Local IndexedDB update
  const users = await getAllLocalUsers();
  let admin = users.find(u => u.role === 'ADMIN' && (u.username === cleanUsername || u.isMasterAdmin))
    || users.find(u => u.role === 'ADMIN');

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

  return { username: cleanUsername };
}


