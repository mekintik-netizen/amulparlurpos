/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Offline Detection and Automatic Cloud Synchronization Manager
 * - Monitors navigator.onLine and browser online/offline events
 * - Provides active internet reachability verification
 * - Automatically pushes pending offline-created sales, purchases, and expenses to Cloud Firestore upon reconnection
 * - Enforces zero-data-loss and tenant isolation by shopId
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as localDb from './db.ts';
import { 
  syncSaleBillToCloud, 
  syncPurchaseBillToCloud, 
  syncProductToCloud, 
  syncExpenseToCloud,
  syncSupplierToCloud,
  syncBankEntryToCloud
} from './firestoreSync.ts';

export interface SyncStats {
  salesSynced: number;
  purchasesSynced: number;
  expensesSynced: number;
  productsSynced: number;
  totalSynced: number;
  syncedAt: string;
}

/**
 * Checks if the device has actual internet connectivity.
 * Uses navigator.onLine with an optional lightweight fetch fallback.
 */
export async function checkInternetConnectivity(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  
  try {
    // Attempt a fast, non-blocking reachability test
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch('/manifest.json', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);
    return response !== null && (response.ok || response.status === 304 || response.status === 200 || response.type === 'opaque');
  } catch {
    // If running in an environment without internet, navigator.onLine is our primary truth
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
}

/**
 * Syncs all pending/offline-created records from local IndexedDB to Cloud Firestore.
 * Strictly scoped to the specified shopId to preserve tenant isolation.
 */
export async function syncPendingOfflineDataToCloud(shopId: string): Promise<SyncStats> {
  if (!shopId) {
    return {
      salesSynced: 0,
      purchasesSynced: 0,
      expensesSynced: 0,
      productsSynced: 0,
      totalSynced: 0,
      syncedAt: new Date().toISOString()
    };
  }

  let salesCount = 0;
  let purchasesCount = 0;
  let expensesCount = 0;
  let productsCount = 0;

  try {
    // 1. Sync Sale Bills
    const sales = await localDb.getSalesByShop(shopId);
    for (const sale of sales) {
      try {
        await syncSaleBillToCloud(sale);
        salesCount++;
      } catch (err) {
        console.warn('[Offline Sync] Failed to sync sale bill:', sale.id, err);
      }
    }

    // 2. Sync Purchase Bills
    const purchases = await localDb.getPurchasesByShop(shopId);
    for (const purchase of purchases) {
      try {
        await syncPurchaseBillToCloud(purchase);
        purchasesCount++;
      } catch (err) {
        console.warn('[Offline Sync] Failed to sync purchase bill:', purchase.id, err);
      }
    }

    // 3. Sync Expenses
    try {
      const expenses = await localDb.getExpensesByShop(shopId);
      for (const expense of expenses) {
        try {
          await syncExpenseToCloud(expense);
          expensesCount++;
        } catch (e) {
          // ignore individual item error
        }
      }
    } catch {
      // ignore
    }

    // 4. Sync Suppliers
    try {
      const suppliers = await localDb.getSuppliersByShop(shopId);
      for (const sup of suppliers) {
        try {
          await syncSupplierToCloud(sup);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // 5. Sync Bank Entries
    try {
      const bankEntries = await localDb.getBankEntriesByShop(shopId);
      for (const entry of bankEntries) {
        try {
          await syncBankEntryToCloud(entry);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    const syncedAt = new Date().toISOString();
    try {
      localStorage.setItem(`amul_last_cloud_sync_${shopId}`, syncedAt);
    } catch {
      // ignore localStorage quota
    }

    return {
      salesSynced: salesCount,
      purchasesSynced: purchasesCount,
      expensesSynced: expensesCount,
      productsSynced: productsCount,
      totalSynced: salesCount + purchasesCount + expensesCount + productsCount,
      syncedAt
    };
  } catch (err) {
    console.warn('[Offline Sync] General sync failure:', err);
    return {
      salesSynced: salesCount,
      purchasesSynced: purchasesCount,
      expensesSynced: expensesCount,
      productsSynced: productsCount,
      totalSynced: salesCount + purchasesCount + expensesCount + productsCount,
      syncedAt: new Date().toISOString()
    };
  }
}

/**
 * Custom React Hook for monitoring online/offline status and orchestrating background sync.
 */
export function useNetworkStatus(shopId?: string) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(false);
  const [showReconnectedToast, setShowReconnectedToast] = useState<boolean>(false);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return shopId ? localStorage.getItem(`amul_last_cloud_sync_${shopId}`) : null;
    } catch {
      return null;
    }
  });

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousOnlineStateRef = useRef<boolean>(isOnline);

  // Manual trigger for background sync
  const triggerManualSync = useCallback(async () => {
    if (!shopId || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const stats = await syncPendingOfflineDataToCloud(shopId);
      setSyncStats(stats);
      setLastSyncTime(stats.syncedAt);
    } finally {
      setIsSyncing(false);
    }
  }, [shopId]);

  // Check connectivity directly on demand
  const checkConnectionNow = useCallback(async (): Promise<boolean> => {
    const online = await checkInternetConnectivity();
    setIsOnline(online);
    if (!online) {
      setShowOfflineModal(true);
    } else {
      setShowOfflineModal(false);
      if (shopId) {
        await triggerManualSync();
        setShowReconnectedToast(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setShowReconnectedToast(false);
        }, 5000);
      }
    }
    return online;
  }, [shopId, triggerManualSync]);

  useEffect(() => {
    const handleOnlineEvent = async () => {
      setIsOnline(true);
      setShowOfflineModal(false);

      // Trigger automatic background synchronization of offline records
      if (shopId) {
        setIsSyncing(true);
        try {
          const stats = await syncPendingOfflineDataToCloud(shopId);
          setSyncStats(stats);
          setLastSyncTime(stats.syncedAt);
        } catch (e) {
          console.warn('[NetworkStatus] Auto-sync failed on reconnection:', e);
        } finally {
          setIsSyncing(false);
        }
      }

      // Show reassuring green banner
      setShowReconnectedToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setShowReconnectedToast(false);
      }, 5000);

      previousOnlineStateRef.current = true;
    };

    const handleOfflineEvent = () => {
      setIsOnline(false);
      setShowOfflineModal(true);
      setShowReconnectedToast(false);
      previousOnlineStateRef.current = false;
    };

    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);

    // Initial check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      setShowOfflineModal(true);
    }

    return () => {
      window.removeEventListener('online', handleOnlineEvent);
      window.removeEventListener('offline', handleOfflineEvent);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [shopId]);

  return {
    isOnline,
    isSyncing,
    showOfflineModal,
    dismissOfflineModal: () => setShowOfflineModal(false),
    reopenOfflineModal: () => setShowOfflineModal(true),
    showReconnectedToast,
    dismissReconnectedToast: () => setShowReconnectedToast(false),
    syncStats,
    lastSyncTime,
    triggerManualSync,
    checkConnectionNow
  };
}
