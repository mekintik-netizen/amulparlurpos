/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * White-Label Shop PDF & Print Branding Utilities
 *
 * Guarantees that EVERY generated PDF, receipt, voucher, purchase order, and
 * printed report displays ONLY the logged-in shop's own business identity:
 * - Shop Custom Logo (`shop.logoUrl`) ONLY if uploaded by the shop owner
 *   (clean typography with zero placeholder logo when absent)
 * - Bold uppercase Shop Name
 * - Shop Address, Mobile Number, GSTIN, and FSSAI License Number
 *
 * Zero third-party software names, taglines, URLs, or app logos ever appear.
 */

import type { jsPDF } from 'jspdf';
import type { Shop } from '../types/index.ts';

export interface ShopPdfIdentity {
  displayName: string;
  regionalName: string;
  addressLine: string;
  phoneLine: string;
  gstNumber: string;
  fssaiNumber: string;
  shopCode: string;
  logoUrl: string;
}

/**
 * Subtle text-only footer credit placed at the bottom of generated PDFs and receipts
 * for clean brand attribution (ZERO software logo icon/image anywhere on PDFs).
 */
export const PDF_FOOTER_BRAND_CREDIT = 'Generated via ParlourPro POS — Smart Billing & Inventory';
export const RECEIPT_FOOTER_BRAND_CREDIT = 'Generated via ParlourPro POS';

const SOFTWARE_BRANDING_REGEX =
  /(parlour\s*pro(\s*pos)?|smart\s*billing\s*(&|and)\s*inventory|logo-round\.png|logo-banner\.png|https?:\/\/\S*parlourpro\S*)/i;

/**
 * Returns true if a string contains third-party POS software branding text.
 */
export function isSoftwareBrandingText(text?: string | null): boolean {
  if (!text) return false;
  return SOFTWARE_BRANDING_REGEX.test(text);
}

/**
 * Strips third-party software branding strings so cached/legacy settings
 * can never print software names or taglines onto shop documents.
 */
