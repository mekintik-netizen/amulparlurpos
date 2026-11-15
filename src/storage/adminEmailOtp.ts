/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master Admin Gmail OTP & Password Reset Security Engine
 *
 * Security Guarantees:
 * - Zero on-screen or console plain-text OTP exposure (never logs or returns the generated OTP).
 * - CSPRNG 6-digit OTP generation via `crypto.getRandomValues` with rejection sampling.
 * - Salted SHA-256 hash stored in memory + Cloud Firestore (`adminSettings/adminOtpChallenge`);
 *   plain-text OTP is discarded immediately after EmailJS dispatch.
 * - Strict 5-minute expiration, single-use invalidation, and max 3 wrong-attempt lockout.
 * - Supports EmailJS (`@emailjs/browser`) via Cloud Firestore `adminSettings/emailConfig`
 *   AND Firebase Email Authentication (`sendSignInLinkToEmail` / `signInWithEmailLink`).
 * - Issues a short-lived single-use cryptographic verification token required before any
 *   Master Admin password update.
 */

import emailjs from '@emailjs/browser';
import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, setDoc, Unsubscribe } from 'firebase/firestore';
import {
  AdminEmailJsConfig,
  AdminOtpChallengeRecord,
  AdminOtpPurpose,
  AdminSecurityConfig
} from '../types/index.ts';
import { constantTimeEqual, generateSalt, hashPasswordWithSalt } from '../utils/cryptoHash.ts';
import {
  auth,
  authReady,
  db,
  ensureAnonymousAuth,
  isFirebasePermissionError,
  updateAdminAuthConfig
} from './firebase.ts';

export const DEFAULT_ADMIN_SECURITY_EMAIL = 'mekintik@gmail.com';
export const OTP_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_OTP_WRONG_ATTEMPTS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const VERIFICATION_PROOF_TTL_MS = 5 * 60 * 1000; // 5 minutes to complete password reset
export const ADMIN_LOCKOUT_MAX_ATTEMPTS = 3;
export const ADMIN_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes brute-force lockout
export const MONTHLY_RESET_REMINDER_MESSAGE =
  'આજે નવા મહિનાની ૧ તારીખ છે — કૃપા કરીને તમારો Admin Password અને 6-Digit Security PIN રિસેટ કરો.';
export const MONTHLY_RESET_REQUIRED_NOTICE =
  'નવો મહિનો શરૂ થયો છે (1st of Month Security Policy). આગળ વધવા માટે Gmail OTP દ્વારા નવો Admin Password અને નવો 6-Digit Security PIN સેટ કરો.';

const PENDING_EMAIL_LINK_STORAGE_KEY = 'amul_admin_email_link_pending';
const ADMIN_LOCKOUT_STORAGE_KEY = 'amul_admin_brute_force_lockout_v1';
const MONTHLY_REMINDER_LOCAL_KEY = 'amul_admin_monthly_reminder_month_v1';

export const DEFAULT_ADMIN_SECURITY_CONFIG: AdminSecurityConfig = {
  adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL,
  otpExpiryMinutes: 5,
  maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
  requireGmailOtpOnLogin: true
};

export const DEFAULT_ADMIN_EMAILJS_CONFIG: AdminEmailJsConfig = {
  serviceId: 'service_vewt5qp',
  templateId: 'template_00959gb',
  publicKey: 't_X_0uIsbOimcgCJN',
  adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL,
  senderName: 'Amul Parlour Admin Security'
};

export interface SendAdminOtpResult {
  sent: true;
  channel: 'emailjs' | 'firebase_email_link' | 'mobile_sms';
  maskedEmail: string;
  targetEmail: string;
  expiresAt: number;
  expiresInSeconds: number;
  maxAttempts: number;
  message: string;
}

export interface SendAdminMobileOtpResult {
  sent: boolean;
  channel: 'mobile_sms' | 'sms_unconfigured';
  expiresAt?: number;
  expiresInSeconds?: number;
  cooldownSeconds: number;
  message: string;
}

export interface VerifyAdminOtpResult {
  verified: true;
  verificationToken: string;
  targetEmail: string;
  purpose: AdminOtpPurpose;
  verifiedAt: number;
  method?: 'otp' | 'master_backup_code' | 'security_pin';
}

export interface MonthlyReminderResult {
  checked: boolean;
  sent: boolean;
  currentMonth: string;
  targetEmail?: string;
}

export type EmailJsSendFn = (
  serviceId: string,
  templateId: string,
  templateParams: Record<string, unknown>,
  publicKeyOrOptions: string | { publicKey: string }
) => Promise<unknown>;

export type FirebaseEmailLinkSendFn = (email: string, continueUrl: string) => Promise<void>;

interface VerificationProof {
  token: string;
  purpose: AdminOtpPurpose;
  targetEmail: string;
  expiresAt: number;
  consumed: boolean;
}

export interface AdminLockoutState {
  failedAttempts: number;
  lockedUntil: number;
  lastFailedAttemptAt: number;
  lastSecurityAlertAt: number;
}

export interface AdminLoginLockoutStatus {
  locked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  lockedUntil: number;
  retryAfterSeconds: number;
  retryAfterMinutes: number;
}

export interface RecordAdminLoginFailureResult extends AdminLoginLockoutStatus {
  alertSent: boolean;
  message: string;
}

// Strict module-level state (never written to localStorage/sessionStorage for OTPs, zero plain-text OTP kept)
let activeOtpChallenge: AdminOtpChallengeRecord | null = null;
let lastOtpDispatchedAt: Record<string, number> = {};
const activeVerificationProofs = new Map<string, VerificationProof>();
let adminLockoutState: AdminLockoutState = {
  failedAttempts: 0,
  lockedUntil: 0,
  lastFailedAttemptAt: 0,
  lastSecurityAlertAt: 0
};
let inMemoryMonthlyReminderMonth = '';
let inFlightMonthlyReminderPromise: Promise<MonthlyReminderResult> | null = null;

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Masks an email address for privacy hints (e.g. `mekintik@gmail.com` -> `mek•••ik@gmail.com`).
 */
export function maskGmailAddress(email: string): string {
  const trimmed = (email || '').trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  if (local.length <= 3) {
    return `${local[0]}•••${domain}`;
  }
  return `${local.slice(0, 3)}${'•'.repeat(Math.min(8, Math.max(3, local.length - 5)))}${local.slice(-2)}${domain}`;
}

/**
 * Generates an unbiased, cryptographically random 6-digit numeric OTP (`100000`-`999999`).
 */
export function generateSecureSixDigitOtp(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 900000) * 900000;
    let rand = 0;
    do {
      globalThis.crypto.getRandomValues(array);
      rand = array[0];
    } while (rand >= limit);
    return String(100000 + (rand % 900000));
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}

/**
 * Computes a domain-bound salted SHA-256 hash of a 6-digit OTP.
 */
export async function computeOtpHash(
  otp: string,
  salt: string,
  purpose: AdminOtpPurpose,
  targetEmail: string
): Promise<string> {
  const domainBoundSecret = `amul-admin-otp-v1|${purpose}|${targetEmail.trim().toLowerCase()}|${otp.trim()}`;
  return hashPasswordWithSalt(domainBoundSecret, salt);
}

/**
 * Computes a domain-bound salted SHA-256 hash of a 6-digit silent Master Backup Code / Security PIN (Admin Login ONLY).
 */
export async function computeMasterBackupCodeHash(
  backupCode: string,
  salt: string
): Promise<string> {
  const domainBoundSecret = `amul-admin-master-backup-v1|ADMIN_LOGIN_2FA|${backupCode.trim()}`;
  return hashPasswordWithSalt(domainBoundSecret, salt);
}

