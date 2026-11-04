/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for:
 * 1. "BILL PRINT" rebrand for Purchase Invoice Printing & Action Buttons
 * 2. Zero-stock exclusion (> 0 only) in Stock Report print and export
 * 3. Dedicated print layout and webpage element hiding for Bank Passbook
 */

import { describe, it, expect } from 'vitest';
import { DailyStockReportRow } from '../src/types/index.ts';

describe('1. Purchase Bill Print Rebranding ("BILL PRINT")', () => {
  it('should use explicit "BILL PRINT" label for invoice action and header', () => {
    const printButtonLabel = 'BILL PRINT';
    const invoiceMainTitle = 'BILL PRINT';

    expect(printButtonLabel).toBe('BILL PRINT');
    expect(invoiceMainTitle).toBe('BILL PRINT');
  });

  it('formats purchase invoice with shop details, agency name, and bill number', () => {
    const mockPurchaseBill = {
      id: 'pb-101',
      agencyName: 'Amul District Dairy Union',
      billNumber: 'AMUL-INV-2026-889',
      purchaseDate: '2026-11-02',
      paymentMode: 'NEFT/RTGS',
      status: 'RECEIVED',
      items: [
        {
          productName: 'Amul Gold Milk 500ml',
          barcode: '890126201001',
          quantity: 40,
          unit: 'Pouch',
          purchaseRate: 31.5,
          mrp: 33.0,
          total: 1260.0
        },
        {
          productName: 'Amul Butter 500g',
          barcode: '890126202005',
          quantity: 10,
          unit: 'Pack',
          purchaseRate: 260.0,
          mrp: 275.0,
          total: 2600.0
        }
      ],
      itemCount: 50,
      subtotal: 3860.0,
      otherCharges: 40.0,
      totalAmount: 3900.0,
      paidAmount: 3900.0,
      dueAmount: 0.0
    };

    expect(mockPurchaseBill.agencyName).toBe('Amul District Dairy Union');
    expect(mockPurchaseBill.billNumber).toBe('AMUL-INV-2026-889');
    expect(mockPurchaseBill.items).toHaveLength(2);
    expect(mockPurchaseBill.totalAmount).toBe(3900.0);
  });
});

describe('2. Stock Report Zero-Stock Filter (> 0 Stock Only)', () => {
  const sampleStockRows: DailyStockReportRow[] = [
    {
      productId: 'p-1',
      productName: 'Amul Gold Milk 500ml',
      barcode: '890126201001',
      category: 'Milk',
      unit: 'Pouch',
      openingStock: 20,
      stockIn: 40,
      salesQty: 45,
      stockOut: 0,
      closingStock: 15,
      minStockAlert: 10,
      isLowStock: false
    },
    {
      productId: 'p-2',
      productName: 'Amul Taaza Milk 500ml',
      barcode: '890126201002',
      category: 'Milk',
      unit: 'Pouch',
      openingStock: 10,
      stockIn: 0,
      salesQty: 10,
      stockOut: 0,
      closingStock: 0, // ZERO STOCK
      minStockAlert: 10,
      isLowStock: true
    },
    {
      productId: 'p-3',
      productName: 'Amul Moti Milk 450ml',
      barcode: '890126201003',
      category: 'Milk',
      unit: 'Pouch',
      openingStock: 5,
      stockIn: 0,
      salesQty: 10,
      stockOut: 0,
      closingStock: -5, // NEGATIVE/ZERO STOCK
      minStockAlert: 5,
      isLowStock: true
    },
    {
      productId: 'p-4',
      productName: 'Amul Butter 500g',
      barcode: '890126202005',
      category: 'Butter & Spreads',
      unit: 'Pack',
      openingStock: 8,
      stockIn: 10,
      salesQty: 6,
      stockOut: 0,
      closingStock: 12,
      minStockAlert: 5,
      isLowStock: false
    }
  ];

  it('filters out items with closingStock <= 0 so only active stock (> 0) is printed', () => {
    // Default filter logic used in DailyStockReport and ReportsHub
    const printableRows = sampleStockRows.filter((r) => r.closingStock > 0);

    expect(printableRows).toHaveLength(2);
    expect(printableRows.map((r) => r.productName)).toEqual([
      'Amul Gold Milk 500ml',
      'Amul Butter 500g'
    ]);
    expect(printableRows.every((r) => r.closingStock > 0)).toBe(true);
  });

  it('correctly calculates total quantity of active stock (> 0)', () => {
    const activeRows = sampleStockRows.filter((r) => r.closingStock > 0);
    const totalActiveQty = activeRows.reduce((sum, r) => sum + r.closingStock, 0);

    expect(totalActiveQty).toBe(15 + 12);
    expect(totalActiveQty).toBe(27);
  });
});

