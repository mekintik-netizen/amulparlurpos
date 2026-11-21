/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Amul Parlour Web POS & Management Portal (Project 2 of 3)
 * Full local-first browser operations in IndexedDB:
 * - Brand launch reveal animation with Amul's iconic identity
 * - Dual Login (Shop Counter vs Admin HQ) with local cryptographic salt & SHA-256
 * - Zero plaintext password storage
 * - Barcode POS billing (58mm/80mm thermal receipts, USB scanner)
 * - Purchase bills & supplier ledger (confirmed purchases increase stock once)
 * - Stock movements & daily reconciliations (Opening + In - Sales - Out = Closing)
 * - Daily sales revenue & bill cancellation restoral
 * - Financial P&L summary (distinguishing sales revenue from gross/net margin)
 * - Product catalog management & barcode assignment
 * - Admin portal with unique Shop IDs and approval/subscription separation
 * - Automated daily 8:00 PM backup snapshots with missed backup detection
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header, ActiveTab } from './components/layout/Header.tsx';
import { LocalModeNotice } from './components/common/LocalModeNotice.tsx';
import { MissedBackupBanner } from './components/common/MissedBackupBanner.tsx';
import { OfflineAlertBanner } from './components/common/OfflineAlertBanner.tsx';
import { AmulLaunchAnimation } from './components/common/AmulLaunchAnimation.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { BarcodePOS } from './components/pos/BarcodePOS.tsx';
import { PurchaseManagement } from './components/purchases/PurchaseManagement.tsx';
import { SmartOrderManagement } from './components/purchases/SmartOrderManagement.tsx';
import { DailyStockReport } from './components/reports/DailyStockReport.tsx';
import { DailySalesReport } from './components/reports/DailySalesReport.tsx';
import { ExpenseManagement } from './components/expenses/ExpenseManagement.tsx';
import { CatalogManagement } from './components/catalog/CatalogManagement.tsx';
import { AdminPortal } from './components/admin/AdminPortal.tsx';
import { ThermalReceipt } from './components/pos/ThermalReceipt.tsx';
import { StockMovementModal } from './components/pos/StockMovementModal.tsx';
import { BackupRestoreModal } from './components/common/BackupRestoreModal.tsx';
import { TestSuiteModal } from './components/tests/TestSuiteModal.tsx';
import { ReportsHub } from './components/reports/ReportsHub.tsx';
import { BackupManagementView } from './components/backup/BackupManagementView.tsx';
import { ShopProfileManagement } from './components/profile/ShopProfileManagement.tsx';
import { BankStatementManagement } from './components/banking/BankStatementManagement.tsx';
import { AmulAiAssistant } from './components/ai/AmulAiAssistant.tsx';
import { RightSideNavigation } from './components/layout/RightSideNavigation.tsx';
import { MorningGreetingModal } from './components/common/MorningGreetingModal.tsx';
import { SubscriptionExpiredLockOverlay } from './components/common/SubscriptionExpiredLockOverlay.tsx';
import { SubscriptionRenewalReminderBanner } from './components/common/SubscriptionRenewalReminderBanner.tsx';
import { AmulStartupSplash } from './components/common/AmulBrandMotion.tsx';
import { Shop, SaleBill } from './types/index.ts';
import { AppRepository } from './storage/repositories.ts';
import {
  AuthSession,
  UserRole,
  getActiveSession,
  clearActiveSession,
  ensureDefaultAccountsSeeded,
  getShopPasswordAgeDays,
  changeShopOwnPassword,
  migrateLegacyLocalStorageKeys
} from './storage/auth.ts';
import { checkAndSendMonthlyAdminResetReminder } from './storage/adminEmailOtp.ts';
import { isShopSubscriptionActive } from './storage/subscription.ts';
import {
  startShopRealtimeSync,
  startAdminShopsRealtimeSync,
  syncAllShopDataFromCloud,
  CloudShopSyncSummary
} from './storage/firestoreSync.ts';
import { subscribeToAdminAuthConfig, updateAdminAuthConfig } from './storage/firebase.ts';
import {
  clearAiSessionMemory,
  isAiAccessAllowedForSession,
  loadAiSessionConfig
} from './storage/aiConfig.ts';
import { applyDynamicFavicon, uint8ArrayToBase64 } from './utils/icoConverter.ts';
import { Theme, getStoredTheme, applyTheme } from './storage/theme.ts';
import { RefreshCw, AlertCircle, Store, Shield, KeyRound, Eye, EyeOff, CheckCircle2, Lock } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [activeTab, setActiveTab] = useState<ActiveTab>('POS');
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(() => getActiveSession());
  const [showSplash, setShowSplash] = useState(true);
  const [loginModal, setLoginModal] = useState<{ isOpen: boolean; initialRole: UserRole }>({
    isOpen: false,
    initialRole: 'SHOP_USER'
  });

  // Modals state
  const [activeReceiptBill, setActiveReceiptBill] = useState<SaleBill | null>(null);
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  // Shop 90-day (3-month) Password Rotation Prompt Modal state
  const [dismissed90DayShopIds, setDismissed90DayShopIds] = useState<string[]>([]);
  const [show90DayChangeForm, setShow90DayChangeForm] = useState(false);
  const [rotationCurrentPwd, setRotationCurrentPwd] = useState('');
  const [rotationNewPwd, setRotationNewPwd] = useState('');
  const [rotationConfirmPwd, setRotationConfirmPwd] = useState('');
  const [showRotationPwd, setShowRotationPwd] = useState(false);
  const [rotationSaving, setRotationSaving] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotationSuccess, setRotationSuccess] = useState<string | null>(null);

  // Cloud Firestore Hydration & Manual Refresh State
  const [cloudSyncVersion, setCloudSyncVersion] = useState(0);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncToast, setCloudSyncToast] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadShops = async () => {
    try {
      setLoading(true);
      setInitError(null);
      await ensureDefaultAccountsSeeded();
      const list = await AppRepository.shops.getAll();
      setShops(list);
      
      if (list.length > 0) {
        // If current user is already logged in as a shop user, bind to their assigned shop
        const activeSess = getActiveSession();
        if (activeSess?.role === 'SHOP_USER' && (activeSess.shopCode || activeSess.shopId)) {
          let match: Shop | null | undefined = list.find((s) => (activeSess.shopId && s.id === activeSess.shopId) || (activeSess.shopCode && s.shopCode === activeSess.shopCode));
          if (!match && activeSess.shopId) {
            const fetched = await AppRepository.shops.getById(activeSess.shopId);
            if (fetched) {
              match = fetched;
              list.push(fetched);
              setShops([...list]);
            }
          }
          if (match) {
            setCurrentShop(match);
            return;
          }
        }

        setCurrentShop((prev) => {
          if (prev) {
            const found = list.find((s) => s.id === prev.id);
            if (found) return found;
          }
          return list[0];
        });
      }
    } catch (err: any) {
      console.error('Failed to initialize shops:', err);
      setInitError(err?.message || 'Failed to initialize local IndexedDB database.');
    } finally {
      setLoading(false);
    }
  };

  const refreshShopsSilently = useCallback(async () => {
    try {
      const list = await AppRepository.shops.getAll();
      if (list.length > 0) {
        setShops(list);
        setCurrentShop((prev) => {
          if (!prev) return list[0];
          const found = list.find((s) => s.id === prev.id);
          return found || prev;
        });
      }
    } catch {
      // ignore background refresh error
    }
  }, []);

  const handleManualCloudSync = useCallback(
    async (shopOverride?: Shop, opts?: { silent?: boolean }): Promise<CloudShopSyncSummary | null> => {
      const targetShop = shopOverride || currentShop;
      if (!targetShop?.id) return null;

      setIsCloudSyncing(true);
      try {
        migrateLegacyLocalStorageKeys();
        const summary = await syncAllShopDataFromCloud(targetShop, { forceReconnect: true });
        await refreshShopsSilently();
        setCloudSyncVersion((v) => v + 1);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('parlourpro-cloud-synced', { detail: summary }));
        }
        if (!opts?.silent) {
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          setCloudSyncToast(
            summary.authOk
              ? {
                  text: `Cloud Data Synced (જૂનો ડેટા રિફ્રેશ થઈ ગયો): ${summary.purchases} Purchases, ${summary.sales} Sales, ${summary.products} Products`,
                  type: 'success'
                }
              : {
                  text: 'Cloud Firestore unreachable right now. Showing local saved data.',
                  type: 'info'
                }
          );
          toastTimeoutRef.current = setTimeout(() => setCloudSyncToast(null), 5000);
        }
        return summary;
      } catch (err) {
        console.warn('[Cloud Sync] Manual refresh notice:', err);
        return null;
      } finally {
        setIsCloudSyncing(false);
      }
    },
    [currentShop, refreshShopsSilently]
  );

  useEffect(() => {
    migrateLegacyLocalStorageKeys();
    loadShops();
    // Non-blocking 1st-of-month automatic EmailJS reminder check (sent at most once per month)
    checkAndSendMonthlyAdminResetReminder().catch(() => {});
  }, []);

  // Sync theme with documentElement and localStorage
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync Cloud Brand Logo & Multi-Size Windows Desktop .ico from adminSettings/authConfig
  useEffect(() => {
    let seededOnce = false;
    const unsub = subscribeToAdminAuthConfig(async (cfg) => {
      if (cfg.desktopIconIcoBase64 || cfg.brandLogoPngBase64) {
        applyDynamicFavicon(cfg.desktopIconIcoBase64, cfg.brandLogoPngBase64);
        return;
      }
      if (seededOnce || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      seededOnce = true;
      try {
        const [icoRes, pngRes] = await Promise.all([
          fetch('./favicon.ico'),
          fetch('./icon-192.png')
        ]);
        if (!icoRes.ok || !pngRes.ok) return;
        const [icoBuf, pngBuf] = await Promise.all([icoRes.arrayBuffer(), pngRes.arrayBuffer()]);
        const icoDataUrl = `data:image/x-icon;base64,${uint8ArrayToBase64(new Uint8Array(icoBuf))}`;
        const pngDataUrl = `data:image/png;base64,${uint8ArrayToBase64(new Uint8Array(pngBuf))}`;
        await updateAdminAuthConfig({
          desktopIconIcoBase64: icoDataUrl,
          brandLogoPngBase64: pngDataUrl,
          desktopIconUpdatedAt: new Date().toISOString()
        });
      } catch {
        // Non-blocking: static ./favicon.ico & ./icon-192.png remain active
      }
    });
    return () => unsub();
  }, []);

  const handleToggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  // Sync user shop when user session changes
  const handleLoginSuccess = async (session: AuthSession) => {
    migrateLegacyLocalStorageKeys();
    setCurrentUser(session);
    if (session.role === 'ADMIN') {
      setActiveTab('ADMIN');
    } else {
      setActiveTab('POS');
      if (session.shopId || session.shopCode) {
        let boundShop: Shop | null | undefined = shops.find(s => (session.shopId && s.id === session.shopId) || (session.shopCode && s.shopCode === session.shopCode));
        if (!boundShop && session.shopId) {
          const fetched = await AppRepository.shops.getById(session.shopId);
          if (fetched) {
            boundShop = fetched;
          }
        }
        if (boundShop) {
          setCurrentShop(boundShop);
          setShops(prev => {
            if (prev.some(s => s.id === boundShop!.id)) return prev;
            return [...prev, boundShop!];
          });
          // Immediately pull historical bills, purchases, sales & stock from Cloud Firestore
          handleManualCloudSync(boundShop, { silent: true }).catch(() => {});
        }
      }
    }
  };

  const handleLogout = () => {
    clearAiSessionMemory();
    setIsAiDrawerOpen(false);
    setActiveTab('POS');
    setDismissed90DayShopIds([]);
    setShow90DayChangeForm(false);
    setRotationCurrentPwd('');
    setRotationNewPwd('');
    setRotationConfirmPwd('');
    setRotationError(null);
    setRotationSuccess(null);
    clearActiveSession();
    setCurrentUser(null);
  };

  const handleDismiss90DayPrompt = () => {
    if (currentShop?.id) {
      setDismissed90DayShopIds((prev) => (prev.includes(currentShop.id) ? prev : [...prev, currentShop.id]));
    }
    setShow90DayChangeForm(false);
    setRotationCurrentPwd('');
    setRotationNewPwd('');
    setRotationConfirmPwd('');
    setRotationError(null);
    setRotationSuccess(null);
  };

  const handleSubmit90DayShopPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop) return;
    setRotationError(null);
    setRotationSuccess(null);

    if (!rotationNewPwd || rotationNewPwd.length < 6) {
      setRotationError('નવો પાસવર્ડ ઓછામાં ઓછો ૬ અક્ષરનો હોવો જોઈએ.');
      return;
    }
    if (rotationNewPwd !== rotationConfirmPwd) {
      setRotationError('નવો પાસવર્ડ અને કન્ફર્મ પાસવર્ડ સરખા નથી.');
      return;
    }

    setRotationSaving(true);
    try {
      const updated = await changeShopOwnPassword({
        shop: currentShop,
        currentPassword: rotationCurrentPwd,
        newPassword: rotationNewPwd
      });
      setCurrentShop(updated);
      setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setRotationCurrentPwd('');
      setRotationNewPwd('');
      setRotationConfirmPwd('');
      setRotationSuccess('તમારો શોપ પાસવર્ડ સફળતાપૂર્વક બદલાઈ ગયો છે!');
      setTimeout(() => {
        setShow90DayChangeForm(false);
        setRotationSuccess(null);
      }, 1400);
    } catch (err: unknown) {
      setRotationError(err instanceof Error ? err.message : 'પાસવર્ડ બદલવામાં સમસ્યા આવી.');
    } finally {
      setRotationSaving(false);
    }
  };

  // Load AI Config strictly into module-level session RAM when logged in & AI is enabled for shop
  useEffect(() => {
    if (!isAiAccessAllowedForSession(currentUser, currentShop)) {
      clearAiSessionMemory();
      setIsAiDrawerOpen(false);
      if (activeTab === 'AMUL_AI') {
        setActiveTab('POS');
      }
      return;
    }
    loadAiSessionConfig(currentShop, currentUser).catch(() => {});
  }, [currentUser?.username, currentUser?.role, currentShop?.id, currentShop?.aiEnabled]);

  // Background automated scheduled daily backup runner (Checks while website is open)
  useEffect(() => {
    if (!currentShop) return;

    const checkAndRunAutoBackup = async () => {
      try {
        const check = await AppRepository.system.checkMissedBackups(currentShop.id);
        if (check.shouldBackupToday) {
          console.log(`[Auto-Backup] Taking scheduled daily backup for ${currentShop.shopCode}...`);
          await AppRepository.system.createBackup(currentShop.id, 'AUTO');
        }
      } catch (err) {
        console.error('Automated backup check failed:', err);
      }
    };

    // Run check immediately on load
    checkAndRunAutoBackup();

    // Check periodically every 60 seconds
    const interval = setInterval(checkAndRunAutoBackup, 60 * 1000);
    return () => clearInterval(interval);
  }, [currentShop?.id]);

  // Real-time Firestore sync for active shop data (bills, inventory, expenses, bank statements)
  useEffect(() => {
    if (!currentUser || !currentShop?.id) return;
    const unsubShop = startShopRealtimeSync(
      currentShop.id,
      () => {
        if (syncDebounceRef.current) {
          clearTimeout(syncDebounceRef.current);
        }
        syncDebounceRef.current = setTimeout(() => {
          refreshShopsSilently();
          setCloudSyncVersion((v) => v + 1);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('parlourpro-cloud-synced'));
          }
        }, 250);
      },
      currentShop
    );
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
      unsubShop.unsubscribeAll();
    };
  }, [currentUser?.username, currentShop?.id, refreshShopsSilently]);

  // Real-time Firestore sync for Admin HQ shops collection
  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') return;
    const unsubAdmin = startAdminShopsRealtimeSync((updatedShops) => {
      setShops(updatedShops);
      setCurrentShop((prev) => {
        if (!prev) return updatedShops[0] || null;
        const match = updatedShops.find((s) => s.id === prev.id);
        return match || prev;
      });
    });
    return () => unsubAdmin();
  }, [currentUser?.role]);

  const handleSaleComplete = (bill: SaleBill) => {
    setActiveReceiptBill(bill);
  };

  // 1. Initial Launch Animation Overlay
  if (showSplash) {
    return (
      <AmulLaunchAnimation onComplete={() => setShowSplash(false)} />
    );
  }

  // 2. Storage Error Screen
  if (initError && !currentShop) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-rose-200 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mb-1">
            Browser Storage Initialization Issue
          </h2>
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3 text-left font-mono">
            {initError}
          </p>
          <div className="text-[11px] text-slate-500 mb-4 text-left space-y-1">
            <p className="font-semibold text-slate-700">Supported Windows & Browser Environments:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Windows 11 / Windows 10: Chrome, Edge, or Firefox (Current).</li>
              <li>Windows 8.1 / Windows 7: Chrome 109+ or Firefox ESR 115+.</li>
              <li>Private/Incognito browsing with storage disabled must be turned off.</li>
            </ul>
          </div>
          <button
            onClick={loadShops}
            className="w-full bg-[#005A9C] hover:bg-blue-800 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Initialization
          </button>
        </div>
      </div>
    );
  }

  // 3. Database Loading State
  if (loading && !currentShop) {
    return <AmulStartupSplash />;
  }

  // 4. Authenticated Gate: If no user session, show Dual Login Page
  if (!currentUser) {
    return (
      <LoginPage
        shops={shops}
        initialRole={loginModal.initialRole}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // Check subscription expiry for shop counter (blocking when expired for non-admin sessions)
  const isShopUser = currentUser?.role !== 'ADMIN';
  const subCheck = currentShop ? isShopSubscriptionActive(currentShop) : null;
  const isShopPlanExpired = isShopUser && subCheck !== null && !subCheck.isActive;
  const shopPasswordAge = currentShop ? getShopPasswordAgeDays(currentShop) : null;
  const is90DayPasswordPromptVisible = Boolean(
    isShopUser &&
      currentShop &&
      !isShopPlanExpired &&
      shopPasswordAge?.isRotationDue &&
      !dismissed90DayShopIds.includes(currentShop.id)
  );

  return (
    <div className="min-h-screen bg-slate-100/90 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 selection:bg-blue-600 selection:text-white transition-colors duration-200 animate-fadeIn">
      {/* Professional Morning Greeting Modal (5:00 AM - 11:59 AM) */}
      <MorningGreetingModal />

      {/* Offline Detection & Automatic Cloud Sync Alert Banner */}
      <OfflineAlertBanner currentShop={currentShop} />

      {/* 10-Day Advance Subscription Renewal Reminder Banner */}
      <SubscriptionRenewalReminderBanner
        currentShop={currentShop}
        onRefreshShops={loadShops}
      />

      {/* 1. Amul Brand Header & Navigation with User Session & Logout */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        shops={shops}
        currentShop={currentShop}
        onSelectShop={setCurrentShop}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        onOpenAiDrawer={() => setIsAiDrawerOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenShopLogin={() => setLoginModal({ isOpen: true, initialRole: 'SHOP_USER' })}
        onOpenAdminLogin={() => setLoginModal({ isOpen: true, initialRole: 'ADMIN' })}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSyncCloudData={() => {
          handleManualCloudSync();
        }}
        isCloudSyncing={isCloudSyncing}
      />

      {cloudSyncToast && (
        <div
          className={`no-print px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b ${
            cloudSyncToast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{cloudSyncToast.text}</span>
        </div>
      )}

      {/* Missed Daily Backup Alert Banner (Only fires if an 8:00 PM snapshot was missed) */}
      <MissedBackupBanner
        currentShop={currentShop}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />

      {/* Main Workspace Container with Right-Side Functions Navigation Dock ("Jamni Baju List") */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto p-4 sm:p-6">
          {currentShop ? (
            isShopPlanExpired ? (
              <SubscriptionExpiredLockOverlay
                currentShop={currentShop}
                onLogout={handleLogout}
                onCheckStatus={loadShops}
              />
            ) : (
            <>
              {activeTab === 'POS' && (
                <BarcodePOS
                  currentShop={currentShop}
                  onSaleComplete={handleSaleComplete}
                  onOpenStockModal={() => setIsStockModalOpen(true)}
                />
              )}

              {activeTab === 'PURCHASES' && (
                <PurchaseManagement
                  key={`purchases-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                  onStockUpdated={loadShops}
                />
              )}

              {activeTab === 'SMART_ORDER' && (
                <SmartOrderManagement
                  key={`smart-order-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                  onOpenPurchases={() => setActiveTab('PURCHASES')}
                />
              )}

              {activeTab === 'AMUL_AI' && isAiAccessAllowedForSession(currentUser, currentShop) && (
                <AmulAiAssistant
                  currentShop={currentShop}
                  currentUser={currentUser}
                  mode="page"
                  onShopUpdated={(updated) => {
                    setCurrentShop(updated);
                    setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                  }}
                />
              )}

              {activeTab === 'STOCK' && (
                <DailyStockReport
                  key={`stock-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                />
              )}

              {activeTab === 'SALES' && (
                <DailySalesReport
                  key={`sales-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                  onReprintBill={(bill) => setActiveReceiptBill(bill)}
                />
              )}

              {activeTab === 'REPORTS' && (
                <ReportsHub
                  key={`reports-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                />
              )}

              {activeTab === 'EXPENSES' && (
                <ExpenseManagement
                  key={`expenses-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                />
              )}

              {activeTab === 'BANK' && (
                <BankStatementManagement
                  key={`bank-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                  onOpenProfileTab={() => setActiveTab('PROFILE')}
                />
              )}

              {activeTab === 'PROFILE' && (
                <ShopProfileManagement
                  key={`profile-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                  onShopUpdated={(updated) => {
                    setCurrentShop(updated);
                    setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                  }}
                />
              )}

              {activeTab === 'CATALOG' && (
                <CatalogManagement
                  key={`catalog-${currentShop.id}-${cloudSyncVersion}`}
                  currentShop={currentShop}
                />
              )}

              {activeTab === 'BACKUP' && (
                <BackupManagementView
                  currentShop={currentShop}
                  onDataReload={loadShops}
                  onSyncCloudData={() => handleManualCloudSync()}
                  isCloudSyncing={isCloudSyncing}
                />
              )}

              {activeTab === 'ADMIN' && (
                <AdminPortal
                  onSelectShop={(s) => {
                    setCurrentShop(s);
                    setActiveTab('POS');
                  }}
                  activeShopId={currentShop.id}
                  currentUser={currentUser}
                  onShopsUpdated={loadShops}
                  onLogout={handleLogout}
                  onOpenTests={() => setIsTestModalOpen(true)}
                />
              )}
            </>
            )
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center max-w-md mx-auto shadow-sm border border-slate-200">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-900 text-sm mb-1">No Shops Available</h3>
              <p className="text-xs text-slate-500 mb-4">
                Create a shop in the Admin Portal to start barcode billing and inventory tracking.
              </p>
              <button
                onClick={() => setActiveTab('ADMIN')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Open Admin Portal
              </button>
            </div>
          )}
        </main>

        {/* Right-Side Functions Navigation Dock ("Jamni Baju List") */}
        <RightSideNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentShop={currentShop}
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenTests={() => setIsTestModalOpen(true)}
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onLogout={handleLogout}
          onOpenShopLogin={() => setLoginModal({ isOpen: true, initialRole: 'SHOP_USER' })}
          onOpenAdminLogin={() => setLoginModal({ isOpen: true, initialRole: 'ADMIN' })}
        />
      </div>

      {/* 5. Thermal Receipt Modal (58mm / 80mm with browser print) */}
      {activeReceiptBill && currentShop && (
        <ThermalReceipt
          bill={activeReceiptBill}
          shop={currentShop}
          paperWidth={paperWidth}
          onPaperWidthChange={setPaperWidth}
          onClose={() => setActiveReceiptBill(null)}
        />
      )}

      {/* 6. Stock In / Stock Out Rapid Inventory Modal */}
      {isStockModalOpen && currentShop && (
        <StockMovementModal
          currentShop={currentShop}
          onClose={() => setIsStockModalOpen(false)}
          onSuccess={loadShops}
        />
      )}

      {/* 7. Backup & Restore Modal */}
      {isBackupModalOpen && (
        <BackupRestoreModal
          currentShop={currentShop}
          onClose={() => setIsBackupModalOpen(false)}
          onDataReload={loadShops}
        />
      )}

      {/* 8. Interactive Automated Test Suite Modal */}
      {isTestModalOpen && (
        <TestSuiteModal onClose={() => setIsTestModalOpen(false)} />
      )}

      {/* 9. Shop Login & Admin Login Modal Overlay */}
      {loginModal.isOpen && (
        <LoginPage
          shops={shops}
          isModal={true}
          initialRole={loginModal.initialRole}
          onLoginSuccess={(session) => {
            handleLoginSuccess(session);
            setLoginModal({ isOpen: false, initialRole: 'SHOP_USER' });
          }}
          onClose={() => setLoginModal(prev => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* 10. Quick Amul AI Slide-Over Drawer (Non-blocking over POS or any screen) */}
      {isAiDrawerOpen && currentShop && isAiAccessAllowedForSession(currentUser, currentShop) && (
        <AmulAiAssistant
          currentShop={currentShop}
          currentUser={currentUser}
          mode="drawer"
          onClose={() => setIsAiDrawerOpen(false)}
          onShopUpdated={(updated) => {
            setCurrentShop(updated);
            setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          }}
        />
      )}
      {/* 11. Friendly Post-Login 3-Month (90-Day) Shop Password Reset Option Modal (Non-blocking) */}
      {is90DayPasswordPromptVisible && currentShop && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#005A9C] text-white p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">દુકાન પાસવર્ડ સુરક્ષા સૂચના (90-Day Security Notice)</h3>
                <p className="text-[11px] text-blue-100">
                  {currentShop.name} • {shopPasswordAge?.daysSinceUpdate || 90} દિવસથી પાસવર્ડ બદલાયો નથી
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                સુરક્ષા સૂચના: તમારા શોપ પાસવર્ડને ૩ મહિના પૂરા થયા છે. તમારી દુકાનના ડેટાની સુરક્ષા માટે નવો પાસવર્ડ સેટ કરો.
              </div>

              {rotationError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{rotationError}</span>
                </div>
              )}

              {rotationSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{rotationSuccess}</span>
                </div>
              )}

              {show90DayChangeForm ? (
                <form onSubmit={handleSubmit90DayShopPasswordChange} className="space-y-3" autoComplete="off">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      હાલનો પાસવર્ડ (Current Password)
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showRotationPwd ? 'text' : 'password'}
                        value={rotationCurrentPwd}
                        onChange={(e) => setRotationCurrentPwd(e.target.value)}
                        placeholder="Enter current shop password"
                        autoComplete="current-password"
                        className="w-full pl-8 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRotationPwd((v) => !v)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showRotationPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      નવો પાસવર્ડ (New Password, min 6)
                    </label>
                    <input
                      type={showRotationPwd ? 'text' : 'password'}
                      value={rotationNewPwd}
                      onChange={(e) => setRotationNewPwd(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      minLength={6}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      નવો પાસવર્ડ કન્ફર્મ કરો (Confirm Password)
                    </label>
                    <input
                      type={showRotationPwd ? 'text' : 'password'}
                      value={rotationConfirmPwd}
                      onChange={(e) => setRotationConfirmPwd(e.target.value)}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      minLength={6}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={rotationSaving}
                      className="flex-1 py-2.5 px-4 bg-[#005A9C] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {rotationSaving ? 'સેવ થાય છે...' : 'Save New Shop Password'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDismiss90DayPrompt}
                      className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      ચાલુ રાખો
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShow90DayChangeForm(true)}
                    className="flex-1 py-2.5 px-4 bg-[#005A9C] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Change Shop Password Now
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss90DayPrompt}
                    className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Remind Me Later / ચાલુ રાખો
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
