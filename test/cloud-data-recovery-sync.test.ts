/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test suite verifying Cloud Firestore historical data preservation,
 * non-destructive legacy localStorage migration, original collection paths,
 * and the manual "Sync Cloud Data / જૂનો ડેટા રિફ્રેશ કરો" recovery workflow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Track all Firestore read/write paths invoked during syncAllShopDataFromCloud
const queriedPaths: string[] = [];
const firestoreWrites: string[] = [];

const makeDocSnap = (id: string, data: Record<string, any>) => ({
  id,
  exists: () => true,
  data: () => data
});

const makeQuerySnap = (docs: Array<{ id: string; data: Record<string, any> }>) => ({
  empty: docs.length === 0,
  docs: docs.map((d) => makeDocSnap(d.id, d.data)),
  forEach: (cb: (docSnap: any) => void) => {
    docs.forEach((d) => cb(makeDocSnap(d.id, d.data)));
  }
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: any, ...segments: string[]) => ({ __path: segments.join('/') }),
  doc: (_db: any, ...segments: string[]) => ({ __path: segments.join('/') }),
  query: (colRef: any, ...constraints: any[]) => ({
    __path: colRef.__path,
    __constraints: constraints
  }),
  where: (field: string, op: string, value: any) => ({ field, op, value }),
  getDoc: vi.fn(async (ref: any) => {
    queriedPaths.push(`getDoc:${ref.__path}`);
    if (ref.__path === 'shops/shop-legacy-01') {
      return makeDocSnap('shop-legacy-01', {
        shopCode: 'AP-2025-8888',
        name: 'Shreeji Dairy Parlour',
        phone: '9876543210',
        ownerName: 'Rameshbhai'
      });
    }
    return { id: 'missing', exists: () => false, data: () => undefined };
  }),
  getDocs: vi.fn(async (qRef: any) => {
    const p = qRef.__path as string;
    const filterInfo = (qRef.__constraints || [])
      .map((c: any) => `${c.field}=${c.value}`)
      .join('&');
    queriedPaths.push(filterInfo ? `${p}?${filterInfo}` : p);

    // Simulate permission-denied on an optional unused subcollection to prove resilience
    if (p === 'shops/shop-legacy-01/expenses') {
      const err: any = new Error('Missing or insufficient permissions');
      err.code = 'permission-denied';
      throw err;
    }

    if (p === 'purchases' && filterInfo === 'shopId=shop-legacy-01') {
      return makeQuerySnap([
        {
          id: 'pur-root-1',
          data: {
            shopId: 'shop-legacy-01',
            supplierName: 'Anand Milk Agency',
            purchaseInvoiceNumber: 'INV-1001',
            totalAmount: 4500,
            items: []
          }
        }
      ]);
    }
    if (p === 'shops/shop-legacy-01/purchases') {
      return makeQuerySnap([
        {
          id: 'pur-sub-2',
          data: {
            agencyName: 'Kaira Distributors',
            billNumber: 'INV-1002',
            totalAmount: 3200,
            items: []
          }
        }
      ]);
    }
    if (p === 'sales' && filterInfo === 'shopId=shop-legacy-01') {
      return makeQuerySnap([
        {
          id: 'sale-root-1',
          data: {
            shopId: 'shop-legacy-01',
            billNumber: 'BILL-001',
            finalAmount: 240,
            items: []
          }
        }
      ]);
    }
    if (p === 'shops/shop-legacy-01/bills') {
      return makeQuerySnap([
        {
          id: 'bill-sub-2',
          data: {
            billNumber: 'BILL-002',
            finalAmount: 510,
            items: []
          }
        }
      ]);
    }
    if (p === 'products' && filterInfo === 'shopId=shop-legacy-01') {
      return makeQuerySnap([
        {
          id: 'prod-1',
          data: { shopId: 'shop-legacy-01', name: 'Amul Gold 500ml', currentStock: 24 }
        }
      ]);
    }
    if (p === 'shops/shop-legacy-01/suppliers') {
      return makeQuerySnap([
        {
          id: 'sup-1',
          data: { name: 'Anand Milk Agency', phone: '9825011111' }
        }
      ]);
    }
    if (p === 'shops/shop-legacy-01/khata') {
      return makeQuerySnap([
        {
          id: 'khata-1',
          data: { supplierId: 'sup-1', amount: 1500, paymentDate: '2026-03-01' }
        }
      ]);
    }
    if (p === 'expenses' && filterInfo === 'shopId=shop-legacy-01') {
      return makeQuerySnap([
        {
          id: 'exp-1',
          data: { shopId: 'shop-legacy-01', title: 'Electricity Bill', amount: 1200 }
        }
      ]);
    }
    if (p === 'bankEntries' && filterInfo === 'shopId=shop-legacy-01') {
      return makeQuerySnap([
        {
          id: 'bank-1',
          data: { shopId: 'shop-legacy-01', amount: 2000, type: 'CREDIT' }
        }
      ]);
    }

    return makeQuerySnap([]);
  }),
  setDoc: vi.fn(async (ref: any) => {
    firestoreWrites.push(`setDoc:${ref.__path}`);
  }),
  deleteDoc: vi.fn(async (ref: any) => {
    firestoreWrites.push(`deleteDoc:${ref.__path}`);
  }),
  onSnapshot: vi.fn(() => () => {})
}));

