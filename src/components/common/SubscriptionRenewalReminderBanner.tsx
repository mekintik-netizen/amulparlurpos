/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 10-Day Advance Subscription Renewal Reminder Banner
 * Shown when shop owner/cashier has 10 or fewer days remaining before subscription expiry.
 * Non-blocking, allows full POS operation while providing a 1-click modal for payment.
 * 
 * Supports distinct pricing & messages:
 * 1. New Shops (First Month / Onboarding): Setup ₹2500 + Sub ₹500 = ₹3000
 * 2. Existing / Regular Shops: Monthly renewal ₹500
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, X, QrCode } from 'lucide-react';
import { Shop, SubscriptionSettingsConfig } from '../../types/index.ts';
import { isShopSubscriptionActive, isNewShop } from '../../storage/subscription.ts';
import { getCachedSubscriptionSettings, subscribeToSubscriptionSettings } from '../../storage/subscriptionSettings.ts';
import { SubscriptionExpiredLockOverlay } from './SubscriptionExpiredLockOverlay.tsx';

interface SubscriptionRenewalReminderBannerProps {
  currentShop: Shop | null;
  onRefreshShops?: () => void;
}

export const SubscriptionRenewalReminderBanner: React.FC<SubscriptionRenewalReminderBannerProps> = ({
  currentShop,
  onRefreshShops
}) => {
  const [config, setConfig] = useState<SubscriptionSettingsConfig>(getCachedSubscriptionSettings());
  const [isDismissed, setIsDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSubscriptionSettings((cfg) => {
      setConfig(cfg);
    });
    return () => unsub();
  }, []);

  if (!currentShop || isDismissed) return null;

  const subCheck = isShopSubscriptionActive(currentShop);

  // Only display if plan is still active, but within warning threshold (default 10 days)
  const threshold = config.warningDaysThreshold || 10;
  if (!subCheck.isActive || subCheck.daysRemaining > threshold || subCheck.daysRemaining <= 0) {
    return null;
  }

  const isNew = isNewShop(currentShop);
  const setupCharge = config.setupFee || 2500;
  const monthlyCharge = config.monthlyFee || 500;
  const newShopTotal = config.newShopTotalFee || (setupCharge + monthlyCharge);
  const amount = isNew ? newShopTotal : monthlyCharge;

  return (
    <>
      <div className={`text-white px-4 py-2.5 text-xs font-bold shadow-xs flex flex-wrap items-center justify-between gap-3 border-b ${
        isNew 
          ? 'bg-linear-to-r from-blue-700 via-indigo-700 to-blue-800 border-blue-900/60'
          : 'bg-linear-to-r from-amber-500 via-orange-500 to-amber-600 border-amber-600/50'
      }`}>
        <div className="flex items-center gap-2.5 max-w-4xl">
          <span className="p-1 rounded-md bg-white/20 shrink-0">
            <Sparkles className="w-4 h-4 text-yellow-200" />
          </span>
          <div className="leading-relaxed">
            {isNew ? (
              <span>
                ⚠️ તમારું ૧ મહિનાનું ફ્રી ટ્રાયલ પૂરું થયું છે. સેટઅપ ચાર્જ ₹૨૫૦૦ + સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦ મળીને <strong>પહેલા મહિને કુલ ₹૩૦૦૦</strong> નું પેમેન્ટ કરવાનું રહેશે. ત્યારપછીના મહિનાથી દર મહિને માત્ર ₹૫૦૦ સબ્સ્ક્રિપ્શન ચાર્જ આવશે.
              </span>
            ) : (
              <span>
                ⚠️ તમારું માસિક સબ્સ્ક્રિપ્શન પૂરું થવામાં <strong>{subCheck.daysRemaining} દિવસ બાકી</strong> છે. સોફ્ટવેર ચાલુ રાખવા માટે કૃપા કરીને રિન્યુઅલ ચાર્જ <strong>₹૫૦૦</strong> પેમેન્ટ કરો.
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              isNew
                ? 'bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black'
                : 'bg-white text-orange-900 hover:bg-orange-50'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-blue-900" />
            <span>₹{amount.toLocaleString('en-IN')} {isNew ? 'પેમેન્ટ QR જુઓ' : 'રિન્યુઅલ QR જુઓ'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-white/20 rounded text-white/80 hover:text-white transition cursor-pointer"
            title="Dismiss notice for this session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Advance Renewal / First Month Payment Details Modal */}
      {showModal && (
        <SubscriptionExpiredLockOverlay
          currentShop={currentShop}
          previewMode="WARNING_10_DAYS"
          onLogout={() => setShowModal(false)}
          onCheckStatus={() => {
            if (onRefreshShops) onRefreshShops();
            setShowModal(false);
          }}
        />
      )}
    </>
  );
};
