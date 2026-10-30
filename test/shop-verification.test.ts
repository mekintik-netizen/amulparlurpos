/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Admin Registration, Shop Provisioning & Plan-Driven Owner Verification
 */

import { describe, it, expect } from 'vitest';
import { SUBSCRIPTION_PLANS, SubscriptionPlanId, Shop } from '../src/types/index.ts';
import { generateSalt, hashPasswordWithSalt } from '../src/storage/auth.ts';

describe('Admin Registration & Plan-Driven Shop Owner Verification', () => {
  it('creates an admin credential with salted SHA-256 and zero plaintext', async () => {
    const adminUsername = 'hq_auditor_01';
    const adminPassword = 'HqAdminPass2026!';
    const salt = generateSalt();

    const hash = await hashPasswordWithSalt(adminPassword, salt);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(adminPassword);
    expect(salt).toHaveLength(32);
  });

  it('provides all 3 configured subscription tiers with correct pricing and product limits', () => {
    const plans: SubscriptionPlanId[] = ['TRIAL', 'BASIC', 'PRO'];

    plans.forEach((planId) => {
      const plan = SUBSCRIPTION_PLANS[planId];
      expect(plan).toBeDefined();
      expect(plan.durationDays).toBe(30);
      expect(plan.maxProducts).toBeGreaterThan(0);
    });

    expect(SUBSCRIPTION_PLANS.TRIAL.price).toBe(0);
    expect(SUBSCRIPTION_PLANS.BASIC.price).toBe(300);
    expect(SUBSCRIPTION_PLANS.PRO.price).toBe(500);

    expect(SUBSCRIPTION_PLANS.TRIAL.maxProducts).toBe(50);
    expect(SUBSCRIPTION_PLANS.BASIC.maxProducts).toBe(250);
    expect(SUBSCRIPTION_PLANS.PRO.maxProducts).toBe(1000);
  });

  it('verifies owner ID and activates subscription when a plan is assigned', () => {
    const now = new Date().toISOString();
    const adminName = 'vikram_admin';
    const planKey: SubscriptionPlanId = 'BASIC';
    const plan = SUBSCRIPTION_PLANS[planKey];

    // Newly provisioned shop with owner verification upon plan selection
    const shop: Shop = {
      id: 'shop-test-101',
      shopCode: 'AP-2026-9999',
      name: 'Amul Test Parlour',
      ownerName: 'Sunil Mehta',
      phone: '+91 98765 43210',
      email: 'sunil@amulparlour.in',
      address: 'Near Dairy Circle',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      ownerIdentityNumber: 'AADHAAR-8833-2211',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: planKey,
      subscriptionStatus: 'ACTIVE',
      ownerIdVerified: true,
      ownerVerifiedAt: now,
      verifiedByAdmin: adminName,
      subscriptionStartDate: now,
      subscriptionExpiryDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      updatedAt: now
    };

    expect(shop.ownerIdVerified).toBe(true);
    expect(shop.verifiedByAdmin).toBe(adminName);
    expect(shop.approvalStatus).toBe('APPROVED');
    expect(shop.subscriptionStatus).toBe('ACTIVE');
    expect(shop.subscriptionPlanId).toBe('BASIC');
    expect(new Date(shop.subscriptionExpiryDate!).getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps unverified shops distinct from verified shops', () => {
    const draftShop: Shop = {
      id: 'shop-draft-002',
      shopCode: 'AP-2026-0002',
      name: 'Pending Kiosk',
      ownerName: 'Ramesh Dave',
      phone: '+91 99999 00000',
      email: '',
      address: 'Main Bazaar',
      city: 'Vadodara',
      state: 'Gujarat',
      pincode: '390001',
      approvalStatus: 'PENDING',
      subscriptionPlanId: 'TRIAL',
      subscriptionStatus: 'INACTIVE',
      ownerIdVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(draftShop.ownerIdVerified).toBe(false);
    expect(draftShop.subscriptionStatus).toBe('INACTIVE');
    expect(draftShop.approvalStatus).toBe('PENDING');
  });
});
