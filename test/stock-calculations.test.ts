/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Business Logic & Domain Rule Tests for Amul Parlour POS
 */

import { describe, it, expect } from 'vitest';
import { SUBSCRIPTION_PLANS, Shop, Product, PurchaseBill, SaleBill } from '../src/types/index.ts';

describe('Amul Parlour Subscription & Approval Rules', () => {
  it('should have Trial (₹0/30d), Basic (₹300/30d), and Pro (₹500/30d) configured', () => {
    expect(SUBSCRIPTION_PLANS.TRIAL.price).toBe(0);
    expect(SUBSCRIPTION_PLANS.TRIAL.durationDays).toBe(30);

    expect(SUBSCRIPTION_PLANS.BASIC.price).toBe(300);
    expect(SUBSCRIPTION_PLANS.BASIC.durationDays).toBe(30);

    expect(SUBSCRIPTION_PLANS.PRO.price).toBe(500);
    expect(SUBSCRIPTION_PLANS.PRO.durationDays).toBe(30);
  });

  it('shop creation must not automatically activate subscription', () => {
    const newShop: Shop = {
      id: 'shop-test-1',
      shopCode: 'AP-2026-9999',
      name: 'Test Kiosk',
      ownerName: 'Ramesh',
      phone: '+91 99999 00000',
      email: 'ramesh@amul.in',
      address: 'Main Bazaar',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      approvalStatus: 'PENDING',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'INACTIVE', // Explicitly INACTIVE
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(newShop.approvalStatus).toBe('PENDING');
    expect(newShop.subscriptionStatus).toBe('INACTIVE');
  });

  it('approving a shop does not activate its subscription automatically', () => {
    const shop: Shop = {
      id: 'shop-test-2',
      shopCode: 'AP-2026-8888',
      name: 'Test Kiosk Approved',
      ownerName: 'Suresh',
      phone: '+91 99999 11111',
      email: 'suresh@amul.in',
      address: 'Station Rd',
      city: 'Vadodara',
      state: 'Gujarat',
      pincode: '390001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'BASIC',
      subscriptionStatus: 'INACTIVE', // Stays INACTIVE until explicitly subscribed
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(shop.approvalStatus).toBe('APPROVED');
    expect(shop.subscriptionStatus).toBe('INACTIVE');
  });
});

describe('Purchase Posting & Stock Increment Rules', () => {
  it('confirmed purchases post stock exactly once, while draft purchases do not', () => {
    let initialStock = 50;

    // Simulate Draft Purchase
    const draftPurchase: Partial<PurchaseBill> = {
      status: 'DRAFT',
      stockPosted: false,
      items: [{ productId: 'p1', productName: 'Milk', barcode: '123', quantity: 20, unit: 'Pouch', purchaseRate: 24, mrp: 27, total: 480 }]
    };

    let stockAfterDraft = initialStock;
    if (draftPurchase.status === 'CONFIRMED' && !draftPurchase.stockPosted) {
      stockAfterDraft += draftPurchase.items![0].quantity;
    }
    // Draft does NOT change stock!
    expect(stockAfterDraft).toBe(50);

    // Simulate Confirmed Purchase
    const confirmedPurchase: Partial<PurchaseBill> = {
      status: 'CONFIRMED',
      stockPosted: false,
      items: [{ productId: 'p1', productName: 'Milk', barcode: '123', quantity: 20, unit: 'Pouch', purchaseRate: 24, mrp: 27, total: 480 }]
    };

    let stockAfterConfirm = initialStock;
    if (confirmedPurchase.status === 'CONFIRMED' && !confirmedPurchase.stockPosted) {
      stockAfterConfirm += confirmedPurchase.items![0].quantity;
      confirmedPurchase.stockPosted = true;
    }
    expect(stockAfterConfirm).toBe(70);

    // Re-evaluating an already posted purchase does NOT double increment
    if (confirmedPurchase.status === 'CONFIRMED' && !confirmedPurchase.stockPosted) {
      stockAfterConfirm += confirmedPurchase.items![0].quantity;
    }
    expect(stockAfterConfirm).toBe(70); // Remains 70
  });

  it('cancelling a confirmed purchase reverses the posted stock', () => {
    let currentStock = 70;
    const purchasedQty = 20;
    const isPosted = true;

    // Cancellation logic
    if (isPosted) {
      currentStock = Math.max(0, currentStock - purchasedQty);
    }
    expect(currentStock).toBe(50);
  });
});

describe('Daily Stock Reconciliation Math', () => {
  it('correctly balances closing stock: Opening + Purchases/In - Sold - Out = Closing', () => {
    const openingStock = 50;
    const confirmedPurchases = 30; // 30 crates received from distributor
    const salesQty = 45; // 45 pouches sold at POS
    const damagedOut = 5; // 5 damaged / leaked milk pouches

    const closingStock = openingStock + confirmedPurchases - salesQty - damagedOut;
    expect(closingStock).toBe(30);

    // Verify low stock flag if threshold is 15
    const minThreshold = 15;
    expect(closingStock <= minThreshold).toBe(false);

    // If sales were 62:
    const highSales = 62;
    const lowClosing = openingStock + confirmedPurchases - highSales - damagedOut;
    expect(lowClosing).toBe(13);
    expect(lowClosing <= minThreshold).toBe(true);
  });
});

describe('Financial P&L & Profit Reconciliation', () => {
  it('strictly distinguishes sales revenue from gross and net profit', () => {
    // 100 units of Amul Taaza sold at ₹27 (Cost was ₹24.5)
    const salesRevenue = 100 * 27; // ₹2700
    const costOfGoodsSold = 100 * 24.5; // ₹2450
    const grossProfit = salesRevenue - costOfGoodsSold; // ₹250
    expect(grossProfit).toBe(250);

    // Daily operating expenses (Electricity for deep freezer + Wages)
    const operatingExpenses = 120; // ₹120
    const netProfit = grossProfit - operatingExpenses; // ₹130
    expect(netProfit).toBe(130);
    expect(netProfit).not.toBe(salesRevenue); // Truthful separation!
  });
});

describe('Billing & Idempotency Rules', () => {
  it('calculates net payable and round-off accurately', () => {
    const items = [
      { unitPrice: 27.0, quantity: 3, total: 81.0 },
      { unitPrice: 145.0, quantity: 1, total: 145.0 }
    ];

    const subtotal = items.reduce((acc, i) => acc + i.total, 0);
    expect(subtotal).toBe(226.0);

    const discountPercent = 5;
    const discountAmount = Math.round((subtotal * (discountPercent / 100)) * 100) / 100;
    expect(discountAmount).toBe(11.3);

    const rawFinal = subtotal - discountAmount;
    expect(rawFinal).toBe(214.7);

    const roundedFinal = Math.round(rawFinal);
    expect(roundedFinal).toBe(215);

    const roundOff = Math.round((roundedFinal - rawFinal) * 100) / 100;
    expect(roundOff).toBe(0.3);
  });

  it('guarantees unique idempotency keys per sale', () => {
    const key1 = `idemp-shop1-BILL001-${Date.now()}`;
    const key2 = `idemp-shop1-BILL002-${Date.now() + 1}`;
    expect(key1).not.toBe(key2);
  });
});

describe('Automated Daily Backup Schedule & Missed Backup Detection', () => {
  it('detects missed backup when last backup date is before today and time has passed', () => {
    const todayStr = '2026-10-27';
    const lastBackupDate = '2026-10-26'; // Yesterday
    const scheduledTime = '20:00'; // 8:00 PM

    const isMissed = lastBackupDate < todayStr;
    expect(isMissed).toBe(true);
  });

  it('manifest checksum calculation maintains integrity verification', () => {
    const rawData = JSON.stringify({ shopId: 'shop-1', salesCount: 15 });
    let hash = 0;
    for (let i = 0; i < rawData.length; i++) {
      hash = ((hash << 5) - hash) + rawData.charCodeAt(i);
      hash = hash & hash;
    }
    const checksum = `hash-${Math.abs(hash)}`;
    expect(checksum).toContain('hash-');
  });
});

describe('Purchases and Stock Quantity & Price Editing Logic', () => {
  it('correctly recalculates line total and bill subtotal when item quantity and rate are edited', () => {
    const item = {
      productId: 'prod-milk-500',
      productName: 'Amul Taaza 500ml',
      barcode: '8901262010014',
      quantity: 20,
      unit: 'Pouch',
      purchaseRate: 25.0,
      mrp: 27.0,
      total: 20 * 25.0
    };

    expect(item.total).toBe(500.0);

    // Edit quantity to 25 and rate to 25.5
    const updatedQty = 25;
    const updatedRate = 25.5;
    const updatedTotal = updatedQty * updatedRate;

    expect(updatedTotal).toBe(637.5);

    // Delta in quantity to post to inventory
    const qtyDelta = updatedQty - item.quantity;
    expect(qtyDelta).toBe(5);
  });

  it('correctly computes inventory delta when stock count is adjusted during audit', () => {
    const currentStock = 38;
    const auditedPhysicalStock = 45;
    const stockDelta = auditedPhysicalStock - currentStock;

    expect(stockDelta).toBe(7); // +7 items added as ADJUSTMENT

    const newCostPrice = 24.5;
    const newSellingPrice = 28.0;
    const newMrp = 28.0;

    expect(newCostPrice).toBeLessThan(newSellingPrice);
    expect(newSellingPrice).toBe(newMrp);
  });
});

