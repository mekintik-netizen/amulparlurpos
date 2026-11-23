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
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
  increment,
  Unsubscribe
} from 'firebase/firestore';
import {
  db,
  ensureAnonymousAuth,
  reconnectFirestoreCloud,
  setCloudSyncStatus,
  handleFirestoreError,
  OperationType,
  isTransientNetworkError
} from './firebase.ts';
import {
  Product,
  SaleBill,
  Shop,
  Expense,
  BankEntry,
  PurchaseBill,
  Supplier,
  SupplierPayment,
  StockMovement,
  CrateTransaction,
  CrateSummary,
  DayCloseRecord
} from '../types/index.ts';
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

export const DEFAULT_HISTORY_QUERY_LIMIT = 100;

// Tracks per-shop, per-collection cloud hydration so empty initial states never overwrite Cloud Firestore
const shopLoadedFromCloud = new Map<string, Set<string>>();

export function markShopCollectionLoadedFromCloud(shopId: string, collectionName: string): void {
  if (!shopId || !collectionName) return;
  let set = shopLoadedFromCloud.get(shopId);
  if (!set) {
    set = new Set<string>();
    shopLoadedFromCloud.set(shopId, set);
  }
  set.add(collectionName);
}

export function hasShopLoadedFromCloud(shopId: string, collectionName?: string): boolean {
  if (!shopId) return false;
  const set = shopLoadedFromCloud.get(shopId);
  if (!set) return false;
  if (!collectionName) return set.size > 0;
  return set.has(collectionName);
}

/**
 * Returns true if a Firestore snapshot is an empty local-cache placeholder while server data is still loading.
 * Ignoring these prevents UI screens from flashing empty states before real server data arrives.
 */
export function isEmptyCacheOnlySnapshot(snapshot: {
  empty?: boolean;
  metadata?: { fromCache?: boolean };
}): boolean {
  return Boolean(snapshot?.metadata?.fromCache && snapshot?.empty);
}

function handleFirestoreListenerError(label: string, err: unknown): void {
  if (isFirebasePermissionError(err) || isTransientNetworkError(err)) {
    // Gracefully fall back to local cache when offline, network drops, or rules reject remote listener
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
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      ...bill,
      shopId: bill.shopId,
      syncedAt: nowIso
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'sales', bill.id), payload, { merge: true });
    batch.set(doc(db, 'shops', bill.shopId, 'sales', bill.id), payload, { merge: true });
    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `sales/${bill.id}`, { rethrow: false });
  }
}

/**
 * Atomically persists a new POS SaleBill, decrements sold product stock across Cloud Firestore
 * (`products`, `inventory`, `shops/{shopId}/products`), and syncs any auto-recorded UPI bank entry
 * inside a single Firestore writeBatch.
 */
export async function syncSaleBillAtomicallyToCloud(
  bill: SaleBill,
  updatedProducts: Product[] = [],
  upiBankEntry?: BankEntry | null
): Promise<void> {
  if (!bill.shopId) return;
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);

    const salePayload = sanitizeForFirestore({
      ...bill,
      shopId: bill.shopId,
      syncedAt: nowIso
    });
    batch.set(doc(db, 'sales', bill.id), salePayload, { merge: true });
    batch.set(doc(db, 'shops', bill.shopId, 'sales', bill.id), salePayload, { merge: true });

    const productById = new Map<string, Product>();
    for (const p of updatedProducts) {
      if (p?.id) productById.set(p.id, p);
    }

    for (const item of bill.items || []) {
      if (!item.productId) continue;
      const qty = Number(item.quantity) || 0;
      const latestProd = productById.get(item.productId);
      const stockPayload = latestProd
        ? sanitizeForFirestore({
            ...latestProd,
            shopId: bill.shopId,
            updatedAt: nowIso
          })
        : {
            currentStock: increment(-Math.abs(qty)),
            shopId: bill.shopId,
            updatedAt: nowIso
          };

      batch.set(doc(db, 'products', item.productId), stockPayload, { merge: true });
      batch.set(doc(db, 'inventory', item.productId), stockPayload, { merge: true });
      batch.set(doc(db, 'shops', bill.shopId, 'products', item.productId), stockPayload, { merge: true });
    }

    if (upiBankEntry && upiBankEntry.id) {
      const bankPayload = sanitizeForFirestore({
        ...upiBankEntry,
        shopId: bill.shopId,
        syncedAt: nowIso
      });
      batch.set(doc(db, 'bankEntries', upiBankEntry.id), bankPayload, { merge: true });
      batch.set(doc(db, 'shops', bill.shopId, 'bankEntries', upiBankEntry.id), bankPayload, { merge: true });
    }

    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `sales/${bill.id}`, { rethrow: false });
  }
}

