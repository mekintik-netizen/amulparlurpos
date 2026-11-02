/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Subscription Management & Expiry Enforcement Engine
 * 
 * Rules:
 * 1. 1-Month Plan duration: Exactly 30 days from activation date.
 * 2. Active Plan: Shop counter has full permissions to bill, record purchases, add expenses, and manage catalog.
 * 3. Expired Plan: Counter enters strictly READ-ONLY mode.
 *    - No new sales, purchase bills, expenses, or products can be created.
 *    - All previous shop data (historical sales, bills, customer receipts, inventory, ledger) remains 100% preserved.
 * 4. Reactivation: Admin can renew or activate the 30-day plan at any time to immediately restore entry capabilities.
 */

import { Shop, SubscriptionStatus } from '../types/index.ts';

export interface SubscriptionCheckResult {
  isActive: boolean;
  isExpired: boolean;
  isPendingApproval: boolean;
  daysRemaining: number;
  formattedExpiryDate?: string;
  expiryFormatted?: string;
  expiryDateISO?: string;
  message: string;
}

/**
 * Checks whether a shop's subscription is currently active or expired.
 */
export function isShopSubscriptionActive(shop: Shop | null | undefined): SubscriptionCheckResult {
  if (!shop) {
    return {
      isActive: false,
      isExpired: false,
      isPendingApproval: false,
      daysRemaining: 0,
      message: 'No shop selected.'
    };
  }

  // Check approval status first
  if (shop.approvalStatus === 'PENDING') {
    return {
      isActive: false,
      isExpired: false,
      isPendingApproval: true,
      daysRemaining: 0,
      message: 'Shop approval is pending from Amul Headquarters Admin.'
    };
  }

  if (shop.approvalStatus === 'SUSPENDED' || shop.status === 'suspended') {
    return {
      isActive: false,
      isExpired: false,
      isPendingApproval: false,
      daysRemaining: 0,
      message: 'Shop account is suspended by Amul Headquarters Admin.'
    };
  }

  const expiryDate = shop.planEndDate || shop.subscriptionExpiryDate;
  const statusUpper = (shop.status || shop.subscriptionStatus || '').toUpperCase();

  // If status is explicitly EXPIRED
  if (statusUpper === 'EXPIRED') {
    const formattedDate = expiryDate
      ? new Date(expiryDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      : 'Previous Period';
    return {
      isActive: false,
      isExpired: true,
      isPendingApproval: false,
      daysRemaining: 0,
      formattedExpiryDate: formattedDate,
      expiryFormatted: formattedDate,
      expiryDateISO: expiryDate,
      message: `1-Month Plan expired. Counter is in Read-Only Mode. Please contact Admin to activate.`
    };
  }

  // If no expiry date exists or status is INACTIVE (brand new, unactivated)
  if (!expiryDate || statusUpper === 'INACTIVE') {
    return {
      isActive: false,
      isExpired: false,
      isPendingApproval: false,
      daysRemaining: 0,
      message: '1-Month Subscription Plan is not yet activated. Contact Admin to activate.'
    };
  }

  const now = Date.now();
  const expiryTime = new Date(expiryDate).getTime();
  const diffMs = expiryTime - now;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  const formattedDate = new Date(expiryDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  // Expired Check
  if (diffMs <= 0) {
    return {
      isActive: false,
      isExpired: true,
      isPendingApproval: false,
      daysRemaining: 0,
      formattedExpiryDate: formattedDate,
      expiryFormatted: formattedDate,
      expiryDateISO: expiryDate,
      message: `1-Month Plan expired on ${formattedDate}. Counter is in Read-Only Mode. Please contact Admin to activate.`
    };
  }

  // Active
  return {
    isActive: true,
    isExpired: false,
    isPendingApproval: false,
    daysRemaining,
    formattedExpiryDate: formattedDate,
    expiryFormatted: formattedDate,
    expiryDateISO: expiryDate,
    message: `1-Month Plan active (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining until ${formattedDate}).`
  };
}

/**
 * Activates or renews a 1-Month (30-day) plan for a shop.
 * Preserves all existing shop properties while advancing the subscription window.
 */
export function activateOneMonthSubscription(shop: Shop, adminUsername = 'admin'): Shop {
  return renewShopSubscription(shop, 30, adminUsername);
}

/**
 * Renews a shop's subscription by extending access by a specified number of days (default 30).
 * If the shop currently has an active unexpired subscription, extends 30 days beyond
 * the current expiry date.
 * If expired or unactivated, activates 30 days from now.
 */
export function renewShopSubscription(shop: Shop, extensionDays = 30, adminUsername = 'admin'): Shop {
  const now = new Date();
  const currentExpiry = shop.planEndDate || shop.subscriptionExpiryDate;
  const currentExpiryTime = currentExpiry ? new Date(currentExpiry).getTime() : 0;
  
  // If current expiry is in the future, extend from current expiry; otherwise extend from now
  const baseTime = currentExpiryTime > now.getTime() ? currentExpiryTime : now.getTime();
  const newExpiryDate = new Date(baseTime + extensionDays * 24 * 60 * 60 * 1000);
  const newExpiryDateISO = newExpiryDate.toISOString();

  return {
    ...shop,
    approvalStatus: 'APPROVED',
    subscriptionStatus: 'ACTIVE',
    status: 'active',
    subscriptionPlanId: shop.subscriptionPlanId || 'BASIC',
    subscriptionStartDate: shop.subscriptionStartDate || shop.planStartDate || now.toISOString(),
    subscriptionExpiryDate: newExpiryDateISO,
    planStartDate: shop.planStartDate || shop.subscriptionStartDate || now.toISOString(),
    planEndDate: newExpiryDateISO,
    ownerIdVerified: true,
    ownerVerifiedAt: shop.ownerVerifiedAt || now.toISOString(),
    verifiedByAdmin: adminUsername,
    updatedAt: now.toISOString()
  };
}