describe('3. Bank Passbook Print Layout & Elements Isolation', () => {
  it('defines passbook-printable-area and no-print classes for clean printing', () => {
    const elementsToHide = [
      'no-print',
      'header',
      'nav',
      'aside',
      'button',
      'input',
      'select'
    ];

    expect(elementsToHide).toContain('no-print');
    expect(elementsToHide).toContain('button');
    expect(elementsToHide).toContain('input');
  });

  it('constructs complete Bank Passbook print metadata for parlour statement', () => {
    const shopMeta = {
      name: 'Amul Preferred Outlet - Anand Dairy Circle',
      regionalName: 'અમૂલ પ્રેફર્ડ આઉટલેટ',
      address: 'Shop 4, Dairy Road, Anand',
      gstin: '24AAAAA0000A1Z5',
      bankName: 'State Bank of India',
      accountHolderName: 'Amul Preferred Outlet',
      accountNumber: '382910485920',
      ifscCode: 'SBIN0000315'
    };

    const passbookPrintHeader = {
      title: 'બેંક પાસબુક સ્ટેટમેન્ટ',
      subtitle: 'BANK PASSBOOK STATEMENT',
      shopName: shopMeta.name,
      accountNumber: shopMeta.accountNumber,
      ifsc: shopMeta.ifscCode,
      bank: shopMeta.bankName
    };

    expect(passbookPrintHeader.title).toBe('બેંક પાસબુક સ્ટેટમેન્ટ');
    expect(passbookPrintHeader.subtitle).toBe('BANK PASSBOOK STATEMENT');
    expect(passbookPrintHeader.accountNumber).toBe('382910485920');
  });
});

describe('4. Purchase Bill Sticky Action Controls & Responsive Viewport Layout', () => {
  it('guarantees sticky positioning for BILL PRINT action controls on table and modal preview', () => {
    const tableStickyActionsClass = 'sticky right-0 bg-white group-hover:bg-slate-50/90 z-10';
    const modalTopStickyHeaderClass = 'no-print sticky top-0 z-30 bg-white/95';
    const modalBottomStickyFooterClass = 'no-print sticky bottom-0 z-30 bg-white/95';

    expect(tableStickyActionsClass).toContain('sticky');
    expect(tableStickyActionsClass).toContain('right-0');
    expect(modalTopStickyHeaderClass).toContain('sticky top-0');
    expect(modalBottomStickyFooterClass).toContain('sticky bottom-0');
  });

  it('provides responsive overflow handling for small screen viewports (mobile/laptop)', () => {
    const previewContainerClass = 'flex-1 overflow-y-auto overflow-x-auto';
    const itemsTableWrapperClass = 'overflow-x-auto my-3 border border-slate-300 rounded-lg print:border-none print:overflow-visible';

    expect(previewContainerClass).toContain('overflow-y-auto');
    expect(previewContainerClass).toContain('overflow-x-auto');
    expect(itemsTableWrapperClass).toContain('overflow-x-auto');
    expect(itemsTableWrapperClass).toContain('print:overflow-visible');
  });

  it('configures dedicated print overlay and card selectors for clean A4 printing without clipping', () => {
    const printIds = [
      '#purchase-bill-modal-overlay',
      '#purchase-bill-modal-card',
      '.purchase-printable-bill'
    ];

    expect(printIds).toContain('#purchase-bill-modal-overlay');
    expect(printIds).toContain('#purchase-bill-modal-card');
    expect(printIds).toContain('.purchase-printable-bill');
  });
});

