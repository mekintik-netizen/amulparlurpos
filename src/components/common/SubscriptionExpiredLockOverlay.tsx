/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Professional "Subscription Expired" & Renewal Payment Modal
 * Features:
 * - Clear pricing structure for New Shops (₹3000 = ₹2500 Setup + ₹500 Sub) vs Existing Shops (₹500 Renewal)
 * - Professional Gujarati guidance & prominent payment details
 * - High-resolution UPI QR Code with instant scan support (GPay, PhonePe, Paytm, BHIM)
 * - Copyable UPI ID and Mobile Number for manual bank transfer
 * - Direct "WhatsApp પર સ્ક્રીનશોટ મોકલો" action button with pre-filled message tailored by shop tier
 * - Real-time synchronization with Firestore so admin updates instantly restore access
 * - Supports live Admin HQ preview mode (both Expired and 10-Day warning views, and Shop Tier toggle)
 */

import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  QrCode, 
  Lock, 
  CheckCircle2, 
  RefreshCw,
  LogOut,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Info
} from 'lucide-react';
import { Shop, SubscriptionSettingsConfig, DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG } from '../../types/index.ts';
import amulLogo from '../../assets/logo.ts';
import { 
  subscribeToSubscriptionSettings, 
  getCachedSubscriptionSettings, 
  getUpiQrCodeUrl, 
  getWhatsAppPaymentLink 
} from '../../storage/subscriptionSettings.ts';
import { isShopSubscriptionActive, isNewShop } from '../../storage/subscription.ts';

export interface SubscriptionExpiredLockOverlayProps {
  currentShop: Shop;
  onLogout?: () => void;
  onCheckStatus?: () => void;
  isPreview?: boolean; // When true, renders inline without fixed overlay for Admin Demo Tab
  previewMode?: 'EXPIRED' | 'WARNING_10_DAYS'; // Used in Admin Demo Tab
  shopTypeOverride?: 'NEW_SHOP' | 'EXISTING_SHOP'; // Allows testing both tiers in Admin Demo
  customSettings?: SubscriptionSettingsConfig; // Allows live editing preview
}

