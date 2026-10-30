/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Amul Parlour Local-First Cryptographic Auth & Zero Plaintext Storage
 */

import { describe, it, expect } from 'vitest';
import { generateSalt, hashPasswordWithSalt } from '../src/storage/auth.ts';

describe('Local-First Cryptographic Authentication & Security', () => {
  it('generates a 16-byte cryptographically random hex salt (32 hex characters)', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).toHaveLength(32);
    expect(salt2).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/i.test(salt1)).toBe(true);
    expect(salt1).not.toBe(salt2); // Salts must be unique
  });

  it('produces a deterministic SHA-256 hash given the same password and salt', async () => {
    const password = 'SecretPassword123!';
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

    const hash1 = await hashPasswordWithSalt(password, salt);
    const hash2 = await hashPasswordWithSalt(password, salt);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces a 64-char hex string
    expect(/^[0-9a-f]{64}$/i.test(hash1)).toBe(true);
    expect(hash1).not.toContain(password); // Zero plaintext in hash
  });

  it('produces drastically different hashes for different salts (salt avalanche effect)', async () => {
    const password = 'AmulFreshMilk1L';
    const saltA = '00000000000000000000000000000001';
    const saltB = '00000000000000000000000000000002';

    const hashA = await hashPasswordWithSalt(password, saltA);
    const hashB = await hashPasswordWithSalt(password, saltB);

    expect(hashA).not.toBe(hashB);
  });

  it('produces drastically different hashes for wrong passwords with identical salt', async () => {
    const salt = generateSalt();
    const correctHash = await hashPasswordWithSalt('amul123', salt);
    const wrongHash = await hashPasswordWithSalt('amul124', salt);

    expect(correctHash).not.toBe(wrongHash);
  });

  it('guarantees plaintext password never matches the stored representation', async () => {
    const plain = 'CashierSecurePass99';
    const salt = generateSalt();
    const hash = await hashPasswordWithSalt(plain, salt);

    expect(hash).not.toBe(plain);
    expect(hash.includes(plain)).toBe(false);
    expect(salt.includes(plain)).toBe(false);
  });
});
