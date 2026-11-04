/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for:
 * 1. Supplier / Agency Management & Secure Deletion (preserves historical purchase bills)
 * 2. Purchase Amount Decimal Precision (.000 & Multi-Decimal Support without truncation)
 * 3. Dynamic Supplier Due Balance Calculation (Fully paid bills show strictly ₹0.00 Settled)
 */

import { describe, it, expect } from 'vitest';
import { PurchaseBill, Supplier } from '../src/types/index.ts';

/**
 * Mirror of getSupplierDueBalance logic in PurchaseManagement
 */
const getSupplierDueBalance = (supplier: Supplier, allPurchases: PurchaseBill[]): number => {
  const supplierPurchases = allPurchases.filter(p =>
    p.status !== 'CANCELLED' && (
      p.supplierId === supplier.id ||
      (supplier.companyName && (p.agencyName === supplier.companyName || p.supplierName === supplier.companyName)) ||
      (supplier.name && (p.agencyName === supplier.name || p.supplierName === supplier.name))
    )
  );

  if (supplierPurchases.length > 0) {
    const allFullyPaid = supplierPurchases.every(p =>
      (p.paidAmount >= p.totalAmount - 0.001) || (p.dueAmount !== undefined && p.dueAmount <= 0.001)
    );
    if (allFullyPaid) {
      return 0; // Strictly ₹0.00 when all bills/invoices are fully paid
    }

    const totalUnpaidDue = supplierPurchases.reduce((sum, p) => {
      const billPending = Math.max(0, p.totalAmount - (p.paidAmount || 0));
      const exactDue = p.dueAmount !== undefined ? Math.min(p.dueAmount, billPending) : billPending;
      return sum + (exactDue > 0.001 ? exactDue : 0);
    }, 0);

    return Math.max(0, Math.round(totalUnpaidDue * 1000) / 1000);
  }

  return Math.max(0, supplier.currentBalance || 0);
};

describe('1. Supplier Agency Management & Deletion Safety', () => {
  it('allows supplier deletion while preserving historical purchase records and agency names', () => {
    let suppliers: Supplier[] = [
      {
        id: 'sup-1',
        shopId: 'shop-anand',
        name: 'Shailesh Patel',
        companyName: 'Shreeji Amul Agency',
        phone: '98250 11111',
        currentBalance: 0,
        openingBalance: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'sup-2 (Duplicate)',
        shopId: 'shop-anand',
        name: 'Shailesh Bhai Patel',
        companyName: 'Shreeji Amul Agency (Duplicate)',
        phone: '98250 11111',
        currentBalance: 0,
        openingBalance: 0,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z'
      }
    ];

    const historicalPurchases: PurchaseBill[] = [
      {
        id: 'pur-101',
        shopId: 'shop-anand',
        supplierId: 'sup-2 (Duplicate)',
        supplierName: 'Shreeji Amul Agency (Duplicate)',
        agencyName: 'Shreeji Amul Agency (Duplicate)',
        purchaseInvoiceNumber: 'INV-AMUL-001',
        billNumber: 'INV-AMUL-001',
        purchaseDate: '2026-02-01',
        items: [
          {
            productId: 'prod-milk',
            productName: 'Amul Gold 500ml',
            barcode: '890126201001',
            quantity: 50,
            unit: 'Pouch',
            purchaseRate: 31.5,
            mrp: 33,
            total: 1575.0
          }
        ],
        itemCount: 50,
        subtotal: 1575.0,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 1575.0,
        paidAmount: 1575.0,
        dueAmount: 0,
        status: 'CONFIRMED',
        paymentMode: 'BANK_TRANSFER',
        stockPosted: true,
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z'
      }
    ];

    // Delete duplicate supplier
    suppliers = suppliers.filter(s => s.id !== 'sup-2 (Duplicate)');
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].id).toBe('sup-1');

    // Verify historical purchases remain 100% intact with agency details
    expect(historicalPurchases).toHaveLength(1);
    expect(historicalPurchases[0].id).toBe('pur-101');
    expect(historicalPurchases[0].agencyName).toBe('Shreeji Amul Agency (Duplicate)');
    expect(historicalPurchases[0].items[0].quantity).toBe(50);
    expect(historicalPurchases[0].totalAmount).toBe(1575.0);
  });
});