export const SubscriptionExpiredLockOverlay: React.FC<SubscriptionExpiredLockOverlayProps> = ({
  currentShop,
  onLogout,
  onCheckStatus,
  isPreview = false,
  previewMode = 'EXPIRED',
  shopTypeOverride,
  customSettings
}) => {
  const [config, setConfig] = useState<SubscriptionSettingsConfig>(
    customSettings || getCachedSubscriptionSettings()
  );
  const [checking, setChecking] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Subscribe to real-time subscription settings updates from Firestore
  useEffect(() => {
    if (customSettings) {
      setConfig(customSettings);
      return;
    }

    const unsub = subscribeToSubscriptionSettings((newConfig) => {
      setConfig(newConfig);
    });

    return () => unsub();
  }, [customSettings]);

  const handleRefresh = async () => {
    setChecking(true);
    if (onCheckStatus) {
      await onCheckStatus();
    }
    setTimeout(() => setChecking(false), 900);
  };

  const handleCopyUpi = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(config.upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const handleCopyPhone = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(config.adminPhone || config.whatsappNumber);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const isWarningMode = previewMode === 'WARNING_10_DAYS';

  // Determine if this is a New Shop (First Month / Onboarding Expiry / Free Trial) or Existing Shop
  const isNew = shopTypeOverride 
    ? shopTypeOverride === 'NEW_SHOP'
    : isNewShop(currentShop);

  // Pricing configuration
  const setupCharge = config.setupFee || 2500;
  const monthlyCharge = config.monthlyFee || 500;
  const newShopTotal = config.newShopTotalFee || (setupCharge + monthlyCharge);
  const totalPayable = isNew ? newShopTotal : monthlyCharge;

  // Days remaining calculation
  const subCheck = isShopSubscriptionActive(currentShop);
  const daysRemaining = subCheck.daysRemaining > 0 ? subCheck.daysRemaining : 10;

  // URLs
  const qrCodeUrl = getUpiQrCodeUrl(config, totalPayable, currentShop, isNew);
  const whatsappUrl = getWhatsAppPaymentLink(config, currentShop, totalPayable, isNew);

  // Headers and Messages tailored by shop tier
  const title = isNew
    ? (isWarningMode 
        ? '⚠️ ૧ મહિનાનું ફ્રી ટ્રાયલ સમાપ્તિ (First Month Onboarding)'
        : '⚠️ ૧ મહિનાનું ફ્રી ટ્રાયલ સમાપ્ત (Trial Expired)')
    : (isWarningMode
        ? (config.warningHeaderTitle || '⚠️ સબ્સ્ક્રિપ્શન રિન્યુઅલ ચેતવણી (Subscription Renewal Due)')
        : (config.headerTitle || '⚠️ સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે (Subscription Expired)'));

  // Gujarati Message Content
  const messageContent = isNew
    ? (config.newShopMessageGujarati || '⚠️ તમારું ૧ મહિનાનું ફ્રી ટ્રાયલ પૂરું થયું છે. સેટઅપ ચાર્જ ₹૨૫૦૦ + સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦ મળીને પહેલા મહિને કુલ ₹૩૦૦૦ નું પેમેન્ટ કરવાનું રહેશે. ત્યારપછીના મહિનાથી દર મહિને માત્ર ₹૫૦૦ સબ્સ્ક્રિપ્શન ચાર્જ આવશે.')
    : (isWarningMode
        ? `⚠️ તમારું માસિક સબ્સ્ક્રિપ્શન પૂરું થવામાં ${daysRemaining} દિવસ બાકી છે. સોફ્ટવેર ચાલુ રાખવા માટે કૃપા કરીને રિન્યુઅલ ચાર્જ ₹૫૦૦ પેમેન્ટ કરો.`
        : (config.messageGujarati || 'તમારો ૧ મહિનાનો સબ્સ્ક્રિપ્શન સમય પૂરો થઈ ગયો છે. સોફ્ટવેર સતત ચાલુ રાખવા માટે કૃપા કરીને નીચે આપેલા QR Code પર ₹૫૦૦ (₹500) નું પેમેન્ટ કરીને સબ્સ્ક્રિપ્શન રિન્યુ કરાવો.'));

  // Modal Container: fixed overlay for real expiry, or inline container for Admin Demo preview
  const wrapperClass = isPreview
    ? 'w-full flex items-center justify-center p-2'
    : 'fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn select-none';

  return (
    <div className={wrapperClass}>
      <div className="bg-white dark:bg-slate-900 border-2 border-rose-500/90 dark:border-rose-600 rounded-3xl max-w-lg w-full p-5 sm:p-7 text-center shadow-2xl relative my-auto transition-all">
        {/* Top Header Badge & Logo */}
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <img
                src={amulLogo}
                alt="Amul"
                className="h-8 w-auto object-contain"
              />
            </div>
            <div className="text-left">
              <div className="text-xs font-black text-blue-900 dark:text-blue-400">AMUL PARLOUR POS</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {isNew ? 'નવું પાર્લર (New Shop Onboarding)' : 'ચાલુ પાર્લર (Regular Shop Renewal)'}
              </div>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
            isWarningMode 
              ? 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}>
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{isWarningMode ? `૧૦ દિવસ બાકી (${daysRemaining}d Left)` : 'Expired (સમાપ્ત)'}</span>
          </div>
        </div>

        {/* Header / Title */}
        <div className="my-2">
          <h2 className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 leading-snug">
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-bold">
            <span>{currentShop.name}</span>
            <span className="text-slate-400 font-normal">•</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {currentShop.shopCode}
            </span>
          </div>
        </div>

        {/* Gujarati Message Content Box */}
        <div className={`border rounded-2xl p-3.5 text-xs leading-relaxed font-semibold my-3 text-left sm:text-center shadow-2xs ${
          isNew 
            ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300/80 dark:border-blue-900/60 text-blue-950 dark:text-blue-200'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300/80 dark:border-amber-900/60 text-amber-950 dark:text-amber-200'
        }`}>
          {messageContent}
        </div>

        {/* Payment Details Box with Explicit Line-Item Breakdown */}
        <div className="my-3.5 p-4 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border-2 border-blue-500/30 dark:border-blue-500/20 shadow-xs flex flex-col items-center">
          {/* Prominent Amount Highlight */}
          <div className={`w-full text-white rounded-xl py-2 px-4 shadow-sm mb-3.5 ${
            isNew 
              ? 'bg-linear-to-r from-blue-800 via-indigo-700 to-blue-900'
              : 'bg-linear-to-r from-blue-700 via-[#005A9C] to-blue-800'
          }`}>
            <div className="text-[10px] uppercase font-bold tracking-widest text-blue-100">
              {isNew ? 'નવા પાર્લર માટે પ્રથમ મહિનાનું કુલ પેમેન્ટ' : 'સબ્સ્ક્રિપ્શન રિન્યુઅલ ફી / RENEWAL AMOUNT'}
            </div>
            <div className="text-xl sm:text-2xl font-black tracking-tight mt-0.5 flex items-center justify-center gap-1">
              <span>રકમ / Amount:</span>
              <span className="text-yellow-300 font-mono">₹{totalPayable.toLocaleString('en-IN')}</span>
              <span className="text-xs font-semibold text-blue-100">
                {isNew ? '(સેટઅપ + પહેલો મહિનો)' : '/ મહિનો (Month)'}
              </span>
            </div>
          </div>

          {/* Payment Breakdown Line Items */}
          <div className="w-full bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 mb-3 text-xs space-y-1.5 text-left">
            <div className="font-extrabold text-slate-800 dark:text-slate-200 pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span>પેમેન્ટ વિગતો (Payment Breakdown):</span>
              <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                {isNew ? 'New Shop Tier' : 'Regular Tier'}
              </span>
            </div>

            {isNew ? (
              <>
                {/* New Shop Breakdown */}
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                  <span>૧. સેટઅપ ચાર્જ (Setup &amp; Provisioning):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₹{setupCharge.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                  <span>૨. સબ્સ્ક્રિપ્શન ચાર્જ (1st Month Subscription):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₹{monthlyCharge.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 font-black text-blue-900 dark:text-blue-300 text-xs">
                  <span>પહેલા મહિને કુલ ચૂકવવાપાત્ર રકમ (Total):</span>
                  <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">
                    ₹{newShopTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="pt-1 text-[10px] text-slate-500 dark:text-slate-400 italic">
                  * ત્યારપછીના મહિનાથી દર મહિને માત્ર ₹૫૦૦ સબ્સ્ક્રિપ્શન ચાર્જ આવશે.
                </div>
              </>
            ) : (
              <>
                {/* Existing Shop Breakdown */}
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                  <span>૧. માસિક સબ્સ્ક્રિપ્શન રિન્યુઅલ ચાર્જ:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₹{monthlyCharge.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 font-black text-blue-900 dark:text-blue-300 text-xs">
                  <span>કુલ ચૂકવવાપાત્ર રકમ (Total Renewal Fee):</span>
                  <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">
                    ₹{monthlyCharge.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="pt-1 text-[10px] text-slate-500 dark:text-slate-400 italic">
                  * દર મહિને માત્ર ₹૫૦૦ નિયમિત રિન્યુઅલ ચાર્જ.
                </div>
              </>
            )}
          </div>

          {/* UPI QR Code Container */}
          <div className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>UPI પેમેન્ટ QR Code (Scan to Pay ₹{totalPayable.toLocaleString('en-IN')})</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 shadow-md transition-transform hover:scale-[1.02]">
            <img
              src={qrCodeUrl}
              alt="Admin UPI Payment QR"
              className="w-44 h-44 sm:w-48 sm:h-48 object-contain mx-auto"
              loading="eager"
            />
          </div>

          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-2.5">
            GPay / PhonePe / Paytm / BHIM UPI દ્વારા સ્કેન કરો
          </span>

          {/* Manual Transfer Credentials (UPI ID & Mobile) */}
          <div className="w-full mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="truncate mr-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">UPI ID:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 select-all text-[11px]">
                  {config.upiId}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                title="Copy UPI ID"
              >
                {copiedUpi ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 text-[10px]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[10px]">કોપી</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="truncate mr-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Payee / Mobile:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 select-all text-[11px]">
                  {config.payeeName} ({config.adminPhone || config.whatsappNumber})
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                title="Copy Mobile"
              >
                {copiedPhone ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 text-[10px]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[10px]">કોપી</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* WhatsApp Direct Action Button */}
        <div className="space-y-2.5 my-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition flex items-center justify-center gap-2 shadow-md cursor-pointer border border-emerald-500 group"
          >
            <MessageCircle className="w-4 h-4 text-emerald-100 fill-white" />
            <span>WhatsApp પર સ્ક્રીનશોટ મોકલો</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
          </a>

          {/* 100% Data Safety Guarantee */}
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>તમારો ડેટા (બિલ, સ્ટોક અને હિસાબ) ૧૦૦% સુરક્ષિત છે (Data 100% Safe).</span>
          </div>
        </div>

        {/* System Access & Status Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={checking}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'ચકાસી રહ્યા છીએ...' : 'ચકાસો (Check Status)'}</span>
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
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
