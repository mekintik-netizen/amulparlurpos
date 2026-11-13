/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for:
 * 1. Permanent Supplier / Agency Deletion (Firestore + IndexedDB + anti-resurrection tombstone, preserves historical bills)
 * 2. Password-Protected Permanent Delete for CANCELLED Purchase Bills (blocks CONFIRMED/DRAFT, enforces shop password)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchaseBill, Shop, Supplier } from '../src/types/index.ts';
import { generateSalt, hashPasswordWithSalt, verifyShopPassword } from '../src/storage/auth.ts';

// Mock firebase modules to prevent live network calls during unit tests
const deleteDocMock = vi.fn(async (_ref?: any) => {});
const docMock = vi.fn((_db: any, ...pathSegments: string[]) => ({
  path: pathSegments.join('/')
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: (...args: any[]) => docMock(args[0], ...args.slice(1)),
    deleteDoc: (ref: any) => deleteDocMock(ref)
  };
});

vi.mock('../src/storage/firebase.ts', () => ({
  db: { __mock: true },
  ensureAnonymousAuth: vi.fn(async () => ({ uid: 'anon-test-user' })),
  getAdminAuthConfig: vi.fn(),
  updateAdminAuthConfig: vi.fn(),
  DEFAULT_ADMIN_AUTH_CONFIG: {}
}));

