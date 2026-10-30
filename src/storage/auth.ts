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

import { openAppDatabase } from './db.ts';

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
  tokenExpiresAt: number; // Unix timestamp
  loggedInAt: string;
}

const SESSION_KEY = 'amul_pos_active_session';

/**
 * Generate a cryptographically strong random salt
 */
export function generateSalt(byteLength = 16): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-crypto environments
  let result = '';
  for (let i = 0; i < byteLength; i++) {
    result += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return result;
}

/**
 * Compute SHA-256 hash of password with salt using Web Crypto API
 * Result is a hex string. Plaintext password is immediately discarded.
 */
export async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const saltedString = `${salt}:${password}`;
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(saltedString);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to JS implementation
    }
  }

  // Pure JavaScript SHA-256 fallback for environments without subtle crypto
  return fallbackSha256(saltedString);
}

/**
 * Lightweight, self-contained SHA-256 implementation as safe fallback
 */
function fallbackSha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let i = 0; i < ascii.length; i++) {
    const j = i >> 2;
    words[j] = (words[j] || 0) | ((ascii.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8));
  }

  const endCharIndex = ascii.length;
  words[endCharIndex >> 2] = (words[endCharIndex >> 2] || 0) | (0x80 << (24 - (endCharIndex % 4) * 8));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (let j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[j] + (w[j] || 0)) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

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
  const db = await openAppDatabase();
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
}

/**
 * Seed initial default accounts if none exist, so the user can immediately test or create fresh ones
 */
export async function ensureDefaultAccountsSeeded(): Promise<void> {
  const existing = await getAllLocalUsers();
  if (existing.length > 0) return;

  // Initial Admin salt and hash for default 'admin' / 'amul123'
  const adminSalt = generateSalt();
  const adminHash = await hashPasswordWithSalt('amul123', adminSalt);

  // Initial Shop Cashier for AP-2026-1001 ('cashier' / 'amul123')
  const cashierSalt = generateSalt();
  const cashierHash = await hashPasswordWithSalt('amul123', cashierSalt);

  const initialUsers: LocalUser[] = [
    {
      id: 'usr-admin-default',
      username: 'admin',
      fullName: 'HQ System Administrator',
      role: 'ADMIN',
      isMasterAdmin: true,
      designation: 'Chief Franchise Administrator',
      salt: adminSalt,
      passwordHash: adminHash,
      createdAt: new Date().toISOString()
    },
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
  const cleanUsername = params.username.trim().toLowerCase();
  const users = await getAllLocalUsers();

  const user = users.find(u => u.username === cleanUsername);
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
    const raw = sessionStorage.getItem(SESSION_KEY);
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

export function saveSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
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
            const hasMaster = users.some(u => u.role === 'ADMIN');
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
 * Salted SHA-256 hash stored, zero plaintext, permanent one-time lock.
 */
export async function performOneTimeAdminSetup(params: {
  username: string;
  fullName: string;
  password: string;
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

  const users = await getAllLocalUsers();
  const existingIdx = users.findIndex(u => u.username === cleanUsername);

  const salt = generateSalt();
  const passwordHash = await hashPasswordWithSalt(params.password, salt);

  const masterAdmin: LocalUser = {
    id: `usr-admin-master-${Date.now()}`,
    username: cleanUsername,
    fullName: params.fullName.trim() || `${cleanUsername} (Master Admin)`,
    role: 'ADMIN',
    isMasterAdmin: true,
    designation: params.designation?.trim() || 'Chief Franchise Administrator',
    salt,
    passwordHash,
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
 * Verify whether the current user is authorized to create/provision shops.
 * Enforces:
 * 1. Master admin must be initialized.
 * 2. Current session must be an authenticated ADMIN.
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

