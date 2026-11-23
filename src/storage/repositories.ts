/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unified Repository Layer (Data Access Pattern)
 * Provides seamless abstraction between Local-First IndexedDB and
 * the shared PostgreSQL / Node.js backend when VITE_API_BASE_URL is configured.
 */

import {
  BackupSettings,
  BankEntry,
  BankStatementSummary,
  CrateSummary,
  CrateTransaction,
  DailyFinancialSummary,
  DailySalesReportSummary,
  DailyStockReportRow,
  DayCloseRecord,
  Expense,
  LocalDatabaseExport,
  Product,
  PurchaseBill,
  SaleBill,
  Shop,
  StockMovement,
  StoredBackupRecord,
  Supplier,
  SupplierPayment
} from '../types/index.ts';
import * as localDb from './db.ts';
import {
  syncShopToCloud,
  deleteShopFromCloud,
  syncProductToCloud,
  deleteProductFromCloud,
  syncSaleBillAtomicallyToCloud,
  syncSaleCancellationAtomicallyToCloud,
  syncStockMovementAtomicallyToCloud,
  syncSupplierPaymentAtomicallyToCloud,
  syncExpenseToCloud,
  deleteExpenseFromCloud,
  syncBankEntryToCloud,
  deleteBankEntryFromCloud,
  syncPurchaseBillAtomicallyToCloud,
  deletePurchaseBillFromCloud,
  syncSupplierToCloud,
  deleteSupplierFromCloud,
  fetchPurchasesFromCloud,
  fetchSalesFromCloud,
  fetchSuppliersFromCloud,
  fetchShopsFromCloud,
  fetchShopByIdFromCloud,
  mergeCloudAndLocalShops,
  hasShopLoadedFromCloud,
  DEFAULT_HISTORY_QUERY_LIMIT,
  fetchCratesFromCloud,
  subscribeToCrates,
  recordCrateTransactionToCloud,
  deleteCrateTransactionFromCloud,
  saveDayCloseToCloud,
  getDayCloseHistoryFromCloud
} from './firestoreSync.ts';

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export const isBackendConnected = (): boolean => {
  return Boolean(API_BASE_URL && API_BASE_URL.trim().length > 0);
};

