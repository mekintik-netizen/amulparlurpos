/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Input Sanitization, Validation & Rate Limiting Utility
 * Protects against XSS, NoSQL/SQL Injection, Malicious script execution,
 * and Brute-force attacks across POS modules.
 */

// HTML entity escaping mapping
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;'
};

/**
 * Strips script tags, HTML tags, control characters, and escapes dangerous entities.
 * Truncates input to maxLength to prevent memory/buffer exploitation.
 */
export function sanitizeText(input: unknown, maxLength = 250): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  // Remove null bytes and dangerous invisible control characters (preserve common whitespace)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip <script ...>...</script> tags entirely
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Strip all standard HTML tags
  str = str.replace(/<[^>]*>?/gm, '');

  // Strip javascript: pseudo-protocols
  str = str.replace(/javascript:/gi, '');

  // Escape special HTML chars to neutralize any residual entity tricks
  str = str.replace(/[&<>"'`/]/g, (char) => HTML_ESCAPE_MAP[char] || char);

  // Trim and enforce length bound
  return str.trim().slice(0, maxLength);
}

/**
 * Validates and sanitizes barcodes or SKU codes.
 * Allows only alphanumeric characters, dashes, and underscores.
 */
export function sanitizeBarcode(barcode: unknown, maxLength = 32): string {
  if (!barcode) return '';
  // Strip tags first if any markup was pasted into barcode input
  let str = String(barcode).replace(/<[^>]*>?/gm, '');
  const clean = str.replace(/[^0-9A-Za-z_-]/g, '').trim();
  return clean.slice(0, maxLength);
}

/**
 * Sanitizes phone numbers, allowing only digits and standard international '+' prefix.
 */
export function sanitizePhone(phone: unknown): string {
  if (!phone) return '';
  const str = String(phone).trim();
  const hasPlus = str.startsWith('+');
  const digits = str.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Validates whether a phone number conforms to Indian (+91 or 10-digit) or standard phone formats.
 */
export function validatePhone(phone: unknown): boolean {
  if (!phone) return false;
  const cleaned = sanitizePhone(phone);
  const digitsOnly = cleaned.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Sanitizes numeric input safely, rejecting NaN and infinite numbers,
 * and clamping between min and max bounds.
 */
export function sanitizeNumber(value: unknown, min = 0, max = 999999999, defaultValue = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * Validates alphanumeric usernames/handles.
 * Permitted: letters, numbers, dot, underscore, hyphen.
 */
export function sanitizeUsername(username: unknown): string {
  if (!username) return '';
  return String(username).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 50);
}

/**
 * Generic safe error formatter: Prevents internal schema disclosure, stack traces,
 * and raw database query errors from leaking to users.
 */
export function sanitizeErrorMessage(err: unknown, fallbackMessage = 'An unexpected error occurred. Please try again.'): string {
  if (!err) return fallbackMessage;

  const rawMessage = typeof err === 'string' 
    ? err 
    : (err as any)?.message || String(err);

  // Check for sensitive database / network internal tokens
  const sensitivePatterns = [
    /quota exceeded/i,
    /internal/i,
    /firestore/i,
    /database/i,
    /stack trace/i,
    /undefined is not/i,
    /null is not/i,
    /eval at/i,
    /object Object/i
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(rawMessage)) {
      return fallbackMessage;
    }
  }

  // Strip HTML / code markers from user-facing error strings
  return sanitizeText(rawMessage, 150);
}

/**
 * ============================================================
 * Rate Limiter (Token / Attempt Window Guard)
 * Protects login, OTP requests, and sensitive endpoints against brute-force attacks.
 * ============================================================
 */
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number; // Unix timestamp
  firstAttemptAt: number;
}

const rateLimitRegistry = new Map<string, RateLimitRecord>();

export interface RateLimitConfig {
  maxAttempts: number;       // e.g. 5 attempts
  windowMs: number;          // e.g. 5 minutes (300,000 ms)
  lockoutDurationMs: number; // e.g. 5 minutes lockout
}

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 5 * 60 * 1000,
  lockoutDurationMs: 5 * 60 * 1000
};

/**
 * Checks if a key (e.g. username, IP, phone, or 'admin_login') is currently rate-limited.
 * Returns { allowed: boolean, remainingAttempts: number, retryAfterSeconds: number }
 */
export function checkRateLimit(key: string, config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitRegistry.get(key);

  if (!record) {
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts,
      retryAfterSeconds: 0
    };
  }

  // Check if locked out
  if (record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds
    };
  }

  // Check if window expired
  if (now - record.firstAttemptAt > config.windowMs) {
    rateLimitRegistry.delete(key);
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts,
      retryAfterSeconds: 0
    };
  }

  const remaining = Math.max(0, config.maxAttempts - record.attempts);
  return {
    allowed: remaining > 0,
    remainingAttempts: remaining,
    retryAfterSeconds: 0
  };
}

/**
 * Registers a failed attempt for the given key.
 * Triggers a lockout if maxAttempts is exceeded.
 */
export function recordFailedAttempt(key: string, config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG): {
  locked: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let record = rateLimitRegistry.get(key);

  if (!record || now - record.firstAttemptAt > config.windowMs) {
    record = {
      attempts: 1,
      lockedUntil: 0,
      firstAttemptAt: now
    };
    rateLimitRegistry.set(key, record);
    return { locked: false, retryAfterSeconds: 0 };
  }

  record.attempts += 1;

  if (record.attempts >= config.maxAttempts) {
    record.lockedUntil = now + config.lockoutDurationMs;
    const retryAfterSeconds = Math.ceil(config.lockoutDurationMs / 1000);
    return { locked: true, retryAfterSeconds };
  }

  return { locked: false, retryAfterSeconds: 0 };
}

/**
 * Clears rate limiting for a key upon successful authentication.
 */
export function clearRateLimit(key: string): void {
  rateLimitRegistry.delete(key);
}
