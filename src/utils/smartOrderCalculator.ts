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
import {
  drawShopPdfHeader,
  drawCommercialSignatoryFooter,
  getShopFileSlug,
  getShopPdfIdentity
} from './shopPdfBranding.ts';

export interface CalculateSmartOrderInput {
  products: Product[];
  sales: SaleBill[];
  cycleDays: SmartOrderCycleDays;
  bufferPercent: SmartOrderBufferPercent;
  includeZeroSaleLowStock?: boolean;
  referenceDate?: Date;
}

export function roundMoney3(val: number): number {
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

/**
 * Computes auto-order replenishment suggestions strictly from POS billing history
 * over the selected cycle window (totalSoldQty > 0), with an optional toggle to include
 * 0-sale low-stock items (CurrentStock <= minStockAlert).
 * Only pre-selects items where Recommended Qty (suggestedQty) > 0.
 */
export function calculateSmartOrderSuggestions({
  products,
  sales,
  cycleDays,
  bufferPercent,
  includeZeroSaleLowStock = false,
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

  const suggestions: SmartOrderSuggestion[] = [];

  for (const p of products) {
    if (p.isActive === false) continue;

    const soldById = soldByProductId.get(p.id);
    const totalSoldInCycle =
      soldById !== undefined
        ? soldById
        : p.barcode
        ? soldByBarcode.get(p.barcode) || 0
        : 0;

    const currentStock = Math.max(0, Number(p.currentStock) || 0);
    const rawAlert = p.minStockAlert ?? 5;
    const minStockAlert = Math.max(0, Number.isFinite(Number(rawAlert)) ? Number(rawAlert) : 5);
    const isLowStock = currentStock <= minStockAlert;

    // Strictly include only items with actual sales (totalSoldQty > 0), unless 0-sale low-stock toggle is enabled
    if (totalSoldInCycle <= 0 && !(includeZeroSaleLowStock && isLowStock)) {
      continue;
    }

    const avgDailySales = Math.round((totalSoldInCycle / cycleDays) * 1000) / 1000;
    const suggestedQty = Math.max(
      0,
      Math.ceil(avgDailySales * cycleDays * bufferMultiplier - currentStock)
    );

    // Only pre-select (check) items where Recommended Qty > 0
    const selected = suggestedQty > 0;
    const defaultOrderQty =
      suggestedQty > 0
        ? suggestedQty
        : totalSoldInCycle === 0 && isLowStock
        ? Math.max(1, Math.ceil(minStockAlert - currentStock))
        : 0;

    const purchaseRate = Math.max(0, Number(p.costPrice) || 0);
    const mrp = Math.max(0, Number(p.mrp) || 0);
    const estimatedTotal = roundMoney3(defaultOrderQty * purchaseRate);

    suggestions.push({
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
    });
  }

  // Sort: Recommended Qty > 0 first (descending), then totalSoldInCycle descending, then low stock, then name
  suggestions.sort((a, b) => {
    const aRec = a.suggestedQty > 0 ? 1 : 0;
    const bRec = b.suggestedQty > 0 ? 1 : 0;
    if (bRec !== aRec) return bRec - aRec;
    if (b.suggestedQty !== a.suggestedQty) return b.suggestedQty - a.suggestedQty;
    if (b.totalSoldInCycle !== a.totalSoldInCycle) return b.totalSoldInCycle - a.totalSoldInCycle;
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

  const identity = getShopPdfIdentity(shop);
  const lines: string[] = [
    `*${identity.displayName} — PURCHASE ORDER (ઓર્ડર લિસ્ટ)*`,
    `Shop: ${shop.name}${identity.shopCode ? ` (${identity.shopCode})` : ''}`,
    identity.phoneLine ? `Contact: ${identity.phoneLine}` : '',
    `Supplier / Agency: ${supplierName || 'Authorized Distributor'}`,
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
 * Generates and downloads an authentic commercial A4 Purchase Order PDF issued
 * directly by the shop (100% white-label — zero third-party software branding).
 */
export function downloadSmartOrderPdf(params: {
  shop: Partial<Shop> & Pick<Shop, 'name' | 'shopCode'>;
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

  const identity = getShopPdfIdentity(shop);
  const todayStr = new Date().toISOString().slice(0, 10);
  const poRef = `PO-${todayStr.replace(/-/g, '')}`;
  const cycleText =
    cycleDays === 7 ? 'Weekly (7 Days)' : cycleDays === 15 ? 'Fortnightly (15 Days)' : 'Monthly (30 Days)';

  const drawPageHeader = (pageNum: number): number =>
    drawShopPdfHeader(doc, shop, {
      documentTitle: 'PURCHASE ORDER',
      documentSubtitle: `Ref: ${poRef}`,
      metaRightLines: [
        `Order Date: ${todayStr}`,
        `Cycle: ${cycleText}${bufferPercent > 0 ? ` (+${bufferPercent}%)` : ''}`,
        `Page ${pageNum}`
      ],
      accentRgb: [15, 23, 42]
    });

  let y = drawPageHeader(1);

  // Commercial Supplier & Order Summary Box
  const totalUnits = activeItems.reduce((sum, i) => sum + i.orderQty, 0);
  const grandTotal = activeItems.reduce((sum, i) => sum + i.orderQty * i.purchaseRate, 0);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, 18, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, 182, 18, 2, 2, 'S');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TO SUPPLIER / DISTRIBUTOR:', 18, y + 5.5);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(supplierName || 'Authorized Supplier / Distributor', 18, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issued By: ${identity.displayName}`, 18, y + 15.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Est. Order Value: INR ${grandTotal.toFixed(2)}`, 192, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Items: ${activeItems.length} SKUs  |  Qty: ${Math.round(totalUnits * 1000) / 1000} units`, 192, y + 14, {
    align: 'right'
  });

  y += 23;

  // Commercial Line-Items Table Header
  const drawTableHeader = (topY: number) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(14, topY, 182, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('#', 17, topY + 5.2);
    doc.text('ITEM DESCRIPTION', 25, topY + 5.2);
    doc.text('STOCK', 108, topY + 5.2, { align: 'right' });
    doc.text('AVG/DAY', 126, topY + 5.2, { align: 'right' });
    doc.text('ORDER QTY', 148, topY + 5.2, { align: 'right' });
    doc.text('RATE (INR)', 170, topY + 5.2, { align: 'right' });
    doc.text('AMOUNT (INR)', 193, topY + 5.2, { align: 'right' });
  };

  drawTableHeader(y);
  y += 8;

  let pageNum = 1;
  activeItems.forEach((item, index) => {
    if (y > 258) {
      doc.addPage();
      pageNum += 1;
      y = drawPageHeader(pageNum);
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
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.orderQty} ${item.unit}`, 148, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(item.purchaseRate.toFixed(2), 170, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text((item.orderQty * item.purchaseRate).toFixed(2), 193, y + 5, { align: 'right' });

    y += 7.5;
  });

  // Grand Total Box + Commercial Signatory Lines (kept cleanly on page)
  if (y > 240) {
    doc.addPage();
    pageNum += 1;
    y = drawPageHeader(pageNum);
  }
  y += 4;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(115, y, 81, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ESTIMATED ORDER TOTAL:', 119, y + 7.5);
  doc.text(`INR ${grandTotal.toFixed(2)}`, 192, y + 7.5, { align: 'right' });

  drawCommercialSignatoryFooter(doc, {
    shopName: identity.displayName,
    leftLabel: 'Receiver Signature',
    rightLabel: 'Authorized Signatory',
    noteLine: `Purchase Order issued by ${identity.displayName}  |  Ref: ${poRef}`
  });

  const shopSlug = getShopFileSlug(shop);
  doc.save(`Purchase-Order-${shopSlug}-${todayStr}.pdf`);
}
