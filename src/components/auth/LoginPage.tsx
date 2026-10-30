/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Minimalist, Plain & Simple Dual Login Page (Instagram/Facebook aesthetic)
 * Secure, production-ready local authentication:
 * - Dual Roles: Shop Counter vs Admin HQ
 * - Automatic shop resolution from authenticated user credentials (no redundant parlour dropdown)
 * - Strict authorization: only registered shop cashiers and admins can log in
 * - First-time Master Admin setup wizard trigger if no admin exists
 * - Admin password recovery via secret Security Question
 */

import React, { useState, useEffect } from 'react';
import { Shop } from '../../types/index.ts';
import { 
  UserRole, 
  AuthSession, 
  authenticateLocalUser, 
  ensureDefaultAccountsSeeded,
  isMasterAdminInitialized 
} from '../../storage/auth.ts';
import { AdminRegistration } from './AdminRegistration.tsx';
import { AdminPasswordResetModal } from './AdminPasswordResetModal.tsx';
import { Store, Shield, Lock, User, Eye, EyeOff, AlertCircle, X, CheckCircle2, KeyRound } from 'lucide-react';

export interface LoginPageProps {
  shops: Shop[];
  onLoginSuccess: (session: AuthSession) => void;
  onOpenRegister?: () => void;
  initialRole?: UserRole;
  onClose?: () => void;
  isModal?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  shops,
  onLoginSuccess,
  initialRole = 'SHOP_USER',
  onClose,
  isModal = false
}) => {
  const [activeTab, setActiveTab] = useState<UserRole>(initialRole);

  useEffect(() => {
    if (initialRole) {
      setActiveTab(initialRole);
    }
  }, [initialRole]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // First-time Master Admin Setup Wizard state
  const [isOneTimeSetupOpen, setIsOneTimeSetupOpen] = useState(false);
  
  // Forgot Password Modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  useEffect(() => {
    const checkInitialization = async () => {
      try {
        await ensureDefaultAccountsSeeded();
        const hasAdmin = await isMasterAdminInitialized();
        if (!hasAdmin) {
          setIsOneTimeSetupOpen(true);
        }
      } catch (err) {
        console.error('Error verifying master admin status:', err);
      }
    };
    checkInitialization();
  }, []);

  // Switch tabs
  const handleTabChange = (role: UserRole) => {
    setActiveTab(role);
    setError(null);
    setResetSuccessMessage(null);
    setUsername('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMessage(null);
    setLoading(true);

    try {
      const session = await authenticateLocalUser({
        username,
        password,
        role: activeTab
      });
      onLoginSuccess(session);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Render dedicated first-time Master Admin creation wizard on initial open
  if (isOneTimeSetupOpen) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col justify-center items-center p-4 font-sans select-none">
        <AdminRegistration
          onSuccess={(session) => {
            setIsOneTimeSetupOpen(false);
            onLoginSuccess(session);
          }}
          onSetupComplete={(session) => {
            setIsOneTimeSetupOpen(false);
            onLoginSuccess(session);
          }}
          onNavigateToLogin={(registeredUsername) => {
            setIsOneTimeSetupOpen(false);
            setActiveTab('ADMIN');
            if (registeredUsername) {
              setUsername(registeredUsername);
            }
          }}
          onCancel={() => setIsOneTimeSetupOpen(false)}
        />
      </div>
    );
  }

  const wrapperClass = isModal
    ? "fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-center items-center p-4 overflow-y-auto font-sans select-none"
    : "min-h-screen bg-slate-50 dark:bg-black flex flex-col justify-center items-center p-4 font-sans select-none";

  return (
    <div className={wrapperClass}>
      
      {/* Primary Login Card (Plain and simple aesthetic) */}
      <div className="max-w-[390px] w-full bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl shadow-sm p-7 sm:p-8 relative">
        
        {/* Close button if opened as modal */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-600 dark:text-neutral-300 flex items-center justify-center transition cursor-pointer"
            title="Close login modal and return to POS counter"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Amul Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-2.5 bg-[#005A9C] text-white rounded-2xl shadow-xs mb-3">
            <span className="font-black text-xl tracking-tight uppercase">Amul</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            Amul Preferred Parlour
          </h1>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
            Sign in to continue to your authorized shop terminal
          </p>
        </div>

        {/* Segmented Control for Shop Counter vs Admin HQ */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-neutral-900 p-1 rounded-xl mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleTabChange('SHOP_USER')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'SHOP_USER'
                ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-[#005A9C]" />
            <span>Shop Counter</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('ADMIN')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'ADMIN'
                ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#E31837]" />
            <span>Admin HQ</span>
          </button>
        </div>

        {/* Main Form */}
        <form onSubmit={handleLogin} className="space-y-3.5">
          
          {resetSuccessMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Username / ID Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
              {activeTab === 'ADMIN' ? 'Admin Username' : 'Cashier / Login ID'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={activeTab === 'ADMIN' ? 'Username' : 'Cashier ID / username'}
                className={`w-full text-xs rounded-xl px-3.5 py-2.5 transition focus:outline-hidden focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  activeTab === 'ADMIN'
                    ? 'bg-black text-white border border-neutral-800 placeholder:text-neutral-500 font-mono'
                    : 'bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500'
                }`}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                Password
              </label>
              {activeTab === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 font-semibold"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Forgot Password?</span>
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={`w-full text-xs rounded-xl pl-3.5 pr-10 py-2.5 transition focus:outline-hidden focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  activeTab === 'ADMIN'
                    ? 'bg-black text-white border border-neutral-800 placeholder:text-neutral-500'
                    : 'bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500'
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-2.5 cursor-pointer ${
                  activeTab === 'ADMIN' ? 'text-neutral-400 hover:text-white' : 'text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300'
                }`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Main Log In Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-xs transition-all cursor-pointer ${
              activeTab === 'ADMIN'
                ? 'bg-black hover:bg-neutral-900 active:bg-neutral-950 border border-neutral-800'
                : 'bg-black hover:bg-neutral-900 active:bg-neutral-950 border border-neutral-800'
            } disabled:opacity-50`}
          >
            {loading ? 'Logging In...' : activeTab === 'ADMIN' ? 'Log In as Admin' : 'Log In to Counter'}
          </button>
        </form>

      </div>

      {/* Security & Support Note */}
      <div className="max-w-[390px] w-full bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl p-4 text-center text-xs text-slate-600 dark:text-neutral-400 mt-3 shadow-2xs">
        <p className="text-[11px] leading-relaxed">
          <span className="font-bold text-slate-800 dark:text-slate-200">Authorized Personnel Only.</span>
          <br />
          New shop outlets and cashier credentials are provisioned exclusively through the Admin HQ Portal.
        </p>
      </div>

      {/* Forgot Admin Password Modal */}
      <AdminPasswordResetModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        onSuccess={(recoveredAdminUsername) => {
          setUsername(recoveredAdminUsername);
          setResetSuccessMessage('Password updated successfully! Please enter your new password to sign in.');
          setError(null);
        }}
      />

    </div>
  );
};