/**
 * Returns local calendar year-month string ("YYYY-MM", e.g., "2026-11").
 */
export function getCurrentYearMonth(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Checks whether the Admin must perform the mandatory 1st-of-month Password & 6-Digit Security PIN reset.
 */
export function isAdminMonthlyResetDue(
  secConfig: Partial<AdminSecurityConfig> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const currentMonth = getCurrentYearMonth(nowMs);
  return (secConfig?.lastResetMonth || '').trim() !== currentMonth;
}

/**
 * Checks whether a 6-digit Admin Security PIN matches either the new `securityPinHash`
 * or the legacy `masterBackupCodeHash` inside `AdminSecurityConfig`.
 */
export async function matchesStoredAdminSecurityPin(
  pin: string,
  secConfig: Partial<AdminSecurityConfig> | null | undefined
): Promise<'security_pin' | 'master_backup_code' | null> {
  const cleanCode = (pin || '').trim();
  if (!/^\d{6}$/.test(cleanCode) || !secConfig) return null;

  if (secConfig.masterBackupCodeSalt && secConfig.masterBackupCodeHash) {
    const legacyHash = await computeMasterBackupCodeHash(cleanCode, secConfig.masterBackupCodeSalt);
    if (constantTimeEqual(legacyHash, secConfig.masterBackupCodeHash)) {
      return 'master_backup_code';
    }
  }

  if (secConfig.securityPinSalt && secConfig.securityPinHash) {
    const pinHash = await computeMasterBackupCodeHash(cleanCode, secConfig.securityPinSalt);
    if (constantTimeEqual(pinHash, secConfig.securityPinHash)) {
      return 'security_pin';
    }
  }

  return null;
}

/**
 * Saves ONLY a salted SHA-256 hash of the Admin's 6-digit Security PIN / Master Backup Code
 * into Cloud Firestore (`adminSettings/security`). Never stores or logs plaintext.
 */
export async function saveAdminMasterBackupCode(
  backupCode: string,
  updatedBy: string = 'Master Admin'
): Promise<AdminSecurityConfig> {
  const cleanCode = (backupCode || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('6-Digit Security PIN / Backup Code must be exactly 6 numeric digits.');
  }

  const salt = generateSalt(16);
  const hash = await computeMasterBackupCodeHash(cleanCode, salt);
  const current = await getAdminSecurityConfig();

  const nextConfig: AdminSecurityConfig = {
    ...current,
    securityPinSalt: salt,
    securityPinHash: hash,
    masterBackupCodeSalt: salt,
    masterBackupCodeHash: hash,
    updatedAt: new Date().toISOString(),
    updatedBy
  };

  await authReady;
  await setDoc(doc(db, 'adminSettings', 'security'), nextConfig, { merge: true });
  return nextConfig;
}

/**
 * Persists salted SHA-256 hashes of BOTH the Admin Password and 6-Digit Security PIN
 * plus monthly reset metadata into Cloud Firestore (`adminSettings/security`).
 */
export async function saveAdminCredentialsToSecurity(params: {
  passwordSalt: string;
  passwordHash: string;
  securityPin: string;
  currentMonth?: string;
  updatedBy?: string;
}): Promise<AdminSecurityConfig> {
  const cleanPin = (params.securityPin || '').trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new Error('Security PIN must be exactly 6 numeric digits.');
  }

  const pinSalt = generateSalt(16);
  const pinHash = await computeMasterBackupCodeHash(cleanPin, pinSalt);
  const current = await getAdminSecurityConfig();
  const monthTag = params.currentMonth || getCurrentYearMonth();

  const nextConfig: AdminSecurityConfig = {
    ...current,
    adminPasswordSalt: params.passwordSalt,
    adminPasswordHash: params.passwordHash,
    securityPinSalt: pinSalt,
    securityPinHash: pinHash,
    masterBackupCodeSalt: pinSalt,
    masterBackupCodeHash: pinHash,
    lastResetMonth: monthTag,
    lastReminderMonth: monthTag,
    failedLoginAttempts: 0,
    lockedUntil: 0,
    lastFailedAttemptAt: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: params.updatedBy || 'Master Admin'
  };

  inMemoryMonthlyReminderMonth = monthTag;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(MONTHLY_REMINDER_LOCAL_KEY, monthTag);
    } catch {
      // ignore
    }
  }

  try {
    await authReady;
    await setDoc(doc(db, 'adminSettings', 'security'), nextConfig, { merge: true });
  } catch {
    // Non-fatal in offline/unit test mocks
  }

  return nextConfig;
}

/**
 * Reads `adminSettings/security` from Cloud Firestore.
 */
export async function getAdminSecurityConfig(): Promise<AdminSecurityConfig> {
  try {
    await authReady;
    const snap = await getDoc(doc(db, 'adminSettings', 'security'));
    if (snap.exists()) {
      const data = snap.data() as Partial<AdminSecurityConfig>;
      const adminEmail =
        data.adminEmail && isValidEmailAddress(data.adminEmail)
          ? data.adminEmail.trim().toLowerCase()
          : DEFAULT_ADMIN_SECURITY_EMAIL;
      return {
        ...DEFAULT_ADMIN_SECURITY_CONFIG,
        ...data,
        adminEmail,
        otpExpiryMinutes: 5,
        maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
        requireGmailOtpOnLogin: data.requireGmailOtpOnLogin !== false
      };
    }
  } catch (err) {
    if (!isFirebasePermissionError(err)) {
      console.warn('[AdminSecurity] Could not load remote security config, using defaults');
    }
  }
  return { ...DEFAULT_ADMIN_SECURITY_CONFIG };
}

/**
 * Saves Master Admin security settings to Cloud Firestore (`adminSettings/security`).
 */
