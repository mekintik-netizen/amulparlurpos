/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Full-Screen "Subscription Expired" Lock Screen
 * Protects counter while guaranteeing 100% data safety (no records ever deleted).
 * Displays Master Admin's dynamic UPI Payment QR, Gujarati instructions,
 * and direct phone hotline for instant renewal.
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Phone, 
  QrCode, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  RefreshCw,
  LogOut
} from 'lucide-react';
import { Shop } from '../../types/index.ts';
import amulLogo from '../../assets/logo.ts';
import { subscribeToAdminAuthConfig, DEFAULT_ADMIN_AUTH_CONFIG, AdminAuthConfig } from '../../storage/firebase.ts';

interface SubscriptionExpiredLockOverlayProps {
  currentShop: Shop;
  onLogout?: () => void;
  onCheckStatus?: () => void;
}

export const SubscriptionExpiredLockOverlay: React.FC<SubscriptionExpiredLockOverlayProps> = ({
  currentShop,
  onLogout,
  onCheckStatus
}) => {
  const [adminConfig, setAdminConfig] = useState<AdminAuthConfig>(DEFAULT_ADMIN_AUTH_CONFIG);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAdminAuthConfig((config) => {
      setAdminConfig(config);
    });
    return () => unsub();
  }, []);

  const handleRefresh = async () => {
    setChecking(true);
    if (onCheckStatus) {
      await onCheckStatus();
    }
    setTimeout(() => setChecking(false), 800);
  };

  const adminPhone = adminConfig.superAdminPhone || '+919173598234';
  const qrUrl = adminConfig.paymentQrUrl || 
    `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      `upi://pay?pa=amulparlour.admin@okhdfcbank&pn=Amul%20HQ%20Admin&cu=INR`
    )}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none">
      <div className="bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-center shadow-2xl relative my-auto">
        {/* Top Lock Badge */}
        <div className="flex justify-center mb-3">
          <div className="bg-white p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <img
              src={amulLogo}
              alt="Amul"
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>

        <div className="inline-flex items-center gap-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-3">
          <Lock className="w-3.5 h-3.5" />
          <span>Subscription Plan Expired (પ્લાન સમાપ્ત)</span>
        </div>

        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
          {currentShop.name}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
          Parlour Code: {currentShop.shopCode}
        </p>

        {/* Master Admin Dynamic Payment QR Code Box */}
        <div className="my-5 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>Master Admin Renewal Payment QR (રીન્યુઅલ પેમેન્ટ QR)</span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 shadow-md">
            <img
              src={qrUrl}
              alt="Admin UPI QR"
              className="w-44 h-44 object-contain mx-auto"
            />
          </div>

          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
            Scan via GPay / PhonePe / Paytm / BHIM UPI
          </span>
        </div>

        {/* Exact Gujarati Message Requested by User */}
        <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3.5 text-xs text-rose-900 dark:text-rose-200 leading-relaxed font-semibold mb-4 text-center">
          "તમારો માસિક પ્લાન સમાપ્ત થયો છે. રિન્યુઅલ માટે ઉપરના QR કોડ પર પેમેન્ટ કરી એડમિનનો સંપર્ક કરો."
        </div>

        {/* Hotline Contact & 100% Data Safe Guarantee */}
        <div className="flex flex-col gap-2 mb-5">
          <a
            href={`tel:${adminPhone}`}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
          >
            <Phone className="w-4 h-4 text-blue-600" />
            <span>Contact Master Admin: {adminPhone}</span>
          </a>

          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>તમારો ડેટા (બિલ, સ્ટોક અને હિસાબ) ૧૦૦% સુરક્ષિત છે (Data Safe).</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'ચકાસી રહ્યા છીએ...' : 'Check Renewal Status'}</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