export function stripSoftwareBranding(text?: string | null, fallback = ''): string {
  if (!text) return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (SOFTWARE_BRANDING_REGEX.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

/**
 * Sanitizes a shop's custom logo URL. Returns empty string if unset or if it
 * references any bundled application logo asset.
 */
export function getSafeShopLogoUrl(logoUrl?: string | null): string {
  if (!logoUrl) return '';
  const trimmed = logoUrl.trim();
  if (!trimmed) return '';
  if (/(logo-round\.png|logo-banner\.png|icon-192\.png|icon-512\.png)/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

/**
 * Builds a clean, shop-only identity object for PDFs, receipts, and printouts.
 */
export function getShopPdfIdentity(shop?: Partial<Shop> | null): ShopPdfIdentity {
  const rawName = stripSoftwareBranding(shop?.name, '').trim();
  const displayName = (rawName || 'BUSINESS STORE').toUpperCase();
  const regionalName = stripSoftwareBranding(shop?.regionalName, '').trim();

  const addressParts = [
    shop?.address?.trim(),
    shop?.city?.trim(),
    shop?.state?.trim(),
    shop?.pincode?.trim() ? `- ${shop.pincode.trim()}` : ''
  ].filter(Boolean);
  const addressLine = addressParts.join(', ').replace(', - ', ' - ');

  const phoneLine = shop?.phone?.trim() || '';
  const gstNumber = (shop?.gstNumber || (shop as any)?.gstin || '').trim();
  const fssaiNumber = (shop?.fssaiNumber || '').trim();
  const shopCode = (shop?.shopCode || '').trim();
  const logoUrl = getSafeShopLogoUrl(shop?.logoUrl);

  return {
    displayName,
    regionalName,
    addressLine,
    phoneLine,
    gstNumber,
    fssaiNumber,
    shopCode,
    logoUrl
  };
}

/**
 * Generates a filesystem-safe slug derived purely from the shop's own name/code.
 */
export function getShopFileSlug(shop?: Partial<Shop> | null): string {
  const raw = stripSoftwareBranding(shop?.name, '') || shop?.shopCode || 'Shop';
  const slug = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'Shop';
}

/**
 * Detects jsPDF image format from a data URL or file extension.
 */
function detectPdfImageFormat(src: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (/^data:image\/jpe?g/i.test(src) || /\.jpe?g(\?|$)/i.test(src)) return 'JPEG';
  if (/^data:image\/webp/i.test(src) || /\.webp(\?|$)/i.test(src)) return 'WEBP';
  return 'PNG';
}

export interface DrawShopPdfHeaderOptions {
  documentTitle: string;
  documentSubtitle?: string;
  metaRightLines?: string[];
  accentRgb?: [number, number, number];
}

/**
 * Draws a crisp, commercial white-label shop header at the top of a jsPDF page.
 *
 * - Embeds ONLY `shop.logoUrl` if the shop owner uploaded a custom logo.
 * - Otherwise uses clean left-aligned commercial typography with NO placeholder logo.
 * - Renders ONLY the shop's own name (bold uppercase), address, phone, GST/FSSAI,
 *   plus the document title and right-aligned document metadata.
 * - Returns the Y coordinate (in mm) immediately below the header divider.
 */
export function drawShopPdfHeader(
  doc: jsPDF,
  shop: Partial<Shop> | null | undefined,
  options: DrawShopPdfHeaderOptions
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const accent = options.accentRgb ?? [15, 23, 42]; // Slate-900 commercial charcoal
  const identity = getShopPdfIdentity(shop);

  // Subtle top commercial accent rule
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  let leftTextX = marginX;
  const topY = 10;

  // Render shop custom logo ONLY if uploaded by shop owner
  let logoBottomY = topY;
  if (identity.logoUrl && identity.logoUrl.startsWith('data:image/')) {
    try {
      const format = detectPdfImageFormat(identity.logoUrl);
      doc.addImage(identity.logoUrl, format, marginX, topY, 18, 18);
      leftTextX = marginX + 22;
      logoBottomY = topY + 19;
    } catch {
      // Fallback cleanly to typography-only header without placeholder logo
      leftTextX = marginX;
    }
  }

  // Left side: Shop Identity (Bold uppercase Shop Name + Address + Phone + GST/FSSAI)
  let cursorY = topY + 4.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const maxLeftWidth = pageWidth - leftTextX - 72;
  const shopNameLines = doc.splitTextToSize(identity.displayName, Math.max(60, maxLeftWidth));
  doc.text(shopNameLines, leftTextX, cursorY);
  cursorY += shopNameLines.length * 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  if (identity.addressLine) {
    const addrLines = doc.splitTextToSize(identity.addressLine, Math.max(65, maxLeftWidth));
    doc.text(addrLines, leftTextX, cursorY);
    cursorY += addrLines.length * 3.8;
  }

  const contactBits: string[] = [];
  if (identity.phoneLine) contactBits.push(`Mob: ${identity.phoneLine}`);
  if (identity.shopCode) contactBits.push(`Shop ID: ${identity.shopCode}`);
  if (contactBits.length > 0) {
    doc.text(contactBits.join('  |  '), leftTextX, cursorY);
    cursorY += 3.8;
  }

  const taxBits: string[] = [];
  if (identity.gstNumber) taxBits.push(`GSTIN: ${identity.gstNumber}`);
  if (identity.fssaiNumber) taxBits.push(`FSSAI: ${identity.fssaiNumber}`);
  if (taxBits.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(taxBits.join('  |  '), leftTextX, cursorY);
    cursorY += 4;
  }

  // Right side: Commercial Document Title & Metadata
  let rightY = topY + 4.5;
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(options.documentTitle.toUpperCase(), pageWidth - marginX, rightY, { align: 'right' });
  rightY += 4.8;

  if (options.documentSubtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(options.documentSubtitle, pageWidth - marginX, rightY, { align: 'right' });
    rightY += 4;
  }

  if (options.metaRightLines && options.metaRightLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    for (const line of options.metaRightLines) {
      if (!line) continue;
      doc.text(line, pageWidth - marginX, rightY, { align: 'right' });
      rightY += 3.8;
    }
  }

  const nextY = Math.max(cursorY, rightY, logoBottomY) + 3;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(marginX, nextY, pageWidth - marginX, nextY);

  return nextY + 6;
}

export interface DrawCommercialSignatoryFooterOptions {
  shopName: string;
  leftLabel?: string;
  rightLabel?: string;
  startY?: number;
  noteLine?: string;
}

/**
 * Draws clean commercial signatory lines (Authorized Signatory & Receiver Signature)
 * and a shop-only page footer with zero software branding.
 */
export function drawCommercialSignatoryFooter(
  doc: jsPDF,
  options: DrawCommercialSignatoryFooterOptions
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const sigLineY = options.startY
    ? Math.min(Math.max(options.startY, pageHeight - 36), pageHeight - 22)
    : pageHeight - 24;

  const leftLabel = options.leftLabel || 'Receiver Signature';
  const rightLabel = options.rightLabel || 'Authorized Signatory';

  // Left signature line
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);
  doc.line(marginX, sigLineY, marginX + 62, sigLineY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(leftLabel, marginX + 31, sigLineY + 4.5, { align: 'center' });

  // Right signature line
  doc.line(pageWidth - marginX - 62, sigLineY, pageWidth - marginX, sigLineY);
  doc.text(rightLabel, pageWidth - marginX - 31, sigLineY + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`For ${options.shopName.toUpperCase()}`, pageWidth - marginX - 31, sigLineY + 8.5, {
    align: 'center'
  });

  // Bottom horizontal hairline + shop document note (left) + subtle text-only brand credit (right)
  const footerY = pageHeight - 9;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(marginX, footerY - 3.5, pageWidth - marginX, footerY - 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const leftNote =
    options.noteLine || `Official Commercial Document — ${options.shopName.toUpperCase()}`;
  doc.text(leftNote, marginX, footerY);

  // Subtle gray text-only credit (no logo icon/image)
  doc.setFontSize(7.5);
  doc.setTextColor(120, 132, 148);
  doc.text(PDF_FOOTER_BRAND_CREDIT, pageWidth - marginX, footerY, { align: 'right' });
}