/**
 * Atomically syncs a cancelled SaleBill, restores product stock, and records any UPI reversal entry.
 */
export async function syncSaleCancellationAtomicallyToCloud(
  bill: SaleBill,
  restoredProducts: Product[] = [],
  reversalBankEntry?: BankEntry | null
): Promise<void> {
  if (!bill.shopId) return;
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);

    const salePayload = sanitizeForFirestore({
      ...bill,
      status: 'CANCELLED',
      shopId: bill.shopId,
      syncedAt: nowIso
    });
    batch.set(doc(db, 'sales', bill.id), salePayload, { merge: true });
    batch.set(doc(db, 'shops', bill.shopId, 'sales', bill.id), salePayload, { merge: true });

    const productById = new Map<string, Product>();
    for (const p of restoredProducts) {
      if (p?.id) productById.set(p.id, p);
    }

    for (const item of bill.items || []) {
      if (!item.productId) continue;
      const qty = Number(item.quantity) || 0;
      const latestProd = productById.get(item.productId);
      const stockPayload = latestProd
        ? sanitizeForFirestore({
            ...latestProd,
            shopId: bill.shopId,
            updatedAt: nowIso
          })
        : {
            currentStock: increment(Math.abs(qty)),
            shopId: bill.shopId,
            updatedAt: nowIso
          };

      batch.set(doc(db, 'products', item.productId), stockPayload, { merge: true });
      batch.set(doc(db, 'inventory', item.productId), stockPayload, { merge: true });
      batch.set(doc(db, 'shops', bill.shopId, 'products', item.productId), stockPayload, { merge: true });
    }

    if (reversalBankEntry && reversalBankEntry.id) {
      const revPayload = sanitizeForFirestore({
        ...reversalBankEntry,
        shopId: bill.shopId,
        syncedAt: nowIso
      });
      batch.set(doc(db, 'bankEntries', reversalBankEntry.id), revPayload, { merge: true });
      batch.set(doc(db, 'shops', bill.shopId, 'bankEntries', reversalBankEntry.id), revPayload, { merge: true });
    }

    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `sales/${bill.id}`, { rethrow: false });
  }
}

/**
 * Atomically syncs a StockMovement and updated product stock count to Cloud Firestore.
 */
export async function syncStockMovementAtomicallyToCloud(
  movement: StockMovement,
  updatedProduct?: Product | null
): Promise<void> {
  if (!movement.shopId) return;
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);

    const movPayload = sanitizeForFirestore({
      ...movement,
      shopId: movement.shopId,
      syncedAt: nowIso
    });
    batch.set(doc(db, 'shops', movement.shopId, 'stockMovements', movement.id), movPayload, { merge: true });

    if (updatedProduct && updatedProduct.id) {
      const prodPayload = sanitizeForFirestore({
        ...updatedProduct,
        shopId: movement.shopId,
        updatedAt: nowIso
      });
      batch.set(doc(db, 'products', updatedProduct.id), prodPayload, { merge: true });
      batch.set(doc(db, 'inventory', updatedProduct.id), prodPayload, { merge: true });
      batch.set(doc(db, 'shops', movement.shopId, 'products', updatedProduct.id), prodPayload, { merge: true });
    }

    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shops/${movement.shopId}/stockMovements/${movement.id}`, { rethrow: false });
  }
}

/**
 * Atomically syncs a supplier/agency Khata payment, updated supplier balance, and optional Bank/UPI entry.
 */
export async function syncSupplierPaymentAtomicallyToCloud(
  payment: SupplierPayment,
  updatedSupplier?: Supplier | null,
  bankEntry?: BankEntry | null
): Promise<void> {
  if (!payment.shopId) return;
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);

    const payPayload = sanitizeForFirestore({
      ...payment,
      shopId: payment.shopId,
      syncedAt: nowIso
    });
    batch.set(doc(db, 'shops', payment.shopId, 'khata', payment.id), payPayload, { merge: true });

    if (updatedSupplier && updatedSupplier.id) {
      const supPayload = sanitizeForFirestore({
        ...updatedSupplier,
        shopId: payment.shopId,
        updatedAt: nowIso
      });
      batch.set(doc(db, 'suppliers', updatedSupplier.id), supPayload, { merge: true });
      batch.set(doc(db, 'shops', payment.shopId, 'suppliers', updatedSupplier.id), supPayload, { merge: true });
    }

    if (bankEntry && bankEntry.id) {
      const bankPayload = sanitizeForFirestore({
        ...bankEntry,
        shopId: payment.shopId,
        syncedAt: nowIso
      });
      batch.set(doc(db, 'bankEntries', bankEntry.id), bankPayload, { merge: true });
      batch.set(doc(db, 'shops', payment.shopId, 'bankEntries', bankEntry.id), bankPayload, { merge: true });
    }

    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shops/${payment.shopId}/khata/${payment.id}`, { rethrow: false });
  }
}

