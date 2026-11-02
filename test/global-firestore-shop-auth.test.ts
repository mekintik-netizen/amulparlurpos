/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Global Firestore Authentication for Shop Counter & Cross-Device Access
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Shop } from '../src/types/index.ts';
import { isShopSubscriptionActive } from '../src/storage/subscription.ts';
import { generateSalt, hashPasswordWithSalt } from '../src/storage/auth.ts';

// Mock in-memory Firestore shops collection
const mockFirestoreShops: Map<string, Shop> = new Map();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    collection: vi.fn((_db, name) => ({ name })),
    doc: vi.fn((_db, col, id) => ({ col, id })),
    getDoc: vi.fn(async (docRef) => {
      const shop = mockFirestoreShops.get(docRef.id);
      return {
        exists: () => !!shop,
        data: () => shop,
        id: docRef.id
      };
    }),
    getDocs: vi.fn(async (q: any) => {
      let filtered = Array.from(mockFirestoreShops.values());
      if (Array.isArray(q)) {
        for (const item of q) {
          if (item && item.field && item.val !== undefined) {
            filtered = filtered.filter(s => (s as any)[item.field] === item.val);
          }
        }
      }
      return {
        empty: filtered.length === 0,
        docs: filtered.map(s => ({
          data: () => s,
          id: s.id
        }))
      };
    }),
    setDoc: vi.fn(async (docRef, data) => {
      mockFirestoreShops.set(docRef.id, data);
    }),
    deleteDoc: vi.fn(async (docRef) => {
      mockFirestoreShops.delete(docRef.id);
    }),
    query: vi.fn((...args) => args),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    onSnapshot: vi.fn(() => () => {})
  };
});

vi.mock('../src/storage/db.ts', () => ({
  openAppDatabase: vi.fn(),
  getAllShops: vi.fn(async () => Array.from(mockFirestoreShops.values())),
  saveShop: vi.fn(async (shop) => {
    mockFirestoreShops.set(shop.id, shop);
  }),
  prefillMasterAmulCatalogWithZeroStock: vi.fn(async () => 65)
}));

