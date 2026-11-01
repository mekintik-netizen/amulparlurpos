/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-ready IndexedDB Storage Engine for Amul Parlour POS (Version 2)
 * Features:
 * - Versioned schema migration with zero data loss
 * - Tenant isolation by Shop ID across all stores
 * - Confirmed purchases increase stock exactly once; draft/cancelled do not
 * - Sales deduct stock atomically with idempotency protection
 * - Supplier ledger & payment khata reconciliation
 * - Daily financial P&L summary (Distinguishing Revenue from Profit)
 * - Automatic daily backups with checksum integrity & missed backup detection
 */

import {
  BackupManifest,
  BackupSettings,
  BankEntry,
  BankStatementSummary,
  DailyFinancialSummary,
  DailySalesReportSummary,
  DailyStockReportRow,
  Expense,
  LocalDatabaseExport,
  PaymentMode,
  Product,
  PurchaseBill,
  PurchaseBillStatus,
  PurchaseItem,
  SaleBill,
  Shop,
  StockMovement,
  StoredBackupRecord,
  Supplier,
  SupplierPayment,
  SyncOutboxEntry
} from '../types/index.ts';
import { INITIAL_SHOPS, getSeedProductsForShop, getSeedSuppliersForShop, getSeedBankEntriesForShop } from './seedData.ts';
import { getAmulProductPresetImage } from './productImages.ts';

const DB_NAME = 'AmulParlourDB';
const DB_VERSION = 3; // Upgraded for Bank Entries & Passbook Statements

let dbPromise: Promise<IDBDatabase> | null = null;

export const openAppDatabase = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      dbPromise = null;
      reject(new Error('IndexedDB is not supported or is disabled in your browser. Please use Chrome 109+, Edge, or Firefox ESR 115+.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      console.warn('[IndexedDB] Database upgrade blocked. Please close any other open Amul Parlour tabs.');
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // 1. Shops store
      if (!db.objectStoreNames.contains('shops')) {
        const shopStore = db.createObjectStore('shops', { keyPath: 'id' });
        shopStore.createIndex('shopCode', 'shopCode', { unique: true });
        shopStore.createIndex('approvalStatus', 'approvalStatus', { unique: false });
      }

      // 2. Products store
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'id' });
        prodStore.createIndex('shopId', 'shopId', { unique: false });
        prodStore.createIndex('shop_barcode', ['shopId', 'barcode'], { unique: false });
        prodStore.createIndex('category', 'category', { unique: false });
      }

      // 3. Stock Movements store
      if (!db.objectStoreNames.contains('stockMovements')) {
        const movStore = db.createObjectStore('stockMovements', { keyPath: 'id' });
        movStore.createIndex('shopId', 'shopId', { unique: false });
        movStore.createIndex('productId', 'productId', { unique: false });
        movStore.createIndex('timestamp', 'timestamp', { unique: false });
        movStore.createIndex('movementType', 'movementType', { unique: false });
      }

      // 4. Sales Bills store
      if (!db.objectStoreNames.contains('sales')) {
        const saleStore = db.createObjectStore('sales', { keyPath: 'id' });
        saleStore.createIndex('shopId', 'shopId', { unique: false });
        saleStore.createIndex('billNumber', 'billNumber', { unique: false });
        saleStore.createIndex('timestamp', 'timestamp', { unique: false });
        saleStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
      }

      // 5. Suppliers store (v2)
      if (!db.objectStoreNames.contains('suppliers')) {
        const supStore = db.createObjectStore('suppliers', { keyPath: 'id' });
        supStore.createIndex('shopId', 'shopId', { unique: false });
        supStore.createIndex('name', 'name', { unique: false });
      }

      // 6. Purchases Bills store (v2)
      if (!db.objectStoreNames.contains('purchases')) {
        const purStore = db.createObjectStore('purchases', { keyPath: 'id' });
        purStore.createIndex('shopId', 'shopId', { unique: false });
        purStore.createIndex('purchaseInvoiceNumber', 'purchaseInvoiceNumber', { unique: false });
        purStore.createIndex('supplierId', 'supplierId', { unique: false });
        purStore.createIndex('purchaseDate', 'purchaseDate', { unique: false });
        purStore.createIndex('status', 'status', { unique: false });
        purStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
      }

      // 7. Supplier Payments store (v2)
      if (!db.objectStoreNames.contains('supplierPayments')) {
        const payStore = db.createObjectStore('supplierPayments', { keyPath: 'id' });
        payStore.createIndex('shopId', 'shopId', { unique: false });
        payStore.createIndex('supplierId', 'supplierId', { unique: false });
        payStore.createIndex('paymentDate', 'paymentDate', { unique: false });
      }

      // 8. Operating Expenses store (v2)
      if (!db.objectStoreNames.contains('expenses')) {
        const expStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expStore.createIndex('shopId', 'shopId', { unique: false });
        expStore.createIndex('date', 'date', { unique: false });
        expStore.createIndex('category', 'category', { unique: false });
      }

      // 9. Backups store (v2)
      if (!db.objectStoreNames.contains('backups')) {
        const bkpStore = db.createObjectStore('backups', { keyPath: 'id' });
        bkpStore.createIndex('shopId', 'shopId', { unique: false });
        bkpStore.createIndex('backupDate', 'backupDate', { unique: false });
        bkpStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 10. Sync Outbox store (v2 - for future PostgreSQL sync)
      if (!db.objectStoreNames.contains('syncOutbox')) {
        const outStore = db.createObjectStore('syncOutbox', { keyPath: 'id' });
        outStore.createIndex('shopId', 'shopId', { unique: false });
        outStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        outStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 11. App Settings store (v2)
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'key' });
      }

      // 12. Bank Entries & Passbook store (v3)
      if (!db.objectStoreNames.contains('bankEntries')) {
        const bankStore = db.createObjectStore('bankEntries', { keyPath: 'id' });
        bankStore.createIndex('shopId', 'shopId', { unique: false });
        bankStore.createIndex('date', 'date', { unique: false });
        bankStore.createIndex('type', 'type', { unique: false });
        bankStore.createIndex('category', 'category', { unique: false });
        bankStore.createIndex('referenceNumber', 'referenceNumber', { unique: false });
      }
    };

    request.onsuccess = async (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      await ensureSeedData(db);
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open local IndexedDB database.'));
    };
  });

  return dbPromise;
};

// Seed helper (only seeds if stores are completely empty; NEVER overwrites existing data)
async function ensureSeedData(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const storeNames = ['shops', 'products', 'suppliers'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const shopStore = tx.objectStore('shops');
    const countReq = shopStore.count();

    countReq.onsuccess = () => {
      const prodStore = tx.objectStore('products');
      const supStore = tx.objectStore('suppliers');
      const bankStore = db.objectStoreNames.contains('bankEntries') ? tx.objectStore('bankEntries') : null;

      if (countReq.result === 0) {
        // Seed initial shops
        for (const shop of INITIAL_SHOPS) {
          shopStore.add(shop);
        }

        // Seed products, suppliers, and initial bank entries for each shop
        for (const shop of INITIAL_SHOPS) {
          const prods = getSeedProductsForShop(shop.id);
          for (const p of prods) {
            prodStore.add(p);
          }

          const sups = getSeedSuppliersForShop(shop.id);
          for (const s of sups) {
            supStore.add(s);
          }

          if (bankStore) {
            const initialBank = getSeedBankEntriesForShop(shop.id);
            for (const b of initialBank) {
              bankStore.add(b);
            }
          }
        }
        resolve();
      } else {
        // Automatically ensure existing shops receive the expanded 65+ Amul products catalog
        const prodCountReq = prodStore.count();
        prodCountReq.onsuccess = () => {
          if (prodCountReq.result < 50) {
            for (const shop of INITIAL_SHOPS) {
              const fullSeed = getSeedProductsForShop(shop.id);
              for (const p of fullSeed) {
                prodStore.put(p);
              }
            }
          }

          // If bank entries store is newly created for existing db, seed initial entries
          if (bankStore) {
            const bankCountReq = bankStore.count();
            bankCountReq.onsuccess = () => {
              if (bankCountReq.result === 0) {
                for (const shop of INITIAL_SHOPS) {
                  const initialBank = getSeedBankEntriesForShop(shop.id);
                  for (const b of initialBank) {
                    bankStore.put(b);
                  }
                }
              }
              resolve();
            };
            bankCountReq.onerror = () => resolve();
          } else {
            resolve();
          }
        };
        prodCountReq.onerror = () => resolve();
      }
    };

    countReq.onerror = () => resolve();
  });
}

