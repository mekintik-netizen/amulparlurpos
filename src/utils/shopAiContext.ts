/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Live Shop Data Context Compiler for Amul AI Business Assistant.
 * Aggregates authentic IndexedDB / Firestore-synced records for:
 * - Today's, 7-day, and 30-day revenue, COGS, expenses, net profit, and payment split
 * - Top-selling items, low-stock / out-of-stock alerts, and 0-sale dead stock
 * - 7-day Smart Order replenishment advice
 * - Pending Customer Khata (CREDIT) dues and Pending Agency / Supplier payables
 */

import {
  Expense,
  Product,
  PurchaseBill,
  SaleBill,
  Shop,
  ShopAiContextSummary,
  Supplier
} from '../types/index.ts';
import { AppRepository } from '../storage/repositories.ts';
import { calculateSmartOrderSuggestions } from './smartOrderCalculator.ts';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ComputeShopAiContextInput {
  shop: Shop;
  products: Product[];
  sales: SaleBill[];
  purchases: PurchaseBill[];
  suppliers: Supplier[];
  expenses: Expense[];
  referenceDate?: Date;
}

export function computeShopAiContextFromData({
  shop,
  products,
  sales,
  purchases,
  suppliers,
  expenses,
  referenceDate = new Date()
}: ComputeShopAiContextInput): ShopAiContextSummary {
  const todayStr = toLocalDateKey(referenceDate);
  const refMs = referenceDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff7Ms = refMs - 7 * dayMs;
  const cutoff30Ms = refMs - 30 * dayMs;

  const productCostById = new Map<string, number>();
  for (const p of products) {
    productCostById.set(p.id, Number(p.costPrice) || 0);
  }

  let todayBills = 0;
  let todayRevenue = 0;
  let todayCogs = 0;
  let cash = 0;
  let upi = 0;
  let card = 0;
  let credit = 0;

  let last7DaysBills = 0;
  let last7DaysRevenue = 0;
  let last7DaysCogs = 0;

  let last30DaysBills = 0;
  let last30DaysRevenue = 0;
  let last30DaysCogs = 0;

  const sold7dMap = new Map<
    string,
    { productName: string; unit: string; qtySold: number; revenue: number; currentStock: number }
  >();
  const sold30dByProductId = new Map<string, number>();
  const sold30dByBarcode = new Map<string, number>();

  const customerDueMap = new Map<
    string,
    { customerName: string; customerPhone?: string; dueAmount: number; billCount: number; lastBillDate: string }
  >();
  let totalCustomerCreditAmount = 0;
  let totalCreditBills = 0;

  for (const bill of sales) {
    if (!bill || bill.status === 'CANCELLED' || bill.status === 'FAILED') continue;
    const billAmount = Number(bill.finalAmount) || 0;
    const billTimeMs = new Date(bill.timestamp || bill.createdAt).getTime();
    const billLocalDate = Number.isNaN(billTimeMs)
      ? (bill.timestamp || '').slice(0, 10)
      : toLocalDateKey(new Date(billTimeMs));

    let billCogs = 0;
    for (const item of bill.items || []) {
      const qty = Number(item.quantity) || 0;
      const itemCost = Number(item.costPrice) || productCostById.get(item.productId) || 0;
      billCogs += qty * itemCost;
    }

    if (billLocalDate === todayStr) {
      todayBills += 1;
      todayRevenue += billAmount;
      todayCogs += billCogs;
      if (bill.paymentMode === 'CASH') cash += billAmount;
      else if (bill.paymentMode === 'UPI') upi += billAmount;
      else if (bill.paymentMode === 'CARD') card += billAmount;
      else if (bill.paymentMode === 'CREDIT') credit += billAmount;
    }

    if (!Number.isNaN(billTimeMs) && billTimeMs >= cutoff7Ms && billTimeMs <= refMs) {
      last7DaysBills += 1;
      last7DaysRevenue += billAmount;
      last7DaysCogs += billCogs;
      for (const item of bill.items || []) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        const key = item.productId || item.barcode || item.productName;
        const existing = sold7dMap.get(key) || {
          productName: item.productName,
          unit: item.unit || 'Unit',
          qtySold: 0,
          revenue: 0,
          currentStock: 0
        };
        existing.qtySold += qty;
        existing.revenue += Number(item.total) || qty * (Number(item.unitPrice) || 0);
        sold7dMap.set(key, existing);
      }
    }

    if (!Number.isNaN(billTimeMs) && billTimeMs >= cutoff30Ms && billTimeMs <= refMs) {
      last30DaysBills += 1;
      last30DaysRevenue += billAmount;
      last30DaysCogs += billCogs;
      for (const item of bill.items || []) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        if (item.productId) {
          sold30dByProductId.set(item.productId, (sold30dByProductId.get(item.productId) || 0) + qty);
        }
        if (item.barcode) {
          sold30dByBarcode.set(item.barcode, (sold30dByBarcode.get(item.barcode) || 0) + qty);
        }
      }
    }

    // Track Customer Khata (CREDIT payment bills)
    if (bill.paymentMode === 'CREDIT' && billAmount > 0) {
      totalCustomerCreditAmount += billAmount;
      totalCreditBills += 1;
      const custKey = `${(bill.customerName || 'Walk-in Credit Customer').trim().toLowerCase()}|${(bill.customerPhone || '').trim()}`;
      const existingCust = customerDueMap.get(custKey) || {
        customerName: (bill.customerName || 'Walk-in Credit Customer').trim(),
        customerPhone: bill.customerPhone?.trim() || undefined,
        dueAmount: 0,
        billCount: 0,
        lastBillDate: billLocalDate || todayStr
      };
      existingCust.dueAmount = round2(existingCust.dueAmount + billAmount);
      existingCust.billCount += 1;
      if (billLocalDate && billLocalDate > existingCust.lastBillDate) {
        existingCust.lastBillDate = billLocalDate;
      }
      customerDueMap.set(custKey, existingCust);
    }
  }

  // Expenses aggregation (Today, 7d, 30d)
  const cutoff7DateStr = toLocalDateKey(new Date(cutoff7Ms));
  const cutoff30DateStr = toLocalDateKey(new Date(cutoff30Ms));
  let todayExpenses = 0;
  let last7DaysExpenses = 0;
  let last30DaysExpenses = 0;

  for (const exp of expenses) {
    if (!exp) continue;
    const amt = Number(exp.amount) || 0;
    const d = (exp.date || exp.createdAt || '').slice(0, 10);
    if (!d) continue;
    if (d === todayStr) todayExpenses += amt;
    if (d >= cutoff7DateStr && d <= todayStr) last7DaysExpenses += amt;
    if (d >= cutoff30DateStr && d <= todayStr) last30DaysExpenses += amt;
  }

  // Enrich topSellingProducts7d with current stock
  const productById = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
  }
  const topSellingProducts7d = Array.from(sold7dMap.entries())
    .map(([key, row]) => ({
      ...row,
      qtySold: round2(row.qtySold),
      revenue: round2(row.revenue),
      currentStock: Math.max(0, Number(productById.get(key)?.currentStock) || 0)
    }))
    .sort((a, b) => b.qtySold - a.qtySold || b.revenue - a.revenue)
    .slice(0, 10);

  // Low Stock & Out-of-Stock + 30-day Dead Stock
  const activeProducts = products.filter((p) => p.isActive !== false);
  const lowStockList = activeProducts
    .filter((p) => {
      const stock = Math.max(0, Number(p.currentStock) || 0);
      const alert = Math.max(0, Number(p.minStockAlert ?? 5) || 5);
      return stock <= alert;
    })
    .sort((a, b) => (Number(a.currentStock) || 0) - (Number(b.currentStock) || 0));

  const outOfStockCount = lowStockList.filter((p) => (Number(p.currentStock) || 0) <= 0).length;

  const deadStockItems30d = activeProducts
    .filter((p) => {
      const stock = Number(p.currentStock) || 0;
      if (stock <= 0) return false;
      const sold =
        (sold30dByProductId.get(p.id) || 0) +
        (p.barcode ? sold30dByBarcode.get(p.barcode) || 0 : 0);
      return sold === 0;
    })
    .map((p) => ({
      productName: p.name,
      category: p.category,
      unit: p.unit,
      currentStock: Number(p.currentStock) || 0,
      stockValueAtCost: round2((Number(p.currentStock) || 0) * (Number(p.costPrice) || 0))
    }))
    .sort((a, b) => b.stockValueAtCost - a.stockValueAtCost)
    .slice(0, 15);

  // Smart Order 7d Recommendations (actual POS sales velocity)
  const smartSuggestions = calculateSmartOrderSuggestions({
    products: activeProducts,
    sales,
    cycleDays: 7,
    bufferPercent: 10,
    includeZeroSaleLowStock: false,
    referenceDate
  })
    .filter((s) => s.suggestedQty > 0)
    .slice(0, 15)
    .map((s) => ({
      productName: s.productName,
      unit: s.unit,
      currentStock: s.currentStock,
      avgDailySales: s.avgDailySales,
      suggestedQty: s.suggestedQty,
      purchaseRate: s.purchaseRate,
      estimatedCost: round2(s.suggestedQty * s.purchaseRate)
    }));

  // Pending Purchase Bills & Supplier Payables
  const pendingBills = purchases
    .filter(
      (b) =>
        b &&
        b.status !== 'CANCELLED' &&
        (b.status === 'PENDING' || (Number(b.dueAmount) || 0) > 0)
    )
    .map((b) => ({
      billNumber: b.billNumber || b.purchaseInvoiceNumber || b.id,
      agencyName: b.agencyName || b.supplierName || 'Amul Agency',
      purchaseDate: b.purchaseDate || b.createdAt.slice(0, 10),
      totalAmount: round2(Number(b.totalAmount) || 0),
      paidAmount: round2(Number(b.paidAmount) || 0),
      dueAmount: round2(Math.max(0, Number(b.dueAmount) || (Number(b.totalAmount) || 0) - (Number(b.paidAmount) || 0))),
      status: b.status
    }))
    .sort((a, b) => b.dueAmount - a.dueAmount)
    .slice(0, 15);

  const totalPendingBillsAmount = round2(pendingBills.reduce((s, b) => s + b.dueAmount, 0));

  const suppliersWithBalance = suppliers
    .filter((s) => (Number(s.currentBalance) || 0) > 0)
    .map((s) => ({
      supplierName: s.name,
      companyName: s.companyName,
      phone: s.phone,
      payableBalance: round2(Number(s.currentBalance) || 0)
    }))
    .sort((a, b) => b.payableBalance - a.payableBalance);

  const totalSupplierLedgerBalance = round2(
    suppliersWithBalance.reduce((s, sup) => s + sup.payableBalance, 0)
  );

  const todayGrossProfit = round2(todayRevenue - todayCogs);
  const todayNetProfit = round2(todayGrossProfit - todayExpenses);

  return {
    generatedAt: referenceDate.toISOString(),
    shop: {
      id: shop.id,
      shopCode: shop.shopCode,
      name: shop.name,
      city: shop.city || 'Gujarat',
      ownerName: shop.ownerName || 'Owner'
    },
    salesMetrics: {
      todayDate: todayStr,
      todayBills,
      todayRevenue: round2(todayRevenue),
      todayCogs: round2(todayCogs),
      todayGrossProfit,
      todayExpenses: round2(todayExpenses),
      todayNetProfit,
      todayByPaymentMode: {
        cash: round2(cash),
        upi: round2(upi),
        card: round2(card),
        credit: round2(credit)
      },
      last7DaysBills,
      last7DaysRevenue: round2(last7DaysRevenue),
      last7DaysExpenses: round2(last7DaysExpenses),
      last7DaysEstimatedNetProfit: round2(last7DaysRevenue - last7DaysCogs - last7DaysExpenses),
      last30DaysBills,
      last30DaysRevenue: round2(last30DaysRevenue),
      last30DaysExpenses: round2(last30DaysExpenses),
      last30DaysEstimatedNetProfit: round2(last30DaysRevenue - last30DaysCogs - last30DaysExpenses)
    },
    topSellingProducts7d,
    lowStockItems: lowStockList.slice(0, 20).map((p) => ({
      productName: p.name,
      unit: p.unit,
      currentStock: Math.max(0, Number(p.currentStock) || 0),
      minStockAlert: Math.max(0, Number(p.minStockAlert ?? 5) || 5),
      costPrice: Number(p.costPrice) || 0,
      sellingPrice: Number(p.sellingPrice) || 0
    })),
    outOfStockCount,
    lowStockCount: lowStockList.length,
    deadStockItems30d,
    smartOrder7dRecommendations: smartSuggestions,
    pendingCustomerDues: {
      totalPendingAmount: round2(totalCustomerCreditAmount),
      totalCreditBills,
      customers: Array.from(customerDueMap.values())
        .sort((a, b) => b.dueAmount - a.dueAmount)
        .slice(0, 15)
    },
    pendingSupplierPayables: {
      totalPendingBillsAmount,
      totalSupplierLedgerBalance,
      pendingBills,
      suppliersWithBalance
    }
  };
}

/**
 * Fetches live local IndexedDB / Firestore-synced records for the active shop
 * and compiles the ShopAiContextSummary snapshot.
 */
export async function buildShopAiContext(shop: Shop): Promise<ShopAiContextSummary> {
  const [products, sales, purchases, suppliers, expenses] = await Promise.all([
    AppRepository.products.getByShop(shop.id),
    AppRepository.sales.getByShop(shop.id),
    AppRepository.purchases.getByShop(shop.id),
    AppRepository.suppliers.getAll(shop.id),
    AppRepository.expenses.getByShop(shop.id)
  ]);

  return computeShopAiContextFromData({
    shop,
    products,
    sales,
    purchases,
    suppliers,
    expenses
  });
}
