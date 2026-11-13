/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for Master Admin Portal Cloud Firestore root `shops` sync:
 * - Restores real registered shops from root `shops` collection
 * - Syncs remote shops into local IndexedDB without ConstraintError
 * - Ensures demo seeds (AP-2026-1001..1003) never overwrite or hide real shops
 * - Handles shops with missing optional fields safely in Admin filters/table
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Shop } from '../src/types/index.ts';

const mockCloudShops: Map<string, Record<string, any>> = new Map();
const mockLocalShops: Map<string, Shop> = new Map();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    collection: vi.fn((_db, name) => ({ name })),
    doc: vi.fn((_db, col, id) => ({ col, id })),
    getDoc: vi.fn(async (docRef) => {
      const data = mockCloudShops.get(docRef.id);
      return {
        exists: () => !!data,
        id: docRef.id,
        data: () => data
      };
    }),
    getDocs: vi.fn(async () => {
      const entries = Array.from(mockCloudShops.entries());
      return {
        empty: entries.length === 0,
        docs: entries.map(([id, data]) => ({ id, data: () => data })),
        forEach: (cb: (snap: { id: string; data: () => any }) => void) => {
          entries.forEach(([id, data]) => cb({ id, data: () => data }));
        }
      };
    }),
    onSnapshot: vi.fn((_ref, onNext) => {
      const entries = Array.from(mockCloudShops.entries());
      onNext({
        docs: entries.map(([id, data]) => ({ id, data: () => data })),
        forEach: (cb: (snap: { id: string; data: () => any }) => void) => {
          entries.forEach(([id, data]) => cb({ id, data: () => data }));
        }
      });
      return () => {};
    })
  };
});

vi.mock('../src/storage/firebase.ts', () => ({
  db: {},
  ensureAnonymousAuth: vi.fn(async () => {})
}));

vi.mock('../src/storage/db.ts', () => ({
  getAllShops: vi.fn(async () => Array.from(mockLocalShops.values())),
  getShopById: vi.fn(async (id: string) => mockLocalShops.get(id) || null),
  saveShop: vi.fn(async (shop: Shop) => {
    mockLocalShops.set(shop.id, shop);
    return shop;
  }),
  loadDeletedProductIds: vi.fn(async () => new Set()),
  loadDeletedSupplierIds: vi.fn(async () => new Set()),
  loadDeletedPurchaseIds: vi.fn(async () => new Set())
}));

describe('Admin Portal Cloud Firestore Shops Sync & Demo Seed Protection', () => {
  beforeEach(() => {
    mockCloudShops.clear();
    mockLocalShops.clear();

    // Seed local store with the 3 demo shops
    mockLocalShops.set('shop-amul-001', {
      id: 'shop-amul-001',
      shopCode: 'AP-2026-1001',
      name: 'Demo Anand Kiosk',
      ownerName: 'Rajesh Patel',
      phone: '+91 98250 12345',
      email: 'demo1@amul.in',
      address: 'Anand',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'BASIC',
      subscriptionStatus: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    mockLocalShops.set('shop-amul-002', {
      id: 'shop-amul-002',
      shopCode: 'AP-2026-1002',
      name: 'Demo Ice Cream Lounge',
      ownerName: 'Priya Sharma',
      phone: '+91 98111 67890',
      email: 'demo2@amul.in',
      address: 'Noida',
      city: 'Noida',
      state: 'UP',
      pincode: '201301',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    mockLocalShops.set('shop-amul-003', {
      id: 'shop-amul-003',
      shopCode: 'AP-2026-1003',
      name: 'Demo Fresh Point',
      ownerName: 'Karthik Rao',
      phone: '+91 98450 99887',
      email: 'demo3@amul.in',
      address: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
      approvalStatus: 'PENDING',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'INACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('normalizes Cloud Firestore shops missing optional fields so none are dropped', async () => {
    const { normalizeRemoteShop } = await import('../src/storage/firestoreSync.ts');
    const normalized = normalizeRemoteShop({ name: 'Real Sparse Parlour', phone: '9876543210' }, 'doc-real-sparse');

    expect(normalized.id).toBe('doc-real-sparse');
    expect(normalized.shopCode).toBe('doc-real-sparse');
    expect(normalized.name).toBe('Real Sparse Parlour');
    expect(normalized.ownerName).toBe('');
    expect(normalized.approvalStatus).toBe('APPROVED');
    expect(normalized.subscriptionPlanId).toBe('BASIC');
  });

  it('fetches real registered shops from Cloud Firestore via AppRepository.shops.getAll and syncs to IndexedDB', async () => {
    mockCloudShops.set('shop-real-vadodara', {
      id: 'shop-real-vadodara',
      shopCode: 'AP-2026-7741',
      name: 'Real Amul Parlour Vadodara',
      phone: '9898012345'
      // Intentionally omit ownerName, city, approvalStatus, subscriptionPlanId
    });

    const { AppRepository } = await import('../src/storage/repositories.ts');
    const allShops = await AppRepository.shops.getAll();

    // Real cloud shop must appear first and be persisted into local IndexedDB
    expect(allShops.some(s => s.id === 'shop-real-vadodara' && s.name === 'Real Amul Parlour Vadodara')).toBe(true);
    expect(allShops[0].id).toBe('shop-real-vadodara');
    expect(mockLocalShops.has('shop-real-vadodara')).toBe(true);
  });

  it('never allows demo seeds (AP-2026-1001..1003) to overwrite a real Cloud Firestore shop', async () => {
    const { mergeCloudAndLocalShops } = await import('../src/storage/firestoreSync.ts');

    const realShopOverridingCode: Shop = {
      id: 'shop-real-custom-1001',
      shopCode: 'AP-2026-1001',
      name: 'Verified Franchisee Real Outlet',
      ownerName: 'Maheshbhai Desai',
      phone: '9925011111',
      email: 'mahesh@amul.in',
      address: 'CG Road',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380009',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'PRO',
      subscriptionStatus: 'ACTIVE',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    };

    const merged = mergeCloudAndLocalShops([realShopOverridingCode], Array.from(mockLocalShops.values()));
    const match1001 = merged.filter(s => s.shopCode === 'AP-2026-1001');
    expect(match1001.length).toBe(1);
    expect(match1001[0].id).toBe('shop-real-custom-1001');
    expect(match1001[0].name).toBe('Verified Franchisee Real Outlet');
  });

  it('attaches real-time root shops listener in AdminPortal and safely filters sparse shop objects', async () => {
    const { startAdminShopsRealtimeSync } = await import('../src/storage/firestoreSync.ts');
    mockCloudShops.set('shop-live-rajkot', {
      shopName: 'Live Rajkot Amul Depot',
      phone: '9725099999'
    });

    const received: Shop[][] = [];
    const unsub = startAdminShopsRealtimeSync((shops) => {
      received.push(shops);
    });

    // Wait one microtask tick for ensureAnonymousAuth().then(...)
    await new Promise(r => setTimeout(r, 10));
    unsub();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0].some(s => s.id === 'shop-live-rajkot' && s.name === 'Live Rajkot Amul Depot')).toBe(true);

    const adminSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/AdminPortal.tsx'), 'utf8');
    expect(adminSource).toContain('startAdminShopsRealtimeSync');
    expect(adminSource).toContain('(s.ownerName || \'\')');
    expect(adminSource).toContain('(s.shopCode || \'\')');
  });
});
