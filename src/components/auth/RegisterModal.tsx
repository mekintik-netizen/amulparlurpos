/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Register New ID Modal for Amul Parlour
 * Adheres to strict zero-plaintext password security:
 * - Passwords are never saved or exposed.
 * - Salting and SHA-256 hashing occurs client-side before storing.
 */

import React, { useState } from 'react';
import { Shop } from '../../types/index.ts';
import { UserRole, registerLocalUser } from '../../storage/auth.ts';
import { X, UserPlus, Shield, Store, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  shops: Shop[];
  onUserRegistered: (username: string, role: UserRole, shopCode?: string) => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  shops,
  onUserRegistered
}) => {
  const [role, setRole] = useState<UserRole>('SHOP_USER');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [shopId, setShopId] = useState(shops[0]?.id || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const selectedShop = shops.find(s => s.id === shopId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    if (role === 'SHOP_USER' && (!shopId || !selectedShop)) {
      setError('Please select an active shop for this cashier account.');
      return;
    }

    setLoading(true);
    try {
      await registerLocalUser({
        username,
        fullName: fullName || username,
        password,
        role,
        shopId: role === 'SHOP_USER' ? shopId : undefined,
        shopCode: role === 'SHOP_USER' ? selectedShop?.shopCode : undefined
      });

      setSuccess(true);
      setTimeout(() => {
        onUserRegistered(username.trim().toLowerCase(), role, selectedShop?.shopCode);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to register new ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#005A9C] to-[#003870] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Register New ID</h3>
              <p className="text-xs text-blue-200">Create local operator or admin credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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
              <span>Account registered successfully!</span>
            </div>
          )}

          {/* Account Role Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Account Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('SHOP_USER')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  role === 'SHOP_USER'
                    ? 'bg-blue-50 border-[#005A9C] text-[#005A9C] shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Shop Cashier</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('ADMIN')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  role === 'ADMIN'
                    ? 'bg-rose-50 border-[#E31837] text-[#E31837] shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>HQ Admin</span>
              </button>
            </div>
          </div>

          {/* Shop Assignment (if SHOP_USER) */}
          {role === 'SHOP_USER' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assign to Parlour / Kiosk
              </label>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C] cursor-pointer"
                required
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shopCode} - {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Username / Operator ID
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. rahul_counter1 or amul_admin2"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
              required
            />
            <p className="text-[10px] text-slate-400 mt-0.5">Letters, numbers, underscores only</p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Set Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 4 characters"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-9 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
              required
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#005A9C] to-[#003870] hover:brightness-110 rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Registering...' : 'Create Account'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
