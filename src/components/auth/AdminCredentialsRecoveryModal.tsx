/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master Admin Credentials Recovery Modal (Real Gmail 6-Digit OTP Verification)
 * Security Workflow:
 * 1. Step 1 (GMAIL_OTP): Generates CSPRNG 6-digit OTP (5-min expiry, single-use, max 3 wrong attempts),
 *    stores only salted SHA-256 hash, and delivers real email to Admin Gmail (`mekintik@gmail.com`
 *    or configured `adminSettings/security`). Masked password input with eye toggle; ZERO visible OTP hints.
 * 2. Step 2 (RESET_PASSWORD): Only unlocked with a single-use cryptographic `verificationToken` from Step 1.
 *    Reveals current Admin Username and updates password in Firestore `adminSettings/authConfig` & IndexedDB.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react';
import {
  completeFirebaseEmailLinkOtp,
  DEFAULT_ADMIN_SECURITY_EMAIL,
  inspectPendingFirebaseEmailLink,
  maskGmailAddress,
  OTP_RESEND_COOLDOWN_SECONDS,
  sendAdminGmailOtp,
  verifyAdminGmailOtp
} from '../../storage/adminEmailOtp.ts';
import { getMasterAdminProfile, resetAdminPasswordViaTwoFactor } from '../../storage/auth.ts';

interface AdminCredentialsRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (adminUsername: string, message: string) => void;
}

type RecoveryStep = 'GMAIL_OTP' | 'RESET_PASSWORD' | 'COMPLETED';

