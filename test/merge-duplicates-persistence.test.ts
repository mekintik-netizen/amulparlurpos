/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit & integration tests for Merge Duplicate Products persistence:
 * 1. Combining currentStock and saving primary product to Cloud Firestore via setDoc(..., { merge: true }).
 * 2. Permanently deleting merged duplicate documents from both shops/{shopId}/products and root products/inventory.
 * 3. Preventing syncPreFilledCatalog and startShopRealtimeSync from recreating merged/deleted duplicates on refresh.
 * 4. Verifying firestore.rules permits product & inventory deletions for shop sessions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Product } from '../src/types/index.ts';

const setDocMock = vi.fn(async (_ref?: any, _data?: any, _opts?: any) => {});
const deleteDocMock = vi.fn(async (_ref?: any) => {});
const docMock = vi.fn((_db: any, ...pathSegments: string[]) => ({
  path: pathSegments.join('/'),
  id: pathSegments[pathSegments.length - 1]
}));
const snapshotListeners: Array<{ col: string; cb: (snap: any) => Promise<void> | void }> = [];

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') })),
    doc: (...args: any[]) => docMock(args[0], ...args.slice(1)),
    setDoc: (ref: any, data: any, opts?: any) => setDocMock(ref, data, opts),
    deleteDoc: (ref: any) => deleteDocMock(ref),
    query: vi.fn((colRef: any, ...filters: any[]) => ({ colRef, filters })),
    where: vi.fn((field: string, op: string, val: any) => ({ field, op, val })),
    onSnapshot: vi.fn((target: any, cb: any) => {
      const col = target?.colRef?.path || target?.path || 'unknown';
      snapshotListeners.push({ col, cb });
      return () => {};
    })
  };
});

vi.mock('../src/storage/firebase.ts', () => ({
  db: { __mock: true },
  ensureAnonymousAuth: vi.fn(async () => ({ uid: 'anon-test-user' })),
  getAdminAuthConfig: vi.fn(),
  updateAdminAuthConfig: vi.fn(),
  DEFAULT_ADMIN_AUTH_CONFIG: {}
}));

// In-memory mock of IndexedDB layer for testing repository + sync interactions cleanly in Node/Vitest
const mockProductsStore = new Map<string, Product>();
const mockDeletedProductIds = new Set<string>();

vi.mock('../src/storage/db.ts', async () => {
  const { normalizeBarcode, normalizeProductName, normalizeSku } = await import('../src/storage/duplicateDetector.ts');
  const { getSeedProductsForShop } = await import('../src/storage/seedData.ts');

  return {
    openAppDatabase: vi.fn(),
    getProductById: vi.fn(async (id: string) => mockProductsStore.get(id) || null),
    getProductsByShop: vi.fn(async (shopId: string) =>
      Array.from(mockProductsStore.values()).filter(p => p.shopId === shopId && !mockDeletedProductIds.has(p.id))
    ),
    saveProduct: vi.fn(async (product: Product) => {
      if (mockDeletedProductIds.has(product.id)) return product;
      mockProductsStore.set(product.id, product);
      return product;
    }),
    deleteProduct: vi.fn(async (productId: string) => {
      mockDeletedProductIds.add(productId);
      mockProductsStore.delete(productId);
    }),
    loadDeletedProductIds: vi.fn(async () => mockDeletedProductIds),
    isProductDeleted: vi.fn((id: string) => mockDeletedProductIds.has(id)),
    loadDeletedSupplierIds: vi.fn(async () => new Set<string>()),
    loadDeletedPurchaseIds: vi.fn(async () => new Set<string>()),
    isSupplierDeleted: vi.fn(() => false),
    isPurchaseDeleted: vi.fn(() => false),
    mergeDuplicateProducts: vi.fn(
      async (shopId: string, primaryProduct: Product, duplicateProducts: Product[]) => {
        const duplicates = duplicateProducts.filter(d => d.id && d.id !== primaryProduct.id);
        let combinedStock = primaryProduct.currentStock || 0;
        let bestBarcode = primaryProduct.barcode;
        let bestSku = primaryProduct.sku;

        for (const dup of duplicates) {
          combinedStock += (dup.currentStock || 0);
          if (!normalizeBarcode(bestBarcode) && normalizeBarcode(dup.barcode)) {
            bestBarcode = dup.barcode;
          }
          if (!normalizeSku(bestSku) && normalizeSku(dup.sku)) {
            bestSku = dup.sku;
          }
          mockDeletedProductIds.add(dup.id);
          mockProductsStore.delete(dup.id);
        }

        const updatedPrimary: Product = {
          ...primaryProduct,
          shopId,
          barcode: bestBarcode || primaryProduct.barcode,
          sku: bestSku || primaryProduct.sku,
          currentStock: combinedStock,
          updatedAt: new Date().toISOString()
        };
        mockProductsStore.set(updatedPrimary.id, updatedPrimary);

        return {
          primary: updatedPrimary,
          deletedIds: duplicates.map(d => d.id)
        };
      }
    ),
    syncPreFilledAmulCatalogForShop: vi.fn(async (shopId: string) => {
      const existing = Array.from(mockProductsStore.values()).filter(
        p => p.shopId === shopId && !mockDeletedProductIds.has(p.id)
      );
      const seed = getSeedProductsForShop(shopId);
      let added = 0;

      for (const item of seed) {
        if (mockDeletedProductIds.has(item.id)) continue;
        const matched = existing.some(e => {
          const b1 = normalizeBarcode(e.barcode);
          const b2 = normalizeBarcode(item.barcode);
          if (b1 && b2 && b1 === b2) return true;
          const n1 = normalizeProductName(e.name);
          const n2 = normalizeProductName(item.name);
          if (n1 && n2 && n1 === n2) return true;
          const s1 = normalizeSku(e.sku);
          const s2 = normalizeSku(item.sku);
          if (s1 && s2 && s1 === s2) return true;
          return false;
        });
        if (!matched) {
          mockProductsStore.set(item.id, item);
          existing.push(item);
          added++;
        }
      }

      return { added, total: existing.length };
    })
  };
});

