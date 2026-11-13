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
  getDocs,
  Unsubscribe 
} from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase.ts';
import { Product, SaleBill, Shop, Expense, BankEntry, PurchaseBill, Supplier } from '../types/index.ts';
import * as localDb from './db.ts';

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
    const purRef = doc(db, 'purchases', purchase.id);
    await setDoc(purRef, sanitizeForFirestore({
      ...purchase,
      shopId: purchase.shopId,
      agencyName: purchase.agencyName || purchase.supplierName,
      billNumber: purchase.billNumber || purchase.purchaseInvoiceNumber,
      syncedAt: new Date().toISOString()
    }), { merge: true });
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
    await ensureAnonymousAuth();
    const deletedIds = await localDb.loadDeletedPurchaseIds();
    const q = query(collection(db, 'purchases'), where('shopId', '==', shopId));
    const snapshot = await getDocs(q);
    const list: PurchaseBill[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PurchaseBill;
      if (deletedIds.has(data.id) || deletedIds.has(docSnap.id)) {
        deletePurchaseBillFromCloud(docSnap.id, shopId).catch(() => {});
        return;
      }
      list.push({
        ...data,
        agencyName: data.agencyName || data.supplierName,
        billNumber: data.billNumber || data.purchaseInvoiceNumber
      });
    });
    return list;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch purchases from cloud:', err);
    return [];
  }
}

export async function fetchSuppliersFromCloud(shopId: string): Promise<Supplier[]> {
  try {
    await ensureAnonymousAuth();
    const deletedIds = await localDb.loadDeletedSupplierIds();
    const q = query(collection(db, 'suppliers'), where('shopId', '==', shopId));
    const snapshot = await getDocs(q);
    const list: Supplier[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Supplier;
      if (deletedIds.has(data.id) || deletedIds.has(docSnap.id)) {
        deleteSupplierFromCloud(docSnap.id, shopId).catch(() => {});
        return;
      }
      list.push(data);
    });
    return list;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch suppliers from cloud:', err);
    return [];
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
  onRemoteChange?: () => void
): ShopSyncListeners {
  const unsubscribers: Unsubscribe[] = [];
  let isCancelled = false;

  // Await silent anonymous auth and load deletion tombstones before mounting Firestore snapshot listeners
  ensureAnonymousAuth().then(async () => {
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
        await localDb.saveProduct({ ...prod, id: resolvedId });
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
          const remoteShop = snap.data() as Shop;
          try {
            await localDb.saveShop(remoteShop);
            if (onRemoteChange) onRemoteChange();
          } catch (e) {
            console.warn('[Firestore Sync] Failed to update local shop:', e);
          }
        }
      }, (err) => console.warn('[Firestore] Shop listener error:', err.message));
      unsubscribers.push(unsubShop);

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
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Products listener error:', err.message));
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
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Inventory listener error:', err.message));
      unsubscribers.push(unsubInventory);

      // 2c. Listen for Shop Subcollection Products (shops/{shopId}/products)
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
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Shop products listener error:', err.message));
      unsubscribers.push(unsubShopProducts);

      // 3. Listen for Sales/Bills Updates (Strictly where shopId == currentShopId)
      const salesQuery = query(collection(db, 'sales'), where('shopId', '==', shopId));
      const unsubSales = onSnapshot(salesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const sale = change.doc.data() as SaleBill;
            try {
              const dbInstance = await localDb.openAppDatabase();
              const tx = dbInstance.transaction('sales', 'readwrite');
              tx.objectStore('sales').put(sale);
              changed = true;
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Sales listener error:', err.message));
      unsubscribers.push(unsubSales);

      // 4. Listen for Expenses Updates (Strictly where shopId == currentShopId)
      const expensesQuery = query(collection(db, 'expenses'), where('shopId', '==', shopId));
      const unsubExpenses = onSnapshot(expensesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const exp = change.doc.data() as Expense;
            try {
              await localDb.createExpense(exp);
              changed = true;
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Expenses listener error:', err.message));
      unsubscribers.push(unsubExpenses);

      // 5. Listen for Bank Statement Entries (Strictly where shopId == currentShopId)
      const bankQuery = query(collection(db, 'bankEntries'), where('shopId', '==', shopId));
      const unsubBank = onSnapshot(bankQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const entry = change.doc.data() as BankEntry;
            try {
              await localDb.saveBankEntry(entry);
              changed = true;
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Bank entries listener error:', err.message));
      unsubscribers.push(unsubBank);

      // 6. Listen for Purchases & Agency Bills (Strictly where shopId == currentShopId)
      const purchasesQuery = query(collection(db, 'purchases'), where('shopId', '==', shopId));
      const unsubPurchases = onSnapshot(purchasesQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const pur = change.doc.data() as PurchaseBill;
            if (localDb.isPurchaseDeleted(pur.id) || localDb.isPurchaseDeleted(change.doc.id)) {
              continue;
            }
            try {
              await localDb.savePurchaseBill({
                ...pur,
                agencyName: pur.agencyName || pur.supplierName,
                billNumber: pur.billNumber || pur.purchaseInvoiceNumber
              });
              changed = true;
            } catch (e) {
              // ignore
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deletePurchaseBillRaw(change.doc.id);
              changed = true;
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Purchases listener error:', err.message));
      unsubscribers.push(unsubPurchases);

      // 7. Listen for Suppliers & Agencies (Strictly where shopId == currentShopId)
      const suppliersQuery = query(collection(db, 'suppliers'), where('shopId', '==', shopId));
      const unsubSuppliers = onSnapshot(suppliersQuery, async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added' || change.type === 'modified') {
            const sup = change.doc.data() as Supplier;
            if (localDb.isSupplierDeleted(sup.id) || localDb.isSupplierDeleted(change.doc.id)) {
              continue;
            }
            try {
              await localDb.saveSupplier(sup);
              changed = true;
            } catch (e) {
              // ignore
            }
          } else if (change.type === 'removed') {
            try {
              await localDb.deleteSupplier(change.doc.id, shopId);
              changed = true;
            } catch (e) {
              // ignore
            }
          }
        }
        if (changed && onRemoteChange) {
          onRemoteChange();
        }
      }, (err) => console.warn('[Firestore] Suppliers listener error:', err.message));
      unsubscribers.push(unsubSuppliers);

    } catch (err) {
      console.warn('[Firestore] Could not start real-time sync (running offline-first):', err);
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

/**
 * Attaches real-time listener for Master Admin to watch all registered shops.
 * Delays attaching until anonymous auth promise resolves.
 */
export function startAdminShopsRealtimeSync(onShopsUpdated: (shops: Shop[]) => void): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let isCancelled = false;

  ensureAnonymousAuth().then(() => {
    if (isCancelled) return;
    try {
      const shopsCol = collection(db, 'shops');
      unsub = onSnapshot(shopsCol, (snapshot) => {
        const remoteShops: Shop[] = [];
        snapshot.forEach(docSnap => {
          remoteShops.push(docSnap.data() as Shop);
        });
        if (remoteShops.length > 0) {
          onShopsUpdated(remoteShops);
        }
      }, (err) => {
        console.warn('[Firestore] Admin shops listener error:', err.message);
      });
    } catch (err) {
      console.warn('[Firestore] Could not start admin shops listener:', err);
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