// Simple checksum generator for backup integrity
async function generateDataChecksum(dataString: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto && crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(dataString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('crypto.subtle not available in this environment');
  } catch {
    // Fallback simple hash for older environments
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash-${Math.abs(hash)}`;
  }
}

// ==========================================
// SHOP OPERATIONS
// ==========================================

export async function getAllShops(): Promise<Shop[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shops', 'readonly');
    const store = tx.objectStore('shops');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getShopById(id: string): Promise<Shop | null> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shops', 'readonly');
    const store = tx.objectStore('shops');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveShop(shop: Shop): Promise<Shop> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shops', 'readwrite');
    const store = tx.objectStore('shops');
    const req = store.put(shop);
    req.onsuccess = () => resolve(shop);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteShop(id: string): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shops', 'readwrite');
    const store = tx.objectStore('shops');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}


// ==========================================
// PRODUCT OPERATIONS
// ==========================================

export async function getProductsByShop(shopId: string): Promise<Product[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const index = store.index('shopId');
    const req = index.getAll(shopId);
    req.onsuccess = async () => {
      const list = (req.result || []) as Product[];
      if (list.length === 0) {
        // Automatically populate authentic 65+ Amul items with 0 stock so catalog is never blank!
        try {
          const seeded = await prefillMasterAmulCatalogWithZeroStock(shopId);
          resolve(seeded);
          return;
        } catch (e) {
          console.warn('Auto-seed products failed for shop:', shopId, e);
        }
      }
      resolve(
        list.map((p) => ({
          ...p,
          imageUrl: p.imageUrl || getAmulProductPresetImage(p.name, p.category)
        }))
      );
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Pre-fills or resets the full authentic 65+ Amul product catalog
 * for a shop with initial currentStock = 0, along with official Amul suppliers.
 */
export async function prefillMasterAmulCatalogWithZeroStock(
  shopId: string,
  overwriteExisting = false
): Promise<Product[]> {
  const db = await openAppDatabase();
  const seedProducts = getSeedProductsForShop(shopId, true);
  const seedSuppliers = getSeedSuppliersForShop(shopId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'suppliers'], 'readwrite');
    const prodStore = tx.objectStore('products');
    const supStore = tx.objectStore('suppliers');
    const prodIndex = prodStore.index('shopId');
    const getReq = prodIndex.getAll(shopId);

    getReq.onsuccess = () => {
      const existingList = (getReq.result || []) as Product[];
      const existingMap = new Map<string, Product>();
      existingList.forEach((p) => {
        existingMap.set(p.barcode, p);
      });

      for (const p of seedProducts) {
        const existing = existingMap.get(p.barcode);
        if (existing) {
          if (overwriteExisting) {
            const updated: Product = {
              ...existing,
              name: p.name,
              regionalName: p.regionalName,
              category: p.category,
              unit: p.unit,
              mrp: p.mrp,
              costPrice: p.costPrice,
              sellingPrice: p.sellingPrice,
              currentStock: 0,
              minStockAlert: p.minStockAlert,
              imageUrl: p.imageUrl,
              updatedAt: new Date().toISOString()
            };
            prodStore.put(updated);
          }
        } else {
          prodStore.add(p);
        }
      }

      // Also ensure standard Amul suppliers are seeded for purchases
      const supIndex = supStore.index('shopId');
      const supReq = supIndex.getAll(shopId);
      supReq.onsuccess = () => {
        const existingSups = (supReq.result || []) as Supplier[];
        if (existingSups.length === 0) {
          for (const s of seedSuppliers) {
            supStore.add(s);
          }
        }
      };
    };

    tx.oncomplete = () => {
      const readTx = db.transaction('products', 'readonly');
      const store = readTx.objectStore('products');
      const req = store.index('shopId').getAll(shopId);
      req.onsuccess = () => {
        const list = (req.result || []) as Product[];
        resolve(
          list.map((p) => ({
            ...p,
            imageUrl: p.imageUrl || getAmulProductPresetImage(p.name, p.category)
          }))
        );
      };
      req.onerror = () => reject(req.error);
    };

    tx.onerror = () => reject(tx.error);
  });
}


export async function getProductById(id: string): Promise<Product | null> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getProductByBarcode(shopId: string, barcode: string): Promise<Product | null> {
  const products = await getProductsByShop(shopId);
  const trimmed = barcode.trim();
  return products.find(p => p.barcode === trimmed && p.isActive) || null;
}

export async function saveProduct(product: Product): Promise<Product> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const req = store.put(product);
    req.onsuccess = () => resolve(product);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const req = store.delete(productId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Pre-fills the entire 65+ authentic Amul product catalog into a shop's database.
 * Preserves any existing products and avoids duplicate entries.
 */
export async function syncPreFilledAmulCatalogForShop(shopId: string): Promise<{ added: number; total: number }> {
  const existing = await getProductsByShop(shopId);
  const masterSeed = getSeedProductsForShop(shopId);
  const db = await openAppDatabase();

  let added = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');

    for (const item of masterSeed) {
      const exists = existing.some(
        e => e.barcode === item.barcode || e.name.toLowerCase() === item.name.toLowerCase()
      );
      if (!exists) {
        store.put(item);
        added++;
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const updated = await getProductsByShop(shopId);
  return { added, total: updated.length };
}

// ==========================================
// STOCK & INVENTORY OPERATIONS (ATOMIC)
// ==========================================

export async function recordStockMovement(
  movement: Omit<StockMovement, 'id' | 'timestamp'>
): Promise<StockMovement> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'stockMovements'], 'readwrite');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');

    const getProdReq = prodStore.get(movement.productId);

    getProdReq.onsuccess = () => {
      const prod = getProdReq.result as Product | undefined;
      if (!prod) {
        return reject(new Error(`Product ${movement.productId} not found.`));
      }

      let delta = 0;
      if (
        movement.movementType === 'IN' ||
        movement.movementType === 'PURCHASE' ||
        movement.movementType === 'SALE_RETURN'
      ) {
        delta = movement.quantity;
      } else if (
        movement.movementType === 'OUT' ||
        movement.movementType === 'SALE' ||
        movement.movementType === 'PURCHASE_CANCEL' ||
        movement.movementType === 'EXPIRY_DAMAGE'
      ) {
        delta = -movement.quantity;
      } else if (movement.movementType === 'ADJUSTMENT') {
        delta = movement.quantity;
      }

      prod.currentStock = Math.max(0, (prod.currentStock || 0) + delta);
      prod.updatedAt = new Date().toISOString();
      prodStore.put(prod);

      const fullMovement: StockMovement = {
        ...movement,
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString()
      };

      movStore.add(fullMovement);

      tx.oncomplete = () => resolve(fullMovement);
      tx.onerror = () => reject(tx.error);
    };

    getProdReq.onerror = () => reject(getProdReq.error);
  });
}

export async function getStockMovementsByShop(
  shopId: string,
  startDate?: string,
  endDate?: string
): Promise<StockMovement[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stockMovements', 'readonly');
    const store = tx.objectStore('stockMovements');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as StockMovement[]) || [];
      if (startDate) {
        const start = new Date(startDate).getTime();
        list = list.filter(m => new Date(m.timestamp).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        list = list.filter(m => new Date(m.timestamp).getTime() <= end);
      }
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

// ==========================================
// SALES & BILLING OPERATIONS (IDEMPOTENT & ATOMIC)
// ==========================================

export async function createSaleBill(
  billData: Omit<SaleBill, 'id' | 'createdAt'>
): Promise<SaleBill> {
  const db = await openAppDatabase();

  return new Promise((resolve, reject) => {
    const storeNames = ['sales', 'products', 'stockMovements'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const saleStore = tx.objectStore('sales');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');

    // 1. Idempotency Check: prevent duplicate sales and double deductions
    const idempIndex = saleStore.index('idempotencyKey');
    const checkReq = idempIndex.get(billData.idempotencyKey);

    checkReq.onsuccess = () => {
      if (checkReq.result) {
        return resolve(checkReq.result as SaleBill);
      }

      const newBill: SaleBill = {
        ...billData,
        id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString()
      };

      const nowIso = newBill.timestamp || new Date().toISOString();

      // Deduct stock for each sold item
      for (const item of newBill.items) {
        const prodReq = prodStore.get(item.productId);
        prodReq.onsuccess = () => {
          const prod = prodReq.result as Product | undefined;
          if (prod) {
            prod.currentStock = Math.max(0, prod.currentStock - item.quantity);
            prod.updatedAt = nowIso;
            prodStore.put(prod);

            const mov: StockMovement = {
              id: `mov-sale-${Date.now()}-${item.productId}`,
              shopId: newBill.shopId,
              productId: item.productId,
              productName: item.productName,
              barcode: item.barcode,
              movementType: 'SALE',
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              reason: `Sale Bill #${newBill.billNumber}`,
              referenceNumber: newBill.billNumber,
              timestamp: nowIso,
              createdBy: newBill.cashierName
            };
            movStore.add(mov);
          }
        };
      }

      // Auto-record UPI customer counter payment into bankEntries
      if (newBill.paymentMode === 'UPI' && db.objectStoreNames.contains('bankEntries')) {
        const bankStore = tx.objectStore('bankEntries');
        const bankEntry: BankEntry = {
          id: `bank-upi-${newBill.id}`,
          shopId: newBill.shopId,
          date: nowIso.split('T')[0],
          type: 'CREDIT',
          category: 'UPI_SALE',
          amount: newBill.finalAmount,
          referenceNumber: newBill.billNumber,
          description: `Customer POS Bill #${newBill.billNumber} (${newBill.itemCount} items)`,
          partyName: newBill.customerPhone || newBill.customerName || 'Counter Customer',
          paymentMode: 'UPI',
          sourceId: newBill.id,
          createdAt: nowIso
        };
        bankStore.put(bankEntry);
      }

      saleStore.add(newBill);

      tx.oncomplete = () => resolve(newBill);
      tx.onerror = () => reject(tx.error);
    };

    checkReq.onerror = () => reject(checkReq.error);
  });
}

