/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin Password Reset Modal (Security Question + Mandatory Gmail 6-Digit OTP)
 * Requires BOTH valid secret answer AND valid single-use Gmail OTP verification
 * before allowing any Admin password update.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Mail,
  X
} from 'lucide-react';
import {
  sendAdminGmailOtp,
  verifyAdminGmailOtp
} from '../../storage/adminEmailOtp.ts';
import {
  getAdminSecurityQuestion,
  resetAdminPasswordWithSecurityAnswer
} from '../../storage/auth.ts';

interface AdminPasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (adminUsername: string) => void;
}

export const AdminPasswordResetModal: React.FC<AdminPasswordResetModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [step, setStep] = useState<'ENTER_USER' | 'VERIFY_OTP_AND_ANSWER' | 'DONE'>('ENTER_USER');
  const [username, setUsername] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Step 1: Lookup Admin Username, Fetch Security Question & Dispatch Gmail OTP
  const handleLookupUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Please enter your admin username.');
      return;
    }

    setLoading(true);
    try {
      const res = await getAdminSecurityQuestion(username);
      if (!res.success || !res.question) {
        setError(res.message || 'No security recovery question found for this username.');
        return;
      }
      const otpRes = await sendAdminGmailOtp({ purpose: 'ADMIN_PASSWORD_RESET' });
      setSecurityQuestion(res.question);
      setMaskedEmail(otpRes.maskedEmail);
      setOtpSent(true);
      setStep('VERIFY_OTP_AND_ANSWER');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Gmail OTP verification.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Gmail OTP -> Validate Security Answer & Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError('Please enter the valid 6-digit OTP sent to Admin Gmail.');
      return;
    }

    if (!securityAnswer.trim()) {
      setError('Please provide your secret security answer.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const otpResult = await verifyAdminGmailOtp({
        code: otpCode.trim(),
        purpose: 'ADMIN_PASSWORD_RESET'
      });

      await resetAdminPasswordWithSecurityAnswer({
        username,
        securityAnswer,
        newPassword,
        verificationToken: otpResult.verificationToken
      });

      setOtpCode('');
      setStep('DONE');
      setTimeout(() => {
        onSuccess(username.trim().toLowerCase());
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setOtpCode('');
      setError(err instanceof Error ? err.message : 'Failed to reset admin password.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('ENTER_USER');
    setUsername('');
    setSecurityQuestion('');
    setSecurityAnswer('');
    setOtpCode('');
    setShowOtp(false);
    setOtpSent(false);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
        {/* Header */}
        <div className="bg-[#003870] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
              <Key className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">
                Admin Password Recovery
              </h3>
              <p className="text-[11px] text-blue-200">
                Gmail OTP + Security Question Verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'ENTER_USER' && (
            <form onSubmit={handleLookupUsername} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed">
                Enter your registered administrator username. We will dispatch a 6-digit verification OTP to the registered Master Admin Gmail and retrieve your secret question.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                  placeholder="e.g. admin"
                  className="w-full text-xs font-mono px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="w-1/3 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-neutral-800 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#003870] hover:bg-blue-900 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Sending Gmail OTP...' : 'Send OTP to Gmail'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {step === 'VERIFY_OTP_AND_ANSWER' && (
            <form onSubmit={handleResetPassword} className="space-y-4" autoComplete="off">
              {otpSent && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-2 text-xs text-blue-900 dark:text-blue-200">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    6-digit OTP sent to <strong className="font-mono">{maskedEmail}</strong> (valid 5 mins).
                  </span>
                </div>
              )}

              {/* Masked Gmail OTP Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  6-Digit Gmail OTP <span className="text-rose-500">*</span>
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
                    className="w-full text-center tracking-[0.4em] text-base font-mono pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowOtp((prev) => !prev)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:text-neutral-500 cursor-pointer"
                    aria-label={showOtp ? 'Hide OTP digits' : 'Show OTP digits'}
                  >
                    {showOtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Question Banner */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
                  Your Security Question
                </span>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  &quot;{securityQuestion}&quot;
                </p>
              </div>

              {/* Answer Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Your Secret Answer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your registered answer"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                  required
                />
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  New Admin Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:text-neutral-500 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('ENTER_USER')}
                  className="w-1/3 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-neutral-800 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Updating Password...' : 'Verify OTP & Change Password'}
                </button>
              </div>
            </form>
          )}

          {step === 'DONE' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                Password Changed Successfully!
              </h4>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Your new administrator password is now active. Returning to login...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
