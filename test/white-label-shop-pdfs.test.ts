/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression Test Suite:
 * 1. Shop Dashboard Header keeps "ParlourPro POS" brand text cleanly alongside Shop Name
 *    with ZERO website logo image (logo-round.png only appears in Master Admin HQ, Splash, Favicon;
 *    logo-banner.png remains on Login screen).
 * 2. Every generated PDF & printed document shows:
 *    - TOP HEADER: 100% individual shop identity ONLY (bold uppercase Shop Name, Address, Phone,
 *      GSTIN, FSSAI, and optional custom shop logo `shop.logoUrl` if uploaded) — ZERO software logo image.
 *    - BOTTOM FOOTER: Subtle text-only attribution credit ("Generated via ParlourPro POS — Smart Billing & Inventory"
 *      or "Generated via ParlourPro POS") with ZERO logo icon/image.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildDynamicPdfFilename,
  formatPdfFilenameDate,
  getShopPdfIdentity,
  getSafeShopLogoUrl,
  getShopFileSlug,
  stripSoftwareBranding,
  isSoftwareBrandingText,
  PDF_FOOTER_BRAND_CREDIT,
  RECEIPT_FOOTER_BRAND_CREDIT
} from '../src/utils/shopPdfBranding.ts';
import { sanitizePrintSettings } from '../src/storage/printSettings.ts';
import { formatSmartOrderWhatsAppText } from '../src/utils/smartOrderCalculator.ts';

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
}

