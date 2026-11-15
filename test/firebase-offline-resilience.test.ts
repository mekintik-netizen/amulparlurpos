/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for Firebase offline resilience, pre-flight reachability probe, and timeout guards
 * so offline/proxy environments never emit 10s backend timeout console errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const disableNetworkMock = vi.fn(async (_db?: unknown) => {});
const enableNetworkMock = vi.fn(async (_db?: unknown) => {});
const setLogLevelMock = vi.fn((_level?: unknown) => {});
const getDocFromServerMock = vi.fn(async (_ref?: unknown) => {});

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'mock-app' })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: 'mock-app' }))
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'anon-1' } })),
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb({ uid: 'anon-1' });
    return () => {};
  }),
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'anon-1' } }))
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    initializeFirestore: vi.fn(() => ({ __mockDb: true })),
    getFirestore: vi.fn(() => ({ __mockDb: true })),
    enableNetwork: (dbArg: unknown) => enableNetworkMock(dbArg),
    disableNetwork: (dbArg: unknown) => disableNetworkMock(dbArg),
    setLogLevel: (levelArg: unknown) => setLogLevelMock(levelArg),
    getDocFromServer: (refArg: unknown) => getDocFromServerMock(refArg),
    doc: vi.fn((_db, col, id) => ({ col, id })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => {})
  };
});

describe('Firebase Offline Resilience & 10s Timeout Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configures auto-detect long polling, suppresses noisy SDK offline errors, and probes reachability safely', async () => {
    const firebaseSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/storage/firebase.ts'),
      'utf8'
    );
    expect(firebaseSrc).toContain('experimentalAutoDetectLongPolling: true');
    expect(firebaseSrc).toContain("setLogLevel('silent')");
    expect(firebaseSrc).toContain('probeFirestoreReachability');
    expect(firebaseSrc).toContain('connectionCheck');
  });

  it('disables Firestore network cleanly when reachability probe fails without throwing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as any;

    try {
      const { probeFirestoreReachability, validateFirestoreConnection } = await import('../src/storage/firebase.ts');
      const reachable = await probeFirestoreReachability(200);
      expect(reachable).toBe(false);

      const connected = await validateFirestoreConnection();
      expect(connected).toBe(false);
      expect(disableNetworkMock).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('gates startShopRealtimeSync in App.tsx until a user session is authenticated', () => {
    const appSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/App.tsx'),
      'utf8'
    );
    expect(appSrc).toContain('if (!currentUser || !currentShop?.id) return;');
  });
});
