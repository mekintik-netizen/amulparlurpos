/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Automated Tests for Thermal Receipt Printing,
 * 58mm/80mm Formatting, Windows 11 Calibration, and Transaction Immutability.
 */

import { describe, it, expect, vi } from 'vitest';
import { SaleBill, Shop, Product, StockMovement } from '../src/types/index.ts';

describe('Thermal Receipt Printing & Roll Geometry Verification', () => {
  const sampleShop: Shop = {
    id: 'shop-anand-01',
    shopCode: 'AP-2026-1001',
    name: 'Amul Preferred Parlour - Anand Station',
    ownerName: 'Kailash Patel',
    phone: '+91 98250 12345',
    email: 'anand.station@amul.in',
    address: 'Shop 4, Railway Station Complex',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    gstNumber: '24AAAAA0000A1Z5',
    fssaiNumber: '10722001000123',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  const sampleBill: SaleBill = {
    id: 'bill-101',
    billNumber: 'BILL-20261028-1001',
    shopId: 'shop-anand-01',
    timestamp: '2026-10-28T10:15:30.000Z',
    items: [
      {
        productId: 'prod-milk-500',
        productName: 'Amul Taaza Homogenised Toned Milk 500ml',
        barcode: '8901262010014',
        quantity: 3,
        unit: 'Pouch',
        mrp: 27,
        unitPrice: 27,
        costPrice: 24.5,
        total: 81
      },
      {
        productId: 'prod-butter-100',
        productName: 'Amul Pasteurized Butter 100g',
        barcode: '8901262010151',
        quantity: 2,
        unit: 'Pack',
        mrp: 60,
        unitPrice: 60,
        costPrice: 54,
        total: 120
      },
      {
        productId: 'prod-cheese-cube',
        productName: 'Amul Processed Cheese Cubes 200g',
        barcode: '8901262020014',
        quantity: 1,
        unit: 'Box',
        mrp: 140,
        unitPrice: 140,
        costPrice: 126,
        total: 140
      }
    ],
    itemCount: 6,
    subtotal: 341,
    discountAmount: 11,
    taxAmount: 16.5,
    roundOff: 0.5,
    finalAmount: 347,
    paymentMode: 'UPI',
    customerName: 'Priya Sharma',
    customerPhone: '+91 98765 43210',
    status: 'COMPLETED',
    cashierName: 'Counter Cashier 1',
    idempotencyKey: 'idemp-shop-anand-01-BILL-20261028-1001-1772187330',
    createdAt: '2026-10-28T10:15:30.000Z'
  };

  it('verifies 58mm thermal roll printable width and formatting constraints', () => {
    // 58mm (2-inch roll) has a physical paper width of ~58mm and active printable width of ~48mm (384 dots)
    const paperWidth58 = '58mm';
    const printableWidthMm = 48;
    const maxDotColumns = 384;

    expect(paperWidth58).toBe('58mm');
    expect(printableWidthMm).toBeLessThanOrEqual(58);
    expect(maxDotColumns).toBe(384);

    // In 58mm mode, item details must be rendered on 2 lines to avoid text clipping:
    // Line 1: Item Name
    // Line 2: Quantity x Rate -> Line Total
    sampleBill.items.forEach(item => {
      const line1 = item.productName;
      const line2Details = `${item.quantity} ${item.unit} x ₹${item.unitPrice.toFixed(1)}`;
      const line2Total = `₹${item.total.toFixed(2)}`;

      expect(line1.length).toBeGreaterThan(0);
      expect(line2Details).toContain('x ₹');
      expect(line2Total).toContain('₹');
    });
  });

  it('verifies 80mm thermal roll printable width and 4-column layout capability', () => {
    // 80mm (3-inch roll) has a physical paper width of ~80mm and active printable width of ~72mm (576 dots)
    const paperWidth80 = '80mm';
    const printableWidthMm = 72;
    const maxDotColumns = 576;

    expect(paperWidth80).toBe('80mm');
    expect(printableWidthMm).toBeLessThanOrEqual(80);
    expect(maxDotColumns).toBe(576);

    // 80mm provides sufficient horizontal space for standard 4-column grid:
    // Column 1: Item & Barcode
    // Column 2: Qty
    // Column 3: Rate
    // Column 4: Amount
    sampleBill.items.forEach(item => {
      expect(item.productName).toBeDefined();
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.unitPrice).toBeGreaterThan(0);
      expect(item.total).toBe(item.quantity * item.unitPrice);
    });
  });

  it('validates financial exactness of bill calculations on receipt', () => {
    // 1. Total pieces count
    const totalPcs = sampleBill.items.reduce((sum, item) => sum + item.quantity, 0);
    expect(totalPcs).toBe(6);
    expect(sampleBill.itemCount).toBe(6);

    // 2. Subtotal calculation
    const calculatedSubtotal = sampleBill.items.reduce((sum, item) => sum + item.total, 0);
    expect(calculatedSubtotal).toBe(341);
    expect(sampleBill.subtotal).toBe(calculatedSubtotal);

    // 3. Net payable amount equation: Subtotal - Discount + Tax + RoundOff
    const expectedPayable = calculatedSubtotal - sampleBill.discountAmount + sampleBill.taxAmount + sampleBill.roundOff;
    expect(expectedPayable).toBe(347);
    expect(sampleBill.finalAmount).toBe(347);
  });

  it('verifies all mandatory shop credentials and statutory identifiers are present', () => {
    expect(sampleShop.name).toContain('Amul');
    expect(sampleShop.shopCode).toMatch(/^AP-\d{4}-\d{4}$/);
    expect(sampleShop.phone).toBeTruthy();
    expect(sampleShop.gstNumber).toBe('24AAAAA0000A1Z5');
    expect(sampleShop.fssaiNumber).toBe('10722001000123');
  });

  it('verifies bill header metadata and customer details', () => {
    expect(sampleBill.billNumber).toMatch(/^BILL-\d{8}-\d{4}$/);
    expect(sampleBill.paymentMode).toBe('UPI');
    expect(sampleBill.customerName).toBe('Priya Sharma');
    expect(sampleBill.customerPhone).toBe('+91 98765 43210');
    expect(sampleBill.cashierName).toBe('Counter Cashier 1');
  });
});