describe('Global Firestore Shop Authentication & Cross-Device Access', () => {
  const testShopId = 'shop-cross-device-101';
  const testShopCode = 'AP-2026-9999';

  let testShop: Shop;

  beforeEach(async () => {
    mockFirestoreShops.clear();
    const salt = generateSalt();
    const passwordHash = await hashPasswordWithSalt('password123', salt);

    testShop = {
      id: testShopId,
      shopCode: testShopCode,
      name: 'Amul Heritage Parlour Surat',
      ownerName: 'Kiran Prajapati',
      phone: '+91 98250 11223',
      email: 'kiran.surat@amul.in',
      address: 'Ring Road, Surat',
      city: 'Surat',
      state: 'Gujarat',
      pincode: '395002',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'BASIC',
      subscriptionStatus: 'ACTIVE',
      status: 'active',
      planStartDate: new Date().toISOString(),
      planEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cashierUsername: 'surat9999',
      salt,
      passwordHash,
      ownerIdVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockFirestoreShops.set(testShopId, testShop);
  });

  it('authenticates shop counter from Firestore by shop code and returns isolated shop session', async () => {
    const { authenticateShopCounterFromFirestore } = await import('../src/storage/auth.ts');
    
    const session = await authenticateShopCounterFromFirestore({
      usernameOrShopId: testShopCode,
      password: 'password123'
    });

    expect(session).toBeDefined();
    expect(session.shopId).toBe(testShopId);
    expect(session.shopCode).toBe(testShopCode);
    expect(session.shopName).toBe('Amul Heritage Parlour Surat');
    expect(session.role).toBe('SHOP_USER');
  });

  it('authenticates shop counter by cashier username', async () => {
    const { authenticateShopCounterFromFirestore } = await import('../src/storage/auth.ts');
    
    const session = await authenticateShopCounterFromFirestore({
      usernameOrShopId: 'surat9999',
      password: 'password123'
    });

    expect(session.shopId).toBe(testShopId);
    expect(session.shopCode).toBe(testShopCode);
    expect(session.shopName).toBe('Amul Heritage Parlour Surat');
  });

  it('rejects invalid password for registered shop with descriptive error', async () => {
    const { authenticateShopCounterFromFirestore } = await import('../src/storage/auth.ts');
    
    await expect(
      authenticateShopCounterFromFirestore({
        usernameOrShopId: testShopCode,
        password: 'incorrectPassword123'
      })
    ).rejects.toThrow(/invalid password/i);
  });

  it('accurately enforces planEndDate subscription lifecycle', () => {
    // Active shop
    const activeCheck = isShopSubscriptionActive(testShop);
    expect(activeCheck.isActive).toBe(true);
    expect(activeCheck.isExpired).toBe(false);
    expect(activeCheck.daysRemaining).toBeGreaterThanOrEqual(29);

    // Expired shop
    const expiredShop: Shop = {
      ...testShop,
      id: 'shop-expired-001',
      status: 'expired',
      planEndDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    };
    const expiredCheck = isShopSubscriptionActive(expiredShop);
    expect(expiredCheck.isActive).toBe(false);
    expect(expiredCheck.isExpired).toBe(true);
    expect(expiredCheck.message).toContain('Read-Only Mode');
  });

  it('supports cryptographic salt and SHA-256 hash verification', async () => {
    const salt = generateSalt();
    const passwordHash = await hashPasswordWithSalt('secure_pos_pin', salt);

    const hashedShop: Shop = {
      ...testShop,
      id: 'shop-hashed-202',
      shopCode: 'AP-2026-HASH',
      salt,
      passwordHash,
      cashierPassword: undefined // zero plaintext stored
    };

    mockFirestoreShops.set('shop-hashed-202', hashedShop);

    const { authenticateShopCounterFromFirestore } = await import('../src/storage/auth.ts');

    const session = await authenticateShopCounterFromFirestore({
      usernameOrShopId: 'AP-2026-HASH',
      password: 'secure_pos_pin'
    });

    expect(session.shopId).toBe('shop-hashed-202');
    expect(session.shopCode).toBe('AP-2026-HASH');
  });

  it('allows Admin to reset shop cashier password and updates shop document in Firestore', async () => {
    const { adminResetShopPassword, authenticateShopCounterFromFirestore } = await import('../src/storage/auth.ts');

    const adminSession = {
      userId: 'usr-admin-1',
      username: 'admin',
      fullName: 'Master Admin',
      role: 'ADMIN' as const,
      tokenExpiresAt: Date.now() + 3600000,
      loggedInAt: new Date().toISOString()
    };

    const resetRes = await adminResetShopPassword({
      adminSession,
      shopCode: testShopCode,
      newPassword: 'newSecretPassword2026'
    });

    expect(resetRes.success).toBe(true);

    // Cashier can immediately authenticate with new password across devices
    const newSession = await authenticateShopCounterFromFirestore({
      usernameOrShopId: testShopCode,
      password: 'newSecretPassword2026'
    });

    expect(newSession.shopId).toBe(testShopId);
  });

  it('verifies strict multi-shop tenant isolation in firestoreSync.ts queries', () => {
    const syncFilePath = path.resolve(process.cwd(), 'src/storage/firestoreSync.ts');
    const syncContent = fs.readFileSync(syncFilePath, 'utf8');

    // Strict tenant isolation checks
    expect(syncContent).toContain("where('shopId', '==', shopId)");
    expect(syncContent).toContain("collection(db, 'products')");
    expect(syncContent).toContain("collection(db, 'sales')");
    expect(syncContent).toContain("collection(db, 'expenses')");
    expect(syncContent).toContain("collection(db, 'bankEntries')");
  });
});
