/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloud Firestore Real-Time Bi-Directional Synchronizer
 * Syncs bills, inventory products, shop profiles, expenses, and bank entries.
 * Enforces strict multi-shop tenant isolation by always including and filtering by `shopId`.
 */

import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot, 
  getDoc,
  getDocs,
  Unsubscribe 
} from 'firebase/firestore';
import { db, ensureAnonymousAuth, reconnectFirestoreCloud } from './firebase.ts';
import { Product, SaleBill, Shop, Expense, BankEntry, PurchaseBill, Supplier, SupplierPayment } from '../types/index.ts';
import * as localDb from './db.ts';

function isFirebasePermissionError(err: unknown): boolean {
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

function handleFirestoreListenerError(label: string, err: unknown): void {
  if (isFirebasePermissionError(err)) {
    // Gracefully fall back to local IndexedDB when auth/rules reject remote listener
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[Firestore] ${label} listener notice:`, msg);
}

// Clean object helper to ensure Firestore doesn't reject undefined values
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// ============================================================
// 1. OUTGOING SYNC: Push Local Mutations to Cloud Firestore
// ============================================================

export async function syncShopToCloud(shop: Shop): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const shopRef = doc(db, 'shops', shop.id);
    await setDoc(shopRef, sanitizeForFirestore({
      ...shop,
      shopId: shop.id,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync shop to cloud:', err);
  }
}

export async function deleteShopFromCloud(shopId: string): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const shopRef = doc(db, 'shops', shopId);
    await deleteDoc(shopRef);
  } catch (err) {
    console.warn('[Firestore] Failed to delete shop from cloud:', err);
  }
}

export async function syncProductToCloud(product: Product): Promise<void> {
  try {
    if (!product.shopId) return;
    await ensureAnonymousAuth();
    const payload = sanitizeForFirestore({
      ...product,
      shopId: product.shopId,
      updatedAt: product.updatedAt || new Date().toISOString()
    });
    const prodRef = doc(db, 'products', product.id);
    const invRef = doc(db, 'inventory', product.id);
    const shopProdRef = doc(db, 'shops', product.shopId, 'products', product.id);
    const results = await Promise.allSettled([
      setDoc(prodRef, payload, { merge: true }),
      setDoc(invRef, payload, { merge: true }),
      setDoc(shopProdRef, payload, { merge: true })
    ]);
    const failed = results.find(r => r.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      console.warn('[Firestore] Partial notice syncing product/inventory to cloud:', failed.reason);
    }
  } catch (err) {
    console.warn('[Firestore] Failed to sync product/inventory to cloud:', err);
  }
}

export async function deleteProductFromCloud(productId: string, shopId?: string): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const deleteTasks: Promise<void>[] = [
      deleteDoc(doc(db, 'products', productId)),
      deleteDoc(doc(db, 'inventory', productId))
    ];
    if (shopId) {
      deleteTasks.push(deleteDoc(doc(db, 'shops', shopId, 'products', productId)));
      deleteTasks.push(deleteDoc(doc(db, 'shops', shopId, 'inventory', productId)));
    }
    const results = await Promise.allSettled(deleteTasks);
    const failed = results.find(r => r.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      console.warn('[Firestore] Partial notice deleting product/inventory from cloud:', failed.reason);
    }
  } catch (err) {
    console.warn('[Firestore] Failed to delete product/inventory from cloud:', err);
  }
}


export async function syncSaleBillToCloud(bill: SaleBill): Promise<void> {
  try {
    if (!bill.shopId) return;
    await ensureAnonymousAuth();
    const saleRef = doc(db, 'sales', bill.id);
    await setDoc(saleRef, sanitizeForFirestore({
      ...bill,
      shopId: bill.shopId,
      syncedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync sale bill to cloud:', err);
  }
}

export async function syncExpenseToCloud(expense: Expense): Promise<void> {
  try {
    if (!expense.shopId) return;
    await ensureAnonymousAuth();
    const expRef = doc(db, 'expenses', expense.id);
    await setDoc(expRef, sanitizeForFirestore({
      ...expense,
      shopId: expense.shopId,
      syncedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync expense to cloud:', err);
  }
}

export async function syncBankEntryToCloud(entry: BankEntry): Promise<void> {
  try {
    if (!entry.shopId) return;
    await ensureAnonymousAuth();
    const bankRef = doc(db, 'bankEntries', entry.id);
    await setDoc(bankRef, sanitizeForFirestore({
      ...entry,
      shopId: entry.shopId,
      syncedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync bank entry to cloud:', err);
  }
}

export async function syncPurchaseBillToCloud(purchase: PurchaseBill): Promise<void> {
  try {
    if (!purchase.shopId) return;
    await ensureAnonymousAuth();
    const payload = sanitizeForFirestore({
      ...purchase,
      shopId: purchase.shopId,
      agencyName: purchase.agencyName || purchase.supplierName,
      billNumber: purchase.billNumber || purchase.purchaseInvoiceNumber,
      syncedAt: new Date().toISOString()
    });
    const purRef = doc(db, 'purchases', purchase.id);
    const shopPurRef = doc(db, 'shops', purchase.shopId, 'purchases', purchase.id);
    const results = await Promise.allSettled([
      setDoc(purRef, payload, { merge: true }),
      setDoc(shopPurRef, payload, { merge: true })
    ]);
    const failed = results.find(r => r.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      console.warn('[Firestore] Partial notice syncing purchase bill to cloud:', failed.reason);
    }
  } catch (err) {
    console.warn('[Firestore] Failed to sync purchase bill to cloud:', err);
  }
}

export async function deletePurchaseBillFromCloud(purchaseId: string, shopId?: string): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const deleteTasks: Promise<void>[] = [
      deleteDoc(doc(db, 'purchases', purchaseId))
    ];
    if (shopId) {
      deleteTasks.push(deleteDoc(doc(db, 'shops', shopId, 'purchases', purchaseId)));
    }
    const results = await Promise.allSettled(deleteTasks);
    const failed = results.find(r => r.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      console.warn('[Firestore] Partial notice deleting purchase bill from cloud:', failed.reason);
    }
  } catch (err) {
    console.warn('[Firestore] Failed to delete purchase bill from cloud:', err);
  }
}

export async function syncSupplierToCloud(supplier: Supplier): Promise<void> {
  try {
    if (!supplier.shopId) return;
    await ensureAnonymousAuth();
    const supRef = doc(db, 'suppliers', supplier.id);
    await setDoc(supRef, sanitizeForFirestore({
      ...supplier,
      shopId: supplier.shopId,
      agencyName: supplier.companyName || supplier.name,
      syncedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync supplier to cloud:', err);
  }
}

export async function deleteSupplierFromCloud(supplierId: string, shopId?: string): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const deleteTasks: Promise<void>[] = [
      deleteDoc(doc(db, 'suppliers', supplierId))
    ];
    if (shopId) {
      deleteTasks.push(deleteDoc(doc(db, 'shops', shopId, 'suppliers', supplierId)));
    }
    const results = await Promise.allSettled(deleteTasks);
    const failed = results.find(r => r.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      console.warn('[Firestore] Partial notice deleting supplier from cloud:', failed.reason);
    }
  } catch (err) {
    console.warn('[Firestore] Failed to delete supplier from cloud:', err);
  }
}

export async function fetchPurchasesFromCloud(shopId: string): Promise<PurchaseBill[]> {
  try {
    const authOk = await ensureAnonymousAuth();
    if (authOk === false) return [];
    const deletedIds = await localDb.loadDeletedPurchaseIds();
    const rootQuery = query(collection(db, 'purchases'), where('shopId', '==', shopId));
    const subCol = collection(db, 'shops', shopId, 'purchases');
    const [rootRes, subRes] = await Promise.allSettled([getDocs(rootQuery), getDocs(subCol)]);

    const byId = new Map<string, PurchaseBill>();
    const collectSnapshot = (snap: Awaited<ReturnType<typeof getDocs>>) => {
      snap.forEach(docSnap => {
        const data = docSnap.data() as PurchaseBill;
        const resolvedId = data.id || docSnap.id;
        if (deletedIds.has(resolvedId) || deletedIds.has(docSnap.id)) {
          deletePurchaseBillFromCloud(docSnap.id, shopId).catch(() => {});
          return;
        }
        const normalized: PurchaseBill = {
          ...data,
          id: resolvedId,
          shopId: data.shopId || shopId,
          agencyName: data.agencyName || data.supplierName,
          billNumber: data.billNumber || data.purchaseInvoiceNumber
        };
        const existing = byId.get(resolvedId);
        if (
          !existing ||
          (normalized.updatedAt &&
            (!existing.updatedAt || new Date(normalized.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()))
        ) {
          byId.set(resolvedId, normalized);
        }
      });
    };

    if (rootRes.status === 'fulfilled') collectSnapshot(rootRes.value);
    if (subRes.status === 'fulfilled') collectSnapshot(subRes.value);

    return Array.from(byId.values());
  } catch (err) {
    console.warn('[Firestore] Failed to fetch purchases from cloud:', err);
    return [];
  }
}

export async function fetchSuppliersFromCloud(shopId: string): Promise<Supplier[]> {
  try {
    const authOk = await ensureAnonymousAuth();
    if (authOk === false) return [];
    const deletedIds = await localDb.loadDeletedSupplierIds();
    const rootQuery = query(collection(db, 'suppliers'), where('shopId', '==', shopId));
    const subCol = collection(db, 'shops', shopId, 'suppliers');
    const [rootRes, subRes] = await Promise.allSettled([getDocs(rootQuery), getDocs(subCol)]);

    const byId = new Map<string, Supplier>();
    const collectSnapshot = (snap: Awaited<ReturnType<typeof getDocs>>) => {
      snap.forEach(docSnap => {
        const data = docSnap.data() as Supplier;
        const resolvedId = data.id || docSnap.id;
        if (deletedIds.has(resolvedId) || deletedIds.has(docSnap.id)) {
          deleteSupplierFromCloud(docSnap.id, shopId).catch(() => {});
          return;
        }
        byId.set(resolvedId, {
          ...data,
          id: resolvedId,
          shopId: data.shopId || shopId
        });
      });
    };

    if (rootRes.status === 'fulfilled') collectSnapshot(rootRes.value);
    if (subRes.status === 'fulfilled') collectSnapshot(subRes.value);

    return Array.from(byId.values());
  } catch (err) {
    console.warn('[Firestore] Failed to fetch suppliers from cloud:', err);
    return [];
  }
}

export interface CloudShopSyncSummary {
  shopId: string;
  shopSynced: boolean;
  products: number;
  purchases: number;
  sales: number;
  suppliers: number;
  expenses: number;
  bankEntries: number;
  khata: number;
  totalRecords: number;
  syncedAt: string;
  authOk: boolean;
}

/**
 * Performs a read-only full Cloud Firestore fetch for a single shop across all original
 * top-level collections and shop subcollections (`shops/{shopId}`, `purchases`, `sales`,
 * `bills`, `products`, `inventory`, `suppliers`, `khata`, `expenses`, `bankEntries`),
 * hydrating local IndexedDB idempotently without ever modifying or deleting Firestore documents.
 */
export async function syncAllShopDataFromCloud(
  shopOrId: Shop | string,
  options?: { forceReconnect?: boolean }
): Promise<CloudShopSyncSummary> {
  const syncedAt = new Date().toISOString();
  const baseShopId = typeof shopOrId === 'string' ? shopOrId : shopOrId.id;
  const emptySummary: CloudShopSyncSummary = {
    shopId: baseShopId,
    shopSynced: false,
    products: 0,
    purchases: 0,
    sales: 0,
    suppliers: 0,
    expenses: 0,
    bankEntries: 0,
    khata: 0,
    totalRecords: 0,
    syncedAt,
    authOk: false
  };

  if (!baseShopId) return emptySummary;

  try {
    const authOk = options?.forceReconnect
      ? await reconnectFirestoreCloud()
      : await ensureAnonymousAuth();
    if (authOk === false) {
      return emptySummary;
    }

    const [deletedProducts, deletedSuppliers, deletedPurchases] = await Promise.all([
      localDb.loadDeletedProductIds().catch(() => new Set<string>()),
      localDb.loadDeletedSupplierIds().catch(() => new Set<string>()),
      localDb.loadDeletedPurchaseIds().catch(() => new Set<string>())
    ]);

    // Resolve shop metadata (for optional shopCode / shopMobile fallback queries)
    let resolvedShop: Shop | null = typeof shopOrId === 'string' ? null : shopOrId;
    let shopSynced = false;

    try {
      const shopSnap = await getDoc(doc(db, 'shops', baseShopId));
      if (shopSnap.exists()) {
        resolvedShop = normalizeRemoteShop(shopSnap.data() as Record<string, any>, shopSnap.id);
        if (typeof localDb.saveShop === 'function') {
          await localDb.saveShop(resolvedShop).catch(() => {});
        }
        shopSynced = true;
      }
    } catch {
      // ignore read failure and fall back to passed/local shop metadata
    }

    if (!resolvedShop && typeof localDb.getShopById === 'function') {
      resolvedShop = (await localDb.getShopById(baseShopId).catch(() => null)) || null;
    }

    const shopId = resolvedShop?.id || baseShopId;
    const altShopCodes = new Set<string>();
    if (resolvedShop?.shopCode && resolvedShop.shopCode.trim() && resolvedShop.shopCode.trim() !== shopId) {
      altShopCodes.add(resolvedShop.shopCode.trim());
    }
    const mobileVariants = new Set<string>();
    const rawPhone = String(resolvedShop?.phone || '').trim();
    if (rawPhone) {
      mobileVariants.add(rawPhone);
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length >= 10) {
        const last10 = digits.slice(-10);
        mobileVariants.add(last10);
        mobileVariants.add(`+91 ${last10}`);
        mobileVariants.add(`+91${last10}`);
      }
    }

    // Build all original path queries (read-only)
    const purchaseQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'purchases'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'purchases'))
    ];
    const saleQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'sales'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'sales')),
      getDocs(collection(db, 'shops', shopId, 'bills')),
      getDocs(query(collection(db, 'bills'), where('shopId', '==', shopId)))
    ];
    for (const code of altShopCodes) {
      purchaseQueries.push(getDocs(query(collection(db, 'purchases'), where('shopId', '==', code))));
      saleQueries.push(getDocs(query(collection(db, 'sales'), where('shopId', '==', code))));
    }
    for (const mobile of mobileVariants) {
      purchaseQueries.push(getDocs(query(collection(db, 'purchases'), where('shopMobile', '==', mobile))));
      saleQueries.push(getDocs(query(collection(db, 'sales'), where('shopMobile', '==', mobile))));
    }

    const productQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'products'), where('shopId', '==', shopId))),
      getDocs(query(collection(db, 'inventory'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'products')),
      getDocs(collection(db, 'shops', shopId, 'inventory'))
    ];

    const supplierQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'suppliers'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'suppliers'))
    ];

    const khataQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(collection(db, 'shops', shopId, 'khata'))
    ];

    const expenseQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'expenses'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'expenses'))
    ];

    const bankQueries: Array<Promise<Awaited<ReturnType<typeof getDocs>>>> = [
      getDocs(query(collection(db, 'bankEntries'), where('shopId', '==', shopId))),
      getDocs(collection(db, 'shops', shopId, 'bankEntries'))
    ];

    const [
      purchaseResults,
      saleResults,
      productResults,
      supplierResults,
      khataResults,
      expenseResults,
      bankResults
    ] = await Promise.all([
      Promise.allSettled(purchaseQueries),
      Promise.allSettled(saleQueries),
      Promise.allSettled(productQueries),
      Promise.allSettled(supplierQueries),
      Promise.allSettled(khataQueries),
      Promise.allSettled(expenseQueries),
      Promise.allSettled(bankQueries)
    ]);

    const pickNewer = <T extends Record<string, any>>(existing: T | undefined, candidate: T): T => {
      if (!existing) return candidate;
      const eStamp = existing.updatedAt || existing.createdAt || existing.timestamp;
      const cStamp = candidate.updatedAt || candidate.createdAt || candidate.timestamp;
      const eTime = eStamp ? new Date(eStamp).getTime() : 0;
      const cTime = cStamp ? new Date(cStamp).getTime() : 0;
      return cTime >= eTime ? candidate : existing;
    };

    // 1. Hydrate Purchases
    const purchaseMap = new Map<string, PurchaseBill>();
    for (const res of purchaseResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as PurchaseBill;
        const resolvedId = raw.id || docSnap.id;
        if (deletedPurchases.has(resolvedId) || deletedPurchases.has(docSnap.id)) return;
        const normalized: PurchaseBill = {
          ...raw,
          id: resolvedId,
          shopId,
          supplierName: raw.supplierName || raw.agencyName || 'Supplier',
          agencyName: raw.agencyName || raw.supplierName || 'Supplier',
          purchaseInvoiceNumber: raw.purchaseInvoiceNumber || raw.billNumber || resolvedId,
          billNumber: raw.billNumber || raw.purchaseInvoiceNumber || resolvedId,
          items: Array.isArray(raw.items) ? raw.items : []
        };
        purchaseMap.set(resolvedId, pickNewer(purchaseMap.get(resolvedId), normalized));
      });
    }
    if (purchaseMap.size > 0 && typeof localDb.savePurchaseBill === 'function') {
      await Promise.allSettled(Array.from(purchaseMap.values()).map((p) => localDb.savePurchaseBill(p)));
    }

    // 2. Hydrate Sales / Bills
    const saleMap = new Map<string, SaleBill>();
    for (const res of saleResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as SaleBill;
        const resolvedId = raw.id || docSnap.id;
        const normalized: SaleBill = {
          ...raw,
          id: resolvedId,
          shopId,
          billNumber: raw.billNumber || resolvedId,
          items: Array.isArray(raw.items) ? raw.items : []
        };
        saleMap.set(resolvedId, pickNewer(saleMap.get(resolvedId), normalized));
      });
    }
    if (saleMap.size > 0 && typeof localDb.saveSaleBillFromCloud === 'function') {
      await Promise.allSettled(Array.from(saleMap.values()).map((s) => localDb.saveSaleBillFromCloud(s)));
    }

    // 3. Hydrate Products / Inventory
    const productMap = new Map<string, Product>();
    for (const res of productResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as Product;
        const resolvedId = raw.id || docSnap.id;
        if (deletedProducts.has(resolvedId) || deletedProducts.has(docSnap.id)) return;
        const normalized: Product = {
          ...raw,
          id: resolvedId,
          shopId
        };
        productMap.set(resolvedId, pickNewer(productMap.get(resolvedId), normalized));
      });
    }
    if (productMap.size > 0 && typeof localDb.saveProduct === 'function') {
      await Promise.allSettled(Array.from(productMap.values()).map((p) => localDb.saveProduct(p)));
    }

    // 4. Hydrate Suppliers
    const supplierMap = new Map<string, Supplier>();
    for (const res of supplierResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as Supplier;
        const resolvedId = raw.id || docSnap.id;
        if (deletedSuppliers.has(resolvedId) || deletedSuppliers.has(docSnap.id)) return;
        const normalized: Supplier = {
          ...raw,
          id: resolvedId,
          shopId
        };
        supplierMap.set(resolvedId, pickNewer(supplierMap.get(resolvedId), normalized));
      });
    }
    if (supplierMap.size > 0 && typeof localDb.saveSupplier === 'function') {
      await Promise.allSettled(Array.from(supplierMap.values()).map((s) => localDb.saveSupplier(s)));
    }

    // 5. Hydrate Khata / Supplier Payments
    const khataMap = new Map<string, SupplierPayment>();
    for (const res of khataResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as SupplierPayment;
        const resolvedId = raw.id || docSnap.id;
        const normalized: SupplierPayment = {
          ...raw,
          id: resolvedId,
          shopId
        };
        khataMap.set(resolvedId, normalized);
      });
    }
    if (khataMap.size > 0 && typeof localDb.saveSupplierPaymentFromCloud === 'function') {
      await Promise.allSettled(Array.from(khataMap.values()).map((k) => localDb.saveSupplierPaymentFromCloud(k)));
    }

    // 6. Hydrate Expenses
    const expenseMap = new Map<string, Expense>();
    for (const res of expenseResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as Expense;
        const resolvedId = raw.id || docSnap.id;
        const normalized: Expense = {
          ...raw,
          id: resolvedId,
          shopId
        };
        expenseMap.set(resolvedId, normalized);
      });
    }
    if (expenseMap.size > 0 && typeof localDb.saveExpenseFromCloud === 'function') {
      await Promise.allSettled(Array.from(expenseMap.values()).map((e) => localDb.saveExpenseFromCloud(e)));
    }

    // 7. Hydrate Bank Entries
    const bankMap = new Map<string, BankEntry>();
    for (const res of bankResults) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as BankEntry;
        const resolvedId = raw.id || docSnap.id;
        const normalized: BankEntry = {
          ...raw,
          id: resolvedId,
          shopId
        };
        bankMap.set(resolvedId, normalized);
      });
    }
    if (bankMap.size > 0 && typeof localDb.saveBankEntry === 'function') {
      await Promise.allSettled(Array.from(bankMap.values()).map((b) => localDb.saveBankEntry(b)));
    }

    const totalRecords =
      productMap.size +
      purchaseMap.size +
      saleMap.size +
      supplierMap.size +
      expenseMap.size +
      bankMap.size +
      khataMap.size;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(`amul_last_cloud_sync_${shopId}`, syncedAt);
      } catch {
        // ignore storage quota errors
      }
    }

    return {
      shopId,
      shopSynced,
      products: productMap.size,
      purchases: purchaseMap.size,
      sales: saleMap.size,
      suppliers: supplierMap.size,
      expenses: expenseMap.size,
      bankEntries: bankMap.size,
      khata: khataMap.size,
      totalRecords,
      syncedAt,
      authOk: true
    };
  } catch (err) {
    console.warn('[Firestore] Full shop cloud sync notice:', err);
    return emptySummary;
  }
}

// ============================================================
// 2. INCOMING SYNC: Real-Time onSnapshot Listeners
// ============================================================

export interface ShopSyncListeners {
  unsubscribeAll: () => void;
}

/**
 * Attaches real-time Firestore listeners scoped strictly to `currentShopId`.
 * Delays mounting or executing Firestore data listeners until the anonymous auth promise resolves
 * so request.auth is guaranteed to be non-null and valid.
 * Updates local IndexedDB when changes occur on remote devices.
 */
export function startShopRealtimeSync(
  shopId: string,
  onRemoteChange?: () => void,
  shopHints?: Shop
): ShopSyncListeners {
  const unsubscribers: Unsubscribe[] = [];
  let isCancelled = false;

  // Await silent anonymous auth and load deletion tombstones before mounting Firestore snapshot listeners
  ensureAnonymousAuth().then(async (authOk) => {
    if (isCancelled) return;
    await Promise.all([
      localDb.loadDeletedProductIds(),
      localDb.loadDeletedSupplierIds(),
      localDb.loadDeletedPurchaseIds()
    ]);
    if (isCancelled) return;

    const handleRemoteProductUpsert = async (prod: Product, docId: string): Promise<boolean> => {
      if (!prod || (!prod.id && !docId)) return false;
      const resolvedId = prod.id || docId;
      if (localDb.isProductDeleted(resolvedId) || localDb.isProductDeleted(docId)) {
        deleteProductFromCloud(docId, shopId).catch(() => {});
        return false;
      }
      try {
        const existingLocal = await localDb.getProductById(resolvedId);
        if (
          existingLocal?.updatedAt &&
          prod.updatedAt &&
          new Date(existingLocal.updatedAt).getTime() > new Date(prod.updatedAt).getTime()
        ) {
          return false;
        }
        await localDb.saveProduct({ ...prod, id: resolvedId, shopId: prod.shopId || shopId });
        return true;
      } catch {
        return false;
      }
    };

    const handleRemoteSaleUpsert = async (sale: SaleBill, docId: string): Promise<boolean> => {
      try {
        const resolvedId = sale.id || docId;
        await localDb.saveSaleBillFromCloud({
          ...sale,
          id: resolvedId,
          shopId: sale.shopId || shopId
        });
        return true;
      } catch {
        return false;
      }
    };

    try {
      // 1. Listen for Shop Document Updates (e.g. Plan Renewal, Admin Reactivation, Profile Changes)
      const shopRef = doc(db, 'shops', shopId);
      const unsubShop = onSnapshot(shopRef, async (snap) => {
        if (snap.exists()) {
          const remoteShop = normalizeRemoteShop(snap.data() as Record<string, any>, snap.id);
          try {
            await localDb.saveShop(remoteShop);
            if (onRemoteChange) onRemoteChange();
          } catch (e) {
            console.warn('[Firestore Sync] Failed to update local shop:', e);
          }
        }
      }, (err) => handleFirestoreListenerError('Shop', err));
      unsubscribers.push(unsubShop);

      // Delay authenticated-only multi-tenant listeners if Firebase Auth session is not active
      if (authOk === false) {
        return;
      }

      // Immediately pull historical shop records across all original collections & subcollections
      syncAllShopDataFromCloud(shopHints || shopId)
        .then((summary) => {
          if (!isCancelled && (summary.totalRecords > 0 || summary.shopSynced) && onRemoteChange) {
            onRemoteChange();
          }
        })
        .catch(() => {});

      // 2. Listen for Product Updates (Strictly where shopId == currentShopId)
      const productsQuery = query(collection(db, 'products'), where('shopId', '==', shopId));
      const unsubProducts = onSnapshot(productsQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const prod = change.doc.data() as Product;
            if (await handleRemoteProductUpsert(prod, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteProduct(change.doc.id, shopId);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Products', err));
      unsubscribers.push(unsubProducts);

      // 2b. Listen for Inventory Collection Updates (Strictly where shopId == currentShopId)
      const inventoryQuery = query(collection(db, 'inventory'), where('shopId', '==', shopId));
      const unsubInventory = onSnapshot(inventoryQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const item = change.doc.data() as Product;
            if (await handleRemoteProductUpsert(item, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteProduct(change.doc.id, shopId);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Inventory', err));
      unsubscribers.push(unsubInventory);

      // 2c. Listen for Shop Subcollection Products & Inventory (shops/{shopId}/products, shops/{shopId}/inventory)
      const shopProductsCol = collection(db, 'shops', shopId, 'products');
      const unsubShopProducts = onSnapshot(shopProductsCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const prod = change.doc.data() as Product;
            if (await handleRemoteProductUpsert({ ...prod, shopId }, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteProduct(change.doc.id, shopId);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop products', err));
      unsubscribers.push(unsubShopProducts);

      const shopInventoryCol = collection(db, 'shops', shopId, 'inventory');
      const unsubShopInventory = onSnapshot(shopInventoryCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const item = change.doc.data() as Product;
            if (await handleRemoteProductUpsert({ ...item, shopId }, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop inventory', err));
      unsubscribers.push(unsubShopInventory);

      // 3. Listen for Sales/Bills Updates (root sales + shops/{shopId}/sales + shops/{shopId}/bills)
      const salesQuery = query(collection(db, 'sales'), where('shopId', '==', shopId));
      const unsubSales = onSnapshot(salesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Sales', err));
      unsubscribers.push(unsubSales);

      const shopSalesCol = collection(db, 'shops', shopId, 'sales');
      const unsubShopSales = onSnapshot(shopSalesCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop sales', err));
      unsubscribers.push(unsubShopSales);

      const shopBillsCol = collection(db, 'shops', shopId, 'bills');
      const unsubShopBills = onSnapshot(shopBillsCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop bills', err));
      unsubscribers.push(unsubShopBills);

      // 4. Listen for Expenses Updates (Strictly where shopId == currentShopId)
      const expensesQuery = query(collection(db, 'expenses'), where('shopId', '==', shopId));
      const unsubExpenses = onSnapshot(expensesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const exp = change.doc.data() as Expense;
            try {
              await localDb.saveExpenseFromCloud({
                ...exp,
                id: exp.id || change.doc.id,
                shopId: exp.shopId || shopId
              });
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Expenses', err));
      unsubscribers.push(unsubExpenses);

      // 5. Listen for Bank Statement Entries (Strictly where shopId == currentShopId)
      const bankQuery = query(collection(db, 'bankEntries'), where('shopId', '==', shopId));
      const unsubBank = onSnapshot(bankQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const entry = change.doc.data() as BankEntry;
            try {
              await localDb.saveBankEntry({
                ...entry,
                id: entry.id || change.doc.id,
                shopId: entry.shopId || shopId
              });
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Bank entries', err));
      unsubscribers.push(unsubBank);

      // 6. Listen for Purchases & Agency Bills (Both root purchases and shops/{shopId}/purchases)
      const handleRemotePurchaseUpsert = async (pur: PurchaseBill, docId: string): Promise<boolean> => {
        const resolvedId = pur.id || docId;
        if (localDb.isPurchaseDeleted(resolvedId) || localDb.isPurchaseDeleted(docId)) {
          return false;
        }
        try {
          await localDb.savePurchaseBill({
            ...pur,
            id: resolvedId,
            shopId: pur.shopId || shopId,
            agencyName: pur.agencyName || pur.supplierName,
            billNumber: pur.billNumber || pur.purchaseInvoiceNumber
          });
          return true;
        } catch {
          return false;
        }
      };

      const purchasesQuery = query(collection(db, 'purchases'), where('shopId', '==', shopId));
      const unsubPurchases = onSnapshot(purchasesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemotePurchaseUpsert(change.doc.data() as PurchaseBill, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deletePurchaseBillRaw(change.doc.id);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Purchases', err));
      unsubscribers.push(unsubPurchases);

      const shopPurchasesCol = collection(db, 'shops', shopId, 'purchases');
      const unsubShopPurchases = onSnapshot(shopPurchasesCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemotePurchaseUpsert(change.doc.data() as PurchaseBill, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deletePurchaseBillRaw(change.doc.id);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop purchases', err));
      unsubscribers.push(unsubShopPurchases);

      // 7. Listen for Suppliers, Agencies & Khata (root suppliers + shops/{shopId}/suppliers + shops/{shopId}/khata)
      const handleRemoteSupplierUpsert = async (sup: Supplier, docId: string): Promise<boolean> => {
        const resolvedId = sup.id || docId;
        if (localDb.isSupplierDeleted(resolvedId) || localDb.isSupplierDeleted(docId)) {
          return false;
        }
        try {
          await localDb.saveSupplier({
            ...sup,
            id: resolvedId,
            shopId: sup.shopId || shopId
          });
          return true;
        } catch {
          return false;
        }
      };

      const suppliersQuery = query(collection(db, 'suppliers'), where('shopId', '==', shopId));
      const unsubSuppliers = onSnapshot(suppliersQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSupplierUpsert(change.doc.data() as Supplier, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteSupplier(change.doc.id, shopId);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Suppliers', err));
      unsubscribers.push(unsubSuppliers);

      const shopSuppliersCol = collection(db, 'shops', shopId, 'suppliers');
      const unsubShopSuppliers = onSnapshot(shopSuppliersCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSupplierUpsert(change.doc.data() as Supplier, change.doc.id)) {
              changed = true;
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteSupplier(change.doc.id, shopId);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop suppliers', err));
      unsubscribers.push(unsubShopSuppliers);

      const shopKhataCol = collection(db, 'shops', shopId, 'khata');
      const unsubShopKhata = onSnapshot(shopKhataCol, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const entry = change.doc.data() as SupplierPayment;
            try {
              await localDb.saveSupplierPaymentFromCloud({
                ...entry,
                id: entry.id || change.doc.id,
                shopId: entry.shopId || shopId
              });
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => handleFirestoreListenerError('Shop khata', err));
      unsubscribers.push(unsubShopKhata);

    } catch (err) {
      if (!isFirebasePermissionError(err)) {
        console.warn('[Firestore] Could not start real-time sync (running offline-first):', err);
      }
    }
  });

  return {
    unsubscribeAll: () => {
      isCancelled = true;
      unsubscribers.forEach(u => {
        try {
          u();
        } catch (e) {
          // ignore
        }
      });
    }
  };
}

const DEMO_SHOP_IDS = new Set(['shop-amul-001', 'shop-amul-002', 'shop-amul-003']);

/**
 * Safely normalizes any Firestore or local shop record so missing optional fields
 * never cause UI filter crashes or drop real registered shops from the Admin table.
 */
export function normalizeRemoteShop(raw: Record<string, any> | undefined, docId: string): Shop {
  const data = raw || {};
  const resolvedId = (data.id && String(data.id).trim()) || (data.shopId && String(data.shopId).trim()) || docId;
  const resolvedCode = (data.shopCode && String(data.shopCode).trim()) || (data.code && String(data.code).trim()) || resolvedId;
  const fallbackIso = new Date().toISOString();

  return {
    ...(data as Shop),
    id: resolvedId,
    shopCode: resolvedCode,
    name: (data.name && String(data.name).trim()) || (data.shopName && String(data.shopName).trim()) || 'Amul Parlour',
    ownerName: data.ownerName ? String(data.ownerName) : '',
    phone: data.phone ? String(data.phone) : '',
    email: data.email ? String(data.email) : '',
    address: data.address ? String(data.address) : '',
    city: data.city ? String(data.city) : '',
    state: data.state ? String(data.state) : 'Gujarat',
    pincode: data.pincode ? String(data.pincode) : '',
    approvalStatus: data.approvalStatus || (data.status === 'suspended' ? 'SUSPENDED' : 'APPROVED'),
    subscriptionPlanId: data.subscriptionPlanId || 'BASIC',
    subscriptionStatus: data.subscriptionStatus || (data.status === 'expired' ? 'EXPIRED' : 'ACTIVE'),
    createdAt: data.createdAt || data.updatedAt || fallbackIso,
    updatedAt: data.updatedAt || data.createdAt || fallbackIso
  };
}

/**
 * Merges real Cloud Firestore shops with local IndexedDB shops so demo seeds
 * (AP-2026-1001..1003) never overwrite or hide real registered shops.
 * Real registered shops always take precedence and appear first.
 */
export function mergeCloudAndLocalShops(remoteShops: Shop[], localShops: Shop[]): Shop[] {
  const byId = new Map<string, Shop>();
  const seenCodes = new Set<string>();

  for (const remote of remoteShops) {
    const normalized = normalizeRemoteShop(remote as any, remote.id);
    byId.set(normalized.id, normalized);
    if (normalized.shopCode) {
      seenCodes.add(normalized.shopCode.trim().toLowerCase());
    }
  }

  for (const local of localShops) {
    const normalized = normalizeRemoteShop(local as any, local.id);
    const codeKey = (normalized.shopCode || '').trim().toLowerCase();
    if (!byId.has(normalized.id) && (!codeKey || !seenCodes.has(codeKey))) {
      byId.set(normalized.id, normalized);
      if (codeKey) {
        seenCodes.add(codeKey);
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aIsDemo = DEMO_SHOP_IDS.has(a.id) ? 1 : 0;
    const bIsDemo = DEMO_SHOP_IDS.has(b.id) ? 1 : 0;
    if (aIsDemo !== bIsDemo) return aIsDemo - bIsDemo;
    return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
  });
}

/**
 * Fetches all registered shops from Cloud Firestore root `shops` collection
 * and persists each record into local IndexedDB without overwriting real shops with demo seeds.
 */
export async function fetchShopsFromCloud(): Promise<Shop[]> {
  try {
    await ensureAnonymousAuth();
    const snapshot = await getDocs(collection(db, 'shops'));
    const remoteShops: Shop[] = [];
    snapshot.forEach((docSnap) => {
      remoteShops.push(normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id));
    });

    if (remoteShops.length > 0 && typeof localDb.saveShop === 'function') {
      await Promise.allSettled(remoteShops.map((shop) => localDb.saveShop(shop)));
    }
    return remoteShops;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch root shops collection:', err);
    return [];
  }
}

/**
 * Fetches a single shop document by ID from Cloud Firestore and syncs it to IndexedDB.
 */
export async function fetchShopByIdFromCloud(shopId: string): Promise<Shop | null> {
  try {
    await ensureAnonymousAuth();
    const snap = await getDoc(doc(db, 'shops', shopId));
    if (!snap.exists()) return null;
    const shop = normalizeRemoteShop(snap.data() as Record<string, any>, snap.id);
    if (typeof localDb.saveShop === 'function') {
      await localDb.saveShop(shop).catch(() => {});
    }
    return shop;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch shop by ID from cloud:', err);
    return null;
  }
}

/**
 * Attaches real-time listener for Master Admin to watch all registered shops
 * in the Cloud Firestore root `shops` collection, sync them into local IndexedDB,
 * and merge cleanly with any local shops without letting demo seeds overwrite real shops.
 */
export function startAdminShopsRealtimeSync(onShopsUpdated: (shops: Shop[]) => void): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let isCancelled = false;

  ensureAnonymousAuth().then(() => {
    if (isCancelled) return;
    try {
      const shopsCol = collection(db, 'shops');
      unsub = onSnapshot(shopsCol, async (snapshot) => {
        if (isCancelled) return;
        const remoteShops: Shop[] = [];
        snapshot.forEach((docSnap) => {
          remoteShops.push(normalizeRemoteShop(docSnap.data() as Record<string, any>, docSnap.id));
        });

        if (remoteShops.length > 0 && typeof localDb.saveShop === 'function') {
          await Promise.allSettled(remoteShops.map((shop) => localDb.saveShop(shop)));
        }

        let localShops: Shop[] = [];
        if (typeof localDb.getAllShops === 'function') {
          try {
            localShops = await localDb.getAllShops();
          } catch {
            localShops = [];
          }
        }

        const merged = mergeCloudAndLocalShops(remoteShops, localShops);
        if (merged.length > 0 || remoteShops.length > 0) {
          onShopsUpdated(merged);
        }
      }, (err) => handleFirestoreListenerError('Admin shops', err));
    } catch (err) {
      if (!isFirebasePermissionError(err)) {
        console.warn('[Firestore] Could not start admin shops listener:', err);
      }
    }
  });

  return () => {
    isCancelled = true;
    if (unsub) {
      try {
        unsub();
      } catch (e) {
        // ignore
      }
    }
  };
}
