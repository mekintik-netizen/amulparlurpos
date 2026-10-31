/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Minimalist, Plain & Simple Dual Login Page (Instagram/Facebook aesthetic)
 * Secure, production-ready local authentication:
 * - Direct In-Card "Admin Register" tab on first open if no admin initialized
 * - Single-admin permanent lock once created
 * - Dual Roles: Shop Counter vs Admin HQ
 * - Automatic shop resolution from authenticated user credentials (no redundant parlour dropdown)
 * - Strict authorization: only registered shop cashiers and admins can log in
 * - Admin password recovery via secret Security Question
 */

import React, { useState, useEffect } from 'react';
import { Shop } from '../../types/index.ts';
import { 
  UserRole, 
  AuthSession, 
  authenticateLocalUser, 
  ensureDefaultAccountsSeeded,
  isMasterAdminInitialized,
  performOneTimeAdminSetup 
} from '../../storage/auth.ts';
import { AdminPasswordResetModal } from './AdminPasswordResetModal.tsx';
import { 
  Store, 
  Shield, 
  ShieldPlus, 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  X, 
  CheckCircle2, 
  KeyRound,
  HelpCircle,
  Sparkles
} from 'lucide-react';

export type LoginTab = 'SHOP_USER' | 'ADMIN' | 'ADMIN_REGISTER';

export interface LoginPageProps {
  shops: Shop[];
  onLoginSuccess: (session: AuthSession) => void;
  onOpenRegister?: () => void;
  initialRole?: UserRole;
  onClose?: () => void;
  isModal?: boolean;
}

const PRESET_SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  "What is your mother's maiden name?",
  'What city or town were you born in?',
  'What is your favorite Amul ice cream or dairy product?',
  'What was the name of your first pet?',
  'Custom Question (Type your own question)'
];

