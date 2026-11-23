/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * POS Business Helpers:
 * - NaN-safe currency & quantity arithmetic
 * - 3-Day Dairy Product Expiry Alert classifier
 * - 100% Shop-Branded WhatsApp Customer Bill & Khata Reminder link generator
 */

import type { Product, SaleBill, Shop } from '../types/index.ts';
import { getShopPdfIdentity } from './shopPdfBranding.ts';

/**
 * Safely coerces any numeric input to a finite number rounded to 2 decimal places.
 */
export function safeMoney(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num * 100) / 100;
}

/**
 * Safely coerces a quantity value to a non-negative finite number.
 */
export function safeQty(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num * 1000) / 1000;
}

export interface ExpiryAlertItem {
  product: Product;
  expiryDate: string;
  daysRemaining: number;
  status: 'EXPIRED' | 'TODAY' | 'SOON';
}

/**
 * Computes products with stock > 0 whose expiryDate is expired or within `withinDays` (default 3 days).
 */
export function getExpiringProductsWithinDays(
  products: Product[],
  withinDays = 3,
  referenceDate: Date = new Date()
): ExpiryAlertItem[] {
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const alerts: ExpiryAlertItem[] = [];

  for (const p of products) {
    if (!p.isActive || !p.expiryDate || (p.currentStock ?? 0) <= 0) continue;
    const trimmed = p.expiryDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) continue;

    const [y, m, d] = trimmed.split('-').map(Number);
    const expTime = new Date(y, m - 1, d).getTime();
    if (!Number.isFinite(expTime)) continue;

    const daysRemaining = Math.round((expTime - todayStart) / MS_PER_DAY);
    if (daysRemaining <= withinDays) {
      alerts.push({
        product: p,
        expiryDate: trimmed,
        daysRemaining,
        status: daysRemaining < 0 ? 'EXPIRED' : daysRemaining === 0 ? 'TODAY' : 'SOON'
      });
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Normalizes an Indian mobile number to digits-only format for WhatsApp `wa.me` links.
 */
export function normalizeWhatsAppPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length >= 12) return digits;
  return '';
}

/**
 * Builds a 100% shop-branded WhatsApp text message for a customer SaleBill or Khata reminder.
 * Contains ONLY the shop's own identity — zero software names or app URLs.
 */
export function buildWhatsAppBillMessage(shop: Shop, bill: SaleBill): string {
  const identity = getShopPdfIdentity(shop);
  const dateLabel = new Date(bill.timestamp || bill.createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const lines: string[] = [
    `*${identity.displayName}*`,
    ...(identity.addressLine ? [identity.addressLine] : []),
    ...(identity.phoneLine ? [`Phone: ${identity.phoneLine}`] : []),
    '------------------------',
    `Bill No: *${bill.billNumber}*`,
    `Date: ${dateLabel}`,
    ...(bill.customerName ? [`Customer: ${bill.customerName}`] : []),
    '------------------------',
    '*Items:*'
  ];

  for (const item of bill.items || []) {
    const qty = safeQty(item.quantity, 1);
    const rate = safeMoney(item.unitPrice, 0);
    const total = safeMoney(item.total, qty * rate);
    lines.push(`• ${item.productName} (${qty} x Rs.${rate.toFixed(2)}) = Rs.${total.toFixed(2)}`);
  }

  lines.push('------------------------');
  if (safeMoney(bill.discountAmount) > 0) {
    lines.push(`Discount: -Rs.${safeMoney(bill.discountAmount).toFixed(2)}`);
  }
  lines.push(`*Net Total: Rs.${safeMoney(bill.finalAmount).toFixed(2)}*`);
  lines.push(`Payment Mode: ${bill.paymentMode} (${bill.status})`);

  if (bill.paymentMode === 'CREDIT') {
    lines.push('Note: Recorded in Customer Khata Account. Kindly settle at your convenience.');
  }

  lines.push('', 'Thank you for visiting us!');
  return lines.join('\n');
}

/**
 * Builds a ready-to-open `https://wa.me/...` link for a customer bill or Khata reminder.
 */
export function buildWhatsAppBillUrl(shop: Shop, bill: SaleBill, overridePhone?: string): string {
  const phone = normalizeWhatsAppPhone(overridePhone || bill.customerPhone);
  const message = buildWhatsAppBillMessage(shop, bill);
  const encoded = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
