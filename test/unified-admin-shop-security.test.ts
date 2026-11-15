/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration & Unit Tests for Unified Admin & Shop Security System:
 * 1. Mandatory 1st-of-month Admin Reset & Once-Per-Month EmailJS Reminder (`mekintik@gmail.com`)
 * 2. Master Admin 2FA Reset requiring BOTH New Admin Password & New 6-Digit Security PIN
 *    (salted SHA-256 hashes only, distinct from previous credentials, Gmail OTP token enforced)
 * 3. Shop Counter Login independence (never blocked by Admin monthly reset or brute-force lockout)
 * 4. Shop Owner 90-day (3-month) Password Rotation detection (`passwordUpdatedAt`),
 *    `changeShopOwnPassword`, and UI integration across `LoginPage.tsx`, `AdminCredentialsRecoveryModal.tsx`,
 *    `ShopProfileManagement.tsx`, `AdminPortal.tsx`, and `App.tsx`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { Shop, AdminSecurityConfig } from '../src/types/index.ts';

// Shared in-memory mock Firestore & IndexedDB stores for realistic round-trip security verification
const mockFirestoreDocs = new Map<string, Record<string, unknown>>();
const mockLocalUsersStore: Array<Record<string, unknown>> = [];
const mockShopsStore = new Map<string, Shop>();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, col, id })),
    getDoc: vi.fn(async (ref: { path: string }) => {
      const data = mockFirestoreDocs.get(ref.path);
      return {
        exists: () => data !== undefined,
        data: () => (data ? { ...data } : undefined)
      };
    }),
    setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      const prev = options?.merge ? mockFirestoreDocs.get(ref.path) || {} : {};
      mockFirestoreDocs.set(ref.path, { ...prev, ...data });
    }),
    onSnapshot: vi.fn(() => () => undefined),
    runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const data = mockFirestoreDocs.get(ref.path);
          return {
            exists: () => data !== undefined,
            data: () => (data ? { ...data } : undefined)
          };
        },
        set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          const prev = options?.merge ? mockFirestoreDocs.get(ref.path) || {} : {};
          mockFirestoreDocs.set(ref.path, { ...prev, ...data });
        }
      };
      return fn(tx);
    })
  };
});

vi.mock('../src/storage/firebase.ts', () => ({
  db: { app: { name: 'mock-app' } },
  auth: {},
  authReady: Promise.resolve(),
  ensureAnonymousAuth: vi.fn(async () => true),
  isFirebasePermissionError: vi.fn(() => false),
  DEFAULT_ADMIN_AUTH_CONFIG: {
    superAdminEmail: 'mekintik@gmail.com',
    superAdminPhone: '+919173598234',
    adminName: 'Master Admin',
    adminUsername: 'admin'
  },
  getAdminAuthConfig: vi.fn(async () => {
    return (
      (mockFirestoreDocs.get('adminSettings/authConfig') as Record<string, unknown> | undefined) || {
        superAdminEmail: 'mekintik@gmail.com',
        superAdminPhone: '+919173598234',
        adminName: 'Master Admin',
        adminUsername: 'admin'
      }
    );
  }),
  updateAdminAuthConfig: vi.fn(async (updates: Record<string, unknown>) => {
    const prev = mockFirestoreDocs.get('adminSettings/authConfig') || {};
    mockFirestoreDocs.set('adminSettings/authConfig', { ...prev, ...updates });
  })
}));

vi.mock('../src/storage/db.ts', () => ({
  openAppDatabase: vi.fn(async () => ({
    transaction: () => ({
      objectStore: () => ({
        get: () => {
          const req: Record<string, unknown> = {};
          setTimeout(() => {
            req.result = { key: 'registered_local_users', value: mockLocalUsersStore };
            if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
          }, 0);
          return req;
        },
        put: (entry: { value?: Array<Record<string, unknown>> }) => {
          if (Array.isArray(entry?.value)) {
            mockLocalUsersStore.splice(0, mockLocalUsersStore.length, ...entry.value);
          }
        }
      }),
      set oncomplete(cb: () => void) {
        setTimeout(cb, 0);
      }
    })
  })),
  getAllShops: vi.fn(async () => Array.from(mockShopsStore.values())),
  getShopById: vi.fn(async (id: string) => mockShopsStore.get(id) || null),
  saveShop: vi.fn(async (shop: Shop) => {
    mockShopsStore.set(shop.id, { ...shop });
    return shop;
  }),
  prefillMasterAmulCatalogWithZeroStock: vi.fn(async () => undefined)
}));

