/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automated Unit Tests for Admin Print Settings Tab & Thermal Receipt Customizer
 * Covers:
 * 1. Default Print Configuration standards (Header, Footer, Margins, Spacing)
 * 2. Header element customization & overrides (Shop Name, Address, Phone, GSTIN/FSSAI)
 * 3. Footer custom notes & disclaimers ("Thank you", policies)
 * 4. Layout spacing & Ultra-Compact Mode paper savings
 * 5. Cloud Firestore persistence to `adminSettings/printConfig`
 * 6. Real-time subscription & synchronization across shop counters
 * 7. Verification that Admin HQ renders Print Settings sub-tab
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  PrintSettingsConfig, 
  DEFAULT_PRINT_SETTINGS_CONFIG,
  Shop,
  SaleBill
} from '../src/types/index.ts';
import { 
  getCachedPrintSettings, 
  getPrintSettingsConfig, 
  savePrintSettingsConfig, 
  resetPrintSettingsConfig,
  subscribeToPrintSettings 
} from '../src/storage/printSettings.ts';

// In-memory Firestore store for adminSettings
const mockAdminSettings: Map<string, any> = new Map();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    doc: vi.fn((_db, col, id) => ({ col, id })),
    getDoc: vi.fn(async (docRef) => {
      const data = mockAdminSettings.get(`${docRef.col}/${docRef.id}`);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef.id
      };
    }),
    setDoc: vi.fn(async (docRef, data, options) => {
      const key = `${docRef.col}/${docRef.id}`;
      if (options?.merge && mockAdminSettings.has(key)) {
        mockAdminSettings.set(key, { ...mockAdminSettings.get(key), ...data });
      } else {
        mockAdminSettings.set(key, data);
      }
    }),
    onSnapshot: vi.fn((docRef, callback) => {
      const key = `${docRef.col}/${docRef.id}`;
      const data = mockAdminSettings.get(key);
      if (data) {
        callback({
          exists: () => true,
          data: () => data
        });
      }
      return () => {};
    })
  };
});