export const AppRepository = {
  // 1. Shops
  shops: {
    getAll: async (): Promise<Shop[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/shops`);
        if (!res.ok) throw new Error('Failed to fetch shops from backend');
        return res.json();
      }
      const [localShops, remoteShops] = await Promise.all([
        localDb.getAllShops(),
        fetchShopsFromCloud().catch(() => [])
      ]);
      return mergeCloudAndLocalShops(remoteShops, localShops);
    },
    getById: async (id: string): Promise<Shop | null> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/shops/${id}`);
        if (!res.ok) return null;
        return res.json();
      }
      const local = await localDb.getShopById(id);
      if (local) return local;
      return fetchShopByIdFromCloud(id);
    },
    save: async (shop: Shop): Promise<Shop> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/shops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shop)
        });
        if (!res.ok) throw new Error('Failed to save shop to backend');
        return res.json();
      }
      const saved = await localDb.saveShop(shop);
      syncShopToCloud(saved).catch(() => {});
      return saved;
    },
    delete: async (id: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/shops/${id}`, { method: 'DELETE' });
        return;
      }
      await localDb.deleteShop(id);
      deleteShopFromCloud(id).catch(() => {});
    }
  },

  // 2. Products & Catalog
  products: {
    getByShop: async (shopId: string): Promise<Product[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/products?shopId=${shopId}`);
        if (!res.ok) throw new Error('Failed to fetch products from backend');
        return res.json();
      }
      return localDb.getProductsByShop(shopId);
    },
    getByBarcode: async (shopId: string, barcode: string): Promise<Product | null> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/products/barcode?shopId=${shopId}&barcode=${barcode}`);
        if (!res.ok) return null;
        return res.json();
      }
      return localDb.getProductByBarcode(shopId, barcode);
    },
    save: async (product: Product): Promise<Product> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(product)
        });
        if (!res.ok) throw new Error('Failed to save product');
        return res.json();
      }
      const saved = await localDb.saveProduct(product);
      syncProductToCloud(saved).catch(() => {});
      return saved;
    },
    delete: async (productId: string, shopId?: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/products/${productId}`, { method: 'DELETE' });
        return;
      }
      const existing = shopId ? null : await localDb.getProductById(productId);
      const resolvedShopId = shopId || existing?.shopId;
      await localDb.deleteProduct(productId, resolvedShopId);
      await deleteProductFromCloud(productId, resolvedShopId);
    },
    mergeDuplicates: async (
      shopId: string,
      primaryProduct: Product,
      duplicateProducts: Product[]
    ): Promise<{ primary: Product; deletedIds: string[] }> => {
      if (isBackendConnected()) {
        const mergedStock =
          (primaryProduct.currentStock || 0) +
          duplicateProducts.reduce((sum, d) => sum + (d.currentStock || 0), 0);
        const updatedPrimary: Product = {
          ...primaryProduct,
          currentStock: mergedStock,
          updatedAt: new Date().toISOString()
        };
        const res = await fetch(`${API_BASE_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedPrimary)
        });
        if (!res.ok) throw new Error('Failed to save merged primary product');
        const saved = await res.json();
        for (const dup of duplicateProducts) {
          if (dup.id && dup.id !== primaryProduct.id) {
            await fetch(`${API_BASE_URL}/api/products/${dup.id}`, { method: 'DELETE' });
          }
        }
        return {
          primary: saved,
          deletedIds: duplicateProducts.filter(d => d.id !== primaryProduct.id).map(d => d.id)
        };
      }

      const { primary: updatedPrimary, deletedIds } = await localDb.mergeDuplicateProducts(
        shopId,
        primaryProduct,
        duplicateProducts
      );

      // Persist updated primary product stock immediately with setDoc(..., { merge: true })
      await syncProductToCloud(updatedPrimary);

      // Permanently delete all merged duplicate docs from Cloud Firestore (shops/{shopId}/products & root)
      await Promise.all(deletedIds.map(dupId => deleteProductFromCloud(dupId, shopId)));

      return { primary: updatedPrimary, deletedIds };
    },
    syncPreFilledCatalog: async (shopId: string): Promise<{ added: number; total: number }> => {
      return localDb.syncPreFilledAmulCatalogForShop(shopId);
    },
    prefillMasterCatalog: async (shopId: string, overwriteExisting = false): Promise<Product[]> => {
      const list = await localDb.prefillMasterAmulCatalogWithZeroStock(shopId, overwriteExisting);
      // Batch sync products to Firestore in background
      list.forEach(p => syncProductToCloud(p).catch(() => {}));
      return list;
    }
  },

  // 3. Stock & Inventory Movements
  inventory: {
    recordMovement: async (movement: Omit<StockMovement, 'id' | 'timestamp'>): Promise<StockMovement> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/inventory/movements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(movement)
        });
        if (!res.ok) throw new Error('Failed to record stock movement');
        return res.json();
      }
      const savedMovement = await localDb.recordStockMovement(movement);
      const updatedProd = await localDb.getProductById(movement.productId).catch(() => null);
      await syncStockMovementAtomicallyToCloud(savedMovement, updatedProd).catch(() => {});
      return savedMovement;
    },
    getMovements: async (shopId: string, startDate?: string, endDate?: string): Promise<StockMovement[]> => {
      if (isBackendConnected()) {
        const query = new URLSearchParams({ shopId, ...(startDate && { startDate }), ...(endDate && { endDate }) });
        const res = await fetch(`${API_BASE_URL}/api/inventory/movements?${query.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch stock movements');
        return res.json();
      }
      return localDb.getStockMovementsByShop(shopId, startDate, endDate);
    },
    adjustStockAndPrices: async (
      shopId: string,
      productId: string,
      newStock: number,
      costPrice?: number,
      sellingPrice?: number,
      mrp?: number,
      reason?: string
    ): Promise<Product> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/inventory/adjust`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId, productId, newStock, costPrice, sellingPrice, mrp, reason })
        });
        if (!res.ok) throw new Error('Failed to adjust stock and prices');
        return res.json();
      }
      const updated = await localDb.adjustStockAndPrices(shopId, productId, newStock, costPrice, sellingPrice, mrp, reason);
      syncProductToCloud(updated).catch(() => {});
      return updated;
    }
  },

  // 4. Sales & POS Billing
  sales: {
    createBill: async (billData: Omit<SaleBill, 'id' | 'createdAt'>): Promise<SaleBill> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(billData)
        });
        if (!res.ok) throw new Error('Failed to process sale bill');
        return res.json();
      }
      const bill = await localDb.createSaleBill(billData);
      const uniqueProdIds = Array.from(new Set(bill.items.map((i) => i.productId).filter(Boolean)));
      const updatedProducts = (
        await Promise.all(uniqueProdIds.map((pid) => localDb.getProductById(pid).catch(() => null)))
      ).filter((p): p is Product => Boolean(p));
      let upiBankEntry: BankEntry | null = null;
      if (bill.paymentMode === 'UPI') {
        const nowIso = bill.timestamp || new Date().toISOString();
        upiBankEntry = {
          id: `bank-upi-${bill.id}`,
          shopId: bill.shopId,
          date: nowIso.split('T')[0],
          type: 'CREDIT',
          category: 'UPI_SALE',
          amount: bill.finalAmount,
          referenceNumber: bill.billNumber,
          description: `Customer POS Bill #${bill.billNumber} (${bill.itemCount} items)`,
          partyName: bill.customerPhone || bill.customerName || 'Counter Customer',
          paymentMode: 'UPI',
          sourceId: bill.id,
          createdAt: nowIso
        };
      }
      await syncSaleBillAtomicallyToCloud(bill, updatedProducts, upiBankEntry).catch(() => {});
      return bill;
    },
    getAll: async (): Promise<SaleBill[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/sales`);
        if (!res.ok) throw new Error('Failed to fetch all sales');
        return res.json();
      }
      return localDb.getAllSales();
    },
    getByShop: async (shopId: string, dateStr?: string): Promise<SaleBill[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/sales?shopId=${shopId}${dateStr ? `&date=${dateStr}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch sales');
        return res.json();
      }
      return localDb.getSalesByShop(shopId, dateStr);
    },
    loadOlderFromCloud: async (
      shopId: string,
      limitCount: number = DEFAULT_HISTORY_QUERY_LIMIT * 2
    ): Promise<SaleBill[]> => {
      if (isBackendConnected()) {
        return AppRepository.sales.getByShop(shopId);
      }
      await fetchSalesFromCloud(shopId, limitCount).catch(() => []);
      return localDb.getSalesByShop(shopId);
    },
    cancelBill: async (billId: string, shopId: string, reason: string): Promise<SaleBill> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/sales/${billId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId, reason })
        });
        if (!res.ok) throw new Error('Failed to cancel bill');
        return res.json();
      }
      const cancelled = await localDb.cancelSaleBill(billId, shopId, reason);
      const uniqueProdIds = Array.from(new Set(cancelled.items.map((i) => i.productId).filter(Boolean)));
      const restoredProducts = (
        await Promise.all(uniqueProdIds.map((pid) => localDb.getProductById(pid).catch(() => null)))
      ).filter((p): p is Product => Boolean(p));
      let reversalEntry: BankEntry | null = null;
      if (cancelled.paymentMode === 'UPI') {
        const bankList = await localDb.getBankEntriesByShop(shopId).catch(() => []);
        reversalEntry = bankList.find((b) => b.sourceId === cancelled.id && b.type === 'DEBIT') || null;
      }
      await syncSaleCancellationAtomicallyToCloud(cancelled, restoredProducts, reversalEntry).catch(() => {});
      return cancelled;
    }
  },

  // 5. Purchases & Suppliers
  purchases: {
    createBill: async (billData: Omit<PurchaseBill, 'id' | 'createdAt' | 'updatedAt'>): Promise<PurchaseBill> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(billData)
        });
        if (!res.ok) throw new Error('Failed to record purchase bill');
        return res.json();
      }
      const created = await localDb.createPurchaseBill(billData);
      let updatedProducts: Product[] = [];
      let updatedSupplier: Supplier | null = null;
      if (created.stockPosted) {
        const productIds = Array.from(new Set(created.items.map(i => i.productId).filter(Boolean)));
        updatedProducts = (
          await Promise.all(productIds.map(pid => localDb.getProductById(pid).catch(() => null)))
        ).filter((p): p is Product => Boolean(p));
        if (created.supplierId) {
          const sups = await localDb.getSuppliersByShop(created.shopId).catch(() => []);
          updatedSupplier = sups.find(s => s.id === created.supplierId) || null;
        }
      }
      await syncPurchaseBillAtomicallyToCloud(created, updatedProducts, updatedSupplier).catch(() => {});
      return created;
    },
    updateBill: async (
      billId: string,
      shopId: string,
      updatedData: {
        purchaseInvoiceNumber?: string;
        billNumber?: string;
        agencyName?: string;
        supplierId?: string;
        supplierName?: string;
        purchaseDate?: string;
        items: any[];
        paymentMode?: any;
        paidAmount?: number;
        status?: any;
        notes?: string;
      }
    ): Promise<PurchaseBill> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases/${billId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId, ...updatedData })
        });
        if (!res.ok) throw new Error('Failed to update purchase bill');
        return res.json();
      }
      const updated = await localDb.updatePurchaseBill(billId, shopId, updatedData);
      let updatedProducts: Product[] = [];
      let updatedSupplier: Supplier | null = null;
      if (updated.stockPosted || updated.status === 'CONFIRMED') {
        const productIds = Array.from(new Set(updated.items.map(i => i.productId).filter(Boolean)));
        updatedProducts = (
          await Promise.all(productIds.map(pid => localDb.getProductById(pid).catch(() => null)))
        ).filter((p): p is Product => Boolean(p));
        if (updated.supplierId) {
          const sups = await localDb.getSuppliersByShop(shopId).catch(() => []);
          updatedSupplier = sups.find(s => s.id === updated.supplierId) || null;
        }
      }
      await syncPurchaseBillAtomicallyToCloud(updated, updatedProducts, updatedSupplier).catch(() => {});
      return updated;
    },
    getByShop: async (shopId: string, dateStr?: string): Promise<PurchaseBill[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases?shopId=${shopId}${dateStr ? `&date=${dateStr}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch purchases');
        return res.json();
      }
      if (!hasShopLoadedFromCloud(shopId, 'purchases')) {
        try {
          const [cloudBills, deletedIds] = await Promise.all([
            fetchPurchasesFromCloud(shopId, DEFAULT_HISTORY_QUERY_LIMIT),
            localDb.loadDeletedPurchaseIds()
          ]);
          if (cloudBills && cloudBills.length > 0) {
            for (const b of cloudBills) {
              if (!deletedIds.has(b.id)) {
                await localDb.savePurchaseBill(b);
              }
            }
          }
        } catch {
          // Fallback to local
        }
      }
      return localDb.getPurchasesByShop(shopId, dateStr);
    },
    loadOlderFromCloud: async (
      shopId: string,
      limitCount: number = DEFAULT_HISTORY_QUERY_LIMIT * 2
    ): Promise<PurchaseBill[]> => {
      if (isBackendConnected()) {
        return AppRepository.purchases.getByShop(shopId);
      }
      try {
        const [cloudBills, deletedIds] = await Promise.all([
          fetchPurchasesFromCloud(shopId, limitCount),
          localDb.loadDeletedPurchaseIds()
        ]);
        if (cloudBills && cloudBills.length > 0) {
          for (const b of cloudBills) {
            if (!deletedIds.has(b.id)) {
              await localDb.savePurchaseBill(b);
            }
          }
        }
      } catch {
        // Fallback to local
      }
      return localDb.getPurchasesByShop(shopId);
    },
    cancelBill: async (billId: string, shopId: string, reason: string): Promise<PurchaseBill> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases/${billId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId, reason })
        });
        if (!res.ok) throw new Error('Failed to cancel purchase');
        return res.json();
      }
      const cancelled = await localDb.cancelPurchaseBill(billId, shopId, reason);
      const productIds = Array.from(new Set(cancelled.items.map(i => i.productId).filter(Boolean)));
      const updatedProducts = (
        await Promise.all(productIds.map(pid => localDb.getProductById(pid).catch(() => null)))
      ).filter((p): p is Product => Boolean(p));
      let updatedSupplier: Supplier | null = null;
      if (cancelled.supplierId) {
        const sups = await localDb.getSuppliersByShop(shopId).catch(() => []);
        updatedSupplier = sups.find(s => s.id === cancelled.supplierId) || null;
      }
      await syncPurchaseBillAtomicallyToCloud(cancelled, updatedProducts, updatedSupplier).catch(() => {});
      return cancelled;
    },
    deleteCancelledBill: async (billId: string, shopId: string): Promise<void> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases/${billId}?shopId=${encodeURIComponent(shopId)}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to permanently delete cancelled purchase bill');
      }
      await localDb.deleteCancelledPurchaseBill(billId, shopId);
      await deletePurchaseBillFromCloud(billId, shopId);
    }
  },

  suppliers: {
    getAll: async (shopId: string): Promise<Supplier[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers?shopId=${shopId}`);
        if (!res.ok) throw new Error('Failed to fetch suppliers');
        return res.json();
      }
      if (!hasShopLoadedFromCloud(shopId, 'suppliers')) {
        try {
          const [cloudSups, deletedIds] = await Promise.all([
            fetchSuppliersFromCloud(shopId),
            localDb.loadDeletedSupplierIds()
          ]);
          if (cloudSups && cloudSups.length > 0) {
            for (const s of cloudSups) {
              if (!deletedIds.has(s.id)) {
                await localDb.saveSupplier(s);
              }
            }
          }
        } catch {
          // Fallback to local
        }
      }
      return localDb.getSuppliersByShop(shopId);
    },
    save: async (supplier: Supplier): Promise<Supplier> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(supplier)
        });
        if (!res.ok) throw new Error('Failed to save supplier');
        return res.json();
      }
      const saved = await localDb.saveSupplier(supplier);
      syncSupplierToCloud(saved).catch(() => {});
      return saved;
    },
    recordPayment: async (paymentData: Omit<SupplierPayment, 'id' | 'createdAt'>): Promise<SupplierPayment> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentData)
        });
        if (!res.ok) throw new Error('Failed to record supplier payment');
        return res.json();
      }
      const savedPayment = await localDb.recordSupplierPayment(paymentData);
      const sups = await localDb.getSuppliersByShop(savedPayment.shopId).catch(() => []);
      const updatedSup = sups.find((s) => s.id === savedPayment.supplierId) || null;
      let autoBankEntry: BankEntry | null = null;
      if (savedPayment.paymentMode === 'BANK_TRANSFER' || savedPayment.paymentMode === 'UPI') {
        const bankList = await localDb.getBankEntriesByShop(savedPayment.shopId).catch(() => []);
        autoBankEntry = bankList.find((b) => b.id === `bank-spay-${savedPayment.id}`) || null;
      }
      await syncSupplierPaymentAtomicallyToCloud(savedPayment, updatedSup, autoBankEntry).catch(() => {});
      return savedPayment;
    },
    getPayments: async (shopId: string, supplierId?: string): Promise<SupplierPayment[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers/payments?shopId=${shopId}${supplierId ? `&supplierId=${supplierId}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch supplier payments');
        return res.json();
      }
      return localDb.getSupplierPayments(shopId, supplierId);
    },
    delete: async (supplierId: string, shopId?: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/suppliers/${supplierId}`, { method: 'DELETE' });
      }
      await localDb.deleteSupplier(supplierId, shopId);
      await deleteSupplierFromCloud(supplierId, shopId);
    }
  },

  // 6. Expenses
  expenses: {
    create: async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expenseData)
        });
        if (!res.ok) throw new Error('Failed to record expense');
        return res.json();
      }
      const exp = await localDb.createExpense(expenseData);
      syncExpenseToCloud(exp).catch(() => {});
      return exp;
    },
    getByShop: async (shopId: string, dateStr?: string): Promise<Expense[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/expenses?shopId=${shopId}${dateStr ? `&date=${dateStr}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch expenses');
        return res.json();
      }
      return localDb.getExpensesByShop(shopId, dateStr);
    },
    delete: async (expenseId: string, shopId?: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/expenses/${expenseId}`, { method: 'DELETE' });
        return;
      }
      await localDb.deleteExpense(expenseId);
      await deleteExpenseFromCloud(expenseId, shopId).catch(() => {});
    }
  },

  // 7. Banking & Passbook Statement
  banking: {
    getByShop: async (
      shopId: string,
      startDate?: string,
      endDate?: string,
      category?: string
    ): Promise<BankEntry[]> => {
      if (isBackendConnected()) {
        const params = new URLSearchParams({ shopId });
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (category) params.append('category', category);
        const res = await fetch(`${API_BASE_URL}/api/banking/entries?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch bank entries');
        return res.json();
      }
      return localDb.getBankEntriesByShop(shopId, startDate, endDate, category);
    },
    saveEntry: async (
      entry: Omit<BankEntry, 'id' | 'createdAt'> & { id?: string }
    ): Promise<BankEntry> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/banking/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
        if (!res.ok) throw new Error('Failed to save bank entry');
        return res.json();
      }
      const saved = await localDb.saveBankEntry(entry);
      await syncBankEntryToCloud(saved).catch(() => {});
      return saved;
    },
    deleteEntry: async (id: string, shopId?: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/banking/entries/${id}`, { method: 'DELETE' });
        return;
      }
      await localDb.deleteBankEntry(id);
      await deleteBankEntryFromCloud(id, shopId).catch(() => {});
    },
    getSummary: async (
      shopId: string,
      startDate?: string,
      endDate?: string
    ): Promise<BankStatementSummary> => {
      if (isBackendConnected()) {
        const params = new URLSearchParams({ shopId });
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const res = await fetch(`${API_BASE_URL}/api/banking/summary?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch bank summary');
        return res.json();
      }
      return localDb.getBankStatementSummary(shopId, startDate, endDate);
    }
  },

  // 8. Reports & Audits
  reports: {
    getDailyStock: async (shopId: string, date: string): Promise<DailyStockReportRow[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/reports/daily-stock?shopId=${shopId}&date=${date}`);
        if (!res.ok) throw new Error('Failed to fetch daily stock report');
        return res.json();
      }
      return localDb.getDailyStockReport(shopId, date);
    },
    getDailySales: async (shopId: string, date: string): Promise<DailySalesReportSummary> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/reports/daily-sales?shopId=${shopId}&date=${date}`);
        if (!res.ok) throw new Error('Failed to fetch daily sales report');
        return res.json();
      }
      return localDb.getDailySalesReport(shopId, date);
    },
    getDailyFinancials: async (shopId: string, date: string): Promise<DailyFinancialSummary> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/reports/daily-financials?shopId=${shopId}&date=${date}`);
        if (!res.ok) throw new Error('Failed to fetch financial summary');
        return res.json();
      }
      return localDb.getDailyFinancialSummary(shopId, date);
    }
  },

  // 8. Automated Backups & System Maintenance
  system: {
    exportData: async (shopId?: string): Promise<LocalDatabaseExport> => {
      return localDb.exportDatabaseToJson(shopId);
    },
    importData: async (
      data: LocalDatabaseExport,
      options?: { currentShopId?: string; createSafetySnapshot?: boolean }
    ): Promise<{ success: boolean; message: string; manifest?: any; safetyBackupId?: string }> => {
      return localDb.importDatabaseFromJson(data, options);
    },
    restoreFromStoredBackup: async (
      backupRecordId: string,
      options?: { currentShopId?: string; createSafetySnapshot?: boolean }
    ): Promise<{ success: boolean; message: string; safetyBackupId?: string }> => {
      return localDb.restoreFromStoredBackup(backupRecordId, options);
    },
    createBackup: async (shopId: string, type: 'AUTO' | 'MANUAL' | 'SAFETY_PRE_RESTORE' = 'MANUAL'): Promise<StoredBackupRecord> => {
      return localDb.createFullBackup(shopId, type);
    },
    getStoredBackups: async (shopId: string): Promise<StoredBackupRecord[]> => {
      return localDb.getStoredBackups(shopId);
    },
    getBackupSettings: async (): Promise<BackupSettings> => {
      return localDb.getBackupSettings();
    },
    saveBackupSettings: async (settings: BackupSettings): Promise<void> => {
      return localDb.saveBackupSettings(settings);
    },
    checkMissedBackups: async (shopId: string) => {
      return localDb.checkMissedBackups(shopId);
    },
    resetDefaults: async (): Promise<void> => {
      return localDb.resetDatabaseToFactoryDefaults();
    }
  },

  // 9. Dairy Crate In/Out Tracker (100% Cloud Firestore)
  crates: {
    getSummary: async (shopId: string): Promise<CrateSummary> => {
      return fetchCratesFromCloud(shopId);
    },
    subscribe: (shopId: string, onUpdate: (summary: CrateSummary) => void) => {
      return subscribeToCrates(shopId, onUpdate);
    },
    record: async (entry: Omit<CrateTransaction, 'id' | 'createdAt'>): Promise<CrateTransaction> => {
      return recordCrateTransactionToCloud(entry);
    },
    delete: async (shopId: string, entryId: string, type: 'IN' | 'OUT', quantity: number): Promise<void> => {
      return deleteCrateTransactionFromCloud(shopId, entryId, type, quantity);
    }
  },

  // 10. Day Close Summary (100% Cloud Firestore)
  dayClose: {
    save: async (record: DayCloseRecord): Promise<DayCloseRecord> => {
      return saveDayCloseToCloud(record);
    },
    getHistory: async (shopId: string): Promise<DayCloseRecord[]> => {
      return getDayCloseHistoryFromCloud(shopId);
    }
  }
};
