/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression & Verification Tests:
 * Admin "Edit Plan" feature — strictly preserves existing startDate, expiryDate,
 * trialEndDate, and remaining day count while switching between Free Trial and Paid Plans,
 * and logs an audit entry into shop.planHistory.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Shop } from '../src/types/index.ts';
import {
  correctShopPlanPreservingExpiry,
  getShopPlanDisplayInfo,
  isShopSubscriptionActive,
  isNewShop
} from '../src/storage/subscription.ts';

function makeActiveShop(overrides: Partial<Shop> = {}): Shop {
  const startDate = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(); // 12 days ago
  const expiryDate = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(); // 18 days from now

  return {
    id: 'shop-edit-plan-001',
    shopCode: 'AP-2026-9901',
    name: 'Shreeji Amul Parlour',
    ownerName: 'Kishan Patel',
    phone: '9876543210',
    email: 'shreeji@amul.in',
    address: 'Station Road',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'ACTIVE',
    status: 'active',
    subscriptionStartDate: startDate,
    subscriptionExpiryDate: expiryDate,
    planStartDate: startDate,
    planEndDate: expiryDate,
    trialEndDate: expiryDate,
    planType: 'PAID',
    planName: 'Basic Parlour',
    isTrial: false,
    isFirstMonth: false,
    renewalCount: 0,
    createdAt: startDate,
    updatedAt: startDate,
    ...overrides
  };
}

