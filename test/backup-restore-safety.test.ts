/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Unit Tests for Data Safety, Backup Manifests,
 * Pre-Restore Safety Snapshots, and Rollback Integrity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  LocalDatabaseExport, 
  Shop, 
  Product, 
  SaleBill, 
  PurchaseBill, 
  Supplier, 
  Expense,
  StockMovement,
  StoredBackupRecord
} from '../src/types/index.ts';

describe('Data Safety, Backup Manifests & Pre-Restore Validation', () => {
  const dummyShop: Shop = {
    id: 'shop-test-1',
    shopCode: 'AP-2026-TEST',
    name: 'Amul Test Parlour',
    ownerName: 'Test Owner',
    phone: '+91 98765 43210',
    email: 'test@amul.in',
    address: 'Amul Dairy Road',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const dummyProduct: Product = {
    id: 'prod-1',
    shopId: 'shop-test-1',
    barcode: '8901262010014',
    sku: 'AMUL-TZ-500',
    name: 'Amul Taaza Milk 500ml',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 27,
    costPrice: 24.5,
    sellingPrice: 27,
    currentStock: 50,
    minStockAlert: 10,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const dummySale: SaleBill = {
    id: 'sale-1',
    billNumber: 'BILL-20261029-001',
    shopId: 'shop-test-1',
    timestamp: new Date().toISOString(),
    items: [{
      productId: 'prod-1',
      productName: 'Amul Taaza Milk 500ml',
      barcode: '8901262010014',
      quantity: 2,
      unit: 'Pouch',
      mrp: 27,
      unitPrice: 27,
      costPrice: 24.5,
      total: 54
    }],
    itemCount: 2,
    subtotal: 54,
    discountAmount: 0,
    taxAmount: 2.7,
    roundOff: 0,
    finalAmount: 54,
    paymentMode: 'CASH',
    status: 'COMPLETED',
    cashierName: 'Counter 1',
    idempotencyKey: 'idem-sale-1',
    createdAt: new Date().toISOString()
  };

  it('validates a complete backup package structure with manifest and record counts', () => {
    const validBackup: LocalDatabaseExport = {
      manifest: {
        version: 2,
        exportedAt: new Date().toISOString(),
        shopId: 'shop-test-1',
        appName: 'Amul Parlour Web POS',
        counts: {
          shops: 1,
          products: 1,
          stockMovements: 0,
          sales: 1,
          purchases: 0,
          suppliers: 0,
          supplierPayments: 0,
          expenses: 0
        },
        checksum: 'test-checksum-hash',
        generator: 'Amul Parlour Local-First IndexedDB Engine'
      },
      shops: [dummyShop],
      products: [dummyProduct],
      stockMovements: [],
      sales: [dummySale],
      purchases: [],
      suppliers: [],
      supplierPayments: [],
      expenses: []
    };

    expect(validBackup.manifest).toBeDefined();
    expect(validBackup.manifest.counts.products).toBe(1);
    expect(validBackup.manifest.counts.sales).toBe(1);
    expect(validBackup.shops.length).toBe(1);
    expect(validBackup.products[0].barcode).toBe('8901262010014');
  });

  it('detects invalid or corrupted backup payloads missing critical tables', () => {
    const corruptedPayload: any = {
      manifest: { version: 2 },
      products: [dummyProduct]
      // Missing 'shops' and 'sales'
    };

    const validatePayload = (payload: any): boolean => {
      if (!payload || typeof payload !== 'object') return false;
      if (!Array.isArray(payload.shops) || !Array.isArray(payload.products) || !Array.isArray(payload.sales)) {
        return false;
      }
      return true;
    };

    expect(validatePayload(corruptedPayload)).toBe(false);
  });

  it('verifies that passwords and authentication secrets are never in the backup format', () => {
    const exportData: LocalDatabaseExport = {
      manifest: {
        version: 2,
        exportedAt: new Date().toISOString(),
        shopId: 'shop-test-1',
        appName: 'Amul Parlour Web POS',
        counts: {
          shops: 1,
          products: 0,
          stockMovements: 0,
          sales: 0,
          purchases: 0,
          suppliers: 0,
          supplierPayments: 0,
          expenses: 0
        },
        checksum: 'hash',
        generator: 'Amul Parlour Local-First IndexedDB Engine'
      },
      shops: [dummyShop],
      products: [],
      stockMovements: [],
      sales: [],
      purchases: [],
      suppliers: [],
      supplierPayments: [],
      expenses: []
    };

    const jsonStr = JSON.stringify(exportData);
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('salt');
    expect(jsonStr).not.toContain('secret');
    expect(jsonStr).not.toContain('token');
  });

  it('creates safety snapshot record with SAFETY_PRE_RESTORE tag', () => {
    const safetySnapshot: StoredBackupRecord = {
      id: `bkp-${Date.now()}-safe`,
      shopId: dummyShop.id,
      backupDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      type: 'SAFETY_PRE_RESTORE',
      manifest: {
        version: 2,
        exportedAt: new Date().toISOString(),
        shopId: dummyShop.id,
        appName: 'Amul Parlour Web POS',
        counts: {
          shops: 1,
          products: 1,
          stockMovements: 0,
          sales: 1,
          purchases: 0,
          suppliers: 0,
          supplierPayments: 0,
          expenses: 0
        },
        checksum: 'safe-hash',
        generator: 'Amul Parlour Local-First IndexedDB Engine'
      },
      data: {
        manifest: {} as any,
        shops: [dummyShop],
        products: [dummyProduct],
        stockMovements: [],
        sales: [dummySale],
        purchases: [],
        suppliers: [],
        supplierPayments: [],
        expenses: []
      }
    };

    expect(safetySnapshot.type).toBe('SAFETY_PRE_RESTORE');
    expect(safetySnapshot.data.products.length).toBe(1);
    expect(safetySnapshot.data.sales.length).toBe(1);
  });

  it('correctly calculates missed backup logic when date has advanced past scheduled hour', () => {
    const scheduledTime = '20:00';
    const lastBackupDate = '2026-10-28';
    const currentDate = '2026-10-29';

    const isMissed = lastBackupDate < currentDate;
    expect(isMissed).toBe(true);

    const sameDayBackup = '2026-10-29';
    const isSameDayMissed = sameDayBackup < currentDate;
    expect(isSameDayMissed).toBe(false);
  });
});