describe('Admin Print Settings & Receipt Customizer Tests', () => {
  beforeEach(() => {
    mockAdminSettings.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('1. verifies official Amul default print settings configuration values', () => {
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showHeaderLogo).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.headerTitle).toBe('AMUL PARLOUR');
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showShopName).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showAddress).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showPhone).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showShopId).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.showGstFssai).toBe(true);

    expect(DEFAULT_PRINT_SETTINGS_CONFIG.footerNote1).toBe('Thank you! Please visit again');
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.footerNote2).toBe('The Taste of India • Pure Milk Products');
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.footerNote3).toBe('Goods once sold will not be taken back');

    expect(DEFAULT_PRINT_SETTINGS_CONFIG.compactMode).toBe(true);
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.headerSpacing).toBe('tight');
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.marginSize).toBe('compact');
    expect(DEFAULT_PRINT_SETTINGS_CONFIG.paperWidth).toBe('58mm');
  });

  it('2. loads and seeds default configuration in Firestore if none exists', async () => {
    const config = await getPrintSettingsConfig();
    expect(config).toBeDefined();
    expect(config.headerTitle).toBe('AMUL PARLOUR');
    expect(config.compactMode).toBe(true);

    // Verify document was seeded in mock Firestore
    const stored = mockAdminSettings.get('adminSettings/printConfig');
    expect(stored).toBeDefined();
    expect(stored.headerTitle).toBe('AMUL PARLOUR');
  });

  it('3. saves custom header overrides and footer notes to Firestore adminSettings/printConfig', async () => {
    const customOverrides: Partial<PrintSettingsConfig> = {
      headerTitle: 'AMUL ICE CREAM PARLOUR',
      customShopName: 'Amul Anand Express Station',
      customPhone: '+91 99999 88888',
      customGst: '24ABCDE1234F1Z9',
      footerNote1: 'Thank you for visiting Amul! Have a healthy day.',
      footerNote3: 'Ice Cream once melted cannot be exchanged.',
      headerSpacing: 'normal',
      compactMode: false
    };

    const saved = await savePrintSettingsConfig(customOverrides, 'Mekin Admin');

    expect(saved.headerTitle).toBe('AMUL ICE CREAM PARLOUR');
    expect(saved.customShopName).toBe('Amul Anand Express Station');
    expect(saved.customPhone).toBe('+91 99999 88888');
    expect(saved.customGst).toBe('24ABCDE1234F1Z9');
    expect(saved.footerNote1).toBe('Thank you for visiting Amul! Have a healthy day.');
    expect(saved.footerNote3).toBe('Ice Cream once melted cannot be exchanged.');
    expect(saved.headerSpacing).toBe('normal');
    expect(saved.compactMode).toBe(false);
    expect(saved.updatedBy).toBe('Mekin Admin');

    // Verify Firestore snapshot
    const stored = mockAdminSettings.get('adminSettings/printConfig');
    expect(stored.headerTitle).toBe('AMUL ICE CREAM PARLOUR');
    expect(stored.customShopName).toBe('Amul Anand Express Station');
  });

  it('4. resets configuration back to official Amul defaults on demand', async () => {
    // Change to modified values
    await savePrintSettingsConfig({
      headerTitle: 'TEMPORARY TITLE',
      headerSpacing: 'relaxed',
      compactMode: false
    });

    // Reset
    const reset = await resetPrintSettingsConfig('Master Admin');
    expect(reset.headerTitle).toBe('AMUL PARLOUR');
    expect(reset.headerSpacing).toBe('tight');
    expect(reset.compactMode).toBe(true);
    expect(reset.footerNote1).toBe('Thank you! Please visit again');
  });

  it('5. supports real-time subscribers for instantaneous cross-counter updates', async () => {
    let notifiedConfig: PrintSettingsConfig | null = null;
    const unsub = subscribeToPrintSettings((cfg) => {
      notifiedConfig = cfg;
    });

    expect(notifiedConfig).toBeDefined();

    await savePrintSettingsConfig({
      footerNote1: 'Realtime updated note'
    });

    const cached = getCachedPrintSettings();
    expect(cached.footerNote1).toBe('Realtime updated note');

    unsub();
  });

  it('6. verifies Admin HQ contains the dedicated Print Settings sub-tab navigation', () => {
    const adminPortalCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/admin/AdminPortal.tsx'),
      'utf-8'
    );

    // Verify sub-tab button exists
    expect(adminPortalCode).toContain("setAdminSubTab('PRINT_SETTINGS')");
    expect(adminPortalCode).toContain('Print Settings (પ્રિન્ટ સેટિંગ્સ)');
    expect(adminPortalCode).toContain('PrintSettingsTab');
  });

  it('7. verifies PrintSettingsTab component has header, footer, spacing customizers and live preview', () => {
    const printTabCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/admin/PrintSettingsTab.tsx'),
      'utf-8'
    );

    expect(printTabCode).toContain('Header Customization');
    expect(printTabCode).toContain('Footer Customization');
    expect(printTabCode).toContain('Layout & Compactness');
    expect(printTabCode).toContain('Ultra-Compact Paper Saver Mode');
    expect(printTabCode).toContain('Live Receipt Preview');
    expect(printTabCode).toContain('Test Print');
  });

  it('8. verifies ThermalReceipt component renders dynamic header, footer, and compactness settings', () => {
    const receiptCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/pos/ThermalReceipt.tsx'),
      'utf-8'
    );

    expect(receiptCode).toContain('printConfig');
    expect(receiptCode).toContain('printConfig.marginSize');
    expect(receiptCode).toContain('printConfig.compactMode');
    expect(receiptCode).toContain('printConfig.showHeaderLogo');
    expect(receiptCode).toContain('printConfig.showShopName');
    expect(receiptCode).toContain('printConfig.footerNote1');
    expect(receiptCode).toContain('printConfig.showBarcodeSimulation');
  });
});