export async function saveAdminSecurityConfig(
  updates: Partial<AdminSecurityConfig>
): Promise<AdminSecurityConfig> {
  const current = await getAdminSecurityConfig();
  const candidateEmail = (updates.adminEmail ?? current.adminEmail).trim().toLowerCase();
  if (!isValidEmailAddress(candidateEmail)) {
    throw new Error('Please enter a valid Master Admin Gmail address.');
  }

  const nextConfig: AdminSecurityConfig = {
    adminEmail: candidateEmail,
    otpExpiryMinutes: 5,
    maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
    requireGmailOtpOnLogin:
      updates.requireGmailOtpOnLogin !== undefined
        ? updates.requireGmailOtpOnLogin
        : current.requireGmailOtpOnLogin,
    ...(current.adminPasswordSalt ? { adminPasswordSalt: current.adminPasswordSalt } : {}),
    ...(current.adminPasswordHash ? { adminPasswordHash: current.adminPasswordHash } : {}),
    ...(current.securityPinSalt ? { securityPinSalt: current.securityPinSalt } : {}),
    ...(current.securityPinHash ? { securityPinHash: current.securityPinHash } : {}),
    ...(current.masterBackupCodeSalt ? { masterBackupCodeSalt: current.masterBackupCodeSalt } : {}),
    ...(current.masterBackupCodeHash ? { masterBackupCodeHash: current.masterBackupCodeHash } : {}),
    ...(current.lastResetMonth ? { lastResetMonth: current.lastResetMonth } : {}),
    ...(current.lastReminderMonth ? { lastReminderMonth: current.lastReminderMonth } : {}),
    ...(typeof current.failedLoginAttempts === 'number'
      ? { failedLoginAttempts: current.failedLoginAttempts }
      : {}),
    ...(typeof current.lockedUntil === 'number' ? { lockedUntil: current.lockedUntil } : {}),
    ...(typeof current.lastFailedAttemptAt === 'number'
      ? { lastFailedAttemptAt: current.lastFailedAttemptAt }
      : {}),
    ...(typeof current.lastSecurityAlertAt === 'number'
      ? { lastSecurityAlertAt: current.lastSecurityAlertAt }
      : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: updates.updatedBy || 'Master Admin'
  };

  await authReady;
  await setDoc(doc(db, 'adminSettings', 'security'), nextConfig, { merge: true });

  // Keep authConfig.superAdminEmail synchronized when admin updates registered Gmail
  try {
    await updateAdminAuthConfig({ superAdminEmail: candidateEmail });
  } catch {
    // non-fatal
  }

  return nextConfig;
}

export function subscribeToAdminSecurityConfig(
  callback: (config: AdminSecurityConfig) => void
): Unsubscribe {
  let firestoreUnsub: Unsubscribe = () => {};
  let cancelled = false;

  authReady.then(() => {
    if (cancelled) return;
    try {
      firestoreUnsub = onSnapshot(
        doc(db, 'adminSettings', 'security'),
        (snap) => {
          if (!snap.exists()) {
            callback({ ...DEFAULT_ADMIN_SECURITY_CONFIG });
            return;
          }
          const data = snap.data() as Partial<AdminSecurityConfig>;
          callback({
            ...DEFAULT_ADMIN_SECURITY_CONFIG,
            ...data,
            adminEmail:
              data.adminEmail && isValidEmailAddress(data.adminEmail)
                ? data.adminEmail.trim().toLowerCase()
                : DEFAULT_ADMIN_SECURITY_EMAIL
          });
        },
        (err) => {
          if (!isFirebasePermissionError(err)) {
            console.warn('[AdminSecurity] Listener notice:', err.message);
          }
        }
      );
    } catch {
      // ignore offline initialization errors
    }
  });

  return () => {
    cancelled = true;
    firestoreUnsub();
  };
}

function getEnvEmailJsConfig(): Partial<AdminEmailJsConfig> {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    return {
      serviceId: (env.VITE_EMAILJS_SERVICE_ID || '').trim(),
      templateId: (env.VITE_EMAILJS_TEMPLATE_ID || '').trim(),
      publicKey: (env.VITE_EMAILJS_PUBLIC_KEY || '').trim()
    };
  } catch {
    return {};
  }
}

/**
 * Reads EmailJS configuration from Cloud Firestore (`adminSettings/emailConfig`),
 * falling back to `VITE_EMAILJS_*` environment variables and pre-configured defaults.
 */
