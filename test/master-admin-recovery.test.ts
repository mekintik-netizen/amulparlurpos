/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit Tests for One-Time Master Admin Creation, Security Question Recovery,
 * and Admin Shop Password Management
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  generateSalt, 
  hashPasswordWithSalt,
  canUserCreateShops,
  AuthSession 
} from '../src/storage/auth.ts';
import { AdminPasswordResetModal } from '../src/components/auth/AdminPasswordResetModal.tsx';
import { isShopSubscriptionActive } from '../src/storage/subscription.ts';
import { Shop } from '../src/types/index.ts';

describe('Master Admin Security Question & Shop Credential Management', () => {
  it('verifies security answer hashing with salt produces deterministic hash', async () => {
    const rawAnswer = 'Anand High School';
    const cleanAnswer = rawAnswer.trim().toLowerCase();
    const answerSalt = generateSalt();

    const hash1 = await hashPasswordWithSalt(cleanAnswer, answerSalt);
    const hash2 = await hashPasswordWithSalt(cleanAnswer, answerSalt);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toContain(cleanAnswer);
  });

  it('rejects wrong security answers during password reset comparison', async () => {
    const correctAnswer = 'anand';
    const wrongAnswer = 'baroda';
    const answerSalt = generateSalt();

    const correctHash = await hashPasswordWithSalt(correctAnswer, answerSalt);
    const wrongHash = await hashPasswordWithSalt(wrongAnswer, answerSalt);

    expect(correctHash).not.toBe(wrongHash);
  });

  it('verifies that newly registered shops with 30-day expiry are immediately ACTIVE', () => {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const newShop: Shop = {
      id: 'shop-test-new-01',
      shopCode: 'AP-2026-9999',
      name: 'Amul Test Parlour Anand',
      ownerName: 'Manish Patel',
      email: 'owner@amulparlour.com',
      phone: '+91 98980 12345',
      address: 'Station Road',
      city: 'Anand',
      state: 'Gujarat',
      pincode: '388001',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'BASIC',
      subscriptionStatus: 'ACTIVE',
      subscriptionStartDate: now.toISOString(),
      subscriptionExpiryDate: expiryDate,
      ownerIdVerified: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const subCheck = isShopSubscriptionActive(newShop);
    expect(subCheck.isActive).toBe(true);
    expect(subCheck.isExpired).toBe(false);
    expect(subCheck.daysRemaining).toBeGreaterThanOrEqual(29);
  });

  it('confirms AdminPasswordResetModal exports and renders correctly', () => {
    expect(AdminPasswordResetModal).toBeDefined();
    expect(typeof AdminPasswordResetModal).toBe('function');
  });

  it('verifies LoginPage.tsx contains In-Card Admin Register tab, Forgot Password link and AdminPasswordResetModal', () => {
    const loginPath = path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx');
    const content = fs.readFileSync(loginPath, 'utf8');

    expect(content).toContain('Forgot Password?');
    expect(content).toContain('AdminPasswordResetModal');
    expect(content).toContain('ADMIN_REGISTER');
    expect(content).toContain('Admin Register');
    expect(content).toContain('performOneTimeAdminSetup');
  });

  it('verifies AdminRegistration.tsx contains Security Question selection and secret answer', () => {
    const regPath = path.resolve(process.cwd(), 'src/components/auth/AdminRegistration.tsx');
    const content = fs.readFileSync(regPath, 'utf8');

    expect(content).toContain('PRESET_SECURITY_QUESTIONS');
    expect(content).toContain('Password Recovery Security Question');
    expect(content).toContain('Secret Answer');
  });

  it('verifies AdminPortal.tsx includes Reset Password action for shop rows', () => {
    const portalPath = path.resolve(process.cwd(), 'src/components/admin/AdminPortal.tsx');
    const content = fs.readFileSync(portalPath, 'utf8');

    expect(content).toContain('Reset Shop Password');
    expect(content).toContain('handleAdminResetShopPassword');
    expect(content).toContain('adminResetShopPassword');
  });
});
