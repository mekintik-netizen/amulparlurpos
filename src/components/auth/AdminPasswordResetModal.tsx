/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Password Reset Modal via Security Question
 * Enables the Master Admin to recover access by answering their secret question
 * configured during one-time system setup.
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, CheckCircle2, AlertCircle, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { getAdminSecurityQuestion, resetAdminPasswordWithSecurityAnswer } from '../../storage/auth.ts';

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
  const [step, setStep] = useState<'ENTER_USER' | 'ANSWER_QUESTION' | 'DONE'>('ENTER_USER');
  const [username, setUsername] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Step 1: Lookup Admin Username & Fetch Security Question
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
      setSecurityQuestion(res.question);
      setStep('ANSWER_QUESTION');
    } catch (err: any) {
      setError(err?.message || 'Failed to verify admin account.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Validate Answer & Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      await resetAdminPasswordWithSecurityAnswer({
        username,
        securityAnswer,
        newPassword
      });

      setStep('DONE');
      setTimeout(() => {
        onSuccess(username.trim().toLowerCase());
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset admin password.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('ENTER_USER');
    setUsername('');
    setSecurityQuestion('');
    setSecurityAnswer('');
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
                Security Question Verification
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
                Enter your registered administrator username. We will retrieve the secret question you configured during setup.
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
                  {loading ? 'Verifying...' : 'Next: View Security Question'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {step === 'ANSWER_QUESTION' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Question Banner */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
                  Your Security Question
                </span>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  "{securityQuestion}"
                </p>
              </div>

              {/* Answer Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Your Secret Answer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your registered answer"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#003870]"
                  required
                  autoFocus
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
                  {loading ? 'Updating Password...' : 'Verify & Change Password'}
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
