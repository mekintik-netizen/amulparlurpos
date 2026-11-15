/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Security & Functional Tests for Master Admin Gmail 6-Digit OTP Login & Password Reset:
 * 1. Eliminates all visible Test OTP displays, console logs, and static bypass codes.
 * 2. Masks OTP inputs with `type="password"` toggle across all auth modals.
 * 3. Delivers real CSPRNG 6-digit OTPs via EmailJS (`adminSettings/emailConfig`) to Admin Gmail.
 * 4. Stores ONLY salted SHA-256 hash in Firestore/memory (never plain-text OTP).
 * 5. Enforces 5-minute TTL, single-use invalidation, and max 3 wrong-attempt lockout.
 * 6. Strictly requires verified Gmail OTP token before any Admin password reset.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock firebase.ts cleanly before importing adminEmailOtp & auth
vi.mock('../src/storage/firebase.ts', () => ({
  db: {},
  auth: {},
  authReady: Promise.resolve(),
  ensureAnonymousAuth: vi.fn(async () => false),
  isFirebasePermissionError: vi.fn(() => false),
  DEFAULT_ADMIN_AUTH_CONFIG: {
    superAdminEmail: 'mekintik@gmail.com',
    superAdminPhone: '+919173598234',
    adminName: 'Master Admin',
    adminUsername: 'admin'
  },
  getAdminAuthConfig: vi.fn(async () => ({
    superAdminEmail: 'mekintik@gmail.com',
    superAdminPhone: '+919173598234',
    adminName: 'Master Admin',
    adminUsername: 'admin'
  })),
  updateAdminAuthConfig: vi.fn(async () => undefined)
}));

import {
  DEFAULT_ADMIN_EMAILJS_CONFIG,
  DEFAULT_ADMIN_SECURITY_EMAIL,
  OTP_VALIDITY_MS,
  computeOtpHash,
  consumeAdminVerificationToken,
  generateSecureSixDigitOtp,
  getActiveOtpChallengeMeta,
  maskGmailAddress,
  resetAdminOtpTestState,
  sendAdminGmailOtp,
  verifyAdminGmailOtp
} from '../src/storage/adminEmailOtp.ts';
import {
  resetAdminPasswordViaTwoFactor,
  resetAdminPasswordWithSecurityAnswer
} from '../src/storage/auth.ts';