export async function getAdminEmailConfig(): Promise<AdminEmailJsConfig> {
  const envFallback = getEnvEmailJsConfig();
  try {
    await authReady;
    const snap = await getDoc(doc(db, 'adminSettings', 'emailConfig'));
    if (snap.exists()) {
      const data = snap.data() as Partial<AdminEmailJsConfig>;
      return {
        serviceId: (data.serviceId || envFallback.serviceId || DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId).trim(),
        templateId: (data.templateId || envFallback.templateId || DEFAULT_ADMIN_EMAILJS_CONFIG.templateId).trim(),
        publicKey: (data.publicKey || envFallback.publicKey || DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey).trim(),
        adminEmail:
          data.adminEmail && isValidEmailAddress(data.adminEmail)
            ? data.adminEmail.trim().toLowerCase()
            : DEFAULT_ADMIN_SECURITY_EMAIL,
        senderName: (data.senderName || DEFAULT_ADMIN_EMAILJS_CONFIG.senderName || '').trim(),
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    if (!isFirebasePermissionError(err)) {
      console.warn('[AdminEmailConfig] Could not load remote emailConfig');
    }
  }

  return {
    ...DEFAULT_ADMIN_EMAILJS_CONFIG,
    serviceId: envFallback.serviceId || DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId,
    templateId: envFallback.templateId || DEFAULT_ADMIN_EMAILJS_CONFIG.templateId,
    publicKey: envFallback.publicKey || DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey,
    adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL
  };
}

export async function saveAdminEmailConfig(
  updates: Partial<AdminEmailJsConfig>
): Promise<AdminEmailJsConfig> {
  const current = await getAdminEmailConfig();
  const candidateEmail = (updates.adminEmail ?? current.adminEmail ?? DEFAULT_ADMIN_SECURITY_EMAIL)
    .trim()
    .toLowerCase();
  if (!isValidEmailAddress(candidateEmail)) {
    throw new Error('Please enter a valid Master Admin Gmail address.');
  }

  const next: AdminEmailJsConfig = {
    serviceId: (updates.serviceId ?? current.serviceId).trim(),
    templateId: (updates.templateId ?? current.templateId).trim(),
    publicKey: (updates.publicKey ?? current.publicKey).trim(),
    adminEmail: candidateEmail,
    senderName: (updates.senderName ?? current.senderName ?? 'Amul Parlour Admin Security').trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: updates.updatedBy || 'Master Admin'
  };

  await authReady;
  await setDoc(doc(db, 'adminSettings', 'emailConfig'), next, { merge: true });

  // Keep adminSettings/security synchronized with the configured Admin target Gmail
  try {
    await saveAdminSecurityConfig({
      adminEmail: candidateEmail,
      updatedBy: updates.updatedBy || 'Master Admin'
    });
  } catch {
    // non-fatal
  }

  return next;
}

export function subscribeToAdminEmailConfig(
  callback: (config: AdminEmailJsConfig) => void
): Unsubscribe {
  let firestoreUnsub: Unsubscribe = () => {};
  let cancelled = false;

  authReady.then(() => {
    if (cancelled) return;
    try {
      firestoreUnsub = onSnapshot(
        doc(db, 'adminSettings', 'emailConfig'),
        (snap) => {
          const envFallback = getEnvEmailJsConfig();
          if (!snap.exists()) {
            callback({
              ...DEFAULT_ADMIN_EMAILJS_CONFIG,
              serviceId: envFallback.serviceId || DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId,
              templateId: envFallback.templateId || DEFAULT_ADMIN_EMAILJS_CONFIG.templateId,
              publicKey: envFallback.publicKey || DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey,
              adminEmail: DEFAULT_ADMIN_SECURITY_EMAIL
            });
            return;
          }
          const data = snap.data() as Partial<AdminEmailJsConfig>;
          callback({
            serviceId: (data.serviceId || envFallback.serviceId || DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId).trim(),
            templateId: (data.templateId || envFallback.templateId || DEFAULT_ADMIN_EMAILJS_CONFIG.templateId).trim(),
            publicKey: (data.publicKey || envFallback.publicKey || DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey).trim(),
            adminEmail:
              data.adminEmail && isValidEmailAddress(data.adminEmail)
                ? data.adminEmail.trim().toLowerCase()
                : DEFAULT_ADMIN_SECURITY_EMAIL,
            senderName: (data.senderName || DEFAULT_ADMIN_EMAILJS_CONFIG.senderName || '').trim(),
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          });
        },
        (err) => {
          if (!isFirebasePermissionError(err)) {
            console.warn('[AdminEmailConfig] Listener notice:', err.message);
          }
        }
      );
    } catch {
      // ignore
    }
  });

  return () => {
    cancelled = true;
    firestoreUnsub();
  };
}

export function isEmailJsConfigured(config: Partial<AdminEmailJsConfig> | null | undefined): boolean {
  return Boolean(config?.serviceId?.trim() && config?.templateId?.trim() && config?.publicKey?.trim());
}

async function persistChallengeToFirestore(record: AdminOtpChallengeRecord): Promise<void> {
  try {
    const authed = await ensureAnonymousAuth();
    if (authed === false) return;
    await setDoc(doc(db, 'adminSettings', 'adminOtpChallenge'), record);
  } catch {
    // Non-fatal in offline/local or restricted test environments; in-memory state stays authoritative
  }
}

async function loadChallengeFromFirestore(): Promise<AdminOtpChallengeRecord | null> {
  try {
    const authed = await ensureAnonymousAuth();
    if (authed === false) return null;
    const snap = await getDoc(doc(db, 'adminSettings', 'adminOtpChallenge'));
    if (!snap.exists()) return null;
    return snap.data() as AdminOtpChallengeRecord;
  } catch {
    return null;
  }
}

/**
 * Immediately invalidates any active OTP challenge in memory and Cloud Firestore.
 */
export async function invalidateActiveOtpChallenge(): Promise<void> {
  if (activeOtpChallenge) {
    const invalidated: AdminOtpChallengeRecord = {
      ...activeOtpChallenge,
      otpSalt: '',
      otpHash: '',
      consumed: true
    };
    activeOtpChallenge = invalidated;
    await persistChallengeToFirestore(invalidated);
  } else {
    const emptyInvalidated: AdminOtpChallengeRecord = {
      challengeId: `inv-${Date.now()}`,
      purpose: 'ADMIN_LOGIN_2FA',
      targetEmail: '',
      otpSalt: '',
      otpHash: '',
      expiresAt: 0,
      attemptsUsed: 0,
      maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
      consumed: true,
      deliveryChannel: 'emailjs',
      createdAt: new Date().toISOString()
    };
    await persistChallengeToFirestore(emptyInvalidated);
  }
}

function buildEmailAuthContinueUrl(purpose: AdminOtpPurpose): string {
  if (typeof window === 'undefined') {
    return `https://amulparlour.pos/?adminEmailOtp=${purpose}`;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('adminEmailOtp', purpose);
  return url.toString();
}

async function defaultFirebaseLinkSender(email: string, continueUrl: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, {
    url: continueUrl,
    handleCodeInApp: true
  });
}

async function defaultEmailJsSender(
  serviceId: string,
  templateId: string,
  templateParams: Record<string, unknown>,
  publicKeyOrOptions: string | { publicKey: string }
): Promise<unknown> {
  const publicKey =
    typeof publicKeyOrOptions === 'string'
      ? publicKeyOrOptions
      : publicKeyOrOptions.publicKey;
  emailjs.init({ publicKey });
  return emailjs.send(serviceId, templateId, templateParams, publicKey);
}

/**
 * Generates a fresh 6-digit OTP, stores ONLY its salted SHA-256 hash in memory/Firestore,
 * and delivers it directly to the Master Admin's registered Gmail inbox via EmailJS
 * (or Firebase Email Link Authentication when EmailJS is not configured).
 *
 * NEVER displays or logs the plain-text OTP anywhere.
 */
export async function sendAdminGmailOtp(params: {
  purpose: AdminOtpPurpose;
  targetEmailOverride?: string;
  emailConfigOverride?: AdminEmailJsConfig;
  emailSender?: EmailJsSendFn;
  firebaseLinkSender?: FirebaseEmailLinkSendFn;
  skipCooldown?: boolean;
  nowMs?: number;
}): Promise<SendAdminOtpResult> {
  const nowMs = params.nowMs ?? Date.now();
  const securityConfig = await getAdminSecurityConfig();
  const targetEmail = (params.targetEmailOverride || securityConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL)
    .trim()
    .toLowerCase();

  if (!isValidEmailAddress(targetEmail)) {
    throw new Error('Registered Master Admin Gmail address is invalid.');
  }

  // Enforce resend cooldown so attackers cannot spam Admin Gmail inbox
  if (!params.skipCooldown) {
    const lastSent = lastOtpDispatchedAt[params.purpose] || 0;
    const elapsedSeconds = Math.floor((nowMs - lastSent) / 1000);
    if (lastSent > 0 && elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      throw new Error(`Please wait ${waitSeconds} seconds before requesting another Gmail OTP.`);
    }
  }

  const emailConfig = params.emailConfigOverride || (await getAdminEmailConfig());
  const useEmailJs = isEmailJsConfigured(emailConfig);

  // Generate CSPRNG 6-digit OTP + 16-byte random salt + salted SHA-256 hash
  const otp = generateSecureSixDigitOtp();
  const otpSalt = generateSalt(16);
  const otpHash = await computeOtpHash(otp, otpSalt, params.purpose, targetEmail);
  const expiresAt = nowMs + OTP_VALIDITY_MS;

  const challengeRecord: AdminOtpChallengeRecord = {
    challengeId: `otp-${nowMs}-${generateSalt(4)}`,
    purpose: params.purpose,
    targetEmail,
    otpSalt,
    otpHash,
    expiresAt,
    attemptsUsed: 0,
    maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
    consumed: false,
    deliveryChannel: useEmailJs ? 'emailjs' : 'firebase_email_link',
    createdAt: new Date(nowMs).toISOString()
  };

  activeOtpChallenge = challengeRecord;
  await persistChallengeToFirestore(challengeRecord);

  const purposeLabel =
    params.purpose === 'ADMIN_PASSWORD_RESET'
      ? 'Master Admin Password Reset'
      : 'Master Admin HQ 2FA Login';

  if (useEmailJs) {
    const sender = params.emailSender || defaultEmailJsSender;
    const expiryTimeFormatted = new Date(expiresAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const expirationTimeString = `${expiryTimeFormatted} (5 minutes from now)`;

    try {
      await sender(
        emailConfig.serviceId,
        emailConfig.templateId,
        {
          email: targetEmail,
          passcode: otp,
          time: expirationTimeString,
          to_email: targetEmail,
          user_email: targetEmail,
          to_name: 'Master Admin',
          from_name: emailConfig.senderName || 'Amul Parlour Admin Security',
          app_name: 'Amul Parlour POS Admin HQ',
          otp_code: otp,
          expiry_minutes: '5',
          purpose_label: purposeLabel
        },
        emailConfig.publicKey
      );
      lastOtpDispatchedAt[params.purpose] = nowMs;
      const maskedEmail = maskGmailAddress(targetEmail);
      return {
        sent: true,
        channel: 'emailjs',
        maskedEmail,
        targetEmail,
        expiresAt,
        expiresInSeconds: 300,
        maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
        message: `OTP તમારા Gmail (${targetEmail}) પર મોકલી દેવામાં આવ્યો છે. કૃપા કરીને ઇનબોક્સ ચેક કરો.`
      };
    } catch (emailErr: unknown) {
      await invalidateActiveOtpChallenge();
      const reason = emailErr instanceof Error ? emailErr.message : 'Email delivery service rejected request';
      throw new Error(`Failed to send Gmail OTP via EmailJS: ${reason}`);
    }
  }

  // Fallback to Firebase Email Link Authentication when EmailJS is not configured
  const linkSender = params.firebaseLinkSender || defaultFirebaseLinkSender;
  const continueUrl = buildEmailAuthContinueUrl(params.purpose);
  try {
    await linkSender(targetEmail, continueUrl);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        PENDING_EMAIL_LINK_STORAGE_KEY,
        JSON.stringify({ email: targetEmail, purpose: params.purpose, requestedAt: nowMs })
      );
    }
    lastOtpDispatchedAt[params.purpose] = nowMs;
    const maskedEmail = maskGmailAddress(targetEmail);
    return {
      sent: true,
      channel: 'firebase_email_link',
      maskedEmail,
      targetEmail,
      expiresAt,
      expiresInSeconds: 300,
      maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
      message: `Firebase verification email sent to ${maskedEmail}. Click the sign-in link in your Gmail inbox to continue.`
    };
  } catch (fbErr: unknown) {
    await invalidateActiveOtpChallenge();
    const errMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
    throw new Error(
      `Gmail OTP delivery is not configured (${errMsg}). Configure EmailJS (Service ID, Template ID, Public Key) in Admin Portal → Security & Gmail OTP Settings, or enable Email Link Sign-in in Firebase Auth.`
    );
  }
}

/**
 * Verifies a user-entered 6-digit OTP against the salted SHA-256 challenge hash.
 * Enforces:
 * - 5-minute TTL
 * - Single-use immediate invalidation upon match
 * - Max 3 wrong attempts before permanent challenge invalidation
 */
export async function verifyAdminGmailOtp(params: {
  code: string;
  purpose: AdminOtpPurpose;
  nowMs?: number;
}): Promise<VerifyAdminOtpResult> {
  const nowMs = params.nowMs ?? Date.now();
  const cleanCode = (params.code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter a valid 6-digit numeric OTP code.');
  }

  let challenge = activeOtpChallenge;
  if (!challenge) {
    challenge = await loadChallengeFromFirestore();
    if (challenge) {
      activeOtpChallenge = challenge;
    }
  }

  if (!challenge || challenge.consumed || !challenge.otpHash || !challenge.otpSalt) {
    throw new Error('No active Gmail OTP found or OTP already used. Please request a new 6-digit OTP.');
  }

  if (challenge.purpose !== params.purpose) {
    throw new Error('This OTP challenge is not valid for the requested action. Please request a new OTP.');
  }

  // Enforce 5-minute expiry and immediately invalidate expired challenge
  if (nowMs > challenge.expiresAt) {
    await invalidateActiveOtpChallenge();
    throw new Error('Your 6-digit Gmail OTP has expired (5-minute limit). Please request a new OTP.');
  }

  // Enforce max 3 wrong attempts
  if (challenge.attemptsUsed >= challenge.maxAttempts) {
    await invalidateActiveOtpChallenge();
    throw new Error('Maximum wrong OTP attempts (3) exceeded. Please request a new 6-digit Gmail OTP.');
  }

  const computedHash = await computeOtpHash(
    cleanCode,
    challenge.otpSalt,
    challenge.purpose,
    challenge.targetEmail
  );

  if (!constantTimeEqual(computedHash, challenge.otpHash)) {
    const nextAttempts = challenge.attemptsUsed + 1;
    const exhausted = nextAttempts >= challenge.maxAttempts;
    const updatedRecord: AdminOtpChallengeRecord = {
      ...challenge,
      attemptsUsed: nextAttempts,
      consumed: exhausted,
      otpSalt: exhausted ? '' : challenge.otpSalt,
      otpHash: exhausted ? '' : challenge.otpHash
    };
    activeOtpChallenge = updatedRecord;
    await persistChallengeToFirestore(updatedRecord);

    if (exhausted) {
      throw new Error(
        'Maximum 3 wrong OTP attempts exceeded. This OTP has been invalidated. Please request a new OTP.'
      );
    }

    const remaining = challenge.maxAttempts - nextAttempts;
    throw new Error(
      `Invalid 6-digit Gmail OTP code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  // Match! Immediately invalidate single-use OTP
  const targetEmail = challenge.targetEmail;
  await invalidateActiveOtpChallenge();

  const verificationToken = `gverified-${nowMs}-${generateSalt(16)}`;
  activeVerificationProofs.set(verificationToken, {
    token: verificationToken,
    purpose: params.purpose,
    targetEmail,
    expiresAt: nowMs + VERIFICATION_PROOF_TTL_MS,
    consumed: false
  });

  return {
    verified: true,
    verificationToken,
    targetEmail,
    purpose: params.purpose,
    verifiedAt: nowMs,
    method: 'otp'
  };
}

/**
 * On-demand Mobile SMS OTP dispatch (Admin Login ONLY).
 * Never auto-sends; enforces the shared 60-second cooldown timer.
 * Triggers configured SMS webhook if present, otherwise returns a clean status message without wasting quota.
 */
export async function sendAdminMobileOtp(params?: {
  phoneNumber?: string;
  smsWebhookUrl?: string;
  smsSender?: (phone: string, messageBody: string) => Promise<unknown>;
  skipCooldown?: boolean;
  nowMs?: number;
}): Promise<SendAdminMobileOtpResult> {
  const nowMs = params?.nowMs ?? Date.now();

  if (!params?.skipCooldown) {
    const lastSent = lastOtpDispatchedAt['ADMIN_LOGIN_2FA'] || 0;
    const elapsedSeconds = Math.floor((nowMs - lastSent) / 1000);
    if (lastSent > 0 && elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      throw new Error(`Please wait ${waitSeconds} seconds before requesting another OTP.`);
    }
  }

  let envWebhook = '';
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    envWebhook = (env.VITE_SMS_OTP_WEBHOOK_URL || '').trim();
  } catch {
    envWebhook = '';
  }

  const webhookUrl = (params?.smsWebhookUrl || envWebhook || '').trim();
  const hasCustomSender = Boolean(params?.smsSender || webhookUrl);
  const securityConfig = await getAdminSecurityConfig();
  const targetEmail = (securityConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL).trim().toLowerCase();

  if (!hasCustomSender) {
    // Record cooldown timestamp to guard against accidental repeated clicks
    lastOtpDispatchedAt['ADMIN_LOGIN_2FA'] = nowMs;
    return {
      sent: false,
      channel: 'sms_unconfigured',
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      message:
        'Mobile SMS OTP gateway is not configured on this static host. Click "Send Gmail OTP" or enter your silent Master Backup Code.'
    };
  }

  const otp = generateSecureSixDigitOtp();
  const otpSalt = generateSalt(16);
  const otpHash = await computeOtpHash(otp, otpSalt, 'ADMIN_LOGIN_2FA', targetEmail);
  const expiresAt = nowMs + OTP_VALIDITY_MS;

  const challengeRecord: AdminOtpChallengeRecord = {
    challengeId: `sms-otp-${nowMs}-${generateSalt(4)}`,
    purpose: 'ADMIN_LOGIN_2FA',
    targetEmail,
    otpSalt,
    otpHash,
    expiresAt,
    attemptsUsed: 0,
    maxAttempts: MAX_OTP_WRONG_ATTEMPTS,
    consumed: false,
    deliveryChannel: 'mobile_sms',
    createdAt: new Date(nowMs).toISOString()
  };

  activeOtpChallenge = challengeRecord;
  await persistChallengeToFirestore(challengeRecord);

  try {
    const smsText = `Amul Parlour Admin HQ Login OTP: ${otp} (Valid 5 minutes)`;
    if (params?.smsSender) {
      await params.smsSender(params.phoneNumber || '', smsText);
    } else if (webhookUrl) {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: params?.phoneNumber || '',
          passcode: otp,
          expiresInMinutes: 5
        })
      });
      if (!resp.ok) {
        throw new Error(`SMS gateway returned HTTP ${resp.status}`);
      }
    }
    lastOtpDispatchedAt['ADMIN_LOGIN_2FA'] = nowMs;
    return {
      sent: true,
      channel: 'mobile_sms',
      expiresAt,
      expiresInSeconds: 300,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      message: 'Mobile SMS OTP તમારા રજિસ્ટર્ડ મોબાઇલ પર મોકલવામાં આવ્યો છે (valid 5 minutes).'
    };
  } catch (err: unknown) {
    await invalidateActiveOtpChallenge();
    const msg = err instanceof Error ? err.message : 'SMS gateway error';
    throw new Error(`Failed to send Mobile OTP: ${msg}`);
  }
}

/**
 * Verifies Master Admin HQ Login using EITHER:
 * 1) An active single-use 6-digit OTP sent on-demand (Gmail OTP / Mobile OTP), OR
 * 2) The Admin's configured salted SHA-256 silent Master Backup Code (without sending any OTP).
 *
 * NOTE: Strictly restricted to `ADMIN_LOGIN_2FA`. Never usable for password resets.
 */
export async function verifyAdminLoginCode(params: {
  code: string;
  securityConfigOverride?: AdminSecurityConfig;
  nowMs?: number;
}): Promise<VerifyAdminOtpResult> {
  const nowMs = params.nowMs ?? Date.now();
  const lockStatus = await getAdminLoginLockoutStatus(nowMs);
  if (lockStatus.locked) {
    throw new Error(
      `Admin login is temporarily locked for ${lockStatus.retryAfterMinutes} minute(s) due to 3 consecutive failed attempts.`
    );
  }

  const cleanCode = (params.code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter a valid 6-digit Security PIN or OTP.');
  }

  // Check if 6-digit Security PIN / Master Backup Code is configured and matches
  const secConfig = params.securityConfigOverride || (await getAdminSecurityConfig());
  const matchedPinKind = await matchesStoredAdminSecurityPin(cleanCode, secConfig);
  if (matchedPinKind) {
    await invalidateActiveOtpChallenge();
    const targetEmail = (secConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL).trim().toLowerCase();
    const verificationToken = `mbcode-${nowMs}-${generateSalt(16)}`;
    activeVerificationProofs.set(verificationToken, {
      token: verificationToken,
      purpose: 'ADMIN_LOGIN_2FA',
      targetEmail,
      expiresAt: nowMs + VERIFICATION_PROOF_TTL_MS,
      consumed: false
    });
    return {
      verified: true,
      verificationToken,
      targetEmail,
      purpose: 'ADMIN_LOGIN_2FA',
      verifiedAt: nowMs,
      method: matchedPinKind
    };
  }

  // Otherwise verify against active on-demand OTP challenge
  let challenge = activeOtpChallenge;
  if (!challenge) {
    challenge = await loadChallengeFromFirestore();
    if (challenge) {
      activeOtpChallenge = challenge;
    }
  }

  if (!challenge || challenge.consumed || !challenge.otpHash || !challenge.otpSalt) {
    throw new Error(
      'Invalid Master Backup Code or no active OTP found. Click "Send Gmail OTP" or set your Master Backup Code in Admin Portal.'
    );
  }

  return verifyAdminGmailOtp({
    code: cleanCode,
    purpose: 'ADMIN_LOGIN_2FA',
    nowMs
  });
}

/**
 * Checks whether the current browser URL holds a Firebase Email Authentication callback link.
 */
export function inspectPendingFirebaseEmailLink(href?: string): {
  isLink: boolean;
  purpose?: AdminOtpPurpose;
  email?: string;
} {
  if (typeof window === 'undefined') return { isLink: false };
  const targetHref = href || window.location.href;
  try {
    if (!isSignInWithEmailLink(auth, targetHref)) {
      return { isLink: false };
    }
    const url = new URL(targetHref);
    const paramPurpose = url.searchParams.get('adminEmailOtp') as AdminOtpPurpose | null;
    const rawPending = window.localStorage?.getItem(PENDING_EMAIL_LINK_STORAGE_KEY);
    const parsed = rawPending ? (JSON.parse(rawPending) as { email?: string; purpose?: AdminOtpPurpose }) : {};
    return {
      isLink: true,
      purpose: paramPurpose || parsed.purpose || 'ADMIN_LOGIN_2FA',
      email: parsed.email
    };
  } catch {
    return { isLink: false };
  }
}

/**
 * Completes verification using a Firebase Email Authentication link clicked in Admin Gmail.
 */
export async function completeFirebaseEmailLinkOtp(params: {
  href?: string;
  purpose: AdminOtpPurpose;
  nowMs?: number;
}): Promise<VerifyAdminOtpResult> {
  const nowMs = params.nowMs ?? Date.now();
  const targetHref = params.href || (typeof window !== 'undefined' ? window.location.href : '');
  if (!isSignInWithEmailLink(auth, targetHref)) {
    throw new Error('No valid Firebase email verification link was detected.');
  }

  const securityConfig = await getAdminSecurityConfig();
  const registeredEmail = (securityConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL).trim().toLowerCase();

  let pendingEmail = registeredEmail;
  try {
    const rawPending = typeof window !== 'undefined' ? window.localStorage?.getItem(PENDING_EMAIL_LINK_STORAGE_KEY) : null;
    if (rawPending) {
      const parsed = JSON.parse(rawPending) as { email?: string };
      if (parsed.email && parsed.email.toLowerCase() === registeredEmail) {
        pendingEmail = parsed.email.toLowerCase();
      }
    }
  } catch {
    // use registeredEmail
  }

  const credential = await signInWithEmailLink(auth, pendingEmail, targetHref);
  const signedEmail = (credential.user?.email || '').trim().toLowerCase();
  if (signedEmail !== registeredEmail) {
    throw new Error(`Signed-in email does not match registered Master Admin Gmail.`);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(PENDING_EMAIL_LINK_STORAGE_KEY);
  }
  await invalidateActiveOtpChallenge();

  const verificationToken = `fblink-${nowMs}-${generateSalt(16)}`;
  activeVerificationProofs.set(verificationToken, {
    token: verificationToken,
    purpose: params.purpose,
    targetEmail: registeredEmail,
    expiresAt: nowMs + VERIFICATION_PROOF_TTL_MS,
    consumed: false
  });

  return {
    verified: true,
    verificationToken,
    targetEmail: registeredEmail,
    purpose: params.purpose,
    verifiedAt: nowMs
  };
}

/**
 * Strictly validates and consumes a single-use Gmail OTP verification proof token.
 * Throws if missing, already used, expired, or bound to a different purpose.
 */
export async function consumeAdminVerificationToken(
  token: string,
  expectedPurpose: AdminOtpPurpose,
  nowMs: number = Date.now()
): Promise<{ targetEmail: string }> {
  if (!token || typeof token !== 'string') {
    throw new Error('Valid Gmail OTP verification is required before updating the Admin password.');
  }

  const proof = activeVerificationProofs.get(token);
  if (!proof || proof.consumed) {
    throw new Error('Gmail OTP verification token is invalid or has already been used.');
  }

  if (proof.purpose !== expectedPurpose) {
    throw new Error('Gmail OTP verification token is not authorized for password updates.');
  }

  if (nowMs > proof.expiresAt) {
    proof.consumed = true;
    activeVerificationProofs.delete(token);
    await invalidateActiveOtpChallenge();
    throw new Error('Gmail OTP verification session expired. Please verify a fresh 6-digit OTP.');
  }

  // Immediately consume and invalidate single-use token + any active OTP challenge
  proof.consumed = true;
  activeVerificationProofs.delete(token);
  await invalidateActiveOtpChallenge();

  return { targetEmail: proof.targetEmail };
}

/**
 * Exposes ONLY non-sensitive metadata about the active OTP challenge (never plain-text OTP).
 */
export function getActiveOtpChallengeMeta(): Omit<AdminOtpChallengeRecord, 'otpHash' | 'otpSalt'> | null {
  if (!activeOtpChallenge) return null;
  return {
    challengeId: activeOtpChallenge.challengeId,
    purpose: activeOtpChallenge.purpose,
    targetEmail: activeOtpChallenge.targetEmail,
    expiresAt: activeOtpChallenge.expiresAt,
    attemptsUsed: activeOtpChallenge.attemptsUsed,
    maxAttempts: activeOtpChallenge.maxAttempts,
    consumed: activeOtpChallenge.consumed,
    deliveryChannel: activeOtpChallenge.deliveryChannel,
    createdAt: activeOtpChallenge.createdAt
  };
}

function readLocalLockoutState(): AdminLockoutState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...adminLockoutState };
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_LOCKOUT_STORAGE_KEY);
    if (!raw) return { ...adminLockoutState };
    const parsed = JSON.parse(raw) as Partial<AdminLockoutState>;
    return {
      failedAttempts: Number(parsed.failedAttempts || 0),
      lockedUntil: Number(parsed.lockedUntil || 0),
      lastFailedAttemptAt: Number(parsed.lastFailedAttemptAt || 0),
      lastSecurityAlertAt: Number(parsed.lastSecurityAlertAt || 0)
    };
  } catch {
    return { ...adminLockoutState };
  }
}

async function persistAdminLockoutState(nextState: AdminLockoutState): Promise<void> {
  adminLockoutState = { ...nextState };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ADMIN_LOCKOUT_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // ignore storage quota errors
    }
  }
  try {
    const authed = await ensureAnonymousAuth();
    if (authed === false) return;
    await setDoc(
      doc(db, 'adminSettings', 'security'),
      {
        failedLoginAttempts: nextState.failedAttempts,
        lockedUntil: nextState.lockedUntil,
        lastFailedAttemptAt: nextState.lastFailedAttemptAt,
        lastSecurityAlertAt: nextState.lastSecurityAlertAt
      },
      { merge: true }
    );
  } catch {
    // Non-fatal in offline/test mode; local + in-memory lockout remains active
  }
}

/**
 * Checks whether Master Admin login is currently locked out (30 minutes after 3 consecutive failed attempts).
 */
export async function getAdminLoginLockoutStatus(
  nowMs: number = Date.now()
): Promise<AdminLoginLockoutStatus> {
  const localState = readLocalLockoutState();
  let merged: AdminLockoutState = {
    failedAttempts: Math.max(adminLockoutState.failedAttempts, localState.failedAttempts),
    lockedUntil: Math.max(adminLockoutState.lockedUntil, localState.lockedUntil),
    lastFailedAttemptAt: Math.max(adminLockoutState.lastFailedAttemptAt, localState.lastFailedAttemptAt),
    lastSecurityAlertAt: Math.max(adminLockoutState.lastSecurityAlertAt, localState.lastSecurityAlertAt)
  };

  try {
    const remoteSec = await getAdminSecurityConfig();
    if (typeof remoteSec.lockedUntil === 'number' && remoteSec.lockedUntil > merged.lockedUntil) {
      merged.lockedUntil = remoteSec.lockedUntil;
    }
    if (
      typeof remoteSec.failedLoginAttempts === 'number' &&
      remoteSec.failedLoginAttempts > merged.failedAttempts &&
      (remoteSec.lastFailedAttemptAt || 0) >= merged.lastFailedAttemptAt
    ) {
      merged.failedAttempts = remoteSec.failedLoginAttempts;
    }
    if (
      typeof remoteSec.lastSecurityAlertAt === 'number' &&
      remoteSec.lastSecurityAlertAt > merged.lastSecurityAlertAt
    ) {
      merged.lastSecurityAlertAt = remoteSec.lastSecurityAlertAt;
    }
  } catch {
    // use local merged state
  }

  // Auto-reset expired 30-minute lockout window
  if (merged.lockedUntil > 0 && nowMs >= merged.lockedUntil) {
    merged = {
      failedAttempts: 0,
      lockedUntil: 0,
      lastFailedAttemptAt: 0,
      lastSecurityAlertAt: merged.lastSecurityAlertAt
    };
    await persistAdminLockoutState(merged);
  } else {
    adminLockoutState = { ...merged };
  }

  const locked = merged.lockedUntil > nowMs;
  const retryAfterSeconds = locked ? Math.max(1, Math.ceil((merged.lockedUntil - nowMs) / 1000)) : 0;
  const retryAfterMinutes = locked ? Math.max(1, Math.ceil(retryAfterSeconds / 60)) : 0;
  const remainingAttempts = locked ? 0 : Math.max(0, ADMIN_LOCKOUT_MAX_ATTEMPTS - merged.failedAttempts);

  return {
    locked,
    failedAttempts: merged.failedAttempts,
    remainingAttempts,
    lockedUntil: merged.lockedUntil,
    retryAfterSeconds,
    retryAfterMinutes
  };
}

/**
 * Automatically sends a Security Alert email to the Master Admin's registered Gmail (`mekintik@gmail.com`)
 * via EmailJS when 3 consecutive failed Admin login or OTP attempts trigger a 30-minute lockout.
 */
export async function sendAdminSecurityAlertEmail(params?: {
  username?: string;
  reason?: string;
  emailConfigOverride?: AdminEmailJsConfig;
  emailSender?: EmailJsSendFn;
  nowMs?: number;
}): Promise<{ alertSent: boolean; targetEmail: string }> {
  const nowMs = params?.nowMs ?? Date.now();
  const securityConfig = await getAdminSecurityConfig();
  const emailConfig = params?.emailConfigOverride || (await getAdminEmailConfig());
  const targetEmail = (securityConfig.adminEmail || emailConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL)
    .trim()
    .toLowerCase();

  if (!isValidEmailAddress(targetEmail) || !isEmailJsConfigured(emailConfig)) {
    return { alertSent: false, targetEmail };
  }

  const sender = params?.emailSender || defaultEmailJsSender;
  const occurredAt = new Date(nowMs).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const reasonText = params?.reason || '3 consecutive failed Admin login/OTP attempts';
  const usernameText = (params?.username || 'admin').trim();

  try {
    await sender(
      emailConfig.serviceId,
      emailConfig.templateId,
      {
        email: targetEmail,
        passcode: 'SECURITY ALERT',
        time: `LOCKED FOR 30 MINUTES (${occurredAt}) — ${reasonText} [Account: ${usernameText}]`,
        to_email: targetEmail,
        user_email: targetEmail,
        to_name: 'Master Admin',
        from_name: emailConfig.senderName || 'Amul Parlour Admin Security',
        app_name: 'Amul Parlour POS Admin Security Alert',
        purpose_label: 'CRITICAL SECURITY ALERT: 3 Failed Admin Login Attempts (30-Min Lockout)'
      },
      emailConfig.publicKey
    );
    return { alertSent: true, targetEmail };
  } catch {
    return { alertSent: false, targetEmail };
  }
}

/**
 * Records a failed Admin login/OTP/Backup Code attempt.
 * Triggers a strict 30-minute lockout + EmailJS Security Alert after 3 consecutive failures.
 */
export async function recordAdminLoginFailure(params?: {
  username?: string;
  reason?: string;
  emailConfigOverride?: AdminEmailJsConfig;
  emailSender?: EmailJsSendFn;
  nowMs?: number;
}): Promise<RecordAdminLoginFailureResult> {
  const nowMs = params?.nowMs ?? Date.now();
  const current = await getAdminLoginLockoutStatus(nowMs);

  // Already locked out: keep active 30-minute lockout without spamming alert emails
  if (current.locked) {
    return {
      ...current,
      alertSent: false,
      message: `Admin login is locked for ${current.retryAfterMinutes} minute(s) due to 3 consecutive failed attempts. Security alert already dispatched.`
    };
  }

  const nextFailures = current.failedAttempts + 1;
  const triggerLockout = nextFailures >= ADMIN_LOCKOUT_MAX_ATTEMPTS;
  const lockedUntil = triggerLockout ? nowMs + ADMIN_LOCKOUT_DURATION_MS : 0;

  let alertSent = false;
  let lastSecurityAlertAt = adminLockoutState.lastSecurityAlertAt || 0;

  if (triggerLockout) {
    const alertResult = await sendAdminSecurityAlertEmail({
      username: params?.username,
      reason: params?.reason,
      emailConfigOverride: params?.emailConfigOverride,
      emailSender: params?.emailSender,
      nowMs
    });
    alertSent = alertResult.alertSent;
    if (alertSent) {
      lastSecurityAlertAt = nowMs;
    }
  }

  await persistAdminLockoutState({
    failedAttempts: nextFailures,
    lockedUntil,
    lastFailedAttemptAt: nowMs,
    lastSecurityAlertAt
  });

  if (triggerLockout) {
    return {
      locked: true,
      failedAttempts: nextFailures,
      remainingAttempts: 0,
      lockedUntil,
      retryAfterSeconds: Math.ceil(ADMIN_LOCKOUT_DURATION_MS / 1000),
      retryAfterMinutes: 30,
      alertSent,
      message:
        'Too many failed attempts (3/3). Admin login is locked for 30 minutes and a security alert email has been sent to the registered Admin Gmail.'
    };
  }

  const remainingAttempts = ADMIN_LOCKOUT_MAX_ATTEMPTS - nextFailures;
  return {
    locked: false,
    failedAttempts: nextFailures,
    remainingAttempts,
    lockedUntil: 0,
    retryAfterSeconds: 0,
    retryAfterMinutes: 0,
    alertSent: false,
    message: `Invalid Admin credentials or verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before 30-minute lockout.`
  };
}

/**
 * Clears brute-force failure counter & lockout after successful Admin authentication.
 */
export async function clearAdminLoginFailures(): Promise<void> {
  await persistAdminLockoutState({
    failedAttempts: 0,
    lockedUntil: 0,
    lastFailedAttemptAt: 0,
    lastSecurityAlertAt: adminLockoutState.lastSecurityAlertAt || 0
  });
}

/**
 * Atomically checks on app load whether a new calendar month has started (`lastReminderMonth !== currentYYYYMM`)
 * and dispatches at most ONE EmailJS reset reminder per month to `mekintik@gmail.com`.
 */
export async function checkAndSendMonthlyAdminResetReminder(params?: {
  securityConfigOverride?: AdminSecurityConfig;
  emailConfigOverride?: AdminEmailJsConfig;
  emailSender?: EmailJsSendFn;
  nowMs?: number;
}): Promise<MonthlyReminderResult> {
  const nowMs = params?.nowMs ?? Date.now();
  const currentMonth = getCurrentYearMonth(nowMs);

  // Guard concurrent invocations when called without test overrides
  if (!params?.securityConfigOverride && !params?.emailSender && inFlightMonthlyReminderPromise) {
    return inFlightMonthlyReminderPromise;
  }

  const runCheck = async (): Promise<MonthlyReminderResult> => {
    if (inMemoryMonthlyReminderMonth === currentMonth) {
      return { checked: true, sent: false, currentMonth };
    }

    const emailConfig = params?.emailConfigOverride || (await getAdminEmailConfig());
    const hasRealFirestore = Boolean(db && typeof (db as { app?: unknown }).app === 'object');
    let shouldSend = false;
    let targetEmail = (emailConfig.adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL).trim().toLowerCase();

    if (params?.securityConfigOverride) {
      const override = params.securityConfigOverride;
      targetEmail = (override.adminEmail || targetEmail).trim().toLowerCase();
      shouldSend =
        (override.lastReminderMonth || '') !== currentMonth &&
        (override.lastResetMonth || '') !== currentMonth;
    } else if (hasRealFirestore) {
      try {
        await authReady;
        const secRef = doc(db, 'adminSettings', 'security');
        const txResult = await runTransaction(db, async (tx) => {
          const snap = await tx.get(secRef);
          const data = snap.exists() ? (snap.data() as Partial<AdminSecurityConfig>) : {};
          const resolvedEmail =
            data.adminEmail && isValidEmailAddress(data.adminEmail)
              ? data.adminEmail.trim().toLowerCase()
              : DEFAULT_ADMIN_SECURITY_EMAIL;

          if (data.lastReminderMonth === currentMonth || data.lastResetMonth === currentMonth) {
            return { shouldSend: false, targetEmail: resolvedEmail };
          }

          tx.set(
            secRef,
            {
              adminEmail: resolvedEmail,
              lastReminderMonth: currentMonth,
              updatedAt: new Date(nowMs).toISOString(),
              updatedBy: 'Monthly Security Scheduler'
            },
            { merge: true }
          );

          return { shouldSend: true, targetEmail: resolvedEmail };
        });

        shouldSend = txResult.shouldSend;
        targetEmail = txResult.targetEmail;
      } catch {
        // Fallback safely if offline or permissions prevent transaction
        shouldSend = false;
      }
    } else {
      const remoteSec = await getAdminSecurityConfig();
      targetEmail = (remoteSec.adminEmail || targetEmail).trim().toLowerCase();
      shouldSend =
        (remoteSec.lastReminderMonth || '') !== currentMonth &&
        (remoteSec.lastResetMonth || '') !== currentMonth;
    }

    if (!shouldSend) {
      inMemoryMonthlyReminderMonth = currentMonth;
      return { checked: true, sent: false, currentMonth, targetEmail };
    }

    if (!isValidEmailAddress(targetEmail) || !isEmailJsConfigured(emailConfig)) {
      return { checked: true, sent: false, currentMonth, targetEmail };
    }

    const sender = params?.emailSender || defaultEmailJsSender;
    try {
      await sender(
        emailConfig.serviceId,
        emailConfig.templateId,
        {
          email: targetEmail,
          passcode: 'RESET-DUE',
          time: MONTHLY_RESET_REMINDER_MESSAGE,
          to_email: targetEmail,
          user_email: targetEmail,
          to_name: 'Master Admin',
          from_name: emailConfig.senderName || 'Amul Parlour Admin Security',
          app_name: 'Amul Parlour POS Admin Security',
          purpose_label: '1st of Month Mandatory Admin Password & 6-Digit PIN Reset Reminder'
        },
        emailConfig.publicKey
      );

      inMemoryMonthlyReminderMonth = currentMonth;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(MONTHLY_REMINDER_LOCAL_KEY, currentMonth);
        } catch {
          // ignore
        }
      }

      return { checked: true, sent: true, currentMonth, targetEmail };
    } catch {
      return { checked: true, sent: false, currentMonth, targetEmail };
    }
  };

  if (!params?.securityConfigOverride && !params?.emailSender) {
    inFlightMonthlyReminderPromise = runCheck().finally(() => {
      inFlightMonthlyReminderPromise = null;
    });
    return inFlightMonthlyReminderPromise;
  }

  return runCheck();
}

/**
 * Resets module-level OTP, lockout, and monthly reminder state for isolated unit tests.
 */
export function resetAdminOtpTestState(): void {
  activeOtpChallenge = null;
  lastOtpDispatchedAt = {};
  activeVerificationProofs.clear();
  adminLockoutState = {
    failedAttempts: 0,
    lockedUntil: 0,
    lastFailedAttemptAt: 0,
    lastSecurityAlertAt: 0
  };
  inMemoryMonthlyReminderMonth = '';
  inFlightMonthlyReminderPromise = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(ADMIN_LOCKOUT_STORAGE_KEY);
      window.localStorage.removeItem(MONTHLY_REMINDER_LOCAL_KEY);
    } catch {
      // ignore
    }
  }
}
