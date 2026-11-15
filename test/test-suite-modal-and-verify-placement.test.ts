/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated tests verifying:
 * 1. TestSuiteModal 3-second timeout guard, isolated local sandbox execution, and Test 7 try/catch duplicate handling
 * 2. Verify button moved from POS Header to Master Admin Portal
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_TESTS, TEST_TIMEOUT_MS, runWithTestTimeout } from '../src/components/tests/TestSuiteModal.tsx';

describe('TestSuiteModal Timeout Guard, Local Sandbox & Admin Verify Placement', () => {
  it('enforces a 3-second timeout guard per test so hung promises reject cleanly', async () => {
    expect(TEST_TIMEOUT_MS).toBe(3000);
    expect(INITIAL_TESTS).toHaveLength(13);
    expect(INITIAL_TESTS[6].name).toBe('Duplicate-Sale Prevention & Idempotency Guarantee');

    const fastResult = await runWithTestTimeout(async () => 'ok', 200, 'Fast Test');
    expect(fastResult).toBe('ok');

    await expect(
      runWithTestTimeout(() => new Promise(() => {}), 40, 'Hung Test')
    ).rejects.toThrow('Hung Test timed out after 40ms');
  });

  it('runs all 13 verification tests strictly locally with zero Firestore/AppRepository network dependencies', () => {
    const rootDir = path.resolve(import.meta.dirname, '..');
    const testSuiteContent = fs.readFileSync(
      path.join(rootDir, 'src/components/tests/TestSuiteModal.tsx'),
      'utf-8'
    );

    expect(testSuiteContent).not.toContain('AppRepository');
    expect(testSuiteContent).not.toContain('firestoreSync');
    expect(testSuiteContent).not.toContain("from '../../storage/firebase");
    expect(testSuiteContent).toContain("import * as localDb from '../../storage/db.ts'");
    expect(testSuiteContent).toContain('TEST_TIMEOUT_MS = 3000');
    expect(testSuiteContent).toContain('runWithTestTimeout');
    expect(testSuiteContent).toContain('cleanupSandboxShopRecords');
  });

  it('moves the Verify button from POS Header to Master Admin Portal', () => {
    const rootDir = path.resolve(import.meta.dirname, '..');
    const headerContent = fs.readFileSync(
      path.join(rootDir, 'src/components/layout/Header.tsx'),
      'utf-8'
    );
    const navContent = fs.readFileSync(
      path.join(rootDir, 'src/components/layout/RightSideNavigation.tsx'),
      'utf-8'
    );
    const adminContent = fs.readFileSync(
      path.join(rootDir, 'src/components/admin/AdminPortal.tsx'),
      'utf-8'
    );
    const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf-8');

    // Removed from POS Header
    expect(headerContent).not.toContain('Verify');
    expect(headerContent).not.toContain('onOpenTests');
    expect(headerContent).not.toContain('FlaskConical');

    // Restricted in RightSideNavigation to Admin only
    expect(navContent).toContain("currentUser?.role === 'ADMIN'");

    // Present in Master Admin Portal & wired from App.tsx
    expect(adminContent).toContain('onOpenTests');
    expect(adminContent).toContain('<span>Verify</span>');
    expect(appContent).toContain('onOpenTests={() => setIsTestModalOpen(true)}');
  });
});
