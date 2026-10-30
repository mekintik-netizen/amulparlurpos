/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/auth/AdminRegistration.tsx
 * 
 * Administrative Initialization & Registration Component
 * - Checks IndexedDB for an existing admin account on mount.
 * - If absent: provides a registration form to create a secure, locally hashed (SHA-256) admin account.
 * - Enforces zero-plaintext password storage (16-byte cryptographically random salt + Web Crypto SHA-256).
 * - Initializes the system's administrative capability (`master_admin_initialized: true`).
 * - Redirects back to the login page upon completion.
 * - If present: displays status indicating admin capability is already active and redirects to login.
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  KeyRound, 
  User, 
  Building2, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle, 
  ArrowLeft,
  Sparkles,
  ArrowRight,
  BadgeCheck,
  Key
} from 'lucide-react';
import { 
  AuthSession, 
  LocalUser,
  isMasterAdminInitialized, 
  getAllLocalUsers,
  performOneTimeAdminSetup 
} from '../../storage/auth.ts';

export interface AdminRegistrationProps {
  onSuccess?: (session: AuthSession) => void;
  onSetupComplete?: (session: AuthSession) => void;
  onNavigateToLogin?: (registeredUsername?: string) => void;
  onCancel?: () => void;
}

export const AdminRegistration: React.FC<AdminRegistrationProps> = ({
  onSuccess,
  onSetupComplete,
  onNavigateToLogin,
  onCancel
}) => {
  const [isChecking, setIsChecking] = useState(true);
  const [hasExistingAdmin, setHasExistingAdmin] = useState(false);
  const [existingAdmin, setExistingAdmin] = useState<LocalUser | null>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('Chief Franchise Administrator');
  const [designation, setDesignation] = useState('Headquarters Administrator');
  const [department, setDepartment] = useState('Amul Retail Network Operations');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check IndexedDB for an existing admin account on mount
  useEffect(() => {
    let isMounted = true;

    const checkAdminAccount = async () => {
      try {
        setIsChecking(true);
        const [isInitialized, allUsers] = await Promise.all([
          isMasterAdminInitialized(),
          getAllLocalUsers()
        ]);

        const masterAdmin = allUsers.find(u => u.role === 'ADMIN' && u.isMasterAdmin === true) 
          || allUsers.find(u => u.role === 'ADMIN');

        if (!isMounted) return;

        if (isInitialized || masterAdmin) {
          setHasExistingAdmin(true);
          setExistingAdmin(masterAdmin || null);
        } else {
          setHasExistingAdmin(false);
          setExistingAdmin(null);
        }
      } catch (err) {
        console.error('Error verifying admin existence in IndexedDB:', err);
        if (isMounted) {
          setHasExistingAdmin(false);
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };

    checkAdminAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (!pwd) return { score: 0, label: 'None', color: 'bg-slate-200' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    switch (score) {
      case 1:
        return { score: 25, label: 'Basic (Min 6 chars)', color: 'bg-rose-500' };
      case 2:
        return { score: 50, label: 'Moderate', color: 'bg-amber-500' };
      case 3:
        return { score: 75, label: 'Good', color: 'bg-blue-500' };
      case 4:
      default:
        return { score: 100, label: 'Strong & Secure', color: 'bg-emerald-500' };
    }
  };

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setError('Admin username must be at least 3 characters.');
      return;
    }

    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setError('Username may only contain letters, numbers, hyphens, dots, and underscores.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Master administrator password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify both password fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Secure local initialization: salts with 16 random bytes and hashes with SHA-256
      // Stores zero plaintext passwords and sets master_admin_initialized: true
      const session = await performOneTimeAdminSetup({
        username: cleanUsername,
        fullName: fullName.trim() || `${cleanUsername} (Master Admin)`,
        password,
        designation: designation.trim() || 'Chief Franchise Administrator',
        department: department.trim() || 'Amul Headquarters'
      });

      setSuccessMessage(`Administrator @${cleanUsername} successfully registered! Administrative capability initialized.`);

      // Redirect back to login page upon completion
      setTimeout(() => {
        if (onNavigateToLogin) {
          onNavigateToLogin(cleanUsername);
        } else if (onSuccess) {
          onSuccess(session);
        } else if (onSetupComplete) {
          onSetupComplete(session);
        } else if (onCancel) {
          onCancel();
        }
      }, 1500);

    } catch (err: any) {
      setError(err?.message || 'Failed to initialize administrative capability in IndexedDB.');
      setIsSubmitting(false);
    }
  };

  const handleRedirectToLogin = () => {
    if (onNavigateToLogin) {
      onNavigateToLogin(existingAdmin?.username);
    } else if (onCancel) {
      onCancel();
    }
  };

  const pwdStrength = getPasswordStrength(password);

  // 1. Loading State
  if (isChecking) {
    return (
      <div className="min-h-[480px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#003870] to-[#E31837] flex items-center justify-center text-white shadow-lg animate-pulse mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">Checking Admin Records...</h3>
        <p className="text-xs text-slate-500 mt-1">Verifying administrator setup.</p>
      </div>
    );
  }

  // 2. Success State: shows confirmation and redirects
  if (successMessage) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-xl border border-emerald-200 overflow-hidden text-center p-8 space-y-6">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner animate-bounce">
          <BadgeCheck className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Administrator Setup Complete
          </h2>
          <p className="text-xs text-slate-600 mt-1.5 max-w-md mx-auto">
            {successMessage}
          </p>
        </div>

        <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-2xl p-4 text-left text-xs text-emerald-900 space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Setup Complete:</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-emerald-800 space-y-1 ml-1">
            <li>Administrator account successfully initialized</li>
            <li>Ready to approve shops and manage franchise subscription plans</li>
          </ul>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 font-semibold animate-pulse">
          <span>Redirecting to Login Page...</span>
          <ArrowRight className="w-4 h-4" />
        </div>

        <button
          type="button"
          onClick={handleRedirectToLogin}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 transition cursor-pointer"
        >
          Click if not redirected automatically
        </button>
      </div>
    );
  }

  // 3. Existing Admin Found: Status Screen & Redirect Option
  if (hasExistingAdmin) {
    return (
      <div className="max-w-lg w-full mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#003870] via-[#005A9C] to-[#002B54] text-white p-6 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                <Sparkles className="w-3 h-3" />
                <span>Admin Initialized</span>
              </div>
              <h2 className="text-base font-extrabold text-white">
                Admin Account Already Exists
              </h2>
            </div>
          </div>
        </div>

        {/* Informative Body */}
        <div className="p-6 space-y-5">
          <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-bold text-amber-950 mb-0.5">Administrator Account Ready</p>
              An administrative account is already configured on this system.
            </div>
          </div>

          {/* Existing Admin Details Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="text-xs font-bold text-slate-700">Configured Master Admin:</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-semibold">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Username</span>
                <span className="font-mono font-bold text-slate-800">
                  @{existingAdmin?.username || 'admin'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Full Name</span>
                <span className="font-medium text-slate-800">
                  {existingAdmin?.fullName || 'Amul HQ Administrator'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Designation</span>
                <span className="text-slate-700">
                  {existingAdmin?.designation || 'Headquarters Admin'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Role</span>
                <span className="text-slate-700">
                  System Administrator
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal text-center">
            Please log in using your administrator credentials on the login page.
          </p>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleRedirectToLogin}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#E31837] to-[#B30E26] hover:brightness-110 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Key className="w-4 h-4" />
              <span>Redirect to Login Page</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancel & Return
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. No Admin Exists: Registration Form to Create Secure SHA-256 Admin Account
  return (
    <div className="max-w-lg w-full mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#003870] via-[#005A9C] to-[#002B54] text-white p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shrink-0">
            <ShieldCheck className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="w-3 h-3" />
              <span>One-Time Local Setup</span>
            </div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Admin Registration & Setup
            </h2>
            <p className="text-xs text-blue-100">
              Create the primary administrator account for franchise operations.
            </p>
          </div>
        </div>
      </div>

      {/* Main Registration Form */}
      <form onSubmit={handleRegisterAdmin} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-xs text-blue-900 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-blue-950 mb-0.5">
            <KeyRound className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span>Administrator Account Setup</span>
          </div>
          Create your administrator profile to manage franchise parlours, verify owners, and configure plans.
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Admin Username <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
              @
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
              placeholder="Enter admin ID / username"
              className="w-full text-xs font-mono pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
              required
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Letters, numbers, and underscores only. Min 3 characters.
          </span>
        </div>

        {/* Full Name & Designation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Administrator Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <User className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Chief Administrator"
                className="w-full text-xs pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Designation / Role
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Building2 className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Headquarters Admin"
                className="w-full text-xs pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
              />
            </div>
          </div>
        </div>

        {/* Department */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Department / Division
          </label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Amul Retail Network Operations"
            className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">
              Admin Password <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] text-slate-400">Min 6 characters</span>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Lock className="w-3.5 h-3.5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full text-xs pl-8 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password Strength Meter */}
          {password && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${pwdStrength.color} transition-all duration-300`} 
                  style={{ width: `${pwdStrength.score}%` }} 
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500">
                <span>Strength: <strong className="text-slate-700">{pwdStrength.label}</strong></span>
                <span>Protected</span>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Confirm Password <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Lock className="w-3.5 h-3.5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full text-xs pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003870]"
              required
            />
          </div>
        </div>

        {/* Submit & Cancel Buttons */}
        <div className="pt-2 space-y-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#003870] via-[#005A9C] to-[#E31837] hover:brightness-110 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Initializing Administrative Capability...</span>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Register Admin & Initialize Capability</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRedirectToLogin}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Login Page</span>
          </button>
        </div>
      </form>
    </div>
  );
};
