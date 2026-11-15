/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated tests for Smart Order (ઓટો ઓર્ડર & પર્ચેઝ લિસ્ટ) and Receive & Confirm Pending Purchase Bill workflow.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Product, SaleBill, Shop } from '../src/types/index.ts';
import {
  buildWhatsAppShareUrl,
  calculateSmartOrderSuggestions,
  formatSmartOrderWhatsAppText
} from '../src/utils/smartOrderCalculator.ts';

const refNow = new Date('2026-11-15T12:00:00.000Z');

const sampleShop: Shop = {
  id: 'shop-test-01',
  shopCode: 'AP-2026-1099',
  name: 'Anand Amul Parlour',
  ownerName: 'Mahesh Patel',
  phone: '9825012345',
  email: 'anand@amulparlour.in',
  address: 'Station Road, Anand',
  city: 'Anand',
  state: 'Gujarat',
  pincode: '388001',
  status: 'active',
  subscriptionPlanId: 'PRO',
  subscriptionStatus: 'ACTIVE',
  approvalStatus: 'APPROVED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const sampleProducts: Product[] = [
  {
    id: 'prod-gold-500',
    shopId: sampleShop.id,
    barcode: '8901262010014',
    sku: 'GOLD-500',
    name: 'Amul Gold Milk 500ml',
    regionalName: 'અમૂલ ગોલ્ડ ૫૦૦ મિલી',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 33,
    costPrice: 30.5,
    sellingPrice: 33,
    currentStock: 10,
    minStockAlert: 12,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-ghee-1l',
    shopId: sampleShop.id,
    barcode: '8901262050010',
    sku: 'GHEE-1L',
    name: 'Amul Pure Ghee 1 Litre Tin',
    regionalName: 'અમૂલ શુદ્ધ ઘી ૧ લિટર',
    category: 'Ghee & Dairy Fats',
    unit: 'Tin',
    mrp: 630,
    costPrice: 575,
    sellingPrice: 630,
    currentStock: 2, // <= minStockAlert (5), even with zero sales!
    minStockAlert: 5,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-butter-100',
    shopId: sampleShop.id,
    barcode: '8901262011004',
    sku: 'BUTTER-100',
    name: 'Amul Butter 100g',
    category: 'Butter & Spreads',
    unit: 'Pack',
    mrp: 60,
    costPrice: 54,
    sellingPrice: 60,
    currentStock: 50,
    minStockAlert: 5,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

const sampleSales: SaleBill[] = [
  {
    id: 'sale-1',
    billNumber: 'B-001',
    shopId: sampleShop.id,
    timestamp: '2026-11-12T10:00:00.000Z', // 3 days ago (within 7d)
    items: [
      {
        productId: 'prod-gold-500',
        productName: 'Amul Gold Milk 500ml',
        barcode: '8901262010014',
        quantity: 35,
        unit: 'Pouch',
        mrp: 33,
        unitPrice: 33,
        costPrice: 30.5,
        total: 1155
      }
    ],
    itemCount: 35,
    subtotal: 1155,
    discountAmount: 0,
    taxAmount: 0,
    roundOff: 0,
    finalAmount: 1155,
    paymentMode: 'CASH',
    status: 'COMPLETED',
    cashierName: 'Cashier',
    idempotencyKey: 'k-1',
    createdAt: '2026-11-12T10:00:00.000Z'
  },
  {
    id: 'sale-cancelled',
    billNumber: 'B-002',
    shopId: sampleShop.id,
    timestamp: '2026-11-14T10:00:00.000Z',
    items: [
      {
        productId: 'prod-gold-500',
        productName: 'Amul Gold Milk 500ml',
        barcode: '8901262010014',
        quantity: 100,
        unit: 'Pouch',
        mrp: 33,
        unitPrice: 33,
        costPrice: 30.5,
        total: 3300
      }
    ],
    itemCount: 100,
    subtotal: 3300,
    discountAmount: 0,
    taxAmount: 0,
    roundOff: 0,
    finalAmount: 3300,
    paymentMode: 'CASH',
    status: 'CANCELLED', // Must be ignored!
    cashierName: 'Cashier',
    idempotencyKey: 'k-2',
    createdAt: '2026-11-14T10:00:00.000Z'
  },
  {
    id: 'sale-old',
    billNumber: 'B-003',
    shopId: sampleShop.id,
    timestamp: '2026-10-01T10:00:00.000Z', // > 30 days ago (excluded from 7d & 30d)
    items: [
      {
        productId: 'prod-butter-100',
        productName: 'Amul Butter 100g',
        barcode: '8901262011004',
        quantity: 40,
        unit: 'Pack',
        mrp: 60,
        unitPrice: 60,
        costPrice: 54,
        total: 2400
      }
    ],
    itemCount: 40,
    subtotal: 2400,
    discountAmount: 0,
    taxAmount: 0,
    roundOff: 0,
    finalAmount: 2400,
    paymentMode: 'UPI',
    status: 'COMPLETED',
    cashierName: 'Cashier',
    idempotencyKey: 'k-3',
    createdAt: '2026-10-01T10:00:00.000Z'
  }
];

describe('Smart Order Auto-Replenishment & Confirmation Workflow', () => {
  it('computes exact Suggested Qty = ceil((AvgDailySales * CycleDays * Buffer) - CurrentStock) and ignores CANCELLED/old bills', () => {
    const suggestions7d10 = calculateSmartOrderSuggestions({
      products: sampleProducts,
      sales: sampleSales,
      cycleDays: 7,
      bufferPercent: 10,
      referenceDate: refNow
    });

    const gold = suggestions7d10.find(s => s.productId === 'prod-gold-500')!;
    // 35 sold in 7 days => avgDailySales = 5.0
    // (5 * 7 * 1.1) - 10 = 38.5 - 10 = 28.5 => ceil = 29
    expect(gold.totalSoldInCycle).toBe(35);
    expect(gold.avgDailySales).toBe(5);
    expect(gold.suggestedQty).toBe(29);
    expect(gold.orderQty).toBe(29);
    expect(gold.selected).toBe(true);
    expect(gold.estimatedTotal).toBe(Math.round(29 * 30.5 * 1000) / 1000);

    // Zero buffer test
    const suggestions7d0 = calculateSmartOrderSuggestions({
      products: sampleProducts,
      sales: sampleSales,
      cycleDays: 7,
      bufferPercent: 0,
      referenceDate: refNow
    });
    const gold0 = suggestions7d0.find(s => s.productId === 'prod-gold-500')!;
    // (5 * 7 * 1.0) - 10 = 25
    expect(gold0.suggestedQty).toBe(25);
  });

  it('filters strictly to products with actual sales (totalSoldQty > 0) by default and only pre-selects Recommended Qty > 0', () => {
    const wellStockedProduct: Product = {
      ...sampleProducts[2],
      id: 'prod-lassi-200',
      barcode: '8901262099999',
      sku: 'LASSI-200',
      name: 'Amul Lassi 200ml',
      currentStock: 30 // Enough for 7 sold in 7d (avg 1/day => demand ~8.4)
    };
    const recentLassiSale: SaleBill = {
      ...sampleSales[0],
      id: 'sale-lassi',
      billNumber: 'B-004',
      items: [
        {
          productId: 'prod-lassi-200',
          productName: 'Amul Lassi 200ml',
          barcode: '8901262099999',
          quantity: 7,
          unit: 'Pack',
          mrp: 20,
          unitPrice: 20,
          costPrice: 17,
          total: 140
        }
      ],
      itemCount: 7,
      subtotal: 140,
      finalAmount: 140
    };

    const suggestions = calculateSmartOrderSuggestions({
      products: [...sampleProducts, wellStockedProduct],
      sales: [...sampleSales, recentLassiSale],
      cycleDays: 7,
      bufferPercent: 10,
      referenceDate: refNow
    });

    // Strictly only products with totalSoldInCycle > 0 are returned by default
    expect(suggestions.map(s => s.productId)).toEqual(['prod-gold-500', 'prod-lassi-200']);
    expect(suggestions.find(s => s.productId === 'prod-ghee-1l')).toBeUndefined();
    expect(suggestions.find(s => s.productId === 'prod-butter-100')).toBeUndefined();

    const lassi = suggestions.find(s => s.productId === 'prod-lassi-200')!;
    expect(lassi.totalSoldInCycle).toBe(7);
    expect(lassi.avgDailySales).toBe(1);
    expect(lassi.suggestedQty).toBe(0);
    // Current stock covers upcoming 7 days, so NOT pre-selected
    expect(lassi.selected).toBe(false);
  });

  it('includes 0-sale low-stock items only when includeZeroSaleLowStock is enabled, keeping them unchecked by default', () => {
    const suggestions = calculateSmartOrderSuggestions({
      products: sampleProducts,
      sales: sampleSales,
      cycleDays: 15,
      bufferPercent: 20,
      includeZeroSaleLowStock: true,
      referenceDate: refNow
    });

    const ghee = suggestions.find(s => s.productId === 'prod-ghee-1l')!;
    expect(ghee).toBeDefined();
    expect(ghee.totalSoldInCycle).toBe(0);
    expect(ghee.suggestedQty).toBe(0);
    expect(ghee.isLowStock).toBe(true);
    // Only Recommended Qty > 0 is pre-selected
    expect(ghee.selected).toBe(false);
    // Shortfall to reach minStockAlert (5 - 2 = 3) prefilled for manual check
    expect(ghee.orderQty).toBe(3);

    // Non-low-stock 0-sale items remain excluded
    expect(suggestions.find(s => s.productId === 'prod-butter-100')).toBeUndefined();
  });

  it('exposes the unchecked-by-default low-stock toggle and Gujarati empty-state copy in SmartOrderManagement', () => {
    const uiSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/purchases/SmartOrderManagement.tsx'),
      'utf8'
    );
    expect(uiSource).toContain('useState(false)');
    expect(uiSource).toContain('Also show 0-sale low stock items (ઓછા સ્ટોક વાળી અન્ય આઈટમ બતાવો)');
    expect(uiSource).toContain('પસંદ કરેલ દિવસોમાં કોઈ વેચાણ નોંધાયું નથી');
    expect(uiSource).toContain('કુલ વેચાણ');
    expect(uiSource).toContain('રોજનું વેચાણ');
    expect(uiSource).toContain('હાલનો સ્ટોક');
    expect(uiSource).toContain('મંગાવવાનો જથ્થો');
  });

  it('formats WhatsApp order summary cleanly and normalizes 10-digit Indian phone numbers', () => {
    const suggestions = calculateSmartOrderSuggestions({
      products: sampleProducts,
      sales: sampleSales,
      cycleDays: 7,
      bufferPercent: 10,
      referenceDate: refNow
    });

    const text = formatSmartOrderWhatsAppText({
      shop: sampleShop,
      supplierName: 'Anand Dairy Depot',
      cycleDays: 7,
      bufferPercent: 10,
      items: suggestions,
      orderDate: '15/11/2026'
    });

    expect(text).toContain('Anand Amul Parlour');
    expect(text).toContain('Anand Dairy Depot');
    expect(text).toContain('Amul Gold Milk 500ml');
    expect(text).toContain('29 Pouch');

    const waUrl = buildWhatsAppShareUrl('98250 12345', text);
    expect(waUrl.startsWith('https://wa.me/919825012345?text=')).toBe(true);
  });

  it('places Smart Order (ઓટો ઓર્ડર & પર્ચેઝ લિસ્ટ) directly below Purchases Khata in RightSideNavigation', () => {
    const navSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/layout/RightSideNavigation.tsx'),
      'utf8'
    );
    const purchasesIdx = navSource.indexOf("key: 'PURCHASES'");
    const smartOrderIdx = navSource.indexOf("key: 'SMART_ORDER'");
    const stockIdx = navSource.indexOf("key: 'STOCK'");

    expect(purchasesIdx).toBeGreaterThan(-1);
    expect(smartOrderIdx).toBeGreaterThan(purchasesIdx);
    expect(stockIdx).toBeGreaterThan(smartOrderIdx);
    expect(navSource).toContain("label: 'Smart Order'");
    expect(navSource).toContain("sub: 'ઓટો ઓર્ડર & પર્ચેઝ લિસ્ટ'");
  });

  it('syncs purchase bills to both purchases/{id} and shops/{shopId}/purchases/{id} in Cloud Firestore', () => {
    const syncSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/storage/firestoreSync.ts'),
      'utf8'
    );
    expect(syncSource).toContain("doc(db, 'shops', purchase.shopId, 'purchases', purchase.id)");
    expect(syncSource).toContain("collection(db, 'shops', shopId, 'purchases')");
  });
});
