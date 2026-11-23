import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildWhatsAppBillMessage,
  buildWhatsAppBillUrl,
  getExpiringProductsWithinDays,
  normalizeWhatsAppPhone,
  safeMoney,
  safeQty
} from '../src/utils/posHelpers.ts';
import { migrateAndPurgeLegacyBusinessLocalStorage } from '../src/storage/firestoreSync.ts';
import { getCloudSyncStatus, setCloudSyncStatus, subscribeToCloudSyncStatus } from '../src/storage/firebase.ts';
import { Product, SaleBill, Shop } from '../src/types/index.ts';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

const sampleShop: Shop = {
  id: 'shop-test-001',
  shopCode: 'AP-2026-9001',
  name: 'Shreenathji Dairy Parlour',
  ownerName: 'Rameshbhai Patel',
  phone: '9876543210',
  email: 'shop@example.com',
  address: 'Station Road, Main Bazaar',
  city: 'Anand',
  state: 'Gujarat',
  pincode: '388001',
  gstNumber: '24AAAAA0000A1Z5',
  fssaiNumber: '10724001000123',
  approvalStatus: 'APPROVED',
  subscriptionPlanId: 'PRO',
  subscriptionStatus: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('100% Cloud Firestore Migration & Zero Business localStorage Persistence', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('removes ongoing localStorage.setItem writes for business records across storage modules', () => {
    const modulesToCheck = [
      'src/storage/printSettings.ts',
      'src/storage/subscriptionSettings.ts',
      'src/storage/offlineSyncManager.ts',
      'src/storage/firestoreSync.ts',
      'src/storage/db.ts'
    ];

    for (const file of modulesToCheck) {
      const content = readFile(file);
      expect(content, `${file} must not write business data via localStorage.setItem`).not.toMatch(
        /localStorage\.setItem\s*\(/
      );
    }

    // adminEmailOtp must not store lockout or monthly reminder state in localStorage
    const adminOtpSrc = readFile('src/storage/adminEmailOtp.ts');
    expect(adminOtpSrc).not.toContain('localStorage.setItem(ADMIN_LOCKOUT_STORAGE_KEY');
    expect(adminOtpSrc).not.toContain('localStorage.setItem(MONTHLY_REMINDER_LOCAL_KEY');
  });

  it('purges legacy business localStorage keys while strictly preserving auth session and theme', () => {
    const store = new Map<string, string>([
      ['amul_pos_active_session', '{"role":"SHOP_USER"}'],
      ['amul_pos_theme', 'dark'],
      ['amul_last_cloud_sync_shop-1', '2026-01-01T00:00:00Z'],
      ['amul_pos_deleted_products', '["p1"]'],
      ['amul_pos_print_settings', '{"paperWidth":"80mm"}'],
      ['amul_pos_subscription_settings', '{"monthlyFee":999}'],
      ['amul_admin_otp_lockout', '{"failedAttempts":2}']
    ]);

    const mockStorage = {
      get length() {
        return store.size;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      getItem(k: string) {
        return store.get(k) ?? null;
      },
      setItem(k: string, v: string) {
        store.set(k, v);
      },
      removeItem(k: string) {
        store.delete(k);
      },
      clear() {
        store.clear();
      }
    };

    const origWindow = (globalThis as any).window;
    (globalThis as any).window = { localStorage: mockStorage };
    try {
      const purged = migrateAndPurgeLegacyBusinessLocalStorage();
      expect(purged.length).toBe(5);
      expect(store.has('amul_pos_active_session')).toBe(true);
      expect(store.has('amul_pos_theme')).toBe(true);
      expect(store.has('amul_last_cloud_sync_shop-1')).toBe(false);
      expect(store.has('amul_pos_deleted_products')).toBe(false);
      expect(store.has('amul_pos_print_settings')).toBe(false);
      expect(store.has('amul_pos_subscription_settings')).toBe(false);
      expect(store.has('amul_admin_otp_lockout')).toBe(false);
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  it('wires atomic Firestore sync/delete operations and listener multiplexing across sync & repository layers', () => {
    const syncSrc = readFile('src/storage/firestoreSync.ts');
    const repoSrc = readFile('src/storage/repositories.ts');
    const rulesSrc = readFile('firestore.rules');

    // Atomic batch writes & listener multiplexing
    expect(syncSrc).toContain('writeBatch');
    expect(syncSrc).toContain('increment(');
    expect(syncSrc).toContain('activeShopSyncPools');
    expect(syncSrc).toContain('syncSaleBillAtomicallyToCloud');
    expect(syncSrc).toContain('syncSaleCancellationAtomicallyToCloud');
    expect(syncSrc).toContain('syncStockMovementAtomicallyToCloud');
    expect(syncSrc).toContain('syncSupplierPaymentAtomicallyToCloud');
    expect(syncSrc).toContain('deleteExpenseFromCloud');
    expect(syncSrc).toContain('deleteBankEntryFromCloud');
    expect(syncSrc).toContain('recordCrateTransactionToCloud');
    expect(syncSrc).toContain('saveDayCloseToCloud');

    // Removed snapshot handlers for expenses & bankEntries
    expect(syncSrc).toContain('localDb.deleteExpense(change.doc.id)');
    expect(syncSrc).toContain('localDb.deleteBankEntry(change.doc.id)');

    // Repositories invoke atomic cloud helpers and expose crates + dayClose
    expect(repoSrc).toContain('syncSaleBillAtomicallyToCloud');
    expect(repoSrc).toContain('syncSaleCancellationAtomicallyToCloud');
    expect(repoSrc).toContain('syncStockMovementAtomicallyToCloud');
    expect(repoSrc).toContain('syncSupplierPaymentAtomicallyToCloud');
    expect(repoSrc).toContain('deleteExpenseFromCloud');
    expect(repoSrc).toContain('deleteBankEntryFromCloud');
    expect(repoSrc).toContain('crates:');
    expect(repoSrc).toContain('dayClose:');

    // Firestore rules cover all shop subcollections including crates & dayClose
    expect(rulesSrc).toContain('match /crates/{crateId}');
    expect(rulesSrc).toContain('match /dayClose/{closeDate}');
    expect(rulesSrc).toContain('match /stockMovements/{movementId}');
    expect(rulesSrc).toContain('match /sales/{saleId}');
  });

  it('tracks live Cloud Synced state and renders Cloud Synced indicator in Header', () => {
    const events: string[] = [];
    const unsub = subscribeToCloudSyncStatus((state) => {
      events.push(state.status);
    });
    setCloudSyncStatus('syncing');
    setCloudSyncStatus('synced', '2026-11-21T10:00:00.000Z');
    unsub();

    expect(events).toContain('syncing');
    expect(events).toContain('synced');
    expect(getCloudSyncStatus().status).toBe('synced');

    const headerSrc = readFile('src/components/layout/Header.tsx');
    expect(headerSrc).toContain('subscribeToCloudSyncStatus');
    expect(headerSrc).toContain('Cloud Synced');
  });
});

describe('POS Hardening & 5 Cloud-Backed Features', () => {
  it('enforces NaN-proof currency and quantity math and removes window.alert from BarcodePOS', () => {
    expect(safeMoney(NaN)).toBe(0);
    expect(safeMoney(Infinity)).toBe(0);
    expect(safeMoney(19.99 * 3)).toBe(59.97);
    expect(safeQty(-5)).toBe(0);
    expect(safeQty(NaN)).toBe(0);
    expect(safeQty(2.5)).toBe(2.5);

    const posSrc = readFile('src/components/pos/BarcodePOS.tsx');
    expect(posSrc).not.toMatch(/\balert\s*\(/);
    expect(posSrc).toContain('CrateTrackerModal');
    expect(posSrc).toContain('DayCloseModal');
    expect(posSrc).toContain('getExpiringProductsWithinDays');
  });

  it('detects products expired or expiring within 3 days while ignoring >3d or zero-stock items', () => {
    const baseProduct: Product = {
      id: 'p-1',
      shopId: sampleShop.id,
      name: 'Taaza Milk 500ml',
      barcode: '8901262010014',
      sku: 'MILK-1',
      category: 'Milk',
      unit: 'Pouch',
      costPrice: 25,
      sellingPrice: 27,
      mrp: 27,
      currentStock: 10,
      minStockAlert: 5,
      isActive: true,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z'
    };

    const refDate = new Date(2026, 10, 20); // 2026-11-20
    const alerts = getExpiringProductsWithinDays(
      [
        { ...baseProduct, id: 'expired', name: 'Expired Curd', expiryDate: '2026-11-18' },
        { ...baseProduct, id: 'today', name: 'Today Milk', expiryDate: '2026-11-20' },
        { ...baseProduct, id: 'soon', name: 'Soon Paneer', expiryDate: '2026-11-23' },
        { ...baseProduct, id: 'safe', name: 'Safe Ghee', expiryDate: '2026-12-15' },
        { ...baseProduct, id: 'oos', name: 'Zero Stock Milk', currentStock: 0, expiryDate: '2026-11-21' }
      ],
      3,
      refDate
    );

    expect(alerts.map((a) => a.product.id)).toEqual(['expired', 'today', 'soon']);
    expect(alerts[0].status).toBe('EXPIRED');
    expect(alerts[1].status).toBe('TODAY');
    expect(alerts[2].status).toBe('SOON');
    expect(alerts[2].daysRemaining).toBe(3);
  });

  it('generates 100% shop-branded WhatsApp Bill & Khata links with zero software branding', () => {
    const creditBill: SaleBill = {
      id: 'sale-001',
      billNumber: 'BILL-20261121-1234',
      shopId: sampleShop.id,
      timestamp: '2026-11-21T09:30:00.000Z',
      items: [
        {
          productId: 'p1',
          productName: 'Taaza Milk 500ml',
          barcode: '8901262010014',
          quantity: 2,
          unit: 'Pouch',
          mrp: 27,
          unitPrice: 27,
          costPrice: 24,
          total: 54
        }
      ],
      itemCount: 2,
      subtotal: 54,
      discountAmount: 0,
      taxAmount: 0,
      roundOff: 0,
      finalAmount: 54,
      paymentMode: 'CREDIT',
      customerName: 'Kiranbhai',
      customerPhone: '9825012345',
      status: 'COMPLETED',
      cashierName: 'Counter Cashier',
      idempotencyKey: 'idemp-1',
      createdAt: '2026-11-21T09:30:00.000Z'
    };

    expect(normalizeWhatsAppPhone('9825012345')).toBe('919825012345');
    const msg = buildWhatsAppBillMessage(sampleShop, creditBill);
    expect(msg).toContain('SHREENATHJI DAIRY PARLOUR');
    expect(msg).toContain('BILL-20261121-1234');
    expect(msg).toContain('Customer Khata Account');
    expect(msg.toLowerCase()).not.toContain('parlourpro');
    expect(msg.toLowerCase()).not.toContain('github.io');

    const url = buildWhatsAppBillUrl(sampleShop, creditBill);
    expect(url.startsWith('https://wa.me/919825012345?text=')).toBe(true);

    const receiptSrc = readFile('src/components/pos/ThermalReceipt.tsx');
    expect(receiptSrc).toContain('WhatsApp Bill');
    const salesSrc = readFile('src/components/reports/DailySalesReport.tsx');
    expect(salesSrc).toContain('buildWhatsAppBillUrl');
  });
});
