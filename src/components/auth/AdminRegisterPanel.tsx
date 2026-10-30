/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dedicated Admin Registration Panel for Amul Franchise Headquarters
 * Allows registering authorized administrators with salted SHA-256 password hashing.
 * Passwords are never saved in plaintext.
 */

import React, { useState } from 'react';
import { registerLocalUser } from '../../storage/auth.ts';
import { Shield, CheckCircle, AlertCircle, Eye, EyeOff, ArrowLeft, Key } from 'lucide-react';

interface AdminRegisterPanelProps {
  onBackToLogin: () => void;
  onAdminRegistered: (username: string) => void;
}

export const AdminRegisterPanel: React.FC<AdminRegisterPanelProps> = ({
  onBackToLogin,
  onAdminRegistered
}) => {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('Franchise Operations');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 4) {
      setError('Admin password must be at least 4 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      await registerLocalUser({
        username,
        fullName: fullName || `${username} (${department})`,
        password,
        role: 'ADMIN'
      });

      setSuccess(true);
      setTimeout(() => {
        onAdminRegistered(username.trim().toLowerCase());
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to register administrator account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 animate-in fade-in duration-200">
      {/* Back button */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Admin Login</span>
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
          HQ Admin Setup
        </span>
      </div>

      <div className="text-center space-y-1">
        <div className="w-10 h-10 bg-rose-100 text-[#E31837] rounded-xl flex items-center justify-center mx-auto mb-2">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-extrabold text-slate-900">
          Register System Administrator
        </h3>
        <p className="text-xs text-slate-500">
          Create an administrator ID to register parlours, verify owners, and manage plans.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-semibold">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Admin registered successfully! Redirecting to sign in...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
            Admin Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. gujarat_admin or hq_manager"
            className="w-full text-xs bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white font-mono"
            required
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Letters, numbers, underscores only</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
            Full Name & Officer Title
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Vikram Patel (Regional Head)"
            className="w-full text-xs bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
            Department / Division
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full text-xs bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white cursor-pointer"
          >
            <option value="Franchise Operations">Franchise Operations</option>
            <option value="District Marketing">District Marketing</option>
            <option value="Audit & Compliance">Audit & Compliance</option>
            <option value="IT & POS Support">IT & POS Support</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
            Admin Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              className="w-full text-xs bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 rounded-xl px-3 py-2 pr-9 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
            Confirm Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full text-xs bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || success}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-black hover:bg-neutral-900 active:bg-neutral-950 border border-neutral-800 shadow-md transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Creating Administrator...' : 'Create Admin ID'}
        </button>
      </form>
    </div>
  );
};