vi.mock('../src/storage/firestoreSync.ts', () => ({
  syncShopToCloud: vi.fn(async (shop: Shop) => {
    mockFirestoreDocs.set(`shops/${shop.id}`, { ...shop });
  })
}));

import {
  DEFAULT_ADMIN_SECURITY_EMAIL,
  MONTHLY_RESET_REMINDER_MESSAGE,
  MONTHLY_RESET_REQUIRED_NOTICE,
  checkAndSendMonthlyAdminResetReminder,
  getAdminSecurityConfig,
  getCurrentYearMonth,
  isAdminMonthlyResetDue,
  matchesStoredAdminSecurityPin,
  resetAdminOtpTestState,
  sendAdminGmailOtp,
  verifyAdminGmailOtp,
  verifyAdminLoginCode
} from '../src/storage/adminEmailOtp.ts';
import {
  SHOP_PASSWORD_ROTATION_DAYS,
  changeShopOwnPassword,
  generateSalt,
  getShopPasswordAgeDays,
  hashPasswordWithSalt,
  resetAdminCredentialsViaGmailOtp,
  verifyShopPassword
} from '../src/storage/auth.ts';

describe('Unified Admin & Shop Security System', () => {
  beforeEach(() => {
    mockFirestoreDocs.clear();
    mockLocalUsersStore.splice(0, mockLocalUsersStore.length);
    mockShopsStore.clear();
    resetAdminOtpTestState();
  });

  it('1. atomically dispatches once-per-month 1st-of-month Admin reset reminder email to mekintik@gmail.com', async () => {
    const firstOfNovMs = new Date(2026, 10, 1, 9, 30, 0).getTime(); // 2026-11-01
    expect(getCurrentYearMonth(firstOfNovMs)).toBe('2026-11');

    const sentEmails: Array<{ svc: string; tpl: string; email: string; passcode: string; time: string }> = [];
    const emailSender = async (svc: string, tpl: string, params: Record<string, unknown>) => {
      sentEmails.push({
        svc,
        tpl,
        email: String(params.email),
        passcode: String(params.passcode),
        time: String(params.time)
      });
    };

    // Previous month reminder only -> should send once for 2026-11
    mockFirestoreDocs.set('adminSettings/security', {
      adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL,
      lastResetMonth: '2026-10',
      lastReminderMonth: '2026-10'
    });

    const firstRun = await checkAndSendMonthlyAdminResetReminder({
      emailSender,
      nowMs: firstOfNovMs
    });

    expect(firstRun.checked).toBe(true);
    expect(firstRun.sent).toBe(true);
    expect(firstRun.currentMonth).toBe('2026-11');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].svc).toBe('service_vewt5qp');
    expect(sentEmails[0].tpl).toBe('template_00959gb');
    expect(sentEmails[0].email).toBe('mekintik@gmail.com');
    expect(sentEmails[0].passcode).toBe('RESET-DUE');
    expect(sentEmails[0].time).toBe(MONTHLY_RESET_REMINDER_MESSAGE);

    // Transaction persisted lastReminderMonth = "2026-11"
    const secAfter = mockFirestoreDocs.get('adminSettings/security') as Partial<AdminSecurityConfig>;
    expect(secAfter.lastReminderMonth).toBe('2026-11');

    // Reloading later in the same month MUST NOT send another email (even if memory cleared)
    resetAdminOtpTestState();
    const secondRun = await checkAndSendMonthlyAdminResetReminder({
      emailSender,
      nowMs: firstOfNovMs + 3600_000
    });
    expect(secondRun.sent).toBe(false);
    expect(sentEmails).toHaveLength(1);
  });

  it('2. enforces monthly Password + 6-Digit Security PIN reset via Gmail OTP, rejects credential reuse, and stores salted SHA-256 hashes', async () => {
    const baseNow = new Date(2026, 10, 1, 10, 0, 0).getTime();
    const oldPwd = 'OldAmul@2026';
    const oldPin = '492817';
    const oldPwdSalt = generateSalt(16);
    const oldPwdHash = await hashPasswordWithSalt(oldPwd, oldPwdSalt);

    // Seed previous credentials for 2026-10
    await resetAdminCredentialsViaGmailOtp; // sanity import check
    mockFirestoreDocs.set('adminSettings/security', {
      adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL,
      otpExpiryMinutes: 5,
      maxAttempts: 3,
      requireGmailOtpOnLogin: true,
      adminPasswordSalt: oldPwdSalt,
      adminPasswordHash: oldPwdHash,
      lastResetMonth: '2026-10'
    });

    const secBefore = await getAdminSecurityConfig();
    expect(isAdminMonthlyResetDue(secBefore, baseNow)).toBe(true);

    // Issue and verify ADMIN_PASSWORD_RESET Gmail OTP
    let capturedOtp = '';
    await sendAdminGmailOtp({
      purpose: 'ADMIN_PASSWORD_RESET',
      emailSender: async (_s, _t, params) => {
        capturedOtp = String(params.passcode);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    const verified = await verifyAdminGmailOtp({
      code: capturedOtp,
      purpose: 'ADMIN_PASSWORD_RESET',
      nowMs: baseNow + 5000
    });

    // Attempting to reuse old Admin Password must fail BEFORE consuming the token
    await expect(
      resetAdminCredentialsViaGmailOtp({
        newPassword: oldPwd,
        newSecurityPin: oldPin,
        verificationToken: verified.verificationToken,
        currentMonth: '2026-11',
        nowMs: baseNow + 6000
      })
    ).rejects.toThrow(/different from your previous password/i);

    // Now update with brand-new Password & new 6-Digit Security PIN
    const newPwd = 'FreshAmul#Nov26';
    const newPin = '739154';
    const result = await resetAdminCredentialsViaGmailOtp({
      newPassword: newPwd,
      newSecurityPin: newPin,
      verificationToken: verified.verificationToken,
      currentMonth: '2026-11',
      nowMs: baseNow + 7000
    });

    expect(result.resetMonth).toBe('2026-11');

    const updatedSec = await getAdminSecurityConfig();
    expect(updatedSec.lastResetMonth).toBe('2026-11');
    expect(updatedSec.lastReminderMonth).toBe('2026-11');
    expect(updatedSec.adminPasswordHash).toHaveLength(64);
    expect(updatedSec.securityPinHash).toHaveLength(64);
    expect(JSON.stringify(updatedSec)).not.toContain(newPwd);
    expect(JSON.stringify(updatedSec)).not.toContain(newPin);
    expect(isAdminMonthlyResetDue(updatedSec, baseNow)).toBe(false);

    // New 6-Digit Security PIN works for 2FA Admin Login
    const pinKind = await matchesStoredAdminSecurityPin(newPin, updatedSec);
    expect(pinKind).toBeTruthy();
    const loginCheck = await verifyAdminLoginCode({
      code: newPin,
      securityConfigOverride: updatedSec,
      nowMs: baseNow + 10_000
    });
    expect(loginCheck.verified).toBe(true);

    // Reusing the SAME new PIN during next month reset is rejected
    let nextOtp = '';
    await sendAdminGmailOtp({
      purpose: 'ADMIN_PASSWORD_RESET',
      emailSender: async (_s, _t, params) => {
        nextOtp = String(params.passcode);
      },
      skipCooldown: true,
      nowMs: baseNow + 20_000
    });
    const nextVerified = await verifyAdminGmailOtp({
      code: nextOtp,
      purpose: 'ADMIN_PASSWORD_RESET',
      nowMs: baseNow + 21_000
    });

    await expect(
      resetAdminCredentialsViaGmailOtp({
        newPassword: 'AnotherPassword!99',
        newSecurityPin: newPin,
        verificationToken: nextVerified.verificationToken,
        currentMonth: '2026-12',
        nowMs: baseNow + 22_000
      })
    ).rejects.toThrow(/different from your previous Security PIN/i);
  });

  it('3. enforces monthly reset & 2FA in LoginPage for Admin HQ only, leaving Shop Counter POS completely independent', () => {
    const loginSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx'),
      'utf8'
    );
    const recoverySource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auth/AdminCredentialsRecoveryModal.tsx'),
      'utf8'
    );

    expect(loginSource).toContain('isAdminMonthlyResetDue');
    expect(loginSource).toContain('MONTHLY_RESET_REQUIRED_NOTICE');
    expect(loginSource).toContain('6-Digit Security PIN');
    // Shop login path returns cleanly before Admin lockout or Admin monthly reset checks
    const shopBranchStart = loginSource.indexOf("if (activeTab === 'SHOP_USER')");
    const adminBranchStart = loginSource.indexOf("if (activeTab === 'ADMIN')");
    expect(shopBranchStart).toBeGreaterThan(-1);
    expect(adminBranchStart).toBeGreaterThan(shopBranchStart);
    const shopBranch = loginSource.slice(shopBranchStart, adminBranchStart);
    expect(shopBranch).not.toContain('isAdminMonthlyResetDue');
    expect(shopBranch).not.toContain('getAdminLoginLockoutStatus');

    // Recovery modal requires BOTH new password & new 6-digit Security PIN and zero auto-OTP send
    expect(recoverySource).toContain('Send OTP to Gmail');
    expect(recoverySource).toContain('New 6-Digit Security PIN');
    expect(recoverySource).toContain('resetAdminCredentialsViaGmailOtp');
    expect(MONTHLY_RESET_REQUIRED_NOTICE).toContain('1st of Month Security Policy');
  });

  it('4. tracks Shop passwordUpdatedAt for 90-day rotation prompt and updates salted SHA-256 hash cleanly via changeShopOwnPassword', async () => {
    expect(SHOP_PASSWORD_ROTATION_DAYS).toBe(90);

    const oldPwd = 'ShopOldPass@1';
    const oldSalt = generateSalt(16);
    const oldHash = await hashPasswordWithSalt(oldPwd, oldSalt);
    const nowMs = Date.now();
    const days95AgoMs = nowMs - 95 * 24 * 60 * 60 * 1000;

    const shop95DaysOld: Shop = {
      id: 'shop-rot-01',
      shopCode: 'AP-2026-5001',
      name: 'Amul Parlour Satellite',
      ownerName: 'Kiran Bhai',
      email: 'kiran@example.com',
      phone: '+91 98765 43210',
      address: 'Main Bazaar',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'PRO',
      subscriptionStatus: 'ACTIVE',
      salt: oldSalt,
      passwordHash: oldHash,
      cashierPassword: oldPwd, // legacy plaintext cleared after update
      passwordUpdatedAt: days95AgoMs,
      createdAt: new Date(days95AgoMs).toISOString(),
      updatedAt: new Date(days95AgoMs).toISOString()
    };
    mockShopsStore.set(shop95DaysOld.id, shop95DaysOld);

    // 95 days -> rotation prompt is due
    const dueInfo = getShopPasswordAgeDays(shop95DaysOld, nowMs);
    expect(dueInfo.hasTimestamp).toBe(true);
    expect(dueInfo.daysSinceUpdate).toBeGreaterThanOrEqual(95);
    expect(dueInfo.isRotationDue).toBe(true);

    // Wrong current password rejected
    await expect(
      changeShopOwnPassword({
        shop: shop95DaysOld,
        currentPassword: 'WrongPassword',
        newPassword: 'NewShopPass@99'
      })
    ).rejects.toThrow(/incorrect/i);

    // Reusing same password rejected
    await expect(
      changeShopOwnPassword({
        shop: shop95DaysOld,
        currentPassword: oldPwd,
        newPassword: oldPwd
      })
    ).rejects.toThrow(/different/i);

    // Valid password change updates salted SHA-256 hash, clears plaintext, and resets 90-day timer
    const updatedShop = await changeShopOwnPassword({
      shop: shop95DaysOld,
      currentPassword: oldPwd,
      newPassword: 'NewShopPass@99'
    });

    expect(updatedShop.cashierPassword).toBeUndefined();
    expect(updatedShop.passwordHash).toHaveLength(64);
    expect(updatedShop.passwordHash).not.toBe(oldHash);
    expect(Number(updatedShop.passwordUpdatedAt)).toBeGreaterThanOrEqual(nowMs - 1000);
    expect(await verifyShopPassword(updatedShop, 'NewShopPass@99')).toBe(true);
    expect(await verifyShopPassword(updatedShop, oldPwd)).toBe(false);

    const freshInfo = getShopPasswordAgeDays(updatedShop, nowMs + 1000);
    expect(freshInfo.isRotationDue).toBe(false);
    expect(freshInfo.daysSinceUpdate).toBe(0);

    // Verify ShopProfileManagement.tsx, AdminPortal.tsx, and App.tsx wire UI hooks cleanly
    const profileSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/profile/ShopProfileManagement.tsx'),
      'utf8'
    );
    const adminPortalSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/admin/AdminPortal.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(profileSource).toContain('changeShopOwnPassword');
    expect(profileSource).toContain('Change Shop Password');
    expect(adminPortalSource).toContain('passwordUpdatedAt');
    expect(appSource).toContain('checkAndSendMonthlyAdminResetReminder');
    expect(appSource).toContain('Change Shop Password Now');
    expect(appSource).toContain('Remind Me Later / ચાલુ રાખો');
  });
});
