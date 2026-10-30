/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for 1-Month (30-Day) Subscription Management & Expiration Enforcement
 */

import { describe, it, expect } from 'vitest';
import { Shop } from '../src/types/index.ts';
import { isShopSubscriptionActive, activateOneMonthSubscription, renewShopSubscription } from '../src/storage/subscription.ts';
import { generateSalt, hashPasswordWithSalt } from '../src/storage/auth.ts';

describe('1-Month (30-Day) Shop Subscription & Expiry Enforcement', () => {
  const createBaseShop = (overrides?: Partial<Shop>): Shop => ({
    id: 'shop-test-sub-1',
    shopCode: 'AP-2026-TEST',
    name: 'Amul Test Dairy Outlet',
    ownerName: 'Ramesh Patel',
    phone: '+91 98989 12345',
    email: 'ramesh@amuldairy.in',
    address: 'Station Road, Anand',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'INACTIVE',
    ownerIdVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  });

  it('determines an unactivated shop is not active', () => {
    const shop = createBaseShop();
    const status = isShopSubscriptionActive(shop);

    expect(status.isActive).toBe(false);
    expect(status.isExpired).toBe(false);
    expect(status.daysRemaining).toBe(0);
  });

  it('activates a fresh 1-month (30-day) subscription with owner verification', () => {
    const shop = createBaseShop();
    const adminUser = 'super_admin';

    const activated = activateOneMonthSubscription(shop, adminUser);

    expect(activated.subscriptionStatus).toBe('ACTIVE');
    expect(activated.ownerIdVerified).toBe(true);
    expect(activated.subscriptionStartDate).toBeDefined();
    expect(activated.subscriptionExpiryDate).toBeDefined();

    const startMs = new Date(activated.subscriptionStartDate!).getTime();
    const expiryMs = new Date(activated.subscriptionExpiryDate!).getTime();
    const diffDays = Math.round((expiryMs - startMs) / (24 * 60 * 60 * 1000));

    expect(diffDays).toBe(30);

    const check = isShopSubscriptionActive(activated);
    expect(check.isActive).toBe(true);
    expect(check.isExpired).toBe(false);
    expect(check.daysRemaining).toBeGreaterThanOrEqual(29);
  });

  it('detects when the 1 month subscription has expired (past date)', () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const oldStartDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(); // 32 days ago

    const shop = createBaseShop({
      subscriptionStatus: 'ACTIVE',
      subscriptionStartDate: oldStartDate,
      subscriptionExpiryDate: pastDate
    });

    const check = isShopSubscriptionActive(shop);

    expect(check.isActive).toBe(false);
    expect(check.isExpired).toBe(true);
    expect(check.daysRemaining).toBe(0);
    expect(check.expiryFormatted).toBeDefined();
  });

  it('detects when the shop status is explicitly set to EXPIRED', () => {
    const shop = createBaseShop({
      subscriptionStatus: 'EXPIRED'
    });

    const check = isShopSubscriptionActive(shop);

    expect(check.isActive).toBe(false);
    expect(check.isExpired).toBe(true);
  });

  it('extends and reactivates an expired shop subscription for another 30 days', () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const expiredShop = createBaseShop({
      subscriptionStatus: 'EXPIRED',
      subscriptionStartDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionExpiryDate: pastDate
    });

    // Admin reactivates the shop
    const renewed = activateOneMonthSubscription(expiredShop, 'admin_super');

    expect(renewed.subscriptionStatus).toBe('ACTIVE');
    const check = isShopSubscriptionActive(renewed);
    expect(check.isActive).toBe(true);
    expect(check.isExpired).toBe(false);
    expect(check.daysRemaining).toBe(30);
  });

  it('renews an already-active shop and extends its expiry date by 30 additional days', () => {
    // Current expiry is 10 days in the future
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const activeShop = createBaseShop({
      subscriptionStatus: 'ACTIVE',
      subscriptionStartDate: new Date().toISOString(),
      subscriptionExpiryDate: futureDate
    });

    const renewed = renewShopSubscription(activeShop, 30, 'admin_super');
    expect(renewed.subscriptionStatus).toBe('ACTIVE');

    const check = isShopSubscriptionActive(renewed);
    expect(check.isActive).toBe(true);
    // Should now have ~40 days remaining (10 existing + 30 added)
    expect(check.daysRemaining).toBeGreaterThanOrEqual(39);
    expect(check.daysRemaining).toBeLessThanOrEqual(41);
  });

  it('creates cashier credentials with cryptographic SHA-256 hash and zero plaintext', async () => {
    const plainPassword = 'CashierSecure@2026';
    const salt = generateSalt();

    const hash = await hashPasswordWithSalt(plainPassword, salt);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(plainPassword);
    expect(salt).toHaveLength(32);

    // Verify correct password matches hash
    const rehash = await hashPasswordWithSalt(plainPassword, salt);
    expect(rehash).toBe(hash);

    // Verify wrong password does not match
    const wrongRehash = await hashPasswordWithSalt('WrongPassword', salt);
    expect(wrongRehash).not.toBe(hash);
  });
});
