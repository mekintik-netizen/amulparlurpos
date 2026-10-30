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
  DailyFinancialSummary,
  DailySalesReportSummary,
  DailyStockReportRow,
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
      return localDb.getAllShops();
    },
    getById: async (id: string): Promise<Shop | null> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/shops/${id}`);
        if (!res.ok) return null;
        return res.json();
      }
      return localDb.getShopById(id);
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
      return localDb.saveShop(shop);
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
      return localDb.saveProduct(product);
    },
    delete: async (productId: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/products/${productId}`, { method: 'DELETE' });
        return;
      }
      return localDb.deleteProduct(productId);
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
      return localDb.recordStockMovement(movement);
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
      return localDb.adjustStockAndPrices(shopId, productId, newStock, costPrice, sellingPrice, mrp, reason);
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
      return localDb.createSaleBill(billData);
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
      return localDb.cancelSaleBill(billId, shopId, reason);
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
      return localDb.createPurchaseBill(billData);
    },
    updateBill: async (
      billId: string,
      shopId: string,
      updatedData: {
        purchaseInvoiceNumber?: string;
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
      return localDb.updatePurchaseBill(billId, shopId, updatedData);
    },
    getByShop: async (shopId: string, dateStr?: string): Promise<PurchaseBill[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/purchases?shopId=${shopId}${dateStr ? `&date=${dateStr}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch purchases');
        return res.json();
      }
      return localDb.getPurchasesByShop(shopId, dateStr);
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
      return localDb.cancelPurchaseBill(billId, shopId, reason);
    }
  },

  suppliers: {
    getAll: async (shopId: string): Promise<Supplier[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers?shopId=${shopId}`);
        if (!res.ok) throw new Error('Failed to fetch suppliers');
        return res.json();
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
      return localDb.saveSupplier(supplier);
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
      return localDb.recordSupplierPayment(paymentData);
    },
    getPayments: async (shopId: string, supplierId?: string): Promise<SupplierPayment[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/suppliers/payments?shopId=${shopId}${supplierId ? `&supplierId=${supplierId}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch supplier payments');
        return res.json();
      }
      return localDb.getSupplierPayments(shopId, supplierId);
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
      return localDb.createExpense(expenseData);
    },
    getByShop: async (shopId: string, dateStr?: string): Promise<Expense[]> => {
      if (isBackendConnected()) {
        const res = await fetch(`${API_BASE_URL}/api/expenses?shopId=${shopId}${dateStr ? `&date=${dateStr}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch expenses');
        return res.json();
      }
      return localDb.getExpensesByShop(shopId, dateStr);
    },
    delete: async (expenseId: string): Promise<void> => {
      if (isBackendConnected()) {
        await fetch(`${API_BASE_URL}/api/expenses/${expenseId}`, { method: 'DELETE' });
        return;
      }
      return localDb.deleteExpense(expenseId);
    }
  },

  // 7. Reports & Audits
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
  }
};