function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AdminCredentialsRecoveryModal: React.FC<AdminCredentialsRecoveryModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [currentStep, setCurrentStep] = useState<RecoveryStep>('GMAIL_OTP');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [targetAdminEmail, setTargetAdminEmail] = useState(DEFAULT_ADMIN_SECURITY_EMAIL);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Step 1: Gmail OTP state
  const [otpCode, setOtpCode] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [deliveryChannel, setDeliveryChannel] = useState<'emailjs' | 'firebase_email_link'>('emailjs');
  const [resendCooldown, setResendCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [gmailVerified, setGmailVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  // Step 2: Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);

  // Reset state & dispatch real 6-digit Gmail OTP on open
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('GMAIL_OTP');
      setOtpCode('');
      setShowOtp(false);
      setError(null);
      setSuccessNotice(null);
      setGmailVerified(false);
      setVerificationToken(null);
      setNewPassword('');
      setConfirmPassword('');
      setExpiresAt(0);
      setSecondsRemaining(300);
      setRemainingAttempts(3);
      return;
    }

    let isMounted = true;

    const initializeRecovery = async () => {
      try {
        const profile = await getMasterAdminProfile();
        if (isMounted) {
          setAdminUsername(profile.username || 'admin');
          setTargetAdminEmail(profile.email || DEFAULT_ADMIN_SECURITY_EMAIL);
        }
      } catch {
        // use defaults
      }

      // Check if user returned via Firebase Email Link callback in Gmail
      const linkInfo = inspectPendingFirebaseEmailLink();
      if (linkInfo.isLink && linkInfo.purpose === 'ADMIN_PASSWORD_RESET') {
        setLoading(true);
        try {
          const verified = await completeFirebaseEmailLinkOtp({ purpose: 'ADMIN_PASSWORD_RESET' });
          if (isMounted) {
            setGmailVerified(true);
            setVerificationToken(verified.verificationToken);
            setSuccessNotice(`Verified Admin Gmail (${maskGmailAddress(verified.targetEmail)}). Set your new password below.`);
            setCurrentStep('RESET_PASSWORD');
          }
          return;
        } catch (err: unknown) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Firebase email link verification failed.');
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      }

      setSendingOtp(true);
      setError(null);
      try {
        const res = await sendAdminGmailOtp({ purpose: 'ADMIN_PASSWORD_RESET' });
        if (!isMounted) return;
        setDeliveryChannel(res.channel);
        setTargetAdminEmail(res.targetEmail);
        setExpiresAt(res.expiresAt);
        setSecondsRemaining(res.expiresInSeconds);
        setRemainingAttempts(res.maxAttempts);
        setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
        setSuccessNotice(res.message);
      } catch (err: unknown) {
        if (!isMounted) return;
        setResendCooldown(0);
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to dispatch Gmail OTP. Please check EmailJS settings.'
        );
      } finally {
        if (isMounted) setSendingOtp(false);
      }
    };

    initializeRecovery();

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
  }, [isOpen]);

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
      const result = await verifyAdminGmailOtp({
        code: cleanCode,
        purpose: 'ADMIN_PASSWORD_RESET'
      });

      setOtpCode('');
      setGmailVerified(true);
      setVerificationToken(result.verificationToken);
      setSuccessNotice('Gmail OTP verified! Set a new Master Admin password below.');
      setCurrentStep('RESET_PASSWORD');
    } catch (err: unknown) {
      setOtpCode('');
      const msg = err instanceof Error ? err.message : 'Invalid Gmail OTP verification code.';
      if (msg.includes('2 attempts remaining')) setRemainingAttempts(2);
      else if (msg.includes('1 attempt remaining')) setRemainingAttempts(1);
      else if (msg.includes('Maximum 3 wrong') || msg.includes('Maximum wrong')) setRemainingAttempts(0);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || sendingOtp) return;
    setOtpCode('');
    setError(null);
    setSendingOtp(true);

    try {
      const res = await sendAdminGmailOtp({ purpose: 'ADMIN_PASSWORD_RESET' });
      setDeliveryChannel(res.channel);
      setTargetAdminEmail(res.targetEmail);
      setExpiresAt(res.expiresAt);
      setSecondsRemaining(res.expiresInSeconds);
      setRemainingAttempts(res.maxAttempts);
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setSuccessNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend Gmail OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!gmailVerified || !verificationToken) {
      setCurrentStep('GMAIL_OTP');
      setError('Valid Gmail OTP verification is required before changing the Admin password.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);
    try {
      const result = await resetAdminPasswordViaTwoFactor(newPassword, verificationToken);
      setVerificationToken(null);
      setGmailVerified(false);
      setCurrentStep('COMPLETED');
      setTimeout(() => {
        onSuccess(
          result.username,
          'Admin credentials successfully updated! You can now log in with your new password.'
        );
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update admin password.';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('already been used')) {
        setVerificationToken(null);
        setGmailVerified(false);
        setCurrentStep('GMAIL_OTP');
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyUsernameToClipboard = () => {
    navigator.clipboard.writeText(adminUsername);
    setCopiedUsername(true);
    setTimeout(() => setCopiedUsername(false), 2000);
  };

  if (!isOpen) return null;

  const maskedEmail = maskGmailAddress(targetAdminEmail);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden relative">
        {/* Header Bar */}
        <div className="bg-[#003870] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
              <KeyRound className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm tracking-tight text-white">
                  Admin Credentials Recovery
                </h3>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-sm">
                  Gmail OTP
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Amul Headquarters Master Account Access
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
            title="Cancel and close recovery modal"
            aria-label="Close recovery modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-slate-100 dark:bg-neutral-900 px-5 py-3 border-b border-slate-200 dark:border-neutral-800">
          <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-bold">
            {/* Step 1 */}
            <div
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg transition ${
                currentStep === 'GMAIL_OTP'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : gmailVerified
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'text-slate-400'
              }`}
            >
              {gmailVerified ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Mail className="w-3.5 h-3.5" />}
              <span>1. Gmail 6-Digit OTP</span>
            </div>

            {/* Step 2 */}
            <div
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg transition ${
                currentStep === 'RESET_PASSWORD' || currentStep === 'COMPLETED'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>2. Reset Password</span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* STEP 1: GMAIL OTP VERIFICATION */}
          {currentStep === 'GMAIL_OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4" autoComplete="off">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-blue-50 dark:bg-neutral-900 border border-blue-200 dark:border-neutral-800 text-[#005A9C] dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Mail className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Step 1: Admin Gmail OTP Verification
                </h4>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  {sendingOtp ? 'Sending 6-digit OTP to registered Admin Gmail:' : 'Verification sent to registered Master Admin Gmail:'}
                  <br />
                  <strong className="text-slate-900 dark:text-white font-mono text-sm tracking-wide">
                    {maskedEmail}
                  </strong>
                </p>
              </div>

              {expiresAt > 0 && deliveryChannel === 'emailjs' && (
                <div className="flex items-center justify-between text-[11px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300">
                  <span className="flex items-center gap-1 font-mono font-semibold">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    {secondsRemaining > 0 ? `Valid for ${formatCountdown(secondsRemaining)}` : 'OTP Expired'}
                  </span>
                  <span className={`font-semibold ${remainingAttempts <= 1 ? 'text-rose-600' : ''}`}>
                    {remainingAttempts} / 3 attempts left
                  </span>
                </div>
              )}

              {deliveryChannel === 'emailjs' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1.5 text-center">
                    Enter 6-Digit Gmail OTP (Masked for Privacy)
                  </label>
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
                      className="w-full text-center tracking-[0.45em] text-xl font-mono pl-10 pr-10 py-3 bg-slate-50 dark:bg-black text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-800 rounded-2xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden transition"
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
                </div>
              ) : (
                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
                  <p className="font-bold">Firebase Email Link Sent</p>
                  <p className="text-[11px] leading-relaxed">
                    Open the verification email in <strong>{maskedEmail}</strong> and click the link to unlock Password Reset directly.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loading || sendingOtp}
                  className={`flex items-center gap-1 font-semibold ${
                    resendCooldown > 0 || sendingOtp
                      ? 'text-slate-400 cursor-not-allowed'
                      : 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                  <span>
                    {sendingOtp
                      ? 'Sending OTP...'
                      : `Send OTP to Gmail ${resendCooldown > 0 ? `(${resendCooldown}s)` : ''}`}
                  </span>
                </button>

                <span className="text-[10px] text-slate-400">
                  Single-use · 5 min validity
                </span>
              </div>

              {deliveryChannel === 'emailjs' && (
                <button
                  type="submit"
                  disabled={loading || sendingOtp || otpCode.trim().length !== 6 || secondsRemaining === 0 || remainingAttempts === 0}
                  className="w-full py-3 bg-[#005A9C] hover:bg-blue-800 active:bg-blue-900 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Gmail OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify Gmail OTP &amp; Next</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </form>
          )}

          {/* STEP 2: REVEAL USERNAME & RESET PASSWORD (Strictly guarded by verified OTP token) */}
          {currentStep === 'RESET_PASSWORD' && gmailVerified && verificationToken && (
            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-neutral-900 border border-emerald-200 dark:border-neutral-800 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Step 2: Admin Credentials Recovery &amp; Reset
                </h4>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Gmail OTP verified. View your username and set a new password:
                </p>
              </div>

              {/* Current Admin Username Card */}
              <div className="bg-slate-50 dark:bg-black p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-wider">
                    Current Admin Username
                  </div>
                  <div className="text-sm font-mono font-extrabold text-blue-700 dark:text-blue-400 mt-0.5">
                    {adminUsername}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyUsernameToClipboard}
                  className="p-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Copy admin username"
                >
                  {copiedUsername ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[10px] text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* New Password Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  New Admin Password (min 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new admin password"
                    className="w-full text-xs rounded-xl pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    required
                    minLength={6}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new admin password"
                    className="w-full text-xs rounded-xl pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Save & Instant Firestore Update Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-black hover:bg-neutral-900 active:bg-neutral-950 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Updating Cloud Firestore...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Save New Password &amp; Update Cloud</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* COMPLETED SUCCESS SCREEN */}
          {currentStep === 'COMPLETED' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                Admin Password Successfully Updated!
              </h4>
              <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
                Your new credentials have been encrypted with SHA-256 and synced to Cloud Firestore. Your OTP has been invalidated. Returning to login...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
