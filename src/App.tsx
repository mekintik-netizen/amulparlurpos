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

import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/layout/Header.tsx';
import { LocalModeNotice } from './components/common/LocalModeNotice.tsx';
import { MissedBackupBanner } from './components/common/MissedBackupBanner.tsx';
import { AmulLaunchAnimation } from './components/common/AmulLaunchAnimation.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { BarcodePOS } from './components/pos/BarcodePOS.tsx';
import { PurchaseManagement } from './components/purchases/PurchaseManagement.tsx';
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
import { RightSideNavigation } from './components/layout/RightSideNavigation.tsx';
import { MorningGreetingModal } from './components/common/MorningGreetingModal.tsx';
import { SubscriptionExpiredLockOverlay } from './components/common/SubscriptionExpiredLockOverlay.tsx';
import { Shop, SaleBill } from './types/index.ts';
import { AppRepository } from './storage/repositories.ts';
import { AuthSession, UserRole, getActiveSession, clearActiveSession, ensureDefaultAccountsSeeded } from './storage/auth.ts';
import { isShopSubscriptionActive } from './storage/subscription.ts';
import { startShopRealtimeSync, startAdminShopsRealtimeSync } from './storage/firestoreSync.ts';
import { Theme, getStoredTheme, applyTheme } from './storage/theme.ts';
import { RefreshCw, AlertCircle, Store, Shield } from 'lucide-react';

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

  useEffect(() => {
    loadShops();
  }, []);

  // Sync theme with documentElement and localStorage
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  // Sync user shop when user session changes
  const handleLoginSuccess = async (session: AuthSession) => {
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
        }
      }
    }
  };

  const handleLogout = () => {
    clearActiveSession();
    setCurrentUser(null);
  };

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
    if (!currentShop?.id) return;
    const unsubShop = startShopRealtimeSync(currentShop.id, () => {
      loadShops();
    });
    return () => unsubShop.unsubscribeAll();
  }, [currentShop?.id]);

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
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full">
          <div className="w-12 h-12 bg-blue-100 text-[#005A9C] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mb-1">
            Opening Amul Parlour POS...
          </h2>
          <p className="text-xs text-slate-500">
            Initializing application and authentic product catalog.
          </p>
        </div>
      </div>
    );
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

  // Check subscription expiry for cashiers
  const isCashier = currentUser?.role === 'SHOP_USER';
  const subCheck = currentShop ? isShopSubscriptionActive(currentShop) : null;
  const isShopPlanExpired = isCashier && subCheck !== null && !subCheck.isActive;

  return (
    <div className="min-h-screen bg-slate-100/90 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Professional Morning Greeting Modal (5:00 AM - 11:59 AM) */}
      <MorningGreetingModal />

      {/* 1. Amul Brand Header & Navigation with User Session & Logout */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        shops={shops}
        currentShop={currentShop}
        onSelectShop={setCurrentShop}
        onOpenTests={() => setIsTestModalOpen(true)}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenShopLogin={() => setLoginModal({ isOpen: true, initialRole: 'SHOP_USER' })}
        onOpenAdminLogin={() => setLoginModal({ isOpen: true, initialRole: 'ADMIN' })}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

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
                  currentShop={currentShop}
                  onStockUpdated={loadShops}
                />
              )}

              {activeTab === 'STOCK' && (
                <DailyStockReport currentShop={currentShop} />
              )}

              {activeTab === 'SALES' && (
                <DailySalesReport
                  currentShop={currentShop}
                  onReprintBill={(bill) => setActiveReceiptBill(bill)}
                />
              )}

              {activeTab === 'REPORTS' && (
                <ReportsHub currentShop={currentShop} />
              )}

              {activeTab === 'EXPENSES' && (
                <ExpenseManagement currentShop={currentShop} />
              )}

              {activeTab === 'BANK' && (
                <BankStatementManagement
                  currentShop={currentShop}
                  onOpenProfileTab={() => setActiveTab('PROFILE')}
                />
              )}

              {activeTab === 'PROFILE' && (
                <ShopProfileManagement
                  currentShop={currentShop}
                  onShopUpdated={(updated) => {
                    setCurrentShop(updated);
                    setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                  }}
                />
              )}

              {activeTab === 'CATALOG' && (
                <CatalogManagement currentShop={currentShop} />
              )}

              {activeTab === 'BACKUP' && (
                <BackupManagementView
                  currentShop={currentShop}
                  onDataReload={loadShops}
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
    </div>
  );
}
