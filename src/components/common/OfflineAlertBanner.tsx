/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Offline Detection & Automatic Sync Alert Component
 * - Displays instant, prominent warning popup and top banner when offline:
 *   "ઇન્ટરનેટ કનેક્શન નથી! કૃપા કરીને ઇન્ટરનેટ ચાલુ કરો જેથી ડેટા સર્વર પર સેવ થઈ શકે."
 * - Reassures users that local data is safe in IndexedDB
 * - Automatically detects reconnection, hides the popup, triggers background sync,
 *   and displays a success banner:
 *   "ઇન્ટરનેટ કનેક્ટ થયું! ડેટા ક્લાઉડ સાથે સફળતાપૂર્વક સિંક થયો છે."
 */

import React, { useState } from 'react';
import { 
  WifiOff, 
  Wifi, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  X, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useNetworkStatus } from '../../storage/offlineSyncManager.ts';
import { Shop } from '../../types/index.ts';

interface OfflineAlertBannerProps {
  currentShop: Shop | null;
}

export const OfflineAlertBanner: React.FC<OfflineAlertBannerProps> = ({ currentShop }) => {
  const {
    isOnline,
    isSyncing,
    showOfflineModal,
    dismissOfflineModal,
    reopenOfflineModal,
    showReconnectedToast,
    dismissReconnectedToast,
    syncStats,
    checkConnectionNow
  } = useNetworkStatus(currentShop?.id);

  const [isChecking, setIsChecking] = useState(false);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await checkConnectionNow();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      {/* 1. Persistent Top Warning Banner When Offline */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold shadow-md border-b border-amber-600 transition-all flex flex-wrap items-center justify-between gap-2 z-40 sticky top-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
            </span>
            <WifiOff className="w-4 h-4 shrink-0 text-slate-950" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[13px] font-black tracking-tight text-slate-950">
                ઇન્ટરનેટ કનેક્શન નથી! કૃપા કરીને ઇન્ટરનેટ ચાલુ કરો જેથી ડેટા સર્વર પર સેવ થઈ શકે.
              </span>
              <span className="text-[11px] font-semibold text-slate-900 opacity-90 hidden md:inline">
                (No internet connection! Data saved locally in IndexedDB &amp; will auto-sync on reconnect)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleManualCheck}
              disabled={isChecking}
              className="px-2.5 py-1 bg-slate-950 text-amber-400 hover:bg-slate-900 text-[11px] font-bold rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'તપાસી રહ્યું છે...' : 'કનેક્શન તપાસો / Retry'}</span>
            </button>
            <button
              onClick={reopenOfflineModal}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition"
            >
              વિગત / Info
            </button>
          </div>
        </div>
      )}

      {/* 2. Success Banner on Reconnection & Auto-Sync */}
      {isOnline && showReconnectedToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold shadow-lg transition-all flex items-center justify-between gap-3 z-40 sticky top-0 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-500/80 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-[13px] font-black">
                ઇન્ટરનેટ કનેક્ટ થયું! ડેટા ક્લાઉડ સાથે સફળતાપૂર્વક સિંક થયો છે.
              </div>
              <div className="text-[11px] font-medium text-emerald-100 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  Internet connection restored! All offline bills, purchases &amp; stock records are live on Cloud Firestore.
                  {syncStats && syncStats.totalSynced > 0 && ` (${syncStats.totalSynced} items synchronized)`}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={dismissReconnectedToast}
            className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Syncing In Progress Indicator Badge (Floating bottom right) */}
      {isSyncing && (
        <div className="fixed bottom-4 left-4 z-50 bg-slate-900/90 text-white px-3.5 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold backdrop-blur-xs border border-slate-700 animate-pulse">
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
          <span>ક્લાઉડ સાથે સિંક થઈ રહ્યું છે... / Syncing to Cloud...</span>
        </div>
      )}

      {/* 4. Prominent Warning Popup Modal When Internet Drops */}
      {!isOnline && showOfflineModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border-2 border-amber-500/80 text-slate-900 dark:text-slate-100 relative">
            <button
              onClick={dismissOfflineModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                <WifiOff className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-extrabold text-[10px] uppercase tracking-wider mb-1">
                  Offline Alert / ઓફલાઇન ચેતવણી
                </span>
                <h3 className="font-black text-slate-900 dark:text-white text-base leading-snug">
                  ઇન્ટરનેટ કનેક્શન નથી! કૃપા કરીને ઇન્ટરનેટ ચાલુ કરો જેથી ડેટા સર્વર પર સેવ થઈ શકે.
                </h3>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2 mb-5 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 dark:text-white">સ્થાનિક ડિવાઇસમાં ડેટા સુરક્ષિત છે (IndexedDB):</strong>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    તમે કાઉન્ટર બિલિંગ, પ્રિન્ટિંગ અને સ્ટોક એન્ટ્રી કોઈપણ અડચણ વગર ચાલુ રાખી શકો છો. તમામ ટ્રાન્ઝેક્શન આ કોમ્પ્યુટરમાં સુરક્ષિત રીતે સેવ થઈ રહ્યા છે.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <Database className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 dark:text-white">ઓટોમેટિક બેકગ્રાઉન્ડ સિંક:</strong>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    જેવું ઇન્ટરનેટ કનેક્શન ફરી શરૂ થશે, સિસ્ટમ આપોઆપ તમામ પેન્ડિંગ બિલ અને પરચેઝ એન્ટ્રીઝ ક્લાઉડ ફાયરસ્ટોર ડેટાબેઝ પર અપલોડ કરી દેશે.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
              <button
                onClick={dismissOfflineModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                ઓફલાઇન બિલિંગ ચાલુ રાખો / Continue Offline
              </button>
              <button
                onClick={handleManualCheck}
                disabled={isChecking}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'તપાસી રહ્યું છે...' : 'કનેક્શન ફરી તપાસો / Retry Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