vi.mock('../src/storage/firebase.ts', () => ({
  db: {},
  ensureAnonymousAuth: vi.fn(async () => true),
  reconnectFirestoreCloud: vi.fn(async () => true),
  getAdminAuthConfig: vi.fn(async () => ({})),
  updateAdminAuthConfig: vi.fn(async () => {}),
  DEFAULT_ADMIN_AUTH_CONFIG: {
    superAdminEmail: 'mekintik@gmail.com',
    superAdminPhone: ''
  }
}));

const savedShops: any[] = [];
const savedProducts: any[] = [];
const savedPurchases: any[] = [];
const savedSales: any[] = [];
const savedSuppliers: any[] = [];
const savedKhata: any[] = [];
const savedExpenses: any[] = [];
const savedBankEntries: any[] = [];

vi.mock('../src/storage/db.ts', () => ({
  loadDeletedProductIds: vi.fn(async () => new Set<string>()),
  loadDeletedSupplierIds: vi.fn(async () => new Set<string>()),
  loadDeletedPurchaseIds: vi.fn(async () => new Set<string>()),
  isProductDeleted: vi.fn(() => false),
  isSupplierDeleted: vi.fn(() => false),
  isPurchaseDeleted: vi.fn(() => false),
  getShopById: vi.fn(async () => null),
  getAllShops: vi.fn(async () => []),
  openAppDatabase: vi.fn(async () => ({})),
  prefillMasterAmulCatalogWithZeroStock: vi.fn(async () => {}),
  saveShop: vi.fn(async (s: any) => {
    savedShops.push(s);
  }),
  saveProduct: vi.fn(async (p: any) => {
    savedProducts.push(p);
  }),
  savePurchaseBill: vi.fn(async (p: any) => {
    savedPurchases.push(p);
  }),
  saveSaleBillFromCloud: vi.fn(async (s: any) => {
    savedSales.push(s);
  }),
  saveSupplier: vi.fn(async (s: any) => {
    savedSuppliers.push(s);
  }),
  saveSupplierPaymentFromCloud: vi.fn(async (k: any) => {
    savedKhata.push(k);
  }),
  saveExpenseFromCloud: vi.fn(async (e: any) => {
    savedExpenses.push(e);
  }),
  saveBankEntry: vi.fn(async (b: any) => {
    savedBankEntries.push(b);
  })
}));

import { syncAllShopDataFromCloud } from '../src/storage/firestoreSync.ts';
import { migrateLegacyLocalStorageKeys } from '../src/storage/auth.ts';

