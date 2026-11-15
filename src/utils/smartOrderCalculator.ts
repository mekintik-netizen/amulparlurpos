/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smart Order (ઓટો ઓર્ડર & પર્ચેઝ લિસ્ટ) Calculation, WhatsApp Formatter, and PDF Generator.
 * Formula:
 *   Suggested Qty = Math.max(0, Math.ceil((Avg Daily Sales × Cycle Days × BufferMultiplier) - CurrentStock))
 * Also surfaces low-stock items (CurrentStock <= minStockAlert) even when recent sales are zero.
 */

import { jsPDF } from 'jspdf';
import {
  Product,
  SaleBill,
  Shop,
  SmartOrderBufferPercent,
  SmartOrderCycleDays,
  SmartOrderSuggestion
} from '../types/index.ts';

export interface CalculateSmartOrderInput {
  products: Product[];
  sales: SaleBill[];
  cycleDays: SmartOrderCycleDays;
  bufferPercent: SmartOrderBufferPercent;
  referenceDate?: Date;
}

export function roundMoney3(val: number): number {
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

/**
 * Computes auto-order replenishment suggestions for every active product based on
 * POS billing history over the selected cycle window + safety buffer + low-stock alerts.
 */
export function calculateSmartOrderSuggestions({
  products,
  sales,
  cycleDays,
  bufferPercent,
  referenceDate = new Date()
}: CalculateSmartOrderInput): SmartOrderSuggestion[] {
  const refMs = referenceDate.getTime();
  const windowMs = cycleDays * 24 * 60 * 60 * 1000;
  const cutoffMs = refMs - windowMs;
  const bufferMultiplier = 1 + bufferPercent / 100;

  // Aggregate sold quantities from non-cancelled POS bills within the lookback window
  const soldByProductId = new Map<string, number>();
  const soldByBarcode = new Map<string, number>();

  for (const bill of sales) {
    if (!bill || bill.status === 'CANCELLED' || bill.status === 'FAILED') continue;
    const billTime = new Date(bill.timestamp).getTime();
    if (Number.isNaN(billTime) || billTime < cutoffMs || billTime > refMs) continue;

    for (const item of bill.items || []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      if (item.productId) {
        soldByProductId.set(item.productId, (soldByProductId.get(item.productId) || 0) + qty);
      }
      if (item.barcode) {
        soldByBarcode.set(item.barcode, (soldByBarcode.get(item.barcode) || 0) + qty);
      }
    }
  }

  const suggestions: SmartOrderSuggestion[] = products
    .filter(p => p.isActive !== false)
    .map(p => {
      const soldById = soldByProductId.get(p.id);
      const totalSoldInCycle =
        soldById !== undefined
          ? soldById
          : p.barcode
          ? soldByBarcode.get(p.barcode) || 0
          : 0;

      const avgDailySales = Math.round((totalSoldInCycle / cycleDays) * 1000) / 1000;
      const currentStock = Math.max(0, Number(p.currentStock) || 0);
      const minStockAlert = Math.max(0, Number(p.minStockAlert) ?? 5);

      const suggestedQty = Math.max(
        0,
        Math.ceil(avgDailySales * cycleDays * bufferMultiplier - currentStock)
      );

      const isLowStock = currentStock <= minStockAlert;

      // Default orderQty equals suggestedQty; if suggestedQty is 0 for a low-stock item,
      // prefill shortfall to bring stock above minStockAlert (minimum 1 unit) while keeping
      // suggestedQty strictly faithful to the sales-velocity formula.
      const defaultOrderQty =
        suggestedQty > 0
          ? suggestedQty
          : isLowStock
          ? Math.max(1, Math.ceil(minStockAlert - currentStock))
          : 0;

      const purchaseRate = Math.max(0, Number(p.costPrice) || 0);
      const mrp = Math.max(0, Number(p.mrp) || 0);
      const estimatedTotal = roundMoney3(defaultOrderQty * purchaseRate);
      const selected = suggestedQty > 0 || isLowStock;

      return {
        product: p,
        productId: p.id,
        productName: p.name,
        regionalName: p.regionalName,
        barcode: p.barcode || '',
        category: p.category,
        unit: p.unit,
        currentStock,
        minStockAlert,
        totalSoldInCycle: roundMoney3(totalSoldInCycle),
        avgDailySales,
        suggestedQty,
        orderQty: defaultOrderQty,
        purchaseRate,
        mrp,
        estimatedTotal,
        isLowStock,
        selected
      };
    });

  // Sort: highest suggestedQty first, then low-stock items, then by name
  suggestions.sort((a, b) => {
    const aNeedsOrder = a.suggestedQty > 0 || a.isLowStock ? 1 : 0;
    const bNeedsOrder = b.suggestedQty > 0 || b.isLowStock ? 1 : 0;
    if (bNeedsOrder !== aNeedsOrder) return bNeedsOrder - aNeedsOrder;
    if (b.suggestedQty !== a.suggestedQty) return b.suggestedQty - a.suggestedQty;
    if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
    return a.productName.localeCompare(b.productName);
  });

  return suggestions;
}

/**
 * Formats selected Smart Order items into a crisp WhatsApp order message (Gujarati + English).
 */
export function formatSmartOrderWhatsAppText(params: {
  shop: Pick<Shop, 'name' | 'shopCode' | 'phone'>;
  supplierName: string;
  cycleDays: SmartOrderCycleDays;
  bufferPercent: SmartOrderBufferPercent;
  items: SmartOrderSuggestion[];
  orderDate?: string;
}): string {
  const { shop, supplierName, cycleDays, bufferPercent, items } = params;
  const activeItems = items.filter(i => i.selected && i.orderQty > 0);
  const dateLabel = params.orderDate || new Date().toLocaleDateString('en-IN');
  const cycleLabel =
    cycleDays === 7
      ? 'Weekly (7 Days / અઠવાડિક)'
      : cycleDays === 15
      ? 'Fortnightly (15 Days / ૧૫ દિવસ)'
      : 'Monthly (30 Days / માસિક)';

  const totalUnits = activeItems.reduce((sum, i) => sum + i.orderQty, 0);
  const estimatedValue = activeItems.reduce((sum, i) => sum + i.orderQty * i.purchaseRate, 0);

  const lines: string[] = [
    `*AMUL PARLOUR - SMART PURCHASE ORDER (ઓર્ડર લિસ્ટ)*`,
    `Parlour: ${shop.name} (${shop.shopCode})`,
    shop.phone ? `Contact: ${shop.phone}` : '',
    `Supplier / Agency: ${supplierName || 'Amul Dairy Depot'}`,
    `Cycle: ${cycleLabel}${bufferPercent > 0 ? ` (+${bufferPercent}% Buffer)` : ''}`,
    `Date: ${dateLabel}`,
    `--------------------------------`,
    ...activeItems.map(
      (item, idx) =>
        `${idx + 1}. ${item.productName}${item.regionalName ? ` (${item.regionalName})` : ''} — *${item.orderQty} ${item.unit}* @ Rs.${item.purchaseRate.toFixed(2)}`
    ),
    `--------------------------------`,
    `Total SKUs: ${activeItems.length} | Total Qty: ${Math.round(totalUnits * 1000) / 1000}`,
    `*Estimated Order Value: Rs. ${estimatedValue.toFixed(2)}*`,
    `Please confirm stock dispatch. Thank you!`
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(phone: string | undefined, message: string): string {
  const rawDigits = (phone || '').replace(/\D/g, '');
  let normalizedPhone = '';
  if (rawDigits.length === 10) {
    normalizedPhone = `91${rawDigits}`;
  } else if (rawDigits.length >= 11) {
    normalizedPhone = rawDigits;
  }
  const encoded = encodeURIComponent(message);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

/**
 * Generates and downloads a clean A4 Purchase Order PDF using jsPDF.
 */
export function downloadSmartOrderPdf(params: {
  shop: Pick<Shop, 'name' | 'shopCode' | 'phone' | 'address' | 'gstNumber'>;
  supplierName: string;
  cycleDays: SmartOrderCycleDays;
  bufferPercent: SmartOrderBufferPercent;
  items: SmartOrderSuggestion[];
}): void {
  const { shop, supplierName, cycleDays, bufferPercent, items } = params;
  const activeItems = items.filter(i => i.selected && i.orderQty > 0);
  if (activeItems.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const cycleText =
    cycleDays === 7 ? 'Weekly (7 Days)' : cycleDays === 15 ? 'Fortnightly (15 Days)' : 'Monthly (30 Days)';

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(0, 90, 156);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setFillColor(227, 24, 55);
    doc.rect(0, 24, 210, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('AMUL PARLOUR - SMART PURCHASE ORDER', 14, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Replenishment Cycle: ${cycleText}  |  Safety Buffer: +${bufferPercent}%  |  Date: ${todayStr}`, 14, 18);
    doc.text(`Page ${pageNum}`, 195, 18, { align: 'right' });
  };

  drawHeader(1);

  // Shop & Supplier summary card
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 30, 182, 22, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 30, 182, 22, 2, 2, 'S');

  doc.setTextColor(0, 90, 156);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(shop.name || 'Amul Parlour', 18, 37);

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Code: ${shop.shopCode}  |  Phone: ${shop.phone || 'N/A'}`, 18, 43);
  doc.text(`To Supplier / Agency: ${supplierName || 'Amul Dairy Depot'}`, 18, 48);

  const totalUnits = activeItems.reduce((sum, i) => sum + i.orderQty, 0);
  const grandTotal = activeItems.reduce((sum, i) => sum + i.orderQty * i.purchaseRate, 0);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Est. Total: INR ${grandTotal.toFixed(2)}`, 192, 43, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Items: ${activeItems.length} SKUs (${Math.round(totalUnits * 1000) / 1000} units)`, 192, 48, {
    align: 'right'
  });

  // Table header
  let y = 58;
  const drawTableHeader = (topY: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(14, topY, 182, 8, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, topY, 182, 8, 'S');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('#', 17, topY + 5.2);
    doc.text('PRODUCT NAME', 25, topY + 5.2);
    doc.text('STOCK', 108, topY + 5.2, { align: 'right' });
    doc.text('AVG/DAY', 126, topY + 5.2, { align: 'right' });
    doc.text('ORDER QTY', 148, topY + 5.2, { align: 'right' });
    doc.text('RATE (INR)', 170, topY + 5.2, { align: 'right' });
    doc.text('TOTAL (INR)', 193, topY + 5.2, { align: 'right' });
  };

  drawTableHeader(y);
  y += 8;

  let pageNum = 1;
  activeItems.forEach((item, index) => {
    if (y > 272) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = 32;
      drawTableHeader(y);
      y += 8;
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 7.5, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y + 7.5, 196, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(index + 1), 17, y + 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    const clippedName = item.productName.length > 42 ? `${item.productName.slice(0, 40)}..` : item.productName;
    doc.text(clippedName, 25, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.text(`${item.currentStock}`, 108, y + 5, { align: 'right' });
    doc.text(`${item.avgDailySales.toFixed(2)}`, 126, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 90, 156);
    doc.text(`${item.orderQty} ${item.unit}`, 148, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(item.purchaseRate.toFixed(2), 170, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text((item.orderQty * item.purchaseRate).toFixed(2), 193, y + 5, { align: 'right' });

    y += 7.5;
  });

  // Total Footer
  if (y > 268) {
    doc.addPage();
    pageNum += 1;
    drawHeader(pageNum);
    y = 34;
  }
  y += 4;
  doc.setFillColor(0, 90, 156);
  doc.roundedRect(115, y, 81, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ESTIMATED TOTAL:', 119, y + 7.5);
  doc.text(`INR ${grandTotal.toFixed(2)}`, 192, y + 7.5, { align: 'right' });

  const safeCode = (shop.shopCode || 'SHOP').replace(/[^a-zA-Z0-9_-]/g, '');
  doc.save(`Smart-Order-${safeCode}-${todayStr}.pdf`);
}