describe('Master Admin Gmail OTP Login & Password Reset Security', () => {
  beforeEach(() => {
    resetAdminOtpTestState();
  });

  it('1. eliminates all Test OTP displays, hardcoded fallback codes, and preview bypasses from auth modals', () => {
    const authFiles = [
      'src/components/auth/AdminGmail2FAModal.tsx',
      'src/components/auth/AdminPhone2FAModal.tsx',
      'src/components/auth/AdminCredentialsRecoveryModal.tsx',
      'src/components/auth/AdminPasswordResetModal.tsx',
      'src/components/auth/LoginPage.tsx',
      'src/storage/adminEmailOtp.ts'
    ];

    for (const relPath of authFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      expect(content).not.toContain('917359');
      expect(content).not.toContain('123456');
      expect(content).not.toContain('Test code');
      expect(content).not.toContain('Test OTP');
      expect(content).not.toContain('handlePreviewGoogleBypass');
      expect(content).not.toContain('Direct Confirm');
    }
  });

  it('2. uses password-masked OTP inputs with eye toggle across all Admin OTP modals', () => {
    const modalFiles = [
      'src/components/auth/AdminGmail2FAModal.tsx',
      'src/components/auth/AdminCredentialsRecoveryModal.tsx',
      'src/components/auth/AdminPasswordResetModal.tsx'
    ];

    for (const relPath of modalFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      expect(content).toContain("type={showOtp ? 'text' : 'password'}");
      expect(content).toContain('placeholder="••••••"');
    }
  });

  it('3. generates CSPRNG 6-digit OTPs (100000-999999), sends exact EmailJS templateParams, and stores only salted SHA-256 hash', async () => {
    const otp = generateSecureSixDigitOtp();
    expect(otp).toMatch(/^[1-9]\d{5}$/);
    const numericOtp = Number(otp);
    expect(numericOtp).toBeGreaterThanOrEqual(100000);
    expect(numericOtp).toBeLessThanOrEqual(999999);

    expect(DEFAULT_ADMIN_SECURITY_EMAIL).toBe('mekintik@gmail.com');
    expect(DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId).toBe('service_vewt5qp');
    expect(DEFAULT_ADMIN_EMAILJS_CONFIG.templateId).toBe('template_00959gb');
    expect(DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey).toBe('t_X_0uIsbOimcgCJN');
    expect(DEFAULT_ADMIN_EMAILJS_CONFIG.adminEmail).toBe('mekintik@gmail.com');

    expect(maskGmailAddress('mekintik@gmail.com')).toBe('mek•••ik@gmail.com');

    let capturedServiceId = '';
    let capturedTemplateId = '';
    let capturedPublicKey = '';
    let capturedEmail = '';
    let capturedPasscode = '';
    let capturedTime = '';
    const baseNow = 1_700_000_000_000;

    const sendRes = await sendAdminGmailOtp({
      purpose: 'ADMIN_LOGIN_2FA',
      emailSender: async (svc, tpl, params, pk) => {
        capturedServiceId = svc;
        capturedTemplateId = tpl;
        capturedPublicKey = typeof pk === 'string' ? pk : pk.publicKey;
        capturedEmail = String(params.email);
        capturedPasscode = String(params.passcode);
        capturedTime = String(params.time);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    expect(sendRes.sent).toBe(true);
    expect(sendRes.channel).toBe('emailjs');
    expect(sendRes.message).toBe('OTP તમારા Gmail (mekintik@gmail.com) પર મોકલી દેવામાં આવ્યો છે. કૃપા કરીને ઇનબોક્સ ચેક કરો.');
    expect(capturedServiceId).toBe('service_vewt5qp');
    expect(capturedTemplateId).toBe('template_00959gb');
    expect(capturedPublicKey).toBe('t_X_0uIsbOimcgCJN');
    expect(capturedEmail).toBe('mekintik@gmail.com');
    expect(capturedPasscode).toMatch(/^[1-9]\d{5}$/);
    expect(capturedTime).toContain('5 minutes');
    // Return payload NEVER contains the plain-text OTP
    expect(JSON.stringify(sendRes)).not.toContain(capturedPasscode);

    // Metadata NEVER exposes the plain-text OTP
    const meta = getActiveOtpChallengeMeta();
    expect(meta).not.toBeNull();
    expect(meta?.targetEmail).toBe(DEFAULT_ADMIN_SECURITY_EMAIL);
    expect(meta?.consumed).toBe(false);
    expect(JSON.stringify(meta)).not.toContain(capturedPasscode);

    const hashA = await computeOtpHash(capturedPasscode, 'salt123', 'ADMIN_LOGIN_2FA', DEFAULT_ADMIN_SECURITY_EMAIL);
    const hashB = await computeOtpHash(capturedPasscode, 'salt123', 'ADMIN_PASSWORD_RESET', DEFAULT_ADMIN_SECURITY_EMAIL);
    expect(hashA).toHaveLength(64);
    expect(hashA).not.toBe(hashB); // Domain/purpose-bound hash

    // Verify AdminEmailSecurityTab displays Gmail OTP Settings card with adminSettings/emailConfig
    const settingsTabSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/admin/AdminEmailSecurityTab.tsx'),
      'utf8'
    );
    expect(settingsTabSource).toContain('Gmail OTP Settings');
    expect(settingsTabSource).toContain('adminSettings/emailConfig');
  });

  it('4. verifies valid OTP once and immediately invalidates it (single-use enforcement)', async () => {
    let capturedOtp = '';
    const baseNow = 1_700_000_000_000;

    await sendAdminGmailOtp({
      purpose: 'ADMIN_LOGIN_2FA',
      emailConfigOverride: {
        serviceId: 'svc',
        templateId: 'tpl',
        publicKey: 'pk'
      },
      emailSender: async (_s, _t, params) => {
        capturedOtp = String(params.otp_code);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    const verified = await verifyAdminGmailOtp({
      code: capturedOtp,
      purpose: 'ADMIN_LOGIN_2FA',
      nowMs: baseNow + 60_000
    });

    expect(verified.verified).toBe(true);
    expect(verified.verificationToken).toBeTruthy();

    const metaAfter = getActiveOtpChallengeMeta();
    expect(metaAfter?.consumed).toBe(true);

    // Replaying the exact same OTP must fail immediately
    await expect(
      verifyAdminGmailOtp({
        code: capturedOtp,
        purpose: 'ADMIN_LOGIN_2FA',
        nowMs: baseNow + 61_000
      })
    ).rejects.toThrow(/already used|No active Gmail OTP/i);
  });

  it('5. invalidates OTP after 5-minute expiration window', async () => {
    let capturedOtp = '';
    const baseNow = 1_700_000_000_000;

    await sendAdminGmailOtp({
      purpose: 'ADMIN_PASSWORD_RESET',
      emailConfigOverride: {
        serviceId: 'svc',
        templateId: 'tpl',
        publicKey: 'pk'
      },
      emailSender: async (_s, _t, params) => {
        capturedOtp = String(params.otp_code);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    await expect(
      verifyAdminGmailOtp({
        code: capturedOtp,
        purpose: 'ADMIN_PASSWORD_RESET',
        nowMs: baseNow + OTP_VALIDITY_MS + 1000
      })
    ).rejects.toThrow(/expired/i);

    expect(getActiveOtpChallengeMeta()?.consumed).toBe(true);
  });

  it('6. locks out and invalidates OTP after 3 wrong attempts', async () => {
    let capturedOtp = '';
    const baseNow = 1_700_000_000_000;

    await sendAdminGmailOtp({
      purpose: 'ADMIN_PASSWORD_RESET',
      emailConfigOverride: {
        serviceId: 'svc',
        templateId: 'tpl',
        publicKey: 'pk'
      },
      emailSender: async (_s, _t, params) => {
        capturedOtp = String(params.otp_code);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    const wrongOtp = capturedOtp === '000000' ? '111111' : '000000';

    await expect(
      verifyAdminGmailOtp({ code: wrongOtp, purpose: 'ADMIN_PASSWORD_RESET', nowMs: baseNow + 1000 })
    ).rejects.toThrow(/2 attempts remaining/i);

    await expect(
      verifyAdminGmailOtp({ code: wrongOtp, purpose: 'ADMIN_PASSWORD_RESET', nowMs: baseNow + 2000 })
    ).rejects.toThrow(/1 attempt remaining/i);

    await expect(
      verifyAdminGmailOtp({ code: wrongOtp, purpose: 'ADMIN_PASSWORD_RESET', nowMs: baseNow + 3000 })
    ).rejects.toThrow(/Maximum 3 wrong OTP attempts exceeded/i);

    // Even the real OTP must now fail because challenge was invalidated on 3rd wrong guess
    await expect(
      verifyAdminGmailOtp({ code: capturedOtp, purpose: 'ADMIN_PASSWORD_RESET', nowMs: baseNow + 4000 })
    ).rejects.toThrow(/already used|No active Gmail OTP/i);
  });

  it('7. enforces strict password change protection requiring valid Gmail OTP verification token', async () => {
    // Attempt without valid verification token
    await expect(
      resetAdminPasswordViaTwoFactor('NewStrongPass123', '')
    ).rejects.toThrow(/Valid Gmail OTP verification is required/i);

    await expect(
      resetAdminPasswordWithSecurityAnswer({
        username: 'admin',
        securityAnswer: 'anand',
        newPassword: 'NewStrongPass123',
        verificationToken: 'forged-token'
      })
    ).rejects.toThrow();

    // Purpose binding check: a login 2FA token MUST NOT work for password reset
    let loginOtp = '';
    const baseNow = 1_700_000_000_000;
    await sendAdminGmailOtp({
      purpose: 'ADMIN_LOGIN_2FA',
      emailConfigOverride: { serviceId: 'svc', templateId: 'tpl', publicKey: 'pk' },
      emailSender: async (_s, _t, params) => {
        loginOtp = String(params.otp_code);
      },
      skipCooldown: true,
      nowMs: baseNow
    });

    const loginVerified = await verifyAdminGmailOtp({
      code: loginOtp,
      purpose: 'ADMIN_LOGIN_2FA',
      nowMs: baseNow + 1000
    });

    await expect(
      consumeAdminVerificationToken(loginVerified.verificationToken, 'ADMIN_PASSWORD_RESET', baseNow + 2000)
    ).rejects.toThrow(/not authorized for password updates/i);

    // Proper ADMIN_PASSWORD_RESET token works once and is immediately consumed
    let resetOtp = '';
    await sendAdminGmailOtp({
      purpose: 'ADMIN_PASSWORD_RESET',
      emailConfigOverride: { serviceId: 'svc', templateId: 'tpl', publicKey: 'pk' },
      emailSender: async (_s, _t, params) => {
        resetOtp = String(params.otp_code);
      },
      skipCooldown: true,
      nowMs: baseNow + 5000
    });

    const resetVerified = await verifyAdminGmailOtp({
      code: resetOtp,
      purpose: 'ADMIN_PASSWORD_RESET',
      nowMs: baseNow + 6000
    });

    const consumed = await consumeAdminVerificationToken(
      resetVerified.verificationToken,
      'ADMIN_PASSWORD_RESET',
      baseNow + 7000
    );
    expect(consumed.targetEmail).toBe(DEFAULT_ADMIN_SECURITY_EMAIL);

    // Token replay must fail immediately
    await expect(
      consumeAdminVerificationToken(resetVerified.verificationToken, 'ADMIN_PASSWORD_RESET', baseNow + 8000)
    ).rejects.toThrow(/invalid or has already been used/i);
  });
});