describe('Shop Dashboard Text-Only Branding & Shop-Identity PDFs with Subtle Text Footer Credit', () => {
  const PDF_AND_PRINT_FILES = [
    'src/components/common/BrandedReportHeader.tsx',
    'src/components/reports/ReportsHub.tsx',
    'src/components/reports/SalesProfitAnalytics.tsx',
    'src/components/reports/DailySalesReport.tsx',
    'src/components/reports/DailyStockReport.tsx',
    'src/components/purchases/PurchaseManagement.tsx',
    'src/utils/smartOrderCalculator.ts',
    'src/components/pos/ThermalReceipt.tsx',
    'src/components/expenses/ExpenseManagement.tsx',
    'src/components/banking/BankStatementManagement.tsx'
  ];

  it('1. guarantees ZERO software logo images or software header branding in every PDF and printable template', () => {
    for (const relPath of PDF_AND_PRINT_FILES) {
      const content = readProjectFile(relPath);
      expect(content, `${relPath} must not reference LOGO_ROUND_URL`).not.toContain('LOGO_ROUND_URL');
      expect(content, `${relPath} must not reference LOGO_BANNER_URL`).not.toContain('LOGO_BANNER_URL');
      expect(content, `${relPath} must not reference logo-round.png`).not.toContain('logo-round.png');
      expect(content, `${relPath} must not reference logo-banner.png`).not.toContain('logo-banner.png');
      expect(content, `${relPath} must not prefix exports with ParlourPro_`).not.toContain('ParlourPro_');
    }
  });

  it('2. verifies clean text-only marketing footer appears on every PDF, receipt, and report (NO URL, NO software logo image)', () => {
    expect(PDF_FOOTER_BRAND_CREDIT).toBe('Powered by ParlourPro POS — Smart Billing & Inventory');
    expect(RECEIPT_FOOTER_BRAND_CREDIT).toBe('Powered by ParlourPro POS');
    expect(PDF_FOOTER_BRAND_CREDIT).not.toMatch(/https?:\/\/|github\.io/i);
    expect(RECEIPT_FOOTER_BRAND_CREDIT).not.toMatch(/https?:\/\/|github\.io/i);

    const shopPdfBrandingSrc = readProjectFile('src/utils/shopPdfBranding.ts');
    expect(shopPdfBrandingSrc).toContain('doc.text(PDF_FOOTER_BRAND_CREDIT');

    // jsPDF documents using drawCommercialSignatoryFooter
    expect(readProjectFile('src/utils/smartOrderCalculator.ts')).toContain('drawCommercialSignatoryFooter');
    expect(readProjectFile('src/components/reports/SalesProfitAnalytics.tsx')).toContain('drawCommercialSignatoryFooter');
    expect(readProjectFile('src/components/purchases/PurchaseManagement.tsx')).toContain('drawCommercialSignatoryFooter');

    // React/HTML printable templates with subtle text-only footer credit
    expect(readProjectFile('src/components/purchases/PurchaseManagement.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/reports/ReportsHub.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/reports/DailySalesReport.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/reports/DailyStockReport.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/expenses/ExpenseManagement.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/banking/BankStatementManagement.tsx')).toContain('PDF_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/pos/ThermalReceipt.tsx')).toContain('RECEIPT_FOOTER_BRAND_CREDIT');
    expect(readProjectFile('src/components/profile/ShopProfileManagement.tsx')).toContain('RECEIPT_FOOTER_BRAND_CREDIT');
  });

  it('3. verifies Shop Dashboard Header hides logo image while keeping ParlourPro POS text alongside Shop Name, and preserves logos on Login, Splash, Favicon, and Admin HQ', () => {
    const headerSrc = readProjectFile('src/components/layout/Header.tsx');
    // Logo image in Header is strictly gated behind Master Admin HQ (`{isAdmin && (`)
    expect(headerSrc).toMatch(/\{isAdmin\s*&&\s*\(\s*<div[^>]*>\s*<img[\s\S]*?src=\{LOGO_ROUND_URL\}/);
    // ParlourPro POS text stays visible in Header alongside logged-in shop name
    expect(headerSrc).toContain('<span>ParlourPro</span>');
    expect(headerSrc).toContain('<span className="text-amber-300">POS</span>');
    expect(headerSrc).toContain("!isAdmin && currentShop?.name ? currentShop.name : 'Smart Billing & Inventory'");

    // Sidebar has no website logo image
    const sidebarSrc = readProjectFile('src/components/layout/RightSideNavigation.tsx');
    expect(sidebarSrc).not.toContain('LOGO_ROUND_URL');
    expect(sidebarSrc).not.toContain('LOGO_BANNER_URL');

    // Login keeps logo-banner.png
    const loginSrc = readProjectFile('src/components/auth/LoginPage.tsx');
    expect(loginSrc).toContain('LOGO_BANNER_URL');

    // Opening Splash Screen, Browser Favicon, and Master Admin HQ keep logo-round.png
    const splashSrc = readProjectFile('src/components/common/AmulLaunchAnimation.tsx');
    expect(splashSrc).toContain('LOGO_ROUND_URL');
    const indexHtml = readProjectFile('index.html');
    expect(indexHtml).toContain('logo-round.png');
    const adminPortalSrc = readProjectFile('src/components/admin/AdminPortal.tsx');
    expect(adminPortalSrc).toContain("import amulLogo from '../../assets/logo.ts'");
  });

  it('4. builds clean shop-only PDF identity with uppercase name, address, phone, GST, FSSAI, and optional custom logo', () => {
    const identityWithoutLogo = getShopPdfIdentity({
      name: 'Shreenathji Parlour',
      regionalName: 'શ્રીનાથજી પાર્લર',
      address: 'Shop 5, Station Road',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      phone: '+91 98250 11223',
      gstNumber: '24ABCDE1234F1Z5',
      fssaiNumber: '10722001000999',
      shopCode: 'SH-101'
    });

    expect(identityWithoutLogo.displayName).toBe('SHREENATHJI PARLOUR');
    expect(identityWithoutLogo.addressLine).toBe('Shop 5, Station Road, Anand, Gujarat - 388001');
    expect(identityWithoutLogo.phoneLine).toBe('+91 98250 11223');
    expect(identityWithoutLogo.gstNumber).toBe('24ABCDE1234F1Z5');
    expect(identityWithoutLogo.fssaiNumber).toBe('10722001000999');
    expect(identityWithoutLogo.logoUrl).toBe(''); // Clean typography, no placeholder logo

    const customLogoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
    const identityWithLogo = getShopPdfIdentity({
      name: 'Shreenathji Parlour',
      logoUrl: customLogoDataUrl
    });
    expect(identityWithLogo.logoUrl).toBe(customLogoDataUrl);

    // Reject bundled app logo assets even if accidentally passed
    expect(getSafeShopLogoUrl('./logo-round.png')).toBe('');
    expect(getSafeShopLogoUrl('/logo-banner.png')).toBe('');
    expect(getShopFileSlug({ name: 'Shreenathji Parlour', shopCode: 'SH-101' })).toBe('Shreenathji_Parlour');
  });

  it('5. strips legacy/cached software branding strings and github.io URLs from receipt header settings', () => {
    expect(isSoftwareBrandingText('PARLOURPRO POS')).toBe(true);
    expect(isSoftwareBrandingText('Smart Billing & Inventory • ParlourPro POS')).toBe(true);
    expect(isSoftwareBrandingText('https://mekintik-netizen.github.io/amulparlurpos/')).toBe(true);
    expect(stripSoftwareBranding('PARLOURPRO POS', '')).toBe('');
    expect(stripSoftwareBranding('https://mekintik-netizen.github.io/amulparlurpos/', '')).toBe('');
    expect(stripSoftwareBranding('SHREENATHJI PARLOUR', '')).toBe('SHREENATHJI PARLOUR');

    const sanitized = sanitizePrintSettings({
      headerTitle: 'PARLOURPRO POS',
      footerNote2: 'Smart Billing & Inventory • ParlourPro POS'
    });
    expect(sanitized.headerTitle).toBe('');
    expect(sanitized.footerNote2).toBe('We value your business!');
  });

  it('6. verifies Purchase Orders and Purchase Vouchers include commercial signatory lines and shop-issued headers', () => {
    const smartOrderSrc = readProjectFile('src/utils/smartOrderCalculator.ts');
    expect(smartOrderSrc).toContain('drawShopPdfHeader');
    expect(smartOrderSrc).toContain("leftLabel: 'Receiver Signature'");
    expect(smartOrderSrc).toContain("rightLabel: 'Authorized Signatory'");

    const purchaseSrc = readProjectFile('src/components/purchases/PurchaseManagement.tsx');
    expect(purchaseSrc).toContain('PURCHASE VOUCHER');
    expect(purchaseSrc).toContain('Receiver Signature');
    expect(purchaseSrc).toContain('Authorized Signatory');

    const waText = formatSmartOrderWhatsAppText({
      shop: { name: 'Shreenathji Parlour', shopCode: 'SH-101', phone: '9825011223' },
      supplierName: 'Anand Dairy Distributors',
      cycleDays: 7,
      bufferPercent: 10,
      items: [
        {
          product: {
            id: 'p1',
            shopId: 'shop-1',
            sku: 'AMUL-GOLD-500',
            name: 'Amul Gold 500ml',
            barcode: '8901262010014',
            category: 'Milk',
            unit: 'Pouch',
            mrp: 33,
            sellingPrice: 33,
            costPrice: 30,
            currentStock: 5,
            minStockAlert: 10,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          productId: 'p1',
          productName: 'Amul Gold 500ml',
          barcode: '8901262010014',
          category: 'Milk',
          unit: 'Pouch',
          currentStock: 5,
          minStockAlert: 10,
          totalSoldInCycle: 70,
          avgDailySales: 10,
          suggestedQty: 72,
          orderQty: 72,
          purchaseRate: 30,
          mrp: 33,
          estimatedTotal: 2160,
          isLowStock: true,
          selected: true
        }
      ]
    });
    expect(waText).toContain('SHREENATHJI PARLOUR — PURCHASE ORDER');
    expect(waText).not.toMatch(/ParlourPro/i);
  });

  it('7. permanently suppresses browser print URL headers/footers via @page { margin: 0 } and enforces direct client-side jsPDF downloads everywhere', () => {
    const indexCss = readProjectFile('src/index.css');
    expect(indexCss).toMatch(/@page\s*\{[^}]*size:\s*A4;[^}]*margin:\s*0\s*!important;/);
    expect(indexCss).not.toMatch(/margin:\s*10mm/);
    expect(indexCss).toContain('padding: 12mm !important;');

    const purchaseSrc = readProjectFile('src/components/purchases/PurchaseManagement.tsx');
    expect(purchaseSrc).toMatch(/@page\s*\{[^}]*margin:\s*0\s*!important;/);
    expect(purchaseSrc).not.toMatch(/margin:\s*10mm/);
    expect(purchaseSrc).toContain('padding: 12mm !important;');

    // Never render github.io URL or window.location inside ANY PDF/print template
    for (const relPath of PDF_AND_PRINT_FILES) {
      const content = readProjectFile(relPath);
      expect(content, `${relPath} must never contain github.io URL`).not.toMatch(/github\.io/i);
      expect(content, `${relPath} must never render window.location`).not.toContain('window.location');
    }

    // All major reports and receipts support direct client-side jsPDF downloads
    expect(readProjectFile('src/components/reports/ReportsHub.tsx')).toContain('downloadShopTablePdf');
    expect(readProjectFile('src/components/reports/DailySalesReport.tsx')).toContain('downloadShopTablePdf');
    expect(readProjectFile('src/components/reports/DailyStockReport.tsx')).toContain('downloadShopTablePdf');
    expect(readProjectFile('src/components/expenses/ExpenseManagement.tsx')).toContain('downloadShopTablePdf');
    expect(readProjectFile('src/components/banking/BankStatementManagement.tsx')).toContain('downloadShopTablePdf');
    expect(readProjectFile('src/components/pos/ThermalReceipt.tsx')).toContain('downloadThermalReceiptPdf');
    expect(readProjectFile('src/components/purchases/PurchaseManagement.tsx')).toContain('new jsPDF');
    expect(readProjectFile('src/components/reports/SalesProfitAnalytics.tsx')).toContain('new jsPDF');
    expect(readProjectFile('src/utils/smartOrderCalculator.ts')).toContain('new jsPDF');
  });

  it('8. hides all dashboard trial banners, offline alerts, and greeting modals from print via .no-print and [data-trial-banner]', () => {
    const trialBannerSrc = readProjectFile('src/components/common/SubscriptionRenewalReminderBanner.tsx');
    expect(trialBannerSrc).toContain('no-print');
    expect(trialBannerSrc).toContain('data-trial-banner');

    const offlineBannerSrc = readProjectFile('src/components/common/OfflineAlertBanner.tsx');
    expect(offlineBannerSrc).toContain('no-print');

    const greetingModalSrc = readProjectFile('src/components/common/MorningGreetingModal.tsx');
    expect(greetingModalSrc).toContain('no-print');

    const expenseSrc = readProjectFile('src/components/expenses/ExpenseManagement.tsx');
    expect(expenseSrc).toContain('data-trial-banner');

    const indexCss = readProjectFile('src/index.css');
    expect(indexCss).toContain('[data-trial-banner]');
    expect(indexCss).toContain('#unified-print-area');
    expect(indexCss).toContain('display: table-header-group !important;');
    expect(indexCss).toContain('break-inside: avoid !important;');
    expect(indexCss).toContain('.unified-kpi-grid');
    expect(indexCss).toContain('.unified-report-table');
    expect(indexCss).toContain('.print-nowrap');
    expect(indexCss).toContain('.unified-print-footer');
  });

  it('9. generates descriptive, dynamic PDF filenames (DD-MM-YYYY) for every report, bill, receipt, and statement', () => {
    const sampleDate = '2026-11-21';
    expect(formatPdfFilenameDate(sampleDate)).toBe('21-11-2026');

    expect(
      buildDynamicPdfFilename({ kind: 'PURCHASE_BILL', billNumber: 'INV-105', date: sampleDate })
    ).toBe('Purchase-Bill-INV-105-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'SALE_BILL', billNumber: 'BILL-001', date: sampleDate })
    ).toBe('Sale-Bill-BILL-001-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'SMART_ORDER', date: sampleDate })
    ).toBe('Smart-Order-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'DAILY_SALES', date: sampleDate })
    ).toBe('Daily-Sales-Report-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'STOCK_AUDIT', date: sampleDate })
    ).toBe('Stock-Audit-Report-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'EXPENSES', date: sampleDate })
    ).toBe('Expenses-Report-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'KHATA', partyName: 'Ramesh Patel', date: sampleDate })
    ).toBe('Khata-Statement-Ramesh-Patel-21-11-2026.pdf');

    expect(
      buildDynamicPdfFilename({ kind: 'DAY_CLOSE', date: sampleDate })
    ).toBe('Day-Close-Report-21-11-2026.pdf');
  });

  it('10. wires printWithDynamicTitle and buildDynamicPdfFilename into every printable view so document.title never saves as generic app title', () => {
    const PRINTABLE_VIEWS = [
      'src/components/purchases/PurchaseManagement.tsx',
      'src/components/pos/ThermalReceipt.tsx',
      'src/components/reports/ReportsHub.tsx',
      'src/components/reports/DailySalesReport.tsx',
      'src/components/reports/DailyStockReport.tsx',
      'src/components/expenses/ExpenseManagement.tsx',
      'src/components/banking/BankStatementManagement.tsx',
      'src/components/profile/ShopProfileManagement.tsx'
    ];

    for (const relPath of PRINTABLE_VIEWS) {
      const content = readProjectFile(relPath);
      expect(content, `${relPath} must use printWithDynamicTitle`).toContain('printWithDynamicTitle');
      expect(content, `${relPath} must use buildDynamicPdfFilename`).toContain('buildDynamicPdfFilename');
      expect(content, `${relPath} must not call bare window.print()`).not.toMatch(/\bwindow\.print\s*\(/);
    }
  });
});