describe('Merge Duplicate Products - Cloud & Local Persistence', () => {
  const shopId = 'shop-amul-001';

  const makeProduct = (overrides: Partial<Product>): Product => ({
    id: 'prod-default',
    shopId,
    barcode: '8901262010014',
    sku: 'AMUL-MILK-TZ-500',
    name: 'Amul Taaza Toned Milk (500ml)',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 27,
    costPrice: 24.5,
    sellingPrice: 27,
    currentStock: 10,
    minStockAlert: 10,
    isActive: true,
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T08:00:00Z',
    ...overrides
  });

  beforeEach(() => {
    mockProductsStore.clear();
    mockDeletedProductIds.clear();
    setDocMock.mockClear();
    deleteDocMock.mockClear();
    docMock.mockClear();
    snapshotListeners.length = 0;
  });

  it('combines stock, saves primary product with setDoc merge:true, and deletes duplicates from both shops/{shopId}/products and root collections', async () => {
    const primary = makeProduct({ id: 'prod-keeper', currentStock: 25, barcode: '' });
    const dup1 = makeProduct({ id: 'prod-dup-1', currentStock: 12, barcode: '8901262010014' });
    const dup2 = makeProduct({ id: 'prod-dup-2', currentStock: 8, barcode: '8901262010014' });

    mockProductsStore.set(primary.id, primary);
    mockProductsStore.set(dup1.id, dup1);
    mockProductsStore.set(dup2.id, dup2);

    const { AppRepository } = await import('../src/storage/repositories.ts');
    const res = await AppRepository.products.mergeDuplicates(shopId, primary, [dup1, dup2]);

    expect(res.primary.currentStock).toBe(45);
    expect(res.primary.barcode).toBe('8901262010014');
    expect(res.deletedIds).toEqual(['prod-dup-1', 'prod-dup-2']);
    expect(mockProductsStore.has('prod-keeper')).toBe(true);
    expect(mockProductsStore.has('prod-dup-1')).toBe(false);
    expect(mockProductsStore.has('prod-dup-2')).toBe(false);

    // Primary product saved to Cloud Firestore with { merge: true }
    const setDocPaths = setDocMock.mock.calls.map(c => ({ path: c[0]?.path, opts: c[2], stock: c[1]?.currentStock }));
    expect(setDocPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'products/prod-keeper', opts: { merge: true }, stock: 45 }),
        expect.objectContaining({ path: 'inventory/prod-keeper', opts: { merge: true }, stock: 45 }),
        expect.objectContaining({ path: `shops/${shopId}/products/prod-keeper`, opts: { merge: true }, stock: 45 })
      ])
    );

    // Duplicates permanently deleted from both root collections and shops/{shopId}/products
    const deletedPaths = deleteDocMock.mock.calls.map(c => c[0]?.path);
    expect(deletedPaths).toContain('products/prod-dup-1');
    expect(deletedPaths).toContain('inventory/prod-dup-1');
    expect(deletedPaths).toContain(`shops/${shopId}/products/prod-dup-1`);
    expect(deletedPaths).toContain(`shops/${shopId}/inventory/prod-dup-1`);
    expect(deletedPaths).toContain('products/prod-dup-2');
    expect(deletedPaths).toContain('inventory/prod-dup-2');
    expect(deletedPaths).toContain(`shops/${shopId}/products/prod-dup-2`);
    expect(deletedPaths).toContain(`shops/${shopId}/inventory/prod-dup-2`);
  });

  it('prevents syncPreFilledCatalog from re-inserting merged products when matched by normalized name or barcode or deleted ID', async () => {
    // User kept a custom-ID item matching seed item by normalized name & formatted barcode, and deleted seed ID 'prod-shop-amul-001-002'
    const keeperByNormalizedMatch = makeProduct({
      id: 'prod-custom-taaza',
      name: 'Amul Taaza Toned Milk 500 ml',
      barcode: '8901262-010014',
      sku: 'CUSTOM-TZ',
      currentStock: 60
    });
    mockProductsStore.set(keeperByNormalizedMatch.id, keeperByNormalizedMatch);
    mockDeletedProductIds.add(`prod-${shopId}-002`);

    const { AppRepository } = await import('../src/storage/repositories.ts');
    await AppRepository.products.syncPreFilledCatalog(shopId);

    // Must NOT insert duplicate for Taaza 500ml (matched by normalized barcode + normalized name)
    const allRemaining = Array.from(mockProductsStore.values());
    const taazaMatches = allRemaining.filter(p => p.barcode.replace(/[-\s]/g, '') === '8901262010014');
    expect(taazaMatches).toHaveLength(1);
    expect(taazaMatches[0].id).toBe('prod-custom-taaza');

    // Must NOT resurrect deleted seed item 'prod-shop-amul-001-002'
    expect(mockProductsStore.has(`prod-${shopId}-002`)).toBe(false);
  });

  it('prevents startShopRealtimeSync from recreating merged/deleted duplicates and cleans up stale cloud copies', async () => {
    const primary = makeProduct({ id: 'prod-keeper', currentStock: 50, updatedAt: '2026-11-10T10:00:00Z' });
    const staleDuplicate = makeProduct({ id: 'prod-dup-stale', currentStock: 10, updatedAt: '2026-11-09T10:00:00Z' });

    mockProductsStore.set(primary.id, primary);
    mockDeletedProductIds.add(staleDuplicate.id);

    const { startShopRealtimeSync } = await import('../src/storage/firestoreSync.ts');
    const onRemoteChange = vi.fn();
    const sync = startShopRealtimeSync(shopId, onRemoteChange);

    // Flush microtask queue so ensureAnonymousAuth().then(...) registers snapshot listeners
    await new Promise(resolve => setTimeout(resolve, 10));

    const prodListener = snapshotListeners.find(l => l.col === 'products');
    expect(prodListener).toBeDefined();

    // Simulate Firestore snapshot firing with stale deleted duplicate AND stale older primary doc
    await prodListener!.cb({
      docChanges: () => [
        {
          type: 'added',
          doc: { id: staleDuplicate.id, data: () => staleDuplicate }
        },
        {
          type: 'modified',
          doc: { id: primary.id, data: () => ({ ...primary, currentStock: 15, updatedAt: '2026-11-08T10:00:00Z' }) }
        }
      ]
    });

    // Deleted duplicate must stay absent locally and trigger cloud cleanup
    expect(mockProductsStore.has(staleDuplicate.id)).toBe(false);
    expect(deleteDocMock.mock.calls.some(c => c[0]?.path === `products/${staleDuplicate.id}`)).toBe(true);
    // Newer merged primary stock (50) must not be overwritten by older snapshot (15)
    expect(mockProductsStore.get(primary.id)?.currentStock).toBe(50);

    sync.unsubscribeAll();
  });

  it('verifies firestore.rules permits product and inventory deletion on both root and shops/{shopId} subcollections', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    expect(rulesContent).toContain('match /products/{productId}');
    expect(rulesContent).toContain('match /inventory/{productId}');
    // Ensure root /products and /inventory no longer use `allow write` (which blocks deletes when request.resource == null)
    const rootProductsSection = rulesContent.slice(
      rulesContent.indexOf('// 2. Inventory / Products Collections'),
      rulesContent.indexOf('// 3. Sales & Bills Collection')
    );
    expect(rootProductsSection).toContain('allow create, update:');
    expect(rootProductsSection).toContain('allow delete:');
    expect(rootProductsSection).not.toContain('allow write:');
  });
});
