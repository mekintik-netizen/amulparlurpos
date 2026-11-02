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
  Unsubscribe 
} from 'firebase/firestore';
import { db } from './firebase.ts';
import { Product, SaleBill, Shop, Expense, BankEntry } from '../types/index.ts';
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
    const shopRef = doc(db, 'shops', shopId);
    await deleteDoc(shopRef);
  } catch (err) {
    console.warn('[Firestore] Failed to delete shop from cloud:', err);
  }
}

export async function syncProductToCloud(product: Product): Promise<void> {
  try {
    if (!product.shopId) return;
    const prodRef = doc(db, 'products', product.id);
    await setDoc(prodRef, sanitizeForFirestore({
      ...product,
      shopId: product.shopId,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.warn('[Firestore] Failed to sync product to cloud:', err);
  }
}

export async function deleteProductFromCloud(productId: string): Promise<void> {
  try {
    const prodRef = doc(db, 'products', productId);
    await deleteDoc(prodRef);
  } catch (err) {
    console.warn('[Firestore] Failed to delete product from cloud:', err);
  }
}

export async function syncSaleBillToCloud(bill: SaleBill): Promise<void> {
  try {
    if (!bill.shopId) return;
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

// ============================================================
// 2. INCOMING SYNC: Real-Time onSnapshot Listeners
// ============================================================

export interface ShopSyncListeners {
  unsubscribeAll: () => void;
}

/**
 * Attaches real-time Firestore listeners scoped strictly to `currentShopId`.
 * Updates local IndexedDB when changes occur on remote devices.
 */
export function startShopRealtimeSync(
  shopId: string,
  onRemoteChange?: () => void
): ShopSyncListeners {
  const unsubscribers: Unsubscribe[] = [];

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
          try {
            await localDb.saveProduct(prod);
            changed = true;
          } catch (e) {
            // ignore local conflict
          }
        }
      }
      if (changed && onRemoteChange) {
        onRemoteChange();
      }
    }, (err) => console.warn('[Firestore] Products listener error:', err.message));
    unsubscribers.push(unsubProducts);

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

  } catch (err) {
    console.warn('[Firestore] Could not start real-time sync (running offline-first):', err);
  }

  return {
    unsubscribeAll: () => {
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
 */
export function startAdminShopsRealtimeSync(onShopsUpdated: (shops: Shop[]) => void): Unsubscribe {
  try {
    const shopsCol = collection(db, 'shops');
    return onSnapshot(shopsCol, (snapshot) => {
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
    return () => {};
  }
}