export async function syncExpenseToCloud(expense: Expense): Promise<void> {
  try {
    if (!expense.shopId) return;
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      ...expense,
      shopId: expense.shopId,
      syncedAt: nowIso
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'expenses', expense.id), payload, { merge: true });
    batch.set(doc(db, 'shops', expense.shopId, 'expenses', expense.id), payload, { merge: true });
    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `expenses/${expense.id}`, { rethrow: false });
  }
}

export async function deleteExpenseFromCloud(expenseId: string, shopId?: string): Promise<void> {
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const tasks: Promise<void>[] = [deleteDoc(doc(db, 'expenses', expenseId))];
    if (shopId) {
      tasks.push(deleteDoc(doc(db, 'shops', shopId, 'expenses', expenseId)));
    }
    await Promise.allSettled(tasks);
    setCloudSyncStatus('synced', new Date().toISOString());
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseId}`, { rethrow: false });
  }
}

export async function syncBankEntryToCloud(entry: BankEntry): Promise<void> {
  try {
    if (!entry.shopId) return;
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      ...entry,
      shopId: entry.shopId,
      syncedAt: nowIso
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'bankEntries', entry.id), payload, { merge: true });
    batch.set(doc(db, 'shops', entry.shopId, 'bankEntries', entry.id), payload, { merge: true });
    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `bankEntries/${entry.id}`, { rethrow: false });
  }
}

export async function deleteBankEntryFromCloud(entryId: string, shopId?: string): Promise<void> {
  try {
    setCloudSyncStatus('syncing');
    await ensureAnonymousAuth();
    const tasks: Promise<void>[] = [deleteDoc(doc(db, 'bankEntries', entryId))];
    if (shopId) {
      tasks.push(deleteDoc(doc(db, 'shops', shopId, 'bankEntries', entryId)));
    }
    await Promise.allSettled(tasks);
    setCloudSyncStatus('synced', new Date().toISOString());
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `bankEntries/${entryId}`, { rethrow: false });
  }
}

export async function syncPurchaseBillToCloud(purchase: PurchaseBill): Promise<void> {
  try {
    if (!purchase.shopId) return;
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      ...purchase,
      shopId: purchase.shopId,
      agencyName: purchase.agencyName || purchase.supplierName,
      billNumber: purchase.billNumber || purchase.purchaseInvoiceNumber,
      date: purchase.purchaseDate || nowIso.slice(0, 10),
      syncedAt: nowIso
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'purchases', purchase.id), payload, { merge: true });
    batch.set(doc(db, 'shops', purchase.shopId, 'purchases', purchase.id), payload, { merge: true });
    await batch.commit();
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('[Firestore] Failed to sync purchase bill to cloud:', err);
    }
  }
}

/**
 * Atomically persists a multi-item PurchaseBill, all updated product stock documents
 * (`products`, `inventory`, `shops/{shopId}/products`), and the updated supplier balance
 * inside a single Firestore `writeBatch()` (auto-chunked if exceeding Firestore's 500-op limit).
 */
export async function syncPurchaseBillAtomicallyToCloud(
  purchase: PurchaseBill,
  updatedProducts: Product[] = [],
  updatedSupplier?: Supplier | null
): Promise<void> {
  if (!purchase.shopId) return;
  try {
    await ensureAnonymousAuth();
    const nowIso = new Date().toISOString();
    const operations: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any> }> = [];

    const purchasePayload = sanitizeForFirestore({
      ...purchase,
      shopId: purchase.shopId,
      agencyName: purchase.agencyName || purchase.supplierName,
      billNumber: purchase.billNumber || purchase.purchaseInvoiceNumber,
      date: purchase.purchaseDate || nowIso.slice(0, 10),
      syncedAt: nowIso
    });
    operations.push({ ref: doc(db, 'purchases', purchase.id), data: purchasePayload });
    operations.push({ ref: doc(db, 'shops', purchase.shopId, 'purchases', purchase.id), data: purchasePayload });

    const seenProdIds = new Set<string>();
    for (const prod of updatedProducts) {
      if (!prod?.id || seenProdIds.has(prod.id)) continue;
      seenProdIds.add(prod.id);
      const prodPayload = sanitizeForFirestore({
        ...prod,
        shopId: purchase.shopId,
        updatedAt: prod.updatedAt || nowIso
      });
      operations.push({ ref: doc(db, 'products', prod.id), data: prodPayload });
      operations.push({ ref: doc(db, 'inventory', prod.id), data: prodPayload });
      operations.push({ ref: doc(db, 'shops', purchase.shopId, 'products', prod.id), data: prodPayload });
    }

    if (updatedSupplier && updatedSupplier.id) {
      const supPayload = sanitizeForFirestore({
        ...updatedSupplier,
        shopId: purchase.shopId,
        agencyName: updatedSupplier.companyName || updatedSupplier.name,
        syncedAt: nowIso
      });
      operations.push({ ref: doc(db, 'suppliers', updatedSupplier.id), data: supPayload });
      operations.push({ ref: doc(db, 'shops', purchase.shopId, 'suppliers', updatedSupplier.id), data: supPayload });
    }

    const CHUNK_SIZE = 450;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const op of operations.slice(i, i + CHUNK_SIZE)) {
        batch.set(op.ref, op.data, { merge: true });
      }
      await batch.commit();
    }
    setCloudSyncStatus('synced', nowIso);
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `shops/${purchase.shopId}/purchases/${purchase.id}`, {
        rethrow: false
      });
    }
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

export async function fetchPurchasesFromCloud(
  shopId: string,
  limitCount: number = DEFAULT_HISTORY_QUERY_LIMIT
): Promise<PurchaseBill[]> {
  try {
    const authOk = await ensureAnonymousAuth();
    if (authOk === false) return [];
    const deletedIds = await localDb.loadDeletedPurchaseIds();
    const safeLimit = Math.max(10, Math.min(2000, Math.round(limitCount || DEFAULT_HISTORY_QUERY_LIMIT)));

    const buildSubQuery = () => {
      const base = collection(db, 'shops', shopId, 'purchases');
      if (typeof orderBy === 'function' && typeof limit === 'function') {
        return query(base, orderBy('purchaseDate', 'desc'), limit(safeLimit));
      }
      return base;
    };
    const buildRootQuery = () => {
      const base = collection(db, 'purchases');
      if (typeof limit === 'function') {
        return query(base, where('shopId', '==', shopId), limit(safeLimit));
      }
      return query(base, where('shopId', '==', shopId));
    };

    const [rootRes, subRes] = await Promise.allSettled([
      getDocs(buildRootQuery()),
      getDocs(buildSubQuery()).catch(() => getDocs(collection(db, 'shops', shopId, 'purchases')))
    ]);

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

    markShopCollectionLoadedFromCloud(shopId, 'purchases');
    return Array.from(byId.values());
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('[Firestore] Failed to fetch purchases from cloud:', err);
    }
    return [];
  }
}

/**
 * Fetches recent or older paginated Sales bills from Cloud Firestore (`orderBy("date", "desc"), limit(limitCount)`),
 * hydrating IndexedDB idempotently without downloading years of legacy records unnecessarily.
 */
export async function fetchSalesFromCloud(
  shopId: string,
  limitCount: number = DEFAULT_HISTORY_QUERY_LIMIT
): Promise<SaleBill[]> {
  try {
    const authOk = await ensureAnonymousAuth();
    if (authOk === false) return [];
    const safeLimit = Math.max(10, Math.min(2000, Math.round(limitCount || DEFAULT_HISTORY_QUERY_LIMIT)));

    const subSalesCol = collection(db, 'shops', shopId, 'sales');
    const subBillsCol = collection(db, 'shops', shopId, 'bills');
    const subSalesQ =
      typeof orderBy === 'function' && typeof limit === 'function'
        ? query(subSalesCol, orderBy('date', 'desc'), limit(safeLimit))
        : subSalesCol;
    const subBillsQ =
      typeof orderBy === 'function' && typeof limit === 'function'
        ? query(subBillsCol, orderBy('date', 'desc'), limit(safeLimit))
        : subBillsCol;
    const rootSalesQ =
      typeof limit === 'function'
        ? query(collection(db, 'sales'), where('shopId', '==', shopId), limit(safeLimit))
        : query(collection(db, 'sales'), where('shopId', '==', shopId));

    const results = await Promise.allSettled([
      getDocs(rootSalesQ),
      getDocs(subSalesQ).catch(() => getDocs(subSalesCol)),
      getDocs(subBillsQ).catch(() => getDocs(subBillsCol))
    ]);

    const byId = new Map<string, SaleBill>();
    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      res.value.forEach((docSnap) => {
        const raw = docSnap.data() as SaleBill;
        const resolvedId = raw.id || docSnap.id;
        byId.set(resolvedId, {
          ...raw,
          id: resolvedId,
          shopId: raw.shopId || shopId,
          billNumber: raw.billNumber || resolvedId,
          items: Array.isArray(raw.items) ? raw.items : []
        });
      });
    }

    if (byId.size > 0 && typeof localDb.saveSaleBillFromCloud === 'function') {
      await Promise.allSettled(Array.from(byId.values()).map((s) => localDb.saveSaleBillFromCloud(s)));
    }
    markShopCollectionLoadedFromCloud(shopId, 'sales');
    return Array.from(byId.values());
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('[Firestore] Failed to fetch sales from cloud:', err);
    }
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

    setCloudSyncStatus('synced', syncedAt);

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

interface ShopSyncPoolEntry {
  callbacks: Set<() => void>;
  unsubscribers: Unsubscribe[];
  cancelled: boolean;
}

// Reference-counted singleton listener pool per shopId to prevent duplicate onSnapshot leaks across tabs
const activeShopSyncPools = new Map<string, ShopSyncPoolEntry>();

/**
 * Attaches real-time Firestore listeners scoped strictly to `currentShopId`.
 * Multiplexes subscriptions per shopId so mounting multiple views never opens duplicate listeners.
 * Delays mounting or executing Firestore data listeners until the anonymous auth promise resolves
 * so request.auth is guaranteed to be non-null and valid.
 */
export function startShopRealtimeSync(
  shopId: string,
  onRemoteChange?: () => void,
  shopHints?: Shop
): ShopSyncListeners {
  if (!shopId) {
    return { unsubscribeAll: () => {} };
  }

  const existingPool = activeShopSyncPools.get(shopId);
  if (existingPool && !existingPool.cancelled) {
    if (onRemoteChange) {
      existingPool.callbacks.add(onRemoteChange);
    }
    return {
      unsubscribeAll: () => {
        if (onRemoteChange) {
          existingPool.callbacks.delete(onRemoteChange);
        }
        if (existingPool.callbacks.size === 0) {
          existingPool.cancelled = true;
          existingPool.unsubscribers.forEach((u) => {
            try {
              u();
            } catch {
              // ignore
            }
          });
          activeShopSyncPools.delete(shopId);
        }
      }
    };
  }

  const pool: ShopSyncPoolEntry = {
    callbacks: new Set<() => void>(),
    unsubscribers: [],
    cancelled: false
  };
  if (onRemoteChange) {
    pool.callbacks.add(onRemoteChange);
  }
  activeShopSyncPools.set(shopId, pool);

  const notifyAllSubscribers = () => {
    if (pool.cancelled) return;
    setCloudSyncStatus('synced', new Date().toISOString());
    pool.callbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore subscriber errors
      }
    });
  };

  const unsubscribers = pool.unsubscribers;

  // Await silent anonymous auth and load deletion tombstones before mounting Firestore snapshot listeners
  ensureAnonymousAuth().then(async (authOk) => {
    if (pool.cancelled) return;
    await Promise.all([
      localDb.loadDeletedProductIds(),
      localDb.loadDeletedSupplierIds(),
      localDb.loadDeletedPurchaseIds()
    ]);
    if (pool.cancelled) return;

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
      let lastShopSnapshotSignature = '';
      const unsubShop = onSnapshot(shopRef, async (snap) => {
        if (snap.metadata?.fromCache && !snap.exists()) return;
        markShopCollectionLoadedFromCloud(shopId, 'shop');
        if (snap.exists()) {
          const remoteShop = normalizeRemoteShop(snap.data() as Record<string, any>, snap.id);
          const signature = `${remoteShop.updatedAt || ''}|${remoteShop.subscriptionStatus || ''}|${remoteShop.subscriptionPlanId || ''}|${remoteShop.name || ''}|${remoteShop.crateBalance ?? ''}`;
          if (signature === lastShopSnapshotSignature) {
            return;
          }
          lastShopSnapshotSignature = signature;
          try {
            await localDb.saveShop(remoteShop);
            notifyAllSubscribers();
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

      // Perform one-time initial hydration if this shop hasn't loaded from cloud in this session yet
      if (!hasShopLoadedFromCloud(shopId, 'initialFullHydration')) {
        markShopCollectionLoadedFromCloud(shopId, 'initialFullHydration');
        syncAllShopDataFromCloud(shopHints || shopId)
          .then((summary) => {
            if (!pool.cancelled && (summary.totalRecords > 0 || summary.shopSynced)) {
              notifyAllSubscribers();
            }
          })
          .catch(() => {});
      }

      // 2. Listen for Product Updates (Strictly where shopId == currentShopId)
      const productsQuery = query(collection(db, 'products'), where('shopId', '==', shopId));
      const unsubProducts = onSnapshot(productsQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'products');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Products', err));
      unsubscribers.push(unsubProducts);

      // 2b. Listen for Inventory Collection Updates (Strictly where shopId == currentShopId)
      const inventoryQuery = query(collection(db, 'inventory'), where('shopId', '==', shopId));
      const unsubInventory = onSnapshot(inventoryQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'inventory');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Inventory', err));
      unsubscribers.push(unsubInventory);

      // 2c. Listen for Shop Subcollection Products & Inventory (shops/{shopId}/products, shops/{shopId}/inventory)
      const shopProductsCol = collection(db, 'shops', shopId, 'products');
      const unsubShopProducts = onSnapshot(shopProductsCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'products');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop products', err));
      unsubscribers.push(unsubShopProducts);

      const shopInventoryCol = collection(db, 'shops', shopId, 'inventory');
      const unsubShopInventory = onSnapshot(shopInventoryCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'inventory');
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const item = change.doc.data() as Product;
            if (await handleRemoteProductUpsert({ ...item, shopId }, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop inventory', err));
      unsubscribers.push(unsubShopInventory);

      // 3. Listen for Recent Sales/Bills Updates (strictly shopId-scoped & capped at 100 recent docs for Spark quota efficiency)
      const salesQuery =
        typeof limit === 'function'
          ? query(collection(db, 'sales'), where('shopId', '==', shopId), limit(DEFAULT_HISTORY_QUERY_LIMIT))
          : query(collection(db, 'sales'), where('shopId', '==', shopId));
      const unsubSales = onSnapshot(salesQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'sales');
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Sales', err));
      unsubscribers.push(unsubSales);

      const shopSalesCol =
        typeof orderBy === 'function' && typeof limit === 'function'
          ? query(collection(db, 'shops', shopId, 'sales'), orderBy('date', 'desc'), limit(DEFAULT_HISTORY_QUERY_LIMIT))
          : collection(db, 'shops', shopId, 'sales');
      const unsubShopSales = onSnapshot(shopSalesCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'sales');
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop sales', err));
      unsubscribers.push(unsubShopSales);

      const shopBillsCol =
        typeof orderBy === 'function' && typeof limit === 'function'
          ? query(collection(db, 'shops', shopId, 'bills'), orderBy('date', 'desc'), limit(DEFAULT_HISTORY_QUERY_LIMIT))
          : collection(db, 'shops', shopId, 'bills');
      const unsubShopBills = onSnapshot(shopBillsCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'sales');
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            if (await handleRemoteSaleUpsert(change.doc.data() as SaleBill, change.doc.id)) {
              changed = true;
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop bills', err));
      unsubscribers.push(unsubShopBills);

      // 4. Listen for Expenses Updates (including remote deletions)
      const expensesQuery = query(collection(db, 'expenses'), where('shopId', '==', shopId));
      const unsubExpenses = onSnapshot(expensesQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'expenses');
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
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteExpense(change.doc.id);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Expenses', err));
      unsubscribers.push(unsubExpenses);

      // 5. Listen for Bank Statement Entries (including remote deletions)
      const bankQuery = query(collection(db, 'bankEntries'), where('shopId', '==', shopId));
      const unsubBank = onSnapshot(bankQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'bankEntries');
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
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteBankEntry(change.doc.id);
              changed = true;
            } catch {
              // ignore
            }
          }
        }
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Bank entries', err));
      unsubscribers.push(unsubBank);

      // 6. Listen for Recent Purchases & Agency Bills (strictly shopId-scoped & capped at 100 recent docs)
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

      const purchasesQuery =
        typeof limit === 'function'
          ? query(collection(db, 'purchases'), where('shopId', '==', shopId), limit(DEFAULT_HISTORY_QUERY_LIMIT))
          : query(collection(db, 'purchases'), where('shopId', '==', shopId));
      const unsubPurchases = onSnapshot(purchasesQuery, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'purchases');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Purchases', err));
      unsubscribers.push(unsubPurchases);

      const shopPurchasesCol =
        typeof orderBy === 'function' && typeof limit === 'function'
          ? query(collection(db, 'shops', shopId, 'purchases'), orderBy('purchaseDate', 'desc'), limit(DEFAULT_HISTORY_QUERY_LIMIT))
          : collection(db, 'shops', shopId, 'purchases');
      const unsubShopPurchases = onSnapshot(shopPurchasesCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'purchases');
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
        if (changed) {
          notifyAllSubscribers();
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
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'suppliers');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Suppliers', err));
      unsubscribers.push(unsubSuppliers);

      const shopSuppliersCol = collection(db, 'shops', shopId, 'suppliers');
      const unsubShopSuppliers = onSnapshot(shopSuppliersCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'suppliers');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop suppliers', err));
      unsubscribers.push(unsubShopSuppliers);

      const shopKhataCol = collection(db, 'shops', shopId, 'khata');
      const unsubShopKhata = onSnapshot(shopKhataCol, async (snapshot) => {
        if (isEmptyCacheOnlySnapshot(snapshot)) return;
        markShopCollectionLoadedFromCloud(shopId, 'khata');
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
        if (changed) {
          notifyAllSubscribers();
        }
      }, (err) => handleFirestoreListenerError('Shop khata', err));
      unsubscribers.push(unsubShopKhata);

    } catch (err) {
      if (!isFirebasePermissionError(err) && !isTransientNetworkError(err)) {
        console.warn('[Firestore] Could not start real-time sync (running offline-first):', err);
      }
    }
  });

  return {
    unsubscribeAll: () => {
      if (onRemoteChange) {
        pool.callbacks.delete(onRemoteChange);
      }
      if (pool.callbacks.size === 0) {
        pool.cancelled = true;
        unsubscribers.forEach((u) => {
          try {
            u();
          } catch {
            // ignore
          }
        });
        if (activeShopSyncPools.get(shopId) === pool) {
          activeShopSyncPools.delete(shopId);
        }
      }
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
        if (isCancelled || isEmptyCacheOnlySnapshot(snapshot)) return;
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
      } catch {
        // ignore
      }
    }
  };
}

// ============================================================
// 3. DIRECT CLOUD FIRESTORE: CRATE IN/OUT TRACKER & DAY CLOSE
// ============================================================

function computeCrateSummary(transactions: CrateTransaction[]): CrateSummary {
  let totalIn = 0;
  let totalOut = 0;
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime()
  );
  for (const tx of sorted) {
    const qty = Number.isFinite(Number(tx.quantity)) ? Math.max(0, Number(tx.quantity)) : 0;
    if (tx.type === 'IN') totalIn += qty;
    else if (tx.type === 'OUT') totalOut += qty;
  }
  return {
    totalIn,
    totalOut,
    netBalance: totalIn - totalOut,
    transactions: sorted
  };
}

export async function fetchCratesFromCloud(shopId: string): Promise<CrateSummary> {
  if (!shopId) return computeCrateSummary([]);
  try {
    await ensureAnonymousAuth();
    const snap = await getDocs(collection(db, 'shops', shopId, 'crates'));
    const list: CrateTransaction[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as CrateTransaction;
      list.push({
        ...data,
        id: data.id || docSnap.id,
        shopId: data.shopId || shopId
      });
    });
    return computeCrateSummary(list);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `shops/${shopId}/crates`, { rethrow: false });
    return computeCrateSummary([]);
  }
}

export function subscribeToCrates(
  shopId: string,
  onUpdate: (summary: CrateSummary) => void
): Unsubscribe {
  if (!shopId) return () => {};
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  ensureAnonymousAuth().then((authOk) => {
    if (cancelled || authOk === false) return;
    try {
      const colRef = collection(db, 'shops', shopId, 'crates');
      unsub = onSnapshot(
        colRef,
        (snapshot) => {
          if (cancelled || isEmptyCacheOnlySnapshot(snapshot)) return;
          markShopCollectionLoadedFromCloud(shopId, 'crates');
          const list: CrateTransaction[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as CrateTransaction;
            list.push({
              ...data,
              id: data.id || docSnap.id,
              shopId: data.shopId || shopId
            });
          });
          setCloudSyncStatus('synced', new Date().toISOString());
          onUpdate(computeCrateSummary(list));
        },
        (err) => handleFirestoreListenerError('Crates', err)
      );
    } catch (err) {
      handleFirestoreListenerError('Crates', err);
    }
  });

  return () => {
    cancelled = true;
    if (unsub) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
  };
}

export async function recordCrateTransactionToCloud(
  entry: Omit<CrateTransaction, 'id' | 'createdAt'>
): Promise<CrateTransaction> {
  const safeQty = Number.isFinite(Number(entry.quantity)) ? Math.max(1, Math.round(Number(entry.quantity))) : 1;
  const nowIso = new Date().toISOString();
  const fullEntry: CrateTransaction = {
    ...entry,
    id: `crate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: safeQty,
    date: entry.date || nowIso.slice(0, 10),
    createdAt: nowIso
  };

  setCloudSyncStatus('syncing');
  await ensureAnonymousAuth();
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'shops', entry.shopId, 'crates', fullEntry.id),
    sanitizeForFirestore(fullEntry),
    { merge: true }
  );
  batch.set(
    doc(db, 'shops', entry.shopId),
    {
      crateBalance: increment(entry.type === 'IN' ? safeQty : -safeQty),
      updatedAt: nowIso
    },
    { merge: true }
  );
  await batch.commit();
  setCloudSyncStatus('synced', nowIso);
  return fullEntry;
}

