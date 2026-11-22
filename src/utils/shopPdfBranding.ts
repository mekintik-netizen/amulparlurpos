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

import { jsPDF } from 'jspdf';
import type { PrintSettingsConfig, SaleBill, Shop } from '../types/index.ts';

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
 * Clean text-only marketing footer placed at the bottom of generated PDFs and receipts
 * (ZERO URLs and ZERO software logo icon/image anywhere on PDFs).
 */
export const PDF_FOOTER_BRAND_CREDIT = 'Powered by ParlourPro POS — Smart Billing & Inventory';
export const RECEIPT_FOOTER_BRAND_CREDIT = 'Powered by ParlourPro POS';

const SOFTWARE_BRANDING_REGEX =
  /(parlour\s*pro(\s*pos)?|smart\s*billing\s*(&|and)\s*inventory|logo-round\.png|logo-banner\.png|https?:\/\/\S*parlourpro\S*|https?:\/\/\S*github\.io\S*)/i;

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

export const DEFAULT_DOCUMENT_TITLE = 'ParlourPro POS — Smart Billing & Inventory';

/**
 * Formats a date input (YYYY-MM-DD, ISO string, or Date) into crisp DD-MM-YYYY
 * for human-readable dynamic PDF filenames (e.g. 21-11-2026).
 */
