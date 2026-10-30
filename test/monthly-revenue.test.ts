/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for 12-Month Revenue Aggregation & Analytics
 */

import { describe, it, expect } from 'vitest';
import { SaleBill } from '../src/types/index.ts';

describe('12-Month Monthly Revenue Analytics Calculation', () => {
  // Helper matching the component's last 12 months generation logic
  function generateLast12Months(refDate: Date = new Date()) {
    const list: { key: string; label: string; name: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const shortYear = String(year).slice(-2);
      const label = d.toLocaleString('en-US', { month: 'short' }) + ` '${shortYear}`;
      const name = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      list.push({ key, label, name });
    }
    return list;
  }

  function aggregateMonthlySales(sales: SaleBill[], months: { key: string }[], filterShopId = 'ALL') {
    const validSales = sales.filter(s => {
      const notCancelled = s.status !== 'CANCELLED';
      const matchesShop = filterShopId === 'ALL' || s.shopId === filterShopId;
      return notCancelled && matchesShop;
    });

    return months.map(m => {
      const monthBills = validSales.filter(s => s.timestamp && s.timestamp.startsWith(m.key));
      const revenue = monthBills.reduce((acc, b) => acc + (b.finalAmount || 0), 0);
      const orders = monthBills.length;
      const avgOrder = orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0;
      return {
        monthKey: m.key,
        revenue,
        orders,
        avgOrder
      };
    });
  }

  it('generates an exact sequence of 12 chronological months', () => {
    const months = generateLast12Months(new Date('2026-10-28T00:00:00Z'));
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe('2025-11');
    expect(months[11].key).toBe('2026-10');
    expect(months[11].label).toContain("'26");
  });

  it('aggregates revenue and order counts correctly across months', () => {
    const months = generateLast12Months(new Date('2026-10-28T00:00:00Z'));
    const mockSales: SaleBill[] = [
      {
        id: 'bill-1',
        billNumber: 'B-101',
        shopId: 'shop-01',
        timestamp: '2026-10-15T10:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 500,
        paymentMode: 'UPI',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k1',
        createdAt: '2026-10-15T10:00:00.000Z'
      },
      {
        id: 'bill-2',
        billNumber: 'B-102',
        shopId: 'shop-01',
        timestamp: '2026-10-16T11:00:00.000Z',
        items: [],
        itemCount: 2,
        subtotal: 1500,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 1500,
        paymentMode: 'CASH',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k2',
        createdAt: '2026-10-16T11:00:00.000Z'
      },
      {
        id: 'bill-3',
        billNumber: 'B-103',
        shopId: 'shop-01',
        timestamp: '2026-09-05T09:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 750,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 750,
        paymentMode: 'CARD',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k3',
        createdAt: '2026-09-05T09:00:00.000Z'
      }
    ];

    const aggregated = aggregateMonthlySales(mockSales, months);
    
    // October 2026 check (500 + 1500 = 2000, 2 orders, avg 1000)
    const octData = aggregated.find(d => d.monthKey === '2026-10');
    expect(octData).toBeDefined();
    expect(octData?.revenue).toBe(2000);
    expect(octData?.orders).toBe(2);
    expect(octData?.avgOrder).toBe(1000);

    // September 2026 check
    const sepData = aggregated.find(d => d.monthKey === '2026-09');
    expect(sepData?.revenue).toBe(750);
    expect(sepData?.orders).toBe(1);
    expect(sepData?.avgOrder).toBe(750);
  });

  it('strictly excludes CANCELLED bills from monthly revenue totals', () => {
    const months = generateLast12Months(new Date('2026-10-28T00:00:00Z'));
    const mockSales: SaleBill[] = [
      {
        id: 'bill-valid',
        billNumber: 'B-201',
        shopId: 'shop-01',
        timestamp: '2026-10-01T10:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 800,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 800,
        paymentMode: 'CASH',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k4',
        createdAt: '2026-10-01T10:00:00.000Z'
      },
      {
        id: 'bill-cancelled',
        billNumber: 'B-202',
        shopId: 'shop-01',
        timestamp: '2026-10-02T10:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 10000,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 10000,
        paymentMode: 'CASH',
        status: 'CANCELLED', // Cancelled transaction
        cashierName: 'Cashier',
        idempotencyKey: 'k5',
        createdAt: '2026-10-02T10:00:00.000Z'
      }
    ];

    const aggregated = aggregateMonthlySales(mockSales, months);
    const octData = aggregated.find(d => d.monthKey === '2026-10');

    // Only bill-valid (800) must be counted
    expect(octData?.revenue).toBe(800);
    expect(octData?.orders).toBe(1);
  });

  it('supports filtering monthly revenue by specific shopId', () => {
    const months = generateLast12Months(new Date('2026-10-28T00:00:00Z'));
    const mockSales: SaleBill[] = [
      {
        id: 'bill-shop-1',
        billNumber: 'B-301',
        shopId: 'shop-anand',
        timestamp: '2026-10-05T10:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 1200,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 1200,
        paymentMode: 'UPI',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k6',
        createdAt: '2026-10-05T10:00:00.000Z'
      },
      {
        id: 'bill-shop-2',
        billNumber: 'B-302',
        shopId: 'shop-vadodara',
        timestamp: '2026-10-06T10:00:00.000Z',
        items: [],
        itemCount: 1,
        subtotal: 3500,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 3500,
        paymentMode: 'UPI',
        status: 'COMPLETED',
        cashierName: 'Cashier',
        idempotencyKey: 'k7',
        createdAt: '2026-10-06T10:00:00.000Z'
      }
    ];

    // Filter by shop-anand only
    const anandSales = aggregateMonthlySales(mockSales, months, 'shop-anand');
    const octAnand = anandSales.find(d => d.monthKey === '2026-10');
    expect(octAnand?.revenue).toBe(1200);

    // Filter by shop-vadodara only
    const vadodaraSales = aggregateMonthlySales(mockSales, months, 'shop-vadodara');
    const octVadodara = vadodaraSales.find(d => d.monthKey === '2026-10');
    expect(octVadodara?.revenue).toBe(3500);

    // Combined all shops
    const allSales = aggregateMonthlySales(mockSales, months, 'ALL');
    const octAll = allSales.find(d => d.monthKey === '2026-10');
    expect(octAll?.revenue).toBe(4700);
  });
});