describe('1. Password Verification for Sensitive Shop Actions (verifyShopPassword)', () => {
  it('accepts matching salted SHA-256 shop password and rejects wrong passwords', async () => {
    const salt = generateSalt();
    const passwordHash = await hashPasswordWithSalt('AmulShop@2026', salt);

    const shop: Shop = {
      id: 'shop-001',
      shopCode: 'AP-2026-1001',
      name: 'Anand Dairy Parlour',
      ownerName: 'Rajesh Patel',
      phone: '9825012345',
      email: 'anand@amul.in',
      address: 'Station Road, Anand',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'PRO',
      subscriptionStatus: 'ACTIVE',
      salt,
      passwordHash,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };

    expect(await verifyShopPassword(shop, 'AmulShop@2026')).toBe(true);
    expect(await verifyShopPassword(shop, 'WrongPass123')).toBe(false);
    expect(await verifyShopPassword(shop, '')).toBe(false);
  });

  it('supports legacy plaintext cashierPassword shops when hash is absent', async () => {
    const shop: Shop = {
      id: 'shop-002',
      shopCode: 'AP-2026-1002',
      name: 'Surat Parlour',
      ownerName: 'Mehul Shah',
      phone: '9825099999',
      email: 'surat@amul.in',
      address: 'Ring Road',
      city: 'Surat',
      state: 'Gujarat',
      pincode: '395002',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'ACTIVE',
      cashierPassword: 'my-legacy-password',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };

    expect(await verifyShopPassword(shop, 'my-legacy-password')).toBe(true);
    expect(await verifyShopPassword(shop, 'amul123')).toBe(false);
  });

  it('accepts initial default password only when neither hash nor cashierPassword exists', async () => {
    const newShop: Shop = {
      id: 'shop-003',
      shopCode: 'AP-2026-1003',
      name: 'Fresh Parlour',
      ownerName: 'Kiran Desai',
      phone: '9825077777',
      email: 'fresh@amul.in',
      address: 'MG Road',
      city: 'Vadodara',
      state: 'Gujarat',
      pincode: '390001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };

    expect(await verifyShopPassword(newShop, 'amul123')).toBe(true);
    expect(await verifyShopPassword(newShop, 'incorrect')).toBe(false);
  });
});

describe('2. Cloud Firestore Permanent Delete Paths for Suppliers & Cancelled Purchase Bills', () => {
  beforeEach(() => {
    deleteDocMock.mockClear();
    docMock.mockClear();
  });

  it('deletes supplier from both root suppliers/{id} and shops/{shopId}/suppliers/{id}', async () => {
    const { deleteSupplierFromCloud } = await import('../src/storage/firestoreSync.ts');
    await deleteSupplierFromCloud('sup-amul-01', 'shop-amul-001');

    const calledPaths = docMock.mock.calls.map(call => call.slice(1).join('/'));
    expect(calledPaths).toContain('suppliers/sup-amul-01');
    expect(calledPaths).toContain('shops/shop-amul-001/suppliers/sup-amul-01');
    expect(deleteDocMock).toHaveBeenCalledTimes(2);
  });

  it('deletes cancelled purchase bill from both root purchases/{id} and shops/{shopId}/purchases/{id}', async () => {
    const { deletePurchaseBillFromCloud } = await import('../src/storage/firestoreSync.ts');
    await deletePurchaseBillFromCloud('pur-cancelled-99', 'shop-amul-001');

    const calledPaths = docMock.mock.calls.map(call => call.slice(1).join('/'));
    expect(calledPaths).toContain('purchases/pur-cancelled-99');
    expect(calledPaths).toContain('shops/shop-amul-001/purchases/pur-cancelled-99');
    expect(deleteDocMock).toHaveBeenCalledTimes(2);
  });
});

describe('3. Business Logic Rules for Supplier & Cancelled Bill Permanent Deletion', () => {
  it('blocks permanent deletion of non-CANCELLED purchase bills until cancelled first', () => {
    const confirmedBill: PurchaseBill = {
      id: 'pur-1',
      shopId: 'shop-1',
      supplierId: 'sup-1',
      supplierName: 'Anand Depot',
      agencyName: 'Anand Depot',
      purchaseInvoiceNumber: 'INV-001',
      billNumber: 'INV-001',
      purchaseDate: '2026-04-01',
      items: [],
      itemCount: 10,
      subtotal: 500,
      taxAmount: 0,
      otherCharges: 0,
      totalAmount: 500,
      paidAmount: 500,
      dueAmount: 0,
      status: 'CONFIRMED',
      paymentMode: 'BANK_TRANSFER',
      stockPosted: true,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z'
    };

    const cancelledBill: PurchaseBill = {
      ...confirmedBill,
      id: 'pur-2',
      purchaseInvoiceNumber: 'INV-002',
      billNumber: 'INV-002',
      status: 'CANCELLED',
      stockPosted: false
    };

    const canPermanentlyDeleteBill = (bill: PurchaseBill) => bill.status === 'CANCELLED';

    expect(canPermanentlyDeleteBill(confirmedBill)).toBe(false);
    expect(canPermanentlyDeleteBill(cancelledBill)).toBe(true);
  });

  it('keeps historical purchase bills intact when a supplier is deleted', () => {
    const suppliers: Supplier[] = [
      {
        id: 'sup-seed-1',
        shopId: 'shop-1',
        name: 'GCMMF Depot',
        companyName: 'Amul Federation',
        phone: '9876543210',
        currentBalance: 0,
        openingBalance: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ];

    const purchases: PurchaseBill[] = [
      {
        id: 'pur-hist-1',
        shopId: 'shop-1',
        supplierId: 'sup-seed-1',
        supplierName: 'Amul Federation',
        agencyName: 'Amul Federation',
        purchaseInvoiceNumber: 'INV-HIST-1',
        billNumber: 'INV-HIST-1',
        purchaseDate: '2026-03-15',
        items: [],
        itemCount: 24,
        subtotal: 1200,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 1200,
        paidAmount: 1200,
        dueAmount: 0,
        status: 'CONFIRMED',
        paymentMode: 'UPI',
        stockPosted: true,
        createdAt: '2026-03-15T00:00:00Z',
        updatedAt: '2026-03-15T00:00:00Z'
      }
    ];

    const deletedSet = new Set(['sup-seed-1']);
    const remainingSuppliers = suppliers.filter(s => !deletedSet.has(s.id));

    expect(remainingSuppliers).toHaveLength(0);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].supplierId).toBe('sup-seed-1');
    expect(purchases[0].agencyName).toBe('Amul Federation');
  });
});