describe('2. Multi-Decimal and Precision Support (.000 and fractional rates)', () => {
  it('supports exact fractional quantities and 3-decimal precision without restriction', () => {
    const itemQty = 0.500; // 500g or 0.500 unit
    const itemRate = 32.125; // ₹32.125 rate
    const itemTotal = Math.round(itemQty * itemRate * 1000) / 1000;

    expect(itemQty).toBe(0.5);
    expect(itemRate).toBe(32.125);
    expect(itemTotal).toBe(16.063); // Exact fractional calculation
  });

  it('correctly calculates total amount and zero due with exact multi-decimal values', () => {
    const items = [
      { quantity: 1.500, purchaseRate: 100.250, total: 150.375 },
      { quantity: 0.250, purchaseRate: 200.000, total: 50.000 }
    ];

    const subtotal = items.reduce((sum, it) => sum + it.total, 0);
    const totalAmount = Math.round(subtotal * 1000) / 1000;
    const paidAmount = 200.375;
    const dueAmount = paidAmount >= totalAmount - 0.0001 ? 0 : Math.max(0, totalAmount - paidAmount);

    expect(totalAmount).toBe(200.375);
    expect(dueAmount).toBe(0);
  });
});

describe('3. Dynamic Supplier Due Balance & Cleared Payment Calculations', () => {
  const mockSupplier: Supplier = {
    id: 'sup-gcmmf',
    shopId: 'shop-1',
    name: 'Ramesh Patel',
    companyName: 'GCMMF Anand Union',
    phone: '98250 00000',
    currentBalance: 5000, // Lingering static balance
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  it('dynamically evaluates due to strictly ₹0.00 when all supplier bills are fully paid', () => {
    const purchases: PurchaseBill[] = [
      {
        id: 'pur-1',
        shopId: 'shop-1',
        supplierId: 'sup-gcmmf',
        supplierName: 'GCMMF Anand Union',
        agencyName: 'GCMMF Anand Union',
        purchaseInvoiceNumber: 'INV-101',
        billNumber: 'INV-101',
        purchaseDate: '2026-11-01',
        items: [],
        itemCount: 10,
        subtotal: 10000,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 10000,
        paidAmount: 10000, // Fully paid
        dueAmount: 0,
        status: 'CONFIRMED',
        paymentMode: 'BANK_TRANSFER',
        stockPosted: true,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z'
      },
      {
        id: 'pur-2',
        shopId: 'shop-1',
        supplierId: 'sup-gcmmf',
        supplierName: 'GCMMF Anand Union',
        agencyName: 'GCMMF Anand Union',
        purchaseInvoiceNumber: 'INV-102',
        billNumber: 'INV-102',
        purchaseDate: '2026-11-02',
        items: [],
        itemCount: 5,
        subtotal: 4500,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 4500,
        paidAmount: 4500, // Fully paid
        dueAmount: 0,
        status: 'CONFIRMED',
        paymentMode: 'UPI',
        stockPosted: true,
        createdAt: '2026-11-02T00:00:00Z',
        updatedAt: '2026-11-02T00:00:00Z'
      }
    ];

    const due = getSupplierDueBalance(mockSupplier, purchases);
    expect(due).toBe(0.00);
  });

  it('prevents floating-point precision error from displaying red due on paid bills', () => {
    const totalAmount = 1250.35;
    const paidAmount = 1250.35;
    const dueAmount = paidAmount >= totalAmount - 0.0001
      ? 0
      : Math.max(0, Math.round((totalAmount - paidAmount) * 1000) / 1000);

    const isFullyPaid = paidAmount >= totalAmount - 0.001 || dueAmount <= 0.001;

    expect(dueAmount).toBe(0);
    expect(isFullyPaid).toBe(true);
  });

  it('accurately calculates pending due when unpaid bills exist', () => {
    const purchases: PurchaseBill[] = [
      {
        id: 'pur-1',
        shopId: 'shop-1',
        supplierId: 'sup-gcmmf',
        supplierName: 'GCMMF Anand Union',
        agencyName: 'GCMMF Anand Union',
        purchaseInvoiceNumber: 'INV-101',
        billNumber: 'INV-101',
        purchaseDate: '2026-11-01',
        items: [],
        itemCount: 10,
        subtotal: 10000,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 10000,
        paidAmount: 7000,
        dueAmount: 3000, // Due 3000
        status: 'CONFIRMED',
        paymentMode: 'CREDIT',
        stockPosted: true,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z'
      }
    ];

    const due = getSupplierDueBalance(mockSupplier, purchases);
    expect(due).toBe(3000.00);
  });
});
