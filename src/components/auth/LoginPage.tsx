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
  authenticateShopCounterFromFirestore,
  ensureDefaultAccountsSeeded,
  isMasterAdminInitialized,
  performOneTimeAdminSetup 
} from '../../storage/auth.ts';
import { AdminPasswordResetModal } from './AdminPasswordResetModal.tsx';
import { AdminCredentialsRecoveryModal } from './AdminCredentialsRecoveryModal.tsx';
import { AdminPhone2FAModal } from './AdminPhone2FAModal.tsx';
import amulLogo from '../../assets/logo.ts';
import { AmulBrandLogoMotion, AmulLoginSuccessTransition } from '../common/AmulBrandMotion.tsx';
import { getAdminAuthConfig, DEFAULT_ADMIN_AUTH_CONFIG, AdminAuthConfig } from '../../storage/firebase.ts';
import { saveSession } from '../../storage/auth.ts';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, sanitizeErrorMessage } from '../../utils/sanitizer.ts';
import { 
  Store, 
  Shield, 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  X, 
  CheckCircle2, 
  KeyRound,
  Sparkles,
  Smartphone
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
  const [activeTab, setActiveTab] = useState<LoginTab>(initialRole === 'ADMIN' ? 'ADMIN' : 'SHOP_USER');
  const [hasMasterAdmin, setHasMasterAdmin] = useState<boolean>(true);
  const [adminConfig, setAdminConfig] = useState<AdminAuthConfig>(DEFAULT_ADMIN_AUTH_CONFIG);

  // Backward-compatible reference for tests
  const isOneTimeSetupOpen = !hasMasterAdmin;

  // Standard Login Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isTrustedDevice, setIsTrustedDevice] = useState(false);

  // 2FA Phone Auth States
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
  const [pendingAdminSession, setPendingAdminSession] = useState<AuthSession | null>(null);

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

  // Smooth Dashboard Transition State
  const [transitioningSession, setTransitioningSession] = useState<AuthSession | null>(null);

  const triggerSuccessfulLoginTransition = (session: AuthSession, isTrusted: boolean = false) => {
    saveSession(session, isTrusted);
    setTransitioningSession(session);
    setTimeout(() => {
      onLoginSuccess(session);
    }, 450);
  };

  // Forgot Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Check initialization on mount
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        await ensureDefaultAccountsSeeded();
        const hasAdmin = await isMasterAdminInitialized();
        setHasMasterAdmin(hasAdmin);
        const config = await getAdminAuthConfig();
        setAdminConfig(config);
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

    const cleanInput = username.trim();
    const rateLimitKey = `login_${activeTab}_${cleanInput.toLowerCase()}`;
    const rateCheck = checkRateLimit(rateLimitKey);

    if (!rateCheck.allowed) {
      setError(`Too many failed login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`);
      setLoading(false);
      return;
    }

    const enteredUsername = username.trim();
    const enteredPassword = password;
    // Clear password state on submit for privacy & anti-shoulder surfing
    setPassword('');

    try {
      let session: AuthSession;
      if (activeTab === 'SHOP_USER') {
        session = await authenticateShopCounterFromFirestore({
          mobileNumberOrShopId: enteredUsername,
          usernameOrShopId: enteredUsername,
          password: enteredPassword
        });
      } else {
        session = await authenticateLocalUser({
          username: enteredUsername,
          password: enteredPassword,
          role: 'ADMIN'
        });
      }

      // Successful credentials verification -> clear rate limit
      clearRateLimit(rateLimitKey);

      if (activeTab === 'ADMIN') {
        // Trigger Real-time SMS Phone OTP 2FA for Master Admin
        setPendingAdminSession(session);
        setIs2FAModalOpen(true);
      } else {
        triggerSuccessfulLoginTransition(session, false);
      }
    } catch (err: any) {
      const lockResult = recordFailedAttempt(rateLimitKey);
      if (lockResult.locked) {
        setError(`Maximum login attempts exceeded. Account access temporarily locked for ${lockResult.retryAfterSeconds} seconds.`);
      } else {
        setError(sanitizeErrorMessage(err?.message, 'Authentication failed. Please verify credentials.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerified = () => {
    if (pendingAdminSession) {
      setIs2FAModalOpen(false);
      triggerSuccessfulLoginTransition(pendingAdminSession, isTrustedDevice);
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
      triggerSuccessfulLoginTransition(session, false);
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize master admin account.');
    } finally {
      setLoading(false);
    }
  };

  const wrapperClass = isModal
    ? 'fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-md flex flex-col justify-center items-center px-4 py-6 sm:p-6 overflow-y-auto font-sans select-none'
    : 'relative min-h-[100dvh] w-full bg-gradient-to-br from-slate-100 via-white to-blue-50/70 dark:from-slate-950 dark:via-neutral-950 dark:to-slate-900 flex flex-col justify-center items-center px-4 py-6 sm:p-6 overflow-x-hidden overflow-y-auto font-sans select-none';

  return (
    <div className={wrapperClass}>
      {/* Full-Screen Blurred Amul Logo Background Layer */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0" aria-hidden="true">
        <img
          src={amulLogo}
          alt=""
          className="fixed inset-0 w-full h-full object-cover object-center blur-sm opacity-20 dark:opacity-15 scale-105"
          loading="eager"
        />
        <div className="fixed inset-0 backdrop-blur-md bg-gradient-to-br from-white/60 via-slate-50/45 to-blue-100/50 dark:from-slate-950/75 dark:via-neutral-950/70 dark:to-slate-900/80" />
      </div>

      {/* Centered Frosted Glass Login / Registration Container */}
      <div className="relative z-10 w-full max-w-[430px] flex flex-col items-center my-auto">
        <div
          className={`w-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-2xl rounded-3xl p-6 sm:p-8 relative transition-all duration-300 ease-in-out ${
            transitioningSession ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
        >
          {/* Close button if opened as modal */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
              title="Close login modal and return to POS counter"
              aria-label="Close login modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Crisp Amul Brand Emblem & Header Inside Card */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2.5">
              <AmulBrandLogoMotion size="lg" showTagline={false} isPulsing={true} />
            </div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mt-2 text-balance">
              Amul Preferred Parlour
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">
              {activeTab === 'ADMIN_REGISTER'
                ? 'One-Time Setup: Create Master Administrator Account'
                : 'Sign in to continue to your authorized shop terminal'}
            </p>
          </div>

          {/* Segmented Control: 2 tabs (Shop Counter & Admin HQ) */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 backdrop-blur-xs p-1 rounded-2xl mb-5 text-xs font-semibold">
            {/* Shop Counter Tab */}
            <button
              type="button"
              onClick={() => handleTabChange('SHOP_USER')}
              className={`min-h-[40px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'SHOP_USER'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-[#005A9C] shrink-0" />
              <span className="truncate">Shop Counter (કૅશિયર)</span>
            </button>

            {/* Admin HQ Tab */}
            <button
              type="button"
              onClick={() => handleTabChange('ADMIN')}
              className={`min-h-[40px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ADMIN'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-[#E31837] shrink-0" />
              <span className="truncate">Admin HQ (માલિક)</span>
            </button>
          </div>

          {/* Success Alert */}
          {resetSuccessMessage && (
            <div className="mb-4 p-3 bg-emerald-50/95 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50/95 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: IN-CARD ADMIN REGISTRATION FORM (On First Open) */}
          {activeTab === 'ADMIN_REGISTER' && (
            <form onSubmit={handleAdminRegister} className="space-y-3.5">
              <div className="p-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Admin Setup:</strong> Create your Master Admin account. Only 1 Admin account is permitted. Once created, this tab will lock permanently.
                </p>
              </div>

              {/* Admin Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Admin ID / Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full min-h-[42px] text-xs rounded-xl px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837]"
                  required
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Admin Full Name
                </label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="Master Administrator"
                  className="w-full min-h-[42px] text-xs rounded-xl px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837]"
                />
              </div>

              {/* Admin Password & Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    Password (min 6) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[42px] text-xs rounded-xl pl-3.5 pr-9 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRegConfirm ? 'text' : 'password'}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[42px] text-xs rounded-xl pl-3.5 pr-9 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837] focus:border-[#E31837]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirm(!showRegConfirm)}
                      className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showRegConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Recovery Security Question */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>Security Recovery Question <span className="text-red-500">*</span></span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">For password reset</span>
                </label>
                <select
                  value={regQuestion}
                  onChange={(e) => setRegQuestion(e.target.value)}
                  className="w-full min-h-[42px] text-xs rounded-xl px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#E31837] cursor-pointer"
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
                    className="w-full min-h-[42px] text-xs rounded-xl px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837]"
                    required
                  />
                </div>
              )}

              {/* Security Secret Answer */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Secret Recovery Answer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={regSecurityAnswer}
                  onChange={(e) => setRegSecurityAnswer(e.target.value)}
                  placeholder="Enter secret answer (remember this)"
                  className="w-full min-h-[42px] text-xs rounded-xl px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#E31837]"
                  required
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Hashed locally with salted SHA-256. Used to recover admin password if forgotten.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] mt-2 py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-[#E31837] hover:bg-[#C4122D] active:scale-[0.99] shadow-lg shadow-rose-900/15 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{loading ? 'Creating Admin Account...' : 'Create Admin Account & Log In'}</span>
              </button>
            </form>
          )}

          {/* STANDARD LOGIN FORM (Shop Counter or Admin HQ) */}
          {activeTab !== 'ADMIN_REGISTER' && (
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              {/* Mobile Number / Admin Username Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {activeTab === 'ADMIN' ? 'Admin Username' : 'Shop Mobile Number'}
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type={activeTab === 'ADMIN' ? 'text' : 'tel'}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={activeTab === 'ADMIN' ? 'Admin Username (e.g. admin)' : 'Shop Mobile Number / Shop ID'}
                    autoComplete={activeTab === 'ADMIN' ? 'username' : 'tel'}
                    className={`w-full min-h-[44px] text-sm rounded-xl pl-10 pr-4 py-2.5 bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-2xs transition focus:outline-hidden focus:ring-2 ${
                      activeTab === 'ADMIN'
                        ? 'font-mono focus:ring-[#E31837] focus:border-[#E31837]'
                        : 'focus:ring-[#005A9C] focus:border-[#005A9C]'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Password
                  </label>
                  {activeTab === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(true)}
                      className="text-[11px] text-[#005A9C] dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 font-semibold"
                      title="Forgot Password? Recover Admin Username and reset password via 2FA"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Forgot Username / Password?</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute left-3.5 top-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="new-password"
                    className={`w-full min-h-[44px] text-sm rounded-xl pl-10 pr-11 py-2.5 bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-2xs transition focus:outline-hidden focus:ring-2 ${
                      activeTab === 'ADMIN'
                        ? 'focus:ring-[#E31837] focus:border-[#E31837]'
                        : 'focus:ring-[#005A9C] focus:border-[#005A9C]'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer p-0.5"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Admin Device Trust Checkbox */}
              {activeTab === 'ADMIN' && (
                <div className="pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <input
                      type="checkbox"
                      checked={isTrustedDevice}
                      onChange={(e) => setIsTrustedDevice(e.target.checked)}
                      className="w-4 h-4 rounded text-[#E31837] focus:ring-[#E31837] border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    />
                    <span>Trust this device (Keep 1-hour session)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-6 mt-0.5">
                    {isTrustedDevice
                      ? 'Personal device: Stays authenticated for 60 mins across reloads.'
                      : 'Shop / Public computer: Session wiped immediately on tab close.'}
                  </p>
                </div>
              )}

              {/* Main Log In Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full min-h-[46px] py-3 px-4 rounded-xl font-bold text-sm text-white shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] ${
                  activeTab === 'ADMIN'
                    ? 'bg-[#E31837] hover:bg-[#C4122D] shadow-rose-900/20'
                    : 'bg-[#005A9C] hover:bg-[#00487E] shadow-blue-900/20'
                }`}
              >
                {loading ? (
                  <span>Logging In...</span>
                ) : activeTab === 'ADMIN' ? (
                  <>
                    <Smartphone className="w-4 h-4 text-amber-200" />
                    <span>Verify Credentials &amp; Send SMS OTP</span>
                  </>
                ) : (
                  <span>Log In to Counter</span>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Frosted Glass Security & Support Note */}
        <div className="w-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/50 dark:border-slate-700/50 rounded-2xl px-4 py-3 text-center text-xs text-slate-700 dark:text-slate-300 mt-3.5 shadow-sm">
          <p className="text-[11px] leading-relaxed">
            <span className="font-bold text-slate-900 dark:text-white">Authorized Personnel Only</span>
            <span aria-hidden="true"> · </span>
            New shop outlets and cashier credentials are provisioned exclusively through the Admin HQ Portal.
          </p>
        </div>
      </div>

      {/* 2FA Master Admin Forgot Username / Password Recovery Modal */}
      <AdminCredentialsRecoveryModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        onSuccess={(recoveredAdminUsername, message) => {
          setUsername(recoveredAdminUsername);
          setPassword('');
          setResetSuccessMessage(message || 'Admin credentials successfully updated! You can now log in with your new password.');
          setError(null);
        }}
      />

      {/* Real-time SMS Phone OTP 2FA Modal */}
      <AdminPhone2FAModal
        isOpen={is2FAModalOpen}
        phoneNumber={adminConfig.superAdminPhone || '+919173598234'}
        onVerified={handle2FAVerified}
        onCancel={() => {
          setIs2FAModalOpen(false);
          setPendingAdminSession(null);
        }}
      />

      {/* Smooth Transition Overlay on Successful Login */}
      {transitioningSession && (
        <AmulLoginSuccessTransition
          userName={transitioningSession.fullName || transitioningSession.username}
          shopName={
            shops.find(s => s.id === transitioningSession.shopId || s.shopCode === transitioningSession.shopCode)?.name ||
            transitioningSession.shopCode ||
            (transitioningSession.role === 'ADMIN' ? 'Amul Headquarters Admin HQ' : 'Amul Preferred Parlour')
          }
        />
      )}

    </div>
  );
};
