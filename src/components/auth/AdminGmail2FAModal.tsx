/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master Admin Real-Time Gmail 6-Digit OTP 2FA Modal
 * Security Rules:
 * - Zero visible OTP hints, banners, or console logs.
 * - Masked password-style OTP input with optional eye toggle.
 * - 5-minute TTL, single-use invalidation, and max 3 wrong-attempt lockout.
 * - Real delivery via EmailJS (`adminSettings/emailConfig`) or Firebase Email Link Auth.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  clearAdminLoginFailures,
  completeFirebaseEmailLinkOtp,
  DEFAULT_ADMIN_SECURITY_EMAIL,
  inspectPendingFirebaseEmailLink,
  maskGmailAddress,
  OTP_RESEND_COOLDOWN_SECONDS,
  recordAdminLoginFailure,
  sendAdminGmailOtp,
  verifyAdminLoginCode
} from '../../storage/adminEmailOtp.ts';

export interface AdminGmail2FAModalProps {
  isOpen: boolean;
  adminEmail?: string;
  onVerified: (verificationToken?: string) => void;
  onCancel: () => void;
}

function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AdminGmail2FAModal: React.FC<AdminGmail2FAModalProps> = ({
  isOpen,
  adminEmail,
  onVerified,
  onCancel
}) => {
  const [otpCode, setOtpCode] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<'emailjs' | 'firebase_email_link'>('emailjs');
  const [maskedTargetEmail, setMaskedTargetEmail] = useState<string>(() =>
    maskGmailAddress(adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL)
  );
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [remainingAttempts, setRemainingAttempts] = useState<number>(3);

  useEffect(() => {
    if (!isOpen) {
      setOtpCode('');
      setShowOtp(false);
      setError(null);
      setStatusMsg(null);
      setResendCooldown(0);
      setExpiresAt(0);
      setSecondsRemaining(300);
      setRemainingAttempts(3);
      return;
    }

    let isMounted = true;

    const checkReturningLinkOnly = async () => {
      // NEVER auto-send OTP on open; only handle returning Firebase Email Auth link if present
      setMaskedTargetEmail(maskGmailAddress(adminEmail || DEFAULT_ADMIN_SECURITY_EMAIL));
      const linkInfo = inspectPendingFirebaseEmailLink();
      if (linkInfo.isLink && linkInfo.purpose === 'ADMIN_LOGIN_2FA') {
        setLoading(true);
        try {
          const verified = await completeFirebaseEmailLinkOtp({ purpose: 'ADMIN_LOGIN_2FA' });
          if (isMounted) {
            onVerified(verified.verificationToken);
          }
          return;
        } catch (err: unknown) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Email link verification failed.');
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      }
    };

    checkReturningLinkOnly();

    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiresAt((currentExp) => {
        if (currentExp > 0) {
          setSecondsRemaining(Math.max(0, Math.ceil((currentExp - Date.now()) / 1000)));
        }
        return currentExp;
      });
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isOpen, adminEmail, onVerified]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Please enter a valid 6-digit numeric OTP code.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyAdminLoginCode({
        code: cleanCode
      });
      await clearAdminLoginFailures();
      setOtpCode('');
      onVerified(result.verificationToken);
    } catch (err: unknown) {
      setOtpCode('');
      const msg = err instanceof Error ? err.message : 'Invalid Gmail OTP code.';
      const failure = await recordAdminLoginFailure({ reason: msg });
      setRemainingAttempts(failure.remainingAttempts);
      setError(failure.locked ? failure.message : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || sending) return;
    setOtpCode('');
    setError(null);
    setSending(true);

    try {
      const res = await sendAdminGmailOtp({ purpose: 'ADMIN_LOGIN_2FA' });
      setDeliveryChannel(res.channel === 'firebase_email_link' ? 'firebase_email_link' : 'emailjs');
      setMaskedTargetEmail(res.maskedEmail);
      setExpiresAt(res.expiresAt);
      setSecondsRemaining(res.expiresInSeconds);
      setRemainingAttempts(res.maxAttempts);
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStatusMsg(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend Gmail OTP.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none">
      <div className="bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 shadow-2xl relative text-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition cursor-pointer"
          title="Cancel"
          aria-label="Close 2FA modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Shield Motif */}
        <div className="relative mb-3 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#E31837]/25 via-amber-400/20 to-[#005A9C]/25 rounded-2xl blur-sm animate-pulse" />
            <div className="relative w-14 h-14 bg-gradient-to-br from-red-600 via-[#E31837] to-red-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md border border-white/20">
              <ShieldCheck className="w-7 h-7 text-white drop-shadow-xs" />
            </div>
          </div>
        </div>

        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
          Admin Gmail 2FA Verification
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
          {sending
            ? 'Dispatching 6-digit OTP to registered Admin Gmail...'
            : 'Click "Send Gmail OTP" below, or enter your silent Master Backup Code directly:'}
        </p>

        {/* Masked Gmail Target Badge */}
        <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 font-mono font-bold text-xs px-3 py-1.5 rounded-xl my-3">
          <Mail className="w-3.5 h-3.5 text-[#005A9C] dark:text-blue-400 shrink-0" />
          <span>{maskedTargetEmail}</span>
        </div>

        {/* Expiry & Attempts Security Telemetry Bar */}
        {expiresAt > 0 && deliveryChannel === 'emailjs' && (
          <div className="mb-3 flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-neutral-800/70 border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300">
            <span className="flex items-center gap-1 font-mono font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {secondsRemaining > 0 ? `Expires in ${formatCountdown(secondsRemaining)}` : 'OTP Expired'}
            </span>
            <span className={`font-semibold ${remainingAttempts <= 1 ? 'text-rose-600' : 'text-slate-600 dark:text-neutral-300'}`}>
              {remainingAttempts} / 3 attempts left
            </span>
          </div>
        )}

        {/* Delivery Status Notice */}
        {statusMsg && !error && (
          <div className="mb-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-[11px] rounded-xl flex items-start gap-2 text-left">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11px] rounded-xl flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Masked OTP Input Form */}
        {deliveryChannel === 'emailjs' ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4" autoComplete="off">
            <div className="relative">
              <input
                type={showOtp ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                aria-label="6-digit Gmail OTP code"
                className="w-full text-center text-xl tracking-[0.45em] font-mono font-bold py-3 pl-10 pr-10 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 rounded-2xl text-slate-900 dark:text-white focus:outline-hidden focus:border-red-600 focus:ring-2 focus:ring-red-500/20 transition"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowOtp((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 cursor-pointer p-1"
                aria-label={showOtp ? 'Hide OTP digits' : 'Show OTP digits'}
                title={showOtp ? 'Mask OTP' : 'Show OTP'}
              >
                {showOtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || sending || otpCode.length !== 6 || secondsRemaining === 0 || remainingAttempts === 0}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-black hover:bg-neutral-900 active:bg-neutral-950 border border-neutral-800 shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Gmail OTP...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Verify &amp; Unlock Admin HQ</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl text-xs text-blue-900 dark:text-blue-200 space-y-2 text-left">
            <p className="font-bold flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Check your Gmail Inbox</span>
            </p>
            <p className="text-[11px] leading-relaxed">
              Open the Firebase verification email sent to <strong>{maskedTargetEmail}</strong> and click the sign-in link to unlock Admin HQ automatically.
            </p>
          </div>
        )}

        {/* Resend / Back Footer */}
        <div className="mt-4 text-[11px] text-slate-500 dark:text-neutral-400 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="hover:underline text-slate-600 dark:text-neutral-400 cursor-pointer"
          >
            Back to Login
          </button>

          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendCooldown > 0 || loading || sending}
            className="text-blue-600 dark:text-blue-400 font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${sending ? 'animate-spin' : ''}`} />
            <span>
              {sending
                ? 'Sending...'
                : resendCooldown > 0
                  ? `Cooldown (${resendCooldown}s)`
                  : 'Send Gmail OTP'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