export function formatPdfFilenameDate(dateInput?: string | Date | null): string {
  let d: Date;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
    const [yyyy, mm, dd] = dateInput.trim().slice(0, 10).split('-');
    return `${dd}-${mm}-${yyyy}`;
  } else if (typeof dateInput === 'string' && dateInput.trim()) {
    const parsed = new Date(dateInput);
    d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    d = new Date();
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function sanitizeFilenameToken(raw: string | undefined | null, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

export type DynamicPdfDocumentKind =
  | 'PURCHASE_BILL'
  | 'SALE_BILL'
  | 'SMART_ORDER'
  | 'DAILY_SALES'
  | 'STOCK_AUDIT'
  | 'EXPENSES'
  | 'KHATA'
  | 'DAY_CLOSE'
  | 'CUSTOM_REPORT';

export interface BuildDynamicPdfFilenameOptions {
  kind: DynamicPdfDocumentKind;
  date?: string | Date;
  billNumber?: string;
  partyName?: string;
  reportName?: string;
}

/**
 * Builds standardized, descriptive PDF filenames (never generic software titles):
 * - Purchase-Bill-{billNo}-{DD-MM-YYYY}.pdf
 * - Sale-Bill-{billNo}-{DD-MM-YYYY}.pdf
 * - Smart-Order-{DD-MM-YYYY}.pdf
 * - Daily-Sales-Report-{DD-MM-YYYY}.pdf
 * - Stock-Audit-Report-{DD-MM-YYYY}.pdf
 * - Expenses-Report-{DD-MM-YYYY}.pdf
 * - Khata-Statement-{customerOrAll}-{DD-MM-YYYY}.pdf
 * - Day-Close-Report-{DD-MM-YYYY}.pdf
 */
export function buildDynamicPdfFilename(options: BuildDynamicPdfFilenameOptions): string {
  const dateStr = formatPdfFilenameDate(options.date);
  switch (options.kind) {
    case 'PURCHASE_BILL': {
      const billNo = sanitizeFilenameToken(options.billNumber, 'BILL');
      return `Purchase-Bill-${billNo}-${dateStr}.pdf`;
    }
    case 'SALE_BILL': {
      const billNo = sanitizeFilenameToken(options.billNumber, 'BILL');
      return `Sale-Bill-${billNo}-${dateStr}.pdf`;
    }
    case 'SMART_ORDER':
      return `Smart-Order-${dateStr}.pdf`;
    case 'DAILY_SALES':
      return `Daily-Sales-Report-${dateStr}.pdf`;
    case 'STOCK_AUDIT':
      return `Stock-Audit-Report-${dateStr}.pdf`;
    case 'EXPENSES':
      return `Expenses-Report-${dateStr}.pdf`;
    case 'KHATA': {
      const party = sanitizeFilenameToken(options.partyName, 'All');
      return `Khata-Statement-${party}-${dateStr}.pdf`;
    }
    case 'DAY_CLOSE':
      return `Day-Close-Report-${dateStr}.pdf`;
    case 'CUSTOM_REPORT':
    default: {
      const name = sanitizeFilenameToken(options.reportName, 'Report');
      return `${name}-${dateStr}.pdf`;
    }
  }
}

/**
 * Temporarily updates `document.title` to the descriptive PDF filename (without `.pdf`)
 * before calling `window.print()`, and restores the default title immediately on `afterprint`
 * (with a safe fallback timer for browsers that omit `afterprint`).
 */
export function printWithDynamicTitle(filenameOrTitle: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const previousTitle = document.title || DEFAULT_DOCUMENT_TITLE;
  const cleanTitle = filenameOrTitle.replace(/\.pdf$/i, '').trim() || DEFAULT_DOCUMENT_TITLE;

  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle || DEFAULT_DOCUMENT_TITLE;
    window.removeEventListener('afterprint', restoreTitle);
  };

  document.title = cleanTitle;
  window.addEventListener('afterprint', restoreTitle, { once: true });

  try {
    window.print();
  } finally {
    // Fallback restore in case print dialog is dismissed without firing afterprint
    window.setTimeout(restoreTitle, 1500);
  }
}

/**
 * Detects jsPDF image format from a data URL or file extension.
 */
function detectPdfImageFormat(src: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (/^data:image\/jpe?g/i.test(src) || /\.jpe?g(\?|$)/i.test(src)) return 'JPEG';
  if (/^data:image\/webp/i.test(src) || /\.webp(\?|$)/i.test(src)) return 'WEBP';
  return 'PNG';
}

/**
 * Normalizes INR currency strings for standard Helvetica jsPDF fonts (avoids missing ₹ glyph).
 */
function sanitizePdfText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/₹/g, 'INR ')
    .replace(/[•·]/g, '|')
    .replace(/—/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
 * and a clean text-only marketing footer with ZERO URLs and ZERO software logo images.
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

  // Bottom horizontal hairline + shop document note (left) + clean text-only footer (right)
  const footerY = pageHeight - 9;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(marginX, footerY - 3.5, pageWidth - marginX, footerY - 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const leftNote =
    options.noteLine || `Official Commercial Document — ${options.shopName.toUpperCase()}`;
  doc.text(sanitizePdfText(leftNote), marginX, footerY);

  // Subtle gray text-only credit (NO URL, NO logo icon/image)
  doc.setFontSize(7.5);
  doc.setTextColor(120, 132, 148);
  doc.text(PDF_FOOTER_BRAND_CREDIT, pageWidth - marginX, footerY, { align: 'right' });
}

export interface ShopPdfTableColumn {
  label: string;
  width: number; // Relative weight or mm width (normalized automatically to printable 182mm width)
  align?: 'left' | 'right' | 'center';
}

export interface ShopPdfKpiItem {
  label: string;
  value: string;
}

export interface DownloadShopTablePdfOptions {
  shop: Partial<Shop> | null | undefined;
  documentTitle: string;
  documentSubtitle?: string;
  metaRightLines?: string[];
  accentRgb?: [number, number, number];
  kpis?: ShopPdfKpiItem[];
  columns: ShopPdfTableColumn[];
  rows: (string | number)[][];
  emptyMessage?: string;
  leftSignatoryLabel?: string;
  rightSignatoryLabel?: string;
  footerNote?: string;
  filename: string;
}

/**
 * Generates and downloads an A4 commercial PDF report directly in-memory using jsPDF.
 * Completely bypasses window.print() so browser URLs, dates, or page titles can NEVER appear.
 */
export function downloadShopTablePdf(options: DownloadShopTablePdfOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm
  const shopIdentity = getShopPdfIdentity(options.shop);

  let y = drawShopPdfHeader(doc, options.shop, {
    documentTitle: options.documentTitle,
    documentSubtitle: options.documentSubtitle,
    metaRightLines: options.metaRightLines,
    accentRgb: options.accentRgb
  });

  // Optional KPI Summary Cards Row
  if (options.kpis && options.kpis.length > 0) {
    const gap = 3;
    const count = Math.min(options.kpis.length, 5);
    const cardW = (contentWidth - gap * (count - 1)) / count;
    const cardH = 14;

    options.kpis.slice(0, count).forEach((kpi, idx) => {
      const cardX = marginX + idx * (cardW + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.roundedRect(cardX, y, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(kpi.label).toUpperCase().slice(0, 24), cardX + 2.5, y + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(kpi.value).slice(0, 22), cardX + 2.5, y + 11.2);
    });
    y += cardH + 6;
  }

  // Normalize column widths to fit contentWidth (182mm)
  const totalWeight = options.columns.reduce((sum, c) => sum + c.width, 0) || 1;
  const colWidths = options.columns.map((c) => (c.width / totalWeight) * contentWidth);
  const colStarts: number[] = [];
  let runningX = marginX;
  for (const w of colWidths) {
    colStarts.push(runningX);
    runningX += w;
  }

  const drawTableHeader = (headerY: number): number => {
    doc.setFillColor(15, 23, 42);
    doc.rect(marginX, headerY, contentWidth, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    options.columns.forEach((col, i) => {
      const align = col.align || 'left';
      const pad = 2;
      const textX =
        align === 'right'
          ? colStarts[i] + colWidths[i] - pad
          : align === 'center'
          ? colStarts[i] + colWidths[i] / 2
          : colStarts[i] + pad;
      doc.text(sanitizePdfText(col.label).toUpperCase(), textX, headerY + 5, { align });
    });
    return headerY + 7.5;
  };

  y = drawTableHeader(y);

  const bottomSafeY = pageHeight - 40;
  if (options.rows.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, y, contentWidth, 10, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      sanitizePdfText(options.emptyMessage || 'No records found for this period.'),
      pageWidth / 2,
      y + 6.5,
      { align: 'center' }
    );
    y += 12;
  } else {
    options.rows.forEach((row, rowIdx) => {
      if (y > bottomSafeY) {
        // Draw page footer before adding continuation page
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 132, 148);
        doc.text(PDF_FOOTER_BRAND_CREDIT, pageWidth - marginX, pageHeight - 9, { align: 'right' });

        doc.addPage();
        y = drawShopPdfHeader(doc, options.shop, {
          documentTitle: `${options.documentTitle} (CONT.)`,
          metaRightLines: options.metaRightLines,
          accentRgb: options.accentRgb
        });
        y = drawTableHeader(y);
      }

      const rowH = 6.8;
      if (rowIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);

      options.columns.forEach((col, i) => {
        const align = col.align || 'left';
        const pad = 2;
        const maxTextW = Math.max(8, colWidths[i] - pad * 2);
        const rawCell = sanitizePdfText(row[i] ?? '');
        const fitted = doc.splitTextToSize(rawCell, maxTextW)[0] || '';
        const textX =
          align === 'right'
            ? colStarts[i] + colWidths[i] - pad
            : align === 'center'
            ? colStarts[i] + colWidths[i] / 2
            : colStarts[i] + pad;
        if (align === 'right') {
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFont('helvetica', 'normal');
        }
        doc.text(fitted, textX, y + 4.7, { align });
      });

      y += rowH;
    });
  }

  drawCommercialSignatoryFooter(doc, {
    shopName: shopIdentity.displayName,
    leftLabel: options.leftSignatoryLabel || 'Prepared By',
    rightLabel: options.rightSignatoryLabel || 'Authorized Signatory',
    noteLine: options.footerNote || `${options.documentTitle} — ${shopIdentity.displayName}`
  });

  doc.save(options.filename);
}

/**
 * Generates and saves a crisp client-side PDF customer receipt directly in-memory via jsPDF.
 * Eliminates browser print URL headers/footers completely while preserving shop-only identity.
 */
export function downloadThermalReceiptPdf(
  shop: Partial<Shop> | null | undefined,
  bill: SaleBill,
  printConfig?: Partial<PrintSettingsConfig>
): void {
  const identity = getShopPdfIdentity(shop);
  const effectiveShopName = stripSoftwareBranding(printConfig?.customShopName, '') || identity.displayName;
  const effectiveAddress = printConfig?.customAddress || identity.addressLine;
  const effectivePhone = printConfig?.customPhone || identity.phoneLine;
  const effectiveGst = printConfig?.customGst || identity.gstNumber;
  const effectiveFssai = printConfig?.customFssai || identity.fssaiNumber;

  const estimatedHeight = Math.max(135, 92 + bill.items.length * 10);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, estimatedHeight] });
  const w = 80;
  const marginX = 5;
  let y = 7;

  // Optional custom shop logo ONLY if uploaded
  if (identity.logoUrl && identity.logoUrl.startsWith('data:image/')) {
    try {
      const fmt = detectPdfImageFormat(identity.logoUrl);
      doc.addImage(identity.logoUrl, fmt, (w - 14) / 2, y, 14, 14);
      y += 17;
    } catch {
      // Ignore invalid image cleanly
    }
  }

  // Shop Identity Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  const nameLines = doc.splitTextToSize(sanitizePdfText(effectiveShopName).toUpperCase(), w - marginX * 2);
  doc.text(nameLines, w / 2, y, { align: 'center' });
  y += nameLines.length * 4.2;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  if (effectiveAddress) {
    const addrLines = doc.splitTextToSize(sanitizePdfText(effectiveAddress), w - marginX * 2);
    doc.text(addrLines, w / 2, y, { align: 'center' });
    y += addrLines.length * 3.3;
  }
  if (effectivePhone) {
    doc.text(sanitizePdfText(`Phone: ${effectivePhone}`), w / 2, y, { align: 'center' });
    y += 3.3;
  }
  if (effectiveGst) {
    doc.text(sanitizePdfText(`GSTIN: ${effectiveGst}`), w / 2, y, { align: 'center' });
    y += 3.3;
  }
  if (effectiveFssai) {
    doc.text(sanitizePdfText(`FSSAI: ${effectiveFssai}`), w / 2, y, { align: 'center' });
    y += 3.3;
  }

  const drawDashedLine = () => {
    doc.setDrawColor(40, 40, 40);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marginX, y, w - marginX, y);
    doc.setLineDashPattern([], 0);
    y += 3.5;
  };

  y += 1;
  drawDashedLine();

  // Bill Metadata
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(sanitizePdfText(`Bill: ${bill.billNumber}`), marginX, y);
  doc.text(sanitizePdfText(bill.paymentMode), w - marginX, y, { align: 'right' });
  y += 3.6;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  const dateStr = new Date(bill.timestamp).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  doc.text(sanitizePdfText(`Date: ${dateStr}`), marginX, y);
  y += 3.4;
  if (bill.customerName) {
    doc.text(sanitizePdfText(`Customer: ${bill.customerName}`), marginX, y);
    y += 3.4;
  }
  drawDashedLine();

  // Items Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.text('ITEM', marginX, y);
  doc.text('QTY', 47, y, { align: 'right' });
  doc.text('RATE', 60, y, { align: 'right' });
  doc.text('AMT', w - marginX, y, { align: 'right' });
  y += 3.5;
  drawDashedLine();

  // Items Rows
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  for (const item of bill.items) {
    const prodName = sanitizePdfText(item.productName).slice(0, 22);
    doc.text(prodName, marginX, y);
    doc.text(String(item.quantity), 47, y, { align: 'right' });
    doc.text(item.unitPrice.toFixed(1), 60, y, { align: 'right' });
    doc.setFont('courier', 'bold');
    doc.text(item.total.toFixed(2), w - marginX, y, { align: 'right' });
    doc.setFont('courier', 'normal');
    y += 4.2;
  }

  drawDashedLine();

  // Totals
  doc.setFontSize(8);
  doc.text('Subtotal:', marginX, y);
  doc.text(`Rs.${bill.subtotal.toFixed(2)}`, w - marginX, y, { align: 'right' });
  y += 3.8;

  if (bill.discountAmount > 0) {
    doc.text('Discount:', marginX, y);
    doc.text(`-Rs.${bill.discountAmount.toFixed(2)}`, w - marginX, y, { align: 'right' });
    y += 3.8;
  }
  if (bill.taxAmount > 0) {
    doc.text('GST (Inclusive):', marginX, y);
    doc.text(`Rs.${bill.taxAmount.toFixed(2)}`, w - marginX, y, { align: 'right' });
    y += 3.8;
  }

  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.text('NET PAYABLE:', marginX, y + 1);
  doc.text(`Rs.${bill.finalAmount.toFixed(2)}`, w - marginX, y + 1, { align: 'right' });
  y += 5.5;
  drawDashedLine();

  // Notes & Clean Text-Only Credit (ZERO URLs, ZERO software logo)
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  const note1 = stripSoftwareBranding(printConfig?.footerNote1, 'Thank you! Visit Again.');
  if (note1) {
    doc.text(sanitizePdfText(note1), w / 2, y, { align: 'center' });
    y += 3.5;
  }
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text(RECEIPT_FOOTER_BRAND_CREDIT, w / 2, y + 1, { align: 'center' });

  doc.save(
    buildDynamicPdfFilename({
      kind: 'SALE_BILL',
      billNumber: bill.billNumber,
      date: bill.timestamp
    })
  );
}

