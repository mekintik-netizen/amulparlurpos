/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dedicated One-Time Master Administrator Setup Component
 * Features:
 * - One-time initial setup to store a secure local master admin credential in IndexedDB
 * - Permanently locks once initialized to ensure unauthorized users cannot overwrite
 * - Zero plaintext password storage (16-byte cryptographic salt + Web Crypto SHA-256)
 * - Required gateway: Only initialized administrators can create and provision shops
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  User, 
  Building2, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle, 
  ArrowLeft,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { 
  AuthSession, 
  isMasterAdminInitialized, 
  performOneTimeAdminSetup 
} from '../../storage/auth.ts';

interface AdminOneTimeSetupProps {
  onSetupComplete: (session: AuthSession) => void;
  onCancel?: () => void;
}

export const AdminOneTimeSetup: React.FC<AdminOneTimeSetupProps> = ({
  onSetupComplete,
  onCancel
}) => {
  const [alreadyInitialized, setAlreadyInitialized] = useState(false);
  const [checking, setChecking] = useState(true);

  // Form State
  const [username, setUsername] = useState('hq_admin');
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('Chief Franchise Administrator');
  const [department, setDepartment] = useState('Amul Headquarters - Retail Network');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkInit = async () => {
      try {
        const isInit = await isMasterAdminInitialized();
        setAlreadyInitialized(isInit);
      } catch (err) {
        console.error('Error checking admin status:', err);
      } finally {
        setChecking(false);
      }
    };
    checkInit();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Master Admin password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const session = await performOneTimeAdminSetup({
        username,
        fullName: fullName || `${username} (${designation})`,
        password,
        designation,
        department
      });

      setSuccess(true);
      setTimeout(() => {
        onSetupComplete(session);
      }, 1400);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete one-time admin setup.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-slate-200">
          <ShieldCheck className="w-8 h-8 text-blue-600 animate-pulse mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-700">Verifying Security Status...</p>
        </div>
      </div>
    );
  }

  // If already initialized, show permanent lock protection notice
  if (alreadyInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/50 to-slate-200 flex flex-col justify-center items-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              One-Time Setup Completed
            </span>
            <h2 className="text-lg font-black text-slate-900 pt-1">
              Master Admin Already Initialized
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              This terminal has already initialized its Master Administrator credential. To protect parlour management and franchise provisioning, one-time setup is permanently locked.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-left text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Shop Creation Access Policy</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Only signed-in administrators can create shops, configure plans, and verify owner identities.
            </p>
          </div>

          <button
            onClick={onCancel}
            type="button"
            className="w-full bg-[#005A9C] hover:bg-blue-800 text-white font-bold text-xs py-3 rounded-xl transition shadow-md cursor-pointer"
          >
            Go to Admin Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-[#003870] via-[#005A9C] to-[#002B54] text-white p-6 text-center relative overflow-hidden">
          <div className="relative z-10 flex flex-col items-center">
            
            {/* Amul Red Badge */}
            <div className="w-14 h-14 bg-[#E31837] rounded-2xl shadow-lg flex flex-col items-center justify-center border-2 border-white/20 mb-2.5">
              <span className="text-xl font-black text-white italic font-serif leading-none">
                Amul
              </span>
              <span className="text-[6px] uppercase tracking-widest font-extrabold text-amber-200 mt-0.5">
                HEADQUARTERS
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-amber-400/20 rounded-full text-amber-300 text-[10px] font-bold border border-amber-300/30 mb-1">
              <Sparkles className="w-3 h-3" />
              <span>One-Time System Initialization</span>
            </div>

            <h1 className="text-lg font-extrabold text-white tracking-tight">
              Master Admin Registration Setup
            </h1>
            <p className="text-xs text-blue-100/80 max-w-sm mt-0.5">
              Initialize administrator credentials. Only initialized admins can create and manage parlours.
            </p>
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Master Administrator initialized successfully!</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Username
              </label>
              <div className="relative">
                <div className="absolute left-3 top-2.5 text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. hq_admin"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Officer Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Anil Sharma"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Designation
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Chief Franchise Officer"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Department / Unit
              </label>
              <div className="relative">
                <div className="absolute left-3 top-2.5 text-slate-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Franchise Operations"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                />
              </div>
            </div>
          </div>

          {/* Password Inputs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Master Admin Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-2.5 text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Confirm Master Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
              required
            />
          </div>

          {/* Guidance Callout */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-[11px] text-amber-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span>One-Time Setup Notice:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-900/90 pl-1">
              <li><strong>Permanent Lock:</strong> Once registered, this initialization wizard cannot be run again.</li>
              <li><strong>Shop Authorization:</strong> Only this initialized administrator can register and approve shops.</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Back to Sign In
              </button>
            )}
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#E31837] to-[#B30E26] hover:brightness-110 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>{loading ? 'Initializing...' : 'Initialize & Lock Admin'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