export const LoginPage: React.FC<LoginPageProps> = ({
  shops,
  onLoginSuccess,
  initialRole = 'SHOP_USER',
  onClose,
  isModal = false
}) => {
  const [activeTab, setActiveTab] = useState<LoginTab>(initialRole);
  const [hasMasterAdmin, setHasMasterAdmin] = useState<boolean>(true);

  // Backward-compatible reference for tests
  const isOneTimeSetupOpen = !hasMasterAdmin;

  // Standard Login Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Admin Registration Tab Form States
  const [regUsername, setRegUsername] = useState('admin');
  const [regFullName, setRegFullName] = useState('Master Administrator');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regQuestion, setRegQuestion] = useState(PRESET_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [regSecurityAnswer, setRegSecurityAnswer] = useState('');

  // Status & Feedback States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Forgot Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Check initialization on mount
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        await ensureDefaultAccountsSeeded();
        const hasAdmin = await isMasterAdminInitialized();
        setHasMasterAdmin(hasAdmin);
        if (!hasAdmin) {
          // First-time webpage open: directly activate the Admin Register tab
          setActiveTab('ADMIN_REGISTER');
        } else if (initialRole) {
          setActiveTab(initialRole);
        }
      } catch (err) {
        console.error('Error verifying master admin status:', err);
      }
    };
    checkInitialization();
  }, [initialRole]);

  // Switch tabs
  const handleTabChange = (tab: LoginTab) => {
    setActiveTab(tab);
    setError(null);
    setResetSuccessMessage(null);
  };

  // Handle Standard Login (Shop Counter or Admin HQ)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMessage(null);
    setLoading(true);

    try {
      const session = await authenticateLocalUser({
        username,
        password,
        role: activeTab === 'ADMIN' ? 'ADMIN' : 'SHOP_USER'
      });
      onLoginSuccess(session);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle In-Card Admin Registration
  const handleAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMessage(null);

    const cleanUsername = regUsername.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setError('Admin Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setError('Admin Username can only contain letters, numbers, hyphens, and underscores.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    const finalQuestion = regQuestion === 'Custom Question (Type your own question)'
      ? customQuestion.trim()
      : regQuestion.trim();

    if (!finalQuestion || finalQuestion.length < 5) {
      setError('Please provide a valid security recovery question.');
      return;
    }
    if (!regSecurityAnswer.trim() || regSecurityAnswer.trim().length < 2) {
      setError('Please enter a secret answer for password recovery.');
      return;
    }

    setLoading(true);
    try {
      const session = await performOneTimeAdminSetup({
        username: cleanUsername,
        fullName: regFullName.trim() || 'Master Administrator',
        password: regPassword,
        securityQuestion: finalQuestion,
        securityAnswer: regSecurityAnswer.trim()
      });

      // Once successfully created, lock and hide the Admin Register tab permanently
      setHasMasterAdmin(true);
      setActiveTab('ADMIN');
      onLoginSuccess(session);
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize master admin account.');
    } finally {
      setLoading(false);
    }
  };

  const wrapperClass = isModal
    ? "fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-center items-center p-4 overflow-y-auto font-sans select-none"
    : "min-h-screen bg-slate-50 dark:bg-black flex flex-col justify-center items-center p-4 font-sans select-none";

  return (
    <div className={wrapperClass}>
      
      {/* Primary Login / Registration Card */}
      <div className="max-w-[420px] w-full bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl shadow-sm p-6 sm:p-7 relative transition-all">
        
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
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center p-2.5 bg-[#005A9C] text-white rounded-2xl shadow-xs mb-2.5">
            <span className="font-black text-xl tracking-tight uppercase">Amul</span>
          </div>
          <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
            Amul Preferred Parlour
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
            {activeTab === 'ADMIN_REGISTER'
              ? 'One-Time Setup: Create Master Administrator Account'
              : 'Sign in to continue to your authorized shop terminal'}
          </p>
        </div>

        {/* Segmented Control: 3 tabs on first open, 2 tabs once Admin is created */}
        <div className={`grid ${!hasMasterAdmin ? 'grid-cols-3' : 'grid-cols-2'} gap-1 bg-slate-100 dark:bg-neutral-900 p-1 rounded-xl mb-4 text-[11px] font-semibold`}>
          
          {/* Admin Register Tab (Only shown on first open when no Master Admin exists) */}
          {!hasMasterAdmin && (
            <button
              type="button"
              onClick={() => handleTabChange('ADMIN_REGISTER')}
              className={`py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === 'ADMIN_REGISTER'
                  ? 'bg-red-600 text-white shadow-xs font-bold'
                  : 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
              }`}
              title="First-Time Master Admin Registration"
            >
              <ShieldPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Admin Register</span>
            </button>
          )}

          {/* Shop Counter Tab */}
          <button
            type="button"
            onClick={() => handleTabChange('SHOP_USER')}
            className={`py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeTab === 'SHOP_USER'
                ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-[#005A9C] shrink-0" />
            <span className="truncate">Shop Counter</span>
          </button>

          {/* Admin HQ Tab */}
          <button
            type="button"
            onClick={() => handleTabChange('ADMIN')}
            className={`py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeTab === 'ADMIN'
                ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#E31837] shrink-0" />
            <span className="truncate">Admin HQ</span>
          </button>
        </div>

        {/* Success Alert */}
        {resetSuccessMessage && (
          <div className="mb-3.5 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-3.5 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: IN-CARD ADMIN REGISTRATION FORM (On First Open) */}
        {activeTab === 'ADMIN_REGISTER' && (
          <form onSubmit={handleAdminRegister} className="space-y-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p>
                <strong>Admin Setup:</strong> Create your Master Admin account. Only 1 Admin account is permitted. Once created, this tab will lock permanently.
              </p>
            </div>

            {/* Admin Username */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Admin ID / Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full text-xs rounded-xl px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white font-mono placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                required
              />
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Admin Full Name
              </label>
              <input
                type="text"
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder="Master Administrator"
                className="w-full text-xs rounded-xl px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Admin Password & Confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                  Password (min 6) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs rounded-xl pl-3 pr-8 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showRegConfirm ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs rounded-xl pl-3 pr-8 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirm(!showRegConfirm)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer"
                  >
                    {showRegConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Recovery Security Question */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
                <span>Security Recovery Question <span className="text-red-500">*</span></span>
                <span className="text-[10px] text-slate-400 font-normal">For password reset</span>
              </label>
              <select
                value={regQuestion}
                onChange={(e) => setRegQuestion(e.target.value)}
                className="w-full text-xs rounded-xl px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-red-500 cursor-pointer"
              >
                {PRESET_SECURITY_QUESTIONS.map((q, idx) => (
                  <option key={idx} value={q}>{q}</option>
                ))}
              </select>
            </div>

            {/* Custom Question field if chosen */}
            {regQuestion === 'Custom Question (Type your own question)' && (
              <div>
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Type your secret question here..."
                  className="w-full text-xs rounded-xl px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
            )}

            {/* Security Secret Answer */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Secret Recovery Answer <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={regSecurityAnswer}
                onChange={(e) => setRegSecurityAnswer(e.target.value)}
                placeholder="Enter secret answer (remember this)"
                className="w-full text-xs rounded-xl px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                required
              />
              <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">
                Hashed locally with salted SHA-256. Used to recover admin password if forgotten.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? 'Creating Admin Account...' : 'Create Admin Account & Log In'}</span>
            </button>
          </form>
        )}

        {/* TAB 2 & 3: STANDARD LOGIN FORM (Shop Counter or Admin HQ) */}
        {activeTab !== 'ADMIN_REGISTER' && (
          <form onSubmit={handleLogin} className="space-y-3.5">
            
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
                  placeholder={activeTab === 'ADMIN' ? 'Admin Username (e.g. admin)' : 'Cashier ID / username'}
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
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-black hover:bg-neutral-900 active:bg-neutral-950 border border-neutral-800 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Logging In...' : activeTab === 'ADMIN' ? 'Log In as Admin' : 'Log In to Counter'}
            </button>
          </form>
        )}

      </div>

      {/* Security & Support Note */}
      <div className="max-w-[420px] w-full bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl p-3.5 text-center text-xs text-slate-600 dark:text-neutral-400 mt-3 shadow-2xs">
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