export async function deleteCrateTransactionFromCloud(
  shopId: string,
  entryId: string,
  type: 'IN' | 'OUT',
  quantity: number
): Promise<void> {
  const safeQty = Number.isFinite(Number(quantity)) ? Math.max(0, Math.round(Number(quantity))) : 0;
  setCloudSyncStatus('syncing');
  await ensureAnonymousAuth();
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'shops', shopId, 'crates', entryId));
  if (safeQty > 0) {
    batch.set(
      doc(db, 'shops', shopId),
      {
        crateBalance: increment(type === 'IN' ? -safeQty : safeQty),
        updatedAt: nowIso
      },
      { merge: true }
    );
  }
  await batch.commit();
  setCloudSyncStatus('synced', nowIso);
}

export async function saveDayCloseToCloud(record: DayCloseRecord): Promise<DayCloseRecord> {
  const nowIso = new Date().toISOString();
  const docId = record.date || nowIso.slice(0, 10);
  const fullRecord: DayCloseRecord = {
    ...record,
    id: record.id || docId,
    date: docId,
    closedAt: record.closedAt || nowIso
  };

  setCloudSyncStatus('syncing');
  await ensureAnonymousAuth();
  await setDoc(
    doc(db, 'shops', record.shopId, 'dayClose', docId),
    sanitizeForFirestore(fullRecord),
    { merge: true }
  );
  setCloudSyncStatus('synced', nowIso);
  return fullRecord;
}