describe('Cloud Firestore Data Preservation & Historical Recovery', () => {
  beforeEach(() => {
    queriedPaths.length = 0;
    firestoreWrites.length = 0;
    savedShops.length = 0;
    savedProducts.length = 0;
    savedPurchases.length = 0;
    savedSales.length = 0;
    savedSuppliers.length = 0;
    savedKhata.length = 0;
    savedExpenses.length = 0;
    savedBankEntries.length = 0;
  });

  it('queries all original Firestore paths, hydrates IndexedDB idempotently, and never writes or deletes Firestore docs', async () => {
    const summary = await syncAllShopDataFromCloud('shop-legacy-01', { forceReconnect: true });

    expect(summary.authOk).toBe(true);
    expect(summary.shopSynced).toBe(true);
    expect(summary.purchases).toBe(2);
    expect(summary.sales).toBe(2);
    expect(summary.products).toBe(1);
    expect(summary.suppliers).toBe(1);
    expect(summary.khata).toBe(1);
    expect(summary.expenses).toBe(1);
    expect(summary.bankEntries).toBe(1);
    expect(summary.totalRecords).toBe(9);

    // Confirm zero Firestore mutations or deletions occurred during recovery
    expect(firestoreWrites).toHaveLength(0);

    // Confirm exact original collection and subcollection paths were queried
    expect(queriedPaths).toContain('getDoc:shops/shop-legacy-01');
    expect(queriedPaths).toContain('purchases?shopId=shop-legacy-01');
    expect(queriedPaths).toContain('shops/shop-legacy-01/purchases');
    expect(queriedPaths).toContain('sales?shopId=shop-legacy-01');
    expect(queriedPaths).toContain('shops/shop-legacy-01/sales');
    expect(queriedPaths).toContain('shops/shop-legacy-01/bills');
    expect(queriedPaths).toContain('products?shopId=shop-legacy-01');
    expect(queriedPaths).toContain('inventory?shopId=shop-legacy-01');
    expect(queriedPaths).toContain('shops/shop-legacy-01/products');
    expect(queriedPaths).toContain('shops/shop-legacy-01/khata');
    expect(queriedPaths).toContain('expenses?shopId=shop-legacy-01');
    expect(queriedPaths).toContain('bankEntries?shopId=shop-legacy-01');

    // Confirm shopId and doc.id were normalized on all subcollection records
    expect(savedShops[0].id).toBe('shop-legacy-01');
    expect(savedPurchases.map((p) => p.id).sort()).toEqual(['pur-root-1', 'pur-sub-2']);
    expect(savedPurchases.every((p) => p.shopId === 'shop-legacy-01')).toBe(true);
    expect(savedSales.map((s) => s.id).sort()).toEqual(['bill-sub-2', 'sale-root-1']);
    expect(savedSales.every((s) => s.shopId === 'shop-legacy-01')).toBe(true);
    expect(savedKhata[0].id).toBe('khata-1');
    expect(savedExpenses[0].id).toBe('exp-1');
    expect(savedBankEntries[0].id).toBe('bank-1');
  });

  it('migrates legacy or renamed localStorage keys without overwriting or deleting existing keys', () => {
    const store = new Map<string, string>([
      ['amul_pos_theme', 'dark'],
      ['parlourpro_pos_theme', 'light'],
      ['parlourpro_pos_print_settings', '{"paperWidth":"80mm"}'],
      ['parlourpro_last_cloud_sync_shop-legacy-01', '2026-03-10T10:00:00.000Z']
    ]);

    const fakeStorage = {
      get length() {
        return store.size;
      },
      key: (idx: number) => Array.from(store.keys())[idx] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      }
    };

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      localStorage: fakeStorage,
      sessionStorage: {
        length: 0,
        key: () => null,
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
      }
    };

    try {
      const result = migrateLegacyLocalStorageKeys();

      // Existing canonical key MUST NOT be overwritten
      expect(store.get('amul_pos_theme')).toBe('dark');
      // Missing canonical keys ARE restored from alternate/legacy keys
      expect(store.get('amul_pos_print_settings')).toBe('{"paperWidth":"80mm"}');
      expect(store.get('amul_last_cloud_sync_shop-legacy-01')).toBe('2026-03-10T10:00:00.000Z');
      // Source keys are never deleted
      expect(store.get('parlourpro_pos_print_settings')).toBe('{"paperWidth":"80mm"}');
      expect(result.migratedKeys.length).toBe(2);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('preserves IndexedDB name, original localStorage keys, and exposes Sync Cloud Data UI actions', () => {
    const root = process.cwd();
    const dbSource = fs.readFileSync(path.join(root, 'src/storage/db.ts'), 'utf8');
    const authSource = fs.readFileSync(path.join(root, 'src/storage/auth.ts'), 'utf8');
    const headerSource = fs.readFileSync(path.join(root, 'src/components/layout/Header.tsx'), 'utf8');
    const backupSource = fs.readFileSync(
      path.join(root, 'src/components/backup/BackupManagementView.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');

    // Original IndexedDB name & session key must remain unchanged
    expect(dbSource).toContain("const DB_NAME = 'AmulParlourDB';");
    expect(authSource).toContain("const SESSION_KEY = 'amul_pos_active_session';");
    expect(authSource).toContain('normalizeRemoteShop(');

    // Manual Cloud Data Sync / Gujarati refresh button present in Header & Backup Center
    expect(headerSource).toContain('Sync Cloud Data / જૂનો ડેટા રિફ્રેશ કરો');
    expect(backupSource).toContain('Sync Cloud Data / જૂનો ડેટા રિફ્રેશ કરો');
    expect(appSource).toContain('handleManualCloudSync');
    expect(appSource).toContain('cloudSyncVersion');
  });
});
