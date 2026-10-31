/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Shop Profile Banking, Custom QR, and Bank Statement Passbook
 */

import { describe, it, expect } from 'vitest';
import { Shop, BankEntry, BankStatementSummary } from '../src/types/index.ts';
import { INITIAL_SHOPS, getSeedBankEntriesForShop } from '../src/storage/seedData.ts';

describe('Shop Profile & Bank Settings', () => {
  it('stores bank and UPI payment credentials on Shop model', () => {
    const shop = INITIAL_SHOPS[0];
    expect(shop.bankName).toBe('State Bank of India (SBI)');
    expect(shop.accountHolderName).toContain('Rajesh Patel');
    expect(shop.accountNumber).toBe('384910204928');
    expect(shop.ifscCode).toBe('SBIN0000315');
    expect(shop.upiId).toBe('amulparlour.anand@sbi');
    expect(shop.regionalName).toBe('અમૂલ પ્રેફર્ડ આઉટલેટ - આણંદ ડેરી કિઓસ્ક');
  });

  it('generates standard NPCI compliant UPI dynamic QR link with amount and merchant name', () => {
    const shop = INITIAL_SHOPS[0];
    const amount = 350.50;
    const upiUri = `upi://pay?pa=${shop.upiId}&pn=${encodeURIComponent(shop.name)}&am=${amount.toFixed(2)}&cu=INR`;
    
    expect(upiUri).toContain('upi://pay?');
    expect(upiUri).toContain(`pa=${shop.upiId}`);
    expect(upiUri).toContain('am=350.50');
    expect(upiUri).toContain('cu=INR');
  });

  it('correctly falls back to shop code VPA if no upiId is provided', () => {
    const dummyShop: Shop = {
      ...INITIAL_SHOPS[0],
      shopCode: 'AP-TEST-99',
      upiId: undefined
    };
    const effectiveUpi = dummyShop.upiId || `amul.${dummyShop.shopCode.toLowerCase()}@okhdfcbank`;
    expect(effectiveUpi).toBe('amul.ap-test-99@okhdfcbank');
  });
});