export async function getSalesByShop(shopId: string, dateStr?: string): Promise<SaleBill[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales', 'readonly');
    const store = tx.objectStore('sales');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as SaleBill[]) || [];
      if (dateStr) {
        list = list.filter(s => s.timestamp.startsWith(dateStr));
      }
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function getAllSales(): Promise<SaleBill[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales', 'readonly');
    const store = tx.objectStore('sales');
    const req = store.getAll();

    req.onsuccess = () => {
      const list = (req.result as SaleBill[]) || [];
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function cancelSaleBill(
  billId: string,
  shopId: string,
  reason: string
): Promise<SaleBill> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const storeNames = ['sales', 'products', 'stockMovements'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const saleStore = tx.objectStore('sales');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');

    const getReq = saleStore.get(billId);

    getReq.onsuccess = () => {
      const bill = getReq.result as SaleBill | undefined;
      if (!bill || bill.shopId !== shopId) {
        return reject(new Error('Bill not found or does not belong to shop'));
      }
      if (bill.status === 'CANCELLED') {
        return resolve(bill);
      }

      bill.status = 'CANCELLED';
      bill.notes = `${bill.notes ? bill.notes + ' | ' : ''}Cancelled: ${reason}`;
      saleStore.put(bill);

      // Restore product stock
      for (const item of bill.items) {
        const prodReq = prodStore.get(item.productId);
        prodReq.onsuccess = () => {
          const prod = prodReq.result as Product | undefined;
          if (prod) {
            prod.currentStock = prod.currentStock + item.quantity;
            prod.updatedAt = new Date().toISOString();
            prodStore.put(prod);

            const mov: StockMovement = {
              id: `mov-return-${Date.now()}-${item.productId}`,
              shopId,
              productId: item.productId,
              productName: item.productName,
              barcode: item.barcode,
              movementType: 'SALE_RETURN',
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              reason: `Bill Cancelled: ${reason}`,
              referenceNumber: bill.billNumber,
              timestamp: new Date().toISOString(),
              createdBy: 'System / Return'
            };
            movStore.add(mov);
          }
        };
      }

      // If bill was paid via UPI, record a bank debit reversal
      if (bill.paymentMode === 'UPI' && db.objectStoreNames.contains('bankEntries')) {
        const bankStore = tx.objectStore('bankEntries');
        const nowIso = new Date().toISOString();
        const reversalEntry: BankEntry = {
          id: `bank-rev-${bill.id}-${Date.now()}`,
          shopId: bill.shopId,
          date: nowIso.split('T')[0],
          type: 'DEBIT',
          category: 'OTHER',
          amount: bill.finalAmount,
          referenceNumber: `REV-${bill.billNumber}`,
          description: `Bill Refund / Cancellation #${bill.billNumber} (${reason})`,
          partyName: bill.customerPhone || bill.customerName || 'Counter Customer',
          paymentMode: 'UPI',
          sourceId: bill.id,
          createdAt: nowIso
        };
        bankStore.put(reversalEntry);
      }

      tx.oncomplete = () => resolve(bill);
      tx.onerror = () => reject(tx.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

// ==========================================
// SUPPLIERS & PURCHASES OPERATIONS
// ==========================================

export async function getSuppliersByShop(shopId: string): Promise<Supplier[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('suppliers', 'readonly');
    const store = tx.objectStore('suppliers');
    const index = store.index('shopId');
    const req = index.getAll(shopId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSupplier(supplier: Supplier): Promise<Supplier> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('suppliers', 'readwrite');
    const store = tx.objectStore('suppliers');
    const req = store.put(supplier);
    req.onsuccess = () => resolve(supplier);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Creates a purchase bill.
 * CRITICAL BUSINESS RULE:
 * - Confirmed purchases automatically increase stock exactly once.
 * - Draft or cancelled purchases must NOT increase stock.
 */
export async function createPurchaseBill(
  billData: Omit<PurchaseBill, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PurchaseBill> {
  const db = await openAppDatabase();

  return new Promise((resolve, reject) => {
    const storeNames = ['purchases', 'products', 'stockMovements', 'suppliers'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const purStore = tx.objectStore('purchases');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');
    const supStore = tx.objectStore('suppliers');

    // 1. Idempotency Check
    const idempIndex = purStore.index('idempotencyKey');
    const checkReq = idempIndex.get(billData.idempotencyKey);

    checkReq.onsuccess = () => {
      if (checkReq.result) {
        return resolve(checkReq.result as PurchaseBill);
      }

      const shouldPostStock = billData.status === 'CONFIRMED';
      const nowIso = new Date().toISOString();

      const newPurchase: PurchaseBill = {
        ...billData,
        id: `pur-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        stockPosted: shouldPostStock,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // If CONFIRMED, increase stock exactly once
      if (shouldPostStock) {
        for (const item of newPurchase.items) {
          const prodReq = prodStore.get(item.productId);
          prodReq.onsuccess = () => {
            const prod = prodReq.result as Product | undefined;
            if (prod) {
              prod.currentStock = (prod.currentStock || 0) + item.quantity;
              // Update cost price with latest purchase rate
              prod.costPrice = item.purchaseRate;
              if (item.mrp && item.mrp > 0) {
                // If distributor invoice has updated MRP, sync it to catalog
                if (prod.sellingPrice === prod.mrp || prod.sellingPrice <= 0) {
                  prod.sellingPrice = item.mrp;
                }
                prod.mrp = item.mrp;
              }
              prod.updatedAt = nowIso;
              prodStore.put(prod);

              const mov: StockMovement = {
                id: `mov-pur-${Date.now()}-${item.productId}`,
                shopId: newPurchase.shopId,
                productId: item.productId,
                productName: item.productName,
                barcode: item.barcode,
                movementType: 'PURCHASE',
                quantity: item.quantity,
                unitPrice: item.purchaseRate,
                reason: `Purchase Invoice #${newPurchase.purchaseInvoiceNumber} (${newPurchase.supplierName})`,
                referenceNumber: newPurchase.purchaseInvoiceNumber,
                timestamp: nowIso,
                createdBy: 'Purchase Manager'
              };
              movStore.add(mov);
            }
          };
        }

        // Update supplier balance (unpaid due amount)
        if (newPurchase.supplierId && newPurchase.dueAmount > 0) {
          const supReq = supStore.get(newPurchase.supplierId);
          supReq.onsuccess = () => {
            const sup = supReq.result as Supplier | undefined;
            if (sup) {
              sup.currentBalance = (sup.currentBalance || 0) + newPurchase.dueAmount;
              sup.updatedAt = nowIso;
              supStore.put(sup);
            }
          };
        }

        // Auto-record Bank DEBIT if paid via Bank or UPI
        if (
          (newPurchase.paymentMode === 'BANK_TRANSFER' || newPurchase.paymentMode === 'UPI') &&
          newPurchase.paidAmount > 0 &&
          db.objectStoreNames.contains('bankEntries')
        ) {
          const bankStore = tx.objectStore('bankEntries');
          const bankEntry: BankEntry = {
            id: `bank-pur-${newPurchase.id}`,
            shopId: newPurchase.shopId,
            date: newPurchase.purchaseDate || nowIso.split('T')[0],
            type: 'DEBIT',
            category: 'SUPPLIER_PAYMENT',
            amount: newPurchase.paidAmount,
            referenceNumber: newPurchase.purchaseInvoiceNumber || `PUR-${Date.now()}`,
            description: `Supplier payment for Purchase #${newPurchase.purchaseInvoiceNumber} (${newPurchase.supplierName})`,
            partyName: newPurchase.supplierName,
            paymentMode: newPurchase.paymentMode === 'UPI' ? 'UPI' : 'NEFT_RTGS',
            sourceId: newPurchase.id,
            createdAt: nowIso
          };
          bankStore.put(bankEntry);
        }
      }

      purStore.add(newPurchase);

      tx.oncomplete = () => resolve(newPurchase);
      tx.onerror = () => reject(tx.error);
    };

    checkReq.onerror = () => reject(checkReq.error);
  });
}

export async function getPurchasesByShop(shopId: string, dateStr?: string): Promise<PurchaseBill[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('purchases', 'readonly');
    const store = tx.objectStore('purchases');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as PurchaseBill[]) || [];
      if (dateStr) {
        list = list.filter(p => p.purchaseDate.startsWith(dateStr));
      }
      list.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Cancel a purchase bill. If it had posted stock, reverses the added stock and supplier balance.
 */
export async function cancelPurchaseBill(
  billId: string,
  shopId: string,
  reason: string
): Promise<PurchaseBill> {
  const db = await openAppDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['purchases', 'products', 'stockMovements', 'suppliers'],
      'readwrite'
    );
    const purStore = tx.objectStore('purchases');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');
    const supStore = tx.objectStore('suppliers');

    const getReq = purStore.get(billId);

    getReq.onsuccess = () => {
      const bill = getReq.result as PurchaseBill | undefined;
      if (!bill || bill.shopId !== shopId) {
        return reject(new Error('Purchase bill not found or unauthorized'));
      }
      if (bill.status === 'CANCELLED') {
        return resolve(bill);
      }

      const hadPostedStock = bill.stockPosted;
      const nowIso = new Date().toISOString();

      bill.status = 'CANCELLED';
      bill.stockPosted = false;
      bill.notes = `${bill.notes ? bill.notes + ' | ' : ''}Cancelled: ${reason}`;
      bill.updatedAt = nowIso;
      purStore.put(bill);

      // Deduct back added stock
      if (hadPostedStock) {
        for (const item of bill.items) {
          const prodReq = prodStore.get(item.productId);
          prodReq.onsuccess = () => {
            const prod = prodReq.result as Product | undefined;
            if (prod) {
              prod.currentStock = Math.max(0, prod.currentStock - item.quantity);
              prod.updatedAt = nowIso;
              prodStore.put(prod);

              const mov: StockMovement = {
                id: `mov-pur-cancel-${Date.now()}-${item.productId}`,
                shopId,
                productId: item.productId,
                productName: item.productName,
                barcode: item.barcode,
                movementType: 'PURCHASE_CANCEL',
                quantity: item.quantity,
                unitPrice: item.purchaseRate,
                reason: `Cancelled Purchase #${bill.purchaseInvoiceNumber}: ${reason}`,
                referenceNumber: bill.purchaseInvoiceNumber,
                timestamp: nowIso,
                createdBy: 'Purchase Manager'
              };
              movStore.add(mov);
            }
          };
        }

        // Revert supplier balance
        if (bill.supplierId && bill.dueAmount > 0) {
          const supReq = supStore.get(bill.supplierId);
          supReq.onsuccess = () => {
            const sup = supReq.result as Supplier | undefined;
            if (sup) {
              sup.currentBalance = Math.max(0, (sup.currentBalance || 0) - bill.dueAmount);
              sup.updatedAt = nowIso;
              supStore.put(sup);
            }
          };
        }
      }

      tx.oncomplete = () => resolve(bill);
      tx.onerror = () => reject(tx.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Update an existing purchase bill with modified items, quantity, purchase rates, or payments.
 * Reconciles stock differences atomically:
 * - If item quantity increases, increments stock by delta.
 * - If item quantity decreases, decrements stock by delta.
 * - Updates product cost price and MRP.
 * - Reconciles supplier due balance delta.
 */
export async function updatePurchaseBill(
  billId: string,
  shopId: string,
  updatedData: {
    purchaseInvoiceNumber?: string;
    supplierId?: string;
    supplierName?: string;
    purchaseDate?: string;
    items: PurchaseItem[];
    paymentMode?: PaymentMode;
    paidAmount?: number;
    status?: PurchaseBillStatus;
    notes?: string;
  }
): Promise<PurchaseBill> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['purchases', 'products', 'stockMovements', 'suppliers'],
      'readwrite'
    );
    const purStore = tx.objectStore('purchases');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');
    const supStore = tx.objectStore('suppliers');

    const getReq = purStore.get(billId);

    getReq.onsuccess = () => {
      const existingBill = getReq.result as PurchaseBill | undefined;
      if (!existingBill || existingBill.shopId !== shopId) {
        return reject(new Error('Purchase bill not found or unauthorized'));
      }
      if (existingBill.status === 'CANCELLED') {
        return reject(new Error('Cannot edit a cancelled purchase bill'));
      }

      const nowIso = new Date().toISOString();
      const newItems = updatedData.items;
      const subtotal = newItems.reduce(
        (acc, it) => acc + (it.total !== undefined ? it.total : it.quantity * it.purchaseRate),
        0
      );
      const totalAmount = subtotal;
      const paidAmount = updatedData.paidAmount !== undefined ? updatedData.paidAmount : existingBill.paidAmount;
      const dueAmount = Math.max(0, totalAmount - paidAmount);
      const newStatus = updatedData.status || existingBill.status;
      const shouldPostStock = newStatus === 'CONFIRMED';

      // 1. If previously posted and still confirmed: reconcile stock differences
      if (existingBill.stockPosted && shouldPostStock) {
        const oldItemsMap = new Map<string, PurchaseItem>();
        for (const item of existingBill.items) {
          oldItemsMap.set(item.productId, item);
        }

        for (const newItem of newItems) {
          const oldItem = oldItemsMap.get(newItem.productId);
          const oldQty = oldItem ? oldItem.quantity : 0;
          const qtyDelta = newItem.quantity - oldQty;

          const prodReq = prodStore.get(newItem.productId);
          prodReq.onsuccess = () => {
            const prod = prodReq.result as Product | undefined;
            if (prod) {
              if (qtyDelta !== 0) {
                prod.currentStock = Math.max(0, (prod.currentStock || 0) + qtyDelta);
              }
              prod.costPrice = newItem.purchaseRate;
              if (newItem.mrp) {
                prod.mrp = newItem.mrp;
              }
              prod.updatedAt = nowIso;
              prodStore.put(prod);

              if (qtyDelta !== 0) {
                const mov: StockMovement = {
                  id: `mov-pur-adj-${Date.now()}-${newItem.productId}`,
                  shopId,
                  productId: newItem.productId,
                  productName: newItem.productName,
                  barcode: newItem.barcode,
                  movementType: qtyDelta > 0 ? 'PURCHASE' : 'OUT',
                  quantity: Math.abs(qtyDelta),
                  unitPrice: newItem.purchaseRate,
                  reason: `Purchase #${existingBill.purchaseInvoiceNumber} Item Adjusted (${qtyDelta > 0 ? '+' : ''}${qtyDelta})`,
                  referenceNumber: existingBill.purchaseInvoiceNumber,
                  timestamp: nowIso,
                  createdBy: 'Purchase Manager'
                };
                movStore.add(mov);
              }
            }
          };
          oldItemsMap.delete(newItem.productId);
        }

        // Removed items
        for (const [removedProdId, removedItem] of oldItemsMap.entries()) {
          const prodReq = prodStore.get(removedProdId);
          prodReq.onsuccess = () => {
            const prod = prodReq.result as Product | undefined;
            if (prod) {
              prod.currentStock = Math.max(0, (prod.currentStock || 0) - removedItem.quantity);
              prod.updatedAt = nowIso;
              prodStore.put(prod);

              const mov: StockMovement = {
                id: `mov-pur-rem-${Date.now()}-${removedProdId}`,
                shopId,
                productId: removedProdId,
                productName: removedItem.productName,
                barcode: removedItem.barcode,
                movementType: 'OUT',
                quantity: removedItem.quantity,
                unitPrice: removedItem.purchaseRate,
                reason: `Purchase #${existingBill.purchaseInvoiceNumber} Item Removed`,
                referenceNumber: existingBill.purchaseInvoiceNumber,
                timestamp: nowIso,
                createdBy: 'Purchase Manager'
              };
              movStore.add(mov);
            }
          };
        }
      } else if (!existingBill.stockPosted && shouldPostStock) {
        // Transition from DRAFT to CONFIRMED
        for (const item of newItems) {
          const prodReq = prodStore.get(item.productId);
          prodReq.onsuccess = () => {
            const prod = prodReq.result as Product | undefined;
            if (prod) {
              prod.currentStock = (prod.currentStock || 0) + item.quantity;
              prod.costPrice = item.purchaseRate;
              if (item.mrp) prod.mrp = item.mrp;
              prod.updatedAt = nowIso;
              prodStore.put(prod);

              const mov: StockMovement = {
                id: `mov-pur-conf-${Date.now()}-${item.productId}`,
                shopId,
                productId: item.productId,
                productName: item.productName,
                barcode: item.barcode,
                movementType: 'PURCHASE',
                quantity: item.quantity,
                unitPrice: item.purchaseRate,
                reason: `Purchase #${existingBill.purchaseInvoiceNumber} Confirmed`,
                referenceNumber: existingBill.purchaseInvoiceNumber,
                timestamp: nowIso,
                createdBy: 'Purchase Manager'
              };
              movStore.add(mov);
            }
          };
        }
      }

      // 2. Reconcile supplier balance difference
      const dueDelta = dueAmount - existingBill.dueAmount;
      const targetSupplierId = updatedData.supplierId || existingBill.supplierId;
      if (targetSupplierId && dueDelta !== 0) {
        const supReq = supStore.get(targetSupplierId);
        supReq.onsuccess = () => {
          const sup = supReq.result as Supplier | undefined;
          if (sup) {
            sup.currentBalance = Math.max(0, (sup.currentBalance || 0) + dueDelta);
            sup.updatedAt = nowIso;
            supStore.put(sup);
          }
        };
      }

      const updatedBill: PurchaseBill = {
        ...existingBill,
        purchaseInvoiceNumber: updatedData.purchaseInvoiceNumber || existingBill.purchaseInvoiceNumber,
        supplierId: targetSupplierId,
        supplierName: updatedData.supplierName || existingBill.supplierName,
        purchaseDate: updatedData.purchaseDate || existingBill.purchaseDate,
        items: newItems,
        itemCount: newItems.reduce((sum, it) => sum + it.quantity, 0),
        subtotal,
        totalAmount,
        paidAmount,
        dueAmount,
        status: newStatus,
        paymentMode: updatedData.paymentMode || existingBill.paymentMode,
        notes: updatedData.notes !== undefined ? updatedData.notes : existingBill.notes,
        stockPosted: shouldPostStock,
        updatedAt: nowIso
      };

      purStore.put(updatedBill);

      tx.oncomplete = () => resolve(updatedBill);
      tx.onerror = () => reject(tx.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Quick direct adjustment of stock count and pricing (cost price & selling price / MRP)
 * Logs an ADJUSTMENT movement to maintain full audit trail.
 */
export async function adjustStockAndPrices(
  shopId: string,
  productId: string,
  newStock: number,
  costPrice?: number,
  sellingPrice?: number,
  mrp?: number,
  reason?: string
): Promise<Product> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'stockMovements'], 'readwrite');
    const prodStore = tx.objectStore('products');
    const movStore = tx.objectStore('stockMovements');

    const getReq = prodStore.get(productId);
    getReq.onsuccess = () => {
      const prod = getReq.result as Product | undefined;
      if (!prod || prod.shopId !== shopId) {
        return reject(new Error('Product not found in this shop'));
      }

      const oldStock = prod.currentStock || 0;
      const delta = newStock - oldStock;
      const nowIso = new Date().toISOString();

      prod.currentStock = Math.max(0, newStock);
      if (costPrice !== undefined && costPrice > 0) prod.costPrice = costPrice;
      if (sellingPrice !== undefined && sellingPrice > 0) prod.sellingPrice = sellingPrice;
      if (mrp !== undefined && mrp > 0) prod.mrp = mrp;
      prod.updatedAt = nowIso;

      prodStore.put(prod);

      if (delta !== 0) {
        const mov: StockMovement = {
          id: `mov-adj-${Date.now()}-${productId}`,
          shopId,
          productId: prod.id,
          productName: prod.name,
          barcode: prod.barcode,
          movementType: 'ADJUSTMENT',
          quantity: delta,
          unitPrice: prod.costPrice,
          reason: reason || 'Physical Stock Audit Count Adjustment',
          timestamp: nowIso,
          createdBy: 'Stock Manager'
        };
        movStore.add(mov);
      }

      tx.oncomplete = () => resolve(prod);
      tx.onerror = () => reject(tx.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

// Supplier Payments
export async function recordSupplierPayment(
  paymentData: Omit<SupplierPayment, 'id' | 'createdAt'>
): Promise<SupplierPayment> {
  const db = await openAppDatabase();

  return new Promise((resolve, reject) => {
    const storeNames = ['supplierPayments', 'suppliers'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const payStore = tx.objectStore('supplierPayments');
    const supStore = tx.objectStore('suppliers');

    const payment: SupplierPayment = {
      ...paymentData,
      id: `spay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };

    payStore.add(payment);

    // Reduce supplier balance
    const supReq = supStore.get(payment.supplierId);
    supReq.onsuccess = () => {
      const sup = supReq.result as Supplier | undefined;
      if (sup) {
        sup.currentBalance = Math.max(0, (sup.currentBalance || 0) - payment.amount);
        sup.updatedAt = new Date().toISOString();
        supStore.put(sup);
      }
    };

    // Auto-record Bank DEBIT if paid via Bank or UPI
    if (
      (payment.paymentMode === 'BANK_TRANSFER' || payment.paymentMode === 'UPI') &&
      payment.amount > 0 &&
      db.objectStoreNames.contains('bankEntries')
    ) {
      const bankStore = tx.objectStore('bankEntries');
      const bankEntry: BankEntry = {
        id: `bank-spay-${payment.id}`,
        shopId: payment.shopId,
        date: payment.paymentDate,
        type: 'DEBIT',
        category: 'SUPPLIER_PAYMENT',
        amount: payment.amount,
        referenceNumber: payment.referenceNumber || `PAY-${payment.id.slice(-6)}`,
        description: `Direct Supplier Payment to ${payment.supplierName}${payment.notes ? ` (${payment.notes})` : ''}`,
        partyName: payment.supplierName,
        paymentMode: payment.paymentMode === 'UPI' ? 'UPI' : 'NEFT_RTGS',
        sourceId: payment.id,
        createdAt: payment.createdAt
      };
      bankStore.put(bankEntry);
    }

    tx.oncomplete = () => resolve(payment);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSupplierPayments(shopId: string, supplierId?: string): Promise<SupplierPayment[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('supplierPayments', 'readonly');
    const store = tx.objectStore('supplierPayments');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as SupplierPayment[]) || [];
      if (supplierId) {
        list = list.filter(p => p.supplierId === supplierId);
      }
      list.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

// ==========================================
// EXPENSES OPERATIONS
// ==========================================

export async function createExpense(
  expenseData: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const storeNames = ['expenses'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');
    const store = tx.objectStore('expenses');

    const expense: Expense = {
      ...expenseData,
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };

    store.add(expense);

    // If paid via Bank or UPI, also record into bank entries
    if (
      (expense.paymentMode === 'BANK_TRANSFER' || expense.paymentMode === 'UPI') &&
      expense.amount > 0 &&
      db.objectStoreNames.contains('bankEntries')
    ) {
      const bankStore = tx.objectStore('bankEntries');
      const bankEntry: BankEntry = {
        id: `bank-exp-${expense.id}`,
        shopId: expense.shopId,
        date: expense.date,
        type: 'DEBIT',
        category: 'EXPENSE',
        amount: expense.amount,
        referenceNumber: `EXP-${expense.id.slice(-6)}`,
        description: `Operational Expense: ${expense.category}${expense.notes ? ` - ${expense.notes}` : ''}`,
        partyName: expense.category,
        paymentMode: expense.paymentMode === 'UPI' ? 'UPI' : 'NEFT_RTGS',
        sourceId: expense.id,
        createdAt: expense.createdAt
      };
      bankStore.put(bankEntry);
    }

    tx.oncomplete = () => resolve(expense);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getExpensesByShop(shopId: string, dateStr?: string): Promise<Expense[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readonly');
    const store = tx.objectStore('expenses');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as Expense[]) || [];
      if (dateStr) {
        list = list.filter(e => e.date === dateStr);
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readwrite');
    const store = tx.objectStore('expenses');
    const req = store.delete(expenseId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================================
// BANK ENTRIES & STATEMENT OPERATIONS (PASSBOOK)
// ==========================================

export async function getBankEntriesByShop(
  shopId: string,
  startDate?: string,
  endDate?: string,
  category?: string
): Promise<BankEntry[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('bankEntries')) {
      return resolve([]);
    }
    const tx = db.transaction('bankEntries', 'readonly');
    const store = tx.objectStore('bankEntries');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      let list = (req.result as BankEntry[]) || [];
      if (startDate) {
        list = list.filter(e => e.date >= startDate);
      }
      if (endDate) {
        list = list.filter(e => e.date <= endDate);
      }
      if (category && category !== 'ALL') {
        list = list.filter(e => e.category === category);
      }
      // Sort newest date first
      list.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveBankEntry(
  entryData: Omit<BankEntry, 'id' | 'createdAt'> & { id?: string }
): Promise<BankEntry> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('bankEntries')) {
      return reject(new Error('Bank entries store is not available'));
    }
    const tx = db.transaction('bankEntries', 'readwrite');
    const store = tx.objectStore('bankEntries');

    const entry: BankEntry = {
      ...entryData,
      id: entryData.id || `bank-man-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBankEntry(id: string): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('bankEntries')) {
      return resolve();
    }
    const tx = db.transaction('bankEntries', 'readwrite');
    const store = tx.objectStore('bankEntries');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getBankStatementSummary(
  shopId: string,
  startDate?: string,
  endDate?: string
): Promise<BankStatementSummary> {
  const entries = await getBankEntriesByShop(shopId, startDate, endDate);
  let totalCredits = 0;
  let totalDebits = 0;
  let upiSalesTotal = 0;
  let upiSalesCount = 0;
  let supplierPaymentsTotal = 0;
  let cashDepositsTotal = 0;

  for (const e of entries) {
    if (e.type === 'CREDIT') {
      totalCredits += e.amount;
      if (e.category === 'UPI_SALE') {
        upiSalesTotal += e.amount;
        upiSalesCount += 1;
      } else if (e.category === 'CASH_DEPOSIT') {
        cashDepositsTotal += e.amount;
      }
    } else {
      totalDebits += e.amount;
      if (e.category === 'SUPPLIER_PAYMENT') {
        supplierPaymentsTotal += e.amount;
      }
    }
  }

  return {
    totalCredits,
    totalDebits,
    netBalance: totalCredits - totalDebits,
    upiSalesTotal,
    upiSalesCount,
    supplierPaymentsTotal,
    cashDepositsTotal
  };
}

// ==========================================
// REPORTS CALCULATIONS (RECONCILED WITH COGS & EXPENSES)
// ==========================================

export async function getDailyStockReport(
  shopId: string,
  targetDate: string // YYYY-MM-DD
): Promise<DailyStockReportRow[]> {
  const products = await getProductsByShop(shopId);
  const movements = await getStockMovementsByShop(shopId);

  const dayStart = new Date(`${targetDate}T00:00:00.000`).getTime();
  const dayEnd = new Date(`${targetDate}T23:59:59.999`).getTime();

  return products.map(p => {
    const prodMovements = movements.filter(m => m.productId === p.id);

    // Movements occurring TODAY
    const todayMovements = prodMovements.filter(m => {
      const t = new Date(m.timestamp).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    let stockIn = 0;
    let salesQty = 0;
    let stockOut = 0;

    for (const m of todayMovements) {
      if (m.movementType === 'IN' || m.movementType === 'PURCHASE' || m.movementType === 'SALE_RETURN') {
        stockIn += m.quantity;
      } else if (m.movementType === 'SALE') {
        salesQty += m.quantity;
      } else if (
        m.movementType === 'OUT' ||
        m.movementType === 'PURCHASE_CANCEL' ||
        m.movementType === 'EXPIRY_DAMAGE'
      ) {
        stockOut += m.quantity;
      } else if (m.movementType === 'ADJUSTMENT') {
        if (m.quantity > 0) stockIn += m.quantity;
        else stockOut += Math.abs(m.quantity);
      }
    }

    // Movements occurring AFTER target day
    const afterDayMovements = prodMovements.filter(m => new Date(m.timestamp).getTime() > dayEnd);
    let afterDelta = 0;
    for (const m of afterDayMovements) {
      if (m.movementType === 'IN' || m.movementType === 'PURCHASE' || m.movementType === 'SALE_RETURN') {
        afterDelta += m.quantity;
      } else if (
        m.movementType === 'SALE' ||
        m.movementType === 'OUT' ||
        m.movementType === 'PURCHASE_CANCEL' ||
        m.movementType === 'EXPIRY_DAMAGE'
      ) {
        afterDelta -= m.quantity;
      } else if (m.movementType === 'ADJUSTMENT') {
        afterDelta += m.quantity;
      }
    }

    const closingStock = Math.max(0, p.currentStock - afterDelta);
    const netTodayChange = stockIn - salesQty - stockOut;
    const openingStock = Math.max(0, closingStock - netTodayChange);

    return {
      productId: p.id,
      productName: p.name,
      barcode: p.barcode,
      category: p.category,
      unit: p.unit,
      openingStock,
      stockIn,
      salesQty,
      stockOut,
      closingStock,
      minStockAlert: p.minStockAlert,
      isLowStock: closingStock <= p.minStockAlert
    };
  });
}

export async function getDailySalesReport(
  shopId: string,
  targetDate: string // YYYY-MM-DD
): Promise<DailySalesReportSummary> {
  const allSales = await getSalesByShop(shopId, targetDate);
  const completedSales = allSales.filter(s => s.status === 'COMPLETED');
  const cancelledSales = allSales.filter(s => s.status === 'CANCELLED');

  let totalAmount = 0;
  let totalCostOfGoodsSold = 0;
  let totalItemsSold = 0;
  let cashAmount = 0;
  let upiAmount = 0;
  let cardAmount = 0;
  let creditAmount = 0;

  const productMap = new Map<string, {
    productId: string;
    productName: string;
    barcode: string;
    category: any;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }>();

  for (const bill of completedSales) {
    totalAmount += bill.finalAmount;
    if (bill.paymentMode === 'CASH') cashAmount += bill.finalAmount;
    else if (bill.paymentMode === 'UPI') upiAmount += bill.finalAmount;
    else if (bill.paymentMode === 'CARD') cardAmount += bill.finalAmount;
    else if (bill.paymentMode === 'CREDIT') creditAmount += bill.finalAmount;

    for (const item of bill.items) {
      totalItemsSold += item.quantity;
      const itemCost = (item.costPrice || 0) * item.quantity;
      totalCostOfGoodsSold += itemCost;

      const current = productMap.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        category: 'Dairy',
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0
      };
      current.quantitySold += item.quantity;
      current.revenue += item.total;
      current.cost += itemCost;
      current.profit = current.revenue - current.cost;
      productMap.set(item.productId, current);
    }
  }

  const grossProfit = Math.round((totalAmount - totalCostOfGoodsSold) * 100) / 100;

  return {
    date: targetDate,
    totalBills: completedSales.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalCostOfGoodsSold: Math.round(totalCostOfGoodsSold * 100) / 100,
    grossProfit,
    totalItemsSold,
    cashAmount: Math.round(cashAmount * 100) / 100,
    upiAmount: Math.round(upiAmount * 100) / 100,
    cardAmount: Math.round(cardAmount * 100) / 100,
    creditAmount: Math.round(creditAmount * 100) / 100,
    cancelledBillsCount: cancelledSales.length,
    bills: allSales,
    productSummaries: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue)
  };
}

export async function getDailyFinancialSummary(
  shopId: string,
  targetDate: string
): Promise<DailyFinancialSummary> {
  const [salesSummary, purchases, expenses, suppliers] = await Promise.all([
    getDailySalesReport(shopId, targetDate),
    getPurchasesByShop(shopId, targetDate),
    getExpensesByShop(shopId, targetDate),
    getSuppliersByShop(shopId)
  ]);

  const confirmedPurchases = purchases.filter(p => p.status === 'CONFIRMED');
  const purchasesTotal = confirmedPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  const grossProfit = salesSummary.grossProfit;
  const netOperatingProfit = Math.round((grossProfit - expensesTotal) * 100) / 100;
  const supplierPayables = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);

  return {
    date: targetDate,
    salesRevenue: salesSummary.totalAmount,
    costOfGoodsSold: salesSummary.totalCostOfGoodsSold,
    grossProfit,
    purchasesTotal: Math.round(purchasesTotal * 100) / 100,
    expensesTotal: Math.round(expensesTotal * 100) / 100,
    netOperatingProfit,
    cashInHand: salesSummary.cashAmount,
    upiInBank: salesSummary.upiAmount,
    supplierPayables: Math.round(supplierPayables * 100) / 100
  };
}

// ==========================================
// AUTOMATED BACKUP ENGINE WITH MANIFEST & CHECKSUM
// ==========================================

export async function exportDatabaseToJson(shopId?: string): Promise<LocalDatabaseExport> {
  const db = await openAppDatabase();
  const shops = await getAllShops();
  const targetShopId = shopId && shopId !== 'all' ? shopId : 'all';

  return new Promise((resolve, reject) => {
    const storeNames = ['shops', 'products', 'stockMovements', 'sales', 'purchases', 'suppliers', 'supplierPayments', 'expenses'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readonly');

    const sStore = tx.objectStore('shops');
    const pStore = tx.objectStore('products');
    const mStore = tx.objectStore('stockMovements');
    const bStore = tx.objectStore('sales');
    const purStore = tx.objectStore('purchases');
    const supStore = tx.objectStore('suppliers');
    const payStore = tx.objectStore('supplierPayments');
    const expStore = tx.objectStore('expenses');
    const bankStore = db.objectStoreNames.contains('bankEntries') ? tx.objectStore('bankEntries') : null;

    const sReq = sStore.getAll();
    const pReq = pStore.getAll();
    const mReq = mStore.getAll();
    const bReq = bStore.getAll();
    const purReq = purStore.getAll();
    const supReq = supStore.getAll();
    const payReq = payStore.getAll();
    const expReq = expStore.getAll();
    const bankReq = bankStore ? bankStore.getAll() : null;

    tx.oncomplete = async () => {
      let filteredShops = sReq.result as Shop[];
      let filteredProds = pReq.result as Product[];
      let filteredMovs = mReq.result as StockMovement[];
      let filteredBills = bReq.result as SaleBill[];
      let filteredPurs = purReq.result as PurchaseBill[];
      let filteredSups = supReq.result as Supplier[];
      let filteredPays = payReq.result as SupplierPayment[];
      let filteredExps = expReq.result as Expense[];
      let filteredBank = bankReq ? (bankReq.result as BankEntry[]) : [];

      if (shopId && shopId !== 'all') {
        filteredShops = filteredShops.filter(s => s.id === shopId);
        filteredProds = filteredProds.filter(p => p.shopId === shopId);
        filteredMovs = filteredMovs.filter(m => m.shopId === shopId);
        filteredBills = filteredBills.filter(b => b.shopId === shopId);
        filteredPurs = filteredPurs.filter(p => p.shopId === shopId);
        filteredSups = filteredSups.filter(s => s.shopId === shopId);
        filteredPays = filteredPays.filter(p => p.shopId === shopId);
        filteredExps = filteredExps.filter(e => e.shopId === shopId);
        filteredBank = filteredBank.filter(e => e.shopId === shopId);
      }

      const rawExport = {
        shops: filteredShops,
        products: filteredProds,
        stockMovements: filteredMovs,
        sales: filteredBills,
        purchases: filteredPurs,
        suppliers: filteredSups,
        supplierPayments: filteredPays,
        expenses: filteredExps,
        bankEntries: filteredBank
      };

      const checksum = await generateDataChecksum(JSON.stringify(rawExport));
      const nowIso = new Date().toISOString();

      const manifest: BackupManifest = {
        version: DB_VERSION,
        exportedAt: nowIso,
        shopId: targetShopId,
        appName: 'Amul Parlour Web POS',
        counts: {
          shops: filteredShops.length,
          products: filteredProds.length,
          stockMovements: filteredMovs.length,
          sales: filteredBills.length,
          purchases: filteredPurs.length,
          suppliers: filteredSups.length,
          supplierPayments: filteredPays.length,
          expenses: filteredExps.length,
          bankEntries: filteredBank.length
        },
        checksum,
        generator: 'Amul Parlour Local-First IndexedDB Engine'
      };

      const backup: LocalDatabaseExport = {
        manifest,
        ...rawExport
      };

      resolve(backup);
    };

    tx.onerror = () => reject(tx.error);
  });
}

export async function createFullBackup(
  shopId: string,
  type: 'AUTO' | 'MANUAL' | 'SAFETY_PRE_RESTORE' = 'MANUAL'
): Promise<StoredBackupRecord> {
  const exportData = await exportDatabaseToJson(shopId);
  const db = await openAppDatabase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const backupRecord: StoredBackupRecord = {
    id: `bkp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    shopId,
    backupDate: todayStr,
    createdAt: nowIso,
    type,
    manifest: exportData.manifest,
    data: exportData
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['backups', 'appSettings'], 'readwrite');
    const bkpStore = tx.objectStore('backups');
    const setStore = tx.objectStore('appSettings');

    bkpStore.add(backupRecord);

    // Update settings with last backup status
    const currentSettingsReq = setStore.get('backup_settings');
    currentSettingsReq.onsuccess = () => {
      const current = (currentSettingsReq.result?.value as BackupSettings) || {
        autoBackupEnabled: true,
        scheduledTime: '20:00',
        retentionDays: 14
      };

      current.lastBackupDate = todayStr;
      current.lastBackupTimestamp = nowIso;
      current.lastBackupStatus = 'SUCCESS';
      current.lastBackupError = undefined;

      setStore.put({ key: 'backup_settings', value: current });
    };

    tx.oncomplete = () => resolve(backupRecord);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredBackups(shopId: string): Promise<StoredBackupRecord[]> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readonly');
    const store = tx.objectStore('backups');
    const index = store.index('shopId');
    const req = index.getAll(shopId);

    req.onsuccess = () => {
      const list = (req.result as StoredBackupRecord[]) || [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const db = await openAppDatabase();
  return new Promise((resolve) => {
    const tx = db.transaction('appSettings', 'readonly');
    const store = tx.objectStore('appSettings');
    const req = store.get('backup_settings');

    req.onsuccess = () => {
      if (req.result?.value) {
        resolve(req.result.value as BackupSettings);
      } else {
        // Defaults: 8:00 PM (20:00) with 14-day retention
        resolve({
          autoBackupEnabled: true,
          scheduledTime: '20:00',
          retentionDays: 14
        });
      }
    };
    req.onerror = () => {
      resolve({
        autoBackupEnabled: true,
        scheduledTime: '20:00',
        retentionDays: 14
      });
    };
  });
}

export async function saveBackupSettings(settings: BackupSettings): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('appSettings', 'readwrite');
    const store = tx.objectStore('appSettings');
    const req = store.put({ key: 'backup_settings', value: settings });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Checks if a daily backup was missed (e.g. PC was shut down or browser was closed at 8:00 PM yesterday).
 */
export async function checkMissedBackups(shopId: string): Promise<{
  missed: boolean;
  lastBackupDate?: string;
  shouldBackupToday: boolean;
}> {
  const settings = await getBackupSettings();
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const [schedH, schedM] = settings.scheduledTime.split(':').map(Number);
  const schedDate = new Date();
  schedDate.setHours(schedH || 20, schedM || 0, 0, 0);

  const shouldBackupToday = now >= schedDate && settings.lastBackupDate !== todayStr;
  const missed = !settings.lastBackupDate || settings.lastBackupDate < todayStr;

  return {
    missed: missed && now > schedDate,
    lastBackupDate: settings.lastBackupDate,
    shouldBackupToday
  };
}

export async function importDatabaseFromJson(
  backup: LocalDatabaseExport,
  options?: { currentShopId?: string; createSafetySnapshot?: boolean }
): Promise<{ success: boolean; message: string; manifest?: BackupManifest; safetyBackupId?: string }> {
  if (!backup || !backup.shops || !backup.products || !backup.sales) {
    throw new Error('Invalid backup schema. Required "shops", "products", or "sales" missing.');
  }

  // 1. Automatic safety backup of current data before restoration
  let safetyBackupId: string | undefined = undefined;
  if (options?.createSafetySnapshot !== false) {
    try {
      const activeShopId = options?.currentShopId || (backup.shops[0]?.id) || 'all';
      const safetyRecord = await createFullBackup(activeShopId, 'SAFETY_PRE_RESTORE');
      safetyBackupId = safetyRecord.id;
    } catch (err) {
      console.warn('Pre-restore safety snapshot could not be created:', err);
    }
  }

  // 2. Check manifest and checksum if available
  if (backup.manifest?.checksum) {
    const rawExport = {
      shops: backup.shops,
      products: backup.products,
      stockMovements: backup.stockMovements || [],
      sales: backup.sales,
      purchases: backup.purchases || [],
      suppliers: backup.suppliers || [],
      supplierPayments: backup.supplierPayments || [],
      expenses: backup.expenses || []
    };
    const computedChecksum = await generateDataChecksum(JSON.stringify(rawExport));
    if (computedChecksum !== backup.manifest.checksum) {
      console.warn('Backup checksum mismatch. Proceeding with caution.');
    }
  }

  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const storeNames = ['shops', 'products', 'stockMovements', 'sales', 'purchases', 'suppliers', 'supplierPayments', 'expenses'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');

    const sStore = tx.objectStore('shops');
    const pStore = tx.objectStore('products');
    const mStore = tx.objectStore('stockMovements');
    const bStore = tx.objectStore('sales');
    const purStore = tx.objectStore('purchases');
    const supStore = tx.objectStore('suppliers');
    const payStore = tx.objectStore('supplierPayments');
    const expStore = tx.objectStore('expenses');
    const bankStore = db.objectStoreNames.contains('bankEntries') ? tx.objectStore('bankEntries') : null;

    for (const s of backup.shops) sStore.put(s);
    for (const p of backup.products) pStore.put(p);
    for (const m of backup.stockMovements || []) mStore.put(m);
    for (const b of backup.sales) bStore.put(b);
    for (const pur of backup.purchases || []) purStore.put(pur);
    for (const sup of backup.suppliers || []) supStore.put(sup);
    for (const pay of backup.supplierPayments || []) payStore.put(pay);
    for (const exp of backup.expenses || []) expStore.put(exp);
    if (bankStore && backup.bankEntries) {
      for (const entry of backup.bankEntries) bankStore.put(entry);
    }

    tx.oncomplete = () => {
      resolve({
        success: true,
        message: `Restored ${backup.shops.length} shop(s), ${backup.products.length} products, ${backup.sales.length} sales bills, ${backup.purchases?.length || 0} purchase invoices, and ${backup.bankEntries?.length || 0} bank entries.`,
        manifest: backup.manifest,
        safetyBackupId
      });
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Reverts the database to a previously stored snapshot by record ID.
 */
export async function restoreFromStoredBackup(
  backupRecordId: string,
  options?: { currentShopId?: string; createSafetySnapshot?: boolean }
): Promise<{ success: boolean; message: string; safetyBackupId?: string }> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readonly');
    const store = tx.objectStore('backups');
    const req = store.get(backupRecordId);

    req.onsuccess = async () => {
      const record = req.result as StoredBackupRecord | undefined;
      if (!record || !record.data) {
        reject(new Error(`Backup record ${backupRecordId} not found or corrupted.`));
        return;
      }

      try {
        const result = await importDatabaseFromJson(record.data, options);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    req.onerror = () => reject(req.error);
  });
}

export async function resetDatabaseToFactoryDefaults(): Promise<void> {
  const db = await openAppDatabase();
  return new Promise((resolve, reject) => {
    const storeNames = ['shops', 'products', 'stockMovements', 'sales', 'purchases', 'suppliers', 'supplierPayments', 'expenses', 'backups'];
    if (db.objectStoreNames.contains('bankEntries')) {
      storeNames.push('bankEntries');
    }
    const tx = db.transaction(storeNames, 'readwrite');

    tx.objectStore('shops').clear();
    tx.objectStore('products').clear();
    tx.objectStore('stockMovements').clear();
    tx.objectStore('sales').clear();
    tx.objectStore('purchases').clear();
    tx.objectStore('suppliers').clear();
    tx.objectStore('supplierPayments').clear();
    tx.objectStore('expenses').clear();
    tx.objectStore('backups').clear();
    if (db.objectStoreNames.contains('bankEntries')) {
      tx.objectStore('bankEntries').clear();
    }

    tx.oncomplete = async () => {
      await ensureSeedData(db);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