describe('Admin Edit Plan — Strictly Preserves Existing Day Count & Expiry Date', () => {
  it('switches Paid Plan (BASIC) -> Free Trial (TRIAL) without changing any dates or remaining days', () => {
    const originalShop = makeActiveShop({ subscriptionPlanId: 'BASIC' });
    const beforeSub = isShopSubscriptionActive(originalShop);

    const corrected = correctShopPlanPreservingExpiry(originalShop, 'TRIAL', 'masteradmin');
    const afterSub = isShopSubscriptionActive(corrected);

    // Plan type & trial flags updated
    expect(corrected.subscriptionPlanId).toBe('TRIAL');
    expect(corrected.planType).toBe('FREE_TRIAL');
    expect(corrected.planName).toBe('Trial Plan');
    expect(corrected.isTrial).toBe(true);
    expect(corrected.isFirstMonth).toBe(true);
    expect(isNewShop(corrected)).toBe(true);

    // All date & countdown fields strictly unchanged
    expect(corrected.subscriptionStartDate).toBe(originalShop.subscriptionStartDate);
    expect(corrected.subscriptionExpiryDate).toBe(originalShop.subscriptionExpiryDate);
    expect(corrected.planStartDate).toBe(originalShop.planStartDate);
    expect(corrected.planEndDate).toBe(originalShop.planEndDate);
    expect(corrected.trialEndDate).toBe(originalShop.trialEndDate);
    expect(afterSub.daysRemaining).toBe(beforeSub.daysRemaining);
    expect(afterSub.expiryDateISO).toBe(beforeSub.expiryDateISO);
    expect(afterSub.isActive).toBe(true);

    // Audit history appended
    expect(corrected.planHistory).toHaveLength(1);
    const entry = corrected.planHistory![0];
    expect(entry.previousPlanId).toBe('BASIC');
    expect(entry.newPlanId).toBe('TRIAL');
    expect(entry.previousPlanType).toBe('PAID');
    expect(entry.newPlanType).toBe('FREE_TRIAL');
    expect(entry.changedBy).toBe('masteradmin');
    expect(entry.note).toContain('Free Trial');
    expect(entry.note).toContain('expiry preserved');
    expect(entry.preservedStartDate).toBe(originalShop.planStartDate);
    expect(entry.preservedExpiryDate).toBe(originalShop.planEndDate);
  });

  it('switches Free Trial (TRIAL) -> Paid Plan (PRO) without resetting startDate or expiryDate', () => {
    const originalShop = makeActiveShop({
      subscriptionPlanId: 'TRIAL',
      planType: 'FREE_TRIAL',
      planName: 'Trial Plan',
      isTrial: true,
      isFirstMonth: true
    });
    const beforeSub = isShopSubscriptionActive(originalShop);

    const corrected = correctShopPlanPreservingExpiry(originalShop, 'PRO', 'hq_admin');
    const afterSub = isShopSubscriptionActive(corrected);

    expect(corrected.subscriptionPlanId).toBe('PRO');
    expect(corrected.planType).toBe('PAID');
    expect(corrected.planName).toBe('Pro Dairy Enterprise');
    expect(corrected.isTrial).toBe(false);
    expect(corrected.isFirstMonth).toBe(false);
    expect(isNewShop(corrected)).toBe(false);

    // Strictly preserved dates & remaining days
    expect(corrected.subscriptionStartDate).toBe(originalShop.subscriptionStartDate);
    expect(corrected.subscriptionExpiryDate).toBe(originalShop.subscriptionExpiryDate);
    expect(corrected.planStartDate).toBe(originalShop.planStartDate);
    expect(corrected.planEndDate).toBe(originalShop.planEndDate);
    expect(corrected.trialEndDate).toBe(originalShop.trialEndDate);
    expect(afterSub.daysRemaining).toBe(beforeSub.daysRemaining);

    expect(corrected.planHistory).toHaveLength(1);
    expect(corrected.planHistory![0].note).toContain('Free Trial');
    expect(corrected.planHistory![0].note).toContain('Pro Dairy Enterprise');
    expect(corrected.planHistory![0].note).toContain('expiry preserved');
  });

  it('appends multiple audit entries chronologically without losing prior history or altering expiry', () => {
    const originalShop = makeActiveShop({ subscriptionPlanId: 'BASIC' });
    const step1 = correctShopPlanPreservingExpiry(originalShop, 'TRIAL', 'admin1');
    const step2 = correctShopPlanPreservingExpiry(step1, 'PRO', 'admin2');

    expect(step2.planHistory).toHaveLength(2);
    expect(step2.planHistory![0].newPlanId).toBe('TRIAL');
    expect(step2.planHistory![1].previousPlanId).toBe('TRIAL');
    expect(step2.planHistory![1].newPlanId).toBe('PRO');
    expect(step2.planEndDate).toBe(originalShop.planEndDate);
    expect(step2.subscriptionExpiryDate).toBe(originalShop.subscriptionExpiryDate);
  });

  it('returns clear display labels for Free Trial vs Paid Plans', () => {
    const trialInfo = getShopPlanDisplayInfo({ subscriptionPlanId: 'TRIAL' });
    expect(trialInfo.shortBadge).toBe('Free Trial');
    expect(trialInfo.isTrial).toBe(true);

    const basicInfo = getShopPlanDisplayInfo({ subscriptionPlanId: 'BASIC' });
    expect(basicInfo.shortBadge).toBe('Paid Plan');
    expect(basicInfo.fullLabel).toContain('Basic Parlour');
    expect(basicInfo.isTrial).toBe(false);

    const proInfo = getShopPlanDisplayInfo({ subscriptionPlanId: 'PRO' });
    expect(proInfo.shortBadge).toBe('Paid Plan');
    expect(proInfo.fullLabel).toContain('Pro Dairy Enterprise');
    expect(proInfo.isTrial).toBe(false);
  });

  it('AdminPortal UI includes Edit Plan button, dropdown, Firestore sync, and exact Gujarati preservation badge', () => {
    const adminPortalSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/admin/AdminPortal.tsx'),
      'utf-8'
    );

    expect(adminPortalSource).toContain('<span>Edit Plan</span>');
    expect(adminPortalSource).toContain('Edit Plan (પ્લાન સુધારો)');
    expect(adminPortalSource).toContain('id="admin-edit-plan-select"');
    expect(adminPortalSource).toContain(
      'નોંધ: આ ફેરફારથી ફક્ત પ્લાનનો પ્રકાર બદલાશે — બાકી રહેલા દિવસોની ગણતરી (Expiry Date) માં કોઈ ફેરફાર થશે નહીં.'
    );
    expect(adminPortalSource).toContain('correctShopPlanPreservingExpiry(');
    expect(adminPortalSource).toContain('syncShopToCloud(updatedShop)');
  });
});