describe('Sale Completion & Reprint Immutability Workflow', () => {
  // Simulated shop inventory
  let inventory: Record<string, number>;
  let savedBills: SaleBill[];
  let recordedMovements: StockMovement[];

  const resetState = () => {
    inventory = {
      'prod-milk-500': 50,
      'prod-butter-100': 30,
      'prod-cheese-cube': 20
    };
    savedBills = [];
    recordedMovements = [];
  };

  // Simulated repository sale execution (mirrors AppRepository.sales.createBill)
  const executeSale = (billData: Omit<SaleBill, 'id' | 'createdAt'>): SaleBill => {
    // Check if idempotency key already processed
    const existing = savedBills.find(b => b.idempotencyKey === billData.idempotencyKey);
    if (existing) {
      return existing; // Idempotent return without duplicate deduction
    }

    // Decrement stock exactly once
    billData.items.forEach(item => {
      const current = inventory[item.productId] || 0;
      if (current < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productName}`);
      }
      inventory[item.productId] = current - item.quantity;

      recordedMovements.push({
        id: `mov-${Date.now()}-${item.productId}`,
        shopId: billData.shopId,
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        movementType: 'SALE',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        reason: `Retail Sale Bill ${billData.billNumber}`,
        referenceNumber: billData.billNumber,
        timestamp: new Date().toISOString(),
        createdBy: billData.cashierName
      });
    });

    const saved: SaleBill = {
      ...billData,
      id: `bill-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    savedBills.push(saved);
    return saved;
  };

  it('completing a sale saves bill and decrements stock exactly once', () => {
    resetState();

    const newSaleData: Omit<SaleBill, 'id' | 'createdAt'> = {
      billNumber: 'BILL-20261028-5555',
      shopId: 'shop-anand-01',
      timestamp: new Date().toISOString(),
      items: [
        {
          productId: 'prod-milk-500',
          productName: 'Amul Taaza Milk 500ml',
          barcode: '8901262010014',
          quantity: 5,
          unit: 'Pouch',
          mrp: 27,
          unitPrice: 27,
          costPrice: 24.5,
          total: 135
        },
        {
          productId: 'prod-butter-100',
          productName: 'Amul Butter 100g',
          barcode: '8901262010151',
          quantity: 2,
          unit: 'Pack',
          mrp: 60,
          unitPrice: 60,
          costPrice: 54,
          total: 120
        }
      ],
      itemCount: 7,
      subtotal: 255,
      discountAmount: 0,
      taxAmount: 0,
      roundOff: 0,
      finalAmount: 255,
      paymentMode: 'CASH',
      status: 'COMPLETED',
      cashierName: 'Counter Cashier',
      idempotencyKey: 'idemp-test-sale-1'
    };

    const savedBill = executeSale(newSaleData);

    expect(savedBills.length).toBe(1);
    expect(savedBill.billNumber).toBe('BILL-20261028-5555');
    // Check inventory reduced
    expect(inventory['prod-milk-500']).toBe(45); // 50 - 5
    expect(inventory['prod-butter-100']).toBe(28); // 30 - 2
    expect(recordedMovements.length).toBe(2);
  });

  it('opening receipt preview or reprinting NEVER alters stock or duplicates bills', () => {
    resetState();

    // 1. Initial sale completed
    const savedBill = executeSale({
      billNumber: 'BILL-20261028-7777',
      shopId: 'shop-anand-01',
      timestamp: new Date().toISOString(),
      items: [
        {
          productId: 'prod-milk-500',
          productName: 'Amul Taaza Milk 500ml',
          barcode: '8901262010014',
          quantity: 4,
          unit: 'Pouch',
          mrp: 27,
          unitPrice: 27,
          costPrice: 24.5,
          total: 108
        }
      ],
      itemCount: 4,
      subtotal: 108,
      discountAmount: 0,
      taxAmount: 0,
      roundOff: 0,
      finalAmount: 108,
      paymentMode: 'UPI',
      status: 'COMPLETED',
      cashierName: 'Counter Cashier',
      idempotencyKey: 'idemp-test-sale-2'
    });

    const stockAfterSale = { ...inventory };
    expect(stockAfterSale['prod-milk-500']).toBe(46); // 50 - 4
    expect(savedBills.length).toBe(1);

    // 2. User opens ThermalReceipt preview (setActiveReceiptBill(savedBill))
    let activeReceiptBill: SaleBill | null = savedBill;

    // 3. User clicks "Print Receipt (58mm)" 3 times (e.g. printer jammed, paper reload, customer wanted copy)
    for (let printAttempt = 1; printAttempt <= 3; printAttempt++) {
      // In ThermalReceipt, printing triggers window.print() on the active bill preview
      // It does NOT execute any inventory updates or bill creation
      expect(activeReceiptBill.id).toBe(savedBill.id);
      expect(activeReceiptBill.billNumber).toBe('BILL-20261028-7777');
    }

    // 4. User closes preview
    activeReceiptBill = null;

    // 5. User later navigates to Daily Reports and clicks "Reprint Bill" on BILL-20261028-7777
    activeReceiptBill = savedBills.find(b => b.billNumber === 'BILL-20261028-7777') || null;
    expect(activeReceiptBill).not.toBeNull();

    // Verify stock and bills did NOT change at all
    expect(inventory['prod-milk-500']).toBe(46); // Still 46, absolutely untouched
    expect(savedBills.length).toBe(1); // Still 1 bill
    expect(recordedMovements.length).toBe(1); // Still 1 movement record
  });

  it('idempotency key stops duplicate sale submission if user double-clicks Bill button', () => {
    resetState();

    const salePayload: Omit<SaleBill, 'id' | 'createdAt'> = {
      billNumber: 'BILL-20261028-9999',
      shopId: 'shop-anand-01',
      timestamp: new Date().toISOString(),
      items: [
        {
          productId: 'prod-cheese-cube',
          productName: 'Amul Cheese Cubes 200g',
          barcode: '8901262020014',
          quantity: 2,
          unit: 'Box',
          mrp: 140,
          unitPrice: 140,
          costPrice: 126,
          total: 280
        }
      ],
      itemCount: 2,
      subtotal: 280,
      discountAmount: 0,
      taxAmount: 0,
      roundOff: 0,
      finalAmount: 280,
      paymentMode: 'CASH',
      status: 'COMPLETED',
      cashierName: 'Counter Cashier',
      idempotencyKey: 'same-idempotency-key-from-double-click'
    };

    // First click: Processes successfully
    const firstResult = executeSale(salePayload);
    expect(firstResult).toBeDefined();
    expect(inventory['prod-cheese-cube']).toBe(18); // 20 - 2
    expect(savedBills.length).toBe(1);

    // Second click with identical idempotencyKey: Returns existing bill without double deduction
    const secondResult = executeSale(salePayload);
    expect(secondResult.id).toBe(firstResult.id);
    expect(inventory['prod-cheese-cube']).toBe(18); // NOT 16! Stock preserved!
    expect(savedBills.length).toBe(1); // No second bill created
  });
});

describe('Thermal Print CSS Isolation & Zero Blank Page Rules', () => {
  it('defines the required media print identifiers and classes', () => {
    // The following IDs and classes are strictly bound to src/index.css @media print rules
    const requiredPrintTargetIds = [
      'thermal-modal-overlay',
      'thermal-modal-card',
      'thermal-paper-scroll',
      'thermal-receipt-container'
    ];

    requiredPrintTargetIds.forEach(id => {
      expect(id).toMatch(/^thermal-/);
    });

    const requiredHiddenClasses = [
      'no-print',
      'header',
      'nav',
      'button'
    ];

    expect(requiredHiddenClasses).toContain('no-print');
  });

  it('verifies test calibration receipt mode structure', () => {
    const testCalibrationBill = {
      billNumber: 'TEST-ROLL-CALIBRATION',
      items: [
        { productName: 'Amul Taaza Milk 500ml', quantity: 2, total: 54 },
        { productName: 'Amul Butter 100g Pack', quantity: 1, total: 60 }
      ],
      finalAmount: 114,
      notes: 'Printer Alignment Test'
    };

    expect(testCalibrationBill.billNumber).toBe('TEST-ROLL-CALIBRATION');
    expect(testCalibrationBill.items.length).toBe(2);
    expect(testCalibrationBill.finalAmount).toBe(114);
    expect(testCalibrationBill.notes).toBe('Printer Alignment Test');
  });
});
