/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 10-Day Advance Subscription Renewal Reminder Banner
 * Shown when shop owner/cashier has 10 or fewer days remaining before subscription expiry.
 * Non-blocking, allows full POS operation while providing a 1-click modal for ₹500 renewal.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, ArrowRight, X, QrCode } from 'lucide-react';
import { Shop, SubscriptionSettingsConfig } from '../../types/index.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
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

  const amount = config.monthlyFee || 500;

  return (
    <>
      <div className="bg-linear-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-2 text-xs font-bold shadow-xs flex flex-wrap items-center justify-between gap-2 border-b border-amber-600/50">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-white/20">
            <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
          </span>
          <span>
            ⚠️ સબ્સ્ક્રિપ્શન રિન્યુઅલ ચેતવણી: તમારા ૧ મહિનાના પ્લાનના માત્ર <strong>{subCheck.daysRemaining} દિવસ બાકી</strong> છે.
          </span>
          <span className="hidden sm:inline text-amber-100 font-normal">
            (અવિરત સેવા માટે ₹{amount} નું પેમેન્ટ કરી રિન્યુ કરાવો)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-3 py-1 bg-white text-orange-900 rounded-lg hover:bg-orange-50 font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <QrCode className="w-3 h-3 text-orange-600" />
            <span>₹{amount} રિન્યુઅલ QR જુઓ</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-white/20 rounded text-white/80 hover:text-white transition cursor-pointer"
            title="Dismiss notice for this session"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Advance Renewal Details Modal */}
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
