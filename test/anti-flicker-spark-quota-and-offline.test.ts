/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test suite verifying:
 * 1. Anti-flicker guarantees (no cloudSyncVersion component remount keys, primitive shopId useEffect deps,
 *    hasLoadedFromCloud tracking, ignoring cache-only empty snapshots, silent background refreshes)
 * 2. Firebase Spark Free Plan optimizations for 50+ active shops (persistentLocalCache, strict shopId scoping,
 *    orderBy + limit(100) history queries + "Load Older Records" pagination, atomic writeBatch for multi-item purchases & sales)
 * 3. Clean Offline / Network status handling (non-intrusive yellow Gujarati offline banner, silent remote config fallback)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_HISTORY_QUERY_LIMIT,
  hasShopLoadedFromCloud,
  markShopCollectionLoadedFromCloud,
  isEmptyCacheOnlySnapshot
} from '../src/storage/firestoreSync.ts';
import {
  setCloudSyncStatus,
  getCloudSyncStatus,
  hasInitialCloudSyncCompleted,
  isTransientNetworkError
} from '../src/storage/firebase.ts';

const readFile = (relPath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

describe('1. Permanent Anti-Flicker & Stable Real-Time Sync', () => {
  it('removes cloudSyncVersion from all active tab React keys in App.tsx so snapshots never unmount screens', () => {
    const appSrc = readFile('src/App.tsx');
    expect(appSrc).not.toMatch(/key=\{`[a-z-]+-\$\{currentShop\.id\}-\$\{cloudSyncVersion\}`\}/);
    expect(appSrc).toContain('key={`purchases-${currentShop.id}`}');
    expect(appSrc).toContain('key={`sales-${currentShop.id}`}');
    expect(appSrc).toContain('key={`catalog-${currentShop.id}`}');
    expect(appSrc).toContain('key={`stock-${currentShop.id}`}');
    expect(appSrc).toContain('key={`expenses-${currentShop.id}`}');
    expect(appSrc).toContain('key={`bank-${currentShop.id}`}');
    // Primitive dependency guard on realtime sync effect
    expect(appSrc).toContain('const activeShopId = currentShop?.id || \'\';');
    expect(appSrc).toContain('[activeUsername, activeShopId, refreshShopsSilently]');
  });

  it('tracks hasLoadedFromCloud per shop/collection and ignores cache-only empty Firestore snapshots', () => {
    const testShopId = `shop-guard-test-${Date.now()}`;
    expect(hasShopLoadedFromCloud(testShopId, 'products')).toBe(false);
    markShopCollectionLoadedFromCloud(testShopId, 'products');
    expect(hasShopLoadedFromCloud(testShopId, 'products')).toBe(true);
    expect(hasShopLoadedFromCloud(testShopId, 'sales')).toBe(false);

    // Cache-only empty snapshot MUST be ignored
    expect(isEmptyCacheOnlySnapshot({ empty: true, metadata: { fromCache: true } })).toBe(true);
    // Server empty snapshot MUST NOT be ignored
    expect(isEmptyCacheOnlySnapshot({ empty: true, metadata: { fromCache: false } })).toBe(false);
    // Non-empty cache snapshot MUST NOT be ignored
    expect(isEmptyCacheOnlySnapshot({ empty: false, metadata: { fromCache: true } })).toBe(false);

    const syncSrc = readFile('src/storage/firestoreSync.ts');
    expect(syncSrc).toContain('if (isEmptyCacheOnlySnapshot(snapshot)) return;');
  });

  it('keeps Syncing to Cloud indicator hidden on routine background updates after initial load completes', () => {
    setCloudSyncStatus('synced', '2026-11-22T01:00:00.000Z');
    expect(hasInitialCloudSyncCompleted()).toBe(true);

    // Routine background syncing call without force must NOT revert status back to syncing
    setCloudSyncStatus('syncing');
    expect(getCloudSyncStatus().status).toBe('synced');

    // Explicit forced manual sync still works
    setCloudSyncStatus('syncing', undefined, { force: true });
    expect(getCloudSyncStatus().status).toBe('syncing');

    // Restore synced state
    setCloudSyncStatus('synced', '2026-11-22T01:01:00.000Z');
    expect(getCloudSyncStatus().status).toBe('synced');
  });

  it('prevents background sync callbacks from flashing loading spinners in POS, Purchases, Catalog, Sales & Stock', () => {
    const components = [
      'src/components/pos/BarcodePOS.tsx',
      'src/components/purchases/PurchaseManagement.tsx',
      'src/components/purchases/SmartOrderManagement.tsx',
      'src/components/catalog/CatalogManagement.tsx',
      'src/components/reports/DailySalesReport.tsx',
      'src/components/reports/DailyStockReport.tsx',
      'src/components/reports/ReportsHub.tsx',
      'src/components/expenses/ExpenseManagement.tsx',
      'src/components/banking/BankStatementManagement.tsx'
    ];
    for (const file of components) {
      const src = readFile(file);
      expect(src, `${file} should track hasLoadedOnceRef`).toContain('hasLoadedOnceRef');
      expect(src, `${file} should refresh silently on parlourpro-cloud-synced`).toContain('parlourpro-cloud-synced');
    }
  });
});

describe('2. Firebase Spark Free Plan Optimizations (50+ Active Shops)', () => {
  it('enables Firestore IndexedDB offline persistence via persistentLocalCache', () => {
    const firebaseSrc = readFile('src/storage/firebase.ts');
    expect(firebaseSrc).toContain('persistentLocalCache');
    expect(firebaseSrc).toContain('persistentMultipleTabManager');
    expect(firebaseSrc).toContain('localCache,');
  });

  it('caps default sales & purchases history queries at 100 docs with Load Older Records pagination', () => {
    expect(DEFAULT_HISTORY_QUERY_LIMIT).toBe(100);
    const syncSrc = readFile('src/storage/firestoreSync.ts');
    expect(syncSrc).toContain('orderBy(\'date\', \'desc\'), limit(DEFAULT_HISTORY_QUERY_LIMIT)');
    expect(syncSrc).toContain('orderBy(\'purchaseDate\', \'desc\'), limit(DEFAULT_HISTORY_QUERY_LIMIT)');
    expect(syncSrc).toContain('fetchSalesFromCloud');

    const repoSrc = readFile('src/storage/repositories.ts');
    expect(repoSrc).toContain('loadOlderFromCloud');

    const purchaseUi = readFile('src/components/purchases/PurchaseManagement.tsx');
    expect(purchaseUi).toContain('Load Older Records');

    const salesUi = readFile('src/components/reports/DailySalesReport.tsx');
    expect(salesUi).toContain('Load Older Records');
  });

  it('uses atomic writeBatch for both multi-item POS Sales and multi-item Purchase entries', () => {
    const syncSrc = readFile('src/storage/firestoreSync.ts');
    expect(syncSrc).toContain('export async function syncSaleBillAtomicallyToCloud');
    expect(syncSrc).toContain('export async function syncPurchaseBillAtomicallyToCloud');
    expect(syncSrc).toContain('const batch = writeBatch(db);');

    const repoSrc = readFile('src/storage/repositories.ts');
    expect(repoSrc).toContain('syncSaleBillAtomicallyToCloud');
    expect(repoSrc).toContain('syncPurchaseBillAtomicallyToCloud');
  });
});

describe('3. Clean Offline Banner & Silent Remote Config Error Handling', () => {
  it('displays the non-intrusive yellow Gujarati offline banner with .no-print class', () => {
    const bannerSrc = readFile('src/components/common/OfflineAlertBanner.tsx');
    expect(bannerSrc).toContain('no-print');
    expect(bannerSrc).toContain('⚠️ ઇન્ટરનેટ કનેક્શન બંધ છે — Offline Mode ચાલુ છે');
    expect(bannerSrc).toContain('bg-amber-300');
  });

  it('detects transient network drop errors and keeps AdminEmailConfig silent on network failures', () => {
    expect(isTransientNetworkError(new Error('net::ERR_NETWORK_CHANGED'))).toBe(true);
    expect(isTransientNetworkError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(true);
    expect(isTransientNetworkError({ code: 'unavailable', message: 'client is offline' })).toBe(true);
    expect(isTransientNetworkError(new Error('Validation error'))).toBe(false);

    const adminOtpSrc = readFile('src/storage/adminEmailOtp.ts');
    expect(adminOtpSrc).not.toContain("console.warn('[AdminEmailConfig] Could not load remote emailConfig')");
    expect(adminOtpSrc).not.toContain("console.warn('[AdminSecurity] Could not load remote security config, using defaults')");
    expect(adminOtpSrc).toContain('cachedAdminEmailConfig');
    expect(adminOtpSrc).toContain('cachedAdminSecurityConfig');
  });
});
