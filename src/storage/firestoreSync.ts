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
