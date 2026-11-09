import { describe, it, expect, beforeEach } from 'vitest';
import { 
  sanitizeText, 
  sanitizeBarcode, 
  sanitizePhone, 
  validatePhone, 
  sanitizeNumber, 
  sanitizeUsername, 
  sanitizeErrorMessage,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit
} from '../src/utils/sanitizer.ts';

describe('Security Enhancements & Sanitizer Utilities', () => {
  beforeEach(() => {
    clearRateLimit('test_user_rate');
    clearRateLimit('test_otp_rate');
  });

  describe('1. Input Sanitization & Anti-XSS', () => {
    it('strips script tags and executable vectors', () => {
      const malicious = '<script>alert("hacked")</script>Amul Milk 500ml';
      const clean = sanitizeText(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('Amul Milk 500ml');
    });

    it('escapes dangerous HTML characters & control characters', () => {
      const dangerous = '<img src=x onerror=alert(1)> & "Amul Cheese"';
      const clean = sanitizeText(dangerous);
      expect(clean).not.toContain('<img');
      expect(clean).toContain('&amp;');
      expect(clean).toContain('&quot;Amul Cheese&quot;');
    });

    it('enforces maxLength truncation', () => {
      const longInput = 'A'.repeat(500);
      const sanitized = sanitizeText(longInput, 50);
      expect(sanitized.length).toBe(50);
    });

    it('sanitizes barcode to alphanumeric, hyphens, and underscores only', () => {
      const dirtyBarcode = '8901262 <script> 01234-A_B';
      const clean = sanitizeBarcode(dirtyBarcode);
      expect(clean).toBe('890126201234-A_B');
    });

    it('validates and sanitizes phone numbers strictly', () => {
      expect(validatePhone('+919173598234')).toBe(true);
      expect(validatePhone('9173598234')).toBe(true);
      expect(validatePhone('123')).toBe(false); // too short
      expect(validatePhone('invalid-phone-string')).toBe(false);
      expect(sanitizePhone('+91 91735-98234')).toBe('+919173598234');
    });

    it('sanitizes numbers safely and prevents NaN / Infinity / negative exploits', () => {
      expect(sanitizeNumber('125.50')).toBe(125.5);
      expect(sanitizeNumber(-50, 0, 1000)).toBe(0);
      expect(sanitizeNumber('invalid', 0, 100, 10)).toBe(10);
      expect(sanitizeNumber(Infinity, 0, 100, 0)).toBe(0);
    });

    it('sanitizes usernames to safe lowercase chars', () => {
      expect(sanitizeUsername('Admin_User.01 ')).toBe('admin_user.01');
      expect(sanitizeUsername('<script>admin</script>')).toBe('scriptadminscript');
    });
  });

  describe('2. Rate Limiting & Brute-force Prevention', () => {
    it('allows attempts below max limit', () => {
      const key = 'test_user_rate';
      const status1 = checkRateLimit(key, { maxAttempts: 3, windowMs: 60000, lockoutDurationMs: 60000 });
      expect(status1.allowed).toBe(true);
      expect(status1.remainingAttempts).toBe(3);

      recordFailedAttempt(key, { maxAttempts: 3, windowMs: 60000, lockoutDurationMs: 60000 });
      const status2 = checkRateLimit(key, { maxAttempts: 3, windowMs: 60000, lockoutDurationMs: 60000 });
      expect(status2.allowed).toBe(true);
      expect(status2.remainingAttempts).toBe(2);
    });

    it('locks out when max attempts exceeded', () => {
      const key = 'test_user_rate';
      const cfg = { maxAttempts: 3, windowMs: 60000, lockoutDurationMs: 60000 };

      recordFailedAttempt(key, cfg);
      recordFailedAttempt(key, cfg);
      const res = recordFailedAttempt(key, cfg);

      expect(res.locked).toBe(true);
      expect(res.retryAfterSeconds).toBeGreaterThan(0);

      const status = checkRateLimit(key, cfg);
      expect(status.allowed).toBe(false);
      expect(status.remainingAttempts).toBe(0);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('clears rate limit on successful authentication', () => {
      const key = 'test_user_rate';
      const cfg = { maxAttempts: 3, windowMs: 60000, lockoutDurationMs: 60000 };

      recordFailedAttempt(key, cfg);
      recordFailedAttempt(key, cfg);
      clearRateLimit(key);

      const status = checkRateLimit(key, cfg);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(3);
    });
  });

  describe('3. Information Disclosure & Error Sanitization', () => {
    it('masks internal database / schema details in user-facing error messages', () => {
      const internalErr = 'Internal Firestore database connection timeout at query [where shopId == x]';
      const safe = sanitizeErrorMessage(internalErr);
      expect(safe).toBe('An unexpected error occurred. Please try again.');
      expect(safe).not.toContain('Firestore');
      expect(safe).not.toContain('query');
    });

    it('allows safe, user-friendly authentication errors to pass through sanitized', () => {
      const userErr = 'Invalid password. Please check your credentials or contact Amul Administrator.';
      const safe = sanitizeErrorMessage(userErr);
      expect(safe).toBe('Invalid password. Please check your credentials or contact Amul Administrator.');
    });
  });
});