export async function getDayCloseHistoryFromCloud(shopId: string): Promise<DayCloseRecord[]> {
  if (!shopId) return [];
  try {
    await ensureAnonymousAuth();
    const snap = await getDocs(collection(db, 'shops', shopId, 'dayClose'));
    const list: DayCloseRecord[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as DayCloseRecord;
      list.push({
        ...data,
        id: data.id || docSnap.id,
        shopId: data.shopId || shopId
      });
    });
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `shops/${shopId}/dayClose`, { rethrow: false });
    return [];
  }
}

// ============================================================
// 4. ONE-TIME SAFE LEGACY localStorage CLEANUP
// ============================================================

const ALLOWED_LOCAL_STORAGE_KEYS = new Set([
  'amul_pos_active_session',
  'amul_pos_theme',
  'parlourpro_admin_pending_email_link'
]);

const LEGACY_BUSINESS_KEY_PREFIXES = [
  'amul_last_cloud_sync_',
  'amul_pos_deleted_',
  'amul_pos_sup_seeded_',
  'amul_pos_prod_seeded_',
  'amul_pos_print_settings',
  'amul_pos_subscription_settings',
  'amul_admin_otp_lockout',
  'amul_admin_monthly_reminder_month',
  'parlourpro_last_cloud_sync_',
  'parlourpro_pos_print_settings',
  'parlourpro_pos_subscription_settings'
];

/**
 * Removes legacy browser localStorage business keys once Cloud Firestore is authoritative,
 * strictly preserving only the minimal active auth session and UI theme preference.
 */
export function migrateAndPurgeLegacyBusinessLocalStorage(): string[] {
  const purgedKeys: string[] = [];
  if (typeof window === 'undefined' || !window.localStorage) {
    return purgedKeys;
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || ALLOWED_LOCAL_STORAGE_KEYS.has(key)) continue;
      if (LEGACY_BUSINESS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
      purgedKeys.push(key);
    }
  } catch {
    // ignore storage access errors
  }

  return purgedKeys;
}