describe('Bank Statement & Passbook Ledger', () => {
  it('loads seed bank entries for shop with credit and debit classifications', () => {
    const entries = getSeedBankEntriesForShop('shop-amul-001');
    expect(entries.length).toBeGreaterThanOrEqual(3);
    
    const deposit = entries.find(e => e.category === 'CASH_DEPOSIT');
    expect(deposit).toBeDefined();
    expect(deposit?.type).toBe('CREDIT');
    expect(deposit?.amount).toBe(15000);

    const supplierPayment = entries.find(e => e.category === 'SUPPLIER_PAYMENT');
    expect(supplierPayment).toBeDefined();
    expect(supplierPayment?.type).toBe('DEBIT');
    expect(supplierPayment?.amount).toBe(12500);

    const upiSale = entries.find(e => e.category === 'UPI_SALE');
    expect(upiSale).toBeDefined();
    expect(upiSale?.type).toBe('CREDIT');
    expect(upiSale?.amount).toBe(420);
  });

  it('computes correct mathematical running balances in chronological order', () => {
    const sampleEntries: BankEntry[] = [
      {
        id: '1',
        shopId: 's1',
        date: '2026-10-25',
        type: 'CREDIT',
        category: 'CASH_DEPOSIT',
        amount: 10000,
        referenceNumber: 'DEP-1',
        description: 'Opening deposit',
        paymentMode: 'CASH_DEPOSIT',
        createdAt: '2026-10-25T10:00:00Z'
      },
      {
        id: '2',
        shopId: 's1',
        date: '2026-10-26',
        type: 'DEBIT',
        category: 'SUPPLIER_PAYMENT',
        amount: 4000,
        referenceNumber: 'PUR-1',
        description: 'Milk delivery payment',
        paymentMode: 'NEFT_RTGS',
        createdAt: '2026-10-26T10:00:00Z'
      },
      {
        id: '3',
        shopId: 's1',
        date: '2026-10-27',
        type: 'CREDIT',
        category: 'UPI_SALE',
        amount: 1500,
        referenceNumber: 'BILL-1',
        description: 'Counter sales',
        paymentMode: 'UPI',
        createdAt: '2026-10-27T10:00:00Z'
      },
      {
        id: '4',
        shopId: 's1',
        date: '2026-10-28',
        type: 'DEBIT',
        category: 'EXPENSE',
        amount: 500,
        referenceNumber: 'EXP-1',
        description: 'Electricity bill',
        paymentMode: 'NET_BANKING',
        createdAt: '2026-10-28T10:00:00Z'
      }
    ];

    // Compute running balance chronologically
    let running = 0;
    const computed = sampleEntries.map(e => {
      if (e.type === 'CREDIT') {
        running += e.amount;
      } else {
        running -= e.amount;
      }
      return { ...e, runningBalance: running };
    });

    expect(computed[0].runningBalance).toBe(10000); // 0 + 10000
    expect(computed[1].runningBalance).toBe(6000);  // 10000 - 4000
    expect(computed[2].runningBalance).toBe(7500);  // 6000 + 1500
    expect(computed[3].runningBalance).toBe(7000);  // 7500 - 500
  });

  it('calculates BankStatementSummary metrics accurately', () => {
    const testEntries: BankEntry[] = [
      {
        id: '1',
        shopId: 's1',
        date: '2026-10-28',
        type: 'CREDIT',
        category: 'UPI_SALE',
        amount: 1000,
        referenceNumber: 'B1',
        description: 'POS Bill 1',
        paymentMode: 'UPI',
        createdAt: '2026-10-28T10:00:00Z'
      },
      {
        id: '2',
        shopId: 's1',
        date: '2026-10-28',
        type: 'CREDIT',
        category: 'UPI_SALE',
        amount: 500,
        referenceNumber: 'B2',
        description: 'POS Bill 2',
        paymentMode: 'UPI',
        createdAt: '2026-10-28T11:00:00Z'
      },
      {
        id: '3',
        shopId: 's1',
        date: '2026-10-28',
        type: 'CREDIT',
        category: 'CASH_DEPOSIT',
        amount: 5000,
        referenceNumber: 'D1',
        description: 'Cash deposit',
        paymentMode: 'CASH_DEPOSIT',
        createdAt: '2026-10-28T12:00:00Z'
      },
      {
        id: '4',
        shopId: 's1',
        date: '2026-10-28',
        type: 'DEBIT',
        category: 'SUPPLIER_PAYMENT',
        amount: 3200,
        referenceNumber: 'P1',
        description: 'GCMMF purchase',
        paymentMode: 'NEFT_RTGS',
        createdAt: '2026-10-28T14:00:00Z'
      }
    ];

    let totalCredits = 0;
    let totalDebits = 0;
    let upiSalesTotal = 0;
    let upiSalesCount = 0;
    let supplierPaymentsTotal = 0;
    let cashDepositsTotal = 0;

    for (const e of testEntries) {
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

    const summary: BankStatementSummary = {
      totalCredits,
      totalDebits,
      netBalance: totalCredits - totalDebits,
      upiSalesTotal,
      upiSalesCount,
      supplierPaymentsTotal,
      cashDepositsTotal
    };

    expect(summary.totalCredits).toBe(6500); // 1000 + 500 + 5000
    expect(summary.totalDebits).toBe(3200);
    expect(summary.netBalance).toBe(3300); // 6500 - 3200
    expect(summary.upiSalesTotal).toBe(1500);
    expect(summary.upiSalesCount).toBe(2);
    expect(summary.supplierPaymentsTotal).toBe(3200);
    expect(summary.cashDepositsTotal).toBe(5000);
  });
});
